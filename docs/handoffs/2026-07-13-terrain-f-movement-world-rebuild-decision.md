---
date: 2026-07-13
type: handoff
project: edu-rpg
milestone: terrain-f-movement-world-rebuild-decision
status: active
supersedes: 2026-07-11-v17-hero-1px-world-ios-tf.md
---

# Handoff: Terrain F, movement, and world-rebuild decision

## Outcome

The owner approved the darker, realistic old-growth direction shown in
`design/review/visual-quality/terrain-round2/terrain-F-realistic-old-growth-mock.png`.
Characters should become detailed chibi art of comparable material, lighting,
and finish. No movement, collision, terrain, town, or dungeon rewrite has been
authorized or started. The next session must answer the architectural questions
below before editing.

Recent asset state: 58 item icons and 75 HD monster assets exist. The Terrain F
image is a visual mock only, not a runtime map.

## Verification

- Branch: `main`; preserve the heavily dirty worktree.
- Shipped bundle: `dist/assets/index-BhoGQRaA.js`, 4,987,581 bytes.
- Current movement is one-tile-at-a-time: a 150 ms `Sine.easeInOut` tween,
  guarded by `isMoving`, in bundle lines 78955-79270.
- Each completed tile invokes `onStep`, position/HUD updates, fog, pickups,
  ice/quicksand/lava, mirrors, encounters, and other map mechanics.
- `canMove` is tile-ID logic specialized for overworld, towns, and dungeons.
  Overworld tree tile `3` is currently passable; visual trees are not independent
  physics bodies.
- `public/dq-tiles.js` is primarily a render override, but selected mountain
  consolidation mutates `mapData` so render, minimap, and collision agree.
- No current quantitative FPS or memory trace exists for Terrain F quality.
- No code or runtime asset was changed during this handoff slice.

## Locked decisions

- Direction: dark, dense, realistic old-growth environments with detailed chibi
  characters; preserve strong silhouettes and path readability.
- Do not ship the mock as a giant scrolling bitmap or thousands of independent
  tree sprites. The candidate runtime design is prebuilt atlases plus layered,
  culled chunks.
- Preserve the 4.99 MB shipped artifact. Never run the stale Vite build.
- Test motion and memory on the separate edu-rpg iPhone simulator; use video for
  movement judgment.
- Full character/environment production waits for a playable vertical slice.

## Questions the next session must answer

1. Is the desired feel best achieved by continuous visual motion with buffered
   input while retaining the logical tile grid, or by genuinely free analog
   movement and collision?
2. What breaks under each option: encounters/step count, NPC/shop interaction,
   doors and portals, puzzles, ice/wind/quicksand/lava, fog, minimap, camera,
   saves, dungeon generation, and touch controls?
3. Should forest blocking remain a logical navigation/collision mask beneath
   the artwork, or become object/physics collision? How are trunks blocked while
   canopies occlude the hero naturally?
4. Are underlying tiles still the correct semantic layer even if they are no
   longer visible? Which data must remain grid-based?
5. Can overworld, towns, and dungeons share one movement/collision contract, and
   how should their art be upgraded without a big-bang rewrite?
6. Is this safe to begin now? Recommend a reversible sequence, measurable gates,
   rollback boundaries, and the smallest representative vertical slice.

## Risks and blockers

- A direct free-movement swap can silently break tile-entry mechanics and save
  compatibility even if walking looks correct.
- Dense individual tree sprites would amplify overlay rebuild stalls. Forests
  need layered chunks or atlases with bounded collision data.
- Current source is stale relative to the shipped bundle; any required gameplay
  change needs a guarded bundle patch or an additive runtime interception.
- Terrain F performance is unproven until measured on the dedicated simulator.

## Resume here

Read `AGENTS.md`, this handoff, the architecture and verification sections of
`docs/PROJECT-RUNBOOK.md`, `design/ART-DIRECTION.md`, `public/dq-tiles.js:1`, and
`dist/assets/index-BhoGQRaA.js:78955`. Inspect the Terrain F mock. Do a read-only
architecture assessment first. Answer the owner with a clear recommendation,
breakage matrix, phased migration, and proof criteria. Do not implement, generate
assets, deploy, or alter App Store Connect unless the owner subsequently asks.

## Kickoff prompt

```text
Resume Quest of Knowledge from
/Users/christopherhachisu/Documents/claudecode/edu-rpg/docs/handoffs/2026-07-13-terrain-f-movement-world-rebuild-decision.md.

Read the repository AGENTS.md first and follow the edu-rpg skill. Then read only
the files listed in the handoff's Resume here section. Preserve the dirty tree
and the 4.99 MB shipped bundle; never run the stale Vite build.

The owner approved Terrain F's dark realistic old-growth direction and matching
detailed-chibi character quality. Before any implementation, answer these
questions: Can movement become genuinely smooth? Would continuous/grid-buffered
movement or fully free analog movement be safer? What would each option break?
How should dense trees become impassable while their canopies occlude the hero?
Do we retain invisible semantic tiles/collision masks? How should overworld,
towns, and dungeons migrate to the new quality, and is this a change we can
safely start now?

Ground the answer in the shipped runtime. Include a breakage/dependency matrix,
a recommended architecture, a reversible phased plan, save-compatibility and
rollback strategy, and simulator performance gates. Do not edit code or generate
assets in this first response; the owner wants the decision before execution.
```
