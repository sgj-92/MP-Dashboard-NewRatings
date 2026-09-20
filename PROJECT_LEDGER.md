# Money Padel Prestige v3 — Project Ledger

The shared coordination layer between **Shaun** (product owner / final decision
maker), **ChatGPT** (product architecture, coordination, decision synthesis),
**Claude Chat** (technical/product review and challenge) and **Claude Code**
(repository implementation and verification).

Migrated 17 Sep 2026 from the Google Drive "AI Project Ledger", which is now
superseded: Claude Code can read that document but has no connector operation
to write to it, so every handoff needed manual pasting.

**Authority:** Shaun's explicit product decision → agreed architecture →
repository + tests + [`RATING_MODEL.md`](./RATING_MODEL.md) for implementation
truth → this Ledger for coordination state → individual AI chat memory.

If remembered context conflicts with this Ledger, **investigate — never
silently overwrite either version.**

**Shorthand** (full semantics in `CLAUDE.md`): `Ledger CCode` is a **go
command** — CCode reads, reconciles and starts the first approved, unblocked
item in NEXT without further authorisation. `Ledger Sync` is read/reconcile
only. `Ledger CChat` and `Ledger CGPT` address those agents. Shaun does not need
to type `WORK`, task numbers or commit references.

---

## 1. CURRENT STATE

The v3 engine, persistence layer, historical backfill and validation are
complete and verified. The first UI integration is done: the application's
rating chokepoint now reads v3 persisted state.

| | |
|---|---|
| Branch | `main` |
| Last verified implementation commit | `49af41b` |
| Tests | **395 / 395 passing** (75 of them drive a real browser) |
| Firestore (live, re-read 20 Sep, after Shaun's three reviews) | 155 matches · **672** journey events · 34 players — replays to itself, diagnostics 8/8 |
| Firestore (live, re-read 20 Sep) | 156 matches · 664 journey events · 34 players |
| **Live record status** | **REPAIRED 20 Sep — replays to itself (0 differences), diagnostics 8/8. Editing works again.** |
| Firebase (beta) | `mp-dashboard-beta-v3` |
| Firestore | 157 matches · 666 journey events · 34 players = **857 docs** |
| Last import | production match-facts export, 18 Sep — 7 new matches, verified (`PRODUCTION_IMPORT.md`) |
| Production | never touched; comparison is a dated static snapshot |

**Wired to v3:** `recomputeAll` hydrates `PLAYERS[]` from the compact `players`
collection, and the match history now comes from the v3 `matches` collection.
Rankings order, profiles, Home, matchups, partner/calibration suggestions,
promotion gaps, tier tables, head-to-head, partnerships and CSV exports all
inherit both. A player's record and the rating beside it derive from the same
150-match history: wins + losses + draws equals `lifetimeMatches` for all 34
players.

The player Rating Journey now replays persisted `ratingJourney` events. The
reconstruction (`computePlayerJourney`) and its "story estimate" disclaimer are
deleted, not merely unused: the journey's last point **is** the Power Rating for
all 34 players, so there is no second number to caveat. Per-match rating changes
on profile cards are the engine's own per-player deltas. Costs no extra read —
`V3_JOURNEY` is already in memory for the monthly views.

**No reconstructions remain.** Every rating, expectation, pre-match rating and
per-match movement shown anywhere in the application is read back from the
persisted journey via `matchFacts.js`. `computeElo` is kept per Shaun's decision
that the legacy solver stays available through the beta, but nothing calls it
and a test fails if anything does.

Kings of Tiers, the rankings podium and the tier filter now scope tier to the
selected month via a single `tierInScope()` helper. This uncovered a defect
underneath: `MONTHLY_VIEWS` was built with `TIER_MAP`, which is `{}` at that
point, so **every historical tier, within-tier rank and tier-change flag in the
shipped application was `undefined`** for all but the three players in the
authoritative change list. Fixed at source (v3's own tier map) and `TierHistory`
now refuses an empty map. See Handoffs.

**Diagnostics live.** `betaDiagnostics.js` reads the three collections directly
and checks that the record still hangs together — chain continuity, state vs
history, match/event coverage, orphans, duplicates, excluded data, and whether
what the app shows is what is stored. On demand, never at page load. It also
reports the Open Question 1a read-strategy measurement.

**Beta reset is a script, not a button:** `scripts/reset-beta.js`, dry run by
default, needs `--write --i-mean-it`, cannot be pointed at production, verifies
itself afterwards. Last dry run against the live beta: **0 documents outside the
baseline.**

**Write path live.** `clubDecision.js` is the only thing in the application that
writes a rating. The Admin Monthly Review is wired to it. Forward-only,
attributed, confirmed against the exact document before anything is stored, and
undone by recording a reversal rather than by deleting.

**Games can be recorded again.** Approving a submission now rates it: it joins
the v3 record via `replayForward.js`, the four players move, and the operator
sees exactly who moves before confirming. This was broken — see Open Question 13.

**Replay-forward exists** (`replayForward.js`): rebuilds the engine inputs from
the stored record, applies an append/edit/delete, replays, and writes only what
changed. Its precondition is that replaying with no change reproduces the
record.

**UI regression tests exist.** `tests/ui.test.js` boots the real `index.html` in a
real browser against a stub built from the same backfill the seed writes, and
covers the defects that actually shipped. They skip when Playwright is absent.

**`COMPARISON_REPORT.md`** is generated by `scripts/comparison-report.js`; a test
fails if the committed file drifts.

---

## 2. AGREED ARCHITECTURE

Full methodology and the experimental record live in [`RATING_MODEL.md`](./RATING_MODEL.md).

**Engine (frozen — `sequential-v1`).** Chronological sequential model. K declines 40 → 10 as reliability rises; `rc = 10`; reliability from effective evidence. Actual score = 80% game share + 20% match result; draw = 0.5; draws are rated. Weighted, deliberately not strict zero-sum. Pre-match expectations are persisted and never recomputed in the browser. Initial tier informs the starting level but does not permanently anchor it.

**Four separate concepts, never conflated:** Power Rating (current estimate) · Reliability (how established that estimate is) · Monthly Performance (versus pre-match expectation) · Tier (club classification). A tier change alone moves rating and reliability by exactly zero.

**Monthly story:** Monthly Performance, Rating Movement, Ranking Movement and League Table remain distinct. League Table is results/league points, not Power Rating. The September 2026 split-month treatment is implemented: tier tables allocate each match to the tier held on that match date, while All together remains one whole-month row.

---

## 3. DECISIONS LOG

The full historical Decisions Log remains authoritative in repository history through commit `49af41b`. New decision:

| Decision | Note |
|---|---|
| League Table gets progressive disclosure + Last 10 form table | Shaun, 20 Sep 2026. The explanatory copy under the month League Table heading should be hideable/collapsible; the By tier breakdown should also be collapsible to reduce vertical length on mobile. Add a dedicated league-table view based on each player's **most recent 10 rated games overall** so current form can be compared cleanly as a table rather than compressed into the existing `Form (10g)` column. This is a results/form view only — do not create a new rating calculation or alter Sequential-v1. |

---

## 4. PRODUCT / UI DIRECTION

Existing direction through `49af41b` remains unchanged. For the League screen specifically:

- Keep Month and View controls.
- Treat the prose immediately beneath `September 2026 League Table` as secondary information, with a compact disclosure/chevron so it can be hidden.
- Make the **By tier** breakdown collapsible as a whole; when collapsed, the long Tier S/A/B/C tables disappear without changing the selected By tier / All together mode.
- Mobile-first: the goal is to reach the actual table faster and avoid a very long rankings screen.
- Add a clean **Last 10** league-table mode/view. It is not scoped to the selected calendar month: for each player, take that player's latest 10 rated games available in the record.
- Last 10 should use league-table results semantics (P/W/L/D/GD/Pts; 3 win, 1 draw) and sort as a form table, with league points primary and the existing league-table tiebreak rules retained unless the implementation exposes a conflict that needs a product decision.
- A player with fewer than 10 rated games should still be representable honestly (show the actual P rather than fabricating ten games); CCode should preserve existing eligibility/status semantics and flag only if a product choice is genuinely required.
- Do not use the current `Form (10g)` percentage as a substitute for the new table. That compact column may remain on monthly tables, but the new view is the readable expanded form comparison.
- No rating-engine, Reliability, tier-history or stored match-fact changes.

---

## 5. OPEN QUESTIONS / DECISIONS

Rating-model backlog and match sharing remain parked and unauthorised as at `49af41b`. No new methodology question is opened by the Last 10 form table; it is a derived results table over existing rated matches.

---

## 6. HANDOFFS

### CGPT — 20 Sep 2026 (League Table progressive disclosure + Last 10 form table)

Shaun reviewed the September League Table on mobile after the split-month tier work landed.

Approved UI/product changes:

1. **League explanation collapsible.** Add a subtle disclosure/chevron around the explanatory copy directly below the `September 2026 League Table` heading. It must be possible to hide that copy so it does not permanently consume mobile space.
2. **By-tier breakdown collapsible.** The tier-table block can be collapsed/expanded as a whole. Preserve the existing `By tier` / `All together` selector and split-month allocation behaviour; collapsing is presentation state only.
3. **Last 10 form league.** Add a dedicated clean table built from each player's latest 10 rated games overall. This is deliberately different from Month = September: every player contributes their own most recent up-to-10 rated matches, irrespective of whether those ten occurred in the same dates/months as another player's.
4. Use normal league-table outcomes: P/W/L/D/GD/Pts, 3 points for a win and 1 for a draw. Keep the existing league sorting/tiebreak semantics unless implementation evidence shows they are unsuitable.
5. Players with fewer than 10 rated games show their actual sample (`P < 10`); do not pad or infer results.
6. This is **not** another Power Rating or Monthly Performance metric. Do not touch Sequential-v1, persisted expectations, rating deltas, Reliability or tier decisions.
7. Add targeted browser/module coverage for collapse state and for the Last 10 window (including a player with >10 games proving only their latest ten count, and a player with <10 proving the actual sample is shown).

**Baton → CCode. Approved and unblocked.**

### CCode — 20 Sep 2026 (split-month League Table complete)

Commit `49af41b`; 395/395 tests (75 browser). The League Table now splits a month by the tier in force on each match date; points never transfer between tiers; `All together` stays one row and shows the transition. This is the baseline for the refinement above.

---

## 7. RECENTLY COMPLETED

See repository history through `49af41b` for the full completed list. Latest completed item:

| Commit | Work |
|---|---|
| `49af41b` | Split-month League Table: match-date tier allocation, isolated tier-segment points/results, whole-month All together transition row |

---

## 8. NEXT

1. **League Table mobile refinement — approved and unblocked.**
2. Make the explanatory information beneath the selected month League Table heading collapsible/hideable with a compact disclosure control.
3. Make the By-tier tables collapsible as one breakdown while preserving the By tier / All together selector and current split-month logic.
4. Add a dedicated **Last 10** form league table based on each player's latest up-to-10 rated matches overall, not the selected calendar month.
5. Last 10 columns should present P/W/L/D/GD/Pts cleanly; use 3 points per win and 1 per draw and existing league tiebreak semantics.
6. Players with fewer than 10 rated games show their real P; never pad the sample.
7. Preserve the existing compact Form (10g) column on monthly tables unless there is a concrete layout reason to remove it; the new Last 10 table is the expanded comparison view.
8. Add targeted module/browser tests for both disclosures and the rolling per-player Last 10 selection/aggregation.
9. No Sequential-v1, rating, Reliability, historical-tier or persisted match changes.
10. Update this Ledger with commit/tests and baton back to CGPT/Shaun.
