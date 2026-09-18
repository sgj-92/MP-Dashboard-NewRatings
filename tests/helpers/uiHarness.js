// ===================== UI HARNESS =====================
// Boots the real index.html in a real browser against a stubbed Firestore.
//
// Every UI defect found during the v3 integration -- historical tiers coming
// back undefined, expectations recomputed from today's ratings, a modal
// describing a solver that had been retired, approving a game making it vanish,
// a confirmed delete persisting an overlay and changing nothing -- was found by
// a person driving the browser. None of them could have been caught by the
// module tests, because every module was correct in isolation and the
// application wired them up wrongly. This is the layer that was missing.
//
// The stub is built from the same backfill the seed writes, so the fixture
// cannot drift from the real record and there is no data file to keep in step.
//
// It skips rather than fails when Playwright or a browser is unavailable: a
// suite that goes red on a machine without Chromium teaches people to ignore
// red.

const http = require('node:http');
const fs = require('node:fs');
const path = require('node:path');
const Store = require('../../assets/js/ratingStore.js');

const ROOT = path.join(__dirname, '..', '..');

const TYPES = {
  '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css',
  '.json': 'application/json', '.png': 'image/png', '.svg': 'image/svg+xml',
  '.ico': 'image/x-icon', '.webmanifest': 'application/manifest+json',
};

let playwright = null;
let playwrightChecked = false;
function getPlaywright() {
  if (!playwrightChecked) {
    playwrightChecked = true;
    for (const id of ['playwright', '/opt/node22/lib/node_modules/playwright']) {
      try { playwright = require(id); break; } catch (e) { /* try the next */ }
    }
  }
  return playwright;
}

function available() { return !!getPlaywright(); }

// The documents the seed would write. Same source as scripts/seed-beta.js, so
// the browser sees exactly what the beta holds.
let fixtureCache = null;
function fixture() {
  if (!fixtureCache) {
    const { buildBackfill } = require('../../scripts/seed-beta.js');
    const b = buildBackfill();
    const plan = Store.buildWritePlan({
      matches: b.matches, journey: b.replay.journey, state: b.replay.state, provenance: b.provenance,
    });
    fixtureCache = {
      players: plan[Store.COLLECTIONS.players],
      matches: plan[Store.COLLECTIONS.matches],
      ratingJourney: plan[Store.COLLECTIONS.journey],
    };
  }
  return fixtureCache;
}

function serve() {
  const server = http.createServer((req, res) => {
    const rel = decodeURIComponent(req.url.split('?')[0]).replace(/^\/+/, '') || 'index.html';
    const file = path.join(ROOT, rel);
    if (!file.startsWith(ROOT) || !fs.existsSync(file) || fs.statSync(file).isDirectory()) {
      res.writeHead(404); res.end('not found'); return;
    }
    res.writeHead(200, { 'Content-Type': TYPES[path.extname(file)] || 'application/octet-stream' });
    fs.createReadStream(file).pipe(res);
  });
  return new Promise((resolve) => server.listen(0, '127.0.0.1', () => resolve(server)));
}

// Opens the app, loaded and rendered, with a Firestore stub in place. Page
// errors are collected rather than swallowed: several of the defects this
// suite guards against would have thrown quietly in a real browser.
async function open(options = {}) {
  const pw = getPlaywright();
  if (!pw) throw new Error('Playwright is not available.');
  const server = await serve();
  const port = server.address().port;
  const browser = await pw.chromium.launch();
  const page = await browser.newPage({ viewport: { width: 430, height: 932 } });
  const pageErrors = [];
  page.on('pageerror', (e) => pageErrors.push(e.message));

  await page.addInitScript(({ data, failReads }) => {
    window.__writes = [];
    window.__data = data;
    const fail = () => { throw new Error('stubbed read failure'); };
    window.firebase = {
      initializeApp() {},
      firestore() {
        return {
          collection(name) {
            return {
              doc(id) {
                return {
                  async get() { const v = (data[name] || {})[id]; return { exists: !!v, data: () => v }; },
                  async set(v) { window.__writes.push({ collection: name, id, doc: v }); (data[name] = data[name] || {})[id] = v; },
                  async delete() { window.__writes.push({ collection: name, id, deleted: true }); delete (data[name] || {})[id]; },
                };
              },
              async get() {
                if (failReads) fail();
                return { docs: Object.values(data[name] || {}).map((v) => ({ data: () => v })) };
              },
            };
          },
        };
      },
    };
  }, {
    data: {
      players: Object.fromEntries(fixture().players.map((d) => [d.id, d])),
      matches: Object.fromEntries(fixture().matches.map((d) => [d.id, d])),
      ratingJourney: Object.fromEntries(fixture().ratingJourney.map((d) => [d.id, d])),
    },
    failReads: !!options.failReads,
  });

  await page.goto(`http://127.0.0.1:${port}/index.html`, { waitUntil: 'domcontentloaded' });
  await page.waitForFunction(
    () => typeof V3_STATE !== 'undefined' && (V3_STATE.loaded || V3_STATE.error),
    null, { timeout: 20000 });
  await page.waitForTimeout(400);

  // The first-run player chooser is modal and covers the app. It is a real
  // feature, not a bug; it just has nothing to do with what is under test.
  await page.evaluate(() => {
    const el = document.getElementById('viewerSelectorSheet');
    if (el) el.remove();
  });

  return {
    page,
    pageErrors,
    async close() { await browser.close(); server.close(); },
    // Runs in the page and returns plain data.
    run(fn, arg) { return page.evaluate(fn, arg); },
    text(html) { return String(html).replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim(); },
  };
}

module.exports = { open, available, fixture };
