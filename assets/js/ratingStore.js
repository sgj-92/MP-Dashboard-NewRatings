// ===================== v3 PERSISTENCE (matches, journey, player state) =====================
// Storage layout for the beta project:
//
//   matches/{matchId}         one doc per match, id = the export's Match ID
//   ratingJourney/{eventId}   one doc per Rating Journey event
//   players/{playerId}        current state snapshot, rebuildable from the journey
//
// The legacy small config blobs (visibility, tags, game requests) stay in the
// `moneypadel` collection untouched. The journey gets its own collection
// because it is append-heavy: 144 matches is already 576 events and grows about
// 120 a month, which would run a single blob doc into Firestore's 1MB limit.
//
// Document ids are DETERMINISTIC so that re-running a backfill overwrites the
// same documents rather than duplicating them. Seeding twice is a no-op.

(function (root, factory) {
  const api = factory(typeof require === 'function' ? require('./ratingEngine.js') : root.RatingEngine);
  if (typeof module === 'object' && module.exports) module.exports = api;
  else root.RatingStore = api;
})(typeof globalThis !== 'undefined' ? globalThis : this, function (Engine) {
  'use strict';

  const COLLECTIONS = { matches: 'matches', journey: 'ratingJourney', players: 'players' };
  const SCHEMA_VERSION = 'v3-1';

  function assertUsableId(id, event) {
    if (id.includes('/') || id === '.' || id === '..') {
      throw new Error('Illegal document id "' + id + '" for ' + event.eventType);
    }
    return id;
  }

  function eventId(event) {
    if (event.eventType === Engine.EVENT.MATCH_UPDATE) {
      return assertUsableId(`${event.matchId}__${event.playerId}`, event);
    }
    // Every non-match event must be dated. Without one the id would not be
    // stable, and an undated event has no place in a chronological ledger.
    if (!event.effectiveDate) {
      throw new Error(`${event.eventType} for ${event.playerId} has no effectiveDate`);
    }
    return assertUsableId(`${event.effectiveDate}__${event.playerId}__${event.eventType}`, event);
  }

  // §11: the full record. Absent optional fields are written as null rather
  // than omitted, so a reader never has to guess whether a field was missing or
  // simply not applicable.
  const JOURNEY_FIELDS = [
    'playerId', 'eventType', 'effectiveDate',
    'previousTier', 'newTier',
    'previousClassificationStatus', 'newClassificationStatus',
    'previousPowerRating', 'newPowerRating',
    'previousReliability', 'newReliability',
    'effectiveEvidenceBefore', 'effectiveEvidenceAfter',
    'lifetimeMatchesAtEvent',
    'recommendationRating', 'recommendationReliability', 'recommendationMethodVersion',
    'decisionType', 'reasonCode', 'notes',
    'createdBy', 'recordedAt',
    'ratingModelVersion', 'source',
  ];

  // Large match records are referenced by id, never duplicated into the event.
  const MATCH_EVENT_FIELDS = [
    'matchId', 'side', 'preMatchRating', 'preMatchExpectedScore', 'actualScore',
    'performanceResidual', 'kUsed', 'ratingDelta', 'postMatchRating', 'tierAtEvent',
  ];

  function toJourneyDoc(event) {
    const doc = { id: eventId(event), schemaVersion: SCHEMA_VERSION };
    JOURNEY_FIELDS.forEach((f) => { doc[f] = event[f] === undefined ? null : event[f]; });
    if (event.eventType === Engine.EVENT.MATCH_UPDATE) {
      MATCH_EVENT_FIELDS.forEach((f) => { doc[f] = event[f] === undefined ? null : event[f]; });
    }
    return doc;
  }

  // Firestore rejects an array whose elements are themselves arrays, so a set
  // score is stored as a map per set rather than as [gamesA, gamesB]. The
  // engine's own shape is restored by matchFromDoc.
  function toMatchDoc(match) {
    return {
      id: match.id,
      schemaVersion: SCHEMA_VERSION,
      date: match.date,
      sourceIndex: match.sourceIndex ?? null,
      teamA: match.teamA,
      teamB: match.teamB,
      sets: match.sets.map((s) => ({ teamA: s[0], teamB: s[1] })),
      outcome: match.outcome,
      type: match.type ?? null,
      drawSideAssignmentArbitrary: !!match.drawSideAssignmentArbitrary,
    };
  }

  function matchFromDoc(doc) {
    return {
      id: doc.id,
      sourceIndex: doc.sourceIndex,
      date: doc.date,
      teamA: doc.teamA,
      teamB: doc.teamB,
      sets: doc.sets.map((s) => [s.teamA, s.teamB]),
      outcome: doc.outcome,
      type: doc.type,
      drawSideAssignmentArbitrary: doc.drawSideAssignmentArbitrary,
    };
  }

  // Walks a document and rejects anything Firestore will not accept. Cheap, and
  // it turns a failed network round-trip into a failing test.
  function assertFirestoreSafe(doc, collection) {
    const walk = (value, pathStr, insideArray) => {
      if (Array.isArray(value)) {
        if (insideArray) {
          throw new Error(`Nested array at ${collection}/${doc.id} ${pathStr} — Firestore rejects these.`);
        }
        value.forEach((v, i) => walk(v, `${pathStr}[${i}]`, true));
        return;
      }
      if (value && typeof value === 'object') {
        Object.entries(value).forEach(([k, v]) => walk(v, `${pathStr}.${k}`, false));
        return;
      }
      if (typeof value === 'number' && !Number.isFinite(value)) {
        throw new Error(`Non-finite number at ${collection}/${doc.id} ${pathStr}`);
      }
    };
    Object.entries(doc).forEach(([k, v]) => walk(v, k, false));
    return doc;
  }

  function toPlayerDoc(playerId, state) {
    return {
      id: playerId,
      schemaVersion: SCHEMA_VERSION,
      rating: state.rating,
      effectiveEvidence: state.effectiveEvidence,
      reliability: Engine.reliability(state.effectiveEvidence),
      lifetimeMatches: state.lifetimeMatches,
      tier: state.tier,
      classificationStatus: state.classificationStatus,
      ratingModelVersion: Engine.RATING_MODEL_VERSION,
    };
  }

  // Turns a replay into the exact set of documents that would be written.
  // Pure: builds the plan, writes nothing.
  // `provenance` stamps createdBy/recordedAt/source onto events that do not
  // already carry them, so a backfilled record says who wrote it. recordedAt is
  // supplied by the caller rather than read from the clock, so the same replay
  // always produces the same plan.
  function buildWritePlan({ matches, journey, state, provenance }) {
    const stamp = (doc) => {
      if (!provenance) return doc;
      ['createdBy', 'recordedAt', 'source'].forEach((f) => {
        if (doc[f] === null && provenance[f] !== undefined) doc[f] = provenance[f];
      });
      return doc;
    };
    const docs = {
      [COLLECTIONS.matches]: matches.map(toMatchDoc),
      [COLLECTIONS.journey]: journey.map((e) => stamp(toJourneyDoc(e))),
      [COLLECTIONS.players]: Object.keys(state).sort().map((p) => toPlayerDoc(p, state[p])),
    };
    const ids = docs[COLLECTIONS.journey].map((d) => d.id);
    const dupes = ids.filter((id, i) => ids.indexOf(id) !== i);
    if (dupes.length) throw new Error('Duplicate journey ids: ' + [...new Set(dupes)].join(', '));
    Object.entries(docs).forEach(([c, list]) => list.forEach((d) => assertFirestoreSafe(d, c)));
    return docs;
  }

  function evenlySpaced(arr, k) {
    if (k <= 0) return [];
    if (k >= arr.length) return [...arr];
    const out = [];
    for (let i = 0; i < k; i++) out.push(arr[Math.round((i * (arr.length - 1)) / (k - 1 || 1))]);
    return out;
  }

  // A capped sample of a plan, for a smoke-test write. Documents are taken
  // round-robin across collections so a small limit still covers every
  // collection, and evenly spaced within each so the sample is not all one
  // event type. The result is a real subset: same ids, same content, so the
  // later full seed simply overwrites it.
  function limitPlan(plan, limit) {
    const names = Object.keys(plan);
    const counts = Object.fromEntries(names.map((n) => [n, 0]));
    let remaining = Math.max(0, limit);
    let progressed = true;
    while (remaining > 0 && progressed) {
      progressed = false;
      for (const n of names) {
        if (remaining === 0) break;
        if (counts[n] < plan[n].length) { counts[n]++; remaining--; progressed = true; }
      }
    }
    return Object.fromEntries(names.map((n) => [n, evenlySpaced(plan[n], counts[n])]));
  }

  function summarisePlan(plan) {
    const journey = plan[COLLECTIONS.journey];
    const byType = {};
    journey.forEach((d) => { byType[d.eventType] = (byType[d.eventType] || 0) + 1; });
    return {
      collections: Object.fromEntries(Object.entries(plan).map(([c, d]) => [c, d.length])),
      journeyByEventType: byType,
      totalDocuments: Object.values(plan).reduce((s, d) => s + d.length, 0),
      approximateBytes: JSON.stringify(plan).length,
    };
  }

  // ---------- backends ----------

  function memoryBackend() {
    const data = {};
    return {
      name: 'memory',
      async set(collection, id, doc) {
        (data[collection] = data[collection] || {})[id] = doc;
      },
      async getAll(collection) { return Object.values(data[collection] || {}); },
      raw: data,
    };
  }

  // Firestore REST, so the seed can run from Node with no SDK install. The beta
  // project has open rules and no auth, which is why no token is attached; this
  // must never be pointed at a project that holds real credentials.
  function firestoreRestBackend({ projectId, fetchImpl }) {
    const doFetch = fetchImpl || globalThis.fetch;
    const base = `https://firestore.googleapis.com/v1/projects/${projectId}/databases/(default)/documents`;
    return {
      name: 'firestore-rest:' + projectId,
      async set(collection, id, doc) {
        const res = await doFetch(`${base}/${collection}/${encodeURIComponent(id)}`, {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ fields: toFirestoreFields(doc) }),
        });
        if (!res.ok) throw new Error(`write ${collection}/${id} failed: ${res.status} ${await res.text()}`);
      },
      // Firestore caps a page by response size, not just pageSize, so a large
      // collection comes back in pieces. Following nextPageToken is required --
      // without it a read silently truncates and looks like missing data.
      async getAll(collection) {
        const out = [];
        let pageToken = null;
        do {
          const url = `${base}/${collection}?pageSize=300` + (pageToken ? `&pageToken=${encodeURIComponent(pageToken)}` : '');
          const res = await doFetch(url);
          if (!res.ok) throw new Error(`read ${collection} failed: ${res.status}`);
          const body = await res.json();
          (body.documents || []).forEach((d) => out.push(fromFirestoreFields(d.fields)));
          pageToken = body.nextPageToken || null;
        } while (pageToken);
        return out;
      },
    };
  }

  function toFirestoreFields(value) {
    const enc = (v) => {
      if (v === null || v === undefined) return { nullValue: null };
      if (typeof v === 'boolean') return { booleanValue: v };
      if (typeof v === 'number') return Number.isInteger(v) ? { integerValue: String(v) } : { doubleValue: v };
      if (typeof v === 'string') return { stringValue: v };
      if (Array.isArray(v)) return { arrayValue: { values: v.map(enc) } };
      return { mapValue: { fields: Object.fromEntries(Object.entries(v).map(([k, x]) => [k, enc(x)])) } };
    };
    return Object.fromEntries(Object.entries(value).map(([k, v]) => [k, enc(v)]));
  }

  function fromFirestoreFields(fields) {
    const dec = (f) => {
      if (!f) return null;
      if ('nullValue' in f) return null;
      if ('booleanValue' in f) return f.booleanValue;
      if ('integerValue' in f) return Number(f.integerValue);
      if ('doubleValue' in f) return f.doubleValue;
      if ('stringValue' in f) return f.stringValue;
      if ('arrayValue' in f) return (f.arrayValue.values || []).map(dec);
      if ('mapValue' in f) return Object.fromEntries(Object.entries(f.mapValue.fields || {}).map(([k, v]) => [k, dec(v)]));
      return null;
    };
    return Object.fromEntries(Object.entries(fields || {}).map(([k, v]) => [k, dec(v)]));
  }

  async function writePlan(backend, plan, { onProgress } = {}) {
    let written = 0;
    for (const [collection, docs] of Object.entries(plan)) {
      for (const doc of docs) {
        await backend.set(collection, doc.id, doc);
        written++;
        if (onProgress) onProgress(written, collection, doc.id);
      }
    }
    return written;
  }

  return {
    COLLECTIONS, SCHEMA_VERSION, JOURNEY_FIELDS, MATCH_EVENT_FIELDS,
    eventId, toJourneyDoc, toMatchDoc, matchFromDoc, toPlayerDoc, assertFirestoreSafe,
    buildWritePlan, summarisePlan, writePlan, limitPlan,
    memoryBackend, firestoreRestBackend, toFirestoreFields, fromFirestoreFields,
  };
});
