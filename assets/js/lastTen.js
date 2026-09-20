// ===================== LAST TEN =====================
// A form table, not a rating.
//
// The monthly League Table answers "how did September go". It cannot answer
// "who is playing well now", because a calendar month is a different length of
// time for every player: one person played eleven games in September and
// another played two. The `Form (10g)` column tried to compress the answer
// into a single percentage, which is not something you can compare across a
// club at a glance.
//
// So this builds the same league table everyone already reads -- P/W/L/D/GD/Pts
// -- over each player's OWN most recent games. Every row covers ten games, not
// thirty-one days. Two rows are directly comparable in a way that two rows of
// a monthly table are not.
//
// It is deliberately NOT scoped to the selected month. Player A's last ten may
// span June to September while player B's sit inside one week; that is the
// point, and it is why this is a separate table rather than another column.
//
// Nothing here is a new metric. Points are the league's own 3/1/0, game
// difference is the league's own, and the games are the ones already in the
// record. No rating, expectation, Reliability or tier is read or written.
//
// A player with fewer than ten games shows the games they actually have. The
// sample is never padded and the row says how long it really is -- a 4-game
// row sitting above a 10-game row on points is a fact about a short sample,
// and the reader is told rather than left to assume.

(function (root, factory) {
  const api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  else root.LastTen = api;
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  'use strict';

  const WINDOW = 10;

  // The league's own scoring. Stated once so the two tables cannot drift.
  const POINTS = { W: 3, D: 1, L: 0 };

  // Appearances are (name, date, result, games for, games against). `seq` is
  // the record's own ordering, used only to break ties between games played on
  // the same date -- several matches share a date constantly, and "the latest
  // ten" has to be a deterministic set, not whichever order an object happened
  // to iterate in.
  function sortNewestFirst(appearances) {
    return appearances.slice().sort((a, b) => {
      if (a.date !== b.date) return a.date < b.date ? 1 : -1;
      return (b.seq || 0) - (a.seq || 0);
    });
  }

  // One player's row, from their own latest `window` appearances.
  function rowFor(name, appearances, window) {
    const w = window || WINDOW;
    const taken = sortNewestFirst(appearances).slice(0, w);
    let wins = 0, losses = 0, draws = 0, gamesFor = 0, gamesAgainst = 0;
    taken.forEach((m) => {
      if (m.result === 'W') wins++;
      else if (m.result === 'L') losses++;
      else draws++;
      gamesFor += m.gamesFor || 0;
      gamesAgainst += m.gamesAgainst || 0;
    });
    const dates = taken.map((m) => m.date).sort();
    return {
      name,
      games: taken.length,
      wins, losses, draws,
      gd: gamesFor - gamesAgainst,
      gamesFor, gamesAgainst,
      points: wins * POINTS.W + draws * POINTS.D + losses * POINTS.L,
      // Everything below describes the SAMPLE, not the performance, and is
      // what stops a short row being read as a long one.
      window: w,
      short: taken.length < w,
      from: dates[0] || null,
      to: dates[dates.length - 1] || null,
      // The run itself, newest first, as W/L/D -- the one thing a points
      // total cannot show: whether the form is arriving or leaving.
      run: taken.map((m) => m.result),
    };
  }

  // Every player who appears, one row each. Players with no games are absent
  // rather than present with zeroes: a blank row is not form.
  function build(appearances, opts) {
    const w = (opts && opts.window) || WINDOW;
    const byName = {};
    (appearances || []).forEach((m) => {
      if (!m || !m.name || !m.date) return;
      (byName[m.name] = byName[m.name] || []).push(m);
    });
    return Object.keys(byName).map((n) => rowFor(n, byName[n], w));
  }

  return { WINDOW, POINTS, build, rowFor, sortNewestFirst };
});
