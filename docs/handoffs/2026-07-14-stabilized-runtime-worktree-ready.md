---
date: 2026-07-14
type: handoff
status: worktree-ready
project: edu-rpg
branch: codex/stabilize-runtime-baseline
runtime_head: 8775c0e
---

# Stabilized runtime — selective map rebuild ready

## Outcome

Quest of Knowledge now has a committed, reproducible local runtime baseline.
Use the tip of `codex/stabilize-runtime-baseline` as the base for new task
worktrees. Runtime implementation is pinned by `8775c0e`; the branch tip also
contains this handoff. Do not base map-engine work on `main` until this branch is
deliberately integrated.

Nothing was pushed, deployed, uploaded, or changed on `gh-pages` or App Store
Connect. The original dirty workspace and its ignored 4.99 MB `dist/` remain
untouched.

## Locked facts

- Profile: `v1.17.1-ipad-hud-walk`
- Runtime: 257 files / 42,683,025 bytes
- Bundle: 4,987,581 bytes
- Bundle SHA-256:
  `a56026574b42168985b353e4cee824562716af83f92d03f408df04eac9127381`
- Save keys: `edu-rpg-save`, `edu-rpg-autosave`; schema version 4
- Public regular monsters: 75 preserved unapproved candidates, all different
  from the 75 shipped runtime images
- Vite: removed; `npm run build` and `npm run dev` deliberately fail closed
- `npm ci` / audit: zero vulnerabilities at this head

## Proof completed

An external detached worktree at `/tmp/edu-rpg-stabilization-proof` proved:

1. baseline and candidate manifests verify;
2. `dist/` hydrates without Vite and exact verification passes;
3. static HTTP smoke passes;
4. rendered browser smoke loads v4 save, moves `(8,14)→(9,14)`, transitions
   Greenhollow→overworld, enters battle, loads 75 monster textures, and reports
   zero runtime errors;
5. Capacitor payload and built `.app` both match the runtime manifest;
6. isolated Xcode simulator build succeeds;
7. iPhone 17 Pro simulator launch renders the title screen, with no crash;
8. post-launch host process sample: about 3.4% CPU and 143,648 KB RSS.

Simulator proof image: `/tmp/edu-rpg-stabilization-sim.png`.

## Next milestone

Begin the selective map-engine rebuild in a new external worktree from
`codex/stabilize-runtime-baseline`.

The first implementation slice is semantic overworld data and collision before
new overlay art:

- trees become simply impassable road blockers;
- preserve semantic/collision data under the artwork;
- keep the locked natural dirt-trail visual direction;
- design minimap derivation from semantic data, not presentation pixels;
- do not generate the final terrain overlay until blocker topology is valid;
- do not inspect or reuse current dungeon floor layouts as topology references;
- never modify Crystal Cave generation.

Keep shared schemas/manifests lead-owned. Give each later town or dungeon its own
branch/worktree and location-specific data module; integrate shared engine work
serially.

## Worktree bootstrap

```bash
git worktree add -b codex/map-engine-semantic-data /absolute/external/path \
  codex/stabilize-runtime-baseline
cd /absolute/external/path
npm ci
npm run hydrate
npm run verify:runtime
npm run verify:candidates
npm run smoke:runtime
```

Do not run Vite. Do not copy broad `public/` directories over `dist/`. Do not
push, deploy, or sync a release unless the owner explicitly asks.

## Resume here

After repository `AGENTS.md`, read only:

1. `docs/handoffs/2026-07-14-stabilized-runtime-worktree-ready.md`
2. `docs/MAP-ENGINE-REBUILD.md`
3. `design/ART-DIRECTION.md`
4. `runtime/README.md`

Then inspect only the files directly required for the semantic overworld data
slice. The shipped opaque bundle is behavioral evidence and rollback material,
not an editable implementation target.
