#!/usr/bin/env python3
"""Regenerate the owner review page for the 5 semantic maps.

Was hand-written HTML, which meant every review round risked the page and the
PNGs drifting apart -- the page still described Act 4's lava as "1289 cells" and
still swatched Act 4's ground as (120,110,104) after both had changed. It is
generated from semantic-maps-index.json now, so the swatches, cell counts and
sizes are always the ones the maps were actually built with.

Run AFTER build_semantic_map.py. Writes the downscaled previews too.
"""
from __future__ import annotations

import html
import json
import os

from PIL import Image, ImageDraw, ImageFont

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
OUT = os.path.join(ROOT, "design/continent-terrain-class-method/semantic-maps")
PREVIEW_MAX = 900          # px on the long edge; the full maps are ~2400-3200

# What changed in the round this page is presenting. Owner-facing, so it names the
# defect the owner reported, not the constant that fixed it.
THIS_PASS = [
    ("Act 4 &mdash; terrain", "The lava was severed into five pieces (two of them hard-edged bars) "
     "where Act 4&rsquo;s two north-south trails crossed it, because the paint skips route cells. "
     "The vent moved off the Central Spine to a fissure east of both trails, so the flow now runs "
     "unbroken through the obsidian field to the north-east shore and crosses no route at all."),
    ("Act 4 &mdash; legibility", "Ground was (120,110,104) against the constant rock grey (128,126,122). "
     "Those two covered 76% of the act and read as one mush. Ground is pale ash now; rock is unchanged, "
     "as the continent-constant role colours require."),
    ("Act 4 &mdash; vegetation", "Act 4 held ZERO vegetation cells, the only act on the continent with none, "
     "while its own legend promised burnt dead forest. 939 cells of deadForest are grown out of the "
     "obsidian &mdash; blocker to blocker, so not one walkable cell changed."),
    ("Act 3 &mdash; the wadi", "Was a straight blue bar with speckled dashes trailing west: a 1-cell "
     "polyline that the trail staircase shadowed for 15 columns. Re-routed to the one east-west corridor "
     "the trail crosses squarely, and grown to a real watercourse &mdash; wide at the oasis, pinched to a "
     "slot where it cuts the sandstone."),
    ("Act 3 &mdash; the rock", "The &ldquo;mottled patchwork of disconnected grey blobs&rdquo; was five duneRock "
     "masses stranded in the middle of the sand basin with nothing holding them up. Those 24 rafts (656 cells) "
     "are gone; the four real massifs stay and are stretched along the bedding plane."),
    ("Act 3 &mdash; magma seal", "The shipped seal at x245&ndash;247, y93&ndash;94 was painted as a bare "
     "rectangle and read as a clipped orange square. Same shipped cells, with an organic plug grown over "
     "adjacent blockers only."),
    ("Act 5 &mdash; portals", "Were &ldquo;the most conspicuous things on the map&rdquo;: big bright yellow discs "
     "on the corners of a rectangle. Smaller discs in dull brass now, and all four moved to tucked-away, "
     "irregularly spaced sites &mdash; chosen and reachability-checked on the GAME&rsquo;s own overworld grid, "
     "not on this map."),
    ("Act 5 &mdash; moat and river", "The demon moat was a compass-drawn annulus and the dark river another "
     "dashed line. The moat still encircles the castle, but both radii now swing 2-3 cells; the river is one "
     "continuous 521-cell watercourse."),
]

STILL_OPEN = (
    "Act 5&rsquo;s towns and dungeons have NOT moved &mdash; only the four portals. Void Rift and Demon "
    "Barracks are locked by their live quests, and shifting the rest would re-cut the act&rsquo;s progression, "
    "which is a design call rather than an art defect."
)

CSS = """:root{color-scheme:dark}
body{background:#14171b;color:#e6e6e6;font:15px/1.55 -apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif;margin:0 auto;padding:32px;max-width:1180px}
h1{font-size:26px;margin:0 0 6px}
.lede{color:#9aa4ae;margin:0 0 22px;max-width:78ch}
.note{background:#1b1f24;border-left:3px solid #e0913a;padding:13px 16px;border-radius:0 4px 4px 0;margin:0 0 18px;color:#c8d0d8;font-size:14px}
.note b{color:#e0913a}
.note ul{margin:10px 0 0;padding-left:18px} .note li{margin:0 0 7px}
.open{border-left-color:#6d8fb8} .open b{color:#8fb4dd}
section{border-top:1px solid #2b3138;padding:26px 0}
h2{font-size:20px;margin:0 0 2px}
h2 small{color:#e0913a;font-weight:400;font-size:15px;margin-left:10px}
.meta{color:#7b858f;font-size:13px;margin:0 0 16px;font-variant-numeric:tabular-nums}
img{max-width:100%;height:auto;border:1px solid #2b3138;border-radius:4px;display:block;image-rendering:pixelated}
.legend{display:grid;grid-template-columns:repeat(auto-fill,minmax(330px,1fr));gap:8px;margin-top:16px}
.sw{display:flex;align-items:baseline;gap:9px;background:#1b1f24;border-radius:4px;padding:8px 11px;font-size:13px}
.sw span{width:15px;height:15px;border-radius:3px;flex:0 0 auto;border:1px solid #00000055;align-self:center}
.sw b{flex:0 0 auto} .sw i{color:#9aa4ae;font-style:normal;flex:1}
.sw u{color:#6d767f;text-decoration:none;font-variant-numeric:tabular-nums;flex:0 0 auto}"""

MARKER_KEYS = ("town", "dungeon", "connector", "portal")


def labelled(act_key: str, index: dict) -> str:
    """A REVIEW-ONLY copy with every landmark named on it.

    Never fed to the art model -- the semantic PNG stays clean. This exists so a
    review comment can say "move Void Rift" instead of "the dungeon between the
    first and second town", which cost a round to disambiguate.
    """
    entry = index[act_key]
    px, pad = entry["pxPerCell"], 4
    x0, y0 = entry["bounds"][0], entry["bounds"][1]
    img = Image.open(os.path.join(OUT, f"{act_key}-semantic.png")).convert("RGB")
    scale = min(1.0, PREVIEW_MAX / max(img.size))
    img = img.resize((max(1, round(img.width * scale)), max(1, round(img.height * scale))),
                     Image.Resampling.NEAREST)
    draw = ImageDraw.Draw(img)
    try:
        font = ImageFont.truetype("/System/Library/Fonts/Supplemental/Arial Bold.ttf", 13)
    except OSError:
        font = ImageFont.load_default()
    roster = json.load(open(os.path.join(OUT, "landmark-roster.json")))["acts"]
    for landmark in roster[act_key.replace("act", "")]:
        cx = (landmark["cell"][0] - x0) * px * scale + px * scale / 2
        cy = (landmark["cell"][1] - y0) * px * scale + px * scale / 2
        text = landmark["name"]
        box = draw.textbbox((0, 0), text, font=font)
        w, h = box[2] - box[0], box[3] - box[1]
        tx = min(max(2, cx - w / 2), img.width - w - 4)
        ty = min(max(2, cy + 9), img.height - h - 6)
        draw.rectangle((tx - 3, ty - 2, tx + w + 3, ty + h + 4), fill=(12, 14, 17))
        draw.text((tx, ty), text, fill=(255, 255, 255), font=font)
    name = f"{act_key}-semantic-labelled.png"
    img.save(os.path.join(OUT, name), optimize=True)
    return name


def preview(name: str) -> str:
    """Downscale one map for the page and return the written filename."""
    src = os.path.join(OUT, f"{name}.png")
    dst_name = f"{name}-preview.png"
    img = Image.open(src)
    scale = min(1.0, PREVIEW_MAX / max(img.size))
    if scale < 1.0:
        img = img.resize((max(1, round(img.width * scale)), max(1, round(img.height * scale))),
                         Image.Resampling.NEAREST)
    img.save(os.path.join(OUT, dst_name), optimize=True)
    return dst_name


def main() -> None:
    index = json.load(open(os.path.join(OUT, "semantic-maps-index.json")))
    parts = [
        '<!doctype html><meta charset="utf-8">',
        "<title>edu-rpg semantic maps &mdash; owner approval</title>",
        f"<style>\n{CSS}\n</style>",
        "<h1>Semantic maps &mdash; all 5 acts</h1>",
        '<p class="lede">Flat-colour input maps that sol paints the detailed art from. Role colours are '
        "constant continent-wide: vegetation the same green, rock the same grey, water the same blue in "
        "every act &mdash; only the walkable ground colour changes with the biome.</p>",
        '<div class="note"><b>This pass</b> &mdash; every item is a defect you reported:<ul>'
        + "".join(f"<li><b>{title}.</b> {body}</li>" for title, body in THIS_PASS)
        + "</ul></div>",
        f'<div class="note open"><b>Still open:</b> {STILL_OPEN}</div>',
    ]
    for key in sorted(index, key=lambda k: int(k.replace("act", ""))):
        entry = index[key]
        act = key.replace("act", "")
        width, height = entry["size"]
        parts.append("<section>")
        parts.append(f'<h2>Act {act} <small>{html.escape(entry["theme"])}</small></h2>')
        parts.append(f'<p class="meta">bounds {entry["bounds"]} &middot; {width}&times;{height} px '
                     f'&middot; {entry["pxPerCell"]} px/cell</p>')
        parts.append(f'<img src="{preview(f"{key}-semantic")}">')
        parts.append('<figcaption style="color:#7b858f;font-size:13px;margin:10px 0 6px">'
                     'Named copy (review only &mdash; not fed to the art model)</figcaption>')
        parts.append(f'<img src="{labelled(key, index)}">')
        rows = []
        for row in entry["legend"]:
            r, g, b = row["rgb"]
            count = (f'{row["count"]} marker' + ("s" if row["count"] != 1 else "")) \
                if "count" in row else f'{row["cells"]} cells'
            rows.append(f'<div class="sw"><span style="background:rgb({r},{g},{b})"></span>'
                        f'<b>{html.escape(row["key"])}</b><i>{html.escape(row["means"])}</i>'
                        f"<u>{count}</u></div>")
        parts.append('<div class="legend">' + "".join(rows) + "</div>")
        parts.append("</section>")
    path = os.path.join(OUT, "REVIEW-semantic-maps.html")
    open(path, "w").write("\n".join(parts) + "\n")
    print(f"wrote {os.path.relpath(path, ROOT)}  ({len(index)} acts)")


if __name__ == "__main__":
    main()
