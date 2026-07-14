---
date: 2026-07-14
type: architecture
status: completed-local
project: edu-rpg
milestone: canonical-runtime-and-worktree-readiness
---

# Code, data, and worktree stabilization plan

## Completion record — 2026-07-14

The local stabilization gate is complete on branch
`codex/stabilize-runtime-baseline` at commit `8775c0e` (baseline commit
`c7aaaeb`). Nothing was pushed or deployed.

- The exact 257-file shipped closure is tracked under
  `runtime/baselines/v1.17.1-ipad-hud-walk/` with per-file hashes.
- The protected bundle remains 4,987,581 bytes with SHA-256
  `a56026574b42168985b353e4cee824562716af83f92d03f408df04eac9127381`.
- All 75 divergent public regular monsters are preserved and separately frozen
  as unapproved candidates; hydration never copies them.
- Vite was removed from the dependency tree, the legacy build scripts fail
  closed, and a clean install reports zero npm audit vulnerabilities.
- A detached external worktree independently hydrated, verified, served, loaded
  save schema v4, moved the hero, transitioned town→overworld, and entered a
  battle with zero runtime errors.
- That worktree synchronized Capacitor, installed Pods, built an isolated iPhone
  simulator app, verified the app-embedded runtime manifest and bundle hash,
  launched successfully, and rendered the title screen without a crash.

The branch is now a safe base for bounded task worktrees. The long-lived main
workspace remains intentionally dirty and its old ignored `dist/` was not
deleted or overwritten.

## Decision

Stabilize the shipped game before implementing or delegating the selective map
engine rebuild. The current repository cannot safely support parallel worktrees:
`main` contains stale tracked TypeScript while the healthy runtime, current
overrides, most assets, iOS project, and current documentation are ignored,
untracked, or dirty.

Stabilization is a single-owner gate. Parallel implementation begins only after
a fresh worktree can hydrate and verify the preserved runtime from the canonical
baseline.

## Verified baseline facts

| Evidence | Verified state |
|---|---|
| Current commit | `8f86f9de7d3f495f0bb6976420dcd3a6cdcab873` on `main` |
| Healthy local bundle | `dist/assets/index-BhoGQRaA.js`, 4,987,581 bytes |
| Healthy bundle SHA-256 | `a56026574b42168985b353e4cee824562716af83f92d03f408df04eac9127381` |
| Source map | None present; bundle has no `sourceMappingURL` |
| `gh-pages` bundle | 4,987,498 bytes, SHA-256 `a728ac2ba8d6a0e383194286dc8c4a91df7f664b39ea6df4670c26468138eb91` |
| `dist/` Git state | Ignored; no files tracked |
| Critical overrides | `public` and `dist` twins are byte-identical, but the `public` sources are untracked |
| Regular monster twins | All 75 `public/assets/monsters` files differ from their shipped `dist` twins |
| Capacitor payload | `ios/App/App/public` mirrors `dist` plus generated Cordova files; platform project inputs are untracked |
| Fresh worktree | Receives stale source and cannot materialize the shipped runtime |

The 83-byte local/`gh-pages` bundle difference must be reconciled before either
artifact is called the release baseline. No bundle should be copied over the
other merely because their filenames match.

## Definition of stable

The project is stable only when all of the following are true:

1. Every runtime-critical file has a named canonical source or is explicitly
   classified as an immutable opaque dependency.
2. The exact approved opaque bundle is durably preserved with size, SHA-256,
   content, and provenance checks.
3. Approved overrides and runtime assets are tracked as source inputs.
4. `dist/` is reproducibly hydrated without invoking the stale Vite build.
5. The iOS project source is tracked while generated platform payloads and build
   products remain ignored.
6. Monster, background, and other divergent asset families have explicit
   authority; no broad synchronization is allowed.
7. A fresh worktree can hydrate the runtime, run the static smoke checks, and
   launch the canonical simulator path.
8. The stabilized baseline has an owner-authorized commit from which task
   worktrees can branch.

## Minimal canonical model

Use the shortest model that preserves the shipped game:

- **Opaque runtime dependency:** preserve the approved 4.99 MB bundle directly
  as a versioned vendor input. Do not reconstruct the whole compiled game first.
- **Tracked runtime source:** make approved `public/` overrides and runtime assets
  canonical after resolving divergent families.
- **Hydrated output:** keep `dist/` ignored and rebuild it only through a new
  non-Vite hydration command that copies the approved bundle, static shell,
  overrides, and runtime assets into a clean output directory.
- **Tracked native shell:** preserve Capacitor config, Xcode project, Podfile,
  lockfile, and safe Fastlane/ship scripts. Continue ignoring Pods, DerivedData,
  generated `ios/App/App/public`, IPA, dSYM, and reports.
- **Manifest:** record every hydrated runtime file's path, category, size,
  SHA-256, and canonical owner.

Do not introduce a remote artifact service or new dependency unless direct Git
tracking of the curated runtime inputs proves impractical. The opaque bundle is
only about 5 MB; complexity is not justified for it.

## Asset authority rules

### Regular monsters

All 75 ordinary monster pairs currently diverge. Until reviewed:

- shipped `dist` files define current runtime behavior;
- current `public` files are preserved as candidate source work;
- neither side overwrites the other;
- a contact-sheet/provenance review classifies each pair as shipped baseline,
  approved replacement, or archive;
- promotion is explicit and updates the manifest.

The separate 75 HD monster family is not a reason to discard either ordinary
set; its runtime role must be recorded independently.

### Backgrounds and review artifacts

Only assets referenced by the shipped runtime or an approved design manifest
belong in the hydrated runtime. Contact sheets, dated review folders, backups,
and rejected outputs stay outside the runtime source set even if they currently
exist under `dist/`.

### `public` / `dist` twins

Synchronization is one-way and lead-owned after stabilization:

1. edit tracked canonical source;
2. hydrate a fresh `dist/`;
3. verify manifest and protected bundle identity;
4. copy the verified payload to the native shell only during an authorized
   integration/release flow.

Never manually edit both twins and never use broad directory copies over an
unknown runtime.

## Stabilization stages

### S0 — Freeze and classify

- Generate a read-only inventory of the current `dist`, `public`, iOS payload,
  source, design, documentation, and release inputs.
- Record hashes and sizes before moving or promoting anything.
- Classify every required file as canonical source, opaque dependency, generated
  output, review evidence, backup, or unknown.

**Gate:** no unknown file may be required to launch the shipped game.

### S1 — Reconcile runtime authority

- Reconcile the local and `gh-pages` bundle difference by inspected change and
  runtime provenance, not filename.
- Resolve the 75 regular monster pairs without overwriting either set.
- Identify runtime-used battle backgrounds and remove review-only artifacts from
  the future hydration set.
- Identify the six changes in the existing stale linked worktree; preserve it
  until ownership is known, then retire it rather than reusing it.

**Gate:** one approved source exists for every hydrated runtime file.

### S2 — Materialize canonical inputs

- Preserve the approved opaque bundle as an immutable tracked input.
- Track approved overrides, runtime assets, current architecture/design docs,
  Capacitor/Xcode inputs, and release gates.
- Keep generated output and local evidence ignored.

**Gate:** the canonical inputs are complete without staging unrelated dirty-tree
files. Never use `git add -A`.

### S3 — Add non-destructive hydration and verification

- Hydrate to a clean worktree-local `dist/` without TypeScript or Vite.
- Refuse to overwrite an existing output unless it is an explicitly disposable
  hydration directory.
- Verify the approved bundle hash/size, 75-monster content marker, required
  overrides, protected assets, and complete runtime manifest.
- Keep the legacy `npm run build` path quarantined from the golden output.

**Gate:** hydration from canonical inputs reproduces the approved manifest and
cannot silently create the 2.4 MB stale bundle.

### S4 — Runtime smoke and save proof

- Serve only the hydrated static artifact.
- Verify launch, locale/UI bridge, representative field movement, encounter and
  battle entry, save/load, and map transition.
- Probe and record the actual shipped save schema/version dynamically.
- Verify the canonical iPhone simulator path from the hydrated payload.

**Gate:** static and simulator evidence match the preserved runtime behavior.

### S5 — Owner-authorized baseline commit

- Review the exact staged inventory and exclusions.
- Create a stabilization commit only after explicit owner authorization.
- Do not deploy or alter `gh-pages` as part of this commit.

**Gate:** the committed baseline is reviewed, intentional, and contains no local
caches, build products, credentials, reports, or unrelated dirty-tree files.

### S6 — Fresh-worktree proof

- Create a new worktree outside the repository from the stabilized baseline.
- Hydrate and verify the runtime there with no dependency on untracked files from
  the main workspace.
- Run the static smoke test and one canonical simulator launch.

**Gate:** all checks pass in the fresh worktree. Only then may the selective map
engine be split across worktrees.

## Worktree operating contract after stabilization

- One branch and one external worktree per bounded task.
- Workers edit tracked source/data only; they never edit the opaque bundle,
  hydrated `dist`, native generated payload, shared package lockfiles, or release
  branches.
- Shared registries and integration manifests remain lead-owned.
- Town and dungeon tasks own one location-specific manifest/layout module each;
  the lead integrates shared engine changes serially.
- Asset workers write to task-specific staging paths. The lead promotes accepted
  assets into canonical source and regenerates the manifest.
- Each worker gets a unique static-server port, simulator or device allocation,
  DerivedData directory, and evidence path.
- Worker summaries are claims; the lead reruns integration and rendered checks.
- Bundle promotion, public-to-dist hydration, native sync, commit, push, and
  release remain lead-only consequential actions.

## No-go conditions

Do not start parallel map-engine implementation while any of these remain:

- required runtime files are untracked or unknown;
- the approved bundle identity is ambiguous;
- monster/background authority is unresolved;
- a fresh worktree needs files from the dirty main workspace;
- hydration can invoke Vite or overwrite the golden runtime;
- save/load has not been proven against the hydrated artifact.

## Authorization boundary

The owner authorized finishing stabilization, including local commits. That
authorization did not include pushing, deploying, altering `gh-pages`, deleting
the existing linked worktree, or choosing between divergent asset candidates.
Those actions remain out of scope without a new explicit instruction.
