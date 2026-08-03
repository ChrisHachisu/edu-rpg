#!/usr/bin/env python3
"""Hydrate and verify the preserved Quest of Knowledge shipped runtime.

This deliberately copies a reviewed static baseline. It never imports or invokes
Vite, TypeScript, npm, or the stale source build.
"""

from __future__ import annotations

import argparse
import hashlib
import json
import shutil
import sys
from pathlib import Path


ROOT = Path(__file__).resolve().parents[1]
PROFILE = "v1.17.1-ipad-hud-walk"
BASELINE = ROOT / "runtime" / "baselines" / PROFILE
MANIFEST = ROOT / "runtime" / "manifests" / f"{PROFILE}.json"
CANDIDATES = ROOT / "public" / "assets" / "monsters"
CANDIDATE_MANIFEST = ROOT / "runtime" / "manifests" / "regular-monster-candidates-v1.17.1.json"
BUNDLE = "assets/index-BhoGQRaA.js"
BUNDLE_SIZE = 4_987_581
BUNDLE_SHA256 = "a56026574b42168985b353e4cee824562716af83f92d03f408df04eac9127381"
EXPECTED_FILE_COUNT = 257
EXPECTED_TOTAL_BYTES = 42_683_025
ACT1_OVERLAY_FILES = {
    "index.html": (14_519, "58128b83daf4f9efc6c7dfabc2c9543c5f8325e72f5de017603a1fb428f592da"),
    # 2026-08-01, owner-authorised: dq-tiles.js now splats AI-generated terrain MATERIALS through
    # its existing continuous-world-pixel drawTerrain, plus a ridged mountain height field,
    # varied shore character and landmark sites derived from mapData. Fallback-safe -- until the
    # textures decode, and permanently if they 404, it renders the original palette ramps.
    # Method: docs/MATERIAL-RENDERER-METHOD.md
    # 2026-08-03, owner-authorised: dq-tiles.js additionally overrides scene.mapData for the three
    # Act-1 dungeons whose generated floor count matches the bundle (coastalReef, sunkenCellar,
    # whisperingWoodsCave) and blits the matching pre-rendered floor art in place of the procedural
    # dungeon draw. mapData is the engine's collision seam -- canMove() indexes it directly -- so
    # layout and collision move together. Fallback-safe: no JSON, no override; no floor art, the
    # procedural draw still runs. mistyGrotto and crystalCave are deliberately out of scope.
    # Same day, follow-up: the override now also replays persisted progress (looted chest 4->8,
    # defeated boss 7->10/12) onto the swapped map. The engine does that replay inside loadMap and
    # our swap lands after it, so without this a looted chest returned closed on every re-entry.
    "dq-tiles.js": (171_118, "d3eafb86b6b76c16b15cce54f3bd02c92817a5ee2bd5e58c7fd9e4cf155a56ea"),
    # 2026-08-03, owner direction ("please redo the collision setting based on what i created (my
    # paint)"): the Act-1 collision plate is now generated from the OWNER'S PAINTED TERRAIN
    # (owner-terrain.json acts.1 + continent-macro-g3/land-mask.npy) instead of the generated
    # semantic map the owner rejected on 29 Jul, so collision matches the art it had drifted 46.9%
    # away from. The eight destination doors moved to the owner's placement, and the override now
    # also patches checkTransition + getCompassTarget so the bundle's frozen connection and compass
    # tables follow them. Source: scripts/act1_owner_paint_plate.mjs.
    # It also reinstates itself: leaving a town hands the overworld a NEW mapData array under the
    # same reskin key, so the plate was never re-applied and every door reverted (found in-game).
    "act1-world-map.js": (47_925, "1e4d0580b11749231d772ead4e71a3c4cc7018c651ac225e50b1fdd62c56320f"),
}
# The four tiling terrain materials the renderer above samples. New runtime paths as of
# 2026-08-01; pinned by hash rather than merely tolerated, because they are shipped art and a
# silent swap would change every frame of the overworld.
ACT1_MATERIAL_FILES = {
    "materials/mat-forest.png": (
        603_397, "e2bd92984bf2b0f927b039bbf3047419ddafb764f2ea822ae9c039c5ca38a71a"),
    "materials/mat-grass.png": (
        660_235, "9fa43b08867a4344ebc36dd581e806bf2d833ee4ca924f1ce7f517a57ca3fb76"),
    "materials/mat-rock.png": (
        674_501, "e2573d08fb2eac036b0888795f1e6a1787e35d9acd7f44cbff80fb5e6e7518ae"),
    "materials/mat-water.png": (
        451_430, "78b08a4cfda57d9a7d763e95c461ad5d2c0bbe442b4135e9df95cdaf8339dcc7"),
}
# The semantic floor data the dungeon override reads, plus the baked floor renders it blits. Pinned
# by hash for the same reason as the terrain materials above: these ARE the shipped dungeon layouts
# and art, and a silent swap would change both what the player sees AND where the walls are. Only
# floors that have a render appear here; every other floor falls back to the procedural draw until
# it is rendered and pinned. New runtime paths as of 2026-08-03.
ACT1_DUNGEON_FILES = {
    "act1-dungeon-floors.json": (
        42_110, "c0743856ac2e294289a2574d8e3f05e14ed4693633869e457b842072735e731f"),
    "act1-dungeon-art/sunkenCellar-f3-props.png": (
        4_260_080, "761df1141d40fb08a36a77ed046d92860cb8ea4ba0f13d1019158bd6fefd218b"),
}
ACT1_HIFI_RUNTIME = (
    ROOT / "design" / "review" / "overworld-art-blueprint" / "act-by-act" / "act1" / "runtime-v2"
)
ACT1_R26_RUNTIME = ACT1_HIFI_RUNTIME / "act1-final-art-geometry-r26" / "runtime"
# 2026-08-03, owner-authorised ("bank the art now"): the r26 chunk art was re-baked at 48 px/tile
# from the MATERIAL renderer -- i.e. from the owner's painted terrain -- replacing the 16 px/tile
# chunks derived from candidate-art.png, the painterly plate the owner rejected on 29 Jul. Three
# consequences are pinned here:
#   * base is WebP, not PNG;
#   * the `occlusion` layer is gone, replaced by `canopy`, an ALPHA-ONLY mask (23 kB for all 30
#     chunks against 7.9 MB) that the runtime cuts out of the base it already holds;
#   * `source` names scripts/render_material_map.py instead of candidate-art.png.
# Total payload 18.0 MB against 19 MB, at three times the linear resolution.
# NOTE: scripts/promote_act1_r26_runtime.py is SUPERSEDED by this and must not be run -- it
# regenerates the 16 px chunks from candidate-art.png and would overwrite the bake.
ACT1_HIFI_MANIFEST_SHA256 = "0c773b18de2956450d7bb7b4716dc66d39fd196bb0c133b15d977da7db2e5988"
# The chunk layers the shipped tree must carry, read out of the locked manifest above. `occlusion`
# was retired with the 48 px bake; a stale entry here would make the gate demand a file that no
# longer exists and reject the one that replaced it.
ACT1_HIFI_CHUNK_LAYERS = ("base", "water", "canopy")

BACKGROUND_KEYS = {
    "boss_celestial_guardian",
    "boss_demon_king",
    "boss_frost_monarch",
    "boss_storm_sentinel",
    "boss_sword_wraith",
    "canyon",
    "cave_misty",
    "coast",
    "demon_castle",
    "desert",
    "forest",
    "frozen",
    "grass_plains",
    "haunted_wood",
    "magma",
    "mountains",
    "obsidian",
    "storm_peak",
    "tomb_ruins",
    "void",
}
OVERWORLD_PROPS = {
    "owprop-village-48.png",
    "owprop-cave-48.png",
    "owprop-castle-48.png",
    "owprop-portal-48.png",
    "owprop-shadow-cave-128.png",
    "owprop-signpost-48.png",
    "owprop-storm-nest-48.png",
    "owprop-crystal-cave-128.png",
    "owprop-ice-cave-128.png",
    "owprop-desert-tomb-128.png",
    "owprop-desert-signpost-48.png",
}
DUNGEON_PROPS = {
    "dqprop-boss-marker-128.png",
    "dqprop-chest-closed-128.png",
    "dqprop-chest-open-128.png",
    "dqprop-locked-door-left-128.png",
    "dqprop-locked-door-right-128.png",
    "dqprop-portal-128.png",
    "dqprop-save-point-128.png",
    "dqprop-stairs-down-128.png",
    "dqprop-stairs-up-128.png",
    "dqprop-wind-barrier-128.png",
}
REQUIRED_ROOT_FILES = {
    "index.html",
    "dq-tiles.js",
    "hero-override.js",
    "ui-overhaul.js",
    "ui-overhaul.css",
}


class BaselineError(RuntimeError):
    pass


def sha256(path: Path) -> str:
    digest = hashlib.sha256()
    with path.open("rb") as handle:
        for chunk in iter(lambda: handle.read(1024 * 1024), b""):
            digest.update(chunk)
    return digest.hexdigest()


def files_under(root: Path) -> dict[str, Path]:
    if not root.is_dir():
        raise BaselineError(f"runtime directory does not exist: {root}")
    if any(path.is_symlink() for path in root.rglob("*")):
        raise BaselineError(f"runtime directory contains a symlink: {root}")
    return {
        path.relative_to(root).as_posix(): path
        for path in sorted(root.rglob("*"))
        if path.is_file()
    }


def category(relative_path: str) -> str:
    if relative_path == BUNDLE:
        return "opaque-bundle"
    if relative_path in REQUIRED_ROOT_FILES:
        return "shell-or-override"
    if relative_path.startswith("assets/monsters/"):
        return "shipped-regular-monster"
    if relative_path.startswith("assets/monsters-hd/"):
        return "hd-monster"
    if relative_path.startswith("assets/item-icons/"):
        return "item-icon"
    if relative_path.startswith("assets/backgrounds/"):
        return "battle-background"
    if relative_path.startswith("assets/hero/"):
        return "hero-walk-sheet"
    if relative_path.startswith("owprops/"):
        return "overworld-prop"
    if relative_path.startswith("props/"):
        return "dungeon-prop"
    raise BaselineError(f"unclassified runtime file: {relative_path}")


def manifest_for(source: Path) -> dict[str, object]:
    found = files_under(source)
    entries = []
    for relative_path, path in found.items():
        entries.append(
            {
                "path": relative_path,
                "category": category(relative_path),
                "bytes": path.stat().st_size,
                "sha256": sha256(path),
            }
        )
    return {
        "schema": 1,
        "profile": PROFILE,
        "provenance": {
            "source": "preserved local shipped runtime",
            "baseBundle": "v1.17.0-first-fixes.js",
            "profileRelease": "v1.17.1-ipad-hud-walk",
            "deployment": "local baseline only; gh-pages and TestFlight unchanged",
        },
        "saveCompatibility": {
            "manualKey": "edu-rpg-save",
            "autosaveKey": "edu-rpg-autosave",
            "schemaVersion": 4,
            "migrationChain": ["v1-to-v2 floor", "v2-to-v3 sound", "v3-to-v4 quests"],
        },
        "fileCount": len(entries),
        "totalBytes": sum(entry["bytes"] for entry in entries),
        "files": entries,
    }


def load_manifest() -> dict[str, object]:
    if not MANIFEST.is_file():
        raise BaselineError(f"manifest does not exist: {MANIFEST}")
    manifest = json.loads(MANIFEST.read_text(encoding="utf-8"))
    if manifest.get("schema") != 1 or manifest.get("profile") != PROFILE:
        raise BaselineError("runtime manifest schema or profile mismatch")
    return manifest


def semantic_checks(root: Path, found: dict[str, Path]) -> None:
    regular = {
        Path(path).stem.removeprefix("monster-")
        for path in found
        if path.startswith("assets/monsters/") and path.endswith(".png")
    }
    hd = {
        Path(path).stem.removeprefix("monster-")
        for path in found
        if path.startswith("assets/monsters-hd/") and path.endswith(".webp")
    }
    items = {path for path in found if path.startswith("assets/item-icons/")}
    backgrounds = {
        Path(path).stem.removeprefix("bg-")
        for path in found
        if path.startswith("assets/backgrounds/")
    }
    overworld_props = {Path(path).name for path in found if path.startswith("owprops/")}
    dungeon_props = {Path(path).name for path in found if path.startswith("props/")}

    if len(regular) != 75:
        raise BaselineError(f"expected 75 regular monsters, found {len(regular)}")
    if hd != regular:
        raise BaselineError("HD and regular monster basename sets differ")
    if len(items) != 58:
        raise BaselineError(f"expected 58 item icons, found {len(items)}")
    if backgrounds != BACKGROUND_KEYS:
        raise BaselineError("battle-background allowlist mismatch")
    if overworld_props != OVERWORLD_PROPS:
        raise BaselineError("overworld-prop allowlist mismatch")
    if dungeon_props != DUNGEON_PROPS:
        raise BaselineError("dungeon-prop allowlist mismatch")

    bundle_path = root / BUNDLE
    if bundle_path.stat().st_size != BUNDLE_SIZE or sha256(bundle_path) != BUNDLE_SHA256:
        raise BaselineError("protected 4.99 MB bundle identity mismatch")
    bundle = bundle_path.read_bytes()
    for monster in regular:
        if monster.encode("utf-8") not in bundle:
            raise BaselineError(f"monster is absent from bundle preload registry: {monster}")
    for marker in (b"edu-rpg-save", b"edu-rpg-autosave"):
        if marker not in bundle:
            raise BaselineError(f"save compatibility marker missing: {marker.decode()}")

    html = (root / "index.html").read_text(encoding="utf-8")
    for reference in (
        "assets/index-BhoGQRaA.js",
        "ui-overhaul.css",
        "ui-overhaul.js",
        "dq-tiles.js",
        "hero-override.js",
    ):
        if reference not in html:
            raise BaselineError(f"shipped shell reference missing: {reference}")
    if "/src/main.ts" in html:
        raise BaselineError("shipped shell points at the stale TypeScript entrypoint")


def verify(root: Path, allowed_extra: frozenset[str] = frozenset()) -> None:
    manifest = load_manifest()
    expected_entries = {entry["path"]: entry for entry in manifest["files"]}
    all_found = files_under(root)
    missing = sorted(set(expected_entries) - set(all_found))
    extra = sorted(set(all_found) - set(expected_entries))
    if missing or not set(extra).issubset(allowed_extra):
        raise BaselineError(f"runtime path set mismatch; missing={missing}, extra={extra}")
    found = {path: all_found[path] for path in expected_entries}
    for relative_path, expected in expected_entries.items():
        path = found[relative_path]
        if path.stat().st_size != expected["bytes"]:
            raise BaselineError(f"size mismatch: {relative_path}")
        if sha256(path) != expected["sha256"]:
            raise BaselineError(f"hash mismatch: {relative_path}")
    if manifest["fileCount"] != EXPECTED_FILE_COUNT or len(found) != EXPECTED_FILE_COUNT:
        raise BaselineError("runtime file-count guard failed")
    total = sum(path.stat().st_size for path in found.values())
    if manifest["totalBytes"] != EXPECTED_TOTAL_BYTES or total != EXPECTED_TOTAL_BYTES:
        raise BaselineError("runtime byte-total guard failed")
    semantic_checks(root, found)


def verify_act1_overlay(root: Path, allowed_extra: frozenset[str] = frozenset()) -> None:
    """Verify the immutable runtime plus the three reviewed Act 1 additive changes."""
    manifest = load_manifest()
    expected_entries = {entry["path"]: entry for entry in manifest["files"]}
    all_found = files_under(root)
    hifi_manifest_path = ACT1_R26_RUNTIME / "manifest.json"
    if sha256(hifi_manifest_path) != ACT1_HIFI_MANIFEST_SHA256:
        raise BaselineError("locked Act 1 high-fidelity manifest identity changed")
    hifi_manifest = json.loads(hifi_manifest_path.read_text(encoding="utf-8"))
    if hifi_manifest.get("revision") != 11:
        raise BaselineError("locked Act 1 high-fidelity manifest revision changed")
    hifi_files = {
        "index.html": "runtime.html",
        "manifest.json": "manifest.json",
        "walkable-regions-r26.json": "walkable-regions-v1.json",
        "walkable-polygons.js": "walkable-polygons.js",
        "walkable-route-state.js": "walkable-route-state.js",
        "path-corridor.js": "path-corridor.js",
        "hero-g3/hero-act1-female-walk-8x3-64-g3.png":
            "hero-g3/hero-act1-female-walk-8x3-64-g3.png",
    }
    for chunk in hifi_manifest["chunks"]:
        for key in ACT1_HIFI_CHUNK_LAYERS:
            hifi_files[chunk[key]] = chunk[key]
    expected_hifi_paths = {f"act1-hifi/{target}" for target in hifi_files.values()}
    expected_hifi_paths.add("act1-hifi/adapter.js")
    expected_paths = (set(expected_entries) | {"act1-world-map.js"} | expected_hifi_paths
                      | set(ACT1_MATERIAL_FILES) | set(ACT1_DUNGEON_FILES))
    extra_paths = set(all_found) - expected_paths
    if expected_paths - set(all_found) or not extra_paths.issubset(allowed_extra):
        missing = sorted(expected_paths - set(all_found))
        extra = sorted(set(all_found) - expected_paths)
        raise BaselineError(f"Act 1 runtime path set mismatch; missing={missing}, extra={extra}")

    for relative_path, expected in expected_entries.items():
        if relative_path in ACT1_OVERLAY_FILES:
            expected_size, expected_hash = ACT1_OVERLAY_FILES[relative_path]
        else:
            expected_size, expected_hash = expected["bytes"], expected["sha256"]
        path = all_found[relative_path]
        if path.stat().st_size != expected_size or sha256(path) != expected_hash:
            raise BaselineError(f"Act 1 runtime identity mismatch: {relative_path}")

    for relative_path, (mat_size, mat_hash) in ACT1_MATERIAL_FILES.items():
        mat = all_found[relative_path]
        if mat.stat().st_size != mat_size or sha256(mat) != mat_hash:
            raise BaselineError(f"Act 1 terrain material identity mismatch: {relative_path}")
        public_mat = ROOT / "public" / relative_path
        if not public_mat.is_file() or public_mat.read_bytes() != mat.read_bytes():
            raise BaselineError(f"public/dist material twins differ: {relative_path}")

    for relative_path, (dng_size, dng_hash) in ACT1_DUNGEON_FILES.items():
        dng = all_found[relative_path]
        if dng.stat().st_size != dng_size or sha256(dng) != dng_hash:
            raise BaselineError(f"Act 1 dungeon identity mismatch: {relative_path}")
        public_dng = ROOT / "public" / relative_path
        if not public_dng.is_file() or public_dng.read_bytes() != dng.read_bytes():
            raise BaselineError(f"public/dist dungeon twins differ: {relative_path}")

    overlay_path = all_found["act1-world-map.js"]
    overlay_size, overlay_hash = ACT1_OVERLAY_FILES["act1-world-map.js"]
    if overlay_path.stat().st_size != overlay_size or sha256(overlay_path) != overlay_hash:
        raise BaselineError("Act 1 runtime identity mismatch: act1-world-map.js")

    for source_relative, target_relative in hifi_files.items():
        source_root = ACT1_R26_RUNTIME if (
            source_relative in {"manifest.json", "walkable-regions-r26.json"}
            or source_relative.startswith("chunks/")
        ) else ACT1_HIFI_RUNTIME
        source = source_root / source_relative
        target = all_found[f"act1-hifi/{target_relative}"]
        if source.read_bytes() != target.read_bytes():
            raise BaselineError(f"Act 1 high-fidelity runtime identity mismatch: {target_relative}")
    public_adapter = ROOT / "public" / "act1-hifi" / "adapter.js"
    dist_adapter = all_found["act1-hifi/adapter.js"]
    if not public_adapter.is_file() or public_adapter.read_bytes() != dist_adapter.read_bytes():
        raise BaselineError("public/dist Act 1 high-fidelity adapter twins differ")

    semantic_checks(root, all_found)
    html = all_found["index.html"].read_text(encoding="utf-8")
    if "act1-world-map.js" not in html or html.index("act1-world-map.js") > html.index("dq-tiles.js"):
        raise BaselineError("Act 1 override must load before dq-tiles.js")
    if "act1-hifi/adapter.js" not in html or html.index("act1-hifi/adapter.js") < html.index("hero-override.js"):
        raise BaselineError("Act 1 high-fidelity adapter must load after preserved overrides")
    public_overlay = ROOT / "public" / "act1-world-map.js"
    public_dq = ROOT / "public" / "dq-tiles.js"
    if not public_overlay.is_file() or public_overlay.read_bytes() != overlay_path.read_bytes():
        raise BaselineError("public/dist Act 1 override twins differ")
    if not public_dq.is_file() or public_dq.read_bytes() != all_found["dq-tiles.js"].read_bytes():
        raise BaselineError("public/dist dq-tiles twins differ")


def hydrate(output: Path) -> None:
    verify(BASELINE)
    if output.exists() or output.is_symlink():
        raise BaselineError(f"refusing to overwrite existing output: {output}")
    output.parent.mkdir(parents=True, exist_ok=True)
    try:
        shutil.copytree(BASELINE, output)
        verify(output)
    except Exception:
        if output.exists():
            shutil.rmtree(output)
        raise
    print(f"HYDRATE PASS: {PROFILE} -> {output}")


def write_manifest(confirm_profile: str) -> None:
    if confirm_profile != PROFILE:
        raise BaselineError(f"rebaseline confirmation must be exactly: {PROFILE}")
    data = manifest_for(BASELINE)
    if data["fileCount"] != EXPECTED_FILE_COUNT or data["totalBytes"] != EXPECTED_TOTAL_BYTES:
        raise BaselineError("refusing to write manifest for an unexpected runtime closure")
    semantic_checks(BASELINE, files_under(BASELINE))
    MANIFEST.parent.mkdir(parents=True, exist_ok=True)
    MANIFEST.write_text(json.dumps(data, indent=2) + "\n", encoding="utf-8")
    print(f"MANIFEST WRITTEN: {MANIFEST}")


def candidate_manifest_for() -> dict[str, object]:
    shipped = files_under(BASELINE / "assets" / "monsters")
    candidates = files_under(CANDIDATES)
    if set(shipped) != set(candidates) or len(candidates) != 75:
        raise BaselineError("regular-monster candidate and shipped filename sets differ")
    entries = []
    for name, path in candidates.items():
        candidate_hash = sha256(path)
        shipped_hash = sha256(shipped[name])
        if candidate_hash == shipped_hash:
            raise BaselineError(f"candidate unexpectedly matches shipped runtime: {name}")
        entries.append(
            {
                "path": f"public/assets/monsters/{name}",
                "bytes": path.stat().st_size,
                "sha256": candidate_hash,
                "shippedSha256": shipped_hash,
                "status": "unapproved-candidate",
            }
        )
    return {
        "schema": 1,
        "family": "regular-monsters",
        "runtimeBaseline": False,
        "disposition": "preserved candidates; never hydrate without individual owner approval",
        "fileCount": len(entries),
        "files": entries,
    }


def load_candidate_manifest() -> dict[str, object]:
    if not CANDIDATE_MANIFEST.is_file():
        raise BaselineError(f"candidate manifest does not exist: {CANDIDATE_MANIFEST}")
    manifest = json.loads(CANDIDATE_MANIFEST.read_text(encoding="utf-8"))
    if manifest.get("schema") != 1 or manifest.get("family") != "regular-monsters":
        raise BaselineError("candidate manifest schema or family mismatch")
    return manifest


def verify_candidates() -> None:
    expected = load_candidate_manifest()
    actual = candidate_manifest_for()
    if actual != expected:
        raise BaselineError("regular-monster candidate manifest mismatch")


def write_candidate_manifest(confirm: str) -> None:
    if confirm != "unapproved-candidates":
        raise BaselineError("candidate confirmation must be exactly: unapproved-candidates")
    data = candidate_manifest_for()
    CANDIDATE_MANIFEST.parent.mkdir(parents=True, exist_ok=True)
    CANDIDATE_MANIFEST.write_text(json.dumps(data, indent=2) + "\n", encoding="utf-8")
    print(f"CANDIDATE MANIFEST WRITTEN: {CANDIDATE_MANIFEST}")


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    subparsers = parser.add_subparsers(dest="command", required=True)
    hydrate_parser = subparsers.add_parser("hydrate", help="copy the verified baseline to a new directory")
    hydrate_parser.add_argument("--output", type=Path, default=ROOT / "dist")
    verify_parser = subparsers.add_parser("verify", help="verify a baseline or hydrated directory")
    verify_parser.add_argument("--input", type=Path, default=BASELINE)
    verify_parser.add_argument(
        "--allow-capacitor-glue",
        action="store_true",
        help="allow only Capacitor's generated cordova.js and cordova_plugins.js extras",
    )
    verify_act1_parser = subparsers.add_parser(
        "verify-act1", help="verify the preserved runtime plus the locked Act 1 additive overlay"
    )
    verify_act1_parser.add_argument("--input", type=Path, default=ROOT / "dist")
    verify_act1_parser.add_argument(
        "--allow-capacitor-glue",
        action="store_true",
        help="allow only Capacitor's generated cordova.js and cordova_plugins.js extras",
    )
    manifest_parser = subparsers.add_parser("write-manifest", help="lead-only explicit baseline promotion")
    manifest_parser.add_argument("--confirm-profile", required=True)
    subparsers.add_parser("verify-candidates", help="verify the preserved unapproved monster candidates")
    candidate_parser = subparsers.add_parser(
        "write-candidate-manifest", help="lead-only candidate snapshot refresh"
    )
    candidate_parser.add_argument("--confirm", required=True)
    subparsers.add_parser("blocked-build", help="explain why the stale build is disabled")
    args = parser.parse_args()

    try:
        if args.command == "hydrate":
            hydrate(args.output.resolve())
        elif args.command == "verify":
            allowed_extra = (
                frozenset({"cordova.js", "cordova_plugins.js"})
                if args.allow_capacitor_glue
                else frozenset()
            )
            verify(args.input.resolve(), allowed_extra)
            print(f"VERIFY PASS: {args.input.resolve()}")
        elif args.command == "verify-act1":
            allowed_extra = frozenset({"cordova.js", "cordova_plugins.js"}) if args.allow_capacitor_glue else frozenset()
            verify_act1_overlay(args.input.resolve(), allowed_extra)
            print(f"ACT 1 OVERLAY VERIFY PASS: {args.input.resolve()}")
        elif args.command == "write-manifest":
            write_manifest(args.confirm_profile)
        elif args.command == "verify-candidates":
            verify_candidates()
            print(f"CANDIDATE VERIFY PASS: {CANDIDATE_MANIFEST}")
        elif args.command == "write-candidate-manifest":
            write_candidate_manifest(args.confirm)
        else:
            raise BaselineError(
                "The stale Vite/TypeScript build is quarantined because it does not reproduce "
                "the shipped 4.99 MB game. Use `npm run hydrate` and `npm run verify:runtime`."
            )
    except BaselineError as error:
        print(f"RUNTIME BASELINE ERROR: {error}", file=sys.stderr)
        return 1
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
