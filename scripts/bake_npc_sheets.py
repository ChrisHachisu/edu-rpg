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

_dspec = importlib.util.spec_from_file_location(
    "_dfr", os.path.join(os.path.dirname(os.path.abspath(__file__)), "defringe_sprite.py"))
_dfr = importlib.util.module_from_spec(_dspec)
_dspec.loader.exec_module(_dfr)
_defringe = _dfr.defringe

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
        # REFUSE AN ALREADY-KEYED SHEET INSTEAD OF SILENTLY RUINING IT.
        # key_cell() measures chroma distance to literal magenta on the RGB channels. Feed it a file
        # that has already been keyed -- RGBA, with whatever the keyer happened to leave under
        # alpha 0 -- and there is nothing magenta left to find: a sheet whose transparent pixels
        # went to near-black bakes to a 100%-opaque ruin, and one whose transparent pixels kept a
        # magenta-ish tint bakes to something that merely differs from what shipped.
        #
        # Measured 2026-08-24: `design/act1-towns/npc/final/` had drifted into a MIXED directory --
        # eight already-keyed RGBA sheets alongside two RGB-on-magenta ones -- so the documented
        # command `bake_npc_sheets.py --src design/act1-towns/npc/final` destroyed greenhollow-elder
        # and millbrook-miller outright and changed four more. It was caught in a scratch directory
        # rather than in public/, by luck. The authored format is RGB on pure magenta; anything else
        # is a mistake this now names instead of performing.
        if sheet.mode != "RGB":
            raise SystemExit(
                f"{path} is {sheet.mode}, not RGB. Authored NPC sheets are RGB on pure magenta "
                f"(255,0,255); an RGBA file here has already been keyed and re-keying it produces "
                f"a corrupt sprite. Bake from the authored source, not from a baked output.")
        out = Image.new("RGBA", sheet.size, (0, 0, 0, 0))
        for r in range(ROWS):
            for c in range(COLS):
                cell = _ptn.key_cell(sheet.crop((c * N, r * N, (c + 1) * N, (r + 1) * N)))
                out.paste(cell, (c * N, r * N))
        # DEFRINGE HERE, NOT AS A STEP SOMEBODY REMEMBERS. Keying feathers the edge and a feathered
        # pixel keeps the RGB it had -- a blend of the sprite and the magenta field -- so a sheet
        # that is 100% correct by every opaque-pixel measurement still paints a pink rim over the
        # grass. Measured 2026-08-24 on the two sheets redrawn that day: semi-transparent pixels
        # averaging RGB(199,39,173) and (206,49,180), against -14..+9 magenta-ward for every sheet
        # that had been through defringe_sprite.py. Two separate workers reported "no cast" because
        # the brief told them to measure the outermost OPAQUE ring, which excludes the halo by
        # construction -- so the fix belongs in the bake, where it cannot be skipped, rather than in
        # a checklist step. Idempotent, so re-baking a clean sheet is a no-op.
        out, moved = _defringe(out)
        dst = os.path.join(args.out, os.path.basename(path))
        out.save(dst)
        opaque = sum(1 for p in out.getdata() if p[3] > 200)
        print(f"  {os.path.basename(path):<34} -> RGBA, {opaque} opaque px of {out.width*out.height}"
              f", defringed {moved} soft px")


if __name__ == "__main__":
    main()
