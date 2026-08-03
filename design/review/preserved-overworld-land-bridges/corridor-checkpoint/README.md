# Rejected local corridor-mask checkpoint

> **REJECTED 2026-07-14:** The owner rejected local water-gap masks and broad
> terrain plugs as unnatural. This artifact is retained only as design history.
> The active direction is a systemic redesign of the full 320×400 overworld as
> one cohesive mainland while preserving its general progression path and
> terrain character. Do not implement the masks below.

This checkpoint is a candidate-only terrain specification. It does not apply
terrain to the runtime, change a route or anchor, edit a dungeon, or authorize
post-Oasis Haven story design.

## Provenance

- Exact fixed-seed generator extraction and post-`dq-tiles` corridor replay:
  hash-guarded evaluation of preserved bundle
  `dist/assets/index-BhoGQRaA.js`, SHA-256
  `a56026574b42168985b353e4cee824562716af83f92d03f408df04eac9127381`.
- Exact pre-override 320×400 generator terrain SHA-256:
  `97f0b936946695b5ce2eb073df4b9905e680942b299a5f87f1bf5c0544b96723`.
- Baseline artifact: `../baseline/shipped-overworld-baseline.json`.
- Proposed masks: `src/map-engine/corridorMasks.ts`.
- Review board: `corridor-masks-owner-checkpoint.svg` and its rendered PNG.

Stage A replayed the additive `dq-tiles` consolidation/repaint layer from
representative player starts in all four mainland land components. The full
post-override map hash is state-dependent, but all four replays produced the
same three corridor windows. The review board uses those stable post-override
rows. Corridor water, route, mouth, landmark, and special cells were invariant,
so the water-only mask and preservation proofs are exact.

## Recommended exact masks

| Corridor | Retained mouths | Changed preserved-water cells | Treatment |
|---|---|---:|---|
| Crystal | `(148,295)`, `(172,305)` | 21: `x=150…170, y=305` | blocked trees `x=150…154,166…170`; mountains `x=155…165` |
| Shadow | `(260,198)`, `(260,234)` | 31: `x=260, y=203…233` | blocked trees `y=203…207,229…233`; mountains `y=208…228` |
| Volcanic | `(148,110)`, `(172,110)` | 21: `x=150…170, y=110` | blocked trees `x=150…152,168…170`; mountains `x=153…167` |

All 73 cells have geographic `ground` substrate and a blocked surface
treatment: 47 mountains and 26 blocked trees. No proposed cell is ordinarily
walkable.

## Why these are minimum necks

The hash-locked shipped windows show a continuous water cross-section between
the existing non-water approaches at each retained corridor. A cardinal
minimum-water search inside each local window reaches the opposite retained
mouth using exactly 21 Crystal water cells, 31 Shadow water cells, and 21
Volcanic water cells. The proposed masks are those straight contiguous
cross-sections; deleting any proposed cell breaks that geographic chain.

Crystal has one equally minimal 21-cell alternative at `x=150…170, y=295`.
The recommendation uses `y=305` because its east end meets the existing tile-1
approach and `(172,305)` mouth directly, while the west mouth remains connected
by the preserved non-water cardinal approach. The `y=295` alternative instead
meets the west mouth directly but ends against a blocked-tree tile on the east;
it has no count or collision advantage. Either is geographically valid, so this
row choice is explicitly part of the owner checkpoint rather than claimed as a
unique mathematical result.

Every changed coordinate is tile `2` in the preserved bundle. Every route,
mouth, landmark, special, encounter-zone assignment, and out-of-mask terrain
cell remains untouched. Because every new cell is blocked mountain/tree rather
than ordinary walkable ground, the conversion adds geographic land connectivity
without adding a walkable bypass around the retained dungeon route.

These proofs are corridor-window scoped. Whole-mainland one-component proof is
an integration check against the complete Stage A terrain array; this artifact
does not claim that broader result on local windows alone.

The tree caps are a reviewable visual treatment, not shipped behavior. An
all-mountain treatment is a safe alternative with the same 73-cell masks and
the same collision/geographic proofs. Act 3/4 remains untouched.

## Scope caveat

Later-Act gate semantics and post-Oasis Haven story/dungeon design remain
provisional and owner-unreviewed. These masks preserve today's shipped
anchors/routes for the terrain checkpoint only; they do not lock future story
or dungeon design.
