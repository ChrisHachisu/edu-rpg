---
date: 2026-07-17
type: handoff
project: edu-rpg
milestone: act1-preserved-artifact-walkable-cutover
status: owner-rejected
supersedes: docs/handoffs/2026-07-17-act1-walkable-polygons-runtime-v2-relay.md
relay_chain_id: edu-rpg-act1-overhaul
relay_sequence: "10"
relay_status: owner-rejected-after-completion
relay_predecessor_thread_id: 019f6ac2-59ab-7fe1-9397-3011e84d4ae6
relay_successor_thread_id: null
subagents_drained: true
background_sessions_drained: true
---

# Act 1 walkable polygons are cut into the preserved playable artifact

## Owner rejection received after cutover

The owner rejected the underlying route-first boundary overlay on 2026-07-17.
The cutover and mechanical proof below are therefore not an accepted gameplay
boundary. They show only that the additive adapter faithfully runs the rejected
geometry. Do not cite this handoff as visual acceptance and do not refine the
existing polygons region by region.

The only valid continuation is a fresh visual-mask-first trace made with all
routes, waypoints, semantic anchors, and prior polygons hidden. Trees, water,
mountain/cliff faces, buildings, landmark bodies, and bridge drop-off edges are
non-walkable; visible open ground, explicit passes, bridge decks/landings, and
entrance throats are walkable. Lock the full-map mask before deriving polygons
or restoring semantic routes.

## Outcome

The exact verified Act 1 `runtime-v2` walkable-polygon and painted-route-state
implementation now runs inside the preserved playable artifact through one
additive module adapter. The preserved bundle was not rebuilt, replaced, or
shrunk. Its size remains 4,987,581 bytes and SHA-256 remains
`a56026574b42168985b353e4cee824562716af83f92d03f408df04eac9127381`.

The adapter hosts the locked runtime in a same-origin full-screen iframe while
the preserved `WorldMapScene` is active on the overworld, suppresses only the
legacy world render/movement path, and commits painted-route semantic cells,
route affinity, transitions, saves, reloads, minimap state, and step behavior
back through the real preserved scene. Leaving the overworld restores the
legacy scene and parent keyboard focus; a physical ArrowDown proof moves the
Title selection from 0 to 1 with `document.activeElement === BODY`.

No Relay 01-08 accepted art or retained landmark was edited. All seven routes,
both bridges, blockers, Crystal seal/mouth, cardinal-only G3, 125 ms
`0-A-0-B`, continuous analog input, speed 52, camera width 208, HUD, Port
detail, and semantic save format remain locked.

## Additive cutover files

- `public/act1-hifi/adapter.js` — preserved-scene adapter, semantic bridge,
  input/focus lifecycle, and telemetry API.
- `public/act1-hifi/` — exact 148-file revision-8 runtime mirror.
- `dist/act1-hifi/` — byte-identical playable-artifact mirror (ignored output,
  present and verified locally).
- `index.html` and `dist/index.html` — one additive module-script load after the
  preserved overrides.
- `scripts/export_act1_preserved_cutover.mjs` — deterministic source-to-public/
  dist export and byte-identity check.
- `scripts/capture_act1_preserved_cutover.cjs` — exact-phone live-artifact gate.
- `scripts/runtime_baseline.py` — additive overlay verifier that preserves the
  locked baseline and checks the exact runtime path set and bytes.
- `design/review/overworld-art-blueprint/act-by-act/act1/runtime-v2/preserved-cutover-v1/phone-evidence/`
  — seven bound route screenshots/checkpoints and consolidated telemetry.

## Identity and proof binding

- manifest revision 8 SHA-256:
  `2e79b6770154df26b6918b770e79159b8622809face7005a5f6f7a9544806a3d`;
- final public/dist adapter SHA-256:
  `15d700f0f1ec3827eca5e984d739f5a40b6e3a225f5d4989f86de0f70b199992`;
- executable runtime/collision combined SHA-256:
  `3ddd7a8fb0fb4e3e5c91cb1460af9b0b79caf773f2d816b1b2f4a0c24101efce`;
- preserved bundle SHA-256:
  `a56026574b42168985b353e4cee824562716af83f92d03f408df04eac9127381`.

The combined runtime hash covers `index.html`, `walkable-regions-v1.json`,
`walkable-polygons.js`, `walkable-route-state.js`, and `path-corridor.js`.
Every route checkpoint binds all four hashes above, reports exactly one
adapter-owned parent transition, and is rejected when any binding drifts.
All 148 runtime files match both public and dist targets: 296 comparisons,
zero mismatches.

## Live preserved-artifact proof

PASS at exact `852 x 1846`:

- all seven route endpoints and real preserved transitions: Sunken Cellar,
  Whispering Woods Cave, Millbrook, Port Sapphire, Coastal Reef, Misty Grotto,
  and Crystal Cave;
- broad Greenhollow physical free-roam on four cardinal legs, painted-road
  ownership selection, and semantic save/reload;
- Port-to-Crystal shared trunk/fork selection, one route switch, outbound
  Crystal affinity, and reversal release;
- physical Title key routing after iframe release (`BODY`, selection 0 to 1);
- first-input response 37.1 ms, maximum runtime frame work 0.6 ms, zero
  over-budget frame-work samples;
- at most 6 loaded chunks, at most 4 required/resident details, explicit
  resource/resident byte telemetry, and zero asset/detail misses;
- no browser errors, fuzzy-boundary failure, seam, pop, flash, input hitch, or
  boot regression observed.

## Deterministic suites

PASS:

- exact 2368 x 2912 reconstruction with 30 bounded chunks;
- G1, G2, and cardinal-only G3 hero contracts;
- seven path corridors, blockers, seal, sliding, clamping, and no tunneling;
- 19 walkable regions, 18 disk-safe joins, 90 walkable and 75 blocked probes,
  two bridges, dynamic route state, and 5,000-step invariant;
- runtime override snapshot/export/test identity;
- TypeScript map-engine compile plus semantic map, corridor masks, Act 1
  overworld, shell/save, and retained-later-gate suites;
- shipped overworld DQ replay, runtime snapshot check, static smoke, baseline
  verification, additive overlay verification, syntax checks, Python compile,
  and `git diff --check`;
- preserved browser boot/load/movement/overworld/battle/75-monster smoke with
  zero errors.

The headless SwiftShader capture was not used as a performance verdict because
its occluded renderer was scheduler-throttled. The accepted performance proof
was rerun headed with native WebGL and background throttling disabled; thresholds
were not loosened.

## Independent review

The fresh read-only reviewer first identified and then verified closure of:

- adapter input remaining active after `WorldMapScene` stopped;
- evidence bypassing the adapter transition path;
- stale/partial checkpoint bindings;
- the wrong input clock and unenforced frame-work gate;
- hidden iframe focus surviving release.

Final verdict: clean, no actionable findings. The reviewer independently
reproduced parent focus restoration and physical Title input, all seven bound
adapter transitions, 296 runtime mirror comparisons, public/dist adapter
identity, preserved bundle identity, syntax checks, and diff checks.

## Repository and prohibition ledger

- Branch remains `codex/map-engine-semantic-data` at inherited HEAD
  `c4f97d5e30762b8a16deff36602252759decce31` with the shared dirty worktree
  preserved.
- No Vite command, `npm run build`, `npx vite`, legacy shipped-source rebuild,
  commit, push, deploy, publish, release, TestFlight/App Store Connect change,
  branch/worktree creation, art generation, dungeon expansion, retained-
  landmark edit, or later-act polygon authoring occurred.

## Drain ledger

- `independent_runtime_review`: completed two corrective reviews and a final
  clean closure review; no child agents were spawned.
- The exact-phone capture, deterministic suites, and browser smoke exited.
- The temporary static server is stopped before relay close.
- Final collaboration and process inspection contains no inherited or owned
  live agent/browser/capture/background session.

## Next bounded objective

No automatic successor task was created. The next owner-selected relay may
consume this verified boundary, but must preserve the additive artifact, all
identity hashes and prohibitions above, and must not author later-act polygons
before those acts' final paintings are locked.
