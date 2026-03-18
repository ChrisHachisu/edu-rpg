import { EncounterZone, MonsterTemplate } from '../../utils/types';
import { encounterZones } from '../../data/encounterTables';
import { monsters } from '../../data/monsters';
import { MAX_ENCOUNTER_RATE, ENCOUNTER_RATE_GROWTH } from '../../utils/constants';

export class EncounterManager {
  private stepsSinceLastEncounter = 0;
  /** Multiplier applied to encounter rates. Lower = fewer encounters. Set by GameState based on difficulty. */
  encounterRateMultiplier = 1;

  onStep(zoneId: string): MonsterTemplate | null {
    const zone = encounterZones[zoneId];
    if (!zone) return null;

    this.stepsSinceLastEncounter++;

    // Scale minimum steps inversely with multiplier (lower multiplier = more steps between fights)
    const adjustedMinSteps = Math.ceil(zone.minStepsBetween / Math.max(0.1, this.encounterRateMultiplier));
    if (this.stepsSinceLastEncounter < adjustedMinSteps) return null;

    const stepsOver = this.stepsSinceLastEncounter - adjustedMinSteps;
    const adjustedRate = zone.encounterRate * this.encounterRateMultiplier;
    const probability = Math.min(
      adjustedRate * (1 + stepsOver * ENCOUNTER_RATE_GROWTH),
      MAX_ENCOUNTER_RATE
    );

    if (Math.random() < probability) {
      this.stepsSinceLastEncounter = 0;
      return this.rollEncounter(zone);
    }

    return null;
  }

  reset(): void {
    this.stepsSinceLastEncounter = 0;
  }

  private rollEncounter(zone: EncounterZone): MonsterTemplate {
    const totalWeight = zone.monsters.reduce((sum, m) => sum + m.weight, 0);
    let roll = Math.random() * totalWeight;

    for (const entry of zone.monsters) {
      roll -= entry.weight;
      if (roll <= 0) {
        return monsters[entry.monsterId];
      }
    }

    // Fallback
    return monsters[zone.monsters[0].monsterId];
  }
}
