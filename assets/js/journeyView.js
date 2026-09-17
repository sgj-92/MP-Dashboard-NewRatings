// ===================== RATING JOURNEY (display shaping) =====================
// Turns persisted ratingJourney events into the chronological story of one
// player's Power Rating. This is the REAL record, not a reconstruction: every
// figure here was written by the engine at the time and is simply read back.
//
// The disclaimer the old UI carried ("Story estimate — official Power Rating
// is X") existed because the previous journey was a separate approximation
// that could disagree with the official number. It cannot disagree now, so the
// disclaimer is gone.
//
// Two rules the display must never break:
//   * A tier change is shown as its own event and always states that the
//     Power Rating did not move. A promotion must never look like it generated
//     points.
//   * A club reassessment is shown as its own event with a distinct marker on
//     the chart. It must never masquerade as match movement.

(function (root, factory) {
  const api = factory(typeof require === 'function' ? require('./ratingEngine.js') : root.RatingEngine);
  if (typeof module === 'object' && module.exports) module.exports = api;
  else root.JourneyView = api;
})(typeof globalThis !== 'undefined' ? globalThis : this, function (Engine) {
  'use strict';

  const TIER_EVENTS = ['PROMOTION', 'DEMOTION', 'TIER_RETAINED'];

  // Grouped for a shared visual treatment. The schema keeps them as separate
  // event types on purpose -- this grouping is presentation only and must not
  // be pushed back into the stored data.
  function kindOf(event) {
    if (event.eventType === Engine.EVENT.PLAYER_INITIALISED) return 'initialised';
    if (event.eventType === Engine.EVENT.MATCH_UPDATE) return 'match';
    if (event.eventType === Engine.EVENT.CLUB_RATING_REASSESSMENT) return 'reassessment';
    if (event.eventType === Engine.EVENT.INITIAL_CLASSIFICATION_CORRECTION) return 'correction';
    if (TIER_EVENTS.includes(event.eventType)) return 'tier';
    return 'other';
  }

  const ORDER = { initialised: 0, correction: 1, tier: 1, reassessment: 1, match: 2, other: 1 };

  function chronological(events) {
    return [...events].sort((a, b) => {
      if (a.effectiveDate !== b.effectiveDate) return a.effectiveDate < b.effectiveDate ? -1 : 1;
      const ka = ORDER[kindOf(a)], kb = ORDER[kindOf(b)];
      if (ka !== kb) return ka - kb;
      // Match ids are `YYYY-MM-DD-N`, so they order matches within a day.
      return String(a.matchId || '').localeCompare(String(b.matchId || ''));
    });
  }

  function ratingAfter(event) {
    return event.eventType === Engine.EVENT.MATCH_UPDATE
      ? event.postMatchRating
      : event.newPowerRating;
  }

  // Shapes one player's events. Returns null when the player has no journey at
  // all -- the caller must say so plainly rather than invent a starting point.
  function forPlayer(allEvents, playerId) {
    const mine = chronological((allEvents || []).filter((e) => e.playerId === playerId));
    if (!mine.length) return null;

    const entries = mine.map((e) => {
      const kind = kindOf(e);
      const rating = ratingAfter(e);
      const previous = e.previousPowerRating;
      const base = {
        kind,
        eventType: e.eventType,
        date: e.effectiveDate,
        rating: rating,
        previousRating: typeof previous === 'number' ? previous : null,
        // A tier event carries previous === new, so this is 0 by construction
        // rather than by assumption.
        delta: (typeof previous === 'number' && typeof rating === 'number')
          ? Math.round((rating - previous) * 10) / 10
          : null,
        reliability: typeof e.newReliability === 'number' ? e.newReliability : null,
        previousReliability: typeof e.previousReliability === 'number' ? e.previousReliability : null,
        tier: e.newTier || e.tierAtEvent || null,
        previousTier: e.previousTier || null,
        reasonCode: e.reasonCode || null,
        notes: e.notes || null,
        decisionType: e.decisionType || null,
      };
      if (kind === 'match') {
        return {
          ...base,
          matchId: e.matchId,
          delta: Math.round((e.ratingDelta || 0) * 10) / 10,
          previousRating: e.preMatchRating,
          preMatchRating: e.preMatchRating,
          expected: e.preMatchExpectedScore,
          actual: e.actualScore,
          residual: e.performanceResidual,
          kUsed: e.kUsed,
          side: e.side,
        };
      }
      return base;
    });

    const first = entries[0], last = entries[entries.length - 1];
    return {
      playerId,
      entries,
      startRating: first.rating,
      endRating: last.rating,
      totalChange: Math.round((last.rating - first.rating) * 10) / 10,
      matchCount: entries.filter((e) => e.kind === 'match').length,
      // Counted separately so the UI can state plainly that these moved the
      // rating without a ball being hit -- or, for tier events, did not.
      reassessmentCount: entries.filter((e) => e.kind === 'reassessment').length,
      tierChangeCount: entries.filter((e) => e.kind === 'tier' || e.kind === 'correction').length,
      firstDate: first.date,
      lastDate: last.date,
    };
  }

  // A tier event must never show rating movement. Asserting it here as well as
  // in the engine means a display bug cannot invent one either.
  function tierEventsAreRatingNeutral(journey) {
    return journey.entries
      .filter((e) => e.kind === 'tier' || e.kind === 'correction')
      .every((e) => e.delta === 0 || e.delta === null);
  }

  // Points for the chart, plus the markers that must not look like match play.
  function chartSeries(journey) {
    return journey.entries.map((e, i) => ({
      i,
      date: e.date,
      rating: e.rating,
      kind: e.kind,
      delta: e.delta,
      // Reassessments are drawn distinctly; tier changes annotate without
      // moving the line, because they do not move the rating.
      isJump: e.kind === 'reassessment',
      isAnnotation: e.kind === 'tier' || e.kind === 'correction',
    }));
  }

  return { forPlayer, kindOf, chronological, chartSeries, tierEventsAreRatingNeutral, TIER_EVENTS };
});
