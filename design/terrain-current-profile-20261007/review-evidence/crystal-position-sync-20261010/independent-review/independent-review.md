# Independent rendered review: cross-map position synchronization

**Result: scoped pass with a test limitation.** I independently reviewed adapter `a555838eab53e2d5e5c46d3e627b2f9577d66536355df77b8e08c82e8a6c6a08` and verified its runtime behavior with the exact Release84 frozen public tree. The six focused deterministic checks passed. The browser run demonstrated real Crystal exit/re-entry, immediate live-position synchronization, recovery snapshot synchronization, retained earned Toad flags, legacy Continue, and the Greenhollow New Game opening.

The browser served `App.app/public` from the exact candidate (frozen JS bundle SHA `ab4fc9ad1204f23b4ea55dbae2d72bdf193a52e643271bcfe8642e2210556456`) and intercepted only `act1-hifi/adapter.js` from the reviewed source. The earned-state fixture changed only position; its boss flags are bound to the hashed earned-resume source in the browser report.

The failed-load assertion intentionally called the frozen scene's `loadMap()` with a nonexistent map ID. It threw and left the player position unchanged, as expected. That invalid injection produced one later `pageerror` on the `failed-load` page (`Cannot read properties of undefined (reading 'type')`); earlier pages reported no errors. This is a synthetic corrupted-scene case, not a supported user route, and the run is not represented as globally page-error-free.

## Evidence

- Browser report: [browser-report.json](../browser-evidence/independent-run-07/browser-report.json), SHA-256 `69b7983e62d8489df2825fcf972d93e48d51680c8313e346137e008e3c60f323`
- Independent harness: [test_worldmap_transition_position_sync_independent.cjs](../browser-evidence/independent-run-07/test_worldmap_transition_position_sync_independent.cjs), SHA-256 `0543e32c9800a5c3eccd75e68d37df22ea871b769f02ac482e6fd2442f51aeeb`
- Immediate exit view: [crystal-exit-immediate.png](../browser-evidence/independent-run-07/crystal-exit-immediate.png)
- Idle recovery view: [crystal-exit-idle-resume.png](../browser-evidence/independent-run-07/crystal-exit-idle-resume.png)
- Re-entry view: [crystal-reentry.png](../browser-evidence/independent-run-07/crystal-reentry.png)

The detailed machine-readable record is [independent-review.json](independent-review.json). This is browser review evidence only; it is not a native phone/tablet acceptance or release-eligibility record.
