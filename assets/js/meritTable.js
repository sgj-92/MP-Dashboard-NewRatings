// ===================== MERIT TABLE =====================
// An alternative league table. Not a rating, and not a replacement.
//
// The League Table treats every win the same. Merit asks a different question:
// HOW HARD WAS THE PARTNERSHIP YOU BEAT? A win in an even fixture is the
// baseline; beating a stronger pairing earns more, beating a weaker one earns
// less. It exists because some players routinely take the harder fixture and a
// points column cannot see that.
//
// WHAT IT IS NOT. Merit Points touch nothing the engine owns -- not Power
// Rating, ratingJourney, reliability, reassessment, expected game share, tier,
// or the outcome of any match. Nothing here reads a rating or an expectation;
// the only inputs are who played, who won, and what tier each player held ON
// THE DAY. They are derived on demand from canonical matches plus the
// canonical historical-tier resolver, never persisted, so there is no second
// source of truth to fall out of step.
//
// THE ONE RULE THAT IS EASY TO GET WRONG. A partnership's strength is the SUM
// of both players' tier levels, not its best player. `AC` and `BB` are equal
// strength (3+1 = 2+2), and a table built by comparing the strongest player on
// each side would call that a mismatch and be wrong about a large share of the
// club's games.

(function (root, factory) {
  const api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  else root.MeritTable = api;
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  'use strict';

  // Tier levels. Only the SPACING matters -- every step is one step, so the
  // difference between two partnership sums counts tier-steps directly. These
  // are deliberately not the engine's TIER_SEED ratings: Merit is a count of
  // steps, not a distance in rating points, and borrowing the seeds would tie
  // this table to the engine it must stay clear of.
  const TIER_LEVEL = { S: 4, A: 3, B: 2, C: 1 };

  // An even matchup is worth this for a win.
  const BASELINE = 4;
  const DRAW_POINTS = 1;
  const LOSS_POINTS = 0;

  const levelOf = (tier) => (Object.prototype.hasOwnProperty.call(TIER_LEVEL, tier) ? TIER_LEVEL[tier] : null);

  // The sum of a side's tier levels. `null` if any player's tier is unknown at
  // that date -- a partial sum would silently understate the side and hand out
  // points nobody earned.
  function strengthOf(tiers) {
    if (!tiers || !tiers.length) return null;
    let total = 0;
    for (const t of tiers) {
      const lv = levelOf(t);
      if (lv === null) return null;
      total += lv;
    }
    return total;
  }

  // Merit for the winning side of one match.
  //
  //   even            -> 4
  //   favourite wins  -> 4 - steps
  //   underdog wins   -> 4 + steps
  //
  // Deliberately uncapped, per the approved brief: a run of extreme matchups in
  // the history should be reported, not silently clamped into looking ordinary.
  // Note that a large enough favourite gap drives a win to zero or below, which
  // is a real answer -- see `audit()`.
  function winPoints(winnerStrength, loserStrength) {
    if (winnerStrength === null || loserStrength === null) return null;
    const steps = Math.abs(winnerStrength - loserStrength);
    return winnerStrength > loserStrength ? BASELINE - steps : BASELINE + steps;
  }

  // What one match is worth to everyone in it.
  //
  // `match` is { winners, losers, isDraw, date }, the shape the application
  // already uses; `tierAt(name, date)` is the canonical historical resolver.
  // Both teammates always receive the same points -- this scores the matchup,
  // not the player.
  function scoreMatch(match, tierAt) {
    if (!match) return null;
    const winners = match.winners || [];
    const losers = match.losers || [];
    if (!winners.length || !losers.length) return null;

    const tiersFor = (names) => names.map((n) => (tierAt ? tierAt(n, match.date) : null));
    const wTiers = tiersFor(winners);
    const lTiers = tiersFor(losers);
    const wStrength = strengthOf(wTiers);
    const lStrength = strengthOf(lTiers);

    // A match nobody can be tiered for is skipped rather than guessed at.
    if (wStrength === null || lStrength === null) {
      return { unresolved: true, date: match.date, id: match.id || null,
        winners, losers, winnerTiers: wTiers, loserTiers: lTiers };
    }

    const steps = Math.abs(wStrength - lStrength);
    // A draw has no winner, so "winners"/"losers" are just the two sides and
    // both get the same point whatever the gap.
    if (match.isDraw) {
      return {
        unresolved: false, isDraw: true, date: match.date, id: match.id || null,
        steps, winnerStrength: wStrength, loserStrength: lStrength,
        points: Object.fromEntries([...winners, ...losers].map((n) => [n, DRAW_POINTS])),
        winnerTiers: wTiers, loserTiers: lTiers,
      };
    }

    const wp = winPoints(wStrength, lStrength);
    return {
      unresolved: false, isDraw: false, date: match.date, id: match.id || null,
      steps,
      winnerStrength: wStrength, loserStrength: lStrength,
      winnerWasFavourite: wStrength > lStrength,
      winPoints: wp,
      points: Object.fromEntries(
        winners.map((n) => [n, wp]).concat(losers.map((n) => [n, LOSS_POINTS]))),
      winnerTiers: wTiers, loserTiers: lTiers,
    };
  }

  // The table. One row per player who appears in the given matches.
  //
  // `tierForRow(name, date)` decides which tier SECTION a player's row belongs
  // to, which is a separate question from the tiers used to score a match --
  // the split-month treatment files each match under the tier held on its own
  // date, so a player who moved mid-month appears in both sections holding only
  // what they earned in each. Pass it to split; leave it out for one table.
  function build(matches, tierAt, opts) {
    const options = opts || {};
    const rows = {};
    const unresolved = [];

    (matches || []).forEach((m) => {
      const scored = scoreMatch(m, tierAt);
      if (!scored) return;
      if (scored.unresolved) { unresolved.push(scored); return; }

      const add = (name, points, won, lost, drew) => {
        const section = options.tierForRow ? options.tierForRow(name, m.date) : null;
        const key = options.tierForRow ? `${name}\u0000${section || ''}` : name;
        const row = rows[key] || (rows[key] = {
          playerId: name, tier: section,
          played: 0, wins: 0, losses: 0, draws: 0, merit: 0,
          // How the total was earned, which is the whole point of the table:
          // 12 points off three hard wins is a different story from 12 off
          // four easy ones.
          hardWins: 0, evenWins: 0, easyWins: 0, bestWin: null,
        });
        row.played++;
        row.merit += points;
        if (won) {
          row.wins++;
          if (scored.steps === 0) row.evenWins++;
          else if (scored.winnerWasFavourite) row.easyWins++;
          else row.hardWins++;
          if (row.bestWin === null || points > row.bestWin) row.bestWin = points;
        }
        if (lost) row.losses++;
        if (drew) row.draws++;
      };

      if (scored.isDraw) {
        [...(m.winners || []), ...(m.losers || [])].forEach((n) => add(n, DRAW_POINTS, false, false, true));
      } else {
        (m.winners || []).forEach((n) => add(n, scored.winPoints, true, false, false));
        (m.losers || []).forEach((n) => add(n, LOSS_POINTS, false, true, false));
      }
    });

    const table = Object.values(rows).sort((a, b) =>
      b.merit - a.merit
      || b.hardWins - a.hardWins
      || b.wins - a.wins
      || a.played - b.played          // the same total off fewer games ranks higher
      || a.playerId.localeCompare(b.playerId));
    return { table, unresolved };
  }

  // What the history actually contains, for the pre-release audit the brief
  // asks for: every distinct tier-step gap, and any match where the formula
  // produces something outside the 1..7 the examples describe.
  function audit(matches, tierAt) {
    const steps = {};
    const extremes = [];
    const unresolved = [];
    let draws = 0, decided = 0, singles = 0;

    (matches || []).forEach((m) => {
      const scored = scoreMatch(m, tierAt);
      if (!scored) return;
      if (scored.unresolved) { unresolved.push(scored); return; }
      if ((m.winners || []).length === 1 || (m.losers || []).length === 1) singles++;
      steps[scored.steps] = (steps[scored.steps] || 0) + 1;
      if (scored.isDraw) { draws++; return; }
      decided++;
      if (scored.winPoints < 1 || scored.winPoints > 7) {
        extremes.push({
          id: scored.id, date: scored.date, steps: scored.steps, winPoints: scored.winPoints,
          winners: m.winners, winnerTiers: scored.winnerTiers,
          losers: m.losers, loserTiers: scored.loserTiers,
        });
      }
    });

    return {
      matches: decided + draws, decided, draws, singles,
      stepHistogram: steps,
      maxSteps: Object.keys(steps).length ? Math.max(...Object.keys(steps).map(Number)) : null,
      extremes, unresolved,
    };
  }

  return {
    TIER_LEVEL, BASELINE, DRAW_POINTS, LOSS_POINTS,
    levelOf, strengthOf, winPoints, scoreMatch, build, audit,
  };
});
