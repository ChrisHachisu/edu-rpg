# Running edu-rpg as several concurrent sessions

Written 2026-08-06, after a session that shipped the Act-1 dungeon art and hit every one of the
problems below at least once.

## The diagnosis: it is not a delegation problem

> *"i could not come up with a good way to know when to merge"*

There was nothing to merge **to**.

| | |
|---|---|
| `main` last moved | **2026-05-25** |
| commits on `codex/map-engine-semantic-data` not in main | **56** |
| `main` ahead of that branch | **0** |
| `codex/stabilize-runtime-baseline` last moved | 2026-07-14, stranded |
| git worktrees on disk | 5, **2 of them prunable** |

One branch has carried ten weeks of work and never integrated. That single fact explains the
symptom: a second session has nothing current to branch **from** except this branch's tip, so it
inherits 56 unmerged commits, and when it finishes there is no trunk to merge **into**. Two
sessions started that way do not diverge gracefully — they collide, on the one file below.

**Everything else in this document is secondary to making `main` the trunk again.**

## The one file that makes parallel work collide

`scripts/runtime_baseline.py` holds **53 pins** — size + sha256 for every shipped runtime file —
and was touched by **5 of the 6 commits** in this session. Any track that changes any shipped
asset must edit it. Two tracks doing that in parallel conflict **every time**, on a file where a
bad merge silently ships the wrong hash.

**Fix it before splitting the work.** Pins are derived data: they are `os.path.getsize` and
`sha256` of files already on disk. They are hand-maintained today only by habit. Replace the
literal dicts with a generated table (`scripts/regenerate_pins.py`, plus a `--check` mode for the
gate) and the conflict class disappears — both branches regenerate and get byte-identical output.

This is the single highest-leverage change for concurrency in the repo. It is perhaps an hour of
work and it unblocks everything below.

## What can actually run at once

The limit is **machine**, not ambition. Measured this session: four concurrent renders plus one
booted simulator drove load to 17.8 and killed the session outright.

| resource | how many | who needs it |
|---|---|---|
| iOS simulator | **1** | any track verifying on device |
| CPU for bakes | ~2 concurrent renders | dungeon/world art only |
| `public/dq-tiles.js` | **1 writer** — 238 KB monolith, 4 downstream pins | engine, HUD, overworld |

So: **two or three active sessions**, of which **at most one bakes** and **at most one holds the
simulator** at a time. A fourth session is not faster; it is a queue.

## The tracks

Each track owns files nobody else writes. Ownership is the whole mechanism — if two tracks can
edit one file, they will, on the same afternoon.

| track | owns | never touches | needs sim? | CPU |
|---|---|---|---|---|
| **A — Engine** | `public/dq-tiles.js`, `public/act1-world-map.js`, the 4 dq pins, `src/map-engine/` | any art, `ui-overhaul.*` | constantly | low |
| **B — HUD/UI** | `public/ui-overhaul.js`, `.css`, `public/index.html`, HUD icon art | `dq-tiles.js`, dungeon art | constantly | low |
| **C — World art** | `scripts/render_*`, `scripts/make_*materials*`, `design/act1-dungeon-interiors/`, `public/act1-dungeon-art/` | any runtime `.js` | rarely | **heavy** |
| **D — Character art** | `public/act1-hifi/hero-*`, `design/hero-*`, `scripts/build_hero_*`, `scripts/bake_hero_*` | everything else | rarely | low (network-bound) |
| **E — Content/data** | `design/act1-dungeon-interiors/*.json`, `scripts/build_dungeon_semantic.py`, quests/layouts | rendered art, runtime `.js` | no | low |

### A and B are NOT contended — decided 2026-08-06

The raw grep looked bad (`dq-tiles.js` 11 minimap/compass references, `ui-overhaul.js` 17) but read
in context the boundary is already clean, and **nothing needs to move**:

| concern | lives in | track |
|---|---|---|
| minimap / compass / HP **presentation** — DOM, CSS, `#qfh-compass` | `ui-overhaul.js` + `.css` | **B** |
| the movement stick's DOM and placement | `index.html` | **B** |
| minimap / compass **data** — `scene.mapData`, tile state | `dq-tiles.js` | **A** |
| consuming the stick vector for movement + collision | `dq-tiles.js` | **A** |

`dq-tiles.js` has **exactly one** HUD call in 238 KB — `scene.renderMinimap()`, a forced redraw
after it mutates `mapData`. Ten of its eleven "references" are comments explaining that overlay,
minimap and collision must read the same mutated tiles. It implements no HUD.

**Two named seams, and they are the whole contract between A and B:**

1. `scene.renderMinimap()` / `scene.updateCompass()` — the engine calls them, the HUD wraps them.
2. `window.__DQ_STICK__` — `index.html` publishes the raw vector, `dq-tiles.js` consumes it.

Neither track may change a seam without telling the other. Everything either side of them is
private. **A and B can therefore run concurrently today** — their real contention is the simulator,
not the code.

One consequence worth stating: **the Port Sapphire stick defect is a HUD bug, not an engine bug.**
The stick is positioned in `index.html`; `dq-tiles.js` only reads its vector.

**C and E chain.** E authors layouts, C bakes them. They can run concurrently only if E works one
dungeon ahead of C.

`dist/` and `ios/App/App/public` are gitignored, so every worktree builds its own — no conflict
there, but each session must run `sync-ios.sh` itself.

## When to merge

**On a gate, never on a schedule, and never "when the feature is done".**

A track merges when *all* of these are true:

1. its own gate passes on its branch — `ship-gate.sh`, plus whichever of
   `check_hero_fits_wall_face.py` / `check_dungeon_playable.py` / `export_act1_dungeon_floors.py
   --check` / `freshness.py verify` apply;
2. it has **rebased onto current `main`** and re-run that gate — a gate that passed before the
   rebase proves nothing about after it;
3. it holds the **integration token** (below).

**Merge small and often. A branch that lives longer than a day is the failure mode, not the
feature.** The 56-commit branch above is what a "merge when done" policy produces.

### The integration token

One merge at a time, repo-wide. It is a convention, not a tool: whoever is merging says so, merges,
and says they are done. It exists because two branches rebasing onto a moving `main` while both
regenerate pins will produce two different correct answers and one broken tree.

### What "done" means for a merge

Not "the code is written". `main` must always be shippable, so a merge lands only with:

- ship gate green **after** rebase,
- the bundle still byte-identical (`4,987,581` / `60d90b63…`),
- any new runtime file **registered**, and
- device verification for anything that changes `public/`, done with a **full rebuild** —
  `--skip-build` reinstalls a stale app.

## Delegating a session

The brief is short. The ownership line does the work:

```
edu-rpg — <track name>.

Work in <worktree path>, branch <track>/<slug>, branched from CURRENT main.

Pre-flight reads, in this order, and nothing else:
  1. docs/handoffs/<latest>.md
  2. <the one style/spec doc for this track>

YOU OWN: <exact paths>
YOU MUST NOT EDIT: <the other tracks' paths, named explicitly>
If the task seems to require a file you do not own, STOP and report it —
do not edit it, and do not work around it.

THE TASK: <one paragraph>
DONE MEANS: <a failable check, not a description>

Machine rules: at most 2 concurrent renders; do not boot a simulator if another
session holds it; never npm run build / npm run dev / npx vite.
Finish with: rebase onto main, ./scripts/sync-ios.sh, ./scripts/ship-gate.sh .
```

Two things make this work and both were learned the hard way:

- **"Stop and report" beats "use your judgement"** on file ownership. A session that edits outside
  its lane produces a conflict nobody sees until merge.
- **"Done" must be a failable check.** "The wall shadow looks right" took three attempts and two
  wrong answers; `check_hero_fits_wall_face.py` takes none.

## Hazards, all observed rather than theorised

- **A `spawn_task` chip runs in the SAME worktree**, not an isolated one. Its staged deletions were
  pulled into this session's index by a path-scoped `git add`. **Never `git add -A` while another
  session is live** — stage explicit paths and re-read `git diff --cached --name-only`.
- **One mutating session per worktree.** Two agents in one tree produce test numbers that are
  each other's half-finished state.
- **Editing a generator mid-render corrupts provenance.** `prov.stamp` reads the script at write
  time, so an edit lands the new hash on art rendered by the old code.
- **Stale background processes are the real CPU thief.** This session found two runaway `du`
  processes at 1h48m, two expo dev servers idle for 3 days, an abandoned polling loop, and
  Spotlight indexing the scratchpad. Clearing them took load 17.8 → 3.6.
- **Prune worktrees at milestone close.** Two of the five on disk are already prunable.

## The order to do this in

1. **Fast-forward `main` to the tested tip.** `main` is 0 ahead, so this is a fast-forward with no
   conflict risk. Until this happens nothing else in this document is possible.
2. **Generate the pins** (`regenerate_pins.py` + `--check`). Removes the one guaranteed conflict.
3. **Prune the two stale worktrees**, create one worktree per active track.
4. **Decide where the HUD lives** — `dq-tiles.js` or `ui-overhaul.js` — so A and B can run at once.
5. Start with **two** tracks, not five. Confirm the merge loop actually works before widening it.
