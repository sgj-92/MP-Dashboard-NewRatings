const test = require('node:test');
const assert = require('node:assert');
const Merit = require('../assets/js/meritTable.js');
const TierHistory = require('../assets/js/tierHistory.js');

// A fixed tier map, so these tests are about the scoring and nothing else.
const TIERS = { Sam: 'S', Ana: 'A', Amy: 'A', Aly: 'A', Abe: 'A',
  Ben: 'B', Bob: 'B', Bea: 'B', Cal: 'C', Cat: 'C' };
const flat = (name) => TIERS[name] || null;

const match = (winners, losers, extra) => Object.assign(
  { id: 'm1', date: '2026-09-10', winners, losers, isDraw: false }, extra || {});
const pointsFor = (winners, losers, extra) => Merit.scoreMatch(match(winners, losers, extra), flat).points;

// ---- the table of values the brief specifies -------------------------------

test('AA vs AA → 4', () => {
  // Ana & Amy are both A; Ben and Bob stand in for the other A pair by tier.
  assert.strictEqual(pointsFor(['Ana', 'Amy'], ['Aly', 'Abe']).Ana, 4);
});

test('AB vs AB → 4', () => {
  const p = pointsFor(['Ana', 'Ben'], ['Amy', 'Bob']);
  assert.strictEqual(p.Ana, 4);
  assert.strictEqual(p.Ben, 4, 'both teammates score alike');
  assert.strictEqual(p.Amy, 0);
});

test('AC vs BB → 4, because a pairing is a sum and not its best player', () => {
  const p = pointsFor(['Ana', 'Cal'], ['Ben', 'Bob']);
  assert.strictEqual(p.Ana, 4, 'A+C equals B+B');
  assert.strictEqual(p.Cal, 4);
  assert.strictEqual(p.Ben, 0);
  // The same fixture the other way round is also even.
  assert.strictEqual(pointsFor(['Ben', 'Bob'], ['Ana', 'Cal']).Ben, 4);
});

test('one tier-step: AB beats BB → 3, BB beats AB → 5', () => {
  assert.strictEqual(pointsFor(['Ana', 'Ben'], ['Bob', 'Bea']).Ana, 3);
  assert.strictEqual(pointsFor(['Bob', 'Bea'], ['Ana', 'Ben']).Bob, 5);
});

test('two tier-steps: the favourite earns 2, the underdog 6', () => {
  assert.strictEqual(pointsFor(['Ana', 'Amy'], ['Ben', 'Bob']).Ana, 2, 'AA beats BB');
  assert.strictEqual(pointsFor(['Ben', 'Bob'], ['Ana', 'Amy']).Ben, 6, 'BB beats AA');
});

test('three tier-steps: the favourite earns 1, the underdog 7', () => {
  // SA (4+3=7) vs BC (2+1=3) is a four-step gap; SS vs AA is two. SA vs CC is
  // four. A three-step gap: AA (6) vs BC (3).
  assert.strictEqual(pointsFor(['Ana', 'Amy'], ['Ben', 'Cal']).Ana, 1, 'AA beats BC');
  assert.strictEqual(pointsFor(['Ben', 'Cal'], ['Ana', 'Amy']).Ben, 7, 'BC beats AA');
});

test('a draw is one point each, whatever the matchup', () => {
  const even = Merit.scoreMatch(match(['Ana', 'Amy'], ['Ben', 'Bob'], { isDraw: true }), flat);
  assert.deepStrictEqual(even.points, { Ana: 1, Amy: 1, Ben: 1, Bob: 1 });
  assert.strictEqual(even.steps, 2, 'even though this one was a two-step mismatch');
  const level = Merit.scoreMatch(match(['Ana', 'Ben'], ['Amy', 'Bob'], { isDraw: true }), flat);
  assert.deepStrictEqual(level.points, { Ana: 1, Ben: 1, Amy: 1, Bob: 1 });
});

test('a loss is worth nothing', () => {
  const p = pointsFor(['Ana', 'Amy'], ['Ben', 'Bob']);
  assert.strictEqual(p.Ben, 0);
  assert.strictEqual(p.Bob, 0);
});

test('points are always whole numbers', () => {
  [[['Ana', 'Amy'], ['Ben', 'Bob']], [['Ben', 'Cal'], ['Ana', 'Amy']], [['Ana', 'Cal'], ['Ben', 'Bob']]]
    .forEach(([w, l]) => Object.values(pointsFor(w, l))
      .forEach((v) => assert.strictEqual(v, Math.trunc(v), `${v} must be an integer`)));
});

// ---- invariants ------------------------------------------------------------

test('both winning teammates always receive the same points', () => {
  [[['Ana', 'Cal'], ['Ben', 'Bob']], [['Ben', 'Bob'], ['Ana', 'Amy']], [['Ana', 'Ben'], ['Bob', 'Cat']]]
    .forEach(([w, l]) => {
      const p = pointsFor(w, l);
      assert.strictEqual(p[w[0]], p[w[1]], `${w.join(' & ')} must score alike`);
    });
});

test('reversing the sides or the players changes nothing', () => {
  const base = pointsFor(['Ana', 'Ben'], ['Bob', 'Cal']);
  const playersSwapped = pointsFor(['Ben', 'Ana'], ['Cal', 'Bob']);
  assert.deepStrictEqual(playersSwapped, base, 'player order within a partnership is irrelevant');
  // The same fixture with the result the other way round is the mirror value.
  const otherWay = pointsFor(['Bob', 'Cal'], ['Ana', 'Ben']);
  assert.strictEqual(base.Ana + otherWay.Bob, Merit.BASELINE * 2,
    'favourite win and underdog win are symmetric about the baseline');
});

test('it is the sum of the pairing, never its best player', () => {
  // Both sides contain an A, but the sums differ by one step.
  const p = pointsFor(['Ana', 'Ben'], ['Amy', 'Cal']);
  assert.strictEqual(p.Ana, 3, 'AB over AC is a one-step favourite win');
  // Both sides contain a C, and the sums are equal.
  assert.strictEqual(pointsFor(['Ana', 'Cal'], ['Ben', 'Bob']).Ana, 4);
});

test('an unknown tier is reported rather than guessed', () => {
  const s = Merit.scoreMatch(match(['Ana', 'Ghost'], ['Ben', 'Bob']), flat);
  assert.strictEqual(s.unresolved, true);
  assert.deepStrictEqual(s.winnerTiers, ['A', null]);
  const built = Merit.build([match(['Ana', 'Ghost'], ['Ben', 'Bob'])], flat);
  assert.strictEqual(built.table.length, 0, 'nobody is credited from a match that cannot be scored');
  assert.strictEqual(built.unresolved.length, 1);
});

test('strength is a plain sum, and a missing tier poisons it', () => {
  assert.strictEqual(Merit.strengthOf(['A', 'C']), 4);
  assert.strictEqual(Merit.strengthOf(['B', 'B']), 4);
  assert.strictEqual(Merit.strengthOf(['S', 'S']), 8);
  assert.strictEqual(Merit.strengthOf(['A', null]), null);
  assert.strictEqual(Merit.strengthOf([]), null);
});

// ---- historical tiers ------------------------------------------------------

// Rishi's real September: B until the 20th, A from the 20th.
const history = () => TierHistory.create({
  currentTiers: { Rishi: 'A', Ana: 'A', Amy: 'A', Ben: 'B', Bob: 'B' },
  changes: [{ playerId: 'Rishi', effectiveDate: '2026-09-20', fromTier: 'B', toTier: 'A',
    eventType: 'PROMOTION', reasonCode: null }],
});

test('a match uses the tier the player held on the day, not today\'s', () => {
  const tierAt = history().tierAsOf;
  // Before the change Rishi is a B, so Rishi & Ben (BB) beating Ana & Amy (AA)
  // is a two-step underdog win.
  const before = Merit.scoreMatch(
    { id: 'a', date: '2026-09-13', winners: ['Rishi', 'Ben'], losers: ['Ana', 'Amy'], isDraw: false }, tierAt);
  assert.strictEqual(before.winnerTiers[0], 'B');
  assert.strictEqual(before.points.Rishi, 6, 'BB over AA is worth 6');

  // The same fixture after the change is AB over AA — one step, favourite the
  // other way, so an underdog win worth 5.
  const after = Merit.scoreMatch(
    { id: 'b', date: '2026-09-21', winners: ['Rishi', 'Ben'], losers: ['Ana', 'Amy'], isDraw: false }, tierAt);
  assert.strictEqual(after.winnerTiers[0], 'A');
  assert.strictEqual(after.points.Rishi, 5, 'AB over AA is worth 5');
});

test('a reassessment changes Merit only from its effective date', () => {
  const tierAt = history().tierAsOf;
  const onTheDay = Merit.scoreMatch(
    { id: 'c', date: '2026-09-20', winners: ['Rishi', 'Ben'], losers: ['Ana', 'Amy'], isDraw: false }, tierAt);
  assert.strictEqual(onTheDay.winnerTiers[0], 'A', 'the effective date itself counts as the new tier');
  const dayBefore = Merit.scoreMatch(
    { id: 'd', date: '2026-09-19', winners: ['Rishi', 'Ben'], losers: ['Ana', 'Amy'], isDraw: false }, tierAt);
  assert.strictEqual(dayBefore.winnerTiers[0], 'B', 'the day before does not');
});

test('a mid-month mover appears in both tier sections, holding only what each earned', () => {
  const tierAt = history().tierAsOf;
  const matches = [
    { id: '1', date: '2026-09-13', winners: ['Rishi', 'Ben'], losers: ['Ana', 'Amy'], isDraw: false }, // as a B: 6
    { id: '2', date: '2026-09-21', winners: ['Rishi', 'Ben'], losers: ['Ana', 'Amy'], isDraw: false }, // as an A: 5
  ];
  const { table } = Merit.build(matches, tierAt, { tierForRow: tierAt });
  const rishiRows = table.filter((r) => r.playerId === 'Rishi');
  assert.strictEqual(rishiRows.length, 2, 'one row per tier occupied');
  const byTier = Object.fromEntries(rishiRows.map((r) => [r.tier, r]));
  assert.strictEqual(byTier.B.merit, 6);
  assert.strictEqual(byTier.A.merit, 5);
  assert.strictEqual(byTier.B.played, 1);
  assert.strictEqual(byTier.A.played, 1);

  // All together is one row for the whole period.
  const whole = Merit.build(matches, tierAt).table.find((r) => r.playerId === 'Rishi');
  assert.strictEqual(whole.merit, 11, 'and the two segments sum to the whole');
  assert.strictEqual(whole.played, 2);
});

// ---- the table -------------------------------------------------------------

test('a table totals merit and counts how it was earned', () => {
  const matches = [
    { id: '1', date: '2026-09-01', winners: ['Ben', 'Bob'], losers: ['Ana', 'Amy'], isDraw: false }, // hard, 6
    { id: '2', date: '2026-09-02', winners: ['Ben', 'Bob'], losers: ['Cal', 'Cat'], isDraw: false }, // easy, 2
    { id: '3', date: '2026-09-03', winners: ['Ben', 'Bob'], losers: ['Ana', 'Cal'], isDraw: false }, // even, 4
    { id: '4', date: '2026-09-04', winners: ['Ben', 'Bob'], losers: ['Ana', 'Amy'], isDraw: true },  // draw, 1
  ];
  const row = Merit.build(matches, flat).table.find((r) => r.playerId === 'Ben');
  assert.strictEqual(row.merit, 6 + 2 + 4 + 1);
  assert.strictEqual(row.played, 4);
  assert.strictEqual(row.wins, 3);
  assert.strictEqual(row.draws, 1);
  assert.deepStrictEqual([row.hardWins, row.evenWins, row.easyWins], [1, 1, 1]);
  assert.strictEqual(row.bestWin, 6);
});

test('the table ranks on merit, then on how hard the wins were', () => {
  const matches = [
    { id: '1', date: '2026-09-01', winners: ['Ben', 'Bob'], losers: ['Ana', 'Amy'], isDraw: false },  // Ben 6
    { id: '2', date: '2026-09-02', winners: ['Cal', 'Cat'], losers: ['Ana', 'Ben'], isDraw: false },  // Cal 7
  ];
  const table = Merit.build(matches, flat).table;
  assert.strictEqual(table[0].playerId, 'Cal', '7 outranks 6');
  assert.strictEqual(table[0].merit, 7);
});

test('the audit reports the shape of the history rather than clipping it', () => {
  const matches = [
    { id: '1', date: '2026-09-01', winners: ['Ana', 'Amy'], losers: ['Ben', 'Cal'], isDraw: false }, // 3 steps
    { id: '2', date: '2026-09-02', winners: ['Ana', 'Ben'], losers: ['Amy', 'Bob'], isDraw: false }, // 0 steps
  ];
  const a = Merit.audit(matches, flat);
  assert.strictEqual(a.decided, 2);
  assert.strictEqual(a.maxSteps, 3);
  assert.deepStrictEqual(a.stepHistogram, { 0: 1, 3: 1 });
  assert.deepStrictEqual(a.extremes, [], 'nothing here falls outside 1..7');
});

test('nothing in this module reads a rating', () => {
  const src = require('node:fs').readFileSync(require.resolve('../assets/js/meritTable.js'), 'utf8');
  const code = src.split('\n').filter((l) => !l.trim().startsWith('//')).join('\n');
  [/\brating\b/i, /\bexpected/i, /reliability/i, /ratingJourney/i, /TIER_SEED/].forEach((re) => {
    assert.ok(!re.test(code), `Merit must not reference ${re} — it is not a rating system`);
  });
});
