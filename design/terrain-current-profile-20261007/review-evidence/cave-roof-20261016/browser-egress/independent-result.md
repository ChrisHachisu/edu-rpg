# Combined runtime cave egress diagnostic — run 2

**Result: usable browser-runtime egress observed.** This is not native-device evidence and does not replace the native gate.

The run served the immutable prior app's `public/` tree (`App.app` SHA-256 `499e6ed3f0b5724851a61b2b822b9be8ab8f1b198d24f9ba81a62bff62883cf4`) and replaced only `/dq-tiles.js` in memory with the reviewed DQ source (`b12d7eedea5420d18605633d66ee698fda24a538e1b026e9e7a092b3a1ddcb0a`). It initialized the approved P1 save input (SHA-256 `477907d19190f75279079ffb716e21ba7345e4b5def5ca557bec77a8b21dba6d`), clicked the visible Continue control, and used actual arrow-key input. The app remained in the overworld with HP 40.

| Checkpoint | Input | Actual sprite position | Delta from preceding checkpoint | Combined gate |
|---|---|---:|---:|---|
| Continue | visible Continue click | (3421.33, 7659.53), tile (101,227) | — | ready/free |
| North contour | Down 600 ms | (3421.33, 7667.33), tile (101,228) | (0, 7.80) | ready/free |
| East of cave | Right 1500 ms | (3606.79, 7667.33), tile (107,228) | (185.45, 0) | ready/free |
| Past cave side | Down 1500 ms | (3606.79, 8079.01), tile (107,240) | (0, 411.68) | ready/free |

The eastward displacement was 185.45 world pixels, exceeding the 50.4-pixel cave half-width target. The final screenshot shows the full hero on clear grass beyond the cave's east/south side. The live `checkOverworldSpawn` result remained `ready/free` at each sampled point; the map remained `overworld`. No scene transition or battle occurred. Three directional holds totaled 3.6 seconds.

The manual save remained at `(101,226)`, floor 1, HP 40. The resume slot reflected the actual final position `(107,240)`, floor 1, HP 40. Screenshots and detailed sampled state are in this directory: `after-continue.png`, `step-01-down.png`, `step-02-right.png`, `step-03-down.png`, and `result.json`. The runner reports that the browser and loopback server both closed.
