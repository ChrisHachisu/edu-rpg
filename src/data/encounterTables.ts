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
      { monsterId: 'mushroom', weight: 5 },
      { monsterId: 'wolf', weight: 5 },
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

  'iron-mountains': {
    zoneId: 'iron-mountains',
    encounterRate: 0.06,
    minStepsBetween: 8,
    monsters: [
      { monsterId: 'harpy', weight: 5 },
      { monsterId: 'wyvern', weight: 5 },
    ],
  },
  'shadow-tower': {
    zoneId: 'shadow-tower',
    encounterRate: 0.08,
    minStepsBetween: 6,
    monsters: [
      { monsterId: 'harpy', weight: 5 },
      { monsterId: 'wyvern', weight: 5 },
    ],
  },

  // ── Act 3 — Unlocked after defeating Dragon ───────────────────────

  'scorched-wastes': {
    zoneId: 'scorched-wastes',
    encounterRate: 0.07,
    minStepsBetween: 7,
    monsters: [
      { monsterId: 'lizard', weight: 5 },
      { monsterId: 'knight', weight: 5 },
    ],
  },
  'demon-castle': {
    zoneId: 'demon-castle',
    encounterRate: 0.09,
    minStepsBetween: 5,
    monsters: [
      { monsterId: 'lizard', weight: 3 },
      { monsterId: 'knight', weight: 3 },
      { monsterId: 'chimera', weight: 4 },
    ],
  },
};
