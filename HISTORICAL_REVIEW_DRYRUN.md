# Historical club adjustments — APPLIED

Superseded by the actual result. The dry run that preceded this is in the git history.

Applied 18 Sep 2026 through the audited Historical Club Adjustment path, on Shaun's
board decisions. Nothing was deleted: each decision supersedes the one it replaced and
both remain in the record.

| Player | Date | Decision | Anchor | Rating after decision | Reliability after | Current rating | Current reliability |
|---|---|---|---|---:|---:|---:|---:|
| Shaun | 1 Jul 2026 | Initial classification correction | Normal B baseline (board-fixed) | 1400.0 | 10% | 1374.3 | 63% |
| Tom | 1 Jul 2026 | Promotion + club override | Jords' rating immediately before the review | 1352.5 | 10% | 1345.9 | 64% |
| Fatch | 1 Aug 2026 | Promotion + club override | Tom's rating immediately before the review, after his corrected July | 1358.6 | 10% | 1342.1 | 55% |

## How the anchors were resolved

Both 1 July decisions were drawn from the SAME pre-review snapshot, so processing Shaun
first could not move the Jords figure Tom was anchored to. That is the whole purpose of
the shared-snapshot rule.

Fatch could only be resolved afterwards: his anchor is Tom's rating immediately before
1 August, which depends on Tom's corrected July having been replayed. Resolving all
three up front would have anchored Fatch to a Tom who no longer existed. On the record
as it stood before the corrections, Tom went into 1 August at 1133.0; after them, 1358.6.

## Verification

- The record replays to itself: **0 differences**.
- All nine diagnostics pass on the live record.
- Monthly Rating Movement separates the decision from the play:
  Shaun July +255.1 of which **+263.2 by club decision** (−8.1 on court);
  Tom July +255.2 of which **+249.1 by decision** (+6.1 on court);
  Fatch August +205.7 of which **+222.3 by decision** (−16.6 on court).
- Every superseded decision is still stored, and the Rating Journey shows only the live one.
