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

// The useful thing to say about a defeat: whether more of the contest was taken
// than the expectation implied.
test('a defeat that beat the expectation is not the same as a hammering', () => {
  assert.strictEqual(L.commentaryKeyFor({ result: 'loss', gameShare: 0.42, expected: 0.30, ratingGap: -150 }), 'BETTER_THAN_SCORELINE');
  assert.strictEqual(L.commentaryKeyFor({ result: 'loss', gameShare: 0.18, expected: 0.55, ratingGap: 60 }), 'HEAVY_LOSS');
  assert.strictEqual(L.commentaryKeyFor({ result: 'loss', gameShare: 0.44, expected: 0.60, ratingGap: 80 }), 'LOSS');
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
