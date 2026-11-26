#!/bin/sh
# One-command release payload build (cloud half and Mac half). Never runs Vite/npm (AGENTS.md rule 1)
# and never touches dist/ unless every check passed.  Plan: autoloop/day4/store/BUILD-PATH.md section 4.
#
#   sh scripts/build-release.sh --testflight --no-swap                 cloud: verify only, dist/ untouched
#   sh scripts/build-release.sh --store --expect-digest <sha> --ios    Mac: build, verify, swap, sync iOS payload
#
# Modes (exactly one):  --testflight  testers menu allowed (flag true, acts-hifi/jump-points.json present)
#                       --store       flag must be false; no jump-points.json, .eduharness or source maps
# Options: --no-swap            verify dist.new only; dist/ is never modified (cannot be combined with --ios)
#          --expect-digest SHA  whole-tree digest (scripts/tree-digest.sh) of dist.new must equal SHA
#          --ios                after the swap, sync ios/App/App/public and run the ship-gate pieces
#          --keep               keep dist.new on failure / with --no-swap (otherwise it is removed)
#          --inject-test-stray  DEBUG: drop a stray file into dist.new/acts-hifi to prove the closure check fails
# Final line on success: RELEASE PAYLOAD OK <tree digest>, exit 0. Any failure: one line
# "RELEASE BUILD FAILED: <reason>" on stderr, non-zero exit, dist/ exactly as it was.
set -eu
cd "$(dirname "$0")/.."
ROOT=$(pwd -P)
NEW="$ROOT/dist.new"
OLD="$ROOT/dist.old"
MODE=""; NOSWAP=0; EXPECT=""; IOS=0; KEEP=0; STRAY=0
BUNDLE_SHA=ab4fc9ad1204f23b4ea55dbae2d72bdf193a52e643271bcfe8642e2210556456
BUNDLE_SIZE=4987635
DONE=0
FAILED=0
LOG=$(mktemp "${TMPDIR:-/tmp}/build-release.XXXXXX")

if command -v sha256sum >/dev/null 2>&1; then SUM="sha256sum"; else SUM="shasum -a 256"; fi
fail() { FAILED=1; echo "RELEASE BUILD FAILED: $*" >&2; exit 1; }
cleanup() {
  rc=$?
  rm -f "$LOG"
  if [ "$DONE" -ne 1 ]; then
    [ "$rc" -eq 0 ] || [ "$FAILED" -eq 1 ] || echo "RELEASE BUILD FAILED: stopped (exit $rc); dist/ was not modified" >&2
    [ "$KEEP" -eq 1 ] || rm -rf "$NEW"
  fi
}
trap cleanup EXIT

while [ "$#" -gt 0 ]; do
  case "$1" in
    --testflight) [ -z "$MODE" ] || fail "give exactly one of --testflight / --store"; MODE=testflight; shift ;;
    --store) [ -z "$MODE" ] || fail "give exactly one of --testflight / --store"; MODE=store; shift ;;
    --no-swap) NOSWAP=1; shift ;;
    --ios) IOS=1; shift ;;
    --keep) KEEP=1; shift ;;
    --inject-test-stray) STRAY=1; shift ;;
    --expect-digest) [ "$#" -ge 2 ] || fail "--expect-digest needs a value"; EXPECT=$2; shift 2 ;;
    *) fail "unknown argument: $1" ;;
  esac
done
[ -n "$MODE" ] || fail "usage: build-release.sh (--testflight|--store) [--no-swap] [--expect-digest SHA] [--ios] [--keep]"
if [ "$IOS" -eq 1 ] && [ "$NOSWAP" -eq 1 ]; then fail "--ios cannot be combined with --no-swap (the payload must come from the swapped dist/)"; fi
if [ -n "$EXPECT" ]; then
  case "$EXPECT" in *[!0-9a-f]*) fail "--expect-digest must be 64 lowercase hex characters" ;; esac
  [ "${#EXPECT}" -eq 64 ] || fail "--expect-digest must be 64 lowercase hex characters"
fi
[ -d "$ROOT/.git" ] || [ -f "$ROOT/.git" ] || fail "run from the repository checkout"
[ ! -e "$OLD" ] || fail "$OLD exists from an interrupted swap: inspect it (it is the previous dist), then remove it by hand"

# b. build aside (refuses the repo dist/ by design)
echo "== build dist.new ($MODE)"
sh scripts/acts/build_cloud_dist.sh "$NEW" >"$LOG" 2>&1 || { tail -5 "$LOG" >&2; fail "build_cloud_dist.sh failed"; }
grep -q '^CLOUD DIST OK' "$LOG" || fail "build_cloud_dist.sh did not print CLOUD DIST OK"
grep -q '(matches pin)' "$LOG" || fail "static shell does not match its pin (build_static_index.mjs): $(grep '^shell' "$LOG")"
grep '^shell\|^CLOUD DIST OK' "$LOG"

if [ "$STRAY" -eq 1 ]; then echo stray > "$NEW/acts-hifi/stray-test-file.txt"; echo "(debug) injected acts-hifi/stray-test-file.txt"; fi

# a. pin checks. regenerate_pins resolves the index.html pin from the repo dist/; point it at dist.new instead.
echo "== pin checks"
python3 scripts/acts/restamp_cloud_pins.py --check >"$LOG" 2>&1 || { tail -5 "$LOG" >&2; fail "restamp_cloud_pins.py --check: stale cloud pin"; }
python3 scripts/acts/write_gate_manifest.py --check >"$LOG" 2>&1 || { tail -5 "$LOG" >&2; fail "write_gate_manifest.py --check: acts-hifi manifest differs from public/"; }
python3 -c "
import sys
sys.path.insert(0, 'scripts')
import regenerate_pins as r
r.SEARCH = ('public', sys.argv[1])
sys.argv = ['regenerate_pins.py', '--check']
raise SystemExit(r.main())" "$NEW" >"$LOG" 2>&1 || { tail -8 "$LOG" >&2; fail "regenerate_pins.py --check: a pin disagrees with disk"; }
tail -1 "$LOG"

# c. bundle identity and release assertions
echo "== release assertions"
BUNDLE="$NEW/assets/index-BhoGQRaA.js"
[ -f "$BUNDLE" ] || fail "frozen bundle missing"
GOT_SIZE=$(wc -c < "$BUNDLE" | tr -d ' ')
[ "$GOT_SIZE" = "$BUNDLE_SIZE" ] || fail "bundle size $GOT_SIZE, expected $BUNDLE_SIZE"
GOT_SHA=$($SUM "$BUNDLE" | cut -d' ' -f1)
[ "$GOT_SHA" = "$BUNDLE_SHA" ] || fail "bundle sha256 $GOT_SHA, expected $BUNDLE_SHA"
echo "bundle $GOT_SIZE B sha256 ${GOT_SHA}"
[ ! -e "$NEW/.eduharness" ] || fail ".eduharness is present in the payload"
FLAG=$(grep -o '__QOK_TESTERS__ = [a-z]*' "$NEW/ui-overhaul.js" | head -1 | sed 's/.*= //' || true)
[ -n "$FLAG" ] || fail "cannot read the __QOK_TESTERS__ flag in ui-overhaul.js"
echo "testers flag: $FLAG"
if [ "$MODE" = "store" ]; then
  [ "$FLAG" = "false" ] || fail "--store needs window.__QOK_TESTERS__ = false in ui-overhaul.js (it is $FLAG)"
  [ -z "$(find "$NEW" -name 'jump-points.json' | head -1)" ] || fail "--store: a jump-points.json (tester file) is in the payload"
  [ -z "$(find "$NEW" -name '*.map' | head -1)" ] || fail "--store: a source map is in the payload"
fi

# c2. closure: every manifest file present with pinned size and hash, no unlisted file in the listed folders
python3 - "$NEW" "$ROOT" <<'PY' || { FAILED=1; exit 1; }
import hashlib, os, sys
out, root = sys.argv[1], sys.argv[2]
sys.path.insert(0, os.path.join(root, 'scripts'))
import runtime_baseline as rb
files = rb.load_acts_hifi_files()          # raises on an invalid manifest (loader fixed for acts-dungeons/)
bad = []
for rel, (size, sha) in sorted(files.items()):
    p = os.path.join(out, rel)
    if not os.path.isfile(p):
        bad.append('missing ' + rel); continue
    data = open(p, 'rb').read()
    if len(data) != size or hashlib.sha256(data).hexdigest() != sha:
        bad.append('differs from pin ' + rel)
folders = ['acts-hifi', 'act2-hifi', 'act3-hifi', 'act4-hifi', 'act5-hifi', 'acts-dungeons']
for folder in folders:
    for d, _, names in os.walk(os.path.join(out, folder)):
        for n in names:
            rel = os.path.relpath(os.path.join(d, n), out).replace(os.sep, '/')
            if rel not in files:
                bad.append('unlisted ' + rel)
if bad:
    for b in bad[:20]: print('  closure: ' + b, file=sys.stderr)
    if len(bad) > 20: print('  closure: ... %d more' % (len(bad) - 20), file=sys.stderr)
    print('RELEASE BUILD FAILED: closure: %d problem(s), first: %s' % (len(bad), bad[0]), file=sys.stderr)
    sys.exit(1)
print('closure: %d manifest files present with pinned size and hash; no unlisted file in %d folders' % (len(files), len(folders)))
PY

# d. whole-tree digest
DIGEST=$(sh scripts/tree-digest.sh "$NEW")
echo "TREE DIGEST $DIGEST"
if [ -n "$EXPECT" ] && [ "$DIGEST" != "$EXPECT" ]; then fail "tree digest $DIGEST differs from --expect-digest $EXPECT"; fi

if [ "$NOSWAP" -eq 1 ]; then
  DONE=1
  [ "$KEEP" -eq 1 ] || rm -rf "$NEW"
  echo "--no-swap: dist/ untouched"
  echo "RELEASE PAYLOAD OK $DIGEST"
  exit 0
fi

# e. swap (dist/ is only ever moved aside, and put back if the second move fails)
echo "== swap"
if [ -e "$ROOT/dist" ]; then
  mv "$ROOT/dist" "$OLD" || fail "cannot move dist aside"
  mv "$NEW" "$ROOT/dist" || { mv "$OLD" "$ROOT/dist"; fail "swap failed, dist restored"; }
  rm -rf "$OLD"
else
  mv "$NEW" "$ROOT/dist" || fail "swap failed"
fi
DONE=1   # dist/ is now the verified tree; failures below leave it in place

# f, g. iOS payload and the ship-gate pieces that are still valid (verify-act1 is deliberately skipped)
if [ "$IOS" -eq 1 ]; then
  [ -d "$ROOT/ios/App/App/public" ] || fail "--ios given but ios/App/App/public does not exist (run: npx --no-install cap copy ios)"
  PUB="$ROOT/ios/App/App/public"
  command -v rsync >/dev/null 2>&1 || fail "rsync not found"
  echo "== iOS payload"
  rsync -rc --delete --exclude cordova.js --exclude cordova_plugins.js --exclude capacitor.config.json --exclude config.xml dist/ "$PUB/" || fail "rsync to ios payload failed"
  [ -f "$PUB/cordova.js" ] || : > "$PUB/cordova.js"
  [ -f "$PUB/cordova_plugins.js" ] || : > "$PUB/cordova_plugins.js"
  EXTRA=$(diff -rq dist "$PUB" | grep -v -e 'cordova\.js$' -e 'cordova_plugins\.js$' -e 'capacitor\.config\.json$' -e 'config\.xml$' || true)
  [ -z "$EXTRA" ] || { echo "$EXTRA" | head -10 >&2; fail "ios payload differs from dist beyond the Capacitor glue"; }
  echo "ios payload equals dist (apart from Capacitor glue files)"
  node scripts/build_static_index.mjs --check || fail "build_static_index.mjs --check"
  python3 scripts/check_walkable_authority.py >/dev/null || fail "check_walkable_authority.py"
  python3 scripts/check_town_transitions.py >/dev/null || fail "check_town_transitions.py"
  python3 scripts/check_town_exits.py >/dev/null || fail "check_town_exits.py"
  python3 scripts/check_dungeon_entries.py >/dev/null || fail "check_dungeon_entries.py"
  python3 scripts/check_town_roofs.py >/dev/null || fail "check_town_roofs.py"
  for T in millbrook greenhollow portSapphire; do python3 scripts/place_town_actors.py --town "$T" >/dev/null || fail "place_town_actors.py --town $T"; done
  python3 scripts/check_town_talkable.py >/dev/null || fail "check_town_talkable.py"
  for F in dq-tiles.js hero-override.js ui-overhaul.js ui-overhaul.css; do
    cmp "public/$F" "dist/$F" || fail "public/$F differs from dist/$F"
    cmp "dist/$F" "$PUB/$F" || fail "dist/$F differs from ios payload"
  done
  cmp dist/index.html "$PUB/index.html" || fail "index.html differs between dist and ios payload"
  cmp dist/assets/index-BhoGQRaA.js "$PUB/assets/index-BhoGQRaA.js" || fail "bundle differs between dist and ios payload"
  node --check dist/assets/index-BhoGQRaA.js && node --check public/dq-tiles.js && node --check public/hero-override.js && node --check public/ui-overhaul.js || fail "node --check"
  echo "ship-gate pieces passed (verify-act1 skipped: now informational)"
fi
echo "RELEASE PAYLOAD OK $DIGEST"
