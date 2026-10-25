#!/bin/sh
# Assemble the frozen forward profile for internal, nonshippable Simulator QA.
set -eu
cd "$(dirname "$0")/.."
exec sh scripts/build-dist.sh --terrain-profile act1-forward-20261007-v1 --qa-preparation
