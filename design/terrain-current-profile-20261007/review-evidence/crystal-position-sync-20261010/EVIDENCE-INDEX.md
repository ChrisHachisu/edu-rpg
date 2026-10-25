# Crystal position synchronization evidence — 2026-10-10

This folder carries the reviewed source/browser evidence for the adapter map-position synchronization change. Independent review artifacts are copied byte-for-byte from `W/crystal-position-sync-20261010/independent-review` and `W/crystal-position-sync-20261010/browser-evidence/independent-run-07`; their original JSON and Markdown files are unmodified. Relative report links resolve within this folder. The copied reviewer JSON retains its original W-side absolute provenance paths.

## Reviewed code and test

- Source adapter: `public/act1-hifi/adapter.js`, 61,901 bytes, SHA-256 `a555838eab53e2d5e5c46d3e627b2f9577d66536355df77b8e08c82e8a6c6a08`.
- Official harness: `scripts/test_worldmap_transition_position_sync.cjs`, 24,463 bytes, SHA-256 `9ed0c6c78a7ea8f28df7ca2062eece5e345129f04f5d0ec971bca097da31b1f7`; deterministic wrapper/unit checks pass 6/6. The duplicate `author-test-worldmap-transition-position-sync.cjs` has the same bytes and hash.
- Earned-state fixture: `earned-transition-fixture.json`, SHA-256 `eafb2810c51aaec4c7ceb299cbefe8897563b39e9e61ccc210c280051f0aceb0`. Only player position was changed from the consistent earned SQLite snapshot; Giant Toad flags remain source-derived.

## Independent rendered review

- Independent result: scoped pass with a test limitation, in `independent-review/independent-review.json` (SHA-256 `68114ae5c41c0bb3e5e11ff0b9af87c81c137ea5b285b6799276d322d29f19ed`) and `independent-review/independent-review.md` (SHA-256 `93b27eac1e40c278d63d20b3b830ff9318ce71fb17b7451604f582ecc519e352`).
- It records eight behavioral assertions passing in exact Release84 frozen browser assets, with only the adapter request intercepted to the reviewed source. The frozen bundle SHA is `ab4fc9ad1204f23b4ea55dbae2d72bdf193a52e643271bcfe8642e2210556456`.
- The deliberate invalid-map load left position unchanged but caused one later page error on its synthetic failed-load page. This evidence does not claim a globally page-error-free run or validate a supported user route.
- Independent report's recorded focused test SHA `76c0a683...` predates the final official harness SHA above. The only later harness change corrected its expected New Game destination from `overworld` to the already-observed `greenhollow`; `showingMessage` and `first=1` remain required. The reviewer independently observed and passed that Greenhollow opening. No broad author browser rerun followed the assertion correction.

## Author run limitation

`author-browser-run-06-report.json` (SHA-256 `997d9edab5b0e33117cd10a75b0dc2c4aded1afaba3237edf43604f514373e66`) is preserved unchanged. Its transition exit, idle resume, re-entry, and legacy Continue assertions passed; it reported New Game false only because the old harness expected `mapId=overworld`, despite observing `mapId=greenhollow`, `showingMessage=true`, and `town=greenhollow&first=1`. It therefore stopped before the later synthetic failure check. Use the independent reviewer report for final rendered acceptance.
