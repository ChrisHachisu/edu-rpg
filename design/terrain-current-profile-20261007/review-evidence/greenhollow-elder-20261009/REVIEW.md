# Independent review: Greenhollow New Game / Continue intent

## Reviewed inputs

- Candidate `public/act1-hifi/adapter.js`: `bfc84a24e602c7b2da4de210a396079082ca24ae29c9c8997448a1a6c8418481`
- Candidate `scripts/test_greenhollow_new_game_continue_intent.cjs`: `f644777d7a2d9aa56f46e0bd0dfd4788730e626e94bb94e80a3d98fac83a527a`
- Frozen browser bundle `assets/index-BhoGQRaA.js`: `ab4fc9ad1204f23b4ea55dbae2d72bdf193a52e643271bcfe8642e2210556456`
- Prior adapter baseline: `elder-implementation-20261009/adapter.js.before`, SHA-256 `f898789e9759b61f85c673b3243c1e6267fdf28cc90436864978a85e34ad819b`

## Results

- **PASS, browser:** all six focused checks passed against the exact frozen bundle, candidate adapter intercepted only at `/act1-hifi/adapter.js`. Browser used the preserved app public tree with URL rewriting disabled.
- **PASS, rendered New Game:** after the real title New Game and Start actions, the iframe used `first=1`; hero appeared at authored Elder cell `[32.19, 23.61]`; the town-opened flag became true. Rendered screenshot: `retry-recovered-opening.png`.
- **PASS, failure/retry lifecycle:** with a legacy save present, the first town iframe navigation was intentionally aborted after real New Game. The shell reached error state with a Retry button at z-index 9999. Escape did not activate `MenuScene`. Clicking Retry succeeded with `first=1`, placed the hero at `[32.19, 23.61]`, and only then set the town-opened flag. Evidence: `failure-retry-probe.json`, `failure-cover.png`, `retry-recovered-opening.png`.
- **PASS, stale Continue reachability review:** frozen `GameState.loadGame()` replaces the live Player from the persisted manual save and does not call `newGame()`. During the observed failed-entry state, the visible error cover blocks the tested Escape-to-menu route and exposes Retry; after Retry reaches town readiness the pending intent is consumed. A same-page stale-Continue path was not reproduced through the production UI.
- **PASS, source lifecycle review:** adapter installs the `newGame` wrapper from `tick()` before the tested real title action. It sets intent only after `original.newGame()` returns, preserves New Game Plus delegation through `newGame()`, retains pending intent on iframe failure, and clears it only after the matching town runtime becomes ready.
- **PASS, manual-save / recovery boundary by source inspection only:** the adapter calls the frozen manual `saveGame()` for the live player and separately invokes the shell's validated `syncSnapshot` API. That API writes the recovery snapshot key after checking the matching live town map and a validation witness; it does not merge newer recovery flags into the manual-save record. This boundary was not separately exercised in this route run.
- No `code-check` script exists in the repository package scripts. No build, dependency install, native simulator, or upload was run.

## Harness finding for author follow-up

The test currently records `pageerror` only on the first Playwright page, so errors from `legacyPage` and `townPage` do not contribute to its final failure count. Its header command also omits the `serve` configuration needed to disable clean-URL redirects. The first review run timed out because `town.html` redirected to `/act1-hifi/town`, causing relative assets to resolve against the wrong paths. With URL rewriting disabled, the exact test passed. Author was asked to fix both harness issues and rerun; adapter remains frozen pending that retest.

## Scope and limits

This is browser and source evidence against the identified frozen bundle. It does not certify native iOS behavior, test all town transitions, or replace the separate simulator gate.

## Harness follow-up

- Final candidate test script SHA-256: `b18c4f967f0108dc4ed2c62adab311636d3b716fbf14ad44a0e0834b4081d6df`.
- Static follow-up confirms the documented `serve` config sets `cleanUrls:false`, only the adapter route is intercepted, and `trackPageErrors` is attached to all three pages before navigation.
- The author reports the updated route test passed all six checks with zero page errors after the browser was closed. I did not rerun the unchanged adapter scenarios because this follow-up changed only test setup and error aggregation.
