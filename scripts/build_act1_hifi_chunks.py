#!/usr/bin/env python3
"""Build deterministic bounded render chunks from the owner-locked Act 1 art."""

from __future__ import annotations

import hashlib
import json
import re
import shutil
from pathlib import Path

from PIL import Image


ROOT = Path(__file__).resolve().parents[1]
SOURCE = ROOT / "design/review/overworld-art-blueprint/act-by-act/act1/generated/act1-v4-routing-corrections-v3-2368x2912.png"
RUNTIME_DATA = ROOT / "public/act1-world-map.js"
OUTPUT = ROOT / "design/review/overworld-art-blueprint/act-by-act/act1/runtime-v2"
DETAIL_REGION_SPECS = [
    {
        "id": "millbrook-west-912-v1",
        "x": 1088, "y": 1536, "width": 512, "height": 512,
        "base": "central-east-912-v1/millbrook-west-lattice-912-runtime-v1.png",
        "water": "central-east-912-v1/millbrook-west-lattice-912-water-runtime-v1.png",
        "occlusion": "central-east-912-v1/millbrook-west-lattice-912-occlusion-runtime-v1.png",
    },
    {
        "id": "millbrook-port-912-v1",
        "x": 1504, "y": 1536, "width": 512, "height": 512,
        "base": "central-east-912-v1/millbrook-port-lattice-912-runtime-v1.png",
        "water": "central-east-912-v1/millbrook-port-lattice-912-water-runtime-v1.png",
        "occlusion": "central-east-912-v1/millbrook-port-lattice-912-occlusion-runtime-v1.png",
    },
    {
        "id": "north-fork-912-v1",
        "x": 1600, "y": 1088, "width": 512, "height": 512,
        "base": "central-east-912-v1/north-fork-lattice-912-runtime-v1.png",
        "water": "central-east-912-v1/north-fork-lattice-912-water-runtime-v1.png",
        "occlusion": "central-east-912-v1/north-fork-lattice-912-occlusion-runtime-v1.png",
    },
    {
        "id": "darkfang-mid-912-v1",
        "x": 1472, "y": 736, "width": 512, "height": 512,
        "base": "central-east-912-v1/darkfang-mid-lattice-912-runtime-v1.png",
        "water": "central-east-912-v1/darkfang-mid-lattice-912-water-runtime-v1.png",
        "occlusion": "central-east-912-v1/darkfang-mid-lattice-912-occlusion-runtime-v1.png",
        "routeAffinity": [{"routeId": "port-sapphire-to-darkfang"}],
    },
    {
        "id": "darkfang-bridge-912-v1",
        "x": 1344, "y": 480, "width": 512, "height": 512,
        "base": "central-east-912-v1/darkfang-bridge-lattice-912-runtime-v1.png",
        "water": "central-east-912-v1/darkfang-bridge-lattice-912-water-runtime-v1.png",
        "occlusion": "central-east-912-v1/darkfang-bridge-lattice-912-occlusion-runtime-v1.png",
        "routeAffinity": [{"routeId": "port-sapphire-to-darkfang"}],
    },
    {
        "id": "darkfang-north-912-v1",
        "x": 1184, "y": 288, "width": 512, "height": 512,
        "base": "central-east-912-v1/darkfang-north-lattice-912-runtime-v1.png",
        "water": "central-east-912-v1/darkfang-north-lattice-912-water-runtime-v1.png",
        "occlusion": "central-east-912-v1/darkfang-north-lattice-912-occlusion-runtime-v1.png",
        "routeAffinity": [{"routeId": "port-sapphire-to-darkfang"}],
    },
    {
        "id": "crystal-approach-south-912-v1",
        "x": 1792, "y": 1056, "width": 512, "height": 512,
        "base": "central-east-912-v1/crystal-approach-south-lattice-912-runtime-v1.png",
        "water": "central-east-912-v1/crystal-approach-south-lattice-912-water-runtime-v1.png",
        "occlusion": "central-east-912-v1/crystal-approach-south-lattice-912-occlusion-runtime-v1.png",
        "routeAffinity": [{"routeId": "port-sapphire-to-crystal-cave"}],
        "visualExclusions": [{
            "shape": "circle", "cx": 2166, "cy": 1132,
            "innerRadius": 38, "featherWorld": 24,
        }],
    },
    {
        "id": "crystal-approach-north-912-v1",
        "x": 1792, "y": 736, "width": 512, "height": 512,
        "base": "central-east-912-v1/crystal-approach-north-lattice-912-runtime-v1.png",
        "water": "central-east-912-v1/crystal-approach-north-lattice-912-water-runtime-v1.png",
        "occlusion": "central-east-912-v1/crystal-approach-north-lattice-912-occlusion-runtime-v1.png",
        "routeAffinity": [{
            "routeId": "port-sapphire-to-crystal-cave",
            "preloadMinProgress": 9.25,
            "drawMinProgress": 10.51,
        }],
        "visualExclusions": [{
            "shape": "circle", "cx": 2166, "cy": 1132,
            "innerRadius": 38, "featherWorld": 24,
        }],
    },
    {
        "id": "port-sapphire-pixel-source-912-v1",
        "x": 1856, "y": 1584, "width": 512, "height": 512,
        "base": "port-pixel-source/port-sapphire-lattice-912-runtime-v1.png",
        "water": "port-pixel-source/port-sapphire-lattice-912-water-runtime-v1.png",
        "occlusion": "port-pixel-source/port-sapphire-lattice-912-occlusion-runtime-v1.png",
    },
    {
        "id": "whispering-approach-912-v1",
        "x": 512, "y": 1216, "width": 512, "height": 512,
        "base": "western-hub-912-v1/whispering-approach-lattice-912-runtime-v1.png",
        "water": "western-hub-912-v1/whispering-approach-lattice-912-water-runtime-v1.png",
        "occlusion": "western-hub-912-v1/whispering-approach-lattice-912-occlusion-runtime-v1.png",
    },
    {
        "id": "greenhollow-hub-912-v1",
        "x": 320, "y": 1664, "width": 512, "height": 512,
        "base": "western-hub-912-v1/greenhollow-hub-lattice-912-runtime-v1.png",
        "water": "western-hub-912-v1/greenhollow-hub-lattice-912-water-runtime-v1.png",
        "occlusion": "western-hub-912-v1/greenhollow-hub-lattice-912-occlusion-runtime-v1.png",
    },
    {
        "id": "sunken-approach-912-v1",
        "x": 224, "y": 2112, "width": 512, "height": 512,
        "base": "western-hub-912-v1/sunken-approach-lattice-912-runtime-v1.png",
        "water": "western-hub-912-v1/sunken-approach-lattice-912-water-runtime-v1.png",
        "occlusion": "western-hub-912-v1/sunken-approach-lattice-912-occlusion-runtime-v1.png",
    },
    {
        "id": "greenhollow-millbrook-912-v1",
        "x": 704, "y": 1728, "width": 512, "height": 512,
        "base": "western-hub-912-v1/greenhollow-millbrook-lattice-912-runtime-v1.png",
        "water": "western-hub-912-v1/greenhollow-millbrook-lattice-912-water-runtime-v1.png",
        "occlusion": "western-hub-912-v1/greenhollow-millbrook-lattice-912-occlusion-runtime-v1.png",
    },
    {
        "id": "sunken-deep-912-v1",
        "x": 224, "y": 2240, "width": 512, "height": 512,
        "base": "deep-sunken-outer-west-912-v1/sunken-deep-lattice-912-runtime-v1.png",
        "water": "deep-sunken-outer-west-912-v1/sunken-deep-lattice-912-water-runtime-v1.png",
        "occlusion": "deep-sunken-outer-west-912-v1/sunken-deep-lattice-912-occlusion-runtime-v1.png",
    },
    {
        "id": "millbrook-outer-west-912-v1",
        "x": 1152, "y": 1952, "width": 512, "height": 512,
        "base": "deep-sunken-outer-west-912-v1/millbrook-outer-west-lattice-912-runtime-v1.png",
        "water": "deep-sunken-outer-west-912-v1/millbrook-outer-west-lattice-912-water-runtime-v1.png",
        "occlusion": "deep-sunken-outer-west-912-v1/millbrook-outer-west-lattice-912-occlusion-runtime-v1.png",
    },
    {
        "id": "coastal-channel-912-v1",
        "x": 1696, "y": 1888, "width": 512, "height": 512,
        "base": "coastal-reef-912-v1/coastal-channel-lattice-912-runtime-v1.png",
        "water": "coastal-reef-912-v1/coastal-channel-lattice-912-water-runtime-v1.png",
        "occlusion": "coastal-reef-912-v1/coastal-channel-lattice-912-occlusion-runtime-v1.png",
        "routeAffinity": [{"routeId": "port-sapphire-to-coastal-reef"}],
    },
    {
        "id": "coastal-reef-912-v1",
        "x": 1568, "y": 2144, "width": 512, "height": 512,
        "base": "coastal-reef-912-v1/coastal-reef-lattice-912-runtime-v1.png",
        "water": "coastal-reef-912-v1/coastal-reef-lattice-912-water-runtime-v1.png",
        "occlusion": "coastal-reef-912-v1/coastal-reef-lattice-912-occlusion-runtime-v1.png",
        "routeAffinity": [{"routeId": "port-sapphire-to-coastal-reef"}],
    },
]
CHUNK = 512
EXPECTED_SHA256 = "7f4b0b9be8633a1a16946cf90b7794f306d7b268d4ecb54381998a1fc55774fd"
ART_WARP_CONTROLS = [
    {"cell": [130, 290], "art": [2114, 1840]},
    {"cell": [130, 291], "art": [2108, 1860]},
    {"cell": [142, 291], "art": [2067, 1955]},
    {"cell": [142, 310], "art": [2010, 2110]},
    {"cell": [143, 325], "art": [1900, 2260]},
    {"cell": [142, 338], "art": [1810, 2325]},
    {"cell": [140, 345], "art": [1730, 2380]},
    {"cell": [140, 350], "art": [1690, 2410]},
]

ROUTE_SPECS = [
    {
        "id": "greenhollow-to-sunken-cellar",
        "fromLandmarkId": "greenhollow",
        "toLandmarkId": "sunkenCellar",
        "fromThreshold": (60, 340),
        "toThreshold": (45, 350),
        "waypoints": [(60, 341), (45, 349)],
        "artControls": [
            ((60, 340), (677, 1957)), ((60, 341), (710, 1982)),
            ((55, 341), (650, 2035)), ((50, 341), (595, 2110)),
            ((45, 341), (535, 2190)), ((45, 345), (455, 2260)),
            ((45, 349), (358, 2462)), ((45, 350), (335, 2498)),
        ],
        "points": [
            (677, 1957, 14), (710, 1982, 18), (650, 2035, 18),
            (595, 2110, 16), (535, 2190, 15), (455, 2260, 14),
            (390, 2350, 13), (358, 2462, 12), (335, 2498, 10),
        ],
    },
    {
        "id": "greenhollow-to-whispering-woods-cave",
        "fromLandmarkId": "greenhollow",
        "toLandmarkId": "whisperingWoodsCave",
        "fromThreshold": (60, 340),
        "toThreshold": (80, 310),
        "waypoints": [(60, 341), (80, 311)],
        "artControls": [
            ((60, 340), (677, 1957)), ((60, 341), (710, 1982)),
            ((66, 341), (708, 1915)), ((72, 341), (690, 1810)),
            ((80, 341), (704, 1710)), ((80, 332), (750, 1605)),
            ((80, 322), (795, 1495)), ((80, 311), (805, 1422)),
            ((80, 310), (816, 1387)),
        ],
        "points": [
            (677, 1957, 14), (710, 1982, 18), (708, 1915, 14),
            (690, 1810, 14), (704, 1710, 16), (750, 1605, 14),
            (795, 1495, 12), (805, 1422, 10), (816, 1387, 10),
        ],
    },
    {
        "id": "greenhollow-to-millbrook",
        "fromLandmarkId": "greenhollow",
        "toLandmarkId": "millbrook",
        "fromThreshold": (60, 340),
        "toThreshold": (100, 320),
        "waypoints": [
            (60, 341), (80, 341), (80, 335), (100, 335), (100, 321),
        ],
        "artControls": [
            ((60, 340), (677, 1957)), ((60, 341), (710, 1982)),
            ((70, 341), (810, 1972)), ((80, 341), (920, 1965)),
            ((80, 335), (1050, 1960)), ((90, 335), (1138, 1968)),
            ((100, 335), (1170, 1970)), ((100, 321), (1198, 1972)),
            ((100, 320), (1234, 1995)),
        ],
        "points": [
            (677, 1957, 14), (710, 1982, 18), (810, 1972, 18),
            (920, 1965, 17), (1050, 1960, 15), (1138, 1968, 10),
            (1170, 1970, 10), (1198, 1972, 15), (1234, 1995, 13),
        ],
    },
    {
        "id": "millbrook-to-port-sapphire",
        "fromLandmarkId": "millbrook",
        "toLandmarkId": "portSapphire",
        "fromThreshold": (100, 320),
        "toThreshold": (130, 290),
        "waypoints": [(100, 321), (130, 291)],
        "artControls": [
            ((100, 320), (1234, 1995)), ((100, 321), (1198, 1972)),
            ((108, 321), (1280, 1935)), ((116, 321), (1360, 1870)),
            ((124, 321), (1440, 1790)), ((130, 321), (1530, 1735)),
            ((130, 312), (1650, 1660)), ((130, 303), (1780, 1625)),
            ((130, 296), (2025, 1650)), ((130, 291), (2108, 1860)),
            ((130, 290), (2114, 1840)),
        ],
        "points": [
            (1234, 1995, 13), (1198, 1972, 15), (1280, 1935, 15),
            (1360, 1870, 14), (1440, 1790, 14), (1530, 1735, 15),
            (1650, 1660, 17), (1780, 1625, 16), (1910, 1600, 15),
            (2025, 1650, 14), (2090, 1740, 13), (2108, 1860, 12),
            (2114, 1840, 12),
        ],
    },
    {
        "id": "port-sapphire-to-coastal-reef",
        "fromLandmarkId": "portSapphire",
        "toLandmarkId": "coastalReef",
        "fromThreshold": (130, 290),
        "toThreshold": (140, 350),
        "waypoints": [
            (130, 291), (142, 291), (142, 310), (143, 325),
            (142, 338), (140, 338), (140, 349),
        ],
        "artControls": [
            ((130, 290), (2114, 1840)), ((130, 291), (2108, 1860)),
            ((142, 291), (2067, 1955)), ((142, 310), (2010, 2110)),
            ((143, 325), (1900, 2260)), ((142, 338), (1810, 2325)),
            ((140, 345), (1730, 2380)), ((140, 350), (1690, 2410)),
        ],
        "points": [
            (2114, 1840, 12), (2108, 1860, 12), (2067, 1955, 13),
            (2010, 2110, 13), (1900, 2260, 14), (1810, 2325, 13),
            (1730, 2380, 10), (1690, 2410, 18),
        ],
    },
    {
        "id": "port-sapphire-to-darkfang",
        "fromLandmarkId": "portSapphire",
        "toLandmarkId": "mistyGrotto",
        "fromThreshold": (130, 290),
        "toThreshold": (120, 260),
        "waypoints": [(130, 291), (120, 261)],
        "artControls": [
            ((130, 290), (2114, 1840)), ((130, 291), (2108, 1860)),
            ((126, 291), (2025, 1650)), ((120, 291), (1870, 1315)),
            ((120, 284), (1800, 1100)), ((120, 276), (1700, 900)),
            ((120, 268), (1575, 690)), ((120, 261), (1472, 552)),
            ((120, 260), (1455, 508)),
        ],
        "points": [
            (2114, 1840, 12), (2108, 1860, 12), (2090, 1740, 13),
            (2025, 1650, 14), (1950, 1600, 15), (1900, 1500, 14),
            (1900, 1400, 14), (1870, 1315, 16), (1840, 1220, 15),
            (1800, 1100, 14), (1740, 1010, 13), (1700, 900, 13),
            (1650, 790, 13), (1575, 690, 12), (1505, 600, 11),
            (1472, 552, 10), (1455, 508, 10),
        ],
    },
    {
        "id": "port-sapphire-to-crystal-cave",
        "fromLandmarkId": "portSapphire",
        "toLandmarkId": "crystalCave",
        "fromThreshold": (130, 290),
        "toThreshold": (148, 295),
        "waypoints": [(130, 291), (148, 294)],
        "artControls": [
            ((130, 290), (2114, 1840)), ((130, 291), (2108, 1860)),
            ((136, 291), (2025, 1650)), ((142, 291), (1870, 1315)),
            ((148, 291), (1920, 1320)), ((148, 293), (2090, 1260)),
            ((148, 294), (2134, 1192)), ((148, 295), (2166, 1132)),
        ],
        "points": [
            (2114, 1840, 12), (2108, 1860, 12), (2090, 1740, 13),
            (2025, 1650, 14), (1950, 1600, 15), (1900, 1500, 14),
            (1900, 1400, 14), (1870, 1315, 16), (1920, 1320, 16),
            (2020, 1295, 14), (2090, 1260, 11), (2134, 1192, 10),
            (2166, 1132, 10),
        ],
    },
]

MILLBROOK_SOUTHEAST_EXCLUSION = {
    "id": "millbrook-southeast-old-growth-block",
    "polygon": [[1200, 2020], [1640, 2010], [1690, 2320], [1580, 2460], [1120, 2300]],
    "probes": [[1300, 2150], [1450, 2250], [1550, 2350]],
}


def sha256(path: Path) -> str:
    digest = hashlib.sha256()
    with path.open("rb") as handle:
        for block in iter(lambda: handle.read(1024 * 1024), b""):
            digest.update(block)
    return digest.hexdigest()


def runtime_semantics() -> tuple[list[str], list[dict[str, int]]]:
    text = RUNTIME_DATA.read_text(encoding="utf-8")
    rows_match = re.search(r"var ROWS = \[(.*?)\];\s*var SAFE", text, re.S)
    safe_match = re.search(r"var SAFE = (\[.*?\]);\s*var FOREST_BLOCK", text, re.S)
    if not rows_match or not safe_match:
        raise RuntimeError("Act 1 generated runtime data shape changed")
    rows = re.findall(r"'([0-9a-z]+)'", rows_match.group(1))
    safe = json.loads(safe_match.group(1))
    if len(rows) != 182 or any(len(row) != 148 for row in rows):
        raise RuntimeError("Act 1 semantic rows must remain 148x182")
    return rows, safe


def cardinal_polyline(waypoints: list[tuple[int, int]]) -> list[dict[str, int]]:
    cells: list[dict[str, int]] = []
    for index in range(1, len(waypoints)):
        x, y = waypoints[index - 1]
        target_x, target_y = waypoints[index]
        segment = [{"x": x, "y": y}]
        while x != target_x:
            x += 1 if target_x > x else -1
            segment.append({"x": x, "y": y})
        while y != target_y:
            y += 1 if target_y > y else -1
            segment.append({"x": x, "y": y})
        cells.extend(segment if index == 1 else segment[1:])
    return cells


def semantic_commit_points(
    cells: list[dict[str, int]], controls: list[dict[str, list[int]]]
) -> list[dict[str, float]]:
    cell_indices = {(cell["x"], cell["y"]): index for index, cell in enumerate(cells)}
    indexed_controls: list[tuple[int, list[int]]] = []
    for control in controls:
        cell = tuple(control["cell"])
        if cell not in cell_indices:
            raise RuntimeError(f"art control is not on the semantic route: {cell}")
        indexed_controls.append((cell_indices[cell], control["art"]))
    indexed_controls.sort(key=lambda item: item[0])
    if indexed_controls[0][0] != 0 or indexed_controls[-1][0] != len(cells) - 1:
        raise RuntimeError("art controls must include both semantic route endpoints")

    points: list[dict[str, float] | None] = [None] * len(cells)
    for control_index in range(1, len(indexed_controls)):
        from_index, from_art = indexed_controls[control_index - 1]
        to_index, to_art = indexed_controls[control_index]
        span = to_index - from_index
        if span <= 0:
            raise RuntimeError("art controls must follow semantic route order")
        for offset in range(span + 1):
            t = offset / span
            points[from_index + offset] = {
                "x": from_art[0] + (to_art[0] - from_art[0]) * t,
                "y": from_art[1] + (to_art[1] - from_art[1]) * t,
            }
    if any(point is None for point in points):
        raise RuntimeError("every semantic cell requires an art-space commit point")
    return [point for point in points if point is not None]


def guided_semantic_commit_points(
    cells: list[dict[str, int]],
    controls: list[dict[str, list[int]]],
    guide: list[dict[str, float]],
) -> list[dict[str, float]]:
    cell_indices = {(cell["x"], cell["y"]): index for index, cell in enumerate(cells)}
    guide_indices = {(point["x"], point["y"]): index for index, point in enumerate(guide)}
    indexed_controls: list[tuple[int, int, list[int]]] = []
    for control in controls:
        cell = tuple(control["cell"])
        art = tuple(control["art"])
        if cell not in cell_indices or art not in guide_indices:
            raise RuntimeError(f"guided art control is not on its semantic/geometry route: {cell} -> {art}")
        indexed_controls.append((cell_indices[cell], guide_indices[art], control["art"]))
    indexed_controls.sort(key=lambda item: item[0])
    if indexed_controls[0][:2] != (0, 0):
        raise RuntimeError("guided art controls must start both routes")
    if indexed_controls[-1][0] != len(cells) - 1 or indexed_controls[-1][1] != len(guide) - 1:
        raise RuntimeError("guided art controls must end both routes")

    commits: list[dict[str, float] | None] = [None] * len(cells)
    for control_index in range(1, len(indexed_controls)):
        from_cell, from_guide, _from_art = indexed_controls[control_index - 1]
        to_cell, to_guide, _to_art = indexed_controls[control_index]
        if to_cell <= from_cell or to_guide <= from_guide:
            raise RuntimeError("guided controls must be strictly monotonic")
        subpath = guide[from_guide:to_guide + 1]
        lengths = [0.0]
        for index in range(1, len(subpath)):
            dx = subpath[index]["x"] - subpath[index - 1]["x"]
            dy = subpath[index]["y"] - subpath[index - 1]["y"]
            lengths.append(lengths[-1] + (dx * dx + dy * dy) ** 0.5)
        for cell_index in range(from_cell, to_cell + 1):
            target = lengths[-1] * (cell_index - from_cell) / (to_cell - from_cell)
            segment = 1
            while segment < len(lengths) - 1 and lengths[segment] < target:
                segment += 1
            span = lengths[segment] - lengths[segment - 1]
            t = 0 if span == 0 else (target - lengths[segment - 1]) / span
            before, after = subpath[segment - 1], subpath[segment]
            commits[cell_index] = {
                "x": before["x"] + (after["x"] - before["x"]) * t,
                "y": before["y"] + (after["y"] - before["y"]) * t,
            }
    if any(point is None for point in commits):
        raise RuntimeError("every semantic cell requires a guided art-space commit point")
    return [point for point in commits if point is not None]


def unit_vector(dx: float, dy: float) -> dict[str, float]:
    length = (dx * dx + dy * dy) ** 0.5
    if length == 0:
        raise RuntimeError("authored blocker direction cannot be zero")
    return {"x": dx / length, "y": dy / length}


def blocker_probes(points: list[dict[str, float]]) -> list[dict[str, object]]:
    middle_index = max(0, (len(points) - 2) // 2)
    middle_from, middle_to = points[middle_index:middle_index + 2]
    middle_start = {
        "x": (middle_from["x"] + middle_to["x"]) / 2,
        "y": (middle_from["y"] + middle_to["y"]) / 2,
    }
    return [
        {
            "id": "from-landmark",
            "start": {"x": points[0]["x"], "y": points[0]["y"]},
            "direction": unit_vector(
                points[0]["x"] - points[1]["x"],
                points[0]["y"] - points[1]["y"],
            ),
        },
        {
            "id": "route-edge",
            "start": middle_start,
            "direction": unit_vector(
                -(middle_to["y"] - middle_from["y"]),
                middle_to["x"] - middle_from["x"],
            ),
        },
        {
            "id": "to-landmark",
            "start": {"x": points[-1]["x"], "y": points[-1]["y"]},
            "direction": unit_vector(
                points[-1]["x"] - points[-2]["x"],
                points[-1]["y"] - points[-2]["y"],
            ),
        },
    ]


def route_corridor(spec: dict[str, object]) -> dict[str, object]:
    semantic_spine = cardinal_polyline(spec["waypoints"])
    semantic_cells = [
        {"x": spec["fromThreshold"][0], "y": spec["fromThreshold"][1]},
        *semantic_spine,
        {"x": spec["toThreshold"][0], "y": spec["toThreshold"][1]},
    ]
    controls = [
        {"cell": list(cell), "art": list(art)}
        for cell, art in spec["artControls"]
    ]
    points = [
        {"x": x, "y": y, "halfWidth": half_width}
        for x, y, half_width in spec["points"]
    ]
    commit_points = guided_semantic_commit_points(semantic_cells, controls, points)
    return {
        "id": spec["id"],
        "fromLandmarkId": spec["fromLandmarkId"],
        "toLandmarkId": spec["toLandmarkId"],
        "thresholdExtensions": {
            "from": semantic_cells[0],
            "to": semantic_cells[-1],
        },
        "semanticSpineCells": semantic_spine,
        "semanticCells": semantic_cells,
        "semanticCommitPoints": commit_points[1:-1],
        "commitPoints": commit_points,
        "artControls": controls,
        "points": points,
        "blockerProbes": blocker_probes(points),
    }


def fx_layers(crop: Image.Image, offset_x: int, offset_y: int) -> tuple[Image.Image, Image.Image]:
    source = crop.convert("RGB")
    water = Image.new("RGBA", source.size, (0, 0, 0, 0))
    occlusion = Image.new("RGBA", source.size, (0, 0, 0, 0))
    src = source.load()
    wat = water.load()
    occ = occlusion.load()
    for y in range(source.height):
        gy = offset_y + y
        for x in range(source.width):
            gx = offset_x + x
            r, g, b = src[x, y]
            luminance = (r * 299 + g * 587 + b * 114) // 1000
            is_water = b > 48 and b > r * 1.32 and b > g * 1.04
            ripple = False
            if is_water:
                for back in range(6):
                    anchor_x = gx - back
                    hashed = ((anchor_x * 73856093) ^ (gy * 19349663)) & 4095
                    if hashed < 2:
                        ripple = True
                        break
            if ripple:
                wat[x, y] = (118, 207, 255, 82 if luminance < 90 else 118)
            is_canopy = g > r * 1.06 and g > b * 0.78 and luminance < 94
            if is_canopy:
                occ[x, y] = (r, g, b, 242)
    return water, occlusion


def main() -> None:
    if sha256(SOURCE) != EXPECTED_SHA256:
        raise RuntimeError("locked Act 1 source hash changed")
    image = Image.open(SOURCE).convert("RGB")
    if image.size != (2368, 2912):
        raise RuntimeError(f"locked Act 1 dimensions changed: {image.size}")
    detail_ids = [region["id"] for region in DETAIL_REGION_SPECS]
    if len(detail_ids) != len(set(detail_ids)):
        raise RuntimeError("detail-region ids must be unique")
    for region in DETAIL_REGION_SPECS:
        if region["width"] <= 0 or region["height"] <= 0:
            raise RuntimeError(f"invalid detail-region bounds: {region}")
        if not (0 <= region["x"] < image.width and 0 <= region["y"] < image.height):
            raise RuntimeError(f"detail-region origin is outside the world: {region}")
        if region["x"] + region["width"] > image.width or region["y"] + region["height"] > image.height:
            raise RuntimeError(f"detail-region extent is outside the world: {region}")
        expected_size = (round(region["width"] * 912 / 512), round(region["height"] * 912 / 512))
        for key in ("base", "water", "occlusion"):
            path = OUTPUT / region[key]
            with Image.open(path) as layer:
                if layer.size != expected_size or layer.mode != "RGBA":
                    raise RuntimeError(f"detail layer must be lattice-sized RGBA: {path} {layer.size} {layer.mode}")

    rows, safe = runtime_semantics()
    chunks_root = OUTPUT / "chunks"
    if chunks_root.exists():
        shutil.rmtree(chunks_root)
    for layer in ("base", "water", "occlusion"):
        (chunks_root / layer).mkdir(parents=True, exist_ok=True)

    chunks: list[dict[str, object]] = []
    for top in range(0, image.height, CHUNK):
        for left in range(0, image.width, CHUNK):
            right = min(left + CHUNK, image.width)
            bottom = min(top + CHUNK, image.height)
            crop = image.crop((left, top, right, bottom))
            col, row = left // CHUNK, top // CHUNK
            chunk_id = f"c{col}-r{row}"
            base_rel = f"chunks/base/{chunk_id}.png"
            water_rel = f"chunks/water/{chunk_id}.png"
            occlusion_rel = f"chunks/occlusion/{chunk_id}.png"
            base_path = OUTPUT / base_rel
            water_path = OUTPUT / water_rel
            occlusion_path = OUTPUT / occlusion_rel
            crop.save(base_path, optimize=True)
            water, occlusion = fx_layers(crop, left, top)
            water.save(water_path, optimize=True)
            occlusion.save(occlusion_path, optimize=True)
            chunks.append({
                "id": chunk_id,
                "x": left,
                "y": top,
                "width": right - left,
                "height": bottom - top,
                "base": base_rel,
                "water": water_rel,
                "occlusion": occlusion_rel,
                "baseSha256": sha256(base_path),
                "waterSha256": sha256(water_path),
                "occlusionSha256": sha256(occlusion_path),
            })

    corridors = [route_corridor(spec) for spec in ROUTE_SPECS]
    manifest = {
        "revision": 8,
        "status": "act1-912-design-locked",
        "designLocks": {
            "approvedOn": "2026-07-16",
            "worldSourcePixelsPerWorldPixel": 912 / 512,
            "heroSourcePixelsPerWorldPixel": 64 / 36,
            "cameraWorldWidth": 208,
            "heroNativeFrame": 64,
            "heroWorldHeight": 36,
            "heroDirections": 8,
            "heroRuntimeDirections": 4,
            "walkPoseMs": 125,
            "movementInput": "continuous-normalized-analog",
            "collisionOwner": "authored-geometry",
        },
        "source": {
            "path": "../generated/act1-v4-routing-corrections-v3-2368x2912.png",
            "sha256": EXPECTED_SHA256,
            "width": image.width,
            "height": image.height,
        },
        "semanticBounds": [16, 218, 163, 399],
        "semanticRows": rows,
        "safeCells": safe,
        "chunkSize": CHUNK,
        "streaming": {
            "preloadMargin": 128,
            "detailPreloadMargin": 64,
            "maxLoadedChunks": 6,
            "maxLoadedDetailRegions": 4,
        },
        "detailRegions": [{
            **region,
            "featherWorld": 24,
            "pixelScale": 912 / 512,
            "baseSha256": sha256(OUTPUT / region["base"]),
            "waterSha256": sha256(OUTPUT / region["water"]),
            "occlusionSha256": sha256(OUTPUT / region["occlusion"]),
        } for region in DETAIL_REGION_SPECS],
        "chunks": chunks,
        "startCell": {"x": 130, "y": 290},
        "artWarpControls": ART_WARP_CONTROLS,
        "pathConstraints": {
            "revision": 2,
            "movementSpeed": 52,
            "actorFootRadius": 4,
            "maxSubstep": 2,
            "corridors": corridors,
            "exclusionZones": [MILLBROOK_SOUTHEAST_EXCLUSION],
            "gates": [{
                "id": "crystal-cave-seal",
                "routeId": "port-sapphire-to-crystal-cave",
                "semanticCell": [148, 293],
                "requiredFlag": "boss.giantToad.defeated",
                "blocker": {
                    "from": {"x": 2081, "y": 1242},
                    "to": {"x": 2099, "y": 1278},
                    "halfWidth": 1.5,
                },
            }],
        },
    }
    (OUTPUT / "manifest.json").write_text(
        json.dumps(manifest, indent=2, separators=(",", ": ")) + "\n",
        encoding="utf-8",
    )
    print(f"ACT 1 HIFI CHUNKS BUILT: {len(chunks)} chunks from {EXPECTED_SHA256}")


if __name__ == "__main__":
    main()
