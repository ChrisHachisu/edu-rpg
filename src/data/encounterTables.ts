import { EncounterZone } from '../utils/types';

export const encounterZones: Record<string, EncounterZone> = {
  // ── Act 1 — Always accessible ──────────────────────────────────────

  'greenhollow-plains': {
    zoneId: 'greenhollow-plains',
    encounterRate: 0.05,
    minStepsBetween: 10,
    monsters: [
      { monsterId: 'slime', weight: 5 },
      { monsterId: 'bug', weight: 3 },
      { monsterId: 'rabbit', weight: 2 },
    ],
  },
  'whispering-woods': {
    zoneId: 'whispering-woods',
    encounterRate: 0.06,
    minStepsBetween: 8,
    monsters: [
      { monsterId: 'mushroom', weight: 4 },
      { monsterId: 'wolf', weight: 4 },
      { monsterId: 'bandit', weight: 2 },
      { monsterId: 'bat', weight: 2 },
    ],
  },
  'crystal-coast': {
    zoneId: 'crystal-coast',
    encounterRate: 0.06,
    minStepsBetween: 8,
    monsters: [
      { monsterId: 'spider', weight: 5 },
      { monsterId: 'crab', weight: 5 },
    ],
  },
  'misty-grotto': {
    zoneId: 'misty-grotto',
    encounterRate: 0.07,
    minStepsBetween: 7,
    monsters: [
      { monsterId: 'mushroom', weight: 4 },
      { monsterId: 'bat', weight: 3 },
      { monsterId: 'bandit', weight: 3 },
    ],
  },
  'sunken-cellar': {
    zoneId: 'sunken-cellar',
    encounterRate: 0.07,
    minStepsBetween: 7,
    monsters: [
      { monsterId: 'crab', weight: 5 },
      { monsterId: 'seaStar', weight: 5 },
    ],
  },
  'crystal-cave': {
    zoneId: 'crystal-cave',
    encounterRate: 0.08,
    minStepsBetween: 6,
    monsters: [
      { monsterId: 'spider', weight: 5 },
      { monsterId: 'crab', weight: 5 },
    ],
  },

  // ── Act 2 — Unlocked after defeating Serpent ───────────────────────

  'coral-tunnels': {
    zoneId: 'coral-tunnels',
    encounterRate: 0.07,
    minStepsBetween: 7,
    monsters: [
      { monsterId: 'jellyfish', weight: 4 },
      { monsterId: 'piranha', weight: 3 },
      { monsterId: 'merfolk', weight: 3 },
    ],
  },
  'iron-mountains': {
    zoneId: 'iron-mountains',
    encounterRate: 0.06,
    minStepsBetween: 8,
    monsters: [
      { monsterId: 'harpy', weight: 5 },
      { monsterId: 'wyvern', weight: 5 },
    ],
  },
  'shadow-cave': {
    zoneId: 'shadow-cave',
    encounterRate: 0.08,
    minStepsBetween: 6,
    monsters: [
      { monsterId: 'harpy', weight: 5 },
      { monsterId: 'wyvern', weight: 5 },
    ],
  },
  'storm-nest': {
    zoneId: 'storm-nest',
    encounterRate: 0.08,
    minStepsBetween: 6,
    monsters: [
      { monsterId: 'harpy', weight: 5 },
      { monsterId: 'wyvern', weight: 5 },
    ],
  },
  'frozen-lake': {
    zoneId: 'frozen-lake',
    encounterRate: 0.07,
    minStepsBetween: 7,
    monsters: [
      { monsterId: 'frostWolf', weight: 4 },
      { monsterId: 'frozenSkeleton', weight: 3 },
      { monsterId: 'iceSprite', weight: 3 },
    ],
  },

  // ── Act 3 — Unlocked after defeating Dragon ───────────────────────

  'frostpeak-cavern': {
    zoneId: 'frostpeak-cavern',
    encounterRate: 0.07,
    minStepsBetween: 7,
    monsters: [
      { monsterId: 'blizzardBear', weight: 4 },
      { monsterId: 'iceSprite', weight: 3 },
      { monsterId: 'darkSorcerer', weight: 3 },
    ],
  },
  'scorched-wastes': {
    zoneId: 'scorched-wastes',
    encounterRate: 0.07,
    minStepsBetween: 7,
    monsters: [
      { monsterId: 'lizard', weight: 5 },
      { monsterId: 'knight', weight: 5 },
    ],
  },
  'desert-tomb': {
    zoneId: 'desert-tomb',
    encounterRate: 0.07,
    minStepsBetween: 7,
    monsters: [
      { monsterId: 'sandWraith', weight: 4 },
      { monsterId: 'mummy', weight: 4 },
      { monsterId: 'skeleton', weight: 2 },
    ],
  },
  'bandit-hideout': {
    zoneId: 'bandit-hideout',
    encounterRate: 0.07,
    minStepsBetween: 7,
    monsters: [
      { monsterId: 'banditArcher', weight: 5 },
      { monsterId: 'bandit', weight: 3 },
      { monsterId: 'wolf', weight: 2 },
    ],
  },

  // ── Act 4 — Volcanic area ──────────────────────────────────────────

  'magma-tunnels': {
    zoneId: 'magma-tunnels',
    encounterRate: 0.08,
    minStepsBetween: 6,
    monsters: [
      { monsterId: 'magmaSlime', weight: 3 },
      { monsterId: 'flameBat', weight: 3 },
      { monsterId: 'fireElemental', weight: 4 },
    ],
  },
  'sunken-ruins': {
    zoneId: 'sunken-ruins',
    encounterRate: 0.07,
    minStepsBetween: 6,
    monsters: [
      { monsterId: 'skeleton', weight: 4 },
      { monsterId: 'wraith', weight: 3 },
      { monsterId: 'fireElemental', weight: 3 },
    ],
  },
  'volcanic-forge': {
    zoneId: 'volcanic-forge',
    encounterRate: 0.08,
    minStepsBetween: 6,
    monsters: [
      { monsterId: 'fireElemental', weight: 4 },
      { monsterId: 'lavaGolem', weight: 3 },
      { monsterId: 'wraith', weight: 3 },
    ],
  },

  // ── Act 5 — Unlocked after defeating Flame Titan ──────────────────

  'demons-threshold': {
    zoneId: 'demons-threshold',
    encounterRate: 0.08,
    minStepsBetween: 6,
    monsters: [
      { monsterId: 'chimera', weight: 3 },
      { monsterId: 'demon', weight: 4 },
      { monsterId: 'shadow', weight: 3 },
    ],
  },
  'demon-castle': {
    zoneId: 'demon-castle',
    encounterRate: 0.09,
    minStepsBetween: 5,
    monsters: [
      { monsterId: 'chimera', weight: 3 },
      { monsterId: 'demon', weight: 3 },
      { monsterId: 'shadow', weight: 4 },
    ],
  },

  // ── Hidden Legendary Dungeons (Act 5) ────────────────────────────

  'sealed-sanctum': {
    zoneId: 'sealed-sanctum',
    encounterRate: 0.08,
    minStepsBetween: 6,
    monsters: [
      { monsterId: 'wraith', weight: 3 },
      { monsterId: 'darkSorcerer', weight: 3 },
      { monsterId: 'chimera', weight: 4 },
    ],
  },
  'celestial-vault': {
    zoneId: 'celestial-vault',
    encounterRate: 0.08,
    minStepsBetween: 6,
    monsters: [
      { monsterId: 'demon', weight: 3 },
      { monsterId: 'shadow', weight: 4 },
      { monsterId: 'fireElemental', weight: 3 },
    ],
  },
};
