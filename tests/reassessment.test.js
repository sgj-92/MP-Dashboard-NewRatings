// Recommendation logic (§9.5). Validated against the two Experiment 13B
// historical tier boundaries, which reproduce exactly.

const test = require('node:test');
const assert = require('node:assert');
const E = require('../assets/js/ratingEngine.js');
const R = require('../assets/js/reassessment.js');
const D = require('./helpers/dataset.js');

const at1dp = (x) => Math.round(x * 10) / 10;
const tiers = D.loadBaseTiers();

// §5.3 is the whole tier history: Shaun and Tom C->B on 1 Jul, Fatch C->B on
// 1 Aug, and nobody else changed tier in the period.
function tierAsOf(name, date) {
  if (name === 'Shaun' || name === 'Tom') return date >= '2026-07-01' ? 'B' : 'C';
  if (name === 'Fatch') return date >= '2026-08-01' ? 'B' : 'C';
  return tiers[name] || 'B';
}

function stateBefore(date) {
  return D.replayStage(2, D.experimentDataset().filter((m) => m.date < date)).state;
}

test('quantile uses linear interpolation (numpy default / R type 7)', () => {
  assert.strictEqual(R.quantile([1, 2, 3, 4], 0.5), 2.5);
  assert.strictEqual(R.quantile([10], 0.75), 10);
  assert.strictEqual(R.quantile([1, 2, 3, 4, 5], 0.25), 2);
  assert.strictEqual(R.quantile([], 0.5), null);
});

test('reproduces the 1 Jul 2026 C->B boundary exactly', () => {
  const b = R.tierBoundaryT2({
    state: stateBefore('2026-07-01'),
    tierOf: (n) => tierAsOf(n, '2026-07-01'),
    subject: 'Shaun', fromTier: 'C', toTier: 'B', direction: 'promotion', minEvidence: 5,
  });
  assert.strictEqual(b.fromPoolSize, 1);
  assert.strictEqual(b.toPoolSize, 9);
  assert.strictEqual(at1dp(b.fromQuartile), 1117.4);
  assert.strictEqual(at1dp(b.toQuartile), 1368.7);
  assert.strictEqual(at1dp(b.t2), 1243.1);
});

test('reproduces the 1 Aug 2026 C->B boundary exactly', () => {
  const b = R.tierBoundaryT2({
    state: stateBefore('2026-08-01'),
    tierOf: (n) => tierAsOf(n, '2026-08-01'),
    subject: 'Fatch', fromTier: 'C', toTier: 'B', direction: 'promotion', minEvidence: 5,
  });
  assert.strictEqual(b.fromPoolSize, 1);
  assert.strictEqual(b.toPoolSize, 12);
  assert.strictEqual(at1dp(b.fromQuartile), 1093.6);
  assert.strictEqual(at1dp(b.toQuartile), 1302.8);
  assert.strictEqual(at1dp(b.t2), 1198.2);
});

test('the player under review counts in the tier being joined, not the one left', () => {
  // Removing that rule changes the 1 Jul pool from 9 to 8 and is what made the
  // boundary irreproducible, so it is pinned by a test.
  const state = stateBefore('2026-07-01');
  const b = R.tierBoundaryT2({
    state, tierOf: (n) => tierAsOf(n, '2026-07-01'),
    subject: 'Shaun', fromTier: 'C', toTier: 'B', direction: 'promotion', minEvidence: 5,
  });
  assert.strictEqual(b.toPoolSize, 9);
  assert.strictEqual(b.fromPoolSize, 1, 'the subject is never counted in the tier being left');
});

// ---------- the thin-pool guard ----------

test('returns no recommendation when either side has fewer than 3 established players', () => {
  const rec = R.getRecommendation({
    state: stateBefore('2026-07-01'),
    tierOf: (n) => tierAsOf(n, '2026-07-01'),
    subject: 'Shaun', fromTier: 'C', toTier: 'B', eventType: E.EVENT.INITIAL_CLASSIFICATION_CORRECTION,
  });
  assert.strictEqual(rec.recommended, false);
  assert.strictEqual(rec.recommendationRating, null);
  assert.strictEqual(rec.t2, null);
  assert.match(rec.reason, /Not enough established players/);
});

test('both historical C->B reviews are refused by the guard', () => {
  // Worth stating plainly: the guard rejects the very cases 13B validated on,
  // because each had only one established Tier C player.
  for (const [date, subject] of [['2026-07-01', 'Shaun'], ['2026-08-01', 'Fatch']]) {
    const rec = R.getRecommendation({
      state: stateBefore(date), tierOf: (n) => tierAsOf(n, date),
      subject, fromTier: 'C', toTier: 'B', eventType: E.EVENT.PROMOTION,
    });
    assert.strictEqual(rec.recommended, false);
    assert.strictEqual(rec.establishedFrom, 1);
  }
});

// ---------- alpha and the directional clamp ----------

function syntheticState() {
  const s = {};
  const add = (n, rating, ev) => { s[n] = { rating, effectiveEvidence: ev, lifetimeMatches: ev, tier: null }; };
  ['c1', 'c2', 'c3', 'c4'].forEach((n, i) => add(n, 1050 + i * 40, 10)); // 1050..1170
  ['b1', 'b2', 'b3', 'b4'].forEach((n, i) => add(n, 1350 + i * 40, 10)); // 1350..1470
  add('subject', 1150, 10);
  return s;
}
const synthTier = (n) => (n.startsWith('c') ? 'C' : n.startsWith('b') ? 'B' : 'C');

test('promotion moves alpha of the way to T2 and never to the tier seed', () => {
  const state = syntheticState();
  const rec = R.getRecommendation({
    state, tierOf: synthTier, subject: 'subject', fromTier: 'C', toTier: 'B',
    eventType: E.EVENT.PROMOTION, params: { alpha: 0.5 },
  });
  assert.ok(rec.recommended);
  const expected = 1150 + 0.5 * (rec.t2 - 1150);
  assert.ok(Math.abs(rec.recommendationRating - expected) < 1e-9);
  assert.notStrictEqual(at1dp(rec.recommendationRating), 1400, 'must never land on the Tier B seed');
  assert.ok(rec.recommendationRating < rec.t2);
});

test('a player already past the boundary is recommended no movement', () => {
  const state = syntheticState();
  state.subject.rating = 1600; // well above any C/B boundary
  const rec = R.getRecommendation({
    state, tierOf: synthTier, subject: 'subject', fromTier: 'C', toTier: 'B',
    eventType: E.EVENT.PROMOTION, params: { alpha: 0.5 },
  });
  assert.strictEqual(rec.ratingDelta, 0);
  assert.strictEqual(rec.recommendationRating, 1600);
  assert.match(rec.reason, /Already beyond/);
});

test('demotion inverts the quartiles and clamps downward', () => {
  const state = syntheticState();
  state.subject.rating = 1000; // already below the boundary
  const down = R.getRecommendation({
    state, tierOf: synthTier, subject: 'subject', fromTier: 'B', toTier: 'C',
    eventType: E.EVENT.DEMOTION, params: { alpha: 0.5 },
  });
  assert.strictEqual(down.direction, 'demotion');
  assert.strictEqual(down.ratingDelta, 0, 'a demotion never raises a rating');

  state.subject.rating = 1500;
  const real = R.getRecommendation({
    state, tierOf: synthTier, subject: 'subject', fromTier: 'B', toTier: 'C',
    eventType: E.EVENT.DEMOTION, params: { alpha: 0.5 },
  });
  assert.ok(real.ratingDelta < 0);
  assert.ok(real.recommendationRating < 1500);
});

test('ships conservative: default alpha is 0.25, below the best-performing 0.50', () => {
  assert.strictEqual(R.DEFAULTS.alpha, 0.25);
  assert.strictEqual(R.BEST_PERFORMING_ALPHA.PROMOTION, 0.50);
  const rec = R.getRecommendation({
    state: syntheticState(), tierOf: synthTier, subject: 'subject',
    fromTier: 'C', toTier: 'B', eventType: E.EVENT.PROMOTION,
  });
  assert.strictEqual(rec.alpha, 0.25);
  assert.strictEqual(rec.bestPerformingAlpha, 0.50);
});

test('established threshold is a parameter, not a constant', () => {
  assert.strictEqual(R.DEFAULTS.minEvidence, 5, 'Exp 13 used 8; 13B/13C used 5 and are the validated runs');
  const state = syntheticState();
  state.c1.effectiveEvidence = 2;
  const loose = R.tierBoundaryT2({ state, tierOf: synthTier, subject: 'subject', fromTier: 'C', toTier: 'B', direction: 'promotion', minEvidence: 1 });
  const strict = R.tierBoundaryT2({ state, tierOf: synthTier, subject: 'subject', fromTier: 'C', toTier: 'B', direction: 'promotion', minEvidence: 5 });
  assert.strictEqual(loose.fromPoolSize, 4, 'c1 still counts at a threshold of 1');
  assert.strictEqual(strict.fromPoolSize, 3, 'c1 drops out at a threshold of 5');
});

test('no Reliability recommendation is fabricated', () => {
  const rec = R.getRecommendation({
    state: syntheticState(), tierOf: synthTier, subject: 'subject',
    fromTier: 'C', toTier: 'B', eventType: E.EVENT.PROMOTION,
  });
  assert.strictEqual(rec.recommendationReliability, null,
    'no validated method exists for recommending a Reliability change');
  assert.ok(typeof rec.currentReliability === 'number');
});

test('a recommendation is advisory: it never mutates state', () => {
  const state = syntheticState();
  const before = JSON.parse(JSON.stringify(state));
  R.getRecommendation({
    state, tierOf: synthTier, subject: 'subject', fromTier: 'C', toTier: 'B',
    eventType: E.EVENT.PROMOTION,
  });
  assert.deepStrictEqual(state, before);
});

test('recommendations carry a method version distinct from the engine version', () => {
  assert.strictEqual(R.RECOMMENDATION_METHOD_VERSION, 't2-quartile-v1');
  assert.notStrictEqual(R.RECOMMENDATION_METHOD_VERSION, E.RATING_MODEL_VERSION);
});
