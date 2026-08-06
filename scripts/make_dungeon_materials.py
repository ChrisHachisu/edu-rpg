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
import re
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
    # THE FLOOR CAME BACK AS OBJECTS, NOT AS GROUND (owner, 2026-08-06: the coastal reef "design
    # was not great", meaning the ground surface). The old wording asked for "shell grit" inside a
    # "tidal coral reef", and the generator drew the inventory rather than the surface: whole pink
    # starfish, purple shells and white coral sprigs, scattered evenly over sand, at a saturation
    # nothing else in Act 1 carries. Set against the other three themes' floors -- pebbles and
    # ochre staining, packed dark scree, earth and gravel -- it was the only one that read as a
    # collection of things instead of as a place to stand.
    #
    # It also breaks this file's own two rules at once. Discrete recognisable objects are what
    # "No objects" was there to prevent, and because a material recurs every 531 px (~11 cells)
    # the player meets THE SAME pink starfish every eleven cells -- the repeating-blob failure the
    # docstring warns about, wearing its most identifiable possible form.
    #
    # So: name the SURFACE and the state it is in, never its contents. "crushed shell grit" is
    # ground; "small shells" is a shell. The theme line drops "coral" for the same reason -- it
    # was inviting reef life into all four quadrants -- and the wall line keeps it, which is the
    # only quadrant that wanted coral in the first place.
    # THIS WORDING IS THE OWNER'S PICK, MADE WITH ITS COST ON THE TABLE (2026-08-06). A third pass
    # dropped "ripples" and "green staining" and came back as an evenly packed sand-and-pebble
    # ground with no directional structure at all -- the version that obeys every rule this file
    # sets itself. Shown both at 1:1 he chose this one, for being visibly a damp tidal flat rather
    # than gravel.
    #
    # What that buys, and it is a real cost rather than a theoretical one: "in fine close ripples"
    # draws LITERAL ripples, long wavy ridges running the full width of the tile, and a ridge that
    # spans 531 px tiles into a continuous stripe across the whole floor. That is the "no large
    # features" failure the docstring warns about. If the baked floors read as corduroy, this line
    # is the cause and the third pass is one generation away.
    #
    # Worth keeping either way, because it generalises: this generator does not read modifiers as
    # modifiers. "fine" and "faint" did not scale the ripples or the green down, they licensed
    # them. A feature you want SUBTLE is one you must not name at all.
    "coastalReef": ("tidal reef flat",
                    "pale damp sand in fine close ripples, packed with crushed shell grit, "
                    "coarse sand and small worn pebbles, cool grey-buff with faint green staining",
                    "dark coral rock and encrusted stone, fine weed in the seams",
                    "dark broken coral rubble and crushed shell in mixed small sizes",
                    "wet rippled sand under shallow water, fine weed and grit"),
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


def _portable(prompt: str | None) -> str:
    """A sheet prompt with the worktree it was issued from taken out of it.

    `sheet_prompt` ends with an ABSOLUTE destination path, so the same request issued from two
    worktrees records two different strings. Comparing them raw made the guard below fire on
    mistyGrotto and whisperingWoodsCave, whose wording had not moved at all -- the only difference
    was `.../edu-rpg-map-engine-semantic-data/...` against `.../edu-rpg-art/...`. Where the file
    was written is not part of what the image model was asked to draw, so it must not be part of
    what decides whether the drawing is still current.
    """
    return re.sub(r"\S*/design/act1-dungeon-interiors/", "design/act1-dungeon-interiors/",
                  prompt or "")


def record_sheet(key: str, session: str) -> None:
    """Record an existing sheet as the output of a NAMED Codex generation, md5-proved.

    For when the sheet on disk is genuine but its record is not: generate twice, keep the first,
    and the second run's record is the one left behind. Re-generating to fix the bookkeeping is
    not an option (a third call returns a third image), and hand-writing the record would assert
    provenance rather than establish it.

    So this proves the claim instead of taking it: the sheet must be BYTE-IDENTICAL to an image
    sitting in ~/.codex/generated_images/<session>/, which is the same check this project already
    requires by hand after every delivered generation -- Codex has been caught here producing an
    image and then overwriting it with ImageMagick draw calls. Recording the session id makes that
    check repeatable by someone who was not in the room.
    """
    p = os.path.join(MATROOT, key, f"{key}-materials-sheet.png")
    sdir = os.path.expanduser(f"~/.codex/generated_images/{session}")
    if not os.path.isdir(sdir):
        raise SystemExit(f"no such codex session: {sdir}")
    want = prov.sha256(p)
    match = [f for f in sorted(os.listdir(sdir))
             if prov.sha256(os.path.join(sdir, f)) == want]
    if not match:
        raise SystemExit(f"{key}: REFUSING -- the sheet does not match ANY image in {sdir}. "
                         f"It is not the output of that generation.")
    prov.stamp(p, inputs=[], generator=__file__,
               params={"theme": key, "model": MODEL},
               extra={"generatedBy": "codex image_gen", "prompt": sheet_prompt(key),
                      "codexSession": session, "codexImage": match[0]})
    print(f"recorded {os.path.relpath(p, ROOT)}\n  proved against {sdir}/{match[0]}")


def restamp_sheet(key: str) -> None:
    """Re-record an EXISTING sheet against the current generator, if and only if its prompt is
    unchanged.

    `prov` keys a generator by the sha256 of the WHOLE FILE, so touching this module at all --
    adding a theme, fixing a comment -- reports every sheet it ever stamped as STALE. That is
    right for a deterministic renderer, where new code means new output, and wrong for a sheet:
    a sheet is one frozen reply from an image model. Re-deriving it is impossible (a second call
    returns different pixels) and re-generating it would throw away art nobody objected to, so
    without this the only ways to reach STALE=0 were to destroy three themes or to hand-edit a
    hash.

    The guard is what makes this a check rather than a rubber stamp: the prompt recorded when the
    sheet was made must still equal the prompt this code would send for that theme today. So it
    passes exactly when the edit provably could not have changed this theme's sheet, and refuses
    the moment the theme's own wording moved -- which is when a real regeneration is owed.
    """
    p = os.path.join(MATROOT, key, f"{key}-materials-sheet.png")
    rec = prov.read(p)
    if rec is None:
        raise SystemExit(f"{key}: no provenance record to re-stamp ({p})")
    was = _portable(rec.get("prompt"))
    now = _portable(sheet_prompt(key))
    if was != now:
        raise SystemExit(f"{key}: REFUSING to re-stamp -- the prompt changed since this sheet was "
                         f"generated, so the sheet is genuinely out of date. Regenerate it:\n"
                         f"    make_dungeon_materials.py --theme {key}")
    if prov.sha256(p) != rec.get("sha256"):
        raise SystemExit(f"{key}: REFUSING to re-stamp -- the sheet itself changed since it was "
                         f"stamped. That is a swap, not a stale generator.")
    prov.stamp(p, inputs=[], generator=__file__, params=rec.get("params") or {},
               extra={"generatedBy": rec.get("generatedBy"), "prompt": now,
                      "restampedFrom": rec.get("writtenAt")})
    print(f"re-stamped {os.path.relpath(p, ROOT)}  (prompt verified unchanged)")


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
    ap.add_argument("--restamp-sheet", action="store_true",
                    help="re-record an existing sheet against this file, ONLY if its prompt is "
                         "unchanged; for when an edit elsewhere in this module marked it stale")
    ap.add_argument("--record-sheet", metavar="CODEX_SESSION",
                    help="record an existing sheet as the output of this codex session, proved "
                         "by md5 against ~/.codex/generated_images/<session>/")
    args = ap.parse_args()

    outdir = os.path.join(MATROOT, args.theme)
    os.makedirs(outdir, exist_ok=True)
    if args.record_sheet:
        record_sheet(args.theme, args.record_sheet)
        return
    if args.restamp_sheet:
        restamp_sheet(args.theme)
        return
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
