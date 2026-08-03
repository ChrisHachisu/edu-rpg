# Act 1 V4 feedback owner checkpoint

Date: 2026-07-15  
Status: **owner review of scale evidence and meadow balance; V4 is not a construction blueprint**

## User feedback addressed

1. The concept looked smaller than the current world and needed a player-scale
   check.
2. Act 1 needed more grass plains and exploration space relative to forest.
3. Trails that lead nowhere needed to be removed.

## Verified result

### Player scale

The current shipped world uses 48-pixel tiles and a 48x48 hero at scale 1, so
the current hero occupies approximately one world tile. The future field art
contract locks a native 64x64 frame, but the future renderer/camera gate has not
yet chosen whether that frame occupies one tile or 1.33 current-size tiles.

Projected onto V4's whole-Act view, the honest player-frame band is only
**8-10 pixels**. The map is therefore large enough in overall extent. Its
smaller feeling comes from compressed internal landmark spacing and visual
massing, not from the player's literal size.

Evidence:
`design/review/overworld-art-blueprint/act-by-act/act1/review/act1-v4-player-scale-overlay.png`

### Grass and exploration

V4 is a clear improvement over V2. It opens the Greenhollow basin, Millbrook
floodplain, Port approach, and southern coastal country while retaining blocked
old-growth as the dominant terrain. Independent review passes this correction
for artistic direction. Exact terrain percentages remain a later semantic-map
measurement.

### Trails

V4 removes the purposeless west dead end, the unauthorized northwest
settlement, and the Whispering-to-Darkfang continuation. Every visible trail
now reaches a landmark; no road-to-nowhere endpoint or unintended closed loop
was found.

One graph defect remains: the Coastal Reef spur still appears to depart from a
junction immediately south of Port before the main route visibly enters Port's
forecourt. This reads as a Port bypass rather than the required
Millbrook-to-Port then Port-to-Reef relationship.

## Review files

- V4 clean art:
  `design/review/overworld-art-blueprint/act-by-act/act1/generated/act1-artistic-plate-v4.png`
- Exact source / V2 / V4 comparison:
  `design/review/overworld-art-blueprint/act-by-act/act1/review/act1-v4-owner-comparison.png`
- Player-scale overlay:
  `design/review/overworld-art-blueprint/act-by-act/act1/review/act1-v4-player-scale-overlay.png`
- Independent verification:
  `design/review/overworld-art-blueprint/act-by-act/act1/review/act1-v4-verification.md`
- Terrain and route audit:
  `design/review/overworld-art-blueprint/act-by-act/act1/review/act1-v2-terrain-route-audit.md`

## Disposition

- Apparent player scale: **measured; whole-Act extent is large enough**.
- More grass/open exploration: **PASS for owner artistic review**.
- No road-to-nowhere endpoints: **PASS**.
- Exact source-relative travel spacing: **FAIL**.
- Exact seven-edge landmark graph: **FAIL at Port-to-Reef rooting**.
- Crystal mountain continuity/no bypass: **PASS**.
- Construction blueprint: **FAIL**.

## Recommended next stage

Do not ask image generation to solve coordinates or road topology again. Use a
two-layer deterministic Act 1 reconstruction:

1. Build at the exact `2368 x 2912`, 16-review-pixels-per-tile source extent.
2. Preserve exact source landmark coordinates, travel distances, lake, and the
   seven-edge semantic graph.
3. Apply V4's approved meadow balance, smaller landmark visual scale, material
   language, organic coast, forest massing, and Crystal geology onto that exact
   framework.
4. Route Millbrook fully into Port before the Port-to-Reef spur departs.
5. Re-run the 8-10-pixel player overlay and a mechanical route trace before
   locking the Crystal boundary or starting Act 2.

The only owner-taste question at this checkpoint is whether V4 has the right
amount and character of open grass country. Approval of that visual balance
does not approve V4's coordinates or Port/Reef topology.

