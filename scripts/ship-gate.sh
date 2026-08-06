#!/bin/sh
set -eu

ROOT=${1:?repo root required}
ROOT=$(CDPATH= cd -- "$ROOT" && pwd -P)
cd "$ROOT"

# The pins in runtime_baseline.py are GENERATED (scripts/regenerate_pins.py). Checking them
# here is what stops a branch shipping a hand-edited or merge-mangled hash: the gate below
# verifies dist against the pins, this verifies the pins against public/.
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
