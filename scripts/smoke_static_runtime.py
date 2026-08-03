#!/usr/bin/env python3
"""Serve a verified hydrated runtime briefly and prove key files are reachable."""

from __future__ import annotations

import argparse
import functools
import http.server
import threading
import urllib.request
from pathlib import Path

import runtime_baseline


PROBES = {
    "index.html": b"Quest of Knowledge",
    "assets/index-BhoGQRaA.js": b"edu-rpg-save",
    "ui-overhaul.js": b"__QOKUI",
    "dq-tiles.js": b"__DQ",
    "hero-override.js": b"hero",
    "assets/backgrounds/bg-forest.webp": None,
    "assets/monsters/monster-slime.png": None,
}


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--input", type=Path, required=True)
    parser.add_argument("--act1-overlay", action="store_true")
    args = parser.parse_args()
    root = args.input.resolve()
    if args.act1_overlay:
        runtime_baseline.verify_act1_overlay(root)
        PROBES["act1-world-map.js"] = b"__ACT1_WORLD_MAP__"
    else:
        runtime_baseline.verify(root)

    handler = functools.partial(http.server.SimpleHTTPRequestHandler, directory=str(root))
    server = http.server.ThreadingHTTPServer(("127.0.0.1", 0), handler)
    thread = threading.Thread(target=server.serve_forever, daemon=True)
    thread.start()
    try:
        for relative_path, marker in PROBES.items():
            with urllib.request.urlopen(
                f"http://127.0.0.1:{server.server_port}/{relative_path}", timeout=10
            ) as response:
                body = response.read()
                if response.status != 200 or not body:
                    raise runtime_baseline.BaselineError(f"static probe failed: {relative_path}")
                if marker is not None and marker not in body:
                    raise runtime_baseline.BaselineError(f"static marker missing: {relative_path}")
    finally:
        server.shutdown()
        server.server_close()
        thread.join(timeout=5)
    print(f"STATIC SMOKE PASS: {len(PROBES)} key requests from {root}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
