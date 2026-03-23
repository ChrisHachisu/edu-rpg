#!/bin/bash
# Download monster sprites from pollinations.ai
# Run: bash download-monsters.sh
# Uses 10s delay between downloads to avoid rate limiting

DIR="$(dirname "$0")/monster-sprites"
mkdir -p "$DIR"

MONSTERS=(
  slime bug rabbit mushroom wolf bandit bat spider crab golem
  giant-toad serpent jellyfish piranha merfolk harpy wyvern kraken
  storm-harpy dragon blizzard-bear ice-sprite dark-sorcerer ice-wyrm
  lizard knight skeleton wraith fire-elemental lava-golem lich
  flame-titan lava-wyrm chimera demon shadow demon-king sword-wraith
  celestial-guardian storm-sentinel frost-monarch giant-crab sand-golem
  bandit-lord storm-raptor cloud-wraith frost-stalker glacial-golem
  temple-guard ancient-sphinx void-shade dark-knight
)

SEED=42
OK=0
FAIL=0

for m in "${MONSTERS[@]}"; do
  OUT="$DIR/${m}.png"
  if [ -f "$OUT" ] && file "$OUT" | grep -q "PNG image"; then
    echo "SKIP (already valid): $m"
    ((OK++))
    continue
  fi

  PROMPT="pixel art JRPG monster sprite, ${m//-/ }, dark fantasy style, 16-bit retro RPG, black background, centered, no text"
  ENCODED=$(python3 -c "import urllib.parse; print(urllib.parse.quote('$PROMPT'))")
  URL="https://image.pollinations.ai/prompt/${ENCODED}?width=256&height=256&seed=${SEED}&model=flux&nologo=true"

  for attempt in 1 2 3; do
    curl -sL -o "$OUT" "$URL" --max-time 30
    if file "$OUT" | grep -q "PNG image"; then
      echo "OK: $m"
      ((OK++))
      break
    else
      echo "  attempt $attempt failed for $m ($(file -b "$OUT"))"
      rm -f "$OUT"
      if [ $attempt -lt 3 ]; then
        sleep 15
      fi
    fi
  done

  if [ ! -f "$OUT" ]; then
    echo "FAIL: $m"
    ((FAIL++))
  fi

  ((SEED += 42))
  sleep 10
done

echo ""
echo "Done: $OK OK, $FAIL FAIL out of ${#MONSTERS[@]} total"
