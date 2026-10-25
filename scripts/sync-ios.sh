#!/bin/bash
# Mirror dist/ into the iOS bundle, then prove it with the project's own gate.
#
# WHY THIS EXISTS
# Each concurrent workstream used to sync only its own files ("cp dist/act1-hifi/...").
# Followed faithfully by three sessions that produced an app made of four vintages:
# act1-world-map.js and dq-tiles.js two days stale, act1-dungeon-floors.json absent
# entirely, towns current. Nobody noticed because nothing checked. Sync the WHOLE tree
# or you are shipping a guess.
#
# TWO TRAPS, BOTH HIT FOR REAL ON 2026-08-03
#   1. --delete without excludes removes cordova.js / cordova_plugins.js. Capacitor
#      generates those into the native project; dist/ has never contained them, and the
#      app will not boot without them.
#   2. No --delete at all leaves SUPERSEDED files behind. The r26 re-bake moved the
#      overworld chunks from base/*.png + occlusion/*.png to base/*.webp + canopy/*.webp;
#      a plain additive copy left the app carrying both generations, 60 dead files.
# So: --delete, plus an explicit exclude for the Capacitor glue. Nothing else.
set -euo pipefail
cd "$(dirname "$0")/.."
TERRAIN_PROFILE=historical
QA_PREPARATION=0
while [ "$#" -gt 0 ]; do
  case "$1" in
    --terrain-profile) [ "$#" -ge 2 ] || { echo "--terrain-profile needs a value" >&2; exit 2; }; TERRAIN_PROFILE=$2; shift 2 ;;
    --qa-preparation) QA_PREPARATION=1; shift ;;
    *) echo "usage: $0 [--terrain-profile historical|act1-forward-20261007-v1] [--qa-preparation]" >&2; exit 2 ;;
  esac
done
case "$TERRAIN_PROFILE" in
  historical|act1-forward-20261007-v1) ;;
  *) echo "unknown terrain profile: $TERRAIN_PROFILE" >&2; exit 2 ;;
esac
if [ "$QA_PREPARATION" -eq 1 ] && [ "$TERRAIN_PROFILE" != "act1-forward-20261007-v1" ]; then
  echo "--qa-preparation requires --terrain-profile act1-forward-20261007-v1" >&2; exit 2
fi
if [ "$TERRAIN_PROFILE" = "act1-forward-20261007-v1" ]; then
  if [ "$QA_PREPARATION" -eq 1 ]; then
    python3 scripts/runtime_baseline.py verify-forward-terrain-preparation
  else
    python3 scripts/runtime_baseline.py verify-forward-terrain-source
  fi
fi

DEST="ios/App/App/public"

echo "==> mirroring dist/ -> $DEST"
rsync -rc --delete \
  --exclude 'cordova.js' \
  --exclude 'cordova_plugins.js' \
  dist/ "$DEST/"

# The Capacitor glue must survive; if it is missing the app white-screens on launch.
for glue in cordova.js cordova_plugins.js; do
  [ -f "$DEST/$glue" ] || { echo "FATAL: $DEST/$glue missing after sync"; exit 1; }
done

echo "==> verifying the mirrored tree against the Act 1 overlay baseline"
VERIFY_ARGS=(--input "$DEST" --allow-capacitor-glue --terrain-profile "$TERRAIN_PROFILE")
if [ "$QA_PREPARATION" -eq 1 ]; then VERIFY_ARGS+=(--qa-preparation); fi
python3 scripts/runtime_baseline.py verify-act1 "${VERIFY_ARGS[@]}"

if [ "$QA_PREPARATION" -eq 1 ]; then
  echo "QA_PREPARATION_PASS releaseEligible=false: $DEST matches dist/ static closure"
else
  echo "SYNC OK: $DEST matches dist/ and passes the Act 1 overlay gate"
fi
