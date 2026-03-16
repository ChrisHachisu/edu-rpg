import Phaser from 'phaser';
import { generateAssets } from '../utils/AssetGenerator';
import { GAME_WIDTH, GAME_HEIGHT, COLORS } from '../utils/constants';

export class BootScene extends Phaser.Scene {
  constructor() {
    super('BootScene');
  }

  create(): void {
    // Patch text factory to render at higher resolution — pixelArt:true + CSS
    // image-rendering:pixelated applies nearest-neighbor to the entire canvas,
    // which makes thin/small text look fuzzy. Higher-res text textures fix this.
    {
      const textRes = Math.max(window.devicePixelRatio || 1, 2);
      const orig = Phaser.GameObjects.GameObjectFactory.prototype.text;
      (Phaser.GameObjects.GameObjectFactory.prototype as any).text = function (
        this: Phaser.GameObjects.GameObjectFactory,
        x: number, y: number, text: string | string[],
        style?: Phaser.Types.GameObjects.Text.TextStyle
      ): Phaser.GameObjects.Text {
        return orig.call(this, x, y, text, { ...(style || {}), resolution: textRes });
      };
    }

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
