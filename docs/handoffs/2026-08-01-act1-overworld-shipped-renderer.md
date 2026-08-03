---
date: 2026-08-01
type: handoff
project: edu-rpg
milestone: act1-overworld-shipped-renderer
status: active
supersedes: "[[2026-08-01-act1-overworld-material-renderer-ios]]"
tags: [handoff, edu-rpg, overworld, act1, material-renderer, act1-hifi, ios]
---

# Handoff — Act 1 overworld: what actually ships — 2026-08-01

## The headline

**`public/dq-tiles.js`'s material-splat terrain is never drawn on the Act-1 overworld.**
`dist/act1-hifi/adapter.js:409` calls `scene.sys.setVisible(false)` on the base WorldMapScene for
the whole of `mapId === 'overworld'` and renders a **pre-baked 30-chunk iframe** over it. dq-tiles
only draws again once you enter a town or dungeon. The previous handoff's premise — that the
material renderer was live and merely unseen — was wrong.

Proved three ways, not inferred:

- The device screenshot **pixel-matches** a crop of `dist/act1-hifi/chunks/base/` at tile (60,341).
- Whole-map comparison: **same landmass geometry** (so the coordinate mapping is right) and
  **completely different art**.
- Shipped chunks are 2368x2912 for 148x182 tiles = **16 px/tile, dated Jul 19**. The material
  render is 7104x8736 = **48 px/tile, dated Jul 31**. Three times finer, twelve days newer,
  never displayed. On device one art pixel covers ~5.75 device px with hard NEAREST blocks —
  that is why the overworld reads soft next to the crisp hero sprite.

**A pin that is green proves identity, not reachability.** `verify-act1` pins `dq-tiles.js` and
the four materials by hash and passed throughout. Nothing in the gate asks whether the file it
pins is ever drawn. That is the gap to close, and it is not another hash.

## What shipped this session

**No commits — the dirty tree is preserved deliberately (217 entries).**

- **Act-1 overworld verified rendering in-game** on the iOS simulator in the real app build,
  driven end-to-end with synthetic taps. Screenshots in the session log.
- **ROAD LAYER: BUILT AND FULLY REVERTED THE SAME DAY. Do not rebuild it.** I read the material
  render's missing roads as an accidental gap and added a fifth `path` mask class plus a
  `make_road_mask.py`. **It was a deliberate design decision, not a gap.** Roads were removed from
  Act 1 by the roadless base (`2026-07-19-act1-polygon-conformance-roadless-base-g2.md`) and then
  ADR-0069's polygon-first ground authority: **unpainted ground is walkable, so the open country
  IS the walkable network** and there are no drawn routes by design.
  `2026-07-29-owner-painted-terrain-to-codex-art.md` states the gate explicitly — *"Only worth
  revisiting if the owner wants drawn routes in the art"* — and I did not ask. Reverted:
  `make_road_mask.py` and the roads mask deleted, `render_material_map.py` restored and **verified
  byte-identical** to its pre-change output. A comment at `LEGEND` now records why the fourth-class
  count is intentional, so the same inference is harder to make twice.
- **The class-`1` cells I generated from are the OLD corridor topology** (`act1-world-map.js`
  revision 5), which the roadless/painted-terrain direction superseded. They are not current
  design intent. Anything reasoning from them needs that caveat.

## Verification (run 2026-08-01)

- `runtime_baseline.py verify` — **VERIFY PASS**
- `runtime_baseline.py verify-act1 --input dist` — **ACT 1 OVERLAY VERIFY PASS**
- `node scripts/test_dq_tiles_terrain.cjs` — **16/16 ALL CHECKS PASSED**
- `test_runtime_baseline.py` — OK + **HYDRATE PASS**
- `smoke_static_runtime.py --act1-overlay` — **STATIC SMOKE PASS**
- **Bundle invariant HELD**: `dist/assets/index-BhoGQRaA.js` = 4,987,581 bytes,
  md5 `60d90b63607b6e6980eb170aeeed445e`.
- **Road-layer revert verified**: `render_material_map.py` renders **byte-identical (max channel
  diff 0)** to its pre-change output. The reverted experiment left nothing behind.
- Structure parity: `act1-world-map.js` `ROWS` vs `act1-hifi/manifest.json` `semanticRows` —
  **26936/26936 cells identical**. Only the art differs between the two runtimes.

## Locked decisions

- **ACT 1 IS ROADLESS BY DESIGN — the open country is the walkable network.** Roadless base
  (2026-07-19) then ADR-0069 polygon-first. Adding drawn routes is an owner decision, per
  `2026-07-29-owner-painted-terrain-to-codex-art.md`. Do not infer a missing road class is a bug.
- **Owner, 2026-08-01: "I leave it up to you how to rebuild the overworld mechanics, but I want
  the latest design and structure to be used."** Latest art = the material render; latest
  structure = already identical across both runtimes.

## Gotchas

- **`act1-material-map.png` has NO provenance record (`UNKNOWN`).**
  The whole-map comparison figure shown to the owner used it. Register it before it is
  presented as current art again. (Regeneration is ~7 min, `--full --strip 1456`, background run.)
- **A full chunk re-bake is a three-layer job, not one.** `base` (RGB), `water` (RGBA) and
  `occlusion` (RGBA — the tree canopy the hero walks behind) are composited by `runtime.html`.
  Re-baking `base` alone leaves the old canopy floating over new terrain. `render_material_map.py`
  emits a single flat RGB image and has **no canopy/alpha output** — that is the real work.
- **Payload**: base 11 MB + occlusion 7.9 MB at 16 px/tile. Re-baking at 48 px/tile is ~9x. The
  softness on device is the 16 px/tile source, so resolution and payload have to be decided
  together.
- **`src/` and `dist/` have diverged and dist is what ships.** dist has **no `tryDevStartFromUrl`**,
  so the `?dev=1&map=overworld` jump in `src/scenes/TitleScene.ts` **does not exist in the running
  game** — the only route to the overworld is playing out of Greenhollow. Conversely dist HAS touch
  controls (28 `pointerdown`) that `src/scenes/WorldMapScene.ts` lacks entirely. **Read dist.**
- **"WKWebView ignores synthetic touch injection" is FALSE.** Taps reach the game fine. The prior
  session's failures were **Start Game silently no-opping until Hero Name is non-empty**. Do not
  ask the owner to hand-click.
- **Do not read tap coordinates off the MCP panel screenshot** — it is not a uniform scale of the
  device. `xcrun simctl io <udid> screenshot` gives a true 1206x2622 and **tap-point = px / 3
  exactly** (verified by predicting a button and hitting it).
- **Overworld traversal is ~2 tiles/s at ~13 tiles across — normal.** An earlier read of
  "unplayably slow" was wrong; the hero was walking into blocked terrain. Measure by frame
  cross-correlation, do not trust the impression.
- The overworld's **ghosted/doubled status bar and bottom nav** are the iframe's UI over the base
  game's, which `adapter.js` only hides via `body.act1-hifi-active #touch-controls`/`#qok-field-hud`.
  Town screens on the same device minutes earlier are clean.

## Resume here (load-on-demand — do NOT eager-read the corpus)

**Distilled state:** The Act-1 overworld renders in-game on iOS, but what renders is the **Jul 19
act1-hifi chunk art**, not the material renderer. Structure is already shared and current between
the two runtimes; only the art differs. **Act 1 is roadless by design** — a road layer built this
session was reverted the same day as an unauthorised design change. The open decision is how to
land the material art in the shipped runtime.

| purpose | path | read when |
|---|---|---|
| why the material renderer is not on screen | `dist/act1-hifi/adapter.js` (`suppressLegacyWorldRender`, `tick`) | anything about what the overworld draws |
| why Act 1 has no roads | `docs/handoffs/2026-07-19-act1-polygon-conformance-roadless-base-g2.md`, `2026-07-29-owner-painted-terrain-to-codex-art.md` | before touching routes/paths at all |
| the renderer | `scripts/render_material_map.py` (`LEGEND` comment first) | changing terrain appearance |
| the method | `docs/MATERIAL-RENDERER-METHOD.md` | changing any renderer behaviour |
| locked topology (rev 5 — pre-dates the roadless direction) | `public/act1-world-map.js` | walkability, gates |
| chunk geometry + hashes | `dist/act1-hifi/manifest.json` | any re-bake |
| Act-1 gate + pins | `scripts/runtime_baseline.py` | after changing dq-tiles.js or materials |
| owner terrain (INPUT — never rewrite) | `.../owner-terrain/owner-terrain.json` | landmark positions |

**Next actions, in order:**
1. **Decide how the material art lands.** Re-baking the act1-hifi chunks keeps the runtime and its
   gameplay (walkable polygons, path corridors, gates, HUD) but needs a canopy/occlusion output
   added to the renderer and a resolution/payload call.
2. **Add a reachability check to the Act-1 gate** so "pinned but never drawn" fails loudly.
3. Register `act1-material-map.png` with the provenance system — it currently has NO record.

## Kickoff prompt (paste verbatim into next session)

```
Continue the edu-rpg act-1 OVERWORLD in /Users/christopherhachisu/Documents/claudecode/edu-rpg-map-engine-semantic-data (branch codex/map-engine-semantic-data).

READ FIRST, in full: docs/handoffs/2026-08-01-act1-overworld-shipped-renderer.md

STATE: The Act-1 overworld renders in-game on iOS, but what renders is the pre-baked act1-hifi chunk art (16 px/tile, Jul 19) — NOT public/dq-tiles.js's material renderer, which act1-hifi's adapter hides for the whole overworld via scene.sys.setVisible(false). The semantic STRUCTURE is already identical across both runtimes (26936/26936 cells). ALL GATES GREEN: verify, verify-act1, 16/16 node test, runtime-tools, smoke.

OWNER DIRECTION (2026-08-01): "I leave it up to you how to rebuild the overworld mechanics, but I want the latest design and structure to be used."

ACT 1 IS ROADLESS BY DESIGN — unpainted ground is walkable, so the open country IS the walkable network (roadless base 2026-07-19, then ADR-0069 polygon-first). A road layer built earlier this session was REVERTED the same day as an unauthorised design change; render_material_map.py is verified byte-identical to before it. Do not re-add roads without the owner asking.

FIRST TASK: decide how the material art lands in the shipped runtime. Re-baking the act1-hifi chunks keeps that runtime and its gameplay (walkable polygons, path corridors, gates, HUD), but it is a THREE-layer job — base, water, and occlusion (the tree canopy the hero walks behind) — and render_material_map.py currently emits one flat RGB image with no canopy/alpha output. Payload matters: base 11 MB + occlusion 7.9 MB at 16 px/tile, ~9x that at 48.

ALSO OPEN: add a reachability check to the Act-1 gate (a green hash pin proved identity, not that the file is ever drawn — that is how this went unnoticed for twelve days); REGISTER act1-material-map.png with the provenance system, it currently has NO record (UNKNOWN).

DO NOT RE-DIAGNOSE: the Browser pane "preview boot failure" is document.hidden freezing rAF. Test on the simulator. And synthetic taps DO reach the game — Start Game just silently no-ops until Hero Name is non-empty. Read tap coords from `xcrun simctl io <udid> screenshot` (true 1206x2622, tap-point = px/3), NOT from the MCP panel screenshot, which is not a uniform scale.

HARD INVARIANTS: preserve the dirty tree, NO commits, NO builds, never npm run build or npm run dev (both wired to a blocked-build script). dist/assets/index-BhoGQRaA.js must stay byte-identical at 4,987,581 bytes, md5 60d90b63607b6e6980eb170aeeed445e — verify before finishing. owner-terrain.json and owner-terrain.raw-export.json are the owner's INPUT; edit ONLY with owner authorisation and ALWAYS append to their _edits log. After ANY edit to public/dq-tiles.js: re-run node scripts/test_dq_tiles_terrain.cjs, re-copy to dist/, update the pin in scripts/runtime_baseline.py, then verify-act1. Never glob a destructive pass over design/.../landmark-sprites/. Image generation is codex exec -m gpt-5.6-sol --skip-git-repo-check.

BUDGET: the owner is cost-constrained. This session spent ZERO generation tokens. Keep it that way; do not launch generation runs without asking. And check the design record before "fixing" something that looks missing — the road episode above was exactly that mistake.
```
