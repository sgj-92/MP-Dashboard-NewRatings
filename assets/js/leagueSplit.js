// ===================== LEAGUE SPLIT =====================
// A player who changes tier mid-month played part of that month in one tier
// and the rest in another. The League Table used to file the whole month under
// whichever tier they happen to be in now, which quietly moves points between
// tiers: a player promoted on the 20th arrived in the A table carrying the
// points they earned beating Bs.
//
// So each match is filed by the tier in force ON ITS OWN DATE. A match before
// the effective date belongs to the old tier; one on or after it belongs to
// the new tier. Points stay where they were earned and never transfer.
//
// The consequence is deliberate: a player can appear in two tier tables in the
// same month, each row holding only that stretch of it. `All together` is not
// a tier table, so it stays one row for the whole month and says what changed.
//
// Nothing here knows about any particular player or month. It is given a
// tier-at-date function and answers questions about it.

(function (root, factory) {
  const api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  else root.LeagueSplit = api;
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  'use strict';

  const ARROW = ' → ';
  // Separates the two halves of an aggregation key. A control character,
  // because a player's name is free text and a visible separator in a name
  // would silently merge two different rows.
  const SEP = '\u0000';

  function keyFor(name, tier) { return String(name) + SEP + String(tier); }
  function fromKey(key) {
    const i = String(key).indexOf(SEP);
    return i === -1 ? { name: String(key), tier: null } : { name: key.slice(0, i), tier: key.slice(i + 1) };
  }

  // The tiers a player actually occupied over these dates, in the order they
  // occupied them. Distinct and chronological: two spells in the same tier
  // either side of a spell elsewhere are reported as they happened.
  //
  // A date whose tier is unknown contributes nothing. Guessing would file a
  // match under a tier the player may never have been in.
  function tiersOver(dates, tierAt) {
    const out = [];
    (dates || [])
      .filter(Boolean)
      .slice()
      .sort()
      .forEach((d) => {
        const t = tierAt(d);
        if (!t) return;
        if (out[out.length - 1] !== t) out.push(t);
      });
    return out;
  }

  // What the `All together` row says in place of a single tier. One tier reads
  // as itself; a change reads as the change.
  function transitionLabel(tiers) {
    if (!tiers || !tiers.length) return null;
    return tiers.join(ARROW);
  }

  // Did this player's tier move within the dates given?
  function changedDuring(dates, tierAt) { return tiersOver(dates, tierAt).length > 1; }

  return { ARROW, SEP, keyFor, fromKey, tiersOver, transitionLabel, changedDuring };
});
