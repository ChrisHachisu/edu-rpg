#!/usr/bin/env python3
"""Assemble the explorer report from the run data.

  python3 scripts/auto/explore/gen_report.py

Reads  /home/user/work/explore/{defects.src.json, logs/*.log, census-*.jsonl, fuzz-*.jsonl, verify-*.jsonl}
Writes /mnt/project-files/edu-rpg/autoloop/explore/{REPORT.md, defects.json, shots/*.jpg}
defects.src.json is the curated list (hand-written: severity, title, where, what, repro, shot, evidence).
Everything under "Appendix" is generated from the data files.
"""
import json, os, re, shutil, glob

W = '/home/user/work/explore'
R = os.environ.get('X_REPORT', '/mnt/project-files/edu-rpg/autoloop/explore/')
os.makedirs(os.path.join(R, 'shots'), exist_ok=True)


def jl(name):
    p = os.path.join(W, name)
    return [json.loads(l) for l in open(p)] if os.path.exists(p) else []


def logtail(name, n=1):
    p = os.path.join(W, 'logs', name)
    if not os.path.exists(p):
        return None
    lines = [l.rstrip('\n') for l in open(p, errors='replace') if l.strip()]
    return lines[-n:] if lines else []


defs = json.load(open(os.path.join(W, 'defects.src.json')))
SEV = {'blocker': 0, 'major': 1, 'polish': 2, 'stale-probe': 3, 'harness': 4}
defs.sort(key=lambda d: (SEV.get(d['severity'], 9), d.get('rank', 50)))
for i, d in enumerate(defs, 1):
    d['id'] = d.get('id') or f'X{i:02d}'
    shots = []
    for s in d.get('shots', []):
        src = s if os.path.isabs(s) else os.path.join(W, s)
        if os.path.exists(src):
            dst = os.path.join(R, 'shots', d['id'] + '-' + os.path.basename(src).replace('.png', '.jpg'))
            if src.endswith('.png'):
                try:
                    from PIL import Image
                    Image.open(src).convert('RGB').save(dst, quality=80)
                except Exception:
                    shutil.copyfile(src, dst.replace('.jpg', '.png')); dst = dst.replace('.jpg', '.png')
            else:
                shutil.copyfile(src, dst)
            shots.append('shots/' + os.path.basename(dst))
        else:
            shots.append('MISSING ' + s)
    d['shotFiles'] = shots
json.dump(defs, open(os.path.join(R, 'defects.json'), 'w'), indent=1, ensure_ascii=False)

head = open(os.path.join(W, 'report-head.txt')).read() if os.path.exists(os.path.join(W, 'report-head.txt')) else '# Explorer report\n'
out = [head.rstrip() + '\n']
counts = {}
for d in defs:
    counts[d['severity']] = counts.get(d['severity'], 0) + 1
out.append('## Defects, ranked\n')
out.append('Counts: ' + ', '.join(f'{k} {v}' for k, v in sorted(counts.items(), key=lambda kv: SEV.get(kv[0], 9))) + '\n')
out.append('| id | severity | where | what |\n|---|---|---|---|')
for d in defs:
    out.append(f"| {d['id']} | {d['severity']} | {d['where']} | {d['title']} |")
out.append('')
for d in defs:
    out.append(f"### {d['id']} [{d['severity']}] {d['title']}\n")
    out.append(f"- **Where:** {d['where']}")
    out.append(f"- **What:** {d['what']}")
    if d.get('evidence'):
        out.append(f"- **Evidence:** {d['evidence']}")
    rp = d.get('repro') or {}
    if rp.get('save'):
        out.append('- **Seed save:** `' + json.dumps(rp['save'], ensure_ascii=False) + '` (lib.cjs `save()` fields; all other fields default)')
    if rp.get('steps'):
        out.append(f"- **Steps:** {rp['steps']}")
    if rp.get('command'):
        out.append(f"- **Command:** `{rp['command']}`")
    if d.get('fix'):
        out.append(f"- **Likely cause / fix hint:** {d['fix']}")
    if d['shotFiles']:
        out.append('- **Screenshot:** ' + ', '.join(f'[{os.path.basename(s)}]({s})' for s in d['shotFiles']))
    out.append('')

# ---------------- appendix
out.append('## Appendix A: baseline probe results (generated)\n')
out.append('| job | result line | rc |\n|---|---|---|')
summ = {}
for f in ('summary.txt', 'units-summary.txt', 'x-summary.txt'):
    p = os.path.join(W, 'logs', f)
    if os.path.exists(p):
        for l in open(p):
            m = re.match(r'(\S+) rc=(\d+)', l)
            if m:
                summ[m.group(1)] = (m.group(2), l.strip())
for job in sorted(summ):
    if not (job.startswith(('logic', 'towns', 'hosted', 'wind_gate', 'mouths', 'walk', 'resume', 'da-', 'mech-')) or '.unit' in job or job == '_b-unit'):
        continue
    rc = summ[job][0]
    tl = logtail(job + '.log', 1) if not ('.unit' in job or job == '_b-unit') else logtail('u-' + job + '.log', 1)
    last = (tl[0] if tl else '')[:160].replace('|', '/')
    out.append(f'| {job} | {last} | {rc} |')
out.append('')

out.append('## Appendix B: town census (generated)\n')
out.append('| town | flood points | NPCs (talk band points, 2 px lattice) | services (answering points / shadowed by NPC) | exit line points | problems |\n|---|---|---|---|---|---|')
seen = {}
for r in jl('census-towns.jsonl'):
    seen[r['town']] = r
for t, r in seen.items():
    if r.get('error'):
        out.append(f"| {t} | ERROR | {r['error'][:120]} | | | |"); continue
    npcs = ', '.join(f"{n['id']} {n['band']}" for n in r['npcs'])
    sv = ', '.join(f"{s['kind']} {s['hit']}/{s['shadowedByNpc']}" for s in r['services'])
    out.append(f"| {t} | {r['nodes']} | {npcs} | {sv} | {r['exit']['reachablePts']} | {'; '.join(r['problems']) or '-'} |")
out.append('')

out.append('## Appendix C: dungeon floor census (generated)\n')
out.append('Flood of the game\'s own `a1mFree` from the floor\'s arrival cell (4 px lattice). Targets: transitions 6/9/10/11/12 (entered), chest 4 / boss 7 / crystal 14 / plaque 18 (prompt or bump), mechanic objects (distance). '
           '"behind mechanic" = not reached from the arrival with the mechanic in its start state, but the exporter\'s grid (declared mechanic links) reaches it.\n')
out.append('| floor | flood nodes | targets | unreached: behind mechanic | unreached: other | note |\n|---|---|---|---|---|---|')
rows = {}
for r in jl('census-dungeons.jsonl'):
    rows[r['spec']] = r
for spec, r in rows.items():
    if r.get('error'):
        out.append(f"| {spec} | ERROR | | | | {r['error'][:140]} |"); continue
    beh, oth = [], []
    first = spec.endswith(':1')
    for t in r.get('unreached', []):
        lab = f"{t['t']}@{t['x']},{t['y']}"
        if t.get('nav') is not None and t['nav'] <= 14:
            beh.append(lab)
        elif t['t'] == 14 and t.get('dist', 99) <= 12:
            beh.append(lab + '(dormant crystal)')
        else:
            oth.append(lab + f" d={t.get('dist')} nav={t.get('nav')}")
    note = (f"reseeded {r['reseeded']}" if r.get('reseeded') else '') + ('' if r.get('startFree', True) else ' START NOT FREE')
    out.append(f"| {spec} | {r.get('nodes')} | {len(r.get('targets', []))} | {', '.join(beh) or '-'} | {', '.join(oth) or '-'} | {note} |")
out.append('')

out.append('## Appendix D: wander / wall-push fuzz (generated)\n')
out.append('| spot | seed | secs | rounds | moved px | events (non-door) | doors fired |\n|---|---|---|---|---|---|---|')
for r in jl('fuzz-walk.jsonl'):
    if r.get('error'):
        out.append(f"| {r['spot']} | {r['seed']} | | | | ERROR {r['error'][:100]} | |"); continue
    ev = [e for run in r['runs'] for e in run['ev']]
    nd = [f"{e['k']}" + (f"@{e.get('cell') or e.get('at')}" if e['k'] != 'teleport' else f" {e.get('d')}px") for e in ev if e['k'] not in ('door', 'battle')]
    dr = [f"{e['to']}{'' if e.get('floor', 1) == 1 else ' f' + str(e['floor'])} from {e.get('fromCell')}" for e in ev if e['k'] == 'door']
    out.append(f"| {r['spot']} | {r['seed']} | {r['secs']} | {len(r['runs'])} | {sum(x['moved'] for x in r['runs'])} | {'; '.join(nd) or '-'} | {'; '.join(dr) or '-'} |")
out.append('')

out.append('## Appendix E: menu / state fuzz checks (generated)\n')
out.append('| scenario | check | status |\n|---|---|---|')
for r in jl('fuzz-menu.jsonl'):
    for c in r['checks']:
        out.append(f"| {r['scenario']} | {c['what']} | {c['status']} |")
    if r.get('error'):
        out.append(f"| {r['scenario']} | scenario error: {r['error'][:140]} | ERROR |")
out.append('')

vt = jl('verify-towns.jsonl') + jl('verify-descend.jsonl')
if vt:
    out.append('## Appendix F: depth checks (generated)\n')
    for r in vt:
        out.append('- `' + json.dumps({k: v for k, v in r.items() if k not in ('errors',)}, ensure_ascii=False)[:900] + '`')
    out.append('')

open(os.path.join(R, 'REPORT.md'), 'w').write('\n'.join(out) + '\n')
print('wrote', os.path.join(R, 'REPORT.md'), len(defs), 'defects')
