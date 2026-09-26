# Best Month — analysis of candidate measures (September 2026)

> **Implemented as a trial (26 Sep 2026, `25191b8`)** — the Power-Rating-stakes
> monthly race approved in Ledger NEXT #15i is live at League → View → Monthly
> Race. It reproduces the race tables below exactly in order; scores differ by
> at most 0.23 because each match is settled to 0.1 so the drill-down adds up.
> The analysis itself is kept as written.

**Status: analysis only.** Nothing in the app, the engine (`sequential-v1`),
the record, League, Merit or Monthly Performance was changed. Requested by
Shaun, 26 Sep 2026. Author: CCode.

**Question:** *who was actually the best player in their tier this month?*
It is meant to differ from League (cumulative results), Merit (cumulative,
difficulty-adjusted), Monthly Performance (beating your own expectation) and
Power Rating (overall strength).

**Data.** A read-only snapshot of the live beta taken 26 Sep 2026, 04:10 UTC:
169 matches, 728 journey events and 34 players. September has **48 matches
(1–25 Sep), all doubles, 8 draws, 192 player-appearances.** Every match is
filed under the tier the player held **on its date** (the canonical
`TierHistory` resolver, i.e. the League/Merit split-month rule). The D column
reproduces the engine's own `calculateMonthlyPerformance` to within 2×10⁻¹⁷.

---

## The candidates

| | Measure | Per player-month |
|---|---|---|
| **A** | Raw win % | (W + ½D) / P |
| **B** | Merit per game | existing Merit points ÷ P (3 per even win, ±1 per tier-step, draws and losses 0) |
| **C** | Wins vs *own* expectation | mean(result − p), where p = the player's own pre-match chance of winning from both pairs' persisted pre-match ratings |
| **D** | Monthly Performance | mean(actualScore − preMatchExpectedScore), the existing definition, unchanged |
| **E** | **Wins above par** (Best Month candidate) | Σ(result − par) ÷ (P + 8) |

**Par** is the chance that an *average player of that tier* would have won the
same match: the same partner, the same opponents and the same pre-match
ratings, with only the player's own rating swapped for the tier's average
(the mean month-opening rating of the players who played in that tier:
A 1667, B 1381, C 1102). "Wins above par" is the total of (result − par).
The **+8 cushion** counts eight extra "par" games in the divisor. It stops a
hot handful of games topping the table without turning the award into a
volume contest (see *Incentives*).

**Win chance used by C and E.** The engine's pre-match expectation predicts a
blended score (80% game share), not who wins, and it is deliberately less
extreme than win probability. Across the whole record, favourites win
**84%** of the matches where it predicts ~74%, and **72%** where it predicts
~67%. C and E therefore use the same Elo formula on the same persisted
pre-match ratings, with the scale refitted to results (**250** instead of the
engine's 400, the best fit to all 161 decided matches). The engine itself is
untouched. This matters: see finding 1.

---

## September tables

`P · W-D-L · win% · Avg opp` (average opposing pair's pre-match rating) `· Par
win chance` (fixture difficulty: how often an average player of the tier would
win these matches). Each method's value is followed by its rank among
qualifiers (P ≥ 5). *prov.* = provisional, below 5 matches, shown but not
ranked. E shows total wins above par · score.

### Tier A

| Player | P | W-D-L | Win % | Avg opp | Par win chance | A Win% | B Merit/g | C vs own exp | D Mthly Perf | E Above par · score |
|---|---|---|---|---|---|---|---|---|---|---|
| Erf | 5 | 5-0-0 | 100% | 1585 | 58% | 100% (#1) | 2.60 (#1) | +0.35 (#1) | +7.3 (#1) | +2.1 · +0.16 (#1) |
| KC | 9 | 6-0-3 | 67% | 1567 | 46% | 67% (#3) | 2.00 (#2) | +0.17 (#2) | +4.9 (#3) | +1.9 · +0.11 (#2) |
| Osh | 16 | 8-3-5 | 59% | 1589 | 45% | 59% (#5) | 1.50 (#3) | +0.11 (#3) | +5.1 (#2) | +2.4 · +0.10 (#3) |
| Len | 16 | 10-3-3 | 72% | 1516 | 65% | 72% (#2) | 1.31 (#4) | +0.05 (#4) | +1.3 (#4) | +1.1 · +0.04 (#4) |
| Rishi (from 20 Sep) | 5 | 2-2-1 | 60% | 1607 | 64% | 60% (#4) | 1.00 (#5) | −0.01 (#5) | −7.8 (#7) | −0.2 · −0.01 (#5) |
| Kaz | 10 | 2-3-5 | 35% | 1618 | 43% | 35% (#7) | 0.50 (#7) | −0.16 (#6) | −6.4 (#6) | −0.8 · −0.04 (#6) |
| Eli | 10 | 3-2-5 | 40% | 1597 | 59% | 40% (#6) | 0.60 (#6) | −0.17 (#7) | −6.2 (#5) | −1.9 · −0.11 (#7) |
| Ant Slicer (to 19 Sep) | 5 | 0-1-4 | 10% | 1513 | 65% | 10% (#8) | 0.00 (#8) | −0.53 (#8) | −28.4 (#8) | −2.7 · −0.21 (#8) |
| Denis *(prov.)* | 4 | 2-0-2 | 50% | 1601 | 53% | 50% | 1.25 | −0.04 | −2.4 | −0.1 · −0.01 |

- A: Erf > Len > KC > Rishi > Osh > Eli > Kaz > Ant Slicer
- B: Erf > KC > Osh > Len > Rishi > Eli > Kaz > Ant Slicer
- C: Erf > KC > Osh > Len > Rishi > Kaz > Eli > Ant Slicer
- D: Erf > Osh > KC > Len > Eli > Kaz > Rishi > Ant Slicer
- **E: Erf > KC > Osh > Len > Rishi > Kaz > Eli > Ant Slicer**

### Tier B

| Player | P | W-D-L | Win % | Avg opp | Par win chance | A Win% | B Merit/g | C vs own exp | D Mthly Perf | E Above par · score |
|---|---|---|---|---|---|---|---|---|---|---|
| Rishi (to 17 Sep) | 21 | 10-3-8 | 55% | 1564 | 37% | 55% (#4) | 1.52 (#1) | +0.11 (#1) | +5.5 (#1) | +3.8 · +0.13 (#1) |
| PDM | 16 | 7-2-7 | 50% | 1525 | 38% | 50% (#5) | 1.25 (#3) | +0.05 (#4) | +4.4 (#2) | +1.9 · +0.08 (#2) |
| Antz | 8 | 5-1-2 | 69% | 1440 | 54% | 69% (#1) | 1.50 (#2) | +0.10 (#2) | +4.0 (#3) | +1.1 · +0.07 (#3) |
| Tom | 9 | 5-2-2 | 67% | 1401 | 60% | 67% (#2) | 1.22 (#4) | +0.07 (#3) | −0.2 (#5) | +0.6 · +0.04 (#4) |
| Rocky | 5 | 3-0-2 | 60% | 1371 | 56% | 60% (#3) | 1.20 (#5) | +0.02 (#5) | +0.1 (#4) | +0.2 · +0.01 (#5) |
| Max | 10 | 2-1-7 | 25% | 1478 | 33% | 25% (#8) | 0.60 (#7) | −0.11 (#7) | −0.5 (#6) | −0.8 · −0.05 (#6) |
| Stormz | 7 | 2-0-5 | 29% | 1485 | 46% | 29% (#7) | 0.71 (#6) | −0.19 (#8) | −7.8 (#8) | −1.2 · −0.08 (#7) |
| Jords | 14 | 3-3-8 | 32% | 1493 | 47% | 32% (#6) | 0.57 (#8) | −0.11 (#6) | −5.5 (#7) | −2.0 · −0.09 (#8) |
| Omar *(prov.)* | 1 | 1-0-0 | 100% | 1375 | 52% | 100% | 3.00 | +0.45 | +23.5 | +0.5 · +0.05 |
| Fatch *(prov.)* | 4 | 2-0-2 | 50% | 1435 | 44% | 50% | 1.50 | +0.06 | +4.8 | +0.2 · +0.02 |
| MK *(prov.)* | 3 | 1-0-2 | 33% | 1465 | 33% | 33% | 1.00 | −0.01 | +0.7 | −0.0 · −0.00 |
| Harry *(prov.)* | 3 | 1-0-2 | 33% | 1491 | 50% | 33% | 1.00 | −0.20 | −2.1 | −0.5 · −0.05 |
| Jams *(prov., from 20 Sep)* | 1 | 0-0-1 | 0% | 1401 | 46% | 0% | 0.00 | −0.39 | −15.5 | −0.5 · −0.05 |

- A: Antz > Tom > Rocky > Rishi > PDM > Jords > Stormz > Max
- B: Rishi > Antz > PDM > Tom > Rocky > Stormz > Max > Jords
- C: Rishi > Antz > Tom > PDM > Rocky > Jords > Max > Stormz
- D: Rishi > PDM > Antz > Rocky > Tom > Max > Jords > Stormz
- **E: Rishi > PDM > Antz > Tom > Rocky > Max > Stormz > Jords**

### Tier C — nobody qualifies under any method

| Player | P | W-D-L | Win % | Avg opp | Par win chance | A | B | C | D | E |
|---|---|---|---|---|---|---|---|---|---|---|
| Jams *(prov., to 19 Sep)* | 3 | 0-1-2 | 17% | 1552 | 15% | 17% | 0.00 | +0.02 | +8.3 | +0.1 · +0.01 |
| Skapz *(prov.)* | 1 | 0-1-0 | 50% | 1103 | 48% | 50% | 0.00 | +0.01 | −1.0 | +0.0 · +0.00 |
| Fee *(prov.)* | 1 | 0-1-0 | 50% | 1103 | 50% | 50% | 0.00 | +0.01 | −1.0 | −0.0 · −0.00 |
| Rhys *(prov.)* | 1 | 0-1-0 | 50% | 1097 | 52% | 50% | 0.00 | −0.01 | +1.0 | −0.0 · −0.00 |
| Aubyn *(prov.)* | 2 | 0-1-1 | 25% | 1242 | 28% | 25% | 0.00 | −0.04 | +2.2 | −0.1 · −0.01 |
| Tee *(prov.)* | 1 | 0-0-1 | 0% | 1388 | 7% | 0% | 0.00 | −0.07 | +3.4 | −0.1 · −0.01 |

Tier S: Manny, one match. There is nothing to rank.

---

## Players who changed tier during September (all effective 20 Sep)

| Player | Spell | Record | What the split does |
|---|---|---|---|
| **Rishi** B→A | B 2–17 Sep: 21 matches | 10-3-8, **+3.8 above B par** | **Tops Tier B** under B, C, D and E |
| | A 20–24 Sep: 5 matches | 2-2-1, −0.2 vs A par | Mid-table in A (#4–#7) |
| | *If the whole month were filed under A* | 12-5-9 over 26 | **−2.5 below A par**. His 21 B-tier matches would be judged against A players' standard. That is wrong, and why the split matters. |
| **Ant Slicer** A→B | A 3–17 Sep: 5 matches | 0-1-4 | Bottom of A under every method. **No matches after the demotion**, so nothing in B. |
| **Jams** C→B | C 14–16 Sep: 3 matches; B 23 Sep: 1 match | 0-1-2; 0-0-1 | Provisional in both. Filed under B as a whole month, it would carry three C-tier fixtures into B. |

**Product question for Shaun:** can one player hold "Best Month" in the tier
they have just left? Under the split rule, Rishi is Tier B's best September
player **and** a Tier A player by month-end.

---

## Notable movers between methods

- **Antz (B):** #1 on win %, #2–#3 elsewhere. Their 69% came against the
  easiest schedule of the Tier B qualifiers after Tom and Rocky (par 54%,
  average opponents 1440).
- **Tom (B):** #2 on win %, #4 on E and #5 on D. He had the easiest schedule of
  the qualifiers (par 60%, average opponents 1401). A good record against soft
  fixtures.
- **Rishi's B spell:** #4 on win %, #1 everywhere else. He went 10-3-8 against
  one of the hardest schedules in the tier (par 37%, average opponents 1564;
  only Max's par, 33%, was lower).
- **PDM (B):** #5 on win % (50%), **#2 on E**. His fixtures were nearly as hard
  as Rishi's (par 38%).
- **Len (A):** #2 on win % (72%), #4 on everything else. He had the softest
  schedule of the Tier A players with a winning record (par 65%, average
  opponents 1516; only Ant Slicer's were comparable).
- **Osh (A):** #5 on win %, #2–#3 elsewhere. 16 matches against hard opposition
  (par 45%). He has the **largest total** above par in Tier A (+2.4), so he
  would lead a pure-total ranking.
- **Eli vs Kaz (A):** D ranks Eli above Kaz; C and E rank Kaz above Eli. Eli had
  an easy schedule (par 59%) and won 3 of 10. D gives him credit for the games
  he won inside losses.
- **Rishi's A spell:** #4 on win %, **#7 on D** (−7.8). He won 60% but took
  fewer games than the ratings predicted. This is D rewarding margin rather
  than results.

---

## Incentive testing

A toy model on September-like Tier B numbers: a player rated 1450, partner
1400, "truth" given by the calibrated win curve, E with the +8 cushion. The table shows the
**expected** score after each choice. Higher is better for the player.

| Scenario | A Win % | B Merit/g | C vs own | D Mthly Perf | E Above par |
|---|---|---|---|---|---|
| 4-1-1, then a **hard** match (22% to win) | 67.5% | 1.84 | 0.263 | *neutral* | 0.157 |
| … an **even** match (44%) | 70.6% | 1.90 | 0.263 | *neutral* | 0.159 |
| … an **easy** match (69%) | **74.1%** | 1.91 | 0.263 | *neutral* | 0.158 |
| Downside if that match is lost (hard / even / easy) | 64.3 / 64.3 / 64.3 | 1.71 × 3 | .231 / .200 / .165 | — | .142 / .129 / .113 |
| Underdog loses 6-7 6-7 | 0% | 0 | −0.22 | **+5.3** | −0.02 |
| Favourite scrapes 7-6 7-6 | 100% | 2.0 | +0.31 | **+1.2** | +0.04 |
| 4-0 vs easy opposition | **100%** | 2.00 | 0.240 | +0.7 | 0.101 |
| 6-3 vs hard opposition | 66.7% | **2.67** | **0.443** | **+24.5** | **0.261** |
| Stop at 5-0 | **100%** | **3.00** | **0.557** | **+21.6** | 0.244 |
| … or play on and go 3-2 | 80.0% | 2.40 | 0.357 | +14.4 | 0.241 |
| 12-8 (P 20) | 60.0% | 1.80 | 0.157 | +7.2 | **0.167** |
| 6-3 (P 9) | **66.7%** | **2.00** | **0.224** | **+9.6** | 0.159 |
| Underrated (true 1550, rated 1400), 8 games | 58% | 1.74 | **+0.171** | **+8.6** | 0.096 |
| Same ability, accurately rated 1550 | 58% | 1.74 | **0.000** | **−2.1** | 0.096 |

(D is neutral in expectation by construction: its expectation *is* the
engine's prediction. The toy model's game shares are too crude to show D's
numbers for the choice rows.)

### What each candidate rewards

- **A, raw win %.** **Fails the core test.** An easy match raises your expected
  win % and a hard one lowers it, while a loss costs the same whoever it is
  against. It rewards ducking and seeking weaker opponents, and protecting a
  record by stopping (a 5-0 player can only fall). It prefers 4-0 against easy
  opposition to 6-3 against hard. Low volume is safer.
- **B, Merit per game.** Better, but the adjustment is too coarse. A tier-step
  is worth ±1 point whatever the actual rating gap, so a 22% chance at 4 points
  is worth less than a 69% chance at 2. Easy and even fixtures still pay
  slightly more than hard ones. **Inside one tier, where most fixtures are
  0 steps, Merit/game is exactly 3 × win %**: two B pairs rated 1350 and 1550
  are the same "difficulty". A draw is worth 0, the same as a loss. Stopping
  after a hot start still pays.
- **C, wins vs own expectation.** Neutral on opponent choice **only with the
  calibrated curve**. With the engine's raw expectation it quietly rewards
  easier fixtures (finding 1). Its real problem is that it is **Monthly
  Performance restated in wins**: an accurately rated strong player scores ~0
  however well they play, and an **underrated player scores highly for the same
  results**. It measures surprise, not "best". Stopping after a hot start also
  pays.
- **D, Monthly Performance.** Honest about what it is, but it answers a
  different question. It is 80% about the share of games won, so it
  **pays for losing well** (+5.3 for a narrow loss) and barely pays a favourite
  who wins (+1.2). Like C, it **rewards being underrated**. It is not a "best
  player" measure.
- **E, wins above par.** Neutral on opponent choice: hard, even and easy all
  give ~0.158 expected, with the slightest lean to even matches, which is
  healthy. A loss to a strong pair costs little and a loss to a weak pair costs
  a lot. It prefers 6-3 against hard opposition to 4-0 against easy. **There is
  no reward for being underrated**, because par comes from the tier, not from
  your own rating. With the +8 cushion, stopping at 5-0 and playing on at 3-2
  score almost the same (0.244 vs 0.241). Volume earns a small edge only when
  results stay above par (12-8 at 0.167 vs 6-3 at 0.159), and playing more
  below par lowers the score. **Residual weaknesses:**
  - The cushion is a compromise. A smaller one makes stopping after a hot start
    pay; a larger one makes volume pay. No single number removes both.
  - Par uses opponents' and partners' ratings, so beating a pair that is itself
    underrated (a newly promoted strong player, say) counts as an easier win
    than it really was.
  - It needs ratings, so it inherits their lag.

### The general result

Any score that is "mostly win %, lightly adjusted" keeps a ducking incentive
in exact proportion to how little it adjusts. Writing the score as
`win% − λ × (expected win% − 50%)`, a player's expected gain from choosing an
easier match scales with (1 − λ). Only a full adjustment (λ = 1) removes it.
So "primarily rewards winning, lightly adjusted" and "no reason to duck" pull
against each other. E resolves this by **comparing results with what the
tier's average player would get**, which removes ducking while still counting
only wins, draws and losses. Game share does not enter it, which is what keeps
it distinct from Monthly Performance.

---

## Eligibility

| Minimum matches | Tier A qualifiers | Tier B qualifiers | E leader A / B |
|---|---|---|---|
| 3 | 9 | 11 | Erf / Rishi |
| **5** | **8** | **8** | **Erf / Rishi** |
| 8 | 5 | 6 | KC / Rishi |
| 10 | 4 | 4 | Osh / Rishi |

- **Keep 5.** For E the cushion does the statistical work that a higher
  threshold would otherwise do, and the difficulty-aware leaders are the same
  from 3 to 5.
- **Raising the threshold mainly removes players.** Erf played exactly 5
  matches and won all 5, so at 8 he drops out.
- **Robustness (leave one match out):** Tier B's E leader never changes (0 of
  43 single-match removals). The A–D leaders in Tier B change in 5–14 of 43.
  Tier A's leader changes only when the removed match is one of Erf's, which
  takes him below 5.
- **Tier C never qualifies.** Six players and 9 appearances; nobody reached 3
  matches, let alone 5. A Tier C award needs a product decision, not a
  threshold.

---

## Surprising findings

1. **The engine's expectation under-predicts favourites' wins.** It is
   calibrated to game share, not results. Any "wins vs expectation" measure
   that uses it raw quietly rewards easier fixtures. With the raw figures, C's
   Tier B leader flips from Rishi to **Antz** (Antz > Tom > Rishi). Nothing
   needs changing in the engine; a results-based award just needs a
   results-based curve.
2. **Rishi's September is the whole split-month problem in one player.** He is
   Tier B's best by every difficulty-aware method (21 matches to 17 Sep), then a
   Tier A player. Filed as a whole month under his current tier, he would be
   −2.5 below A par.
3. **Tier C barely plays.** No Tier C player has 3+ September matches. Jams
   (C) faced average opponents of 1552, i.e. mostly B/A fixtures.
4. **All 8 draws in the record are in September**, 17% of the month's
   matches. How a draw counts materially changes A and B: Merit pays a draw 0.
5. **The "stop at 5-0" scenario happened.** Erf played exactly 5 and won 5.
   Nothing suggests intent; it simply shows the case is real.
6. **C and E mostly agree this month.** Their only real difference is own
   rating versus tier par. It shows at Tom vs PDM: C gives Tom credit for beating
   his own low rating, while E credits PDM for results against harder
   opposition.

---

## Presenting it as a monthly race (added after Shaun's feedback)

Shaun: players will ask how par is calculated, so it must be simple. The club
previously ran a monthly race: everyone in a tier started level, and the best
rating at month-end won.

**That race and "wins above par" are the same mathematics.** A race's
end-of-month gain is K × Σ(result − expected result). The only real choice is
**what judges how tough each match was**:

| | **Pure race** (the old system) | **Race with Power-Rating stakes** (recommended) |
|---|---|---|
| Start | Everyone in the tier level | Everyone in the tier level |
| Toughness of a match | This month's race ratings only (tier offsets across tiers) | Partner's and opponents' Power Ratings; **you** count as an ordinary member of your tier |
| Ranking | Highest at month-end | Highest at month-end |

The Power-Rating race's "par" is the old "equal footing" idea, applied to you.
It is not your own rating, which is what keeps it from becoming Monthly
Performance. What changes is that your partner and opponents are judged as
they really are.

**For players:** *Everyone in a tier starts the month on 0. Each match has
stakes, set before it is played from the four players' Power Ratings: the
tougher the match for your side, the more a win earns and the less a loss
costs. Highest total at the end of the month has the best month.* With K = 20:
an even match is win +10 / lose −10. September's toughest Tier B fixture was
+18 / −2, the easiest +1 / −19. Showing the stakes on a match before it is
played would make the whole thing self-explaining.

**September, K = 20** (qualified players; the order is the same at K = 32):

| Tier A | Pure race | PR-stakes race | | Tier B | Pure race | PR-stakes race |
|---|---|---|---|---|---|---|
| Osh 8-3-5 | +38 (#2) | **+47 (#1)** | | Rishi 10-3-8 | +52 (#1) | **+77 (#1)** |
| Erf 5-0-0 | **+41 (#1)** | +42 (#2) | | PDM 7-2-7 | +22 (#2) | +38 (#2) |
| KC 6-0-3 | +28 (#3) | +37 (#3) | | Antz 5-1-2 | +20 (#3) | +23 (#3) |
| Len 10-3-3 | +26 (#4) | +21 (#4) | | Tom 5-2-2 | +13 (#4) | +13 (#4) |
| Rishi 2-2-1 | +2 (#5) | −4 (#5) | | Rocky 3-0-2 | +4 (#5) | +4 (#5) |
| Kaz 2-3-5 | −27 (#6) | −16 (#6) | | Max 2-1-7 | −29 (#7) | −17 (#6) |
| Eli 3-2-5 | −39 (#7) | −39 (#7) | | Stormz 2-0-5 | −25 (#6) | −25 (#7) |
| Ant Slicer 0-1-4 | −52 (#8) | −55 (#8) | | Jords 3-3-8 | −46 (#8) | −41 (#8) |

**Why not the pure race:** it cannot see who is actually strong inside a tier
until the month's results reveal it. At the start of a month, for a Tier B
player rated 1400:

| Choice | True win chance | Pure race, expected | PR-stakes race, expected |
|---|---|---|---|
| vs a strong B pair (1450) | 39% | **−2.3** | +0.4 |
| vs a weak B pair (1350) | 61% | **+2.3** | +0.4 |
| with a 1350 B partner | 44% | −1.1 | +0.4 |
| with a 1450 B partner | 56% | **+1.1** | +0.4 |

So the pure race pays for ducking the strong pairs in your own tier and for
choosing strong partners. The Power-Rating race pays the same whoever you
play and whoever you play with.

**What the race form gives up:** a race is a running total, so a player who
keeps beating par over many matches outscores one who beat it by more over
fewer. In Tier A this puts Osh (16 matches) ahead of Erf (5-0). The +8 cushion
earlier in this report fixes that, but it cannot be explained in race
language. **The simple form is the race with a 5-match minimum; the cost is a
mild reward for volume, but only for players who are beating par.** Playing
more while below par lowers your total.

Tier changes: each tier spell is its own race and restarts at 0 in the new
tier, which is the same split rule as League and Merit.

## Recommendation

1. **Take E, "wins above par", forward.** It is the one candidate that answers
   "best player in the tier", counts only results, gives no reason to duck, and
   gives no bonus for being underrated. The one-sentence explanation:

   > *Rishi had Tier B's best September: from 21 matches he won 10 and drew 3.
   > An average Tier B player in exactly those matches (same partners, same
   > opponents) would have expected about 7.7 wins; Rishi took 11.5, **3.8
   > above par**, the most in the tier.*

   > *Erf had Tier A's best September: 5 wins from 5 in matches where an average
   > Tier A player would have expected 2.9.*

   Show players the **total above par** (a count of wins, easy to read). Rank
   by the **cushioned score** (total ÷ (P + 8)), so one hot week cannot top the
   table and volume alone cannot either.
2. **Use a win curve fitted to results for par, not the engine's raw
   expectation.** This is one number (scale 250 vs 400), fitted to the club's
   own 161 decided matches. It should be refitted periodically, never tuned by
   hand. Its size and in-sample fitting deserve CChat's challenge.
3. **Keep the 5-match minimum.** Decide Tier C separately: no award, or merged
   with B for this purpose.
4. **Do not use A, raw win %, as the award.** It fails every ducking test. It
   is fine as context beside the award.
5. **B, Merit per game, is a reasonable no-ratings fallback** if Shaun wants
   something that avoids ratings entirely. Its tier-step granularity and its
   zero-point draws are the costs.
6. **Keep C and D out of "Best Month".** C is Monthly Performance restated in
   wins. D should stay the separate "beat your expectation" story it already
   is.

Decisions for Shaun (product, not implementation):
- **Mid-month movers:** can a player hold Best Month in the tier they left?
- **Tier C:** is there a Tier C award?
- **Headline number:** the total above par or the cushioned score?

The September rankings do not depend on the last choice except in Tier A
(Erf vs Osh).
