---
date: 2026-08-02
type: handoff
project: edu-rpg
milestone: act1-town-screens
status: active
supersedes: "[[2026-08-01-act1-port-sapphire-town-screen]]"
tags: [handoff, edu-rpg, act1, towns, port-sapphire, ios, capacitor]
---

# Handoff — Act 1: Port Sapphire is in the game, adapter gated to towns — 2026-08-02

> Sibling workstream to `2026-08-02-act1-collision-must-follow-owner-paint.md` (that one owns the
> OVERWORLD collision rebuild). This one owns TOWN SCREENS. They do not overlap: nothing here
> touches `act1-world-map.js`, `ROWS`, `semanticRows`, or `act1-smoothed-semantic.png`.

## The headline

Port Sapphire is **playable inside the real iOS app**. The overlay that used to hijack the
overworld is now **towns only**, because that overworld runtime was never a runtime — it is a
desktop design mockup.

## What shipped

Nothing committed. HEAD unchanged at `c4f97d5`; the whole slice is untracked work under
`public/act1-hifi/`, `design/act1-towns/`, `scripts/`, mirrored into `dist/act1-hifi/` and
`ios/App/App/public/act1-hifi/`.

| file | what |
|---|---|
| `design/act1-towns/portSapphire-screen-v5-graded.png` | **the town artwork.** 1885x1885, real harbour, organic streets, colour-graded |
| `public/act1-hifi/town.html` | **the town runtime** (new). Separate from `runtime.html` by design |
| `public/act1-hifi/adapter.js` | gate now **towns only** |
| `public/act1-hifi/portSapphire-walkable-v1.json` | collision **derived from the painting** — 414-pt outer, 5 holes, 70 staticObstacles |
| `design/act1-towns/npc/*.png` | 4 NPC sheets, 192x256 (3 cols x 4 rows of 64) |
| `design/act1-towns/portSapphire-npc-placement.json` | NPC / savePoint / shopCounter cells + the *why* for each |
| `scripts/derive_town_walkable.py` | painting -> polygons, self-auditing |
| `scripts/grade_town_screen.py` | per-class colour grade |
| `scripts/check_character_finish.py` | **failable gate**: field-character finish vs the heroine |
| `scripts/bake_npc_sheets.py`, `place_town_npcs.py`, `render_town_hero_proof.py` | keying, placement, proof |
| `design/act1-towns/portSapphire-authored-obstacles.json` | the well — authored, not derived |

## Verification

- **Xcode:** `App` scheme, iOS Simulator — **BUILD SUCCEEDED, 0 errors**, 11 warnings (all
  pre-existing Capacitor `WKProcessPool` deprecations). Launched on iPhone 17: full-screen native,
  no Safari chrome, title + Create-Your-Hero with the native keyboard.
- **Collision authority:** `validateWalkableGeometry()` run under node against
  `portSapphire-walkable-v1.json` → **VALID**. All 6 anchors pass on-walkable + south-approach.
- **NPC finish gate:** `check_character_finish.py` → **4/4 PASS** (and it correctly FAILS the
  retired outlined batch in `npc/v1-outlined/`).
- **Bundle health:** `dist/assets/index-BhoGQRaA.js` = **4,987,581 bytes**, 75 monsters. Untouched.
- **No typecheck / lint / jest.** This slice produced no application TypeScript — only static
  assets, standalone Python tooling, and one vanilla-JS runtime. `npm run build` / `vite` remain
  forbidden (`AGENTS.md`); the iOS app was populated by copying `dist/`, never by rebuilding it.

## Live state (verified 2026-08-02)

- **HEAD:** `c4f97d5` "docs: point handoff at stabilization branch tip", branch
  `codex/map-engine-semantic-data` — `git log --oneline -1`, `git branch --show-current`.
- **Nothing committed, nothing deployed.** No TestFlight/ASC action taken or pending.
- **iOS app builds and runs** from `ios/App/App.xcworkspace`; built product at
  `~/Library/Application Support/Claude/simulator-builds/a2bf99a45f3a205e/DerivedData/Build/Products/Debug-iphonesimulator/App.app`.
- **Three copies must stay in sync** — `public/act1-hifi/`, `dist/act1-hifi/`,
  `ios/App/App/public/act1-hifi/`. All three verified byte-identical for `adapter.js` and
  `town.html` at write time.

## Locked decisions

- **OWNER 2026-08-02: the act1-hifi overlay is TOWNS ONLY.** `adapter.js` no longer engages on
  `overworld`; `enterAct1()` is now dead code, left in place deliberately rather than ripped out
  at session end.
- **OWNER 2026-08-02: test in the real iOS app, not mobile Safari.**
- **OWNER 2026-08-01: NPCs are stationary — commission the front-facing row only.** Future NPC
  batches are 1 row, not 4 (4x saving).
- **OWNER 2026-08-01: every NPC is approached from the SOUTH** — >= 2 cells of open walkable
  ground directly below.
- **OWNER 2026-08-01: the town perimeter is no longer mandatory** — `LANDMARK-SPRITE-CONTRACT.md`
  amended; the binding rule is consistency with the town screen.
- **OWNER 2026-08-01: stone tone = cooler**, `--ground-br 0.88` (the violet guard binds first).
- **Field characters have NO keyline** — `ART-DIRECTION.md` amended; the STYLE BLOCK's outline
  rule is battle-monsters-only.

## Gotchas for next session

- **`runtime.html` is a DESIGN MOCKUP, not a runtime.** `<div id="phone">` + a hardcoded "9:41"
  status bar + fake Dynamic Island + duplicate HUD + duplicate bottom nav; its canvas calls itself
  a *"phone motion mockup"*. It also streams `chunks/`, the **scrapped** dark painterly overworld.
  Do not resurrect it for the overworld without stripping the chrome and repointing at
  `act1-material-map.png`.
- **The Claude browser pane is `visibilityState: hidden`.** That pauses rAF, **stalls the Phaser
  loader** (43 queued / 0 in-flight / 0 failed), and clamps `setTimeout` to ~1s. Workarounds:
  `load.checkLoadQueue()` + `load.update()` to drain, **synchronous** `game.loop.step(t)` to
  advance, and never `await setTimeout`. **`adapter.js` cannot be driven this way** — it captured
  the real rAF at module load. Anything involving the adapter must be tested in the iOS app.
- **The MCP `screenshot` action errors intermittently**; `xcrun simctl io <udid> screenshot <f>`
  always works. The simulator also shut itself down twice (`machPortNotConnected`) — recover with
  `xcrun simctl boot <udid>`.
- **iOS long-press selects game text.** Holding the movement pad raised the Copy/Look Up callout;
  fixed with `user-select:none` + `-webkit-touch-callout:none` on `#stage`. Applies to any new
  in-game HTML UI.
- **Props classify as paving.** A sunlit barrel is RGB(148,135,125) vs cobble (174,158,136).
  Colour and texture cannot separate them — the derivation is structural, and the residual is
  encoded as `staticObstacles` by a self-audit. **The well is authored, not derived.**
- **The shipped town entry (`connections[0]`, 8,15 of a 16x16 grid) is the BOTTOM edge**, which at
  Port Sapphire is open sea. Town start cell is the north trail mouth (33, 4).

## Resume here (load-on-demand — do NOT eager-read the corpus)

**Distilled state:** Port Sapphire's art, collision, NPCs and services are done and wired; the
adapter is gated to towns; the iOS app builds and runs. **The single next task: rebuild the iOS
app with the towns-only adapter and confirm in-app that (a) the overworld renders as the shipped
tile map with no fake phone, and (b) entering Port Sapphire raises the town overlay and its
shop/healer/save suspend-and-restore correctly.** That last cycle has never run in a foreground
session and is the only unverified piece.

| purpose | path | read when |
|---|---|---|
| town runtime | `public/act1-hifi/town.html` | changing town behaviour |
| the gate | `public/act1-hifi/adapter.js` (`TOWN_IDS`, `enterTown`, `suspendTownOverlay`) | anything about entering/leaving towns |
| NPC / service anchors | `design/act1-towns/portSapphire-npc-placement.json` | moving anyone |
| collision derivation | `scripts/derive_town_walkable.py` | re-deriving after an art change |
| art brief discipline | `docs/ART-GENERATION-PREFLIGHT.md` | **before any Codex art call** |
| canonical hero + scale | `docs/CANONICAL-ASSETS.md` | any visual work |
| overworld collision slice | `docs/handoffs/2026-08-02-act1-collision-must-follow-owner-paint.md` | if the task touches the overworld |

## Kickoff prompt (paste verbatim into next session)

```
edu-rpg, Act 1 town screens — finish verifying Port Sapphire inside the iOS app.

Work in the worktree /Users/christopherhachisu/Documents/claudecode/edu-rpg-map-engine-semantic-data
(branch codex/map-engine-semantic-data). A CONCURRENT session owns the overworld collision
rebuild (docs/handoffs/2026-08-02-act1-collision-must-follow-owner-paint.md) — do not touch
act1-world-map.js, ROWS, semanticRows or act1-smoothed-semantic.png.

Pre-flight reads, in this order, and nothing else:
  1. docs/handoffs/2026-08-02-act1-port-sapphire-in-app.md   (this handoff — the gotchas matter)
  2. docs/CANONICAL-ASSETS.md

State: Port Sapphire's artwork, derived collision, 4 NPCs and shop/healer/save are all built and
wired. adapter.js is now gated to TOWNS ONLY (owner decision) — it no longer takes over the
overworld, because runtime.html is a desktop design mockup that draws a fake phone (hardcoded
"9:41" status bar, fake Dynamic Island, duplicate HUD/nav) and streams the scrapped dark
painterly overworld chunks. The gate change is synced to dist/ and ios/App/App/public/ but the
iOS app has NOT been rebuilt since.

THE ONE TASK: rebuild the iOS app and verify in-app, with screenshots:
  a) the overworld renders as the shipped tile map, with NO fake phone chrome
  b) entering Port Sapphire raises the town overlay (v5 painting, 4 NPCs)
  c) shop / healer / save each open the shipped UI and the overlay SUSPENDS then RESTORES
     (adapter.js: suspendTownOverlay / restoreTownOverlay / shippedUiBusy)

How to build and run — the app, not Safari:
  workspace ios/App/App.xcworkspace, scheme "App", via the simulator MCP build tool, then
  control{action:"launch", app_path:<built .app>}. Sync first:
    rsync -a --delete dist/act1-hifi/town/ ios/App/App/public/act1-hifi/town/
    cp dist/act1-hifi/{town.html,adapter.js,walkable-polygons.js} ios/App/App/public/act1-hifi/
  Do NOT run npm run build / vite (forbidden, AGENTS.md). Do not commit or deploy.

Getting to the town: reaching Port Sapphire on foot is impractical. Seed a save — there is a
helper at public/act1-hifi/verify/seed.html that writes localStorage['edu-rpg-save']. Set
position.mapId to "portSapphire" to land straight in the town, or to "overworld" on a cell from
manifest.pathConstraints.corridors[].semanticCells to walk in (the town's connections[0] toX/toY
is where the town spits you OUT, not a corridor cell — that mistake cost a session).

Gotchas that will otherwise cost you an hour:
  - The Claude browser pane is visibilityState:hidden — rAF paused, Phaser loader stalls, and
    setTimeout is clamped to ~1s. adapter.js CANNOT be driven there. Test in the app.
  - MCP screenshot errors intermittently; xcrun simctl io <udid> screenshot <file> always works.
  - The simulator shuts down on its own; xcrun simctl boot <udid> recovers it.

Still open and NOT decided: designLocks.cameraWorldWidth = 208 (tight on desktop, much better on
the phone — judge it on device); whether the jetties, stone slipway and fenced gardens should be
walkable (all currently excluded); and whether the quay paving reaching the EAST map edge should
count as a fourth exit.
```
