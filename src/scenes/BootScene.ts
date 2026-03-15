import Phaser from 'phaser';
import { generateAssets } from '../utils/AssetGenerator';
import { GAME_WIDTH, GAME_HEIGHT, COLORS } from '../utils/constants';

export class BootScene extends Phaser.Scene {
  constructor() {
    super('BootScene');
  }

  create(): void {
    // Show loading text
    const text = this.add.text(GAME_WIDTH / 2, GAME_HEIGHT / 2, 'Loading...', {
      fontSize: '14px',
      color: COLORS.TEXT_WHITE,
      fontFamily: 'monospace',
    }).setOrigin(0.5);

    // Generate all procedural assets
    generateAssets(this);

    // Apply NEAREST filtering to sprite/tile textures (keeps pixel art crisp)
    // Text uses default LINEAR filtering for sharp readable edges
    this.textures.list && Object.keys(this.textures.list).forEach(key => {
      if (key.startsWith('ow-') || key.startsWith('town-') || key.startsWith('dng-') ||
          key.startsWith('hero') || key.startsWith('monster-') ||
          key === 'npc' || key === 'save-point' || key === 'shopkeeper') {
        const tex = this.textures.get(key);
        if (tex?.source?.[0]?.glTexture) {
          tex.setFilter(Phaser.Textures.FilterMode.NEAREST);
        }
      }
    });

    // Override Phaser's inline pixelated style so text renders with smooth edges
    const canvas = this.sys.game.canvas;
    canvas.style.imageRendering = 'auto';

    text.setText('Ready!');

    // Use window.setTimeout for reliable scene transition
    const scene = this;
    window.setTimeout(() => {
      scene.scene.start('TitleScene');
    }, 400);
  }
}
