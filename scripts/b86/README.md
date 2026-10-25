# Build 86 overworld probe (WIP)

- `overworld_probe.cjs <url> <outdir> <spec.json>`: serve `dist/` first (`python3 scripts/serve_dist.py --port 5178 --dir dist`).
  Seeds a Lv30 save, presses Continue, teleports the hero to each spec `{name,x,y}` (world cells),
  optionally sweeps fractional camera offsets (`dy:[...]` world px), and screenshots at 390x844 @3x.
  Probe-only: it raises index.html's WORLD_CAP (20 s) to 180 s via request interception, because
  headless SwiftShader under load misses the deadline. Nothing shipped is changed.
- `seam_detect.py shot.png ...`: flags 1-canvas-px full-width horizontal lines (the chunk-row seam).
- Headless note: SwiftShader draws the water-R2 layer as a cyan haze over land (device does not),
  so judge geometry in headless, colour on the simulator/device.
