#!/usr/bin/env python3
"""Build the final Act 1 art/geometry owner-review pair.

The semantic graph is retained from R25b. Intermediate ground is redrawn as
smooth, low-complexity centerline buffers fitted to the accepted G6 painting.
The one art correction restores the painted Coastal Reef cave approach.
"""

from __future__ import annotations

import hashlib
import json
import math
from copy import deepcopy
from pathlib import Path

from PIL import Image, ImageChops, ImageDraw, ImageFilter, ImageFont


PACK = Path(__file__).resolve().parent
ROOT = PACK.parents[6]
RUNTIME_V2 = PACK.parent
R25B = RUNTIME_V2 / "polygon-first-authority-r25b/polygon-authority.json"
G6 = RUNTIME_V2 / "polygon-conformance-authored-patches-g6"
G6_ART = G6 / "candidate-art.png"
COASTAL_VISIBLE = G6 / "generated/coastal-generated-v1.png"
SIZE = (2368, 2912)
COASTAL_BOX = (1456, 2048, 2280, 2816)
COASTAL_MOUTH = [1877, 2596]

EXPECTED = {
    R25B: "91ae6be942a3fdf613373bc10b0c46d23080bd847831e4876985e3c9bc9e3607",
    G6_ART: "1c716db35e3be1f9004a20799318a025811a36eb8feb524d155895c9d720202c",
    COASTAL_VISIBLE: "50ef41ed270cdcc918c2fdaafd2fe88056c899940c3e8163296ea6d66e3cab4d",
}


def sha256(path: Path) -> str:
    return hashlib.sha256(path.read_bytes()).hexdigest()


def decoded_sha256(image: Image.Image) -> str:
    return hashlib.sha256(image.tobytes()).hexdigest()


def rounded(value: float) -> float:
    return round(value, 2)


def point_dict(point: tuple[float, float]) -> dict[str, float]:
    return {"x": rounded(point[0]), "y": rounded(point[1])}


def smooth_path(control: list[tuple[float, ...]]) -> list[tuple[float, ...]]:
    """Corner-cut controls into a non-overshooting curve sampled at <=2 px."""
    if len(control) < 2:
        raise ValueError("a centerline needs at least two points")
    smoothed = list(control)
    for _ in range(3):
        refined = [smoothed[0]]
        for left, right in zip(smoothed, smoothed[1:]):
            refined.append(tuple(0.75 * l + 0.25 * r for l, r in zip(left, right)))
            refined.append(tuple(0.25 * l + 0.75 * r for l, r in zip(left, right)))
        refined.append(smoothed[-1])
        smoothed = refined
    result: list[tuple[float, ...]] = []
    for p1, p2 in zip(smoothed, smoothed[1:]):
        samples = max(1, math.ceil(math.hypot(p2[0] - p1[0], p2[1] - p1[1]) / 2))
        for step in range(samples):
            t = step / samples
            result.append(tuple((1 - t) * left + t * right for left, right in zip(p1, p2)))
    result.append(control[-1])
    return result


def ribbon(control: list[tuple[float, ...]], width: float | None, smooth: bool = True) -> list[dict[str, float]]:
    centerline = smooth_path(control) if smooth and len(control) > 2 else control
    left: list[tuple[float, float]] = []
    right: list[tuple[float, float]] = []
    for index, current in enumerate(centerline):
        before = centerline[max(0, index - 1)]
        after = centerline[min(len(centerline) - 1, index + 1)]
        dx, dy = after[0] - before[0], after[1] - before[1]
        length = math.hypot(dx, dy)
        if length == 0:
            raise ValueError("duplicate sampled centerline point")
        half = (current[2] if len(current) > 2 else width) / 2
        nx, ny = -dy / length, dx / length
        left.append((current[0] + nx * half, current[1] + ny * half))
        right.append((current[0] - nx * half, current[1] - ny * half))
    return [point_dict(point) for point in [*left, *reversed(right)]]


def ellipse(center: tuple[float, float], rx: float, ry: float, vertices: int = 24) -> list[dict[str, float]]:
    return [
        point_dict((
            center[0] + rx * math.cos(2 * math.pi * index / vertices),
            center[1] + ry * math.sin(2 * math.pi * index / vertices),
        ))
        for index in range(vertices)
    ]


def region(
    region_id: str,
    component: str,
    role: str,
    joins: list[str],
    *,
    control: list[tuple[float, ...]] | None = None,
    width: float | None = None,
    hub: tuple[tuple[float, float], float, float] | None = None,
    outline: list[tuple[float, float]] | None = None,
    terminal: list[int] | None = None,
    centerline_lock: list[list[int]] | None = None,
) -> dict:
    if outline:
        outer = [point_dict(point) for point in outline]
    elif hub:
        outer = ellipse(*hub)
    elif control and (width or len(control[0]) > 2):
        outer = ribbon(control, width, smooth=len(control) > 2)
    else:
        raise ValueError(region_id)
    result = {
        "id": region_id,
        "component": component,
        "role": role,
        "outer": outer,
        "holes": [],
        "joins": joins,
    }
    if control:
        result["artFitCenterline"] = [[rounded(point[0]), rounded(point[1])] for point in control]
        if len(control[0]) > 2:
            result["widthProfile"] = [rounded(point[2]) for point in control]
    if width:
        result["width"] = width
    if terminal:
        result["terminal"] = terminal
    if centerline_lock:
        result["centerline"] = centerline_lock
    return result


def build_regions() -> list[dict]:
    return [
        region("greenhollow-hub", "west", "open-hub", ["greenhollow-sunken-road", "greenhollow-whispering-road", "greenhollow-millbrook-road"], outline=[(548,1884),(591,1848),(650,1831),(714,1834),(770,1854),(811,1895),(824,1944),(817,1992),(789,2032),(742,2062),(686,2076),(625,2067),(580,2042),(546,2003),(529,1957),(534,1914)]),
        region("greenhollow-sunken-road", "west", "road", ["greenhollow-hub", "sunken-entrance-throat"], control=[(677,1957,72),(654,2050,58),(644,2140,50),(628,2240,48),(606,2340,46),(579,2440,46),(550,2532,44),(528,2610,40),(503,2651,32),(470,2634,26),(445,2605,20),(421,2570,14),(411,2548,11),(404,2539,11)]),
        region("sunken-entrance-throat", "west", "owner-locked-throat", ["greenhollow-sunken-road"], control=[(415, 2553), (411, 2548), (370, 2495), (366, 2490)], width=11, centerline_lock=[[411, 2548], [370, 2495]]),
        region("greenhollow-whispering-road", "west", "road", ["greenhollow-hub", "whispering-threshold"], control=[(677,1957,64),(653,1880,54),(646,1805,48),(657,1720,44),(681,1640,44),(720,1562,42),(761,1487,38),(799,1420,26),(816,1387,14)]),
        region("whispering-threshold", "west", "threshold", ["greenhollow-whispering-road"], hub=((816, 1387), 11, 10)),
        region("greenhollow-millbrook-road", "west", "road", ["greenhollow-hub", "millbrook-hub"], control=[(677,1957,72),(775,1958,64),(870,1961,56),(965,1967,50),(1054,1972,44),(1112,1966,28),(1148,1974,20),(1190,1986,40),(1234,1995,72)]),
        region("millbrook-hub", "west", "open-hub", ["greenhollow-millbrook-road", "millbrook-port-road"], outline=[(1142,1950),(1172,1921),(1227,1909),(1281,1917),(1325,1943),(1344,1982),(1340,2025),(1310,2059),(1262,2078),(1210,2075),(1166,2053),(1137,2014),(1129,1977)]),
        region("millbrook-port-road", "west", "road", ["millbrook-hub", "port-west-throat"], control=[(1234,1995,72),(1325,1948,58),(1410,1882,50),(1500,1812,48),(1580,1751,46),(1662,1710,42),(1742,1682,34),(1792,1673,18),(1840,1665,11)]),
        region("port-west-throat", "west", "port-terminal", ["millbrook-port-road"], control=[(1792,1673,18),(1840,1665,11),(1847,1664,11)], terminal=[1840, 1665]),
        region("port-north-throat", "north", "port-terminal", ["port-north-trunk"], control=[(1835,1642,11),(1835,1635,11),(1835,1580,18)], terminal=[1835, 1635]),
        region("port-north-trunk", "north", "road", ["port-north-throat", "north-fork"], control=[(1835,1635,11),(1835,1580,18),(1838,1504,34),(1844,1438,42),(1854,1388,44),(1870,1338,46),(1900,1280,76)]),
        region("north-fork", "north", "open-junction", ["port-north-trunk", "darkfang-road", "crystal-west-approach"], outline=[(1831,1257),(1853,1228),(1888,1213),(1929,1216),(1961,1237),(1977,1269),(1974,1303),(1948,1329),(1914,1343),(1873,1338),(1840,1317),(1823,1288)]),
        region("darkfang-road", "north", "road", ["north-fork", "darkfang-threshold"], control=[(1900,1280,76),(1870,1208,56),(1831,1121,48),(1786,1034,44),(1735,941,44),(1680,853,42),(1623,766,42),(1567,674,40),(1518,595,32),(1484,546,20),(1455,508,14)]),
        region("darkfang-threshold", "north", "threshold", ["darkfang-road"], hub=((1455, 508), 11, 10)),
        region("crystal-west-approach", "north", "road", ["north-fork", "crystal-gate-throat"], control=[(1900,1280,76),(1948,1293,48),(1987,1298,42),(2022,1292,38),(2058,1282,34),(2086,1262,20),(2105,1245,16)]),
        region("crystal-gate-throat", "north", "gated-throat", ["crystal-west-approach", "crystal-east-approach"], control=[(2070, 1280), (2105, 1245)], width=16),
        region("crystal-east-approach", "north", "road", ["crystal-gate-throat", "crystal-threshold"], control=[(2098,1252,16),(2105,1245,16),(2127,1215,24),(2146,1184,22),(2160,1153,18),(2166,1132,14)]),
        region("crystal-threshold", "north", "threshold", ["crystal-east-approach"], hub=((2166, 1132), 11, 10)),
        region("port-southeast-throat", "southeast", "port-terminal", ["port-coastal-road"], control=[(2116,1832,11),(2114,1840,11),(2100,1902,22)], terminal=[2114, 1840]),
        region("port-coastal-road", "southeast", "road", ["port-southeast-throat", "coastal-bridge"], control=[(2114,1840,11),(2100,1902,22),(2083,1968,38),(2062,2042,44),(2033,2118,48),(1994,2190,48),(1946,2248,44),(1888,2300,34),(1870,2310,20),(1862,2316,20)]),
        region("coastal-bridge", "southeast", "bridge", ["port-coastal-road", "coastal-reef-approach"], control=[(1870, 2310), (1830, 2338), (1790, 2365)], width=20),
        region("coastal-reef-approach", "southeast", "road", ["coastal-bridge", "coastal-turn"], control=[(1798,2359,20),(1790,2365,32),(1752,2380,38),(1714,2396,42),(1690,2410,32)]),
        region("coastal-turn", "southeast", "open-junction", ["coastal-reef-approach", "coastal-dungeon-connector"], hub=((1690, 2410), 23, 19)),
        region("coastal-dungeon-connector", "southeast", "road", ["coastal-turn", "coastal-threshold"], control=[(1690,2410,32),(1694,2450,31),(1695,2490,30),(1696,2530,28),(1710,2560,26),(1745,2585,23),(1790,2602,20),(1835,2605,17),(1877,2596,14)]),
        region("coastal-threshold", "southeast", "threshold", ["coastal-dungeon-connector"], hub=((1877, 2596), 11, 9)),
    ]


def font(size: int) -> ImageFont.FreeTypeFont | ImageFont.ImageFont:
    for path in (
        "/System/Library/Fonts/Supplemental/Arial Bold.ttf",
        "/usr/share/fonts/truetype/dejavu/DejaVuSans-Bold.ttf",
    ):
        try:
            return ImageFont.truetype(path, size)
        except OSError:
            pass
    return ImageFont.load_default(size=size)


def build_art(authority: dict) -> Image.Image:
    base = Image.open(G6_ART).convert("RGB")
    x0, y0, x1, y1 = COASTAL_BOX
    size = (x1 - x0, y1 - y0)
    visible = Image.open(COASTAL_VISIBLE).convert("RGB").resize(size, Image.Resampling.LANCZOS)
    correction = Image.new("L", SIZE, 0)
    correction_draw = ImageDraw.Draw(correction)
    correction_ids = {"coastal-turn", "coastal-dungeon-connector", "coastal-threshold"}
    for item in authority["regions"]:
        if item["id"] in correction_ids:
            correction_draw.polygon([(point["x"], point["y"]) for point in item["outer"]], fill=255)
    alpha = correction.crop(COASTAL_BOX).filter(ImageFilter.MaxFilter(61)).filter(
        ImageFilter.GaussianBlur(12)
    )
    base.paste(Image.composite(visible, base.crop(COASTAL_BOX), alpha), (x0, y0))
    return base


def build_authority() -> dict:
    authority = deepcopy(json.loads(R25B.read_text(encoding="utf-8")))
    authority["schema"] = "act1-art-fit-polygon-authority-v2"
    authority["revision"] = 2
    authority["authority"] = (
        "The owner-approved Act 1 painting and this simplified geometry are one hash-locked design pair. "
        "Curves were fitted once to visible walkable ground; the derived mask is evidence only."
    )
    authority["status"] = "design-only-owner-review-not-promoted"
    authority["designDecisions"] = {
        "geometrySource": "owner-authorized one-pass fit to final G6 artwork",
        "curveRule": "smooth sampled centerlines and consistent corridor widths; no pixel-edge tracing",
        "coastalCorrection": "restore the painted cave approach and move the native Coastal Reef mouth from [1690,2410] to [1877,2596]",
        "semanticPreservation": "same seven route identities, quest guards, Port transfer model, Crystal seal, and forbidden shortcuts",
        "portTransferModel": "one abstract town transition with three pairwise-disconnected exterior terminals",
        "sunkenLock": "exact straight [[411,2548],[370,2495]] throat at width 11",
        "futureRule": "after owner GO, ordinary visual corrections are art-only; topology or endpoint changes require a new gameplay decision",
    }
    authority["regions"] = build_regions()

    for anchor in authority["landmarkAnchors"]:
        if anchor["id"] == "coastalReef":
            anchor["point"] = COASTAL_MOUTH

    routes = {route["id"]: route for route in authority["semanticRoutes"]}
    routes["greenhollow-to-sunken-cellar"]["waypoints"] = [
        {"x": x, "y": y} for x, y in [(677,1957),(654,2050),(644,2140),(628,2240),(606,2340),(579,2440),(550,2532),(528,2610),(503,2651),(470,2634),(445,2605),(421,2570),(411,2548),(370,2495)]
    ]
    routes["greenhollow-to-whispering-woods-cave"]["waypoints"] = [
        {"x": x, "y": y} for x, y in [(677,1957),(653,1880),(646,1805),(657,1720),(681,1640),(720,1562),(761,1487),(799,1420),(816,1387)]
    ]
    routes["greenhollow-to-millbrook"]["waypoints"] = [
        {"x": x, "y": y} for x, y in [(677,1957),(775,1958),(870,1961),(965,1967),(1054,1972),(1112,1966),(1148,1974),(1190,1986),(1234,1995)]
    ]
    routes["millbrook-to-port-sapphire"]["waypoints"] = [
        {"x": x, "y": y} for x, y in [(1234,1995),(1325,1948),(1410,1882),(1500,1812),(1580,1751),(1662,1710),(1742,1682),(1792,1673),(1840,1665)]
    ]
    routes["port-sapphire-to-coastal-reef"]["waypoints"] = [
        {"x": x, "y": y} for x, y in [(2114,1840),(2100,1902),(2083,1968),(2062,2042),(2033,2118),(1994,2190),(1946,2248),(1888,2300),(1870,2310),(1830,2338),(1790,2365),(1752,2380),(1714,2396),(1690,2410),(1694,2450),(1695,2490),(1696,2530),(1710,2560),(1745,2585),(1790,2602),(1835,2605),(1877,2596)]
    ]
    routes["port-sapphire-to-coastal-reef"]["requiredRegions"] = [
        "port-southeast-throat", "port-coastal-road", "coastal-bridge",
        "coastal-reef-approach", "coastal-turn", "coastal-dungeon-connector",
        "coastal-threshold",
    ]
    routes["port-sapphire-to-darkfang"]["waypoints"] = [
        {"x": x, "y": y} for x, y in [(1835,1635),(1835,1580),(1838,1504),(1844,1438),(1854,1388),(1870,1338),(1900,1280),(1870,1208),(1831,1121),(1786,1034),(1735,941),(1680,853),(1623,766),(1567,674),(1518,595),(1484,546),(1455,508)]
    ]
    routes["port-sapphire-to-crystal-cave"]["waypoints"] = [
        {"x": x, "y": y} for x, y in [(1835,1635),(1835,1580),(1838,1504),(1844,1438),(1854,1388),(1870,1338),(1900,1280),(1948,1293),(1987,1298),(2022,1292),(2058,1282),(2086,1262),(2105,1245),(2127,1215),(2146,1184),(2160,1153),(2166,1132)]
    ]
    authority["probes"]["bridges"] = [{
        "id": "coastal-bridge",
        "entryA": [1870, 2310],
        "center": [1830, 2338],
        "entryB": [1790, 2365],
    }]
    authority["probes"]["walkable"].append({"id": "coastal-cave-mouth", "point": COASTAL_MOUTH})
    return authority


def render_mask(authority: dict) -> Image.Image:
    mask = Image.new("L", SIZE, 0)
    for item in authority["regions"]:
        region_mask = Image.new("L", SIZE, 0)
        draw = ImageDraw.Draw(region_mask)
        draw.polygon([(p["x"], p["y"]) for p in item["outer"]], fill=255)
        for hole in item.get("holes", []):
            draw.polygon([(p["x"], p["y"]) for p in hole], fill=0)
        mask = ImageChops.lighter(mask, region_mask)
    return mask


def output(path: Path, meaning: str) -> dict:
    image = Image.open(path)
    return {
        "path": str(path.relative_to(ROOT)),
        "meaning": meaning,
        "sha256": sha256(path),
        "decodedPixelSha256": decoded_sha256(image),
        "width": image.width,
        "height": image.height,
        "mode": image.mode,
    }


def main() -> None:
    for path, expected in EXPECTED.items():
        actual = sha256(path)
        if actual != expected:
            raise ValueError(f"locked input drift: {path}: {actual}")

    review = PACK / "review"
    review.mkdir(exist_ok=True)
    authority = build_authority()
    authority_path = PACK / "polygon-authority.json"
    authority_path.write_text(json.dumps(authority, indent=2) + "\n", encoding="utf-8")

    candidate = build_art(authority)
    candidate_path = PACK / "candidate-art.png"
    candidate.save(candidate_path, format="PNG", compress_level=9, optimize=False)
    art_delta = ImageChops.difference(candidate, Image.open(G6_ART).convert("RGB"))
    changed_pixels = sum(1 for pixel in art_delta.getdata() if pixel != (0, 0, 0))

    mask = render_mask(authority)
    mask_path = review / "polygon-mask.png"
    mask.save(mask_path, format="PNG", compress_level=9, optimize=False)

    overlay = candidate.convert("RGBA")
    tint = Image.new("RGBA", SIZE, (255, 0, 214, 0))
    tint.putalpha(mask.point(lambda value: 72 if value else 0))
    overlay = Image.alpha_composite(overlay, tint)
    edge = ImageChops.subtract(mask, mask.filter(ImageFilter.MinFilter(5)))
    overlay = Image.composite(Image.new("RGBA", SIZE, (255, 246, 205, 255)), overlay, edge)
    overlay_path = review / "polygon-overlay.png"
    overlay.save(overlay_path, format="PNG", compress_level=9, optimize=False)

    overview = Image.new("RGB", (1520, 960), (8, 13, 17))
    overview.paste(candidate.resize((728, 896), Image.Resampling.LANCZOS), (24, 48))
    overview.paste(overlay.convert("RGB").resize((728, 896), Image.Resampling.LANCZOS), (768, 48))
    draw = ImageDraw.Draw(overview)
    draw.text((24, 15), "ACT 1 FINAL ART", font=font(24), fill=(232, 238, 229))
    draw.text((768, 15), "SMOOTH ART-FIT WALKABLE GEOMETRY", font=font(24), fill=(232, 238, 229))
    overview_path = review / "owner-overview.png"
    overview.save(overview_path, format="PNG", compress_level=9, optimize=False)

    coastal_crop = (1560, 2220, 2080, 2720)
    candidate.crop(coastal_crop).save(review / "coastal-native.png", format="PNG", compress_level=9, optimize=False)
    overlay.convert("RGB").crop(coastal_crop).save(review / "coastal-overlay-native.png", format="PNG", compress_level=9, optimize=False)
    port_crop = (1660, 1480, 2240, 1940)
    overlay.convert("RGB").crop(port_crop).save(review / "port-overlay-native.png", format="PNG", compress_level=9, optimize=False)
    sunken_crop = (280, 2350, 620, 2720)
    overlay.convert("RGB").crop(sunken_crop).save(review / "sunken-overlay-native.png", format="PNG", compress_level=9, optimize=False)

    inventory = {
        "schema": "act1-final-art-geometry-r26-inventory-v1",
        "status": "owner-review-not-promoted",
        "inputs": [{"path": str(path.relative_to(ROOT)), "sha256": expected} for path, expected in EXPECTED.items()],
        "decision": "one owner-authorized art/geometry reconciliation; smooth polygon curves follow the finished painting",
        "coastal": {
            "oldNativeAnchor": [1690, 2410],
            "finalNativeMouth": COASTAL_MOUTH,
            "artCorrection": "restored short painted approach from the bridge-side trail to the visible cave mouth",
            "runtimeId": "coastalReef",
            "routeId": "port-sapphire-to-coastal-reef",
            "questGuard": "drakeCargo active-or-completed",
            "changedPixelsAgainstG6": changed_pixels,
            "changedPixelBoundsExclusive": list(art_delta.getbbox()),
        },
        "preserved": {
            "portTerminals": [[1840, 1665], [1835, 1635], [2114, 1840]],
            "portComponents": ["west", "north", "southeast"],
            "sunkenCenterline": [[411, 2548], [370, 2495]],
            "sunkenWidth": 11,
            "actorFootRadius": 4,
            "maxSubstep": 2,
            "routeCount": 7,
        },
        "outputs": [
            output(candidate_path, "final native Act 1 art candidate"),
            {
                "path": str(authority_path.relative_to(ROOT)),
                "meaning": "final vector geometry authority",
                "sha256": sha256(authority_path),
            },
            output(mask_path, "derived binary mask; evidence only"),
            output(overlay_path, "native art/geometry conformance overlay"),
            output(overview_path, "owner overview"),
            output(review / "coastal-native.png", "native Coastal Reef art crop"),
            output(review / "coastal-overlay-native.png", "native Coastal Reef conformance crop"),
            output(review / "port-overlay-native.png", "native Port separation crop"),
            output(review / "sunken-overlay-native.png", "native Sunken throat crop"),
        ],
        "nonPromotion": "No runtime, manifest, collision adapter, route source, save, public/dist, build, git, deployment, or release file changed.",
    }
    (PACK / "inventory.json").write_text(json.dumps(inventory, indent=2, sort_keys=True) + "\n", encoding="utf-8")
    print(f"wrote {candidate_path.relative_to(ROOT)} {sha256(candidate_path)}")
    print(f"wrote {authority_path.relative_to(ROOT)} {sha256(authority_path)}")
    print(f"wrote {overlay_path.relative_to(ROOT)} {sha256(overlay_path)}")


if __name__ == "__main__":
    main()
