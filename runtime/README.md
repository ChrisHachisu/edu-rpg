# Preserved shipped runtime

`baselines/v1.17.1-ipad-hud-walk/` is the immutable, reference-closed local
runtime that was approved for stabilization. It contains exactly 257 files and
the protected 4,987,581-byte opaque bundle. `manifests/` records every path,
size, SHA-256 hash, category, provenance, and save-compatibility marker.

This baseline is the reproducible source for `dist/`; the stale TypeScript/Vite
build is not. Hydrate only into a nonexistent disposable directory:

```bash
npm run hydrate
npm run verify:runtime
python3 scripts/smoke_static_runtime.py --input dist
```

The hydrator fails closed if `dist/` already exists. Move or remove a generated
worktree-local `dist/` deliberately before rehydrating. Never point it at the
preserved baseline or at a directory containing user work.

## Asset authority

- Files under this baseline reproduce the current shipped runtime.
- `public/assets/monsters/*.png` is a separate 75-file candidate set. Those
  filenames intentionally collide with the shipped monster names, but all 75
  hashes differ. The hydrator never copies that directory.
- Candidate promotion is an explicit lead-owned rebaseline: review individual
  replacements, update the preserved baseline and manifest, hydrate a clean
  output, and rerun rendered checks.
- Dated backgrounds, contact sheets, backups, and unused prop variants are not
  runtime inputs.

`write-manifest` exists only for an intentional baseline promotion and requires
the exact profile name as confirmation. A normal task must not run it.

`manifests/regular-monster-candidates-v1.17.1.json` separately freezes the
current 75 candidate hashes and their shipped counterparts. Run
`npm run verify:candidates` to prove that review set has not drifted.
