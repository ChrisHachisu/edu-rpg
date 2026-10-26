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
m['collision']['sha256'] = sha(m['collision']['artifact'])
open(H / 'manifest.json', 'w').write(json.dumps(m, indent=2, ensure_ascii=False) + '\n')
print('chunks', len(m['chunks']), 'collision', m['collision']['sha256'][:16])
