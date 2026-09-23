// ===================== PLAYER FILTER =====================
// Find the games a given set of people played in, in any combination.
//
// "Who played Shaun, Rishi, Len and Tom?" is a question about a SET of four
// people, not about a fixture. The same four play each other in three
// different pairings, either side can be stored as Team A, and the order the
// names were typed in when the result was entered is an accident of whoever
// typed it. So the filter is order- and partnership-agnostic by construction:
// it compares sets, and a set has no order and no sides.
//
// IT WORKS IN CANONICAL IDS, NEVER IN DISPLAYED NAMES. A player's name is a
// label that an admin can change (see playerNames.js); their `playerId` is
// frozen for ever. Matching on labels would mean that renaming Rishi silently
// emptied every saved search and every historical lookup that mentioned him.
// The caller supplies `toId`, and both sides of the comparison go through it.
//
// Fewer than four names is not a degenerate case, it is the common one:
// one name is "their games", two is "any game these two were both in,
// partners or opponents", three narrows it further. Four is the exact group —
// and since a doubles match has exactly four players, "contains all four" and
// "is exactly these four" are the same statement.

(function (root, factory) {
  const api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  else root.PlayerFilter = api;
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  'use strict';

  const MAX = 4;

  // What the caller asked for, made safe: blanks dropped, duplicates removed,
  // never more than a match can hold. A name appearing twice would be a filter
  // that can never match anything, which is worse than one that ignores the
  // repeat.
  function normalise(ids, max) {
    const limit = max || MAX;
    const seen = new Set();
    const out = [];
    (ids || []).forEach((raw) => {
      const id = (typeof raw === 'string' ? raw.trim() : '');
      if (!id) return;
      const key = id.toLowerCase();
      if (seen.has(key)) return;
      seen.add(key);
      if (out.length < limit) out.push(id);
    });
    return out;
  }

  // Everyone who played, as canonical ids. Both sides together, because which
  // side someone was on is not part of the question.
  function participantsOf(match, toId) {
    const names = (match.winners || []).concat(match.losers || []);
    return names.map((n) => (toId ? toId(n) : n));
  }

  // Does this match contain all of them?
  function matchesAll(match, selectedIds, toId) {
    if (!selectedIds || selectedIds.length === 0) return true;
    const present = new Set(participantsOf(match, toId).map((id) => String(id).toLowerCase()));
    return selectedIds.every((id) => present.has(String(id).toLowerCase()));
  }

  function filter(matches, selectedIds, toId) {
    const ids = normalise(selectedIds);
    if (ids.length === 0) return (matches || []).slice();
    return (matches || []).filter((m) => matchesAll(m, ids, toId));
  }

  // For the collapsed filter heading. Joined with "+" rather than "&" or "v"
  // because these four are a group, not a fixture -- writing them as a fixture
  // would claim a partnership the search deliberately does not care about.
  function summary(labels) {
    const list = (labels || []).filter(Boolean);
    return list.length ? list.join(' + ') : null;
  }

  return { MAX, normalise, participantsOf, matchesAll, filter, summary };
});
