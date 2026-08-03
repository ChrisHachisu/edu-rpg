---
date: 2026-07-17
type: handoff
project: edu-rpg
milestone: act1-coral-reef-visual-entrance
relay_chain_id: edu-rpg-act1-overhaul
relay_sequence: "12"
relay_task_title: Edu-RPG Relay 12 — Coral Reef Visual Entrance
relay_status: delegated
relay_predecessor_thread_id: 019f6d09-27da-7d41-83d9-ba69831a9964
relay_successor_thread_id: 019f6d85-a989-7bd2-98ef-df64d4294bc9
subagents_drained: true
background_sessions_drained: true
---

# Coral Reef v2 art locked

Owner approved Attempt C on 2026-07-17. Locked master:
`design/review/overworld-art-blueprint/act-by-act/act1/runtime-v2/coastal-reef-entrance-v2-review/coastal-reef-authored-master-v2-locked.png`,
SHA `d700133209e0117fbacf644876f33a5bb64c695877c7dd2d47707ab24e1f8dea`.

Locked decision: the main road bends toward the reef, crosses a continuous dry
rock shelf, and terminates at one natural cave embedded in the cyan reef rock
mass. The dungeon reads as part of the reef and remains fully accessible by
foot. Ocean stairs, landward cave, side spur, dock, water crossing, and second
entrance are absent.

Evidence and all three attempts are in `coastal-reef-entrance-v2-review/`.
Checks: deterministic rerender; v1 `22/22`; accepted inputs `18/18`; 1254-square
RGB/full bleed; `57/32` lattice; seam identity; macro correlation `0.744780 >=
0.45`; compile and diff PASS. The owner-posted attachment and locked master have
identical RGB pixels.

Art only is locked. Runtime, manifest, collision, masks, polygons, saves, and
adapter were not changed. Any promotion is a separate authorized slice.

## Drain

- Collaboration tree: root only; no child agent existed.
- Owned background sessions: none; every execution completed.

Strict title gate: before work, task title must be
`<Project> Relay NN — <Current slice>` and match `relay_sequence`; rename it if
needed. Every successor prompt must include its exact title and this check.

Relay 13 was created for versioned runtime promotion. Use
`$relay-fresh-sessions` at the next verified boundary.
