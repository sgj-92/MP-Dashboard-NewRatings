const test = require('node:test');
const assert = require('node:assert');
const E = require('../assets/js/ratingEngine.js');

const close = (a, b, eps = 1e-9) => assert.ok(Math.abs(a - b) < eps, `${a} !~ ${b}`);

// ---------- §2 fixed parameters and the published K curve ----------

test('fixed parameters are 40 / 10 / 10, not legacy 60 / 12', () => {
  assert.strictEqual(E.KMAX, 40);
  assert.strictEqual(E.KMIN, 10);
  assert.strictEqual(E.RC, 10);
  assert.strictEqual(E.RATING_MODEL_VERSION, 'sequential-v1');
});

test('K curve reproduces every row of the §2 table', () => {
  const rows = [
    [0, 0.0, 40.0],
    [1, 0.0909, 37.3],
    [5, 0.3333, 30.0],
    [10, 0.5, 25.0],
    [20, 0.6667, 20.0],
    [40, 0.8, 16.0],
    [70, 0.875, 13.8],
  ];
  // The table prints K to 1dp, so compare at that display precision:
  // e=70 is exactly 13.75, which the spec shows as 13.8.
  for (const [evidence, rel, k] of rows) {
    close(E.reliability(evidence), rel, 5e-5);
    assert.strictEqual(Math.round(E.kForEvidence(evidence) * 10) / 10, k);
  }
});

test('K = 10 + 30*(1-reliability) is identical to kMin + (kMax-kMin)*(1-reliability)', () => {
  for (let e = 0; e <= 200; e++) {
    const r = E.reliability(e);
    close(E.kFactor(r), 10 + 30 * (1 - r));
  }
});

test('K is asymptotic toward kMin and never leaves [kMin, kMax]', () => {
  close(E.kForEvidence(0), 40);
  assert.ok(E.kForEvidence(100000) > 10);
  for (let e = 0; e <= 5000; e += 7) {
    const k = E.kForEvidence(e);
    assert.ok(k <= 40 + 1e-9 && k >= 10 - 1e-9);
  }
});

// ---------- §9.4 reliability override inversion ----------

test('reliability override inverts to real effective evidence', () => {
  close(E.effectiveEvidenceForReliability(0.25), 10 * 0.25 / 0.75, 1e-9);
  close(E.effectiveEvidenceForReliability(0.15), 1.7647, 1e-4);
  close(E.effectiveEvidenceForReliability(0.33), 4.9254, 1e-4);
});

test('reliability inversion round-trips and genuinely changes future K', () => {
  for (const r of [0.05, 0.25, 0.5, 0.8, 0.95]) {
    const e = E.effectiveEvidenceForReliability(r);
    close(E.reliability(e), r, 1e-12);
  }
  const low = E.kForEvidence(E.effectiveEvidenceForReliability(0.15));
  const high = E.kForEvidence(E.effectiveEvidenceForReliability(0.9));
  assert.ok(low > high, 'low reliability must give a larger K');
});

// ---------- §3 match mathematics ----------

test('expected scores are complementary and symmetric', () => {
  close(E.expectedScore(1400, 1400), 0.5);
  close(E.expectedScore(1400, 1400) + E.expectedScore(1400, 1400), 1);
  const a = E.expectedScore(1700, 1400);
  const b = E.expectedScore(1400, 1700);
  close(a + b, 1);
  assert.ok(a > 0.5 && b < 0.5);
});

test('80/20 blend: win, loss and draw', () => {
  // 12 games to 6 -> share 0.667
  const win = E.actualScores([[6, 3], [6, 3]], E.OUTCOME.A_WINS);
  close(win.a, 0.8 * (12 / 18) + 0.2 * 1.0);
  close(win.b, 0.8 * (6 / 18) + 0.2 * 0.0);
  close(win.a + win.b, 1);

  const loss = E.actualScores([[6, 3], [6, 3]], E.OUTCOME.B_WINS);
  close(loss.a, 0.8 * (12 / 18) + 0.2 * 0.0);

  const draw = E.actualScores([[6, 3], [3, 6]], E.OUTCOME.DRAW);
  close(draw.a, 0.8 * 0.5 + 0.2 * 0.5);
  close(draw.a, 0.5);
  close(draw.a + draw.b, 1);
});

test('pair rating is the plain mean, and handles singles', () => {
  const r = { X: 1500, Y: 1300, Z: 1600 };
  const of = (n) => r[n];
  close(E.pairRating(['X', 'Y'], of), 1400);
  close(E.pairRating(['Z'], of), 1600);
});

// ---------- §3.4/§3.5 residuals and the weighted update ----------

function seed(map) {
  const s = {};
  Object.entries(map).forEach(([name, cfg]) => {
    s[name] = E.initialisePlayer(typeof cfg === 'string' ? { tier: cfg } : cfg);
  });
  return s;
}

test('residualB is exactly -residualA', () => {
  const state = seed({ A1: 'B', A2: 'B', B1: 'A', B2: 'C' });
  const rec = E.processMatch(state, {
    id: 'm', date: '2026-06-01', teamA: ['A1', 'A2'], teamB: ['B1', 'B2'],
    sets: [[6, 4], [3, 6], [7, 5]], outcome: E.OUTCOME.A_WINS,
  });
  close(rec.residualB, -rec.residualA, 1e-12);
  close(rec.expectedA + rec.expectedB, 1, 1e-12);
  close(rec.actualA + rec.actualB, 1, 1e-12);
});

test('each player moves by their own K (weighted, not strict zero-sum)', () => {
  // Same team, wildly different evidence -> different movement for the same residual.
  const state = seed({
    New: { tier: 'B' }, Vet: { tier: 'B' }, O1: { tier: 'B' }, O2: { tier: 'B' },
  });
  state.Vet.effectiveEvidence = 70;
  const rec = E.processMatch(state, {
    id: 'm', date: '2026-06-01', teamA: ['New', 'Vet'], teamB: ['O1', 'O2'],
    sets: [[6, 2], [6, 2]], outcome: E.OUTCOME.A_WINS,
  });
  const evNew = rec.events.find((e) => e.playerId === 'New');
  const evVet = rec.events.find((e) => e.playerId === 'Vet');
  close(evNew.kUsed, 40);
  close(evVet.kUsed, 13.75);
  assert.ok(Math.abs(evNew.ratingDelta) > Math.abs(evVet.ratingDelta));
  // Not strict zero-sum: total movement does not cancel.
  const total = rec.events.reduce((s, e) => s + e.ratingDelta, 0);
  assert.ok(Math.abs(total) > 1e-6, 'weighted mode is deliberately not strict zero-sum');
});

test('K is taken from PRE-match evidence, and evidence/lifetime both increment', () => {
  const state = seed({ P1: 'B', P2: 'B', P3: 'B', P4: 'B' });
  const rec = E.processMatch(state, {
    id: 'm', date: '2026-06-01', teamA: ['P1', 'P2'], teamB: ['P3', 'P4'],
    sets: [[6, 0]], outcome: E.OUTCOME.A_WINS,
  });
  close(rec.events[0].kUsed, 40); // evidence was 0 at kick-off, not 1
  assert.strictEqual(state.P1.effectiveEvidence, 1);
  assert.strictEqual(state.P1.lifetimeMatches, 1);
});

// ---------- §4 draw-safe Team A / Team B model ----------

test('underdogs drawing a stronger pair get a positive residual', () => {
  const state = seed({ U1: 'C', U2: 'C', F1: 'A', F2: 'A' });
  const rec = E.processMatch(state, {
    id: 'd', date: '2026-09-01', teamA: ['U1', 'U2'], teamB: ['F1', 'F2'],
    sets: [[6, 3], [3, 6]], outcome: E.OUTCOME.DRAW,
  });
  assert.ok(rec.residualA > 0, 'underdog draw must be positive');
  assert.ok(rec.residualB < 0, 'favourite draw must be negative');
});

test('favourites drawing a weaker pair get a negative residual', () => {
  const state = seed({ F1: 'A', F2: 'A', U1: 'C', U2: 'C' });
  const rec = E.processMatch(state, {
    id: 'd', date: '2026-09-01', teamA: ['F1', 'F2'], teamB: ['U1', 'U2'],
    sets: [[6, 3], [3, 6]], outcome: E.OUTCOME.DRAW,
  });
  assert.ok(rec.residualA < 0);
  assert.ok(rec.residualB > 0);
});

test('an evenly matched draw is a near-zero signal', () => {
  const state = seed({ A1: 'B', A2: 'B', B1: 'B', B2: 'B' });
  const rec = E.processMatch(state, {
    id: 'd', date: '2026-09-02', teamA: ['A1', 'A2'], teamB: ['B1', 'B2'],
    sets: [[6, 4], [4, 6]], outcome: E.OUTCOME.DRAW,
  });
  assert.ok(Math.abs(rec.residualA) < 1e-9, 'even draw should be ~0, got ' + rec.residualA);
});

test('MK & Rocky style underdog win (1-6 7-5 6-4) is a meaningful positive signal', () => {
  // Underdog pair loses the first set heavily and still wins the match.
  const state = seed({ MK: 'B', Rocky: 'B', Max: 'A', Harry: 'A' });
  const rec = E.processMatch(state, {
    id: 'sep13', date: '2026-09-13', teamA: ['MK', 'Rocky'], teamB: ['Max', 'Harry'],
    sets: [[1, 6], [7, 5], [6, 4]], outcome: E.OUTCOME.A_WINS,
  });
  assert.ok(rec.residualA > 0.15, 'expected a meaningful positive residual, got ' + rec.residualA);
  rec.events.filter((e) => e.side === 'A').forEach((e) => assert.ok(e.ratingDelta > 0));
  rec.events.filter((e) => e.side === 'B').forEach((e) => assert.ok(e.ratingDelta < 0));
});

test('legacy {winners,losers} migrates to Team A / Team B with sets intact', () => {
  const m = E.fromLegacyMatch({ id: 'base_0', date: '2026-07-02', winners: ['Len', 'Eli'], losers: ['Shaun', 'Osh'], sets: [[0, 6], [6, 3], [6, 4]], type: 'doubles' });
  assert.deepStrictEqual(m.teamA, ['Len', 'Eli']);
  assert.deepStrictEqual(m.teamB, ['Shaun', 'Osh']);
  assert.deepStrictEqual(m.sets, [[0, 6], [6, 3], [6, 4]]);
  assert.strictEqual(m.outcome, E.OUTCOME.A_WINS);
  assert.strictEqual(m.drawSideAssignmentArbitrary, false);
});

test('a legacy draw records that its side assignment was arbitrary', () => {
  const m = E.fromLegacyMatch({ id: 'x', date: '2026-09-01', winners: ['Osh', 'Tom'], losers: ['PDM', 'Jords'], sets: [[6, 3], [3, 6]], isDraw: true });
  assert.strictEqual(m.outcome, E.OUTCOME.DRAW);
  assert.strictEqual(m.drawSideAssignmentArbitrary, true);
});

// ---------- §5 initialisation ----------

test('tier baselines are C1100 B1400 A1700 S2000', () => {
  assert.deepStrictEqual(E.TIER_SEED, { S: 2000, A: 1700, B: 1400, C: 1100 });
  assert.strictEqual(E.initialisePlayer({ tier: 'C' }).rating, 1100);
  assert.strictEqual(E.initialisePlayer({ tier: 'S' }).rating, 2000);
});

// ---------- §6.1 deterministic ordering ----------

test('same-date matches keep source order, and retrieval order never decides ratings', () => {
  const src = [
    { id: 'b', date: '2026-06-02' },
    { id: 'a', date: '2026-06-01' },
    { id: 'c', date: '2026-06-02' },
  ];
  assert.deepStrictEqual(E.orderMatches(src).map((m) => m.id), ['a', 'b', 'c']);
  // Shuffling the input changes the result -- which is exactly why an explicit
  // source order must be pinned upstream and never left to the database.
  const shuffled = [src[2], src[0], src[1]];
  assert.deepStrictEqual(E.orderMatches(shuffled).map((m) => m.id), ['a', 'c', 'b']);
});

test('replay is deterministic: same input, same output', () => {
  const build = () => ({
    initialisations: [
      { playerId: 'P1', tier: 'B' }, { playerId: 'P2', tier: 'B' },
      { playerId: 'P3', tier: 'C' }, { playerId: 'P4', tier: 'A' },
    ],
    matches: [
      { id: 'm2', date: '2026-06-05', teamA: ['P1', 'P3'], teamB: ['P2', 'P4'], sets: [[6, 4], [6, 4]], outcome: E.OUTCOME.A_WINS },
      { id: 'm1', date: '2026-06-01', teamA: ['P1', 'P2'], teamB: ['P3', 'P4'], sets: [[6, 2], [3, 6], [7, 5]], outcome: E.OUTCOME.A_WINS },
    ],
    events: [],
  });
  const a = E.replay(build());
  const b = E.replay(build());
  assert.deepStrictEqual(a.state, b.state);
  assert.deepStrictEqual(a.journey, b.journey);
});

// ---------- §9.1 / §12 tier changes and forward-only reassessment ----------

test('a tier change alone moves Power Rating by exactly 0 and Reliability by exactly 0', () => {
  const state = seed({ Tom: { tier: 'C' } });
  state.Tom.effectiveEvidence = 12;
  state.Tom.lifetimeMatches = 12;
  const before = { ...state.Tom };
  const ev = E.applyStateEvent(state, {
    playerId: 'Tom', eventType: E.EVENT.PROMOTION, effectiveDate: '2026-07-01', newTier: 'B',
  });
  assert.strictEqual(state.Tom.rating, before.rating);
  assert.strictEqual(state.Tom.effectiveEvidence, before.effectiveEvidence);
  assert.strictEqual(ev.newPowerRating - ev.previousPowerRating, 0);
  assert.strictEqual(ev.newReliability - ev.previousReliability, 0);
  assert.strictEqual(ev.previousTier, 'C');
  assert.strictEqual(ev.newTier, 'B');
});

test('a reliability override never alters lifetimeMatches', () => {
  const state = seed({ Shaun: { tier: 'C' } });
  state.Shaun.effectiveEvidence = 20;
  state.Shaun.lifetimeMatches = 20;
  E.applyStateEvent(state, {
    playerId: 'Shaun', eventType: E.EVENT.CLUB_RATING_REASSESSMENT,
    effectiveDate: '2026-07-01', newPowerRating: 1250, newReliability: 0.25,
  });
  assert.strictEqual(state.Shaun.lifetimeMatches, 20, 'lifetimeMatches is a factual record');
  close(state.Shaun.effectiveEvidence, 10 * 0.25 / 0.75);
  assert.strictEqual(state.Shaun.rating, 1250);
});

test('INITIAL_CLASSIFICATION_CORRECTION requires PROVISIONAL and is single-use', () => {
  const state = seed({ Shaun: { tier: 'C', classificationStatus: E.CLASSIFICATION.PROVISIONAL } });
  E.applyStateEvent(state, {
    playerId: 'Shaun', eventType: E.EVENT.INITIAL_CLASSIFICATION_CORRECTION,
    effectiveDate: '2026-07-01', newTier: 'B', reasonCode: 'UNKNOWN_NEW_PLAYER',
  });
  assert.strictEqual(state.Shaun.classificationStatus, E.CLASSIFICATION.ESTABLISHED);
  assert.throws(() => E.applyStateEvent(state, {
    playerId: 'Shaun', eventType: E.EVENT.INITIAL_CLASSIFICATION_CORRECTION,
    effectiveDate: '2026-08-01', newTier: 'A',
  }), /PROVISIONAL/);
});

test('an established player cannot be corrected, only promoted/demoted', () => {
  const state = seed({ Tom: { tier: 'C' } }); // defaults to ESTABLISHED
  assert.throws(() => E.applyStateEvent(state, {
    playerId: 'Tom', eventType: E.EVENT.INITIAL_CLASSIFICATION_CORRECTION,
    effectiveDate: '2026-07-01', newTier: 'B',
  }), /PROVISIONAL/);
});

test('a reassessment affects only future state, never past matches', () => {
  const base = {
    initialisations: [
      { playerId: 'P1', tier: 'B' }, { playerId: 'P2', tier: 'B' },
      { playerId: 'P3', tier: 'B' }, { playerId: 'P4', tier: 'B' },
    ],
    matches: [
      { id: 'jun', date: '2026-06-10', teamA: ['P1', 'P2'], teamB: ['P3', 'P4'], sets: [[6, 3], [6, 3]], outcome: E.OUTCOME.A_WINS },
      { id: 'jul', date: '2026-07-10', teamA: ['P1', 'P2'], teamB: ['P3', 'P4'], sets: [[6, 3], [6, 3]], outcome: E.OUTCOME.A_WINS },
    ],
  };
  const without = E.replay({ ...base, events: [] });
  const withEv = E.replay({
    ...base,
    events: [{ playerId: 'P1', eventType: E.EVENT.CLUB_RATING_REASSESSMENT, effectiveDate: '2026-07-01', newPowerRating: 1600 }],
  });

  const junWithout = without.journey.find((e) => e.matchId === 'jun' && e.playerId === 'P1');
  const junWith = withEv.journey.find((e) => e.matchId === 'jun' && e.playerId === 'P1');
  assert.deepStrictEqual(junWith, junWithout, 'June must be byte-identical after a July reassessment');

  const julWithout = without.journey.find((e) => e.matchId === 'jul' && e.playerId === 'P1');
  const julWith = withEv.journey.find((e) => e.matchId === 'jul' && e.playerId === 'P1');
  assert.notStrictEqual(julWith.preMatchRating, julWithout.preMatchRating);
});

test('a start-of-month event lands after the prior month and before the new one', () => {
  const r = E.replay({
    initialisations: [
      { playerId: 'P1', tier: 'C', classificationStatus: E.CLASSIFICATION.PROVISIONAL },
      { playerId: 'P2', tier: 'B' }, { playerId: 'P3', tier: 'B' }, { playerId: 'P4', tier: 'B' },
    ],
    matches: [
      { id: 'jun-last', date: '2026-06-30', teamA: ['P1', 'P2'], teamB: ['P3', 'P4'], sets: [[6, 3]], outcome: E.OUTCOME.A_WINS },
      { id: 'jul-first', date: '2026-07-02', teamA: ['P1', 'P2'], teamB: ['P3', 'P4'], sets: [[6, 3]], outcome: E.OUTCOME.A_WINS },
    ],
    events: [{ playerId: 'P1', eventType: E.EVENT.INITIAL_CLASSIFICATION_CORRECTION, effectiveDate: '2026-07-01', newTier: 'B' }],
  });
  const seq = r.journey.filter((e) => e.playerId === 'P1' && e.eventType !== E.EVENT.PLAYER_INITIALISED).map((e) => e.matchId || e.eventType);
  assert.deepStrictEqual(seq, ['jun-last', 'INITIAL_CLASSIFICATION_CORRECTION', 'jul-first']);
});

// ---------- §8 Monthly Performance ----------

test('monthly performance is the simple mean residual, not game-weighted', () => {
  const journey = [
    { eventType: E.EVENT.MATCH_UPDATE, playerId: 'R', effectiveDate: '2026-06-03', actualScore: 0.70, preMatchExpectedScore: 0.50 },
    { eventType: E.EVENT.MATCH_UPDATE, playerId: 'R', effectiveDate: '2026-06-20', actualScore: 0.40, preMatchExpectedScore: 0.50 },
    { eventType: E.EVENT.MATCH_UPDATE, playerId: 'R', effectiveDate: '2026-07-01', actualScore: 0.55, preMatchExpectedScore: 0.50 },
  ];
  const out = E.calculateMonthlyPerformance(journey);
  const jun = out.find((x) => x.month === '2026-06');
  close(jun.monthlyPerformance, (0.20 + -0.10) / 2);
  close(jun.displayPct, 5.0);
  assert.strictEqual(jun.matches, 2);
  const jul = out.find((x) => x.month === '2026-07');
  close(jul.displayPct, 5.0);
});

test('monthly performance uses the blended score, never raw game share', () => {
  const state = seed({ A1: 'B', A2: 'B', B1: 'B', B2: 'B' });
  const rec = E.processMatch(state, {
    id: 'm', date: '2026-06-01', teamA: ['A1', 'A2'], teamB: ['B1', 'B2'],
    sets: [[6, 4], [6, 4]], outcome: E.OUTCOME.A_WINS,
  });
  const ev = rec.events.find((e) => e.playerId === 'A1');
  const rawShare = 12 / 20;
  assert.notStrictEqual(ev.actualScore, rawShare);
  close(ev.actualScore, 0.8 * rawShare + 0.2 * 1.0);
  const out = E.calculateMonthlyPerformance(rec.events);
  close(out.find((x) => x.playerId === 'A1').monthlyPerformance, ev.actualScore - ev.preMatchExpectedScore);
});

test('eligibility thresholds: 1-2 provisional, 3+ table, 5+ podium', () => {
  const mk = (n) => Array.from({ length: n }, (_, i) => ({
    eventType: E.EVENT.MATCH_UPDATE, playerId: 'P' + n, effectiveDate: '2026-06-0' + ((i % 9) + 1),
    actualScore: 0.5, preMatchExpectedScore: 0.5,
  }));
  const g = (n) => E.calculateMonthlyPerformance(mk(n))[0];
  assert.ok(g(1).provisional && !g(1).tableEligible && !g(1).podiumEligible);
  assert.ok(g(2).provisional && !g(2).tableEligible);
  assert.ok(!g(3).provisional && g(3).tableEligible && !g(3).podiumEligible);
  assert.ok(g(5).tableEligible && g(5).podiumEligible);
});

test('there is no monthly rating reset -- the rating carries across months', () => {
  const r = E.replay({
    initialisations: [
      { playerId: 'P1', tier: 'B' }, { playerId: 'P2', tier: 'B' },
      { playerId: 'P3', tier: 'B' }, { playerId: 'P4', tier: 'B' },
    ],
    matches: [
      { id: 'jun', date: '2026-06-30', teamA: ['P1', 'P2'], teamB: ['P3', 'P4'], sets: [[6, 2]], outcome: E.OUTCOME.A_WINS },
      { id: 'jul', date: '2026-07-01', teamA: ['P1', 'P2'], teamB: ['P3', 'P4'], sets: [[6, 2]], outcome: E.OUTCOME.A_WINS },
    ],
    events: [],
  });
  const jun = r.journey.find((e) => e.matchId === 'jun' && e.playerId === 'P1');
  const jul = r.journey.find((e) => e.matchId === 'jul' && e.playerId === 'P1');
  close(jul.preMatchRating, jun.postMatchRating);
  assert.notStrictEqual(jul.preMatchRating, E.TIER_SEED.B);
});

// ---------- §6 persisted pre-match expectation ----------

test('every match event persists the pre-match expectation and rating', () => {
  const state = seed({ P1: 'B', P2: 'C', P3: 'A', P4: 'B' });
  const rec = E.processMatch(state, {
    id: 'm', date: '2026-06-01', teamA: ['P1', 'P2'], teamB: ['P3', 'P4'],
    sets: [[6, 4]], outcome: E.OUTCOME.A_WINS,
  });
  assert.strictEqual(rec.events.length, 4);
  rec.events.forEach((e) => {
    assert.ok(typeof e.preMatchExpectedScore === 'number');
    assert.ok(typeof e.preMatchRating === 'number');
    assert.ok(typeof e.kUsed === 'number');
    assert.strictEqual(e.ratingModelVersion, 'sequential-v1');
    close(e.postMatchRating, e.preMatchRating + e.ratingDelta);
  });
});

// ---------- §5.3 / §5.2 historical classifications ----------

test('Shaun, Tom and Fatch reconstruct with the authoritative §5.3 history', () => {
  const state = seed({
    Shaun: { tier: 'C', classificationStatus: E.CLASSIFICATION.PROVISIONAL },
    Tom: { tier: 'C' },
    Fatch: { tier: 'C' },
  });
  assert.strictEqual(state.Shaun.rating, 1100);
  assert.strictEqual(state.Tom.rating, 1100);
  assert.strictEqual(state.Fatch.rating, 1100);

  // All three are tier events: rating must not move.
  const shaun = E.applyStateEvent(state, { playerId: 'Shaun', eventType: E.EVENT.INITIAL_CLASSIFICATION_CORRECTION, effectiveDate: '2026-07-01', newTier: 'B', reasonCode: 'UNKNOWN_NEW_PLAYER' });
  const tom = E.applyStateEvent(state, { playerId: 'Tom', eventType: E.EVENT.PROMOTION, effectiveDate: '2026-07-01', newTier: 'B' });
  const fatch = E.applyStateEvent(state, { playerId: 'Fatch', eventType: E.EVENT.PROMOTION, effectiveDate: '2026-08-01', newTier: 'B' });
  [shaun, tom, fatch].forEach((ev) => {
    assert.strictEqual(ev.newPowerRating, 1100, 'tier events must not manufacture rating');
    assert.strictEqual(ev.previousTier, 'C');
    assert.strictEqual(ev.newTier, 'B');
  });
  assert.strictEqual(shaun.previousClassificationStatus, E.CLASSIFICATION.PROVISIONAL);
  assert.strictEqual(tom.previousClassificationStatus, E.CLASSIFICATION.ESTABLISHED);
});

test('promotion must not rebase to the new tier seed (Experiment 13C)', () => {
  const state = seed({ Shaun: { tier: 'C', classificationStatus: E.CLASSIFICATION.PROVISIONAL } });
  state.Shaun.rating = 1290;
  E.applyStateEvent(state, { playerId: 'Shaun', eventType: E.EVENT.INITIAL_CLASSIFICATION_CORRECTION, effectiveDate: '2026-07-01', newTier: 'B' });
  assert.strictEqual(state.Shaun.rating, 1290, 'promoted to B must NOT mean rating = 1400');
});
