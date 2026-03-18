import Phaser from 'phaser';
import { GAME_WIDTH, GAME_HEIGHT, ZOOM, COLORS, FONT_FAMILY } from '../utils/constants';
import { t } from '../i18n/i18n';
import { gameState } from '../GameState';
import { audioManager } from '../systems/audio/AudioManager';
import { SaveManager } from '../systems/progression/SaveManager';

export class GameOverScene extends Phaser.Scene {
  private menuIndex = 0;
  private menuTexts: Phaser.GameObjects.Text[] = [];
  private maxIndex = 2;

  constructor() {
    super('GameOverScene');
  }

  create(): void {
    this.cameras.main.setZoom(ZOOM);
    this.cameras.main.setScroll(-GAME_WIDTH * (ZOOM - 1) / 2, -GAME_HEIGHT * (ZOOM - 1) / 2);
    // CRITICAL: Remove ALL stale keyboard listeners from any previous scene run
    // Without this, listeners stack on every scene restart causing duplicate handlers
    this.input.keyboard?.removeAllListeners();

    this.cameras.main.setBackgroundColor(0x110000);
    // Clear any lingering camera effects from previous scene
    this.cameras.main.resetFX();
    this.menuIndex = 0;
    this.menuTexts = [];
    audioManager.playBgm('gameOver');

    this.add.text(GAME_WIDTH / 2, 120, t('gameover.title'), {
      fontSize: '22px', color: '#cc2222', fontFamily: FONT_FAMILY, fontStyle: 'bold',
    }).setOrigin(0.5);

    // Options: Retry (auto-save), Restart from save point (manual save + portal flags), Title
    const options = [
      { key: 'gameover.retry', action: 'retry' },
      { key: 'gameover.restart_save', action: 'restart_save' },
      { key: 'gameover.title_screen', action: 'title' },
    ];

    // Grey out "Restart from save point" if no manual save exists
    const hasSave = SaveManager.hasSave();

    this.menuTexts = options.map((opt, i) => {
      const isDisabled = opt.action === 'restart_save' && !hasSave;
      return this.add.text(GAME_WIDTH / 2, 220 + i * 36, t(opt.key), {
        fontSize: '14px',
        color: isDisabled ? COLORS.TEXT_GRAY
          : i === this.menuIndex ? COLORS.TEXT_YELLOW : COLORS.TEXT_WHITE,
        fontFamily: FONT_FAMILY,
      }).setOrigin(0.5).setData('action', opt.action).setData('disabled', isDisabled);
    });

    this.maxIndex = options.length - 1;

    // Cursor indicator
    this.add.text(GAME_WIDTH / 2 - 80, 220 + this.menuIndex * 36, '▶', {
      fontSize: '14px', color: COLORS.TEXT_YELLOW, fontFamily: FONT_FAMILY,
    }).setOrigin(0.5).setName('cursor');

    // Register input handlers (safe — we cleared all listeners above)
    this.input.keyboard?.on('keydown-UP', () => {
      if (this.menuIndex > 0) {
        this.menuIndex--;
        this.updateMenuHighlight();
      }
    });
    this.input.keyboard?.on('keydown-DOWN', () => {
      if (this.menuIndex < this.maxIndex) {
        this.menuIndex++;
        this.updateMenuHighlight();
      }
    });

    const confirm = () => {
      const selected = this.menuTexts[this.menuIndex];
      // Ignore confirm on disabled options
      if (selected?.getData('disabled')) {
        audioManager.playSfx('menu_cancel');
        return;
      }
      // Prevent double-confirm by removing all listeners immediately
      this.input.keyboard?.removeAllListeners();
      const action = selected?.getData('action');
      if (action === 'retry') {
        // Retry: load auto-save (pre-boss), fall back to manual save
        if (gameState.loadAutoSave()) {
          this.scene.start('WorldMapScene');
        } else if (gameState.loadGame()) {
          this.scene.start('WorldMapScene');
        } else {
          this.scene.start('TitleScene');
        }
      } else if (action === 'restart_save') {
        // Restart from last save point: load manual save + merge boss encounter flags
        if (gameState.loadGameWithPortalFlags()) {
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

    // Also clean up on scene shutdown (belt + suspenders)
    this.events.once('shutdown', () => {
      this.input.keyboard?.removeAllListeners();
    });
  }

  private updateMenuHighlight(): void {
    this.menuTexts.forEach((text, i) => {
      if (text.getData('disabled')) {
        text.setColor(COLORS.TEXT_GRAY);
      } else {
        text.setColor(i === this.menuIndex ? COLORS.TEXT_YELLOW : COLORS.TEXT_WHITE);
      }
    });
    // Move cursor indicator
    const cursor = this.children.getByName('cursor') as Phaser.GameObjects.Text;
    if (cursor) {
      cursor.setY(220 + this.menuIndex * 36);
    }
    audioManager.playSfx('menu_select');
  }
}
