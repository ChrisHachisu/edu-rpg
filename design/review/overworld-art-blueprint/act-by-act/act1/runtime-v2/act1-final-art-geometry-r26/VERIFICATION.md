# R26 verification

## Mechanical GO

Commands:

```sh
python3 test_determinism.py
/Users/christopherhachisu/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/bin/node test-final.mjs
PATH=/Users/christopherhachisu/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/bin:$PATH \
  /Users/christopherhachisu/.cache/codex-runtimes/codex-primary-runtime/dependencies/bin/fallback/pnpm run test:map-engine
```

Results:

- Two byte-identical deterministic rebuilds.
- 25 valid smooth regions and 22 reciprocal radius-four-safe joins.
- Seven complete routes sampled at intervals no greater than two world pixels.
- Every route traverses through `constrainWalkableMovement`.
- Port west, north, and southeast remain separate physical components with no
  cross-component polygon intersection.
- All blocked probes pass, including three Port-interior probes, both forbidden
  shortcuts, and both Sunken ruin-body probes.
- Crystal closed traversal stops before the cave; opening the exact retained
  dynamic seal restores traversal.
- Greenhollow, Millbrook, and north-fork free exploration and tangent sliding
  pass representative pressure tests.
- The existing map-engine, retained-behavior, shipped-overworld replay, runtime
  snapshot, and runtime-override suites pass unchanged.

## Independent static GO

The post-correction reviewer independently reproduced the pack and confirmed:

- art `d5998e758b8e1090a0f2bb18cde0197b4cf756161b2c8db84ebe2a6d7aca23cd`;
- authority `4010715a99926260a9d4e842cc97e0e6e04df93bffbc69b4ccf4ef4baf086834`;
- overlay `88ee10ed67a4129c7ed3513718effa9eed2e52aa26fdd61a2e02c55e359dea79`;
- no undeclared long-distance overlap or physical-component merge;
- the Coastal correction is limited to 48,305 pixels inside
  `(1610,2335)–(1944,2670)`.

## Independent visual GO

At native scale, the Coastal centerline runs south on the painted dirt, rounds
the solid rock formation on its landward side, then turns east across the gravel
apron to `(1877,2596)`. It does not enter cyan water, forest canopy, or solid
rock. The endpoint stops immediately before the black cave opening.

The same review confirmed Port's three visibly distinct edges, the accepted
Sunken rocky approach, and the remaining full-map road/clearing fit.

## Code check

No correctness, security, data-loss, resource, type, or repository-instruction
issue remained in `build_final.py`, `test-final.mjs`, or `test_determinism.py`.

