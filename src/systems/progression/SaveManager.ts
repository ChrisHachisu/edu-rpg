import { SaveData, PlayerState } from '../../utils/types';

const SAVE_KEY = 'edu-rpg-save';
const AUTO_SAVE_KEY = 'edu-rpg-autosave';
const ACTIVE_PROFILE_KEY = 'edu-rpg-active-profile';
const SAVE_VERSION = 4;
const PROFILE_COUNT = 5;
const PROFILE_IDS = Array.from({ length: PROFILE_COUNT }, (_, i) => `slot${i + 1}`);
const DEFAULT_PROFILE_ID = PROFILE_IDS[0];

export interface SaveProfileSummary {
  id: string;
  slotNumber: number;
  hasSave: boolean;
  heroName: string;
  level: number;
  playtime: number;
  timestamp: number;
}

export class SaveManager {
  static getActiveProfileId(): string {
    const fromUrl = this.profileIdFromUrl();
    if (fromUrl) {
      localStorage.setItem(ACTIVE_PROFILE_KEY, fromUrl);
      return fromUrl;
    }

    return this.normalizeProfileId(localStorage.getItem(ACTIVE_PROFILE_KEY));
  }

  static setActiveProfileId(profileId: string): void {
    localStorage.setItem(ACTIVE_PROFILE_KEY, this.normalizeProfileId(profileId));
  }

  static getProfileSummaries(): SaveProfileSummary[] {
    return PROFILE_IDS.map((id, index) => {
      const data = this.loadSlot(this.storageKey(SAVE_KEY, id));
      return {
        id,
        slotNumber: index + 1,
        hasSave: data !== null,
        heroName: data?.player.name ?? '',
        level: data?.player.level ?? 1,
        playtime: data?.playtime ?? 0,
        timestamp: data?.timestamp ?? 0,
      };
    });
  }

  static getActiveProfileSummary(): SaveProfileSummary {
    const activeId = this.getActiveProfileId();
    return this.getProfileSummaries().find(profile => profile.id === activeId) ?? this.getProfileSummaries()[0];
  }

  static save(playerState: PlayerState, playtime: number, quizStats: SaveData['quizStats']): void {
    const data: SaveData = {
      version: SAVE_VERSION,
      timestamp: Date.now(),
      player: { ...playerState },
      playtime,
      quizStats,
    };
    localStorage.setItem(this.storageKey(SAVE_KEY), JSON.stringify(data));
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
    localStorage.setItem(this.storageKey(AUTO_SAVE_KEY), JSON.stringify(data));
  }

  static load(): SaveData | null {
    return this.loadSlot(this.storageKey(SAVE_KEY));
  }

  static loadAutoSave(): SaveData | null {
    return this.loadSlot(this.storageKey(AUTO_SAVE_KEY));
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
      // v3 → v4 migration: add quest fields
      if (data.version === 3) {
        (data.player as any).activeQuests = (data.player as any).activeQuests ?? [];
        (data.player as any).completedQuests = (data.player as any).completedQuests ?? [];
        (data.player as any).questProgress = (data.player as any).questProgress ?? {};
        data.version = 4;
      }
      // Backfill kanjiMode for saves created before it existed
      data.player.kanjiMode = data.player.kanjiMode ?? false;
      if (data.version !== SAVE_VERSION) return null;
      return data;
    } catch {
      return null;
    }
  }

  static hasSave(profileId?: string): boolean {
    return this.loadSlot(this.storageKey(SAVE_KEY, profileId)) !== null;
  }

  static hasAutoSave(profileId?: string): boolean {
    return this.loadSlot(this.storageKey(AUTO_SAVE_KEY, profileId)) !== null;
  }

  static deleteSave(profileId?: string): void {
    localStorage.removeItem(this.storageKey(SAVE_KEY, profileId));
  }

  static deleteAutoSave(profileId?: string): void {
    localStorage.removeItem(this.storageKey(AUTO_SAVE_KEY, profileId));
  }

  private static storageKey(baseKey: string, profileId?: string): string {
    const id = this.normalizeProfileId(profileId ?? this.getActiveProfileId());
    return id === DEFAULT_PROFILE_ID ? baseKey : `${baseKey}:${id}`;
  }

  private static normalizeProfileId(profileId: string | null | undefined): string {
    if (!profileId) return DEFAULT_PROFILE_ID;
    const lowered = profileId.trim().toLowerCase();
    if (PROFILE_IDS.includes(lowered)) return lowered;

    const slotMatch = lowered.match(/^(?:slot|save|account|profile)?\s*([1-5])$/);
    if (slotMatch) return `slot${slotMatch[1]}`;

    return DEFAULT_PROFILE_ID;
  }

  private static profileIdFromUrl(): string | null {
    const params = new URLSearchParams(window.location.search);
    const raw = params.get('slot') ?? params.get('save') ?? params.get('account') ?? params.get('profile');
    if (!raw) return null;

    const normalized = this.normalizeProfileId(raw);
    return normalized;
  }
}
