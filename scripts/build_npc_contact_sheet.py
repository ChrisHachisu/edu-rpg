#!/usr/bin/env python3
"""Lay every NPC walk sheet out side by side at 2x so a human can LOOK at the batch.

The finish gate (`check_character_finish.py`) is a number, and a number that passes while the
sprite reads wrong is not a pass -- the gate exists precisely because a batch once passed review
by eye and was rejected on sight. This is the other half: the same batch, keyed exactly as it will
ship, at a size a person can actually judge, with the accepted Port Sapphire set in the same image
as the comparison.

Usage:
    build_npc_contact_sheet.py OUT.png [sheets...]     (defaults to design/act1-towns/npc/*.png)
"""
from __future__ import annotations

import argparse
import glob
import importlib.util
import os

from PIL import Image, ImageDraw, ImageFont

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
_spec = importlib.util.spec_from_file_location(
    "_ptn", os.path.join(os.path.dirname(os.path.abspath(__file__)), "place_town_npcs.py"))
_ptn = importlib.util.module_from_spec(_spec)
_spec.loader.exec_module(_ptn)

COLS, ROWS, N, Z = 3, 4, 64, 2
BG = (36, 38, 44)


def font(size: int):
    for p in ("/System/Library/Fonts/Supplemental/Arial Bold.ttf",
              "/System/Library/Fonts/Helvetica.ttc"):
        try:
            return ImageFont.truetype(p, size)
        except OSError:
            continue
    return ImageFont.load_default()


def main() -> None:
    ap = argparse.ArgumentParser()
    ap.add_argument("out")
    ap.add_argument("sheets", nargs="*")
    ap.add_argument("--per-row", type=int, default=5)
    ap.add_argument("--ground", action="store_true",
                    help="lay the sprites on flat town-grass instead of the checker. The checker "
                         "reads every low-alpha edge pixel as a colour cast; the ground says what "
                         "the player actually sees.")
    args = ap.parse_args()
    sheets = args.sheets or sorted(glob.glob(os.path.join(ROOT, "design/act1-towns/npc/*.png")))

    cw, ch = COLS * N * Z, ROWS * N * Z
    pad, lab = 14, 24
    per = args.per_row
    rows = (len(sheets) + per - 1) // per
    W = pad + per * (cw + pad)
    H = pad + rows * (ch + lab + pad)
    out = Image.new("RGB", (W, H), BG)
    d = ImageDraw.Draw(out)
    f = font(15)

    # a checker under the sprites, so a stray magenta fringe or a hard cut is visible
    tile = Image.new("RGB", (16, 16), (72, 76, 86))
    ImageDraw.Draw(tile).rectangle((0, 0, 7, 7), fill=(88, 92, 104))
    ImageDraw.Draw(tile).rectangle((8, 8, 15, 15), fill=(88, 92, 104))
    if args.ground:
        tile = Image.new("RGB", (16, 16), (104, 132, 74))

    for i, path in enumerate(sheets):
        r, c = divmod(i, per)
        x = pad + c * (cw + pad)
        y = pad + r * (ch + lab + pad) + lab
        for ty in range(y, y + ch, 16):
            for tx in range(x, x + cw, 16):
                out.paste(tile, (tx, ty))
        sheet = Image.open(path)
        for rr in range(ROWS):
            for cc in range(COLS):
                cell = sheet.crop((cc * N, rr * N, (cc + 1) * N, (rr + 1) * N))
                if cell.mode != "RGBA" or cell.getextrema()[3][0] > 250:
                    cell = _ptn.key_cell(cell)
                cell = cell.resize((N * Z, N * Z), Image.NEAREST)
                out.paste(cell, (x + cc * N * Z, y + rr * N * Z), cell)
        d.text((x, y - lab + 4), os.path.basename(path).replace("-4x3-64.png", ""),
               fill=(235, 238, 245), font=f)

    out.save(args.out)
    print(f"  {args.out}  {out.size}  {len(sheets)} sheets")


if __name__ == "__main__":
    main()
