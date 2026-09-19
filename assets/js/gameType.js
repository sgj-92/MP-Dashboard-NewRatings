// ===================== GAME TYPE =====================
// What kind of match was this, in terms of the tiers on court?
//
// Purely about composition: which tiers the four players were in ON THE DAY,
// canonicalised so the same fixture always classifies the same way however the
// two sides happened to be stored.
//
// Two levels of canonicalisation, and both matter:
//
//   1. within a team -- A&B and B&A are the same pairing, so the letters are
//      sorted: "AB";
//   2. between the teams -- "AB vs BB" and "BB vs AB" are the same game type,
//      so the two team keys are sorted too.
//
// Without the second step a filter for "AB vs BB" would silently miss half the
// matches, depending only on which side the exporter happened to list first.
//
// Deliberately non-evaluative. There is no "easy", "soft" or "inflated" here:
// a composition is a fact, and what it means is the reader's to decide.

(function (root, factory) {
  const api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  else root.GameType = api;
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  'use strict';

  // Strongest first, so a team key reads the way the club talks: "AB", not "BA".
  const TIER_ORDER = ['S', 'A', 'B', 'C'];
  const rank = (t) => {
    const i = TIER_ORDER.indexOf(t);
    return i === -1 ? TIER_ORDER.length : i;
  };

  const UNKNOWN = '?';

  function teamKey(tiers) {
    return (tiers || []).map((t) => t || UNKNOWN).sort((a, b) => rank(a) - rank(b)).join('');
  }

  // The canonical name of this game type. Null when any tier is unknown --
  // guessing would file a match under a composition it may not have had.
  function matchupKey(tiersA, tiersB) {
    const a = teamKey(tiersA), b = teamKey(tiersB);
    if (!a || !b || a.includes(UNKNOWN) || b.includes(UNKNOWN)) return null;
    return (a <= b ? `${a} vs ${b}` : `${b} vs ${a}`);
  }

  // The broad bucket: every player in one tier, or mixed.
  function category(tiersA, tiersB) {
    const all = [].concat(tiersA || [], tiersB || []);
    if (!all.length || all.some((t) => !t)) return null;
    const first = all[0];
    return all.every((t) => t === first) ? `ALL_${first}` : 'MIXED';
  }

  function classify(tiersA, tiersB) {
    return { matchup: matchupKey(tiersA, tiersB), category: category(tiersA, tiersB) };
  }

  const categoryLabel = (c) => (c === 'MIXED' ? 'Mixed-tier games' : `All ${c.slice(4)} games`);

  // Every option the CURRENT data actually supports, so the control never
  // offers a filter that matches nothing.
  function optionsFrom(classified) {
    const categories = {}, matchups = {};
    (classified || []).forEach((c) => {
      if (c.category) categories[c.category] = (categories[c.category] || 0) + 1;
      if (c.matchup) matchups[c.matchup] = (matchups[c.matchup] || 0) + 1;
    });
    const catOpts = Object.keys(categories)
      .sort((a, b) => (a === 'MIXED' ? 1 : b === 'MIXED' ? -1 : rank(a.slice(4)) - rank(b.slice(4))))
      .map((c) => ({ value: 'cat:' + c, label: categoryLabel(c), count: categories[c] }));
    const matchOpts = Object.keys(matchups)
      .sort((a, b) => (matchups[b] - matchups[a]) || a.localeCompare(b))
      .map((m) => ({ value: 'match:' + m, label: m, count: matchups[m] }));
    return { categories: catOpts, matchups: matchOpts };
  }

  // Does one classified match satisfy the chosen filter value?
  function matches(value, classified) {
    if (!value || value === 'all') return true;
    if (!classified) return false;
    if (value.indexOf('cat:') === 0) return classified.category === value.slice(4);
    if (value.indexOf('match:') === 0) return classified.matchup === value.slice(6);
    return true;
  }

  return { TIER_ORDER, teamKey, matchupKey, category, classify, categoryLabel, optionsFrom, matches };
});
