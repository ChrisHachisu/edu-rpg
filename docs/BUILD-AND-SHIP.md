# Build and ship model — read before touching `dist/`

> [!danger]
> `npm run build`, Vite, and the checked-in TypeScript do not reproduce the
> shipped game. The package scripts intentionally block that path.

## Stable runtime model

The canonical local release profile is
`runtime/baselines/v1.17.1-ipad-hud-walk/`. It is a 257-file, 42,683,025-byte
static closure containing the protected 4,987,581-byte bundle and only the
assets the runtime requests. The paired manifest records per-file hashes and
save schema v4 compatibility.

`dist/` and `ios/App/App/public/` are disposable hydrated outputs. They remain
ignored by Git. The TypeScript tree is historical until a later engine rebuild
replaces it behind behavioral parity gates.

## Safe local workflow

Run this in a fresh worktree where `dist/` does not exist:

```bash
npm run hydrate
npm run verify:runtime
npm run smoke:runtime
npm run preview
```

The hydrator refuses to overwrite any existing output. To rehydrate, first
confirm that the worktree-local `dist/` is disposable, then remove it explicitly.
Never remove or replace the preserved baseline.

The current long-lived workspace intentionally keeps its old ignored `dist/`
with review and backup files. Do not delete it merely to make the exact-closure
verifier pass; use a fresh worktree or a temporary output instead.

## Authority and promotion

- The versioned runtime baseline is what web and Capacitor reproduce today.
- The opaque bundle identity is SHA-256
  `a56026574b42168985b353e4cee824562716af83f92d03f408df04eac9127381`.
- The current `public/assets/monsters/*.png` files are unapproved candidates.
  All 75 differ from the 75 shipped regular monsters. Hydration never copies
  them.
- Other `public/` overrides and assets are authoring inputs for future reviewed
  changes, but a task does not become shipped merely by editing them.
- Candidate promotion is lead-owned: update selected canonical inputs, create a
  new versioned baseline and manifest, hydrate a new output, and run rendered
  browser plus simulator checks. Never broad-copy `public/` onto a runtime.

## iOS synchronization

The tracked native inputs are `capacitor.config.ts`, `ios/App/App.xcodeproj`,
the workspace metadata, app source/resources, `Podfile`, and `Podfile.lock`.
Pods, native build output, archives, and `ios/App/App/public/` stay generated.

From a verified fresh worktree:

```bash
npm ci
npm run hydrate
npx cap copy ios
python3 scripts/runtime_baseline.py verify --input ios/App/App/public --allow-capacitor-glue
```

Capacitor adds `cordova.js` and `cordova_plugins.js`; when verifying its payload,
compare the manifest-owned 257 paths and treat those two files as generated
native glue. Run `scripts/ship-gate.sh` only after an intentional native sync.

## Release boundary

Hydration, local browser checks, and simulator builds do not authorize a web or
TestFlight release. Deployment still requires explicit owner authorization and
an isolated release worktree. Never alter `gh-pages` or App Store Connect as a
side effect of stabilization or feature work.

## Save and rollback contract

- Manual key: `edu-rpg-save`
- Autosave key: `edu-rpg-autosave`
- Accepted schema: version 4
- Preserved migrations: v1→v2 floor, v2→v3 sound, v3→v4 quests

The stabilization baseline changes no gameplay or save serialization. Rollback
is a branch/commit switch followed by hydration into a new output; do not patch
or regenerate the opaque bundle during rollback.
