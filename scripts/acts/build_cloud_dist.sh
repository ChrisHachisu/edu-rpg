#!/bin/sh
# Assemble a PLAYABLE dist in the cloud (or any fresh checkout) without the ship gate.
#
#   sh scripts/acts/build_cloud_dist.sh /home/user/work/dist
#
# Recipe: docs/plans/2026-10-28-acts2-5-runtime-wiring.md section 0. It never runs Vite/npm
# (AGENTS.md rule 1), never touches assets/monsters (rule 9) and never writes into the
# repository's own dist/ (scripts/build-dist.sh owns that one and needs the Mac's pins).
#   1. hydrate the frozen runtime baseline (257 files, bundle md5 f7095264...)
#   2. copy the tracked public/ overrides over it, including the Acts 2-5 folders
#      (acts-hifi/, act2-hifi/ ... act5-hifi/)
#   3. derive the static shell from the tracked index.html (same transform as
#      scripts/build_static_index.mjs, written to the chosen output instead of ./dist)
# Serve with: python3 -m http.server 5174 --directory <out>
set -eu
cd "$(dirname "$0")/../.."
OUT=${1:?usage: build_cloud_dist.sh <output dir>}
case "$OUT" in /*) ;; *) echo "output must be an absolute path" >&2; exit 2 ;; esac
[ "$OUT" != "$(pwd -P)/dist" ] || { echo "refusing the repository dist/: use scripts/build-dist.sh" >&2; exit 2; }
rm -rf "$OUT"
python3 scripts/runtime_baseline.py hydrate --output "$OUT"
for ITEM in act1-dungeon-art act1-dungeon-floors.json act1-hifi act1-overworld-walk.bin act1-world-map.js \
            audio battle-recovery.js fonts materials music-override.js owprops props ui-icons ui-map \
            ui-overhaul.css ui-overhaul.js dq-tiles.js hero-override.js \
            acts-hifi act2-hifi act3-hifi act4-hifi act5-hifi; do
  [ -e "public/$ITEM" ] || continue
  if [ -d "public/$ITEM" ]; then mkdir -p "$OUT/$ITEM"; cp -R "public/$ITEM/." "$OUT/$ITEM/"; else cp "public/$ITEM" "$OUT/$ITEM"; fi
done
mkdir -p "$OUT/assets/hero" "$OUT/assets/npcs"
cp public/assets/hero/* "$OUT/assets/hero/"
cp public/assets/npcs/* "$OUT/assets/npcs/"
node --input-type=module -e "
import { deriveStaticIndex, sha256, EXPECTED_STATIC_INDEX_SHA } from './scripts/build_static_index.mjs';
import { writeFileSync } from 'node:fs';
const html = await deriveStaticIndex();
writeFileSync(process.argv[1] + '/index.html', html);
const sha = sha256(html);
console.log('shell', Buffer.byteLength(html), 'B', sha, sha === EXPECTED_STATIC_INDEX_SHA ? '(matches pin)' : '(PIN STALE: ' + EXPECTED_STATIC_INDEX_SHA.slice(0, 12) + ')');
" "$OUT"
BUNDLE="$OUT/assets/index-BhoGQRaA.js"
SIZE=$(wc -c < "$BUNDLE")
[ "$SIZE" -gt 4500000 ] && [ "$SIZE" -lt 5500000 ] || { echo "bundle size $SIZE outside 4.5-5.5 MB" >&2; exit 1; }
echo "CLOUD DIST OK: $OUT (bundle $SIZE B, md5 $(md5sum "$BUNDLE" | cut -c1-8))"
