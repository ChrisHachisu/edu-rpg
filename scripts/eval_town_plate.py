#!/usr/bin/env python3
"""Judge one art-first town plate: the gate, then what the phone actually draws.

The gate alone has passed a candidate the owner rejected on sight (v6), so this always renders the
device view beside the shipped plate as well. A number and a picture, never one without the other.
"""
from __future__ import annotations
import argparse, os, subprocess, sys
import numpy as np
from PIL import Image, ImageDraw, ImageFont

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
SHIP = os.path.join(ROOT, "public/act1-hifi/town/portSapphire-screen.png")


def device_view(path, at=(30.0, 29.0), out_px=940):
    im = Image.open(path).convert("RGB")
    apw = im.size[0] / 1040.0                 # art px per world px
    V = int(round(208 * apw))                 # the town camera shows 208 world px
    cx, cy = at[0] * 16 * apw, at[1] * 16 * apw
    l = int(np.clip(cx - V / 2, 0, im.size[0] - V)); t = int(np.clip(cy - V / 2, 0, im.size[1] - V))
    return im.crop((l, t, l + V, t + V)).resize((out_px, out_px), Image.NEAREST)


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("plate")
    ap.add_argument("--at", default="30.0,29.0")
    ap.add_argument("--out", default=os.path.join(ROOT, "design/act1-towns/ground/plate-eval.png"))
    a = ap.parse_args()
    at = tuple(float(v) for v in a.at.split(","))

    r = subprocess.run([sys.executable, os.path.join(ROOT, "scripts/check_town_finish.py"), a.plate,
                        "--layout-ref", SHIP, "--report"], capture_output=True, text=True)
    print(r.stdout.strip())
    r2 = subprocess.run([sys.executable, os.path.join(ROOT, "scripts/check_town_finish.py"), a.plate,
                         "--layout-ref", SHIP], capture_output=True, text=True)
    verdict = "PASS" if r2.returncode == 0 else "FAIL"
    print("\n" + verdict)
    if verdict == "FAIL":
        print(r2.stdout.split("FAIL", 1)[-1].strip()[:1400])

    panels = [("SHIPPED — the painted plate", device_view(SHIP, at)),
              ("CANDIDATE — " + os.path.basename(a.plate), device_view(a.plate, at)),
              ("whole plate", Image.open(a.plate).convert("RGB").resize((940, 940), Image.LANCZOS))]
    pad, lab = 14, 46
    W = 940 * len(panels) + pad * (len(panels) + 1)
    out = Image.new("RGB", (W, 940 + lab + pad * 2), (18, 19, 32))
    d = ImageDraw.Draw(out)
    try:
        f = ImageFont.truetype("/System/Library/Fonts/Supplemental/Arial Bold.ttf", 25)
    except Exception:
        f = None
    for i, (t, im) in enumerate(panels):
        x = pad * (i + 1) + 940 * i
        out.paste(im, (x, lab + pad))
        d.text((x, 12), t, fill=(240, 225, 190), font=f)
    out.save(a.out)
    print("  ->", os.path.relpath(a.out, ROOT))
    return 0 if verdict == "PASS" else 1


if __name__ == "__main__":
    raise SystemExit(main())
