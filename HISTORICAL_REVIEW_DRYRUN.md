# Phase B — historical reassessment dry run

**Nothing here has been written.** These are the numbers Shaun asked to see before any
historical event is recorded. This script has no write path.

Engine `sequential-v1`, recommendation method `t2-quartile-v1`.

## What this dry run found

**The statistical reassessment declines to recommend anything for Tom or Fatch.**

The brief asks what the current recommendation system *would have produced* at those review
dates. The answer is: nothing. At each date Tier C held too few **established** players to
place a boundary — the method needs three either side and found 2 for Tom and 1 for Fatch.
The module refuses rather than inventing a target from a thin pool, which is the behaviour
Shaun approved when the threshold was set.

That is a real answer, not a gap. It means the honest historical record for
Tom and Fatch is a promotion plus **keep the current rating** — the explicit decision
Phase A now requires — unless the board prefers to record a club override, which it may.
**Claude Code will not choose between those; it is exactly the decision the workflow exists to capture.**

## Shaun — 2026-07-01 (C → B)

- **Treated as:** initial classification correction
- **Event type:** `INITIAL_CLASSIFICATION_CORRECTION`, decision `CORRECT_INITIAL_CLASSIFICATION`
- **State before the review** (as of 2026-06-24): Tier C, rating **1136.8**, reliability **33%** (5 evidence, 5 matches), PROVISIONAL
- **Statistical recommendation:** none — Not enough established players to place a boundary (1 in C, 9 in B; 3 needed each side). No rating change recommended.
- **Proposed new rating:** **1400.0**
- **Proposed reliability:** **unchanged** — see the open question below
- **Why:** Board decision, fixed: the initial estimate was wrong, so the normal B baseline applies. Not a statistical reassessment, and not a reward for development.

## Tom — 2026-07-01 (C → B)

- **Treated as:** genuine promotion, statistically reassessed
- **Event type:** `CLUB_RATING_REASSESSMENT`, decision `ACCEPT_RECOMMENDATION`
- **State before the review** (as of 2026-06-16): Tier C, rating **1103.4**, reliability **29%** (4 evidence, 4 matches), ESTABLISHED
- **Statistical recommendation:** none — Not enough established players to place a boundary (2 in C, 8 in B; 3 needed each side). No rating change recommended.
- **Proposed new rating:** **—**
- **Proposed reliability:** **unchanged** — see the open question below
- **Why:** No recommendation available: Not enough established players to place a boundary (2 in C, 8 in B; 3 needed each side). No rating change recommended.

## Fatch — 2026-08-01 (C → B)

- **Treated as:** genuine promotion, statistically reassessed
- **Event type:** `CLUB_RATING_REASSESSMENT`, decision `ACCEPT_RECOMMENDATION`
- **State before the review** (as of 2026-07-30): Tier C, rating **1128.2**, reliability **58%** (14 evidence, 14 matches), ESTABLISHED
- **Statistical recommendation:** none — Not enough established players to place a boundary (1 in C, 12 in B; 3 needed each side). No rating change recommended.
- **Proposed new rating:** **—**
- **Proposed reliability:** **unchanged** — see the open question below
- **Why:** No recommendation available: Not enough established players to place a boundary (1 in C, 12 in B; 3 needed each side). No rating change recommended.

## Reliability — a decision Shaun still has to make

The brief asks for a reliability recommendation rather than an invented one. There is not
one to give: `reassessment.js` returns `recommendationReliability: null` by design, because
**no validated method exists for recommending a reliability change on a tier move.** The
module says so in its own words and offers an override to the board instead.

So the three proposals above leave reliability untouched, which means the evidence each
player had already earned is kept. For Shaun that is the question worth a moment: his
rating is being corrected to a baseline as though the estimate restarted, while his five
June matches of evidence stay. Those are separable, and leaving evidence alone is the more
conservative of the two readings — but it is a board decision, not an implementation one.

| Player | Reliability before | If left alone | If reset to zero evidence |
|---|---:|---:|---:|
| Shaun | 33% | 33% | 0% |
| Tom | 29% | 29% | 0% |
| Fatch | 58% | 58% | 0% |

## Blast radius

Applying these three events changes the inputs to every match that followed them, so the
whole record from 1 July onward is re-derived. The figures below come from replaying the
real record with the three events in place.

**29 of 34 players end on a different Power Rating.**

| Player | Now | After | Change |
|---|---:|---:|---:|
| Shaun | 1178.7 | 1382.3 | +203.6 |
| Harry | 1405.3 | 1414.8 | +9.6 |
| MK | 1383.5 | 1391.5 | +7.9 |
| KC | 1721.2 | 1713.9 | -7.3 |
| Carla | 1383.9 | 1391.0 | +7.1 |
| Max | 1400.4 | 1407.4 | +7.0 |
| Rishi | 1439.3 | 1446.2 | +6.9 |
| Tom | 1158.9 | 1151.9 | -6.9 |
| Mulley | 1399.9 | 1405.6 | +5.7 |
| Omar | 1393.6 | 1398.2 | +4.6 |
| Tarique | 1357.3 | 1361.8 | +4.5 |
| Antz | 1407.0 | 1411.1 | +4.1 |
| Osh | 1707.0 | 1711.0 | +4.0 |
| Tee | 1087.0 | 1091.0 | +4.0 |
| Fatch | 1144.2 | 1147.7 | +3.6 |
| Eli | 1648.0 | 1651.6 | +3.6 |
| Len | 1675.1 | 1678.5 | +3.4 |
| PDM | 1429.9 | 1429.1 | -0.9 |
| Jords | 1327.3 | 1328.1 | +0.8 |
| Erf | 1733.9 | 1734.5 | +0.6 |
| Rocky | 1383.3 | 1383.7 | +0.5 |
| Stormzy | 1376.9 | 1377.3 | +0.4 |
| Jams | 1109.9 | 1109.4 | -0.4 |
| Ant Slice | 1635.7 | 1636.0 | +0.3 |
| Aubyn | 1102.4 | 1102.2 | -0.2 |
| Kaz | 1734.5 | 1734.7 | +0.1 |
| Fee | 1085.8 | 1085.6 | -0.1 |
| Rhys | 1094.1 | 1094.1 | +0.1 |
| Skapz | 1106.6 | 1106.7 | +0.1 |

## What happens next

Claude Code will not write any of this until Shaun confirms the numbers, and needs an
answer on reliability before it can. Once confirmed: apply the three events in date order,
replay forward, run diagnostics, and regenerate the comparison report.
