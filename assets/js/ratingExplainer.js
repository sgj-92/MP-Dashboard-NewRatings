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
// ONE HONESTY RULE, and it is the whole reason this copy reads as it does.
//
// Sequential-v1 compares a BLENDED actual score -- 80% game share, 20% the
// match result -- against a single expectation derived from the four ratings.
// A team can therefore match its expected game share EXACTLY and still move up,
// because the win contributes separately. Calling that "performed above
// expectation" would be false: nothing about the games beat the expectation.
//
// So the plain layer states two observable things and never blends them:
//
//   1. the game-share expectation, and what share was actually won;
//   2. the match result, said separately, as its own input.
//
// The qualitative verdict is a GAME-SHARE comparison only. The blended score,
// K and reliability stay behind "See full calculation", where the exact
// arithmetic can be checked. (Whether the expected side should itself model a
// match result is a real question about the engine -- it is item 3 of the
// parked rating-model backlog, and it is not this module's to answer.)

(function (root, factory) {
  const api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  else root.RatingExplainer = api;
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  'use strict';

  // Matches NEUTRAL_PERFORMANCE_BAND in the application. Used for the blended
  // residual in the disclosure only -- never for the plain verdict.
  const NEUTRAL_BAND = 0.05;

  // How far the actual share of games can sit from the expected share and still
  // read as "about the expected share". Three percentage points is roughly one
  // game in thirty.
  const GAME_SHARE_BAND = 3;

  // Below this the two pairings were level enough that neither was favoured.
  const CLOSE_GAP = 15;
  // Below this, favoured but only just.
  const SLIGHT_GAP = 60;

  const BLEND_NOTE = 'The match result is a separate input: your score for the rating is 80% the share of games you won and 20% the result itself.';

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
      : `You won <b>${games.mine} of ${totalGames} games (${pct(actualShare)}%)</b> ${resultClause}.`;

    // 4: the verdict. A comparison of GAME SHARE against the game-share
    // expectation, and nothing else. It deliberately says nothing about the
    // rating movement, because the movement also reflects the result.
    let verdict = null, verdictKey = null;
    if (actualShare !== null) {
      const diff = pct(actualShare) - pct(expected);
      if (diff === 0) { verdictKey = 'matched'; verdict = 'You matched the game-share expectation.'; }
      else if (Math.abs(diff) <= GAME_SHARE_BAND) { verdictKey = 'about'; verdict = 'You won about the expected share of games.'; }
      else if (diff > 0) { verdictKey = 'more'; verdict = 'You won more games than expected.'; }
      else { verdictKey = 'fewer'; verdict = 'You won fewer games than expected.'; }
    }

    // 5: the movement, stated as a fact rather than as a consequence of the
    // verdict above -- which is exactly what it is not.
    const movementLine = typeof delta === 'number'
      ? `<b>Your rating moved ${signed(delta)}.</b>`
      : null;

    const lines = [];
    if (standing) lines.push(`<b>${standing.headline}</b>`);
    lines.push(expectedLine);
    lines.push(actualLine);
    if (verdict) lines.push(`<b>${verdict}</b> The match result also contributes to the rating calculation.`);
    if (movementLine) lines.push(movementLine);

    return {
      lines,
      text: lines.join(' ').replace(/<\/?b>/g, ''),
      blendNote: BLEND_NOTE,
      standing,
      verdict,
      verdictKey,
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

  return { explain, establishment, standingOf, kText, NEUTRAL_BAND, GAME_SHARE_BAND, CLOSE_GAP, SLIGHT_GAP, BLEND_NOTE };
});
