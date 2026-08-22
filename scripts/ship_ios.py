#!/usr/bin/env python3
"""Run edu-rpg's local, checkout-pinned TestFlight lane."""

import argparse
import hashlib
import os
from pathlib import Path
import subprocess
import time
import sys


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
    build = build_file.read_text().strip()
    print(f"uploaded edu-rpg build {build}; now proving it is actually installable")

    # UPLOADED IS NOT SHIPPED, AND `processingState: VALID` IS NOT INSTALLABLE. This script used to
    # end at the line above, and the caller then read VALID off check-build.py and told the owner to
    # install. Three edu-rpg builds were reported that way and none of them was downloadable: the
    # owner's tester record read `state: INVITED`, an invitation never accepted, which no
    # processing-state field reflects. Owner, 2026-08-22: "this is a pattern now so please fix your
    # process." A rule that has to be remembered is not a fix, so the check runs HERE, in the only
    # path that ships, and a failure is a non-zero exit rather than a note.
    skill = Path.home() / ".agents/skills/push-to-testflight"
    verifier, assigner = skill / "verify-delivery.py", skill / "assign-beta-group.py"
    for f in (verifier, assigner):
        if not f.is_file():
            raise SystemExit(f"missing shipping dependency: {f}")

    # ASSIGNING "Beta Testers" IS PART OF THE SHIP FOR THIS APP, not an optional follow-up. The
    # owner receives edu-rpg builds on the EXTERNAL channel: builds 54 and 55 were assigned and he
    # installed both; 56 was not and read `externalBuildState: READY_FOR_BETA_SUBMISSION`, which is
    # the whole reason it was undeliverable. Beta review clears in seconds while the version is
    # already approved. Non-fatal on its own -- the verifier below is what decides.
    r = subprocess.run([sys.executable, str(assigner), "--app", "edu-rpg", build, "Beta Testers"],
                       capture_output=True, text=True)
    print(r.stdout.strip() or r.stderr.strip()[-300:])
    deadline = time.time() + 20 * 60          # ASC lags upload by ~5-15 min
    while True:
        r = subprocess.run([sys.executable, str(verifier), "--app", "edu-rpg", "--build", build],
                           capture_output=True, text=True)
        print(r.stdout, end="")
        if r.returncode == 0:
            print(f"CODEX REPORT: edu-rpg build {build} uploaded AND installable")
            return 0
        # exit 1 with "is not in ASC yet" is the only retryable state; everything else is a verdict
        if "not in ASC yet" not in r.stdout or time.time() > deadline:
            print(r.stderr[-400:], file=sys.stderr)
            raise SystemExit(f"edu-rpg build {build} uploaded but is NOT installable -- see above. "
                             f"Do NOT report this build as shipped.")
        time.sleep(60)


if __name__ == "__main__":
    raise SystemExit(main())
