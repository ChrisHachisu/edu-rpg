#!/usr/bin/env python3
"""Acts 2-5 MATERIAL PACK: the shippable art under the runtime-tiling plan
(docs/plans/2026-10-28-app-size-budget.md §4). Per dungeon: 4 tiles (floor/wall/rubble/accent,
531 px) composited by the game's shader over a 1/4-res field (see fields.py).

  python3 material_pack.py import   # quilt every returned Codex sheet (codex-gen/dungeons/out/mat-*.png)
                                    # into design/materials/<dungeon>/ with Act 1's quilt(); dungeons
                                    # with no sheet yet keep the derived placeholder (materials.py)
  python3 material_pack.py pack     # runtime/materials/<dungeon>/mat-*.jpg at q85 + pack.json (sizes,
                                    # source = codex | derived-placeholder) + contact sheet on the mount

Nothing here writes public/ or dist/.
"""
import json, os, shutil, sys
import numpy as np
from PIL import Image, ImageDraw
import common
from common import MATROOT, RUNTIME, PREVIEW
from specs import SPECS
from previews import save_small, font
from write_codex_briefs import MATERIAL_FOR

CODEX = os.environ.get("CODEX_DUNGEON_OUT") or next(
    (d for d in (os.path.join(common.SCRATCH, "..", "codex-dungeons", "out"),
                 "/mnt/project-files/edu-rpg/codex-gen/dungeons/out") if os.path.isdir(d)),
    "/mnt/project-files/edu-rpg/codex-gen/dungeons/out")
CODEX = os.path.normpath(CODEX)
TILES = ("floor", "wall", "rubble", "accent")
SIZE = 531                     # Act 1 tile size; the budget's 8.1 MB assumes it


def source(did):
    p = os.path.join(MATROOT, did, "source.json")
    return json.load(open(p)).get("source", "derived-placeholder") if os.path.exists(p) else "derived-placeholder"


def do_import():
    import make_dungeon_materials as M
    for s in SPECS:
        did = s["id"]
        sheet = os.path.join(CODEX, f"mat-{MATERIAL_FOR[did]}.png")
        if not os.path.exists(sheet):
            print(f"{did:22} no Codex sheet yet ({os.path.basename(sheet)}); keeping derived placeholder")
            continue
        out = os.path.join(MATROOT, did)
        os.makedirs(out, exist_ok=True)
        shutil.copyfile(sheet, os.path.join(out, f"{did}-materials-sheet.png"))
        M.MATROOT = MATROOT                       # Act 1's quilt(), pointed at the scratch tree
        M.quilt(did)
        for t in TILES:                          # renderers + pack expect the Act 1 tile size
            p = os.path.join(out, f"mat-{t}.png")
            im = Image.open(p).convert("RGB")
            if im.size != (SIZE, SIZE):
                im.resize((SIZE, SIZE), Image.LANCZOS).save(p)
        json.dump({"source": "codex", "sheet": sheet}, open(os.path.join(out, "source.json"), "w"))
        print(f"{did:22} imported {os.path.basename(sheet)}")


def do_pack():
    root = os.path.join(RUNTIME, "materials")
    rows, total = [], 0
    for s in SPECS:
        did = s["id"]
        od = os.path.join(root, did)
        os.makedirs(od, exist_ok=True)
        sz = {}
        for t in TILES:
            im = Image.open(os.path.join(MATROOT, did, f"mat-{t}.png")).convert("RGB")
            p = os.path.join(od, f"mat-{t}.jpg")
            im.save(p, quality=85, optimize=True)
            sz[t] = os.path.getsize(p)
        total += sum(sz.values())
        rows.append((s, sz))
        json.dump({"dungeon": did, "act": s["act"], "codexSheet": f"mat-{MATERIAL_FOR[did]}",
                   "source": source(did), "tile": SIZE, "bytes": sz}, open(os.path.join(od, "pack.json"), "w"), indent=1)
    print(f"material pack: {len(rows)} dungeons, {total / 1e6:.2f} MB at q85 -> {root}")
    # contact sheet: 4 tiles per dungeon at 1/3 size, labelled with where they come from
    t = 128; pad = 8; lab = 22
    cols = 2
    W = cols * (4 * (t + 4) + 260 + pad) + pad
    H = ((len(rows) + cols - 1) // cols) * (t + lab + pad) + 50
    sh = Image.new("RGB", (W, H), (16, 16, 20)); d = ImageDraw.Draw(sh)
    d.text((pad, 12), f"Acts 2-5 dungeon materials (the shippable art under runtime tiling): floor | wall | "
                      f"rubble | accent, 531 px each, {total / 1e6:.1f} MB total at q85", font=font(16), fill=(240, 240, 240))
    for i, (s, sz) in enumerate(rows):
        x = pad + (i % cols) * (4 * (t + 4) + 260 + pad); y = 44 + (i // cols) * (t + lab + pad)
        src = source(s["id"])
        d.text((x, y), f"A{s['act']} {s['name']}", font=font(14), fill=(230, 230, 230))
        d.text((x, y + 16 + 4), f"{src}\nsheet: mat-{MATERIAL_FOR[s['id']]}", font=font(12),
               fill=(140, 220, 140) if src == "codex" else (230, 180, 110))
        for k, tt in enumerate(TILES):
            im = Image.open(os.path.join(MATROOT, s["id"], f"mat-{tt}.png")).convert("RGB")
            sh.paste(im.resize((t, t), Image.LANCZOS), (x + 260 + k * (t + 4), y))
    p = os.path.join(PREVIEW, "materials-acts2-5.png")
    print("wrote", p, round(save_small(sh, p) / 1e6, 2), "MB")


if __name__ == "__main__":
    {"import": do_import, "pack": do_pack}[sys.argv[1] if len(sys.argv) > 1 else "pack"]()
