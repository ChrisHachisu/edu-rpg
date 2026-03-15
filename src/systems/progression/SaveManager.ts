import { SaveData, PlayerState } from '../../utils/types';

const SAVE_KEY = 'edu-rpg-save';
const SAVE_VERSION = 1;

export class SaveManager {
  static save(playerState: PlayerState, playtime: number, quizStats: SaveData['quizStats']): void {
    const data: SaveData = {
      version: SAVE_VERSION,
      timestamp: Date.now(),
      player: { ...playerState },
      playtime,
      quizStats,
    };
    localStorage.setItem(SAVE_KEY, JSON.stringify(data));
  }

  static load(): SaveData | null {
    const raw = localStorage.getItem(SAVE_KEY);
    if (!raw) return null;
    try {
      const data: SaveData = JSON.parse(raw);
      if (data.version !== SAVE_VERSION) return null;
      return data;
    } catch {
      return null;
    }
  }

  static hasSave(): boolean {
    return localStorage.getItem(SAVE_KEY) !== null;
  }

  static deleteSave(): void {
    localStorage.removeItem(SAVE_KEY);
  }
}
