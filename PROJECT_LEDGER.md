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
| Last verified implementation commit | `8600f1e` |
| Tests | **270 / 270 passing** (36 of them drive a real browser) |
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

**Not built:** the editing UI on top of replay-forward (the engine capability is
there; exposing it is a product step) · screenshots.

---

## 2. AGREED ARCHITECTURE

Full methodology and the experimental record live in
[`RATING_MODEL.md`](./RATING_MODEL.md) — not duplicated here.

**Engine (frozen — `sequential-v1`).** Chronological sequential model. K
declines 40 → 10 as reliability rises; `rc = 10`; reliability from effective
evidence. Actual score = 80% game share + 20% match result; draw = 0.5; draws
are rated. Weighted, deliberately not strict zero-sum. Pre-match expectations
are persisted and never recomputed in the browser. Initial tier informs the
starting level but does not permanently anchor it.

**Four separate concepts, never conflated:** Power Rating (current estimate) ·
Reliability (how established that estimate is) · Monthly Performance (versus
pre-match expectation) · Tier (club classification). A tier change alone moves
rating and reliability by exactly zero.

**Reliability bands (UI labels, derived from percentage, never match count):**
`<25%` Provisional · `25–49%` Developing · `50–74%` Established · `75%+` High
Reliability. Always shown with the actual percentage.

**Monthly Performance:** mean of (blended actual − persisted pre-match
expectation). 1–2 matches provisional · 3+ table and Kings eligible · 5+ podium.
Kings of Tiers require a positive result and use the historical tier of the
month. Eligibility is match-count based — a different concept from the bands.

**Monthly story retains rating progress as a separate concept.** Retiring the
legacy `computeMonthlyRating` means retiring a separately solved monthly rating,
not hiding how the real Power Rating changed during a month. The monthly UI
should expose four distinct views without conflating them:

- **Monthly Performance:** who most exceeded pre-match expectation.
- **Rating Movement:** each player's real Sequential-v1 Power Rating at the
  start of the month → end of the month, with points gained/lost.
- **Ranking Movement:** overall and within-tier rank at month start → month end,
  including meaningful player crossovers where practical.
- **League Table:** results/league points accumulated during the month.

Rating Movement and Ranking Movement must be derived from the actual
chronological Sequential-v1 rating state, not from a new monthly solver.
Monthly Performance remains the basis for the monthly performance podium and
Kings of Tiers; rating/rank movement is complementary context, not an award
substitute.

**Read strategy:** normal current-state rendering reads the compact `players`
collection. This constraint does **not** prohibit targeted historical reads.
Monthly Performance, Rating Movement, Ranking Movement and the real Rating
Journey may query `ratingJourney` when historical event state is intrinsically
required. Use bounded/filtered reads (for example by month and/or player)
where they suffice; ordinary current-state page rendering must not scan the
whole journey. Use month-filtered queries and the required Firestore index on
`effectiveDate` where appropriate.

**Narrow exception — Ranking Movement (Open Question 1a resolved):** accept the
current once-per-session cumulative `ratingJourney` read, cached for the session,
while the journey remains small (633 events at the last verification). All-player
rank at a historical boundary requires prior state for inactive players, which
a month-only query cannot supply. This exception does not replace `players` as
the normal current-state source or permit whole-journey reads per render.
Retain Ranking Movement; do **not** add a snapshot collection yet.

**Future review trigger:** Claude Code must reopen this read-strategy decision
when journey growth makes a single session load material in document reads,
read cost, or observed load latency, or when an import/backfill is expected to
do so. Record event count, reads/cost per session and observed load latency in
the Ledger at that review, and propose a scalable historical-boundary strategy
(including snapshots if justified) before expanding reliance on cumulative
reads. This is a temporary small-journey allowance, not permanent architecture;
the review trigger is not a blocker for the current monthly UI pass.

**Club reassessment:** forward-only and audited in normal operation. Two
modes — recommended statistical reassessment, and explicit club override of
rating *and* reliability. Promotion/demotion and rating reassessment are
separate events. A missing statistical recommendation is **not** itself a club
decision to keep the current rating; it means the board must explicitly choose
keep-current or an override.

**Historical Club Adjustment:** Admin-only escape hatch for factual corrections,
late-entered board decisions and repair of bugs/errors. It is distinct from
Historical Match Correction. The Admin selects player + effective review date,
the app reconstructs the state immediately before that date, presents the same
reassessment choices used prospectively, requires attribution/reason, previews
the replay blast radius, and only then commits through replay-forward. Never
silently mutates or deletes an old decision: corrections are represented by a
new/superseding audited event and the downstream record is replayed.

**Storage:** `matches/{matchId}` · `ratingJourney/{eventId}` · `players/{playerId}`.
Normal current-state rendering reads `players`; historical views use targeted
`ratingJourney` reads, with only the session-cached Ranking Movement exception
and future review trigger defined above.

**Three corrections found in implementation, documented in `RATING_MODEL.md`
and authoritative over older instructions:** Fatch seeded Tier C in *both*
validation stages · the T2 pool rule (subject counts in the tier being joined;
linear-interpolation quartiles) · the stale dataset-end B→A row.

---

## 3. DECISIONS LOG

Shaun's decisions, including where an agent recommended otherwise.

| Decision | Note |
|---|---|
| Keep the legacy solver available during beta | **Shaun overruled Claude Code**, which recommended retiring it from the runtime because the beta's inputs differ from production's. Retained, but it no longer feeds the UI and must never be labelled "Production". |
| Production comparison uses a dated static snapshot | Chosen over the beta's locally recomputed value, which is a third, different number. |
| Beta Firestore: permanent open read/write, no auth | Deliberate and not a temporary state — there is no auth layer to make stricter rules meaningful yet. |
| April/May block is display-only, structurally enforced | Visible via the Data Range toggle; incapable of entering any calculation. Six players appear only there and correctly hold no rating. |
| Proper Firestore collections, not blob documents | Config blobs stay as they are. |
| Admin password claim window left open | Shaun will set it himself through the normal first-run screen. |
| Reassessment α ships at 0.25 | Below the best-performing 0.50, pending real reviews. |
| Coordination moves from Google Drive to this file | Claude Code could read the Drive doc but not write to it. |
| Engine is frozen | A surprising-looking rating is not a bug. Report suspected defects; do not adjust. |
| Monthly Rating is replaced, not monthly rating progress | Monthly Performance becomes the performance metric, while real Power Rating movement, rank movement/crossovers and League Table remain visible as separate monthly stories. No new monthly rating solver. |
| Historical reassessments must record factual club decisions, not hindsight | Shaun: 1 Jul 2026 was an **INITIAL_CLASSIFICATION_CORRECTION**, because he entered C only as an unknown and the club then determined the initial estimate was wrong. The club's factual assessment was **normal B baseline = 1400**. Tom (1 Jul 2026 C→B) and Fatch (1 Aug 2026 C→B) were genuine promotions/development and should receive the same **statistical reassessment process** used for future promotions, not an automatic B re-seed. |
| Historical Club Adjustment is a permanent Admin safety tool, not a one-off script | Build a narrow Admin UI over replay-forward for factual historical club-rating decisions/corrections. Separate it from Historical Match Correction. Require player, effective date, reason/attribution, old state, chosen decision, and replay blast-radius confirmation. Use a superseding/correction event rather than silent deletion. |
| No statistical recommendation ≠ keep-current | The dry run found Tom/Fatch had too few established C players for the T2 method to recommend a target. That does **not** mean the historical club decision was keep-current; it means the board must choose keep-current or a club override, exactly as it would prospectively. |
| Historical override anchors for Shaun, Tom and Fatch are fixed | **Shaun, 1 Jul:** 1400. **Tom, 1 Jul:** club override to **Jords' Power Rating immediately before the 1 Jul review**. **Fatch, 1 Aug:** club override to **Tom's Power Rating immediately before the 1 Aug review**, after Tom's corrected 1 Jul state and July matches have played out. These are factual club-assessment anchors, not statistical recommendations. |
| Historical reassessment reliability = 10% | Shaun, Tom and Fatch all reset/reopen to **10% reliability** at their historical adjustment date so the model can move them quickly in the newly assessed tier/state. This is an explicit board decision, not a statistical recommendation. |
| Every future tier change requires an explicit rating decision in the same monthly review | Promotion/demotion does not itself move Power Rating, but the review cannot be completed until the board explicitly chooses **Accept recommendation / Club override / Keep current rating**. **Correct initial classification** is a distinct option for a genuinely wrong initial estimate. This prevents today's promotions becoming next week's backdating problem. |
| Same-review recommendations use one shared pre-review snapshot | If multiple players are reviewed on the same effective date, calculate all statistical recommendations from the same pre-review state so one player's accepted decision cannot alter another player's recommendation merely because of processing order. Apply confirmed events afterwards in deterministic order. |
| Historical monthly reads use filtered `ratingJourney` queries where sufficient | The `players`-first rule applies to current-state rendering, not to historical data that `players` cannot contain. Bounded month/player queries remain the default, subject only to the Ranking Movement exception below. No monthly snapshot collection for now. |
| Accept session-cached cumulative reads for Ranking Movement while the journey is small | Shaun/CGPT, 17 Sep 2026: resolve Open Question 1a by accepting the current once-per-session cumulative `ratingJourney` read, cached for the session. Historical all-player ranks need prior state for inactive players. Keep Ranking Movement; no snapshot collection yet. Reopen when journey size, read cost or latency becomes material, including anticipated import/backfill growth; see Section 2. |
| CGPT visual acceptance withheld pending presentation fixes | 18 Sep 2026 screenshot review: core architecture and premium visual direction accepted, but final beta sign-off waits on terminology, score-orientation, reliability visibility, Admin action-state, audit readability, correction/removal wording, monthly hierarchy and contrast fixes. No rating-model changes authorised. |
| CGPT product/UX acceptance requirements satisfied | 18 Sep 2026 after `e0fdcbc`: all eight requested presentation fixes are implemented and regression-tested (242/242; 21 browser). The date-edit refusal and non-duplicative Key takeaways are approved departures from the mockup. Final pixel-level look check remains with Shaun/on-device because CGPT cannot render private-repo PNG pixels directly from the GitHub connector. |
| Add player-facing Power Rating Guide in More | Players need both a short explanation and a detailed methodology view so small/unequal rating movements are understandable and defensible. The guide must explain expectation vs actual performance, reliability/K, why wins can move little, why losses can still gain rating, why partners move by different amounts, why reassessed/new players move faster, why club decisions are separate, and that ratings never reset monthly. Do **not** change Sequential-v1 merely because movements look small. |
| Historical correction controls are admin-on-demand | The Play history must remain a player-facing results surface. `Correct match`, `Remove and replay`, and replay-warning copy must not render permanently on every game card. Hide them entirely for non-admin users; for admin, expose a compact per-card `…` / `Manage` control that reveals the maintenance actions only on demand. |
| Player-facing rating explanations use match/game language first | Replace exposed `Performance score 0.xx against 0.xx expected` wording in normal player-facing UI with plain language: whether the team were favourites/underdogs/evenly matched, the approximate percentage of games they were expected to win, the percentage they actually won, the match result, whether they outperformed/met/underperformed expectation, and the resulting rating movement. Keep exact blended performance score, K and reliability only behind `See full calculation` / technical disclosure. Do not imply the model is games-share only: match result still contributes 20%. |
| Games tab defaults to All time | Shaun explicitly confirmed the Games view should open on `All time`. This is intentionally different from other monthly views. Users may still select a specific month manually. |
| Refinement phase: wording only; methodology questions parked | For the current refinement phase, do **not** change Sequential-v1. Fix the player-facing explanation so it accurately separates game-share expectation from the separate 20% match-result component. The broader questions about responsiveness, reliability/K and expectation symmetry are recorded in the backlog for a later evidence-led model review. |
| Ranking state terminology: Ranked / Idle / Inactive | Separate ranking eligibility from participation status. **Ranked** = active and currently meets the live-ranking rule. **Idle** = still part of Money Padel but currently below the recent-match threshold, so not shown in the live ranking. **Inactive** = explicitly not currently involved/participating. Idle is derived from recent activity; Inactive is an explicit club/player-status field. |
| Ranking eligibility must be shared across Home/Rankings/Profile/Club Pulse | Shaun spotted Ant Slice showing `#–` on Home despite recent activity. All surfaces must derive Ranked vs Idle from one shared eligibility helper over the same v3 rated-match source/date window. A player must never be Ranked on one surface and Idle on another. Before changing data, verify Ant Slice's actual count of rated matches in the rolling 30-day window; if >=2, current `#–` is a bug. |
| Compact Games breakdown; full calculation must actually open | The expanded Games card is still too wordy. Keep only the concise matchup/expectation line(s), then rating change per player. Remove redundant explanatory prose already implied by the expectation/result line. `See full calculation` must be a working disclosure/accordion on the same card; it is currently inert and is a bug. |

---

## 4. CURRENT TASK

**Owner / baton: Claude Code — separate Idle vs Inactive player states.**

Shaun has identified that the current UI uses `INACTIVE` for two different
things: players who are still part of Money Padel but temporarily do not meet
the live-ranking activity threshold, and players who are genuinely not
participating at all. These must be separated.

### Terminology and state model

Use three user-facing states:

- **Ranked** — active player who currently meets the live Power Rankings
  eligibility rule (currently 2+ matches in the last 30 days).
- **Idle** — still an active Money Padel player, but currently below the
  live-ranking activity threshold.
- **Inactive** — explicitly not currently involved / not participating at all.

Internally keep the dimensions separate:

- explicit player participation status: `ACTIVE | INACTIVE`;
- derived ranking state for active players: `RANKED | IDLE`.

Do not derive true Inactive status from the 30-day ranking rule.

### Rankings UI

- Players currently shown below the divider because they have fewer than 2
  matches in the last 30 days should display **IDLE**, not `INACTIVE`.
- Change the divider to something like:
  `Idle players — fewer than 2 matches in the last 30 days`.
- Ranked players remain the normal ordered ranking above that divider.
- True Inactive players should not be mixed into the Idle group.

### Filters

Add clear options so the two states can be controlled independently.

Preferred structure:

- **Ranking status**: Ranked / Include idle
- **Player status**: Active / Include inactive

Default should preserve the current player-facing experience unless existing
behavior already intentionally differs: Ranked players visible; Idle may remain
shown beneath the ranked list; true Inactive players hidden unless explicitly
included.

If true Inactive players are included, show them in a separate section below
Idle with copy such as `Inactive players — not currently participating`.

### Data / admin implications

If the app does not yet have an explicit active/inactive participation field,
add the narrowest safe state needed so Inactive can be set independently of
ranking eligibility. Do not overload lifetime matches, recent activity, tier,
or reliability to infer it.

Preserve historical ratings and results for Inactive players; changing
participation status is presentation/eligibility metadata, not a rating event.

### Acceptance

- an active player below the recent-match threshold renders as `IDLE`, not
  `INACTIVE`;
- a true Inactive player can be represented separately and excluded by default;
- filters can include Idle and Inactive independently;
- existing 2+ matches / 30 days ranking rule is unchanged;
- no Sequential-v1 or historical rating changes;
- targeted browser tests cover Ranked, Idle and Inactive states and filters.

### Eligibility consistency bug to verify

Shaun spotted Ant Slice showing `#– in Tier A · #– Overall` on Home despite
recent activity. Do not assume the Home state is correct.

Before implementation, calculate Ant Slice's count of **rated v3 matches in the
rolling 30-day window ending on the current app date** using the same source that
should feed Rankings eligibility.

- If Ant Slice has **2+** qualifying matches, the current Home/Profile `#–` state
  is a bug and must be fixed.
- If he has **<2**, the UI may correctly show him as Idle, but it should use the
  new explicit `IDLE` state rather than looking like missing ranking data.

Architecturally, create/reuse one shared eligibility helper for:

- Rankings list and rank numbers;
- Home `Your Game` rank display;
- Player Profile rank display;
- Club Pulse / any promotion-watch or rank-derived widgets.

That helper must use the same v3 rated-match dataset and rolling date rule on
every surface. Add a regression test that the same player receives the same
Ranked/Idle state and rank availability across those surfaces.
---

## 5. OPEN QUESTIONS / DECISIONS

### Rating model backlog — parked during refinement

These are **not active implementation work**. Shaun wants the app refined first
and the current engine left unchanged. Revisit together later with live data:

1. **Responsiveness / small movements.** Does reliability accumulate too fast
   for Money Padel's real match volume, causing established-player K values and
   rating movements to become too small too early? Test sustained runs such as
   8–2 / 7–3 rather than judging isolated matches.
2. **Reliability curve calibration.** Compare the current `rc = 10` with slower
   curves (for example 15/20/25) using the actual club dataset; measure movement
   distributions, convergence after genuine improvement, ranking stability and
   walk-forward accuracy before considering any change.
3. **Expectation symmetry.** Sequential-v1 compares a blended actual score
   (80% game share + 20% match result) against a single Elo expectation. Review
   whether the expected side should itself include a separately modelled match
   result expectation so wins/losses are not conceptually double-counted.
4. **Sustained-winning recognition.** Check whether repeated wins — including
   narrow wins — are reflected quickly enough by the base model. If not, decide
   whether the answer belongs in the core model rather than as a cosmetic bonus.
5. **Optional player volatility mechanic (`Prove It`).** Possible future
   feature: an established player voluntarily accepts temporarily larger
   two-way rating movement for a fixed run of matches. If explored, implement
   as a separate K multiplier / volatility state, **not** by falsifying stored
   Reliability. Model 2×/2.5× historically before product design; 4× may be too
   aggressive.

None of the above is authorised for implementation yet.

1. **RESOLVED — monthly historical read strategy.** Use a month-filtered
   `ratingJourney` query (and the required Firestore index if needed). Section 2
   is amended: `players` remains the normal current-state read source;
   `ratingJourney` is allowed for bounded historical views. No precomputed
   monthly snapshots for now.
1a. **RESOLVED — accept the current session-cached cumulative read for Ranking
   Movement while the journey remains small.** Shaun/CGPT, 17 Sep 2026:
   `monthlyViews.js` may retain its once-per-session cumulative `ratingJourney`
   read, cached for the session (633 events at the last verification). Computing
   all-player rank at a historical boundary requires earlier state for players
   inactive in the selected month; a month-filtered query alone cannot supply it.
   This is a deliberate narrow exception: `players` remains the normal
   current-state source, and bounded historical reads remain required where
   they suffice. No whole-journey read per render, no snapshot collection yet,
   and Ranking Movement stays in scope.

   **Measurement recorded 18 Sep 2026 (`7dcdd2e`), as this exception requires.**
   633 journey events = 633 documents read once per session. Growing ~160
   events/month at the club's recent rate. Review point set at 5000 events,
   roughly 28 months away; the diagnostics screen reports these figures live and
   says when the review is due. **Not due.** No change to the exception.

   **Future review, not a current blocker:** reopen when journey size, read cost
   or observed load latency becomes material, or before an import/backfill
   expected to make it material. Claude Code owns recording the measurements
   and raising the review in this Ledger as specified in Section 2; the
   exception must not silently become permanent architecture.
   **NEXT #1, including Ranking Movement, is unblocked. Baton → Claude Code.**
2. **Match edits and deletions are inert.** The legacy edit/deletion overlays
   are no longer applied, because v3 match documents are already the edited
   truth and re-applying an overlay would desync a match from the rating
   computed for it. Consistent with historical editing being unavailable until
   replay-forward exists. **Shaun/CGPT decision: hide the inert controls for
   now; restore them only once replay-forward makes historical editing real.**
3. **Production snapshot does not reconcile.** 149 matches vs v3's 150;
   17 players' counts disagree, six of them negatively. Not explained by draws.
   Treat as an approximate reference, not a reconcilable truth.
4. **Snapshot join key is fragile.** Every `player_id` in the export is `null`,
   so name is the only join. 34/34 map today; a rename breaks it silently.
5. **Drift figure unresolved.** The specification states ~1.8 points of drift
   over 144 matches; measured is −42.8 (Stage 1) / −39.1 (Stage 2). Every other
   figure reproduces exactly, so this is most likely a different metric —
   recorded rather than quietly reconciled.
6. **RESOLVED (`19ffe21`) — expectations were recomputed in the
   browser.** Raised by CCode, 17 Sep 2026, while building the Rating Journey.
   The standing constraint is *"Never recompute historical expectations in the
   browser."* `enrichMatches` in `assets/js/app.js` does precisely that: it
   derives `expected_winshare` from **today's** ratings and prints it on every
   match card as "expected ~32% of games", and `computeMatchDelta` derives a
   "rating impact" figure the same way. Neither is the engine's number. The
   authoritative `preMatchExpectedScore` and a per-player `ratingDelta` are
   persisted for all 596 rated match events, so this is a read swap.
   One structural consequence needs a product answer, not an implementation
   choice: because K is per-player, a match moves each of the four players by a
   **different** amount, so the current card line ("+X for winners · −X for
   losers") has no v3 equivalent and the card must be redesigned, not renumbered.
   Not fixed inside the Rating Journey task because it spans the Games view as
   well, and a half-fix would put two different expectation figures on screen at
   once. **Recommendation: schedule as its own item before beta review.**
7. **RESOLVED (`19ffe21`) — `computeMonthlyJourney` ran the legacy joint solver.** It restarts
   every player from their tier seed, which v3 does not do — there is one
   continuous rating and no monthly reset. Live in two places: the Monthly Rating
   breakdown modal and the head-to-head month view, the latter still telling the
   reader "Each player starts the month at their tier baseline." These are the
   last screens in the app showing a reconstruction. The four monthly views in
   `monthlyViews.js` already carry the real figures.
17. **APPROVED — Historical Club Adjustment + historical reassessment correction.**
   Shaun confirmed the factual history on 18 Sep 2026. Shaun's 1 Jul C→B was an
   initial-classification error correction with the club assessment **normal B
   baseline = 1400**. Tom's 1 Jul and Fatch's 1 Aug C→B moves were genuine
   promotions and should be processed through the same club reassessment decision
   semantics as future reviews.

   Phase B (`17ed790`) found the statistical recommender returns **no target** for
   Tom/Fatch because too few established C players existed at those dates. This
   is not equivalent to Keep current. The board still has to choose Keep current
   or a Club override. Reliability likewise has no validated automatic
   recommendation and remains a board choice.

   Rather than handle these as a one-off script, CCode is approved to build a
   permanent Admin-only Historical Club Adjustment tool over replay-forward, with
   historical state reconstruction, reason/attribution, blast-radius preview, and
   superseding/correction events rather than silent deletion.


   **Final historical board outcomes confirmed 18 Sep 2026.** Shaun = 1400 at 10% reliability on 1 Jul; Tom = Jords' 1 Jul pre-review Power Rating at 10% reliability; Fatch = Tom's 1 Aug pre-review Power Rating (after Tom's corrected July trajectory) at 10% reliability. Historical writes are now authorised through the audited Historical Club Adjustment path.

8. **Manny is Tier S and is invisible to every tier-scoped view.** Noticed
   while fixing Kings of Tiers: current tiers are A 9 · B 17 · C 7 · **S 1**.
   The Kings panel hardcodes A/B/C and the tier filter offers A/B/C, so Manny
   can never appear in either. Not changed — whether Tier S is a real tier, a
   legacy artefact or a data error is Shaun's call, not an implementation
   detail. **Low urgency, but it should not stay unanswered before beta.**
9. **Match cards changed shape, and Shaun should see it.** A match used to
   report one rating figure: "+X pts for winners · −X pts for losers". In v3
   that figure is true for nobody — K is per-player, so the four players in a
   match move by four different amounts. Cards now list each player's own
   change. This is a visible product change, made because there is no other
   truthful rendering of a per-player model, and the previous number was an
   invention (84 × overperformance) in any case. **Recorded for review, not
   presented as settled.**
11. **Engine precision — needs Shaun/CGPT, because the engine is frozen.**
   Found while building the write path. `applyStateEvent` writes both
   `newReliability` and the exact `effectiveEvidenceAfter` onto every event, but
   when an event is replayed it prefers `newReliability` and inverts it through
   `reliability = e / (e + 10)`. The round trip loses a last bit: evidence of 21
   replays as 20.999999999999996. **It does not change K, does not compound (50
   round trips stay within a billionth), and no current code replays stored
   events** — but it means a replayed document is not byte-identical to the
   stored one, and **replay-forward will replay these documents for real.**
   Proposed fix, one line in `ratingEngine.applyStateEvent`: prefer the exact
   `effectiveEvidenceAfter` over the derived `newReliability` when both are
   present. This changes no mathematics — it picks the lossless of two
   representations of the same quantity — but it is engine code, so CCode has
   recorded it as a passing test (`KNOWN:` in `clubDecision.test.js`) rather
   than applying it. **Decide before replay-forward is built.**
13. **RESOLVED (`8d65edc`) — the beta could not record a new game.**
   `getAllApprovedMatches()` returns the v3 `matches` collection only.
   `approveMatch()` still marks a submission approved in `extraMatchesState`,
   which no longer reaches the rated record. Verified in the browser: a
   submitted game shows as pending, and on approval **disappears from the list
   entirely and is never rated**. The club cannot add a result to the beta at
   all. This is not replay-forward's job — a new match at the end of the
   sequence is forward-only, like a club decision — it needs a match write path.
   Fixed: approving now plans an append through `replayForward.js`, shows which
   players move, and writes on confirmation. Verified end to end.
14. **RESOLVED (`8d65edc`) — the approved hiding of Edit/Delete had never
   happened, and they were worse than inert.** Open Question 2 records Shaun/CGPT approving the hiding of the
   inert controls. The controls are still live. Verified: clicking Delete and
   confirming **persists `deletedIdsState` to shared storage and changes
   nothing** — the match remains, the rating is unchanged, because the legacy
   overlay is no longer applied. Editing likewise persists `matchEditsState`
   that does nothing. Both leave behind state that would desync matches from
   their ratings if any code ever re-applied it. Both paths now refuse and say
   why. Pending submissions keep their controls, because those are not in the
   record.
15. **Node and the browser do not agree in the last bit, and the record spans
   both.** Found by replay-forward's no-op check. The record was seeded from
   Node; replays happen in the browser; their `Math.pow` differs by 1 ULP, so an
   expectation stored as `0.4803169324020399` replays as `0.48031693240203976`.
   Exact-equality verification is therefore impossible across the two. Document
   comparison now treats numbers as equal within a **relative 1e-9** — about
   1.4e-6 at a rating of 1400, five orders of magnitude below the 0.1 the app
   displays. **Recorded rather than buried:** anyone adding a checksum, a
   signature, or a byte-equality check over these documents will hit this.
16. **Open Question 11 is now lower urgency.** Replay-forward routes around it
   by replaying INTENT rather than the recorded values — an event is replayed as
   changing reliability only if it actually did. The one-line engine fix is still
   worth making so other callers cannot hit it, but it no longer blocks anything.
12. **A fourth false statement, now fixed, worth recording as a pattern.** The
   Games view told users a draw "doesn't count as a win or loss for anyone, and
   doesn't affect any rating". Draws are rated in v3 — one moved a player by
   10.25 points. This is the fourth time a retired calculation left its
   sentence behind. Copy that describes engine behaviour should be treated as
   code and checked whenever the engine changes.

---

## 6. HANDOFFS

### CGPT — 19 Sep 2026 (Ant Slice eligibility consistency)
Shaun identified a likely ranking-eligibility inconsistency: Ant Slice shows
`#–` on Home even though he has recent match activity.

CCode should verify his actual rated-match count in the rolling 30-day window
before changing data. If 2+, the Home state is wrong. Regardless, ranking
eligibility must be centralized so Home, Rankings, Profile and Club Pulse cannot
disagree about Ranked vs Idle.

This is part of the active Ranked / Idle / Inactive cleanup, not a rating-model
change.

### CGPT — 19 Sep 2026 (Ranked / Idle / Inactive states)
Shaun approved a terminology/state split for Rankings.

**Ranked** = active and currently eligible for live rankings. **Idle** = still
part of Money Padel but below the recent-match threshold. **Inactive** =
explicitly not currently involved at all.

The key architecture point is that participation status and ranking eligibility
must be independent. Recent inactivity may make an active player Idle; it must
never automatically make them Inactive.

Add independent filter controls for Idle and Inactive, keep true Inactive
players hidden by default, and relabel the current lower ranking section from
Inactive to Idle.

**Baton → CCode.** Implement terminology/state/filter cleanup with tests; no
rating-engine changes.

### CCode — 19 Sep 2026 (compact Games card; `See full calculation` fixed)

**Both done. Baton to CGPT/Shaun.** No change to Sequential-v1 or stored
history, and no second calculation path.

**`See full calculation` was inert, and the cause was structural.** The Games
card wraps its body in `.game-card-clickable`, whose handler toggles the card
and re-renders the whole tab. A click on the disclosure's summary bubbled up to
it, so the card collapsed and re-rendered *before the browser could open the
details* — nothing appeared to happen. It worked on the profile card only
because that card has no click handler, which is precisely why it was missed.

Both card handlers now ignore clicks originating inside a `<details>`. The new
test asserts the disclosure opens **and that the card underneath does not
collapse**, which is the half that was actually broken.

**The expanded card is now the requested hierarchy and nothing else:**

```
Antz (1407) & Len (1675) vs Max (1401) & Stormzy (1377) (ratings going in)
winners favoured by 152 pts going in
Expected 71% of games · won 13/20 (65%) · won match
RATING CHANGE, PER PLAYER
Antz +0.3 · Len +0.2 / Max -0.2 · Stormzy -0.3
Each player moves by their own amount: ...
See full calculation ›
```

The sentence between the result line and the per-player movements is gone. It
was explaining the model rather than the match.

**One disclosure builder** now serves the profile, the monthly breakdown and the
Games feed, so three cards cannot drift into describing one match differently.
It reads `V3_MATCH_FACTS` and shows the expected score, the share of games won,
the **match result contribution as its own row**, the blended score written out
as `0.80 × 0.65 + 0.20 × 1.00`, the difference, and then each player's own K,
reliability before → after and movement. With a named player it also closes the
loop: `K × (performance − expected)` = the movement shown above.

That disclosure answers the question the compacted card deliberately leaves
open — why **+0.3** after winning *fewer* games than expected: expected 0.71,
games 0.65, result 1.00, blended 0.72, difference +0.01.

| | |
|---|---|
| Tests | **270 / 270** (36 in a real browser) |
| New tests | the disclosure opens and closes without collapsing its card, and carries the expected technical rows · the expanded card is materially shorter, carries the one-line expectation/result, and no longer repeats the model explanation |

**Screenshots still could not be regenerated.** The beta's Firestore **daily
read quota** is exhausted (429 `RESOURCE_EXHAUSTED`). `players` and `matches`
now read and are cached; the 666-event `ratingJourney` is still blocked. The
cache is per collection now, so a failure on the expensive read no longer throws
away the two that succeeded — **the next attempt costs one read rather than
three.**

Three shots show superseded wording and the README names them:
`05-match-card`, `06-monthly-breakdown`, `15-why-your-rating-moved`.
(`10b-games-correction` was previously flagged too; it shows only collapsed
cards, so it was never affected — that flag was over-cautious and is withdrawn.)

### CGPT — 19 Sep 2026 (compact Games card + full calculation bug)
Shaun reviewed the latest Games breakdown. The wording is now directionally
correct, but the card still contains too much explanatory prose. Remove the
redundant sentence between the expectation/result summary and per-player rating
changes.

Also, `See full calculation` currently does nothing. This is a functional bug,
not a copy preference. Make it an in-card disclosure backed by the same
persisted match/journey facts already used for the rating movement.

**Baton → CCode.** Compact the card and fix the disclosure; no engine changes.

### CCode — 19 Sep 2026 (wording correction, and a read-quota finding)

**Done. Baton to CGPT/Shaun for copy acceptance.** Copy and presentation only:
no change to Sequential-v1, expected-score mathematics, K, reliability or stored
history.

**Shaun is right, and it is the objection I raised yesterday resolved the other
way round.** Sequential-v1 compares a *blended* actual score — 80% game share,
20% the match result — against a single expectation from the four ratings. A
team can match its expected game share **exactly** and still move up, because
the win contributes separately. Calling that "performed above expectation" is
false: nothing about the games beat the expectation.

So the plain layer no longer gives a blended verdict at all. It states two
observable things and never mixes them:

> **Your team were favourites.**
> Based on the four players' ratings, you were expected to win about **60%** of
> the games. You won **18 of 30 games (60%)** and won the match.
> **You matched the game-share expectation.** The match result also contributes
> to the rating calculation.
> **Your rating moved +2.9.**

The four verdicts are game-share comparisons only — *matched the game-share
expectation* / *won about the expected share of games* / *won more games than
expected* / *won fewer games than expected*. The movement is stated as a fact
beside them rather than as their consequence, which is exactly what it is not.
Per-player movements follow, on profile cards as well as monthly ones.

The same rule now applies on the neutral Games card, where the live record shows
why it matters: expected 71%, took 13 of 20 (65%), won the match — now
*"Winners won fewer games than expected. The match result also contributes to
the rating calculation"*, with a small positive movement underneath. It
previously read "performed about as expected", which was a blended claim
dressed as a claim about games.

The small print no longer implies the expected side contains its own match
result expectation: *"The match result is a separate input: your score for the
rating is 80% the share of games you won and 20% the result itself."*

Whether the expectation should itself model a match result is **Open Question
backlog item 3**, and this pass deliberately does not touch it.

| | |
|---|---|
| Tests | **268 / 268** (34 in a real browser) |
| New test | Shaun's case exactly — 60% expected, 18/30 won, match won, blended residual positive and the rating up — asserting the copy says "matched the game-share expectation" and never "above expectation", "exceeded expectation" or "pushed you above" |

---

**A finding that needs recording: the beta exhausted its Firestore daily read
quota today** (429 `RESOURCE_EXHAUSTED`). The cause is mine —
`scripts/screenshots.js` re-read all 857 documents on every run, and between the
import verification and a dozen capture runs while iterating on copy, that is a
great many reads in one session.

Fixed at the source: the script now caches the live record to disk and reuses
it, so iterating on captures costs nothing (`--refresh` forces a fresh read),
and its reads are sequential with backoff rather than three at once — three
parallel reads of the whole record is itself enough to earn a 429.

**Consequence, stated rather than hidden:** the quota had gone before the cache
existed, so three screenshots could not be regenerated and still show the
superseded wording — `06-monthly-breakdown`, `10b-games-correction` and
`15-why-your-rating-moved`. The README says so at the top and points at the test
that covers the corrected copy. **Re-run `node scripts/screenshots.js --refresh`
once the quota resets**; CCode will do it on the next `Ledger CCode` if nobody
has.

This does not affect Open Question 1a: that exception is about the app's
once-per-session journey read, which is unchanged and still well inside its
review threshold. The quota went on tooling, not on the product.

### CGPT — 19 Sep 2026 (wording-only refinement; model backlog parked)
Shaun wants the current refinement phase to stay focused on presentation, not
rating-model changes.

Immediate fix: correct the plain-English rating explanation so game-share
expectation and the separate 20% match-result contribution are described
truthfully. A team matching its expected game share must not be labelled as
`above expectation` solely because it won the match.

The broader model questions — small movements/reliability curve, sustained
winning, expectation symmetry, and a possible `Prove It` volatility mechanic —
are now explicitly parked in Section 5 for later evidence-led review.

**Baton → CCode for wording correction only.**

### CCode — 19 Sep 2026 (plain-English explanations; Games month defect)

**Both items done. Baton to CGPT/Shaun for copy acceptance.** Sequential-v1 is
untouched and every figure is read back from the facts recorded when the match
was rated.

**1. Player-facing explanations now lead in padel language.** The four lines run
in the order a player thinks in, and the decimals moved one level down:

> **Your team were slight favourites.** Based on the four players' ratings, you
> were expected to win about **53%** of the games. You won **60%** of the games
> and won the match. **You performed above expectation → +5.7 rating points.**

From the live record, the case players actually write in about:

> **Your team were underdogs.** Based on the four players' ratings, you were
> expected to win about **32%** of the games. You won **52%** of the games but
> lost the match. **You still exceeded expectations → +3.6 rating points.**

**The honesty rule is built into the copy, not bolted on.** The engine's
expectation is the target for a *blended* score — 80% games won, 20% the match
result. Quoting it as "expected to win about 53% of the games" is the
simplification the club approved, so **every sentence that quotes it also states
the result** ("and won the match", "but lost the match"), and a line of small
print names the blend. Crucially, **the verdict is never derived by comparing
the two percentages** — they measure different things. It comes from the
residual the engine recorded, so it cannot contradict the movement printed
beside it.

A real card shows exactly why that matters: expected **71%**, took **65%**, won
the match → *"performed about as expected"*. Comparing the percentages would
have called that an underperformance; the recorded residual is +0.01, because
the win carries 20%. The disclosure shows the 0.72 against 0.71.

**`See full calculation`** now holds games won, the exact delivered and expected
performance scores, the difference, K, and reliability before → after, plus the
arithmetic. No raw performance-score sentence is left in front of a player on a
profile card, a monthly card or the Games feed — a test sweeps all three.

**2. Games month — the correction found a real defect.** The Ledger asked to
*retain* coverage that Play → Games opens on All time. **It did not.**
`selectedMonth` was a single global shared with Rankings, and Rankings sets it
to the last completed month at boot, so Games was opening on **August**. Games
now keeps its own `gamesMonth`, defaulting to All time and never following the
monthly views. Users can still pick a month there manually, and that choice no
longer moves the Rankings month either.

The test asserts **both** halves — Games is on All time *and* Rankings is not —
so the two cannot be quietly re-coupled by a later change.

**Also fixed:** the disclosure printed "Weighting K 21.5" directly above
"21 × (0.29 − 0.46)". Two roundings of one number in one panel is the sort of
detail that makes a reader doubt the rest of it; there is now one rendering of K
everywhere it appears, and a test that it reads the same in both places.

| | |
|---|---|
| Tests | **267 / 267** (33 in a real browser) |
| New / rewritten | the explanation is plain in front and exact behind · the three brief cases read as written · the standing headline agrees with the recorded ratings across every card · no normal card leads with a raw performance score · Games opens on All time while Rankings does not |
| Screenshots | 16 — shot 15 shows both layers with the disclosure open |

The Power Rating Guide's detailed methodology is unchanged, as asked; its
summary already used this framing.

### CGPT — 19 Sep 2026 (Games month default correction)
Correction from Shaun: **Play → Games should default to `All time`**. The
difference from the other monthly views is intentional. Keep specific months
available as manual filters; do not change the Games default to a completed month.

### CGPT — 19 Sep 2026 (simpler rating explanation)
Shaun approved replacing technical player-facing `Performance score 0.xx vs
0.xx expected` copy with simpler match/game language.

Normal explanation should tell the player: favourites/underdogs/even, expected
game-share %, actual game-share %, match result, whether they
outperformed/met/underperformed expectation, and the rating movement. Keep raw
blended performance score, K and reliability behind `See full calculation`.

Do not simplify so far that the UI implies ratings are game-share only: the
match result still contributes 20% to Sequential-v1's actual score.

**Baton → CCode.** Implement the copy/presentation change with targeted
regression tests; no engine changes.

### CCode — 18 Sep 2026 (Play history: admin controls collapsed)

**Done. Baton to CGPT/Shaun for visual/UX acceptance.** Presentation and
permission surface only — match facts, replay-forward and Sequential-v1 are
untouched.

Shaun was right that the feed had become a maintenance console, and the cause
was mine: the correct-vs-remove split earlier today put two labelled actions and
the replay warning on every rated card permanently.

**Non-admin** now sees none of it — no correction control, no removal control,
no manage affordance, and none of the replay warning copy. That copy is
maintenance guidance and does not belong under every result.

**Admin** gets a compact `··· Manage` in the card header. Opening one card
reveals the two existing actions and the warning; opening another moves it;
tapping **Close** collapses it again. One card at a time, because the point is
that maintenance is something you ask for rather than scroll past.

Default card hierarchy is now teams and result, score, draw badge where
relevant, then submission metadata — and nothing else.

**The one thing collapsing must not break:** a staged correction keeps its own
card open, so the blast-radius panel can never be hidden while it waits to be
confirmed. Closing that card **cancels** the staged plan rather than leaving it
hanging invisibly behind a collapsed card.

Everything else is as it was: the two actions keep their own wording, a removal
is still confirmed by a button reading *Remove and replay*, and the blast radius
is still measured by replaying and shown in full before anything is written.

| | |
|---|---|
| Tests | **265 / 265** (31 in a real browser) |
| New tests | a non-admin card carries none of it · an admin sees the affordance with actions collapsed and the warning not repeated · opening one card reveals its own actions and leaves the others collapsed, and a second card takes over · a staged correction keeps its card open, and closing it cancels rather than hides the plan |
| Screenshots | 16 — `10-games-feed.png` is what a player sees, `10b-games-correction.png` is Manage opened |

The existing remove-vs-correct test now opens Manage first. That is the
behaviour change it should have to account for, not a weakening of it.

The Power Rating Guide (`9de1a88`) was not touched.

### CGPT — 18 Sep 2026 (Play history admin controls)
Shaun reviewed the live Play screen and found that historical maintenance
actions are now rendered permanently on every game card. Product decision:
restore Play history as a clean player-facing results feed.

`Correct match`, `Remove and replay`, and replay-warning copy are **Admin-only
and on-demand**. Non-admin users see none of them. Admin gets a compact per-card
`…` / `Manage` affordance; opening it reveals the existing actions and warning
for that card only. Preserve all replay/correction behavior underneath.

**Baton → CCode.** Implement the collapse/visibility behavior plus targeted
browser tests, then return for visual/UX acceptance.

### CCode — 18 Sep 2026 (Power Rating Guide + "Why your rating moved")

**Built. Baton to CGPT/Shaun for copy and UX acceptance.**
Sequential-v1 is untouched.

**`More → Power Rating Guide`** leads with the idea and keeps the arithmetic one
tap away, on the reasoning that the usual reaction to a small movement is that
the system is broken, and the honest answer — K falls as evidence builds — is
not something a player should have to infer from a chart.

Shaun's anchor sentence is used verbatim: *"The rating is not designed to reward
wins. It is designed to update our estimate of playing level."*

- **Summary** — the nine plain-English points, then the five things that sound
  alike separated explicitly: Power Rating, Reliability, Monthly Performance,
  League Table, Tier, with a note that a high Reliability does not make anyone
  better.
- **The actual calculation** (expandable) — the formula, expected score,
  performance score at 80% games / 20% result, `K = 10 + 30 × (1 − reliability)`,
  `reliability = e ÷ (e + 10)`, the worked example (16 × 0.13 = +2.1), and the
  comparison: the same **+0.20** overperformance is **+2.9** at 85% reliability
  and **+7.4** at 10% — roughly **2.6×**, with neither player having played
  better than the other.
- **Questions people actually ask** — all six from the brief, plus "my rating
  barely moves any more, is it stuck?" Includes that a tier change on its own
  moves **zero** points and zero reliability, and that nothing resets monthly.

**Every constant is read from the running engine** — `KMAX`, `KMIN`, `RC`,
`GAME_SHARE_WEIGHT`, `MATCH_RESULT_WEIGHT`, `RATING_MODEL_VERSION` — rather than
transcribed beside it, so the guide cannot describe a model the app is not
using. Without the engine it says so rather than falling back to remembered
numbers, and it names the engine version it is describing.

**`assets/js/ratingExplainer.js`** puts a plain-English *"Why your rating moved"*
on the profile match card and the monthly breakdown card. It **calculates
nothing**: the expected score, the performance score, K and the movement were
all written when the match was rated and are read back through `MatchFacts`.
There is no second calculation path. The pace language is decided from K rather
than from the movement, so "moves it slowly" can never sit above "+7.4".

A real example from the live record:

> **Why Shaun's rating moved** — You went in as underdogs by 29 pts, so the
> engine expected 45.9%. You delivered 28.6% — short of that. Your rating is
> reasonably well established, so one result moves it at a moderate pace (K 21).
> That comes to -3.7.
> `K × (performance − expected) = 21 × (0.29 − 0.46) = -3.7`

**Two defects found by looking at the render, not at the tests:**

1. The long formula was set `nowrap` and cut off mid-line at phone width. A
   formula the reader has to swipe to finish is one most readers will not
   finish.
2. The explanation read "underdogs by **28** pts" directly under the card's own
   "underdogs by **29** pts going in". `Math.round(-28.5)` is −28 while
   `Math.round(28.5)` is 29. The explainer now rounds the magnitude exactly as
   the card does, and a browser test walks four players' cards asserting the two
   always agree. A one-point disagreement is exactly what makes an explanation
   look like a second calculation.

| | |
|---|---|
| Tests | **261 / 261** (27 in a real browser) |
| New tests | guide reachable from More and closes the sheet behind it · formulas and comparison match the engine's own constants · anchor sentence, five distinctions and all six questions present, no monthly-reset or win-reward wording · the explanation quotes the recorded expected/performance/K/movement and the same movement the card prints · the three complaint cases read correctly · card and explanation state the same gap |
| Screenshots | 15 (four new: guide summary, the maths, the FAQ, and the explanation on a card) |

**For CGPT and Shaun:** the copy is the deliverable here, so it is worth reading
rather than glancing at — shots 12–15 in `docs/screenshots/README.md`. Anything
that reads wrong is a one-line change; say which sentence.

### CCode — 18 Sep 2026 (production match-facts import: 7 new matches applied)

**Shaun approved the dry run and the write is applied and verified.** Full
record in [`PRODUCTION_IMPORT.md`](./PRODUCTION_IMPORT.md).

Match facts only. Production ratings, rankings, tiers and reliability were never
read. Production's winner/draw flag was treated as authoritative and was never
inferred from the orientation of the set scores. Score arrays carried across
exactly as stored. The 50 pre-June records were excluded — that block stays
display-only and cannot enter a rating calculation.

| | |
|---|---|
| Records in the export | 207 |
| Pre-June, excluded (display-only) | 50 |
| Eligible | 157 |
| Already present (deduplicated) | 150 |
| **Imported** | **7** |
| Conflicts | 0 |
| In v3 but absent from the export | 0 |
| Documents written / deleted | 49 / 0 |

**The seven**, all production submissions with status `approved`, 16–17 Sep:

| v3 id | match | score |
|---|---|---|
| `2026-09-16-1` | Osh & PDM def KC & Jams | 6-1, 6-2 |
| `2026-09-16-2` | KC & PDM def Osh & Jams | 7-5, 6-3 |
| `2026-09-16-3` | Stormzy & Omar def Max & Jords | 6-2, 6-3 |
| `2026-09-16-4` | Tom & Rishi def Jords & Eli | 6-4, 2-6, 6-3 |
| `2026-09-17-1` | Eli & Len vs Kaz & Rishi — **draw** | 4-6, 6-3 |
| `2026-09-17-2` | Osh & Rishi def Ant Slice & Eli | 6-2, 6-3, 6-0 |
| `2026-09-17-3` | Eli & Len def Osh & Rishi | 6-3, 6-1, 6-8 |

**Fourteen players moved**, every one matching the approved plan to the tenth of
a point: Ant Slice 1636.5→1625.1 (−11.3), Eli 1652.5→1641.5 (−11.1), Rishi
1454.1→1462.9 (+8.8), Osh 1705.5→1713.8 (+8.3), Jords 1336.1→1328.2 (−7.9),
Omar 1403.4→1409.5 (+6.1), Tom 1345.9→1351.0 (+5.1), Stormzy 1384.3→1389.3
(+5.0), Max 1410.6→1407.1 (−3.5), KC 1711.5→1708.7 (−2.8), Jams 1116.0→1113.3
(−2.7), PDM 1446.1→1447.6 (+1.6), Kaz 1731.2→1732.7 (+1.4), Len 1675.8→1675.9
(+0.1). The other 20 players did not move, which the no-op replay confirms
rather than assumes.

**Verification, from a fresh re-read of the live record rather than from what
the importer said about itself:**

| | |
|---|---|
| Live Firestore | **157 matches · 666 journey events · 34 players = 857 docs** |
| Replay-to-self | **0 differences** |
| Diagnostics | **9 / 9 pass, 0 warnings** |
| Tests | **255 / 255** (21 in a real browser) |
| Earliest match / event | 2026-06-02 — the pre-June rule holds |
| Draws | 6 (5 + the imported one) |
| Re-running the importer | 157 already present, **0 new** — idempotent |

**The importer is reusable and idempotent.**
`scripts/import-production-matches.js --file <export.json>` dry-runs by default
and reports everything before it can write: export integrity, pre-June
exclusions, already-present count, new matches in full, conflicts, unknown
names, the replay plan and every projected rating change. `--write` applies it
and then re-reads and proves the record still replays to itself.

Identity is **factual**, because production ids (`base_79`, `sub_1758…`,
`early_0`) and v3 ids (`YYYY-MM-DD-N`) share no namespace. A match is identified
by its **fixture** — date plus the two rosters as an unordered pair — which is
deliberately narrower than "everything about the match": an identity that
included the score could never detect a *changed* score, it would simply look
like a different match and be appended. Fixtures do repeat, so a fixture
addresses a group and records inside it are paired by full facts; leftovers on
both sides are a **conflict**, which stops the import rather than appending a
near-duplicate or silently overwriting. It also refuses on a malformed export,
or on a player with no v3 record — a starting tier is a club decision, not
something an importer may invent.

`replayForward` gained `appendMany`, so an import replays once. Appending one
plan at a time would have reported each match's blast radius against a record
the previous append had already moved, so the numbers shown would not have been
the numbers written.

**A discrepancy worth fixing at the production end.** The accompanying
`validation-summary.json` says "all 42 currently-submitted matches have status
'approved'". The export carries **41** records with `_origin: "submission"`, all
approved. Nothing in the import depends on it — dedupe is by match facts, not by
origin or id — but the summary and the file it describes disagree by one. Also
noted: production reports 12 matches excluded as deleted; none of them were ever
in v3, which the `in v3 but not in export: 0` result confirms.

**One thing production should know.** Production genuinely stores decided
matches whose first-listed side has the losing scoreline — 14 in this export,
12 pre-June and 2 in the rated range. The clearest is 2026-07-02, Len & Eli beat
Shaun & Osh 0-6, 6-3, 6-4, having taken 12 games to 13. v3 already recorded both
correctly, and the importer preserves them rather than "fixing" them. There is a
test for exactly this case.

### CGPT — 18 Sep 2026 (Power Rating Guide)
Shaun's remaining concern is player trust: movements now look relatively small
for established players, so the product needs to explain the model before
players assume something is wrong.

Decision: build **More → Power Rating Guide** with a short plain-English summary,
an expandable exact-methodology section, a worked example, complaint-prevention
FAQ, and a match-level `Why your rating moved` explanation derived from the same
persisted facts used by the calculation.

Do **not** tune Sequential-v1 merely to make movements feel larger. The current
small movements are explainable through reliability/K and should be presented
clearly first. Any later methodology change must be evidence-led and separately
approved.

**Baton → CCode.** Implement the guide and targeted tests from Section 4, then
return for copy/UX acceptance.

### CGPT — 18 Sep 2026 (product acceptance approved)
Reviewed CCode's completed acceptance pass at `e0fdcbc`: **242/242 tests**,
including **21 browser tests**, with all eight requested UX/presentation fixes
covered. The product requirements are accepted.

Approved the two deliberate deviations from the mockup: date edits remain
remove + re-entry because the date is part of match identity; and Key takeaways
summarises distinct stories instead of duplicating Monthly Performance.

CGPT is **not claiming pixel-level visual inspection of the regenerated private
repo PNGs**, because the GitHub connector exposes their files/captions but not
their pixels to vision. So the only remaining gate is Shaun's on-device visual
look check. No implementation task is queued unless Shaun identifies a concrete
visual problem.

**Baton → Shaun.** If the regenerated screens look right on-device, beta
acceptance is complete.

### CCode — 18 Sep 2026 (CGPT visual acceptance: all eight fixes done)

**All eight acceptance fixes are implemented, tested and captured. Baton back to
CGPT for final visual acceptance.** No Sequential-v1 mathematics was touched.

1. **"Monthly Rating" is gone.** The breakdown is now **Month-end Power Rating**,
   the figure is labelled **Power Rating at month end**, and the disclosure is
   **How month-end Power Rating works**. The methodology copy now opens
   "Nothing is solved separately for a month". A browser test asserts the phrase
   appears nowhere on screen — it caught my own replacement copy reintroducing it.

2. **Score orientation.** Set scores are *stored* winner-first (`sets[i][0]` is
   the winning side's games), which is why a defeat read "6-3, 6-4" beside the
   word LOSS. One helper (`setsForViewer` / `scoreForViewer`) now orients any
   card written from a player's point of view: the profile match log, the
   monthly breakdown cards, and the Games list when it is filtered to a player.
   Neutral cards keep winner order, bound by the "X def Y" title they already
   carry; a draw, which says "X vs Y" and binds nothing, states the order.
   **This uncovered a real defect in my own first attempt**: `enrichMatches`
   dropped `sets` and exposed only the joined `score` string, so orienting
   produced an empty score. The browser test failed on it. `sets` is now carried
   through enrichment.

3. **Reliability on the profile hero.** A facts row — Tier · Reliability ·
   Games · Joined — sits under the Power Rating, with the percentage in gold and
   the band beneath it, on the agreed thresholds (<25 Provisional, 25–49
   Developing, 50–74 Established, 75+ High Reliability, already implemented in
   `v3Bridge`). It is deliberately placed away from rank and win rate, because it
   measures evidence and not ability. If a player has no v3 record the row says
   so rather than showing a number.

4. **Unavailable actions are disabled with their reason.** Both the live review
   and Historical Club Adjustment: the button reads **Unavailable**, is styled as
   unpressable (dashed, 45% opacity), the reason appears in an ⓘ note in the same
   row, and the click handler refuses the branch even if the button is reached
   some other way. Rishi's "Correct the initial classification" is the case in
   the screenshot.

5. **Audit trail is readable and still whole.** Every event keeps its row;
   nothing is collapsed or rewritten. Each row now carries a status dot, an
   English label and a badge: **Active**, **Superseded**, **Correction**.
   `CLUB_RATING_REASSESSMENT — B→B` now reads "Rating reassessment after
   promotion · tier unchanged (B), rating 1103.4 → 1352.5". Superseded rows stay
   visible at 55% opacity with a grey dot.

6. **Correct and remove are separate acts.** Two labelled actions on the card
   ("Correct match — change the score or the players" / "Remove and replay —
   delete this match from the record"), and the confirmation now speaks the
   language of the act being taken: a removal is headed "Confirm removal" and
   committed by a button reading **Remove and replay**. The invisible
   double-arming click on Remove is gone — the blast-radius panel is the
   confirmation, and it says so.

7. **Monthly hierarchy.** A compact **Key takeaways** card leads, built from
   three *different* stories (strongest performance, biggest rating riser,
   biggest rank climb) so it does not restate the table below it. Monthly
   Performance stays open as the award story. Rating Movement, Ranking Movement,
   Moved without playing and Crossovers fold into `<details>` sections — no JS to
   re-wire on render, and each keeps its own title and explanation. Nothing was
   deleted, and club-decision movement remains labelled separately
   (`+255.2 pts (+249.1 by club decision)`).

8. **Contrast.** Measured rather than eyeballed. `--gold-dim` was **3.6:1** on
   `--bg2` — below AA for small text — and was being used for body copy as well
   as for borders. It now does borders only; a new `--gold-soft` (**6.6:1**)
   takes its text uses. `--text-dim` lifted from 6.5:1 to **8.2:1**, and a new
   `--text-soft` (**11:1**) sits between it and `--text` (14.6:1). The steps
   between the three are wide, so hierarchy is preserved and nothing became
   white. The all-time Rankings screen is visually unchanged, as asked.

| | |
|---|---|
| Tests | **242 / 242 passing** (21 in a real browser) |
| New regression tests | stale Monthly Rating copy · score orientation on a win and a loss · reliability + band on the hero · a disabled unavailable action that refuses to record · remove-vs-correct wording and one-click staging · audit badges and English labels · club-decision movement kept separate · all four monthly parts retained |
| Screenshots | 11, regenerated from the live record, 0 page errors |
| Live record | unchanged — 34 players · 150 matches · 638 journey events |

The screenshot set gained one shot (the profile hero, so reliability is
reviewable) and was renumbered; `docs/screenshots/README.md` is regenerated.

### CGPT — 18 Sep 2026 (visual acceptance pass)
Reviewed all ten live-record screenshots supplied by Shaun. The beta is **not
yet visually accepted**, although the core product direction is now strong.

Required fixes are listed in Section 4. Highest-priority product issues:
`Monthly Rating` terminology must disappear because no separate monthly solver
exists; match scores must be shown from an unambiguous perspective; Reliability
must be visible on the profile hero; unavailable review actions must not look
clickable; Historical Club Adjustment needs clearer active/superseded audit
states; Historical Match Correction must distinguish `Correct match` from
`Remove and replay`; monthly four-part content needs stronger hierarchy; and
secondary text contrast should be slightly improved without losing the premium
dark look.

All-time Rankings/Kings/podium direction is accepted. Rating Journey is accepted
in principle after the club-decision marker/copy fix. Do not redesign those
surfaces beyond consistency/readability changes required by the acceptance list.

**Baton → CCode.** Implement only the acceptance fixes in Section 4, regenerate
the same screenshot set, keep tests green/add targeted regressions, and return
the baton to CGPT for final visual sign-off.

### CCode — 18 Sep 2026 (review screenshots; a display defect found by looking)

**NEXT 7 is done. Section 8 is now empty — the baton is with CGPT and Shaun for
product acceptance.**

`scripts/screenshots.js` captures ten review aids into `docs/screenshots/`, with
a captioned `README.md`. Regenerate rather than edit them.

They are taken from the **live beta record**, not the seeded fixture: the three
board decisions of 18 Sep moved most of the club, so a capture of the seed would
show ratings that no longer exist. The script reads the three collections over
the REST backend, serves the app locally and stubs Firestore with a read-only
copy of those documents. Nothing is written back, and the two staged writes in
the set (the armed removal in shot 09, the armed review in shot 06) are planned
and displayed but never confirmed.

**A real defect, found only because the captures were read rather than assumed
correct.** The Rating Journey drew Shaun's 1 Jul initial-classification
correction as an annotation and captioned it "Power Rating unchanged at 1400" —
under a visible 263-point leap in the chart directly above it. The cause was
that markers and copy were chosen from the *event type* rather than from what
the event *did*. A tier move is rating-neutral; a correction is not, because the
board may be replacing an initial estimate it knows was wrong. Both are now
decided from `delta`:

- `journeyView.chartSeries` — `isJump` when a club decision moved the rating,
  `isAnnotation` only when it moved nothing.
- `tierEventsAreRatingNeutral` — narrowed to tier events. Corrections were
  wrongly included, which is the invariant that had made the bug look correct.
- `app.js` — the correction card states the actual before/after and delta, and
  the chart legend names only the markers actually drawn.

The card now reads: *Power Rating 1137 → 1400 (+263.2 pts), reliability 33% →
10%. The club judged the original estimate wrong and replaced it. This is a
decision, not a result on court.*

**Four capture defects were also fixed, each found the same way** — the image
did not match its caption:

1. Shot 07 showed the Monthly Rating Breakdown modal, not Historical Club
   Adjustment: the modal is closed by removing its `show` class, and the
   selector used did not exist.
2. Shot 09 showed diagnostics, not the Games tab: `goToSection('games')` is a
   no-op, because Games is a tab inside the Play section rather than a section.
3. Shot 04 duplicated shot 03 with an empty Recent Results: `openSheet` is
   wrapped to render the premium profile itself, so calling
   `renderPremiumProfile` again rebuilt the wrapper after the match cards had
   been reparented into it.
4. Shot 01's caption claimed "Tier S appears" when S and C have no qualifiers at
   the chosen minimum and are correctly not shown.

Three further captions were tightened to state only what is visible in the
frame. A tenth shot was added for the full-calculation disclosure, which is the
one place the engine describes its own arithmetic.

| | |
|---|---|
| Tests | **234 / 234 passing** (14 in a real browser) |
| Page errors during capture | 0 |
| Live record | unchanged — 34 players · 150 matches · 638 journey events |
| Diagnostics | all nine checks pass, as shown in shot 08 |

**For CGPT and Shaun.** The set is `docs/screenshots/README.md`. If a different
set, different players or a desktop viewport would review better, say so and it
is one command to regenerate. The ten are: all-time rankings, a single month,
Rating Journey, match detail, monthly breakdown, Admin monthly review, Admin
historical adjustment, Admin diagnostics, historical match correction, and the
full calculation.

### CGPT — 18 Sep 2026 (historical override values confirmed)
Shaun has made the final board decisions, so the historical writes are no longer
blocked. Apply Shaun on 1 Jul at **1400 / 10% reliability**. Apply Tom on 1 Jul
at **Jords' Power Rating immediately before the 1 Jul review / 10% reliability**.
Apply Fatch on 1 Aug at **Tom's Power Rating immediately before the 1 Aug review
after Tom's corrected July trajectory / 10% reliability**.

Tom and Fatch are explicit **club overrides**, not accepted statistical
recommendations. Preserve the shared-pre-review snapshot rule for 1 Jul, then
replay July before resolving the 1 Aug Tom anchor used for Fatch.

**Baton → CCode.** Apply through Historical Club Adjustment, verify, regenerate
comparison outputs, record exact resolved values/results in this Ledger, then
continue the remaining beta-finalisation tasks.

### CGPT — 18 Sep 2026 (Historical Club Adjustment approved)
Shaun asked whether historical reassessment should remain a bespoke three-player
repair. Decision: **no**. Build a narrow permanent Admin-only Historical Club
Adjustment workflow on top of replay-forward. The replay engine, historical
state and reassessment logic already exist; the remaining work is controlled UI,
validation, audit semantics and tests.

Important correction to the earlier wording: Tom and Fatch were historically
reassessed by the club when promoted. The fact that `t2-quartile-v1` cannot
produce a recommendation at their dates does **not** mean the club chose
keep-current. It means the statistical adviser abstains and the board must
explicitly choose Keep current or Club override.

Historical Match Correction and Historical Club Adjustment remain separate Admin
tools even though both use replay-forward underneath.

**Baton → CCode:** build the Historical Club Adjustment flow first and use
Shaun/Tom/Fatch as acceptance fixtures. Do not commit those three historical
events until Shaun confirms Tom/Fatch outcomes and reliability treatment.

### CCode — 18 Sep 2026 (NEXT 3, 4 and 5 done)
`0925479`, `3fbdc57`, `1c120c7` on `main`. 233 tests, 14 of them in a browser.
**The live beta is untouched by this pass** — it holds exactly the five
documents beyond the seeded baseline that are the three authorised board
decisions, and nothing else.

**#4 — exact-evidence precision fix applied.** `applyStateEvent` preferred the
derived reliability over the exact evidence beside it, so a replay sent the
number back through `reliability = e / (e + 10)` inverted and lost a bit:
evidence of 21 replayed as 20.999999999999996. No mathematics changed — both
fields describe the same quantity and K is identical either way; the engine now
prefers the lossless representation. `replayForward` passes the exact evidence
for any event that changed reliability, so it no longer has to route around the
problem by replaying intent. Verified against the live beta afterwards: still
replays to itself with 0 differences, all nine diagnostics pass.

**#3 — Historical Match Correction is exposed to Admin**, over replay-forward.
The controls come back meaning what they say: a correction re-derives every
rating that followed, so the blast radius is measured by replaying and shown in
full before anything is written, and cancelling leaves no trace. Removal
replays the record *without* the match rather than hiding it. Kept in one place
(the Games tab) so a blast radius is never shown twice or acted on from two
screens; profile and head-to-head cards point there.

  **Bounded limitation, recorded rather than papered over:** a correction that
  changes the DATE is refused with the reason. Match ids are `YYYY-MM-DD-N`, so
  allowing it would leave the identifier describing a day the match no longer
  belongs to. Moving a game is a removal and a re-entry — two deliberate steps
  the Admin can already take.

**#5 — Tier S supported throughout.** Kings of Tiers and the grouped League
Table both hardcoded A/B/C, so a Tier S player was silently absent from both.
Shaun's "do not crown a sole eligible S player" is implemented as a rule about
**the size of the field**, not about Tier S: a king of a field of one has won
nothing whichever tier it is, and hardcoding it to S would have made it look
like a rule about Manny. Proven in the browser by forcing Manny to be the single
qualifying S player — the card reads "only one qualified" and no crown is
awarded. He meets no qualifying threshold today, so the case cannot arise live,
which is why it had to be forced rather than taken on trust.

**#6 — per-player match movements** are unchanged and covered by a browser test.

**Baton → CGPT/Shaun.** Only **screenshots / product acceptance** (#7) remains,
and it still needs to be said what they are for: CCode has taken them as review
aids for CGPT and Shaun per the earlier note, but has not produced them.

### CCode — 18 Sep 2026 (the three historical decisions are APPLIED)
`0f7c2ed` on `main`. 230 tests + 11 browser tests. **Written to the live beta.**

| Player | Date | Decision | Anchor | After decision | Current |
|---|---|---|---|---:|---:|
| Shaun | 1 Jul | Initial classification correction | Board-fixed B baseline | 1400.0 @ 10% | **1374.3** (63%) |
| Tom | 1 Jul | Promotion + club override | Jords immediately before the review | **1352.5** @ 10% | **1345.9** (64%) |
| Fatch | 1 Aug | Promotion + club override | Tom immediately before the review, after his corrected July | **1358.6** @ 10% | **1342.1** (55%) |

**Two anchors were resolved, not given, and the order mattered.** Both 1 July
decisions came from the same pre-review snapshot, so processing Shaun first
could not move the Jords figure Tom was anchored to — the purpose of the
shared-snapshot rule, doing real work. Fatch could only be resolved afterwards:
on the old record Tom entered August at **1133.0**; after the corrections,
**1358.6**. Resolving all three up front would have anchored Fatch to a Tom who
no longer existed.

**Four defects surfaced by doing it**, each caught by a check rather than by
reasoning, each fixed before the result was accepted:
* `verifyNoOp` refused to run at all — adding `supersedes`/`revision` to the
  schema made every pre-existing document "differ" from its own rebuild (absent
  vs null). Both mean not applicable and now compare equal.
* The **Rating Journey showed superseded decisions beside their replacements**,
  telling a player their rating moved twice.
* The display ordered the rating decision **before** the tier move while the
  engine applied them the other way, so the chain stopped joining up. The
  canonical same-date order is now defined once and reused everywhere.
* Monthly movement counted only reassessments, so **Shaun's correction would
  have been shown as a month's form**. Any club decision counts now.

**Verified on the live record:** nine diagnostics pass, it replays to itself
with 0 differences, and monthly movement separates decision from play —
Shaun July +255.1 (**+263.2 by decision**, −8.1 on court); Tom +255.2 (**+249.1
by decision**); Fatch August +205.7 (**+222.3 by decision**, so he lost 16.6 on
court).

**Comparison against production improved materially.** `COMPARISON_REPORT.md`
now states its basis, because the seeded baseline and the live record differ
once club decisions exist. Regenerated live: mean absolute difference **31.9 →
18.0 points**, largest **220.3 → 97.8**. The seeded-differently players are no
longer the largest differences, and the report says so instead of repeating a
claim that has stopped being true.

`HISTORICAL_REVIEW_DRYRUN.md` is superseded by the applied result.

**Baton → CGPT/Shaun.** Section 8 items 3–7 remain; none is blocked.

### CCode — 18 Sep 2026 (Historical Club Adjustment built; still blocked on Shaun)
`9cc3c13` on `main`. 231/231 tests. **No historical decision has been written.**

Built as the permanent Admin tool the decision asked for, not a repair script.
Pick a player and a past date; the state immediately before it is reconstructed
from the journey; what is already recorded on that date is shown; the same four
decisions the prospective review offers are presented; a reason and a name are
required; the full replay consequence is shown before anything is written.
Separate from historical match correction, with a test enforcing it — one
repairs a result, the other records a judgement, and merging them would let a
rating be changed under cover of fixing a score.

**Your correction on "no recommendation ≠ keep-current" is implemented as a
refusal, not a caption.** Choosing "accept" where no recommendation exists is
rejected with the reason; nothing maps absence to a decision.

**Three defects found while building it, each of which would have silently
broken the audit guarantee** the supersession model exists to provide:
* `applyStateEvent` builds its own return shape and drops `revision` and
  `supersedes`, so the superseding correction was written with the **base id and
  overwrote the decision it was meant to preserve**. The engine is frozen, so the
  fields are re-attached during the replay.
* The superseded event then looked orphaned to the diff and **was deleted**.
* `verifyNoOp` counted it as "would disappear", which would have meant any
  record containing a correction could never verify again.

**Acceptance case proven end to end** (in the browser, against a stub — the real
beta is untouched). Shaun's 1 July correction to 1400: one superseding event, 0
deletions, 32 players re-derived, Shaun 1178.7 → **1380.2**. Both decisions
remain in the record, diagnostics pass, and the result still replays to itself,
so a further correction could be planned on top of it.

**Still blocked on Shaun, unchanged from the dry run:**
1. **Tom** — keep-current or club override? No statistical recommendation exists
   at 1 Jul (2 established in C, 3 needed).
2. **Fatch** — same question at 1 Aug (1 established in C).
3. **Reliability treatment** for all three. There is no recommendation to give:
   `reassessment.js` returns null by design because no validated method exists
   for a reliability change on a tier move. Leaving it untouched keeps the
   evidence each player earned, which is the conservative reading, but it is a
   board choice.

Once those three answers arrive the tool applies them directly — no further
build is needed.

### CCode — 18 Sep 2026 (Phase A built; Phase B dry run needs two answers)
`62347ea` and `17ed790` on `main`. 224/224 tests. **Nothing historical has been
written and nothing will be until Shaun confirms.**

**Phase A is done and usable for today's review.** A tier change cannot be
recorded until the board answers the rating question: accept the recommendation,
club override, keep the current rating, or correct the initial classification.
Keeping the current rating is recorded as its own event — a decision that leaves
no trace is indistinguishable from the omission the rule exists to prevent.
Correcting an initial classification is one event, not a promotion plus a
reassessment, and is offered only while the player is still provisional.

**The shared pre-review snapshot is not a nicety.** Reviewing Jams before Aubyn
does not merely shift Aubyn's number: moving Jams out of Tier C empties the pool
below the minimum and Aubyn would be offered **no recommendation at all**. The
snapshot is a function of the date, so two boards reviewing the same people on
the same day get the same answers.

**Two defects found while building Phase A, both fixed.** The snapshot read
classification status off the latest event, and match updates carry none, so
every player came back unclassified and the initial-classification path was
silently closed to everyone. And **recording a real promotion broke the next
page load** — tier history was validated against the seed's frozen three-entry
list, which a new promotion contradicts. Tier history now comes from the record.
That is precisely the class of problem this task was raised to prevent, and it
would have hit on the first promotion recorded today.

---

## PHASE B DRY RUN — SHAUN, TWO ANSWERS NEEDED

Full report: **`HISTORICAL_REVIEW_DRYRUN.md`** (regenerate with
`node scripts/historical-review-dryrun.js`). Summary:

| Player | Date | Treated as | Proposed rating | Reliability |
|---|---|---|---:|---|
| Shaun | 1 Jul | `INITIAL_CLASSIFICATION_CORRECTION` | **1400.0** (board-fixed B baseline) | unchanged (33%) |
| Tom | 1 Jul | Promotion, statistically reassessed | **no recommendation** | unchanged (29%) |
| Fatch | 1 Aug | Promotion, statistically reassessed | **no recommendation** | unchanged (58%) |

**1. The statistical reassessment declines to recommend anything for Tom or
Fatch.** The brief asks what the system *would have produced* at their review
dates; the answer is nothing. Tier C held too few **established** players to
place a boundary — 2 for Tom, 1 for Fatch, against a minimum of three either
side. The module refuses rather than inventing a target from a thin pool, which
is the behaviour Shaun approved when the threshold was set. That is a real
answer, not a gap. It means the honest record for both is a promotion plus
**keep the current rating**, unless the board prefers a club override. **CCode
has not chosen between those — it is exactly the decision the new workflow
exists to capture.** Neither is silently re-seeded to 1400.

**2. Reliability has no recommendation to give.** `reassessment.js` returns
`recommendationReliability: null` by design: no validated method exists for
recommending a reliability change on a tier move. The proposals leave it
untouched, keeping the evidence each player earned. For Shaun that is worth a
moment — his rating is corrected to a baseline as though the estimate restarted,
while his five June matches of evidence stay. Both readings are defensible.

**Blast radius, measured by replaying rather than predicted:** 29 of 34 players
end on a different Power Rating. Shaun **+203.6 → 1382.3**; everyone else within
10 points. Tom and Fatch move slightly despite no rating decision, because
Shaun's corrected rating changes the expectations in matches they played
alongside him.

**Baton → Shaun.** Confirm the Shaun correction, choose keep-current or override
for Tom and Fatch, and answer the reliability question. CCode writes nothing
until then.

---

### CGPT — 18 Sep 2026 (historical reassessment + today's promotion workflow)
Shaun clarified a factual distinction that changes how the historical record
should be represented. Shaun entered C only because his level was unknown; at
the 1 Jul review the club concluded the initial classification was wrong and
would use the **normal B baseline of 1400**. Preserve June exactly, then record
an `INITIAL_CLASSIFICATION_CORRECTION` on 1 Jul rather than pretending he had
entered B from day one.

Tom (1 Jul) and Fatch (1 Aug) were genuine C→B promotions. They should not be
rebased automatically to 1400; calculate the historical statistical
reassessment the current recommendation mechanism would have produced at each
review date. CCode must report Tom/Fatch's proposed rating/reliability and
Shaun's proposed reliability before any historical writes.

Going forward, a tier change review is incomplete until the board explicitly
chooses Accept recommendation / Club override / Keep current rating. Initial
classification correction remains a distinct path. When several players are
reviewed on one date, recommendations come from one shared pre-review snapshot
so processing order cannot change another player's recommendation.

**Baton → CCode.** Implement the future workflow first so today's promotions can
be processed correctly; then produce the historical dry-run plan. Do not write
the three historical reassessments until Shaun confirms the reported numbers.

### CGPT — 17 Sep 2026 (latest, monthly presentation reconciliation)
Read CCode's monthly UI handoff and inspected the published commit/source.
The implementation is on `main` at `05f6cd4`; the Ledger's `4cf819e` reference
does not resolve through GitHub. Corrected the active commit references without
changing historical handoffs. CCode's 122/122 and browser results remain reported
verification, not a fresh CGPT test run.

The monthly presentation is substantially built, but within-tier movement is
assigned to a row field without being displayed. Start/end ratings and overall
ranks appear only in positive-mover highlights, so the full agreed per-player
movement presentation still needs completion. NEXT now distinguishes that
bounded finish from rebuilding the monthly UI.

**Baton → Claude Code:** finish NEXT #1, verify the agreed monthly views, then
take the real Rating Journey UI. No new product decision from Shaun is required.
Keep the already-approved hiding of inert Edit/Delete controls in the queue;
historical editing remains unavailable until replay-forward. No application
changes or new release-scope decisions were made in this CGPT pass.

### CCode — 17 Sep 2026 (Real Rating Journey UI shipped)
`bd47757` on `main`. 140/140 tests (12 new). The profile Rating Journey now
replays persisted `ratingJourney` events instead of reconstructing a sequence
from `MATCHES`. The reconstruction and the "Story estimate — official Power
Rating is X" disclaimer are deleted from the source; a test fails if either
returns. Verified in-browser across all 34 players with zero page errors, and
the empty, failed-read and no-events states were each exercised for real rather
than reasoned about.

New module `assets/js/journeyView.js` is pure and Node-testable. Tests hold
that the journey's last point equals the Power Rating for every player, that
each event starts where the previous one finished, that same-day state events
precede that day's matches exactly as the engine applies them, that tier events
carry **zero** rating and **zero** reliability movement, and that April/May can
never enter a journey.

Three presentation rules worth recording, because they are the difference
between a truthful screen and a plausible one:
* A tier change is drawn as a dashed annotation on the line, never a plotted
  point, and states "Power Rating unchanged at N". A promotion must never read
  as points earned.
* A club reassessment is a distinct marker and names itself a club decision,
  with its reliability change shown. It must never pass as match play.
* Match rows say "performance score 0.29 against 0.33 expected" rather than a
  percentage of games. The score is 80% games won + 20% the result — a different
  quantity from the game-share figures on the cards below. The first draft said
  "delivered 29%" directly above a card reading "actually took 36%"; both were
  correct and the screen still read as a contradiction. Changed before shipping.

Per-match rating changes on profile cards are now the engine's own per-player
delta, keyed by match id. The month-scoped variant is gone: the rating is
continuous, so a match moved it by exactly one amount.

**No extra Firestore read was needed.** The brief anticipated targeted player
reads; `V3_JOURNEY` is already resident for the monthly views, so the profile
journey costs nothing. Open Question 1a's review trigger is unchanged.

**Two findings raised, not fixed — Open Questions 6 and 7.** Question 6 is a
conflict with a standing constraint (expectations recomputed in the browser on
every match card) and carries a product question CCode should not answer alone:
in v3 a match moves each of four players by a different amount, so the card's
"+X for winners · −X for losers" line has no v3 equivalent and the card needs
redesigning. Question 7 is the last remaining reconstruction. Both were left out
of this task deliberately: each spans screens outside the Rating Journey, and a
half-fix would put two different expectation figures on screen at once.

**Baton → CGPT.** Requested: a view on whether Questions 6 and 7 are scheduled
ahead of Kings of Tiers, given that 6 breaches a standing constraint. CCode will
otherwise take NEXT #1 (Kings of Tiers) on the next `Ledger CCode`.

### CCode — 18 Sep 2026 (Kings of Tiers on historical tier — and a defect under it)
`6fd7a1c` on `main`. 147/147 tests (7 new). Verified in-browser across all 20
month × tier-filter combinations: no placeholder leaks, zero page errors.

**The task as scoped.** Kings of Tiers, the rankings podium and the tier filter
now scope tier to the selected month through one `tierInScope()` helper, so the
three cannot disagree. In a month view it returns the tier held at that month's
close — the same tier the within-tier ranks already use. June's Tier C king was
previously **missing entirely**: all three players who were Tier C that month
have since been promoted, so Tier C's June field was empty and the card showed a
dash. It now reads Shaun 1137, with a note saying he is Tier B today, because a
past king in a tier he no longer holds is not a mistake and the panel should
not leave the reader assuming it is.

**The defect underneath — worth CGPT's and CChat's attention.** `MONTHLY_VIEWS`
was built with `TierHistory.create({ currentTiers: TIER_MAP })`, and `TIER_MAP`
is still `{}` at that moment: `loadV3State()` runs before
`rebuildMapsFromState()` populates it. `tierAsOf()` therefore returned
`undefined` for every player outside the three-entry authoritative change list.
**Every historical tier, within-tier rank and `tierChanged` flag in the shipped
application was missing**, from `05f6cd4` onward. In the browser, June resolved
3 of 22 rows; in Node, where the tests pass a complete tier map, all 22 resolved
and every test passed.

Two things let it hide, and both are now closed:
* An empty map reads as "no opinion" rather than an error. `TierHistory.create()`
  now refuses an empty `currentTiers` outright.
* The one guard that could have caught it — comparing a change-list player's
  current tier against the end of their history — skipped players whose current
  tier was `undefined`. That skip is now an error.

**Method note, because this is the second time it has bitten.** The tests were
green throughout; they exercised the data layer with correct inputs while the
application supplied wrong ones. The regression guards added here are therefore
source-level assertions about the wiring, and both were checked against the old
code to confirm they fail there. Unit-testing a module does not test how the
application calls it.

**Also corrected:** the monthly stories panel described Monthly Performance as
"what drives the podium and Kings of Tiers". Both rank on rating. Same failure
mode already recorded twice — retiring a calculation does not retire the
sentence describing it.

**New Open Question 8:** Manny is Tier **S**. The Kings panel hardcodes A/B/C
and the tier filter offers A/B/C, so he appears in neither. Left alone: whether
Tier S is real, legacy or an error is Shaun's call.

**Baton → CGPT.** Questions 6 and 7 are still unsequenced and Question 8 is new.
Absent a steer, CCode takes Questions 6 and 7 next on `Ledger CCode`.

### CCode — 18 Sep 2026 (last two reconstructions retired)
`19ffe21` on `main`. 157/157 tests (10 new). Verified in-browser across profile
cards, Games cards, draws, the Monthly Rating breakdown, the head-to-head month
view, every month and every tier filter — zero page errors.

**Open Questions 6 and 7 are resolved.** New pure module `matchFacts.js` indexes
what the engine recorded for all 150 matches: each player's pre-match rating,
the expectation used, the score delivered, the K applied, the points moved.
`enrichMatches` reads that instead of deriving a logistic from today's ratings,
so every consumer — cards, aggregates, upset flags, CSV export — became correct
without being individually rewritten.

Worth knowing beyond the two questions as written:
* The old expectation was not merely forbidden, it was **unstable**. Being
  derived from current ratings, the same June match reported a different
  expectation every time anybody played. Nobody would have noticed.
* "Rating impact" on each card was invented outright: 84 × overperformance with
  a neutral band. No engine ever produced it.
* The Monthly Rating breakdown showed a **real** month-end rating underneath a
  fabricated explanation ("solved every player's rating jointly… K=28, 300
  passes"), sitting directly below a paragraph correctly stating the rating
  never resets. Both were on screen at once.
* Ratings printed beside a past match were today's ratings. They are now the
  ratings that played it, so "favoured by 126 pts going in" is a statement about
  that day. Upsets are settled the same way and no later month can change one.
* The profile match card and the Rating Journey now print the same performance
  score for the same match. They previously could not.

**New Open Question 9:** match cards now show four per-player rating changes
instead of one team figure. Visible change, no other truthful option, but it is
Shaun's to look at.

**New Open Question 10 — a pattern, not an incident.** The Games view claimed a
draw "doesn't affect any rating". Draws are rated; one moved a player by 10.25
points. That is the fourth stale sentence found after its calculation was
retired. Suggest treating copy that describes engine behaviour as code.

**Baton → CGPT.** NEXT is now the reassessment write path. Questions 8, 9 and 10
are for Shaun and do not block it.

### CCode — 18 Sep 2026 (club decision write path + Admin Monthly Review)
`2a61943` on `main`. 174/174 tests (18 new). Verified end to end in a browser
against a stubbed Firestore: refusals fire, zero writes occur before
confirmation, a confirmed decision writes both documents in the right order, and
the re-read shows the new rating.

**This is the application's first write of a rating**, so the rules live in
`clubDecision.js` — a pure module — not in the screen. A screen can be bypassed.
Refused outright, not warned about: backdating over existing history (there is no
replay-forward, so the stored ratings would stop following from the stored
events), future-dating, a tier move carrying points, a rating reassessment
carrying a tier, reliability outside [0, 1), a decision with no attribution, and
a same-day duplicate that deterministic ids would otherwise silently overwrite.

**Nothing is deleted, ever.** A decision is undone by recording a reversal, so
both remain in the ledger. That is what "forward-only and audited" means in
practice, and `reversalOf()` builds it — reversing a tier move as the opposite
tier move, carrying no points.

**Write ordering is deliberate.** Two documents, no transaction available. The
journey event goes first, because the journey IS the history and a replay
reproduces the player document from it; a failure after the first write is
recoverable and says so, and tells the operator not to record it again. The
reverse order could leave a rating with nothing explaining it.

**The trust model is on the screen, not implied.** `isUnlocked` is a UI gate,
not a security boundary; beta storage is open by decision, so attribution
records intent, not identity. Said in those words in the UI.

**One consequence handled here because it only became reachable now.** With
reassessments possible, monthly Rating Movement could show a rating that moved
by decision as a month's form. Rows now carry `reassessmentChange` and the
stories panel says "(+40 by club decision)" where it applies. Until this commit
that distinction was 0 for everyone, which is why it had never surfaced.

**New Open Question 11 — needs a decision before replay-forward.** A stored
event replays evidence through reliability and loses a last bit. Harmless today
(K unchanged, no compounding, nothing replays stored events yet) but
replay-forward will replay these documents for real. The fix is one line of
engine code; the engine is frozen, so it is recorded as a passing `KNOWN:` test
and left for Shaun/CGPT rather than applied.

**Baton → CGPT.** NEXT is beta diagnostics and the beta reset workflow.
Questions 8, 9 and 11 are for Shaun; only 11 has a deadline (before
replay-forward).

### CCode — 18 Sep 2026 (beta diagnostics + reset workflow)
`7dcdd2e` on `main`. 187/187 tests (13 new). Verified in the browser; the reset
dry run against the live beta reports 0 documents outside the baseline.

**Diagnostics reads the database itself**, not the application's in-memory
copies — a check run against what the app already believes would agree with a
bad transformation on the way in. That makes "what the app shows is what is
stored" a real comparison of two objects reached by different paths. Tampering
with a stored rating was caught independently by that check and by the
state-vs-history check.

It **walks** recorded values and never re-runs the engine. A check that
recomputes what it is checking can only detect a bad engine, not a bad write.
It reports and never repairs, because a diagnostic that quietly fixed things
would destroy the evidence.

Nine checks: unique ids, chain continuity, stored state = end of history,
evidence vs last match, match/event coverage both ways, orphans on either side,
no pre-June data, one schema version, app agrees with store. Each has a test
that breaks the record one specific way — a diagnostic that only ever passes is
decoration.

**Open Question 1a measurement recorded**, as that exception requires: 633
events, 633 documents per session, ~160 events/month, review point 5000 (~28
months). Not due; no change proposed. The screen reports it live so the next
review is a reading, not an investigation.

**Reset is a script, not a button.** What the seed cannot do is remove what it
does not own: club decisions survive a re-seed and keep affecting ratings.
Resetting destroys every decision ever recorded and is not recoverable from
inside the app. So: dry run by default, printing every document it would delete
with what it did to a rating and who recorded it; `--write` AND `--i-mean-it`
required, because `--write` alone is the harmless flag every other script here
uses; project id taken from the seed constant with no flag to redirect it; and
a full diagnostics pass afterwards that fails loudly rather than reporting
success it has not checked.

Backends gained `remove()`. **Nothing in the UI calls it and a test enforces
that** — the record is forward-only, and a decision is undone by recording a
reversal.

**Baton → CGPT.** NEXT is replay-forward. **Open Question 11 should be decided
first** — it is the one-line engine precision fix, and replay-forward is exactly
the thing that will replay those documents for real.

### CCode — 18 Sep 2026 (replay-forward, and the blocker it uncovered)
`8d65edc` on `main`. 202/202 tests (16 new). Verified end to end in the browser.

**The headline is not replay-forward.** Starting it uncovered that **the beta
could not record a game at all** (Open Question 13): approving a submission set
a status in browser storage that nothing has read since the match source moved
to the `matches` collection, so the game vanished and was never rated. That is
now fixed — approving plans an append, shows which four players move and by how
much, and writes on confirmation.

**Replay-forward** rebuilds the engine inputs from the record, applies the
change, and replays everything. Full re-derivation rather than a partial replay
from a midpoint: every input is stored, so this is exact and has no
partial-state bookkeeping to get subtly wrong. Appending costs 9 documents and
4 players; editing one June match rewrites 634 and moves all 34 — and the plan
says so before anything is written.

**Its foundation is `verifyNoOp`** — replaying with no change must reproduce the
record — and it is a precondition of planning any real change. It earned that by
failing three times, each a real defect that reasoning had not caught:
* Initialisations rebuilt without `classificationStatus`. The engine defaults it
  to ESTABLISHED, so every provisional player was silently promoted.
* The diff compared serialised JSON, so Firestore's key order made all 817
  documents look changed.
* **Open Question 15:** Node and the browser differ in the last bit of
  `Math.pow`, so exact equality could never hold across the two.

**Open Question 11 is now lower urgency (Open Question 16).** Replay-forward
replays *intent* — an event is replayed as changing reliability only if it did —
so it routes around the round-trip loss without pre-empting Shaun's decision.

**Open Question 14 closed:** the inert Edit/Delete controls are gone, as
approved long ago. They were worse than inert — a confirmed delete persisted an
overlay and changed nothing.

**Baton → CGPT.** There is no implementation item left in NEXT that CCode can
start on its own. See Section 8: what remains needs a product decision.

### CCode — 18 Sep 2026 (UI regression suite + comparison report)
`291f69b` and `701890d` on `main`. 214/214 tests.

**The UI had no tests at all.** Every defect found during this integration —
historical tiers coming back `undefined`, expectations recomputed from today's
ratings, a modal describing a retired solver, approving a game making it vanish,
a confirmed delete persisting an overlay and changing nothing — was found by a
person driving a browser. None could have been caught by the module tests,
because **every module was correct in isolation and the application wired them
up wrongly.** That is the gap this closes.

Eleven tests boot the real page against a stub built from the same backfill the
seed writes, so the fixture cannot drift from the record. **Verified by
reintroducing three of the original defects: eight of the eleven went red.**
They skip rather than fail without Playwright — a suite that goes red for an
absent dependency teaches people to ignore red.

**The comparison report has a headline the raw numbers hide.** The three largest
differences are settled before a ball is struck: v3 seeds from the tier that was
true when a player first played, production from the tier they hold now, and
Shaun, Tom and Fatch were all corrected C→B. Excluding those three, the mean
absolute difference falls from **31.9 points to 18.4** across the other 31
players. The report leads with why the two systems are *not supposed to agree*,
carries the known caveats (17 of 34 match counts differ, every `player_id` is
null, the snapshot is frozen at 2026-09-16), and ranks the six explanations for
a large difference by how often each is the answer. A test regenerates it and
fails if the committed file has drifted.

**Baton → CGPT.** Only screenshots remain of the old "not built" list, and they
need a decision about what they are for. Everything else in Section 8 is a
product call.


### CGPT — 17 Sep 2026 (latest, Open Question 1a resolved)
On Shaun's behalf, accepted the current once-per-session cumulative
`ratingJourney` read, cached for the session, for Ranking Movement while the
journey remains small. Historical all-player boundary ranks require prior state
for inactive players. Keep `players` as the normal current-state source and use
bounded historical reads where sufficient. Keep Ranking Movement; do not add a
snapshot collection yet. Section 2 records the future review trigger and CCode's
responsibility to raise it when size/read cost/latency becomes material.

**Baton → Claude Code: NEXT #1 Monthly UI presentation is approved and
unblocked, including Ranking Movement.** On `Ledger CCode`, reconcile and
proceed without another architecture decision from Shaun. Preserve all four
monthly stories and the existing performance/award rules; do not recreate a
monthly rating solver. This handoff is Ledger-only; implementation and the
reported 122/122 test result remain those of the last verified CCode work.
Earlier handoffs below are historical; this decision supersedes their pending
1a blocker and absolute prohibition on cumulative historical reads.

### CCode — 17 Sep 2026 (latest, monthly acceptance)
Closed the acceptance gaps on the monthly presentation and fixed two defects
found doing it.

**Invented rank movement.** A player who changed tier mid-month had their
within-tier rank change computed by subtracting a rank in one tier from a rank
in another. Now reported as not comparable, with both boundary ranks and the
tier change shown instead. The live dataset never hit this — the §5.3
promotions all fall on the 1st, so they align with month boundaries — but a
mid-month review would have produced a fabricated number.

**Missing boundary state.** Players who sat a month out had no row at all, yet
their rank moves when others move around them. `inactiveRows` now carries their
boundary state with rating change 0 and performance null (not zero). August has
5 such players, 1 of whom moved rank.

Presentation now shows fallers as well as risers, rank slides as well as climbs,
a "moved without playing" section, and a per-player monthly panel with rating
start→end, overall rank, within-tier rank, and performance — negative movement
rendered identically to positive.

**Two more stale labels removed.** The per-player section and
`MONTHLY_RATING_METHODOLOGY_TEXT` both still described the retired mini-season
solver, the latter telling players their rating resets to their tier seed each
month — the exact thing v3 abolished. A test now fails if that language returns.

Verified in-browser: Shaun July +37.3 pts while falling 4 places overall
(rating and rank diverging), June showing "not ranked at both ends" for his
first month, Fatch +15.9 pts falling a place, KC −1 pt gaining one. Zero page
errors, 128/128 tests. **Baton → Shaun.**

### CCode — 17 Sep 2026 (previous, monthly UI)
Monthly UI presentation built on the existing Rankings screen — no redesign, no
new nav destination. A monthly stories panel separates the four measures under
their own headings with a plain-English line each, and the ranking rows now carry
month-end rating, points moved and a rank arrow alongside performance.

The separation is visible in the data rather than only asserted: in August the
top performer (Erf +14.1%) is not the top riser (PDM +22.7 pts), and KC fell 1
point while climbing a place — rating and rank genuinely diverging.

**Fixed a misleading label:** the monthly methodology note still described "a
genuine tier-seeded rating using only this month's matches, as if it were its
own mini-season". That solver no longer exists. It now explains that the big
number is the one continuous Power Rating as it stood at month end, with points
moved and rank movement beneath it, and that performance is a separate question.

Ranking Movement uses the session-cached cumulative read per the resolved Open
Question 1a. Verified in-browser, zero page errors, 122/122 tests.
**Baton → Shaun.**

### CCode — 17 Sep 2026 (previous, monthly data layer)
Retired the legacy monthly solver. `computeMonthlyRating` is gone; `monthEndRatings`
returns the real Power Rating each player held at a month's close, read from the
journey. New `monthlyViews.js` builds all four monthly stories from one pass over
the real trajectory — no monthly solver exists and a test asserts none returns.

Verified: the final month's closing ratings are *identical* to live player state,
which is only possible if the view is derived rather than re-solved; a month opens
exactly where the previous closed; rank movement uses the tier in force at the
boundary (Shaun reads Tier C in June, B in July); the best performer and the
biggest riser are different players, so the two measures cannot be confused.
In-browser: 633 journey events, 4 months, 34 players, 23 August crossovers, zero
page errors. 122/122 tests.

**Raises Open Question 1a:** Ranking Movement cannot be satisfied by bounded
month-filtered reads, so the implementation currently does one cached
whole-journey read per session. Needs a decision. **Baton → Shaun.**

### CGPT — 17 Sep 2026 (latest)
Resolved CCode's NEXT #1 blocker. **Use filtered `ratingJourney` reads** for
historical monthly state. The old "normal rendering reads players" constraint
is clarified rather than discarded: `players` remains the compact source for
current state, while monthly historical views and Rating Journey may make
bounded month/player event queries. No full journey scan and no precomputed
monthly snapshots at this stage. Add the necessary Firestore index if required.
NEXT #1 is unblocked. **Baton → Shaun/CCode when Shaun issues `Ledger CCode`.**

### CCode — 17 Sep 2026 (latest)
**Blocker raised against NEXT #1 before starting** — now resolved above.
Monthly Rating Movement and Ranking Movement need month-boundary ratings, which
exist only in `ratingJourney`; recommended a month-filtered `ratingJourney`
query over precomputed snapshots.

Also corrected the CLAUDE.md protocol: it required conflicts to be "reported"
without saying where, and only triggered a Ledger update *after* an
implementation task. Conflicts and blockers now go into Open Questions the
moment they are found, since chat is invisible to CGPT and CChat.

### CGPT — 17 Sep 2026 (previous)
Shaun confirmed that replacing Monthly Power Rating must not remove the monthly
progress story. Added the four-part monthly model: Monthly Performance (versus
expectation), Rating Movement (real Power Rating start→end and points change),
Ranking Movement (overall/tier rank start→end plus crossovers), and League Table
(results/points). Monthly Performance remains the podium/Kings basis. Rating and
rank movement come from the actual Sequential-v1 trajectory; **no separate
monthly rating solver is to be recreated.** Also resolved the inert historical
Edit/Delete controls: hide until replay-forward exists.

### CCode — 17 Sep 2026 (previous, match source)
Switched `ALL_MATCHES` to the v3 `matches` collection, closing the 127-vs-150
divergence. September is now in the app (28 matches; history runs 2026-06-02 to
2026-09-15) and the five draws are carried as draws. Verified in-browser: 150
matches loaded, 145 decided, 34 players, **zero record reconciliation failures**
— Rishi now reads W38/L32/D2 = 72 against `lifetimeMatches` 72, where he
previously showed 56. Zero page errors. 110/110 tests.
**Discovered:** legacy match edit/deletion overlays are now inert.

### CCode — 17 Sep 2026 (earlier, read layer)
Built the v3 read layer (`v3Bridge.js`) and switched the `recomputeAll`
chokepoint: `PLAYERS[]` now hydrates from the persisted `players` collection.
Integrated the dated production snapshot as structurally-excluded read-only
reference. Removed the silent `1400` fallback; added an explicit "Power Ratings
unavailable" banner. Verified in a real browser — 34 players hydrate, zero page
errors — and the failure path confirmed working when Firebase is unreachable.
Commit `7e47fb9`, 104/104 tests.

### CChat — 17 Sep 2026
Reviewed and approved the specification. *Note: that approval predates the three
`RATING_MODEL.md` corrections, which now take precedence over the original
specification text.*

---

## 7. RECENTLY COMPLETED

| Commit | Work |
|---|---|
| `8600f1e` | Compact expanded Games card; `See full calculation` fixed (clicks were collapsing the card underneath) and unified across all three cards |
| `a0e3ead` | Game-share wording correction: matching the expectation is no longer called performing above it; capture script caches the live record |
| `3de23bf` | Plain-English rating explanations with the decimals behind a disclosure; Games given its own All-time month after finding it opened on August |
| `346ed66` | Play history: correction/removal controls collapsed behind a per-card Manage affordance, and absent for non-admins |
| `9de1a88` | Power Rating Guide in More, and "Why your rating moved" on the match card, read from persisted facts |
| `94c3983` | Production match-facts import applied: 7 new matches, 14 players moved, verified against a fresh re-read |
| `f974fea` | Reusable, idempotent production match-facts importer; `appendMany` on replay-forward |
| `e0fdcbc` | CGPT visual acceptance: all eight presentation fixes, plus a stored-vs-displayed score-orientation defect the new browser test caught |
| `7178544` | Review screenshots from the live record; Rating Journey correction display fixed (markers and copy now follow the delta, not the event type) |
| `0f7c2ed` | Three authorised historical club decisions applied to the beta; four defects fixed en route |
| `9cc3c13` | Historical Club Adjustment: Admin tool over replay-forward, superseding audited corrections |
| `17ed790` | Phase B historical dry run (`HISTORICAL_REVIEW_DRYRUN.md`); no write path |
| `62347ea` | Phase A: mandatory rating decision on every tier change; shared pre-review snapshot; tier history from the record |
| `701890d` | `COMPARISON_REPORT.md` and its generator; snapshot readable from Node |
| `291f69b` | UI regression suite — 11 browser tests over the defects that shipped |
| `8d65edc` | Replay-forward (`replayForward.js`); approving a game now rates it; inert Edit/Delete controls removed |
| `7dcdd2e` | Beta diagnostics (`betaDiagnostics.js`) and guarded reset workflow (`scripts/reset-beta.js`); backend `remove()` |
| `2a61943` | Club reassessment write path (`clubDecision.js`) and Admin Monthly Review; club-decision movement separated in monthly views |
| `19ffe21` | Last two reconstructions retired; `matchFacts.js`; per-player match deltas; draws shown as rated |
| `6fd7a1c` | Kings of Tiers / podium / tier filter on historical tier; fixed empty-TIER_MAP defect erasing all historical tiers |
| `bd47757` | Real Rating Journey UI: persisted events replace the reconstruction; "story estimate" disclaimer deleted |
| `707f6e8` | Monthly acceptance: tier-change rank guard, inactive boundary state, fallers/slides, stale methodology copy removed |
| `05f6cd4` | Monthly UI: four views presented; stale mini-season copy corrected |
| `717e9b4` | Legacy monthly solver retired; `monthlyViews.js` builds all four monthly views from the real trajectory |
| `e8d21f4` | Match history sourced from the v3 matches collection |
| `e967f39` | PROJECT_LEDGER.md migrated into the repository |
| `7e47fb9` | CLAUDE.md coordination protocol |
| `5a93378` | v3 read layer; `recomputeAll` switched to v3; production snapshot integrated |
| `1cb8ff4` | `RATING_MODEL.md`; pagination regression test |
| `c629ab4` | Firestore set-score encoding fix (nested arrays rejected) |
| `dea1acd` | `--limit` smoke-test flag for the seed |
| `ceb1b62` | v3 persistence, temporal tiers, beta backfill script |
| `aa9651e` | T2 reassessment recommendation module |
| `73a06ad` | Experiment 11 walk-forward regression |
| `d2063d3` | Stage 1 and Stage 2 validation against Experiments 11/12 |
| `b18add0` | `sequential-v1` rating engine |

Backfill of 817 documents to `mp-dashboard-beta-v3` verified against the plan:
0 missing, 0 malformed ids.

---

## 8. NEXT

1. **Separate Ranked / Idle / Inactive states** per Section 4.
2. Relabel current recent-activity non-qualifiers as **Idle** and update the
   divider copy.
3. Add an explicit participation-status path for true **Inactive** players if
   one does not already exist.
4. Add independent filter controls for including Idle and Inactive players.
5. Keep the 2+ matches / 30 days ranking rule unchanged.
6. Preserve all ratings/history; status changes are metadata only.
7. **Verify Ant Slice** against the rolling 30-day rated-match window. If he has
   2+ qualifying matches, fix the erroneous `#–` rank state.
8. Centralize eligibility/rank availability so Home, Rankings, Profile and Club
   Pulse use one shared helper and cannot disagree.
9. Add browser/regression coverage for Ranked, Idle, Inactive, filters and
   cross-surface consistency.
10. Update Ledger with commit/tests and baton back to CGPT/Shaun.
