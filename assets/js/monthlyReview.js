// ===================== MONTHLY REVIEW =====================
// A tier change and its rating consequence are one board decision, recorded as
// separate events.
//
// A promotion moves no points by itself. That is the engine rule and it does
// not change. What changes here is that the board may no longer WALK AWAY from
// a tier change without saying what should happen to the rating. Silence was
// the problem: a promotion recorded with no rating decision looks complete,
// and three months later somebody wants to backdate a reassessment to the
// review that never finished. Every tier change now carries one of four
// explicit answers, including "keep the current rating", which is a decision
// and is recorded as one.
//
// The second rule here is about fairness between players reviewed together.
// A statistical recommendation is drawn from where everyone stood BEFORE the
// review began -- never from a state that already contains another player's
// accepted decision. Otherwise the order the board happened to click in would
// change what player B is offered, and two boards reviewing the same people on
// the same day would get different answers.
//
// This module decides shape and refuses incomplete reviews. It performs no
// I/O; ClubDecision prepares and writes what it returns.

(function (root, factory) {
  const api = factory(
    typeof require === 'function' ? require('./ratingEngine.js') : root.RatingEngine,
    typeof require === 'function' ? require('./reassessment.js') : root.Reassessment,
    typeof require === 'function' ? require('./journeyView.js') : root.JourneyView
  );
  if (typeof module === 'object' && module.exports) module.exports = api;
  else root.MonthlyReview = api;
})(typeof globalThis !== 'undefined' ? globalThis : this, function (Engine, Reassessment, JourneyView) {
  'use strict';

  const DECISION = {
    ACCEPT_RECOMMENDATION: 'ACCEPT_RECOMMENDATION',
    CLUB_OVERRIDE: 'CLUB_OVERRIDE',
    KEEP_CURRENT_RATING: 'KEEP_CURRENT_RATING',
    CORRECT_INITIAL_CLASSIFICATION: 'CORRECT_INITIAL_CLASSIFICATION',
  };

  const DECISION_LABEL = {
    ACCEPT_RECOMMENDATION: 'Accept the statistical recommendation',
    CLUB_OVERRIDE: 'Club override',
    KEEP_CURRENT_RATING: 'Keep the current rating',
    CORRECT_INITIAL_CLASSIFICATION: 'Correct the initial classification',
  };

  const TIER_MOVE = {
    PROMOTION: Engine.EVENT.PROMOTION,
    DEMOTION: Engine.EVENT.DEMOTION,
    TIER_RETAINED: Engine.EVENT.TIER_RETAINED,
  };

  // Defined once in journeyView so the order the record is written in, the
  // order it is replayed in, and the order it is displayed in cannot drift
  // apart. They did: the display ordered the rating decision before the tier
  // move, and the chain of previous-to-new ratings stopped joining up.
  const SAME_DATE_ORDER = JourneyView.SAME_DATE_ORDER;
  const eventRank = JourneyView.eventRank;

  // Where every player stood immediately BEFORE the review date, read back from
  // the journey. Not re-derived: each field is the value the engine recorded on
  // that player's last event before the date.
  //
  // This is what makes two players reviewed on one day independent of each
  // other, and it is reproducible -- the same date gives the same snapshot
  // whoever runs it and whenever.
  function preReviewSnapshot(journey, effectiveDate) {
    const latest = {};
    (journey || []).forEach((e) => {
      if (!e.effectiveDate || e.effectiveDate >= effectiveDate) return;
      const prior = latest[e.playerId];
      if (!prior) { latest[e.playerId] = e; return; }
      if (e.effectiveDate > prior.effectiveDate) { latest[e.playerId] = e; return; }
      if (e.effectiveDate === prior.effectiveDate) {
        // Same day: the later event in canonical order wins, and a match update
        // is always the last thing that happens on a day.
        const rankA = e.eventType === Engine.EVENT.MATCH_UPDATE ? 99 : eventRank(e.eventType);
        const rankB = prior.eventType === Engine.EVENT.MATCH_UPDATE ? 99 : eventRank(prior.eventType);
        if (rankA >= rankB) latest[e.playerId] = e;
      }
    });

    // A match update carries no classification status, so the last one that did
    // is what still applies. Reading it off the latest event alone would report
    // every player as unclassified and quietly disable the
    // initial-classification path for everybody.
    const lastStatus = {};
    (journey || []).forEach((e) => {
      if (!e.effectiveDate || e.effectiveDate >= effectiveDate) return;
      if (!e.newClassificationStatus) return;
      const prior = lastStatus[e.playerId];
      if (!prior || e.effectiveDate >= prior.effectiveDate) lastStatus[e.playerId] = e;
    });

    const state = {};
    Object.entries(latest).forEach(([playerId, e]) => {
      const isMatch = e.eventType === Engine.EVENT.MATCH_UPDATE;
      const rating = isMatch ? e.postMatchRating : e.newPowerRating;
      const evidence = e.effectiveEvidenceAfter;
      if (typeof rating !== 'number' || typeof evidence !== 'number') return;
      state[playerId] = {
        rating,
        effectiveEvidence: evidence,
        lifetimeMatches: e.lifetimeMatchesAtEvent,
        tier: e.newTier || e.tierAtEvent || null,
        classificationStatus: (lastStatus[playerId] || {}).newClassificationStatus || null,
        asOfDate: e.effectiveDate,
      };
    });
    return state;
  }

  function recommendationFor(snapshot, { playerId, fromTier, toTier, eventType, params }) {
    if (!snapshot[playerId]) return { recommended: false, reason: `${playerId} has no recorded state before this date.` };
    if (!toTier || fromTier === toTier) {
      return { recommended: false, reason: 'No tier boundary is being crossed, so there is no boundary to measure against.' };
    }
    try {
      return Reassessment.getRecommendation({
        state: snapshot,
        tierOf: (n) => (snapshot[n] || {}).tier,
        subject: playerId, fromTier, toTier, eventType, params,
      });
    } catch (e) {
      return { recommended: false, reason: e.message };
    }
  }

  // The reasons a review is not finished. Returned rather than thrown so the
  // screen can show what is still missing while the board is still deciding.
  function incompleteReasons(review, snapshot) {
    const out = [];
    const s = review && review.playerId ? snapshot[review.playerId] : null;
    if (!review || !review.playerId) { out.push('No player.'); return out; }
    if (!s) out.push(`${review.playerId} has no recorded state before ${review.effectiveDate}.`);
    if (!TIER_MOVE[review.tierEvent]) out.push('Choose promote, demote, or retain.');
    if (!review.newTier) out.push('Choose which tier.');
    if (!review.ratingDecision) {
      out.push('A tier change is not recorded until the board says what happens to the rating. '
        + 'Choose accept, override, keep, or correct the initial classification.');
    }
    if (review.ratingDecision === DECISION.CLUB_OVERRIDE) {
      const noRating = review.overrideRating === null || review.overrideRating === undefined;
      const noRel = review.overrideReliability === null || review.overrideReliability === undefined;
      if (noRating && noRel) out.push('An override needs a rating, a reliability, or both.');
    }
    if (review.ratingDecision === DECISION.ACCEPT_RECOMMENDATION) {
      const rec = review.recommendation;
      if (!rec || !rec.recommended) out.push('There is no recommendation to accept. ' + ((rec && rec.reason) || ''));
    }
    if (review.ratingDecision === DECISION.CORRECT_INITIAL_CLASSIFICATION) {
      if (s && s.classificationStatus && s.classificationStatus !== 'PROVISIONAL') {
        out.push(`${review.playerId} was already established by ${review.effectiveDate}, so there is no initial estimate left to correct. `
          + 'A club override records a deliberate change of view instead.');
      }
      if (review.correctedRating === null || review.correctedRating === undefined) {
        out.push('Correcting an initial classification needs the rating the club believes was right.');
      }
    }
    return out;
  }

  // The decision (or pair of decisions) to hand to ClubDecision.prepare, in the
  // order they must be recorded.
  //
  // Correcting an initial classification is ONE event: the board is saying the
  // original estimate was wrong, which is a single statement about tier and
  // rating together, not a promotion plus a reassessment.
  function decisionsFor(review, snapshot) {
    const problems = incompleteReasons(review, snapshot);
    if (problems.length) {
      const err = new Error('This review is not finished:\n- ' + problems.join('\n- '));
      err.problems = problems;
      throw err;
    }
    const common = {
      playerId: review.playerId,
      effectiveDate: review.effectiveDate,
      reasonCode: review.reasonCode || 'MONTHLY_REVIEW',
      notes: review.notes || null,
      createdBy: review.createdBy,
      source: review.source || 'Admin Monthly Review',
    };

    if (review.ratingDecision === DECISION.CORRECT_INITIAL_CLASSIFICATION) {
      return [{
        ...common,
        eventType: Engine.EVENT.INITIAL_CLASSIFICATION_CORRECTION,
        newTier: review.newTier,
        newPowerRating: review.correctedRating,
        newReliability: review.correctedReliability ?? null,
        decisionType: DECISION.CORRECT_INITIAL_CLASSIFICATION,
        recommendation: review.recommendation && review.recommendation.recommended ? review.recommendation : null,
      }];
    }

    const tierDecision = {
      ...common,
      eventType: TIER_MOVE[review.tierEvent],
      newTier: review.newTier,
      decisionType: review.ratingDecision,
    };

    let rating;
    if (review.ratingDecision === DECISION.ACCEPT_RECOMMENDATION) {
      rating = review.recommendation.recommendationRating;
    } else if (review.ratingDecision === DECISION.CLUB_OVERRIDE) {
      rating = review.overrideRating ?? null;
    } else {
      // Keep the current rating. Recorded with no movement on purpose: the
      // board decided this, and a decision that leaves no trace is
      // indistinguishable from the omission this whole rule exists to prevent.
      rating = null;
    }
    const reliability = review.ratingDecision === DECISION.CLUB_OVERRIDE
      ? (review.overrideReliability ?? null)
      : null;

    const ratingDecision = {
      ...common,
      eventType: Engine.EVENT.CLUB_RATING_REASSESSMENT,
      newPowerRating: rating,
      newReliability: reliability,
      decisionType: review.ratingDecision,
      allowNoChange: review.ratingDecision === DECISION.KEEP_CURRENT_RATING,
      recommendation: review.recommendation && review.recommendation.recommended ? review.recommendation : null,
    };

    return [tierDecision, ratingDecision];
  }

  // What the board is agreeing to, in plain English, before anything is written.
  function describe(review, snapshot) {
    const s = snapshot[review.playerId];
    if (!s) return `${review.playerId}: no recorded state before ${review.effectiveDate}.`;
    const bits = [];
    if (review.newTier && review.newTier !== s.tier) bits.push(`Tier ${s.tier} → ${review.newTier}`);
    else if (review.tierEvent === 'TIER_RETAINED') bits.push(`stays in Tier ${s.tier}`);
    if (review.ratingDecision === DECISION.KEEP_CURRENT_RATING) {
      bits.push(`Power Rating stays at ${(Math.round(s.rating * 10) / 10).toFixed(1)} by decision`);
    } else if (review.ratingDecision === DECISION.ACCEPT_RECOMMENDATION && review.recommendation) {
      bits.push(`Power Rating ${(Math.round(s.rating * 10) / 10).toFixed(1)} → ${(Math.round(review.recommendation.recommendationRating * 10) / 10).toFixed(1)} (recommended)`);
    } else if (review.ratingDecision === DECISION.CLUB_OVERRIDE) {
      if (review.overrideRating !== null && review.overrideRating !== undefined) {
        bits.push(`Power Rating ${(Math.round(s.rating * 10) / 10).toFixed(1)} → ${(Math.round(review.overrideRating * 10) / 10).toFixed(1)} (club override)`);
      }
      if (review.overrideReliability !== null && review.overrideReliability !== undefined) {
        bits.push(`Reliability → ${Math.round(review.overrideReliability * 100)}% (club override)`);
      }
    } else if (review.ratingDecision === DECISION.CORRECT_INITIAL_CLASSIFICATION) {
      bits.push(`initial estimate corrected to ${(Math.round(review.correctedRating * 10) / 10).toFixed(1)}`);
    }
    return `${review.playerId}: ${bits.join(', ')}.`;
  }

  return {
    DECISION, DECISION_LABEL, TIER_MOVE, SAME_DATE_ORDER, eventRank,
    preReviewSnapshot, recommendationFor, incompleteReasons, decisionsFor, describe,
  };
});
