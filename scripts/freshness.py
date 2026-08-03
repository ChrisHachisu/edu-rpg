#!/usr/bin/env python3
"""Is what is on disk actually current, and do our documents point at things that exist?

Spec: docs/superpowers/specs/2026-08-01-artefact-provenance-design.md

    freshness.py verify [PATH ...]   provenance verdicts; exit 1 if anything is not FRESH
    freshness.py verify --brief      one-line summary, for the session-start protocol
    freshness.py refs                markdown citations that do not resolve
    freshness.py index               generated status table (nothing hand-written to rot)
    freshness.py adopt PATH ...      record a SOURCE as-is; never use on a derived artefact
"""
from __future__ import annotations

import argparse
import os
import re
import sys

import prov
from prov import FRESH, MISSING, MODIFIED, STALE, UNKNOWN

ROOT = prov.ROOT

# A citation is only flagged if it looks like a real repo path: it must start with one of these,
# and carry an extension or a trailing slash. Loose matching fires on ordinary prose, and a
# checker that cries wolf gets ignored — which is how the dangling citation survived 11 days.
TOP = ("src/", "scripts/", "design/", "docs/", "public/", "dist/", "ios/", ".relay/", "runtime/",
       # Much of this repo's documentation was copied from the sibling `edu-rpg` checkout and kept
       # citations to files that only ever existed THERE — that is how ART-DIRECTION.md pointed at
       # a missing DUNGEON-ASSET-PROMPTS.md for 11 days. Cross-repo citations are written with the
       # `edu-rpg/` prefix and resolved against the parent directory, so they are checked rather
       # than quietly skipped.
       "edu-rpg/")
PATH_RE = re.compile(r"(?<![\w./-])((?:" + "|".join(re.escape(t) for t in TOP) +
                     r")[\w./+-]*[\w/])")
FENCE_RE = re.compile(r"```.*?```", re.S)


def _iter_markdown():
    skip = {".git", "node_modules", "dist", "ios", ".venv", "07-Archive"}
    for dirpath, dirnames, filenames in os.walk(ROOT):
        dirnames[:] = [d for d in dirnames if d not in skip and not d.startswith(".prov")]
        rel = os.path.relpath(dirpath, ROOT)
        if rel != "." and not rel.startswith(("docs", "design")):
            continue
        for f in filenames:
            if f.endswith(".md"):
                yield os.path.join(dirpath, f)


def cmd_refs(args) -> int:
    dangling = []
    for md in sorted(_iter_markdown()):
        text = open(md, encoding="utf-8", errors="replace").read()
        # Fenced blocks are illustrative (prompt text, JSON samples) and routinely name paths
        # that are meant as examples, so they are not citations.
        text = FENCE_RE.sub("", text)
        for i, line in enumerate(text.splitlines(), 1):
            for m in PATH_RE.finditer(line):
                p = m.group(1).rstrip(".,;:)`\"'")
                if not (os.path.splitext(p)[1] or p.endswith("/")):
                    continue
                # Globs, and paths a writer elided rather than wrote: `a/.../b`, `a/…/b`, `<id>`.
                if "*" in p or "…" in p or "<" in p or "/..." in p:
                    continue
                base = os.path.dirname(ROOT) if p.startswith("edu-rpg/") else ROOT
                if os.path.exists(os.path.join(base, p)):
                    continue
                dangling.append((os.path.relpath(md, ROOT), i, p))
    for f, i, p in dangling:
        print(f"DANGLING  {f}:{i}  ->  {p}")
    print(f"\n{len(dangling)} dangling reference(s)")
    return 1 if dangling else 0


ARTEFACT_EXT = (".png", ".webp", ".jpg", ".json")


def _expand(paths):
    """A directory argument means "every artefact in here", INCLUDING files with no record.

    Walking `.prov/` alone can only ever find things that were already stamped, so it reports
    green while every unstamped artefact stays invisible — the same shape of blind spot this
    tool exists to remove. Pointing it at a directory is how you ask the honest question.
    """
    out = []
    for p in paths:
        if not os.path.isdir(p):
            out.append(p)
            continue
        for dirpath, dirnames, filenames in os.walk(p):
            dirnames[:] = [d for d in dirnames if d != ".prov"]
            out += [os.path.join(dirpath, f) for f in filenames
                    if f.endswith(ARTEFACT_EXT) and not f.endswith(".prev")]
    return sorted(set(out))


def _verdicts(paths):
    targets = _expand(paths) if paths else sorted(prov.walk_records())
    return [(p, *prov.verdict(p)) for p in targets]


def cmd_verify(args) -> int:
    rows = _verdicts(args.paths)
    counts = {}
    for _, v, _r in rows:
        counts[v] = counts.get(v, 0) + 1
    bad = sum(counts.get(k, 0) for k in (STALE, MODIFIED, MISSING, UNKNOWN))

    if args.brief:
        if not rows:
            print("provenance: nothing stamped yet")
            return 0
        summary = "  ".join(f"{k}={counts[k]}" for k in
                            (FRESH, STALE, MODIFIED, MISSING, UNKNOWN) if k in counts)
        print(f"provenance: {summary}")
        return 1 if bad else 0

    if not rows:
        print("nothing stamped yet — run `freshness.py adopt` on sources, or re-derive outputs")
        return 0
    for p, v, why in rows:
        if v == FRESH and not args.all:
            continue
        print(f"{v:9} {prov.rel(p)}")
        for w in why:
            print(f"          - {w}")
    print()
    print("  ".join(f"{k}={counts[k]}" for k in
                    (FRESH, STALE, MODIFIED, MISSING, UNKNOWN) if k in counts))
    return 1 if bad else 0


def cmd_index(args) -> int:
    rows = _verdicts(None)
    if not rows:
        print("nothing stamped yet")
        return 0
    w = max(len(prov.rel(p)) for p, _, _ in rows)
    print(f"{'artefact':{w}}  {'verdict':9}  written              source")
    for p, v, _why in sorted(rows, key=lambda r: prov.rel(r[0])):
        rec = prov.read(p) or {}
        tag = "adopted" if rec.get("adopted") else (rec.get("generator") or "")
        print(f"{prov.rel(p):{w}}  {v:9}  {rec.get('writtenAt', '')[:19]:19}  {tag}")
    return 0


def cmd_adopt(args) -> int:
    for p in args.paths:
        if not os.path.isfile(p):
            print(f"skip (not a file): {p}", file=sys.stderr)
            continue
        prov.stamp(p, inputs=[], params={}, generator=None,
                   command=f"adopted as a source on {os.path.basename(sys.argv[0])}",
                   adopted=True)
        print(f"adopted  {prov.rel(p)}")
    print("\nadopted records certify UNCHANGED-SINCE-ADOPTION, never known-correct.")
    return 0


def main() -> int:
    ap = argparse.ArgumentParser(description=__doc__,
                                 formatter_class=argparse.RawDescriptionHelpFormatter)
    sub = ap.add_subparsers(dest="cmd", required=True)

    v = sub.add_parser("verify")
    v.add_argument("paths", nargs="*")
    v.add_argument("--brief", action="store_true", help="one line, for the session protocol")
    v.add_argument("--all", action="store_true", help="list FRESH artefacts too")
    v.set_defaults(fn=cmd_verify)

    sub.add_parser("refs").set_defaults(fn=cmd_refs)
    sub.add_parser("index").set_defaults(fn=cmd_index)

    a = sub.add_parser("adopt")
    a.add_argument("paths", nargs="+")
    a.set_defaults(fn=cmd_adopt)

    args = ap.parse_args()
    return args.fn(args)


if __name__ == "__main__":
    sys.exit(main())
