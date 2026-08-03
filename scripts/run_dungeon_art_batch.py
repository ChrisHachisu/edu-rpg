#!/usr/bin/env python3
"""Run the Codex art pass over dungeon tiles, then verify each return independently.

The prompt here is the one that came back **0/676 mismatches** on the pilot. Three things about
its shape were learned the hard way and must not be softened:

1. **Forbid reading skills and docs.** Two earlier runs spent their whole budget reading
   `SKILL.md`, `AGENTS.md`, `AGENT-WORKFLOW.md`, `prompting.md` and `sample-prompts.md`
   (~1000 lines) and produced no image at all.
2. **Keep the attached references small.** ~8 MB across three reference images killed the
   `image_gen` call silently. One composition base plus ONE downscaled style ref (<0.5 MB) works.
3. **The base is composition truth, stated as tracing, not as mood.** The first run treated it
   as a reference and redrew the shapes: 17.3% mismatch. (Though the larger cause there was a
   defective base — see `smooth_dungeon_semantic.enforce_readability`.)

Every return is checked by `verify_dungeon_art.py` against the tile's own per-cell truth, never
by the generator's self-report.

Usage:
  run_dungeon_art_batch.py --only sunkenCellar        # one dungeon
  run_dungeon_art_batch.py --limit 5                  # first N pending tiles
  run_dungeon_art_batch.py --redo <tile-name>         # regenerate one that failed
"""
from __future__ import annotations

import argparse
import glob
import json
import os
import subprocess

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
DIR = os.path.join(ROOT, "design/act1-dungeon-interiors")
TILES = os.path.join(DIR, "art-tiles")
STYLE_REF = os.path.join(TILES, "_style-ref-1024.jpg")
MODEL = "gpt-5.6-sol"          # -m gpt-5-codex is rejected on this account

# What each dungeon's rock and floor should become.
#
# Every FLOOR material must be light-valued and every WALL material dark. This is not flavour:
# the pilot passed at 8.59 sigma on "packed earth, fine gravel, scattered grit" — a naturally
# pale floor — while a first production tile described as "silted floor with standing water,
# wet flagstone" over "walls of old mortared block" came back at 3.38 sigma and 7.4% wrong. The
# shapes were traced correctly both times; the atmosphere wording inverted the value contrast
# the whole contract rests on. Keep the mood in the DETAIL, never in the base value.
MATERIALS = {
    # (cave kind, what the PALE areas become, what the DARK areas become)
    #
    # The frame these drop into is the pilot's, verbatim — "the pale open areas become X, the
    # dark masses become Y" binds material directly to region. A production rewrite that moved
    # the same nouns into a detached "Materials:" clause regressed three tiles to 1.9-3.4 sigma
    # and 7-14% wrong, on bases measuring 9.0-9.7 sigma. Only the nouns vary; the frame does not.
    "flooded stone cellar": (
        "flooded stone cellar",
        "pale silted stone floor, light grey-buff and dry-looking, with a few small dark puddles",
        "dark mortared block gone back to rock, deep-shadowed and wet-looking"),
    "root-riddled earth cave": (
        "root-riddled earth cave",
        "packed earth and fine gravel, scattered grit, a few damp patches",
        "dark earth and stone threaded by tree roots from above, moss in the sheltered hollows"),
    "jagged black fang rock": (
        "cave of jagged black rock",
        "pale grey grit and shattered scree, clearly the lightest surface",
        "near-black fractured rock in sharp angular facets with pale mineral veins"),
    "tidal coral reef": (
        "tidal reef cave",
        "pale dry sand and shell grit, bright underfoot",
        "dark coral rock and encrusted stone with weed in the damp seams"),
    "faceted crystal cavern": (
        "crystal cavern",
        "pale mineral sand, almost white",
        "dark rock shot through with blue-white crystal faces, facets crisp and part of the wall"),
}


def build_style_ref() -> None:
    """One small style anchor. The full-size overworld ART tile is 4.4 MB and kills the call."""
    if os.path.exists(STYLE_REF):
        return
    from PIL import Image
    src = os.path.join(ROOT, "design/review/overworld-art-blueprint/act-by-act/act1/"
                             "dq-art-full-v2/semantic-test/tile-4-8-ART.png")
    Image.open(src).resize((1024, 1024), Image.Resampling.LANCZOS).save(STYLE_REF, quality=88)


def prompt_for(meta: dict) -> str:
    base = os.path.join(TILES, f"{meta['tile']}-base.png")
    out = os.path.join(TILES, f"{meta['tile']}-ART.png")
    kind, floor_mat, wall_mat = MATERIALS.get(
        meta["theme"], ("cave", "packed earth and gravel", "dark rough rock"))
    return f"""Call the built-in image_gen tool ONCE, immediately. Read no files, no skills, no docs.

Input images:
- {base} (COMPOSITION TRUTH — reproduce its exact shapes)
- {STYLE_REF} (style only)

Prompt: Top-down 3/4 interior plan of a natural {kind}, 1024x1024. The composition image is a \
map you must trace, not a mood reference. Every pale open area stays open in exactly its shape; \
every dark mass stays solid in exactly its shape; every narrow neck between two pale areas stays \
exactly that narrow. Do not merge two dark masses, do not split one, do not widen a passage, do \
not close a passage, do not move a boundary. The pale open areas become walkable cave floor: \
{floor_mat}. The dark masses become impassable wall of {wall_mat}, lit along their edges from \
the upper left, with cast shadow where wall meets floor. Crisp faux-pixel material detail, \
stepped shading, dark but clearly readable — the floor must stay obviously lighter than the wall \
everywhere, including where a wall is only one cell wide. Not painterly, not flat cartoony cel. \
No flagstone grids, brickwork or worked masonry. No chests, doors, stairs, crystals to collect, \
signs, torches, barrels or bones — no objects of any kind. Invent nothing: add only material and \
light.

Then copy the generated file to {out} and resize to exactly 1248x1248 with: sips -z 1248 1248 <file>. \
Print the final path. Do not commit, do not build, modify no existing file."""


def verify(tile: str) -> tuple[bool, str]:
    art = os.path.join(TILES, f"{tile}-ART.png")
    meta = os.path.join(TILES, f"{tile}.json")
    if not os.path.exists(art):
        return False, "no image produced"
    r = subprocess.run(["/usr/bin/python3", os.path.join(ROOT, "scripts/verify_dungeon_art.py"),
                        art, meta], capture_output=True, text=True)
    line = [l for l in r.stdout.splitlines() if l.startswith(("mismatches", "separation"))]
    return r.returncode == 0, " · ".join(line) or r.stdout.strip()[:120]


def main() -> None:
    ap = argparse.ArgumentParser()
    ap.add_argument("--only")
    ap.add_argument("--limit", type=int)
    ap.add_argument("--redo")
    ap.add_argument("--min-floor", type=float, default=0.04,
                    help="skip tiles with less floor than this — near-solid rock")
    args = ap.parse_args()

    build_style_ref()
    tiles = json.load(open(os.path.join(TILES, "tiles.json")))["tiles"]
    metas = []
    for t in tiles:
        meta = json.load(open(os.path.join(TILES, f"{t['tile']}.json")))
        if args.redo:
            if meta["tile"] == args.redo:
                metas = [meta]
                break
            continue
        if args.only and meta["dungeon"] != args.only:
            continue
        if meta["floorFraction"] < args.min_floor:
            continue
        if os.path.exists(os.path.join(TILES, f"{meta['tile']}-ART.png")):
            continue
        metas.append(meta)
    if args.limit:
        metas = metas[:args.limit]

    print(f"{len(metas)} tile(s) to generate\n")
    ok = fail = 0
    for i, meta in enumerate(metas, 1):
        print(f"[{i}/{len(metas)}] {meta['tile']} ({meta['floorFraction']:.0%} floor)", flush=True)
        subprocess.run(["codex", "exec", "-m", MODEL, "--skip-git-repo-check", prompt_for(meta)],
                       cwd=ROOT, capture_output=True, text=True, timeout=900)
        good, detail = verify(meta["tile"])
        print(f"      {'OK  ' if good else 'FAIL'} {detail}", flush=True)
        ok, fail = (ok + 1, fail) if good else (ok, fail + 1)
    print(f"\n{ok} passed, {fail} failed")


if __name__ == "__main__":
    main()
