# Brief — redraw the eight soft NPCs to the Port Sapphire standard (v4)

Owner, 2026-08-24, on TestFlight build 58:
1. *"the shopkeeper looks good but all the other npcs need fixing. however, the npcs in port
   sapphire look much better, so try to match to their style."*
3. *"make the healer blue themed (young, nightingale-like)"*

`millbrook-shopkeeper` and the three Port Sapphire NPCs are **KEPT and are the reference**. Do not
touch them. Each worker does ONE named batch and nothing else.

## WHAT "THE PORT SAPPHIRE STYLE" IS, AS A NUMBER

The difference is not palette, it is **local contrast** — how hard the value steps are inside the
figure. Measured as mean absolute luminance step between adjacent opaque pixels, and the share of
those steps at 24 or more:

| sheet | step | hard% | |
|---|---|---|---|
| portSapphire-sailor | 28.2 | 40.1 | **reference** |
| portSapphire-drake | 25.9 | 35.5 | **reference** |
| portSapphire-wisewoman | 22.6 | 35.1 | **reference** |
| millbrook-shopkeeper | 22.4 | 32.8 | kept, owner approved |
| greenhollow-fisherman | 21.8 | 33.7 | redraw |
| greenhollow-villager2 | 19.6 | 28.0 | redraw |
| greenhollow-villager1 | 17.9 | 23.9 | redraw |
| greenhollow-elder | 17.8 | 24.6 | redraw |
| millbrook-miller | 16.5 | 21.3 | redraw — the softest in the cast |

**Acceptance: step >= 22.5 AND hard% >= 33**, which is the Port Sapphire trio's own floor.
Measure with `scripts/measure_npc_style.py`. A sheet that reads mushy at 64px is one whose forms
have no hard edge between them; the fix is drawing decision, not sharpening.

### THE TWO RULES, AND THEY MOVE DIFFERENT NUMBERS (added 2026-08-24, on `tr`)

The v4 brief above measured the target correctly but named only half the cause. `step` and `hard%`
respond to DIFFERENT drawing decisions, and a sheet that fixes only the first stalls at ~30 hard%:

1. **VALUE STRUCTURE moves `step`.** A large NEAR-WHITE mass placed directly against a large DARK
   mass — a pale apron on a dark dress, a cream stole on a dark robe, a white shirt under a dark
   jerkin. Roughly a quarter of the figure each, never one mid-tone over the whole torso.

2. **BREAKING UP FLAT AREAS moves `hard%`, and this is the one that was missing.** `hard%` is the
   SHARE of adjacent-pixel pairs stepping 24+, so a large smooth region *actively lowers* the score
   no matter how dark or light it is. Every big garment area needs REPEATED hard-edged detail
   spaced a few pixels apart: stripes, woven bands, trim, panel seams, laces, a banded hem, and
   fold shadows drawn as **distinct darker BLOCKS** rather than soft shading.
   **This is why `portSapphire-sailor` tops the cast — his striped jersey puts a hard boundary
   every few pixels, not one boundary in the middle of his chest.**

Measured on `greenhollow-elder`, same character, same palette, same pipeline:

| prompt | step | hard% | |
|---|---|---|---|
| original sheet | 17.8 | 24.6 | the sheet being replaced |
| + value structure only | 23.1 | 30.2 | `step` passes, `hard%` still SOFT |
| + break up flat areas | **32.0** | **40.4** | passes, above the sailor's 28.2 / 40.1 |

### MEASURE THE BAKED SHEET, NOT THE `final/` COPY

`measure_npc_style.py` must run on the **baked RGBA** sheet. On the RGB-on-magenta copy there is no
alpha, so the flat magenta background counts as opaque and its zero-steps drag the mean down: the
same elder sheet reads **8.16 pre-bake vs 20.22 baked**. Measuring the wrong copy makes a good
sheet look catastrophically soft.

What that means when drawing:
- **Stepped shading with FEW tones and hard boundaries between them.** Two to four tones per hue,
  each a distinct block. No smooth gradients across a garment.
- **Every part separated from its neighbour by VALUE, not just hue.** The soft sheets fail because
  a brown sleeve sits on a brown body at nearly the same luminance.
- **Clean, simple faces.** Small clear eyes, one skin tone plus one shadow. The reference faces
  read at a glance; the soft ones are a smudge.
- **One big readable prop, not a handful of small ones.** Drake's hat, the sailor's cap and rope,
  the wise woman's staff.
- Still NO drawn dark keyline round the silhouette. That failure mode has its own gate.

## THE BATCHES

Take only the one your dispatch names.

**Batch A — the healer (item 3, one sheet, all three towns).** *"blue themed (young,
nightingale-like)"*. A YOUNG nurse-healer, not the middle-aged herb-gatherer she is now: a clean
blue over-dress with a crisp white apron and a white nurse's kerchief/cap, a small lantern at the
belt (Nightingale's lamp — the one big readable prop), a satchel with a white cross or a bandage
roll. Dominant hue **~215 blue**, and she must own it: currently drake and sailor carry the only
blue/violet mass in the cast, so keep hers clearly lighter and cleaner than drake's navy. Kind and
brisk. This REPLACES today's jade herbalist entirely.

**Batch B — greenhollow: elder, kiki, villager1, villager2.** Keep who they are (Elder Rowan the
village elder, Kiki the child with scrolls, two villagers) and keep them distinguishable from each
other and from Port Sapphire's wise woman by silhouette alone. Their present defect is that they are
four soft brown blurs.

**Batch C — greenhollow fisherman, millbrook herbalist, miller, sage.** Same rule. The miller is the
softest sheet in the cast and needs the biggest change in contrast.

## HARD CONSTRAINTS, unchanged and non-negotiable

- `192 x 256` RGB on pure magenta `255,0,255`. Twelve `64 x 64` cells, **3 cols x 4 rows**.
  Columns: 0 idle, 1 leading-foot contact, 2 opposite-foot contact. Rows: 0 down, 1 left, 2 right,
  3 up. **Author left and right separately — never mirror.** Feet on **row 58** in all twelve cells.
- Chibi JRPG proportions, ~2-3 heads tall, single top-left light, 3/4 top-down, no grid quantization.
- **No black or near-black keyline around the silhouette.** No swords, shields or capes. None may
  read as the heroine (silver-grey armour, cobalt cape, high brown ponytail).
- The anchor for proportion and finish is
  `public/act1-hifi/hero-g3/hero-act1-female-walk-8x3-64-g3.png`.
- **Open the three Port Sapphire sheets and match them.** They are the brief:
  `public/act1-hifi/town/npc/portSapphire-{drake,sailor,wisewoman}-4x3-64.png`.

## PIPELINE — simpler than v3, one hazard removed

1. `codex exec -m gpt-5.6-sol`, brief on **stdin** (`-i` is VARIADIC — a positional prompt after
   `-i` is swallowed as another image path). Pass the hero anchor and ONE Port Sapphire sheet with
   `-i`. Say "do this yourself, one generation call, do not dispatch a sub-agent": Codex sub-agents
   redraw the image and the newest file is often the worst. Score candidates, never trust arrival
   order. Output lands in `~/.codex/generated_images/` AND sometimes beside the input — delete any
   stray directory it drops in the repo.
2. `scripts/fit_npc_sheet.py <RAW> <OUT> --baseline 58`. Always generate large and reduce; the
   LANCZOS reduction is what produces the soft edge the gate measures.
3. Write the sheet to `design/act1-towns/npc/final/<town>-<who>-4x3-64.png` as **RGB on pure
   magenta**. Never RGBA — `bake_npc_sheets.py` now refuses it by name, because eight of that
   directory's sheets are already-keyed RGBA and baking them destroys them.
4. `scripts/bake_npc_sheets.py --src <SCRATCH dir with only YOUR sheets> --out <SCRATCH out>`, then
   copy only your own files into `public/act1-hifi/town/npc/`. **The bake now defringes**, so there
   is no separate halo step and `key_landmark_sprite.py` is not used at any point (it is a
   single-sprite tool that smears one contact shadow across a twelve-cell sheet).

## CHECKS THAT CAN FAIL — report every number

- `python3 scripts/measure_npc_style.py <your sheets>` → **step >= 22.5, hard% >= 33**.
- `python3 scripts/check_character_finish.py <your sheets>` → **PASS** (no drawn dark keyline,
  soft edge, and key bleed <= 25 — that last one catches the magenta halo two workers shipped on
  2026-08-24 by measuring the outermost OPAQUE ring, which excludes the halo by construction).
- `python3 scripts/check_npc_pose_rows.py <your sheets>` -> **PASS**. This gate was added
  2026-08-24 because `greenhollow-villager1` passed style (32.76 / 44.2) AND finish while its
  ROW 2, the RIGHT facing, had been drawn as a view from BEHIND with the character's prop missing
  -- in game she turned her back when walking right. Contrast and edge gates are blind to whether
  the twelve cells carry the four facings the runtime indexes them by, and the rows are small
  enough that a human reading a contact sheet reported "distinct L/R poses" for that very sheet.
  Rows 1 and 2 must BOTH show the face; row 3 is the only view from behind; row 2 must not be
  row 1 flipped. The big prop stays visible and in the same hand in rows 0, 1 and 2.
- 192x256, 3x4 of 64, feet on row 58 in all twelve cells, measured directly.
- For the healer only: md5 identical across the three town copies.
- `python3 scripts/measure_npc_palette.py` → your character's hue family share, and confirm nobody
  else in the cast is above 2% in it.

## MECHANICS YOU WILL OTHERWISE GET WRONG

- **You cannot wait on your own background job** — a subagent never receives its own job's
  completion notification. Run every long job through `~/.claude/scripts/watch-job.sh` in the
  FOREGROUND, in a loop, `--max-seconds 540`; **exit 4 means TIMEOUT, call it again**, 0 SUCCESS,
  1 FAILED, 2 DIED, 3 STALLED. Returning while your generation is still running wastes a full round
  trip and happened on 2026-08-24.
- `pgrep -f "codex exec"` matches the watching shell's own command line and never clears. Use
  `ps -eo pid,command | grep -E "codex exec -m|xcodebuild " | grep -v grep | grep -v SECONDS`.
- Stop and report after **eight generation calls** or **two failed retries on one character**.

## RETURN

Absolute paths written, every number above, the generation-call count, and any `NEEDS-CONSULT`.
Do NOT run the repo gate, do NOT repin, do NOT commit — the lead does that on the committed tree.
