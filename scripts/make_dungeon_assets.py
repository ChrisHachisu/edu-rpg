#!/usr/bin/env python3
"""Generate the dungeon special-asset sprites in ONE call, key them, and composite them.

Same reasoning as the material sheet: one generation means the eight props cannot disagree with
each other, so they read as one set. They are OBJECTS, not layout, which is what the image tool
is actually reliable at — the failed tile pass failed because it was being asked to honour a
layout it has no spatial conditioning for.

Assets are the glyphs the generator already emits:

    M  mouth        the way out to the overworld (floor 1)
    U  stairsUp     back to the floor above
    D  stairsDown   deeper
    B  boss         the boss tile
    C  chest        treasure — impassable, so it must read as a solid object
       chestOpen    the opened state of the same chest; no glyph, swapped in at runtime
    S  save         crystal — impassable
    T  torch        a pickup; +2 fog radius (Darkfang Grotto only)
    i  sign         a PLAQUE, mounted on the wall, so it is drawn on a rock cell

Generated on a flat magenta chroma key and cut locally, because the built-in image tool cannot
produce real alpha. Compositing places each sprite on its cell centre, sat slightly high so it
reads as standing on the floor rather than painted onto it.

    make_dungeon_assets.py                       # generate + key + split
    make_dungeon_assets.py --composite FLOOR_ID  # draw them onto a rendered floor
"""
from __future__ import annotations

import argparse
import hashlib
import json
import os
import subprocess

import sys

import numpy as np
from PIL import Image, ImageDraw, ImageFilter

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import prov  # noqa: E402  (needs the path insert above)


def _prop_cells() -> dict:
    """ONE table of prop sizes, owned by the renderer — duplicating it here is how the two
    compositing paths drifted apart. Imported lazily because the renderer imports THIS module for
    `sprite_at()`, so a module-level import is a cycle."""
    from render_dungeon_material_map import PROP_CELLS
    return PROP_CELLS

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
DIR = os.path.join(ROOT, "design/act1-dungeon-interiors")
ASSETS = os.path.join(DIR, "assets")
MODEL = "gpt-5.6-sol"
PX = 48
KEY = (255, 0, 255)

# 3x3 sheet, row-major. Nine cells, NINE assets — the empty ninth cell of the 2026-07-31 sheet is
# now the chest's open state (owner, 2026-08-01). The two chest cells are deliberately adjacent so
# the generator draws them as one object in two states rather than as two different chests.
#
# Subjects are the contract in design/DUNGEON-ASSET-PROMPTS.md. The boss is a HOODED SHADOW WRAITH
# and nothing else: the "carved sigil slab" this script asked for on 2026-07-31 was a regression
# away from the design that actually shipped, and is what the owner rejected.
CELLS = [
    ("mouth", "a cave mouth opening out to daylight, dark arch with pale light beyond"),
    ("stairsUp", "a short flight of worn stone steps leading UP, seen from above"),
    ("stairsDown", "a short flight of worn stone steps leading DOWN into darkness, seen from above"),
    # Owner, 2026-08-01, after two misses in opposite directions: v1 was "a sliver of smoke", v2
    # an ornate armoured lich — "way too strong and specific ... it needs to look like a black
    # smoke with eyes inside. less specificity". The marker stands for an UNKNOWN, so anything
    # that resolves into a recognisable creature is wrong however good it looks. No hood, no
    # robe, no limbs, no crown, no weapon — smoke and two red eyes.
    ("boss", "a formless mass of dense black smoke, billowing and opaque, with two glowing red "
             "eyes burning deep inside it, no body and no face, fraying into wisps at its edges"),
    ("chest", "a small CLOSED wooden treasure chest with iron bands and a brass clasp, square-on "
              "to the viewer, facing straight forward"),
    ("chestOpen", "the SAME wooden treasure chest OPEN, lid hinged back, interior visible, "
                  "square-on to the viewer, facing straight forward"),
    ("save", "an upright faceted crystal shard glowing soft cyan, standing on a small rock base"),
    ("torch", "a lit torch lying on the ground, small warm flame"),
    ("sign", "a rectangular stone plaque with carved lines of writing, mounted flat on a wall"),
]


def sheet_prompt() -> str:
    out = os.path.join(ASSETS, "dungeon-assets-sheet.png")
    items = "\n".join(f"{'TOP MIDDLE BOTTOM'.split()[i // 3]} "
                      f"{'LEFT CENTRE RIGHT'.split()[i % 3]}: {d}."
                      for i, (n, d) in enumerate(CELLS))
    return f"""Call the built-in image_gen tool ONCE, immediately. Read no files, no skills, no docs.

Prompt: A 3x3 grid of nine separate GAME PROP SPRITES on a flat pure magenta background \
(#FF00FF), 1024x1024, nine equal cells with no gap, border, frame or label. Each prop is \
centred in its own cell, seen from a 3/4 top-down view, and does not touch or overlap any other \
cell. The magenta must be completely flat and unshaded everywhere it shows, including between \
and around the props, so it can be keyed out cleanly — no soft magenta glow, no magenta \
reflected onto the props.

{items}

Detailed painterly game art, softly lit from the upper left, readable silhouette, no \
anti-aliasing halos. Stone and rock use a cool desaturated blue-grey palette of #15151a, #25252b, \
#3d3e42, #525351 and #75746d, so they match wet cave rock. Colour is saturated ONLY on the brass \
of the chests, the cyan crystal, the torch flame and the wraith's red eyes. Each prop is small \
and compact — a chest is a chest, not furniture. Consistent scale, palette and rendering across \
all nine cells. No ground, no floor, no shadow pooled under the props, no scenery, no text.

Then copy the generated file to {out}. Print the final path. \
Do not commit, do not build, modify no existing file."""


def cell_prompt(name: str, subject: str) -> str:
    """One prop, re-rolled on its own and spliced back into the sheet.

    Re-rolling the whole 3x3 to fix one cell risks eight props the owner already accepted. Mirrors
    `make_dungeon_materials.py --material`, and trades away the "one generation cannot disagree
    with itself" guarantee — so the style line here must stay character-for-character identical to
    the sheet's, or the replacement lands in a different style from its neighbours.
    """
    out = os.path.join(ASSETS, f"regen-{name}.png")
    return f"""Call the built-in image_gen tool ONCE, immediately. Read no files, no skills, no docs.

Prompt: A single GAME PROP SPRITE centred on a flat pure magenta background (#FF00FF), \
1024x1024, no grid, no border, no frame, no label. The magenta must be completely flat and \
unshaded everywhere it shows, so it can be keyed out cleanly — no soft magenta glow, no magenta \
reflected onto the prop.

{subject}.

Detailed painterly game art, softly lit from the upper left, readable silhouette, no \
anti-aliasing halos. Stone and rock use a cool desaturated blue-grey palette of #15151a, #25252b, \
#3d3e42, #525351 and #75746d, so they match wet cave rock. Colour is saturated ONLY on the brass \
of the chests, the cyan crystal, the torch flame and the wraith's red eyes. No ground, no floor, \
no shadow pooled under the prop, no scenery, no text.

Then copy the generated file to {out}. Print the final path. \
Do not commit, do not build, modify no existing file."""


def regen_cell(name: str, subject: str | None = None) -> None:
    """Generate ONE prop and splice it into the sheet, which stays the single source of truth."""
    idx = {n: i for i, (n, _) in enumerate(CELLS)}
    if name not in idx:
        raise SystemExit(f"unknown cell {name!r}; one of {sorted(idx)}")
    subject = subject or dict(CELLS)[name]
    raw = os.path.join(ASSETS, f"regen-{name}.png")
    if os.path.exists(raw):
        os.replace(raw, raw + ".prev")
    print(f"regenerating {name} ...", flush=True)
    r = subprocess.run(["codex", "exec", "-m", MODEL, "--skip-git-repo-check",
                        cell_prompt(name, subject)], cwd=ROOT, capture_output=True,
                       text=True, timeout=900)
    if not os.path.exists(raw):
        print(f"NOT PRODUCED  rc={r.returncode}")
        print("---- codex stdout ----\n" + (r.stdout or "")[-2000:])
        raise SystemExit(f"no {raw}")

    sheet_p = os.path.join(ASSETS, "dungeon-assets-sheet.png")
    sheet = Image.open(sheet_p).convert("RGB")
    ch, cw = sheet.height // 3, sheet.width // 3
    i = idx[name]
    sheet.paste(Image.open(raw).convert("RGB").resize((cw, ch), Image.Resampling.LANCZOS),
                ((i % 3) * cw, (i // 3) * ch))
    sheet.save(sheet_p)
    prov.stamp(sheet_p, inputs=[raw], generator=None,   # see the note in main(): codex drew it
               params={"model": MODEL, "regeneratedCell": name},
               extra={"generatedBy": "codex image_gen", "prompt": cell_prompt(name, subject)})
    print(f"spliced {name} into the sheet")
    split_sheet()


def key_out(cell: np.ndarray, tol: int = 60) -> np.ndarray:
    """Cut the magenta. Distance in RGB rather than a per-channel test, so a prop's own purple
    is not eaten along with the background."""
    # float32, not int16: squaring a channel difference reaches 65025, which overflows int16
    # and produced NaN alpha at the cast below.
    rgb = cell[..., :3].astype(np.float32)
    d = np.sqrt(((rgb - np.array(KEY, np.float32)) ** 2).sum(axis=2))
    alpha = np.clip((d - tol) / 40.0, 0, 1)
    out = np.dstack([cell[..., :3], (alpha * 255).astype(np.uint8)])

    # Despill, applied to EVERY kept pixel, not just the partial-alpha edge.
    #
    # An edge-only despill assumes contamination lives in the anti-aliased boundary. It does not.
    # The wraith's smoke tendrils are wisps the generator drew as a blend toward the #FF00FF
    # background, so they came back FULLY OPAQUE and bright pink — 13.7% of its pixels, averaging
    # brightness 67 against 27 for the rest of the sprite. The key is right to keep them (they are
    # the tendrils) and right not to eat them as background; what they need is the spill pulled
    # out of the colour.
    #
    # Magenta contaminates R and B, so suppress those toward G by the FULL excess.
    #
    # This was capped at 3/4 while the boss was a VIOLET wraith: a full suppression flattened it
    # to a neutral (11,15,20) and threw the design away with the spill. The owner then moved the
    # design to black smoke ("less specificity"), and neutral is now exactly right — full
    # suppression lands the smoke on (17,17,17) with 0% pink, against 1.8% at 3/4 on a sprite
    # made almost entirely of fine wisps. The parameter did not become correct; the constraint
    # that limited it was removed. Cyan, flame and brass all carry G at or above (R+B)/2, so none
    # of them move at any setting — verified across the sweep.
    rgb_i = out[..., :3].astype(np.int16)
    g = rgb_i[..., 1]
    spill = np.maximum((rgb_i[..., 0] + rgb_i[..., 2]) // 2 - g, 0)
    out[..., 0] = np.clip(rgb_i[..., 0] - spill, 0, 255).astype(np.uint8)
    out[..., 2] = np.clip(rgb_i[..., 2] - spill, 0, 255).astype(np.uint8)
    return out


def split_sheet() -> None:
    p = os.path.join(ASSETS, "dungeon-assets-sheet.png")
    if not os.path.exists(p):
        raise SystemExit(f"no sheet at {p}")
    sheet = np.asarray(Image.open(p).convert("RGB"))
    H, W = sheet.shape[:2]
    ch, cw = H // 3, W // 3
    meta = {}
    for i, (name, _) in enumerate(CELLS):
        if name.startswith("_"):
            continue
        r, c = i // 3, i % 3
        cell = sheet[r * ch:(r + 1) * ch, c * cw:(c + 1) * cw]
        rgba = key_out(cell)
        ys, xs = np.nonzero(rgba[..., 3] > 12)
        if len(ys) == 0:
            print(f"  {name:<11} EMPTY after keying — regenerate")
            continue
        crop = rgba[ys.min():ys.max() + 1, xs.min():xs.max() + 1]
        # Fit the prop into one cell, keeping its aspect. Sprites read best a touch under a full
        # cell so the floor shows around them.
        target = int(PX * 0.86)
        h, w = crop.shape[:2]
        s = target / max(h, w)
        im = Image.fromarray(crop).resize((max(1, int(w * s)), max(1, int(h * s))),
                                          Image.Resampling.LANCZOS)
        ap_ = os.path.join(ASSETS, f"asset-{name}.png")
        im.save(ap_)
        # Each cut sprite records the sheet it came from, so re-rolling the sheet marks every
        # sprite stale rather than leaving a half-updated set that still looks plausible.
        prov.stamp(ap_, inputs=[p], generator=__file__, params={"cell": name, "px": PX})
        meta[name] = {"size": list(im.size), "sourceBox": [int(xs.min()), int(ys.min()),
                                                           int(xs.max()), int(ys.max())]}
        print(f"  {name:<11} {im.size[0]:2d}x{im.size[1]:2d}")
    json.dump(meta, open(os.path.join(ASSETS, "assets.json"), "w"), indent=1)


def composite(floor_id: str, scale: int = 2, allow_stale: bool = False) -> None:
    fl = json.load(open(os.path.join(DIR, f"{floor_id}.json")))
    base_p = os.path.join(DIR, f"{floor_id}-material.png")
    if not os.path.exists(base_p):
        raise SystemExit(f"render the floor first: {base_p}")
    # THE 2026-08-01 FAILURE, GUARDED. `mat-wall.png` was replaced at 08:27; this composite ran
    # against a 07-31 render and the result was shown to the owner as the current art. Existence
    # of the base render says nothing about whether it still reflects its materials.
    prov.require_fresh(base_p, allow_stale=allow_stale)
    img = Image.open(base_p).convert("RGBA")
    px = max(1, PX // scale)
    cells = _prop_cells()
    placed = 0
    for a in fl["assets"]:
        # Size per KIND, from the renderer's own table — not the flat 41 px thumbnails.
        #
        # These were two compositing paths that disagreed. `render_dungeon_material_map.py`
        # sizes each prop by PROP_CELLS at master resolution; this preview pasted the baked
        # thumbnail, so every prop came out the same size and the boss — 1.6 cells in the
        # renderer — appeared at 28x41 instead of 54x77. The owner reviewed THIS path and quite
        # reasonably said the boss "looks like a sliver of smoke". A preview that disagrees with
        # the production renderer is worse than no preview.
        sp = sprite_at(a["kind"], int(round((PX / scale) * cells.get(a["kind"], 1.0))))
        if sp is None:
            continue
        # Centre on the cell, lifted a little so the sprite stands ON the floor rather than
        # floating in the middle of it.
        cx = a["x"] * px + px // 2 - sp.width // 2
        cy = a["y"] * px + px // 2 - sp.height // 2 - int(px * 0.04)

        # Seat it with the RENDERER's own routine rather than a copy.
        #
        # This used to duplicate the contact-shadow code, and the duplicate carried the same
        # full-canvas-ellipse bug the owner spotted as "a faint square below it". Two copies of a
        # bug is what the PROP_CELLS split already taught; one seat function, used by both paths.
        from render_dungeon_material_map import _seat
        _seat(img, sp, cx, cy, px)
        placed += 1
    out = os.path.join(DIR, f"{floor_id}-material-assets.png")
    img.convert("RGB").save(out)
    prov.stamp(out, generator=__file__,
               inputs=[base_p, os.path.join(DIR, f"{floor_id}.json")] +
                      [os.path.join(ASSETS, f"asset-{n}.png") for n, _ in CELLS
                       if os.path.isfile(os.path.join(ASSETS, f"asset-{n}.png"))],
               params={"scale": scale})
    print(f"{floor_id}: composited {placed} assets -> {os.path.relpath(out, ROOT)}")


def main() -> None:
    ap = argparse.ArgumentParser()
    ap.add_argument("--composite", help="floor id, e.g. sunkenCellar-f3")
    ap.add_argument("--scale", type=int, default=1,
                    help="must match the scale the floor was rendered at; 1 = full 48px/cell")
    ap.add_argument("--split-only", action="store_true")
    ap.add_argument("--cell", help="regenerate ONE prop (e.g. boss) and splice it into the sheet")
    ap.add_argument("--subject", help="override the subject line for --cell")
    ap.add_argument("--allow-stale", action="store_true",
                    help="composite onto a base that is not verifiably current (says so loudly)")
    args = ap.parse_args()
    os.makedirs(ASSETS, exist_ok=True)

    if args.composite:
        composite(args.composite, args.scale, args.allow_stale)
        return
    if args.cell:
        regen_cell(args.cell, args.subject)
        return
    if not args.split_only:
        print("generating the dungeon asset sheet ...", flush=True)
        p = os.path.join(ASSETS, "dungeon-assets-sheet.png")
        # Mirrors make_dungeon_materials.py. Two traps, both already paid for once:
        #   1. The prompt ends "modify no existing file", so on a re-run Codex generates the image
        #      and then refuses to copy it over the sheet already on disk — exit 17, which looks
        #      exactly like a generation failure and is not one. Clear the destination first.
        #   2. `os.path.exists` is NOT evidence of generation; on a re-run the OLD sheet satisfies
        #      it and the split silently re-cuts stale art. Hash before and after instead.
        before = hashlib.md5(open(p, "rb").read()).hexdigest() if os.path.exists(p) else None
        if before is not None:
            os.replace(p, p + ".prev")
        r = subprocess.run(["codex", "exec", "-m", MODEL, "--skip-git-repo-check", sheet_prompt()],
                           cwd=ROOT, capture_output=True, text=True, timeout=900)
        after = hashlib.md5(open(p, "rb").read()).hexdigest() if os.path.exists(p) else None
        if after is None or after == before:
            if before is not None and not os.path.exists(p):
                os.replace(p + ".prev", p)          # put the old sheet back; nothing was made
            print(f"sheet: NOT PRODUCED (unchanged: {after == before})   rc={r.returncode}")
            print("---- codex stdout ----\n" + (r.stdout or "")[-2500:])
            print("---- codex stderr ----\n" + (r.stderr or "")[-1500:])
            raise SystemExit("REFUSING to split a stale sheet")
        # The sheet is a SOURCE — an image tool produced it, so there is nothing to re-derive it
        # from. Its record pins the codex run that made it, which is what makes "never adopt an
        # artefact you cannot trace to your own run" a recorded fact instead of a memory.
        # generator=None ON PURPOSE. The script did not draw these pixels — codex's image_gen
        # did — so pinning the script's hash makes every unrelated edit to this file report the
        # sheet STALE, which is a false alarm on a SOURCE that cannot be re-derived anyway. The
        # run and the prompt are what identify it; MODIFIED still catches an unstamped overwrite.
        prov.stamp(p, inputs=[], generator=None, params={"model": MODEL},
                   extra={"generatedBy": "codex image_gen", "prompt": sheet_prompt()})
        print("sheet: written")
    split_sheet()



# ── master-resolution access ─────────────────────────────────────────────────────────────────

_SHEET: np.ndarray | None = None


def sprite_at(name: str, target: int) -> Image.Image | None:
    """Key, crop and scale a prop straight from the sheet to `target` px on its long side.

    ONE resample from full source detail. `split_sheet()` bakes 41px thumbnails, so anything that
    needed the prop at master resolution was upscaling a thumbnail — which is exactly how a prop
    ends up carrying a different pixel density from the background it sits on.
    """
    global _SHEET
    idx = {n: i for i, (n, _) in enumerate(CELLS)}
    if name not in idx:
        return None
    if _SHEET is None:
        p = os.path.join(ASSETS, "dungeon-assets-sheet.png")
        if not os.path.exists(p):
            return None
        _SHEET = np.asarray(Image.open(p).convert("RGB"))
    H, W = _SHEET.shape[:2]
    ch, cw = H // 3, W // 3
    i = idx[name]
    rgba = key_out(_SHEET[(i // 3) * ch:(i // 3 + 1) * ch, (i % 3) * cw:(i % 3 + 1) * cw])
    ys, xs = np.nonzero(rgba[..., 3] > 12)
    if len(ys) == 0:
        return None
    crop = rgba[ys.min():ys.max() + 1, xs.min():xs.max() + 1]
    h, w = crop.shape[:2]
    s = target / max(h, w)
    return Image.fromarray(crop).resize((max(1, round(w * s)), max(1, round(h * s))),
                                        Image.Resampling.LANCZOS)


if __name__ == "__main__":
    main()
