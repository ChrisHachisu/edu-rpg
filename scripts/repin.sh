#!/bin/sh
# One command for "I edited something in public/, now make the tree consistent again."
#
# WHY THIS EXISTS
#   Editing public/dq-tiles.js used to require six steps in an exact order, two of which were
#   hand-edited SHA constants buried in unrelated files. Every agent that touched that file on
#   2026-08-07/08 hit the same wall, and so did the orchestrator: the chain fails at step 2 with
#
#       RUNTIME BASELINE ERROR: Act 1 runtime identity mismatch: dq-tiles.js
#
#   which says what is wrong and nothing about what to do. The recipe lived in prose, in a relay
#   file, and in each brief -- three copies, none of them runnable. This is the runnable one.
#
# WHAT IT DOES, IN THE ORDER THAT MATTERS
#   1. build-dist.sh            -- assemble dist/ + the iOS payload from tracked sources
#   2. re-stamp the two hand-edited SHAs of public/dq-tiles.js:
#        scripts/extract_act1_runtime_snapshot.mjs      (DQ_TILES_SHA256)
#        src/map-engine/shippedOverworldBaselineDqReplay.mjs (DQ_SHA)
#      These are deliberate tripwires, not accidents: they exist so a dq-tiles change cannot land
#      silently. Re-stamping them is the correct response to an INTENTIONAL edit -- never a way to
#      make an unexplained mismatch go away. If you did not mean to change dq-tiles.js, stop.
#   3. extract_act1_runtime_snapshot.mjs                -- regenerates the generated snapshot .ts
#                                                          (NEVER hand-edit that file)
#   4. regenerate_pins.py       -- rewrites pin VALUES. It does not add pin KEYS: a newly pinned
#                                 file needs its entry added by hand, with placeholder zeros, first.
#   5. build-dist.sh again      -- dist/ must carry the post-repin files
#   6. both gates
#
# WHAT IT WILL NOT DO
#   It never runs `npm run build`, `npm run dev` or vite. dist/assets/index-BhoGQRaA.js was
#   hand-edited after compilation and a recompile silently deletes the entire DOM UI
#   (docs/SOURCE-BUNDLE-DRIFT.md). The md5 is asserted at the end; if it moved, something ran a
#   real build and the tree must not be trusted.
set -eu
cd "$(dirname "$0")/.."

FROZEN=60d90b63607b6e6980eb170aeeed445e

# ORDER MATTERS, and not in the obvious way. build-dist.sh verifies pinned identity as part of
# assembling dist/, so running it FIRST on an edited public/ file fails before anything can be
# re-stamped -- the first draft of this script did exactly that and tripped its own error message.
# The overrides must reach dist/ and the pins must be regenerated BEFORE the first full assemble.
echo "==> [1/6] staging the edited overrides into dist/ and repinning"
for f in dq-tiles.js hero-override.js ui-overhaul.js ui-overhaul.css; do
  [ -f "dist/$f" ] && cp "public/$f" "dist/$f"
done

NEW_SHA=$(shasum -a 256 public/dq-tiles.js | awk '{print $1}')
OLD_SHA=$(grep -o "DQ_TILES_SHA256 = '[0-9a-f]*'" scripts/extract_act1_runtime_snapshot.mjs | grep -o "[0-9a-f]\{64\}")
if [ "$NEW_SHA" != "$OLD_SHA" ]; then
  echo "==> [2/6] re-stamping the two hand-edited dq-tiles SHAs"
  echo "         ${OLD_SHA} -> ${NEW_SHA}"
  sed -i '' "s/${OLD_SHA}/${NEW_SHA}/" \
    scripts/extract_act1_runtime_snapshot.mjs \
    src/map-engine/shippedOverworldBaselineDqReplay.mjs
else
  echo "==> [2/6] dq-tiles.js unchanged; SHAs already current"
fi

echo "==> [3/6] regenerating pins against the edited files"
python3 scripts/regenerate_pins.py

echo "==> [4/6] assembling dist/ and the iOS payload"
./scripts/build-dist.sh >/dev/null

echo "==> [5/6] regenerating the Act 1 runtime snapshot, then repinning it"
node scripts/extract_act1_runtime_snapshot.mjs
python3 scripts/regenerate_pins.py
./scripts/build-dist.sh >/dev/null

echo "==> [6/6] gates"
npm run --silent test:map-engine
./scripts/ship-gate.sh .

GOT=$(md5 -q dist/assets/index-BhoGQRaA.js)
if [ "$GOT" != "$FROZEN" ]; then
  echo
  echo "STOP: the frozen bundle changed ($GOT != $FROZEN)."
  echo "Something ran a real build. The DOM UI is probably gone. Do not commit this tree."
  exit 1
fi

echo
echo "REPIN OK: pins consistent, both gates green, frozen bundle intact."
echo "Reminder: stage explicit paths. Never 'git add -A' while other worktrees are live."
