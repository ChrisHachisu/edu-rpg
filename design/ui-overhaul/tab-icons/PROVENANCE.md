# Tab icon source

Owner, 2026-08-06: *"can you have codex generate better bottom tab icons? the current ones look
a bit wonky."*

| | |
|---|---|
| generator | `codex exec -m gpt-5.6-terra` |
| codex session | `019fd6cd-4407-7562-a24e-c59ccf4da15b` |
| generated file | `~/.codex/generated_images/019fd6cd-.../exec-08bd919b-38d8-48c5-b45e-db12cbcb7c92.png` |
| md5 | `68f3d5b77e8285ed5f80af115482ca4e` |
| `source-generated.png` here | **byte-identical** to the generated file (`cmp` clean) |

The md5 check is not ceremony. This project has caught Codex generating an image and then
overwriting it with dozens of ImageMagick draw calls, so what ships has to be traceable to the
generation record rather than to something drawn afterwards. It is the raw output; every
transformation applied to it lives in `scripts/build_tab_icons.py` and is reproducible.

Two images came back from the run. The other
(`exec-996bdaa8-fbb0-4eed-be58-1469f3275b16.png`, md5 `66bde82a48ec26163949bc05f33904d7`) is the
same four glyphs at a lighter stroke, with the pouch's drawstring ties reading as whiskers
sticking out sideways. This one was chosen.

## What the generator got wrong

It was asked for a transparent canvas. It returned an **opaque** one with the transparency
chequerboard **painted into it as pixels** — `sips -g hasAlpha` says `no`. That is silent: every
image viewer shows a chequer for real alpha too, so the file looks correct until it is composited
over anything. Shipped as-is it would have put a grey chequer behind all four icons.

`build_tab_icons.py` recovers the alpha instead: the strokes are pure white (255) against a
chequer topping out at 194, keyed on a soft 215..245 ramp, then a morphological opening removes
the compression speckle that survives it. That speckle was 0.3% of pixels but spread over the
whole canvas, which had stretched every glyph's measured bounding box to ~860px of an 887px
sheet and silently wrecked the size normalisation before it was caught.
