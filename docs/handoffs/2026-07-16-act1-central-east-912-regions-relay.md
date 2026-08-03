---
date: 2026-07-16
type: handoff
project: edu-rpg
milestone: act1-central-east-912-regions
status: active
supersedes: docs/handoffs/2026-07-16-act1-cardinal-geometry-912-regions-relay.md
relay_chain_id: edu-rpg-act1-overhaul
relay_sequence: "04"
relay_status: blocked
relay_predecessor_thread_id: 019f6891-9ce7-7e50-8a06-6ccf2154c7ba
subagents_drained: true
background_sessions_drained: true
---

# Central-east batch implemented; north-fork boundary repair required

## Outcome

Relay 04 authored and integrated the first non-Port 912 batch:

- three new `1254 x 1254` image-generation masters for Millbrook west,
  Millbrook-to-Port, and the shared north fork;
- deterministic `57/32` reduction to exact `912 x 912` base/water/occlusion
  layers on a common palette and shared overlap lattice;
- four-region bounded detail streaming when combined with the existing Port
  source, with a `6`-chunk / `4`-detail-region ceiling and exercised eviction;
- exact authored coverage for Millbrook-to-Port and the shared north trunk
  through `(1870,1315)`, while Crystal Cave `(2166,1132)` remains excluded;
- expanded capture telemetry for explicit resource URLs, transfer/decoded
  bytes, loaded/required detail peaks, resident pixels, eviction, and pacing.

The code and mechanical gates pass, but the batch is not accepted: fresh
read-only review found a visible fuzzy legacy transition at the top/right exit
of the north-fork region. This is a Relay 04 continuation, not a Relay 05
boundary.

## Verification state

PASS:

- `python3 scripts/build_act1_central_east_lattices.py`
- `python3 scripts/build_act1_hifi_chunks.py`
- `python3 scripts/test_act1_hifi_chunks.py`
- bundled Node `scripts/test_act1_path_corridors.mjs`
- `pnpm run test:map-engine`
- JavaScript syntax checks and Python bytecode compilation
- exact `852 x 1846` video dimensions, route completion, zero visible asset
  misses, zero browser errors, boot cover, analog response, budgets, and
  eviction telemetry

FAIL:

- `port-sapphire-to-darkfang-traverse-852x1846.webm` around `17.3..20.3 s`;
- `port-sapphire-to-crystal-cave-traverse-852x1846.webm` around `16.9..19.9 s`.

Those intervals show sharp authored north-fork trees fading into the heavily
blurred legacy base through a moving 24-world-pixel feather. Full metrics and
the review verdict are in
`runtime-v2/CENTRAL-EAST-912-R04-VERIFICATION.md`; canonical evidence is in
`runtime-v2/central-east-912-v1/evidence/`.

## Locked decisions

- Work only in
  `/Users/christopherhachisu/Documents/claudecode/edu-rpg-map-engine-semantic-data`.
  The user may open `/Users/christopherhachisu/Documents` as the next task's
  workspace root solely to prevent repeated sandbox prompts.
- Preserve the dirty worktree and all Relay 04 outputs. No commit, push,
  deploy, publish, release, TestFlight/App Store Connect, branch, or worktree.
- No Vite, `npm run build`, `npx vite`, or legacy-source rebuild.
- Never sharpen/upscale the old raster. Any new visual coverage must come from
  genuinely new high-resolution authored source and deterministic 912/512
  reduction under the imagegen and game-design contracts.
- Do not expand dungeons or modify Crystal Cave. Preserve the Crystal seal.
- Preserve locked composition, all seven route geometries, bridges, blockers,
  semantic transitions/saves, geometry-only collision, cardinal G3, `125 ms`
  `0-A-0-B`, analog joystick, speed `52`, camera `208`, HUD, and Port detail.
- A wider blur is not a repair. The visible authored-to-fuzzy boundary must
  disappear in motion without a seam, feather pop, black flash, occlusion pop,
  asset miss, input hitch, or boot regression.

## Agent drain ledger

- `central_east_scope_audit`: completed read-only geometry audit; no files
  owned or modified.
- `central_east_master_batch`: generated three masters; outputs and hashes are
  recorded in `central-east-912-v1/PROVENANCE.md`; agent interrupted after its
  bounded work and no process remains.
- `relay04_fresh_review`: completed read-only review; reported the one P1
  north-boundary defect above; no repository writes.
- Owned static server unified session `40646`: stopped with Ctrl-C, exit `0`.
- Capture sessions `49543` and `96335`: completed exit `1` during earlier
  corrected attempts; capture session `3631`: completed exit `0` and produced
  the canonical evidence.
- Rechecked collaboration tree: no working, waiting, or idle child agents.

## Resume here

First inspect the two failing video intervals frame by frame and trace the
visible boundary against `north-fork-912-v1` bounds and its feather mask. Choose
the smallest genuine authored fix that removes the moving quality seam while
remaining entirely outside Crystal Cave. If new coverage is required, use a new
high-resolution imagegen master anchored to the existing composition and
palette; do not synthesize from the old raster. Rebuild in dependency order,
rerun all mechanical gates, recapture Darkfang/Crystal and then the full
traversal harness, and obtain fresh read-only review. Only after PASS should
this chain create **Act 1 Relay 05 — Western-Hub 912 Region Batch**.

## Paste-ready continuation prompt

`[relay:edu-rpg-act1-overhaul:04]` — **Act 1 Relay 04 — Central-East 912 Boundary Repair**

Open `/Users/christopherhachisu/Documents` as the Codex workspace root, but
work only in
`/Users/christopherhachisu/Documents/claudecode/edu-rpg-map-engine-semantic-data`.
Resume from
`/Users/christopherhachisu/Documents/claudecode/edu-rpg-map-engine-semantic-data/docs/handoffs/2026-07-16-act1-central-east-912-regions-relay.md`.
Read `/Users/christopherhachisu/.codex/skills/relay-fresh-sessions/SKILL.md`, repo
`AGENTS.md`, `docs/AGENT-WORKFLOW.md`, `docs/AUTONOMOUS-SESSION-RELAY.md`,
`design/ART-DIRECTION.md`, `design/GAME-FEEL.md`, runtime
`ACT1-HIFI-RUNTIME-CONTRACT.md`,
`FULL-WORLD-TRAVERSAL-R3-VERIFICATION.md`, and
`CENTRAL-EAST-912-R04-VERIFICATION.md` before acting. Verify the handoff
metadata, dirty tree, and absence of inherited live agents.

Single outcome: repair the P1 north-fork authored-to-fuzzy boundary visible in
the Darkfang video at `17.3..20.3 s` and Crystal video at `16.9..19.9 s`.
Inspect those intervals first. Use imagegen and game-design for any genuinely
new high-resolution source, then deterministic 912/512 palette/lattice
reduction. Do not widen a blur, sharpen/upscale the old raster, sample pixels
for collision, alter locked composition or route geometry, or modify Crystal
Cave.

Failable proof: exact `852 x 1846` motion across the repaired boundary with no
fuzzy fallback, seam/feather pop, black flash, occlusion pop, asset miss, input
hitch, or boot regression; explicit resource requests, transfer/decoded bytes
or resident-pixel equivalent, peak chunks/loaded and required detail regions,
eviction, and frame pacing. Preserve cardinal-only G3, `125 ms` `0-A-0-B`,
analog joystick, speed `52`, camera `208`, HUD, semantic transitions/saves,
bridges, blockers, Port detail, dirty worktree, and geometry-only collision.
Rerun all gates and obtain fresh read-only PASS.

The owner granted full access and will be away. Do not ask permission for
in-scope non-destructive work; ask only before destructive actions or when
owner input is genuinely required. Do not use Vite, `npm run build`, `npx
vite`, rebuild legacy source, commit, push, deploy, publish, release, alter
TestFlight/App Store Connect, create a branch/worktree, expand dungeons, or
modify Crystal Cave. After Relay 04 passes, use `$relay-fresh-sessions` and the
project relay rule to create exactly one Relay 05 task for the next authored
region batch.
