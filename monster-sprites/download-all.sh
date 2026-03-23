#!/bin/bash
# Download all 52 JRPG monster sprites from pollinations.ai
# Re-run this script whenever the API is available — it skips already-downloaded images.
# Usage: bash download-all.sh
#
# Free tier: 1 concurrent request max. Script waits 10s between each download.
# Each image generation takes 10-80s server-side.

DIR="$(cd "$(dirname "$0")" && pwd)"

# Test API availability first
echo "Testing API availability..."
TEST_RESP=$(curl --max-time 120 -L -s -w "\n%{http_code}" -o /tmp/poll-test.png "https://image.pollinations.ai/prompt/test%20cat?width=64&height=64&nologo=true&nofeed=true")
TEST_CODE=$(echo "$TEST_RESP" | tail -1)
TEST_TYPE=$(file -b /tmp/poll-test.png 2>/dev/null)

if ! echo "$TEST_TYPE" | grep -qi "image\|PNG\|JPEG"; then
  echo "ERROR: API not available (HTTP $TEST_CODE, got: $TEST_TYPE)"
  echo "The pollinations.ai service may be down. Try again later."
  rm -f /tmp/poll-test.png
  exit 1
fi
rm -f /tmp/poll-test.png
echo "API is working. Starting downloads..."
echo ""

# Monster definitions: id|index (1-based)
# Style tiers:
#   ADORABLE (Tier 1-2, Boss 1): adorable, pudgy round chibi, cartoonish, colorful vibrant
#   SPIRITED (Tier 3-4, mid bosses): charming, spirited, friendly but tough, colorful vibrant
#   FIERCE (Tier 5-6, late bosses, V3, legendaries, final): cute but fierce, round friendly proportions, colorful vibrant
MONSTERS=(
  # Tier 1 - Greenhollow Plains (ADORABLE)
  "slime|1|pixel art JRPG monster sprite, green translucent slime blob creature with cute angry eyes, gelatinous body, adorable, pudgy round chibi, cartoonish, colorful vibrant, 16-bit retro RPG style, Dragon Quest Akira Toriyama inspired, front-facing battle pose, black background, detailed pixel art, game sprite"
  "bug|2|pixel art JRPG monster sprite, round brown beetle insect with tiny pincers, shiny shell, adorable, pudgy round chibi, cartoonish, colorful vibrant, 16-bit retro RPG style, Dragon Quest Akira Toriyama inspired, front-facing battle pose, black background, detailed pixel art, game sprite"
  "rabbit|3|pixel art JRPG monster sprite, chubby horned rabbit with red eyes, fluffy bunny with small fangs, adorable, pudgy round chibi, cartoonish, colorful vibrant, 16-bit retro RPG style, Dragon Quest Akira Toriyama inspired, front-facing battle pose, black background, detailed pixel art, game sprite"
  # Tier 1.5 - Whispering Woods (ADORABLE)
  "wolf|4|pixel art JRPG monster sprite, grey wolf pup with fangs, fluffy wild forest wolf, adorable, pudgy round chibi, cartoonish, colorful vibrant, 16-bit retro RPG style, Dragon Quest Akira Toriyama inspired, front-facing battle pose, black background, detailed pixel art, game sprite"
  "mushroom|5|pixel art JRPG monster sprite, purple mushroom creature with grumpy face on cap, stubby walking mushroom, adorable, pudgy round chibi, cartoonish, colorful vibrant, 16-bit retro RPG style, Dragon Quest Akira Toriyama inspired, front-facing battle pose, black background, detailed pixel art, game sprite"
  "bandit|6|pixel art JRPG monster sprite, small bandit thief with dagger and mask, brown leather armor, adorable, pudgy round chibi, cartoonish, colorful vibrant, 16-bit retro RPG style, Dragon Quest Akira Toriyama inspired, front-facing battle pose, black background, detailed pixel art, game sprite"
  "bat|7|pixel art JRPG monster sprite, purple bat with spread wings and big round eyes, small flying bat, adorable, pudgy round chibi, cartoonish, colorful vibrant, 16-bit retro RPG style, Dragon Quest Akira Toriyama inspired, front-facing battle pose, black background, detailed pixel art, game sprite"
  # Tier 2 - Crystal Coast (ADORABLE)
  "spider|8|pixel art JRPG monster sprite, round colorful spider with big cartoon eyes, stubby legs, adorable, pudgy round chibi, cartoonish, colorful vibrant, 16-bit retro RPG style, Dragon Quest Akira Toriyama inspired, front-facing battle pose, black background, detailed pixel art, game sprite"
  "crab|9|pixel art JRPG monster sprite, red crab with pincers raised, round armored shell, adorable, pudgy round chibi, cartoonish, colorful vibrant, 16-bit retro RPG style, Dragon Quest Akira Toriyama inspired, front-facing battle pose, black background, detailed pixel art, game sprite"
  "golem|10|pixel art JRPG monster sprite, small stone golem with glowing eyes, chunky rocky body, adorable, pudgy round chibi, cartoonish, colorful vibrant, 16-bit retro RPG style, Dragon Quest Akira Toriyama inspired, front-facing battle pose, black background, detailed pixel art, game sprite"
  # Boss 1 - Misty Grotto (ADORABLE-CUTE)
  "giant-toad|11|pixel art JRPG boss monster sprite, big green toad with warty skin and wide mouth, bulging eyes, adorable, pudgy round chibi, cartoonish, colorful vibrant, 16-bit retro RPG style, Dragon Quest Akira Toriyama inspired, front-facing battle pose, black background, detailed pixel art, game sprite"
  # Boss 2 - Crystal Cave (SPIRITED)
  "serpent|12|pixel art JRPG boss monster sprite, blue sea serpent with shimmering scales, coiled body, charming, spirited, friendly but tough, colorful vibrant, 16-bit retro RPG style, Dragon Quest Akira Toriyama inspired, front-facing battle pose, black background, detailed pixel art, game sprite"
  # Tier 3 - Coral Tunnels (SPIRITED)
  "jellyfish|13|pixel art JRPG monster sprite, purple glowing jellyfish with trailing tentacles, bioluminescent, charming, spirited, friendly but tough, colorful vibrant, 16-bit retro RPG style, Dragon Quest Akira Toriyama inspired, front-facing battle pose, black background, detailed pixel art, game sprite"
  "piranha|14|pixel art JRPG monster sprite, blue piranha fish with sharp teeth and fins, charming, spirited, friendly but tough, colorful vibrant, 16-bit retro RPG style, Dragon Quest Akira Toriyama inspired, front-facing battle pose, black background, detailed pixel art, game sprite"
  "merfolk|15|pixel art JRPG monster sprite, teal fish-person warrior holding a trident, scales and fins, charming, spirited, friendly but tough, colorful vibrant, 16-bit retro RPG style, Dragon Quest Akira Toriyama inspired, front-facing battle pose, black background, detailed pixel art, game sprite"
  # Tier 3.5 - Iron Mountains (SPIRITED)
  "harpy|16|pixel art JRPG monster sprite, pink and purple bird-woman with feathered wings and talons, charming, spirited, friendly but tough, colorful vibrant, 16-bit retro RPG style, Dragon Quest Akira Toriyama inspired, front-facing battle pose, black background, detailed pixel art, game sprite"
  "wyvern|17|pixel art JRPG monster sprite, green wyvern with spread wings and barbed tail, charming, spirited, friendly but tough, colorful vibrant, 16-bit retro RPG style, Dragon Quest Akira Toriyama inspired, front-facing battle pose, black background, detailed pixel art, game sprite"
  # Boss 3 - Coral Tunnels (SPIRITED)
  "kraken|18|pixel art JRPG boss monster sprite, purple kraken with writhing tentacles and glowing eyes, charming, spirited, friendly but tough, colorful vibrant, 16-bit retro RPG style, Dragon Quest Akira Toriyama inspired, front-facing battle pose, black background, detailed pixel art, game sprite"
  # Boss 3.5 - Storm Nest (SPIRITED)
  # storm-harpy — SKIP: recolor of harpy (pink → purple/lightning)
  # Boss 4 - Shadow Cave (FIERCE)
  "dragon|20|pixel art JRPG boss monster sprite, red dragon breathing fire with spread wings, horns and scales, cute but fierce, round friendly proportions, colorful vibrant, 16-bit retro RPG style, Dragon Quest Akira Toriyama inspired, front-facing battle pose, black background, detailed pixel art, game sprite"
  # Tier 4 - Frostpeak (SPIRITED)
  "blizzard-bear|21|pixel art JRPG monster sprite, white ice bear with frost crystals on fur, icy breath, charming, spirited, friendly but tough, colorful vibrant, 16-bit retro RPG style, Dragon Quest Akira Toriyama inspired, front-facing battle pose, black background, detailed pixel art, game sprite"
  "ice-sprite|22|pixel art JRPG monster sprite, light blue ice fairy with crystalline wings, glowing frost magic, charming, spirited, friendly but tough, colorful vibrant, 16-bit retro RPG style, Dragon Quest Akira Toriyama inspired, front-facing battle pose, black background, detailed pixel art, game sprite"
  "dark-sorcerer|23|pixel art JRPG monster sprite, blue mage sorcerer with staff and robes, glowing purple magic, charming, spirited, friendly but tough, colorful vibrant, 16-bit retro RPG style, Dragon Quest Akira Toriyama inspired, front-facing battle pose, black background, detailed pixel art, game sprite"
  # Boss 5 - Frostpeak Cavern (FIERCE)
  # ice-wyrm — SKIP: recolor of dragon (red → ice blue)
  # Tier 5 - Scorched Wastes (FIERCE)
  "lizard|25|pixel art JRPG monster sprite, orange fire lizard with flames on its back, scaled reptile, cute but fierce, round friendly proportions, colorful vibrant, 16-bit retro RPG style, Dragon Quest Akira Toriyama inspired, front-facing battle pose, black background, detailed pixel art, game sprite"
  "knight|26|pixel art JRPG monster sprite, armored knight with plate armor and great sword, closed visor, cute but fierce, round friendly proportions, colorful vibrant, 16-bit retro RPG style, Dragon Quest Akira Toriyama inspired, front-facing battle pose, black background, detailed pixel art, game sprite"
  "skeleton|27|pixel art JRPG monster sprite, bone white skeleton warrior with sword and shield, cute but fierce, round friendly proportions, colorful vibrant, 16-bit retro RPG style, Dragon Quest Akira Toriyama inspired, front-facing battle pose, black background, detailed pixel art, game sprite"
  "wraith|28|pixel art JRPG monster sprite, purple ghostly wraith floating with tattered robes, glowing eyes, cute but fierce, round friendly proportions, colorful vibrant, 16-bit retro RPG style, Dragon Quest Akira Toriyama inspired, front-facing battle pose, black background, detailed pixel art, game sprite"
  "fire-elemental|29|pixel art JRPG monster sprite, orange and red fire elemental made of living flame, blazing body, cute but fierce, round friendly proportions, colorful vibrant, 16-bit retro RPG style, Dragon Quest Akira Toriyama inspired, front-facing battle pose, black background, detailed pixel art, game sprite"
  # Tier 6 - Volcanic / Demon Threshold (FIERCE)
  # lava-golem — SKIP: recolor of golem (stone → red/molten)
  "chimera|34|pixel art JRPG monster sprite, brown chimera with lion head goat head and snake tail, cute but fierce, round friendly proportions, colorful vibrant, 16-bit retro RPG style, Dragon Quest Akira Toriyama inspired, front-facing battle pose, black background, detailed pixel art, game sprite"
  "demon|35|pixel art JRPG monster sprite, red demon with horns bat wings and clawed hands, cute but fierce, round friendly proportions, colorful vibrant, 16-bit retro RPG style, Dragon Quest Akira Toriyama inspired, front-facing battle pose, black background, detailed pixel art, game sprite"
  "shadow|36|pixel art JRPG monster sprite, purple shadow creature made of living darkness, glowing purple eyes, cute but fierce, round friendly proportions, colorful vibrant, 16-bit retro RPG style, Dragon Quest Akira Toriyama inspired, front-facing battle pose, black background, detailed pixel art, game sprite"
  # Boss 6 - Sunken Ruins (FIERCE)
  "lich|31|pixel art JRPG boss monster sprite, green undead lich wizard with skull face and necromantic staff, robes with green glow, cute but fierce, round friendly proportions, colorful vibrant, 16-bit retro RPG style, Dragon Quest Akira Toriyama inspired, front-facing battle pose, black background, detailed pixel art, game sprite"
  # Boss 7 - Volcanic Forge (FIERCE)
  "flame-titan|32|pixel art JRPG boss monster sprite, orange and red fire giant wreathed in flames, burning colossus, cute but fierce, round friendly proportions, colorful vibrant, 16-bit retro RPG style, Dragon Quest Akira Toriyama inspired, front-facing battle pose, black background, detailed pixel art, game sprite"
  # Boss 8 - Magma Tunnels (FIERCE)
  # lava-wyrm — SKIP: recolor of dragon (red → orange/molten)
  # V2 Bosses (FIERCE)
  # giant-crab — SKIP: recolor/scale of crab
  # sand-golem — SKIP: recolor of golem (stone → sandy tan)
  "bandit-lord|44|pixel art JRPG boss monster sprite, armored bandit chief with ornate armor and dual swords, cute but fierce, round friendly proportions, colorful vibrant, 16-bit retro RPG style, Dragon Quest Akira Toriyama inspired, front-facing battle pose, black background, detailed pixel art, game sprite"
  # V2 Regular Monsters (mixed tiers)
  "sea-star|45|pixel art JRPG monster sprite, colorful starfish creature with stubby arms, charming, spirited, friendly but tough, colorful vibrant, 16-bit retro RPG style, Dragon Quest Akira Toriyama inspired, front-facing battle pose, black background, detailed pixel art, game sprite"
  # frost-wolf — SKIP: recolor of wolf (grey → ice blue)
  # frozen-skeleton — SKIP: recolor of skeleton (white → ice blue)
  # sand-wraith — SKIP: recolor of wraith (purple → sandy tan)
  "mummy|49|pixel art JRPG monster sprite, ancient mummy wrapped in bandages with glowing eyes, cute but fierce, round friendly proportions, colorful vibrant, 16-bit retro RPG style, Dragon Quest Akira Toriyama inspired, front-facing battle pose, black background, detailed pixel art, game sprite"
  # bandit-archer — SKIP: recolor of bandit
  # magma-slime — SKIP: recolor of slime (green → red)
  # flame-bat — SKIP: recolor of bat (purple → orange)
  # V3 Portal Land Monsters - Stormreach (FIERCE)
  "storm-raptor|53|pixel art JRPG monster sprite, blue and white storm bird raptor with lightning-charged feathers, cute but fierce, round friendly proportions, colorful vibrant, 16-bit retro RPG style, Dragon Quest Akira Toriyama inspired, front-facing battle pose, black background, detailed pixel art, game sprite"
  # cloud-wraith — SKIP: recolor of wraith (purple → grey/blue)
  # V3 Portal Land Monsters - Frostfall (FIERCE)
  # frost-stalker — SKIP: recolor of wolf (grey → ice blue)
  # glacial-golem — SKIP: recolor of golem (stone → ice crystal)
  # V3 Portal Land Monsters - Sunken Temple (FIERCE)
  "temple-guard|57|pixel art JRPG monster sprite, bronze and gold temple guardian statue come to life, ornate armor with runes, cute but fierce, round friendly proportions, colorful vibrant, 16-bit retro RPG style, Dragon Quest Akira Toriyama inspired, front-facing battle pose, black background, detailed pixel art, game sprite"
  "ancient-sphinx|58|pixel art JRPG monster sprite, gold sphinx with eagle wings and lion body, Egyptian headdress, cute but fierce, round friendly proportions, colorful vibrant, 16-bit retro RPG style, Dragon Quest Akira Toriyama inspired, front-facing battle pose, black background, detailed pixel art, game sprite"
  # V3 Portal Land Monsters - Twilight (FIERCE)
  # void-shade — SKIP: recolor of wraith (purple → darker purple/violet)
  # dark-knight — SKIP: recolor of knight (silver → black)
  # V3 Portal Land Bosses (FIERCE)
  "storm-sentinel|61|pixel art JRPG boss monster sprite, blue storm golem crackling with electricity, lightning guardian, cute but fierce, round friendly proportions, colorful vibrant, 16-bit retro RPG style, Dragon Quest Akira Toriyama inspired, front-facing battle pose, black background, detailed pixel art, game sprite"
  "frost-monarch|62|pixel art JRPG boss monster sprite, ice blue frost king with frozen crown and icy cape, regal, cute but fierce, round friendly proportions, colorful vibrant, 16-bit retro RPG style, Dragon Quest Akira Toriyama inspired, front-facing battle pose, black background, detailed pixel art, game sprite"
  # Legendary Bosses (FIERCE)
  "sword-wraith|63|pixel art JRPG boss monster sprite, blue spectral knight wielding glowing ethereal sword, ghostly armor, cute but fierce, round friendly proportions, colorful vibrant, 16-bit retro RPG style, Dragon Quest Akira Toriyama inspired, front-facing battle pose, black background, detailed pixel art, game sprite"
  "celestial-guardian|64|pixel art JRPG boss monster sprite, gold and white angelic guardian with radiant wings and halo, divine armor, cute but fierce, round friendly proportions, colorful vibrant, 16-bit retro RPG style, Dragon Quest Akira Toriyama inspired, front-facing battle pose, black background, detailed pixel art, game sprite"
  # Final Boss (FIERCE)
  "demon-king|65|pixel art JRPG boss monster sprite, purple demon king with crown of horns, wings and dark aura, final boss, cute but fierce, round friendly proportions, colorful vibrant, 16-bit retro RPG style, Dragon Quest Akira Toriyama inspired, front-facing battle pose, black background, detailed pixel art, game sprite"
)

BASE="https://image.pollinations.ai/prompt/"
PARAMS="width=256&height=256&nologo=true&model=flux&nofeed=true"

TOTAL=${#MONSTERS[@]}
GOOD=0
BAD=0
SKIPPED=0
FAILED_IDS=""

for entry in "${MONSTERS[@]}"; do
  IFS='|' read -r id idx prompt <<< "$entry"
  COUNT=$((COUNT + 1))
  SEED=$((idx * 42 + 7))
  filepath="${DIR}/${id}.png"

  # Skip already-downloaded valid images (>5KB)
  if [ -f "$filepath" ]; then
    TYPE=$(file -b "$filepath" 2>/dev/null)
    SIZE=$(stat -f%z "$filepath" 2>/dev/null || stat -c%s "$filepath" 2>/dev/null)
    if echo "$TYPE" | grep -qi "image\|PNG\|JPEG" && [ "${SIZE:-0}" -gt 5000 ]; then
      echo "[${COUNT}/${TOTAL}] ${id} — skipped (already downloaded, ${SIZE}B)"
      SKIPPED=$((SKIPPED + 1))
      GOOD=$((GOOD + 1))
      continue
    fi
  fi

  ENCODED=$(python3 -c "import urllib.parse; print(urllib.parse.quote('$prompt'))" 2>/dev/null || echo "$prompt" | sed 's/ /%20/g; s/,/%2C/g')
  URL="${BASE}${ENCODED}?${PARAMS}&seed=${SEED}"

  printf "[%d/%d] %s... " "$COUNT" "$TOTAL" "$id"
  SUCCESS=false
  for attempt in 1 2 3; do
    curl --max-time 180 -L -s -o "$filepath" "$URL"
    TYPE=$(file -b "$filepath" 2>/dev/null)
    if echo "$TYPE" | grep -qi "image\|PNG\|JPEG"; then
      SIZE=$(stat -f%z "$filepath" 2>/dev/null || stat -c%s "$filepath" 2>/dev/null)
      echo "OK (${SIZE}B, attempt ${attempt})"
      SUCCESS=true
      break
    else
      if [ "$attempt" -lt 3 ]; then
        WAIT=$((attempt * 20))
        printf "retry in %ds... " "$WAIT"
        sleep "$WAIT"
      fi
    fi
  done

  if [ "$SUCCESS" = true ]; then
    GOOD=$((GOOD + 1))
  else
    echo "FAIL"
    BAD=$((BAD + 1))
    FAILED_IDS="${FAILED_IDS} ${id}"
    rm -f "$filepath"
  fi

  # Respect rate limit: 1 concurrent request, wait between downloads
  sleep 10
done

echo ""
echo "=== DOWNLOAD SUMMARY ==="
echo "Total: ${TOTAL}"
echo "Successful: ${GOOD} (${SKIPPED} skipped)"
echo "Failed: ${BAD}"
[ -n "$FAILED_IDS" ] && echo "Failed:${FAILED_IDS}"
echo ""
[ "$BAD" -gt 0 ] && echo "Re-run this script to retry failed downloads."
