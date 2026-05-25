// Map metadata defining connections and properties for procedural generation
export interface MapDef {
  id: string;
  nameKey: string;
  type: 'overworld' | 'town' | 'dungeon' | 'portal-overworld';
  encounterZone?: string;
  width: number;
  height: number;
  connections: { targetMap: string; fromX: number; fromY: number; toX: number; toY: number; toFloor?: number }[];
  npcs: { id: string; dialogueKey: string; x: number; y: number }[];
  shopId?: string;
  savePoint?: { x: number; y: number };
  bossId?: string;
  floors?: number;
  exitConnection?: { toX: number; toY: number };
  castle?: boolean;
  theme?: 'sky' | 'ice' | 'ancient' | 'shadow';
  mechanic?: string;
  tileTheme?: string;
}

export const mapDefs: Record<string, MapDef> = {
  // ═══════════════════════════════════════════════════════════════════
  //   OVERWORLD — 320×400
  // ═══════════════════════════════════════════════════════════════════
  overworld: {
    id: 'overworld',
    nameKey: 'map.overworld',
    type: 'overworld',
    width: 320,
    height: 400,
    connections: [
      // ── Act 1 Towns ──
      { targetMap: 'greenhollow', fromX: 60, fromY: 340, toX: 8, toY: 14 },
      { targetMap: 'millbrook', fromX: 100, fromY: 320, toX: 8, toY: 14 },
      { targetMap: 'portSapphire', fromX: 130, fromY: 290, toX: 8, toY: 14 },
      // ── Act 1 Dungeons ──
      { targetMap: 'sunkenCellar', fromX: 45, fromY: 350, toX: 50, toY: 1 },
      { targetMap: 'whisperingWoodsCave', fromX: 80, fromY: 310, toX: 50, toY: 1 },
      { targetMap: 'coastalReef', fromX: 140, fromY: 350, toX: 50, toY: 1 },
      { targetMap: 'mistyGrotto', fromX: 120, fromY: 260, toX: 50, toY: 1 },
      // Crystal Cave: gate dungeon
      { targetMap: 'crystalCave', fromX: 148, fromY: 295, toX: 50, toY: 99 },
      { targetMap: 'crystalCave', fromX: 172, fromY: 305, toX: 50, toY: 99, toFloor: 5 },
      // ── Act 2 Towns ──
      { targetMap: 'ironkeep', fromX: 200, fromY: 320, toX: 8, toY: 14 },
      { targetMap: 'frostwatch', fromX: 222, fromY: 262, toX: 5, toY: 9 },
      { targetMap: 'hauntedVillage', fromX: 252, fromY: 242, toX: 8, toY: 14 },
      // ── Act 2 Dungeons ──
      { targetMap: 'ironMine', fromX: 185, fromY: 335, toX: 50, toY: 1 },
      { targetMap: 'stormNest', fromX: 280, fromY: 295, toX: 50, toY: 99 },
      { targetMap: 'hauntedForest', fromX: 238, fromY: 248, toX: 12, toY: 24 },
      { targetMap: 'hauntedForest', fromX: 242, fromY: 248, toX: 12, toY: 24, toFloor: 5 },
      { targetMap: 'frozenLake', fromX: 200, fromY: 265, toX: 50, toY: 1 },
      // Shadow Cave: gate dungeon
      { targetMap: 'shadowCave', fromX: 260, fromY: 234, toX: 50, toY: 1 },
      { targetMap: 'shadowCave', fromX: 260, fromY: 198, toX: 50, toY: 66, toFloor: 5 },
      // ── Act 3 Towns ──
      { targetMap: 'oasisHaven', fromX: 220, fromY: 150, toX: 8, toY: 14 },
      { targetMap: 'ruinsCamp', fromX: 270, fromY: 120, toX: 8, toY: 14 },
      // ── Act 4 Towns ──
      { targetMap: 'embersRest', fromX: 195, fromY: 80, toX: 8, toY: 14 },
      // ── Act 3 Dungeons ──
      { targetMap: 'oasisDepths', fromX: 225, fromY: 160, toX: 50, toY: 1 },
      { targetMap: 'desertTomb', fromX: 250, fromY: 140, toX: 50, toY: 1 },
      { targetMap: 'banditHideout', fromX: 298, fromY: 130, toX: 50, toY: 1 },
      { targetMap: 'scorchedRuins', fromX: 278, fromY: 82, toX: 50, toY: 1 },
      // ── Act 4 Dungeons ──
      { targetMap: 'emberMines', fromX: 202, fromY: 48, toX: 50, toY: 1 },
      { targetMap: 'magmaTunnels', fromX: 242, fromY: 93, toX: 50, toY: 1 },
      { targetMap: 'magmaTunnels', fromX: 242, fromY: 81, toX: 50, toY: 1, toFloor: 5 },
      { targetMap: 'obsidianCavern', fromX: 185, fromY: 48, toX: 50, toY: 1 },
      // Volcanic Forge: gate dungeon
      { targetMap: 'volcanicForge', fromX: 172, fromY: 110, toX: 50, toY: 1 },
      { targetMap: 'volcanicForge', fromX: 148, fromY: 110, toX: 50, toY: 78, toFloor: 7 },
      // ── Act 5 Towns ──
      { targetMap: 'lastBastion', fromX: 100, fromY: 150, toX: 8, toY: 14 },
      { targetMap: 'havensEdge', fromX: 70, fromY: 100, toX: 8, toY: 14 },
      // ── Act 5 Dungeons ──
      { targetMap: 'demonBarracks', fromX: 80, fromY: 60, toX: 50, toY: 1 },
      { targetMap: 'voidRift', fromX: 120, fromY: 70, toX: 50, toY: 1 },
      { targetMap: 'demonCastle', fromX: 85, fromY: 30, toX: 50, toY: 99 },
      // Portal lands
      { targetMap: 'stormreachIsles', fromX: 40, fromY: 50, toX: 20, toY: 38 },
      { targetMap: 'frostfallPeaks', fromX: 130, fromY: 40, toX: 20, toY: 38 },
      { targetMap: 'sunkenTempleIsle', fromX: 50, fromY: 130, toX: 20, toY: 38 },
      { targetMap: 'twilightRealm', fromX: 120, fromY: 140, toX: 20, toY: 38 },
    ],
    npcs: [],
  },

  // ═══════════════════════════════════════════════════════════════════
  //   TOWNS
  // ═══════════════════════════════════════════════════════════════════

  // ── Act 1 ──
  greenhollow: {
    id: 'greenhollow',
    nameKey: 'map.greenhollow',
    type: 'town',
    width: 16,
    height: 16,
    connections: [
      { targetMap: 'overworld', fromX: 8, fromY: 15, toX: 60, toY: 341 },
    ],
    npcs: [
      { id: 'elder', dialogueKey: 'npc.elder.greeting', x: 8, y: 3 },
      { id: 'healer', dialogueKey: 'npc.healer', x: 3, y: 12 },
      { id: 'villager1', dialogueKey: 'npc.villager1', x: 3, y: 5 },
      { id: 'villager2', dialogueKey: 'npc.villager2', x: 12, y: 5 },
      { id: 'fisherman', dialogueKey: 'npc.fisherman', x: 13, y: 10 },
      { id: 'kiki', dialogueKey: 'npc.kiki.greeting', x: 6, y: 3 },
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
      { targetMap: 'overworld', fromX: 8, fromY: 15, toX: 100, toY: 321 },
    ],
    npcs: [
      { id: 'healer', dialogueKey: 'npc.healer', x: 3, y: 12 },
      { id: 'miller', dialogueKey: 'npc.miller', x: 3, y: 5 },
      { id: 'herbalist', dialogueKey: 'npc.herbalist', x: 12, y: 5 },
      { id: 'sage', dialogueKey: 'npc.sage.greeting', x: 8, y: 3 },
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
      { targetMap: 'overworld', fromX: 8, fromY: 15, toX: 130, toY: 291 },
    ],
    npcs: [
      { id: 'healer', dialogueKey: 'npc.healer', x: 3, y: 12 },
      { id: 'sailor', dialogueKey: 'npc.sailor', x: 3, y: 5 },
      { id: 'wisewoman', dialogueKey: 'npc.wisewoman', x: 12, y: 5 },
      { id: 'drake', dialogueKey: 'npc.drake.greeting', x: 8, y: 3 },
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
      { targetMap: 'overworld', fromX: 8, fromY: 15, toX: 200, toY: 321 },
    ],
    npcs: [
      { id: 'healer', dialogueKey: 'npc.healer', x: 3, y: 12 },
      { id: 'soldier', dialogueKey: 'npc.soldier', x: 7, y: 10 },
      { id: 'blacksmith', dialogueKey: 'npc.blacksmith', x: 3, y: 5 },
      { id: 'gordo', dialogueKey: 'npc.gordo.greeting', x: 12, y: 5 },
    ],
    shopId: 'ironkeep',
    savePoint: { x: 8, y: 10 },
  },
  frostwatch: {
    id: 'frostwatch',
    nameKey: 'map.frostwatch',
    type: 'town',
    width: 16,
    height: 16,
    connections: [
      { targetMap: 'overworld', fromX: 8, fromY: 15, toX: 222, toY: 263 },
    ],
    npcs: [
      { id: 'healer', dialogueKey: 'npc.healer', x: 3, y: 12 },
      { id: 'frostElder', dialogueKey: 'npc.frostElder', x: 3, y: 5 },
      { id: 'frostGuard', dialogueKey: 'npc.frostGuard', x: 10, y: 13 },
      { id: 'mountaineer', dialogueKey: 'npc.mountaineer', x: 8, y: 8 },
      { id: 'frostVillager', dialogueKey: 'npc.frostVillager', x: 6, y: 12 },
    ],
    shopId: 'frostwatch',
    savePoint: { x: 8, y: 10 },
  },
  hauntedVillage: {
    id: 'hauntedVillage',
    nameKey: 'map.hauntedVillage',
    type: 'town',
    width: 16,
    height: 16,
    connections: [
      { targetMap: 'overworld', fromX: 8, fromY: 15, toX: 252, toY: 243 },
    ],
    npcs: [
      { id: 'healer', dialogueKey: 'npc.healer', x: 3, y: 12 },
      { id: 'hauntedElder', dialogueKey: 'npc.hauntedElder', x: 3, y: 5 },
      { id: 'hauntedGuard', dialogueKey: 'npc.hauntedGuard', x: 10, y: 13 },
      { id: 'hauntedVillager', dialogueKey: 'npc.hauntedVillager', x: 8, y: 8 },
    ],
    shopId: 'hauntedVillage',
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
      { targetMap: 'overworld', fromX: 8, fromY: 15, toX: 220, toY: 151 },
    ],
    npcs: [
      { id: 'healer', dialogueKey: 'npc.healer', x: 3, y: 12 },
      { id: 'oasisElder', dialogueKey: 'npc.oasisElder', x: 3, y: 5 },
      { id: 'archaeologist', dialogueKey: 'npc.archaeologist.greeting', x: 12, y: 3 },
      { id: 'luna', dialogueKey: 'npc.luna.greeting', x: 8, y: 3 },
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
      { targetMap: 'overworld', fromX: 8, fromY: 15, toX: 270, toY: 121 },
    ],
    npcs: [
      { id: 'healer', dialogueKey: 'npc.healer', x: 3, y: 12 },
      { id: 'explorer', dialogueKey: 'npc.explorer', x: 12, y: 5 },
      { id: 'mercenary', dialogueKey: 'npc.mercenary', x: 9, y: 3 },
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
      { targetMap: 'overworld', fromX: 8, fromY: 15, toX: 195, toY: 81 },
    ],
    npcs: [
      { id: 'healer', dialogueKey: 'npc.healer', x: 3, y: 12 },
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
      { targetMap: 'overworld', fromX: 8, fromY: 15, toX: 100, toY: 151 },
    ],
    npcs: [
      { id: 'healer', dialogueKey: 'npc.healer', x: 3, y: 12 },
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
      { targetMap: 'overworld', fromX: 8, fromY: 15, toX: 70, toY: 101 },
    ],
    npcs: [
      { id: 'healer', dialogueKey: 'npc.healer', x: 3, y: 12 },
      { id: 'grizzledKnight', dialogueKey: 'npc.grizzledKnight', x: 3, y: 5 },
      { id: 'prophetess', dialogueKey: 'npc.prophetess', x: 12, y: 5 },
      { id: 'kiki', dialogueKey: 'npc.kiki.greeting', x: 8, y: 3 },
    ],
    shopId: 'havensEdge',
    savePoint: { x: 8, y: 10 },
  },

  // ═══════════════════════════════════════════════════════════════════
  //   DUNGEONS
  // ═══════════════════════════════════════════════════════════════════

  // ── Act 1 ──
  sunkenCellar: {
    id: 'sunkenCellar',
    nameKey: 'map.sunkenCellar',
    type: 'dungeon',
    encounterZone: 'sunken-cellar',
    width: 100,
    height: 100,
    connections: [
      { targetMap: 'overworld', fromX: 50, fromY: 0, toX: 45, toY: 351 },
    ],
    npcs: [],
    bossId: 'giantCrab',
    floors: 3,
  },
  whisperingWoodsCave: {
    id: 'whisperingWoodsCave',
    nameKey: 'map.whisperingWoodsCave',
    type: 'dungeon',
    encounterZone: 'whispering-woods',
    width: 100,
    height: 100,
    connections: [
      { targetMap: 'overworld', fromX: 50, fromY: 0, toX: 80, toY: 311 },
    ],
    npcs: [],
    bossId: 'treant',
    floors: 3,
  },
  coastalReef: {
    id: 'coastalReef',
    nameKey: 'map.coastalReef',
    type: 'dungeon',
    encounterZone: 'coastal-reef',
    width: 100,
    height: 100,
    connections: [
      { targetMap: 'overworld', fromX: 50, fromY: 0, toX: 140, toY: 351 },
    ],
    npcs: [],
    bossId: 'tidalSerpent',
    floors: 3,
  },
  mistyGrotto: {
    id: 'mistyGrotto',
    nameKey: 'map.mistyGrotto',
    type: 'dungeon',
    encounterZone: 'misty-grotto',
    width: 100,
    height: 100,
    connections: [
      { targetMap: 'overworld', fromX: 50, fromY: 0, toX: 120, toY: 261 },
    ],
    npcs: [],
    bossId: 'giantToad',
    floors: 3,
  },
  // Crystal Cave — gate dungeon
  crystalCave: {
    id: 'crystalCave',
    nameKey: 'map.crystalCave',
    type: 'dungeon',
    encounterZone: 'crystal-cave',
    width: 100,
    height: 100,
    connections: [
      { targetMap: 'overworld', fromX: 50, fromY: 99, toX: 148, toY: 296 },
      { targetMap: 'overworld', fromX: 50, fromY: 0, toX: 172, toY: 306 },
    ],
    npcs: [],
    bossId: 'serpent',
    floors: 6,
  },

  // ── Act 2 ──
  ironMine: {
    id: 'ironMine',
    nameKey: 'map.ironMine',
    type: 'dungeon',
    encounterZone: 'iron-mine',
    width: 100,
    height: 100,
    connections: [
      { targetMap: 'overworld', fromX: 50, fromY: 0, toX: 185, toY: 336 },
    ],
    npcs: [],
    bossId: 'ironGolem',
    floors: 3,
  },
  stormNest: {
    id: 'stormNest',
    nameKey: 'map.stormNest',
    type: 'dungeon',
    encounterZone: 'storm-nest',
    width: 100,
    height: 100,
    connections: [
      { targetMap: 'overworld', fromX: 50, fromY: 99, toX: 280, toY: 296 },
    ],
    npcs: [],
    bossId: 'stormHarpy',
    floors: 5,
  },
  hauntedForest: {
    id: 'hauntedForest',
    nameKey: 'map.hauntedForest',
    type: 'dungeon',
    encounterZone: 'haunted-forest',
    width: 100,
    height: 100,
    connections: [
      { targetMap: 'overworld', fromX: 12, fromY: 24, toX: 238, toY: 249 },
      { targetMap: 'overworld', fromX: 12, fromY: 0, toX: 242, toY: 249 },
    ],
    npcs: [],
    bossId: 'banshee',
    floors: 6,
  },
  frozenLake: {
    id: 'frozenLake',
    nameKey: 'map.frozenLake',
    type: 'dungeon',
    encounterZone: 'frozen-lake',
    width: 100,
    height: 100,
    connections: [
      { targetMap: 'overworld', fromX: 50, fromY: 0, toX: 200, toY: 266 },
    ],
    npcs: [],
    bossId: 'iceWyrm',
    floors: 4,
  },
  // Shadow Cave — gate dungeon
  shadowCave: {
    id: 'shadowCave',
    nameKey: 'map.shadowCave',
    type: 'dungeon',
    encounterZone: 'shadow-cave',
    width: 100,
    height: 100,
    connections: [
      { targetMap: 'overworld', fromX: 50, fromY: 0, toX: 260, toY: 235 },
      { targetMap: 'overworld', fromX: 50, fromY: 66, toX: 260, toY: 199 },
    ],
    npcs: [],
    bossId: 'dragon',
    floors: 6,
  },

  // ── Act 3 ──
  oasisDepths: {
    id: 'oasisDepths',
    nameKey: 'map.oasisDepths',
    type: 'dungeon',
    encounterZone: 'oasis-depths',
    width: 100,
    height: 100,
    connections: [
      { targetMap: 'overworld', fromX: 50, fromY: 0, toX: 225, toY: 161 },
    ],
    npcs: [],
    bossId: 'sandGolem',
    floors: 4,
  },
  desertTomb: {
    id: 'desertTomb',
    nameKey: 'map.desertTomb',
    type: 'dungeon',
    encounterZone: 'desert-tomb',
    width: 100,
    height: 100,
    connections: [
      { targetMap: 'overworld', fromX: 50, fromY: 0, toX: 250, toY: 141 },
    ],
    npcs: [],
    bossId: 'mummy',
    floors: 5,
  },
  banditHideout: {
    id: 'banditHideout',
    nameKey: 'map.banditHideout',
    type: 'dungeon',
    encounterZone: 'bandit-hideout',
    width: 100,
    height: 100,
    connections: [
      { targetMap: 'overworld', fromX: 50, fromY: 0, toX: 298, toY: 131 },
    ],
    npcs: [],
    bossId: 'banditLord',
    floors: 5,
  },
  scorchedRuins: {
    id: 'scorchedRuins',
    nameKey: 'map.scorchedRuins',
    type: 'dungeon',
    encounterZone: 'scorched-ruins',
    width: 100,
    height: 100,
    connections: [
      { targetMap: 'overworld', fromX: 50, fromY: 0, toX: 278, toY: 83 },
    ],
    npcs: [],
    bossId: 'fireElemental',
    floors: 4,
  },

  // ── Act 4 ──
  emberMines: {
    id: 'emberMines',
    nameKey: 'map.emberMines',
    type: 'dungeon',
    encounterZone: 'ember-mines',
    width: 100,
    height: 100,
    connections: [
      { targetMap: 'overworld', fromX: 50, fromY: 0, toX: 202, toY: 49 },
    ],
    npcs: [],
    bossId: 'magmaWorm',
    floors: 4,
  },
  magmaTunnels: {
    id: 'magmaTunnels',
    nameKey: 'map.magmaTunnels',
    type: 'dungeon',
    encounterZone: 'magma-tunnels',
    width: 100,
    height: 100,
    connections: [
      { targetMap: 'overworld', fromX: 50, fromY: 0, toX: 242, toY: 94 },
      { targetMap: 'overworld', fromX: 50, fromY: 0, toX: 242, toY: 82 },
    ],
    npcs: [],
    bossId: 'lavaWyrm',
    floors: 6,
  },
  obsidianCavern: {
    id: 'obsidianCavern',
    nameKey: 'map.obsidianCavern',
    type: 'dungeon',
    encounterZone: 'obsidian-cavern',
    width: 100,
    height: 100,
    connections: [
      { targetMap: 'overworld', fromX: 50, fromY: 0, toX: 185, toY: 49 },
    ],
    npcs: [],
    bossId: 'obsidianGolem',
    floors: 4,
  },
  // Volcanic Forge — gate dungeon
  volcanicForge: {
    id: 'volcanicForge',
    nameKey: 'map.volcanicForge',
    type: 'dungeon',
    encounterZone: 'volcanic-forge',
    width: 100,
    height: 100,
    connections: [
      { targetMap: 'overworld', fromX: 50, fromY: 0, toX: 172, toY: 111 },
      { targetMap: 'overworld', fromX: 50, fromY: 78, toX: 148, toY: 111 },
    ],
    npcs: [],
    bossId: 'flameTitan',
    floors: 8,
  },

  // ── Act 5 ──
  demonBarracks: {
    id: 'demonBarracks',
    nameKey: 'map.demonBarracks',
    type: 'dungeon',
    encounterZone: 'demon-barracks',
    width: 100,
    height: 100,
    connections: [
      { targetMap: 'overworld', fromX: 50, fromY: 0, toX: 80, toY: 61 },
    ],
    npcs: [],
    bossId: 'demonGeneral',
    floors: 5,
  },
  voidRift: {
    id: 'voidRift',
    nameKey: 'map.voidRift',
    type: 'dungeon',
    encounterZone: 'void-rift',
    width: 100,
    height: 100,
    connections: [
      { targetMap: 'overworld', fromX: 50, fromY: 0, toX: 120, toY: 71 },
    ],
    npcs: [],
    bossId: 'voidStalker',
    floors: 5,
  },
  // Demon Castle — final dungeon
  demonCastle: {
    id: 'demonCastle',
    nameKey: 'map.demonCastle',
    type: 'dungeon',
    encounterZone: 'demon-castle',
    width: 100,
    height: 100,
    connections: [
      { targetMap: 'overworld', fromX: 50, fromY: 99, toX: 85, toY: 31 },
    ],
    npcs: [],
    bossId: 'demonKing',
    floors: 7,
    castle: true,
  },

  // ═══════════════════════════════════════════════════════════════════
  //   PORTAL LANDS — 4 legendary relic locations in Act 5
  // ═══════════════════════════════════════════════════════════════════

  // ── Stormreach Isles (sky/wind) — Gale Shield ──
  stormreachIsles: {
    id: 'stormreachIsles',
    nameKey: 'map.stormreachIsles',
    type: 'portal-overworld',
    encounterZone: 'stormreach-isles',
    theme: 'sky',
    width: 40,
    height: 40,
    connections: [
      { targetMap: 'overworld', fromX: 20, fromY: 39, toX: 40, toY: 51 },
    ],
    npcs: [],
  },
  stormreachVillage: {
    id: 'stormreachVillage',
    nameKey: 'map.stormreachVillage',
    type: 'town',
    width: 16,
    height: 16,
    connections: [
      { targetMap: 'stormreachIsles', fromX: 8, fromY: 15, toX: 10, toY: 20 },
    ],
    npcs: [
      { id: 'healer', dialogueKey: 'npc.healer', x: 3, y: 12 },
      { id: 'skyKeeper', dialogueKey: 'npc.skyKeeper', x: 12, y: 5 },
    ],
    shopId: 'stormreachVillage',
    savePoint: { x: 8, y: 10 },
  },
  stormreachSpire: {
    id: 'stormreachSpire',
    nameKey: 'map.stormreachSpire',
    type: 'dungeon',
    encounterZone: 'stormreach-isles',
    width: 100,
    height: 100,
    connections: [
      { targetMap: 'stormreachIsles', fromX: 15, fromY: 0, toX: 25, toY: 10 },
    ],
    npcs: [],
    bossId: 'stormSentinel',
    floors: 6,
    mechanic: 'wind',
    tileTheme: 'sky',
  },

  // ── Frostfall Peaks (ice) — Crown of Wisdom ──
  frostfallPeaks: {
    id: 'frostfallPeaks',
    nameKey: 'map.frostfallPeaks',
    type: 'portal-overworld',
    encounterZone: 'frostfall-peaks',
    theme: 'ice',
    width: 40,
    height: 40,
    connections: [
      { targetMap: 'overworld', fromX: 20, fromY: 39, toX: 130, toY: 41 },
    ],
    npcs: [],
  },
  frostfallVillage: {
    id: 'frostfallVillage',
    nameKey: 'map.frostfallVillage',
    type: 'town',
    width: 16,
    height: 16,
    connections: [
      { targetMap: 'frostfallPeaks', fromX: 8, fromY: 15, toX: 10, toY: 20 },
    ],
    npcs: [
      { id: 'healer', dialogueKey: 'npc.healer', x: 3, y: 12 },
      { id: 'frostSage', dialogueKey: 'npc.frostSage', x: 12, y: 5 },
    ],
    shopId: 'frostfallVillage',
    savePoint: { x: 8, y: 10 },
  },
  frostfallCavern: {
    id: 'frostfallCavern',
    nameKey: 'map.frostfallCavern',
    type: 'dungeon',
    encounterZone: 'frostfall-peaks',
    width: 100,
    height: 100,
    connections: [
      { targetMap: 'frostfallPeaks', fromX: 15, fromY: 0, toX: 25, toY: 10 },
    ],
    npcs: [],
    bossId: 'frostMonarch',
    floors: 6,
    mechanic: 'ice',
    tileTheme: 'ice',
  },

  // ── Sunken Temple Isle (ancient/holy) — Excalibur ──
  sunkenTempleIsle: {
    id: 'sunkenTempleIsle',
    nameKey: 'map.sunkenTempleIsle',
    type: 'portal-overworld',
    encounterZone: 'sunken-temple',
    theme: 'ancient',
    width: 40,
    height: 40,
    connections: [
      { targetMap: 'overworld', fromX: 20, fromY: 39, toX: 50, toY: 131 },
    ],
    npcs: [],
  },
  sunkenTempleVillage: {
    id: 'sunkenTempleVillage',
    nameKey: 'map.sunkenTempleVillage',
    type: 'town',
    width: 16,
    height: 16,
    connections: [
      { targetMap: 'sunkenTempleIsle', fromX: 8, fromY: 15, toX: 10, toY: 20 },
    ],
    npcs: [
      { id: 'healer', dialogueKey: 'npc.healer', x: 3, y: 12 },
      { id: 'templeScholar', dialogueKey: 'npc.templeScholar', x: 12, y: 5 },
    ],
    shopId: 'sunkenTempleVillage',
    savePoint: { x: 8, y: 10 },
  },
  sunkenTempleDungeon: {
    id: 'sunkenTempleDungeon',
    nameKey: 'map.sunkenTempleDungeon',
    type: 'dungeon',
    encounterZone: 'sunken-temple',
    width: 100,
    height: 100,
    connections: [
      { targetMap: 'sunkenTempleIsle', fromX: 15, fromY: 0, toX: 25, toY: 10 },
    ],
    npcs: [],
    bossId: 'swordWraith',
    floors: 6,
    mechanic: 'water',
    tileTheme: 'ancient',
  },

  // ── Twilight Realm (shadow/void) — Aegis of Dawn ──
  twilightRealm: {
    id: 'twilightRealm',
    nameKey: 'map.twilightRealm',
    type: 'portal-overworld',
    encounterZone: 'twilight-realm',
    theme: 'shadow',
    width: 40,
    height: 40,
    connections: [
      { targetMap: 'overworld', fromX: 20, fromY: 39, toX: 120, toY: 141 },
    ],
    npcs: [],
  },
  twilightVillage: {
    id: 'twilightVillage',
    nameKey: 'map.twilightVillage',
    type: 'town',
    width: 16,
    height: 16,
    connections: [
      { targetMap: 'twilightRealm', fromX: 8, fromY: 15, toX: 10, toY: 20 },
    ],
    npcs: [
      { id: 'healer', dialogueKey: 'npc.healer', x: 3, y: 12 },
      { id: 'shadowWatcher', dialogueKey: 'npc.shadowWatcher', x: 12, y: 5 },
    ],
    shopId: 'twilightVillage',
    savePoint: { x: 8, y: 10 },
  },
  twilightDungeon: {
    id: 'twilightDungeon',
    nameKey: 'map.twilightDungeon',
    type: 'dungeon',
    encounterZone: 'twilight-realm',
    width: 100,
    height: 100,
    connections: [
      { targetMap: 'twilightRealm', fromX: 15, fromY: 0, toX: 25, toY: 10 },
    ],
    npcs: [],
    bossId: 'celestialGuardian',
    floors: 6,
    mechanic: 'shadow',
    tileTheme: 'shadow',
  },
};
