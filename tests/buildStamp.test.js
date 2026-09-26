// ===================== BUILD STAMP =====================
// The bottom of More says which deployed build this device is running, so a
// phone that is still on an old cached app can be caught at a glance.
//
// Three things make it trustworthy, and the tests are about them:
//   - the SHA comes from the build itself (GitHub Pages' Jekyll run), never
//     from a hand-maintained constant and never from asking GitHub, which
//     only knows the newest build;
//   - the date is the build's date, never today's -- an old app opened
//     tomorrow must not claim tomorrow;
//   - anything that does not look like a real stamp reads as a local build,
//     rather than as a plausible wrong answer.

const test = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const H = require('./helpers/uiHarness.js');
const BuildStamp = require('../assets/js/buildStamp.js');

const maybe = H.available() ? test : test.skip;
const ROOT = path.join(__dirname, '..');
const read = (rel) => fs.readFileSync(path.join(ROOT, rel), 'utf8');

const SHA = 'a4c91e27d0b3f5e8c61a2d94b7e05f3c8a1d6e2b';
const stamped = (sha, date) => `window.MP_BUILD = { sha: "${sha}", date: "${date}" };\n`;

// --- what the stamp says ------------------------------------------------------

test('a deployed build reads as its date and its short SHA', () => {
  const b = BuildStamp.describe({ sha: SHA, date: '2026-09-26' });
  assert.strictEqual(b.title, 'Money Padel Beta · 26 Sep 2026');
  assert.strictEqual(b.build, 'Build a4c91e2');
  assert.strictEqual(b.copyText, 'Money Padel Beta · 2026-09-26 · a4c91e2');
  assert.strictEqual(b.deployed, true);
});

test('the short SHA is the first seven characters of the deployed commit', () => {
  assert.strictEqual(BuildStamp.shortSha(SHA), SHA.slice(0, 7));
  assert.strictEqual(BuildStamp.shortSha('6efc096'), '6efc096');
});

test('the local placeholder reads as a local build, not a deployed one', () => {
  const b = BuildStamp.describe({ sha: null, date: null });
  assert.strictEqual(b.deployed, false);
  assert.strictEqual(b.title, 'Money Padel Beta · local build');
  assert.strictEqual(b.build, 'Build dev');
  assert.strictEqual(BuildStamp.describe(undefined).build, 'Build dev', 'no stamp loaded at all');
});

test('a stamp that is not a real SHA is never shown as one', () => {
  for (const sha of ['{{ site.github.build_revision }}', '', 'main', 'xyz1234', '123456']) {
    assert.strictEqual(BuildStamp.describe({ sha, date: '2026-09-26' }).build, 'Build dev', JSON.stringify(sha));
  }
});

test('a missing or malformed date drops the date, never the build', () => {
  for (const date of [null, '', '{{ site.time }}', '2026-13-01', '26/09/2026']) {
    const b = BuildStamp.describe({ sha: SHA, date });
    assert.strictEqual(b.title, 'Money Padel Beta', JSON.stringify(date));
    assert.strictEqual(b.build, 'Build a4c91e2');
    assert.strictEqual(b.copyText, 'Money Padel Beta · a4c91e2');
  }
});

test('the date is read as a calendar date, so no time zone moves it', () => {
  assert.strictEqual(BuildStamp.describe({ sha: SHA, date: '2027-01-01' }).title, 'Money Padel Beta · 1 Jan 2027');
  assert.strictEqual(BuildStamp.describe({ sha: SHA, date: '2026-12-31' }).title, 'Money Padel Beta · 31 Dec 2026');
});

test('the stamp never consults the clock or the network', () => {
  const src = read('assets/js/buildStamp.js').replace(/\/\/.*$/gm, '');
  assert.doesNotMatch(src, /new Date|Date\.now|fetch\(|XMLHttpRequest|api\.github/);
});

// --- where the stamp comes from -----------------------------------------------

test('nobody maintains the SHA: the committed file is a placeholder', () => {
  const src = read('assets/js/buildInfo.js').replace(/\/\/.*$/gm, '');
  assert.match(src, /sha:\s*null/);
  assert.match(src, /date:\s*null/);
  assert.doesNotMatch(src, /[0-9a-f]{7,40}/i, 'no hand-written SHA');
});

test('the Pages build renders the template over the placeholder, and only there', () => {
  const tpl = read('assets/js/buildInfo.pages.js');
  const front = /^---\n([\s\S]*?)\n---\n/.exec(tpl);
  assert.ok(front, 'Jekyll only renders a file that starts with front matter');
  assert.match(front[1], /^permalink:\s*\/assets\/js\/buildInfo\.js\s*$/m);
  assert.match(tpl, /\{\{\s*site\.github\.build_revision\s*\}\}/, 'the SHA of the commit being built');
  assert.match(tpl, /\{\{\s*site\.time \| date: '%Y-%m-%d'\s*\}\}/, 'the time of the build');

  // The placeholder must be excluded, or Jekyll copies it over the stamp.
  const config = read('_config.yml');
  assert.match(config, /^exclude:\s*\n\s+-\s+assets\/js\/buildInfo\.js\s*$/m);
});

test('the rendered template is the script the app reads', () => {
  const tpl = read('assets/js/buildInfo.pages.js')
    .replace(/^---\n[\s\S]*?\n---\n/, '')
    .replace(/\{\{\s*site\.github\.build_revision\s*\}\}/, SHA)
    .replace(/\{\{\s*site\.time[^}]*\}\}/, '2026-09-26');
  const sandbox = { window: {} };
  vm.runInNewContext(tpl, sandbox);
  assert.deepStrictEqual({ ...sandbox.window.MP_BUILD }, { sha: SHA, date: '2026-09-26' });
});

test('the stamp loads with the app, before anything that shows it', () => {
  const html = read('index.html');
  const at = (f) => html.indexOf(`<script src="assets/js/${f}"></script>`);
  assert.ok(at('buildInfo.js') > 0 && at('buildStamp.js') > at('buildInfo.js'));
  assert.ok(at('shell.js') > at('buildStamp.js'));
  assert.strictEqual(html.indexOf('buildInfo.pages.js'), -1, 'the template is never loaded as-is');
});

// --- in the app ---------------------------------------------------------------

const readStamp = () => {
  const panel = document.querySelector('#shellMoreSheet .shell-more-panel');
  const el = document.getElementById('shellBuildStamp');
  const cs = getComputedStyle(el);
  return {
    lines: [...el.children].map((c) => c.textContent.trim()),
    isLast: panel.lastElementChild === el,
    afterAdmin: !!(panel.querySelector('.admin-item').compareDocumentPosition(el) & Node.DOCUMENT_POSITION_FOLLOWING),
    fontSize: parseFloat(cs.fontSize),
    border: cs.borderTopStyle,
    background: cs.backgroundColor,
  };
};

maybe('locally, the bottom of More says it is a local build', async () => {
  const app = await H.open();
  try {
    const r = await app.run(readStamp);
    assert.deepStrictEqual(r.lines, ['Money Padel Beta · local build', 'Build dev']);
    assert.deepStrictEqual(app.pageErrors, []);
  } finally { await app.close(); }
});

maybe('a deployed build shows its own date and SHA -- a week later, still its own date', async () => {
  const app = await H.open({
    files: { 'assets/js/buildInfo.js': stamped(SHA, '2026-09-26') },
    now: '2026-10-03T09:00:00',
  });
  try {
    const r = await app.run(readStamp);
    assert.deepStrictEqual(r.lines, ['Money Padel Beta · 26 Sep 2026', 'Build a4c91e2']);
    assert.ok(r.isLast, 'the very bottom of More');
    assert.ok(r.afterAdmin, 'below everything functional, Admin included');
    assert.ok(r.fontSize <= 11, `quiet text, got ${r.fontSize}px`);
    assert.strictEqual(r.border, 'none', 'not a card');
    assert.strictEqual(r.background, 'rgba(0, 0, 0, 0)', 'not a card');
    assert.deepStrictEqual(app.pageErrors, []);
  } finally { await app.close(); }
});

maybe('tapping the stamp copies a one-line version for a bug report', async () => {
  const app = await H.open({ files: { 'assets/js/buildInfo.js': stamped(SHA, '2026-09-26') } });
  try {
    await app.page.context().grantPermissions(['clipboard-read', 'clipboard-write']);
    await app.run(() => openMoreSheet());
    await app.page.click('#shellBuildStamp');
    await app.page.waitForFunction(() => document.getElementById('shellBuildStampSha').textContent === 'Copied');
    const copied = await app.run(() => navigator.clipboard.readText());
    assert.strictEqual(copied, 'Money Padel Beta · 2026-09-26 · a4c91e2');
    await app.page.waitForFunction(() => document.getElementById('shellBuildStampSha').textContent === 'Build a4c91e2',
      null, { timeout: 4000 });
    assert.deepStrictEqual(app.pageErrors, []);
  } finally { await app.close(); }
});
