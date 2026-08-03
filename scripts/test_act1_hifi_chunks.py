#!/usr/bin/env python3
"""Mechanical closure checks for the Act 1 high-fidelity chunk set."""

from __future__ import annotations

import hashlib
import json
import math
from pathlib import Path

from PIL import Image, ImageChops


ROOT = Path(__file__).resolve().parents[1]
RUNTIME = ROOT / "design/review/overworld-art-blueprint/act-by-act/act1/runtime-v2"
SOURCE = ROOT / "design/review/overworld-art-blueprint/act-by-act/act1/generated/act1-v4-routing-corrections-v3-2368x2912.png"


def sha256(path: Path) -> str:
    return hashlib.sha256(path.read_bytes()).hexdigest()


def main() -> None:
    manifest = json.loads((RUNTIME / "manifest.json").read_text(encoding="utf-8"))
    assert manifest["source"]["sha256"] == sha256(SOURCE)
    assert manifest["source"]["width"] == 2368 and manifest["source"]["height"] == 2912
    assert manifest["chunkSize"] == 512 and len(manifest["chunks"]) == 30
    assert manifest["streaming"] == {
        "preloadMargin": 128,
        "detailPreloadMargin": 64,
        "maxLoadedChunks": 6,
        "maxLoadedDetailRegions": 4,
    }
    expected_details = {
        "millbrook-west-912-v1": (1088, 1536, 512, 512),
        "millbrook-port-912-v1": (1504, 1536, 512, 512),
        "north-fork-912-v1": (1600, 1088, 512, 512),
        "darkfang-mid-912-v1": (1472, 736, 512, 512),
        "darkfang-bridge-912-v1": (1344, 480, 512, 512),
        "darkfang-north-912-v1": (1184, 288, 512, 512),
        "crystal-approach-south-912-v1": (1792, 1056, 512, 512),
        "crystal-approach-north-912-v1": (1792, 736, 512, 512),
        "port-sapphire-pixel-source-912-v1": (1856, 1584, 512, 512),
        "whispering-approach-912-v1": (512, 1216, 512, 512),
        "greenhollow-hub-912-v1": (320, 1664, 512, 512),
        "sunken-approach-912-v1": (224, 2112, 512, 512),
        "greenhollow-millbrook-912-v1": (704, 1728, 512, 512),
        "sunken-deep-912-v1": (224, 2240, 512, 512),
        "millbrook-outer-west-912-v1": (1152, 1952, 512, 512),
        "coastal-channel-912-v2": (1696, 1888, 512, 512),
        "coastal-reef-912-v2": (1568, 2144, 512, 512),
    }
    assert [detail["id"] for detail in manifest["detailRegions"]] == list(expected_details)
    for detail in manifest["detailRegions"]:
        assert (detail["x"], detail["y"], detail["width"], detail["height"]) == expected_details[detail["id"]]
        assert detail["featherWorld"] == 24
        assert detail["pixelScale"] == 912 / 512
        for key, sha_key in (
            ("base", "baseSha256"),
            ("water", "waterSha256"),
            ("occlusion", "occlusionSha256"),
        ):
            detail_path = RUNTIME / detail[key]
            assert detail_path.is_file()
            assert sha256(detail_path) == detail[sha_key]
            with Image.open(detail_path) as layer:
                assert layer.size == (
                    round(detail["width"] * detail["pixelScale"]),
                    round(detail["height"] * detail["pixelScale"]),
                )
                assert layer.mode == "RGBA"
    assert len(manifest["semanticRows"]) == 182
    assert all(len(row) == 148 for row in manifest["semanticRows"])
    constraints = manifest["pathConstraints"]
    assert manifest["revision"] == 10 and constraints["revision"] == 2
    assert manifest["status"] == "act1-912-design-locked"
    locks = manifest["designLocks"]
    assert locks["worldSourcePixelsPerWorldPixel"] == 912 / 512
    assert locks["heroSourcePixelsPerWorldPixel"] == 64 / 36
    assert locks["cameraWorldWidth"] == 208
    assert locks["heroNativeFrame"] == 64 and locks["heroWorldHeight"] == 36
    assert locks["heroDirections"] == 8
    assert locks["heroRuntimeDirections"] == 4
    assert locks["walkPoseMs"] == 125
    assert locks["movementInput"] == "continuous-normalized-analog"
    assert locks["collisionOwner"] == "authored-geometry"
    assert constraints["movementSpeed"] == 52 and constraints["actorFootRadius"] == 4
    assert constraints["revision"] == 2
    assert [corridor["id"] for corridor in constraints["corridors"]] == [
        "greenhollow-to-sunken-cellar",
        "greenhollow-to-whispering-woods-cave",
        "greenhollow-to-millbrook",
        "millbrook-to-port-sapphire",
        "port-sapphire-to-coastal-reef",
        "port-sapphire-to-darkfang",
        "port-sapphire-to-crystal-cave",
    ]
    for corridor in constraints["corridors"]:
        assert len(corridor["semanticCells"]) == len(corridor["semanticSpineCells"]) + 2
        assert len(corridor["commitPoints"]) == len(corridor["semanticCells"])
        assert len(corridor["semanticCommitPoints"]) == len(corridor["semanticSpineCells"])
        assert len({point["halfWidth"] for point in corridor["points"]}) >= 2
        assert all(point["halfWidth"] > constraints["actorFootRadius"] for point in corridor["points"])
        assert [probe["id"] for probe in corridor["blockerProbes"]] == [
            "from-landmark", "route-edge", "to-landmark",
        ]
    gate = constraints["gates"][0]
    assert gate["id"] == "crystal-cave-seal"
    assert gate["semanticCell"] == [148, 293]
    assert gate["requiredFlag"] == "boss.giantToad.defeated"
    assert constraints["exclusionZones"][0]["id"] == "millbrook-southeast-old-growth-block"

    def authored(point, include_port=True):
        details = manifest["detailRegions"] if include_port else [
            detail for detail in manifest["detailRegions"]
            if detail["id"] != "port-sapphire-pixel-source-912-v1"
        ]
        for detail in details:
            if not (
                detail["x"] <= point["x"] <= detail["x"] + detail["width"]
                and detail["y"] <= point["y"] <= detail["y"] + detail["height"]
            ):
                continue
            excluded = any(
                exclusion["shape"] == "circle"
                and math.hypot(point["x"] - exclusion["cx"], point["y"] - exclusion["cy"])
                <= exclusion["innerRadius"]
                for exclusion in detail.get("visualExclusions", [])
            )
            if not excluded:
                return True
        return False

    corridor_by_id = {corridor["id"]: corridor for corridor in constraints["corridors"]}
    for route_id in (
        "greenhollow-to-sunken-cellar",
        "greenhollow-to-whispering-woods-cave",
        "greenhollow-to-millbrook",
    ):
        assert all(authored(point) for point in corridor_by_id[route_id]["points"])
    assert all(authored(point) for point in corridor_by_id["millbrook-to-port-sapphire"]["points"])
    assert all(authored(point) for point in corridor_by_id["port-sapphire-to-coastal-reef"]["points"])
    darkfang = corridor_by_id["port-sapphire-to-darkfang"]
    assert all(authored(point) for point in darkfang["points"])
    assert authored({"x": 2090, "y": 1260}, include_port=False)
    assert authored({"x": 2134, "y": 1192}, include_port=False)
    assert not authored({"x": 2166, "y": 1132}, include_port=False)

    affinity = {
        detail["id"]: detail.get("routeAffinity", [])
        for detail in manifest["detailRegions"]
    }
    for detail_id in (
        "darkfang-mid-912-v1", "darkfang-bridge-912-v1", "darkfang-north-912-v1",
    ):
        assert affinity[detail_id] == [{"routeId": "port-sapphire-to-darkfang"}]
    assert affinity["crystal-approach-south-912-v1"] == [
        {"routeId": "port-sapphire-to-crystal-cave"},
    ]
    assert affinity["crystal-approach-north-912-v1"] == [{
        "routeId": "port-sapphire-to-crystal-cave",
        "preloadMinProgress": 9.25,
        "drawMinProgress": 10.51,
    }]
    for detail_id in (
        "whispering-approach-912-v1",
        "greenhollow-hub-912-v1",
        "sunken-approach-912-v1",
        "greenhollow-millbrook-912-v1",
        "sunken-deep-912-v1",
        "millbrook-outer-west-912-v1",
    ):
        assert affinity[detail_id] == []
    for detail_id in ("coastal-channel-912-v2", "coastal-reef-912-v2"):
        assert affinity[detail_id] == [{"routeId": "port-sapphire-to-coastal-reef"}]

    crystal_exclusion = [{
        "shape": "circle", "cx": 2166, "cy": 1132,
        "innerRadius": 38, "featherWorld": 24,
    }]
    for detail_id in ("crystal-approach-south-912-v1", "crystal-approach-north-912-v1"):
        detail = next(item for item in manifest["detailRegions"] if item["id"] == detail_id)
        assert detail["visualExclusions"] == crystal_exclusion
        with Image.open(RUNTIME / detail["base"]) as layer:
            scale = detail["pixelScale"]
            center = (round((2166 - detail["x"]) * scale), round((1132 - detail["y"]) * scale))
            outside = (round((2166 + 70 - detail["x"]) * scale), center[1])
            assert layer.getpixel(center)[3] == 0
            assert layer.getpixel(outside)[3] == 255

    def affinity_matches(detail, route_id, progress, phase):
        affinities = detail.get("routeAffinity")
        if not affinities:
            return True
        rule = next((item for item in affinities if item["routeId"] == route_id), None)
        if rule is None:
            return False
        minimum = rule.get(
            "preloadMinProgress" if phase == "preload" else "drawMinProgress",
            rule.get("preloadMinProgress"),
        )
        maximum = rule.get(
            "preloadMaxProgress" if phase == "preload" else "drawMaxProgress",
            rule.get("preloadMaxProgress"),
        )
        return (minimum is None or progress >= minimum) and (maximum is None or progress <= maximum)

    def selected_details(route, progress, phase):
        index = min(len(route["points"]) - 2, math.floor(progress))
        segment_t = progress - index
        before, after = route["points"][index:index + 2]
        hero_x = before["x"] + (after["x"] - before["x"]) * segment_t
        hero_y = before["y"] + (after["y"] - before["y"]) * segment_t
        view_width = 208
        view_height = 208 * (1846 * 0.8224) / 852
        margin = 64 if phase == "preload" else 0
        view = (
            hero_x - view_width / 2 - margin,
            hero_y - view_height / 2 + 40 - margin,
            hero_x + view_width / 2 + margin,
            hero_y + view_height / 2 + 40 + margin,
        )
        return {
            detail["id"] for detail in manifest["detailRegions"]
            if affinity_matches(detail, route["id"], progress, phase)
            and detail["x"] < view[2]
            and detail["x"] + detail["width"] > view[0]
            and detail["y"] < view[3]
            and detail["y"] + detail["height"] > view[1]
        }

    def raw_coverage_ratio(route, progress):
        index = min(len(route["points"]) - 2, math.floor(progress))
        segment_t = progress - index
        before, after = route["points"][index:index + 2]
        hero_x = before["x"] + (after["x"] - before["x"]) * segment_t
        hero_y = before["y"] + (after["y"] - before["y"]) * segment_t
        view = (
            hero_x - 104,
            hero_y - 208 * (1846 * 0.8224) / 852 / 2 + 40,
            hero_x + 104,
            hero_y + 208 * (1846 * 0.8224) / 852 / 2 + 40,
        )
        selected = [
            detail for detail in manifest["detailRegions"]
            if affinity_matches(detail, route["id"], progress, "draw")
            and detail["x"] < view[2]
            and detail["x"] + detail["width"] > view[0]
            and detail["y"] < view[3]
            and detail["y"] + detail["height"] > view[1]
        ]
        x_edges = sorted({
            view[0], view[2],
            *(
                max(view[0], min(view[2], edge))
                for detail in selected
                for edge in (detail["x"], detail["x"] + detail["width"])
            ),
        })
        y_edges = sorted({
            view[1], view[3],
            *(
                max(view[1], min(view[3], edge))
                for detail in selected
                for edge in (detail["y"], detail["y"] + detail["height"])
            ),
        })
        covered_area = 0.0
        for left, right in zip(x_edges, x_edges[1:]):
            for top, bottom in zip(y_edges, y_edges[1:]):
                midpoint = {"x": (left + right) / 2, "y": (top + bottom) / 2}
                if any(
                    detail["x"] <= midpoint["x"] <= detail["x"] + detail["width"]
                    and detail["y"] <= midpoint["y"] <= detail["y"] + detail["height"]
                    for detail in selected
                ):
                    covered_area += (right - left) * (bottom - top)
        view_area = (view[2] - view[0]) * (view[3] - view[1])
        return covered_area / view_area

    expected_selection_peaks = {
        "greenhollow-to-sunken-cellar": (4, 4),
        "greenhollow-to-whispering-woods-cave": (4, 3),
        "greenhollow-to-millbrook": (4, 3),
        "millbrook-to-port-sapphire": (4, 4),
        "port-sapphire-to-coastal-reef": (4, 4),
        "port-sapphire-to-darkfang": (4, 4),
        "port-sapphire-to-crystal-cave": (4, 4),
    }
    for route in constraints["corridors"]:
        preload_peak = draw_peak = 0
        for index in range(len(route["points"]) - 1):
            for step in range(201):
                progress = index + step / 200
                preload = selected_details(route, progress, "preload")
                draw = selected_details(route, progress, "draw")
                assert draw <= preload
                preload_peak = max(preload_peak, len(preload))
                draw_peak = max(draw_peak, len(draw))
        assert (preload_peak, draw_peak) == expected_selection_peaks[route["id"]]
        assert preload_peak <= 4 and draw_peak <= 4

    coastal = corridor_by_id["port-sapphire-to-coastal-reef"]
    for index in range(len(coastal["points"]) - 1):
        for step in range(201):
            progress = index + step / 200
            assert math.isclose(raw_coverage_ratio(coastal, progress), 1.0, abs_tol=1e-12)

    crystal_north = next(
        detail for detail in manifest["detailRegions"]
        if detail["id"] == "crystal-approach-north-912-v1"
    )
    assert not affinity_matches(crystal_north, "port-sapphire-to-crystal-cave", 9.249, "preload")
    assert affinity_matches(crystal_north, "port-sapphire-to-crystal-cave", 9.25, "preload")
    assert not affinity_matches(crystal_north, "port-sapphire-to-crystal-cave", 10.509, "draw")
    assert affinity_matches(crystal_north, "port-sapphire-to-crystal-cave", 10.51, "draw")

    reconstructed = Image.new("RGB", (2368, 2912))
    covered = Image.new("1", reconstructed.size, 0)
    for chunk in manifest["chunks"]:
        for key, sha_key in (
            ("base", "baseSha256"),
            ("water", "waterSha256"),
            ("occlusion", "occlusionSha256"),
        ):
            path = RUNTIME / chunk[key]
            assert path.is_file(), path
            assert sha256(path) == chunk[sha_key], path
        base = Image.open(RUNTIME / chunk["base"]).convert("RGB")
        expected_size = (chunk["width"], chunk["height"])
        assert base.size == expected_size
        reconstructed.paste(base, (chunk["x"], chunk["y"]))
        covered.paste(1, (chunk["x"], chunk["y"], chunk["x"] + chunk["width"], chunk["y"] + chunk["height"]))
    assert covered.getbbox() == (0, 0, 2368, 2912)
    assert ImageChops.difference(reconstructed, Image.open(SOURCE).convert("RGB")).getbbox() is None
    assert (RUNTIME / "index.html").is_file()
    print("ACT 1 HIFI CHUNK TEST PASS: exact 2368x2912 reconstruction; 30 bounded chunks")


if __name__ == "__main__":
    main()
