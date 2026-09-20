const test = require('node:test');
const assert = require('node:assert');
const LastTen = require('../assets/js/lastTen.js');

// An appearance as the app builds one.
const ap = (name, date, result, gf, ga, seq) => ({ name, date, result, gamesFor: gf, gamesAgainst: ga, seq });

// Twelve games on twelve consecutive days, oldest first.
function twelve(name) {
  const out = [];
  for (let i = 1; i <= 12; i++) {
    out.push(ap(name, `2026-06-${String(i).padStart(2, '0')}`, i <= 2 ? 'L' : 'W', 6, 2, i));
  }
  return out;
}

test('a window of ten means the latest ten, not the first ten', () => {
  const [row] = LastTen.build(twelve('Len'));
  assert.strictEqual(row.games, 10);
  // The two losses are the OLDEST games, so a latest-ten window drops them.
  assert.strictEqual(row.wins, 10);
  assert.strictEqual(row.losses, 0);
  assert.strictEqual(row.from, '2026-06-03', 'the window starts after the dropped games');
  assert.strictEqual(row.to, '2026-06-12');
});

test('the table is not scoped to a month: a window may span several', () => {
  const rows = LastTen.build([
    ap('Eli', '2026-06-20', 'W', 6, 3, 1),
    ap('Eli', '2026-07-04', 'L', 2, 6, 2),
    ap('Eli', '2026-09-11', 'W', 6, 4, 3),
  ]);
  assert.deepStrictEqual([rows[0].from, rows[0].to], ['2026-06-20', '2026-09-11']);
  assert.strictEqual(rows[0].games, 3);
});

test('points are the league\'s own 3 / 1 / 0 and nothing else', () => {
  const row = LastTen.rowFor('Kaz', [
    ap('Kaz', '2026-06-01', 'W', 6, 1, 1),
    ap('Kaz', '2026-06-02', 'W', 6, 2, 2),
    ap('Kaz', '2026-06-03', 'D', 4, 4, 3),
    ap('Kaz', '2026-06-04', 'L', 3, 6, 4),
  ]);
  assert.strictEqual(row.points, 3 + 3 + 1 + 0);
  assert.deepStrictEqual(
    [row.games, row.wins, row.losses, row.draws],
    [4, 2, 1, 1],
    'W + L + D must account for every game',
  );
  assert.strictEqual(row.wins + row.losses + row.draws, row.games);
});

test('game difference is games for minus games against across the window', () => {
  const row = LastTen.rowFor('Harry', [
    ap('Harry', '2026-06-01', 'W', 6, 1, 1),
    ap('Harry', '2026-06-02', 'L', 2, 6, 2),
  ]);
  assert.strictEqual(row.gamesFor, 8);
  assert.strictEqual(row.gamesAgainst, 7);
  assert.strictEqual(row.gd, 1);
});

test('a short sample is shown at its real length, never padded', () => {
  const row = LastTen.rowFor('Fee', [
    ap('Fee', '2026-06-01', 'W', 6, 0, 1),
    ap('Fee', '2026-06-02', 'W', 6, 1, 2),
    ap('Fee', '2026-06-03', 'W', 6, 2, 3),
  ]);
  assert.strictEqual(row.games, 3, 'three games are three games');
  assert.strictEqual(row.points, 9);
  assert.strictEqual(row.short, true, 'and the row says the sample is short');
  assert.strictEqual(row.window, 10);
  // The trap this guards: 9 points off three games outranking 9 off ten,
  // with nothing on the row to say why.
  const full = LastTen.rowFor('Jams', twelve('Jams').map((m) => ({ ...m, name: 'Jams' })));
  assert.strictEqual(full.short, false);
  assert.ok(row.points < full.points || row.games < full.games);
});

test('exactly ten games is not a short sample', () => {
  const row = LastTen.rowFor('Del', twelve('Del').slice(2));
  assert.strictEqual(row.games, 10);
  assert.strictEqual(row.short, false);
});

test('games on the same date are ordered by the record, deterministically', () => {
  // Five games all dated the same day; only the latest three may be taken.
  const same = [1, 2, 3, 4, 5].map((i) => ap('Antz', '2026-08-08', i > 2 ? 'W' : 'L', 6, 2, i));
  const a = LastTen.rowFor('Antz', same, 3);
  const b = LastTen.rowFor('Antz', same.slice().reverse(), 3);
  assert.deepStrictEqual(a.run, b.run, 'input order must not change the answer');
  assert.strictEqual(a.wins, 3, 'seq 3,4,5 are the latest three, and all wins');
  assert.strictEqual(a.losses, 0);
});

test('the run reads newest first, which is the thing points cannot show', () => {
  const row = LastTen.rowFor('Carla', [
    ap('Carla', '2026-06-01', 'W', 6, 1, 1),
    ap('Carla', '2026-06-02', 'L', 1, 6, 2),
    ap('Carla', '2026-06-03', 'L', 2, 6, 3),
  ]);
  assert.deepStrictEqual(row.run, ['L', 'L', 'W'], 'two losses just arrived');
});

test('a player with no games has no row rather than a row of zeroes', () => {
  const rows = LastTen.build([ap('Eli', '2026-06-01', 'W', 6, 1, 1)]);
  assert.deepStrictEqual(rows.map((r) => r.name), ['Eli']);
  assert.deepStrictEqual(LastTen.build([]), []);
});

test('malformed appearances are skipped, not counted as games', () => {
  const rows = LastTen.build([
    ap('Eli', '2026-06-01', 'W', 6, 1, 1),
    { name: 'Eli', result: 'W' },        // no date
    { date: '2026-06-02', result: 'W' }, // no name
    null,
  ]);
  assert.strictEqual(rows.length, 1);
  assert.strictEqual(rows[0].games, 1);
});

test('every player gets their own window, not a shared one', () => {
  const rows = LastTen.build(
    twelve('Len').concat([ap('Osh', '2026-06-12', 'L', 0, 6, 99)]),
    { window: 10 },
  );
  const byName = Object.fromEntries(rows.map((r) => [r.name, r]));
  assert.strictEqual(byName.Len.games, 10);
  assert.strictEqual(byName.Osh.games, 1, 'Osh has one game and keeps one game');
  assert.strictEqual(byName.Osh.short, true);
});
