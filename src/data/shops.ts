import { ShopData } from '../utils/types';

export const shops: Record<string, ShopData> = {
  greenhollow: {
    id: 'greenhollow',
    nameKey: 'npc.shopkeeper',
    items: ['herb', 'smokeBomb', 'woodenSword', 'clothArmor', 'woodenShield', 'leatherCap'],
  },
  oakshade: {
    id: 'oakshade',
    nameKey: 'npc.shopkeeper',
    items: ['herb', 'potion', 'smokeBomb', 'ironSword', 'leatherArmor', 'ironShield'],
  },
  portSapphire: {
    id: 'portSapphire',
    nameKey: 'npc.shopkeeper',
    items: ['potion', 'smokeBomb', 'steelSword', 'chainMail', 'ironShield', 'ironHelm'],
  },
  ironkeep: {
    id: 'ironkeep',
    nameKey: 'npc.shopkeeper',
    items: ['potion', 'hiPotion', 'smokeBomb', 'flameSword', 'plateArmor', 'ironHelm'],
  },
  ashfall: {
    id: 'ashfall',
    nameKey: 'npc.shopkeeper',
    items: ['hiPotion', 'smokeBomb', 'holyBlade', 'holyArmor'],
  },
};
