import Phaser from 'phaser';
import { GAME_WIDTH, GAME_HEIGHT, ZOOM, COLORS, FONT_FAMILY } from '../utils/constants';
import { t, setLocale, getLocale, setKanjiMode, getKanjiMode } from '../i18n/i18n';
import { SaveManager } from '../systems/progression/SaveManager';
import { GradeLevel, HeroColorScheme } from '../utils/types';
import { gameState } from '../GameState';
import { audioManager } from '../systems/audio/AudioManager';
import { regenerateHeroSprites } from '../utils/AssetGenerator';

type ScreenMode = 'title' | 'create';

/** Which row the cursor is on in the create screen */
type CreateRow = 'name' | 'color' | 'difficulty' | 'language' | 'kanji' | 'start';

export class TitleScene extends Phaser.Scene {
  private menuItems: Phaser.GameObjects.Text[] = [];
  private selectedIndex = 0;
  private mode: ScreenMode = 'title';

  // Character creation state
  private heroName = '';
  private colorOptions: HeroColorScheme[] = ['gray', 'blue', 'pink', 'black'];
  private colorIndex = 0;
  private difficultyOptions: GradeLevel[] = ['k', '1', '2', '3', '4', '5', '6'];
  private difficultyIndex = 1; // default: grade 1
  private createRow: CreateRow = 'name';
  private get createRows(): CreateRow[] {
    const rows: CreateRow[] = ['name', 'color', 'difficulty', 'language'];
    if (getLocale() === 'ja') rows.push('kanji');
    rows.push('start');
    return rows;
  }
  private nameInputEl: HTMLInputElement | null = null;
  private errorText: Phaser.GameObjects.Text | null = null;
  private heroPreview: Phaser.GameObjects.Image | null = null;
  private blinkTimer: Phaser.Time.TimerEvent | null = null;
  private ngPlus = false;

  constructor() {
    super('TitleScene');
  }

  private audioInitialized = false;

  create(data?: { ngPlus?: boolean }): void {
    this.cameras.main.setZoom(ZOOM);
    this.cameras.main.setScroll(-GAME_WIDTH * (ZOOM - 1) / 2, -GAME_HEIGHT * (ZOOM - 1) / 2);
    this.cameras.main.setBackgroundColor(COLORS.DARK_BLUE);
    this.selectedIndex = 0;
    this.heroName = '';
    this.colorIndex = 0;
    this.createRow = 'name';
    this.ngPlus = data?.ngPlus ?? false;

    if (this.ngPlus && gameState.ngPlusData) {
      // NG+: skip title, go straight to create screen with locked name
      this.mode = 'create';
      this.heroName = gameState.ngPlusData.heroName;
      // Map heroColor to colorIndex
      const savedColor = gameState.ngPlusData.heroColor;
      const colorIdx = this.colorOptions.indexOf(savedColor);
      if (colorIdx >= 0) this.colorIndex = colorIdx;
      // Skip name row in NG+ mode
      this.createRow = 'color';
    } else {
      this.mode = 'title';
      this.ngPlus = false;
    }

    this.draw();
    this.setupInput();
    this.initAudioOnGesture();
  }

  shutdown(): void {
    this.removeNameInput();
  }

  private initAudioOnGesture(): void {
    if (this.audioInitialized) {
      audioManager.playBgm('title');
      return;
    }
    const initHandler = async () => {
      if (this.audioInitialized) return;
      this.audioInitialized = true;
      await audioManager.init();
      audioManager.playBgm('title');
    };
    this.input.keyboard?.on('keydown', initHandler);
    this.input.on('pointerdown', initHandler);
  }

  // ─── Drawing ─────────────────────────────────────────────

  private draw(): void {
    this.children.removeAll();
    this.menuItems = [];
    this.errorText = null;
    this.heroPreview = null;

    if (this.mode === 'create') {
      this.drawCreate();
    } else {
      this.removeNameInput();
      this.drawTitleScreen();
    }
  }

  private drawTitleScreen(): void {
    const cx = GAME_WIDTH / 2;

    // Dev mode indicator
    if (gameState.devMode) {
      this.add.text(8, 8, '[DEV]', {
        fontSize: '10px',
        color: '#ff4444',
        fontFamily: FONT_FAMILY,
        fontStyle: 'bold',
      });
    }

    // Title
    this.add.text(cx, 70, t('title.gameName'), {
      fontSize: '20px',
      color: COLORS.TEXT_YELLOW,
      fontFamily: FONT_FAMILY,
      fontStyle: 'bold',
    }).setOrigin(0.5);

    // Decorative divider
    const divider = '\u2500\u2500\u2500  \u2726  \u2500\u2500\u2500';
    this.add.text(cx, 94, divider, {
      fontSize: '10px',
      color: '#4466aa',
      fontFamily: FONT_FAMILY,
    }).setOrigin(0.5);

    this.add.text(cx, 112, t('title.subtitle'), {
      fontSize: '12px',
      color: COLORS.TEXT_GRAY,
      fontFamily: FONT_FAMILY,
    }).setOrigin(0.5);

    // Decorative hero sprite
    if (this.textures.exists('hero-walk')) {
      this.add.image(cx, 190, 'hero-walk', 0).setScale(3);
    }

    // Menu options
    const menuY = 270;
    const options = [
      { key: 'title.newGame', action: 'new' },
      ...(SaveManager.hasSave() ? [{ key: 'title.continue', action: 'continue' }] : []),
    ];

    options.forEach((opt, i) => {
      const selected = i === this.selectedIndex;
      const prefix = selected ? '\u25B8 ' : '  ';
      const text = this.add.text(cx, menuY + i * 32, prefix + t(opt.key), {
        fontSize: '14px',
        color: selected ? COLORS.TEXT_YELLOW : COLORS.TEXT_WHITE,
        fontFamily: FONT_FAMILY,
      }).setOrigin(0.5);
      text.setData('action', opt.action);
      this.menuItems.push(text);
    });

    // Language toggle in corner
    const langText = getLocale() === 'ja' ? 'EN / JA \u2190' : '\u2192 EN / JA';
    this.add.text(GAME_WIDTH - 16, GAME_HEIGHT - 20, langText, {
      fontSize: '10px',
      color: COLORS.TEXT_GRAY,
      fontFamily: FONT_FAMILY,
    }).setOrigin(1, 0.5).setInteractive().on('pointerdown', () => {
      setLocale(getLocale() === 'ja' ? 'en' : 'ja');
      this.draw();
    });

    this.updateSelection();
  }

  /** Draw a single ◀ value ▶ selector row */
  private drawSelectorRow(cx: number, y: number, label: string, value: string, isSelected: boolean): void {
    const labelColor = isSelected ? COLORS.TEXT_YELLOW : COLORS.TEXT_WHITE;
    const valColor = isSelected ? COLORS.TEXT_YELLOW : COLORS.TEXT_WHITE;

    // Label on the left
    this.add.text(cx - 140, y, label, {
      fontSize: '12px',
      color: labelColor,
      fontFamily: FONT_FAMILY,
    }).setOrigin(0, 0.5);

    // ◀ value ▶ on the right
    const arrows = isSelected ? `\u25C0  ${value}  \u25B6` : value;
    this.add.text(cx + 60, y, arrows, {
      fontSize: '12px',
      color: valColor,
      fontFamily: FONT_FAMILY,
    }).setOrigin(0.5, 0.5);
  }

  /** Draw a pointed cursor ▸ next to the active row */
  private drawRowCursor(cx: number, y: number): void {
    this.add.text(cx - 158, y, '\u25B8', {
      fontSize: '12px',
      color: COLORS.TEXT_YELLOW,
      fontFamily: FONT_FAMILY,
    }).setOrigin(0, 0.5);
  }

  private drawCreate(): void {
    const cx = GAME_WIDTH / 2;
    const panelX = 56;
    const panelW = GAME_WIDTH - 112;
    const panelY = 12;
    const panelH = GAME_HEIGHT - 24;

    // ── RPG-style panel border ──
    const g = this.add.graphics();
    // Outer border (bright)
    g.lineStyle(2, 0xe0e0ff, 1);
    g.strokeRect(panelX, panelY, panelW, panelH);
    // Inner fill
    g.fillStyle(0x111133, 0.92);
    g.fillRect(panelX + 2, panelY + 2, panelW - 4, panelH - 4);
    // Inner border accent
    g.lineStyle(1, 0x4444aa, 0.6);
    g.strokeRect(panelX + 4, panelY + 4, panelW - 8, panelH - 8);

    let y = panelY + 28;

    // ── Title ──
    this.add.text(cx, y, `\u2726  ${t('create.title')}  \u2726`, {
      fontSize: '16px',
      color: COLORS.TEXT_YELLOW,
      fontFamily: FONT_FAMILY,
      fontStyle: 'bold',
    }).setOrigin(0.5);
    y += 22;

    // Decorative divider
    const dividerLine = '\u2500'.repeat(30);
    this.add.text(cx, y, dividerLine, {
      fontSize: '10px',
      color: '#4466aa',
      fontFamily: FONT_FAMILY,
    }).setOrigin(0.5);
    y += 18;

    // ── Hero Preview (centered, compact) ──
    if (this.textures.exists('hero-walk')) {
      this.heroPreview = this.add.image(cx, y + 20, 'hero-walk', 0).setScale(2);
    }
    y += 62;

    // ── Name ──
    const nameSelected = this.createRow === 'name';
    const nameLabel = t('create.name');
    const displayName = this.heroName || t('create.namePlaceholder');
    const nameColor = this.ngPlus ? COLORS.TEXT_GRAY : (nameSelected ? COLORS.TEXT_YELLOW : COLORS.TEXT_WHITE);

    if (nameSelected) this.drawRowCursor(cx, y);

    this.add.text(cx - 140, y, nameLabel, {
      fontSize: '12px',
      color: nameColor,
      fontFamily: FONT_FAMILY,
    }).setOrigin(0, 0.5);

    const nameDisplay = this.add.text(cx + 60, y, displayName, {
      fontSize: '12px',
      color: this.ngPlus ? COLORS.TEXT_GRAY : (this.heroName ? COLORS.TEXT_WHITE : COLORS.TEXT_GRAY),
      fontFamily: FONT_FAMILY,
    }).setOrigin(0.5, 0.5);
    nameDisplay.setData('row', 'name');
    this.menuItems.push(nameDisplay);

    // Blinking cursor when name row is selected
    if (nameSelected && !this.ngPlus) {
      const nameW = nameDisplay.width;
      const cursorX = cx + 60 + nameW / 2 + 4;
      const cursor = this.add.text(cursorX, y, '_', {
        fontSize: '12px',
        color: COLORS.TEXT_YELLOW,
        fontFamily: FONT_FAMILY,
      }).setOrigin(0, 0.5);
      if (this.blinkTimer) this.blinkTimer.destroy();
      this.blinkTimer = this.time.addEvent({
        delay: 400,
        loop: true,
        callback: () => { cursor.visible = !cursor.visible; },
      });
    }
    y += 34;

    // ── Color ──
    const colorSelected = this.createRow === 'color';
    if (colorSelected) this.drawRowCursor(cx, y);
    const colorId = this.colorOptions[this.colorIndex];
    const colorName = t(`color.${colorId}`);
    this.drawSelectorRow(cx, y, t('create.color'), colorName, colorSelected);
    y += 30;

    // ── Difficulty ──
    const diffSelected = this.createRow === 'difficulty';
    if (diffSelected) this.drawRowCursor(cx, y);
    this.drawSelectorRow(cx, y, t('settings.difficulty'), t(`grade.${this.difficultyOptions[this.difficultyIndex]}`), diffSelected);
    y += 30;

    // ── Language ──
    const langSelected = this.createRow === 'language';
    if (langSelected) this.drawRowCursor(cx, y);
    const langValue = getLocale() === 'ja' ? '\u65E5\u672C\u8A9E' : 'English';
    this.drawSelectorRow(cx, y, t('settings.language'), langValue, langSelected);
    y += 30;

    // ── Kanji (Japanese only) ──
    if (getLocale() === 'ja') {
      const kanjiSelected = this.createRow === 'kanji';
      if (kanjiSelected) this.drawRowCursor(cx, y);
      const kanjiValue = getKanjiMode() ? '\u3080\u305A\u304B\u3057\u3044' : '\u304B\u3093\u305F\u3093';
      this.drawSelectorRow(cx, y, '\u3082\u3058', kanjiValue, kanjiSelected);
      y += 30;
    }

    // Divider before start
    y += 4;
    this.add.text(cx, y, dividerLine, {
      fontSize: '10px',
      color: '#4466aa',
      fontFamily: FONT_FAMILY,
    }).setOrigin(0.5);
    y += 22;

    // ── Start Game button ──
    const startSelected = this.createRow === 'start';
    this.add.text(cx, y, `\u2605  ${t('create.startGame')}  \u2605`, {
      fontSize: '14px',
      color: startSelected ? COLORS.TEXT_YELLOW : COLORS.TEXT_WHITE,
      fontFamily: FONT_FAMILY,
      fontStyle: 'bold',
    }).setOrigin(0.5);

    // Error text (hidden until needed)
    this.errorText = this.add.text(cx, y + 24, '', {
      fontSize: '10px',
      color: '#ff4444',
      fontFamily: FONT_FAMILY,
    }).setOrigin(0.5);

    // ESC hint at bottom
    this.add.text(cx, panelY + panelH - 16, 'ESC: ' + (getLocale() === 'ja' ? '\u623B\u308B' : 'Back'), {
      fontSize: '9px',
      color: '#666688',
      fontFamily: FONT_FAMILY,
    }).setOrigin(0.5);

    // Ensure name input is set up
    this.ensureNameInput();
  }

  // ─── DOM name input ──────────────────────────────────────

  private ensureNameInput(): void {
    if (this.nameInputEl) return;

    const input = document.createElement('input');
    input.type = 'text';
    input.maxLength = 8;
    input.value = this.heroName;
    input.style.cssText = 'position:fixed;top:-100px;left:-100px;opacity:0;pointer-events:none;';
    document.body.appendChild(input);
    this.nameInputEl = input;

    // Sync name from DOM input on every keystroke
    input.addEventListener('input', () => {
      this.heroName = input.value.slice(0, 8);
      this.draw();
    });
  }

  private focusNameInput(): void {
    if (this.nameInputEl) {
      this.nameInputEl.style.cssText = 'position:fixed;top:-100px;left:-100px;opacity:0;';
      this.nameInputEl.style.pointerEvents = 'auto';
      this.nameInputEl.value = this.heroName;
      this.nameInputEl.focus();
    }
  }

  private blurNameInput(): void {
    if (this.nameInputEl) {
      this.nameInputEl.blur();
      this.nameInputEl.style.pointerEvents = 'none';
    }
  }

  private removeNameInput(): void {
    if (this.nameInputEl) {
      this.nameInputEl.remove();
      this.nameInputEl = null;
    }
    if (this.blinkTimer) {
      this.blinkTimer.destroy();
      this.blinkTimer = null;
    }
  }

  // ─── Input ───────────────────────────────────────────────

  private setupInput(): void {
    // Export shortcut: Ctrl+E (or Cmd+E on Mac)
    this.input.keyboard?.on('keydown-E', (event: KeyboardEvent) => {
      if (event.ctrlKey || event.metaKey) {
        event.preventDefault();
        this.scene.start('ExportScene');
      }
    });

    this.input.keyboard?.on('keydown-UP', () => {
      if (this.mode === 'create') {
        this.moveCreateRow(-1);
      } else {
        this.moveSelection(-1);
      }
    });

    this.input.keyboard?.on('keydown-DOWN', () => {
      if (this.mode === 'create') {
        this.moveCreateRow(1);
      } else {
        this.moveSelection(1);
      }
    });

    this.input.keyboard?.on('keydown-LEFT', () => {
      if (this.mode !== 'create') return;
      if (this.createRow === 'color') {
        this.colorIndex = Math.max(0, this.colorIndex - 1);
        this.updateHeroPreview();
        this.draw();
      } else if (this.createRow === 'difficulty') {
        this.difficultyIndex = Math.max(0, this.difficultyIndex - 1);
        this.draw();
      } else if (this.createRow === 'language') {
        this.toggleLanguage();
      } else if (this.createRow === 'kanji') {
        this.toggleKanji();
      }
    });

    this.input.keyboard?.on('keydown-RIGHT', () => {
      if (this.mode !== 'create') return;
      if (this.createRow === 'color') {
        this.colorIndex = Math.min(this.colorOptions.length - 1, this.colorIndex + 1);
        this.updateHeroPreview();
        this.draw();
      } else if (this.createRow === 'difficulty') {
        this.difficultyIndex = Math.min(this.difficultyOptions.length - 1, this.difficultyIndex + 1);
        this.draw();
      } else if (this.createRow === 'language') {
        this.toggleLanguage();
      } else if (this.createRow === 'kanji') {
        this.toggleKanji();
      }
    });

    this.input.keyboard?.on('keydown-ENTER', () => this.confirm());
    this.input.keyboard?.on('keydown-SPACE', () => {
      // Don't consume space when typing name
      if (this.mode === 'create' && this.createRow === 'name') return;
      this.confirm();
    });
    this.input.keyboard?.on('keydown-Z', () => {
      // Don't consume Z when typing name
      if (this.mode === 'create' && this.createRow === 'name') return;
      this.confirm();
    });

    // ESC to go back from create screen
    this.input.keyboard?.on('keydown-ESC', () => {
      if (this.mode === 'create') {
        if (this.ngPlus) {
          // In NG+, ESC goes back to Victory screen
          this.removeNameInput();
          gameState.ngPlusData = null;
          this.scene.start('TitleScene');
        } else {
          this.mode = 'title';
          this.selectedIndex = 0;
          this.draw();
        }
      }
    });
  }

  private toggleLanguage(): void {
    setLocale(getLocale() === 'ja' ? 'en' : 'ja');
    // If switching away from Japanese and cursor was on kanji row, move to start
    if (getLocale() !== 'ja' && this.createRow === 'kanji') {
      this.createRow = 'start';
    }
    this.draw();
  }

  private toggleKanji(): void {
    setKanjiMode(!getKanjiMode());
    audioManager.playSfx('menu_select');
    this.draw();
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

  private moveCreateRow(dir: number): void {
    // If currently on name row, blur the input
    if (this.createRow === 'name') {
      this.blurNameInput();
    }

    const idx = this.createRows.indexOf(this.createRow);
    let next = Math.max(0, Math.min(this.createRows.length - 1, idx + dir));
    // In NG+ mode, skip the name row
    if (this.ngPlus && this.createRows[next] === 'name') {
      next = Math.max(0, Math.min(this.createRows.length - 1, next + dir));
    }
    if (next !== idx) {
      this.createRow = this.createRows[next];
      audioManager.playSfx('menu_select');
      this.draw();
    }

    // If moving to name row, focus the input
    if (this.createRow === 'name') {
      this.focusNameInput();
    }
  }

  private updateHeroPreview(): void {
    // Regenerate hero sprites with the newly selected color
    const scheme = this.colorOptions[this.colorIndex];
    regenerateHeroSprites(this, scheme);
  }

  private confirm(): void {
    if (this.mode === 'title') {
      this.confirmTitle();
    } else {
      this.confirmCreate();
    }
  }

  private confirmTitle(): void {
    const action = this.menuItems[this.selectedIndex]?.getData('action');
    audioManager.playSfx('menu_select');
    if (action === 'new') {
      this.mode = 'create';
      this.createRow = 'name';
      this.draw();
      // Auto-focus name input
      this.time.delayedCall(50, () => this.focusNameInput());
    } else if (action === 'continue') {
      if (gameState.loadGame()) {
        // Restore hero color from save
        regenerateHeroSprites(this, gameState.player.state.heroColor);
        this.removeNameInput();
        this.scene.start('WorldMapScene');
      }
    }
  }

  private confirmCreate(): void {
    if (this.createRow === 'name') {
      // Move to next row on Enter while on name
      this.blurNameInput();
      this.createRow = 'color';
      audioManager.playSfx('menu_select');
      this.draw();
      return;
    }
    if (this.createRow === 'language') {
      this.toggleLanguage();
      return;
    }
    if (this.createRow === 'kanji') {
      this.toggleKanji();
      return;
    }
    if (this.createRow === 'start') {
      // Validate name
      if (!this.heroName.trim()) {
        if (this.errorText) {
          this.errorText.setText(t('create.nameRequired'));
        }
        return;
      }
      // Start the game!
      audioManager.playSfx('menu_select');
      const scheme = this.colorOptions[this.colorIndex];
      const difficulty = this.difficultyOptions[this.difficultyIndex];
      if (this.ngPlus) {
        gameState.newGamePlus(difficulty, scheme);
      } else {
        gameState.newGame(difficulty, this.heroName.trim(), scheme);
      }
      // Save kanji mode to player state
      gameState.player.state.kanjiMode = getKanjiMode();
      // Ensure hero sprites match selected color
      regenerateHeroSprites(this, scheme);
      this.removeNameInput();
      this.scene.start('WorldMapScene');
    }
  }
}
