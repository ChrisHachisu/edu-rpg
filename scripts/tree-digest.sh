#!/bin/sh
# Whole-tree digest of a directory: sha256 over the sorted list of "<file sha256>  ./<relative path>"
# lines. Identical on macOS and Linux for the same tree (C-locale sort, no GNU-only flags).
#   sh scripts/tree-digest.sh <dir>        prints one 64-hex line
set -eu
DIR=${1:?usage: tree-digest.sh <dir>}
[ -d "$DIR" ] || { echo "tree-digest: not a directory: $DIR" >&2; exit 2; }
if command -v sha256sum >/dev/null 2>&1; then SUM="sha256sum"; else SUM="shasum -a 256"; fi
cd "$DIR"
# Names with a newline would break the sort; refuse rather than hash ambiguously.
if find . -type f -name '*
*' | grep . >/dev/null 2>&1; then echo "tree-digest: newline in a file name" >&2; exit 2; fi
find . -type f | LC_ALL=C sort | tr '\n' '\0' | xargs -0 $SUM | $SUM | cut -d' ' -f1
