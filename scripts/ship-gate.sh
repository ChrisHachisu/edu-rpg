#!/bin/sh
set -eu

ROOT=${1:?repo root required}
shift
ROOT=$(CDPATH= cd -- "$ROOT" && pwd -P)
cd "$ROOT"
TERRAIN_PROFILE=historical
RELEASE_IDENTITY=""
IDENTITY_SHA256=""
TERRAIN_EVIDENCE=""
TERRAIN_EVIDENCE_SHA256=""
while [ "$#" -gt 0 ]; do
  case "$1" in
    --terrain-profile) [ "$#" -ge 2 ] || { echo "--terrain-profile needs a value" >&2; exit 2; }; TERRAIN_PROFILE=$2; shift 2 ;;
    --release-identity) [ "$#" -ge 2 ] || { echo "--release-identity needs a path" >&2; exit 2; }; RELEASE_IDENTITY=$2; shift 2 ;;
    --identity-sha256) [ "$#" -ge 2 ] || { echo "--identity-sha256 needs a value" >&2; exit 2; }; IDENTITY_SHA256=$2; shift 2 ;;
    --terrain-evidence) [ "$#" -ge 2 ] || { echo "--terrain-evidence needs a path" >&2; exit 2; }; TERRAIN_EVIDENCE=$2; shift 2 ;;
    --terrain-evidence-sha256) [ "$#" -ge 2 ] || { echo "--terrain-evidence-sha256 needs a value" >&2; exit 2; }; TERRAIN_EVIDENCE_SHA256=$2; shift 2 ;;
    *) echo "unknown ship-gate argument: $1" >&2; exit 2 ;;
  esac
done
case "$TERRAIN_PROFILE" in
  historical|act1-forward-20261007-v1) ;;
  *) echo "unknown terrain profile: $TERRAIN_PROFILE" >&2; exit 2 ;;
esac
if [ "$TERRAIN_PROFILE" = "act1-forward-20261007-v1" ]; then
  [ -n "$RELEASE_IDENTITY" ] && [ -n "$IDENTITY_SHA256" ] && \
    [ -n "$TERRAIN_EVIDENCE" ] && [ -n "$TERRAIN_EVIDENCE_SHA256" ] || {
      echo "forward shipping requires a sealed identity plus externally SHA-pinned terrain evidence" >&2; exit 1;
    }
  python3 scripts/verify_edu_rpg_release_identity.py candidate \
    --root "$ROOT" --identity "$RELEASE_IDENTITY" --identity-sha256 "$IDENTITY_SHA256" \
    --terrain-profile "$TERRAIN_PROFILE" --terrain-evidence "$TERRAIN_EVIDENCE" \
    --terrain-evidence-sha256 "$TERRAIN_EVIDENCE_SHA256"
elif [ -n "$TERRAIN_EVIDENCE" ] || [ -n "$TERRAIN_EVIDENCE_SHA256" ]; then
  echo "forward terrain evidence cannot be used with historical shipping" >&2; exit 2
fi

# The shipped shell, verified against the TRACKED source it is derived from.
#
# THIS RUNS FIRST, AND IT IS NOT REDUNDANT WITH ANYTHING BELOW.
# `cmp dist/index.html ios/App/App/public/index.html` further down looks like it checks the
# shell, but dist/ (.gitignore:2) and ios/App/App/public (ios/.gitignore:4) are BOTH untracked --
# so it only ever proved the two local copies agree with each other. Measured 2026-08-07: three
# worktrees carried three different shells (14414 B, 15094 B, 15479 B) and all three passed this
# gate, each perfectly self-consistent. A check with an untracked file on both sides cannot
# detect drift.
#
# Nor can the pins catch it. There is no public/index.html, so regenerate_pins.py resolves that
# pin out of dist/ -- run it against a stale hydrated dist and it SILENTLY re-pins the shell to
# the stale vintage, after which --check passes and verify-act1 agrees with the wrong file. The
# shell therefore cannot be verified downstream of the pins; it has to be anchored upstream of
# them, to root index.html and the sha in scripts/build_static_index.mjs.
node scripts/build_static_index.mjs --check

# The pins in runtime_baseline.py are GENERATED (scripts/regenerate_pins.py). Checking them
# here is what stops a branch shipping a hand-edited or merge-mangled hash: the gate below
# verifies dist against the pins, this verifies the pins against public/.
# The design-only walkable sketch must stay inert. Prose in its header did not hold -- it was
# read past twice, once at a cost of a measurement wrong by three orders of magnitude.
python3 scripts/check_walkable_authority.py
python3 scripts/check_town_transitions.py
# check_town_transitions.py only looks at the exit's OVERWORLD half. The IN-TOWN half was
# unguarded and got shipped wrong three builds running; this covers it.
python3 scripts/check_town_exits.py
# A dungeon entry carries no landing cell -- LANDMARKS give every cave the same leftover (50,1) and
# the player only reaches the mouth because that coordinate is illegal and the rescue fires.
python3 scripts/check_dungeon_entries.py
# Roofs are not floors. The colour classifiers cannot tell shingle from grass or slate from
# cobble, so building footprints are AUTHORED and this proves the derivation still honours
# them. See scripts/check_town_roofs.py for the measurements behind that.
python3 scripts/check_town_roofs.py
# Every actor stands on ground the collision allows AND can be reached from the spawn.
for T in millbrook greenhollow portSapphire; do python3 scripts/place_town_actors.py --town "$T"; done
# Standing on valid ground is not the same as being talkable: nearestNpc() only looks in the band
# BELOW an NPC, and authored building footprints can swallow that band whole.
python3 scripts/check_town_talkable.py
python3 scripts/regenerate_pins.py --check

if [ "$TERRAIN_PROFILE" = "act1-forward-20261007-v1" ]; then
  python3 scripts/runtime_baseline.py verify-act1 --input dist --terrain-profile "$TERRAIN_PROFILE" --qa-preparation
  python3 scripts/runtime_baseline.py verify-act1 --input ios/App/App/public --allow-capacitor-glue --terrain-profile "$TERRAIN_PROFILE" --qa-preparation
else
  python3 scripts/runtime_baseline.py verify-act1 --input dist --terrain-profile "$TERRAIN_PROFILE"
  python3 scripts/runtime_baseline.py verify-act1 --input ios/App/App/public --allow-capacitor-glue --terrain-profile "$TERRAIN_PROFILE"
fi

for FILE in dq-tiles.js hero-override.js ui-overhaul.js ui-overhaul.css; do
  cmp "public/$FILE" "dist/$FILE"
  cmp "dist/$FILE" "ios/App/App/public/$FILE"
done
cmp dist/index.html ios/App/App/public/index.html
cmp dist/assets/index-BhoGQRaA.js ios/App/App/public/assets/index-BhoGQRaA.js

node --check dist/assets/index-BhoGQRaA.js
node --check public/dq-tiles.js
node --check public/hero-override.js
node --check public/ui-overhaul.js

echo "SHIP GATE PASS: protected runtime verified; canonical overrides and iOS payload synchronized"
