// Map metadata defining connections and properties for procedural generation
export interface MapDef {
  id: string;
  nameKey: string;
  type: 'overworld' | 'town' | 'dungeon';
  encounterZone?: string;
  width: number;
  height: number;
  connections: { targetMap: string; fromX: number; fromY: number; toX: number; toY: number }[];
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
    nameKey: 'Eldravia',
    type: 'overworld',
    width: 64,
    height: 64,
    connections: [
      // ── Town entrances on overworld ──
      { targetMap: 'greenhollow', fromX: 10, fromY: 50, toX: 8, toY: 14 },
      { targetMap: 'oakshade', fromX: 20, fromY: 38, toX: 8, toY: 14 },
      { targetMap: 'portSapphire', fromX: 38, fromY: 40, toX: 8, toY: 14 },
      { targetMap: 'tidepools', fromX: 44, fromY: 38, toX: 8, toY: 14 },
      { targetMap: 'ironkeep', fromX: 48, fromY: 25, toX: 8, toY: 14 },
      { targetMap: 'moonvale', fromX: 42, fromY: 21, toX: 8, toY: 14 },
      { targetMap: 'ruinsCamp', fromX: 48, fromY: 11, toX: 8, toY: 14 },
      { targetMap: 'ashfall', fromX: 55, fromY: 13, toX: 8, toY: 14 },
      { targetMap: 'lastBastion', fromX: 56, fromY: 5, toX: 8, toY: 14 },
      // ── Dungeon entrances ──
      { targetMap: 'mistyGrotto', fromX: 16, fromY: 45, toX: 7, toY: 2 },
      { targetMap: 'crystalCave', fromX: 40, fromY: 31, toX: 10, toY: 2 },
      { targetMap: 'coralTunnels', fromX: 44, fromY: 25, toX: 9, toY: 2 },
      { targetMap: 'shadowTower', fromX: 50, fromY: 19, toX: 12, toY: 2 },
      { targetMap: 'frostpeakCavern', fromX: 45, fromY: 13, toX: 11, toY: 2 },
      { targetMap: 'sunkenRuins', fromX: 52, fromY: 11, toX: 13, toY: 2 },
      { targetMap: 'volcanicForge', fromX: 56, fromY: 9, toX: 12, toY: 2 },
      { targetMap: 'demonCastle', fromX: 58, fromY: 4, toX: 16, toY: 2 },
    ],
    npcs: [],
  },

  // ═══════════════════════════════════════════════════════════════════
  //   TOWNS — 9 total
  // ═══════════════════════════════════════════════════════════════════

  greenhollow: {
    id: 'greenhollow',
    nameKey: 'Greenhollow Village',
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
  oakshade: {
    id: 'oakshade',
    nameKey: 'Oakshade Town',
    type: 'town',
    width: 16,
    height: 16,
    connections: [
      { targetMap: 'overworld', fromX: 8, fromY: 15, toX: 20, toY: 39 },
    ],
    npcs: [
      { id: 'guard', dialogueKey: 'npc.guard', x: 7, y: 10 },
      { id: 'scholar', dialogueKey: 'npc.scholar', x: 3, y: 5 },
    ],
    shopId: 'oakshade',
    savePoint: { x: 8, y: 10 },
  },
  portSapphire: {
    id: 'portSapphire',
    nameKey: 'Port Sapphire',
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
  tidepools: {
    id: 'tidepools',
    nameKey: 'Tidepools',
    type: 'town',
    width: 16,
    height: 16,
    connections: [
      { targetMap: 'overworld', fromX: 8, fromY: 15, toX: 44, toY: 39 },
    ],
    npcs: [
      { id: 'fisherman', dialogueKey: 'npc.fisherman', x: 3, y: 5 },
      { id: 'diver', dialogueKey: 'npc.diver', x: 12, y: 5 },
    ],
    shopId: 'tidepools',
    savePoint: { x: 8, y: 10 },
  },
  ironkeep: {
    id: 'ironkeep',
    nameKey: 'Ironkeep Fortress',
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
  moonvale: {
    id: 'moonvale',
    nameKey: 'Moonvale Hamlet',
    type: 'town',
    width: 16,
    height: 16,
    connections: [
      { targetMap: 'overworld', fromX: 8, fromY: 15, toX: 42, toY: 22 },
    ],
    npcs: [
      { id: 'hermit', dialogueKey: 'npc.hermit', x: 3, y: 5 },
      { id: 'miner', dialogueKey: 'npc.miner', x: 12, y: 5 },
    ],
    shopId: 'moonvale',
    savePoint: { x: 8, y: 10 },
  },
  ruinsCamp: {
    id: 'ruinsCamp',
    nameKey: 'Ruins Camp',
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
  ashfall: {
    id: 'ashfall',
    nameKey: 'Ashfall Outpost',
    type: 'town',
    width: 16,
    height: 16,
    connections: [
      { targetMap: 'overworld', fromX: 8, fromY: 15, toX: 55, toY: 14 },
    ],
    npcs: [
      { id: 'oldwarrior', dialogueKey: 'npc.oldwarrior', x: 3, y: 5 },
      { id: 'refugee', dialogueKey: 'npc.refugee', x: 12, y: 5 },
    ],
    shopId: 'ashfall',
    savePoint: { x: 8, y: 10 },
  },
  lastBastion: {
    id: 'lastBastion',
    nameKey: 'Last Bastion',
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
    nameKey: 'Misty Grotto',
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
  // Entrance at south bank (40,31), exit at north bank (40,25)
  crystalCave: {
    id: 'crystalCave',
    nameKey: 'Crystal Cave',
    type: 'dungeon',
    encounterZone: 'crystal-cave',
    width: 21,
    height: 21,
    connections: [
      { targetMap: 'overworld', fromX: 10, fromY: 0, toX: 40, toY: 32 },
    ],
    npcs: [],
    bossId: 'serpent',
    floors: 3,
    exitConnection: { toX: 40, toY: 25 },
  },
  // Act 2 water-themed — north of river near coral formations
  coralTunnels: {
    id: 'coralTunnels',
    nameKey: 'Coral Tunnels',
    type: 'dungeon',
    encounterZone: 'coral-tunnels',
    width: 19,
    height: 19,
    connections: [
      { targetMap: 'overworld', fromX: 9, fromY: 0, toX: 44, toY: 26 },
    ],
    npcs: [],
    bossId: 'kraken',
    floors: 2,
  },
  // Act 2 GATE dungeon — passage THROUGH the mountain barrier
  // Entrance at south face (50,19), exit at north face (50,14)
  shadowTower: {
    id: 'shadowTower',
    nameKey: 'Shadow Tower',
    type: 'dungeon',
    encounterZone: 'shadow-tower',
    width: 25,
    height: 25,
    connections: [
      { targetMap: 'overworld', fromX: 12, fromY: 0, toX: 50, toY: 20 },
    ],
    npcs: [],
    bossId: 'dragon',
    floors: 3,
    exitConnection: { toX: 50, toY: 14 },
  },
  // Act 3 ice-themed — in the cold foothills north of mountains
  frostpeakCavern: {
    id: 'frostpeakCavern',
    nameKey: 'Frostpeak Cavern',
    type: 'dungeon',
    encounterZone: 'frostpeak-cavern',
    width: 23,
    height: 23,
    connections: [
      { targetMap: 'overworld', fromX: 11, fromY: 0, toX: 45, toY: 14 },
    ],
    npcs: [],
    bossId: 'iceWyrm',
    floors: 2,
  },
  // Act 4 ancient ruin — deep in the wasteland between mountains and lava
  sunkenRuins: {
    id: 'sunkenRuins',
    nameKey: 'Sunken Ruins',
    type: 'dungeon',
    encounterZone: 'sunken-ruins',
    width: 27,
    height: 27,
    connections: [
      { targetMap: 'overworld', fromX: 13, fromY: 0, toX: 52, toY: 12 },
    ],
    npcs: [],
    bossId: 'lich',
    floors: 3,
  },
  // Act 4 GATE dungeon — forging through the lava barrier
  // Entrance at south edge (56,9), exit at north edge (56,6)
  volcanicForge: {
    id: 'volcanicForge',
    nameKey: 'Volcanic Forge',
    type: 'dungeon',
    encounterZone: 'volcanic-forge',
    width: 25,
    height: 25,
    connections: [
      { targetMap: 'overworld', fromX: 12, fromY: 0, toX: 56, toY: 10 },
    ],
    npcs: [],
    bossId: 'flameTitan',
    floors: 3,
    exitConnection: { toX: 56, toY: 6 },
  },
  // Act 5 final dungeon (expanded, 5 floors)
  demonCastle: {
    id: 'demonCastle',
    nameKey: 'Demon Castle',
    type: 'dungeon',
    encounterZone: 'demon-castle',
    width: 33,
    height: 33,
    connections: [
      { targetMap: 'overworld', fromX: 16, fromY: 0, toX: 58, toY: 5 },
    ],
    npcs: [],
    bossId: 'demonKing',
    floors: 5,
  },
};
