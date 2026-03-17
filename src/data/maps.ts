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
  //   OVERWORLD — 80×120  (expanded from 80×80; all old Y coords +40)
  //
  //   y=0-1     WATER (north edge)
  //   y=2-61    ACT 5 (60 tiles — mountain maze, Demon Castle island)
  //   y≈62      LAVA BARRIER
  //   y=63-79   ACT 3/4 (16 tiles)
  //   y≈80      MOUNTAIN BARRIER
  //   y=81-97   ACT 2 (16 tiles)
  //   y≈98      RIVER BARRIER
  //   y=99-117  ACT 1 (18 tiles)
  //   y=118-119 WATER (south edge)
  // ═══════════════════════════════════════════════════════════════════
  overworld: {
    id: 'overworld',
    nameKey: 'map.overworld',
    type: 'overworld',
    width: 80,
    height: 120,
    connections: [
      // ── Town entrances on overworld ──
      { targetMap: 'greenhollow', fromX: 10, fromY: 110, toX: 8, toY: 14 },
      { targetMap: 'portSapphire', fromX: 30, fromY: 103, toX: 8, toY: 14 },
      { targetMap: 'ironkeep', fromX: 48, fromY: 89, toX: 8, toY: 14 },
      { targetMap: 'ruinsCamp', fromX: 20, fromY: 68, toX: 8, toY: 14 },
      { targetMap: 'lastBastion', fromX: 56, fromY: 54, toX: 8, toY: 14 },
      // ── Dungeon entrances (toY: 1 = one tile south of stairs at y=0) ──
      { targetMap: 'mistyGrotto', fromX: 16, fromY: 106, toX: 7, toY: 1 },
      { targetMap: 'crystalCave', fromX: 40, fromY: 99, toX: 10, toY: 61 },
      { targetMap: 'crystalCave', fromX: 40, fromY: 97, toX: 10, toY: 1 },
      { targetMap: 'shadowCave', fromX: 50, fromY: 83, toX: 12, toY: 1 },
      { targetMap: 'shadowCave', fromX: 50, fromY: 79, toX: 12, toY: 23, toFloor: 5 },
      { targetMap: 'volcanicForge', fromX: 8, fromY: 63, toX: 12, toY: 1 },
      { targetMap: 'volcanicForge', fromX: 8, fromY: 59, toX: 12, toY: 23, toFloor: 7 },
      { targetMap: 'demonCastle', fromX: 40, fromY: 10, toX: 16, toY: 31 },
      // ── Hidden legendary dungeons (Act 5 — deep in maze) ──
      { targetMap: 'sealedSanctum', fromX: 4, fromY: 46, toX: 14, toY: 1 },
      { targetMap: 'celestialVault', fromX: 75, fromY: 46, toX: 14, toY: 1 },
    ],
    npcs: [],
  },

  // ═══════════════════════════════════════════════════════════════════
  //   TOWNS — 5 total
  // ═══════════════════════════════════════════════════════════════════

  greenhollow: {
    id: 'greenhollow',
    nameKey: 'map.greenhollow',
    type: 'town',
    width: 16,
    height: 16,
    connections: [
      { targetMap: 'overworld', fromX: 8, fromY: 15, toX: 10, toY: 111 },
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
      { targetMap: 'overworld', fromX: 8, fromY: 15, toX: 30, toY: 104 },
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
      { targetMap: 'overworld', fromX: 8, fromY: 15, toX: 48, toY: 90 },
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
      { targetMap: 'overworld', fromX: 8, fromY: 15, toX: 20, toY: 69 },
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
      { targetMap: 'overworld', fromX: 8, fromY: 15, toX: 56, toY: 55 },
    ],
    npcs: [
      { id: 'veteran', dialogueKey: 'npc.veteran', x: 3, y: 5 },
      { id: 'priestess', dialogueKey: 'npc.priestess', x: 12, y: 5 },
    ],
    shopId: 'lastBastion',
    savePoint: { x: 8, y: 10 },
  },

  // ═══════════════════════════════════════════════════════════════════
  //   DUNGEONS — 7 total
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
      { targetMap: 'overworld', fromX: 7, fromY: 0, toX: 16, toY: 107 },
    ],
    npcs: [],
    bossId: 'giantToad',
    floors: 1,
  },
  // Act 1 GATE dungeon — tunnels UNDER the river barrier
  // South entrance at (40,99) Act 1 side, north exit at (40,97) Act 2 side
  // Single tall floor (21×63) — boss blocks north passage until defeated
  crystalCave: {
    id: 'crystalCave',
    nameKey: 'map.crystalCave',
    type: 'dungeon',
    encounterZone: 'crystal-cave',
    width: 21,
    height: 63,
    connections: [
      { targetMap: 'overworld', fromX: 10, fromY: 62, toX: 40, toY: 100 }, // south exit → Act 1
      { targetMap: 'overworld', fromX: 10, fromY: 0, toX: 40, toY: 96 },  // north exit → Act 2
    ],
    npcs: [],
    bossId: 'serpent',
    floors: 1,
  },
  // Act 2 GATE dungeon — passage THROUGH the mountain barrier
  // Entrance at south face (50,83), exit at north face (50,79)
  // Shifted 1 tile south from original position
  shadowCave: {
    id: 'shadowCave',
    nameKey: 'map.shadowCave',
    type: 'dungeon',
    encounterZone: 'shadow-cave',
    width: 25,
    height: 25,
    connections: [
      { targetMap: 'overworld', fromX: 12, fromY: 0, toX: 50, toY: 84 },  // south exit (floor 1)
      { targetMap: 'overworld', fromX: 12, fromY: 24, toX: 50, toY: 78 }, // north exit (floor 5)
    ],
    npcs: [],
    bossId: 'dragon',
    floors: 5,
  },
  // Act 3/4 GATE dungeon — forging through the lava barrier
  // Relocated west: entrance at (8,63), exit at (8,59)
  // Expanded from 5 to 7 floors: B1F→B2F→B3F→B4F→B3F→B2F→B1F
  volcanicForge: {
    id: 'volcanicForge',
    nameKey: 'map.volcanicForge',
    type: 'dungeon',
    encounterZone: 'volcanic-forge',
    width: 25,
    height: 25,
    connections: [
      { targetMap: 'overworld', fromX: 12, fromY: 0, toX: 8, toY: 64 },   // south exit (floor 1)
      { targetMap: 'overworld', fromX: 12, fromY: 24, toX: 8, toY: 58 },  // north exit (floor 7)
    ],
    npcs: [],
    bossId: 'flameTitan',
    floors: 7,
  },
  // Act 5 final dungeon — castle with upward progression (10 floors)
  // Entrance at bottom of castle (y=32), climb upward to boss at top
  demonCastle: {
    id: 'demonCastle',
    nameKey: 'map.demonCastle',
    type: 'dungeon',
    encounterZone: 'demon-castle',
    width: 33,
    height: 33,
    connections: [
      { targetMap: 'overworld', fromX: 16, fromY: 32, toX: 40, toY: 11 },
    ],
    npcs: [],
    bossId: 'demonKing',
    floors: 10,
    castle: true,
  },

  // ═══════════════════════════════════════════════════════════════════
  //   HIDDEN LEGENDARY DUNGEONS — Act 5 maze, no direct paths
  // ═══════════════════════════════════════════════════════════════════

  // Sealed Sanctum — hidden in western maze of Act 5, guards Excalibur
  sealedSanctum: {
    id: 'sealedSanctum',
    nameKey: 'map.sealedSanctum',
    type: 'dungeon',
    encounterZone: 'sealed-sanctum',
    width: 29,
    height: 29,
    connections: [
      { targetMap: 'overworld', fromX: 14, fromY: 0, toX: 4, toY: 47 },
    ],
    npcs: [],
    bossId: 'swordWraith',
    floors: 7,
  },
  // Celestial Vault — hidden in eastern maze of Act 5, guards Aegis of Dawn
  // Locked until Excalibur obtained (Sword Wraith defeated)
  celestialVault: {
    id: 'celestialVault',
    nameKey: 'map.celestialVault',
    type: 'dungeon',
    encounterZone: 'celestial-vault',
    width: 29,
    height: 29,
    connections: [
      { targetMap: 'overworld', fromX: 14, fromY: 0, toX: 75, toY: 47 },
    ],
    npcs: [],
    bossId: 'celestialGuardian',
    floors: 7,
  },
};
