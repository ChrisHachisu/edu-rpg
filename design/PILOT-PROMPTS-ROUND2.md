# Pilot Round 2 — paste-ready codex prompts (owner-driven)

Each block below is complete and self-contained — paste one into codex per monster. All 8 embed the corrected core features (chibi JRPG, kid-friendly-not-overboard) + anti-palette-bleed + explicit dominant hue.

**How to run (the working invocation):**
```
codex exec --dangerously-bypass-approvals-and-sandbox "<PASTE PROMPT HERE>" -i design/art-refs/monster-knight.png -i design/art-refs/monster-dragon.png
```
- The prompt MUST come before the `-i` flags (a `-i` before the prompt swallows it and codex exits with "No prompt provided").
- Attach 1–3 reference sprites AFTER the prompt. For low-menace monsters (bat, giantToad), consider referencing `public/assets/monsters/monster-wolf.png` / `monster-harpy.png` instead of the ornate keepers — or none at all.
- Outputs land in `~/.codex/generated_images/<uuid>/` as ~1254px green-screen PNGs. Hand them back to me (or just tell me the batch is done) and I'll run the transparency + 128px pipeline and build your review sheet.

**Shared trailer (already included in every block below):** green screen for chroma-key, centered subject, no text/UI/ground shadow.

---

## 1. bat (Menace Tier 1 — harmless critter)

```
Pixel-art JRPG monster sprite in the SNES Dragon Quest tradition (DQ3/DQ5/DQ6). CHIBI PROPORTIONS: big head, compact rounded body, short limbs, roughly 2-3 heads tall. Character-first JRPG monster design, kid-friendly but not babyish. Detailed 16-bit-style pixel art, bold dark outlines on all major forms, cel-shaded with clear highlight and shadow bands (no smooth gradients), chunky readable pixels.
MENACE TIER 1: round soft silhouette, big curious eyes, grumpy-cute expression, NO spikes, NO glowing aura, minimal ornament — reads as a harmless wild critter.
SUBJECT: a small round cave bat hovering, oversized ears, tiny fangs, stubby wings. DOMINANT PALETTE: warm brown fur with dusty-rose wing membranes. Do NOT adopt any attached reference image's color scheme — take only its rendering technique.
Output: a single CENTERED monster on a flat solid #00ff00 green background, square 1024x1024, small even margin on all edges, clean silhouette with a solid dark outline that reads at 128x128. No text, no UI, no ground shadow.
```

## 2. giantToad (Menace Tier 2 — wilder, mild threat)

```
Pixel-art JRPG monster sprite in the SNES Dragon Quest tradition (DQ3/DQ5/DQ6). CHIBI PROPORTIONS: big head, compact rounded body, short limbs, roughly 2-3 heads tall. Character-first JRPG monster design, kid-friendly but not babyish. Detailed 16-bit-style pixel art, bold dark outlines, cel-shaded with clear highlight and shadow bands, chunky readable pixels.
MENACE TIER 2: alert aggressive expression, visible small teeth or natural weapons, natural armor allowed, at most a faint elemental accent — wilder than tier 1 but still an animal, not evil.
SUBJECT: a huge warty toad, throat sac inflated, tongue coiled, hungry stare. DOMINANT PALETTE: classic toad green body with a yellow-cream belly. Do NOT adopt any attached reference image's color scheme — take only its rendering technique.
Output: a single CENTERED monster on a flat solid #00ff00 green background, square 1024x1024, small even margin on all edges, clean silhouette with a solid dark outline that reads at 128x128. No text, no UI, no ground shadow.
```

## 3. golem (Menace Tier 2 — wilder, mild threat)

```
Pixel-art JRPG monster sprite in the SNES Dragon Quest tradition (DQ3/DQ5/DQ6). CHIBI PROPORTIONS: big head, compact rounded body, short limbs, roughly 2-3 heads tall. Character-first JRPG monster design, kid-friendly but not babyish. Detailed 16-bit-style pixel art, bold dark outlines, cel-shaded with clear highlight and shadow bands, chunky readable pixels.
MENACE TIER 2: sturdy imposing-but-simple silhouette, stern expression, NO crystals, NO ornate armor, at most a faint warm core glow — an ancient rough construct, not a jeweled titan.
SUBJECT: a classic rough stone golem with heavy fists, moss tufts in the cracks between plain grey boulders. DOMINANT PALETTE: warm grey stone with moss-green accents. Do NOT adopt any attached reference image's color scheme — take only its rendering technique.
Output: a single CENTERED monster on a flat solid #00ff00 green background, square 1024x1024, small even margin on all edges, clean silhouette with a solid dark outline that reads at 128x128. No text, no UI, no ground shadow.
```

## 4. kraken (Menace Tier 2 — wilder, mild threat)

```
Pixel-art JRPG monster sprite in the SNES Dragon Quest tradition (DQ3/DQ5/DQ6). CHIBI PROPORTIONS: big head, compact rounded body, short limbs/tentacles, roughly 2-3 heads tall. Character-first JRPG monster design, kid-friendly but not babyish. Detailed 16-bit-style pixel art, bold dark outlines, cel-shaded with clear highlight and shadow bands, chunky readable pixels.
MENACE TIER 2: alert aggressive expression, coiling motion, natural sea armor allowed, faint bioluminescent accent — a wild sea beast, not an eldritch horror.
SUBJECT: a chibi sea kraken with a big glaring eye and short coiling tentacles, suckers visible. DOMINANT PALETTE: deep sea teal body with coral-red sucker accents. Do NOT adopt any attached reference image's color scheme — take only its rendering technique.
Output: a single CENTERED monster on a flat solid #00ff00 green background, square 1024x1024, small even margin on all edges, clean silhouette with a solid dark outline that reads at 128x128. No text, no UI, no ground shadow.
```

## 5. frostStalker (Menace Tier 3 — serious hunter · REDO: must not be a wolf recolor)

```
Pixel-art JRPG monster sprite in the SNES Dragon Quest tradition (DQ3/DQ5/DQ6). CHIBI PROPORTIONS: big head, compact rounded body, short limbs, roughly 2-3 heads tall. Character-first JRPG monster design, kid-friendly but not babyish. Detailed 16-bit-style pixel art, bold dark outlines, cel-shaded with clear highlight and shadow bands, chunky readable pixels.
MENACE TIER 3: predatory hunter's stare, ice spikes and frost plates allowed, ONE clear glowing power element (glowing eyes or frost breath) — a serious threat, but still chibi-proportioned.
SUBJECT: a predatory frost LYNX (feline, NOT a wolf) in a low stalking pose, ice-shard mane, tufted ears, long frost whiskers. DOMINANT PALETTE: frost white and pale ice-blue with a cold cyan eye glow. Do NOT adopt any attached reference image's color scheme — take only its rendering technique.
Output: a single CENTERED monster on a flat solid #00ff00 green background, square 1024x1024, small even margin on all edges, clean silhouette with a solid dark outline that reads at 128x128. No text, no UI, no ground shadow.
```

## 6. frostWolf (Menace Tier 3 — serious hunter · REDO: silhouette must escalate beyond tier-1 wolf)

```
Pixel-art JRPG monster sprite in the SNES Dragon Quest tradition (DQ3/DQ5/DQ6). CHIBI PROPORTIONS: big head, compact rounded body, short limbs, roughly 2-3 heads tall. Character-first JRPG monster design, kid-friendly but not babyish. Detailed 16-bit-style pixel art, bold dark outlines, cel-shaded with clear highlight and shadow bands, chunky readable pixels.
MENACE TIER 3: predatory alpha presence, frozen armor plates and an ice-spike ruff that clearly change the silhouette versus an ordinary wolf, ONE glowing power element (icy breath or glowing eyes) — serious threat, still chibi.
SUBJECT: an armored ice-wolf alpha, glacial plates along the back, frozen spike ruff around the neck, standing dominant. DOMINANT PALETTE: glacial blue-white with steel-blue armor tones. Do NOT adopt any attached reference image's color scheme — take only its rendering technique.
Output: a single CENTERED monster on a flat solid #00ff00 green background, square 1024x1024, small even margin on all edges, clean silhouette with a solid dark outline that reads at 128x128. No text, no UI, no ground shadow.
```

## 7. stormHarpy (Menace Tier 3 — serious hunter · REWORK: clearly distinct from base harpy)

```
Pixel-art JRPG monster sprite in the SNES Dragon Quest tradition (DQ3/DQ5/DQ6). CHIBI PROPORTIONS: big head, compact rounded body, short limbs, roughly 2-3 heads tall. Character-first JRPG monster design, kid-friendly but not babyish. Detailed 16-bit-style pixel art, bold dark outlines, cel-shaded with clear highlight and shadow bands, chunky readable pixels.
MENACE TIER 3: fierce storm-hunter expression, wind-torn feathers, ONE glowing power element (lightning crackle on the wingtips) — serious threat, still chibi.
SUBJECT: a storm-born harpy with thundercloud-grey plumage and lightning-charged wingtips, in a NEW pose clearly different from a standing pink harpy: mid-dive with wings swept back. DOMINANT PALETTE: slate storm-grey feathers with electric yellow lightning accents. Do NOT adopt any attached reference image's color scheme — take only its rendering technique.
Output: a single CENTERED monster on a flat solid #00ff00 green background, square 1024x1024, small even margin on all edges, clean silhouette with a solid dark outline that reads at 128x128. No text, no UI, no ground shadow.
```

## 8. darkKnight (Menace Tier 4 — boss-grade dread, kid-appropriate)

```
Pixel-art JRPG monster sprite in the SNES Dragon Quest tradition (DQ3/DQ5/DQ6). CHIBI PROPORTIONS: big head, compact rounded body, short limbs, roughly 2-3 heads tall. Character-first JRPG monster design, kid-friendly but not babyish. Detailed 16-bit-style pixel art, bold dark outlines, cel-shaded with clear highlight and shadow bands, chunky readable pixels.
MENACE TIER 4: malevolent regal presence — horned helm, ornate dark armor, tattered cape, dramatic rim light and a restrained dark aura; boss-grade dread through expression and ornament ONLY, proportions stay chibi, never gory.
SUBJECT: a black-armored dark knight gripping a jagged greatsword, glowing ember eyes inside the visor. DOMINANT PALETTE: near-black armor with blood-red cape accents and ember-orange eye glow. Do NOT adopt any attached reference image's color scheme — take only its rendering technique.
Output: a single CENTERED monster on a flat solid #00ff00 green background, square 1024x1024, small even margin on all edges, clean silhouette with a solid dark outline that reads at 128x128. No text, no UI, no ground shadow.
```
