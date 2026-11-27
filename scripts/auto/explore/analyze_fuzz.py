#!/usr/bin/env python3
"""Triage the wander fuzz (fuzz-walk.jsonl): every non-door event, and every overworld door that
fired with her centre cell more than 1.5 cells from that door's own cell (`at`), or from the side
opposite its gate (a door firing from the wrong side), using the acts manifest + Act 1 landmarks.
  python3 scripts/auto/explore/analyze_fuzz.py  -> prints, and writes /home/user/work/explore/fuzz-triage.json
"""
import json, os, re
ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), '../../..'))
W = '/home/user/work/explore'
acts = json.load(open(os.path.join(ROOT, 'public/acts-hifi/manifest.json')))
src = open(os.path.join(ROOT, 'public/act1-world-map.js')).read()
a1 = json.loads(re.search(r'var LANDMARKS = (\[.*?\]);', src).group(1))
doors = [{'id': l.get('virtual') or l['mapId'], 'at': l['at'], 'exit': l['exit'], 'gate': l.get('gate')} for l in acts['landmarks']]
doors += [{'id': l['mapId'], 'at': [l['at']['x'], l['at']['y']], 'exit': [l['exit']['x'], l['exit']['y']], 'gate': None} for l in a1]
out = {'events': [], 'doors': []}
for line in open(os.path.join(W, 'fuzz-walk.jsonl')):
    r = json.loads(line)
    for i, run in enumerate(r.get('runs', [])):
        for e in run['ev']:
            if e['k'] == 'battle':
                continue
            if e['k'] != 'door':
                out['events'].append({'spot': r['spot'], 'seed': r['seed'], 'round': i + 1, **e}); continue
            if not r['spot'].startswith('ow:') and e.get('to') != 'overworld':
                continue
            fc = e.get('fromCell')
            # which door: the one named by the target map with the nearest `at`
            cands = [d for d in doors if d['id'] == e['to']] or doors
            if not fc or e['to'] == 'overworld' or e.get('to') == r['spot'].split(':')[0]:
                continue
            d = min(cands, key=lambda d: abs(d['at'][0] - fc[0]) + abs(d['at'][1] - fc[1]))
            dist = abs(d['at'][0] - fc[0]) + abs(d['at'][1] - fc[1])
            side = (fc[0] - d['at'][0], fc[1] - d['at'][1])
            ex = (d['exit'][0] - d['at'][0], d['exit'][1] - d['at'][1])
            wrong = (side[0] * ex[0] + side[1] * ex[1]) < 0
            row = {'spot': r['spot'], 'seed': r['seed'], 'round': i + 1, 'to': e['to'], 'door': d['at'], 'exitSide': ex, 'fromCell': fc, 'heading': e.get('heading'), 'dist': dist, 'wrongSide': wrong}
            out['doors'].append(row)
for e in out['events']:
    print('EVENT', json.dumps(e))
for d in out['doors']:
    flag = ' <-- far' if d['dist'] > 1 else ''
    flag += ' <-- WRONG SIDE' if d['wrongSide'] else ''
    print('DOOR', json.dumps(d) + flag)
json.dump(out, open(os.path.join(W, 'fuzz-triage.json'), 'w'), indent=1)
