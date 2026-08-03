# Autonomous session relay

Use this protocol only when a handoff explicitly enables the relay. It creates
fresh Codex tasks at verified slice boundaries without scheduled polling.

Use the personal `$relay-fresh-sessions` skill at
`/Users/christopherhachisu/.codex/skills/relay-fresh-sessions/SKILL.md` as the
authoritative relay and drain procedure. This file supplies the active project
chain values.

## Task title rule

Use `Act 1 Relay NN — <Current slice>`, beginning at `00` and incrementing by
one. The relay marker and title sequence must agree.

## Relay contract

1. Finish and verify the current bounded slice. Preserve the dirty worktree;
   never commit, deploy, publish, alter TestFlight, or expand permissions unless
   the owner explicitly authorizes it.
2. Write one new active handoff in `docs/handoffs/` containing completed scope,
   named checks, locked decisions, remaining work, risks, one next action, and a
   self-contained kickoff prompt. Carry this relay contract forward.
3. Stop without creating a successor when any of these is true:
   - the requested project goal is complete;
   - owner taste, product choice, or approval is required;
   - the next action is destructive, external, release-related, or needs new
     authority;
   - the task is genuinely blocked or verification failed.
4. Pass the mandatory `$relay-fresh-sessions` drain gate: collect completed
   results, record unfinished agent work, interrupt every live child deepest
   first, re-list until none remain, and stop every owned server/compiler/
   recorder session. A failed drain blocks the relay.
5. Otherwise create exactly one fresh Codex task. Its prompt must include the
   absolute worktree path, new handoff path, locked constraints, verification
   target, and this protocol path. Do not create a new Git worktree or branch.
6. Use a unique marker in the prompt:
   `[relay:<chain-id>:<next-generation>]`. Before creation, search recent Codex
   tasks for that marker; reuse an existing match instead of duplicating it.
7. After creation, record `relay_chain_id`, `relay_sequence`,
   `relay_status: delegated`, and `relay_successor_thread_id` in the new
   handoff, together with `subagents_drained: true` and
   `background_sessions_drained: true`. If task creation is unavailable, leave
   `relay_status: ready` and report the blocker; do not replace it with cron,
   shell, or detached agents.

## Active chain

- Chain: `edu-rpg-act1-overhaul`
- Worktree: `/Users/christopherhachisu/Documents/claudecode/edu-rpg-map-engine-semantic-data`
- Sequence 00: `Act 1 Relay 00 — Design Lock & Relay Setup`
- Sequence 01: `Act 1 Relay 01 — Crisp 208px Map Streaming`
- Stop condition: the first owner-review checkpoint or any condition in step 3
