// Two-stage validation (§7). Stage 1 proves the engine mathematics are
// faithful to Experiments 11/12 under those experiments' own assumptions.
// Stage 2 is the authoritative v3 replay with the §5.3 historical
// classifications -- deliberately different numbers, and the ones that count.

const test = require('node:test');
const assert = require('node:assert');
const E = require('../assets/js/ratingEngine.js');
const D = require('./helpers/dataset.js');

// Checkpoints are quoted to 2dp in the spec, so compare at that precision.
const at2dp = (x) => Math.round(x * 100) / 100;
const at1dp = (x) => Math.round(x * 10) / 10;

test('the experiment dataset is 144 matches and includes the 3 draws', () => {
  const ds = D.experimentDataset();
  assert.strictEqual(ds.length, 144);
  const draws = ds.filter((m) => m.outcome === E.OUTCOME.DRAW);
  assert.strictEqual(draws.length, 3, 'the draws the legacy parser dropped must be recovered');
  assert.deepStrictEqual(draws.map((m) => m.date), ['2026-09-01', '2026-09-02', '2026-09-04']);
  // The screenshot match that is not in the dated export.
  assert.ok(ds.some((m) => m.date === '2026-09-13' && m.teamA.join(' & ') === 'MK & Rocky'));
});

test('every match in the dataset has four (or two) known players and a usable score', () => {
  D.experimentDataset().forEach((m) => {
    const n = m.teamA.length + m.teamB.length;
    assert.ok(n === 4 || n === 2, `${m.id} has ${n} players`);
    assert.ok(m.sets.length > 0);
    m.sets.forEach((s) => {
      assert.strictEqual(s.length, 2, `${m.id} has a malformed set`);
      assert.ok(Number.isFinite(s[0]) && Number.isFinite(s[1]), `${m.id} has a non-numeric game count`);
    });
  });
});

// ---------- Stage 1 (§7.1 / §7.2) ----------

test('Stage 1 reproduces the Experiment 12 monthly checkpoints', () => {
  const { journey } = D.replayStage(1, null, 'experiment');
  assert.strictEqual(at2dp(D.monthlyPct(journey, 'Rishi', '2026-06')), 8.17);
  assert.strictEqual(at2dp(D.monthlyPct(journey, 'Rishi', '2026-07')), 0.22);
  assert.strictEqual(at2dp(D.monthlyPct(journey, 'Rishi', '2026-08')), 4.57);
  assert.strictEqual(at2dp(D.monthlyPct(journey, 'Rishi', '2026-09')), 4.90);
  assert.strictEqual(at1dp(D.monthlyPct(journey, 'MK', '2026-08')), 23.2);
});

test('Stage 1 reproduces the Experiment 12 final ratings', () => {
  const { state } = D.replayStage(1, null, 'experiment');
  assert.strictEqual(at1dp(state.Shaun.rating), 1385.7);
  assert.strictEqual(at1dp(state.Tom.rating), 1358.4);
});

// ---------- Stage 2 (§7.3) ----------

test('Stage 2 reproduces the authoritative monthly performance', () => {
  const { journey } = D.replayStage(2, null, 'experiment');
  assert.strictEqual(at2dp(D.monthlyPct(journey, 'Rishi', '2026-06')), 5.81);
  assert.strictEqual(at2dp(D.monthlyPct(journey, 'Rishi', '2026-07')), -1.11);
  assert.strictEqual(at2dp(D.monthlyPct(journey, 'Rishi', '2026-08')), 4.35);
  assert.strictEqual(at2dp(D.monthlyPct(journey, 'Rishi', '2026-09')), 3.80);
});

test('Stage 2 reproduces the authoritative final ratings', () => {
  const { state } = D.replayStage(2, null, 'experiment');
  assert.strictEqual(at1dp(state.Shaun.rating), 1178.7);
  assert.strictEqual(at1dp(state.Tom.rating), 1148.0);
});

test('Stage 2 diverges from Stage 1 exactly where the spec says it should', () => {
  const s1 = D.replayStage(1).state;
  const s2 = D.replayStage(2).state;
  // Shaun and Tom were reseeded, so they move a long way.
  assert.ok(s1.Shaun.rating - s2.Shaun.rating > 200);
  assert.ok(s1.Tom.rating - s2.Tom.rating > 200);
  // Fatch was already seeded at C in both stages, so his own seed is unchanged;
  // he only moves through playing Shaun and Tom.
  assert.ok(Math.abs(s1.Fatch.rating - s2.Fatch.rating) < 40);
});

test('the historical classifications never manufacture rating', () => {
  const { journey } = D.replayStage(2);
  journey
    .filter((e) => [E.EVENT.INITIAL_CLASSIFICATION_CORRECTION, E.EVENT.PROMOTION].includes(e.eventType))
    .forEach((e) => {
      assert.strictEqual(e.newPowerRating, e.previousPowerRating, e.playerId + ' gained rating from a tier event');
      assert.strictEqual(e.newReliability, e.previousReliability);
      assert.strictEqual(e.previousTier, 'C');
      assert.strictEqual(e.newTier, 'B');
    });
});

test('lifetimeMatches survives the whole replay as a factual count', () => {
  const { state, journey } = D.replayStage(2);
  const played = {};
  journey.filter((e) => e.eventType === E.EVENT.MATCH_UPDATE)
    .forEach((e) => { played[e.playerId] = (played[e.playerId] || 0) + 1; });
  Object.entries(played).forEach(([name, n]) => assert.strictEqual(state[name].lifetimeMatches, n));
});

test('replay is reproducible across runs and independent of input order', () => {
  const a = D.replayStage(2);
  const b = D.replayStage(2);
  assert.deepStrictEqual(a.state, b.state);

  // Every match carries a sourceIndex derived from its permanent Match ID, so
  // the order rows happen to arrive in cannot reach the result at all.
  const ds = D.experimentDataset();
  const forward = D.replayStage(2, ds);
  const reversed = D.replayStage(2, ds.slice().reverse());
  assert.deepStrictEqual(reversed.state, forward.state,
    'database retrieval order must never determine ratings');

  const shuffled = ds.slice();
  for (let i = shuffled.length - 1; i > 0; i--) {
    const j = (i * 7919 + 13) % (i + 1); // deterministic shuffle
    [shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]];
  }
  assert.deepStrictEqual(D.replayStage(2, shuffled).state, forward.state);
});

// ---------- Experiment 11 walk-forward accuracy (§7.2, §21) ----------

function walkForward(stage) {
  const { journey } = D.replayStage(stage, null, 'experiment');
  const byMatch = {};
  journey.filter((e) => e.eventType === E.EVENT.MATCH_UPDATE)
    .forEach((e) => { (byMatch[e.matchId] = byMatch[e.matchId] || []).push(e); });

  let predictable = 0, decided = 0, correct = 0;
  D.experimentDataset('experiment').forEach((m) => {
    const evs = byMatch[m.id];
    const priorGames = {};
    evs.forEach((e) => { priorGames[e.playerId] = e.lifetimeMatchesAtEvent - 1; });
    if (![...m.teamA, ...m.teamB].every((n) => priorGames[n] >= 1)) return;
    predictable++;
    if (m.outcome === E.OUTCOME.DRAW) return; // no winner to score
    decided++;
    if (evs.find((e) => e.side === 'A').preMatchExpectedScore > 0.5) correct++;
  });
  return { predictable, decided, accuracy: 100 * correct / decided };
}

test('Experiment 11: 66.4% walk-forward accuracy over 122 predictable matches', () => {
  const r = walkForward(1);
  assert.strictEqual(r.predictable, 122, 'matches where all four players had >=1 prior match');
  assert.strictEqual(r.decided, 119, 'the 3 draws are predictable but have no winner to score');
  assert.strictEqual(at1dp(r.accuracy), 66.4);
});

test('the authoritative history predicts at least as well as Stage 1', () => {
  assert.ok(walkForward(2).accuracy >= walkForward(1).accuracy);
});

test('no monthly reset: September opens where August closed', () => {
  const { journey } = D.replayStage(2);
  const rishi = journey.filter((e) => e.eventType === E.EVENT.MATCH_UPDATE && e.playerId === 'Rishi');
  const lastAug = [...rishi].reverse().find((e) => e.effectiveDate.startsWith('2026-08'));
  const firstSep = rishi.find((e) => e.effectiveDate.startsWith('2026-09'));
  assert.ok(Math.abs(firstSep.preMatchRating - lastAug.postMatchRating) < 1e-9);
});
