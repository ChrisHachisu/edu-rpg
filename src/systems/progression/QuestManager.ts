import { PlayerState } from '../../utils/types';

export interface QuestObjective {
  type: 'defeat' | 'collect' | 'visit' | 'talk';
  targetId: string;
  count?: number;
  descriptionKey: string;
}

export interface QuestRewards {
  exp?: number;
  gold?: number;
  items?: { itemId: string; quantity: number }[];
}

export interface QuestDefinition {
  id: string;
  titleKey: string;
  descriptionKey: string;
  act: number;
  prerequisites?: string[];
  objectives: QuestObjective[];
  rewards: QuestRewards;
  giverNpcId?: string;
  giverMapId?: string;
  turnInNpcId?: string;
  turnInMapId?: string;
}

export const questDefinitions: Record<string, QuestDefinition> = {
  owlsLesson: {
    id: 'owlsLesson',
    titleKey: 'quest.owlsLesson.title',
    descriptionKey: 'quest.owlsLesson.desc',
    act: 1,
    objectives: [
      { type: 'defeat', targetId: 'slime', count: 3, descriptionKey: 'quest.owlsLesson.obj1' },
      { type: 'defeat', targetId: 'bug', count: 2, descriptionKey: 'quest.owlsLesson.obj2' },
    ],
    rewards: { exp: 50, gold: 30 },
    giverNpcId: 'elder',
    giverMapId: 'greenhollow',
    turnInNpcId: 'elder',
    turnInMapId: 'greenhollow',
  },
  herbCollection: {
    id: 'herbCollection',
    titleKey: 'quest.herbCollection.title',
    descriptionKey: 'quest.herbCollection.desc',
    act: 1,
    prerequisites: ['owlsLesson'],
    objectives: [
      { type: 'collect', targetId: 'herb', count: 5, descriptionKey: 'quest.herbCollection.obj1' },
    ],
    rewards: { exp: 40, items: [{ itemId: 'antidote', quantity: 3 }] },
    giverNpcId: 'herbalist',
    giverMapId: 'millbrook',
    turnInNpcId: 'herbalist',
    turnInMapId: 'millbrook',
  },
  crystalGateQuest: {
    id: 'crystalGateQuest',
    titleKey: 'quest.crystalGateQuest.title',
    descriptionKey: 'quest.crystalGateQuest.desc',
    act: 1,
    prerequisites: ['herbCollection'],
    objectives: [
      { type: 'defeat', targetId: 'serpent', descriptionKey: 'quest.crystalGateQuest.obj1' },
    ],
    rewards: { exp: 100, gold: 80 },
    giverNpcId: 'drake',
    giverMapId: 'portSapphire',
    turnInNpcId: 'drake',
    turnInMapId: 'portSapphire',
  },
  hauntedPath: {
    id: 'hauntedPath',
    titleKey: 'quest.hauntedPath.title',
    descriptionKey: 'quest.hauntedPath.desc',
    act: 2,
    prerequisites: ['crystalGateQuest'],
    objectives: [
      { type: 'visit', targetId: 'hauntedForest', descriptionKey: 'quest.hauntedPath.obj1' },
      { type: 'defeat', targetId: 'darkKnight', descriptionKey: 'quest.hauntedPath.obj2' },
    ],
    rewards: { exp: 200, gold: 150 },
    giverNpcId: 'gordo',
    giverMapId: 'ironkeep',
    turnInNpcId: 'gordo',
    turnInMapId: 'ironkeep',
  },
  lunasProphecy: {
    id: 'lunasProphecy',
    titleKey: 'quest.lunasProphecy.title',
    descriptionKey: 'quest.lunasProphecy.desc',
    act: 3,
    prerequisites: ['hauntedPath'],
    objectives: [
      { type: 'defeat', targetId: 'dragon', descriptionKey: 'quest.lunasProphecy.obj1' },
      { type: 'talk', targetId: 'luna', descriptionKey: 'quest.lunasProphecy.obj2' },
    ],
    rewards: { exp: 300, gold: 200 },
    giverNpcId: 'luna',
    giverMapId: 'oasisHaven',
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

export class QuestManager {
  canStartQuest(questId: string, state: PlayerState): boolean {
    const quest = questDefinitions[questId];
    if (!quest || state.activeQuests.includes(questId) || state.completedQuests.includes(questId)) return false;
    if (quest.prerequisites) {
      for (const prereq of quest.prerequisites) {
        if (!state.completedQuests.includes(prereq) && !state.storyFlags[prereq]) return false;
      }
    }
    return true;
  }

  startQuest(questId: string, state: PlayerState): void {
    const quest = questDefinitions[questId];
    if (quest && !state.activeQuests.includes(questId)) {
      state.activeQuests.push(questId);
      state.questProgress[questId] = {};
      for (const obj of quest.objectives) {
        state.questProgress[questId][obj.targetId] = 0;
      }
    }
  }

  updateProgress(state: PlayerState, type: string, targetId: string, amount: number = 1): string[] {
    const readyQuests: string[] = [];
    for (const qId of state.activeQuests) {
      const quest = questDefinitions[qId];
      if (quest) {
        for (const obj of quest.objectives) {
          if (obj.type === type && obj.targetId === targetId) {
            if (!state.questProgress[qId]) state.questProgress[qId] = {};
            state.questProgress[qId][targetId] = (state.questProgress[qId][targetId] ?? 0) + amount;
          }
        }
        if (this.isQuestReady(qId, state) && !readyQuests.includes(qId)) {
          readyQuests.push(qId);
        }
      }
    }
    return readyQuests;
  }

  isQuestReady(questId: string, state: PlayerState): boolean {
    const quest = questDefinitions[questId];
    if (!quest || !state.activeQuests.includes(questId)) return false;
    const progress = state.questProgress[questId] ?? {};
    for (const obj of quest.objectives) {
      const required = obj.count ?? 1;
      if ((progress[obj.targetId] ?? 0) < required) return false;
    }
    return true;
  }

  completeQuest(questId: string, state: PlayerState): QuestRewards {
    const quest = questDefinitions[questId];
    if (!quest) return {};
    const idx = state.activeQuests.indexOf(questId);
    if (idx !== -1) state.activeQuests.splice(idx, 1);
    if (!state.completedQuests.includes(questId)) state.completedQuests.push(questId);
    delete state.questProgress[questId];
    return quest.rewards;
  }

  getActiveQuests(state: PlayerState): QuestDefinition[] {
    return state.activeQuests
      .map(id => questDefinitions[id])
      .filter((q): q is QuestDefinition => q !== undefined);
  }

  getAvailableQuests(state: PlayerState, npcId?: string): QuestDefinition[] {
    const result: QuestDefinition[] = [];
    for (const quest of Object.values(questDefinitions)) {
      if (this.canStartQuest(quest.id, state)) {
        if (npcId !== undefined && (quest.giverNpcId ?? quest.turnInNpcId) !== npcId) continue;
        result.push(quest);
      }
    }
    return result;
  }

  getObjectiveProgress(questId: string, state: PlayerState): Array<{ objective: QuestObjective; current: number; target: number }> {
    const quest = questDefinitions[questId];
    if (!quest) return [];
    const progress = state.questProgress[questId] ?? {};
    return quest.objectives.map(obj => ({
      objective: obj,
      current: progress[obj.targetId] ?? 0,
      target: obj.count ?? 1,
    }));
  }
}
