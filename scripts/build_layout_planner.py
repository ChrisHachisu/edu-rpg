#!/usr/bin/env python3
"""Build the owner-facing LAYOUT PLANNER: coastline outlines you place landmarks on.

Owner, 2026-07-29: "you give me all maps with only the outline in a format where i
can place each landmark manually, then you carve out a natural terrain with natural
blockers based on my landmark placement (i can also draw the paths and blockers if
that would help)".

That inverts the pipeline the right way round. The generator grows every clearing,
corridor and approach FROM the landmark positions, so placement is the input and
terrain is the output -- and six rounds of trying to fix the output while leaving
the input alone is what went wrong. This hands the input over.

Output is ONE self-contained HTML file. Open it, place the landmarks, optionally
draw the paths and the blockers, hit Export, and hand back the JSON. Coordinates
come out in world cells, the same space `LANDMARKS`, `landmark-roster.json` and
`WorldMapScene.ts` all use, so the result drops straight into the generator.

Deliberately shows ONLY the coastline. Any terrain drawn underneath would be the
terrain about to be replaced, and would bias placement toward the layout we are
trying to get away from.
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
PX = 6  # screen pixels per world cell in the planner

ACTS = {
    1: (16, 218, 163, 399), 2: (161, 222, 312, 399), 3: (163, 88, 314, 221),
    4: (163, 3, 314, 128), 5: (9, 7, 162, 217),
}

# Progression order, taken from QuestManager's prerequisite chain
# (owlsLesson -> herbCollection -> crystalGateQuest -> hauntedPath -> lunasProphecy
#  -> volcanicGate -> demonBarracksQuest -> kikisResolve -> portalRelics -> finalBattle),
# g2.STORY_CHAIN's overworld waypoints, and the hard entry gates in WorldMapScene
# (shadowCave needs stormHarpy; magmaTunnels and volcanicForge need sandGolem).
#
# kind: town | story | side | connector | portal
LANDMARKS = [
    # act, order, name, kind, note
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

KIND_RGB = {"town": "#eb785a", "story": "#aa5abe", "side": "#7f9dc4",
            "connector": "#e848a8", "portal": "#96805a"}


def outline_png(act: int, land: np.ndarray) -> str:
    """Coastline only, as a base64 PNG: land pale, water dark."""
    x0, y0, x1, y1 = ACTS[act]
    sub = land[y0:y1 + 1, x0:x1 + 1]
    img = np.zeros((*sub.shape, 3), dtype=np.uint8)
    img[...] = (24, 32, 48)
    img[sub] = (226, 230, 236)
    picture = Image.fromarray(img).resize(
        (sub.shape[1] * PX, sub.shape[0] * PX), Image.Resampling.NEAREST)
    buffer = io.BytesIO()
    picture.save(buffer, format="PNG", optimize=True)
    return base64.b64encode(buffer.getvalue()).decode()


def main() -> None:
    os.makedirs(OUT, exist_ok=True)
    land = np.load(os.path.join(PACK, "land-mask.npy"))
    # The game's own grid, so the planner can warn when a spot is water in the GAME
    # even though the art coastline says land. The two disagree; placement has to
    # satisfy the game, because that is where the player walks.
    runtime = np.asarray(json.load(open(os.path.join(MAPS, "runtime-overworld-grid.json"))),
                         dtype=np.int16)
    passable = np.isin(runtime, [0, 1, 5, 6, 7, 8, 9, 10, 11, 12, 13, 15, 16, 17, 18, 19, 20])

    acts_payload = {}
    for act in sorted(ACTS):
        x0, y0, x1, y1 = ACTS[act]
        acts_payload[str(act)] = {
            "bounds": [x0, y0, x1, y1],
            "png": outline_png(act, land),
            "gamePassable": passable[y0:y1 + 1, x0:x1 + 1].astype(np.uint8).tolist(),
            "landmarks": [{"name": n, "kind": k, "note": note}
                          for a, n, k, note in LANDMARKS if a == act],
        }
    payload = json.dumps({"px": PX, "acts": acts_payload, "kindRgb": KIND_RGB})
    html = TEMPLATE.replace("__PAYLOAD__", payload)
    path = os.path.join(OUT, "layout-planner.html")
    open(path, "w").write(html)
    size = os.path.getsize(path) / 1e6
    print(f"wrote {os.path.relpath(path, ROOT)}  ({size:.1f} MB)")
    for act in sorted(ACTS):
        n = len(acts_payload[str(act)]["landmarks"])
        print(f"  act{act}: {n} landmarks to place")


TEMPLATE = r"""<!doctype html><meta charset="utf-8">
<title>edu-rpg — landmark layout planner</title>
<style>
:root{color-scheme:dark}
*{box-sizing:border-box}
body{background:#14171b;color:#e6e6e6;font:14px/1.5 -apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif;margin:0;padding:18px}
h1{font-size:20px;margin:0 0 4px}
p.lede{color:#9aa4ae;margin:0 0 14px;max-width:90ch}
.tabs{display:flex;gap:6px;margin-bottom:12px}
.tabs button{background:#1b1f24;border:1px solid #2b3138;color:#c8d0d8;padding:7px 15px;border-radius:5px;cursor:pointer;font-size:14px}
.tabs button.on{background:#e0913a;border-color:#e0913a;color:#14171b;font-weight:600}
.wrap{display:flex;gap:16px;align-items:flex-start}
.side{width:330px;flex:0 0 auto}
.tools{display:flex;gap:6px;margin-bottom:10px;flex-wrap:wrap}
.tools button{background:#1b1f24;border:1px solid #2b3138;color:#c8d0d8;padding:6px 11px;border-radius:5px;cursor:pointer}
.tools button.on{background:#4f7fbf;border-color:#4f7fbf;color:#fff}
ol{list-style:none;counter-reset:n;margin:0;padding:0;max-height:70vh;overflow:auto}
li{counter-increment:n;display:flex;gap:9px;align-items:flex-start;background:#1b1f24;border:1px solid #2b3138;border-radius:5px;padding:7px 9px;margin-bottom:5px;cursor:pointer}
li:hover{border-color:#4f7fbf}
li.sel{border-color:#e0913a;background:#241f18}
li.done{opacity:.62}
li::before{content:counter(n);color:#6d767f;font-variant-numeric:tabular-nums;min-width:18px}
.dot{width:13px;height:13px;border-radius:50%;flex:0 0 auto;margin-top:3px;border:1px solid #0006}
.nm{flex:1}
.nm b{display:block;font-weight:600}
.nm i{font-style:normal;color:#8b949e;font-size:12px}
.nm u{text-decoration:none;color:#e0913a;font-variant-numeric:tabular-nums;font-size:12px}
canvas{border:1px solid #2b3138;border-radius:5px;cursor:crosshair;background:#14171b}
.hint{color:#7b858f;font-size:12.5px;margin:9px 0 0}
.warn{color:#e0913a}
textarea{width:100%;height:120px;background:#0f1216;color:#c8d0d8;border:1px solid #2b3138;border-radius:5px;font:12px/1.4 ui-monospace,Menlo,monospace;padding:8px;margin-top:9px}
</style>
<h1>Landmark layout planner</h1>
<p class="lede">Coastline only &mdash; no terrain, deliberately. Pick a landmark on the left, click the map to place it.
The order is the progression order. Terrain, clearings and corridors get grown around whatever you place, so this is
the input, not a suggestion. Optionally draw the route and any blockers you want. Then <b>Export</b> and send the JSON back.</p>
<div class="tabs" id="tabs"></div>
<div class="wrap">
  <div class="side">
    <div class="tools">
      <button data-tool="place" class="on">Place landmark</button>
      <button data-tool="path">Draw path</button>
      <button data-tool="block">Draw blocker</button>
      <button data-tool="erase">Erase drawing</button>
    </div>
    <ol id="list"></ol>
    <div class="tools" style="margin-top:10px">
      <button id="exp">Export JSON</button><button id="clr">Clear this act</button>
    </div>
    <textarea id="out" placeholder="Export output appears here — copy it back to Claude"></textarea>
  </div>
  <div>
    <canvas id="cv"></canvas>
    <p class="hint" id="hint">Cell &mdash;</p>
  </div>
</div>
<script>
const DATA = __PAYLOAD__;
const PX = DATA.px;
let act = "1", tool = "place", sel = 0, drawing = false;
const state = {};   // act -> {marks:{name:[x,y]}, path:[[x,y]...], block:[[x,y]...]}
for (const a of Object.keys(DATA.acts)) state[a] = {marks:{}, path:[], block:[]};
const imgs = {};
for (const a of Object.keys(DATA.acts)) { const i = new Image(); i.src = "data:image/png;base64," + DATA.acts[a].png; imgs[a] = i; }

const cv = document.getElementById("cv"), ctx = cv.getContext("2d");
const tabs = document.getElementById("tabs"), list = document.getElementById("list"), hint = document.getElementById("hint");

Object.keys(DATA.acts).forEach(a => {
  const b = document.createElement("button");
  b.textContent = "Act " + a; b.onclick = () => { act = a; sel = 0; render(); };
  tabs.appendChild(b);
});

function render() {
  [...tabs.children].forEach((b, i) => b.classList.toggle("on", Object.keys(DATA.acts)[i] === act));
  const A = DATA.acts[act], S = state[act];
  cv.width = (A.bounds[2] - A.bounds[0] + 1) * PX;
  cv.height = (A.bounds[3] - A.bounds[1] + 1) * PX;
  const draw = () => {
    ctx.clearRect(0, 0, cv.width, cv.height);
    ctx.drawImage(imgs[act], 0, 0, cv.width, cv.height);
    ctx.strokeStyle = "rgba(120,140,170,.18)"; ctx.lineWidth = 1;
    for (let x = 0; x <= cv.width; x += PX * 10) { ctx.beginPath(); ctx.moveTo(x, 0); ctx.lineTo(x, cv.height); ctx.stroke(); }
    for (let y = 0; y <= cv.height; y += PX * 10) { ctx.beginPath(); ctx.moveTo(0, y); ctx.lineTo(cv.width, y); ctx.stroke(); }
    ctx.lineCap = "round";
    ctx.strokeStyle = "#c8a05a"; ctx.lineWidth = PX * 1.6;
    strokes(S.path);
    ctx.strokeStyle = "#7a8794"; ctx.lineWidth = PX * 2.6;
    strokes(S.block);
    A.landmarks.forEach(l => {
      const p = S.marks[l.name]; if (!p) return;
      const cx = (p[0] - A.bounds[0]) * PX + PX / 2, cy = (p[1] - A.bounds[1]) * PX + PX / 2;
      ctx.beginPath(); ctx.arc(cx, cy, PX * 1.9, 0, 7); ctx.fillStyle = DATA.kindRgb[l.kind];
      ctx.fill(); ctx.lineWidth = 2; ctx.strokeStyle = "#fff"; ctx.stroke();
    });
  };
  if (!imgs[act].complete) imgs[act].onload = draw; else draw();
  list.innerHTML = "";
  A.landmarks.forEach((l, i) => {
    const li = document.createElement("li");
    li.className = (i === sel ? "sel " : "") + (S.marks[l.name] ? "done" : "");
    const p = S.marks[l.name];
    li.innerHTML = `<span class="dot" style="background:${DATA.kindRgb[l.kind]}"></span>
      <span class="nm"><b>${l.name}</b><i>${l.kind}${l.note ? " &middot; " + l.note : ""}</i>
      ${p ? `<u>${p[0]}, ${p[1]}</u>` : ""}</span>`;
    li.onclick = () => { sel = i; render(); };
    list.appendChild(li);
  });
}
function strokes(pts) {
  if (!pts.length) return;
  const A = DATA.acts[act];
  ctx.beginPath();
  pts.forEach((p, i) => {
    if (p === null) { return; }
    const cx = (p[0] - A.bounds[0]) * PX + PX / 2, cy = (p[1] - A.bounds[1]) * PX + PX / 2;
    if (i === 0 || pts[i - 1] === null) ctx.moveTo(cx, cy); else ctx.lineTo(cx, cy);
  });
  ctx.stroke();
}
function cell(e) {
  const r = cv.getBoundingClientRect(), A = DATA.acts[act];
  return [A.bounds[0] + Math.floor((e.clientX - r.left) / PX), A.bounds[1] + Math.floor((e.clientY - r.top) / PX)];
}
cv.addEventListener("mousemove", e => {
  const [x, y] = cell(e), A = DATA.acts[act];
  const ok = (A.gamePassable[y - A.bounds[1]] || [])[x - A.bounds[0]];
  hint.innerHTML = `Cell <b>${x}, ${y}</b> &mdash; ` + (ok ? "walkable in the game"
    : `<span class="warn">NOT walkable in the game here</span>`);
  if (drawing && tool !== "place") { paint(x, y); render(); }
});
function paint(x, y) {
  const S = state[act];
  if (tool === "path") S.path.push([x, y]);
  else if (tool === "block") S.block.push([x, y]);
  else if (tool === "erase") {
    const near = p => p && Math.hypot(p[0] - x, p[1] - y) > 3;
    S.path = S.path.filter(near); S.block = S.block.filter(near);
  }
}
cv.addEventListener("mousedown", e => {
  const [x, y] = cell(e);
  if (tool === "place") {
    const l = DATA.acts[act].landmarks[sel]; if (!l) return;
    state[act].marks[l.name] = [x, y];
    if (sel < DATA.acts[act].landmarks.length - 1) sel++;
  } else { drawing = true; state[act].path.push(null); state[act].block.push(null); paint(x, y); }
  render();
});
window.addEventListener("mouseup", () => { drawing = false; });
document.querySelectorAll(".tools button[data-tool]").forEach(b => b.onclick = () => {
  tool = b.dataset.tool;
  document.querySelectorAll(".tools button[data-tool]").forEach(o => o.classList.toggle("on", o === b));
});
document.getElementById("clr").onclick = () => { state[act] = {marks:{}, path:[], block:[]}; sel = 0; render(); };
function snapshot() {
  const out = {};
  for (const a of Object.keys(state)) {
    const S = state[a];
    if (!Object.keys(S.marks).length && !S.path.length && !S.block.length) continue;
    out[a] = {landmarks: S.marks,
              path: S.path.filter(Boolean), blockers: S.block.filter(Boolean)};
  }
  return out;
}
// Autosave on every edit. The first version of this tool kept the whole layout in
// page memory and the Export button only SELECTED the textarea -- so a closed tab
// meant the work was gone, and nothing was ever written to disk.
function save() { try { localStorage.setItem("eduRpgLayout", JSON.stringify(state)); } catch (e) {} }
(function restore() {
  try {
    const raw = localStorage.getItem("eduRpgLayout");
    if (raw) Object.assign(state, JSON.parse(raw));
  } catch (e) {}
})();
document.getElementById("exp").onclick = () => {
  const text = JSON.stringify(snapshot(), null, 1);
  document.getElementById("out").value = text;
  document.getElementById("out").select();
  // and actually put a file on disk, in Downloads
  const blob = new Blob([text], {type: "application/json"});
  const a = document.createElement("a");
  a.href = URL.createObjectURL(blob); a.download = "edu-rpg-layout.json";
  document.body.appendChild(a); a.click(); a.remove();
};
const _render = render;
render = function () { _render(); save(); };
render();
</script>
"""


if __name__ == "__main__":
    main()
