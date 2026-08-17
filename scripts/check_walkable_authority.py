#!/usr/bin/env python3
"""Guardrail: keep the DESIGN-ONLY walkable sketch from ever being mistaken for the enforced one.

WHY THIS EXISTS
    Two files shipped with the SAME `schema` string, `act1-art-fit-polygon-authority-v2`:

        public/act1-hifi/walkable-regions-v1.json     overworld  NOT read by anything at runtime
        public/act1-hifi/portSapphire-walkable-v1.json  town     fetched and enforced EVERY FRAME

    and the first one's `authority` field read like a promotion ("one hash-locked design pair"),
    while containing no hash and being locked by nothing. A coverage measurement taken against it
    reported 8.28% of walkable ground uncovered. The real figure, measured against the authority the
    runtime actually consults, is ZERO -- wrong by three orders of magnitude, and it cost a round of
    work before anyone noticed. docs/GROUND-TRUTH.md records the incident.

    Owner, 2026-08-17: "put guardrails on the trap or fix whatever necessary."

WHAT IT ENFORCES
    1. The design-only file declares itself as such: distinct schema, runtimeAuthority false, and a
       supersededBy naming what really answers the question.
    2. NOTHING under public/ or src/ references it. That is the property that makes it harmless, so
       it is the property worth failing a build over -- a future promotion has to be deliberate.
    3. The two files do not share a schema string. Same-name, opposite-status is the whole trap.
    4. The town file is still wired to the town record that serves it, so this check cannot pass by
       the town geometry quietly disappearing.

    Prose in a header cannot do any of this; the previous header WAS prose and was read past twice.
"""
from __future__ import annotations

import json
import re
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
DESIGN_ONLY = ROOT / "public/act1-hifi/walkable-regions-v1.json"
TOWN = ROOT / "public/act1-hifi/portSapphire-walkable-v1.json"
TOWN_SERVED = ROOT / "public/act1-hifi/town/portSapphire-walkable.json"
TOWN_RECORD = ROOT / "public/act1-hifi/town/portSapphire-town.json"
REAL_OVERWORLD_AUTHORITY = "public/act1-world-map.js"
SCAN_DIRS = ("public", "src")
SCAN_SUFFIXES = {".js", ".mjs", ".cjs", ".ts", ".tsx", ".html", ".json"}

# KNOWN, DELIBERATE, AND NOT A RUNTIME. `act1-hifi/runtime.html` is a desktop DESIGN MOCKUP despite
# its name and its location -- it draws a fake phone with a hardcoded "9:41" status bar, and the
# handoff that named it says so outright (docs/handoffs/2026-08-02-act1-port-sapphire-in-app.md:87:
# "runtime.html is a DESIGN MOCKUP, not a runtime"). The live game is index.html -> adapter.js ->
# act1-hifi/town.html, none of which touch the design-only sketch.
#
# It is allowlisted rather than ignored so the exemption is one line, visible, and attached to its
# evidence. Every OTHER reference still fails the build.
#
# SEPARATE, STILL OPEN: this mockup is staged into dist/ and therefore ships inside the app payload
# (scripts/runtime_baseline.py maps it in). Nothing loads it, so it is dead weight rather than a
# defect -- but a mockup fetching design-only geometry, sitting in the shipped bundle under the name
# "runtime", is precisely the shape of thing that gets mistaken for the authority later.
ALLOWED_REFERENCES = {"public/act1-hifi/runtime.html"}


def fail(msg: str) -> None:
    print(f"WALKABLE AUTHORITY CHECK FAIL: {msg}", file=sys.stderr)
    raise SystemExit(1)


def main() -> int:
    if not DESIGN_ONLY.is_file():
        fail(f"missing {DESIGN_ONLY.relative_to(ROOT)}")
    if not TOWN.is_file():
        fail(f"missing {TOWN.relative_to(ROOT)}")

    d = json.loads(DESIGN_ONLY.read_text())
    t = json.loads(TOWN.read_text())

    # 1. the design-only file must say so, machine-readably
    if d.get("runtimeAuthority") is not False:
        fail("walkable-regions-v1.json must carry \"runtimeAuthority\": false")
    if "not-promoted" not in str(d.get("status", "")):
        fail(f"walkable-regions-v1.json status lost its not-promoted marker: {d.get('status')!r}")
    if REAL_OVERWORLD_AUTHORITY not in str(d.get("supersededBy", "")):
        fail(f"walkable-regions-v1.json must name {REAL_OVERWORLD_AUTHORITY} in supersededBy")

    # 3. and it must not share a schema string with the enforced town file
    if d.get("schema") == t.get("schema"):
        fail(
            "walkable-regions-v1.json and portSapphire-walkable-v1.json share the schema "
            f"{d.get('schema')!r}. Same name, opposite status -- that IS the trap this check exists for."
        )

    # 2. nothing the runtime loads may reference the design-only file
    needle = re.compile(r"walkable-regions-v1")
    offenders = []
    for d_name in SCAN_DIRS:
        base = ROOT / d_name
        if not base.is_dir():
            continue
        for f in base.rglob("*"):
            if not f.is_file() or f.suffix not in SCAN_SUFFIXES or f == DESIGN_ONLY:
                continue
            rel = str(f.relative_to(ROOT))
            if rel in ALLOWED_REFERENCES:
                continue
            try:
                if needle.search(f.read_text(errors="ignore")):
                    offenders.append(rel)
            except OSError:
                continue
    if offenders:
        fail(
            "the design-only overworld sketch is referenced from runtime code:\n  "
            + "\n  ".join(offenders)
            + f"\nThe overworld's authority is {REAL_OVERWORLD_AUTHORITY} (ROWS/BOUNDS). If this "
              "reference is deliberate, promoting the file is an owner decision, not a code change."
        )

    # 4. the town geometry is still actually wired
    if not TOWN_SERVED.is_file():
        fail(f"missing served town geometry {TOWN_SERVED.relative_to(ROOT)}")
    if TOWN_RECORD.is_file():
        rec = TOWN_RECORD.read_text()
        if "walkable" not in rec:
            fail(f"{TOWN_RECORD.relative_to(ROOT)} no longer points at any walkable geometry")

    print(
        "WALKABLE AUTHORITY CHECK PASS: design-only sketch is inert "
        f"(schema {d.get('schema')!r}, 0 runtime references); town geometry {t.get('schema')!r} "
        f"is wired and served; overworld answers to {REAL_OVERWORLD_AUTHORITY}"
    )
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
