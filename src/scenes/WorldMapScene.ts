import Phaser from 'phaser';
import { GAME_WIDTH, GAME_HEIGHT, TILE_SIZE, ZOOM, COLORS, FONT_FAMILY, UI_OFFSET_X, UI_OFFSET_Y, UI_SCALE } from '../utils/constants';
import { t } from '../i18n/i18n';
import { gameState } from '../GameState';
import { generateOverworldMap, generateTownMap, generateDungeonMap, generatePortalLandMap } from '../utils/MapGenerator';
import type { DungeonMapResult } from '../utils/MapGenerator';
import { mapDefs } from '../data/maps';
import { monsters } from '../data/monsters';
import { items } from '../data/items';
import { audioManager, BgmTrack } from '../systems/audio/AudioManager';

const S = UI_SCALE;

// ── Compass waypoint chain for K/G1 players ──
// Each entry: { mapId, overworldX, overworldY, type, doneFlag }
// doneFlag: story flag that marks this waypoint as completed
// For towns: compass.visited.<mapId>  (set on entry)
// For dungeons: boss.<bossId>.defeated (set on boss defeat)
const COMPASS_CHAIN: { mapId: string; ox: number; oy: number; type: 'town' | 'dungeon'; doneFlag: string }[] = [
  // Act 1
  { mapId: 'sunkenCellar',      ox: 45,  oy: 350, type: 'dungeon', doneFlag: 'boss.giantCrab.defeated' },
  { mapId: 'millbrook',         ox: 100, oy: 320, type: 'town',    doneFlag: 'compass.visited.millbrook' },
  { mapId: 'portSapphire',      ox: 130, oy: 290, type: 'town',    doneFlag: 'compass.visited.portSapphire' },
  { mapId: 'mistyGrotto',       ox: 120, oy: 260, type: 'dungeon', doneFlag: 'boss.giantToad.defeated' },
  { mapId: 'crystalCave',       ox: 148, oy: 295, type: 'dungeon', doneFlag: 'boss.serpent.defeated' },
  // Act 2
  { mapId: 'ironkeep',          ox: 200, oy: 320, type: 'town',    doneFlag: 'compass.visited.ironkeep' },
  { mapId: 'frozenLake',        ox: 200, oy: 265, type: 'dungeon', doneFlag: 'boss.iceWyrm.defeated' },
  { mapId: 'stormNest',         ox: 280, oy: 295, type: 'dungeon', doneFlag: 'boss.stormHarpy.defeated' },
  { mapId: 'shadowCave',        ox: 260, oy: 234, type: 'dungeon', doneFlag: 'boss.dragon.defeated' },
  // Act 3/4
  { mapId: 'ruinsCamp',         ox: 270, oy: 120, type: 'town',    doneFlag: 'compass.visited.ruinsCamp' },
  { mapId: 'embersRest',        ox: 195, oy: 80,  type: 'town',    doneFlag: 'compass.visited.embersRest' },
  { mapId: 'oasisHaven',        ox: 220, oy: 150, type: 'town',    doneFlag: 'compass.visited.oasisHaven' },
  { mapId: 'banditHideout',     ox: 298, oy: 133, type: 'dungeon', doneFlag: 'boss.banditLord.defeated' },
  { mapId: 'desertTomb',        ox: 250, oy: 140, type: 'dungeon', doneFlag: 'boss.sandGolem.defeated' },
  { mapId: 'magmaTunnels',      ox: 242, oy: 93,  type: 'dungeon', doneFlag: 'boss.lavaWyrm.defeated' },
  { mapId: 'volcanicForge',     ox: 172, oy: 110, type: 'dungeon', doneFlag: 'boss.flameTitan.defeated' },
  // Act 5
  { mapId: 'lastBastion',       ox: 100, oy: 150, type: 'town',    doneFlag: 'compass.visited.lastBastion' },
  { mapId: 'havensEdge',        ox: 70,  oy: 100, type: 'town',    doneFlag: 'compass.visited.havensEdge' },
  { mapId: 'stormreachIsles',   ox: 40,  oy: 50,  type: 'dungeon', doneFlag: 'boss.stormSentinel.defeated' },
  { mapId: 'frostfallPeaks',    ox: 130, oy: 40,  type: 'dungeon', doneFlag: 'boss.frostMonarch.defeated' },
  { mapId: 'sunkenTempleIsle',  ox: 50,  oy: 130, type: 'dungeon', doneFlag: 'boss.swordWraith.defeated' },
  { mapId: 'twilightRealm',     ox: 120, oy: 140, type: 'dungeon', doneFlag: 'boss.celestialGuardian.defeated' },
  { mapId: 'demonCastle',       ox: 85,  oy: 30,  type: 'dungeon', doneFlag: 'boss.demonKing.defeated' },
];

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
  /** Actual map dimensions (may differ from def for grade-scaled dungeons) */
  private effectiveWidth = 0;
  private effectiveHeight = 0;

  // Compass (K/G1 only)
  private compassContainer?: Phaser.GameObjects.Container;
  private compassArrow?: Phaser.GameObjects.Graphics;
  private compassEnabled = false;

  // Field item overlay
  private itemOverlayOpen = false;
  private itemOverlayItems: FieldItemEntry[] = [];
  private itemOverlayIndex = 0;
  private itemOverlayBox?: Phaser.GameObjects.Rectangle;
  private itemOverlayTitle?: Phaser.GameObjects.Text;
  private itemOverlayTexts: Phaser.GameObjects.Text[] = [];
  private itemOverlayCursor?: Phaser.GameObjects.Text;

  // Healer confirmation overlay
  private healerOverlayOpen = false;
  private healerOverlayBox?: Phaser.GameObjects.Rectangle;
  private healerOverlayTexts: Phaser.GameObjects.Text[] = [];
  private healerOverlayIndex = 0;
  private healerOverlayCursor?: Phaser.GameObjects.Text;
  private healerOverlayPrice = 0;

  // Bandit Lord map sprite (shown on boss tile in banditHideout final floor)
  private banditLordMapSprite?: Phaser.GameObjects.Image;

  // ── Wind Tower mechanic ──
  private windTowerEnabled = false;
  private windTowerPhase: 'calm' | 'gust' = 'calm';
  private windTowerTimer = 0;
  private windTowerDir: { dx: number; dy: number } = { dx: 0, dy: -1 };
  private windTowerPushing = false;
  private static readonly WIND_CALM_MS = 4000;
  private static readonly WIND_GUST_MS = 2000;

  // ── Maze Hunter mechanic ──
  private mazeHunterEnabled = false;
  private mazeHunterBossTileX = 0;
  private mazeHunterBossTileY = 0;
  private mazeHunterChaseMode = false;
  private mazeHunterMoveTimer = 0;
  private mazeHunterStepCount = 0;
  private mazeHunterActive = false;
  private mazeHunterDefeated = false;
  private mazeHunterEntranceX = 0;
  private mazeHunterEntranceY = 0;
  private mazeHunterIsMoving = false;
  private _pendingMazeHunterBattle = false;
  private mazeHunterBossSprite?: Phaser.GameObjects.Container;
  private goldenChestPos?: { x: number; y: number };

  // ── Shadow Portal mechanic ──
  private shadowPortalEnabled = false;
  private portalPairs: Array<{ a: { x: number; y: number }; b: { x: number; y: number } }> = [];
  private portalCooldown = false;

  constructor() {
    super('WorldMapScene');
  }

  create(): void {
    this.cameras.main.setZoom(ZOOM);
    this.cameras.main.setScroll(-GAME_WIDTH * (ZOOM - 1) / 2, -GAME_HEIGHT * (ZOOM - 1) / 2);
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

    // Refresh HUD when returning from battle/menu — reset held keys to prevent queued movement
    this.events.on('resume', () => {
      this.updateHUD();
      // Reset cursor key states so held keys don't cause immediate movement
      this.cursors.left.reset();
      this.cursors.right.reset();
      this.cursors.up.reset();
      this.cursors.down.reset();
      // Also block movement briefly in case reset doesn't catch edge cases
      this.isMoving = true;
      this.time.delayedCall(300, () => {
        this.isMoving = false;
      });
    });
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
    // Clear any lingering messages from previous map
    this.hideMessage();
    this.showingMessage = false;
    this.dialogQueue = [];

    this.currentMapId = mapId;
    const def = mapDefs[mapId];

    // Generate map data
    if (mapId === 'overworld') {
      this.mapData = generateOverworldMap(def.width, def.height);
    } else if (def.type === 'portal-overworld') {
      const portalSeed = Array.from(mapId).reduce((h, c) => (h * 31 + c.charCodeAt(0)) | 0, 0);
      this.mapData = generatePortalLandMap(def.width, def.height, Math.abs(portalSeed));
    } else if (def.type === 'town') {
      this.mapData = generateTownMap(def.width, def.height, mapId.charCodeAt(0) * 137);
    } else if (def.type === 'dungeon') {
      const totalFloors = def.floors ?? 1;
      const isSingleFloorGate = def.connections.length > 1 && totalFloors === 1;
      const isMultiFloorGate = def.connections.length > 1 && totalFloors > 1;
      const isGateFinalFloor = isMultiFloorGate && this.currentFloor === totalFloors;
      const scaledW = WorldMapScene.gradeScaledSize(def.width);
      const scaledH = WorldMapScene.gradeScaledSize(def.height);
      const dungeonResult: DungeonMapResult = generateDungeonMap(
        scaledW, scaledH,
        mapId.charCodeAt(0) * 251,
        this.currentFloor, totalFloors,
        isSingleFloorGate,
        isGateFinalFloor,
        def.castle ?? false,
        def.mechanic,
      );
      this.mapData = dungeonResult.map;

      // Apply mechanic state from generation result
      if (def.mechanic === 'wind-tower' && dungeonResult.windCorridorDir) {
        this.windTowerDir = dungeonResult.windCorridorDir;
        this.windTowerEnabled = true;
        this.windTowerPhase = 'calm';
        this.windTowerTimer = this.time.now;
        this.windTowerPushing = false;
      } else {
        this.windTowerEnabled = false;
      }
      if (def.mechanic === 'maze-hunter') {
        this.goldenChestPos = dungeonResult.goldenChestPos;
        this.mazeHunterEnabled = true;
        this.mazeHunterActive = false;
        this.mazeHunterStepCount = 0;
        this.mazeHunterChaseMode = false;
        this.mazeHunterMoveTimer = this.time.now;
        this.mazeHunterDefeated = gameState.player.state.storyFlags['boss.swordWraith.defeated'] ?? false;
        // Find boss tile (7) position
        for (let r = 0; r < this.mapData.length; r++) {
          for (let c = 0; c < this.mapData[r].length; c++) {
            if (this.mapData[r][c] === 7) { this.mazeHunterBossTileX = c; this.mazeHunterBossTileY = r; }
            if (this.mapData[r][c] === 6) { this.mazeHunterEntranceX = c; this.mazeHunterEntranceY = r; }
          }
        }
      } else {
        this.mazeHunterEnabled = false;
        this.goldenChestPos = undefined;
      }
      if (def.mechanic === 'shadow-portal' && dungeonResult.portalPairs) {
        this.shadowPortalEnabled = true;
        this.portalPairs = dungeonResult.portalPairs;
        this.portalCooldown = false;
      } else {
        this.shadowPortalEnabled = false;
        this.portalPairs = [];
      }

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
              const isGate = def.connections.length > 1;
              this.mapData[y][x] = isGate ? 12 : 10; // gate=stairs(12), non-gate=portal(10)
            }
          }
        }
      }
      // Boss warp portal: place on floor 1 near entrance if boss encountered but not defeated
      if (this.currentFloor === 1 && def.bossId && totalFloors > 1
          && gameState.player.state.storyFlags[`boss.${def.bossId}.encountered`]
          && !gameState.player.state.storyFlags[`boss.${def.bossId}.defeated`]) {
        const mapW = this.mapData[0]?.length ?? scaledW;
        const mapH = this.mapData.length;
        const entrX = Math.floor(mapW / 2);
        if (def.castle) {
          // Castle: entrance at bottom, portal beside entrance
          const portalY = mapH - 2;
          const portalX = entrX + 2;
          if (portalX < mapW - 1 && this.mapData[portalY]?.[portalX] === 0) {
            this.mapData[portalY][portalX] = 11;
          }
        } else {
          // Standard dungeon: entrance at top, portal beside entrance
          const portalY = 1;
          const portalX = entrX + 2;
          if (portalX < mapW - 1 && this.mapData[portalY]?.[portalX] === 0) {
            this.mapData[portalY][portalX] = 11;
          }
        }
      }
      // Reset pending boss state on map load
      this.pendingBossId = undefined;
    }

    // Track effective map dimensions (may differ from def for grade-scaled dungeons)
    this.effectiveWidth = this.mapData[0]?.length ?? def.width;
    this.effectiveHeight = this.mapData.length ?? def.height;

    this.renderMap();
    this.renderNPCs(def);
    this.createHero();
    this.updateCamera();

    // Bandit Lord map sprite — visible on boss tile in final floor before boss defeated
    this.banditLordMapSprite?.destroy();
    this.banditLordMapSprite = undefined;
    if (this.currentMapId === 'banditHideout' && def.bossId === 'banditLord') {
      const isFinalFloor = this.currentFloor === (def.floors ?? 1);
      const bossDefeated = gameState.player.state.storyFlags['boss.banditLord.defeated'];
      if (isFinalFloor && !bossDefeated) {
        // Find boss tile (7) in the map
        for (let by = 0; by < this.mapData.length; by++) {
          for (let bx = 0; bx < (this.mapData[by]?.length ?? 0); bx++) {
            if (this.mapData[by][bx] === 7) {
              this.banditLordMapSprite = this.add.image(
                bx * TILE_SIZE + TILE_SIZE / 2,
                by * TILE_SIZE + TILE_SIZE / 2,
                'monster-banditLord'
              ).setOrigin(0.5).setDepth(45).setScale(TILE_SIZE / 128 * 1.4);
            }
          }
        }
      }
    }

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
    const prefix = (def.type === 'overworld' || def.type === 'portal-overworld') ? 'ow'
      : def.type === 'town' ? 'town'
      : def.castle ? 'castle' : 'dng';

    // Bandit hideout overworld coordinates — render as plain grass (hidden/incognito)
    const BANDIT_HIDEOUT_OX = 298, BANDIT_HIDEOUT_OY = 133;

    for (let y = 0; y < this.mapData.length; y++) {
      for (let x = 0; x < this.mapData[y].length; x++) {
        let tileIndex = this.mapData[y][x];
        // Bandit hideout dungeon marker is hidden on the overworld — render as grass
        if (this.currentMapId === 'overworld' && tileIndex === 7
            && x === BANDIT_HIDEOUT_OX && y === BANDIT_HIDEOUT_OY) {
          tileIndex = 0;
        }
        const px = x * TILE_SIZE;
        const py = y * TILE_SIZE;
        const tileKey = `${prefix}-${tileIndex}`;
        const tile = this.add.image(px, py, tileKey).setOrigin(0).setScale(1);
        this.tileLayer.add(tile);
      }
    }
  }

  private static readonly FEMALE_NPCS = new Set([
    'villager1', 'wisewoman', 'blacksmith',
    'archaeologist', 'veteran', 'priestess',
    'herbalist', 'refugee', 'prophetess',
    'healer',
  ]);

  private static readonly HEALER_PRICES: Record<string, number> = {
    greenhollow: 0, millbrook: 5, portSapphire: 8,
    ironkeep: 12, frostwatch: 14, hauntedVillage: 16,
    oasisHaven: 18, ruinsCamp: 18,
    embersRest: 25, lastBastion: 35, havensEdge: 35,
    stormreachVillage: 40, frostfallVillage: 40,
    sunkenTempleVillage: 40, twilightVillage: 40,
  };


  /** Scale dungeon floor dimensions by grade: K/1/2 = 60%, 3/4 = 80%, 5/6 = 100% */
  private static gradeScaledSize(size: number): number {
    const grade = gameState.player.state.quizDifficulty;
    const mult = ['k', '1', '2'].includes(grade) ? 0.6 : ['3', '4'].includes(grade) ? 0.8 : 1.0;
    // Ensure minimum 16 and even number for room generation
    return Math.max(16, Math.round(size * mult / 2) * 2);
  }

  private renderNPCs(def: typeof mapDefs[string]): void {
    for (const npc of def.npcs) {
      if (npc.id === 'healer') continue; // healer rendered separately inside clinic
      const spriteKey = WorldMapScene.FEMALE_NPCS.has(npc.id) ? 'npc-f' : 'npc';
      const sprite = this.add.sprite(
        npc.x * TILE_SIZE + TILE_SIZE / 2,
        npc.y * TILE_SIZE + TILE_SIZE / 2,
        spriteKey
      ).setOrigin(0.5).setScale(1);
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
      ).setOrigin(0.5).setScale(1).setDepth(5);
      this.npcSprites.push(sprite);
    }

    // Healer (inside clinic behind counter, same pattern as shopkeeper)
    if (def.type === 'town') {
      const hx = def.width - 13; // center tile of 3-wide clinic starting at width-14
      const hy = 12; // inside clinic behind counter
      const sprite = this.add.sprite(
        hx * TILE_SIZE + TILE_SIZE / 2,
        hy * TILE_SIZE + TILE_SIZE / 2,
        'npc-healer'
      ).setOrigin(0.5).setScale(1).setDepth(5);
      this.npcSprites.push(sprite);
      // Counter is now built into the npc-healer sprite — no separate overlay needed
    }

    // Save point
    if (def.savePoint) {
      this.add.sprite(
        def.savePoint.x * TILE_SIZE + TILE_SIZE / 2,
        def.savePoint.y * TILE_SIZE + TILE_SIZE / 2,
        'save-point'
      ).setOrigin(0.5).setScale(1);
    }
  }

  private createHero(): void {
    if (this.hero) this.hero.destroy();
    this.hero = this.add.sprite(
      this.heroTileX * TILE_SIZE + TILE_SIZE / 2,
      this.heroTileY * TILE_SIZE + TILE_SIZE / 2,
      'hero-walk', 0
    ).setOrigin(0.5).setDepth(10).setScale(1);
  }

  private setupInput(): void {
    this.cursors = this.input.keyboard!.createCursorKeys();

    // Menu key
    this.input.keyboard?.on('keydown-ESC', () => {
      if (this.healerOverlayOpen) {
        this.hideHealerOverlay();
        return;
      }
      if (this.itemOverlayOpen) {
        this.hideFieldItemMenu();
        return;
      }
      if (!this.showingMessage && !this.isMoving) {
        this.scene.launch('MenuScene');
        this.scene.pause();
      }
    });

    // Interact key
    this.input.keyboard?.on('keydown-Z', () => {
      if (this.healerOverlayOpen) {
        this.confirmHealerOption();
        return;
      }
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
      if (this.healerOverlayOpen) {
        this.confirmHealerOption();
        return;
      }
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
      if (this.healerOverlayOpen) {
        this.hideHealerOverlay();
        return;
      }
      if (this.itemOverlayOpen) {
        this.hideFieldItemMenu();
      }
    });

    // Navigate overlay
    this.input.keyboard?.on('keydown-UP', () => {
      if (this.healerOverlayOpen) {
        this.healerOverlayIndex = Math.max(0, this.healerOverlayIndex - 1);
        this.updateHealerSelection();
        return;
      }
      if (this.itemOverlayOpen && this.itemOverlayItems.length > 0) {
        this.itemOverlayIndex = Math.max(0, this.itemOverlayIndex - 1);
        this.updateFieldItemSelection();
      }
    });
    this.input.keyboard?.on('keydown-DOWN', () => {
      if (this.healerOverlayOpen) {
        this.healerOverlayIndex = Math.min(1, this.healerOverlayIndex + 1);
        this.updateHealerSelection();
        return;
      }
      if (this.itemOverlayOpen && this.itemOverlayItems.length > 0) {
        this.itemOverlayIndex = Math.min(this.itemOverlayItems.length - 1, this.itemOverlayIndex + 1);
        this.updateFieldItemSelection();
      }
    });

    // Field item shortcut
    this.input.keyboard?.on('keydown-I', () => {
      if (!this.showingMessage && !this.isMoving && !this.itemOverlayOpen && !this.healerOverlayOpen) {
        this.showFieldItemMenu();
      }
    });
  }

  update(): void {
    this.updateCompass();
    this.updateWindTower();
    this.updateMazeHunter();
    if (this.isMoving || this.showingMessage || this.itemOverlayOpen || this.healerOverlayOpen) return;

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
    if (def.type === 'overworld' || def.type === 'portal-overworld') {
      passable = tile !== 2 && tile !== 4;
    } else if (def.type === 'town') {
      // Town: walls, roofs, water, buildings, shop parts, and save crystal are impassable
      passable = tile !== 1 && tile !== 2 && tile !== 4 && tile !== 6 && tile !== 8
        && tile !== 9 && tile !== 10 && tile !== 11 && tile !== 12
        && tile !== 13 && tile !== 14 && tile !== 15;
    } else {
      // Dungeon: walls, lava, treasure chests, and boss tiles are impassable (opened chests ARE walkable)
      // Tile 17 (fake wall) is passable — reveals the hidden room behind it
      passable = tile !== 1 && tile !== 5 && tile !== 4 && tile !== 7;
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

    // Special: town/dungeon/portal tile on overworld
    if (def.type === 'overworld') {
      const tile = this.mapData[y]?.[x];
      if (tile === 6 || tile === 7 || tile === 8 || tile === 9) {
        // Find which connection this is (town=6, cave=7, castle=8, portal=9)
        for (const conn of def.connections) {
          if (Math.abs(conn.fromX - x) <= 1 && Math.abs(conn.fromY - y) <= 1) {
            return { targetMap: conn.targetMap, toX: conn.toX, toY: conn.toY, toFloor: conn.toFloor };
          }
        }
      }
    }

    // Portal-overworld: tile 6=village, tile 7=dungeon, tile 9=exit portal
    if (def.type === 'portal-overworld') {
      const tile = this.mapData[y]?.[x];
      if (tile === 6 || tile === 7) {
        // Find the village or dungeon map that connects back to this portal land
        const targets = Object.values(mapDefs).filter(m =>
          m.connections.some(c => c.targetMap === this.currentMapId)
          && ((tile === 6 && m.type === 'town') || (tile === 7 && m.type === 'dungeon'))
        );
        if (targets.length > 0) {
          const target = targets[0];
          const conn2 = target.connections.find(c => c.targetMap === this.currentMapId);
          return { targetMap: target.id, toX: conn2?.fromX ?? 8, toY: conn2?.fromY ?? 14 };
        }
      }
      if (tile === 9) {
        // Exit back to overworld
        const conn = def.connections[0];
        if (conn) {
          return { targetMap: conn.targetMap, toX: conn.toX, toY: conn.toY };
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
            // Go up one floor (toward entrance)
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
        // Tile 10 = boss-exit portal, Tile 12 = boss-exit stairs — gate dungeons use last connection, others use first
        if (tile === 10 || tile === 12) {
          const isGate = def.connections.length > 1;
          const conn = isGate ? def.connections[def.connections.length - 1] : def.connections[0];
          if (conn) {
            return { targetMap: conn.targetMap, toX: conn.toX, toY: conn.toY };
          }
        }
        // Tile 11 = boss warp portal — teleport to boss floor
        if (tile === 11) {
          const totalFloors = def.floors ?? 1;
          return { targetMap: '__boss_warp__', toX: 0, toY: 0, toFloor: totalFloors };
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

    // Hard gate: Demon Castle requires all 4 legendary relics
    if (target.targetMap === 'demonCastle') {
      const eq = gameState.player.state.equipment;
      const inv = gameState.player.state.inventory;
      const needed: Record<string, string> = {
        weapon: 'excalibur', armor: 'aegisOfDawn', shield: 'galeShield', helmet: 'crownOfWisdom',
      };
      const hasItem = (id: string) => eq[Object.keys(needed).find(s => needed[s] === id)! as keyof typeof eq] === id || inv.some(s => s.itemId === id);
      const missing = Object.values(needed)
        .filter(id => !hasItem(id))
        .map(id => t(items[id].nameKey));
      if (missing.length > 0) {
        this.isMoving = false;
        this.showMessage(t('demonCastle.sealed', { missing: missing.join(', ') }));
        return;
      }
    }

    // Block gate dungeon north entrance until boss defeated (skip for boss warp portals)
    if (target.targetMap !== '__boss_warp__' && target.toFloor && target.toFloor > 1) {
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

      if (target.targetMap === '__boss_warp__') {
        // Boss warp portal — teleport directly to boss floor
        this.currentFloor = target.toFloor ?? (def.floors ?? 1);
        gameState.encounterManager.reset();
        this.loadMap(this.currentMapId);
        // Scan for boss tile (7) and spawn nearby
        let foundBoss = false;
        for (let sy = 0; sy < this.mapData.length && !foundBoss; sy++) {
          for (let sx = 0; sx < this.mapData[sy].length; sx++) {
            if (this.mapData[sy][sx] === 7) {
              this.heroTileX = sx;
              this.heroTileY = Math.min(this.mapData.length - 2, sy + 2);
              foundBoss = true;
              break;
            }
          }
        }
        if (!foundBoss) {
          // Fallback: entrance position
          this.heroTileX = Math.floor(this.effectiveWidth / 2);
          this.heroTileY = def.castle ? this.effectiveHeight - 2 : 1;
        }
        this.updatePosition();
        this.createHero();
        this.updateCamera();
      } else if (target.targetMap === '__floor_down__') {
        // Go to next floor (deeper into dungeon)
        const maxFloor = def.floors ?? 1;
        if (this.currentFloor >= maxFloor) return;
        this.currentFloor++;
        gameState.encounterManager.reset();
        this.loadMap(this.currentMapId);
        // Scan for entrance tile (stairs-up, tile 6) and spawn adjacent
        const entrance = this.findDungeonEntrance(def.castle ? this.effectiveHeight : 0);
        if (entrance) {
          this.heroTileX = entrance.x;
          this.heroTileY = entrance.y;
        } else {
          this.heroTileX = Math.floor(this.effectiveWidth / 2);
          this.heroTileY = def.castle ? this.effectiveHeight - 2 : 1;
        }
        this.updatePosition();
        this.createHero();
        this.updateCamera();
      } else if (target.targetMap === '__floor_up__') {
        // Go to previous floor (toward entrance)
        if (this.currentFloor <= 1) return; // Safety: don't go below floor 1
        this.currentFloor--;
        gameState.encounterManager.reset();
        this.loadMap(this.currentMapId);
        // After regenerating the map, scan for stairs-down (tile 9) to spawn near
        if (def.castle) {
          // Castle: previous floor reached by going down, appear near stairs-down (tile 9)
          let foundCastleStairs = false;
          for (let sy = 0; sy < this.mapData.length && !foundCastleStairs; sy++) {
            for (let sx = 0; sx < this.mapData[sy].length; sx++) {
              if (this.mapData[sy][sx] === 9) {
                this.heroTileX = sx;
                this.heroTileY = Math.min(this.effectiveHeight - 2, sy + 1);
                foundCastleStairs = true;
                break;
              }
            }
          }
          if (!foundCastleStairs) {
            this.heroTileX = Math.floor(this.effectiveWidth / 2);
            this.heroTileY = 2;
          }
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
            this.heroTileX = Math.floor(this.effectiveWidth / 2);
            this.heroTileY = this.effectiveHeight - 3;
          }
        }
        this.updatePosition();
        // Re-create hero at corrected position (loadMap created it at old position)
        this.createHero();
        this.updateCamera();
      } else {
        // Normal map transition — clamp target floor to grade cap (for gate re-entry)
        const targetDef = mapDefs[target.targetMap];

        // Mark town as visited for compass system
        if (targetDef?.type === 'town') {
          this.markTownVisited(target.targetMap);
        }

        const maxFloor = targetDef ? (targetDef.floors ?? 1) : 999;
        this.currentFloor = Math.min(target.toFloor ?? 1, maxFloor);
        this.heroTileX = target.toX;
        this.heroTileY = target.toY;
        this.updatePosition();
        gameState.encounterManager.reset();
        this.loadMap(target.targetMap);

        // For dungeons: connection toX/toY are based on full-size dimensions.
        // Grade scaling shrinks the map, moving the entrance tile.
        // Scan for the actual entrance and snap the player to it.
        if (targetDef?.type === 'dungeon') {
          const spawn = this.findDungeonEntrance(target.toY);
          if (spawn) {
            this.heroTileX = spawn.x;
            this.heroTileY = spawn.y;
            this.updatePosition();
            this.createHero();
            this.updateCamera();
          }
        }
      }
      this.isMoving = false;
      this.cameras.main.fadeIn(200, 0, 0, 0);
    });
  }

  /** Scan dungeon map for the entrance tile closest to the requested entry side.
   *  Looks for stairs-up (6), boss-exit portal (10), or boss-exit stairs (12). */
  private findDungeonEntrance(requestedY: number): { x: number; y: number } | null {
    const h = this.mapData.length;
    const w = this.mapData[0]?.length ?? 0;
    // Determine if entering from top or bottom based on requested Y
    const enterFromBottom = requestedY > h / 2;

    // Collect all entrance/exit tiles: 6=stairs-up, 10=boss-exit-portal, 12=boss-exit-stairs
    const stairs: { x: number; y: number }[] = [];
    for (let y = 0; y < h; y++) {
      for (let x = 0; x < w; x++) {
        const t = this.mapData[y][x];
        if (t === 6 || t === 10 || t === 12) stairs.push({ x, y });
      }
    }
    if (stairs.length === 0) return null;

    // Pick the one closest to the expected side
    let best = stairs[0];
    if (enterFromBottom) {
      // Bottom entrance: pick stairs with highest y
      for (const s of stairs) { if (s.y > best.y) best = s; }
      return { x: best.x, y: Math.max(0, best.y - 1) };
    } else {
      // Top entrance: pick stairs with lowest y
      for (const s of stairs) { if (s.y < best.y) best = s; }
      return { x: best.x, y: Math.min(h - 1, best.y + 1) };
    }
  }

  private showWhiteFlash(alpha: number, duration: number): void {
    const flash = this.add.rectangle(
      UI_OFFSET_X + GAME_WIDTH / 2, UI_OFFSET_Y + GAME_HEIGHT / 2,
      GAME_WIDTH * 2, GAME_HEIGHT * 2, 0xffffff
    ).setDepth(200).setScrollFactor(0).setAlpha(alpha);
    this.tweens.add({
      targets: flash, alpha: 0, duration,
      onComplete: () => flash.destroy(),
    });
  }

  private onStep(): void {
    this.stepCount++;
    const def = mapDefs[this.currentMapId];

    // No encounters in towns or dev mode
    if (def.type === 'town' || gameState.devMode) return;

    // ── Trap tiles ──
    const currentTile = this.mapData[this.heroTileY]?.[this.heroTileX];

    // Tile 17: Fake wall (hidden room entrance) — reveal floor when stepped on
    if (currentTile === 17) {
      this.mapData[this.heroTileY][this.heroTileX] = 0;
      const mapWidth = this.mapData[0]?.length ?? 1;
      const tileIdx = this.heroTileY * mapWidth + this.heroTileX;
      const tileObj = this.tileLayer.getAt(tileIdx) as Phaser.GameObjects.Image | null;
      if (tileObj) tileObj.setTexture('dng-0');
    }

    // Tile 30: Spike trap — 20% max HP damage
    if (currentTile === 30) {
      const damage = Math.max(30, Math.floor(gameState.player.totalMaxHp * 0.20));
      gameState.player.state.hp = Math.max(1, gameState.player.state.hp - damage);
      this.mapData[this.heroTileY][this.heroTileX] = 0; // remove after triggering
      this.renderMap();
      this.updateHUD();
      this.showMessage(t('trap.spike', { damage }));
      if (!gameState.player.isAlive) {
        this.scene.start('GameOverScene');
      }
      return;
    }

    // Tile 29: Shadow portal — teleport to paired portal
    if (currentTile === 29 && this.shadowPortalEnabled && !this.portalCooldown) {
      const key = `${this.heroTileX},${this.heroTileY}`;
      for (const pair of this.portalPairs) {
        const aKey = `${pair.a.x},${pair.a.y}`, bKey = `${pair.b.x},${pair.b.y}`;
        let dest: { x: number; y: number } | null = null;
        if (key === aKey) dest = pair.b;
        else if (key === bKey) dest = pair.a;
        if (dest) {
          this.portalCooldown = true;
          this.isMoving = true;
          this.cameras.main.fadeOut(300, 0, 0, 0);
          this.cameras.main.once('camerafadeoutcomplete', () => {
            this.heroTileX = dest!.x;
            this.heroTileY = dest!.y;
            this.hero.x = this.heroTileX * TILE_SIZE + TILE_SIZE / 2;
            this.hero.y = this.heroTileY * TILE_SIZE + TILE_SIZE / 2;
            this.updateCamera();
            this.cameras.main.fadeIn(300, 0, 0, 0);
            this.showMessage(t('dungeon.twilightDungeon.portal'));
            this.isMoving = false;
            this.time.delayedCall(500, () => { this.portalCooldown = false; });
          });
          break;
        }
      }
    }
    if (currentTile !== 29) this.portalCooldown = false;

    // Tile 31: Tripwire — white flash, poison damage, remove tile(s) across row
    if (currentTile === 31 && this.currentMapId === 'banditHideout') {
      const damage = Math.max(20, Math.floor(gameState.player.totalMaxHp * 0.15));
      gameState.player.state.hp = Math.max(1, gameState.player.state.hp - damage);
      // Remove all tile 31 tiles on this row (wall-to-wall)
      const row = this.mapData[this.heroTileY];
      if (row) {
        for (let x = 0; x < row.length; x++) {
          if (row[x] === 31) row[x] = 0;
        }
      }
      this.renderMap();
      this.updateHUD();
      this.showWhiteFlash(0.7, 600);
      this.showMessage(t('dungeon.banditHideout.tripwire'));
      if (!gameState.player.isAlive) {
        this.scene.start('GameOverScene');
      }
      return;
    }

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

  private startBattle(monster: typeof monsters[string], isBoss = false): void {
    this.isMoving = true; // Block input during transition
    // Clear any lingering messages before battle transition
    this.hideMessage();
    this.showingMessage = false;
    this.dialogQueue = [];
    this.dialogCallback = undefined;

    if (isBoss) {
      // Dramatic boss transition: screen shake + red flashes + fade to black
      this.cameras.main.shake(300, 0.02);
      const flash1 = this.add.rectangle(
        UI_OFFSET_X + GAME_WIDTH / 2, UI_OFFSET_Y + GAME_HEIGHT / 2,
        GAME_WIDTH * 2, GAME_HEIGHT * 2, 0xffaa00
      ).setDepth(200).setScrollFactor(0).setAlpha(0);

      // Three red flashes
      this.tweens.add({
        targets: flash1, alpha: 0.7, duration: 80, yoyo: true,
        onComplete: () => {
          this.tweens.add({
            targets: flash1, alpha: 0.8, duration: 80, yoyo: true,
            onComplete: () => {
              this.tweens.add({
                targets: flash1, alpha: 1, duration: 80, yoyo: true,
                onComplete: () => {
                  // Fade to black
                  this.cameras.main.fadeOut(400, 0, 0, 0);
                  this.cameras.main.once('camerafadeoutcomplete', () => {
                    flash1.destroy();
                    this.scene.launch('BattleScene', { monster, zone: this.currentEncounterZone });
                    this.scene.pause();
                    this.isMoving = false;
                  });
                },
              });
            },
          });
        },
      });
    } else {
      // Regular encounter: white flash + quick fade
      const flash = this.add.rectangle(
        UI_OFFSET_X + GAME_WIDTH / 2, UI_OFFSET_Y + GAME_HEIGHT / 2,
        GAME_WIDTH * 2, GAME_HEIGHT * 2, 0xffffff
      ).setDepth(200).setScrollFactor(0).setAlpha(0);

      this.tweens.add({
        targets: flash, alpha: 1, duration: 100, yoyo: true,
        onComplete: () => {
          this.cameras.main.fadeOut(200, 0, 0, 0);
          this.cameras.main.once('camerafadeoutcomplete', () => {
            flash.destroy();
            this.scene.launch('BattleScene', { monster, zone: this.currentEncounterZone });
            this.scene.pause();
            this.isMoving = false;
          });
        },
      });
    }
  }

  private interact(): void {
    if (this.isMoving || this.showingMessage) return;
    const def = mapDefs[this.currentMapId];

    // Calculate the tile the player is facing
    let facedX = this.heroTileX;
    let facedY = this.heroTileY;
    if (this.heroDir === 0) facedY += 1;      // down
    else if (this.heroDir === 1) facedX -= 1;  // left
    else if (this.heroDir === 2) facedX += 1;  // right
    else if (this.heroDir === 3) facedY -= 1;  // up

    // Check if facing/adjacent to a tripwire tile (tile 31) — Z to disarm
    if (this.currentMapId === 'banditHideout') {
      const facedTile = this.mapData[facedY]?.[facedX];
      if (facedTile === 31) {
        // Disarm: remove all tile 31 in that row, brief white flash, no damage
        const row = this.mapData[facedY];
        if (row) {
          for (let x = 0; x < row.length; x++) {
            if (row[x] === 31) row[x] = 0;
          }
        }
        this.renderMap();
        this.showWhiteFlash(0.3, 300);
        this.showMessage(t('dungeon.banditHideout.tripwireCut'));
        return;
      }
    }

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
        if (npc.id === 'healer') {
          this.handleHealer();
          return;
        }
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
        if (npc.id === 'healer') {
          this.handleHealer();
          return;
        }
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

  private handleHealer(): void {
    const p = gameState.player;

    // Already full HP
    if (p.state.hp >= p.totalMaxHp) {
      this.showMessage(t('npc.healer.fullHp'));
      return;
    }

    const price = WorldMapScene.HEALER_PRICES[this.currentMapId] ?? 100;

    // Free healing (Greenhollow)
    if (price === 0) {
      p.fullHeal();
      audioManager.playSfx('save');
      this.showMessage(t('npc.healer.healFree'));
      this.updateHUD();
      return;
    }

    // Not enough gold
    if (p.state.gold < price) {
      this.showMessage(t('npc.healer.noGold', { price }));
      return;
    }

    // Show healer confirmation overlay (shop-style popup)
    this.showHealerOverlay(price);
  }

  private showHealerOverlay(price: number): void {
    this.healerOverlayOpen = true;
    this.healerOverlayIndex = 0;
    this.healerOverlayPrice = price;
    this.healerOverlayTexts = [];

    const p = gameState.player;
    const hpMissing = p.totalMaxHp - p.state.hp;

    const boxW = Math.round(220 * S);
    const boxH = Math.round(110 * S);
    const boxX = UI_OFFSET_X + GAME_WIDTH / 2;
    const boxY = UI_OFFSET_Y + GAME_HEIGHT / 2;

    this.healerOverlayBox = this.add.rectangle(boxX, boxY, boxW, boxH, COLORS.MENU_BG, 0.95)
      .setStrokeStyle(2, COLORS.MENU_BORDER)
      .setDepth(200)
      .setScrollFactor(0);

    // Greeting/question
    const greeting = this.add.text(boxX, boxY - boxH / 2 + Math.round(16 * S), t('npc.healer.popupTitle'), {
      fontSize: `${Math.round(12 * S)}px`, color: COLORS.TEXT_YELLOW, fontFamily: FONT_FAMILY,
    }).setOrigin(0.5).setDepth(201).setScrollFactor(0);
    this.healerOverlayTexts.push(greeting);

    // HP info
    const hpInfo = this.add.text(boxX, boxY - boxH / 2 + Math.round(36 * S), `HP ${p.state.hp}/${p.totalMaxHp}  (+${hpMissing})`, {
      fontSize: `${Math.round(10 * S)}px`, color: '#88cc88', fontFamily: FONT_FAMILY,
    }).setOrigin(0.5).setDepth(201).setScrollFactor(0);
    this.healerOverlayTexts.push(hpInfo);

    // Option 1: Heal (cost)
    const healLabel = `${t('npc.healer.healOption')}  (${price} G)`;
    const opt1 = this.add.text(boxX - boxW / 2 + Math.round(36 * S), boxY + Math.round(4 * S), healLabel, {
      fontSize: `${Math.round(11 * S)}px`, color: COLORS.TEXT_YELLOW, fontFamily: FONT_FAMILY,
    }).setDepth(201).setScrollFactor(0);
    this.healerOverlayTexts.push(opt1);

    // Option 2: Leave
    const opt2 = this.add.text(boxX - boxW / 2 + Math.round(36 * S), boxY + Math.round(28 * S), t('npc.healer.leaveOption'), {
      fontSize: `${Math.round(11 * S)}px`, color: COLORS.TEXT_WHITE, fontFamily: FONT_FAMILY,
    }).setDepth(201).setScrollFactor(0);
    this.healerOverlayTexts.push(opt2);

    // Cursor
    this.healerOverlayCursor = this.add.text(boxX - boxW / 2 + Math.round(22 * S), boxY + Math.round(4 * S), '>', {
      fontSize: `${Math.round(11 * S)}px`, color: COLORS.TEXT_YELLOW, fontFamily: FONT_FAMILY,
    }).setDepth(201).setScrollFactor(0);
  }

  private hideHealerOverlay(): void {
    this.healerOverlayOpen = false;
    this.healerOverlayBox?.destroy();
    this.healerOverlayTexts.forEach(t => t.destroy());
    this.healerOverlayTexts = [];
    this.healerOverlayCursor?.destroy();
  }

  private updateHealerSelection(): void {
    // Option texts are at indices 2 and 3 in healerOverlayTexts
    const opt1 = this.healerOverlayTexts[2];
    const opt2 = this.healerOverlayTexts[3];
    if (opt1) opt1.setColor(this.healerOverlayIndex === 0 ? COLORS.TEXT_YELLOW : COLORS.TEXT_WHITE);
    if (opt2) opt2.setColor(this.healerOverlayIndex === 1 ? COLORS.TEXT_YELLOW : COLORS.TEXT_WHITE);
    if (this.healerOverlayCursor) {
      const target = this.healerOverlayIndex === 0 ? opt1 : opt2;
      if (target) this.healerOverlayCursor.y = target.y;
    }
  }

  private confirmHealerOption(): void {
    if (this.healerOverlayIndex === 0) {
      // Heal
      const p = gameState.player;
      p.state.gold -= this.healerOverlayPrice;
      p.fullHeal();
      audioManager.playSfx('save');
      this.hideHealerOverlay();
      this.showMessage(t('npc.healer.healed', { price: this.healerOverlayPrice }));
      this.updateHUD();
    } else {
      // Leave
      this.hideHealerOverlay();
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

    // Mark boss as encountered and auto-save so portal is available on retry
    const encFlag = `boss.${def.bossId}.encountered`;
    if (!gameState.player.state.storyFlags[encFlag]) {
      gameState.player.state.storyFlags[encFlag] = true;
      gameState.autoSave();
    }

    // Build pre-battle dialog from i18n keys
    const dialogMessages = [
      t(`dungeon.${this.currentMapId}.boss.dialog1`),
      t(`dungeon.${this.currentMapId}.boss.dialog2`),
      t(`dungeon.${this.currentMapId}.boss.dialog3`),
    ];

    this.showDialogSequence(dialogMessages, () => {
      this.startBattle(boss, true);
    });

    return true;
  }

  private tryOpenTreasure(x: number, y: number): boolean {
    if (y < 0 || y >= this.mapData.length || x < 0 || x >= this.mapData[0].length) return false;
    if (this.mapData[y][x] !== 4) return false;
    // Tile 4 is treasure in dungeons, but mountain on overworld — only allow in dungeons
    const mapType = mapDefs[this.currentMapId].type;
    if (mapType === 'overworld' || mapType === 'portal-overworld') return false;

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
      default: // demonCastle + portal dungeons
        if (rand < 0.4) return { gold: 120, itemId: 'elixir' };
        if (rand < 0.7) return { gold: 150 };
        return { gold: 100, itemId: 'elixir' };
    }
  }

  private showMessage(text: string): void {
    this.showingMessage = true;

    this.messageBox = this.add.rectangle(
      UI_OFFSET_X + GAME_WIDTH / 2, UI_OFFSET_Y + GAME_HEIGHT - Math.round(60 * S),
      GAME_WIDTH - Math.round(32 * S), Math.round(80 * S),
      COLORS.MENU_BG, 0.9
    ).setDepth(100).setStrokeStyle(1, COLORS.MENU_BORDER).setScrollFactor(0);

    this.messageText = this.add.text(
      UI_OFFSET_X + Math.round(32 * S), UI_OFFSET_Y + GAME_HEIGHT - Math.round(88 * S),
      text,
      { fontSize: `${Math.round(12 * S)}px`, color: COLORS.TEXT_WHITE, fontFamily: FONT_FAMILY, wordWrap: { width: GAME_WIDTH - Math.round(64 * S) } }
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
    this.compassContainer?.destroy();
    this.compassContainer = undefined;
    this.compassArrow = undefined;

    const p = gameState.player;
    this.hpText = this.add.text(
      UI_OFFSET_X + Math.round(8 * S), UI_OFFSET_Y + Math.round(8 * S),
      `${t('menu.level')}${p.state.level}  ${t('menu.hp')} ${p.state.hp}/${p.totalMaxHp}`,
      { fontSize: `${Math.round(10 * S)}px`, color: COLORS.TEXT_WHITE, fontFamily: FONT_FAMILY, backgroundColor: '#1a1a3ecc', padding: { x: Math.round(4 * S), y: Math.round(2 * S) } }
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
        UI_OFFSET_X + Math.round(8 * S), UI_OFFSET_Y + Math.round(24 * S),
        label,
        { fontSize: `${Math.round(10 * S)}px`, color: COLORS.TEXT_YELLOW, fontFamily: FONT_FAMILY, backgroundColor: '#1a1a3ecc', padding: { x: Math.round(4 * S), y: Math.round(2 * S) } }
      ).setDepth(100).setScrollFactor(0);
    }

    // Floating key guide (bottom-right corner)
    const guide = `↑↓←→: ${t('guide.move')}  Z: ${t('guide.talk')}  I: ${t('guide.item')}  ESC: ${t('guide.menu')}`;
    this.guideText = this.add.text(
      UI_OFFSET_X + GAME_WIDTH - Math.round(8 * S), UI_OFFSET_Y + GAME_HEIGHT - Math.round(8 * S),
      guide,
      { fontSize: `${Math.round(8 * S)}px`, color: '#aaaaaa', fontFamily: FONT_FAMILY, backgroundColor: '#1a1a3e99', padding: { x: Math.round(4 * S), y: Math.round(2 * S) } }
    ).setOrigin(1, 1).setDepth(100).setScrollFactor(0).setAlpha(0.7);

    // Compass (K/G1 overworld only)
    this.createCompass();
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
    // Reset cursor keys to cancel any held direction from before battle
    if (this.cursors) {
      this.cursors.left.reset();
      this.cursors.right.reset();
      this.cursors.up.reset();
      this.cursors.down.reset();
    }
    // Clear any lingering messages from before the battle
    this.hideMessage();
    this.showingMessage = false;
    this.dialogQueue = [];
    this.dialogCallback = undefined;

    // Check boss defeat BEFORE fade-in so we know whether to block movement
    const bossJustDefeated = this.pendingBossId &&
      gameState.player.state.storyFlags[`boss.${this.pendingBossId}.defeated`];

    // Fade back in from battle transition
    this.cameras.main.fadeIn(300, 0, 0, 0);
    this.cameras.main.once('camerafadeincomplete', () => {
      // Only unblock movement if NOT a boss defeat (boss defeat dialog controls isMoving)
      if (gameState.player.isAlive && !bossJustDefeated) {
        this.isMoving = false;
      }
    });
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
    if (bossJustDefeated) {
      const bossId = this.pendingBossId!;
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

        // Remove boss tile — gate dungeons get stairs (12), others get portal (10)
        const isGateDungeon = def.connections.length > 1;
        this.time.delayedCall(800, () => {
          const newTile = isGateDungeon ? 12 : 10;
          this.mapData[bossTileY][bossTileX] = newTile;
          // Update single tile in-place (same pattern as treasure chest) — avoids camera snap
          const mapWidth = this.mapData[0].length;
          const tileIdx = bossTileY * mapWidth + bossTileX;
          const tileObj = this.tileLayer.getAt(tileIdx) as Phaser.GameObjects.Image;
          const prefix = def.castle ? 'castle' : 'dng';
          tileObj.setTexture(`${prefix}-${newTile}`);
          // Remove bandit lord map sprite if present
          this.banditLordMapSprite?.destroy();
          this.banditLordMapSprite = undefined;
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
        if (bossId === 'stormSentinel') {
          gameState.player.addItem('galeShield', 1);
          gameState.player.equip('galeShield');
        }
        if (bossId === 'frostMonarch') {
          gameState.player.addItem('crownOfWisdom', 1);
          gameState.player.equip('crownOfWisdom');
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
          gameState.player.addItem('shadowCrystal', 1);
        }
        if (bossId === 'iceWyrm') {
          gameState.player.addItem('frostbrand', 1);
        }
        if (bossId === 'dragon') {
          gameState.player.addItem('dragonheartAmulet', 1);
          gameState.player.addItem('shadowCrystal', 1);
        }
        if (bossId === 'sandGolem') {
          gameState.player.addItem('sandstormCloak', 1);
          gameState.player.addItem('shadowCrystal', 1);
        }
        if (bossId === 'banditLord') {
          gameState.player.addItem('banditDagger', 1);
        }
        if (bossId === 'lavaWyrm') {
          gameState.player.addItem('magmaBlade', 1);
        }
        if (bossId === 'flameTitan') {
          gameState.player.addItem('moltenGreaves', 1);
          gameState.player.addItem('shadowCrystal', 1);
        }

        // Show defeat dialog promptly (200ms — just enough for sparkle to register)
        // isMoving stays true until dialog sequence completes
        this.time.delayedCall(200, () => {
          const defeatMsg = t(`dungeon.${this.currentMapId}.boss.defeat`);
          const victoryMsg = t(`dungeon.${this.currentMapId}.victory`);
          const onDone = () => { this.isMoving = false; this.updateHUD(); };

          // Legendary item obtainment dialog
          if (bossId === 'swordWraith') {
            this.showDialogSequence([defeatMsg, t('legendary.excalibur.obtained'), victoryMsg], onDone);
          } else if (bossId === 'celestialGuardian') {
            this.showDialogSequence([defeatMsg, t('legendary.aegis.obtained'), victoryMsg], onDone);
          } else if (bossId === 'stormSentinel') {
            this.showDialogSequence([defeatMsg, t('legendary.galeShield.obtained'), victoryMsg], onDone);
          } else if (bossId === 'frostMonarch') {
            this.showDialogSequence([defeatMsg, t('legendary.crownOfWisdom.obtained'), victoryMsg], onDone);
          } else if (bossId === 'stormHarpy' || bossId === 'serpent' || bossId === 'dragon' || bossId === 'sandGolem' || bossId === 'flameTitan') {
            this.showDialogSequence([defeatMsg, victoryMsg], onDone);
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
    const boxW = Math.round(200 * S);
    const itemCount = Math.max(this.itemOverlayItems.length, 1);
    const boxH = Math.round(36 * S) + itemCount * Math.round(24 * S);
    const boxX = UI_OFFSET_X + GAME_WIDTH / 2;
    const boxY = UI_OFFSET_Y + GAME_HEIGHT / 2;

    this.itemOverlayBox = this.add.rectangle(boxX, boxY, boxW, boxH, COLORS.MENU_BG, 0.95)
      .setStrokeStyle(2, COLORS.MENU_BORDER)
      .setDepth(200)
      .setScrollFactor(0);

    // Title
    this.itemOverlayTitle = this.add.text(boxX, boxY - boxH / 2 + Math.round(14 * S), t('field.itemTitle'), {
      fontSize: `${Math.round(12 * S)}px`, color: COLORS.TEXT_YELLOW, fontFamily: FONT_FAMILY,
    }).setOrigin(0.5).setDepth(201).setScrollFactor(0);

    if (this.itemOverlayItems.length === 0) {
      const noItems = this.add.text(boxX, boxY, t('field.noItems'), {
        fontSize: `${Math.round(10 * S)}px`, color: COLORS.TEXT_GRAY, fontFamily: FONT_FAMILY,
      }).setOrigin(0.5).setDepth(201).setScrollFactor(0);
      this.itemOverlayTexts.push(noItems);
      return;
    }

    // Draw items
    const startY = boxY - boxH / 2 + Math.round(36 * S);
    for (let i = 0; i < this.itemOverlayItems.length; i++) {
      const entry = this.itemOverlayItems[i];
      const label = `${t(entry.nameKey)} x${entry.quantity}  +${entry.healValue}HP`;
      const txt = this.add.text(boxX - boxW / 2 + Math.round(24 * S), startY + i * Math.round(24 * S), label, {
        fontSize: `${Math.round(10 * S)}px`,
        color: i === 0 ? COLORS.TEXT_YELLOW : COLORS.TEXT_WHITE,
        fontFamily: FONT_FAMILY,
      }).setDepth(201).setScrollFactor(0);
      this.itemOverlayTexts.push(txt);
    }

    // Cursor
    this.itemOverlayCursor = this.add.text(
      boxX - boxW / 2 + Math.round(12 * S), startY, '>', {
        fontSize: `${Math.round(10 * S)}px`, color: COLORS.TEXT_YELLOW, fontFamily: FONT_FAMILY,
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

    // Close menu and show message immediately (same pattern as HP-full which works)
    this.hideFieldItemMenu();
    this.showMessage(t('field.itemUsed', { item: t(entry.nameKey), value: healed }));

    // Green heal flash
    const flash = this.add.rectangle(
      UI_OFFSET_X + GAME_WIDTH / 2, UI_OFFSET_Y + GAME_HEIGHT / 2,
      GAME_WIDTH * 2, GAME_HEIGHT * 2, 0x22cc44
    ).setDepth(99).setScrollFactor(0).setAlpha(0);
    this.tweens.add({
      targets: flash, alpha: 0.3, duration: 120, yoyo: true,
      onComplete: () => flash.destroy(),
    });

    // Update HUD after message is shown (delayed to avoid interference)
    this.time.delayedCall(50, () => this.updateHUD());
  }

  // ── Compass system ──
  // K/G1: compass with directional arrow pointing to next waypoint
  // G2+: compass with N/S/E/W labels only (no arrow)

  private isCompassArrowEligible(): boolean {
    const grade = gameState.player.state.quizDifficulty;
    return grade === 'k' || grade === '1';
  }

  private getCompassTarget(): { ox: number; oy: number } | null {
    const flags = gameState.player.state.storyFlags;
    // Find the index of the LATEST completed waypoint in the chain.
    // This ensures that if a player skips a town but beats a later boss,
    // the compass advances past the skipped waypoint.
    let latestDoneIdx = -1;
    for (let i = 0; i < COMPASS_CHAIN.length; i++) {
      if (flags[COMPASS_CHAIN[i].doneFlag]) {
        latestDoneIdx = i;
      }
    }
    // Return the first incomplete waypoint AFTER the latest completed one
    for (let i = latestDoneIdx + 1; i < COMPASS_CHAIN.length; i++) {
      if (!flags[COMPASS_CHAIN[i].doneFlag]) {
        return { ox: COMPASS_CHAIN[i].ox, oy: COMPASS_CHAIN[i].oy };
      }
    }
    return null; // All waypoints completed
  }

  private createCompass(): void {
    // Only show on overworld
    const def = mapDefs[this.currentMapId];
    if (def.type !== 'overworld') {
      this.compassEnabled = false;
      return;
    }
    this.compassEnabled = true;

    // Destroy previous
    this.compassContainer?.destroy();

    const cx = UI_OFFSET_X + GAME_WIDTH - Math.round(40 * S);
    const cy = UI_OFFSET_Y + Math.round(40 * S);

    this.compassContainer = this.add.container(cx, cy).setDepth(101).setScrollFactor(0);

    // Background circle
    const bg = this.add.graphics();
    bg.fillStyle(0x1a1a3e, 0.8);
    bg.fillCircle(0, 0, Math.round(22 * S));
    bg.lineStyle(2, 0xddaa33, 1);
    bg.strokeCircle(0, 0, Math.round(22 * S));
    this.compassContainer.add(bg);

    // Cardinal letters
    const cardStyle = { fontSize: `${Math.round(6 * S)}px`, color: '#aaaaaa', fontFamily: FONT_FAMILY };
    const n = this.add.text(0, Math.round(-15 * S), 'N', { fontSize: `${Math.round(7 * S)}px`, color: '#ffcc33', fontFamily: FONT_FAMILY }).setOrigin(0.5);
    const s = this.add.text(0, Math.round(17 * S), 'S', cardStyle).setOrigin(0.5);
    const e = this.add.text(Math.round(17 * S), 0, 'E', cardStyle).setOrigin(0.5);
    const w = this.add.text(Math.round(-17 * S), 0, 'W', cardStyle).setOrigin(0.5);
    this.compassContainer.add([n, s, e, w]);

    // Small north triangle indicator above N
    const northTriangle = this.add.graphics();
    northTriangle.fillStyle(0xffcc33, 1);
    northTriangle.fillTriangle(0, Math.round(-22 * S), Math.round(-4 * S), Math.round(-18 * S), Math.round(4 * S), Math.round(-18 * S));
    this.compassContainer.add(northTriangle);

    // Arrow (drawn as triangle, rotated toward target) — K/G1 only
    if (this.isCompassArrowEligible()) {
      this.compassArrow = this.add.graphics();
      this.compassContainer.add(this.compassArrow);
    }

    this.updateCompass();
  }

  private updateCompass(): void {
    if (!this.compassEnabled || !this.compassContainer) return;

    const def = mapDefs[this.currentMapId];
    if (def.type !== 'overworld') {
      this.compassContainer.setVisible(false);
      return;
    }
    this.compassContainer.setVisible(true);

    // Mark town as visited when player is inside (for next update cycle)
    // This is checked on overworld, so we set it when transitioning TO a town

    // G2+ always shows compass (N/S/E/W only), no arrow needed
    if (!this.compassArrow) return;

    const target = this.getCompassTarget();
    if (!target) {
      // All done — hide arrow but keep compass visible
      this.compassArrow.clear();
      return;
    }

    // Calculate angle from hero to target
    const dx = target.ox - this.heroTileX;
    const dy = target.oy - this.heroTileY;
    const angle = Math.atan2(dy, dx);

    // Draw arrow triangle pointing in that direction
    this.compassArrow.clear();

    // Arrow: large triangle pointing right (angle=0), then rotated
    const arrowLen = 14;
    const arrowWidth = 7;

    // Tip of arrow
    const tipX = Math.cos(angle) * arrowLen;
    const tipY = Math.sin(angle) * arrowLen;
    // Two base points (perpendicular to direction)
    const perpX = Math.cos(angle + Math.PI / 2) * arrowWidth;
    const perpY = Math.sin(angle + Math.PI / 2) * arrowWidth;
    const baseX = Math.cos(angle) * -4;
    const baseY = Math.sin(angle) * -4;

    // Main arrow (gold/yellow)
    this.compassArrow.fillStyle(0xffcc33, 1);
    this.compassArrow.beginPath();
    this.compassArrow.moveTo(tipX, tipY);
    this.compassArrow.lineTo(baseX + perpX, baseY + perpY);
    this.compassArrow.lineTo(baseX - perpX, baseY - perpY);
    this.compassArrow.closePath();
    this.compassArrow.fillPath();

    // Arrow border
    this.compassArrow.lineStyle(1, 0xaa8822, 1);
    this.compassArrow.beginPath();
    this.compassArrow.moveTo(tipX, tipY);
    this.compassArrow.lineTo(baseX + perpX, baseY + perpY);
    this.compassArrow.lineTo(baseX - perpX, baseY - perpY);
    this.compassArrow.closePath();
    this.compassArrow.strokePath();

    // Small red dot at center
    this.compassArrow.fillStyle(0xcc3333, 1);
    this.compassArrow.fillCircle(0, 0, 2);

    // Proximity pulse: if close to target (within 10 tiles), pulse alpha
    const dist = Math.sqrt(dx * dx + dy * dy);
    if (dist < 10) {
      const pulse = 0.6 + 0.4 * Math.sin(this.time.now / 100);
      this.compassContainer.setAlpha(pulse);
    } else {
      this.compassContainer.setAlpha(1);
    }
  }

  private markTownVisited(mapId: string): void {
    const flag = `compass.visited.${mapId}`;
    if (!gameState.player.state.storyFlags[flag]) {
      gameState.player.state.storyFlags[flag] = true;
    }
  }

  private updateWindTower(): void {
    if (!this.windTowerEnabled) return;
    const now = this.time.now;
    if (this.windTowerPhase === 'calm') {
      if (now - this.windTowerTimer > WorldMapScene.WIND_CALM_MS) {
        this.windTowerPhase = 'gust';
        this.windTowerTimer = now;
        this.windTowerPushing = true;
      }
    } else {
      if (now - this.windTowerTimer > WorldMapScene.WIND_GUST_MS) {
        this.windTowerPhase = 'calm';
        this.windTowerTimer = now;
        this.windTowerPushing = false;
      } else if (this.windTowerPushing && !this.isMoving) {
        this.handleWindPush();
      }
    }
  }

  private handleWindPush(): void {
    if (!this.windTowerEnabled || this.windTowerPhase !== 'gust') return;
    const tile = this.mapData[this.heroTileY]?.[this.heroTileX];
    if (tile !== 25) return; // only on wind corridor tiles
    const { dx, dy } = this.windTowerDir;
    const newX = this.heroTileX + dx;
    const newY = this.heroTileY + dy;
    if (this.canMove(newX, newY)) {
      const transition = this.checkTransition(newX, newY);
      if (transition) { this.performTransition(transition); return; }
      this.isMoving = true;
      this.heroTileX = newX;
      this.heroTileY = newY;
      const targetX = this.heroTileX * TILE_SIZE + TILE_SIZE / 2;
      const targetY = this.heroTileY * TILE_SIZE + TILE_SIZE / 2;
      this.tweens.add({
        targets: this.hero,
        x: targetX, y: targetY,
        duration: 200,
        onComplete: () => {
          this.isMoving = false;
          this.updatePosition();
          this.updateCamera();
          this.onStep();
        },
      });
    }
  }

  private updateMazeHunter(): void {
    if (!this.mazeHunterEnabled || this.mazeHunterDefeated || this.isMoving) return;
    const now = this.time.now;
    if (now - this.mazeHunterMoveTimer < 600) return;
    this.mazeHunterMoveTimer = now;
    this.mazeHunterStepCount++;

    // Activate after 3 steps
    if (!this.mazeHunterActive && this.mazeHunterStepCount >= 3) {
      this.mazeHunterActive = true;
    }
    if (!this.mazeHunterActive) return;

    // Check LOS to player (within 5 tiles straight)
    const dx = Math.abs(this.heroTileX - this.mazeHunterBossTileX);
    const dy = Math.abs(this.heroTileY - this.mazeHunterBossTileY);
    if ((dx <= 5 && dy === 0) || (dy <= 5 && dx === 0)) {
      this.mazeHunterChaseMode = true;
    }

    // Move boss one step toward player via BFS
    this.bfsMazeHunterStep();

    // Check collision with player
    if (this.mazeHunterBossTileX === this.heroTileX && this.mazeHunterBossTileY === this.heroTileY) {
      if (!this._pendingMazeHunterBattle) {
        this._pendingMazeHunterBattle = true;
        this.triggerMazeHunterBattle();
      }
    }
  }

  private bfsMazeHunterStep(): void {
    const mapW = this.mapData[0]?.length ?? 1;
    const mapH = this.mapData.length;
    const targetX = this.mazeHunterChaseMode ? this.heroTileX : this.mazeHunterEntranceX;
    const targetY = this.mazeHunterChaseMode ? this.heroTileY : this.mazeHunterEntranceY;
    const start = `${this.mazeHunterBossTileX},${this.mazeHunterBossTileY}`;
    const goal = `${targetX},${targetY}`;
    if (start === goal) return;

    const parent = new Map<string, string>();
    const q: [number, number][] = [[this.mazeHunterBossTileX, this.mazeHunterBossTileY]];
    parent.set(start, '');
    let found = false;
    while (q.length > 0 && !found) {
      const [cx2, cy2] = q.shift()!;
      for (const [ddx, ddy] of [[0, -1], [0, 1], [-1, 0], [1, 0]] as [number, number][]) {
        const nx2 = cx2 + ddx, ny2 = cy2 + ddy;
        const k = `${nx2},${ny2}`;
        if (nx2 < 0 || nx2 >= mapW || ny2 < 0 || ny2 >= mapH) continue;
        if (parent.has(k)) continue;
        const t2 = this.mapData[ny2]?.[nx2];
        if (t2 === 1 || t2 === 24) continue; // wall
        parent.set(k, `${cx2},${cy2}`);
        if (nx2 === targetX && ny2 === targetY) { found = true; break; }
        q.push([nx2, ny2]);
      }
    }
    if (!found) return;
    // Trace back to find first step
    let cur = goal;
    let prev = parent.get(cur) ?? '';
    while (prev !== start && prev !== '') { cur = prev; prev = parent.get(cur) ?? ''; }
    const [nx2, ny2] = cur.split(',').map(Number);
    this.mazeHunterBossTileX = nx2;
    this.mazeHunterBossTileY = ny2;
  }

  private triggerMazeHunterBattle(): void {
    const def = mapDefs[this.currentMapId];
    if (!def.bossId) return;
    const boss = monsters[def.bossId];
    if (!boss) return;
    this.startBattle(boss, true);
  }

  shutdown(): void {
    this.input.keyboard?.removeAllListeners();
  }
}
