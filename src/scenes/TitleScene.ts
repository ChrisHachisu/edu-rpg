import Phaser from 'phaser';
import { GAME_WIDTH, GAME_HEIGHT, ZOOM, COLORS, FONT_FAMILY, UI_SCALE } from '../utils/constants';
import { t, setLocale, getLocale, setKanjiMode, getKanjiMode } from '../i18n/i18n';
import { SaveManager, SaveProfileSummary } from '../systems/progression/SaveManager';
import { GradeLevel, HeroColorScheme } from '../utils/types';
import { gameState } from '../GameState';
import { audioManager } from '../systems/audio/AudioManager';
import { regenerateHeroSprites } from '../utils/AssetGenerator';
import { mapDefs } from '../data/maps';

type ScreenMode = 'title' | 'create' | 'profiles' | 'overwrite';
type OverwriteReturnMode = 'title' | 'profiles';

/** Which row the cursor is on in the create screen */
type CreateRow = 'name' | 'color' | 'difficulty' | 'language' | 'kanji' | 'start';

export class TitleScene extends Phaser.Scene {
  private readonly S = UI_SCALE;
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
  private overwriteProfileId: string | null = null;
  private overwriteReturnMode: OverwriteReturnMode = 'title';

  constructor() {
    super('TitleScene');
  }

  private audioInitialized = false;

  create(data?: { ngPlus?: boolean; skipDevStart?: boolean }): void {
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

    if (!data?.skipDevStart && this.tryDevStartFromUrl()) return;

    this.draw();
    this.setupInput();
    this.initAudioOnGesture();
  }

  private tryDevStartFromUrl(): boolean {
    if (!gameState.devMode) return false;
    const params = new URLSearchParams(window.location.search);
    const mapId = params.get('map');
    if (!mapId || !mapDefs[mapId]) return false;

    const def = mapDefs[mapId];
    const gradeParam = params.get('grade');
    const difficulty = (this.difficultyOptions.includes(gradeParam as GradeLevel) ? gradeParam : '3') as GradeLevel;
    const colorParam = params.get('color') as HeroColorScheme | null;
    const scheme = colorParam && this.colorOptions.includes(colorParam) ? colorParam : 'gray';
    const floor = Math.max(1, Math.min(def.floors ?? 1, Number(params.get('floor') ?? '1') || 1));
    const x = Math.max(0, Math.min(def.width - 1, Number(params.get('x') ?? '50') || 50));
    const y = Math.max(0, Math.min(def.height - 1, Number(params.get('y') ?? '1') || 1));

    gameState.newGame(difficulty, params.get('name') || 'Dev Tester', scheme);
    gameState.player.state.kanjiMode = getKanjiMode();
    gameState.player.state.storyFlags['intro.done'] = true;
    gameState.player.state.position = { mapId, x, y, floor };
    regenerateHeroSprites(this, scheme);
    this.removeNameInput();
    this.scene.start('WorldMapScene');
    return true;
  }

  shutdown(): void {
    this.input.keyboard?.removeAllListeners();
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
    } else if (this.mode === 'profiles') {
      this.removeNameInput();
      this.drawProfiles();
    } else if (this.mode === 'overwrite') {
      this.removeNameInput();
      this.drawOverwriteConfirm();
    } else {
      this.removeNameInput();
      this.drawTitleScreen();
    }
  }

  private drawTitleScreen(): void {
    const S = this.S;
    const cx = GAME_WIDTH / 2;

    // Dev mode indicator
    if (gameState.devMode) {
      this.add.text(Math.round(8 * S), Math.round(8 * S), '[DEV]', {
        fontSize: `${Math.round(10 * S)}px`,
        color: '#ff4444',
        fontFamily: FONT_FAMILY,
        fontStyle: 'bold',
      });
    }

    // Title
    this.add.text(cx, Math.round(70 * S), t('title.gameName'), {
      fontSize: `${Math.round(20 * S)}px`,
      color: COLORS.TEXT_YELLOW,
      fontFamily: FONT_FAMILY,
      fontStyle: 'bold',
    }).setOrigin(0.5);

    // Decorative divider
    const divider = '\u2500\u2500\u2500  \u2726  \u2500\u2500\u2500';
    this.add.text(cx, Math.round(94 * S), divider, {
      fontSize: `${Math.round(10 * S)}px`,
      color: '#4466aa',
      fontFamily: FONT_FAMILY,
    }).setOrigin(0.5);

    this.add.text(cx, Math.round(112 * S), t('title.subtitle'), {
      fontSize: `${Math.round(12 * S)}px`,
      color: COLORS.TEXT_GRAY,
      fontFamily: FONT_FAMILY,
    }).setOrigin(0.5);

    const activeProfile = SaveManager.getActiveProfileSummary();
    this.add.text(cx, Math.round(136 * S), `${t('saveData.active')}: ${this.formatProfileTitle(activeProfile)}`, {
      fontSize: `${Math.round(10 * S)}px`,
      color: COLORS.TEXT_GRAY,
      fontFamily: FONT_FAMILY,
    }).setOrigin(0.5);

    // Decorative hero sprite
    if (this.textures.exists('hero-walk')) {
      this.add.image(cx, Math.round(190 * S), 'hero-walk', 0).setScale(3);
    }

    // Menu options
    const menuY = Math.round(270 * S);
    const options = [
      { key: 'title.newGame', action: 'new' },
      ...(SaveManager.hasSave() ? [{ key: 'title.continue', action: 'continue' }] : []),
      { key: 'title.saveData', action: 'profiles' },
    ];

    options.forEach((opt, i) => {
      const selected = i === this.selectedIndex;
      const text = this.add.text(cx, menuY + i * Math.round(32 * S), t(opt.key), {
        fontSize: `${Math.round(14 * S)}px`,
        color: selected ? COLORS.TEXT_YELLOW : COLORS.TEXT_WHITE,
        fontFamily: FONT_FAMILY,
      }).setOrigin(0.5);
      text.setData('action', opt.action);
      this.menuItems.push(text);
    });

    // Language toggle in corner
    const langText = getLocale() === 'ja' ? 'EN / JA \u2190' : '\u2192 EN / JA';
    this.add.text(GAME_WIDTH - Math.round(16 * S), GAME_HEIGHT - Math.round(20 * S), langText, {
      fontSize: `${Math.round(10 * S)}px`,
      color: COLORS.TEXT_GRAY,
      fontFamily: FONT_FAMILY,
    }).setOrigin(1, 0.5).setInteractive().on('pointerdown', () => {
      setLocale(getLocale() === 'ja' ? 'en' : 'ja');
      this.draw();
    });

    this.updateSelection();
  }

  private drawProfiles(): void {
    const S = this.S;
    const cx = GAME_WIDTH / 2;
    const panelX = Math.round(54 * S);
    const panelY = Math.round(46 * S);
    const panelW = GAME_WIDTH - Math.round(108 * S);
    const panelH = GAME_HEIGHT - Math.round(92 * S);
    const profiles = SaveManager.getProfileSummaries();
    const activeId = SaveManager.getActiveProfileId();

    if (this.selectedIndex >= profiles.length) this.selectedIndex = profiles.length - 1;
    if (this.selectedIndex < 0) this.selectedIndex = 0;

    const g = this.add.graphics();
    g.lineStyle(2, 0xe0e0ff, 1);
    g.strokeRect(panelX, panelY, panelW, panelH);
    g.fillStyle(0x111133, 0.94);
    g.fillRect(panelX + 2, panelY + 2, panelW - 4, panelH - 4);
    g.lineStyle(1, 0x4444aa, 0.65);
    g.strokeRect(panelX + 4, panelY + 4, panelW - 8, panelH - 8);

    this.add.text(cx, panelY + Math.round(30 * S), `\u2726  ${t('saveData.title')}  \u2726`, {
      fontSize: `${Math.round(16 * S)}px`,
      color: COLORS.TEXT_YELLOW,
      fontFamily: FONT_FAMILY,
      fontStyle: 'bold',
    }).setOrigin(0.5);

    const rowStartY = panelY + Math.round(82 * S);
    const rowH = Math.round(42 * S);
    profiles.forEach((profile, i) => {
      const selected = i === this.selectedIndex;
      const active = profile.id === activeId;
      const y = rowStartY + i * rowH;
      const prefix = selected ? '\u25B8 ' : '  ';
      const activeMark = active ? '* ' : '  ';
      const line = `${prefix}${activeMark}${this.formatProfileLine(profile)}`;
      const text = this.add.text(panelX + Math.round(34 * S), y, line, {
        fontSize: `${Math.round(12 * S)}px`,
        color: selected ? COLORS.TEXT_YELLOW : COLORS.TEXT_WHITE,
        fontFamily: FONT_FAMILY,
      }).setOrigin(0, 0.5);
      text.setData('profileId', profile.id);
      this.menuItems.push(text);
    });

    this.add.text(cx, panelY + panelH - Math.round(28 * S), t('saveData.hint'), {
      fontSize: `${Math.round(9 * S)}px`,
      color: '#666688',
      fontFamily: FONT_FAMILY,
    }).setOrigin(0.5);

    this.updateSelection();
  }

  private drawOverwriteConfirm(): void {
    const S = this.S;
    const cx = GAME_WIDTH / 2;
    const profile = SaveManager.getProfileSummaries().find(p => p.id === this.overwriteProfileId);
    if (!profile) {
      this.mode = this.overwriteReturnMode;
      this.draw();
      return;
    }

    const panelX = Math.round(72 * S);
    const panelY = Math.round(120 * S);
    const panelW = GAME_WIDTH - Math.round(144 * S);
    const panelH = Math.round(190 * S);
    const g = this.add.graphics();
    g.lineStyle(2, 0xe0e0ff, 1);
    g.strokeRect(panelX, panelY, panelW, panelH);
    g.fillStyle(0x111133, 0.96);
    g.fillRect(panelX + 2, panelY + 2, panelW - 4, panelH - 4);
    g.lineStyle(1, 0xaa4444, 0.8);
    g.strokeRect(panelX + 6, panelY + 6, panelW - 12, panelH - 12);

    this.add.text(cx, panelY + Math.round(34 * S), t('saveData.overwriteTitle'), {
      fontSize: `${Math.round(16 * S)}px`,
      color: COLORS.TEXT_YELLOW,
      fontFamily: FONT_FAMILY,
      fontStyle: 'bold',
    }).setOrigin(0.5);

    this.add.text(cx, panelY + Math.round(74 * S), t('saveData.overwriteBody', { slot: profile.slotNumber }), {
      fontSize: `${Math.round(11 * S)}px`,
      color: COLORS.TEXT_WHITE,
      fontFamily: FONT_FAMILY,
    }).setOrigin(0.5);

    this.add.text(cx, panelY + Math.round(98 * S), this.formatProfileLine(profile), {
      fontSize: `${Math.round(10 * S)}px`,
      color: COLORS.TEXT_GRAY,
      fontFamily: FONT_FAMILY,
    }).setOrigin(0.5);

    const options = [
      { key: 'saveData.overwriteConfirm', action: 'overwrite' },
      { key: 'saveData.cancel', action: 'cancel' },
    ];
    const optionY = panelY + Math.round(134 * S);
    options.forEach((opt, i) => {
      const selected = i === this.selectedIndex;
      const text = this.add.text(cx, optionY + i * Math.round(28 * S), `${selected ? '\u25B8 ' : '  '}${t(opt.key)}`, {
        fontSize: `${Math.round(12 * S)}px`,
        color: selected ? COLORS.TEXT_YELLOW : COLORS.TEXT_WHITE,
        fontFamily: FONT_FAMILY,
      }).setOrigin(0.5);
      text.setData('action', opt.action);
      this.menuItems.push(text);
    });

    this.updateSelection();
  }

  private formatProfileTitle(profile: SaveProfileSummary): string {
    const slot = t('saveData.slot', { slot: profile.slotNumber });
    if (!profile.hasSave) return `${slot} - ${t('saveData.empty')}`;
    return `${slot} - ${profile.heroName || 'Hero'} ${t('saveData.level', { level: profile.level })}`;
  }

  private formatProfileLine(profile: SaveProfileSummary): string {
    const slot = t('saveData.slot', { slot: profile.slotNumber });
    if (!profile.hasSave) return `${slot} - ${t('saveData.empty')}`;
    return `${slot} - ${profile.heroName || 'Hero'}  ${t('saveData.level', { level: profile.level })}  ${this.formatPlaytime(profile.playtime)}`;
  }

  private formatPlaytime(seconds: number): string {
    const safeSeconds = Math.max(0, Math.floor(seconds));
    const hours = Math.floor(safeSeconds / 3600);
    const minutes = Math.floor((safeSeconds % 3600) / 60);
    if (hours > 0) return `${hours}h ${minutes.toString().padStart(2, '0')}m`;
    return `${minutes}m`;
  }

  /** Draw a single ◀ value ▶ selector row */
  private drawSelectorRow(cx: number, y: number, label: string, value: string, isSelected: boolean): void {
    const S = this.S;
    const labelColor = isSelected ? COLORS.TEXT_YELLOW : COLORS.TEXT_WHITE;
    const valColor = isSelected ? COLORS.TEXT_YELLOW : COLORS.TEXT_WHITE;

    // Label on the left
    this.add.text(cx - Math.round(140 * S), y, label, {
      fontSize: `${Math.round(12 * S)}px`,
      color: labelColor,
      fontFamily: FONT_FAMILY,
    }).setOrigin(0, 0.5);

    // ◀ value ▶ on the right
    const arrows = isSelected ? `\u25C0  ${value}  \u25B6` : value;
    this.add.text(cx + Math.round(60 * S), y, arrows, {
      fontSize: `${Math.round(12 * S)}px`,
      color: valColor,
      fontFamily: FONT_FAMILY,
    }).setOrigin(0.5, 0.5);
  }

  /** Draw a pointed cursor ▸ next to the active row */
  private drawRowCursor(cx: number, y: number): void {
    const S = this.S;
    this.add.text(cx - Math.round(158 * S), y, '\u25B8', {
      fontSize: `${Math.round(12 * S)}px`,
      color: COLORS.TEXT_YELLOW,
      fontFamily: FONT_FAMILY,
    }).setOrigin(0, 0.5);
  }

  private drawCreate(): void {
    const S = this.S;
    const cx = GAME_WIDTH / 2;
    const panelX = Math.round(56 * S);
    const panelW = GAME_WIDTH - Math.round(112 * S);
    const panelY = Math.round(12 * S);
    const panelH = GAME_HEIGHT - Math.round(24 * S);

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

    let y = panelY + Math.round(28 * S);

    // ── Title ──
    this.add.text(cx, y, `\u2726  ${t('create.title')}  \u2726`, {
      fontSize: `${Math.round(16 * S)}px`,
      color: COLORS.TEXT_YELLOW,
      fontFamily: FONT_FAMILY,
      fontStyle: 'bold',
    }).setOrigin(0.5);
    y += Math.round(22 * S);

    // Decorative divider
    const dividerLine = '\u2500'.repeat(30);
    this.add.text(cx, y, dividerLine, {
      fontSize: `${Math.round(10 * S)}px`,
      color: '#4466aa',
      fontFamily: FONT_FAMILY,
    }).setOrigin(0.5);
    y += Math.round(18 * S);

    // ── Hero Preview (centered, compact) ──
    if (this.textures.exists('hero-walk')) {
      this.heroPreview = this.add.image(cx, y + Math.round(20 * S), 'hero-walk', 0).setScale(2);
    }
    y += Math.round(62 * S);

    // ── Name ──
    const nameSelected = this.createRow === 'name';
    const nameLabel = t('create.name');
    const displayName = this.heroName || t('create.namePlaceholder');
    const nameColor = this.ngPlus ? COLORS.TEXT_GRAY : (nameSelected ? COLORS.TEXT_YELLOW : COLORS.TEXT_WHITE);

    if (nameSelected) this.drawRowCursor(cx, y);

    this.add.text(cx - Math.round(140 * S), y, nameLabel, {
      fontSize: `${Math.round(12 * S)}px`,
      color: nameColor,
      fontFamily: FONT_FAMILY,
    }).setOrigin(0, 0.5);

    const nameDisplay = this.add.text(cx + Math.round(60 * S), y, displayName, {
      fontSize: `${Math.round(12 * S)}px`,
      color: this.ngPlus ? COLORS.TEXT_GRAY : (this.heroName ? COLORS.TEXT_WHITE : COLORS.TEXT_GRAY),
      fontFamily: FONT_FAMILY,
    }).setOrigin(0.5, 0.5);
    nameDisplay.setData('row', 'name');
    this.menuItems.push(nameDisplay);

    // Blinking cursor when name row is selected
    if (nameSelected && !this.ngPlus) {
      const nameW = nameDisplay.width;
      const cursorX = cx + Math.round(60 * S) + nameW / 2 + Math.round(4 * S);
      const cursor = this.add.text(cursorX, y, '_', {
        fontSize: `${Math.round(12 * S)}px`,
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
    y += Math.round(34 * S);

    // ── Color ──
    const colorSelected = this.createRow === 'color';
    if (colorSelected) this.drawRowCursor(cx, y);
    const colorId = this.colorOptions[this.colorIndex];
    const colorName = t(`color.${colorId}`);
    this.drawSelectorRow(cx, y, t('create.color'), colorName, colorSelected);
    y += Math.round(30 * S);

    // ── Difficulty ──
    const diffSelected = this.createRow === 'difficulty';
    if (diffSelected) this.drawRowCursor(cx, y);
    this.drawSelectorRow(cx, y, t('settings.difficulty'), t(`grade.${this.difficultyOptions[this.difficultyIndex]}`), diffSelected);
    y += Math.round(30 * S);

    // ── Language ──
    const langSelected = this.createRow === 'language';
    if (langSelected) this.drawRowCursor(cx, y);
    const langValue = getLocale() === 'ja' ? '\u65E5\u672C\u8A9E' : 'English';
    this.drawSelectorRow(cx, y, t('settings.language'), langValue, langSelected);
    y += Math.round(30 * S);

    // ── Kanji (Japanese only) ──
    if (getLocale() === 'ja') {
      const kanjiSelected = this.createRow === 'kanji';
      if (kanjiSelected) this.drawRowCursor(cx, y);
      const kanjiValue = getKanjiMode() ? '\u3080\u305A\u304B\u3057\u3044' : '\u304B\u3093\u305F\u3093';
      this.drawSelectorRow(cx, y, '\u3082\u3058', kanjiValue, kanjiSelected);
      y += Math.round(30 * S);
    }

    // Divider before start
    y += Math.round(4 * S);
    this.add.text(cx, y, dividerLine, {
      fontSize: `${Math.round(10 * S)}px`,
      color: '#4466aa',
      fontFamily: FONT_FAMILY,
    }).setOrigin(0.5);
    y += Math.round(22 * S);

    // ── Start Game button ──
    const startSelected = this.createRow === 'start';
    this.add.text(cx, y, `\u2605  ${t('create.startGame')}  \u2605`, {
      fontSize: `${Math.round(14 * S)}px`,
      color: startSelected ? COLORS.TEXT_YELLOW : COLORS.TEXT_WHITE,
      fontFamily: FONT_FAMILY,
      fontStyle: 'bold',
    }).setOrigin(0.5);

    // Error text (hidden until needed)
    this.errorText = this.add.text(cx, y + Math.round(24 * S), '', {
      fontSize: `${Math.round(10 * S)}px`,
      color: '#ff4444',
      fontFamily: FONT_FAMILY,
    }).setOrigin(0.5);

    // ESC hint at bottom
    this.add.text(cx, panelY + panelH - Math.round(16 * S), 'ESC: ' + (getLocale() === 'ja' ? '\u623B\u308B' : 'Back'), {
      fontSize: `${Math.round(9 * S)}px`,
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
    this.input.keyboard?.on('keydown-X', () => {
      if (this.mode === 'profiles') {
        this.startNewForSelectedProfile();
      } else if (this.mode === 'overwrite') {
        this.cancelOverwrite();
      }
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
      } else if (this.mode === 'profiles') {
        this.mode = 'title';
        this.selectedIndex = 0;
        this.draw();
      } else if (this.mode === 'overwrite') {
        this.cancelOverwrite();
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
    if (this.mode === 'profiles' || this.mode === 'overwrite') {
      this.draw();
    } else {
      this.updateSelection();
    }
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
    } else if (this.mode === 'profiles') {
      this.confirmProfile();
    } else if (this.mode === 'overwrite') {
      this.confirmOverwrite();
    } else {
      this.confirmCreate();
    }
  }

  private confirmTitle(): void {
    const action = this.menuItems[this.selectedIndex]?.getData('action');
    audioManager.playSfx('menu_select');
    if (action === 'new') {
      const activeProfileId = SaveManager.getActiveProfileId();
      if (SaveManager.hasSave(activeProfileId)) {
        this.showOverwriteConfirm(activeProfileId, 'title');
      } else {
        this.startCreateForProfile(activeProfileId, false);
      }
    } else if (action === 'continue') {
      if (gameState.loadGame()) {
        // Restore hero color from save
        regenerateHeroSprites(this, gameState.player.state.heroColor);
        this.removeNameInput();
        this.scene.start('WorldMapScene');
      }
    } else if (action === 'profiles') {
      this.mode = 'profiles';
      this.selectedIndex = 0;
      this.draw();
    }
  }

  private confirmProfile(): void {
    const profileId = this.menuItems[this.selectedIndex]?.getData('profileId') as string | undefined;
    if (!profileId) return;

    SaveManager.setActiveProfileId(profileId);
    audioManager.playSfx('menu_select');
    if (SaveManager.hasSave(profileId) && gameState.loadGame()) {
      regenerateHeroSprites(this, gameState.player.state.heroColor);
      this.removeNameInput();
      this.scene.start('WorldMapScene');
      return;
    }

    this.startCreateForProfile(profileId, false);
  }

  private startNewForSelectedProfile(): void {
    const profileId = this.menuItems[this.selectedIndex]?.getData('profileId') as string | undefined;
    if (!profileId) return;

    audioManager.playSfx('menu_select');
    if (SaveManager.hasSave(profileId)) {
      this.showOverwriteConfirm(profileId, 'profiles');
    } else {
      this.startCreateForProfile(profileId, false);
    }
  }

  private showOverwriteConfirm(profileId: string, returnMode: OverwriteReturnMode): void {
    SaveManager.setActiveProfileId(profileId);
    this.overwriteProfileId = profileId;
    this.overwriteReturnMode = returnMode;
    this.mode = 'overwrite';
    this.selectedIndex = 0;
    this.draw();
  }

  private confirmOverwrite(): void {
    const action = this.menuItems[this.selectedIndex]?.getData('action');
    if (action === 'overwrite' && this.overwriteProfileId) {
      audioManager.playSfx('menu_select');
      this.startCreateForProfile(this.overwriteProfileId, true);
    } else {
      this.cancelOverwrite();
    }
  }

  private cancelOverwrite(): void {
    const profileId = this.overwriteProfileId;
    this.overwriteProfileId = null;
    if (this.overwriteReturnMode === 'profiles') {
      this.mode = 'profiles';
      const profiles = SaveManager.getProfileSummaries();
      this.selectedIndex = Math.max(0, profiles.findIndex(p => p.id === profileId));
    } else {
      this.mode = 'title';
      this.selectedIndex = 0;
    }
    this.draw();
  }

  private startCreateForProfile(profileId: string, overwrite: boolean): void {
    SaveManager.setActiveProfileId(profileId);
    if (overwrite) {
      SaveManager.deleteSave(profileId);
      SaveManager.deleteAutoSave(profileId);
    }
    this.overwriteProfileId = null;
    this.heroName = '';
    this.mode = 'create';
    this.createRow = 'name';
    this.draw();
    this.time.delayedCall(50, () => this.focusNameInput());
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
      // Bind the freshly-created hero to the currently-open save slot right away.
      gameState.saveGame();
      this.removeNameInput();
      this.scene.start('WorldMapScene');
    }
  }
}
