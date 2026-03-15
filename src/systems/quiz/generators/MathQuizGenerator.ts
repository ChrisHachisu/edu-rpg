import { QuizQuestion, GradeLevel } from '../../../utils/types';

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

  // Generate plausible wrong answers
  const range = gradeLevel === 'pre-k' || gradeLevel === 'k' ? 5 : 10;
  let attempts = 0;
  while (answers.size < 4 && attempts < 50) {
    const offset = rand(1, range) * (Math.random() > 0.5 ? 1 : -1);
    const wrong = correct + offset;
    if (wrong >= 0 || gradeLevel === '6') {
      answers.add(wrong);
    }
    attempts++;
  }
  // Fill remaining if needed
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

function generatePreK(): QuizQuestion {
  // Counting, number recognition 1-10, simple addition within 5
  const type = rand(0, 1);
  if (type === 0) {
    // Count: "How many? [dots]"
    const count = rand(1, 5);
    const dots = '●'.repeat(count);
    return {
      questionText: {
        en: `How many dots? ${dots}`,
        ja: `いくつ？ ${dots}`,
      },
      answers: makeAnswers(count, 'pre-k'),
      category: 'counting',
      gradeLevel: 'pre-k',
    };
  } else {
    const a = rand(1, 3);
    const b = rand(1, 3);
    return {
      questionText: {
        en: `${a} + ${b} = ?`,
        ja: `${a} + ${b} = ?`,
      },
      answers: makeAnswers(a + b, 'pre-k'),
      category: 'addition',
      gradeLevel: 'pre-k',
    };
  }
}

function generateK(): QuizQuestion {
  // Addition/subtraction within 10
  const type = rand(0, 1);
  if (type === 0) {
    const a = rand(1, 7);
    const b = rand(1, 10 - a);
    return {
      questionText: { en: `${a} + ${b} = ?`, ja: `${a} + ${b} = ?` },
      answers: makeAnswers(a + b, 'k'),
      category: 'addition',
      gradeLevel: 'k',
    };
  } else {
    const a = rand(3, 10);
    const b = rand(1, a - 1);
    return {
      questionText: { en: `${a} - ${b} = ?`, ja: `${a} - ${b} = ?` },
      answers: makeAnswers(a - b, 'k'),
      category: 'subtraction',
      gradeLevel: 'k',
    };
  }
}

function generateGrade1(): QuizQuestion {
  // Addition/subtraction within 20
  const type = rand(0, 1);
  if (type === 0) {
    const a = rand(1, 12);
    const b = rand(1, 20 - a);
    return {
      questionText: { en: `${a} + ${b} = ?`, ja: `${a} + ${b} = ?` },
      answers: makeAnswers(a + b, '1'),
      category: 'addition',
      gradeLevel: '1',
    };
  } else {
    const a = rand(5, 20);
    const b = rand(1, a);
    return {
      questionText: { en: `${a} - ${b} = ?`, ja: `${a} - ${b} = ?` },
      answers: makeAnswers(a - b, '1'),
      category: 'subtraction',
      gradeLevel: '1',
    };
  }
}

function generateGrade2(): QuizQuestion {
  // Add/sub within 100, intro multiplication
  const type = rand(0, 2);
  if (type === 0) {
    const a = rand(10, 70);
    const b = rand(5, 99 - a);
    return {
      questionText: { en: `${a} + ${b} = ?`, ja: `${a} + ${b} = ?` },
      answers: makeAnswers(a + b, '2'),
      category: 'addition',
      gradeLevel: '2',
    };
  } else if (type === 1) {
    const a = rand(20, 99);
    const b = rand(5, a);
    return {
      questionText: { en: `${a} - ${b} = ?`, ja: `${a} - ${b} = ?` },
      answers: makeAnswers(a - b, '2'),
      category: 'subtraction',
      gradeLevel: '2',
    };
  } else {
    const a = rand(2, 5);
    const b = rand(2, 5);
    return {
      questionText: { en: `${a} × ${b} = ?`, ja: `${a} × ${b} = ?` },
      answers: makeAnswers(a * b, '2'),
      category: 'multiplication',
      gradeLevel: '2',
    };
  }
}

function generateGrade3(): QuizQuestion {
  // Multiplication/division, larger numbers
  const type = rand(0, 2);
  if (type === 0) {
    const a = rand(2, 9);
    const b = rand(2, 9);
    return {
      questionText: { en: `${a} × ${b} = ?`, ja: `${a} × ${b} = ?` },
      answers: makeAnswers(a * b, '3'),
      category: 'multiplication',
      gradeLevel: '3',
    };
  } else if (type === 1) {
    const b = rand(2, 9);
    const answer = rand(2, 9);
    const a = b * answer;
    return {
      questionText: { en: `${a} ÷ ${b} = ?`, ja: `${a} ÷ ${b} = ?` },
      answers: makeAnswers(answer, '3'),
      category: 'division',
      gradeLevel: '3',
    };
  } else {
    const a = rand(50, 200);
    const b = rand(20, 150);
    return {
      questionText: { en: `${a} + ${b} = ?`, ja: `${a} + ${b} = ?` },
      answers: makeAnswers(a + b, '3'),
      category: 'addition',
      gradeLevel: '3',
    };
  }
}

function generateGrade4(): QuizQuestion {
  // Multi-digit ops, simple fractions
  const type = rand(0, 2);
  if (type === 0) {
    const a = rand(12, 25);
    const b = rand(3, 9);
    return {
      questionText: { en: `${a} × ${b} = ?`, ja: `${a} × ${b} = ?` },
      answers: makeAnswers(a * b, '4'),
      category: 'multiplication',
      gradeLevel: '4',
    };
  } else if (type === 1) {
    const b = rand(3, 9);
    const answer = rand(10, 30);
    const a = b * answer;
    return {
      questionText: { en: `${a} ÷ ${b} = ?`, ja: `${a} ÷ ${b} = ?` },
      answers: makeAnswers(answer, '4'),
      category: 'division',
      gradeLevel: '4',
    };
  } else {
    // Simple fraction: what is 1/N of X?
    const den = rand(2, 5);
    const whole = den * rand(2, 6);
    const answer = whole / den;
    return {
      questionText: {
        en: `What is 1/${den} of ${whole}?`,
        ja: `${whole}の 1/${den}は？`,
      },
      answers: makeAnswers(answer, '4'),
      category: 'fractions',
      gradeLevel: '4',
    };
  }
}

function generateGrade5(): QuizQuestion {
  // Percentages, order of operations
  const type = rand(0, 2);
  if (type === 0) {
    // Percentage
    const pct = [10, 20, 25, 50][rand(0, 3)];
    const whole = pct === 25 ? rand(1, 10) * 4 : rand(1, 10) * (100 / pct);
    const answer = (whole * pct) / 100;
    return {
      questionText: {
        en: `What is ${pct}% of ${whole}?`,
        ja: `${whole}の${pct}%は？`,
      },
      answers: makeAnswers(answer, '5'),
      category: 'percentages',
      gradeLevel: '5',
    };
  } else if (type === 1) {
    // Order of ops: a + b × c
    const a = rand(1, 10);
    const b = rand(2, 5);
    const c = rand(2, 5);
    const answer = a + b * c;
    return {
      questionText: {
        en: `${a} + ${b} × ${c} = ?`,
        ja: `${a} + ${b} × ${c} = ?`,
      },
      answers: makeAnswers(answer, '5'),
      category: 'order_of_operations',
      gradeLevel: '5',
    };
  } else {
    const a = rand(100, 500);
    const b = rand(100, 500);
    return {
      questionText: { en: `${a} + ${b} = ?`, ja: `${a} + ${b} = ?` },
      answers: makeAnswers(a + b, '5'),
      category: 'addition',
      gradeLevel: '5',
    };
  }
}

function generateGrade6(): QuizQuestion {
  // Negative numbers, ratios, basic algebra
  const type = rand(0, 2);
  if (type === 0) {
    // Negative numbers
    const a = rand(-10, 10);
    const b = rand(-10, 10);
    const answer = a + b;
    const aStr = a < 0 ? `(${a})` : String(a);
    const bStr = b < 0 ? `(${b})` : String(b);
    return {
      questionText: {
        en: `${aStr} + ${bStr} = ?`,
        ja: `${aStr} + ${bStr} = ?`,
      },
      answers: makeAnswers(answer, '6'),
      category: 'negative_numbers',
      gradeLevel: '6',
    };
  } else if (type === 1) {
    // Basic algebra: x + a = b
    const x = rand(1, 15);
    const a = rand(1, 15);
    const b = x + a;
    return {
      questionText: {
        en: `x + ${a} = ${b}. What is x?`,
        ja: `x + ${a} = ${b}。xは？`,
      },
      answers: makeAnswers(x, '6'),
      category: 'algebra',
      gradeLevel: '6',
    };
  } else {
    // Ratio: if a:b = c:?, what is ?
    const a = rand(2, 6);
    const b = rand(2, 6);
    const c = a * rand(2, 5);
    const answer = (c / a) * b;
    return {
      questionText: {
        en: `${a} : ${b} = ${c} : ?`,
        ja: `${a} : ${b} = ${c} : ?`,
      },
      answers: makeAnswers(answer, '6'),
      category: 'ratios',
      gradeLevel: '6',
    };
  }
}

const generators: Record<GradeLevel, () => QuizQuestion> = {
  'pre-k': generatePreK,
  'k': generateK,
  '1': generateGrade1,
  '2': generateGrade2,
  '3': generateGrade3,
  '4': generateGrade4,
  '5': generateGrade5,
  '6': generateGrade6,
};

export function generateMathQuestion(gradeLevel: GradeLevel): QuizQuestion {
  return generators[gradeLevel]();
}
