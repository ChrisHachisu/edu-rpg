import { MonsterTemplate, CombatActionType } from '../../utils/types';
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
}

export class CombatEngine {
  state: CombatState = 'start';
  monster: MonsterTemplate;
  monsterHp: number;
  player: Player;
  isDefending = false;
  private pendingAction: CombatActionType = 'attack';
  private pendingItemId: string | null = null;

  constructor(player: Player, monster: MonsterTemplate) {
    this.player = player;
    this.monster = monster;
    this.monsterHp = monster.baseHp;
  }

  start(): CombatResult {
    this.state = 'playerTurn';
    return {
      state: 'start',
      message: t('battle.appeared', { monster: t(this.monster.nameKey) }),
    };
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
      // Wrong answer: partial damage (50%)
      const damage = Math.max(1, Math.floor(this.calculateDamage(this.player.totalAtk, this.monster.baseDef) * 0.5));
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

  resolveEnemyAttack(quizCorrect: boolean): CombatResult {
    if (quizCorrect) {
      // Player answered correctly — enemy misses
      this.isDefending = false;
      this.state = 'playerTurn';
      return {
        state: 'enemyResolve',
        message: t('battle.enemyMiss', { monster: t(this.monster.nameKey) }),
      };
    } else {
      // Player answered incorrectly — enemy hits at 50% damage
      const effectiveAtk = this.monster.baseAtk;
      let damage = Math.max(1, Math.floor(this.calculateDamage(effectiveAtk, this.player.totalDef) * 0.5));
      if (this.isDefending) damage = Math.max(1, Math.floor(damage * DEFEND_DAMAGE_MULTIPLIER));
      this.isDefending = false;
      this.player.takeDamage(damage);

      if (!this.player.isAlive) {
        this.state = 'defeat';
        return {
          state: 'defeat',
          message: t('battle.hit', { damage }) + ' ' + t('battle.defeated', { name: this.player.state.name }),
          damage,
          partial: true,
        };
      }

      this.state = 'playerTurn';
      return {
        state: 'enemyResolve',
        message: t('battle.enemyAttack', { monster: t(this.monster.nameKey) }) + ' ' + t('battle.partialHit', { damage }),
        damage,
        partial: true,
      };
    }
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
