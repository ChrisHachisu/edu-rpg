import { questDefs } from '../../data/quests';
import type { PlayerState, QuestDefinition, QuestObjective, QuestReward } from '../../utils/types';

export class QuestManager {
  /** Check whether a quest's prerequisites are met (completed quests + storyFlags). */
  canStartQuest(questId: string, state: PlayerState): boolean {
    const def = questDefs[questId];
    if (!def) return false;
    if (state.activeQuests.includes(questId)) return false;
    if (state.completedQuests.includes(questId)) return false;

    if (def.prerequisites) {
      for (const prereq of def.prerequisites) {
        // Prerequisite is satisfied if it's a completed quest OR a truthy storyFlag
        if (!state.completedQuests.includes(prereq) && !state.storyFlags[prereq]) {
          return false;
        }
      }
    }
    return true;
  }

  /** Add a quest to activeQuests and initialize its progress tracking. */
  startQuest(questId: string, state: PlayerState): void {
    const def = questDefs[questId];
    if (!def) return;
    if (state.activeQuests.includes(questId)) return;

    state.activeQuests.push(questId);
    state.questProgress[questId] = {};
    for (const obj of def.objectives) {
      state.questProgress[questId][obj.targetId] = 0;
    }
  }

  /**
   * Increment progress for matching active quest objectives.
   * Returns array of quest IDs where all objectives are now met.
   */
  updateProgress(state: PlayerState, type: string, targetId: string, count = 1): string[] {
    const readyQuests: string[] = [];

    for (const questId of state.activeQuests) {
      const def = questDefs[questId];
      if (!def) continue;

      for (const obj of def.objectives) {
        if (obj.type === type && obj.targetId === targetId) {
          if (!state.questProgress[questId]) {
            state.questProgress[questId] = {};
          }
          state.questProgress[questId][targetId] =
            (state.questProgress[questId][targetId] ?? 0) + count;
        }
      }

      if (this.isQuestReady(questId, state) && !readyQuests.includes(questId)) {
        readyQuests.push(questId);
      }
    }

    return readyQuests;
  }

  /** Check whether all objectives for a quest are complete. */
  isQuestReady(questId: string, state: PlayerState): boolean {
    const def = questDefs[questId];
    if (!def) return false;
    if (!state.activeQuests.includes(questId)) return false;

    const progress = state.questProgress[questId] ?? {};
    for (const obj of def.objectives) {
      const target = obj.count ?? 1;
      const current = progress[obj.targetId] ?? 0;
      if (current < target) return false;
    }
    return true;
  }

  /** Move quest to completedQuests and return its rewards. */
  completeQuest(questId: string, state: PlayerState): QuestReward {
    const def = questDefs[questId];
    if (!def) return {};

    // Remove from active
    const idx = state.activeQuests.indexOf(questId);
    if (idx !== -1) state.activeQuests.splice(idx, 1);

    // Add to completed
    if (!state.completedQuests.includes(questId)) {
      state.completedQuests.push(questId);
    }

    // Clean up progress
    delete state.questProgress[questId];

    return def.rewards;
  }

  /** Return definitions for all currently active quests. */
  getActiveQuests(state: PlayerState): QuestDefinition[] {
    return state.activeQuests
      .map(id => questDefs[id])
      .filter((d): d is QuestDefinition => d !== undefined);
  }

  /** Return quests that can be started, optionally filtered by giver NPC. */
  getAvailableQuests(state: PlayerState, npcId?: string): QuestDefinition[] {
    const available: QuestDefinition[] = [];
    for (const def of Object.values(questDefs)) {
      if (!this.canStartQuest(def.id, state)) continue;
      if (npcId !== undefined) {
        const giverId = def.giverNpcId ?? def.turnInNpcId;
        if (giverId !== npcId) continue;
      }
      available.push(def);
    }
    return available;
  }

  /** Return per-objective progress for a quest. */
  getObjectiveProgress(
    questId: string,
    state: PlayerState,
  ): { objective: QuestObjective; current: number; target: number }[] {
    const def = questDefs[questId];
    if (!def) return [];

    const progress = state.questProgress[questId] ?? {};
    return def.objectives.map(obj => ({
      objective: obj,
      current: progress[obj.targetId] ?? 0,
      target: obj.count ?? 1,
    }));
  }
}
