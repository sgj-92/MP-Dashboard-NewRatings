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

**Reading this file is not an instruction to start coding.** `SYNC` = read and
reconcile · `REVIEW` = analyse or challenge · `WORK` = make changes.

---

## 1. CURRENT STATE

The v3 engine, persistence layer, historical backfill and validation are
complete and verified. The first UI integration is done: the application's
rating chokepoint now reads v3 persisted state.

| | |
|---|---|
| Branch | `main` |
| Last verified implementation commit | `e8d21f4` |
| Tests | **110 / 110 passing** |
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

**Still legacy:** monthly ratings (`computeMonthlyRating`, 9 call sites — note
the default Rankings view still *leads* with this number), `computeMonthlyJourney`,
`computePlayerJourney` (a self-declared "story estimate"), and `enrichMatches`
expectations.

**Not built:** Rating Journey UI · Monthly Performance UI · Kings of Tiers ·
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
required. These must be bounded/filtered reads (for example by month and/or
player), never a full 633-and-growing collection scan for ordinary page render.
For the current monthly pass, use a month-filtered `ratingJourney` query and add
the required Firestore index on `effectiveDate` if necessary. Do **not** add
precomputed monthly snapshots yet; they duplicate derived state and would add
replay maintenance before replay-forward exists.

**Club reassessment:** forward-only and audited; never rewrites history. Two
modes — recommended statistical reassessment, and explicit club override of
rating *and* reliability. Promotion/demotion and rating reassessment are
separate events.

**Storage:** `matches/{matchId}` · `ratingJourney/{eventId}` · `players/{playerId}`.
Normal current-state rendering reads `players`; historical views use targeted
`ratingJourney` reads as defined above.

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
| Historical monthly reads use filtered `ratingJourney` queries | The `players`-first rule applies to current-state rendering, not to historical data that `players` cannot contain. Use bounded month/player queries; no full collection scans and no monthly snapshot collection for now. |

---

## 4. CURRENT TASK

**Owner: Shaun.** No implementation work in progress. **NEXT #1 is now unblocked**:
CGPT resolved the month-boundary read strategy in favour of filtered
`ratingJourney` queries.

**Completion of the previous task** (Claude Code): `ALL_MATCHES` switched to the
v3 `matches` collection; record and rating now derive from one history,
verified in-browser and by regression test.

**Next approved product scope** (CGPT/Shaun): the Monthly Performance pass also
preserves monthly Rating Movement and Ranking Movement/crossovers from the real
Sequential-v1 trajectory, alongside the existing League Table. This is not
permission to recreate `computeMonthlyRating` or another monthly solver.

---

## 5. OPEN QUESTIONS / DECISIONS

1. **RESOLVED — monthly historical read strategy.** Use a month-filtered
   `ratingJourney` query (and the required Firestore index if needed). Section 2
   is amended: `players` remains the normal current-state read source;
   `ratingJourney` is allowed for bounded historical views. No precomputed
   monthly snapshots for now.
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

---

## 6. HANDOFFS

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

1. Monthly Performance from persisted expectations; retire
   `computeMonthlyRating`. In the same pass, preserve the monthly progress story:
   - real Power Rating start → end and points gained/lost;
   - overall and within-tier rank start → end;
   - meaningful player crossovers where practical;
   - existing League Table remains the results/points view.
   Monthly Performance drives podium/Kings; movement views are complementary.
   **Do not create another monthly rating solver.** Historical state should use
   a bounded month-filtered `ratingJourney` query, never a full collection scan.
2. Real Rating Journey UI (replaces `computePlayerJourney` and its "story
   estimate" disclaimer).
3. Kings of Tiers on historical tier.
4. Reassessment write path (`applyClubDecision`) and Admin Monthly Review.
5. Beta diagnostics and beta reset workflow.
6. Replay-forward — **required before any historical editing UI is exposed; hide
   inert Edit/Delete Match controls until then.**
