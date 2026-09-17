# CLAUDE.md

Guidance for Claude Code when working in this repository.

## Project coordination

This repository participates in a four-party workflow:

- **Shaun** — product owner / final decision maker
- **ChatGPT (CGPT)** — product architecture, UX, coordination and delegated decision synthesis
- **Claude Chat (CChat)** — engineering/specification review and challenge
- **Claude Code (CCode)** — implementation and repository verification

Shared coordination document: **[`PROJECT_LEDGER.md`](./PROJECT_LEDGER.md)**.
It is the asynchronous communication layer between all parties and supersedes
the old Google Drive Ledger.

Authority: Shaun's explicit product decision → agreed architecture → repository
+ tests + `RATING_MODEL.md` for implementation truth → `PROJECT_LEDGER.md` for
coordination state → individual AI chat memory.

Before substantial work, read the Ledger's Current State, Current Task, Open
Questions, latest Handoffs and Next, then inspect the relevant repository code
and `RATING_MODEL.md`. If sources conflict, do not guess: record the conflict in
the Ledger immediately.

## Shaun's shorthand — exact semantics

Shaun should not need to type workflow syntax such as `WORK`, `NEXT #1`, task
numbers, commit references, or repeat instructions already in the Ledger.

### `Ledger CCode`
This is a **go command to Claude Code**.

1. Read and reconcile the latest Ledger and repository state.
2. If the Ledger assigns CCode a clear, approved and unblocked next task,
   **start that task immediately**. `Ledger CCode` itself is sufficient
   authorisation; do not ask Shaun to additionally say `WORK`, `go`, `NEXT #1`,
   or paste the task back into chat.
3. If several approved tasks exist, take the first unblocked item in `NEXT`
   unless the Ledger explicitly prioritises another.
4. If no implementation task is actually approved, or a genuine Shaun-level
   decision blocks work, say so concisely and ask only that decision.
5. On completion, verify/test, update the Ledger, record the commit/state and
   hand the baton back through the Ledger.

### `Ledger Sync`
Read and reconcile only. Do not start implementation merely because of this
command. Report the current baton/status briefly and update the Ledger only if
reconciliation itself reveals stale or conflicting coordination state.

### `Ledger CChat`
Intended for Claude Chat. It means: read the Ledger, perform the review/challenge
currently assigned to CChat, and write/return conclusions in a form that can be
recorded in the Ledger. It is not a CCode implementation command.

### `Ledger CGPT`
Intended for ChatGPT. It means: read the Ledger and perform the current
architecture/coordination/product task assigned to CGPT. It is not a CCode
implementation command.

The old conceptual distinction `SYNC / REVIEW / WORK` remains useful internally,
but **Shaun is not required to type those words**. The shorthand above already
encodes the intended action.

## Decision and escalation rules

The Ledger is where agents communicate with one another. Do not use Shaun as a
message bus for ordinary technical coordination.

**Claude Code decides without interrupting Shaun** when the choice is an
implementation detail that follows the agreed architecture: refactoring,
function/component boundaries, safe query implementation, tests, indexing,
error handling, naming internal helpers, and similar reversible engineering
choices. Record material discoveries in the Ledger.

**ChatGPT may lead/delegate product-architecture decisions** where Shaun has
already delegated the area or the choice merely implements an agreed product
intent. Put the decision/rationale in the Ledger so CCode and CChat can see it.

**Ask Shaun directly** when a decision materially changes user-visible product
behaviour, rating methodology/engine mathematics, competition rules, data that
will be treated as authoritative, security/privacy, production data or writes,
irreversible/destructive actions, cost with meaningful ongoing impact, or when
there are two genuinely different product directions and his preference is the
point of the decision. Present the choice in plain English with a recommendation;
do not ask him to resolve implementation minutiae.

If Shaun explicitly says CGPT should take the lead on a decision, treat that as
delegation and record the resulting decision in the Ledger.

## Ledger maintenance

Claude Code is the primary maintainer of the Ledger after implementation work.
After a meaningful task, update Current State / Current Task / Recently
Completed / Next, refresh the CCode handoff, record the commit hash, and commit
the Ledger with the work where sensible. Record decisions and state changes —
not a development diary.

Updating the Ledger is not limited to finished work. Write blockers, conflicts,
material discoveries and decisions needed from Shaun into Open Questions as
soon as they arise. If a finding changes what another agent plans or builds, it
belongs in the Ledger before relying on chat.

Condense CGPT/CChat material into state, decisions, open questions or handoffs
rather than pasting conversations. **Never overwrite another agent's historical
handoff.**
