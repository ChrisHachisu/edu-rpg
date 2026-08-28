---
date: 2026-08-26
type: handoff
project: edu-rpg
milestone: act1-town-plates
status: active
supersedes: "[[2026-08-24-act1-towns-to-tr]]"
tags: [handoff, act1, towns, audio]
---

# Handoff — build-62 owner feedback, four items — 2026-08-26

Branch `fix/graduated-gpu-heal`, HEAD **`9229c12`**, working tree clean, gate green.
**TestFlight build 62 is live and installable.** Machine: `tr` (now fully ship-capable).

## The four owner items, verbatim (2026-08-26, after installing build 62)

> 1. can you naturally cover the well that the player is facing on the sim with grass?
> 2. the game starts at the entrance area of the town and not facing and infront of the elder.
>    this is a regression so this needs fixing.
> 3. the exit of the town is set at a weird place too. i want the exit to be set to the edge of
>    the town map (all towns).
> 4. the NPCs look good. just move the healer slightly a little more out of the shop (just
>    slightly) so she does not touch the dangling herbs?

**Item 2 is a regression I caused. Do that one first** — it is the only one that makes the game
open wrong.

### Item 1 — cover the central well with grass

The well the player sees from the opening position is the **CENTRAL** one: art centre
**(992, 1000)**, cell ≈ **(33.2, 33.3)** in `public/act1-hifi/town/greenhollow-screen.png`.
(The other well, beside the herb shop at art (1261,1045), was repainted on 2026-08-25 and is
NOT this one — confirm with the owner if the crop looks ambiguous.)

Covering it means **three** edits, not one, and the third is the one that gets forgotten:
1. repaint that patch of the plate as cobble/grass matching its surroundings (same feathered-
   composite method as the herb-shop quarter — see `2717844`);
2. delete the authored band `well-centre` from
   `design/act1-towns/greenhollow-authored-obstacles.json` **and** the `prop-well-centre`
   entry in `public/act1-hifi/town/greenhollow-walkable.json` — otherwise the player collides
   with an invisible well;
3. **re-measure any roof probe inside the repainted crop** (`scripts/check_town_roofs.py`) and
   verify by eye that the probe still sits on a roof before accepting the new RGB.

### Item 2 — THE REGRESSION. First-entry flag survives a new game

`2820d74` added `firstEntryCell`/`firstEntryFacing` to open the game in front of Elder Rowan,
gated by a **per-town localStorage flag**:

```
public/act1-hifi/town.html:352   const FIRST_KEY = `edu-rpg-town-first-${townId}`;
public/act1-hifi/town.html:354   firstEntry = Boolean(town.firstEntryCell) && !localStorage.getItem(FIRST_KEY);
```

**The flag is never cleared by starting a new game.** The owner's device set it on build 60 or
61, so every later launch — including a brand-new game — falls through to `startCell`, the town
GATE, which is exactly what he is seeing. It is correct on a fresh install and wrong forever
after, which is why the browser check passed.

The fix is to tie "first entry" to the SAVE, not to "this town has ever been visited".
Options, cheapest first:
- clear every `edu-rpg-town-first-*` key wherever a new game is started (find it near the
  `edu-rpg-save` write); or
- derive it: treat it as first entry when the save has no visit record for this town, so the
  flag disappears entirely.

Do **not** simply move `startCell` — it is the ARRIVAL cell used on every re-entry from the
overworld and it sits 3.5 cells inside the painted gate so the exit arms without firing
(`_startNote` in `greenhollow-town.json`). That is why the two fields exist.

**Verify it the way build 61 was NOT verified**: in the iOS Simulator, on the packaged app,
after a *second* launch and a *new game* — not in a browser and not on a fresh install only.

### Item 3 — town exits belong on the map edge (all three towns)

Every town is 65 cells square. Current exits are nowhere near the edge:

| town | exit cell | distance from edge |
|---|---|---|
| greenhollow | `[32.5, 55.5]` | 9.5 cells short of the south edge |
| millbrook | `[32.5, 56.5]` | 8.5 cells short |
| portSapphire | `[33.0, 1.5]` | 1.5 from the NORTH edge (closest to right already) |

`exit.cell` lives in each `<town>-town.json`. Two constraints that are already documented and
will bite otherwise:
- the exit's AUTHORITY for where the player lands on the overworld is
  `public/act1-world-map.js`'s `LANDMARKS` entry (`EXITS[mapId] = L.exit`), **not** `maps.ts`
  — see the long `note` on `exit` in `greenhollow-town.json`;
- `startCell` is positioned relative to the exit so arriving **arms** the exit without firing
  it. Move the exit and you must re-check that relationship, or the player will bounce
  straight back out of town on arrival.

The gate's `TOWN TRANSITION CHECK` asserts each hi-fi town exit matches its landmark exit cell,
so it will catch a half-done change — run it.

### Item 4 — nudge the healer clear of the dangling herbs

`greenhollow-town.json` → npc `healer`, currently `[46.9, 32.9]` (art ≈ 1407, 987).
The hanging herbs occupy roughly **art y 780–880**; the shop's stone floor runs **art y 970–1050**.
She is already on the floor, so this is a *small* increase in y (south = further out of the
shop). Owner said "just slightly". `+0.3` to `+0.6` cells is the right order; anything that
puts her off the stone floor is too far.

Constraint: her south approach band must stay reachable. Cells 1.0–1.8 south of her were all
walkable at 32.9; re-check after moving, and the gate's `TOWN TALKABLE CHECK` will confirm
(she reported 797 reachable world px at the current spot).

## What shipped since the previous handoff (`139cbed..HEAD`)

- `9229c12` fix: the BGM never played on device — `fetch()` cannot read app files over `capacitor://`
- `e1d5324` feat: the orchestral BGM ships — taken as its own bundle edit
- `2717844` art: repaint the herb-shop quarter, move the healer into it as a distinct character
- `44d421b` art: redraw the eight NPCs to the heroine's proportions
- `2820d74` fix: build-59 feedback — open in front of the elder, stop the well being floor
- `b1a220c` ship: survive a cold machine (xcodebuild-settings timeout, `cap copy` duplication)
- `cd0826f` ship: make the TestFlight path work from a fresh clone on any Mac
- `2a3e499` art: the other eight NPCs redrawn to the Port Sapphire standard

## Verification (run 2026-08-26)

- **gate**: `npm run --silent gate` → `SHIP GATE PASS`, exit 0. 102 pins, roof probes pass,
  17 talk bands reachable.
- **repin**: clean.
- **working tree**: 0 tracked modifications.
- Note: there is no jest/lint suite in this repo — `npm run gate` (map-engine tests + ship gate)
  is the verification of record.

## Live state (verified 2026-08-26)

- **TestFlight: build 62, uploaded AND installable** — verified in this session's own ship run:
  `VERIFY DELIVERY PASS: build 62 is installable`, Beta Testers external channel `LIVE`, testers
  able to install **2/2**. Do NOT write "not shipped" — builds 59, 60, 61 and 62 all went out today.
- **HEAD**: `9229c12`, pushed to `origin/fix/graduated-gpu-heal`.
- **Ship path on `tr`**: fully working. Ruby 3.3.6 + fastlane 2.238.0 (rbenv, persisted in
  `~/.zshrc`), CocoaPods 1.16.2, Xcode repaired, iOS platform installed, signing key present at
  `~/Documents/claudecode/chalkmap-v2/.eas-credentials/AuthKey_52937L4S9H.p8`.
- **Known non-blocking**: `NO Internal Testers internal channel=LIVE testers able to install 0/1`
  on builds 60/61/62 — an unaccepted INTERNAL invitation. External is 2/2 so ships are real.
  Owner-only to clear.

## Locked decisions

- **`startCell` = ARRIVAL, `firstEntryCell` = NEW GAME.** Two fields on purpose. See
  `_firstEntryNote` in `greenhollow-town.json`. The bug is the flag's lifetime, not the split.
- **The bundle is frozen and its identity is a 12-point chain.** Editing
  `dist/assets/index-BhoGQRaA.js` means re-stamping `runtime_baseline.py`
  (BUNDLE_SIZE/SHA256/EXPECTED_TOTAL_BYTES), `repin.sh`'s md5, the manifest (per-file **and**
  totalBytes), **the preserved baseline COPY of the bundle**, four provenance scripts, a test,
  a preserved review artifact, `docs/EQUIVALENCE-REFERENCE.json`, and re-baking
  `public/act1-overworld-walk.bin`. Current: size 4987635, sha `ab4fc9ad…`, md5 `f7095264…`.
- **BGM override fails SAFE.** `swapWhenProven()` decodes a track before discarding the built-in
  composer. Never make it swap first again.
- **`fetch()` does not work on `capacitor://`** — XHR is the loader. See the learning below.
- **Music licence** is registered to 合同会社ChalkMap only, free under US$1M revenue for that
  entity. A change of publisher requires re-licensing.

## Gotchas for next session

- **Do not trust a browser check for anything device-shaped.** Build 61 shipped with a written
  "verified by listening" claim that was false: the check called `am.init()` by hand, but the
  game only calls it from `audioOnGesture()` bound to **Phaser canvas input**, and DOM-overlay
  clicks never reach Phaser. Verify in the **iOS Simulator on the packaged app**.
  [[learning-20260826-verify-in-the-failing-environment]]
- **Getting telemetry out of a WKWebView:** `log stream` drowns in system daemons, the web
  console is not bridged, and WebKit localStorage does not land anywhere greppable in the
  container. A `position:fixed` debug div that a **screenshot** can read is the cheap reliable
  channel. That is what produced the `status=0` evidence.
- **A repaint MUST fail `check_town_roofs.py`** — that is the check working. Re-measure the
  probe *and look at it* (render it at 3x with a crosshair) before accepting the new RGB.
- **`npm run gate` proves python+node only.** It says nothing about Xcode, Ruby, CocoaPods,
  signing or the device. [[learning-20260824-air-only-ship-dependencies]]
- **Fresh clone build order:** `./scripts/build-dist.sh` BEFORE `npm run repin` (repin's
  `regenerate_pins.py` resolves the index.html pin out of `dist/`, which does not exist yet).
- `BUNDLE_SIZE` is written `4_987_635` **with underscores** — a plain-digit sweep misses it.
- zsh does not word-split a multi-line variable; a `for f in $FILES` loop over paths silently
  becomes one filename. Use python for multi-file rewrites.
- Two files are **machine-local** on `tr` via `git update-index --skip-worktree` and must not be
  committed: `ios/App/Podfile.lock` and `ios/App/App.xcodeproj/project.pbxproj` (fastlane
  rewrites the latter with this Mac's cert/profile; committing it breaks `air`).

## Resume here (load-on-demand — do NOT eager-read the corpus)

**Distilled state:** branch clean at `9229c12`, gate green, build 62 live and installable.
Four owner items open. **Start with item 2 (the first-entry regression)** — it is mine, it is
small, and it is the one that makes the game open wrong. Then 4 (a one-number nudge), then 3
(data + gate), then 1 (art repaint, the most involved).

| purpose | path | read when |
|---|---|---|
| first-entry flag + arrival split | `public/act1-hifi/town.html:342-368` | item 2 |
| why startCell ≠ firstEntryCell | `public/act1-hifi/town/greenhollow-town.json` → `_startNote`, `_firstEntryNote` | items 2, 3 |
| exit authority is the landmark table | `greenhollow-town.json` → `exit.note`; `public/act1-world-map.js` | item 3 |
| healer placement + approach band | `greenhollow-town.json` → npc `healer`, `_placementNote` | item 4 |
| talk-band geometry (`nearestNpc`) | `public/act1-hifi/town.html:377-387` | items 2, 4 |
| authored collision bands | `design/act1-towns/greenhollow-authored-obstacles.json` | item 1 |
| frozen roof probes + re-measure rule | `scripts/check_town_roofs.py:61-95` | item 1 |
| feathered-composite repaint method | commit `2717844` message | item 1 |
| BGM override (fail-safe swap, XHR loader) | `design/music/music-override.js` (canonical) | only if audio regresses |
| ship path | `./scripts/ship-ios.sh` | shipping |

## Kickoff prompt (paste verbatim into next session)

```
Continue edu-rpg Act 1 town work on machine `tr`.

  cd ~/Documents/claudecode/edu-rpg          # branch fix/graduated-gpu-heal, HEAD 9229c12

READ FIRST: docs/handoffs/2026-08-26-build62-feedback.md
Do NOT preload docs/PROJECT-RUNBOOK.md or older handoffs.

TestFlight build 62 is LIVE and installable. Tree is clean, gate is green. Four owner items
from build 62, in this order:

1. REGRESSION, do this first. The game opens at the town gate instead of in front of Elder
   Rowan. Cause: public/act1-hifi/town.html:352 gates the opening on a per-town localStorage
   flag `edu-rpg-town-first-<town>` that is NEVER cleared by starting a new game, so the
   owner's device (flag set by build 60/61) always falls through to startCell. Tie "first
   entry" to the SAVE, not to "ever visited". Do NOT just move startCell -- it is the ARRIVAL
   cell for every re-entry from the overworld and is placed so the exit arms without firing
   (see _startNote).

2. Move the greenhollow healer SLIGHTLY further out of the herb shop so she does not overlap
   the dangling herbs. She is at [46.9, 32.9]; herbs are art y 780-880, stone floor y 970-1050.
   +0.3 to +0.6 cells south. Keep her south approach band walkable (gate's TOWN TALKABLE CHECK).

3. Move every town's exit to the EDGE of its 65-cell map. Currently greenhollow [32.5,55.5],
   millbrook [32.5,56.5], portSapphire [33.0,1.5]. The overworld-landing AUTHORITY is
   public/act1-world-map.js's LANDMARKS entry, not maps.ts -- and startCell sits relative to
   the exit so arrival ARMS it without firing, so re-check that after moving. The gate's TOWN
   TRANSITION CHECK asserts town exit == landmark exit.

4. Cover the CENTRAL well with grass/cobble so it reads naturally: art centre (992,1000),
   cell ~(33.2,33.3) in public/act1-hifi/town/greenhollow-screen.png. Three edits, not one:
   repaint the patch (feathered composite, see commit 2717844); DELETE the `well-centre` band
   from design/act1-towns/greenhollow-authored-obstacles.json AND `prop-well-centre` from
   public/act1-hifi/town/greenhollow-walkable.json, or the player collides with an invisible
   well; then re-measure any roof probe inside the crop and LOOK at it before accepting the
   new RGB.

VERIFY IN THE iOS SIMULATOR ON THE PACKAGED APP, not in a browser. Build 61 shipped a false
"verified" claim because the browser check called am.init() by hand -- the game only calls it
from audioOnGesture(), bound to Phaser canvas input, which DOM-overlay clicks never reach.
For item 1 specifically, test a SECOND launch and a NEW GAME, not just a fresh install.
To read state out of the WKWebView, inject a position:fixed debug div and screenshot it; the
unified log and WebKit localStorage are both dead ends.

After the batch: npm run repin, npm run --silent gate on the committed tree, then
./scripts/ship-ios.sh. Report the build number AND that a tester can install
("CODEX REPORT: ... uploaded AND installable"), never processingState VALID alone.

Do not commit ios/App/Podfile.lock or ios/App/App.xcodeproj/project.pbxproj -- both are
skip-worktree machine-local on `tr` and committing them breaks `air`.
```
