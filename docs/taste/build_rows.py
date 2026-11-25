#!/usr/bin/env python3
"""Writes docs/taste/decisions.jsonl (v2, 2026-11-26). Every row is a decision on record.
usable=false rows are kept for the record but never enter the test (alternative not on record)."""
import json
ME = "/tmp/claude/memory/team/silo/"   # project memory (not in repo)
OD = "edu-rpg-owner-decisions.md"; MD = "edu-rpg-mechanic-demo-rulings.md"; SV = "edu-rpg-save-system.md"
RL = "edu-rpg-release-loop.md"; AS = "edu-rpg-acts2-5-status.md"; MM = "MEMORY.md"
H = "docs/handoffs/"
U = []  # usable
def r(id, date, area, q, opts, ch, quote, src, rules, basis):
    U.append(dict(id=id, date=date, area=area, question=q, options=opts, chosen=ch, quote=quote, source=src,
                  images=[], usable=True, rules=rules, alt_basis=basis))
r("G01","2026-07-29","overworld-art","How is the Act 1 overworld's walkable and blocked terrain map produced?",
  ["Generated automatically by the pipeline from the art","Painted by hand by the owner, and the game follows that paint"],1,
  "the owner rejects the generated map (\"the semantic map is a mess\") and paints the terrain by hand",
  H+"2026-08-02-act1-collision-must-follow-owner-paint.md",["P1"],"old behaviour vs his ruling")
r("G02","2026-08-02","overworld-art","At what resolution is the Act 1 overworld art baked?",
  ["16 px per tile, upscaled about 5.75x on screen (as shipped)","48 px per tile, upscaled about 1.9x on screen"],1,
  "Owner picked 48 on an in-game single-chunk proof.",H+"2026-08-02-act1-collision-must-follow-owner-paint.md",["P12"],"shipped vs proof shown to him")
r("G03","2026-08-11","overworld-art","While the player walks the Act 1 overworld, may the procedurally generated ground texture ever be what is shown?",
  ["Yes, where the painted art is thin or missing, the generated texture fills in","No, only the painted art is ever shown"],1,
  "no. locked in art, full stop.","docs/GROUND-TRUTH.md (OWNER DIRECTIVES, 2026-08-11)",["P1"],"question put to him")
r("G04","2026-08-11","overworld-art","Before painted overworld chunks have loaded, what does the player see in the uncovered area?",
  ["The generated ground texture as a temporary fill","A flat sea colour sampled from the painted art"],1,
  "the owner chose \"flat ocean colour, no procedural\" over keeping it as a loading fallback","docs/handoffs/2026-08-11-procedural-surface-over-locked-art.md; docs/GROUND-TRUTH.md",["P1"],"loading fallback on the table")
r("G05","2026-08-26","towns","Where is each town's exit trigger?",
  ["Where build 62 had it, partway into the town map","At the edge of the town map"],1,
  "the exit of the town is set at a weird place too. i want the exit to be set to the edge of the town map (all towns).",H+"2026-08-26-build62-feedback.md",["T-exit"],"old behaviour vs his ask")
r("G06","2026-10-26","overworld-art","Can the hero walk behind a dungeon building on the overworld?",
  ["No: the building's whole footprint blocks the hero (build 86)","Yes: only the bottom band (about 21 px) blocks; the hero can stand behind the upper part"],1,
  "dungeon and mountain blockers are still too wide (he can't walk behind the dungeon) ... Approved: ... the mountain tuck-behind (top 24 px of each rock run is walk-behind).",ME+OD,["P2"],"build 86 vs build 87 proposal")
r("G07","2026-10-26","overworld-art","What happens to the dirt paths drawn on the overworld, none of which ends at a town?",
  ["They stay","They are removed"],1,"Chris wants every dirt path removed. None of them reach a town.",ME+OD,["T-paths"],"old vs his ask")
r("G08","2026-10-26","overworld-art","In the build 88 pass, thin grass strips between a mountain and the sea become what?",
  ["Water (blocked)","Extended mountain rock (blocked)"],1,
  "Wants the mountain base to follow the island's outline: grass strips by the sea become extended mountain rock (ROCKFILL in coast.py), not water.",ME+OD,["P3"],"build 88 proposal vs his review (his build-87 note the same day worded it the other way; the later review is used)")
r("G09","2026-10-28","overworld-art","Two water animation previews (build 91): which one is locked?",
  ["A: bright glints moving across the water","B: a texture drifting across the water"],0,
  "Build 91 (2026-10-28) approved by Chris (\"really good\"): water option A with the alpha fix, plus full mountain paint.",ME+MM,["P10"],"previews A and B")
r("G10","2026-10-28","overworld-art","What colour are the moving wave crests?",
  ["Near-white (build 90)","Blue tones"],1,"moving water must NOT look white (b90 crests were near-white)",ME+OD,["P10"],"build 90 vs his ask")
r("G11","2026-10-28","overworld-art","Where mountain paint meets other terrain, what is changed?",
  ["The mountain paint is cut off at the join (build 90)","The original paint stays whole; only the base where it meets other terrain is adjusted to the land outline"],1,
  "Mountains: never cut off the mountain paint; only the mountain's BASE, where it meets other terrain, should follow the land outline.",ME+MM,["P1"],"build 90 vs his ask")
r("G12","2026-10-28","overworld-art","Between cliffs and the sea:",
  ["A walkable strip of land remains","No walkable strip; the cliffs meet the sea directly"],1,
  "Overworld: no walkable strip between cliffs and sea",ME+AS,["P3"],"delivered state vs his ask")
r("G13","2026-10-28","dungeon-layout","Which floor layouts do the Acts 2-5 dungeons use?",
  ["The old game's generated layouts, reused","New hand-authored layouts in the Act 1 style, with each dungeon's puzzle designed into them"],1,
  "Dungeons: NEW organic Act 1-style layouts for every dungeon with the mechanic designed in; never reuse the old game's generated (Ap) layouts.",ME+AS,["P7","P11"],"card option vs recommendation")
r("G14","2026-10-28","towns","Do the Acts 2-5 town paintings contain tall objects (lamp posts, pillars, tall trees) inside walkable areas, so the hero walks behind them?",
  ["Yes, as delivered","No: towns regenerated without them"],1,
  "Towns: regenerate all with Codex WITHOUT tall walk-behind objects (lamp posts, pillars, tall trees inside walkable areas).",ME+AS,["T-tall"],"delivered vs his ask")
r("G15","2026-10-29","towns","How are town collision blockers shaped?",
  ["Hand-placed rectangles per object","Traced to the painted edges of each object"],1,
  "rectangles rejected again. Blockers must be traced to the painted edges of each object (snap to art pixels)",ME+AS,["P2"],"old vs his ruling")
r("G16","2026-10-29","dungeon-mechanic","Do dungeons use a generic key-and-lock?",
  ["Yes, as a common mechanic","No: each dungeon uses its own mechanic visible in its art; key-and-lock only where it is that dungeon's own feature"],1,
  "NO generic key-and-lock in any dungeon unless it's that dungeon's own feature; old mechanics were low-quality workarounds",ME+AS,["P7"],"old vs his ruling")
r("G17","2026-11-03","dungeon-mechanic","Iron Mine: how does the cart change lane at the junction?",
  ["The player pulls a lever beside the junction and a direction arrow is shown","The player pulls a lever beside the junction and the track changes with no arrow"],1,
  "lane change stays a player-pulled lever, subtle track change, no arrow",ME+MD,["P6"],"arrow named in his quote")
r("G18","2026-11-03","dungeon-mechanic","Storm Nest: how is the player told a gust is coming?",
  ["A text banner announces each gust","A gust animation plays in the scene; no banner"],1,
  "no banners; a clear gust animation is the cue",ME+MD,["P6"],"banner named in his quote")
r("G19","2026-11-03","dungeon-mechanic","Desert Tomb: which core mechanic?",
  ["A floor of pit traps to avoid","A floor of glyph plates stepped in an order shown on a tablet in a separate entrance chamber"],1,
  "no pit. Glyph-order floor: order shown on a tablet at each floor entrance ... The order must NOT be visible in the plate room",ME+MD,["P7"],"pit named in his quote")
r("G20","2026-11-03","dungeon-mechanic","Bandit Hideout: which trap design?",
  ["Spikes that rise and fall on a rhythm the player times","Tripwires that glint now and then (a 'Cut trip wire' button appears when near) and spikes under a slightly different floor patch"],1,
  "not timing traps. Tripwires nearly invisible, glint periodically",ME+MD,["P7"],"timing traps named in his quote")
r("G21","2026-11-03","dungeon-mechanic","Volcanic Forge: which mechanic?",
  ["Hammers and a crucible the player times","A windlass that lowers a drawbridge","Turning trough tiles to route molten iron into a mold that cools into a bridge"],2,
  "hammers/crucible and windlass drawbridge rejected. CHOSEN: lava channels",ME+MD,["P7"],"rejected options named")
r("G22","2026-11-03","dungeon-mechanic","Stormreach Spire: which mechanic?",
  ["Wind that pushes the hero across the floor","Tiles marked safe plus a lightning-rod item","The floor is struck in timed turns; the stone glows before each strike and the player finds the safe path"],2,
  "no wind, no marked tiles/rod. Whole floor area is struck in timed turns; stone glows before a strike; player must find the safe path. Approved ('awesome').",ME+MD,["P6","P7"],"rejected options named")
r("G23","2026-11-03","dungeon-layout","Haunted Forest: which structure?",
  ["A multi-level maze lit by lanterns, with stairs between levels","A single-level maze with no lights and no stairs; rooms connect through gaps at the map edges with a sliding room-to-room transition"],1,
  "no lanterns/lights; simple maze; single level, NO stairs; rooms connect through gaps on any map edge with a sliding room-to-room transition",ME+MD,["P7"],"lanterns and stairs named")
r("G24","2026-11-04","screens","How many save slots per device? (A written proposal recommended 3.)",
  ["3 slots","5 slots"],1,"5 slots (ALL LOCKED 2026-11-04, Chris); the proposal recommended 3",ME+SV,["S2-slots"],"proposal recommendation vs his lock")
r("G25","2026-11-04","difficulty","What happens when the party is defeated?",
  ["No penalty; the player reloads where they were (build 93)","The player wakes in the last town with full HP, keeps all items and loses half their gold"],1,
  "defeat = last town, full HP, keep all, lose half gold",ME+SV,["P8","P14"],"current behaviour vs proposal he locked")
r("G26","2026-11-04","difficulty","Boss retry: what state does the fight restart in? (A written proposal recommended full HP, no gold loss.)",
  ["Full HP, no gold loss","HP and items exactly as they were when the fight began"],1,
  "boss retry restores HP/items exactly as at fight start (option 5B, not full heal)",ME+SV,["P14"],"proposal recommendation vs his lock")
r("G27","2026-11-04","screens","Dungeon crystals:",
  ["Save, heal and warp","Heal and warp only; saving is automatic at checkpoints and manual only in towns"],1,
  "remove save from dungeon crystals ... crystals heal+warp, no save",ME+SV,["S2-crystals"],"current behaviour vs his ask")
r("G28","2026-11-10","direction","Scope of the public release:",
  ["All five acts with the new rebuilt worlds","Act 1 first, later acts as updates","All five acts, keeping the old Acts 2-5 layouts"],0,
  "all five acts with the new worlds (option A)",ME+RL,["P11"],"decision card options A/B/C")
r("G29","2026-11-10","puzzle-feel","Overworld scrolling test on device: which mode?",
  ["A: the camera steps in whole game pixels","B: the canvas shifts by the sub-pixel scroll remainder"],0,
  "scrolling \"probably A\", still \"a bit laggy\" ... Chris chose A (Settings row removed)",ME+RL,["S2-scroll"],"switch A/B on device")
r("G30","2026-11-10","overworld-art","The male hero's right-facing walk frames are drawn at about 81% of the size of his left-facing frames. Fix by:",
  ["Mirroring the left-facing frames","Enlarging the existing frames 1.227x","Redrawing the frames"],2,
  "Chris chose option 3 (redraw on the Mac)",ME+RL,["S4-redo"],"decision card options 1/2/3")
r("G31","2026-11-10","puzzle-feel","Hero collision against obstacle edges on the overworld: which behaviour?",
  ["Build 93: a 50x11 px bar at the feet; in the test, 51% of pushes into edges were dead stops","Build 94: a 9 px disc at the feet plus gliding along edges; in the same test, 26% were dead stops"],1,
  "bump/slide \"feels good\" (collision change accepted)",ME+RL,["S2-collision"],"build 93 vs build 94")
r("G32","2026-11-10","screens","Ending screen layout:",
  ["A: one screen with title, hero, one line, a small results line and two buttons","B: two steps, a celebration screen and then a results screen"],0,
  "Chris chose ending layout A (one simple screen: title, hero, one line, time/grade, two buttons).",ME+RL,["P4"],"decision card options A/B")
r("G33","2026-11-11","screens","Ending screen styling, same layout A and same text:",
  ["The first build: plain style","Restyled: gold sunburst rays behind the hero, three stars, gold title, confetti and twinkles"],1,
  "Chris: grand version better (after: layout A content is right but the design must be more grand and congratulatory)",ME+RL,["P5"],"first build vs restyle shown to him")
r("G34","2026-11-11","puzzle-feel","Overworld walking, builds compared on device:",
  ["Build 95: brief pauses while walking","Build 96: no pause over 100 ms on the standard routes"],1,
  "Much better. I don't notice any pauses at the moment.",ME+RL,["S2-pauses"],"build 95 vs build 96")

def n(id,date,area,q,reason,quote,src):
    return dict(id=id,date=date,area=area,question=q,options=[],chosen=None,quote=quote,source=src,images=[],usable=False,reason=reason)
N=[
 n("D03","2026-11-03","puzzle-feel","Storm Nest: what happens when a gust blows the hero off a walkway?","alternatives not on record (v1 invented two)","Getting blown off a walkway drops the player to the floor below as the penalty",ME+MD),
 n("D04","2026-11-03","dungeon-mechanic","Shadow Cave: shadows while crystals shine","alternative not on record","shadows FREEZE in place (stay visible, bound), and bumping a frozen shadow still starts the battle",ME+MD),
 n("D06","2026-11-03","puzzle-feel","Desert Tomb: wrong plate","alternatives not on record (v1 invented two)","Wrong plate = battle with a specific enemy (Tomb Guardian), then push back + reset",ME+MD),
 n("D11","2026-11-03","dungeon-layout","Frozen Lake: share of sliding","alternative not on record","a slippery ice room as the main feature ... plus ordinary paths/exploration",ME+MD),
 n("D12","2026-11-03","puzzle-feel","Order puzzles: hint for grades 1-2","alternatives not on record","Grades 1-2 get an optional hint HUD, collapsed by default",ME+MD),
 n("D14","2026-11-04","screens","What one save slot holds","alternative not on record","each slot keeps BOTH auto save and last manual save, player picks which to load",ME+SV),
 n("D21","2026-11-10","screens","First ending mockup verdict","single mockup verdict, no alternative offered","better but way too cluttered",ME+RL),
 n("D24","2026-11-10","direction","Bugs only in old Acts 2-5 layouts","no options on record, only his instruction","totally forget about the old dungeon; it can be a springboard but this version is a rebuild",ME+RL),
 n("D25","2026-11-11","screens","NG+ from the save data screen","his own request, no alternative","asked that NG+ also be selectable later from the save data screen",ME+RL),
 n("D26","2026-11-03","dungeon-mechanic","Void Rift crossing","alternative not on record","square blocks that touch when passing; walk across, no jump",ME+MD),
 n("D27","2026-11-03","dungeon-mechanic","Coastal Reef shallow water","alternative not on record","water never walkable; rising tide blocks and nudges hero back",ME+MD),
 n("D28","2026-11-03","dungeon-mechanic","Whispering Woods firefly trigger","alternative not on record","firefly glow pulses from the cave middle to the stairs on a fixed beat, no trigger",ME+MD),
 n("D29","2026-11-03","puzzle-feel","Scorched Ruins secret walls","alternatives not on record (v1 invented extremes)","secrets neither too hard nor too obvious (faint crack + small hint)",ME+MD),
 n("D30","2026-11-03","dungeon-layout","Storm Nest floor layout","alternative not on record","Floors are mostly wide walkways over gaps (few walls) ... Paths ~3 tiles wide",ME+MD),
 n("X01","2026-11-10","overworld-art","Male hero redraw A or B","how A and B differ is not on record","Chris picked redraw A",ME+RL),
 n("X02","2026-11-24","puzzle-feel","Keypad design option 1 or 2","choice only inferred ('read as option 1') from 'looks good, build it'","looks good, build it",ME+"edu-rpg-keypad-answers.md"),
 n("X03","2026-10-13","overworld-art","Lighter water R2","alternatives not on record","Approved lighter water \"R2\"",ME+OD),
 n("X04","","overworld-art","Sharpening at build 75","no date on record","\"Sharper the better\" ... build 75 \"hurts my eyes\" so it went back to 130%/r0.9",ME+OD),
 n("X05","2026-10-29","towns","Round-3 town artwork picks","approvals without the rejected alternatives","round-3 town ARTWORK approved (ironkeep try1, frostwatch try1 ...)",ME+AS),
]
rows=U+N
with open("/home/user/edu-rpg/docs/taste/decisions.jsonl","w") as f:
    for x in rows: f.write(json.dumps(x,ensure_ascii=False)+"\n")
print(len(U),"usable",len(N),"unusable")
