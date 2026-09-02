#!/usr/bin/env python3
"""Per-frame scroll displacement of a simulator recording, via phase correlation on a terrain crop.
usage: video_motion.py <video.mp4|mov> [--label X] [--crop top,bottom,left,right fractions] [--skip N]
Prints per-frame (dx,dy) in device px, then stats: the number of duplicated frames (|d|<0.3 px while
the median says the world is moving), the fraction of moving frames whose step deviates >25% from the
median, and a histogram of rounded step sizes. Duplicated frames + uneven steps ARE what the eye calls
jitter; frame rate alone cannot see them."""
import sys, os, subprocess, tempfile, json, argparse
import numpy as np
from PIL import Image
ap = argparse.ArgumentParser(); ap.add_argument('video'); ap.add_argument('--label', default='')
ap.add_argument('--crop', default='0.30,0.55,0.05,0.95'); ap.add_argument('--skip', type=int, default=10)
ap.add_argument('--fps', default=None); ap.add_argument('--max', type=int, default=240)
a = ap.parse_args()
t, b, l, r = map(float, a.crop.split(','))
d = tempfile.mkdtemp(prefix='vm-')
subprocess.run([os.path.join(os.path.dirname(os.path.abspath(__file__)), 'framedump'), a.video, d, str(a.max)], check=True)
files = sorted(f for f in os.listdir(d) if f.endswith('.png'))
times = [float(x) for x in open(os.path.join(d, 'times.csv')).read().split(',') if x]
dts = [round(1000*(times[i]-times[i-1]),1) for i in range(1,len(times))]
print('frame dt ms: median', sorted(dts)[len(dts)//2] if dts else None, 'max', max(dts) if dts else None, 'n', len(dts))
def load(f):
    im = Image.open(os.path.join(d, f)).convert('L'); w, h = im.size
    c = im.crop((int(w*l), int(h*t), int(w*r), int(h*b))); c = c.resize((c.size[0]//2, c.size[1]//2), Image.BILINEAR)
    return np.asarray(c, dtype=np.float32)
def shift(a0, a1):
    A = np.fft.fft2(a0 - a0.mean()); B = np.fft.fft2(a1 - a1.mean())
    R = A * np.conj(B); R /= (np.abs(R) + 1e-6)
    c = np.fft.ifft2(R).real; iy, ix = np.unravel_index(np.argmax(c), c.shape)
    h, w = c.shape
    dy = iy if iy <= h // 2 else iy - h; dx = ix if ix <= w // 2 else ix - w
    return dx, dy, c.max()
prev = load(files[a.skip]); steps = []
for f in files[a.skip + 1:]:
    cur = load(f); dx, dy, pk = shift(prev, cur); steps.append((dx, dy, pk)); prev = cur
mag = 2*np.array([abs(s[0]) + abs(s[1]) for s in steps], dtype=float)  # half-res crop -> device px
# WALK SEGMENT: the longest run of moving frames (gaps of <=2 static frames allowed), so a battle
# screen or the idle before the stick is touched does not count as "duplicate frames".
best = (0, 0); i = 0; n = len(mag)
while i < n:
    if mag[i] < 0.5: i += 1; continue
    j = i; gap = 0; last = i
    while j < n and gap <= 2:
        if mag[j] >= 0.5: last = j; gap = 0
        else: gap += 1
        j += 1
    if last - i + 1 > best[1] - best[0] + 1: best = (i, last)
    i = last + 1
seg = mag[best[0]:best[1] + 1] if n else mag
moving = seg[seg > 0.5]
med = float(np.median(moving)) if len(moving) else 0.0
dups = int((seg < 0.5).sum()); uneven = int((np.abs(moving - med) > 0.25 * med).sum()) if med else 0
hist = {}
for m in seg: hist[int(round(m))] = hist.get(int(round(m)), 0) + 1
segdts = dts[best[0] + a.skip: best[1] + a.skip + 1] if dts else []
json.dump({'label': a.label, 'steps': [(int(s[0]), int(s[1])) for s in steps], 'dts': dts, 'segment': best},
          open(a.video + '.steps.json', 'w'))
print(json.dumps({'label': a.label, 'framesTotal': len(steps), 'walkSegmentFrames': int(best[1] - best[0] + 1),
                  'segmentDtMsMedian': (sorted(segdts)[len(segdts)//2] if segdts else None), 'segmentDtMsMax': (max(segdts) if segdts else None),
                  'medianStepPx': med, 'duplicateFramesInWalk': dups,
                  'unevenMovingFrames': uneven, 'unevenPct': round(100 * uneven / max(1, len(moving)), 1),
                  'hist': dict(sorted(hist.items()))}))
