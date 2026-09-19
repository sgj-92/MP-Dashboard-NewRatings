// ===================== LAST RESULT =====================
// One line about a player's most recent rated match, chosen deterministically
// from facts the engine already recorded.
//
// The bar this has to clear: it is the only place in the app that says anything
// resembling an opinion, on the Home screen, to the person it is about. So it
// is built from result, scoreline, the persisted pre-match expectation, the
// share of games actually won and the stored rating movement -- and nothing
// else. No psychology, no trash talk, no claim about how anyone played beyond
// what the numbers say, and no new arithmetic: every input is read back.
//
// Deterministic on purpose. The same match always produces the same line, so
// nobody sees their result described two different ways on two visits.

(function (root, factory) {
  const api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  else root.LastResult = api;
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  'use strict';

  // A win in which the loser took a real share of the games.
  const TIGHT_SHARE = 0.58;
  // A defeat in which very little was taken.
  const HEAVY_SHARE = 0.30;
  // The rating gap at which a side genuinely went in as favourites, matching
  // the band the match cards use.
  const CLEAR_FAVOURITE_GAP = 15;

  const LINES = {
    DRAW: 'Nothing between you. One to run back.',
    UPSET_WIN: 'Statement win. You beat a side that went in as favourites.',
    TIGHT_WIN: 'Got it done. Tight match, but you came through.',
    ROUTINE_WIN: 'Job done. That one went to form.',
    BETTER_THAN_SCORELINE: 'Better than the scoreline suggests.',
    HEAVY_LOSS: 'Tough one. Time to run it back.',
    LOSS: 'Not your day. On to the next.',
  };

  // `facts` is everything already stored about the player's side of the match:
  //   result       'win' | 'loss' | 'draw'   from the record, never inferred
  //   gameShare    their side's share of games, 0..1
  //   expected     the persisted pre-match expected score, 0..1
  //   ratingGap    their pairing's rating minus the opposition's, going in
  function commentaryKeyFor(facts) {
    if (!facts || !facts.result) return null;
    const { result, gameShare, expected, ratingGap } = facts;

    if (result === 'draw') return 'DRAW';

    if (result === 'win') {
      // Underdogs by a real margin, and they won.
      if (typeof ratingGap === 'number' && ratingGap <= -CLEAR_FAVOURITE_GAP) return 'UPSET_WIN';
      if (typeof gameShare === 'number' && gameShare < TIGHT_SHARE) return 'TIGHT_WIN';
      return 'ROUTINE_WIN';
    }

    // A defeat in which more of the games were taken than the expectation
    // implied is a genuinely different result from a defeat in which fewer
    // were, and saying so is the one useful thing to say about it.
    if (typeof gameShare === 'number' && typeof expected === 'number' && gameShare > expected) {
      return 'BETTER_THAN_SCORELINE';
    }
    if (typeof gameShare === 'number' && gameShare <= HEAVY_SHARE) return 'HEAVY_LOSS';
    return 'LOSS';
  }

  function commentaryFor(facts) {
    const key = commentaryKeyFor(facts);
    return key ? LINES[key] : null;
  }

  // The most recent rated match for a player. `matches` is [{ id, date, players }]
  // -- the v3 rated set, draws included. Ties on a date are broken by the id's
  // own same-date sequence, which is the order the engine rated them in, so the
  // answer is stable rather than dependent on retrieval order.
  function mostRecent(matches, name) {
    const mine = (matches || []).filter((m) => m && m.players && m.players.indexOf(name) !== -1);
    if (!mine.length) return null;
    return mine.slice().sort((a, b) => {
      if (a.date !== b.date) return a.date < b.date ? 1 : -1;
      return String(b.id).localeCompare(String(a.id));
    })[0];
  }

  return { LINES, commentaryKeyFor, commentaryFor, mostRecent, TIGHT_SHARE, HEAVY_SHARE, CLEAR_FAVOURITE_GAP };
});
