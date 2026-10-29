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
GROUND_L8 = 175


def load_labels(job, W, H):
    """walkable / blocked labels for the job's context from the act's own collision (feet-only px masks).
    acts 2-5: actN/collision.png (+ walkbehind.png: walkable rock tops are left out); act 1: forest-collision.bin.
    Returns (walk, blocked) bool arrays, eroded 4 px, with the old sprite's surroundings (r 3 cells) left out."""
    cx0, cy0 = job['context_cells'][:2]; act = job['act']
    if act == 1:
        b = open(A.ROOT + '/public/act1-hifi/forest-collision.bin', 'rb').read()
        bits = np.unpackbits(np.frombuffer(b[64:], np.uint8), bitorder='little').reshape(5824, 4736)
        x0, y0 = (cx0 - 16) * P, (cy0 - 218) * P
        c = bits[y0:y0 + H, x0:x0 + W] > 0; wb = np.zeros_like(c)
    else:
        D = f'{A.SCRATCH}/act{act}/'; m = json.load(open(D + 'manifest.json')); bx0, by0 = m['bounds'][:2]
        box = ((cx0 - bx0) * P, (cy0 - by0) * P, (cx0 - bx0) * P + W, (cy0 - by0) * P + H)
        c = np.asarray(Image.open(D + 'collision.png').convert('L').crop(box)) > 0
        wb = np.asarray(Image.open(D + 'walkbehind.png').convert('L').crop(box)) > 0
    yy, xx = np.mgrid[0:H, 0:W]
    dxc, dyc = (job['cell'][0] - cx0) * P + 16, (job['cell'][1] - cy0) * P + 16
    away = np.hypot(xx - dxc, yy - dyc) > 3 * P
    walk = ndi.binary_erosion(~c & ~wb, iterations=4) & away
    blocked = ndi.binary_erosion(c, iterations=4) & away
    return walk, blocked


def feats(img, s):
    m = ndi.gaussian_filter(img, (s, s, 0))
    L = img @ np.array([.299, .587, .114], np.float32); Lb = ndi.gaussian_filter(L, s)
    sd = np.sqrt(np.maximum(ndi.gaussian_filter(L * L, s) - Lb ** 2, 0))
    return np.dstack([m, sd[..., None]])


class GroundModel:
    """QDA (one Gaussian per class) on blurred colour + local contrast, fitted on the act's own paint
    against its own collision. ground(img, s) -> True where img looks like the act's walkable ground."""
    def __init__(self, cur, walk, blocked):
        self.fit = {}
        self.cur, self.walk, self.blocked = cur, walk, blocked
    def _fit(self, s):
        if s in self.fit: return self.fit[s]
        F = feats(self.cur, s); out = []
        for msk in (self.walk, self.blocked):
            X = F[msk].reshape(-1, F.shape[2]).astype(np.float64)
            if len(X) > 60000: X = X[np.random.default_rng(1).choice(len(X), 60000, replace=False)]
            mu = X.mean(0); C = np.cov(X.T) + np.eye(X.shape[1]) * 4.0
            out.append((mu, np.linalg.inv(C), np.linalg.slogdet(C)[1], np.log(len(X))))
        self.fit[s] = out; return out
    def ground(self, img, s=5):
        F = feats(img, s).astype(np.float64); sh = F.shape[:2]; F = F.reshape(-1, F.shape[2]); ll = []
        for mu, Ci, ld, lp in self._fit(s):
            d = F - mu; ll.append(-0.5 * np.einsum('ij,jk,ik->i', d, Ci, d) - 0.5 * ld + lp)
        return (ll[0] > ll[1]).reshape(sh)


def floor_biome_for(job, cur, blocked):
    if job['act'] == 1: return 'grass'
    ref = np.median(cur[blocked], 0) if blocked.any() else cur.reshape(-1, 3).mean(0)
    best = None
    for b in K.BIOMES:
        if b == 'grass': continue
        c = K.rock_floor_tile(b).reshape(-1, 3).mean(0); d = float(np.abs(c - ref).sum())
        if best is None or d < best[0]: best = (d, b)
    return best[1]


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument('job'); ap.add_argument('try_png'); ap.add_argument('against')
    ap.add_argument('--against-origin', default='0,0', help='px offset of the context inside <against>')
    ap.add_argument('--mouth-shift', default='0,0')
    ap.add_argument('--current', default='', help='the act paint the patch lands on (package anchor); enables sliver fill and rim/edge cleanup')
    ap.add_argument('--floor-biome', default='auto')
    ap.add_argument('--labels', action='store_true', help='per-job ground model from the act collision (non-snow biomes, forest)')
    ap.add_argument('--mouth-only', action='store_true', help='with --mouth-shift: only the moved mouth is used (Codex put the mouth off the door)')
    ap.add_argument('--mouth-margin', default='40,34', help='rock margin round the moved mouth, x,y px')
    ap.add_argument('--foot-clip', type=int, default=0, help='clip the moved mouth left of the frame below this try-px row (its own cliff foot stays put)')
    ap.add_argument('--edit-cells', default='', help='x0,y0,x1,y1 world cells: override the job edit rectangle')
    ap.add_argument('--mouth-box', default='', help='x0,y0,x1,y1 (context px) of the mouth to move; default: auto')
    ap.add_argument('--extend-jambs', action='store_true', help='carry the rock beside the channel down to the door-cell bottom')
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
    cur = None
    if a.current:
        cg = Image.open(a.current).convert('RGB')
        if cg.size == (W * 3, H * 3): cg = cg.resize((W, H), Image.BOX)
        cur = np.asarray(cg).astype(np.float32)
    model = None
    if a.labels and cur is not None:
        walk, blocked = load_labels(job, W, H); model = GroundModel(cur, walk, blocked)
        if a.floor_biome == 'auto': a.floor_biome = floor_biome_for(job, cur, blocked)
    if a.floor_biome == 'auto': a.floor_biome = 'snow'
    def G(img, s_=5):
        if model is not None: return model.ground(img, s_)
        L_ = img @ np.array([.299, .587, .114], np.float32)
        if s_ < 3: return ndi.gaussian_filter(L_, s_) > GROUND_L + 5
        Lb_ = ndi.gaussian_filter(L_, 5); sd_ = np.sqrt(np.maximum(ndi.gaussian_filter(L_ * L_, 5) - Lb_ ** 2, 0))
        return ((Lb_ > GROUND_L) & (sd_ < GROUND_SD)) | (ndi.gaussian_filter(L_, 8) > GROUND_L8)
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
        mgx, mgy = map(int, a.mouth_margin.split(','))
        rx, ry = (mx1 - mx0) / 2 + mgx, (my1 - my0) / 2 + mgy
        rng = np.random.default_rng(len(a.job))
        ang = np.arctan2(yy - cym, xx - cxm); jit = sum(rng.normal(0, .05) * np.cos(k * ang + rng.uniform(0, 6.3)) for k in range(2, 6))
        M = (((xx - cxm) / rx) ** 4 + ((yy - cym) / ry) ** 4) ** .25 < 1 + jit
        if a.foot_clip:   # the try's own cliff foot left of the frame must not travel with the mouth (dark hook)
            M &= ~((xx < mx0) & (yy > a.foot_clip))
        Ms = np.roll(np.roll(M, mdy, 0), mdx, 1)
        ts = np.roll(np.roll(t, mdy, 0), mdx, 1)
        patch[Ms, :3] = ts[Ms]
        region = Ms.copy() if a.mouth_only else (region | Ms)
        region &= edit
        mouth = {'box': [int(mx0), int(my0), int(mx1), int(my1)], 'shift': [mdx, mdy]}
    # 4b. ground stays the act's own paint: open snow/sand/ground in the patch (blurred luminance high, little
    # local contrast -- fitted on act 2's paint against its collision) is dropped from the region, except the
    # mouth lip and its track in the opening channel. Codex's re-shaded ground never lands on the act's ground.
    pr = patch[..., :3]
    ground = G(pr, 5) | G(pr, 8)     # shrubs / rubble in open ground are ground too
    yy, xx = np.mgrid[0:H, 0:W]
    lip = (np.abs(xx - dxc) <= GATE_HALF) & (yy >= dyc - OPEN_TOP) & (yy <= dyc + 40)
    ground_fine = G(pr, 1.5)        # ground between rail ties etc.
    region &= ~ground | (lip & ndi.binary_dilation(~ground_fine, iterations=1))
    region = ndi.binary_opening(region, iterations=2); region = ndi.binary_fill_holes(region)
    lab, n = ndi.label(region); sz = ndi.sum(region, lab, range(1, n + 1))
    region = np.isin(lab, 1 + np.nonzero(sz >= 200)[0]) & edit
    # shards: thin fragments of the try's own cliff edge left floating on snow
    core_ = ndi.binary_opening(region, iterations=3)
    region = (core_ | (region & lip)) & edit
    lab, n = ndi.label(region); sz = ndi.sum(region, lab, range(1, n + 1))
    region = np.isin(lab, 1 + np.nonzero(sz >= 600)[0])
    yy, xx = np.mgrid[0:H, 0:W]
    chan = (np.abs(xx - dxc) <= GATE_HALF) & (yy >= dyc - OPEN_TOP) & (yy <= dyc + OPEN_BOT)
    appr = (np.abs(xx - dxc) <= GATE_HALF) & (yy > dyc) & (yy <= dyc + 16 + 3 * P)
    cur_ground = None; sliver = np.zeros((H, W), bool)
    pocket = np.zeros((H, W), bool)
    if cur is not None:
        def groundof(img): return G(img, 5) | G(img, 8)
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
        # 5c. pockets: ground enclosed by rock inside the edit rect (behind a moved mouth) is rock floor
        pocket = ndi.binary_fill_holes(rock) & ~rock & edit & ~chan & ~appr & ~sliver   # whole context: ground reaching the frame edge is open
        sliver |= pocket
        if sliver.any():
            sy_, sx_ = np.nonzero(sliver)
            fl = K.rock_floor_sample(a.floor_biome, (sy_ + cy0 * P).astype(np.int64), (sx_ + cx0 * P).astype(np.int64))
            patch[sy_, sx_, :3] = np.clip(fl, 0, 255); region |= sliver
    # 4c. only the mouth's own edit: diff islands away from the mouth (Codex re-shading of untouched rock,
    # which over a re-rendered act shows as smudges) are dropped unless they are a real structure (>= 2500 px)
    lab, n = ndi.label(region); sz = ndi.sum(region, lab, range(1, n + 1))
    near = np.unique(lab[ndi.binary_dilation(chan, iterations=48) & region])
    region = np.isin(lab, [k for k in near if k > 0] + list(1 + np.nonzero(sz >= 2500)[0]))
    # 5. alpha: 4 px feather where the patch meets rock (old cliff); hard where it meets open ground
    dist = ndi.distance_transform_edt(region)
    alpha = np.clip(dist / 4.0, 0, 1) * region
    if cur_ground is not None:
        near_g = ndi.binary_dilation(cur_ground & ~region, iterations=5)
        alpha = np.where(near_g & region, 1.0, alpha)
        # rock-on-rock at the edit-rect border: 12 px ramp so Codex's repaint never ends in a straight seam
        din = ndi.distance_transform_edt(edit)
        out_ground = ndi.binary_dilation(cur_ground & ~edit, iterations=14)
        ramp = np.clip((din - 14) / 6.0, 0, 1)     # repaint kept >= 14 px inside where the outside is rock
        alpha = np.where(out_ground | chan, alpha, alpha * ramp)
    patch[..., 3] = alpha * 255
    # 5b. --extend-jambs: where the painted rock beside the channel ends above the door row (a moved mouth sits
    # lower than the rock round it), the rock foot is carried down to the door-cell bottom (its own pixels 28 px
    # higher, column by column, rounded taper away from the channel), so the door is entered from the front only
    toe = np.zeros((H, W), bool)
    if a.extend_jambs:
        on_ = patch[..., 3] >= 128; tgt0 = dyc + OPEN_BOT + 2
        for side in (-1, 1):
            for d in range(1, 41):
                x = int(dxc + side * (GATE_HALF + d))
                if not 0 <= x < W: continue
                col = np.nonzero(on_[max(0, dyc - OPEN_TOP - 60):tgt0 + 1, x])[0]
                if not col.size: continue
                bot = max(0, dyc - OPEN_TOP - 60) + int(col.max()); tgt = min(H - 1, int(round(tgt0 - d * d / 14.0)))
                for y in range(bot + 1, tgt + 1):
                    if patch[y - 28, x, 3] < 128: break
                    patch[y, x] = patch[y - 28, x]; patch[y, x, 3] = 255; toe[y, x] = True
        print('extend-jambs px', int(toe.sum()))
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
        rock_px = ~G(comp, 2)
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
    block[toe] = 255
    painted_rock = (block == 255) | (on & ~ground)
    block[jamb & ndi.binary_dilation(painted_rock, iterations=4)] = 255   # jambs only where rock is painted
    # 7. lintel
    lint = on & (np.abs(xx - dxc) <= GATE_HALF + 16) & (yy >= dyc - OPEN_TOP - 24) & (yy < dyc - OPEN_TOP)
    front = np.zeros((H, W, 4), np.uint8); front[lint, :3] = patch[lint, :3].astype(np.uint8); front[lint, 3] = 255
    # flat-cut check: patch pixels on the edit-rect border whose outside neighbour is open ground
    flat = 0
    if cur_ground is not None:
        for (ys_, xs_, oy_, ox_) in ((slice(ey0, ey1), ex0, 0, -1), (slice(ey0, ey1), ex1 - 1, 0, 1)):
            if 0 <= xs_ + ox_ < W: flat += int((on[ys_, xs_] & ~ground[ys_, xs_] & cur_ground[ys_, xs_ + ox_]).sum())
        for (ys_, oy_) in ((ey0, -1), (ey1 - 1, 1)):
            if 0 <= ys_ + oy_ < H: flat += int((on[ys_, ex0:ex1] & ~ground[ys_, ex0:ex1] & cur_ground[ys_ + oy_, ex0:ex1]).sum())
    O = f'{OUTROOT}/{a.job}'; os.makedirs(O, exist_ok=True)
    Image.fromarray(np.clip(patch, 0, 255).astype(np.uint8)).save(O + '/patch.png')
    Image.fromarray(block).save(O + '/block.png'); Image.fromarray(front).save(O + '/front.png')
    meta = {'job': a.job, 'name': job['name'], 'act': job['act'], 'cell': job['cell'], 'origin_cells': [cx0, cy0],
            'size_px': [W, H], 'edit_cells': job['edit_cells'], 'try': os.path.abspath(a.try_png),
            'against': os.path.abspath(a.against), 'registration': reg, 'mouth': mouth,
            'patch_px': int(on.sum()), 'flat_cut_px': flat, 'floor_biome': a.floor_biome, 'labels': bool(model), 'gate_half': GATE_HALF, 'open_top': OPEN_TOP, 'open_bottom': OPEN_BOT}
    json.dump(meta, open(O + '/patch.json', 'w'), indent=1)
    print(a.job, 'registration', reg, 'patch px', int(on.sum()), 'mouth', mouth, 'flat-cut px', flat, 'floor', a.floor_biome, 'pockets', int(pocket.sum()))


if __name__ == '__main__':
    main()
