#!/bin/bash
# Run a job file line by line (each line: <tag> <script.cjs> [args...]) through run_x.sh, in order.
#   nohup scripts/auto/explore/run_queue.sh jobs.txt &
cd "$(dirname "$0")"
while read -r tag s args; do [ -z "$tag" ] || [ "${tag#\#}" != "$tag" ] && continue; ./run_x.sh $tag $s $args; done < "$1"
