#!/usr/bin/env python3
"""Bake the magenta-keyed NPC sheets into RGBA for the runtime.

The generator can only emit opaque RGB, so authored NPC sheets arrive on a pure magenta field
(design/LANDMARK-SPRITE-CONTRACT.md). Every Python proof in this repo keys them on the way in --
but a canvas `drawImage` does not, so the town runtime drew each NPC inside a magenta square.

Baking once, here, keeps ONE keying implementation: this imports `key_cell` from
`place_town_npcs.py`, the same function `check_character_finish.py` gates against, so the sprite
that ships is pixel-identical to the sprite that was measured and approved.

Usage:  bake_npc_sheets.py [--src design/act1-towns/npc] [--out public/act1-hifi/town/npc]
"""
from __future__ import annotations

import argparse
import glob
import importlib.util
import os

from PIL import Image

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
_spec = importlib.util.spec_from_file_location(
    "_ptn", os.path.join(os.path.dirname(os.path.abspath(__file__)), "place_town_npcs.py"))
_ptn = importlib.util.module_from_spec(_spec)
_spec.loader.exec_module(_ptn)

COLS, ROWS, N = 3, 4, 64


def main() -> None:
    ap = argparse.ArgumentParser()
    ap.add_argument("--src", default=os.path.join(ROOT, "design/act1-towns/npc"))
    ap.add_argument("--out", default=os.path.join(ROOT, "public/act1-hifi/town/npc"))
    args = ap.parse_args()
    os.makedirs(args.out, exist_ok=True)
    for path in sorted(glob.glob(os.path.join(args.src, "*.png"))):
        sheet = Image.open(path)
        if sheet.size != (COLS * N, ROWS * N):
            raise SystemExit(f"{path} is {sheet.size}, expected {(COLS*N, ROWS*N)}")
        out = Image.new("RGBA", sheet.size, (0, 0, 0, 0))
        for r in range(ROWS):
            for c in range(COLS):
                cell = _ptn.key_cell(sheet.crop((c * N, r * N, (c + 1) * N, (r + 1) * N)))
                out.paste(cell, (c * N, r * N))
        dst = os.path.join(args.out, os.path.basename(path))
        out.save(dst)
        opaque = sum(1 for p in out.getdata() if p[3] > 200)
        print(f"  {os.path.basename(path):<34} -> RGBA, {opaque} opaque px of {out.width*out.height}")


if __name__ == "__main__":
    main()
