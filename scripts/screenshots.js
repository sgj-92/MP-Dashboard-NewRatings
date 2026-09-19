#!/usr/bin/env node
// Capture the review screenshots CGPT and Shaun asked for.
//
//   node scripts/screenshots.js
//
// They are review aids, not release documentation, so they are taken from the
// LIVE beta record rather than the seeded fixture. A screenshot of the seed
// would show ratings that no longer exist -- the three board decisions of
// 18 Sep moved most of the club -- and a review aid that shows the wrong
// numbers is worse than none.
//
// Read-only: the page is served locally and its Firestore is a stub holding a
// copy of the live documents. Nothing is written back.

const http = require('node:http');
const fs = require('node:fs');
const path = require('node:path');
const Store = require('../assets/js/ratingStore.js');
const { PROJECT_ID } = require('./seed-beta.js');

const ROOT = path.join(__dirname, '..');
const OUT = path.join(ROOT, 'docs', 'screenshots');
const TYPES = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.json': 'application/json',
  '.png': 'image/png', '.svg': 'image/svg+xml', '.ico': 'image/x-icon', '.webmanifest': 'application/manifest+json' };

function playwright() {
  for (const id of ['playwright', '/opt/node22/lib/node_modules/playwright']) {
    try { return require(id); } catch (e) { /* next */ }
  }
  return null;
}

function serve() {
  const server = http.createServer((req, res) => {
    const rel = decodeURIComponent(req.url.split('?')[0]).replace(/^\/+/, '') || 'index.html';
    const file = path.join(ROOT, rel);
    if (!file.startsWith(ROOT) || !fs.existsSync(file) || fs.statSync(file).isDirectory()) { res.writeHead(404); res.end(); return; }
    res.writeHead(200, { 'Content-Type': TYPES[path.extname(file)] || 'application/octet-stream' });
    fs.createReadStream(file).pipe(res);
  });
  return new Promise((r) => server.listen(0, '127.0.0.1', () => r(server)));
}

// Each shot says what a reviewer should be looking at, which is the point of a
// review aid. The captions become docs/screenshots/README.md.
const SHOTS = [
  { file: '01-rankings-all-time.png', title: 'Power Rankings — all time',
    note: 'Kings of Tiers, the podium and the ranking list. A tier is crowned only where someone qualifies at the chosen minimum games, so S and C are absent here rather than shown empty.' },
  { file: '02-rankings-month.png', title: 'Power Rankings — a single month',
    note: 'Key takeaways first, Monthly Performance open, the other three stories folded -- all four concepts kept. Club-decision movement stays labelled apart from movement earned on court, so Tom\'s July reads as a board decision rather than form.' },
  { file: '03-profile-hero.png', title: 'Player profile — reliability at a glance',
    note: 'Reliability sits in its own facts row with its band, beside tier and games played and deliberately away from rank and win rate: it measures how much evidence stands behind the rating, not how good the player is.' },
  { file: '04-profile-journey.png', title: 'Rating Journey',
    note: 'The recorded journey, not a reconstruction: the last point IS the Power Rating. Milestones show the club decision with its own marker.' },
  { file: '05-match-card.png', title: 'Match detail',
    note: 'Ratings as they were going in, the performance score against the pre-match expectation, and each player\'s own rating change. Scores read from the player in focus, so a loss looks like a loss.' },
  { file: '06-monthly-breakdown.png', title: 'Monthly Rating breakdown',
    note: 'Carried-in rating (1137 -- wherever the continuous rating had reached, never a tier baseline) and the month\'s moves as the engine recorded them, including each player\'s own change in a shared match.' },
  { file: '07-admin-review.png', title: 'Admin — Monthly Review',
    note: 'A tier change cannot be recorded until the board answers the rating question. Four explicit answers, and an answer the record makes impossible is disabled with its reason beside it rather than offered as a live button.' },
  { file: '08-admin-historical.png', title: 'Admin — Historical Club Adjustment',
    note: 'A board decision entered late. State reconstructed as at that date, and the decisions already on it labelled: what is Active, what was Superseded, and what each one actually did. Nothing earlier is deleted or rewritten.' },
  { file: '09-admin-diagnostics.png', title: 'Admin — Beta diagnostics',
    note: 'Reads the three collections directly and checks the record still hangs together. Also carries the read-strategy measurement.' },
  { file: '10-games-feed.png', title: 'Play — the results feed',
    note: 'What a player sees. Teams, result, score, badge, submission metadata — and nothing else. The correction controls exist for one person and do not appear here at all.' },
  { file: '10b-games-correction.png', title: 'Play — Manage, opened by an admin',
    note: 'Unlocked, one card at a time, behind a compact Manage affordance in the card header. Two separate actions with their own words: a removal is confirmed by a button that says Remove and replay, never by one that says correct. The blast radius is measured by replaying and shown in full before anything is written.' },
  { file: '11-full-calculation.png', title: 'The full calculation',
    note: 'The disclosure inside the monthly breakdown: sequential-v1 stated as it actually is -- applied once in order, never re-solved, never reset at a month boundary, with K falling as evidence builds. It also shows the unrounded month-end figure.' },
  { file: '12-rating-guide-summary.png', title: 'Power Rating Guide — in short',
    note: 'Reachable from More. Leads with the idea, not the formula: the rating is not a reward for wins, it is an estimate of level. The five things that sound alike are separated explicitly.' },
  { file: '13-rating-guide-maths.png', title: 'Power Rating Guide — the actual calculation',
    note: 'One tap away. The formulas are read from the running engine rather than written out beside it, so the guide cannot describe a model the app is not using. The comparison shows why the same overperformance moves an established player ~2.9 points and a newly reassessed one 7.4.' },
  { file: '14-rating-guide-faq.png', title: 'Power Rating Guide — questions people actually ask',
    note: 'The complaints the guide exists to pre-empt, answered directly: a small move after a win, a rating rising after a loss, a partner moving further, and whether anything resets monthly.' },
  { file: '15-why-your-rating-moved.png', title: 'Why your rating moved',
    note: 'Padel language first, in the order a player thinks in: were we favoured, what were we expected to take, what did we take and did we win, so what did that earn. The decimals sit behind "See full calculation" — read from the same persisted facts, never a second calculation.' },
];

async function main() {
  const pw = playwright();
  if (!pw) { console.error('Playwright is not available.'); process.exitCode = 1; return; }

  // Iterating on captures used to cost a full read of the record every run --
  // 857 documents, a dozen times in a working session, which is how the beta's
  // daily Firestore read quota got exhausted on 19 Sep. The live record is
  // cached to disk and reused; --refresh forces a fresh read.
  const cachePath = path.join(OUT, '.live-record.json');
  const refresh = process.argv.includes('--refresh');
  let cache = {};
  if (fs.existsSync(cachePath)) {
    try { cache = JSON.parse(fs.readFileSync(cachePath, 'utf8')); } catch (e) { cache = {}; }
  }
  if (!refresh && cache.players && cache.matches && cache.journey) {
    console.log(`Using the cached live record from ${cache.readAt} (--refresh to re-read).`);
    return render(cache.players, cache.matches, cache.journey, cache.readAt);
  }

  console.log('Reading the live beta ...');
  const backend = Store.firestoreRestBackend({ projectId: PROJECT_ID });
  // Sequentially, with backoff. Three parallel reads of 857 documents is enough
  // to earn a 429, and a rate limit is a wait rather than a failure -- giving
  // up on it would leave the last capture on disk, silently stale, which is the
  // one outcome worse than not regenerating at all.
  const read = async (collection) => {
    for (let attempt = 1; ; attempt++) {
      try { return await backend.getAll(collection); } catch (e) {
        const rateLimited = /\b429\b/.test(e.message);
        if (!rateLimited || attempt >= 6) throw e;
        const waitMs = 2000 * attempt;
        console.log(`  ${collection}: rate limited, retrying in ${waitMs / 1000}s (attempt ${attempt})`);
        await new Promise((r) => setTimeout(r, waitMs));
      }
    }
  };
  // Cached per collection, and written as each one lands. The 666-event journey
  // is far the most expensive read and the one that gets rate-limited, so a
  // failure on it must not throw away the two that already succeeded -- the
  // next attempt then costs one read instead of three.
  const fetchInto = async (key, collection) => {
    if (cache[key] && !refresh) { console.log(`  ${collection}: reusing cache`); return cache[key]; }
    const got = await read(collection);
    cache[key] = got;
    cache.readAt = new Date().toISOString().slice(0, 10);
    fs.mkdirSync(OUT, { recursive: true });
    fs.writeFileSync(cachePath, JSON.stringify(cache));
    return got;
  };
  const players = await fetchInto('players', Store.COLLECTIONS.players);
  const matches = await fetchInto('matches', Store.COLLECTIONS.matches);
  const journey = await fetchInto('journey', Store.COLLECTIONS.journey);
  return render(players, matches, journey, cache.readAt);
}

async function render(players, matches, journey, readAt) {
  const pw = playwright();
  if (!pw) { console.error('Playwright is not available.'); process.exitCode = 1; return; }
  console.log(`  ${players.length} players, ${matches.length} matches, ${journey.length} journey events`);

  const server = await serve();
  const port = server.address().port;
  const browser = await pw.chromium.launch();
  const page = await browser.newPage({ viewport: { width: 430, height: 932 }, deviceScaleFactor: 2 });
  const errors = [];
  page.on('pageerror', (e) => errors.push(e.message));

  await page.addInitScript(({ data }) => {
    window.firebase = { initializeApp() {}, firestore() { return { collection(n) { return {
      doc(id) { return { async get() { const v = (data[n] || {})[id]; return { exists: !!v, data: () => v }; },
        async set() {}, async delete() {} }; },
      async get() { return { docs: Object.values(data[n] || {}).map((v) => ({ data: () => v })) }; },
    }; } }; } };
  }, { data: {
    players: Object.fromEntries(players.map((d) => [d.id, d])),
    matches: Object.fromEntries(matches.map((d) => [d.id, d])),
    ratingJourney: Object.fromEntries(journey.map((d) => [d.id, d])),
  } });

  await page.goto(`http://127.0.0.1:${port}/index.html`, { waitUntil: 'domcontentloaded' });
  await page.waitForFunction(() => typeof V3_STATE !== 'undefined' && (V3_STATE.loaded || V3_STATE.error), null, { timeout: 20000 });
  await page.waitForTimeout(600);
  const dismiss = () => page.evaluate(() => { const el = document.getElementById('viewerSelectorSheet'); if (el) el.remove(); });
  await dismiss();

  fs.mkdirSync(OUT, { recursive: true });
  const shot = async (file, prepare, scrollTo) => {
    await page.evaluate(prepare);
    await page.waitForTimeout(700);
    await dismiss();
    if (scrollTo) { await page.evaluate(scrollTo); await page.waitForTimeout(400); }
    await page.screenshot({ path: path.join(OUT, file) });
    console.log('  ' + file);
  };

  console.log('Capturing ...');
  await shot('01-rankings-all-time.png',
    () => { selectedMonth = 'all'; activeTier = 'All'; minGames = 10; activeTab = 'power'; activeSortP = 'rating'; goToSection('rankings'); render(); },
    () => { const el = document.getElementById('kingsOfTiersPanel'); if (el) el.scrollIntoView({ block: 'start' }); });
  await shot('02-rankings-month.png',
    () => { selectedMonth = '2026-07'; minGames = 5; render(); },
    () => { const el = document.querySelector('.monthly-stories'); if (el) el.scrollIntoView({ block: 'start' }); });
  await shot('03-profile-hero.png',
    () => { selectedMonth = 'all'; minGames = 10; render(); openSheet('Shaun'); },
    () => { const el = document.querySelector('.pp-hero'); if (el) el.scrollIntoView({ block: 'start' }); });
  await shot('04-profile-journey.png',
    // openSheet is wrapped to render the premium profile itself. Calling
    // renderPremiumProfile again rebuilds the wrapper AFTER the match cards
    // have been reparented into it, which empties Recent Results.
    () => { selectedMonth = 'all'; minGames = 10; render(); openSheet('Shaun'); },
    () => { const w = document.getElementById('premiumProfileWrap'); const el = w && [...w.querySelectorAll('.pp-section-label')].find((e) => /rating journey/i.test(e.textContent)); if (el) el.scrollIntoView({ block: 'start' }); });
  await shot('05-match-card.png', () => {}, () => {
    const host = document.getElementById('ppMatchesHost');
    const row = host && host.querySelector('.pp-match-row');
    if (!row) return;
    row.click();
    const label = [...host.parentElement.querySelectorAll('.pp-section-label')].find((e) => /recent results/i.test(e.textContent));
    (label || row).scrollIntoView({ block: 'start' });
  });
  await shot('06-monthly-breakdown.png',
    () => { closeSheet(); selectedMonth = '2026-07'; minGames = 5; render(); openMonthlyRatingBreakdown('Shaun', '2026-07'); });
  await shot('07-admin-review.png',
    () => {
      const mrb = document.getElementById('monthlyRatingModal'); if (mrb) mrb.classList.remove('show');
      closeSheet(); isUnlocked = true; currentUserName = 'Board';
      // Reach Admin the way a reviewer does -- More > Admin / Manage -- so the
      // More sheet is closed by its own handler rather than left over the shot.
      const admin = document.querySelector('#shellMoreSheet .admin-item');
      if (admin) admin.click();
      if (typeof renderManage === 'function') renderManage();
      // Open a real review and choose a tier move, which is what arms the
      // required rating question. Nothing is staged for writing: the confirm
      // step is never reached, and the stubbed Firestore cannot write anyway.
      const cands = reviewCandidates();
      reviewSubject = cands.length ? cands[0].name : 'Rishi';
      renderManage();
      const tier = document.querySelector('.review-tier');
      if (tier) tier.click();
    },
    () => { const el = [...document.querySelectorAll('.section-heading')].find((e) => /Rating — required/i.test(e.textContent)); if (el) el.scrollIntoView({ block: 'start' }); });
  await shot('08-admin-historical.png',
    () => {
      reviewSubject = null; renderManage();
      const p = document.getElementById('histPlayer'), d = document.getElementById('histDate');
      if (p && d) { p.value = 'Tom'; d.value = '2026-07-01'; histLoadContext(); }
    },
    () => { const el = [...document.querySelectorAll('.section-heading')].find((e) => /Historical club adjustment/i.test(e.textContent)); if (el) el.scrollIntoView({ block: 'start' }); });
  await shot('09-admin-diagnostics.png',
    () => { histReset(); renderManage(); return runBetaDiagnostics(); },
    () => { const el = [...document.querySelectorAll('.section-heading')].find((e) => /Beta diagnostics/i.test(e.textContent)); if (el) el.scrollIntoView({ block: 'start' }); });
  // Games is a tab inside the Play section, not a section of its own, so it is
  // reached through its legacy tab button. Staging a removal PLANS the replay
  // and shows the consequence; it is never confirmed, and the stubbed
  // Firestore has no write path in any case.
  // The player-facing feed first: no admin surface anywhere on it.
  await shot('10-games-feed.png',
    () => {
      const b = document.querySelector('#tabrow .tab-btn[data-tab="games"]');
      if (b) b.click();
      selectedMonth = 'all'; isUnlocked = false; currentUserName = '';
      renderGamesTab();
    },
    () => { const el = document.querySelector('#gamesView .callout-card'); if (el) el.scrollIntoView({ block: 'start' }); });
  await shot('10b-games-correction.png',
    () => {
      selectedMonth = 'all'; isUnlocked = true; currentUserName = 'Board';
      renderGamesTab();
      const yn = document.getElementById('gamesYourName'); if (yn) yn.value = 'Board';
      const manage = document.querySelector('#gamesView [data-manage]');
      if (!manage) return null;
      manage.click();
      const del = document.querySelector('#gamesView [data-delete]');
      if (!del) return null;
      return deleteMatch(del.dataset.delete);
    },
    () => { const el = [...document.querySelectorAll('#gamesView .callout-card')].find((e) => /re-derives every rating/i.test(e.textContent)); if (el) el.scrollIntoView({ block: 'start' }); });

  const openGuide = () => {
    const m = document.getElementById('monthlyRatingModal'); if (m) m.classList.remove('show');
    closeSheet();
    const b = document.querySelector('#tabrow .tab-btn[data-tab="power"]'); if (b) b.click();
    selectedMonth = 'all'; minGames = 10; render();
    openPowerRatingGuide();
  };
  await shot('12-rating-guide-summary.png', openGuide,
    () => { const el = document.querySelector('.rg-anchor'); if (el) el.scrollIntoView({ block: 'start' }); });
  await shot('13-rating-guide-maths.png',
    () => { const f = document.querySelector('.rg-fold'); if (f) f.open = true; },
    () => { const el = document.querySelector('.rg-formula'); if (el) el.scrollIntoView({ block: 'start' }); });
  await shot('14-rating-guide-faq.png',
    () => {
      const f = document.querySelector('.rg-fold'); if (f) f.open = false;
      const faqs = [...document.querySelectorAll('.rg-faq')];
      faqs.slice(0, 2).forEach((d) => { d.open = true; });
    },
    () => { const el = [...document.querySelectorAll('.rg-h')].find((e) => /questions people/i.test(e.textContent)); if (el) el.scrollIntoView({ block: 'start' }); });
  await shot('15-why-your-rating-moved.png',
    () => {
      const g = document.getElementById('ratingGuideModal'); if (g) g.classList.remove('show');
      selectedMonth = 'all'; minGames = 10; render();
      openSheet('Shaun');
      const host = document.getElementById('ppMatchesHost');
      const row = host && host.querySelector('.pp-match-row');
      if (row) row.click();
    },
    () => {
      const d = document.querySelector('.why-moved .wm-calc'); if (d) d.open = true;
      const el = document.querySelector('.why-moved'); if (el) el.scrollIntoView({ block: 'start' });
    });

  // Back to the monthly breakdown for the calculation disclosure, which is
  // the one place the engine describes its own arithmetic.
  await shot('11-full-calculation.png',
    () => {
      matchFixReset();
      const b = document.querySelector('#tabrow .tab-btn[data-tab="power"]');
      if (b) b.click();
      selectedMonth = '2026-07'; minGames = 5; render();
      openMonthlyRatingBreakdown('Shaun', '2026-07');
      const t = document.getElementById('mrbFullCalcToggle'); if (t) t.click();
    },
    () => { const el = document.getElementById('mrbFullCalcBody'); if (el) el.scrollIntoView({ block: 'start' }); });

  const readme = ['# Review screenshots', '',
    `Captured from the **live beta record** as it stood on ${readAt}, by \`scripts/screenshots.js\`.`,
    'Review aids for CGPT and Shaun, not release documentation. Regenerate rather than edit.', '',
    'Taken from the live record on purpose: the three board decisions of 18 Sep moved most of the club,',
    'so a capture of the seeded fixture would show ratings that no longer exist.', ''];
  SHOTS.forEach((s) => { readme.push(`### ${s.title}`, '', `![${s.title}](${s.file})`, '', s.note, ''); });
  fs.writeFileSync(path.join(OUT, 'README.md'), readme.join('\n'));

  await browser.close();
  server.close();
  console.log(`\n${SHOTS.length} screenshots in docs/screenshots/. Page errors: ${errors.length}`);
  if (errors.length) { errors.slice(0, 5).forEach((e) => console.error('  ' + e)); process.exitCode = 1; }
}

if (require.main === module) main().catch((e) => { console.error(e); process.exitCode = 1; });
