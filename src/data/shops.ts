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
    items: ['potion', 'hiPotion', 'smokeBomb', 'steelSword', 'mithrilSword', 'chainMail', 'mithrilArmor', 'steelShield', 'steelHelm'],
  },
  highwatch: {
    id: 'highwatch',
    nameKey: 'npc.shopkeeper',
    items: ['potion', 'hiPotion', 'smokeBomb', 'steelSword', 'chainMail', 'steelShield', 'ironHelm', 'steelHelm'],
  },

  // ── Act 3 — mid game ──
  oasisHaven: {
    id: 'oasisHaven',
    nameKey: 'npc.shopkeeper',
    items: ['hiPotion', 'smokeBomb', 'mithrilSword', 'flameSword', 'mithrilArmor', 'plateArmor', 'mithrilShield', 'mithrilHelm'],
  },
  ruinsCamp: {
    id: 'ruinsCamp',
    nameKey: 'npc.shopkeeper',
    items: ['hiPotion', 'elixir', 'smokeBomb', 'flameSword', 'crystalBlade', 'plateArmor', 'dragonscaleArmor', 'mithrilShield', 'mithrilHelm'],
  },

  // ── Act 4 — mid-late game ──
  embersRest: {
    id: 'embersRest',
    nameKey: 'npc.shopkeeper',
    items: ['hiPotion', 'elixir', 'smokeBomb', 'crystalBlade', 'holyBlade', 'dragonscaleArmor', 'holyArmor', 'mithrilShield', 'mithrilHelm'],
  },

  // ── Act 5 — endgame ──
  lastBastion: {
    id: 'lastBastion',
    nameKey: 'npc.shopkeeper',
    items: ['elixir', 'smokeBomb', 'holyBlade', 'holyArmor', 'mithrilShield', 'mithrilHelm'],
  },
  havensEdge: {
    id: 'havensEdge',
    nameKey: 'npc.shopkeeper',
    items: ['elixir', 'smokeBomb', 'holyBlade', 'holyArmor', 'mithrilShield', 'mithrilHelm'],
  },
};
