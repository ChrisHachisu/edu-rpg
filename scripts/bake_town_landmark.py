#!/usr/bin/env python3
"""Bake a town's 192px OVERWORLD sprite from its finished town plate, so the two agree.

WHY THIS EXISTS. `design/LANDMARK-SPRITE-CONTRACT.md`, owner amendment 2026-08-01: *"we need to fix
the overworld asset to match the town design"*, and the binding rule became CONSISTENCY WITH THE
TOWN SCREEN rather than enclosure. The shipped village sprites do not honour it. Both
`millbrook.png` and `greenhollow.png` show the tall timber palisade and dark packed-earth yard of
the plan-primed design the owner scrapped, against repainted towns that have a LOW stone-and-timber
fence and pale cobble lanes. That is a content difference, not a palette one, so regrading them
cannot fix it and they are regenerated.

THE PLATE IS THE ANCHOR, NOT THE STYLE DOC. `memory/feedback_art_brief_from_measured_anchor.md`:
every redo so far traced to a stale or wrong-family style block. ART-DIRECTION.md's ENVIRONMENT
STYLE BLOCK is one of the blocks its own text flags as having mis-driven a generation -- it asks for
"dark, dense, deep forest shadows", which is the opposite of the theme the owner just picked. So the
brief carries NO pasted style block. It carries the town's own finished plate as the visual input
and tells the model to match it.

PROJECTION IS THE ONE THING THAT CHANGES. The plate is straight top-down; the sprite is a 3/4
diorama on a rounded ground pad, because that is what the other Act 1 sprites are and what the
compositor's measured anchor expects. So the plate is a CONTENT reference -- these buildings, these
roofs, this fence, this palette -- and never a layout to trace.

ONE ENTRANCE, AND IT MUST LINE UP. Owner 2026-08-17, asked directly whether "one entrance on both
ends" meant one total or one per end: *"one entrance in the overworld and the town."* The sprite's
gate is therefore on the same side as the town screen's door -- SOUTH for millbrook and greenhollow,
NORTH for Port Sapphire, whose south face is harbour and whose sea is the wall.

Transparency is chroma-keyed, not generated: the tool returns opaque RGB, so the sprite is drawn on
pure magenta and `scripts/key_landmark_sprite.py` keys it out and feathers 1 px.
"""
from __future__ import annotations
import argparse, os, subprocess, time
import numpy as np
from PIL import Image

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
GEN = 1254
CANVAS = 192                 # town sprite, 4x4 cells at 48 px -- contract "Geometry"
MODEL = "gpt-5.6-sol"
MAGENTA = (255, 0, 255)

TOWNS = {
    "millbrook":    dict(gate="SOUTH", ident="a mill village: a working watermill with a big wooden "
                                             "wheel, cottages with steep shingled roofs in slate "
                                             "blue, terracotta, green, purple and gold thatch, a "
                                             "covered market stall, and a stone well in the yard",
                         perimeter="a LOW stone-and-timber fence, waist height, NOT a tall palisade"),
    "greenhollow":  dict(gate="SOUTH", ident="a forest village under a rock outcrop: stone-and-"
                                             "timber cottages with slate blue and terracotta roofs, "
                                             "a market stall under a blue-and-white striped awning, "
                                             "a herbalist's cottage, and a stone well in the yard",
                         perimeter="a LOW timber rail fence, waist height, NOT a tall palisade"),
    "portSapphire": dict(gate="NORTH", ident="a harbour town: cottages around a stone well, a market "
                                             "stall under a striped awning, and along the SOUTH edge "
                                             "a working waterfront of timber jetties, moored rowing "
                                             "boats, crates and mooring posts",
                         perimeter="no wall on the south side, where the sea is the boundary"),
}
SLUG = {"portSapphire": "port-sapphire", "millbrook": "millbrook", "greenhollow": "greenhollow"}

BRIEF = """DO THIS YOURSELF, one generation call, do not dispatch a sub-agent. Produce the image
and stop.

Draw ONE small town as a 3/4 top-down diorama, in hand-drawn hard-edged pixel art, standing alone
on a field of PURE MAGENTA (255,0,255).

THE INPUT IMAGE IS THE TOWN ITSELF, seen straight down. It is your reference for WHAT THIS PLACE IS
MADE OF -- its buildings, its roof colours, its fence, its paving, its grass, its light. Match all of
that exactly. It is NOT a layout to trace: you are drawing the same town from a slightly tilted 3/4
view, compact enough to read at a glance, so roofs and building fronts are both visible.

THIS TOWN IS {ident}.

THE PERIMETER: {perimeter}.

ONE ENTRANCE ONLY, on the {gate} side, and it must read unmistakably as the way in -- a gap in the
fence with posts and an open gateway, with the lane running out through it. The perimeter is
continuous everywhere else. Do not draw a second gate.

THE GROUND PAD. The town sits on a rounded pad of its own ground -- grass and the pale paving of its
lanes -- whose edge fades naturally into the magenta. No hard circular cut, no plinth, no floating.
Cast a short contact shadow down and to the RIGHT beneath the buildings and the pad, so it will sit
on terrain rather than float above it.

MAGENTA IS THE BACKGROUND AND NOTHING ELSE. Use no magenta, pink, violet or plum anywhere in the
artwork -- it is keyed out to transparency, so any magenta inside the town punches a hole in it.

LIGHT AND PALETTE. One upper-left sun, short soft shadows, warm late-morning daylight, exactly as in
the input. Reproduce its greens, its paving and its roof colours; do not darken, brighten, warm or
cool them.

THE FINISH. Crisp definite boundaries between materials. Shading in discrete flat steps, two or
three values per material, dithering where a transition is needed. Individual roof tiles, individual
cobbles, individual fence posts, distinct leaf clumps. No airbrushed gradients, no blur, no bloom,
no soft focus, no photographic texture.

FORBIDDEN: people, animals, banners, signage, text, labels, UI, health bars, any border or frame.

OUTPUT: one RGB PNG. Print its absolute path on a line of its own. Do not delete it and do not write
anywhere under /tmp.
"""


def primer(plate_p: str) -> Image.Image:
    """The plate, inset on magenta. The inset is what tells the model the sprite does not bleed to
    the canvas edge -- the pad has to end inside the frame or the keyed sprite has no skirt."""
    plate = Image.open(plate_p).convert("RGB")
    pr = Image.new("RGB", (GEN, GEN), MAGENTA)
    k = int(GEN * 0.82)
    pr.paste(plate.resize((k, k), Image.LANCZOS), ((GEN - k) // 2, (GEN - k) // 2))
    return pr


def image_dirs():
    """Per-call uuid subdirs of ~/.codex/generated_images -- see rebake_town_tiles.image_dirs."""
    root = os.path.expanduser("~/.codex/generated_images")
    return {e.path for e in os.scandir(root) if e.is_dir()} if os.path.isdir(root) else set()


def best_since(t0, ref_img, only_under=None):
    """Score candidates against the primer, because `codex exec` dispatches sub-agents that redraw
    and the newest file is routinely not the best one. Same mechanism as rebake_town_tiles."""
    roots = sorted(only_under) if only_under else [os.path.expanduser("~/.codex/generated_images")]
    ref = np.asarray(ref_img.convert("L").resize((160, 160), Image.LANCZOS), np.float32).ravel()
    ref -= ref.mean()
    rn = np.linalg.norm(ref) or 1.0
    out = []
    for _root in roots:
      for d, _, fs in os.walk(_root):
        for f in fs:
            p = os.path.join(d, f)
            if not f.endswith(".png") or os.path.getmtime(p) <= t0:
                continue
            try:
                c = np.asarray(Image.open(p).convert("L").resize((160, 160), Image.LANCZOS),
                               np.float32).ravel()
            except Exception:
                continue
            c -= c.mean()
            out.append((float(ref @ c / (rn * (np.linalg.norm(c) or 1.0))), p))
    out.sort(reverse=True)
    return (out[0][1] if out else None), out


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--town", required=True, choices=sorted(TOWNS))
    ap.add_argument("--plate", help="finished town plate; defaults to the shipped screen")
    ap.add_argument("--dry-run", action="store_true")
    a = ap.parse_args()
    cfg = TOWNS[a.town]
    plate_p = a.plate or os.path.join(ROOT, f"public/act1-hifi/town/{a.town}-screen.png")
    out_dir = os.path.join(ROOT, "design/act1-towns", a.town)
    os.makedirs(out_dir, exist_ok=True)
    pr = primer(plate_p)
    pp = os.path.join(out_dir, "landmark-primer.png")
    pr.save(pp)
    bp = os.path.join(out_dir, "landmark-brief.md")
    open(bp, "w").write(BRIEF.format(**cfg))
    print(f"  {a.town}: primer {pr.size} from {os.path.relpath(plate_p, ROOT)} -> "
          f"{os.path.relpath(pp, ROOT)}")
    if a.dry_run:
        return 0
    t0 = time.time() - 1
    before = image_dirs()
    subprocess.run(["codex", "exec", "-m", MODEL, "--skip-git-repo-check", "-i", pp],
                   stdin=open(bp), capture_output=True, text=True, timeout=2400)
    got, cands = best_since(t0, pr, only_under=(image_dirs() - before) or None)
    if not got:
        print("    FAILED: no image produced")
        return 1
    if len(cands) > 1:
        print(f"    {len(cands)} candidates; corr "
              + ", ".join(f"{c:+.3f}" for c, _ in cands[:6]) + f"  -> keeping {cands[0][0]:+.3f}")
    raw = os.path.join(out_dir, "landmark-raw.png")
    Image.open(got).convert("RGB").save(raw)
    dst = os.path.join(ROOT, "public/act1-hifi/landmarks", f"{SLUG[a.town]}.png")
    r = subprocess.run(["python3", os.path.join(ROOT, "scripts/key_landmark_sprite.py"), raw,
                        "--out", dst, "--size", str(CANVAS)], capture_output=True, text=True)
    print(r.stdout.strip() or r.stderr.strip()[-400:])
    print(f"    raw {os.path.relpath(raw, ROOT)}  ->  {os.path.relpath(dst, ROOT)}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
