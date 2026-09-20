// ===================== HEALTH REPORT =====================
// What to record when the app notices that the stored ratings and the stored
// history no longer agree, and what to say about it to whom.
//
// The record is forward-only and every rating in it is derived by replaying the
// stored matches in order. If a replay is ever left half-written -- a phone
// locked part-way through, a connection dropped, a tab closed -- the matches
// stay intact but the derived documents do not, and the app then refuses every
// further edit. That refusal is correct and it is also silent: it says nothing
// to anyone who is not trying to edit at that moment, and nothing is kept.
//
// So: notice it, write it down once, and say the right amount to each reader.
//
// TWO READERS, DELIBERATELY. The board holds an admin password of its own. A
// board member who meets a wall of document ids learns nothing they can act on
// and may well try to "fix" it. They are told the record needs repair and that
// editing is paused. The owner is told what actually diverged.
//
// This module decides nothing about repairing. It describes.

(function (root, factory) {
  const api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  else root.HealthReport = api;
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  'use strict';

  const COLLECTION = 'healthReports';
  const KIND = 'REPLAY_DIVERGENCE';

  // One report per distinct divergence, not one per time anybody opens the app.
  // The signature is built from what actually differs -- the collections
  // involved and the ids themselves -- so the same half-written replay found by
  // four people on four phones updates one document, while a genuinely
  // different divergence gets its own.
  //
  // `differences` is capped by verifyNoOp, so the signature is derived from what
  // it reports plus the true total: two divergences sharing a first forty and
  // differing in size are not the same divergence.
  function signatureOf(check) {
    if (!check || !check.count) return null;
    const ids = (check.differences || []).slice().sort().join('|');
    return KIND + '__' + check.count + '__' + shortHash(ids);
  }

  // Small, stable, and not pretending to be a cryptographic hash: it only has
  // to separate one divergence from another in a collection nobody queries by
  // content.
  function shortHash(text) {
    let h = 5381;
    for (let i = 0; i < text.length; i++) h = ((h * 33) ^ text.charCodeAt(i)) >>> 0;
    return h.toString(36);
  }

  // What is written down. Counts and dates rather than the full document list:
  // enough to recognise the same problem again and to size it, and it is
  // reproducible from the record itself by anyone who needs the detail.
  function buildReport({ check, repair, record, seenBy, now }) {
    const signature = signatureOf(check);
    if (!signature) return null;
    const at = now || new Date().toISOString();
    const writes = (repair && repair.writes) || {};
    const journeyDocs = writes.ratingJourney || [];
    const dates = journeyDocs.map((d) => d.effectiveDate).filter(Boolean).sort();

    return {
      id: signature,
      kind: KIND,
      status: 'OPEN',
      firstSeenAt: at,
      lastSeenAt: at,
      seenCount: 1,
      // Who had the app open. Not blame -- it is the only way to know whether
      // this was found once or is being met by everybody.
      seenBy: seenBy ? [seenBy] : [],
      differenceCount: check.count,
      documentsToRepair: repair ? repair.documentsToWrite : null,
      wouldDelete: repair ? repair.wouldDelete.length : null,
      playersAffected: repair ? repair.playersMoved.length : null,
      staleByCollection: (repair && repair.staleByCollection) || {},
      earliestAffectedDate: dates.length ? dates[0] : null,
      latestAffectedDate: dates.length ? dates[dates.length - 1] : null,
      recordSize: record
        ? { matches: (record.matches || []).length, journey: (record.journey || []).length, players: (record.players || []).length }
        : null,
      sampleDifferences: (check.differences || []).slice(0, 10),
    };
  }

  // Seeing the same divergence again is not a new report. The first sighting is
  // what dates it; later ones only say it is still there and who else met it.
  function merge(existing, fresh) {
    if (!existing) return fresh;
    const seenBy = (existing.seenBy || []).slice();
    (fresh.seenBy || []).forEach((n) => { if (n && seenBy.indexOf(n) === -1) seenBy.push(n); });
    return {
      ...existing,
      ...fresh,
      firstSeenAt: existing.firstSeenAt || fresh.firstSeenAt,
      seenCount: (existing.seenCount || 0) + 1,
      seenBy: seenBy.slice(0, 20),
      // A report that was closed and is seen again is open again. It was not
      // fixed, whatever anybody recorded.
      status: 'OPEN',
    };
  }

  function resolved(existing, at) {
    return { ...existing, status: 'RESOLVED', resolvedAt: at || new Date().toISOString() };
  }

  // What the person in front of the app is told. `owner` gets the shape of the
  // problem; anybody else gets the one thing that concerns them, which is that
  // editing is paused and it is not their doing.
  function messageFor(report, { owner } = {}) {
    if (!report) return '';
    const ref = report.id;
    if (!owner) {
      return 'The record needs repair, so editing is paused. This has been logged'
        + (ref ? ` (${ref})` : '') + ' and nothing you did caused it. Nothing has been lost.';
    }
    const where = Object.entries(report.staleByCollection || {})
      .filter(([, n]) => n)
      .map(([c, n]) => `${n} in ${c}`)
      .join(', ');
    const span = report.earliestAffectedDate
      ? ` Affected dates ${report.earliestAffectedDate} to ${report.latestAffectedDate}.`
      : '';
    return `The stored ratings and the stored history disagree in ${report.differenceCount} place(s)`
      + (where ? ` (${where})` : '') + '.'
      + span
      + ` ${report.documentsToRepair} document(s) would be rewritten and ${report.playersAffected} player(s)`
      + ' would end on a different rating. No match is affected. Editing is paused until it is repaired.';
  }

  return { COLLECTION, KIND, signatureOf, buildReport, merge, resolved, messageFor, shortHash };
});
