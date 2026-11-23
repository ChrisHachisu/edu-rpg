#!/usr/bin/env python3
"""Rebuild the probe-only navigation grids (<work>/nav/<floor>.json) that dungeon_authored.cjs and
the mech probes read (D2_NAV), from what SHIPS: the floor plans (acts-integration/plans on the
mount, copied to <work>/plans) and the shipped walk masks public/acts-dungeons/<id>/<floor>-walk.png.
It runs export_runtime.build() itself (with a numpy scipy stand-in, shim/), so the grid is the one
the exporter would write, and it cross-checks the plan against the shipped manifest (rows/assets):
a mismatch means the mount plan is not the plan the shipped floor was built from.

  python3 scripts/auto/explore/make_nav.py [--work /home/user/work/explore/e1] [dungeonId ...]
"""
import argparse, hashlib, json, os, sys
HERE = os.path.dirname(os.path.abspath(__file__))
ROOT = os.path.abspath(os.path.join(HERE, '../../..'))
sys.path.insert(0, os.path.join(HERE, 'shim'))
ap = argparse.ArgumentParser(); ap.add_argument('--work', default='/home/user/work/explore/e1'); ap.add_argument('ids', nargs='*')
a = ap.parse_args()
os.environ['D2_WORK'] = a.work; os.environ.setdefault('D2_PLANS', os.path.join(a.work, 'plans'))
sys.path.insert(0, os.path.join(ROOT, 'scripts/acts/dungeons2'))
import d2common as C  # noqa
import export_runtime as E  # noqa
man = json.load(open(os.path.join(ROOT, 'public/acts-dungeons/manifest.json')))
art = os.path.join(a.work, 'art'); nav = os.path.join(a.work, 'nav'); os.makedirs(art, exist_ok=True); os.makedirs(nav, exist_ok=True)
ids = a.ids or list(man['dungeons'])
out = {'floors': {}, 'problems': [], 'mismatch': []}
for did in ids:
    for n in man['dungeons'][did]['authoredFloors']:
        fid = f'{did}-f{n}'; FL = man['floors'][fid]
        walk = os.path.join(ROOT, 'public/acts-dungeons', did, fid + '-walk.png')
        dst = os.path.join(art, fid + '-walk.png')
        if not os.path.exists(dst): os.symlink(walk, dst)
        sha = hashlib.sha256(open(C.plan_path(fid), 'rb').read()).hexdigest()[:16]
        aj = {'planSha': sha}
        if FL.get('over'): aj['over'] = FL['over']
        if FL.get('seal'): aj['seal'] = FL['seal']
        json.dump(aj, open(os.path.join(art, fid + '.art.json'), 'w'))
        probs = []
        try:
            res, st = E.build(fid, probs)
        except Exception as e:
            out['problems'].append(f'{fid}: build raised {e!r}'); print(fid, 'ERROR', e); continue
        out['problems'] += probs
        if not res: print(fid, 'no result', probs); continue
        fl, nj = res
        json.dump(nj, open(os.path.join(nav, fid + '.json'), 'w'))
        mm = []
        if fl['rows'] != FL['rows']: mm.append('rows')
        ka = sorted((x['kind'], x['x'], x['y']) for x in fl['assets']); kb = sorted((x['kind'], x['x'], x['y']) for x in FL['assets'])
        if ka != kb: mm.append('assets')
        if json.dumps(fl['land'], sort_keys=True) != json.dumps(FL['land'], sort_keys=True): mm.append('land')
        if mm: out['mismatch'].append({'floor': fid, 'what': mm})
        out['floors'][fid] = {'stats': st, 'problems': probs, 'mismatch': mm}
        print(f'{fid:24} standable {st["standableCells"]:4} lost {st["lost"]:3} comps {st["components"]:3} warn {len(st["warn"])} probs {len(probs)} mismatch {mm}', flush=True)
json.dump(out, open(os.path.join(a.work, 'make_nav.json'), 'w'), indent=1)
print('problems:', len(out['problems'])); [print('  ', p) for p in out['problems']]
print('mismatch:', out['mismatch'])
