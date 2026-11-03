#!/bin/bash
# Memory-aware queue for bundle_render.py (real in-game layouts). Same guard as runq.sh.
S=${ACTS_DUNGEON_SCRATCH:-/tmp/claude-0/-home-claude/c446ac0c-2689-576d-8fff-6176ff6d9aad/scratchpad/acts/dungeons}
MAXJ=${MAXJ:-3}; MINMB=${MINMB:-6500}
Q=$1; shift; EXTRA="$@"
mkdir -p "$S/logs"; cd "$(dirname "$0")/../../.."
while read -r fid; do
  [ -z "$fid" ] && continue
  [ -f "$S/STOP" ] && break
  while true; do
    n=$(pgrep -fc "^python3 scripts/acts/dungeons/(render_floors|bundle_render).py")
    av=$(awk '/MemAvailable/{print int($2/1024)}' /proc/meminfo)
    if [ "$n" -lt "$MAXJ" ] && [ "$av" -gt "$MINMB" ]; then break; fi
    sleep 20
  done
  [ -f "$S/STOP" ] && break
  ( python3 scripts/acts/dungeons/bundle_render.py "$fid" $EXTRA > "$S/logs/b-$fid.log" 2>&1
    echo "$fid done $?" >> "$S/logs/bqueue.log" ) &
  sleep 100
done < "$Q"
wait
echo QUEUE-EMPTY >> "$S/logs/bqueue.log"
