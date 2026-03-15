import Phaser from 'phaser';
import { GAME_WIDTH, GAME_HEIGHT, TILE_SIZE, COLORS } from '../utils/constants';
import { t } from '../i18n/i18n';
import { gameState } from '../GameState';
import { generateOverworldMap, generateTownMap, generateDungeonMap } from '../utils/MapGenerator';
import { mapDefs } from '../data/maps';
import { monsters } from '../data/monsters';
import { items } from '../data/items';

export class WorldMapScene extends Phaser.Scene {
  private hero!: Phaser.GameObjects.Sprite;
  private mapData: number[][] = [];
  private tileLayer!: Phaser.GameObjects.Container;
  private cursors!: Phaser.Types.Input.Keyboard.CursorKeys;
  private isMoving = false;
  private heroTileX = 0;
  private heroTileY = 0;
  private currentMapId = 'overworld';
  private messageText?: Phaser.GameObjects.Text;
  private messageBox?: Phaser.GameObjects.Rectangle;
  private showingMessage = false;
  private hpText?: Phaser.GameObjects.Text;
  private guideText?: Phaser.GameObjects.Text;
  private stepCount = 0;
  private npcSprites: Phaser.GameObjects.Sprite[] = [];
  private heroDir = 0; // 0=down, 1=left, 2=right, 3=up
  private dialogQueue: string[] = [];
  private dialogCallback?: () => void;
  private pendingBossId?: string;

  constructor() {
    super('WorldMapScene');
  }

  create(): void {
    this.isMoving = false;
    this.showingMessage = false;
    this.npcSprites = [];

    const pos = gameState.player.state.position;
    this.currentMapId = pos.mapId;
    this.heroTileX = pos.x;
    this.heroTileY = pos.y;

    this.loadMap(this.currentMapId);
    this.setupInput();
    this.createHUD();
  }

  private loadMap(mapId: string): void {
    this.currentMapId = mapId;
    const def = mapDefs[mapId];

    // Generate map data
    if (mapId === 'overworld') {
      this.mapData = generateOverworldMap(def.width, def.height, gameState.player.state.storyFlags);
    } else if (def.type === 'town') {
      this.mapData = generateTownMap(def.width, def.height, mapId.charCodeAt(0) * 137);
    } else if (def.type === 'dungeon') {
      this.mapData = generateDungeonMap(def.width, def.height, mapId.charCodeAt(0) * 251);
      // Mark already-opened chests and remove defeated boss tiles
      for (let y = 0; y < this.mapData.length; y++) {
        for (let x = 0; x < this.mapData[y].length; x++) {
          if (this.mapData[y][x] === 4) {
            const chestKey = `chest.${mapId}.${x}.${y}`;
            if (gameState.player.state.storyFlags[chestKey]) {
              this.mapData[y][x] = 8; // opened
            }
          }
          if (this.mapData[y][x] === 7 && def.bossId) {
            if (gameState.player.state.storyFlags[`boss.${def.bossId}.defeated`]) {
              this.mapData[y][x] = 0; // remove boss tile
            }
          }
        }
      }
      // Reset pending boss state on map load
      this.pendingBossId = undefined;
    }

    this.renderMap();
    this.renderNPCs(def);
    this.createHero();
    this.updateCamera();
  }

  private renderMap(): void {
    // Clear previous
    if (this.tileLayer) this.tileLayer.destroy();
    this.tileLayer = this.add.container(0, 0);
    this.npcSprites.forEach(s => s.destroy());
    this.npcSprites = [];

    const def = mapDefs[this.currentMapId];
    const prefix = def.type === 'overworld' ? 'ow'
      : def.type === 'town' ? 'town' : 'dng';

    for (let y = 0; y < this.mapData.length; y++) {
      for (let x = 0; x < this.mapData[y].length; x++) {
        const tileIndex = this.mapData[y][x];
        const px = x * TILE_SIZE;
        const py = y * TILE_SIZE;
        const tileKey = `${prefix}-${tileIndex}`;
        const tile = this.add.image(px, py, tileKey).setOrigin(0).setScale(2);
        this.tileLayer.add(tile);
      }
    }
  }

  private renderNPCs(def: typeof mapDefs[string]): void {
    for (const npc of def.npcs) {
      const sprite = this.add.sprite(
        npc.x * TILE_SIZE + TILE_SIZE / 2,
        npc.y * TILE_SIZE + TILE_SIZE / 2,
        'npc'
      ).setOrigin(0.5).setScale(2);
      this.npcSprites.push(sprite);
    }

    // Shopkeeper (inside shop behind counter, Dragon Quest style)
    if (def.shopId) {
      const sx = def.width - 4; // center tile of 3-wide shop starting at width-5
      const sy = 12; // wall row (behind counter tile)
      const sprite = this.add.sprite(
        sx * TILE_SIZE + TILE_SIZE / 2,
        sy * TILE_SIZE + TILE_SIZE / 2 - 4, // nudge up so head pokes above counter
        'shopkeeper'
      ).setOrigin(0.5).setScale(2).setDepth(5);
      this.npcSprites.push(sprite);
    }

    // Save point
    if (def.savePoint) {
      this.add.sprite(
        def.savePoint.x * TILE_SIZE + TILE_SIZE / 2,
        def.savePoint.y * TILE_SIZE + TILE_SIZE / 2,
        'save-point'
      ).setOrigin(0.5).setScale(2);
    }
  }

  private createHero(): void {
    if (this.hero) this.hero.destroy();
    this.hero = this.add.sprite(
      this.heroTileX * TILE_SIZE + TILE_SIZE / 2,
      this.heroTileY * TILE_SIZE + TILE_SIZE / 2,
      'hero-walk', 0
    ).setOrigin(0.5).setDepth(10).setScale(2);
  }

  private setupInput(): void {
    this.cursors = this.input.keyboard!.createCursorKeys();

    // Menu key
    this.input.keyboard?.on('keydown-ESC', () => {
      if (!this.showingMessage) {
        this.scene.launch('MenuScene');
        this.scene.pause();
      }
    });

    // Interact key
    this.input.keyboard?.on('keydown-Z', () => {
      if (this.showingMessage) {
        this.advanceDialog();
        return;
      }
      this.interact();
    });
    this.input.keyboard?.on('keydown-ENTER', () => {
      if (this.showingMessage) {
        this.advanceDialog();
        return;
      }
      this.interact();
    });
  }

  update(): void {
    if (this.isMoving || this.showingMessage) return;

    let dx = 0, dy = 0;
    let dir = 0;

    if (this.cursors.left.isDown) { dx = -1; dir = 1; }
    else if (this.cursors.right.isDown) { dx = 1; dir = 2; }
    else if (this.cursors.up.isDown) { dy = -1; dir = 3; }
    else if (this.cursors.down.isDown) { dy = 1; dir = 0; }
    else return;

    this.heroDir = dir;
    const newX = this.heroTileX + dx;
    const newY = this.heroTileY + dy;

    // Update hero frame for direction
    this.hero.setFrame(dir * 3);

    if (!this.canMove(newX, newY)) return;

    // Check for map transitions
    const transition = this.checkTransition(newX, newY);
    if (transition) {
      this.performTransition(transition);
      return;
    }

    this.isMoving = true;
    this.heroTileX = newX;
    this.heroTileY = newY;

    // Walking animation
    const walkFrame = dir * 3 + 1;
    this.hero.setFrame(walkFrame);

    this.tweens.add({
      targets: this.hero,
      x: newX * TILE_SIZE + TILE_SIZE / 2,
      y: newY * TILE_SIZE + TILE_SIZE / 2,
      duration: 150,
      ease: 'Sine.easeInOut',
      onComplete: () => {
        this.hero.setFrame(dir * 3);
        // Snap to exact pixel to prevent float drift
        this.hero.x = Math.round(this.hero.x);
        this.hero.y = Math.round(this.hero.y);
        this.isMoving = false;
        this.onStep();
        this.updatePosition();
      },
    });
  }

  private canMove(x: number, y: number): boolean {
    if (y < 0 || y >= this.mapData.length || x < 0 || x >= this.mapData[0].length) return false;
    const tile = this.mapData[y][x];
    const def = mapDefs[this.currentMapId];

    // Tile collision
    let passable = false;
    if (def.type === 'overworld') {
      passable = tile !== 2 && tile !== 3 && tile !== 4;
    } else if (def.type === 'town') {
      // Town: walls, roofs, water, buildings, shop parts, and save crystal are impassable
      passable = tile !== 1 && tile !== 2 && tile !== 4 && tile !== 6 && tile !== 8
        && tile !== 9 && tile !== 10 && tile !== 11 && tile !== 12;
    } else {
      // Dungeon: walls, lava, treasure chests, opened chests, and boss tiles are impassable
      passable = tile !== 1 && tile !== 5 && tile !== 4 && tile !== 7 && tile !== 8;
    }
    if (!passable) return false;

    // NPC collision
    for (const npc of def.npcs) {
      if (npc.x === x && npc.y === y) return false;
    }

    return true;
  }

  private checkTransition(x: number, y: number): { targetMap: string; toX: number; toY: number } | null {
    const def = mapDefs[this.currentMapId];
    for (const conn of def.connections) {
      if (conn.fromX === x && conn.fromY === y) {
        return { targetMap: conn.targetMap, toX: conn.toX, toY: conn.toY };
      }
    }

    // Special: town/dungeon tile on overworld
    if (def.type === 'overworld') {
      const tile = this.mapData[y]?.[x];
      if (tile === 6 || tile === 7) {
        // Find which connection this is
        for (const conn of def.connections) {
          if (Math.abs(conn.fromX - x) <= 1 && Math.abs(conn.fromY - y) <= 1) {
            return { targetMap: conn.targetMap, toX: conn.toX, toY: conn.toY };
          }
        }
      }
    }

    // Dungeon exit tiles
    if (this.currentMapId !== 'overworld') {
      const tile = this.mapData[y]?.[x];
      if (tile === 7 && mapDefs[this.currentMapId].type === 'town') { // town exit
        for (const conn of def.connections) {
          return { targetMap: conn.targetMap, toX: conn.toX, toY: conn.toY };
        }
      }
      if (tile === 6 && mapDefs[this.currentMapId].type === 'dungeon') { // dungeon exit
        for (const conn of def.connections) {
          return { targetMap: conn.targetMap, toX: conn.toX, toY: conn.toY };
        }
      }
    }

    return null;
  }

  private performTransition(target: { targetMap: string; toX: number; toY: number }): void {
    this.cameras.main.fadeOut(200, 0, 0, 0);
    this.cameras.main.once('camerafadeoutcomplete', () => {
      this.heroTileX = target.toX;
      this.heroTileY = target.toY;
      this.updatePosition();
      gameState.encounterManager.reset();
      this.loadMap(target.targetMap);
      this.cameras.main.fadeIn(200, 0, 0, 0);
    });
  }

  private onStep(): void {
    this.stepCount++;
    const def = mapDefs[this.currentMapId];

    // No encounters in towns
    if (def.type === 'town') return;

    // Determine zone
    let zone: string | null;
    if (this.currentMapId === 'overworld') {
      zone = gameState.getOverworldZone(this.heroTileX, this.heroTileY);
    } else {
      zone = def.encounterZone ?? null;
    }

    if (!zone) return;

    // Random encounter
    const monster = gameState.encounterManager.onStep(zone);
    if (monster) {
      this.startBattle(monster);
    }
  }

  private startBattle(monster: typeof monsters[string]): void {
    this.scene.launch('BattleScene', { monster });
    this.scene.pause();
  }

  private interact(): void {
    const def = mapDefs[this.currentMapId];

    // Calculate the tile the player is facing
    let facedX = this.heroTileX;
    let facedY = this.heroTileY;
    if (this.heroDir === 0) facedY += 1;      // down
    else if (this.heroDir === 1) facedX -= 1;  // left
    else if (this.heroDir === 2) facedX += 1;  // right
    else if (this.heroDir === 3) facedY -= 1;  // up

    // Check if facing the save point
    if (def.savePoint && def.savePoint.x === facedX && def.savePoint.y === facedY) {
      gameState.saveGame();
      this.showMessage(t('npc.savePoint'));
      gameState.player.fullHeal();
      this.updateHUD();
      return;
    }

    // Check if facing an NPC
    for (const npc of def.npcs) {
      if (npc.x === facedX && npc.y === facedY) {
        this.showMessage(t(npc.dialogueKey));
        return;
      }
    }

    // Check if facing a boss tile
    if (this.tryBossInteract(facedX, facedY)) return;

    // Check if facing a treasure chest
    if (this.tryOpenTreasure(facedX, facedY)) return;

    // Fallback: check save point within ±1 range (for when standing on it or beside it)
    if (def.savePoint) {
      if (Math.abs(def.savePoint.x - this.heroTileX) <= 1 && Math.abs(def.savePoint.y - this.heroTileY) <= 1) {
        gameState.saveGame();
        this.showMessage(t('npc.savePoint'));
        gameState.player.fullHeal();
        this.updateHUD();
        return;
      }
    }

    // Fallback: check NPCs within ±1 range
    for (const npc of def.npcs) {
      if (Math.abs(npc.x - this.heroTileX) <= 1 && Math.abs(npc.y - this.heroTileY) <= 1) {
        this.showMessage(t(npc.dialogueKey));
        return;
      }
    }

    // Fallback: check treasure chests in all adjacent tiles
    const dirs = [[0, -1], [0, 1], [-1, 0], [1, 0]];
    for (const [dx, dy] of dirs) {
      if (this.tryOpenTreasure(this.heroTileX + dx, this.heroTileY + dy)) return;
    }

    // Check shop (interact from floor in front of counter)
    if (def.shopId) {
      const sx = def.width - 4; // center of 3-wide shop
      const sy = 13; // floor in front of counter (counter is at y=12)
      if (Math.abs(sx - this.heroTileX) <= 1 && Math.abs(sy - this.heroTileY) <= 1) {
        this.scene.launch('ShopScene', { shopId: def.shopId });
        this.scene.pause();
        return;
      }
    }
  }

  private tryBossInteract(x: number, y: number): boolean {
    if (y < 0 || y >= this.mapData.length || x < 0 || x >= this.mapData[0].length) return false;
    if (this.mapData[y][x] !== 7) return false;

    const def = mapDefs[this.currentMapId];
    if (def.type !== 'dungeon' || !def.bossId) return false;
    if (gameState.player.state.storyFlags[`boss.${def.bossId}.defeated`]) return false;

    const boss = monsters[def.bossId];
    if (!boss) return false;

    this.pendingBossId = def.bossId;

    // Build pre-battle dialog from i18n keys
    const dialogMessages = [
      t(`dungeon.${this.currentMapId}.boss.dialog1`),
      t(`dungeon.${this.currentMapId}.boss.dialog2`),
      t(`dungeon.${this.currentMapId}.boss.dialog3`),
    ];

    this.showDialogSequence(dialogMessages, () => {
      this.startBattle(boss);
    });

    return true;
  }

  private tryOpenTreasure(x: number, y: number): boolean {
    if (y < 0 || y >= this.mapData.length || x < 0 || x >= this.mapData[0].length) return false;
    if (this.mapData[y][x] !== 4) return false;

    const chestKey = `chest.${this.currentMapId}.${x}.${y}`;
    if (gameState.player.state.storyFlags[chestKey]) {
      this.showMessage(t('treasure.empty'));
      return true;
    }

    // Mark as opened
    gameState.player.state.storyFlags[chestKey] = true;

    // Change tile to opened (cracked floor)
    this.mapData[y][x] = 8; // opened treasure tile
    this.renderMap();
    this.createHero();
    this.updateCamera();

    // Determine reward based on dungeon difficulty
    const goldReward = this.getTreasureReward();
    gameState.player.state.gold += goldReward.gold;

    let msg = t('treasure.found');
    if (goldReward.itemId) {
      gameState.player.addItem(goldReward.itemId, 1);
      msg += '\n' + t('treasure.item', { item: t(items[goldReward.itemId].nameKey) });
    }
    if (goldReward.gold > 0) {
      msg += '\n' + t('treasure.gold', { gold: goldReward.gold });
    }

    this.showMessage(msg);
    this.updateHUD();
    return true;
  }

  private getTreasureReward(): { gold: number; itemId?: string } {
    const mapId = this.currentMapId;
    const rand = Math.random();

    if (mapId === 'crystalCave') {
      if (rand < 0.5) return { gold: 15, itemId: 'herb' };
      if (rand < 0.8) return { gold: 25 };
      return { gold: 10, itemId: 'potion' };
    } else if (mapId === 'shadowTower') {
      if (rand < 0.4) return { gold: 40, itemId: 'potion' };
      if (rand < 0.7) return { gold: 60 };
      return { gold: 30, itemId: 'hiPotion' };
    } else {
      if (rand < 0.4) return { gold: 80, itemId: 'hiPotion' };
      if (rand < 0.7) return { gold: 100 };
      return { gold: 60, itemId: 'hiPotion' };
    }
  }

  private showMessage(text: string): void {
    this.showingMessage = true;

    this.messageBox = this.add.rectangle(
      GAME_WIDTH / 2, GAME_HEIGHT - 60,
      GAME_WIDTH - 32, 80,
      COLORS.MENU_BG, 0.9
    ).setDepth(100).setStrokeStyle(1, COLORS.MENU_BORDER).setScrollFactor(0);

    this.messageText = this.add.text(
      32, GAME_HEIGHT - 88,
      text,
      { fontSize: '12px', color: COLORS.TEXT_WHITE, fontFamily: 'monospace', wordWrap: { width: GAME_WIDTH - 64 } }
    ).setDepth(101).setScrollFactor(0);
  }

  private hideMessage(): void {
    this.showingMessage = false;
    this.messageBox?.destroy();
    this.messageText?.destroy();
  }

  private showDialogSequence(messages: string[], onComplete?: () => void): void {
    this.dialogQueue = messages.slice(1); // store remaining messages
    this.dialogCallback = onComplete;
    this.showMessage(messages[0]); // show first message
  }

  private advanceDialog(): void {
    this.hideMessage();
    if (this.dialogQueue.length > 0) {
      const next = this.dialogQueue.shift()!;
      this.showMessage(next);
    } else if (this.dialogCallback) {
      const cb = this.dialogCallback;
      this.dialogCallback = undefined;
      cb();
    }
  }

  private createHUD(): void {
    this.updateHUD();
  }

  private updateHUD(): void {
    this.hpText?.destroy();
    this.guideText?.destroy();

    const p = gameState.player;
    this.hpText = this.add.text(
      8, 8,
      `${t('menu.level')}${p.state.level}  ${t('menu.hp')} ${p.state.hp}/${p.totalMaxHp}`,
      { fontSize: '10px', color: COLORS.TEXT_WHITE, fontFamily: 'monospace', backgroundColor: '#1a1a3ecc', padding: { x: 4, y: 2 } }
    ).setDepth(100).setScrollFactor(0);

    // Floating key guide (bottom-right corner)
    const guide = `↑↓←→: ${t('guide.move')}  Z: ${t('guide.talk')}  ESC: ${t('guide.menu')}`;
    this.guideText = this.add.text(
      GAME_WIDTH - 8, GAME_HEIGHT - 8,
      guide,
      { fontSize: '8px', color: '#aaaaaa', fontFamily: 'monospace', backgroundColor: '#1a1a3e99', padding: { x: 4, y: 2 } }
    ).setOrigin(1, 1).setDepth(100).setScrollFactor(0).setAlpha(0.7);
  }

  private updateCamera(): void {
    const mapW = this.mapData[0]?.length ?? 16;
    const mapH = this.mapData.length;
    this.cameras.main.setBounds(0, 0, mapW * TILE_SIZE, mapH * TILE_SIZE);
    this.cameras.main.startFollow(this.hero, true, 0.09, 0.09);
    // Snap camera to hero immediately on map load (avoid initial lerp drift)
    this.cameras.main.centerOn(this.hero.x, this.hero.y);
    this.updateHUD();
  }

  private updatePosition(): void {
    gameState.player.state.position = {
      mapId: this.currentMapId,
      x: this.heroTileX,
      y: this.heroTileY,
    };
  }

  // Called when returning from battle
  wake(): void {
    this.updateHUD();
    if (!gameState.player.isAlive) {
      this.scene.start('GameOverScene');
      return;
    }

    // Boss defeat handling
    if (this.pendingBossId && gameState.player.state.storyFlags[`boss.${this.pendingBossId}.defeated`]) {
      const bossId = this.pendingBossId;
      this.pendingBossId = undefined;

      // Demon King goes to VictoryScene (handled by BattleScene), so no effect needed here
      if (bossId === 'demonKing') return;

      // Find boss tile position in map
      let bossTileX = -1, bossTileY = -1;
      for (let y = 0; y < this.mapData.length; y++) {
        for (let x = 0; x < this.mapData[y].length; x++) {
          if (this.mapData[y][x] === 7) {
            bossTileX = x;
            bossTileY = y;
            break;
          }
        }
        if (bossTileX >= 0) break;
      }

      if (bossTileX >= 0) {
        // Sparkle dissolve effect
        const cx = bossTileX * TILE_SIZE + TILE_SIZE / 2;
        const cy = bossTileY * TILE_SIZE + TILE_SIZE / 2;
        const sparkleColors = [0xffd700, 0xffffff, 0x87ceeb, 0xffec8b, 0xadd8e6, 0xf0e68c];

        for (let i = 0; i < 12; i++) {
          const color = sparkleColors[i % sparkleColors.length];
          const angle = (i / 12) * Math.PI * 2;
          const dist = 4 + Math.random() * 8;
          const sparkle = this.add.circle(
            cx + Math.cos(angle) * dist,
            cy + Math.sin(angle) * dist,
            2 + Math.random() * 3,
            color
          ).setDepth(50).setAlpha(1);

          this.tweens.add({
            targets: sparkle,
            y: sparkle.y - 20 - Math.random() * 20,
            x: sparkle.x + (Math.random() - 0.5) * 16,
            alpha: 0,
            scaleX: 0.2,
            scaleY: 0.2,
            duration: 1200 + Math.random() * 600,
            delay: i * 80,
            ease: 'Sine.easeOut',
            onComplete: () => sparkle.destroy(),
          });
        }

        // Remove boss tile after sparkle starts
        this.time.delayedCall(800, () => {
          this.mapData[bossTileY][bossTileX] = 0;
          this.renderMap();
          this.createHero();
          this.updateCamera();
        });

        // Show defeat dialog, then crystal/victory dialog
        this.time.delayedCall(1600, () => {
          const defeatMsg = t(`dungeon.${this.currentMapId}.boss.defeat`);
          const victoryMsg = t(`dungeon.${this.currentMapId}.victory`);
          this.showDialogSequence([defeatMsg, victoryMsg]);
        });
      }
    }
  }
}
