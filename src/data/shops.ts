import { ShopData } from '../utils/types';

export const shops: Record<string, ShopData> = {
  // Act 1 — early game
  greenhollow: {
    id: 'greenhollow',
    nameKey: 'npc.shopkeeper',
    items: ['herb', 'smokeBomb', 'woodenSword', 'clothArmor', 'woodenShield', 'leatherCap'],
  },
  portSapphire: {
    id: 'portSapphire',
    nameKey: 'npc.shopkeeper',
    items: ['herb', 'potion', 'smokeBomb', 'bronzeSword', 'ironSword', 'bronzeArmor', 'leatherArmor', 'ironShield', 'leatherCap', 'ironHelm'],
  },
  // Act 2 — mid-early
  ironkeep: {
    id: 'ironkeep',
    nameKey: 'npc.shopkeeper',
    items: ['potion', 'hiPotion', 'smokeBomb', 'steelSword', 'mithrilSword', 'chainMail', 'mithrilArmor', 'steelShield', 'steelHelm'],
  },
  // Act 3/4 — mid-late game
  ruinsCamp: {
    id: 'ruinsCamp',
    nameKey: 'npc.shopkeeper',
    items: ['hiPotion', 'elixir', 'smokeBomb', 'flameSword', 'crystalBlade', 'plateArmor', 'dragonscaleArmor', 'mithrilShield', 'mithrilHelm'],
  },
  // Act 5 — endgame
  lastBastion: {
    id: 'lastBastion',
    nameKey: 'npc.shopkeeper',
    items: ['elixir', 'smokeBomb', 'holyBlade', 'holyArmor', 'mithrilShield', 'mithrilHelm'],
  },
};
