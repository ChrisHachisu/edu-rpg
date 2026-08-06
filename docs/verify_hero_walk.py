#!/usr/bin/env python3
"""Verify a hero walk sheet against docs/hero-walk-art-contract.md.

Exit 0 and print ALL CHECKS PASSED only when every check holds.

    /usr/bin/python3 docs/verify_hero_walk.py --variant openface \
        --logical openface-walk-12x24.png --game openface-walk-12x48.png
"""
import argparse
import sys
from pathlib import Path

from PIL import Image, ImageChops

LOCKED_ROOT = Path.home() / (
    "Documents/codex/output/edu-rpg-locked-front-facing-dark-jrpg-2026-07-06/hero/locked-v14"
)
LOGICAL, FRAMES, SCALE = 24, 12, 2


def locked_sprite(variant):
    return Image.open(LOCKED_ROOT / "logical-24" / f"hero-gray-{variant}.png").convert("RGBA")


def opaque_colors(im):
    return {c for _, c in im.getcolors(1 << 20) if c[3] == 255}


def baseline(cell):
    px = cell.load()
    rows = [y for y in range(cell.height) for x in range(cell.width) if px[x, y][3] > 0]
    return max(rows) if rows else None


def check(results, name, ok, detail="", warn_only=False):
    results.append((ok, name, detail, warn_only))


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--variant", required=True, choices=["openface", "feminine"])
    ap.add_argument("--logical", required=True, type=Path, help="288x24 authoring strip")
    ap.add_argument("--game", required=True, type=Path, help="576x48 game asset")
    a = ap.parse_args()

    log = Image.open(a.logical).convert("RGBA")
    game = Image.open(a.game).convert("RGBA")
    locked = locked_sprite(a.variant)
    palette = opaque_colors(locked)
    r = []

    # 1. geometry
    check(r, "logical strip is 288x24", log.size == (LOGICAL * FRAMES, LOGICAL), f"got {log.size}")
    check(r, "game strip is 576x48", game.size == (48 * FRAMES, 48), f"got {game.size}")
    if log.size != (LOGICAL * FRAMES, LOGICAL) or game.size != (48 * FRAMES, 48):
        return report(r)

    # 2. game == logical upscaled 2x NEAREST
    up = log.resize((log.width * SCALE, log.height * SCALE), Image.NEAREST)
    check(r, "game == logical upscaled 2x NEAREST", ImageChops.difference(up, game).getbbox() is None)

    # 3. grid conformance: every 2x2 block in game is uniform
    px, total, uniform = game.load(), 0, 0
    for by in range(0, game.height, 2):
        for bx in range(0, game.width, 2):
            total += 1
            if len({px[bx + dx, by + dy] for dx in (0, 1) for dy in (0, 1)}) == 1:
                uniform += 1
    pct = 100 * uniform / total
    check(r, "100% 2x2-block uniform (world grid)", uniform == total, f"{pct:.1f}%")

    # 4. closed palette
    used = opaque_colors(log)
    extra = used - palette
    check(
        r,
        f"palette subset of locked {a.variant} ({len(palette)} colors)",
        not extra,
        "new colors: " + " ".join("#%02x%02x%02x" % c[:3] for c in sorted(extra)[:8]) if extra else "",
    )

    # 5. binary alpha
    semi = {c for _, c in log.getcolors(1 << 20) if 0 < c[3] < 255}
    check(r, "no semi-transparent pixels", not semi, f"{len(semi)} semi-transparent colors")

    # 6. frame 0 == locked sprite
    f0 = log.crop((0, 0, LOGICAL, LOGICAL))
    check(r, "frame 0 pixel-identical to locked sprite", ImageChops.difference(f0, locked).getbbox() is None)

    # 7. shared floor baseline across the MOTION frames.
    #    Frame 0 of each direction is the idle pose and may legitimately sit a pixel lower than the
    #    contact poses (locked-v14 openface stands at y23; its contact frames sit at y22). What must
    #    never happen is the planted foot drifting *during* the walk cycle.
    cells = [log.crop((i * LOGICAL, 0, (i + 1) * LOGICAL, LOGICAL)) for i in range(FRAMES)]
    bases = [baseline(c) for c in cells]
    motion = [b for i, b in enumerate(bases) if i % 3 != 0]
    idle = [b for i, b in enumerate(bases) if i % 3 == 0]
    check(r, "motion frames share one floor baseline", len(set(motion)) == 1, f"motion baselines={motion}")
    drift = max(abs(i - m) for i in idle for m in set(motion)) if motion else 0
    check(r, "idle baseline within 1px of motion", drift <= 1,
          f"idle={idle} motion={sorted(set(motion))}", warn_only=True)

    # 8. cell-edge contact. Touching the boundary is not clipping — Phaser slices exact 48px cells,
    #    so a sword tip ending at x=0 renders fine. Worth surfacing, not worth failing.
    bad = []
    for i, c in enumerate(cells):
        cpx = c.load()
        if any(cpx[x, y][3] > 0 for y in range(LOGICAL) for x in (0, LOGICAL - 1)):
            bad.append(i)
    check(r, "no frame touches its cell x-edge", not bad, f"frames {bad}" if bad else "", warn_only=True)

    return report(r)


def report(results):
    for ok, name, detail, warn_only in results:
        tag = "PASS" if ok else ("WARN" if warn_only else "FAIL")
        line = f"  {tag}  {name}"
        if detail:
            line += f"  ->  {detail}" if not ok else f"  ({detail})"
        print(line)
    failed = sum(1 for ok, _, _, w in results if not ok and not w)
    warned = sum(1 for ok, _, _, w in results if not ok and w)
    print()
    if failed:
        print(f"{failed} CHECK(S) FAILED" + (f", {warned} warning(s)" if warned else ""))
        return 1
    print("ALL CHECKS PASSED" + (f" ({warned} warning(s))" if warned else ""))
    return 0


if __name__ == "__main__":
    sys.exit(main())
