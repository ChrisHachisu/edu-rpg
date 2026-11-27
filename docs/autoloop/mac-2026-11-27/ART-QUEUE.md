# Painted art queue from the day 4 design reviews (2026-11-27)

Source: day4/critic/{ui-en,ui-ja,battles,towns,overworld}/FINDINGS.md (each has an "ART briefs" section; ids below point there). Dungeons and mechanics reviews will add rows.
Rules that bind every batch: docs/AGENT-WORKFLOW.md section 4 (the planning task never generates; one worker per asset family; about four final assets per batch; hand off after eight generation calls or two failed retries; never resume a finished batch; generation by `codex exec` with an explicit model on the Mac in the Japan evening, launched with nohup + caffeinate). docs/TASTE-GUIDE.md P1, P3, P10, P11, P12. Old files are kept; every new asset ships behind its loader path so the old look can be restored. Nothing here goes into a build Chris has not seen: results go to the Saturday packet with before/after.

Order = rank, then how self-contained the family is (small assets with a clear anchor first).

| # | Family | Finding | Rank | Assets | Anchor (must match) | Integration | Batches |
|---|---|---|---|---|---|---|---|
| A1 | Cut enemy sprites | battles B1 | P1 | 3: Crystal Hydra, Dark Knight, Slime (extend the bottom; keep everything above the cut) | each sprite itself; old 128 px sprites show the full pose | file swap in public/assets/monsters-hd/ (pin) | 1 |
| A2 | Town map icons | overworld OW-04, OW-11; towns T15 | P1 | 9: Ironkeep, Frostwatch, Ravenhollow, Oasis Haven, Ruins Camp, Ember's Rest, Cinderwatch, Last Bastion, Haven's Edge | each town's own approved plate, in small; Act 1 icons for scale, outline and alpha edge | overworld icon table (acts runtime) | 3 |
| A3 | Demon King field sprite | ui-en UE-09 | P2 | 1 sprite + shadow | battle painting of Demon King Malachar; hero field sprite density | Demon Castle 9F boss object | 1 |
| A4 | Dungeon mouths | overworld OW-06 | P2 | 5: Haunted Forest second entrance, Oasis Depths, Obsidian Cavern, Bandit Hideout, Void Rift | the good mouths (Magma Tunnels, Desert Tomb, Frozen Lake); terrain around each | overworld mouth table | 2 |
| A5 | Battle backdrops | battles B4 | P2 | 6: Iron Mine, Crystal Cave, Shadow Cave, Oasis Depths, Scorched Ruins, Coastal Reef | the five boss arenas for density; each dungeon's own floors for content | MAP_BG table in ui-overhaul.js (worker FB owns it today) | 2 |
| A6 | Save point prop | towns T8 (owner call T9) | P2 | 1 prop, used in 12 towns + 4 villages | Act 1 town props; must not be a crystal | town data + pill rule | 1, after Chris answers T9 |
| A7 | Portal isles (overworld) | overworld OW-01 | P1 | 4 maps of 40x40 cells: Frostfall, Stormreach, Sunken Temple, Twilight, each with its own identity and mouth | Act 1 overworld paint and the acts 2 to 5 export pipeline | export_runtime.py path, blockers traced to paint, nav and jump data | 4 or more; needs a layout plan first |
| A8 | Portal villages (towns) | towns T1 (and T2 if it is art, not a render bug) | P1 | 3 or 4 small plates | the nine approved Acts 2 to 5 plates; no tall walk-behind objects (ruling 2026-10-28) | hi-fi town path, traced blockers, people placement | 4; needs a layout plan first |
| A9 | Mesa and lava cliff edges | overworld OW-02, OW-03 | P1 | every cut edge listed in the rows (Acts 3 and 4) | whole cliff panels to a natural base; "never cut off the mountain paint" 2026-10-28 | overworld chunks; find the clip mask first (may be partly CODE) | 4 or more |
| A10 | Act borders | overworld OW-05 | P1 | 5 transition bands about 6 cells wide | both ranges at each border | overworld chunks; never paint over Act 1 paint | 3 |
| A11 | Shores, Acts 3 to 5 | overworld OW-07 | P2 | shore band in Acts 4 and 5; foam colour instead of the white line in Acts 3 to 5 | Act 1 sand band and foam; "must not look white" | overworld chunks, may be partly CODE (outline colour) | 2 |
| A12 | Small overworld repairs | overworld OW-08, OW-09, OW-13 | P2/P3 | palm grove edge; Act 1 spire patch and grass pockets; Act 5 west edge | neighbours | overworld chunks | 2 |
| A13 | Frostwatch ground | towns T12 | P2 | ground repaint only | Ironkeep and Ravenhollow cobbles | plate swap, blockers unchanged | 1 |
| A14 | Paving patches, soft townsfolk | towns T13, T14 | P2 | only if the cause is in the paint (check code first) | | | after the check |
| A15 | Boss repaints, harpy chests, title backdrop | battles B6, B8; ui-en UE-08 | P2 | only on Chris's pick (packet) | | | after his answer |

Tonight on the Mac (first evening): A1, A2, A3 as three fresh worker tasks, then A4 and A5 if time allows. A7 to A12 need a plan per map (which chunks, which mask, how blockers and nav are regenerated) before any generation: plan in the cloud first.
