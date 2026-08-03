---
date: 2026-07-19
type: handoff
project: edu-rpg
milestone: act1-full-map-route-hidden-ground-mask
status: owner-rejected-superseded
relay_chain_id: edu-rpg-act1-overhaul
relay_sequence: "25"
relay_task_title: Edu-RPG Relay 25 — Full-Map Route-Hidden Ground Mask
relay_status: complete
relay_predecessor_sequence: "24"
relay_predecessor_handoff: docs/handoffs/2026-07-18-act1-port-lock-sunken-clockwise-entrance-owner-review.md
relay_thread_id: 019f75c3-5d4d-78d0-9d48-a68f226a3092
owner_notification: slack-dm:D0AU1C7R8AF
subagents_drained: true
background_sessions_drained: true
owner_verdict: no-go
owner_verdict_date: 2026-07-19
superseded_by: polygon-first-authority
---

# Full-map route-hidden ground-mask relay

## Owner verdict — NO-GO / SUPERSEDED 2026-07-19

The owner rejected the art-derived mask workflow. The black/gray/white output is
a raster mask, not the intended polygon authority, and it is unnecessarily
messy because it attempts to infer gameplay geometry from already-painted art.

The corrected order is now locked in `design/OVERWORLD-MOVEMENT-BOUNDARIES.md`:

1. design and validate a clean gameplay polygon;
2. derive the raster mask mechanically from that polygon;
3. rewrite or regenerate the map artwork so the visible world matches the
   polygon;
4. verify geometry, art, collision, and semantic routes together.

All Relay 25 outputs remain unpromoted failure evidence. Do not clean, promote,
or use them as the baseline for polygon generation.

## Single outcome

Create a deterministic, native-resolution `2368x2912`, route-hidden, three-class ground-mask
owner-review pack under:

`design/review/overworld-art-blueprint/act-by-act/act1/runtime-v2/terrain-legibility-full-map-route-hidden-r25/`

The classes are exact raster values `0`, `127`, and `255`. This relay ends at visual owner review.
It does not derive clearance, polygons, collision, or a promotion candidate.

## Execution order

1. Verify this handoff, branch/HEAD/dirty tree, locked hashes, and the absence of inherited live
   agents or owned background sessions.
2. Within the existing Sol task, first delegate only the deterministic scaffold: input inventory,
   exact native tiles, stitching/rebuild helpers, structural tests, overlays, and pilot-embedding
   audit. The delegate must not classify terrain.
3. Then use Sol as the blind image reader and decision maker. Classify the route-hidden reference
   from visible terrain only; do not expose routes, waypoints, labels, polygons, or existing
   collision while classification decisions are being made.
4. Stitch the classifications deterministically into the exact three-class full-map mask, generate
   review overlays/overview and an explicit ambiguity ledger, and run fresh independent static and
   visual reviews.
5. Stop at owner review. If owner input is required, notify Chris Hachisu in Slack DM
   `D0AU1C7R8AF` as well as in Codex. Ask one concrete question and include a recommendation.

## Native tile contract

Use twelve overlapping `1024x1024` tiles from the `2368x2912` reference:

| ID | x | y |
|---|---:|---:|
| `r01-c01` | 0 | 0 |
| `r01-c02` | 768 | 0 |
| `r01-c03` | 1344 | 0 |
| `r02-c01` | 0 | 768 |
| `r02-c02` | 768 | 768 |
| `r02-c03` | 1344 | 768 |
| `r03-c01` | 0 | 1536 |
| `r03-c02` | 768 | 1536 |
| `r03-c03` | 1344 | 1536 |
| `r04-c01` | 0 | 1888 |
| `r04-c02` | 768 | 1888 |
| `r04-c03` | 1344 | 1888 |

Allowed outputs are the inventory, affinity-neutral source copy/reference, twelve raw tiles,
twelve classification tiles, stitched mask, overlays/overview, ambiguity ledger, pilot-embedding
audit, deterministic builder/tests, verification, and owner-review documentation.

## Locked inputs

- Manifest revision 10: `a36eebf18c651ee7749f2bcff7006e0ce5173b34dc2d3010767f0adbde0cef16`.
- Affinity-neutral full-map reference:
  `3cc75042918a8557433c33238456bcad604c34739ec89e768e554ed0008f19bc`.
- Port accepted art: `a1b02803c94a4c52aae73ccac90cc563054e5c842a005bb1ad47977e1be223d2`.
- Port owner lock: `259f2764da23d49411bae2fbb5c6f33f0c2c1ad48b04fe6f91825b17b0731526`.
- Sunken accepted art: `7bb0d0bfb10e3b86224d65082c3f7a972330bc50310eef8d6f0ff938f50c4e02`.
- Relay 24 Sunken mask: `cdde4c33b9d45ab7eb4a774cff0ab274f5d34640f71a08a3bf55ddeb9e018042`.
- Relay 24 semantic roles: `fbdb29bb955d06d6827f446bc0ce75bf20d50c7e0eb01023ec780b1541716a6e`.
- Relay 24 collision: `c03a6c09d9189537322312f6f7a183f514bc7b7fbac64dca00d2ab8d3b5d244f`.
- Relay 24 owner-approved overlay:
  `cd2dc9d1aa4221e54349c761fdf89d52761a988f50d6ecce7a4e7f7f231cc610`.

The approved pilot semantics must embed without changing the locked Port or Sunken art. Port keeps
three disconnected overworld entrances with no path through town. Sunken keeps entrance C
`(370,2495)` to `(411,2548)` as the exact displayed straight 11x11 corridor; do not substitute
`(421,2561)`, bend off-ray, or regenerate art.

## Hard boundaries

Do not alter Relay 20-24 evidence in place. Do not change any manifest, compositor, public/dist
runtime, adapter, route, trigger, save, accepted art, preserved artifact, or full-map runtime file.
Do not derive or promote polygons/collision, build Vite/npm source, replace the legacy bundle,
create a branch/worktree, commit, push, deploy, release, use TestFlight, or mutate App Store
Connect. Preserve the shared dirty checkout.

At the next verified boundary, use `$relay-fresh-sessions`: drain every subagent and owned
background session before creating or delegating exactly one successor task.
