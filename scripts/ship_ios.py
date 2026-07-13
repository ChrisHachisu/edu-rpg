#!/usr/bin/env python3
"""Run edu-rpg's local, checkout-pinned TestFlight lane."""

import argparse
import hashlib
import os
from pathlib import Path
import subprocess


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("--app-dir", required=True)
    parser.add_argument("--dry-run", action="store_true")
    parser.add_argument("--resume", action="store_true")
    args = parser.parse_args()

    root = Path(args.app_dir).resolve()
    owner = Path(__file__).resolve().parent.parent
    skill = Path.home() / ".agents/skills/push-to-testflight"
    if root != owner:
        raise SystemExit(f"checkout mismatch: --app-dir={root}, script owner={owner}")
    for required in (skill / "SKILL.md", root / "scripts/ship-gate.sh", root / "ios/App/fastlane/Fastfile"):
        if not required.is_file():
            raise SystemExit(f"missing shipping dependency: {required}")

    git_root = Path(subprocess.check_output(["git", "rev-parse", "--show-toplevel"], cwd=root, text=True).strip()).resolve()
    if git_root != root:
        raise SystemExit(f"git checkout mismatch: git owns {git_root}, requested {root}")
    branch = subprocess.check_output(["git", "branch", "--show-current"], cwd=root, text=True).strip() or "(detached)"
    head = subprocess.check_output(["git", "rev-parse", "HEAD"], cwd=root, text=True).strip()
    dirty = bool(subprocess.check_output(["git", "status", "--porcelain"], cwd=root, text=True).strip())
    bundle = root / "dist/assets/index-BhoGQRaA.js"
    artifact_sha256 = hashlib.sha256(bundle.read_bytes()).hexdigest()
    source_record = f"tree={root}\nbranch={branch}\nhead={head}\ndirty={str(dirty).lower()}\nartifact_sha256={artifact_sha256}\n"
    print(source_record, end="")

    subprocess.run(["bash", str(root / "scripts/ship-gate.sh"), str(root)], check=True)
    print(f"SHIP_TREE={root}")
    print(f"SHIP_SKILL={skill}")
    if args.dry_run:
        print("DRY RUN PASS: checkout and shipped-artifact gates passed; no upload performed")
        return 0

    record_file = root / "ios/build/ship-source.txt"
    record_file.parent.mkdir(parents=True, exist_ok=True)
    record_file.write_text(source_record)

    env = os.environ.copy()
    env.update({
        "SHIP_APP_DIR": str(root),
        "LANG": "en_US.UTF-8",
        "LC_ALL": "en_US.UTF-8",
        "SHIP_IOS_NO_SLACK": env.get("SHIP_IOS_NO_SLACK", "1"),
    })
    subprocess.run(["fastlane", "beta"], cwd=root / "ios/App", env=env, check=True)
    build_file = root / "ios/build/last-testflight-build.txt"
    if not build_file.is_file():
        raise SystemExit("upload returned without an exact build-number record")
    print(f"CODEX REPORT: uploaded edu-rpg build {build_file.read_text().strip()}; ASC processing/assignment still required")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
