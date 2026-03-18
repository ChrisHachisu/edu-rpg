import Phaser from 'phaser';
import { generateAssets } from '../utils/AssetGenerator';
import { GAME_WIDTH, GAME_HEIGHT, ZOOM, COLORS, FONT_FAMILY } from '../utils/constants';
// enableSmoothText removed — DPR-aware canvas + NEAREST filtering keeps pixel font crisp

export class BootScene extends Phaser.Scene {
  constructor() {
    super('BootScene');
  }

  create(): void {
    this.cameras.main.setZoom(ZOOM);
    this.cameras.main.setScroll(-GAME_WIDTH * (ZOOM - 1) / 2, -GAME_HEIGHT * (ZOOM - 1) / 2);
    // With DPR-aware canvas resolution (4× on Retina), the browser downscales
    // rather than upscales. pixelArt:true NEAREST filtering keeps the pixel font
    // crisp — LINEAR would blur it. No smoothText patch needed.

    // Font is pre-loaded in main.ts before Phaser starts

    // Show loading text
    const text = this.add.text(GAME_WIDTH / 2, GAME_HEIGHT / 2, 'Loading...', {
      fontSize: '14px',
      color: COLORS.TEXT_WHITE,
      fontFamily: FONT_FAMILY,
    }).setOrigin(0.5);

    // Generate all procedural assets
    generateAssets(this);

    text.setText('Ready!');

    // Use window.setTimeout for reliable scene transition
    const scene = this;
    window.setTimeout(() => {
      scene.scene.start('TitleScene');
    }, 400);
  }
}
