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
