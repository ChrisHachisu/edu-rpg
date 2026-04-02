import { QuestDefinition } from '../utils/types';

export const questDefs: Record<string, QuestDefinition> = {
  // ═══════════════════════════════════════════════════════════════════
  //   ACT 1 — Landmass 1 (Greenhollow, Millbrook, Port Sapphire)
  // ═══════════════════════════════════════════════════════════════════

  owlsLesson: {
    id: 'owlsLesson',
    titleKey: 'quest.owlsLesson.title',
    descriptionKey: 'quest.owlsLesson.desc',
    act: 1,
    giverNpcId: 'sage',
    objectives: [
      { type: 'defeat', targetId: 'mosswarden', descriptionKey: 'quest.owlsLesson.obj1' },
      { type: 'talk', targetId: 'sage', descriptionKey: 'quest.owlsLesson.obj2' },
    ],
    rewards: { exp: 100, gold: 30, items: [{ itemId: 'potion', quantity: 3 }] },
    turnInNpcId: 'sage',
    turnInMapId: 'millbrook',
  },

  drakeCargo: {
    id: 'drakeCargo',
    titleKey: 'quest.drakeCargo.title',
    descriptionKey: 'quest.drakeCargo.desc',
    act: 1,
    giverNpcId: 'drake',
    objectives: [
      { type: 'talk', targetId: 'drake', descriptionKey: 'quest.drakeCargo.obj1' },
      { type: 'visit', targetId: 'coastalReef', descriptionKey: 'quest.drakeCargo.obj2' },
      { type: 'talk', targetId: 'drake', descriptionKey: 'quest.drakeCargo.obj3' },
    ],
    rewards: { exp: 100, gold: 50, items: [{ itemId: 'hiPotion', quantity: 1 }] },
    turnInNpcId: 'drake',
    turnInMapId: 'portSapphire',
  },

  kikisChallenge: {
    id: 'kikisChallenge',
    titleKey: 'quest.kikisChallenge.title',
    descriptionKey: 'quest.kikisChallenge.desc',
    act: 1,
    objectives: [
      { type: 'talk', targetId: 'kiki', descriptionKey: 'quest.kikisChallenge.obj1' },
      { type: 'defeat', targetId: 'crab', count: 5, descriptionKey: 'quest.kikisChallenge.obj2' },
    ],
    rewards: { exp: 60, items: [{ itemId: 'smokeBomb', quantity: 3 }] },
    turnInNpcId: 'kiki',
    turnInMapId: 'greenhollow',
  },

  crystalCaveGate: {
    id: 'crystalCaveGate',
    titleKey: 'quest.crystalCaveGate.title',
    descriptionKey: 'quest.crystalCaveGate.desc',
    act: 1,
    prerequisites: ['drakeCargo'],
    objectives: [
      { type: 'talk', targetId: 'sage', descriptionKey: 'quest.crystalCaveGate.obj1' },
      { type: 'defeat', targetId: 'serpent', descriptionKey: 'quest.crystalCaveGate.obj2' },
    ],
    rewards: { exp: 200, gold: 100 },
    turnInNpcId: 'sage',
    turnInMapId: 'greenhollow',
  },

  // ═══════════════════════════════════════════════════════════════════
  //   ACT 2 — Landmass 2 (Ironkeep)
  // ═══════════════════════════════════════════════════════════════════

  gordosOre: {
    id: 'gordosOre',
    titleKey: 'quest.gordosOre.title',
    descriptionKey: 'quest.gordosOre.desc',
    act: 2,
    prerequisites: [],
    objectives: [
      { type: 'talk', targetId: 'gordo', descriptionKey: 'quest.gordosOre.obj1' },
      { type: 'collect', targetId: 'ironOre', count: 3, descriptionKey: 'quest.gordosOre.obj2' },
      { type: 'talk', targetId: 'gordo', descriptionKey: 'quest.gordosOre.obj3' },
    ],
    rewards: { items: [{ itemId: 'steelSword', quantity: 1 }] },
    turnInNpcId: 'gordo',
    turnInMapId: 'ironkeep',
  },

  stormPass: {
    id: 'stormPass',
    titleKey: 'quest.stormPass.title',
    descriptionKey: 'quest.stormPass.desc',
    act: 2,
    prerequisites: ['gordosOre'],
    objectives: [
      { type: 'defeat', targetId: 'stormHarpy', descriptionKey: 'quest.stormPass.obj1' },
    ],
    rewards: { exp: 150, gold: 80 },
  },

  kikisRescue: {
    id: 'kikisRescue',
    titleKey: 'quest.kikisRescue.title',
    descriptionKey: 'quest.kikisRescue.desc',
    act: 2,
    prerequisites: ['stormPass'],
    objectives: [
      { type: 'visit', targetId: 'hauntedForest', descriptionKey: 'quest.kikisRescue.obj1' },
      { type: 'talk', targetId: 'kiki', descriptionKey: 'quest.kikisRescue.obj2' },
    ],
    rewards: { exp: 120, items: [{ itemId: 'ironHelm', quantity: 1 }] },
    turnInNpcId: 'kiki',
    turnInMapId: 'millbrook',
  },

  frozenSupplies: {
    id: 'frozenSupplies',
    titleKey: 'quest.frozenSupplies.title',
    descriptionKey: 'quest.frozenSupplies.desc',
    act: 2,
    prerequisites: ['gordosOre'],
    objectives: [
      { type: 'talk', targetId: 'soldier', descriptionKey: 'quest.frozenSupplies.obj1' },
      { type: 'defeat', targetId: 'iceWyrm', descriptionKey: 'quest.frozenSupplies.obj2' },
    ],
    rewards: { items: [{ itemId: 'frostbrand', quantity: 1 }] },
    turnInNpcId: 'soldier',
    turnInMapId: 'ironkeep',
  },

  shadowGate: {
    id: 'shadowGate',
    titleKey: 'quest.shadowGate.title',
    descriptionKey: 'quest.shadowGate.desc',
    act: 2,
    prerequisites: ['kikisRescue'],
    objectives: [
      { type: 'defeat', targetId: 'dragon', descriptionKey: 'quest.shadowGate.obj1' },
    ],
    rewards: { exp: 300, gold: 150 },
  },

  // ═══════════════════════════════════════════════════════════════════
  //   ACT 3 — Landmass 3 (Oasis Haven, Ruins Camp)
  // ═══════════════════════════════════════════════════════════════════

  lunasMap: {
    id: 'lunasMap',
    titleKey: 'quest.lunasMap.title',
    descriptionKey: 'quest.lunasMap.desc',
    act: 3,
    prerequisites: ['boss.dragon.defeated'],
    objectives: [
      { type: 'talk', targetId: 'luna', descriptionKey: 'quest.lunasMap.obj1' },
      { type: 'visit', targetId: 'oasisDepths', descriptionKey: 'quest.lunasMap.obj2' },
      { type: 'talk', targetId: 'luna', descriptionKey: 'quest.lunasMap.obj3' },
    ],
    rewards: { exp: 200, items: [{ itemId: 'starMapFragment', quantity: 1 }] },
    turnInNpcId: 'luna',
    turnInMapId: 'oasisHaven',
  },

  desertGate: {
    id: 'desertGate',
    titleKey: 'quest.desertGate.title',
    descriptionKey: 'quest.desertGate.desc',
    act: 3,
    prerequisites: ['lunasMap'],
    objectives: [
      { type: 'defeat', targetId: 'sandGolem', descriptionKey: 'quest.desertGate.obj1' },
    ],
    rewards: { exp: 250, gold: 120 },
  },

  drakesCargo2: {
    id: 'drakesCargo2',
    titleKey: 'quest.drakesCargo2.title',
    descriptionKey: 'quest.drakesCargo2.desc',
    act: 3,
    prerequisites: ['shadowGate'],
    objectives: [
      { type: 'talk', targetId: 'drake', descriptionKey: 'quest.drakesCargo2.obj1' },
      { type: 'defeat', targetId: 'banditLord', descriptionKey: 'quest.drakesCargo2.obj2' },
      { type: 'talk', targetId: 'drake', descriptionKey: 'quest.drakesCargo2.obj3' },
    ],
    rewards: { exp: 200, gold: 200 },
    turnInNpcId: 'drake',
    turnInMapId: 'portSapphire',
  },

  ancientRelic: {
    id: 'ancientRelic',
    titleKey: 'quest.ancientRelic.title',
    descriptionKey: 'quest.ancientRelic.desc',
    act: 3,
    prerequisites: ['boss.sandGolem.defeated'],
    objectives: [
      { type: 'talk', targetId: 'archaeologist', descriptionKey: 'quest.ancientRelic.obj1' },
      { type: 'visit', targetId: 'scorchedRuins', descriptionKey: 'quest.ancientRelic.obj2' },
      { type: 'talk', targetId: 'archaeologist', descriptionKey: 'quest.ancientRelic.obj3' },
    ],
    rewards: { items: [{ itemId: 'ancientAmulet', quantity: 1 }] },
    turnInNpcId: 'archaeologist',
    turnInMapId: 'oasisHaven',
  },

  // ═══════════════════════════════════════════════════════════════════
  //   ACT 4 — Landmass 3 volcanic region (Ember's Rest)
  // ═══════════════════════════════════════════════════════════════════

  flameCloak: {
    id: 'flameCloak',
    titleKey: 'quest.flameCloak.title',
    descriptionKey: 'quest.flameCloak.desc',
    act: 4,
    prerequisites: ['ancientRelic'],
    objectives: [
      { type: 'talk', targetId: 'forgemaster', descriptionKey: 'quest.flameCloak.obj1' },
      { type: 'visit', targetId: 'emberMines', descriptionKey: 'quest.flameCloak.obj2' },
      { type: 'talk', targetId: 'forgemaster', descriptionKey: 'quest.flameCloak.obj3' },
    ],
    rewards: { items: [{ itemId: 'flameCloak', quantity: 1 }] },
    turnInNpcId: 'forgemaster',
    turnInMapId: 'embersRest',
  },

  magmaPath: {
    id: 'magmaPath',
    titleKey: 'quest.magmaPath.title',
    descriptionKey: 'quest.magmaPath.desc',
    act: 4,
    prerequisites: ['flameCloak'],
    objectives: [
      { type: 'defeat', targetId: 'lavaWyrm', descriptionKey: 'quest.magmaPath.obj1' },
    ],
    rewards: { exp: 300, items: [{ itemId: 'magmaBlade', quantity: 1 }] },
  },

  lunasProphecy: {
    id: 'lunasProphecy',
    titleKey: 'quest.lunasProphecy.title',
    descriptionKey: 'quest.lunasProphecy.desc',
    act: 4,
    prerequisites: ['boss.lavaWyrm.defeated'],
    objectives: [
      { type: 'talk', targetId: 'luna', descriptionKey: 'quest.lunasProphecy.obj1' },
      { type: 'visit', targetId: 'obsidianCavern', descriptionKey: 'quest.lunasProphecy.obj2' },
      { type: 'talk', targetId: 'luna', descriptionKey: 'quest.lunasProphecy.obj3' },
    ],
    rewards: { exp: 250, items: [{ itemId: 'lightCrystal', quantity: 1 }] },
    turnInNpcId: 'luna',
    turnInMapId: 'oasisHaven',
  },

  volcanicGate: {
    id: 'volcanicGate',
    titleKey: 'quest.volcanicGate.title',
    descriptionKey: 'quest.volcanicGate.desc',
    act: 4,
    prerequisites: ['lunasProphecy'],
    objectives: [
      { type: 'defeat', targetId: 'flameTitan', descriptionKey: 'quest.volcanicGate.obj1' },
    ],
    rewards: { exp: 500, gold: 300 },
  },

  // ═══════════════════════════════════════════════════════════════════
  //   ACT 5 — Landmass 4 (Last Bastion, Haven's Edge)
  // ═══════════════════════════════════════════════════════════════════

  demonBarracksQuest: {
    id: 'demonBarracksQuest',
    titleKey: 'quest.demonBarracksQuest.title',
    descriptionKey: 'quest.demonBarracksQuest.desc',
    act: 5,
    prerequisites: ['volcanicGate'],
    objectives: [
      { type: 'defeat', targetId: 'demon', count: 10, descriptionKey: 'quest.demonBarracksQuest.obj1' },
    ],
    rewards: { exp: 400, items: [{ itemId: 'holyBlade', quantity: 1 }] },
    turnInNpcId: 'veteran',
    turnInMapId: 'lastBastion',
  },

  kikisResolve: {
    id: 'kikisResolve',
    titleKey: 'quest.kikisResolve.title',
    descriptionKey: 'quest.kikisResolve.desc',
    act: 5,
    prerequisites: ['demonBarracksQuest'],
    objectives: [
      { type: 'talk', targetId: 'kiki', descriptionKey: 'quest.kikisResolve.obj1' },
      { type: 'visit', targetId: 'voidRift', descriptionKey: 'quest.kikisResolve.obj2' },
      { type: 'talk', targetId: 'kiki', descriptionKey: 'quest.kikisResolve.obj3' },
    ],
    rewards: { exp: 350, items: [{ itemId: 'galeShield', quantity: 1 }] },
    turnInNpcId: 'kiki',
    turnInMapId: 'havensEdge',
  },

  portalRelics: {
    id: 'portalRelics',
    titleKey: 'quest.portalRelics.title',
    descriptionKey: 'quest.portalRelics.desc',
    act: 5,
    prerequisites: ['kikisResolve'],
    objectives: [
      { type: 'defeat', targetId: 'stormSentinel', descriptionKey: 'quest.portalRelics.obj1' },
      { type: 'defeat', targetId: 'frostMonarch', descriptionKey: 'quest.portalRelics.obj2' },
      { type: 'defeat', targetId: 'swordWraith', descriptionKey: 'quest.portalRelics.obj3' },
      { type: 'defeat', targetId: 'celestialGuardian', descriptionKey: 'quest.portalRelics.obj4' },
    ],
    rewards: { exp: 1000 },
  },

  finalBattle: {
    id: 'finalBattle',
    titleKey: 'quest.finalBattle.title',
    descriptionKey: 'quest.finalBattle.desc',
    act: 5,
    prerequisites: ['portalRelics'],
    objectives: [
      { type: 'defeat', targetId: 'demonKing', descriptionKey: 'quest.finalBattle.obj1' },
    ],
    rewards: {},
  },
};
