#!/usr/bin/env python3
"""Build the Codex package for terrain-carved dungeon entrances (owner 2026-10-28):
  /mnt/project-files/edu-rpg/codex-gen/entrances/{briefs,anchors,out}, jobs.json, run.sh (written separately)

Every dungeon mouth that sits in rock or forest gets one job. Its anchors are crops of the ACTUAL paint
around that spot (act render chunks, no landmark sprite; Act 1 from its shipped chunks), so Codex carves
the mouth into that exact cliff / forest paint instead of placing a sprite on top of it.

  ACTS_VARIANT=C python3 scripts/acts/entrances_pkg.py
"""
import os, sys, json, glob
import numpy as np
from PIL import Image, ImageDraw
HERE = os.path.dirname(os.path.abspath(__file__)); sys.path.insert(0, HERE)
import acts_common as A
Image.MAX_IMAGE_PIXELS = None
P = 32
PKG = os.environ.get('ENTRANCES_PKG', '/mnt/project-files/edu-rpg/codex-gen/entrances')
CODEX_ANCHORS = '/mnt/project-files/edu-rpg/codex-gen/anchors'
CTX = (7, 9, 7, 4)          # context crop around the door cell (left, up, right, down) in cells -> 15 x 14
EDIT = (4, 6, 4, 1)         # edit region Codex may repaint (left, up, right, down) -> 9 x 8 cells
UP = 3                      # anchors are shown to Codex at 3x nearest (crisp pixels)
OPEN_HALF, OPEN_TOP, OPEN_BOT = 40, 52, 16   # mouth opening box, px from the door-cell centre

THEMES = {
    'Crystal Cave': 'a natural cave mouth in the cliff, its rim studded with clusters of pale blue and violet '
                    'crystals that catch the light; cool blue glow deep inside',
    'Shadow Cave': 'a natural cave mouth in the cliff, unnaturally dark inside, a faint violet haze curling '
                   'out over the lip, two tiny glints of eyes in the dark',
    'Magma Tunnels': 'a tunnel bored into the rock, its rim of cracked black basalt, an orange magma glow '
                     'lighting the inside walls, thin glowing cracks running out a little way into the cliff',
    'Volcanic Forge': 'a forge gate cut into the rock face: a squared stone doorway with heavy iron-banded '
                      'doors standing open, warm forge-light inside, soot-blackened stone above the lintel',
    'Haunted Forest': 'an opening INTO the forest itself: two gnarled trunks of the surrounding trees bend '
                      'together into a natural archway, a dark path leading in, pale mist low on the ground',
    'Iron Mine': 'a mine adit in the cliff: a timber-framed opening (two posts and a lintel beam) with a '
                 'short run of rails coming out over the lip',
    'Ember Mines': 'a mine adit in the cliff: a timber-framed opening with a short run of rails, ember-red '
                   'light inside, soot on the rock above',
    'Obsidian Cavern': 'a cave mouth framed by glassy black obsidian shards growing out of the rock, faint '
                       'purple sheen on the shards',
    'Desert Tomb': 'a tomb doorway carved into the sandstone cliff: a squared portal with a carved lintel and '
                   'worn steps, dark inside',
    'Bandit Hideout': 'a hidden cave mouth in the cliff, half screened by a ragged hide curtain on a pole',
    'Storm Nest': 'a cave mouth high in the cliff face with wind-scoured rock around it',
    'Oasis Depths': 'a cave mouth in the rock with water-smoothed edges and a little seep of water at the sill',
    'Scorched Ruins': 'a ruined stone doorway set into the rock, its edges scorched black',
}

def theme(name):
    for k, v in THEMES.items():
        if name.startswith(k): return v
    return 'a cave mouth carved naturally into the surrounding rock'

def landmarks():
    out = []
    for act in (2, 3, 4, 5):
        m = json.load(open(f'{A.SCRATCH}/act{act}/manifest.json'))
        for l in m['landmarks']:
            out.append(dict(l, act=act, bounds=m['bounds']))
    return out

def set_into(cls, l):
    """'rock' / 'forest' / None: what blocks the cells beside and behind the mouth"""
    x, y = l['cell']
    ring = np.zeros_like(cls, bool); ring[y - 5:y + 1, x - 6:x + 7] = True; ring[y - 1:y + 1, x - 2:x + 3] = False
    r = cls[ring]; m = (r == A.MOUNT).mean(); f = (r == A.FOREST).mean()
    if m >= 0.45: return 'rock'
    if f >= 0.45: return 'forest'
    return None

def paint_crop(act, bounds, x0, y0, x1, y1):
    """flattened paint (base + water + foam + forest), no landmark sprites, world cells [x0,x1) x [y0,y1)"""
    W, H = (x1 - x0) * P, (y1 - y0) * P
    out = np.zeros((H, W, 3), np.float32); bx0, by0 = bounds[:2]
    D = f'{A.SCRATCH}/act{act}/chunks'
    for c in range((x0 - bx0) // 16, (x1 - 1 - bx0) // 16 + 1):
        for r in range((y0 - by0) // 16, (y1 - 1 - by0) // 16 + 1):
            ox, oy = (bx0 + c * 16 - x0) * P, (by0 + r * 16 - y0) * P
            acc = None
            for k, e in (('base', 'webp'), ('water-r2', 'png'), ('foam', 'png'), ('forest', 'png')):
                f = f'{D}/{k}/c{c}-r{r}.{e}'
                if not os.path.exists(f): continue
                im = np.asarray(Image.open(f).convert('RGBA')).astype(np.float32)
                if acc is None: acc = im[..., :3].copy()
                else: a = im[..., 3:4] / 255; acc = acc * (1 - a) + im[..., :3] * a
            if acc is None: continue
            h, w = acc.shape[:2]
            X0, Y0 = max(0, ox), max(0, oy); X1, Y1 = min(W, ox + w), min(H, oy + h)
            if X1 > X0 and Y1 > Y0: out[Y0:Y1, X0:X1] = acc[Y0 - oy:Y1 - oy, X0 - ox:X1 - ox]
    return np.clip(out, 0, 255).astype(np.uint8)

def act1_crop(x0, y0, x1, y1):
    full = Image.open(A.SCRATCH + '/act1_full.png').convert('RGB')     # Act 1 shipped flat, origin (16, 218)
    return np.asarray(full.crop(((x0 - 16) * P, (y0 - 218) * P, (x1 - 16) * P, (y1 - 218) * P)))

def guide(crop, x0, y0, x, y):
    im = Image.fromarray(crop).convert('RGBA'); ov = Image.new('RGBA', im.size, (0, 0, 0, 0)); d = ImageDraw.Draw(ov)
    px, py = (x - x0) * P + 16, (y - y0) * P + 16
    l, u, r, dn = EDIT
    ex0, ey0, ex1, ey1 = (x - l - x0) * P, (y - u - y0) * P, (x + r + 1 - x0) * P, (y + dn + 1 - y0) * P
    for i in range(ex0, ex1, 12): d.line([(i, ey0), (min(i + 6, ex1), ey0)], fill=(255, 255, 255, 255), width=2); d.line([(i, ey1 - 1), (min(i + 6, ex1), ey1 - 1)], fill=(255, 255, 255, 255), width=2)
    for j in range(ey0, ey1, 12): d.line([(ex0, j), (ex0, min(j + 6, ey1))], fill=(255, 255, 255, 255), width=2); d.line([(ex1 - 1, j), (ex1 - 1, min(j + 6, ey1))], fill=(255, 255, 255, 255), width=2)
    d.rectangle([px - OPEN_HALF, py - OPEN_TOP, px + OPEN_HALF, py + OPEN_BOT], outline=(255, 40, 40, 255), width=2, fill=(255, 40, 40, 70))
    d.rectangle([px - OPEN_HALF, py + OPEN_BOT, px + OPEN_HALF, min(im.height - 1, py + OPEN_BOT + 3 * P)], fill=(40, 220, 80, 70))
    return np.asarray(Image.alpha_composite(im, ov).convert('RGB'))

def x3(a): return Image.fromarray(a).resize((a.shape[1] * UP, a.shape[0] * UP), Image.NEAREST)

def main():
    os.environ.setdefault('ACTS_VARIANT', 'C')
    cls, act, land = A.world()
    jobs = []
    os.makedirs(PKG + '/anchors', exist_ok=True); os.makedirs(PKG + '/briefs', exist_ok=True)
    os.makedirs(PKG + '/out', exist_ok=True)
    for f in ('kit-cliff-act1.png', 'kit-canopy-atlas-act1.png'):
        Image.open(f'{CODEX_ANCHORS}/{f}').save(f'{PKG}/anchors/{f}')
    lms = [l for l in landmarks() if l['kind'] == 'dungeon']
    # Act 1's Crystal Cave (shipped art; replaced later by an override, build 91 files untouched)
    lms.append(dict(name='Crystal Cave (Act 1)', slug='crystal-cave-act1', cell=[149, 278], act=1, kind='dungeon',
                    gate='south', bounds=None))
    for l in lms:
        into = 'rock' if l['act'] == 1 else set_into(cls, l)
        if into is None: continue
        x, y = l['cell']; L, U, R, D = CTX; x0, y0, x1, y1 = x - L, y - U, x + R + 1, y + D + 1
        crop = act1_crop(x0, y0, x1, y1) if l['act'] == 1 else paint_crop(l['act'], l['bounds'], x0, y0, x1, y1)
        g = guide(crop, x0, y0, x, y)
        job = 'entrance-' + l['slug']
        x3(crop).save(f'{PKG}/anchors/{job}-paint.png'); x3(g).save(f'{PKG}/anchors/{job}-guide.png')
        sprite = None
        if l['act'] >= 2:
            sp = f"{A.SCRATCH}/act{l['act']}/landmarks/{l['slug']}.png"
            if os.path.exists(sp):
                sprite = f'{job}-current-sprite.png'; Image.open(sp).save(f'{PKG}/anchors/{sprite}')
        meta = dict(job=job, name=l['name'], act=l['act'], cell=[x, y], into=into, gate=l.get('gate', 'south'),
                    context_cells=[x0, y0, x1, y1], edit_cells=[x - EDIT[0], y - EDIT[1], x + EDIT[2] + 1, y + EDIT[3] + 1],
                    opening_px_from_door_centre=dict(half_width=OPEN_HALF, top=OPEN_TOP, bottom=OPEN_BOT),
                    scale=UP, theme=theme(l['name']),
                    images=[f'anchors/{job}-paint.png', f'anchors/{job}-guide.png',
                            'anchors/kit-cliff-act1.png' if into == 'rock' else 'anchors/kit-canopy-atlas-act1.png']
                           + ([f'anchors/{sprite}'] if sprite else []))
        open(f'{PKG}/briefs/{job}.md', 'w').write(brief(meta, crop.shape))
        jobs.append(meta)
        print(job, l['act'], (x, y), into)
    json.dump(jobs, open(f'{PKG}/jobs.json', 'w'), indent=1)

def brief(m, shape):
    H, W = shape[:2]; Wp, Hp = W * UP, H * UP
    surf = 'cliff' if m['into'] == 'rock' else 'forest'
    act1 = m['act'] == 1
    ref3 = ('IMAGE 3 is the shipped Act 1 CLIFF KIT on magenta: the construction every cliff in this game uses '
            '(stacked blocks, lit upper-left, hard pixel edges).' if m['into'] == 'rock' else
            'IMAGE 3 is the shipped Act 1 CANOPY ATLAS: how trees are drawn in this game.')
    ref4 = ('\n- IMAGE 4 is the current placeholder sprite for this dungeon. Use it ONLY for the theme (what kind '
            'of place it is). Do NOT reproduce it as a separate object.' if len(m['images']) > 3 else '')
    return f"""DO THIS YOURSELF, one generation call, do not dispatch a sub-agent. Produce the image
and stop.

# Task: carve the {m['name']} entrance INTO the {surf} paint at its exact overworld spot

{'This is Act 1 shipped art (build 91). Your result becomes an override layer for the Acts 2-5 release; it never edits Act 1 files.' if act1 else f"Act {m['act']} overworld, door cell ({m['cell'][0]}, {m['cell'][1]})."}

The entrance must NOT look like a sprite placed on top of the terrain. It must look as if the
{surf} itself was painted with an opening in it, so the way in and out blends into the land.

{len(m['images'])} images are attached.
- IMAGE 1 is the ACTUAL overworld paint around the door, at 3x (each 3x3 block is one pixel; one map
  cell is 96 x 96 here). It is {Wp} x {Hp} px. The door cell is horizontally centred, 9.5 cells from
  the top. This paint is what the player sees today, minus the old sprite.
- IMAGE 2 is the same crop with guides: the DASHED WHITE rectangle is the only area you may change;
  the RED box is where the dark mouth OPENING must be (the hero walks in through it from below); the
  GREEN band below it is open ground that must stay walkable ground, connected to the opening.
- {ref3}{ref4}

## WHAT TO PAINT
Inside the dashed rectangle only: {m['theme']}.
- The opening fills the red box: dark inside, readable at a glance, its floor meeting the green
  ground with no step or ledge. Its sides and top are the SAME {surf} you see around it in IMAGE 1:
  continue those exact {'blocks, faces, colours and snow/ember/sand details' if m['into'] == 'rock' else 'trunks, crowns and colours'},
  so the mouth sits deep in the {surf} with {surf} touching it on both sides and above.
- {'Rock wraps the mouth with a natural ragged outline (no rectangle, no frame of flat colour, no flat fill anywhere).' if m['into'] == 'rock' else 'The trees close in on both sides of the opening; no clearing ring, no flat fill anywhere.'}
- Everything outside the dashed rectangle: reproduce IMAGE 1 as closely as you can (it is cut away
  afterwards, but it must line up so the seam disappears).

## FORMAT
One RGB PNG, exactly {Wp} x {Hp} px, same framing as IMAGE 1 (no border, no guides, no text). Keep the
3x pixel grid: hard-edged pixel art, each art pixel a crisp 3 x 3 block, IMAGE 1's palette, lit from the
upper left, no blur, no filter, no glow halos past the mouth.

## OUTPUT
Write to exactly @@OUT@@, print the path, stop.
"""

if __name__ == '__main__':
    main()
