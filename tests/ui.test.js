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

// Correcting a rated game re-derives every rating after it, so the whole
// consequence is shown before anything is written -- and nothing is written
// until it is confirmed. The controls were once worse than missing: a confirmed
// delete persisted an overlay and changed nothing at all.
test('correcting a rated game shows the blast radius and writes only on confirmation', { skip }, async () => {
  const app = await H.open();
  try {
    const r = await app.run(async () => {
      isUnlocked = true; currentUserName = 'Tester';
      const target = MATCHES.find((m) => m.date === '2026-06-02');
      const out = { id: target.id, writesBefore: window.__writes.length };

      // Removal: planned, not written.
      armedDeleteId = target.id;
      await deleteMatch(target.id);
      out.removeMoved = matchFixPlan ? matchFixPlan.playersMoved.length : -1;
      out.removeDeletes = matchFixPlan ? matchFixPlan.documentsToDelete : -1;
      out.writesAfterPlan = window.__writes.length;
      matchFixReset();
      out.writesAfterCancel = window.__writes.length;
      out.stillThere = ALL_MATCHES.some((m) => m.id === target.id);

      // Correction: planned, confirmed, replayed.
      await stageMatchCorrection({
        type: 'edit',
        match: {
          id: target.id, date: target.date, sourceIndex: 1,
          teamA: target.winners, teamB: target.losers, sets: [[6, 0], [6, 0]],
          outcome: RatingEngine.OUTCOME.A_WINS, type: 'doubles', drawSideAssignmentArbitrary: false,
        },
      }, 'Correct the score.');
      out.editMoved = matchFixPlan ? matchFixPlan.playersMoved.length : -1;
      await commitMatchCorrection();
      const after = MATCHES.find((m) => m.id === target.id);
      out.correctedScore = after ? after.score : null;

      const stored = await readStoredRecord(RatingStore.firestoreCompatBackend(db));
      out.replays = ReplayForward.verifyNoOp(stored, {}).count;
      const players = {};
      stored.players.forEach((d) => { players[d.id] = d; });
      out.healthy = BetaDiagnostics.run({ players, matches: stored.matches, journey: stored.journey }).healthy;
      return out;
    });
    assert.strictEqual(r.writesBefore, 0);
    assert.strictEqual(r.writesAfterPlan, 0, 'planning a removal must write nothing');
    assert.strictEqual(r.writesAfterCancel, 0, 'cancelling must write nothing');
    assert.strictEqual(r.stillThere, true, 'an unconfirmed removal must not remove anything');
    assert.ok(r.removeMoved > 20, 'removing a June game reaches most of the club');
    assert.strictEqual(r.removeDeletes, 5, 'the match and its four events');
    assert.ok(r.editMoved > 20);
    assert.strictEqual(r.correctedScore, '6-0, 6-0');
    assert.strictEqual(r.replays, 0, 'the corrected record must still replay to itself');
    assert.strictEqual(r.healthy, true);
    assert.deepStrictEqual(app.pageErrors, []);
  } finally { await app.close(); }
});

test('a correction that changes the date is refused rather than mis-filed', { skip }, async () => {
  const msg = await shared.run(() => matchFixDateChangeRefusal('2026-06-02', '2026-06-09'));
  assert.match(msg, /identifier is built from its date/);
  assert.match(msg, /Nothing was changed/);
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

// Tier S is a real tier the club uses, and Manny is in it. It must appear in
// tier-aware views -- but a "king" of a field of one has won nothing, so no
// crown is awarded and the card says why. Shaun's rule, 18 Sep 2026.
test('Tier S is supported, and a sole qualifier is not crowned', { skip }, async () => {
  const app = await H.open();
  try {
    const r = await app.run(() => {
      const out = {};
      activeTab = 'power'; activeSortP = 'rating'; query = '';
      selectedMonth = 'all'; activeTier = 'All'; minGames = 10;

      out.tierFilters = [...document.querySelectorAll('.tierbtn')].map((b) => b.dataset.tier);
      out.leagueGroupsBy = TIER_ORDER_LIST.slice();
      activeTier = 'S';
      out.tierSPlayers = PLAYERS.filter(matchesActiveTier).map((p) => p.name);
      activeTier = 'All';

      // Make Manny the single qualifying Tier S player.
      const manny = PLAYERS.find((p) => p.name === 'Manny');
      manny.total = 20; manny.wins = 12; manny.losses = 8;
      window.isRankingEligible = () => true;
      const kings = computeKingsOfTiers();
      out.field = kings._fieldSize.S;
      out.crowned = kings.S ? kings.S.name : null;
      renderKingsOfTiersPanel();
      out.panel = document.getElementById('kingsOfTiersPanel').innerText.replace(/\n+/g, ' | ');
      return out;
    });
    assert.ok(r.tierFilters.includes('S'), 'Tier S must be offered as a filter');
    assert.deepStrictEqual(r.tierSPlayers, ['Manny']);
    assert.deepStrictEqual(r.leagueGroupsBy, ['S', 'A', 'B', 'C'], 'the league table must group every tier');
    assert.strictEqual(r.field, 1, 'exactly one qualifier, which is the case under test');
    assert.strictEqual(r.crowned, null, 'a sole qualifier must not be crowned');
    assert.match(r.panel, /TIER S \| only one qualified/);
    assert.deepStrictEqual(app.pageErrors, []);
  } finally { await app.close(); }
});

// ===================== CGPT VISUAL ACCEPTANCE (18 Sep 2026) =====================
// Eight presentation corrections raised against the live-record screenshots.
// Each test below is the one that would have caught the thing CGPT spotted.

// There is one continuous Power Rating. Copy that says "Monthly Rating" invites
// exactly the misreading the whole v3 rewrite exists to remove: that a separate
// score is solved each month.
test('no screen calls the month-end figure a "Monthly Rating"', { skip }, async () => {
  const app = await H.open();
  try {
    const r = await app.run(() => {
      selectedMonth = '2026-07'; minGames = 5; activeTab = 'power'; render();
      openMonthlyRatingBreakdown('Shaun', '2026-07');
      const modal = document.getElementById('monthlyRatingModal');
      const t = document.getElementById('mrbHowItWorksToggle');
      if (t) t.click();
      return { text: modal.innerText, body: document.body.innerText };
    });
    assert.doesNotMatch(r.text, /monthly rating/i,
      'the breakdown still calls it a Monthly Rating');
    assert.doesNotMatch(r.text, /how monthly ratings work/i,
      'the methodology link still calls it a monthly rating');
    assert.match(r.text, /month.end power rating/i,
      'the breakdown must name it as the Power Rating at month end');
    assert.doesNotMatch(r.body, /monthly rating/i,
      'stale Monthly Rating copy is still on screen somewhere');
    assert.deepStrictEqual(app.pageErrors, []);
  } finally { await app.close(); }
});

// Set scores are stored winner-first. Printed unchanged on a card about one
// player, a defeat reads "6-3, 6-4" next to the word LOSS.
test('a player-centric card shows the score from that player\'s side', { skip }, async () => {
  const app = await H.open();
  try {
    const r = await app.run(() => {
      selectedMonth = 'all'; minGames = 10; render();
      openSheet('Shaun');
      // renderPremiumProfile reparents these out of #sheetMatches, keeping the
      // nodes (and their .match class) intact.
      const rows = [...document.querySelectorAll('.match')];
      const read = (el) => ({
        result: el.querySelector('.top span:last-child').textContent.trim(),
        score: el.querySelector('.score').textContent.trim(),
      });
      const cards = rows.map(read);
      // The stored, un-oriented score for the same matches, for comparison.
      const stored = MATCHES
        .filter((m) => m.winners.includes('Shaun') || m.losers.includes('Shaun'))
        .sort((a, b) => (a.date < b.date ? 1 : -1))
        .map((m) => ({ won: m.winners.includes('Shaun'), score: m.sets.map((s) => s.join('-')).join(', ') }));
      return { cards, stored };
    });

    const win = r.cards.find((c) => c.result === 'WIN');
    const loss = r.cards.find((c) => c.result === 'LOSS');
    assert.ok(win && loss, 'the fixture must contain both a win and a loss for Shaun');

    // In every set of an oriented card, the player's own games come first:
    // a win reads high-low, a loss reads low-high.
    const firstSet = (s) => s.split(', ')[0].split('-').map(Number);
    const [wa, wb] = firstSet(win.score);
    assert.ok(wa > wb, `a win must read from Shaun's side, got ${win.score}`);
    const [la, lb] = firstSet(loss.score);
    assert.ok(la < lb, `a loss must read from Shaun's side, got ${loss.score}`);

    // And the orientation is a flip of the stored score, not a different match.
    const storedLoss = r.stored.find((s) => !s.won);
    const flipped = storedLoss.score.split(', ').map((p) => p.split('-').reverse().join('-')).join(', ');
    assert.ok(r.cards.some((c) => c.score === flipped),
      'the oriented loss must be the stored score flipped, not recomputed');
    assert.deepStrictEqual(app.pageErrors, []);
  } finally { await app.close(); }
});

// Reliability is how much evidence stands behind a rating. It belongs on the
// profile at a glance -- and nowhere near rank or win rate.
test('the profile hero shows reliability with its band', { skip }, async () => {
  const app = await H.open();
  try {
    const r = await app.run(() => {
      selectedMonth = 'all'; minGames = 10; render();
      openSheet('Shaun');
      const facts = document.querySelector('.pp-hero-facts');
      const p = PLAYERS.find((x) => x.name === 'Shaun');
      return {
        text: facts ? facts.innerText.replace(/\n+/g, ' | ') : null,
        pct: p.reliabilityPct,
        band: p.reliabilityBand,
      };
    });
    assert.ok(r.text, 'the profile hero has no facts row');
    assert.match(r.text, /RELIABILITY/i);
    assert.ok(r.text.includes(`${Math.round(r.pct)}%`),
      `the hero must show the recorded reliability (${r.pct}%), got: ${r.text}`);
    assert.ok(r.text.includes(r.band), `the hero must name the band, got: ${r.text}`);
    assert.ok(['Provisional', 'Developing', 'Established', 'High Reliability'].includes(r.band),
      `unexpected band ${r.band}`);
    assert.deepStrictEqual(app.pageErrors, []);
  } finally { await app.close(); }
});

// An impossible action must not offer a live-looking button. Rishi is
// established, so there is no initial estimate left to correct.
test('an unavailable review action is disabled and says why', { skip }, async () => {
  const app = await H.open();
  try {
    const r = await app.run(() => {
      isUnlocked = true; currentUserName = 'Board';
      const b = document.querySelector('#tabrow .tab-btn[data-tab="manage"]');
      if (b) b.click();
      reviewSubject = 'Rishi'; renderManage();
      document.querySelector('.review-tier').click();

      const btn = document.querySelector('.review-decision[data-decision="CORRECT_INITIAL_CLASSIFICATION"]');
      const before = reviewDraft ? reviewDraft.ratingDecision : null;
      btn.click(); // must do nothing at all
      const after = reviewDraft ? reviewDraft.ratingDecision : null;
      return {
        disabled: btn.disabled,
        label: btn.textContent.trim(),
        status: (V3_STATE.players.Rishi || {}).classificationStatus,
        reasons: [...document.querySelectorAll('.reason-note')].map((e) => e.innerText),
        before, after,
      };
    });
    assert.strictEqual(r.status, 'ESTABLISHED', 'the fixture player must be established');
    assert.strictEqual(r.disabled, true, 'the impossible branch is still clickable');
    assert.strictEqual(r.label, 'Unavailable', 'a disabled action must not read "Choose"');
    assert.ok(r.reasons.some((x) => /already established/i.test(x)),
      `the reason must be shown in the panel, got: ${JSON.stringify(r.reasons)}`);
    assert.strictEqual(r.after, r.before, 'clicking an unavailable branch changed the draft');
    assert.deepStrictEqual(app.pageErrors, []);
  } finally { await app.close(); }
});

// Removing a game and correcting one are different acts. One confirmation
// serving both is how "Confirm removal?" ended up over "Correct and replay".
test('remove and correct are separate actions with their own wording', { skip }, async () => {
  const app = await H.open();
  try {
    const r = await app.run(async () => {
      isUnlocked = true; currentUserName = 'Board';
      const b = document.querySelector('#tabrow .tab-btn[data-tab="games"]');
      if (b) b.click();
      selectedMonth = 'all'; renderGamesTab();
      const yn = document.getElementById('gamesYourName'); if (yn) yn.value = 'Board';

      // The actions live behind the per-card Manage affordance now.
      document.querySelector('#gamesView [data-manage]').click();
      const correctBtn = document.querySelector('#gamesView [data-edit]');
      const removeBtn = document.querySelector('#gamesView [data-delete]');
      const labels = { correct: correctBtn.innerText.trim(), remove: removeBtn.innerText.trim() };

      // One click stages the removal: there is no invisible arming step.
      await deleteMatch(removeBtn.dataset.delete);
      const panel = [...document.querySelectorAll('#gamesView .callout-card')]
        .find((e) => /re-derives every rating/i.test(e.textContent));
      return {
        labels,
        staged: !!matchFixPlan,
        changeType: matchFixPlan ? matchFixPlan.change.type : null,
        panel: panel ? panel.innerText : null,
        commit: document.getElementById('matchFixCommitBtn').textContent.trim(),
        writes: window.__writes.length,
      };
    });
    assert.match(r.labels.correct, /^Correct match/);
    assert.match(r.labels.remove, /^Remove and replay/);
    assert.strictEqual(r.staged, true, 'one click must stage the removal');
    assert.strictEqual(r.changeType, 'delete');
    assert.match(r.panel, /Confirm removal/i, 'the removal panel must say it is a removal');
    assert.strictEqual(r.commit, 'Remove and replay',
      'a removal must not be confirmed by a button reading "Correct and replay"');
    assert.strictEqual(r.writes, 0, 'staging a removal must write nothing');
    assert.deepStrictEqual(app.pageErrors, []);
  } finally { await app.close(); }
});

// The audit trail stays whole; it just becomes readable. Superseded events are
// still there, and the live one is identifiable without reading ids.
test('the historical audit trail labels what is active and what was replaced', { skip }, async () => {
  const app = await H.open();
  try {
    const r = await app.run(() => {
      isUnlocked = true; currentUserName = 'Board';
      const b = document.querySelector('#tabrow .tab-btn[data-tab="manage"]');
      if (b) b.click();
      renderManage();
      // A synthetic trail: one superseded promotion, one live promotion, and
      // the reassessment recorded with it.
      const existing = [
        { id: 'a', eventType: 'PROMOTION', previousTier: 'C', newTier: 'B',
          previousPowerRating: 1103.4, newPowerRating: 1103.4, createdBy: 'seed-beta', superseded: true },
        { id: 'b', eventType: 'PROMOTION', previousTier: 'C', newTier: 'B',
          previousPowerRating: 1103.4, newPowerRating: 1103.4, createdBy: 'Shaun', superseded: false, revision: 2 },
        { id: 'c', eventType: 'CLUB_RATING_REASSESSMENT', previousTier: 'B', newTier: 'B',
          previousPowerRating: 1103.4, newPowerRating: 1352.5, createdBy: 'Shaun', superseded: false },
      ];
      const host = document.createElement('div');
      host.innerHTML = existing.map((e) => buildAuditRowHtml(e, existing)).join('');
      return {
        rows: [...host.querySelectorAll('.audit-row')].map((el) => ({
          text: el.innerText.replace(/\n+/g, ' | '),
          faded: el.classList.contains('audit-row-superseded'),
        })),
      };
    });
    assert.strictEqual(r.rows.length, 3, 'every event stays in the trail');
    assert.strictEqual(r.rows[0].faded, true, 'a superseded event must recede');
    assert.match(r.rows[0].text, /Superseded/);
    assert.strictEqual(r.rows[1].faded, false, 'the live event must not be faded');
    assert.match(r.rows[1].text, /Promotion.*Active/s);
    assert.match(r.rows[1].text, /revision 2/);
    // The raw record says B -> B and 1103.4 -> 1103.4. Neither is readable.
    assert.match(r.rows[2].text, /Rating reassessment after promotion/,
      'a reassessment beside a promotion must say so');
    assert.match(r.rows[2].text, /tier unchanged \(B\)/, '"B → B" must be said in English');
    assert.match(r.rows[2].text, /1103\.4 → 1352\.5/);
    assert.doesNotMatch(r.rows[2].text, /CLUB_RATING_REASSESSMENT/,
      'a raw event constant must not be the label');
    assert.deepStrictEqual(app.pageErrors, []);
  } finally { await app.close(); }
});

// A rating can move without anyone playing. The seeded fixture holds no club
// decisions -- they were applied to the live beta -- so the case is provoked.
test('club-decision movement stays labelled apart from movement on court', { skip }, async () => {
  const app = await H.open();
  try {
    const r = await app.run(() => {
      selectedMonth = '2026-07'; minGames = 5; activeTab = 'power'; render();
      // After render, so rebuilding MONTHLY_VIEWS cannot discard it.
      // The biggest riser, so the row is certain to be one of the three shown.
      const subject = MonthlyViews.ratingMovementTable(MONTHLY_VIEWS, '2026-07')[0];
      subject.reassessmentChange = 40.5;
      const box = document.createElement('div');
      box.innerHTML = buildMonthlyStoriesHtml('2026-07');
      document.body.appendChild(box);
      [...box.querySelectorAll('.ms-fold')].forEach((f) => { f.open = true; });
      const text = box.innerText.replace(/\n+/g, ' | ');
      box.remove();
      return { name: subject.playerId, text };
    });
    assert.match(r.text, new RegExp(`${r.name} \\| [^|]*\\(\\+40\\.5 by club decision\\)`),
      `movement by decision must be called out separately for ${r.name}, got: ${r.text}`);
    assert.deepStrictEqual(app.pageErrors, []);
  } finally { await app.close(); }
});

// All four monthly concepts survive the new hierarchy. Key takeaways summarises
// on top; nothing below it is deleted.
test('the monthly stories keep all four parts behind a takeaways summary', { skip }, async () => {
  const app = await H.open();
  try {
    const r = await app.run(() => {
      selectedMonth = '2026-07'; minGames = 5; activeTab = 'power'; render();
      const box = document.querySelector('.monthly-stories');
      const folds = [...box.querySelectorAll('.ms-fold')];
      folds.forEach((f) => { f.open = true; });
      return {
        head: box.querySelector('.ms-head').innerText,
        takeaways: [...box.querySelectorAll('.ms-takeaway')].map((e) => e.innerText.replace(/\n+/g, ' ')),
        titles: [...box.querySelectorAll('.ms-title, .ms-fold-title')].map((e) => e.innerText.trim()),
        opened: box.innerText,
      };
    });
    assert.match(r.head, /monthly summary/i);
    assert.ok(r.takeaways.length >= 2, 'Key takeaways must actually summarise something');
    assert.deepStrictEqual(r.titles, [
      'Monthly Performance', 'Rating Movement', 'Ranking Movement',
      'Moved without playing', 'Crossovers',
    ], 'no monthly concept may be dropped by the new hierarchy');
    assert.deepStrictEqual(app.pageErrors, []);
  } finally { await app.close(); }
});

// ===================== POWER RATING GUIDE (18 Sep 2026) =====================
// The guide exists to pre-empt three complaints: small moves after a win, a
// rating rising after a loss, and a partner moving further. These check it is
// reachable, that it describes the model the app is actually running, and that
// it does not say the two things it must never say.

test('the Power Rating Guide is reachable from More', { skip }, async () => {
  const app = await H.open();
  try {
    const r = await app.run(() => {
      goToSection('more');
      const item = [...document.querySelectorAll('#shellMoreSheet .shell-more-item')]
        .find((b) => /power rating guide/i.test(b.textContent));
      if (!item) return { found: false };
      item.click();
      const modal = document.getElementById('ratingGuideModal');
      return {
        found: true,
        shown: !!modal && modal.classList.contains('show'),
        moreSheetClosed: !document.getElementById('shellMoreSheet').classList.contains('show'),
        title: modal ? modal.querySelector('h3').textContent.trim() : null,
      };
    });
    assert.strictEqual(r.found, true, 'the More sheet must offer the guide');
    assert.strictEqual(r.shown, true, 'tapping it must open the guide');
    assert.strictEqual(r.moreSheetClosed, true, 'the More sheet must close behind it');
    assert.strictEqual(r.title, 'Power Rating Guide');
    assert.deepStrictEqual(app.pageErrors, []);
  } finally { await app.close(); }
});

test('the guide states sequential-v1 as the app actually runs it', { skip }, async () => {
  const app = await H.open();
  try {
    const r = await app.run(() => {
      openPowerRatingGuide();
      const modal = document.getElementById('ratingGuideModal');
      [...modal.querySelectorAll('details')].forEach((d) => { d.open = true; });
      return {
        text: modal.innerText,
        engine: {
          kMax: RatingEngine.KMAX, kMin: RatingEngine.KMIN, rc: RatingEngine.RC,
          gameWeight: RatingEngine.GAME_SHARE_WEIGHT,
          resultWeight: RatingEngine.MATCH_RESULT_WEIGHT,
          version: RatingEngine.RATING_MODEL_VERSION,
          // The comparison the guide draws, computed here from the engine.
          establishedMove: RatingEngine.kFactor(0.85) * 0.20,
          reassessedMove: RatingEngine.kFactor(0.10) * 0.20,
        },
      };
    });
    const { text, engine } = r;

    assert.match(text, /rating change = K × \(performance score − expected score\)/);
    assert.ok(text.includes(`K = ${engine.kMin} + ${engine.kMax - engine.kMin} × (1 − reliability)`),
      `the K formula must match the engine, got:\n${text.slice(0, 400)}`);
    assert.ok(text.includes(`reliability = e ÷ (e + ${engine.rc})`), 'the reliability formula must match the engine');
    assert.ok(text.includes(`${Math.round(engine.gameWeight * 100)}% the share of games`));
    assert.ok(text.includes(`${Math.round(engine.resultWeight * 100)}% the result`));
    assert.ok(text.includes(engine.version), 'the guide must name the engine it describes');

    // The worked example from the brief.
    assert.match(text, /16 × 0\.13 = \+2\.1/);

    // The comparison, and its numbers taken from the engine rather than prose.
    assert.ok(text.includes(`+${engine.establishedMove.toFixed(1)} pts`),
      `established move should read +${engine.establishedMove.toFixed(1)}`);
    assert.ok(text.includes(`+${engine.reassessedMove.toFixed(1)} pts`),
      `reassessed move should read +${engine.reassessedMove.toFixed(1)}`);
    assert.ok(engine.reassessedMove > engine.establishedMove * 2,
      'the comparison is only worth drawing if the gap is large');

    assert.deepStrictEqual(app.pageErrors, []);
  } finally { await app.close(); }
});

test('the guide never implies a monthly reset or a reward for winning', { skip }, async () => {
  const app = await H.open();
  try {
    const text = await app.run(() => {
      openPowerRatingGuide();
      const modal = document.getElementById('ratingGuideModal');
      [...modal.querySelectorAll('details')].forEach((d) => { d.open = true; });
      return modal.innerText;
    });

    // The anchor sentence, as Shaun wrote it.
    assert.match(text, /The rating is not designed to reward wins\. It is designed to update our estimate of playing level\./);

    // The six required plain-English points, and the five distinctions.
    assert.match(text, /one continuous Power Rating/i);
    assert.match(text, /gain rating in a loss/i);
    assert.match(text, /Reliability/);
    assert.match(text, /evidence/i);
    ['Power Rating', 'Reliability', 'Monthly Performance', 'League Table', 'Tier']
      .forEach((c) => assert.ok(text.includes(c), `the guide must distinguish ${c}`));

    // Reliability must not be sold as skill or as a probability.
    assert.match(text, /Reliability is <?b?>?evidence<?\/?b?>?, not skill|Reliability is evidence, not skill/i);

    // The six questions the brief names.
    [/I won — why did I only get/i, /I lost — why did my rating go up/i,
      /why did my partner move more than me/i, /new or reassessed player/i,
      /promotion or a reclassification/i, /Do ratings reset every month/i]
      .forEach((re) => assert.match(text, re));

    // A tier change moves no points -- said, not implied.
    assert.match(text, /tier change on its own moves\s+zero\s+points/i);

    assert.deepStrictEqual(app.pageErrors, []);
  } finally { await app.close(); }
});

// The explanation must describe the SAME persisted facts the card already
// shows. If it ever disagreed with the movement printed above it, it would be a
// second calculation path, which is the one thing it must not be.
test('"Why your rating moved" describes the persisted facts, not a recalculation', { skip }, async () => {
  const app = await H.open();
  try {
    const r = await app.run(() => {
      selectedMonth = 'all'; minGames = 10; render();
      openSheet('Shaun');
      const card = [...document.querySelectorAll('.match')].find((el) => el.querySelector('.why-moved'));
      if (!card) return { found: false };

      const matchId = MATCHES
        .filter((m) => m.winners.includes('Shaun') || m.losers.includes('Shaun'))
        .sort((a, b) => (a.date < b.date ? 1 : -1))[0].id;
      const facts = MatchFacts.forPlayer(V3_MATCH_FACTS[matchId], 'Shaun');
      const m = MATCHES.find((x) => x.id === matchId);
      const won = m.winners.includes('Shaun');

      return {
        found: true,
        cardText: card.innerText.replace(/\n+/g, ' | '),
        why: card.querySelector('.why-moved').innerText.replace(/\n+/g, ' '),
        // Straight from the record, to compare the prose against.
        recorded: {
          expected: facts.mine.expected,
          actual: facts.mine.actual,
          kUsed: facts.me.kUsed,
          delta: facts.me.ratingDelta,
          reliability: facts.me.previousReliability,
        },
        won,
      };
    });

    assert.strictEqual(r.found, true, 'a profile match card must carry the explanation');
    const rec = r.recorded;

    // Every number in the sentence is the recorded one.
    assert.ok(r.why.includes(`K ${Math.round(rec.kUsed)}`),
      `the explanation must quote the recorded K (${rec.kUsed}), got: ${r.why}`);
    assert.ok(r.why.includes((rec.expected * 100).toFixed(1)),
      `must quote the recorded expected score, got: ${r.why}`);
    assert.ok(r.why.includes((rec.actual * 100).toFixed(1)),
      `must quote the recorded performance score, got: ${r.why}`);
    const deltaText = (rec.delta > 0 ? '+' : '') + rec.delta.toFixed(1);
    assert.ok(r.why.includes(deltaText),
      `must quote the recorded movement ${deltaText}, got: ${r.why}`);

    // And the card above it prints that same movement, so the two agree.
    assert.ok(r.cardText.includes(`${deltaText} pts`),
      'the card and its explanation must quote the same movement');

    // The restated arithmetic is the recorded numbers, not a fresh sum.
    assert.match(r.why, new RegExp(`${Math.round(rec.kUsed)} × \\(${rec.actual.toFixed(2)} − ${rec.expected.toFixed(2)}\\)`));

    assert.deepStrictEqual(app.pageErrors, []);
  } finally { await app.close(); }
});

// The three complaints, each against a case constructed from real recorded
// shapes, so the wording is checked and not just the presence of a sentence.
test('the explanation answers the three complaints it exists for', { skip }, async () => {
  const app = await H.open();
  try {
    const r = await app.run(() => {
      const mk = (k, rel, delta, expected, actual, mine, theirs) => ({
        me: { playerId: 'X', kUsed: k, previousReliability: rel, ratingDelta: delta },
        mine: { expected, actual, preRating: mine }, theirs: { preRating: theirs },
      });
      return {
        smallWin: RatingExplainer.explain(mk(11, 0.88, 1.4, 0.62, 0.63, 1450, 1380), 'win').text,
        riseOnLoss: RatingExplainer.explain(mk(13, 0.78, 3.1, 0.40, 0.55, 1300, 1500), 'loss').text,
        fallOnWin: RatingExplainer.explain(mk(12, 0.85, -1.8, 0.75, 0.60, 1600, 1300), 'win').text,
        newPlayer: RatingExplainer.explain(mk(37, 0.10, 7.4, 0.45, 0.65, 1400, 1420), 'win').text,
      };
    });

    assert.match(r.smallWin, /moves it slowly \(K 11\)/);
    assert.match(r.smallWin, /tells the engine nothing it did not already believe/);
    assert.match(r.riseOnLoss, /You lost the match and your rating still went up, by \+3\.1/);
    assert.match(r.riseOnLoss, /not who won/);
    assert.match(r.fallOnWin, /You won and your rating still went down, by -1\.8/);
    assert.match(r.newPlayer, /barely established yet/);
    assert.match(r.newPlayer, /moves it a long way \(K 37\)/);

    // The pace language comes from K, so it can never contradict the movement.
    assert.doesNotMatch(r.smallWin, /a long way/);
    assert.doesNotMatch(r.newPlayer, /moves it slowly/);
  } finally { await app.close(); }
});

// The explanation sits directly under the card's own "underdogs by N pts going
// in". If the two round differently they disagree by a point, and the
// explanation reads like a second calculation. Math.round(-28.5) is -28 while
// Math.round(28.5) is 29, which is exactly how that happened once.
test('the explanation states the same pairing gap as the card above it', { skip }, async () => {
  const app = await H.open();
  try {
    const r = await app.run(() => {
      selectedMonth = 'all'; minGames = 10; render();
      const out = [];
      ['Shaun', 'Rishi', 'Eli', 'Osh'].forEach((name) => {
        openSheet(name);
        [...document.querySelectorAll('.match')].forEach((card) => {
          const why = card.querySelector('.why-moved');
          if (!why) return;
          const body = card.innerText;
          const cardGap = body.match(/(favoured|underdogs) by (\d+) pts going in/);
          const whyGap = why.innerText.match(/(favourites|underdogs) by (\d+) pts/);
          const cardClose = body.match(/evenly matched going in \((\d+) pt gap\)/);
          const whyClose = why.innerText.match(/evenly matched \((\d+) pts between/);
          if (cardGap && whyGap) out.push({ name, card: cardGap[2], why: whyGap[2] });
          else if (cardClose && whyClose) out.push({ name, card: cardClose[1], why: whyClose[1] });
          else out.push({ name, card: cardGap || cardClose ? 'gap' : 'none', why: whyGap || whyClose ? 'gap' : 'none' });
        });
        closeSheet();
      });
      return out;
    });
    assert.ok(r.length > 10, `not enough cards checked (${r.length})`);
    const wrong = r.filter((x) => x.card !== x.why);
    assert.deepStrictEqual(wrong, [],
      'the card and its explanation must state the same gap');
    assert.deepStrictEqual(app.pageErrors, []);
  } finally { await app.close(); }
});

// ===================== PLAY HISTORY, ADMIN SURFACE (18 Sep 2026) =============
// The Play tab is a results feed. Correction controls exist for one person and
// must not make every game read like a maintenance ticket.

test('a non-admin result card carries no correction or removal controls', { skip }, async () => {
  const app = await H.open();
  try {
    const r = await app.run(() => {
      isUnlocked = false; currentUserName = '';
      const b = document.querySelector('#tabrow .tab-btn[data-tab="games"]');
      if (b) b.click();
      selectedMonth = 'all'; renderGamesTab();
      const view = document.getElementById('gamesView');
      return {
        cards: view.querySelectorAll('.game-card-clickable').length,
        edit: view.querySelectorAll('[data-edit]').length,
        del: view.querySelectorAll('[data-delete]').length,
        manage: view.querySelectorAll('[data-manage]').length,
        text: view.innerText,
      };
    });
    assert.ok(r.cards > 10, 'the feed must actually be showing games');
    assert.strictEqual(r.edit, 0, 'no correction control may be offered');
    assert.strictEqual(r.del, 0, 'no removal control may be offered');
    assert.strictEqual(r.manage, 0, 'not even the manage affordance');
    assert.doesNotMatch(r.text, /Correct match|Remove and replay/);
    assert.doesNotMatch(r.text, /re-derives every rating that came after it/,
      'the replay warning is maintenance copy and must not sit under every result');
    assert.deepStrictEqual(app.pageErrors, []);
  } finally { await app.close(); }
});

test('an admin sees a compact manage affordance, with the actions collapsed', { skip }, async () => {
  const app = await H.open();
  try {
    const r = await app.run(() => {
      isUnlocked = true; currentUserName = 'Board';
      const b = document.querySelector('#tabrow .tab-btn[data-tab="games"]');
      if (b) b.click();
      selectedMonth = 'all'; renderGamesTab();
      const view = document.getElementById('gamesView');
      const manage = [...view.querySelectorAll('[data-manage]')];
      return {
        cards: view.querySelectorAll('.game-card-clickable').length,
        manage: manage.length,
        label: manage[0] ? manage[0].innerText.trim() : null,
        expanded: manage[0] ? manage[0].getAttribute('aria-expanded') : null,
        edit: view.querySelectorAll('[data-edit]').length,
        del: view.querySelectorAll('[data-delete]').length,
        bodies: view.querySelectorAll('.game-manage-body').length,
        warnings: (view.innerText.match(/re-derives every rating that came after it/g) || []).length,
      };
    });
    assert.ok(r.manage > 10, 'every card offers the affordance to an admin');
    assert.strictEqual(r.manage, r.cards, 'one per card');
    assert.match(r.label, /Manage/);
    assert.strictEqual(r.expanded, 'false');
    assert.strictEqual(r.edit, 0, 'the actions start collapsed');
    assert.strictEqual(r.del, 0, 'the actions start collapsed');
    assert.strictEqual(r.bodies, 0);
    assert.strictEqual(r.warnings, 0, 'the warning copy must not be repeated under every result');
    assert.deepStrictEqual(app.pageErrors, []);
  } finally { await app.close(); }
});

test('opening one card reveals its actions and leaves the others collapsed', { skip }, async () => {
  const app = await H.open();
  try {
    const r = await app.run(() => {
      isUnlocked = true; currentUserName = 'Board';
      const b = document.querySelector('#tabrow .tab-btn[data-tab="games"]');
      if (b) b.click();
      selectedMonth = 'all'; renderGamesTab();
      const view = () => document.getElementById('gamesView');

      const first = view().querySelector('[data-manage]');
      const firstId = first.dataset.manage;
      first.click();

      const openBodies = view().querySelectorAll('.game-manage-body');
      const opened = {
        bodies: openBodies.length,
        edit: view().querySelectorAll('[data-edit]').length,
        del: view().querySelectorAll('[data-delete]').length,
        editId: view().querySelector('[data-edit]').dataset.edit,
        warnings: (view().innerText.match(/re-derives every rating that came after it/g) || []).length,
        label: view().querySelector(`[data-manage="${firstId}"]`).innerText.trim(),
        expanded: view().querySelector(`[data-manage="${firstId}"]`).getAttribute('aria-expanded'),
        others: [...view().querySelectorAll('[data-manage]')]
          .filter((el) => el.dataset.manage !== firstId)
          .every((el) => el.getAttribute('aria-expanded') === 'false'),
      };

      // A second card takes over; the first collapses.
      const second = [...view().querySelectorAll('[data-manage]')].find((el) => el.dataset.manage !== firstId);
      const secondId = second.dataset.manage;
      second.click();
      const moved = {
        bodies: view().querySelectorAll('.game-manage-body').length,
        editId: view().querySelector('[data-edit]').dataset.edit,
        firstClosed: view().querySelector(`[data-manage="${firstId}"]`).getAttribute('aria-expanded') === 'false',
      };

      // Tapping the open one again closes it.
      view().querySelector(`[data-manage="${secondId}"]`).click();
      const closed = {
        bodies: view().querySelectorAll('.game-manage-body').length,
        edit: view().querySelectorAll('[data-edit]').length,
      };

      return { firstId, secondId, opened, moved, closed, writes: window.__writes.length };
    });

    assert.strictEqual(r.opened.bodies, 1, 'exactly one card opens');
    assert.strictEqual(r.opened.edit, 1);
    assert.strictEqual(r.opened.del, 1);
    assert.strictEqual(r.opened.editId, r.firstId, 'the actions belong to the card that was opened');
    assert.strictEqual(r.opened.warnings, 1, 'the warning appears once, in the open card');
    assert.match(r.opened.label, /Close/);
    assert.strictEqual(r.opened.expanded, 'true');
    assert.strictEqual(r.opened.others, true, 'every other card stays collapsed');

    assert.strictEqual(r.moved.bodies, 1, 'still only one open');
    assert.strictEqual(r.moved.editId, r.secondId);
    assert.strictEqual(r.moved.firstClosed, true);

    assert.strictEqual(r.closed.bodies, 0, 'tapping Close collapses it again');
    assert.strictEqual(r.closed.edit, 0);

    assert.strictEqual(r.writes, 0, 'opening and closing a card writes nothing');
    assert.deepStrictEqual(app.pageErrors, []);
  } finally { await app.close(); }
});

// The one thing collapsing must not break: a staged correction has to stay
// visible until it is confirmed or cancelled.
test('a staged correction keeps its card open and survives the collapse', { skip }, async () => {
  const app = await H.open();
  try {
    const r = await app.run(async () => {
      isUnlocked = true; currentUserName = 'Board';
      const b = document.querySelector('#tabrow .tab-btn[data-tab="games"]');
      if (b) b.click();
      selectedMonth = 'all'; renderGamesTab();
      const yn = document.getElementById('gamesYourName'); if (yn) yn.value = 'Board';
      const view = () => document.getElementById('gamesView');

      const first = view().querySelector('[data-manage]');
      const id = first.dataset.manage;
      first.click();
      await deleteMatch(id);

      const staged = {
        bodies: view().querySelectorAll('.game-manage-body').length,
        panel: !!document.getElementById('matchFixCommitBtn'),
        commit: document.getElementById('matchFixCommitBtn').textContent.trim(),
      };

      // Closing the card cancels the staged plan rather than hiding it.
      view().querySelector(`[data-manage="${id}"]`).click();
      const afterClose = {
        plan: !!matchFixPlan,
        panel: !!document.getElementById('matchFixCommitBtn'),
        bodies: view().querySelectorAll('.game-manage-body').length,
      };
      return { id, staged, afterClose, writes: window.__writes.length };
    });

    assert.strictEqual(r.staged.bodies, 1, 'the managed card stays open while a fix is staged');
    assert.strictEqual(r.staged.panel, true, 'the blast-radius panel must be visible');
    assert.strictEqual(r.staged.commit, 'Remove and replay');
    assert.strictEqual(r.afterClose.plan, false, 'closing cancels rather than hides the plan');
    assert.strictEqual(r.afterClose.panel, false);
    assert.strictEqual(r.afterClose.bodies, 0);
    assert.strictEqual(r.writes, 0, 'nothing is written by staging or cancelling');
    assert.deepStrictEqual(app.pageErrors, []);
  } finally { await app.close(); }
});
