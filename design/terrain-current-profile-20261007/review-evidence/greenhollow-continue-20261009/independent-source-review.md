# Independent review: Elder Continue / New Game intent repair

## Identity

- Reviewed source: `public/act1-hifi/adapter.js`, SHA-256 `a07df5df2fb0f17c832629ad8107c82127a7996dea117a3ff69eb2fb53727b76`.
- Reviewed focused test: `scripts/test_greenhollow_new_game_continue_intent.cjs`, SHA-256 `3febde55a397e445eaa638adbc094e46b0be0d957429efe1bc18b50d12d76ae5`.
- Exact preserved browser bundle: `dist/assets/index-BhoGQRaA.js`, SHA-256 `ab4fc9ad1204f23b4ea55dbae2d72bdf193a52e643271bcfe8642e2210556456` (4,987,635 bytes). The harness intercepted only `public/act1-hifi/adapter.js`; remaining page assets came from this bundle.
- No app source, `dist`, package, or release candidate was edited. `node --check` passed on the adapter and authored harness.

## Review result

**Source review: PASS.** New-game intent is granted only after the real `GameState.newGame()` returns, retained through a failed town iframe attempt, and consumed only after the Greenhollow town runtime is ready. The Continue wrapper wraps the title action's current loader, migrates `intro.done` only after a truthy successful load, and clears an unconsumed New Game intent only on that successful load. A false load leaves story flags and intent untouched; `finally` restores the loader wrapper only if it still owns the slot, preserving the recovery wrapper's own restoration. The frozen bundle uses synchronous boolean `loadGame` results in the exercised title path.

**Rendered browser flows: PASS, with one-shot/reentry limitation below.** On the exact frozen bundle and final adapter, the corrected harness run passed fresh New Game through a simulated first iframe failure and visible Retry; successful legacy Continue remained at Overworld `(69,256)` until actual ArrowUp entry and arrived at the Greenhollow gate without `first=1`; saved-town Continue opened without the Elder overlay; actual town Save persisted `intro.done` with existing flags; cold reload/Continue restored the saved town coordinate; recovery overlaid its snapshot before migration; and failed Continue left flags unchanged, did not start WorldMapScene, and restored the loader slot.

The final-source log is `final-browser-review-corrected-harness.log` (SHA-256 `466dc6933c716f2893fc9e42f64f3f21f6d97344dacb75f31aa2cc48e9d75984`). It ends with a timeout in a separate synthetic pending-intent-reset sequence while waiting for ArrowUp to make the town iframe ready. That synthetic reset's two assertions passed when run alone (`continue-intent-focused-final.log`, SHA-256 `160493012cf8127a50fbaacb121a97919ec08ed566110b9083c5497be985e35b`). The timeout is harness sequencing, not a failed product assertion; the independent and authored focused runs exercise the reset directly.

The authored combined harness initially failed New Game+ because it injected VictoryScene before the first town overlay was ready. After waiting for readiness, that synthetic setup still retained keyboard focus in the town iframe, so Enter did not activate the parent Phaser VictoryScene. I replaced that setup only in my independent harness copy with a valid saved Overworld Continue, then injected VictoryScene from the non-town world. The real Victory action opened New Game+ creation, and confirmation used the actual newGamePlus path; the fresh-town opening remained present and `intro.done` remained unset. Focused result: `ngplus-focused-final.log` (SHA-256 `e49d6fd90d914263c68c1b29575ffdf3b4e11ea819b9e6ebb355ba27280da494`). The independent harness is `test_continue_intent_independent.cjs` (SHA-256 `721e614007c30ece81e2bb566cf6982faab2f58b2cf2557d56ae60fb75ab7d1d`). These harness corrections were not applied to the author's file; they were sent to the author for integration.

The test-only first-town iframe abort is a deterministic failure fixture; it is not evidence of a naturally occurring WebKit/network fault. The New Game opening appeared at the authored Elder cell after retry and the existing town-opened flag was written after readiness. The test did not navigate out and re-enter Greenhollow on the corrected candidate, so the exact native reentry/no-repeat visual assertion remains pending; the adapter's one-shot consumption is statically verified. The previous Release84 native legacy-Continue result remains valid only for its exact old package and is regression context, not corrected-candidate native proof.

## Findings and scope limits

- No source defect found in the reviewed adapter delta.
- Author harness reliability issues were reported: delay synthetic Victory until a valid world/town-ready boundary and use a non-town save to avoid iframe focus; make the synthetic reset's town-arrival wait deterministic or keep it as a focused test.
- No full Release84 phone/tablet acceptance claim. Corrected-candidate native checks, including actual town reentry, remain pending.
- Static route matrix updated to allow exact unchanged-input continuous-collision connectivity plus rendered native entry/return/local approach checks, without requiring a full manual walk to every exit. Matrix: `../phone-qa-elder-20261009/reports/corrected-candidate-native-route-matrix.md`, SHA-256 `00b842de633fe1bddd7b9324b54545b74335da3c25d8abcc2903b1e91cf558c0`.
- Browser server was stopped after review. No simulator, build, installation, upload, or native claim was made.

## Compact status

| Check | Result |
|---|---|
| Adapter static review and syntax | PASS |
| Fresh New Game retry/readiness | PASS |
| Legacy Continue and town entry | PASS |
| Saved-town Continue, real Save, cold Continue | PASS |
| Recovery overlay and failed Continue | PASS |
| Successful Continue clears pending intent | PASS (isolated 2 checks) |
| New Game+ route/fresh opening | PASS (valid non-town fixture, isolated 2 checks) |
| Full combined harness exit | FAIL in synthetic reset ArrowUp readiness wait; isolated assertion passes |
| Actual corrected-candidate reentry/no-repeat | PENDING |
| Corrected candidate native phone/tablet gate | PENDING |
