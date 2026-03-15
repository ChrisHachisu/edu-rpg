import Phaser from 'phaser';
import { GAME_WIDTH, GAME_HEIGHT, COLORS } from '../utils/constants';
import { t, setLocale, getLocale } from '../i18n/i18n';
import { gameState } from '../GameState';
import { items } from '../data/items';
import { GradeLevel } from '../utils/types';

type MenuTab = 'status' | 'items' | 'equip' | 'settings';

export class MenuScene extends Phaser.Scene {
  private currentTab: MenuTab = 'status';
  private tabIndex = 0;
  private listIndex = 0;
  private tabs: MenuTab[] = ['status', 'items', 'equip', 'settings'];

  constructor() {
    super('MenuScene');
  }

  create(): void {
    this.tabIndex = 0;
    this.listIndex = 0;
    this.currentTab = 'status';
    this.drawMenu();
    this.setupInput();
  }

  private drawMenu(): void {
    this.children.removeAll();

    // Background overlay
    this.add.rectangle(GAME_WIDTH / 2, GAME_HEIGHT / 2, GAME_WIDTH, GAME_HEIGHT, COLORS.MENU_BG, 0.95);

    // Tab bar
    this.tabs.forEach((tab, i) => {
      const key = tab === 'status' ? 'menu.status' : tab === 'items' ? 'menu.items' : tab === 'equip' ? 'menu.equip' : 'menu.settings';
      this.add.text(16 + i * 120, 12, t(key), {
        fontSize: '12px',
        color: i === this.tabIndex ? COLORS.TEXT_YELLOW : COLORS.TEXT_WHITE,
        fontFamily: 'monospace',
      });
    });

    this.add.line(0, 32, 0, 0, GAME_WIDTH, 0, COLORS.MENU_BORDER).setOrigin(0);

    switch (this.currentTab) {
      case 'status': this.drawStatus(); break;
      case 'items': this.drawItems(); break;
      case 'equip': this.drawEquip(); break;
      case 'settings': this.drawSettings(); break;
    }

    // Close hint
    this.add.text(GAME_WIDTH / 2, GAME_HEIGHT - 16, 'ESC: ' + t('menu.close'), {
      fontSize: '9px', color: COLORS.TEXT_GRAY, fontFamily: 'monospace',
    }).setOrigin(0.5);
  }

  private drawStatus(): void {
    const p = gameState.player;
    const y = 52;
    const col = COLORS.TEXT_WHITE;
    const fs = '12px';
    const ff = 'monospace';

    this.add.text(32, y, p.state.name, { fontSize: '15px', color: COLORS.TEXT_YELLOW, fontFamily: ff });
    this.add.text(32, y + 32, `${t('menu.level')} ${p.state.level}`, { fontSize: fs, color: col, fontFamily: ff });
    this.add.text(32, y + 60, `${t('menu.hp')} ${p.state.hp}/${p.totalMaxHp}`, { fontSize: fs, color: col, fontFamily: ff });
    this.add.text(32, y + 88, `${t('menu.atk')} ${p.totalAtk}`, { fontSize: fs, color: col, fontFamily: ff });
    this.add.text(32, y + 112, `${t('menu.def')} ${p.totalDef}`, { fontSize: fs, color: col, fontFamily: ff });
    this.add.text(32, y + 136, `${t('menu.spd')} ${p.state.spd}`, { fontSize: fs, color: col, fontFamily: ff });
    this.add.text(32, y + 164, `${t('menu.exp')} ${p.state.exp}/${p.state.expToNext}`, { fontSize: fs, color: col, fontFamily: ff });
    this.add.text(32, y + 192, `${t('menu.gold')} ${p.state.gold}`, { fontSize: fs, color: COLORS.TEXT_YELLOW, fontFamily: ff });

    // Equipment display
    const ex = 280;
    this.add.text(ex, y, t('menu.equip'), { fontSize: '14px', color: COLORS.TEXT_YELLOW, fontFamily: ff });
    const slots = ['weapon', 'armor', 'shield', 'helmet'] as const;
    slots.forEach((slot, i) => {
      const itemId = p.state.equipment[slot];
      const name = itemId ? t(items[itemId].nameKey) : '---';
      this.add.text(ex, y + 28 + i * 24, name, { fontSize: '10px', color: col, fontFamily: ff });
    });

    // Quiz stats
    const stats = gameState.quizManager.getStats();
    const pct = stats.totalAsked > 0 ? Math.round(stats.totalCorrect / stats.totalAsked * 100) : 0;
    this.add.text(ex, y + 160, `${t('menu.accuracy')}: ${stats.totalCorrect}/${stats.totalAsked} (${pct}%)`, {
      fontSize: '10px', color: col, fontFamily: ff,
    });
  }

  private drawItems(): void {
    const inv = gameState.player.state.inventory;
    const y = 52;

    if (inv.length === 0) {
      this.add.text(GAME_WIDTH / 2, y + 80, 'No items', { fontSize: '12px', color: COLORS.TEXT_GRAY, fontFamily: 'monospace' }).setOrigin(0.5);
      return;
    }

    inv.forEach((slot, i) => {
      const item = items[slot.itemId];
      if (!item) return;
      this.add.text(32, y + i * 24, `${t(item.nameKey)} x${slot.quantity}`, {
        fontSize: '10px',
        color: i === this.listIndex ? COLORS.TEXT_YELLOW : COLORS.TEXT_WHITE,
        fontFamily: 'monospace',
      });
    });
  }

  private drawEquip(): void {
    const p = gameState.player;
    const y = 52;
    const ff = 'monospace';
    const slotKeys = ['weapon', 'armor', 'shield', 'helmet'] as const;
    const slotNameKeys: Record<string, string> = {
      weapon: 'equip.slot.weapon',
      armor: 'equip.slot.armor',
      shield: 'equip.slot.shield',
      helmet: 'equip.slot.helmet',
    };

    // Section header: current equipment
    this.add.text(32, y, t('menu.equip'), { fontSize: '14px', color: COLORS.TEXT_YELLOW, fontFamily: ff });

    // Equipped items with localized slot names and stats
    slotKeys.forEach((slot, i) => {
      const itemId = p.state.equipment[slot];
      const slotLabel = t(slotNameKeys[slot]);
      const itemName = itemId ? t(items[itemId].nameKey) : t('equip.empty');
      const item = itemId ? items[itemId] : null;
      const statStr = item?.stats
        ? (item.stats.atk ? ` +${item.stats.atk} ${t('menu.atk')}` : '')
          + (item.stats.def ? ` +${item.stats.def} ${t('menu.def')}` : '')
        : '';

      this.add.text(32, y + 28 + i * 28, `${slotLabel}:`, {
        fontSize: '10px', color: COLORS.TEXT_GRAY, fontFamily: ff,
      });
      this.add.text(120, y + 28 + i * 28, itemName, {
        fontSize: '10px', color: itemId ? COLORS.TEXT_WHITE : COLORS.TEXT_GRAY, fontFamily: ff,
      });
      if (statStr) {
        this.add.text(300, y + 28 + i * 28, statStr, {
          fontSize: '9px', color: COLORS.TEXT_YELLOW, fontFamily: ff,
        });
      }
    });

    // Divider
    this.add.line(0, y + 148, 32, 0, GAME_WIDTH - 32, 0, COLORS.MENU_BORDER, 0.3).setOrigin(0);

    // Equippable items from inventory
    const equipSlotTypes = ['weapon', 'armor', 'shield', 'helmet'];
    const equipItems = p.state.inventory.filter(s => {
      const item = items[s.itemId];
      return item && equipSlotTypes.includes(item.type);
    });

    this.add.text(32, y + 160, t('equip.owned'), { fontSize: '12px', color: COLORS.TEXT_YELLOW, fontFamily: ff });

    if (equipItems.length === 0) {
      this.add.text(32, y + 188, '---', { fontSize: '10px', color: COLORS.TEXT_GRAY, fontFamily: ff });
    } else {
      equipItems.forEach((slot, i) => {
        const item = items[slot.itemId];
        const statStr = (item.stats?.atk ? `+${item.stats.atk} ${t('menu.atk')}` : '')
          + (item.stats?.def ? ` +${item.stats.def} ${t('menu.def')}` : '');
        const isSelected = i === this.listIndex;

        this.add.text(32, y + 188 + i * 24, `${t(item.nameKey)}`, {
          fontSize: '10px', color: isSelected ? COLORS.TEXT_YELLOW : COLORS.TEXT_WHITE, fontFamily: ff,
        });
        this.add.text(220, y + 188 + i * 24, statStr, {
          fontSize: '9px', color: isSelected ? COLORS.TEXT_YELLOW : COLORS.TEXT_GRAY, fontFamily: ff,
        });
      });
    }
  }

  private drawSettings(): void {
    const y = 60;
    const ff = 'monospace';

    // Difficulty
    this.add.text(32, y, t('settings.difficulty'), {
      fontSize: '12px', color: this.listIndex === 0 ? COLORS.TEXT_YELLOW : COLORS.TEXT_WHITE, fontFamily: ff,
    });
    const currentGrade = gameState.player.state.quizDifficulty;
    this.add.text(32, y + 28, `< ${t('grade.' + currentGrade)} >`, {
      fontSize: '12px', color: COLORS.TEXT_YELLOW, fontFamily: ff,
    });

    // Language
    this.add.text(32, y + 72, t('settings.language'), {
      fontSize: '12px', color: this.listIndex === 1 ? COLORS.TEXT_YELLOW : COLORS.TEXT_WHITE, fontFamily: ff,
    });
    this.add.text(32, y + 100, `< ${getLocale() === 'ja' ? '日本語' : 'English'} >`, {
      fontSize: '12px', color: COLORS.TEXT_YELLOW, fontFamily: ff,
    });

    // Timer toggle
    const timerEnabled = gameState.player.state.timerEnabled;
    this.add.text(32, y + 144, t('settings.timer'), {
      fontSize: '12px', color: this.listIndex === 2 ? COLORS.TEXT_YELLOW : COLORS.TEXT_WHITE, fontFamily: ff,
    });
    this.add.text(32, y + 172, `< ${timerEnabled ? t('settings.timerOn') : t('settings.timerOff')} >`, {
      fontSize: '12px', color: COLORS.TEXT_YELLOW, fontFamily: ff,
    });
  }

  private setupInput(): void {
    this.input.keyboard?.on('keydown-ESC', () => {
      this.scene.stop();
      this.scene.resume('WorldMapScene');
    });

    this.input.keyboard?.on('keydown-LEFT', () => {
      if (this.currentTab === 'settings') {
        this.handleSettingsLeft();
      } else {
        this.tabIndex = Math.max(0, this.tabIndex - 1);
        this.currentTab = this.tabs[this.tabIndex];
        this.listIndex = 0;
        this.drawMenu();
      }
    });

    this.input.keyboard?.on('keydown-RIGHT', () => {
      if (this.currentTab === 'settings') {
        this.handleSettingsRight();
      } else {
        this.tabIndex = Math.min(this.tabs.length - 1, this.tabIndex + 1);
        this.currentTab = this.tabs[this.tabIndex];
        this.listIndex = 0;
        this.drawMenu();
      }
    });

    this.input.keyboard?.on('keydown-UP', () => {
      this.listIndex = Math.max(0, this.listIndex - 1);
      this.drawMenu();
    });

    this.input.keyboard?.on('keydown-DOWN', () => {
      const maxIndex = this.currentTab === 'settings' ? 2
        : this.currentTab === 'items' ? Math.max(0, gameState.player.state.inventory.length - 1)
        : 99;
      this.listIndex = Math.min(maxIndex, this.listIndex + 1);
      this.drawMenu();
    });

    this.input.keyboard?.on('keydown-Z', () => {
      if (this.currentTab === 'items') this.useItem();
      else if (this.currentTab === 'equip') this.equipItem();
    });
  }

  private handleSettingsLeft(): void {
    const grades: GradeLevel[] = ['k', '1', '2', '3', '4', '5', '6'];
    if (this.listIndex === 0) {
      const idx = grades.indexOf(gameState.player.state.quizDifficulty);
      if (idx > 0) {
        gameState.player.state.quizDifficulty = grades[idx - 1];
        gameState.quizManager.setDifficulty(grades[idx - 1]);
      }
    } else if (this.listIndex === 1) {
      const newLocale = getLocale() === 'ja' ? 'en' : 'ja';
      setLocale(newLocale);
      gameState.player.state.locale = newLocale;
    } else if (this.listIndex === 2) {
      gameState.player.state.timerEnabled = !gameState.player.state.timerEnabled;
    }
    this.drawMenu();
  }

  private handleSettingsRight(): void {
    const grades: GradeLevel[] = ['k', '1', '2', '3', '4', '5', '6'];
    if (this.listIndex === 0) {
      const idx = grades.indexOf(gameState.player.state.quizDifficulty);
      if (idx < grades.length - 1) {
        gameState.player.state.quizDifficulty = grades[idx + 1];
        gameState.quizManager.setDifficulty(grades[idx + 1]);
      }
    } else if (this.listIndex === 1) {
      const newLocale = getLocale() === 'ja' ? 'en' : 'ja';
      setLocale(newLocale);
      gameState.player.state.locale = newLocale;
    } else if (this.listIndex === 2) {
      gameState.player.state.timerEnabled = !gameState.player.state.timerEnabled;
    }
    this.drawMenu();
  }

  private useItem(): void {
    const inv = gameState.player.state.inventory;
    if (this.listIndex >= inv.length) return;
    const slot = inv[this.listIndex];
    const item = items[slot.itemId];
    if (!item || item.type !== 'consumable' || !item.effect) return;

    if (item.effect.type === 'heal') {
      gameState.player.heal(item.effect.value);
      gameState.player.removeItem(slot.itemId, 1);
    }
    this.drawMenu();
  }

  private equipItem(): void {
    const p = gameState.player;
    const equipSlots = ['weapon', 'armor', 'shield', 'helmet', 'accessory'];
    const equipItems = p.state.inventory.filter(s => {
      const item = items[s.itemId];
      return item && equipSlots.includes(item.type);
    });
    if (this.listIndex >= equipItems.length) return;
    const slot = equipItems[this.listIndex];
    p.equip(slot.itemId);
    this.drawMenu();
  }
}
