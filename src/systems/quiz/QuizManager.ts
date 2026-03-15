import { QuizQuestion, GradeLevel } from '../../utils/types';
import { generateMathQuestion } from './generators/MathQuizGenerator';

// Base timer in seconds per grade level
// Generous timers — educational game, kids should not feel rushed
const BASE_TIMER: Record<GradeLevel, number> = {
  'pre-k': 30,
  'k': 30,
  '1': 20,
  '2': 18,
  '3': 15,
  '4': 13,
  '5': 12,
  '6': 10,
};

// Enemy strength multiplier for timer
// Higher = more time, lower = less time (pressure)
export type EnemyTier = 'weak' | 'normal' | 'strong' | 'boss';
const ENEMY_TIMER_MULT: Record<EnemyTier, number> = {
  weak: 1.5,
  normal: 1.0,
  strong: 0.85,
  boss: 0.75,
};

// Grade levels in order for mercy system
const GRADE_ORDER: GradeLevel[] = ['pre-k', 'k', '1', '2', '3', '4', '5', '6'];

export class QuizManager {
  private difficulty: GradeLevel = '1';
  private consecutiveWrong = 0;
  private consecutiveCorrect = 0;
  private stats = {
    totalAsked: 0,
    totalCorrect: 0,
    byCategory: {} as Record<string, { asked: number; correct: number }>,
  };

  setDifficulty(grade: GradeLevel): void {
    this.difficulty = grade;
  }

  getDifficulty(): GradeLevel {
    return this.difficulty;
  }

  getQuestion(): QuizQuestion {
    // Mercy system: after 2 consecutive wrong, drop question difficulty by 1 grade
    const effectiveGrade = this.getEffectiveGrade();
    return generateMathQuestion(effectiveGrade);
  }

  /** Get the timer duration in seconds for a quiz, factoring in all variables */
  getTimerSeconds(enemyTier: EnemyTier): number {
    const base = BASE_TIMER[this.difficulty];
    const enemyMult = ENEMY_TIMER_MULT[enemyTier];
    // Streak bonus: +1s per 3 correct in a row, max +3s
    const streakBonus = Math.min(3, Math.floor(this.consecutiveCorrect / 3));
    return Math.max(3, Math.round(base * enemyMult + streakBonus));
  }

  recordAnswer(category: string, correct: boolean): void {
    this.stats.totalAsked++;
    if (correct) {
      this.stats.totalCorrect++;
      this.consecutiveCorrect++;
      this.consecutiveWrong = 0;
    } else {
      this.consecutiveWrong++;
      this.consecutiveCorrect = 0;
    }
    if (!this.stats.byCategory[category]) {
      this.stats.byCategory[category] = { asked: 0, correct: 0 };
    }
    this.stats.byCategory[category].asked++;
    if (correct) this.stats.byCategory[category].correct++;
  }

  getStats() {
    return { ...this.stats };
  }

  loadStats(stats: typeof this.stats): void {
    this.stats = { ...stats };
  }

  /** Mercy: drop grade by 1 after 2 consecutive wrong answers */
  private getEffectiveGrade(): GradeLevel {
    if (this.consecutiveWrong < 2) return this.difficulty;
    const idx = GRADE_ORDER.indexOf(this.difficulty);
    const mercyIdx = Math.max(0, idx - 1);
    return GRADE_ORDER[mercyIdx];
  }
}
