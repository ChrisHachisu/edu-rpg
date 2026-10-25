# Act 1 forward terrain profile reproduction

`generate_forward_profile.py` is the portable source for the static `act1-forward-20261007-v1` candidate. It reads the frozen `input-manifest.json` bundle and the additive layout, north-contact recipe, and pilot evidence in this directory. The original 37-file bundle inventory remains unchanged.

The default runtime source is the sibling `public/act1-hifi` tree, read-only. Supply a writable work directory outside the candidate tree with `--work-root`. For a plan-only validation:

```sh
python3 generate_forward_profile.py --work-root /path/to/writable/evidence --plan-only
```

A full static generation writes review evidence and output layers below that work directory. An optional `--reuse-ground-from` cache is accepted only after the generator verifies its complete source bundle identity, 120-chunk geometry, inventory hashes, current water/canopy hashes, and fallback plate. Omit it to regenerate ground from the bundled sources. `--single-generation` writes only `--output-a` and is intended for bounded source portability comparisons.

The generated receipts deliberately set `gateReady` and `nativeVerified` to false. These outputs do not establish game integration, runtime streaming/collision, new-game spawn, save/resume, or native phone/tablet behavior. The 6ppc fallback alpha is resampled and its measured support difference from the 32ppc collision mask is reported; exact fallback silhouette parity is not claimed.
