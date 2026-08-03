# Task: Port Sapphire OVERWORLD landmark sprite, v3 — match the town screen, and DO NOT PAINT WATER

Repo: /Users/christopherhachisu/Documents/claudecode/edu-rpg-map-engine-semantic-data

The town screen for Port Sapphire is finished and owner-approved. The overworld landmark sprite
that represents this town no longer matches it, and that mismatch is the whole task.

## Output
`design/continent-terrain-class-method/owner-terrain/landmark-sprites/port-sapphire-v3-raw.png`
**1254 x 1254, RGB**, drawn on a **pure magenta `255,0,255`** field.

The magenta is load-bearing: `scripts/key_landmark_sprite.py` chroma-keys it to RGBA and
resamples to the shipping 192x192. So **no magenta anywhere in the artwork itself** — not in a
roof, a flower, a sail, a shadow. Nothing else may be pure magenta.

Do not overwrite `port-sapphire.png`, `port-sapphire-raw.png`, or the v2 files.

## References, and what to take from each

| file | take |
|---|---|
| `design/act1-towns/portSapphire-screen-v5-graded.png` | **IDENTITY AND PALETTE.** This is the town. |
| `design/continent-terrain-class-method/owner-terrain/landmark-sprites/port-sapphire.png` | **FORMAT ONLY** — footprint shape, camera angle, how much of the frame is filled, how the base meets the ground. Its content is what we are replacing. |


## THE ONE THING v2 GOT WRONG — read this before anything else

The previous attempt (`port-sapphire-v2-raw.png`) painted a **disc of blue sea into the sprite**.
Composited onto the real overworld it reads as a puddle floating on grass, disconnected from the
actual bay a few cells further south.

**The sprite must contain NO PAINTED WATER AT ALL.** `design/LANDMARK-SPRITE-CONTRACT.md` splits
the layers and this is exactly what it splits: the **terrain artwork owns the SITE** — ground,
shore, and the sea itself — and the **sprite owns only the STRUCTURE**. The map already draws
the bay underneath this sprite. Any water you paint is a second, wrong copy of it.

So, concretely, for everything at and below the waterline:

- **The quay wall is the sprite's southern edge.** Stone quay, mooring posts, bollards, steps
  down — all structure, all opaque.
- **Jetties, the moored trader, and the small boats are still there and still required.** Draw
  them as structures floating on the **magenta field**, with magenta between the jetty planks,
  around every hull, and around the pilings. The real sea shows through that magenta once it is
  keyed, which is what makes the harbour sit in the actual bay instead of in a painted one.
- **No blue, no foam, no wave texture, no shore gradient, no wet-sand band** anywhere in the
  sprite. If you are tempted to paint water to make the boats look supported, do not — the
  terrain supplies it.
- Cast shadows from hulls and jetties onto magenta are also forbidden; they key out as dirty
  fringes.

Everything else below is unchanged from v2, which was otherwise good: the fence removal, the
roof mix and the brightness all landed and must be kept.

## WHAT IS WRONG WITH THE ORIGINAL SPRITE — fix all four

1. **It has a continuous timber palisade around the whole town. Remove it.**
   Owner, 2026-08-01: the town has no fence and that is correct. No palisade, no perimeter wall,
   no gate. The town is open to the grass. Low garden fences and hedges around individual
   cottages are fine and match the town screen — a *perimeter* is not.
2. **Every roof is blue slate. The town is mixed.** Roughly half terracotta/orange tile, half
   blue-grey slate, plus one or two wood-shingle. Match the mix in the town screen.
3. **It is far too dark and desaturated.** The settled overworld is bright. Match the town
   screen's daylight: pale warm-grey stone paving, bright green grass, one upper-left light
   source with short light shadows.
   > STYLE-BLOCK OVERRIDE, owner-directed. `design/ART-DIRECTION.md`'s environment style block
   > says "dark, dense, realistic old-growth ... deep forest shadows". That language is STALE and
   > has pulled multiple passes far too dark. Embed its MATERIAL and COMPOSITION guidance; ignore
   > its tone language. Measured targets instead: the town screen is mean RGB (89, 94, 59) at
   > luminance **90**; its stone paving sits at blue/red **0.74**, its grass is a bright green.
4. **The harbour is an afterthought.** It is a PORT and must read as one at 192px.

## WHAT THE SPRITE MUST SHOW

Same camera and framing as the current sprite: 3/4 top-down, an oval town footprint sitting on
its own ground, filling roughly the same share of the frame, with the same soft contact where
the base meets terrain. Everything below is content, not framing.

- **Eight to ten buildings**, mixed terracotta and slate roofs, at varied angles — not in rows.
- **The harbour along the lower edge**: a curved pale stone quay, **one moored single-masted
  sailing trader** with furled sail (the single most recognisable element — make it read),
  two or three timber jetties, four or five small boats, a few cargo stacks.
- **The shop's blue-and-cream striped awning** somewhere in the upper cluster. It is the one
  colour accent that ties the sprite to the town screen at a glance.
- **A small open square with a well** near the middle.
- **Pale stone lanes** between the buildings, irregular, meeting at offset junctions.
- The land edge away from the water is **open grass** — trodden approach paths may run to the
  sprite edge, but nothing encloses the town.

## Forbidden
- **No painted water of any kind.** No blue, no foam, no waves, no shore gradient.
- No perimeter fence, palisade, wall or gate of any kind.
- No people, animals, text, labels, numbers, lettered signage, UI, borders, frames.
- No pure magenta in the artwork.
- No all-slate roofscape. No dusk, no deep shadow, no desaturated grey-brown cast.

## Return
Absolute path, exact dimensions, confirmation the background is pure magenta and the artwork
contains none, and one line each on: fence removed, roof mix, measured mean RGB / luminance of
the non-magenta pixels (target luminance ~90), the harbour contents, and an explicit confirmation that the image contains NO painted water and that the area around every hull, piling and jetty plank is pure magenta.
