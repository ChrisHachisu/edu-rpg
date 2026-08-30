# Open items after build 69

(Started as the five left over from build 67; the owner has since added three more.)

Build 68 carries three of the owner's eight: controls hiding for the parent's text box,
arrival at the town gate, and the Greenhollow heal fee. These five are open. Each entry
below is what was MEASURED, not a guess, so the next session starts from evidence.

---

## 2 + 3. Town and dungeon boundaries — ONE job, not two

> "the boundaries in the town are slightly off in some locations (top side of houses, edges
> of the town, fenses, etc.) ... i'd say 90% are fine"
> "same issue in the dungeons. the top side of the walls look like they have an invisible
> barrier but the north side need to be touchable"

**These are the same defect on two surfaces, and the dungeon half is diagnosed.**

Measured on the dungeon floors: of the floor cells lying directly SOUTH of rock, 95-100%
are standable at their own centre (sunkenCellar 40/42, mistyGrotto 98/100,
whisperingWoodsCave 78/78). So the mask is NOT inflated by a whole cell, and a cell-level
re-derive would change almost nothing.

The gap is SUB-CELL, and it is structural. `render_dungeon_material_map.py` derives the walk
mask from the floor's `rows` — a LATTICE, which knows only floor-vs-rock per cell — so the
mask's wall boundary is exactly the cell edge. The ART is drawn in three-quarter view, so a
wall's top face is painted ABOVE its own cell and the painted floor continues north past the
lattice line. She therefore stops at an edge the picture does not show: the invisible
barrier, and precisely "the north side needs to be touchable".

The towns have the same shape of problem from the other direction — their geometry IS fitted
to the painting (`act1-art-fit-polygon-authority-v2`), and the owner's list (tops of houses,
town edges, fences) is exactly where a painted overhang and a fitted polygon disagree.

**Do not attempt this as a tuning pass.** The honest fix is to derive the north-facing
boundary from the ART rather than the lattice, per surface, with a before/after render of
every changed edge. Note the standing rule from `bake_dungeon_arch.py`'s header: a rule read
off the baked plate cannot tell arch from rock by luminance, and three separate attempts to
do so shipped broken. Whatever is built here needs the same "measured invariant + refuses to
write" discipline `check_town_exits.py` and `check_dungeon_entries.py` now have.

## 4. The boss is baked into the plate

> "you did not replace the boss sprite with something that can be removed completely when the
> boss is defeated ... the shadow does not remain even after defeating it"

Not started. The boss marker is drawn from the floor's `assets` (`kind: "boss"`, tile 7) AND
its picture is part of `<floor>-props.png`, which is why defeating it leaves a shadow — the
baked pixels cannot be removed. `a1dBossVanish` already exists as the pattern for "the baked
picture cannot show this state on its own" (see dq-tiles.js), and the entrance crystal is a
worked example of a live sprite standing in for baked art. The fix is the same shape: repaint
the boss OUT of the props plate and draw it as a live sprite that can be destroyed. That is an
art regeneration plus a bake change, and it needs the plate's provenance re-stamped.

## 5. "New" badge on equipment

> green dot on the bottom tab, "New" on unseen equipment, seeing it clears it

Not started, and it is the most self-contained of the five: it lives in `public/ui-overhaul.js`
(the DOM overlay owns the tabs and the equip screen) plus a small persisted set of "seen"
item ids. The owner points at ChalkMap's implementation as the reference. Nothing in the
frozen bundle needs to change.

## 6. Menu -> dungeon transition "snaps from above"

Investigated; **two likely causes ruled out**, so do not re-check these:

* NOT the camera. Sampled across a menu open and close in sunkenCellar, `scrollX/scrollY`
  never move: 576/768 before, during and for 720 ms after the resume, with the hero static.
* NOT an obvious overlay animation. `ui-overhaul.css` has no transform/opacity transition on
  the screen container; the keyframes there are damage numbers, HUD swaps and flashes.

Next places to look: the shipped MenuScene's own teardown (it renders on the Phaser canvas
and `scene.stop()` may reveal a frame before dq-tiles' next tick redraws), and `ensureDng`,
which destroys and recreates the dungeon base image if `dngState.image.scene` has gone —
recreated at (0,0) with origin (0,0) and only moved into place by the following `updateDng`.
A one-frame gap between those two is exactly "snaps from above". Instrument
`dngState.image.y` across the resume rather than reasoning about it.

---

## Ground rules that held all session and should keep holding

* **Measure the ambiguous thing before fixing it.** "the tap out does not work" had two
  readings and 30 seconds of driving the game settled it. The dungeon-entry facing bug was
  invisible to any test that entered by walking, because walking supplies the right answer.
* **Assert on what the UI shows.** Fixing the string cache did nothing; the box renders a
  different reply path.
* **Grep the shipped artefact, not the source.** Two i18n keys exist in `src/i18n/locales`
  and not in the frozen bundle.


---

# Added after build 68 — three more, none started

## A. Shop screen: scrolling, sticky tabs, and a real purchase flow

> "the shop screen snaps back top when scrolling down but it shouldnt. also, the buy, sell, leave
> buttons should be sticky when scrolling. buying an item also needs to make a confirmation button
> popup (option to buy or cancel and the price). the quantity needs to be selected for expendable
> items (not equipment) and total cost also need to be displayed (needs a blocker for exceeding
> current wallet amount). use the impeccable skill to design this."

All of it lives in `renderShop()` in `public/ui-overhaul.js` — the DOM overlay owns this screen, so
nothing in the frozen bundle has to change. Four separate pieces:

* **Scroll snap-back.** The overlay re-renders on a signature (`var sig = 'shop|' + ...`); when the
  signature changes the list is rebuilt and scrollTop is lost. Preserve and restore scrollTop across
  a re-render, or make the render diff rather than replace.
* **Sticky Buy / Sell / Leave.** They are `.seg` inside `.body > .zc`; making that bar sticky is CSS.
* **Confirmation popup with price.** The healer already has exactly this shape — `showHealerOverlay`
  + `routeHealer` + `confirmHealerOption`, rendered by `renderHealer()`. Copy that pattern rather
  than inventing a second modal idiom.
* **Quantity for consumables only, with a wallet blocker.** "Expendable" = the item's `type` is not
  one of `weapon/armor/shield/helmet/accessory` (that list is already in `renderShop` as `EQ`).
  Total = unit x qty; cap the stepper at `floor(gold / price)` so the blocker is structural rather
  than an error message.

The owner asked for a named skill to design it ("the impeccable skill"). No skill by that name is
installed — ASK HIM which he means before designing; the plausible candidates here are
`game-design` (game UI/feel) and `frontend-design`.

## B. Healer placement in every town

> "the healer needs to be placed in the healer's shop or in front of the healers shop in every town
> (millbrook, but most likely the healers are placed in random locations in other towns)"

Greenhollow's healer was moved into the herb shop on 2026-08-29. millbrook and portSapphire were
never re-checked; their `healer` entries in `<town>-town.json` are wherever the original pass put
them. Same method as greenhollow: find the healer's building on the plate, measure the floor, put
her on it, and confirm the south approach band with `check_town_talkable.py`. Note the herb-shop
lesson — measure the ART for the overlap, do not trust a number written in prose.

## C. Blue screen, with a definitive checker

> "blue screen bug still happens. there needs to be a definitive checker that does not allow this,
> even if the loading spinner is shown for longer"

`a1aSpriteWatchdog` in `dq-tiles.js` already exists for this and is described in its own comment as
"what stops the blue screen being permanent" — so the current design DETECTS and RECOVERS rather
than PREVENTS, which is exactly what the owner is rejecting. He is explicitly willing to trade a
longer spinner for never showing the blue frame. That means a readiness GATE before the first
render: do not reveal the map until the plate/chunks/mask the frame needs have actually landed.
Find every path that can present a frame before its art is ready, and hold the spinner across all
of them.
