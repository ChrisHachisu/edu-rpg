import Phaser from 'phaser';
import { GAME_WIDTH, GAME_HEIGHT, COLORS } from '../utils/constants';
import { t, setLocale, getLocale } from '../i18n/i18n';
import { SaveManager } from '../systems/progression/SaveManager';
import { GradeLevel } from '../utils/types';
import { gameState } from '../GameState';
import { audioManager } from '../systems/audio/AudioManager';

export class TitleScene extends Phaser.Scene {
  private menuItems: Phaser.GameObjects.Text[] = [];
  private selectedIndex = 0;
  private settingsMode = false;
  private difficultyOptions: GradeLevel[] = ['k', '1', '2', '3', '4', '5', '6'];
  private difficultyIndex = 1; // default: grade 1

  constructor() {
    super('TitleScene');
  }

  private audioInitialized = false;

  create(): void {
    this.cameras.main.setBackgroundColor(COLORS.DARK_BLUE);
    this.selectedIndex = 0;
    this.settingsMode = false;
    this.drawTitle();
    this.setupInput();
    this.initAudioOnGesture();
  }

  private initAudioOnGesture(): void {
    if (this.audioInitialized) {
      // Already initialized — just play title BGM
      audioManager.playBgm('title');
      return;
    }
    // Initialize audio on first user gesture (required by Chrome/Safari autoplay policy)
    const initHandler = async () => {
      if (this.audioInitialized) return;
      this.audioInitialized = true;
      await audioManager.init();
      audioManager.playBgm('title');
    };
    this.input.keyboard?.on('keydown', initHandler);
    this.input.on('pointerdown', initHandler);
  }

  private drawTitle(): void {
    // Clear previous
    this.children.removeAll();
    this.menuItems = [];

    if (this.settingsMode) {
      this.drawSettings();
      return;
    }

    // Title
    this.add.text(GAME_WIDTH / 2, 80, t('title.gameName'), {
      fontSize: '20px',
      color: COLORS.TEXT_YELLOW,
      fontFamily: 'monospace',
      fontStyle: 'bold',
    }).setOrigin(0.5);

    this.add.text(GAME_WIDTH / 2, 112, t('title.subtitle'), {
      fontSize: '12px',
      color: COLORS.TEXT_GRAY,
      fontFamily: 'monospace',
    }).setOrigin(0.5);

    // Decorative hero sprite
    if (this.textures.exists('hero-walk')) {
      this.add.image(GAME_WIDTH / 2, 180, 'hero-walk', 0).setScale(6);
    }

    // Menu options
    const menuY = 260;
    const options = [
      { key: 'title.newGame', action: 'new' },
      ...(SaveManager.hasSave() ? [{ key: 'title.continue', action: 'continue' }] : []),
      { key: 'title.settings', action: 'settings' },
    ];

    options.forEach((opt, i) => {
      const text = this.add.text(GAME_WIDTH / 2, menuY + i * 36, t(opt.key), {
        fontSize: '14px',
        color: i === this.selectedIndex ? COLORS.TEXT_YELLOW : COLORS.TEXT_WHITE,
        fontFamily: 'monospace',
      }).setOrigin(0.5);
      text.setData('action', opt.action);
      this.menuItems.push(text);
    });

    // Language toggle
    const langText = getLocale() === 'ja' ? 'EN / JA ←' : '→ EN / JA';
    this.add.text(GAME_WIDTH - 16, GAME_HEIGHT - 20, langText, {
      fontSize: '10px',
      color: COLORS.TEXT_GRAY,
      fontFamily: 'monospace',
    }).setOrigin(1, 0.5).setInteractive().on('pointerdown', () => {
      setLocale(getLocale() === 'ja' ? 'en' : 'ja');
      this.drawTitle();
    });

    this.updateSelection();
  }

  private drawSettings(): void {
    this.add.text(GAME_WIDTH / 2, 40, t('settings.title'), {
      fontSize: '16px',
      color: COLORS.TEXT_YELLOW,
      fontFamily: 'monospace',
      fontStyle: 'bold',
    }).setOrigin(0.5);

    // Difficulty
    this.add.text(GAME_WIDTH / 2, 100, t('settings.difficulty'), {
      fontSize: '14px',
      color: COLORS.TEXT_WHITE,
      fontFamily: 'monospace',
    }).setOrigin(0.5);

    this.difficultyOptions.forEach((grade, i) => {
      const cols = 4;
      const text = this.add.text(64 + (i % cols) * 104, 140 + Math.floor(i / cols) * 36, t(`grade.${grade}`), {
        fontSize: '10px',
        color: i === this.difficultyIndex ? COLORS.TEXT_YELLOW : COLORS.TEXT_WHITE,
        fontFamily: 'monospace',
      }).setOrigin(0.5);
      this.menuItems.push(text);
    });

    // Language toggle
    this.add.text(GAME_WIDTH / 2, 240, t('settings.language'), {
      fontSize: '14px',
      color: COLORS.TEXT_WHITE,
      fontFamily: 'monospace',
    }).setOrigin(0.5);

    const langItem = this.add.text(GAME_WIDTH / 2, 276, getLocale() === 'ja' ? '日本語' : 'English', {
      fontSize: '14px',
      color: COLORS.TEXT_YELLOW,
      fontFamily: 'monospace',
    }).setOrigin(0.5);
    langItem.setData('action', 'toggleLang');
    this.menuItems.push(langItem);

    // Back button
    const backItem = this.add.text(GAME_WIDTH / 2, 340, t('settings.back'), {
      fontSize: '14px',
      color: COLORS.TEXT_WHITE,
      fontFamily: 'monospace',
    }).setOrigin(0.5);
    backItem.setData('action', 'back');
    this.menuItems.push(backItem);
  }

  private setupInput(): void {
    // Export shortcut: Ctrl+E (or Cmd+E on Mac)
    this.input.keyboard?.on('keydown-E', (event: KeyboardEvent) => {
      if (event.ctrlKey || event.metaKey) {
        event.preventDefault();
        this.scene.start('ExportScene');
      }
    });

    this.input.keyboard?.on('keydown-UP', () => this.moveSelection(-1));
    this.input.keyboard?.on('keydown-DOWN', () => this.moveSelection(1));
    this.input.keyboard?.on('keydown-LEFT', () => {
      if (this.settingsMode && this.selectedIndex < this.difficultyOptions.length) {
        this.difficultyIndex = Math.max(0, this.difficultyIndex - 1);
        this.drawTitle();
      }
    });
    this.input.keyboard?.on('keydown-RIGHT', () => {
      if (this.settingsMode && this.selectedIndex < this.difficultyOptions.length) {
        this.difficultyIndex = Math.min(this.difficultyOptions.length - 1, this.difficultyIndex + 1);
        this.drawTitle();
      }
    });
    this.input.keyboard?.on('keydown-ENTER', () => this.confirmSelection());
    this.input.keyboard?.on('keydown-SPACE', () => this.confirmSelection());
    this.input.keyboard?.on('keydown-Z', () => this.confirmSelection());
  }

  private moveSelection(dir: number): void {
    const prev = this.selectedIndex;
    this.selectedIndex = Math.max(0, Math.min(this.menuItems.length - 1, this.selectedIndex + dir));
    if (this.selectedIndex !== prev) audioManager.playSfx('menu_select');
    this.updateSelection();
  }

  private updateSelection(): void {
    this.menuItems.forEach((item, i) => {
      item.setColor(i === this.selectedIndex ? COLORS.TEXT_YELLOW : COLORS.TEXT_WHITE);
    });
  }

  private confirmSelection(): void {
    if (this.settingsMode) {
      if (this.selectedIndex < this.difficultyOptions.length) {
        this.difficultyIndex = this.selectedIndex;
        this.drawTitle();
        return;
      }
      const action = this.menuItems[this.selectedIndex]?.getData('action');
      if (action === 'toggleLang') {
        setLocale(getLocale() === 'ja' ? 'en' : 'ja');
        this.drawTitle();
      } else if (action === 'back') {
        this.settingsMode = false;
        this.selectedIndex = 0;
        this.drawTitle();
      }
      return;
    }

    const action = this.menuItems[this.selectedIndex]?.getData('action');
    audioManager.playSfx('menu_select');
    if (action === 'new') {
      gameState.newGame(this.difficultyOptions[this.difficultyIndex]);
      this.scene.start('WorldMapScene');
    } else if (action === 'continue') {
      if (gameState.loadGame()) {
        this.scene.start('WorldMapScene');
      }
    } else if (action === 'settings') {
      this.settingsMode = true;
      this.selectedIndex = this.difficultyIndex;
      this.drawTitle();
    }
  }
}
