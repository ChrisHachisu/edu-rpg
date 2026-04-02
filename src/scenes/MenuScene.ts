import Phaser from 'phaser';
import { GAME_WIDTH, GAME_HEIGHT, ZOOM, COLORS, FONT_FAMILY, UI_SCALE } from '../utils/constants';
import { t, setLocale, getLocale, setKanjiMode, getKanjiMode } from '../i18n/i18n';
import { gameState } from '../GameState';
import { items } from '../data/items';
import { EquipSlot } from '../utils/types';
import { audioManager } from '../systems/audio/AudioManager';

const S = UI_SCALE;

type MenuTab = 'status' | 'items' | 'equip' | 'quests' | 'settings';

export class MenuScene extends Phaser.Scene {
  private currentTab: MenuTab = 'status';
  private tabIndex = 0;
  private listIndex = 0;
  private tabs: MenuTab[] = ['status', 'items', 'equip', 'quests', 'settings'];

  // Equipment tab state
  private equipMode: 'equipped' | 'inventory' = 'equipped';
  private equipSlotIndex = 0;
  private equipInventoryIndex = 0;

  constructor() {
    super('MenuScene');
  }

  create(): void {
    this.cameras.main.setZoom(ZOOM);
    this.cameras.main.setScroll(-GAME_WIDTH * (ZOOM - 1) / 2, -GAME_HEIGHT * (ZOOM - 1) / 2);
    this.tabIndex = 0;
    this.listIndex = 0;
    this.currentTab = 'status';
    this.equipMode = 'equipped';
    this.equipSlotIndex = 0;
    this.equipInventoryIndex = 0;
    this.drawMenu();
    this.setupInput();
  }

  private drawMenu(): void {
    this.children.removeAll();

    // Background overlay
    this.add.rectangle(GAME_WIDTH / 2, GAME_HEIGHT / 2, GAME_WIDTH, GAME_HEIGHT, COLORS.MENU_BG, 0.95);

    // Tab bar
    this.tabs.forEach((tab, i) => {
      const key = tab === 'status' ? 'menu.status' : tab === 'items' ? 'menu.items' : tab === 'equip' ? 'menu.equip' : tab === 'quests' ? 'menu.quests' : 'menu.settings';
      this.add.text(Math.round(16 * S) + i * Math.round(96 * S), Math.round(12 * S), t(key), {
        fontSize: `${Math.round(12 * S)}px`,
        color: i === this.tabIndex ? COLORS.TEXT_YELLOW : COLORS.TEXT_WHITE,
        fontFamily: FONT_FAMILY,
      });
    });

    this.add.line(0, Math.round(32 * S), 0, 0, GAME_WIDTH, 0, COLORS.MENU_BORDER).setOrigin(0);

    switch (this.currentTab) {
      case 'status': this.drawStatus(); break;
      case 'items': this.drawItems(); break;
      case 'equip': this.drawEquip(); break;
      case 'quests': this.drawQuests(); break;
      case 'settings': this.drawSettings(); break;
    }

    // Close hint + settings hint
    const hints = this.currentTab === 'settings'
      ? 'Z: ' + t('settings.change') + '    ESC: ' + t('menu.close')
      : 'ESC: ' + t('menu.close');
    this.add.text(GAME_WIDTH / 2, GAME_HEIGHT - Math.round(16 * S), hints, {
      fontSize: `${Math.round(9 * S)}px`, color: COLORS.TEXT_GRAY, fontFamily: FONT_FAMILY,
    }).setOrigin(0.5);
  }

  private drawStatus(): void {
    const p = gameState.player;
    const y = Math.round(52 * S);
    const col = COLORS.TEXT_WHITE;
    const fs = `${Math.round(12 * S)}px`;


    this.add.text(Math.round(32 * S), y, p.state.name, { fontSize: `${Math.round(15 * S)}px`, color: COLORS.TEXT_YELLOW, fontFamily: FONT_FAMILY });
    this.add.text(Math.round(32 * S), y + Math.round(32 * S), `${t('menu.level')} ${p.state.level}`, { fontSize: fs, color: col, fontFamily: FONT_FAMILY });
    this.add.text(Math.round(32 * S), y + Math.round(60 * S), `${t('menu.hp')} ${p.state.hp}/${p.totalMaxHp}`, { fontSize: fs, color: col, fontFamily: FONT_FAMILY });
    this.add.text(Math.round(32 * S), y + Math.round(88 * S), `${t('menu.atk')} ${p.totalAtk}`, { fontSize: fs, color: col, fontFamily: FONT_FAMILY });
    this.add.text(Math.round(32 * S), y + Math.round(112 * S), `${t('menu.def')} ${p.totalDef}`, { fontSize: fs, color: col, fontFamily: FONT_FAMILY });
    this.add.text(Math.round(32 * S), y + Math.round(136 * S), `${t('menu.spd')} ${p.state.spd}`, { fontSize: fs, color: col, fontFamily: FONT_FAMILY });
    this.add.text(Math.round(32 * S), y + Math.round(164 * S), `${t('menu.exp')} ${p.state.exp}/${p.state.expToNext}`, { fontSize: fs, color: col, fontFamily: FONT_FAMILY });
    this.add.text(Math.round(32 * S), y + Math.round(192 * S), `${t('menu.gold')} ${p.state.gold}`, { fontSize: fs, color: COLORS.TEXT_YELLOW, fontFamily: FONT_FAMILY });

    // Equipment display
    const ex = Math.round(280 * S);
    this.add.text(ex, y, t('menu.equip'), { fontSize: `${Math.round(14 * S)}px`, color: COLORS.TEXT_YELLOW, fontFamily: FONT_FAMILY });
    const slots = ['weapon', 'armor', 'shield', 'helmet'] as const;
    slots.forEach((slot, i) => {
      const itemId = p.state.equipment[slot];
      const name = itemId ? t(items[itemId].nameKey) : '---';
      this.add.text(ex, y + Math.round(28 * S) + i * Math.round(24 * S), name, { fontSize: `${Math.round(10 * S)}px`, color: col, fontFamily: FONT_FAMILY });
    });

    // Quiz stats
    const stats = gameState.quizManager.getStats();
    const pct = stats.totalAsked > 0 ? Math.round(stats.totalCorrect / stats.totalAsked * 100) : 0;
    this.add.text(ex, y + Math.round(160 * S), `${t('menu.accuracy')}: ${stats.totalCorrect}/${stats.totalAsked} (${pct}%)`, {
      fontSize: `${Math.round(10 * S)}px`, color: col, fontFamily: FONT_FAMILY,
    });
  }

  private drawItems(): void {
    const equipTypes = ['weapon', 'armor', 'shield', 'helmet'];
    const inv = gameState.player.state.inventory.filter(s => {
      const item = items[s.itemId];
      return item && !equipTypes.includes(item.type);
    });
    const y = Math.round(52 * S);

    if (inv.length === 0) {
      this.add.text(GAME_WIDTH / 2, y + Math.round(80 * S), t('menu.noItems'), { fontSize: `${Math.round(12 * S)}px`, color: COLORS.TEXT_GRAY, fontFamily: FONT_FAMILY }).setOrigin(0.5);
      return;
    }

    inv.forEach((slot, i) => {
      const item = items[slot.itemId];
      if (!item) return;
      this.add.text(Math.round(32 * S), y + i * Math.round(24 * S), `${t(item.nameKey)} x${slot.quantity}`, {
        fontSize: `${Math.round(10 * S)}px`,
        color: i === this.listIndex ? COLORS.TEXT_YELLOW : COLORS.TEXT_WHITE,
        fontFamily: FONT_FAMILY,
      });
      // Show description to the right of the selected item
      if (i === this.listIndex) {
        this.add.text(Math.round(220 * S), y + i * Math.round(24 * S), t(item.descriptionKey), {
          fontSize: `${Math.round(9 * S)}px`, color: COLORS.TEXT_GRAY, fontFamily: FONT_FAMILY,
          wordWrap: { width: GAME_WIDTH - Math.round(240 * S) },
        });
      }
    });
  }

  private drawEquip(): void {
    const p = gameState.player;
    const y = Math.round(52 * S);

    const slotKeys: EquipSlot[] = ['weapon', 'armor', 'shield', 'helmet'];
    const slotNameKeys: Record<string, string> = {
      weapon: 'equip.slot.weapon',
      armor: 'equip.slot.armor',
      shield: 'equip.slot.shield',
      helmet: 'equip.slot.helmet',
    };

    // Section header: current equipment
    this.add.text(Math.round(32 * S), y, t('menu.equip'), {
      fontSize: `${Math.round(14 * S)}px`,
      color: COLORS.TEXT_YELLOW,
      fontFamily: FONT_FAMILY,
    });

    // Hint text
    const hintText = this.equipMode === 'equipped' ? t('equip.hintUnequip') : t('equip.hintEquip');
    this.add.text(GAME_WIDTH - Math.round(32 * S), y, hintText, {
      fontSize: `${Math.round(9 * S)}px`, color: COLORS.TEXT_GRAY, fontFamily: FONT_FAMILY,
    }).setOrigin(1, 0);

    // Equipped items with cursor
    slotKeys.forEach((slot, i) => {
      const isSelected = this.equipMode === 'equipped' && i === this.equipSlotIndex;
      const itemId = p.state.equipment[slot];
      const slotLabel = t(slotNameKeys[slot]);
      const itemName = itemId ? t(items[itemId].nameKey) : t('equip.empty');
      const item = itemId ? items[itemId] : null;
      const statStr = item?.stats
        ? (item.stats.atk ? ` +${item.stats.atk} ${t('menu.atk')}` : '')
          + (item.stats.def ? ` +${item.stats.def} ${t('menu.def')}` : '')
        : '';

      // Cursor
      const cursor = isSelected ? '>' : ' ';
      this.add.text(Math.round(20 * S), y + Math.round(28 * S) + i * Math.round(28 * S), cursor, {
        fontSize: `${Math.round(10 * S)}px`, color: COLORS.TEXT_YELLOW, fontFamily: FONT_FAMILY,
      });

      this.add.text(Math.round(32 * S), y + Math.round(28 * S) + i * Math.round(28 * S), `${slotLabel}:`, {
        fontSize: `${Math.round(10 * S)}px`,
        color: isSelected ? COLORS.TEXT_YELLOW : COLORS.TEXT_GRAY,
        fontFamily: FONT_FAMILY,
      });
      // Show lock icon for legendary (unsellable) equipment
      const isLegendary = itemId && items[itemId]?.unsellable;
      const displayName = isLegendary ? `${itemName} ${t('equip.locked')}` : itemName;
      this.add.text(Math.round(120 * S), y + Math.round(28 * S) + i * Math.round(28 * S), displayName, {
        fontSize: `${Math.round(10 * S)}px`,
        color: isSelected ? COLORS.TEXT_YELLOW : (itemId ? COLORS.TEXT_WHITE : COLORS.TEXT_GRAY),
        fontFamily: FONT_FAMILY,
      });
      if (statStr) {
        this.add.text(Math.round(300 * S), y + Math.round(28 * S) + i * Math.round(28 * S), statStr, {
          fontSize: `${Math.round(9 * S)}px`, color: isSelected ? COLORS.TEXT_YELLOW : '#88aa88', fontFamily: FONT_FAMILY,
        });
      }
    });

    // Divider
    this.add.line(0, y + Math.round(148 * S), Math.round(32 * S), 0, GAME_WIDTH - Math.round(32 * S), 0, COLORS.MENU_BORDER, 0.3).setOrigin(0);

    // Equippable items from inventory
    const equipSlotTypes = ['weapon', 'armor', 'shield', 'helmet'];
    const equipItems = p.state.inventory.filter(s => {
      const item = items[s.itemId];
      return item && equipSlotTypes.includes(item.type);
    });

    this.add.text(Math.round(32 * S), y + Math.round(160 * S), t('equip.owned'), { fontSize: `${Math.round(12 * S)}px`, color: COLORS.TEXT_YELLOW, fontFamily: FONT_FAMILY });

    if (equipItems.length === 0) {
      this.add.text(Math.round(32 * S), y + Math.round(188 * S), '---', { fontSize: `${Math.round(10 * S)}px`, color: COLORS.TEXT_GRAY, fontFamily: FONT_FAMILY });
    } else {
      equipItems.forEach((slot, i) => {
        const item = items[slot.itemId];
        const isSelected = this.equipMode === 'inventory' && i === this.equipInventoryIndex;
        const statStr = (item.stats?.atk ? `+${item.stats.atk} ${t('menu.atk')}` : '')
          + (item.stats?.def ? ` +${item.stats.def} ${t('menu.def')}` : '');

        // Cursor
        const cursor = isSelected ? '>' : ' ';
        this.add.text(Math.round(20 * S), y + Math.round(188 * S) + i * Math.round(24 * S), cursor, {
          fontSize: `${Math.round(10 * S)}px`, color: COLORS.TEXT_YELLOW, fontFamily: FONT_FAMILY,
        });

        this.add.text(Math.round(32 * S), y + Math.round(188 * S) + i * Math.round(24 * S), `${t(item.nameKey)}`, {
          fontSize: `${Math.round(10 * S)}px`, color: isSelected ? COLORS.TEXT_YELLOW : COLORS.TEXT_WHITE, fontFamily: FONT_FAMILY,
        });
        this.add.text(Math.round(220 * S), y + Math.round(188 * S) + i * Math.round(24 * S), statStr, {
          fontSize: `${Math.round(9 * S)}px`, color: isSelected ? COLORS.TEXT_YELLOW : COLORS.TEXT_GRAY, fontFamily: FONT_FAMILY,
        });
      });

      // Stat comparison when hovering an inventory item
      if (this.equipMode === 'inventory' && this.equipInventoryIndex < equipItems.length) {
        const hoveredSlot = equipItems[this.equipInventoryIndex];
        const hoveredItem = items[hoveredSlot.itemId];
        const targetSlot = hoveredItem.type as EquipSlot;
        const currentItemId = p.state.equipment[targetSlot];
        const currentItem = currentItemId ? items[currentItemId] : null;

        const compY = y + Math.round(188 * S) + equipItems.length * Math.round(24 * S) + Math.round(8 * S);
        this.add.line(0, compY - Math.round(4 * S), Math.round(32 * S), 0, GAME_WIDTH - Math.round(32 * S), 0, COLORS.MENU_BORDER, 0.2).setOrigin(0);

        // ATK comparison
        if (hoveredItem.stats?.atk !== undefined) {
          const oldAtk = currentItem?.stats?.atk ?? 0;
          const newAtk = hoveredItem.stats.atk;
          const diff = newAtk - oldAtk;
          const diffColor = diff > 0 ? '#44cc44' : diff < 0 ? '#cc4444' : COLORS.TEXT_WHITE;
          const diffStr = diff > 0 ? `(+${diff})` : diff < 0 ? `(${diff})` : '';
          this.add.text(Math.round(32 * S), compY, `${t('menu.atk')}: +${oldAtk} -> +${newAtk} ${diffStr}`, {
            fontSize: `${Math.round(9 * S)}px`, color: diffColor, fontFamily: FONT_FAMILY,
          });
        }

        // DEF comparison
        if (hoveredItem.stats?.def !== undefined) {
          const oldDef = currentItem?.stats?.def ?? 0;
          const newDef = hoveredItem.stats.def;
          const diff = newDef - oldDef;
          const diffColor = diff > 0 ? '#44cc44' : diff < 0 ? '#cc4444' : COLORS.TEXT_WHITE;
          const diffStr = diff > 0 ? `(+${diff})` : diff < 0 ? `(${diff})` : '';
          const offsetY = hoveredItem.stats?.atk !== undefined ? Math.round(16 * S) : 0;
          this.add.text(Math.round(32 * S), compY + offsetY, `${t('menu.def')}: +${oldDef} -> +${newDef} ${diffStr}`, {
            fontSize: `${Math.round(9 * S)}px`, color: diffColor, fontFamily: FONT_FAMILY,
          });
        }
      }
    }
  }

  private drawQuests(): void {
    const playerState = gameState.player.state;
    const qm = gameState.questManager;
    const activeQuests = qm.getActiveQuests(playerState);
    const y = Math.round(52 * S);
    const fs = `${Math.round(10 * S)}px`;

    // Header
    this.add.text(Math.round(32 * S), y, t('menu.activeQuests'), {
      fontSize: `${Math.round(14 * S)}px`, color: COLORS.TEXT_YELLOW, fontFamily: FONT_FAMILY,
    });

    if (activeQuests.length === 0) {
      this.add.text(GAME_WIDTH / 2, y + Math.round(60 * S), t('menu.noQuests'), {
        fontSize: `${Math.round(12 * S)}px`, color: COLORS.TEXT_GRAY, fontFamily: FONT_FAMILY,
      }).setOrigin(0.5);
    } else {
      // Show up to 6 quests with scrolling
      const maxVisible = 6;
      const scrollOffset = Math.max(0, this.listIndex - (maxVisible - 1));

      for (let i = 0; i < maxVisible; i++) {
        const questIdx = i + scrollOffset;
        if (questIdx >= activeQuests.length) break;
        const quest = activeQuests[questIdx];
        const isSelected = questIdx === this.listIndex;
        const isReady = qm.isQuestReady(quest.id, playerState);
        const readyPrefix = isReady ? '\u2605 ' : '';

        this.add.text(Math.round(32 * S), y + Math.round(28 * S) + i * Math.round(22 * S),
          `${isSelected ? '>' : ' '} ${readyPrefix}${t(quest.titleKey)}`, {
            fontSize: fs,
            color: isSelected ? COLORS.TEXT_YELLOW : isReady ? '#88cc88' : COLORS.TEXT_WHITE,
            fontFamily: FONT_FAMILY,
          });
      }

      // Detail panel for selected quest
      if (this.listIndex < activeQuests.length) {
        const quest = activeQuests[this.listIndex];
        const detailX = Math.round(240 * S);
        let detailY = y + Math.round(28 * S);

        // Description
        this.add.text(detailX, detailY, t(quest.descriptionKey), {
          fontSize: `${Math.round(9 * S)}px`, color: COLORS.TEXT_GRAY, fontFamily: FONT_FAMILY,
          wordWrap: { width: GAME_WIDTH - detailX - Math.round(16 * S) },
        });
        detailY += Math.round(40 * S);

        // Objective progress
        const progress = qm.getObjectiveProgress(quest.id, playerState);
        for (const p of progress) {
          const done = p.current >= p.target;
          const check = done ? '\u2713' : '\u25CB';
          const countStr = p.target > 1 ? ` (${Math.min(p.current, p.target)}/${p.target})` : '';
          this.add.text(detailX, detailY, `${check} ${t(p.objective.descriptionKey)}${countStr}`, {
            fontSize: `${Math.round(9 * S)}px`,
            color: done ? '#88cc88' : COLORS.TEXT_WHITE,
            fontFamily: FONT_FAMILY,
          });
          detailY += Math.round(16 * S);
        }

        // Rewards
        detailY += Math.round(8 * S);
        const rewards = quest.rewards;
        let rewardStr = '';
        if (rewards.exp) rewardStr += `${rewards.exp} EXP  `;
        if (rewards.gold) rewardStr += `${rewards.gold} G  `;
        if (rewards.items) {
          for (const ri of rewards.items) {
            const item = items[ri.itemId];
            if (item) rewardStr += `${t(item.nameKey)} x${ri.quantity}  `;
          }
        }
        if (rewardStr) {
          this.add.text(detailX, detailY, rewardStr.trim(), {
            fontSize: `${Math.round(9 * S)}px`, color: COLORS.TEXT_YELLOW, fontFamily: FONT_FAMILY,
          });
        }
      }
    }

    // Completed quests count
    const completedCount = playerState.completedQuests.length;
    this.add.text(Math.round(32 * S), GAME_HEIGHT - Math.round(52 * S), `${t('menu.completedQuests')}: ${completedCount}`, {
      fontSize: fs, color: COLORS.TEXT_GRAY, fontFamily: FONT_FAMILY,
    });
  }

  /** Returns ordered list of setting IDs visible in the current locale */
  private get settingsList(): string[] {
    const list = ['difficulty', 'language'];
    if (getLocale() === 'ja') list.push('kanji');
    list.push('timer', 'sound', 'volume');
    return list;
  }

  private drawSettings(): void {
    let y = Math.round(60 * S);
    const settingFs = `${Math.round(12 * S)}px`;

    const settings = this.settingsList;

    settings.forEach((id, i) => {
      const selected = this.listIndex === i;
      const labelColor = selected ? COLORS.TEXT_YELLOW : COLORS.TEXT_WHITE;
      const cursor = selected ? '>' : ' ';
      this.add.text(Math.round(20 * S), y, cursor, { fontSize: settingFs, color: COLORS.TEXT_YELLOW, fontFamily: FONT_FAMILY });

      if (id === 'difficulty') {
        const grade = gameState.player.state.quizDifficulty;
        this.add.text(Math.round(32 * S), y, t('settings.difficulty'), { fontSize: settingFs, color: labelColor, fontFamily: FONT_FAMILY });
        this.add.text(Math.round(200 * S), y, t(`grade.${grade}`), { fontSize: settingFs, color: COLORS.TEXT_GRAY, fontFamily: FONT_FAMILY });
      } else if (id === 'language') {
        this.add.text(Math.round(32 * S), y, t('settings.language'), { fontSize: settingFs, color: labelColor, fontFamily: FONT_FAMILY });
        this.add.text(Math.round(200 * S), y, getLocale() === 'ja' ? '日本語' : 'English', { fontSize: settingFs, color: COLORS.TEXT_YELLOW, fontFamily: FONT_FAMILY });
      } else if (id === 'kanji') {
        this.add.text(Math.round(32 * S), y, 'もじ', { fontSize: settingFs, color: labelColor, fontFamily: FONT_FAMILY });
        const kanjiLabel = getKanjiMode() ? 'むずかしい' : 'かんたん';
        this.add.text(Math.round(200 * S), y, kanjiLabel, { fontSize: settingFs, color: COLORS.TEXT_YELLOW, fontFamily: FONT_FAMILY });
      } else if (id === 'timer') {
        const timerEnabled = gameState.player.state.timerEnabled;
        this.add.text(Math.round(32 * S), y, t('settings.timer'), { fontSize: settingFs, color: labelColor, fontFamily: FONT_FAMILY });
        this.add.text(Math.round(200 * S), y, timerEnabled ? t('settings.timerOn') : t('settings.timerOff'), { fontSize: settingFs, color: COLORS.TEXT_YELLOW, fontFamily: FONT_FAMILY });
      } else if (id === 'sound') {
        const soundEnabled = gameState.player.state.soundEnabled;
        this.add.text(Math.round(32 * S), y, t('settings.sound'), { fontSize: settingFs, color: labelColor, fontFamily: FONT_FAMILY });
        this.add.text(Math.round(200 * S), y, soundEnabled ? t('settings.soundOn') : t('settings.soundOff'), { fontSize: settingFs, color: COLORS.TEXT_YELLOW, fontFamily: FONT_FAMILY });
      } else if (id === 'volume') {
        const vol = Math.round(gameState.player.state.masterVolume * 100);
        this.add.text(Math.round(32 * S), y, t('settings.volume'), { fontSize: settingFs, color: labelColor, fontFamily: FONT_FAMILY });
        this.add.text(Math.round(200 * S), y, `${vol}%`, { fontSize: settingFs, color: COLORS.TEXT_YELLOW, fontFamily: FONT_FAMILY });
      }
      y += Math.round(28 * S);
    });
  }

  private setupInput(): void {
    this.input.keyboard?.on('keydown-ESC', () => {
      this.scene.stop();
      this.scene.resume('WorldMapScene');
    });

    this.input.keyboard?.on('keydown-LEFT', () => {
      this.tabIndex = Math.max(0, this.tabIndex - 1);
      this.currentTab = this.tabs[this.tabIndex];
      this.listIndex = 0;
      this.equipMode = 'equipped';
      this.equipSlotIndex = 0;
      this.equipInventoryIndex = 0;
      this.drawMenu();
    });

    this.input.keyboard?.on('keydown-RIGHT', () => {
      this.tabIndex = Math.min(this.tabs.length - 1, this.tabIndex + 1);
      this.currentTab = this.tabs[this.tabIndex];
      this.listIndex = 0;
      this.equipMode = 'equipped';
      this.equipSlotIndex = 0;
      this.equipInventoryIndex = 0;
      this.drawMenu();
    });

    this.input.keyboard?.on('keydown-UP', () => {
      if (this.currentTab === 'equip') {
        this.handleEquipUp();
      } else {
        this.listIndex = Math.max(0, this.listIndex - 1);
        this.drawMenu();
      }
    });

    this.input.keyboard?.on('keydown-DOWN', () => {
      if (this.currentTab === 'equip') {
        this.handleEquipDown();
      } else {
        const maxIndex = this.currentTab === 'settings' ? this.settingsList.length - 1
          : this.currentTab === 'items' ? Math.max(0, this.getConsumableItems().length - 1)
          : this.currentTab === 'quests' ? Math.max(0, gameState.questManager.getActiveQuests(gameState.player.state).length - 1)
          : 99;
        this.listIndex = Math.min(maxIndex, this.listIndex + 1);
        this.drawMenu();
      }
    });

    this.input.keyboard?.on('keydown-Z', () => {
      if (this.currentTab === 'items') this.useItem();
      else if (this.currentTab === 'equip') this.handleEquipAction();
      else if (this.currentTab === 'settings') this.handleSettingToggle(1);
    });
    this.input.keyboard?.on('keydown-ENTER', () => {
      if (this.currentTab === 'items') this.useItem();
      else if (this.currentTab === 'equip') this.handleEquipAction();
      else if (this.currentTab === 'settings') this.handleSettingToggle(1);
    });
  }

  // ── Equipment tab navigation ──────────────────────────

  private handleEquipUp(): void {
    if (this.equipMode === 'equipped') {
      this.equipSlotIndex = Math.max(0, this.equipSlotIndex - 1);
    } else {
      // In inventory mode
      if (this.equipInventoryIndex === 0) {
        // Switch to equipped mode, select last slot
        this.equipMode = 'equipped';
        this.equipSlotIndex = 3;
      } else {
        this.equipInventoryIndex--;
      }
    }
    this.drawMenu();
  }

  private handleEquipDown(): void {
    const equipItems = this.getEquipInventoryItems();

    if (this.equipMode === 'equipped') {
      if (this.equipSlotIndex === 3) {
        // Switch to inventory mode if there are items
        if (equipItems.length > 0) {
          this.equipMode = 'inventory';
          this.equipInventoryIndex = 0;
        }
      } else {
        this.equipSlotIndex++;
      }
    } else {
      // In inventory mode
      this.equipInventoryIndex = Math.min(equipItems.length - 1, this.equipInventoryIndex + 1);
    }
    this.drawMenu();
  }

  private handleEquipAction(): void {
    if (this.equipMode === 'equipped') {
      // Unequip the selected slot
      const slotKeys: EquipSlot[] = ['weapon', 'armor', 'shield', 'helmet'];
      const slot = slotKeys[this.equipSlotIndex];
      const result = gameState.player.unequip(slot);
      if (result) audioManager.playSfx('equip');
    } else {
      // Equip from inventory
      const equipItems = this.getEquipInventoryItems();
      if (this.equipInventoryIndex >= equipItems.length) return;
      const slot = equipItems[this.equipInventoryIndex];
      gameState.player.equip(slot.itemId);
      audioManager.playSfx('equip');
      // Reset inventory index if we went past the end
      const newItems = this.getEquipInventoryItems();
      if (this.equipInventoryIndex >= newItems.length) {
        if (newItems.length === 0) {
          this.equipMode = 'equipped';
          this.equipSlotIndex = 0;
        } else {
          this.equipInventoryIndex = newItems.length - 1;
        }
      }
    }
    this.drawMenu();
  }

  private getEquipInventoryItems() {
    const equipSlotTypes = ['weapon', 'armor', 'shield', 'helmet'];
    return gameState.player.state.inventory.filter(s => {
      const item = items[s.itemId];
      return item && equipSlotTypes.includes(item.type);
    });
  }

  // ── Settings handlers ──────────────────────────

  private handleSettingToggle(dir: -1 | 1): void {
    const id = this.settingsList[this.listIndex];
    if (id === 'difficulty') return; // read-only
    if (id === 'language') {
      const newLocale = getLocale() === 'ja' ? 'en' : 'ja';
      setLocale(newLocale);
      gameState.player.state.locale = newLocale;
      // Reset kanji mode when switching away from Japanese
      if (newLocale === 'en') {
        setKanjiMode(false);
        gameState.player.state.kanjiMode = false;
      }
      // Clamp listIndex if kanji row appeared/disappeared
      if (this.listIndex >= this.settingsList.length) {
        this.listIndex = this.settingsList.length - 1;
      }
    } else if (id === 'kanji') {
      const newMode = !getKanjiMode();
      setKanjiMode(newMode);
      gameState.player.state.kanjiMode = newMode;
    } else if (id === 'timer') {
      gameState.player.state.timerEnabled = !gameState.player.state.timerEnabled;
    } else if (id === 'sound') {
      gameState.player.state.soundEnabled = !gameState.player.state.soundEnabled;
      audioManager.setMuted(!gameState.player.state.soundEnabled);
    } else if (id === 'volume') {
      // Cycle 0→10→20→...→100→0
      const cur = Math.round(gameState.player.state.masterVolume * 10);
      const next = (cur + 1) % 11;
      gameState.player.state.masterVolume = Math.round(next) / 10;
      audioManager.setVolume(gameState.player.state.masterVolume);
    }
    this.drawMenu();
  }

  /** Returns inventory items excluding equipment (weapons/armor/shields/helmets) */
  private getConsumableItems() {
    const equipTypes = ['weapon', 'armor', 'shield', 'helmet'];
    return gameState.player.state.inventory.filter(s => {
      const item = items[s.itemId];
      return item && !equipTypes.includes(item.type);
    });
  }

  private useItem(): void {
    const inv = this.getConsumableItems();
    if (this.listIndex >= inv.length) return;
    const slot = inv[this.listIndex];
    const item = items[slot.itemId];
    if (!item || item.type !== 'consumable' || !item.effect) return;

    if (item.effect.type === 'heal') {
      // Check if HP is already full
      if (gameState.player.state.hp >= gameState.player.totalMaxHp) {
        this.showItemMessage(t('item.alreadyFull'));
        return;
      }
      const hpBefore = gameState.player.state.hp;
      gameState.player.heal(item.effect.value);
      const healed = gameState.player.state.hp - hpBefore;
      gameState.player.removeItem(slot.itemId, 1);
      audioManager.playSfx('heal');
      this.showItemMessage(`${t('item.used', { name: t(item.nameKey) })} ${t('item.healed', { value: healed })}`);
      // Adjust cursor if the last item was consumed
      const newInv = this.getConsumableItems();
      if (this.listIndex >= newInv.length) {
        this.listIndex = Math.max(0, newInv.length - 1);
      }
    } else if (item.effect.type === 'escape') {
      // Smoke bombs can only be used in battle — not from the menu
      this.showItemMessage(t('item.cantUseHere'));
      return;
    }

    this.drawMenu();
  }

  private showItemMessage(msg: string): void {
    // Show a temporary message overlay on the items tab
    const y = GAME_HEIGHT - Math.round(52 * S);
    const box = this.add.rectangle(GAME_WIDTH / 2, y, GAME_WIDTH - Math.round(16 * S), Math.round(28 * S), COLORS.MENU_BG, 0.95)
      .setStrokeStyle(1, COLORS.MENU_BORDER).setDepth(100);
    const text = this.add.text(GAME_WIDTH / 2, y, msg, {
      fontSize: `${Math.round(11 * S)}px`, color: COLORS.TEXT_YELLOW, fontFamily: FONT_FAMILY,
    }).setOrigin(0.5).setDepth(101);
    // Auto-dismiss after 1.5 seconds
    this.time.delayedCall(1500, () => {
      box.destroy();
      text.destroy();
    });
  }

  shutdown(): void {
    this.input.keyboard?.removeAllListeners();
  }
}
