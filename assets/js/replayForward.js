// ===================== REPLAY FORWARD =====================
// Changing the match history means changing the inputs to everything that came
// after it. A rating is not a stored fact you can edit; it is the end of a
// sequence, and the only honest way to change one match is to re-derive every
// rating that followed from it.
//
// This module does that by rebuilding the ENGINE INPUTS from the stored record,
// applying the change, and replaying the whole thing. Not a partial replay from
// a midpoint: every input is stored, so a full re-derivation is exact and has no
// partial-state bookkeeping to get subtly wrong. 150 matches costs nothing.
//
// The proof that it can be trusted is `verifyNoOp`: replaying with NO change
// must reproduce the stored record exactly. If that ever fails, nothing else
// here means anything, so it is a test and also a runtime precondition of
// planning a real change.
//
// One subtlety, and it is the reason this module reconstructs INTENT rather
// than echoing the record. A recorded event carries `newReliability` whether or
// not it meant to change reliability, and feeding that back inverts it through
// reliability = e / (e + 10), losing a last bit (Open Question 11). So an event
// is replayed carrying a reliability change only when it actually made one.
// That is both exact and more faithful: it replays what the decision was, not
// what the arithmetic happened to record.

(function (root, factory) {
  const api = factory(
    typeof require === 'function' ? require('./ratingEngine.js') : root.RatingEngine,
    typeof require === 'function' ? require('./ratingStore.js') : root.RatingStore,
    typeof require === 'function' ? require('./monthlyReview.js') : root.MonthlyReview
  );
  if (typeof module === 'object' && module.exports) module.exports = api;
  else root.ReplayForward = api;
})(typeof globalThis !== 'undefined' ? globalThis : this, function (Engine, Store, Review) {
  'use strict';

  const INIT = Engine.EVENT.PLAYER_INITIALISED;
  const MATCH = Engine.EVENT.MATCH_UPDATE;

  function byDateThen(a, b, key) {
    if (a.effectiveDate !== b.effectiveDate) return a.effectiveDate < b.effectiveDate ? -1 : 1;
    return String(a[key] || '').localeCompare(String(b[key] || ''));
  }

  // The engine inputs that produced the stored record. Everything here is read
  // back; nothing is inferred.
  function inputsFromRecord({ matches, journey }) {
    const matchInputs = (matches || []).map(Store.matchFromDoc);

    const initialisations = (journey || [])
      .filter((e) => e.eventType === INIT)
      .sort((a, b) => byDateThen(a, b, 'playerId'))
      .map((e) => ({
        playerId: e.playerId,
        tier: e.newTier,
        // Both matter and both are recorded. classificationStatus defaults to
        // ESTABLISHED in the engine, so dropping it silently promotes every
        // provisional player and the correction that follows then throws.
        // The starting rating is carried too, so a non-standard seed survives
        // rather than being re-derived from the tier.
        classificationStatus: e.newClassificationStatus || undefined,
        rating: typeof e.newPowerRating === 'number' ? e.newPowerRating : undefined,
        effectiveDate: e.effectiveDate,
        reasonCode: e.reasonCode || undefined,
      }));

    // Same date, same player: a tier move is recorded before the rating
    // decision that accompanies it. Sorting by event type alphabetically put
    // CLUB_RATING_REASSESSMENT before PROMOTION -- backwards from how a board
    // makes the decision, and enough to stop the record reproducing itself.
    const events = (journey || [])
      .filter((e) => e.eventType !== INIT && e.eventType !== MATCH)
      .sort((a, b) => {
        if (a.effectiveDate !== b.effectiveDate) return a.effectiveDate < b.effectiveDate ? -1 : 1;
        const ra = Review.eventRank(a.eventType), rb = Review.eventRank(b.eventType);
        if (ra !== rb) return ra - rb;
        return String(a.playerId || '').localeCompare(String(b.playerId || ''));
      })
      .map((e) => {
        const input = {
          playerId: e.playerId,
          eventType: e.eventType,
          effectiveDate: e.effectiveDate,
          decisionType: e.decisionType ?? null,
          reasonCode: e.reasonCode ?? null,
          notes: e.notes ?? null,
          createdBy: e.createdBy ?? null,
          recordedAt: e.recordedAt ?? null,
          source: e.source ?? null,
          recommendationRating: e.recommendationRating ?? null,
          recommendationReliability: e.recommendationReliability ?? null,
          recommendationMethodVersion: e.recommendationMethodVersion ?? null,
        };
        if (e.newTier !== null && e.newTier !== undefined) input.newTier = e.newTier;
        // Only when the event actually moved it -- see the note at the top.
        if (typeof e.newPowerRating === 'number' && e.newPowerRating !== e.previousPowerRating) {
          input.newPowerRating = e.newPowerRating;
        }
        if (typeof e.newReliability === 'number' && e.newReliability !== e.previousReliability) {
          input.newReliability = e.newReliability;
        }
        return input;
      });

    return { matches: matchInputs, initialisations, events };
  }

  // A player who first appears in an appended match has no initialisation, and
  // the engine refuses to rate a player it has never seen. Rather than invent
  // one silently, this reports them so the caller must decide the tier.
  function unseenPlayers(inputs) {
    const known = {};
    inputs.initialisations.forEach((i) => { known[i.playerId] = true; });
    const missing = {};
    inputs.matches.forEach((m) => {
      [].concat(m.teamA, m.teamB).forEach((n) => {
        if (!known[n]) missing[n] = missing[n] || m.date;
      });
    });
    return Object.entries(missing).map(([playerId, firstDate]) => ({ playerId, firstDate }));
  }

  // change: { type: 'append' | 'edit' | 'delete', match?, matchId? }
  function applyChange(inputs, change) {
    const matches = inputs.matches.slice();
    if (change.type === 'append') {
      if (matches.some((m) => m.id === change.match.id)) {
        throw new Error(`Match ${change.match.id} is already in the record.`);
      }
      matches.push(change.match);
    } else if (change.type === 'edit') {
      const i = matches.findIndex((m) => m.id === change.match.id);
      if (i === -1) throw new Error(`Match ${change.match.id} is not in the record.`);
      matches[i] = change.match;
    } else if (change.type === 'delete') {
      const i = matches.findIndex((m) => m.id === change.matchId);
      if (i === -1) throw new Error(`Match ${change.matchId} is not in the record.`);
      matches.splice(i, 1);
    } else {
      throw new Error(`Unknown change type: ${change.type}`);
    }
    return { ...inputs, matches };
  }

  function replayInputs(inputs) {
    return Engine.replay({
      matches: inputs.matches,
      initialisations: inputs.initialisations,
      events: inputs.events,
    });
  }

  // Two documents are the same document when they say the same thing. Two
  // traps make that harder than it sounds, and both were caught by the no-op
  // check rather than by reasoning:
  //
  //   * Firestore returns keys in whatever order the export produced, so
  //     comparing serialised JSON compares key order and calls every document
  //     changed.
  //   * The record was seeded by Node and is replayed in a browser, and their
  //     Math.pow results differ in the last bit. An expectation stored as
  //     0.4803169324020399 replays as 0.48031693240203976. Demanding exact
  //     equality would mean no browser replay could ever verify, and every edit
  //     would rewrite all 817 documents over differences 14 decimal places
  //     below anything the app displays.
  //
  // So: numbers agree within EPSILON, everything else must match exactly. This
  // is far tighter than anything that could reach a screen -- ratings are shown
  // to one decimal place -- while being immune to which engine did the sum.
  const EPSILON = 1e-9;

  function sameValue(a, b) {
    if (typeof a === 'number' && typeof b === 'number') {
      return a === b || Math.abs(a - b) <= EPSILON * Math.max(1, Math.abs(a), Math.abs(b));
    }
    if (Array.isArray(a) && Array.isArray(b)) {
      return a.length === b.length && a.every((v, i) => sameValue(v, b[i]));
    }
    if (a && b && typeof a === 'object' && typeof b === 'object') {
      const ka = Object.keys(a).sort(), kb = Object.keys(b).sort();
      return ka.length === kb.length && ka.every((k, i) => k === kb[i]) && ka.every((k) => sameValue(a[k], b[k]));
    }
    return a === b;
  }

  function sameDoc(a, b) {
    const keys = [...new Set([...Object.keys(a), ...Object.keys(b)])];
    return keys.every((k) => sameValue(a[k], b[k]));
  }

  const PROVENANCE_FIELDS = ['createdBy', 'recordedAt', 'source'];

  // The matches written are the ones replayed, taken from the inputs. Deriving
  // them from the replay's own records would be re-reading the engine's working
  // rather than the history it was given.
  //
  // `keepProvenanceFrom` carries each existing event's original attribution
  // forward. An event that already happened was not created by whoever is
  // editing now, and restamping it would rewrite who recorded the whole season
  // -- which also made every document differ, so every edit looked like a full
  // rebuild.
  function docsOf(inputs, replay, provenance, keepProvenanceFrom) {
    const plan = Store.buildWritePlan({
      matches: inputs.matches,
      journey: replay.journey,
      state: replay.state,
      provenance,
    });
    if (keepProvenanceFrom) {
      const original = {};
      (keepProvenanceFrom || []).forEach((d) => { original[d.id] = d; });
      plan[Store.COLLECTIONS.journey].forEach((d) => {
        const was = original[d.id];
        if (!was) return;
        PROVENANCE_FIELDS.forEach((f) => { if (was[f] !== undefined) d[f] = was[f]; });
      });
    }
    return plan;
  }

  // Compares two sets of documents by id and reports what actually changed.
  // Only the differences are written: a replay that rewrote all 817 documents
  // to change one would make every edit look like a database rebuild and hide
  // what really moved.
  function diffDocs(before, after) {
    const writes = {}, deletes = {};
    let changed = 0, removed = 0;
    Object.keys(after).forEach((collection) => {
      const was = {};
      (before[collection] || []).forEach((d) => { was[d.id] = d; });
      const now = {};
      (after[collection] || []).forEach((d) => { now[d.id] = d; });

      writes[collection] = (after[collection] || []).filter((d) => {
        const prior = was[d.id];
        return !prior || !sameDoc(prior, d);
      });
      deletes[collection] = Object.keys(was).filter((id) => !now[id]);
      changed += writes[collection].length;
      removed += deletes[collection].length;
    });
    return { writes, deletes, changed, removed };
  }

  // The precondition: replaying the stored inputs unchanged must reproduce the
  // stored documents exactly. Anything else means the record and the engine have
  // diverged, and no change may be planned on top of that.
  function verifyNoOp(stored, provenance) {
    const inputs = inputsFromRecord(stored);
    const rebuilt = docsOf(inputs, replayInputs(inputs), provenance, stored.journey);
    const storedDocs = {
      [Store.COLLECTIONS.matches]: stored.matches || [],
      [Store.COLLECTIONS.journey]: stored.journey || [],
      [Store.COLLECTIONS.players]: stored.players || [],
    };
    const d = diffDocs(storedDocs, rebuilt);
    const differences = [];
    Object.entries(d.writes).forEach(([c, docs]) => docs.forEach((doc) => differences.push(`${c}/${doc.id} differs`)));
    Object.entries(d.deletes).forEach(([c, ids]) => ids.forEach((id) => differences.push(`${c}/${id} would disappear`)));
    return { identical: differences.length === 0, differences: differences.slice(0, 40), count: differences.length };
  }

  // The whole plan for one change: what to write, what to delete, and which
  // players' ratings move as a result. Refuses outright if a no-op replay does
  // not already reproduce the record.
  function plan({ stored, change, provenance }) {
    const check = verifyNoOp(stored, provenance);
    if (!check.identical) {
      const err = new Error(
        'Replaying the record unchanged does not reproduce it (' + check.count + ' difference(s)). ' +
        'The stored ratings and the stored history have diverged, so no edit can be planned on top of them.\n- ' +
        check.differences.join('\n- '));
      err.differences = check.differences;
      throw err;
    }

    const inputs = inputsFromRecord(stored);
    const changed = applyChange(inputs, change);

    const unseen = unseenPlayers(changed);
    if (unseen.length) {
      const err = new Error('These players have never been initialised, so they have no rating to move: '
        + unseen.map((u) => `${u.playerId} (first appears ${u.firstDate})`).join(', ')
        + '. Initialise them with a starting tier first.');
      err.unseen = unseen;
      throw err;
    }

    const beforeDocs = docsOf(inputs, replayInputs(inputs), provenance, stored.journey);
    const afterReplay = replayInputs(changed);
    const afterDocs = docsOf(changed, afterReplay, provenance, stored.journey);
    const d = diffDocs(beforeDocs, afterDocs);

    // Who this actually moves, and by how much. An edit to one June match can
    // reach dozens of people through later pairings, and the operator should
    // see that before agreeing to it.
    const moved = [];
    const was = {};
    (beforeDocs[Store.COLLECTIONS.players] || []).forEach((p) => { was[p.id] = p; });
    (afterDocs[Store.COLLECTIONS.players] || []).forEach((p) => {
      const prior = was[p.id];
      if (!prior) { moved.push({ playerId: p.id, from: null, to: p.rating, delta: null }); return; }
      if (Math.abs(prior.rating - p.rating) > 1e-9) {
        moved.push({ playerId: p.id, from: prior.rating, to: p.rating, delta: Math.round((p.rating - prior.rating) * 10) / 10 });
      }
    });
    moved.sort((a, b) => Math.abs(b.delta || 0) - Math.abs(a.delta || 0));

    return {
      change,
      writes: d.writes,
      deletes: d.deletes,
      documentsToWrite: d.changed,
      documentsToDelete: d.removed,
      playersMoved: moved,
      replay: afterReplay,
    };
  }

  async function commit(backend, planned) {
    let written = 0, deleted = 0;
    // Deletions first: a removed match's events must not linger beside the
    // rewritten ones, where a reader would see both.
    for (const [collection, ids] of Object.entries(planned.deletes)) {
      for (const id of ids) { await backend.remove(collection, id); deleted++; }
    }
    for (const [collection, docs] of Object.entries(planned.writes)) {
      for (const doc of docs) { await backend.set(collection, doc.id, doc); written++; }
    }
    return { written, deleted };
  }

  return { inputsFromRecord, applyChange, plan, commit, verifyNoOp, diffDocs, unseenPlayers, sameDoc, EPSILON };
});
