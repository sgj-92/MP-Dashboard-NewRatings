// ===================== RATING EXPLAINER =====================
// Padel language for a rating movement the engine already computed.
//
// This module CALCULATES NOTHING. The pre-match expectation, the performance
// score actually delivered, the K applied and the movement that resulted were
// all written at the time the match was rated and are read back through
// MatchFacts. A second calculation path would be a second answer, and the one
// thing worse than an unexplained number is two explanations that disagree.
//
// What changed, and why: "Performance score 0.20 against 0.18 expected" is
// exactly right and tells a normal player nothing. The order of the sentence is
// now the order a player actually thinks in --
//
//   1. were we favoured, even, or up against it?
//   2. what were we expected to take?
//   3. what did we take, and did we win?
//   4. so: better or worse than expected, and what did that cost or earn?
//
// -- and the decimals live behind "See full calculation", not in front of it.
//
// ONE HONESTY NOTE, which the copy is built around. The engine's expectation is
// the target for a BLENDED score: 80% the share of games won, 20% the match
// result. Quoting it as "expected to win about 53% of the games" is a
// simplification the club has approved, so every sentence that quotes it also
// states the result -- "and won the match", "but lost the match" -- and the
// blend is named in a line of small print. The verdict itself is never derived
// by comparing the two percentages: it comes from the residual the engine
// recorded, so it cannot contradict the movement printed beside it.

(function (root, factory) {
  const api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  else root.RatingExplainer = api;
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  'use strict';

  // Matches NEUTRAL_PERFORMANCE_BAND in the application, so a card and its
  // explanation can never disagree about whether a performance was ordinary.
  const NEUTRAL_BAND = 0.05;

  // Below this the two pairings were level enough that neither was favoured.
  const CLOSE_GAP = 15;
  // Below this, favoured but only just.
  const SLIGHT_GAP = 60;

  const BLEND_NOTE = 'Your score blends the games you won (80%) with the match result (20%).';

  function establishment(reliability) {
    if (typeof reliability !== 'number') return null;
    const pct = reliability * 100;
    if (pct < 25) return { key: 'provisional', phrase: 'barely established yet' };
    if (pct < 50) return { key: 'developing', phrase: 'still building up evidence' };
    if (pct < 75) return { key: 'established', phrase: 'reasonably well established' };
    return { key: 'high', phrase: 'very well established' };
  }

  // The headline. Qualitative on purpose: a player knows what "underdogs"
  // means and does not know what "underdogs by 214 pts" means.
  function standingOf(preRating, oppRating) {
    if (typeof preRating !== 'number' || typeof oppRating !== 'number') return null;
    const gap = preRating - oppRating;
    const magnitude = Math.round(Math.abs(gap));
    if (Math.abs(gap) < CLOSE_GAP) {
      return { key: 'even', headline: 'Your team were expected to be competitive.', gap: magnitude };
    }
    const slight = Math.abs(gap) < SLIGHT_GAP;
    if (gap > 0) {
      return { key: slight ? 'slight-favourites' : 'favourites',
        headline: slight ? 'Your team were slight favourites.' : 'Your team were favourites.', gap: magnitude };
    }
    return { key: slight ? 'slight-underdogs' : 'underdogs',
      headline: slight ? 'Your team were slight underdogs.' : 'Your team were underdogs.', gap: magnitude };
  }

  const pct = (v) => Math.round(v * 100);
  // One rendering of K, used everywhere it is shown. To a tenth, without a
  // pointless trailing zero: 21.5 stays 21.5, 20.0 reads 20.
  const kText = (v) => String(Math.round(v * 10) / 10);
  const fmt1 = (v) => (Math.round(v * 10) / 10).toFixed(1);
  const signed = (v) => (v > 0 ? '+' : '') + fmt1(v);

  // `view`   is MatchFacts.forPlayer(...): { me, mine, theirs }
  // `result` is 'win' | 'loss' | 'draw', taken from the match record -- never
  //          inferred from the score, which production and v3 both allow to
  //          run against the winner.
  // `games`  is { mine, theirs }: the real game counts for this player's side.
  function explain(view, result, games) {
    if (!view || !view.me || !view.mine || !view.theirs) return null;
    const me = view.me;
    const expected = view.mine.expected;
    const actual = view.mine.actual;
    if (typeof expected !== 'number' || typeof actual !== 'number') return null;

    const residual = actual - expected;
    const delta = me.ratingDelta;
    const standing = standingOf(view.mine.preRating, view.theirs.preRating);
    const band = establishment(me.previousReliability);

    const totalGames = games && typeof games.mine === 'number' && typeof games.theirs === 'number'
      ? games.mine + games.theirs : null;
    const actualShare = totalGames ? games.mine / totalGames : null;

    // 2 + 3: what was asked, what was delivered, and how the match ended.
    const expectedLine = `Based on the four players' ratings, you were expected to win about <b>${pct(expected)}%</b> of the games.`;
    const resultClause = result === 'draw' ? 'and the match was not finished'
      : (result === 'win' ? 'and won the match' : 'but lost the match');
    const actualLine = actualShare === null
      ? `You ${result === 'win' ? 'won the match' : result === 'draw' ? 'did not finish the match' : 'lost the match'}.`
      : `You won <b>${pct(actualShare)}%</b> of the games ${resultClause}.`;

    // 4: the verdict, from the residual the engine recorded -- NOT from
    // comparing the two percentages above, which measure different things.
    let verdict;
    if (result === 'loss' && delta > 0) {
      verdict = residual > NEUTRAL_BAND ? 'You still exceeded expectations' : 'You still edged past expectation';
    } else if (result === 'win' && delta < 0) {
      verdict = 'You fell below expectation even so';
    } else if (residual > NEUTRAL_BAND) {
      verdict = 'You performed above expectation';
    } else if (residual < -NEUTRAL_BAND) {
      verdict = 'You performed below expectation';
    } else {
      verdict = 'You performed about as expected';
    }
    const verdictLine = typeof delta === 'number'
      ? `<b>${verdict} → ${signed(delta)} rating points.</b>`
      : `<b>${verdict}.</b>`;

    const lines = [];
    if (standing) lines.push(`<b>${standing.headline}</b>`);
    lines.push(expectedLine);
    lines.push(actualLine);
    lines.push(verdictLine);

    return {
      lines,
      text: lines.join(' ').replace(/<\/?b>/g, ''),
      blendNote: BLEND_NOTE,
      standing,
      verdict,
      expected,
      actual,
      expectedPct: pct(expected),
      actualGameSharePct: actualShare === null ? null : pct(actualShare),
      games: totalGames ? { mine: games.mine, theirs: games.theirs, total: totalGames } : null,
      residual,
      kUsed: me.kUsed,
      delta,
      reliability: me.previousReliability,
      newReliability: me.newReliability,
      band: band ? band.key : null,
      bandPhrase: band ? band.phrase : null,
      // For the disclosure only. The arithmetic is restated from the same
      // persisted numbers so a reader can check the sentence rather than take
      // it on trust -- it is not a recalculation of the rating.
      // The same K the row above it prints, to one decimal place. Two
      // different roundings of one number inside one panel is the sort of
      // detail that makes a reader doubt the rest of it.
      kText: typeof me.kUsed === 'number' ? kText(me.kUsed) : null,
      arithmetic: (typeof me.kUsed === 'number')
        ? `${kText(me.kUsed)} × (${actual.toFixed(2)} − ${expected.toFixed(2)}) = ${signed(me.kUsed * residual)}`
        : null,
    };
  }

  return { explain, establishment, standingOf, kText, NEUTRAL_BAND, CLOSE_GAP, SLIGHT_GAP, BLEND_NOTE };
});
