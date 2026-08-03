---
date: 2026-07-14
type: handoff
status: owner-checkpoint
project: edu-rpg
milestone: direct-source-overworld-art-blueprint
branch: codex/map-engine-semantic-data
owner-checkpoint: choose-localized-correction-or-concept-only
---

# Owner checkpoint: direct-source artistic overworld

## Result

The current shipped 320x400 overworld was captured as five real, north-up,
same-scale Act plates and deterministically restored to one exact global source
mosaic. Two five-reference generations failed fidelity. A fresh batch using the
single source mosaic produced a materially better connected-continent design,
then a targeted correction produced the current best candidate:

- `design/review/overworld-art-blueprint/generated/overworld-source-mosaic-redraw-v2.png`

Independent verdict: **NO-GO as implementation authority; retain as a strong
artistic concept.**

## Verified source authority

- Clean exact-scale mosaic:
  `design/review/overworld-art-blueprint/source-mosaic/world-current-clean.png`
- Connector-marked twin:
  `design/review/overworld-art-blueprint/source-mosaic/world-current-connectors.png`
- Provenance/placement evidence:
  `design/review/overworld-art-blueprint/source-mosaic/manifest.json`
- Five source plates and capture evidence:
  `design/review/overworld-art-blueprint/source-plates/manifest.json`

The mosaic is 5120x6400, representing 320x400 tiles at 16 px/tile. Act 3/4's
shared overlap is pixel-identical. Eight connector markers are the only changes
in the marked twin. All source plates came from the preserved shipped runtime;
130 native capture chunks passed per-chunk and whole-image terrain guards.

## Candidate passes

- one physically continuous land continent;
- organic asymmetrical coastline, not a square or bridge-linked island set;
- all five Acts retain substantial relative footprints;
- exactly four portals, all in the final Act;
- Frozen Lake, oasis, dense forests, cave territory, volcano, settlements, and
  major route structure are visible;
- no labels, registration markers, bridges, or water-separated Acts.

## Material failures

1. Crystal is convincing, but Shadow, Magma, and Volcanic do not show two clear
   dungeon mouths controlling passage through one broad natural barrier.
2. Act 4's defining volcanic identity drifted toward the southern seam.
3. Act 5 lacks the source mountain-maze topology and Demon Castle's controlled
   moat/island treatment.
4. Several route branches and landmark clusters remain artistically simplified.

These exceed artistic tolerance for a build blueprint. Another whole-image edit
is likely to regress the successful coastline, scale, and continuity.

## Recommended next direction

Lock the current candidate's macro-continent and style, then run a localized
correction pipeline: separate high-resolution crops for Shadow, Magma, Volcanic,
Act 4, and Act 5; pair each crop with its exact source region; approve each crop;
then composite approved corrections back into the locked continent with feathered
seams. Do not regenerate the whole continent.

## Owner decision

Approve one of:

1. **Recommended:** continue with localized connector/Act 4/Act 5 correction
   crops before promoting any blueprint.
2. Keep V2 as concept art only and postpone an authoritative blueprint.

## Resume prompt

Resume in this worktree from this handoff. Preserve the verified source mosaics
and lock `overworld-source-mosaic-redraw-v2.png` against whole-image regeneration.
If the owner approves option 1, create and independently review localized edit
crops for Shadow, Magma, Volcanic, Act 4 volcanic identity, and Act 5 mountain
maze/Demon Castle; composite only approved crops back into a new version. Do not
modify runtime terrain, map coordinates, dungeons, `public/`, `dist/`, or the
preserved bundle; do not build, commit, push, deploy, or publish.
