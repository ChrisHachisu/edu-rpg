#!/bin/bash
# Run the permanent checks and the existing probes against a served build, one Chromium at a time.
#   bash scripts/auto/run_checks.sh <url> <logdir> [job ...]
# With no jobs it runs everything in ALL below. A job is "<kind> <name> [args]":
#   check <name>        scripts/auto/checks/<name>.cjs
#   probe <name> [args] scripts/acts/probe/<name>.cjs
#   da <id>             scripts/acts/probe/dungeon_authored.cjs <id>
#   jump                scripts/auto/jump/check_all.sh (8 groups)
# Summary: <logdir>/summary.txt, one line per job: name rc pass fail seconds. Exit 1 if any rc != 0.
# Start two of these with different job lists and log dirs to use two cores; never more than
# four Chromiums on the 4-core cloud box. Plans/nav for the dungeon probes:
#   D2_PLANS (default scripts/auto/feel/data/plans), D2_NAV (built with scripts/auto/explore/make_nav.py)
cd "$(dirname "$0")/../.."
URL=${1:?url}; LOG=${2:?logdir}; shift 2; mkdir -p "$LOG/tmp"
export NODE_PATH=${NODE_PATH:-/opt/node-tools/node_modules} PROBE_URL=$URL TMPDIR=$LOG/tmp
export D2_PLANS=${D2_PLANS:-$PWD/scripts/auto/feel/data/plans}
if [ -z "${D2_NAV:-}" ]; then
  [ -d "$LOG/d2nav/nav" ] || python3 scripts/auto/explore/make_nav.py --work "$LOG/d2nav" > "$LOG/make_nav.log" 2>&1
  export D2_NAV=$LOG/d2nav/nav
fi
ALL=("check bag" "check quests" "check keypad" "check ui-hud" "check ui-japanese" "check ui-screens" "check field-floor-label"
  "check field-arrival-messages" "check field-gust" "check field-glare" "check field-fog" "check field-town-reach"
  "check field-towns" "check ow-resume-teleport" "check dungeon-resume-floor" "check kid-timing" "check door-lips" "check balance" "jump"
  "probe logic" "probe towns" "probe hosted" "probe wind_gate" "probe mouths" "probe walk" "probe resume")
[ $# -gt 0 ] || set -- "${ALL[@]}"
RC=0
for job in "$@"; do
  set -- $job; kind=$1; shift
  case $kind in
    check) cmd="node scripts/auto/checks/$1.cjs"; name="check-$1"; shift;;
    probe) cmd="node scripts/acts/probe/$1.cjs"; name="probe-$1"; shift;;
    da) cmd="node scripts/acts/probe/dungeon_authored.cjs"; name="da-$1";;
    jump) cmd="sh scripts/auto/jump/check_all.sh 8 $LOG/jump"; name="jump";;
    *) echo "unknown job: $job" >&2; continue;;
  esac
  out=$LOG/out/$name; mkdir -p "$out"; t0=$(date +%s)
  PROBE_OUT=$out PT_DIR=$out PT_SHOTS=$out/shots/ timeout ${TMO:-3000} $cmd "$@" > "$LOG/$name.log" 2>&1; rc=$?
  # The older probes exit 0 whatever they found: their last line is "NAME n/m ..." or "{verdict} PASS|FAIL". Read it.
  if [ $kind = probe ] && [ $rc -eq 0 ]; then
    last=$(grep -v '^$' "$LOG/$name.log" | tail -1)
    case "$last" in
      *" FAIL"*) rc=9;;
      [A-Z]*" "[0-9]*/[0-9]*) set -- $last; [ "${2%/*}" = "${2#*/}" ] || rc=9;;
      *" PASS"*) ;;
      *) rc=8;;
    esac
  fi
  [ $rc -eq 0 ] || RC=1
  echo "$name rc=$rc pass=$(grep -c '\[PASS\]' "$LOG/$name.log") fail=$(grep -c '\[FAIL\]' "$LOG/$name.log") secs=$(( $(date +%s) - t0 ))" >> "$LOG/summary.txt"
done
exit $RC
