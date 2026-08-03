#!/usr/bin/env python3
"""Build a phone-readable review page for the Act-1 dungeon floors.

Owner, 2026-07-31: "I am seeing this from my phone so I can't see them."

The PNG review sheets are ~2000 px wide with three floors side by side, which is fine on a
desktop and unreadable on a phone. This emits one self-contained HTML page instead: each floor
is an SVG in cell units, so it scales to any screen and stays crisp when zoomed, and a single
toggle switches between fit-to-screen (overview) and 26 px per cell (readable labels, scrolled
sideways inside the card).

Floors are drawn from the generated JSON, and the main route is recomputed here from the grid
rather than trusted from the placer — the same reason the PNG renderer does it.

Usage:  build_dungeon_review_page.py [--out PATH]
"""
from __future__ import annotations

import argparse
import glob
import json
import os
from collections import deque

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
DIR = os.path.join(ROOT, "design/act1-dungeon-interiors")

NAMES = {"sunkenCellar": "Sunken Cellar", "whisperingWoodsCave": "Whispering Woods",
         "mistyGrotto": "Darkfang Grotto", "coastalReef": "Coastal Reef",
         "crystalCave": "Crystal Cave"}
ORDER = ["sunkenCellar", "whisperingWoodsCave", "mistyGrotto", "coastalReef", "crystalCave"]
ASSET = {"mouth": ("#E8C860", "M", "way in"), "stairsUp": ("#9ACCF4", "U", "stairs up"),
         "stairsDown": ("#5694EA", "D", "stairs down"), "boss": ("#DE4040", "B", "boss"),
         "chest": ("#ECA834", "C", "chest"), "save": ("#5CD896", "S", "save crystal"),
         "sign": ("#B0B8C2", "i", "wall plaque"), "hiddenDoor": ("#C492EC", "h", "false wall"),
         "torch": ("#FFAC42", "T", "torch")}


def route_of(fl: dict) -> tuple[list, dict]:
    rows = fl["rows"]
    h, w = len(rows), len(rows[0])
    walk = {(x, y) for y in range(h) for x in range(w) if rows[y][x] != "#"}
    kinds: dict[str, list] = {}
    for a in fl["assets"]:
        kinds.setdefault(a["kind"], []).append((a["x"], a["y"]))
    entry = (kinds.get("mouth") or kinds.get("stairsUp") or [None])[0]
    if not entry:
        return [], kinds
    dist = {entry: 0}
    q = deque([entry])
    while q:
        c = q.popleft()
        for nb in ((c[0] + 1, c[1]), (c[0] - 1, c[1]), (c[0], c[1] + 1), (c[0], c[1] - 1)):
            if nb in walk and nb not in dist:
                dist[nb] = dist[c] + 1
                q.append(nb)
    goal = (kinds.get("boss") or kinds.get("stairsDown") or [None])[0]
    route = []
    if goal in dist:
        cur = goal
        route = [cur]
        while dist[cur] > 0:
            nxt = min((nb for nb in ((cur[0] + 1, cur[1]), (cur[0] - 1, cur[1]),
                                     (cur[0], cur[1] + 1), (cur[0], cur[1] - 1)) if nb in dist),
                      key=lambda z: dist[z])
            if dist[nxt] >= dist[cur]:
                break
            cur = nxt
            route.append(cur)
    return route, kinds


def svg_for(fl: dict) -> tuple[str, dict]:
    """One unit per cell, so the browser does all the scaling."""
    rows = fl["rows"]
    h, w = len(rows), len(rows[0])
    out = [f'<svg viewBox="0 0 {w} {h}" preserveAspectRatio="xMidYMid meet" role="img" '
           f'aria-label="floor {fl["floor"]}, {w} by {h} cells">',
           f'<rect width="{w}" height="{h}" fill="var(--rock)"/>']
    for y in range(h):                       # merge horizontal runs — keeps the DOM phone-sized
        x = 0
        while x < w:
            if rows[y][x] == "#":
                x += 1
                continue
            x0 = x
            while x < w and rows[y][x] != "#":
                x += 1
            out.append(f'<rect x="{x0}" y="{y}" width="{x - x0}" height="1" fill="var(--floorc)"/>')
    route, kinds = route_of(fl)
    for x, y in route:
        out.append(f'<circle cx="{x + 0.5}" cy="{y + 0.5}" r="0.17" fill="var(--routec)"/>')
    for a in fl["assets"]:
        col, letter, _ = ASSET[a["kind"]]
        x, y = a["x"], a["y"]
        if a.get("onWall"):                  # a plaque holds rock: outline it, do not fill it
            out.append(f'<rect x="{x + .1}" y="{y + .1}" width=".8" height=".8" fill="none" '
                       f'stroke="{col}" stroke-width=".22"/>')
            ink = col
        else:
            out.append(f'<rect x="{x}" y="{y}" width="1" height="1" fill="{col}" '
                       f'stroke="#100E0B" stroke-width=".12"/>')
            ink = "#100E0B"
        out.append(f'<text x="{x + .5}" y="{y + .78}" font-size=".8" text-anchor="middle" '
                   f'fill="{ink}" font-family="ui-monospace,monospace" font-weight="700">'
                   f'{letter}</text>')
    out.append("</svg>")
    return "".join(out), kinds


def main() -> None:
    ap = argparse.ArgumentParser()
    ap.add_argument("--out", default=os.path.join(DIR, "dungeon-review.html"))
    args = ap.parse_args()

    cards, used_kinds = [], set()
    for did in ORDER:
        paths = sorted(glob.glob(os.path.join(DIR, f"{did}-f*.json")),
                       key=lambda p: int(p.rsplit("-f", 1)[1].split(".")[0]))
        if not paths:
            continue
        floors = [json.load(open(p)) for p in paths]
        f0 = floors[0]
        blocks = []
        for fl in floors:
            body, kinds = svg_for(fl)
            used_kinds.update(kinds)
            p = fl["placement"]
            ratio = p["payoffDistance"] / max(1, p["eccentricity"])
            goal = "boss" if kinds.get("boss") else "stairs"
            chips = "".join([
                f'<span class="chip"><b>{ratio:.0%}</b> of the floor to the {goal}</span>',
                f'<span class="chip"><b>{p["payoffArena"]}</b> cells of arena</span>',
                f'<span class="chip"><b>{len(kinds.get("chest", []))}</b> chests</span>',
                f'<span class="chip"><b>{fl["deadEnds"]}</b> dead ends</span>',
            ])
            blocks.append(
                f'<article class="floor"><header class="fh"><h3>Floor {fl["floor"]}</h3>'
                f'<span class="meta">{fl["width"]}×{fl["height"]} · {fl["pattern"]}</span>'
                f'</header><div class="mapwrap"><div class="map" style="--cols:{fl["width"]}">'
                f'{body}</div></div><div class="chips">{chips}</div></article>')
        cards.append(
            f'<section class="dungeon" id="{did}"><header class="dh"><h2>{NAMES[did]}</h2>'
            f'<p class="lede">{f0["totalFloors"]} floors · {f0["theme"]} · joints '
            f'{"/".join(str(j) + chr(176) for j in f0["joints"])}</p></header>'
            f'{"".join(blocks)}</section>')

    legend = "".join(f'<li><span class="sw" style="background:{c}"></span><code>{l}</code>'
                     f' {d}</li>' for k, (c, l, d) in ASSET.items() if k in used_kinds)
    nav = "".join(f'<a href="#{d}">{NAMES[d]}</a>' for d in ORDER)
    open(args.out, "w").write(PAGE.format(nav=nav, legend=legend, cards="".join(cards)))
    print(f"wrote {os.path.relpath(args.out, ROOT)}  "
          f"({os.path.getsize(args.out) / 1024:.0f} KB)")


PAGE = '''<title>Act 1 dungeon placement review</title>
<style>
:root{{
  --ink:#211D17; --muted:#6C6254; --ground:#E9E5DB; --card:#FFFFFF; --line:#D6CFC1;
  --accent:#B07B12;
  --rock:#17140F; --floorc:#C6B491; --routec:rgba(250,236,150,.72);
}}
@media (prefers-color-scheme:dark){{
  :root{{ --ink:#EDE7DC; --muted:#948B7C; --ground:#131110; --card:#1C1916; --line:#302B24;
         --accent:#E8C860; }}
}}
:root[data-theme="dark"]{{ --ink:#EDE7DC; --muted:#948B7C; --ground:#131110; --card:#1C1916;
  --line:#302B24; --accent:#E8C860; }}
:root[data-theme="light"]{{ --ink:#211D17; --muted:#6C6254; --ground:#E9E5DB; --card:#FFFFFF;
  --line:#D6CFC1; --accent:#B07B12; }}
*{{box-sizing:border-box}}
body{{margin:0;background:var(--ground);color:var(--ink);
  font:16px/1.55 system-ui,-apple-system,"Segoe UI",sans-serif;-webkit-text-size-adjust:100%}}
.wrap{{max-width:900px;margin:0 auto;padding:0 14px 64px}}
header.top{{padding:26px 0 14px}}
h1{{font-size:1.45rem;line-height:1.2;margin:0 0 6px;text-wrap:balance;letter-spacing:-.01em}}
.sub1{{color:var(--muted);margin:0;font-size:.95rem;max-width:60ch}}
nav{{position:sticky;top:0;z-index:5;background:var(--ground);border-bottom:1px solid var(--line);
  margin:14px -14px 0;padding:9px 14px;display:flex;gap:7px;overflow-x:auto}}
nav a{{flex:0 0 auto;font-size:.8rem;text-decoration:none;color:var(--muted);
  border:1px solid var(--line);border-radius:999px;padding:5px 11px;white-space:nowrap}}
nav a:focus-visible,button:focus-visible{{outline:2px solid var(--accent);outline-offset:2px}}
.bar{{display:flex;align-items:center;gap:10px;padding:12px 0 0;flex-wrap:wrap}}
button.zoom{{font:inherit;font-size:.82rem;background:var(--card);color:var(--ink);
  border:1px solid var(--line);border-radius:8px;padding:7px 13px;cursor:pointer}}
button.zoom[aria-pressed="true"]{{border-color:var(--accent);color:var(--accent);font-weight:600}}
.hint{{color:var(--muted);font-size:.78rem}}
.dungeon{{margin-top:30px}}
.dh h2{{font-size:1.15rem;margin:0;letter-spacing:-.01em}}
.lede{{color:var(--muted);font-size:.84rem;margin:3px 0 0}}
.floor{{background:var(--card);border:1px solid var(--line);border-radius:12px;margin-top:13px;
  overflow:hidden}}
.fh{{display:flex;align-items:baseline;justify-content:space-between;gap:10px;padding:11px 13px 9px}}
.fh h3{{font-size:.95rem;margin:0}}
.meta{{color:var(--muted);font-size:.76rem;font-family:ui-monospace,SFMono-Regular,Menlo,monospace}}
.mapwrap{{overflow-x:auto;background:var(--rock)}}
.map{{width:100%}}
.map svg{{display:block;width:100%;height:auto}}
body.detail .map{{width:calc(var(--cols) * 26px)}}
.chips{{display:flex;flex-wrap:wrap;gap:6px;padding:10px 13px 13px}}
.chip{{font-size:.75rem;color:var(--muted);border:1px solid var(--line);border-radius:7px;
  padding:3px 8px;font-variant-numeric:tabular-nums}}
.chip b{{color:var(--ink);font-weight:650}}
ul.legend{{list-style:none;margin:16px 0 0;padding:13px;background:var(--card);
  border:1px solid var(--line);border-radius:12px;display:grid;
  grid-template-columns:repeat(auto-fit,minmax(148px,1fr));gap:7px 14px}}
ul.legend li{{display:flex;align-items:center;gap:8px;font-size:.8rem;color:var(--muted)}}
.sw{{width:13px;height:13px;border-radius:3px;flex:0 0 auto;border:1px solid #0004}}
code{{font-family:ui-monospace,SFMono-Regular,Menlo,monospace;color:var(--ink);font-size:.82rem;
  font-weight:650}}
.note{{margin-top:22px;padding:13px;border-left:3px solid var(--accent);background:var(--card);
  border-radius:0 10px 10px 0;font-size:.86rem;color:var(--muted)}}
.note b{{color:var(--ink)}}
</style>
<div class="wrap">
<header class="top">
  <h1>Act 1 dungeon placement</h1>
  <p class="sub1">Every floor as generated. Pale dots trace the main route from the way in to
  the payoff — chests sit <em>off</em> it at dead ends, and the save crystal in its own carved
  pocket beside it.</p>
</header>
<nav>{nav}</nav>
<div class="bar">
  <button class="zoom" id="z" aria-pressed="false">Zoom in</button>
  <span class="hint">then scroll a map sideways to read its labels</span>
</div>
<ul class="legend">{legend}</ul>
{cards}
<p class="note"><b>Not yet modelled:</b> Crystal Cave is a two-mouth gate dungeon — its second
overworld connection arrives at floor 5 — while every floor here has a single entrance.
<b>Hidden rooms</b> are built but held back to Act 3.</p>
</div>
<script>
const b = document.getElementById('z');
b.addEventListener('click', () => {{
  const on = document.body.classList.toggle('detail');
  b.setAttribute('aria-pressed', on);
  b.textContent = on ? 'Fit to screen' : 'Zoom in';
}});
</script>'''


if __name__ == "__main__":
    main()
