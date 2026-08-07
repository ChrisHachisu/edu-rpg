# Orchestration — one session per repo, subagents inside it

Decided 2026-08-06 by the owner as a preference for how they want to work: one thread of
accountability that reports to them, rather than several they have to poll. **Supersedes
the multi-session model in `PARALLEL-SESSIONS.md`** for edu-rpg — but that file's ownership
tables and its integration-token convention are still the operating detail, and the token
still governs merges.

> **Correction, same day.** The first version of this file justified the change with
> "three parallel sessions each finished work and none could merge it." That was false and
> the art track caught it. Verified: `main == origin/main == 42b17a8` (0/0, fully pushed);
> art's commits were ancestors of `6b04deb` *before* they were called parked; HUD landed as
> `42b17a8`. Two of the three tracks merged fine. The one that did not was the engine track,
> for its own reasons — no device proof and an exhausted session — not a systemic failure.
> The error came from comparing `git log -1` hashes and inferring "unmerged" instead of
> running `git merge-base --is-ancestor`, and from not reading `PARALLEL-SESSIONS.md`, which
> documents the integration token that was working the whole time. **The model change stands
> as an owner preference; the failure story does not.**

## The rule

**One Claude Code session per repository.** That session is the orchestrator: it holds
product judgment, runs the gates, owns the merge, and is the only thing that reports to
the owner. Parallel work happens as **subagents inside it**, each in its own worktree.

Separate top-level sessions are for separate PROJECTS (ChalkMap vs edu-rpg), never for
separate tracks of one project.

### Why not parallel sessions

Not because they fail to merge — on 2026-08-06 three tracks produced **zero source
conflicts** and two of the three merged and pushed without incident. The ownership tables
and the integration token did their job. Anyone proposing to replace this model should
start from that, not from a decline narrative.

The actual reasons, both about the owner's side of the wire:

1. **No control channel between sessions.** `send_message` is a context handoff and says
   outright it is "not to orchestrate background work"; it cannot reach unattended sessions
   at all. So no session can brief another, hold it to a gate, or collect a structured
   result. Coordination degrades to the owner relaying between sessions by hand.
2. **N sessions means N reports and N things to poll.** A subagent is briefed by the
   orchestrator, gated by the orchestrator, and returns to the orchestrator — one thread of
   accountability, one report.

What parallel sessions were genuinely good at — isolation, and tracks that never collide —
is preserved, because subagents still get one worktree each.

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
2. **Committed generated pins are serialised, not conflict-prone.** Touching
   `public/dq-tiles.js` moves 53 pins plus `act1RuntimeSnapshot.ts` plus two hand-edited
   shas. Two branches regenerating those against a moving `main` produce "two different
   correct answers and one broken tree" — which is exactly why the integration token
   exists, and the token has been holding. Regenerate-and-compare at gate time would remove
   the need to serialise, but that is an improvement to argue on its merits, **not** a
   defect currently costing anyone. An earlier version of this file sold it as one.
3. **The web path does not boot past `BootScene`.** Loader reaches `progress: 1`,
   `isLoading() === false`, zero pending, no console errors, all requests 200 — and it
   never hands off to `TitleScene`. This blocks every headless verification and is what
   forces the simulator to be the only lane. → Fixing it gives every batch a cheap tier-2.
4. **`.eduharness/` is gitignored**, so a fresh worktree has no Playwright harness.

## Current queue (verified 2026-08-06, after the correction above)

`main == origin/main == 42b17a8`, 0/0. Fully pushed.

| Branch | State |
|---|---|
| `art/materials-and-crystalcave` | **merged** (`9aeeeaf`, `60f786c`, `0293dce`, `c2879a9` all on origin) |
| `hud/theme-and-chrome` | **merged**, landed rebased as `42b17a8` — the branch ref still points at the pre-rebase `12f5118`, so an is-ancestor check on it lies |
| `engine/overworld-blockers` | **unmerged**, 3 commits. Gates passed against `6b04deb`; `main` has since moved, so they must be re-run after a rebase onto `42b17a8`. No device proof. |

**Check merges with `git merge-base --is-ancestor`, never by eyeballing two `git log -1`
hashes.** A rebased branch keeps its old ref and reads as unmerged; that mistake is what
produced the false premise this file originally carried.
