// A player who changes tier mid-month played part of it in one tier and the
// rest in another. The League Table used to file the whole month under
// whichever tier they are in NOW, which moves points between tiers: a player
// promoted on the 20th arrived in the A table carrying points earned beating Bs.

const test = require('node:test');
const assert = require('node:assert');
const L = require('../assets/js/leagueSplit.js');
const TierHistory = require('../assets/js/tierHistory.js');

// The rule, stated once: before the effective date is the old tier, on or
// after it is the new one.
const movedOn = (date, from, to) => (d) => (d >= date ? to : from);

test('the effective date itself belongs to the new tier', () => {
  const t = movedOn('2026-09-20', 'B', 'A');
  assert.strictEqual(t('2026-09-19'), 'B', 'the day before is the old tier');
  assert.strictEqual(t('2026-09-20'), 'A', 'the day itself is the new tier');
  assert.strictEqual(t('2026-09-21'), 'A');
  // And the same boundary as the engine's own tier history, so the League
  // Table cannot drift from every other temporal-tier surface.
  const h = TierHistory.create({
    currentTiers: { Rishi: 'A' },
    changes: [{ playerId: 'Rishi', effectiveDate: '2026-09-20', fromTier: 'B', toTier: 'A' }],
  });
  assert.strictEqual(h.tierAsOf('Rishi', '2026-09-19'), 'B');
  assert.strictEqual(h.tierAsOf('Rishi', '2026-09-20'), 'A');
});

test('a promotion and a demotion are read the same way, in the order they happened', () => {
  const up = movedOn('2026-09-20', 'B', 'A');
  const down = movedOn('2026-09-20', 'A', 'B');
  const dates = ['2026-09-25', '2026-09-05'];        // deliberately out of order
  assert.deepStrictEqual(L.tiersOver(dates, up), ['B', 'A']);
  assert.deepStrictEqual(L.tiersOver(dates, down), ['A', 'B']);
  assert.strictEqual(L.transitionLabel(L.tiersOver(dates, up)), 'B → A');
  assert.strictEqual(L.transitionLabel(L.tiersOver(dates, down)), 'A → B');
});

test('a month spent in one tier reads as that tier, not a transition', () => {
  const t = movedOn('2026-09-20', 'B', 'A');
  assert.deepStrictEqual(L.tiersOver(['2026-09-02', '2026-09-17'], t), ['B']);
  assert.strictEqual(L.transitionLabel(L.tiersOver(['2026-09-02'], t)), 'B');
  assert.strictEqual(L.changedDuring(['2026-09-02', '2026-09-17'], t), false);
  assert.strictEqual(L.changedDuring(['2026-09-17', '2026-09-25'], t), true);
});

test('two moves in one month are both reported', () => {
  const t = (d) => (d >= '2026-09-25' ? 'A' : d >= '2026-09-10' ? 'B' : 'C');
  assert.deepStrictEqual(L.tiersOver(['2026-09-01', '2026-09-15', '2026-09-28'], t), ['C', 'B', 'A']);
  assert.strictEqual(L.transitionLabel(L.tiersOver(['2026-09-01', '2026-09-15', '2026-09-28'], t)), 'C → B → A');
});

test('returning to a tier is not collapsed into one spell', () => {
  const t = (d) => (d >= '2026-09-20' ? 'B' : d >= '2026-09-10' ? 'A' : 'B');
  assert.deepStrictEqual(L.tiersOver(['2026-09-01', '2026-09-15', '2026-09-25'], t), ['B', 'A', 'B']);
});

test('a date with no known tier contributes nothing rather than a guess', () => {
  const t = (d) => (d === '2026-09-05' ? null : 'B');
  assert.deepStrictEqual(L.tiersOver(['2026-09-05', '2026-09-10'], t), ['B']);
  assert.deepStrictEqual(L.tiersOver(['2026-09-05'], () => null), []);
  assert.strictEqual(L.transitionLabel([]), null);
  assert.strictEqual(L.transitionLabel(null), null);
});

test('nothing at all produces nothing', () => {
  assert.deepStrictEqual(L.tiersOver([], () => 'B'), []);
  assert.deepStrictEqual(L.tiersOver(null, () => 'B'), []);
});

// The aggregation key has to survive a player's name, which is free text.
test('a player and a tier round-trip through the aggregation key', () => {
  ['Ant Slice', 'M.R', "O'Neill", 'Tom → Tim', 'a|b'].forEach((name) => {
    ['S', 'A', 'B', 'C', ''].forEach((tier) => {
      assert.deepStrictEqual(L.fromKey(L.keyFor(name, tier)), { name, tier });
    });
  });
  // Two different players cannot collide, whatever they are called.
  assert.notStrictEqual(L.keyFor('Ann', 'B'), L.keyFor('Ann B', ''));
  assert.notStrictEqual(L.keyFor('A', 'BC'), L.keyFor('AB', 'C'));
});
