---
date: 2026-07-20
type: handoff
project: edu-rpg-map-engine-semantic-data
milestone: act1-redesign-history-and-method-planning
status: active
supersedes: docs/handoffs/2026-07-20-act1-relay27-region-gateway-checkpoint2-owner-review.md
relay_chain_id: edu-rpg-act1-overhaul
relay_sequence: 27
relay_status: owner-review
owner_verdict: no-go-revision-required
subagents_drained: true
background_sessions_drained: true
---

# Act 1 redesign history and unnatural-blocker planning handoff

## Purpose

This handoff gives Claude Code the history and current diagnosis needed to plan a cleaner method for the Act 1 overworld redesign.

Do **not** implement another geometry pass from this handoff. First produce a method/decision brief that explains how the physical world, explorable regions, gateways, collision geometry, and later artwork should be designed together without repeating the failures below.

## Current owner verdict

The Relay 27 checkpoint-2 region-and-gateway pack is **NO-GO / revision required**.

Relay 27 passed its deterministic and gameplay-topology checks, and its audit correctly showed broad regions rather than narrow walkable route ribbons. However, it still fails the product goal because its blockers are positioned unnaturally:

- forest, cliff, and mountain blockers appear as discrete bands placed around the regions;
- long horizontal and rectangular barrier runs read like collision strips rather than geography;
- the eastern mountain area reads as a large striped block instead of a believable mountain system;
- gateways read as rectangular apertures cut into blocker bands;
- barrier transitions do not consistently follow a coherent coast, ridge, watershed, forest mass, settlement edge, or other understandable physical cause;
- the world therefore communicates where the authored mask allows movement, not why the landscape naturally prevents movement.

The important distinction is:

> Relay 27 mechanically passed as a schematic traversal model, but it did not receive owner approval as a believable world design.

Its polygon, mask, and review evidence must remain preserved as failure history. It must not be promoted or used as an approved geometry baseline.

## What Relay 27 fixed—and what it merely inverted

Relay 27 successfully removed the earlier narrow route-ribbon network. Roads no longer supplied mask pixels, and the five open regions offered broad off-road exploration.

But the same underlying design mistake remained in inverted form:

- earlier attempts drew **walkable ribbons** and treated everything outside them as blocked;
- Relay 27 drew **broad walkable regions**, then wrapped or separated them with blocker ribbons/bands.

Changing the positive shape did not solve the physical-world problem. The boundary was still authored primarily to produce traversal topology, then labeled as forest, cliff, or mountain after the fact.

## Immutable constraints for future planning

The next method must preserve these locked facts:

- native Act 1 frame: `2368x2912`;
- immutable checkpoint-1 frame SHA-256: `102e11d5d822985e3310487b46d5091224877416951df3314a65a932b48d72bf`;
- immutable checkpoint-1 land-mask SHA-256: `7e6ba5845d1db7c9044abfc2d30da4b54bb48a200148c29308f8a94f0def7ffb`;
- fixed Act 2 connector: `(2166,1132)`;
- all eight landmark identities;
- the approved story/progression graph and its guards;
- both required coastal relationships;
- forbidden-shortcut intent;
- Crystal dynamic-seal semantics, including valid closed and open states;
- actor-foot radius `4`;
- maximum movement substep `2`.

Checkpoint 2 is explicitly reopened. Internal landmark placement, region shapes, gateway positions, and blocker geometry may be redesigned, provided the immutable constraints above remain true.

The following are **not** approved and must not be treated as locked:

- Relay 27's five exact region polygons;
- Relay 27's five exact gateway rectangles;
- its forest, cliff, structure, and mountain blocker layout;
- its exact internal landmark coordinates other than the fixed Act 2 connector;
- its open-mask hash or barrier-ledger hash;
- its visual styling or schematic color treatment.

## Redesign history

### 1. Semantic graph and exact reconstruction contract — July 14–15

The early work locked the Act 1 story graph, landmark identities, major coastal relationships, Crystal gate behavior, and the intended guided journey. The approved conceptual movement style was the “Braided Pilgrim Trail”: a main progression spine with meaningful optional spurs.

The reconstruction contract also established the exact `2368x2912` plate, a large Greenhollow open country, Millbrook floodplain, a broad Crystal mountain shoulder with one gate, and substantial forest and mountain coverage.

This phase gave the project strong semantic and narrative constraints, but it did not yet prove a natural physical-boundary system.

### 2. Painted-corridor / route-ribbon movement — July 15

The first movement-boundary implementation treated painted path corridors and approach clearings as the walkable space. It supported free movement inside each corridor, but the corridor itself owned collision.

This created the first recurring problem: roads and trails were doing two jobs at once.

- They guided the player visually.
- They also defined the legal movement boundary.

That made exploration feel like sliding along invisible rails, especially between landmarks. The model could validate route continuity but could not deliver broad natural roaming.

### 3. Art-derived ground masks and landmark-boundary disputes — July 17

The next approach classified walkable ground from the painted overworld art. A deterministic full-map mask was produced, but owner review found ambiguous or incorrect judgments around Port Sapphire, Coral Reef, Greenhollow, Sunken Ruins, the dungeon, and the road beyond Millbrook.

The Coral Reef review exposed an important issue: sometimes the art itself did not contain a sufficiently legible entrance throat or terrain transition for a mask author to classify correctly. The approved Coral Reef fix added a curved approach, dry shelf, and one natural cave opening.

Lesson: a mask cannot reliably recover movement semantics from artwork when the artwork has not first made every boundary and entrance physically unambiguous.

### 4. Pilot-mask reconciliation against runtime contracts — July 18

Two approved terrain-mask pilots then passed their local checks but conflicted with 53 retained runtime points, including route waypoints, landmark anchors, and probes.

A reconciliation pass preserved all 53 points, all seven routes, 77 waypoints, and all eight anchors. Even then, independent review found direct role contradictions between the proposed mask changes and the visible art.

Lesson: mechanical compatibility with retained data does not prove that the visible landscape communicates the same movement logic.

### 5. Port and Sunken targeted fixes — July 18

Targeted art and boundary work improved the Port bridge/channel relationship and established a single actor-safe Sunken approach. These were useful local decisions, but they did not solve the full-map method.

Lesson: isolated landmark fixes can be correct while the global terrain system remains incoherent.

### 6. Route-hidden full-map ground-mask failure — July 19

The project attempted a route-hidden, art-first classification of the entire map. It was rejected because the result was a messy inference from painted art.

The workflow was then reversed:

1. author clean geometry;
2. derive the mask;
3. rewrite the art to match the geometry;
4. verify geometry and art together.

This was a reasonable correction to ambiguous art-first masking, but it still left open the question of how clean geometry should be authored so that it describes a believable world rather than an abstract traversal diagram.

### 7. Polygon-first checkpoint-3 artwork loop — July 19–20

Several artwork passes attempted to make the approved polygon look natural:

- early versions exposed tan or olive fills, halos, pasted landmarks, faint paths, circular forest washes, and ambiguous blockers;
- later versions improved style but missed exact placement or topology;
- targeted conformance edits corrected individual locations but did not establish a reliable whole-map method;
- the deterministic-atlas pass made polygon conformance exact, yet produced repeated strips, rectangular joins, oval clearings, narrow stems, and locator-symbol landmarks.

Relay 26 therefore failed despite exact geometry conformance. The art looked like a beautified collision mask rather than a naturally formed landscape.

Lesson: exact art conformance cannot rescue geometry whose shapes already encode the wrong visual logic.

### 8. Region-and-gateway reset — July 20, Relay 27

Checkpoint 2 was reopened to replace route ribbons with large explorable regions connected by a small number of deliberate gateways. Roads and trails became guidance only and contributed zero walkable-mask pixels.

This solved the narrow-network problem mechanically. The pack demonstrated:

- one connected open-state union;
- valid Crystal closed/open states;
- story-valid reachability;
- all eight approaches;
- broad off-road exploration;
- sea contacts and shortcut rejection;
- deterministic two-build equality.

The owner nevertheless rejected the result because the barrier system was unnatural. The blocker bands and gateway cuts were still authored as traversal-control devices first and believable terrain second.

Lesson: “large regions plus few gateways” is a useful gameplay rule, but it is incomplete unless the regions and gateways emerge from a coherent physical-geography model.

## Recurring root cause

The project has repeatedly chosen the traversal geometry first and then asked artwork or terrain labels to justify it.

The authority has changed several times:

`route corridor → painted-art mask → clean polygon → deterministic atlas → broad regions with blocker bands`

But the unresolved question stayed the same:

> What believable physical world would naturally create these movement boundaries and openings?

The failures are therefore not primarily a lack of determinism, reachability tests, clearance checks, or exact masks. Those checks are necessary, but they verify the geometry after the most important design decision has already been made.

Other recurring contributors:

- geometry and art have been handled as sequential phases instead of co-designed representations of the same world;
- blockers have often been treated as the negative leftover around walkable space;
- full-resolution exactness has arrived before a low-cost owner taste gate on macro geography;
- local boundary repairs have accumulated without a single whole-map account of mountain chains, forests, cliffs, water, settlements, and passes;
- a mechanical `PASS` has sometimes been easy to read as broader acceptance even when world logic still required owner judgment.

## Planning objective for Claude Code

Produce a planning/decision brief for a new checkpoint-2 method. Do not create polygons, masks, art, or implementation evidence yet.

The brief should compare at least these method families:

1. **Barrier-first world structure**

   Design continuous physical systems—coastline, mountain chains, cliffs, dense forest masses, rivers or channels, settlement walls, and landmark solids—then derive explorable ground as the complement of those approved barriers.

2. **Co-designed barrier skeleton and roaming basins**

   Design the major physical barriers, broad free-roam basins, and natural passes together, iterating until both the geography and progression graph work. Neither the region polygons nor the blocker polygons are allowed to become a disguised master mask.

3. **Low-detail topology and terrain-zoning prototype**

   First work at intentionally low detail with a whole-map terrain-logic diagram. Approve the geography, transitions, and passes before producing native-resolution exact geometry.

The likely direction is a barrier-first/co-designed hybrid, but Claude Code should pressure-test the options and recommend the simplest method that can reliably reach the goal.

## Questions the planning brief must answer

For every major boundary:

- What visible physical feature causes it?
- Why does that feature exist at that location in the world?
- Is it part of a continuous larger system, or a justified local solid?
- Can a player predict that it is impassable without seeing an overlay or testing an invisible wall?
- Does it remain believable at native and locked-phone scale?

For every gateway:

- What natural or constructed formation creates the opening—a valley pass, bridge, forest gap, city gate, cave mouth, beach shelf, ridge saddle, or equivalent?
- Why is this the readable crossing point?
- Is its width compatible with actor radius `4` and substep `2` without looking like a rectangular mask cut?
- Does it guide progression without making the rest of the region feel railed?

For the full map:

- How many broad roaming basins are actually needed?
- How do mountains, forests, cliffs, coast, water, and settlements connect into coherent systems rather than isolated blocker patches?
- Where can the player roam off-road within each basin?
- How are forbidden shortcuts stopped by visible geography rather than invisible collision?
- At what review gate does the owner approve world logic before exact geometry work begins?
- How will exact collision geometry later be derived from the approved physical barriers?

## Clean phase sequence to evaluate

Claude Code should refine or replace this sequence, but it is the current recommended starting point:

### Gate 0 — method approval

- Inventory the immutable story, landmark, coast, connector, gate-state, and movement constraints.
- Compare method options and select one.
- Do not carry Relay 27 geometry forward by default.

### Gate 1 — macro physical-geography approval

- Create only a low-detail, whole-map physical-geography skeleton.
- Establish continuous coast, mountain/ridge systems, cliffs, dense forest masses, water systems, settlement structures, and natural openings.
- Review a route-hidden barrier-only view and a terrain-logic view.
- Require explicit owner approval of naturalness and readability before exact polygons.

### Gate 2 — progression and roaming validation

- Overlay the eight landmarks, story graph, guards, coastal requirements, Crystal seal, and Act 2 connector as validation data.
- Check that the approved geography supports broad roaming basins and deliberate natural gateways.
- Revise the physical geography when the graph fails; do not solve failures by drawing arbitrary collision bands.
- Require explicit owner approval of the derived region/gateway topology.

### Gate 3 — exact geometry and mask proof

- Derive collision solids from the approved barrier systems.
- Derive walkable space as land minus those visible solids, with explicit handling for dynamic gates.
- Produce native deterministic polygons/masks and run clearance, reachability, coast-contact, shortcut, and two-build checks.
- Review route-hidden and locked-phone evidence again.

### Gate 4 — artwork conformance

- Only after checkpoint-2 approval, create artwork that expresses the already-approved physical systems.
- Verify both topology and natural appearance.
- Never ask decorative texture to hide an arbitrary collision shape.

No downstream gate begins until the owner explicitly approves the previous gate.

## Evidence needed before another owner checkpoint-2 review

A future checkpoint-2 pack should make it possible to judge world logic separately from routes and labels. At minimum, plan for:

- a barrier-only physical-geography view with no route overlay;
- a derived broad-region view that shows the consequence of the barriers, not the source design;
- a gateway close-up sheet naming the physical formation at each opening;
- native and locked-phone views;
- a short barrier-continuity ledger describing each continuous natural system;
- a story/progression overlay used as validation evidence, not as the geometry source;
- deterministic mask and reachability evidence only after the visual-geography gate passes;
- a fresh independent read-only review that separately reports mechanical validity and natural-world validity.

## Failure-prevention rules

- Do not draw blocker bands around desired walkable polygons.
- Do not draw walkable ribbons along desired routes.
- Do not use roads or trails as collision boundaries.
- Do not use repeated rectangular strips, uniform-width barrier bars, or gateway rectangles as final physical geometry.
- Do not treat terrain labels as sufficient justification for arbitrary shapes.
- Do not accept a mechanical `PASS` as an owner visual/design approval.
- Do not begin full native-resolution exactness before the macro physical-geography gate.
- Do not patch Relay 27 locally until the replacement method is approved; the problem is systemic, not a handful of misplaced vertices.

## Explicit non-goals for the planning task

- no new checkpoint-2 polygons or masks;
- no checkpoint-3 artwork or atlas work;
- no image generation;
- no runtime or collision integration;
- no route implementation;
- no saves or promotion work;
- no npm, Vite, app, or deployment build;
- no TestFlight;
- no commit, push, deploy, release, branch, or worktree action;
- no overwriting checkpoint-1 or any rejected historical evidence.

## Primary evidence to inspect

Read these in order:

1. `docs/handoffs/2026-07-14-act1-overworld-semantic-graph-locked.md` — original story and movement intent.
2. `docs/handoffs/2026-07-15-act1-reconstruction-contract-locked.md` — exact plate and terrain-distribution contract.
3. `docs/handoffs/2026-07-15-act1-path-constraints-g1-owner-review.md` — corridor/ribbon model and its assumptions.
4. `docs/handoffs/2026-07-17-act1-sol-ground-mask-owner-review.md` — art-derived mask ambiguity.
5. `docs/handoffs/2026-07-17-act1-coral-reef-visual-entrance-relay.md` — example of a naturally legible entrance decision.
6. `docs/handoffs/2026-07-18-act1-approved-terrain-pilots-integration-readiness-owner-review.md` — retained-point conflicts.
7. `docs/handoffs/2026-07-18-act1-pilot-mask-reconciliation-owner-review.md` — mechanical reconciliation versus art-role contradictions.
8. `docs/handoffs/2026-07-18-act1-port-channel-sunken-c-owner-review.md` — targeted local boundary decisions.
9. `docs/handoffs/2026-07-19-act1-full-map-route-hidden-ground-mask-relay.md` — rejected art-first full-map classification.
10. `docs/handoffs/2026-07-19-act1-clean-polygon-checkpoint3-artwork.md` — polygon-first reversal.
11. `docs/handoffs/2026-07-20-act1-checkpoint3-artwork-r2.md`
12. `docs/handoffs/2026-07-20-act1-checkpoint3-artwork-r3-topology-control.md`
13. `docs/handoffs/2026-07-20-act1-checkpoint3-artwork-r4-targeted-conformance.md`
14. `docs/handoffs/2026-07-20-act1-checkpoint3-artwork-r5-deterministic-atlas.md`
15. `docs/handoffs/2026-07-20-act1-relay26-deterministic-atlas-owner-review.md` — exact-conformance visual failure.
16. `docs/handoffs/2026-07-20-act1-relay27-region-gateway-checkpoint2-owner-review.md` — mechanically successful but now owner-rejected region/gateway pack.
17. `design/ART-DIRECTION.md`
18. `design/OVERWORLD-MOVEMENT-BOUNDARIES.md`

Inspect the Relay 27 evidence as a rejected schematic, especially:

- `design/review/overworld-art-blueprint/act-by-act/act1/runtime-v2/act1-region-gateway-r27/checkpoint-2-region-gateway/owner-regions-no-routes-native.png`
- `design/review/overworld-art-blueprint/act-by-act/act1/runtime-v2/act1-region-gateway-r27/checkpoint-2-region-gateway/owner-overview-native.png`
- `design/review/overworld-art-blueprint/act-by-act/act1/runtime-v2/act1-region-gateway-r27/checkpoint-2-region-gateway/owner-gateways-locked-phone.png`

## Exact next action for Claude Code

Create a **planning-only decision brief** that:

1. confirms the immutable constraints and the Relay 27 owner rejection;
2. explains the root cause in physical-world terms;
3. compares two or three viable authoring methods;
4. recommends one method with the smallest clean review ladder;
5. defines the representations and evidence required at each gate;
6. names what should be discarded, preserved as history, or reused only as validation data;
7. stops for owner approval before creating any new geometry.

The desired result is not another attractive overlay. It is a repeatable cross-act method in which believable physical geography creates readable regions and gateways, and deterministic traversal geometry is derived from that approved world structure.

## Suggested Claude Code kickoff

> Resume from `docs/handoffs/2026-07-20-act1-redesign-history-unnatural-blockers-planning-handoff.md`. Treat the Relay 27 checkpoint-2 pack as owner-rejected failure evidence: it eliminated route-ribbon walkability but replaced it with unnatural blocker bands and rectangular gateway cuts. Read every primary evidence file listed in the handoff. Produce a planning-only decision brief comparing barrier-first, co-designed barrier-and-basin, and low-detail topology methods. Recommend the simplest repeatable cross-act workflow that makes physical geography the source or co-source of traversal boundaries, separates mechanical PASS from owner design approval, and adds a low-cost macro-geography gate before native exact geometry. Preserve all immutable checkpoint-1, story, coastal, Crystal, movement, and Act 2 connector constraints. Do not create polygons, masks, artwork, runtime changes, builds, commits, branches, or successor tasks. Stop for owner approval of the method.
