import { SaveData, PlayerState } from '../../utils/types';

const SAVE_KEY = 'edu-rpg-save';
const AUTO_SAVE_KEY = 'edu-rpg-autosave';
const SAVE_VERSION = 3;

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

  /** Auto-save to a separate slot (used before boss fights for quick retry) */
  static autoSave(playerState: PlayerState, playtime: number, quizStats: SaveData['quizStats']): void {
    const data: SaveData = {
      version: SAVE_VERSION,
      timestamp: Date.now(),
      player: { ...playerState },
      playtime,
      quizStats,
    };
    localStorage.setItem(AUTO_SAVE_KEY, JSON.stringify(data));
  }

  static load(): SaveData | null {
    return this.loadSlot(SAVE_KEY);
  }

  static loadAutoSave(): SaveData | null {
    return this.loadSlot(AUTO_SAVE_KEY);
  }

  private static loadSlot(key: string): SaveData | null {
    const raw = localStorage.getItem(key);
    if (!raw) return null;
    try {
      const data: SaveData = JSON.parse(raw);
      // v1 → v2 migration: add floor to position
      if (data.version === 1) {
        data.player.position.floor = 1;
        data.version = 2;
      }
      // v2 → v3 migration: add sound settings
      if (data.version === 2) {
        data.player.soundEnabled = data.player.soundEnabled ?? true;
        data.player.masterVolume = data.player.masterVolume ?? 0.7;
        data.version = 3;
      }
      // Backfill kanjiMode for saves created before it existed
      data.player.kanjiMode = data.player.kanjiMode ?? false;
      if (data.version !== SAVE_VERSION) return null;
      return data;
    } catch {
      return null;
    }
  }

  static hasSave(): boolean {
    return localStorage.getItem(SAVE_KEY) !== null;
  }

  static hasAutoSave(): boolean {
    return localStorage.getItem(AUTO_SAVE_KEY) !== null;
  }

  static deleteSave(): void {
    localStorage.removeItem(SAVE_KEY);
  }

  static deleteAutoSave(): void {
    localStorage.removeItem(AUTO_SAVE_KEY);
  }
}
