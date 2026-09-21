const test = require('node:test');
const assert = require('node:assert');
const MonthlyViews = require('../assets/js/monthlyViews.js');
const JourneyView = require('../assets/js/journeyView.js');

// Shaun, 21 Sep 2026: September's Power Rankings showed Rishi in Tier A — his
// post-reassessment tier — beside 1464, his PRE-reassessment rating.
//
// Root cause: MonthlyViews.chronological() ordered same-date events only by
// "initialisation first", and relied on Array#sort being stable to keep "the
// order the engine produced". Sort IS stable, but on its INPUT — and the input
// is whatever order Firestore returned the documents in. For Rishi's three
// events on 2026-09-20 that order put the PROMOTION last, so the month closed
// on the rating the promotion left untouched.
//
// The persisted record was correct throughout. This is ordering, not data.

// Rishi's actual 20 September, in the order Firestore returned it.
const rishiSeptember = () => ([
  { playerId: 'Rishi', eventType: 'MATCH_UPDATE', effectiveDate: '2026-09-17', matchId: '2026-09-17-1',
    preMatchRating: 1465.3, postMatchRating: 1464.2 },
  { playerId: 'Rishi', eventType: 'MATCH_UPDATE', effectiveDate: '2026-09-20', matchId: '2026-09-20-1',
    preMatchRating: 1640, postMatchRating: 1641.6 },
  { playerId: 'Rishi', eventType: 'CLUB_RATING_REASSESSMENT', effectiveDate: '2026-09-20',
    previousTier: 'A', newTier: 'A', previousPowerRating: 1464.2, newPowerRating: 1640 },
  { playerId: 'Rishi', eventType: 'PROMOTION', effectiveDate: '2026-09-20',
    previousTier: 'B', newTier: 'A', previousPowerRating: 1464.2, newPowerRating: 1464.2 },
]);

test('a month closes on the rating the player actually ended it with', () => {
  const { closing } = MonthlyViews.buildSnapshots(rishiSeptember());
  assert.strictEqual(closing['2026-09'].Rishi, 1641.6,
    'the month must close after the reassessment and the match, not on the promotion');
  // The specific wrong answer this guards against.
  assert.notStrictEqual(closing['2026-09'].Rishi, 1464.2,
    'a post-change tier must never be shown beside the pre-change rating');
});

test('the document order Firestore happens to return cannot change the answer', () => {
  const events = rishiSeptember();
  const orders = [
    events,
    events.slice().reverse(),
    [events[3], events[1], events[0], events[2]],
    [events[2], events[3], events[1], events[0]],
  ];
  const answers = orders.map((o) => MonthlyViews.buildSnapshots(o).closing['2026-09'].Rishi);
  assert.deepStrictEqual(answers, [1641.6, 1641.6, 1641.6, 1641.6],
    `retrieval order must not decide a rating, got ${JSON.stringify(answers)}`);
});

test('a club decision is applied before the same day\'s matches, as the engine does', () => {
  // Engine.replay() drains state events with effectiveDate <= m.date BEFORE
  // processing that match, so this is the engine's own rule, not a preference.
  const ordered = MonthlyViews.chronological(rishiSeptember());
  const onTheDay = ordered.filter((e) => e.effectiveDate === '2026-09-20').map((e) => e.eventType);
  assert.deepStrictEqual(onTheDay, ['PROMOTION', 'CLUB_RATING_REASSESSMENT', 'MATCH_UPDATE']);
});

test('the promotion precedes the rating decision the board makes beside it', () => {
  // Both start from 1464.2, so only one order leaves the day on 1640: the
  // promotion moves nothing, then the reassessment re-anchors.
  const ordered = MonthlyViews.chronological(rishiSeptember());
  const decisions = ordered.filter((e) => e.eventType === 'PROMOTION' || e.eventType === 'CLUB_RATING_REASSESSMENT');
  assert.strictEqual(decisions[0].eventType, 'PROMOTION');
  assert.strictEqual(decisions[1].eventType, 'CLUB_RATING_REASSESSMENT');
});

test('the rating movement row reports the real end of the month', () => {
  const views = MonthlyViews.build(rishiSeptember(), { tierAsOf: () => 'A' });
  const row = MonthlyViews.ratingMovementTable(views, '2026-09').find((r) => r.playerId === 'Rishi');
  assert.ok(row, 'Rishi played, so he has a movement row');
  assert.strictEqual(row.endRating, 1641.6);
  assert.notStrictEqual(row.endRating, 1464.2);
});

test('monthEndRatings agrees with the snapshot', () => {
  const views = MonthlyViews.build(rishiSeptember(), { tierAsOf: () => 'A' });
  assert.strictEqual(MonthlyViews.monthEndRatings(views, '2026-09').Rishi, 1641.6);
});

test('a demotion with a downward re-anchor orders the same way', () => {
  // The mirror image, so the rule is not accidentally specific to promotions.
  const events = [
    { playerId: 'X', eventType: 'MATCH_UPDATE', effectiveDate: '2026-09-20', matchId: '2026-09-20-1',
      preMatchRating: 1200, postMatchRating: 1198 },
    { playerId: 'X', eventType: 'CLUB_RATING_REASSESSMENT', effectiveDate: '2026-09-20',
      previousPowerRating: 1400, newPowerRating: 1200 },
    { playerId: 'X', eventType: 'DEMOTION', effectiveDate: '2026-09-20',
      previousTier: 'A', newTier: 'B', previousPowerRating: 1400, newPowerRating: 1400 },
  ];
  assert.strictEqual(MonthlyViews.buildSnapshots(events).closing['2026-09'].X, 1198);
  assert.strictEqual(MonthlyViews.buildSnapshots(events.slice().reverse()).closing['2026-09'].X, 1198);
});

test('a player who does not change tier is unaffected by any of this', () => {
  const events = [
    { playerId: 'Y', eventType: 'MATCH_UPDATE', effectiveDate: '2026-09-04', matchId: '2026-09-04-1',
      preMatchRating: 1500, postMatchRating: 1510 },
    { playerId: 'Y', eventType: 'MATCH_UPDATE', effectiveDate: '2026-09-11', matchId: '2026-09-11-1',
      preMatchRating: 1510, postMatchRating: 1505 },
  ];
  assert.strictEqual(MonthlyViews.buildSnapshots(events).closing['2026-09'].Y, 1505);
});

test('the same-date order matches the one journeyView already used', () => {
  // These two modules have no dependency on one another and the browser loads
  // monthlyViews first, so the list is repeated. It must not drift: journeyView
  // ordered correctly all along, which is why a player's Rating Journey read
  // right while the monthly view did not.
  assert.deepStrictEqual(MonthlyViews.SAME_DATE_ORDER, JourneyView.SAME_DATE_ORDER);
});
