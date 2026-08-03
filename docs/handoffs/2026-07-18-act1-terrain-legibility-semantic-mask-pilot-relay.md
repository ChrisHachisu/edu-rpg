---
date: 2026-07-18
type: handoff
project: edu-rpg
milestone: act1-terrain-legibility-semantic-mask-pilot
status: complete
relay_chain_id: edu-rpg-act1-overhaul
relay_sequence: "20"
relay_task_title: Edu-RPG Relay 20 — Terrain Legibility Contract and Two-Area Semantic-Mask Pilot
relay_status: delegated
relay_predecessor_thread_id: 019f7270-ad49-7440-9757-7521027a585d
relay_current_thread_id: 019f72e0-16ab-7b10-8406-aa772de3f0da
relay_successor_thread_id: 019f732a-180b-7571-86ed-e194c82e36d9
owner_review_required: false
owner_decision: accepted
owner_decision_date: 2026-07-18
subagents_drained: true
background_sessions_drained: true
---

# Terrain legibility contract and two-area semantic-mask pilot

## Owner decision

The owner approved the following pipeline on 2026-07-18:

> Semantic walkability mask first, art second, runtime polygons derived from
> that mask.

The owner also confirmed that the current painted ground is visually ambiguous
even to a human reviewer, so additional hand-tuning of collision polygons would
be false precision. Players must be able to predict walkability from the art
without seeing a debug overlay.

## Relay 19 stop boundary

Relay 19 stopped correctly when the remaining collision ambiguity proved to be
an art-language problem. Its revision 3 geometry and compositor edits are
diagnostic drafts only and are not verified or approved for runtime promotion.

- Owner accepted the revision 3 collision overlay as a useful diagnostic.
- Port Sapphire's draft mask has disconnected exterior west/north and southeast
  entrance components; its harbor interior is not walkable.
- The draft Sunken threshold stops outside the northeast wall and blocks the
  ruin shell.
- The draft compositor draws the hero above final occlusion and substitutes an
  intact upward-facing source row for the authored north row whose head is
  clipped at the 64-pixel cell boundary.
- Deterministic draft geometry passed: 18 regions, 16 disk-safe joins, 94
  walkable probes, 85 blocked probes, seven routes, two bridges, Crystal gate,
  sliding, normalized movement, dynamic route state, and the 5,000-step
  invariant.
- Full headed and preserved-artifact verification was intentionally stopped.
  Do not cite Relay 19 as a runtime pass.

Draft proof hashes:

- Runtime HTML twins: `023425829e3f23f2d2a910e241c0dc650026d12f4c67aa68fad3cdaf5af2c02c`
- Walkable geometry twins: `ab7614664476bc90e183472f5ffb622519c95a2a00ad039fc7699b79cb378750`
- Revision 3 review overlay: `382e18cc55f64bac9daf92bb0f7ff29aad9bf59e3c0f2c418ec9b75fa0c1a178`

Relay 18 immutable inputs remain:

- Manifest: `a36eebf18c651ee7749f2bcff7006e0ce5173b34dc2d3010767f0adbde0cef16`
- Adapter twins: `588b8db722c7a71890a0e45d0231e7a473789c3accce5beec15f15965ebc4526`
- Preserved bundle: `a56026574b42168985b353e4cee824562716af83f92d03f408df04eac9127381`
  (`4,987,581` bytes, 75 monsters)

Branch remains `codex/map-engine-semantic-data` at inherited HEAD
`c4f97d5e30762b8a16deff36602252759decce31`; preserve the shared dirty tree.
All Relay 19 agents and owned background sessions are drained.

## Single outcome

Create a locked terrain-legibility contract and two owner-review pilot areas
that prove this pipeline before any full-map repaint or runtime promotion:

1. Author semantic traversability first. Inspect the existing ground-mask
   encoding and runtime collision schema, then lock the smallest compatible
   lossless class encoding for walkable ground, blocked terrain, water,
   structures, and entrance/transition treatment. Do not invent a replacement
   encoding without first resolving the existing `0/127/255` contract.
2. Lock a visual grammar at exact phone scale. Walkable surfaces must read as
   continuous, flatter, lower-frequency ground; blocked rough terrain must have
   unmistakable elevation, rock/root density, cliff, water, structure, or
   boundary treatment. Mixed cues at an actor-reachable edge are a failure.
3. Produce two isolated pilots:
   - Greenhollow–Sunken: forest, rough ground, road/meadow, landmark threshold,
     and the single northeast ruin entrance.
   - Port–Coral: non-traversable Port interior, exterior entrance contacts,
     coast, bridge/channel, water, and Coral entrance continuity.
4. Preserve the approved landmark structures themselves. Repaint or regenerate
   only the surrounding ground/base and boundary cues needed to make the
   semantic mask legible. Use the locked landmark masters and composition
   contexts as anchors.
5. Derive candidate collision geometry mechanically from the semantic mask and
   render it as review evidence. The semantic mask—not an LLM trace of the final
   painting—is the source of truth.
6. End at owner review with route-hidden exact-phone contexts and a concise
   contact sheet. Do not promote pilots into the manifest, compositor,
   public/dist runtime, adapter, or preserved artifact.

## Failable gates

- A label-free `852x1846` review lets a human correctly predict walkable versus
  blocked surfaces without seeing the mask or polygon overlay.
- Mask, generated art, and derived collision share one coordinate system and
  the derivation is deterministic.
- Every entrance throat is visually explicit and agrees with its semantic mask.
- No generated art introduces walkable-looking pockets inside blocked terrain
  or blocked-looking clutter inside required passage widths.
- Approved landmark structures remain byte-identical unless the owner
  explicitly reopens one landmark.
- Relay 18 manifest, adapter, preserved bundle, routes, triggers, saves, and
  public/dist runtime remain byte-identical.
- Candidate generation, mask derivation, syntax, inventory, deterministic hash,
  and `git diff --check` checks pass.
- Fresh independent static and visual reviews inspect the pilots without being
  told the intended verdict.

## Non-goals

No full-map repaint, landmark-structure redesign, manifest cutover, runtime
promotion, public/dist synchronization, adapter/route/trigger/save change,
Vite/npm source build, legacy bundle replacement, branch/worktree, commit,
push, deploy, release, TestFlight, or App Store Connect action.

## Kickoff prompt

`[relay:edu-rpg-act1-overhaul:20]` — **Edu-RPG Relay 20 — Terrain Legibility
Contract and Two-Area Semantic-Mask Pilot**

Work only in
`/Users/christopherhachisu/Documents/claudecode/edu-rpg-map-engine-semantic-data`
on the existing shared dirty checkout; do not create a branch or worktree.
Resume from this handoff. Read parent/project `AGENTS.md`, `$edu-rpg`,
`$game-design`, `$imagegen`, `$coding-skill`, `$ponytail`,
`$relay-fresh-sessions`, `$session-relay`, the Relay 18 art verification and
five locked landmark contexts, the Relay 19 diagnostic overlay/geometry/tests,
and the existing ground-mask contracts before acting. Verify the exact task
title, handoff metadata, branch/HEAD/dirty tree, immutable hashes, and drain
ledger first.

The single outcome, gates, stop conditions, and non-goals are exactly those
above. Build the semantic contract first, then only the two isolated pilots.
Use image generation only after the mask and visual grammar are locked. Stop at
owner review; do not promote candidates. At the next verified boundary, drain
all owned agents and sessions before creating exactly one successor.

## Relay 20 owner-review result

Relay 20 reached the required owner-review stop on 2026-07-18. No successor was
created because owner judgment is the next dependency; creating Relay 21 now
would bypass the explicit stop condition.

Produced only:

- the locked two-plane terrain-legibility contract;
- the Greenhollow–Sunken semantic mask, candidate art, and exact derived
  collision;
- the Port–Coral semantic mask, candidate art, and exact derived collision;
- six anonymous art-only `852x1846` phone frames and one concise contact sheet;
- a deterministic inventory and verification ledger.

Canonical review paths:

- `design/review/overworld-art-blueprint/act-by-act/act1/runtime-v2/terrain-legibility-pilot-r20/TERRAIN-LEGIBILITY-CONTRACT.md`
- `design/review/overworld-art-blueprint/act-by-act/act1/runtime-v2/terrain-legibility-pilot-r20/VERIFICATION.md`
- `design/review/overworld-art-blueprint/act-by-act/act1/runtime-v2/terrain-legibility-pilot-r20/pilot-inventory.json`
- `design/review/overworld-art-blueprint/act-by-act/act1/runtime-v2/terrain-legibility-pilot-r20/evidence/terrain-legibility-owner-review-contact-sheet.png`

Final proof hashes:

- builder: `97111cfb011c727ff99b1805c3f59e3082e4ea104b9a9e76cb683e37839a3997`
- inventory: `eceb82c7e4857fe86cbdc2007c9734b943baaaac22aaeba6de86d7b659eb05f8`
- contact sheet: `e425790586bee19502ccc63121adb031166b11006eb22f09c43138a8f53037db`

Final gates:

- deterministic rebuild: PASS;
- exact mask-to-collision reconstruction: PASS, zero mismatch pixels;
- role, connectivity, blocked-probe, and preservation invariants: PASS;
- Relay 18/19 protected hashes: PASS;
- preserved Act 1 verify and eight-request static smoke: PASS;
- independent static review: PASS;
- first blind visual review: FAIL at Sunken, followed by a local threshold fix;
- fresh blind art-only review: PASS across all six frames;
- no candidate path outside `terrain-legibility-pilot-r20/`: PASS;
- no runtime, public/dist, manifest, adapter, route, trigger, save, bundle,
  branch, worktree, commit, push, deploy, release, TestFlight, or App Store
  Connect action: PASS.

Owner cautions to judge explicitly:

- Sunken's open courtyard may read as potentially walkable although the ruin
  body remains blocked.
- Port's upper clearing and dock/pier surfaces can read as inviting although
  Port interior and harbor structures remain blocked. Only the authored
  exterior contacts and bridge/landing transition are admitted.

Drain ledger at stop:

- `/root/contract_audit`: completed, read-only, no edits or processes;
- `/root/pilot_input_audit`: completed, read-only, no edits or processes;
- `/root/evidence_audit`: completed, read-only, no edits or processes;
- `/root/relay20_static_review`: completed after current-byte re-audit;
- `/root/relay20_blind_visual`: completed;
- `/root/relay20_blind_visual_fresh`: completed;
- owned background build/server/recorder sessions: none live.

Owner decision required: accept the two-pilot terrain-legibility contract and
its stated cautions, or request a narrowly scoped revision. Approval would not
authorize runtime promotion; the post-approval successor must be created only
after that decision.

## Owner acceptance

The owner replied “go with this” on 2026-07-18. Relay 20 is therefore locked as
accepted with its two documented cautions. The next authorized slice is
integration readiness only; it may derive and validate an adapter-ready package
and promotion plan, but it may not change any runtime consumer or promoted
artifact.
