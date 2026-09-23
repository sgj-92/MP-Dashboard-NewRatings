// ===================== MATCH OUTCOME =====================
// What happened in a match, asked once, of the record.
//
// A Money Padel match has THREE outcomes, not two, and the third one is the
// one every piece of code forgets. The record stores `outcome: A_WINS | DRAW`
// on the document and the bridge hands the application `isDraw` beside
// `winners` and `losers`.
//
// THE TRAP, AND IT HAS CAUGHT THIS CODEBASE MORE THAN ONCE. On a draw,
// `winners` and `losers` still hold the two sides -- they have to, because a
// match has two sides whatever the result -- but they mean nothing. The
// record says so itself: every drawn document carries
// `drawSideAssignmentArbitrary: true`. So `winners.includes(name)` answers
// "was this player filed on side A", which on a draw is a coin toss, and any
// code shaped like `won ? 'win' : 'loss'` turns that coin toss into a result
// and tells somebody they lost a game they drew.
//
// NEVER INFER A DRAW FROM THE SCORES. A Money Padel draw is usually an
// unfinished match -- injury, or the court time ran out -- so its sets can
// look like anything at all: 6-0 5-7, or 7-6 6-6, or two completed sets one
// each. Scores that look drawn may be a win, and scores that look won are
// regularly a draw. The recorded outcome is authoritative and is the only
// thing this module reads.

(function (root, factory) {
  const api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  else root.MatchOutcome = api;
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  'use strict';

  const WIN = 'win';
  const LOSS = 'loss';
  const DRAW = 'draw';

  // The one question. `isDraw` is the flag the bridge derives from the stored
  // `outcome`; `outcome === 'DRAW'` is the stored document itself, accepted
  // too so a caller holding a raw record does not have to convert it first.
  function isDraw(match) {
    if (!match) return false;
    if (match.isDraw === true) return true;
    return match.outcome === 'DRAW';
  }

  // A player's result, or null if they were not in the match. Draw is checked
  // FIRST, before anything looks at which side they were filed on.
  function outcomeFor(match, name) {
    if (!match) return null;
    const winners = match.winners || [];
    const losers = match.losers || [];
    const inMatch = winners.includes(name) || losers.includes(name);
    if (!inMatch) return null;
    if (isDraw(match)) return DRAW;
    return winners.includes(name) ? WIN : LOSS;
  }

  // The two sides from one player's point of view. `theirs` is the opposition
  // whatever the result -- a drawn match still has an opposing pair.
  function sidesFor(match, name) {
    const winners = (match.winners || []).slice();
    const losers = (match.losers || []).slice();
    const onWinnersSide = winners.includes(name);
    return {
      mine: onWinnersSide ? winners : losers,
      theirs: onWinnersSide ? losers : winners,
      partner: (onWinnersSide ? winners : losers).filter((n) => n !== name)[0] || null,
      outcome: outcomeFor(match, name),
    };
  }

  const W = 'W', D = 'D', L = 'L';
  function letterFor(match, name) {
    const o = outcomeFor(match, name);
    return o === WIN ? W : (o === DRAW ? D : (o === LOSS ? L : null));
  }

  // A match in one line, in the club's words.
  //
  //   decided : "A & B def C & D"     -- the WINNING side first, always
  //   draw    : "A & B drew with C & D"
  //
  // `perspective`, when given, puts that player's side first for a draw --
  // where there is no winner to lead with, the reader's own side is the
  // sensible thing to read first. It never reorders a decided match: a loss
  // still reads with the winner first, which is what the brief asks for and
  // what stops "X def Y" ever being written the wrong way round.
  function describe(match, opts) {
    const o = opts || {};
    const fmt = o.format || ((names) => names.join(' & '));
    const winners = match.winners || [];
    const losers = match.losers || [];
    if (!isDraw(match)) return `${fmt(winners)} def ${fmt(losers)}`;
    const first = (o.perspective && losers.includes(o.perspective)) ? losers : winners;
    const second = first === winners ? losers : winners;
    return `${fmt(first)} drew with ${fmt(second)}`;
  }

  // W/D/L over a list, from one player's point of view. The third counter is
  // the whole reason this exists: a tally built as `wins` and
  // `total - wins` cannot represent a draw and will file it as a loss.
  function tally(matches, name) {
    const out = { wins: 0, draws: 0, losses: 0, played: 0 };
    (matches || []).forEach((m) => {
      const o = outcomeFor(m, name);
      if (o === null) return;
      out.played++;
      if (o === WIN) out.wins++;
      else if (o === DRAW) out.draws++;
      else out.losses++;
    });
    return out;
  }

  return { WIN, LOSS, DRAW, W, D, L, isDraw, outcomeFor, sidesFor, letterFor, describe, tally };
});
