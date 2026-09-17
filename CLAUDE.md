# CLAUDE.md

Guidance for Claude Code when working in this repository.

## Project coordination

This repository participates in a three-agent development workflow:

- **ChatGPT** — product architecture / UX / coordination
- **Claude Chat** — engineering and specification review
- **Claude Code** — implementation and repository verification

Shared coordination document: **[`PROJECT_LEDGER.md`](./PROJECT_LEDGER.md)** in
this repository. It supersedes the Google Drive "AI Project Ledger", which
Claude Code can read but has no connector operation to write to.

Before beginning a substantial new task, read `PROJECT_LEDGER.md` — Current
State, Current Task, Open Questions, and the latest handoffs — then inspect the
repository and `RATING_MODEL.md`.

Authority: Shaun's explicit product decision → agreed architecture →
repository + tests + `RATING_MODEL.md` for implementation truth →
`PROJECT_LEDGER.md` for coordination state → individual AI chat memory.

If these conflict, **STOP and report the conflict. Do not guess.**

**Reading the Ledger is not an instruction to start coding.** Distinguish
`SYNC` (read and reconcile), `REVIEW` (analyse or challenge) and `WORK` (make
changes). Shaun's shorthand: `Ledger Sync` · `Ledger CCode` · `Ledger CChat` ·
`Ledger CGPT`.

Claude Code is the primary maintainer of the Ledger. After a meaningful
implementation task, update Current State / Current Task / Recently Completed /
Next, refresh the CCode handoff, record the commit hash, and commit the Ledger
with the work where sensible. Record decisions and state changes — not a
development diary.

Condense ChatGPT and Claude Chat material into state, decisions, open questions
or handoffs rather than pasting conversations.

**Never overwrite another agent's historical handoff.**
