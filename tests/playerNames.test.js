const test = require('node:test');
const assert = require('node:assert');
const PlayerNames = require('../assets/js/playerNames.js');

const docs = () => ([
  { id: 'Shaun', rating: 1409 },
  { id: 'Tom', displayName: 'Tom H', rating: 1388 },
  { id: 'Rishi', rating: 1452 },
  { id: 'Ant Slice', rating: 1460 },
]);

test('a player with no alias is called what they are keyed by', () => {
  assert.strictEqual(PlayerNames.displayFor({ id: 'Shaun' }), 'Shaun');
  assert.strictEqual(PlayerNames.displayFor({ id: 'Tom', displayName: 'Tom H' }), 'Tom H');
  // Whitespace-only is not a name; fall back rather than render a blank row.
  assert.strictEqual(PlayerNames.displayFor({ id: 'Tom', displayName: '   ' }), 'Tom');
  assert.strictEqual(PlayerNames.displayFor({ id: 'Tom', displayName: ' Tom H ' }), 'Tom H');
});

test('translation works in both directions and is safe before any rename', () => {
  const alias = PlayerNames.buildAlias(docs());
  assert.strictEqual(PlayerNames.toDisplay(alias, 'Tom'), 'Tom H');
  assert.strictEqual(PlayerNames.toId(alias, 'Tom H'), 'Tom');
  // Never renamed: both directions are the identity.
  assert.strictEqual(PlayerNames.toDisplay(alias, 'Shaun'), 'Shaun');
  assert.strictEqual(PlayerNames.toId(alias, 'Shaun'), 'Shaun');
  // Unknown names pass through rather than becoming undefined — every call
  // site is therefore safe on a record with no aliases at all.
  assert.strictEqual(PlayerNames.toDisplay(alias, 'Nobody'), 'Nobody');
  assert.strictEqual(PlayerNames.toId(alias, 'Nobody'), 'Nobody');
  assert.strictEqual(PlayerNames.toDisplay(null, 'Tom'), 'Tom');
});

test('a team round-trips exactly, which is what keeps a match its own', () => {
  const alias = PlayerNames.buildAlias(docs());
  const stored = ['Tom', 'Shaun'];
  const shown = PlayerNames.mapTeam(alias, stored);
  assert.deepStrictEqual(shown, ['Tom H', 'Shaun']);
  assert.deepStrictEqual(PlayerNames.unmapTeam(alias, shown), stored,
    'what is written back must be exactly what was read');
});

test('a blank or unusable name is refused', () => {
  const d = docs();
  ['', '   ', null, undefined].forEach((bad) => {
    const r = PlayerNames.validate(bad, { playerId: 'Shaun', docs: d });
    assert.strictEqual(r.ok, false);
    assert.match(r.reason, /blank/);
  });
  assert.match(PlayerNames.validate('a/b', { playerId: 'Shaun', docs: d }).reason, /slash/);
  assert.strictEqual(PlayerNames.validate('..', { playerId: 'Shaun', docs: d }).ok, false);
});

test('a name already in use is refused, by label or by key', () => {
  const d = docs();
  // Somebody else's display name.
  let r = PlayerNames.validate('Tom H', { playerId: 'Shaun', docs: d });
  assert.strictEqual(r.ok, false);
  assert.match(r.reason, /already uses that name/);
  // Somebody else's underlying id, even though nothing shows it any more.
  r = PlayerNames.validate('Tom', { playerId: 'Shaun', docs: d });
  assert.strictEqual(r.ok, false, 'a freed-up id is still a collision waiting to happen');
  // Case-insensitively, because a human typing a name will not match case.
  assert.strictEqual(PlayerNames.validate('rishi', { playerId: 'Shaun', docs: d }).ok, false);
  // Their own current name is not a rename.
  assert.match(PlayerNames.validate('Shaun', { playerId: 'Shaun', docs: d }).reason, /already their name/);
});

test('a player can be renamed to something genuinely new', () => {
  const r = PlayerNames.validate('Shaun J', { playerId: 'Shaun', docs: docs() });
  assert.strictEqual(r.ok, true);
  assert.strictEqual(r.from, 'Shaun');
  assert.strictEqual(r.name, 'Shaun J');
  assert.strictEqual(r.playerId, 'Shaun');
});

test('renaming a player who is not in the record is refused', () => {
  const r = PlayerNames.validate('Whoever', { playerId: 'Ghost', docs: docs() });
  assert.strictEqual(r.ok, false);
  assert.match(r.reason, /not in the record/);
});

test('a rename is one field on one document, and the record is untouched', () => {
  const plan = PlayerNames.planRename('Shaun J', { playerId: 'Shaun', docs: docs() });
  assert.strictEqual(plan.ok, true);
  assert.strictEqual(plan.documentsWritten, 1);
  assert.strictEqual(plan.recordUnchanged, true);
  assert.strictEqual(plan.playerId, 'Shaun', 'the identity does not move');
  assert.deepStrictEqual(Object.keys(plan.update).sort(), ['displayName', 'previousDisplayNames']);
  assert.strictEqual(plan.update.displayName, 'Shaun J');
  assert.deepStrictEqual(plan.update.previousDisplayNames, ['Shaun'], 'the old name is kept');
});

test('renaming twice keeps the whole trail and never moves the id', () => {
  let d = docs();
  const first = PlayerNames.planRename('Shaun J', { playerId: 'Shaun', docs: d });
  d = d.map((x) => (x.id === 'Shaun' ? { ...x, ...first.update } : x));
  assert.strictEqual(PlayerNames.displayFor(d[0]), 'Shaun J');

  const second = PlayerNames.planRename('Shaun Johnson', { playerId: 'Shaun', docs: d });
  assert.strictEqual(second.ok, true);
  assert.deepStrictEqual(second.update.previousDisplayNames, ['Shaun', 'Shaun J']);
  assert.strictEqual(second.playerId, 'Shaun', 'still keyed by the original name');
  d = d.map((x) => (x.id === 'Shaun' ? { ...x, ...second.update } : x));

  // And back to the beginning: the id never moved, so the original name is
  // free for its own owner and nobody else.
  const back = PlayerNames.planRename('Shaun', { playerId: 'Shaun', docs: d });
  assert.strictEqual(back.ok, true, 'a player may always be renamed back to their own id');
  assert.strictEqual(back.playerId, 'Shaun');
});

test('an alias cannot make two players answer to one name', () => {
  const d = docs().concat([{ id: 'Sean', displayName: 'Shaun J' }]);
  // 'Shaun J' is taken by Sean, so Shaun cannot also take it.
  const r = PlayerNames.validate('Shaun J', { playerId: 'Shaun', docs: d });
  assert.strictEqual(r.ok, false);
  // And the alias map that results from any accepted state resolves uniquely.
  const alias = PlayerNames.buildAlias(d);
  assert.strictEqual(PlayerNames.toId(alias, 'Shaun J'), 'Sean');
  assert.strictEqual(PlayerNames.toId(alias, 'Shaun'), 'Shaun');
});
