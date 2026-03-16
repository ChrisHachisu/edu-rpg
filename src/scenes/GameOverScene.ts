import Phaser from 'phaser';
import { GAME_WIDTH, GAME_HEIGHT, COLORS } from '../utils/constants';
import { t } from '../i18n/i18n';
import { SaveManager } from '../systems/progression/SaveManager';
import { gameState } from '../GameState';
import { audioManager } from '../systems/audio/AudioManager';

export class GameOverScene extends Phaser.Scene {
  private menuIndex = 0;

  constructor() {
    super('GameOverScene');
  }

  create(): void {
    this.cameras.main.setBackgroundColor(0x110000);
    this.menuIndex = 0;
    audioManager.playBgm('gameOver');

    this.add.text(GAME_WIDTH / 2, 120, t('gameover.title'), {
      fontSize: '22px', color: '#cc2222', fontFamily: 'monospace', fontStyle: 'bold',
    }).setOrigin(0.5);

    // Options
    const options = [
      { key: 'gameover.retry', action: 'retry' },
      { key: 'gameover.title_screen', action: 'title' },
    ];

    options.forEach((opt, i) => {
      this.add.text(GAME_WIDTH / 2, 240 + i * 40, t(opt.key), {
        fontSize: '14px',
        color: i === 0 ? COLORS.TEXT_YELLOW : COLORS.TEXT_WHITE,
        fontFamily: 'monospace',
      }).setOrigin(0.5).setData('action', opt.action);
    });

    this.input.keyboard?.on('keydown-UP', () => { this.menuIndex = 0; this.create(); });
    this.input.keyboard?.on('keydown-DOWN', () => { this.menuIndex = 1; this.create(); });

    const confirm = () => {
      if (this.menuIndex === 0) {
        // Retry: load last save
        if (gameState.loadGame()) {
          this.scene.start('WorldMapScene');
        } else {
          this.scene.start('TitleScene');
        }
      } else {
        this.scene.start('TitleScene');
      }
    };

    this.input.keyboard?.on('keydown-Z', confirm);
    this.input.keyboard?.on('keydown-ENTER', confirm);
  }
}
