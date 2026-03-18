import Phaser from 'phaser';
import { GAME_WIDTH, GAME_HEIGHT, COLORS } from '../utils/constants';
import { t, setLocale, getLocale } from '../i18n/i18n';
import { gameState } from '../GameState';
import { items } from '../data/items';
import { EquipSlot } from '../utils/types';
import { audioManager } from '../systems/audio/AudioManager';

type MenuTab = 'status' | 'items' | 'equip' | 'settings';

export class MenuScene extends Phaser.Scene {
  private currentTab: MenuTab = 'status';
  private tabIndex = 0;
  private listIndex = 0;
  private tabs: MenuTab[] = ['status', 'items', 'equip', 'settings'];

  // Equipment tab state
  private equipMode: 'equipped' | 'inventory' = 'equipped';
  private equipSlotIndex = 0;
  private equipInventoryIndex = 0;

  constructor() {
    super('MenuScene');
  }

  create(): void {
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
      this.add.text(GAME_WIDTH / 2, y + 80, t('menu.noItems'), { fontSize: '12px', color: COLORS.TEXT_GRAY, fontFamily: 'monospace' }).setOrigin(0.5);
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
    const slotKeys: EquipSlot[] = ['weapon', 'armor', 'shield', 'helmet'];
    const slotNameKeys: Record<string, string> = {
      weapon: 'equip.slot.weapon',
      armor: 'equip.slot.armor',
      shield: 'equip.slot.shield',
      helmet: 'equip.slot.helmet',
    };

    // Section header: current equipment
    this.add.text(32, y, t('menu.equip'), {
      fontSize: '14px',
      color: COLORS.TEXT_YELLOW,
      fontFamily: ff,
    });

    // Hint text
    const hintText = this.equipMode === 'equipped' ? 'Z: Unequip' : 'Z: Equip';
    this.add.text(GAME_WIDTH - 32, y, hintText, {
      fontSize: '9px', color: COLORS.TEXT_GRAY, fontFamily: ff,
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
      this.add.text(20, y + 28 + i * 28, cursor, {
        fontSize: '10px', color: COLORS.TEXT_YELLOW, fontFamily: ff,
      });

      this.add.text(32, y + 28 + i * 28, `${slotLabel}:`, {
        fontSize: '10px',
        color: isSelected ? COLORS.TEXT_YELLOW : COLORS.TEXT_GRAY,
        fontFamily: ff,
      });
      // Show lock icon for legendary (unsellable) equipment
      const isLegendary = itemId && items[itemId]?.unsellable;
      const displayName = isLegendary ? `${itemName} [LOCK]` : itemName;
      this.add.text(120, y + 28 + i * 28, displayName, {
        fontSize: '10px',
        color: isSelected ? COLORS.TEXT_YELLOW : (itemId ? COLORS.TEXT_WHITE : COLORS.TEXT_GRAY),
        fontFamily: ff,
      });
      if (statStr) {
        this.add.text(300, y + 28 + i * 28, statStr, {
          fontSize: '9px', color: isSelected ? COLORS.TEXT_YELLOW : '#88aa88', fontFamily: ff,
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
        const isSelected = this.equipMode === 'inventory' && i === this.equipInventoryIndex;
        const statStr = (item.stats?.atk ? `+${item.stats.atk} ${t('menu.atk')}` : '')
          + (item.stats?.def ? ` +${item.stats.def} ${t('menu.def')}` : '');

        // Cursor
        const cursor = isSelected ? '>' : ' ';
        this.add.text(20, y + 188 + i * 24, cursor, {
          fontSize: '10px', color: COLORS.TEXT_YELLOW, fontFamily: ff,
        });

        this.add.text(32, y + 188 + i * 24, `${t(item.nameKey)}`, {
          fontSize: '10px', color: isSelected ? COLORS.TEXT_YELLOW : COLORS.TEXT_WHITE, fontFamily: ff,
        });
        this.add.text(220, y + 188 + i * 24, statStr, {
          fontSize: '9px', color: isSelected ? COLORS.TEXT_YELLOW : COLORS.TEXT_GRAY, fontFamily: ff,
        });
      });

      // Stat comparison when hovering an inventory item
      if (this.equipMode === 'inventory' && this.equipInventoryIndex < equipItems.length) {
        const hoveredSlot = equipItems[this.equipInventoryIndex];
        const hoveredItem = items[hoveredSlot.itemId];
        const targetSlot = hoveredItem.type as EquipSlot;
        const currentItemId = p.state.equipment[targetSlot];
        const currentItem = currentItemId ? items[currentItemId] : null;

        const compY = y + 188 + equipItems.length * 24 + 8;
        this.add.line(0, compY - 4, 32, 0, GAME_WIDTH - 32, 0, COLORS.MENU_BORDER, 0.2).setOrigin(0);

        // ATK comparison
        if (hoveredItem.stats?.atk !== undefined) {
          const oldAtk = currentItem?.stats?.atk ?? 0;
          const newAtk = hoveredItem.stats.atk;
          const diff = newAtk - oldAtk;
          const diffColor = diff > 0 ? '#44cc44' : diff < 0 ? '#cc4444' : COLORS.TEXT_WHITE;
          const diffStr = diff > 0 ? `(+${diff})` : diff < 0 ? `(${diff})` : '';
          this.add.text(32, compY, `${t('menu.atk')}: +${oldAtk} -> +${newAtk} ${diffStr}`, {
            fontSize: '9px', color: diffColor, fontFamily: ff,
          });
        }

        // DEF comparison
        if (hoveredItem.stats?.def !== undefined) {
          const oldDef = currentItem?.stats?.def ?? 0;
          const newDef = hoveredItem.stats.def;
          const diff = newDef - oldDef;
          const diffColor = diff > 0 ? '#44cc44' : diff < 0 ? '#cc4444' : COLORS.TEXT_WHITE;
          const diffStr = diff > 0 ? `(+${diff})` : diff < 0 ? `(${diff})` : '';
          const offsetY = hoveredItem.stats?.atk !== undefined ? 16 : 0;
          this.add.text(32, compY + offsetY, `${t('menu.def')}: +${oldDef} -> +${newDef} ${diffStr}`, {
            fontSize: '9px', color: diffColor, fontFamily: ff,
          });
        }
      }
    }
  }

  private drawSettings(): void {
    const y = 60;
    const ff = 'monospace';

    // Language
    this.add.text(32, y, t('settings.language'), {
      fontSize: '12px', color: this.listIndex === 0 ? COLORS.TEXT_YELLOW : COLORS.TEXT_WHITE, fontFamily: ff,
    });
    this.add.text(32, y + 28, `< ${getLocale() === 'ja' ? '日本語' : 'English'} >`, {
      fontSize: '12px', color: COLORS.TEXT_YELLOW, fontFamily: ff,
    });

    // Timer toggle
    const timerEnabled = gameState.player.state.timerEnabled;
    this.add.text(32, y + 72, t('settings.timer'), {
      fontSize: '12px', color: this.listIndex === 1 ? COLORS.TEXT_YELLOW : COLORS.TEXT_WHITE, fontFamily: ff,
    });
    this.add.text(32, y + 100, `< ${timerEnabled ? t('settings.timerOn') : t('settings.timerOff')} >`, {
      fontSize: '12px', color: COLORS.TEXT_YELLOW, fontFamily: ff,
    });

    // Sound toggle
    const soundEnabled = gameState.player.state.soundEnabled;
    this.add.text(32, y + 144, t('settings.sound'), {
      fontSize: '12px', color: this.listIndex === 2 ? COLORS.TEXT_YELLOW : COLORS.TEXT_WHITE, fontFamily: ff,
    });
    this.add.text(32, y + 172, `< ${soundEnabled ? t('settings.soundOn') : t('settings.soundOff')} >`, {
      fontSize: '12px', color: COLORS.TEXT_YELLOW, fontFamily: ff,
    });

    // Volume
    const vol = Math.round(gameState.player.state.masterVolume * 100);
    this.add.text(32, y + 216, t('settings.volume'), {
      fontSize: '12px', color: this.listIndex === 3 ? COLORS.TEXT_YELLOW : COLORS.TEXT_WHITE, fontFamily: ff,
    });
    this.add.text(32, y + 244, `< ${vol}% >`, {
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
        this.equipMode = 'equipped';
        this.equipSlotIndex = 0;
        this.equipInventoryIndex = 0;
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
        this.equipMode = 'equipped';
        this.equipSlotIndex = 0;
        this.equipInventoryIndex = 0;
        this.drawMenu();
      }
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
        const maxIndex = this.currentTab === 'settings' ? 3
          : this.currentTab === 'items' ? Math.max(0, gameState.player.state.inventory.length - 1)
          : 99;
        this.listIndex = Math.min(maxIndex, this.listIndex + 1);
        this.drawMenu();
      }
    });

    this.input.keyboard?.on('keydown-Z', () => {
      if (this.currentTab === 'items') this.useItem();
      else if (this.currentTab === 'equip') this.handleEquipAction();
    });
    this.input.keyboard?.on('keydown-ENTER', () => {
      if (this.currentTab === 'items') this.useItem();
      else if (this.currentTab === 'equip') this.handleEquipAction();
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

  private handleSettingsLeft(): void {
    if (this.listIndex === 0) {
      const newLocale = getLocale() === 'ja' ? 'en' : 'ja';
      setLocale(newLocale);
      gameState.player.state.locale = newLocale;
    } else if (this.listIndex === 1) {
      gameState.player.state.timerEnabled = !gameState.player.state.timerEnabled;
    } else if (this.listIndex === 2) {
      gameState.player.state.soundEnabled = !gameState.player.state.soundEnabled;
      audioManager.setMuted(!gameState.player.state.soundEnabled);
    } else if (this.listIndex === 3) {
      const vol = Math.max(0, gameState.player.state.masterVolume - 0.1);
      gameState.player.state.masterVolume = Math.round(vol * 10) / 10;
      audioManager.setVolume(gameState.player.state.masterVolume);
    }
    this.drawMenu();
  }

  private handleSettingsRight(): void {
    if (this.listIndex === 0) {
      const newLocale = getLocale() === 'ja' ? 'en' : 'ja';
      setLocale(newLocale);
      gameState.player.state.locale = newLocale;
    } else if (this.listIndex === 1) {
      gameState.player.state.timerEnabled = !gameState.player.state.timerEnabled;
    } else if (this.listIndex === 2) {
      gameState.player.state.soundEnabled = !gameState.player.state.soundEnabled;
      audioManager.setMuted(!gameState.player.state.soundEnabled);
    } else if (this.listIndex === 3) {
      const vol = Math.min(1, gameState.player.state.masterVolume + 0.1);
      gameState.player.state.masterVolume = Math.round(vol * 10) / 10;
      audioManager.setVolume(gameState.player.state.masterVolume);
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
      if (this.listIndex >= gameState.player.state.inventory.length) {
        this.listIndex = Math.max(0, gameState.player.state.inventory.length - 1);
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
    const y = GAME_HEIGHT - 52;
    const box = this.add.rectangle(GAME_WIDTH / 2, y, GAME_WIDTH - 16, 28, COLORS.MENU_BG, 0.95)
      .setStrokeStyle(1, COLORS.MENU_BORDER).setDepth(100);
    const text = this.add.text(GAME_WIDTH / 2, y, msg, {
      fontSize: '11px', color: COLORS.TEXT_YELLOW, fontFamily: 'monospace',
    }).setOrigin(0.5).setDepth(101);
    // Auto-dismiss after 1.5 seconds
    this.time.delayedCall(1500, () => {
      box.destroy();
      text.destroy();
    });
  }
}
