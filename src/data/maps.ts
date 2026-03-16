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
}

export const mapDefs: Record<string, MapDef> = {
  overworld: {
    id: 'overworld',
    nameKey: 'map.overworld',
    type: 'overworld',
    width: 80,
    height: 80,
    connections: [
      // ── Town entrances on overworld ──
      { targetMap: 'greenhollow', fromX: 10, fromY: 50, toX: 8, toY: 14 },
      { targetMap: 'portSapphire', fromX: 38, fromY: 40, toX: 8, toY: 14 },
      { targetMap: 'ironkeep', fromX: 48, fromY: 25, toX: 8, toY: 14 },
      { targetMap: 'ruinsCamp', fromX: 48, fromY: 11, toX: 8, toY: 14 },
      { targetMap: 'lastBastion', fromX: 56, fromY: 5, toX: 8, toY: 14 },
      // ── Dungeon entrances ──
      { targetMap: 'mistyGrotto', fromX: 16, fromY: 45, toX: 7, toY: 2 },
      { targetMap: 'crystalCave', fromX: 40, fromY: 31, toX: 10, toY: 60 },
      { targetMap: 'crystalCave', fromX: 40, fromY: 26, toX: 10, toY: 1 },
      { targetMap: 'shadowTower', fromX: 50, fromY: 19, toX: 12, toY: 2 },
      { targetMap: 'shadowTower', fromX: 50, fromY: 14, toX: 12, toY: 23, toFloor: 5 },
      { targetMap: 'volcanicForge', fromX: 56, fromY: 9, toX: 12, toY: 2 },
      { targetMap: 'volcanicForge', fromX: 56, fromY: 7, toX: 12, toY: 23, toFloor: 5 },
      { targetMap: 'demonCastle', fromX: 58, fromY: 4, toX: 16, toY: 2 },
      // ── Hidden legendary dungeons (Act 5 — far corners) ──
      { targetMap: 'sealedSanctum', fromX: 4, fromY: 4, toX: 14, toY: 2 },
      { targetMap: 'celestialVault', fromX: 75, fromY: 4, toX: 14, toY: 2 },
    ],
    npcs: [],
  },

  // ═══════════════════════════════════════════════════════════════════
  //   TOWNS — 9 total
  // ═══════════════════════════════════════════════════════════════════

  greenhollow: {
    id: 'greenhollow',
    nameKey: 'map.greenhollow',
    type: 'town',
    width: 16,
    height: 16,
    connections: [
      { targetMap: 'overworld', fromX: 8, fromY: 15, toX: 10, toY: 51 },
    ],
    npcs: [
      { id: 'elder', dialogueKey: 'npc.elder.greeting', x: 8, y: 3 },
      { id: 'villager1', dialogueKey: 'npc.villager1', x: 3, y: 5 },
      { id: 'villager2', dialogueKey: 'npc.villager2', x: 12, y: 5 },
    ],
    shopId: 'greenhollow',
    savePoint: { x: 8, y: 10 },
  },
  portSapphire: {
    id: 'portSapphire',
    nameKey: 'map.portSapphire',
    type: 'town',
    width: 16,
    height: 16,
    connections: [
      { targetMap: 'overworld', fromX: 8, fromY: 15, toX: 38, toY: 41 },
    ],
    npcs: [
      { id: 'sailor', dialogueKey: 'npc.sailor', x: 3, y: 5 },
      { id: 'wisewoman', dialogueKey: 'npc.wisewoman', x: 12, y: 5 },
    ],
    shopId: 'portSapphire',
    savePoint: { x: 8, y: 10 },
  },
  ironkeep: {
    id: 'ironkeep',
    nameKey: 'map.ironkeep',
    type: 'town',
    width: 16,
    height: 16,
    connections: [
      { targetMap: 'overworld', fromX: 8, fromY: 15, toX: 48, toY: 26 },
    ],
    npcs: [
      { id: 'soldier', dialogueKey: 'npc.soldier', x: 7, y: 10 },
      { id: 'blacksmith', dialogueKey: 'npc.blacksmith', x: 3, y: 5 },
    ],
    shopId: 'ironkeep',
    savePoint: { x: 8, y: 10 },
  },
  ruinsCamp: {
    id: 'ruinsCamp',
    nameKey: 'map.ruinsCamp',
    type: 'town',
    width: 16,
    height: 16,
    connections: [
      { targetMap: 'overworld', fromX: 8, fromY: 15, toX: 48, toY: 12 },
    ],
    npcs: [
      { id: 'archaeologist', dialogueKey: 'npc.archaeologist', x: 3, y: 5 },
      { id: 'explorer', dialogueKey: 'npc.explorer', x: 12, y: 5 },
    ],
    shopId: 'ruinsCamp',
    savePoint: { x: 8, y: 10 },
  },
  lastBastion: {
    id: 'lastBastion',
    nameKey: 'map.lastBastion',
    type: 'town',
    width: 16,
    height: 16,
    connections: [
      { targetMap: 'overworld', fromX: 8, fromY: 15, toX: 56, toY: 6 },
    ],
    npcs: [
      { id: 'veteran', dialogueKey: 'npc.veteran', x: 3, y: 5 },
      { id: 'priestess', dialogueKey: 'npc.priestess', x: 12, y: 5 },
    ],
    shopId: 'lastBastion',
    savePoint: { x: 8, y: 10 },
  },

  // ═══════════════════════════════════════════════════════════════════
  //   DUNGEONS — 8 total
  // ═══════════════════════════════════════════════════════════════════

  // Act 1 tutorial dungeon — near Greenhollow in the southern plains
  mistyGrotto: {
    id: 'mistyGrotto',
    nameKey: 'map.mistyGrotto',
    type: 'dungeon',
    encounterZone: 'misty-grotto',
    width: 15,
    height: 15,
    connections: [
      { targetMap: 'overworld', fromX: 7, fromY: 0, toX: 16, toY: 46 },
    ],
    npcs: [],
    bossId: 'giantToad',
    floors: 1,
  },
  // Act 1 GATE dungeon — tunnels UNDER the river barrier
  // South entrance at (40,31) Act 1 side, north exit at (40,26) Act 2 side
  // Single tall floor (21×63) — boss blocks north passage until defeated
  crystalCave: {
    id: 'crystalCave',
    nameKey: 'map.crystalCave',
    type: 'dungeon',
    encounterZone: 'crystal-cave',
    width: 21,
    height: 63,
    connections: [
      { targetMap: 'overworld', fromX: 10, fromY: 62, toX: 40, toY: 32 }, // south exit → Act 1
      { targetMap: 'overworld', fromX: 10, fromY: 0, toX: 40, toY: 25 },  // north exit → Act 2
    ],
    npcs: [],
    bossId: 'serpent',
    floors: 1,
  },
  // Act 2 GATE dungeon — passage THROUGH the mountain barrier
  // Entrance at south face (50,19), exit at north face (50,14)
  shadowTower: {
    id: 'shadowTower',
    nameKey: 'map.shadowTower',
    type: 'dungeon',
    encounterZone: 'shadow-tower',
    width: 25,
    height: 25,
    connections: [
      { targetMap: 'overworld', fromX: 12, fromY: 0, toX: 50, toY: 20 },  // south exit (floor 1)
      { targetMap: 'overworld', fromX: 12, fromY: 24, toX: 50, toY: 14 }, // north exit (floor 5)
    ],
    npcs: [],
    bossId: 'dragon',
    floors: 5,
  },
  // Act 4 GATE dungeon — forging through the lava barrier
  // Entrance at south edge (56,9), exit at north edge (56,6)
  volcanicForge: {
    id: 'volcanicForge',
    nameKey: 'map.volcanicForge',
    type: 'dungeon',
    encounterZone: 'volcanic-forge',
    width: 25,
    height: 25,
    connections: [
      { targetMap: 'overworld', fromX: 12, fromY: 0, toX: 56, toY: 10 },  // south exit (floor 1)
      { targetMap: 'overworld', fromX: 12, fromY: 24, toX: 56, toY: 7 }, // north exit (floor 5)
    ],
    npcs: [],
    bossId: 'flameTitan',
    floors: 5,
  },
  // Act 5 final dungeon (expanded, 10 floors)
  demonCastle: {
    id: 'demonCastle',
    nameKey: 'map.demonCastle',
    type: 'dungeon',
    encounterZone: 'demon-castle',
    width: 33,
    height: 33,
    connections: [
      { targetMap: 'overworld', fromX: 16, fromY: 0, toX: 58, toY: 5 },
    ],
    npcs: [],
    bossId: 'demonKing',
    floors: 10,
  },

  // ═══════════════════════════════════════════════════════════════════
  //   HIDDEN LEGENDARY DUNGEONS — Act 5 corners
  // ═══════════════════════════════════════════════════════════════════

  // Sealed Sanctum — far northwest corner of Act 5, guards Excalibur
  sealedSanctum: {
    id: 'sealedSanctum',
    nameKey: 'map.sealedSanctum',
    type: 'dungeon',
    encounterZone: 'sealed-sanctum',
    width: 29,
    height: 29,
    connections: [
      { targetMap: 'overworld', fromX: 14, fromY: 0, toX: 4, toY: 5 },
    ],
    npcs: [],
    bossId: 'swordWraith',
    floors: 7,
  },
  // Celestial Vault — far northeast corner of Act 5, guards Aegis of Dawn
  // Locked until Excalibur obtained (Sword Wraith defeated)
  celestialVault: {
    id: 'celestialVault',
    nameKey: 'map.celestialVault',
    type: 'dungeon',
    encounterZone: 'celestial-vault',
    width: 29,
    height: 29,
    connections: [
      { targetMap: 'overworld', fromX: 14, fromY: 0, toX: 75, toY: 5 },
    ],
    npcs: [],
    bossId: 'celestialGuardian',
    floors: 7,
  },
};
