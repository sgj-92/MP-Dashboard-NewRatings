# Money Padel Prestige v3 — comparison report

Generated 2026-09-18 by `scripts/comparison-report.js`. Regenerate rather than edit.

## Read this first

**These two systems are not supposed to agree, and a difference is not a defect in either.**
They rate different match sets with different engines. The purpose of this report is to make
the differences legible and say which are explained — not to drive them toward zero.

| | v3 beta | Legacy production |
|---|---|---|
| Engine | `sequential-v1` — sequential, one pass, applied per match | Iterative joint-equilibrium solver, K=28, 300 epochs over the whole set |
| Matches rated | 150 | 149 |
| Draws rated | 5 | 0 — the legacy solver cannot rate a match with no winner |
| Rating moves | Once, when the match is played, weighted by how established the player is | Re-solved from scratch across every match on every computation |
| Monthly figures | A window on one continuous rating | A separate rating solved from that month alone |
| Snapshot taken | live | 2026-09-16T16:32:02Z |
| Players | 34 | 34 |

The production figures are a **frozen snapshot from 2026-09-16** and go stale: production keeps
receiving matches. They are reference data and are never an input to anything in v3.

## What is already known not to reconcile

- **Match counts differ for 17 of 34 players.** v3 rates 150 matches, the snapshot 149.
  Not explained by draws alone. Recorded in `PROJECT_LEDGER.md` as an approximate reference, not a reconcilable truth.
- **The snapshot has no join key.** Every `player_id` is `null`, so players are matched by name. All
  34 map today; a rename would break it silently.

## Summary

- Players compared: **34**
- Mean absolute difference: **31.9 points**
- Largest difference: **220.3 points**
- Tier disagreements: **0**

**The 3 largest differences are explained before any match is played.**
Shaun (started Tier C, now Tier B, -220.3); Tom (started Tier C, now Tier B, -193.0); Fatch (started Tier C, now Tier B, -100.1).
v3 seeds a player at the tier that was true when they first played; production seeds from the
tier they hold today. For these players the two systems begin 300 points apart, and evidence has
damped rather than erased that gap. They are exactly the largest differences in the table.

Excluding them, the mean absolute difference is **18.4 points** across 31 players.

A tier disagreement is expected where v3 recorded a promotion after the snapshot was taken.

## Per player

Sorted by v3 Power Rating. "Evidence" is the reliability v3 holds for that player: a low
figure means v3 has deliberately moved them less, so a large difference there is the two
systems disagreeing about confidence, not about ability.

| Player | Tier | Started | v3 | Snapshot | Diff | v3 matches | Snapshot matches | Reliability |
|---|---|---|---:|---:|---:|---:|---:|---:|
| Manny | S | S | 2010.8 | 2012.7 | -1.9 | 3 | 2 (+1) | 23% |
| Kaz | A | A | 1734.5 | 1768.1 | -33.6 | 23 | 22 (+1) | 70% |
| Erf | A | A | 1733.9 | 1722.0 | +11.9 | 26 | 26 | 72% |
| KC | A | A | 1721.2 | 1702.2 | +19.0 | 26 | 28 (-2) | 72% |
| Del | A | A | 1708.4 | 1709.0 | -0.6 | 1 | 1 | 9% |
| Osh | A | A | 1707.0 | 1704.3 | +2.7 | 30 | 30 | 75% |
| Len | A | A | 1675.1 | 1658.1 | +17.0 | 32 | 31 (+1) | 76% |
| Dennis | A | A | 1671.3 | 1641.9 | +29.4 | 9 | 9 | 47% |
| Eli | A | A | 1648.0 | 1590.7 | +57.3 | 31 | 32 (-1) | 76% |
| Ant Slice | A | A | 1635.7 | 1615.1 | +20.6 | 7 | 6 (+1) | 41% |
| Rishi | B | B | 1439.3 | 1483.9 | -44.6 | 72 | 71 (+1) | 88% |
| PDM | B | B | 1429.9 | 1485.9 | -56.0 | 34 | 35 (-1) | 77% |
| Antz | B | B | 1407.0 | 1417.6 | -10.6 | 18 | 18 | 64% |
| Harry | B | B | 1405.3 | 1434.4 | -29.1 | 29 | 29 | 74% |
| Max | B | B | 1400.4 | 1425.7 | -25.3 | 50 | 50 | 83% |
| Mulley | B | B | 1399.9 | 1405.1 | -5.2 | 1 | 1 | 9% |
| Omar | B | B | 1393.6 | 1423.6 | -30.0 | 9 | 10 (-1) | 47% |
| Carla | B | B | 1383.9 | 1389.8 | -5.9 | 1 | 1 | 9% |
| MK | B | B | 1383.5 | 1430.9 | -47.4 | 14 | 14 | 58% |
| Rocky | B | B | 1383.3 | 1353.8 | +29.5 | 16 | 16 | 62% |
| Stormzy | B | B | 1376.9 | 1389.0 | -12.1 | 17 | 18 (-1) | 63% |
| Chloe | B | B | 1371.8 | 1366.9 | +4.9 | 7 | 7 | 41% |
| Tarique | B | B | 1357.3 | 1352.1 | +5.2 | 6 | 6 | 38% |
| Jords | B | B | 1327.3 | 1311.3 | +16.0 | 36 | 35 (+1) | 78% |
| Shaun | B | **C** | 1178.7 | 1399.0 | -220.3 | 21 | 21 | 68% |
| Tom | B | **C** | 1158.9 | 1351.9 | -193.0 | 21 | 20 (+1) | 68% |
| Fatch | B | **C** | 1144.2 | 1244.3 | -100.1 | 25 | 25 | 71% |
| Jams | C | C | 1109.9 | 1101.2 | +8.7 | 6 | 7 (-1) | 38% |
| Skapz | C | C | 1106.6 | 1108.3 | -1.7 | 2 | 1 (+1) | 17% |
| Aubyn | C | C | 1102.4 | 1115.8 | -13.4 | 5 | 4 (+1) | 33% |
| Rhys | C | C | 1094.1 | 1097.6 | -3.5 | 4 | 3 (+1) | 29% |
| M.R | C | C | 1089.5 | 1088.7 | +0.8 | 1 | 1 | 9% |
| Tee | C | C | 1087.0 | 1114.1 | -27.1 | 8 | 8 | 44% |
| Fee | C | C | 1085.8 | 1084.9 | +0.9 | 5 | 4 (+1) | 33% |

## How to read a large difference

In order of how often it is the answer:

1. **They started at a different tier.** v3 seeds from the tier that was true when the player
   first played; production seeds from the tier they hold now. A C-to-B correction is a 300 point
   head start in production terms. This explains the largest differences in the table.
2. **The two rated different matches for that player.** Check the match-count columns first.
3. **v3 weights early results more.** A newer player moves by up to 40 points a match while
   production moves everyone by the same K. Low reliability plus a large difference is this.
4. **v3 rates draws.** Production cannot, so anyone in a drawn match differs for that reason alone.
5. **The snapshot is older than the v3 record.** Matches played since are in v3 only.
6. **A club decision moved the v3 rating.** Recorded in the Rating Journey as its own event.

None of these is a defect. If a difference survives all six, that is worth investigating —
and worth recording in `PROJECT_LEDGER.md` rather than resolving quietly.
