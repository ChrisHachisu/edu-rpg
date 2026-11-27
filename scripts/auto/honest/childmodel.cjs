'use strict';
// Honest player, day 4 B2: an INDEPENDENT child-time model (review finding 1: the game's timers and the simulated child's thinking
// time came from the same judgement table, effort-ref.json, so "no timeouts" held by construction).
//
// This file never reads effort-ref.json, quiz-content.cjs effort() or the class table in public/battle-recovery.js. It reads the
// question TEXT, names its kind from the numbers in it (carry, borrow, digits, times-table size: facts about the question), and
// looks the kind up in the table below.
//
// EVERY NUMBER BELOW IS AN ASSUMPTION, NOT A MEASUREMENT. No child was timed. The seconds are the writer's reading of common
// classroom fluency lines (a known single-digit fact inside about 3 s counts as fluent; finger counting in kindergarten and early
// grade 1 runs 5 to 10 s; written column work costs several seconds a column and more with regrouping; a written 2-digit x 2-digit
// product is four facts, carries and a two-row addition, half a minute to a minute for a typical grade 4 child). They are meant to
// be replaced by stopwatch times of real children (owner's page: REPORT-B2.md "Stopwatch page").
//
//   sec[grade]  median seconds for the MEDIAN child of that grade to read the question and work the answer out, typing not included.
//               A grade above the last one listed takes x0.88 a year (floor x0.6 of the last listed); a grade below the first listed x1.3 a year.
//   cls         how the answer is reached, which sets how much slower a slow child is and how much less sure:
//               recall (a known fact or one look), mental (two or three steps in the head), written (column work, usually on the
//               notepad), hard (written, several rows: 2-digit x 2-digit, long division by two digits, unlike fractions, unit chains)
const KINDS = {
  // kindergarten
  count_small:    { cls: 'recall',  sec: { k: 3.0 },            what: 'count up to 5 shapes' },
  count_big:      { cls: 'mental',  sec: { k: 7.5 },            what: 'count 6 to 10 shapes (one by one)' },
  next_after:     { cls: 'recall',  sec: { k: 3.5 },            what: 'the number after n' },
  next_before:    { cls: 'mental',  sec: { k: 5.5 },            what: 'the number before n' },
  compare:        { cls: 'recall',  sec: { k: 4.0 },            what: 'which is bigger / smaller' },
  add10:          { cls: 'recall',  sec: { k: 7.0, 1: 3.5, 2: 2.5 }, what: 'single digits, sum up to 10 (kindergarten counts on fingers)' },
  sub10:          { cls: 'recall',  sec: { k: 8.0, 1: 4.5, 2: 3.0 }, what: 'take away within 10' },
  miss10:         { cls: 'mental',  sec: { k: 10, 1: 6.0 },     what: 'fill the blank, sum up to 10' },
  // grade 1
  zero:           { cls: 'recall',  sec: { 1: 2.0 },            what: 'adding or taking away 0' },
  teen_add:       { cls: 'recall',  sec: { 1: 4.5 },            what: 'teen + ones, no carrying' },
  teen_sub:       { cls: 'recall',  sec: { 1: 5.5 },            what: 'teen - ones, no borrowing' },
  three10:        { cls: 'mental',  sec: { 1: 8.0 },            what: 'three numbers, every step within 10' },
  three_make10:   { cls: 'mental',  sec: { 1: 7.0 },            what: 'three numbers, two of them make 10' },
  three_cross:    { cls: 'mental',  sec: { 1: 11 },             what: 'three numbers crossing 10' },
  add_carry:      { cls: 'recall',  sec: { 1: 6.0, 2: 3.5, 3: 2.5 }, what: 'single digits, sum 11 to 18 (grade 1 makes ten or counts on)' },
  sub_borrow:     { cls: 'recall',  sec: { 1: 8.0, 2: 4.5, 3: 3.0 }, what: 'teen - single digit with borrowing' },
  miss_carry:     { cls: 'mental',  sec: { 1: 11, 2: 7.0 },     what: 'fill the blank, carrying or borrowing' },
  tens_tens:      { cls: 'recall',  sec: { 1: 4.0, 2: 3.0 },    what: 'tens + or - tens' },
  tens_over100:   { cls: 'mental',  sec: { 2: 5.0 },            what: 'tens that cross 100 (50 + 80, 150 - 80)' },
  d2_d1_plain:    { cls: 'recall',  sec: { 1: 5.0, 2: 3.5 },    what: 'two-digit + or - ones, no carrying' },
  d2_tens:        { cls: 'mental',  sec: { 1: 6.0, 2: 4.0 },    what: 'two-digit + or - tens' },
  n_tens:         { cls: 'recall',  sec: { 1: 3.0, 2: 2.5 },    what: 'how many is n tens / hundreds (n up to 10)' },
  n_tens_big:     { cls: 'mental',  sec: { 2: 5.0 },            what: 'how many is n tens (n over 10)' },
  // grade 2
  d2_d1_carry:    { cls: 'mental',  sec: { 2: 6.0 },            what: 'two-digit + one-digit with carrying' },
  d2_d1_borrow:   { cls: 'mental',  sec: { 2: 7.5 },            what: 'two-digit - one-digit with borrowing' },
  d2_add_plain:   { cls: 'mental',  sec: { 2: 7.0 },            what: 'two-digit + two-digit, no carrying' },
  d2_sub_plain:   { cls: 'mental',  sec: { 2: 8.0 },            what: 'two-digit - two-digit, no borrowing' },
  d2_add_carry:   { cls: 'written', sec: { 2: 11, 3: 9.0 },     what: 'two-digit + two-digit with carrying' },
  d2_sub_borrow:  { cls: 'written', sec: { 2: 14, 3: 11 },      what: 'two-digit - two-digit with borrowing' },
  hundred_minus:  { cls: 'written', sec: { 2: 12 },             what: '100 - two-digit' },
  d2_add_over100: { cls: 'written', sec: { 2: 13 },             what: 'two-digit + two-digit, sum over 100' },
  d3_minus_d2:    { cls: 'written', sec: { 2: 17 },             what: 'hundred-and-something - two-digit' },
  times_trivial:  { cls: 'recall',  sec: { 2: 3.0, 3: 2.0 },    what: 'x 0, x 1, x 10' },
  times_easy:     { cls: 'recall',  sec: { 2: 4.0, 3: 2.5, 4: 2.0 }, what: 'times tables of 2 to 5' },
  times_hard:     { cls: 'recall',  sec: { 2: 6.0, 3: 3.5, 4: 2.5 }, what: 'times tables, both numbers 6 to 9' },
  times_11_12:    { cls: 'mental',  sec: { 2: 8.0 },            what: 'x 11 and x 12 with a single digit' },
  hm_to_min:      { cls: 'mental',  sec: { 2: 12, 3: 9.0 },     what: 'hours and minutes into minutes' },
  m_cm:           { cls: 'mental',  sec: { 2: 6.0 },            what: 'm and cm into cm, cm and mm into mm' },
  // grade 3
  km_kg:          { cls: 'mental',  sec: { 3: 7.0 },            what: 'km and m into m, kg and g into g' },
  min_s:          { cls: 'mental',  sec: { 3: 12 },             what: 'minutes and seconds into seconds' },
  round_h_pm:     { cls: 'mental',  sec: { 3: 9.0 },            what: 'round three-digit numbers + or - (640 + 240)' },
  miss_d2:        { cls: 'written', sec: { 3: 13 },             what: 'fill the blank, two-digit + or -' },
  div_fact:       { cls: 'recall',  sec: { 3: 4.5, 4: 3.0 },    what: 'division facts (up to 81 / 9)' },
  miss_muldiv:    { cls: 'mental',  sec: { 3: 6.0 },            what: 'fill the blank, x and /' },
  d3_pm:          { cls: 'written', sec: { 3: 22, 4: 18 },      what: 'three-digit + or - three-digit' },
  div_rem:        { cls: 'mental',  sec: { 3: 9.0, 4: 7.0 },    what: 'division with a remainder, one-digit answer' },
  div_rem_d2:     { cls: 'written', sec: { 4: 16 },             what: 'division with a remainder, two-digit answer' },
  tens_x_d1:      { cls: 'mental',  sec: { 3: 5.0 },            what: 'tens and hundreds x one digit' },
  how_many_times: { cls: 'recall',  sec: { 3: 6.0, 4: 4.5 },    what: '"how many times"' },
  d2_x_d1:        { cls: 'written', sec: { 3: 13, 4: 10, 5: 8.0 }, what: 'two-digit x one-digit' },
  d3_x_d1:        { cls: 'written', sec: { 3: 11, 4: 10 },      what: 'three-digit x one-digit' },
  short_div_easy: { cls: 'mental',  sec: { 3: 8.0, 4: 6.5 },    what: 'two- or three-digit / one-digit, each digit divides' },
  short_div:      { cls: 'written', sec: { 4: 13 },             what: 'two- or three-digit / one-digit with carrying' },
  tens_div:       { cls: 'mental',  sec: { 4: 6.0 },            what: 'tens and hundreds / one digit, / tens' },
  d2_x_tens:      { cls: 'written', sec: { 3: 14, 4: 12 },      what: 'two-digit x tens' },
  x11:            { cls: 'written', sec: { 3: 16, 4: 14 },      what: 'two-digit x 11' },
  dec_pm:         { cls: 'mental',  sec: { 3: 7.0, 4: 6.0 },    what: 'decimals + or -, whole answer' },
  frac_same:      { cls: 'mental',  sec: { 3: 5.0, 4: 9.0 },    what: 'fractions with the same bottom number (grade 4: over 1)' },
  frac_mixed:     { cls: 'mental',  sec: { 4: 12 },             what: 'mixed number into a fraction' },
  unit_frac_of:   { cls: 'mental',  sec: { 3: 7.0 },            what: 'a unit fraction of a number' },
  // grade 4
  rounding:       { cls: 'mental',  sec: { 4: 7.0 },            what: 'rounding to the nearest 10, 100, 1000' },
  div_d2_small:   { cls: 'written', sec: { 4: 14, 5: 12 },      what: 'two-digit / two-digit' },
  div_d2:         { cls: 'hard',    sec: { 4: 25, 5: 21 },      what: 'three-digit / two-digit' },
  d2_x_d2_small:  { cls: 'hard',    sec: { 4: 35, 5: 30 },      what: 'two-digit x two-digit, both up to 25' },
  d2_x_d2:        { cls: 'hard',    sec: { 4: 50, 5: 42 },      what: 'two-digit x two-digit, larger' },
  ooo_2:          { cls: 'mental',  sec: { 4: 10, 5: 8.0 },     what: 'order of operations, two steps' },
  ooo_long:       { cls: 'written', sec: { 4: 16 },             what: 'order of operations, three steps' },
  mul3_easy:      { cls: 'mental',  sec: { 4: 12 },             what: 'three numbers multiplied the easy way' },
  area_small:     { cls: 'mental',  sec: { 4: 7.0 },            what: 'area, a side of one digit or 10' },
  dec_x_whole:    { cls: 'written', sec: { 4: 11, 5: 10 },      what: 'decimal x whole number' },
  // grade 5
  dec_x_pow10:    { cls: 'recall',  sec: { 5: 5.0 },            what: 'decimal x 10, 100, 1000' },
  dec_div_dec:    { cls: 'written', sec: { 5: 14 },             what: 'decimal / decimal' },
  dec_x_dec:      { cls: 'hard',    sec: { 5: 20 },             what: 'decimal x decimal' },
  lcm:            { cls: 'mental',  sec: { 5: 10 },             what: 'least common multiple' },
  gcf:            { cls: 'written', sec: { 5: 14 },             what: 'greatest common factor' },
  eq_frac:        { cls: 'mental',  sec: { 5: 9.0 },            what: 'equal fractions, fill the blank' },
  frac_unlike:    { cls: 'hard',    sec: { 5: 20 },             what: 'fractions with different bottom numbers + or -' },
  avg3:           { cls: 'written', sec: { 5: 16 },             what: 'average of three numbers, sum under 100' },
  avg3_big:       { cls: 'hard',    sec: { 5: 24 },             what: 'average of three numbers, sum over 100' },
  speed_simple:   { cls: 'mental',  sec: { 5: 9.0 },            what: 'speed, distance, time with a one-digit step' },
  speed_d2:       { cls: 'written', sec: { 5: 17, 6: 15 },      what: 'speed, distance, time with two two-digit numbers (150 m/min for 12 min)' },
  pct_easy:       { cls: 'mental',  sec: { 5: 7.0 },            what: '10%, 50% or 100% of a number' },
  pct_of:         { cls: 'written', sec: { 5: 14 },             what: 'percent of a number' },
  pct_over100:    { cls: 'written', sec: { 5: 18 },             what: 'percent of a number, over 100%' },
  what_pct:       { cls: 'written', sec: { 5: 16 },             what: '"what percent"' },
  tri_area:       { cls: 'mental',  sec: { 5: 11 },             what: 'area of a triangle' },
  // grade 6
  x_fact:         { cls: 'mental',  sec: { 6: 6.0 },            what: 'find x, one step, x or /' },
  x_pm:           { cls: 'written', sec: { 6: 12 },             what: 'find x, one step, + or - with two-digit numbers' },
  x_two_step:     { cls: 'written', sec: { 6: 14 },             what: 'find x, two steps' },
  frac_x_whole:   { cls: 'mental',  sec: { 6: 10 },             what: 'fraction x whole number, a fraction of a number' },
  frac_x_frac:    { cls: 'written', sec: { 6: 14 },             what: 'fraction x fraction' },
  frac_div_frac:  { cls: 'written', sec: { 6: 16 },             what: 'fraction / fraction' },
  whole_div_frac: { cls: 'mental',  sec: { 6: 7.0 },            what: 'whole number / unit fraction' },
  frac_hour:      { cls: 'mental',  sec: { 6: 11 },             what: 'a fraction of an hour in minutes' },
  ratio_fill:     { cls: 'mental',  sec: { 6: 9.0 },            what: 'equal ratios, fill the blank' },
  prop:           { cls: 'mental',  sec: { 6: 7.0 },            what: 'y = k x x and x x y = k' },
  share_ratio:    { cls: 'hard',    sec: { 6: 22 },             what: 'sharing in a ratio' },
  speed_units:    { cls: 'hard',    sec: { 6: 25 },             what: 'changing speed units' },
  pct_whole_easy: { cls: 'mental',  sec: { 6: 8.0 },            what: '"10% (or 50%) of what is n"' },
  pct_whole:      { cls: 'written', sec: { 6: 16 },             what: '"25% of what is n"' },
  pct_updown:     { cls: 'hard',    sec: { 6: 20 },             what: 'increase / decrease by a percent' },
  negatives:      { cls: 'mental',  sec: { 6: 8.0 },            what: 'negative numbers + and -' },
  unknown:        { cls: 'mental',  sec: { k: 10 },             what: 'a question this file cannot name (counted in every report)' },
};
// The three children. timeMul = her median time as a multiple of the median child's, by class; sd = spread of one answer around her
// own median (log-normal); acc = what is added to the grade's right-answer share; typeMul = typing time against the median child.
// ASSUMPTIONS: slow is "about the 15th percentile" (2 to 3 times the median on written multi-step kinds), fast about the 85th.
const CHILDREN = {
  slow:   { timeMul: { recall: 1.6, mental: 2.0, written: 2.5, hard: 3.0 },   acc: -0.10, typeMul: 1.5 },
  median: { timeMul: { recall: 1.0, mental: 1.0, written: 1.0, hard: 1.0 },   acc: 0,     typeMul: 1.0 },
  fast:   { timeMul: { recall: 0.7, mental: 0.65, written: 0.6, hard: 0.6 },  acc: 0.07,  typeMul: 0.8 },
};
// right answers drop with the kind's difficulty: her share for the grade (profiles.cjs p, plus the child's own shift) is multiplied
// by this, and never goes over 0.98. ASSUMPTION: a known fact is a little surer than her average, several written rows much less sure.
const ACC_MUL = { recall: 1.06, mental: 1.0, written: 0.88, hard: 0.75 };
const SD = { recall: 0.35, mental: 0.35, written: 0.45, hard: 0.45 };
const ORDER = ['k', '1', '2', '3', '4', '5', '6'];

const dg = n => String(Math.abs(n)).length;
function carries(a, b) { let c = 0, k = 0; while (a > 0 || b > 0) { k = (a % 10 + b % 10 + k) > 9 ? 1 : 0; c += k; a = Math.floor(a / 10); b = Math.floor(b / 10); } return c; }
function borrows(a, b) { let c = 0, k = 0; while (a > 0 || b > 0) { k = (a % 10 - k - b % 10) < 0 ? 1 : 0; c += k; a = Math.floor(a / 10); b = Math.floor(b / 10); } return c; }
function addKind(a, b) {
  if (a === 0 || b === 0) return 'zero';
  if (a < 10 && b < 10) return a + b <= 10 ? 'add10' : 'add_carry';
  const hi = Math.max(a, b), lo = Math.min(a, b);
  if (a % 10 === 0 && b % 10 === 0 && hi < 100) return a + b > 100 ? 'tens_over100' : 'tens_tens';
  if (a % 10 === 0 && b % 10 === 0 && hi < 1000) return 'round_h_pm';
  if (hi < 20 && lo < 10) return carries(a, b) ? 'd2_d1_carry' : 'teen_add';
  if (hi < 100 && lo < 10) return carries(a, b) ? 'd2_d1_carry' : 'd2_d1_plain';
  if (hi < 100 && (a % 10 === 0 || b % 10 === 0)) return 'd2_tens';
  if (hi < 100) return a + b > 100 ? 'd2_add_over100' : carries(a, b) ? 'd2_add_carry' : 'd2_add_plain';
  return 'd3_pm';
}
function subKind(a, b) {
  if (b === 0) return 'zero';
  if (a <= 10) return 'sub10';
  if (a % 10 === 0 && b % 10 === 0 && a <= 100) return 'tens_tens';
  if (a % 10 === 0 && b % 10 === 0 && a < 200 && b < 100) return 'tens_over100';
  if (a % 10 === 0 && b % 10 === 0 && a < 1000) return 'round_h_pm';
  if (a < 20 && b <= 10) return borrows(a, b) ? 'sub_borrow' : 'teen_sub';
  if (a < 100 && b < 10) return borrows(a, b) ? 'd2_d1_borrow' : 'd2_d1_plain';
  if (a < 100 && b % 10 === 0) return 'd2_tens';
  if (a === 100 && b < 100) return 'hundred_minus';
  if (a < 100) return borrows(a, b) ? 'd2_sub_borrow' : 'd2_sub_plain';
  if (a < 200 && b < 100) return 'd3_minus_d2';
  return 'd3_pm';
}
function mulKind(a, b) {
  const lo = Math.min(a, b), hi = Math.max(a, b);
  if (lo <= 1 || (hi === 10 && lo < 10)) return 'times_trivial';
  if (hi < 10) return lo >= 6 ? 'times_hard' : 'times_easy';
  if (lo < 10 && hi <= 12) return 'times_11_12';
  if (lo < 10 && hi % 10 === 0 && dg(String(hi).replace(/0+$/, '')) === 1) return 'tens_x_d1';
  if (lo < 10) return hi < 100 ? 'd2_x_d1' : 'd3_x_d1';
  if (lo === 11 || hi === 11) return 'x11';
  if (a % 10 === 0 || b % 10 === 0) return 'd2_x_tens';
  return hi <= 25 ? 'd2_x_d2_small' : 'd2_x_d2';
}
function divKind(n, d) {
  const q = Math.floor(n / d);
  if (d < 10 && q < 10) return 'div_fact';
  if (d >= 10 && d % 10 === 0 && n % 10 === 0 && q < 10) return 'tens_div';
  if (d < 10) { for (let v = n; v % 10 === 0 && v >= 10; ) { v /= 10; if (v < 100 && v % d === 0 && v / d < 10) return 'tens_div'; }
    return String(n).split('').every(c => Number(c) % d === 0) ? 'short_div_easy' : 'short_div'; }
  return n < 100 ? 'div_d2_small' : 'div_d2';
}
const N = Number;
// the kind of one question, from its English text. Returns { kind, add } (add = extra seconds on top of the kind, e.g. reading a sentence).
function kindOf(text) {
  const s = String(text).replace(/−/g, '-').replace(/[\u00a0\u2009\u202f]/g, ' ').trim(); let m;
  if ((m = /^How many \w+\? ([●★♥■▲ ]+)$/.exec(s))) return { kind: m[1].replace(/ /g, '').length <= 5 ? 'count_small' : 'count_big' };
  if ((m = /^What comes (after|before) (\d+)\?$/.exec(s))) return { kind: m[1] === 'after' ? 'next_after' : 'next_before', add: N(m[2]) > 10 ? 1 : 0 };
  if ((m = /^Which is (?:bigger|smaller): (\d+) or (\d+)\?$/.exec(s))) return { kind: 'compare', add: Math.max(N(m[1]), N(m[2])) > 10 ? 1 : 0 };
  if ((m = /^(\d+) (tens|hundreds) = \?$/.exec(s))) return { kind: N(m[1]) > 10 ? 'n_tens_big' : 'n_tens' };
  if ((m = /^(\d+) is how many times (\d+)\?$/.exec(s))) return { kind: 'how_many_times' };
  if ((m = /^(\d+) ÷ (\d+) = (\d+|\?) remainder (\d+|\?)$/.exec(s))) return { kind: Math.floor(N(m[1]) / N(m[2])) >= 10 ? 'div_rem_d2' : 'div_rem' };
  if (/^\d+ hours? \d+ min = \? min$/.test(s)) return { kind: 'hm_to_min' };
  if (/^\d+ min \d+ s = \? s$/.test(s)) return { kind: 'min_s' };
  if ((m = /^\d+ (m|cm|km|kg) \d+ (cm|mm|m|g) = \? (?:cm|mm|m|g)$/.exec(s))) return { kind: m[1] === 'km' || m[1] === 'kg' ? 'km_kg' : 'm_cm' };
  if (/^Round \d+ to the nearest/.test(s)) return { kind: 'rounding' };
  if ((m = /^Area of a square with side (\d+)\?$/.exec(s))) { const k = mulKind(N(m[1]), N(m[1])); return /^times_|^tens_x/.test(k) ? { kind: 'area_small' } : { kind: k, add: 3 }; }
  if ((m = /^Area of an? (\d+) by (\d+) rectangle\?$/.exec(s))) { const k = mulKind(N(m[1]), N(m[2])); return /^times_|^tens_x/.test(k) ? { kind: 'area_small' } : { kind: k, add: 3 }; }
  if (/^Triangle: base \d+, height \d+\. Area\?$/.test(s)) return { kind: 'tri_area' };
  if ((m = /^What is (\d+)% of (\d+)\?$/.exec(s))) { const p = N(m[1]); return { kind: p > 100 ? 'pct_over100' : [10, 50, 100].includes(p) ? 'pct_easy' : 'pct_of' }; }
  if (/^\d+ is what percent of \d+\?$/.test(s)) return { kind: 'what_pct' };
  if ((m = /^(\d+)% of \? = \d+$/.exec(s))) return { kind: [10, 50, 100].includes(N(m[1])) ? 'pct_whole_easy' : 'pct_whole' };
  if (/^(Increase|Decrease) \d+ by \d+%\.$/.test(s)) return { kind: 'pct_updown' };
  if ((m = /^What is (\d+)\/(\d+) of (\d+)\?$/.exec(s))) return { kind: N(m[1]) === 1 ? 'unit_frac_of' : 'frac_x_whole' };
  if (/^\d+\/\d+ hour = \? minutes$/.test(s)) return { kind: 'frac_hour' };
  if ((m = /^Average of ([\d, ]+) and (\d+)\?$/.exec(s))) { const sum = m[1].split(',').map(x => N(x.trim())).concat(N(m[2])).reduce((a, b) => a + b, 0); return { kind: sum >= 100 ? 'avg3_big' : 'avg3' }; }
  if ((m = /^(\d+) (?:km\/h|m\/min) for (\d+) (?:hours|min) = \? (?:km|m)$/.exec(s)) || (m = /^(\d+) (?:km|m) in (\d+) (?:hours|min) = \? (?:km\/h|m\/min)$/.exec(s)) || (m = /^(\d+) km at (\d+) km\/h = \? hours$/.exec(s))) {
    const sig = v => N(String(v).replace(/0+$/, '')); return { kind: sig(m[1]) >= 10 && sig(m[2]) >= 10 ? 'speed_d2' : 'speed_simple' }; }   // 350 km at 70 km/h is 35 / 7: simple
  if (/^\d+ (km\/h|m\/min) = \? (km\/min|m\/min|km\/h)$/.test(s)) return { kind: 'speed_units' };
  if (/^Least common multiple/.test(s)) return { kind: 'lcm' };
  if (/^Greatest common factor/.test(s)) return { kind: 'gcf' };
  if (/^y = \d+ × x\. If x = \d+, y = \?$/.test(s) || /^x × y = \d+\. If x = \d+, y = \?$/.test(s)) return { kind: 'prop' };
  if (/^Share \d+ in ratio/.test(s)) return { kind: 'share_ratio' };
  if ((m = /^(.*)\. What is x\?$/.exec(s))) { const e = m[1], ops = (e.match(/[+\-×÷]/g) || []).length; return { kind: ops >= 2 ? 'x_two_step' : /[×÷]/.test(e) ? 'x_fact' : 'x_pm' }; }
  if (/^[\d?]+ : [\d?]+ = [\d?]+ : [\d?]+$/.test(s)) return { kind: 'ratio_fill' };
  if (/\(-\d+\)|^-\d/.test(s)) return { kind: 'negatives' };
  // fractions written n/d
  if (/\d\/[\d?]|\?\/\d/.test(s)) {
    if ((m = /^(\d+) (\d+)\/(\d+) = \?\/\d+$/.exec(s))) return { kind: 'frac_mixed' };
    if (/^\d+\/\d+ = \d+\/\?$|^\d+\/\d+ = \?\/\d+$/.test(s)) return { kind: 'eq_frac' };
    if ((m = /^(\d+)\/(\d+) ([+\-]) (\d+)\/(\d+) = (\?(?:\/\d+)?)$/.exec(s))) return { kind: m[2] === m[5] ? 'frac_same' : 'frac_unlike' };
    if (/^\d+\/\d+ × \d+\/\d+ = \?$/.test(s)) return { kind: 'frac_x_frac' };
    if (/^\d+\/\d+ ÷ \d+\/\d+ = \?$/.test(s)) return { kind: 'frac_div_frac' };
    if (/^\d+ ÷ \d+\/\d+ = \?$/.test(s)) return { kind: 'whole_div_frac' };
    if (/^\d+\/\d+ × \d+ = \?$|^\d+ × \d+\/\d+ = \?$/.test(s)) return { kind: 'frac_x_whole' };
    return { kind: 'unknown' };
  }
  // decimals
  if (/\d\.\d/.test(s)) {
    if ((m = /^([\d.]+) ([+\-×÷]) ([\d.]+) = \?$/.exec(s))) { const a = m[1], b = m[3], op = m[2];
      if (op === '+' || op === '-') return { kind: 'dec_pm' };
      if (op === '×') return { kind: /^10+$/.test(a) || /^10+$/.test(b) ? 'dec_x_pow10' : a.includes('.') && b.includes('.') ? 'dec_x_dec' : 'dec_x_whole' };
      return { kind: 'dec_div_dec' }; }
    return { kind: 'unknown' };
  }
  // whole numbers and signs
  if ((m = /^(\d+) ([+\-×÷]) (\d+) = \?$/.exec(s))) { const a = N(m[1]), b = N(m[3]); if (m[2] === '-' && a < b) return { kind: 'negatives' }; return { kind: m[2] === '+' ? addKind(a, b) : m[2] === '-' ? subKind(a, b) : m[2] === '×' ? mulKind(a, b) : divKind(a, b) }; }
  if ((m = /^(\?|\d+) ([+\-×÷]) (\?|\d+) = (\d+)$/.exec(s))) { const op = m[2], r = N(m[4]), known = N(m[1] === '?' ? m[3] : m[1]);
    if (op === '×' || op === '÷') return { kind: 'miss_muldiv' };
    const hole = op === '+' ? r - known : m[1] === '?' ? r + known : known - r, big = Math.max(r, known, hole); return { kind: big <= 10 ? 'miss10' : big < 20 ? 'miss_carry' : 'miss_d2' }; }
  if ((m = /^(\d+) ([+\-]) (\d+) ([+\-]) (\d+) = \?$/.exec(s))) { const a = N(m[1]), b = N(m[3]), c = N(m[5]), ab = m[2] === '+' ? a + b : a - b, r = m[4] === '+' ? ab + c : ab - c;
    return { kind: Math.max(a, b, c, ab, r) <= 10 ? (ab === 10 && m[2] === '+' ? 'three_make10' : 'three10') : (ab === 10 && m[2] === '+' ? 'three_make10' : 'three_cross') }; }
  if ((m = /^(\d+) × (\d+) × (\d+) = \?$/.exec(s))) return { kind: 'mul3_easy' };
  if (/^[\d ()+\-×÷]+ = \?$/.test(s)) { const ops = (s.match(/[+\-×÷]/g) || []).length; return { kind: ops >= 3 ? 'ooo_long' : 'ooo_2' }; }
  return { kind: 'unknown' };
}
function secOf(kind, grade) {
  const K = KINDS[kind] || KINDS.unknown, gi = ORDER.indexOf(String(grade)), have = ORDER.filter(g => K.sec[g] != null);
  if (K.sec[grade] != null) return K.sec[grade];
  const below = have.filter(g => ORDER.indexOf(g) < gi), last = below[below.length - 1];
  if (last != null) return K.sec[last] * Math.max(0.6, Math.pow(0.88, gi - ORDER.indexOf(last)));
  return K.sec[have[0]] * Math.pow(1.3, ORDER.indexOf(have[0]) - gi);
}
// the model's answer for one question: { kind, cls, median (her median thinking seconds), sd, acc (multiplier on her right-answer share) }
function rate(text, grade, child) {
  const C = CHILDREN[child || 'median']; if (!C) throw new Error('child ' + child);
  const k = kindOf(text), K = KINDS[k.kind] || KINDS.unknown;
  return { kind: k.kind, cls: K.cls, median: (secOf(k.kind, grade) + (k.add || 0)) * C.timeMul[K.cls], sd: SD[K.cls], accMul: ACC_MUL[K.cls], accAdd: C.acc, typeMul: C.typeMul };
}
const pRight = (p, r) => Math.max(0.05, Math.min(0.98, (p + r.accAdd) * r.accMul));
module.exports = { KINDS, CHILDREN, ACC_MUL, SD, kindOf, secOf, rate, pRight };
