# Money Padel Prestige v3 — Project Ledger

The shared coordination layer between **Shaun** (product owner / final decision maker), **ChatGPT** (product architecture, coordination, decision synthesis), **Claude Chat** (technical/product review and challenge) and **Claude Code** (repository implementation and verification).

**Authority:** Shaun's explicit product decision → agreed architecture → repository + tests + `RATING_MODEL.md` for implementation truth → this Ledger for coordination state → individual AI chat memory.

**Shorthand:** `Ledger CCode` is a go command. `Ledger Sync` is read/reconcile only. `Ledger CChat` and `Ledger CGPT` address those agents.

---

## 1. CURRENT STATE

Baseline before the currently queued work: implementation commit `49af41b`, 395/395 tests (75 browser). Split-month League Table is complete: each match is allocated to the tier held on its match date; All together remains one whole-month row and shows transitions.

The current beta Players Directory remains visually older than the rest of the refreshed application: a large filter card followed by plain alphabetical rows with letter dividers, serif names, ACTIVE/INACTIVE pills and right-aligned `Tier · Rating` text. Shaun has requested that this now be brought into the current premium Money Padel visual language without losing the Directory's useful filtering/sorting.

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

### Tom + Fatch stale reassessment information — CCode must diagnose

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
| `49af41b` | Split-month League Table: match-date tier allocation, isolated tier-segment points/results, whole-month All together transition row |

---

## 8. NEXT

1. **Tom/Fatch integrity audit — approved/unblocked and highest priority.** Verify both corrected historical anchors = 1400 and Reliability = 20%; verify replay/current ratings; find why current information still references Jords. Cosmetic stale copy can be fixed directly with tests. Numerical inconsistency must be reported with blast radius before writing.
2. **Players Directory visual refresh — approved/unblocked.** Modernise the supplied Directory screen using established Money Padel components/tokens; compact filters; improve player-row hierarchy/tappability; reduce repetitive Active badges; preserve all behaviour.
3. **League Table mobile refinement — already approved/unblocked.** Collapsible explanation + collapsible tier breakdown + Last 10 form league table.
4. Add targeted browser/module regression tests for changed behaviours and update this Ledger with commit/test totals and findings.
5. No changes to Sequential-v1 methodology, tier-history semantics or Reliability rules except a separately authorised repair if the Tom/Fatch audit proves persisted numerical state is wrong.
