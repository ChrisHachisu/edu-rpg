#!/bin/bash
# Memory-aware render queue (the container is shared with other agents' renders; a fixed -P 3
# was OOM-killed once). Starts the next floor only when fewer than MAXJ of ours run and at least
# MINMB MB is available. Usage: runq.sh QUEUE_FILE [render_floors.py extra args, e.g. --fast]
S=${ACTS_DUNGEON_SCRATCH:-/tmp/claude-0/-home-claude/c446ac0c-2689-576d-8fff-6176ff6d9aad/scratchpad/acts/dungeons}
MAXJ=${MAXJ:-3}; MINMB=${MINMB:-5500}
Q=$1; shift; EXTRA="$@"
mkdir -p "$S/logs"
cd "$(dirname "$0")/../../.."
while read -r fid; do
  [ -z "$fid" ] && continue
  while true; do
    n=$(pgrep -fc "^python3 scripts/acts/dungeons/render_floors.py")
    av=$(awk '/MemAvailable/{print int($2/1024)}' /proc/meminfo)
    if [ "$n" -lt "$MAXJ" ] && [ "$av" -gt "$MINMB" ]; then break; fi
    sleep 20
  done
  ( python3 scripts/acts/dungeons/render_floors.py --floors "$fid" $EXTRA > "$S/logs/$fid.log" 2>&1
    echo "$fid done $?" >> "$S/logs/queue.log" ) &
  sleep 120   # let it reach its working set before measuring memory again
done < "$Q"
wait
echo QUEUE-EMPTY >> "$S/logs/queue.log"
