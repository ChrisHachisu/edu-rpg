import Phaser from 'phaser';
import { generateAssets } from '../utils/AssetGenerator';
import { GAME_WIDTH, GAME_HEIGHT, ZOOM, COLORS, FONT_FAMILY } from '../utils/constants';

// Monster sprite image keys to preload from public/assets/monsters/
const MONSTER_SPRITE_IMAGES = [
  // Base and boss sprites
  'monster-slime', 'monster-bug', 'monster-rabbit', 'monster-wolf',
  'monster-mushroom', 'monster-bandit', 'monster-bat', 'monster-spider',
  'monster-crab', 'monster-golem', 'monster-giantToad', 'monster-serpent',
  'monster-jellyfish', 'monster-piranha', 'monster-merfolk', 'monster-harpy',
  'monster-wyvern', 'monster-kraken', 'monster-dragon', 'monster-blizzardBear',
  'monster-iceSprite', 'monster-darkSorcerer', 'monster-lizard', 'monster-knight',
  'monster-skeleton', 'monster-wraith', 'monster-fireElemental', 'monster-chimera',
  'monster-demon', 'monster-shadow', 'monster-shadowWisp', 'monster-lich', 'monster-flameTitan',
  'monster-banditLord', 'monster-seaStar', 'monster-mummy', 'monster-stormRaptor',
  'monster-templeGuard', 'monster-ancientSphinx', 'monster-stormSentinel',
  'monster-frostMonarch', 'monster-swordWraith', 'monster-celestialGuardian',
  'monster-demonKing',
  // Color variants and expansion sprites
  'monster-magmaSlime', 'monster-frostWolf', 'monster-frostStalker',
  'monster-flameBat', 'monster-sandGolem', 'monster-lavaGolem',
  'monster-glacialGolem', 'monster-frozenSkeleton', 'monster-sandWraith',
  'monster-cloudWraith', 'monster-voidShade', 'monster-iceWyrm',
  'monster-lavaWyrm', 'monster-darkKnight', 'monster-stormHarpy',
  'monster-giantCrab', 'monster-banditArcher', 'monster-mimic',
  'monster-mosswarden', 'monster-coralTitan', 'monster-oreColossus',
  'monster-phantomStag', 'monster-sandSerpentQueen', 'monster-ashenGuardian',
  'monster-magmaBeetleKing', 'monster-crystalHydra', 'monster-warGeneralMalachar',
  'monster-nullDevourer',
];

const NPC_SPRITE_IMAGES = [
  'npc-sage', 'npc-elder', 'npc-kiki', 'npc-drake', 'npc-gordo',
  'npc-luna', 'npc-knight', 'npc-guard-f', 'npc-archaeologist',
];

export class BootScene extends Phaser.Scene {
  constructor() {
    super('BootScene');
  }

  preload(): void {
    const assetBase = `${import.meta.env.BASE_URL}assets/`;
    const monsterBase = `${assetBase}monsters/`;
    const npcBase = `${assetBase}npcs/`;

    // Preload monster sprite images (hand-drawn pixel art)
    for (const key of MONSTER_SPRITE_IMAGES) {
      this.load.image(key, `${monsterBase}${key}.png`);
    }

    for (const key of NPC_SPRITE_IMAGES) {
      this.load.image(key, `${npcBase}${key}.png`);
    }
  }

  create(): void {
    this.cameras.main.setZoom(ZOOM);
    this.cameras.main.setScroll(-GAME_WIDTH * (ZOOM - 1) / 2, -GAME_HEIGHT * (ZOOM - 1) / 2);

    // Font is pre-loaded in main.ts before Phaser starts

    // Show loading text
    const text = this.add.text(GAME_WIDTH / 2, GAME_HEIGHT / 2, 'Loading...', {
      fontSize: '14px',
      color: COLORS.TEXT_WHITE,
      fontFamily: FONT_FAMILY,
    }).setOrigin(0.5);

    // Generate procedural assets (skips monsters that were preloaded as images)
    generateAssets(this);

    text.setText('Ready!');

    // Use window.setTimeout for reliable scene transition
    const scene = this;
    window.setTimeout(() => {
      scene.scene.start('TitleScene');
    }, 400);
  }
}
