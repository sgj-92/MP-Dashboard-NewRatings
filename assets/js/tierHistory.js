// ===================== TEMPORAL TIER HISTORY =====================
// The one implementation of "which tier was this player in on this date".
//
// Tier is temporal metadata (§9.1). Historical displays must use the tier that
// applied AT THE TIME: promoting someone in September must never rewrite them
// as Tier A in an August King of Tier B table. Anything that needs a tier for a
// past date goes through here, so the rule lives in exactly one place.
//
// A tier change never moves Power Rating or Reliability. That is enforced in
// ratingEngine.applyStateEvent(); nothing here touches ratings at all.

(function (root, factory) {
  const api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  else root.TierHistory = api;
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  'use strict';

  const TIER_CHANGE_EVENTS = [
    'INITIAL_CLASSIFICATION_CORRECTION',
    'PROMOTION',
    'DEMOTION',
  ];

  // §5.3, authoritative. Confirmed complete: nobody else changed tier between
  // June and September 2026. Do not infer additional dates.
  const AUTHORITATIVE_TIER_CHANGES = [
    { playerId: 'Shaun', effectiveDate: '2026-07-01', fromTier: 'C', toTier: 'B', eventType: 'INITIAL_CLASSIFICATION_CORRECTION', reasonCode: 'UNKNOWN_NEW_PLAYER' },
    { playerId: 'Tom', effectiveDate: '2026-07-01', fromTier: 'C', toTier: 'B', eventType: 'PROMOTION' },
    { playerId: 'Fatch', effectiveDate: '2026-08-01', fromTier: 'C', toTier: 'B', eventType: 'PROMOTION' },
  ];

  function sortChanges(changes) {
    return [...changes].sort((a, b) =>
      a.effectiveDate < b.effectiveDate ? -1 : a.effectiveDate > b.effectiveDate ? 1 : 0);
  }

  // The app stores each player's CURRENT tier. Walking the changes backwards
  // recovers the tier they started at, which is what seeds a replay.
  function deriveInitialTiers(currentTiers, changes) {
    const initial = { ...currentTiers };
    const byPlayer = {};
    sortChanges(changes).forEach((c) => { (byPlayer[c.playerId] = byPlayer[c.playerId] || []).push(c); });
    Object.entries(byPlayer).forEach(([playerId, list]) => {
      initial[playerId] = list[0].fromTier;
      const last = list[list.length - 1];
      if (currentTiers[playerId] !== undefined && currentTiers[playerId] !== last.toTier) {
        throw new Error(
          `Tier history for ${playerId} ends at ${last.toTier} but the current tier is ` +
          `${currentTiers[playerId]}. One of them is wrong -- do not guess.`);
      }
    });
    return initial;
  }

  function create({ currentTiers, changes = AUTHORITATIVE_TIER_CHANGES }) {
    const ordered = sortChanges(changes);
    const initialTiers = deriveInitialTiers(currentTiers, ordered);

    // A change effective on date D is in force for date D itself: a review at
    // the start of a month sits before that month's first match (§6.2).
    function tierAsOf(playerId, date) {
      let tier = initialTiers[playerId];
      for (const c of ordered) {
        if (c.playerId !== playerId) continue;
        if (c.effectiveDate <= date) tier = c.toTier; else break;
      }
      return tier;
    }

    function changesFor(playerId) {
      return ordered.filter((c) => c.playerId === playerId);
    }

    return {
      tierAsOf,
      changesFor,
      initialTiers,
      changes: ordered,
      currentTier: (playerId) => tierAsOf(playerId, '9999-12-31'),
    };
  }

  return { create, deriveInitialTiers, sortChanges, AUTHORITATIVE_TIER_CHANGES, TIER_CHANGE_EVENTS };
});
