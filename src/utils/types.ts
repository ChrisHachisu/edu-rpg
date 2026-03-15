export type Locale = 'en' | 'ja';

export type GradeLevel = 'k' | '1' | '2' | '3' | '4' | '5' | '6';

export type DifficultyTier = 'easy' | 'medium' | 'hard';

export type ItemType = 'consumable' | 'weapon' | 'armor' | 'shield' | 'helmet' | 'accessory' | 'key';

export type EquipSlot = 'weapon' | 'armor' | 'shield' | 'helmet' | 'accessory';

export type AIPattern = 'basic' | 'aggressive' | 'defensive' | 'boss';

export type CombatActionType = 'attack' | 'defend' | 'item' | 'flee';

export interface LocalizedText {
  en: string;
  ja: string;
}

export interface Stats {
  maxHp: number;
  atk: number;
  def: number;
  spd: number;
}

export interface EquipmentSlots {
  weapon: string | null;
  armor: string | null;
  shield: string | null;
  helmet: string | null;
  accessory: string | null;
}

export interface InventorySlot {
  itemId: string;
  quantity: number;
}

export interface Position {
  mapId: string;
  x: number;
  y: number;
}

export interface PlayerState {
  name: string;
  level: number;
  exp: number;
  expToNext: number;
  hp: number;
  maxHp: number;
  atk: number;
  def: number;
  spd: number;
  equipment: EquipmentSlots;
  inventory: InventorySlot[];
  gold: number;
  position: Position;
  storyFlags: Record<string, boolean>;
  timerEnabled: boolean;
  quizDifficulty: GradeLevel;
  locale: Locale;
}

export interface MonsterTemplate {
  id: string;
  nameKey: string;
  spriteKey: string;
  baseHp: number;
  baseAtk: number;
  baseDef: number;
  baseSpd: number;
  expReward: number;
  goldReward: number;
  drops: { itemId: string; chance: number }[];
  aiPattern: AIPattern;
  color: number; // Tint color for procedural sprite
}

export interface ItemDefinition {
  id: string;
  nameKey: string;
  descriptionKey: string;
  type: ItemType;
  stats?: Partial<Stats>;
  effect?: {
    type: 'heal' | 'buff' | 'escape';
    value: number;
  };
  buyPrice: number;
  sellPrice: number;
}

export interface QuizQuestion {
  questionText: LocalizedText;
  answers: {
    text: LocalizedText;
    isCorrect: boolean;
  }[];
  category: string;
  gradeLevel: GradeLevel;
  difficultyTier: DifficultyTier;
}

export interface EncounterZone {
  zoneId: string;
  encounterRate: number;
  minStepsBetween: number;
  monsters: {
    monsterId: string;
    weight: number;
  }[];
}

export interface SaveData {
  version: number;
  timestamp: number;
  player: PlayerState;
  playtime: number;
  quizStats: {
    totalAsked: number;
    totalCorrect: number;
    byCategory: Record<string, { asked: number; correct: number }>;
  };
}

export interface ShopData {
  id: string;
  nameKey: string;
  items: string[]; // item IDs
}
