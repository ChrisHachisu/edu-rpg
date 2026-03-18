import Phaser from 'phaser';
import type { HeroColorScheme } from './types';

// Procedural pixel art generator — creates all game sprites at runtime
// so we don't need any external image files

/** Wraps Phaser.Graphics so all drawing coordinates are multiplied by `s`,
 *  producing higher-resolution textures from the same drawing code. */
class ScaledGraphics {
  constructor(private g: Phaser.GameObjects.Graphics, private s: number) {}
  fillStyle(c: number, a?: number) { this.g.fillStyle(c, a); return this; }
  lineStyle(w: number, c: number, a?: number) { this.g.lineStyle(w * this.s, c, a); return this; }
  fillRect(x: number, y: number, w: number, h: number) { this.g.fillRect(x*this.s, y*this.s, w*this.s, h*this.s); return this; }
  fillCircle(x: number, y: number, r: number) { this.g.fillCircle(x*this.s, y*this.s, r*this.s); return this; }
  fillEllipse(x: number, y: number, w: number, h: number) { this.g.fillEllipse(x*this.s, y*this.s, w*this.s, h*this.s); return this; }
  fillTriangle(x1: number, y1: number, x2: number, y2: number, x3: number, y3: number) {
    this.g.fillTriangle(x1*this.s, y1*this.s, x2*this.s, y2*this.s, x3*this.s, y3*this.s); return this;
  }
  lineBetween(x1: number, y1: number, x2: number, y2: number) {
    this.g.lineBetween(x1*this.s, y1*this.s, x2*this.s, y2*this.s); return this;
  }
}

const SPRITE_SCALE = 2;

// Hero color scheme definitions
export const HERO_COLOR_SCHEMES: Record<HeroColorScheme, {
  armor: number; armorDark: number; helmet: number;
  plume: number; cape: number; capeDark: number;
  shield: number; shieldEdge: number;
}> = {
  gray:  { armor: 0x8899bb, armorDark: 0x667799, helmet: 0x7788aa, plume: 0xcc2222, cape: 0x2244aa, capeDark: 0x1a3388, shield: 0x2244aa, shieldEdge: 0xddaa33 },
  blue:  { armor: 0x4477dd, armorDark: 0x3355aa, helmet: 0x3366cc, plume: 0xffffff, cape: 0x2255cc, capeDark: 0x1a44aa, shield: 0x2255cc, shieldEdge: 0xccccdd },
  pink:  { armor: 0xcc6699, armorDark: 0xaa4477, helmet: 0xbb5588, plume: 0xffeeff, cape: 0xdd4488, capeDark: 0xbb3366, shield: 0xdd4488, shieldEdge: 0xffc0cb },
  black: { armor: 0x444455, armorDark: 0x333344, helmet: 0x333344, plume: 0xcc2222, cape: 0x222233, capeDark: 0x111122, shield: 0x333344, shieldEdge: 0x888899 },
};

export function generateAssets(scene: Phaser.Scene): void {
  generateHeroSprites(scene, 'gray');
  generateMonsterSprites(scene);
  generateTilesets(scene);
  generateUIAssets(scene);
}

/** Regenerate hero sprites with the given color scheme */
export function regenerateHeroSprites(scene: Phaser.Scene, scheme: HeroColorScheme): void {
  // Remove old texture if it exists
  if (scene.textures.exists('hero-walk')) {
    scene.textures.remove('hero-walk');
  }
  generateHeroSprites(scene, scheme);
}

function drawKnight(g: ScaledGraphics, ox: number, oy: number, dir: number, frame: number, scheme: HeroColorScheme = 'gray'): void {
  // dir: 0=down, 1=left, 2=right, 3=up
  // Knight colors from scheme
  const cs = HERO_COLOR_SCHEMES[scheme];
  const armor = cs.armor;
  const armorDark = cs.armorDark;
  const helmet = cs.helmet;
  const visor = 0x222233;      // Visor/face guard (always dark)
  const plume = cs.plume;
  const cape = cs.cape;
  const capeDark = cs.capeDark;
  const sword = 0xccccdd;      // Sword blade
  const hilt = 0xddaa33;       // Gold hilt
  const shield = cs.shield;
  const shieldEdge = cs.shieldEdge;
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
    // Sword in right hand (blade longer upward)
    g.fillStyle(sword);
    g.fillRect(ox + 11, oy + 4, 2, 7);
    g.fillStyle(hilt);
    g.fillRect(ox + 10, oy + 8, 4, 1);
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
    // Sword behind (blade longer upward)
    g.fillStyle(sword);
    g.fillRect(ox + 10, oy + 3, 1, 8);
    g.fillStyle(hilt);
    g.fillRect(ox + 9, oy + 8, 3, 1);
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
    // Sword in front (right side, blade longer upward)
    g.fillStyle(sword);
    g.fillRect(ox + 12, oy + 3, 1, 8);
    g.fillStyle(hilt);
    g.fillRect(ox + 11, oy + 8, 3, 1);
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
    // Sword on back (blade longer upward)
    g.fillStyle(sword);
    g.fillRect(ox + 11, oy + 2, 1, 9);
    g.fillStyle(hilt);
    g.fillRect(ox + 10, oy + 7, 3, 1);
    // Shield on back
    g.fillStyle(shield);
    g.fillRect(ox + 3, oy + 4, 2, 4);
    // Boots
    g.fillStyle(boots);
    g.fillRect(ox + 5 + legOffset, oy + 12, 3, 3);
    g.fillRect(ox + 8 - legOffset, oy + 12, 3, 3);
  }
}

function generateHeroSprites(scene: Phaser.Scene, scheme: HeroColorScheme = 'gray'): void {
  // Hero walking sprite sheet: 4 directions × 3 frames = 12 frames, each 16×16
  const g = scene.add.graphics().setVisible(false);
  const sg = new ScaledGraphics(g, SPRITE_SCALE);
  const frameW = 16, frameH = 16;

  for (let dir = 0; dir < 4; dir++) {
    for (let frame = 0; frame < 3; frame++) {
      const ox = (dir * 3 + frame) * frameW;
      drawKnight(sg, ox, 0, dir, frame, scheme);
    }
  }

  g.generateTexture('hero-walk', frameW * SPRITE_SCALE * 12, frameH * SPRITE_SCALE);
  g.destroy();

  // Add frames manually for animation
  for (let i = 0; i < 12; i++) {
    scene.textures.get('hero-walk').add(i, 0, i * frameW * SPRITE_SCALE, 0, frameW * SPRITE_SCALE, frameH * SPRITE_SCALE);
  }
}

function generateMonsterSprites(scene: Phaser.Scene): void {
  const monsterDefs: { key: string; color: number; shape: string }[] = [
    // Act 1 — early
    { key: 'monster-slime', color: 0x44cc88, shape: 'slime' },
    { key: 'monster-bug', color: 0x886622, shape: 'bug' },
    { key: 'monster-rabbit', color: 0xccaa88, shape: 'rabbit' },
    { key: 'monster-wolf', color: 0x555577, shape: 'wolf' },
    { key: 'monster-mushroom', color: 0xaa44aa, shape: 'mushroom' },
    { key: 'monster-bandit', color: 0x774422, shape: 'knight' },
    { key: 'monster-bat', color: 0x443355, shape: 'harpy' },
    { key: 'monster-spider', color: 0x333333, shape: 'spider' },
    { key: 'monster-crab', color: 0xcc4422, shape: 'crab' },
    { key: 'monster-golem', color: 0x888877, shape: 'golem' },
    { key: 'monster-giantToad', color: 0x337722, shape: 'slime' },
    { key: 'monster-serpent', color: 0x2266aa, shape: 'serpent' },
    // Act 2
    { key: 'monster-jellyfish', color: 0x8844cc, shape: 'slime' },
    { key: 'monster-piranha', color: 0x4488cc, shape: 'crab' },
    { key: 'monster-merfolk', color: 0x22aa88, shape: 'serpent' },
    { key: 'monster-harpy', color: 0xddaadd, shape: 'harpy' },
    { key: 'monster-wyvern', color: 0x44aa66, shape: 'wyvern' },
    { key: 'monster-kraken', color: 0x552288, shape: 'serpent' },
    { key: 'monster-stormHarpy', color: 0x6644aa, shape: 'harpy' },
    { key: 'monster-dragon', color: 0xcc2222, shape: 'dragon' },
    // Act 3
    { key: 'monster-blizzardBear', color: 0xaaccee, shape: 'wolf' },
    { key: 'monster-iceSprite', color: 0x88ddff, shape: 'slime' },
    { key: 'monster-darkSorcerer', color: 0x223366, shape: 'boss' },
    { key: 'monster-iceWyrm', color: 0x66aadd, shape: 'dragon' },
    // Act 4
    { key: 'monster-lizard', color: 0xcc6622, shape: 'lizard' },
    { key: 'monster-knight', color: 0x332244, shape: 'knight' },
    { key: 'monster-skeleton', color: 0xccccbb, shape: 'knight' },
    { key: 'monster-wraith', color: 0x775599, shape: 'boss' },
    { key: 'monster-fireElemental', color: 0xff6622, shape: 'slime' },
    { key: 'monster-lavaGolem', color: 0xcc3311, shape: 'golem' },
    { key: 'monster-lich', color: 0x225533, shape: 'boss' },
    { key: 'monster-flameTitan', color: 0xee4400, shape: 'golem' },
    { key: 'monster-lavaWyrm', color: 0xff5511, shape: 'lava-wyrm' },
    // Act 5
    { key: 'monster-chimera', color: 0x996633, shape: 'chimera' },
    { key: 'monster-demon', color: 0x881122, shape: 'chimera' },
    { key: 'monster-shadow', color: 0x221133, shape: 'wolf' },
    { key: 'monster-demonKing', color: 0x660066, shape: 'boss' },
    // Legendary bosses
    { key: 'monster-swordWraith', color: 0x4466aa, shape: 'knight' },
    { key: 'monster-celestialGuardian', color: 0xddcc88, shape: 'boss' },
  ];

  const size = 48; // Monster sprite size

  for (const def of monsterDefs) {
    const g = scene.add.graphics().setVisible(false);
    const sg = new ScaledGraphics(g, SPRITE_SCALE);
    drawMonster(sg, def.shape, def.color, size);
    g.generateTexture(def.key, size * SPRITE_SCALE, size * SPRITE_SCALE);
    g.destroy();
  }
}

function drawMonster(g: ScaledGraphics, shape: string, color: number, size: number): void {
  const cx = size / 2;
  const cy = size / 2;
  const darker = Phaser.Display.Color.IntegerToColor(color).darken(30).color;
  const lighter = Phaser.Display.Color.IntegerToColor(color).lighten(30).color;
  const lightest = Phaser.Display.Color.IntegerToColor(color).lighten(50).color;

  switch (shape) {
    case 'slime': {
      // Classic Dragon Quest-style bouncy slime
      // Shadow on ground
      g.fillStyle(darker, 0.3);
      g.fillEllipse(cx, cy + 20, 28, 6);
      // Body base — wide bottom, tapered top (droplet)
      g.fillStyle(color);
      g.fillEllipse(cx, cy + 10, 34, 22);  // wide base
      g.fillEllipse(cx, cy + 4, 30, 22);   // mid body
      g.fillEllipse(cx, cy - 2, 24, 18);   // upper body
      g.fillEllipse(cx, cy - 6, 16, 12);   // top taper
      // Underside shadow
      g.fillStyle(darker, 0.4);
      g.fillEllipse(cx, cy + 16, 30, 10);
      // Body highlight — left side sheen
      g.fillStyle(lighter);
      g.fillEllipse(cx - 5, cy - 1, 18, 16);
      g.fillStyle(lighter, 0.5);
      g.fillEllipse(cx - 6, cy - 4, 12, 10);
      // Top shine spot
      g.fillStyle(lightest, 0.7);
      g.fillEllipse(cx - 7, cy - 6, 7, 5);
      g.fillStyle(0xffffff, 0.6);
      g.fillCircle(cx - 7, cy - 7, 2.5);
      // Drip detail on right side
      g.fillStyle(color);
      g.fillEllipse(cx + 12, cy + 16, 5, 7);
      g.fillStyle(lighter, 0.3);
      g.fillEllipse(cx + 11, cy + 14, 3, 4);
      // Big cute eyes — white sclera
      g.fillStyle(0xffffff);
      g.fillEllipse(cx - 7, cy + 2, 11, 10);
      g.fillEllipse(cx + 7, cy + 2, 11, 10);
      // Pupils — large and round
      g.fillStyle(0x111122);
      g.fillCircle(cx - 5, cy + 3, 4);
      g.fillCircle(cx + 8, cy + 3, 4);
      // Inner pupil detail
      g.fillStyle(0x000000);
      g.fillCircle(cx - 5, cy + 4, 2.5);
      g.fillCircle(cx + 8, cy + 4, 2.5);
      // Eye shine — two highlights per eye
      g.fillStyle(0xffffff);
      g.fillCircle(cx - 7, cy + 1, 2);
      g.fillCircle(cx + 6, cy + 1, 2);
      g.fillCircle(cx - 4, cy + 4, 1);
      g.fillCircle(cx + 9, cy + 4, 1);
      // Cute smile
      g.lineStyle(1.5, 0x000000, 0.8);
      g.lineBetween(cx - 4, cy + 10, cx - 1, cy + 12);
      g.lineBetween(cx - 1, cy + 12, cx + 2, cy + 12);
      g.lineBetween(cx + 2, cy + 12, cx + 5, cy + 10);
      // Cheek blush
      g.fillStyle(0xff8888, 0.3);
      g.fillEllipse(cx - 12, cy + 6, 6, 4);
      g.fillEllipse(cx + 12, cy + 6, 6, 4);
      break;
    }

    case 'bug': {
      // Anatomically detailed beetle
      // Shadow
      g.fillStyle(darker, 0.2);
      g.fillEllipse(cx, cy + 21, 26, 5);
      // Abdomen (rear, partially hidden)
      g.fillStyle(darker);
      g.fillEllipse(cx + 2, cy + 10, 22, 14);
      // Shell (elytra) — two halves with gap
      g.fillStyle(color);
      g.fillEllipse(cx - 5, cy + 4, 16, 18);
      g.fillEllipse(cx + 5, cy + 4, 16, 18);
      // Shell seam line
      g.lineStyle(1, darker, 0.8);
      g.lineBetween(cx, cy - 4, cx, cy + 12);
      // Shell sheen — left
      g.fillStyle(lighter, 0.5);
      g.fillEllipse(cx - 7, cy, 6, 10);
      // Shell sheen — right
      g.fillStyle(lighter, 0.3);
      g.fillEllipse(cx + 4, cy - 1, 4, 7);
      // Shell edge highlight
      g.fillStyle(lightest, 0.3);
      g.fillEllipse(cx - 8, cy - 2, 3, 5);
      // Pronotum (thorax plate)
      g.fillStyle(darker);
      g.fillEllipse(cx, cy - 7, 18, 8);
      g.fillStyle(color, 0.6);
      g.fillEllipse(cx, cy - 8, 12, 5);
      // Head
      g.fillStyle(darker);
      g.fillEllipse(cx, cy - 13, 14, 10);
      // Compound eyes — bulging
      g.fillStyle(0xcc1100);
      g.fillEllipse(cx - 6, cy - 14, 5, 6);
      g.fillEllipse(cx + 6, cy - 14, 5, 6);
      g.fillStyle(0xff3322);
      g.fillEllipse(cx - 7, cy - 15, 3, 4);
      g.fillEllipse(cx + 5, cy - 15, 3, 4);
      g.fillStyle(0xff8866, 0.5);
      g.fillCircle(cx - 7, cy - 16, 1.5);
      g.fillCircle(cx + 5, cy - 16, 1.5);
      // Mandibles — curved pincers
      g.fillStyle(0x664422);
      g.fillEllipse(cx - 5, cy - 8, 4, 3);
      g.fillEllipse(cx + 5, cy - 8, 4, 3);
      g.fillStyle(0x553311);
      g.fillTriangle(cx - 7, cy - 9, cx - 3, cy - 7, cx - 9, cy - 5);
      g.fillTriangle(cx + 7, cy - 9, cx + 3, cy - 7, cx + 9, cy - 5);
      // Antennae — segmented with club tips
      g.lineStyle(1.5, darker);
      g.lineBetween(cx - 4, cy - 17, cx - 8, cy - 20);
      g.lineBetween(cx - 8, cy - 20, cx - 12, cy - 22);
      g.lineBetween(cx + 4, cy - 17, cx + 8, cy - 20);
      g.lineBetween(cx + 8, cy - 20, cx + 12, cy - 22);
      g.fillStyle(darker);
      g.fillEllipse(cx - 12, cy - 22, 4, 3);
      g.fillEllipse(cx + 12, cy - 22, 4, 3);
      // 6 segmented legs (3 per side)
      g.lineStyle(1.5, 0x553311);
      g.lineBetween(cx - 10, cy + 1, cx - 16, cy - 2);
      g.lineBetween(cx - 16, cy - 2, cx - 19, cy + 8);
      g.lineBetween(cx - 12, cy + 6, cx - 18, cy + 6);
      g.lineBetween(cx - 18, cy + 6, cx - 20, cy + 14);
      g.lineBetween(cx - 10, cy + 11, cx - 16, cy + 12);
      g.lineBetween(cx - 16, cy + 12, cx - 18, cy + 19);
      g.lineBetween(cx + 10, cy + 1, cx + 16, cy - 2);
      g.lineBetween(cx + 16, cy - 2, cx + 19, cy + 8);
      g.lineBetween(cx + 12, cy + 6, cx + 18, cy + 6);
      g.lineBetween(cx + 18, cy + 6, cx + 20, cy + 14);
      g.lineBetween(cx + 10, cy + 11, cx + 16, cy + 12);
      g.lineBetween(cx + 16, cy + 12, cx + 18, cy + 19);
      // Leg feet
      g.fillStyle(0x553311);
      g.fillCircle(cx - 19, cy + 8, 1.5);
      g.fillCircle(cx - 20, cy + 14, 1.5);
      g.fillCircle(cx - 18, cy + 19, 1.5);
      g.fillCircle(cx + 19, cy + 8, 1.5);
      g.fillCircle(cx + 20, cy + 14, 1.5);
      g.fillCircle(cx + 18, cy + 19, 1.5);
      break;
    }

    case 'rabbit': {
      // Fierce combat rabbit — Monty Python killer rabbit
      // Shadow
      g.fillStyle(darker, 0.2);
      g.fillEllipse(cx, cy + 22, 22, 4);
      // Hind legs — muscular, crouched
      g.fillStyle(color);
      g.fillEllipse(cx - 8, cy + 12, 12, 10);
      g.fillEllipse(cx + 8, cy + 12, 12, 10);
      g.fillStyle(darker);
      g.fillEllipse(cx - 10, cy + 16, 7, 4);
      g.fillEllipse(cx + 10, cy + 16, 7, 4);
      // Big hind feet
      g.fillStyle(color);
      g.fillEllipse(cx - 12, cy + 20, 10, 4);
      g.fillEllipse(cx + 12, cy + 20, 10, 4);
      g.fillStyle(lighter);
      g.fillEllipse(cx - 13, cy + 20, 4, 2);
      g.fillEllipse(cx + 11, cy + 20, 4, 2);
      // Body — muscular torso
      g.fillStyle(color);
      g.fillEllipse(cx, cy + 6, 24, 20);
      // Chest — lighter
      g.fillStyle(lighter);
      g.fillEllipse(cx, cy + 4, 16, 14);
      g.fillStyle(lightest, 0.3);
      g.fillEllipse(cx, cy + 2, 10, 8);
      // Fluffy tail
      g.fillStyle(0xffffff);
      g.fillCircle(cx + 14, cy + 8, 5);
      g.fillStyle(lightest);
      g.fillCircle(cx + 13, cy + 7, 3.5);
      g.fillStyle(0xffffff, 0.5);
      g.fillCircle(cx + 12, cy + 6, 2);
      // Front paws — clawed
      g.fillStyle(color);
      g.fillEllipse(cx - 8, cy + 14, 6, 5);
      g.fillEllipse(cx + 8, cy + 14, 6, 5);
      g.fillStyle(darker);
      g.fillCircle(cx - 10, cy + 15, 1);
      g.fillCircle(cx - 8, cy + 16, 1);
      g.fillCircle(cx + 10, cy + 15, 1);
      g.fillCircle(cx + 8, cy + 16, 1);
      // Head — round, slightly aggressive forward tilt
      g.fillStyle(color);
      g.fillCircle(cx, cy - 6, 11);
      g.fillStyle(lighter);
      g.fillEllipse(cx, cy - 3, 10, 7);
      // Long upright ears
      g.fillStyle(color);
      g.fillEllipse(cx - 6, cy - 20, 7, 16);
      g.fillEllipse(cx + 6, cy - 20, 7, 16);
      // Ear tips darker
      g.fillStyle(darker);
      g.fillEllipse(cx - 6, cy - 26, 4, 4);
      g.fillEllipse(cx + 6, cy - 26, 4, 4);
      // Inner ear pink
      g.fillStyle(0xffaaaa);
      g.fillEllipse(cx - 6, cy - 19, 4, 12);
      g.fillEllipse(cx + 6, cy - 19, 4, 12);
      g.fillStyle(0xff8888, 0.5);
      g.fillEllipse(cx - 6, cy - 18, 2, 8);
      g.fillEllipse(cx + 6, cy - 18, 2, 8);
      // Fierce eyes — angry brow angle
      g.fillStyle(0xffffff);
      g.fillEllipse(cx - 4, cy - 8, 7, 6);
      g.fillEllipse(cx + 4, cy - 8, 7, 6);
      // Red irises
      g.fillStyle(0xcc0000);
      g.fillCircle(cx - 4, cy - 7, 2.5);
      g.fillCircle(cx + 4, cy - 7, 2.5);
      g.fillStyle(0x880000);
      g.fillCircle(cx - 4, cy - 7, 1.5);
      g.fillCircle(cx + 4, cy - 7, 1.5);
      // Eye shine
      g.fillStyle(0xffffff);
      g.fillCircle(cx - 5, cy - 9, 1.5);
      g.fillCircle(cx + 3, cy - 9, 1.5);
      // Angry eyebrows
      g.lineStyle(2, darker);
      g.lineBetween(cx - 8, cy - 12, cx - 2, cy - 10);
      g.lineBetween(cx + 8, cy - 12, cx + 2, cy - 10);
      // Nose
      g.fillStyle(0xff6666);
      g.fillEllipse(cx, cy - 3, 3, 2.5);
      // Bared teeth — menacing grin
      g.fillStyle(0xffffff);
      g.fillRect(cx - 4, cy - 1, 3, 3);
      g.fillRect(cx + 1, cy - 1, 3, 3);
      // Fang points
      g.fillStyle(0xffffff);
      g.fillTriangle(cx - 4, cy + 2, cx - 2, cy + 2, cx - 3, cy + 4);
      g.fillTriangle(cx + 2, cy + 2, cx + 4, cy + 2, cx + 3, cy + 4);
      // Blood splatter on mouth
      g.fillStyle(0xcc0000, 0.6);
      g.fillCircle(cx - 1, cy + 3, 1);
      g.fillCircle(cx + 3, cy + 1, 0.8);
      // Whiskers
      g.lineStyle(1, 0x000000, 0.3);
      g.lineBetween(cx - 3, cy - 2, cx - 12, cy - 4);
      g.lineBetween(cx - 3, cy - 1, cx - 12, cy);
      g.lineBetween(cx + 3, cy - 2, cx + 12, cy - 4);
      g.lineBetween(cx + 3, cy - 1, cx + 12, cy);
      break;
    }

    case 'wolf': {
      // Shadowy predator wolf — sleek side profile
      // Shadow
      g.fillStyle(darker, 0.2);
      g.fillEllipse(cx + 2, cy + 22, 28, 4);
      // Bushy tail — layered for volume
      g.fillStyle(darker);
      g.fillEllipse(cx + 18, cy + 2, 10, 8);
      g.fillEllipse(cx + 20, cy - 2, 8, 6);
      g.fillStyle(color);
      g.fillEllipse(cx + 17, cy + 1, 8, 6);
      g.fillStyle(lighter, 0.3);
      g.fillEllipse(cx + 19, cy - 1, 4, 3);
      // Hind legs
      g.fillStyle(color);
      g.fillEllipse(cx + 8, cy + 12, 8, 14);
      g.fillStyle(darker);
      g.fillRect(cx + 6, cy + 16, 5, 6);
      g.fillStyle(darker);
      g.fillEllipse(cx + 8, cy + 22, 6, 3);
      // Body — sleek muscular
      g.fillStyle(color);
      g.fillEllipse(cx + 2, cy + 6, 30, 18);
      // Belly lighter
      g.fillStyle(lighter, 0.4);
      g.fillEllipse(cx, cy + 10, 22, 8);
      // Fur ridge along back — spiky silhouette
      g.fillStyle(darker);
      g.fillTriangle(cx - 4, cy - 1, cx - 1, cy - 6, cx + 2, cy - 1);
      g.fillTriangle(cx + 1, cy - 1, cx + 4, cy - 7, cx + 7, cy - 1);
      g.fillTriangle(cx + 6, cy, cx + 9, cy - 5, cx + 12, cy);
      g.fillTriangle(cx + 10, cy + 1, cx + 13, cy - 3, cx + 16, cy + 1);
      // Front legs
      g.fillStyle(color);
      g.fillEllipse(cx - 6, cy + 12, 7, 14);
      g.fillStyle(darker);
      g.fillRect(cx - 8, cy + 16, 5, 6);
      g.fillStyle(darker);
      g.fillEllipse(cx - 6, cy + 22, 6, 3);
      // Head — angular, predatory
      g.fillStyle(color);
      g.fillEllipse(cx - 10, cy - 2, 18, 16);
      // Snout — elongated
      g.fillStyle(color);
      g.fillEllipse(cx - 16, cy + 2, 12, 8);
      g.fillStyle(lighter);
      g.fillEllipse(cx - 16, cy + 3, 10, 6);
      // Jaw line
      g.fillStyle(darker, 0.3);
      g.fillEllipse(cx - 15, cy + 5, 10, 3);
      // Ears — tall pointed
      g.fillStyle(color);
      g.fillTriangle(cx - 12, cy - 16, cx - 7, cy - 6, cx - 16, cy - 4);
      g.fillTriangle(cx - 4, cy - 16, cx + 1, cy - 6, cx - 8, cy - 4);
      // Inner ear
      g.fillStyle(darker);
      g.fillTriangle(cx - 12, cy - 14, cx - 8, cy - 7, cx - 15, cy - 5);
      g.fillTriangle(cx - 4, cy - 14, cx, cy - 7, cx - 7, cy - 5);
      // Glowing yellow eyes — intense
      g.fillStyle(0x000000);
      g.fillEllipse(cx - 10, cy - 5, 7, 6);
      g.fillEllipse(cx - 3, cy - 5, 7, 6);
      g.fillStyle(0xffee00);
      g.fillEllipse(cx - 10, cy - 5, 6, 5);
      g.fillEllipse(cx - 3, cy - 5, 6, 5);
      // Slit pupils
      g.fillStyle(0x000000);
      g.fillEllipse(cx - 10, cy - 5, 2, 4);
      g.fillEllipse(cx - 3, cy - 5, 2, 4);
      // Eye glow effect
      g.fillStyle(0xffff88, 0.3);
      g.fillCircle(cx - 10, cy - 5, 5);
      g.fillCircle(cx - 3, cy - 5, 5);
      // Nose
      g.fillStyle(0x111111);
      g.fillEllipse(cx - 20, cy + 1, 4, 3);
      g.fillStyle(0x222222);
      g.fillCircle(cx - 20, cy + 1, 1.5);
      // Visible fangs — upper and lower
      g.fillStyle(0xffffff);
      g.fillTriangle(cx - 18, cy + 4, cx - 16, cy + 4, cx - 17, cy + 8);
      g.fillTriangle(cx - 14, cy + 4, cx - 12, cy + 4, cx - 13, cy + 7);
      g.fillTriangle(cx - 10, cy + 4, cx - 8, cy + 4, cx - 9, cy + 7);
      // Drool
      g.fillStyle(0xffffff, 0.4);
      g.fillEllipse(cx - 16, cy + 8, 1.5, 3);
      break;
    }

    case 'mushroom': {
      // Toxic mushroom enemy — large spotted cap, evil face
      // Tiny feet at bottom
      g.fillStyle(0x887766);
      g.fillEllipse(cx - 5, cy + 20, 5, 3);
      g.fillEllipse(cx + 5, cy + 20, 5, 3);
      // Stem — thick, fleshy
      g.fillStyle(0xeeddcc);
      g.fillEllipse(cx, cy + 12, 14, 18);
      // Stem shading left
      g.fillStyle(0xddccbb, 0.6);
      g.fillEllipse(cx - 4, cy + 12, 6, 14);
      // Stem highlight right
      g.fillStyle(0xffeedd, 0.4);
      g.fillEllipse(cx + 3, cy + 10, 4, 10);
      // Stem ring/skirt
      g.fillStyle(0xddccaa);
      g.fillEllipse(cx, cy + 6, 18, 4);
      g.fillStyle(0xccbb99, 0.5);
      g.fillEllipse(cx, cy + 7, 16, 3);
      // Cap — large domed, layered for depth
      g.fillStyle(darker);
      g.fillEllipse(cx, cy - 2, 38, 24);
      g.fillStyle(color);
      g.fillEllipse(cx, cy - 3, 36, 22);
      // Cap top highlight dome
      g.fillStyle(lighter);
      g.fillEllipse(cx - 2, cy - 7, 26, 14);
      g.fillStyle(lightest, 0.3);
      g.fillEllipse(cx - 4, cy - 9, 16, 8);
      // Cap underside — gill lines
      g.fillStyle(0xddccbb, 0.4);
      g.fillEllipse(cx, cy + 6, 30, 6);
      g.lineStyle(1, 0xccbbaa, 0.3);
      g.lineBetween(cx - 12, cy + 5, cx - 6, cy + 8);
      g.lineBetween(cx - 8, cy + 5, cx - 3, cy + 8);
      g.lineBetween(cx + 8, cy + 5, cx + 3, cy + 8);
      g.lineBetween(cx + 12, cy + 5, cx + 6, cy + 8);
      // Spots on cap — various sizes
      g.fillStyle(lightest);
      g.fillCircle(cx - 9, cy - 7, 4);
      g.fillCircle(cx + 7, cy - 9, 3.5);
      g.fillCircle(cx + 1, cy - 3, 2.5);
      g.fillCircle(cx - 14, cy - 2, 2);
      g.fillCircle(cx + 13, cy - 4, 2);
      g.fillCircle(cx - 4, cy - 12, 2);
      g.fillCircle(cx + 10, cy - 1, 1.5);
      // Spot shading
      g.fillStyle(lighter, 0.3);
      g.fillCircle(cx - 10, cy - 8, 2);
      g.fillCircle(cx + 6, cy - 10, 2);
      // Spore particles floating
      g.fillStyle(lighter, 0.5);
      g.fillCircle(cx - 16, cy - 14, 1.5);
      g.fillCircle(cx + 12, cy - 16, 1);
      g.fillCircle(cx + 18, cy - 10, 1.5);
      g.fillCircle(cx - 8, cy - 18, 1);
      g.fillCircle(cx + 4, cy - 20, 1);
      // Evil face peering from under cap
      g.fillStyle(0xffffff);
      g.fillEllipse(cx - 5, cy + 2, 7, 6);
      g.fillEllipse(cx + 5, cy + 2, 7, 6);
      g.fillStyle(0x000000);
      g.fillCircle(cx - 5, cy + 3, 2.5);
      g.fillCircle(cx + 5, cy + 3, 2.5);
      // Tiny pupil glint
      g.fillStyle(0xffffff);
      g.fillCircle(cx - 6, cy + 2, 1);
      g.fillCircle(cx + 4, cy + 2, 1);
      // Angry eyebrows — slanted under cap rim
      g.lineStyle(2, 0x000000, 0.8);
      g.lineBetween(cx - 9, cy - 1, cx - 3, cy + 0.5);
      g.lineBetween(cx + 9, cy - 1, cx + 3, cy + 0.5);
      // Wicked jagged grin
      g.lineStyle(1.5, 0x000000);
      g.lineBetween(cx - 5, cy + 7, cx - 3, cy + 5);
      g.lineBetween(cx - 3, cy + 5, cx - 1, cy + 7);
      g.lineBetween(cx - 1, cy + 7, cx + 1, cy + 5);
      g.lineBetween(cx + 1, cy + 5, cx + 3, cy + 7);
      g.lineBetween(cx + 3, cy + 7, cx + 5, cy + 5);
      break;
    }

    case 'spider': {
      // Large menacing spider with 8 articulated legs
      // Shadow
      g.fillStyle(darker, 0.15);
      g.fillEllipse(cx, cy + 18, 30, 6);
      // Abdomen — large, round
      g.fillStyle(color);
      g.fillEllipse(cx + 4, cy + 8, 22, 18);
      // Abdomen underside shadow
      g.fillStyle(darker, 0.4);
      g.fillEllipse(cx + 4, cy + 12, 18, 10);
      // Abdomen top highlight
      g.fillStyle(lighter, 0.3);
      g.fillEllipse(cx + 3, cy + 4, 14, 10);
      // Abdomen markings — hourglass/skull pattern
      g.fillStyle(darker);
      g.fillEllipse(cx + 4, cy + 5, 10, 7);
      g.fillStyle(0xcc2222);
      g.fillTriangle(cx + 4, cy + 1, cx, cy + 7, cx + 8, cy + 7);
      g.fillTriangle(cx + 4, cy + 10, cx + 1, cy + 6, cx + 7, cy + 6);
      // Pedicel (waist connection)
      g.fillStyle(darker);
      g.fillEllipse(cx - 2, cy + 1, 6, 4);
      // Cephalothorax — smaller front body
      g.fillStyle(color);
      g.fillEllipse(cx - 5, cy - 4, 16, 14);
      // Cephalothorax highlight
      g.fillStyle(lighter, 0.3);
      g.fillEllipse(cx - 6, cy - 6, 10, 8);
      // Multiple eyes — 2 large + 4 small
      // Large front eyes
      g.fillStyle(0x111111);
      g.fillCircle(cx - 7, cy - 6, 3);
      g.fillCircle(cx - 1, cy - 6, 3);
      g.fillStyle(0xdd0000);
      g.fillCircle(cx - 7, cy - 6, 2);
      g.fillCircle(cx - 1, cy - 6, 2);
      g.fillStyle(0xff2200);
      g.fillCircle(cx - 8, cy - 7, 1);
      g.fillCircle(cx - 2, cy - 7, 1);
      // Small side eyes
      g.fillStyle(0x111111);
      g.fillCircle(cx - 10, cy - 4, 2);
      g.fillCircle(cx + 2, cy - 4, 2);
      g.fillStyle(0xff4400);
      g.fillCircle(cx - 10, cy - 4, 1.2);
      g.fillCircle(cx + 2, cy - 4, 1.2);
      // Tiny top eyes
      g.fillStyle(0xff2200);
      g.fillCircle(cx - 6, cy - 9, 1);
      g.fillCircle(cx - 2, cy - 9, 1);
      // Chelicerae/fangs — prominent
      g.fillStyle(0x222211);
      g.fillEllipse(cx - 7, cy + 1, 4, 5);
      g.fillEllipse(cx - 1, cy + 1, 4, 5);
      g.fillStyle(0xddddcc);
      g.fillTriangle(cx - 8, cy + 2, cx - 6, cy + 2, cx - 7, cy + 7);
      g.fillTriangle(cx - 2, cy + 2, cx, cy + 2, cx - 1, cy + 7);
      // 8 articulated legs (3 segments each)
      g.lineStyle(2, darker);
      // Left leg 1 (front)
      g.lineBetween(cx - 10, cy - 5, cx - 16, cy - 14);
      g.lineBetween(cx - 16, cy - 14, cx - 20, cy - 8);
      g.lineBetween(cx - 20, cy - 8, cx - 22, cy + 2);
      // Left leg 2
      g.lineBetween(cx - 11, cy - 2, cx - 17, cy - 8);
      g.lineBetween(cx - 17, cy - 8, cx - 20, cy - 2);
      g.lineBetween(cx - 20, cy - 2, cx - 21, cy + 8);
      // Left leg 3
      g.lineBetween(cx - 10, cy + 1, cx - 16, cy - 1);
      g.lineBetween(cx - 16, cy - 1, cx - 19, cy + 4);
      g.lineBetween(cx - 19, cy + 4, cx - 18, cy + 14);
      // Left leg 4 (rear)
      g.lineBetween(cx - 6, cy + 6, cx - 12, cy + 5);
      g.lineBetween(cx - 12, cy + 5, cx - 15, cy + 10);
      g.lineBetween(cx - 15, cy + 10, cx - 14, cy + 18);
      // Right leg 1 (front)
      g.lineBetween(cx + 2, cy - 5, cx + 10, cy - 14);
      g.lineBetween(cx + 10, cy - 14, cx + 14, cy - 8);
      g.lineBetween(cx + 14, cy - 8, cx + 16, cy + 2);
      // Right leg 2
      g.lineBetween(cx + 3, cy - 2, cx + 11, cy - 8);
      g.lineBetween(cx + 11, cy - 8, cx + 14, cy - 2);
      g.lineBetween(cx + 14, cy - 2, cx + 16, cy + 8);
      // Right leg 3
      g.lineBetween(cx + 4, cy + 2, cx + 12, cy + 0);
      g.lineBetween(cx + 12, cy + 0, cx + 15, cy + 6);
      g.lineBetween(cx + 15, cy + 6, cx + 14, cy + 14);
      // Right leg 4 (rear)
      g.lineBetween(cx + 8, cy + 8, cx + 12, cy + 8);
      g.lineBetween(cx + 12, cy + 8, cx + 14, cy + 12);
      g.lineBetween(cx + 14, cy + 12, cx + 12, cy + 18);
      // Leg tips (feet)
      g.fillStyle(darker);
      g.fillCircle(cx - 22, cy + 2, 1.5);
      g.fillCircle(cx - 21, cy + 8, 1.5);
      g.fillCircle(cx - 18, cy + 14, 1.5);
      g.fillCircle(cx - 14, cy + 18, 1.5);
      g.fillCircle(cx + 16, cy + 2, 1.5);
      g.fillCircle(cx + 16, cy + 8, 1.5);
      g.fillCircle(cx + 14, cy + 14, 1.5);
      g.fillCircle(cx + 12, cy + 18, 1.5);
      break;
    }

    case 'crab': {
      // Armored crab with ridged shell and threatening claws
      // Shadow
      g.fillStyle(darker, 0.2);
      g.fillEllipse(cx, cy + 20, 32, 5);
      // Walking legs — 4 per side, behind the body
      g.lineStyle(2, darker);
      // Left legs
      g.lineBetween(cx - 12, cy + 8, cx - 16, cy + 4);
      g.lineBetween(cx - 16, cy + 4, cx - 20, cy + 14);
      g.lineBetween(cx - 10, cy + 10, cx - 14, cy + 8);
      g.lineBetween(cx - 14, cy + 8, cx - 18, cy + 16);
      g.lineBetween(cx - 8, cy + 12, cx - 12, cy + 12);
      g.lineBetween(cx - 12, cy + 12, cx - 16, cy + 19);
      g.lineBetween(cx - 6, cy + 13, cx - 10, cy + 14);
      g.lineBetween(cx - 10, cy + 14, cx - 12, cy + 21);
      // Right legs
      g.lineBetween(cx + 12, cy + 8, cx + 16, cy + 4);
      g.lineBetween(cx + 16, cy + 4, cx + 20, cy + 14);
      g.lineBetween(cx + 10, cy + 10, cx + 14, cy + 8);
      g.lineBetween(cx + 14, cy + 8, cx + 18, cy + 16);
      g.lineBetween(cx + 8, cy + 12, cx + 12, cy + 12);
      g.lineBetween(cx + 12, cy + 12, cx + 16, cy + 19);
      g.lineBetween(cx + 6, cy + 13, cx + 10, cy + 14);
      g.lineBetween(cx + 10, cy + 14, cx + 12, cy + 21);
      // Leg tips
      g.fillStyle(darker);
      g.fillCircle(cx - 20, cy + 14, 1.5);
      g.fillCircle(cx - 18, cy + 16, 1.5);
      g.fillCircle(cx - 16, cy + 19, 1.5);
      g.fillCircle(cx - 12, cy + 21, 1.5);
      g.fillCircle(cx + 20, cy + 14, 1.5);
      g.fillCircle(cx + 18, cy + 16, 1.5);
      g.fillCircle(cx + 16, cy + 19, 1.5);
      g.fillCircle(cx + 12, cy + 21, 1.5);
      // Shell body — wide, armored
      g.fillStyle(darker);
      g.fillEllipse(cx, cy + 4, 32, 22);
      g.fillStyle(color);
      g.fillEllipse(cx, cy + 3, 30, 20);
      // Shell ridge lines
      g.fillStyle(darker, 0.3);
      g.fillEllipse(cx, cy + 1, 24, 14);
      g.fillStyle(color);
      g.fillEllipse(cx, cy, 20, 12);
      g.fillStyle(darker, 0.2);
      g.fillEllipse(cx, cy - 1, 14, 8);
      g.fillStyle(color, 0.8);
      g.fillEllipse(cx, cy - 2, 10, 6);
      // Shell highlight
      g.fillStyle(lighter, 0.4);
      g.fillEllipse(cx - 4, cy - 3, 10, 6);
      g.fillStyle(lightest, 0.2);
      g.fillEllipse(cx - 5, cy - 4, 6, 4);
      // Eye stalks
      g.fillStyle(color);
      g.fillEllipse(cx - 5, cy - 10, 4, 10);
      g.fillEllipse(cx + 5, cy - 10, 4, 10);
      // Eyes on stalks
      g.fillStyle(0xffffff);
      g.fillCircle(cx - 5, cy - 14, 3.5);
      g.fillCircle(cx + 5, cy - 14, 3.5);
      g.fillStyle(0x000000);
      g.fillCircle(cx - 5, cy - 14, 2);
      g.fillCircle(cx + 5, cy - 14, 2);
      g.fillStyle(0xffffff);
      g.fillCircle(cx - 6, cy - 15, 1);
      g.fillCircle(cx + 4, cy - 15, 1);
      // Claw arms
      g.fillStyle(color);
      g.fillEllipse(cx - 16, cy - 2, 8, 5);
      g.fillEllipse(cx + 16, cy - 2, 8, 5);
      // Left claw — raised threateningly
      g.fillStyle(color);
      g.fillEllipse(cx - 21, cy - 6, 12, 9);
      g.fillStyle(lighter, 0.3);
      g.fillEllipse(cx - 22, cy - 7, 8, 5);
      // Left pincer top
      g.fillStyle(darker);
      g.fillTriangle(cx - 23, cy - 10, cx - 16, cy - 6, cx - 23, cy - 4);
      // Left pincer bottom
      g.fillTriangle(cx - 23, cy - 2, cx - 16, cy - 5, cx - 23, cy - 7);
      // Right claw — raised threateningly
      g.fillStyle(color);
      g.fillEllipse(cx + 21, cy - 6, 12, 9);
      g.fillStyle(lighter, 0.3);
      g.fillEllipse(cx + 22, cy - 7, 8, 5);
      // Right pincer top
      g.fillStyle(darker);
      g.fillTriangle(cx + 23, cy - 10, cx + 16, cy - 6, cx + 23, cy - 4);
      // Right pincer bottom
      g.fillTriangle(cx + 23, cy - 2, cx + 16, cy - 5, cx + 23, cy - 7);
      // Mouth detail
      g.fillStyle(darker, 0.6);
      g.fillEllipse(cx, cy + 8, 8, 3);
      // Bubbles
      g.fillStyle(0xffffff, 0.4);
      g.fillCircle(cx + 16, cy - 12, 2);
      g.fillCircle(cx + 20, cy - 16, 1.5);
      g.fillCircle(cx - 18, cy - 14, 1.5);
      break;
    }

    case 'serpent': {
      // Sea serpent — S-curved coiling body with scales and frill
      // Tail end — tapered
      g.fillStyle(color);
      g.fillEllipse(cx + 14, cy + 14, 8, 6);
      g.fillStyle(darker);
      g.fillTriangle(cx + 17, cy + 12, cx + 22, cy + 14, cx + 17, cy + 16);
      // Lower coil
      g.fillStyle(color);
      g.fillEllipse(cx + 6, cy + 12, 20, 12);
      g.fillStyle(lighter, 0.4);
      g.fillEllipse(cx + 6, cy + 14, 14, 6);
      // Upper coil
      g.fillStyle(color);
      g.fillEllipse(cx - 4, cy + 6, 20, 12);
      g.fillStyle(lighter, 0.4);
      g.fillEllipse(cx - 4, cy + 8, 14, 6);
      // Scale pattern — rows along body
      g.fillStyle(darker, 0.3);
      for (let i = 0; i < 6; i++) {
        g.fillEllipse(cx - 10 + i * 4, cy + 7, 3, 2.5);
      }
      for (let i = 0; i < 5; i++) {
        g.fillEllipse(cx - 2 + i * 4, cy + 13, 3, 2.5);
      }
      // Neck — rising up, curved
      g.fillStyle(color);
      g.fillEllipse(cx - 8, cy - 1, 10, 14);
      g.fillEllipse(cx - 8, cy - 6, 10, 10);
      // Neck belly
      g.fillStyle(lighter);
      g.fillEllipse(cx - 6, cy - 1, 5, 10);
      // Dorsal fin/frill along neck and back
      g.fillStyle(0x1155cc);
      g.fillTriangle(cx - 12, cy - 2, cx - 10, cy + 4, cx - 14, cy + 4);
      g.fillTriangle(cx - 12, cy - 8, cx - 10, cy - 2, cx - 14, cy - 2);
      g.fillTriangle(cx - 10, cy - 14, cx - 8, cy - 8, cx - 12, cy - 8);
      g.fillStyle(0x1144aa, 0.6);
      g.fillTriangle(cx - 11, cy - 1, cx - 9, cy + 3, cx - 13, cy + 3);
      // Head — fierce, forward-facing
      g.fillStyle(color);
      g.fillEllipse(cx - 6, cy - 14, 16, 14);
      // Head top crest
      g.fillStyle(0x1155cc);
      g.fillTriangle(cx - 6, cy - 22, cx - 2, cy - 14, cx - 10, cy - 14);
      g.fillTriangle(cx - 2, cy - 24, cx + 2, cy - 16, cx - 6, cy - 16);
      // Head shading
      g.fillStyle(darker, 0.3);
      g.fillEllipse(cx - 4, cy - 12, 10, 8);
      g.fillStyle(color, 0.7);
      g.fillEllipse(cx - 5, cy - 13, 8, 6);
      // Eyes — fierce yellow with slit pupils
      g.fillStyle(0x000000);
      g.fillEllipse(cx - 9, cy - 15, 5, 5);
      g.fillEllipse(cx - 1, cy - 15, 5, 5);
      g.fillStyle(0xffee00);
      g.fillEllipse(cx - 9, cy - 15, 4, 4);
      g.fillEllipse(cx - 1, cy - 15, 4, 4);
      g.fillStyle(0x000000);
      g.fillEllipse(cx - 9, cy - 15, 1.5, 3.5);
      g.fillEllipse(cx - 1, cy - 15, 1.5, 3.5);
      // Eye glow
      g.fillStyle(0xffff88, 0.3);
      g.fillCircle(cx - 9, cy - 15, 4);
      g.fillCircle(cx - 1, cy - 15, 4);
      // Eye shine
      g.fillStyle(0xffffff);
      g.fillCircle(cx - 10, cy - 16, 1);
      g.fillCircle(cx - 2, cy - 16, 1);
      // Jaw/snout
      g.fillStyle(color);
      g.fillEllipse(cx - 5, cy - 9, 12, 6);
      g.fillStyle(lighter);
      g.fillEllipse(cx - 5, cy - 8, 10, 4);
      // Teeth — sharp fangs
      g.fillStyle(0xffffff);
      g.fillTriangle(cx - 9, cy - 8, cx - 7, cy - 8, cx - 8, cy - 4);
      g.fillTriangle(cx - 5, cy - 8, cx - 3, cy - 8, cx - 4, cy - 5);
      g.fillTriangle(cx - 1, cy - 8, cx + 1, cy - 8, cx, cy - 5);
      g.fillTriangle(cx + 1, cy - 8, cx + 3, cy - 8, cx + 2, cy - 4);
      // Forked tongue
      g.fillStyle(0xff3333);
      g.fillRect(cx - 5, cy - 5, 2, 6);
      g.fillTriangle(cx - 6, cy + 1, cx - 4, cy - 1, cx - 7, cy + 4);
      g.fillTriangle(cx - 6, cy + 1, cx - 4, cy - 1, cx - 3, cy + 4);
      // Water effect
      g.fillStyle(0x88ccff, 0.4);
      g.fillCircle(cx + 18, cy + 4, 1.5);
      g.fillCircle(cx - 16, cy + 2, 1);
      g.fillCircle(cx + 14, cy - 4, 1.5);
      g.fillCircle(cx - 12, cy + 16, 1);
      break;
    }

    case 'golem': {
      // Rock/earth golem — hulking stone figure
      // Warm-colored golems (red channel > 0xaa) get fiery accents instead of moss
      const isWarm = ((color >> 16) & 0xff) > 0xaa;
      const eyeGlow = isWarm ? 0xff6600 : 0x44ff88;
      const mossColor = isWarm ? 0xcc6622 : 0x447744;
      const crackColor = isWarm ? 0xff4400 : 0x555544;
      // Shadow
      g.fillStyle(darker, 0.2);
      g.fillEllipse(cx, cy + 22, 28, 5);
      // Legs — heavy stone pillars
      g.fillStyle(color);
      g.fillRect(cx - 11, cy + 14, 9, 10);
      g.fillRect(cx + 2, cy + 14, 9, 10);
      g.fillStyle(darker);
      g.fillRect(cx - 10, cy + 16, 7, 3);
      g.fillRect(cx + 3, cy + 16, 7, 3);
      // Feet — wide stone blocks
      g.fillStyle(darker);
      g.fillEllipse(cx - 7, cy + 23, 12, 4);
      g.fillEllipse(cx + 6, cy + 23, 12, 4);
      // Body — wide, blocky torso made of stacked stones
      g.fillStyle(color);
      g.fillRect(cx - 13, cy - 4, 26, 20);
      // Stone block lines
      g.fillStyle(darker, 0.4);
      g.fillRect(cx - 12, cy - 1, 24, 2);
      g.fillRect(cx - 12, cy + 5, 24, 2);
      g.fillRect(cx - 12, cy + 11, 24, 2);
      // Vertical seams
      g.lineStyle(1, darker, 0.3);
      g.lineBetween(cx - 4, cy - 4, cx - 4, cy - 1);
      g.lineBetween(cx + 6, cy - 4, cx + 6, cy - 1);
      g.lineBetween(cx, cy + 1, cx, cy + 5);
      g.lineBetween(cx - 6, cy + 7, cx - 6, cy + 11);
      g.lineBetween(cx + 8, cy + 7, cx + 8, cy + 11);
      // Body highlight
      g.fillStyle(lighter, 0.2);
      g.fillRect(cx - 11, cy - 3, 10, 8);
      // Cracks with glow
      g.lineStyle(1.5, crackColor);
      g.lineBetween(cx - 5, cy - 2, cx - 7, cy + 4);
      g.lineBetween(cx - 7, cy + 4, cx - 4, cy + 8);
      g.lineBetween(cx - 4, cy + 8, cx - 6, cy + 14);
      g.lineBetween(cx + 6, cy, cx + 8, cy + 6);
      g.lineBetween(cx + 8, cy + 6, cx + 5, cy + 10);
      // Crack inner glow
      g.lineStyle(1, crackColor, 0.3);
      g.lineBetween(cx - 4, cy - 1, cx - 6, cy + 3);
      g.lineBetween(cx + 7, cy + 1, cx + 9, cy + 5);
      // Arms — massive boulder fists
      g.fillStyle(color);
      g.fillRect(cx - 20, cy - 2, 9, 16);
      g.fillRect(cx + 11, cy - 2, 9, 16);
      // Arm stone lines
      g.fillStyle(darker, 0.3);
      g.fillRect(cx - 19, cy + 4, 7, 2);
      g.fillRect(cx + 12, cy + 4, 7, 2);
      // Fists — rounded boulders
      g.fillStyle(darker);
      g.fillEllipse(cx - 16, cy + 14, 12, 10);
      g.fillEllipse(cx + 15, cy + 14, 12, 10);
      g.fillStyle(color);
      g.fillEllipse(cx - 16, cy + 13, 10, 8);
      g.fillEllipse(cx + 15, cy + 13, 10, 8);
      // Knuckle lines
      g.lineStyle(1, darker, 0.5);
      g.lineBetween(cx - 19, cy + 13, cx - 13, cy + 13);
      g.lineBetween(cx + 12, cy + 13, cx + 18, cy + 13);
      // Head — large boulder, rough
      g.fillStyle(color);
      g.fillEllipse(cx, cy - 12, 24, 20);
      g.fillStyle(darker, 0.3);
      g.fillEllipse(cx + 2, cy - 10, 18, 14);
      g.fillStyle(color, 0.8);
      g.fillEllipse(cx + 1, cy - 11, 14, 10);
      // Head cracks
      g.lineStyle(1, crackColor, 0.6);
      g.lineBetween(cx - 8, cy - 18, cx - 6, cy - 12);
      g.lineBetween(cx + 6, cy - 16, cx + 8, cy - 10);
      // Brow ridge
      g.fillStyle(darker);
      g.fillEllipse(cx, cy - 14, 20, 6);
      g.fillStyle(color);
      g.fillEllipse(cx, cy - 15, 16, 4);
      // Eye sockets — deep and dark
      g.fillStyle(0x000000);
      g.fillRect(cx - 8, cy - 13, 7, 5);
      g.fillRect(cx + 1, cy - 13, 7, 5);
      // Glowing eyes
      g.fillStyle(eyeGlow);
      g.fillRect(cx - 7, cy - 12, 5, 3);
      g.fillRect(cx + 2, cy - 12, 5, 3);
      // Eye glow aura
      g.fillStyle(eyeGlow, 0.2);
      g.fillCircle(cx - 5, cy - 11, 5);
      g.fillCircle(cx + 4, cy - 11, 5);
      // Mouth — craggy line
      g.fillStyle(0x000000, 0.6);
      g.fillRect(cx - 5, cy - 6, 10, 2);
      // Mossy patches (or magma glow for warm golems)
      g.fillStyle(mossColor, 0.5);
      g.fillEllipse(cx - 10, cy + 2, 6, 4);
      g.fillEllipse(cx + 11, cy + 10, 5, 3);
      g.fillEllipse(cx - 5, cy - 18, 5, 3);
      g.fillEllipse(cx + 8, cy + 0, 4, 3);
      g.fillStyle(mossColor, 0.3);
      g.fillEllipse(cx - 16, cy + 8, 4, 3);
      g.fillEllipse(cx + 16, cy + 8, 4, 3);
      break;
    }

    case 'harpy': {
      // Bird-woman hybrid — elegant but dangerous, wings spread wide
      // Outer wing silhouettes (dark base layer)
      g.fillStyle(darker);
      g.fillTriangle(cx - 6, cy - 2, cx - 23, cy - 16, cx - 22, cy + 8);
      g.fillTriangle(cx + 6, cy - 2, cx + 23, cy - 16, cx + 22, cy + 8);
      // Wing primary feathers (main color)
      g.fillStyle(color);
      g.fillTriangle(cx - 8, cy, cx - 20, cy - 12, cx - 18, cy + 6);
      g.fillTriangle(cx + 8, cy, cx + 20, cy - 12, cx + 18, cy + 6);
      // Wing secondary feathers (lighter layer)
      g.fillStyle(lighter);
      g.fillTriangle(cx - 10, cy + 2, cx - 16, cy - 6, cx - 14, cy + 6);
      g.fillTriangle(cx + 10, cy + 2, cx + 16, cy - 6, cx + 14, cy + 6);
      // Individual feather tips (lightest)
      g.fillStyle(lightest, 0.6);
      g.fillTriangle(cx - 20, cy + 4, cx - 23, cy + 8, cx - 18, cy + 8);
      g.fillTriangle(cx + 20, cy + 4, cx + 23, cy + 8, cx + 18, cy + 8);
      g.fillTriangle(cx - 17, cy + 6, cx - 20, cy + 10, cx - 15, cy + 9);
      g.fillTriangle(cx + 17, cy + 6, cx + 20, cy + 10, cx + 15, cy + 9);
      // Wing bone structure
      g.lineStyle(1, darker);
      g.lineBetween(cx - 6, cy - 2, cx - 22, cy - 14);
      g.lineBetween(cx + 6, cy - 2, cx + 22, cy - 14);
      g.lineBetween(cx - 14, cy - 8, cx - 20, cy + 4);
      g.lineBetween(cx + 14, cy - 8, cx + 20, cy + 4);
      // Body — human-like torso, skin tone
      g.fillStyle(0xeeccaa);
      g.fillEllipse(cx, cy + 4, 14, 18);
      // Body shading
      g.fillStyle(0xddbb99, 0.5);
      g.fillEllipse(cx + 2, cy + 6, 8, 12);
      // Feathered bodice covering chest
      g.fillStyle(color);
      g.fillEllipse(cx, cy - 1, 14, 8);
      g.fillStyle(lighter);
      g.fillEllipse(cx, cy - 2, 10, 5);
      // Neck
      g.fillStyle(0xeeccaa);
      g.fillEllipse(cx, cy - 7, 6, 6);
      // Head — slightly angular, fierce
      g.fillStyle(0xeeccaa);
      g.fillCircle(cx, cy - 12, 7);
      // Wild feathered hair flowing back
      g.fillStyle(color);
      g.fillEllipse(cx, cy - 16, 16, 8);
      g.fillStyle(darker);
      g.fillTriangle(cx - 4, cy - 16, cx - 2, cy - 22, cx, cy - 14);
      g.fillTriangle(cx + 1, cy - 15, cx + 4, cy - 23, cx + 6, cy - 13);
      g.fillTriangle(cx + 5, cy - 14, cx + 8, cy - 20, cx + 9, cy - 12);
      g.fillStyle(lighter, 0.4);
      g.fillEllipse(cx - 2, cy - 18, 8, 4);
      // Eyes — fierce violet, angular
      g.fillStyle(0xffffff);
      g.fillEllipse(cx - 3, cy - 13, 5, 4);
      g.fillEllipse(cx + 3, cy - 13, 5, 4);
      g.fillStyle(0x880088);
      g.fillCircle(cx - 3, cy - 12, 1.5);
      g.fillCircle(cx + 3, cy - 12, 1.5);
      // Eye highlights
      g.fillStyle(0xffffff);
      g.fillCircle(cx - 4, cy - 13, 0.8);
      g.fillCircle(cx + 2, cy - 13, 0.8);
      // Eyebrow ridges (angry)
      g.lineStyle(1.5, 0x775533);
      g.lineBetween(cx - 6, cy - 15, cx - 1, cy - 14);
      g.lineBetween(cx + 1, cy - 14, cx + 6, cy - 15);
      // Small sharp beak/mouth
      g.fillStyle(0xffaa44);
      g.fillTriangle(cx - 1, cy - 9, cx + 1, cy - 9, cx, cy - 7);
      // Legs — bird-like, thin with reverse knee
      g.fillStyle(0x888866);
      g.fillRect(cx - 4, cy + 12, 2, 5);
      g.fillRect(cx + 2, cy + 12, 2, 5);
      // Reverse knee joint
      g.fillStyle(0x777755);
      g.fillCircle(cx - 3, cy + 17, 1.5);
      g.fillCircle(cx + 3, cy + 17, 1.5);
      // Lower legs (thinner)
      g.fillStyle(0x888866);
      g.fillRect(cx - 4, cy + 17, 2, 4);
      g.fillRect(cx + 2, cy + 17, 2, 4);
      // Taloned feet — 3 claws each
      g.fillStyle(0x666644);
      g.fillTriangle(cx - 6, cy + 21, cx - 3, cy + 20, cx - 7, cy + 23);
      g.fillTriangle(cx - 4, cy + 21, cx - 2, cy + 20, cx - 3, cy + 23);
      g.fillTriangle(cx - 2, cy + 21, cx - 1, cy + 20, cx, cy + 23);
      g.fillTriangle(cx + 5, cy + 21, cx + 3, cy + 20, cx + 6, cy + 23);
      g.fillTriangle(cx + 3, cy + 21, cx + 2, cy + 20, cx + 2, cy + 23);
      g.fillTriangle(cx + 1, cy + 21, cx + 1, cy + 20, cx - 1, cy + 23);
      break;
    }

    case 'wyvern': {
      // Two-legged dragon — bat-like wings, muscular, barbed tail
      // Wing membrane (back layer — darker, wider)
      g.fillStyle(darker, 0.5);
      g.fillTriangle(cx - 6, cy - 2, cx - 23, cy - 18, cx - 20, cy + 6);
      g.fillTriangle(cx + 6, cy - 2, cx + 23, cy - 18, cx + 20, cy + 6);
      // Wing main surface
      g.fillStyle(color);
      g.fillTriangle(cx - 8, cy, cx - 21, cy - 15, cx - 18, cy + 5);
      g.fillTriangle(cx + 8, cy, cx + 21, cy - 15, cx + 18, cy + 5);
      // Wing finger bones
      g.lineStyle(1.5, darker);
      g.lineBetween(cx - 8, cy - 1, cx - 22, cy - 16);
      g.lineBetween(cx - 8, cy, cx - 20, cy - 8);
      g.lineBetween(cx - 8, cy + 1, cx - 18, cy + 4);
      g.lineBetween(cx + 8, cy - 1, cx + 22, cy - 16);
      g.lineBetween(cx + 8, cy, cx + 20, cy - 8);
      g.lineBetween(cx + 8, cy + 1, cx + 18, cy + 4);
      // Wing membrane veins (lighter)
      g.fillStyle(lighter, 0.3);
      g.fillTriangle(cx - 12, cy - 2, cx - 18, cy - 10, cx - 16, cy + 2);
      g.fillTriangle(cx + 12, cy - 2, cx + 18, cy - 10, cx + 16, cy + 2);
      // Wing claws at tips
      g.fillStyle(0x222222);
      g.fillTriangle(cx - 23, cy - 18, cx - 22, cy - 21, cx - 20, cy - 18);
      g.fillTriangle(cx + 23, cy - 18, cx + 22, cy - 21, cx + 20, cy - 18);
      // Muscular body
      g.fillStyle(color);
      g.fillEllipse(cx, cy + 6, 22, 18);
      // Scale texture — overlapping rows
      g.fillStyle(darker, 0.3);
      for (let row = 0; row < 3; row++) {
        for (let col = 0; col < 4; col++) {
          g.fillEllipse(cx - 6 + col * 4, cy + 1 + row * 5, 4, 3);
        }
      }
      // Belly — lighter, smooth
      g.fillStyle(lighter);
      g.fillEllipse(cx, cy + 8, 12, 10);
      g.fillStyle(lightest, 0.3);
      g.fillEllipse(cx - 1, cy + 6, 6, 6);
      // Neck — thick and muscular
      g.fillStyle(color);
      g.fillEllipse(cx, cy - 6, 12, 14);
      g.fillStyle(lighter, 0.3);
      g.fillEllipse(cx + 1, cy - 7, 6, 10);
      // Head — angular and predatory
      g.fillStyle(color);
      g.fillEllipse(cx, cy - 15, 16, 11);
      // Brow ridge
      g.fillStyle(darker);
      g.fillEllipse(cx, cy - 18, 14, 4);
      // Horns — swept back
      g.fillStyle(0x333322);
      g.fillTriangle(cx - 6, cy - 20, cx - 4, cy - 16, cx - 10, cy - 15);
      g.fillTriangle(cx + 6, cy - 20, cx + 4, cy - 16, cx + 10, cy - 15);
      g.fillStyle(0x444433);
      g.fillTriangle(cx - 5, cy - 19, cx - 4, cy - 16, cx - 8, cy - 15);
      g.fillTriangle(cx + 5, cy - 19, cx + 4, cy - 16, cx + 8, cy - 15);
      // Eyes — fierce yellow slit pupils
      g.fillStyle(0xffff00);
      g.fillEllipse(cx - 4, cy - 16, 5, 4);
      g.fillEllipse(cx + 4, cy - 16, 5, 4);
      g.fillStyle(0x000000);
      g.fillEllipse(cx - 4, cy - 16, 1.5, 3);
      g.fillEllipse(cx + 4, cy - 16, 1.5, 3);
      // Eye highlights
      g.fillStyle(0xffffff);
      g.fillCircle(cx - 5, cy - 17, 0.8);
      g.fillCircle(cx + 3, cy - 17, 0.8);
      // Snout with nostrils
      g.fillStyle(color);
      g.fillEllipse(cx, cy - 11, 10, 5);
      g.fillStyle(lighter);
      g.fillEllipse(cx, cy - 10, 8, 3);
      g.fillStyle(0x111111);
      g.fillCircle(cx - 2, cy - 11, 1);
      g.fillCircle(cx + 2, cy - 11, 1);
      // Open jaw with fangs
      g.fillStyle(darker);
      g.fillEllipse(cx, cy - 8, 8, 3);
      g.fillStyle(0xeeeecc);
      g.fillTriangle(cx - 3, cy - 9, cx - 2, cy - 9, cx - 2.5, cy - 6);
      g.fillTriangle(cx + 2, cy - 9, cx + 3, cy - 9, cx + 2.5, cy - 6);
      // Tail — long with barb
      g.fillStyle(color);
      g.fillEllipse(cx + 10, cy + 12, 10, 6);
      g.fillEllipse(cx + 16, cy + 14, 8, 5);
      g.fillStyle(darker);
      g.fillEllipse(cx + 20, cy + 15, 6, 4);
      // Tail barb — diamond shape
      g.fillStyle(0x333322);
      g.fillTriangle(cx + 22, cy + 13, cx + 23, cy + 15, cx + 22, cy + 17);
      g.fillTriangle(cx + 22, cy + 13, cx + 23, cy + 15, cx + 24, cy + 13);
      // Legs — two, muscular
      g.fillStyle(color);
      g.fillEllipse(cx - 5, cy + 14, 6, 10);
      g.fillEllipse(cx + 5, cy + 14, 6, 10);
      g.fillStyle(darker);
      g.fillEllipse(cx - 5, cy + 19, 7, 4);
      g.fillEllipse(cx + 5, cy + 19, 7, 4);
      // Claws
      g.fillStyle(0x222222);
      g.fillTriangle(cx - 8, cy + 20, cx - 6, cy + 19, cx - 9, cy + 22);
      g.fillTriangle(cx - 5, cy + 20, cx - 4, cy + 19, cx - 5, cy + 22);
      g.fillTriangle(cx + 7, cy + 20, cx + 5, cy + 19, cx + 8, cy + 22);
      g.fillTriangle(cx + 4, cy + 20, cx + 3, cy + 19, cx + 4, cy + 22);
      break;
    }

    case 'lizard': {
      // Armored lizardman warrior — upright stance, spear, scaly
      // Tail curving behind
      g.fillStyle(color);
      g.fillEllipse(cx - 8, cy + 14, 10, 6);
      g.fillEllipse(cx - 14, cy + 16, 8, 5);
      g.fillStyle(darker);
      g.fillEllipse(cx - 18, cy + 17, 5, 3);
      // Legs — digitigrade, muscular
      g.fillStyle(color);
      g.fillEllipse(cx - 4, cy + 14, 6, 10);
      g.fillEllipse(cx + 4, cy + 14, 6, 10);
      // Knee guards (armor)
      g.fillStyle(lighter);
      g.fillEllipse(cx - 4, cy + 14, 4, 3);
      g.fillEllipse(cx + 4, cy + 14, 4, 3);
      // Feet — clawed, reptilian
      g.fillStyle(darker);
      g.fillEllipse(cx - 5, cy + 20, 6, 3);
      g.fillEllipse(cx + 5, cy + 20, 6, 3);
      g.fillStyle(0x666644);
      g.fillTriangle(cx - 8, cy + 21, cx - 6, cy + 19, cx - 9, cy + 23);
      g.fillTriangle(cx - 4, cy + 21, cx - 3, cy + 19, cx - 4, cy + 23);
      g.fillTriangle(cx + 7, cy + 21, cx + 5, cy + 19, cx + 8, cy + 23);
      g.fillTriangle(cx + 3, cy + 21, cx + 2, cy + 19, cx + 3, cy + 23);
      // Body — broad, scaly torso
      g.fillStyle(color);
      g.fillEllipse(cx, cy + 4, 18, 20);
      // Chest scales — lighter belly
      g.fillStyle(lighter);
      g.fillEllipse(cx, cy + 4, 10, 14);
      // Scale pattern on sides
      g.fillStyle(darker, 0.35);
      for (let row = 0; row < 3; row++) {
        for (let col = 0; col < 3; col++) {
          g.fillEllipse(cx - 3 + col * 3, cy - 1 + row * 4, 3, 2.5);
        }
      }
      // Leather chest armor
      g.fillStyle(0x664422);
      g.fillEllipse(cx, cy + 2, 14, 8);
      g.fillStyle(0x775533);
      g.fillEllipse(cx, cy + 1, 10, 5);
      // Belt
      g.fillStyle(0x553311);
      g.fillRect(cx - 8, cy + 8, 16, 2);
      g.fillStyle(0xddcc44);
      g.fillCircle(cx, cy + 9, 1.5);
      // Arms — muscular, scaly
      g.fillStyle(color);
      g.fillEllipse(cx - 11, cy + 2, 6, 12);
      g.fillEllipse(cx + 11, cy + 2, 6, 12);
      // Shoulder pads
      g.fillStyle(0x664422);
      g.fillEllipse(cx - 11, cy - 2, 6, 5);
      g.fillEllipse(cx + 11, cy - 2, 6, 5);
      // Spear in right hand — long diagonal
      g.lineStyle(2, 0x664422);
      g.lineBetween(cx + 14, cy - 18, cx + 14, cy + 16);
      // Spear head
      g.fillStyle(0xcccccc);
      g.fillTriangle(cx + 12, cy - 18, cx + 16, cy - 18, cx + 14, cy - 23);
      g.fillStyle(0xeeeeee);
      g.fillTriangle(cx + 13, cy - 18, cx + 15, cy - 18, cx + 14, cy - 22);
      // Shield in left hand
      g.fillStyle(0x664422);
      g.fillEllipse(cx - 16, cy + 4, 8, 12);
      g.fillStyle(0x775533);
      g.fillEllipse(cx - 16, cy + 3, 5, 8);
      // Neck
      g.fillStyle(color);
      g.fillEllipse(cx, cy - 8, 10, 8);
      // Head — elongated reptilian snout
      g.fillStyle(color);
      g.fillEllipse(cx, cy - 14, 14, 12);
      // Snout
      g.fillStyle(color);
      g.fillEllipse(cx, cy - 10, 10, 6);
      g.fillStyle(darker);
      g.fillEllipse(cx, cy - 9, 8, 3);
      // Nostrils
      g.fillStyle(0x111111);
      g.fillCircle(cx - 2, cy - 10, 0.8);
      g.fillCircle(cx + 2, cy - 10, 0.8);
      // Head ridge / crest
      g.fillStyle(darker);
      g.fillTriangle(cx - 2, cy - 22, cx, cy - 16, cx - 4, cy - 16);
      g.fillTriangle(cx + 2, cy - 20, cx + 4, cy - 15, cx, cy - 15);
      g.fillStyle(lighter, 0.4);
      g.fillTriangle(cx - 1, cy - 21, cx, cy - 17, cx - 3, cy - 17);
      // Eyes — yellow with vertical slit pupils
      g.fillStyle(0xffff00);
      g.fillEllipse(cx - 4, cy - 15, 5, 5);
      g.fillEllipse(cx + 4, cy - 15, 5, 5);
      g.fillStyle(0x000000);
      g.fillEllipse(cx - 4, cy - 15, 1.5, 4);
      g.fillEllipse(cx + 4, cy - 15, 1.5, 4);
      // Eye highlights
      g.fillStyle(0xffffff);
      g.fillCircle(cx - 5, cy - 16, 0.8);
      g.fillCircle(cx + 3, cy - 16, 0.8);
      // Jaw teeth
      g.fillStyle(0xeeeecc);
      g.fillTriangle(cx - 3, cy - 8, cx - 2, cy - 8, cx - 2.5, cy - 6);
      g.fillTriangle(cx + 2, cy - 8, cx + 3, cy - 8, cx + 2.5, cy - 6);
      break;
    }

    case 'knight': {
      // Dark/evil knight — full plate armor, imposing, glowing visor
      // Cape — billowing behind, dark
      g.fillStyle(0x110022);
      g.fillTriangle(cx - 12, cy - 8, cx - 16, cy + 22, cx + 16, cy + 22);
      g.fillTriangle(cx + 12, cy - 8, cx + 16, cy + 22, cx - 16, cy + 22);
      // Cape folds
      g.fillStyle(0x220033, 0.6);
      g.fillTriangle(cx - 6, cy + 2, cx - 10, cy + 20, cx, cy + 20);
      g.fillTriangle(cx + 6, cy + 2, cx + 10, cy + 20, cx, cy + 20);
      // Cape inner lining (crimson glimpse)
      g.fillStyle(0x660011, 0.4);
      g.fillTriangle(cx - 8, cy + 6, cx - 12, cy + 20, cx - 2, cy + 20);
      // Body — layered plate armor
      g.fillStyle(color);
      g.fillEllipse(cx, cy + 4, 20, 20);
      // Chest plate
      g.fillStyle(lighter);
      g.fillEllipse(cx, cy + 2, 16, 14);
      g.fillStyle(color);
      g.fillEllipse(cx, cy + 3, 12, 10);
      // Chest plate center ridge
      g.lineStyle(1, lighter);
      g.lineBetween(cx, cy - 4, cx, cy + 10);
      // Armor plate horizontal lines
      g.fillStyle(darker, 0.4);
      g.fillRect(cx - 8, cy, 16, 1.5);
      g.fillRect(cx - 7, cy + 5, 14, 1.5);
      g.fillRect(cx - 6, cy + 10, 12, 1.5);
      // Gorget (neck armor)
      g.fillStyle(color);
      g.fillEllipse(cx, cy - 6, 14, 6);
      g.fillStyle(lighter, 0.4);
      g.fillEllipse(cx, cy - 7, 10, 3);
      // Shoulder pauldrons — large, intimidating
      g.fillStyle(color);
      g.fillEllipse(cx - 13, cy - 3, 12, 10);
      g.fillEllipse(cx + 13, cy - 3, 12, 10);
      // Pauldron ridges
      g.fillStyle(lighter);
      g.fillEllipse(cx - 13, cy - 5, 8, 5);
      g.fillEllipse(cx + 13, cy - 5, 8, 5);
      g.fillStyle(darker, 0.3);
      g.fillEllipse(cx - 13, cy, 10, 4);
      g.fillEllipse(cx + 13, cy, 10, 4);
      // Pauldron spikes
      g.fillStyle(darker);
      g.fillTriangle(cx - 18, cy - 6, cx - 16, cy - 3, cx - 20, cy - 2);
      g.fillTriangle(cx + 18, cy - 6, cx + 16, cy - 3, cx + 20, cy - 2);
      // Helmet — closed visor, menacing
      g.fillStyle(color);
      g.fillEllipse(cx, cy - 14, 18, 17);
      // Helmet face plate
      g.fillStyle(darker);
      g.fillEllipse(cx, cy - 12, 14, 12);
      g.fillStyle(color);
      g.fillEllipse(cx, cy - 13, 12, 10);
      // Visor slit — glowing red eyes behind
      g.fillStyle(0x000000);
      g.fillRect(cx - 5, cy - 15, 10, 3);
      g.fillStyle(0xff2200);
      g.fillRect(cx - 4, cy - 14, 3, 1.5);
      g.fillRect(cx + 1, cy - 14, 3, 1.5);
      // Visor glow bleed
      g.fillStyle(0xff2200, 0.3);
      g.fillRect(cx - 5, cy - 16, 10, 1);
      // Breaths (ventilation holes)
      g.fillStyle(0x000000);
      g.fillCircle(cx - 2, cy - 10, 0.8);
      g.fillCircle(cx, cy - 10, 0.8);
      g.fillCircle(cx + 2, cy - 10, 0.8);
      // Helmet crest — tall and sharp
      g.fillStyle(darker);
      g.fillTriangle(cx, cy - 23, cx - 2, cy - 14, cx + 2, cy - 14);
      g.fillStyle(0x880022);
      g.fillTriangle(cx, cy - 22, cx - 1, cy - 14, cx + 1, cy - 14);
      // Sword — greatsword held to the right
      g.fillStyle(0xaaaaaa);
      g.fillRect(cx + 16, cy - 18, 3, 30);
      // Sword edge highlight
      g.fillStyle(0xdddddd);
      g.fillRect(cx + 17, cy - 16, 1, 26);
      // Sword fuller (groove)
      g.fillStyle(0x888888);
      g.fillRect(cx + 16.5, cy - 14, 0.5, 22);
      // Crossguard — ornate
      g.fillStyle(0xddaa00);
      g.fillRect(cx + 12, cy + 10, 11, 2.5);
      g.fillStyle(0xffcc00);
      g.fillCircle(cx + 12, cy + 11, 1.5);
      g.fillCircle(cx + 23, cy + 11, 1.5);
      // Handle
      g.fillStyle(0x442211);
      g.fillRect(cx + 16, cy + 13, 3, 6);
      // Handle wrap
      g.fillStyle(0x553322, 0.5);
      g.fillRect(cx + 16, cy + 14, 3, 1);
      g.fillRect(cx + 16, cy + 16, 3, 1);
      // Pommel
      g.fillStyle(0xddaa00);
      g.fillCircle(cx + 17.5, cy + 20, 2);
      // Shield — kite shield, left side
      g.fillStyle(0x333344);
      g.fillEllipse(cx - 17, cy + 4, 11, 16);
      g.fillStyle(0x444466);
      g.fillEllipse(cx - 17, cy + 3, 8, 12);
      // Shield emblem — skull or evil icon
      g.fillStyle(0xaa0000);
      g.fillCircle(cx - 17, cy + 2, 2.5);
      g.fillStyle(0xcc2200);
      g.fillCircle(cx - 17, cy + 2, 1.5);
      // Shield rim highlight
      g.fillStyle(lighter, 0.3);
      g.lineStyle(1, lighter, 0.3);
      g.lineBetween(cx - 22, cy, cx - 17, cy - 6);
      // Legs — armored greaves
      g.fillStyle(color);
      g.fillRect(cx - 7, cy + 14, 6, 8);
      g.fillRect(cx + 1, cy + 14, 6, 8);
      // Knee caps
      g.fillStyle(lighter);
      g.fillEllipse(cx - 4, cy + 14, 5, 3);
      g.fillEllipse(cx + 4, cy + 14, 5, 3);
      // Sabatons (armored boots)
      g.fillStyle(darker);
      g.fillEllipse(cx - 4, cy + 22, 8, 4);
      g.fillEllipse(cx + 4, cy + 22, 8, 4);
      g.fillStyle(color);
      g.fillEllipse(cx - 4, cy + 22, 6, 3);
      g.fillEllipse(cx + 4, cy + 22, 6, 3);
      break;
    }

    case 'dragon': {
      // Majestic dragon — wings spread wide, horned head, fire breath, scaled body
      // Aura glow behind (subtle)
      g.fillStyle(0xff4400, 0.12);
      g.fillCircle(cx, cy, 23);
      // Wings — large, bat-like, layered
      // Wing back (darkest)
      g.fillStyle(darker);
      g.fillTriangle(cx - 8, cy - 4, cx - 23, cy - 22, cx - 22, cy + 4);
      g.fillTriangle(cx + 8, cy - 4, cx + 23, cy - 22, cx + 22, cy + 4);
      // Wing membrane (main color, translucent)
      g.fillStyle(color, 0.7);
      g.fillTriangle(cx - 7, cy - 2, cx - 20, cy - 18, cx - 19, cy + 3);
      g.fillTriangle(cx + 7, cy - 2, cx + 20, cy - 18, cx + 19, cy + 3);
      // Wing veins / bone structure
      g.lineStyle(1.5, darker);
      g.lineBetween(cx - 8, cy - 3, cx - 22, cy - 20);
      g.lineBetween(cx - 8, cy - 1, cx - 20, cy - 10);
      g.lineBetween(cx - 8, cy + 1, cx - 20, cy + 2);
      g.lineBetween(cx + 8, cy - 3, cx + 22, cy - 20);
      g.lineBetween(cx + 8, cy - 1, cx + 20, cy - 10);
      g.lineBetween(cx + 8, cy + 1, cx + 20, cy + 2);
      // Wing lighter membrane highlights
      g.fillStyle(lighter, 0.25);
      g.fillTriangle(cx - 12, cy - 6, cx - 18, cy - 14, cx - 16, cy - 2);
      g.fillTriangle(cx + 12, cy - 6, cx + 18, cy - 14, cx + 16, cy - 2);
      // Wing claw tips
      g.fillStyle(0x222222);
      g.fillTriangle(cx - 23, cy - 22, cx - 21, cy - 23, cx - 21, cy - 20);
      g.fillTriangle(cx + 23, cy - 22, cx + 21, cy - 23, cx + 21, cy - 20);
      g.fillTriangle(cx - 22, cy + 4, cx - 23, cy + 2, cx - 21, cy + 5);
      g.fillTriangle(cx + 22, cy + 4, cx + 23, cy + 2, cx + 21, cy + 5);
      // Tail — long, curving right, with ridge spines
      g.fillStyle(color);
      g.fillEllipse(cx + 10, cy + 12, 10, 6);
      g.fillEllipse(cx + 16, cy + 14, 8, 5);
      g.fillEllipse(cx + 20, cy + 13, 6, 4);
      // Tail spade tip
      g.fillStyle(darker);
      g.fillTriangle(cx + 22, cy + 10, cx + 23, cy + 13, cx + 22, cy + 16);
      g.fillTriangle(cx + 22, cy + 10, cx + 24, cy + 12, cx + 23, cy + 13);
      // Tail ridge spines
      g.fillStyle(darker);
      g.fillTriangle(cx + 12, cy + 9, cx + 11, cy + 11, cx + 13, cy + 11);
      g.fillTriangle(cx + 16, cy + 10, cx + 15, cy + 12, cx + 17, cy + 12);
      // Body — large, powerful
      g.fillStyle(color);
      g.fillEllipse(cx, cy + 6, 26, 20);
      // Scale texture — overlapping diamond rows
      g.fillStyle(darker, 0.25);
      for (let row = 0; row < 4; row++) {
        for (let col = 0; col < 5; col++) {
          g.fillEllipse(cx - 8 + col * 4, cy + row * 4, 3.5, 2.5);
        }
      }
      // Belly — lighter, segmented
      g.fillStyle(lighter);
      g.fillEllipse(cx, cy + 8, 14, 12);
      // Belly segment lines
      g.fillStyle(lightest, 0.3);
      g.fillRect(cx - 5, cy + 4, 10, 1);
      g.fillRect(cx - 4, cy + 7, 8, 1);
      g.fillRect(cx - 5, cy + 10, 10, 1);
      // Neck — long, elegant S-curve
      g.fillStyle(color);
      g.fillEllipse(cx - 2, cy - 6, 14, 14);
      g.fillEllipse(cx - 3, cy - 12, 12, 10);
      // Neck underside lighter
      g.fillStyle(lighter, 0.4);
      g.fillEllipse(cx - 1, cy - 6, 6, 10);
      // Head — angular, regal, slightly left-facing
      g.fillStyle(color);
      g.fillEllipse(cx - 3, cy - 18, 18, 13);
      // Brow ridge
      g.fillStyle(darker);
      g.fillEllipse(cx - 3, cy - 22, 16, 4);
      // Horns — majestic, sweeping back
      g.fillStyle(0x332211);
      g.fillTriangle(cx - 10, cy - 24, cx - 7, cy - 19, cx - 14, cy - 17);
      g.fillTriangle(cx + 4, cy - 24, cx + 1, cy - 19, cx + 8, cy - 17);
      // Horn highlight
      g.fillStyle(0x443322);
      g.fillTriangle(cx - 9, cy - 23, cx - 7, cy - 19, cx - 12, cy - 18);
      g.fillTriangle(cx + 3, cy - 23, cx + 1, cy - 19, cx + 6, cy - 18);
      // Secondary horn nubs
      g.fillStyle(0x332211);
      g.fillTriangle(cx - 6, cy - 22, cx - 5, cy - 19, cx - 8, cy - 19);
      g.fillTriangle(cx + 2, cy - 22, cx + 1, cy - 19, cx + 4, cy - 19);
      // Eyes — blazing, slit pupils
      g.fillStyle(0xff6600);
      g.fillEllipse(cx - 7, cy - 20, 5, 5);
      g.fillEllipse(cx + 1, cy - 20, 5, 5);
      g.fillStyle(0xffff00);
      g.fillEllipse(cx - 7, cy - 20, 3, 3.5);
      g.fillEllipse(cx + 1, cy - 20, 3, 3.5);
      g.fillStyle(0x000000);
      g.fillEllipse(cx - 7, cy - 20, 1, 3);
      g.fillEllipse(cx + 1, cy - 20, 1, 3);
      // Eye highlights
      g.fillStyle(0xffffff);
      g.fillCircle(cx - 8, cy - 21, 0.8);
      g.fillCircle(cx, cy - 21, 0.8);
      // Snout — elongated
      g.fillStyle(color);
      g.fillEllipse(cx - 3, cy - 14, 14, 7);
      g.fillStyle(darker);
      g.fillEllipse(cx - 3, cy - 12, 10, 4);
      // Nostrils with smoke wisps
      g.fillStyle(0x111111);
      g.fillCircle(cx - 6, cy - 14, 1.2);
      g.fillCircle(cx, cy - 14, 1.2);
      g.fillStyle(0x666666, 0.3);
      g.fillCircle(cx - 7, cy - 16, 1.5);
      g.fillCircle(cx - 1, cy - 17, 1);
      // Fire breath — cascading from mouth
      g.fillStyle(0xff2200, 0.8);
      g.fillTriangle(cx - 10, cy - 12, cx - 20, cy - 16, cx - 18, cy - 6);
      g.fillStyle(0xff6600, 0.7);
      g.fillTriangle(cx - 10, cy - 11, cx - 18, cy - 14, cx - 16, cy - 7);
      g.fillStyle(0xffaa00, 0.8);
      g.fillTriangle(cx - 10, cy - 11, cx - 16, cy - 13, cx - 14, cy - 8);
      g.fillStyle(0xffdd44, 0.6);
      g.fillTriangle(cx - 10, cy - 10, cx - 14, cy - 12, cx - 12, cy - 8);
      // Teeth
      g.fillStyle(0xeeeecc);
      g.fillTriangle(cx - 7, cy - 10, cx - 6, cy - 10, cx - 6.5, cy - 8);
      g.fillTriangle(cx - 3, cy - 10, cx - 2, cy - 10, cx - 2.5, cy - 8);
      g.fillTriangle(cx + 1, cy - 10, cx + 2, cy - 10, cx + 1.5, cy - 8);
      // Clawed feet — powerful
      g.fillStyle(color);
      g.fillEllipse(cx - 7, cy + 16, 8, 8);
      g.fillEllipse(cx + 5, cy + 16, 8, 8);
      g.fillStyle(darker);
      g.fillEllipse(cx - 7, cy + 20, 9, 4);
      g.fillEllipse(cx + 5, cy + 20, 9, 4);
      // Claws
      g.fillStyle(0x222222);
      g.fillTriangle(cx - 11, cy + 21, cx - 9, cy + 19, cx - 12, cy + 23);
      g.fillTriangle(cx - 7, cy + 21, cx - 6, cy + 19, cx - 7, cy + 23);
      g.fillTriangle(cx - 4, cy + 21, cx - 3, cy + 19, cx - 3, cy + 23);
      g.fillTriangle(cx + 9, cy + 21, cx + 7, cy + 19, cx + 10, cy + 23);
      g.fillTriangle(cx + 5, cy + 21, cx + 4, cy + 19, cx + 5, cy + 23);
      g.fillTriangle(cx + 2, cy + 21, cx + 2, cy + 19, cx + 1, cy + 23);
      // Dorsal spines along neck
      g.fillStyle(darker);
      g.fillTriangle(cx - 1, cy - 8, cx - 2, cy - 5, cx, cy - 5);
      g.fillTriangle(cx - 2, cy - 12, cx - 3, cy - 9, cx - 1, cy - 9);
      g.fillTriangle(cx - 3, cy - 16, cx - 4, cy - 13, cx - 2, cy - 13);
      break;
    }

    case 'lava-wyrm': {
      // Magma serpent — glowing cracks, dripping lava, flames along spine
      // Background heat shimmer
      g.fillStyle(0xff4400, 0.1);
      g.fillCircle(cx - 4, cy, 22);
      // Tail (far right, curving up) — tapered
      g.fillStyle(darker);
      g.fillEllipse(cx + 18, cy + 8, 8, 5);
      g.fillStyle(color);
      g.fillEllipse(cx + 18, cy + 7, 6, 4);
      g.fillTriangle(cx + 21, cy + 5, cx + 23, cy + 3, cx + 22, cy + 10);
      // Tail tip ember glow
      g.fillStyle(0xff6600, 0.6);
      g.fillCircle(cx + 22, cy + 4, 2);
      g.fillStyle(0xffaa00, 0.4);
      g.fillCircle(cx + 22, cy + 3, 1.2);
      // Main body — S-curve of overlapping segments
      g.fillStyle(color);
      g.fillEllipse(cx + 12, cy + 6, 14, 11);
      g.fillEllipse(cx + 2, cy + 1, 16, 13);
      g.fillEllipse(cx - 8, cy - 3, 14, 11);
      // Body segment shading (darker top)
      g.fillStyle(darker, 0.4);
      g.fillEllipse(cx + 12, cy + 3, 12, 5);
      g.fillEllipse(cx + 2, cy - 2, 14, 5);
      g.fillEllipse(cx - 8, cy - 6, 12, 4);
      // Underbelly glow — lava cracks between segments
      g.fillStyle(0xff6600, 0.8);
      g.fillEllipse(cx + 12, cy + 9, 8, 4);
      g.fillEllipse(cx + 2, cy + 4, 10, 4);
      g.fillEllipse(cx - 8, cy - 1, 8, 4);
      // Bright lava core
      g.fillStyle(0xffaa00, 0.6);
      g.fillEllipse(cx + 12, cy + 9, 5, 2);
      g.fillEllipse(cx + 2, cy + 4, 6, 2);
      g.fillEllipse(cx - 8, cy - 1, 5, 2);
      // Lava crack veins along body surface
      g.lineStyle(1, 0xff8800, 0.5);
      g.lineBetween(cx + 16, cy + 4, cx + 14, cy + 8);
      g.lineBetween(cx + 6, cy - 1, cx + 4, cy + 3);
      g.lineBetween(cx - 4, cy - 4, cx - 6, cy);
      g.lineBetween(cx + 8, cy + 2, cx + 10, cy + 6);
      g.lineBetween(cx - 2, cy - 2, cx - 4, cy + 2);
      // Lava vein dots — white-hot
      g.fillStyle(0xffee66, 0.7);
      for (let i = -12; i < 20; i += 5) {
        g.fillCircle(cx + i, cy + Math.sin(i * 0.3) * 4, 1);
      }
      // Scale ridge spines along the back — with flame tips
      g.fillStyle(darker);
      for (let i = -10; i < 18; i += 4) {
        const sy = Math.sin(i * 0.3) * 4;
        g.fillTriangle(cx + i, cy + sy - 6, cx + i - 2, cy + sy - 3, cx + i + 2, cy + sy - 3);
      }
      // Flame wisps on spines
      g.fillStyle(0xff4400, 0.5);
      for (let i = -10; i < 18; i += 8) {
        const sy = Math.sin(i * 0.3) * 4;
        g.fillTriangle(cx + i, cy + sy - 8, cx + i - 1, cy + sy - 5, cx + i + 1, cy + sy - 5);
      }
      g.fillStyle(0xffaa00, 0.4);
      for (let i = -6; i < 18; i += 8) {
        const sy = Math.sin(i * 0.3) * 4;
        g.fillTriangle(cx + i, cy + sy - 7, cx + i - 0.5, cy + sy - 5, cx + i + 0.5, cy + sy - 5);
      }
      // Head — raised, angular, menacing
      g.fillStyle(color);
      g.fillEllipse(cx - 16, cy - 10, 14, 11);
      // Head shading
      g.fillStyle(darker, 0.4);
      g.fillEllipse(cx - 16, cy - 13, 12, 4);
      // Head crest — jagged crown
      g.fillStyle(darker);
      g.fillTriangle(cx - 20, cy - 18, cx - 17, cy - 13, cx - 23, cy - 12);
      g.fillTriangle(cx - 16, cy - 17, cx - 14, cy - 13, cx - 18, cy - 12);
      g.fillTriangle(cx - 12, cy - 16, cx - 10, cy - 12, cx - 14, cy - 12);
      // Crest glow
      g.fillStyle(0xff4400, 0.4);
      g.fillTriangle(cx - 19, cy - 17, cx - 17, cy - 13, cx - 22, cy - 13);
      // Eyes — white-hot centers, fiery rings
      g.fillStyle(0xff4400);
      g.fillCircle(cx - 20, cy - 12, 3);
      g.fillCircle(cx - 13, cy - 12, 3);
      g.fillStyle(0xffcc00);
      g.fillCircle(cx - 20, cy - 12, 2);
      g.fillCircle(cx - 13, cy - 12, 2);
      g.fillStyle(0xffffff);
      g.fillCircle(cx - 20, cy - 12, 1);
      g.fillCircle(cx - 13, cy - 12, 1);
      // Open maw — dripping lava
      g.fillStyle(darker);
      g.fillEllipse(cx - 20, cy - 6, 10, 5);
      // Inside mouth glow
      g.fillStyle(0xff2200, 0.7);
      g.fillEllipse(cx - 20, cy - 6, 7, 3);
      // Lava breath
      g.fillStyle(0xff2200, 0.7);
      g.fillTriangle(cx - 24, cy - 6, cx - 28, cy - 1, cx - 22, cy - 2);
      g.fillStyle(0xff6600, 0.6);
      g.fillTriangle(cx - 24, cy - 6, cx - 27, cy - 2, cx - 23, cy - 3);
      g.fillStyle(0xffaa00, 0.5);
      g.fillTriangle(cx - 23, cy - 5, cx - 26, cy - 2, cx - 23, cy - 3);
      // Molten drips hanging from body
      g.fillStyle(0xff6600, 0.8);
      g.fillEllipse(cx + 4, cy + 10, 2, 6);
      g.fillEllipse(cx - 6, cy + 6, 2, 5);
      g.fillEllipse(cx + 14, cy + 12, 2, 4);
      // Drip tips (bright)
      g.fillStyle(0xffcc44, 0.6);
      g.fillCircle(cx + 4, cy + 13, 1);
      g.fillCircle(cx - 6, cy + 9, 1);
      g.fillCircle(cx + 14, cy + 14, 0.8);
      break;
    }

    case 'chimera': {
      // Multi-headed beast — lion body, bat wings, serpent tail
      // Wings (small, bat-like, behind body)
      g.fillStyle(darker);
      g.fillTriangle(cx - 4, cy - 2, cx - 16, cy - 16, cx - 14, cy + 2);
      g.fillTriangle(cx + 8, cy - 2, cx + 20, cy - 16, cx + 18, cy + 2);
      g.fillStyle(color, 0.5);
      g.fillTriangle(cx - 4, cy, cx - 14, cy - 12, cx - 12, cy + 1);
      g.fillTriangle(cx + 8, cy, cx + 18, cy - 12, cx + 16, cy + 1);
      // Wing bones
      g.lineStyle(1, darker);
      g.lineBetween(cx - 4, cy - 1, cx - 15, cy - 14);
      g.lineBetween(cx + 8, cy - 1, cx + 19, cy - 14);
      // Muscular lion body
      g.fillStyle(color);
      g.fillEllipse(cx + 2, cy + 6, 28, 18);
      // Body musculature shading
      g.fillStyle(darker, 0.2);
      g.fillEllipse(cx + 4, cy + 4, 20, 10);
      // Fur texture — soft edges
      g.fillStyle(lighter, 0.3);
      g.fillEllipse(cx + 2, cy + 10, 20, 8);
      // Belly
      g.fillStyle(lighter);
      g.fillEllipse(cx + 2, cy + 10, 14, 8);
      // Front legs — powerful
      g.fillStyle(color);
      g.fillEllipse(cx - 6, cy + 14, 6, 10);
      g.fillEllipse(cx + 4, cy + 14, 6, 10);
      // Paws with claws
      g.fillStyle(darker);
      g.fillEllipse(cx - 6, cy + 20, 7, 3);
      g.fillEllipse(cx + 4, cy + 20, 7, 3);
      g.fillStyle(0x333322);
      g.fillTriangle(cx - 9, cy + 21, cx - 7, cy + 19, cx - 10, cy + 22);
      g.fillTriangle(cx - 5, cy + 21, cx - 4, cy + 19, cx - 5, cy + 22);
      g.fillTriangle(cx + 7, cy + 21, cx + 5, cy + 19, cx + 8, cy + 22);
      g.fillTriangle(cx + 3, cy + 21, cx + 2, cy + 19, cx + 3, cy + 22);
      // === LION HEAD (main, left-center) ===
      // Mane — thick, layered
      g.fillStyle(0xcc8822);
      g.fillCircle(cx - 8, cy - 6, 11);
      g.fillStyle(0xbb7711);
      g.fillCircle(cx - 8, cy - 5, 9);
      g.fillStyle(0xddaa33);
      g.fillCircle(cx - 8, cy - 7, 7);
      // Lion face
      g.fillStyle(0xddaa44);
      g.fillCircle(cx - 8, cy - 6, 7);
      // Lighter muzzle
      g.fillStyle(0xeebb55);
      g.fillEllipse(cx - 8, cy - 3, 8, 5);
      // Lion eyes — fierce
      g.fillStyle(0xffffff);
      g.fillEllipse(cx - 11, cy - 8, 4, 3);
      g.fillEllipse(cx - 5, cy - 8, 4, 3);
      g.fillStyle(0xcc6600);
      g.fillCircle(cx - 11, cy - 8, 1.5);
      g.fillCircle(cx - 5, cy - 8, 1.5);
      g.fillStyle(0x000000);
      g.fillCircle(cx - 11, cy - 8, 0.8);
      g.fillCircle(cx - 5, cy - 8, 0.8);
      // Eye highlights
      g.fillStyle(0xffffff);
      g.fillCircle(cx - 12, cy - 9, 0.6);
      g.fillCircle(cx - 6, cy - 9, 0.6);
      // Lion nose
      g.fillStyle(0x663311);
      g.fillTriangle(cx - 9, cy - 4, cx - 7, cy - 4, cx - 8, cy - 2);
      // Mouth — snarling
      g.lineStyle(1.5, 0x442211);
      g.lineBetween(cx - 11, cy - 1, cx - 8, cy);
      g.lineBetween(cx - 8, cy, cx - 5, cy - 1);
      // Fangs
      g.fillStyle(0xeeeecc);
      g.fillTriangle(cx - 11, cy - 1, cx - 10, cy - 1, cx - 10.5, cy + 1);
      g.fillTriangle(cx - 6, cy - 1, cx - 5, cy - 1, cx - 5.5, cy + 1);
      // === SERPENT TAIL (right side, curving up) ===
      g.fillStyle(0x446633);
      g.fillEllipse(cx + 14, cy + 10, 8, 6);
      g.fillEllipse(cx + 18, cy + 6, 7, 6);
      g.fillEllipse(cx + 21, cy + 1, 5, 6);
      // Snake belly pattern
      g.fillStyle(0x558844, 0.5);
      g.fillEllipse(cx + 14, cy + 12, 5, 3);
      g.fillEllipse(cx + 18, cy + 8, 4, 3);
      // Snake head at tail tip — detailed
      g.fillStyle(0x336622);
      g.fillEllipse(cx + 22, cy - 4, 6, 5);
      // Snake head scales
      g.fillStyle(0x447733);
      g.fillEllipse(cx + 22, cy - 5, 4, 3);
      // Snake eyes — red, sinister
      g.fillStyle(0xff0000);
      g.fillCircle(cx + 20, cy - 5, 1.5);
      g.fillCircle(cx + 24, cy - 5, 1.5);
      g.fillStyle(0xffff00);
      g.fillCircle(cx + 20, cy - 5, 0.8);
      g.fillCircle(cx + 24, cy - 5, 0.8);
      // Forked tongue
      g.fillStyle(0xff3333);
      g.lineBetween(cx + 22, cy - 1, cx + 22, cy + 2);
      g.fillTriangle(cx + 21, cy + 2, cx + 23, cy + 2, cx + 20, cy + 4);
      g.fillTriangle(cx + 21, cy + 2, cx + 23, cy + 2, cx + 24, cy + 4);
      // Snake hood flair
      g.fillStyle(0x446633, 0.5);
      g.fillTriangle(cx + 20, cy - 6, cx + 18, cy - 2, cx + 22, cy - 2);
      g.fillTriangle(cx + 24, cy - 6, cx + 22, cy - 2, cx + 26, cy - 2);
      break;
    }

    case 'boss': {
      // Dark lord / wizard — tall robed figure, glowing hands, crown, magical aura
      // Outer magical aura — pulsing rings
      g.fillStyle(0x440066, 0.15);
      g.fillCircle(cx, cy, 23);
      g.fillStyle(0x660088, 0.1);
      g.fillCircle(cx, cy - 2, 20);
      g.fillStyle(0x880099, 0.08);
      g.fillCircle(cx, cy - 4, 16);
      // Floating shadow beneath (hovering effect)
      g.fillStyle(0x000000, 0.3);
      g.fillEllipse(cx, cy + 22, 20, 4);
      g.fillStyle(0x000000, 0.15);
      g.fillEllipse(cx, cy + 22, 26, 6);
      // Cape — grand, flowing outward
      g.fillStyle(0x110022);
      g.fillTriangle(cx - 14, cy - 8, cx - 20, cy + 20, cx + 20, cy + 20);
      g.fillTriangle(cx + 14, cy - 8, cx + 20, cy + 20, cx - 20, cy + 20);
      // Cape folds
      g.fillStyle(0x1a0033, 0.6);
      g.fillTriangle(cx - 6, cy + 2, cx - 14, cy + 20, cx, cy + 20);
      g.fillTriangle(cx + 6, cy + 2, cx + 14, cy + 20, cx, cy + 20);
      // Cape inner lining — deep crimson
      g.fillStyle(0x770011, 0.5);
      g.fillTriangle(cx - 10, cy + 4, cx - 14, cy + 18, cx, cy + 18);
      g.fillTriangle(cx + 10, cy + 4, cx + 14, cy + 18, cx, cy + 18);
      // Cape bottom edge shimmer
      g.fillStyle(0x330044, 0.5);
      g.fillRect(cx - 18, cy + 18, 36, 3);
      // Robed body — elegant, slightly narrowing
      g.fillStyle(color);
      g.fillEllipse(cx, cy + 4, 20, 22);
      // Robe layering
      g.fillStyle(darker, 0.3);
      g.fillEllipse(cx, cy + 8, 18, 14);
      g.fillStyle(color);
      g.fillEllipse(cx, cy + 6, 14, 12);
      // Center robe seam with gold trim
      g.lineStyle(1, 0xddaa00, 0.6);
      g.lineBetween(cx, cy - 4, cx, cy + 16);
      // Gold belt / sash
      g.fillStyle(0xddaa00);
      g.fillRect(cx - 8, cy + 8, 16, 2);
      g.fillStyle(0xffcc00);
      g.fillCircle(cx, cy + 9, 2);
      // Belt jewel
      g.fillStyle(0xff0044);
      g.fillCircle(cx, cy + 9, 1);
      // Collar / high collar
      g.fillStyle(darker);
      g.fillEllipse(cx, cy - 7, 16, 8);
      g.fillStyle(color);
      g.fillEllipse(cx, cy - 8, 12, 5);
      // Shoulder armor — ornate, with spikes
      g.fillStyle(darker);
      g.fillEllipse(cx - 14, cy - 5, 10, 8);
      g.fillEllipse(cx + 14, cy - 5, 10, 8);
      g.fillStyle(color);
      g.fillEllipse(cx - 14, cy - 6, 7, 5);
      g.fillEllipse(cx + 14, cy - 6, 7, 5);
      // Shoulder spikes
      g.fillStyle(darker);
      g.fillTriangle(cx - 18, cy - 8, cx - 16, cy - 4, cx - 20, cy - 3);
      g.fillTriangle(cx + 18, cy - 8, cx + 16, cy - 4, cx + 20, cy - 3);
      // Shoulder gems
      g.fillStyle(0xffcc00, 0.6);
      g.fillCircle(cx - 14, cy - 6, 1.5);
      g.fillCircle(cx + 14, cy - 6, 1.5);
      // Arms outstretched — with energy flowing
      g.fillStyle(color);
      g.fillEllipse(cx - 16, cy + 2, 6, 10);
      g.fillEllipse(cx + 16, cy + 2, 6, 10);
      // Glowing hands — left
      g.fillStyle(0x8844cc);
      g.fillCircle(cx - 18, cy + 8, 3);
      g.fillStyle(0xaa66ee);
      g.fillCircle(cx - 18, cy + 8, 2);
      g.fillStyle(0xddaaff, 0.6);
      g.fillCircle(cx - 18, cy + 8, 1);
      // Glowing hands — right
      g.fillStyle(0x8844cc);
      g.fillCircle(cx + 18, cy + 8, 3);
      g.fillStyle(0xaa66ee);
      g.fillCircle(cx + 18, cy + 8, 2);
      g.fillStyle(0xddaaff, 0.6);
      g.fillCircle(cx + 18, cy + 8, 1);
      // Energy arcs from hands
      g.lineStyle(1, 0xaa44ff, 0.5);
      g.lineBetween(cx - 18, cy + 6, cx - 20, cy + 2);
      g.lineBetween(cx - 20, cy + 2, cx - 18, cy - 2);
      g.lineBetween(cx + 18, cy + 6, cx + 20, cy + 2);
      g.lineBetween(cx + 20, cy + 2, cx + 18, cy - 2);
      // Energy particles from hands
      g.fillStyle(0xcc66ff, 0.5);
      g.fillCircle(cx - 20, cy + 2, 1);
      g.fillCircle(cx - 16, cy, 0.8);
      g.fillCircle(cx + 20, cy + 2, 1);
      g.fillCircle(cx + 16, cy, 0.8);
      // Head — hooded/shadowed
      g.fillStyle(0x110022);
      g.fillEllipse(cx, cy - 14, 16, 14);
      // Hood opening
      g.fillStyle(color);
      g.fillEllipse(cx, cy - 13, 12, 10);
      // Face — shadowed but eyes visible
      g.fillStyle(0x000000, 0.5);
      g.fillEllipse(cx, cy - 12, 10, 8);
      // Eyes — burning, multilayered
      g.fillStyle(0xff0000);
      g.fillCircle(cx - 3, cy - 14, 3);
      g.fillCircle(cx + 3, cy - 14, 3);
      g.fillStyle(0xffaa00);
      g.fillCircle(cx - 3, cy - 14, 2);
      g.fillCircle(cx + 3, cy - 14, 2);
      g.fillStyle(0xffff44);
      g.fillCircle(cx - 3, cy - 14, 1);
      g.fillCircle(cx + 3, cy - 14, 1);
      g.fillStyle(0xffffff);
      g.fillCircle(cx - 3, cy - 14, 0.5);
      g.fillCircle(cx + 3, cy - 14, 0.5);
      // Sinister grin — jagged
      g.lineStyle(1, 0xff0000, 0.7);
      g.lineBetween(cx - 4, cy - 10, cx - 2, cy - 8);
      g.lineBetween(cx - 2, cy - 8, cx, cy - 9);
      g.lineBetween(cx, cy - 9, cx + 2, cy - 8);
      g.lineBetween(cx + 2, cy - 8, cx + 4, cy - 10);
      // Crown — dark and ornate, atop hood
      g.fillStyle(0xddaa00);
      g.fillRect(cx - 7, cy - 21, 14, 3);
      // Crown spires — five points
      g.fillTriangle(cx - 6, cy - 21, cx - 5, cy - 25, cx - 4, cy - 21);
      g.fillTriangle(cx - 2, cy - 21, cx - 1, cy - 26, cx, cy - 21);
      g.fillTriangle(cx + 1, cy - 21, cx + 2, cy - 28, cx + 3, cy - 21);
      g.fillTriangle(cx + 4, cy - 21, cx + 5, cy - 25, cx + 6, cy - 21);
      // Crown detail
      g.fillStyle(0xffdd44);
      g.fillRect(cx - 6, cy - 21, 12, 1);
      // Crown jewels
      g.fillStyle(0xff0044);
      g.fillCircle(cx + 2, cy - 26, 1.5);
      g.fillStyle(0x4400ff);
      g.fillCircle(cx - 5, cy - 24, 1);
      g.fillCircle(cx + 5, cy - 24, 1);
      g.fillStyle(0x00ffaa, 0.7);
      g.fillCircle(cx - 1, cy - 24.5, 0.8);
      // Staff — tall, ornate, right side
      g.fillStyle(0x222222);
      g.fillRect(cx + 20, cy - 22, 2.5, 40);
      // Staff twisted detail
      g.fillStyle(0x333333);
      g.fillRect(cx + 20.5, cy - 20, 1, 36);
      // Staff head — cradling orb
      g.fillStyle(0x333333);
      g.fillTriangle(cx + 19, cy - 22, cx + 23, cy - 22, cx + 21, cy - 26);
      g.fillTriangle(cx + 18, cy - 24, cx + 24, cy - 24, cx + 21, cy - 22);
      // Staff orb — pulsing
      g.fillStyle(0x6600aa);
      g.fillCircle(cx + 21, cy - 26, 4);
      g.fillStyle(0x8822cc);
      g.fillCircle(cx + 21, cy - 26, 3);
      g.fillStyle(0xaa44ee);
      g.fillCircle(cx + 21, cy - 26, 2);
      g.fillStyle(0xddaaff, 0.6);
      g.fillCircle(cx + 21, cy - 27, 1);
      g.fillStyle(0xffffff, 0.4);
      g.fillCircle(cx + 20, cy - 27, 0.5);
      // Orbiting magical particles
      g.fillStyle(0xcc44ff, 0.5);
      g.fillCircle(cx - 20, cy - 16, 1.5);
      g.fillCircle(cx + 22, cy - 14, 1);
      g.fillCircle(cx - 14, cy + 16, 1.5);
      g.fillCircle(cx + 18, cy + 12, 1);
      g.fillCircle(cx - 8, cy + 20, 1);
      g.fillCircle(cx + 10, cy - 20, 0.8);
      g.fillCircle(cx - 22, cy + 4, 1.2);
      // Ground energy swirl
      g.fillStyle(0x8844cc, 0.3);
      g.fillEllipse(cx, cy + 20, 24, 3);
      break;
    }
  }
}

function generateTile(scene: Phaser.Scene, key: string, color: number, alt: number, decorator?: (g: ScaledGraphics) => void): void {
  const s = 16;
  const g = scene.add.graphics().setVisible(false);
  const sg = new ScaledGraphics(g, SPRITE_SCALE);
  sg.fillStyle(color);
  sg.fillRect(0, 0, s, s);
  // Detail pixels
  sg.fillStyle(alt);
  for (let i = 0; i < 4; i++) {
    sg.fillRect(Math.floor(Math.random() * 13) + 1, Math.floor(Math.random() * 13) + 1, 2, 2);
  }
  if (decorator) decorator(sg);
  g.generateTexture(key, s * SPRITE_SCALE, s * SPRITE_SCALE);
  g.destroy();
}

function generateTilesets(scene: Phaser.Scene): void {
  // Overworld tiles: 0=grass, 1=path, 2=water, 3=tree, 4=mountain, 5=bridge, 6=town, 7=cave, 8=castle
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
    // Rocky cliff / hillside base (brownish-gray rock mass)
    g.fillStyle(0x777766);
    g.fillRect(1, 3, 14, 12);
    // Rounded top of rock face
    g.fillStyle(0x777766);
    g.fillRect(2, 2, 12, 1);
    g.fillRect(3, 1, 10, 1);
    // Rock highlight on top edge (lighter gray)
    g.fillStyle(0x999988);
    g.fillRect(3, 1, 10, 1);
    g.fillRect(2, 2, 12, 1);
    // Mid-tone rock texture bands
    g.fillStyle(0x666655);
    g.fillRect(1, 6, 14, 1);
    g.fillRect(2, 10, 12, 1);
    // Darker rock shadows / cracks
    g.fillStyle(0x555544);
    g.fillRect(4, 4, 1, 2);
    g.fillRect(10, 3, 1, 3);
    g.fillRect(2, 8, 1, 2);
    g.fillRect(12, 7, 1, 3);
    // Cave entrance — dark arch
    g.fillStyle(0x111111);
    g.fillRect(4, 7, 8, 8);
    // Arch top (rounded with triangles and rects)
    g.fillRect(5, 6, 6, 1);
    g.fillRect(6, 5, 4, 1);
    // Very dark interior depth
    g.fillStyle(0x050505);
    g.fillRect(5, 8, 6, 7);
    g.fillRect(6, 7, 4, 1);
    // Cave entrance border / lip (rock edge around opening)
    g.fillStyle(0x888877);
    g.fillRect(3, 7, 1, 8);
    g.fillRect(12, 7, 1, 8);
    g.fillRect(4, 6, 1, 1);
    g.fillRect(11, 6, 1, 1);
    g.fillRect(5, 5, 1, 1);
    g.fillRect(10, 5, 1, 1);
    // Grass tufts at base to blend with ground
    g.fillStyle(0x44aa44);
    g.fillRect(0, 14, 3, 2);
    g.fillRect(13, 14, 3, 2);
    g.fillRect(1, 13, 2, 1);
    g.fillRect(13, 13, 2, 1);
  });
  // ow-8: Castle facade — turrets with crenellations, gate, stone texture
  generateTile(scene, 'ow-8', 0x44aa44, 0x55bb55, g => {
    // Left turret (tall, behind wall)
    g.fillStyle(0x6a6a7a);
    g.fillRect(1, 2, 4, 13);
    // Right turret
    g.fillRect(11, 2, 4, 13);
    // Left turret crenellations (battlements)
    g.fillStyle(0x7a7a8a);
    g.fillRect(1, 0, 1, 2);
    g.fillRect(3, 0, 1, 2);
    g.fillStyle(0x6a6a7a);
    g.fillRect(2, 1, 1, 1);
    g.fillRect(4, 1, 1, 1);
    // Right turret crenellations
    g.fillStyle(0x7a7a8a);
    g.fillRect(12, 0, 1, 2);
    g.fillRect(14, 0, 1, 2);
    g.fillStyle(0x6a6a7a);
    g.fillRect(11, 1, 1, 1);
    g.fillRect(13, 1, 1, 1);
    // Main castle wall (center, slightly lower)
    g.fillStyle(0x606070);
    g.fillRect(4, 4, 8, 11);
    // Wall-top crenellations (center)
    g.fillStyle(0x7a7a8a);
    g.fillRect(5, 3, 1, 1);
    g.fillRect(7, 3, 1, 1);
    g.fillRect(9, 3, 1, 1);
    g.fillRect(11, 3, 1, 1);
    // Stone texture — horizontal mortar lines
    g.fillStyle(0x555565);
    g.fillRect(4, 6, 8, 1);
    g.fillRect(4, 9, 8, 1);
    g.fillRect(4, 12, 8, 1);
    // Stone texture — vertical mortar (offset rows)
    g.fillRect(6, 4, 1, 2);
    g.fillRect(9, 4, 1, 2);
    g.fillRect(5, 7, 1, 2);
    g.fillRect(8, 7, 1, 2);
    g.fillRect(10, 7, 1, 2);
    // Turret stone texture
    g.fillStyle(0x5a5a6a);
    g.fillRect(1, 5, 4, 1);
    g.fillRect(1, 9, 4, 1);
    g.fillRect(11, 5, 4, 1);
    g.fillRect(11, 9, 4, 1);
    // Turret highlight (left edge lit)
    g.fillStyle(0x7e7e8e);
    g.fillRect(1, 2, 1, 13);
    g.fillRect(11, 2, 1, 13);
    // Gate archway (dark entrance)
    g.fillStyle(0x221111);
    g.fillRect(6, 10, 4, 5);
    g.fillRect(7, 9, 2, 1);
    // Gate wood planks
    g.fillStyle(0x553322);
    g.fillRect(6, 11, 4, 4);
    // Gate detail (iron bands)
    g.fillStyle(0x333333);
    g.fillRect(6, 12, 4, 1);
    g.fillRect(6, 14, 4, 1);
    // Gate handle dot
    g.fillStyle(0xccaa44);
    g.fillRect(9, 13, 1, 1);
    // Pennant flags on turrets
    g.fillStyle(0xcc2222);
    g.fillTriangle(2, 0, 1, 0, 1, 2);
    g.fillTriangle(13, 0, 14, 0, 14, 2);
    // Window slits on turrets
    g.fillStyle(0x222233);
    g.fillRect(2, 6, 1, 2);
    g.fillRect(13, 6, 1, 2);
  });

  // ow-9: Portal tile (swirling blue/purple arch on grass)
  generateTile(scene, 'ow-9', 0x44aa44, 0x55bb55, g => {
    // Portal arch
    g.fillStyle(0x5533aa);
    g.fillRect(2, 3, 2, 12);
    g.fillRect(12, 3, 2, 12);
    g.fillRect(2, 1, 12, 3);
    // Inner glow
    g.fillStyle(0x7744dd);
    g.fillRect(4, 4, 8, 10);
    // Swirling energy
    g.fillStyle(0x9966ff);
    g.fillRect(5, 5, 6, 8);
    g.fillStyle(0xbb88ff);
    g.fillRect(6, 6, 4, 6);
    // Bright center
    g.fillStyle(0xddbbff);
    g.fillRect(7, 7, 2, 4);
    // Keystone
    g.fillStyle(0x6633cc);
    g.fillRect(6, 1, 4, 2);
  });

  // Castle interior tiles (castle-0 through castle-10): gray stone, red carpet, torch sconces
  // 0=floor, 1=wall, 2=cracked, 3=door, 4=treasure, 5=lava, 6=stairs, 7=boss
  // 8=opened-chest, 9=stairs-down, 10=boss-exit-portal
  generateTile(scene, 'castle-0', 0x555566, 0x4a4a5a, g => {
    // Gray stone floor with subtle red carpet strip
    g.fillStyle(0x882222, 0.3);
    g.fillRect(6, 0, 4, 16);
  });
  generateTile(scene, 'castle-1', 0x333344, 0x2a2a3a, g => {
    // Dark stone wall with mortar lines
    g.lineStyle(1, 0x444455);
    g.lineBetween(0, 5, 16, 5);
    g.lineBetween(0, 11, 16, 11);
    g.lineBetween(8, 0, 8, 5);
    g.lineBetween(4, 5, 4, 11);
    g.lineBetween(12, 5, 12, 11);
    g.lineBetween(8, 11, 8, 16);
  });
  generateTile(scene, 'castle-2', 0x555566, 0x4a4a5a, g => {
    // Cracked stone floor
    g.lineStyle(1, 0x333344);
    g.lineBetween(3, 2, 7, 9);
    g.lineBetween(10, 3, 12, 11);
  });
  generateTile(scene, 'castle-3', 0x555566, 0x4a4a5a, g => {
    // Ornate archway — stone pillars with red banner
    g.fillStyle(0x666677);
    g.fillRect(1, 2, 3, 12);
    g.fillRect(12, 2, 3, 12);
    g.fillRect(1, 1, 14, 2);
    g.fillStyle(0x111122);
    g.fillRect(4, 3, 8, 11);
    // Red banner
    g.fillStyle(0x882222);
    g.fillRect(7, 1, 2, 3);
  });
  generateTile(scene, 'castle-4', 0x555566, 0x4a4a5a, g => {
    // Treasure chest on stone floor
    g.fillStyle(0xaa7722);
    g.fillRect(3, 6, 10, 8);
    g.fillStyle(0xffcc00);
    g.fillRect(4, 4, 8, 3);
    g.fillStyle(0x886611);
    g.fillRect(7, 7, 2, 2);
  });
  generateTile(scene, 'castle-5', 0x331111, 0x221111, g => {
    // Lava (same as dungeon)
    g.fillStyle(0xcc3300);
    g.fillRect(1, 1, 14, 14);
    g.fillStyle(0xff6600);
    g.fillRect(2, 3, 5, 3);
    g.fillRect(9, 8, 4, 3);
    g.fillStyle(0xffaa22);
    g.fillCircle(5, 5, 2);
    g.fillCircle(11, 10, 1);
  });
  generateTile(scene, 'castle-6', 0x555566, 0x4a4a5a, g => {
    // Castle stairs — stone steps with red carpet
    g.fillStyle(0x777788);
    g.fillRect(2, 12, 12, 3);
    g.fillStyle(0x888899);
    g.fillRect(2, 9, 9, 3);
    g.fillStyle(0x9999aa);
    g.fillRect(2, 6, 6, 3);
    g.fillStyle(0xaaaabb);
    g.fillRect(2, 3, 3, 3);
    // Red carpet on steps
    g.fillStyle(0x882222, 0.5);
    g.fillRect(6, 12, 4, 3);
    g.fillRect(5, 9, 3, 3);
    g.fillRect(4, 6, 2, 3);
    // Up arrow
    g.fillStyle(0xffcc00);
    g.fillTriangle(4, 1, 2, 3, 6, 3);
  });
  generateTile(scene, 'castle-7', 0x555566, 0x4a4a5a, g => {
    // Boss tile — throne on dark carpet
    g.fillStyle(0x442222);
    g.fillRect(2, 2, 12, 12);
    g.fillStyle(0x331111);
    g.fillRect(4, 1, 8, 14);
    // Throne silhouette
    g.fillStyle(0x220000);
    g.fillRect(5, 3, 6, 8);
    g.fillRect(6, 2, 4, 2);
    g.fillRect(4, 4, 8, 6);
    // Glowing red eyes
    g.fillStyle(0xff2222);
    g.fillRect(6, 4, 1, 1);
    g.fillRect(9, 4, 1, 1);
  });
  generateTile(scene, 'castle-8', 0x555566, 0x4a4a5a, g => {
    // Opened treasure chest (empty)
    g.fillStyle(0x665533);
    g.fillRect(3, 8, 10, 6);
    g.fillStyle(0x554422);
    g.fillRect(3, 4, 10, 5);
    g.lineStyle(1, 0x333322);
    g.lineBetween(3, 8, 13, 8);
  });
  generateTile(scene, 'castle-9', 0x555566, 0x4a4a5a, g => {
    // Castle stairs going up to next floor
    g.fillStyle(0x777788);
    g.fillRect(2, 1, 3, 3);
    g.fillStyle(0x666677);
    g.fillRect(2, 4, 6, 3);
    g.fillStyle(0x555566);
    g.fillRect(2, 7, 9, 3);
    g.fillStyle(0x444455);
    g.fillRect(2, 10, 12, 3);
    // Red carpet on stairs
    g.fillStyle(0x882222, 0.5);
    g.fillRect(3, 1, 2, 3);
    g.fillRect(5, 4, 2, 3);
    g.fillRect(7, 7, 3, 3);
    g.fillRect(9, 10, 3, 3);
    // Up arrow hint
    g.fillStyle(0xffcc00);
    g.fillTriangle(12, 14, 10, 12, 14, 12);
  });
  generateTile(scene, 'castle-10', 0x555566, 0x4a4a5a, g => {
    // Boss-exit portal — glowing golden portal in stone arch
    g.fillStyle(0x666677);
    g.fillRect(3, 2, 2, 12);
    g.fillRect(11, 2, 2, 12);
    g.fillRect(3, 1, 10, 2);
    // Golden interior
    g.fillStyle(0xddaa33);
    g.fillRect(5, 3, 6, 10);
    g.fillStyle(0xffcc44);
    g.fillCircle(8, 7, 2);
    g.fillStyle(0xffeeaa);
    g.fillCircle(8, 7, 1);
  });

  // 11 = boss warp portal (purple swirl — teleport to boss floor)
  generateTile(scene, 'castle-11', 0x555566, 0x4a4a5a, g => {
    g.fillStyle(0x332255);
    g.fillCircle(8, 8, 6);
    g.fillStyle(0x5533aa);
    g.fillCircle(8, 8, 5);
    g.fillStyle(0x7744cc);
    g.fillCircle(8, 8, 3);
    g.fillStyle(0xaa66ff);
    g.fillCircle(8, 8, 1);
    g.fillStyle(0xccaaff);
    g.fillRect(5, 4, 1, 1);
    g.fillRect(10, 6, 1, 1);
    g.fillRect(7, 11, 1, 1);
    g.fillRect(3, 8, 1, 1);
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

  // town-13: clinic roof (white/green with red cross)
  generateTile(scene, 'town-13', 0xeeffee, 0xddeecc, g => {
    // White-green peaked roof
    g.fillStyle(0xeeffee);
    g.fillRect(0, 4, 16, 12);
    g.fillStyle(0xccddbb);
    g.fillRect(0, 7, 16, 2);
    g.fillRect(0, 11, 16, 2);
    // Ridge line
    g.fillStyle(0xddeedd);
    g.fillRect(0, 3, 16, 2);
    // Red cross on roof
    g.fillStyle(0xdd3333);
    g.fillRect(6, 5, 4, 1);
    g.fillRect(7, 4, 2, 3);
    // Eave shadow
    g.fillStyle(0xaabbaa);
    g.fillRect(0, 14, 16, 2);
  });
  // town-14: clinic wall with window + green cross
  generateTile(scene, 'town-14', 0xeeeedd, 0xddddcc, g => {
    // White wall
    g.fillStyle(0xeeeedd);
    g.fillRect(0, 0, 16, 16);
    // Subtle horizontal lines
    g.fillStyle(0xddddcc);
    g.fillRect(0, 5, 16, 1);
    g.fillRect(0, 10, 16, 1);
    // Window frame
    g.fillStyle(0x447744);
    g.fillRect(4, 2, 8, 7);
    // Window glass
    g.fillStyle(0xccffcc);
    g.fillRect(5, 3, 6, 5);
    // Green cross in window
    g.fillStyle(0x33aa33);
    g.fillRect(7, 3, 2, 5);
    g.fillRect(5, 5, 6, 1);
    // Window sill
    g.fillStyle(0xddeecc);
    g.fillRect(3, 9, 10, 1);
  });
  // town-15: clinic open counter (matches shop town-12 pattern — wide dark interior + counter)
  generateTile(scene, 'town-15', 0xeeeedd, 0xddddcc, g => {
    // Dark interior behind counter (full width, like shop)
    g.fillStyle(0x223333);
    g.fillRect(0, 0, 16, 10);
    // Shelves in background
    g.fillStyle(0x334444);
    g.fillRect(2, 1, 12, 1);
    g.fillRect(2, 4, 12, 1);
    // Medical supplies on shelves
    g.fillStyle(0xcc4444);
    g.fillRect(3, 2, 2, 2); // red potion
    g.fillStyle(0x44cc44);
    g.fillRect(7, 2, 2, 2); // green herb
    g.fillStyle(0xffffff);
    g.fillRect(11, 2, 2, 2); // bandage
    // Wooden counter (full width, like shop)
    g.fillStyle(0x886633);
    g.fillRect(0, 10, 16, 4);
    g.fillStyle(0xaa8844);
    g.fillRect(0, 10, 16, 1); // counter top edge
    g.fillStyle(0x775522);
    g.fillRect(0, 13, 16, 1); // counter bottom edge
    // Red cross on counter front
    g.fillStyle(0xdd3333);
    g.fillRect(7, 11, 2, 2); // vertical
    g.fillRect(6, 12, 4, 1); // horizontal
    // Floor below counter
    g.fillStyle(0xaa9977);
    g.fillRect(0, 14, 16, 2);
  });

  // Dungeon tiles: 0=floor, 1=wall, 2=cracked, 3=door, 4=treasure, 5=lava, 6=stairs-up, 7=boss
  //   8=opened-chest, 9=stairs-down, 10=boss-exit-portal
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
  // 9 = stairs going down (descend deeper into dungeon)
  generateTile(scene, 'dng-9', 0x444444, 0x3a3a3a, g => {
    // Stairway descending — 4 steps going down (right to left)
    g.fillStyle(0x888888);
    g.fillRect(2, 1, 3, 3);     // top step
    g.fillStyle(0x777777);
    g.fillRect(2, 4, 6, 3);     // second step
    g.fillStyle(0x666666);
    g.fillRect(2, 7, 9, 3);     // third step
    g.fillStyle(0x555555);
    g.fillRect(2, 10, 12, 3);   // bottom step
    // Step edges (darker lines)
    g.lineStyle(1, 0x444444);
    g.lineBetween(2, 4, 5, 4);
    g.lineBetween(2, 7, 8, 7);
    g.lineBetween(2, 10, 11, 10);
    g.lineBetween(2, 13, 14, 13);
    // Small down arrow hint
    g.fillStyle(0xffcc00);
    g.fillTriangle(12, 14, 10, 12, 14, 12);
  });
  // 10 = boss-exit portal (glowing blue portal arch — appears after boss defeat)
  generateTile(scene, 'dng-10', 0x444444, 0x3a3a3a, g => {
    // Portal arch frame
    g.fillStyle(0x4444aa);
    g.fillRect(3, 2, 2, 12);    // left pillar
    g.fillRect(11, 2, 2, 12);   // right pillar
    g.fillRect(3, 1, 10, 2);    // arch top
    // Glowing blue interior
    g.fillStyle(0x3366ff);
    g.fillRect(5, 3, 6, 10);
    // Bright center swirl
    g.fillStyle(0x66aaff);
    g.fillCircle(8, 7, 2);
    g.fillStyle(0xaaddff);
    g.fillCircle(8, 7, 1);
    // Sparkles around portal
    g.fillStyle(0x88ccff);
    g.fillRect(6, 4, 1, 1);
    g.fillRect(9, 5, 1, 1);
    g.fillRect(7, 10, 1, 1);
    g.fillRect(10, 9, 1, 1);
  });
  // 11 = boss warp portal (purple swirl — teleport to boss floor)
  generateTile(scene, 'dng-11', 0x444444, 0x3a3a3a, g => {
    g.fillStyle(0x332255);
    g.fillCircle(8, 8, 6);
    g.fillStyle(0x5533aa);
    g.fillCircle(8, 8, 5);
    g.fillStyle(0x7744cc);
    g.fillCircle(8, 8, 3);
    g.fillStyle(0xaa66ff);
    g.fillCircle(8, 8, 1);
    // Sparkle dots
    g.fillStyle(0xccaaff);
    g.fillRect(5, 4, 1, 1);
    g.fillRect(10, 6, 1, 1);
    g.fillRect(7, 11, 1, 1);
    g.fillRect(3, 8, 1, 1);
  });
}

function generateUIAssets(scene: Phaser.Scene): void {
  // NPC sprite (simple villager)
  const gn = scene.add.graphics().setVisible(false);
  const sn = new ScaledGraphics(gn, SPRITE_SCALE);
  sn.fillStyle(0xddbb88); // skin
  sn.fillRect(6, 2, 4, 4);
  sn.fillStyle(0x553311); // hair
  sn.fillRect(5, 1, 6, 2);
  sn.fillStyle(0x44aa44); // clothes
  sn.fillRect(5, 6, 6, 6);
  sn.fillStyle(0x000000); // eyes
  sn.fillRect(7, 4, 1, 1);
  sn.fillRect(9, 4, 1, 1);
  sn.fillStyle(0x553311); // boots
  sn.fillRect(6, 12, 2, 3);
  sn.fillRect(8, 12, 2, 3);
  gn.generateTexture('npc', 16 * SPRITE_SCALE, 16 * SPRITE_SCALE);
  gn.destroy();

  // Female NPC sprite
  const gf = scene.add.graphics().setVisible(false);
  const sf = new ScaledGraphics(gf, SPRITE_SCALE);
  sf.fillStyle(0xddbb88); // skin
  sf.fillRect(6, 2, 4, 4);
  sf.fillStyle(0x663322); // hair (longer, darker brown)
  sf.fillRect(5, 1, 6, 2);
  sf.fillRect(5, 3, 1, 3); // hair sides (longer)
  sf.fillRect(10, 3, 1, 3);
  sf.fillStyle(0x7744aa); // clothes (purple)
  sf.fillRect(5, 6, 6, 4);
  sf.fillStyle(0x6633aa); // skirt (slightly darker purple, A-line)
  sf.fillRect(4, 10, 8, 2);
  sf.fillStyle(0x000000); // eyes
  sf.fillRect(7, 4, 1, 1);
  sf.fillRect(9, 4, 1, 1);
  sf.fillStyle(0x553311); // boots
  sf.fillRect(6, 12, 2, 3);
  sf.fillRect(8, 12, 2, 3);
  gf.generateTexture('npc-f', 16 * SPRITE_SCALE, 16 * SPRITE_SCALE);
  gf.destroy();

  // Save point — glowing crystal on pedestal
  const gs = scene.add.graphics().setVisible(false);
  const ss = new ScaledGraphics(gs, SPRITE_SCALE);
  // Pedestal base
  ss.fillStyle(0x666666);
  ss.fillRect(5, 12, 6, 3);
  ss.fillStyle(0x777777);
  ss.fillRect(6, 11, 4, 1);
  // Crystal body (diamond shape)
  ss.fillStyle(0x44bbff);
  ss.fillTriangle(8, 2, 4, 8, 12, 8);  // top half
  ss.fillTriangle(4, 8, 12, 8, 8, 12); // bottom half
  // Crystal highlight
  ss.fillStyle(0x88ddff, 0.8);
  ss.fillTriangle(8, 3, 5, 7, 8, 7);   // left shine
  // Bright center
  ss.fillStyle(0xffffff, 0.7);
  ss.fillRect(7, 6, 2, 2);
  // Sparkle dots
  ss.fillStyle(0xffffff, 0.9);
  ss.fillRect(3, 4, 1, 1);
  ss.fillRect(12, 5, 1, 1);
  ss.fillRect(6, 1, 1, 1);
  gs.generateTexture('save-point', 16 * SPRITE_SCALE, 16 * SPRITE_SCALE);
  gs.destroy();

  // Healer NPC sprite — feminine, blue-themed with white cross + nurse hat
  const gh = scene.add.graphics().setVisible(false);
  const sh = new ScaledGraphics(gh, SPRITE_SCALE);
  sh.fillStyle(0xffffff); // white nurse's hat
  sh.fillRect(6, 0, 4, 1); // hat brim
  sh.fillRect(7, 0, 2, 1); // hat top (slightly narrower accent)
  sh.fillStyle(0xdd3333); // red cross on hat
  sh.fillRect(7, 0, 2, 1);
  sh.fillStyle(0xffffff); // hat body
  sh.fillRect(5, 1, 6, 1); // wider brim at hair line
  sh.fillStyle(0xddbb88); // skin
  sh.fillRect(6, 2, 4, 4);
  sh.fillStyle(0x3377bb); // blue hair (longer, feminine)
  sh.fillRect(5, 2, 1, 1); // hair left of face
  sh.fillRect(10, 2, 1, 1); // hair right of face
  sh.fillRect(5, 3, 1, 3); // hair sides (longer like npc-f)
  sh.fillRect(10, 3, 1, 3);
  sh.fillStyle(0x2266bb); // blue robe top
  sh.fillRect(5, 6, 6, 4);
  sh.fillStyle(0x1155aa); // darker blue sleeves
  sh.fillRect(4, 7, 1, 3);
  sh.fillRect(11, 7, 1, 3);
  sh.fillStyle(0xffffff); // white cross on chest
  sh.fillRect(7, 7, 2, 3); // vertical bar
  sh.fillRect(6, 8, 4, 1); // horizontal bar
  sh.fillStyle(0x1a55aa); // blue skirt (A-line, wider)
  sh.fillRect(4, 10, 8, 2);
  sh.fillStyle(0x000000); // eyes
  sh.fillRect(7, 4, 1, 1);
  sh.fillRect(9, 4, 1, 1);
  // No legs — healer is behind counter
  gh.generateTexture('npc-healer', 16 * SPRITE_SCALE, 16 * SPRITE_SCALE);
  gh.destroy();

  // Shopkeeper sprite — no legs (behind counter)
  const gsh = scene.add.graphics().setVisible(false);
  const ssh = new ScaledGraphics(gsh, SPRITE_SCALE);
  ssh.fillStyle(0xddbb88);
  ssh.fillRect(6, 2, 4, 4);
  ssh.fillStyle(0x553311);
  ssh.fillRect(5, 1, 6, 2);
  ssh.fillStyle(0xcc8844);
  ssh.fillRect(5, 6, 6, 6);
  ssh.fillStyle(0x000000);
  ssh.fillRect(7, 4, 1, 1);
  ssh.fillRect(9, 4, 1, 1);
  gsh.generateTexture('shopkeeper', 16 * SPRITE_SCALE, 16 * SPRITE_SCALE);
  gsh.destroy();
}
