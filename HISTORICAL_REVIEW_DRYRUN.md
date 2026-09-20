# Historical club adjustments — 18 Sep 2026

> ## ⚠️ TOM AND FATCH WERE SUPERSEDED ON 20 SEPTEMBER 2026
>
> **This page records what was applied on 18 September. Two of its three rows
> are no longer the club's decision.** Shaun re-anchored Tom and Fatch to the
> standard Tier B baseline, because anchoring a promoted player to one
> individual B with a genuinely poor record distorted how far they sat from the
> rest of the tier.
>
> | Player | This page says | **In force now** |
> |---|---|---|
> | Shaun | 1400 @ 10% | **unchanged — still 1400 @ 10%** |
> | Tom | Jords' rating, 1352.5 @ 10% | **1400 (Tier B baseline) @ 20%** |
> | Fatch | Tom's rating, 1358.6 @ 10% | **1400 (Tier B baseline) @ 20%** |
>
> Applied and verified in commit `4bbda90`. The superseding decisions are in the
> record beside the originals; nothing was deleted. The app shows only the
> decisions in force. **Do not read the anchors below as current.**

Applied 18 Sep 2026 through the audited Historical Club Adjustment path, on Shaun's
board decisions. Nothing was deleted: each decision supersedes the one it replaced and
both remain in the record.

**The table below is the 18 September position, kept as a record of what was
decided then. See the notice above for what is in force.**

| Player | Date | Decision | Anchor | Rating after decision | Reliability after | Current rating at the time | Current reliability at the time |
|---|---|---|---|---:|---:|---:|---:|
| Shaun | 1 Jul 2026 | Initial classification correction | Normal B baseline (board-fixed) | 1400.0 | 10% | 1374.3 | 63% |
| Tom | 1 Jul 2026 | Promotion + club override | ~~Jords' rating immediately before the review~~ **superseded** | ~~1352.5~~ | ~~10%~~ | 1345.9 | 64% |
| Fatch | 1 Aug 2026 | Promotion + club override | ~~Tom's rating immediately before the review~~ **superseded** | ~~1358.6~~ | ~~10%~~ | 1342.1 | 55% |

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
