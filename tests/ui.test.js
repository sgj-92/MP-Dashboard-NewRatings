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
// shows, in two layers: padel language in front, decimals behind "See full
// calculation". If the two layers ever disagreed it would be a second
// calculation path, which is the one thing it must not be.
test('"Why your rating moved" is plain in front and exact behind', { skip }, async () => {
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
      const m = MATCHES.find((x) => x.id === matchId);
      const facts = MatchFacts.forPlayer(V3_MATCH_FACTS[matchId], 'Shaun');
      const won = m.winners.includes('Shaun');

      const why = card.querySelector('.why-moved');
      const calc = why.querySelector('.wm-calc');
      calc.open = true;

      return {
        found: true,
        plain: why.querySelector('.why-moved-body').innerText.replace(/\n+/g, ' '),
        note: why.querySelector('.why-moved-note').innerText,
        calc: calc.innerText.replace(/\n+/g, ' | '),
        recorded: {
          expected: facts.mine.expected,
          actual: facts.mine.actual,
          kUsed: facts.me.kUsed,
          delta: facts.me.ratingDelta,
          reliability: facts.me.previousReliability,
          myGames: won ? m.games_winner : m.games_loser,
          oppGames: won ? m.games_loser : m.games_winner,
        },
        won,
      };
    });

    assert.strictEqual(r.found, true, 'a profile match card must carry the explanation');
    const rec = r.recorded;

    // --- the plain layer: percentages, result, verdict, movement ---
    assert.ok(r.plain.includes(`${Math.round(rec.expected * 100)}%`),
      `must state the expected share as a whole percent, got: ${r.plain}`);
    const share = Math.round((rec.myGames / (rec.myGames + rec.oppGames)) * 100);
    assert.ok(r.plain.includes(`${share}%`),
      `must state the actual game share (${share}%), got: ${r.plain}`);
    assert.match(r.plain, r.won ? /and won the match/ : /but lost the match/);
    // The verdict is a GAME-SHARE comparison. It must never claim a
    // performance verdict the blended score alone could justify.
    assert.match(r.plain, /You (matched the game-share expectation|won (more|fewer) games than expected|won about the expected share of games)\./);
    assert.doesNotMatch(r.plain, /performed (above|below) expectation/,
      'the plain layer must not give a blended performance verdict');
    assert.match(r.plain, /The match result also contributes to the rating calculation\./);
    const deltaText = (rec.delta > 0 ? '+' : '') + rec.delta.toFixed(1);
    assert.ok(r.plain.includes(`Your rating moved ${deltaText}`),
      `must state the recorded movement ${deltaText}, got: ${r.plain}`);

    // --- and no raw performance-score sentence in front of the player ---
    assert.doesNotMatch(r.plain, /[Pp]erformance score/,
      'the plain layer must not quote the raw performance score');
    assert.doesNotMatch(r.plain, /\bK \d/, 'the plain layer must not quote K');
    assert.doesNotMatch(r.plain, /Reliability/i, 'the plain layer must not quote reliability');

    // --- the honesty note: the result is a SEPARATE input ---
    assert.match(r.note, /separate input/i);
    assert.match(r.note, /80%/);
    assert.match(r.note, /20%/);
    assert.match(r.note, /match result/i);

    // --- the exact layer, behind the disclosure ---
    assert.match(r.calc, /See full calculation/);
    assert.ok(r.calc.includes(rec.actual.toFixed(2)), 'the disclosure must carry the exact performance score');
    assert.ok(r.calc.includes(rec.expected.toFixed(2)), 'the disclosure must carry the exact expected score');
    assert.match(r.calc, /Match result contribution/, 'the 20% component must be shown as its own row');
    assert.match(r.calc, /0\.80 × .* \+ 0\.20 × /, 'the blend must be shown, not asserted');
    const k1 = String(Math.round(rec.kUsed * 10) / 10);
    assert.ok(r.calc.includes(k1), 'the disclosure must carry K');
    assert.ok(r.calc.includes(`${Math.round(rec.reliability * 100)}%`), 'the disclosure must carry reliability');
    assert.match(r.calc, new RegExp(`${k1.replace('.', '\\.')} × \\(${rec.actual.toFixed(2)} − ${rec.expected.toFixed(2)}\\)`));
    // One rounding of K, not two, inside one panel.
    assert.ok((r.calc.match(new RegExp(k1.replace('.', '\\.'), 'g')) || []).length >= 2,
      `K must read the same in the row and the arithmetic, got: ${r.calc}`);

    assert.deepStrictEqual(app.pageErrors, []);
  } finally { await app.close(); }
});

// The shapes the brief names, each against a constructed case so the wording
// itself is checked rather than the mere presence of a sentence.
test('the explanation reads as padel, in the order a player thinks in', { skip }, async () => {
  const app = await H.open();
  try {
    const r = await app.run(() => {
      const mk = (k, rel, delta, expected, actual, mine, theirs) => ({
        me: { playerId: 'X', kUsed: k, previousReliability: rel, newReliability: rel + 0.02, ratingDelta: delta },
        mine: { expected, actual, preRating: mine }, theirs: { preRating: theirs },
      });
      const plain = (e) => e.lines.join(' ').replace(/<\/?b>/g, '');
      return {
        more: plain(RatingExplainer.explain(mk(19, 0.6, 5.7, 0.53, 0.68, 1420, 1400), 'win', { mine: 15, theirs: 10 })),
        lossUp: plain(RatingExplainer.explain(mk(12, 0.8, 0.5, 0.18, 0.16, 1200, 1600), 'loss', { mine: 5, theirs: 20 })),
        fewer: plain(RatingExplainer.explain(mk(18, 0.65, -5.4, 0.51, 0.256, 1405, 1400), 'loss', { mine: 8, theirs: 17 })),
        note: RatingExplainer.explain(mk(19, 0.6, 5.7, 0.53, 0.68, 1420, 1400), 'win', { mine: 15, theirs: 10 }).blendNote,
      };
    });

    // Won more games than the expectation implied, and won the match.
    assert.match(r.more, /^Your team were slight favourites\./);
    assert.match(r.more, /expected to win about 53% of the games/);
    assert.match(r.more, /You won 15 of 25 games \(60%\) and won the match\./);
    assert.match(r.more, /You won more games than expected\./);
    assert.match(r.more, /Your rating moved \+5\.7\./);

    // A loss that still earned points -- the case players write in about.
    assert.match(r.lossUp, /^Your team were underdogs\./);
    assert.match(r.lossUp, /You won 5 of 25 games \(20%\) but lost the match\./);
    assert.match(r.lossUp, /You won about the expected share of games\./);
    assert.match(r.lossUp, /Your rating moved \+0\.5\./);

    // Fewer games than expected, and lost.
    assert.match(r.fewer, /^Your team were expected to be competitive\./);
    assert.match(r.fewer, /You won 8 of 25 games \(32%\) but lost the match\./);
    assert.match(r.fewer, /You won fewer games than expected\./);
    assert.match(r.fewer, /Your rating moved -5\.4\./);

    // None of them leads with a decimal, a K, a reliability -- or a blended
    // performance verdict.
    [r.more, r.lossUp, r.fewer].forEach((line) => {
      assert.doesNotMatch(line, /[Pp]erformance score/);
      assert.doesNotMatch(line, /0\.\d\d/);
      assert.doesNotMatch(line, /\bK \d/);
      assert.doesNotMatch(line, /Reliability/i);
      assert.doesNotMatch(line, /performed (above|below) expectation/);
      assert.match(line, /The match result also contributes to the rating calculation\./);
    });

    assert.match(r.note, /separate input/i);
    assert.match(r.note, /match result/i);
  } finally { await app.close(); }
});

// Shaun's case, exactly as flagged: a team matches its expected game share and
// still moves up, because the win contributes separately. Saying "performed
// above expectation" there would be false about the games.
test('matching the expected game share is never called performing above it', { skip }, async () => {
  const app = await H.open();
  try {
    const r = await app.run(() => {
      // 60% expected, 18/30 games won (60%), won the match. The blended actual
      // is 0.8 x 0.60 + 0.2 x 1 = 0.68 against 0.60 expected, so the rating
      // rises -- which is the trap.
      const view = {
        me: { playerId: 'X', kUsed: 16, previousReliability: 0.7, newReliability: 0.71, ratingDelta: 2.9 },
        mine: { expected: 0.60, actual: 0.68, preRating: 1450 },
        theirs: { preRating: 1380 },
      };
      const e = RatingExplainer.explain(view, 'win', { mine: 18, theirs: 12 });
      return { plain: e.lines.join(' ').replace(/<\/?b>/g, ''), key: e.verdictKey, delta: e.delta, residual: e.residual };
    });

    assert.ok(r.residual > 0, 'the blended residual really is positive -- this is the case under test');
    assert.ok(r.delta > 0, 'and the rating really did go up');

    assert.strictEqual(r.key, 'matched');
    assert.match(r.plain, /^Your team were favourites\./);
    assert.match(r.plain, /expected to win about 60% of the games/);
    assert.match(r.plain, /You won 18 of 30 games \(60%\) and won the match\./);
    assert.match(r.plain, /You matched the game-share expectation\./);
    assert.match(r.plain, /The match result also contributes to the rating calculation\./);
    assert.match(r.plain, /Your rating moved \+2\.9\./);

    // The forbidden readings.
    assert.doesNotMatch(r.plain, /above expectation/i);
    assert.doesNotMatch(r.plain, /exceeded expectation/i);
    assert.doesNotMatch(r.plain, /pushed you above/i);
  } finally { await app.close(); }
});

// The headline must agree with which side was actually favoured, across every
// card rather than one hand-picked example. The standing is qualitative now, so
// the check is on direction, not on a number the card no longer prints.
test('the standing headline agrees with the recorded pre-match ratings', { skip }, async () => {
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
          const body = why.querySelector('.why-moved-body').innerText;
          const headline = body.split('.')[0] + '.';
          const id = [...card.querySelectorAll('*')].length ? null : null;
          out.push({ name, headline });
        });
        closeSheet();
      });
      // And the same thing computed straight from the record, per player.
      const expectations = [];
      ['Shaun', 'Rishi', 'Eli', 'Osh'].forEach((name) => {
        MATCHES.filter((m) => m.winners.includes(name) || m.losers.includes(name))
          .sort((a, b) => (a.date < b.date ? 1 : -1))
          .forEach((m) => {
            const v = MatchFacts.forPlayer(V3_MATCH_FACTS[m.id], name);
            if (!v) return;
            expectations.push({
              name,
              headline: RatingExplainer.standingOf(v.mine.preRating, v.theirs.preRating).headline,
              gap: v.mine.preRating - v.theirs.preRating,
            });
          });
      });
      return { out, expectations };
    });

    assert.ok(r.out.length > 20, `not enough cards checked (${r.out.length})`);
    assert.strictEqual(r.out.length, r.expectations.length, 'one explanation per rated match');
    const wrong = r.out.filter((x, i) => x.headline !== r.expectations[i].headline);
    assert.deepStrictEqual(wrong, [], 'the headline must be the one the recorded ratings imply');

    // The direction is right: nobody is called a favourite while behind.
    const backwards = r.expectations.filter((e) =>
      (/favourites/.test(e.headline) && e.gap <= 0) || (/underdogs/.test(e.headline) && e.gap >= 0));
    assert.deepStrictEqual(backwards, [], 'a favourite must actually have been ahead');

    // Every shape is exercised by the real record, not just one of them.
    const kinds = new Set(r.expectations.map((e) => e.headline));
    assert.ok(kinds.size >= 3, `the record should exercise several standings, saw ${[...kinds].join(' / ')}`);

    assert.deepStrictEqual(app.pageErrors, []);
  } finally { await app.close(); }
});

// The rule, swept across every normal card rather than checked on one: no raw
// performance-score sentence in front of a player, anywhere.
test('no normal card leads with a raw performance score', { skip }, async () => {
  const app = await H.open();
  try {
    const r = await app.run(() => {
      const found = [];
      const scan = (where, text) => {
        if (/[Pp]erformance score \d?\d?\.\d\d against/.test(text)) found.push(where);
      };

      // Profile cards.
      selectedMonth = 'all'; minGames = 10; render();
      openSheet('Shaun');
      [...document.querySelectorAll('.match')].forEach((el, i) => {
        // The disclosure is deliberately excluded: that is where it belongs.
        const clone = el.cloneNode(true);
        [...clone.querySelectorAll('.wm-calc')].forEach((d) => d.remove());
        scan(`profile card ${i}`, clone.innerText);
      });
      closeSheet();

      // Monthly breakdown.
      selectedMonth = '2026-07'; minGames = 5; render();
      openMonthlyRatingBreakdown('Shaun', '2026-07');
      const modal = document.getElementById('monthlyRatingModal');
      const mClone = modal.cloneNode(true);
      [...mClone.querySelectorAll('.wm-calc, #mrbFullCalcBody, #mrbHowItWorksBody')].forEach((d) => d.remove());
      scan('monthly breakdown', mClone.innerText);
      modal.classList.remove('show');

      // Games feed, with a card expanded.
      const b = document.querySelector('#tabrow .tab-btn[data-tab="games"]');
      if (b) b.click();
      selectedMonth = 'all'; renderGamesTab();
      const first = document.querySelector('#gamesView .game-card-clickable');
      if (first) first.click();
      const gv = document.getElementById('gamesView').cloneNode(true);
      [...gv.querySelectorAll('.wm-calc')].forEach((d) => d.remove());
      scan('games feed', gv.innerText);

      return { found };
    });
    assert.deepStrictEqual(r.found, [],
      'a raw performance-score sentence is still in front of a player');
    assert.deepStrictEqual(app.pageErrors, []);
  } finally { await app.close(); }
});

// Shaun's correction: Play -> Games opens on All time and is not aligned with
// the completed-month views.
test('the Games view opens on All time', { skip }, async () => {
  const app = await H.open();
  try {
    const r = await app.run(() => {
      const b = document.querySelector('#tabrow .tab-btn[data-tab="games"]');
      if (b) b.click();
      renderGamesTab();
      const sel = document.getElementById('gamesMonthSelect');
      const dates = [...document.querySelectorAll('#gamesView .section-heading')]
        .map((e) => e.textContent.trim()).filter((t) => /\d{4}/.test(t));
      return {
        gamesMonth,
        // The rankings month is deliberately NOT All time, which is the whole
        // point: Games must not inherit it.
        rankingsMonth: selectedMonth,
        selectValue: sel ? sel.value : null,
        months: new Set(dates.map((d) => d.slice(-4))).size,
        cards: document.querySelectorAll('#gamesView .game-card-clickable').length,
      };
    });
    assert.strictEqual(r.gamesMonth, 'all', 'Games must open on All time');
    assert.notStrictEqual(r.rankingsMonth, 'all',
      'this test is only meaningful while Rankings defaults to a month');
    assert.strictEqual(r.selectValue, 'all', 'and the month control must say so');
    assert.ok(r.cards > 100, `All time should show the whole record, saw ${r.cards} cards`);
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

// ===================== GAMES CARD: COMPACT + WORKING DISCLOSURE ==============
// "See full calculation" was inert on the Games feed. The card wraps its body
// in .game-card-clickable, whose handler toggles the card and re-renders, so a
// click on the summary collapsed the card before the browser could open the
// details. It worked on the profile card only because that card has no handler.
test('See full calculation opens and closes on a Games card', { skip }, async () => {
  const app = await H.open();
  try {
    const r = await app.run(() => {
      const b = document.querySelector('#tabrow .tab-btn[data-tab="games"]');
      if (b) b.click();
      renderGamesTab();
      const card = document.querySelector('#gamesView .game-card-clickable');
      const gameId = card.dataset.gameid;
      card.click();                                   // expand the card

      const details = document.querySelector('#gamesView .wm-calc');
      if (!details) return { found: false };
      const summary = details.querySelector('summary');

      const before = { open: details.open, expanded: expandedGameId };
      summary.click();                                // open the disclosure
      const opened = {
        open: document.querySelector('#gamesView .wm-calc').open,
        expanded: expandedGameId,
        text: document.querySelector('#gamesView .wm-calc').innerText.replace(/\n+/g, ' | '),
      };
      document.querySelector('#gamesView .wm-calc summary').click();   // and close it
      const closed = {
        open: document.querySelector('#gamesView .wm-calc').open,
        expanded: expandedGameId,
      };
      return { found: true, gameId, before, opened, closed };
    });

    assert.strictEqual(r.found, true, 'the expanded card must carry a disclosure');
    assert.strictEqual(r.before.open, false, 'it starts closed');
    assert.strictEqual(r.before.expanded, r.gameId, 'the card is expanded');

    assert.strictEqual(r.opened.open, true, 'clicking the summary must open it');
    assert.strictEqual(r.opened.expanded, r.gameId,
      'and must NOT collapse the card underneath it — that was the bug');

    assert.strictEqual(r.closed.open, false, 'clicking again must close it');
    assert.strictEqual(r.closed.expanded, r.gameId, 'still without collapsing the card');

    // And it contains the technical facts, from the persisted record.
    assert.match(r.opened.text, /Pre-match expected score/);
    assert.match(r.opened.text, /Share of games won/);
    assert.match(r.opened.text, /Match result contribution/);
    assert.match(r.opened.text, /Blended performance score/);
    assert.match(r.opened.text, /K \d/);
    assert.match(r.opened.text, /reliability \d+% → \d+%/);
    assert.deepStrictEqual(app.pageErrors, []);
  } finally { await app.close(); }
});

test('the expanded Games card stays compact', { skip }, async () => {
  const app = await H.open();
  try {
    const r = await app.run(() => {
      const b = document.querySelector('#tabrow .tab-btn[data-tab="games"]');
      if (b) b.click();
      renderGamesTab();
      const card = document.querySelector('#gamesView .game-card-clickable');
      card.click();
      const expanded = document.querySelector('#gamesView .callout-card');
      const clone = expanded.cloneNode(true);
      [...clone.querySelectorAll('.wm-calc')].forEach((d) => d.remove());
      return {
        visible: clone.innerText.replace(/\n+/g, '\n').trim(),
        hasDisclosure: !!expanded.querySelector('.wm-calc'),
      };
    });

    // The redundant explanation between the result line and the per-player
    // movements is gone; that nuance lives in the disclosure now.
    assert.doesNotMatch(r.visible, /matched the game-share expectation/i);
    assert.doesNotMatch(r.visible, /also contributes to the rating calculation/i);
    assert.doesNotMatch(r.visible, /won (more|fewer) games than expected/i);
    assert.doesNotMatch(r.visible, /[Pp]erformance score/);

    // One line carries the expectation, what was taken, and the result.
    assert.match(r.visible, /Expected \d+% of games · won \d+\/\d+ \(\d+%\) · (won match|not finished)/);
    assert.match(r.visible, /ratings going in/);
    assert.match(r.visible, /RATING CHANGE, PER PLAYER/i);
    assert.strictEqual(r.hasDisclosure, true);

    const lines = r.visible.split('\n').filter(Boolean);
    assert.ok(lines.length <= 12, `the expanded card should stay short, got ${lines.length} lines:\n${r.visible}`);
    assert.deepStrictEqual(app.pageErrors, []);
  } finally { await app.close(); }
});

// ===================== RANKED / IDLE / INACTIVE (19 Sep 2026) ===============
// The app used to call two different things "inactive": a player who has not
// played much lately, and a player who has left the club. These cover the
// separation, and the eligibility bug that separation exposed.

// Shaun spotted Ant Slice showing "#–" on Home despite recent activity. He has
// well over the threshold; getViewerSnapshot was additionally requiring
// total >= 10, which is the rankings list's default min-games DISPLAY filter,
// not an eligibility rule.
test('a player with recent matches gets a rank, whatever their lifetime total', { skip }, async () => {
  const app = await H.open();
  try {
    const r = await app.run(() => {
      const name = 'Ant Slice';
      const st = playerStateOf(name);
      const snap = getViewerSnapshot(name);
      const p = PLAYERS.find((x) => x.name === name);
      return {
        recent: st.recentMatches,
        lifetime: p.total,
        participation: st.participation,
        ranking: st.ranking,
        rankable: st.rankable,
        overallRank: snap.overallRank,
        tierRank: snap.tierRank,
        eligible: snap.eligible,
      };
    });

    assert.ok(r.recent >= 2, `the case under test needs recent matches, got ${r.recent}`);
    assert.ok(r.lifetime < 10, `and a lifetime total under the old hardcoded 10, got ${r.lifetime}`);
    assert.strictEqual(r.participation, 'ACTIVE');
    assert.strictEqual(r.ranking, 'RANKED');
    assert.strictEqual(r.rankable, true);
    assert.ok(r.overallRank > 0, 'must have an overall rank, not "#–"');
    assert.ok(r.tierRank > 0, 'must have a tier rank, not "#–"');
    assert.strictEqual(r.eligible, true);
    assert.deepStrictEqual(app.pageErrors, []);
  } finally { await app.close(); }
});

// One helper, one dataset, every surface. A player must not be Ranked in the
// list and "#–" on their own profile.
test('Ranked/Idle state and rank availability agree across every surface', { skip }, async () => {
  const app = await H.open();
  try {
    const r = await app.run(() => {
      activeTab = 'power'; selectedMonth = 'all'; activeTier = 'All'; minGames = 0; query = '';
      rankingFilter = 'all'; participationFilter = 'active';
      render();

      // What the RANKINGS list says: a numbered row, or a dash under the
      // Idle divider.
      const listState = {};
      [...document.querySelectorAll('#list .row')].forEach((row) => {
        const name = row.dataset.player || (row.querySelector('.nm') || {}).textContent;
        if (!name) return;
        const rank = (row.querySelector('.rank') || {}).textContent;
        listState[name.trim()] = {
          ranked: rank !== '–',
          idleTag: !!row.querySelector('.idle-tag'),
        };
      });

      const disagreements = [];
      Object.keys(listState).forEach((name) => {
        const st = playerStateOf(name);                 // the shared helper
        const snap = getViewerSnapshot(name);           // Home + Profile
        const list = listState[name];
        const expectedRanked = st.ranking === 'RANKED';

        if (list.ranked !== expectedRanked) disagreements.push(`${name}: list ranked=${list.ranked}, helper=${st.ranking}`);
        if (snap.eligible !== expectedRanked) disagreements.push(`${name}: snapshot eligible=${snap.eligible}, helper=${st.ranking}`);
        if ((snap.overallRank !== null) !== expectedRanked) disagreements.push(`${name}: snapshot rank=${snap.overallRank}, helper=${st.ranking}`);
        if (list.idleTag !== (st.ranking === 'IDLE')) disagreements.push(`${name}: idle tag=${list.idleTag}, helper=${st.ranking}`);
      });

      return { checked: Object.keys(listState).length, disagreements };
    });

    assert.ok(r.checked > 25, `not enough players checked (${r.checked})`);
    assert.deepStrictEqual(r.disagreements, [],
      'Rankings, Home and Profile must agree on every player');
    assert.deepStrictEqual(app.pageErrors, []);
  } finally { await app.close(); }
});

test('an active player below the threshold reads Idle, not Inactive', { skip }, async () => {
  const app = await H.open();
  try {
    const r = await app.run(() => {
      activeTab = 'power'; selectedMonth = 'all'; activeTier = 'All'; minGames = 0; query = '';
      rankingFilter = 'all'; participationFilter = 'active';
      render();
      const divider = document.getElementById('eligibilityDivider');
      const idleRows = [...document.querySelectorAll('#list .row')].filter((el) => el.querySelector('.idle-tag'));
      const names = idleRows.map((el) => (el.dataset.player || el.querySelector('.nm').textContent).trim());
      return {
        divider: divider ? divider.textContent : null,
        idleCount: idleRows.length,
        inactiveTags: document.querySelectorAll('#list .inactive-tag').length,
        allActive: names.every((n) => playerStateOf(n).participation === 'ACTIVE'),
        listText: document.getElementById('list').innerText,
      };
    });

    assert.ok(r.idleCount > 0, 'the fixture must contain idle players');
    assert.match(r.divider, /^Idle players — fewer than 2 matches in the last 30 days$/);
    assert.strictEqual(r.inactiveTags, 0, 'nobody below the divider may be tagged Inactive');
    assert.strictEqual(r.allActive, true, 'every idle player is still an active member');
    assert.doesNotMatch(r.listText, /Not currently ranked/,
      'the old wording implied missing data rather than a state');
    assert.deepStrictEqual(app.pageErrors, []);
  } finally { await app.close(); }
});

test('Idle and Inactive are filtered independently', { skip }, async () => {
  const app = await H.open();
  try {
    const r = await app.run(() => {
      const snap = () => ({
        rows: document.querySelectorAll('#list .row').length,
        idle: document.querySelectorAll('#list .idle-tag').length,
        inactive: document.querySelectorAll('#list .inactive-tag').length,
        dividers: [...document.querySelectorAll('.eligibility-divider')].map((d) => d.textContent),
      });
      activeTab = 'power'; selectedMonth = 'all'; activeTier = 'All'; minGames = 0; query = '';
      const out = {};
      rankingFilter = 'all'; participationFilter = 'active'; render(); out.byDefault = snap();
      rankingFilter = 'ranked'; participationFilter = 'active'; render(); out.rankedOnly = snap();
      rankingFilter = 'all'; participationFilter = 'all'; render(); out.withInactive = snap();
      rankingFilter = 'ranked'; participationFilter = 'all'; render(); out.rankedPlusInactive = snap();
      rankingFilter = 'all'; participationFilter = 'active';
      return out;
    });

    // Default: ranked list, idle beneath it, nobody who has left the club.
    assert.ok(r.byDefault.idle > 0);
    assert.strictEqual(r.byDefault.inactive, 0, 'inactive players are hidden by default');
    assert.deepStrictEqual(r.byDefault.dividers, ['Idle players — fewer than 2 matches in the last 30 days']);

    // Ranked only: no idle group at all.
    assert.strictEqual(r.rankedOnly.idle, 0);
    assert.ok(r.rankedOnly.rows < r.byDefault.rows, 'hiding idle must remove rows');
    assert.deepStrictEqual(r.rankedOnly.dividers, []);

    // Include inactive: its own section, below idle.
    assert.ok(r.withInactive.inactive > 0, 'the fixture must contain an inactive player');
    assert.strictEqual(r.withInactive.rows, r.byDefault.rows + r.withInactive.inactive);
    assert.deepStrictEqual(r.withInactive.dividers, [
      'Idle players — fewer than 2 matches in the last 30 days',
      'Inactive players — not currently participating',
    ]);

    // The two dimensions are genuinely independent: ranked-only still shows
    // inactive when asked, and they are not mixed into the idle group.
    assert.strictEqual(r.rankedPlusInactive.idle, 0);
    assert.ok(r.rankedPlusInactive.inactive > 0);
    assert.deepStrictEqual(r.rankedPlusInactive.dividers, ['Inactive players — not currently participating']);
    assert.deepStrictEqual(app.pageErrors, []);
  } finally { await app.close(); }
});

// The state filters share the .preset-btn class with the min-games row. An
// unscoped selector would have fed parseInt(undefined) into minGames.
test('the state filters and the min-games presets do not fight', { skip }, async () => {
  const app = await H.open();
  try {
    const r = await app.run(() => {
      activeTab = 'power'; selectedMonth = 'all'; activeTier = 'All'; query = '';
      document.querySelector('#minGamesRow .preset-btn[data-n="5"]').click();
      const afterMinGames = {
        minGames,
        rankingActive: document.querySelector('#stateFilterRow [data-ranking].active').dataset.ranking,
        participationActive: document.querySelector('#stateFilterRow [data-participation].active').dataset.participation,
      };
      document.querySelector('#stateFilterRow [data-ranking="ranked"]').click();
      const afterRanking = {
        minGames,
        minGamesActive: document.querySelector('#minGamesRow .preset-btn.active').dataset.n,
        rankingFilter,
      };
      return { afterMinGames, afterRanking };
    });

    assert.strictEqual(r.afterMinGames.minGames, 5);
    assert.strictEqual(r.afterMinGames.rankingActive, 'all', 'a min-games press must not clear the state filters');
    assert.strictEqual(r.afterMinGames.participationActive, 'active');

    assert.strictEqual(r.afterRanking.rankingFilter, 'ranked');
    assert.strictEqual(r.afterRanking.minGames, 5, 'a state-filter press must not corrupt minGames');
    assert.strictEqual(r.afterRanking.minGamesActive, '5');
    assert.deepStrictEqual(app.pageErrors, []);
  } finally { await app.close(); }
});
