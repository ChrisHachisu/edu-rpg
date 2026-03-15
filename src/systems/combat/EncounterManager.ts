import { EncounterZone, MonsterTemplate } from '../../utils/types';
import { encounterZones } from '../../data/encounterTables';
import { monsters } from '../../data/monsters';
import { MAX_ENCOUNTER_RATE, ENCOUNTER_RATE_GROWTH } from '../../utils/constants';

export class EncounterManager {
  private stepsSinceLastEncounter = 0;

  onStep(zoneId: string): MonsterTemplate | null {
    const zone = encounterZones[zoneId];
    if (!zone) return null;

    this.stepsSinceLastEncounter++;

    if (this.stepsSinceLastEncounter < zone.minStepsBetween) return null;

    const stepsOver = this.stepsSinceLastEncounter - zone.minStepsBetween;
    const probability = Math.min(
      zone.encounterRate * (1 + stepsOver * ENCOUNTER_RATE_GROWTH),
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
