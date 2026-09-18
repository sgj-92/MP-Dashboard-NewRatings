// ===================== RATING EXPLAINER =====================
// Plain English for a rating movement the engine already computed.
//
// This module CALCULATES NOTHING. Every number it speaks about was written at
// the time the match was rated and is read back through MatchFacts: the
// pre-match expected score, the performance score actually delivered, the K
// that was applied, and the movement that resulted. A second calculation path
// would be a second answer, and the one thing worse than an unexplained number
// is two explanations that disagree.
//
// What it is FOR: the three complaints the guide exists to pre-empt.
//
//   "I won -- why did I only get +1?"   because K falls as evidence builds,
//                                        and because winning as a favourite is
//                                        what was already expected.
//   "I lost -- why did I go up?"        because the rating tracks performance
//                                        against expectation, not the result.
//   "Why did my partner move more?"     because K is per-player.
//
// The sentences are deliberately built from the same three facts every time --
// what was expected, what was delivered, and how established the rating was --
// so a player who reads two of them can see the pattern rather than a series of
// unrelated excuses.

(function (root, factory) {
  const api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  else root.RatingExplainer = api;
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  'use strict';

  // Inside this band, a side performed to expectation rather than above or
  // below it. It is the band the match cards already use, kept identical so
  // the sentence and the label above it can never contradict each other.
  const NEUTRAL_BAND = 0.03;

  // Reliability bands, as the profile and v3Bridge use them.
  function establishment(reliability) {
    if (typeof reliability !== 'number') return null;
    const pct = reliability * 100;
    if (pct < 25) return { key: 'provisional', phrase: 'barely established yet' };
    if (pct < 50) return { key: 'developing', phrase: 'still building up evidence' };
    if (pct < 75) return { key: 'established', phrase: 'reasonably well established' };
    return { key: 'high', phrase: 'very well established' };
  }

  // The gap must be described exactly as the match card above it describes it,
  // or the two disagree by a point and the explanation looks like a different
  // calculation. The card rounds the MAGNITUDE (Math.round(Math.abs(gap))) and
  // tests the unrounded value against the band, so this does the same:
  // Math.round(-28.5) is -28 while Math.round(28.5) is 29, which is precisely
  // how "underdogs by 28" ended up under "underdogs by 29 pts going in".
  const CLOSE_GAP = 15;
  function expectationPhrase(preRating, oppRating) {
    if (typeof preRating !== 'number' || typeof oppRating !== 'number') return null;
    const gap = preRating - oppRating;
    const magnitude = Math.round(Math.abs(gap));
    if (Math.abs(gap) < CLOSE_GAP) return `evenly matched (${magnitude} pts between the pairings)`;
    return gap > 0 ? `favourites by ${magnitude} pts` : `underdogs by ${magnitude} pts`;
  }

  const fmt1 = (v) => (Math.round(v * 10) / 10).toFixed(1);
  const signed = (v) => (v > 0 ? '+' : '') + fmt1(v);

  // `view` is MatchFacts.forPlayer(...): { me, mine, theirs }.
  // `result` is 'win' | 'loss' | 'draw', which comes from the match record and
  // is never inferred from the score.
  function explain(view, result) {
    if (!view || !view.me || !view.mine || !view.theirs) return null;
    const me = view.me;
    const expected = view.mine.expected;
    const actual = view.mine.actual;
    if (typeof expected !== 'number' || typeof actual !== 'number') return null;

    const residual = actual - expected;
    const delta = me.ratingDelta;
    const band = establishment(me.previousReliability);
    const standing = expectationPhrase(view.mine.preRating, view.theirs.preRating);

    const parts = [];

    // 1. Where the pairing stood going in, and what that asked of them.
    if (standing) parts.push(`You went in as ${standing}, so the engine expected ${fmt1(expected * 100)}%.`);
    else parts.push(`The engine expected ${fmt1(expected * 100)}% of you going in.`);

    // 2. What was actually delivered, against that.
    if (residual > NEUTRAL_BAND) {
      parts.push(`You delivered ${fmt1(actual * 100)}% — better than expected.`);
    } else if (residual < -NEUTRAL_BAND) {
      parts.push(`You delivered ${fmt1(actual * 100)}% — short of that.`);
    } else {
      parts.push(`You delivered ${fmt1(actual * 100)}% — almost exactly as expected.`);
    }

    // 3. How far one result can move this player at all. K is the answer to
    //    "why so little", so it is named and its size is described in the same
    //    breath as the evidence that set it. The pace language is decided from
    //    K itself rather than from the movement, so it can never contradict
    //    the sentence that follows.
    if (typeof me.kUsed === 'number') {
      const k = Math.round(me.kUsed);
      const pace = k >= 25 ? 'a long way' : (k >= 15 ? 'at a moderate pace' : 'slowly');
      parts.push(band
        ? `Your rating is ${band.phrase}, so one result moves it ${pace} (K ${k}).`
        : `One result moves your rating ${pace} (K ${k}).`);
    }

    // 4. The movement, explained by the two facts above rather than restated.
    //    The first two branches are the ones players write in about.
    if (typeof delta === 'number') {
      const expectedOutcome = Math.abs(residual) <= NEUTRAL_BAND;
      if (result === 'loss' && delta > 0) {
        parts.push(`You lost the match and your rating still went up, by ${signed(delta)}: it follows how you played against expectation, not who won.`);
      } else if (result === 'win' && delta < 0) {
        parts.push(`You won and your rating still went down, by ${signed(delta)}: less was delivered than the pairing was expected to deliver.`);
      } else if (result === 'win' && expectedOutcome) {
        parts.push(`Winning roughly as expected tells the engine nothing it did not already believe, so the move is small: ${signed(delta)}.`);
      } else if (delta === 0) {
        parts.push('The result matched the expectation closely enough to move nothing at all.');
      } else {
        parts.push(`That comes to ${signed(delta)}.`);
      }
    }

    return {
      text: parts.join(' '),
      parts,
      expected,
      actual,
      residual,
      kUsed: me.kUsed,
      delta,
      reliability: me.previousReliability,
      band: band ? band.key : null,
      // The arithmetic, restated from the same persisted numbers so a reader can
      // check the sentence rather than take it on trust. NOT a recalculation of
      // the rating: the movement shown is the stored one.
      arithmetic: (typeof me.kUsed === 'number')
        ? `${Math.round(me.kUsed)} × (${actual.toFixed(2)} − ${expected.toFixed(2)}) = ${signed(me.kUsed * residual)}`
        : null,
    };
  }

  return { explain, establishment, expectationPhrase, NEUTRAL_BAND, CLOSE_GAP };
});
