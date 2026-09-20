// Tier composition of a match. Facts only -- no evaluative labels.

const test = require('node:test');
const assert = require('node:assert');
const G = require('../assets/js/gameType.js');

test('a team key is order-independent and reads strongest-first', () => {
  assert.strictEqual(G.teamKey(['B', 'A']), 'AB');
  assert.strictEqual(G.teamKey(['A', 'B']), 'AB');
  assert.strictEqual(G.teamKey(['C', 'S']), 'SC');
  assert.strictEqual(G.teamKey(['B', 'B']), 'BB');
});

// The one that matters: without canonicalising the PAIR, a filter for
// "AB vs BB" silently misses every match the exporter happened to store the
// other way round.
test('a matchup is the same game type whichever side is listed first', () => {
  assert.strictEqual(G.matchupKey(['A', 'B'], ['B', 'B']), 'AB vs BB');
  assert.strictEqual(G.matchupKey(['B', 'B'], ['A', 'B']), 'AB vs BB');
  assert.strictEqual(G.matchupKey(['B', 'A'], ['B', 'B']), 'AB vs BB');
});

test('categories are all-one-tier, or mixed', () => {
  assert.strictEqual(G.category(['A', 'A'], ['A', 'A']), 'ALL_A');
  assert.strictEqual(G.category(['B', 'B'], ['B', 'B']), 'ALL_B');
  assert.strictEqual(G.category(['C', 'C'], ['C', 'C']), 'ALL_C');
  assert.strictEqual(G.category(['A', 'A'], ['A', 'B']), 'MIXED');
  assert.strictEqual(G.categoryLabel('ALL_A'), 'All A games');
  assert.strictEqual(G.categoryLabel('MIXED'), 'Mixed-tier games');
});

test('an unknown tier classifies as nothing rather than as a guess', () => {
  assert.strictEqual(G.matchupKey(['A', null], ['B', 'B']), null);
  assert.strictEqual(G.category(['A', undefined], ['B', 'B']), null);
  const c = G.classify(['A', null], ['B', 'B']);
  assert.strictEqual(c.matchup, null);
  assert.strictEqual(c.category, null);
});

test('singles are classified too', () => {
  assert.strictEqual(G.matchupKey(['A'], ['B']), 'A vs B');
  assert.strictEqual(G.matchupKey(['B'], ['A']), 'A vs B');
  assert.strictEqual(G.category(['A'], ['A']), 'ALL_A');
});

test('options are generated from the data, never offered empty', () => {
  const classified = [
    G.classify(['A', 'A'], ['A', 'A']),
    G.classify(['A', 'A'], ['A', 'A']),
    G.classify(['A', 'B'], ['B', 'B']),
    G.classify(['B', 'B'], ['A', 'B']),   // same type as the line above
    G.classify(['C', 'C'], ['C', 'C']),
  ];
  const o = G.optionsFrom(classified);
  assert.deepStrictEqual(o.categories.map((x) => x.value), ['cat:ALL_A', 'cat:ALL_C', 'cat:MIXED']);
  assert.deepStrictEqual(o.categories.map((x) => x.count), [2, 1, 2]);
  const ab = o.matchups.find((x) => x.value === 'match:AB vs BB');
  assert.strictEqual(ab.count, 2, 'both orientations count as the same type');
  assert.ok(!o.matchups.some((x) => x.count === 0));
});

test('a filter value selects exactly its own matches', () => {
  const allA = G.classify(['A', 'A'], ['A', 'A']);
  const abbb = G.classify(['A', 'B'], ['B', 'B']);
  assert.strictEqual(G.matches('all', abbb), true);
  assert.strictEqual(G.matches('cat:ALL_A', allA), true);
  assert.strictEqual(G.matches('cat:ALL_A', abbb), false);
  assert.strictEqual(G.matches('match:AB vs BB', abbb), true);
  assert.strictEqual(G.matches('match:AB vs BB', allA), false);
  assert.strictEqual(G.matches('cat:ALL_A', null), false, 'an unclassifiable match matches no filter');
});

test('there are no evaluative labels anywhere in the vocabulary', () => {
  const words = [G.categoryLabel('ALL_A'), G.categoryLabel('ALL_B'), G.categoryLabel('ALL_C'),
    G.categoryLabel('MIXED'), G.matchupKey(['A', 'B'], ['B', 'B'])].join(' ').toLowerCase();
  ['easy', 'soft', 'inflated', 'weak', 'strong', 'hard'].forEach((w) => {
    assert.ok(!words.includes(w), `"${w}" is a judgement, not a fact`);
  });
});

// ---------------------------------------------------------------------------
// Canonical tier ordering. Shaun's rule, 20 Sep: tier strength S > A > B > C,
// partnership strength SS > SA > SB > SC > AA > AB > AC > BB > BC > CC, and
// filter options ordered by strength rather than by how many matches happen to
// be in scope.

const CANONICAL = ['SS', 'SA', 'SB', 'SC', 'AA', 'AB', 'AC', 'BB', 'BC', 'CC'];

test('partnership strength is the club order, not alphabetical', () => {
  const shuffled = ['CC', 'AB', 'SS', 'BC', 'SA', 'AA', 'SC', 'BB', 'AC', 'SB'];
  assert.deepStrictEqual(shuffled.slice().sort(G.compareTeamKeys), CANONICAL);
  // Alphabetically 'S' sorts last, which is what the old string compare did.
  assert.notDeepStrictEqual(shuffled.slice().sort(), CANONICAL);
});

test('the stronger partnership is named first, whichever side was stored first', () => {
  assert.strictEqual(G.matchupKey(['A', 'A'], ['S', 'S']), 'SS vs AA');
  assert.strictEqual(G.matchupKey(['S', 'S'], ['A', 'A']), 'SS vs AA', 'and the same either way round');
  assert.strictEqual(G.matchupKey(['B', 'B'], ['A', 'B']), 'AB vs BB');
  assert.strictEqual(G.matchupKey(['C', 'C'], ['S', 'B']), 'SB vs CC');
});

test('a partnership is never written weaker-first', () => {
  assert.strictEqual(G.teamKey(['B', 'A']), 'AB');
  assert.strictEqual(G.teamKey(['B', 'S']), 'SB');
  assert.strictEqual(G.teamKey(['C', 'S']), 'SC');
  // Every canonical form the club can produce, both ways round.
  ['S', 'A', 'B', 'C'].forEach((x) => ['S', 'A', 'B', 'C'].forEach((y) => {
    assert.strictEqual(G.teamKey([x, y]), G.teamKey([y, x]));
    assert.ok(CANONICAL.includes(G.teamKey([x, y])), `${x}${y} produced a non-canonical key`);
  }));
});

test('filter options are ordered by strength and counts do not move them', () => {
  const make = (a, b, n) => new Array(n).fill(0).map(() => G.classify(a, b));
  // Deliberately lopsided counts: the weakest matchup is by far the commonest.
  const classified = [].concat(
    make(['C', 'C'], ['C', 'C'], 40),
    make(['A', 'B'], ['A', 'B'], 2),
    make(['S', 'S'], ['S', 'A'], 1),
    make(['A', 'A'], ['B', 'C'], 7),
  );
  const { matchups } = G.optionsFrom(classified);
  assert.deepStrictEqual(matchups.map((m) => m.label),
    ['SS vs SA', 'AA vs BC', 'AB vs AB', 'CC vs CC']);
  // The counts are still there, they just do not decide the order.
  assert.deepStrictEqual(matchups.map((m) => m.count), [1, 7, 2, 40]);
});

test('the filter list follows the sequence the Ledger sets out', () => {
  const pairs = [
    [['S', 'S'], ['S', 'S']], [['S', 'S'], ['S', 'A']], [['S', 'S'], ['S', 'B']],
    [['S', 'A'], ['S', 'A']], [['S', 'A'], ['S', 'C']],
    [['A', 'A'], ['A', 'A']], [['A', 'A'], ['A', 'B']], [['A', 'A'], ['A', 'C']],
    [['A', 'A'], ['B', 'B']], [['A', 'A'], ['B', 'C']],
    [['A', 'B'], ['A', 'B']], [['A', 'B'], ['A', 'C']],
  ];
  // Fed in backwards, to prove the order comes from the rule and not the input.
  const classified = pairs.slice().reverse().map(([a, b]) => G.classify(a, b));
  assert.deepStrictEqual(G.optionsFrom(classified).matchups.map((m) => m.label), [
    'SS vs SS', 'SS vs SA', 'SS vs SB', 'SA vs SA', 'SA vs SC',
    'AA vs AA', 'AA vs AB', 'AA vs AC', 'AA vs BB', 'AA vs BC',
    'AB vs AB', 'AB vs AC',
  ]);
});

// ---- Reading a partnership out -------------------------------------------

const tierOf = (map) => (n) => map[n];

test('the higher-tier partner is read first', () => {
  const t = tierOf({ Len: 'B', Erf: 'A', Manny: 'S' });
  assert.deepStrictEqual(G.orderTeam(['Len', 'Erf'], t), ['Erf', 'Len']);
  assert.deepStrictEqual(G.orderTeam(['Erf', 'Len'], t), ['Erf', 'Len']);
  assert.deepStrictEqual(G.orderTeam(['Len', 'Manny'], t), ['Manny', 'Len']);
});

test('partners on the same tier keep the order the match recorded', () => {
  const t = tierOf({ Rishi: 'B', Jords: 'B', Tom: 'B' });
  assert.deepStrictEqual(G.orderTeam(['Rishi', 'Jords'], t), ['Rishi', 'Jords']);
  assert.deepStrictEqual(G.orderTeam(['Jords', 'Rishi'], t), ['Jords', 'Rishi'],
    'stored order is preserved, not normalised to something else');
  assert.deepStrictEqual(G.orderTeam(['Tom', 'Jords', 'Rishi'], t), ['Tom', 'Jords', 'Rishi']);
});

test('an unknown tier sorts last rather than inventing a position', () => {
  const t = tierOf({ Known: 'A' });
  assert.deepStrictEqual(G.orderTeam(['Guest', 'Known'], t), ['Known', 'Guest']);
  // With nothing known at all, nothing moves.
  assert.deepStrictEqual(G.orderTeam(['One', 'Two'], () => null), ['One', 'Two']);
});

test('reading a partnership out never changes who is in it', () => {
  const t = tierOf({ a: 'C', b: 'S', c: 'B', d: 'A' });
  const input = ['a', 'b', 'c', 'd'];
  const out = G.orderTeam(input, t);
  assert.deepStrictEqual(out.slice().sort(), input.slice().sort());
  assert.deepStrictEqual(input, ['a', 'b', 'c', 'd'], 'the caller\'s array must not be mutated');
  assert.deepStrictEqual(out, ['b', 'd', 'c', 'a']);
});

// The record holds singles matches, so a team key can be one letter. The rule
// has to place them somewhere fixed rather than somewhere incidental.
test('a singles match is still named stronger-first and sorts predictably', () => {
  assert.strictEqual(G.matchupKey(['B'], ['A']), 'A vs B');
  assert.strictEqual(G.matchupKey(['A'], ['B']), 'A vs B');
  assert.strictEqual(G.teamKey(['A']), 'A');
  // A lone player sorts after every pairing opening with their own tier, and
  // before any pairing of a weaker tier.
  assert.ok(G.compareTeamKeys('AC', 'A') < 0);
  assert.ok(G.compareTeamKeys('A', 'BB') < 0);
  assert.deepStrictEqual(['BB', 'A', 'AC', 'AA'].sort(G.compareTeamKeys), ['AA', 'AC', 'A', 'BB']);
});
