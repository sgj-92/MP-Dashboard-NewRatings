// ===================== CLUB DECISION — THE WRITE PATH ======================
// The only way a club decision becomes part of a player's record.
//
// Every rating in this system is the product of replaying events in order. A
// decision written with an effective date BEFORE something already recorded
// would change the inputs to matches that have already been rated, and the
// stored ratings would no longer follow from the stored history. Replay-forward
// does not exist yet, so that is not a thing to warn about -- it is refused.
//
// The rules below are here, in one pure function, rather than in the screen
// that calls it. A screen can be bypassed; this cannot.
//
//   * Forward-only. Never before the player's last recorded event, never after
//     today.
//   * A tier move carries no rating and no reliability. A promotion is not a
//     reward in points, and the specification keeps the two as separate events.
//   * A rating reassessment carries no tier change, for the same reason.
//   * Nothing is ever overwritten. A decision is undone by recording another
//     decision that restores the previous values, which leaves both in the
//     ledger. That is what "forward-only and audited" means in practice.
//
// This module decides and shapes. It performs no I/O: the caller writes what it
// returns, so the decision can be inspected in full before anything is stored.

(function (root, factory) {
  const api = factory(
    typeof require === 'function' ? require('./ratingEngine.js') : root.RatingEngine,
    typeof require === 'function' ? require('./ratingStore.js') : root.RatingStore
  );
  if (typeof module === 'object' && module.exports) module.exports = api;
  else root.ClubDecision = api;
})(typeof globalThis !== 'undefined' ? globalThis : this, function (Engine, Store) {
  'use strict';

  const TIER_ONLY = [Engine.EVENT.PROMOTION, Engine.EVENT.DEMOTION, Engine.EVENT.TIER_RETAINED];
  const RATING_ONLY = [Engine.EVENT.CLUB_RATING_REASSESSMENT];
  const CORRECTION = [Engine.EVENT.INITIAL_CLASSIFICATION_CORRECTION, Engine.EVENT.INITIAL_CLASSIFICATION_CONFIRMED];
  const ALLOWED = TIER_ONLY.concat(RATING_ONLY).concat(CORRECTION);

  const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;

  function lastEventDate(journey, playerId) {
    let latest = null;
    (journey || []).forEach((e) => {
      if (e.playerId !== playerId) return;
      const d = e.effectiveDate;
      if (d && (latest === null || d > latest)) latest = d;
    });
    return latest;
  }

  // Reads as a list of refusals on purpose. Every one of them is a way the
  // stored ratings could stop following from the stored history.
  function validate({ state, journey, decision, today }) {
    const problems = [];
    const d = decision || {};

    if (!d.playerId) problems.push('No player.');
    else if (!state[d.playerId]) problems.push(`${d.playerId} has no rating record to amend.`);

    if (!ALLOWED.includes(d.eventType)) {
      problems.push(`${d.eventType || '(no event type)'} is not a club decision.`);
    }
    if (!d.createdBy) problems.push('Every decision must record who made it.');
    if (!d.decisionType) problems.push('Every decision must record whether it accepted, overrode or declined the recommendation.');

    if (!ISO_DATE.test(d.effectiveDate || '')) {
      problems.push('An effective date (YYYY-MM-DD) is required.');
    } else {
      const last = d.playerId ? lastEventDate(journey, d.playerId) : null;
      if (last && d.effectiveDate < last) {
        problems.push(
          `Effective ${d.effectiveDate} is before ${d.playerId}'s last recorded event (${last}). ` +
          'Backdating would change the inputs to matches already rated, and replaying them forward is not built yet.');
      }
      if (today && d.effectiveDate > today) {
        problems.push(`Effective ${d.effectiveDate} is in the future. A decision takes effect when it is made, not later.`);
      }
    }

    const movesRating = d.newPowerRating !== undefined && d.newPowerRating !== null;
    const movesReliability = d.newReliability !== undefined && d.newReliability !== null;
    const movesTier = d.newTier !== undefined && d.newTier !== null;

    if (TIER_ONLY.includes(d.eventType)) {
      if (!movesTier) problems.push('A tier decision must say which tier.');
      if (movesRating) problems.push('A tier change moves no Power Rating. Record a separate rating reassessment.');
      if (movesReliability) problems.push('A tier change moves no Reliability. Record a separate rating reassessment.');
    }
    if (RATING_ONLY.includes(d.eventType)) {
      if (movesTier) problems.push('A rating reassessment does not change tier. Record a separate promotion or demotion.');
      if (!movesRating && !movesReliability) problems.push('A rating reassessment must change the Power Rating, the Reliability, or both.');
    }
    if (movesRating && !(typeof d.newPowerRating === 'number' && isFinite(d.newPowerRating))) {
      problems.push('The new Power Rating is not a number.');
    }
    if (movesReliability && !(typeof d.newReliability === 'number' && d.newReliability >= 0 && d.newReliability < 1)) {
      problems.push('Reliability must be at least 0 and below 1 — it approaches 1 but never reaches it.');
    }

    // Deterministic ids mean a second decision of the same type, for the same
    // player, on the same date would silently replace the first. Refuse: the
    // ledger must keep both, so a later date (or a different type) is required.
    if (d.playerId && d.eventType && ISO_DATE.test(d.effectiveDate || '')) {
      const id = `${d.effectiveDate}__${d.playerId}__${d.eventType}`;
      if ((journey || []).some((e) => Store.eventId(e) === id)) {
        problems.push(`A ${d.eventType} for ${d.playerId} effective ${d.effectiveDate} is already recorded. ` +
          'Recording another would overwrite it; use a later effective date.');
      }
    }
    return problems;
  }

  // Produces the event, the two documents to write, and a plain-English summary
  // of what will change. Writes nothing. Throws rather than returning something
  // half-valid, because a caller that ignored a warning would be writing to the
  // permanent record.
  function prepare({ state, journey, decision, today, recordedAt }) {
    const problems = validate({ state, journey, decision, today });
    if (problems.length) {
      const err = new Error('This decision cannot be recorded:\n- ' + problems.join('\n- '));
      err.problems = problems;
      throw err;
    }

    const before = state[decision.playerId];
    const beforeSnapshot = {
      tier: before.tier,
      rating: before.rating,
      reliability: Engine.reliability(before.effectiveEvidence),
      classificationStatus: before.classificationStatus,
    };

    // Applied to a copy, so a rejected decision cannot leave the live state
    // half-changed.
    const working = { [decision.playerId]: { ...before } };
    const rec = decision.recommendation || null;
    const event = Engine.applyStateEvent(working, {
      playerId: decision.playerId,
      eventType: decision.eventType,
      effectiveDate: decision.effectiveDate,
      newTier: decision.newTier === null ? undefined : decision.newTier,
      newPowerRating: decision.newPowerRating === null ? undefined : decision.newPowerRating,
      newReliability: decision.newReliability === null ? undefined : decision.newReliability,
      recommendationRating: rec ? rec.recommendationRating : null,
      recommendationReliability: rec ? rec.recommendationReliability : null,
      recommendationMethodVersion: rec ? rec.methodVersion : null,
      decisionType: decision.decisionType,
      reasonCode: decision.reasonCode || null,
      notes: decision.notes || null,
      createdBy: decision.createdBy,
      recordedAt: recordedAt,
      source: decision.source || 'Admin Monthly Review',
    });

    const after = working[decision.playerId];
    return {
      event,
      journeyDoc: Store.toJourneyDoc(event),
      playerDoc: Store.toPlayerDoc(decision.playerId, after),
      before: beforeSnapshot,
      after: {
        tier: after.tier,
        rating: after.rating,
        reliability: Engine.reliability(after.effectiveEvidence),
        classificationStatus: after.classificationStatus,
      },
      summary: describe(decision.playerId, beforeSnapshot, {
        tier: after.tier,
        rating: after.rating,
        reliability: Engine.reliability(after.effectiveEvidence),
      }),
    };
  }

  function describe(playerId, before, after) {
    const bits = [];
    if (before.tier !== after.tier) bits.push(`Tier ${before.tier} → Tier ${after.tier}`);
    if (Math.abs(before.rating - after.rating) > 1e-9) {
      bits.push(`Power Rating ${before.rating.toFixed(1)} → ${after.rating.toFixed(1)}`);
    }
    if (Math.abs(before.reliability - after.reliability) > 1e-9) {
      bits.push(`Reliability ${Math.round(before.reliability * 100)}% → ${Math.round(after.reliability * 100)}%`);
    }
    if (!bits.length) return `${playerId}: nothing changes.`;
    return `${playerId}: ${bits.join(', ')}.`;
  }

  // The reversal of a recorded decision, as a NEW decision. Nothing is deleted:
  // both sit in the ledger, which is the only way an audited record can undo
  // anything.
  function reversalOf(prepared, { effectiveDate, createdBy, notes }) {
    const e = prepared.event;
    const isTier = TIER_ONLY.includes(e.eventType);
    return {
      playerId: e.playerId,
      eventType: isTier ? (prepared.before.tier === e.newTier ? Engine.EVENT.TIER_RETAINED
        : (tierRank(prepared.before.tier) < tierRank(e.newTier) ? Engine.EVENT.PROMOTION : Engine.EVENT.DEMOTION))
        : Engine.EVENT.CLUB_RATING_REASSESSMENT,
      effectiveDate,
      newTier: isTier ? prepared.before.tier : null,
      newPowerRating: isTier ? null : prepared.before.rating,
      newReliability: isTier ? null : prepared.before.reliability,
      decisionType: 'REVERSAL',
      reasonCode: 'DECISION_REVERSED',
      notes: notes || `Reverses the ${e.eventType} effective ${e.effectiveDate}.`,
      createdBy,
    };
  }

  // The write. Two documents, and no transaction available on this backend, so
  // the order is deliberate: the journey event goes first. The journey IS the
  // history -- a replay reproduces the player document from it -- so if the
  // second write fails the record is recoverable and the failure is reported.
  // The reverse order could leave a rating with nothing explaining it.
  async function commit(backend, prepared) {
    const journey = Store.COLLECTIONS.journey;
    const players = Store.COLLECTIONS.players;
    Store.assertFirestoreSafe(prepared.journeyDoc, journey);
    Store.assertFirestoreSafe(prepared.playerDoc, players);

    await backend.set(journey, prepared.journeyDoc.id, prepared.journeyDoc);
    try {
      await backend.set(players, prepared.playerDoc.id, prepared.playerDoc);
    } catch (e) {
      const err = new Error(
        `The decision was recorded in the journey (${prepared.journeyDoc.id}) but ${prepared.playerDoc.id}'s ` +
        `current state could not be updated: ${e.message}. The history is intact and correct; the player ` +
        'document is stale until it is rewritten. Do not record the decision again.');
      err.journeyWritten = true;
      throw err;
    }
    return { journeyId: prepared.journeyDoc.id, playerId: prepared.playerDoc.id };
  }

  const TIER_RANK = { S: 0, A: 1, B: 2, C: 3 };
  function tierRank(t) { return TIER_RANK[t] === undefined ? 99 : TIER_RANK[t]; }

  return { prepare, commit, validate, reversalOf, lastEventDate, ALLOWED, TIER_ONLY, RATING_ONLY };
});
