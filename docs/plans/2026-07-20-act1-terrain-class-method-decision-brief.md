---
date: 2026-07-20
type: decision-brief
project: edu-rpg-map-engine-semantic-data
milestone: act1-checkpoint2-method-selection
status: owner-approved-2026-07-20
supersedes-method-of: docs/handoffs/2026-07-20-act1-redesign-history-unnatural-blockers-planning-handoff.md
---

# Act 1 overworld: checkpoint-2 method decision brief

Planning-only. No polygons, masks, art, or runtime work were produced. This brief answers the redesign-history handoff: it names the root cause, compares the three candidate method families, and recommends one repeatable cross-act workflow. Nothing proceeds until the owner approves Gate 0.

## 1. Confirmed starting position

- Relay 27's checkpoint-2 region-and-gateway pack is owner-rejected (NO-GO). Its topology checks passed; its barrier shapes failed as world design. It is preserved as failure history and is not a geometry baseline.
- Immutable constraints all confirmed and carried forward: native frame `2368x2912`; checkpoint-1 frame and land-mask SHA-256 hashes; Act 2 connector `(2166,1132)`; the eight landmark identities; the 7-edge story graph and its guards (Reef departs Port forecourt; Whispering does not continue to Darkfang; Darkfang does not connect to Crystal); both coastal relationships (Port Sapphire and Coastal Reef touch the sea); forbidden-shortcut intent; Crystal dynamic-seal semantics (`boss.giantToad.defeated === true`, own property); actor-foot radius `4`; max movement substep `2`.
- The terrain-distribution contract from the reconstruction contract remains binding: open meadow/grass/heath/clearings 32%±4%, trails/bridges/aprons 8%±2% (art-level, zero mask contribution), blocked old-growth forest 47%±5%, blocked cliff/coastal-rock/Crystal-mountain 13%±3%. Working units: the contract's cell system, 148x182 cells at 16 native px per cell.

## 2. Root cause, stated physically

Every failed attempt authored **traversal geometry** as the primary object (route ribbons, art-derived masks, clean polygons, region polygons wrapped in blocker bands) and then asked terrain labels or artwork to justify it. A landscape formed that way cannot look natural, because nature does not produce uniform-width bands, convex basins, or rectangular apertures: mountains are ranges with ridgelines and saddles, forests are masses with lobed edges, cliffs follow elevation contours, and openings exist where geology permits them (a valley, a shelf, a gap).

The proof is already on the map: the one element of Relay 27 that looks right is the locked checkpoint-1 coastline, which is fractal and irregular because it was authored as geography. Everything interior was authored as a diagram. The fix is therefore representational, not procedural: **stop authoring polygons of any polarity.** Neither walkable-first nor blocker-first vertex authoring can produce organic boundaries at acceptable cost, and generated art can only beautify, never repair, a schematic shape.

## 3. Method comparison

### A. Barrier-first world structure
Design continuous physical systems (coast, ranges, cliffs, forest masses, rivers, walls), derive walkable ground as the complement.
- For: barriers become continuous, causally motivated systems; directly attacks the band problem.
- Against: if barriers are still authored as **polygons**, the same schematic failure recurs in mirror image (Relay 27 already was a crude barrier-first attempt). Also risks discovering late that the derived complement fails the story graph.

### B. Co-designed barrier skeleton and roaming basins
Iterate barriers, basins, and passes together until geography and progression both work.
- For: correct in spirit; prevents either layer from becoming a disguised master mask.
- Against: as a method it under-specifies the representation and the iteration cost. Co-designing two polygon sets at native resolution is exactly the expensive loop that produced eight failures in six days.

### C. Low-detail topology and terrain-zoning prototype
Approve whole-map terrain logic at low detail before any native-resolution exactness.
- For: cheap iteration; puts the owner taste gate before the expensive work; industry-standard greybox/blockout discipline (readability approved at blockout, art skins a locked layout).
- Against: on its own it says nothing about how the low-detail artifact is authored or how exact geometry is later derived; a low-res polygon diagram would still be a diagram.

### Verdict
The families are not actually alternatives; each names one missing ingredient. The workflow that combines them is the industry-standard one used by tile-based RPGs (RPG Maker/Tiled/LDtk terrain systems, Stardew-class games) and by level-design blockout practice: **author a single terrain-class map where each terrain class intrinsically carries walkability, approve it at low resolution first, and derive collision mechanically last.** Painting terrain IS painting collision, so geometry and art can never disagree, and organic shapes are natural to paint but awkward to vertex-author.

## 4. Recommended method: terrain-class map, macro-first (Gate ladder below)

One authoritative artifact per act: a **terrain-class raster** (an indexed-color image, one class per pixel). No region polygons. No blocker polygons. No gateway rectangles. Classes (final palette fixed at Gate 0 sign-off):

| class | walkable | forms |
|---|---|---|
| deep water | no | sea, lake, river core |
| shore/shallow | no (visual transition) | beach line, riverbank |
| open ground | yes | meadow, heath, clearings, floodplain |
| dense forest | no | old-growth masses |
| light forest/scrub | yes | forest fringe, explorable woodland (owner caveat: the player walks on visible forest-floor ground between sparse trees; individual trunks/canopy clusters are blockers, and art must never read as walking on top of trees) |
| cliff/rock | no | cliff bands on elevation logic, coastal rock |
| mountain | no | Crystal shoulder, eastern range |
| settlement structure | no | walls, buildings (aprons stay open ground) |
| landmark solid | no | dungeon mouths, ruins (each with one readable opening) |
| bridge/causeway | yes | river and channel crossings |

Rules that make the classes produce a believable world:

1. **Every blocker pixel belongs to a named continuous system.** A barrier-continuity ledger lists each system (e.g. "Darkfang Range: enters at NE coast, runs SW, saddles at Darkfang Gap and East Ridge Pass") with its physical cause. No orphan blocker patches; a justified local solid (a ruin, a crag) must be entered in the ledger with its reason.
2. **Gateways are geographic features, not cuts**: a saddle between two ridge masses, a bridge over a river, a gap between forest lobes, a beach shelf below a cliff, a city gate in a wall, a cave mouth. Each is named in the ledger with its formation type.
3. **Roads/trails are a separate guidance layer** contributing zero mask pixels (unchanged doctrine).
4. **The dynamic Crystal seal is a separate overlay**, never baked into the static class map.
5. Approved local decisions survive as semantic requirements, re-expressed in class terms: Coral Reef curved approach over a dry rock shelf into one cave mouth; Port Sapphire's three separated entrances with the raised bridge over an unbroken water channel; a single actor-safe Sunken approach corridor. Their exact old coordinates are history, not authority.

### Why this fixes each recorded failure
- Art-first classification (July 17, 19 failures): dead, because classes are authored, never inferred from pixels.
- Polygon-first schematic look (Relay 26/27 failures): dead, because nobody draws boundary geometry; boundaries emerge from painting terrain masses, and organic edges cost nothing extra with a brush at macro scale.
- Geometry/art divergence: dead, because the class map is the single source both collision and artwork derive from.
- Late owner rejection: moved to the front; the taste gate now happens on a cheap 148x182 macro paint, not a native deterministic atlas.

## 5. The gate ladder (smallest clean sequence)

**Gate 0 — method approval (this brief).** Owner approves the terrain-class method, the class palette, and the ladder. Relay 27 geometry is not carried forward.

**Gate 1 — macro geography (148x182, 16 native px/cell).**
Produce only: (a) the macro terrain-class paint; (b) the barrier-continuity ledger; (c) a barrier-only view (no routes, no labels) and a terrain-logic view; (d) landmark anchor pins including the fixed Act 2 connector cell.
Cheap automated smell checks that can FAIL before owner review: no interior axis-aligned boundary run longer than ~3 cells (coast exempt, it is locked); per-system width profile must vary (uniform-width bands fail); blocker components must have low bounding-box fill ratios (rectangularity fails); basins must be non-convex. These are linters, not approval; the owner's naturalness judgment is the gate.
Owner reviews at macro scale and at a locked-phone-scale mock. Iterate here until it reads as geography. This is where all taste iteration is supposed to happen, at minutes-per-revision cost.

**Gate 2 — progression and roaming validation (same macro artifact).**
Derive regions by flood-filling walkable classes; overlay the story graph, guards, coastal contacts, forbidden shortcuts, terrain-distribution percentages, and gateway throat widths (≥2 cells at macro, ≥32 native px intended). The number of basins is an output of the geography (expected 4-6), validated against the 7-edge graph, not an input. Any failure is fixed by editing geography in Gate-1 terms; drawing a compensating blocker band is prohibited. Owner approves the derived region/gateway topology.

**Gate 3 — native class map and exact geometry.**
Upscale the approved macro map 16x with seeded noise-displaced boundary refinement (deterministic simplex displacement along class edges, curvature-preserving), then targeted hand/agent touch-up. The checked-in native class raster becomes the authority. Derive mechanically: walkable mask = union of walkable classes; collision contours via marching squares; erosion by actor radius 4; polygon simplification tuned to preserve curvature. Run the full existing check suite: clearance, connectivity, coast contact, shortcut rejection, Crystal closed/open states, two-build determinism. Re-run the Gate-1 smell linters at native scale. Owner reviews route-hidden native and locked-phone views.

**Gate 4 — artwork conformance.**
Art is generated/painted per class region with the native class map as layout authority, styled per `design/ART-DIRECTION.md`. Conformance check is mechanical: segmenting the art back to classes must agree with the class map within a fixed boundary tolerance (art may add intra-class detail, never move a class boundary). Roads painted as guidance only. Owner reviews native + phone; failures fix art, never geometry.

No gate begins until the previous gate has explicit owner approval. A mechanical PASS is never presented as design approval; every review pack separates "checks passed" from "awaiting owner judgment."

## 6. Discard / preserve / validation-only

- **Discard as design authority:** Relay 27 region polygons, gateway rectangles, blocker layout, mask/ledger hashes, schematic styling; Relay 26 atlas; all route-ribbon and art-derived masks.
- **Preserve as history (read-only):** every review directory under `design/review/overworld-art-blueprint/.../act1/`, all handoffs.
- **Reuse as validation data only:** story graph + guards, eight landmark identities/anchors, coastal relationships, terrain-distribution contract, Crystal seal semantics, Act 2 connector, actor radius/substep, and the three approved local design concepts (Coral Reef, Port, Sunken) as semantic requirements.
- **Update after Gate 0:** `design/OVERWORLD-MOVEMENT-BOUNDARIES.md` authoring-order section is rewritten to the terrain-class ladder (its region-and-gateway product goals and runtime locks stand).

## 7. Cross-act repeatability — CONTINENT-FIRST (owner constraint, 2026-07-20)

The 5 acts are not separate maps: they share ONE continuous `320x400` overworld grid (`edu-rpg/src/data/maps.ts` "OVERWORLD — 320×400"), with act components positioned within it — Act 1 lower-left `[16,218,163,399]`, Act 2 ~`(200,321)` (east of Act 1), Act 3-4 ~`(260,197)` (northeast), Act 5 ~`(100,151)` (north-center) (`shippedOverworldBaselineDqReplay.mjs`). The owner requires the whole thing read as ONE connected continent with **organic connection** (continuous coastline, mountain, river, and forest systems across act boundaries — no seams) and **organic act-separators** (natural gating geography between acts, e.g. the Crystal Range + seal gate between Act 1 and Act 2).

Therefore the method is **continent-first at the macro level, per-act at the detail level**:

- **Gate 1 becomes a CONTINENT macro pass:** design the whole `320x400` continent's macro terrain-class map as one artifact — one continuous coastline, the mountain/ridge and river systems that separate the acts, the forest masses, and the five act-basin regions. Organic connection + separators are guaranteed because every act shares one canvas. Owner approves the continent macro once (one naturalness review of the whole landmass + its internal act boundaries).
- **Gates 2-4 stay per-act:** within the approved continental frame, refine each act's interior topology, exact geometry, and artwork one act at a time (manageable review, per-act locked constraints honored). An act's Act-N↔Act-N+1 edge is NOT that act's private wall; it is a continent separator shared with the neighbor and frozen at the continent-macro gate.
- Act separators must be readable natural formations (a range with a pass, a river with a bridge, a strait, a canyon) placed on the shared internal boundary, gating progression the way the Crystal seal gates Act 1→Act 2.
- Constraints to confirm before the continent macro (see census in flight): whether acts 2-5 coastlines/frames are locked like Act 1's checkpoint-1, or open to reshape; the per-act anchors, story graphs, and act connectors; the act biomes (Act 2 ironkeep/mountains, Act 3-4 desert oasis/ruins, Act 5 embers/volcanic, a frost/haunted act — to confirm).

Act 1 work already in flight is a method-validation probe for one continent region; its Crystal Range east edge is the Act 1↔Act 2 separator and will be reconciled into the continent macro.

## 8. Gate 0 decisions (owner, 2026-07-20)

1. Terrain-class method and gate ladder: **APPROVED**.
2. Light-forest/scrub as a walkable class: **APPROVED with caveat** — walkability means forest-floor ground between sparse trees; trunks/canopy clusters block, and art must never depict the player walking on top of trees. This caveat is a Gate 4 conformance check.
3. Class palette: approved as tabled; marsh/river split deferred to Gate 1 if geography needs it.
4. Macro working scale: 148x182 contract cells as proposed.

Gate 0 is closed. Next action: Gate 1 macro geography paint + barrier-continuity ledger, reviewed against the smell linters before owner review.
