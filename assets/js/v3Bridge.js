// ===================== v3 READ LAYER =====================
// The single point where the existing application obtains v3 state.
//
// Reads the compact `players` collection only. It must NEVER reconstruct
// current state by scanning `ratingJourney` -- that collection is 633 documents
// and growing ~120 a month, and is for journey/event views alone.
//
// FAILURE IS LOUD. If the read fails, a document is missing, or a field is
// malformed, this reports it and the application shows an unavailable state.
// It never falls back to 1400, to the legacy solver, to a tier seed, or to a
// reconstructed value. A believable but wrong number is worse than a gap.

(function (root, factory) {
  const api = factory(typeof require === 'function' ? require('./ratingEngine.js') : root.RatingEngine);
  if (typeof module === 'object' && module.exports) module.exports = api;
  else root.V3Bridge = api;
})(typeof globalThis !== 'undefined' ? globalThis : this, function (Engine) {
  'use strict';

  const REQUIRED_FIELDS = ['id', 'rating', 'effectiveEvidence', 'lifetimeMatches', 'tier', 'classificationStatus'];

  // Presentation bands, derived from Reliability -- never from match count,
  // because a club reassessment can change effective evidence independently of
  // lifetime matches, and a count-based label would misreport such a player.
  function reliabilityBand(reliability) {
    const pct = reliability * 100;
    if (pct < 25) return 'Provisional';
    if (pct < 50) return 'Developing';
    if (pct < 75) return 'Established';
    return 'High Reliability';
  }

  function validatePlayerDoc(doc) {
    const problems = [];
    REQUIRED_FIELDS.forEach((f) => {
      if (doc[f] === undefined || doc[f] === null) problems.push(`missing ${f}`);
    });
    if (typeof doc.rating === 'number' && !Number.isFinite(doc.rating)) problems.push('rating is not finite');
    if (typeof doc.effectiveEvidence === 'number' && doc.effectiveEvidence < 0) problems.push('negative effectiveEvidence');
    if (doc.tier && !(doc.tier in Engine.TIER_SEED)) problems.push(`unknown tier ${doc.tier}`);
    return problems;
  }

  function createState() {
    return { loaded: false, error: null, players: {}, playerCount: 0, loadedAt: null, problems: [] };
  }

  // backend: anything with getAll(collection). Browser passes a Firestore
  // compat backend; tests pass an in-memory one.
  async function load(backend) {
    const state = createState();
    let docs;
    try {
      docs = await backend.getAll('players');
    } catch (e) {
      state.error = 'Could not read v3 player state: ' + (e && e.message ? e.message : String(e));
      return state;
    }
    if (!docs || docs.length === 0) {
      state.error = 'The v3 players collection is empty. Has the backfill been run?';
      return state;
    }
    docs.forEach((d) => {
      const problems = validatePlayerDoc(d);
      if (problems.length) {
        state.problems.push(`${d.id || '(no id)'}: ${problems.join(', ')}`);
        return;
      }
      state.players[d.id] = {
        name: d.id,
        rating: d.rating,
        reliability: Engine.reliability(d.effectiveEvidence),
        reliabilityBand: reliabilityBand(Engine.reliability(d.effectiveEvidence)),
        effectiveEvidence: d.effectiveEvidence,
        lifetimeMatches: d.lifetimeMatches,
        tier: d.tier,
        classificationStatus: d.classificationStatus,
        ratingModelVersion: d.ratingModelVersion || null,
      };
    });
    state.playerCount = Object.keys(state.players).length;
    if (state.problems.length) {
      state.error = `${state.problems.length} v3 player document(s) are malformed: ` + state.problems.join(' | ');
      return state;
    }
    state.loaded = true;
    state.loadedAt = new Date().toISOString();
    return state;
  }

  // Converts a stored v3 match into the shape the existing application reads.
  // Team A is the winning side for every decided match; a draw carries isDraw
  // and its side assignment is arbitrary but fixed.
  function toLegacyMatchShape(doc) {
    const isDraw = doc.outcome === Engine.OUTCOME.DRAW;
    return {
      id: doc.id,
      date: doc.date,
      sourceIndex: doc.sourceIndex,
      winners: doc.teamA,
      losers: doc.teamB,
      sets: doc.sets.map((s) => [s.teamA, s.teamB]),
      type: doc.type || 'doubles',
      note: '',
      verified: true,
      isDraw: isDraw,
      _v3: true,
    };
  }

  // Ordering is pinned to (date, sourceIndex) exactly as the engine orders it,
  // so the application and the rating it displays walk the same sequence.
  async function loadMatches(backend) {
    const docs = await backend.getAll('matches');
    if (!docs || docs.length === 0) throw new Error('The v3 matches collection is empty.');
    return docs
      .map(toLegacyMatchShape)
      .sort((a, b) => (a.date < b.date ? -1 : a.date > b.date ? 1 : a.sourceIndex - b.sourceIndex));
  }

  // The map buildPlayers() consumes: name -> Power Rating. Reading this when
  // state has not loaded is a programming error, not a reason to substitute.
  function ratingsMap(state) {
    if (!state.loaded) throw new Error('v3 state is not loaded; there is no rating to supply.');
    const out = {};
    Object.values(state.players).forEach((p) => { out[p.name] = p.rating; });
    return out;
  }

  function tierMap(state) {
    if (!state.loaded) throw new Error('v3 state is not loaded; there is no tier to supply.');
    const out = {};
    Object.values(state.players).forEach((p) => { out[p.name] = p.tier; });
    return out;
  }

  // Attaches v3 fields to an existing PLAYERS[] entry plus, separately, the
  // frozen production comparison. The two never derive from one another.
  function decoratePlayer(player, state, snapshotIndex) {
    const v3 = state.players[player.name];
    if (!v3) {
      player.v3Missing = true;
      return player;
    }
    player.v3Rating = v3.rating;
    player.reliability = v3.reliability;
    player.reliabilityPct = Math.round(v3.reliability * 1000) / 10;
    player.reliabilityBand = v3.reliabilityBand;
    player.effectiveEvidence = v3.effectiveEvidence;
    player.lifetimeMatches = v3.lifetimeMatches;
    player.classificationStatus = v3.classificationStatus;
    player.ratingModelVersion = v3.ratingModelVersion;

    const snap = snapshotIndex ? snapshotIndex[player.name] : null;
    player.productionSnapshotRating = snap ? snap.power_rating : null;
    player.productionSnapshotMissing = !snap;
    player.productionVsV3 = snap ? Math.round((v3.rating - snap.power_rating) * 10) / 10 : null;
    return player;
  }

  // Name is the only join key: every player_id in the export is null.
  function indexSnapshot(snapshot) {
    const index = {};
    (snapshot && snapshot.players ? snapshot.players : []).forEach((p) => { index[p.name] = p; });
    return index;
  }

  function reconcileSnapshot(state, snapshot) {
    const index = indexSnapshot(snapshot);
    const v3Names = Object.keys(state.players);
    const snapNames = Object.keys(index);
    return {
      exportedAt: snapshot && snapshot.snapshot_metadata ? snapshot.snapshot_metadata.export_timestamp_utc : null,
      inV3NotSnapshot: v3Names.filter((n) => !index[n]),
      inSnapshotNotV3: snapNames.filter((n) => !state.players[n]),
      matched: v3Names.filter((n) => index[n]).length,
    };
  }

  return {
    createState, load, loadMatches, toLegacyMatchShape, ratingsMap, tierMap, decoratePlayer,
    indexSnapshot, reconcileSnapshot, reliabilityBand, validatePlayerDoc, REQUIRED_FIELDS,
  };
});
