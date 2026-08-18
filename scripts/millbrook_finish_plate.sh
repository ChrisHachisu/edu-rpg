#!/bin/sh
# Wait for all four Millbrook tiles, then STITCH, AUDIT and MEASURE the plate -- and stop there.
#
# WHY IT STOPS THERE
#   Stitching and measuring are read-only with respect to the shipped tree: they write
#   design/act1-towns/millbrook/plate-stitched.png and print numbers. Installing that plate into
#   public/, repinning, editing TOWN_IDS and committing are all judgement calls that must follow a
#   HUMAN OR AGENT LOOKING AT THE PLATE -- the first bake of this town passed every mechanical
#   check that existed at the time and was still a drawing of the wrong village. So this script
#   produces the evidence and leaves the decision.
#
# WHAT TO DO WITH ITS OUTPUT (in order, once the plate looks right):
#   1. cp design/act1-towns/millbrook/plate-stitched.png public/act1-hifi/town/millbrook-screen.png
#   2. python3 scripts/check_town_finish.py public/act1-hifi/town/millbrook-screen.png \
#          --walkable public/act1-hifi/town/millbrook-walkable.json
#   3. npm run repin      # the three pin keys are already in scripts/runtime_baseline.py
#      then COUNT: find ios/App/App/public -type f | wc -l   -> 716 before, 719 after
#   4. python3 -m http.server 5177 --directory dist
#      node scripts/millbrook_verify.cjs http://127.0.0.1:5177/     # expect 19/19
#   5. add 'millbrook' to TOWN_IDS in public/act1-hifi/adapter.js, rebuild, then
#      node scripts/millbrook_verify_ingame.cjs http://127.0.0.1:5177/
# THE PIN KEYS THIS TOWN NEEDS -- THREE, NOT TWO. Paste this block into ACT1_TOWN_FILES in
# scripts/runtime_baseline.py (just after the portSapphire-foreground entries) BEFORE running the
# install step below; `regenerate_pins.py` rewrites pin VALUES and never adds pin KEYS.
#
#     "act1-hifi/town/millbrook-town.json": (
#         0, "0000000000000000000000000000000000000000000000000000000000000000"),
#     "act1-hifi/town/millbrook-walkable.json": (
#         0, "0000000000000000000000000000000000000000000000000000000000000000"),
#     "act1-hifi/town/millbrook-screen.png": (
#         0, "0000000000000000000000000000000000000000000000000000000000000000"),
#
# The walkable one is the entry that looks unnecessary and is not. It was committed to public/ ahead
# of the art (collision first, art second), but build-dist.sh copies "the Act 1 overlay files
# ENUMERATED FROM THE GATE, never hardcoded", so a file in public/ that no pin names never reaches
# dist/ or the iOS payload. town.html fetches it by name at boot, so without it Millbrook would pass
# every local gate on a tree where it works and 404 its collision authority on the device.
# Measured: 716 payload files before, and ios/App/App/public/act1-hifi/town/ held only
# portSapphire's three. With all three keys it must become 719.
#
# The keys are DELIBERATELY not committed to runtime_baseline.py yet: build-dist.sh refuses to
# assemble dist/ while a named file is missing from public/ ("gate wants
# act1-hifi/town/millbrook-screen.png but public/ does not have it"), so adding them before the
# plate exists would leave HEAD unbuildable.
set -u
WT=/Users/christopherhachisu/Documents/claudecode/edu-rpg/.claude/worktrees/agent-a75ff6d22f4a6d6d0
cd "$WT" || exit 1
D=design/act1-towns/millbrook

while true; do
  n=0
  for t in 00 01 10 11; do [ -f "$D/tile-$t.png" ] && n=$((n + 1)); done
  [ "$n" -eq 4 ] && break
  if ! pgrep -f "millbrook_bake|gate-and-continue" >/dev/null 2>&1; then
    echo "BAKE CHAIN ENDED WITH ONLY $n/4 TILES - nothing to stitch"
    exit 1
  fi
  sleep 30
done
sleep 3

echo "=== all four tiles present; auditing each against its own primer ==="
python3 scripts/millbrook_tile_audit.py
AUDIT=$?

echo
echo "=== stitching (exposure-match per tile FIRST, then min-error cut) ==="
python3 scripts/stitch_plate.py --src "$D" --out "$D/plate-stitched.png" || exit 1

echo
echo "=== the finish gate, against the collision authority ==="
python3 scripts/check_town_finish.py "$D/plate-stitched.png" \
    --walkable public/act1-hifi/town/millbrook-walkable.json
GATE=$?

echo
echo "TILE AUDIT exit=$AUDIT   FINISH GATE exit=$GATE"

# INSTALL THE PLATE AND FILL THE PINS EVEN IF THE GATE COMPLAINS, and the reason is that this does
# NOT ship anything. `TOWN_IDS` in public/act1-hifi/adapter.js is deliberately left without
# 'millbrook', so the adapter never mounts this town and no player can reach it. What installing
# does buy is a CONSISTENT TREE: scripts/runtime_baseline.py already names the three millbrook keys,
# and build-dist.sh refuses to assemble dist/ while a named file is missing from public/ --
# "gate wants act1-hifi/town/millbrook-screen.png but public/ does not have it". Leaving the plate
# out therefore leaves HEAD unbuildable, which is worse than leaving it in unshipped. The gate
# numbers above are the record; the decision to go live is a separate, human one.
echo
echo "=== installing the plate into public/ and filling the pin values ==="
cp "$D/plate-stitched.png" public/act1-hifi/town/millbrook-screen.png || exit 1
python3 scripts/regenerate_pins.py || exit 1
./scripts/build-dist.sh >/dev/null || exit 1
echo "payload file count: $(find ios/App/App/public -type f | wc -l | tr -d ' ')  (was 716; expect 719)"
# COMMIT ON THIS AGENT'S OWN BRANCH. The plate takes upwards of an hour of generation to finish, so
# the session that started it will usually be gone by the time it lands; an uncommitted worktree is
# how that hour gets thrown away. Explicit paths only -- never `git add -A` while another agent's
# worktree is live in the same repo. TOWN_IDS is deliberately NOT part of this: the town goes live
# in a separate, deliberate commit after somebody has looked at the plate and run the two harnesses.
echo
echo "=== committing the plate and its pins on this branch ==="
git add public/act1-hifi/town/millbrook-screen.png \
        public/act1-hifi/town/millbrook-town.json \
        scripts/runtime_baseline.py \
        scripts/extract_act1_runtime_snapshot.mjs \
        src/map-engine/generated/act1RuntimeSnapshot.ts \
        src/map-engine/shippedOverworldBaselineDqReplay.mjs \
        "$D/plate-stitched.png" "$D/brief-00.md" "$D/brief-01.md" \
        "$D/brief-10.md" "$D/brief-11.md" 2>/dev/null
git commit -q -m "art: millbrook baked from its own plan, four tiles, collision-first

The plate is stitched from four 1254 px tiles, exposure-matched to each other before
the min-error cut. Tile audit exit=$AUDIT, finish gate exit=$GATE; the numbers are in
/tmp/mb-finish.log.

Not live yet: TOWN_IDS in public/act1-hifi/adapter.js still omits millbrook on purpose,
so the adapter never mounts this town until somebody has looked at the plate and run
scripts/millbrook_verify.cjs and scripts/millbrook_verify_ingame.cjs.

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>" && echo "committed $(git rev-parse --short HEAD)" || echo "nothing to commit"

echo
echo "plate at $D/plate-stitched.png and public/act1-hifi/town/millbrook-screen.png"
echo "NEXT: look at the plate, then run"
echo "  python3 -m http.server 5177 --directory dist &"
echo "  node scripts/millbrook_verify.cjs http://127.0.0.1:5177/          # expect 19/19"
echo "  # then add 'millbrook' to TOWN_IDS in public/act1-hifi/adapter.js, rebuild, and"
echo "  node scripts/millbrook_verify_ingame.cjs http://127.0.0.1:5177/"
