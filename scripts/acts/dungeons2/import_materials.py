#!/usr/bin/env python3
"""Codex 2x2 material sheet -> four tileable 531 px tiles (floor | wall / rubble | accent), with
Act 1's own quilt(). Output: <work>/materials/<dungeon>/mat-*.png.   import_materials.py [ids...]"""
import json, os, shutil, sys
from PIL import Image
import d2common as C
import make_dungeon_materials as M

SIZE = 531


def main():
    ids = sys.argv[1:] or sorted(C.DUNGEONS)
    for did in ids:
        sheet = os.path.join(C.CODEX, C.DUNGEONS[did]["sheet"] + ".png")
        out = os.path.join(C.MATROOT, did)
        os.makedirs(out, exist_ok=True)
        shutil.copyfile(sheet, os.path.join(out, f"{did}-materials-sheet.png"))
        M.MATROOT = C.MATROOT
        M.quilt(did)
        for t in ("floor", "wall", "rubble", "accent"):
            p = os.path.join(out, f"mat-{t}.png")
            im = Image.open(p).convert("RGB")
            if im.size != (SIZE, SIZE):
                im.resize((SIZE, SIZE), Image.LANCZOS).save(p)
        json.dump({"source": "codex", "sheet": sheet}, open(os.path.join(out, "source.json"), "w"))
        print(f"{did}: imported {os.path.basename(sheet)}")


if __name__ == "__main__":
    main()
