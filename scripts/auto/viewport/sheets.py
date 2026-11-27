#!/usr/bin/env python3
"""Contact sheets for the screen size matrix: one sheet per screen, every size side by side.
  python3 scripts/auto/viewport/sheets.py <shots dir> <sheets dir> [row height, default 430]
Reads <size>-<lang>-<screen>.jpg as written by capture.cjs. Writes <screen>-en.jpg (eight sizes: six
portrait in the first row, the two landscape iPads in the second) and <screen>-ja.jpg (kana and kanji
on iPhone SE, iPhone 13 and iPad). A missing picture is drawn as a grey box that says so."""
import os, sys, re
from PIL import Image, ImageDraw, ImageFont
SH, OUT = sys.argv[1], sys.argv[2]
RH = int(sys.argv[3]) if len(sys.argv) > 3 else 430
SIZES = [('se', 'iPhone SE 375x667', 375, 667), ('i13', 'iPhone 13 390x844', 390, 844), ('promax', 'Pro Max 430x932', 430, 932), ('mini', 'iPad mini 744x1133', 744, 1133),
         ('ipad', 'iPad 820x1180', 820, 1180), ('pro', 'iPad Pro 1024x1366', 1024, 1366), ('ipadL', 'iPad landscape 1180x820', 1180, 820), ('proL', 'iPad Pro landscape 1366x1024', 1366, 1024)]
DIM = {s[0]: s for s in SIZES}
os.makedirs(OUT, exist_ok=True)
try: FONT = ImageFont.truetype('/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf', 13)
except Exception: FONT = ImageFont.load_default()
files = [f for f in os.listdir(SH) if f.endswith('.jpg') and '-ERR-' not in f]
screens = {}
for f in files:
    m = re.match(r'^(se|i13|promax|mini|ipadL|ipad|proL|pro)-(en|ja-kana|ja-kanji)-(.+)\.jpg$', f)
    if m: screens.setdefault(m.group(3), {})[(m.group(1), m.group(2))] = f
def cell(sid, lang, scr, h):
    _, label, w, hh = DIM[sid]; cw = round(w * h / hh)
    c = Image.new('RGB', (cw, h + 18), (255, 255, 255)); d = ImageDraw.Draw(c)
    f = screens[scr].get((sid, lang))
    if f:
        im = Image.open(os.path.join(SH, f)).convert('RGB').resize((cw, h), Image.LANCZOS); c.paste(im, (0, 18))
    else:
        d.rectangle([0, 18, cw - 1, h + 17], fill=(170, 170, 170)); d.text((6, 30), 'not reached', fill=(0, 0, 0), font=FONT)
    d.text((2, 2), (label if lang == 'en' else label.split(' ')[0] + ' ' + label.split(' ')[1] + ' ' + lang[3:])[:max(8, cw // 7)], fill=(0, 0, 0), font=FONT)
    return c
def row(cells, gap=8):
    w = sum(c.width for c in cells) + gap * (len(cells) - 1); h = max(c.height for c in cells)
    r = Image.new('RGB', (w, h), (255, 255, 255)); x = 0
    for c in cells: r.paste(c, (x, 0)); x += c.width + gap
    return r
def stack(rows, gap=10):
    w = max(r.width for r in rows); h = sum(r.height for r in rows) + gap * (len(rows) - 1)
    s = Image.new('RGB', (w, h), (255, 255, 255)); y = 0
    for r in rows: s.paste(r, (0, y)); y += r.height + gap
    return s
n = 0
for scr in sorted(screens):
    have = screens[scr]
    if any(l == 'en' for _, l in have):
        s = stack([row([cell(i, 'en', scr, RH) for i in ['se', 'i13', 'promax', 'mini', 'ipad', 'pro']]), row([cell(i, 'en', scr, RH) for i in ['ipadL', 'proL']])])
        s.save(os.path.join(OUT, scr + '-en.jpg'), quality=82); n += 1
    if any(l != 'en' for _, l in have):
        s = row([cell(i, l, scr, RH + 90) for i in ['se', 'i13', 'ipad'] for l in ['ja-kana', 'ja-kanji']])
        s.save(os.path.join(OUT, scr + '-ja.jpg'), quality=82); n += 1
print('sheets', n, 'screens', len(screens))
