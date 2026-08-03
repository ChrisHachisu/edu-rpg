---
date: 2026-07-16
type: handoff
project: edu-rpg
milestone: act1-off-route-residual-912-audit
status: active
supersedes: docs/handoffs/2026-07-16-act1-coastal-reef-912-regions-relay.md
relay_chain_id: edu-rpg-act1-overhaul
relay_sequence: "09"
relay_status: owner-review
relay_predecessor_thread_id: 019f6ac2-59ab-7fe1-9397-3011e84d4ae6
relay_successor_thread_id:
subagents_drained: true
background_sessions_drained: true
---

# Off-route residual audit requires a route-state owner decision

## Outcome

Relay 09 completed the exact discrete source-pixel census and did not author a
new 912 batch. Under the seven accepted route-local capture contexts, all
actionable walkable ground is authored. The remaining non-protected pure legacy
is `10,574` scenery-only pixels in five camera-edge components; none intersects
walkable ground or a retained landmark view. The largest is `4,999` featureless
forest pixels around `[2111,1482,2197,1585]`, visible from three route contexts
and peaking at `3.429%` of one worst-case off-center phone frame.

The literal manual-play surface is materially different. Normal input constrains
movement against all seven corridors, while detail affinity, semantic commits,
and the Crystal blocker remain frozen to the URL-selected `activeCorridor`.
Depending on that selected affinity, `8.701%..19.254%` of physically reachable
samples and `15.857%..29.768%` of observable samples are actionable pure legacy.
Every affinity context can reach a `77,168 / 77,168` fully legacy discrete phone
view because accepted route-affined details are hidden outside their selected
route.

This is a route-state ownership decision, not missing art. New masters cannot
fix it. Relay 10 was not created because `$relay-fresh-sessions` requires an
owner-review stop here.

## Verification

PASS:

- deterministic `scripts/audit_act1_offroute_residual.py` reproduced identical
  census, mask, overlay, component review, and canonical evidence inventory on
  two consecutive runs;
- revision-8 manifest SHA-256 remains
  `2e79b6770154df26b6918b770e79159b8622809face7005a5f6f7a9544806a3d`;
- Relay 01-07 inventories: `232 / 45 / 90 / 4` members, exact hashes and all
  four canonical aggregates;
- Relay 08 inventory: `22 / 22`, exact hashes and canonical aggregate;
- Relay 09 inventory: `4 / 4`, canonical aggregate
  `a585544b05b85b82579e5fc3402098095b9e1a6fa6a19aabfb96ff493dc44a73`;
- `python3 scripts/test_act1_hifi_chunks.py` — exact `2368 x 2912`, 30 chunks;
- bundled Node `scripts/test_act1_path_corridors.mjs` — all seven routes,
  blockers, seal, sliding, clamp, cardinal facing;
- bundled `pnpm run test:map-engine` — topology, determinism, collision,
  semantic gates, shell, retained behavior, replay, snapshot, and override;
- Python compile and AST review, `git diff --check`, and code check;
- exact `852 x 1846` static runtime inspection confirmed camera width `208`,
  stage `852 x 1518`, expected loaded resources, and preserved HUD;
- fresh read-only review PASS at `96%` confidence, no P0-P2 findings; its only
  derivative-evidence P3 was fixed and independently rechecked closed.

No Vite command, legacy build, image-generation call, accepted-artifact edit,
manifest edit, release, deployment, branch/worktree, commit, push, or external
state mutation occurred.

## Current state

- Worktree remains deliberately dirty on `codex/map-engine-semantic-data` at
  inherited HEAD `c4f97d5e30762b8a16deff36602252759decce31`.
- Manifest remains revision `8`; path constraints remain revision `2`; all 17
  accepted detail regions and every Relay 01-08 byte are preserved.
- Audit verdict:
  `runtime-v2/OFF-ROUTE-RESIDUAL-912-R09-AUDIT.md`.
- Deterministic evidence:
  `runtime-v2/off-route-residual-r09/evidence/`.
- The incoming delegation envelope named Relay 08's predecessor thread
  `019f6a8e-f6c5-7c01-891e-a20a1b5fb949`, while the active handoff named this
  Relay 09 task `019f6ac2-59ab-7fe1-9397-3011e84d4ae6`. Repository state and
  the explicit Relay 09 marker were treated as authoritative.

## Locked decisions

- Preserve all accepted Relay 01-08 bytes, the 17-region manifest, all seven
  routes, bridges, blockers, semantic transitions/saves, geometry-only
  collision, cardinal-only G3, `125 ms` `0-A-0-B`, continuous analog input,
  speed `52`, camera width `208`, HUD, Port detail, retained landmarks, and the
  Crystal seal/mouth.
- Never sharpen or upscale legacy pixels.
- Do not generate art until route-state semantics are owner-locked and a new
  census proves a bounded player-visible target.
- Keep the six-chunk/four-detail hard ceiling; affinity remains a correctness
  rule, not a ranking/truncation mechanism.
- Do not run Vite, rebuild legacy source, commit, push, deploy, publish, release,
  alter TestFlight/App Store Connect, create a branch/worktree, expand dungeons,
  or modify retained landmarks.

## Owner decision required

Lock whether the runtime is a route-specific review surface or a connected
playable graph. If it is connected playable Act 1, the recommended ownership is
one dynamic active-route state that changes atomically with detail affinity,
semantic projection/commits, and gates/blockers. If it is route-specific, manual
movement must not enter other corridors and the small scenery-only residual can
then be judged as an optional polish batch.

## Agent drain ledger

- `r09_residual_census`: completed a read-only independent census; identified
  the route-local versus literal manual all-corridor mismatch; changed no files.
- `r09_fresh_review`: completed read-only PASS at 96% confidence; independently
  verified arithmetic, components, hashes, runtime ownership, preservation, and
  the owner-review stop. Its one P3 reproducibility finding was fixed and the
  same reviewer rechecked it closed.
- Final collaboration re-list showed only completed children. No working,
  waiting, or idle child owns unfinished work.

## Background session drain ledger

- Owned static-server session `72446` was stopped with Ctrl-C and exit `0`.
- The in-app browser exact-phone tab was finalized and its temporary viewport
  override reset.
- Audit command cells `53`, `60`, and `61` completed; all other command cells
  completed in the foreground. No owned server, recorder, watcher, compiler,
  shell, or unified execution session remains live.

## Resume here

Read this handoff and
`runtime-v2/OFF-ROUTE-RESIDUAL-912-R09-AUDIT.md`, then obtain the owner route-
state decision before changing runtime or generating art. Do not create Relay
10 from this handoff until that product decision is explicit.

## Kickoff prompt after the owner decision

Work only in
`/Users/christopherhachisu/Documents/claudecode/edu-rpg-map-engine-semantic-data`.
Resume from
`docs/handoffs/2026-07-16-act1-off-route-residual-912-owner-review.md`. Read the
same repository, relay, runtime-contract, art-direction, game-feel, coding,
minimalism, and code-check instructions carried by Relay 09. Implement only the
owner-locked route-state meaning: either constrain manual play to the active
route, or make active route, affinity, semantic commits, and gates transition
atomically across the connected graph. Do not generate art in that runtime-
semantics slice. Preserve every Relay 01-08 byte and all locked behaviors. Run
the complete map-engine/path/semantic suites plus exact `852 x 1846` rendered
route and cross-junction motion, explicit resource/resident/stream telemetry,
code check, fresh read-only review, and the mandatory drain gate. Use
`$relay-fresh-sessions` at the next verified boundary.
