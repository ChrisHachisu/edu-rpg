#!/bin/sh
set -eu

ROOT=$(CDPATH= cd -- "$(dirname -- "$0")/.." && pwd -P)
export NVM_DIR=${NVM_DIR:-"$HOME/.nvm"}
if [ -s "$NVM_DIR/nvm.sh" ]; then
  . "$NVM_DIR/nvm.sh"
  command -v node >/dev/null 2>&1 || nvm use --silent 20 >/dev/null
fi
exec python3 "$ROOT/scripts/ship_ios.py" --app-dir "$ROOT" "$@"
