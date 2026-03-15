import Phaser from 'phaser';

// Procedural pixel art generator — creates all game sprites at runtime
// so we don't need any external image files

export function generateAssets(scene: Phaser.Scene): void {
  generateHeroSprites(scene);
  generateMonsterSprites(scene);
  generateTilesets(scene);
  generateUIAssets(scene);
}

function drawKnight(g: Phaser.GameObjects.Graphics, ox: number, oy: number, dir: number, frame: number): void {
  // dir: 0=down, 1=left, 2=right, 3=up
  // Knight colors
  const armor = 0x8899bb;      // Silver-blue armor
  const armorDark = 0x667799;  // Darker armor
  const helmet = 0x7788aa;     // Helmet
  const visor = 0x222233;      // Visor/face guard
  const plume = 0xcc2222;      // Red plume on helmet
  const cape = 0x2244aa;       // Blue cape
  const capeDark = 0x1a3388;
  const sword = 0xccccdd;      // Sword blade
  const hilt = 0xddaa33;       // Gold hilt
  const shield = 0x2244aa;     // Blue shield
  const shieldEdge = 0xddaa33; // Gold shield edge
  const boots = 0x554433;

  const legOffset = frame === 1 ? 1 : frame === 2 ? -1 : 0;

  if (dir === 0) {
    // Facing down — show front of knight
    // Cape behind
    g.fillStyle(cape);
    g.fillRect(ox + 4, oy + 7, 8, 5);
    // Armor body
    g.fillStyle(armor);
    g.fillRect(ox + 5, oy + 5, 6, 7);
    g.fillStyle(armorDark);
    g.fillRect(ox + 5, oy + 9, 6, 2); // belt line
    // Helmet
    g.fillStyle(helmet);
    g.fillRect(ox + 5, oy + 1, 6, 5);
    g.fillRect(ox + 4, oy + 2, 8, 3);
    // Visor
    g.fillStyle(visor);
    g.fillRect(ox + 6, oy + 3, 4, 2);
    // Eye slit
    g.fillStyle(0xeeeeff);
    g.fillRect(ox + 7, oy + 3, 1, 1);
    g.fillRect(ox + 9, oy + 3, 1, 1);
    // Plume on top
    g.fillStyle(plume);
    g.fillRect(ox + 7, oy + 0, 2, 2);
    // Sword in right hand
    g.fillStyle(sword);
    g.fillRect(ox + 11, oy + 4, 2, 7);
    g.fillStyle(hilt);
    g.fillRect(ox + 10, oy + 6, 4, 1);
    // Shield in left hand
    g.fillStyle(shield);
    g.fillRect(ox + 2, oy + 5, 3, 5);
    g.fillStyle(shieldEdge);
    g.fillRect(ox + 2, oy + 5, 3, 1);
    g.fillRect(ox + 2, oy + 9, 3, 1);
    // Boots
    g.fillStyle(boots);
    g.fillRect(ox + 5 + legOffset, oy + 12, 3, 3);
    g.fillRect(ox + 8 - legOffset, oy + 12, 3, 3);
  } else if (dir === 1) {
    // Facing left
    // Cape on right side
    g.fillStyle(cape);
    g.fillRect(ox + 9, oy + 6, 4, 6);
    g.fillStyle(capeDark);
    g.fillRect(ox + 11, oy + 7, 2, 5);
    // Armor body
    g.fillStyle(armor);
    g.fillRect(ox + 5, oy + 5, 5, 7);
    g.fillStyle(armorDark);
    g.fillRect(ox + 5, oy + 9, 5, 2);
    // Helmet facing left
    g.fillStyle(helmet);
    g.fillRect(ox + 4, oy + 1, 6, 5);
    g.fillRect(ox + 3, oy + 2, 2, 3);
    // Visor
    g.fillStyle(visor);
    g.fillRect(ox + 4, oy + 3, 3, 2);
    // Eye slit
    g.fillStyle(0xeeeeff);
    g.fillRect(ox + 4, oy + 3, 1, 1);
    // Plume
    g.fillStyle(plume);
    g.fillRect(ox + 7, oy + 0, 2, 2);
    // Shield in front (left side)
    g.fillStyle(shield);
    g.fillRect(ox + 2, oy + 5, 3, 5);
    g.fillStyle(shieldEdge);
    g.fillRect(ox + 2, oy + 5, 1, 5);
    g.fillRect(ox + 4, oy + 5, 1, 5);
    // Sword behind
    g.fillStyle(sword);
    g.fillRect(ox + 10, oy + 3, 1, 8);
    g.fillStyle(hilt);
    g.fillRect(ox + 9, oy + 6, 3, 1);
    // Boots
    g.fillStyle(boots);
    g.fillRect(ox + 5 + legOffset, oy + 12, 3, 3);
    g.fillRect(ox + 7 - legOffset, oy + 12, 3, 3);
  } else if (dir === 2) {
    // Facing right (mirror of left)
    // Cape on left side
    g.fillStyle(cape);
    g.fillRect(ox + 3, oy + 6, 4, 6);
    g.fillStyle(capeDark);
    g.fillRect(ox + 3, oy + 7, 2, 5);
    // Armor body
    g.fillStyle(armor);
    g.fillRect(ox + 6, oy + 5, 5, 7);
    g.fillStyle(armorDark);
    g.fillRect(ox + 6, oy + 9, 5, 2);
    // Helmet facing right
    g.fillStyle(helmet);
    g.fillRect(ox + 6, oy + 1, 6, 5);
    g.fillRect(ox + 11, oy + 2, 2, 3);
    // Visor
    g.fillStyle(visor);
    g.fillRect(ox + 9, oy + 3, 3, 2);
    // Eye slit
    g.fillStyle(0xeeeeff);
    g.fillRect(ox + 11, oy + 3, 1, 1);
    // Plume
    g.fillStyle(plume);
    g.fillRect(ox + 7, oy + 0, 2, 2);
    // Sword in front (right side)
    g.fillStyle(sword);
    g.fillRect(ox + 12, oy + 3, 1, 8);
    g.fillStyle(hilt);
    g.fillRect(ox + 11, oy + 6, 3, 1);
    // Shield behind
    g.fillStyle(shield);
    g.fillRect(ox + 11, oy + 5, 3, 5);
    g.fillStyle(shieldEdge);
    g.fillRect(ox + 11, oy + 5, 1, 5);
    g.fillRect(ox + 13, oy + 5, 1, 5);
    // Boots
    g.fillStyle(boots);
    g.fillRect(ox + 6 + legOffset, oy + 12, 3, 3);
    g.fillRect(ox + 8 - legOffset, oy + 12, 3, 3);
  } else {
    // Facing up — show back
    // Cape full back view
    g.fillStyle(cape);
    g.fillRect(ox + 4, oy + 5, 8, 8);
    g.fillStyle(capeDark);
    g.fillRect(ox + 5, oy + 6, 6, 7);
    // Armor shoulders peeking
    g.fillStyle(armor);
    g.fillRect(ox + 4, oy + 5, 2, 3);
    g.fillRect(ox + 10, oy + 5, 2, 3);
    // Helmet from back
    g.fillStyle(helmet);
    g.fillRect(ox + 5, oy + 1, 6, 5);
    g.fillRect(ox + 4, oy + 2, 8, 3);
    // Plume
    g.fillStyle(plume);
    g.fillRect(ox + 7, oy + 0, 2, 3);
    g.fillRect(ox + 6, oy + 0, 4, 1);
    // Sword on back
    g.fillStyle(sword);
    g.fillRect(ox + 11, oy + 2, 1, 9);
    g.fillStyle(hilt);
    g.fillRect(ox + 10, oy + 5, 3, 1);
    // Shield on back
    g.fillStyle(shield);
    g.fillRect(ox + 3, oy + 4, 2, 4);
    // Boots
    g.fillStyle(boots);
    g.fillRect(ox + 5 + legOffset, oy + 12, 3, 3);
    g.fillRect(ox + 8 - legOffset, oy + 12, 3, 3);
  }
}

function generateHeroSprites(scene: Phaser.Scene): void {
  // Hero walking sprite sheet: 4 directions × 3 frames = 12 frames, each 16×16
  const g = scene.add.graphics().setVisible(false);
  const frameW = 16, frameH = 16;

  for (let dir = 0; dir < 4; dir++) {
    for (let frame = 0; frame < 3; frame++) {
      const ox = (dir * 3 + frame) * frameW;
      drawKnight(g, ox, 0, dir, frame);
    }
  }

  g.generateTexture('hero-walk', frameW * 12, frameH);
  g.destroy();

  // Add frames manually for animation
  for (let i = 0; i < 12; i++) {
    scene.textures.get('hero-walk').add(i, 0, i * frameW, 0, frameW, frameH);
  }
}

function generateMonsterSprites(scene: Phaser.Scene): void {
  const monsterDefs: { key: string; color: number; shape: string }[] = [
    { key: 'monster-slime', color: 0x44cc88, shape: 'slime' },
    { key: 'monster-bug', color: 0x886622, shape: 'bug' },
    { key: 'monster-rabbit', color: 0xccaa88, shape: 'rabbit' },
    { key: 'monster-wolf', color: 0x555577, shape: 'wolf' },
    { key: 'monster-mushroom', color: 0xaa44aa, shape: 'mushroom' },
    { key: 'monster-spider', color: 0x333333, shape: 'spider' },
    { key: 'monster-crab', color: 0xcc4422, shape: 'crab' },
    { key: 'monster-serpent', color: 0x2266aa, shape: 'serpent' },
    { key: 'monster-golem', color: 0x888877, shape: 'golem' },
    { key: 'monster-harpy', color: 0xddaadd, shape: 'harpy' },
    { key: 'monster-wyvern', color: 0x44aa66, shape: 'wyvern' },
    { key: 'monster-lizard', color: 0xcc6622, shape: 'lizard' },
    { key: 'monster-knight', color: 0x332244, shape: 'knight' },
    { key: 'monster-dragon', color: 0xcc2222, shape: 'dragon' },
    { key: 'monster-chimera', color: 0x996633, shape: 'chimera' },
    { key: 'monster-demonKing', color: 0x660066, shape: 'boss' },
  ];

  const size = 48; // Monster sprite size

  for (const def of monsterDefs) {
    const g = scene.add.graphics().setVisible(false);
    drawMonster(g, def.shape, def.color, size);
    g.generateTexture(def.key, size, size);
    g.destroy();
  }
}

function drawMonster(g: Phaser.GameObjects.Graphics, shape: string, color: number, size: number): void {
  const cx = size / 2;
  const cy = size / 2;
  const darker = Phaser.Display.Color.IntegerToColor(color).darken(30).color;
  const lighter = Phaser.Display.Color.IntegerToColor(color).lighten(30).color;
  const lightest = Phaser.Display.Color.IntegerToColor(color).lighten(50).color;

  switch (shape) {
    case 'slime': {
      // Classic bouncy slime with cute face and shine
      // Body — rounded droplet shape
      g.fillStyle(color);
      g.fillEllipse(cx, cy + 8, 32, 24);
      g.fillEllipse(cx, cy + 2, 26, 20);
      // Highlight sheen
      g.fillStyle(lighter);
      g.fillEllipse(cx - 4, cy - 2, 16, 12);
      g.fillStyle(lightest, 0.5);
      g.fillEllipse(cx - 6, cy - 4, 8, 6);
      // Drip detail on side
      g.fillStyle(color);
      g.fillEllipse(cx + 10, cy + 16, 6, 8);
      // Big cute eyes
      g.fillStyle(0xffffff);
      g.fillEllipse(cx - 6, cy + 2, 10, 9);
      g.fillEllipse(cx + 6, cy + 2, 10, 9);
      g.fillStyle(0x000000);
      g.fillCircle(cx - 5, cy + 3, 3);
      g.fillCircle(cx + 7, cy + 3, 3);
      // Eye shine
      g.fillStyle(0xffffff);
      g.fillCircle(cx - 6, cy + 1, 1.5);
      g.fillCircle(cx + 6, cy + 1, 1.5);
      // Smile
      g.lineStyle(1.5, 0x000000);
      g.lineBetween(cx - 4, cy + 9, cx, cy + 11);
      g.lineBetween(cx, cy + 11, cx + 4, cy + 9);
      break;
    }

    case 'bug': {
      // Beetle with shiny shell and mandibles
      // Shell (back)
      g.fillStyle(darker);
      g.fillEllipse(cx, cy + 6, 30, 20);
      // Shell halves with line
      g.fillStyle(color);
      g.fillEllipse(cx - 4, cy + 4, 14, 16);
      g.fillEllipse(cx + 4, cy + 4, 14, 16);
      // Shell shine
      g.fillStyle(lighter, 0.4);
      g.fillEllipse(cx - 6, cy + 1, 6, 8);
      // Head
      g.fillStyle(darker);
      g.fillEllipse(cx, cy - 8, 16, 12);
      // Mandibles
      g.fillStyle(0x553311);
      g.fillTriangle(cx - 8, cy - 6, cx - 4, cy - 2, cx - 12, cy);
      g.fillTriangle(cx + 8, cy - 6, cx + 4, cy - 2, cx + 12, cy);
      // Eyes — compound eyes
      g.fillStyle(0xff2200);
      g.fillCircle(cx - 5, cy - 10, 3);
      g.fillCircle(cx + 5, cy - 10, 3);
      g.fillStyle(0xff6644);
      g.fillCircle(cx - 6, cy - 11, 1.5);
      g.fillCircle(cx + 4, cy - 11, 1.5);
      // Antennae
      g.lineStyle(1.5, darker);
      g.lineBetween(cx - 4, cy - 13, cx - 10, cy - 20);
      g.lineBetween(cx + 4, cy - 13, cx + 10, cy - 20);
      // Antenna tips
      g.fillStyle(darker);
      g.fillCircle(cx - 10, cy - 20, 2);
      g.fillCircle(cx + 10, cy - 20, 2);
      // Legs
      g.lineStyle(1.5, 0x553311);
      g.lineBetween(cx - 12, cy + 4, cx - 18, cy + 16);
      g.lineBetween(cx + 12, cy + 4, cx + 18, cy + 16);
      g.lineBetween(cx - 14, cy + 8, cx - 20, cy + 18);
      g.lineBetween(cx + 14, cy + 8, cx + 20, cy + 18);
      g.lineBetween(cx - 10, cy + 12, cx - 16, cy + 20);
      g.lineBetween(cx + 10, cy + 12, cx + 16, cy + 20);
      break;
    }

    case 'rabbit': {
      // Fierce rabbit with big ears and fluffy tail
      // Body — fluffy
      g.fillStyle(color);
      g.fillEllipse(cx, cy + 8, 22, 18);
      // Fluffy chest
      g.fillStyle(lighter);
      g.fillEllipse(cx, cy + 6, 14, 12);
      // Fluffy tail
      g.fillStyle(lightest);
      g.fillCircle(cx + 12, cy + 10, 5);
      g.fillStyle(lighter);
      g.fillCircle(cx + 11, cy + 9, 3);
      // Head
      g.fillStyle(color);
      g.fillCircle(cx, cy - 4, 10);
      // Long ears
      g.fillStyle(color);
      g.fillEllipse(cx - 6, cy - 18, 6, 14);
      g.fillEllipse(cx + 6, cy - 18, 6, 14);
      // Inner ear (pink)
      g.fillStyle(0xffaaaa);
      g.fillEllipse(cx - 6, cy - 17, 3, 10);
      g.fillEllipse(cx + 6, cy - 17, 3, 10);
      // Face
      g.fillStyle(lighter);
      g.fillEllipse(cx, cy - 2, 8, 6);
      // Eyes — fierce red
      g.fillStyle(0xffffff);
      g.fillCircle(cx - 4, cy - 6, 3);
      g.fillCircle(cx + 4, cy - 6, 3);
      g.fillStyle(0xcc0000);
      g.fillCircle(cx - 4, cy - 5, 2);
      g.fillCircle(cx + 4, cy - 5, 2);
      g.fillStyle(0xffffff);
      g.fillCircle(cx - 5, cy - 6, 1);
      g.fillCircle(cx + 3, cy - 6, 1);
      // Nose
      g.fillStyle(0xff8888);
      g.fillCircle(cx, cy - 1, 2);
      // Whiskers
      g.lineStyle(1, 0x000000, 0.4);
      g.lineBetween(cx - 2, cy - 1, cx - 10, cy - 3);
      g.lineBetween(cx - 2, cy, cx - 10, cy + 1);
      g.lineBetween(cx + 2, cy - 1, cx + 10, cy - 3);
      g.lineBetween(cx + 2, cy, cx + 10, cy + 1);
      // Front paws
      g.fillStyle(color);
      g.fillEllipse(cx - 6, cy + 16, 6, 4);
      g.fillEllipse(cx + 6, cy + 16, 6, 4);
      break;
    }

    case 'wolf': {
      // Shadowy wolf with glowing eyes and spiky fur
      // Body — muscular
      g.fillStyle(color);
      g.fillEllipse(cx + 2, cy + 8, 28, 18);
      // Fur texture — spiky back
      g.fillStyle(darker);
      g.fillTriangle(cx - 6, cy, cx - 2, cy - 6, cx + 2, cy);
      g.fillTriangle(cx, cy - 1, cx + 4, cy - 7, cx + 8, cy - 1);
      g.fillTriangle(cx + 6, cy, cx + 10, cy - 5, cx + 14, cy + 1);
      // Head
      g.fillStyle(color);
      g.fillEllipse(cx - 8, cy - 2, 16, 14);
      // Snout
      g.fillStyle(lighter);
      g.fillEllipse(cx - 12, cy + 1, 10, 8);
      // Ears — pointed
      g.fillStyle(color);
      g.fillTriangle(cx - 12, cy - 14, cx - 8, cy - 6, cx - 16, cy - 4);
      g.fillTriangle(cx - 2, cy - 14, cx + 2, cy - 6, cx - 6, cy - 4);
      // Eyes — glowing yellow
      g.fillStyle(0xffee00);
      g.fillCircle(cx - 9, cy - 5, 3);
      g.fillCircle(cx - 3, cy - 5, 3);
      g.fillStyle(0x000000);
      g.fillCircle(cx - 9, cy - 4, 1.5);
      g.fillCircle(cx - 3, cy - 4, 1.5);
      // Nose
      g.fillStyle(0x222222);
      g.fillCircle(cx - 15, cy, 2.5);
      // Teeth
      g.fillStyle(0xffffff);
      g.fillTriangle(cx - 14, cy + 3, cx - 12, cy + 3, cx - 13, cy + 6);
      g.fillTriangle(cx - 10, cy + 3, cx - 8, cy + 3, cx - 9, cy + 6);
      // Tail
      g.lineStyle(3, darker);
      g.lineBetween(cx + 14, cy + 6, cx + 20, cy - 2);
      g.lineBetween(cx + 20, cy - 2, cx + 22, cy - 6);
      // Legs
      g.fillStyle(color);
      g.fillRect(cx - 8, cy + 14, 5, 8);
      g.fillRect(cx + 6, cy + 14, 5, 8);
      // Paws
      g.fillStyle(darker);
      g.fillEllipse(cx - 6, cy + 22, 6, 3);
      g.fillEllipse(cx + 8, cy + 22, 6, 3);
      break;
    }

    case 'mushroom': {
      // Mushroom with spotted cap and evil face peering from underneath
      // Stem
      g.fillStyle(0xeeddcc);
      g.fillRect(cx - 5, cy + 4, 10, 14);
      g.fillStyle(0xddccbb);
      g.fillRect(cx - 3, cy + 6, 2, 10);
      // Cap — large and domed
      g.fillStyle(color);
      g.fillEllipse(cx, cy - 2, 36, 22);
      // Cap top highlight
      g.fillStyle(lighter);
      g.fillEllipse(cx - 2, cy - 6, 24, 12);
      // Spots on cap
      g.fillStyle(lightest);
      g.fillCircle(cx - 8, cy - 6, 4);
      g.fillCircle(cx + 6, cy - 8, 3);
      g.fillCircle(cx + 2, cy - 2, 2.5);
      g.fillCircle(cx - 12, cy - 1, 2);
      g.fillCircle(cx + 12, cy - 3, 2);
      // Spore particles floating
      g.fillStyle(lighter, 0.6);
      g.fillCircle(cx - 14, cy - 14, 1.5);
      g.fillCircle(cx + 10, cy - 16, 1);
      g.fillCircle(cx + 16, cy - 10, 1.5);
      g.fillCircle(cx - 8, cy - 18, 1);
      // Evil face under cap
      g.fillStyle(0xffffff);
      g.fillCircle(cx - 5, cy + 2, 3.5);
      g.fillCircle(cx + 5, cy + 2, 3.5);
      g.fillStyle(0x000000);
      g.fillCircle(cx - 5, cy + 3, 2);
      g.fillCircle(cx + 5, cy + 3, 2);
      // Angry eyebrows
      g.lineStyle(1.5, 0x000000);
      g.lineBetween(cx - 8, cy - 1, cx - 3, cy);
      g.lineBetween(cx + 8, cy - 1, cx + 3, cy);
      // Jagged grin
      g.lineStyle(1.5, 0x000000);
      g.lineBetween(cx - 4, cy + 7, cx - 1, cy + 5);
      g.lineBetween(cx - 1, cy + 5, cx + 1, cy + 7);
      g.lineBetween(cx + 1, cy + 7, cx + 4, cy + 5);
      break;
    }

    case 'spider': {
      // Proper spider with 8 legs, multiple eyes, and fangs
      // Abdomen
      g.fillStyle(color);
      g.fillEllipse(cx + 2, cy + 8, 20, 16);
      // Abdomen markings
      g.fillStyle(darker);
      g.fillEllipse(cx + 2, cy + 6, 10, 8);
      g.fillStyle(0xcc2222);
      g.fillTriangle(cx + 2, cy + 2, cx - 2, cy + 8, cx + 6, cy + 8);
      // Cephalothorax
      g.fillStyle(color);
      g.fillEllipse(cx - 4, cy - 4, 16, 14);
      // Multiple eyes (8)
      g.fillStyle(0x000000);
      g.fillCircle(cx - 7, cy - 6, 2.5);
      g.fillCircle(cx - 1, cy - 6, 2.5);
      g.fillCircle(cx - 9, cy - 3, 2);
      g.fillCircle(cx + 1, cy - 3, 2);
      g.fillStyle(0xff0000);
      g.fillCircle(cx - 7, cy - 6, 1.5);
      g.fillCircle(cx - 1, cy - 6, 1.5);
      g.fillStyle(0xff4400);
      g.fillCircle(cx - 9, cy - 3, 1);
      g.fillCircle(cx + 1, cy - 3, 1);
      // Fangs
      g.fillStyle(0xddddcc);
      g.fillTriangle(cx - 6, cy + 1, cx - 4, cy + 1, cx - 5, cy + 5);
      g.fillTriangle(cx - 2, cy + 1, cx, cy + 1, cx - 1, cy + 5);
      // 8 legs
      g.lineStyle(1.5, darker);
      // Left 4
      g.lineBetween(cx - 10, cy - 4, cx - 20, cy - 12);
      g.lineBetween(cx - 20, cy - 12, cx - 22, cy + 2);
      g.lineBetween(cx - 10, cy - 1, cx - 18, cy - 6);
      g.lineBetween(cx - 18, cy - 6, cx - 20, cy + 6);
      g.lineBetween(cx - 8, cy + 2, cx - 16, cy + 2);
      g.lineBetween(cx - 16, cy + 2, cx - 18, cy + 12);
      g.lineBetween(cx - 6, cy + 6, cx - 14, cy + 8);
      g.lineBetween(cx - 14, cy + 8, cx - 16, cy + 16);
      // Right 4
      g.lineBetween(cx + 4, cy - 4, cx + 14, cy - 12);
      g.lineBetween(cx + 14, cy - 12, cx + 16, cy + 2);
      g.lineBetween(cx + 4, cy - 1, cx + 12, cy - 6);
      g.lineBetween(cx + 12, cy - 6, cx + 14, cy + 6);
      g.lineBetween(cx + 6, cy + 2, cx + 12, cy + 2);
      g.lineBetween(cx + 12, cy + 2, cx + 14, cy + 12);
      g.lineBetween(cx + 6, cy + 8, cx + 10, cy + 10);
      g.lineBetween(cx + 10, cy + 10, cx + 12, cy + 18);
      break;
    }

    case 'crab': {
      // Armored crab with big claws
      // Shell body
      g.fillStyle(color);
      g.fillEllipse(cx, cy + 4, 30, 20);
      // Shell plates
      g.fillStyle(darker);
      g.fillEllipse(cx, cy + 2, 24, 14);
      g.fillStyle(color);
      g.fillEllipse(cx, cy + 1, 18, 10);
      // Shell highlights
      g.fillStyle(lighter, 0.4);
      g.fillEllipse(cx - 4, cy - 1, 8, 6);
      // Eyes on stalks
      g.fillStyle(color);
      g.fillRect(cx - 6, cy - 10, 3, 8);
      g.fillRect(cx + 3, cy - 10, 3, 8);
      g.fillStyle(0xffffff);
      g.fillCircle(cx - 5, cy - 12, 3);
      g.fillCircle(cx + 4, cy - 12, 3);
      g.fillStyle(0x000000);
      g.fillCircle(cx - 5, cy - 12, 1.5);
      g.fillCircle(cx + 4, cy - 12, 1.5);
      // Big claws
      g.fillStyle(darker);
      // Left claw arm
      g.fillRect(cx - 16, cy - 2, 8, 4);
      // Left claw pincer
      g.fillStyle(color);
      g.fillEllipse(cx - 20, cy - 4, 10, 8);
      g.fillStyle(darker);
      g.fillTriangle(cx - 22, cy - 6, cx - 16, cy - 4, cx - 22, cy - 2);
      g.fillTriangle(cx - 22, cy, cx - 16, cy - 2, cx - 22, cy - 4);
      // Right claw arm
      g.fillStyle(darker);
      g.fillRect(cx + 8, cy - 2, 8, 4);
      g.fillStyle(color);
      g.fillEllipse(cx + 20, cy - 4, 10, 8);
      g.fillStyle(darker);
      g.fillTriangle(cx + 22, cy - 6, cx + 16, cy - 4, cx + 22, cy - 2);
      g.fillTriangle(cx + 22, cy, cx + 16, cy - 2, cx + 22, cy - 4);
      // Legs
      g.lineStyle(2, darker);
      g.lineBetween(cx - 10, cy + 10, cx - 14, cy + 18);
      g.lineBetween(cx - 6, cy + 12, cx - 10, cy + 20);
      g.lineBetween(cx + 10, cy + 10, cx + 14, cy + 18);
      g.lineBetween(cx + 6, cy + 12, cx + 10, cy + 20);
      // Bubbles
      g.fillStyle(0xffffff, 0.5);
      g.fillCircle(cx + 14, cy - 10, 2);
      g.fillCircle(cx + 18, cy - 14, 1.5);
      break;
    }

    case 'serpent': {
      // Sea serpent with scales, flowing body, and fin
      // Coiled body — S-curve
      g.fillStyle(color);
      g.fillEllipse(cx + 6, cy + 10, 18, 12);
      g.fillEllipse(cx - 6, cy + 6, 18, 12);
      g.fillEllipse(cx + 2, cy + 2, 14, 10);
      // Scale pattern
      g.fillStyle(darker, 0.4);
      for (let i = 0; i < 5; i++) {
        g.fillEllipse(cx - 8 + i * 4, cy + 8, 4, 3);
      }
      // Belly lighter
      g.fillStyle(lighter);
      g.fillEllipse(cx + 6, cy + 12, 10, 6);
      g.fillEllipse(cx - 6, cy + 8, 10, 6);
      // Neck and head raised
      g.fillStyle(color);
      g.fillEllipse(cx - 2, cy - 4, 10, 16);
      g.fillEllipse(cx - 2, cy - 12, 14, 12);
      // Head crest/fin
      g.fillStyle(0x1144aa);
      g.fillTriangle(cx - 2, cy - 20, cx + 4, cy - 12, cx - 8, cy - 12);
      // Eyes
      g.fillStyle(0xffff00);
      g.fillCircle(cx - 6, cy - 14, 3);
      g.fillCircle(cx + 2, cy - 14, 3);
      g.fillStyle(0x000000);
      g.fillCircle(cx - 6, cy - 13, 1.5);
      g.fillCircle(cx + 2, cy - 13, 1.5);
      // Jaw and teeth
      g.fillStyle(lighter);
      g.fillEllipse(cx - 2, cy - 8, 10, 4);
      g.fillStyle(0xffffff);
      g.fillTriangle(cx - 5, cy - 7, cx - 3, cy - 7, cx - 4, cy - 4);
      g.fillTriangle(cx + 1, cy - 7, cx + 3, cy - 7, cx + 2, cy - 4);
      // Tongue
      g.fillStyle(0xff3333);
      g.fillRect(cx - 3, cy - 5, 2, 5);
      g.fillTriangle(cx - 4, cy, cx - 2, cy, cx - 5, cy + 3);
      g.fillTriangle(cx - 4, cy, cx - 2, cy, cx - 1, cy + 3);
      // Water droplets
      g.fillStyle(0x88ccff, 0.6);
      g.fillCircle(cx + 16, cy + 2, 1.5);
      g.fillCircle(cx - 14, cy - 2, 1);
      g.fillCircle(cx + 12, cy - 8, 1.5);
      break;
    }

    case 'golem': {
      // Rocky body with cracks, glowing eyes, moss
      // Body — blocky
      g.fillStyle(color);
      g.fillRect(cx - 12, cy - 2, 24, 22);
      // Stone texture layers
      g.fillStyle(darker);
      g.fillRect(cx - 10, cy, 20, 3);
      g.fillRect(cx - 10, cy + 8, 20, 2);
      g.fillRect(cx - 10, cy + 14, 20, 2);
      // Cracks
      g.lineStyle(1, 0x555544);
      g.lineBetween(cx - 4, cy - 2, cx - 6, cy + 6);
      g.lineBetween(cx - 6, cy + 6, cx - 2, cy + 12);
      g.lineBetween(cx + 6, cy + 2, cx + 8, cy + 10);
      // Head — boulder
      g.fillStyle(color);
      g.fillEllipse(cx, cy - 10, 22, 18);
      g.fillStyle(darker);
      g.fillEllipse(cx + 2, cy - 8, 16, 12);
      g.fillStyle(color);
      g.fillEllipse(cx + 1, cy - 9, 12, 8);
      // Glowing eyes
      g.fillStyle(0x000000);
      g.fillRect(cx - 7, cy - 12, 6, 4);
      g.fillRect(cx + 1, cy - 12, 6, 4);
      g.fillStyle(0x44ff88);
      g.fillRect(cx - 6, cy - 11, 4, 2);
      g.fillRect(cx + 2, cy - 11, 4, 2);
      // Mossy patches
      g.fillStyle(0x447744, 0.6);
      g.fillEllipse(cx - 8, cy + 4, 6, 4);
      g.fillEllipse(cx + 10, cy + 12, 5, 3);
      g.fillEllipse(cx - 4, cy - 16, 4, 3);
      // Arms — boulder fists
      g.fillStyle(color);
      g.fillRect(cx - 18, cy, 8, 14);
      g.fillRect(cx + 10, cy, 8, 14);
      g.fillStyle(darker);
      g.fillEllipse(cx - 14, cy + 14, 10, 8);
      g.fillEllipse(cx + 14, cy + 14, 10, 8);
      // Legs
      g.fillStyle(color);
      g.fillRect(cx - 10, cy + 18, 8, 6);
      g.fillRect(cx + 2, cy + 18, 8, 6);
      break;
    }

    case 'harpy': {
      // Bird-woman with feathered wings, talons
      // Wings spread wide
      g.fillStyle(color);
      g.fillTriangle(cx - 8, cy - 2, cx - 22, cy - 14, cx - 20, cy + 6);
      g.fillTriangle(cx + 8, cy - 2, cx + 22, cy - 14, cx + 20, cy + 6);
      // Wing feather details
      g.fillStyle(lighter);
      g.fillTriangle(cx - 10, cy, cx - 18, cy - 8, cx - 16, cy + 4);
      g.fillTriangle(cx + 10, cy, cx + 18, cy - 8, cx + 16, cy + 4);
      g.fillStyle(lightest);
      g.fillTriangle(cx - 12, cy + 2, cx - 20, cy + 2, cx - 18, cy + 8);
      g.fillTriangle(cx + 12, cy + 2, cx + 20, cy + 2, cx + 18, cy + 8);
      // Body
      g.fillStyle(0xeeccaa);
      g.fillEllipse(cx, cy + 4, 14, 16);
      // Head
      g.fillStyle(0xeeccaa);
      g.fillCircle(cx, cy - 10, 8);
      // Hair
      g.fillStyle(color);
      g.fillEllipse(cx, cy - 14, 16, 8);
      g.fillStyle(darker);
      g.fillTriangle(cx - 6, cy - 14, cx, cy - 20, cx + 2, cy - 12);
      g.fillTriangle(cx + 2, cy - 14, cx + 6, cy - 22, cx + 8, cy - 12);
      // Eyes
      g.fillStyle(0xffffff);
      g.fillCircle(cx - 3, cy - 11, 2.5);
      g.fillCircle(cx + 3, cy - 11, 2.5);
      g.fillStyle(0x880088);
      g.fillCircle(cx - 3, cy - 10, 1.5);
      g.fillCircle(cx + 3, cy - 10, 1.5);
      // Beak-like mouth
      g.fillStyle(0xffaa44);
      g.fillTriangle(cx - 2, cy - 7, cx + 2, cy - 7, cx, cy - 4);
      // Talons
      g.fillStyle(0x888866);
      g.fillRect(cx - 5, cy + 12, 3, 8);
      g.fillRect(cx + 2, cy + 12, 3, 8);
      g.fillStyle(0x666644);
      g.fillTriangle(cx - 6, cy + 20, cx - 3, cy + 18, cx - 8, cy + 22);
      g.fillTriangle(cx + 5, cy + 20, cx + 2, cy + 18, cx + 7, cy + 22);
      break;
    }

    case 'wyvern': {
      // Flying dragon with wings spread, detailed scales
      // Body
      g.fillStyle(color);
      g.fillEllipse(cx, cy + 6, 22, 16);
      // Scale texture
      g.fillStyle(darker, 0.4);
      for (let row = 0; row < 3; row++) {
        for (let col = 0; col < 4; col++) {
          g.fillEllipse(cx - 6 + col * 4, cy + 2 + row * 4, 4, 3);
        }
      }
      // Belly
      g.fillStyle(lighter);
      g.fillEllipse(cx, cy + 8, 12, 8);
      // Wings — spread wide and detailed
      g.fillStyle(color);
      g.fillTriangle(cx - 10, cy, cx - 22, cy - 16, cx - 4, cy + 4);
      g.fillTriangle(cx + 10, cy, cx + 22, cy - 16, cx + 4, cy + 4);
      // Wing membrane
      g.fillStyle(darker, 0.4);
      g.fillTriangle(cx - 8, cy + 2, cx - 18, cy - 10, cx - 6, cy + 6);
      g.fillTriangle(cx + 8, cy + 2, cx + 18, cy - 10, cx + 6, cy + 6);
      // Wing bone lines
      g.lineStyle(1.5, darker);
      g.lineBetween(cx - 10, cy, cx - 20, cy - 14);
      g.lineBetween(cx + 10, cy, cx + 20, cy - 14);
      // Neck
      g.fillStyle(color);
      g.fillEllipse(cx, cy - 6, 10, 12);
      // Head
      g.fillStyle(color);
      g.fillEllipse(cx, cy - 14, 14, 10);
      // Horns
      g.fillStyle(darker);
      g.fillTriangle(cx - 5, cy - 18, cx - 3, cy - 14, cx - 7, cy - 14);
      g.fillTriangle(cx + 5, cy - 18, cx + 3, cy - 14, cx + 7, cy - 14);
      // Eyes
      g.fillStyle(0xffff00);
      g.fillCircle(cx - 4, cy - 15, 2.5);
      g.fillCircle(cx + 4, cy - 15, 2.5);
      g.fillStyle(0x000000);
      g.fillCircle(cx - 4, cy - 15, 1);
      g.fillCircle(cx + 4, cy - 15, 1);
      // Snout
      g.fillStyle(lighter);
      g.fillEllipse(cx, cy - 10, 8, 4);
      g.fillStyle(darker);
      g.fillCircle(cx - 2, cy - 10, 1);
      g.fillCircle(cx + 2, cy - 10, 1);
      // Tail
      g.fillStyle(color);
      g.fillTriangle(cx + 8, cy + 12, cx + 18, cy + 16, cx + 10, cy + 8);
      g.fillStyle(darker);
      g.fillTriangle(cx + 16, cy + 14, cx + 22, cy + 12, cx + 20, cy + 18);
      break;
    }

    case 'lizard': {
      // Fire lizard standing upright with flames
      // Body
      g.fillStyle(color);
      g.fillEllipse(cx, cy + 4, 20, 18);
      // Belly scales
      g.fillStyle(lighter);
      g.fillEllipse(cx, cy + 6, 12, 12);
      // Scale pattern
      g.fillStyle(darker, 0.3);
      g.fillEllipse(cx - 4, cy + 2, 4, 3);
      g.fillEllipse(cx + 4, cy + 2, 4, 3);
      g.fillEllipse(cx, cy + 6, 4, 3);
      // Head
      g.fillStyle(color);
      g.fillEllipse(cx, cy - 10, 16, 12);
      // Crest/spines
      g.fillStyle(0xff4400);
      g.fillTriangle(cx - 2, cy - 18, cx + 2, cy - 12, cx - 6, cy - 12);
      g.fillTriangle(cx + 2, cy - 16, cx + 6, cy - 10, cx - 2, cy - 10);
      // Eyes — fierce
      g.fillStyle(0xffff00);
      g.fillCircle(cx - 5, cy - 12, 3);
      g.fillCircle(cx + 5, cy - 12, 3);
      g.fillStyle(0x000000);
      g.fillCircle(cx - 5, cy - 11, 1.5);
      g.fillCircle(cx + 5, cy - 11, 1.5);
      // Mouth with fire breath
      g.fillStyle(darker);
      g.fillEllipse(cx, cy - 5, 10, 4);
      // Fire breath!
      g.fillStyle(0xff4400);
      g.fillTriangle(cx + 8, cy - 6, cx + 18, cy - 10, cx + 16, cy - 2);
      g.fillStyle(0xffaa00);
      g.fillTriangle(cx + 10, cy - 6, cx + 16, cy - 8, cx + 14, cy - 3);
      g.fillStyle(0xffff44);
      g.fillTriangle(cx + 10, cy - 5, cx + 14, cy - 7, cx + 13, cy - 3);
      // Arms
      g.fillStyle(color);
      g.fillRect(cx - 12, cy + 2, 5, 10);
      g.fillRect(cx + 7, cy + 2, 5, 10);
      // Claws
      g.fillStyle(0xddddaa);
      g.fillTriangle(cx - 13, cy + 12, cx - 11, cy + 10, cx - 15, cy + 14);
      g.fillTriangle(cx + 12, cy + 12, cx + 10, cy + 10, cx + 14, cy + 14);
      // Tail with flame tip
      g.fillStyle(color);
      g.fillTriangle(cx - 6, cy + 14, cx - 16, cy + 18, cx - 8, cy + 10);
      g.fillStyle(0xff6600);
      g.fillCircle(cx - 16, cy + 18, 3);
      g.fillStyle(0xffaa00);
      g.fillCircle(cx - 16, cy + 17, 2);
      // Legs
      g.fillStyle(color);
      g.fillRect(cx - 6, cy + 14, 5, 8);
      g.fillRect(cx + 1, cy + 14, 5, 8);
      break;
    }

    case 'knight': {
      // Dark armored figure with sword, glowing visor
      // Cape
      g.fillStyle(0x220033);
      g.fillTriangle(cx - 12, cy - 6, cx - 14, cy + 20, cx + 14, cy + 20);
      g.fillTriangle(cx + 12, cy - 6, cx + 14, cy + 20, cx - 14, cy + 20);
      // Body armor
      g.fillStyle(color);
      g.fillRect(cx - 10, cy - 4, 20, 18);
      // Armor plates
      g.fillStyle(lighter);
      g.fillRect(cx - 8, cy - 2, 16, 2);
      g.fillRect(cx - 8, cy + 4, 16, 2);
      g.fillRect(cx - 8, cy + 10, 16, 2);
      // Shoulder pauldrons
      g.fillStyle(color);
      g.fillEllipse(cx - 12, cy - 2, 10, 8);
      g.fillEllipse(cx + 12, cy - 2, 10, 8);
      g.fillStyle(lighter);
      g.fillEllipse(cx - 12, cy - 3, 6, 4);
      g.fillEllipse(cx + 12, cy - 3, 6, 4);
      // Helmet
      g.fillStyle(color);
      g.fillEllipse(cx, cy - 12, 18, 16);
      // Visor slit — glowing
      g.fillStyle(0x000000);
      g.fillRect(cx - 6, cy - 14, 12, 4);
      g.fillStyle(0xff2200);
      g.fillRect(cx - 5, cy - 13, 10, 2);
      // Helmet crest
      g.fillStyle(darker);
      g.fillTriangle(cx, cy - 22, cx - 3, cy - 12, cx + 3, cy - 12);
      // Sword — large, held to the side
      g.fillStyle(0xcccccc);
      g.fillRect(cx + 16, cy - 16, 3, 28);
      g.fillStyle(0xeeeeee);
      g.fillRect(cx + 17, cy - 14, 1, 24);
      // Crossguard
      g.fillStyle(0xffcc00);
      g.fillRect(cx + 13, cy + 10, 9, 3);
      // Handle
      g.fillStyle(0x663322);
      g.fillRect(cx + 16, cy + 13, 3, 6);
      // Shield
      g.fillStyle(0x444466);
      g.fillEllipse(cx - 16, cy + 4, 10, 14);
      g.fillStyle(0x555577);
      g.fillEllipse(cx - 16, cy + 3, 6, 10);
      // Shield emblem
      g.fillStyle(0xff0000);
      g.fillCircle(cx - 16, cy + 3, 2);
      // Legs
      g.fillStyle(color);
      g.fillRect(cx - 7, cy + 14, 6, 8);
      g.fillRect(cx + 1, cy + 14, 6, 8);
      // Boots
      g.fillStyle(darker);
      g.fillEllipse(cx - 4, cy + 22, 8, 4);
      g.fillEllipse(cx + 4, cy + 22, 8, 4);
      break;
    }

    case 'dragon': {
      // Majestic red dragon with spread wings, horns, fire
      // Wings — large and bat-like
      g.fillStyle(darker);
      g.fillTriangle(cx - 8, cy - 4, cx - 22, cy - 20, cx - 2, cy + 2);
      g.fillTriangle(cx + 8, cy - 4, cx + 22, cy - 20, cx + 2, cy + 2);
      // Wing membrane
      g.fillStyle(color, 0.6);
      g.fillTriangle(cx - 6, cy - 2, cx - 18, cy - 14, cx - 2, cy + 4);
      g.fillTriangle(cx + 6, cy - 2, cx + 18, cy - 14, cx + 2, cy + 4);
      // Wing claws
      g.fillStyle(0x222222);
      g.fillCircle(cx - 22, cy - 20, 2);
      g.fillCircle(cx + 22, cy - 20, 2);
      // Body
      g.fillStyle(color);
      g.fillEllipse(cx, cy + 6, 28, 20);
      // Belly scales
      g.fillStyle(lighter);
      g.fillEllipse(cx, cy + 8, 16, 12);
      // Scale rows
      g.fillStyle(darker, 0.3);
      for (let i = 0; i < 4; i++) {
        g.fillEllipse(cx - 4 + i * 3, cy + 4, 3, 2);
      }
      // Neck
      g.fillStyle(color);
      g.fillEllipse(cx - 2, cy - 6, 12, 14);
      // Head
      g.fillStyle(color);
      g.fillEllipse(cx - 2, cy - 16, 18, 12);
      // Horns — majestic
      g.fillStyle(0x442222);
      g.fillTriangle(cx - 8, cy - 22, cx - 6, cy - 16, cx - 12, cy - 16);
      g.fillTriangle(cx + 4, cy - 22, cx + 2, cy - 16, cx + 8, cy - 16);
      // Eyes
      g.fillStyle(0xffff00);
      g.fillCircle(cx - 6, cy - 18, 3);
      g.fillCircle(cx + 2, cy - 18, 3);
      g.fillStyle(0xff0000);
      g.fillCircle(cx - 6, cy - 17, 1.5);
      g.fillCircle(cx + 2, cy - 17, 1.5);
      // Snout
      g.fillStyle(darker);
      g.fillEllipse(cx - 2, cy - 12, 12, 6);
      // Nostrils with smoke
      g.fillStyle(0xff3300);
      g.fillCircle(cx - 5, cy - 12, 1.5);
      g.fillCircle(cx + 1, cy - 12, 1.5);
      // Fire from mouth
      g.fillStyle(0xff4400);
      g.fillTriangle(cx - 8, cy - 10, cx - 16, cy - 14, cx - 14, cy - 6);
      g.fillStyle(0xffaa00);
      g.fillTriangle(cx - 8, cy - 10, cx - 14, cy - 12, cx - 12, cy - 7);
      // Tail
      g.fillStyle(color);
      g.fillTriangle(cx + 10, cy + 12, cx + 20, cy + 14, cx + 12, cy + 6);
      g.fillStyle(darker);
      g.fillTriangle(cx + 18, cy + 12, cx + 22, cy + 10, cx + 22, cy + 16);
      // Clawed feet
      g.fillStyle(color);
      g.fillRect(cx - 8, cy + 14, 6, 6);
      g.fillRect(cx + 2, cy + 14, 6, 6);
      g.fillStyle(0x222222);
      g.fillTriangle(cx - 10, cy + 20, cx - 8, cy + 18, cx - 6, cy + 22);
      g.fillTriangle(cx + 8, cy + 20, cx + 6, cy + 18, cx + 4, cy + 22);
      break;
    }

    case 'chimera': {
      // Multi-headed beast: lion head, goat body, snake tail
      // Goat body
      g.fillStyle(color);
      g.fillEllipse(cx + 2, cy + 6, 26, 18);
      // Fur texture
      g.fillStyle(darker, 0.3);
      g.fillEllipse(cx, cy + 4, 18, 10);
      // Lion mane
      g.fillStyle(0xddaa44);
      g.fillCircle(cx - 8, cy - 6, 10);
      g.fillStyle(0xcc9933);
      g.fillCircle(cx - 8, cy - 6, 8);
      // Lion head
      g.fillStyle(0xddaa44);
      g.fillCircle(cx - 8, cy - 6, 7);
      // Lion eyes
      g.fillStyle(0xffffff);
      g.fillCircle(cx - 11, cy - 8, 2.5);
      g.fillCircle(cx - 5, cy - 8, 2.5);
      g.fillStyle(0x000000);
      g.fillCircle(cx - 10, cy - 7, 1.5);
      g.fillCircle(cx - 4, cy - 7, 1.5);
      // Lion nose and mouth
      g.fillStyle(0x884422);
      g.fillCircle(cx - 8, cy - 3, 2);
      g.lineStyle(1, 0x000000);
      g.lineBetween(cx - 10, cy - 1, cx - 8, cy);
      g.lineBetween(cx - 8, cy, cx - 6, cy - 1);
      // Goat head (right, smaller)
      g.fillStyle(0xccbbaa);
      g.fillCircle(cx + 10, cy - 6, 6);
      // Goat horns
      g.fillStyle(0x666655);
      g.fillTriangle(cx + 8, cy - 14, cx + 6, cy - 8, cx + 10, cy - 8);
      g.fillTriangle(cx + 14, cy - 14, cx + 12, cy - 8, cx + 16, cy - 8);
      // Goat eyes
      g.fillStyle(0xffff00);
      g.fillCircle(cx + 8, cy - 7, 2);
      g.fillCircle(cx + 12, cy - 7, 2);
      g.fillStyle(0x000000);
      g.fillRect(cx + 7, cy - 8, 2, 2);
      g.fillRect(cx + 11, cy - 8, 2, 2);
      // Snake tail
      g.fillStyle(0x446633);
      g.fillEllipse(cx + 14, cy + 10, 8, 6);
      g.fillEllipse(cx + 18, cy + 6, 6, 8);
      g.fillEllipse(cx + 20, cy, 5, 6);
      // Snake head at tail tip
      g.fillStyle(0x336622);
      g.fillCircle(cx + 20, cy - 4, 4);
      g.fillStyle(0xff0000);
      g.fillCircle(cx + 19, cy - 5, 1.5);
      g.fillCircle(cx + 22, cy - 5, 1.5);
      // Snake tongue
      g.fillStyle(0xff3333);
      g.fillRect(cx + 20, cy - 1, 1, 3);
      // Legs
      g.fillStyle(color);
      g.fillRect(cx - 8, cy + 12, 5, 8);
      g.fillRect(cx + 4, cy + 12, 5, 8);
      // Paws
      g.fillStyle(darker);
      g.fillEllipse(cx - 6, cy + 20, 6, 3);
      g.fillEllipse(cx + 6, cy + 20, 6, 3);
      break;
    }

    case 'boss': {
      // Demon King — imposing dark figure with crown, cape, magical aura
      // Magical aura (behind)
      g.fillStyle(0x440066, 0.3);
      g.fillCircle(cx, cy, 22);
      g.fillStyle(0x660088, 0.2);
      g.fillCircle(cx, cy - 2, 18);
      // Cape — flowing
      g.fillStyle(0x220033);
      g.fillTriangle(cx - 14, cy - 8, cx - 18, cy + 22, cx + 18, cy + 22);
      g.fillTriangle(cx + 14, cy - 8, cx + 18, cy + 22, cx - 18, cy + 22);
      // Cape inner
      g.fillStyle(0x880022);
      g.fillTriangle(cx - 10, cy - 4, cx - 12, cy + 18, cx + 12, cy + 18);
      g.fillTriangle(cx + 10, cy - 4, cx + 12, cy + 18, cx - 12, cy + 18);
      // Body
      g.fillStyle(color);
      g.fillRect(cx - 10, cy - 4, 20, 20);
      // Armor detail
      g.fillStyle(lighter);
      g.fillRect(cx - 8, cy - 2, 16, 2);
      g.fillStyle(0xffcc00);
      g.fillRect(cx - 2, cy, 4, 8);
      // Shoulder armor
      g.fillStyle(darker);
      g.fillEllipse(cx - 14, cy - 4, 10, 8);
      g.fillEllipse(cx + 14, cy - 4, 10, 8);
      g.fillStyle(0xffcc00, 0.5);
      g.fillCircle(cx - 14, cy - 4, 2);
      g.fillCircle(cx + 14, cy - 4, 2);
      // Head
      g.fillStyle(color);
      g.fillCircle(cx, cy - 14, 10);
      // Horns — large and curved
      g.fillStyle(0x440044);
      g.fillTriangle(cx - 10, cy - 22, cx - 6, cy - 14, cx - 14, cy - 10);
      g.fillTriangle(cx + 10, cy - 22, cx + 6, cy - 14, cx + 14, cy - 10);
      g.fillStyle(0x550055);
      g.fillTriangle(cx - 9, cy - 20, cx - 7, cy - 14, cx - 12, cy - 12);
      g.fillTriangle(cx + 9, cy - 20, cx + 7, cy - 14, cx + 12, cy - 12);
      // Eyes — burning
      g.fillStyle(0xff0000);
      g.fillCircle(cx - 4, cy - 16, 3.5);
      g.fillCircle(cx + 4, cy - 16, 3.5);
      g.fillStyle(0xffff00);
      g.fillCircle(cx - 4, cy - 16, 2);
      g.fillCircle(cx + 4, cy - 16, 2);
      g.fillStyle(0xffffff);
      g.fillCircle(cx - 4, cy - 16, 0.8);
      g.fillCircle(cx + 4, cy - 16, 0.8);
      // Mouth — sinister grin
      g.lineStyle(1.5, 0xff0000);
      g.lineBetween(cx - 4, cy - 10, cx - 1, cy - 8);
      g.lineBetween(cx - 1, cy - 8, cx + 1, cy - 10);
      g.lineBetween(cx + 1, cy - 10, cx + 4, cy - 8);
      // Crown — ornate
      g.fillStyle(0xffcc00);
      g.fillRect(cx - 8, cy - 24, 16, 3);
      g.fillTriangle(cx - 7, cy - 24, cx - 5, cy - 28, cx - 3, cy - 24);
      g.fillTriangle(cx - 2, cy - 24, cx, cy - 30, cx + 2, cy - 24);
      g.fillTriangle(cx + 3, cy - 24, cx + 5, cy - 28, cx + 7, cy - 24);
      // Crown jewels
      g.fillStyle(0xff0044);
      g.fillCircle(cx, cy - 28, 1.5);
      g.fillStyle(0x4400ff);
      g.fillCircle(cx - 5, cy - 26, 1);
      g.fillCircle(cx + 5, cy - 26, 1);
      // Staff in hand
      g.fillStyle(0x333333);
      g.fillRect(cx + 16, cy - 18, 3, 34);
      // Staff orb
      g.fillStyle(0x880088);
      g.fillCircle(cx + 17, cy - 20, 4);
      g.fillStyle(0xcc44cc);
      g.fillCircle(cx + 17, cy - 20, 2.5);
      g.fillStyle(0xffffff, 0.5);
      g.fillCircle(cx + 16, cy - 21, 1);
      // Magical particles
      g.fillStyle(0xcc44ff, 0.6);
      g.fillCircle(cx - 18, cy - 14, 1.5);
      g.fillCircle(cx + 20, cy - 10, 1);
      g.fillCircle(cx - 12, cy + 14, 1.5);
      g.fillCircle(cx + 16, cy + 8, 1);
      g.fillCircle(cx - 6, cy + 18, 1);
      break;
    }
  }
}

function generateTile(scene: Phaser.Scene, key: string, color: number, alt: number, decorator?: (g: Phaser.GameObjects.Graphics) => void): void {
  const s = 16;
  const g = scene.add.graphics().setVisible(false);
  g.fillStyle(color);
  g.fillRect(0, 0, s, s);
  // Detail pixels
  g.fillStyle(alt);
  for (let i = 0; i < 4; i++) {
    g.fillRect(Math.floor(Math.random() * 13) + 1, Math.floor(Math.random() * 13) + 1, 2, 2);
  }
  if (decorator) decorator(g);
  g.generateTexture(key, s, s);
  g.destroy();
}

function generateTilesets(scene: Phaser.Scene): void {
  // Overworld tiles: 0=grass, 1=path, 2=water, 3=tree, 4=mountain, 5=bridge, 6=town, 7=cave
  generateTile(scene, 'ow-0', 0x44aa44, 0x55bb55);
  generateTile(scene, 'ow-1', 0xccbb88, 0xbbaa77);
  generateTile(scene, 'ow-2', 0x2255cc, 0x3366dd, g => {
    g.fillStyle(0x4488ee, 0.4);
    g.fillRect(2, 6, 8, 2);
  });
  generateTile(scene, 'ow-3', 0x44aa44, 0x55bb55, g => {
    g.fillStyle(0x226622);
    g.fillEllipse(8, 5, 12, 10);
    g.fillStyle(0x115511);
    g.fillEllipse(8, 4, 10, 8);
    g.fillStyle(0x664422);
    g.fillRect(7, 10, 3, 5);
  });
  generateTile(scene, 'ow-4', 0x887766, 0x776655, g => {
    g.fillStyle(0x998877);
    g.fillTriangle(8, 1, 2, 12, 14, 12);
    g.fillStyle(0xcccccc);
    g.fillTriangle(8, 2, 5, 8, 11, 8);
  });
  generateTile(scene, 'ow-5', 0x996633, 0x885522, g => {
    g.fillStyle(0xaa7744);
    g.fillRect(0, 6, 16, 4);
    g.fillStyle(0x776633);
    g.fillRect(3, 7, 2, 2);
    g.fillRect(9, 7, 2, 2);
  });
  generateTile(scene, 'ow-6', 0x44aa44, 0x55bb55, g => {
    // Village cluster: multiple small houses
    // House 1 (left, larger)
    g.fillStyle(0xcc8844);
    g.fillRect(1, 7, 5, 6);
    g.fillStyle(0xcc4422);
    g.fillTriangle(3, 4, 0, 8, 7, 8);
    // House 2 (right, slightly behind)
    g.fillStyle(0xbb7733);
    g.fillRect(8, 5, 5, 7);
    g.fillStyle(0xbb3322);
    g.fillTriangle(10, 2, 7, 6, 14, 6);
    // House 3 (small, front-center)
    g.fillStyle(0xddaa55);
    g.fillRect(5, 10, 4, 4);
    g.fillStyle(0xcc4422);
    g.fillTriangle(7, 8, 4, 11, 10, 11);
    // Tiny path between
    g.fillStyle(0xccbb88);
    g.fillRect(6, 14, 2, 2);
  });
  generateTile(scene, 'ow-7', 0x44aa44, 0x55bb55, g => {
    g.fillStyle(0x666666);
    g.fillRect(2, 4, 12, 11);
    g.fillStyle(0x111111);
    g.fillEllipse(8, 8, 8, 7);
  });

  // Town tiles: 0=floor, 1=wall, 2=building, 3=grass, 4=water, 5=path, 6=save, 7=exit
  generateTile(scene, 'town-0', 0xaa9977, 0x998866);
  generateTile(scene, 'town-1', 0x664433, 0x553322, g => {
    g.lineStyle(1, 0x554422);
    g.lineBetween(0, 8, 16, 8);
  });
  // town-2: house roof tile (brown/red peaked roof with shingles)
  generateTile(scene, 'town-2', 0xcc5533, 0xbb4422, g => {
    // Peaked roof shape
    g.fillStyle(0xcc5533);
    g.fillRect(0, 4, 16, 12);
    g.fillStyle(0xbb4422);
    g.fillRect(0, 7, 16, 2);
    g.fillRect(0, 11, 16, 2);
    // Ridge line at top
    g.fillStyle(0xdd6644);
    g.fillRect(0, 3, 16, 2);
    // Eave shadow at bottom
    g.fillStyle(0x993322);
    g.fillRect(0, 14, 16, 2);
  });
  // town-9: house wall with window
  generateTile(scene, 'town-9', 0xddbb88, 0xccaa77, g => {
    // Warm wooden wall
    g.fillStyle(0xddbb88);
    g.fillRect(0, 0, 16, 16);
    // Horizontal planks
    g.fillStyle(0xccaa77);
    g.fillRect(0, 5, 16, 1);
    g.fillRect(0, 10, 16, 1);
    // Window frame
    g.fillStyle(0x664422);
    g.fillRect(4, 2, 8, 7);
    // Window glass
    g.fillStyle(0x88bbdd);
    g.fillRect(5, 3, 6, 5);
    // Window cross
    g.fillStyle(0x664422);
    g.fillRect(7, 3, 2, 5);
    g.fillRect(5, 5, 6, 1);
    // Window sill
    g.fillStyle(0xeeddbb);
    g.fillRect(3, 9, 10, 1);
  });
  // town-10: house wall with door
  generateTile(scene, 'town-10', 0xddbb88, 0xccaa77, g => {
    // Warm wooden wall
    g.fillStyle(0xddbb88);
    g.fillRect(0, 0, 16, 16);
    g.fillStyle(0xccaa77);
    g.fillRect(0, 5, 16, 1);
    g.fillRect(0, 10, 16, 1);
    // Door frame
    g.fillStyle(0x553311);
    g.fillRect(4, 3, 8, 13);
    // Door
    g.fillStyle(0x774422);
    g.fillRect(5, 4, 6, 12);
    // Door handle
    g.fillStyle(0xddaa33);
    g.fillRect(9, 10, 1, 1);
    // Door top arch
    g.fillStyle(0x553311);
    g.fillRect(6, 3, 4, 1);
  });
  // town-8: shop awning tile (blue with yellow/red striped awning)
  generateTile(scene, 'town-8', 0x5588bb, 0x4477aa, g => {
    // Blue wall upper
    g.fillStyle(0x5588bb);
    g.fillRect(0, 0, 16, 8);
    // Awning
    g.fillStyle(0xddcc44);
    g.fillRect(0, 8, 16, 6);
    g.fillStyle(0xcc4422);
    g.fillRect(0, 8, 5, 6);
    g.fillRect(10, 8, 6, 6);
    // Scalloped edge
    g.fillStyle(0xddcc44);
    g.fillRect(0, 14, 4, 2);
    g.fillRect(6, 14, 4, 2);
    g.fillRect(12, 14, 4, 2);
    // Sign text area
    g.fillStyle(0xffffff);
    g.fillRect(4, 2, 8, 5);
    g.fillStyle(0xffcc00);
    g.fillRect(5, 3, 2, 3); // coin icon
    g.fillStyle(0x4477aa);
    g.fillRect(8, 4, 3, 1); // text lines
    g.fillRect(8, 6, 2, 1);
  });
  // town-11: shop wall with display window
  generateTile(scene, 'town-11', 0x5588bb, 0x4477aa, g => {
    // Blue wall
    g.fillStyle(0x5588bb);
    g.fillRect(0, 0, 16, 16);
    // Display window
    g.fillStyle(0x443322);
    g.fillRect(2, 1, 12, 10);
    g.fillStyle(0xeeddcc);
    g.fillRect(3, 2, 10, 8);
    // Items on display
    g.fillStyle(0xcc4444);
    g.fillRect(4, 6, 3, 3); // potion
    g.fillStyle(0x88aacc);
    g.fillRect(9, 5, 2, 4); // sword
    // Base
    g.fillStyle(0x446688);
    g.fillRect(0, 12, 16, 4);
  });
  // town-12: shop open counter (Dragon Quest style — counter with dark interior)
  generateTile(scene, 'town-12', 0x5588bb, 0x4477aa, g => {
    // Dark interior behind counter
    g.fillStyle(0x223344);
    g.fillRect(0, 0, 16, 10);
    // Shelves in background
    g.fillStyle(0x334455);
    g.fillRect(2, 1, 12, 1);
    g.fillRect(2, 4, 12, 1);
    // Items on shelves
    g.fillStyle(0xcc4444);
    g.fillRect(3, 2, 2, 2); // red potion
    g.fillStyle(0x44cc44);
    g.fillRect(7, 2, 2, 2); // green item
    g.fillStyle(0x4488dd);
    g.fillRect(11, 2, 2, 2); // blue item
    // Wooden counter
    g.fillStyle(0x886633);
    g.fillRect(0, 10, 16, 4);
    g.fillStyle(0xaa8844);
    g.fillRect(0, 10, 16, 1); // counter top edge
    g.fillStyle(0x775522);
    g.fillRect(0, 13, 16, 1); // counter bottom edge
    // Floor below counter
    g.fillStyle(0xaa9977);
    g.fillRect(0, 14, 16, 2);
  });
  generateTile(scene, 'town-3', 0x44aa44, 0x55bb55);
  generateTile(scene, 'town-4', 0x2255cc, 0x3366dd);
  generateTile(scene, 'town-5', 0xccbb88, 0xbbaa77);
  // 6 = save crystal on path
  generateTile(scene, 'town-6', 0xccbb88, 0xbbaa77, g => {
    // Pedestal
    g.fillStyle(0x666666);
    g.fillRect(5, 12, 6, 3);
    g.fillStyle(0x777777);
    g.fillRect(6, 11, 4, 1);
    // Crystal (diamond shape)
    g.fillStyle(0x44bbff);
    g.fillTriangle(8, 2, 4, 8, 12, 8);
    g.fillTriangle(4, 8, 12, 8, 8, 12);
    // Highlight
    g.fillStyle(0x88ddff, 0.8);
    g.fillTriangle(8, 3, 5, 7, 8, 7);
    // Bright center
    g.fillStyle(0xffffff, 0.7);
    g.fillRect(7, 6, 2, 2);
  });
  // 7 = town exit — open gate/archway
  generateTile(scene, 'town-7', 0x44aa44, 0x55bb55, g => {
    // Stone gate posts
    g.fillStyle(0x888888);
    g.fillRect(1, 2, 3, 13);
    g.fillRect(12, 2, 3, 13);
    // Gate arch
    g.fillStyle(0x999999);
    g.fillRect(1, 1, 14, 2);
    // Dark opening
    g.fillStyle(0x554433);
    g.fillRect(4, 3, 8, 12);
    // Path through gate
    g.fillStyle(0xccbb88);
    g.fillRect(5, 10, 6, 5);
  });

  // Dungeon tiles: 0=floor, 1=wall, 2=cracked, 3=door, 4=treasure, 5=lava, 6=exit, 7=boss
  generateTile(scene, 'dng-0', 0x444444, 0x3a3a3a);
  generateTile(scene, 'dng-1', 0x222222, 0x1a1a1a, g => {
    g.lineStyle(1, 0x333333);
    g.lineBetween(0, 5, 16, 5);
    g.lineBetween(0, 11, 16, 11);
  });
  generateTile(scene, 'dng-2', 0x555555, 0x4a4a4a, g => {
    g.lineStyle(1, 0x333333);
    g.lineBetween(3, 3, 8, 10);
    g.lineBetween(10, 2, 13, 9);
  });
  // 3 = stone archway (boss room entrance) — two pillars with arch
  generateTile(scene, 'dng-3', 0x444444, 0x3a3a3a, g => {
    // Left pillar
    g.fillStyle(0x666666);
    g.fillRect(1, 2, 3, 12);
    g.fillStyle(0x777777);
    g.fillRect(1, 2, 3, 2); // pillar cap
    // Right pillar
    g.fillStyle(0x666666);
    g.fillRect(12, 2, 3, 12);
    g.fillStyle(0x777777);
    g.fillRect(12, 2, 3, 2); // pillar cap
    // Arch top
    g.fillStyle(0x777777);
    g.fillRect(1, 1, 14, 2);
    // Dark opening in center
    g.fillStyle(0x111111);
    g.fillRect(4, 3, 8, 11);
    // Warning symbol (skull-like)
    g.fillStyle(0xcc4444);
    g.fillCircle(8, 7, 2);
  });
  generateTile(scene, 'dng-4', 0x444444, 0x3a3a3a, g => {
    g.fillStyle(0xaa7722);
    g.fillRect(3, 6, 10, 8);
    g.fillStyle(0xffcc00);
    g.fillRect(4, 4, 8, 3);
    g.fillStyle(0x886611);
    g.fillRect(7, 7, 2, 2);
  });
  // 5 = lava — glowing orange/red with bubble detail
  generateTile(scene, 'dng-5', 0x331111, 0x221111, g => {
    // Lava glow base
    g.fillStyle(0xcc3300);
    g.fillRect(1, 1, 14, 14);
    // Bright flowing streaks
    g.fillStyle(0xff6600);
    g.fillRect(2, 3, 5, 3);
    g.fillRect(9, 8, 4, 3);
    g.fillRect(4, 10, 6, 2);
    // Hot bright spots (bubbles)
    g.fillStyle(0xffaa22);
    g.fillCircle(5, 5, 2);
    g.fillCircle(11, 10, 1);
    g.fillCircle(7, 12, 1);
    // Brightest center spot
    g.fillStyle(0xffdd44);
    g.fillCircle(5, 5, 1);
  });
  // 6 = stairs going up (dungeon exit)
  generateTile(scene, 'dng-6', 0x444444, 0x3a3a3a, g => {
    // Stairway shape — 4 steps ascending left to right
    g.fillStyle(0x888888);
    g.fillRect(2, 12, 12, 3);  // bottom step
    g.fillStyle(0x999999);
    g.fillRect(2, 9, 9, 3);    // second step
    g.fillStyle(0xaaaaaa);
    g.fillRect(2, 6, 6, 3);    // third step
    g.fillStyle(0xbbbbbb);
    g.fillRect(2, 3, 3, 3);    // top step
    // Step edges (darker lines)
    g.lineStyle(1, 0x555555);
    g.lineBetween(2, 12, 14, 12);
    g.lineBetween(2, 9, 11, 9);
    g.lineBetween(2, 6, 8, 6);
    g.lineBetween(2, 3, 5, 3);
    // Small up arrow hint
    g.fillStyle(0xffcc00);
    g.fillTriangle(4, 1, 2, 3, 6, 3);
  });
  // 7 = boss tile — menacing monster silhouette on dark fog
  generateTile(scene, 'dng-7', 0x444444, 0x3a3a3a, g => {
    // Dark purple fog on floor
    g.fillStyle(0x332244);
    g.fillRect(2, 3, 12, 11);
    g.fillStyle(0x2a1a3a);
    g.fillRect(4, 2, 8, 12);
    // Monster silhouette — hunched shadowy creature
    g.fillStyle(0x1a0a2a);
    g.fillRect(5, 4, 6, 8);     // body
    g.fillRect(4, 5, 8, 6);     // body wider
    g.fillRect(6, 3, 4, 2);     // head
    g.fillRect(3, 7, 2, 3);     // left arm
    g.fillRect(11, 7, 2, 3);    // right arm
    // Glowing red eyes
    g.fillStyle(0xff2222);
    g.fillRect(6, 4, 1, 1);     // left eye
    g.fillRect(9, 4, 1, 1);     // right eye
    // Energy wisps at edges
    g.fillStyle(0x6633aa);
    g.fillRect(2, 5, 1, 1);
    g.fillRect(13, 6, 1, 1);
    g.fillRect(3, 12, 1, 1);
    g.fillRect(12, 3, 1, 1);
  });
  // 8 = opened treasure chest (empty)
  generateTile(scene, 'dng-8', 0x444444, 0x3a3a3a, g => {
    g.fillStyle(0x665533);
    g.fillRect(3, 8, 10, 6);
    g.fillStyle(0x554422);
    g.fillRect(3, 4, 10, 5);
    g.lineStyle(1, 0x333322);
    g.lineBetween(3, 8, 13, 8);
  });
}

function generateUIAssets(scene: Phaser.Scene): void {
  // NPC sprite (simple villager)
  const gn = scene.add.graphics().setVisible(false);
  gn.fillStyle(0xddbb88); // skin
  gn.fillRect(6, 2, 4, 4);
  gn.fillStyle(0x553311); // hair
  gn.fillRect(5, 1, 6, 2);
  gn.fillStyle(0x44aa44); // clothes
  gn.fillRect(5, 6, 6, 6);
  gn.fillStyle(0x000000); // eyes
  gn.fillRect(7, 4, 1, 1);
  gn.fillRect(9, 4, 1, 1);
  gn.fillStyle(0x553311); // boots
  gn.fillRect(6, 12, 2, 3);
  gn.fillRect(8, 12, 2, 3);
  gn.generateTexture('npc', 16, 16);
  gn.destroy();

  // Save point — glowing crystal on pedestal
  const gs = scene.add.graphics().setVisible(false);
  // Pedestal base
  gs.fillStyle(0x666666);
  gs.fillRect(5, 12, 6, 3);
  gs.fillStyle(0x777777);
  gs.fillRect(6, 11, 4, 1);
  // Crystal body (diamond shape)
  gs.fillStyle(0x44bbff);
  gs.fillTriangle(8, 2, 4, 8, 12, 8);  // top half
  gs.fillTriangle(4, 8, 12, 8, 8, 12); // bottom half
  // Crystal highlight
  gs.fillStyle(0x88ddff, 0.8);
  gs.fillTriangle(8, 3, 5, 7, 8, 7);   // left shine
  // Bright center
  gs.fillStyle(0xffffff, 0.7);
  gs.fillRect(7, 6, 2, 2);
  // Sparkle dots
  gs.fillStyle(0xffffff, 0.9);
  gs.fillRect(3, 4, 1, 1);
  gs.fillRect(12, 5, 1, 1);
  gs.fillRect(6, 1, 1, 1);
  gs.generateTexture('save-point', 16, 16);
  gs.destroy();

  // Shop icon
  const gsh = scene.add.graphics().setVisible(false);
  gsh.fillStyle(0xddbb88);
  gsh.fillRect(6, 2, 4, 4);
  gsh.fillStyle(0x553311);
  gsh.fillRect(5, 1, 6, 2);
  gsh.fillStyle(0xcc8844);
  gsh.fillRect(5, 6, 6, 6);
  gsh.fillStyle(0x000000);
  gsh.fillRect(7, 4, 1, 1);
  gsh.fillRect(9, 4, 1, 1);
  gsh.fillStyle(0x553311);
  gsh.fillRect(6, 12, 2, 3);
  gsh.fillRect(8, 12, 2, 3);
  gsh.generateTexture('shopkeeper', 16, 16);
  gsh.destroy();
}
