const test = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const path = require('node:path');
const Engine = require('../assets/js/ratingEngine.js');
const Store = require('../assets/js/ratingStore.js');
const Bridge = require('../assets/js/v3Bridge.js');

const ROOT = path.join(__dirname, '..');

function loadSnapshot() {
  const src = fs.readFileSync(path.join(ROOT, 'assets', 'js', 'productionSnapshot.js'), 'utf8');
  return new Function(src + '; return PRODUCTION_SNAPSHOT;')();
}

function playerDoc(over = {}) {
  return {
    id: 'Rishi', rating: 1439.3, effectiveEvidence: 72, lifetimeMatches: 72,
    tier: 'B', classificationStatus: 'ESTABLISHED', ratingModelVersion: 'sequential-v1', ...over,
  };
}

async function backendWith(docs) {
  const b = Store.memoryBackend();
  for (const d of docs) await b.set('players', d.id, d);
  return b;
}

// ---------- hydration ----------

test('v3 player documents hydrate application state accurately', async () => {
  const state = await Bridge.load(await backendWith([playerDoc(), playerDoc({ id: 'Shaun', rating: 1178.7, effectiveEvidence: 21, lifetimeMatches: 21 })]));
  assert.ok(state.loaded);
  assert.strictEqual(state.playerCount, 2);
  assert.strictEqual(state.players.Rishi.rating, 1439.3);
  assert.strictEqual(state.players.Shaun.lifetimeMatches, 21);
  assert.strictEqual(state.players.Rishi.tier, 'B');
});

test('Reliability survives hydration exactly and is derived, not stored blindly', async () => {
  const state = await Bridge.load(await backendWith([playerDoc({ effectiveEvidence: 72 })]));
  assert.strictEqual(state.players.Rishi.reliability, Engine.reliability(72));
  assert.strictEqual(state.players.Rishi.effectiveEvidence, 72);
  // A stale/incorrect stored reliability must not be trusted over the formula.
  const lying = await Bridge.load(await backendWith([playerDoc({ reliability: 0.01 })]));
  assert.strictEqual(lying.players.Rishi.reliability, Engine.reliability(72));
});

test('reliability bands come from Reliability, never from match count', () => {
  assert.strictEqual(Bridge.reliabilityBand(0.09), 'Provisional');
  assert.strictEqual(Bridge.reliabilityBand(0.24), 'Provisional');
  assert.strictEqual(Bridge.reliabilityBand(0.25), 'Developing');
  assert.strictEqual(Bridge.reliabilityBand(0.49), 'Developing');
  assert.strictEqual(Bridge.reliabilityBand(0.50), 'Established');
  assert.strictEqual(Bridge.reliabilityBand(0.74), 'Established');
  assert.strictEqual(Bridge.reliabilityBand(0.75), 'High Reliability');
  assert.strictEqual(Bridge.reliabilityBand(1.0), 'High Reliability');
});

test('a high rating with thin evidence is Provisional, not promoted by its rating', async () => {
  // Power Rating 1712 with 1 match: Reliability 9%, band Provisional.
  const state = await Bridge.load(await backendWith([playerDoc({ id: 'Del', rating: 1712, effectiveEvidence: 1, lifetimeMatches: 1, tier: 'A' })]));
  assert.strictEqual(state.players.Del.reliabilityBand, 'Provisional');
  assert.ok(state.players.Del.rating > 1700);
});

// ---------- failure is loud ----------

test('a missing v3 player never becomes 1400', async () => {
  const state = await Bridge.load(await backendWith([playerDoc()]));
  const p = Bridge.decoratePlayer({ name: 'Ghost' }, state, {});
  assert.strictEqual(p.v3Missing, true);
  assert.strictEqual(p.v3Rating, undefined);
  assert.notStrictEqual(p.v3Rating, 1400);
});

test('malformed and missing data fail explicitly rather than degrade', async () => {
  const empty = await Bridge.load(await backendWith([]));
  assert.strictEqual(empty.loaded, false);
  assert.match(empty.error, /empty/);

  const malformed = await Bridge.load(await backendWith([playerDoc({ rating: undefined })]));
  assert.strictEqual(malformed.loaded, false);
  assert.match(malformed.error, /missing rating/);

  const badTier = await Bridge.load(await backendWith([playerDoc({ tier: 'Z' })]));
  assert.strictEqual(badTier.loaded, false);
  assert.match(badTier.error, /unknown tier Z/);

  const thrown = await Bridge.load({ getAll: async () => { throw new Error('offline'); } });
  assert.strictEqual(thrown.loaded, false);
  assert.match(thrown.error, /Could not read v3 player state: offline/);
});

test('asking for ratings before state loads throws rather than substituting', () => {
  const state = Bridge.createState();
  assert.throws(() => Bridge.ratingsMap(state), /not loaded/);
  assert.throws(() => Bridge.tierMap(state), /not loaded/);
});

// ---------- production snapshot independence ----------

test('the production snapshot maps to v3 by name and stays independent', async () => {
  const snap = loadSnapshot();
  const state = await Bridge.load(await backendWith([playerDoc()]));
  const index = Bridge.indexSnapshot(snap);
  const p = Bridge.decoratePlayer({ name: 'Rishi' }, state, index);

  assert.strictEqual(p.v3Rating, 1439.3);
  assert.strictEqual(p.productionSnapshotRating, 1483.9);
  assert.strictEqual(p.productionVsV3, Math.round((1439.3 - 1483.9) * 10) / 10);
  // Neither value is derived from the other.
  assert.notStrictEqual(p.v3Rating, p.productionSnapshotRating);
});

test('a player missing from the snapshot does not affect v3 state', async () => {
  const state = await Bridge.load(await backendWith([playerDoc({ id: 'NewPlayer' })]));
  const p = Bridge.decoratePlayer({ name: 'NewPlayer' }, state, Bridge.indexSnapshot(loadSnapshot()));
  assert.strictEqual(p.productionSnapshotMissing, true);
  assert.strictEqual(p.productionSnapshotRating, null);
  assert.strictEqual(p.v3Rating, 1439.3, 'v3 rating is untouched by a snapshot miss');
  assert.strictEqual(p.productionVsV3, null, 'no difference is manufactured');
});

test('the snapshot is structurally excluded from every calculation', () => {
  const strip = (s) => s.replace(/^\s*\/\/.*$/gm, '');
  ['ratingEngine.js', 'ratingStore.js', 'reassessment.js', 'tierHistory.js'].forEach((f) => {
    const src = fs.readFileSync(path.join(ROOT, 'assets', 'js', f), 'utf8');
    assert.ok(!src.includes('PRODUCTION_SNAPSHOT'), f + ' must not reference the production snapshot');
  });
  const seed = strip(fs.readFileSync(path.join(ROOT, 'scripts', 'seed-beta.js'), 'utf8'));
  assert.ok(!seed.includes('PRODUCTION_SNAPSHOT'), 'the seed script must not read the snapshot');

  // In app.js it may only be indexed for display, never fed to the engine.
  const app = strip(fs.readFileSync(path.join(ROOT, 'assets', 'js', 'app.js'), 'utf8'));
  const uses = [...app.matchAll(/PRODUCTION_SNAPSHOT\b/g)].length;
  assert.ok(uses <= 2, 'the snapshot should only be indexed once for comparison display');
});

test('the snapshot is dated and identifies itself as production', () => {
  const meta = loadSnapshot().snapshot_metadata;
  assert.strictEqual(meta.export_timestamp_utc, '2026-09-16T16:32:02Z');
  assert.strictEqual(meta.production_firebase_project_id, 'mp---dashboard');
  assert.strictEqual(meta.total_players_exported, 34);
});

test('all 34 snapshot players reconcile with all 34 v3 players by name', async () => {
  const snap = loadSnapshot();
  const docs = snap.players.map((p) => playerDoc({ id: p.name, tier: p.tier }));
  const state = await Bridge.load(await backendWith(docs));
  const r = Bridge.reconcileSnapshot(state, snap);
  assert.deepStrictEqual(r.inV3NotSnapshot, []);
  assert.deepStrictEqual(r.inSnapshotNotV3, []);
  assert.strictEqual(r.matched, 34);
});

// ---------- structural guarantees ----------

test('normal player state never scans ratingJourney', async () => {
  const reads = [];
  const backend = { getAll: async (c) => { reads.push(c); return [playerDoc()]; } };
  await Bridge.load(backend);
  assert.deepStrictEqual(reads, ['players'], 'hydration must read players only');

  const strip = (s) => s.replace(/^\s*\/\/.*$/gm, '');
  const bridge = strip(fs.readFileSync(path.join(ROOT, 'assets', 'js', 'v3Bridge.js'), 'utf8'));
  assert.ok(!bridge.includes('ratingJourney'), 'the read layer must not touch ratingJourney at all');
});

test('the April/May display-only players cannot leak into v3 state', async () => {
  const state = await Bridge.load(await backendWith([playerDoc()]));
  ['Twoshay', 'Alfie', 'Abby', 'Kam', 'Kevin', 'bruh'].forEach((n) => {
    assert.strictEqual(state.players[n], undefined, n + ' must not appear in v3 state');
    assert.strictEqual(Bridge.decoratePlayer({ name: n }, state, {}).v3Missing, true);
  });
});

test('legacy and v3 values occupy separate fields and cannot overwrite each other', async () => {
  const state = await Bridge.load(await backendWith([playerDoc()]));
  const p = Bridge.decoratePlayer(
    { name: 'Rishi', rating: 9999, legacyRating: 9999 },
    state, Bridge.indexSnapshot(loadSnapshot()));
  assert.strictEqual(p.legacyRating, 9999, 'decoration must not clobber a legacy field');
  assert.strictEqual(p.v3Rating, 1439.3);
  assert.strictEqual(p.productionSnapshotRating, 1483.9);
});

test('the app no longer contains the silent 1400 fallback', () => {
  const app = fs.readFileSync(path.join(ROOT, 'assets', 'js', 'app.js'), 'utf8');
  assert.ok(!/return p \? p\.rating : 1400/.test(app), 'the silent 1400 default must be gone');
  assert.ok(/No rating available for/.test(app), 'a missing player must raise an explicit error');
});

test('recomputeAll refuses to build state when v3 has not loaded', () => {
  const app = fs.readFileSync(path.join(ROOT, 'assets', 'js', 'app.js'), 'utf8');
  const fn = app.slice(app.indexOf('function recomputeAll()'), app.indexOf('const TIERS ='));
  assert.ok(/if\(!V3_STATE\.loaded\)/.test(fn), 'recomputeAll must guard on v3 state');
  assert.ok(fn.indexOf('PLAYERS = []') < fn.indexOf('V3Bridge.ratingsMap'),
    'the unavailable branch must return before any rating is produced');
  assert.ok(!/computeElo\(/.test(fn), 'the legacy solver must no longer feed application state');
});
