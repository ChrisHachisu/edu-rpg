import Phaser from 'phaser';
import { GAME_WIDTH, GAME_HEIGHT, COLORS } from '../utils/constants';
import { t } from '../i18n/i18n';
import { gameState } from '../GameState';
import { audioManager } from '../systems/audio/AudioManager';

export class VictoryScene extends Phaser.Scene {
  private menuIndex = 0;
  private menuItems: Phaser.GameObjects.Text[] = [];

  constructor() {
    super('VictoryScene');
  }

  create(): void {
    this.menuIndex = 0;
    this.menuItems = [];
    this.cameras.main.setBackgroundColor(0x112244);
    audioManager.playBgm('victory');

    // Stars effect
    for (let i = 0; i < 30; i++) {
      const star = this.add.circle(
        Math.random() * GAME_WIDTH,
        Math.random() * GAME_HEIGHT,
        2,
        0xffffff,
        0.5 + Math.random() * 0.5
      );
      this.tweens.add({
        targets: star,
        alpha: 0.2,
        duration: 1000 + Math.random() * 2000,
        yoyo: true,
        repeat: -1,
      });
    }

    this.add.text(GAME_WIDTH / 2, 60, t('victory.title'), {
      fontSize: '22px', color: COLORS.TEXT_YELLOW, fontFamily: 'monospace', fontStyle: 'bold',
    }).setOrigin(0.5);

    this.add.text(GAME_WIDTH / 2, 100, t('victory.message'), {
      fontSize: '12px', color: COLORS.TEXT_WHITE, fontFamily: 'monospace',
      wordWrap: { width: GAME_WIDTH - 64 },
      align: 'center',
    }).setOrigin(0.5);

    this.add.text(GAME_WIDTH / 2, 130, t('victory.subtitle'), {
      fontSize: '11px', color: '#88ccff', fontFamily: 'monospace',
      wordWrap: { width: GAME_WIDTH - 64 },
      align: 'center',
    }).setOrigin(0.5);

    // Clear time
    const totalSeconds = Math.floor(gameState.playtime + (Date.now() - gameState.startTime) / 1000);
    const hours = Math.floor(totalSeconds / 3600);
    const mins = Math.floor((totalSeconds % 3600) / 60);
    const secs = totalSeconds % 60;
    const timeStr = hours > 0
      ? `${hours}:${String(mins).padStart(2, '0')}:${String(secs).padStart(2, '0')}`
      : `${mins}:${String(secs).padStart(2, '0')}`;
    this.add.text(GAME_WIDTH / 2, 165, t('victory.time', { time: timeStr }), {
      fontSize: '12px', color: COLORS.TEXT_YELLOW, fontFamily: 'monospace',
    }).setOrigin(0.5);

    // Difficulty display
    const grade = gameState.player.state.quizDifficulty;
    this.add.text(GAME_WIDTH / 2, 190, t('victory.difficulty', { grade: t(`grade.${grade}`) }), {
      fontSize: '12px', color: COLORS.TEXT_WHITE, fontFamily: 'monospace',
    }).setOrigin(0.5);

    // Quiz stats
    const stats = gameState.quizManager.getStats();
    const pct = stats.totalAsked > 0 ? Math.round(stats.totalCorrect / stats.totalAsked * 100) : 0;
    this.add.text(GAME_WIDTH / 2, 215, t('victory.stats', {
      correct: stats.totalCorrect,
      total: stats.totalAsked,
      pct,
    }), {
      fontSize: '12px', color: COLORS.TEXT_WHITE, fontFamily: 'monospace',
    }).setOrigin(0.5);

    // Hero
    if (this.textures.exists('hero-walk')) {
      this.add.image(GAME_WIDTH / 2, 290, 'hero-walk', 0).setScale(6);
    }

    this.add.text(GAME_WIDTH / 2, 355, t('victory.thanks'), {
      fontSize: '14px', color: COLORS.TEXT_YELLOW, fontFamily: 'monospace',
    }).setOrigin(0.5);

    // NG+ / Title Screen menu
    const menuY = 395;
    const ngPlusText = this.add.text(GAME_WIDTH / 2, menuY, t('victory.ngplus'), {
      fontSize: '12px', color: COLORS.TEXT_YELLOW, fontFamily: 'monospace',
    }).setOrigin(0.5);
    this.menuItems.push(ngPlusText);

    const titleText = this.add.text(GAME_WIDTH / 2, menuY + 28, t('victory.titleScreen'), {
      fontSize: '12px', color: COLORS.TEXT_WHITE, fontFamily: 'monospace',
    }).setOrigin(0.5);
    this.menuItems.push(titleText);

    this.updateMenuSelection();

    this.input.keyboard?.on('keydown-UP', () => {
      this.menuIndex = Math.max(0, this.menuIndex - 1);
      audioManager.playSfx('menu_select');
      this.updateMenuSelection();
    });
    this.input.keyboard?.on('keydown-DOWN', () => {
      this.menuIndex = Math.min(1, this.menuIndex + 1);
      audioManager.playSfx('menu_select');
      this.updateMenuSelection();
    });

    this.input.keyboard?.on('keydown-ENTER', () => this.confirmChoice());
    this.input.keyboard?.on('keydown-Z', () => this.confirmChoice());
  }

  private updateMenuSelection(): void {
    this.menuItems.forEach((item, i) => {
      item.setColor(i === this.menuIndex ? COLORS.TEXT_YELLOW : COLORS.TEXT_WHITE);
    });
  }

  private confirmChoice(): void {
    if (this.menuIndex === 0) {
      // NG+
      gameState.prepareNewGamePlus();
      this.scene.start('TitleScene', { ngPlus: true });
    } else {
      // Title Screen
      this.scene.start('TitleScene');
    }
  }

  shutdown(): void {
    this.input.keyboard?.removeAllListeners();
  }
}
