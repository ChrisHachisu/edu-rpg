import Phaser from 'phaser';
import { GAME_WIDTH, GAME_HEIGHT, TILE_SIZE, COLORS } from '../utils/constants';
import { t } from '../i18n/i18n';
import { gameState } from '../GameState';
import { generateOverworldMap, generateTownMap, generateDungeonMap } from '../utils/MapGenerator';
import { mapDefs } from '../data/maps';
import { monsters } from '../data/monsters';
import { items } from '../data/items';
import { audioManager, BgmTrack } from '../systems/audio/AudioManager';

interface FieldItemEntry {
  itemId: string;
  nameKey: string;
  quantity: number;
  healValue: number;
}

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
  private currentEncounterZone?: string;
  private currentFloor = 1;
  private floorText?: Phaser.GameObjects.Text;

  // Field item overlay
  private itemOverlayOpen = false;
  private itemOverlayItems: FieldItemEntry[] = [];
  private itemOverlayIndex = 0;
  private itemOverlayBox?: Phaser.GameObjects.Rectangle;
  private itemOverlayTitle?: Phaser.GameObjects.Text;
  private itemOverlayTexts: Phaser.GameObjects.Text[] = [];
  private itemOverlayCursor?: Phaser.GameObjects.Text;

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
    this.currentFloor = pos.floor ?? 1;

    this.loadMap(this.currentMapId);
    this.setupInput();
    this.createHUD();

    // Intro dialog — plays once when starting in greenhollow for the first time
    // Player faces north toward the elder NPC
    if (!gameState.player.state.storyFlags['intro.done'] && this.currentMapId === 'greenhollow') {
      this.heroDir = 3; // face up (toward elder)
      this.hero.setFrame(3 * 3); // frame 9 = facing up
      const introMessages = [
        t('intro.elder1'),
        t('intro.elder2'),
        t('intro.elder3'),
      ];
      this.showDialogSequence(introMessages, () => {
        gameState.player.state.storyFlags['intro.done'] = true;
      });
    }
  }

  private loadMap(mapId: string): void {
    this.currentMapId = mapId;
    const def = mapDefs[mapId];

    // Generate map data
    if (mapId === 'overworld') {
      this.mapData = generateOverworldMap(def.width, def.height);
    } else if (def.type === 'town') {
      this.mapData = generateTownMap(def.width, def.height, mapId.charCodeAt(0) * 137);
    } else if (def.type === 'dungeon') {
      const totalFloors = def.floors ?? 1;
      const isSingleFloorGate = def.connections.length > 1 && totalFloors === 1;
      const isMultiFloorGate = def.connections.length > 1 && totalFloors > 1;
      const isGateFinalFloor = isMultiFloorGate && this.currentFloor === totalFloors;
      this.mapData = generateDungeonMap(
        def.width, def.height,
        mapId.charCodeAt(0) * 251,
        this.currentFloor, totalFloors,
        isSingleFloorGate,
        isGateFinalFloor,
        def.castle ?? false,
      );
      // Mark already-opened chests and remove defeated boss tiles
      const isFinalFloor = this.currentFloor === totalFloors;
      for (let y = 0; y < this.mapData.length; y++) {
        for (let x = 0; x < this.mapData[y].length; x++) {
          if (this.mapData[y][x] === 4) {
            const chestKey = `chest.${mapId}.f${this.currentFloor}.${x}.${y}`;
            if (gameState.player.state.storyFlags[chestKey]) {
              this.mapData[y][x] = 8; // opened
            }
          }
          if (this.mapData[y][x] === 7 && def.bossId && isFinalFloor) {
            if (gameState.player.state.storyFlags[`boss.${def.bossId}.defeated`]) {
              const isGateDungeon = def.connections.length > 1;
              this.mapData[y][x] = isGateDungeon ? 0 : 10; // gate → floor (walk to stairs), normal → exit portal
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

    // Play appropriate BGM based on map type
    const bgm: BgmTrack = def.type === 'town' ? 'town'
      : def.type === 'dungeon' ? 'dungeon'
      : 'overworld';
    audioManager.playBgm(bgm);
  }

  private renderMap(): void {
    // Clear previous
    if (this.tileLayer) this.tileLayer.destroy();
    this.tileLayer = this.add.container(0, 0);
    this.npcSprites.forEach(s => s.destroy());
    this.npcSprites = [];

    const def = mapDefs[this.currentMapId];
    const prefix = def.type === 'overworld' ? 'ow'
      : def.type === 'town' ? 'town'
      : def.castle ? 'castle' : 'dng';

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

  private static readonly FEMALE_NPCS = new Set([
    'villager1', 'wisewoman', 'blacksmith',
    'archaeologist', 'veteran', 'priestess',
    'herbalist', 'refugee', 'prophetess',
  ]);

  private renderNPCs(def: typeof mapDefs[string]): void {
    for (const npc of def.npcs) {
      const spriteKey = WorldMapScene.FEMALE_NPCS.has(npc.id) ? 'npc-f' : 'npc';
      const sprite = this.add.sprite(
        npc.x * TILE_SIZE + TILE_SIZE / 2,
        npc.y * TILE_SIZE + TILE_SIZE / 2,
        spriteKey
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
      if (this.itemOverlayOpen) {
        this.hideFieldItemMenu();
        return;
      }
      if (!this.showingMessage) {
        this.scene.launch('MenuScene');
        this.scene.pause();
      }
    });

    // Interact key
    this.input.keyboard?.on('keydown-Z', () => {
      if (this.itemOverlayOpen) {
        this.useFieldItem();
        return;
      }
      if (this.showingMessage) {
        this.advanceDialog();
        return;
      }
      this.interact();
    });
    this.input.keyboard?.on('keydown-ENTER', () => {
      if (this.itemOverlayOpen) {
        this.useFieldItem();
        return;
      }
      if (this.showingMessage) {
        this.advanceDialog();
        return;
      }
      this.interact();
    });

    // Close overlay
    this.input.keyboard?.on('keydown-X', () => {
      if (this.itemOverlayOpen) {
        this.hideFieldItemMenu();
      }
    });

    // Navigate overlay
    this.input.keyboard?.on('keydown-UP', () => {
      if (this.itemOverlayOpen && this.itemOverlayItems.length > 0) {
        this.itemOverlayIndex = Math.max(0, this.itemOverlayIndex - 1);
        this.updateFieldItemSelection();
      }
    });
    this.input.keyboard?.on('keydown-DOWN', () => {
      if (this.itemOverlayOpen && this.itemOverlayItems.length > 0) {
        this.itemOverlayIndex = Math.min(this.itemOverlayItems.length - 1, this.itemOverlayIndex + 1);
        this.updateFieldItemSelection();
      }
    });

    // Field item shortcut
    this.input.keyboard?.on('keydown-I', () => {
      if (!this.showingMessage && !this.isMoving && !this.itemOverlayOpen) {
        this.showFieldItemMenu();
      }
    });
  }

  update(): void {
    if (this.isMoving || this.showingMessage || this.itemOverlayOpen) return;

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
      passable = tile !== 2 && tile !== 4;
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

  private checkTransition(x: number, y: number): { targetMap: string; toX: number; toY: number; toFloor?: number } | null {
    const def = mapDefs[this.currentMapId];
    // Skip connection-based exits on deeper dungeon floors — tile-based
    // floor navigation (__floor_up__/__floor_down__) handles these instead.
    // Only floor 1 should match connections (entrance/exit to overworld).
    const skipConns = def.type === 'dungeon' && this.currentFloor > 1;
    if (!skipConns) {
      for (const conn of def.connections) {
        if (conn.fromX === x && conn.fromY === y) {
          return { targetMap: conn.targetMap, toX: conn.toX, toY: conn.toY, toFloor: conn.toFloor };
        }
      }
    }

    // Special: town/dungeon tile on overworld
    if (def.type === 'overworld') {
      const tile = this.mapData[y]?.[x];
      if (tile === 6 || tile === 7 || tile === 8) {
        // Find which connection this is (town=6, cave=7, castle=8)
        for (const conn of def.connections) {
          if (Math.abs(conn.fromX - x) <= 1 && Math.abs(conn.fromY - y) <= 1) {
            return { targetMap: conn.targetMap, toX: conn.toX, toY: conn.toY, toFloor: conn.toFloor };
          }
        }
      }
    }

    // Town/dungeon exit tiles
    if (this.currentMapId !== 'overworld') {
      const tile = this.mapData[y]?.[x];
      if (tile === 7 && mapDefs[this.currentMapId].type === 'town') { // town exit
        for (const conn of def.connections) {
          return { targetMap: conn.targetMap, toX: conn.toX, toY: conn.toY };
        }
      }
      if (mapDefs[this.currentMapId].type === 'dungeon') {
        // Tile 6 = stairs up
        if (tile === 6) {
          if (this.currentFloor > 1) {
            // Check if bottom stairs on final floor of gate dungeon → exit to next act
            const isGate = def.connections.length > 1;
            const isFinal = this.currentFloor === (def.floors ?? 1);
            if (isGate && isFinal && y > def.height / 2) {
              // Exit to overworld via closest connection (matches connection[1])
              let best = def.connections[0];
              let bestDist = Infinity;
              for (const conn of def.connections) {
                const d = Math.abs(conn.fromX - x) + Math.abs(conn.fromY - y);
                if (d < bestDist) { bestDist = d; best = conn; }
              }
              return { targetMap: best.targetMap, toX: best.toX, toY: best.toY };
            }
            // Go up one floor
            return { targetMap: '__floor_up__', toX: 0, toY: 0 };
          } else {
            // Floor 1: exit to overworld — match closest connection by position
            let best = def.connections[0];
            let bestDist = Infinity;
            for (const conn of def.connections) {
              const d = Math.abs(conn.fromX - x) + Math.abs(conn.fromY - y);
              if (d < bestDist) { bestDist = d; best = conn; }
            }
            if (best) {
              return { targetMap: best.targetMap, toX: best.toX, toY: best.toY };
            }
          }
        }
        // Tile 9 = stairs down
        if (tile === 9) {
          return { targetMap: '__floor_down__', toX: 0, toY: 0 };
        }
        // Tile 10 = boss-exit portal — gate dungeons use last connection, others use first
        if (tile === 10) {
          const isGate = def.connections.length > 1;
          const conn = isGate ? def.connections[def.connections.length - 1] : def.connections[0];
          if (conn) {
            return { targetMap: conn.targetMap, toX: conn.toX, toY: conn.toY };
          }
        }
      }
    }

    return null;
  }

  private performTransition(target: { targetMap: string; toX: number; toY: number; toFloor?: number }): void {
    // Block Crystal Cave entry until Giant Toad defeated (crystal required)
    if (target.targetMap === 'crystalCave' && !gameState.player.state.storyFlags['boss.giantToad.defeated']) {
      this.isMoving = false;
      this.showMessage(t('dungeon.crystalCave.locked'));
      return;
    }

    // Block Celestial Vault entry until Sword Wraith defeated (Excalibur obtained)
    if (target.targetMap === 'celestialVault' && !gameState.player.state.storyFlags['boss.swordWraith.defeated']) {
      this.isMoving = false;
      this.showMessage(t('dungeon.celestialVault.locked'));
      return;
    }

    // Block Shadow Cave entry until Storm Harpy defeated (Shadow Crystal required)
    // Bypass if dragon already defeated (save compatibility)
    if (target.targetMap === 'shadowCave'
        && !gameState.player.state.storyFlags['boss.stormHarpy.defeated']
        && !gameState.player.state.storyFlags['boss.dragon.defeated']) {
      this.isMoving = false;
      this.showMessage(t('dungeon.shadowCave.locked'));
      return;
    }

    // Block Volcanic Forge entry until Sand Golem defeated (Desert Tomb seal)
    if (target.targetMap === 'volcanicForge'
        && !gameState.player.state.storyFlags['boss.sandGolem.defeated']
        && !gameState.player.state.storyFlags['boss.flameTitan.defeated']) {
      this.isMoving = false;
      this.showMessage(t('dungeon.volcanicForge.locked'));
      return;
    }

    // Block Magma Tunnels entry until Sand Golem defeated
    if (target.targetMap === 'magmaTunnels'
        && !gameState.player.state.storyFlags['boss.sandGolem.defeated']
        && !gameState.player.state.storyFlags['boss.lavaWyrm.defeated']) {
      this.isMoving = false;
      this.showMessage(t('dungeon.magmaTunnels.locked'));
      return;
    }

    // Block gate dungeon north entrance until boss defeated
    if (target.toFloor && target.toFloor > 1) {
      const targetDef = mapDefs[target.targetMap];
      if (targetDef?.bossId && !gameState.player.state.storyFlags[`boss.${targetDef.bossId}.defeated`]) {
        this.isMoving = false;
        this.showMessage(t('dungeon.gateBlocked'));
        return;
      }
    }

    // Block movement during transition to prevent re-entry
    this.isMoving = true;
    this.cameras.main.fadeOut(200, 0, 0, 0);
    this.cameras.main.once('camerafadeoutcomplete', () => {
      const def = mapDefs[this.currentMapId];

      if (target.targetMap === '__floor_down__') {
        // Go to next floor (deeper into dungeon)
        this.currentFloor++;
        const entranceX = Math.floor(def.width / 2);
        this.heroTileX = entranceX;
        if (def.castle) {
          // Castle: next floor entered from bottom (climbed up from below)
          this.heroTileY = def.height - 2;
        } else {
          // Standard: next floor entered from top (descended from above)
          this.heroTileY = 1;
        }
        this.updatePosition();
        this.loadMap(this.currentMapId);
      } else if (target.targetMap === '__floor_up__') {
        // Go to previous floor (toward entrance)
        this.currentFloor--;
        this.loadMap(this.currentMapId);
        // After regenerating the map, scan for stairs-down (tile 9) to spawn near
        if (def.castle) {
          // Castle: previous floor reached by going down, appear near top
          this.heroTileX = Math.floor(def.width / 2);
          this.heroTileY = 2;
        } else {
          // Standard: scan mapData for stairs-down tile and spawn adjacent
          let foundStairs = false;
          for (let sy = 0; sy < this.mapData.length && !foundStairs; sy++) {
            for (let sx = 0; sx < this.mapData[sy].length; sx++) {
              if (this.mapData[sy][sx] === 9) {
                this.heroTileX = sx;
                this.heroTileY = Math.max(1, sy - 1);
                foundStairs = true;
                break;
              }
            }
          }
          if (!foundStairs) {
            // Fallback: center bottom
            this.heroTileX = Math.floor(def.width / 2);
            this.heroTileY = def.height - 3;
          }
        }
        this.updatePosition();
      } else {
        // Normal map transition — use target floor (for gate re-entry) or reset
        this.currentFloor = target.toFloor ?? 1;
        this.heroTileX = target.toX;
        this.heroTileY = target.toY;
        this.updatePosition();
        gameState.encounterManager.reset();
        this.loadMap(target.targetMap);
      }
      this.isMoving = false;
      this.cameras.main.fadeIn(200, 0, 0, 0);
    });
  }

  private onStep(): void {
    this.stepCount++;
    const def = mapDefs[this.currentMapId];

    // No encounters in towns or dev mode
    if (def.type === 'town' || gameState.devMode) return;

    // Determine zone
    let zone: string | null;
    if (this.currentMapId === 'overworld') {
      zone = gameState.getOverworldZone(this.heroTileX, this.heroTileY);
    } else {
      zone = def.encounterZone ?? null;
    }

    if (!zone) return;

    this.currentEncounterZone = zone;

    // Random encounter
    const monster = gameState.encounterManager.onStep(zone);
    if (monster) {
      this.startBattle(monster);
    }
  }

  private startBattle(monster: typeof monsters[string]): void {
    this.scene.launch('BattleScene', { monster, zone: this.currentEncounterZone });
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
      audioManager.playSfx('save');
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
        audioManager.playSfx('save');
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
    this.currentEncounterZone = def.encounterZone;
    audioManager.playSfx('boss_intro');

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

    const def = mapDefs[this.currentMapId];
    const chestKey = def.type === 'dungeon'
      ? `chest.${this.currentMapId}.f${this.currentFloor}.${x}.${y}`
      : `chest.${this.currentMapId}.${x}.${y}`;
    if (gameState.player.state.storyFlags[chestKey]) {
      this.showMessage(t('treasure.empty'));
      return true;
    }

    // Mark as opened
    gameState.player.state.storyFlags[chestKey] = true;
    audioManager.playSfx('treasure_open');

    // Change tile to opened (cracked floor)
    this.mapData[y][x] = 8; // opened treasure tile
    // Update just the single tile sprite — no full re-render to avoid camera snap
    const tileIdx = y * this.mapData[0].length + x;
    const tileObj = this.tileLayer.getAt(tileIdx) as Phaser.GameObjects.Image;
    const prefix = mapDefs[this.currentMapId].castle ? 'castle' : 'dng';
    tileObj.setTexture(`${prefix}-8`);
    // Face the hero toward the chest
    const dx = x - this.heroTileX, dy = y - this.heroTileY;
    if (Math.abs(dx) > Math.abs(dy)) {
      this.heroDir = dx > 0 ? 2 : 1; // right or left
    } else {
      this.heroDir = dy > 0 ? 0 : 3; // down or up
    }
    this.hero.setFrame(this.heroDir * 3);

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

    switch (mapId) {
      case 'mistyGrotto':
        if (rand < 0.5) return { gold: 10, itemId: 'herb' };
        if (rand < 0.8) return { gold: 15 };
        return { gold: 5, itemId: 'potion' };
      case 'sunkenCellar':
        if (rand < 0.5) return { gold: 12, itemId: 'herb' };
        if (rand < 0.8) return { gold: 18 };
        return { gold: 8, itemId: 'potion' };
      case 'crystalCave':
        if (rand < 0.5) return { gold: 15, itemId: 'herb' };
        if (rand < 0.8) return { gold: 25 };
        return { gold: 10, itemId: 'potion' };
      case 'stormNest':
        if (rand < 0.4) return { gold: 35, itemId: 'potion' };
        if (rand < 0.7) return { gold: 50 };
        return { gold: 25, itemId: 'hiPotion' };
      case 'frozenLake':
        if (rand < 0.4) return { gold: 40, itemId: 'potion' };
        if (rand < 0.7) return { gold: 55 };
        return { gold: 30, itemId: 'hiPotion' };
      case 'shadowCave':
        if (rand < 0.4) return { gold: 40, itemId: 'potion' };
        if (rand < 0.7) return { gold: 60 };
        return { gold: 30, itemId: 'hiPotion' };
      case 'desertTomb':
        if (rand < 0.4) return { gold: 60, itemId: 'hiPotion' };
        if (rand < 0.7) return { gold: 80 };
        return { gold: 50, itemId: 'elixir' };
      case 'banditHideout':
        if (rand < 0.4) return { gold: 70, itemId: 'potion' };
        if (rand < 0.7) return { gold: 90 };
        return { gold: 50, itemId: 'hiPotion' };
      case 'magmaTunnels':
        if (rand < 0.4) return { gold: 90, itemId: 'hiPotion' };
        if (rand < 0.7) return { gold: 110 };
        return { gold: 70, itemId: 'elixir' };
      case 'volcanicForge':
        if (rand < 0.4) return { gold: 100, itemId: 'hiPotion' };
        if (rand < 0.7) return { gold: 120 };
        return { gold: 80, itemId: 'elixir' };
      case 'sealedSanctum':
        if (rand < 0.4) return { gold: 100, itemId: 'hiPotion' };
        if (rand < 0.7) return { gold: 130 };
        return { gold: 80, itemId: 'elixir' };
      case 'celestialVault':
        if (rand < 0.4) return { gold: 120, itemId: 'elixir' };
        if (rand < 0.7) return { gold: 150 };
        return { gold: 100, itemId: 'elixir' };
      default: // demonCastle
        if (rand < 0.4) return { gold: 120, itemId: 'elixir' };
        if (rand < 0.7) return { gold: 150 };
        return { gold: 100, itemId: 'elixir' };
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
    this.floorText?.destroy();

    const p = gameState.player;
    this.hpText = this.add.text(
      8, 8,
      `${t('menu.level')}${p.state.level}  ${t('menu.hp')} ${p.state.hp}/${p.totalMaxHp}`,
      { fontSize: '10px', color: COLORS.TEXT_WHITE, fontFamily: 'monospace', backgroundColor: '#1a1a3ecc', padding: { x: 4, y: 2 } }
    ).setDepth(100).setScrollFactor(0);

    // Dungeon/town name indicator
    const def = mapDefs[this.currentMapId];
    if (def.type === 'dungeon' || def.type === 'town') {
      const totalFloors = def.floors ?? 1;
      let label = t(def.nameKey);
      if (totalFloors > 1) {
        const isGate = def.connections.length > 1;
        const midpoint = Math.ceil(totalFloors / 2);
        const displayFloor = (isGate && this.currentFloor > midpoint)
          ? totalFloors - this.currentFloor + 1
          : this.currentFloor;
        // Castle: "1F, 2F, 3F..." (ascending); Standard: "B1F, B2F..." (basement)
        label += def.castle ? ` — ${displayFloor}F` : ` — B${displayFloor}F`;
      }
      this.floorText = this.add.text(
        8, 24,
        label,
        { fontSize: '10px', color: COLORS.TEXT_YELLOW, fontFamily: 'monospace', backgroundColor: '#1a1a3ecc', padding: { x: 4, y: 2 } }
      ).setDepth(100).setScrollFactor(0);
    }

    // Floating key guide (bottom-right corner)
    const guide = `↑↓←→: ${t('guide.move')}  Z: ${t('guide.talk')}  I: ${t('guide.item')}  ESC: ${t('guide.menu')}`;
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
      floor: this.currentFloor,
    };
  }

  // Called when returning from battle
  wake(): void {
    // Block movement immediately — prevents auto-step from held keys after battle
    this.isMoving = true;
    this.updateHUD();
    if (!gameState.player.isAlive) {
      this.scene.start('GameOverScene');
      return;
    }

    // Resume map BGM after battle
    const def = mapDefs[this.currentMapId];
    const bgm: BgmTrack = def.type === 'town' ? 'town'
      : def.type === 'dungeon' ? 'dungeon'
      : 'overworld';
    audioManager.playBgm(bgm);

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

        // Remove boss tile — gate dungeons open a walkable path, others get exit portal
        const isGateDungeon = def.connections.length > 1;
        this.time.delayedCall(800, () => {
          const newTile = isGateDungeon ? 6 : 10;
          this.mapData[bossTileY][bossTileX] = newTile;
          // Update single tile in-place (same pattern as treasure chest) — avoids camera snap
          const mapWidth = this.mapData[0].length;
          const tileIdx = bossTileY * mapWidth + bossTileX;
          const tileObj = this.tileLayer.getAt(tileIdx) as Phaser.GameObjects.Image;
          const prefix = def.castle ? 'castle' : 'dng';
          tileObj.setTexture(`${prefix}-${newTile}`);
        });

        // Auto-equip items on boss defeat + crystal obtain SFX
        audioManager.playSfx('crystal_obtain');
        if (bossId === 'swordWraith') {
          gameState.player.addItem('excalibur', 1);
          gameState.player.equip('excalibur');
        }
        if (bossId === 'celestialGuardian') {
          gameState.player.addItem('aegisOfDawn', 1);
          gameState.player.equip('aegisOfDawn');
        }
        if (bossId === 'stormHarpy') {
          gameState.player.addItem('shadowCrystal', 1);
        }
        // V2 dungeon reward items
        if (bossId === 'giantToad') {
          gameState.player.addItem('toadShield', 1);
        }
        if (bossId === 'giantCrab') {
          gameState.player.addItem('coralBlade', 1);
        }
        if (bossId === 'serpent') {
          gameState.player.addItem('crystalPendant', 1);
        }
        if (bossId === 'iceWyrm') {
          gameState.player.addItem('frostbrand', 1);
        }
        if (bossId === 'dragon') {
          gameState.player.addItem('dragonheartAmulet', 1);
        }
        if (bossId === 'sandGolem') {
          gameState.player.addItem('sandstormCloak', 1);
        }
        if (bossId === 'banditLord') {
          gameState.player.addItem('banditDagger', 1);
        }
        if (bossId === 'lavaWyrm') {
          gameState.player.addItem('magmaBlade', 1);
        }
        if (bossId === 'flameTitan') {
          gameState.player.addItem('moltenGreaves', 1);
        }

        // Show defeat dialog promptly (200ms — just enough for sparkle to register)
        // isMoving stays true until dialog sequence completes
        this.time.delayedCall(200, () => {
          const defeatMsg = t(`dungeon.${this.currentMapId}.boss.defeat`);
          const victoryMsg = t(`dungeon.${this.currentMapId}.victory`);
          const onDone = () => { this.isMoving = false; };

          // Legendary item obtainment dialog
          if (bossId === 'swordWraith') {
            this.showDialogSequence([defeatMsg, t('legendary.excalibur.obtained'), victoryMsg], onDone);
          } else if (bossId === 'celestialGuardian') {
            this.showDialogSequence([defeatMsg, t('legendary.aegis.obtained'), victoryMsg], onDone);
          } else if (bossId === 'stormHarpy') {
            this.showDialogSequence([defeatMsg, victoryMsg, t('item.shadowCrystal.obtained')], onDone);
          } else {
            this.showDialogSequence([defeatMsg, victoryMsg], onDone);
          }
        });
      }
      return; // Boss defeat handled — don't apply regular cooldown
    }

    // Regular battle — brief cooldown then unblock movement
    this.time.delayedCall(200, () => { this.isMoving = false; });
  }

  // ── Field Item Overlay ──────────────────────────────

  private showFieldItemMenu(): void {
    this.itemOverlayOpen = true;
    this.itemOverlayIndex = 0;
    this.itemOverlayTexts = [];

    // Gather consumable heal items from inventory
    this.itemOverlayItems = [];
    for (const slot of gameState.player.state.inventory) {
      const def = items[slot.itemId];
      if (def && def.type === 'consumable' && def.effect?.type === 'heal') {
        this.itemOverlayItems.push({
          itemId: slot.itemId,
          nameKey: def.nameKey,
          quantity: slot.quantity,
          healValue: def.effect.value,
        });
      }
    }

    // Draw overlay box
    const boxW = 200;
    const itemCount = Math.max(this.itemOverlayItems.length, 1);
    const boxH = 36 + itemCount * 24;
    const boxX = GAME_WIDTH / 2;
    const boxY = GAME_HEIGHT / 2;

    this.itemOverlayBox = this.add.rectangle(boxX, boxY, boxW, boxH, COLORS.MENU_BG, 0.95)
      .setStrokeStyle(2, COLORS.MENU_BORDER)
      .setDepth(200)
      .setScrollFactor(0);

    // Title
    this.itemOverlayTitle = this.add.text(boxX, boxY - boxH / 2 + 14, t('field.itemTitle'), {
      fontSize: '12px', color: COLORS.TEXT_YELLOW, fontFamily: 'monospace',
    }).setOrigin(0.5).setDepth(201).setScrollFactor(0);

    if (this.itemOverlayItems.length === 0) {
      const noItems = this.add.text(boxX, boxY, t('field.noItems'), {
        fontSize: '10px', color: COLORS.TEXT_GRAY, fontFamily: 'monospace',
      }).setOrigin(0.5).setDepth(201).setScrollFactor(0);
      this.itemOverlayTexts.push(noItems);
      return;
    }

    // Draw items
    const startY = boxY - boxH / 2 + 36;
    for (let i = 0; i < this.itemOverlayItems.length; i++) {
      const entry = this.itemOverlayItems[i];
      const label = `${t(entry.nameKey)} x${entry.quantity}  +${entry.healValue}HP`;
      const txt = this.add.text(boxX - boxW / 2 + 24, startY + i * 24, label, {
        fontSize: '10px',
        color: i === 0 ? COLORS.TEXT_YELLOW : COLORS.TEXT_WHITE,
        fontFamily: 'monospace',
      }).setDepth(201).setScrollFactor(0);
      this.itemOverlayTexts.push(txt);
    }

    // Cursor
    this.itemOverlayCursor = this.add.text(
      boxX - boxW / 2 + 12, startY, '>', {
        fontSize: '10px', color: COLORS.TEXT_YELLOW, fontFamily: 'monospace',
      }
    ).setDepth(201).setScrollFactor(0);
  }

  private hideFieldItemMenu(): void {
    this.itemOverlayOpen = false;
    this.itemOverlayBox?.destroy();
    this.itemOverlayTitle?.destroy();
    this.itemOverlayTexts.forEach(t => t.destroy());
    this.itemOverlayTexts = [];
    this.itemOverlayCursor?.destroy();
    this.itemOverlayItems = [];
  }

  private updateFieldItemSelection(): void {
    // Update text colors
    this.itemOverlayTexts.forEach((txt, i) => {
      txt.setColor(i === this.itemOverlayIndex ? COLORS.TEXT_YELLOW : COLORS.TEXT_WHITE);
    });
    // Move cursor
    if (this.itemOverlayCursor && this.itemOverlayTexts[this.itemOverlayIndex]) {
      this.itemOverlayCursor.y = this.itemOverlayTexts[this.itemOverlayIndex].y;
    }
  }

  private useFieldItem(): void {
    if (this.itemOverlayItems.length === 0) {
      this.hideFieldItemMenu();
      return;
    }

    const entry = this.itemOverlayItems[this.itemOverlayIndex];
    if (!entry) return;

    const p = gameState.player;

    // Check if HP is already full
    if (p.state.hp >= p.totalMaxHp) {
      this.hideFieldItemMenu();
      this.showMessage(t('field.hpFull'));
      return;
    }

    // Use the item
    audioManager.playSfx('heal');
    const healed = Math.min(entry.healValue, p.totalMaxHp - p.state.hp);
    p.state.hp = Math.min(p.state.hp + entry.healValue, p.totalMaxHp);

    // Remove from inventory
    const invSlot = p.state.inventory.find(s => s.itemId === entry.itemId);
    if (invSlot) {
      invSlot.quantity--;
      if (invSlot.quantity <= 0) {
        p.state.inventory = p.state.inventory.filter(s => s.quantity > 0);
      }
    }

    this.hideFieldItemMenu();
    this.updateHUD();
    this.showMessage(t('field.itemUsed', { item: t(entry.nameKey), value: healed }));
  }
}
