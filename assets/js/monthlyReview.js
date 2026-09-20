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

  // Reliability is its own answer. The board may take the recommended rating
  // and still disagree about how much confidence should attach to it, so the
  // two are not bolted together -- but silence is not an option here either.
  const RELIABILITY_CHOICE = {
    USE_RECOMMENDATION: 'USE_RECOMMENDATION',
    OVERRIDE: 'OVERRIDE',
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
  // The rating the board is actually putting on the table, whichever route they
  // took to it. Null means "no change", which is a rating move of zero.
  function chosenRating(review) {
    if (!review) return null;
    if (review.ratingDecision === DECISION.CORRECT_INITIAL_CLASSIFICATION) return review.correctedRating ?? null;
    if (review.ratingDecision === DECISION.ACCEPT_RECOMMENDATION) {
      return review.recommendation ? review.recommendation.recommendationRating : null;
    }
    if (review.ratingDecision === DECISION.CLUB_OVERRIDE) return review.overrideRating ?? null;
    return null; // keep the current rating
  }

  // What the system recommends for Reliability, priced against the anchor the
  // board has actually chosen rather than the one this module would have
  // suggested. A board override of the rating gets its own honest answer.
  //
  // Returns null when there is no move to price -- nothing to recommend is a
  // different thing from recommending no change, and neither is invented.
  function reliabilityRecommendationFor(review, snapshot) {
    if (!review || !review.playerId) return null;
    const s = snapshot ? snapshot[review.playerId] : null;
    if (!s) return null;
    // Until the board has answered the rating question there is nothing to
    // price. Once they have, a rating they chose not to move is a move of
    // zero -- which recommends leaving Reliability alone, and still lets them
    // override it deliberately. That is how a confidence-only change is made.
    if (!review.ratingDecision) return null;
    const target = chosenRating(review);
    const move = (target === null || target === undefined) ? 0 : target - s.rating;
    const before = Engine.reliability(s.effectiveEvidence);
    return Reassessment.recommendReliability({ currentReliability: before, ratingMove: move });
  }

  // The Reliability that will actually be written, or null for no change.
  function chosenReliability(review, snapshot) {
    if (!review) return null;
    if (review.reliabilityChoice === RELIABILITY_CHOICE.OVERRIDE) {
      return review.overrideReliability ?? null;
    }
    if (review.reliabilityChoice === RELIABILITY_CHOICE.USE_RECOMMENDATION) {
      const rec = reliabilityRecommendationFor(review, snapshot);
      return rec ? rec.reliability : null;
    }
    // No reliability answer given. The legacy path: a club override could carry
    // a reliability on its own, and that still works.
    if (review.ratingDecision === DECISION.CLUB_OVERRIDE) return review.overrideReliability ?? null;
    if (review.ratingDecision === DECISION.CORRECT_INITIAL_CLASSIFICATION) return review.correctedReliability ?? null;
    return null;
  }

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
      const rel = chosenReliability(review, snapshot);
      const relUnchanged = rel === null || rel === undefined
        || (s && Math.abs(rel - Engine.reliability(s.effectiveEvidence)) < 1e-9);
      if (noRating && relUnchanged) {
        out.push('An override needs a rating, a Reliability, or both — as it stands it would change nothing.');
      }
    }

    // A rating that actually moves has to be answered for. Left unanswered the
    // Reliability simply stays where it was, which after a large re-anchor
    // means a stale confidence attached to a number the board has just
    // replaced -- the quiet version of the mistake this whole step exists to
    // prevent. A rating that does not move needs no answer: the recommendation
    // is to leave it alone, and that is what happens by default.
    //
    // Only where the question is actually asked. The monthly review screen has
    // a Reliability step and sets this; Historical Club Adjustment does not --
    // it carries its own Reliability field and predates the step. Demanding an
    // answer to a question that screen never puts would simply make it
    // unusable.
    if (review.requireReliabilityAnswer && review.ratingDecision && !review.reliabilityChoice && s) {
      const target = chosenRating(review);
      const moves = target !== null && target !== undefined && Math.abs(target - s.rating) > 1e-9;
      if (moves) {
        out.push('The rating moves, so the board must say what happens to Reliability: '
          + 'use the recommendation, or override it.');
      }
    }
    if (review.ratingDecision === DECISION.ACCEPT_RECOMMENDATION) {
      const rec = review.recommendation;
      if (!rec || !rec.recommended) out.push('There is no recommendation to accept. ' + ((rec && rec.reason) || ''));
    }
    // An override of the Reliability is a departure from what the system
    // recommended, so it has to say what it is and why. A percentage with no
    // reason behind it is indistinguishable from a slip of the finger.
    if (review.reliabilityChoice === RELIABILITY_CHOICE.OVERRIDE) {
      const r = review.overrideReliability;
      if (r === null || r === undefined) {
        out.push('Overriding Reliability needs a percentage.');
      } else if (!(typeof r === 'number' && r >= 0 && r < 1)) {
        out.push('Reliability must be at least 0% and below 100% — it approaches certainty but never reaches it.');
      }
      if (!String(review.notes || '').trim()) {
        out.push('Overriding the recommended Reliability needs a reason, recorded with the decision.');
      }
    }
    if (review.reliabilityChoice === RELIABILITY_CHOICE.USE_RECOMMENDATION
      && !reliabilityRecommendationFor(review, snapshot)) {
      out.push('There is no Reliability recommendation to use: the board has not set a rating for it to follow.');
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

  // What the record keeps about what the system said, so a later reader can see
  // whether the board followed it or departed from it. The Reliability
  // recommendation is carried even when the rating recommendation could not be
  // made -- the board's own anchor still has a recommended Reliability, and an
  // override is only meaningful beside the number it overrode.
  function recommendationToRecord(review, snapshot) {
    const rating = review.recommendation && review.recommendation.recommended ? review.recommendation : null;
    const rel = reliabilityRecommendationFor(review, snapshot);
    if (!rating && !rel) return null;
    return {
      ...(rating || {}),
      methodVersion: rating ? rating.methodVersion : null,
      recommendationRating: rating ? rating.recommendationRating : null,
      recommendationReliability: rel ? rel.reliability : null,
      reliabilityRule: rel ? rel.rule : null,
      reliabilityReason: rel ? rel.reason : null,
    };
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
        newReliability: chosenReliability(review, snapshot),
        decisionType: DECISION.CORRECT_INITIAL_CLASSIFICATION,
        reliabilityChoice: review.reliabilityChoice || null,
        recommendation: recommendationToRecord(review, snapshot),
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
    const ratingDecision = {
      ...common,
      eventType: Engine.EVENT.CLUB_RATING_REASSESSMENT,
      newPowerRating: rating,
      newReliability: chosenReliability(review, snapshot),
      decisionType: review.ratingDecision,
      reliabilityChoice: review.reliabilityChoice || null,
      allowNoChange: review.ratingDecision === DECISION.KEEP_CURRENT_RATING,
      recommendation: recommendationToRecord(review, snapshot),
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
    DECISION, RELIABILITY_CHOICE, chosenRating, chosenReliability, reliabilityRecommendationFor, DECISION_LABEL, TIER_MOVE, SAME_DATE_ORDER, eventRank,
    preReviewSnapshot, recommendationFor, incompleteReasons, decisionsFor, describe,
  };
});
