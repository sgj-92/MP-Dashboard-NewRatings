// What gets written down when the record stops agreeing with itself, and what
// each reader is told. The board holds an admin password too, so "admin" has
// never meant the owner -- that distinction is the whole point of this module.

const test = require('node:test');
const assert = require('node:assert');
const HR = require('../assets/js/healthReport.js');

const check = (count, ids) => ({ identical: false, count, differences: ids });
const repairOf = (over) => ({
  documentsToWrite: 145, wouldDelete: [], playersMoved: new Array(31).fill(0).map((_, i) => ({ playerId: 'P' + i })),
  staleByCollection: { ratingJourney: 114, players: 31 },
  writes: { ratingJourney: [{ effectiveDate: '2026-09-03' }, { effectiveDate: '2026-09-17' }] },
  ...over,
});

test('a healthy record produces no report at all', () => {
  assert.strictEqual(HR.signatureOf({ identical: true, count: 0, differences: [] }), null);
  assert.strictEqual(HR.buildReport({ check: { identical: true, count: 0, differences: [] } }), null);
});

test('the same divergence gets the same id however the differences arrive', () => {
  const a = HR.signatureOf(check(3, ['b', 'a', 'c']));
  const b = HR.signatureOf(check(3, ['c', 'b', 'a']));
  assert.strictEqual(a, b, 'retrieval order must not create a second report');
  assert.match(a, /^REPLAY_DIVERGENCE__3__/);
});

// verifyNoOp caps the list it returns, so two different divergences can share
// their first forty ids. The count separates them.
test('divergences of different sizes are different reports', () => {
  const same = ['x', 'y'];
  assert.notStrictEqual(HR.signatureOf(check(40, same)), HR.signatureOf(check(145, same)));
});

test('a report records the shape of the problem, not the whole of it', () => {
  const r = HR.buildReport({
    check: check(145, ['ratingJourney/a differs']),
    repair: repairOf(),
    record: { matches: new Array(156), journey: new Array(664), players: new Array(34) },
    seenBy: 'Shaun',
    now: '2026-09-20T10:00:00.000Z',
  });
  assert.strictEqual(r.status, 'OPEN');
  assert.strictEqual(r.differenceCount, 145);
  assert.strictEqual(r.documentsToRepair, 145);
  assert.strictEqual(r.playersAffected, 31);
  assert.strictEqual(r.earliestAffectedDate, '2026-09-03');
  assert.strictEqual(r.latestAffectedDate, '2026-09-17');
  assert.deepStrictEqual(r.recordSize, { matches: 156, journey: 664, players: 34 });
  assert.deepStrictEqual(r.seenBy, ['Shaun']);
  assert.strictEqual(r.seenCount, 1);
  assert.ok(r.sampleDifferences.length <= 10);
});

test('seeing it again updates the report rather than filing another', () => {
  const first = HR.buildReport({ check: check(145, ['a']), repair: repairOf(), seenBy: 'Shaun', now: '2026-09-20T10:00:00.000Z' });
  const again = HR.buildReport({ check: check(145, ['a']), repair: repairOf(), seenBy: 'Rishi', now: '2026-09-21T09:00:00.000Z' });
  assert.strictEqual(first.id, again.id, 'the same divergence is the same report');

  const merged = HR.merge(first, again);
  assert.strictEqual(merged.seenCount, 2);
  assert.strictEqual(merged.firstSeenAt, '2026-09-20T10:00:00.000Z', 'the first sighting is what dates it');
  assert.strictEqual(merged.lastSeenAt, '2026-09-21T09:00:00.000Z');
  assert.deepStrictEqual(merged.seenBy, ['Shaun', 'Rishi']);
  assert.strictEqual(HR.merge(null, first), first);
});

test('the same person meeting it twice is not two people', () => {
  const a = HR.buildReport({ check: check(2, ['a']), repair: repairOf(), seenBy: 'Shaun' });
  const b = HR.buildReport({ check: check(2, ['a']), repair: repairOf(), seenBy: 'Shaun' });
  assert.deepStrictEqual(HR.merge(a, b).seenBy, ['Shaun']);
});

// A record marked resolved that is seen again was not resolved.
test('a resolved report that reappears is open again', () => {
  const r = HR.buildReport({ check: check(2, ['a']), repair: repairOf(), seenBy: 'Shaun' });
  const closed = HR.resolved(r, '2026-09-22T00:00:00.000Z');
  assert.strictEqual(closed.status, 'RESOLVED');
  assert.ok(closed.resolvedAt);
  assert.strictEqual(HR.merge(closed, r).status, 'OPEN');
});

// The reason this module exists.
test('the board is told to stop; the owner is told what is wrong', () => {
  const r = HR.buildReport({ check: check(145, ['a']), repair: repairOf(), seenBy: 'Shaun' });

  const board = HR.messageFor(r, { owner: false });
  assert.match(board, /editing is paused/i);
  assert.match(board, /nothing you did caused it/i);
  assert.match(board, /nothing has been lost/i);
  assert.ok(!/ratingJourney/.test(board), 'a document id tells the board nothing it can act on');
  assert.ok(!/145 place/.test(board));

  const owner = HR.messageFor(r, { owner: true });
  assert.match(owner, /145 place\(s\)/);
  assert.match(owner, /114 in ratingJourney/);
  assert.match(owner, /31 in players/);
  assert.match(owner, /2026-09-03 to 2026-09-17/);
  assert.match(owner, /31 player\(s\)/);
  assert.match(owner, /No match is affected/);

  // Both readers are told the same thing about what it means for them.
  assert.match(owner, /Editing is paused/i);
});

test('no report means nothing is said', () => {
  assert.strictEqual(HR.messageFor(null, { owner: true }), '');
});
