import Phaser from 'phaser';
import { GAME_WIDTH, GAME_HEIGHT, ZOOM, CANVAS_CSS_WIDTH, CANVAS_CSS_HEIGHT } from './utils/constants';
import { BootScene } from './scenes/BootScene';
import { TitleScene } from './scenes/TitleScene';
import { WorldMapScene } from './scenes/WorldMapScene';
import { BattleScene } from './scenes/BattleScene';
import { MenuScene } from './scenes/MenuScene';
import { ShopScene } from './scenes/ShopScene';
import { GameOverScene } from './scenes/GameOverScene';
import { VictoryScene } from './scenes/VictoryScene';
import { ExportScene } from './scenes/ExportScene';

// Load pixel font BEFORE Phaser starts — Phaser doesn't await async create(),
// so fonts loaded there arrive too late for canvas text rendering.
(async () => {
  try {
    const font = new FontFace(
      'PixelMplus12',
      'url(./fonts/PixelMplus12-Regular.ttf)'
    );
    await font.load();
    (document.fonts as any).add(font);
  } catch {
    console.warn('PixelMplus12 font failed to load, falling back to monospace');
  }

  // Patch text factory so ALL text renders at native resolution (eliminates haze on Retina).
  // Text is normally rasterized at 1× then zoomed by the camera, which magnifies anti-aliased edges.
  // Setting resolution = ZOOM makes the internal canvas match the final display size → 1:1 crisp.
  const origText = Phaser.GameObjects.GameObjectFactory.prototype.text;
  Phaser.GameObjects.GameObjectFactory.prototype.text = function (
    this: Phaser.GameObjects.GameObjectFactory,
    x: number, y: number, text: string | string[], style?: Phaser.Types.GameObjects.Text.TextStyle,
  ) {
    const obj = origText.call(this, x, y, text, style);
    obj.setResolution(ZOOM);
    return obj;
  };

  const config: Phaser.Types.Core.GameConfig = {
    type: Phaser.AUTO,
    width: GAME_WIDTH * ZOOM,
    height: GAME_HEIGHT * ZOOM,
    pixelArt: true,
    roundPixels: true,
    backgroundColor: '#111111',
    scale: {
      mode: Phaser.Scale.NONE,   // no browser scaling — pixel-perfect 1:1
    },
    parent: 'game-container',
    scene: [
      BootScene,
      TitleScene,
      WorldMapScene,
      BattleScene,
      MenuScene,
      ShopScene,
      GameOverScene,
      VictoryScene,
      ExportScene,
    ],
  };

  const game = new Phaser.Game(config);
  (window as any).__PHASER_GAME__ = game;

  // Force canvas CSS size so physical pixels = canvas pixels (1:1 on Retina)
  const canvas = game.canvas;
  canvas.style.width = `${CANVAS_CSS_WIDTH}px`;
  canvas.style.height = `${CANVAS_CSS_HEIGHT}px`;
})();

