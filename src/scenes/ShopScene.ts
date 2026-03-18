import Phaser from 'phaser';
import { GAME_WIDTH, GAME_HEIGHT, COLORS } from '../utils/constants';
import { t } from '../i18n/i18n';
import { gameState } from '../GameState';
import { items } from '../data/items';
import { shops } from '../data/shops';
import { audioManager } from '../systems/audio/AudioManager';

export class ShopScene extends Phaser.Scene {
  private shopId = '';
  private mode: 'menu' | 'buy' | 'sell' = 'menu';
  private menuIndex = 0;
  private listIndex = 0;
  private message = '';

  constructor() {
    super('ShopScene');
  }

  init(data: { shopId: string }): void {
    this.shopId = data.shopId;
  }

  create(): void {
    this.mode = 'menu';
    this.menuIndex = 0;
    this.listIndex = 0;
    this.message = '';
    this.drawShop();
    this.setupInput();
  }

  private drawShop(): void {
    this.children.removeAll();

    // Background
    this.add.rectangle(GAME_WIDTH / 2, GAME_HEIGHT / 2, GAME_WIDTH, GAME_HEIGHT, COLORS.MENU_BG, 0.95);

    // Title
    this.add.text(GAME_WIDTH / 2, 20, t('shop.welcome'), {
      fontSize: '12px', color: COLORS.TEXT_WHITE, fontFamily: 'monospace',
      wordWrap: { width: GAME_WIDTH - 40 },
    }).setOrigin(0.5);

    // Gold display
    this.add.text(GAME_WIDTH - 16, 20, `${gameState.player.state.gold}G`, {
      fontSize: '12px', color: COLORS.TEXT_YELLOW, fontFamily: 'monospace',
    }).setOrigin(1, 0.5);

    if (this.mode === 'menu') {
      this.drawMainMenu();
    } else if (this.mode === 'buy') {
      this.drawBuyList();
    } else if (this.mode === 'sell') {
      this.drawSellList();
    }

    // Message
    if (this.message) {
      this.add.text(GAME_WIDTH / 2, GAME_HEIGHT - 32, this.message, {
        fontSize: '12px', color: COLORS.TEXT_YELLOW, fontFamily: 'monospace',
      }).setOrigin(0.5);
    }
  }

  private drawMainMenu(): void {
    const options = [
      { key: 'shop.buy', action: 'buy' },
      { key: 'shop.sell', action: 'sell' },
      { key: 'shop.leave', action: 'leave' },
    ];

    options.forEach((opt, i) => {
      this.add.text(GAME_WIDTH / 2, 100 + i * 36, t(opt.key), {
        fontSize: '14px',
        color: i === this.menuIndex ? COLORS.TEXT_YELLOW : COLORS.TEXT_WHITE,
        fontFamily: 'monospace',
      }).setOrigin(0.5);
    });
  }

  private drawBuyList(): void {
    const shop = shops[this.shopId];
    if (!shop) return;

    shop.items.forEach((itemId, i) => {
      const item = items[itemId];
      if (!item) return;
      const canAfford = gameState.player.state.gold >= item.buyPrice;
      this.add.text(32, 64 + i * 28, `${t(item.nameKey)}  ${item.buyPrice}G`, {
        fontSize: '10px',
        color: i === this.listIndex ? COLORS.TEXT_YELLOW : (canAfford ? COLORS.TEXT_WHITE : COLORS.TEXT_GRAY),
        fontFamily: 'monospace',
      });

      // Show stats
      if (item.stats) {
        const statText = Object.entries(item.stats).map(([k, v]) => `+${v}${k.toUpperCase()}`).join(' ');
        this.add.text(GAME_WIDTH - 16, 64 + i * 28, statText, {
          fontSize: '9px', color: COLORS.TEXT_GRAY, fontFamily: 'monospace',
        }).setOrigin(1, 0);
      }
    });

    // "Done" option at the bottom
    const doneY = 64 + shop.items.length * 28;
    this.add.text(32, doneY, `▸ ${t('shop.done')}`, {
      fontSize: '10px',
      color: this.listIndex === shop.items.length ? COLORS.TEXT_YELLOW : COLORS.TEXT_GRAY,
      fontFamily: 'monospace',
    });
  }

  private drawSellList(): void {
    const inv = gameState.player.state.inventory.filter(s => !items[s.itemId]?.unsellable);
    if (inv.length === 0) {
      this.add.text(GAME_WIDTH / 2, 120, t('shop.noItemsToSell'), {
        fontSize: '12px', color: COLORS.TEXT_GRAY, fontFamily: 'monospace',
      }).setOrigin(0.5);
    } else {
      inv.forEach((slot, i) => {
        const item = items[slot.itemId];
        if (!item) return;
        this.add.text(32, 64 + i * 28, `${t(item.nameKey)} x${slot.quantity}  ${item.sellPrice}G`, {
          fontSize: '10px',
          color: i === this.listIndex ? COLORS.TEXT_YELLOW : COLORS.TEXT_WHITE,
          fontFamily: 'monospace',
        });
      });
    }

    // "Done" option at the bottom
    const doneY = 64 + inv.length * 28;
    this.add.text(32, doneY, `▸ ${t('shop.done')}`, {
      fontSize: '10px',
      color: this.listIndex === inv.length ? COLORS.TEXT_YELLOW : COLORS.TEXT_GRAY,
      fontFamily: 'monospace',
    });
  }

  private setupInput(): void {
    this.input.keyboard?.on('keydown-UP', () => {
      if (this.mode === 'menu') this.menuIndex = Math.max(0, this.menuIndex - 1);
      else this.listIndex = Math.max(0, this.listIndex - 1);
      this.drawShop();
    });

    this.input.keyboard?.on('keydown-DOWN', () => {
      if (this.mode === 'menu') {
        this.menuIndex = Math.min(2, this.menuIndex + 1);
      } else {
        this.listIndex = Math.min(this.listIndex + 1, this.getListMaxIndex());
      }
      this.drawShop();
    });

    this.input.keyboard?.on('keydown-Z', () => this.confirm());
    this.input.keyboard?.on('keydown-ENTER', () => this.confirm());

    this.input.keyboard?.on('keydown-X', () => {
      if (this.mode !== 'menu') {
        // Exit shop directly from buy/sell mode (more natural than going back to menu)
        this.leave();
      }
    });
    this.input.keyboard?.on('keydown-ESC', () => this.leave());
  }

  /** Returns the max valid listIndex (including the "Done" entry at the end). */
  private getListMaxIndex(): number {
    if (this.mode === 'buy') {
      const shop = shops[this.shopId];
      return shop ? shop.items.length : 0; // last index = "Done"
    }
    // sell
    const inv = gameState.player.state.inventory.filter(s => !items[s.itemId]?.unsellable);
    return inv.length; // last index = "Done"
  }

  private confirm(): void {
    if (this.mode === 'menu') {
      if (this.menuIndex === 0) { this.mode = 'buy'; this.listIndex = 0; }
      else if (this.menuIndex === 1) { this.mode = 'sell'; this.listIndex = 0; }
      else this.leave();
      this.message = '';
      this.drawShop();
    } else if (this.listIndex === this.getListMaxIndex()) {
      // "Done" selected — exit shop
      this.leave();
    } else if (this.mode === 'buy') {
      this.buyItem();
    } else if (this.mode === 'sell') {
      this.sellItem();
    }
  }

  private buyItem(): void {
    const shop = shops[this.shopId];
    if (!shop) return;
    const itemId = shop.items[this.listIndex];
    if (!itemId) return;
    const item = items[itemId];
    if (!item) return;

    if (gameState.player.state.gold < item.buyPrice) {
      this.message = t('shop.cantAfford');
    } else if (!gameState.player.addItem(itemId, 1)) {
      this.message = t('shop.inventoryFull');
    } else {
      gameState.player.state.gold -= item.buyPrice;
      this.message = t('shop.bought', { item: t(item.nameKey) });
      audioManager.playSfx('shop_buy');
    }
    this.drawShop();
  }

  private sellItem(): void {
    const inv = gameState.player.state.inventory.filter(s => !items[s.itemId]?.unsellable);
    if (this.listIndex >= inv.length) return;
    const slot = inv[this.listIndex];
    const item = items[slot.itemId];
    if (!item) return;

    if (item.unsellable) {
      this.message = t('shop.cantSell');
      audioManager.playSfx('menu_cancel');
      this.drawShop();
      return;
    }

    gameState.player.state.gold += item.sellPrice;
    gameState.player.removeItem(slot.itemId, 1);
    this.message = t('shop.sold', { item: t(item.nameKey) });
    audioManager.playSfx('shop_sell');
    if (this.listIndex > 0) this.listIndex--;
    this.drawShop();
  }

  private leave(): void {
    this.scene.stop();
    this.scene.resume('WorldMapScene');
  }
}
