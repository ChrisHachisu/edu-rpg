import { QuizQuestion, GradeLevel, DifficultyTier } from '../../../utils/types';

function rand(min: number, max: number): number {
  return Math.floor(Math.random() * (max - min + 1)) + min;
}

function shuffle<T>(arr: T[]): T[] {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

function makeAnswers(correct: number, gradeLevel: GradeLevel): QuizQuestion['answers'] {
  const answers = new Set<number>();
  answers.add(correct);

  const range = gradeLevel === 'k' ? 5 : 10;
  let attempts = 0;
  while (answers.size < 4 && attempts < 50) {
    const offset = rand(1, range) * (Math.random() > 0.5 ? 1 : -1);
    const wrong = correct + offset;
    if (wrong >= 0 || gradeLevel === '6') {
      answers.add(wrong);
    }
    attempts++;
  }
  let fill = 1;
  while (answers.size < 4) {
    answers.add(correct + fill * 10);
    fill++;
  }

  return shuffle([...answers].map(n => ({
    text: { en: String(n), ja: String(n) },
    isCorrect: n === correct,
  })));
}

// Helper to build a QuizQuestion object
function q(
  en: string, ja: string, correct: number, grade: GradeLevel,
  tier: DifficultyTier, category: string,
): QuizQuestion {
  return {
    questionText: { en, ja },
    answers: makeAnswers(correct, grade),
    category,
    gradeLevel: grade,
    difficultyTier: tier,
  };
}

// ═══════════════════════════════════════════════════
// KINDERGARTEN — Count dots, very simple addition
// ═══════════════════════════════════════════════════

function kEasy(): QuizQuestion {
  // Count dots 1-5
  const count = rand(1, 5);
  const dots = '●'.repeat(count);
  return q(`How many dots? ${dots}`, `いくつ？ ${dots}`, count, 'k', 'easy', 'counting');
}

function kMedium(): QuizQuestion {
  const type = rand(0, 1);
  if (type === 0) {
    // Count dots 1-10
    const count = rand(1, 10);
    const dots = '●'.repeat(count);
    return q(`How many dots? ${dots}`, `いくつ？ ${dots}`, count, 'k', 'medium', 'counting');
  } else {
    // Addition within 3 (1+1, 1+2, 2+1, 2+2)
    const a = rand(1, 2);
    const b = rand(1, 2);
    return q(`${a} + ${b} = ?`, `${a} + ${b} = ?`, a + b, 'k', 'medium', 'addition');
  }
}

function kHard(): QuizQuestion {
  // Addition within 5
  const a = rand(1, 3);
  const b = rand(1, 5 - a);
  return q(`${a} + ${b} = ?`, `${a} + ${b} = ?`, a + b, 'k', 'hard', 'addition');
}

// ═══════════════════════════════════════════════════
// GRADE 1 — Addition within 5, extending to 12
// ═══════════════════════════════════════════════════

function g1Easy(): QuizQuestion {
  // Addition within 5
  const a = rand(1, 4);
  const b = rand(1, 5 - a);
  return q(`${a} + ${b} = ?`, `${a} + ${b} = ?`, a + b, '1', 'easy', 'addition');
}

function g1Medium(): QuizQuestion {
  // Add/sub within 10
  const type = rand(0, 1);
  if (type === 0) {
    const a = rand(1, 7);
    const b = rand(1, 10 - a);
    return q(`${a} + ${b} = ?`, `${a} + ${b} = ?`, a + b, '1', 'medium', 'addition');
  } else {
    const a = rand(3, 10);
    const b = rand(1, a - 1);
    return q(`${a} - ${b} = ?`, `${a} - ${b} = ?`, a - b, '1', 'medium', 'subtraction');
  }
}

function g1Hard(): QuizQuestion {
  // Add/sub within 10, extending to sums up to 12
  const type = rand(0, 1);
  if (type === 0) {
    const a = rand(2, 8);
    const b = rand(1, 12 - a);
    return q(`${a} + ${b} = ?`, `${a} + ${b} = ?`, a + b, '1', 'hard', 'addition');
  } else {
    const a = rand(4, 12);
    const b = rand(1, a - 1);
    return q(`${a} - ${b} = ?`, `${a} - ${b} = ?`, a - b, '1', 'hard', 'subtraction');
  }
}

// ═══════════════════════════════════════════════════
// GRADE 2 — Add/sub within 10 to 20
// ═══════════════════════════════════════════════════

function g2Easy(): QuizQuestion {
  // Add/sub within 10
  const type = rand(0, 1);
  if (type === 0) {
    const a = rand(1, 7);
    const b = rand(1, 10 - a);
    return q(`${a} + ${b} = ?`, `${a} + ${b} = ?`, a + b, '2', 'easy', 'addition');
  } else {
    const a = rand(3, 10);
    const b = rand(1, a - 1);
    return q(`${a} - ${b} = ?`, `${a} - ${b} = ?`, a - b, '2', 'easy', 'subtraction');
  }
}

function g2Medium(): QuizQuestion {
  // Add/sub within 15
  const type = rand(0, 1);
  if (type === 0) {
    const a = rand(2, 10);
    const b = rand(1, 15 - a);
    return q(`${a} + ${b} = ?`, `${a} + ${b} = ?`, a + b, '2', 'medium', 'addition');
  } else {
    const a = rand(5, 15);
    const b = rand(1, a - 1);
    return q(`${a} - ${b} = ?`, `${a} - ${b} = ?`, a - b, '2', 'medium', 'subtraction');
  }
}

function g2Hard(): QuizQuestion {
  // Add/sub within 20
  const type = rand(0, 1);
  if (type === 0) {
    const a = rand(3, 15);
    const b = rand(1, 20 - a);
    return q(`${a} + ${b} = ?`, `${a} + ${b} = ?`, a + b, '2', 'hard', 'addition');
  } else {
    const a = rand(5, 20);
    const b = rand(1, a - 1);
    return q(`${a} - ${b} = ?`, `${a} - ${b} = ?`, a - b, '2', 'hard', 'subtraction');
  }
}

// ═══════════════════════════════════════════════════
// GRADE 3 — Add/sub within 20-50, intro multiplication
// ═══════════════════════════════════════════════════

function g3Easy(): QuizQuestion {
  // Add/sub within 20
  const type = rand(0, 1);
  if (type === 0) {
    const a = rand(3, 15);
    const b = rand(1, 20 - a);
    return q(`${a} + ${b} = ?`, `${a} + ${b} = ?`, a + b, '3', 'easy', 'addition');
  } else {
    const a = rand(5, 20);
    const b = rand(1, a - 1);
    return q(`${a} - ${b} = ?`, `${a} - ${b} = ?`, a - b, '3', 'easy', 'subtraction');
  }
}

function g3Medium(): QuizQuestion {
  // Add/sub within 30, intro multiplication (2×, 5× up to ×5)
  const type = rand(0, 2);
  if (type === 0) {
    const a = rand(5, 20);
    const b = rand(3, 30 - a);
    return q(`${a} + ${b} = ?`, `${a} + ${b} = ?`, a + b, '3', 'medium', 'addition');
  } else if (type === 1) {
    const a = rand(8, 30);
    const b = rand(2, a - 2);
    return q(`${a} - ${b} = ?`, `${a} - ${b} = ?`, a - b, '3', 'medium', 'subtraction');
  } else {
    const a = Math.random() > 0.5 ? 2 : 5;
    const b = rand(1, 5);
    return q(`${a} × ${b} = ?`, `${a} × ${b} = ?`, a * b, '3', 'medium', 'multiplication');
  }
}

function g3Hard(): QuizQuestion {
  // Add/sub within 50, multiplication 2-5 tables
  const type = rand(0, 2);
  if (type === 0) {
    const a = rand(10, 35);
    const b = rand(5, 50 - a);
    return q(`${a} + ${b} = ?`, `${a} + ${b} = ?`, a + b, '3', 'hard', 'addition');
  } else if (type === 1) {
    const a = rand(15, 50);
    const b = rand(3, a - 3);
    return q(`${a} - ${b} = ?`, `${a} - ${b} = ?`, a - b, '3', 'hard', 'subtraction');
  } else {
    const a = rand(2, 5);
    const b = rand(2, 5);
    return q(`${a} × ${b} = ?`, `${a} × ${b} = ?`, a * b, '3', 'hard', 'multiplication');
  }
}

// ═══════════════════════════════════════════════════
// GRADE 4 — Multiplication tables, division, fractions
// ═══════════════════════════════════════════════════

function g4Easy(): QuizQuestion {
  // Multiplication 2-5 tables, simple division
  const type = rand(0, 1);
  if (type === 0) {
    const a = rand(2, 5);
    const b = rand(2, 5);
    return q(`${a} × ${b} = ?`, `${a} × ${b} = ?`, a * b, '4', 'easy', 'multiplication');
  } else {
    const b = rand(2, 5);
    const answer = rand(2, 5);
    const a = b * answer;
    return q(`${a} ÷ ${b} = ?`, `${a} ÷ ${b} = ?`, answer, '4', 'easy', 'division');
  }
}

function g4Medium(): QuizQuestion {
  // Multiplication 2-9 tables, division within tables
  const type = rand(0, 1);
  if (type === 0) {
    const a = rand(2, 9);
    const b = rand(2, 9);
    return q(`${a} × ${b} = ?`, `${a} × ${b} = ?`, a * b, '4', 'medium', 'multiplication');
  } else {
    const b = rand(2, 9);
    const answer = rand(2, 9);
    const a = b * answer;
    return q(`${a} ÷ ${b} = ?`, `${a} ÷ ${b} = ?`, answer, '4', 'medium', 'division');
  }
}

function g4Hard(): QuizQuestion {
  // Full multiplication tables, simple fractions (1/2, 1/3, 1/4 of whole)
  const type = rand(0, 1);
  if (type === 0) {
    const a = rand(3, 12);
    const b = rand(2, 9);
    return q(`${a} × ${b} = ?`, `${a} × ${b} = ?`, a * b, '4', 'hard', 'multiplication');
  } else {
    const den = rand(2, 4);
    const whole = den * rand(2, 6);
    const answer = whole / den;
    return q(
      `What is 1/${den} of ${whole}?`,
      `${whole}の 1/${den}は？`,
      answer, '4', 'hard', 'fractions',
    );
  }
}

// ═══════════════════════════════════════════════════
// GRADE 5 — Multi-digit, percentages, order of ops
// ═══════════════════════════════════════════════════

function g5Easy(): QuizQuestion {
  // Multiplication tables review, simple multi-digit (12-20 × 2-5)
  const type = rand(0, 1);
  if (type === 0) {
    const a = rand(2, 9);
    const b = rand(2, 9);
    return q(`${a} × ${b} = ?`, `${a} × ${b} = ?`, a * b, '5', 'easy', 'multiplication');
  } else {
    const a = rand(12, 20);
    const b = rand(2, 5);
    return q(`${a} × ${b} = ?`, `${a} × ${b} = ?`, a * b, '5', 'easy', 'multiplication');
  }
}

function g5Medium(): QuizQuestion {
  // Multi-digit multiplication (2-digit × 1-digit), division
  const type = rand(0, 1);
  if (type === 0) {
    const a = rand(12, 25);
    const b = rand(3, 8);
    return q(`${a} × ${b} = ?`, `${a} × ${b} = ?`, a * b, '5', 'medium', 'multiplication');
  } else {
    const b = rand(3, 9);
    const answer = rand(5, 15);
    const a = b * answer;
    return q(`${a} ÷ ${b} = ?`, `${a} ÷ ${b} = ?`, answer, '5', 'medium', 'division');
  }
}

function g5Hard(): QuizQuestion {
  // Simple percentages (50%, 10%, 25%), basic order of ops
  const type = rand(0, 1);
  if (type === 0) {
    const pct = [10, 25, 50][rand(0, 2)];
    const whole = pct === 25 ? rand(2, 8) * 4 : rand(2, 10) * (100 / pct);
    const answer = (whole * pct) / 100;
    return q(
      `What is ${pct}% of ${whole}?`,
      `${whole}の${pct}%は？`,
      answer, '5', 'hard', 'percentages',
    );
  } else {
    const a = rand(1, 8);
    const b = rand(2, 4);
    const c = rand(2, 4);
    const answer = a + b * c;
    return q(
      `${a} + ${b} × ${c} = ?`,
      `${a} + ${b} × ${c} = ?`,
      answer, '5', 'hard', 'order_of_operations',
    );
  }
}

// ═══════════════════════════════════════════════════
// GRADE 6 — Percentages, ratios, negatives, equations
// ═══════════════════════════════════════════════════

function g6Easy(): QuizQuestion {
  // Percentages, simple order of ops
  const type = rand(0, 1);
  if (type === 0) {
    const pct = [10, 20, 25, 50][rand(0, 3)];
    const whole = pct === 25 ? rand(2, 8) * 4 : rand(2, 10) * (100 / pct);
    const answer = (whole * pct) / 100;
    return q(
      `What is ${pct}% of ${whole}?`,
      `${whole}の${pct}%は？`,
      answer, '6', 'easy', 'percentages',
    );
  } else {
    const a = rand(1, 10);
    const b = rand(2, 5);
    const c = rand(2, 5);
    const answer = a + b * c;
    return q(
      `${a} + ${b} × ${c} = ?`,
      `${a} + ${b} × ${c} = ?`,
      answer, '6', 'easy', 'order_of_operations',
    );
  }
}

function g6Medium(): QuizQuestion {
  // Ratios, intro negatives (-5 to 5), 1-step equations
  const type = rand(0, 2);
  if (type === 0) {
    const a = rand(2, 5);
    const b = rand(2, 5);
    const c = a * rand(2, 4);
    const answer = (c / a) * b;
    return q(
      `${a} : ${b} = ${c} : ?`,
      `${a} : ${b} = ${c} : ?`,
      answer, '6', 'medium', 'ratios',
    );
  } else if (type === 1) {
    const a = rand(-5, 5);
    const b = rand(-5, 5);
    const answer = a + b;
    const aStr = a < 0 ? `(${a})` : String(a);
    const bStr = b < 0 ? `(${b})` : String(b);
    return q(
      `${aStr} + ${bStr} = ?`,
      `${aStr} + ${bStr} = ?`,
      answer, '6', 'medium', 'negative_numbers',
    );
  } else {
    const x = rand(1, 10);
    const a = rand(1, 10);
    const b = x + a;
    return q(
      `x + ${a} = ${b}. What is x?`,
      `x + ${a} = ${b}。xは？`,
      x, '6', 'medium', 'algebra',
    );
  }
}

function g6Hard(): QuizQuestion {
  // Complex ratios, negatives (-10 to 10), multi-step equations
  const type = rand(0, 2);
  if (type === 0) {
    const a = rand(2, 6);
    const b = rand(2, 6);
    const c = a * rand(2, 5);
    const answer = (c / a) * b;
    return q(
      `${a} : ${b} = ${c} : ?`,
      `${a} : ${b} = ${c} : ?`,
      answer, '6', 'hard', 'ratios',
    );
  } else if (type === 1) {
    const a = rand(-10, 10);
    const b = rand(-10, 10);
    const answer = a + b;
    const aStr = a < 0 ? `(${a})` : String(a);
    const bStr = b < 0 ? `(${b})` : String(b);
    return q(
      `${aStr} + ${bStr} = ?`,
      `${aStr} + ${bStr} = ?`,
      answer, '6', 'hard', 'negative_numbers',
    );
  } else {
    // Multi-step: a × x = b
    const x = rand(2, 10);
    const a = rand(2, 6);
    const b = a * x;
    return q(
      `${a} × x = ${b}. What is x?`,
      `${a} × x = ${b}。xは？`,
      x, '6', 'hard', 'algebra',
    );
  }
}

// ═══════════════════════════════════════════════════
// DISPATCH TABLE
// ═══════════════════════════════════════════════════

const tieredGenerators: Record<GradeLevel, Record<DifficultyTier, () => QuizQuestion>> = {
  'k': { easy: kEasy, medium: kMedium, hard: kHard },
  '1': { easy: g1Easy, medium: g1Medium, hard: g1Hard },
  '2': { easy: g2Easy, medium: g2Medium, hard: g2Hard },
  '3': { easy: g3Easy, medium: g3Medium, hard: g3Hard },
  '4': { easy: g4Easy, medium: g4Medium, hard: g4Hard },
  '5': { easy: g5Easy, medium: g5Medium, hard: g5Hard },
  '6': { easy: g6Easy, medium: g6Medium, hard: g6Hard },
};

export function generateMathQuestion(gradeLevel: GradeLevel, tier: DifficultyTier = 'medium'): QuizQuestion {
  const gradeGens = tieredGenerators[gradeLevel];
  const generator = gradeGens?.[tier] ?? gradeGens?.['medium'];
  return generator();
}
