#!/usr/bin/env python3
"""Re-stamp the pins a cloud checkout CAN stamp after an intentional edit of public/dq-tiles.js,
public/ui-overhaul.js or index.html, and print every value so the Mac can confirm it.

    python3 scripts/acts/restamp_cloud_pins.py            # rewrite
    python3 scripts/acts/restamp_cloud_pins.py --check    # exit 1 if any pin is stale

This is NOT `npm run repin` / scripts/repin.sh (never run those in the cloud: they rebuild dist/).
It only rewrites VALUES of pins that already exist:
  dq-tiles.js    scripts/runtime_baseline.py tuple (bytes, sha)
                 scripts/extract_act1_runtime_snapshot.mjs  DQ_TILES_SHA256
                 src/map-engine/shippedOverworldBaselineDqReplay.mjs  DQ_SHA
                 src/map-engine/generated/act1RuntimeSnapshot.ts  ACT1_RUNTIME_SNAPSHOT_DQ_TILES_SHA256
  ui-overhaul.js scripts/runtime_baseline.py tuple (bytes, sha)
  static shell   scripts/build_static_index.mjs EXPECTED_STATIC_INDEX_SHA and the
                 scripts/runtime_baseline.py "index.html" tuple (bytes, sha), derived from index.html
Not touched (Mac only): ACT1_PAINT_MANIFEST_SHA256 / ACT1_PAINT_UNDERPAINT, the forward terrain
profile descriptor (act1-hifi/adapter.js sha), anything scripts/regenerate_pins.py reads from dist/.
"""
import hashlib, os, re, subprocess, sys

ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), '..', '..'))
CHECK = '--check' in sys.argv
stale = []


def ident(data):
    return len(data), hashlib.sha256(data).hexdigest()


def sub(path, pattern, repl, label):
    p = os.path.join(ROOT, path)
    s = open(p, encoding='utf-8').read()
    new, n = re.subn(pattern, repl, s, count=1, flags=re.S)
    assert n == 1, f'{label}: pattern not found in {path}'
    if new != s:
        stale.append(f'{path}: {label}')
        if not CHECK: open(p, 'w', encoding='utf-8').write(new)


def main():
    dq = ident(open(os.path.join(ROOT, 'public/dq-tiles.js'), 'rb').read())
    ui = ident(open(os.path.join(ROOT, 'public/ui-overhaul.js'), 'rb').read())
    shell = subprocess.run(['node', '--input-type=module', '-e',
                            "import { deriveStaticIndex } from './scripts/build_static_index.mjs'; process.stdout.write(await deriveStaticIndex());"],
                           cwd=ROOT, capture_output=True, check=True).stdout
    sh = ident(shell)
    sub('scripts/runtime_baseline.py', r'("dq-tiles\.js": \(\s*)\d+, "[0-9a-f]{64}"\)', rf'\g<1>{dq[0]}, "{dq[1]}")', 'dq-tiles tuple')
    sub('scripts/extract_act1_runtime_snapshot.mjs', r"(const DQ_TILES_SHA256 = ')[0-9a-f]{64}'", rf"\g<1>{dq[1]}'", 'DQ_TILES_SHA256')
    sub('src/map-engine/shippedOverworldBaselineDqReplay.mjs', r"(const DQ_SHA = ')[0-9a-f]{64}'", rf"\g<1>{dq[1]}'", 'DQ_SHA')
    sub('src/map-engine/generated/act1RuntimeSnapshot.ts', r"(ACT1_RUNTIME_SNAPSHOT_DQ_TILES_SHA256 = ')[0-9a-f]{64}'", rf"\g<1>{dq[1]}'", 'snapshot dq sha')
    sub('scripts/runtime_baseline.py', r'("ui-overhaul\.js": \(\s*)\d+, "[0-9a-f]{64}"\)', rf'\g<1>{ui[0]}, "{ui[1]}")', 'ui-overhaul tuple')
    sub('scripts/build_static_index.mjs', r"(export const EXPECTED_STATIC_INDEX_SHA =\s*')[0-9a-f]{64}'", rf"\g<1>{sh[1]}'", 'EXPECTED_STATIC_INDEX_SHA')
    sub('scripts/runtime_baseline.py', r'("index\.html": \()\d+, "[0-9a-f]{64}"\)', rf'\g<1>{sh[0]}, "{sh[1]}")', 'index.html tuple')
    print(f'public/dq-tiles.js    {dq[0]} B  {dq[1]}')
    print(f'public/ui-overhaul.js {ui[0]} B  {ui[1]}')
    print(f'static shell          {sh[0]} B  {sh[1]}')
    if CHECK and stale:
        print('STALE PINS:', *stale, sep='\n  '); sys.exit(1)
    print(('re-stamped: ' + ', '.join(stale)) if stale else 'all cloud-stampable pins already match')


if __name__ == '__main__':
    main()
