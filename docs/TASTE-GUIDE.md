# Chris's taste guide (v1, 2026-11-23)

Purpose: let an agent predict the owner's call on look and feel before asking him.
Source: his recorded rulings, 2026-08 to 2026-11 (project memory, review threads, artifact comments).
Status: v1, written from the record. A first backtest (docs/taste/backtest-2026-11-23.json) scored 30/30, but a predictor with no guide scored 29/30 on the same cases, so the test leaks and proves nothing. A valid backtest is still owed. Images (approved / rejected pairs) still to be attached per rule.

How to use it
- A change that a rule here covers: do it, and log it for the weekly packet under "decided for you" with before/after images.
- A look or feel no rule covers: build your pick behind a switch, put an A/B in the packet, record your predicted answer first (section 6).
- A direction change (scope, story, new mechanic, removing a feature): mockups to Chris before any code.
- When two rules pull apart, the more specific and more recent ruling wins. If still unclear, ask; never infer which art is authoritative.

## 1. Principles

P1. **Painted art is the truth.** Where baked/painted art exists, procedural terrain is never the visible surface. Never cut, clone or paste paint to patch a problem; keep the original paint and adjust only where it meets other terrain.
   - "Locked in art, full stop" (2026-08-11). Mountains: "never cut off the mountain paint; only the base, where it meets other terrain, should follow the land outline" (2026-10-28).
   - Never paint act-specific art over Act 1 paint (2026-10-28).

P2. **Shapes follow the artwork, never rectangles.** Collision is traced to the painted edge of each object. Open ground stays walkable; objects, water, reeds and plants are blocked to their edge.
   - Town blockers: rectangles rejected twice (2026-10-28, 2026-10-29). Dungeon and mountain blockers "too excessive" when he could not walk behind the dungeon (2026-10-26).
   - Tall things let the hero walk behind their tops; only the base band blocks.
   - Towns are blocked along their whole outline; only the gate opens (2026-10-26).

P3. **Natural edges.** Land meeting water has smooth edges, sand in most cases. Mountains need no sand and may overhang water, especially with water to the N, E or W. No grass strip and no walkable strip between cliffs and sea. Foam and shadow only where a mountain's base meets water.

P4. **Sparse screens, little text.** One idea per screen. If in doubt, remove.
   - Ending mockup 1: "better but way too cluttered" (2026-11-10). He chose the one-screen layout: title, hero, one line, results, two buttons.

P5. **Big moments look grand.** Celebration screens are congratulatory: gold, rays, stars, prominent message and results.
   - Ending: "more grand and congratulatory", then "more prominent message + time/grade" (2026-11-11).

P6. **The world gives the cue.** Signals come from animation in the scene, not banners, arrows, markers or marked tiles.
   - Storm Nest: "no banners; a clear gust animation is the cue". Iron Mine: lever beside the junction, "subtle track change, no arrow". Stormreach: "no marked tiles/rod"; the stone glows before a strike (2026-11-03).

P7. **Each dungeon's puzzle is its own, visible in the art.** No generic keys and locks. Old mechanics were workarounds; use improved systems. Not every dungeon needs a mechanic.
   - 2026-10-29. Rejected: hammers/crucible, windlass drawbridge, timing traps for Bandit Hideout, lanterns in Haunted Forest. Chosen: lava channels, tripwires that glint, whole-floor lightning turns.

P8. **Mistakes cost a little and never trap.** Penalties are a push back, small damage, a named enemy fight, or a drop to the floor below. No soft-locks, ever. Puzzles that can be mis-set need a reset.
   - Bandit spikes "small damage + push back"; Storm Nest fall "drops the player to the floor below"; Desert Tomb wrong plate = Tomb Guardian fight then reset; Oasis "no soft-locks" (2026-11-03).

P9. **Built for small hands and young readers.** Kids band 6-8. Paths about 3 tiles wide where the player must steer under pressure. Grades 1-2 get optional hints (HUD collapsed by default). Secrets "neither too hard nor too obvious".

P10. **Motion is noticeable but natural.** Animation must be clearly visible, and must look like the thing it is.
   - Water: wanted "real water surface animation, not just a foam pulse", then "more noticeable"; near-white crests rejected ("must NOT look white") (builds 88-90). Art and motion "must look natural" (Iron Mine). Storm Nest windows "look unnatural".

P11. **Every act matches Act 1; Dragon Quest is the bar.** Acts 2-5 towns are painted like Act 1 (kitbash rejected). All Acts 2-5 dungeons must match Act 1 dungeon quality. Mountains use large cliff panels: no miniature spires, no gaps.

P12. **Sharp, but easy on the eyes.** "Sharper the better", but over-sharpening "hurts my eyes" (build 75 went back to 130% / r0.9).

P13. **Fair quiz rule.** A wrong answer may damage but never finish an enemy; a correct one may.

P14. **Safety of the player's progress.** New Game over a save asks first. Defeat is gentle: last town, full HP, half gold. Boss retry restores the fight's starting state.

## 2. Numbers that are locked

| Thing | Value | Ruling |
|---|---|---|
| World scale | 70% | locked 2026-09-21 |
| Walk speed | 5.4 cells/s | "Keep it" |
| Scrolling | mode A (step) | build 94 feedback, 2026-11-10 |
| Overworld collision | 9 world-px sole disc + glide | build 94 "feels good" |
| Facing | 20% dead band | build 95 |
| Walking pauses | none over 100 ms on standard routes | build 96 "I don't notice any pauses" |
| Save slots | 5, each with auto save and manual save | 2026-11-04 |
| Menu save | towns only | 2026-11-04 |
| Crystals | heal and warp, no save | 2026-11-04 |
| Steering paths | about 3 tiles wide | Storm Nest, 2026-11-03 |
| Glyph puzzles | orthogonal steps only; 2-3 steps on 2x2, 3-9 on 3x3 | Desert Tomb |

## 3. Checklists by area

**Overworld**: painted surface everywhere (P1); smooth sandy coasts, cliffs meet sea directly (P3); hero walks behind dungeon and rock tops (P2); no dirt paths that lead nowhere (he had every path removed: none reached a town); connecting dungeons touch blocking terrain on both sides; entrances that blend into terrain use terrain-specific art; water moves, blue not white (P10); no hitches (section 2).

**Towns**: painted, not kitbashed (P11); no tall walk-behind props in walkable areas (lamp posts, pillars, tall trees); healer, shop doors and every NPC reachable; every tree, fence and prop has a traced blocker; exit only by the gate.

**Dungeons**: new organic layouts, never the old generated ones; the mechanic works in game and reads from the art (P7); cue by animation (P6); penalties per P8; steering paths 3 wide (P9); a floor that looks busy is a defect; plan complex puzzles on a grid and prove them solvable before art or code (Oasis Depths, Demon Castle).

**Screens and text**: sparse (P4); grand when celebrating (P5); EN, kana and kanji in sync, natural JRPG phrasing; no debug UI in the shipped game.

**Feel**: bump/slide as build 94; no pauses as build 96; no corner shiver; frames of a character match in size across directions (male right-facing frames were redrawn, not mirrored or scaled).

## 4. How he decides (patterns worth predicting)

- Given a quick patch or a proper redo of art, he picks the proper redo (male hero frames: "redraw", not mirror or enlarge).
- Given more or less on a screen, he picks less, except at celebration moments.
- Given a marker or an in-world animation as a cue, he picks the animation.
- Given a harsh or a gentle penalty, he picks gentle but real.
- He approves concepts quickly ("awesome", "good") and then asks for polish in the real build; he says he must play to judge feel ("fine but I need to play the game to see how it feels").
- He wants previews of animation before it is locked.
- He resolves his own comment threads; agents do not resolve them.

## 5. Decision record

One row per recorded decision, kept in `docs/taste/decisions.jsonl` (to be filled from the threads): `{date, area, question, options[], chosen, quote, images[]}`. This file is the backtest set: an agent that sees only sections 1-4 and a row's question and options predicts `chosen`.

## 6. Predict, then check

For every question sent to Chris, append to `docs/taste/predictions.jsonl` BEFORE he answers: `{date, area, question, options[], predicted, confidence, rule}`; add `chosen` when he answers. Areas: overworld-art, towns, dungeon-layout, dungeon-mechanic, screens, puzzle-feel, difficulty, audio. An area graduates (its calls go to "decided for you" instead of questions) at 85% agreement over at least 10 answers. A veto sends it back. Every miss becomes a rule or an example here.

## 7. Thin spots (no rulings yet)

Battle pacing and length, difficulty by grade, gold and shop prices, enemy art quality, music and sound, tutorial/onboarding, quiz subject mix. A one-time A/B set for Chris covers these; until then treat them as "new look or feel" (build behind a switch, ask in the packet).
