# Ground truth — which file is the authority, and which are impostors

**Read this before believing anything else in this repo.**

This document exists because on 2026-08-07/08 a single session produced fourteen separate
instances of an agent (or the orchestrator) building on a claim that was stale, unverified, or
plainly false — and shipping the consequence. The owner's diagnosis, verbatim:

> *"we are not successfully recording what the source truth is for the game and not retiring old
> aspects whenever there is an update"*

That is exactly right, and it is a bigger problem than any bug it caused. This repo accumulates
claims faster than it retires them, so a new reader lands on whichever sediment layer they hit
first and faithfully reproduces its errors.

## The rule this document enforces

**When a claim is refuted, strike it AT ITS SOURCE, in the same change that refutes it.**
Not in a new document. A correction that lives somewhere else just adds a layer.
`docs/SMOOTH-ROUND-1.md` through `-4.md` all needed correction banners bolted on afterwards; the
comment in `public/dq-tiles.js` claiming a correctness bug that did not exist had to be retracted
in the source, not just in a doc. Do it at the source or it will be read again.

## Authority table

| Question | THE AUTHORITY | Known impostors — do NOT trust these |
|---|---|---|
| What the game actually runs | `dist/assets/index-BhoGQRaA.js` (md5 `60d90b63607b6e6980eb170aeeed445e`) and `public/*.js` | **`src/` is partly fiction.** `src/map-engine/**` (~3,800 lines) has ZERO trace in the bundle. |
| Overworld door / landmark coordinates | `public/act1-world-map.js:198` `LANDMARKS` | The bundle's own `Xt.overworld.connections` are **stale**. Cost one agent half an hour. `scripts/seed_ios_save.py`'s docstring follows the stale table too. |
| Canvas scale mode | the bundle: `Scale.RESIZE` | `src/main.ts:37-38` says `Scale.NONE`. Two agents reasoned from the wrong one; it changes whether window size is device-dependent. |
| Monster roster | the bundle: **75** ids | `src/data/monsters.ts`: **72**. `bruiser`, `knifeSneak`, `thornvineLurker` are live in encounter tables and missing from source. `docs/SOURCE-BUNDLE-DRIFT.md` lists monsters.ts under "Faithful" — it is not. Maps (45) and items (58) genuinely are. |
| What any screen LOOKS like | a dated capture of the shipped build. For the **battle command bar**, `design/feel-refs/battle-commands-locked.gif` (2026-08-08) — it is tracked, unlike the scratchpad capture below, and it supersedes it: the bar no longer carries a resting selection and the Attack sword is red. | **Not the CSS, and this is proven.** `public/ui-overhaul.css:218` is `grid-template-columns:1fr 1fr` and `BATTLE_ACT` assigns `btn-ruby`/`btn-sky`/`btn-em`/`btn-slate` with a running-man Flee icon. **None of that is on the device.** The shipped bar is ONE horizontal strip, four columns, no per-command background, one solid gold fill on the selected item. Labels are weight **500 at 12px**, not the 700 the CSS implies. A mockup built faithfully from the stylesheet was rejected by the owner on sight. |
| Where the battle command bar lives | DOM: `public/ui-overhaul.js`, selectors **`.rail` / `.railplate` / `.railcmd`** ("Gilded Rail", locked 2026-08-07) | NOT `__tapItems` / `selectedIndex` / `updateSelection` — that is the **TitleScene** path. And NOT `#qok-ui .sel` at `ui-overhaul.css:118`, which the battle bar **does not use at all**. This orchestrator's own brief asserted `.sel` and `dyn = 'menu' + menuIndex` on 2026-08-08 and both were already superseded. |
| Overworld collision | `canMove` (hash `317b8b0a`, 78,711 blocked) | NOT `owmBuild`'s field — `OWM_FIELD_OWNED={2,4,5}` splits the authorities and `canMove` is never derived from it. |
| Dungeon walkability | the collision shape derived from the art | `act1-dungeon-floors.json`'s tile lattice is **no longer** the authority; dungeons moved to continuous movement. |
| Whether a build reached Apple | App Store Connect, queried | **NOT `ship_ios.py`'s "uploaded build N" message** — it prints that from a file it writes itself, so it says the same thing whether or not Apple received anything. |
| Whether a gate passed on the integration tree | the orchestrator running it on the **committed** tree | NOT a worker's report. `dist/` is gitignored and therefore per-worktree, so a worker's green gate in its own branch is **structurally uninterpretable** for `main`. |

## Claims that were WRONG and are now retired

Recorded so they cannot come back. Each was believed and acted on.

- ~~"The battle bar uses `#qok-ui .sel`, so changing it risks restyling six other screens"~~. It
  does not use `.sel` at all; the scoping worry that shaped two briefs was moot. Verified by
  rendering every shared `.sel` surface under the old and new stylesheet: **byte-identical**.
  **The stale claim was in a brief written that same day by the orchestrator** — staleness is not
  confined to old files, it reaches anything written from a stale read.
- ~~"The bundle filename changes on a rebuild, which is arguably the useful tripwire"~~ (`SOURCE-BUNDLE-DRIFT.md` L9). **False today**: `gh-pages` ships `index-BhoGQRaA.js` at 4,987,498 B while the local baseline is 4,987,581 B. Same name, different game, right now.
- ~~"The build toolchain is no longer declared anywhere"~~. It is recoverable: `node_modules/` was tracked at the initial commit — `git show 1a20e5c:node_modules/vite/package.json` → **6.4.1**, and phaser 3.90.0 / tone 15.1.22 match the bundle's own version strings.
- ~~"The analytic collision field describes an unconsolidated coastline, so it is WRONG not merely slow"~~. **0 of 3,852,288 pixels differ.** Retracted in `public/dq-tiles.js`.
- ~~"The prefetch ring raises peak residency by exactly zero"~~. Live peak 4-6 → 9-10; typical case roughly doubles. Retracted in `public/dq-tiles.js`.
- ~~"The ring needs 12 chunks on iPad and 16 on iPad Pro"~~. Both derivations left `deviceScaleFactor` at 1; `ZOOM` multiplies by dpr and cancels it. **Every iPhone and iPad lands at 9.** The one real exception is **iPad mini 8.3 in portrait** (744·2 = 1488 falls under the 768·2 threshold, ZOOM stays 1, ring reaches 12). Relayed to the owner twice before being caught.
- ~~"The rendered frame is byte-identical, verified"~~. The check read `g.canvas` after `snapshot()` with `preserveDrawingBuffer` off, capturing a **fully black frame**; it returned an identical hash for a build with a provably broken canopy. Rendering is **not** verified by any gate today — see `scripts/equivalence_fingerprint.cjs`'s header.
- ~~The relay's "editing dq-tiles.js needs 4 generated pins"~~. One moved. Use `npm run repin` and stop counting.
- ~~The shell sha `29b0c698…`~~. Stale everywhere it appears in older notes; the value is in `scripts/build_static_index.mjs`.
- ~~`28-portsapphire-exited.png`~~ (tier-2 device gate) is **still inside the town**. Evidence filenames are claims too.
- ~~"`public/ui-overhaul.css` describes the battle command bar"~~. Its `.actiongrid` / `btn-ruby`
  block describes a 2x2 grid of four coloured buttons that has not shipped. The stylesheet is
  fiction for that element in the same way `src/` is fiction for the runtime — and unlike `src/`,
  nobody had flagged it. Assume the same of any other CSS until a capture confirms it.
  **Narrowed 2026-08-08:** the `#qok-ui .rail` / `.railplate` / `.railcmd` block in the same file
  IS the shipped bar, confirmed against `design/feel-refs/battle-commands-locked.gif`. Two
  descriptions of the same element live in one stylesheet; only the rail one is real.

## Why the code has this problem, not just the docs

The shipped bundle is not a compilation output that drifted. It has been **maintained as source, in
compiled form, across ~20 versions**: ~19 numbered hand-edit annotations (`// Edit 1`, `// Fix 2`,
`// CORRECTION #6`, `// Correction #44`, `// FULL REDO`) span bundle lines 73,695-83,288, and the
intermediate vintages that would let anyone replay them are gone. `apply_edits.py` in the repo root
("Apply all 7 edits to the edu-rpg bundle") is a surviving fragment of that workflow.

So the code is its own only history, and an unreliable one. This is the strongest argument for the
drift doc's own recommendation: **do not recompile — add the bridge so a future rebuild fails loudly**.

## What IS mechanically verified

Trust these, because a script fails when they go stale:

- `npm run gate` — map-engine tests + ship gate (74 pins, overlay verify, iOS payload).
- `npm run repin` — the whole pin chain, ending in an assertion that the frozen bundle md5 is intact.
- `npm run fingerprint:check` — world data, collision shape, object counts, DOM UI, and the three
  bundle-only globals whose absence silently deletes the interface. **It does NOT verify rendering.**

## What is NOT verified by anything

Say so out loud when quoting a pass:

- **Rendering.** No gate proves the game looks right. Three designs were tried; none was both stable
  and sensitive. Prove it per change, with a capture, against `design/current-screens/`.
- Battle balance, quiz content, audio, save migration.
- A **dungeon exit** and 5 of 8 doors, undriven by the headless harness for four rounds running
  (a pre-existing `canMove`-vs-mover disagreement). The simulator can do it; the harness cannot.
- Anything on real hardware. Every number in this repo is a simulator or browser number.
