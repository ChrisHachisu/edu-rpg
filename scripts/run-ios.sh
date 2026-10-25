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
TERRAIN_PROFILE=historical
CANDIDATE_APP=""
RELEASE_IDENTITY=""
IDENTITY_SHA256=""
TERRAIN_EVIDENCE=""
TERRAIN_EVIDENCE_SHA256=""
QA_PREPARATION=0
PRESERVE_SAVE=0
SEED_ARGS=()

while [ $# -gt 0 ]; do
  case "$1" in
    --skip-build) SKIP_BUILD=1; shift ;;
    --terrain-profile) [ "$#" -ge 2 ] || { echo "FATAL: --terrain-profile needs a value" >&2; exit 2; }; TERRAIN_PROFILE=$2; shift 2 ;;
    --candidate-app) [ "$#" -ge 2 ] || { echo "FATAL: --candidate-app needs a path" >&2; exit 2; }; CANDIDATE_APP=$2; shift 2 ;;
    --release-identity) [ "$#" -ge 2 ] || { echo "FATAL: --release-identity needs a path" >&2; exit 2; }; RELEASE_IDENTITY=$2; shift 2 ;;
    --identity-sha256) [ "$#" -ge 2 ] || { echo "FATAL: --identity-sha256 needs a value" >&2; exit 2; }; IDENTITY_SHA256=$2; shift 2 ;;
    --terrain-evidence) [ "$#" -ge 2 ] || { echo "FATAL: --terrain-evidence needs a path" >&2; exit 2; }; TERRAIN_EVIDENCE=$2; shift 2 ;;
    --terrain-evidence-sha256) [ "$#" -ge 2 ] || { echo "FATAL: --terrain-evidence-sha256 needs a value" >&2; exit 2; }; TERRAIN_EVIDENCE_SHA256=$2; shift 2 ;;
    --qa-preparation) QA_PREPARATION=1; shift ;;
    --preserve-save) PRESERVE_SAVE=1; shift ;;
    --udid) UDID="$2"; SEED_ARGS+=(--udid "$2"); shift 2 ;;
    *) SEED_ARGS+=("$1"); shift ;;
  esac
done

case "$TERRAIN_PROFILE" in
  historical|act1-forward-20261007-v1) ;;
  *) echo "FATAL: unknown terrain profile: $TERRAIN_PROFILE" >&2; exit 2 ;;
esac
if [ -n "$CANDIDATE_APP" ]; then
  [ -n "$RELEASE_IDENTITY" ] && [ -n "$IDENTITY_SHA256" ] || {
    echo "FATAL: --candidate-app requires --release-identity and --identity-sha256" >&2; exit 2;
  }
  [ "$SKIP_BUILD" -eq 0 ] || { echo "FATAL: --candidate-app already supplies the exact product; omit --skip-build" >&2; exit 2; }
  [ "$PRESERVE_SAVE" -eq 1 ] || { echo "FATAL: candidate install requires --preserve-save; use a dedicated test simulator and do not reseed its save" >&2; exit 2; }
elif [ -n "$RELEASE_IDENTITY" ] || [ -n "$IDENTITY_SHA256" ]; then
  echo "FATAL: release identity verification requires --candidate-app" >&2; exit 2
fi
if [ "$QA_PREPARATION" -eq 1 ]; then
  [ "$TERRAIN_PROFILE" = "act1-forward-20261007-v1" ] && [ -n "$CANDIDATE_APP" ] || {
    echo "FATAL: --qa-preparation requires the exact forward-profile --candidate-app" >&2; exit 2;
  }
  [ -z "$TERRAIN_EVIDENCE" ] && [ -z "$TERRAIN_EVIDENCE_SHA256" ] || {
    echo "FATAL: QA preparation cannot consume release evidence" >&2; exit 2;
  }
elif [ -n "$TERRAIN_EVIDENCE" ] || [ -n "$TERRAIN_EVIDENCE_SHA256" ]; then
  [ -n "$TERRAIN_EVIDENCE" ] && [ -n "$TERRAIN_EVIDENCE_SHA256" ] || {
    echo "FATAL: --terrain-evidence and --terrain-evidence-sha256 must be supplied together" >&2; exit 2;
  }
fi

# A booted simulator is shared machine state -- another session's expo/metro can be driving
# it, and this simulator shuts itself down unprompted. Resolve it once, explicitly.
if [ -z "${UDID:-}" ]; then
  UDID=$(xcrun simctl list devices booted | grep -oE '\(([0-9A-F-]{36})\) \(Booted\)' \
         | grep -oE '[0-9A-F-]{36}' | head -1 || true)
  [ -n "$UDID" ] || { echo "FATAL: no booted simulator. xcrun simctl boot <udid>"; exit 1; }
  SEED_ARGS+=(--udid "$UDID")
fi
echo "==> simulator $UDID"

if [ -n "$CANDIDATE_APP" ]; then
  [ -d "$CANDIDATE_APP" ] || { echo "FATAL: candidate app does not exist: $CANDIDATE_APP" >&2; exit 1; }
  APP=$(cd "$(dirname "$CANDIDATE_APP")" && pwd -P)/$(basename "$CANDIDATE_APP")
  if [ "$QA_PREPARATION" -eq 1 ]; then
    python3 scripts/verify_edu_rpg_release_identity.py qa-simulator-app \
      --root "$PWD" --identity "$RELEASE_IDENTITY" --identity-sha256 "$IDENTITY_SHA256" --app "$APP"
  else
    VERIFY_ARGS=(simulator-app --root "$PWD" --identity "$RELEASE_IDENTITY" --identity-sha256 "$IDENTITY_SHA256" \
      --terrain-profile "$TERRAIN_PROFILE" --app "$APP")
    if [ "$TERRAIN_PROFILE" = "act1-forward-20261007-v1" ]; then
      VERIFY_ARGS+=(--terrain-evidence "$TERRAIN_EVIDENCE" --terrain-evidence-sha256 "$TERRAIN_EVIDENCE_SHA256")
    fi
    python3 scripts/verify_edu_rpg_release_identity.py "${VERIFY_ARGS[@]}"
  fi
  [ -d "$APP" ] || { echo "FATAL: candidate app does not exist: $APP" >&2; exit 1; }
  echo "==> installing identity-verified candidate $APP"
  xcrun simctl install "$UDID" "$APP"
elif [ "$SKIP_BUILD" -eq 0 ]; then
  ./scripts/sync-ios.sh --terrain-profile "$TERRAIN_PROFILE"
  echo "==> xcodebuild ($SCHEME, Debug)"
  xcodebuild -workspace "$WORKSPACE" -scheme "$SCHEME" -configuration Debug \
    -destination "platform=iOS Simulator,id=$UDID" -derivedDataPath .ios-build \
    build -quiet
  APP=$(find .ios-build/Build/Products/Debug-iphonesimulator -maxdepth 1 -name '*.app' | head -1)
  [ -n "$APP" ] || { echo "FATAL: no .app produced"; exit 1; }
  echo "==> installing $APP"
  xcrun simctl install "$UDID" "$APP"
else
  ./scripts/sync-ios.sh --terrain-profile "$TERRAIN_PROFILE"
fi

if [ "$PRESERVE_SAVE" -eq 0 ]; then
  # Launch once so WebKit creates the localStorage database, then terminate before seeding.
  xcrun simctl launch "$UDID" "$APPID" >/dev/null 2>&1 || true
  sleep 4
  xcrun simctl terminate "$UDID" "$APPID" >/dev/null 2>&1 || true
  echo "==> seeding save"
  python3 scripts/seed_ios_save.py "${SEED_ARGS[@]}"
else
  echo "==> preserving the simulator's existing save; no seeding performed"
fi

echo "==> launching"
xcrun simctl launch "$UDID" "$APPID"
echo
echo "READY. Tap Continue. Screenshot with:"
echo "  xcrun simctl io $UDID screenshot /tmp/shot.png"
