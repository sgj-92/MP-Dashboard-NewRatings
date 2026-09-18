// Regression tests for the application, not its modules.
//
// Each test here corresponds to a defect that actually shipped during the v3
// integration and was found by a person driving a browser. Every module
// involved was correct in isolation; the application wired them up wrongly, so
// no module test could have caught any of it.
//
// Skips when Playwright or a browser is unavailable. A suite that goes red for
// an absent dependency teaches people to ignore red.

const test = require('node:test');
const assert = require('node:assert');
const H = require('./helpers/uiHarness.js');

const skip = H.available() ? false : 'Playwright is not available in this environment';

// One browser for the read-only checks; the ones that write get their own.
let shared = null;
test.before(async () => { if (!skip) shared = await H.open(); });
test.after(async () => { if (shared) await shared.close(); });

test('the app loads, renders, and throws nothing', { skip }, async () => {
  const state = await shared.run(() => ({
    loaded: V3_STATE.loaded,
    error: V3_STATE.error || null,
    players: PLAYERS.length,
    matches: ALL_MATCHES.length,
    rows: document.querySelectorAll('#list .row').length,
  }));
  assert.strictEqual(state.loaded, true, state.error);
  assert.strictEqual(state.players, 34);
  assert.ok(state.rows > 0, 'the rankings list rendered nothing');
  assert.deepStrictEqual(shared.pageErrors, []);
});

// Shipped defect: MONTHLY_VIEWS was built with TIER_MAP, which is {} at that
// point, so tierAsOf answered undefined for everyone outside the three-entry
// change list. June's Tier C king vanished and nothing noticed.
test('historical tier is real in the browser, not just in Node', { skip }, async () => {
  const r = await shared.run(() => {
    const out = { counts: {}, leaks: [] };
    const june = MONTHLY_VIEWS.byMonth['2026-06'];
    june.rows.forEach((x) => { const k = String(x.tierAtMonthEnd); out.counts[k] = (out.counts[k] || 0) + 1; });
    activeTab = 'power'; activeSortP = 'rating'; query = ''; minGames = 5;
    ['2026-06', '2026-07', '2026-08'].forEach((m) => {
      selectedMonth = m;
      ['A', 'B', 'C'].forEach((t) => {
        activeTier = t;
        PLAYERS.filter(matchesActiveTier).forEach((p) => {
          if (tierInScope(p) !== t) out.leaks.push(`${m} ${t}: ${p.name}`);
        });
      });
    });
    selectedMonth = '2026-06'; activeTier = 'All';
    const kings = computeKingsOfTiers();
    out.kings = kings ? ['A', 'B', 'C'].map((t) => (kings[t] ? `${t}:${kings[t].name}` : `${t}:none`)) : null;
    selectedMonth = 'all'; activeTier = 'All'; minGames = 10;
    return out;
  });
  assert.strictEqual(r.counts.undefined, undefined, `June rows with no tier: ${JSON.stringify(r.counts)}`);
  assert.deepStrictEqual(r.leaks, [], 'a player appeared under a tier they did not hold that month');
  assert.ok(r.kings.includes('C:Shaun'), `June's Tier C king is missing: ${r.kings}`);
});

// Shipped defect: the profile journey was a separate reconstruction that could
// disagree with the Power Rating, so the UI carried a disclaimer saying so.
test('the Rating Journey ends on the Power Rating and carries no disclaimer', { skip }, async () => {
  const r = await shared.run(() => {
    const out = { mismatched: [], disclaimer: false };
    Object.keys(V3_STATE.players).forEach((name) => {
      const j = JourneyView.forPlayer(V3_JOURNEY, name);
      if (!j) { out.mismatched.push(`${name}: no journey`); return; }
      if (Math.abs(j.endRating - V3_STATE.players[name].rating) > 1e-9) out.mismatched.push(name);
    });
    openSheet('Shaun');
    out.disclaimer = /Story estimate/.test(document.body.innerHTML);
    out.section = document.getElementById('sheetProfile').innerText;
    closeSheet();
    return out;
  });
  assert.deepStrictEqual(r.mismatched, []);
  assert.strictEqual(r.disclaimer, false);
  assert.match(r.section, /Rating journey/);
  assert.ok(!/not the official calculation/.test(r.section));
});

// Shipped defect: expectations were derived from TODAY's ratings and printed on
// cards about matches played months earlier -- forbidden, and unstable.
test('match cards show the ratings that played, and per-player movement', { skip }, async () => {
  const r = await shared.run(() => {
    selectedMonth = 'all';
    // A match where the four did NOT move by the same amount. Early-season
    // matches legitimately move everyone equally -- all four are at zero
    // evidence, so K is the same for all of them. The interesting case is once
    // reliabilities have diverged.
    const m = MATCHES.filter((x) => x.deltas && Object.keys(x.deltas).length === 4)
      .find((x) => new Set(Object.values(x.deltas).map((d) => Math.abs(d.ratingDelta))).size > 1);
    const facts = V3_MATCH_FACTS[m.id];
    const html = buildMatchDetailBlock(m, false);
    return {
      matchId: m.id,
      html,
      preMatch: Object.values(facts.byPlayer).map((p) => Math.round(p.preMatchRating)),
      deltas: Object.values(facts.byPlayer).map((p) => p.ratingDelta),
      // Today's ratings, which must NOT be what the card prints.
      currentRatings: [...m.winners, ...m.losers].map((n) => Math.round(PLAYERS.find((p) => p.name === n).rating)),
    };
  });
  assert.ok(r.matchId, 'no match with unequal movement found');
  r.preMatch.forEach((v) => assert.ok(r.html.includes(String(v)), `pre-match rating ${v} is not on the card`));
  // Each player's own figure, not one team number.
  r.deltas.forEach((d) => {
    const shown = d > 0 ? `+${d}` : `${d}`;
    assert.ok(r.html.includes(shown), `per-player delta ${shown} is not on the card`);
  });
  assert.match(r.html, /ratings going in/);
  assert.match(r.html, /Rating change, per player/);
  assert.match(r.html, /performance score/);
  // Never the game-share wording, which is a different quantity on the same card.
  assert.ok(!/expected ~\d+% of games/.test(r.html));
});

// Shipped defect: the Monthly Rating breakdown showed a real month-end figure
// under a fabricated explanation of a solver that had been retired.
test('the monthly breakdown describes the engine that actually ran', { skip }, async () => {
  const r = await shared.run(() => {
    const html = buildMonthlyRatingBreakdownHtml('Shaun', '2026-07');
    const ctx = getMonthlyRatingContext('Shaun', '2026-07');
    const row = MonthlyViews.playerMonth(MONTHLY_VIEWS, '2026-07', 'Shaun');
    return {
      html, opened: ctx.journey.startRating, ended: ctx.journey.endRating,
      rowOpened: row.startRating, rowEnded: row.endRating,
    };
  });
  ['K=28', '300 passes', 'solved every player', 'joint rating solver', 'tier baseline (']
    .forEach((p) => assert.ok(!r.html.includes(p), `stale copy on screen: "${p}"`));
  assert.match(r.html, /sequential-v1/);
  // The month is a window on one continuous rating, and the modal and the
  // monthly views must agree to the last bit about where it opened and closed.
  assert.strictEqual(r.opened, r.rowOpened);
  assert.strictEqual(r.ended, r.rowEnded);
});

test('no screen leaks a placeholder across any month and tier', { skip }, async () => {
  const bad = await shared.run(() => {
    const found = [];
    activeTab = 'power'; activeSortP = 'rating'; query = '';
    ['all', '2026-06', '2026-07', '2026-08', '2026-09'].forEach((m) => {
      ['All', 'A', 'B', 'C'].forEach((t) => {
        selectedMonth = m; activeTier = t; minGames = m === 'all' ? 10 : 5;
        render();
        const txt = document.getElementById('list').innerText;
        if (/undefined|NaN|\[object/.test(txt)) found.push(`${m}/${t}`);
      });
    });
    selectedMonth = 'all'; activeTier = 'All'; minGames = 10; render();
    return found;
  });
  assert.deepStrictEqual(bad, []);
  assert.deepStrictEqual(shared.pageErrors, []);
});

test('every player profile opens without error', { skip }, async () => {
  const broken = await shared.run(() => {
    const failed = [];
    PLAYERS.forEach((p) => {
      try { openSheet(p.name); closeSheet(); } catch (e) { failed.push(`${p.name}: ${e.message}`); }
    });
    return failed;
  });
  assert.deepStrictEqual(broken, []);
  assert.deepStrictEqual(shared.pageErrors, []);
});

// Shipped defect: approving a submission set a status nothing read any more, so
// the game disappeared from the list and was never rated. The club could not
// record a result.
test('approving a submitted game rates it', { skip }, async () => {
  const app = await H.open();
  try {
    const r = await app.run(async () => {
      isUnlocked = true; currentUserName = 'Tester';
      extraMatchesState.push({
        id: 'usr_ui_1', date: '2026-09-18', winners: ['Shaun', 'Tom'], losers: ['Max', 'KC'],
        sets: [[6, 3], [6, 4]], type: 'doubles', note: '', status: 'pending', submittedBy: 'Tester',
      });
      recomputeAll();
      const before = PLAYERS.find((p) => p.name === 'Shaun').rating;

      await prepareApproval('usr_ui_1');
      const staged = approvalPlan ? {
        matchId: approvalPlan.matchId,
        moved: approvalPlan.planned.playersMoved.map((p) => p.playerId).sort(),
        docs: approvalPlan.planned.documentsToWrite,
      } : { error: approvalMessage };
      // Nothing may be written before the operator confirms.
      const writesBefore = window.__writes.length;

      await commitApproval();
      const after = PLAYERS.find((p) => p.name === 'Shaun').rating;
      return {
        staged, writesBefore, before, after,
        rated: ALL_MATCHES.some((m) => m.id === staged.matchId),
        submissionGone: !extraMatchesState.some((x) => x.id === 'usr_ui_1'),
        message: approvalMessage,
      };
    });
    assert.ok(!r.staged.error, r.staged.error);
    assert.strictEqual(r.writesBefore, 0, 'nothing may be written before confirmation');
    assert.deepStrictEqual(r.staged.moved, ['KC', 'Max', 'Shaun', 'Tom']);
    assert.strictEqual(r.staged.docs, 9, 'an append should touch one match, four events and four players');
    assert.strictEqual(r.rated, true, 'the approved game must be in the rated record');
    assert.notStrictEqual(r.before, r.after, "the winner's rating must move");
    assert.strictEqual(r.submissionGone, true, 'the submission must not linger as a second copy');
    assert.deepStrictEqual(app.pageErrors, []);
  } finally { await app.close(); }
});

// Shipped defect: a confirmed delete pushed an id into deletedIdsState, saved
// it, and changed nothing -- which looked exactly like success.
test('deleting a rated game is refused and persists nothing', { skip }, async () => {
  const app = await H.open();
  try {
    const r = await app.run(async () => {
      isUnlocked = true; currentUserName = 'Tester';
      const id = MATCHES[0].id;
      const before = ALL_MATCHES.length;
      await deleteMatch(id);
      return {
        deletedState: deletedIdsState.slice(),
        stillThere: ALL_MATCHES.some((m) => m.id === id),
        count: ALL_MATCHES.length === before,
        writes: window.__writes.length,
      };
    });
    assert.deepStrictEqual(r.deletedState, [], 'nothing may be persisted for a refused deletion');
    assert.strictEqual(r.stillThere, true);
    assert.strictEqual(r.count, true);
    assert.strictEqual(r.writes, 0);
  } finally { await app.close(); }
});

test('diagnostics notices a document tampered with behind the app', { skip }, async () => {
  const app = await H.open();
  try {
    const r = await app.run(async () => {
      isUnlocked = true;
      await runBetaDiagnostics();
      const clean = diagnosticsReport.healthy;
      window.__data.players.Shaun.rating += 25;
      await runBetaDiagnostics();
      return {
        clean,
        healthy: diagnosticsReport.healthy,
        failed: diagnosticsReport.checks.filter((c) => c.status === 'fail').map((c) => c.name),
      };
    });
    assert.strictEqual(r.clean, true, 'the seeded record should be sound');
    assert.strictEqual(r.healthy, false);
    assert.ok(r.failed.includes('Stored state is the end of the stored history'));
    assert.ok(r.failed.includes('What the app shows is what is stored'));
  } finally { await app.close(); }
});

// The standing rule: no silent legacy fallback. A failed v3 read must say so,
// never substitute 1400, a tier seed, or the legacy solver.
test('a failed v3 read shows an error and invents no rating', { skip }, async () => {
  const app = await H.open({ failReads: true });
  try {
    const r = await app.run(() => ({
      loaded: V3_STATE.loaded,
      error: String(V3_STATE.error || ''),
      players: PLAYERS.length,
      matches: ALL_MATCHES.length,
      banner: (document.body.innerText.match(/could not|unavailable|failed/i) || [null])[0],
      body: document.body.innerText,
    }));
    assert.strictEqual(r.loaded, false);
    assert.ok(r.error.length > 0);
    assert.strictEqual(r.players, 0, 'no player may be given a fabricated rating');
    assert.strictEqual(r.matches, 0);
    assert.ok(r.banner, 'the failure must be visible, not silent');
    assert.ok(!/\b1400\b/.test(r.body), 'the legacy default rating must never appear');
  } finally { await app.close(); }
});
