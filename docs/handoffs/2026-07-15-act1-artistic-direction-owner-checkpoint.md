# Act 1 artistic direction owner checkpoint

Date: 2026-07-15  
Status: **owner review required before Act 1 construction or Act 2 generation**

## Outcome

The five-Act biome ladder and natural connector rules are locked in
`design/review/overworld-art-blueprint/act-by-act/ACT-THEME-CONTRACT.md`.
Act 1 now has an exact preserved-runtime source pack and two artistic generation
attempts. V2 is the stronger visual direction and is ready for owner taste
review.

V2 is **not** being represented as a verified coordinate/topology blueprint.
Independent review found that the image generator retained the major lake,
eight recognizable content beats, old-growth/coastal identity, and the broad
Crystal mountain connection, but still shifted several landmark structures and
compressed some travel spacing.

## Owner review files

- Side-by-side source/V2 review:
  `design/review/overworld-art-blueprint/act-by-act/act1/review/act1-v2-owner-comparison.png`
- Clean V2 candidate:
  `design/review/overworld-art-blueprint/act-by-act/act1/generated/act1-artistic-plate-v2.png`
- Exact runtime topology/scale source:
  `design/review/overworld-art-blueprint/act-by-act/act1/act1-source-clean.png`
- Exact Crystal-mouth source:
  `design/review/overworld-art-blueprint/act-by-act/act1/act1-source-connectors.png`
- Deterministic source manifest:
  `design/review/overworld-art-blueprint/act-by-act/act1/manifest.json`

## Locked Act direction

- Act 1: verdant coastal old-growth frontier.
- Act 2: fully snowy frozen highlands.
- Act 3: desert, Oasis Haven, wind canyon, and bandit territory.
- Act 4: volcanic ashlands, obsidian, and calderas.
- Act 5: dark barren endgame with the mountain maze, Demon Castle, and all four
  portals.
- Crystal is a broad crystal-bearing mountain range shared by Acts 1 and 2,
  with separated paired dungeon mouths and no open-land bypass.

## What V2 successfully establishes

- A dense, realistic old-growth Act rather than a flat green island.
- An organic west/south coast with distinct coastal ruin and reef territories.
- The major north-south inland lake as a dominant route-shaping landform.
- Visually distinct Greenhollow, Millbrook, Port Sapphire, Sunken Cellar,
  Whispering Woods Cave, Coastal Reef, Darkfang Grotto, and Crystal Cave beats.
- A dark inland Darkfang territory separate from the snowy/crystalline gate.
- A wide eastern/northeastern mountain shoulder that continues off-canvas into
  the continent rather than a bridge, causeway, or pasted land strip.
- No labels, UI, portals, map pins, or decorative frame in the clean art.

## Verified limitations

- V2 is `1130 x 1392`; the exact runtime plate is `2368 x 2912` at 16 pixels per
  runtime tile.
- Greenhollow is close to its source-relative position, but Millbrook and Port
  remain too far south. Sunken Cellar, Coastal Reef, Darkfang, and Whispering
  also retain smaller position drift.
- The road hierarchy is much clearer than V1 but is not exact enough to replace
  the semantic route graph or coordinate data.
- The generated art therefore controls visual materials, terrain character,
  settlement language, forest massing, coast quality, and Crystal geology. It
  does not control final coordinates or collision.

## Recommended production interpretation

Use a two-layer blueprint rather than asking image generation to be a coordinate
system:

1. Preserve the exact runtime plate and semantic graph as the scale, coordinates,
   route topology, landmark relationships, and collision authority.
2. Use approved V2 as the visual authority for terrain materials, organic
   landform treatment, landmark architecture, forest density, and the Crystal
   transition.
3. Reconstruct Act 1 deterministically at `2368 x 2912`, moving V2's visual
   language onto the exact source positions instead of moving source positions
   to match V2.
4. Lock the reconstructed Crystal overlap before generating or rebuilding Act 2.

This resolves the repeated failure mode: generative art supplies coherent art
direction, while deterministic map data supplies the accuracy required to build
the game.

## Owner decision

Approve or reject **V2's visual treatment only**: old-growth density, coast and
lake treatment, settlement/cave architecture, darkness level, and the broad
eastern Crystal-to-snow mountain transition.

Approval does not approve its shifted coordinates. If approved, the next stage
is exact-scale deterministic Act 1 reconstruction using the runtime plate plus
V2 visual direction. Act 2 remains stopped until the Act 1/Crystal boundary is
locked.

## Verification

- Source clean and marked copies are byte-exact against the captured runtime
  plates.
- Reference-pack generation is deterministic.
- V1 was independently rejected as a construction blueprint.
- V2 was independently reviewed as materially improved and safe for owner
  artistic-direction review, but not safe as coordinate/topology authority.
- No runtime map, dungeon, preserved bundle, or gameplay file was changed by
  this artistic stage.

