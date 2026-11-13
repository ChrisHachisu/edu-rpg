#!/bin/sh
# Refresh the Acts 2-5 parts of a cloud dist built by scripts/acts/build_cloud_dist.sh, without
# re-copying the 300 MB that did not change.   sh scripts/acts/sync_cloud_dist.sh /home/user/work/dist
set -eu
cd "$(dirname "$0")/../.."
OUT=${1:?usage: sync_cloud_dist.sh <cloud dist>}
[ -f "$OUT/assets/index-BhoGQRaA.js" ] || { echo "not a built dist: $OUT" >&2; exit 2; }
[ "$OUT" != "$(pwd -P)/dist" ] || { echo "refusing the repository dist/" >&2; exit 2; }
for D in acts-hifi act2-hifi act3-hifi act4-hifi act5-hifi; do
  rm -rf "$OUT/$D"; [ -d "public/$D" ] && cp -R "public/$D" "$OUT/$D"
done
mkdir -p "$OUT/act1-hifi/town/npc"
cp public/act1-hifi/town/*.* "$OUT/act1-hifi/town/"
cp public/act1-hifi/town/npc/* "$OUT/act1-hifi/town/npc/"
cp public/act1-hifi/adapter.js public/act1-hifi/town.html "$OUT/act1-hifi/"
cp -R public/ui-map/. "$OUT/ui-map/"
for F in dq-tiles.js hero-override.js ui-overhaul.js ui-overhaul.css act1-world-map.js battle-recovery.js; do cp "public/$F" "$OUT/$F"; done
node --input-type=module -e "
import { deriveStaticIndex } from './scripts/build_static_index.mjs';
import { writeFileSync } from 'node:fs';
writeFileSync(process.argv[1] + '/index.html', await deriveStaticIndex());" "$OUT"
echo "synced $OUT"
