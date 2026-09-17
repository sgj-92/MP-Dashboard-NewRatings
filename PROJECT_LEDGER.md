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
| Last verified implementation commit | `bd47757` |
| Tests | **140 / 140 passing** |
| Firebase (beta) | `mp-dashboard-beta-v3` |
| Firestore | 150 matches · 633 journey events · 34 players = **817 docs** |
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

**Still legacy — two reconstructions remain, both newly specified in Open
Questions 6 and 7:** `computeMonthlyJourney` (legacy joint solver, restarts each
player at their tier seed) and `enrichMatches` expectations (recomputed in the
browser). The legacy monthly solver is **retired** — `computeMonthlyRating` no
longer exists; all 11 call sites now read real month-end Power Ratings via
`monthEndRatings`.

**Not built:** Kings of Tiers on historical tier ·
Admin Monthly Review · reassessment write path (`applyClubDecision` does not
exist; only the read-only recommendation) · beta diagnostics screen · beta reset
workflow · replay-forward for historical edits · UI regression tests · final
comparison report and screenshots.

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

**Club reassessment:** forward-only and audited; never rewrites history. Two
modes — recommended statistical reassessment, and explicit club override of
rating *and* reliability. Promotion/demotion and rating reassessment are
separate events.

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
| Historical monthly reads use filtered `ratingJourney` queries where sufficient | The `players`-first rule applies to current-state rendering, not to historical data that `players` cannot contain. Bounded month/player queries remain the default, subject only to the Ranking Movement exception below. No monthly snapshot collection for now. |
| Accept session-cached cumulative reads for Ranking Movement while the journey is small | Shaun/CGPT, 17 Sep 2026: resolve Open Question 1a by accepting the current once-per-session cumulative `ratingJourney` read, cached for the session. Historical all-player ranks need prior state for inactive players. Keep Ranking Movement; no snapshot collection yet. Reopen when journey size, read cost or latency becomes material, including anticipated import/backfill growth; see Section 2. |

---

## 4. CURRENT TASK

**Owner / baton: Claude Code.** The Real Rating Journey UI is complete
(`bd47757`). Next unblocked item is Kings of Tiers on historical tier.
On `Ledger CCode`, reconcile repository state and start the first approved,
unblocked item without another Shaun decision.

**Needs a look from CGPT/CChat before it is built on:** Open Questions 6 and 7
below record the last two places in the application that still present a
reconstruction. Question 6 is a **standing-constraint conflict**, not a
preference — the constraint says historical expectations are never recomputed in
the browser, and `enrichMatches` does exactly that on every match card. Both are
now read swaps rather than calculations, because the authoritative figures are
persisted for every rated match.

Open Question 1a remains resolved. Preserve the small-journey session cache
exception and review trigger, the frozen engine, and all four distinct monthly
concepts.

---

## 5. OPEN QUESTIONS / DECISIONS

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
6. **Standing-constraint conflict: expectations are still recomputed in the
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
7. **`computeMonthlyJourney` still runs the legacy joint solver.** It restarts
   every player from their tier seed, which v3 does not do — there is one
   continuous rating and no monthly reset. Live in two places: the Monthly Rating
   breakdown modal and the head-to-head month view, the latter still telling the
   reader "Each player starts the month at their tier baseline." These are the
   last screens in the app showing a reconstruction. The four monthly views in
   `monthlyViews.js` already carry the real figures.

---

## 6. HANDOFFS

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

1. Kings of Tiers on historical tier — the monthly data layer already exposes
   historical tier per row, so this is presentation.
2. **Retire the last two reconstructions — Open Questions 6 and 7.** Swap the
   browser-recomputed match expectations for the persisted
   `preMatchExpectedScore`/`ratingDelta` (Q6, a standing-constraint conflict,
   and it requires a card redesign because K is per-player), and replace
   `computeMonthlyJourney` in the Monthly Rating breakdown modal and the
   head-to-head month view (Q7). **Sequencing against item 1 is CGPT's call.**
3. Reassessment write path (`applyClubDecision`) and Admin Monthly Review.
4. Beta diagnostics and beta reset workflow.
5. Replay-forward — **required before any historical editing UI is exposed.**
   Hiding inert Edit/Delete Match controls is already approved and must not
   wait for replay-forward; restore them only when historical editing works.
