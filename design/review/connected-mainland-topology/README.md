---
date: 2026-07-14
type: design-gate
status: rejected-history
project: edu-rpg
milestone: connected-mainland-topology
supersedes: design/review/act1-overworld-topology/README.md
superseded-by: design/review/preserved-overworld-land-bridges/README.md
---

# REJECTED — connected mainland topology direction

> **Rejected 2026-07-14.** Do not implement the v1/v2 boards, five-lobe
> geography, region-capacity shares, landmark relocation, or perimeter crop
> proposed below. The locked replacement preserves the current 320×400
> overworld and converts only the three existing Act-separating water gaps to
> blocked mountain/tree land necks. See
> `design/review/preserved-overworld-land-bridges/README.md`.

## Rejected owner direction (history)

- Acts are progression regions of one generally land-connected mainland, not
  separate square landmasses or visible square maps.
- Exactly four portal lands remain geographically separate and portal-only.
- Act-connecting dungeons belong inside natural mountain ranges and may be the
  required playable passage through an otherwise blocked range.
- Empty perimeter should be removed when it serves no authored content. Act 1's
  northwest corner is currently empty and should become an inward coast/forest
  notch rather than unused rectangular padding.
- The intended complete game is approximately 20 hours. World size must support
  comfortable landmark spacing, but traversal padding must not manufacture that
  duration.

## Rejected world-structure proposal (history)

Use one global main-overworld coordinate system and one continuous geographic
landmass. Acts are comparable, irregular semantic regions arranged in one exact
progression chain:

`Act 1 → Act 2 → Act 3 → Act 4 → Act 5`

Each Act shares a mainland boundary only with its immediate neighbor or
neighbors. No nonconsecutive Acts touch. Mountains and blocked tree belts are
the only natural Act separators; they provide progression structure without
turning Acts into islands:

1. Act 1 begins on the southwest lowland lobe.
2. Crystal Cave is the candidate controlled passage through the Crystal Range
   to Act 2's southeast heartland, pending verification that its unchanged
   retained entry/exit behavior genuinely supports a two-mouth crossing.
3. Later Act boundaries alternate mountain ranges and dense blocked-tree belts,
   with one declared pass, trail, or verified dungeon crossing per boundary.
4. Act 5 contains four scattered portal anchors inside its normal usable-area
   budget. Those anchors lead to four separate local overworlds; neither the
   anchors nor their route branches make Act 5 larger than the other Acts. The
   shipped runtime confirms the exact portal-land identities:
   Stormreach Isles, Frostfall Peaks, Sunken Temple Isle, and Twilight Realm.
   Whether they remain mandatory pre-final chapters or become post-game content
   is still an owner progression decision; the shipped final battle currently
   requires their `portalRelics` chain.

Geographic connectivity and player-route connectivity are separate gates. The
mainland itself must be one cardinally connected land component, including
blocked mountain/forest terrain. The open route graph may cross a region boundary
only through its intended pass, trail, or act-connecting dungeon state.

The complete retained town and dungeon roster must remain represented exactly
once. This macro reshaping deletes no retained destination and silently reassigns
none to another Act; any reassignment requires a separate owner decision.

## Rejected Act 1 reshaping (history)

Preserve the approved Braided Pilgrim Trail graph:

`Greenhollow → Millbrook → Port Sapphire → Darkfang → Crystal Cave`

Sunken Cellar and Whispering Woods Cave remain distinct optional spurs. Coastal
Reef remains a distinct quest branch, but it cannot currently be called optional:
the shipped `crystalCaveGate` chain requires `drakeCargo`, which visits the Reef.
The owner must decide whether it remains a main/soft-main prerequisite or the
progression contract changes. The graph survives; the old 30×24 rectangle and
coordinates do not.

Current measurements prove the northwest cut is safe:

- current structural fixture: 30×24;
- authored semantic footprint: 114 unique cells;
- northwest `x=0…14, y=0…8`: 135 cells, zero authored semantic cells;
- current mandatory legs: 9, 11, 9, and 13 steps;
- current branch legs: 3, 8, and 9 steps from their branch starts.

These measurements prove the cut is safe for the current semantic topology, not
for legacy save migration. Legacy coordinates have no revision provenance and
cannot be read against the new region layer. Any production cut still requires
an independent retained-area/landmark anchor mapping or must fall back unchanged
to the legacy scene.

For the next Act 1 shape mock, use six connected landscape lobes: Greenhollow /
Sunken southwest, Whispering west, Millbrook central, Port/coast southeast,
Darkfang north-central, and Crystal Range northeast. Cut the empty northwest
shoulder inward. Replace fixture-like L paths with authored cardinal waypoint
curves while retaining deterministic validation.

## Rejected pacing proposal (history)

The 20-hour target is a whole-game content budget, not an overworld walking
quota. The working recommendation is **typical completion in about 20 hours**,
with the critical path near 17 hours and side content supplying the remainder.
This remains an owner decision before content scope is locked.

The existing progression was originally tuned for a much shorter game, so towns,
quests, lessons, encounters, and especially dungeons must carry most of the new
runtime. The non-overlapping working phase allocation is:

| Phase | Working time |
|---|---:|
| Act 1 | 3h |
| Act 2 | 3h 30m |
| Act 3 | 3h |
| Act 4 | 3h |
| Act 5 mainland | 2h 30m |
| Four portal lands | 4h |
| Final castle and ending | 1h |
| **Total** | **20h** |

As a separate cross-cut view of the same 20 hours: travel 2h 25m, town/story
2h 10m, core dungeons 10h 55m, optional content 3h, and overhead 1h 30m.

Production-scale Act 1 spacing target:

- Greenhollow → Millbrook: 28–36 route cells / about 2–3 first-visit minutes;
- Millbrook → Port Sapphire: 36–48 cells / about 3–4 minutes;
- Port Sapphire → Darkfang: 45–60 cells / about 4–6 minutes;
- Darkfang → Crystal Cave: 28–40 cells / about 2–4 minutes;
- Sunken Cellar spur: 12–18 cells / about 1–2 minutes;
- Whispering Woods spur: 18–26 cells / about 2–3 minutes;
- Coastal Reef spur: 20–30 cells / about 2–4 minutes.

Minutes include orientation and ordinary encounters. Avoid more than about two
minutes without a landmark, encounter, sign, vista, branch, resource, or story
beat. Final cell bands must be retuned from median first-visit playtests if step
cadence or encounter pacing changes.

Act 1 should feel like a substantial opening region, but its exact hour share
must be validated from real playthroughs rather than inferred from map area.
None of these precise bands are owner-approved yet.

## Rejected semantic-model proposal (history)

Keep rectangular terrain arrays and chunks as an invisible storage envelope.
They do not define the visible shape. Add a `regionIds` layer to the future full
main-overworld semantic map and a small world-topology graph:

- all Act regions share retained map ID `overworld` and global coordinates;
- each main-world land cell belongs to exactly one Act region;
- the only Act-region edges are `1–2`, `2–3`, `3–4`, and `4–5`, each realized by
  one declared route crossing or explicit gated boundary anchor;
- exactly four portal-land regions live on distinct non-main maps and connect
  only through four scattered Act 5 portal anchors and explicit transitions;
- coastline derives from land adjacent to water/envelope edge;
- saves remain `{mapId, x, y, floor}`; new-world region identity derives from a
  migrated global cell and never replaces the saved map ID. A legacy coordinate
  cannot establish its new region; migration needs independent, revision-scoped
  legacy-area provenance or a retained landmark/transition anchor.

Do not add per-Act coordinate transforms or save Act IDs as map IDs.

The current selective-engine boundary is whole-mainland atomic because routing
and rollback select by retained map ID. Region-by-region rollout would require a
new region-aware selector plus verified cross-engine boundary anchors. Until
that is designed, a failed mainland region returns the entire `overworld` to the
legacy scene.

For capacity review, compare authored usable cells after excluding water and
blocked separator bands. The roster-aware proposed shares are Act 1 20%, Act 2
23%, Act 3 20%, Act 4 20%, and Act 5 17% of mainland usable land. All fall within
±15% of the 20% median, but the shares and tolerance remain pending owner lock.
The physical mainland anchor-slot counts are 8, 10, 7, 6, and 10 respectively;
Act 5 has six area-driving mainland slots plus four compact portal pads. Those
portal approaches and route branches count inside Act 5's 17% budget rather than
extending its footprint.

## Rejected validation gates (history)

- Main-world land is exactly one connected geographic component.
- All main-world routes connect with progression gates open.
- Region adjacency is exactly `1–2`, `2–3`, `3–4`, and `4–5`; nonconsecutive Acts
  share no land boundary or crossing.
- Each Act region is nonempty, irregular, geographically connected, and has no
  rectangular boundary visible as coast or barrier.
- Every declared region boundary uses only mountains or blocked trees outside
  its designed crossing contract.
- The act-connecting dungeon occupies and visually explains its mountain range.
- Every retained town and dungeon appears exactly once in its retained Act;
  deletions and silent Act reassignments are rejected.
- Exactly four authoritative portal lands exist, each on its own map and reachable
  only from one of four distinct Act 5 portal anchors.
- Usable-land shares match the proposed roster-aware `20/23/20/20/17` allocation
  within an owner-locked tolerance; Act 5's four compact portal pads count in its
  17% total and do not act as four additional area-driving slots.
- Route/landmark density passes the measured pacing bands above.
- Visible coastline retains a sufficient water collar inside the rectangular
  storage envelope so camera clamping/chunk edges never expose a hard square map
  boundary. Out-of-bounds water overscan is an alternative only if explicitly
  implemented and verified.
- Minimap, world rendering, region views, and save relocation derive from the
  same global semantic data.
- Fixed seed plus revision reproduces the world, region layer, and connection
  graph exactly.

## Rejected review artifacts (history)

The capacity-first v2 board and the earlier direction board are rejected
decision history:

- `connected-mainland-capacity-v2.png` is the rendered review board;
- `connected-mainland-capacity-v2.svg` is its editable vector source.

It shows the exact Act chain, comparable usable areas, all 41 physical mainland
anchor slots, and four compact portal anchors inside Act 5's ordinary footprint.
The board's portrait planning frame is a composition aid, not a locked final
world aspect ratio.

The existing `connected-mainland-direction.png` and
`connected-mainland-direction.svg` are rejected v1 artifacts. They are retained
only as decision history and must not guide implementation or topology approval.

The opaque v2 region fills do not imply that separator cells lack region
membership. A future `regionIds` layer still assigns each mainland land cell,
including blocked boundary terrain, to exactly one region.

Neither board authorizes coordinates, biome sizes, portal placement, landmark
relocation, Crystal Cave changes, `starterOverworld.ts` changes, or semantic-map
schema changes. Do not resume this proposal; follow
`design/review/preserved-overworld-land-bridges/README.md`.
