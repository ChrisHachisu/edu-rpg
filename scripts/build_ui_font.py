#!/usr/bin/env python3
"""Subset Zen Maru Gothic into the two woff2 files the game ships.

WHY THIS EXISTS
    The UI font never reached the phone. `ui-overhaul.css` pulled M PLUS Rounded 1c from
    fonts.googleapis.com with an @import, nothing was ever written to `dist/fonts/`, and the
    Capacitor app has no network -- so every menu, every battle and the whole title screen fell
    back to system-ui on device. The 2026-06-29 handoff listed "bundle the woff2 offline" as a
    remaining item and it stayed open. Meanwhile #qok-field-hud was hard-coded to -apple-system
    and never asked for the game font at all, so the shipped app showed three different faces.

WHY NOT JUST COPY GOOGLE'S FILES
    The css2 endpoint splits a Japanese family into 122 unicode-range subsets PER WEIGHT. Every
    file under dist/ is a registered runtime file in this repo (scripts/runtime_baseline.py), so
    that route would mean registering ~250 assets to ship one typeface. Subsetting to what the
    game actually renders gives two files instead.

COVERAGE, AND WHY IT IS DRAWN THIS WIDE
    The floor is measured, not guessed: every non-ASCII character in the shipped bundle and the
    override layers -- 753 kanji, 145 kana. But the player types their own name, and a name is
    exactly where a fallback face is most obvious, so the kanji set is widened to the 2,136
    joyo characters plus everything the game already uses. Anything outside that still renders,
    in the system face, which is what happens for 100% of text today.

    Zen Maru Gothic is OFL-1.1; ofl/zenmarugothic/OFL.txt ships beside the fonts as that
    licence requires.

    python3 scripts/build_ui_font.py --src <dir-with-ttfs>
"""
from __future__ import annotations

import argparse
import pathlib
import sys
import unicodedata

ROOT = pathlib.Path(__file__).resolve().parents[1]
OUT = ROOT / "public" / "fonts"

# 500 carries body copy, 700 every heading, button and number. 900 was dropped: it earned one
# element (the title wordmark) and cost another 1.2 MB, and 700 at that size is indistinguishable
# behind the title's own text-shadow.
WEIGHTS = [("ZenMaruGothic-Medium.ttf", 500), ("ZenMaruGothic-Bold.ttf", 700)]

# Files the game's text actually lives in. Nothing here is optional -- if a string can reach the
# screen, its glyphs have to be in the subset.
TEXT_SOURCES = [
    "dist/assets/index-BhoGQRaA.js",
    "public/ui-overhaul.js",
    "public/dq-tiles.js",
    "public/act1-world-map.js",
    "index.html",
]

# Latin, digits, punctuation, kana, CJK punctuation, fullwidth forms, and the arrows/symbols the
# HUD draws. Ranges rather than characters because these are cheap and total coverage matters.
BASE_RANGES = [
    (0x0020, 0x007E),  # ASCII
    (0x00A0, 0x00FF),  # Latin-1 supplement
    (0x2010, 0x205E),  # general punctuation: dashes, quotes, ellipsis, middle dot
    (0x2190, 0x21FF),  # arrows
    (0x2460, 0x24FF),  # enclosed alphanumerics
    (0x25A0, 0x25FF),  # geometric shapes (the HUD's map icon)
    (0x2600, 0x26FF),  # misc symbols
    (0x3000, 0x303F),  # CJK punctuation
    (0x3040, 0x309F),  # hiragana
    (0x30A0, 0x30FF),  # katakana
    (0x31F0, 0x31FF),  # katakana phonetic extensions
    (0xFF00, 0xFFEF),  # halfwidth and fullwidth forms
]


def shipped_characters() -> set[str]:
    chars: set[str] = set()
    for name in TEXT_SOURCES:
        path = ROOT / name
        if not path.is_file():
            sys.exit(f"text source missing: {name}")
        chars |= set(path.read_text(encoding="utf-8", errors="replace"))
    return chars


def joyo(font_chars: set[str]) -> set[str]:
    """The joyo kanji, approximated by what the font itself draws in the CJK block.

    There is no joyo list in the standard library and adding a 2,136-entry table to this repo to
    save ~0.4 MB is a poor trade. Taking the font's own CJK Unified Ideographs coverage is a
    superset: Zen Maru Gothic ships a bit over 6,000, which is Adobe-Japan1-3 territory -- kanji
    a Japanese reader will actually meet -- not the 20,000+ of the full block.
    """
    return {c for c in font_chars if "一" <= c <= "鿿"}


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("--src", required=True, type=pathlib.Path,
                    help="directory holding the ZenMaruGothic-*.ttf files and OFL.txt")
    ap.add_argument("--full-cjk", action="store_true",
                    help="keep every CJK ideograph the font has (bigger; the default already does)")
    args = ap.parse_args()

    try:
        from fontTools import subset  # noqa: F401
        from fontTools.ttLib import TTFont
    except ImportError:
        sys.exit("fonttools is required: python3 -m pip install fonttools brotli")

    OUT.mkdir(parents=True, exist_ok=True)
    used = shipped_characters()
    measured_kanji = {c for c in used if "一" <= c <= "鿿"}

    for filename, weight in WEIGHTS:
        src = args.src / filename
        if not src.is_file():
            sys.exit(f"missing source font: {src}")

        font = TTFont(src)
        have = {chr(cp) for cp in font.getBestCmap()}
        font.close()

        wanted = {c for c in used if c in have}
        for lo, hi in BASE_RANGES:
            wanted |= {chr(cp) for cp in range(lo, hi + 1) if chr(cp) in have}
        wanted |= joyo(have)
        wanted = {c for c in wanted if unicodedata.category(c) != "Cc"}

        dest = OUT / f"zen-maru-gothic-{weight}.woff2"
        opts = subset.Options()
        opts.flavor = "woff2"
        opts.desubroutinize = True
        opts.layout_features = ["*"]          # keep vertical/kerning features intact
        opts.notdef_outline = True
        opts.recalc_bounds = True
        font = subset.load_font(str(src), opts)
        subsetter = subset.Subsetter(options=opts)
        subsetter.populate(text="".join(sorted(wanted)))
        subsetter.subset(font)
        subset.save_font(font, str(dest), opts)
        font.close()

        print(f"  {dest.relative_to(ROOT)}  {dest.stat().st_size:,} B  "
              f"({len(wanted):,} glyphs)")

    licence = args.src / "OFL.txt"
    if licence.is_file():
        (OUT / "OFL.txt").write_bytes(licence.read_bytes())
        print(f"  {(OUT / 'OFL.txt').relative_to(ROOT)}  (OFL-1.1, required beside the fonts)")

    print(f"measured from shipped text: {len(measured_kanji):,} kanji, "
          f"{len([c for c in used if '぀' <= c <= 'ヿ']):,} kana")
    print("NEXT: copy public/fonts/ -> dist/fonts/, register the new runtime files, "
          "then python3 scripts/regenerate_pins.py")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
