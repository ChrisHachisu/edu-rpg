---
date: 2026-07-19
status: ready
scope: design-only-environment-support-g4
---

# Act 1 polygon-conformance G4 — environment support

## Immutable gameplay authority

- `runtime-v2/polygon-first-authority-r25b/polygon-authority.json` and its exact binary mask.
- Native `2368x2912`; Port terminals west `(1840,1665)`, north `(1835,1635)`, southeast `(2114,1840)` remain disconnected.
- Sunken remains straight 11-wide `(411,2548) -> (370,2495)`.

## Inputs

- G3 `candidate-art.png`: material vocabulary and exact-mask ground.
- G2 roadless `roadless-base.png`: blocked terrain and isolated landmarks.
- G2 exact procedural composite: role-aware bridge/coastal/mountain material fallback.
- Locked right-panel natural-trail anchor.

## Prior verdict

G3 static/mechanical GO, fresh visual NO-GO. Blockers: hard clipped ribbons/octagonal hubs, no vegetation-feathered edges, Sunken wedge over water, Port west/SE weak or shoreline-crossing, Coastal spur over shallows, uneven landmark entrances.

## Exact next pass

Keep walkable ground exact, but permit deterministic art changes in a small inventoried **blocked-terrain support halo** around it. Use inward canopy/rock overlap to soften straight edges and hub corners. Restore landmark art only on the blocked side of thresholds. Add rocky land support at Sunken, a believable bridge/causeway treatment for Coastal, and distinct blocked approaches around Port without filling any terminal gap. Any outside-polygon change must lie inside the declared support halo and must read as blocked foliage, rock, cliff, structure, or water-edge—not additional walkable dirt.

Output only to `runtime-v2/polygon-conformance-environment-support-g4/`. Produce candidate, masks, overview/overlay, Port/Sunken/Coastal/Greenhollow details, deterministic tests, inventory, and honest visual verdict. No accepted-art/runtime/manifest/public/dist/collision/routes/saves/build/git/release changes.
