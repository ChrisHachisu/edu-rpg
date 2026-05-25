import Phaser from 'phaser';
import { GAME_WIDTH, GAME_HEIGHT, TILE_SIZE, ZOOM, COLORS, FONT_FAMILY, UI_OFFSET_X, UI_OFFSET_Y, UI_SCALE } from '../utils/constants';
import { t } from '../i18n/i18n';
import { gameState } from '../GameState';
import { generateOverworldMap, generateTownMap, generateDungeonMap, generatePortalLandMap, type DungeonResult } from '../utils/MapGenerator';
import { mapDefs } from '../data/maps';
import { monsters } from '../data/monsters';
import { items } from '../data/items';
import { encounterZones } from '../data/encounterTables';
import { questDefinitions, type QuestDefinition, type QuestObjective } from '../systems/progression/QuestManager';
import { audioManager, BgmTrack } from '../systems/audio/AudioManager';

const S = UI_SCALE;

// ── Compass waypoint chain for K/G1 players ──
// Each entry: { mapId, overworldX, overworldY, type, doneFlag }
// doneFlag: story flag that marks this waypoint as completed
// For towns: compass.visited.<mapId>  (set on entry)
// For dungeons: boss.<bossId>.defeated (set on boss defeat)
type CompassWaypoint = {
  mapId: string;
  ox: number;
  oy: number;
  type: 'town' | 'dungeon';
  doneFlag: string;
  questGate?: string;
};

const COMPASS_CHAIN: CompassWaypoint[] = [
  // Act 1
  { mapId: 'millbrook',     ox: 100, oy: 320, type: 'town',    doneFlag: 'compass.visited.millbrook' },
  { mapId: 'portSapphire',  ox: 130, oy: 290, type: 'town',    doneFlag: 'compass.visited.portSapphire' },
  { mapId: 'mistyGrotto',   ox: 120, oy: 260, type: 'dungeon', doneFlag: 'boss.giantToad.defeated' },
  { mapId: 'crystalCave',   ox: 148, oy: 295, type: 'dungeon', doneFlag: 'boss.serpent.defeated' },
  // Act 2
  { mapId: 'ironkeep',      ox: 200, oy: 320, type: 'town',    doneFlag: 'compass.visited.ironkeep' },
  { mapId: 'ironMine',      ox: 185, oy: 335, type: 'dungeon', doneFlag: 'boss.oreColossus.defeated', questGate: 'gordosOre' },
  { mapId: 'stormNest',     ox: 280, oy: 295, type: 'dungeon', doneFlag: 'boss.stormHarpy.defeated' },
  { mapId: 'frostwatch',    ox: 222, oy: 262, type: 'town',    doneFlag: 'compass.visited.frostwatch' },
  { mapId: 'frozenLake',    ox: 200, oy: 265, type: 'dungeon', doneFlag: 'boss.iceWyrm.defeated', questGate: 'frozenSupplies' },
  { mapId: 'hauntedForest', ox: 238, oy: 248, type: 'dungeon', doneFlag: 'boss.phantomStag.defeated' },
  { mapId: 'hauntedVillage', ox: 252, oy: 242, type: 'town',   doneFlag: 'compass.visited.hauntedVillage' },
  { mapId: 'shadowCave',    ox: 260, oy: 234, type: 'dungeon', doneFlag: 'boss.dragon.defeated' },
  // Act 3/4
  { mapId: 'oasisHaven',    ox: 220, oy: 150, type: 'town',    doneFlag: 'compass.visited.oasisHaven' },
  { mapId: 'ruinsCamp',     ox: 270, oy: 120, type: 'town',    doneFlag: 'compass.visited.ruinsCamp' },
  { mapId: 'oasisDepths',   ox: 225, oy: 160, type: 'dungeon', doneFlag: 'boss.sandSerpentQueen.defeated', questGate: 'lunasMap' },
  { mapId: 'desertTomb',    ox: 250, oy: 140, type: 'dungeon', doneFlag: 'boss.sandGolem.defeated' },
  { mapId: 'scorchedRuins', ox: 278, oy: 95,  type: 'dungeon', doneFlag: 'boss.ashenGuardian.defeated', questGate: 'ancientRelic' },
  { mapId: 'embersRest',    ox: 195, oy: 80,  type: 'town',    doneFlag: 'compass.visited.embersRest' },
  { mapId: 'emberMines',    ox: 202, oy: 48,  type: 'dungeon', doneFlag: 'boss.magmaBeetleKing.defeated', questGate: 'flameCloak' },
  { mapId: 'obsidianCavern', ox: 185, oy: 48, type: 'dungeon', doneFlag: 'boss.crystalHydra.defeated', questGate: 'lunasProphecy' },
  { mapId: 'volcanicForge', ox: 172, oy: 110, type: 'dungeon', doneFlag: 'boss.flameTitan.defeated' },
  // Act 5
  { mapId: 'lastBastion',   ox: 100, oy: 150, type: 'town',    doneFlag: 'compass.visited.lastBastion' },
  { mapId: 'havensEdge',    ox: 70,  oy: 100, type: 'town',    doneFlag: 'compass.visited.havensEdge' },
  { mapId: 'demonBarracks', ox: 80,  oy: 60,  type: 'dungeon', doneFlag: 'boss.warGeneralMalachar.defeated', questGate: 'demonBarracksQuest' },
  { mapId: 'voidRift',      ox: 120, oy: 70,  type: 'dungeon', doneFlag: 'boss.nullDevourer.defeated', questGate: 'kikisResolve' },
  { mapId: 'stormreachIsles',   ox: 40,  oy: 50,  type: 'dungeon', doneFlag: 'boss.stormSentinel.defeated', questGate: 'portalRelics' },
  { mapId: 'frostfallPeaks',    ox: 130, oy: 40,  type: 'dungeon', doneFlag: 'boss.frostMonarch.defeated', questGate: 'portalRelics' },
  { mapId: 'sunkenTempleIsle',  ox: 50,  oy: 130, type: 'dungeon', doneFlag: 'boss.swordWraith.defeated', questGate: 'portalRelics' },
  { mapId: 'twilightRealm',     ox: 120, oy: 140, type: 'dungeon', doneFlag: 'boss.celestialGuardian.defeated', questGate: 'portalRelics' },
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

  // Warp overlay
  private warpOverlayOpen = false;
  private warpOverlayBox?: Phaser.GameObjects.Rectangle;
  private warpOverlayTexts: Phaser.GameObjects.Text[] = [];
  private warpOverlayIndex = 0;
  private warpOverlayCursor?: Phaser.GameObjects.Text;
  private warpFloors: number[] = [];

  // Mid-floor crystal overlay
  private midCrystalOverlayOpen = false;
  private midCrystalOverlayBox?: Phaser.GameObjects.Rectangle;
  private midCrystalOverlayTexts: Phaser.GameObjects.Text[] = [];
  private midCrystalOverlayIndex = 0;
  private midCrystalOverlayCursor?: Phaser.GameObjects.Text;

  // Quest overlay
  private questOverlayOpen = false;
  private questOverlayBox?: Phaser.GameObjects.Rectangle;
  private questOverlayTexts: Phaser.GameObjects.Text[] = [];
  private questOverlayIndex = 0;
  private questOverlayCursor?: Phaser.GameObjects.Text;
  private questOverlayQuestId?: string;

  // Quest notification
  private questNotifText?: Phaser.GameObjects.Text;
  private questNotifBg?: Phaser.GameObjects.Rectangle;
  private questNotifTimer?: Phaser.Time.TimerEvent;

  // Tile grid for individual tile access (culling, fog, etc.)
  private tileGrid: Phaser.GameObjects.Image[][] = [];
  private cullingEnabled = false;
  private lastCullCamX = -Infinity;
  private lastCullCamY = -Infinity;

  // Minimap
  private minimapGfx?: Phaser.GameObjects.Graphics;
  private minimapPlayerDot?: Phaser.GameObjects.Graphics;
  private lastMinimapUpdate = 0;
  private minimapMeta = { mmX: 0, mmY: 0, scale: 0, startTX: 0, startTY: 0, size: 0 };

  // Dev overlay
  private coordText?: Phaser.GameObjects.Text;
  private messageSpeaker?: Phaser.GameObjects.Text;
  private dialogSpeaker?: string;

  // Forest maze
  private forestMazeCorrectExitY = -1;
  private forestMazeFireflies: Phaser.GameObjects.GameObject[] = [];
  private keyChestPositions = new Set<string>();

  // Transition cooldown
  private transitionCooldown = 0;

  // Fog mechanic
  private fogEnabled = false;
  private fogRadius = 3;
  private fogTorchBonus = 0;
  private fogTorchCount = 0;

  // Lava course mechanic
  private lavaPhase = false;
  private lavaTimer = 0;

  // Mirror mechanic
  private mirrorRoomBounds: { x: number; y: number; w: number; h: number }[] = [];
  private mirrorActive = false;
  private mirrorIcon?: Phaser.GameObjects.Text;

  // Crystal pillar mechanic
  private crystalPillars: { x: number; y: number; colorIdx: number }[] = [];
  private crystalSequence: number[] = [];
  private crystalActivated: number[] = [];
  private crystalSequenceColors: string[] = [];
  private readonly crystalColors = [0xff3322, 0x2277ff, 0x22cc44, 0xffdd00, 0xff55ff];
  private readonly crystalColorNames = ['red', 'blue', 'green', 'gold', 'purple'];

  // Darkness pulse mechanic
  private darknessPulseEnabled = false;
  private darknessPulsePhase: 'light' | 'dark' = 'light';
  private darknessPulseTimer = 0;
  private darknessPulsePatrols: {
    sprite: Phaser.GameObjects.Container;
    waypoints: { x: number; y: number }[];
    waypointIdx: number;
    forward: boolean;
    defeated: boolean;
    moveTimer: number;
    tileX: number;
    tileY: number;
    isStepMoving: boolean;
  }[] = [];
  private darknessPulseOverlay?: Phaser.GameObjects.Rectangle;
  private _pendingPatrolWaypoints?: { x: number; y: number }[][];
  private _pendingPatrolSprite?: Phaser.GameObjects.Container;

  // Wind tower mechanic
  private windTowerEnabled = false;
  private windTowerPhase: 'calm' | 'gust' = 'calm';
  private windTowerTimer = 0;
  private windTowerDir: { dx: number; dy: number } = { dx: 0, dy: -1 };
  private windTowerPushing = false;

  // Maze hunter mechanic
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
  private mazeHunterBossSprite?: Phaser.GameObjects.Container;
  private _pendingMazeHunterBattle = false;
  private goldenChestPos?: { x: number; y: number };

  // Shadow portal mechanic
  private shadowPortalEnabled = false;
  private portalPairs: { a: { x: number; y: number }; b: { x: number; y: number } }[] = [];
  private portalCooldown = false;

  // Mimic & hidden room chests
  private mimicChestPositions = new Set<string>();
  private hiddenRoomChestPositions = new Set<string>();
  private pendingMimicReward = false;

  // Poison & tripwire
  private poisonTickTimer = 0;
  private tripwireGlowTimer = 0;
  private lastPoisonTickWallTime = 0;
  private banditLordMapSprite?: Phaser.GameObjects.Image;

  // Tile constants
  private static readonly TILE_CRYSTAL_SAVE = 14;
  private static readonly TILE_KEY_DOOR = 15;
  private static readonly TILE_HIDDEN_WALL = 17;
  private static readonly TILE_PLAQUE = 18;
  private static readonly TILE_WIND_BARRIER = 20;
  private static readonly TILE_CRYSTAL_PILLAR = 19;
  private static readonly TILE_CRYSTAL_WALL = 16;
  private static readonly TILE_ICE = 25;
  private static readonly TILE_PIT = 26;
  private static readonly TILE_QUICKSAND = 27;
  private static readonly TILE_WIND_CORRIDOR = 25;
  private static readonly TILE_SHADOW_PORTAL = 29;
  private static readonly TILE_SPIKE_TRAP = 30;
  private static readonly TILE_SPIKE_SPRUNG = 32;
  private static readonly TILE_TRIPWIRE = 31;

  // Mechanic timing constants
  private static readonly CULL_BUFFER = 3;
  private static readonly LAVA_TOGGLE_MS = 4000;
  private static readonly DARKNESS_LIGHT_MS = 2000;
  private static readonly DARKNESS_DARK_MS = 12000;
  private static readonly DARKNESS_FADE_IN_MS = 500;
  private static readonly DARKNESS_FADE_OUT_MS = 500;
  private static readonly WIND_CALM_MS = 4000;
  private static readonly WIND_GUST_MS = 2000;

  private static readonly NPC_SPRITE_MAP: Record<string, string> = {
    sage: 'npc-sage', kiki: 'npc-kiki', drake: 'npc-drake', gordo: 'npc-gordo',
    luna: 'npc-luna', elder: 'npc-elder', frostElder: 'npc-elder',
    hauntedElder: 'npc-elder', oasisElder: 'npc-elder',
    archaeologist: 'npc-archaeologist',
    mercenary: 'npc-knight', forgemaster: 'npc-gordo', veteran: 'npc-knight',
    grizzledKnight: 'npc-knight', frostGuard: 'npc-guard-f',
    hauntedGuard: 'npc-guard-f',
  };

  private static readonly NPC_NAME_KEYS: Record<string, string> = {
    sage: 'npc.sage.name', kiki: 'npc.kiki.name', drake: 'npc.drake.name',
    gordo: 'npc.gordo.name', luna: 'npc.luna.name', elder: 'npc.elder.name',
    villager1: 'npc.villager.name', villager2: 'npc.villager.name',
    miller: 'npc.miller.name', herbalist: 'npc.herbalist.name',
    sailor: 'npc.sailor.name', fisherman: 'npc.fisherman.name',
    wisewoman: 'npc.wisewoman.name', soldier: 'npc.soldier.name',
    blacksmith: 'npc.blacksmith.name',
    frostElder: 'npc.frostElder.name', frostGuard: 'npc.frostGuard.name',
    mountaineer: 'npc.mountaineer.name', frostVillager: 'npc.frostVillager.name',
    hauntedElder: 'npc.hauntedElder.name', hauntedGuard: 'npc.hauntedGuard.name',
    hauntedVillager: 'npc.hauntedVillager.name', oasisElder: 'npc.elder.name',
    refugee: 'npc.refugee.name',
    archaeologist: 'npc.archaeologist.name',
    explorer: 'npc.explorer.name', mercenary: 'npc.mercenary.name',
    forgemaster: 'npc.forgemaster.name', lavaMiner: 'npc.lavaMiner.name',
    veteran: 'npc.veteran.name', priestess: 'npc.priestess.name',
    grizzledKnight: 'npc.grizzledKnight.name', prophetess: 'npc.prophetess.name',
    skyKeeper: 'npc.skyKeeper.name', frostSage: 'npc.frostSage.name',
    templeScholar: 'npc.templeScholar.name', shadowWatcher: 'npc.shadowWatcher.name',
  };

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
      this.applyPoisonCatchUp();
      // Reset cursor key states so held keys don't cause immediate movement
      this.cursors.left.reset();
      this.cursors.right.reset();
      this.cursors.up.reset();
      this.cursors.down.reset();

      // Handle escape crystal teleport
      const pendingEscape = (gameState as any).__pendingEscape;
      if (pendingEscape) {
        const { toX, toY } = pendingEscape;
        const escapeTarget = (gameState as any).__pendingEscapeTarget || 'overworld';
        delete (gameState as any).__pendingEscape;
        delete (gameState as any).__pendingEscapeTarget;
        this.isMoving = true;
        audioManager.playSfx('crystal_obtain');
        this.cameras.main.fadeOut(800, 255, 255, 255);
        this.cameras.main.once('camerafadeoutcomplete', () => {
          gameState.player.state.position = { mapId: escapeTarget, x: toX, y: toY };
          this.heroTileX = toX;
          this.heroTileY = toY;
          this.currentFloor = 1;
          this.loadMap(escapeTarget);
          this.cameras.main.fadeIn(600, 255, 255, 255);
          this.cameras.main.once('camerafadeincomplete', () => { this.isMoving = false; });
        });
        return;
      }

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
      const dungeonResult = generateDungeonMap(
        scaledW, scaledH,
        mapId.charCodeAt(0) * 251,
        this.currentFloor, totalFloors,
        isSingleFloorGate,
        isGateFinalFloor,
        def.castle ?? false,
        def.mechanic,
        mapId,
      );
      this.mapData = dungeonResult.map;
      this.keyChestPositions = new Set(dungeonResult.keyChests.map(k => `${k.x},${k.y}`));
      this.forestMazeCorrectExitY = dungeonResult.correctExitY ?? -1;

      // Crystal pillar mechanic
      if (def.mechanic === 'colored-keys') {
        const solved = !!gameState.player.state.storyFlags[`pillars.${mapId}.f${this.currentFloor}.solved`];
        this.crystalPillars = dungeonResult.pillarPositions ?? [];
        this.crystalSequence = dungeonResult.pillarSequence ?? [];
        this.crystalSequenceColors = dungeonResult.pillarSequenceColors ?? [];
        this.crystalActivated = [];
        if (solved) {
          for (let y = 0; y < this.mapData.length; y++)
            for (let x = 0; x < this.mapData[y].length; x++)
              if (this.mapData[y][x] === WorldMapScene.TILE_CRYSTAL_WALL) this.mapData[y][x] = 0;
        }
      } else {
        this.crystalPillars = [];
        this.crystalSequence = [];
        this.crystalActivated = [];
        this.crystalSequenceColors = [];
      }

      // Forest maze: clear firefly tiles
      if (def.mechanic === 'forest-maze') {
        for (let y = 0; y < this.mapData.length; y++)
          for (let x = 0; x < this.mapData[y].length; x++)
            if (this.mapData[y][x] === WorldMapScene.TILE_CRYSTAL_SAVE) this.mapData[y][x] = 0;
      }

      // Forest maze exit
      if (def.mechanic === 'forest-maze' && this.forestMazeCorrectExitY >= 0) {
        const w = this.mapData[0]?.length ?? 100;
        const ey = this.forestMazeCorrectExitY;
        if (this.mapData[ey]?.[w - 1] === 0) this.mapData[ey][w - 1] = 2;
      }

      // Darkness pulse patrol waypoints
      if (def.mechanic === 'darkness-pulse' && dungeonResult.patrolWaypoints) {
        this._pendingPatrolWaypoints = dungeonResult.patrolWaypoints;
      } else {
        this._pendingPatrolWaypoints = undefined;
      }

      // Wind tower direction
      if (def.mechanic === 'wind-tower' && dungeonResult.windCorridorDir) {
        this.windTowerDir = dungeonResult.windCorridorDir;
      }

      // Maze hunter
      if (def.mechanic === 'maze-hunter') {
        this.goldenChestPos = dungeonResult.goldenChestPos;
        for (let y = 0; y < this.mapData.length; y++)
          for (let x = 0; x < this.mapData[y].length; x++)
            if (this.mapData[y][x] === 6) { this.mazeHunterEntranceX = x; this.mazeHunterEntranceY = y; }
      } else {
        this.goldenChestPos = undefined;
      }

      // Shadow portal pairs
      if (def.mechanic === 'shadow-portal' && dungeonResult.portalPairs) {
        this.shadowPortalEnabled = true;
        this.portalPairs = dungeonResult.portalPairs;
        this.portalCooldown = false;
      } else {
        this.shadowPortalEnabled = false;
        this.portalPairs = [];
      }

      // Mimic chests
      if (dungeonResult.mimicChests && dungeonResult.mimicChests.length > 0) {
        this.mimicChestPositions = new Set(dungeonResult.mimicChests);
        for (const pos of [...this.mimicChestPositions]) {
          const mimicFlag = `mimic.${mapId}.f${this.currentFloor}.${pos}`;
          if (gameState.player.state.storyFlags[mimicFlag]) this.mimicChestPositions.delete(pos);
        }
      } else {
        this.mimicChestPositions = new Set();
      }

      // Hidden room chests
      this.hiddenRoomChestPositions = new Set(dungeonResult.hiddenRoomChests ?? []);

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
              if (def.mechanic === 'forest-maze') {
                this.mapData[y][x] = 0;
              } else {
                const isGate = def.connections.length > 1;
                this.mapData[y][x] = isGate ? 12 : 10;
              }
            }
          }
        }
      }

      // Clear already-opened doors
      for (let y = 0; y < this.mapData.length; y++) {
        for (let x = 0; x < this.mapData[y].length; x++) {
          const tile = this.mapData[y][x];
          if (tile === WorldMapScene.TILE_KEY_DOOR || tile === WorldMapScene.TILE_CRYSTAL_PILLAR || tile === WorldMapScene.TILE_WIND_BARRIER) {
            const doorFlag = `door.${mapId}.f${this.currentFloor}.${x}.${y}`;
            if (gameState.player.state.storyFlags[doorFlag]) this.mapData[y][x] = 0;
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
          const portalY = mapH - 2;
          const portalX = entrX + 2;
          if (portalX < mapW - 1 && this.mapData[portalY]?.[portalX] === 0) {
            this.mapData[portalY][portalX] = 11;
          }
        } else {
          const portalY = 1;
          const portalX = entrX + 2;
          if (portalX < mapW - 1 && this.mapData[portalY]?.[portalX] === 0) {
            this.mapData[portalY][portalX] = 11;
          }
        }
      }

      // Crystal save point visibility on floor 1
      if (this.currentFloor === 1) {
        const crystalVisible = gameState.player.state.storyFlags[`entrance.crystal.${mapId}.visible`];
        const warpPrefix = `warp.${mapId}.`;
        const hasWarp = crystalVisible || Object.keys(gameState.player.state.storyFlags).some(k => k.startsWith(warpPrefix) && gameState.player.state.storyFlags[k]);
        if (!hasWarp) {
          for (let y = 0; y < this.mapData.length; y++)
            for (let x = 0; x < this.mapData[y].length; x++)
              if (this.mapData[y][x] === WorldMapScene.TILE_CRYSTAL_SAVE) this.mapData[y][x] = 0;
        }
      }

      // Reset pending boss state on map load
      this.pendingBossId = undefined;
    }

    // Quest progress: visiting a map
    gameState.questManager.updateProgress(gameState.player.state, 'visit', mapId, 1);
    if (def.type === 'town') this.markTownVisited(mapId);

    // Track effective map dimensions (may differ from def for grade-scaled dungeons)
    this.effectiveWidth = this.mapData[0]?.length ?? def.width;
    this.effectiveHeight = this.mapData.length ?? def.height;

    this.renderMap();

    // Tint crystal pillars after render
    if (this.crystalPillars.length > 0) {
      const solved = !!gameState.player.state.storyFlags[`pillars.${this.currentMapId}.f${this.currentFloor}.solved`];
      for (let i = 0; i < this.crystalPillars.length; i++) {
        const p = this.crystalPillars[i];
        if (!this.tileGrid[p.y]?.[p.x]) continue;
        const baseColor = this.crystalColors[p.colorIdx];
        const pillarFlag = `pillar.${this.currentMapId}.f${this.currentFloor}.${i}`;
        const activated = !!gameState.player.state.storyFlags[pillarFlag];
        if (solved || activated) {
          const r = Math.min(255, ((baseColor >> 16) & 255) + 100);
          const g = Math.min(255, ((baseColor >> 8) & 255) + 100);
          const b = Math.min(255, (baseColor & 255) + 100);
          this.tileGrid[p.y][p.x].setTint((r << 16) | (g << 8) | b);
          if (!this.crystalActivated.includes(i)) this.crystalActivated.push(i);
        } else {
          const r = Math.floor(((baseColor >> 16) & 255) * 0.5);
          const g = Math.floor(((baseColor >> 8) & 255) * 0.5);
          const b = Math.floor((baseColor & 255) * 0.5);
          this.tileGrid[p.y][p.x].setTint((r << 16) | (g << 8) | b);
        }
      }
    }

    this.renderNPCs(def);
    this.createHero();
    this.updateCamera();
    this.initMechanics(def);

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
    this.banditLordMapSprite?.destroy();
    this.banditLordMapSprite = undefined;
    this.forestMazeFireflies.forEach(s => (s as any).destroy?.());
    this.forestMazeFireflies = [];
    this.tileGrid = [];

    const def = mapDefs[this.currentMapId];
    const prefix = (def.type === 'overworld' || def.type === 'portal-overworld') ? 'ow'
      : def.type === 'town' ? 'town'
      : def.tileTheme === 'forest' ? 'forest'
      : def.tileTheme === 'tower' ? 'tower'
      : def.tileTheme === 'crystal' ? 'crystal'
      : def.tileTheme === 'ice' ? 'ice'
      : def.tileTheme === 'shadow' ? 'shadow'
      : def.tileTheme === 'tomb' ? 'tomb'
      : def.castle ? 'castle' : 'dng';

    this.cullingEnabled = def.type === 'overworld' || def.type === 'portal-overworld';

    for (let y = 0; y < this.mapData.length; y++) {
      this.tileGrid[y] = [];
      for (let x = 0; x < this.mapData[y].length; x++) {
        const tileIndex = this.mapData[y][x];
        const px = x * TILE_SIZE;
        const py = y * TILE_SIZE;
        const tileKey = `${prefix}-${tileIndex}`;
        const tile = this.add.image(px, py, tileKey).setOrigin(0).setScale(1);
        if (this.cullingEnabled) tile.setVisible(false);
        this.tileLayer.add(tile);
        this.tileGrid[y][x] = tile;
      }
    }
    this.lastCullCamX = -Infinity;
    this.lastCullCamY = -Infinity;

    // Apply hidden wall visibility for dungeons
    if (mapDefs[this.currentMapId].type === 'dungeon') {
      this.applyHiddenWallVisibility();
    }
    this.renderBanditLordMapSprite();
  }

  private getTileThemePrefix(): string {
    const def = mapDefs[this.currentMapId];
    return def.tileTheme === 'forest' ? 'forest'
      : def.tileTheme === 'tower' ? 'tower'
      : def.tileTheme === 'crystal' ? 'crystal'
      : def.tileTheme === 'ice' ? 'ice'
      : def.tileTheme === 'shadow' ? 'shadow'
      : def.tileTheme === 'tomb' ? 'tomb'
      : def.castle ? 'castle' : 'dng';
  }

  private applyHiddenWallVisibility(): void {
    const h = this.mapData.length;
    const w = this.mapData[0]?.length ?? 0;
    const prefix = this.getTileThemePrefix();
    for (let y = 0; y < h; y++) {
      for (let x = 0; x < w; x++) {
        if (this.mapData[y][x] !== WorldMapScene.TILE_HIDDEN_WALL) continue;
        const hiddenFlag = `hidden.${this.currentMapId}.f${this.currentFloor}.${x}.${y}`;
        if (gameState.player.state.storyFlags[hiddenFlag]) continue;
        const roomTiles = this.findHiddenRoomTiles(x, y);
        for (const { rx, ry } of roomTiles) {
          if (this.tileGrid[ry]?.[rx]) {
            this.tileGrid[ry][rx].setTexture(`${prefix}-1`);
            this.tileGrid[ry][rx].setAlpha(1);
          }
        }
      }
    }
  }

  private findHiddenRoomTiles(hx: number, hy: number): { rx: number; ry: number }[] {
    const h = this.mapData.length;
    const w = this.mapData[0]?.length ?? 0;
    const dirs = [[0, -1], [0, 1], [-1, 0], [1, 0]] as [number, number][];
    const rewardTiles = new Set([4, 7, 8, 9]);

    for (const [dx, dy] of dirs) {
      const centerX = hx + dx * 2;
      const centerY = hy + dy * 2;
      if (centerX - 1 < 0 || centerX + 1 >= w || centerY - 1 < 0 || centerY + 1 >= h) continue;

      const localTiles: { rx: number; ry: number }[] = [];
      let hasReward = false;
      const addLocal = (rx: number, ry: number) => {
        const tile = this.mapData[ry]?.[rx];
        if (tile === undefined || tile === 1 || tile === 5 || tile === WorldMapScene.TILE_HIDDEN_WALL) return;
        if (!localTiles.some(existing => existing.rx === rx && existing.ry === ry)) localTiles.push({ rx, ry });
        if (rewardTiles.has(tile)) hasReward = true;
      };

      addLocal(hx + dx, hy + dy);
      for (let ry = centerY - 1; ry <= centerY + 1; ry++) {
        for (let rx = centerX - 1; rx <= centerX + 1; rx++) addLocal(rx, ry);
      }
      if (hasReward && localTiles.length > 0) return localTiles;
    }

    const candidates: { tiles: { rx: number; ry: number }[]; hasReward: boolean }[] = [];

    for (const [dx, dy] of dirs) {
      const startX = hx + dx, startY = hy + dy;
      if (startX < 0 || startX >= w || startY < 0 || startY >= h) continue;
      if (this.mapData[startY][startX] === 1 || this.mapData[startY][startX] === 5 || this.mapData[startY][startX] === WorldMapScene.TILE_HIDDEN_WALL) continue;

      const tiles: { rx: number; ry: number }[] = [];
      const visited = new Set<string>([`${hx},${hy}`, `${startX},${startY}`]);
      const queue: [number, number][] = [[startX, startY]];
      let hasReward = false;

      while (queue.length > 0) {
        const [cx, cy] = queue.shift()!;
        const tile = this.mapData[cy]?.[cx];
        if (tile === undefined || tile === 1 || tile === 5 || tile === WorldMapScene.TILE_HIDDEN_WALL) continue;
        tiles.push({ rx: cx, ry: cy });
        if (tile === 4 || tile === 7 || tile === 8 || tile === 9) hasReward = true;

        for (const [qx, qy] of [[0, -1], [0, 1], [-1, 0], [1, 0]] as [number, number][]) {
          const nx = cx + qx, ny = cy + qy;
          if (nx < 0 || nx >= w || ny < 0 || ny >= h) continue;
          const key = `${nx},${ny}`;
          if (visited.has(key)) continue;
          visited.add(key);
          const nextTile = this.mapData[ny][nx];
          if (nextTile === 1 || nextTile === 5 || nextTile === WorldMapScene.TILE_HIDDEN_WALL) continue;
          queue.push([nx, ny]);
        }
      }

      if (tiles.length > 0) candidates.push({ tiles, hasReward });
    }

    if (candidates.length === 0) return [];
    const rewardRooms = candidates.filter(c => c.hasReward);
    const pool = rewardRooms.length > 0 ? rewardRooms : candidates;
    pool.sort((a, b) => a.tiles.length - b.tiles.length);
    return pool[0].tiles;
  }

  private revealHiddenWallTiles(hx: number, hy: number): void {
    const prefix = this.getTileThemePrefix();
    const roomTiles = this.findHiddenRoomTiles(hx, hy);
    for (const { rx, ry } of roomTiles) {
      if (this.tileGrid[ry]?.[rx]) {
        const tile = this.mapData[ry][rx];
        this.tileGrid[ry][rx].setTexture(`${prefix}-${tile}`);
        this.tileGrid[ry][rx].setAlpha(1);
      }
    }
    this.renderBanditLordMapSprite();
  }

  private isTileInsideUnrevealedHiddenRoom(x: number, y: number): boolean {
    for (let hy = 0; hy < this.mapData.length; hy++) {
      for (let hx = 0; hx < (this.mapData[hy]?.length ?? 0); hx++) {
        if (this.mapData[hy][hx] !== WorldMapScene.TILE_HIDDEN_WALL) continue;
        const hiddenFlag = `hidden.${this.currentMapId}.f${this.currentFloor}.${hx}.${hy}`;
        if (gameState.player.state.storyFlags[hiddenFlag]) continue;
        if (this.findHiddenRoomTiles(hx, hy).some(tile => tile.rx === x && tile.ry === y)) return true;
      }
    }
    return false;
  }

  private renderBanditLordMapSprite(): void {
    this.banditLordMapSprite?.destroy();
    this.banditLordMapSprite = undefined;
    if (this.currentMapId !== 'banditHideout') return;
    const def = mapDefs[this.currentMapId];
    if (this.currentFloor !== (def.floors ?? 1)) return;
    if (gameState.player.state.storyFlags['boss.banditLord.defeated']) return;
    if (!this.textures.exists('monster-banditLord')) return;

    for (let y = 0; y < this.mapData.length; y++) {
      for (let x = 0; x < (this.mapData[y]?.length ?? 0); x++) {
        if (this.mapData[y][x] !== 7) continue;
        if (this.isTileInsideUnrevealedHiddenRoom(x, y)) return;
        this.banditLordMapSprite = this.add.image(
          x * TILE_SIZE + TILE_SIZE / 2,
          y * TILE_SIZE + TILE_SIZE / 2,
          'monster-banditLord'
        ).setDepth(45).setScale(TILE_SIZE / 96);
        return;
      }
    }
  }

  private updateVisibleTiles(): void {
    if (!this.cullingEnabled || this.tileGrid.length === 0) return;
    const cam = this.cameras.main.worldView;
    const threshold = TILE_SIZE * 0.5;
    if (Math.abs(cam.x - this.lastCullCamX) < threshold && Math.abs(cam.y - this.lastCullCamY) < threshold) return;
    this.lastCullCamX = cam.x;
    this.lastCullCamY = cam.y;
    const buf = WorldMapScene.CULL_BUFFER;
    const minCol = Math.max(0, Math.floor(cam.x / TILE_SIZE) - buf);
    const maxCol = Math.min((this.tileGrid[0]?.length ?? 0) - 1, Math.ceil((cam.x + cam.width) / TILE_SIZE) + buf);
    const minRow = Math.max(0, Math.floor(cam.y / TILE_SIZE) - buf);
    const maxRow = Math.min(this.tileGrid.length - 1, Math.ceil((cam.y + cam.height) / TILE_SIZE) + buf);
    for (let y = 0; y < this.tileGrid.length; y++) {
      const row = this.tileGrid[y];
      const inRowRange = y >= minRow && y <= maxRow;
      for (let x = 0; x < row.length; x++) {
        row[x].setVisible(inRowRange && x >= minCol && x <= maxCol);
      }
    }
  }

  private static readonly FEMALE_NPCS = new Set([
    'villager1', 'wisewoman', 'blacksmith',
    'archaeologist', 'priestess',
    'herbalist', 'refugee', 'prophetess',
    'healer', 'frostGuard', 'frostVillager', 'hauntedGuard',
    'lavaMiner', 'frostSage', 'templeScholar', 'shadowWatcher',
    'skyKeeper',
  ]);

  private static readonly HEALER_PRICES: Record<string, number> = {
    greenhollow: 0, millbrook: 5, portSapphire: 8,
    ironkeep: 12, oasisHaven: 18, ruinsCamp: 18,
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
      const spriteKey = WorldMapScene.NPC_SPRITE_MAP[npc.id]
        ?? (WorldMapScene.FEMALE_NPCS.has(npc.id) ? 'npc-f' : 'npc');
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
      const sprite = this.add.sprite(
        def.savePoint.x * TILE_SIZE + TILE_SIZE / 2,
        def.savePoint.y * TILE_SIZE + TILE_SIZE / 2,
        'save-point'
      ).setOrigin(0.5).setScale(1);
      this.npcSprites.push(sprite);
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
      if (this.questOverlayOpen) { this.hideQuestOverlay(); return; }
      if (this.midCrystalOverlayOpen) { this.hideMidFloorCrystalMenu(); return; }
      if (this.warpOverlayOpen) { this.hideWarpMenu(); return; }
      if (this.healerOverlayOpen) { this.hideHealerOverlay(); return; }
      if (this.itemOverlayOpen) { this.hideFieldItemMenu(); return; }
      if (!this.showingMessage && !this.isMoving) {
        this.scene.launch('MenuScene');
        this.scene.pause();
      }
    });

    // Interact key
    this.input.keyboard?.on('keydown-Z', () => {
      if (this.questOverlayOpen) { this.confirmQuestOption(); return; }
      if (this.midCrystalOverlayOpen) { this.confirmMidFloorCrystalOption(); return; }
      if (this.warpOverlayOpen) { this.confirmWarpOption(); return; }
      if (this.healerOverlayOpen) { this.confirmHealerOption(); return; }
      if (this.itemOverlayOpen) { this.useFieldItem(); return; }
      if (this.showingMessage) { this.advanceDialog(); return; }
      this.interact();
    });
    this.input.keyboard?.on('keydown-ENTER', () => {
      if (this.questOverlayOpen) { this.confirmQuestOption(); return; }
      if (this.midCrystalOverlayOpen) { this.confirmMidFloorCrystalOption(); return; }
      if (this.warpOverlayOpen) { this.confirmWarpOption(); return; }
      if (this.healerOverlayOpen) { this.confirmHealerOption(); return; }
      if (this.itemOverlayOpen) { this.useFieldItem(); return; }
      if (this.showingMessage) { this.advanceDialog(); return; }
      this.interact();
    });

    // Close overlay
    this.input.keyboard?.on('keydown-X', () => {
      if (this.questOverlayOpen) { this.hideQuestOverlay(); return; }
      if (this.midCrystalOverlayOpen) { this.hideMidFloorCrystalMenu(); return; }
      if (this.warpOverlayOpen) { this.hideWarpMenu(); return; }
      if (this.healerOverlayOpen) { this.hideHealerOverlay(); return; }
      if (this.itemOverlayOpen) this.hideFieldItemMenu();
    });

    // Navigate overlay
    this.input.keyboard?.on('keydown-UP', () => {
      if (this.questOverlayOpen) { this.questOverlayIndex = Math.max(0, this.questOverlayIndex - 1); this.updateQuestOverlaySelection(); return; }
      if (this.midCrystalOverlayOpen) { this.midCrystalOverlayIndex = Math.max(0, this.midCrystalOverlayIndex - 1); this.updateMidFloorCrystalSelection(); return; }
      if (this.warpOverlayOpen) { this.warpOverlayIndex = Math.max(0, this.warpOverlayIndex - 1); this.updateWarpSelection(); return; }
      if (this.healerOverlayOpen) { this.healerOverlayIndex = Math.max(0, this.healerOverlayIndex - 1); this.updateHealerSelection(); return; }
      if (this.itemOverlayOpen && this.itemOverlayItems.length > 0) {
        this.itemOverlayIndex = Math.max(0, this.itemOverlayIndex - 1);
        this.updateFieldItemSelection();
      }
    });
    this.input.keyboard?.on('keydown-DOWN', () => {
      if (this.questOverlayOpen) { this.questOverlayIndex = Math.min(1, this.questOverlayIndex + 1); this.updateQuestOverlaySelection(); return; }
      if (this.midCrystalOverlayOpen) { this.midCrystalOverlayIndex = Math.min(1, this.midCrystalOverlayIndex + 1); this.updateMidFloorCrystalSelection(); return; }
      if (this.warpOverlayOpen) { this.warpOverlayIndex = Math.min(this.warpFloors.length, this.warpOverlayIndex + 1); this.updateWarpSelection(); return; }
      if (this.healerOverlayOpen) { this.healerOverlayIndex = Math.min(1, this.healerOverlayIndex + 1); this.updateHealerSelection(); return; }
      if (this.itemOverlayOpen && this.itemOverlayItems.length > 0) {
        this.itemOverlayIndex = Math.min(this.itemOverlayItems.length - 1, this.itemOverlayIndex + 1);
        this.updateFieldItemSelection();
      }
    });

    // Field item shortcut
    this.input.keyboard?.on('keydown-I', () => {
      if (!this.showingMessage && !this.isMoving && !this.itemOverlayOpen && !this.healerOverlayOpen && !this.questOverlayOpen) {
        this.showFieldItemMenu();
      }
    });
  }

  update(): void {
    this.updateCompass();
    this.updateVisibleTiles();
    this.renderMinimap();
    this.updateMinimapPlayerDot();
    this.updateLavaCourse();
    this.updateDarknessPulse();
    this.updateWindTower();
    this.updateMazeHunter();
    this.updatePoisonDot();
    this.updateTripwireGlow();

    if (this.isMoving || this.showingMessage || this.itemOverlayOpen || this.healerOverlayOpen
        || this.warpOverlayOpen || this.midCrystalOverlayOpen || this.questOverlayOpen) return;

    let dx = 0, dy = 0;
    let dir = 0;

    if (this.cursors.left.isDown) { dx = -1; dir = 1; }
    else if (this.cursors.right.isDown) { dx = 1; dir = 2; }
    else if (this.cursors.up.isDown) { dy = -1; dir = 3; }
    else if (this.cursors.down.isDown) { dy = 1; dir = 0; }
    else return;

    // Mirror mechanic inverts movement
    if (this.mirrorActive) {
      dx = -dx; dy = -dy;
      if (dir === 0) dir = 3;
      else if (dir === 3) dir = 0;
      else if (dir === 1) dir = 2;
      else if (dir === 2) dir = 1;
    }

    this.heroDir = dir;
    const newX = this.heroTileX + dx;
    const newY = this.heroTileY + dy;

    // Update hero frame for direction
    this.hero.setFrame(dir * 3);

    // Check for map transitions
    const transition = this.checkTransition(newX, newY);
    if (transition) {
      this.performTransition(transition);
      return;
    }

    // Forest maze boundary checks
    const currentDef = mapDefs[this.currentMapId];
    if (currentDef.mechanic === 'forest-maze') {
      const mapW = this.mapData[0]?.length ?? 0;
      const mapH = this.mapData.length;
      if (newX >= mapW && dx > 0) {
        if (this.heroTileY === this.forestMazeCorrectExitY) {
          if (this.currentFloor < (currentDef.floors ?? 1)) {
            this.currentFloor++;
            gameState.encounterManager.reset();
            this.loadMap(this.currentMapId);
            const h2 = this.mapData.length;
            this.heroTileX = 1; this.heroTileY = Math.floor(h2 / 2);
            this.hero.x = this.heroTileX * TILE_SIZE + TILE_SIZE / 2;
            this.hero.y = this.heroTileY * TILE_SIZE + TILE_SIZE / 2;
            this.updatePosition(); this.updateCamera();
            if (this.fogEnabled) this.updateFogVisibility();
            this.showMessage(t('dungeon.hauntedForest.floorTransition'));
          }
        } else {
          const isFloor1 = this.currentFloor === 1;
          this.heroTileX = isFloor1 ? Math.floor(mapW / 2) : 1;
          this.heroTileY = isFloor1 ? mapH - 2 : Math.floor(mapH / 2);
          this.hero.x = this.heroTileX * TILE_SIZE + TILE_SIZE / 2;
          this.hero.y = this.heroTileY * TILE_SIZE + TILE_SIZE / 2;
          this.updatePosition(); this.updateCamera();
          if (this.fogEnabled) this.updateFogVisibility();
          audioManager.playSfx('menu_cancel');
          this.showMessage(t('dungeon.hauntedForest.lost'));
        }
        return;
      }
      if (newX < 0 && this.currentFloor > 1) {
        this.currentFloor--;
        gameState.encounterManager.reset();
        this.loadMap(this.currentMapId);
        this.showMessage(t('dungeon.hauntedForest.floorBack'));
        return;
      }
      if (newY >= mapH && this.currentFloor === 1) {
        const conn = currentDef.connections[0];
        if (conn) {
          this.currentMapId = conn.targetMap; this.currentFloor = 1;
          this.loadMap(conn.targetMap);
          this.heroTileX = conn.toX; this.heroTileY = conn.toY;
          this.hero.x = this.heroTileX * TILE_SIZE + TILE_SIZE / 2;
          this.hero.y = this.heroTileY * TILE_SIZE + TILE_SIZE / 2;
          this.updatePosition(); this.updateCamera();
        }
        return;
      }
    }

    // Overworld signpost check
    if (mapDefs[this.currentMapId].type === 'overworld') {
      const owTile = this.mapData[newY]?.[newX];
      if (owTile === 11 || owTile === 20) {
        // Show signpost text (simplified — just show map names)
        this.showMessage(t('overworld.signpost'));
        return;
      }
    }

    if (!this.canMove(newX, newY)) {
      // NPC bump interaction
      const def = mapDefs[this.currentMapId];
      for (const npc of def.npcs) {
        if (npc.x === newX && npc.y === newY) {
          if (npc.id === 'healer') { this.handleHealer(); }
          else if (npc.id === 'shopkeeper') {
            this.scene.launch('ShopScene', { shopId: def.shopId });
            this.scene.pause();
          } else { this.handleNpcInteraction(npc); }
          return;
        }
      }
      // Shop counter bump
      if (def.shopId) {
        const sx = def.width - 4;
        if (newX === sx && newY === 12) {
          this.scene.launch('ShopScene', { shopId: def.shopId });
          this.scene.pause();
          return;
        }
      }
      // Healer counter bump
      if (def.type === 'town') {
        const hx = def.width - 13;
        if (newX === hx && newY === 12) { this.handleHealer(); return; }
      }
      // Try interact with faced tile (treasure, boss, plaque)
      const facedTile = this.mapData[newY]?.[newX];
      if (facedTile === WorldMapScene.TILE_PLAQUE) { this.interact(); return; }
      if (facedTile === 7) { this.interact(); return; }
      if (facedTile === 4) { this.tryOpenTreasure(newX, newY); return; }
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
        this.hero.x = Math.round(this.hero.x);
        this.hero.y = Math.round(this.hero.y);
        this.isMoving = false;
        this.onStep();
        this.updatePosition();
        if (this.fogEnabled) this.updateFogVisibility();
        this.handleTorchPickup();
        this.handleIceSlide(dx, dy);
        this.handleQuicksandPull();
        this.handleLavaDamage();
        this.updateMirrorState();
      },
    });
  }

  private canMove(x: number, y: number): boolean {
    if (y < 0 || y >= this.mapData.length || x < 0 || x >= this.mapData[0].length) return false;
    const tile = this.mapData[y][x];
    const def = mapDefs[this.currentMapId];

    let passable = false;
    if (def.type === 'overworld' || def.type === 'portal-overworld') {
      passable = tile !== 2 && tile !== 4 && tile !== 6 && tile !== 7 && tile !== 8
        && tile !== 9 && tile !== 10 && tile !== 11 && tile !== 12 && tile !== 14
        && tile !== 15 && tile !== 16 && tile !== 19 && tile !== 20;
      // Bridge (tile 13) passable only after storm harpy defeated
      if (tile === 13) passable = !!gameState.player.state.storyFlags['boss.stormHarpy.defeated'];
    } else if (def.type === 'town') {
      passable = tile !== 1 && tile !== 2 && tile !== 4 && tile !== 6 && tile !== 8
        && tile !== 9 && tile !== 10 && tile !== 11 && tile !== 12
        && tile !== 13 && tile !== 14 && tile !== 15;
    } else {
      // Dungeon: walls, lava, treasure chests, boss tiles, plaques, crystal pillars, key-chests impassable
      passable = tile !== 1 && tile !== 5 && tile !== 4 && tile !== 7
        && tile !== WorldMapScene.TILE_PLAQUE && tile !== WorldMapScene.TILE_CRYSTAL_PILLAR && tile !== 28;

      // Crystal save tile blocks movement
      if (tile === WorldMapScene.TILE_CRYSTAL_SAVE) passable = false;

      // Lava passable during safe phase in lava-course
      if (tile === 5 && def.mechanic === 'lava-course' && this.lavaPhase) passable = true;

      // Hidden wall is passable
      if (tile === WorldMapScene.TILE_HIDDEN_WALL) passable = true;

      // Key door: unlock if player has key
      if (tile === WorldMapScene.TILE_KEY_DOOR) {
        const keyItem = `dungeonKey_${this.currentMapId}`;
        if (gameState.player.state.inventory.some(s => s.itemId === keyItem && s.quantity > 0)) {
          gameState.player.removeItem(keyItem, 1);
          const prefix = this.getTileThemePrefix();
          const w = this.mapData[0].length;
          const cells: [number, number][] = [[x, y]];
          for (const [dx, dy] of [[0, -1], [0, 1], [-1, 0], [1, 0]]) {
            const nx = x + dx, ny = y + dy;
            if (ny >= 0 && ny < this.mapData.length && nx >= 0 && nx < w && this.mapData[ny][nx] === WorldMapScene.TILE_KEY_DOOR)
              cells.push([nx, ny]);
          }
          for (const [cx, cy] of cells) {
            this.mapData[cy][cx] = 0;
            if (this.tileGrid[cy]?.[cx]) this.tileGrid[cy][cx].setTexture(`${prefix}-0`);
            gameState.player.state.storyFlags[`door.${this.currentMapId}.f${this.currentFloor}.${cx}.${cy}`] = true;
          }
          this.showMessage(t('dungeon.doorUnlocked'));
          passable = true;
        } else {
          this.showMessage(t('dungeon.doorNeedKey'));
          passable = false;
        }
      }

      // Wind barrier: unlock if player has windbreaker stone
      if (tile === WorldMapScene.TILE_WIND_BARRIER) {
        const windItem = `windbreakerStone_${this.currentMapId}`;
        if (gameState.player.state.inventory.some(s => s.itemId === windItem && s.quantity > 0)) {
          gameState.player.removeItem(windItem, 1);
          const prefix = this.getTileThemePrefix();
          const w = this.mapData[0].length;
          const cells: [number, number][] = [[x, y]];
          for (const [dx, dy] of [[0, -1], [0, 1], [-1, 0], [1, 0]]) {
            const nx = x + dx, ny = y + dy;
            if (ny >= 0 && ny < this.mapData.length && nx >= 0 && nx < w && this.mapData[ny][nx] === WorldMapScene.TILE_WIND_BARRIER)
              cells.push([nx, ny]);
          }
          for (const [cx, cy] of cells) {
            this.mapData[cy][cx] = 0;
            if (this.tileGrid[cy]?.[cx]) this.tileGrid[cy][cx].setTexture(`${prefix}-0`);
            gameState.player.state.storyFlags[`door.${this.currentMapId}.f${this.currentFloor}.${cx}.${cy}`] = true;
          }
          this.showMessage(t('dungeon.windCalmed'));
          passable = true;
        } else {
          passable = false;
        }
      }

      // Crystal wall blocks
      if (tile === WorldMapScene.TILE_CRYSTAL_WALL) passable = false;
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
    const previousPosition = {
      mapId: this.currentMapId,
      x: this.heroTileX,
      y: this.heroTileY,
      floor: this.currentFloor,
    };
    this.isMoving = true;
    this.cameras.main.resetFX();
    this.cameras.main.fadeOut(200, 0, 0, 0);
    this.cameras.main.once('camerafadeoutcomplete', () => {
      try {
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
      } catch (error) {
        console.error('Map transition failed', error);
        this.currentMapId = previousPosition.mapId;
        this.currentFloor = previousPosition.floor;
        this.heroTileX = previousPosition.x;
        this.heroTileY = previousPosition.y;
        try {
          this.loadMap(previousPosition.mapId);
          this.updatePosition();
          this.updateCamera();
        } catch (fallbackError) {
          console.error('Map transition recovery failed', fallbackError);
        }
      } finally {
        this.isMoving = false;
        this.cameras.main.fadeIn(200, 0, 0, 0);
      }
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

  private onStep(): void {
    this.stepCount++;
    const def = mapDefs[this.currentMapId];

    // Dungeon tile effects
    if (def.type === 'dungeon') {
      const tile = this.mapData[this.heroTileY]?.[this.heroTileX];

      // Hidden wall reveal
      if (tile === WorldMapScene.TILE_HIDDEN_WALL) {
        const hiddenFlag = `hidden.${this.currentMapId}.f${this.currentFloor}.${this.heroTileX}.${this.heroTileY}`;
        if (!gameState.player.state.storyFlags[hiddenFlag]) {
          gameState.player.state.storyFlags[hiddenFlag] = true;
          audioManager.playSfx('treasure_open');
          this.showMessage(t('dungeon.hiddenWall'));
          this.revealHiddenWallTiles(this.heroTileX, this.heroTileY);
        }
      }

      // Shadow portal teleport (tile 29)
      if (tile === WorldMapScene.TILE_SHADOW_PORTAL && this.shadowPortalEnabled && !this.portalCooldown) {
        const posKey = `${this.heroTileX},${this.heroTileY}`;
        for (const pair of this.portalPairs) {
          const keyA = `${pair.a.x},${pair.a.y}`;
          const keyB = `${pair.b.x},${pair.b.y}`;
          let dest: { x: number; y: number } | null = null;
          if (posKey === keyA) dest = pair.b;
          else if (posKey === keyB) dest = pair.a;
          if (dest) {
            this.portalCooldown = true;
            this.isMoving = true;
            this.cameras.main.fadeOut(300, 0, 0, 0);
            this.cameras.main.once('camerafadeoutcomplete', () => {
              this.heroTileX = dest!.x; this.heroTileY = dest!.y;
              this.hero.x = this.heroTileX * TILE_SIZE + TILE_SIZE / 2;
              this.hero.y = this.heroTileY * TILE_SIZE + TILE_SIZE / 2;
              this.updatePosition(); this.updateCamera();
              if (this.fogEnabled) this.updateFogVisibility();
              this.cameras.main.fadeIn(300, 0, 0, 0);
              audioManager.playSfx('crystal_obtain');
              this.showMessage(t('dungeon.twilightDungeon.portal'));
              this.isMoving = false;
              this.time.delayedCall(500, () => { this.portalCooldown = false; });
            });
            break;
          }
        }
      }

      // Reset portal cooldown when stepping off
      if (tile !== WorldMapScene.TILE_SHADOW_PORTAL && this.portalCooldown) {
        this.portalCooldown = false;
      }

      // Spike trap (tile 30 = armed, tile 32 = sprung)
      if (tile === WorldMapScene.TILE_SPIKE_TRAP || tile === WorldMapScene.TILE_SPIKE_SPRUNG) {
        const dmg = Math.max(1, Math.floor(gameState.player.totalMaxHp * 0.2));
        gameState.player.state.hp = Math.max(1, gameState.player.state.hp - dmg);
        this.updateHUD();
        this.cameras.main.shake(150, 0.01);
        // Disarm spike after first trigger
        if (tile === WorldMapScene.TILE_SPIKE_TRAP) {
          this.mapData[this.heroTileY][this.heroTileX] = WorldMapScene.TILE_SPIKE_SPRUNG;
          const prefix = this.getTileThemePrefix();
          if (this.tileGrid[this.heroTileY]?.[this.heroTileX])
            this.tileGrid[this.heroTileY][this.heroTileX].setTexture(`${prefix}-32`);
        }
        const flash = this.add.rectangle(UI_OFFSET_X + GAME_WIDTH / 2, UI_OFFSET_Y + GAME_HEIGHT / 2,
          GAME_WIDTH * 2, GAME_HEIGHT * 2, 0xff3322).setDepth(200).setScrollFactor(0).setAlpha(0.4);
        this.tweens.add({ targets: flash, alpha: 0, duration: 400, onComplete: () => flash.destroy() });
        this.showMessage(t('dungeon.banditHideout.spikeTrap'));
      }

      // Tripwire (tile 31)
      if (tile === WorldMapScene.TILE_TRIPWIRE) {
        this.clearTripwireCluster(this.heroTileX, this.heroTileY);
        (gameState.player.state as any).poisonedUntil = Date.now() + 20000;
        this.lastPoisonTickWallTime = Date.now();
        (gameState.player.state as any).poisonLastTickWallTime = this.lastPoisonTickWallTime;
        this.cameras.main.shake(200, 0.015);
        const poisonColors = [0x44aa02, 0x66bb44, 0x22a544];
        for (let i = 0; i < 3; i++) {
          const pf = this.add.rectangle(UI_OFFSET_X + GAME_WIDTH / 2, UI_OFFSET_Y + GAME_HEIGHT / 2,
            GAME_WIDTH * 2, GAME_HEIGHT * 2, poisonColors[i]).setDepth(200).setScrollFactor(0).setAlpha(0);
          this.tweens.add({ targets: pf, alpha: 0.3, duration: 150, delay: i * 220, yoyo: true, onComplete: () => pf.destroy() });
        }
        this.showMessage(t('dungeon.banditHideout.tripwire'));
      }
    }

    // Maze hunter step tracking
    if (this.mazeHunterEnabled && !this.mazeHunterDefeated) {
      this.mazeHunterStepCount++;
      if (this.mazeHunterActive && this.mazeHunterBossTileX === this.heroTileX && this.mazeHunterBossTileY === this.heroTileY) {
        this.triggerMazeHunterBattle();
        return;
      }
    }

    // Darkness patrol collision check
    if (this.checkDarknessPatrolCollision()) {
      this.isMoving = true;
      this.showMessage(t('dungeon.shadowCave.patrolCaught'));
      this.time.delayedCall(500, () => { this.startBattle(monsters.shadowWisp); });
      return;
    }

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
    if (this.heroDir === 0) facedY += 1;
    else if (this.heroDir === 1) facedX -= 1;
    else if (this.heroDir === 2) facedX += 1;
    else if (this.heroDir === 3) facedY -= 1;

    if (def.type === 'dungeon' && this.mapData[facedY]?.[facedX] === WorldMapScene.TILE_TRIPWIRE) {
      this.clearTripwireCluster(facedX, facedY);
      audioManager.playSfx('menu_select');
      const flash = this.add.rectangle(UI_OFFSET_X + GAME_WIDTH / 2, UI_OFFSET_Y + GAME_HEIGHT / 2,
        GAME_WIDTH * 2, GAME_HEIGHT * 2, 0xffe244).setDepth(200).setScrollFactor(0).setAlpha(0.22);
      this.tweens.add({ targets: flash, alpha: 0, duration: 350, onComplete: () => flash.destroy() });
      this.showMessage(t('dungeon.banditHideout.tripwireCut'));
      return;
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
        if (npc.id === 'healer') { this.handleHealer(); return; }
        this.handleNpcInteraction(npc);
        return;
      }
    }

    // Crystal save / plaque interaction
    if (this.tryReadPlaque(facedX, facedY)) return;

    // Crystal save tile interaction
    if (def.type === 'dungeon' && facedY >= 0 && facedY < this.mapData.length && facedX >= 0 && facedX < this.mapData[0].length
        && this.mapData[facedY][facedX] === WorldMapScene.TILE_CRYSTAL_SAVE) {
      if (this.currentFloor === 1) {
        const totalFloors = def.floors ?? 1;
        const warpFloors: number[] = [];
        for (let f = 2; f <= totalFloors; f++) {
          if (gameState.player.state.storyFlags[`warp.${this.currentMapId}.f${f}`]) warpFloors.push(f);
        }
        if (def.bossId && gameState.player.state.storyFlags[`warp.${this.currentMapId}.boss`]) warpFloors.push(-1);
        if (warpFloors.length > 0) {
          this.showWarpMenu(warpFloors, totalFloors);
        } else {
          gameState.saveGame(); audioManager.playSfx('save');
          gameState.player.fullHeal(); this.updateHUD();
          this.showMessage(t('dungeon.crystalSaveEntrance'));
        }
      } else {
        const warpFlag = `warp.${this.currentMapId}.f${this.currentFloor}`;
        if (!gameState.player.state.storyFlags[warpFlag]) gameState.player.state.storyFlags[warpFlag] = true;
        gameState.player.state.storyFlags[`entrance.crystal.${this.currentMapId}.visible`] = true;
        gameState.saveGame(); audioManager.playSfx('save');
        gameState.player.fullHeal(); this.updateHUD();
        this.showMidFloorCrystalMenu();
      }
      return;
    }

    // Check if facing a boss tile
    if (this.tryBossInteract(facedX, facedY)) return;

    // Check if facing a treasure chest
    if (this.tryOpenTreasure(facedX, facedY)) return;

    // Fallback: check save point within ±1 range
    if (def.savePoint) {
      if (Math.abs(def.savePoint.x - this.heroTileX) <= 1 && Math.abs(def.savePoint.y - this.heroTileY) <= 1) {
        gameState.saveGame(); audioManager.playSfx('save');
        this.showMessage(t('npc.savePoint'));
        gameState.player.fullHeal(); this.updateHUD();
        return;
      }
    }

    // Fallback: check treasure chests in all adjacent tiles
    const dirs = [[0, -1], [0, 1], [-1, 0], [1, 0]];
    for (const [dx, dy] of dirs) {
      if (this.tryOpenTreasure(this.heroTileX + dx, this.heroTileY + dy)) return;
    }

    // Check shop
    if (def.shopId) {
      const sx = def.width - 4;
      if (this.heroTileX === sx && this.heroTileY === 13 && this.heroDir === 3) {
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
    const posKey = `${x},${y}`;
    if (this.keyChestPositions.has(posKey)) {
      gameState.player.addItem(`dungeonKey_${this.currentMapId}`, 1);
      this.showMessage(t('dungeon.keyFound'));
      this.updateHUD();
      return true;
    }

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

  private showMessage(text: string, speaker?: string): void {
    this.showingMessage = true;

    const msgW = GAME_WIDTH - Math.round(16 * S);
    const padX = Math.round(12 * S);
    const padY = Math.round(10 * S);
    const contentW = msgW - padX * 2;
    const fontSize = Math.round(11 * S);
    const speakerH = speaker ? Math.round(16 * S) : 0;

    // Measure text height
    this.messageText = this.add.text(0, 0, text, {
      fontSize: `${fontSize}px`, color: COLORS.TEXT_WHITE, fontFamily: FONT_FAMILY,
      wordWrap: { width: contentW },
    }).setDepth(101).setScrollFactor(0);
    const textH = this.messageText.height;
    const boxH = Math.max(Math.round(48 * S), textH + padY * 2 + speakerH);
    const boxCenterY = UI_OFFSET_Y + GAME_HEIGHT - Math.round(8 * S) - boxH / 2;

    this.messageBox = this.add.rectangle(
      UI_OFFSET_X + GAME_WIDTH / 2, boxCenterY,
      msgW, boxH,
      COLORS.MENU_BG, 0.9
    ).setDepth(100).setStrokeStyle(1, COLORS.MENU_BORDER).setScrollFactor(0);

    const textX = UI_OFFSET_X + GAME_WIDTH / 2 - msgW / 2 + padX;
    const textY = boxCenterY - boxH / 2 + padY + speakerH;
    this.messageText.setPosition(textX, textY);

    if (speaker) {
      this.messageSpeaker = this.add.text(textX, boxCenterY - boxH / 2 + Math.round(4 * S), speaker, {
        fontSize: `${Math.round(10 * S)}px`, color: COLORS.TEXT_YELLOW, fontFamily: FONT_FAMILY,
      }).setDepth(101).setScrollFactor(0);
    }
  }

  private hideMessage(): void {
    this.showingMessage = false;
    this.messageBox?.destroy();
    this.messageSpeaker?.destroy();
    this.messageText?.destroy();
  }

  private showDialogSequence(messages: string[], onComplete?: () => void, speaker?: string): void {
    this.dialogQueue = messages.slice(1);
    this.dialogCallback = onComplete;
    this.dialogSpeaker = speaker;
    this.showMessage(messages[0], speaker);
  }

  private advanceDialog(): void {
    this.hideMessage();
    if (this.dialogQueue.length > 0) {
      const next = this.dialogQueue.shift()!;
      this.showMessage(next, this.dialogSpeaker);
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
    this.minimapGfx?.destroy();
    this.minimapGfx = undefined;
    this.minimapPlayerDot?.destroy();
    this.minimapPlayerDot = undefined;

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
      if (totalFloors > 1 && def.tileTheme !== 'forest') {
        const isGate = def.connections.length > 1;
        const midpoint = Math.ceil(totalFloors / 2);
        const displayFloor = (isGate && this.currentFloor > midpoint)
          ? totalFloors - this.currentFloor + 1
          : this.currentFloor;
        if (def.mechanic === 'wind') {
          label += ` — ${displayFloor}F`;
        } else {
          label += def.castle ? ` — ${displayFloor}F` : ` — B${displayFloor}F`;
        }
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
    this.renderMinimap();
  }

  private updateCamera(): void {
    const mapW = this.mapData[0]?.length ?? 16;
    const mapH = this.mapData.length;
    this.cameras.main.setBounds(0, 0, mapW * TILE_SIZE, mapH * TILE_SIZE);
    this.cameras.main.startFollow(this.hero, true, 0.09, 0.09);
    // Snap camera to hero immediately on map load (avoid initial lerp drift)
    this.cameras.main.centerOn(this.hero.x, this.hero.y);
    this.updateHUD();
    this.updateVisibleTiles();
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

      if (bossTileX < 0 && bossId === 'swordWraith') {
        // Sword Wraith is the moving Maze Hunter boss, so there may be no static boss tile to dissolve.
        audioManager.playSfx('crystal_obtain');
        gameState.player.addItem('excalibur', 1);
        gameState.player.equip('excalibur');
        if (this.mazeHunterEnabled) {
          this.mazeHunterDefeated = true;
          this.mazeHunterActive = false;
          if (this.mazeHunterBossSprite) {
            this.tweens.add({
              targets: this.mazeHunterBossSprite,
              alpha: 0,
              duration: 500,
              onComplete: () => {
                this.mazeHunterBossSprite?.destroy();
                this.mazeHunterBossSprite = undefined;
              },
            });
          }
          this.unsealMazeHunterExit();
        }
        this.time.delayedCall(200, () => {
          const defeatMsg = t(`dungeon.${this.currentMapId}.boss.defeat`);
          const victoryMsg = t(`dungeon.${this.currentMapId}.victory`);
          const onDone = () => { this.isMoving = false; this.updateHUD(); };
          this.showDialogSequence([defeatMsg, t('legendary.excalibur.obtained'), victoryMsg], onDone);
        });
        return;
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
          this.banditLordMapSprite?.destroy();
          this.banditLordMapSprite = undefined;
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

  private getOverworldCoordsForTarget(
    type: QuestObjective['type'],
    targetId: string,
    quest?: QuestDefinition,
  ): { ox: number; oy: number } | null {
    const overworld = mapDefs.overworld;
    if (!overworld) return null;

    const coordsForMap = (mapId: string): { ox: number; oy: number } | null => {
      const conn = overworld.connections.find(c => c.targetMap === mapId);
      return conn ? { ox: conn.fromX, oy: conn.fromY } : null;
    };

    const townForNpc = (npcId: string): string | null => {
      for (const def of Object.values(mapDefs)) {
        if (def.type === 'town' && def.npcs.some(npc => npc.id === npcId)) return def.id;
      }
      return null;
    };

    if (type === 'visit') return coordsForMap(targetId);
    if (type === 'talk') {
      const mapId = townForNpc(targetId);
      return mapId ? coordsForMap(mapId) : null;
    }
    if (type === 'defeat') {
      for (const def of Object.values(mapDefs)) {
        if (def.type === 'dungeon' && def.bossId === targetId) return coordsForMap(def.id);
      }
      for (const def of Object.values(mapDefs)) {
        if (def.type !== 'dungeon' || !def.encounterZone) continue;
        if (encounterZones[def.encounterZone]?.monsters?.some(m => m.monsterId === targetId)) {
          const coords = coordsForMap(def.id);
          if (coords) return coords;
        }
      }
      if (quest) {
        for (const objective of quest.objectives) {
          if (objective.type === 'visit') {
            const coords = coordsForMap(objective.targetId);
            if (coords) return coords;
          }
        }
        if (quest.turnInMapId) return coordsForMap(quest.turnInMapId);
      }
      return null;
    }
    if (type === 'collect') {
      if (quest) {
        for (const objective of quest.objectives) {
          if (objective.type === 'visit') {
            const coords = coordsForMap(objective.targetId);
            if (coords) return coords;
          }
        }
        for (const objective of quest.objectives) {
          if (objective.type === 'defeat') {
            const coords = this.getOverworldCoordsForTarget('defeat', objective.targetId, quest);
            if (coords) return coords;
          }
        }
        if (quest.turnInMapId) return coordsForMap(quest.turnInMapId);
      }
      return null;
    }

    return null;
  }

  private getCompassTarget(): { ox: number; oy: number } | null {
    const state = gameState.player.state;
    const questManager = gameState.questManager;

    for (const questId of state.activeQuests) {
      const quest = questDefinitions[questId];
      if (!quest) continue;
      if (questManager.isQuestReady(questId, state)) {
        if (quest.turnInMapId) {
          const coords = this.getOverworldCoordsForTarget('visit', quest.turnInMapId);
          if (coords) return coords;
        }
        continue;
      }
      const progress = state.questProgress[questId] ?? {};
      for (const objective of quest.objectives) {
        const needed = objective.count ?? 1;
        if ((progress[objective.targetId] ?? 0) < needed) {
          const coords = this.getOverworldCoordsForTarget(objective.type, objective.targetId, quest);
          if (coords) return coords;
          if (objective.type === 'defeat' && quest.turnInMapId) {
            const fallback = this.getOverworldCoordsForTarget('visit', quest.turnInMapId);
            if (fallback) return fallback;
          }
          break;
        }
      }
    }

    const flags = state.storyFlags;
    // Find the index of the latest completed waypoint in the chain.
    let latestDoneIdx = -1;
    for (let i = 0; i < COMPASS_CHAIN.length; i++) {
      if (flags[COMPASS_CHAIN[i].doneFlag]) latestDoneIdx = i;
    }
    // Return the first incomplete waypoint after the latest completed one.
    for (let i = latestDoneIdx + 1; i < COMPASS_CHAIN.length; i++) {
      const waypoint = COMPASS_CHAIN[i];
      if (!flags[waypoint.doneFlag]) {
        const questGate = waypoint.questGate;
        if (questGate && !state.activeQuests.includes(questGate) && !state.completedQuests.includes(questGate)) continue;
        return { ox: waypoint.ox, oy: waypoint.oy };
      }
    }
    return null;
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

  // ── Minimap ──

  private renderMinimap(): void {
    const def = mapDefs[this.currentMapId];
    if (!(def.type === 'overworld' || def.type === 'portal-overworld')) {
      this.minimapGfx?.destroy(); this.minimapGfx = undefined;
      this.minimapPlayerDot?.destroy(); this.minimapPlayerDot = undefined;
      return;
    }
    const now = this.time.now;
    if (this.minimapGfx && now - this.lastMinimapUpdate < 300) return;
    this.lastMinimapUpdate = now;
    if (!this.minimapGfx) this.minimapGfx = this.add.graphics().setDepth(100).setScrollFactor(0);
    if (!this.minimapPlayerDot) this.minimapPlayerDot = this.add.graphics().setDepth(101).setScrollFactor(0);
    const gfx = this.minimapGfx;
    gfx.clear();
    const mapH = this.mapData.length, mapW = this.mapData[0]?.length ?? 0;
    if (mapW === 0 || mapH === 0) return;
    const viewTiles = 80;
    const mmSize = Math.round(100 * S);
    const sc = mmSize / viewTiles;
    const mmX = UI_OFFSET_X + Math.round(8 * S);
    const mmY = UI_OFFSET_Y + Math.round(40 * S);
    const half = Math.floor(viewTiles / 2);
    const startTX = Math.max(0, Math.min(mapW - viewTiles, this.heroTileX - half));
    const startTY = Math.max(0, Math.min(mapH - viewTiles, this.heroTileY - half));
    this.minimapMeta = { mmX, mmY, scale: sc, startTX, startTY, size: mmSize };
    gfx.fillStyle(0x111122, 0.9);
    gfx.fillRect(mmX - 2, mmY - 2, mmSize + 4, mmSize + 4);
    const endX = Math.min(mapW, startTX + viewTiles);
    const endY = Math.min(mapH, startTY + viewTiles);
    const colorMap: Record<number, number> = {
      0: 0x337733, 1: 0xaaaa66, 2: 0x1a3466, 3: 0x226622, 4: 0x666666,
      5: 0x885533, 6: 0xffcc00, 7: 0xcc5533, 8: 0x993ccc, 9: 0x33cc4c,
      10: 0x226622, 11: 0x885533, 18: 0xe0d0dc, 19: 0xd49c00, 20: 0x885533,
      12: 0xcc5533, 13: 0x99aedd, 14: 0x1a4a0a, 15: 0x448acc, 16: 0x88aacc, 17: 0xd9226e,
    };
    for (let ry = startTY; ry < endY; ry++) {
      for (let rx = startTX; rx < endX; rx++) {
        const tile = this.mapData[ry]?.[rx] ?? 2;
        const c = colorMap[tile] ?? 0x111111;
        const px = mmX + (rx - startTX) * sc;
        const py = mmY + (ry - startTY) * sc;
        if (tile === 6 || tile === 7 || tile === 9 || tile === 10 || tile === 12 || tile === 15 || tile === 16) {
          gfx.fillStyle(c, 1);
          gfx.fillRect(px - sc * 0.5, py - sc * 0.5, sc * 2, sc * 2);
        } else if (tile === 8) {
          gfx.fillStyle(c, 1);
          gfx.fillRect(px - sc, py - sc, sc * 3, sc * 3);
        } else {
          gfx.fillStyle(c, 1);
          gfx.fillRect(px, py, Math.ceil(sc), Math.ceil(sc));
        }
      }
    }
    gfx.lineStyle(2, 0xaaaa66, 1);
    gfx.strokeRect(mmX - 2, mmY - 2, mmSize + 4, mmSize + 4);
    this.updateMinimapPlayerDot();
  }

  private updateMinimapPlayerDot(): void {
    if (!this.minimapPlayerDot) return;
    const { mmX, mmY, scale } = this.minimapMeta;
    if (scale === 0) return;
    const mapH = this.mapData.length, mapW = this.mapData[0]?.length ?? 0;
    const viewTiles = 80;
    const half = Math.floor(viewTiles / 2);
    const startTX = Math.max(0, Math.min(mapW - viewTiles, this.heroTileX - half));
    const startTY = Math.max(0, Math.min(mapH - viewTiles, this.heroTileY - half));
    if (startTX !== this.minimapMeta.startTX || startTY !== this.minimapMeta.startTY) {
      this.minimapMeta.startTX = startTX;
      this.minimapMeta.startTY = startTY;
      this.lastMinimapUpdate = 0;
    }
    const dot = this.minimapPlayerDot;
    dot.clear();
    const size = this.minimapMeta.size ?? 100;
    const px = mmX + (this.heroTileX - startTX) * scale;
    const py = mmY + (this.heroTileY - startTY) * scale;
    const cx = Math.max(mmX, Math.min(mmX + size - 2, px));
    const cy = Math.max(mmY, Math.min(mmY + size - 2, py));
    dot.fillStyle(0xffff00, 1);
    dot.fillRect(cx - 1, cy - 1, 3, 3);
  }

  // ── Crystal Shard Animation ──

  private showCrystalShardAnimation(tileX: number, tileY: number, color: number): void {
    const cx = tileX * TILE_SIZE + TILE_SIZE / 2;
    const cy = tileY * TILE_SIZE + TILE_SIZE / 2;
    const glow = this.add.rectangle(cx, cy, TILE_SIZE + 4, TILE_SIZE + 4, color, 0.4).setDepth(94);
    this.tweens.add({ targets: glow, alpha: { from: 0.4, to: 0.1 }, scaleX: { from: 1, to: 1.8 }, scaleY: { from: 1, to: 1.8 }, duration: 600, ease: 'Power2' });
    const shard = this.add.rectangle(cx, cy, 8, 12, color).setDepth(95);
    this.tweens.add({ targets: shard, y: cy - 40, scaleX: 1.5, scaleY: 1.5, alpha: { from: 1, to: 0.8 }, duration: 600, ease: 'Power2', onComplete: () => { shard.destroy(); glow.destroy(); } });
  }

  // ── Progressive Dialogue ──

  private getProgressiveDialogue(npc: { dialogueKey: string }): string {
    const flags = gameState.player.state.storyFlags;
    const stages = [
      { flag: 'boss.demonKing.defeated', suffix: '.act5done' },
      { flag: 'boss.dragon.defeated', suffix: '.act3' },
      { flag: 'boss.serpent.defeated', suffix: '.act2' },
    ];
    for (const { flag, suffix } of stages) {
      if (flags[flag]) {
        const key = npc.dialogueKey + suffix;
        const msg = t(key);
        if (msg !== `[${key}]`) return msg;
      }
    }
    return t(npc.dialogueKey);
  }

  private getNpcDisplayName(npcId: string): string | undefined {
    const key = WorldMapScene.NPC_NAME_KEYS[npcId];
    if (!key) return undefined;
    const name = t(key);
    return name !== `[${key}]` ? name : undefined;
  }

  // ── Quest-Aware NPC Interaction ──

  private handleNpcInteraction(npc: { id: string; dialogueKey: string; x: number; y: number }): void {
    const qm = gameState.questManager;
    const state = gameState.player.state;
    const speaker = this.getNpcDisplayName(npc.id);
    const npcBase = `${npc.dialogueKey}`.replace('.greeting', '');

    const activeQuests = qm.getActiveQuests(state);

    // Check for quest turn-in
    const readyQuests = activeQuests.filter(q => q.turnInNpcId === npc.id && qm.isQuestReady(q.id, state));
    if (readyQuests.length > 0) {
      const quest = readyQuests[0];
      const completeKey = `${npcBase}.questComplete`;
      const completeMsg = t(completeKey);
      const msgs = completeMsg !== `[${completeKey}]` ? [completeMsg] : [t('quest.complete', { title: t(quest.titleKey) })];
      this.showDialogSequence(msgs, () => {
        const rewards = qm.completeQuest(quest.id, state);
        this.applyQuestRewards(rewards);
        this.updateHUD();
        this.showQuestCompleteNotification(t(quest.titleKey), rewards);
      }, speaker);
      return;
    }

    // Check for talk objectives
    const talkQuests = activeQuests.filter(q => {
      const progress = state.questProgress[q.id] ?? {};
      return q.objectives.some(o => o.type === 'talk' && o.targetId === npc.id && (progress[o.targetId] ?? 0) < (o.count ?? 1));
    });
    if (talkQuests.length > 0) {
      const completed = qm.updateProgress(state, 'talk', npc.id, 1);
      if (completed.length > 0) {
        this.showMessage(t('quest.objectivesComplete'), speaker);
      } else {
        this.showMessage(this.getProgressiveDialogue(npc), speaker);
      }
      return;
    }

    // Quest giver reminder
    const giverQuests = activeQuests.filter(q => (q.giverNpcId ?? q.turnInNpcId) === npc.id);
    if (giverQuests.length > 0) {
      const reminderKey = `${npcBase}.questReminder`;
      const reminder = t(reminderKey);
      if (reminder !== `[${reminderKey}]`) { this.showMessage(reminder, speaker); }
      else { this.showMessage(t(giverQuests[0].descriptionKey), speaker); }
      return;
    }

    // Check for completed quests with follow-up
    const hasCompletedQuest = state.completedQuests.some(qId => {
      const q = questDefinitions[qId];
      return q && (q.giverNpcId ?? q.turnInNpcId) === npc.id;
    });
    if (hasCompletedQuest) {
      const available = qm.getAvailableQuests(state, npc.id);
      if (available.length > 0) {
        const quest = available[0];
        const offerKey = `${npcBase}.questOffer`;
        const offerMsg = t(offerKey);
        const msgs: string[] = [];
        if (offerMsg !== `[${offerKey}]`) msgs.push(offerMsg);
        if (msgs.length === 0) msgs.push(t(quest.descriptionKey));
        this.showDialogSequence(msgs, () => {
          qm.startQuest(quest.id, state);
          qm.updateProgress(state, 'talk', npc.id, 1);
          this.showQuestNotification(t('quest.newQuest', { title: t(quest.titleKey) }));
        }, speaker);
        return;
      }
      const postKey = `${npcBase}.postQuest`;
      const postMsg = t(postKey);
      if (postMsg !== `[${postKey}]`) { this.showMessage(postMsg, speaker); }
      else { this.showMessage(t('npc.postQuestGeneric') || '...', speaker); }
      return;
    }

    // New quest available
    const available = qm.getAvailableQuests(state, npc.id);
    if (available.length > 0) {
      const quest = available[0];
      const greetKey = `${npcBase}.greeting`;
      const greetMsg = t(greetKey);
      const offerKey = `${npcBase}.questOffer`;
      const offerMsg = t(offerKey);
      const msgs: string[] = [];
      if (greetMsg !== `[${greetKey}]`) msgs.push(greetMsg);
      if (offerMsg !== `[${offerKey}]`) msgs.push(offerMsg);
      if (msgs.length === 0) msgs.push(t(quest.descriptionKey));
      this.showDialogSequence(msgs, () => {
        qm.startQuest(quest.id, state);
        qm.updateProgress(state, 'talk', npc.id, 1);
        this.showQuestNotification(t('quest.newQuest', { title: t(quest.titleKey) }));
      }, speaker);
      return;
    }

    // Default dialogue
    this.showMessage(this.getProgressiveDialogue(npc), speaker);
  }

  private applyQuestRewards(rewards: { exp?: number; gold?: number; items?: { itemId: string; quantity: number }[] }): void {
    if (rewards.exp) gameState.player.addExp(rewards.exp);
    if (rewards.gold) gameState.player.state.gold += rewards.gold;
    if (rewards.items) {
      for (const item of rewards.items) gameState.player.addItem(item.itemId, item.quantity);
    }
  }

  private showQuestNotification(text: string): void {
    this.questNotifText?.destroy();
    this.questNotifBg?.destroy();
    this.questNotifTimer?.destroy();
    const w = Math.round(300 * S);
    const h = Math.round(28 * S);
    const cx = UI_OFFSET_X + GAME_WIDTH / 2;
    const cy = UI_OFFSET_Y + Math.round(40 * S);
    this.questNotifBg = this.add.rectangle(cx, cy, w, h, 0x1a1a3e, 0.9).setStrokeStyle(1, COLORS.MENU_BORDER).setDepth(100).setScrollFactor(0);
    this.questNotifText = this.add.text(cx, cy, text, {
      fontSize: `${Math.round(10 * S)}px`, color: COLORS.TEXT_YELLOW, fontFamily: FONT_FAMILY,
    }).setOrigin(0.5).setDepth(101).setScrollFactor(0);
    this.questNotifTimer = this.time.delayedCall(2000, () => {
      this.questNotifText?.destroy();
      this.questNotifBg?.destroy();
    });
  }

  private showQuestCompleteNotification(title: string, rewards: { exp?: number; gold?: number; items?: { itemId: string; quantity: number }[] }): void {
    let rewardStr = '';
    if (rewards.exp) rewardStr += `+${rewards.exp} EXP `;
    if (rewards.gold) rewardStr += `+${rewards.gold} G `;
    if (rewards.items) {
      for (const item of rewards.items) {
        const def = items[item.itemId];
        if (def) rewardStr += `${t(def.nameKey)} x${item.quantity} `;
      }
    }
    const msg = t('quest.complete', { title });
    const full = rewardStr ? `${msg}\n${rewardStr.trim()}` : msg;
    this.showDialogSequence([full]);
    this.showQuestNotification(t('quest.complete', { title }));
  }

  // ── Quest Offer Overlay ──

  private showQuestOfferOverlay(questId: string): void {
    this.questOverlayOpen = true;
    this.questOverlayIndex = 0;
    this.questOverlayQuestId = questId;
    this.questOverlayTexts = [];
    const boxW = Math.round(220 * S);
    const boxH = Math.round(80 * S);
    const cx = UI_OFFSET_X + GAME_WIDTH / 2;
    const cy = UI_OFFSET_Y + GAME_HEIGHT / 2;
    this.questOverlayBox = this.add.rectangle(cx, cy, boxW, boxH, COLORS.MENU_BG, 0.95)
      .setStrokeStyle(2, COLORS.MENU_BORDER).setDepth(200).setScrollFactor(0);
    const title = this.add.text(cx, cy - boxH / 2 + Math.round(16 * S), t('quest.offerTitle'), {
      fontSize: `${Math.round(12 * S)}px`, color: COLORS.TEXT_YELLOW, fontFamily: FONT_FAMILY,
    }).setOrigin(0.5).setDepth(201).setScrollFactor(0);
    this.questOverlayTexts.push(title);
    const accept = this.add.text(cx - boxW / 2 + Math.round(36 * S), cy + Math.round(4 * S), t('quest.accept'), {
      fontSize: `${Math.round(11 * S)}px`, color: COLORS.TEXT_YELLOW, fontFamily: FONT_FAMILY,
    }).setDepth(201).setScrollFactor(0);
    this.questOverlayTexts.push(accept);
    const decline = this.add.text(cx - boxW / 2 + Math.round(36 * S), cy + Math.round(28 * S), t('quest.decline'), {
      fontSize: `${Math.round(11 * S)}px`, color: COLORS.TEXT_WHITE, fontFamily: FONT_FAMILY,
    }).setDepth(201).setScrollFactor(0);
    this.questOverlayTexts.push(decline);
    this.questOverlayCursor = this.add.text(cx - boxW / 2 + Math.round(22 * S), cy + Math.round(4 * S), '>', {
      fontSize: `${Math.round(11 * S)}px`, color: COLORS.TEXT_YELLOW, fontFamily: FONT_FAMILY,
    }).setDepth(201).setScrollFactor(0);
  }

  private hideQuestOverlay(): void {
    this.questOverlayOpen = false;
    this.questOverlayBox?.destroy();
    this.questOverlayTexts.forEach(t => t.destroy());
    this.questOverlayTexts = [];
    this.questOverlayCursor?.destroy();
  }

  private updateQuestOverlaySelection(): void {
    const opt1 = this.questOverlayTexts[1];
    const opt2 = this.questOverlayTexts[2];
    if (opt1) opt1.setColor(this.questOverlayIndex === 0 ? COLORS.TEXT_YELLOW : COLORS.TEXT_WHITE);
    if (opt2) opt2.setColor(this.questOverlayIndex === 1 ? COLORS.TEXT_YELLOW : COLORS.TEXT_WHITE);
    if (this.questOverlayCursor) {
      const target = this.questOverlayIndex === 0 ? opt1 : opt2;
      if (target) this.questOverlayCursor.y = target.y;
    }
  }

  private confirmQuestOption(): void {
    const questId = this.questOverlayQuestId;
    this.hideQuestOverlay();
    if (!questId || this.questOverlayIndex !== 0) return;
    const qm = gameState.questManager;
    const state = gameState.player.state;
    qm.startQuest(questId, state);
    const quest = questDefinitions[questId];
    const title = quest ? t(quest.titleKey) : questId;
    this.showQuestNotification(t('quest.newQuest', { title }));
  }

  // ── Warp Menu ──

  private showWarpMenu(floors: number[], _totalFloors: number): void {
    this.warpOverlayOpen = true;
    this.warpOverlayIndex = 0;
    this.warpFloors = floors;
    this.warpOverlayTexts = [];
    const itemCount = floors.length + 1;
    const boxW = Math.round(260 * S);
    const boxH = Math.round((40 + itemCount * 24) * S);
    const cx = UI_OFFSET_X + GAME_WIDTH / 2;
    const cy = UI_OFFSET_Y + GAME_HEIGHT / 2;
    this.warpOverlayBox = this.add.rectangle(cx, cy, boxW, boxH, COLORS.MENU_BG, 0.95)
      .setStrokeStyle(2, COLORS.MENU_BORDER).setDepth(200).setScrollFactor(0);
    const title = this.add.text(cx, cy - boxH / 2 + Math.round(16 * S), t('dungeon.warpTitle'), {
      fontSize: `${Math.round(11 * S)}px`, color: COLORS.TEXT_YELLOW, fontFamily: FONT_FAMILY,
      wordWrap: { width: boxW - Math.round(24 * S) },
    }).setOrigin(0.5).setDepth(201).setScrollFactor(0);
    this.warpOverlayTexts.push(title);
    let yOff = Math.round(36 * S);
    for (let i = 0; i < floors.length; i++) {
      const f = floors[i];
      const label = f === -1 ? t('dungeon.warpBossFloor') : t('dungeon.warpFloor', { floor: f });
      const txt = this.add.text(cx - boxW / 2 + Math.round(36 * S), cy - boxH / 2 + yOff, label, {
        fontSize: `${Math.round(11 * S)}px`, color: i === 0 ? COLORS.TEXT_YELLOW : COLORS.TEXT_WHITE, fontFamily: FONT_FAMILY,
      }).setDepth(201).setScrollFactor(0);
      this.warpOverlayTexts.push(txt);
      yOff += Math.round(24 * S);
    }
    const cancel = this.add.text(cx - boxW / 2 + Math.round(36 * S), cy - boxH / 2 + yOff, t('dungeon.warpCancel'), {
      fontSize: `${Math.round(11 * S)}px`, color: COLORS.TEXT_WHITE, fontFamily: FONT_FAMILY,
    }).setDepth(201).setScrollFactor(0);
    this.warpOverlayTexts.push(cancel);
    this.warpOverlayCursor = this.add.text(cx - boxW / 2 + Math.round(22 * S), cy - boxH / 2 + Math.round(36 * S), '>', {
      fontSize: `${Math.round(11 * S)}px`, color: COLORS.TEXT_YELLOW, fontFamily: FONT_FAMILY,
    }).setDepth(201).setScrollFactor(0);
  }

  private hideWarpMenu(): void {
    this.warpOverlayOpen = false;
    this.warpOverlayBox?.destroy();
    this.warpOverlayTexts.forEach(t => t.destroy());
    this.warpOverlayTexts = [];
    this.warpOverlayCursor?.destroy();
    this.warpFloors = [];
  }

  private updateWarpSelection(): void {
    for (let i = 1; i < this.warpOverlayTexts.length; i++) {
      const sel = (i - 1) === this.warpOverlayIndex;
      this.warpOverlayTexts[i].setColor(sel ? COLORS.TEXT_YELLOW : COLORS.TEXT_WHITE);
    }
    const target = this.warpOverlayTexts[this.warpOverlayIndex + 1];
    if (this.warpOverlayCursor && target) this.warpOverlayCursor.y = target.y;
  }

  private confirmWarpOption(): void {
    if (this.warpOverlayIndex >= this.warpFloors.length) { this.hideWarpMenu(); return; }
    const floor = this.warpFloors[this.warpOverlayIndex];
    const def = mapDefs[this.currentMapId];
    this.hideWarpMenu();
    this.isMoving = true;
    this.cameras.main.fadeOut(200, 0, 0, 0);
    this.cameras.main.once('camerafadeoutcomplete', () => {
      this.currentFloor = floor === -1 ? (def.floors ?? 1) : floor;
      gameState.encounterManager.reset();
      this.loadMap(this.currentMapId);
      // Find crystal save tile to spawn near
      let found = false;
      for (let y = 0; y < this.mapData.length && !found; y++) {
        for (let x = 0; x < this.mapData[y].length; x++) {
          if (this.mapData[y][x] === WorldMapScene.TILE_CRYSTAL_SAVE) {
            this.heroTileX = x;
            this.heroTileY = Math.min(this.mapData.length - 2, y + 1);
            found = true; break;
          }
        }
      }
      if (!found) {
        this.heroTileX = Math.floor(this.effectiveWidth / 2);
        this.heroTileY = (def.castle || def.tileTheme === 'tower') ? this.effectiveHeight - 2 : 1;
      }
      this.updatePosition(); this.createHero(); this.updateCamera();
      this.isMoving = false;
      this.cameras.main.fadeIn(200, 0, 0, 0);
    });
  }

  // ── Mid-Floor Crystal Menu ──

  private showMidFloorCrystalMenu(): void {
    this.midCrystalOverlayOpen = true;
    this.midCrystalOverlayIndex = 0;
    this.midCrystalOverlayTexts = [];
    const boxW = Math.round(260 * S);
    const boxH = Math.round(100 * S);
    const cx = UI_OFFSET_X + GAME_WIDTH / 2;
    const cy = UI_OFFSET_Y + GAME_HEIGHT / 2;
    this.midCrystalOverlayBox = this.add.rectangle(cx, cy, boxW, boxH, COLORS.MENU_BG, 0.95)
      .setStrokeStyle(2, COLORS.MENU_BORDER).setDepth(200).setScrollFactor(0);
    const title = this.add.text(cx, cy - boxH / 2 + Math.round(16 * S), t('dungeon.crystalSave'), {
      fontSize: `${Math.round(11 * S)}px`, color: COLORS.TEXT_YELLOW, fontFamily: FONT_FAMILY,
      wordWrap: { width: boxW - Math.round(24 * S) },
    }).setOrigin(0.5).setDepth(201).setScrollFactor(0);
    this.midCrystalOverlayTexts.push(title);
    const warpOpt = this.add.text(cx - boxW / 2 + Math.round(36 * S), cy + Math.round(4 * S), t('dungeon.warpToEntrance'), {
      fontSize: `${Math.round(11 * S)}px`, color: COLORS.TEXT_YELLOW, fontFamily: FONT_FAMILY,
    }).setDepth(201).setScrollFactor(0);
    this.midCrystalOverlayTexts.push(warpOpt);
    const cancelOpt = this.add.text(cx - boxW / 2 + Math.round(36 * S), cy + Math.round(28 * S), t('dungeon.warpCancel'), {
      fontSize: `${Math.round(11 * S)}px`, color: COLORS.TEXT_WHITE, fontFamily: FONT_FAMILY,
    }).setDepth(201).setScrollFactor(0);
    this.midCrystalOverlayTexts.push(cancelOpt);
    this.midCrystalOverlayCursor = this.add.text(cx - boxW / 2 + Math.round(22 * S), cy + Math.round(4 * S), '>', {
      fontSize: `${Math.round(11 * S)}px`, color: COLORS.TEXT_YELLOW, fontFamily: FONT_FAMILY,
    }).setDepth(201).setScrollFactor(0);
  }

  private hideMidFloorCrystalMenu(): void {
    this.midCrystalOverlayOpen = false;
    this.midCrystalOverlayBox?.destroy();
    this.midCrystalOverlayTexts.forEach(t => t.destroy());
    this.midCrystalOverlayTexts = [];
    this.midCrystalOverlayCursor?.destroy();
  }

  private updateMidFloorCrystalSelection(): void {
    const opt1 = this.midCrystalOverlayTexts[1];
    const opt2 = this.midCrystalOverlayTexts[2];
    if (opt1) opt1.setColor(this.midCrystalOverlayIndex === 0 ? COLORS.TEXT_YELLOW : COLORS.TEXT_WHITE);
    if (opt2) opt2.setColor(this.midCrystalOverlayIndex === 1 ? COLORS.TEXT_YELLOW : COLORS.TEXT_WHITE);
    if (this.midCrystalOverlayCursor) {
      const target = this.midCrystalOverlayIndex === 0 ? opt1 : opt2;
      if (target) this.midCrystalOverlayCursor.y = target.y;
    }
  }

  private confirmMidFloorCrystalOption(): void {
    if (this.midCrystalOverlayIndex === 1) { this.hideMidFloorCrystalMenu(); return; }
    const def = mapDefs[this.currentMapId];
    this.hideMidFloorCrystalMenu();
    this.isMoving = true;
    this.cameras.main.fadeOut(200, 0, 0, 0);
    this.cameras.main.once('camerafadeoutcomplete', () => {
      this.currentFloor = 1;
      gameState.encounterManager.reset();
      this.loadMap(this.currentMapId);
      const isTower = def.castle || def.tileTheme === 'tower';
      const entrance = this.findDungeonEntrance(isTower ? this.effectiveHeight : 0);
      if (entrance) { this.heroTileX = entrance.x; this.heroTileY = entrance.y; }
      else { this.heroTileX = Math.floor(this.effectiveWidth / 2); this.heroTileY = isTower ? this.effectiveHeight - 2 : 1; }
      this.updatePosition(); this.createHero(); this.updateCamera();
      this.isMoving = false;
      this.cameras.main.fadeIn(200, 0, 0, 0);
    });
  }

  // ── Plaque Reading ──

  private tryReadPlaque(x: number, y: number): boolean {
    if (y < 0 || y >= this.mapData.length || x < 0 || x >= this.mapData[0].length) return false;
    if (this.mapData[y][x] !== WorldMapScene.TILE_PLAQUE) return false;
    const def = mapDefs[this.currentMapId];
    if (def.type !== 'dungeon') return false;
    if (def.mechanic === 'colored-keys') {
      if (!!gameState.player.state.storyFlags[`pillars.${this.currentMapId}.f${this.currentFloor}.solved`]) {
        this.showMessage(t('dungeon.crystalPlaqueSolved'));
      } else if (this.currentFloor === 1) {
        this.showMessage(t('dungeon.crystalPlaqueCryptic'));
      } else {
        const colors = this.crystalSequenceColors.map(c => t(`crystal.color.${c}`));
        this.showMessage(colors.join(' → '));
      }
      return true;
    }
    const plaqueKey = `dungeon.${this.currentMapId}.plaque`;
    const msg = t(plaqueKey);
    if (msg && msg !== plaqueKey) this.showMessage(msg);
    else this.showMessage(t('dungeon.plaqueDefault'));
    return true;
  }

  // ── Dungeon Mechanic Initialization ──

  private initMechanics(def: typeof mapDefs[string]): void {
    // Reset all mechanic state
    this.fogEnabled = false; this.fogTorchBonus = 0; this.fogTorchCount = 0;
    this.lavaPhase = false; this.lavaTimer = 0;
    this.mirrorRoomBounds = []; this.mirrorActive = false;
    this.mirrorIcon?.destroy(); this.mirrorIcon = undefined;
    this.darknessPulseEnabled = false; this.darknessPulsePhase = 'light'; this.darknessPulseTimer = 0;
    for (const patrol of this.darknessPulsePatrols) patrol.sprite.destroy();
    this.darknessPulsePatrols = [];
    this.darknessPulseOverlay?.destroy(); this.darknessPulseOverlay = undefined;
    this.windTowerEnabled = false; this.windTowerPhase = 'calm'; this.windTowerTimer = 0; this.windTowerPushing = false;
    this.mazeHunterEnabled = false; this.mazeHunterActive = false; this.mazeHunterChaseMode = false;
    this.mazeHunterStepCount = 0; this.mazeHunterDefeated = false; this.mazeHunterIsMoving = false;
    this.mazeHunterBossSprite?.destroy(); this.mazeHunterBossSprite = undefined;
    this.tripwireGlowTimer = 0;

    const mechanic = def.mechanic;
    if (!mechanic) return;

    if (mechanic === 'fog') {
      this.fogEnabled = true;
      const isFloor1 = this.currentFloor === 1;
      this.fogRadius = isFloor1 ? 0 : 3;
      const prefix = `torch.${this.currentMapId}.f${this.currentFloor}.`;
      const torchCount = Object.keys(gameState.player.state.storyFlags).filter(k => k.startsWith(prefix) && gameState.player.state.storyFlags[k]).length;
      this.fogTorchCount = torchCount;
      this.fogTorchBonus = torchCount * 2;
      if (isFloor1 && torchCount > 0) this.fogRadius = 3;
      this.updateFogVisibility();
    }

    if (mechanic === 'lava-course') {
      this.lavaPhase = false;
      this.lavaTimer = this.time.now;
    }

    if (mechanic === 'mirror') {
      this.mirrorRoomBounds = this.detectMirrorRooms();
      this.updateMirrorState();
    }

    if (mechanic === 'darkness-pulse') {
      this.darknessPulseEnabled = true;
      this.darknessPulsePhase = 'light';
      this.darknessPulseTimer = this.time.now;
      this.fogEnabled = true;
      this.fogRadius = 1;
      const prefix = `torch.${this.currentMapId}.f${this.currentFloor}.`;
      const torchCount = Object.keys(gameState.player.state.storyFlags).filter(k => k.startsWith(prefix) && gameState.player.state.storyFlags[k]).length;
      this.fogTorchCount = torchCount;
      this.fogTorchBonus = torchCount * 2;
      this.darknessPulseOverlay = this.add.rectangle(
        this.cameras.main.scrollX + this.cameras.main.width / 2,
        this.cameras.main.scrollY + this.cameras.main.height / 2,
        this.cameras.main.width * 2, this.cameras.main.height * 2, 0
      ).setAlpha(0).setDepth(45).setScrollFactor(0);

      if (this._pendingPatrolWaypoints) {
        for (const waypoints of this._pendingPatrolWaypoints) {
          const patrolFlag = `patrol.${this.currentMapId}.f${this.currentFloor}.${waypoints[0].x}.${waypoints[0].y}`;
          if (gameState.player.state.storyFlags[patrolFlag]) continue;
          const px = waypoints[0].x * TILE_SIZE + TILE_SIZE / 2;
          const py = waypoints[0].y * TILE_SIZE + TILE_SIZE / 2;
          const container = this.add.container(px, py).setDepth(40).setAlpha(0);
          const body = this.add.circle(0, 0, TILE_SIZE * 0.5, 0x222eaa, 0.3);
          const core = this.add.circle(0, 1, TILE_SIZE * 0.3, 0x4488ff, 0.8);
          const eye = this.add.circle(0, -TILE_SIZE * 0.25, TILE_SIZE * 0.15, 0xaaddff, 0.9);
          const pupil = this.add.circle(0, 0, TILE_SIZE * 0.12, 0xeeffff, 0.9);
          container.add([body, core, eye, pupil]);
          this.tweens.add({ targets: [core, eye, pupil, body], y: '-=2', duration: 800, yoyo: true, repeat: -1, ease: 'Sine.easeInOut' });
          this.tweens.add({ targets: body, scaleX: 1.3, scaleY: 1.3, alpha: 0.15, duration: 1000, yoyo: true, repeat: -1, ease: 'Sine.easeInOut' });
          this.darknessPulsePatrols.push({
            sprite: container, waypoints, waypointIdx: 0, forward: true, defeated: false,
            moveTimer: this.time.now, tileX: waypoints[0].x, tileY: waypoints[0].y, isStepMoving: false,
          });
        }
        this._pendingPatrolWaypoints = undefined;
      }
    }

    if (mechanic === 'wind-tower') {
      this.windTowerEnabled = true;
      this.windTowerPhase = 'calm';
      this.windTowerTimer = this.time.now;
      this.windTowerPushing = false;
    }

    if (mechanic === 'maze-hunter') {
      this.mazeHunterEnabled = true;
      this.mazeHunterActive = false;
      this.mazeHunterStepCount = 0;
      this.mazeHunterChaseMode = false;
      this.mazeHunterMoveTimer = this.time.now;
      this.mazeHunterDefeated = !!gameState.player.state.storyFlags['boss.swordWraith.defeated'];
    }

    if (this.currentMapId === 'banditHideout') {
      this.tripwireGlowTimer = this.time.now;
    }
  }

  // ── Fog of War ──

  private updateFogVisibility(): void {
    if (!this.fogEnabled || this.tileGrid.length === 0) return;
    if (this.darknessPulseEnabled && this.darknessPulsePhase === 'light') {
      for (let y = 0; y < this.tileGrid.length; y++)
        for (let x = 0; x < (this.tileGrid[y]?.length ?? 0); x++)
          this.tileGrid[y][x].setAlpha(1);
      return;
    }
    const radius = this.fogRadius + this.fogTorchBonus;
    const hx = this.heroTileX, hy = this.heroTileY;
    const rows = this.tileGrid.length, cols = this.tileGrid[0]?.length ?? 0;
    const minAlpha = this.darknessPulseEnabled ? 0 : 0.05;
    const vis: number[][] = Array.from({ length: rows }, () => new Array(cols).fill(minAlpha));
    const r = Math.max(1, radius);
    const mid = this.darknessPulseEnabled ? 0.3 : 0.5;
    const far = this.darknessPulseEnabled ? 0.1 : 0.2;
    for (let y = 0; y < rows; y++) {
      for (let x = 0; x < cols; x++) {
        const d = Math.abs(x - hx) + Math.abs(y - hy);
        if (d <= r) vis[y][x] = 1;
        else if (d <= r + 1) vis[y][x] = Math.max(vis[y][x], mid);
        else if (d <= r + 2) vis[y][x] = Math.max(vis[y][x], far);
      }
    }
    // Torches (tile 24) illuminate surroundings
    for (let y = 0; y < rows; y++) {
      for (let x = 0; x < cols; x++) {
        if (this.mapData[y]?.[x] !== 24) continue;
        vis[y][x] = Math.max(vis[y][x], 1);
        const falloff = [0.8, 0.5, 0.3];
        for (let dy = -3; dy <= 3; dy++) {
          for (let dx = -3; dx <= 3; dx++) {
            const ny = y + dy, nx = x + dx;
            if (ny < 0 || ny >= rows || nx < 0 || nx >= cols) continue;
            const dist = Math.abs(dx) + Math.abs(dy);
            if (dist >= 1 && dist <= 3) vis[ny][nx] = Math.max(vis[ny][nx], falloff[dist - 1]);
          }
        }
      }
    }
    for (let y = 0; y < rows; y++) {
      const row = this.tileGrid[y];
      for (let x = 0; x < row.length; x++) row[x].setAlpha(vis[y][x]);
    }
  }

  // ── Ice Slide ──

  private handleIceSlide(dx: number, dy: number): void {
    if (mapDefs[this.currentMapId].mechanic !== 'ice') return;
    if (this.mapData[this.heroTileY]?.[this.heroTileX] !== 25) return;
    let nx = this.heroTileX, ny = this.heroTileY;
    let steps = 0;
    while (steps < 20) {
      const cx = nx + dx, cy = ny + dy;
      if (cy < 0 || cy >= this.mapData.length || cx < 0 || cx >= this.mapData[0].length) break;
      const tile = this.mapData[cy][cx];
      if (tile === 1 || tile === 5 || tile === 4 || tile === 7 || tile === 28) break;
      nx = cx; ny = cy; steps++;
      if (tile !== 25) break;
    }
    if (steps === 0) return;
    this.isMoving = true;
    this.heroTileX = nx; this.heroTileY = ny;
    this.tweens.add({
      targets: this.hero,
      x: nx * TILE_SIZE + TILE_SIZE / 2, y: ny * TILE_SIZE + TILE_SIZE / 2,
      duration: 80 * steps, ease: 'Sine.easeOut',
      onUpdate: () => { this.updateVisibleTiles(); },
      onComplete: () => {
        this.hero.x = Math.round(this.hero.x); this.hero.y = Math.round(this.hero.y);
        this.isMoving = false; this.updatePosition(); this.updateVisibleTiles(); this.updateHUD();
        if (this.fogEnabled) this.updateFogVisibility();
      },
    });
  }

  // ── Quicksand Pull ──

  private handleQuicksandPull(): void {
    if (mapDefs[this.currentMapId].mechanic !== 'sand-trap') return;
    if (this.mapData[this.heroTileY]?.[this.heroTileX] !== WorldMapScene.TILE_QUICKSAND) return;
    if (Math.random() >= 0.3) return;
    let pitX = -1, pitY = -1, bestDist = Infinity;
    for (let y = 0; y < this.mapData.length; y++) {
      for (let x = 0; x < this.mapData[y].length; x++) {
        if (this.mapData[y][x] === WorldMapScene.TILE_PIT) {
          const d = Math.abs(x - this.heroTileX) + Math.abs(y - this.heroTileY);
          if (d < bestDist) { bestDist = d; pitX = x; pitY = y; }
        }
      }
    }
    if (pitX < 0) return;
    let pdx = 0, pdy = 0;
    if (Math.abs(pitX - this.heroTileX) >= Math.abs(pitY - this.heroTileY))
      pdx = pitX > this.heroTileX ? 1 : -1;
    else pdy = pitY > this.heroTileY ? 1 : -1;
    const nx = this.heroTileX + pdx, ny = this.heroTileY + pdy;
    if (ny < 0 || ny >= this.mapData.length || nx < 0 || nx >= this.mapData[0].length) return;
    if (this.mapData[ny][nx] === 1) return;
    this.isMoving = true;
    this.heroTileX = nx; this.heroTileY = ny;
    this.tweens.add({
      targets: this.hero,
      x: nx * TILE_SIZE + TILE_SIZE / 2, y: ny * TILE_SIZE + TILE_SIZE / 2,
      duration: 200, ease: 'Sine.easeIn',
      onComplete: () => {
        this.hero.x = Math.round(this.hero.x); this.hero.y = Math.round(this.hero.y);
        this.isMoving = false; this.updatePosition();
        if (this.fogEnabled) this.updateFogVisibility();
        if (this.mapData[this.heroTileY]?.[this.heroTileX] === WorldMapScene.TILE_PIT) this.handlePitFall();
      },
    });
  }

  private handlePitFall(): void {
    this.showMessage(t('mechanic.pitFall') || 'You fell into a pit!');
    const roll = Math.random();
    if (roll < 0.3) {
      const zone = mapDefs[this.currentMapId].encounterZone;
      if (zone) {
        const mon = gameState.encounterManager.onStep(zone);
        if (mon) { this.time.delayedCall(1000, () => { this.startBattle(mon); }); return; }
      }
    } else if (roll < 0.9) {
      const gold = 20 + Math.floor(Math.random() * 40);
      gameState.player.state.gold += gold;
      this.showMessage((t('mechanic.pitTreasure') || 'You found treasure in the pit!') + ` +${gold}G`);
      this.updateHUD();
    }
    this.time.delayedCall(1500, () => {
      const def = mapDefs[this.currentMapId];
      const entrance = this.findDungeonEntrance((def.castle || def.tileTheme === 'tower') ? this.effectiveHeight : 0);
      if (entrance) { this.heroTileX = entrance.x; this.heroTileY = entrance.y; }
      this.hero.setPosition(this.heroTileX * TILE_SIZE + TILE_SIZE / 2, this.heroTileY * TILE_SIZE + TILE_SIZE / 2);
      this.updatePosition(); this.updateCamera();
      if (this.fogEnabled) this.updateFogVisibility();
    });
  }

  // ── Darkness Pulse ──

  private updateDarknessPulse(): void {
    if (!this.darknessPulseEnabled) return;
    const now = this.time.now;
    const elapsed = now - this.darknessPulseTimer;
    const lightMs = WorldMapScene.DARKNESS_LIGHT_MS;
    const darkMs = WorldMapScene.DARKNESS_DARK_MS;
    const fadeIn = WorldMapScene.DARKNESS_FADE_IN_MS;
    const fadeOut = WorldMapScene.DARKNESS_FADE_OUT_MS;
    const duration = this.darknessPulsePhase === 'light' ? lightMs : darkMs;
    if (elapsed >= duration) {
      this.darknessPulsePhase = this.darknessPulsePhase === 'light' ? 'dark' : 'light';
      this.darknessPulseTimer = now;
      return;
    }
    this.darknessPulseOverlay?.setPosition(
      this.cameras.main.scrollX + this.cameras.main.width / 2,
      this.cameras.main.scrollY + this.cameras.main.height / 2);
    if (this.darknessPulsePhase === 'light') {
      let progress = 1;
      if (elapsed < fadeIn) progress = elapsed / fadeIn;
      else if (elapsed > duration - fadeOut) progress = 1 - (elapsed - (duration - fadeOut)) / fadeOut;
      for (let y = 0; y < this.tileGrid.length; y++) {
        for (let x = 0; x < (this.tileGrid[y]?.length ?? 0); x++) {
          const r = this.fogRadius + this.fogTorchBonus;
          const d = Math.abs(x - this.heroTileX) + Math.abs(y - this.heroTileY);
          let base = 0;
          if (d <= Math.max(1, r)) base = 1;
          else if (d <= Math.max(1, r) + 1) base = 0.3;
          else if (d <= Math.max(1, r) + 2) base = 0.1;
          this.tileGrid[y][x].setAlpha(base + (1 - base) * progress);
        }
      }
      const patrolAlpha = progress < 1 ? 0.8 * (1 - progress) : 0;
      for (const p of this.darknessPulsePatrols) if (!p.defeated) p.sprite.setAlpha(patrolAlpha);
      this.darknessPulseOverlay?.setAlpha(progress < 1 && elapsed > fadeIn ? (1 - progress) * 0.3 : 0);
    } else {
      this.updateFogVisibility();
      for (const p of this.darknessPulsePatrols) if (!p.defeated) p.sprite.setAlpha(0.8);
      this.darknessPulseOverlay?.setAlpha(0);
      // Move patrols
      for (const p of this.darknessPulsePatrols) {
        if (p.defeated || p.waypoints.length < 2 || p.isStepMoving || now - p.moveTimer < 300) continue;
        const wp = p.waypoints[p.waypointIdx];
        if (p.tileX === wp.x && p.tileY === wp.y) {
          if (p.forward) { p.waypointIdx++; if (p.waypointIdx >= p.waypoints.length - 1) p.forward = false; }
          else { p.waypointIdx--; if (p.waypointIdx <= 0) p.forward = true; }
          continue;
        }
        const target = p.waypoints[p.waypointIdx];
        let pdx = 0, pdy = 0;
        if (p.tileX !== target.x) pdx = target.x > p.tileX ? 1 : -1;
        else if (p.tileY !== target.y) pdy = target.y > p.tileY ? 1 : -1;
        p.tileX += pdx; p.tileY += pdy;
        p.isStepMoving = true; p.moveTimer = now;
        if (p.tileX === this.heroTileX && p.tileY === this.heroTileY && !p.defeated) {
          p.defeated = true; this._pendingPatrolSprite = p.sprite;
          const flag = `patrol.${this.currentMapId}.f${this.currentFloor}.${p.waypoints[0].x}.${p.waypoints[0].y}`;
          gameState.player.state.storyFlags[flag] = true;
          this.isMoving = true;
          this.showMessage(t('dungeon.shadowCave.patrolCaught'));
          this.time.delayedCall(500, () => { this.startBattle(monsters.shadowWisp); });
        }
        this.tweens.add({
          targets: p.sprite,
          x: p.tileX * TILE_SIZE + TILE_SIZE / 2, y: p.tileY * TILE_SIZE + TILE_SIZE / 2,
          duration: 300, ease: 'Linear',
          onComplete: () => { p.isStepMoving = false; },
        });
      }
    }
  }

  private checkDarknessPatrolCollision(): boolean {
    if (!this.darknessPulseEnabled || this.darknessPulsePhase !== 'dark') return false;
    for (const p of this.darknessPulsePatrols) {
      if (p.defeated) continue;
      if (Math.abs(p.tileX - this.heroTileX) + Math.abs(p.tileY - this.heroTileY) === 0) {
        p.defeated = true; this._pendingPatrolSprite = p.sprite;
        const flag = `patrol.${this.currentMapId}.f${this.currentFloor}.${p.waypoints[0].x}.${p.waypoints[0].y}`;
        gameState.player.state.storyFlags[flag] = true;
        return true;
      }
    }
    return false;
  }

  // ── Lava Course ──

  private updateLavaCourse(): void {
    if (mapDefs[this.currentMapId].mechanic !== 'lava-course') return;
    const now = this.time.now;
    const elapsed = now - this.lavaTimer;
    if (elapsed >= WorldMapScene.LAVA_TOGGLE_MS) {
      this.lavaPhase = !this.lavaPhase;
      this.lavaTimer = now;
    }
    const progress = elapsed / WorldMapScene.LAVA_TOGGLE_MS;
    const alpha = this.lavaPhase
      ? 0.4 + 0.2 * Math.sin(progress * Math.PI * 2)
      : 0.8 + 0.2 * Math.sin(progress * Math.PI * 2);
    for (let y = 0; y < this.tileGrid.length; y++) {
      for (let x = 0; x < this.tileGrid[y].length; x++) {
        if (this.mapData[y]?.[x] === 5 && !this.fogEnabled)
          this.tileGrid[y][x].setAlpha(alpha);
      }
    }
  }

  private handleLavaDamage(): void {
    if (mapDefs[this.currentMapId].mechanic !== 'lava-course') return;
    if (this.mapData[this.heroTileY]?.[this.heroTileX] !== 5 || this.lavaPhase) return;
    const p = gameState.player;
    const dmg = Math.max(1, Math.floor(p.totalMaxHp * 0.1));
    p.state.hp = Math.max(1, p.state.hp - dmg);
    this.updateHUD();
    // Push back
    const bx = this.heroDir === 1 ? 1 : this.heroDir === 2 ? -1 : 0;
    const by = this.heroDir === 0 ? -1 : this.heroDir === 3 ? 1 : 0;
    const nx = this.heroTileX + bx, ny = this.heroTileY + by;
    if (ny >= 0 && ny < this.mapData.length && nx >= 0 && nx < this.mapData[0].length) {
      const tile = this.mapData[ny][nx];
      if (tile !== 1 && tile !== 5) {
        this.heroTileX = nx; this.heroTileY = ny;
        this.hero.setPosition(nx * TILE_SIZE + TILE_SIZE / 2, ny * TILE_SIZE + TILE_SIZE / 2);
        this.updatePosition(); this.updateCamera();
      }
    }
    this.cameras.main.flash(200, 255, 50, 50);
    this.showMessage(t('mechanic.lavaDamage') || `The lava burns! -${dmg} HP`);
  }

  // ── Poison ──

  private applyPoisonCatchUp(): void {
    const state = gameState.player.state as any;
    if (!state.poisonedUntil || this.lastPoisonTickWallTime === 0) return;
    if (state.poisonLastTickWallTime && state.poisonLastTickWallTime > this.lastPoisonTickWallTime) {
      this.lastPoisonTickWallTime = state.poisonLastTickWallTime;
      return;
    }
    const now = Date.now();
    const expired = now > state.poisonedUntil;
    const end = expired ? state.poisonedUntil : now;
    const ticks = Math.floor((end - this.lastPoisonTickWallTime) / 1000);
    if (ticks <= 0) return;
    this.lastPoisonTickWallTime += ticks * 1000;
    state.poisonLastTickWallTime = this.lastPoisonTickWallTime;
    const dmg = Math.max(1, Math.floor(gameState.player.totalMaxHp * 0.02)) * ticks;
    gameState.player.state.hp = Math.max(1, gameState.player.state.hp - dmg);
    this.updateHUD();
    if (expired) { state.poisonedUntil = undefined; state.poisonLastTickWallTime = 0; }
    const flash = this.add.rectangle(UI_OFFSET_X + GAME_WIDTH / 2, UI_OFFSET_Y + GAME_HEIGHT / 2,
      GAME_WIDTH * 2, GAME_HEIGHT * 2, 0x884488).setDepth(200).setScrollFactor(0).setAlpha(0.3);
    this.tweens.add({ targets: flash, alpha: 0, duration: 600, onComplete: () => flash.destroy() });
  }

  private clearTripwireCluster(startX: number, startY: number): void {
    if (this.mapData[startY]?.[startX] !== WorldMapScene.TILE_TRIPWIRE) return;
    const prefix = this.getTileThemePrefix();
    const queue: [number, number][] = [[startX, startY]];
    const visited = new Set<string>([`${startX},${startY}`]);
    while (queue.length > 0) {
      const [x, y] = queue.shift()!;
      if (this.mapData[y]?.[x] !== WorldMapScene.TILE_TRIPWIRE) continue;
      this.mapData[y][x] = 0;
      if (this.tileGrid[y]?.[x]) this.tileGrid[y][x].setTexture(`${prefix}-0`).clearTint();
      for (const [dx, dy] of [[0, -1], [0, 1], [-1, 0], [1, 0]] as [number, number][]) {
        const nx = x + dx, ny = y + dy;
        const key = `${nx},${ny}`;
        if (visited.has(key)) continue;
        if (this.mapData[ny]?.[nx] !== WorldMapScene.TILE_TRIPWIRE) continue;
        visited.add(key);
        queue.push([nx, ny]);
      }
    }
  }

  private updatePoisonDot(): void {
    const state = gameState.player.state as any;
    if (!state.poisonedUntil) return;
    if (state.poisonLastTickWallTime && state.poisonLastTickWallTime > this.lastPoisonTickWallTime) {
      this.lastPoisonTickWallTime = state.poisonLastTickWallTime;
    }
    const now = Date.now();
    if (now > state.poisonedUntil) { state.poisonedUntil = undefined; state.poisonLastTickWallTime = 0; this.lastPoisonTickWallTime = 0; return; }
    if (this.lastPoisonTickWallTime === 0) { this.lastPoisonTickWallTime = now; state.poisonLastTickWallTime = now; return; }
    if (now - this.lastPoisonTickWallTime < 1000) return;
    this.lastPoisonTickWallTime += 1000;
    state.poisonLastTickWallTime = this.lastPoisonTickWallTime;
    const dmg = Math.max(1, Math.floor(gameState.player.totalMaxHp * 0.02));
    gameState.player.state.hp = Math.max(1, gameState.player.state.hp - dmg);
    this.updateHUD();
    this.cameras.main.shake(180, 0.005);
    const flash = this.add.rectangle(UI_OFFSET_X + GAME_WIDTH / 2, UI_OFFSET_Y + GAME_HEIGHT / 2,
      GAME_WIDTH * 2, GAME_HEIGHT * 2, 0x884488).setDepth(200).setScrollFactor(0).setAlpha(0.3);
    this.tweens.add({ targets: flash, alpha: 0, duration: 500, onComplete: () => flash.destroy() });
  }

  private updateTripwireGlow(): void {
    if (this.currentMapId !== 'banditHideout' || this.tileGrid.length === 0) return;
    const now = this.time.now;
    if (now - this.tripwireGlowTimer < 20000) return;
    this.tripwireGlowTimer = now;
    for (let y = 0; y < this.tileGrid.length; y++) {
      for (let x = 0; x < (this.tileGrid[y]?.length ?? 0); x++) {
        if (this.mapData[y]?.[x] !== WorldMapScene.TILE_TRIPWIRE) continue;
        const tile = this.tileGrid[y]?.[x];
        if (tile) {
          tile.setTint(0xffe244);
          this.time.delayedCall(350, () => {
            if (this.mapData[y]?.[x] === WorldMapScene.TILE_TRIPWIRE) tile.clearTint();
          });
        }
      }
    }
  }

  // ── Wind Tower ──

  private updateWindTower(): void {
    if (!this.windTowerEnabled) return;
    const now = this.time.now;
    const elapsed = now - this.windTowerTimer;
    if (this.windTowerPhase === 'calm') {
      if (elapsed >= WorldMapScene.WIND_CALM_MS) {
        this.windTowerPhase = 'gust';
        this.windTowerTimer = now;
        this.showMessage(t('dungeon.stormreachSpire.windGust'));
        this.handleWindPush();
      }
    } else {
      const progress = elapsed / WorldMapScene.WIND_GUST_MS;
      const alpha = 0.6 + 0.3 * Math.sin(progress * Math.PI * 4);
      for (let y = 0; y < this.tileGrid.length; y++) {
        for (let x = 0; x < (this.tileGrid[y]?.length ?? 0); x++) {
          if (this.mapData[y]?.[x] === 25 && !this.fogEnabled)
            this.tileGrid[y][x]?.setAlpha(alpha);
        }
      }
      if (elapsed >= WorldMapScene.WIND_GUST_MS) {
        this.windTowerPhase = 'calm';
        this.windTowerTimer = now;
        for (let y = 0; y < this.tileGrid.length; y++) {
          for (let x = 0; x < (this.tileGrid[y]?.length ?? 0); x++) {
            if (this.mapData[y]?.[x] === 25 && !this.fogEnabled)
              this.tileGrid[y][x]?.setAlpha(1);
          }
        }
      }
    }
  }

  private handleWindPush(): void {
    if (this.windTowerPushing || this.isMoving) return;
    if (this.mapData[this.heroTileY]?.[this.heroTileX] !== 25) return;
    const { dx, dy } = this.windTowerDir;
    let nx = this.heroTileX, ny = this.heroTileY;
    let steps = 0;
    const maxPush = 3;
    while (steps < maxPush) {
      const cx = nx + dx, cy = ny + dy;
      if (cy < 0 || cy >= this.mapData.length || cx < 0 || cx >= this.mapData[0].length) break;
      const tile = this.mapData[cy][cx];
      if (tile === 1 || tile === 5 || tile === 4 || tile === 7 || tile === 28
        || tile === WorldMapScene.TILE_CRYSTAL_SAVE || tile === WorldMapScene.TILE_PLAQUE
        || tile === WorldMapScene.TILE_CRYSTAL_PILLAR) break;
      nx = cx; ny = cy; steps++;
    }
    if (steps === 0) return;
    this.windTowerPushing = true;
    this.isMoving = true;
    this.heroTileX = nx; this.heroTileY = ny;
    this.tweens.add({
      targets: this.hero,
      x: nx * TILE_SIZE + TILE_SIZE / 2, y: ny * TILE_SIZE + TILE_SIZE / 2,
      duration: 100 * steps, ease: 'Sine.easeOut',
      onUpdate: () => { this.updateVisibleTiles(); },
      onComplete: () => {
        this.hero.x = Math.round(this.hero.x); this.hero.y = Math.round(this.hero.y);
        this.isMoving = false; this.windTowerPushing = false;
        this.updatePosition(); this.updateVisibleTiles(); this.updateHUD();
        if (this.fogEnabled) this.updateFogVisibility();
      },
    });
  }

  // ── Maze Hunter ──

  private updateMazeHunter(): void {
    if (!this.mazeHunterEnabled || this.mazeHunterDefeated) return;
    const now = this.time.now;
    if (!this.mazeHunterActive) {
      const threshold = this.currentFloor >= 5 ? 0 : 5;
      if (this.mazeHunterStepCount >= threshold) this.spawnMazeHunterBoss();
      return;
    }
    if (!this.mazeHunterBossSprite || this.mazeHunterIsMoving) return;
    const wasChasing = this.mazeHunterChaseMode;
    this.mazeHunterChaseMode = this.checkMazeHunterLOS();
    if (this.mazeHunterChaseMode && !wasChasing) this.showMessage(t('dungeon.sunkenTempleDungeon.hunterChase'));
    let interval: number;
    if (this.mazeHunterChaseMode || this.currentFloor >= 6) interval = 400;
    else if (this.currentFloor >= 5) interval = 600;
    else interval = 800;
    if (now - this.mazeHunterMoveTimer < interval) return;
    this.mazeHunterMoveTimer = now;
    const nextStep = this.bfsMazeHunterStep();
    if (nextStep) {
      if (nextStep.x === this.heroTileX && nextStep.y === this.heroTileY) { this.triggerMazeHunterBattle(); return; }
      this.mazeHunterIsMoving = true;
      this.mazeHunterBossTileX = nextStep.x; this.mazeHunterBossTileY = nextStep.y;
      this.tweens.add({
        targets: this.mazeHunterBossSprite,
        x: nextStep.x * TILE_SIZE + TILE_SIZE / 2, y: nextStep.y * TILE_SIZE + TILE_SIZE / 2,
        duration: 300, ease: 'Sine.easeInOut',
        onComplete: () => {
          this.mazeHunterIsMoving = false;
          if (this.mazeHunterBossTileX === this.heroTileX && this.mazeHunterBossTileY === this.heroTileY)
            this.triggerMazeHunterBattle();
        },
      });
    }
  }

  private spawnMazeHunterBoss(): void {
    this.mazeHunterActive = true;
    this.mazeHunterBossTileX = this.mazeHunterEntranceX;
    this.mazeHunterBossTileY = this.mazeHunterEntranceY;
    const px = this.mazeHunterBossTileX * TILE_SIZE + TILE_SIZE / 2;
    const py = this.mazeHunterBossTileY * TILE_SIZE + TILE_SIZE / 2;
    const container = this.add.container(px, py).setDepth(40).setAlpha(0);
    const aura = this.add.circle(0, 0, TILE_SIZE * 0.55, 0x440066, 0.3);
    const body = this.add.circle(0, 1, TILE_SIZE * 0.35, 0x66339a, 0.85);
    const head = this.add.circle(0, -2, TILE_SIZE * 0.15, 0xff3444, 0.9);
    const eyeL = this.add.circle(-4, -3, 2, 0xff55a6, 1);
    const eyeR = this.add.circle(4, -3, 2, 0xff55a6, 1);
    container.add([aura, body, head, eyeL, eyeR]);
    this.tweens.add({ targets: [body, head, eyeL, eyeR], y: '-=2', duration: 600, yoyo: true, repeat: -1, ease: 'Sine.easeInOut' });
    this.tweens.add({ targets: aura, scaleX: 1.3, scaleY: 1.3, alpha: 0.15, duration: 800, yoyo: true, repeat: -1, ease: 'Sine.easeInOut' });
    this.tweens.add({ targets: container, alpha: 1, duration: 1000, ease: 'Power2' });
    this.mazeHunterBossSprite = container;
    this.mazeHunterMoveTimer = this.time.now;
    this.showMessage(t('dungeon.sunkenTempleDungeon.hunterSpawn'));
  }

  private checkMazeHunterLOS(): boolean {
    const bx = this.mazeHunterBossTileX, by = this.mazeHunterBossTileY;
    const hx = this.heroTileX, hy = this.heroTileY;
    if (by === hy) {
      const min = Math.min(bx, hx), max = Math.max(bx, hx);
      let clear = true;
      for (let x = min + 1; x < max; x++) {
        const tile = this.mapData[by]?.[x];
        if (tile === 1 || tile === undefined) { clear = false; break; }
      }
      if (clear) return true;
    }
    if (bx === hx) {
      const min = Math.min(by, hy), max = Math.max(by, hy);
      let clear = true;
      for (let y = min + 1; y < max; y++) {
        const tile = this.mapData[y]?.[bx];
        if (tile === 1 || tile === undefined) { clear = false; break; }
      }
      if (clear) return true;
    }
    return false;
  }

  private bfsMazeHunterStep(): { x: number; y: number } | null {
    const sx = this.mazeHunterBossTileX, sy = this.mazeHunterBossTileY;
    const gx = this.heroTileX, gy = this.heroTileY;
    if (sx === gx && sy === gy) return null;
    const h = this.mapData.length, w = this.mapData[0]?.length ?? 0;
    const inBounds = (x: number, y: number) => y >= 0 && y < h && x >= 0 && x < w;
    if (!inBounds(sx, sy) || !inBounds(gx, gy)) return null;
    const dist: number[][] = Array.from({ length: h }, () => new Array(w).fill(-1));
    const queue: [number, number][] = [[sx, sy]];
    dist[sy][sx] = 0;
    const dirs = [[0, -1], [0, 1], [-1, 0], [1, 0]];
    const passable = new Set([0, 2, 4, 6, 9, 10, 24, 8]);
    while (queue.length > 0) {
      const [cx, cy] = queue.shift()!;
      if (cx === gx && cy === gy) break;
      for (const [dx, dy] of dirs) {
        const nx = cx + dx, ny = cy + dy;
        if (nx < 0 || nx >= w || ny < 0 || ny >= h || dist[ny][nx] >= 0) continue;
        if (passable.has(this.mapData[ny][nx])) { dist[ny][nx] = dist[cy][cx] + 1; queue.push([nx, ny]); }
      }
    }
    if (dist[gy][gx] < 0) return null;
    let cx = gx, cy = gy;
    for (;;) {
      let advanced = false;
      for (const [dx, dy] of dirs) {
        const nx = cx + dx, ny = cy + dy;
        if (nx < 0 || nx >= w || ny < 0 || ny >= h) continue;
        if (dist[ny][nx] === dist[cy][cx] - 1) {
          if (dist[ny][nx] === 0) return { x: cx, y: cy };
          cx = nx; cy = ny; advanced = true; break;
        }
      }
      if (!advanced || dist[cy][cx] <= 0) break;
    }
    return null;
  }

  private triggerMazeHunterBattle(): void {
    if (!this.mazeHunterBossSprite || this.mazeHunterDefeated) return;
    this.isMoving = true;
    const boss = monsters.swordWraith;
    if (!boss) return;
    const def = mapDefs[this.currentMapId];
    const isFinalFloor = this.currentFloor === (def.floors ?? 1);
    this.currentEncounterZone = def.encounterZone;
    audioManager.playSfx('boss_intro');
    if (isFinalFloor) {
      this.pendingBossId = 'swordWraith';
      const msgs = [
        t(`dungeon.${this.currentMapId}.boss.dialog1`),
        t(`dungeon.${this.currentMapId}.boss.dialog2`),
        t(`dungeon.${this.currentMapId}.boss.dialog3`),
      ];
      this.showDialogSequence(msgs, () => { this.startBattle(boss, true); });
    } else {
      this._pendingMazeHunterBattle = true;
      this.showMessage(t(`dungeon.${this.currentMapId}.boss.dialog1`));
      this.time.delayedCall(500, () => { this.startBattle(boss, false); });
    }
  }

  private unsealMazeHunterExit(): void {
    const h = this.mapData.length, w = this.mapData[0]?.length ?? 0;
    for (let y = 0; y < h; y++) {
      for (let x = 0; x < w; x++) {
        if (this.mapData[y][x] === 10) {
          for (const [dx, dy] of [[0, 1], [0, -1], [1, 0], [-1, 0]]) {
            const nx = x + dx, ny = y + dy;
            if (nx >= 0 && nx < w && ny >= 0 && ny < h && this.mapData[ny][nx] === 1) {
              this.mapData[ny][nx] = 0;
              const idx = ny * w + nx;
              const tileObj = this.tileLayer.getAt(idx) as Phaser.GameObjects.Image;
              const prefix = this.getTileThemePrefix();
              tileObj.setTexture(`${prefix}-0`);
            }
          }
          break;
        }
      }
    }
    this.showMessage(t('dungeon.sunkenTempleDungeon.exitUnsealed'));
  }

  // ── Mirror Rooms ──

  private detectMirrorRooms(): { x: number; y: number; w: number; h: number }[] {
    const rooms: { x: number; y: number; w: number; h: number }[] = [];
    const visited = new Set<string>();
    for (let y = 1; y < this.mapData.length - 1; y++) {
      for (let x = 1; x < this.mapData[0].length - 1; x++) {
        const key = `${x},${y}`;
        if (visited.has(key)) continue;
        const tile = this.mapData[y][x];
        if (tile === 1 || tile === 5) continue;
        const queue: [number, number][] = [[x, y]];
        visited.add(key);
        let minX = x, maxX = x, minY = y, maxY = y, count = 0;
        while (queue.length > 0 && count < 500) {
          const [cx, cy] = queue.shift()!;
          count++;
          for (const [dx, dy] of [[0, -1], [0, 1], [-1, 0], [1, 0]]) {
            const nx = cx + dx, ny = cy + dy;
            const nk = `${nx},${ny}`;
            if (nx < 0 || nx >= this.mapData[0].length || ny < 0 || ny >= this.mapData.length || visited.has(nk)) continue;
            const nt = this.mapData[ny][nx];
            if (nt === 1 || nt === 5) continue;
            visited.add(nk); queue.push([nx, ny]);
            minX = Math.min(minX, nx); maxX = Math.max(maxX, nx);
            minY = Math.min(minY, ny); maxY = Math.max(maxY, ny);
          }
        }
        const w = maxX - minX + 1, h = maxY - minY + 1;
        if (w >= 4 && h >= 4 && count >= 12) rooms.push({ x: minX, y: minY, w, h });
      }
    }
    return rooms.filter((_, i) => i % 2 === 1);
  }

  private updateMirrorState(): void {
    if (mapDefs[this.currentMapId].mechanic !== 'mirror') {
      if (this.mirrorActive) { this.mirrorActive = false; this.mirrorIcon?.destroy(); this.mirrorIcon = undefined; }
      return;
    }
    const wasMirrored = this.mirrorActive;
    this.mirrorActive = false;
    for (const room of this.mirrorRoomBounds) {
      if (this.heroTileX >= room.x && this.heroTileX < room.x + room.w
          && this.heroTileY >= room.y && this.heroTileY < room.y + room.h) {
        this.mirrorActive = true; break;
      }
    }
    if (this.mirrorActive !== wasMirrored) {
      for (const room of this.mirrorRoomBounds) {
        for (let y = room.y; y < room.y + room.h; y++) {
          for (let x = room.x; x < room.x + room.w; x++) {
            if (y >= 0 && y < this.tileGrid.length && x >= 0 && x < (this.tileGrid[0]?.length ?? 0)) {
              if (this.mirrorActive && this.heroTileX >= room.x && this.heroTileX < room.x + room.w
                  && this.heroTileY >= room.y && this.heroTileY < room.y + room.h) {
                this.tileGrid[y][x].setTint(0xddaadd);
              } else {
                this.tileGrid[y][x].clearTint();
              }
            }
          }
        }
      }
      if (this.mirrorActive && !this.mirrorIcon) {
        this.mirrorIcon = this.add.text(UI_OFFSET_X + GAME_WIDTH - Math.round(60 * S), UI_OFFSET_Y + Math.round(8 * S), '↕↔', {
          fontSize: `${Math.round(14 * S)}px`, color: '#dd88dd', fontFamily: FONT_FAMILY,
          backgroundColor: '#1a1a3ecc', padding: { x: Math.round(4 * S), y: Math.round(2 * S) },
        }).setDepth(100).setScrollFactor(0);
      } else if (!this.mirrorActive && this.mirrorIcon) {
        this.mirrorIcon.destroy(); this.mirrorIcon = undefined;
        for (const room of this.mirrorRoomBounds) {
          for (let y = room.y; y < room.y + room.h; y++) {
            for (let x = room.x; x < room.x + room.w; x++) {
              if (y >= 0 && y < this.tileGrid.length && x >= 0 && x < (this.tileGrid[0]?.length ?? 0))
                this.tileGrid[y][x].clearTint();
            }
          }
        }
      }
    }
  }

  // ── Torch Pickup ──

  private handleTorchPickup(): void {
    if (!this.fogEnabled) return;
    if (this.mapData[this.heroTileY]?.[this.heroTileX] !== 24) return;
    this.mapData[this.heroTileY][this.heroTileX] = 0;
    const prefix = this.getTileThemePrefix();
    if (this.tileGrid[this.heroTileY]?.[this.heroTileX])
      this.tileGrid[this.heroTileY][this.heroTileX].setTexture(`${prefix}-0`);
    this.fogTorchCount++;
    this.fogTorchBonus = this.fogTorchCount * 2;
    if (this.currentFloor === 1 && this.fogTorchCount === 1 && this.fogRadius === 0) this.fogRadius = 3;
    const torchFlag = `torch.${this.currentMapId}.f${this.currentFloor}.${this.fogTorchCount}`;
    gameState.player.state.storyFlags[torchFlag] = true;
    this.showMessage(t('mechanic.torchPickup') || 'Found a torch! The darkness recedes...');
    this.updateFogVisibility();
  }

  shutdown(): void {
    this.input.keyboard?.removeAllListeners();
    this.mirrorIcon?.destroy();
    this.mirrorIcon = undefined;
  }
}
