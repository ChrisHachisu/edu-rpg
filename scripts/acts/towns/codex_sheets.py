"""Act contact sheets + 3-try comparison sheets for the Codex town plates."""
import json, os
from PIL import Image, ImageDraw, ImageFont
SCR = '/tmp/claude-0/-home-claude/c446ac0c-2689-576d-8fff-6176ff6d9aad/scratchpad'
SRC = f'{SCR}/acts/codex-towns'
RT = f'{SCR}/acts/towns/runtime-codex/town'
OUT = '/mnt/project-files/edu-rpg/acts-preview/towns-codex'
PICKS = dict(ironkeep=3, frostwatch=3, hauntedVillage=2, oasisHaven=3, ruinsCamp=3,
             embersRest=3, cinderwatch=3, lastBastion=2, havensEdge=3)
ACTS = {2: ['ironkeep', 'frostwatch', 'hauntedVillage'], 3: ['oasisHaven', 'ruinsCamp'],
        4: ['embersRest', 'cinderwatch'], 5: ['lastBastion', 'havensEdge']}
try:
    F = ImageFont.truetype('/usr/share/fonts/truetype/dejavu/DejaVuSans-Bold.ttf', 22)
    FS = ImageFont.truetype('/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf', 17)
except OSError:
    F = FS = ImageFont.load_default()
T = 900

def save(im, p):
    im.save(p, optimize=True)
    if os.path.getsize(p) > 4e6:
        im.convert('RGB').quantize(256).save(p, optimize=True)

def tries(tid):
    ims = []
    for n in (1, 2, 3):
        im = Image.open(f'{SRC}/town-{tid}/town-{tid}-try{n}.png').convert('RGB').resize((T, T), Image.LANCZOS)
        c = Image.new('RGB', (T, T + 40), (24, 24, 28)); c.paste(im, (0, 40))
        d = ImageDraw.Draw(c); pick = n == PICKS[tid]
        d.text((10, 8), f'{tid} try{n}' + ('  [PICK]' if pick else ''), font=F, fill=(255, 220, 90) if pick else (220, 220, 220))
        if pick: d.rectangle([0, 40, T - 1, T + 39], outline=(255, 200, 40), width=8)
        ims.append(c)
    sheet = Image.new('RGB', (3 * T + 40, T + 60), (16, 16, 18))
    for i, c in enumerate(ims): sheet.paste(c, (10 + i * (T + 10), 10))
    save(sheet, f'{OUT}/{tid}-tries.png')

def act(a):
    ids = ACTS[a]; W = 1000
    sheet = Image.new('RGB', (len(ids) * (W + 10) + 10, W + 150), (16, 16, 18))
    for i, tid in enumerate(ids):
        ov = Image.open(f'{OUT}/{tid}-overlay.png').convert('RGB').resize((W, W), Image.LANCZOS)
        x = 10 + i * (W + 10); sheet.paste(ov, (x, 140))
        tj = json.load(open(f'{RT}/{tid}-town.json'))
        rep = tj.get('_placementReport', []); val = tj.get('_validator', '')
        big = [f"{r['id']} {r['moved']}" for r in rep if r.get('moved', 0) > 1]
        d = ImageDraw.Draw(sheet)
        d.text((x, 10), f'Act {a} - {tid} (try{PICKS[tid]})', font=F, fill=(255, 220, 90))
        d.text((x, 42), f'validator: {str(val)[:60]}', font=FS, fill=(210, 210, 210))
        txt = 'moves>1 cell: ' + ', '.join(big)
        for j in range(0, min(len(txt), 300), 100):
            d.text((x, 66 + j // 100 * 22), txt[j:j + 100], font=FS, fill=(210, 210, 210))
    save(sheet, f'{OUT}/act{a}-towns.png')

if __name__ == '__main__':
    for t in PICKS: tries(t)
    for a in ACTS: act(a)
