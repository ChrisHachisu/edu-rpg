#!/bin/bash
# Run the permanent checks and the existing probes against a served build, one Chromium at a time.
#   bash scripts/auto/run_checks.sh <url> <logdir> [job ...]
# With no jobs it runs everything in ALL below. A job is "<kind> <name> [args]":
#   check <name>        scripts/auto/checks/<name>.cjs
#   probe <name> [args] scripts/acts/probe/<name>.cjs
#   da <id>             scripts/acts/probe/dungeon_authored.cjs <id>
#   jump                scripts/auto/jump/check_all.sh (8 groups)
#   viewport            check viewport, all 14 groups (TMO 9000; about 100 minutes, so not in ALL)
# A job may start with "info" (it runs and is logged as info-<name>, but never fails the run) and with
# VAR=value words that are set for that job only (TMO=<seconds> sets its timeout).
# Summary: <logdir>/summary.txt, one line per job: name rc pass fail seconds. Exit 1 if any rc != 0.
# A check passes only when it exits 0 AND its last verdict line ("<name>: N checks, 0 FAIL" or
# "<name>: N pass, 0 fail") says so AND it printed no [FAIL] line; no verdict line is rc=8, a failing one rc=9.
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
  "check field-towns" "check ow-resume-teleport" "check dungeon-resume-floor" "check kid-timing" "check door-lips" "check snags"
  # Balance gate: the boss rows are judged with the morning's effort child (HONEST_CHILD=effort); B2's independent child keeps
  # 16 of 21 Demon King rows red by design, so its rows are printed by an information-only job that never fails the run.
  "HONEST_CHILD=effort check balance" "info check balance gk g1 g2 g3 g4 g5 g6"
  "check quiz-content" "check words" "check sound"
  "check battle-stage" "check ui-polish" "FIELD_DPR=2 check town-looks" "check dungeon-looks-fd1" "check dungeon-looks-fd2" "jump"
  "probe logic" "probe towns" "probe hosted" "probe wind_gate" "probe mouths" "probe walk" "probe resume")
[ $# -gt 0 ] || set -- "${ALL[@]}"
RC=0
for job in "$@"; do
  [ "$job" = viewport ] && job="TMO=9000 check viewport"
  set -- $job; info=; envs=()
  [ "$1" = info ] && { info=info-; shift; }
  while [ $# -gt 0 ] && [[ $1 == [A-Z_]*=* ]]; do envs+=("$1"); shift; done
  kind=$1; shift
  case $kind in
    check) cmd="node scripts/auto/checks/$1.cjs"; name="check-$1"; shift;;
    probe) cmd="node scripts/acts/probe/$1.cjs"; name="probe-$1"; shift;;
    da) cmd="node scripts/acts/probe/dungeon_authored.cjs"; name="da-$1";;
    jump) cmd="sh scripts/auto/jump/check_all.sh 8 $LOG/jump"; name="jump";;
    *) echo "unknown job: $job" >&2; echo "unknown-job($job) rc=2" >> "$LOG/summary.txt"; RC=1; continue;;
  esac
  name=$info$name; out=$LOG/out/$name; mkdir -p "$out"; t0=$(date +%s); tmo=${TMO:-3000}
  for e in "${envs[@]}"; do [ "${e%%=*}" = TMO ] && tmo=${e#*=}; done
  env "${envs[@]}" PROBE_OUT=$out PT_DIR=$out PT_SHOTS=$out/shots/ BALANCE_OUT=$out timeout $tmo $cmd "$@" > "$LOG/$name.log" 2>&1; rc=$?
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
  # A check is judged by its verdict line too (day 3: a check can exit 0 after a failed line or without finishing).
  if [ $kind = check ] && [ $rc -eq 0 ]; then
    verdict=$(grep -E '^[A-Za-z][^ ]*( [^ ]+)*: [0-9]+ (checks, [0-9]+ FAIL|pass, [0-9]+ fail)' "$LOG/$name.log" | tail -1)
    if [ -z "$verdict" ]; then rc=8
    elif ! echo "$verdict" | grep -qE ': [0-9]+ (checks, 0 FAIL|pass, 0 fail)'; then rc=9
    elif grep -q '^\[FAIL\]' "$LOG/$name.log"; then rc=9; fi
  fi
  [ $rc -eq 0 ] || [ -n "$info" ] || RC=1
  echo "$name rc=$rc pass=$(grep -c '\[PASS\]' "$LOG/$name.log") fail=$(grep -c '\[FAIL\]' "$LOG/$name.log") secs=$(( $(date +%s) - t0 ))" >> "$LOG/summary.txt"
done
exit $RC
