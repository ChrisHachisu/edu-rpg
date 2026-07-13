# Hero Walk Sheet — Art Contract

Spec for authoring a hero walk animation that is faithful to the **locked-v14 hero art**.
Every number here was measured from the locked files, not estimated.

> [!warning] Read this first — the "world grid" rationale below is WRONG
> An earlier version of this doc claimed the walk must be 24-logical to match the world. **It does not.**
> Measured on the live rendered canvas, `dq-tiles.js` repaints terrain at true-48 detail: the grass is
> 67–70% 2×2-uniform, props ~52%, monsters ~62%. The **hero** is the chunky one at 100%.
>
> This contract therefore defines "faithful to **locked-v14**", not "faithful to the world". Those are
> different targets, and as of 2026-07-10 they conflict. Whether the hero should stay at locked-v14's
> 24-logical density is an **open question the owner is judging from live play** — do not treat the
> 100%-grid-conformance check below as an art-direction mandate. It only certifies "this matches
> locked-v14."
>
> Details: `claude_brain/04-Learnings/learning-20260710-verify-the-render-not-the-source.md`

**Why this exists:** `walk-v4-natural-motion` has good motion but diverges from the locked hero: it
shares **zero** exact colors with `locked-v14` (0/30 openface, 0/29 feminine), drops the `#12141d`
outline, and registers to the V10 turnaround, not V14. Its *density* is fine — it matches the world.
Its *design* is a different hero.

**Already satisfied, mostly:** `walk-v2-readable-motion-from-locked-v14` passes every check here except
a cell-edge touch on frame 2 (both variants) and a 1px baseline shift on frame 0 (openface only, an
artifact of locked-v14's own baseline being y23 while its motion frames sit at y22). `walk-v1` fails on
one stray color, `#f8c78b`.

---

## 1. The two deliverables

| Variant | Slot | Source sprite (the art base) |
| --- | --- | --- |
| `openface` | **A** (default at character-create) | `locked-v14/logical-24/hero-gray-openface.png` |
| `feminine` | **B** | `locked-v14/logical-24/hero-gray-feminine.png` |

`covered` is **dropped** — it has no walk sheet and none is being commissioned.

Locked root:
`~/Documents/codex/output/edu-rpg-locked-front-facing-dark-jrpg-2026-07-06/hero/`

- **ART base (authoritative):** `locked-v14/logical-24/*.png`
- **MOTION reference only:** `walk-v4-natural-motion/` — copy the *gait*, never the pixels.

---

## 2. Authoring space — 24×24 logical, non-negotiable

The world is 48px tiles drawn at 24×24 logical with `SPRITE_SCALE = 2`
(`edu-rpg/src/utils/constants.ts:1`, `AssetGenerator.ts:126-127`). Every world pixel is a 2×2 block.

Verified: `locked-v14/game-48/*` is **exactly** `locked-v14/logical-24/*` upscaled 2× NEAREST.

So:

1. Draw every frame at **24×24 logical**. One logical pixel = one drawn pixel.
2. Assemble the 12 frames into a **288×24** strip.
3. Produce the game asset by upscaling that strip **2× NEAREST** → **576×48**.

Never draw at 48 and downsample. That is exactly how walk-v4 went wrong.

**Deliver both:** `logical-24/<variant>-walk-12x24.png` (288×24) and
`game-48/<variant>-walk-12x48.png` (576×48).

---

## 3. Frame layout — matches the live engine

12 frames, one row, indexed `dir * 3 + pose`:

| Frames | Direction | dir |
| --- | --- | --- |
| 0–2 | Down (toward camera) | 0 |
| 3–5 | Left | 1 |
| 6–8 | Right | 2 |
| 9–11 | Up (away) | 3 |

Poses: `0` = idle/neutral, `1` = leading-foot contact, `2` = opposite-foot contact.

> **Hard anchor:** frame 0 (down, idle) must be **pixel-identical** to the locked sprite
> `locked-v14/logical-24/hero-gray-<variant>.png`. Not "close" — identical. The engine renders
> frame 0 as the standing hero on the title screen, the character-create preview, and the victory
> screen, so it *is* the locked hero. The verifier enforces this.

---

## 4. Palette — closed set, no new colors

Use **only** colors already present in that variant's locked sprite. Zero new colors. Zero
semi-transparent pixels: alpha must be exactly `0` or `255` (the engine keys on real alpha).

**openface — 21 colors:**

```
#12141d  #8491a4  #dfa52c  #4a5365  #e6ae70  #dee4ec  #5e3a25
#44bdec  #4c76d6  #31201b  #2349a3  #895b1c  #f8d258  #eff2f6
#a0acbf  #1464a2  #ac6941  #070910  #ffd397  #aee7ff  #13295e
```

**feminine — 19 colors:**

```
#12141d  #5e3a25  #e6ae70  #8491a4  #dfa52c  #dee4ec  #eff2f6
#4a5365  #946242  #13295e  #31201b  #2349a3  #44bdec  #ac6941
#f8d258  #eec496  #895b1c  #4c76d6  #1464a2
```

Outline is `#12141d` on both (`#070910` is the deepest accent on openface). The heavy dark outline
is a defining trait of the locked style — walk-v4 dropped it. Keep it on every frame and direction.

---

## 5. Silhouette and floor

Measured from the locked logical-24 sprites:

| | openface | feminine |
| --- | --- | --- |
| Opaque bbox x | `2..22` (21px wide) | `2..22` (21px wide) |
| Opaque bbox y | `0..23` | `2..22` |
| Baseline (lowest opaque row) | `y23` | `y22` |

- **One shared floor baseline across all 12 frames** of a sheet. Feet plant on the same row every
  frame; the body bobs upward, the floor never moves.
- Keep the horizontal silhouette within `x2..x22`. Do not let a swinging cape or sword cross the
  frame edge — frames are sliced at exact 24px boundaries and will clip.
- Preserve, per the locked design: gold pauldrons, blue cape, drawn sword low and forward,
  shield on the character's left. Shield-side hand stays hidden behind the shield in profile views.

---

## 6. Motion notes (take these from walk-v4, they were good)

- Planted foot, lifted trailing heel, hip weight shift, subtle body bob.
- Equipment counter-swing; cape follow-through.
- Cape visible in **every** direction; in the back (up) view it connects continuously from the
  shoulder yoke to the hem.
- Poses 1 and 2 are opposite feet — a true alternating gait, not one pose mirrored.

At 24 logical pixels the whole figure is ~21px tall. Motion must read at that size: exaggerate the
foot lift and bob more than feels natural at 48px. Subtlety disappears on this grid.

---

## 7. Acceptance — run the verifier, paste the output

`docs/verify_hero_walk.py` mechanically checks every claim above. A sheet is **not** done until it
prints `ALL CHECKS PASSED`.

```bash
/usr/bin/python3 edu-rpg/docs/verify_hero_walk.py \
  --variant openface \
  --logical  path/to/openface-walk-12x24.png \
  --game     path/to/openface-walk-12x48.png
```

It enforces:

1. `logical` is 288×24; `game` is 576×48.
2. `game` == `logical` upscaled 2× NEAREST, exactly.
3. `game` is 100% 2×2-block uniform (grid conformance — walk-v4 scored 64%).
4. Every opaque color ⊆ that variant's locked palette. No new colors.
5. No semi-transparent pixels.
6. Frame 0 is pixel-identical to the locked sprite.
7. All 12 frames share one floor baseline.
8. No frame's silhouette touches the x-edge of its 24px cell.

---

## 8. Out of scope

The engine wiring (character-create A/B picker, `getHeroSrc` intro preview, replacing the procedural
`generateHeroSprites`) is **deferred until the art is finalized** — owner's call, 2026-07-10.

One known engine bug is logged and intentionally **not** fixed yet: `WorldMapScene.ts:1151`
hardcodes `const walkFrame = dir * 3 + 1`, so **pose 2 never renders**. Whatever ships, a third of
each sheet is dead until the step alternates 1↔2. Author pose 2 correctly regardless.
