"""Hand-authored footprints for the Codex town plates, measured by eye on the 5-cell gridded views
($SCRATCH/acts/towns/codexfin/<id>-grid.png). Written out in Act 1's format
(design/act1-towns/<town>-authored-obstacles.json: nonWalkableBands[].polygonArt, art px of the
1950 plate) plus walkableExemptions (stairs, bridges, gate passages) and the service spots.
Cells here; x30 on write. A rect is [x0, y0, x1, y1]; a polygon is a list of [x, y]."""
import json
import os

T = {
 "ironkeep": dict(
   lanes=[[29.5, 44, 35.5, 65], [11, 45.5, 57, 49], [26, 35, 39, 46], [29.5, 30, 35.5, 36], [26, 21, 40, 30.5], [36, 28.5, 52, 30.5], [29.5, 16.5, 35.5, 23], [20, 15.5, 49, 18], [29, 12, 40, 16]],
   obst=[[30, 37, 34.3, 42.3], [29.5, 14, 31.8, 16]],
   seeds=[[30.5, 24, 34.5, 28], [37, 15, 44, 16.8], [10, 46, 20, 47.6], [42, 47, 52, 48.4]],
   bands={"forge": [7.5, 2, 29, 15.5], "house-north": [32, 3, 42.5, 12.3], "mine": [49, 6, 61, 17.5],
          "house-west": [9, 17, 28, 30.3], "houses-east": [37.5, 20, 60, 30.3],
          "healer": [6, 33, 25.5, 45.5], "shop-forge-counter": [39, 34.5, 62, 46.3]},
   exempt={"stairs-upper": [29.5, 16.5, 35.5, 23], "stairs-lower": [29.5, 29.8, 35.5, 36.3]},
   shop=[47.5, 47.6], healer=[15.5, 47.2]),
 "frostwatch": dict(
   lanes=[[29.7, 10.5, 35.3, 65], [6.6, 20, 58.4, 24.5], [27, 24.5, 42, 34.5], [11, 41.3, 29.7, 44], [8.5, 51.3, 29.7, 53.5]],
   obst=[[30.5, 27, 34.5, 31]],
   seeds=[[11, 41.6, 20, 42.8]],
   bands={"wall-north": [2, 2.5, 63, 10.3], "tower": [29, 0, 36, 12.5], "wall-west": [2, 2.5, 6.6, 62],
          "wall-east": [58.4, 2.5, 63, 62], "wall-south": [2, 53.6, 63, 62],
          "barracks-nw": [8, 9, 28, 19], "shop": [38.5, 8.5, 57, 19], "shed": [7, 26, 13.5, 30.5],
          "cottage-a": [6, 31, 18.5, 41], "cottage-b": [18.5, 30.5, 28.5, 41],
          "barracks-e": [37.5, 35, 58.5, 47], "healer": [8.5, 42, 23, 51.3], "pond": [43, 25, 55.5, 33.5]},
   exempt={"gate-passage": [30.4, 53, 34.3, 65]},
   shop=[48.5, 20.6], healer=[15.5, 52.4]),
 "hauntedVillage": dict(
   lanes=[[28, 44, 37, 65], [27, 22, 34, 44], [27, 13, 37, 22], [34, 21.4, 62, 24.5], [3, 20, 27, 24.5], [27, 35, 40, 46], [36, 55, 60, 58.5], [8, 54.5, 28, 58.5]],
   obst=[[30, 37.5, 35, 43]],
   seeds=[[6, 21, 20, 23], [25, 11, 27.5, 20], [43, 22, 58, 23.5], [10, 55.5, 22, 57.5], [44, 55.8, 58, 57.5]],
   bands={"chapel": [5, 2, 18.5, 21], "house-north": [26.5, 2, 42, 15.5], "shop": [42.5, 5, 62, 21.3],
          "graveyard": [30, 22.3, 64, 37.5], "house-west": [4.5, 23, 24, 39], "healer": [3.5, 40, 23, 54.5],
          "house-east": [42.5, 39, 61.5, 55]},
   exempt={}, shop=[51, 22.6], healer=[13, 55.6]),
 "oasisHaven": dict(
   lanes=[[29.5, 38, 37.5, 65], [20, 12.5, 46, 17], [17, 17, 23, 40], [46, 14, 49, 36], [20, 36.5, 47, 40], [48.5, 32.5, 63, 35], [46, 33, 49, 40], [11, 44, 22.7, 47.7], [22, 43.6, 31, 46.2], [5, 31.5, 18, 34], [17, 31, 21, 36]],
   obst=[[31.5, 35.5, 35, 38.3]],
   seeds=[[19, 22, 21, 30], [26, 13, 38, 15], [44.5, 22, 46.5, 30], [41, 35, 46, 37.5], [12, 33, 19, 34.5]],
   bands={"house-n": [24.5, 0.5, 40.5, 12.5], "house-ne": [43.5, 1, 53.5, 13.5], "house-nw": [7, 8, 20.5, 18.8],
          "stall-w": [5, 20.5, 18, 31.5], "pond": [23, 17, 46, 36.5], "shop": [48.8, 19.5, 63, 32.5],
          "healer": [8.5, 35.5, 20.5, 46], "house-se": [44.5, 39, 59, 50.5],
          "tent-a": [23.3, 46.3, 29.5, 51.7], "tent-b": [37.5, 45.5, 44, 51.5]},
   exempt={}, shop=[55.5, 33.4], healer=[16.5, 46.3], gate=55.5),
 "ruinsCamp": dict(
   lanes=[[30, 12.5, 35.5, 65], [38.6, 33.3, 63, 37], [38.6, 12, 49, 20], [26, 12.5, 43, 15], [12, 15, 30, 18], [5, 54, 30, 57.5], [38.6, 48, 52, 54], [38.6, 12, 42.5, 48], [35.5, 13, 39, 16.5], [35.5, 26, 39, 33.3], [35.5, 38.5, 39, 41.5]],
   obst=[[31, 36, 35, 39.5]],
   bands={"dig-office": [26, 1, 43, 12.5], "pit": [3, 18, 26, 41], "shop": [41, 20, 63, 33.3],
          "tent-nw": [10, 9.5, 16.5, 15], "tent-ne": [49.5, 10.5, 59, 19], "tent-e": [51.5, 35, 60, 43],
          "tent-se1": [42.5, 41, 51.5, 48], "tent-se2": [52, 44, 62, 53], "healer": [4.5, 42, 23, 54]},
   exempt={}, shop=[51.5, 34.4], healer=[17.5, 55.4],
   seeds=[[44, 15.5, 47, 18]]),
 "embersRest": dict(
   lanes=[[29.5, 48, 36, 65], [22, 33, 41, 50], [31, 21, 35, 33.5], [26, 13.5, 47, 21], [6.5, 19, 47, 21.5], [11.2, 21.5, 14.2, 33], [11, 33, 26, 35], [7, 48, 30, 51], [40, 45.5, 61, 48.5], [36, 45.5, 41, 50], [36, 48.5, 47.5, 51.5]],
   obst=[[29.5, 39.5, 35, 45]],
   seeds=[[9, 48.2, 20, 49.8], [28, 14.5, 40, 16.5]],
   bands={"forge": [6.5, 3, 26, 19], "house-n": [27.5, 1.5, 42, 14], "house-ne": [43, 4, 60, 19.5],
          "lava": [0, 21.5, 65, 33], "healer": [6, 34, 23.5, 48], "shop": [40, 31, 61, 45.5],
          "house-se": [47.5, 47.5, 61, 57.5]},
   exempt={"bridge-west": [11.2, 21.5, 14.2, 33], "bridge-centre": [31, 21, 35, 33.5]},
   shop=[48, 46.8], healer=[13, 49.4]),
 "cinderwatch": dict(
   lanes=[[30.4, 12, 34.6, 65], [6.4, 25, 59.3, 28], [10, 39.3, 56, 41.6], [28, 24, 38, 33]],
   obst=[[30.2, 27, 34.6, 31]],
   seeds=[[45, 25.5, 55, 27], [12, 40.3, 25, 41.7]],
   bands={"tower": [29, 0, 36, 12],
          "wall-north": [[3, 25], [5, 15], [11, 9], [20, 5.5], [29, 4], [36, 4], [45, 5.5], [54, 9], [60, 15],
                         [62.5, 25], [60.6, 25], [57.5, 14.5], [51, 10.5], [36, 9.6], [29, 9.6], [15, 10.5],
                         [8.5, 14.5], [4.6, 25]],
          "wall-west": [2, 20, 4.6, 44], "wall-east": [60.6, 20, 63.5, 44],
          "wall-south-w": [2, 41.6, 30.3, 47], "wall-south-e": [34.7, 41.6, 63.5, 47],
          "lava-w": [0, 44, 30.3, 58.5], "lava-e": [34.7, 44, 65, 58.5],
          "mill": [9, 9, 28, 25], "house-ne": [37, 9.5, 55, 22.5], "healer": [7.5, 26, 25, 39.3],
          "shop": [40, 23, 58, 38.6]},
   exempt={"gate-passage": [30.4, 41.6, 34.6, 65]},
   shop=[46, 40.1], healer=[18, 40.4], save=[36.4, 32.0]),
 "lastBastion": dict(
   lanes=[[29.6, 15, 35.8, 65], [26, 15, 40, 17], [5.6, 23, 59.6, 26], [26, 26, 39.5, 39.5], [5.6, 39.5, 59.6, 42], [9, 50.3, 30.6, 53.3]],
   obst=[[30.6, 29.5, 34.6, 34.5]],
   seeds=[[9, 25.2, 20, 26.4], [11, 40.2, 22, 41.4], [43, 25.2, 57, 26.4], [43, 40.2, 57, 41.4], [26, 15.2, 40, 16.4]],
   bands={"keep": [22, 0, 44, 15], "house-nw": [8.5, 11, 25.5, 23], "house-ne": [39, 11, 57.5, 23],
          "house-w": [7, 26, 24, 38], "shop": [41, 26, 59, 38.6], "healer": [9, 42.3, 25.5, 50.3],
          "house-se": [39.5, 42.3, 57.5, 51]},
   rings={"curtain-wall": dict(
       outer=[[1.5, 10], [8.5, 3.5], [57.5, 3.5], [63.5, 10], [63.5, 51.5], [57.5, 61], [8.5, 61], [1.5, 51.5]],
       inner=[[5.6, 12.5], [11, 8.2], [55, 8.2], [59.6, 12.5], [59.6, 48.5], [55, 53.3], [11, 53.3], [5.6, 48.5]])},
   exempt={"gate-passage": [30.6, 52, 35.1, 65]},
   shop=[50, 39.6], healer=[17, 51.2]),
 "havensEdge": dict(
   lanes=[[29.5, 8, 36, 65], [6.5, 18, 40, 22], [36, 34.3, 57, 39], [12, 33.5, 30, 38], [8, 52.3, 30, 55.5], [30, 14, 40, 16.5], [36, 53.5, 57, 56]],
   obst=[[31, 21.5, 34.5, 25]],
   seeds=[[40, 36, 50, 37.8], [8, 20.3, 20, 21.7], [14, 51.5, 22, 53.5]],
   bands={"void": [[36, 0], [65, 0], [65, 48], [61, 40], [57, 22], [52, 16], [46, 10], [44, 4]],
          "house-nw": [9, 2, 30, 18], "house-n": [30, 2, 41, 14], "house-w": [6.5, 22, 24, 33.5],
          "shop": [37, 20, 59.5, 34.3], "healer": [6, 38, 26, 52.3], "house-se": [42.5, 39, 56.5, 53.5]},
   exempt={}, shop=[48, 35.6], healer=[16, 53.2]),
}


def poly(v):
    if len(v) == 4 and not isinstance(v[0], list):
        x0, y0, x1, y1 = v
        v = [[x0, y0], [x1, y0], [x1, y1], [x0, y1]]
    return [[round(x * 30), round(y * 30)] for x, y in v]


if __name__ == "__main__":
    out = os.path.join(os.path.dirname(os.path.abspath(__file__)), "authored")
    os.makedirs(out, exist_ok=True)
    for tid, t in T.items():
        d = {"_comment": "Authored on the Codex plate (round 3), Act 1 format. Art px of the 1950 plate.",
             "nonWalkableBands": [{"id": k, "polygonArt": poly(v)} for k, v in t["bands"].items()],
             "nonWalkableRings": [{"id": k, "outerArt": poly(r["outer"]), "innerArt": poly(r["inner"])}
                                  for k, r in t.get("rings", {}).items()],
             "walkableExemptions": [{"id": k, "polygonArt": poly(v)} for k, v in t["exempt"].items()],
             "walkableLanesArt": [{"id": f"lane-{i}", "polygonArt": poly(v)} for i, v in enumerate(t["lanes"])],
             "staticObstaclesArt": [{"id": f"obstacle-{i}", "polygonArt": poly(v)} for i, v in enumerate(t["obst"])],
             "saveCell": t.get("save"),
             "gateRowCell": t.get("gate"),
             "shopCounterCell": t["shop"], "healerCell": t["healer"], "pavingSeeds": t.get("seeds", [])}
        json.dump(d, open(os.path.join(out, f"{tid}-authored-obstacles.json"), "w"), indent=1)
    print("wrote", len(T))
