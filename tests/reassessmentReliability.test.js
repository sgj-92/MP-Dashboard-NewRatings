// Modelling the Recommended Reliability for a club reassessment.
//
// Nothing here ships yet: the Ledger requires the candidate rules to be
// validated against the club's own decisions before a formula is chosen. These
// tests pin what that validation found and the properties ANY chosen rule has
// to have, so whichever one is picked cannot quietly lose them on the way into
// the engine.

const test = require('node:test');
const assert = require('node:assert');
const Engine = require('../assets/js/ratingEngine.js');
const M = require('../scripts/model-reassessment-reliability.js');

const rel = (e) => Engine.reliability(e);

// The three decisions the club has actually made, read out of the live record
// on 20 Sep 2026 with `scripts/model-reassessment-reliability.js`. Reproduce
// with: node scripts/model-reassessment-reliability.js
const HISTORY = [
  { playerId: 'Shaun', evidenceBefore: 5, reliabilityBefore: 5 / 15, ratingMove: 263.1972512972129, chose: 0.10 },
  { playerId: 'Tom', evidenceBefore: 4, reliabilityBefore: 4 / 14, ratingMove: 249.08709925125277, chose: 0.10 },
  { playerId: 'Fatch', evidenceBefore: 14, reliabilityBefore: 14 / 24, ratingMove: 222.2700480982246, chose: 0.10 },
];

// The constants above must stay derivable from the engine, not drift into
// hand-typed numbers that no longer mean anything.
test('the recorded decisions are self-consistent with the engine', () => {
  HISTORY.forEach((h) => {
    assert.ok(Math.abs(rel(h.evidenceBefore) - h.reliabilityBefore) < 1e-12,
      `${h.playerId}: ${h.evidenceBefore} evidence is not ${h.reliabilityBefore} reliability`);
  });
});

const fits = (rule) => HISTORY.every((h) => Math.abs(rule.apply(h) - h.chose) < 0.005);

test('the club has answered one situation three times, not three situations', () => {
  const chosen = [...new Set(HISTORY.map((h) => h.chose))];
  assert.strictEqual(chosen.length, 1, 'every decision chose the same reliability');
  // Prior evidence varied by more than 3x and changed nothing.
  assert.ok(Math.max(...HISTORY.map((h) => h.evidenceBefore))
    >= 3 * Math.min(...HISTORY.map((h) => h.evidenceBefore)));
  // And every move was most of a tier.
  HISTORY.forEach((h) => {
    const share = Math.abs(h.ratingMove) / M.TIER_WIDTH;
    assert.ok(share > 0.7 && share < 1.0, `${h.playerId} moved ${(share * 100).toFixed(0)}% of a tier`);
  });
});

test('a flat reopen fits the record exactly', () => {
  assert.ok(fits(M.RULES.flat));
});

// This is the one candidate the evidence actually rules out. Fatch had 14
// matches behind him and was reopened to the same 10% as Tom, who had 4.
test('scaling the prior evidence cannot fit the record, and Fatch is why', () => {
  [0.25, 0.5, 0.75].forEach((f) => {
    const rule = M.RULES.proportional(f);
    assert.ok(!fits(rule), `keeping ${f * 100}% of prior evidence should not fit`);
    const fatch = HISTORY.find((h) => h.playerId === 'Fatch');
    const tom = HISTORY.find((h) => h.playerId === 'Tom');
    assert.ok(rule.apply(fatch) > rule.apply(tom) + 0.05,
      'a proportional rule must give the better-evidenced player materially more, which the club did not');
  });
});

// What the record establishes is a BOUND, not a value.
test('a move-scaled rule fits for any full-reopen distance at or below the smallest observed move', () => {
  const smallest = Math.min(...HISTORY.map((h) => Math.abs(h.ratingMove)));
  [100, 150, 200, Math.floor(smallest)].forEach((d) => {
    assert.ok(fits(M.RULES.moveScaled(d)), `${d} points should reproduce all three`);
  });
  [Math.ceil(smallest) + 30, 300, 450].forEach((d) => {
    assert.ok(!fits(M.RULES.moveScaled(d)), `${d} points should not reproduce all three`);
  });
});

// Properties any rule must have, whichever is chosen.
test('reassessing a rating never makes the club more confident in it', () => {
  const rules = [M.RULES.flat, M.RULES.proportional(0.5), M.RULES.moveScaled(150), M.RULES.moveScaled(300)];
  for (let evidence = 0.5; evidence <= 40; evidence += 0.5) {
    for (let move = 0; move <= 400; move += 25) {
      const facts = { evidenceBefore: evidence, reliabilityBefore: rel(evidence), ratingMove: move };
      rules.forEach((r) => {
        const out = r.apply(facts);
        assert.ok(out <= facts.reliabilityBefore + 1e-9,
          `${r.label} raised reliability from ${facts.reliabilityBefore.toFixed(3)} to ${out.toFixed(3)}`
          + ` (evidence ${evidence}, move ${move})`);
        assert.ok(out > 0 && out < 1, `${r.label} produced ${out}`);
      });
    }
  }
});

test('a bigger correction never leaves more confidence than a smaller one', () => {
  [M.RULES.moveScaled(150), M.RULES.moveScaled(300)].forEach((r) => {
    for (let evidence = 1; evidence <= 30; evidence += 1) {
      let last = Infinity;
      for (let move = 0; move <= 400; move += 10) {
        const out = r.apply({ evidenceBefore: evidence, reliabilityBefore: rel(evidence), ratingMove: move });
        assert.ok(out <= last + 1e-9, `${r.label} rose at move ${move} for evidence ${evidence}`);
        last = out;
      }
    }
  });
});

test('a move-scaled rule leaves an untouched rating untouched', () => {
  [150, 300].forEach((d) => {
    for (let evidence = 1; evidence <= 30; evidence += 1) {
      const before = rel(evidence);
      const out = M.RULES.moveScaled(d).apply({ evidenceBefore: evidence, reliabilityBefore: before, ratingMove: 0 });
      assert.ok(Math.abs(out - before) < 1e-9,
        `a reassessment that moves the rating nowhere must change nothing (evidence ${evidence})`);
    }
  });
});

// The difference that matters, stated as a number rather than an opinion.
test('the candidates agree on the cases seen and disagree on the case coming', () => {
  const settled = { evidenceBefore: 20, reliabilityBefore: rel(20), ratingMove: 30 };
  const flat = M.RULES.flat.apply(settled);
  const scaled = M.RULES.moveScaled(150).apply(settled);
  assert.ok(scaled - flat > 0.4,
    `on a 30-point correction to a 20-match player the rules should differ sharply,`
    + ` got flat ${flat.toFixed(3)} vs move-scaled ${scaled.toFixed(3)}`);

  // And on the cases already decided, they do not differ at all.
  HISTORY.forEach((h) => {
    assert.ok(Math.abs(M.RULES.flat.apply(h) - M.RULES.moveScaled(150).apply(h)) < 0.005,
      `${h.playerId} must not be able to tell the two rules apart`);
  });
});

// Reopening is paid for in matches, and the cost is arithmetic.
test('what a reopened reliability costs is exact, not fitted', () => {
  const E = Engine.effectiveEvidenceForReliability;
  assert.ok(Math.abs(E(0.10) - 10 / 9) < 1e-9);
  // Evidence rises by exactly 1 a match, so 10% is nine matches short of 50%.
  assert.strictEqual(Math.ceil(E(0.50) - E(0.10)), 9);
  assert.strictEqual(Math.ceil(E(0.50) - E(0.25)), 7);
});
