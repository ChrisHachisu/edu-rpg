import Phaser from 'phaser';
import { generateAssets } from '../utils/AssetGenerator';
import { GAME_WIDTH, GAME_HEIGHT, COLORS } from '../utils/constants';
import { enableSmoothText } from '../utils/text';

export class BootScene extends Phaser.Scene {
  constructor() {
    super('BootScene');
  }

  create(): void {
    // Override text texture filtering: pixelArt:true forces NEAREST on all
    // textures including text, making it unreadable. This patches the factory
    // so every this.add.text() call uses LINEAR filtering instead.
    enableSmoothText();

    // Show loading text
    const text = this.add.text(GAME_WIDTH / 2, GAME_HEIGHT / 2, 'Loading...', {
      fontSize: '14px',
      color: COLORS.TEXT_WHITE,
      fontFamily: 'monospace',
    }).setOrigin(0.5);

    // Generate all procedural assets
    generateAssets(this);

    // pixelArt: true in GameConfig handles NEAREST filtering globally

    text.setText('Ready!');

    // Use window.setTimeout for reliable scene transition
    const scene = this;
    window.setTimeout(() => {
      scene.scene.start('TitleScene');
    }, 400);
  }
}
