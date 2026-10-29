#!/usr/bin/env python3
"""Terrain-carved entrances: turn a picked Codex try into a patch that render_act.py paints into the act
(codex-gen/entrances/README.md "Composite and cut").

    ACTS_VARIANT=C python3 scripts/acts/entrances_apply.py <job> <try.png> <generated-against.png> [--mouth-shift dx,dy]

<generated-against.png> is the context paint the try was generated from (480 x 448 at 32 px/cell, or any
crop + --against-origin X,Y px). The diff is taken against THAT paint, so only Codex's own edits are cut,
even when the act has been re-rendered since (fix5 floor etc.).

Steps
 1. normalise: box-downsample the try to the context size (32 px/cell); check registration (0-4 px)
 2. colour-match: per-channel linear fit of try -> paint on the band outside the edit rectangle
 3. cut: R = edit rect & (|try - paint| > 24 in any channel, 1 px blurred), closed, holes filled,
    specks removed, grown 4 px (inside the edit rect). Pixels Codex did not change keep the CURRENT paint.
 4. optional mouth shift: when the mouth is not on the door, the mouth (frame, interior, lip, ~1 cell of
    rock round it) is cut with an organic mask and moved by (dx, dy) onto the door; the rest of R stays put
 5. alpha: 1 inside, 4 px feather onto the existing paint at the boundary (never outside the edit rect)
 6. collision (feet only, front entry only), over the patch region (alpha >= .5):
      blocked = every non-ground pixel the patch painted (ground keeps the act's collision), except the opening channel (door +-40 px, from 52 px above the
      door centre to the door-cell bottom) and the approach (door +-40 px, 3 cells south of the door);
      jambs: 16 px either side of the channel, opening top to door-cell bottom, are always blocked
 7. lintel: patch pixels in the 24 rows above the opening top (channel +-56 px) go to the front layer

Writes A.SCRATCH/entrances/<job>/: patch.png (RGBA), block.png (L 255 blocked / 0 open / 1 keep), front.png,
patch.json; render_act.py picks them up for the job's landmark (manifest entry gets "carved": true).
"""
import os, sys, json, argparse
import numpy as np
from PIL import Image
from scipy import ndimage as ndi
HERE = os.path.dirname(os.path.abspath(__file__)); sys.path.insert(0, HERE)
import acts_common as A
import biome_kits as K

PKG = os.environ.get('ENTRANCES_PKG', '/mnt/project-files/edu-rpg/codex-gen/entrances')
OUTROOT = A.SCRATCH + '/entrances'
P = 32
GATE_HALF, OPEN_TOP, OPEN_BOT = 40, 52, 16
GROUND_L, GROUND_SD = 185, 40


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument('job'); ap.add_argument('try_png'); ap.add_argument('against')
    ap.add_argument('--against-origin', default='0,0', help='px offset of the context inside <against>')
    ap.add_argument('--mouth-shift', default='0,0')
    ap.add_argument('--current', default='', help='the act paint the patch lands on (package anchor); enables sliver fill and rim/edge cleanup')
    ap.add_argument('--floor-biome', default='snow')
    ap.add_argument('--foot-clip', type=int, default=0, help='clip the moved mouth left of the frame below this try-px row (its own cliff foot stays put)')
    ap.add_argument('--edit-cells', default='', help='x0,y0,x1,y1 world cells: override the job edit rectangle')
    ap.add_argument('--mouth-box', default='', help='x0,y0,x1,y1 (context px) of the mouth to move; default: auto')
    a = ap.parse_args()
    job = [j for j in json.load(open(PKG + '/jobs.json')) if j['job'] == a.job][0]
    cx0, cy0, cx1, cy1 = job['context_cells']; W, H = (cx1 - cx0) * P, (cy1 - cy0) * P
    if a.edit_cells: job['edit_cells'] = [int(v) for v in a.edit_cells.split(',')]
    ex0, ey0, ex1, ey1 = [(v - o) * P for v, o in zip(job['edit_cells'], (cx0, cy0, cx0, cy0))]
    dxc, dyc = (job['cell'][0] - cx0) * P + 16, (job['cell'][1] - cy0) * P + 16   # door centre, context px
    t = np.asarray(Image.open(a.try_png).convert('RGB').resize((W, H), Image.BOX)).astype(np.float32)
    ox, oy = map(int, a.against_origin.split(','))
    ag = Image.open(a.against).convert('RGB')
    if ag.size == (W * 3, H * 3): ag = ag.resize((W, H), Image.BOX)   # a package anchor (3x nearest)
    old = np.asarray(ag)[oy:oy + H, ox:ox + W].astype(np.float32)
    band = np.ones((H, W), bool); band[ey0:ey1, ex0:ex1] = False
    # 1. registration check
    best = min(((np.abs(np.roll(np.roll(t, dy, 0), dx, 1) - old)[band].mean(), dx, dy)
                for dy in range(-4, 5) for dx in range(-4, 5)))
    reg = {'band_err': round(float(best[0]), 2), 'shift': [int(best[1]), int(best[2])]}
    t = np.roll(np.roll(t, best[2], 0), best[1], 1)
    # 2. colour match
    for c in range(3):
        X = np.stack([t[..., c][band], np.ones(band.sum())], 1)
        g, o = np.linalg.lstsq(X, old[..., c][band], rcond=None)[0]
        t[..., c] = t[..., c] * g + o
    t = np.clip(t, 0, 255)
    # 3. cut
    edit = ~band
    d = np.abs(ndi.gaussian_filter(t, (1, 1, 0)) - ndi.gaussian_filter(old, (1, 1, 0))).max(2)
    R = (d > 24) & edit
    R = ndi.binary_closing(R, iterations=3); R = ndi.binary_fill_holes(R)
    lab, n = ndi.label(R); sz = ndi.sum(R, lab, range(1, n + 1))
    R = np.isin(lab, 1 + np.nonzero(sz >= 300)[0])
    R = ndi.binary_dilation(R, iterations=4) & edit
    patch = np.zeros((H, W, 4), np.float32); patch[..., :3] = t
    region = R.copy()
    # 4. mouth shift
    mdx, mdy = map(int, a.mouth_shift.split(','))
    mouth = None
    if mdx or mdy:
        if a.mouth_box:
            mx0, my0, mx1, my1 = map(int, a.mouth_box.split(','))
        else:   # dark interior near the door
            L = t @ np.array([.299, .587, .114], np.float32)
            dark = (L < 45) & R
            lab, n = ndi.label(dark); sz = ndi.sum(dark, lab, range(1, n + 1)); k = 1 + int(np.argmax(sz))
            ys, xs = np.nonzero(lab == k); mx0, mx1, my0, my1 = xs.min(), xs.max(), ys.min(), ys.max()
        # organic mask: rounded box round the mouth + ~1 cell of rock, + the lip below
        yy, xx = np.mgrid[0:H, 0:W].astype(np.float32)
        cxm, cym = (mx0 + mx1) / 2, (my0 + my1) / 2
        rx, ry = (mx1 - mx0) / 2 + 40, (my1 - my0) / 2 + 34
        rng = np.random.default_rng(len(a.job))
        ang = np.arctan2(yy - cym, xx - cxm); jit = sum(rng.normal(0, .05) * np.cos(k * ang + rng.uniform(0, 6.3)) for k in range(2, 6))
        M = (((xx - cxm) / rx) ** 4 + ((yy - cym) / ry) ** 4) ** .25 < 1 + jit
        if a.foot_clip:   # the try's own cliff foot left of the frame must not travel with the mouth (dark hook)
            M &= ~((xx < mx0) & (yy > a.foot_clip))
        Ms = np.roll(np.roll(M, mdy, 0), mdx, 1)
        ts = np.roll(np.roll(t, mdy, 0), mdx, 1)
        patch[Ms, :3] = ts[Ms]; region |= Ms
        region &= edit
        mouth = {'box': [int(mx0), int(my0), int(mx1), int(my1)], 'shift': [mdx, mdy]}
    # 4b. ground stays the act's own paint: open snow/sand/ground in the patch (blurred luminance high, little
    # local contrast -- fitted on act 2's paint against its collision) is dropped from the region, except the
    # mouth lip and its track in the opening channel. Codex's re-shaded ground never lands on the act's ground.
    pr = patch[..., :3]; Lm = pr @ np.array([.299, .587, .114], np.float32)
    Lb = ndi.gaussian_filter(Lm, 5); sd = np.sqrt(np.maximum(ndi.gaussian_filter(Lm * Lm, 5) - Lb ** 2, 0))
    ground = (Lb > GROUND_L) & (sd < GROUND_SD)
    yy, xx = np.mgrid[0:H, 0:W]
    lip = (np.abs(xx - dxc) <= GATE_HALF) & (yy >= dyc - OPEN_TOP) & (yy <= dyc + 40)
    ground_fine = ndi.gaussian_filter(Lm, 1.5) > GROUND_L + 5        # snow between rail ties etc.
    region &= ~ground | (lip & ndi.binary_dilation(~ground_fine, iterations=1))
    region = ndi.binary_opening(region, iterations=2); region = ndi.binary_fill_holes(region)
    lab, n = ndi.label(region); sz = ndi.sum(region, lab, range(1, n + 1))
    region = np.isin(lab, 1 + np.nonzero(sz >= 200)[0]) & edit
    yy, xx = np.mgrid[0:H, 0:W]
    chan = (np.abs(xx - dxc) <= GATE_HALF) & (yy >= dyc - OPEN_TOP) & (yy <= dyc + OPEN_BOT)
    appr = (np.abs(xx - dxc) <= GATE_HALF) & (yy > dyc) & (yy <= dyc + 16 + 3 * P)
    cur_ground = None; sliver = np.zeros((H, W), bool)
    if a.current:
        cg = Image.open(a.current).convert('RGB')
        if cg.size == (W * 3, H * 3): cg = cg.resize((W, H), Image.BOX)
        cur = np.asarray(cg).astype(np.float32)
        def groundof(img):
            L_ = img @ np.array([.299, .587, .114], np.float32); Lb_ = ndi.gaussian_filter(L_, 5)
            sd_ = np.sqrt(np.maximum(ndi.gaussian_filter(L_ * L_, 5) - Lb_ ** 2, 0)); return (Lb_ > GROUND_L) & (sd_ < GROUND_SD)
        cur_ground = groundof(cur)
        # 5a. rim: Codex's dark outline ring where the new rock meets open ground -> dropped (hard edge instead)
        out_g = ndi.binary_dilation(cur_ground & ~region, iterations=3)
        band_ = region & ~ndi.binary_erosion(region, iterations=3)
        Lp = patch[..., :3] @ np.array([.299, .587, .114], np.float32)
        region &= ~(band_ & out_g & (Lp < 110) & ~chan)
        # 5b. slivers: narrow ground pockets enclosed by rock (old cliff | new rock) inside the edit rect are rock
        comp = np.where(region[..., None], patch[..., :3], cur)
        rock = ~groundof(comp)
        sliver = ndi.binary_closing(rock, iterations=8) & ~rock & edit & ~chan & ~appr
        sliver = ndi.binary_dilation(sliver, iterations=2) & ~rock & edit & ~chan & ~appr
        if sliver.any():
            sy_, sx_ = np.nonzero(sliver)
            fl = K.rock_floor_sample(a.floor_biome, (sy_ + cy0 * P).astype(np.int64), (sx_ + cx0 * P).astype(np.int64))
            patch[sy_, sx_, :3] = np.clip(fl, 0, 255); region |= sliver
    # 5. alpha: 4 px feather where the patch meets rock (old cliff); hard where it meets open ground
    dist = ndi.distance_transform_edt(region)
    alpha = np.clip(dist / 4.0, 0, 1) * region
    if cur_ground is not None:
        near_g = ndi.binary_dilation(cur_ground & ~region, iterations=5)
        alpha = np.where(near_g & region, 1.0, alpha)
    patch[..., 3] = alpha * 255
    # 6. collision
    yy, xx = np.mgrid[0:H, 0:W]
    chan = (np.abs(xx - dxc) <= GATE_HALF) & (yy >= dyc - OPEN_TOP) & (yy <= dyc + OPEN_BOT)
    appr = (np.abs(xx - dxc) <= GATE_HALF) & (yy > dyc) & (yy <= dyc + 16 + 3 * P)
    jamb = ((np.abs(xx - dxc) > GATE_HALF) & (np.abs(xx - dxc) <= GATE_HALF + 16)
            & (yy >= dyc - OPEN_TOP) & (yy <= dyc + OPEN_BOT))
    on = alpha >= 0.5
    block = np.ones((H, W), np.uint8)           # 1 = keep the act's own collision
    block[on & ~ground] = 255
    block[sliver] = 255
    if cur_ground is not None:   # every painted rock pixel in the edit rect is blocked, out to its edge
        comp = np.where(on[..., None], patch[..., :3], cur)
        Lc = comp @ np.array([.299, .587, .114], np.float32); Lcb = ndi.gaussian_filter(Lc, 2)
        sdc = np.sqrt(np.maximum(ndi.gaussian_filter(Lc * Lc, 2) - Lcb ** 2, 0))
        rock_px = ~((Lcb > GROUND_L) & (sdc < GROUND_SD + 10))
        rock_px = ndi.binary_erosion(ndi.binary_opening(rock_px, iterations=1), iterations=2) & edit & ~groundof(comp)   # snow shrubs sit in broad snow
        lab_, n_ = ndi.label(rock_px)   # only rock masses the patch is part of (not snow shrubs)
        touch = np.unique(lab_[ndi.binary_dilation(on | sliver, iterations=2) & rock_px])
        sz_ = ndi.sum(rock_px, lab_, range(1, n_ + 1))
        keep_ = [k for k in touch if k > 0 and sz_[k - 1] >= 400]
        rock_px = np.isin(lab_, keep_)
        block[rock_px] = 255
    block[on & (chan | appr)] = 0
    block[chan | appr] = np.where(block[chan | appr] == 255, 0, block[chan | appr])
    # no stray islands: blocked specks off the rock mass (shrubs, Codex snow detail) keep the act's collision
    thin = (block == 255) & ~ndi.binary_opening(block == 255, iterations=3)   # shrub tendrils on the mass
    block[thin & (cur_ground if cur_ground is not None else ground)] = 1
    bl = block == 255; lab_, n_ = ndi.label(bl); sz_ = ndi.sum(bl, lab_, range(1, n_ + 1))
    block[bl & ~np.isin(lab_, 1 + np.nonzero(sz_ >= 1500)[0])] = 1
    block[jamb] = 255
    # 7. lintel
    lint = on & (np.abs(xx - dxc) <= GATE_HALF + 16) & (yy >= dyc - OPEN_TOP - 24) & (yy < dyc - OPEN_TOP)
    front = np.zeros((H, W, 4), np.uint8); front[lint, :3] = patch[lint, :3].astype(np.uint8); front[lint, 3] = 255
    O = f'{OUTROOT}/{a.job}'; os.makedirs(O, exist_ok=True)
    Image.fromarray(np.clip(patch, 0, 255).astype(np.uint8)).save(O + '/patch.png')
    Image.fromarray(block).save(O + '/block.png'); Image.fromarray(front).save(O + '/front.png')
    meta = {'job': a.job, 'name': job['name'], 'act': job['act'], 'cell': job['cell'], 'origin_cells': [cx0, cy0],
            'size_px': [W, H], 'edit_cells': job['edit_cells'], 'try': os.path.abspath(a.try_png),
            'against': os.path.abspath(a.against), 'registration': reg, 'mouth': mouth,
            'patch_px': int(on.sum()), 'gate_half': GATE_HALF, 'open_top': OPEN_TOP, 'open_bottom': OPEN_BOT}
    json.dump(meta, open(O + '/patch.json', 'w'), indent=1)
    print(a.job, 'registration', reg, 'patch px', int(on.sum()), 'mouth', mouth)


if __name__ == '__main__':
    main()
