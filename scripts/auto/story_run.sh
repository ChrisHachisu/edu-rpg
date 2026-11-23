#!/bin/bash
# Full story run: the playthrough segments chained by the game's own save, one browser at a time.
#   sh scripts/auto/story_run.sh <url> <dir>
# Rows: <dir>/rows.jsonl, screenshots <dir>/shots/, one log per segment, summary in <dir>/summary.txt.
# A segment that fails still hands its save on, so later acts are tested; a segment that writes no
# save stops the chain. Exit 1 if any segment failed.
cd "$(dirname "$0")/../.."
URL=${1:?url}; DIR=${2:?dir}; mkdir -p "$DIR/shots" "$DIR/tmp"
export NODE_PATH=${NODE_PATH:-/opt/node-tools/node_modules} PROBE_URL=$URL PT_DIR=$DIR PT_SHOTS=$DIR/shots/ PROBE_OUT=$DIR/probe-out TMPDIR=$DIR/tmp
export D2_PLANS=${D2_PLANS:-$PWD/scripts/auto/feel/data/plans}
if [ -z "${D2_NAV:-}" ]; then
  [ -d "$DIR/d2nav/nav" ] || python3 scripts/auto/explore/make_nav.py --work "$DIR/d2nav" > "$DIR/make_nav.log" 2>&1
  export D2_NAV=$DIR/d2nav/nav
fi
RC=0; IN=new
for SEG in ${SEGS:-a1 a1b a2 a2b a3 a4 a5 a5b a5c}; do
  t0=$(date +%s)
  timeout ${TMO:-2400} node scripts/acts/probe/playthrough/pt.cjs $SEG $IN s-$SEG > "$DIR/$SEG.log" 2>&1; rc=$?
  [ $rc -eq 0 ] || RC=1
  echo "$SEG rc=$rc $(grep -E '^pt ' "$DIR/$SEG.log" | tail -1) secs=$(( $(date +%s) - t0 ))" >> "$DIR/summary.txt"
  [ -s "$DIR/s-$SEG.json" ] || { echo "$SEG wrote no save: chain stopped" >> "$DIR/summary.txt"; exit 1; }
  IN=$DIR/s-$SEG.json
done
exit $RC
