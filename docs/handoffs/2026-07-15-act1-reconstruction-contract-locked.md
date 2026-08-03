---
date: 2026-07-15
type: handoff
status: active-uncommitted
project: edu-rpg
milestone: act1-exact-scale-reconstruction-contract
branch: codex/map-engine-semantic-data
supersedes-for-act1: docs/handoffs/2026-07-14-corridor-baseline-autonomous-kickoff.md
---

# Act 1 exact-scale reconstruction contract locked

## Owner direction

Reconstruct Act 1 from the approved V4 direction while retaining the exact
shipped scale and progression geography. V4 is the visual authority for meadow
balance, organic terrain massing, material language, and landmark scale. It is
not coordinate or topology authority.

The owner's explicit Act 1 reconstruction approval supersedes the earlier
corridor-only terrain-preservation restriction inside the Act 1 source plate.
It does not authorize edits to Act 2, the preserved runtime, dungeon topology,
Crystal Cave internals, or later-act terrain.

## Construction authority

1. The shipped `320 x 400` world coordinate system is absolute.
2. The exact Act 1 source plate is bounds `[16,218]-[163,399]`, or `148 x 182`
   cells, represented at `2368 x 2912` in the 16-review-pixels-per-cell plate.
3. Preserve the exact source water mask inside those bounds, including the
   major lake and organic coastline.
4. Preserve all eight landmark threshold coordinates and their retained
   transition payloads.
5. Encode exactly seven semantic road edges and no others:
   Greenhollow-Sunken, Greenhollow-Whispering, Greenhollow-Millbrook,
   Millbrook-Port, Port-Reef, Port-Darkfang, and Port-Crystal.
6. The Reef branch must depart from the Port forecourt. Whispering must not
   continue to Darkfang. Darkfang must not connect directly to Crystal.

## Exact thresholds and approaches

| Landmark | Walkable threshold | Adjacent approach |
|---|---:|---:|
| Greenhollow | `[60,340]` | `[60,341]` |
| Sunken Cellar | `[45,350]` | `[45,349]` |
| Whispering Woods Cave | `[80,310]` | `[80,311]` |
| Millbrook | `[100,320]` | `[100,321]` |
| Port Sapphire | `[130,290]` | `[130,291]` |
| Coastal Reef | `[140,350]` | `[140,349]` |
| Darkfang Grotto (`mistyGrotto`) | `[120,260]` | `[120,261]` |
| Crystal Cave | `[148,295]` | `[148,294]` |

## Natural landmark-entry contract

Landmark entry is part of the terrain, not a generic portal or standalone
special asset.

- `Landmark.at` is the walkable transition threshold.
- `Landmark.approach` is the adjacent route or clearing cell.
- The landmark ID selects a renderer-owned environment assembly.
- Towns resolve through village lanes, streets, bridges, or harbor forecourts.
- Dungeons resolve through cellar steps, root-wrapped cave mouths, tidal reef
  descent, misty cliff openings, or the Crystal mountain mouth.
- Act 1 uses no `transition` specials. Story routing remains in retained
  landmark transition payloads.

## Measured terrain target

Measure non-water Act 1 cells in four non-overlapping renderer-facing classes:

- meadow, grass, heath, and exploration clearings: `32% +/- 4%`;
- trails, bridges, and settlement aprons: `8% +/- 2%`;
- blocked old-growth forest: `47% +/- 5%`;
- blocked cliff, coastal rock, and Crystal mountain: `13% +/- 3%`.

The Greenhollow basin is the largest open country, followed by the Millbrook
floodplain. Port needs a legible forecourt and southern coastal heath.
Whispering and Darkfang remain enclosed. Crystal is a broad continuous mountain
shoulder with one gated passage and no ground bypass.

## Verification gate

Before owner review, require all of the following:

- exact source-water preservation and exact landmark coordinates;
- exactly seven route records with cardinal contiguous centerlines;
- zero generic landmark transition specials;
- semantic-map validation and retained transition lookup for all eight entries;
- measured terrain proportions inside the target bands;
- closed Crystal gate blocks semantic and physical approach reachability;
- exact-scale `2368 x 2912` reconstruction evidence;
- 16-pixel and 21.33-pixel hero-footprint evidence;
- independent semantic and visual review;
- full map-engine and preserved-runtime verification.

Stop at the verified Act 1 owner checkpoint. Do not begin Act 2 or wire the new
map into the preserved runtime without a new explicit implementation scope.
