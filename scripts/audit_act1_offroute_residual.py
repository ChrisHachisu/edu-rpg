#!/usr/bin/env python3
"""Census the remaining player-observable Act 1 legacy base after Relay 08."""

from __future__ import annotations

import argparse
import hashlib
import json
import math
from pathlib import Path

import numpy as np
from PIL import Image


ROOT = Path(__file__).resolve().parents[1]
RUNTIME = ROOT / "design/review/overworld-art-blueprint/act-by-act/act1/runtime-v2"
SOURCE = ROOT / "design/review/overworld-art-blueprint/act-by-act/act1/generated/act1-v4-routing-corrections-v3-2368x2912.png"
DEFAULT_OUTPUT = RUNTIME / "off-route-residual-r09/evidence"
PHONE_FRAME = (852, 1846)
CAMERA_WORLD_WIDTH = 208
STAGE_HEIGHT_RATIO = 0.8224
CAMERA_TARGET_Y = 40


def sha256(path: Path) -> str:
    return hashlib.sha256(path.read_bytes()).hexdigest()


def route_reachability(route: dict, shape: tuple[int, int], actor_radius: float) -> np.ndarray:
    """Evaluate the runtime tapered-segment constraint at every source-pixel center."""
    height, width = shape
    reachable = np.zeros(shape, dtype=bool)
    for start, end in zip(route["points"], route["points"][1:]):
        start_radius = start["halfWidth"] - actor_radius
        end_radius = end["halfWidth"] - actor_radius
        radius = max(start_radius, end_radius)
        left = max(0, math.floor(min(start["x"], end["x"]) - radius - 1))
        right = min(width, math.ceil(max(start["x"], end["x"]) + radius + 1))
        top = max(0, math.floor(min(start["y"], end["y"]) - radius - 1))
        bottom = min(height, math.ceil(max(start["y"], end["y"]) + radius + 1))
        xs = np.arange(left, right, dtype=np.float64) + 0.5
        ys = np.arange(top, bottom, dtype=np.float64)[:, None] + 0.5
        dx = end["x"] - start["x"]
        dy = end["y"] - start["y"]
        length2 = dx * dx + dy * dy
        if length2 == 0:
            progress = np.zeros((bottom - top, right - left), dtype=np.float64)
        else:
            progress = np.clip(
                ((xs - start["x"]) * dx + (ys - start["y"]) * dy) / length2,
                0,
                1,
            )
        center_x = start["x"] + dx * progress
        center_y = start["y"] + dy * progress
        allowed = start_radius + (end_radius - start_radius) * progress
        inside = (xs - center_x) ** 2 + (ys - center_y) ** 2 <= allowed ** 2 + 1e-12
        reachable[top:bottom, left:right] |= inside
    return reachable


def route_progress(route: dict, reachable: np.ndarray) -> np.ndarray:
    """Mirror projectPolylineProgress for the reachable source-pixel centers."""
    ys, xs = np.nonzero(reachable)
    point_x = xs.astype(np.float64) + 0.5
    point_y = ys.astype(np.float64) + 0.5
    best_distance2 = np.full(xs.shape, np.inf)
    best_progress = np.zeros(xs.shape, dtype=np.float64)
    for index, (start, end) in enumerate(zip(route["points"], route["points"][1:])):
        dx = end["x"] - start["x"]
        dy = end["y"] - start["y"]
        length2 = dx * dx + dy * dy
        progress = np.zeros(xs.shape, dtype=np.float64) if length2 == 0 else np.clip(
            ((point_x - start["x"]) * dx + (point_y - start["y"]) * dy) / length2,
            0,
            1,
        )
        center_x = start["x"] + dx * progress
        center_y = start["y"] + dy * progress
        distance2 = (point_x - center_x) ** 2 + (point_y - center_y) ** 2
        better = distance2 < best_distance2
        best_distance2[better] = distance2[better]
        best_progress[better] = index + progress[better]
    result = np.full(reachable.shape, np.nan, dtype=np.float32)
    result[ys, xs] = best_progress
    return result


def rectangle_dilate(
    source: np.ndarray,
    *,
    observe_left: int,
    observe_right: int,
    observe_top: int,
    observe_bottom: int,
) -> np.ndarray:
    """Return pixels observable from any true pixel using an asymmetric camera rectangle."""
    height, width = source.shape
    x = np.arange(width)
    q_left = np.maximum(0, x - observe_right)
    q_right = np.minimum(width, x + observe_left + 1)
    horizontal_prefix = np.empty((height, width + 1), dtype=np.int32)
    horizontal_prefix[:, 0] = 0
    np.cumsum(source, axis=1, dtype=np.int32, out=horizontal_prefix[:, 1:])
    horizontal = horizontal_prefix[:, q_right] > horizontal_prefix[:, q_left]
    del horizontal_prefix

    y = np.arange(height)
    q_top = np.maximum(0, y - observe_bottom)
    q_bottom = np.minimum(height, y + observe_top + 1)
    vertical_prefix = np.empty((height + 1, width), dtype=np.int32)
    vertical_prefix[0, :] = 0
    np.cumsum(horizontal, axis=0, dtype=np.int32, out=vertical_prefix[1:, :])
    return vertical_prefix[q_bottom, :] > vertical_prefix[q_top, :]


def matching_rule(detail: dict, route_id: str) -> dict | None:
    affinities = detail.get("routeAffinity") or []
    if not affinities:
        return {}
    return next((rule for rule in affinities if rule["routeId"] == route_id), None)


def draw_affinity_matches(rule: dict | None, progress: np.ndarray) -> np.ndarray:
    if rule is None:
        return np.zeros(progress.shape, dtype=bool)
    minimum = rule.get("drawMinProgress", rule.get("preloadMinProgress"))
    maximum = rule.get("drawMaxProgress", rule.get("preloadMaxProgress"))
    result = np.ones(progress.shape, dtype=bool)
    if minimum is not None:
        result &= progress >= minimum
    if maximum is not None:
        result &= progress <= maximum
    return result


def detail_alpha(detail: dict) -> np.ndarray:
    """Sample the 912 layer at 512 world-pixel centers with canvas-nearest mapping."""
    with Image.open(RUNTIME / detail["base"]) as image:
        alpha = np.asarray(image.getchannel("A"))
    width = detail["width"]
    height = detail["height"]
    source_x = np.minimum(alpha.shape[1] - 1, ((np.arange(width) + 0.5) * alpha.shape[1] / width).astype(int))
    source_y = np.minimum(alpha.shape[0] - 1, ((np.arange(height) + 0.5) * alpha.shape[0] / height).astype(int))
    return alpha[np.ix_(source_y, source_x)]


def coverage_classes(
    manifest: dict,
    included_detail_indices: tuple[int, ...],
    alphas: list[np.ndarray],
    shape: tuple[int, int],
) -> tuple[np.ndarray, np.ndarray, np.ndarray]:
    raw = np.zeros(shape, dtype=bool)
    any_alpha = np.zeros(shape, dtype=bool)
    opaque = np.zeros(shape, dtype=bool)
    for index in included_detail_indices:
        detail = manifest["detailRegions"][index]
        left, top = detail["x"], detail["y"]
        right, bottom = left + detail["width"], top + detail["height"]
        raw[top:bottom, left:right] = True
        crop = alphas[index]
        any_alpha[top:bottom, left:right] |= crop > 0
        opaque[top:bottom, left:right] |= crop == 255
    return raw, any_alpha, opaque


def camera_window_counts(mask: np.ndarray, reachable: np.ndarray, offsets: dict[str, int]) -> tuple[np.ndarray, np.ndarray, np.ndarray]:
    """Count mask pixels in the exact discrete phone view at each reachable center."""
    height, width = mask.shape
    integral = np.zeros((height + 1, width + 1), dtype=np.int32)
    np.cumsum(mask, axis=1, dtype=np.int32, out=integral[1:, 1:])
    np.cumsum(integral[1:, 1:], axis=0, dtype=np.int32, out=integral[1:, 1:])
    ys, xs = np.nonzero(reachable)
    left = np.maximum(0, xs - offsets["left"])
    right = np.minimum(width, xs + offsets["right"] + 1)
    top = np.maximum(0, ys - offsets["top"])
    bottom = np.minimum(height, ys + offsets["bottom"] + 1)
    counts = integral[bottom, right] - integral[top, right] - integral[bottom, left] + integral[top, left]
    return counts, ys, xs


def protected_visual_exclusions(manifest: dict, shape: tuple[int, int]) -> np.ndarray:
    """Mark the retained fallback intentionally exposed by manifest exclusions."""
    height, width = shape
    protected = np.zeros(shape, dtype=bool)
    seen = set()
    for detail in manifest["detailRegions"]:
        for exclusion in detail.get("visualExclusions", []):
            if exclusion["shape"] != "circle":
                raise AssertionError(f"unsupported visual exclusion {exclusion['shape']}")
            radius = exclusion["innerRadius"] + exclusion["featherWorld"]
            key = (exclusion["cx"], exclusion["cy"], radius)
            if key in seen:
                continue
            seen.add(key)
            left = max(0, math.floor(exclusion["cx"] - radius - 1))
            right = min(width, math.ceil(exclusion["cx"] + radius + 1))
            top = max(0, math.floor(exclusion["cy"] - radius - 1))
            bottom = min(height, math.ceil(exclusion["cy"] + radius + 1))
            xs = np.arange(left, right, dtype=np.float64) + 0.5
            ys = np.arange(top, bottom, dtype=np.float64)[:, None] + 0.5
            protected[top:bottom, left:right] |= (
                (xs - exclusion["cx"]) ** 2 + (ys - exclusion["cy"]) ** 2 <= radius ** 2
            )
    return protected


def signature_groups(manifest: dict, route: dict, reachable: np.ndarray, progress: np.ndarray) -> dict[tuple[int, ...], np.ndarray]:
    eligibility = []
    for detail in manifest["detailRegions"]:
        rule = matching_rule(detail, route["id"])
        eligibility.append(draw_affinity_matches(rule, progress))
    bitmask = np.zeros(reachable.shape, dtype=np.uint32)
    for index, eligible in enumerate(eligibility):
        bitmask |= eligible.astype(np.uint32) << index
    groups = {}
    for signature in np.unique(bitmask[reachable]):
        included = tuple(index for index in range(len(eligibility)) if signature & (1 << index))
        groups[included] = reachable & (bitmask == signature)
    return groups


class UnionFind:
    def __init__(self) -> None:
        self.parent: list[int] = []

    def add(self) -> int:
        label = len(self.parent)
        self.parent.append(label)
        return label

    def find(self, label: int) -> int:
        while self.parent[label] != label:
            self.parent[label] = self.parent[self.parent[label]]
            label = self.parent[label]
        return label

    def union(self, left: int, right: int) -> None:
        left_root, right_root = self.find(left), self.find(right)
        if left_root != right_root:
            self.parent[right_root] = left_root


def connected_components(mask: np.ndarray) -> tuple[np.ndarray, list[dict]]:
    """Label exact 4-connected components using row runs."""
    union_find = UnionFind()
    all_runs: list[tuple[int, int, int, int]] = []
    previous: list[tuple[int, int, int]] = []
    for y, row in enumerate(mask):
        edges = np.diff(np.pad(row.astype(np.int8), (1, 1)))
        starts = np.flatnonzero(edges == 1)
        ends = np.flatnonzero(edges == -1)
        current: list[tuple[int, int, int]] = []
        previous_index = 0
        for start, end in zip(starts, ends):
            while previous_index < len(previous) and previous[previous_index][1] <= start:
                previous_index += 1
            overlaps = []
            probe = previous_index
            while probe < len(previous) and previous[probe][0] < end:
                overlaps.append(previous[probe][2])
                probe += 1
            label = union_find.add() if not overlaps else overlaps[0]
            for overlap in overlaps[1:]:
                union_find.union(label, overlap)
            current.append((int(start), int(end), label))
            all_runs.append((y, int(start), int(end), label))
        previous = current

    root_to_index: dict[int, int] = {}
    labels = np.zeros(mask.shape, dtype=np.int32)
    stats: list[dict] = []
    for y, start, end, label in all_runs:
        root = union_find.find(label)
        index = root_to_index.get(root)
        if index is None:
            index = len(stats) + 1
            root_to_index[root] = index
            stats.append({"id": index, "pixels": 0, "bounds": [start, y, end, y + 1]})
        labels[y, start:end] = index
        stat = stats[index - 1]
        stat["pixels"] += end - start
        stat["bounds"][0] = min(stat["bounds"][0], start)
        stat["bounds"][1] = min(stat["bounds"][1], y)
        stat["bounds"][2] = max(stat["bounds"][2], end)
        stat["bounds"][3] = max(stat["bounds"][3], y + 1)
    return labels, stats


def landmark_points(constraints: dict) -> dict[str, tuple[float, float]]:
    result = {}
    for route in constraints["corridors"]:
        result[route["fromLandmarkId"]] = (route["points"][0]["x"], route["points"][0]["y"])
        result[route["toLandmarkId"]] = (route["points"][-1]["x"], route["points"][-1]["y"])
    return result


def landmark_view_mask(point: tuple[float, float], shape: tuple[int, int]) -> np.ndarray:
    height, width = shape
    x, y = point
    left = max(0, math.floor(x - 104))
    right = min(width, math.ceil(x + 104))
    top = max(0, math.floor(y - 145.31413333333335))
    bottom = min(height, math.ceil(y + 225.31413333333335))
    mask = np.zeros(shape, dtype=bool)
    mask[top:bottom, left:right] = True
    return mask


def save_overlay(
    source: Image.Image,
    reachable: np.ndarray,
    blended: np.ndarray,
    actionable_pure: np.ndarray,
    protected: np.ndarray,
    output: Path,
) -> None:
    base = np.asarray(source.convert("RGB")).copy()
    colors = np.zeros_like(base)
    colors[reachable] = (40, 150, 255)
    colors[blended] = (255, 190, 30)
    colors[actionable_pure] = (255, 40, 80)
    colors[protected] = (190, 80, 255)
    visible = reachable | blended | actionable_pure | protected
    base[visible] = (base[visible].astype(np.uint16) * 45 // 100 + colors[visible].astype(np.uint16) * 55 // 100).astype(np.uint8)
    Image.fromarray(base).save(output, optimize=True)


def save_component_review(source_path: Path, overlay_path: Path, output: Path) -> None:
    """Build the deterministic source/overlay crop sheet used for visual review."""
    crops = (
        (2010, 1010, 260, 220),
        (2000, 1400, 300, 250),
        (1390, 1400, 300, 220),
        (640, 2150, 260, 230),
    )
    with Image.open(source_path) as source, Image.open(overlay_path) as overlay:
        rows = []
        for left, top, width, height in crops:
            box = (left, top, left + width, top + height)
            row = Image.new("RGB", (width * 2, height), "#101820")
            row.paste(source.convert("RGB").crop(box), (0, 0))
            row.paste(overlay.convert("RGB").crop(box), (width, 0))
            rows.append(row)
    sheet = Image.new("RGB", (max(row.width for row in rows), sum(row.height for row in rows)), "#101820")
    y = 0
    for row in rows:
        sheet.paste(row, ((sheet.width - row.width) // 2, y))
        y += row.height
    sheet.save(output, optimize=True)


def write_evidence_inventory(output_dir: Path) -> None:
    names = (
        "off-route-residual-census-v1.json",
        "off-route-residual-component-review-v1.png",
        "off-route-residual-mask-v1.png",
        "off-route-residual-overlay-v1.png",
    )
    entries = [
        [(path.relative_to(ROOT)).as_posix(), sha256(path)]
        for path in sorted(output_dir / name for name in names)
    ]
    aggregate = hashlib.sha256(
        json.dumps(entries, ensure_ascii=True, separators=(",", ":")).encode()
    ).hexdigest()
    inventory = {
        "schemaVersion": 1,
        "purpose": "Transparent inventory of the deterministic Relay 09 off-route residual audit evidence.",
        "canonicalAggregateAlgorithm": "SHA-256 of UTF-8 JSON for the entries array only, with ensure_ascii=true and separators=(comma,colon); entries are [repo-relative POSIX path, lowercase file SHA-256] pairs sorted by path.",
        "count": len(entries),
        "canonicalAggregate": aggregate,
        "entries": entries,
    }
    (output_dir / "off-route-residual-evidence-inventory-v1.json").write_text(
        json.dumps(inventory, indent=2) + "\n",
        encoding="utf-8",
    )


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--output-dir", type=Path, default=DEFAULT_OUTPUT)
    args = parser.parse_args()
    args.output_dir.mkdir(parents=True, exist_ok=True)

    manifest = json.loads((RUNTIME / "manifest.json").read_text(encoding="utf-8"))
    assert manifest["revision"] == 8
    assert manifest["pathConstraints"]["revision"] == 2
    assert len(manifest["detailRegions"]) == 17
    assert manifest["designLocks"]["cameraWorldWidth"] == CAMERA_WORLD_WIDTH
    assert manifest["source"]["sha256"] == sha256(SOURCE)
    width, height = manifest["source"]["width"], manifest["source"]["height"]
    shape = (height, width)
    view_height = CAMERA_WORLD_WIDTH * (PHONE_FRAME[1] * STAGE_HEIGHT_RATIO) / PHONE_FRAME[0]
    assert math.isclose(view_height, 370.6282666666667)
    camera_offsets = {
        "left": 104,
        "right": 103,
        "top": 145,
        "bottom": 225,
    }
    camera_lag_envelope_world = 7
    lag_offsets = {key: value + camera_lag_envelope_world for key, value in camera_offsets.items()}

    detail_alphas = [detail_alpha(detail) for detail in manifest["detailRegions"]]
    protected_fallback = protected_visual_exclusions(manifest, shape)
    route_results = []
    manual_context_results = []
    route_pure_masks: dict[str, np.ndarray] = {}
    reachable_union = np.zeros(shape, dtype=bool)
    observable_union = np.zeros(shape, dtype=bool)
    pure_union = np.zeros(shape, dtype=bool)
    blend_union = np.zeros(shape, dtype=bool)
    raw_uncovered_union = np.zeros(shape, dtype=bool)
    lag_observable_union = np.zeros(shape, dtype=bool)
    lag_pure_union = np.zeros(shape, dtype=bool)

    for route in manifest["pathConstraints"]["corridors"]:
        reachable = route_reachability(route, shape, manifest["pathConstraints"]["actorFootRadius"])
        progress = route_progress(route, reachable)
        groups = signature_groups(manifest, route, reachable, progress)
        observable = np.zeros(shape, dtype=bool)
        pure = np.zeros(shape, dtype=bool)
        blended = np.zeros(shape, dtype=bool)
        raw_uncovered = np.zeros(shape, dtype=bool)
        lag_observable = np.zeros(shape, dtype=bool)
        lag_pure = np.zeros(shape, dtype=bool)
        reachable_pure = np.zeros(shape, dtype=bool)
        signatures = []
        peak = None
        for included, group_reachable in groups.items():
            group_observable = rectangle_dilate(group_reachable, **{
                "observe_left": camera_offsets["left"],
                "observe_right": camera_offsets["right"],
                "observe_top": camera_offsets["top"],
                "observe_bottom": camera_offsets["bottom"],
            })
            group_lag_observable = rectangle_dilate(group_reachable, **{
                "observe_left": lag_offsets["left"],
                "observe_right": lag_offsets["right"],
                "observe_top": lag_offsets["top"],
                "observe_bottom": lag_offsets["bottom"],
            })
            raw, any_alpha, opaque = coverage_classes(manifest, included, detail_alphas, shape)
            actionable_pure_map = ~any_alpha & ~protected_fallback
            observable |= group_observable
            lag_observable |= group_lag_observable
            pure |= group_observable & ~any_alpha
            lag_pure |= group_lag_observable & ~any_alpha
            blended |= group_observable & any_alpha & ~opaque
            raw_uncovered |= group_observable & ~raw
            reachable_pure |= group_reachable & ~any_alpha
            counts, peak_ys, peak_xs = camera_window_counts(actionable_pure_map, group_reachable, camera_offsets)
            peak_index = int(np.argmax(counts))
            candidate_peak = {
                "actionablePureLegacyPixels": int(counts[peak_index]),
                "fractionOfDiscretePhoneView": float(counts[peak_index] / (
                    (camera_offsets["left"] + camera_offsets["right"] + 1)
                    * (camera_offsets["top"] + camera_offsets["bottom"] + 1)
                )),
                "hero": [float(peak_xs[peak_index] + 0.5), float(peak_ys[peak_index] + 0.5)],
                "routeProgress": float(progress[peak_ys[peak_index], peak_xs[peak_index]]),
            }
            if peak is None or candidate_peak["actionablePureLegacyPixels"] > peak["actionablePureLegacyPixels"]:
                peak = candidate_peak
            signatures.append({
                "detailIds": [manifest["detailRegions"][index]["id"] for index in included],
                "reachablePixels": int(group_reachable.sum()),
                "observablePixels": int(group_observable.sum()),
            })
        route_pure_masks[route["id"]] = pure
        reachable_union |= reachable
        observable_union |= observable
        pure_union |= pure
        blend_union |= blended
        raw_uncovered_union |= raw_uncovered
        lag_observable_union |= lag_observable
        lag_pure_union |= lag_pure
        route_results.append({
            "routeId": route["id"],
            "reachablePixels": int(reachable.sum()),
            "observablePixels": int(observable.sum()),
            "pureLegacyObservablePixels": int(pure.sum()),
            "protectedRetainedFallbackPixels": int((pure & protected_fallback).sum()),
            "actionablePureLegacyObservablePixels": int((pure & ~protected_fallback).sum()),
            "partialLegacyBlendPixels": int(blended.sum()),
            "rawRectangleUncoveredPixels": int(raw_uncovered.sum()),
            "conservativeLagObservablePixels": int(lag_observable.sum()),
            "conservativeLagActionablePureLegacyPixels": int((lag_pure & ~protected_fallback).sum()),
            "reachablePureLegacyPixels": int(reachable_pure.sum()),
            "reachableActionablePureLegacyPixels": int((reachable_pure & ~protected_fallback).sum()),
            "peakActionablePureLegacyFrame": peak,
            "pureLegacyObservableBounds": None if not pure.any() else [
                int(np.flatnonzero(pure.any(axis=0))[0]),
                int(np.flatnonzero(pure.any(axis=1))[0]),
                int(np.flatnonzero(pure.any(axis=0))[-1] + 1),
                int(np.flatnonzero(pure.any(axis=1))[-1] + 1),
            ],
            "affinitySignatures": signatures,
        })

    # The playable shell uses all corridors for manual movement while keeping
    # route affinity fixed to the URL-selected activeCorridor. Audit that literal
    # behavior separately from the accepted route-local capture contract.
    for active_route in manifest["pathConstraints"]["corridors"]:
        progress = route_progress(active_route, reachable_union)
        groups = signature_groups(manifest, active_route, reachable_union, progress)
        observable = np.zeros(shape, dtype=bool)
        pure = np.zeros(shape, dtype=bool)
        blended = np.zeros(shape, dtype=bool)
        reachable_pure = np.zeros(shape, dtype=bool)
        peak = None
        signatures = []
        for included, group_reachable in groups.items():
            group_observable = rectangle_dilate(group_reachable, **{
                "observe_left": camera_offsets["left"],
                "observe_right": camera_offsets["right"],
                "observe_top": camera_offsets["top"],
                "observe_bottom": camera_offsets["bottom"],
            })
            _, any_alpha, opaque = coverage_classes(manifest, included, detail_alphas, shape)
            actionable_pure_map = ~any_alpha & ~protected_fallback
            observable |= group_observable
            pure |= group_observable & ~any_alpha
            blended |= group_observable & any_alpha & ~opaque
            reachable_pure |= group_reachable & ~any_alpha
            counts, peak_ys, peak_xs = camera_window_counts(
                actionable_pure_map,
                group_reachable,
                camera_offsets,
            )
            peak_index = int(np.argmax(counts))
            candidate_peak = {
                "actionablePureLegacyPixels": int(counts[peak_index]),
                "fractionOfDiscretePhoneView": float(counts[peak_index] / (
                    (camera_offsets["left"] + camera_offsets["right"] + 1)
                    * (camera_offsets["top"] + camera_offsets["bottom"] + 1)
                )),
                "hero": [float(peak_xs[peak_index] + 0.5), float(peak_ys[peak_index] + 0.5)],
                "activeRouteProgress": float(progress[peak_ys[peak_index], peak_xs[peak_index]]),
            }
            if peak is None or candidate_peak["actionablePureLegacyPixels"] > peak["actionablePureLegacyPixels"]:
                peak = candidate_peak
            signatures.append({
                "detailIds": [manifest["detailRegions"][index]["id"] for index in included],
                "reachablePixels": int(group_reachable.sum()),
                "observablePixels": int(group_observable.sum()),
            })
        manual_context_results.append({
            "activeRouteId": active_route["id"],
            "reachablePixels": int(reachable_union.sum()),
            "observablePixels": int(observable.sum()),
            "pureLegacyObservablePixels": int(pure.sum()),
            "pureLegacyObservableFraction": float(pure.sum() / observable.sum()),
            "actionablePureLegacyObservablePixels": int((pure & ~protected_fallback).sum()),
            "partialLegacyBlendPixels": int(blended.sum()),
            "reachablePureLegacyPixels": int((reachable_pure & ~protected_fallback).sum()),
            "reachablePureLegacyFraction": float(
                (reachable_pure & ~protected_fallback).sum() / reachable_union.sum()
            ),
            "peakActionablePureLegacyFrame": peak,
            "affinitySignatures": signatures,
        })

    actionable_pure_union = pure_union & ~protected_fallback
    labels, components = connected_components(actionable_pure_union)
    endpoints = landmark_points(manifest["pathConstraints"])
    for component in components:
        component_mask = labels == component["id"]
        component["reachablePixels"] = int((component_mask & reachable_union).sum())
        component["observableSceneryPixels"] = component["pixels"] - component["reachablePixels"]
        component["routeIds"] = [
            route_id for route_id, route_mask in route_pure_masks.items()
            if np.any(component_mask & route_mask)
        ]
        component["landmarkViews"] = [
            landmark_id for landmark_id, point in endpoints.items()
            if np.any(component_mask & landmark_view_mask(point, shape))
        ]
    components.sort(
        key=lambda item: (
            bool(item["landmarkViews"]),
            bool(item["reachablePixels"]),
            len(item["routeIds"]),
            item["pixels"],
        ),
        reverse=True,
    )
    for rank, component in enumerate(components, 1):
        component["rank"] = rank

    never_drawn = ~observable_union
    observable_scenery = observable_union & ~reachable_union
    result = {
        "schemaVersion": 1,
        "manifest": {
            "revision": manifest["revision"],
            "sha256": sha256(RUNTIME / "manifest.json"),
            "detailRegionCount": len(manifest["detailRegions"]),
        },
        "method": {
            "sourcePixelRule": "integer source-pixel centers",
            "reachability": "path-corridor segmentConstraint with linearly interpolated halfWidth minus actorFootRadius",
            "crystalGateState": "open maximum-lifecycle reachability",
            "phoneFrame": list(PHONE_FRAME),
            "cameraWorldWidth": CAMERA_WORLD_WIDTH,
            "cameraWorldHeight": view_height,
            "cameraTargetYOffset": CAMERA_TARGET_Y,
            "conservativeCameraLagEnvelopeWorld": camera_lag_envelope_world,
            "observableIntegerOffsets": camera_offsets,
            "detailSampling": "canvas-nearest center mapping from each 912 layer to 512 world pixels",
            "pureLegacy": "observable pixel with zero base-detail alpha in at least one reachable route-affinity/progress state",
            "partialLegacyBlend": "observable pixel with nonzero detail alpha but no fully opaque detail sample in at least one state",
            "routeScope": "route-local playable corridor, matching the seven accepted route capture contexts",
            "manualPlayScope": "literal index.html behavior: all seven corridors reachable while detail affinity remains fixed to URL activeCorridor",
        },
        "totals": {
            "sourcePixels": width * height,
            "reachablePixels": int(reachable_union.sum()),
            "observablePixels": int(observable_union.sum()),
            "observableUnreachableSceneryPixels": int(observable_scenery.sum()),
            "neverDrawnPixels": int(never_drawn.sum()),
            "pureLegacyObservablePixels": int(pure_union.sum()),
            "protectedRetainedFallbackPixels": int((pure_union & protected_fallback).sum()),
            "actionablePureLegacyObservablePixels": int(actionable_pure_union.sum()),
            "partialLegacyBlendPixels": int(blend_union.sum()),
            "rawRectangleUncoveredPixels": int(raw_uncovered_union.sum()),
            "conservativeLagObservablePixels": int(lag_observable_union.sum()),
            "conservativeLagNeverDrawnPixels": int((~lag_observable_union).sum()),
            "conservativeLagActionablePureLegacyPixels": int((lag_pure_union & ~protected_fallback).sum()),
        },
        "routes": route_results,
        "manualAllCorridorContexts": manual_context_results,
        "rankedPureLegacyComponents": components,
    }
    census_path = args.output_dir / "off-route-residual-census-v1.json"
    census_path.write_text(json.dumps(result, indent=2) + "\n", encoding="utf-8")

    mask = np.zeros((height, width, 4), dtype=np.uint8)
    mask[reachable_union] = (40, 150, 255, 180)
    mask[blend_union] = (255, 190, 30, 200)
    mask[actionable_pure_union] = (255, 40, 80, 230)
    mask[pure_union & protected_fallback] = (190, 80, 255, 230)
    Image.fromarray(mask).save(args.output_dir / "off-route-residual-mask-v1.png", optimize=True)
    with Image.open(SOURCE) as source:
        save_overlay(
            source,
            reachable_union,
            blend_union,
            actionable_pure_union,
            pure_union & protected_fallback,
            args.output_dir / "off-route-residual-overlay-v1.png",
        )
    save_component_review(
        SOURCE,
        args.output_dir / "off-route-residual-overlay-v1.png",
        args.output_dir / "off-route-residual-component-review-v1.png",
    )
    write_evidence_inventory(args.output_dir)

    print(json.dumps(result["totals"], sort_keys=True))
    print(f"OFF-ROUTE RESIDUAL AUDIT PASS: {len(components)} pure-legacy components")


if __name__ == "__main__":
    main()
