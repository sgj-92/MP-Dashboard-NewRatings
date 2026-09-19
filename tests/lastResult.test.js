// The one line on Home that says anything resembling an opinion about a
// player's own match. It must be deterministic, restrained, and derived only
// from facts the engine already recorded.

const test = require('node:test');
const assert = require('node:assert');
const L = require('../assets/js/lastResult.js');

test('a draw is a draw, whatever the games said', () => {
  assert.strictEqual(L.commentaryKeyFor({ result: 'draw', gameShare: 0.2, expected: 0.8, ratingGap: 300 }), 'DRAW');
  assert.strictEqual(L.commentaryFor({ result: 'draw' }), 'Nothing between you. One to run back.');
});

test('beating a side that went in as favourites is the headline', () => {
  const key = L.commentaryKeyFor({ result: 'win', gameShare: 0.55, expected: 0.30, ratingGap: -200 });
  assert.strictEqual(key, 'UPSET_WIN');
  assert.match(L.LINES[key], /went in as favourites/);
});

test('a tight win and a routine win read differently', () => {
  assert.strictEqual(L.commentaryKeyFor({ result: 'win', gameShare: 0.54, expected: 0.6, ratingGap: 40 }), 'TIGHT_WIN');
  assert.strictEqual(L.commentaryKeyFor({ result: 'win', gameShare: 0.72, expected: 0.65, ratingGap: 120 }), 'ROUTINE_WIN');
});

// The useful thing to say about a defeat: whether the side scored better than
// the engine expected of them.
test('a defeat that beat the expectation is not the same as a hammering', () => {
  assert.strictEqual(L.commentaryKeyFor({ result: 'loss', gameShare: 0.42, expected: 0.30, actual: 0.40, ratingGap: -150 }), 'BETTER_THAN_SCORELINE');
  assert.strictEqual(L.commentaryKeyFor({ result: 'loss', gameShare: 0.18, expected: 0.55, actual: 0.14, ratingGap: 60 }), 'HEAVY_LOSS');
  assert.strictEqual(L.commentaryKeyFor({ result: 'loss', gameShare: 0.44, expected: 0.60, actual: 0.35, ratingGap: 80 }), 'LOSS');
});

// `expected` is the engine's expected performance score (0.80 x game share +
// 0.20 x result), NOT an expected share of games. Comparing a game share
// against it would be comparing two different measurements -- the exact
// confusion the rest of the app was cleaned up to avoid.
test('the expectation is judged against the score the engine recorded, never against the game share', () => {
  // A game share above the expectation, but the recorded score came in below
  // it: the engine's own reading wins, and it is not a moral victory.
  assert.strictEqual(
    L.commentaryKeyFor({ result: 'loss', gameShare: 0.45, expected: 0.40, actual: 0.36, ratingGap: 0 }),
    'LOSS');
  // And the reverse: a low game share with a recorded score above expectation
  // is still the better-than-it-looked defeat.
  assert.strictEqual(
    L.commentaryKeyFor({ result: 'loss', gameShare: 0.25, expected: 0.18, actual: 0.20, ratingGap: 0 }),
    'BETTER_THAN_SCORELINE');
  // With no recorded score at all, the game-share bands still decide -- they
  // are only ever compared against each other.
  assert.strictEqual(
    L.commentaryKeyFor({ result: 'loss', gameShare: 0.22, expected: 0.40, ratingGap: 0 }),
    'HEAVY_LOSS');
});

test('the same facts always give the same line', () => {
  const facts = { result: 'loss', gameShare: 0.31, expected: 0.5, ratingGap: 10 };
  const first = L.commentaryFor(facts);
  for (let i = 0; i < 20; i++) assert.strictEqual(L.commentaryFor(facts), first);
});

test('missing facts produce nothing rather than a guess', () => {
  assert.strictEqual(L.commentaryFor(null), null);
  assert.strictEqual(L.commentaryFor({}), null);
  // A result with no other facts still gets the most conservative reading.
  assert.strictEqual(L.commentaryKeyFor({ result: 'win' }), 'ROUTINE_WIN');
  assert.strictEqual(L.commentaryKeyFor({ result: 'loss' }), 'LOSS');
});

// It is shown to the person it is about. It may be light, never personal.
test('no line makes a claim about the player rather than the match', () => {
  const all = Object.values(L.LINES).join(' ').toLowerCase();
  ['choked', 'bottled', 'poor', 'bad', 'lazy', 'embarrass', 'deserved', 'lucky', 'should have']
    .forEach((w) => assert.ok(!all.includes(w), `"${w}" is a judgement about a person`));
  Object.values(L.LINES).forEach((line) => {
    assert.ok(line.length <= 62, `"${line}" is too long for a card`);
    assert.match(line, /[.!]$/);
  });
});

test('the most recent match is picked deterministically, ties included', () => {
  const m = (id, date, ...players) => ({ id, date, players });
  const matches = [
    m('2026-09-14-1', '2026-09-14', 'A', 'B'),
    m('2026-09-17-2', '2026-09-17', 'A', 'C'),
    m('2026-09-17-1', '2026-09-17', 'A', 'D'),
    m('2026-09-17-3', '2026-09-17', 'B', 'C'),   // not A's
  ];
  const got = L.mostRecent(matches, 'A');
  assert.strictEqual(got.id, '2026-09-17-2', 'latest date, then the later same-date sequence');
  assert.strictEqual(L.mostRecent(matches, 'Z'), null);
  // Stable however the list arrives.
  assert.strictEqual(L.mostRecent(matches.slice().reverse(), 'A').id, '2026-09-17-2');
});
