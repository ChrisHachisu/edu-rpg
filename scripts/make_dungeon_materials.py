#!/usr/bin/env python3
"""Generate ONE tiling material sheet per dungeon theme, then quilt each quadrant tileable.

Per `docs/MATERIAL-RENDERER-METHOD.md`. One generation per theme is the whole point: four
materials from a single call cannot disagree with each other, which is what makes style drift
structurally impossible rather than merely reduced. Nothing is generated per floor or per tile,
so there is no boundary anywhere for a seam to live on.

What the generator is asked for is a **material**, not a map — a uniform field with no layout,
no objects and no composition. That is the one thing it was reliably good at: the dungeon tile
pass failed at 4-14% mismatch precisely because it was being asked to honour a layout, which is
what the image tool cannot do without seed or spatial conditioning.

KEEP THIS PROMPT SHORT (measured 2026-07-31)
--------------------------------------------
The long, carefully-hedged version of this prompt was the CAUSE of the flat materials, not a
defence against them. Its "uniform field", "reads as grain rather than objects" and "no large
features" scaffolding suppressed exactly the detail the art needed: it produced `mat-wall` at
gradient 3.26 against the overworld's 16.84. A four-line probe asking plainly for "a seamless
texture swatch of damp fractured grey cave rock" scored 11.74 — 3.4x better from a tenth of the
words. Adding MORE instruction then made it worse still: a version with an explicit failure
criterion ("a smooth swatch is a failure") hung `codex exec` until the 900 s timeout, because a
brief that names a failure invites the model to verify its own output, which is already recorded
as a thing not to ask for. Describe the material; do not litigate it.

Two requirements the sheet must meet, and both are easy to get wrong:

  * **FLAT, EVEN LIGHTING.** The renderer supplies ambient occlusion, light pooling and the
    wall-base shadow. A material that arrives with its own baked highlights and shadows fights
    all three and reappears as repeating blobs once it tiles.
  * **NO large features.** A material recurs every 531px (~11 cells). Anything bigger than a few
    cells becomes a visible pattern; the overworld had to flatten its sea swell for exactly this.

    make_dungeon_materials.py --theme sunkenCellar [--sheet-only] [--quilt-only]
"""
from __future__ import annotations

import argparse
import hashlib
import importlib.util
import json
import os
import subprocess

import sys

import numpy as np
from PIL import Image

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import prov  # noqa: E402  (needs the path insert above)

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
DIR = os.path.join(ROOT, "design/act1-dungeon-interiors")
MATROOT = os.path.join(DIR, "materials")
MODEL = "gpt-5.6-sol"
QUADRANTS = [("floor", 0, 0), ("wall", 1, 0), ("rubble", 0, 1), ("accent", 1, 1)]

_spec = importlib.util.spec_from_file_location(
    "mm", os.path.join(ROOT, "scripts/make_materials.py"))
_mm = importlib.util.module_from_spec(_spec)
_spec.loader.exec_module(_mm)

# Per theme: the four materials, in quadrant order — floor, wall, rubble, accent.
THEMES = {
    "sunkenCellar": ("flooded stone cellar",
                     "pale silted cave floor of packed grit, scattered small pebbles, chips of "
                     "shale and cracked mineral crust, warm grey-buff with ochre staining",
                     "damp fractured cave rock in irregular angular blocks, deep black crevices "
                     "between them, chipped edges and pale blue-grey mineral veining",
                     "broken scree of sharp rock fragments and loose chips in mixed sizes",
                     "shallow standing water over pale silt, rippled mineral crust, "
                     "grit and small stones showing through"),
    "whisperingWoodsCave": ("root-riddled earth cave",
                            "pale packed earth and fine gravel with scattered grit",
                            "dark earth and stone threaded through with fine tree roots",
                            "dark fallen earth clods, small stones and broken root ends",
                            "damp dark earth with moss and fine rootlets"),
    "mistyGrotto": ("jagged black fang rock",
                    "pale grey grit and shattered scree",
                    "near-black fractured rock in sharp angular facets, pale mineral veins",
                    "dark angular rock shards and splintered fragments",
                    "wet near-black rock with a faint sheen and pale vein traces"),
    "coastalReef": ("tidal coral reef",
                    "pale dry sand and shell grit",
                    "dark coral rock and encrusted stone, fine weed in the seams",
                    "dark broken coral fragments, shell and pebble debris",
                    "wet sand with shallow water, weed and small shells"),
    "crystalCave": ("faceted crystal cavern",
                    "pale mineral sand, almost white, fine and even",
                    "dark rock shot through with small blue-white crystal faces",
                    "dark rock chips and broken crystal fragments",
                    "pale blue-white crystal facets packed close"),
}


def sheet_prompt(key: str) -> str:
    theme, floor, wall, rubble, accent = THEMES[key]
    out = os.path.join(MATROOT, key, f"{key}-materials-sheet.png")
    return f"""Call the built-in image_gen tool ONCE, immediately. Read no files, no skills, no docs.

Prompt: A 2x2 grid of four seamless TEXTURE SWATCHES for a {theme}, 1024x1024, four equal \
quadrants, no gap or border.

TOP-LEFT: {floor}.
TOP-RIGHT: {wall}.
BOTTOM-LEFT: {rubble}.
BOTTOM-RIGHT: {accent}.

Flat even lighting, no cast shadows. Dense fine detail across every quadrant, strong contrast \
between grains, rich tinted colour. Detailed 16-bit SNES JRPG pixel texture. Nothing larger than \
a thumbnail. No objects, no layout, no text.

Then copy the generated file to {out}. Print the final path. \
Do not commit, do not build, modify no existing file."""


def quilt(key: str, overlap: int = 96) -> None:
    outdir = os.path.join(MATROOT, key)
    sheet_path = os.path.join(outdir, f"{key}-materials-sheet.png")
    if not os.path.exists(sheet_path):
        raise SystemExit(f"no sheet at {sheet_path}")
    sheet = Image.open(sheet_path).convert("RGB")
    W, H = sheet.size
    qw, qh = W // 2, H // 2
    print(f"sheet {W}x{H} -> quadrants {qw}x{qh}, wrap overlap {overlap}px")

    meta = {}
    for name, cx, cy in QUADRANTS:
        q = np.asarray(sheet.crop((cx * qw, cy * qh, (cx + 1) * qw, (cy + 1) * qh)))
        before, _ = _mm.wrap_error(q)
        t = _mm.wrap_axis(_mm.wrap_axis(q, overlap, 0), overlap, 1)
        after, inner = _mm.wrap_error(t)
        mat_p = os.path.join(outdir, f"mat-{name}.png")
        Image.fromarray(t).save(mat_p)
        # A material is a SOURCE cut from the generated sheet. Stamping it is what makes a later
        # unstamped replacement report MODIFIED instead of passing silently, which is precisely
        # what happened to mat-wall.png at 08:27 on 2026-08-01.
        prov.stamp(mat_p, inputs=[sheet_path], generator=__file__,
                   params={"theme": key, "quadrant": name, "overlap": overlap})
        meta[name] = {"size": list(t.shape[:2][::-1]),
                      "meanRGB": [round(float(v), 1) for v in t.reshape(-1, 3).mean(axis=0)],
                      "wrapStepBefore": round(float(before), 2),
                      "wrapStepAfter": round(float(after), 2),
                      "interiorStep": round(float(inner), 2)}
        ok = "OK" if after <= inner * 1.6 else "STILL VISIBLE"
        print(f"  {name:<7} {t.shape[1]}x{t.shape[0]}  wrap step {before:6.2f} -> {after:5.2f}"
              f"  (interior {inner:5.2f})  {ok}")
    json.dump(meta, open(os.path.join(outdir, "materials.json"), "w"), indent=1)


def main() -> None:
    ap = argparse.ArgumentParser()
    ap.add_argument("--theme", required=True, choices=sorted(THEMES))
    ap.add_argument("--sheet-only", action="store_true")
    ap.add_argument("--quilt-only", action="store_true")
    ap.add_argument("--material", help="regenerate ONE material (e.g. wall), leaving the rest")
    args = ap.parse_args()

    outdir = os.path.join(MATROOT, args.theme)
    os.makedirs(outdir, exist_ok=True)
    if args.material:
        regen(args.theme, args.material)
        return
    if not args.quilt_only:
        print(f"generating material sheet for {args.theme} ...", flush=True)
        p = os.path.join(outdir, f"{args.theme}-materials-sheet.png")
        # `os.path.exists` is NOT evidence of generation — on a re-run the previous sheet is
        # already there, so a `codex exec` that produced nothing reported "written" and the
        # quilt silently re-cut the OLD sheet. That cost a full round: the materials came back
        # byte-identical and were briefly read as the prompt having failed to change anything.
        # The prompt ends "modify no existing file", so on ANY re-run Codex generates the image
        # and then refuses to copy it over the sheet already sitting there — exit 17, "Refusing to
        # overwrite existing destination". It looks exactly like a generation failure and is not
        # one: the PNG is sitting in ~/.codex/generated_images. Clear the destination first so the
        # instruction and the intent agree.
        before = hashlib.md5(open(p, "rb").read()).hexdigest() if os.path.exists(p) else None
        if before is not None:
            os.replace(p, p + ".prev")
        r = subprocess.run(["codex", "exec", "-m", MODEL, "--skip-git-repo-check",
                            sheet_prompt(args.theme)], cwd=ROOT, capture_output=True,
                           text=True, timeout=900)
        after = hashlib.md5(open(p, "rb").read()).hexdigest() if os.path.exists(p) else None
        if after is None or after == before:
            if before is not None and not os.path.exists(p):
                os.replace(p + ".prev", p)          # put the old sheet back; nothing was made
            print(f"sheet: NOT PRODUCED (unchanged: {after == before})   rc={r.returncode}")
            print("---- codex stdout ----\n" + (r.stdout or "")[-2500:])
            print("---- codex stderr ----\n" + (r.stderr or "")[-1500:])
            raise SystemExit("REFUSING to quilt a stale sheet")
        prov.stamp(p, inputs=[], generator=__file__, params={"theme": args.theme, "model": MODEL},
                   extra={"generatedBy": "codex image_gen", "prompt": sheet_prompt(args.theme)})
        print("sheet: written")
    if not args.sheet_only:
        quilt(args.theme)



# ── single-material regeneration ─────────────────────────────────────────────────────────────

# One material at a time, so a sheet that is good in three quadrants and wrong in one does not
# have to be re-rolled whole. It trades away the "one generation cannot disagree with itself"
# guarantee, which is acceptable here only because `render_dungeon_material_map.grade()` puts
# every material onto its theme's tone target regardless of what came back.
REGEN = {
    ("sunkenCellar", "wall"):
        "damp fractured cave rock in angular blocks divided by deep black crevices, every rock "
        "face densely covered in fine mineral speckle, grit and hairline cracks",
}


def single_prompt(key: str, name: str, out: str) -> str:
    return f"""Call the built-in image_gen tool ONCE, immediately. Read no files, no skills, no docs.

Prompt: A seamless TEXTURE SWATCH of {REGEN[(key, name)]}, 1024x1024. Flat even lighting, no \
cast shadows. Dense fine detail everywhere, strong contrast between grains, rich tinted colour. \
Detailed 16-bit SNES JRPG pixel texture. No objects, no layout, no text.

Then copy the generated file to {out}. Print the final path. \
Do not commit, do not build, modify no existing file."""


def regen(key: str, name: str) -> None:
    outdir = os.path.join(MATROOT, key)
    raw = os.path.join(outdir, f"regen-{name}.png")
    if os.path.exists(raw):
        os.remove(raw)                      # destination must not exist, or Codex refuses the copy
    r = subprocess.run(["codex", "exec", "-m", MODEL, "--skip-git-repo-check",
                        single_prompt(key, name, raw)], cwd=ROOT, capture_output=True,
                       text=True, timeout=900)
    if not os.path.exists(raw):
        print("---- codex stdout ----\n" + (r.stdout or "")[-2000:])
        print("---- codex stderr ----\n" + (r.stderr or "")[-1000:])
        raise SystemExit(f"{name}: NOT PRODUCED (rc={r.returncode})")

    # Match the sheet path exactly: a 627px quadrant wrapped with a 96px overlap lands at 531.
    q = np.asarray(Image.open(raw).convert("RGB").resize((627, 627), Image.Resampling.LANCZOS))
    before, _ = _mm.wrap_error(q)
    t = _mm.wrap_axis(_mm.wrap_axis(q, 96, 0), 96, 1)
    after, inner = _mm.wrap_error(t)
    dst = os.path.join(outdir, f"mat-{name}.png")
    if os.path.exists(dst):
        os.replace(dst, dst + ".prev")
    Image.fromarray(t).save(dst)
    prov.stamp(dst, inputs=[raw], generator=__file__,
               params={"theme": key, "material": name, "singleRegen": True})
    print(f"  {name:<7} {t.shape[1]}x{t.shape[0]}  wrap step {before:6.2f} -> {after:5.2f}"
          f"  (interior {inner:5.2f})  {'OK' if after <= inner * 1.6 else 'STILL VISIBLE'}")

if __name__ == "__main__":
    main()
