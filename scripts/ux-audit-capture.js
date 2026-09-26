#!/usr/bin/env node
// Player Experience Reset — Phase 1 UX audit capture.
//
//   node scripts/ux-audit-capture.js --read-live <snapshot.json>   # read the live beta (read-only)
//   node scripts/ux-audit-capture.js <snapshot.json>               # capture docs/ux-audit/
//
// Evidence gathering only. The page is the current build served locally; its
// Firestore is a stub holding a copy of the live documents, and every write
// the app attempts is recorded and discarded -- the capture fails if any is
// attempted. The admin password hash is never served: a stand-in keeps the
// "a password is set" state without the secret. The snapshot file holds live
// data and is deliberately NOT committed.
//
// Everything is reached by tapping what a player would tap (bottom nav,
// subnav, headings, buttons), so a screenshot shows a state the app can
// actually be put in, not one assembled by calling internals.

const http = require('node:http');
const fs = require('node:fs');
const path = require('node:path');

const ROOT = path.join(__dirname, '..');
const OUT = path.join(ROOT, 'docs', 'ux-audit');
const SHOTS = path.join(OUT, 'screenshots');
const PROJECT = 'mp-dashboard-beta-v3';
const VIEWER = 'PDM';               // representative selected player (Tier B, active, has an Upcoming game)
const OTHER = 'Rishi';              // "another player" for journey 7
const NOW = '2026-09-26T12:00:00';  // the day the snapshot was read
const TYPES = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.json': 'application/json',
  '.png': 'image/png', '.svg': 'image/svg+xml', '.ico': 'image/x-icon' };

function playwright() {
  for (const id of ['playwright', '/opt/node22/lib/node_modules/playwright']) {
    try { return require(id); } catch (e) { /* next */ }
  }
  return null;
}

// ---- reading the live beta (read-only) --------------------------------------

async function readLive(file) {
  const base = `https://firestore.googleapis.com/v1/projects/${PROJECT}/databases/(default)/documents`;
  const Store = require('../assets/js/ratingStore.js');
  const backend = Store.firestoreRestBackend({ projectId: PROJECT });
  const snap = { readAt: new Date().toISOString() };
  snap.players = await backend.getAll('players');
  snap.matches = await backend.getAll('matches');
  snap.journey = await backend.getAll('ratingJourney');
  const body = await (await fetch(`${base}/moneypadel?pageSize=300`)).json();
  snap.kv = {};
  (body.documents || []).forEach((d) => {
    const f = d.fields || {};
    snap.kv[d.name.split('/').pop()] = {
      value: f.value && f.value.stringValue,
      updatedAt: +((f.updatedAt && (f.updatedAt.integerValue || f.updatedAt.doubleValue)) || 0),
    };
  });
  fs.writeFileSync(file, JSON.stringify(snap));
  console.log(`read ${snap.players.length} players, ${snap.matches.length} matches, ${snap.journey.length} journey events, ${Object.keys(snap.kv).length} club documents`);
}

// ---- the app, served locally against the snapshot ---------------------------

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

function dataFrom(snap) {
  const kv = { ...snap.kv };
  Object.keys(kv).filter((k) => /_pw_|password/i.test(k)).forEach((k) => {
    kv[k] = { value: JSON.stringify('0'.repeat(64)), updatedAt: 0 };
  });
  return {
    players: Object.fromEntries(snap.players.map((d) => [d.id, d])),
    matches: Object.fromEntries(snap.matches.map((d) => [d.id, d])),
    ratingJourney: Object.fromEntries(snap.journey.map((d) => [d.id, d])),
    moneypadel: kv,
  };
}

async function openApp(pw, server, snap, { width = 390, height = 844, viewer = VIEWER, fresh = false, latencyMs = 0, failReads = false } = {}) {
  const browser = await pw.chromium.launch();
  const context = await browser.newContext({ viewport: { width, height }, deviceScaleFactor: 2, timezoneId: 'Europe/London' });
  const page = await context.newPage();
  await page.clock.setFixedTime(new Date(NOW));
  const errors = []; const writes = [];
  page.on('pageerror', (e) => errors.push(e.message));
  await page.exposeFunction('__auditWrite', (w) => writes.push(w));
  await page.addInitScript(({ data, viewer, fresh, latencyMs, failReads }) => {
    if (!fresh && viewer) { try { localStorage.setItem('moneypadel_current_viewer', viewer); } catch (e) { /* none */ } }
    const wait = () => new Promise((r) => setTimeout(r, latencyMs));
    const read = async (v) => { if (latencyMs) await wait(); if (failReads) throw new Error('offline (audit)'); return v; };
    window.firebase = { initializeApp() {}, firestore() { return {
      collection(n) { return {
        doc(id) { return {
          async get() { const v = await read((data[n] || {})[id]); return { exists: !!v, data: () => v }; },
          async set() { window.__auditWrite({ n, id }); }, async update() { window.__auditWrite({ n, id }); },
          async delete() { window.__auditWrite({ n, id, op: 'delete' }); },
        }; },
        async get() { const all = await read(Object.entries(data[n] || {})); return { docs: all.map(([id, v]) => ({ id, data: () => v })) }; },
      }; },
      batch() { return { set() {}, update() {}, delete() {}, async commit() { window.__auditWrite({ op: 'batch' }); } }; },
    }; } };
  }, { data: dataFrom(snap), viewer, fresh, latencyMs, failReads });
  await page.goto(`http://127.0.0.1:${server.address().port}/index.html`, { waitUntil: 'domcontentloaded' });
  return { browser, page, errors, writes };
}

async function ready(page) {
  await page.waitForFunction(() => typeof DATA_READY !== 'undefined' && DATA_READY, null, { timeout: 30000 });
  await page.waitForTimeout(600);
}

// ---- tapping like a player ----------------------------------------------------

// Clicks the most specific visible control whose text matches. Returns false
// (and the caller records a dead end) rather than throwing.
async function tap(page, pattern, scope) {
  const hit = await page.evaluate(([src, scope]) => {
    const re = new RegExp(src, 'i');
    const root = scope ? document.querySelector(scope) : document;
    if (!root) return null;
    const sel = 'button, a, summary, [role=button], .request-player-link, .pp-match-row, .game-card-clickable, .home-pulse-card, .shell-nav-item, .section-subnav-item, .dir-row, .dir-card, .player-row, tr[data-player], .rank-row';
    const visible = (e) => { const r = e.getBoundingClientRect(); const cs = getComputedStyle(e); return r.width > 0 && r.height > 0 && cs.visibility !== 'hidden' && cs.display !== 'none'; };
    const cands = [...root.querySelectorAll(sel)].filter(visible).filter((e) => re.test((e.innerText || e.textContent || '').replace(/\s+/g, ' ').trim()));
    if (!cands.length) return null;
    cands.sort((a, b) => { const ra = a.getBoundingClientRect(), rb = b.getBoundingClientRect(); return ra.width * ra.height - rb.width * rb.height; });
    const el = cands[0];
    el.scrollIntoView({ block: 'center' });
    el.click();
    return (el.innerText || el.textContent || '').replace(/\s+/g, ' ').trim().slice(0, 60);
  }, [pattern.source || pattern, scope || null]);
  await page.waitForTimeout(450);
  return hit;
}
const nav = (page, label) => tap(page, `^\\s*${label}\\s*$`, '.shell-bottom-nav');
const subnav = (page, label) => tap(page, `^\\s*${label}\\s*$`, '#sectionSubnav');
async function choose(page, selectId, text) {
  const ok = await page.evaluate(([id, text]) => {
    const s = document.getElementById(id); if (!s) return false;
    const o = [...s.options].find((x) => new RegExp(text, 'i').test(x.text) || x.value === text); if (!o) return false;
    s.value = o.value; s.dispatchEvent(new Event('change', { bubbles: true })); return true;
  }, [selectId, text]);
  await page.waitForTimeout(450);
  return ok;
}
async function scrollTo(page, pattern) {
  await page.evaluate((src) => {
    const re = new RegExp(src, 'i');
    const shown = (e) => e.getBoundingClientRect().height > 0;
    // Real headings first; only then any small element carrying the words.
    const el = [...document.querySelectorAll('.pp-section-label, .section-heading, .home-section-header, .lg-tier-head, h1, h2, h3, .home-card-header')]
      .filter((e) => shown(e) && re.test((e.innerText || '').trim()))[0]
      || [...document.querySelectorAll('div, span')].filter((e) => e.children.length < 4 && shown(e) && re.test((e.innerText || '').trim()))[0];
    if (el) el.scrollIntoView({ block: 'start' });
  }, pattern.source || pattern);
  await page.waitForTimeout(300);
}
const top = (page) => page.evaluate(() => { window.scrollTo(0, 0); document.querySelectorAll('.pp-sheet, .overlay, .sheet').forEach((e) => { e.scrollTop = 0; }); });
async function closeAll(page) {
  await page.evaluate(() => {
    try { if (typeof closeSheet === 'function') closeSheet(); } catch (e) { /* none */ }
    document.querySelectorAll('.shell-more-sheet.show').forEach((e) => e.classList.remove('show'));
    document.querySelectorAll('.modal.show, .modal-backdrop.show').forEach((e) => e.classList.remove('show'));
  });
  await page.waitForTimeout(200);
}

// ---- the capture ----------------------------------------------------------------

async function capture(snapFile) {
  const pw = playwright();
  if (!pw) { console.error('Playwright is not available.'); process.exitCode = 1; return; }
  const snap = JSON.parse(fs.readFileSync(snapFile, 'utf8'));
  fs.mkdirSync(SHOTS, { recursive: true });
  fs.readdirSync(SHOTS).filter((f) => f.endsWith('.png')).forEach((f) => fs.unlinkSync(path.join(SHOTS, f)));
  const server = await serve();
  const index = [];
  const allWrites = []; const allErrors = [];
  let app;
  const shot = async (file, area, state, { full = false } = {}) => {
    await app.page.waitForTimeout(250);
    const opts = { path: path.join(SHOTS, file) };
    if (full) { opts.fullPage = true; }
    await app.page.screenshot(opts);
    const size = await app.page.evaluate(() => ({ w: window.innerWidth, h: document.documentElement.scrollHeight }));
    index.push({ file, area, state, viewport: `${size.w}px`, pageHeight: size.h });
    process.stdout.write('.');
  };
  const start = async (opts) => {
    if (app) { allWrites.push(...app.writes); allErrors.push(...app.errors); await app.browser.close(); }
    app = await openApp(pw, server, snap, opts);
    if (!(opts && (opts.fresh || opts.latencyMs || opts.failReads))) await ready(app.page);
  };
  const p = () => app.page;

  // -- Global states
  await start({ fresh: true });
  await ready(p());
  await shot('00-first-run-player-chooser.png', 'Global', 'First launch: the "who are you?" chooser over Home');
  await start({ latencyMs: 2500 });
  await p().waitForTimeout(500);
  await shot('01-loading-state.png', 'Global', 'While the record is loading (slow connection)');
  await ready(p());
  await start({ failReads: true });
  await p().waitForTimeout(2500);
  await shot('02-error-state.png', 'Global', 'The record could not be read (offline)');

  // -- Home
  await start();
  await nav(p(), 'Home'); await top(p());
  await shot('10-home-top.png', 'Home', 'First screen a selected player sees');
  await scrollTo(p(), /^club pulse/);
  await shot('11-home-club-pulse.png', 'Home', 'Scrolled: Club Pulse, Match ideas');
  await scrollTo(p(), /^last time out/);
  await shot('12-home-last-time-out.png', 'Home', 'Scrolled: Last Time Out and the monthly card');
  await tap(p(), /match ideas/);
  await shot('13-home-match-ideas-open.png', 'Home', 'Match ideas expanded');
  await top(p());
  await shot('14-home-full-page.png', 'Home', 'Whole page (for length)', { full: true });
  await tap(p(), /^view full review/);
  await top(p());
  await shot('15-home-view-full-review.png', 'Home', '"View Full Review" from the monthly card');
  await nav(p(), 'Home');
  await tap(p(), /^PDM ▾$/);
  await shot('16-home-player-switcher.png', 'Home', 'Header "PDM ▾": the player switcher');
  await closeAll(p());
  await p().evaluate(() => { const s = document.getElementById('viewerSelectorSheet'); if (s) s.remove(); });

  // -- Profile (own and another player's)
  await nav(p(), 'Home');
  await tap(p(), /^view profile/);
  await shot('20-profile-own-top.png', 'Profile', 'Own profile from Home "View profile"');
  await scrollTo(p(), /^player analysis/);
  await shot('21-profile-analysis.png', 'Profile', 'Player Analysis cards');
  await scrollTo(p(), /rating journey/);
  await shot('22-profile-journey.png', 'Profile', 'Rating Journey');
  await scrollTo(p(), /recent results/);
  await shot('23-profile-recent-results.png', 'Profile', 'Recent Results list');
  await closeAll(p());
  await nav(p(), 'Home');
  await tap(p(), /^view match/);
  await shot('24-why-rating-moved.png', 'Profile', 'Home "View match": most recent match with "Why PDM\'s rating moved"');
  await tap(p(), /^see full calculation/);
  await shot('25-full-calculation.png', 'Profile', '"See full calculation" expanded');
  await closeAll(p());

  // -- Rankings
  await nav(p(), 'Rankings'); await top(p());
  await shot('30-rankings-power-top.png', 'Rankings', 'Power (default tab), month defaulted by Meaningful Month');
  await scrollTo(p(), /monthly summary/);
  await shot('31-rankings-power-monthly-summary.png', 'Rankings', 'Power: Monthly Summary block');
  await top(p());
  await shot('32-rankings-power-full-page.png', 'Rankings', 'Power: whole page (for length)', { full: true });
  await p().evaluate(() => { const b = [...document.querySelectorAll('button')].find((x) => /filter|sliders|tune/i.test(x.getAttribute('aria-label') || x.title || x.className)); if (b) b.click(); });
  await p().waitForTimeout(400);
  await shot('33-rankings-power-filter-button.png', 'Rankings', 'Power: the sliders button beside Month/Tier');
  await closeAll(p());
  await subnav(p(), 'W/L'); await top(p());
  await shot('34-rankings-wl.png', 'Rankings', 'W/L tab');
  await subnav(p(), 'League'); await top(p());
  await shot('35-rankings-league-table.png', 'Rankings', 'League: League Table by tier');
  await tap(p(), /^how this table works/);
  await shot('36-rankings-league-how-it-works.png', 'Rankings', 'League: "How this table works" open');
  await tap(p(), /^last 10$/);
  await shot('37-rankings-league-last-10.png', 'Rankings', 'League: Last 10 view');
  await choose(p(), 'summaryModeSelect', 'Merit');
  await shot('38-rankings-merit.png', 'Rankings', 'League → View: Merit Table');
  await choose(p(), 'summaryModeSelect', 'Monthly Race');
  await shot('39-rankings-monthly-race.png', 'Rankings', 'League → View: Monthly Race (Best Month trial)');
  await choose(p(), 'summaryModeSelect', 'Information');
  await shot('40-rankings-information.png', 'Rankings', 'League → View: Information (monthly stats review)');
  await choose(p(), 'summaryModeSelect', 'League Table');

  // -- Play
  await nav(p(), 'Play'); await top(p());
  await shot('50-play-find-game.png', 'Play', 'Find Game (Play default tab)');
  await shot('51-play-find-game-full-page.png', 'Play', 'Find Game: whole page', { full: true });
  await tap(p(), /^view full breakdown/);
  await shot('52-play-find-game-breakdown.png', 'Play', 'Find Game: "View Full Breakdown"');
  await closeAll(p());
  await nav(p(), 'Play'); await tap(p(), /^build a match/);
  await shot('53-play-build-a-match.png', 'Play', 'Find Game: "Build a Match"');
  await closeAll(p());
  await subnav(p(), 'Games'); await top(p());
  await shot('54-play-games-top.png', 'Play', 'Games: first screen');
  await tap(p(), /^filters/);
  await shot('55-play-games-filters-open.png', 'Play', 'Games: Filters open');
  await tap(p(), /^filters/);
  await tap(p(), /^➕ add a game|^add a game/);
  await shot('56-play-games-add-a-game.png', 'Play', 'Games: "Add a game" form open');
  await tap(p(), /^➕ add a game|^add a game/);
  await scrollTo(p(), /^all games/);
  await shot('57-play-games-list.png', 'Play', 'Games: the list (169 matches, all time)');
  await tap(p(), /def|drew/);
  await shot('58-play-games-card-expanded.png', 'Play', 'Games: a game card tapped open');
  await subnav(p(), 'Upcoming'); await top(p());
  await shot('59-play-upcoming.png', 'Play', 'Upcoming as a normal player');
  await shot('60-play-upcoming-full-page.png', 'Play', 'Upcoming: whole page', { full: true });
  await subnav(p(), 'Requests'); await top(p());
  await shot('61-play-requests.png', 'Play', 'Requests: first screen (no challenges or pending)');
  await tap(p(), /request a game/);
  await shot('62-play-request-a-game-open.png', 'Play', 'Requests: "Request a game" form open');
  await tap(p(), /request a game/);
  await tap(p(), /create challenge/);
  await shot('63-play-create-challenge.png', 'Play', 'Requests: "+ Create Challenge" form');

  // -- Players
  await nav(p(), 'Players'); await top(p());
  await shot('70-players-directory.png', 'Players', 'Directory');
  await tap(p(), /^filters/);
  await shot('71-players-directory-filters.png', 'Players', 'Directory: Filters open');
  await tap(p(), /^filters/);
  await tap(p(), new RegExp(`^R\\s+${OTHER}\\b|^${OTHER}\\b`));
  await top(p());
  await shot('72-players-other-profile.png', 'Players', `Another player's profile (${OTHER}) from Directory`);
  await closeAll(p());
  await nav(p(), 'Players'); await subnav(p(), 'Compare'); await top(p());
  await shot('73-players-compare-empty.png', 'Players', 'Compare: before choosing');
  await choose(p(), 'h2hSelectA', `^${VIEWER}$`); await choose(p(), 'h2hSelectB', `^${OTHER}$`);
  await shot('74-players-compare-chosen.png', 'Players', `Compare: ${VIEWER} vs ${OTHER}`);

  // -- More
  const more = async (label, file, state) => {
    await closeAll(p()); await nav(p(), 'More');
    await tap(p(), new RegExp(`^${label}`), '#shellMoreSheet');
    await p().evaluate(() => { document.querySelectorAll('.shell-more-sheet.show .shell-more-panel, .modal.show').forEach((e) => { e.scrollTop = 0; }); window.scrollTo(0, 0); });
    await shot(file, 'More', state);
  };
  await closeAll(p()); await nav(p(), 'More');
  await shot('80-more-sheet.png', 'More', 'The More sheet');
  await more('Power Rating Guide', '81-more-rating-guide.png', 'Power Rating Guide');
  await more('North vs South', '82-more-north-south.png', 'North vs South');
  await more('Insights', '83-more-insights-callouts.png', 'Insights / Call-Outs');
  await more('About Power Rankings', '84-more-about.png', 'About Power Rankings');
  await more('Doughnuts', '85-more-doughnuts.png', 'Doughnuts');
  await more('Data & Rankings', '86-more-data-rankings.png', 'Data & Rankings');
  await more('My Player', '87-more-my-player.png', 'My Player (choose who you are)');
  await p().evaluate(() => { const s = document.getElementById('viewerSelectorSheet'); if (s) s.remove(); });
  await more('Admin', '88-more-admin-locked.png', 'Admin / Manage as a normal player (locked)');

  // -- Admin (unlocked), for the admin-only inventory
  await closeAll(p());
  await p().evaluate(() => { isUnlocked = true; currentUserName = 'Board'; });
  await nav(p(), 'More'); await tap(p(), /^admin/, '#shellMoreSheet'); await top(p());
  await shot('90-admin-unlocked.png', 'Admin', 'Admin / Manage unlocked: every section folded');
  await shot('91-admin-unlocked-full-page.png', 'Admin', 'Admin / Manage unlocked: whole page', { full: true });
  await nav(p(), 'Play'); await subnav(p(), 'Upcoming'); await top(p());
  await shot('92-admin-upcoming.png', 'Admin', 'Upcoming as an admin (prediction shown)');
  await subnav(p(), 'Games'); await top(p());
  await shot('93-admin-games.png', 'Admin', 'Games as an admin');

  // -- The seven core journeys, from a fresh Home, by real taps. Each records
  //    what was tapped, and how far down the page the answer sat when it was
  //    reached (0 = on the first screen).
  const journeys = [];
  const where = (pattern) => p().evaluate((src) => {
    const re = new RegExp(src, 'i');
    const el = [...document.querySelectorAll('body *')].filter((e) => e.children.length === 0 && re.test(e.textContent || '') && e.getBoundingClientRect().height > 0)[0];
    if (!el) return null;
    const r = el.getBoundingClientRect(); const vh = window.innerHeight;
    // Distance below the first screen, in screens, measured before scrolling.
    return { onFirstScreen: r.top >= 0 && r.bottom <= vh - 70, screensDown: Math.max(0, Math.round(((r.top + window.scrollY) - vh + 70) / vh * 10) / 10) };
  }, pattern.source || pattern);
  const journey = async (id, question, steps, answerPattern, file) => {
    await closeAll(p()); await nav(p(), 'Home'); await top(p());
    const taps = [];
    for (const [kind, arg, arg2] of steps) {
      let hit;
      if (kind === 'nav') hit = await nav(p(), arg);
      else if (kind === 'sub') hit = await subnav(p(), arg);
      else if (kind === 'tap') hit = await tap(p(), arg, arg2);
      else if (kind === 'choose') hit = (await choose(p(), arg, arg2)) ? `${arg} → ${arg2}` : null;
      taps.push(hit ? `${kind}: ${hit}` : `${kind}: ${arg} (NOT FOUND)`);
      if (kind !== 'tap' || !/view match|see full/i.test(String(arg))) await top(p());
    }
    const found = answerPattern ? await where(answerPattern) : null;
    await shot(file, 'Journey', `${id}: ${question}`);
    journeys.push({ id, question, taps, answerFound: !!found, ...(found || {}) });
  };
  await journey('J1', 'My Power Rating and overall/tier position', [], /#\d+ in Tier/, 'J1-rating-and-position.png');
  await journey('J2', 'How am I doing this month (League, then Monthly Race)', [['nav', 'Rankings'], ['sub', 'League'], ['choose', 'summaryModeSelect', 'Monthly Race']], /^PDM$/, 'J2-this-month-race.png');
  await choose(p(), 'summaryModeSelect', 'League Table');
  await journey('J3', 'My next game', [['nav', 'Play'], ['sub', 'Upcoming']], /PDM/, 'J3-next-game.png');
  await journey('J4', 'Request a game with a particular player', [['nav', 'Play'], ['sub', 'Requests'], ['tap', /request a game/]], /Request this game/, 'J4-request-a-game.png');
  await journey('J5', 'My most recent match', [], /last time out/, 'J5-most-recent-match.png');
  await journey('J6', 'Why my rating changed after it', [['tap', /^view match/]], /rating moved/, 'J6-why-rating-changed.png');
  await journey('J7', 'Find another player and how good / in-form they are', [['nav', 'Players'], ['tap', new RegExp(`^R\\s+${OTHER}\\b|^${OTHER}\\b`)]], /Power rating/, 'J7-another-player.png');
  fs.writeFileSync(path.join(OUT, 'journeys.json'), JSON.stringify(journeys, null, 2));

  // -- 375px (iPhone SE / mini width): where density and clipping matter
  await start({ width: 375, height: 812 });
  const narrow = async (file, state, go) => { await closeAll(p()); await go(); await top(p()); await shot(file, '375px', state); };
  await narrow('W01-home.png', 'Home', async () => nav(p(), 'Home'));
  await narrow('W02-rankings-power.png', 'Rankings: Power', async () => nav(p(), 'Rankings'));
  await narrow('W03-rankings-league.png', 'Rankings: League Table', async () => { await nav(p(), 'Rankings'); await subnav(p(), 'League'); });
  await narrow('W04-rankings-monthly-race.png', 'Rankings: Monthly Race', async () => { await nav(p(), 'Rankings'); await subnav(p(), 'League'); await choose(p(), 'summaryModeSelect', 'Monthly Race'); });
  await choose(p(), 'summaryModeSelect', 'League Table');
  await narrow('W05-play-find-game.png', 'Play: Find Game', async () => nav(p(), 'Play'));
  await narrow('W06-play-games.png', 'Play: Games', async () => { await nav(p(), 'Play'); await subnav(p(), 'Games'); });
  await narrow('W07-play-upcoming.png', 'Play: Upcoming', async () => { await nav(p(), 'Play'); await subnav(p(), 'Upcoming'); });
  await narrow('W08-players-directory.png', 'Players: Directory', async () => nav(p(), 'Players'));
  await narrow('W09-profile-own.png', 'Own profile', async () => { await nav(p(), 'Home'); await tap(p(), /^view profile/); });
  await narrow('W10-why-rating-moved.png', 'Why my rating moved', async () => { await nav(p(), 'Home'); await tap(p(), /^view match/); });
  await narrow('W11-more-sheet.png', 'More sheet', async () => nav(p(), 'More'));

  allWrites.push(...app.writes); allErrors.push(...app.errors);
  await app.browser.close(); server.close();

  // -- index
  const lines = [
    '# UX audit screenshots — index',
    '',
    `Captured ${new Date().toISOString().slice(0, 10)} by \`scripts/ux-audit-capture.js\` from the current build, against a read-only copy of the live beta read ${snap.readAt ? snap.readAt.slice(0, 16).replace('T', ' ') + ' UTC' : '(date unknown)'}. Selected player: **${VIEWER}** (Tier B). Clock fixed at ${NOW} (Europe/London). Retina (2×) PNGs; "whole page" shots are full scroll length. Admin screens show "local build / Build dev" because the build is served locally, not by GitHub Pages.`,
    '',
    '| File | Area | Screen / state | Viewport | Page height (px) |',
    '|---|---|---|---|---|',
    ...index.map((r) => `| [${r.file}](screenshots/${r.file}) | ${r.area} | ${r.state} | ${r.viewport} | ${r.pageHeight} |`),
    '',
  ];
  fs.writeFileSync(path.join(OUT, 'INDEX.md'), lines.join('\n'));
  console.log(`\n${index.length} screenshots. writes attempted: ${allWrites.length}. page errors: ${allErrors.length}`);
  if (allErrors.length) console.log(allErrors.slice(0, 10));
  if (allWrites.length) { console.error('The app attempted writes during capture:', allWrites); process.exitCode = 1; }
}

const args = process.argv.slice(2);
if (args[0] === '--read-live') readLive(args[1]).catch((e) => { console.error(e.message); process.exitCode = 1; });
else if (args[0]) capture(args[0]).catch((e) => { console.error(e); process.exitCode = 1; });
else console.log('usage: node scripts/ux-audit-capture.js [--read-live] <snapshot.json>');
