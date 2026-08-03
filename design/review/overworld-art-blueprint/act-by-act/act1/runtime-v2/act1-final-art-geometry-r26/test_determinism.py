#!/usr/bin/env python3
"""Rebuild twice and prove byte-stable R26 outputs."""

from __future__ import annotations

import hashlib
import subprocess
from pathlib import Path


PACK = Path(__file__).resolve().parent
OUTPUTS = [
    PACK / "candidate-art.png",
    PACK / "polygon-authority.json",
    PACK / "review/polygon-mask.png",
    PACK / "review/polygon-overlay.png",
    PACK / "review/owner-overview.png",
    PACK / "review/coastal-native.png",
    PACK / "review/coastal-overlay-native.png",
    PACK / "review/port-overlay-native.png",
    PACK / "review/sunken-overlay-native.png",
    PACK / "inventory.json",
]


def hashes() -> dict[str, str]:
    return {str(path.relative_to(PACK)): hashlib.sha256(path.read_bytes()).hexdigest() for path in OUTPUTS}


def main() -> None:
    subprocess.run(["python3", str(PACK / "build_final.py")], check=True)
    first = hashes()
    subprocess.run(["python3", str(PACK / "build_final.py")], check=True)
    second = hashes()
    assert first == second, {key: (first[key], second[key]) for key in first if first[key] != second[key]}
    print("PASS: R26 final art/geometry pack is byte-deterministic")


if __name__ == "__main__":
    main()
