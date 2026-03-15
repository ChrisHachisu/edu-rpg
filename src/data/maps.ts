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
}

export const mapDefs: Record<string, MapDef> = {
  overworld: {
    id: 'overworld',
    nameKey: 'Eldravia',
    type: 'overworld',
    width: 64,
    height: 64,
    connections: [
      // Town entrances on overworld
      { targetMap: 'greenhollow', fromX: 10, fromY: 50, toX: 8, toY: 14 },
      { targetMap: 'oakshade', fromX: 20, fromY: 38, toX: 8, toY: 14 },
      { targetMap: 'portSapphire', fromX: 38, fromY: 40, toX: 8, toY: 14 },
      { targetMap: 'ironkeep', fromX: 48, fromY: 25, toX: 8, toY: 14 },
      { targetMap: 'ashfall', fromX: 55, fromY: 15, toX: 8, toY: 14 },
      // Dungeon entrances
      { targetMap: 'crystalCave', fromX: 42, fromY: 45, toX: 10, toY: 2 },
      { targetMap: 'shadowTower', fromX: 50, fromY: 20, toX: 12, toY: 2 },
      { targetMap: 'demonCastle', fromX: 58, fromY: 5, toX: 14, toY: 2 },
    ],
    npcs: [],
  },
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
  ashfall: {
    id: 'ashfall',
    nameKey: 'Ashfall Outpost',
    type: 'town',
    width: 16,
    height: 16,
    connections: [
      { targetMap: 'overworld', fromX: 8, fromY: 15, toX: 55, toY: 16 },
    ],
    npcs: [
      { id: 'oldwarrior', dialogueKey: 'npc.oldwarrior', x: 3, y: 5 },
      { id: 'refugee', dialogueKey: 'npc.refugee', x: 12, y: 5 },
    ],
    shopId: 'ashfall',
    savePoint: { x: 8, y: 10 },
  },
  crystalCave: {
    id: 'crystalCave',
    nameKey: 'Crystal Cave',
    type: 'dungeon',
    encounterZone: 'crystal-cave',
    width: 21,
    height: 21,
    connections: [
      { targetMap: 'overworld', fromX: 10, fromY: 0, toX: 42, toY: 46 },
    ],
    npcs: [],
    bossId: 'serpent',
  },
  shadowTower: {
    id: 'shadowTower',
    nameKey: 'Shadow Tower',
    type: 'dungeon',
    encounterZone: 'shadow-tower',
    width: 25,
    height: 25,
    connections: [
      { targetMap: 'overworld', fromX: 12, fromY: 0, toX: 50, toY: 21 },
    ],
    npcs: [],
    bossId: 'dragon',
  },
  demonCastle: {
    id: 'demonCastle',
    nameKey: 'Demon Castle',
    type: 'dungeon',
    encounterZone: 'demon-castle',
    width: 29,
    height: 29,
    connections: [
      { targetMap: 'overworld', fromX: 14, fromY: 0, toX: 58, toY: 6 },
    ],
    npcs: [],
    bossId: 'demonKing',
  },
};
