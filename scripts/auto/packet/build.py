#!/usr/bin/env python3
"""Build a weekly packet page from its source.
  python3 scripts/auto/packet/build.py docs/packets/<date>.json <out dir>
Writes <out dir>/index.html and <out dir>/img/*.jpg (publish the folder as an artifact; the page
declares the `db` capability so Chris's taps are saved in collection <packet id>).
An image entry in the source is {"from": <path>, "cap": ..., "crop": [x0, y0, x1, y1] (fractions, optional)};
the build writes a 640 px wide copy (and the uncropped one for the enlarge view) and replaces "from" by "src"/"full"."""
import json, os, sys, hashlib
from PIL import Image

src, out = sys.argv[1], sys.argv[2]
here = os.path.dirname(os.path.abspath(__file__))
P = json.load(open(src, encoding='utf-8'))
os.makedirs(os.path.join(out, 'img'), exist_ok=True)

def put(im, name, width):
    if im.width > width:
        im = im.resize((width, round(im.height * width / im.width)), Image.LANCZOS)
    im.convert('RGB').save(os.path.join(out, 'img', name), quality=80, optimize=True)
    return im.size

def image(e):
    path = os.path.expanduser(e.pop('from'))
    im = Image.open(path)
    key = hashlib.sha1((path + json.dumps(e.get('crop'))).encode()).hexdigest()[:10]
    full = 'f-' + key + '.jpg'; put(im, full, 780); e['full'] = 'img/' + full
    c = e.pop('crop', None)
    if c:
        im = im.crop((round(c[0] * im.width), round(c[1] * im.height), round(c[2] * im.width), round(c[3] * im.height)))
    small = 's-' + key + '.jpg'; e['w'], e['h'] = put(im, small, 640); e['src'] = 'img/' + small

for group in ('choices', 'decided'):
    for item in P[group]:
        for e in item.get('images', []):
            image(e)
ids = [x['id'] for g in ('choices', 'decided') for x in P[g]] + [x['id'] for x in P['play']['stops']]
assert len(ids) == len(set(ids)), 'duplicate item id'
for c in P['choices']:
    assert c['keeps'] in [o['id'] for o in c['options']], c['id']
html = open(os.path.join(here, 'template.html'), encoding='utf-8').read()
data = json.dumps(P, ensure_ascii=False).replace('<', '\\u003c')
html = html.replace('__TITLE__', P['pageTitle']).replace('__DATA__', data)
open(os.path.join(out, 'index.html'), 'w', encoding='utf-8').write(html)
print('wrote', os.path.join(out, 'index.html'), len(html), 'bytes;', len(os.listdir(os.path.join(out, 'img'))), 'images')
