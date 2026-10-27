#!/usr/bin/env python3
"""Build 87: re-stamp public/act1-hifi/manifest.json for the regenerated base / water-r2 chunks,
the new foam layer and the trimmed forest-collision.bin. Formatting matches the shipped manifest."""
import hashlib, json
from pathlib import Path
H = Path(__file__).resolve().parents[2] / 'public/act1-hifi'
sha = lambda p: hashlib.sha256((H / p).read_bytes()).hexdigest()
m = json.load(open(H / 'manifest.json'))
for c in m['chunks']:
    c['baseSha256'] = sha(c['base'])
    c['waterSha256'] = sha(c['water'])
    foam = f"chunks/foam/{c['id']}.png"
    if (H / foam).exists():
        c['foam'] = foam; c['foamSha256'] = sha(foam)
    # Build 89: forest/front art changed too, and each water chunk gains 4 moving-water crest frames.
    for k in ('forest', 'front'):
        if c.get(k): c[k + 'Sha256'] = sha(c[k])
    # Build 90: 3 half-res crest frames; drop any stale crest keys first (build 89 had 4).
    for k in [k for k in c if k.startswith('crest')]: del c[k]
    for i in range(3):
        crest = f"chunks/crest/{c['id']}-{i}.png"
        if (H / crest).exists():
            c[f'crest{i}'] = crest; c[f'crest{i}Sha256'] = sha(crest)
m['collision']['sha256'] = sha(m['collision']['artifact'])
open(H / 'manifest.json', 'w').write(json.dumps(m, indent=2, ensure_ascii=False) + '\n')
print('chunks', len(m['chunks']), 'collision', m['collision']['sha256'][:16])
