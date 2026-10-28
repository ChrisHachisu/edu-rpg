#!/usr/bin/env python3
"""Per-act contact sheets: one 960 px panel per town (plate) + its overlay thumbnail.

    $PREVIEW/act{2,3,4,5}-towns.png
"""
import json
import os
import sys

from PIL import Image, ImageDraw

from build_town import RUNTIME, font
from kitlib import PREVIEW
from layouts import TOWNS

PANEL = 960
THUMB = 300


def sheet(act):
    ids = [t for t, v in TOWNS.items() if v["act"] == act]
    W = len(ids) * (PANEL + 24) + 24
    H = PANEL + THUMB + 150
    bg = (24, 26, 32)
    im = Image.new("RGB", (W, H), bg)
    d = ImageDraw.Draw(im)
    names = {2: "Act 2 - snowy frozen highlands", 3: "Act 3 - desert / oasis",
             4: "Act 4 - volcanic ash", 5: "Act 5 - dark barren endgame"}
    d.text((24, 14), names[act] + "  |  towns kitbashed from the Act 1 plates (design preview)",
           fill=(235, 235, 235), font=font(34))
    for i, t in enumerate(ids):
        x = 24 + i * (PANEL + 24)
        plate = Image.open(os.path.join(RUNTIME, f"{t}-screen.png")).convert("RGB").resize((PANEL, PANEL), Image.LANCZOS)
        im.paste(plate, (x, 64))
        town = json.load(open(os.path.join(RUNTIME, f"{t}-town.json")))
        title = TOWNS[t]["title"] + (" (PROPOSAL - no maps.ts entry)" if town["_design"]["proposal"] else "")
        d.text((x, 64 + PANEL + 10), f"{title}   [{t}]", fill=(255, 225, 140), font=font(30))
        ov = Image.open(os.path.join(PREVIEW, f"{t}-overlay.png")).convert("RGB").resize((THUMB, THUMB), Image.LANCZOS)
        im.paste(ov, (x, 64 + PANEL + 54))
        info = [f"npcs: {', '.join(n['id'] for n in town['npcs'])}",
                f"shop {town['shopCounter']}  save {town['savePoint']}  exit {town['exit']['cell']}",
                f"walkable validator: {town['_validator']}",
                f"unreachable: {town['_unreachable'] or 'none'}",
                f"max actor move from maps.ts: {max(r['moved'] for r in town['_placementReport']):.2f} cells",
                "overlay: green = walkable, red hatch = blocked, yellow = gate"]
        for k, line in enumerate(info):
            d.text((x + THUMB + 16, 64 + PANEL + 60 + k * 34), line, fill=(210, 210, 210), font=font(22))
    out = os.path.join(PREVIEW, f"act{act}-towns.png")
    im.save(out, optimize=True)
    if os.path.getsize(out) > 4_000_000:
        im.quantize(colors=256, method=Image.MEDIANCUT, dither=Image.NONE).save(out, optimize=True)
    print(out, im.size, os.path.getsize(out))


if __name__ == "__main__":
    for a in [int(v) for v in sys.argv[1:]] or [2, 3, 4, 5]:
        sheet(a)
