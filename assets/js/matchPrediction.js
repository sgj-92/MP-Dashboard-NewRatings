// ===================== MATCH PREDICTION =====================
// What the current ratings expect from a matchup that has not been played.
//
// This exists because the prediction is about to be shown in two places --
// Admin's Predict a Matchup, and an agreed game sitting in Upcoming -- and two
// places showing a prediction is exactly how a club ends up with two
// predictions. The screens differ; the answer must not. So the answer lives
// here, once, and both screens render what this returns.
//
// IT PREDICTS A SHARE OF GAMES, NOT A CHANCE OF WINNING. The number is the
// engine's own expected score: the proportion of games a side is expected to
// take. It is the same figure the app has always shown as "expected to win
// about X% of the games" and the same one the rating explainer uses. No
// win-probability model has been validated for this club, so nothing here may
// ever be labelled a probability of victory.
//
// It reads ratings and nothing else. No journey event, no reliability, no
// tier, no Merit. Nothing is written: a prediction is not a record, and the
// caller is given data rather than a document.

(function (root, factory) {
  const api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  else root.MatchPrediction = api;
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  'use strict';

  // How confidently a winner may be named. A two-point gap is not a
  // prediction, and refusing to name anyone would make the card useless, so
  // the verdict scales with the gap and only a genuine level matchup declines
  // to name a side.
  const SHADE_IT = 1;    // below this, level
  const SHOULD_WIN = 15; // above this, a real call rather than a lean

  // `ratingOf(name)` is the only thing this needs from the application, which
  // keeps the module free of PLAYERS, of aliases and of the display layer.
  function build(teamA, teamB, ratingOf) {
    const a = (teamA || []).filter(Boolean);
    const b = (teamB || []).filter(Boolean);
    if (!a.length || !b.length) return { ok: false, reason: 'Both sides need at least one player.' };

    const all = a.concat(b);
    const missing = all.filter((n) => typeof ratingOf(n) !== 'number' || !isFinite(ratingOf(n)));
    if (missing.length) {
      return { ok: false, reason: `No rating for ${missing.join(', ')}.`, missing };
    }
    if (new Set(all.map((n) => String(n).toLowerCase())).size !== all.length) {
      return { ok: false, reason: 'The same name appears on both sides.' };
    }

    // A side's strength is the mean of its players, which is what the app has
    // always used for a partnership and what the engine was fitted against.
    const mean = (team) => team.reduce((s, n) => s + ratingOf(n), 0) / team.length;
    const ratingA = mean(a);
    const ratingB = mean(b);
    const gap = Math.abs(ratingA - ratingB);
    const aFavoured = ratingA > ratingB;

    // Routed through the engine rather than re-derived, so a prediction can
    // never drift from what the engine would actually expect.
    const expectedA = Engine().expectedScore(ratingA, ratingB);
    const shareA = Math.round(expectedA * 100);
    const shareB = 100 - shareA;

    return {
      ok: true,
      teamA: a.slice(), teamB: b.slice(),
      ratingA, ratingB, gap,
      aFavoured,
      shareA, shareB,
      favoured: gap < SHADE_IT ? null : (aFavoured ? a.slice() : b.slice()),
      favouredShare: aFavoured ? shareA : shareB,
      againstShare: aFavoured ? shareB : shareA,
      // How strongly the call may be put, decided once, here, so two screens
      // cannot word the same matchup differently.
      confidence: gap < SHADE_IT ? 'level' : (gap < SHOULD_WIN ? 'shade' : 'clear'),
    };
  }

  // The engine, however it was loaded. In the browser it is a global; under
  // Node the test requires it directly.
  function Engine() {
    if (typeof RatingEngine !== 'undefined') return RatingEngine;
    if (typeof globalThis !== 'undefined' && globalThis.RatingEngine) return globalThis.RatingEngine;
    return require('./ratingEngine.js');
  }

  return { SHADE_IT, SHOULD_WIN, build };
});
