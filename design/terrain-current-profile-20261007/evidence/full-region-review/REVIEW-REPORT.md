# Independent full-region terrain output review

Status: **PASS for the bounded static generation artifact; profile installation should wait for a collision-aware static route sweep.** This does not establish game integration, runtime streaming, or native movement.

## Identity and reproducibility

- Reviewed canonical generator: `recovered-candidate/design/terrain-current-profile-20261007/generate_forward_profile.py`, SHA-256 `ae4b0b40f36eaa1b8d077c3e703856acdd4945679a4c934e6e76bfcff45f6fc7`.
- Portable output receipt SHA-256 `f1347de0b33db4b8428abed9f722045d44f94ed3a08d50133ddfb509b30a456e`; author report SHA-256 `eacc7f6fc4eba2c07d05724e16a5780a868af0fd274c1d7c089aa5a5f018d4cf`.
- Independently hashed every file in each 488-entry A, B, and portable inventory: zero missing or mismatched files. A and B inventories match exactly. Portable output differs from A only in the documented close-up label and manifest provenance fields; all terrain layers, raised alpha, and QOK collision bytes match.
- The 37-file frozen input bundle was retained. The portable generator resolves bundle assets and recipes from its profile directory, reads the sibling runtime tree, and sends writable runtime adapters/output to the explicit work root; no temporary or task-specific absolute paths are embedded in the canonical generator.
- Canonical generator passed `py_compile`, `--help`, and scoped `git diff --check`.

## Independent recomputation

- Reassembled the 120 emitted forest layers and got exact byte-for-byte alpha parity with `evidence/final-visible-raised-alpha.png`; no support extends beyond authored bounds.
- Independently decoded `QOKF8COL` (version 1, 64-byte header, 4736×5824, 32 pixels/cell, LSB0). Its embedded source SHA matches final raised alpha and XOR is zero.
- All 120 output chunk IDs and geometry match the current source manifest. Water and canopy layer hashes match the frozen current manifest. The A1OW source pin is unchanged.
- Independently rasterized the nine approved north transforms from the pinned atlas/recipe: 290,662-pixel alpha union and all nine contact anchors match the approved fixture.
- The selected boundary set contains exactly 40 unique records, including the immutable 11 pilot seeds and both accepted flank placements (`118.925`, `135.625`); rejected `136.050` is absent. 78 F/M contacts were measured; target uncovered art reduced from 36,421 to 6 pixels. Boundary crowns introduce zero owner-plain pixels and zero current guard hits.
- The nine approved north objects have 149,328 alpha pixels over owner-plain cells (ridge 75,173; fill 74,155). This is the previously approved north fill silhouette and is recorded separately from boundary-crown spill; it must not be summarized as a blanket zero-plain-pixel result.
- Six residual pixels remain in three disconnected one-row components of 2, 1, and 3 pixels. They remain unfilled and are not described as zero-gap. At player-scale crops they are tiny isolated points at the forest/mountain edge, not a continuous grass separator. Static crops do not prove traversability or native contact behavior.

See [independent recomputation](/private/tmp/edu-rpg-build83-paint-audit-20261005/current-terrain-review-20261007/full-region-review/independent-recomputation.json) and reviewed views under `visual/`.

## Visual review

The generated whole-map contact sheet and player-scale north/east seam crops show a coherent connected cliff boundary and forest edge over clean meadow ground, without a dark fuzzy grass band, clipped tree crowns, or detached fallback art. The small companion fin in the east crop belongs to the retained source composition and meets the adjoining low rock mass. The fallback layer is visibly softer at 6ppc, as expected; comparison shows resampled edge fringe, not a separate misplaced object. Reported support outside projected 32ppc collision is 5,834 pixels at alpha >=16, with maximum 2.236 pixels at the 6ppc fallback scale. Native runtime display still needs validation.

Visual evidence generated read-only from emitted chunk/base/fallback assets is in `visual/`: `north-full.png`, `north-fallback6x8.png`, `east-fm-full.png`, `east-fm-fallback6x8.png`, `companion-fin-contact-full.png`, and `residual-six-crop.png`.

## Remaining route-proof gap

The receipt verifies 8 exits, 11 approaches, and Crystal Cave `[149,279]` against the current `seedWalkableAt` world-map graph and tests the full selectable-hero union at route/start guard cells. It does **not** prove connected paths after applying the generated QOK mask and unchanged A1OW water/movement constraints; there is no collision-aware path sweep through the routes. Require a bounded static route sweep before profile installation: find paths from the current start to each exit/approach and cave cell using current world-map authority, then sample the full live G3/male alpha union along the path and adjacent movement substeps against the actual QOK mask plus current A1OW/tile rules. Keep native streaming, save/resume, and phone/tablet tests as separate later gates.

Receipt correctly remains `fullWorldComplete=true`, `gateReady=false`, `nativeVerified=false`.
