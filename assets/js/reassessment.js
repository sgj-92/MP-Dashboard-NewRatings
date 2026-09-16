// ===================== CLUB REASSESSMENT — RECOMMENDATION (advisory) =====================
// Isolated and versioned on purpose: this is a decision-support heuristic, NOT
// match mathematics. It must never be entangled with ratingEngine.js, and it
// may be replaced wholesale without touching the engine.
//
// CONFIDENCE WARNING — read before trusting any number this produces.
// The engine (sequential-v1) is validated against 144 matches. This module is
// NOT in that category. Its parameters rest on:
//   * Experiment 13B — 3 players, 42 observations
//   * Experiment 13C — 1 classification correction, 16 matches
// Brier score did not improve at ANY alpha. The alphas below are provisional
// and are shipped deliberately more conservative than the best-performing
// values, pending shadow-testing against real reviews.

(function (root, factory) {
  const api = factory(typeof require === 'function' ? require('./ratingEngine.js') : root.RatingEngine);
  if (typeof module === 'object' && module.exports) module.exports = api;
  else root.Reassessment = api;
})(typeof globalThis !== 'undefined' ? globalThis : this, function (Engine) {
  'use strict';

  const RECOMMENDATION_METHOD_VERSION = 't2-quartile-v1';

  const DEFAULTS = {
    // "Established" is a PARAMETER, not a constant. Experiment 13 used 8;
    // Experiments 13B and 13C used 5. 5 is the one the historical validation
    // actually ran on, so it is the default.
    minEvidence: 5,
    // Below this many established players on either side, the quartile rests on
    // too little to mean anything. Return nothing rather than a fabricated target.
    minPoolSize: 3,
    // Best-performing values from 13B/13C were 0.50 (promotion/demotion) and
    // 0.75-1.0 (initial correction). Shipping at 0.25 until real reviews
    // accumulate. Raise deliberately, never silently.
    alpha: 0.25,
  };

  const BEST_PERFORMING_ALPHA = {
    PROMOTION: 0.50,
    DEMOTION: 0.50,
    INITIAL_CLASSIFICATION_CORRECTION: 0.875, // 13C supported 0.75-1.0
  };

  // Linear-interpolation quantile (numpy default / R type 7). This is the
  // method that reproduces the 13B historical boundaries exactly.
  function quantile(values, p) {
    if (!values.length) return null;
    const s = [...values].sort((a, b) => a - b);
    const h = (s.length - 1) * p;
    const lo = Math.floor(h);
    const hi = Math.min(lo + 1, s.length - 1);
    return s[lo] + (h - lo) * (s[hi] - s[lo]);
  }

  // Pool membership is evaluated as the tiers stand AFTER the review: the player
  // under review counts in the tier they are moving into, not the one they are
  // leaving. This is what reproduces the 1 Jul and 1 Aug boundaries.
  function buildPools({ state, tierOf, subject, fromTier, toTier, minEvidence }) {
    const from = [], to = [];
    Object.keys(state).forEach((name) => {
      if (state[name].effectiveEvidence < minEvidence) return;
      const tier = name === subject ? toTier : tierOf(name);
      if (tier === fromTier && name !== subject) from.push(state[name].rating);
      else if (tier === toTier) to.push(state[name].rating);
    });
    return { from, to };
  }

  function tierBoundaryT2({ state, tierOf, subject, fromTier, toTier, direction, minEvidence }) {
    const pools = buildPools({ state, tierOf, subject, fromTier, toTier, minEvidence });
    // Promotion reads the top of the tier being left and the bottom of the one
    // being joined; demotion inverts both.
    const fromQ = direction === 'promotion' ? 0.75 : 0.25;
    const toQ = direction === 'promotion' ? 0.25 : 0.75;
    const fromQuartile = quantile(pools.from, fromQ);
    const toQuartile = quantile(pools.to, toQ);
    return {
      fromQuartile,
      toQuartile,
      t2: fromQuartile === null || toQuartile === null ? null : (fromQuartile + toQuartile) / 2,
      fromPoolSize: pools.from.length,
      toPoolSize: pools.to.length,
    };
  }

  const DEMOTION_EVENTS = ['DEMOTION'];

  function directionFor(eventType, fromTier, toTier) {
    if (DEMOTION_EVENTS.includes(eventType)) return 'demotion';
    if (fromTier && toTier && Engine.TIER_SEED[toTier] < Engine.TIER_SEED[fromTier]) return 'demotion';
    return 'promotion';
  }

  // Advisory only. The board decides; this never applies anything.
  function getRecommendation({ state, tierOf, subject, fromTier, toTier, eventType, params }) {
    const cfg = { ...DEFAULTS, ...(params || {}) };
    const current = state[subject];
    if (!current) throw new Error('Unknown player: ' + subject);

    const direction = directionFor(eventType, fromTier, toTier);
    const b = tierBoundaryT2({
      state, tierOf, subject, fromTier, toTier, direction, minEvidence: cfg.minEvidence,
    });

    const base = {
      methodVersion: RECOMMENDATION_METHOD_VERSION,
      subject, eventType, fromTier, toTier, direction,
      currentRating: current.rating,
      currentReliability: Engine.reliability(current.effectiveEvidence),
      minEvidence: cfg.minEvidence,
      establishedFrom: b.fromPoolSize,
      establishedTo: b.toPoolSize,
      alpha: cfg.alpha,
      bestPerformingAlpha: BEST_PERFORMING_ALPHA[eventType] ?? null,
      // No validated method exists for recommending a Reliability change on a
      // tier move, so none is offered. An override remains available to the board.
      recommendationReliability: null,
    };

    if (b.fromPoolSize < cfg.minPoolSize || b.toPoolSize < cfg.minPoolSize) {
      return {
        ...base,
        recommended: false,
        reason: `Not enough established players to place a boundary (${b.fromPoolSize} in ${fromTier}, ` +
                `${b.toPoolSize} in ${toTier}; ${cfg.minPoolSize} needed each side). No rating change recommended.`,
        t2: null,
        recommendationRating: null,
      };
    }

    // The directional clamp is what stops the same evidence being counted twice:
    // a player already past the boundary is recommended no movement at all.
    const raw = cfg.alpha * (b.t2 - current.rating);
    const delta = direction === 'promotion' ? Math.max(0, raw) : Math.min(0, raw);

    return {
      ...base,
      recommended: true,
      t2: b.t2,
      fromQuartile: b.fromQuartile,
      toQuartile: b.toQuartile,
      recommendationRating: current.rating + delta,
      ratingDelta: delta,
      reason: delta === 0
        ? `Already beyond the ${fromTier}/${toTier} boundary (${b.t2.toFixed(1)}). No rating change recommended.`
        : `Moves ${(cfg.alpha * 100).toFixed(0)}% of the way toward the ${fromTier}/${toTier} boundary of ${b.t2.toFixed(1)}.`,
      caveats: [
        'Advisory only — the board has final authority and may override both Rating and Reliability.',
        'Parameters are provisional: 13B rests on 3 players / 42 observations, 13C on 1 correction / 16 matches.',
        'Brier score did not improve at any alpha. Treat this as governance support, not a validated prediction.',
      ],
    };
  }

  return {
    RECOMMENDATION_METHOD_VERSION, DEFAULTS, BEST_PERFORMING_ALPHA,
    quantile, tierBoundaryT2, getRecommendation, directionFor,
  };
});
