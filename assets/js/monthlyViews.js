// ===================== MONTHLY VIEWS =====================
// The four monthly stories, all derived from the real chronological
// Sequential-v1 trajectory recorded in ratingJourney. There is NO monthly
// rating solver here and there must never be one: a month's rating is simply
// where the one continuous Power Rating stood at that month's boundaries.
//
//   Monthly Performance  who most exceeded their pre-match expectation
//   Rating Movement      real Power Rating at month start -> month end
//   Ranking Movement     overall and within-tier rank at those same boundaries
//   League Table         results/points — computed elsewhere, untouched here
//
// READ COST. This walks the whole journey once, because a rank at a month
// boundary needs every player's rating at that instant, including players who
// did not play that month. It is therefore loaded lazily, only when a monthly
// view is opened, and cached for the session. Ordinary player rendering still
// reads the compact `players` collection and never comes near this.

(function (root, factory) {
  const api = factory(typeof require === 'function' ? require('./ratingEngine.js') : root.RatingEngine);
  if (typeof module === 'object' && module.exports) module.exports = api;
  else root.MonthlyViews = api;
})(typeof globalThis !== 'undefined' ? globalThis : this, function (Engine) {
  'use strict';

  const monthOf = (date) => date.slice(0, 7);

  function chronological(events) {
    return [...events].sort((a, b) => {
      if (a.effectiveDate !== b.effectiveDate) return a.effectiveDate < b.effectiveDate ? -1 : 1;
      // Initialisation precedes play on the same day; everything else keeps
      // the order the engine produced.
      const rank = (e) => (e.eventType === Engine.EVENT.PLAYER_INITIALISED ? 0 : 1);
      return rank(a) - rank(b);
    });
  }

  // The rating an event leaves a player on. A tier change leaves it unmoved.
  function ratingAfter(event) {
    if (event.eventType === Engine.EVENT.MATCH_UPDATE) return event.postMatchRating;
    return event.newPowerRating;
  }

  // Walks the journey once and snapshots every player's rating at the close of
  // each month. A month's opening snapshot is the previous month's close.
  function buildSnapshots(events) {
    const ordered = chronological(events);
    const months = [...new Set(ordered.map((e) => monthOf(e.effectiveDate)))].sort();
    const current = {};
    const closing = {};
    let i = 0;
    months.forEach((month) => {
      while (i < ordered.length && monthOf(ordered[i].effectiveDate) <= month) {
        const e = ordered[i];
        const after = ratingAfter(e);
        if (typeof after === 'number') current[e.playerId] = after;
        i++;
      }
      closing[month] = { ...current };
    });
    return { months, closing };
  }

  function rank(ratings, tierOf, playerId) {
    const names = Object.keys(ratings);
    const sorted = [...names].sort((a, b) => ratings[b] - ratings[a]);
    const overall = sorted.indexOf(playerId) + 1;
    const tier = tierOf ? tierOf(playerId) : null;
    const inTier = tier ? sorted.filter((n) => tierOf(n) === tier) : [];
    return { overall, inTier: tier ? inTier.indexOf(playerId) + 1 : null, tier: tier, tierSize: inTier.length };
  }

  // tierAsOf(playerId, date) -> tier in force at that date. Rank within tier
  // uses the tier that applied AT the boundary, never today's.
  function build(events, { tierAsOf } = {}) {
    const { months, closing } = buildSnapshots(events);
    const perf = Engine.calculateMonthlyPerformance(events);
    const byMonth = {};

    months.forEach((month, idx) => {
      const openRatings = idx === 0 ? {} : closing[months[idx - 1]];
      const closeRatings = closing[month];
      const lastDay = month + '-31';
      const firstDay = month + '-01';
      const tierOpen = tierAsOf ? (n) => tierAsOf(n, firstDay) : null;
      const tierClose = tierAsOf ? (n) => tierAsOf(n, lastDay) : null;

      // Only players who actually played are given a movement row; a player
      // who sat the month out has no story to tell.
      const played = {};
      events.filter((e) => e.eventType === Engine.EVENT.MATCH_UPDATE && monthOf(e.effectiveDate) === month)
        .forEach((e) => {
          played[e.playerId] = played[e.playerId] || { matches: 0, first: e, last: e };
          played[e.playerId].matches++;
          played[e.playerId].last = e;
        });

      // A club reassessment moves a rating without a ball being hit. Rolled up
      // separately so no screen can present it as a month's play. Until the
      // first decision is recorded this is 0 for everyone, which is why the
      // distinction only became reachable when the write path shipped.
      const decided = {};
      events.filter((e) => e.eventType === Engine.EVENT.CLUB_RATING_REASSESSMENT
        && monthOf(e.effectiveDate) === month
        && typeof e.previousPowerRating === 'number' && typeof e.newPowerRating === 'number')
        .forEach((e) => {
          decided[e.playerId] = (decided[e.playerId] || 0) + (e.newPowerRating - e.previousPowerRating);
        });
      const decidedFor = (name) => Math.round((decided[name] || 0) * 10) / 10;

      const rows = Object.keys(played).sort().map((name) => {
        const p = played[name];
        // Month start is the previous close where it exists; for a player who
        // entered this month it is the rating they carried into their first
        // match, which is exactly that match's preMatchRating.
        const start = openRatings[name] !== undefined ? openRatings[name] : p.first.preMatchRating;
        const end = closeRatings[name];
        const perfRow = perf.find((x) => x.playerId === name && x.month === month);
        const rOpen = openRatings[name] !== undefined && tierOpen ? rank(openRatings, tierOpen, name) : null;
        const rClose = tierClose ? rank(closeRatings, tierClose, name) : null;
        // A player who changed tier during the month has no comparable
        // within-tier rank: their opening rank was measured against a different
        // field. Report the change as unavailable rather than subtracting a
        // rank in one tier from a rank in another.
        const tierChanged = !!(rOpen && rClose && rOpen.tier !== rClose.tier);
        return {
          playerId: name,
          month,
          matches: p.matches,
          played: true,
          startRating: start,
          endRating: end,
          ratingChange: Math.round((end - start) * 10) / 10,
          // Of that change, how much came from a club decision rather than play.
          reassessmentChange: decidedFor(name),
          startRankOverall: rOpen ? rOpen.overall : null,
          endRankOverall: rClose ? rClose.overall : null,
          rankChangeOverall: rOpen && rClose ? rOpen.overall - rClose.overall : null,
          startRankInTier: rOpen ? rOpen.inTier : null,
          endRankInTier: rClose ? rClose.inTier : null,
          rankChangeInTier: (rOpen && rClose && !tierChanged) ? rOpen.inTier - rClose.inTier : null,
          tierChanged: tierChanged,
          tierAtMonthStart: rOpen ? rOpen.tier : null,
          tierAtMonthEnd: rClose ? rClose.tier : null,
          monthlyPerformance: perfRow ? perfRow.monthlyPerformance : null,
          performancePct: perfRow ? perfRow.displayPct : null,
          tableEligible: perfRow ? perfRow.tableEligible : false,
          podiumEligible: perfRow ? perfRow.podiumEligible : false,
          provisional: perfRow ? perfRow.provisional : true,
        };
      });

      // A player who sat the month out still has a boundary story: their rating
      // did not move (unless the club reassessed them) but their rank can, and
      // does, because others moved around them.
      const inactiveRows = Object.keys(closeRatings)
        .filter((n) => !played[n] && openRatings[n] !== undefined)
        .sort()
        .map((name) => {
          const rOpen = tierOpen ? rank(openRatings, tierOpen, name) : null;
          const rClose = tierClose ? rank(closeRatings, tierClose, name) : null;
          const tierChanged = !!(rOpen && rClose && rOpen.tier !== rClose.tier);
          return {
            playerId: name, month, matches: 0, played: false,
            startRating: openRatings[name],
            endRating: closeRatings[name],
            ratingChange: Math.round((closeRatings[name] - openRatings[name]) * 10) / 10,
            // An inactive player's rating can still move, but only this way.
            reassessmentChange: decidedFor(name),
            startRankOverall: rOpen ? rOpen.overall : null,
            endRankOverall: rClose ? rClose.overall : null,
            rankChangeOverall: rOpen && rClose ? rOpen.overall - rClose.overall : null,
            startRankInTier: rOpen ? rOpen.inTier : null,
            endRankInTier: rClose ? rClose.inTier : null,
            rankChangeInTier: (rOpen && rClose && !tierChanged) ? rOpen.inTier - rClose.inTier : null,
            tierChanged: tierChanged,
            tierAtMonthStart: rOpen ? rOpen.tier : null,
            tierAtMonthEnd: rClose ? rClose.tier : null,
            monthlyPerformance: null, performancePct: null,
            tableEligible: false, podiumEligible: false, provisional: true,
          };
        });

      byMonth[month] = {
        month,
        rows,
        inactiveRows,
        closingRatings: closeRatings,
        crossovers: crossovers(openRatings, closeRatings),
      };
    });

    return { months, byMonth, closing };
  }

  // Pairs who swapped places over the month — the readable part of rank
  // movement. Only pairs where both played to a rating in both snapshots.
  function crossovers(openRatings, closeRatings) {
    const names = Object.keys(closeRatings).filter((n) => openRatings[n] !== undefined);
    const out = [];
    for (let i = 0; i < names.length; i++) {
      for (let j = i + 1; j < names.length; j++) {
        const a = names[i], b = names[j];
        const before = openRatings[a] - openRatings[b];
        const after = closeRatings[a] - closeRatings[b];
        if (before < 0 && after > 0) out.push({ overtook: a, overtaken: b });
        else if (before > 0 && after < 0) out.push({ overtook: b, overtaken: a });
      }
    }
    return out;
  }

  // Drop-in replacement for the retired legacy computeMonthlyRating(month):
  // same name -> rating shape, but these are real Power Ratings as they stood
  // at that month's close, not a separately solved monthly number.
  function monthEndRatings(views, month) {
    const m = views.byMonth[month];
    return m ? { ...m.closingRatings } : {};
  }

  // The movement row for one player in one month, whether or not they played.
  function playerMonth(views, month, playerId) {
    const m = views.byMonth[month];
    if (!m) return null;
    return m.rows.find((r) => r.playerId === playerId)
        || m.inactiveRows.find((r) => r.playerId === playerId)
        || null;
  }

  function performanceTable(views, month, { minMatches = 3 } = {}) {
    const m = views.byMonth[month];
    if (!m) return [];
    return m.rows.filter((r) => r.matches >= minMatches && r.monthlyPerformance !== null)
      .sort((a, b) => b.monthlyPerformance - a.monthlyPerformance);
  }

  function ratingMovementTable(views, month) {
    const m = views.byMonth[month];
    if (!m) return [];
    return [...m.rows].sort((a, b) => b.ratingChange - a.ratingChange);
  }

  return { build, buildSnapshots, monthEndRatings, performanceTable, ratingMovementTable, playerMonth, crossovers, monthOf };
});
