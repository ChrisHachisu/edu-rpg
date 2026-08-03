# Canonical assets and world scale — read before authoring or verifying ANY visual

Owner, 2026-07-31: *"the hero is the old asset. you keep defaulting to this hero in new
sessions so we need to fix this for good"*.

**Two runtimes live in this repo at two different resolutions.** Picking the wrong one produces
art that is the wrong scale and zoom no matter how good it looks on its own. That is not a
hypothetical: a whole Port Sapphire art pass was scrapped on 2026-07-31 for exactly this.

## Act 1 / hi-fi runtime — use this for all Act 1 work, towns included

| | |
|---|---|
| Hero sheet | `public/act1-hifi/hero-g3/hero-act1-female-walk-8x3-64-g3.png` |
| Sheet format | `192 x 512` RGBA, 24 native `64 x 64` cells, shared foot baseline |
| Hero drawn at | **36 world pixels** |
| Authority for every other number | `public/act1-hifi/manifest.json` -> `designLocks` |

`designLocks` as approved 2026-07-19 — **read the file, do not trust this copy**:

```
worldSourcePixelsPerWorldPixel  1
heroSourcePixelsPerWorldPixel   1.7777...   (64/36)
cameraWorldWidth                208 world px
heroNativeFrame                 64
heroWorldHeight                 36
heroDirections                  8 authored / 4 cardinal at runtime
walkPoseMs                      125
movementInput                   continuous-normalized-analog
collisionOwner                  r26-polygon-authority
```

`design/ART-DIRECTION.md:86-90` records the production density as the practical
`912 / 512 = 1.78125` source-pixels-per-world-pixel lattice, within 0.195% of `64/36`.

## Shipped tile-map runtime — NOT for Act 1 authoring

| | |
|---|---|
| Hero sheets | `public/assets/hero/hero-openface-walk.png`, `hero-feminine-walk.png` |
| Sheet format | `576 x 48`, 12 frames of `48 x 48` |
| Loaded by | `public/hero-override.js` (ADR-0057 / ADR-0060) |
| World scale | `TILE_SIZE = 48`, `TILE_LOGICAL = 24`, `SPRITE_SCALE = 2` (`src/utils/constants.ts:1-4`) |

These are the correct asset **for the old tile-map runtime** and wrong for anything Act 1.

## Why the mistake keeps happening

The wrong hero sits at the obvious path — `public/assets/hero/` — and the right one does not.
Every heuristic a fresh session uses (search for "hero", look under `assets/`, take the file
that loads in the shipped bundle) lands on the 48px sheet. **Assume the obvious path is the
wrong one, and start from `manifest.json` -> `designLocks` instead of from a filename.**
