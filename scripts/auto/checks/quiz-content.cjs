'use strict';
// Quiz content check (day 4 track Q, 2026-11-27). The owner's table: autoloop/day4/quiz/CURRICULUM.md.
//
// For every grade (K, 1-6) and every act (1-5) it draws at least 2,000 questions through the RUNNING
// game's real quizManager.getQuestion(zone, isBoss) -- kana and kanji mode each -- then works every
// question out again from its own text (English and Japanese separately; the solver below knows
// nothing about the generator) and fails on:
//   key      a wrong, duplicate or missing key: not exactly four different choices with one right, or
//            the right one is not what the text works out to, or English and Japanese disagree
//   type     an answer that cannot be typed on the keypad (not a whole number, over four digits)
//   neg      a negative number outside its place (grade 6, Act 5, at most NEG_MAX of the questions)
//   kana     kanji in kana mode
//   kanji    kanji above the grade in kanji mode (Course of Study table in force since April 2020)
//   fit      a question that does not fit the battle box: more than FIT.lines lines, or a word wider
//            than the box (text measured in the page with the quiz font; box width measured in a
//            real battle at 390 px: autoloop/day4/quiz/evidence/fit_*.json)
//   pool     fewer different questions than MIN_POOL[grade] in the 2,000
//   ramp     an act whose estimated solving time is not higher than the act before (effort model
//            below: a judgement table, stated as such in CURRICULUM.md)
//   repeat   the same question coming back within REPEAT_GAP[grade] questions
//
//   NODE_PATH=/opt/node-tools/node_modules PROBE_URL=http://127.0.0.1:5563/ node scripts/auto/checks/quiz-content.cjs
//   QUIZ_JSON=<file>   also write the per-grade, per-act numbers (pool, repeats, time classes, samples)
//   QUIZ_DRAWS=<n>     draws per grade, act and mode (default 2000; the task's floor)
//   QUIZ_CONTENT_LIB=1 require() it for solve()/effort() without starting a browser
//
// It must FAIL on the bank in the bundle (build 99 and before) and PASS on quiz bank v2.

// Kyoiku kanji by grade, 1,026 characters: the 1,006-character table (fetched 2026-11-27) with the 2017 Course of
// Study moves applied (20 prefecture kanji into grade 4 and the regrading around them); the counts come out at the
// official 80/160/200/202/193/191.
const KANJI = {
  1: '一右雨円王音下火花貝学気九休玉金空月犬見五口校左三山子四糸字耳七車手十出女小上森人水正生青夕石赤千川先早草足村大男竹中虫町天田土二日入年白八百文木本名目立力林六',
  2: '引羽雲園遠何科夏家歌画回会海絵外角楽活間丸岩顔汽記帰弓牛魚京強教近兄形計元言原戸古午後語工公広交光考行高黄合谷国黒今才細作算止市矢姉思紙寺自時室社弱首秋週春書少場色食心新親図数西声星晴切雪船線前組走多太体台地池知茶昼長鳥朝直通弟店点電刀冬当東答頭同道読内南肉馬売買麦半番父風分聞米歩母方北毎妹万明鳴毛門夜野友用曜来里理話',
  3: '悪安暗医委意育員院飲運泳駅央横屋温化荷界開階寒感漢館岸起期客究急級宮球去橋業曲局銀区苦具君係軽血決研県庫湖向幸港号根祭皿仕死使始指歯詩次事持式実写者主守取酒受州拾終習集住重宿所暑助昭消商章勝乗植申身神真深進世整昔全相送想息速族他打対待代第題炭短談着注柱丁帳調追定庭笛鉄転都度投豆島湯登等動童農波配倍箱畑発反坂板皮悲美鼻筆氷表秒病品負部服福物平返勉放味命面問役薬由油有遊予羊洋葉陽様落流旅両緑礼列練路和',
  4: '愛案以衣位印英栄塩億加果貨課芽改械害街各覚完官管関観願希季旗器機議求泣給挙漁共協鏡競極訓軍郡径景芸欠結建健験固功好候康差菜最材昨札刷察参産散残氏司試児治辞失借種周祝順初松笑唱焼照臣信成省清静席積折節説浅戦選然争倉巣束側続卒孫帯隊達単置仲兆低底的典伝徒努灯働特熱念敗梅博飯飛必票標不夫付府副兵別辺変便包法望牧末満未民無約勇要養浴利陸良料量輪類令冷例連老労録茨媛岡潟岐熊香佐埼崎滋鹿縄井沖栃奈梨阪阜賀群徳富城',
  5: '圧移因永営衛易益液演応往桜可仮価河過快解格確額刊幹慣眼基寄規技義逆久旧居許境均禁句経潔件険検限現減故個護効厚耕鉱構興講混査再災妻採際在財罪雑酸賛支志枝師資飼示似識質舎謝授修述術準序招証条状常情織職制性政勢精製税責績接設絶祖素総造像増則測属率損貸態団断築張提程適統銅導独任燃能破犯判版比肥非備評貧布婦武復複仏編弁保墓報豊防貿暴務夢迷綿輸余容略留領囲紀喜救型航告殺士史象賞貯停堂得毒費粉脈歴',
  6: '異遺域宇映延沿我灰拡革閣割株干巻看簡危机揮貴疑吸供胸郷勤筋系敬警劇激穴絹権憲源厳己呼誤后孝皇紅降鋼刻穀骨困砂座済裁策冊蚕至私姿視詞誌磁射捨尺若樹収宗就衆従縦縮熟純処署諸除将傷障蒸針仁垂推寸盛聖誠宣専泉洗染善奏窓創装層操蔵臓存尊宅担探誕段暖値宙忠著庁頂潮賃痛展討党糖届難乳認納脳派拝背肺俳班晩否批秘腹奮並陛閉片補暮宝訪亡忘棒枚幕密盟模訳郵優幼欲翌乱卵覧裏律臨朗論胃腸恩券承舌銭退敵俵預',
};
const KANJI_GRADE = {}; for (const g of [1, 2, 3, 4, 5, 6]) for (const c of KANJI[g]) KANJI_GRADE[c] = g;
const GRADES = ['k', '1', '2', '3', '4', '5', '6'];
const GNUM = { k: 0, 1: 1, 2: 2, 3: 3, 4: 4, 5: 5, 6: 6 };
// zone -> act, as the bundle maps them (autoloop/day4/quiz/evidence/zone_table.json)
const ZONES = {
  1: ['greenhollow-plains', 'whispering-woods', 'crystal-coast', 'misty-grotto', 'sunken-cellar', 'crystal-cave', 'whispering-woods-cave', 'coastal-reef'],
  2: ['coral-tunnels', 'iron-mountains', 'shadow-cave', 'storm-nest', 'frozen-lake', 'frostpeak-cavern', 'iron-mine', 'haunted-forest'],
  3: ['scorched-wastes', 'desert-tomb', 'bandit-hideout', 'oasis-depths', 'scorched-ruins'],
  4: ['magma-tunnels', 'sunken-ruins', 'volcanic-forge', 'ember-mines', 'obsidian-cavern'],
  5: ['demons-threshold', 'demon-castle', 'demon-barracks', 'void-rift', 'stormreach-isles', 'frostfall-peaks', 'sunken-temple', 'twilight-realm'],
};
// ---- stated limits ----
const MIN_POOL = { k: 60, 1: 120, 2: 250, 3: 250, 4: 250, 5: 250, 6: 250 };   // different questions seen in 2,000 draws
const REPEAT_GAP = { k: 40, 1: 60, 2: 100, 3: 100, 4: 100, 5: 100, 6: 100 }; // the same question never within this many
const NEG_MAX = 0.15;          // grade 6 Act 5: at most this share may carry a negative number
const RAMP_STEP = 0.1;         // each act at least this many seconds above the one before
const FIT = { width: 336, lines: 2, font: '800 24px' };   // .qcard.kp .qq at a 390 px viewport

// ---------------------------------------------------------------------------------------------
// exact fractions
const gcd = (a, b) => { a = Math.abs(a); b = Math.abs(b); while (b) { const t = a % b; a = b; b = t; } return a || 1; };
const F = (n, d = 1) => { if (!d) return null; if (d < 0) { n = -n; d = -d; } const g = gcd(n, d); return { n: n / g, d: d / g }; };
const fadd = (a, b) => F(a.n * b.d + b.n * a.d, a.d * b.d), fsub = (a, b) => F(a.n * b.d - b.n * a.d, a.d * b.d);
const fmul = (a, b) => F(a.n * b.n, a.d * b.d), fdiv = (a, b) => (b.n ? F(a.n * b.d, a.d * b.n) : null);
const isInt = v => v && v.d === 1;

// ---- effort model: "steps" of work in a question, turned into seconds for a child of the grade ----
// A judgement table (see CURRICULUM.md); it only has to order questions sensibly.
const dg = n => String(Math.abs(Math.trunc(n))).length;
function carries(a, b) { let c = 0, k = 0; while (a > 0 || b > 0) { k = (a % 10 + b % 10 + k) > 9 ? 1 : 0; c += k; a = Math.floor(a / 10); b = Math.floor(b / 10); } return c; }
function borrows(a, b) { let c = 0, k = 0; while (a > 0 || b > 0) { k = (a % 10 - k - b % 10) < 0 ? 1 : 0; c += k; a = Math.floor(a / 10); b = Math.floor(b / 10); } return c; }
function cAdd(a, b) {
  a = Math.abs(a); b = Math.abs(b); let z = 0;
  while (a && b && a % 10 === 0 && b % 10 === 0) { a /= 10; b /= 10; z = 0.3; }
  if (a < 10 && b < 10) { const s = a + b; return z + (s <= 5 ? 0.8 : s <= 10 ? 1.3 : 2.0); }
  const cols = dg(Math.min(a, b));
  return z + 0.8 * cols + 1.0 * carries(a, b) + 0.4 * (dg(Math.max(a, b)) - cols) + (cols >= 2 ? 0.5 : 0);
}
function cSub(a, b) {
  a = Math.abs(a); b = Math.abs(b); if (a < b) { const t = a; a = b; b = t; } let z = 0;
  while (a && b && a % 10 === 0 && b % 10 === 0) { a /= 10; b /= 10; z = 0.3; }
  if (a <= 10 && b <= 10) return z + (a <= 5 ? 0.9 : 1.4);
  if (a < 20 && b < 10) return z + (a % 10 < b ? 2.2 : 1.4);
  const cols = dg(b);
  return z + 0.9 * cols + 1.2 * borrows(a, b) + 0.4 * (dg(a) - cols) + (cols >= 2 ? 0.5 : 0);
}
function cFact(a, b) { const lo = Math.min(a, b), hi = Math.max(a, b); if (lo <= 1) return 0.6; if (lo === 2 || lo === 5 || hi === 5) return 1.2; if (lo <= 4) return 1.7; return 2.4; }
function cMul(a, b) {
  a = Math.abs(a); b = Math.abs(b); if (!a || !b) return 0.6; let z = 0;
  while (a % 10 === 0) { a /= 10; z = 0.3; } while (b % 10 === 0) { b /= 10; z = 0.3; }
  const lo = Math.min(a, b), hi = Math.max(a, b);
  if (hi < 10) return z + cFact(a, b);
  if (lo < 10) { if (lo === 1) return z + 0.6; let c = 0, n = dg(hi), h = hi; while (h >= 10) { if ((h % 10) * lo >= 10) c++; h = Math.floor(h / 10); } return z + 1.2 * n + 0.8 * (n - 1) + 0.5 * c; }
  if (lo === 11) return z + 4.0;
  return z + 7.0 + (dg(hi) > 2 ? 2 : 0);
}
function cDiv(n, d) {
  n = Math.abs(n); d = Math.abs(d); if (!d) return 9; let z = 0;
  while (n && n % 10 === 0 && d % 10 === 0) { n /= 10; d /= 10; z = 0.3; }
  let q = Math.floor(n / d);
  while (q && q % 10 === 0 && q >= 10) { q /= 10; z = 0.3; }
  if (d < 10 && q < 10) return z + (d === 1 || q <= 1 ? 0.7 : (d === 2 || d === 5 || q === 2 || q === 5) ? 1.4 : (d >= 6 && q >= 6) ? 2.5 : 1.9);
  if (d < 10) { let easy = true; for (const c of String(n)) if (Number(c) % d) easy = false; const k = dg(q); return z + (easy ? 1.2 * k : 1.8 * k + 0.6); }
  return z + 4.0 + (q >= 10 ? 1.2 : 0);
}
const SEC_PER_STEP = { k: 4.0, 1: 1.9, 2: 1.6, 3: 1.4, 4: 1.25, 5: 1.15, 6: 1.1 };
const READ_WORDS = { k: 2.5, 1: 2.2, 2: 2.0, 3: 1.8, 4: 1.6, 5: 1.5, 6: 1.5 };
// seconds for a child of `grade` to read and solve (typing is not in it)
function effort(grade, p) { return (p.words ? READ_WORDS[grade] * (p.read || 1) : 0.8) + p.steps * SEC_PER_STEP[grade]; }
const timeClass = s => (s < 3 ? 'fast' : s <= 6 ? 'medium' : 'slow');

// ---- the expression solver: one unknown (?, the box, or x), + - x / and :, brackets, decimals,
//      fractions written n/d or d-bun-no-n, mixed numbers ----
function tokens(s) {
  const out = []; let i = 0;
  while (i < s.length) {
    const c = s[i];
    if (c === ' ') { i++; continue; }
    if (c === '⟦') { const j = s.indexOf('⟧', i), body = s.slice(i + 1, j), m = /^(?:(\d+);)?(\d+|X)\|(\d+|X)$/.exec(body); if (!m) return null; out.push({ t: 'frac', w: m[1] ? Number(m[1]) : null, n: m[2], d: m[3] }); i = j + 1; continue; }
    const m = /^\d+(\.\d+)?/.exec(s.slice(i));
    if (m) { const dec = m[1] ? m[1].length - 1 : 0; out.push({ t: 'num', v: F(Number(m[0].replace('.', '')), Math.pow(10, dec)), dec: !!dec }); i += m[0].length; continue; }
    if ('+-×÷:()=X'.includes(c)) { out.push({ t: c }); i++; continue; }
    return null;
  }
  return out;
}
function parse(tk) {
  let i = 0;
  const peek = () => tk[i] && tk[i].t;
  function atom() {
    const k = tk[i]; if (!k) throw new Error('end');
    if (k.t === 'num') { i++; return { k: 'num', v: k.v, dec: k.dec }; }
    if (k.t === 'X') { i++; return { k: 'X' }; }
    if (k.t === 'frac') { i++; return { k: 'frac', w: k.w, n: k.n, d: k.d }; }
    if (k.t === '(') { i++; const e = expr(); if (peek() !== ')') throw new Error(')'); i++; return { k: 'par', e }; }
    if (k.t === '-') { i++; return { k: 'neg', e: atom() }; }
    throw new Error('atom ' + k.t);
  }
  function term() { let l = atom(); while (peek() === '×' || peek() === '÷' || peek() === ':') { const op = tk[i++].t; l = { k: 'bin', op, l, r: atom() }; } return l; }
  function expr() { let l = term(); while (peek() === '+' || peek() === '-') { const op = tk[i++].t; l = { k: 'bin', op, l, r: term() }; } return l; }
  const e = expr(); if (i !== tk.length) throw new Error('trailing'); return e;
}
function ev(n, x) {
  switch (n.k) {
    case 'num': return n.v;
    case 'X': return x;
    case 'par': return ev(n.e, x);
    case 'neg': { const v = ev(n.e, x); return v && F(-v.n, v.d); }
    case 'frac': { const a = n.n === 'X' ? x : F(Number(n.n)), b = n.d === 'X' ? x : F(Number(n.d)); if (!a || !b) return null; const v = fdiv(a, b); return v && n.w !== null ? fadd(F(n.w), v) : v; }
    default: { const a = ev(n.l, x), b = ev(n.r, x); if (!a || !b) return null; return n.op === '+' ? fadd(a, b) : n.op === '-' ? fsub(a, b) : n.op === '×' ? fmul(a, b) : fdiv(a, b); }
  }
}
const has = (n, pred) => pred(n) || (n.k === 'bin' ? has(n.l, pred) || has(n.r, pred) : (n.k === 'par' || n.k === 'neg') ? has(n.e, pred) : false);
// steps of work in a solved expression
function exprSteps(L, Rr, x) {
  let ops = 0, steps = 0, par = false, negs = false, ratio = false;
  const bare = n => (n.k === 'par' ? bare(n.e) : n);
  const isFr = n => bare(n).k === 'frac', den = n => { const b = bare(n); return b.d === 'X' ? x.n : Number(b.d); };
  const walk = n => {
    if (n.k === 'par') { par = true; walk(n.e); return; }
    if (n.k === 'neg') { negs = true; walk(n.e); return; }
    if (n.k !== 'bin') return;
    walk(n.l); walk(n.r); ops++;
    if (n.op === ':') { ratio = true; return; }
    const a = ev(n.l, x), b = ev(n.r, x);
    if (has(n.l, m => m.k === 'frac') || has(n.r, m => m.k === 'frac')) {
      if (n.op === '+' || n.op === '-') steps += (isFr(n.l) && isFr(n.r)) ? (den(n.l) === den(n.r) ? 1.5 : 4.2) : 2.5;
      else if (n.op === '×') steps += (isFr(n.l) && isFr(n.r)) ? 4.5 : 2.5;
      else steps += 5.0;
      return;
    }
    let extra = 0, k = 1;
    if (!isInt(a) || !isInt(b) || has(n, m => m.k === 'num' && m.dec)) { extra = 0.8; while (k < 1000 && ((a.n * k) % a.d || (b.n * k) % b.d)) k *= 10; }
    const ai = Math.round(a.n * k / a.d), bi = Math.round(b.n * k / b.d);
    if (ai < 0 || bi < 0 || (n.op === '-' && ai < bi)) negs = true;
    steps += extra + (n.op === '+' ? cAdd(ai, bi) : n.op === '-' ? cSub(ai, bi) : n.op === '×' ? cMul(ai, bi) : cDiv(ai, bi));
  };
  walk(L); walk(Rr);
  return { ops, steps, par, negs, ratio };
}
function solveExpr(text) {
  let s = text.replace(/−/g, '-'), xeq = false, m;
  if ((m = /^(.*)\. What is x\?$/.exec(s)) || (m = /^(.*)。xは？$/.exec(s))) { s = m[1]; xeq = true; }
  s = s.replace(/(\d+|□)(?:ぶんの|分の)(\d+|□)/g, '⟦$2|$1⟧').replace(/(\d+)と ⟦/g, '⟦$1;');
  s = s.replace(/(\d+) (\d+|\?)\/(\d+|\?)/g, '⟦$1;$2|$3⟧').replace(/(\d+|\?)\/(\d+|\?)/g, '⟦$1|$2⟧');
  s = s.replace(xeq ? /[?□x]/g : /[?□]/g, 'X');
  const tk = tokens(s); if (!tk) return { ok: false, why: 'cannot read' };
  if (tk.filter(t => t.t === 'X' || (t.t === 'frac' && (t.n === 'X' || t.d === 'X'))).length !== 1) return { ok: false, why: 'not one unknown' };
  const eq = tk.findIndex(t => t.t === '='); if (eq < 0 || tk.filter(t => t.t === '=').length !== 1) return { ok: false, why: 'no single =' };
  let L, Rr; try { L = parse(tk.slice(0, eq)); Rr = parse(tk.slice(eq + 1)); } catch (e) { return { ok: false, why: 'syntax ' + e.message }; }
  let f = x => { const a = ev(L, x), b = ev(Rr, x); return a && b ? fsub(a, b) : null; };
  if (L.k === 'bin' && L.op === ':' && Rr.k === 'bin' && Rr.op === ':') f = x => { const a = ev(L.l, x), b = ev(L.r, x), c = ev(Rr.l, x), d = ev(Rr.r, x); return a && b && c && d ? fsub(fmul(a, d), fmul(b, c)) : null; };
  let x = null; const f0 = f(F(0)), f1 = f(F(1)), f2 = f(F(2));
  if (f0 && f1 && f2) { const d1 = fsub(f1, f0), d2 = fsub(f2, f1); if (d1.n !== 0 && d1.n === d2.n && d1.d === d2.d) x = fdiv(F(-f0.n, f0.d), d1); }
  if (!x) { const sols = []; for (let v = -200; v <= 12000 && sols.length < 2; v++) { const r = f(F(v)); if (r && r.n === 0) sols.push(v); } if (sols.length !== 1) return { ok: false, why: sols.length ? 'more than one answer' : 'no answer' }; x = F(sols[0]); }
  const chk = f(x); if (!chk || chk.n !== 0) return { ok: false, why: 'does not hold' };
  if (!isInt(x)) return { ok: true, a: x.n / x.d, whole: false, steps: 9, kind: 'expr' };
  const c = exprSteps(L, Rr, x);
  const hole = !(Rr.k === 'X' || (Rr.k === 'frac' && (Rr.n === 'X' || Rr.d === 'X')));
  const fracs = has(L, n => n.k === 'frac') || has(Rr, n => n.k === 'frac'), dec = has(L, n => n.k === 'num' && n.dec) || has(Rr, n => n.k === 'num' && n.dec);
  let steps = c.steps, kind;
  if (c.ratio) { steps = 3.0; kind = 'ratio'; }
  else if (fracs && c.ops === 0) { const mixed = has(L, n => n.k === 'frac' && n.w !== null); steps = mixed ? 2.2 : 2.0; kind = mixed ? 'mixed number' : 'equal fractions'; }
  else {
    steps += 0.5 * Math.max(0, c.ops - 1) + (c.par ? 0.3 : 0) + (c.negs ? 3.5 : 0);
    if (fracs && !hole && has(L, n => n.k === 'bin' && (n.op === '+' || n.op === '-'))) steps += 0.5;
    if (xeq) steps += 0.8; else if (hole && !fracs) steps += 0.6;
    const o = new Set(); (function w(n) { if (n.k === 'bin') { o.add(n.op); w(n.l); w(n.r); } else if (n.k === 'par' || n.k === 'neg') w(n.e); })(L); (function w(n) { if (n.k === 'bin') { o.add(n.op); w(n.l); w(n.r); } else if (n.k === 'par' || n.k === 'neg') w(n.e); })(Rr);
    const name = { '+': 'add', '-': 'subtract', '×': 'multiply', '÷': 'divide' };
    kind = xeq ? (c.ops > 1 ? 'x equation, two steps' : 'x equation') : c.negs ? 'negative numbers' : fracs ? 'fractions ' + [...o].map(k => name[k]).join('/') : dec ? 'decimals ' + [...o].map(k => name[k]).join('/')
      : hole ? 'missing number ' + [...o].map(k => name[k]).join('/') : c.ops > 1 ? ((o.has('×') || o.has('÷')) ? 'order of operations' : 'three numbers') : [...o].map(k => name[k]).join('/');
  }
  return { ok: true, a: x.n, whole: true, steps, kind, negInText: c.negs };
}

// ---- sentences: [language, pattern, solver] ----
const N = Number, lcm = (a, b) => a * b / gcd(a, b);
const KJ = { じゅう: 10, 十: 10, ひゃく: 100, 百: 100, せん: 1000, 千: 1000 };
const rnd = (n, p) => Math.round(n / p) * p;
const W = (a, steps, kind) => ({ ok: true, a, whole: Number.isInteger(a), steps, kind, words: true });
const cPct = p => (p === 10 || p === 50 || p === 100 ? 1.8 : [20, 25, 5, 75].includes(p) ? 2.6 : 4.4);
const RULES = [
  ['en', /^How many \w+\? ([●★♥■▲ ]+)$/, m => { const n = m[1].replace(/ /g, '').length; return { ...W(n, n <= 3 ? 0.3 : 0.15 * n, 'count'), read: 0.4 }; }],
  ['ja', /^(?:\S+は )?いくつ？ ([●★♥■▲ ]+)$/, m => { const n = m[1].replace(/ /g, '').length; return { ...W(n, n <= 3 ? 0.3 : 0.15 * n, 'count'), read: 0.4 }; }],
  ['en', /^What comes after (\d+)\?$/, m => W(N(m[1]) + 1, 0.4, 'next number')],
  ['en', /^What comes before (\d+)\?$/, m => W(N(m[1]) - 1, 0.6, 'next number')],
  ['ja', /^(\d+)の つぎの かずは？$/, m => W(N(m[1]) + 1, 0.4, 'next number')],
  ['ja', /^(\d+)の 1つ まえの かずは？$/, m => W(N(m[1]) - 1, 0.6, 'next number')],
  ['en', /^Which is (bigger|smaller): (\d+) or (\d+)\?$/, m => W(m[1] === 'bigger' ? Math.max(N(m[2]), N(m[3])) : Math.min(N(m[2]), N(m[3])), N(m[2]) === N(m[3]) ? 99 : 0.4 + (Math.max(N(m[2]), N(m[3])) > 10 ? 0.3 : 0), 'compare')],
  ['ja', /^(\d+)と (\d+)、(おおきい|ちいさい)のは？$/, m => W(m[3] === 'おおきい' ? Math.max(N(m[1]), N(m[2])) : Math.min(N(m[1]), N(m[2])), N(m[1]) === N(m[2]) ? 99 : 0.4 + (Math.max(N(m[1]), N(m[2])) > 10 ? 0.3 : 0), 'compare')],
  ['en', /^(\d+) (tens|hundreds) = \?$/, m => W(N(m[1]) * (m[2] === 'tens' ? 10 : 100), N(m[1]) > 10 ? 1.3 : 0.9, 'tens and hundreds')],
  ['ja', /^(10|100)が (\d+)こで いくつ？$/, m => W(N(m[1]) * N(m[2]), N(m[2]) > 10 ? 1.3 : 0.9, 'tens and hundreds')],
  ['en', /^(\d+) is how many times (\d+)\?$/, m => W(N(m[1]) / N(m[2]), cDiv(N(m[1]), N(m[2])) + 0.5, 'how many times')],
  ['ja', /^(\d+)は (\d+)の (?:なんばい|何倍)？$/, m => W(N(m[1]) / N(m[2]), cDiv(N(m[1]), N(m[2])) + 0.5, 'how many times')],
  ['en', /^(\d+) ÷ (\d+) = (\d+|\?) remainder (\d+|\?)$/, m => remainder(m)],
  ['ja', /^(\d+) ÷ (\d+) = (\d+|□) あまり (\d+|□)$/, m => remainder(m)],
  ['en', /^(\d+) hours? (\d+) min = \? min$/, m => W(N(m[1]) * 60 + N(m[2]), 2.0, 'units')],
  ['ja', /^(\d+)(?:じかん|時間) (\d+)(?:ふん|ぷん|分)は (?:なんぷん|何分)？$/, m => W(N(m[1]) * 60 + N(m[2]), 2.0, 'units')],
  ['en', /^(\d+) min (\d+) s = \? s$/, m => W(N(m[1]) * 60 + N(m[2]), 2.0, 'units')],
  ['ja', /^(\d+)(?:ふん|ぷん|分) (\d+)(?:びょう|秒)は (?:なんびょう|何秒)？$/, m => W(N(m[1]) * 60 + N(m[2]), 2.0, 'units')],
  ['en', /^(\d+) (m|cm|km|kg) (\d+) (cm|mm|m|g) = \? (cm|mm|m|g)$/, m => unit(m)],
  ['ja', /^(\d+) (m|cm|km|kg) (\d+) (cm|mm|m|g)は (?:なん|何)(cm|mm|m|g)？$/, m => unit(m)],
  ['en', /^Round (\d+) to the nearest (10|100|1000)\.$/, m => W(rnd(N(m[1]), N(m[2])), 1.8 + 0.3 * Math.max(0, m[1].length - 3), 'rounding')],
  ['ja', /^(\d+)を (じゅう|ひゃく|せん|十|百|千)(?:の くらい|の位)までの (?:がいすう|がい数)に すると？$/, m => W(rnd(N(m[1]), KJ[m[2]]), 1.8 + 0.3 * Math.max(0, m[1].length - 3), 'rounding')],
  ['en', /^Area of a square with side (\d+)\?$/, m => W(N(m[1]) ** 2, cMul(N(m[1]), N(m[1])) + 0.8, 'area')],
  ['ja', /^1(?:ぺん|辺) (\d+) cmの (?:せいほうけい|正方形)の (?:めんせき|面積)は？$/, m => W(N(m[1]) ** 2, cMul(N(m[1]), N(m[1])) + 0.8, 'area')],
  ['en', /^Area of an? (\d+) by (\d+) rectangle\?$/, m => W(N(m[1]) * N(m[2]), cMul(N(m[1]), N(m[2])) + 0.8, 'area')],
  ['ja', /^たて (\d+) cm、よこ (\d+) cmの (?:めんせき|面積)は？$/, m => W(N(m[1]) * N(m[2]), cMul(N(m[1]), N(m[2])) + 0.8, 'area')],
  ['en', /^Triangle: base (\d+), height (\d+)\. Area\?$/, m => W(N(m[1]) * N(m[2]) / 2, cMul(N(m[1]), N(m[2])) + 1.6, 'area')],
  ['ja', /^(?:ていへん|底辺) (\d+)(?: cm)?、(?:たかさ|高さ) (\d+)(?: cm)?の (?:さんかくけい|三角形)の (?:めんせき|面積)は？$/, m => W(N(m[1]) * N(m[2]) / 2, cMul(N(m[1]), N(m[2])) + 1.6, 'area')],
  ['en', /^What is (\d+)% of (\d+)\?$/, m => W(N(m[1]) * N(m[2]) / 100, cPct(N(m[1])), 'percent of')],
  ['ja', /^(\d+)の ?(\d+)%は？$/, m => W(N(m[1]) * N(m[2]) / 100, cPct(N(m[2])), 'percent of')],
  ['en', /^(\d+) is what percent of (\d+)\?$/, m => W(N(m[1]) * 100 / N(m[2]), 4.0, 'what percent')],
  ['ja', /^(\d+)は (\d+)の (?:なん|何)%？$/, m => W(N(m[1]) * 100 / N(m[2]), 4.0, 'what percent')],
  ['en', /^(\d+)% of \? = (\d+)$/, m => W(N(m[2]) * 100 / N(m[1]), 4.2, 'percent, find the whole')],
  ['ja', /^□の (\d+)%は (\d+)$/, m => W(N(m[2]) * 100 / N(m[1]), 4.2, 'percent, find the whole')],
  ['en', /^(Increase|Decrease) (\d+) by (\d+)%\.$/, m => W(N(m[2]) * (100 + (m[1] === 'Increase' ? 1 : -1) * N(m[3])) / 100, cPct(N(m[3])) + 1.2, 'percent up or down')],
  ['ja', /^(\d+)を (\d+)% (ふやす|増やす|へらす|減らす)と？$/, m => W(N(m[1]) * (100 + (/ふ|増/.test(m[3]) ? 1 : -1) * N(m[2])) / 100, cPct(N(m[2])) + 1.2, 'percent up or down')],
  ['en', /^What is (\d+)\/(\d+) of (\d+)\?$/, m => W(N(m[3]) * N(m[1]) / N(m[2]), N(m[1]) === 1 ? cDiv(N(m[3]), N(m[2])) + 0.4 : 2.8, 'fraction of a number')],
  ['ja', /^(\d+)の ?(?:(\d+)(?:ぶんの|分の)(\d+)|(\d+)\/(\d+))は？$/, m => { const d = N(m[2] || m[5]), n = N(m[3] || m[4]); return W(N(m[1]) * n / d, n === 1 ? cDiv(N(m[1]), d) + 0.4 : 2.8, 'fraction of a number'); }],
  ['en', /^(\d+)\/(\d+) hour = \? minutes$/, m => W(60 * N(m[1]) / N(m[2]), 2.8, 'fraction of an hour')],
  ['ja', /^(\d+)(?:ぶんの|分の)(\d+)(?:じかん|時間)は (?:なんぷん|何分)？$/, m => W(60 * N(m[2]) / N(m[1]), 2.8, 'fraction of an hour')],
  ['en', /^Average of ([\d, ]+) and (\d+)\?$/, m => mean(m[1].split(',').map(s => N(s.trim())).concat(N(m[2])))],
  ['ja', /^([\d、]+)の (?:へいきん|平均)は？$/, m => mean(m[1].split('、').map(N))],
  ['en', /^(\d+) km\/h for (\d+) hours = \? km$/, m => W(N(m[1]) * N(m[2]), cMul(N(m[1]), N(m[2])) + 1.0, 'speed')],
  ['ja', /^(?:じそく|時速) (\d+) kmで (\d+)(?:じかん|時間) (?:すすむ|進む)と (?:なん|何)km？$/, m => W(N(m[1]) * N(m[2]), cMul(N(m[1]), N(m[2])) + 1.0, 'speed')],
  ['en', /^(\d+) km in (\d+) hours = \? km\/h$/, m => W(N(m[1]) / N(m[2]), cDiv(N(m[1]), N(m[2])) + 1.0, 'speed')],
  ['ja', /^(\d+)(?:じかん|時間)で (\d+) km (?:すすむ|進む)と (?:じそく|時速) (?:なん|何)km？$/, m => W(N(m[2]) / N(m[1]), cDiv(N(m[2]), N(m[1])) + 1.0, 'speed')],
  ['en', /^(\d+) km at (\d+) km\/h = \? hours$/, m => W(N(m[1]) / N(m[2]), cDiv(N(m[1]), N(m[2])) + 1.0, 'speed')],
  ['ja', /^(?:じそく|時速) (\d+) kmで (\d+) km (?:すすむ|進む)のに (?:なんじかん|何時間)？$/, m => W(N(m[2]) / N(m[1]), cDiv(N(m[2]), N(m[1])) + 1.0, 'speed')],
  ['en', /^(\d+) m\/min for (\d+) min = \? m$/, m => W(N(m[1]) * N(m[2]), cMul(N(m[1]), N(m[2])) + 1.0, 'speed')],
  ['ja', /^(?:ふんそく|分速) (\d+) mで (\d+)(?:ふん|ぷん|分) (?:すすむ|進む)と (?:なん|何)m？$/, m => W(N(m[1]) * N(m[2]), cMul(N(m[1]), N(m[2])) + 1.0, 'speed')],
  ['en', /^(\d+) m in (\d+) min = \? m\/min$/, m => W(N(m[1]) / N(m[2]), cDiv(N(m[1]), N(m[2])) + 1.0, 'speed')],
  ['ja', /^(\d+)(?:ふん|ぷん|分)で (\d+) m (?:すすむ|進む)と (?:ふんそく|分速) (?:なん|何)m？$/, m => W(N(m[2]) / N(m[1]), cDiv(N(m[2]), N(m[1])) + 1.0, 'speed')],
  ['en', /^(\d+) km\/h = \? km\/min$/, m => W(N(m[1]) / 60, 2.6, 'speed units')],
  ['en', /^(\d+) km\/h = \? m\/min$/, m => W(N(m[1]) * 1000 / 60, 4.0, 'speed units')],
  ['en', /^(\d+) m\/min = \? km\/h$/, m => W(N(m[1]) * 60 / 1000, 4.0, 'speed units')],
  ['ja', /^(?:じそく|時速) (\d+) kmは (?:ふんそく|分速) (?:なん|何)(km|m)？$/, m => (m[2] === 'km' ? W(N(m[1]) / 60, 2.6, 'speed units') : W(N(m[1]) * 1000 / 60, 4.0, 'speed units'))],
  ['ja', /^(?:ふんそく|分速) (\d+) mは (?:じそく|時速) (?:なん|何)km？$/, m => W(N(m[1]) * 60 / 1000, 4.0, 'speed units')],
  ['en', /^Least common multiple of (\d+) and (\d+)\?$/, m => W(lcm(N(m[1]), N(m[2])), 3.0, 'common multiple')],
  ['ja', /^(\d+)と (\d+)の (?:さいしょうこうばいすう|最小公倍数)は？$/, m => W(lcm(N(m[1]), N(m[2])), 3.0, 'common multiple')],
  ['en', /^Greatest common factor of (\d+) and (\d+)\?$/, m => W(gcd(N(m[1]), N(m[2])), 3.0, 'common factor')],
  ['ja', /^(\d+)と (\d+)の (?:さいだいこうやくすう|最大公約数)は？$/, m => W(gcd(N(m[1]), N(m[2])), 3.0, 'common factor')],
  ['en', /^y = (\d+) × x\. If x = (\d+), y = \?$/, m => W(N(m[1]) * N(m[2]), cMul(N(m[1]), N(m[2])) + 1.0, 'proportion')],
  ['ja', /^y = (\d+) × x で x = (\d+) のとき、yは？$/, m => W(N(m[1]) * N(m[2]), cMul(N(m[1]), N(m[2])) + 1.0, 'proportion')],
  ['en', /^x × y = (\d+)\. If x = (\d+), y = \?$/, m => W(N(m[1]) / N(m[2]), cDiv(N(m[1]), N(m[2])) + 1.2, 'proportion')],
  ['ja', /^x × y = (\d+) で x = (\d+) のとき、yは？$/, m => W(N(m[1]) / N(m[2]), cDiv(N(m[1]), N(m[2])) + 1.2, 'proportion')],
  ['en', /^Share (\d+) in ratio (\d+) : (\d+)\. (Larger|Smaller) share\?$/, m => share(N(m[1]), N(m[2]), N(m[3]), m[4] === 'Larger')],
  ['ja', /^(\d+)を (\d+) : (\d+)に (?:わける|分ける)と (おおきい|大きい|ちいさい|小さい) ほうは？$/, m => share(N(m[1]), N(m[2]), N(m[3]), /お|大/.test(m[4]))],
];
function remainder(m) {
  const n = N(m[1]), d = N(m[2]), q = Math.floor(n / d), r = n % d, askR = !/\d/.test(m[4]), askQ = !/\d/.test(m[3]);
  if (askR === askQ) return { ok: false, why: 'remainder form' };
  if (!askQ && N(m[3]) !== q) return { ok: false, why: 'quotient in the text is wrong' };
  if (!askR && N(m[4]) !== r) return { ok: false, why: 'remainder in the text is wrong' };
  if (r === 0) return { ok: false, why: 'no remainder' };
  return W(askR ? r : q, q >= 10 ? 4.2 : 2.6, 'division with remainder');
}
function unit(m) {
  const per = { 'm>cm': 100, 'cm>mm': 10, 'km>m': 1000, 'kg>g': 1000 }[m[2] + '>' + m[4]];
  if (!per || m[4] !== m[5]) return { ok: false, why: 'unit pair' };
  return W(N(m[1]) * per + N(m[3]), 1.5, 'units');
}
function mean(v) { const s = v.reduce((a, b) => a + b, 0); let c = 0, run = v[0]; for (let i = 1; i < v.length; i++) { c += cAdd(run, v[i]); run += v[i]; } return W(s / v.length, c * 0.7 + cDiv(s, v.length) * 0.6 + 0.5, 'average'); }
function share(n, a, b, big) { if (n % (a + b) || a === b) return { ok: false, why: 'ratio does not divide' }; return W(n / (a + b) * (big ? Math.max(a, b) : Math.min(a, b)), 4.2, 'sharing in a ratio'); }

// Work a question out from its text. lang: 'en' or 'ja'.
function solve(text, lang) {
  if (typeof text !== 'string' || !text) return { ok: false, why: 'no text' };
  text = text.replace(/\u00A0/g, ' ');   // a no-break space reads as a space
  for (const [l, re, fn] of RULES) { if (l !== lang) continue; const m = re.exec(text); if (m) return fn(m); }
  return solveExpr(text);
}
const HAS_KANJI = /[㐀-䶿一-鿿々]/;
const kanjiIn = s => [...s].filter(c => /[㐀-䶿一-鿿々]/.test(c));
// a minus sign right against a digit is a negative number (a take-away sign always has spaces)
const hasNegative = s => /[-−]\d/.test(s);

if (process.env.QUIZ_CONTENT_LIB) { module.exports = { solve, effort, timeClass, KANJI, KANJI_GRADE, kanjiIn, HAS_KANJI, hasNegative, ZONES, GRADES, GNUM, MIN_POOL, REPEAT_GAP, NEG_MAX, RAMP_STEP, FIT, judge }; }
else main();

// Judge the draws of one grade. cells[act] = { kana: rows, kanji: rows }, each row
// [en, ja, [four choice texts], index of the right one, category, gradeLevel, zone, boss].
// widths: text -> { lines, over } measured in the page (may be absent offline).
function judge(grade, cells, widths) {
  const res = { grade, fails: {}, acts: {} }, gn = GNUM[grade];
  const bad = (k, note) => { (res.fails[k] = res.fails[k] || []).push(note); };
  for (const act of [1, 2, 3, 4, 5]) {
    const A = res.acts[act] = { n: 0, pool: 0, minGap: Infinity, sec: 0, cls: { fast: 0, medium: 0, slow: 0 }, kinds: {}, cats: {}, neg: 0, maxAns: 0, samples: {}, longest: { en: '', kana: '', kanji: '' } };
    const distinct = new Set();
    for (const mode of ['kana', 'kanji']) {
      const rows = (cells[act] && cells[act][mode]) || [], last = new Map();
      rows.forEach((r, i) => {
        const [en, ja, ch, right, cat, gl] = r, where = `act ${act} ${mode} "${en}" / "${ja}"`;
        A.n++; distinct.add(en); A.cats[cat] = (A.cats[cat] || 0) + 1;
        if (last.has(en)) A.minGap = Math.min(A.minGap, i - last.get(en)); last.set(en, i);
        // key
        const okShape = Array.isArray(ch) && ch.length === 4 && new Set(ch).size === 4 && right >= 0 && right < 4;
        if (!okShape) { bad('key', where + ' choices ' + JSON.stringify(ch) + ' right ' + right); return; }
        const key = Number(ch[right]), pe = solve(en, 'en'), pj = solve(ja, 'ja');
        if (!pe.ok) bad('key', where + ' English not solvable: ' + pe.why);
        else if (pe.a !== key) bad('key', where + ' key ' + key + ' but the English works out to ' + pe.a);
        if (!pj.ok) bad('key', where + ' Japanese not solvable: ' + pj.why);
        else if (pj.a !== key) bad('key', where + ' key ' + key + ' but the Japanese works out to ' + pj.a);
        // typeable
        if (ch.some(c => !/^-?\d{1,4}$/.test(String(c))) || !Number.isInteger(key)) bad('type', where + ' choices ' + JSON.stringify(ch));
        // negatives
        const neg = ch.some(c => Number(c) < 0) || hasNegative(en) || hasNegative(ja) || (pe.ok && pe.negInText);
        if (neg) { A.neg++; if (!(gl === '6' && grade === '6' && act === 5)) bad('neg', where + ' choices ' + JSON.stringify(ch)); }
        // scripts
        if (mode === 'kana' && HAS_KANJI.test(ja)) bad('kana', where);
        if (mode === 'kanji') { const over = kanjiIn(ja).filter(c => !(KANJI_GRADE[c] <= GNUM[gl])); if (over.length) bad('kanji', where + ' above grade ' + gl + ': ' + over.join('')); }
        // fit
        for (const [t, lg] of [[en, 'en'], [ja, mode]]) {
          if (t.length > A.longest[lg].length) A.longest[lg] = t;
          const w = widths && widths[t]; if (w && (w.lines > FIT.lines || w.over)) bad('fit', `act ${act} ${lg} "${t}" ${w.lines} lines${w.over ? ', a word wider than the box' : ''}`);
        }
        if (pe.ok && pe.whole) { const s = effort(gl in SEC_PER_STEP ? gl : grade, pe); A.sec += s; A.cls[timeClass(s)]++; const kd = A.kinds[pe.kind] = A.kinds[pe.kind] || { n: 0, sec: 0 }; kd.n++; kd.sec += s; A.maxAns = Math.max(A.maxAns, Math.abs(pe.a));
          const sm = A.samples[pe.kind] = A.samples[pe.kind] || { kana: [], kanji: [] }; if (sm[mode].length < 2 && !sm[mode].some(v => v[0] === en)) sm[mode].push([en, ja]); }
      });
    }
    A.pool = distinct.size; A.sec = A.n ? A.sec / A.n : 0;
    if (A.n < 2000) bad('draws', `act ${act}: only ${A.n} questions drawn`);
    if (A.pool < MIN_POOL[grade]) bad('pool', `act ${act}: ${A.pool} different questions in ${A.n} draws (minimum ${MIN_POOL[grade]})`);
    if (A.minGap <= REPEAT_GAP[grade]) bad('repeat', `act ${act}: the same question came back after ${A.minGap} questions (must be more than ${REPEAT_GAP[grade]})`);
    if (grade === '6' && act === 5 && A.neg / A.n > NEG_MAX) bad('neg', `act 5: ${(100 * A.neg / A.n).toFixed(1)}% of questions carry a negative number (at most ${NEG_MAX * 100}%)`);
  }
  for (const act of [2, 3, 4, 5]) if (!(res.acts[act].sec >= res.acts[act - 1].sec + RAMP_STEP)) bad('ramp', `act ${act} ${res.acts[act].sec.toFixed(2)} s is not above act ${act - 1} ${res.acts[act - 1].sec.toFixed(2)} s`);
  return res;
}

async function main() {
  const fs = require('fs');
  const U = require('./_uilib.cjs');
  const { L, rec } = U;
  const DRAWS = Math.max(1, Number(process.env.QUIZ_DRAWS) || 2000);
  const o = await L.launch({ dpr: 1 }); const page = o.page; const out = { url: L.URL_, draws: DRAWS, grades: {} };
  try {
    await U.boot(page, { locale: 'ja', kanji: false, mapId: 'overworld', x: 72, y: 270 });
    await page.waitForFunction(() => { const g = window.__GAME_STATE__; return g && g.quizManager && g.quizManager.__qzWrapped; }, { timeout: 20000 }).catch(() => {});
    const live = await page.evaluate(() => { const q = window.__GAME_STATE__.quizManager, v = window.__QOK_QUIZ2__; return { wrapped: !!q.__qzWrapped, v2: !!v, v2on: !!(v && v.on()), version: v && v.version, sw: localStorage.getItem('qok-quiz2') }; });
    out.live = live;
    console.log(`[INFO] bank under test: ${live.v2on ? 'quiz bank v2 (' + live.version + ')' : 'the bundle\'s bank'}${live.v2 && !live.v2on ? ' (qok-quiz2=0)' : ''}; sampler wrapper ${live.wrapped ? 'installed' : 'MISSING'}; ${DRAWS} draws per grade, act and mode`);
    rec('the real getQuestion is reachable and wrapped', live.wrapped, live);
    for (const grade of GRADES) {
      const cells = await page.evaluate(([grade, ZONES, DRAWS]) => {
        const gs = window.__GAME_STATE__, qm = gs.quizManager, st = gs.player.state, keep = { d: qm.getDifficulty(), k: st.kanjiMode, w: qm.consecutiveWrong };
        const cells = {};
        qm.setDifficulty(grade); qm.consecutiveWrong = 0;
        for (const act of [1, 2, 3, 4, 5]) {
          cells[act] = {};
          for (const mode of ['kana', 'kanji']) {
            st.kanjiMode = mode === 'kanji'; const rows = [], zs = ZONES[act];
            // one zone for a stretch of 25 questions, every fifth stretch against a boss
            for (let i = 0; i < DRAWS; i++) { const seg = Math.floor(i / 25), z = zs[seg % zs.length], boss = seg % 5 === 4, q = qm.getQuestion(z, boss), a = (q && q.answers) || [];
              rows.push([q && q.questionText && q.questionText.en, q && q.questionText && q.questionText.ja, a.map(x => x && x.text && x.text.en), a.filter(x => x && x.isCorrect).length === 1 ? a.findIndex(x => x && x.isCorrect) : -1, q && q.category, q && q.gradeLevel, z, boss]); }
            cells[act][mode] = rows;
          }
        }
        qm.setDifficulty(keep.d); st.kanjiMode = keep.k; qm.consecutiveWrong = keep.w;
        return cells;
      }, [grade, ZONES, DRAWS]);
      // measure every different text with the quiz font: lines at the measured box width
      const texts = new Set(); for (const a of [1, 2, 3, 4, 5]) for (const m of ['kana', 'kanji']) for (const r of cells[a][m]) { if (typeof r[0] === 'string') texts.add(r[0]); if (typeof r[1] === 'string') texts.add(r[1]); }
      const widths = await page.evaluate(async ([list, FIT]) => {
        try { await document.fonts.ready; } catch (e) {}
        const fam = getComputedStyle(document.querySelector('#qok-ui') || document.body).fontFamily;
        const cx = document.createElement('canvas').getContext('2d'); cx.font = FIT.font + ' ' + fam;
        const sp = cx.measureText(' ').width, out = {};
        for (const t of list) { let lines = 1, x = 0, over = false;
          for (const w of t.split(' ')) { const ww = cx.measureText(w).width; if (ww > FIT.width) over = true; if (x && x + sp + ww > FIT.width) { lines++; x = ww; } else x = x ? x + sp + ww : ww; }
          out[t] = { lines, over }; }
        return out;
      }, [[...texts], FIT]);
      const r = judge(grade, cells, widths); out.grades[grade] = r;
      const name = grade === 'k' ? 'K' : 'grade ' + grade, first = k => (r.fails[k] ? `${r.fails[k].length} -- ${r.fails[k][0]}` : undefined);
      const A = r.acts, per = fn => [1, 2, 3, 4, 5].map(a => fn(A[a])).join(' / ');
      rec(`${name} draws: at least 2,000 per act`, !r.fails.draws, r.fails.draws ? first('draws') : per(a => a.n));
      rec(`${name} key: four different choices, one right, the text works out to it (EN and JA)`, !r.fails.key, first('key'));
      rec(`${name} type: every answer is a whole number of at most four digits`, !r.fails.type, first('type') || 'largest ' + per(a => a.maxAns));
      rec(`${name} neg: no negative number outside grade 6 Act 5`, !r.fails.neg, first('neg') || (grade === '6' ? `act 5 share ${(100 * A[5].neg / A[5].n).toFixed(1)}%` : undefined));
      rec(`${name} kana: no kanji in kana mode`, !r.fails.kana, first('kana'));
      rec(`${name} kanji: none above the grade in kanji mode`, !r.fails.kanji, first('kanji'));
      rec(`${name} fit: at most ${FIT.lines} lines in the battle box, no word wider than it`, !r.fails.fit, first('fit') || 'longest EN ' + Math.max(...[1, 2, 3, 4, 5].map(a => A[a].longest.en.length)) + ' chars, kana ' + Math.max(...[1, 2, 3, 4, 5].map(a => A[a].longest.kana.length)) + ', kanji ' + Math.max(...[1, 2, 3, 4, 5].map(a => A[a].longest.kanji.length)));
      rec(`${name} pool: at least ${MIN_POOL[grade]} different questions per act`, !r.fails.pool, (r.fails.pool ? r.fails.pool.length + ' -- ' : '') + 'acts 1-5: ' + per(a => a.pool));
      rec(`${name} ramp: estimated solving time rises act over act`, !r.fails.ramp, (r.fails.ramp ? r.fails.ramp.join('; ') + ' -- ' : '') + 'seconds: ' + per(a => a.sec.toFixed(1)));
      rec(`${name} repeat: the same question never within ${REPEAT_GAP[grade]}`, !r.fails.repeat, (r.fails.repeat ? r.fails.repeat.length + ' -- ' : '') + 'closest repeat, acts 1-5: ' + per(a => (a.minGap === Infinity ? 'none' : a.minGap)));
    }
    if (o.errors.length) console.log('[INFO] page errors: ' + JSON.stringify(o.errors).slice(0, 400));
  } catch (e) { rec('ran to the end', false, String(e && e.stack || e).slice(0, 600)); }
  if (process.env.QUIZ_JSON) { for (const g in out.grades) for (const k in out.grades[g].fails) out.grades[g].fails[k] = { n: out.grades[g].fails[k].length, first: out.grades[g].fails[k].slice(0, 5) }; fs.writeFileSync(process.env.QUIZ_JSON, JSON.stringify(out, null, 1)); }
  await o.browser.close();
  U.finish('quiz-content');
}
