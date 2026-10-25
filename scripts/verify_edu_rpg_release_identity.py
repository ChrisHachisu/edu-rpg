#!/usr/bin/env python3
"""Fail-closed identity checks for a reviewed edu-rpg simulator candidate and device IPA.

The Simulator .app and App Store IPA are different platform products. This gate binds them
through the same frozen source/native inputs, build number, and Capacitor public payload.
It deliberately does not claim that simulator tests prove behavior on physical hardware.
"""
from __future__ import annotations

import argparse
from datetime import datetime, timezone
import difflib
import hashlib
import json
from pathlib import Path, PurePosixPath
import plistlib
import re
import shutil
import subprocess
import sys
import tempfile
import zipfile
from typing import Any


SCHEMA = "edu-rpg-release-identity/v1"
RECEIPT_SCHEMA = "edu-rpg-simulator-qa-receipt/v1"
APP_ID = "app.chalkmap.questofknowledge"
APP_NAME = "App"
PROFILE_HISTORICAL = "historical"
PROFILE_FORWARD = "act1-forward-20261007-v1"
PROFILES = {PROFILE_HISTORICAL, PROFILE_FORWARD}
PHONE_UDID = "1D7EAC42-3F69-4DAD-918C-518C4C98EAA0"
TABLET_UDID = "0B99C2F1-2C99-42DE-9301-651C7C642BE0"
PBXPROJ = "ios/App/App.xcodeproj/project.pbxproj"
EXCLUDED_PARTS = {".git", "node_modules", "dist", ".ios-build"}
EXCLUDED_PREFIXES = ("ios/App/App/public/", "ios/build/")
EXCLUDED_FILES = {"ios/App/fastlane/report.xml"}
REQUIRED_QA_CHECKS = {
    "terrainContactBothHeroes", "cliffGrassRoutes", "caveDoorBridgeRoutes",
    "chunkStreamingAndResume", "savePreservationAndInterruption",
    "battleFleeBossReturn",
}
SIGNING_KEYS = {
    "CODE_SIGN_STYLE", "CODE_SIGN_IDENTITY", "DEVELOPMENT_TEAM",
    "PROVISIONING_PROFILE_SPECIFIER",
}
IDENTITY_KEYS = {"schema", "status", "candidateId", "core", "qaReceipts", "preparationOnly"}
CORE_KEYS = {
    "schema", "repoRoot", "head", "terrainProfile", "bundleId", "marketingVersion", "buildNumber",
    "sourceInputs", "sourceInputsSha256", "nativeInputs", "nativeInputsSha256", "runtimePayloadSha256",
    "runtimeFileCount", "simulatorAppSha256", "simulatorAppInventory", "simulatorAppPlatform",
    "simulatorAppBundleId", "simulatorAppBuildNumber", "pbxprojPath", "pbxprojSha256", "pbxprojSourceText",
}


class GateError(RuntimeError):
    pass


def fail(message: str) -> None:
    raise GateError(message)


def sha_bytes(data: bytes) -> str:
    return hashlib.sha256(data).hexdigest()


def sha_file(path: Path) -> str:
    digest = hashlib.sha256()
    with path.open("rb") as handle:
        for chunk in iter(lambda: handle.read(1024 * 1024), b""):
            digest.update(chunk)
    return digest.hexdigest()


def canonical(value: Any) -> bytes:
    return json.dumps(value, sort_keys=True, separators=(",", ":"), ensure_ascii=False).encode()


def safe_relative(value: Any) -> str:
    if not isinstance(value, str) or not value or "\\" in value:
        fail(f"unsafe or missing relative path: {value!r}")
    path = PurePosixPath(value)
    if path.is_absolute() or any(part in {"", ".", ".."} for part in path.parts):
        fail(f"unsafe relative path: {value!r}")
    return path.as_posix()


def rooted_regular_file(root: Path, relative: str, label: str) -> Path:
    rel = safe_relative(relative)
    path = root / rel
    cursor = root
    for part in PurePosixPath(rel).parts:
        cursor = cursor / part
        if cursor.is_symlink():
            fail(f"{label} path traverses a symlink: {rel}")
    try:
        resolved = path.resolve(strict=True)
    except FileNotFoundError:
        fail(f"{label} file is missing: {rel}")
    except OSError:
        fail(f"{label} path cannot be resolved: {rel}")
    try:
        resolved.relative_to(root.resolve(strict=True))
    except ValueError:
        fail(f"{label} path escapes the checkout: {rel}")
    if not path.is_file():
        fail(f"{label} file is missing: {rel}")
    return path


def relative_to_root(root: Path, candidate: Path, label: str) -> str:
    candidate = candidate if candidate.is_absolute() else root / candidate
    root_real = root.resolve(strict=True)
    # Find the lexical spelling of the root (macOS /var -> /private is common), then
    # preserve the path below it so internal symlinks remain visible to rooted_regular_file.
    for ancestor in (candidate, *candidate.parents):
        try:
            if ancestor.resolve(strict=True) == root_real:
                return candidate.relative_to(ancestor).as_posix()
        except (OSError, ValueError):
            continue
    fail(f"{label} must be inside the checkout")


def inventory_paths(root: Path, base: Path, *, exclude_outputs: bool = False) -> list[dict[str, Any]]:
    if not base.is_dir():
        fail(f"required input directory is missing: {base}")
    entries: list[dict[str, Any]] = []
    for path in sorted(base.rglob("*")):
        if path.is_symlink():
            fail(f"input inventory contains symlink: {path.relative_to(root)}")
        if not path.is_file():
            continue
        rel = path.relative_to(root).as_posix()
        parts = PurePosixPath(rel).parts
        if exclude_outputs and (any(part in EXCLUDED_PARTS for part in parts)
                                or rel in EXCLUDED_FILES or rel.startswith(EXCLUDED_PREFIXES)):
            continue
        entries.append({"path": rel, "bytes": path.stat().st_size, "sha256": sha_file(path)})
    return entries


def source_inventory(root: Path) -> list[dict[str, Any]]:
    # Hash only inputs that can affect the assembled web payload or this release gate.
    # Native project inputs are enumerated separately below; node_modules, test outputs,
    # screenshots, unrelated docs, and historical evidence are not part of this identity.
    fixed = {
        "index.html", "package.json", "package-lock.json",
        "scripts/build_static_index.mjs", "scripts/build-dist.sh", "scripts/sync-ios.sh",
        "scripts/ship-gate.sh", "scripts/ship-ios.sh", "scripts/ship_ios.py",
        "scripts/run-ios.sh", "scripts/runtime_baseline.py", "scripts/terrain_current_profile.py",
        "scripts/verify_edu_rpg_release_identity.py",
    }
    names = set(fixed)
    for base in (root / "public", root / "design/terrain-current-profile-20261007"):
        if base.is_dir():
            for path in base.rglob("*"):
                if path.is_symlink():
                    fail(f"source input contains symlink: {path.relative_to(root)}")
                if path.is_file():
                    names.add(path.relative_to(root).as_posix())
    names = sorted(name for name in names if (root / name).is_file())
    entries = []
    for rel in names:
        path = root / rel
        if path.is_symlink():
            fail(f"source input is a symlink: {rel}")
        if any(part in EXCLUDED_PARTS for part in PurePosixPath(rel).parts):
            continue
        if rel in EXCLUDED_FILES or rel.startswith(EXCLUDED_PREFIXES):
            continue
        if path.is_symlink():
            fail(f"source inventory contains symlink: {rel}")
        if not path.is_file():
            continue
        entries.append({"path": rel, "bytes": path.stat().st_size, "sha256": sha_file(path)})
    if not entries:
        fail("source inventory is empty")
    return entries


def inventory_digest(entries: list[dict[str, Any]]) -> str:
    rows = [f"{e['path']}\t{e['bytes']}\t{e['sha256']}\n" for e in sorted(entries, key=lambda x: x["path"])]
    return sha_bytes("".join(rows).encode())


def tree_digest(entries: list[dict[str, Any]]) -> str:
    return inventory_digest(entries)


def payload_inventory(root: Path, base: Path) -> list[dict[str, Any]]:
    entries = inventory_paths(root, base)
    # Capacitor's two generated bridge shims are platform glue, not the shared public runtime.
    normalized = []
    for entry in entries:
        if PurePosixPath(entry["path"]).name in {"cordova.js", "cordova_plugins.js"}:
            continue
        source_path = root / entry["path"]
        normalized.append({
            "path": "dist/" + source_path.relative_to(base).as_posix(),
            "bytes": entry["bytes"],
            "sha256": entry["sha256"],
        })
    return normalized


def profile_check(root: Path, profile: str, *, stage: str = "release") -> None:
    if profile not in PROFILES:
        fail(f"unknown terrain profile: {profile}")
    if profile == PROFILE_FORWARD:
        if stage not in {"release", "preparation"}:
            fail(f"unknown terrain validation stage: {stage}")
        # Both candidate preparation and release revalidate the frozen static closure.
        # Release eligibility is established separately by verify_forward_evidence().
        command = [sys.executable, str(root / "scripts/runtime_baseline.py"),
                   "verify-forward-terrain-preparation"]
        result = subprocess.run(command, cwd=root, capture_output=True, text=True)
        if result.returncode:
            fail("forward profile static source closure is not ready: " + (result.stderr or result.stdout).strip()[-1200:])


def app_metadata(app: Path) -> tuple[dict[str, Any], bytes]:
    if not app.is_dir() or app.suffix != ".app":
        fail(f"Simulator app must be an .app directory: {app}")
    info = app / "Info.plist"
    if not info.is_file():
        fail(f"app bundle is missing Info.plist: {app}")
    try:
        data = info.read_bytes()
        plist = plistlib.loads(data)
    except Exception as exc:
        fail(f"cannot read app Info.plist: {exc}")
    if not isinstance(plist, dict):
        fail("app Info.plist is not a dictionary")
    return plist, data


def app_platform(plist: dict[str, Any]) -> str:
    platforms = plist.get("CFBundleSupportedPlatforms")
    if not isinstance(platforms, list):
        fail("app Info.plist lacks CFBundleSupportedPlatforms")
    if "iPhoneSimulator" in platforms and "iPhoneOS" not in platforms:
        return "simulator"
    if "iPhoneOS" in platforms and "iPhoneSimulator" not in platforms:
        return "device"
    fail(f"ambiguous or unsupported app platform: {platforms!r}")


def app_digest(app: Path) -> str:
    return inventory_digest(app_inventory(app))


def app_inventory(app: Path) -> list[dict[str, Any]]:
    if not app.is_dir():
        fail(f"app bundle is missing: {app}")
    entries = []
    for path in sorted(app.rglob("*")):
        if path.is_symlink():
            fail(f"app bundle contains symlink: {path.relative_to(app)}")
        if path.is_file():
            entries.append({"path": path.relative_to(app).as_posix(),
                            "bytes": path.stat().st_size, "sha256": sha_file(path)})
    if not entries:
        fail("app bundle contains no files")
    return entries


def load_identity(path: Path, expected_sha: str) -> dict[str, Any]:
    if not path.is_file():
        fail(f"candidate identity file is missing: {path}")
    actual_sha = sha_file(path)
    if not re.fullmatch(r"[0-9a-f]{64}", expected_sha or "") or actual_sha != expected_sha:
        fail("candidate identity SHA-256 is missing or does not match the supplied pin")
    try:
        value = json.loads(path.read_text(encoding="utf-8"))
    except (OSError, json.JSONDecodeError) as exc:
        fail(f"candidate identity is invalid JSON: {exc}")
    if not isinstance(value, dict) or value.get("schema") != SCHEMA or set(value) != IDENTITY_KEYS:
        fail("candidate identity schema mismatch")
    core = value.get("core")
    if not isinstance(core, dict) or set(core) != CORE_KEYS or value.get("candidateId") != sha_bytes(canonical(core)):
        fail("candidate core digest is missing or invalid")
    if value.get("status") not in {"pending-qa", "sealed"}:
        fail("candidate identity status is invalid")
    if not isinstance(value.get("preparationOnly"), bool):
        fail("candidate identity must declare whether it was prepared for QA only")
    if value["preparationOnly"] != (core.get("terrainProfile") == PROFILE_FORWARD):
        fail("candidate preparation stage does not match its selected terrain profile")
    return value


def validate_inventory(root: Path, entries: Any, label: str, *, allow_pbxproj_signing_overlay: bool = False) -> None:
    if not isinstance(entries, list) or not entries:
        fail(f"{label} inventory is missing or empty")
    seen: set[str] = set()
    for entry in entries:
        if not isinstance(entry, dict):
            fail(f"{label} inventory entry is not an object")
        rel = safe_relative(entry.get("path"))
        if rel in seen:
            fail(f"{label} inventory duplicates {rel}")
        seen.add(rel)
        path = root / rel
        cursor = root
        for part in PurePosixPath(rel).parts:
            cursor = cursor / part
            if cursor.is_symlink():
                fail(f"{label} path traverses a symlink: {rel}")
        if not path.is_file():
            fail(f"{label} input missing or byte count changed: {rel}")
        if rel == PBXPROJ and allow_pbxproj_signing_overlay:
            continue
        if path.stat().st_size != entry.get("bytes"):
            fail(f"{label} input missing or byte count changed: {rel}")
        if sha_file(path) != entry.get("sha256"):
            fail(f"{label} input SHA-256 changed: {rel}")


def verify_current_core(root: Path, identity: dict[str, Any], *, allow_signing_overlay: bool = False,
                        expected_profile: str | None = None,
                        expected_signing: dict[str, str] | None = None,
                        stage: str = "release") -> None:
    core = identity["core"]
    current_head = subprocess.check_output(["git", "rev-parse", "HEAD"], cwd=root, text=True).strip()
    if current_head != core.get("head"):
        fail("checkout HEAD changed after candidate preparation")
    profile = core.get("terrainProfile")
    if expected_profile is not None and profile != expected_profile:
        fail(f"identity terrain profile {profile!r} differs from selected profile {expected_profile!r}")
    profile_check(root, profile, stage=stage)
    if core.get("bundleId") != APP_ID:
        fail("candidate bundle identifier mismatch")
    if not isinstance(core.get("buildNumber"), int) or core["buildNumber"] < 1:
        fail("candidate build number is invalid")
    validate_inventory(root, core.get("sourceInputs"), "source", allow_pbxproj_signing_overlay=allow_signing_overlay)
    validate_inventory(root, core.get("nativeInputs"), "native", allow_pbxproj_signing_overlay=allow_signing_overlay)
    actual_source = source_inventory(root)
    if {e["path"] for e in actual_source} != {e["path"] for e in core["sourceInputs"]}:
        fail("source input path set changed after candidate preparation")
    actual_native = inventory_paths(root, root / "ios/App", exclude_outputs=True)
    if {e["path"] for e in actual_native} != {e["path"] for e in core["nativeInputs"]}:
        fail("native input path set changed after candidate preparation")
    if inventory_digest(core["sourceInputs"]) != core.get("sourceInputsSha256"):
        fail("identity source inventory digest mismatch")
    if inventory_digest(core["nativeInputs"]) != core.get("nativeInputsSha256"):
        fail("identity native inventory digest mismatch")
    dist = payload_inventory(root, root / "dist")
    ios = payload_inventory(root, root / "ios/App/App/public")
    if inventory_digest(dist) != core.get("runtimePayloadSha256"):
        fail("dist runtime payload changed after candidate preparation")
    if inventory_digest(ios) != core.get("runtimePayloadSha256"):
        fail("iOS public payload differs from the pinned runtime payload")
    if len(dist) != core.get("runtimeFileCount"):
        fail("runtime payload file count changed after candidate preparation")
    if {e["path"] for e in dist} != {e["path"] for e in ios}:
        fail("dist and iOS runtime payload path sets differ")
    if allow_signing_overlay:
        validate_signing_overlay(root, core, expected_signing)


def assignment(line: str) -> tuple[str, str] | None:
    match = re.match(r"^\s*([A-Z_]+(?:\[[^]]+\])?)\s*=\s*(.*?)\s*;\s*$", line)
    if not match:
        return None
    key = re.sub(r"\[.*\]$", "", match.group(1))
    value = match.group(2)
    if len(value) >= 2 and value[0] == value[-1] == '"':
        value = value[1:-1]
    return key, value


def validate_signing_overlay(root: Path, core: dict[str, Any], expected: dict[str, str] | None) -> None:
    snapshot = core.get("pbxprojSourceText")
    rel = core.get("pbxprojPath")
    if rel != PBXPROJ or not isinstance(snapshot, str):
        fail("identity has no explicit source project snapshot for signing-change accounting")
    if sha_bytes(snapshot.encode("utf-8")) != core.get("pbxprojSha256"):
        fail("identity project snapshot SHA does not match its recorded native input SHA")
    pinned_project = next((e for e in core.get("nativeInputs", []) if e.get("path") == PBXPROJ), None)
    if not pinned_project or pinned_project.get("sha256") != core.get("pbxprojSha256"):
        fail("identity does not bind the complete source project file in its native inventory")
    current_path = root / PBXPROJ
    if not current_path.is_file():
        fail("project.pbxproj is missing after signing configuration")
    before = snapshot.splitlines()
    after = current_path.read_text(encoding="utf-8").splitlines()
    if expected is None or not all(expected.get(key) for key in ("CODE_SIGN_STYLE", "DEVELOPMENT_TEAM", "CODE_SIGN_IDENTITY", "PROVISIONING_PROFILE_SPECIFIER")):
        fail("IPA verification requires the exact Fastlane signing settings")
    matcher = difflib.SequenceMatcher(a=before, b=after, autojunk=False)
    changes = 0
    for tag, i1, i2, j1, j2 in matcher.get_opcodes():
        if tag == "equal":
            continue
        changes += 1
        if tag == "delete":
            fail("project.pbxproj signing overlay removed a source assignment")
        old = [assignment(line) for line in before[i1:i2]]
        new = [assignment(line) for line in after[j1:j2]]
        values = [item for item in old + new if item is not None]
        if len(values) != len(old) + len(new) or not values or any(k not in SIGNING_KEYS for k, _ in values):
            fail("project.pbxproj contains a non-signing change after candidate review")
        old_keys = [k for k, _ in old if k in SIGNING_KEYS]
        new_keys = [k for k, _ in new if k in SIGNING_KEYS]
        if old_keys and new_keys and old_keys != new_keys:
            fail("project.pbxproj signing overlay changed setting keys unexpectedly")
        for key, value in new:
            expected_value = expected.get(key)
            if expected_value is None or value != expected_value:
                fail(f"project.pbxproj signing overlay has an unexpected {key} value")
    current_values = [assignment(line) for line in after]
    for key, expected_value in expected.items():
        if not any(item == (key, expected_value) for item in current_values):
            fail(f"project.pbxproj has no matching {key} value for the active signing configuration")


def make_core(root: Path, profile: str, build_number: int, sim_app: Path, *, qa_preparation: bool = False) -> dict[str, Any]:
    if profile == PROFILE_FORWARD and not qa_preparation:
        fail("forward candidates must use explicit --qa-preparation before native evidence exists")
    if qa_preparation and profile != PROFILE_FORWARD:
        fail("--qa-preparation is only valid for the explicit forward terrain profile")
    profile_check(root, profile, stage="preparation" if qa_preparation else "release")
    if build_number < 1:
        fail("build number must be positive")
    plist, _ = app_metadata(sim_app)
    if app_platform(plist) != "simulator":
        fail("candidate preparation requires an iOS Simulator .app, not an App Store/device IPA")
    if plist.get("CFBundleIdentifier") != APP_ID:
        fail("Simulator app bundle identifier mismatch")
    if str(plist.get("CFBundleVersion", "")) != str(build_number):
        fail("Simulator app build number differs from requested candidate build")
    if str(plist.get("CFBundleShortVersionString", "")) != "1.0":
        fail("Simulator app marketing version must be 1.0")
    dist = payload_inventory(root, root / "dist")
    ios = payload_inventory(root, root / "ios/App/App/public")
    if not dist or inventory_digest(dist) != inventory_digest(ios):
        fail("dist and iOS public runtime payload are absent or do not match")
    source = source_inventory(root)
    native = inventory_paths(root, root / "ios/App", exclude_outputs=True)
    pbx_path = root / PBXPROJ
    if not pbx_path.is_file():
        fail("native project file is missing")
    head = subprocess.check_output(["git", "rev-parse", "HEAD"], cwd=root, text=True).strip()
    return {
        "schema": SCHEMA,
        "repoRoot": str(root.resolve()),
        "head": head,
        "terrainProfile": profile,
        "bundleId": APP_ID,
        "marketingVersion": "1.0",
        "buildNumber": build_number,
        "sourceInputs": source,
        "sourceInputsSha256": inventory_digest(source),
        "nativeInputs": native,
        "nativeInputsSha256": inventory_digest(native),
        "runtimePayloadSha256": inventory_digest(dist),
        "runtimeFileCount": len(dist),
        "simulatorAppSha256": app_digest(sim_app),
        "simulatorAppInventory": app_inventory(sim_app),
        "simulatorAppPlatform": "simulator",
        "simulatorAppBundleId": plist["CFBundleIdentifier"],
        "simulatorAppBuildNumber": int(plist["CFBundleVersion"]),
        "pbxprojPath": PBXPROJ,
        "pbxprojSha256": sha_file(pbx_path),
        "pbxprojSourceText": pbx_path.read_text(encoding="utf-8"),
    }


def write_prepared(root: Path, profile: str, build_number: int, sim_app: Path, output: Path,
                   *, qa_preparation: bool = False) -> None:
    core = make_core(root, profile, build_number, sim_app, qa_preparation=qa_preparation)
    output.parent.mkdir(parents=True, exist_ok=True)
    pending = {"schema": SCHEMA, "status": "pending-qa", "candidateId": sha_bytes(canonical(core)),
               "core": core, "qaReceipts": [], "preparationOnly": qa_preparation}
    output.write_bytes(json.dumps(pending, indent=2, sort_keys=True).encode() + b"\n")
    print(f"PENDING QA identity written: {output}; candidateId={pending['candidateId']}")
    print("This is not release-ready until independent phone and tablet receipts are sealed.")


def validate_receipt(root: Path, receipt_path: Path, role: str, core: dict[str, Any]) -> dict[str, Any]:
    receipt_rel = relative_to_root(root, receipt_path, f"{role} simulator QA receipt")
    receipt_path = rooted_regular_file(root, receipt_rel, f"{role} QA receipt")
    try:
        receipt = json.loads(receipt_path.read_text(encoding="utf-8"))
    except (OSError, json.JSONDecodeError) as exc:
        fail(f"{role} QA receipt is invalid JSON: {exc}")
    if not isinstance(receipt, dict) or receipt.get("schema") != RECEIPT_SCHEMA:
        fail(f"{role} QA receipt schema mismatch")
    if receipt.get("result") != "pass" or receipt.get("reviewer") in {None, "", "unknown"}:
        fail(f"{role} QA receipt lacks a named reviewer and passing result")
    if receipt.get("reviewerIndependentOfImplementation") is not True:
        fail(f"{role} QA receipt does not identify an independent reviewer")
    try:
        parsed_time = datetime.fromisoformat(str(receipt.get("testedAt", "")).replace("Z", "+00:00"))
    except ValueError:
        fail(f"{role} QA receipt has no valid testedAt timestamp")
    if parsed_time.tzinfo is None:
        fail(f"{role} QA receipt testedAt must include a timezone")
    if receipt.get("candidateId") != sha_bytes(canonical(core)):
        fail(f"{role} QA receipt belongs to another candidate")
    if receipt.get("deviceRole") != role or receipt.get("platform") != "iOS Simulator":
        fail(f"{role} QA receipt platform/role mismatch")
    expected_udid = PHONE_UDID if role == "phone" else TABLET_UDID
    if receipt.get("udid") != expected_udid:
        fail(f"{role} QA receipt does not use the preserved canonical simulator")
    expected_model, expected_runtime = (("iPhone 16", "18.6") if role == "phone"
                                        else ("iPad mini (A17 Pro)", "26.5"))
    if receipt.get("deviceModel") != expected_model or receipt.get("runtimeVersion") != expected_runtime:
        fail(f"{role} QA receipt simulator model/runtime mismatch")
    if receipt.get("bundleId") != APP_ID or receipt.get("buildNumber") != core["buildNumber"]:
        fail(f"{role} QA receipt build identity mismatch")
    if receipt.get("simulatorAppSha256") != core.get("simulatorAppSha256"):
        fail(f"{role} QA receipt does not bind the reviewed Simulator app bytes")
    checks = receipt.get("checks")
    if not isinstance(checks, dict) or not all(checks.get(key) is True for key in REQUIRED_QA_CHECKS):
        fail(f"{role} QA receipt is missing required native regression checks")
    evidence = receipt.get("evidence")
    if not isinstance(evidence, list) or not evidence:
        fail(f"{role} QA receipt has no screenshot/video evidence")
    covered_checks: set[str] = set()
    for item in evidence:
        if not isinstance(item, dict):
            fail(f"{role} QA evidence entry is not an object")
        covers = item.get("checksCovered")
        if not isinstance(covers, list) or not covers or any(check not in REQUIRED_QA_CHECKS for check in covers):
            fail(f"{role} QA evidence entry lacks valid checksCovered references")
        covered_checks.update(covers)
        rel = safe_relative(item.get("path") if isinstance(item, dict) else None)
        expected = item.get("sha256") if isinstance(item, dict) else None
        path = rooted_regular_file(root, rel, f"{role} QA evidence")
        if not re.fullmatch(r"[0-9a-f]{64}", str(expected)) or sha_file(path) != expected:
            fail(f"{role} QA evidence missing or hash mismatch: {rel}")
        suffix = path.suffix.lower()
        raw = path.read_bytes()
        valid_media = ((suffix == ".png" and raw.startswith(b"\x89PNG\r\n\x1a\n") and len(raw) >= 32)
                       or (suffix in {".jpg", ".jpeg"} and raw.startswith(b"\xff\xd8\xff"))
                       or (suffix in {".mp4", ".mov"} and len(raw) >= 12 and raw[4:8] == b"ftyp"))
        if not valid_media:
            fail(f"{role} QA evidence is not a recognized screenshot/video file: {rel}")
    if not REQUIRED_QA_CHECKS.issubset(covered_checks):
        fail(f"{role} QA evidence does not cover every required regression group")
    receipt["receiptSha256"] = sha_file(receipt_path)
    return receipt


def seal_identity(root: Path, identity_path: Path, phone: Path, tablet: Path) -> None:
    if not identity_path.is_file():
        fail(f"pending identity is missing: {identity_path}")
    identity = json.loads(identity_path.read_text(encoding="utf-8"))
    if identity.get("schema") != SCHEMA or not isinstance(identity.get("core"), dict):
        fail("pending identity schema mismatch")
    if identity.get("status") != "pending-qa":
        fail("only a pending-qa identity can be sealed")
    core = identity["core"]
    if Path(core.get("repoRoot", "")).resolve() != root.resolve():
        fail("pending identity is pinned to another checkout")
    if identity.get("candidateId") != sha_bytes(canonical(core)):
        fail("pending identity core changed")
    verify_current_core(root, identity, stage="preparation" if identity.get("preparationOnly") else "release")
    receipts = []
    for role, path in (("phone", phone), ("tablet", tablet)):
        receipt = validate_receipt(root, path, role, core)
        try:
            receipt["receiptPath"] = path.resolve().relative_to(root.resolve()).as_posix()
        except ValueError:
            fail(f"{role} QA receipt must be stored inside the reviewed checkout")
        receipts.append(receipt)
    identity["qaReceipts"] = receipts
    identity["status"] = "sealed"
    identity_path.write_bytes(json.dumps(identity, indent=2, sort_keys=True).encode() + b"\n")
    print(f"QA receipts sealed; identity SHA-256={sha_file(identity_path)}")


def require_sealed(identity: dict[str, Any]) -> None:
    if identity.get("status") != "sealed":
        fail("candidate identity is not sealed with reviewed phone and tablet evidence")
    receipts = identity.get("qaReceipts")
    if not isinstance(receipts, list) or len(receipts) != 2 or {x.get("deviceRole") for x in receipts if isinstance(x, dict)} != {"phone", "tablet"}:
        fail("fresh independent phone and tablet simulator receipts are required")


def validate_sealed_receipts(root: Path, identity: dict[str, Any]) -> None:
    core = identity["core"]
    require_sealed(identity)
    for role in ("phone", "tablet"):
        saved = next(x for x in identity["qaReceipts"] if x.get("deviceRole") == role)
        receipt_rel = safe_relative(saved.get("receiptPath"))
        receipt = validate_receipt(root, root / receipt_rel, role, core)
        if receipt["receiptSha256"] != saved.get("receiptSha256"):
            fail(f"{role} simulator QA receipt changed after sealing")


def verify_forward_evidence(root: Path, identity: dict[str, Any], evidence_path: Path | None,
                            evidence_sha256: str | None) -> None:
    core = identity["core"]
    if core.get("terrainProfile") != PROFILE_FORWARD:
        if evidence_path is not None or evidence_sha256 is not None:
            fail("forward terrain release evidence cannot be used with the historical profile")
        return
    if identity.get("preparationOnly") is not True:
        fail("forward release candidate was not created from an explicit QA-preparation identity")
    require_sealed(identity)
    if evidence_path is None or evidence_sha256 is None:
        fail("forward release requires an externally SHA-pinned dynamic terrain evidence envelope")
    from terrain_current_profile import (
        DYNAMIC_CHECKS, PENDING_DYNAMIC_CHECKS, PENDING_PROOF_ASSERTION_GROUPS,
        PROOF_FIELD_SPLIT_VERSION, PROFILE_ID, RELEASE_EVIDENCE_SCHEMA, ProfileError,
        inventory_digest, load_reviewed_descriptor, validate_completed_proof_assertions,
        validate_descriptor,
    )
    try:
        descriptor, descriptor_sha = load_reviewed_descriptor(root)
        validated = validate_descriptor(root, descriptor, stage="preparation")
    except ProfileError as exc:
        fail(f"forward QA-preparation closure is stale or incomplete: {exc}")
    if validated.get("pendingDynamicChecks") != list(PENDING_DYNAMIC_CHECKS):
        fail("forward preparation descriptor pending-check list differs from release evidence contract")
    if evidence_path.is_symlink():
        fail("external terrain evidence must not be a symlink")
    evidence_path = evidence_path.resolve(strict=True)
    if not evidence_path.is_file() or sha_file(evidence_path) != evidence_sha256:
        fail("external terrain evidence is missing or does not match its independently supplied SHA-256 pin")
    try:
        evidence = json.loads(evidence_path.read_text(encoding="utf-8"))
    except (OSError, json.JSONDecodeError) as exc:
        fail(f"external terrain evidence is invalid JSON: {exc}")
    expected_fields = {
        "schema", "profileId", "proofFieldSplitVersion", "result", "releaseEligible", "descriptorSha256",
        "authoringInputInventorySha256", "generatedOutputInventorySha256", "candidateId",
        "candidateCoreSha256", "sourceInputsSha256", "nativeInputsSha256",
        "runtimePayloadSha256", "runtimeFileCount", "buildNumber", "simulatorAppSha256",
        "sealedReceiptSha256s", "checks", "completedProofAssertions", "independentReview",
    }
    if not isinstance(evidence, dict) or set(evidence) != expected_fields:
        fail("external terrain evidence fields are missing or unreviewed")
    if (evidence.get("schema") != RELEASE_EVIDENCE_SCHEMA
            or evidence.get("profileId") != PROFILE_ID
            or evidence.get("proofFieldSplitVersion") != PROOF_FIELD_SPLIT_VERSION
            or evidence.get("result") != "PASS" or evidence.get("releaseEligible") is not True):
        fail("external terrain evidence is not a release-eligible forward proof envelope")
    core_sha = sha_bytes(canonical(core))
    expected_identity = {
        "descriptorSha256": descriptor_sha,
        "authoringInputInventorySha256": inventory_digest(descriptor["authoringInputs"]),
        "generatedOutputInventorySha256": inventory_digest(descriptor["generatedOutputs"]["inventory"]),
        "candidateId": identity["candidateId"],
        "candidateCoreSha256": core_sha,
        "sourceInputsSha256": core["sourceInputsSha256"],
        "nativeInputsSha256": core["nativeInputsSha256"],
        "runtimePayloadSha256": core["runtimePayloadSha256"],
        "runtimeFileCount": core["runtimeFileCount"],
        "buildNumber": core["buildNumber"],
        "simulatorAppSha256": core["simulatorAppSha256"],
    }
    for key, expected in expected_identity.items():
        if evidence.get(key) != expected:
            fail(f"external terrain evidence is stale or bound to another candidate: {key}")
    receipts = identity.get("qaReceipts")
    if not isinstance(receipts, list) or {item.get("deviceRole") for item in receipts if isinstance(item, dict)} != {"phone", "tablet"}:
        fail("external terrain evidence requires sealed phone and tablet receipts")
    receipt_hashes = {item["deviceRole"]: item.get("receiptSha256") for item in receipts}
    if evidence.get("sealedReceiptSha256s") != receipt_hashes:
        fail("external terrain evidence phone/tablet receipt pins differ from the sealed candidate")
    checks = evidence.get("checks")
    if not isinstance(checks, dict) or set(checks) != set(DYNAMIC_CHECKS):
        fail("external terrain evidence does not cover every named pending dynamic check")
    receipt_data = {}
    for role in ("phone", "tablet"):
        receipt_item = next(item for item in receipts if item.get("deviceRole") == role)
        rel = safe_relative(receipt_item.get("receiptPath"))
        receipt_data[role] = validate_receipt(root, root / rel, role, core)
        if receipt_data[role]["receiptSha256"] != receipt_item.get("receiptSha256"):
            fail(f"sealed {role} QA receipt changed after candidate identity was sealed")
    for check_name in DYNAMIC_CHECKS:
        check = checks[check_name]
        if (not isinstance(check, dict) or set(check) != {"result", "phoneEvidenceSha256", "tabletEvidenceSha256"}
                or check.get("result") != "PASS"):
            fail(f"external terrain check is missing or not passed: {check_name}")
        for role, field in (("phone", "phoneEvidenceSha256"), ("tablet", "tabletEvidenceSha256")):
            selected = check.get(field)
            matching = [entry for entry in receipt_data[role]["evidence"]
                        if check_name in entry.get("checksCovered", []) and entry.get("sha256") == selected]
            if not matching:
                fail(f"external terrain check {check_name} lacks hash-bound {role} evidence")
    review = evidence.get("independentReview")
    if (not isinstance(review, dict) or set(review) != {"reviewer", "independentOfImplementation", "recordPath", "recordBytes", "recordSha256", "assertionResults"}
            or not isinstance(review.get("reviewer"), str) or len(review["reviewer"].strip()) < 2
            or review.get("independentOfImplementation") is not True):
        fail("external terrain evidence lacks named independent review authority")
    try:
        validate_completed_proof_assertions(evidence.get("completedProofAssertions"),
                                            review.get("assertionResults"))
    except ProfileError as exc:
        fail(f"external terrain proof assertions are incomplete or unreviewed: {exc}")
    for assertion, groups in PENDING_PROOF_ASSERTION_GROUPS.items():
        if any(group not in checks for group in groups):
            fail(f"release assertion has no completed scenario group: {assertion}")
    validate_inventory(root, [{"path": review["recordPath"], "bytes": review["recordBytes"],
                               "sha256": review["recordSha256"]}], "terrain evidence review record")


def verify_candidate(args: argparse.Namespace) -> None:
    root = Path(args.root).resolve()
    identity = load_identity(Path(args.identity), args.identity_sha256)
    core = identity["core"]
    if Path(core.get("repoRoot", "")).resolve() != root:
        fail("candidate identity is pinned to another checkout")
    verify_current_core(root, identity, expected_profile=getattr(args, "terrain_profile", None), stage="release")
    validate_sealed_receipts(root, identity)
    verify_forward_evidence(root, identity, getattr(args, "terrain_evidence", None),
                            getattr(args, "terrain_evidence_sha256", None))
    if args.expected_build is not None and core["buildNumber"] != args.expected_build:
        fail(f"candidate build number {core['buildNumber']} does not match expected {args.expected_build}")
    print(f"CANDIDATE IDENTITY PASS: {identity['candidateId']} build {core['buildNumber']}")


def verify_simulator_app(args: argparse.Namespace) -> None:
    root = Path(args.root).resolve()
    identity = load_identity(Path(args.identity), args.identity_sha256)
    core = identity["core"]
    if Path(core.get("repoRoot", "")).resolve() != root:
        fail("candidate identity is pinned to another checkout")
    verify_current_core(root, identity, expected_profile=getattr(args, "terrain_profile", None), stage="release")
    if core.get("terrainProfile") == PROFILE_FORWARD:
        validate_sealed_receipts(root, identity)
        verify_forward_evidence(root, identity, getattr(args, "terrain_evidence", None),
                                getattr(args, "terrain_evidence_sha256", None))
    plist, _ = app_metadata(Path(args.app))
    if app_platform(plist) != "simulator":
        fail("candidate under test must be an iOS Simulator .app")
    if plist.get("CFBundleIdentifier") != APP_ID or str(plist.get("CFBundleVersion")) != str(core["buildNumber"]):
        fail("Simulator app bundle/build does not match reviewed candidate")
    if app_digest(Path(args.app)) != core.get("simulatorAppSha256"):
        fail("Simulator app bytes differ from candidate-preparation product")
    if app_inventory(Path(args.app)) != core.get("simulatorAppInventory"):
        fail("Simulator app package inventory differs from candidate-preparation product")
    payload = payload_inventory(Path(args.app), Path(args.app) / "public")
    if inventory_digest(payload) != core.get("runtimePayloadSha256"):
        fail("Simulator app embedded runtime payload differs from reviewed candidate")
    print(f"SIMULATOR APP PASS: build {core['buildNumber']} matches candidate; installable only on simulator")


def verify_qa_simulator_app(args: argparse.Namespace) -> None:
    root = Path(args.root).resolve()
    identity = load_identity(Path(args.identity), args.identity_sha256)
    core = identity["core"]
    if identity.get("preparationOnly") is not True or core.get("terrainProfile") != PROFILE_FORWARD:
        fail("QA simulator install requires an explicit forward QA-preparation identity")
    if Path(core.get("repoRoot", "")).resolve() != root:
        fail("candidate identity is pinned to another checkout")
    verify_current_core(root, identity, expected_profile=PROFILE_FORWARD, stage="preparation")
    plist, _ = app_metadata(Path(args.app))
    if app_platform(plist) != "simulator":
        fail("QA candidate under test must be an iOS Simulator .app")
    if plist.get("CFBundleIdentifier") != APP_ID or str(plist.get("CFBundleVersion")) != str(core["buildNumber"]):
        fail("QA Simulator app bundle/build does not match reviewed candidate")
    if app_digest(Path(args.app)) != core.get("simulatorAppSha256"):
        fail("QA Simulator app bytes differ from candidate-preparation product")
    if app_inventory(Path(args.app)) != core.get("simulatorAppInventory"):
        fail("QA Simulator app package inventory differs from candidate-preparation product")
    payload = payload_inventory(Path(args.app), Path(args.app) / "public")
    if inventory_digest(payload) != core.get("runtimePayloadSha256"):
        fail("QA Simulator app embedded runtime payload differs from reviewed candidate")
    print(f"QA PREPARATION APP PASS: build {core['buildNumber']} matches static identity; releaseEligible=false")


def zip_payload_digest(archive: zipfile.ZipFile, app_prefix: str) -> tuple[str, int]:
    entries = []
    prefix = app_prefix.rstrip("/") + "/public/"
    for member in archive.infolist():
        name = member.filename
        if not name.startswith(prefix) or name.endswith("/"):
            continue
        rel_inside = name[len(prefix):]
        if not rel_inside or PurePosixPath(rel_inside).name in {"cordova.js", "cordova_plugins.js"}:
            continue
        data = archive.read(member)
        entries.append({"path": "dist/" + rel_inside, "bytes": len(data), "sha256": sha_bytes(data)})
    return inventory_digest(entries), len(entries)


def required_tool(name: str) -> str:
    path = shutil.which(name)
    if not path:
        fail(f"IPA signature verification requires macOS tool {name!r}; refusing unsigned/unverified IPA")
    return path


def checked_tool(command: list[str], label: str) -> subprocess.CompletedProcess[str]:
    required_tool(command[0])
    try:
        result = subprocess.run(command, capture_output=True, text=True, timeout=60)
    except (OSError, subprocess.TimeoutExpired) as exc:
        fail(f"{label} could not run: {exc}")
    if result.returncode:
        detail = (result.stderr or result.stdout or "no diagnostic").strip()[-1200:]
        fail(f"{label} failed: {detail}")
    return result


def extract_ipa_app(archive: zipfile.ZipFile, app_prefix: str, destination: Path) -> Path:
    """Extract one already path-validated app bundle without trusting zip paths."""
    app_name = PurePosixPath(app_prefix).name
    if not app_name.endswith(".app") or "/" in app_name or app_name in {".", ".."}:
        fail("IPA app bundle path is malformed")
    app = destination / app_name
    app.mkdir(mode=0o755)
    prefix = app_prefix.rstrip("/") + "/"
    for member in archive.infolist():
        name = member.filename
        if not name.startswith(prefix):
            continue
        raw_rel = name[len(prefix):].rstrip("/")
        if not raw_rel:
            continue
        rel = safe_relative(raw_rel)
        target = app.joinpath(*PurePosixPath(rel).parts)
        try:
            target.resolve(strict=False).relative_to(app.resolve(strict=True))
        except ValueError:
            fail(f"IPA app path escapes extraction root: {rel}")
        if member.is_dir() or name.endswith("/"):
            target.mkdir(parents=True, exist_ok=True)
            continue
        target.parent.mkdir(parents=True, exist_ok=True)
        try:
            with target.open("xb") as output:
                output.write(archive.read(member))
        except FileExistsError:
            fail(f"IPA contains duplicate app path: {rel}")
        mode = (member.external_attr >> 16) & 0o777
        if mode:
            target.chmod(mode)
    return app


def parse_codesign_details(output: str) -> dict[str, str]:
    details: dict[str, str] = {}
    for line in output.splitlines():
        key, separator, value = line.partition("=")
        if separator and key in {"Identifier", "TeamIdentifier"}:
            details[key] = value.strip()
    if not details.get("Identifier") or not details.get("TeamIdentifier"):
        fail("codesign did not report a signed app identifier and TeamIdentifier")
    return details


def validate_apple_distribution_profile(
    profile_path: Path, expected_team: str, expected_cert_sha1: str,
    expected_profile: str,
) -> None:
    result = checked_tool(["security", "cms", "-D", "-i", str(profile_path)], "embedded provisioning profile decode")
    try:
        profile = plistlib.loads(result.stdout.encode())
    except Exception as exc:
        fail(f"embedded provisioning profile is not a valid CMS plist: {exc}")
    if not isinstance(profile, dict):
        fail("embedded provisioning profile is not a dictionary")
    if profile.get("Name") != expected_profile:
        fail("embedded provisioning profile name differs from expected Fastlane profile")
    if expected_team not in profile.get("TeamIdentifier", []):
        fail("embedded provisioning profile TeamIdentifier differs from expected signing team")
    prefixes = profile.get("ApplicationIdentifierPrefix")
    entitlements = profile.get("Entitlements")
    if not isinstance(prefixes, list) or not prefixes or not isinstance(entitlements, dict):
        fail("embedded provisioning profile lacks app identity entitlements")
    app_identifiers = {f"{prefix}.{APP_ID}" for prefix in prefixes if isinstance(prefix, str)}
    if entitlements.get("application-identifier") not in app_identifiers:
        fail("embedded provisioning profile application-identifier does not match the app")
    if entitlements.get("com.apple.developer.team-identifier") != expected_team:
        fail("embedded provisioning profile team entitlement differs from expected signing team")
    if entitlements.get("get-task-allow") is not False:
        fail("embedded provisioning profile is not an App Store distribution profile")
    if profile.get("ProvisionedDevices") or profile.get("ProvisionsAllDevices"):
        fail("embedded provisioning profile is development or enterprise, not App Store distribution")
    if "iOS" not in profile.get("Platform", []):
        fail("embedded provisioning profile does not target iOS")
    expiry = profile.get("ExpirationDate")
    if not isinstance(expiry, datetime):
        fail("embedded provisioning profile lacks an expiration date")
    if expiry.tzinfo is None:
        expiry = expiry.replace(tzinfo=timezone.utc)
    if expiry <= datetime.now(timezone.utc):
        fail("embedded provisioning profile has expired")
    certificates = profile.get("DeveloperCertificates")
    if not isinstance(certificates, list) or not any(
        isinstance(cert, bytes) and hashlib.sha1(cert).hexdigest().lower() == expected_cert_sha1.lower()
        for cert in certificates
    ):
        fail("expected signing certificate is not present in the embedded provisioning profile")


def verify_signed_device_app(
    app: Path, expected_team: str, expected_signing_identity: str, expected_profile: str,
) -> None:
    """Require a valid device code signature, exact signer/profile, and iOS Mach-O platform."""
    if sys.platform != "darwin":
        fail("exported IPA signature verification requires macOS codesign/security/otool; refusing unverified IPA")
    cert_sha1 = expected_signing_identity.replace(":", "").strip().lower()
    if not re.fullmatch(r"[0-9a-f]{40}", cert_sha1):
        fail("expected signing identity must be the 40-character SHA-1 fingerprint passed by Fastlane")
    checked_tool(["codesign", "--verify", "--deep", "--strict", "--verbose=2", str(app)],
                 "exported app code-signature verification")
    with tempfile.TemporaryDirectory(prefix="edu-rpg-ipa-signature-") as temporary:
        temp = Path(temporary)
        prefix = temp / "signer-cert-"
        details_result = checked_tool(
            ["codesign", "--display", "--verbose=4", f"--extract-certificates={prefix}", str(app)],
            "exported app signing identity inspection",
        )
        details = parse_codesign_details((details_result.stdout or "") + "\n" + (details_result.stderr or ""))
        if details["Identifier"] != APP_ID:
            fail("exported app code signature identifier mismatch")
        if details["TeamIdentifier"] != expected_team:
            fail("exported app code signature TeamIdentifier differs from expected signing team")
        leaf = Path(f"{prefix}0")
        if not leaf.is_file() or hashlib.sha1(leaf.read_bytes()).hexdigest().lower() != cert_sha1:
            fail("exported app signing certificate differs from expected Fastlane identity")
        profile_path = app / "embedded.mobileprovision"
        if not profile_path.is_file():
            fail("exported app is missing embedded.mobileprovision")
        validate_apple_distribution_profile(profile_path, expected_team, cert_sha1, expected_profile)
    info_path = app / "Info.plist"
    try:
        info = plistlib.loads(info_path.read_bytes())
    except Exception as exc:
        fail(f"cannot read extracted device app Info.plist: {exc}")
    executable = info.get("CFBundleExecutable") if isinstance(info, dict) else None
    if not isinstance(executable, str):
        fail("exported app Info.plist lacks CFBundleExecutable")
    executable_rel = safe_relative(executable)
    binary = app.joinpath(*PurePosixPath(executable_rel).parts)
    if not binary.is_file() or binary.is_symlink():
        fail("exported app executable is missing or unsafe")
    if not binary.stat().st_mode & 0o111:
        fail("exported app executable is not marked executable in the IPA")
    result = checked_tool(["otool", "-l", str(binary)], "exported app Mach-O platform inspection")
    load_commands = result.stdout
    platforms = [int(value) for value in re.findall(r"(?m)^\s*platform\s+(\d+)\s*$", load_commands)]
    legacy_device = "LC_VERSION_MIN_IPHONEOS" in load_commands
    legacy_simulator = "LC_VERSION_MIN_SIMULATOR" in load_commands
    if platforms:
        if any(platform != 2 for platform in platforms):
            fail(f"exported app executable contains a non-iOS-device Mach-O platform: {sorted(set(platforms))}")
    elif not legacy_device or legacy_simulator:
        fail("exported app executable lacks an iPhoneOS Mach-O build platform")


def verify_ipa(args: argparse.Namespace) -> None:
    root = Path(args.root).resolve()
    identity = load_identity(Path(args.identity), args.identity_sha256)
    core = identity["core"]
    if Path(core.get("repoRoot", "")).resolve() != root:
        fail("candidate identity is pinned to another checkout")
    verify_current_core(root, identity, allow_signing_overlay=True,
                        expected_profile=getattr(args, "terrain_profile", None),
                        expected_signing={
                            "CODE_SIGN_STYLE": args.expected_signing_style,
                            "DEVELOPMENT_TEAM": args.expected_team,
                            "CODE_SIGN_IDENTITY": args.expected_signing_identity,
                            "PROVISIONING_PROFILE_SPECIFIER": args.expected_profile,
                        })
    validate_sealed_receipts(root, identity)
    verify_forward_evidence(root, identity, getattr(args, "terrain_evidence", None),
                            getattr(args, "terrain_evidence_sha256", None))
    ipa = Path(args.ipa)
    if not ipa.is_file():
        fail(f"device IPA is missing: {ipa}")
    try:
        with zipfile.ZipFile(ipa) as archive:
            members = archive.infolist()
            seen_members: set[str] = set()
            for member in members:
                name = member.filename
                rel = safe_relative(name.rstrip("/"))
                if name in seen_members:
                    fail(f"IPA contains duplicate archive path: {rel}")
                seen_members.add(name)
                mode = (member.external_attr >> 16) & 0xFFFF
                if mode and (mode & 0o170000) == 0o120000:
                    fail(f"IPA contains unsupported symlink: {rel}")
            infos = [m for m in members if re.fullmatch(r"Payload/[^/]+\.app/Info\.plist", m.filename)]
            if len(infos) != 1:
                fail("IPA must contain exactly one Payload/*.app/Info.plist")
            info_member = infos[0]
            app_prefix = info_member.filename.rsplit("/Info.plist", 1)[0]
            plist = plistlib.loads(archive.read(info_member))
            if app_platform(plist) != "device":
                fail("exported IPA is not an iPhoneOS device app")
            if plist.get("CFBundleIdentifier") != APP_ID:
                fail("device IPA bundle identifier mismatch")
            if str(plist.get("CFBundleVersion")) != str(core["buildNumber"]):
                fail("device IPA build number differs from reviewed Simulator candidate")
            if str(plist.get("CFBundleShortVersionString")) != core["marketingVersion"]:
                fail("device IPA marketing version differs from candidate")
            digest, count = zip_payload_digest(archive, app_prefix)
            if not count or digest != core["runtimePayloadSha256"]:
                fail("device IPA runtime payload differs from reviewed candidate")
            with tempfile.TemporaryDirectory(prefix="edu-rpg-ipa-extract-") as temporary:
                extracted_app = extract_ipa_app(archive, app_prefix, Path(temporary))
                verify_signed_device_app(
                    extracted_app, args.expected_team, args.expected_signing_identity, args.expected_profile,
                )
    except (OSError, zipfile.BadZipFile, KeyError, plistlib.InvalidFileException) as exc:
        fail(f"cannot verify exported device IPA: {exc}")
    print(f"DEVICE IPA PASS: build {core['buildNumber']} and runtime payload match candidate; IPA SHA-256={sha_file(ipa)}")


def build_parser() -> argparse.ArgumentParser:
    parser = argparse.ArgumentParser(description=__doc__)
    commands = parser.add_subparsers(dest="command", required=True)
    prep = commands.add_parser("prepare", help="write a pending identity from a built Simulator .app")
    prep.add_argument("--root", required=True)
    prep.add_argument("--terrain-profile", required=True)
    prep.add_argument("--build-number", type=int, required=True)
    prep.add_argument("--simulator-app", required=True)
    prep.add_argument("--output", required=True)
    prep.add_argument("--qa-preparation", action="store_true",
                      help="create an explicit nonshippable forward-profile QA identity")
    seal = commands.add_parser("seal", help="bind independent phone/tablet QA receipts")
    seal.add_argument("--root", required=True)
    seal.add_argument("--identity", required=True)
    seal.add_argument("--phone-receipt", required=True)
    seal.add_argument("--tablet-receipt", required=True)
    candidate = commands.add_parser("candidate", help="verify frozen source and QA identity")
    candidate.add_argument("--root", required=True)
    candidate.add_argument("--identity", required=True)
    candidate.add_argument("--identity-sha256", required=True)
    candidate.add_argument("--terrain-profile", choices=sorted(PROFILES))
    candidate.add_argument("--expected-build", type=int)
    candidate.add_argument("--terrain-evidence", type=Path)
    candidate.add_argument("--terrain-evidence-sha256")
    sim = commands.add_parser("simulator-app", help="verify the simulator product before install/test")
    sim.add_argument("--root", required=True)
    sim.add_argument("--identity", required=True)
    sim.add_argument("--identity-sha256", required=True)
    sim.add_argument("--app", required=True)
    sim.add_argument("--terrain-profile", choices=sorted(PROFILES))
    sim.add_argument("--terrain-evidence", type=Path)
    sim.add_argument("--terrain-evidence-sha256")
    qa_sim = commands.add_parser("qa-simulator-app", help="verify a static-only QA-preparation Simulator app")
    qa_sim.add_argument("--root", required=True)
    qa_sim.add_argument("--identity", required=True)
    qa_sim.add_argument("--identity-sha256", required=True)
    qa_sim.add_argument("--app", required=True)
    ipa = commands.add_parser("ipa", help="verify the exported iPhoneOS IPA against the candidate")
    ipa.add_argument("--root", required=True)
    ipa.add_argument("--identity", required=True)
    ipa.add_argument("--identity-sha256", required=True)
    ipa.add_argument("--ipa", required=True)
    ipa.add_argument("--terrain-profile", choices=sorted(PROFILES))
    ipa.add_argument("--terrain-evidence", type=Path)
    ipa.add_argument("--terrain-evidence-sha256")
    ipa.add_argument("--expected-team", required=True)
    ipa.add_argument("--expected-signing-identity", required=True)
    ipa.add_argument("--expected-profile", required=True)
    ipa.add_argument("--expected-signing-style", default="Manual")
    return parser


def main(argv: list[str] | None = None) -> int:
    args = build_parser().parse_args(argv)
    try:
        if args.command == "prepare":
            write_prepared(Path(args.root).resolve(), args.terrain_profile, args.build_number,
                           Path(args.simulator_app).resolve(), Path(args.output),
                           qa_preparation=args.qa_preparation)
        elif args.command == "seal":
            seal_identity(Path(args.root).resolve(), Path(args.identity),
                          Path(args.phone_receipt), Path(args.tablet_receipt))
        elif args.command == "candidate":
            verify_candidate(args)
        elif args.command == "simulator-app":
            verify_simulator_app(args)
        elif args.command == "qa-simulator-app":
            verify_qa_simulator_app(args)
        elif args.command == "ipa":
            verify_ipa(args)
        return 0
    except (GateError, OSError, subprocess.CalledProcessError, KeyError, TypeError, ValueError) as exc:
        print(f"RELEASE IDENTITY BLOCKED: {exc}", file=sys.stderr)
        return 1


if __name__ == "__main__":
    raise SystemExit(main())
