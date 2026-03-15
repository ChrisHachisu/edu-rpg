import { ShopData } from '../utils/types';

export const shops: Record<string, ShopData> = {
  // Act 1 — early game
  greenhollow: {
    id: 'greenhollow',
    nameKey: 'npc.shopkeeper',
    items: ['herb', 'smokeBomb', 'woodenSword', 'clothArmor', 'woodenShield', 'leatherCap'],
  },
  oakshade: {
    id: 'oakshade',
    nameKey: 'npc.shopkeeper',
    items: ['herb', 'potion', 'smokeBomb', 'bronzeSword', 'bronzeArmor', 'woodenShield', 'leatherCap'],
  },
  portSapphire: {
    id: 'portSapphire',
    nameKey: 'npc.shopkeeper',
    items: ['potion', 'smokeBomb', 'ironSword', 'leatherArmor', 'ironShield', 'ironHelm'],
  },
  // Act 2 — mid-early
  tidepools: {
    id: 'tidepools',
    nameKey: 'npc.shopkeeper',
    items: ['potion', 'smokeBomb', 'steelSword', 'chainMail', 'ironShield', 'ironHelm'],
  },
  ironkeep: {
    id: 'ironkeep',
    nameKey: 'npc.shopkeeper',
    items: ['potion', 'hiPotion', 'smokeBomb', 'mithrilSword', 'mithrilArmor', 'steelShield', 'steelHelm'],
  },
  // Act 3 — mid game
  moonvale: {
    id: 'moonvale',
    nameKey: 'npc.shopkeeper',
    items: ['hiPotion', 'smokeBomb', 'flameSword', 'plateArmor', 'steelShield', 'steelHelm'],
  },
  // Act 4 — late game
  ruinsCamp: {
    id: 'ruinsCamp',
    nameKey: 'npc.shopkeeper',
    items: ['hiPotion', 'elixir', 'smokeBomb', 'crystalBlade', 'dragonscaleArmor', 'mithrilShield', 'mithrilHelm'],
  },
  ashfall: {
    id: 'ashfall',
    nameKey: 'npc.shopkeeper',
    items: ['hiPotion', 'elixir', 'smokeBomb', 'crystalBlade', 'dragonscaleArmor', 'mithrilShield', 'mithrilHelm'],
  },
  // Act 5 — endgame
  lastBastion: {
    id: 'lastBastion',
    nameKey: 'npc.shopkeeper',
    items: ['elixir', 'smokeBomb', 'holyBlade', 'holyArmor', 'mithrilShield', 'mithrilHelm'],
  },
};
