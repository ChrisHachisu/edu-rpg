// Game dimensions (SNES-style internal resolution)
export const GAME_WIDTH = 512;
export const GAME_HEIGHT = 448;
export const TILE_SIZE = 32;
export const ZOOM = 2;

// Map dimensions in tiles
export const MAP_WIDTH_TILES = 40;
export const MAP_HEIGHT_TILES = 40;

// Combat
export const BASE_ENCOUNTER_RATE = 0.06;
export const MIN_STEPS_BETWEEN_ENCOUNTERS = 8;
export const MAX_ENCOUNTER_RATE = 0.5;
export const ENCOUNTER_RATE_GROWTH = 0.08;
export const DAMAGE_VARIANCE_MIN = 0.85;
export const DAMAGE_VARIANCE_MAX = 1.15;
export const DEFEND_DAMAGE_MULTIPLIER = 0.5;
export const FLEE_BASE_CHANCE = 0.5;

// UI
export const TEXT_SPEED = 30; // ms per character for typewriter effect
export const QUIZ_ANSWER_COUNT = 4;
export const QUIZ_FEEDBACK_DURATION = 1000; // ms

// Progression
export const MAX_LEVEL = 30;
export const MAX_INVENTORY_SIZE = 20;
export const GOLD_SELL_RATIO = 0.5;

// Colors
export const COLORS = {
  WHITE: 0xffffff,
  BLACK: 0x000000,
  DARK_BLUE: 0x1a1a2e,
  MENU_BG: 0x1a1a3e,
  MENU_BORDER: 0xe0e0ff,
  HP_GREEN: 0x00cc44,
  HP_RED: 0xcc2222,
  GOLD: 0xffcc00,
  CORRECT_GREEN: 0x22cc44,
  INCORRECT_RED: 0xcc2244,
  TEXT_WHITE: '#ffffff',
  TEXT_GRAY: '#aaaaaa',
  TEXT_YELLOW: '#ffcc00',
} as const;
