#!/usr/bin/env python3
"""Day 4 census finish: PNG captures -> JPEG q85 under shots/<group>/ + index.json (one row per image
{id, group, place, floor, lang, what, path}) + contact sheets for the reviewers.
   python3 scripts/auto/census/finish4.py [src=/home/user/work/d4/c/out] [dst=/mnt/project-files/edu-rpg/autoloop/day4/census/]
Groups: ui, towns, overworld, dungeons, battles. A re-capture replaces the older row (last line of index.jsonl wins)."""
import sys, os, json, shutil, re, datetime
from PIL import Image, ImageDraw
src = sys.argv[1] if len(sys.argv) > 1 else '/home/user/work/d4/c/out'
dst = sys.argv[2] if len(sys.argv) > 2 else '/mnt/project-files/edu-rpg/autoloop/day4/census/'
stage = '/home/user/work/d4/c/stage'           # local copy first; the network mount only receives finished files
rows = {}
with open(os.path.join(src, 'index.jsonl')) as f:
    for line in f:
        line = line.strip()
        if not line: continue
        r = json.loads(line); rows[r['file']] = r

def group_of(name, r):
    if name.startswith('battle-'): return 'battles'
    if name.startswith(('ui-', 'quiz-')): return 'ui'
    if name.startswith(('town-',)): return 'towns'
    if name.startswith('ow-gate-'): return 'towns'
    if name.startswith(('mech-', 'dungeon-')): return 'dungeons'
    if name.startswith(('ow-', 'isle-')): return 'overworld'
    return r.get('area') or 'other'

def place_of(name, r):
    for k in ('town', 'dungeon'):
        if r.get(k): return r[k]
    if r.get('place'): return r['place']
    m = re.match(r'ow-gate-(\w+)', name)
    if m: return m.group(1)
    m = re.match(r'ow-mouth-(\w+)', name)
    if m: return m.group(1)
    m = re.match(r'ow-(act\d|border[\w-]*|windgate[\w-]*|isle-\w+)', name)
    if m: return m.group(1)
    st = r.get('state') or {}
    return st.get('map') or r.get('area') or ''

unreached = {}
try:
    with open(os.path.join(src, 'towns-npc-report.jsonl')) as f:
        for line in f:
            line = line.strip()
            if not line: continue
            t = json.loads(line)
            for n in t.get('npcs', []):
                if n.get('walk') != 'arrived' or n.get('near') != n.get('id'): unreached[f"town-{t['id']}-npc-{n['id']}"] = n.get('walk')
except Exception as e: print('no npc report', e)
out, broken = [], []
for name, r in sorted(rows.items()):
    stem = name[:-4]
    png = os.path.join(src, stem + '.png')
    if not os.path.exists(png): continue
    g = group_of(name, r)
    jdir = os.path.join(stage, 'shots', g); os.makedirs(jdir, exist_ok=True)
    jpg = os.path.join(jdir, name)
    if not os.path.exists(jpg) or os.path.getmtime(jpg) < os.path.getmtime(png):
        Image.open(png).convert('RGB').save(jpg, quality=85, optimize=True)
    st = r.get('state') or {}
    floor = r.get('floor') if r.get('floor') is not None else (st.get('floor') if st.get('map') not in (None, 'overworld') else None)
    row = {'id': stem, 'group': g, 'place': place_of(name, r), 'floor': floor, 'lang': r.get('lang') or 'en',
           'what': r.get('shows', ''), 'path': f'shots/{g}/{name}', 'act': r.get('act'), 'how': r.get('how', '')}
    if stem in unreached or any(stem.startswith(k + '-') for k in unreached):
        k = stem if stem in unreached else next(k for k in unreached if stem.startswith(k + '-'))
        row['unreached'] = True; row['what'] += f" [NOT REACHED: the town walker returned '{unreached[k]}' for this person, so the Talk button is not showing for them and the hero stands elsewhere]"
    if r.get('flatFrame'): row['flatFrame'] = True; broken.append(stem)
    for k in ('mechanic', 'element', 'role'):
        if r.get(k): row[k] = r[k]
    out.append(row)
counts = {}
for r in out: counts[r['group']] = counts.get(r['group'], 0) + 1
idx = {'generated': datetime.datetime.now().isoformat(timespec='seconds'), 'tree': 'http://127.0.0.1:5560/ (/home/user/work/h3/dist)', 'viewport': '390x844 CSS px, deviceScaleFactor 2 (780x1688 JPEG q85)',
       'count': len(out), 'counts': counts, 'flatFrames': broken, 'images': out}
os.makedirs(stage, exist_ok=True)
with open(os.path.join(stage, 'index.json'), 'w') as f: json.dump(idx, f, indent=1, ensure_ascii=False)

# contact sheets: 8 thumbnails per sheet, id under each, per group in index order
sdir = os.path.join(stage, 'sheets'); os.makedirs(sdir, exist_ok=True)
for g in counts:
    items = [r for r in out if r['group'] == g]
    for s in range(0, len(items), 8):
        part = items[s:s + 8]
        W, H, cap = 195, 422, 26
        sheet = Image.new('RGB', (W * 4, (H + cap) * 2), (20, 20, 24)); d = ImageDraw.Draw(sheet)
        for i, r in enumerate(part):
            im = Image.open(os.path.join(stage, r['path'])).resize((W, H))
            x, y = (i % 4) * W, (i // 4) * (H + cap)
            sheet.paste(im, (x, y)); d.text((x + 3, y + H + 4), r['id'][:34], fill=(230, 230, 230))
        sheet.save(os.path.join(sdir, f'{g}-{s // 8 + 1:03d}.jpg'), quality=80)
print('images', len(out), counts, 'flat', len(broken))
if dst != 'none':
    os.makedirs(dst, exist_ok=True)
    for root, _, files in os.walk(stage):
        rel = os.path.relpath(root, stage); td = os.path.join(dst, rel) if rel != '.' else dst; os.makedirs(td, exist_ok=True)
        for fn in files:
            a, b = os.path.join(root, fn), os.path.join(td, fn)
            if not os.path.exists(b) or os.path.getmtime(b) < os.path.getmtime(a) or os.path.getsize(b) != os.path.getsize(a): shutil.copyfile(a, b)
    print('copied to', dst)
