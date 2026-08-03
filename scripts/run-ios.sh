#!/bin/bash
# One command: sync -> verify -> build -> install -> seed -> launch.
#
# Replaces a ~20-step manual dance in which every step had a way to silently produce a
# stale or half-current app. Ordering here is not arbitrary:
#   * verify BEFORE build, so a bad tree never becomes a build
#   * seed AFTER install, because `simctl install` mints a new data container and destroys
#     any save seeded beforehand
#
# USAGE
#   ./scripts/run-ios.sh                                  # overworld beside Port Sapphire
#   ./scripts/run-ios.sh --map portSapphire               # straight into the town
#   ./scripts/run-ios.sh --map sunkenCellar --floor 3     # straight into a dungeon floor
#   ./scripts/run-ios.sh --skip-build                     # reseed + relaunch only
# Any other flag is passed through to scripts/seed_ios_save.py (--gold, --level, --locale...).
set -euo pipefail
cd "$(dirname "$0")/.."

APPID="app.chalkmap.questofknowledge"
SCHEME="App"
WORKSPACE="ios/App/App.xcworkspace"
SKIP_BUILD=0
SEED_ARGS=()

while [ $# -gt 0 ]; do
  case "$1" in
    --skip-build) SKIP_BUILD=1; shift ;;
    --udid) UDID="$2"; SEED_ARGS+=(--udid "$2"); shift 2 ;;
    *) SEED_ARGS+=("$1"); shift ;;
  esac
done

# A booted simulator is shared machine state -- another session's expo/metro can be driving
# it, and this simulator shuts itself down unprompted. Resolve it once, explicitly.
if [ -z "${UDID:-}" ]; then
  UDID=$(xcrun simctl list devices booted | grep -oE '\(([0-9A-F-]{36})\) \(Booted\)' \
         | grep -oE '[0-9A-F-]{36}' | head -1 || true)
  [ -n "$UDID" ] || { echo "FATAL: no booted simulator. xcrun simctl boot <udid>"; exit 1; }
  SEED_ARGS+=(--udid "$UDID")
fi
echo "==> simulator $UDID"

./scripts/sync-ios.sh

if [ "$SKIP_BUILD" -eq 0 ]; then
  echo "==> xcodebuild ($SCHEME, Debug)"
  xcodebuild -workspace "$WORKSPACE" -scheme "$SCHEME" -configuration Debug \
    -destination "platform=iOS Simulator,id=$UDID" -derivedDataPath .ios-build \
    build -quiet
  APP=$(find .ios-build/Build/Products/Debug-iphonesimulator -maxdepth 1 -name '*.app' | head -1)
  [ -n "$APP" ] || { echo "FATAL: no .app produced"; exit 1; }
  echo "==> installing $APP"
  xcrun simctl install "$UDID" "$APP"
fi

# Launch once so WebKit creates the localStorage database, then terminate before seeding.
xcrun simctl launch "$UDID" "$APPID" >/dev/null 2>&1 || true
sleep 4
xcrun simctl terminate "$UDID" "$APPID" >/dev/null 2>&1 || true

echo "==> seeding save"
python3 scripts/seed_ios_save.py "${SEED_ARGS[@]}"

echo "==> launching"
xcrun simctl launch "$UDID" "$APPID"
echo
echo "READY. Tap Continue. Screenshot with:"
echo "  xcrun simctl io $UDID screenshot /tmp/shot.png"
