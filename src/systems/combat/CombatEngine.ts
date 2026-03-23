import { MonsterTemplate, CombatActionType, BossAbility } from '../../utils/types';
import { Player } from '../../entities/Player';
import { items } from '../../data/items';
import {
  DAMAGE_VARIANCE_MIN,
  DAMAGE_VARIANCE_MAX,
  DEFEND_DAMAGE_MULTIPLIER,
  FLEE_BASE_CHANCE,
} from '../../utils/constants';
import { t } from '../../i18n/i18n';

export type CombatState =
  | 'start'
  | 'playerTurn'
  | 'playerQuiz'
  | 'playerResolve'
  | 'enemyTurn'
  | 'enemyQuiz'
  | 'enemyResolve'
  | 'victory'
  | 'defeat'
  | 'fled';

export interface CombatResult {
  state: CombatState;
  message: string;
  damage?: number;
  partial?: boolean;
  speedBonus?: boolean;
  expGain?: number;
  goldGain?: number;
  levelUp?: { newLevel: number };
  drops?: string[];
  abilityMessages?: string[];
}

export class CombatEngine {
  state: CombatState = 'start';
  monster: MonsterTemplate;
  monsterHp: number;
  player: Player;
  isDefending = false;
  private pendingAction: CombatActionType = 'attack';
  private pendingItemId: string | null = null;

  // Boss ability state
  private turnCount = 0;
  private rageActive = false;
  private isCharging = false; // true = next attack is a charge attack
  private poisonActive = false;

  constructor(player: Player, monster: MonsterTemplate) {
    this.player = player;
    this.monster = monster;
    this.monsterHp = monster.baseHp;

    // Initialize poison
    if (this.getAbility('poison')) {
      this.poisonActive = true;
    }
  }

  private getAbility(type: BossAbility['type']): BossAbility | undefined {
    return this.monster.bossAbilities?.find(a => a.type === type);
  }

  start(): CombatResult {
    this.state = 'playerTurn';
    const abilityMessages = this.getStartMessages();
    return {
      state: 'start',
      message: t('battle.appeared', { monster: t(this.monster.nameKey) }),
      abilityMessages,
    };
  }

  /** Generate intro messages about boss abilities */
  private getStartMessages(): string[] {
    const msgs: string[] = [];
    if (!this.monster.bossAbilities?.length) return msgs;

    for (const ability of this.monster.bossAbilities) {
      switch (ability.type) {
        case 'poison':
          msgs.push(t('ability.poisonStart', { monster: t(this.monster.nameKey) }));
          break;
      }
    }
    return msgs;
  }

  selectAction(action: CombatActionType, itemId?: string): CombatResult | 'quiz' {
    this.pendingAction = action;
    this.pendingItemId = itemId ?? null;

    switch (action) {
      case 'attack':
        this.state = 'playerQuiz';
        return 'quiz'; // BattleScene shows quiz

      case 'defend':
        this.isDefending = true;
        this.state = 'enemyTurn';
        return {
          state: 'playerResolve',
          message: t('battle.playerDefend', { name: this.player.state.name }),
        };

      case 'item': {
        if (!itemId) return { state: 'playerTurn', message: '' };
        const item = items[itemId];
        if (!item?.effect) return { state: 'playerTurn', message: '' };

        this.player.removeItem(itemId, 1);
        let msg = t('battle.itemUsed', { item: t(item.nameKey) });

        if (item.effect.type === 'heal') {
          const healed = this.player.heal(item.effect.value);
          msg += ' ' + t('battle.healed', { value: healed });
        } else if (item.effect.type === 'escape') {
          this.state = 'fled';
          return { state: 'fled', message: t('battle.fled') };
        }

        this.state = 'enemyTurn';
        return { state: 'playerResolve', message: msg };
      }

      case 'flee': {
        const chance = FLEE_BASE_CHANCE + (this.player.state.spd - this.monster.baseSpd) * 0.02;
        if (Math.random() < Math.max(0.1, Math.min(0.9, chance))) {
          this.state = 'fled';
          return { state: 'fled', message: t('battle.fled') };
        }
        this.state = 'enemyTurn';
        return { state: 'playerResolve', message: t('battle.fleeFail') };
      }
    }
  }

  resolvePlayerAttack(quizCorrect: boolean, timeRatio?: number): CombatResult {
    if (quizCorrect) {
      let damage = this.calculateDamage(this.player.totalAtk, this.monster.baseDef);
      // Speed bonus: 1.2x damage for answering within 50% of time
      const speedBonus = timeRatio !== undefined && timeRatio >= 0.5;
      if (speedBonus) {
        damage = Math.floor(damage * 1.2);
      }
      this.monsterHp -= damage;
      if (this.monsterHp <= 0) {
        this.monsterHp = 0;
        return this.victory();
      }
      this.state = 'enemyTurn';
      return {
        state: 'playerResolve',
        message: speedBonus
          ? t('battle.speedBonus') + ' ' + t('battle.hit', { damage })
          : t('battle.hit', { damage }),
        damage,
        speedBonus,
      };
    } else {
      // Wrong answer: weak damage (25%)
      let damage = Math.max(1, Math.floor(this.calculateDamage(this.player.totalAtk, this.monster.baseDef) * 0.25));
      this.monsterHp -= damage;
      if (this.monsterHp <= 0) {
        this.monsterHp = 0;
        return this.victory();
      }
      this.state = 'enemyTurn';
      return {
        state: 'playerResolve',
        message: t('battle.partialHit', { damage }),
        damage,
        partial: true,
      };
    }
  }

  startEnemyTurn(): 'quiz' {
    this.state = 'enemyQuiz';
    return 'quiz';
  }

  resolveEnemyAttack(quizCorrect: boolean, timeRatio?: number): CombatResult {
    // Enemy ALWAYS attacks — correct answers reduce damage
    let effectiveAtk = this.monster.baseAtk;

    // Rage: boost ATK when HP is low
    const rageAbility = this.getAbility('rage');
    let rageJustActivated = false;
    if (rageAbility) {
      const threshold = rageAbility.hpThreshold ?? 0.5;
      if (this.monsterHp / this.monster.baseHp <= threshold) {
        effectiveAtk = Math.floor(effectiveAtk * (rageAbility.atkMultiplier ?? 1.5));
        if (!this.rageActive) {
          this.rageActive = true;
          rageJustActivated = true;
        }
      }
    }

    // Charge: if charging, multiply ATK
    if (this.isCharging) {
      const chargeAbility = this.getAbility('charge');
      effectiveAtk = Math.floor(effectiveAtk * (chargeAbility?.chargeMultiplier ?? 2.0));
      this.isCharging = false;
    }

    let damage = this.calculateDamage(effectiveAtk, this.player.totalDef);

    // Damage reduction based on quiz answer
    // Correct + fast: 40% reduction; Correct + slow: 20% reduction
    // Same across all grades — younger grades already have easier quizzes + longer timers
    let reductionMsg = '';

    if (quizCorrect) {
      const fastAnswer = timeRatio !== undefined && timeRatio >= 0.5;
      if (fastAnswer) {
        damage = Math.max(1, Math.floor(damage * 0.6));
        reductionMsg = t('battle.enemyDamageReduced');
      } else {
        damage = Math.max(1, Math.floor(damage * 0.8));
        reductionMsg = t('battle.enemyDamageSoftened');
      }
    }

    if (this.isDefending) damage = Math.max(1, Math.floor(damage * DEFEND_DAMAGE_MULTIPLIER));
    this.isDefending = false;
    this.player.takeDamage(damage);

    const rageMsgs = rageJustActivated
      ? [t('ability.rageActivate', { monster: t(this.monster.nameKey) })]
      : [];

    const attackMsg = t('battle.enemyAttack', { monster: t(this.monster.nameKey) });
    const damageMsg = t('battle.hit', { damage });
    const fullMsg = reductionMsg
      ? `${attackMsg} ${reductionMsg} ${damageMsg}`
      : `${attackMsg} ${damageMsg}`;

    if (!this.player.isAlive) {
      this.state = 'defeat';
      return {
        state: 'defeat',
        message: fullMsg + ' ' + t('battle.defeated', { name: this.player.state.name }),
        damage,
        abilityMessages: rageMsgs,
      };
    }

    this.state = 'playerTurn';
    return {
      state: 'enemyResolve',
      message: fullMsg,
      damage,
      partial: quizCorrect,
      abilityMessages: rageMsgs,
    };
  }

  /** Process end-of-turn abilities (regen, poison, charge warning, shield countdown).
   *  Call after enemy attack resolves. Returns messages to display. */
  processTurnAbilities(): string[] {
    this.turnCount++;
    const messages: string[] = [];

    // Regen: heal monster each turn
    const regenAbility = this.getAbility('regen');
    if (regenAbility && this.monsterHp > 0 && this.monsterHp < this.monster.baseHp) {
      const healAmt = Math.max(1, Math.floor(this.monster.baseHp * (regenAbility.healFraction ?? 0.08)));
      this.monsterHp = Math.min(this.monster.baseHp, this.monsterHp + healAmt);
      messages.push(t('ability.regen', { monster: t(this.monster.nameKey), value: healAmt }));
    }

    // Poison: damage player each turn
    if (this.poisonActive) {
      const poisonAbility = this.getAbility('poison');
      const poisonDmg = Math.max(1, Math.floor(this.player.totalMaxHp * (poisonAbility?.poisonFraction ?? 0.05)));
      this.player.takeDamage(poisonDmg);
      messages.push(t('ability.poison', { name: this.player.state.name, damage: poisonDmg }));
    }

    // Charge: prepare for next turn
    const chargeAbility = this.getAbility('charge');
    if (chargeAbility) {
      const interval = chargeAbility.chargeInterval ?? 3;
      if (this.turnCount > 0 && this.turnCount % interval === interval - 1) {
        this.isCharging = true;
        messages.push(t('ability.chargeWarning', { monster: t(this.monster.nameKey) }));
      }
    }

    return messages;
  }

  /** Check if the player has been defeated by poison (call after processTurnAbilities) */
  isPlayerDefeatedByPoison(): boolean {
    return !this.player.isAlive;
  }

  /** Whether rage just activated this turn (for UI flash) */
  isRageActive(): boolean {
    return this.rageActive;
  }


  private victory(): CombatResult {
    this.state = 'victory';
    const expGain = this.monster.expReward;
    const goldGain = this.monster.goldReward;
    this.player.state.gold += goldGain;

    const levelResult = this.player.addExp(expGain);

    // Check drops
    const drops: string[] = [];
    for (const drop of this.monster.drops) {
      if (Math.random() < drop.chance) {
        if (this.player.addItem(drop.itemId, 1)) {
          drops.push(drop.itemId);
        }
      }
    }

    return {
      state: 'victory',
      message: t('battle.victory'),
      expGain,
      goldGain,
      levelUp: levelResult.leveled ? { newLevel: levelResult.newLevel } : undefined,
      drops,
    };
  }

  private calculateDamage(atk: number, def: number): number {
    // Minimum damage = 25% of ATK, so high-DEF can't trivialize combat
    const base = Math.max(Math.ceil(atk * 0.25), atk - Math.floor(def / 2));
    const variance = DAMAGE_VARIANCE_MIN + Math.random() * (DAMAGE_VARIANCE_MAX - DAMAGE_VARIANCE_MIN);
    return Math.max(1, Math.floor(base * variance));
  }
}
