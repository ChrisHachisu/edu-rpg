# feel-refs — locked reference captures

Every row in the `design/GAME-FEEL.md` ledger points at a capture. This is where those
captures live. A capture is the **evidence that an owner approval happened and what
exactly was approved**, so it is written once, at lock time, and then left alone.

## Naming

```
<element>-<variant>-locked.<ext>        the canonical capture the ledger row points at
<element>-<variant>-before-after.<ext>  optional: why the change was made
```

`<element>` is the thing on screen, not the file that draws it (`overworld-minimap`,
not `ui-overhaul`). `<variant>` is the owner's chosen option when there was a choice
(`relief`), and is omitted when there was only one.

## What a capture has to be

1. **From the shipped artifact, never from the mockup.** The mockup is what the owner
   chose; the capture is proof the game does that. In this repo the override layers
   repaint and reroute the game, so a mockup screenshot proves nothing about the build.
   Capture out of `dist/` (or the simulator), and say so on the image.
2. **At true on-device size.** 402x702 CSS at dpr 3 is the target device. A UI element
   photographed at desktop scale hides exactly the failures that matter — a two-pixel
   speck, an unreadable label, a mark that vanishes into its background.
3. **Motion gets motion.** Anything animated is an MP4 or a GIF under 3 MB. A static
   screenshot never passes animation work. Static chrome — a map, a panel, an icon
   set — is a PNG, and then the ledger's Duration/Easing columns read `n/a — static`.
4. **Self-describing.** The image carries its own eyebrow, title, one line of capture
   conditions, and a label per cell, so it survives being opened years later with no
   surrounding context. Palette is the shipped one (Charcoal & Gold Leaf).
5. **Prefer the renderer's own pixels.** For a canvas element, `toDataURL` beats an
   element screenshot: an element screenshot composites whatever is drawing behind the
   frame and can catch a scene mid-transition. Pair it with one in-situ device shot so
   the element is also shown in its real place at its real size.

## What does not belong here

Working screenshots, review contact sheets, iteration history, anything not pointed at
by a ledger row. Those belong under `design/review/` or in the session's own scratch.
This directory should stay small enough that every file in it is a locked decision.
