#!/usr/bin/env python3
"""Provenance records for derived artefacts.

Spec: docs/superpowers/specs/2026-08-01-artefact-provenance-design.md

On 2026-08-01 a material was replaced at 08:27 and every one of the 18 dungeon floor renders
became stale without anything noticing; a composite built on a 07-31 base was then presented to
the owner as the current art. Hashing the OUTPUT is not enough to prevent that — the failure is
that a derived artefact does not know what it was derived FROM.

So each artefact gets a record at `<dir>/.prov/<filename>.json` naming its inputs and their
hashes. A hidden subdirectory rather than a sidecar because the dungeon directory already holds
~50 PNGs; one file per artefact so concurrent sessions never write the same path.

Two fields earn their place beyond the obvious:

  generatorSha256   CODE IS AN INPUT. When `temper()` was added and the TARGET table tuned on
                    2026-07-31, every render was invalidated with no input FILE changed. Input
                    hashing alone reports those renders as fresh.
  params            `--scale 2` and `--scale 1` produce different output from identical inputs.

    prov.require_fresh(path)                     # before reading a derived artefact
    prov.stamp(out, inputs=[...], params={...})  # after writing one
"""
from __future__ import annotations

import datetime
import hashlib
import json
import os
import sys

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))

FRESH, STALE, MODIFIED, MISSING, UNKNOWN = "FRESH", "STALE", "MODIFIED", "MISSING", "UNKNOWN"


def rel(path: str) -> str:
    """Repo-relative, so records stay portable between checkouts and worktrees."""
    return os.path.relpath(os.path.abspath(path), ROOT)


def sha256(path: str) -> str | None:
    if not os.path.isfile(path):
        return None
    h = hashlib.sha256()
    with open(path, "rb") as f:
        # Chunked: the material sheets run to 3.4 MB and the overworld masters far past that.
        for block in iter(lambda: f.read(1 << 20), b""):
            h.update(block)
    return h.hexdigest()


def prov_path(artefact: str) -> str:
    a = os.path.abspath(artefact)
    return os.path.join(os.path.dirname(a), ".prov", os.path.basename(a) + ".json")


def read(artefact: str) -> dict | None:
    p = prov_path(artefact)
    if not os.path.isfile(p):
        return None
    try:
        return json.load(open(p))
    except (json.JSONDecodeError, OSError):
        # A corrupt record must not read as a valid one; UNKNOWN is the honest verdict.
        return None


def stamp(artefact: str, inputs: list[str] | None = None, params: dict | None = None,
          generator: str | None = None, command: str | None = None,
          adopted: bool = False, extra: dict | None = None) -> dict:
    """Record what produced `artefact`. Call AFTER the file is written."""
    a = os.path.abspath(artefact)
    if not os.path.isfile(a):
        raise SystemExit(f"prov.stamp: nothing at {rel(a)} to stamp")
    gen = os.path.abspath(generator) if generator else None
    rec = {
        "artefact": os.path.basename(a),
        "sha256": sha256(a),
        "generator": rel(gen) if gen else None,
        "generatorSha256": sha256(gen) if gen else None,
        "command": command if command is not None else " ".join(
            [os.path.basename(sys.argv[0])] + sys.argv[1:]),
        "writtenAt": datetime.datetime.now().astimezone().isoformat(timespec="seconds"),
        "params": params or {},
        "inputs": {rel(i): sha256(i) for i in (inputs or [])},
    }
    if adopted:
        # Say so plainly. An adopted record means provenance was RECONSTRUCTED from whatever was
        # on disk, not observed at generation time — it certifies "unchanged since adoption",
        # never "known to be correct".
        rec["adopted"] = True
    if extra:
        rec.update(extra)
    p = prov_path(a)
    os.makedirs(os.path.dirname(p), exist_ok=True)
    json.dump(rec, open(p, "w"), indent=1, sort_keys=True)
    return rec


def verdict(artefact: str) -> tuple[str, list[str]]:
    """Return (verdict, reasons). Reasons name the specific thing that moved."""
    a = os.path.abspath(artefact)
    rec = read(a)
    if rec is None:
        return UNKNOWN, ["no provenance record"]
    if not os.path.isfile(a):
        return MISSING, ["artefact is gone but its record remains"]
    if sha256(a) != rec.get("sha256"):
        return MODIFIED, ["the artefact changed since it was stamped "
                          "(overwritten or hand-edited without stamping)"]

    reasons = []
    for path, want in (rec.get("inputs") or {}).items():
        got = sha256(os.path.join(ROOT, path))
        if got is None:
            reasons.append(f"input missing: {path}")
        elif got != want:
            reasons.append(f"input changed: {path}")
    gen = rec.get("generator")
    if gen:
        got = sha256(os.path.join(ROOT, gen))
        if got is None:
            reasons.append(f"generator missing: {gen}")
        elif got != rec.get("generatorSha256"):
            reasons.append(f"generator changed: {gen}")
    return (STALE, reasons) if reasons else (FRESH, [])


def require_fresh(*artefacts: str, allow_stale: bool = False) -> None:
    """Refuse to build on something that cannot be shown to be current.

    A gate that blocks without saying how to unblock is hostile, so the refusal names what moved
    and prints the recorded command that would re-derive it.
    """
    bad = []
    for a in artefacts:
        v, why = verdict(a)
        if v != FRESH:
            rec = read(a) or {}
            cmd = rec.get("command") or ""
            # A record written from `python -c` or a REPL carries a command that cannot be run.
            # Falling back to the generator path is worth more than echoing "-c" at someone.
            if len(cmd) < 8 or cmd.startswith("-"):
                cmd = rec.get("generator") or ""
            bad.append((a, v, why, cmd))
    if not bad:
        return
    lines = []
    for a, v, why, cmd in bad:
        lines.append(f"  {v}  {rel(a)}")
        lines += [f"      - {w}" for w in why]
        if v == UNKNOWN:
            lines.append("      - re-derive it, or adopt it if it is a SOURCE: "
                         f"scripts/freshness.py adopt {rel(a)}")
        elif cmd:
            lines.append(f"      - re-derive with: {cmd}")
    msg = "refusing to build on artefacts that are not verifiably current:\n" + "\n".join(lines)
    if allow_stale:
        print("WARNING (--allow-stale): " + msg, file=sys.stderr)
        return
    raise SystemExit(msg + "\n  (override with --allow-stale if this is deliberate)")


def walk_records(root: str | None = None):
    """Yield every artefact path that carries a record. Walks `.prov/` directories ONLY, so the
    cost tracks what is stamped rather than repo size — the overworld's thousands of chunks are
    never touched."""
    base = root or ROOT
    skip = {".git", "node_modules", "dist", "ios", ".venv"}
    for dirpath, dirnames, _ in os.walk(base):
        dirnames[:] = [d for d in dirnames if d not in skip]
        if os.path.basename(dirpath) != ".prov":
            continue
        for name in sorted(os.listdir(dirpath)):
            if name.endswith(".json"):
                yield os.path.join(os.path.dirname(dirpath), name[:-5])
