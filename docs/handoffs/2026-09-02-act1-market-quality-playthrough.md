---
date: 2026-09-02
type: handoff
project: edu-rpg
milestone: act1-market-quality
status: active
supersedes: "[[2026-08-26-build62-feedback]]"
tags: [handoff, act1, playthrough, polish, testflight, performance]
---

# Handoff — Act 1 market-quality playthrough — 2026-09-02

Written on machine `tr`, in worktree `.claude/worktrees/youthful-bohr-737608` on branch
`fix/graduated-gpu-heal`. Everything is pushed; a fresh session can work from the main checkout.

## What shipped (builds 63 → 70, all on `fix/graduated-gpu-heal`)
- `a6d8372` the four build-62 items: opening in front of the elder (a save-scoped story flag, not a
  localStorage key), healer out of the herbs, exits, central well covered
- `d9605d2` harness that catches the first-entry regression (`scripts/verify_town_owner_items.cjs`)
- `e01e464` third half-drawn well covered, healer's lantern removed (mirror, row 0 only), exits moved
  to the town MOUTH with a directional crossing test; new gate `scripts/check_town_exits.py`
- `82825f7` shop/menu no longer destroy the town runtime (paused ≠ gone); stale shop avatar gone
- `5022abc` dungeon entry lands on the mouth facing in; the arch is actually PAINTED now (it had
  only ever been a stencil); new gate `scripts/check_dungeon_entries.py`
- `542b4e6` villager names (two keys the frozen bundle predates); tap beside the box closes it
- `c8279b2` controls hide for the PARENT's text box; arrival at the gate; Greenhollow heal fee 3 G
- `eee3990` destroyed speaker no longer narrates the next message
- `750a7eb` shop confirm + quantity + wallet cap, sticky Buy/Sell/Leave, scroll kept; New-equipment
  dot + pill; healers at their shops in millbrook/Port Sapphire; menu→dungeon camera snap;
  blue-screen readiness veil
- `95b25bb` docs: the two items build 70 does NOT close, and why each was backed out

## Verification (run this session, on HEAD `95b25bb`)
- `npm run --silent gate` on the committed tree: **20 PASS lines, 0 FAIL** (2026-09-02)
- `scripts/verify_town_owner_items.cjs`: **37/37 green** against the `dist/` payload of `750a7eb`
  (HEAD's payload is identical — `95b25bb` is docs-only)
- `scripts/verify_dungeon_entry.cjs`: 12/12; `scripts/verify_dungeon_arch.cjs`: ARCH VERIFY PASS
- repin clean, 112 pins; frozen bundle md5 intact
- Machine load at write time: 4.01 (the `smooth` skill voids perf numbers taken above 10)

## Live state (verified 2026-09-02)
- **TestFlight: build 70 — `processing VALID`, external Beta Testers `channel=LIVE`, testers able to
  install 2/2** — verified via `python3 scripts/ship-support/verify-delivery.py --app edu-rpg --build 70`
  (`VERIFY DELIVERY PASS: build 70 is installable`). Internal Testers 0/1 is the known unaccepted
  invitation; not a blocker.
- HEAD: `95b25bb` — `git log`; pushed to `origin/fix/graduated-gpu-heal`
- Working tree clean apart from untracked proof folders (`design/**/proof-*`) and iOS build byproducts

## Locked decisions (this run)
- **`exit.cell` is a LINE across the town's mouth; crossing it leaves.** Half-width 2.4 cells,
  measured from the narrowest reachable gate. Reverses the build-63 canvas-edge placement on the
  owner's second look — but see Gotchas: he has now said it is STILL wrong. [[learning-20260829-crossing-not-proximity]]
- **First-entry is decided by the PARENT from the save's story flags** (`act1.townOpened.<mapId>`),
  never from localStorage. [[2026-08-29-edu-rpg-build62-feedback-changes]]
- **A paused WorldMapScene is not gone** — the town overlay suspends, never `releaseRoot()`s, while
  shop/menu are up. [[learning-20260829-paused-is-not-gone]]
- **Arriving vs recovering in a dungeon is decided by the floor key changing**, not by distance.
  [[learning-20260829-arriving-is-not-recovering]]
- **The arch overlay ships the authored PIXELS**, toned to the plate; `ARCH_SCALE = 1.2` (1.25 is the
  measured ceiling before the no-vanish invariant refuses). [[learning-20260829-stencil-is-not-paint]]
- **Greenhollow heal fee is set at runtime** (`HEALER_PRICES.greenhollow = 3` via the scene's static);
  the shipped confirm flow is reused, not forked.
- **Blue screen is COVERED, not recovered**: the watchdog's `live < want` drives a veil.
- **Two items were attempted, measured, and backed out** rather than shipped — boundaries and the
  baked boss. Full measurements: `docs/handoffs/2026-08-30-build67-remaining-items.md`.

## Gotchas for next session
- **The frozen bundle.** `dist/assets/index-BhoGQRaA.js` was hand-edited after compilation. NEVER
  `npm run build` / `npm run dev` / `npx vite`. Edit `public/*.js` overrides; then
  `./scripts/build-dist.sh` → `npm run repin` → `npm run --silent gate`. Any change to
  `dq-tiles.js` / `adapter.js` / `town.html` fails the gate until repin.
- **i18n keys can exist in `src/i18n/locales` and NOT in the bundle** (`npc.villager1/2.name`,
  `equip.new`). Grep `dist/assets/index-*.js`, not source. The shipped translate answers `[key]`.
- **Ship = `./scripts/ship-ios.sh`.** It ends with `CODEX REPORT: … uploaded AND installable` — report
  that line, never `processingState VALID` alone. Never commit `ios/App/Podfile.lock` or
  `App.xcodeproj/project.pbxproj` (skip-worktree on `tr`; in a NEW worktree set the flag yourself).
- **A worktree needs `npm ci` and `pod install` (with `LANG=en_US.UTF-8`)** before xcodebuild, and
  `-derivedDataPath` must be OUTSIDE `~/Documents` — the iCloud file provider re-adds Finder xattrs
  and codesign refuses ("resource fork, Finder information, or similar detritus").
- **The Browser pane cannot run the game** (`visibilityState: hidden` pauses rAF; stuck in BootScene).
  Use the Playwright harness: `.eduharness/node_modules/playwright-core` (install with `npm i` inside
  `.eduharness/`, NOT the repo root — it pollutes package.json) driving Chrome, against
  `python3 -m http.server 5178 --directory dist --bind 127.0.0.1` (the repo's documented fixture; the
  preview launcher failed on `os.getcwd()` permission). Existing harnesses:
  `scripts/verify_town_owner_items.cjs`, `scripts/verify_dungeon_entry.cjs`,
  `scripts/verify_dungeon_arch.cjs`, `scripts/perf_probe.cjs` (unread this session).
- **iOS Simulator taps were impossible this session** — `mcp__Claude_Code_iOS_Simulator__control`
  was denied by the permission mode, `osascript` had no Accessibility, no `idb`/`cliclick`. A new
  session may have the MCP tool allowed; check FIRST with a cheap `screenshot` action. The booted
  device on `tr` is **iPhone 16 `1D7EAC42-3F69-4DAD-918C-518C4C98EAA0`**; the `smooth` skill's
  `4872FCF0…` is an `air` device and does not exist here.
- **macOS 26.5.1 Files-and-Folders grant is per app bundle** (`…/claude-code/<version>/claude.app`),
  so an auto-update silently loses Documents access (Desktop/Documents/Downloads all
  `Operation not permitted`, Library fine). Fix: trigger a picker —
  `osascript -e 'set f to choose folder …'` — and have the owner pick Documents. Do NOT diagnose iCloud.
- **`~/.claude/scripts/watch-job.sh` does not exist on `tr`** and its absence exits 0. Watch background
  jobs with a marker+liveness loop (`grep SHIP_EXIT= … || pgrep -f ship_ios.py`).
- **Never assume a fix landed because the code reads right** — three times this run the harness
  caught a fix that did nothing (string cache vs render path; art-fit moved no metric; a check that
  passed vacuously on a desktop viewport). Assert on what the UI shows, on a phone/Capacitor context.
- **The owner reads screenshots; send them** (`SendUserFile`). He plays on his phone; "ping me" means
  a notification he sees away from the terminal — the workspace has `notifications.notify(category=…)`
  (Slack router) importable from `~/Documents/claudecode`; use it, or fall back to a terse report.

## Resume here (load-on-demand — do NOT eager-read the corpus)
- **Distilled state:** Act 1 (three hi-fi towns, four hi-fi dungeons) is playable end to end on
  TestFlight build 70. Eight rounds of owner feedback were closed this run; **five things are open**,
  in the owner's priority order: (1) overworld walking is "extremely laggy and jittery" and image
  quality "poor" — MAJOR, unstarted, see pointers; (2) facing continuity entering/exiting towns and
  dungeons — unstarted; (3) the town exit "still not the edge of the map … illusion that they are
  leaving" — unstarted, fourth iteration; (4) town+dungeon boundaries and (5) the baked boss — both
  attempted and backed out with measurements. The owner has now asked for an AUTONOMOUS heavy
  playthrough + bug-fix + front-end polish pass to market-release quality, then TF, then a ping.
- **Pointers:**

  | purpose | path:line | read when |
  |---|---|---|
  | the two backed-out items, with measurements | `docs/handoffs/2026-08-30-build67-remaining-items.md` | before touching boundaries or the boss |
  | perf goal, six metrics, loop, known cost sources | `~/.claude/skills/smooth/SKILL.md` §1, §5 | starting the jitter work — invoke `/smooth` |
  | the 128k-Image overworld tax (lead #1) | `src/scenes/WorldMapScene.ts` `renderMap`; `public/dq-tiles.js` `dqterrain` depth 1 | fixing jitter |
  | town arrival facing (hard-coded `'down'`) | `public/act1-hifi/town.html` `state = { facing: … }` ~l.367 | facing continuity |
  | town exit line + arming | `public/act1-hifi/town.html` "leaving the town" block; `<town>-town.json` `exit` notes | the exit illusion |
  | parent↔town message bus | `public/act1-hifi/adapter.js` `addEventListener('message'` | anything crossing the iframe |
  | boss cover-patch (the "shadow") | `public/dq-tiles.js` `a1dBossVanishPlay` header | the boss item |
  | arch bake + its invariants | `scripts/bake_dungeon_arch.py` header | anything touching `-walk.png` / `-overhead.png` |
  | project rules | `AGENTS.md`, `docs/AGENT-WORKFLOW.md` | session start (project CLAUDE.md requires it) |

## Kickoff prompt (paste verbatim into next session)
```
edu-rpg — Act 1 market-quality playthrough. Machine `tr`.

  cd ~/Documents/claudecode/edu-rpg && git fetch && git checkout fix/graduated-gpu-heal && git pull
  # HEAD should be 95b25bb. Work in your own worktree if you prefer; the branch is pushed.

READ FIRST (only these): docs/handoffs/2026-09-02-act1-market-quality-playthrough.md (this handoff),
then AGENTS.md and docs/AGENT-WORKFLOW.md as the project CLAUDE.md requires. Do NOT preload
docs/PROJECT-RUNBOOK.md or older handoffs.

LIVE STATE (verified 2026-09-02): TestFlight build 70 is uploaded AND installable (external Beta
Testers 2/2). Gate green on 95b25bb. Frozen bundle intact.

THE MANDATE, in the owner's words: "autonomously do a heavy playthrough and bug fix/front-end design
polish fix for market release quality … use all the tools you have at your disposal and work as
thoroughly as possible and until we achieve a high quality product base for act 1 and push to TF
and ping me so i can verify on my phone." Token budget is not the constraint; quality is.

ORDER OF WORK:
1. MAJOR — overworld walking is "extremely laggy and jittery"; image quality "poor". Invoke the
   `/smooth` skill and follow its loop: MEASURE FIRST (3 runs, median+spread, load < 10), one change
   per round, refute, gate. Its §5 names the lead: renderMap() builds 128,000 invisible Phaser
   Images for the 320x400 overworld — a permanent frame tax — and dq-tiles.js already covers that
   layer with `dqterrain` at depth 1, so emptying `tileLayer` on the overworld is viable without
   touching the frozen bundle. The skill's verdict device 4872FCF0 does NOT exist on tr; use the
   booted iPhone 16 1D7EAC42-3F69-4DAD-918C-518C4C98EAA0 and label the numbers with the device.
   `scripts/perf_probe.cjs` exists (1153 lines) and was never read this run — read it before
   writing a new probe.
2. Facing continuity: entering a town hard-codes facing 'down' (town.html ~l.367); pass the
   parent's heroDir in as arrival facing via the `act1-town-chrome`/entry message, and report the
   town's facing back on `act1-town-exit`. Dungeons already carry direction through (build 66).
3. Town exit: owner says it is "still not the edge of the map. the player needs to get the
   illusion that they are leaving the map." This is the FOURTH iteration (build 57 beyond the gate,
   62 on the gate, 63 canvas edge, 66 crossing line at the mouth). Do not move the line again on a
   guess: read the exit notes in each <town>-town.json first. The proposed reading: keep the trigger
   at the mouth, make the apron beyond it genuinely end, and add a fade-out so leaving reads as
   leaving. If you choose differently, say why in the commit.
4. Then the heavy playthrough: drive the whole of Act 1 end to end (all three towns, all four
   dungeons, shop/heal/save/battle/menus, new game AND continue AND second launch) with the
   Playwright harness against dist/ and — if the simulator MCP tool is allowed this session (check
   with a cheap `screenshot` action first) — on the packaged app. Fix what you find. Front-end
   polish to market quality is in scope. The two backed-out items (boundaries, baked boss) are in
   docs/handoffs/2026-08-30-build67-remaining-items.md WITH their measurements — read that before
   re-attempting either; the boss needs art regeneration, the boundaries need the owner's specific
   spots or an art-side pass.

RULES THAT BIT THIS RUN (all in the handoff's Gotchas — the short form):
- Never `npm run build`/`dev`/`npx vite`: the bundle is frozen. Edit public/ overrides, then
  ./scripts/build-dist.sh → npm run repin → npm run --silent gate. Gate on the COMMITTED tree.
- Grep the shipped bundle for i18n keys, not src/.
- Assert on what the UI SHOWS, in a phone/Capacitor context. Prove every fix by refutation: make
  the check fail on the pre-fix code first.
- Ship with ./scripts/ship-ios.sh and report its "CODEX REPORT: … uploaded AND installable" line.
  Never commit ios/App/Podfile.lock or App.xcodeproj/project.pbxproj.
- When done: push to TF, send the owner the before/after screenshots (SendUserFile), and PING him —
  `notifications.notify` from ~/Documents/claudecode (Slack) — so he can verify on his phone.
```
