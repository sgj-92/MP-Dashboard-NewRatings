// ===================== PLAYER NAMES =====================
// A player's name is a label. It should not also be their identity.
//
// Today it is both. `players/{playerId}` uses the name as the document id, and
// every ratingJourney event id has the name inside it
// (`2026-07-01__Tom__CLUB_RATING_REASSESSMENT`). Renaming Rishi by rewriting
// the record would mean deleting and recreating 156 documents — a migration
// with a recovery procedure attached, run every time somebody wants a
// different spelling.
//
// So the identity is frozen and the label is set free. `playerId` keeps
// whatever value it has today, for ever; a rename writes ONE new field,
// `displayName`, on ONE document. No match is touched, no journey event is
// touched, no document id changes, and nothing is deleted. Rename Shaun to
// Shaun J and back again fifty times and the record is byte-identical
// throughout — which is what "no consequences" has to mean if it is to mean
// anything.
//
// The cost is a translation at the edges, and this module is it:
//
//   RECORD  ──toDisplay──▶  the app and the screen   (ids  → labels)
//   RECORD  ◀──toId───────  submissions and decisions (labels → ids)
//
// Inside those edges the application goes on working entirely in labels, which
// is what all 350 of its rendering sites and all 34 of its `PLAYERS.find`
// lookups already do. Outside them the record goes on working entirely in ids,
// which is what the engine, the replay verifier and the diagnostics already do.
// Neither side has to learn about the other.
//
// The one rule that matters: **anything that will be written to the record
// must be converted back with `toId` first.** A display name written into a
// match or a journey event is a new player as far as the engine is concerned.

(function (root, factory) {
  const api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  else root.PlayerNames = api;
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  'use strict';

  // The field added to a player document. Absent means "never renamed", which
  // is every player until somebody renames one -- so no migration is needed to
  // adopt this, and a record written before it reads correctly after it.
  const FIELD = 'displayName';

  // What a player document should be called on screen.
  function displayFor(doc) {
    if (!doc) return null;
    const d = doc[FIELD];
    return (typeof d === 'string' && d.trim()) ? d.trim() : doc.id;
  }

  // { playerId -> display } and its inverse, built once per load.
  function buildAlias(playerDocs) {
    const toDisplay = {};
    const toId = {};
    (playerDocs || []).forEach((doc) => {
      if (!doc || !doc.id) return;
      const shown = displayFor(doc);
      toDisplay[doc.id] = shown;
      toId[shown] = doc.id;
    });
    return { toDisplay, toId };
  }

  // Both directions fall back to the value they were given. A name that is not
  // in the map is almost always a player who already has no alias, and passing
  // it through unchanged is exactly right for them. It also means every call
  // site is safe before a single rename exists.
  function toDisplay(alias, id) {
    if (!alias || !alias.toDisplay) return id;
    return Object.prototype.hasOwnProperty.call(alias.toDisplay, id) ? alias.toDisplay[id] : id;
  }

  function toId(alias, display) {
    if (!alias || !alias.toId) return display;
    return Object.prototype.hasOwnProperty.call(alias.toId, display) ? alias.toId[display] : display;
  }

  const mapTeam = (alias, names) => (names || []).map((n) => toDisplay(alias, n));
  const unmapTeam = (alias, names) => (names || []).map((n) => toId(alias, n));

  // Is this a name the club can actually use?
  //
  // `playerId` is the player being renamed, by their frozen id. `docs` is every
  // player document, which is what makes a collision detectable -- the check has
  // to look at both what players are CALLED and what they are KEYED BY, because
  // a new label that collides with somebody else's id would make a submission
  // typed by hand ambiguous.
  function validate(proposed, { playerId, docs }) {
    const name = typeof proposed === 'string' ? proposed.trim() : '';
    if (!name) return { ok: false, reason: 'A name cannot be blank.' };

    // Firestore ids are not being changed by a rename, but a display name that
    // could never BE an id is a trap waiting for whoever later decides to
    // migrate. Rejected up front rather than discovered then.
    if (name.includes('/')) return { ok: false, reason: 'A name cannot contain a slash.' };
    if (name === '.' || name === '..') return { ok: false, reason: 'That is not a usable name.' };

    const all = docs || [];
    const self = all.find((d) => d.id === playerId);
    if (!self) return { ok: false, reason: 'That player is not in the record.' };

    const lower = name.toLowerCase();
    const clash = all.find((d) => {
      if (d.id === playerId) return false;
      return d.id.toLowerCase() === lower || String(displayFor(d)).toLowerCase() === lower;
    });
    if (clash) {
      return { ok: false, reason: `${displayFor(clash)} already uses that name.` };
    }

    if (name === displayFor(self)) return { ok: false, reason: 'That is already their name.' };
    return { ok: true, name, from: displayFor(self), playerId };
  }

  // The whole of a rename: one field, on one document. Returned rather than
  // written, so the caller can show it before committing it.
  function planRename(proposed, { playerId, docs }) {
    const check = validate(proposed, { playerId, docs });
    if (!check.ok) return check;
    const self = (docs || []).find((d) => d.id === playerId);
    return {
      ok: true,
      playerId,
      from: check.from,
      to: check.name,
      // The previous label is kept so the change is auditable, and so a
      // profile can still say what somebody used to be called.
      update: {
        [FIELD]: check.name,
        previousDisplayNames: (self.previousDisplayNames || []).concat([check.from]),
      },
      // Stated so a caller cannot quietly assume otherwise.
      documentsWritten: 1,
      recordUnchanged: true,
    };
  }

  return { FIELD, displayFor, buildAlias, toDisplay, toId, mapTeam, unmapTeam, validate, planRename };
});
