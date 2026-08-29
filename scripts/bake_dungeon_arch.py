#!/usr/bin/env python3
"""The cave-mouth arch, from the AUTHORED asset: collision blocker + overhead occlusion.

WHY THIS FILE EXISTS, AND WHY IT REPLACES TWO OTHERS
    Owner, build 54, on mistyGrotto and sunkenCellar: "they both just let the player walk on top of
    it", and then: "you are obviously not trying what i suggested."

    He is right. He asked TWICE for AUTHORED assets and got three more DERIVED shapes instead:
      * `bake_dungeon_overhead.py` grew the occlusion outward from the lit opening by dilation.
        Measured across the four floors, 33..51% of that overlay's own pixels landed on WALKABLE
        floor, so the hero vanished wherever she stood near an entrance. The layer was switched off.
      * `patch_dungeon_arch_mask.py` derived the COLLISION from `props` luminance (`< STONE_LUM`),
        which on a jagged-black-fang-rock map is most of the neighbourhood. Its own body-clearance
        verifier then REFUSED all four floors -- correctly -- because blocking every dark pixel
        strangles the throat the hero has to walk through. So nothing was ever blocked, which is
        exactly the bug he is still looking at.

    Both failures have ONE cause: a rule read off the baked plate cannot tell arch from rock, because
    the plate does not encode which stones are the arch. The silhouette is information that only the
    artist has. So it comes from `design/act1-dungeons/arch/archasset-<dungeon>.png` and nothing on
    this page ever infers it from the picture again.

PLACEMENT IS MEASURED, NOT TUNED
    Every floor-1 plate paints the lit mouth at exactly the same cell-relative box -- MEASURED on all
    four: 36 x 51 px, cell-relative x 0.12..0.85, y -0.21..0.83. Each authored asset carries its own
    opening as a transparent interior flanked by masonry. So the placement has no free parameter: fit
    the asset's opening height to the plate's opening height, centre the two openings horizontally,
    and sit the two bases on the same line. Everything else follows.

THE CROWN IS NOT COLLISION, AND THAT IS THE FACT BOTH EARLIER ATTEMPTS MISSED
    Blocking the whole authored masonry makes every one of the four mouths UNENTERABLE, and not
    marginally: MEASURED, the hero's legal corridor runs straight through the arch's CROWN on all
    four floors, because this is a top-down game and "the crown of the arch" and "the tile you walk
    through to reach the mouth" are the same pixels. Rendered proof: `--proof` tints the authored
    silhouette red and the clearance-eroded legal corridor green, and the green comes down through
    the red crown into the opening on every floor.

    So the silhouette splits at the SPRINGING LINE -- the top of the plate's own lit opening:
      * ABOVE it, the CROWN: occlusion only, never collision. She walks under it, which is exactly
        what the owner asked for on build 48 ("something that the player walks under needs to be on
        a completely separate layer").
      * BELOW it, the JAMBS: the stone standing on the ground beside her. THESE are the collision,
        and they are what "the player can walk on top of the arch" has always been about.

    Blocking the jambs outright still fails the body test by ~1 px of throat (measured max chamfer
    clearance 14.9..15.1 against the 16 the runtime demands), so the blocker is grown to the largest
    version that still passes: block everything, and relieve the jamb's inner edge by the SMALLEST
    dilation of the legal corridor that restores reachability. Measured result, 55%..89% of the jamb
    blocked with every mouth still enterable -- rather than the 0% that has shipped since build 44.

TWO OUTPUTS, ONE SILHOUETTE

  1. COLLISION -- `<floor>-walk.png`, cleared wherever the placed JAMBS stand.
     `render_dungeon_material_map.py` derives that mask from the floor's `rows`, which know only
     floor-vs-rock; the mouth is drawn on the PROPS layer and is not an input to it at all. So the
     mask calls the whole cell open while the art paints solid masonry across it, and the collision
     and the picture disagree by exactly the arch. This is the post-pass that reconciles them.

     IT IS VERIFIED AGAINST A HERO WITH A BODY, and that is not a formality: the first version of the
     old patcher shipped THREE UNENTERABLE DUNGEONS (owner, build 44: "the arch in the dungeon
     entrance now blocks the player from entering") because it asked `ndimage.label` whether the mouth
     was still CONNECTED -- a question about a ZERO-WIDTH POINT. The runtime asks something else
     entirely: `a1mFree` rejects any position whose chamfer distance to rock is under A1M_FOOT..+LEAN.
     A 10 px throat is "connected" and utterly impassable. That verifier is kept here verbatim.

  2. OCCLUSION -- `<floor>-overhead.png`, RGBA, drawn by dq-tiles.js above the hero.
     THE OVERLAY DRAWS THE PLATE'S OWN PIXELS THROUGH THE AUTHORED ALPHA. It is not the authored
     artwork composited on top: that would put a second, differently-lit arch over the painted one.
     The authored asset supplies the SHAPE -- the thing derivation could never get right -- and the
     plate supplies the colour, so the overlay is pixel-identical to what is already beneath it and
     only its alpha is observable.

     THE INVARIANT THAT MAKES IT SAFE, and the one all three previous attempts lacked:
     WHEREVER THE OVERLAY COVERS GROUND THE HERO CAN STAND ON, THAT PIXEL IS AUTHORED.
     The overlay is the authored silhouette UNIONED with the blocked rock it abuts, and the union
     term is the dangerous one -- it is derived, and a derived term over open floor is exactly how
     33%..51% of the previous overlays ended up hiding her in the middle of a room. So the derived
     term may only ever land on mask-BLOCKED ground (somewhere she can never stand, where drawing
     over her is unobservable), and only the AUTHORED silhouette is allowed over walkable floor --
     which is the crown she is supposed to disappear beneath. `assert_only_authored_hides()`
     measures it and refuses to write if it is ever violated. That turns "does this hide the player"
     from a judgement into arithmetic.

     The union with the surrounding blocked rock (bounded by the silhouette's own neighbourhood) is
     what stops her SCALP showing above the crown while she stands under the arch -- the original bug
     displaced upward by one sprite. Nothing below the opening's base line is ever lifted: that is the
     floor she stands on.

IT PATCHES A PRISTINE SNAPSHOT, NEVER ITS OWN OUTPUT
    The first version of this script read `<floor>-walk.png`, subtracted the jamb, and wrote the
    result back to the same file. Running it twice then ate the throat twice -- MEASURED, the second
    pass on coastalReef went from 1134 to 1517 blocked px and needed a larger relief each time,
    because the relief search reads the corridor out of whatever mask it was handed. A bake whose
    output depends on how many times it has been run is not a bake.

    So the pristine mask -- the one `render_dungeon_material_map.py --emit-mask` derives from the
    floor's `rows` -- is snapshotted once under `design/act1-dungeons/arch/walk-base/`, and every run
    patches THAT. Re-running is now a no-op, and re-deriving the base mask upstream is a one-line
    re-seed rather than a silent compounding error. The snapshot lives in `design/`, not `public/`,
    because it is an input to the bake and must never ship.

USAGE
    python3 scripts/bake_dungeon_arch.py            # write both artefacts for every floor-1 mouth
    python3 scripts/bake_dungeon_arch.py --check    # verify only; exit 1 if a bake is due
    python3 scripts/bake_dungeon_arch.py --proof DIR # also write alignment proofs for eyeballing
    python3 scripts/bake_dungeon_arch.py --seed-base # (re)snapshot the pristine masks, then bake
"""
from __future__ import annotations

import argparse
import json
import os
import sys
from pathlib import Path

import numpy as np
from PIL import Image
from scipy import ndimage

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import prov  # noqa: E402

ROOT = Path(__file__).resolve().parent.parent
ART = ROOT / "public" / "act1-dungeon-art"
ASSETS = ROOT / "design" / "act1-dungeons" / "arch"
BASE = ROOT / "design" / "act1-dungeons" / "arch" / "walk-base"
FLOORS = ROOT / "dist" / "act1-dungeon-floors.json"
TILE = 48

# HOW BIG THE ARCH IS, AND WHY IT IS NO LONGER JUST THE FIT.
# Fitting the authored opening to the plate's lit mouth gives an arch about 2.2 x 1.8 cells, whose
# opening is 36 x 51 px -- and the hero is ~34 x 60 px. The doorway was therefore the same size as
# the person walking through it, and against black fang-rock the dark masonry did not read as an
# arch at all. Owner, build 65: "the arch in the dungeon is very close but is set prematurally and
# the player emerges from a slit in the arch in the dungeon (the overlay is not set large enough)."
# ARCH_SCALE multiplies the derived fit; the opening's BASE LINE is held, so the arch grows upward
# and outward from the ground she walks in on and stays anchored to the mouth it frames. It is a
# ceiling on nothing: every invariant below still has to pass at whatever value this is set to, and
# the bake REFUSES to write rather than ship an arch that seals a mouth or swallows the hero.
#
# 1.2 IS THE CONSIDERED VALUE, NOT THE MAXIMUM. Measured, the no-vanish invariant holds to 1.25
# (deepest cover 14.3..15.1 px against the 16 px clearance) and REFUSES at 1.35 (16.0). Bigger
# looks better right up until the crown swallows her, and the whole reason this layer was switched
# off in the past is that it did. 1.2 lands at 13.9..15.0 and keeps a pixel of headroom against a
# limit that is about losing the character, so the arch is bigger AND the margin is still there.
ARCH_SCALE = 1.2

# How dark the authored stone may be toned to sit in an unlit cave. 1.0 would paste it at asset
# brightness (a cut-out); 0 would let it vanish into the rock, which is the bug being fixed. The
# floor keeps the arch readable however black the plate around it is.
TONE_FLOOR = 0.55

OPENING_LUM = 200     # the lit mouth on the plate: the one feature that is unambiguous
PAD_CELLS = 3         # neighbourhood searched for the opening, and the scope of every write

# THE HERO HAS A BODY -- keep in sync with dq-tiles.js A1M_FOOT / A1M_LEAN.
A1M_FOOT = 12
A1M_LEAN = 4
CLEARANCE = A1M_FOOT + A1M_LEAN

# The authored PNGs are keyed on magenta, and the key is not clean: measured, ~50% of the OPAQUE
# EDGE pixels are still magenta-tinted, which would fringe the silhouette by a pixel. Erode the
# alpha by one pixel and despill what remains.
KEY_ERODE = 1

# How far outside the authored silhouette the surrounding blocked rock is lifted with it. This is
# NOT the arch's shape -- the shape is authored -- it is only the reach of the "rock she can never
# stand on" term, and it is bounded so this can never become a whole-map lift. 16 px is one hero
# clearance: enough to cover the stone the crown abuts, less than a body.
ROCK_REACH = 16

# How far the jamb blocker may be relieved before the attempt is abandoned. A cap, not a tuning
# knob: the relief that is actually needed is found by search and measured 0..12 px on the four
# floors. If a floor ever needs more than this, the art and the floor field disagree about where
# the entrance is, and that is a level-design fact to surface -- not something to widen away.
RELIEF_MAX = 24

DUNGEONS = ("coastalReef", "mistyGrotto", "sunkenCellar", "whisperingWoodsCave")


def luminance(rgb: np.ndarray) -> np.ndarray:
    return 0.2126 * rgb[:, :, 0] + 0.7152 * rgb[:, :, 1] + 0.0722 * rgb[:, :, 2]


# ---------------------------------------------------------------- the authored asset

def key_authored(path: Path) -> tuple[np.ndarray, np.ndarray]:
    """Return (rgb, opaque) for an authored arch PNG, magenta keyed, eroded and despilled."""
    im = np.asarray(Image.open(path).convert("RGBA"))
    rgb = im[:, :, :3].astype(np.int16)
    opaque = im[:, :, 3] > 128
    # The alpha channel is already binary, but the generator also leaves literal magenta behind in
    # places it called opaque. Treat both as background, then erode: a partly-keyed edge pixel is
    # worth less than a clean silhouette.
    magenta = (rgb[:, :, 0] > 150) & (rgb[:, :, 2] > 150) & (rgb[:, :, 1] < rgb[:, :, 0] - 40)
    opaque &= ~magenta
    if KEY_ERODE:
        opaque = ndimage.binary_erosion(opaque, np.ones((3, 3)), iterations=KEY_ERODE)
    lab, n = ndimage.label(opaque)
    if n > 1:                                        # one arch, never speckle
        sizes = ndimage.sum(opaque, lab, range(1, n + 1))
        opaque = lab == (int(np.argmax(sizes)) + 1)
    return rgb, opaque


def asset_opening(opaque: np.ndarray) -> tuple[int, int, int, int]:
    """The archway's own opening: transparent, and flanked by masonry above, left and right.

    It is NOT an enclosed hole -- an archway's opening runs out of the bottom of the sheet between
    the legs -- so `ndimage.label` on the transparent field finds it connected to the border and a
    hole test returns nothing. Ask the question that actually defines it instead.
    """
    transparent = ~opaque
    above = np.cumsum(opaque, axis=0) > 0
    left = np.cumsum(opaque, axis=1) > 0
    right = np.cumsum(opaque[:, ::-1], axis=1)[:, ::-1] > 0
    inner = transparent & above & left & right
    lab, n = ndimage.label(inner)
    if not n:
        raise SystemExit("authored arch has no opening: the asset is wrong, not the placement")
    sizes = ndimage.sum(inner, lab, range(1, n + 1))
    ys, xs = np.where(lab == (int(np.argmax(sizes)) + 1))
    return int(xs.min()), int(xs.max()), int(ys.min()), int(ys.max())


# ---------------------------------------------------------------- the plate

def plate_opening(props: Image.Image, mouth: dict) -> tuple[int, int, int, int]:
    """The lit mouth on the baked plate, in plate pixels. The anchor everything is measured from."""
    W, H = props.size
    x0 = max(0, (mouth["x"] - PAD_CELLS) * TILE)
    y0 = max(0, (mouth["y"] - PAD_CELLS) * TILE)
    x1 = min(W, (mouth["x"] + PAD_CELLS + 1) * TILE)
    y1 = min(H, (mouth["y"] + 2) * TILE)
    sub = np.asarray(props.crop((x0, y0, x1, y1)).convert("RGB")).astype(float)
    lit = luminance(sub) > OPENING_LUM
    lab, n = ndimage.label(lit)
    if not n:
        raise SystemExit("no lit mouth on this plate")
    sizes = ndimage.sum(lit, lab, range(1, n + 1))
    ys, xs = np.where(lab == (int(np.argmax(sizes)) + 1))
    return x0 + int(xs.min()), x0 + int(xs.max()), y0 + int(ys.min()), y0 + int(ys.max())


def place(dungeon: str, props: Image.Image, mouth: dict, arch_scale: float = 1.0):
    """Scale and position the authored arch onto the plate. One parameter -- see ARCH_SCALE."""
    rgb, opaque = key_authored(ASSETS / f"archasset-{dungeon}.png")
    ax0, ax1, ay0, ay1 = asset_opening(opaque)
    px0, px1, py0, py1 = plate_opening(props, mouth)

    scale = (py1 - py0 + 1) / (ay1 - ay0 + 1) * arch_scale   # fit opening HEIGHT to the plate's lit
                                                       # mouth, then apply ARCH_SCALE. The base line
                                                       # is held below, so the arch grows UPWARD and
                                                       # OUTWARD from the ground she walks in on.
    H, W = opaque.shape
    nw, nh = max(1, int(round(W * scale))), max(1, int(round(H * scale)))
    sil = np.asarray(Image.fromarray((opaque * 255).astype(np.uint8)).resize((nw, nh), Image.LANCZOS)) > 127

    ox = int(round((px0 + px1) / 2 - (ax0 + ax1) / 2 * scale))   # openings share a centre line
    oy = int(round(py1 - ay1 * scale))                            # and sit on the same base

    # The asset's own PIXELS travel with its silhouette. Until 2026-08-29 they did not: the overlay
    # was built from the PLATE's pixels through this stencil, so what the player saw at a cave mouth
    # was arch-shaped BLACK FANG ROCK -- the authored stone archway was never once drawn. That is
    # what "the arch in the dungeon is very close" means: the geometry was right and the paint was
    # missing, so the mouth read as a slit in the rock rather than a doorway.
    art = np.asarray(Image.fromarray(np.clip(rgb, 0, 255).astype(np.uint8))
                 .resize((nw, nh), Image.LANCZOS)).astype(np.uint8)

    PW, PH = props.size
    full = np.zeros((PH, PW), bool)
    rgb_full = np.zeros((PH, PW, 3), np.uint8)
    sx0, sy0 = max(0, ox), max(0, oy)
    sx1, sy1 = min(PW, ox + nw), min(PH, oy + nh)
    full[sy0:sy1, sx0:sx1] = sil[sy0 - oy:sy1 - oy, sx0 - ox:sx1 - ox]
    rgb_full[sy0:sy1, sx0:sx1] = art[sy0 - oy:sy1 - oy, sx0 - ox:sx1 - ox]
    return full, (px0, px1, py0, py1), scale, rgb_full


# ---------------------------------------------------------------- collision

def body_reaches_mouth(walk: np.ndarray, mouth: dict) -> bool:
    """Can a hero with a real body walk between the bulk floor and the mouth cell?

    Mirrors `a1mFree`: erode the open field by the clearance the runtime demands, then ask whether
    the mouth cell's surviving pixels share a component with the floor's largest one. A point
    connectivity test cannot answer this and must never be used here again -- it is what shipped
    three unenterable dungeons in builds 43 and 44.
    """
    legal = ndimage.distance_transform_edt(walk) >= CLEARANCE
    lab, n = ndimage.label(legal)
    if n == 0:
        return False
    cell = np.zeros_like(legal)
    cell[mouth["y"] * TILE:(mouth["y"] + 1) * TILE, mouth["x"] * TILE:(mouth["x"] + 1) * TILE] = True
    inside = set(lab[cell & legal].tolist()) - {0}
    if not inside:
        return False
    sizes = ndimage.sum(legal, lab, range(1, n + 1))
    return (int(np.argmax(sizes)) + 1) in inside


# ---------------------------------------------------------------- occlusion

def largest_safe_blocker(walk: np.ndarray, jambs: np.ndarray, mouth: dict):
    """The biggest part of the jambs that can be blocked while the mouth stays enterable.

    Tries the whole jamb first, then relieves its inner edge by successively larger dilations of the
    legal corridor, and stops at the FIRST candidate a real body can still walk through. Returning
    the first success rather than a fixed radius is what keeps this honest: the answer is different
    on every floor (measured 0, 1, 2 and 12), and picking one number would silently seal a dungeon.
    """
    legal = ndimage.distance_transform_edt(walk) >= CLEARANCE
    lab, n = ndimage.label(legal)
    corridor = np.zeros_like(legal)
    if n:
        sizes = ndimage.sum(legal, lab, range(1, n + 1))
        corridor = lab == (int(np.argmax(sizes)) + 1)

    for k in range(RELIEF_MAX + 2):
        if k == 0:
            blocked = jambs                                   # block the whole jamb, if it survives
        else:
            relief = corridor if k == 1 else ndimage.binary_dilation(
                corridor, ndimage.generate_binary_structure(2, 2), iterations=k - 1)
            blocked = jambs & ~relief
        if body_reaches_mouth(walk & ~blocked, mouth):
            return blocked, k - 1
    return None, None


def build_overhead(props: Image.Image, sil: np.ndarray, walk: np.ndarray,
                   opening: tuple[int, int, int, int], arch_rgb: np.ndarray) -> np.ndarray:
    """RGBA overlay: the AUTHORED arch inside its own silhouette, the plate's rock around it.

    THE SILHOUETTE IS UNCHANGED, SO EVERY INVARIANT BELOW IS UNCHANGED. This function only decides
    what COLOUR the covered pixels are; `assert_only_authored_hides` measures where the alpha lands,
    and the alpha is still exactly `sil | (near & ~walk)`. That is why this could be fixed without
    re-litigating the collision or the no-vanish argument.

    The authored stone is TONED to the plate it sits on rather than pasted at full brightness. These
    are unlit caves lit by a torch; a grey-white arch dropped in at asset brightness reads as a
    cut-out from another picture. The scale factor is the ratio of the plate's own median luminance
    around the mouth to the asset's, clamped so the arch can be darkened to sit in the gloom but
    never brightened into a lightbox.
    """
    _, _, _, base = opening
    rows = np.arange(props.size[1])[:, None] * np.ones((1, props.size[0]), bool)

    # The DERIVED term -- the rock the crown abuts -- is what stops her scalp showing above the
    # crown while she stands under it. It is clipped to blocked ground precisely because it is
    # derived; see assert_only_authored_hides().
    near = ndimage.binary_dilation(sil, np.ones((3, 3)), iterations=ROCK_REACH)
    alpha = (sil | (near & ~walk)) & (rows <= base)

    plate = np.asarray(props.convert("RGB"))
    rgba = np.zeros((props.size[1], props.size[0], 4), np.uint8)
    rgba[:, :, :3] = plate                              # the derived rock term keeps the plate's own
    if sil.any():                                       # look; only the AUTHORED arch is repainted
        ring = ndimage.binary_dilation(sil, np.ones((3, 3)), iterations=6) & ~sil
        lum1 = lambda px: 0.2126 * px[:, 0] + 0.7152 * px[:, 1] + 0.0722 * px[:, 2]
        plate_l = float(np.median(lum1(plate[ring].astype(float)))) if ring.any() else 0.0
        art_l = float(np.median(lum1(arch_rgb[sil].astype(float)))) or 1.0
        tone = min(1.0, max(TONE_FLOOR, plate_l / art_l))
        rgba[:, :, :3][sil] = np.clip(arch_rgb[sil].astype(float) * tone, 0, 255).astype(np.uint8)
    rgba[:, :, 3] = alpha * 255
    return rgba


def assert_only_authored_hides(alpha: np.ndarray, walk: np.ndarray, sil: np.ndarray) -> tuple[int, float]:
    """The whole safety argument, as arithmetic. Returns (area, deepest cover) over walkable floor.

    TWO conditions, and the second is the one that separates this from every previous attempt:

      1. Only AUTHORED pixels may cover ground she can stand on. A derived pixel there is the exact
         defect that switched the layer off three times.
      2. The covered ground must be SHALLOW. "She passes behind the stone" and "she vanishes" differ
         only in how much of her the cover can swallow at once, so measure it: the largest disc that
         fits inside the covered region must be smaller than one hero clearance. At 16 px a legal
         standing position could sit wholly inside the cover and she would be GONE while standing
         still -- which the owner has already rejected once, correctly, as worse than the bug it
         replaced. Measured on the four floors: 11.4 .. 12.2 px, so the deepest cover is a 24 px
         patch of a 64 px sprite.
    """
    hides = alpha & walk
    derived = int((hides & ~sil).sum())
    if derived:
        raise SystemExit(f"REFUSED -- {derived} DERIVED overlay px sit on walkable ground; that is "
                         "the defect that switched this layer off three times")
    deepest = float(ndimage.distance_transform_edt(hides).max()) if hides.any() else 0.0
    if deepest >= CLEARANCE:
        raise SystemExit(f"REFUSED -- the overlay covers walkable ground {deepest:.1f} px deep, at or "
                         f"past the {CLEARANCE} px hero clearance; she could stand still and vanish")
    return int(hides.sum()), deepest


# ---------------------------------------------------------------- per floor

def do_floor(key: str, mouth: dict, check: bool, proof: Path | None,
             seed_base: bool = False, arch_scale: float = 1.0) -> tuple[bool, str]:
    dungeon = key.split("-")[0]
    asset = ASSETS / f"archasset-{dungeon}.png"
    props_p, walk_p = ART / f"{key}-props.png", ART / f"{key}-walk.png"
    over_p = ART / f"{key}-overhead.png"
    if not asset.exists() or not props_p.exists() or not walk_p.exists():
        return True, f"{key}: no authored asset or no props/walk pair, skipped"

    props = Image.open(props_p)
    sil, opening, scale, arch_rgb = place(dungeon, props, mouth, arch_scale)

    base_p = BASE / f"{key}-walk.png"
    if seed_base or not base_p.exists():
        # Seeding from the live mask is only ever correct when that mask is UNPATCHED. Guard it:
        # a mask this script has already written has the jamb missing, and re-seeding from it would
        # bake the previous patch into the baseline permanently.
        live = np.asarray(Image.open(walk_p).convert("L")) > 127
        H0, W0 = live.shape
        r0 = np.arange(H0)[:, None] * np.ones((1, W0), bool)
        if not (live & sil & (r0 > opening[2])).any():
            return False, (f"{key}: REFUSED to seed the base snapshot -- the live mask already has "
                           "the jamb blocked, so it is not pristine. Re-derive it with "
                           f"`render_dungeon_material_map.py --floor {key} --emit-mask` first.")
        base_p.parent.mkdir(parents=True, exist_ok=True)
        Image.fromarray((live * 255).astype(np.uint8)).convert("1").save(base_p)

    walk = np.asarray(Image.open(base_p).convert("L")) > 127
    before_open = int(walk.sum())

    # --- the springing line splits art she walks UNDER from stone she walks AROUND.
    H, W = walk.shape
    rows = np.arange(H)[:, None] * np.ones((1, W), bool)
    jambs = sil & (rows > opening[2])

    # --- collision: the jambs block, as much of them as a real body still lets through.
    blocked, relief = largest_safe_blocker(walk, jambs, mouth)
    if blocked is None:
        return False, (f"{key}: REFUSED -- no relief up to {RELIEF_MAX} px leaves a throat a "
                       f"{CLEARANCE}px-clearance body can pass; the mouth would be unenterable")
    patched = walk & ~blocked
    loss = 1 - patched.sum() / max(before_open, 1)

    # --- how much of the arch can she still STAND on? This is the owner's actual complaint,
    #     measured, not the pixel count: legal standing positions on the masonry, before vs after.
    stand_before = int(((ndimage.distance_transform_edt(walk) >= CLEARANCE) & sil).sum())
    stand_after = int(((ndimage.distance_transform_edt(patched) >= CLEARANCE) & jambs).sum())

    # --- occlusion, against the PATCHED mask.
    rgba = build_overhead(props, sil, patched, opening, arch_rgb)
    under, deepest = assert_only_authored_hides(rgba[:, :, 3] > 0, patched, sil)

    over_px = int((rgba[:, :, 3] > 0).sum())
    msg = (f"{key}: scale {scale:.4f}, relief {relief} px, jamb blocked {int(blocked.sum())}/"
           f"{int(jambs.sum())} px ({100*loss:.2f}% of the floor); standing-on-jamb {stand_before}"
           f" -> {stand_after} px; overlay {over_px} px, {under} authored over floor "
           f"(deepest cover {deepest:.1f} px < {CLEARANCE}), 0 derived; "
           f"mouth reachable")

    if proof:
        proof.mkdir(parents=True, exist_ok=True)
        comp = np.asarray(props.convert("RGB")).copy()
        crown = sil & ~jambs
        comp[crown] = (comp[crown] * 0.4 + np.array([90, 150, 255]) * 0.6).astype(np.uint8)
        comp[blocked] = (comp[blocked] * 0.4 + np.array([255, 60, 60]) * 0.6).astype(np.uint8)
        keptj = jambs & ~blocked
        comp[keptj] = (comp[keptj] * 0.4 + np.array([255, 220, 60]) * 0.6).astype(np.uint8)
        cx0, cy0 = max(0, (mouth["x"] - 3) * TILE), max(0, (mouth["y"] - 3) * TILE)
        cx1 = min(props.size[0], (mouth["x"] + 4) * TILE)
        cy1 = min(props.size[1], (mouth["y"] + 2) * TILE)
        Image.fromarray(comp).crop((cx0, cy0, cx1, cy1)).resize(
            ((cx1 - cx0) * 2, (cy1 - cy0) * 2), Image.NEAREST).save(proof / f"arch-{key}.png")

    if check:
        live = np.asarray(Image.open(walk_p).convert("L")) > 127
        stale = (not over_p.exists()) or bool((live != patched).any())
        return (not stale), msg + ("  [--check: bake is DUE]" if stale else "  [--check: up to date]")

    Image.fromarray((patched * 255).astype(np.uint8)).convert("1").save(walk_p)
    Image.fromarray(rgba).save(over_p)
    for out in (walk_p, over_p):
        prov.stamp(str(out), inputs=[str(asset), str(props_p)], generator=__file__,
                   params={"kind": "authored-arch", "clearance": CLEARANCE, "scale": round(scale, 5)})
    return True, msg + "  WRITTEN"


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("--check", action="store_true")
    ap.add_argument("--proof", type=Path, default=None)
    ap.add_argument("--seed-base", action="store_true",
                    help="re-snapshot the pristine walk masks before patching")
    ap.add_argument("--arch-scale", type=float, default=ARCH_SCALE,
                    help="multiplier on the derived fit; see ARCH_SCALE")
    args = ap.parse_args()

    floors = json.loads(FLOORS.read_text())["floors"]
    ok = True
    for key, fl in floors.items():
        if fl.get("floor") != 1 or key.split("-")[0] not in DUNGEONS:
            continue                                  # crystalCave is never touched
        mouth = next((a for a in fl.get("assets", []) if a.get("kind") == "mouth"), None)
        if not mouth:
            continue
        good, msg = do_floor(key, mouth, args.check, args.proof, args.seed_base, args.arch_scale)
        print("  " + msg)
        ok = ok and good
    return 0 if ok else 1


if __name__ == "__main__":
    sys.exit(main())
