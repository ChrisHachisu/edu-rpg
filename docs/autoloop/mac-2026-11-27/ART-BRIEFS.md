# Art briefs for the first Mac batches (A1, A2, A3), copied from the day 4 design reviews

Rules: docs/AGENT-WORKFLOW.md section 4 and docs/TASTE-GUIDE.md. Queue: ART-QUEUE.md in this folder.

## A1 Cut enemy sprites (battles review, B1)

**Brief 1 (B1): finish three cut sprites.**
What: the bottom of `monster-crystalHydra`, `monster-darkKnight` and `monster-slime` in `public/assets/monsters-hd/` (1024 px wide WebP with transparency). Each painting runs off the bottom of its canvas.
- Crystal Hydra: paint the coiled lower body and tail tips resting on the ground, and the base of the small crystal cluster at the left. About 150 px more canvas at the bottom.
- Dark Knight: paint the boots, the ragged cape hem and the sword tip touching the ground. About 120 px more.
- Slime: round off the base so the blob bulges and sits on the ground with a curved underside; keep the two side lumps. About 40 px more.
Match: each sprite's own line weight, palette and shading exactly; keep everything above the cut untouched (extend, do not redraw). Leave at least 20 px of empty margin on every side. The old 128 px sprites in `public/assets/monsters/` show the full pose for the hydra and the knight.
Rejected before: cutting, cloning or pasting paint to patch a problem (P1); mirrored or scaled fixes instead of a redraw (male hero frames).


## A2 Town map icons (overworld review OW-04 / OW-11; towns review T15)

**OW-04 / OW-11 Town icons.** Nine icons, each about 6x5.5 cells (about 440x400 px at capture scale), clean alpha edge, no dither fringe. Each is a small view of that town's own painted plate (Ironkeep forge and walls, Frostwatch snowed-in watchtower, Ravenhollow ghost village, Ember's Rest, Oasis Haven around its pool, Ruins Camp tents in ruins, Cinderwatch, Last Bastion fortress, Haven's Edge). Match the finish of the Greenhollow, Millbrook and Port Sapphire icons. Rejected before: kitbashed towns, tinted copies.

**A6. Nine world-map town icons (T15).** What: one painted icon each for Frostwatch, Ironkeep, Ravenhollow, Oasis Haven, Ruins Camp, Ember's Rest, Cinderwatch, Last Bastion and Haven's Edge that shows what is inside: a stone keep on terraces for Ironkeep, a walled snow village for Frostwatch, a dark village with a graveyard for Ravenhollow, adobe houses round a pond for Oasis Haven, tents and red rock for Ruins Camp, a forge town by lava for Ember's Rest, a watch post between lava channels for Cinderwatch, a grey castle wall for Last Bastion, a lone stockade for Haven's Edge. Where: the current icon positions on the world map. Size: the footprint of the Greenhollow icon (about 190 x 150 px in the screenshot), with a clean edge that sits on snow, sand, ash or dusk ground. Must match: the three Act 1 icons (`ow-gate-greenhollow`, `ow-gate-millbrook`, `ow-gate-portSapphire`). Rejected before: tinted clones, cut-out fringes, cloned paint, act-specific art painted over Act 1 paint.

## A3 Demon King field sprite (ui-en review, UE-09)

**A1 (for UE-09): Demon King Malachar, field sprite.**
- What: the final boss as he appears on the dungeon floor before the fight, replacing the black smoke ball with red eyes.
- Where: Demon Castle 9F, at the head of the red carpet in front of the throne (in `ui-ending-throne-en.jpg`, about x 340-450, y 280-440).
- Size: the hero is about 100 px tall in the 780 px capture (50 pt). Paint the boss at 1.5 to 2 times the hero, about 150-200 px tall, on a transparent background, with a soft contact shadow as a separate layer.
- Must match: the battle painting in `ui-final-start-en.jpg` (purple skin, white mane, gold crown with a red gem, dark armour with gold trim, red bat wings), drawn at the pixel density and outline weight of the hero and town NPC field sprites (`ui-town-talk-button-en.jpg`).
- Rejected before: a boss baked into the background ("looks like a background and not like an asset", build 38); the hero drawn on top of the boss (build 38); mirrored or scaled frames in place of a redraw (male hero frames); kitbashed or cloned paint (P1, P11). It must be a real sprite that sorts against the hero and vanishes with its shadow after defeat.
