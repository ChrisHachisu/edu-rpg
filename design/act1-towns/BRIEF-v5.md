# Task: Port Sapphire town screen, v5 — make it a real port, loosen the streets

Repo: /Users/christopherhachisu/Documents/claudecode/edu-rpg-map-engine-semantic-data

**Base to improve:** `design/act1-towns/portSapphire-screen.png` (v4). The owner APPROVED v4's
scale, brightness, walkable clarity, building coherence and the shop/healer treatment. v5 is v4
with the harbour rebuilt and the street plan loosened. Everything in KEEP below must survive.

**Harbour reference:** `design/act1-towns/portSapphire-screen-v3.png` — its harbour is the
density target. Nothing else about v3 is a reference; v3's tone and clutter were rejected.

**Style/palette anchor:** `design/act1-towns/anchor/portSapphire-style-anchor-65.png` is the
surrounding overworld terrain at exactly this density. Match its grass, water, grain and daylight.

## Output
`design/act1-towns/portSapphire-screen-v5.png`, exactly **1885 x 1885**, RGB.
65 x 65 world cells at 29 art px per cell. Do not output any other size.
Do not overwrite `portSapphire-screen.png`.

---

## KEEP — owner-approved in v4, regressing any of these fails the task

1. **Scale.** The player is **65 art px** tall. Cottage ~196 px, house/shop ~228 px, inn ~293 px.
   Nine to eleven buildings across the width. **A building must NEVER be near the player's
   height.**
2. **Brightness.** v4 measures mean RGB (90, 101, 39), luminance **90.7**; the overworld target is
   luminance **89.5**. Stay in that daylight. Do not go darker.
   > STYLE-BLOCK OVERRIDE, owner-directed. `design/ART-DIRECTION.md`'s environment style block
   > says "dark, dense, realistic old-growth ... deep forest shadows". That language is STALE and
   > pulled an earlier pass 25 luminance too dark. Embed its MATERIAL and COMPOSITION guidance;
   > IGNORE its tone/darkness language and hit the measured luminance above instead.
   > This is a bright coastal day, not dusk under a canopy. One upper-left light source, real but
   > short and light shadows.
3. **Walkable clarity.** Lanes are **3-4 cells (87-116 art px) of open, uncluttered ground**, and
   read as lanes at a glance with a continuous unobstructed path along them. Ground clutter —
   crates, barrels, nets, timber, carts, tools — tucks **tight against buildings, walls and
   fences, never in the middle of a lane, square or quay.** Fewer, larger, deliberate props. A
   tidy working port that is swept, not a junkyard. NPCs will stand in this town and need room.
4. **Building coherence.** Every building reads as ONE structure, one roof mass, one footprint.
   Never two roofs colliding into an ambiguous stacked shape.
5. **The shop and the healer**, both fronting the main square on opposite sides, both distinct
   from every ordinary house at a glance, neither entered:
   - **Shop** — ground floor open to the square under a **wide striped awning**, a **counter
     across the full opening**, goods on display (barrels, sacks, crates, wares hung under the
     awning). The ground directly in front of the counter stays completely clear — the player
     stands there.
   - **Healer** — a **herbalist's porch**: bundles of drying herbs under the eaves, a stone water
     basin, a low waiting bench, planted pots. Warm, domestic, clearly not the shop. Ground in
     front stays completely clear.
6. **Three exits, one per edge, and no fourth.** ONE trail reaching the north edge, ONE west, ONE
   east. The north margin is **open grassland/plains, not forest.** Border margin of surrounding
   terrain stays **2-3 cells** deep — no more, it eats the town.

---

## FIX 1 — Make it an actual working port. This is the headline.

v4's waterfront collapsed to two small jetties, a few crates and open water across the whole
bottom quarter. Roughly a fifth of the map is empty sea doing nothing. The town is called Port
Sapphire and does not currently read as a port at all.

Rebuild the southern third as a **working harbour with the density of v3's**:

- **A quay.** Continuous stone quay frontage along the harbour edge — a broad walkable stone
  wharf **3-4 cells deep** running most of the harbour's length, with mooring bollards, iron
  rings, and a low sea wall or stepped landing to the water. The quay is a walkable surface, so
  it stays open down its length; cargo goes against the building line, not across the middle.
- **A moored sailing ship.** One substantial single-masted coastal trader tied up alongside the
  quay or at the main jetty — furled or half-furled sail, rigging, deck detail, gangplank down to
  the quay. It should be the largest single object in the harbour and unmistakably a ship, not a
  boat. Scale it as a real vessel against the 65 px player.
- **Working jetties.** Three or four timber jetties of different lengths and angles running out
  into the water, plank decks, piling legs with waterline staining, small cranes or hoists on one
  or two of them.
- **Boats.** Six to ten small craft — rowboats, dinghies, a couple of fishing smacks — moored
  along the jetties and quay, some tied bow-in, some alongside, at varied angles. Not a row.
- **Stacked cargo.** Deliberate stacks against the quay-side buildings: crates, roped bales,
  barrels stacked two and three high, coils of rope, a handcart, timber piles.
- **Drying nets.** Nets hung on frames and racks along the quay and jetty ends, lobster/crab pots
  stacked, floats and buoys, fish-drying racks.
- **Harbour shape.** The water should read as a **sheltered bay** the town wraps around — a curved
  or hooked shoreline, not the near-straight coast v4 has. Optionally close it with a short stone
  breakwater or mole reaching out from one side. The open-water area shrinks substantially:
  water becomes the middle of a busy basin, not an empty band.
- **Buildings on the water.** The southern building line should include harbour-side structures
  that belong to a port — a net loft or warehouse with a wide door onto the quay, a chandler,
  a boathouse — rather than plain cottages backing onto the sea.

Keep the quay and jetty decks legible as walkable, per KEEP 3.

## FIX 2 — Loosen the street geometry. It is too neat.

v4's lanes form a near-symmetrical **cross** and the square is a **clean rectangle**. The
founding requirement was that the town look **organic** — grown over centuries, not planned.

- No straight ruled avenue crossing the whole map. Lanes **bend, kink, change width slightly
  along their run, and meet at irregular angles** — Y-junctions and offset T-junctions, not a
  four-way crossroads.
- The **square is an irregular open space**, wider at one end, edges set by the buildings that
  happen to front it — not a rectangle. The well sits off-centre.
- Buildings sit at **varied angles to the lanes**, some set back, some hard on the street line,
  with irregular gaps and yards between them. Break the current impression of buildings in rows.
- Add one or two **narrow side lanes or wynds** (2 cells) that lead somewhere — down to the quay,
  round the back of a garden — rather than a single hierarchy of identical streets.
- Still legible: irregular does **not** mean cluttered or maze-like. KEEP 3 is unchanged, and
  the three edge trails must still be obvious.

## FIX 3 — Colour: the land is blue-starved and reads yellow/olive

v4 crushed the blue channel across every land surface. Measured:

| surface | v4 RGB | v4 blue as % of red | wanted |
|---|---|---|---|
| cobbled square | (180, 167, 65) | **36 %** | 85-95 % |
| lane / dirt | (185, 176, 59) | **32 %** | 80-90 % |
| grass border | (116, 145, 10) | **8 %** | ~40 % |
| overworld anchor (correct) | (68, 78, 40) | **59 %** | — |

Paved stone, plaster, timber, thatch and dirt are all being rendered with almost no blue, which
turns the whole town yellow-olive. Stone should read as **warm grey stone** — around
(164, 160, 145) for lit cobble — not as sand. Keep the vegetation reading green, but it needs
some blue in it too. Do not fix this by darkening; keep the luminance in KEEP 2.

---

## Forbidden
- No people, animals, text, labels, numbers, lettered signage, UI, borders, frames.
- No grid, no rectangular blocks, no repeated identical buildings, **no straight ruled quay**.
- No blocking clutter in the middle of a lane, the square, or the quay.
- No building near the player's height.
- Do not overwrite `design/act1-towns/portSapphire-screen.png`.

## Return
Absolute path, exact dimensions, and one line each confirming: the harbour contents (quay, ship,
jetty count, boat count, cargo, nets), the street irregularity, the measured mean RGB and mean
luminance of your result (target luminance ~90), and that all six KEEP items survived.

If after 8 generation calls the harbour is still thin or the streets still read as a symmetrical
cross, STOP and report rather than shipping another rejected frame.
