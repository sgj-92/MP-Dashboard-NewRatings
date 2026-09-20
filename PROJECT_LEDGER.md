# Money Padel Prestige v3 — Project Ledger

The shared coordination layer between **Shaun** (product owner / final decision maker), **ChatGPT** (product architecture, coordination, decision synthesis), **Claude Chat** (technical/product review and challenge) and **Claude Code** (repository implementation and verification).

**Authority:** Shaun's explicit product decision → agreed architecture → repository + tests + `RATING_MODEL.md` for implementation truth → this Ledger for coordination state → individual AI chat memory.

**Shorthand:** `Ledger CCode` is a go command. `Ledger Sync` is read/reconcile only. `Ledger CChat` and `Ledger CGPT` address those agents.

---

## 1. CURRENT STATE

Baseline: implementation commit `43401f8`, **403/403 tests (81 browser)**. Split-month League Table is complete: each match is allocated to the tier held on its match date; All together remains one whole-month row and shows transitions.

**The Players Directory refresh is done (`43401f8`).** The filter card no longer takes half a phone before a player appears; Tier and Status fold behind a line that says what is on, sort stays out, tier chips wrap instead of clipping at 375px, and Active has stopped shouting on every row. Presentation only — every filter, sort, Compare and navigation behaviour is unchanged. Captured in `docs/screenshots/16-players-directory.png` and `16b-players-directory-filters.png`.

**Ledger history — preserved.** The rewrite on 20 Sep took this document from
3320 lines to 122, removing the Decisions Log, every Handoff, the Open Questions
and Recently Completed. The compact form is the live Ledger and CCode has not
touched it; but the deleted material included decisions still in force (the
read-strategy exception and its measurement, the parked rating-model backlog,
match sharing, the production import and the historical corrections), and it was
recoverable only from git. It is preserved verbatim in
[`LEDGER_ARCHIVE_2026-09-20.md`](./LEDGER_ARCHIVE_2026-09-20.md). **Shaun/CGPT:
say whether anything should be folded back.** Nothing in the archive is revoked
— it has only stopped being written down.

**Important rating audit:** Shaun reports that Tom and Fatch still have information somewhere in the application describing their historical reassessment as being to **Jords' level**. This is stale/superseded wording or potentially stale derived state and must be investigated, not papered over. The approved historical decision is: **Tom and Fatch each re-anchor to the standard Tier B baseline of 1400, with 20% reliability, not to Jords or another individual comparator.** CCode must verify persisted journey/decision data, current player ratings, rating journey/profile explanatory copy and any historical-reassessment UI before changing presentation. If the numerical replay is already correct and only copy/audit metadata is stale, fix the stale source. If numerical state still derives from the old comparator, stop and report the blast radius before writing a repair.

---

## 2. AGREED ARCHITECTURE

**Engine remains frozen (`sequential-v1`).** No visual task may alter rating methodology.

**Four separate concepts:** Power Rating · Reliability · Monthly Performance · Tier.

**League Table:** September split-month treatment remains authoritative. The queued Last 10 form table is a results table, not a new rating metric.

**Tom/Fatch historical correction:** their historical B reassessment anchor is the fixed Tier B baseline **1400**, not Jords' rating at that date and not Tom/Fatch-relative comparator logic. Reliability for those corrected decisions is **20%**. Downstream ratings must be whatever chronological Sequential-v1 replay produces from those corrected historical states.

---

## 3. DECISIONS LOG

| Decision | Note |
|---|---|
| League Table progressive disclosure + Last 10 | Explanation and tier breakdown collapsible; add per-player latest-up-to-10 rated-games league table using P/W/L/D/GD/Pts. |
| Players Directory visual refresh | Shaun, 20 Sep 2026. Bring Directory in line with the newer premium/private-club Money Padel UI. Preserve Directory/Compare, tier/status filters, A–Z/Power Rating sort, player navigation and active/inactive meaning. Reduce the feeling of a large settings/filter form followed by a plain database list. |
| Tom/Fatch must not reference Jords comparator | Shaun reconfirmed 20 Sep 2026 after seeing stale information. Both historical B anchors are 1400 baseline with 20% reliability. CCode must audit both displayed explanation and stored/replayed state rather than assuming this is cosmetic. |

---

## 4. PRODUCT / UI DIRECTION

### Players Directory refresh

The screenshot supplied by Shaun is the current-state reference. Keep functionality but visually modernise it to match Home, Rankings and the newer admin work.

- Preserve the top **Directory / Compare** segmented control.
- Keep Tier, Status and Sort controls, but make the filter area more compact and deliberate. It should not dominate the first viewport. Use the established dark surfaces, restrained gold, border radius, spacing and sans-serif utility typography already used elsewhere.
- Consider a compact filter/disclosure treatment for secondary filters on mobile rather than a permanently tall control panel. CCode should reuse existing design tokens/components and choose the simplest responsive implementation rather than creating a new design system.
- Player rows should feel tappable and profile-oriented rather than like admin records. Preserve clear player name, current tier, Power Rating and status where useful.
- Reduce visual noise from repeated ACTIVE pills. Active is the normal/default state and does not need to shout on every row; inactive must remain clearly identifiable. Do not remove status filtering.
- Keep alphabetical group markers when A–Z is selected if they genuinely improve scanning; when sorting by Power Rating, do not retain misleading alphabetical sectioning.
- The row hierarchy should prioritise **player identity first**, then concise tier/rating context, with a subtle affordance that the row opens the player's profile.
- Serif may remain for player identity if consistent with public-facing profile/ranking presentation; controls/metadata remain sans-serif. Avoid the Admin-style editable-record look here — this is a public-facing directory.
- Mobile-first, especially narrow iPhone widths. Avoid horizontal overflow and oversized controls.
- Preserve all existing filtering, sorting, Compare behaviour and profile navigation.

### League screen queued refinement

- Explanation beneath the League Table heading collapsible.
- By-tier table block collapsible.
- Dedicated Last 10 results table from each player's latest up-to-10 rated games overall.
- P/W/L/D/GD/Pts; 3 points win, 1 draw; real sample shown for players with fewer than 10.
- No rating-engine changes.

---

## 5. OPEN QUESTIONS / INVESTIGATION

### RESOLVED 20 Sep — Tom + Fatch stale reassessment information

**Audit complete (`838ca66`). The record is correct; the stale source was a
document, not the app. No numerical repair was needed, so there is no blast
radius to report.**

| Asked | Found |
|---|---|
| Stored anchor = 1400, Reliability = 20% | **Yes**, on the active event for each: `2026-07-01__Tom__CLUB_RATING_REASSESSMENT__r2` and `2026-08-01__Fatch__CLUB_RATING_REASSESSMENT__r2` |
| Replay / current state | **Replays to itself, 0 differences.** Tom **1387.8**, Fatch **1377.9** in `players` — what the corrected events produce |
| Comparator wording in the record | Only on events **marked superseded**, which is what makes the correction auditable |
| Any UI saying Jords | **None.** Every rendered surface was scanned against the live record |

`journeyView` already excludes superseded events, so their wording cannot reach
a player's Rating Journey, and the admin audit trail labels rows
Superseded/Active without showing their notes. Both are now pinned by tests.

**The stale source: [`HISTORICAL_REVIEW_DRYRUN.md`](./HISTORICAL_REVIEW_DRYRUN.md).**
It was headed *"APPLIED"* and presented *"Jords' rating immediately before the
review | 1352.5 | 10%"* as fact, with nothing to say it had been superseded two
days later. Anyone reading it reaches exactly the conclusion Shaun reported. It
now carries the correction at the top, with the old rows struck through and kept
as the record of what was decided then.

**A second hazard, found while looking:**
`scripts/apply-historical-decisions.js` would have **re-applied the superseded
comparator anchors** if run with `--write` — silently, because it plans against
whatever is in the record. It now refuses to write and says why. Its dry run
still works as the record of how the 18 September decisions were applied.

### Original investigation brief (kept)

#### Tom + Fatch stale reassessment information — CCode must diagnose

Shaun reports the app still says they were reassessed to Jords' level despite the superseding baseline decision. Before any repair:

1. Locate every persisted club-decision/ratingJourney event for Tom and Fatch around their historical reassessment dates.
2. Confirm the effective anchor stored/applied is exactly **1400** and Reliability **20%** for each corrected decision.
3. Replay/verify current state from those events and record Tom/Fatch current Power Rating against the persisted `players` state.
4. Search all UI explanation/copy generators, Rating Journey event descriptions, historical club-adjustment audit text, profile cards and any comparison/reference metadata for `Jords`, comparator labels, old target values or superseded event text.
5. Distinguish **superseded audit history** from **current explanation**. It is acceptable for an explicitly labelled superseded event to preserve what the old decision was; it is not acceptable for current state/explanation to imply Jords remains the active anchor.
6. If only text/metadata is stale, fix it and add regression coverage.
7. If the active numerical record still uses the Jords-derived anchor, do not silently patch it. Report exact affected event(s), current vs expected state and replay blast radius in this Ledger before a write.

Baton for this investigation is with CCode and it is approved/unblocked.

---

## 6. HANDOFFS

### CCode — 20 Sep 2026 (NEXT #2 Players Directory refresh complete)

`43401f8`. **403 / 403 tests (81 browser).** Every point in Section 4's
direction is implemented; nothing in the engine, the tier semantics or
Reliability was touched.

What the screen does now: secondary filters fold behind
*"Filters · All tiers, all players"*, so the first player sits near the top of
an iPhone SE instead of below 411px of controls. Sort stays visible — it is the
primary control, not a secondary one. Tier chips wrap; **Tier C was previously
clipped off the right edge at 375px and is reachable again.** A row leads with
the name in the public serif, with `Tier B · 1460` as quiet sans-serif metadata
beneath it and a chevron; Inactive is badged, active is not. Letter headings
appear only when sorted A–Z.

**One real defect found and fixed while testing, worth recording:** a player
name is free text and was being written into the page unescaped. A name
containing `<b>` rendered as `ac` — two characters of somebody's identity
silently lost, and an injection surface. `escapeAttr` is now `escapeHtml` and
covers the rendered text as well as the data attribute. No live player name is
affected today; this was caught by a test, not by a report.

**Method note for CGPT/CChat:** all six new browser tests were verified to fail
against the pre-change Directory before being accepted. Three of them failed on
their first run — two were my own bugs (the profile sheet's heading is
`#sheetName`, not `#sheetTitle`) and one was the escaping defect above. The
geometry test also had to learn that `goToSection` hides the shared Rankings
chrome on a `setTimeout(0)`, so measuring in the same synchronous turn measures
a screen no user ever sees.

**Next for CCode: NEXT #3, the League Table refinement** — approved and
unblocked, not started.

**Still waiting on Shaun/CGPT:** what, if anything, from
`LEDGER_ARCHIVE_2026-09-20.md` should be folded back into this Ledger
(Section 1). Nothing in it is revoked; it has only stopped being written down.

### CCode — 20 Sep 2026 (Tom/Fatch audit complete; NEXT 2 and 3 not started)

`838ca66`. **397 / 397 tests.** Full findings in Section 5 — the short version:
**the numbers were never wrong.** Both active events anchor to 1400 at 20%, the
record replays to itself, and nothing the app renders mentions an individual
comparator. What Shaun saw is real, but it is in `HISTORICAL_REVIEW_DRYRUN.md`,
which announced itself as *"APPLIED"* and still showed the Jords anchor as fact.
Corrected there, with the superseded rows kept and marked.

**Worth knowing:** `scripts/apply-historical-decisions.js` would have undone the
20 Sep correction if anyone had run it with `--write`. It refuses now.

**Ledger history is preserved** in `LEDGER_ARCHIVE_2026-09-20.md` — see Section
1. That needs a decision from Shaun/CGPT about what, if anything, returns.

**Not started, both approved and unblocked:** NEXT #2 (Players Directory visual
refresh) and NEXT #3 (League Table collapsibles + Last 10 form table). The audit
was flagged highest priority and is a natural stopping point; those two are
substantial UI pieces and each deserves its own pass.

### CGPT — 20 Sep 2026 (Players Directory + Tom/Fatch audit)

Shaun supplied the current Players Directory screenshot and requested a visual refresh consistent with the rest of Money Padel. Product direction is recorded above. This is a presentation refactor: preserve Directory/Compare, filters, sorting, status semantics and navigation.

Shaun also flagged that Tom/Fatch information still describes reassessment to Jords' level. This conflicts with the approved superseding historical decision. CCode must treat this as a **data/explanation integrity investigation first**, not simply replace a string. Verify stored event anchor = 1400 and reliability = 20%, verify replay/current rating, then locate stale UI/audit copy. Preserve explicitly-labelled superseded history but ensure current explanation is baseline-based. If numerical state is wrong, stop and report blast radius before repair.

**Baton → CCode. Approved and unblocked.**

### CGPT — 20 Sep 2026 (League Table refinement)

Approved: collapsible explanatory copy, collapsible tier breakdown, and dedicated Last 10 results league table. This remains queued and authorised.

### CCode — 20 Sep 2026 (split-month League Table complete)

Commit `49af41b`; 395/395 tests (75 browser).

---

## 7. RECENTLY COMPLETED

| Commit | Work |
|---|---|
| `43401f8` | Players Directory refresh: folded secondary filters with a state summary, wrapping tier chips, identity-first rows with a chevron, Inactive-only badging, A–Z-only letter headings; player names HTML-escaped where rendered |
| `838ca66`, `14d5a67` | Tom/Fatch integrity audit: record verified correct, stale source (`HISTORICAL_REVIEW_DRYRUN.md`) corrected, `apply-historical-decisions.js` made unable to undo it; Ledger history preserved in `LEDGER_ARCHIVE_2026-09-20.md` |
| `49af41b` | Split-month League Table: match-date tier allocation, isolated tier-segment points/results, whole-month All together transition row |

---

## 8. NEXT

1. **DONE (`838ca66`).** Tom/Fatch integrity audit. Anchors verified at 1400 / 20%, replay verified, no numerical repair needed. The stale source was `HISTORICAL_REVIEW_DRYRUN.md`, now corrected; `scripts/apply-historical-decisions.js` no longer able to undo the correction.
2. **DONE (`43401f8`).** Players Directory visual refresh. Compact folded filters with a state summary, wrapping tier chips, identity-first tappable rows, Inactive-only badging, A–Z-only letter headings. All behaviour preserved; six browser regression tests, each verified to fail against the old screen. Player names are now HTML-escaped where they render.
3. **League Table mobile refinement — approved/unblocked, and the next CCode task.** Collapsible explanation + collapsible tier breakdown + Last 10 form league table (P/W/L/D/GD/Pts, 3 pts a win / 1 a draw, real sample shown for players with fewer than 10 rated games). No rating-engine changes.
4. Add targeted browser/module regression tests for changed behaviours and update this Ledger with commit/test totals and findings.
5. No changes to Sequential-v1 methodology, tier-history semantics or Reliability rules except a separately authorised repair if the Tom/Fatch audit proves persisted numerical state is wrong.
