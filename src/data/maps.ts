// Map metadata defining connections and properties for procedural generation
export interface MapDef {
  id: string;
  nameKey: string;
  type: 'overworld' | 'town' | 'dungeon';
  encounterZone?: string;
  width: number;
  height: number;
  connections: { targetMap: string; fromX: number; fromY: number; toX: number; toY: number; toFloor?: number }[];
  npcs: { id: string; dialogueKey: string; x: number; y: number }[];
  shopId?: string;
  savePoint?: { x: number; y: number };
  bossId?: string;
  floors?: number; // number of dungeon floors (default 1)
  exitConnection?: { toX: number; toY: number }; // gate dungeon: boss-exit overworld coordinates
  castle?: boolean; // castle dungeon: upward progression, entrance at bottom
}

export const mapDefs: Record<string, MapDef> = {
  // ═══════════════════════════════════════════════════════════════════
  //   OVERWORLD — 120×160  (expanded from 80×120 for V2)
  //
  //   y=0-1       WATER (north edge)
  //   y=2-70      ACT 5 (69 tiles — mountain maze, Demon Castle island)
  //   y≈71        LAVA BARRIER (organic)
  //   y=72-100    ACT 3/4 (29 tiles — desert east, volcanic west)
  //   y≈101       MOUNTAIN BARRIER (organic)
  //   y=102-130   ACT 2 (29 tiles — mountain forests, frozen peaks)
  //   y≈131       RIVER BARRIER (winding, with bridge at Crystal Cave)
  //   y=132-157   ACT 1 (26 tiles — plains, coast, forests)
  //   y=158-159   WATER (south edge)
  // ═══════════════════════════════════════════════════════════════════
  overworld: {
    id: 'overworld',
    nameKey: 'map.overworld',
    type: 'overworld',
    width: 120,
    height: 160,
    connections: [
      // ── Act 1 Towns ──
      { targetMap: 'greenhollow', fromX: 15, fromY: 150, toX: 8, toY: 14 },
      { targetMap: 'millbrook', fromX: 45, fromY: 145, toX: 8, toY: 14 },
      { targetMap: 'portSapphire', fromX: 66, fromY: 138, toX: 8, toY: 14 },
      // ── Act 2 Towns ──
      { targetMap: 'ironkeep', fromX: 70, fromY: 118, toX: 8, toY: 14 },
      { targetMap: 'highwatch', fromX: 35, fromY: 112, toX: 8, toY: 14 },
      // ── Act 3 Towns ──
      { targetMap: 'oasisHaven', fromX: 45, fromY: 92, toX: 8, toY: 14 },
      { targetMap: 'ruinsCamp', fromX: 80, fromY: 85, toX: 8, toY: 14 },
      // ── Act 4 Towns ──
      { targetMap: 'embersRest', fromX: 30, fromY: 78, toX: 8, toY: 14 },
      // ── Act 5 Towns ──
      { targetMap: 'lastBastion', fromX: 85, fromY: 58, toX: 8, toY: 14 },
      { targetMap: 'havensEdge', fromX: 65, fromY: 40, toX: 8, toY: 14 },

      // ── Act 1 Dungeons ──
      { targetMap: 'sunkenCellar', fromX: 25, fromY: 148, toX: 7, toY: 1 },
      { targetMap: 'mistyGrotto', fromX: 85, fromY: 144, toX: 7, toY: 1 },
      // Crystal Cave: gate dungeon (S entrance Act 1 side, N exit Act 2 side)
      { targetMap: 'crystalCave', fromX: 66, fromY: 130, toX: 10, toY: 61 },
      { targetMap: 'crystalCave', fromX: 66, fromY: 127, toX: 10, toY: 1 },

      // ── Act 2 Dungeons ──
      { targetMap: 'stormNest', fromX: 100, fromY: 112, toX: 12, toY: 1 },
      { targetMap: 'frozenLake', fromX: 25, fromY: 108, toX: 10, toY: 2 },
      // Shadow Cave: gate dungeon (S entrance Act 2 side, N exit Act 3 side)
      { targetMap: 'shadowCave', fromX: 90, fromY: 102, toX: 12, toY: 1 },
      { targetMap: 'shadowCave', fromX: 90, fromY: 100, toX: 12, toY: 23, toFloor: 5 },

      // ── Act 3 Dungeons ──
      { targetMap: 'desertTomb', fromX: 60, fromY: 95, toX: 12, toY: 1 },
      { targetMap: 'banditHideout', fromX: 35, fromY: 88, toX: 10, toY: 1 },

      // ── Act 4 Dungeons ──
      { targetMap: 'magmaTunnels', fromX: 18, fromY: 75, toX: 12, toY: 1 },
      // Volcanic Forge: gate dungeon (S entrance, N exit into Act 5)
      { targetMap: 'volcanicForge', fromX: 12, fromY: 72, toX: 12, toY: 1 },
      { targetMap: 'volcanicForge', fromX: 12, fromY: 69, toX: 12, toY: 23, toFloor: 9 },

      // ── Act 5 Dungeons ──
      { targetMap: 'demonCastle', fromX: 55, fromY: 15, toX: 16, toY: 31 },
      // Hidden legendary dungeons (deep in maze)
      { targetMap: 'sealedSanctum', fromX: 8, fromY: 10, toX: 14, toY: 1 },
      { targetMap: 'celestialVault', fromX: 110, fromY: 10, toX: 14, toY: 1 },
    ],
    npcs: [],
  },

  // ═══════════════════════════════════════════════════════════════════
  //   TOWNS — 10 total
  // ═══════════════════════════════════════════════════════════════════

  // ── Act 1 ──
  greenhollow: {
    id: 'greenhollow',
    nameKey: 'map.greenhollow',
    type: 'town',
    width: 16,
    height: 16,
    connections: [
      { targetMap: 'overworld', fromX: 8, fromY: 15, toX: 15, toY: 151 },
    ],
    npcs: [
      { id: 'elder', dialogueKey: 'npc.elder.greeting', x: 8, y: 3 },
      { id: 'villager1', dialogueKey: 'npc.villager1', x: 3, y: 5 },
      { id: 'villager2', dialogueKey: 'npc.villager2', x: 12, y: 5 },
      { id: 'fisherman', dialogueKey: 'npc.fisherman', x: 13, y: 10 },
    ],
    shopId: 'greenhollow',
    savePoint: { x: 8, y: 10 },
  },
  millbrook: {
    id: 'millbrook',
    nameKey: 'map.millbrook',
    type: 'town',
    width: 16,
    height: 16,
    connections: [
      { targetMap: 'overworld', fromX: 8, fromY: 15, toX: 45, toY: 146 },
    ],
    npcs: [
      { id: 'miller', dialogueKey: 'npc.miller', x: 3, y: 5 },
      { id: 'herbalist', dialogueKey: 'npc.herbalist', x: 12, y: 5 },
    ],
    shopId: 'millbrook',
    savePoint: { x: 8, y: 10 },
  },
  portSapphire: {
    id: 'portSapphire',
    nameKey: 'map.portSapphire',
    type: 'town',
    width: 16,
    height: 16,
    connections: [
      { targetMap: 'overworld', fromX: 8, fromY: 15, toX: 66, toY: 139 },
    ],
    npcs: [
      { id: 'sailor', dialogueKey: 'npc.sailor', x: 3, y: 5 },
      { id: 'wisewoman', dialogueKey: 'npc.wisewoman', x: 12, y: 5 },
    ],
    shopId: 'portSapphire',
    savePoint: { x: 8, y: 10 },
  },

  // ── Act 2 ──
  ironkeep: {
    id: 'ironkeep',
    nameKey: 'map.ironkeep',
    type: 'town',
    width: 16,
    height: 16,
    connections: [
      { targetMap: 'overworld', fromX: 8, fromY: 15, toX: 70, toY: 119 },
    ],
    npcs: [
      { id: 'soldier', dialogueKey: 'npc.soldier', x: 7, y: 10 },
      { id: 'blacksmith', dialogueKey: 'npc.blacksmith', x: 3, y: 5 },
    ],
    shopId: 'ironkeep',
    savePoint: { x: 8, y: 10 },
  },
  highwatch: {
    id: 'highwatch',
    nameKey: 'map.highwatch',
    type: 'town',
    width: 16,
    height: 16,
    connections: [
      { targetMap: 'overworld', fromX: 8, fromY: 15, toX: 35, toY: 113 },
    ],
    npcs: [
      { id: 'scout', dialogueKey: 'npc.scout', x: 3, y: 5 },
      { id: 'mountaineer', dialogueKey: 'npc.mountaineer', x: 12, y: 5 },
    ],
    shopId: 'highwatch',
    savePoint: { x: 8, y: 10 },
  },

  // ── Act 3 ──
  oasisHaven: {
    id: 'oasisHaven',
    nameKey: 'map.oasisHaven',
    type: 'town',
    width: 16,
    height: 16,
    connections: [
      { targetMap: 'overworld', fromX: 8, fromY: 15, toX: 45, toY: 93 },
    ],
    npcs: [
      { id: 'oasisElder', dialogueKey: 'npc.oasisElder', x: 3, y: 5 },
      { id: 'refugee', dialogueKey: 'npc.refugee', x: 12, y: 5 },
    ],
    shopId: 'oasisHaven',
    savePoint: { x: 8, y: 10 },
  },
  ruinsCamp: {
    id: 'ruinsCamp',
    nameKey: 'map.ruinsCamp',
    type: 'town',
    width: 16,
    height: 16,
    connections: [
      { targetMap: 'overworld', fromX: 8, fromY: 15, toX: 80, toY: 86 },
    ],
    npcs: [
      { id: 'archaeologist', dialogueKey: 'npc.archaeologist', x: 3, y: 5 },
      { id: 'explorer', dialogueKey: 'npc.explorer', x: 12, y: 5 },
    ],
    shopId: 'ruinsCamp',
    savePoint: { x: 8, y: 10 },
  },

  // ── Act 4 ──
  embersRest: {
    id: 'embersRest',
    nameKey: 'map.embersRest',
    type: 'town',
    width: 16,
    height: 16,
    connections: [
      { targetMap: 'overworld', fromX: 8, fromY: 15, toX: 30, toY: 79 },
    ],
    npcs: [
      { id: 'forgemaster', dialogueKey: 'npc.forgemaster', x: 3, y: 5 },
      { id: 'lavaMiner', dialogueKey: 'npc.lavaMiner', x: 12, y: 5 },
    ],
    shopId: 'embersRest',
    savePoint: { x: 8, y: 10 },
  },

  // ── Act 5 ──
  lastBastion: {
    id: 'lastBastion',
    nameKey: 'map.lastBastion',
    type: 'town',
    width: 16,
    height: 16,
    connections: [
      { targetMap: 'overworld', fromX: 8, fromY: 15, toX: 85, toY: 59 },
    ],
    npcs: [
      { id: 'veteran', dialogueKey: 'npc.veteran', x: 3, y: 5 },
      { id: 'priestess', dialogueKey: 'npc.priestess', x: 12, y: 5 },
    ],
    shopId: 'lastBastion',
    savePoint: { x: 8, y: 10 },
  },
  havensEdge: {
    id: 'havensEdge',
    nameKey: 'map.havensEdge',
    type: 'town',
    width: 16,
    height: 16,
    connections: [
      { targetMap: 'overworld', fromX: 8, fromY: 15, toX: 65, toY: 41 },
    ],
    npcs: [
      { id: 'grizzledKnight', dialogueKey: 'npc.grizzledKnight', x: 3, y: 5 },
      { id: 'prophetess', dialogueKey: 'npc.prophetess', x: 12, y: 5 },
    ],
    shopId: 'havensEdge',
    savePoint: { x: 8, y: 10 },
  },

  // ═══════════════════════════════════════════════════════════════════
  //   DUNGEONS — 12 total (7 existing + 5 new)
  // ═══════════════════════════════════════════════════════════════════

  // ── Act 1 ──

  // Misty Grotto — tutorial dungeon, expanded to 3 floors
  mistyGrotto: {
    id: 'mistyGrotto',
    nameKey: 'map.mistyGrotto',
    type: 'dungeon',
    encounterZone: 'misty-grotto',
    width: 15,
    height: 15,
    connections: [
      { targetMap: 'overworld', fromX: 7, fromY: 0, toX: 85, toY: 145 },
    ],
    npcs: [],
    bossId: 'giantToad',
    floors: 3,
  },

  // Sunken Cellar — optional, fisherman's lost rod quest → Coral Blade reward
  sunkenCellar: {
    id: 'sunkenCellar',
    nameKey: 'map.sunkenCellar',
    type: 'dungeon',
    encounterZone: 'sunken-cellar',
    width: 15,
    height: 15,
    connections: [
      { targetMap: 'overworld', fromX: 7, fromY: 0, toX: 25, toY: 149 },
    ],
    npcs: [],
    bossId: 'giantCrab',
    floors: 2,
  },

  // Crystal Cave — GATE dungeon (tunnels under river barrier)
  crystalCave: {
    id: 'crystalCave',
    nameKey: 'map.crystalCave',
    type: 'dungeon',
    encounterZone: 'crystal-cave',
    width: 21,
    height: 63,
    connections: [
      { targetMap: 'overworld', fromX: 10, fromY: 62, toX: 66, toY: 131 },  // south exit → Act 1
      { targetMap: 'overworld', fromX: 10, fromY: 0, toX: 66, toY: 126 },   // north exit → Act 2
    ],
    npcs: [],
    bossId: 'serpent',
    floors: 1,
  },

  // ── Act 2 ──

  // Storm Nest — prerequisite for Shadow Cave (Shadow Crystal)
  stormNest: {
    id: 'stormNest',
    nameKey: 'map.stormNest',
    type: 'dungeon',
    encounterZone: 'storm-nest',
    width: 25,
    height: 25,
    connections: [
      { targetMap: 'overworld', fromX: 12, fromY: 0, toX: 100, toY: 113 },
    ],
    npcs: [],
    bossId: 'stormHarpy',
    floors: 5,
  },

  // Frozen Lake — optional, ancient warrior's frozen blade → Frostbrand
  frozenLake: {
    id: 'frozenLake',
    nameKey: 'map.frozenLake',
    type: 'dungeon',
    encounterZone: 'frozen-lake',
    width: 20,
    height: 20,
    connections: [
      { targetMap: 'overworld', fromX: 10, fromY: 0, toX: 25, toY: 109 },
    ],
    npcs: [],
    bossId: 'iceWyrm',
    floors: 4,
  },

  // Shadow Cave — GATE dungeon (through mountain barrier)
  shadowCave: {
    id: 'shadowCave',
    nameKey: 'map.shadowCave',
    type: 'dungeon',
    encounterZone: 'shadow-cave',
    width: 25,
    height: 25,
    connections: [
      { targetMap: 'overworld', fromX: 12, fromY: 0, toX: 90, toY: 103 },   // south exit (floor 1)
      { targetMap: 'overworld', fromX: 12, fromY: 24, toX: 90, toY: 99 },   // north exit (floor 5)
    ],
    npcs: [],
    bossId: 'dragon',
    floors: 5,
  },

  // ── Act 3 ──

  // Desert Tomb — NEW GATE dungeon, seal protecting Volcanic Forge
  desertTomb: {
    id: 'desertTomb',
    nameKey: 'map.desertTomb',
    type: 'dungeon',
    encounterZone: 'desert-tomb',
    width: 25,
    height: 25,
    connections: [
      { targetMap: 'overworld', fromX: 12, fromY: 0, toX: 60, toY: 96 },
    ],
    npcs: [],
    bossId: 'sandGolem',
    floors: 5,
  },

  // Bandit Hideout — optional, stolen sacred relic quest → Bandit's Dagger
  banditHideout: {
    id: 'banditHideout',
    nameKey: 'map.banditHideout',
    type: 'dungeon',
    encounterZone: 'bandit-hideout',
    width: 18,
    height: 18,
    connections: [
      { targetMap: 'overworld', fromX: 9, fromY: 0, toX: 35, toY: 89 },
    ],
    npcs: [],
    bossId: 'banditLord',
    floors: 3,
  },

  // ── Act 4 ──

  // Magma Tunnels — NEW required dungeon, only path to Volcanic Forge
  magmaTunnels: {
    id: 'magmaTunnels',
    nameKey: 'map.magmaTunnels',
    type: 'dungeon',
    encounterZone: 'magma-tunnels',
    width: 22,
    height: 22,
    connections: [
      { targetMap: 'overworld', fromX: 11, fromY: 0, toX: 18, toY: 76 },
    ],
    npcs: [],
    bossId: 'lavaWyrm',
    floors: 4,
  },

  // Volcanic Forge — GATE dungeon (through lava barrier), expanded 7→9 floors
  volcanicForge: {
    id: 'volcanicForge',
    nameKey: 'map.volcanicForge',
    type: 'dungeon',
    encounterZone: 'volcanic-forge',
    width: 25,
    height: 25,
    connections: [
      { targetMap: 'overworld', fromX: 12, fromY: 0, toX: 12, toY: 73 },   // south exit (floor 1)
      { targetMap: 'overworld', fromX: 12, fromY: 24, toX: 13, toY: 69 },  // north exit (floor 9)
    ],
    npcs: [],
    bossId: 'flameTitan',
    floors: 9,
  },

  // ── Act 5 ──

  // Demon Castle — final dungeon, castle with upward progression
  demonCastle: {
    id: 'demonCastle',
    nameKey: 'map.demonCastle',
    type: 'dungeon',
    encounterZone: 'demon-castle',
    width: 33,
    height: 33,
    connections: [
      { targetMap: 'overworld', fromX: 16, fromY: 32, toX: 55, toY: 16 },
    ],
    npcs: [],
    bossId: 'demonKing',
    floors: 10,
    castle: true,
  },

  // ═══════════════════════════════════════════════════════════════════
  //   HIDDEN LEGENDARY DUNGEONS — Act 5 maze, no direct paths
  // ═══════════════════════════════════════════════════════════════════

  sealedSanctum: {
    id: 'sealedSanctum',
    nameKey: 'map.sealedSanctum',
    type: 'dungeon',
    encounterZone: 'sealed-sanctum',
    width: 29,
    height: 29,
    connections: [
      { targetMap: 'overworld', fromX: 14, fromY: 0, toX: 8, toY: 11 },
    ],
    npcs: [],
    bossId: 'swordWraith',
    floors: 7,
  },
  celestialVault: {
    id: 'celestialVault',
    nameKey: 'map.celestialVault',
    type: 'dungeon',
    encounterZone: 'celestial-vault',
    width: 29,
    height: 29,
    connections: [
      { targetMap: 'overworld', fromX: 14, fromY: 0, toX: 110, toY: 11 },
    ],
    npcs: [],
    bossId: 'celestialGuardian',
    floors: 7,
  },
};
