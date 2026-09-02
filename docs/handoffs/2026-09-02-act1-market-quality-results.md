---
date: 2026-09-02
type: handoff
project: edu-rpg
milestone: act1-market-quality
status: active
supersedes: "[[2026-09-02-act1-market-quality-playthrough]]"
tags: [handoff, act1, playthrough, polish, testflight, performance]
---

# Handoff — Act 1 market-quality playthrough, results — 2026-09-02

Written on `tr`, worktree `.claude/worktrees/goofy-moser-2a1df4`, branch `claude/goofy-moser-2a1df4`;
`fix/graduated-gpu-heal` is fast-forwarded to the same HEAD and both are pushed.

## What shipped (builds 71 and 72, both `CODEX REPORT: … uploaded AND installable`)
- `a76ca39` **the jitter root cause**: build 70's menu→dungeon camera snap sat inside `deactivate()`,
  which the UI tick calls every frame on the field, so `centerOn` fought `a1mCam` and the rendered
  scroll stepped 7/4/2/7/4/2 px against a 4.33 px/frame hero. Snap now only when an overlay was up.
  Proven with a scroll-setter trace and the new read-only `scripts/motion_probe.cjs`.
- `9f08408` facing continuity: `?facing=` into town.html, `facing` on `act1-town-exit`, heroDir +
  `setFrame` after `loadMap`.
- `c842bb5` exit illusion: void beyond the mouth line (trigger unchanged), 300 ms `screen.transition`
  fade out, parent veil held across the swap and released.
- `0ced9be` New Game over a save asks first (the frozen bundle has no overwrite confirm).
- `91d34bc` one text box at a time (town `interact()` refuses under the parent's box).
- `536b208` review fixes: veil `finally`, keyboard path of the confirm, exit parked while suspended,
  reply-path guard, veil over the HUD (z 95) via `act1-town-exit-start`.
- `bd590cc` the Act 1 loading veil fades out (300 ms) instead of popping (build 72 only).
- `e1dc7b6` `scripts/device-motion/` (Swift frame dumper + phase-correlation analyser; no ffmpeg on tr).
- Docs: `docs/ACT1-ACCEPTANCE-BAR.md` (the owner's line-by-line bar + 6 questions),
  `docs/PRODUCT-GOALS-FROM-OWNER-FEEDBACK.md`, `docs/RESEARCH-JRPG-EDU-FEEL-CRITERIA.md`,
  `docs/playthrough/2026-09-02-census.md` (+ `scripts/playthrough_census.cjs`).

## Verification (all on the committed tree, simulator shut down)
- `npm run --silent gate` 20 PASS / 0 FAIL on `bd590cc`.
- `verify_town_owner_items.cjs` 37/37 · `verify_town_facing.cjs` 11/11 · `verify_town_exit_illusion.cjs`
  6/6 · `verify_title_overwrite_confirm.cjs` 11/11 · `verify_town_one_text_box.cjs` PASS ·
  `verify_veil_fade.cjs` PASS. Each was run against the build-70 dist first and FAILED there.
- SMOOTH A/B (browser, load 3.7–7, 3 runs interleaved): identical both sides; S4 RED ~145–155 ms
  on both (the round-5 chunk-arrival residual), everything else green.
- Device (iPhone 16 sim): confirm card, town arrival, exit fade frames, facing-away after exit all
  captured; the per-frame device walk A/B is INCONCLUSIVE (recorder 9–14 fps under load).

## Owner report
Artifact "Act 1 Steady Walk Report" (published from this session) with the six asks; the six
questions are also in `docs/ACT1-ACCEPTANCE-BAR.md`.

## Added after the owner's answers (builds 73 and 74)
- Owner: walk speed stays 5.4 cells/s ("Keep it. The overworld is quite sparse"); image quality:
  "Sharper the better" → `e10148b` sharpened chunks + landmarks (lossless), build 73.
- My calls on Q3–Q6: boss fixed now; boundaries accepted for this release (collect his spots);
  Kids band 6–8 with the grade wheel; Dragon Quest is the bar.
- `162da43` boss: plates re-rendered with `--skip-kind boss` (renderer is byte-deterministic), cover
  ellipses deleted, and a BLOCKER fixed: Darkfang Grotto's boss cell shipped as a warp (engine has
  5 floors, ours 3; `a1dReplayProgress` mirrored the engine map) so the Giant Toad could never be
  fought. Now the story flag decides. `verify_boss_vanish.cjs` 12/12, `verify_boss_fight_reachable.cjs`
  reaches BattleScene giantToad. Build 74.
- Chunk authority is `design/…/act1-final-art-geometry-r26/runtime/` (tracked); `public/act1-hifi/chunks`
  mirrors it; `ACT1_HIFI_MANIFEST_SHA256` is a hand tripwire (sign-off comment required).

## Builds 75 and 76 (the owner's second and third messages)
- Owner: "figure out a way to recreate the lag issue ... or eliminate it from a different angle"
  → build 75: Settings → **Performance readout** switch (the off-by-default index.html panel gains a
  rolling 30 s line + a device line). He screenshots it after a 30 s walk.
- Owner: "the frequent world loading really bothers me" → THE lag: the build-70 readiness veil
  fired for chunks off screen. `7a36282`: veil scoped to the camera + 500 ms grace + relief
  placeholder under a missing visible chunk (`verify_slow_chunks_no_veil.cjs`: b70 veil 11.9 s of
  a 14 s walk with 1.5 s chunk delay, fix 0 ms). Build 76.
- Owner: sharpen "hurts my eyes" → re-applied at 130%/r0.9 from the originals (build 76).
- The Mac CPU profile of a walk is 92% idle; the phone's remaining lag (if any) must be read off
  the readout: `wb Nms` = texture build cost per chunk, `~Hz`, `>100ms` count.

## Open, in priority order
1. Owner verifies build 72 on his phone (walk + leaving a town).
2. Owner decisions Q1–Q6 (walk speed, image quality route, boundary spots, boss gate, grade band,
   comparison title). Image quality is ART, not render: 93.6% uniform 3x3 blocks measured; the
   materials are 531 px ≈ 48 px/cell painterly. A sharpen-at-bake comparison exists.
3. SMOOTH-4 residual (~145 ms chunk-arrival block) — unchanged since round 5.
4. Sunken Cellar B1F wedge near the stairs (census D2) — manual walk on device; it is the
   backed-out boundaries item (owner spots wanted).
5. Boundaries only; the baked boss is DONE (build 74).

## Gotchas for next session (new this run)
- **`tr` has 8 GB RAM.** Never run the simulator and headless Chrome together; load hit 300–450 and
  every harness timed out on `page.goto`. `xcrun simctl shutdown all` twice → load 15, all green.
- The simulator MCP tool works on `tr`; the first tap after a boot often times out (retry). `swipe`
  with a `duration` drives the stick; `touch_path` dwell does not; bottom tab-bar taps never
  registered through the MCP (headless proves the tabs work).
- Random encounters end device walks; the sim recorder captures 9–33 fps depending on load.
- Chrome stops advancing an occluded iframe's CSS transition once the parent veil is opaque; the
  exit harness judges the combined visible fade and the veil held at the swap.
- `verify_town_facing.cjs` approaches Port Sapphire from the NORTH (133,346 walking down); the
  south cells are harbour water. The census's "Port Sapphire entry" flag came from that mistake.
- The Tower app (`TheTower.app`, PID 9231, started 09-01) burns a core; iCloud syncs `~/Documents`
  (bird/fileproviderd 50–60 %). Both are the owner's; flagged in the report.

## Kickoff prompt (paste verbatim into next session)
```
edu-rpg — Act 1 after builds 71/72. Machine `tr`.
  cd ~/Documents/claudecode/edu-rpg && git fetch && git checkout fix/graduated-gpu-heal && git pull
  # HEAD should be at or past bd590cc.
READ FIRST (only these): docs/handoffs/2026-09-02-act1-market-quality-results.md, then AGENTS.md and
docs/AGENT-WORKFLOW.md. Do NOT preload PROJECT-RUNBOOK or older handoffs.
LIVE STATE: TestFlight build 72 uploaded AND installable (verify with
scripts/ship-support/verify-delivery.py --app edu-rpg --build 72). Gate green on bd590cc.
FIRST: read the owner's answers to Q1–Q6 in docs/ACT1-ACCEPTANCE-BAR.md (Slack thread / his reply).
Then in his priority: whatever he reports from his phone on build 72; the image-quality route he
picks; SMOOTH-4 (~145 ms chunk-arrival block); the Sunken Cellar wedge; boundaries/boss per his call.
RULES THAT BIT THIS RUN: never sim + headless Chrome together on tr (8 GB); never npm run build/dev;
edit public/, build-dist.sh → repin → gate on the committed tree; refute every fix on the b70 dist
(a frozen copy lives at /private/tmp/claude-501/perf/dist-b70 while that scratch survives);
ship with ./scripts/ship-ios.sh and report its CODEX REPORT line; ping via notifications.notify.
```
