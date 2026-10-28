#!/usr/bin/env python3
"""Re-derive Acts 2-5 dungeon floors/boss/mechanic from the PRESERVED shipped bundle and fail if
specs.py drifted from it. The bundle, not src/data/maps.ts, is what the game runs.

    python3 scripts/acts/dungeons/bundle_dungeons.py [--bundle PATH]
"""
import argparse, os, re, sys
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from specs import SPECS  # noqa: E402

ROOT = os.path.dirname(os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__)))))
DEFAULT = os.path.join(ROOT, "runtime/baselines/v1.17.1-ipad-hud-walk/assets/index-BhoGQRaA.js")


def bundle_defs(path):
    s = open(path, encoding="utf-8", errors="replace").read()
    out = {}
    for m in re.finditer(r'\n\s*(\w+): \{\n\s*id: "\1",\n\s*nameKey: "map\.\1",\n\s*type: "dungeon"', s):
        seg = s[m.start():m.start() + 1600]
        seg = seg[:seg.find('\n        },')]
        g = lambda k, pat: (re.search(pat, seg).group(1) if re.search(pat, seg) else None)
        out[m.group(1)] = {"floors": int(g("f", r'floors: (\d+)')),
                           "boss": g("b", r'bossId: "(\w+)"'),
                           "mechanic": g("m", r'mechanic: "([\w-]+)"'),
                           "tileTheme": g("t", r'tileTheme: "(\w+)"'),
                           "entrances": len(re.findall(r'targetMap: "overworld"', seg))}
    return out


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--bundle", default=DEFAULT)
    a = ap.parse_args()
    defs = bundle_defs(a.bundle)
    bad = 0
    for s in SPECS:
        d = defs.get(s["id"])
        if d is None:
            print(f"MISSING in bundle: {s['id']}"); bad += 1; continue
        diffs = [k for k in ("floors", "boss") if d[k] != s[k]]
        if (d["mechanic"] or None) != s.get("mechanic"):
            diffs.append("mechanic")
        print(f"{s['id']:22s} floors {d['floors']} boss {d['boss']:20s} mech {d['mechanic'] or '-':15s}"
              f" tileTheme {d['tileTheme'] or '-':8s} overworld-links {d['entrances']}"
              f"  {'OK' if not diffs else 'DRIFT ' + ','.join(diffs)}")
        bad += bool(diffs)
    sys.exit(1 if bad else 0)


if __name__ == "__main__":
    main()
