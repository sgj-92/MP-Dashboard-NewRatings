// ===================== PERF TRACE =====================
// Development instrumentation. Off unless somebody asks for it.
//
// The performance audit that produced this file had to be run from outside
// the app, against a stubbed Firestore, because the app itself could not say
// where its own two to four seconds went. That is the gap this closes: the
// same three questions the audit had to answer -- when did the data arrive,
// when was the screen actually drawn, and what did the derived calculations
// cost -- answered by the running app, on a real phone, against the real
// database, by whoever is looking at the slow screen.
//
// Turn it on with `?perf=1` in the URL, or once per device with
// `localStorage.moneypadel_perf = '1'`. Everything is then in `window.__perf`
// and `PerfTrace.report()` prints it.
//
// WHEN IT IS OFF IT MUST COST NOTHING. Not "almost nothing": these wrappers
// sit around recomputeAll and every screen render, so an always-on timer
// would be measuring the cost of measuring. `mark` becomes an empty function
// and `time` becomes a direct call, both decided once at load.

(function (root, factory) {
  const api = factory(typeof window !== 'undefined' ? window : null);
  if (typeof module === 'object' && module.exports) module.exports = api;
  else root.PerfTrace = api;
})(typeof globalThis !== 'undefined' ? globalThis : this, function (win) {
  'use strict';

  const now = () => ((typeof performance !== 'undefined' && performance.now) ? performance.now() : Date.now());

  function wanted() {
    if (!win) return false;
    try {
      if (win.location && /[?&]perf=1\b/.test(win.location.search)) return true;
      return win.localStorage && win.localStorage.getItem('moneypadel_perf') === '1';
    } catch (e) { return false; }   // private browsing, restricted storage
    }

  const enabled = wanted();
  const t0 = now();
  const entries = [];

  // A point in time: "the record arrived", "the screen was drawn".
  function mark(name, detail) {
    entries.push({ kind: 'mark', name, at: now() - t0, detail: detail || null });
  }

  // A span: how long something took, recorded even if it throws, because a
  // slow failure is exactly the case worth seeing.
  function time(name, fn) {
    const s = now();
    try { return fn(); }
    finally { entries.push({ kind: 'span', name, at: s - t0, ms: now() - s }); }
  }

  function timeAsync(name, promise) {
    const s = now();
    const done = () => entries.push({ kind: 'span', name, at: s - t0, ms: now() - s });
    return Promise.resolve(promise).then(
      (v) => { done(); return v; },
      (e) => { done(); throw e; });
  }

  // Spans of the same name collapsed: 58 calls costing 0.7ms together is a
  // different fact from one call costing 0.7ms, and only the total is worth
  // reading first.
  function summary() {
    const by = {};
    entries.forEach((e) => {
      if (e.kind !== 'span') return;
      const s = by[e.name] || (by[e.name] = { name: e.name, calls: 0, ms: 0, worst: 0 });
      s.calls++; s.ms += e.ms; s.worst = Math.max(s.worst, e.ms);
    });
    return Object.values(by).sort((a, b) => b.ms - a.ms);
  }

  function report() {
    if (!enabled) { console.log('PerfTrace is off. Add ?perf=1 to the URL.'); return entries; }
    console.log('--- marks ---');
    entries.filter((e) => e.kind === 'mark')
      .forEach((e) => console.log(e.at.toFixed(0).padStart(6) + 'ms', e.name, e.detail == null ? '' : JSON.stringify(e.detail)));
    console.log('--- time spent ---');
    summary().forEach((s) => console.log(s.ms.toFixed(1).padStart(8) + 'ms', String(s.calls).padStart(4) + 'x',
      s.name, s.calls > 1 ? '(worst ' + s.worst.toFixed(1) + 'ms)' : ''));
    return entries;
  }

  const off = {
    enabled: false,
    mark() {},
    time(name, fn) { return fn(); },
    timeAsync(name, promise) { return promise; },
    entries() { return []; },
    summary() { return []; },
    report,
  };

  if (!enabled) return off;

  if (win) win.__perf = entries;
  mark('perf trace on');
  return { enabled: true, mark, time, timeAsync, report, summary, entries: () => entries };
});
