# Orchestration — one session per repo, subagents inside it

Decided 2026-08-06 by the owner, after three parallel top-level sessions each finished
their work and none could merge it. **Supersedes the multi-session model in
`PARALLEL-SESSIONS.md`**, whose ownership tables remain useful as a description of who
owns which files — but tracks are now subagents, not sessions.

## The rule

**One Claude Code session per repository.** That session is the orchestrator: it holds
product judgment, runs the gates, owns the merge, and is the only thing that reports to
the owner. Parallel work happens as **subagents inside it**, each in its own worktree.

Separate top-level sessions are for separate PROJECTS (ChalkMap vs edu-rpg), never for
separate tracks of one project.

### Why not parallel sessions

They work fine right up until they have to finish. Measured on 2026-08-06: three tracks
produced zero source conflicts — the ownership boundaries held — and still landed nothing,
because each session could complete work but none owned integration. There is also no
control channel between sessions: `send_message` is a context handoff and says outright it
is "not to orchestrate background work", and it cannot reach unattended sessions. An
orchestrator built on it would be guessing at the other sessions' state.

A subagent, by contrast, is briefed by the orchestrator, gated by the orchestrator, and
returns a structured result to the orchestrator. One thread of accountability.

## The flow

```
owner → orchestrator session
          → subagents, one isolated worktree each   (parallel)
          → mechanical gate, per subagent
          → integration branch                       (serial, orchestrator only)
          → ONE full rebuild + ONE device pass       (per BATCH, not per track)
          → main
        → one report to the owner
```

## The two-tier gate

The device gate was the hard serializer: one simulator, and every `public/` change needed
its own pass, so tracks queued on a resource only one could hold. Split it.

**Tier 1 — mechanical. Per subagent. Required to reach `integration`.**

```
npm run test:map-engine
./scripts/ship-gate.sh .
```

Run by the ORCHESTRATOR on the committed tree, never accepted from the worker's own report.

**Tier 2 — device. Per BATCH. Required to reach `main`.**

One full rebuild, one simulator pass, covering everything on `integration`. Never
`run-ios.sh --skip-build` — it reinstalls a stale app and silently tests old code.

## Hard rules that do not change

- **One mutating agent per worktree.** Two agents in one tree cannot produce a trustworthy
  test number; each one's suite runs against the other's half-finished files.
- **The orchestrator runs the final gate, on the committed tree.** A worker's green report
  is a hypothesis, not a verdict.
- **Stage explicit paths, never `git add -A`**, while any other worktree is live.
- **Do not boot a simulator if another session holds one.**

## Known blockers to this working smoothly

These are why integration is expensive today. Fix them and the batch flow gets cheap.

1. **`dist/` is gitignored but pinned by `ship-gate.sh`.** A fresh worktree cannot build a
   passing `dist`. The recipe, worked out 2026-08-06 and not yet scripted:
   `python3 scripts/runtime_baseline.py hydrate --output dist` (257 files), then copy the
   148 Act-1 overlay paths from `public/` (drive it off the `missing=[...]` list that
   `verify-act1` prints), then copy the four canonical overrides from `public/`.
   **`dist/index.html` cannot be reconstructed from any tracked file** — the only correct
   copy (15094 B, sha `0f3dd23c…`) lives in other worktrees, and `regenerate_pins.py` will
   silently re-pin it to the stale hydrated vintage (14414 B) if you let it.
   → Wanted: `scripts/build-dist.sh`, and either track `dist/index.html` or generate it.
2. **Generated files are committed.** Touching `public/dq-tiles.js` moves 53 pins plus
   `act1RuntimeSnapshot.ts` plus two hand-edited shas. Two tracks touching that file
   conflict in generated space 100% of the time even when their source edits do not
   overlap. → Wanted: regenerate-and-compare at gate time instead of diffing committed pins.
3. **The web path does not boot past `BootScene`.** Loader reaches `progress: 1`,
   `isLoading() === false`, zero pending, no console errors, all requests 200 — and it
   never hands off to `TitleScene`. This blocks every headless verification and is what
   forces the simulator to be the only lane. → Fixing it gives every batch a cheap tier-2.
4. **`.eduharness/` is gitignored**, so a fresh worktree has no Playwright harness.

## Current queue (as of 2026-08-06)

| Branch | Commits ahead of main | Mechanical gate | Device |
|---|---|---|---|
| `hud/theme-and-chrome` | 6 | not run by an integrator | no |
| `art/materials-and-crystalcave` | live session | — | no |
| `engine/overworld-blockers` | 2 | **both PASS on committed tree** | no |

`main` is also 62 commits ahead of `origin/main` and has never been pushed.
