#!/usr/bin/env python3
"""Build the owner-facing TERRAIN PLANNER: paint the semantic map by hand.

Owner, 2026-07-29: "the semantic map is a mess, so I have a better idea. Just give me
all the five act maps... set it up like before so I can draw in and place the landmarks
in a different screen. Don't touch the other screen that I already edited, but add that
new town and add the other side of the haunted forest. Also, add land barrier types,
forest, mountain ranges, and water bodies. So I can draw the semantic map myself."

So this is the layout planner inverted one more step. The first planner took landmark
PLACEMENT as the input and grew terrain from it; the terrain that came out is the thing
being rejected. This hands the terrain over too.

Two screens, deliberately separate:

  LANDMARKS  the owner's existing placement, preloaded from owner-layout.json and never
             cleared by this tool. Adds the two markers the owner asked for: the new
             Act 4 town, and the Haunted Forest's second entrance.
  TERRAIN    a per-cell paint layer -- forest, mountain, water, road -- over the
             coastline, with the landmarks shown as read-only pins to draw around.

Unpainted land means open ground, so the owner paints only what blocks. Export writes
ONE JSON carrying both screens; the terrain layer comes out as one character per cell so
it drops straight into a numpy grid.
"""
from __future__ import annotations

import base64
import io
import json
import os

import numpy as np
from PIL import Image

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
OUT = os.path.join(ROOT, "design/continent-terrain-class-method/layout-planner")
PACK = os.path.join(ROOT, "design/review/overworld-art-blueprint/continent/continent-macro-g3")
MAPS = os.path.join(ROOT, "design/continent-terrain-class-method/semantic-maps")
PX = 6

ACTS = {
    1: (16, 218, 163, 399), 2: (161, 222, 312, 399), 3: (163, 88, 314, 221),
    4: (163, 3, 314, 128), 5: (9, 7, 162, 217),
}

# Same roster and progression order as the first planner, plus the two the owner asked
# for. `at` is the owner's own cell where they already placed one; the two new markers
# are seeded at the spot the owner scribbled and are theirs to move.
LANDMARKS = [
    (1, "Greenhollow", "town", "start of the game"),
    (1, "Sunken Cellar", "side", "boss: giant rat line"),
    (1, "Whispering Woods", "side", ""),
    (1, "Millbrook", "town", ""),
    (1, "Darkfang / Misty Grotto", "side", "boss: giantToad"),
    (1, "Port Sapphire", "town", ""),
    (1, "Coastal Reef", "side", ""),
    (1, "Crystal Cave", "connector", "STORY - boss serpent, opens Act 2"),

    (2, "Crystal Cave (Act 2 side)", "connector", "arrival from Act 1"),
    (2, "Ironkeep", "town", ""),
    (2, "Iron Mine", "side", "quest gordosOre"),
    (2, "Frozen Lake", "side", "quest frozenSupplies"),
    (2, "Frostwatch", "town", ""),
    (2, "Storm Nest", "story", "boss stormHarpy - HARD GATE on Shadow Cave"),
    (2, "Haunted Forest", "story", "boss phantomStag - quest hauntedPath"),
    (2, "Haunted Forest (second entrance)", "story", "NEW - the far mouth you asked for"),
    (2, "Ravenhollow", "town", "last town of the act"),
    (2, "Shadow Cave", "connector", "STORY - boss dragon, opens Act 3"),

    (3, "Shadow Cave (Act 3 side)", "connector", "arrival from Act 2"),
    (3, "Ruins Camp", "town", ""),
    (3, "Bandit Hideout", "side", ""),
    (3, "Oasis Haven", "town", ""),
    (3, "Oasis Depths", "side", "quest lunasMap"),
    (3, "Desert Tomb", "story", "boss sandGolem - HARD GATE on Act 4"),
    (3, "Scorched Ruins", "side", "quest ancientRelic"),
    (3, "Magma Tunnels", "connector", "STORY - opens Act 4"),

    (4, "Magma Tunnels (Act 4 side)", "connector", "arrival from Act 3"),
    (4, "Ember's Rest", "town", "only town in the act"),
    (4, "Cinderwatch", "town", "NEW - name locked by owner 2026-07-29"),
    (4, "Obsidian Cavern", "side", "boss crystalHydra"),
    (4, "Ember Mines", "side", "quest flameCloak"),
    (4, "Volcanic Forge", "connector", "STORY - boss flameTitan, opens Act 5"),

    (5, "Volcanic Forge (Act 5 side)", "connector", "arrival from Act 4"),
    (5, "Last Bastion", "town", ""),
    (5, "Haven's Edge", "town", ""),
    (5, "Demon Barracks", "story", "boss warGeneralMalachar"),
    (5, "Void Rift", "story", "boss nullDevourer - quest kikisResolve"),
    (5, "Portal - Stormreach Isles", "portal", "one of 4 relics"),
    (5, "Portal - Frostfall Peaks", "portal", "one of 4 relics"),
    (5, "Portal - Sunken Temple", "portal", "one of 4 relics"),
    (5, "Portal - Twilight Realm", "portal", "one of 4 relics"),
    (5, "Demon Castle", "story", "FINAL - boss demonKing, needs all 4 relics"),
]

# The two markers the owner asked to add, seeded where they scribbled.
SEEDED = {
    "Haunted Forest (second entrance)": (284, 258),
    "Cinderwatch": (257, 42),
}

KIND_RGB = {"town": "#eb785a", "story": "#aa5abe", "side": "#7f9dc4",
            "connector": "#e848a8", "portal": "#96805a"}

# Paint classes. Unpainted land is open ground, so only what BLOCKS gets drawn.
# Colours are the semantic map's own, so the canvas reads as the finished map.
BRUSHES = [
    {"code": "F", "key": "forest", "label": "Forest", "rgb": "#1a522e"},
    {"code": "M", "key": "mountain", "label": "Mountain range", "rgb": "#807e7a"},
    {"code": "W", "key": "water", "label": "Water body", "rgb": "#1e52aa"},
    {"code": "R", "key": "road", "label": "Road", "rgb": "#aa783c"},
]
GROUND_RGB = (226, 210, 156)
SEA_RGB = (22, 40, 60)


def outline_png(act: int, land: np.ndarray) -> str:
    """Coastline only: land as open ground, sea dark. Terrain is painted on top."""
    x0, y0, x1, y1 = ACTS[act]
    sub = land[y0:y1 + 1, x0:x1 + 1]
    img = np.zeros((*sub.shape, 3), dtype=np.uint8)
    img[...] = SEA_RGB
    img[sub] = GROUND_RGB
    picture = Image.fromarray(img).resize(
        (sub.shape[1] * PX, sub.shape[0] * PX), Image.Resampling.NEAREST)
    buffer = io.BytesIO()
    picture.save(buffer, format="PNG", optimize=True)
    return base64.b64encode(buffer.getvalue()).decode()


def main() -> None:
    os.makedirs(OUT, exist_ok=True)
    land = np.load(os.path.join(PACK, "land-mask.npy"))
    runtime = np.asarray(json.load(open(os.path.join(MAPS, "runtime-overworld-grid.json"))),
                         dtype=np.int16)
    passable = np.isin(runtime, [0, 1, 5, 6, 7, 8, 9, 10, 11, 12, 13, 15, 16, 17, 18, 19, 20])

    owner = json.load(open(os.path.join(OUT, "owner-layout.json")))
    strokes = json.load(open(os.path.join(OUT, "owner-layout-strokes.json")))

    acts_payload = {}
    for act in sorted(ACTS):
        x0, y0, x1, y1 = ACTS[act]
        placed = dict(owner.get(str(act), {}).get("landmarks", {}))
        for name, cell in SEEDED.items():
            if any(n == name for a, n, _k, _t in LANDMARKS if a == act):
                placed.setdefault(name, list(cell))
        acts_payload[str(act)] = {
            "bounds": [x0, y0, x1, y1],
            "png": outline_png(act, land),
            "land": land[y0:y1 + 1, x0:x1 + 1].astype(np.uint8).tolist(),
            "gamePassable": passable[y0:y1 + 1, x0:x1 + 1].astype(np.uint8).tolist(),
            "landmarks": [{"name": n, "kind": k, "note": note}
                          for a, n, k, note in LANDMARKS if a == act],
            "placed": placed,
            "priorBlockers": strokes.get(str(act), {}).get("blockers", []),
        }

    payload = json.dumps({"px": PX, "acts": acts_payload, "kindRgb": KIND_RGB,
                          "brushes": BRUSHES})
    html = TEMPLATE.replace("__PAYLOAD__", payload)
    path = os.path.join(OUT, "terrain-planner.html")
    open(path, "w").write(html)
    print(f"wrote {os.path.relpath(path, ROOT)}  ({os.path.getsize(path) / 1e6:.1f} MB)")
    for act in sorted(ACTS):
        a = acts_payload[str(act)]
        print(f"  act{act}: {len(a['landmarks'])} landmarks, "
              f"{len(a['placed'])} already placed, "
              f"{len(a['priorBlockers'])} prior blocker points available to seed")


TEMPLATE = r"""<!doctype html><meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>edu-rpg — terrain planner</title>
<style>
:root{color-scheme:dark}
*{box-sizing:border-box}
body{background:#14171b;color:#e6e6e6;font:14px/1.5 -apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif;margin:0;padding:18px}
h1{font-size:20px;margin:0 0 4px}
p.lede{color:#9aa4ae;margin:0 0 14px;max-width:92ch}
.bar{display:flex;gap:6px;margin-bottom:10px;flex-wrap:wrap;align-items:center}
.bar .sp{flex:1}
button{background:#1b1f24;border:1px solid #2b3138;color:#c8d0d8;padding:7px 13px;border-radius:5px;cursor:pointer;font:inherit}
button:hover{border-color:#4f7fbf}
button.on{background:#e0913a;border-color:#e0913a;color:#14171b;font-weight:600}
.screens button.on{background:#e0913a}
.tools button.on{background:#4f7fbf;border-color:#4f7fbf;color:#fff}
select{background:#1b1f24;border:1px solid #2b3138;color:#c8d0d8;padding:6px 9px;border-radius:5px;font:inherit}
.sticky{position:sticky;top:0;z-index:6;background:#14171b;padding:8px 0 6px;border-bottom:1px solid #232830;margin-bottom:12px}
.wrap{display:flex;gap:16px;align-items:flex-start;flex-wrap:wrap}
.side{width:340px;flex:0 0 auto;order:1}
.mapcol{flex:1 1 520px;min-width:0;order:2;overflow:auto}
@media (max-width:1270px){ .side{order:2;width:100%} .mapcol{order:1;width:100%} }
ol{list-style:none;counter-reset:n;margin:0;padding:0;max-height:64vh;overflow:auto}
li{counter-increment:n;display:flex;gap:9px;align-items:flex-start;background:#1b1f24;border:1px solid #2b3138;border-radius:5px;padding:7px 9px;margin-bottom:5px;cursor:pointer}
li:hover{border-color:#4f7fbf}
li.sel{border-color:#e0913a;background:#241f18}
li.done{opacity:.62}
li::before{content:counter(n);color:#6d767f;font-variant-numeric:tabular-nums;min-width:18px}
li.isnew{border-color:#5aa46f}
.dot{width:13px;height:13px;border-radius:50%;flex:0 0 auto;margin-top:3px;border:1px solid #0006}
.nm{flex:1}
.nm b{display:block;font-weight:600}
.nm i{display:block;font-style:normal;color:#8b949e;font-size:12px}
.nm u{display:block}
.nm u{text-decoration:none;color:#e0913a;font-variant-numeric:tabular-nums;font-size:12px}
canvas{border:1px solid #2b3138;border-radius:5px;cursor:crosshair;background:#14171b;touch-action:none;max-width:100%}
.hint{color:#7b858f;font-size:12.5px;margin:9px 0 0}
.warn{color:#e0913a}
textarea{width:100%;height:110px;background:#0f1216;color:#c8d0d8;border:1px solid #2b3138;border-radius:5px;font:12px/1.4 ui-monospace,Menlo,monospace;padding:8px;margin-top:9px}
.sw{width:14px;height:14px;border-radius:3px;border:1px solid #0006;display:inline-block;vertical-align:-2px;margin-right:7px}
.card{background:#1b1f24;border:1px solid #2b3138;border-radius:6px;padding:11px 12px;margin-bottom:10px}
.card h3{margin:0 0 6px;font-size:13px;letter-spacing:.06em;text-transform:uppercase;color:#8b949e;font-weight:600}
.hide{display:none}
.count{font-variant-numeric:tabular-nums;color:#8b949e;font-size:12px}
</style>

<h1>Terrain planner</h1>
<p class="lede">Two screens. <b>Landmarks</b> is your existing placement, already loaded &mdash; nothing was cleared, and the two
markers you asked for are added. <b>Terrain</b> is yours to paint: unpainted land is open ground, so you only draw what blocks.
Landmarks show through as pins so you can draw around them. Everything autosaves; <b>Export</b> when you are done.</p>

<div class="sticky">
  <div class="bar screens" id="screens"></div>
  <div class="bar" id="actbar"></div>
  <div id="terrainTools" class="hide">
    <div class="bar tools" id="brushes"></div>
    <div class="bar">
      <span class="tools" id="modes" style="display:flex;gap:6px">
        <button data-mode="paint" class="on">Paint</button>
        <button data-mode="fill">Fill area</button>
      </span>
      <label>Size <select id="size">
        <option value="1">1 cell</option>
        <option value="2" selected>3 cells</option>
        <option value="4">7 cells</option>
        <option value="7">13 cells</option>
        <option value="12">23 cells</option>
      </select></label>
      <label>Zoom <select id="zoom">
        <option value="4">4 px</option>
        <option value="6" selected>6 px</option>
        <option value="9">9 px</option>
        <option value="12">12 px</option>
      </select></label>
      <span class="sp"></span>
      <span class="count" id="painted"></span>
    </div>
    <div class="hint" id="modehint"></div>
  </div>
</div>

<div class="wrap">
  <div class="side">

    <div id="paneLandmarks">
      <div class="card">
        <h3>Place a landmark</h3>
        <div>Pick one below, then click the map. Click again to move it.</div>
      </div>
      <ol id="list"></ol>
    </div>

    <div id="paneTerrain" class="hide">
      <div class="card">
        <h3>This act</h3>
        <div class="bar" style="margin:0">
          <button id="seed">Seed from my earlier strokes</button>
          <button id="clrT">Clear terrain</button>
        </div>
      </div>
    </div>

    <div class="bar" style="margin-top:10px">
      <button id="exp">Export JSON</button>
    </div>
    <textarea id="out" placeholder="Export output appears here — a file also lands in Downloads"></textarea>
  </div>

  <div class="mapcol">
    <canvas id="cv"></canvas>
    <p class="hint" id="hint">Cell &mdash;</p>
  </div>
</div>

<script>
const DATA = __PAYLOAD__;
let PX = DATA.px;
let act = "1", screen = "landmarks", brush = "F", sel = 0, drawing = false, size = 2, mode = "paint";
const CODES = DATA.brushes.map(b => b.code);
const RGB = {}; DATA.brushes.forEach(b => RGB[b.code] = b.rgb);

function hex(h){ return [parseInt(h.slice(1,3),16), parseInt(h.slice(3,5),16), parseInt(h.slice(5,7),16)]; }

const state = {};
for (const a of Object.keys(DATA.acts)) {
  const A = DATA.acts[a], w = A.bounds[2]-A.bounds[0]+1, h = A.bounds[3]-A.bounds[1]+1;
  state[a] = { marks: Object.assign({}, A.placed), terrain: new Array(w*h).fill(".") };
}

const imgs = {};
for (const a of Object.keys(DATA.acts)) { const i = new Image(); i.src = "data:image/png;base64," + DATA.acts[a].png; imgs[a] = i; }

const cv = document.getElementById("cv"), ctx = cv.getContext("2d");
const hint = document.getElementById("hint"), list = document.getElementById("list");
let layer = null, layerCtx = null, layerImg = null;

// --- tabs -------------------------------------------------------------------
const screens = document.getElementById("screens");
[["landmarks","Landmarks"],["terrain","Terrain"]].forEach(([k,label]) => {
  const b = document.createElement("button");
  b.textContent = label; b.dataset.screen = k;
  b.onclick = () => { screen = k; render(); };
  screens.appendChild(b);
});
const actbar = document.getElementById("actbar");
Object.keys(DATA.acts).forEach(a => {
  const b = document.createElement("button");
  b.textContent = "Act " + a; b.dataset.act = a;
  b.onclick = () => { act = a; sel = 0; buildLayer(); render(); };
  actbar.appendChild(b);
});
const brushBar = document.getElementById("brushes");
DATA.brushes.forEach(bs => {
  const b = document.createElement("button");
  b.innerHTML = '<span class="sw" style="background:' + bs.rgb + '"></span>' + bs.label;
  b.dataset.code = bs.code;
  b.onclick = () => { brush = bs.code; render(); };
  brushBar.appendChild(b);
});
const era = document.createElement("button");
era.innerHTML = '<span class="sw" style="background:#e2d29c"></span>Erase to ground';
era.dataset.code = "."; era.onclick = () => { brush = "."; render(); };
brushBar.appendChild(era);

const modeBar = document.getElementById("modes");
[...modeBar.children].forEach(b => b.onclick = () => { mode = b.dataset.mode; render(); });

document.getElementById("size").onchange = e => { size = +e.target.value; };
document.getElementById("zoom").onchange = e => { PX = +e.target.value; render(); };

// --- terrain layer ----------------------------------------------------------
function dims() { const A = DATA.acts[act]; return [A.bounds[2]-A.bounds[0]+1, A.bounds[3]-A.bounds[1]+1]; }
function buildLayer() {
  const [w,h] = dims();
  layer = document.createElement("canvas"); layer.width = w; layer.height = h;
  layerCtx = layer.getContext("2d");
  layerImg = layerCtx.createImageData(w, h);
  const T = state[act].terrain;
  for (let i = 0; i < w*h; i++) paintPixel(i, T[i]);
}
function paintPixel(i, code) {
  const d = layerImg.data;
  if (code === ".") { d[i*4+3] = 0; return; }
  const c = hex(RGB[code]);
  d[i*4] = c[0]; d[i*4+1] = c[1]; d[i*4+2] = c[2]; d[i*4+3] = 255;
}
function setCell(cx, cy, code) {
  const A = DATA.acts[act], [w,h] = dims();
  const lx = cx - A.bounds[0], ly = cy - A.bounds[1];
  if (lx < 0 || ly < 0 || lx >= w || ly >= h) return;
  if (!A.land[ly][lx]) return;                 // sea stays sea
  const i = ly*w + lx;
  if (state[act].terrain[i] === code) return;
  state[act].terrain[i] = code;
  paintPixel(i, code);
}
function stamp(cx, cy) {
  const r = size;
  for (let dy = -r; dy <= r; dy++)
    for (let dx = -r; dx <= r; dx++)
      if (dx*dx + dy*dy <= r*r + r) setCell(cx+dx, cy+dy, brush);
}
// One-click fill: spreads from the clicked cell across everything CURRENTLY the same,
// and stops at anything already painted differently and at the coastline. So outline a
// range, click inside, done. Erase is just a fill back to open ground.
function fill(cx, cy) {
  const A = DATA.acts[act], [w,h] = dims(), T = state[act].terrain;
  const sx = cx - A.bounds[0], sy = cy - A.bounds[1];
  if (sx < 0 || sy < 0 || sx >= w || sy >= h || !A.land[sy][sx]) return;
  const from = T[sy*w + sx];
  if (from === brush) return;
  const stack = [sx, sy];
  while (stack.length) {
    const y = stack.pop(), x = stack.pop();
    if (x < 0 || y < 0 || x >= w || y >= h) continue;
    if (!A.land[y][x]) continue;
    const i = y*w + x;
    if (T[i] !== from) continue;
    T[i] = brush; paintPixel(i, brush);
    stack.push(x+1, y, x-1, y, x, y+1, x, y-1);
  }
}

// --- render -----------------------------------------------------------------
function render() {
  [...screens.children].forEach(b => b.classList.toggle("on", b.dataset.screen === screen));
  [...actbar.children].forEach(b => b.classList.toggle("on", b.dataset.act === act));
  [...brushBar.children].forEach(b => b.classList.toggle("on", b.dataset.code === brush));
  [...modeBar.children].forEach(b => b.classList.toggle("on", b.dataset.mode === mode));
  document.getElementById("modehint").textContent = mode === "fill"
    ? "Click inside an area to flood it with the selected terrain. It stops at anything already painted and at the coast."
    : "Drag to paint. Erase puts cells back to open ground — nothing joins up behind it.";
  document.getElementById("paneLandmarks").classList.toggle("hide", screen !== "landmarks");
  document.getElementById("paneTerrain").classList.toggle("hide", screen !== "terrain");
  document.getElementById("terrainTools").classList.toggle("hide", screen !== "terrain");

  const A = DATA.acts[act], S = state[act], [w,h] = dims();
  cv.width = w * PX; cv.height = h * PX;
  const draw = () => {
    ctx.imageSmoothingEnabled = false;
    ctx.clearRect(0,0,cv.width,cv.height);
    ctx.drawImage(imgs[act], 0, 0, cv.width, cv.height);
    layerCtx.putImageData(layerImg, 0, 0);
    ctx.drawImage(layer, 0, 0, cv.width, cv.height);
    ctx.strokeStyle = "rgba(120,140,170,.20)"; ctx.lineWidth = 1;
    for (let x = 0; x <= cv.width; x += PX*10) { ctx.beginPath(); ctx.moveTo(x,0); ctx.lineTo(x,cv.height); ctx.stroke(); }
    for (let y = 0; y <= cv.height; y += PX*10) { ctx.beginPath(); ctx.moveTo(0,y); ctx.lineTo(cv.width,y); ctx.stroke(); }
    A.landmarks.forEach(l => {
      const p = S.marks[l.name]; if (!p) return;
      const x = (p[0]-A.bounds[0])*PX + PX/2, y = (p[1]-A.bounds[1])*PX + PX/2;
      ctx.beginPath(); ctx.arc(x, y, Math.max(4, PX*1.7), 0, 7);
      ctx.fillStyle = DATA.kindRgb[l.kind]; ctx.fill();
      ctx.lineWidth = 2; ctx.strokeStyle = "#fff"; ctx.stroke();
    });
  };
  if (!imgs[act].complete) imgs[act].onload = draw; else draw();

  if (screen === "landmarks") {
    list.innerHTML = "";
    A.landmarks.forEach((l, i) => {
      const li = document.createElement("li");
      const p = S.marks[l.name];
      li.className = (i === sel ? "sel " : "") + (p ? "done " : "") + (l.note.indexOf("NEW") === 0 ? "isnew" : "");
      li.innerHTML = '<span class="dot" style="background:' + DATA.kindRgb[l.kind] + '"></span>' +
        '<span class="nm"><b>' + l.name + '</b><i>' + l.kind + (l.note ? " &middot; " + l.note : "") + '</i>' +
        (p ? '<u>' + p[0] + ", " + p[1] + '</u>' : '') + '</span>';
      li.onclick = () => { sel = i; render(); };
      list.appendChild(li);
    });
  } else {
    const n = S.terrain.reduce((a,c) => a + (c !== "." ? 1 : 0), 0);
    document.getElementById("painted").textContent = n ? (n + " cells painted") : "nothing painted yet";
  }
  save();
}

// --- input ------------------------------------------------------------------
function cell(e) {
  const r = cv.getBoundingClientRect(), A = DATA.acts[act];
  const sx = cv.width / r.width;
  return [A.bounds[0] + Math.floor((e.clientX - r.left) * sx / PX),
          A.bounds[1] + Math.floor((e.clientY - r.top) * sx / PX)];
}
cv.addEventListener("pointerdown", e => {
  cv.setPointerCapture(e.pointerId);
  const [x,y] = cell(e);
  if (screen === "landmarks") {
    const l = DATA.acts[act].landmarks[sel]; if (!l) return;
    state[act].marks[l.name] = [x,y];
    if (sel < DATA.acts[act].landmarks.length - 1) sel++;
    render();
  } else if (mode === "fill") { fill(x,y); render(); }
  else { drawing = true; stamp(x,y); render(); }
});
cv.addEventListener("pointermove", e => {
  const [x,y] = cell(e), A = DATA.acts[act];
  const ly = y - A.bounds[1], lx = x - A.bounds[0];
  const ok = ((A.gamePassable[ly] || [])[lx]);
  const isLand = ((A.land[ly] || [])[lx]);
  hint.innerHTML = "Cell <b>" + x + ", " + y + "</b> &mdash; " +
    (!isLand ? "sea" : ok ? "walkable in the game" : '<span class="warn">NOT walkable in the game here</span>');
  if (drawing && screen === "terrain" && mode === "paint") { stamp(x,y); render(); }
});
window.addEventListener("pointerup", () => { drawing = false; });

document.getElementById("clrT").onclick = () => {
  if (!confirm("Clear all painted terrain on act " + act + "? Landmarks are not touched.")) return;
  state[act].terrain.fill("."); buildLayer(); render();
};
document.getElementById("seed").onclick = () => {
  const pts = DATA.acts[act].priorBlockers || [];
  if (!pts.length) { alert("No earlier strokes saved for this act."); return; }
  const keep = brush; brush = "M";
  pts.forEach(p => stamp(p[0], p[1]));
  brush = keep; render();
};

// --- save / export ----------------------------------------------------------
function save() {
  try { localStorage.setItem("eduRpgTerrainPlanner", JSON.stringify(state)); } catch (e) {}
}
(function restore() {
  try {
    const raw = localStorage.getItem("eduRpgTerrainPlanner");
    if (!raw) return;
    const prev = JSON.parse(raw);
    for (const a of Object.keys(state)) {
      if (!prev[a]) continue;
      // Landmarks: keep the owner's saved edits, but never lose a marker that only
      // exists in the freshly built roster.
      state[a].marks = Object.assign({}, state[a].marks, prev[a].marks || {});
      if (Array.isArray(prev[a].terrain) && prev[a].terrain.length === state[a].terrain.length)
        state[a].terrain = prev[a].terrain;
    }
  } catch (e) {}
})();

function snapshot() {
  const out = {
    _source: "Owner-painted terrain + landmark placement, terrain-planner.html. World cells.",
    _terrainLegend: {".": "open ground (unpainted)", "F": "forest", "M": "mountain range",
                     "W": "water body", "R": "road"},
    acts: {}
  };
  for (const a of Object.keys(state)) {
    const A = DATA.acts[a], S = state[a], w = A.bounds[2]-A.bounds[0]+1, h = A.bounds[3]-A.bounds[1]+1;
    const rows = [];
    for (let y = 0; y < h; y++) rows.push(S.terrain.slice(y*w, y*w+w).join(""));
    out.acts[a] = { bounds: A.bounds, landmarks: S.marks, terrainRows: rows };
  }
  return out;
}
// Run-length form, so the whole map can be read back out of this page in one go
// without shipping 150k characters of mostly-empty rows.
function rleRow(s) {
  let out = "", c = s[0], n = 1;
  for (let i = 1; i <= s.length; i++) {
    if (i < s.length && s[i] === c) { n++; }
    else { out += c + n; c = s[i]; n = 1; }
  }
  return out;
}
window.plannerRead = function (a) {
  const A = DATA.acts[a], S = state[a], w = A.bounds[2]-A.bounds[0]+1, h = A.bounds[3]-A.bounds[1]+1;
  const rows = [];
  for (let y = 0; y < h; y++) rows.push(rleRow(S.terrain.slice(y*w, y*w+w).join("")));
  return JSON.stringify({act: a, bounds: A.bounds, size: [w, h],
                         landmarks: S.marks, painted: S.terrain.reduce((t,c)=>t+(c!=="."?1:0),0),
                         rle: rows.join("|")});
};
window.plannerStatus = function () {
  const o = {};
  for (const a of Object.keys(state))
    o[a] = {placed: Object.keys(state[a].marks).length,
            painted: state[a].terrain.reduce((t,c)=>t+(c!=="."?1:0),0)};
  return JSON.stringify(o);
};
document.getElementById("exp").onclick = () => {
  const text = JSON.stringify(snapshot());
  document.getElementById("out").value = text.slice(0, 4000) + (text.length > 4000 ? "\n\n… truncated for display — the downloaded file is complete." : "");
  const blob = new Blob([text], {type: "application/json"});
  const a = document.createElement("a");
  a.href = URL.createObjectURL(blob); a.download = "edu-rpg-terrain.json";
  document.body.appendChild(a); a.click(); a.remove();
};

buildLayer();
render();
</script>
"""


if __name__ == "__main__":
    main()
