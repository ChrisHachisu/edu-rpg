#!/bin/sh
# Install an Acts 2-5 export and rebuild everything derived from it, then run the world gate.
#
#   sh scripts/acts/rebuild_world.sh <export root> [<towns root>]
#
# <export root>/actN/runtime/ = scripts/acts/export_runtime.py + export_collision_bin.py output
# (or scripts/acts/placeholder_runtime.py). <towns root> = the towns package (town/, exits.json);
# omit it to keep the towns already installed. Nothing here touches dist/ or runs Vite.
set -eu
cd "$(dirname "$0")/../.."
SRC=${1:?usage: rebuild_world.sh <export root> [<towns root>]}
python3 scripts/acts/install_runtime.py "$SRC"
python3 scripts/build_acts_hifi_manifest.py
if [ -n "${2:-}" ]; then
  python3 scripts/acts/install_towns.py "$2"
  python3 scripts/build_acts_hifi_manifest.py
fi
python3 scripts/acts/check_world.py
