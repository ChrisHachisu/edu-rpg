# Local artifact history

## v1.17.1-ipad-hud-walk — 2026-07-13

- Base bundle: `v1.17.0-first-fixes.js`, 4,987,581 bytes, MD5 `60d90b63607b6e6980eb170aeeed445e` (unchanged).
- Additive UI override: synchronously suppresses the duplicate Phaser field HUD, hides stale town location text on the overworld, gives the menu the same tablet bottom-tab treatment as the field screen, and adds persistent numeric HP plus a responsive HP meter to the menu header.
- Movement: avoids rebuilding the hidden native HP/minimap/compass on every completed overworld step; native HUD refreshes are retained for map, floor, and quest-state changes.
- Checks: phone/iPad menu-header renders, iPad-size DOM regression, native-HUD visibility probe, overworld transition probe, menu/field computed-style comparison, JavaScript syntax, TypeScript, public/dist/iOS parity, and bundle guard passed.
- Deployment: local only; no gh-pages or TestFlight upload performed.

## v1.17.0-first-fixes — 2026-07-12

- Base: `v1.16.9-no-partial.js`, 4,987,498 bytes, MD5 `627a45a6a73db13c821812c51500e9a8`.
- Bundle change: exposed the existing audio manager's `setVolume()` through `window.__QOK` so the additive DOM settings slider can update live audio continuously.
- Output: `backups/versions/v1.17.0-first-fixes.js`, 4,987,581 bytes, MD5 `60d90b63607b6e6980eb170aeeed445e`.
- Checks: exact one-site diff, `node --check`, and 4.5–5.5 MB bundle-size guard passed.
- Deployment: local only; no gh-pages or TestFlight upload performed.
