#!/usr/bin/env python3
"""Fetch exactly the glyphs the style board shows, as base64 @font-face blocks.

Google's css2 endpoint splits a Japanese family into 100+ unicode-range subsets, which is
useless for a single self-contained file. `text=` instead returns ONE woff2 carrying only the
characters asked for -- a few kB per weight -- so the board renders identically offline, on this
machine and on the owner's, with no CDN and no network at view time.
"""
import base64, json, re, sys, urllib.parse, urllib.request

UA = ("Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 "
      "(KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36")

# Every character the board can render, EN + JA. Kept in one place so a copy edit that adds a
# glyph fails loudly (tofu) rather than silently falling back to the system font.
SAMPLE = (
    "Quest of Knowledge"
    "ちしきのぼうけん まなびのRPG"
    "Lv HP 5 40/48/60 16 + 20 = ? 36 37 26 46"
    "NESW"
    "Status Items Equip Settings"
    "ステータス どうぐ そうび せってい"
    "A riddle of knowledge! Answer to strike."
    "ちしきのなぞなぞ！こたえてこうげき"
    "Shadow Wolf Aria"
    "かげおおかみ アリア"
    "Port Sapphire  サファイア港"
    "Continue New Game つづきから はじめから"
    "ABCD·×"
    "0123456789"
    "abcdefghijklmnopqrstuvwxyz"
    "ABCDEFGHIJKLMNOPQRSTUVWXYZ"
    ".,:;!?'\"()[]{}/-—…%"
)

FAMILIES = [
    ("M PLUS Rounded 1c", [500, 800]),
    ("Zen Maru Gothic", [500, 700, 900]),
    ("Zen Kaku Gothic New", [400, 700, 900]),
    ("Shippori Mincho", [500, 700, 800]),
    ("Klee One", [400, 600]),
]


def fetch(url: str) -> bytes:
    req = urllib.request.Request(url, headers={"User-Agent": UA})
    with urllib.request.urlopen(req, timeout=45) as r:
        return r.read()


def main() -> int:
    text = urllib.parse.quote("".join(sorted(set(SAMPLE))))
    out = []
    for family, weights in FAMILIES:
        fam = family.replace(" ", "+")
        for w in weights:
            css = fetch(
                f"https://fonts.googleapis.com/css2?family={fam}:wght@{w}"
                f"&text={text}&display=block"
            ).decode("utf-8")
            # A `text=`-subsetted response serves from /l/font?kit=..., with no .woff2 suffix.
            urls = re.findall(r"url\((https://[^)]+)\)\s*format\('woff2'\)", css)
            if len(urls) != 1:
                print(f"WARN {family} {w}: expected 1 subset, got {len(urls)}", file=sys.stderr)
            if not urls:
                return 1
            blob = fetch(urls[0])
            b64 = base64.b64encode(blob).decode("ascii")
            out.append(
                f"@font-face{{font-family:'{family}';font-style:normal;font-weight:{w};"
                f"font-display:block;src:url(data:font/woff2;base64,{b64}) format('woff2');}}"
            )
            print(f"  {family} {w}: {len(blob)} B", file=sys.stderr)
    open(sys.argv[1], "w", encoding="utf-8").write("\n".join(out) + "\n")
    print(f"WROTE {sys.argv[1]}", file=sys.stderr)
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
