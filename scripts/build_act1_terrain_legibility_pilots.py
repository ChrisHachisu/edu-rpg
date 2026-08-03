#!/usr/bin/env python3
"""Build Relay 20's two design-only semantic-mask terrain pilots.

The traversability mask is authored first. Candidate art is a deterministic
semantic treatment of locked route-hidden pixels, and review collision is an
exact RLE-rectangle derivation of mask == 255. Nothing under public/ or dist/
is written.
"""

from __future__ import annotations

import hashlib
import io
import json
from collections import deque
from pathlib import Path

import numpy as np
from PIL import Image, ImageDraw, ImageEnhance, ImageFilter


ROOT = Path(__file__).resolve().parents[1]
RUNTIME = ROOT / "design/review/overworld-art-blueprint/act-by-act/act1/runtime-v2"
SOURCE = RUNTIME / "walkable-regions-v1/evidence/collision-reference-affinity-neutral.png"
OUTPUT = RUNTIME / "terrain-legibility-pilot-r20"
EXPECTED_SOURCE_SHA256 = "3cc75042918a8557433c33238456bcad604c34739ec89e768e554ed0008f19bc"
PHONE_SIZE = (852, 1846)
PHONE_WORLD_SIZE = (208, 450)

PROTECTED = {
    "manifest-design": (
        RUNTIME / "manifest.json",
        "a36eebf18c651ee7749f2bcff7006e0ce5173b34dc2d3010767f0adbde0cef16",
    ),
    "manifest-public": (
        ROOT / "public/act1-hifi/manifest.json",
        "a36eebf18c651ee7749f2bcff7006e0ce5173b34dc2d3010767f0adbde0cef16",
    ),
    "manifest-dist": (
        ROOT / "dist/act1-hifi/manifest.json",
        "a36eebf18c651ee7749f2bcff7006e0ce5173b34dc2d3010767f0adbde0cef16",
    ),
    "adapter-public": (
        ROOT / "public/act1-hifi/adapter.js",
        "588b8db722c7a71890a0e45d0231e7a473789c3accce5beec15f15965ebc4526",
    ),
    "adapter-dist": (
        ROOT / "dist/act1-hifi/adapter.js",
        "588b8db722c7a71890a0e45d0231e7a473789c3accce5beec15f15965ebc4526",
    ),
    "runtime-html-design": (
        RUNTIME / "index.html",
        "023425829e3f23f2d2a910e241c0dc650026d12f4c67aa68fad3cdaf5af2c02c",
    ),
    "runtime-html-public": (
        ROOT / "public/act1-hifi/runtime.html",
        "023425829e3f23f2d2a910e241c0dc650026d12f4c67aa68fad3cdaf5af2c02c",
    ),
    "runtime-html-dist": (
        ROOT / "dist/act1-hifi/runtime.html",
        "023425829e3f23f2d2a910e241c0dc650026d12f4c67aa68fad3cdaf5af2c02c",
    ),
    "geometry-design": (
        RUNTIME / "walkable-regions-v1.json",
        "ab7614664476bc90e183472f5ffb622519c95a2a00ad039fc7699b79cb378750",
    ),
    "geometry-public": (
        ROOT / "public/act1-hifi/walkable-regions-v1.json",
        "ab7614664476bc90e183472f5ffb622519c95a2a00ad039fc7699b79cb378750",
    ),
    "geometry-dist": (
        ROOT / "dist/act1-hifi/walkable-regions-v1.json",
        "ab7614664476bc90e183472f5ffb622519c95a2a00ad039fc7699b79cb378750",
    ),
    "bundle": (
        ROOT / "dist/assets/index-BhoGQRaA.js",
        "a56026574b42168985b353e4cee824562716af83f92d03f408df04eac9127381",
    ),
}


PILOTS = {
    "greenhollow-sunken": {
        "crop": [224, 1664, 608, 1088],
        "walkablePolygons": [
            [(280, 1685), (760, 1685), (832, 1760), (820, 2070),
             (700, 2190), (480, 2210), (300, 2110), (270, 1870)],
            [(245, 2260), (505, 2240), (565, 2350), (535, 2525),
             (430, 2590), (250, 2570)],
        ],
        "walkableLines": [
            {"width": 92, "points": [(650, 2020), (625, 2040), (560, 2180),
                                      (485, 2290), (425, 2370)]},
            {"width": 26, "points": [(425, 2370), (435, 2420), (432, 2440),
                                      (423, 2454)]},
        ],
        "waterPolygons": [
            [(224, 2580), (360, 2560), (500, 2580), (650, 2550),
             (832, 2600), (832, 2752), (224, 2752)],
        ],
        "structurePolygons": [
            [(540, 1825), (620, 1810), (690, 1840), (720, 1900),
             (700, 1975), (650, 2010), (575, 1995), (535, 1935)],
            [(224, 2280), (300, 2275), (370, 2310), (415, 2360),
             (410, 2465), (380, 2555), (300, 2580), (224, 2555)],
        ],
        "transitionPolygons": [
            {"id": "greenhollow-south-throat", "polygon":
             [(632, 1960), (663, 1960), (672, 2020), (625, 2020)]},
            {"id": "sunken-northeast-throat", "polygon":
             [(428, 2438), (442, 2446), (432, 2458), (416, 2462),
              (416, 2450)]},
        ],
        "doorways": [[423, 2454]],
        "connectivity": [
            {"id": "greenhollow-to-sunken", "from": [650, 2020], "to": [423, 2454]},
        ],
        "blockedProbes": [[625, 1900], [300, 2420], [500, 2660]],
        "phoneViews": [
            {"id": "frame-a", "center": [650, 1930]},
            {"id": "frame-b", "center": [390, 2425]},
        ],
    },
    "port-coral": {
        "crop": [1504, 1088, 864, 1568],
        "walkablePolygons": [],
        "walkableLines": [
            {"width": 74, "points": [(1815, 1088), (1875, 1260), (1885, 1450),
                                      (1875, 1550)]},
            {"width": 82, "points": [(1504, 1660), (1600, 1650), (1690, 1625)]},
            {"width": 82, "points": [(2110, 1740), (2140, 1900), (2070, 2075),
                                      (1950, 2190)]},
            {"width": 56, "points": [(1950, 2190), (1875, 2250), (1800, 2320),
                                      (1730, 2380)]},
            {"width": 72, "points": [(1730, 2380), (1690, 2480)]},
        ],
        "waterPolygons": [
            [(1780, 1690), (1900, 1650), (2010, 1680), (2070, 1760),
             (2060, 1900), (1980, 1990), (1860, 1985), (1780, 1900)],
            [(1504, 1790), (1690, 1770), (1830, 1880), (1880, 2040),
             (1810, 2180), (1650, 2280), (1504, 2260)],
            [(1980, 1840), (2368, 1840), (2368, 2656), (1640, 2656),
             (1650, 2500), (1740, 2320), (1840, 2180), (1920, 2020)],
        ],
        "structurePolygons": [
            [(1635, 1460), (2010, 1450), (2120, 1540), (2250, 1660),
             (2250, 1880), (2070, 1995), (1810, 1995), (1630, 1810)],
            [(1640, 2380), (1720, 2350), (1815, 2390), (1840, 2490),
             (1800, 2600), (1680, 2630), (1610, 2540)],
        ],
        "transitionPolygons": [
            {"id": "port-north-contact", "polygon":
             [(1850, 1435), (1900, 1435), (1910, 1500), (1840, 1500)]},
            {"id": "port-west-contact", "polygon":
             [(1615, 1610), (1715, 1595), (1715, 1660), (1615, 1680)]},
            {"id": "port-southeast-contact", "polygon":
             [(2085, 1710), (2135, 1710), (2140, 1775), (2080, 1775)]},
            {"id": "coastal-bridge-deck", "polygon":
             [(1915, 2165), (1975, 2210), (1760, 2410), (1715, 2360)]},
            {"id": "coral-landward-entrance", "polygon":
             [(1660, 2450), (1720, 2445), (1735, 2505), (1670, 2525)]},
        ],
        "doorways": [],
        "connectivity": [
            {"id": "port-north-approach", "from": [1825, 1100], "to": [1875, 1470]},
            {"id": "port-west-approach", "from": [1510, 1660], "to": [1685, 1625]},
            {"id": "port-southeast-to-coral", "from": [2110, 1745], "to": [1690, 2480]},
        ],
        "blockedProbes": [[1920, 1800], [1940, 1870], [2200, 1820], [2200, 2350]],
        "phoneViews": [
            {"id": "frame-c", "center": [1875, 1440]},
            {"id": "frame-d", "center": [1690, 1660]},
            {"id": "frame-e", "center": [2080, 1900]},
            {"id": "frame-f", "center": [1745, 2390]},
        ],
    },
}


def sha256(path: Path) -> str:
    digest = hashlib.sha256()
    with path.open("rb") as handle:
        for block in iter(lambda: handle.read(1024 * 1024), b""):
            digest.update(block)
    return digest.hexdigest()


def png_bytes(image: Image.Image) -> bytes:
    output = io.BytesIO()
    image.save(output, format="PNG", compress_level=9, optimize=False)
    return output.getvalue()


def local_points(points: list[list[int]] | list[tuple[int, int]], crop: list[int]) -> list[tuple[int, int]]:
    return [(round(x - crop[0]), round(y - crop[1])) for x, y in points]


def authored_masks(spec: dict[str, object]) -> tuple[Image.Image, Image.Image]:
    crop = spec["crop"]
    size = (crop[2], crop[3])
    traversal = Image.new("L", size, 0)
    walk = ImageDraw.Draw(traversal)
    for polygon in spec["walkablePolygons"]:
        walk.polygon(local_points(polygon, crop), fill=255)
    for line in spec["walkableLines"]:
        walk.line(local_points(line["points"], crop), fill=255,
                  width=line["width"], joint="curve")

    roles = Image.new("RGB", size, (0, 0, 0))
    role_draw = ImageDraw.Draw(roles)
    for polygon in spec["waterPolygons"]:
        role_draw.polygon(local_points(polygon, crop), fill=(255, 0, 0))
    for polygon in spec["structurePolygons"]:
        role_draw.polygon(local_points(polygon, crop), fill=(0, 255, 0))
    for transition in spec["transitionPolygons"]:
        role_draw.polygon(local_points(transition["polygon"], crop), fill=(0, 0, 255))

    traversal_array = np.asarray(traversal, dtype=np.uint8).copy()
    role_array = np.asarray(roles, dtype=np.uint8).copy()
    passages = Image.new("1", size, 0)
    passage_draw = ImageDraw.Draw(passages)
    for line in spec["walkableLines"]:
        passage_draw.line(local_points(line["points"], crop), fill=1,
                          width=line["width"], joint="curve")
    for transition_spec in spec["transitionPolygons"]:
        passage_draw.polygon(local_points(transition_spec["polygon"], crop), fill=1)
    authored_passage = np.asarray(passages, dtype=bool)
    # Broad water/structure polygons yield only to an explicitly authored
    # passage, so entrance stubs and bridge decks do not inherit the basin/body.
    role_array[authored_passage, 0:2] = 0
    transition = role_array[:, :, 2] == 255
    role_array[transition, 0:2] = 0
    water = role_array[:, :, 0] == 255
    structure = role_array[:, :, 1] == 255
    traversal_array[water | structure] = 0
    traversal_array[transition] = 255
    return Image.fromarray(traversal_array), Image.fromarray(role_array)


def coalesced_rectangles(walkable: np.ndarray) -> list[list[int]]:
    active: dict[tuple[int, int], int] = {}
    rectangles: list[list[int]] = []
    for y, row in enumerate(walkable):
        padded = np.pad(row.astype(np.int8), (1, 1))
        changes = np.flatnonzero(padded[1:] != padded[:-1])
        runs = {(int(changes[index]), int(changes[index + 1]))
                for index in range(0, len(changes), 2)}
        for run in sorted(set(active) - runs):
            rectangles.append([run[0], active.pop(run), run[1], y])
        for run in sorted(runs - set(active)):
            active[run] = y
    height = walkable.shape[0]
    for run, y0 in active.items():
        rectangles.append([run[0], y0, run[1], height])
    return sorted(rectangles, key=lambda value: (value[1], value[0], value[3], value[2]))


def assert_connected(walkable: np.ndarray, start: tuple[int, int], end: tuple[int, int], label: str) -> None:
    height, width = walkable.shape
    for point in (start, end):
        if not (0 <= point[0] < width and 0 <= point[1] < height and walkable[point[1], point[0]]):
            raise AssertionError(f"{label} endpoint is not walkable: {point}")
    queue = deque([start])
    seen = np.zeros(walkable.shape, dtype=bool)
    seen[start[1], start[0]] = True
    while queue:
        x, y = queue.popleft()
        if (x, y) == end:
            return
        for point in ((x - 1, y), (x + 1, y), (x, y - 1), (x, y + 1)):
            if (0 <= point[0] < width and 0 <= point[1] < height
                    and walkable[point[1], point[0]] and not seen[point[1], point[0]]):
                seen[point[1], point[0]] = True
                queue.append(point)
    raise AssertionError(f"{label} is disconnected")


def semantic_art(source: Image.Image, traversal: Image.Image, roles: Image.Image,
                 spec: dict[str, object]) -> Image.Image:
    original = source.convert("RGB")
    smoothed = original.filter(ImageFilter.GaussianBlur(2.4))
    flat = Image.blend(original, smoothed, 0.42)
    flat = ImageEnhance.Color(flat).enhance(0.95)
    flat = ImageEnhance.Brightness(flat).enhance(1.04)
    blocked = original.filter(ImageFilter.UnsharpMask(radius=2, percent=135, threshold=3))
    blocked = ImageEnhance.Contrast(blocked).enhance(1.08)
    blocked = ImageEnhance.Brightness(blocked).enhance(0.90)

    traversal_array = np.asarray(traversal, dtype=np.uint8)
    roles_array = np.asarray(roles, dtype=np.uint8)
    walkable = traversal_array == 255
    transition = roles_array[:, :, 2] == 255
    keep = (roles_array[:, :, 0] == 255) | (roles_array[:, :, 1] == 255)

    original_array = np.asarray(original, dtype=np.float32)
    flat_array = np.asarray(flat, dtype=np.float32)
    blocked_array = np.asarray(blocked, dtype=np.float32)
    walk_alpha = np.asarray(
        traversal.filter(ImageFilter.GaussianBlur(7)), dtype=np.float32
    )[:, :, None] / 255.0
    candidate = blocked_array * (1.0 - walk_alpha) + flat_array * walk_alpha
    candidate += walk_alpha * np.array([7.0, 5.0, -2.0], dtype=np.float32)

    transition_alpha = np.asarray(
        Image.fromarray(transition.astype(np.uint8) * 255)
        .filter(ImageFilter.GaussianBlur(3)), dtype=np.float32
    )[:, :, None] / 255.0 * 0.72
    luminance = (original_array[:, :, 0] * 0.30
                 + original_array[:, :, 1] * 0.55
                 + original_array[:, :, 2] * 0.15)
    earth = np.stack((62.0 + luminance * 0.30,
                      52.0 + luminance * 0.28,
                      32.0 + luminance * 0.18), axis=2)
    earth = np.clip(earth, 0, 255)
    candidate = candidate * (1.0 - transition_alpha) + earth * transition_alpha

    keep_alpha = np.asarray(
        Image.fromarray(keep.astype(np.uint8) * 255)
        .filter(ImageFilter.GaussianBlur(12)), dtype=np.float32
    )[:, :, None] / 255.0
    candidate = candidate * (1.0 - keep_alpha) + original_array * keep_alpha
    candidate = np.clip(candidate, 0, 255)
    candidate[keep] = original_array[keep]
    output = Image.fromarray(candidate.astype(np.uint8))
    doorway_mask = Image.new("L", output.size, 0)
    doorway_draw = ImageDraw.Draw(doorway_mask)
    crop = spec["crop"]
    for world_x, world_y in spec.get("doorways", []):
        x, y = world_x - crop[0], world_y - crop[1]
        if keep[y, x] or not transition[y, x]:
            raise AssertionError(f"doorway is not inside a reopened transition: {(world_x, world_y)}")
        doorway_draw.ellipse((x - 5, y - 4, x + 5, y + 4), fill=220)
    if doorway_mask.getbbox():
        doorway_mask = doorway_mask.filter(ImageFilter.GaussianBlur(0.8))
        doorway_array = np.asarray(doorway_mask, dtype=np.uint8).copy()
        doorway_array[~transition | keep] = 0
        doorway_mask = Image.fromarray(doorway_array)
        output = Image.composite(Image.new("RGB", output.size, (14, 16, 13)),
                                 output, doorway_mask)
    return output


def render_overlay(art: Image.Image, traversal: Image.Image, roles: Image.Image) -> Image.Image:
    traversal_array = np.asarray(traversal, dtype=np.uint8)
    roles_array = np.asarray(roles, dtype=np.uint8)
    tint = np.zeros((art.height, art.width, 4), dtype=np.uint8)
    tint[traversal_array == 255] = (45, 230, 105, 105)
    tint[roles_array[:, :, 0] == 255] = (45, 130, 255, 105)
    tint[roles_array[:, :, 1] == 255] = (255, 65, 75, 115)
    tint[roles_array[:, :, 2] == 255] = (255, 205, 40, 210)
    output = art.convert("RGBA")
    output.alpha_composite(Image.fromarray(tint))
    return output


def render_collision(art: Image.Image, rectangles: list[list[int]]) -> Image.Image:
    output = art.convert("RGBA")
    layer = Image.new("RGBA", output.size, (0, 0, 0, 0))
    draw = ImageDraw.Draw(layer)
    for x0, y0, x1, y1 in rectangles:
        draw.rectangle((x0, y0, x1 - 1, y1 - 1), fill=(45, 225, 115, 65))
    output.alpha_composite(layer)
    return output


def phone_frame(art: Image.Image, center: list[int], crop: list[int]) -> Image.Image:
    local_x = center[0] - crop[0]
    local_y = center[1] - crop[1]
    left = round(local_x - PHONE_WORLD_SIZE[0] / 2)
    top = round(local_y - PHONE_WORLD_SIZE[1] / 2)
    box = (left, top, left + PHONE_WORLD_SIZE[0], top + PHONE_WORLD_SIZE[1])
    if box[0] < 0 or box[1] < 0 or box[2] > art.width or box[3] > art.height:
        raise AssertionError(f"phone crop outside pilot: {box} in {art.size}")
    return art.crop(box).resize(PHONE_SIZE, Image.Resampling.NEAREST)


def validate_protected() -> dict[str, dict[str, object]]:
    result = {}
    for label, (path, expected) in PROTECTED.items():
        actual = sha256(path)
        if actual != expected:
            raise AssertionError(f"protected {label} changed: expected {expected}, got {actual}")
        result[label] = {
            "path": str(path.relative_to(ROOT)),
            "sha256": actual,
            "bytes": path.stat().st_size,
        }
    return result


def write_bytes(path: Path, data: bytes) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_bytes(data)


def main() -> None:
    protected_before = validate_protected()
    if sha256(SOURCE) != EXPECTED_SOURCE_SHA256:
        raise AssertionError("route-hidden collision reference changed")
    with Image.open(SOURCE) as source_image:
        source_world = source_image.convert("RGB")
    if source_world.size != (2368, 2912):
        raise AssertionError(f"unexpected source dimensions: {source_world.size}")

    inventory: dict[str, object] = {
        "schema": "act1-terrain-legibility-pilot-r20-v1",
        "status": "owner-review-candidate-only",
        "coordinateSystem": "act1-world-art top-left x-right y-down; one mask pixel per world pixel",
        "traversabilityClasses": {"0": "blocked", "127": "genuine-occlusion", "255": "walkable"},
        "semanticRoleChannels": {"R": "water", "G": "structure", "B": "entrance-or-transition"},
        "source": {"path": str(SOURCE.relative_to(ROOT)), "sha256": EXPECTED_SOURCE_SHA256},
        "protected": protected_before,
        "pilots": {},
    }
    phone_outputs: dict[str, Image.Image] = {}

    for pilot_id, spec in PILOTS.items():
        crop = spec["crop"]
        source = source_world.crop((crop[0], crop[1], crop[0] + crop[2], crop[1] + crop[3]))
        traversal, roles = authored_masks(spec)
        traversal_values = set(np.unique(np.asarray(traversal)).tolist())
        if traversal_values - {0, 127, 255} or 127 in traversal_values:
            raise AssertionError(f"{pilot_id} has invalid or unresolved traversal classes: {traversal_values}")
        role_values = set(np.unique(np.asarray(roles)).tolist())
        if role_values - {0, 255}:
            raise AssertionError(f"{pilot_id} role plane has non-binary values: {role_values}")

        traversal_array = np.asarray(traversal, dtype=np.uint8)
        role_array = np.asarray(roles, dtype=np.uint8)
        water = role_array[:, :, 0] == 255
        structure = role_array[:, :, 1] == 255
        transition = role_array[:, :, 2] == 255
        if np.any((water & structure) | (water & transition) | (structure & transition)):
            raise AssertionError(f"{pilot_id} semantic role channels overlap")
        if np.any((water | structure) & (traversal_array != 0)):
            raise AssertionError(f"{pilot_id} water or structure is not blocked")
        if np.any(transition & (traversal_array != 255)):
            raise AssertionError(f"{pilot_id} transition is not walkable")

        walkable = traversal_array == 255
        for item in spec["connectivity"]:
            start = (item["from"][0] - crop[0], item["from"][1] - crop[1])
            end = (item["to"][0] - crop[0], item["to"][1] - crop[1])
            assert_connected(walkable, start, end, f"{pilot_id}:{item['id']}")
        for point in spec["blockedProbes"]:
            local_x, local_y = point[0] - crop[0], point[1] - crop[1]
            if walkable[local_y, local_x]:
                raise AssertionError(f"{pilot_id} blocked probe admitted: {point}")

        rectangles = coalesced_rectangles(walkable)
        reconstructed = np.zeros(walkable.shape, dtype=bool)
        for x0, y0, x1, y1 in rectangles:
            reconstructed[y0:y1, x0:x1] = True
        mismatch = int(np.count_nonzero(reconstructed != walkable))
        if mismatch:
            raise AssertionError(f"{pilot_id} collision round trip mismatch: {mismatch}")

        art = semantic_art(source, traversal, roles, spec)
        keep = water | structure
        if np.any(np.asarray(art)[keep] != np.asarray(source)[keep]):
            raise AssertionError(f"{pilot_id} changed preserved landmark/water pixels")

        pilot_root = OUTPUT / pilot_id
        outputs = {
            "source": (pilot_root / "source-art.png", png_bytes(source)),
            "traversability": (pilot_root / "traversability-mask.png", png_bytes(traversal)),
            "roles": (pilot_root / "semantic-roles-rgb.png", png_bytes(roles)),
            "candidateArt": (pilot_root / "candidate-art.png", png_bytes(art)),
            "maskOverlay": (pilot_root / "evidence/mask-overlay.png", png_bytes(render_overlay(art, traversal, roles))),
            "collisionOverlay": (pilot_root / "evidence/collision-overlay.png", png_bytes(render_collision(art, rectangles))),
        }
        for _, (path, data) in outputs.items():
            write_bytes(path, data)

        collision = {
            "schema": "act1-review-collision-rle-rectangles-v1",
            "status": "candidate-only-not-runtime-polygons",
            "worldOrigin": crop[:2],
            "width": crop[2],
            "height": crop[3],
            "actorFootRadius": 4,
            "maxSubstep": 2,
            "meaning": "exact coalesced rectangles for traversability == 255",
            "rectangles": rectangles,
        }
        collision_path = pilot_root / "candidate-collision-rle.json"
        collision_bytes = (json.dumps(collision, indent=2, sort_keys=True) + "\n").encode()
        write_bytes(collision_path, collision_bytes)

        phone_items = []
        for view in spec["phoneViews"]:
            frame = phone_frame(art, view["center"], crop)
            if frame.size != PHONE_SIZE:
                raise AssertionError(f"{view['id']} is not exact phone size")
            frame_path = OUTPUT / "evidence/anonymous-phone" / f"{view['id']}.png"
            frame_data = png_bytes(frame)
            write_bytes(frame_path, frame_data)
            phone_outputs[view["id"]] = frame
            phone_items.append({
                "anonymousId": view["id"],
                "centerWorld": view["center"],
                "path": str(frame_path.relative_to(ROOT)),
                "sha256": hashlib.sha256(frame_data).hexdigest(),
                "width": frame.width,
                "height": frame.height,
            })

        inventory["pilots"][pilot_id] = {
            "worldCrop": crop,
            "maskDimensions": [crop[2], crop[3]],
            "walkablePixels": int(walkable.sum()),
            "blockedPixels": int((~walkable).sum()),
            "unresolvedPixels": int((traversal_array == 127).sum()),
            "rolePixels": {
                "water": int(water.sum()),
                "structure": int(structure.sum()),
                "transition": int(transition.sum()),
            },
            "collisionRectangles": len(rectangles),
            "collisionRoundTripMismatchPixels": mismatch,
            "connectivity": [item["id"] for item in spec["connectivity"]],
            "transitions": [item["id"] for item in spec["transitionPolygons"]],
            "outputs": {
                label: {"path": str(path.relative_to(ROOT)),
                        "sha256": hashlib.sha256(data).hexdigest(), "bytes": len(data)}
                for label, (path, data) in outputs.items()
            } | {
                "collision": {"path": str(collision_path.relative_to(ROOT)),
                              "sha256": hashlib.sha256(collision_bytes).hexdigest(),
                              "bytes": len(collision_bytes)}
            },
            "phoneEvidence": phone_items,
        }

    expected_frames = ["frame-a", "frame-b", "frame-c", "frame-d", "frame-e", "frame-f"]
    if list(sorted(phone_outputs)) != expected_frames:
        raise AssertionError(f"anonymous phone evidence incomplete: {sorted(phone_outputs)}")
    contact = Image.new("RGB", (1278, 1846), (7, 10, 12))
    for index, frame_id in enumerate(expected_frames):
        frame = phone_outputs[frame_id].resize((426, 923), Image.Resampling.NEAREST)
        contact.paste(frame, ((index % 3) * 426, (index // 3) * 923))
    contact_path = OUTPUT / "evidence/terrain-legibility-owner-review-contact-sheet.png"
    contact_data = png_bytes(contact)
    write_bytes(contact_path, contact_data)
    inventory["ownerReviewContactSheet"] = {
        "path": str(contact_path.relative_to(ROOT)),
        "sha256": hashlib.sha256(contact_data).hexdigest(),
        "width": contact.width,
        "height": contact.height,
        "anonymousFrameOrder": expected_frames,
    }

    protected_after = validate_protected()
    if protected_before != protected_after:
        raise AssertionError("protected inputs changed during candidate generation")
    inventory_path = OUTPUT / "pilot-inventory.json"
    inventory_bytes = (json.dumps(inventory, indent=2, sort_keys=True) + "\n").encode()
    write_bytes(inventory_path, inventory_bytes)
    first_hash = hashlib.sha256(inventory_bytes).hexdigest()

    # Re-run in a fresh process for the external byte-determinism gate; this
    # build prints enough stable evidence for the invoking check to compare.
    print(f"TERRAIN LEGIBILITY PILOT PASS: {len(PILOTS)} pilots, 6 exact-phone frames")
    print(f"inventory sha256 {first_hash}")
    print(f"contact sha256 {hashlib.sha256(contact_data).hexdigest()}")


if __name__ == "__main__":
    main()
