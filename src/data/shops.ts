import { ShopData } from '../utils/types';

export const shops: Record<string, ShopData> = {
  // ── Act 1 — early game ──
  greenhollow: {
    id: 'greenhollow',
    nameKey: 'npc.shopkeeper',
    items: ['herb', 'smokeBomb', 'woodenSword', 'clothArmor', 'woodenShield', 'leatherCap'],
  },
  millbrook: {
    id: 'millbrook',
    nameKey: 'npc.shopkeeper',
    items: ['herb', 'potion', 'smokeBomb', 'bronzeSword', 'bronzeArmor', 'woodenShield', 'leatherCap'],
  },
  portSapphire: {
    id: 'portSapphire',
    nameKey: 'npc.shopkeeper',
    items: ['herb', 'potion', 'smokeBomb', 'bronzeSword', 'ironSword', 'bronzeArmor', 'leatherArmor', 'ironShield', 'leatherCap', 'ironHelm'],
  },

  // ── Act 2 — mid-early ──
  ironkeep: {
    id: 'ironkeep',
    nameKey: 'npc.shopkeeper',
    items: ['herb', 'potion', 'hiPotion', 'smokeBomb', 'escapeCrystal', 'steelSword', 'mithrilSword', 'chainMail', 'mithrilArmor'],
  },
  frostwatch: {
    id: 'frostwatch',
    nameKey: 'npc.shopkeeper',
    items: ['herb', 'potion', 'hiPotion', 'smokeBomb', 'escapeCrystal', 'steelShield', 'mithrilShield', 'steelHelm'],
  },
  hauntedVillage: {
    id: 'hauntedVillage',
    nameKey: 'npc.shopkeeper',
    items: ['herb', 'potion', 'hiPotion', 'smokeBomb', 'escapeCrystal', 'mithrilSword', 'steelShield', 'steelHelm'],
  },

  // ── Act 3 — mid game ──
  oasisHaven: {
    id: 'oasisHaven',
    nameKey: 'npc.shopkeeper',
    items: ['herb', 'potion', 'hiPotion', 'smokeBomb', 'escapeCrystal', 'flameSword', 'mithrilArmor', 'plateArmor'],
  },
  ruinsCamp: {
    id: 'ruinsCamp',
    nameKey: 'npc.shopkeeper',
    items: ['herb', 'potion', 'hiPotion', 'elixir', 'smokeBomb', 'escapeCrystal', 'plateArmor', 'dragonscaleArmor', 'mithrilShield', 'mithrilHelm'],
  },

  // ── Act 4 — mid-late game ──
  embersRest: {
    id: 'embersRest',
    nameKey: 'npc.shopkeeper',
    items: ['herb', 'potion', 'hiPotion', 'elixir', 'smokeBomb', 'escapeCrystal', 'crystalBlade', 'holyBlade', 'dragonscaleArmor', 'holyArmor'],
  },

  // ── Act 5 — endgame ──
  lastBastion: {
    id: 'lastBastion',
    nameKey: 'npc.shopkeeper',
    items: ['herb', 'potion', 'hiPotion', 'elixir', 'smokeBomb', 'escapeCrystal', 'holyBlade', 'mithrilShield'],
  },
  havensEdge: {
    id: 'havensEdge',
    nameKey: 'npc.shopkeeper',
    items: ['herb', 'potion', 'hiPotion', 'elixir', 'smokeBomb', 'escapeCrystal', 'holyArmor', 'mithrilHelm'],
  },

  // ── Portal Land Villages ──
  stormreachVillage: {
    id: 'stormreachVillage',
    nameKey: 'npc.shopkeeper',
    items: ['herb', 'potion', 'hiPotion', 'elixir', 'smokeBomb', 'holyBlade', 'holyArmor', 'mithrilShield', 'mithrilHelm'],
  },
  frostfallVillage: {
    id: 'frostfallVillage',
    nameKey: 'npc.shopkeeper',
    items: ['herb', 'potion', 'hiPotion', 'elixir', 'smokeBomb', 'holyBlade', 'holyArmor', 'mithrilShield', 'mithrilHelm'],
  },
  sunkenTempleVillage: {
    id: 'sunkenTempleVillage',
    nameKey: 'npc.shopkeeper',
    items: ['herb', 'potion', 'hiPotion', 'elixir', 'smokeBomb', 'holyBlade', 'holyArmor', 'mithrilShield', 'mithrilHelm'],
  },
  twilightVillage: {
    id: 'twilightVillage',
    nameKey: 'npc.shopkeeper',
    items: ['herb', 'potion', 'hiPotion', 'elixir', 'smokeBomb', 'holyBlade', 'holyArmor', 'mithrilShield', 'mithrilHelm'],
  },
};
