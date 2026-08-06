#!/usr/bin/env python3
"""Recompute the runtime pins in `runtime_baseline.py` from the files on disk.

WHY THIS EXISTS
    `scripts/runtime_baseline.py` carries 53 pins -- size + sha256 for every shipped runtime
    file -- and they were maintained BY HAND. Any track that ships any asset has to edit that one
    file, so two sessions working in parallel conflict on it every single time, on a file where a
    bad merge silently ships the wrong hash. Measured on the session that prompted this: 5 of 6
    commits touched it.

    The pins are derived data. They are `getsize` and `sha256` of files already on disk; they were
    hand-written only out of habit. Generating them makes two branches produce byte-identical
    output for identical files, which turns the guaranteed conflict into no conflict at all --
    and leaves a real conflict only when two branches genuinely change the SAME asset, which is
    the one case a human should look at.

    See docs/PARALLEL-SESSIONS.md.

WHAT IT DELIBERATELY DOES NOT TOUCH
    Only the NUMBERS are generated. The surrounding comments are the institutional memory of this
    project -- why a file is pinned, which owner decision put it there, what broke last time -- and
    they are worth more than the pins. This rewrites the `(size, "sha")` tuples in place and leaves
    every comment, key and line of structure exactly where it was.

    BUNDLE_SIZE / BUNDLE_SHA256 are NOT regenerated. That bundle is frozen by decision, not by
    derivation: `dist/assets/index-BhoGQRaA.js` must stay 4,987,581 bytes forever, and a script
    that would happily "update" it to whatever is on disk is a script that quietly destroys the
    one invariant the whole runtime rests on.

    regenerate_pins.py            rewrite the pins from disk
    regenerate_pins.py --check    exit 1 if any pin disagrees with disk, changing nothing
"""
from __future__ import annotations

import argparse
import hashlib
import os
import re
import sys

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
TARGET = os.path.join(ROOT, "scripts/runtime_baseline.py")

# `(size, "sha256")` following a quoted key. Tolerates the underscore separators the file uses on
# some sizes (603_397) and both the one-line and wrapped layouts.
PIN = re.compile(r'("([^"]+)":\s*\(\s*)([0-9_]+)(,\s*")([0-9a-f]{64})("\))')

# Almost every pinned path is relative to public/. `index.html` is the exception -- it is a build
# output and only ever exists in dist/ -- so resolution falls back rather than assuming.
SEARCH = ("public", "dist")


def resolve(key: str) -> str | None:
    for base in SEARCH:
        path = os.path.join(ROOT, base, key)
        if os.path.isfile(path):
            return path
    return None


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("--check", action="store_true",
                    help="report drift and exit 1; write nothing")
    args = ap.parse_args()

    src = open(TARGET, encoding="utf-8").read()
    drift, missing = [], []

    def repl(m: re.Match) -> str:
        head, key, old_size, mid, old_sha, tail = m.groups()
        path = resolve(key)
        if path is None:
            missing.append(key)
            return m.group(0)
        size = os.path.getsize(path)
        sha = hashlib.sha256(open(path, "rb").read()).hexdigest()
        if int(old_size.replace("_", "")) == size and old_sha == sha:
            # UNCHANGED PINS ARE LEFT BYTE-FOR-BYTE ALONE, including the `603_397` digit
            # separators the file uses in places. A generator that reformats what it did not
            # change produces a diff on every run, which is exactly the review noise this script
            # exists to remove -- and it would make an unrelated merge look like a pin change.
            return m.group(0)
        drift.append((key, int(old_size.replace("_", "")), size))
        return f"{head}{size}{mid}{sha}{tail}"

    out = PIN.sub(repl, src)
    total = len(PIN.findall(src))

    for key in missing:
        print(f"  UNRESOLVED  {key}  (not under public/ or dist/)")

    if args.check:
        for key, was, now in drift:
            print(f"  DRIFT  {key}  pinned {was} B, on disk {now} B")
        if missing or drift:
            print(f"\nFAIL: {len(drift)} pin(s) disagree with disk, "
                  f"{len(missing)} unresolved. Run scripts/regenerate_pins.py")
            return 1
        print(f"PINS CHECK PASS: all {total} pins match the files on disk")
        return 0

    if missing:
        print("\nREFUSING to write while any pin is unresolved -- fix the paths first.")
        return 1
    if out != src:
        open(TARGET, "w", encoding="utf-8").write(out)
    for key, was, now in drift:
        print(f"  updated  {key}  {was} -> {now} B")
    print(f"PINS: {total} checked, {len(drift)} updated")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
