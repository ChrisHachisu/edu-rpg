#!/bin/sh
set -eu

ROOT=${1:?repo root required}
ROOT=$(CDPATH= cd -- "$ROOT" && pwd -P)
cd "$ROOT"

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
python3 scripts/regenerate_pins.py --check

python3 scripts/runtime_baseline.py verify-act1 --input dist
python3 scripts/runtime_baseline.py verify-act1 --input ios/App/App/public --allow-capacitor-glue

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
