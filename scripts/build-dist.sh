#!/bin/sh
# Build dist/ (and the iOS payload) from tracked sources, so a fresh worktree can pass the gate.
#
# WHY THIS EXISTS
#   dist/ is gitignored but scripts/ship-gate.sh pins it, so a freshly created worktree could
#   never produce a passing dist/. The recipe existed only as four commands worked out by hand on
#   2026-08-06 and re-derived from memory on every integration, and the fallback when memory
#   failed was to copy dist/ from a sibling worktree. That is not a build, it is a rumour: by
#   2026-08-07 three worktrees carried three different shells (14414, 15094 and 15479 bytes) and
#   every one of them passed the gate.
#
#   This does NOT invoke Vite, TypeScript or npm. The shipped 4.99 MB bundle is a preserved
#   artifact the source tree cannot reproduce -- `npm run build` is deliberately wired to
#   `runtime_baseline.py blocked-build` -- so dist/ is assembled from the baseline plus tracked
#   overrides, never compiled.
#
# WHAT IT ASSEMBLES, IN ORDER
#   1. the preserved runtime baseline          (257 files, incl. the frozen bundle)
#   2. the Act 1 overlay files from public/     (enumerated from the gate, never hardcoded)
#   3. the four canonical overrides from public/
#   4. the static shell, DERIVED from tracked root index.html
#   5. the iOS payload, mirrored from dist/
#
# IDEMPOTENT: re-running against an already-built dist/ reproduces it byte for byte.
set -eu

cd "$(dirname "$0")/.."
ROOT=$(pwd -P)

# ---------------------------------------------------------------------------------------------
# 1. Preserved runtime baseline.
#    `hydrate` refuses to overwrite an existing directory, so a rebuild has to clear it first.
#    Removing dist/ wholesale is also what keeps this idempotent AND self-healing: a superseded
#    file left behind by an older vintage cannot survive into the new tree. (Learned the hard way
#    on the iOS mirror -- see the --delete rationale in scripts/sync-ios.sh.)
# ---------------------------------------------------------------------------------------------
echo "==> [1/5] hydrating the preserved runtime baseline into dist/"
rm -rf dist
python3 scripts/runtime_baseline.py hydrate --output dist

# ---------------------------------------------------------------------------------------------
# 2. Act 1 overlay files.
#    The set is ENUMERATED from runtime_baseline.py itself, by asking the gate what it is missing.
#    It is deliberately not a list in this file: the count has already moved (148 -> 152 when the
#    tab icons and the UI font landed), and a hardcoded list would have silently shipped a dist/
#    missing the new assets while still passing every check that only looks at what is present.
#
#    verify-act1 reports `missing=[...]` as a Python list literal, so this reads it back with
#    ast.literal_eval rather than scraping it with a regex over paths.
# ---------------------------------------------------------------------------------------------
echo "==> [2/5] copying the Act 1 overlay files enumerated by the gate"
python3 - "$ROOT" <<'PY'
import ast, os, re, shutil, subprocess, sys

root = sys.argv[1]
proc = subprocess.run(
    [sys.executable, "scripts/runtime_baseline.py", "verify-act1", "--input", "dist"],
    cwd=root, capture_output=True, text=True,
)
if proc.returncode == 0:
    print("    nothing missing (dist/ already carries the overlay)")
    raise SystemExit(0)

match = re.search(r"missing=(\[.*?\]), extra=(\[.*?\])\s*\Z", proc.stderr.strip(), re.S)
if not match:
    # Any OTHER failure here is a real gate failure -- an identity mismatch, a changed locked
    # manifest -- and must not be swallowed as "nothing to copy".
    sys.stderr.write(proc.stderr)
    raise SystemExit("verify-act1 failed for a reason other than a missing-path set; see above")

missing = ast.literal_eval(match.group(1))
extra = ast.literal_eval(match.group(2))
if extra:
    raise SystemExit(f"dist/ carries {len(extra)} unexpected file(s), refusing to patch over it: "
                     f"{extra[:5]}")

for relative in missing:
    source = os.path.join(root, "public", relative)
    if not os.path.isfile(source):
        raise SystemExit(f"gate wants {relative} but public/ does not have it -- this file is "
                         f"not reconstructible from tracked sources, stopping rather than "
                         f"shipping an incomplete dist/")
    target = os.path.join(root, "dist", relative)
    os.makedirs(os.path.dirname(target), exist_ok=True)
    shutil.copyfile(source, target)

print(f"    copied {len(missing)} Act 1 overlay file(s) from public/")
PY

# ---------------------------------------------------------------------------------------------
# 3. The four canonical overrides.
#    These already exist in dist/ at their BASELINE vintage, so they are overwritten rather than
#    added -- which is why they never appear in the missing set above and have to be listed.
#    The list is the one scripts/ship-gate.sh cmp's, and that gate is the authority; keep them
#    in step.
# ---------------------------------------------------------------------------------------------
echo "==> [3/5] copying the canonical overrides from public/"
for FILE in dq-tiles.js hero-override.js ui-overhaul.js ui-overhaul.css; do
  cp "public/$FILE" "dist/$FILE"
done

# ---------------------------------------------------------------------------------------------
# 4. The static shell.
#    MUST come after hydrate, which writes a stale baseline index.html that this replaces.
#    Derived from the tracked root index.html -- never copied from another worktree, and never
#    "repaired" with regenerate_pins.py, whose index.html pin resolves out of dist/ and will
#    happily re-pin the gate to whatever stale shell it finds.
# ---------------------------------------------------------------------------------------------
echo "==> [4/5] deriving the static shell from the tracked index.html"
node scripts/build_static_index.mjs

# ---------------------------------------------------------------------------------------------
# 5. iOS payload.
#    ship-gate.sh verifies ios/App/App/public too, and it is gitignored as well (ios/.gitignore:4),
#    so a fresh worktree is missing it for exactly the same reason it is missing dist/.
#    sync-ios.sh requires Capacitor's glue to already exist and aborts if it does not. Capacitor
#    emits both files EMPTY for this project (it has no Cordova plugins), so they are created
#    here rather than pulled from a sibling worktree or regenerated by running `cap sync`.
# ---------------------------------------------------------------------------------------------
#    capacitor.config.json and config.xml are ALSO gitignored (ios/.gitignore:12-13) and are
#    emitted by `cap sync`/`cap copy`, so a fresh clone does not have them either -- but unlike the
#    Cordova glue above they are NOT safe to fake as empty files: the App target lists both as
#    resources and xcodebuild fails with `The file "capacitor.config.json" couldn't be opened`
#    before it ever links. Measured on a fresh clone 2026-08-24; the machine had every other
#    dependency in place and still could not build. `cap copy` also rewrites ios/App/App/public,
#    which is why it runs BEFORE the mirror below rather than after -- the mirror is what makes
#    the payload match dist/ and satisfy the gate.
echo "==> [5/5] mirroring dist/ into the iOS payload"
if [ ! -f ios/App/App/capacitor.config.json ] || [ ! -f ios/App/App/config.xml ]; then
  echo "    generating Capacitor's gitignored config (fresh checkout)"
  # `cap copy` ALSO writes dist/ into ios/App/App/public, and if that directory already holds a
  # payload it lands beside it as macOS-style " 2" duplicates ("index 2.html", "cordova 2.js",
  # ...) rather than overwriting. Measured 2026-08-24: 19 duplicates in the payload and 3 in
  # dist/, which the runtime baseline then rejects as `extra=[...]` -- AFTER signing has already
  # succeeded, so it reads as a gate bug rather than a copy artefact. Emptying the payload first
  # makes the copy collision-free; sync-ios.sh below is the authoritative mirror either way.
  rm -rf ios/App/App/public
  npx --no-install cap copy ios >/dev/null 2>&1 || npx cap copy ios >/dev/null
fi
mkdir -p ios/App/App/public
for GLUE in cordova.js cordova_plugins.js; do
  [ -f "ios/App/App/public/$GLUE" ] || : > "ios/App/App/public/$GLUE"
done
sh scripts/sync-ios.sh

echo
echo "BUILD DIST OK: dist/ and ios/App/App/public assembled from tracked sources"
echo "Next: ./scripts/ship-gate.sh ."
