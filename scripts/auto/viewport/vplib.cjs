'use strict';
// Screen size matrix (day 4, track VP). Shared by scripts/auto/checks/viewport.cjs (the permanent
// check) and scripts/auto/viewport/capture.cjs (pictures + raw numbers for a report).
// One run = one size x one language: it walks the game through SCREENS below from seeded saves,
// the way the census does (scripts/auto/census/ui.cjs, ui2.cjs), and at every screen runs the
// in-page measurements of measure.js plus an edge scan of a 1x screenshot.
// Safe areas are simulated with the DevTools call Emulation.setSafeAreaInsetsOverride, which makes
// env(safe-area-inset-*) resolve to the device's insets in Chromium (the game reads env() only).
const fs = require('fs'), path = require('path');
const U = require('../checks/_uilib.cjs');
const { L } = U;
const MEASURE = fs.readFileSync(path.join(__dirname, 'measure.js'), 'utf8');
const QS = JSON.parse(fs.readFileSync(path.join(__dirname, 'questions.json'), 'utf8'));

// CSS px. Insets: portrait values of the real devices (status bar / Dynamic Island on top, home
// indicator at the bottom). iPhone is portrait only, iPad allows all four (ios/App/App/Info.plist).
const SIZES = [
  { id: 'se', name: 'iPhone SE', w: 375, h: 667, dpr: 2, safe: { top: 20, bottom: 0 }, langs: ['en', 'ja-kana', 'ja-kanji'] },
  { id: 'i13', name: 'iPhone 13', w: 390, h: 844, dpr: 2, safe: { top: 47, bottom: 34 }, langs: ['en', 'ja-kana', 'ja-kanji'] },
  { id: 'promax', name: 'iPhone Pro Max', w: 430, h: 932, dpr: 3, safe: { top: 59, bottom: 34 }, langs: ['en'] },
  { id: 'mini', name: 'iPad mini', w: 744, h: 1133, dpr: 2, safe: { top: 24, bottom: 20 }, langs: ['en'] },
  { id: 'ipad', name: 'iPad', w: 820, h: 1180, dpr: 2, safe: { top: 24, bottom: 20 }, langs: ['en', 'ja-kana', 'ja-kanji'] },
  { id: 'ipadL', name: 'iPad landscape', w: 1180, h: 820, dpr: 2, safe: { top: 24, bottom: 20 }, langs: ['en'] },
  { id: 'pro', name: 'iPad Pro', w: 1024, h: 1366, dpr: 2, safe: { top: 24, bottom: 20 }, langs: ['en'] },
  { id: 'proL', name: 'iPad Pro landscape', w: 1366, h: 1024, dpr: 2, safe: { top: 24, bottom: 20 }, langs: ['en'] },
];
// Every screen a run is expected to reach, in order. A screen that is not reached is reported.
const SCREENS = ['title', 'slots', 'newgame', 'first-arrival',
  'overworld', 'quest-open', 'minimap-folded', 'menu-status', 'menu-items', 'menu-equip', 'menu-equip-pick', 'menu-settings',
  'battle-start', 'battle-menu', 'quiz-keypad', 'quiz-notepad', 'float-enemy', 'float-player', 'quiz-wrong', 'levelup',
  'quiz-long', 'quiz-shapes', 'victory', 'quiz4', 'quiz4-long', 'defeat',
  'town-arrive', 'town-talk', 'dialog-1', 'dialog-2', 'shop', 'shop-confirm', 'shop-sell', 'healer', 'town-menu-save', 'town-saved',
  'dungeon-prompt', 'dungeon', 'crystal-menu', 'dungeon-act1', 'dungeon-chest',
  'boss-room', 'boss-start', 'boss-menu', 'boss-win', 'boss-after',
  'final-start', 'ending', 'ending-later'];
const PARTS = ['title', 'field', 'town', 'dungeon', 'boss', 'ending'];
const T0 = Date.now(), log = (...a) => console.log(`[INFO] ${((Date.now() - T0) / 1000).toFixed(0)}s`, ...a);

async function launch(size) {
  const browser = await L.chromium.launch({ headless: true, args: ['--enable-webgl', '--ignore-gpu-blocklist', '--mute-audio'] });
  const ctx = await browser.newContext({ viewport: { width: size.w, height: size.h }, deviceScaleFactor: size.dpr, hasTouch: true, isMobile: true });
  await ctx.addInitScript(() => { window.Capacitor = { isNativePlatform: () => true }; });
  ctx.setDefaultTimeout(60000);
  const page = await ctx.newPage(), errors = [];
  page.on('pageerror', e => errors.push('pageerror ' + e.message.slice(0, 200)));
  let safeSim = false;
  const safe = { top: 0, bottom: 0, left: 0, right: 0, ...(size.safe || {}) };
  if (process.env.VP_SAFE !== '0') { try { const cdp = await ctx.newCDPSession(page); await cdp.send('Emulation.setSafeAreaInsetsOverride', { insets: safe }); safeSim = true; } catch (e) { log('safe-area override not available:', e.message.slice(0, 120)); } }
  return { browser, ctx, page, errors, safe: safeSim ? safe : { top: 0, bottom: 0, left: 0, right: 0 }, safeSim };
}

// Flat bands at the four edges of a 1x screenshot: how many rows/columns from the edge share one colour.
function edges(png, safe) {
  const P = L.decodePng(png), { w, h, bpp, data } = P;
  const px = (x, y) => { const o = (y * w + x) * bpp; return [data[o], data[o + 1], data[o + 2]]; };
  const near = (a, b, t = 7) => Math.abs(a[0] - b[0]) <= t && Math.abs(a[1] - b[1]) <= t && Math.abs(a[2] - b[2]) <= t;
  const scan = (len, across, at) => { const c0 = at(0, Math.floor(across / 2)); let n = 0;
    for (; n < len; n++) { let ok = true; for (let i = 2; i < across - 2; i += 3) if (!near(at(n, i), c0)) { ok = false; break; } if (!ok) break; }
    return { px: n, rgb: c0, lum: Math.round(0.3 * c0[0] + 0.59 * c0[1] + 0.11 * c0[2]) }; };
  // the step in colour across the inner edge of the top / bottom inset (0 = the screen paints through it)
  const seam = y => { if (y < 1 || y > h - 2) return 0; let d = 0, c = 0; for (let x = 2; x < w - 2; x += 3) { const a = px(x, y - 1), b = px(x, y + 1); d += Math.max(Math.abs(a[0] - b[0]), Math.abs(a[1] - b[1]), Math.abs(a[2] - b[2])); c++; } return Math.round(d / c); };
  return { top: scan(h, w, (n, i) => px(i, n)), bottom: scan(h, w, (n, i) => px(i, h - 1 - n)), left: scan(w, h, (n, i) => px(n, i)), right: scan(w, h, (n, i) => px(w - 1 - n, i)),
    topSeam: safe && safe.top ? seam(safe.top) : 0, bottomSeam: safe && safe.bottom ? seam(h - safe.bottom) : 0 };
}

class Session {
  constructor(o, size, lang, opt = {}) { Object.assign(this, o); this.size = size; this.lang = lang; this.LG = U.LANGS[lang]; this.screens = {}; this.order = []; this.notes = []; this.shots = opt.shots || ''; this.dump = !!opt.dump; this.partErrors = {}; }
  async hold(v) { await this.page.evaluate(v => { try { const b = window.__PHASER_GAME__.scene.getScene('BattleScene'); if (b && b.time && window.__PHASER_GAME__.scene.isActive('BattleScene')) b.time.paused = v; } catch (e) {} }, v).catch(() => {}); }
  // Measure (and photograph) the screen that is up now. opts: settle ms, hold (battle clock), freeze (pause CSS animations: floating numbers)
  async shoot(name, { settle = 600, hold = false, freeze = false } = {}) {
    const page = this.page;
    if (this.screens[name]) { let k = 2; while (this.screens[name + '~' + k]) k++; name = name + '~' + k; }
    await page.waitForFunction(() => { const c = window.__QOK_COVER__; return !c || !c.phase || c.phase() !== 'world'; }, { timeout: 30000 }).catch(() => this.notes.push(name + ': loading cover still up'));
    if (hold) await this.hold(true);
    try {
      if (freeze) await page.evaluate(() => { window.__VP_PAUSED = document.getAnimations().filter(a => a.playState === 'running'); window.__VP_PAUSED.forEach(a => a.pause()); });
      else { await page.waitForTimeout(settle);
        await page.evaluate(() => Promise.race([new Promise(r => setTimeout(r, 1500)), Promise.all(document.getAnimations().filter(a => { try { return a.playState === 'running' && isFinite(a.effect.getComputedTiming().endTime); } catch (e) { return false; } }).map(a => a.finished.catch(() => {})))])).catch(() => {}); }
      let m;
      try { m = await page.evaluate(`(${MEASURE})(${JSON.stringify({ safe: this.safe, dump: this.dump })})`); } catch (e) { m = { issues: [{ rule: 'measure-error', sig: 'measure', n: { err: String(e).slice(0, 200) } }], metrics: {}, groups: {} }; }
      try { const png = await page.screenshot({ type: 'png', scale: 'css' }); const E = edges(png, this.safe); m.edges = E;
        // a flat band exactly as tall as the top inset, with a visible step below it: the screen stops at the notch instead of painting under it
        if (this.safe.top && Math.abs(E.top.px - this.safe.top) <= 2 && E.topSeam > 8) m.issues.push({ rule: 'inset-band', sig: 'edge-top', n: { px: E.top.px, rgb: E.top.rgb, step: E.topSeam } });
        if (this.safe.bottom && Math.abs(E.bottom.px - this.safe.bottom) <= 2 && E.bottomSeam > 8) m.issues.push({ rule: 'inset-band', sig: 'edge-bottom', n: { px: E.bottom.px, rgb: E.bottom.rgb, step: E.bottomSeam } });
        for (const k of ['top', 'bottom', 'left', 'right']) { const lim = k === 'top' || k === 'bottom' ? this.size.h : this.size.w;
          const bg = (m.metrics && m.metrics.pageBg) || [0, 0, 0], same = c => Math.max(Math.abs(c[0] - E[k].rgb[0]), Math.abs(c[1] - E[k].rgb[1]), Math.abs(c[2] - E[k].rgb[2])) <= 2;
          if (E[k].px < lim && E[k].px > (this.safe[k] || 0) + 6 && (same(bg) || same([0, 0, 0]))) m.issues.push({ rule: 'black-bar', sig: 'edge-' + k, n: { px: E[k].px, inset: this.safe[k] || 0, rgb: E[k].rgb } }); } } catch (e) { this.notes.push(name + ': edge scan failed ' + String(e).slice(0, 80)); }
      if (this.shots) { fs.mkdirSync(this.shots, { recursive: true }); await page.screenshot({ path: path.join(this.shots, `${this.size.id}-${this.lang}-${name}.jpg`), type: 'jpeg', quality: 80 }).catch(e => this.notes.push(name + ': shot failed')); }
      this.screens[name] = m; this.order.push(name);
      log('screen', name, 'issues', m.issues.length);
      return m;
    } finally { if (freeze) await page.evaluate(() => { (window.__VP_PAUSED || []).forEach(a => { try { a.play(); } catch (e) {} }); window.__VP_PAUSED = null; }).catch(() => {}); if (hold) await this.hold(false); }
  }
  tap(sel, timeout = 4000) { return U.tap(this.page, sel, timeout); }
  active(k) { return U.active(this.page, k); }
  async setKanji() { if (this.LG.kanji) await this.page.evaluate(() => { try { window.__GAME_STATE__.player.state.kanjiMode = true; } catch (e) {} }); }
  // Seeded saves start as a mid-game hero with plausible figures (level 12, HP 86/120), not the probe's 9999s.
  // On arrival the Quests panel opens by itself for 4 s when the game adds its story quest: wait until it has folded again.
  async boot(o = {}, bootOpts = {}) {
    const mut = o.mutate;
    const r = await U.boot(this.page, { ...this.LG, ...o, mutate: s => { Object.assign(s.player, { level: 12, hp: 86, maxHp: 120, atk: 48, def: 40, spd: 30, gold: 1250 }); if (mut) mut(s); } }, bootOpts);
    await this.page.evaluate(() => new Promise(res => { const t0 = performance.now(); let saw = false;   // open-then-folded, or folded for 8 s
      const tick = () => { const q = document.getElementById('qfh-quest'), open = !!q && !q.classList.contains('collapsed') && q.getBoundingClientRect().width > 70, t = performance.now() - t0;
        if (open) saw = true; if ((!open && (saw || t > 8000)) || t > 16000) return res(open); setTimeout(tick, 150); }; tick(); })).then(open => { if (open) this.notes.push('Quests panel still open 16 s after arrival'); }).catch(() => {});
    await this.page.waitForTimeout(400);
    return r;
  }
}

// ------------------------------------------------------------------ battle helpers
const bst = page => page.evaluate(() => { const g = window.__PHASER_GAME__, b = g.scene.getScene('BattleScene'), on = g.scene.isActive('BattleScene');
  return { on, phase: on && b ? b.phase : null, q: on && !!document.querySelector('#qok-ui .kpad, [data-act="quizAns"]'), kp: on && !!document.querySelector('#qok-ui .kpad'), forPlayer: b && b.quizForPlayer,
    over: g.scene.isActive('GameOverScene'), vic: g.scene.isActive('VictoryScene'),
    bv: (() => { const e = on && document.querySelector('#qok-ui .bvic'); return e ? (e.classList.contains('lvl') ? 'lvl' : 'win') : null; })(), tx: on ? ((document.querySelector('#qok-ui .msg') || document.querySelector('#qok-ui') || {}).innerText || '').replace(/\s+/g, ' ').trim().slice(0, 160) : '' }; }).catch(() => ({ on: false }));
const advance = page => page.evaluate(() => { const b = window.__PHASER_GAME__.scene.getScene('BattleScene'); try { if (b && b._messageCallback) b.advanceMessage(); } catch (e) {} }).catch(() => {});
// Run the battle forward until pred(state). Each new message text is offered to onMsg (which may shoot) before it is advanced.
async function until(S, pred, ms = 30000, onMsg = null) {
  const t0 = Date.now(); let last = null, since = Date.now();
  while (Date.now() - t0 < ms) {
    const s = await bst(S.page); if (pred(s)) return s;
    if (s.phase === 'message') {
      if (s.tx !== last) { last = s.tx; since = Date.now(); if (process.env.VP_DEBUG) log('msg', s.tx); if (onMsg && s.tx) await onMsg(s.tx, s); }
      if (Date.now() - since > (s.bv ? 4000 : 350)) { await advance(S.page); since = Date.now(); }   // celebration panels move on by themselves
    }
    await S.page.waitForTimeout(120);
  }
  return bst(S.page);
}
const setQuestions = (page, list) => page.evaluate(list => { const m = window.__GAME_STATE__.quizManager; if (!m.__vpOrig) m.__vpOrig = m.getQuestion; let i = 0; m.getQuestion = () => JSON.parse(JSON.stringify(list[Math.min(i++, list.length - 1)])); }, list);
const launchBattle0 = (page, id, zone) => page.evaluate(({ id, zone }) => { const g = window.__PHASER_GAME__, wm = g.scene.getScene('WorldMapScene'), em = window.__GAME_STATE__.encounterManager, w = console.warn; console.warn = () => {};
  let m; try { m = em.rollEncounter({ monsters: [{ monsterId: id, weight: 1 }] }); } finally { console.warn = w; }
  if (!m) return 'no monster'; wm.currentEncounterZone = zone; wm.scene.launch('BattleScene', { monster: m, zone }); wm.scene.pause(); return 'launched'; }, { id, zone });
const launchBattle = async (page, id, zone) => { const r = await launchBattle0(page, id, zone); await page.waitForFunction(() => { const g = window.__PHASER_GAME__, b = g.scene.getScene('BattleScene'); return g.scene.isActive('BattleScene') && b && !!b.phase && !!document.querySelector('#qok-ui.battle, #qok-ui .enemy-card'); }, { timeout: 15000 }).catch(() => {}); return r; };
const answers = page => page.evaluate(() => { const b = window.__PHASER_GAME__.scene.getScene('BattleScene'), a = (b.quizQuestion && b.quizQuestion.answers) || []; return { right: a.findIndex(x => x.isCorrect), wrong: a.findIndex(x => !x.isCorrect), rt: a.filter(x => x.isCorrect).map(x => x.text.en)[0] }; });
async function answer(S, right) {
  const st = await bst(S.page), a = await answers(S.page);
  if (st.kp) { const v = right ? String(a.rt) : String((Number(a.rt) || 0) + 1); for (const c of v.replace('-', '')) await S.tap(`[data-act="kpKey"][data-k="${c}"]`, 1500); if (v.startsWith('-')) await S.tap('[data-act="kpKey"][data-k="pm"]', 1500); await S.tap('[data-act="kpKey"][data-k="go"]', 1500); }
  else await S.tap(`[data-act="quizAns"][data-i="${right ? a.right : a.wrong}"]`, 2000);
}
// wait for the floating number of the hit that the answer caused
const waitDmg = (page, ms = 6000) => page.waitForFunction(() => { const d = document.querySelector('#qok-fx .dmgnum'); if (!d) return false; if (!window.__vpDmgT) window.__vpDmgT = performance.now(); return performance.now() - window.__vpDmgT > 220; }, { timeout: ms, polling: 40 }).then(() => page.evaluate(() => { window.__vpDmgT = 0; return true; })).catch(() => false);
// From the command menu to the quiz: tap Attack until the quiz is up (a tap during the menu's entry can be lost).
const toQuiz = async (S, onMsg) => { let s = await bst(S.page);
  for (let i = 0; i < 8 && s.on && !s.q; i++) { s = await until(S, s => s.q || s.phase === 'playerMenu' || !s.on, 30000, onMsg); if (!s.on || s.q) break;
    await S.tap('[data-act="battleMenu"][data-i="0"]', 2500); s = await until(S, s => s.q || !s.on, 2500, onMsg); }
  await S.page.waitForTimeout(500); return bst(S.page); };
const fight = S => toQuiz(S);
const nextQuiz = async (S, onMsg) => { await S.page.waitForTimeout(1300); return toQuiz(S, onMsg); };
const setStats = (page, o) => page.evaluate(o => { Object.assign(window.__GAME_STATE__.player.state, o); }, o);

// ------------------------------------------------------------------ parts
async function partTitle(S) {
  const { page, LG } = S;
  await page.goto(L.URL_, { waitUntil: 'domcontentloaded' }); await page.evaluate(() => localStorage.clear()); await page.reload({ waitUntil: 'load' });
  await L.toTitle(page); await page.waitForTimeout(1500);
  if (LG.locale === 'ja') { await S.setKanji(); await S.tap('[data-act="titleLang"]'); await page.waitForTimeout(600); if (LG.kanji) { await S.tap('[data-act="titleLang"]'); await S.tap('[data-act="titleLang"]'); await page.waitForTimeout(600); } }
  await S.shoot('title');
  if (await page.locator('[data-act="titleSlots"]').count()) { await S.tap('[data-act="titleSlots"]'); await page.waitForTimeout(700); await S.shoot('slots'); await S.tap('[data-act="slotPick"][data-i="1"]'); await page.waitForTimeout(1500); }
  else { await S.tap('[data-act="titleNew"]'); await page.waitForTimeout(1500); }
  await page.waitForSelector('[data-act="introStart"]', { timeout: 15000 }).catch(() => {});
  if (LG.kanji && !(await page.evaluate(() => !!window.__GAME_STATE__.player.state.kanjiMode))) { await S.tap('[data-act="introKanji"]'); await page.waitForTimeout(400); }
  const name = page.locator('#qok-name'); if (await name.count()) { await name.fill(LG.locale === 'ja' ? 'ミカ' : 'Mika'); await page.waitForTimeout(400); await page.evaluate(() => { const e = document.activeElement; if (e && e.blur) e.blur(); }); }
  await S.shoot('newgame');
  // the real first minutes: Start, then whatever the game shows until the hero stands in the world
  await S.tap('[data-act="introStart"]');
  await page.waitForFunction(() => { const g = window.__PHASER_GAME__, w = g.scene.getScene('WorldMapScene'); return w && g.scene.isActive('WorldMapScene') && w.hero && w.mapData; }, { timeout: 60000 });
  await page.waitForFunction(() => { const T = window.__DQ_TILES__; return T && T.ready && T.ready(); }, { timeout: 90000 }).catch(() => {});
  await page.waitForTimeout(2500); await S.setKanji();
  await S.shoot('first-arrival');
}

async function partField(S) {
  const { page } = S;
  await S.boot({ mapId: 'overworld', x: 69, y: 258, activeQuests: ['kikisChallenge', 'owlsLesson', 'drakeCargo'],
    inventory: [{ itemId: 'herb', quantity: 5 }, { itemId: 'potion', quantity: 2 }, { itemId: 'ironSword', quantity: 1 }, { itemId: 'leatherArmor', quantity: 1 }] });
  await page.waitForTimeout(1500);
  await S.shoot('overworld');
  await S.tap('#qfh-quest-toggle', 2500); await page.waitForTimeout(700); await S.shoot('quest-open'); await S.tap('#qfh-quest-toggle', 2500); await page.waitForTimeout(500);   // the Quests panel as the player opens it (four quests listed)
  await S.tap('#qfh-map', 2500); await page.waitForTimeout(900); await S.shoot('minimap-folded'); await S.tap('#qfh-map', 2500); await page.waitForTimeout(600);
  const names = ['status', 'items', 'equip', 'settings'];
  for (let i = 0; i < 4; i++) {
    await S.tap(`#fieldTabs [data-fi="${i}"]`); await page.waitForTimeout(1200);
    if (!(await S.active('MenuScene'))) { await S.tap(`#fieldTabs [data-fi="${i}"]`); await page.waitForTimeout(1200); }
    await S.tap(`[data-act="tab"][data-i="${i}"]`, 1500); await page.waitForTimeout(700);
    await S.shoot('menu-' + names[i]);
    if (names[i] === 'equip' && await page.locator('[data-act="equipSlot"]').count()) { await S.tap('[data-act="equipSlot"]'); await page.waitForTimeout(600); await S.shoot('menu-equip-pick'); }
    await S.tap('[data-act="close"]', 2000); await page.waitForTimeout(800);
    if (await S.active('MenuScene')) { await S.tap('[data-act="close"]', 2000); await page.waitForTimeout(800); }
  }
  // ---- a regular battle on the keypad: every stage, with fixed questions
  await setStats(page, { level: 4, exp: 99, expToNext: 100, atk: 6, hp: 60, maxHp: 60 });
  await setQuestions(page, [QS.normal]);
  log('battle', await launchBattle(page, 'slime', 'greenhollow-plains'));
  await page.waitForTimeout(1800); await S.shoot('battle-start', { hold: true });
  await until(S, s => s.phase === 'playerMenu' || !s.on); await page.waitForTimeout(300); await S.shoot('battle-menu');
  await toQuiz(S);
  await S.shoot('quiz-keypad');
  await S.tap('[data-act="kpKey"][data-k="note"]', 1500); await page.waitForTimeout(500);
  const np = await page.evaluate(() => { const e = document.getElementById('qok-notepad'); if (!e || e.style.display === 'none') return null; const r = e.getBoundingClientRect(); return { x: r.left, y: r.top, w: r.width, h: r.height }; });
  if (np) { await page.mouse.move(np.x + np.w * 0.2, np.y + np.h * 0.3); await page.mouse.down(); await page.mouse.move(np.x + np.w * 0.6, np.y + np.h * 0.5, { steps: 8 }); await page.mouse.move(np.x + np.w * 0.35, np.y + np.h * 0.7, { steps: 8 }); await page.mouse.up(); await page.waitForTimeout(300);
    await S.shoot('quiz-notepad'); await page.locator('#qok-notepad [data-np="close"]').tap().catch(() => {}); await page.waitForTimeout(400); }
  // right answer with a weak arm (the enemy survives: a number floats off it), wrong on its turn (a number floats off the hero),
  // wrong on ours (typed answer struck out), then strong and right until the win
  let seen = {}; const onMsg = async (tx, st) => { const lv = st.bv === 'lvl', vic = st.bv === 'win';
    if (lv && !seen.lv) { seen.lv = 1; await S.shoot('levelup', { hold: true, settle: 250 }); } };   // this win levels her up: the Victory beat gives way to "Level 5!" after a moment, so Victory is photographed in the next fight
  await answer(S, true); if (await waitDmg(page)) await S.shoot('float-enemy', { freeze: true, hold: true });
  let s = await nextQuiz(S, onMsg);
  for (let i = 0; i < 14 && s.on && s.q; i++) {
    if (process.env.VP_DEBUG) log('quiz', i, JSON.stringify(s));
    if (s.forPlayer === false && !seen.fp) { seen.fp = 1; await answer(S, false); if (await waitDmg(page)) await S.shoot('float-player', { freeze: true, hold: true }); }
    else if (s.forPlayer !== false && !seen.wrong) { seen.wrong = 1; await answer(S, false); await page.waitForTimeout(450); await S.shoot('quiz-wrong', { freeze: true, hold: true }); await setStats(page, { atk: 9999 }); }
    else await answer(S, true);
    s = await nextQuiz(S, onMsg);
  }
  await until(S, s => !s.on, 20000, onMsg); await page.waitForTimeout(1200);
  await dismissField(S);
  // ---- the longest question of the bank on the keypad, then a wide row of shapes
  const long = S.LG.locale === 'ja' ? QS.longJa : QS.longEn;
  await setStats(page, { level: 12, exp: 0, expToNext: 5000, atk: 9999, hp: 9999, maxHp: 9999 });
  await setQuestions(page, [long, QS.shapes, QS.normal]);
  log('battle', await launchBattle(page, 'rabbit', 'greenhollow-plains'));
  await fight(S); if ((await bst(page)).q) { await S.shoot('quiz-long'); await answer(S, false); }
  s = await nextQuiz(S); if (s.q) { await S.shoot('quiz-shapes'); await answer(S, true); }
  const onWin = async (tx, st) => { if (st.bv === 'win' && !seen.vic) { seen.vic = 1; await S.shoot('victory', { hold: true, settle: 250 }); } };
  s = await nextQuiz(S, onWin); for (let i = 0; i < 5 && s.on && s.q; i++) { await answer(S, true); s = await nextQuiz(S, onWin); }
  await until(S, s => !s.on, 20000, onWin); await page.waitForTimeout(1000); await dismissField(S);
  // ---- the four-button quiz (switch qok-keypad=0)
  await page.evaluate(() => localStorage.setItem('qok-keypad', '0'));
  await setQuestions(page, [QS.normal, long, QS.normal]);
  log('battle', await launchBattle(page, 'slime', 'greenhollow-plains'));
  await fight(S); if ((await bst(page)).q) { await S.shoot('quiz4'); await answer(S, false); }
  s = await nextQuiz(S); if (s.q) { await S.shoot('quiz4-long'); await answer(S, true); }
  s = await nextQuiz(S); for (let i = 0; i < 5 && s.on && s.q; i++) { await answer(S, true); s = await nextQuiz(S); }
  await until(S, s => !s.on, 20000); await page.waitForTimeout(1000); await dismissField(S);
  await page.evaluate(() => localStorage.removeItem('qok-keypad'));
  // ---- defeat
  await setStats(page, { hp: 1, maxHp: 10, def: 0, atk: 1, level: 2 });
  await setQuestions(page, [QS.normal]);
  log('battle', await launchBattle(page, 'slime', 'greenhollow-plains'));
  await fight(S);
  for (let i = 0; i < 8; i++) { const st = await bst(page); if (st.over || !st.on) break; if (st.q) await answer(S, false); await nextQuiz(S); }
  await page.waitForFunction(() => window.__PHASER_GAME__.scene.isActive('GameOverScene'), { timeout: 20000 }).catch(() => {});
  await page.waitForTimeout(1500);
  if (await S.active('GameOverScene')) await S.shoot('defeat');
}
// close field message boxes and the quest card after a battle
async function dismissField(S, max = 16) {
  for (let i = 0; i < max; i++) {
    const w = await S.page.evaluate(() => { const g = window.__PHASER_GAME__, wm = g.scene.getScene('WorldMapScene'), c = document.getElementById('qok-quest-completion'); return { msg: !!(wm && wm.showingMessage), card: !!(c && !c.hidden), bat: g.scene.isActive('BattleScene') }; }).catch(() => ({}));
    if (w.card) { await S.page.locator('#qok-quest-completion .qqc-dismiss').tap({ timeout: 2000 }).catch(() => {}); await S.page.waitForTimeout(400); continue; }
    if (w.msg) { await S.page.keyboard.press('z').catch(() => {}); await S.page.waitForTimeout(350); continue; }
    if (i > 2) return; await S.page.waitForTimeout(300);
  }
}

// Hold the stick up until a battle starts (closing story boxes on the way); the battle clock is stopped at once so its opening can be measured.
async function walkIntoBattle(S, ms = 25000) {
  const page = S.page, t0 = Date.now();
  await page.evaluate(() => { window.__DQ_STICK__ = { x: 0, y: -1, m: 1 }; });
  try { while (Date.now() - t0 < ms) {
    // one page task decides and acts: a story box is closed with a Z key event only while no battle is up, so the key can never land in the battle's opening
    const st = await page.evaluate(() => { const g = window.__PHASER_GAME__, w = g.scene.getScene('WorldMapScene'), on = g.scene.isActive('BattleScene');
      if (on) { try { g.scene.getScene('BattleScene').time.paused = true; } catch (e) {} return { on }; }
      if (w && w.showingMessage) { for (const t of ['keydown', 'keyup']) window.dispatchEvent(new KeyboardEvent(t, { key: 'z', code: 'KeyZ', keyCode: 90, which: 90, bubbles: true })); return { on, msg: true }; }
      return { on }; }).catch(() => ({}));
    if (st.on) return true; await page.waitForTimeout(st.msg ? 250 : 80);
  } } finally { await page.evaluate(() => { window.__DQ_STICK__ = { x: 0, y: 0, m: 0 }; }).catch(() => {}); }
  return false;
}
const PILOT = fs.readFileSync(path.join(U.ROOT, 'scripts/acts/probe/pilot.js'), 'utf8');
const ptsrc = fs.readFileSync(path.join(U.ROOT, 'scripts/acts/probe/playthrough/ptlib.cjs'), 'utf8');
const HELP = ptsrc.slice(ptsrc.indexOf('const HELP = () => {') + 'const HELP = '.length, ptsrc.indexOf('\nclass Session')).trim().replace(/;\s*$/, '');
async function partTown(S) {
  const { page } = S;
  const src = fs.readFileSync(path.join(U.ROOT, 'public/act1-world-map.js'), 'utf8'), m = /var LANDMARKS = (\[.*?\]);/.exec(src);
  const d = JSON.parse(m[1]).find(l => l.mapId === 'greenhollow');
  await S.boot({ mapId: 'overworld', x: d.exit.x, y: d.exit.y, activeQuests: ['kikisChallenge'], inventory: [{ itemId: 'herb', quantity: 5 }, { itemId: 'potion', quantity: 2 }] });
  await L.walkCells(page, [[d.at.x, d.at.y]], { maxMs: 25000 });
  await page.waitForFunction(() => { const f = document.querySelector('#act1-hifi-preserved-root iframe'); return !!(f && f.contentWindow && f.contentWindow.__ACT1_TOWN__); }, { timeout: 40000 }).catch(() => {});
  await page.waitForTimeout(3500); await page.evaluate(PILOT); await page.evaluate(`(${HELP})()`);
  const key = () => page.evaluate(() => window.__PTH.pressTalk());
  const closeAll = async (max = 30) => { for (let i = 0; i < max; i++) { const s = await page.evaluate(() => { const w = window.__PHASER_GAME__.scene.getScene('WorldMapScene'), c = document.getElementById('qok-quest-completion'); return { msg: !!w.showingMessage, card: !!(c && !c.hidden) }; });
    if (s.card) { await page.locator('#qok-quest-completion .qqc-dismiss').tap({ timeout: 3000 }).catch(() => {}); await page.waitForTimeout(400); continue; } if (!s.msg) return; await page.evaluate(() => window.__P.tapKey('z')); await page.waitForTimeout(320); } };
  await S.shoot('town-arrive');
  await page.evaluate(() => window.__PTH.walkToNpc('elder')); await page.waitForTimeout(800);
  await S.shoot('town-talk');
  await key(); await page.waitForTimeout(1400); await S.shoot('dialog-1');
  await key(); await page.waitForTimeout(1200); await S.shoot('dialog-2');
  await closeAll();
  await page.evaluate(() => window.__PTH.walkToNpc('shopkeeper')); await page.waitForTimeout(600); await key(); await page.waitForTimeout(1800);
  for (let i = 0; i < 4 && !(await S.active('ShopScene')); i++) { await closeAll(); await key(); await page.waitForTimeout(900); }
  if (await S.active('ShopScene')) {
    await S.shoot('shop');
    if (await page.locator('[data-act="shopBuy"]').count()) { await S.tap('[data-act="shopBuy"]'); await page.waitForTimeout(600); await S.shoot('shop-confirm'); await S.tap('[data-act="shopCancel"]'); await page.waitForTimeout(400); }
    await S.tap('[data-act="shopMode"][data-mode="sell"]'); await page.waitForTimeout(700); await S.shoot('shop-sell');
    await S.tap('[data-act="shopLeave"]'); await page.waitForTimeout(1200);
  } else S.notes.push('shop did not open');
  await closeAll();
  await page.evaluate(() => { const s = window.__GAME_STATE__.player.state; s.hp = Math.floor(s.maxHp / 3); });
  await page.evaluate(() => window.__PTH.walkToNpc('healer')); await page.waitForTimeout(600); await key(); await page.waitForTimeout(1500);
  const ho = await page.evaluate(() => !!window.__PHASER_GAME__.scene.getScene('WorldMapScene').healerOverlayOpen);
  if (ho) { await S.shoot('healer'); await S.tap('[data-act="healCancel"]'); await page.waitForTimeout(700); } else S.notes.push('healer overlay did not open');
  await closeAll();
  await S.tap('#fieldTabs [data-fi="0"]'); await page.waitForTimeout(1200);
  if (!(await S.active('MenuScene'))) { await S.tap('#fieldTabs [data-fi="0"]'); await page.waitForTimeout(1200); }
  if (await S.active('MenuScene')) { await S.shoot('town-menu-save'); await S.tap('[data-act="menuSave"]'); await page.waitForTimeout(500); await S.shoot('town-saved', { settle: 150 }); await S.tap('[data-act="close"]', 2000); }
}

async function partDungeon(S) {
  const { page } = S;
  const push = async (dx, dy, ms) => { await L.stick(page, dx, dy, ms); await page.waitForTimeout(600); };
  // Iron Mine 1F beside the track lever: the HUD with the mechanic's prompt pill ("Pull lever")
  await S.boot({ mapId: 'ironMine', floor: 1, x: 21, y: 17 }); await page.waitForTimeout(2500);
  await page.waitForFunction(() => { const e = document.getElementById('a1mInteract'); return !!e && e.classList.contains('a1m-show'); }, { timeout: 8000 }).catch(() => S.notes.push('no prompt pill beside the Iron Mine lever'));
  await S.shoot('dungeon-prompt');
  await S.boot({ mapId: 'stormNest', floor: 3, x: 11, y: 19 }); await page.waitForTimeout(1500);
  await S.shoot('dungeon');
  await push(0, -1, 1500); await page.keyboard.press('z').catch(() => {}); await page.waitForTimeout(1200); await S.shoot('crystal-menu');
  await S.boot({ mapId: 'sunkenCellar', floor: 1, x: 19, y: 17 }); await page.waitForTimeout(1500);
  await S.shoot('dungeon-act1');
  await push(0, -1, 1400); await S.shoot('dungeon-chest');
}

async function partBoss(S) {
  const { page } = S;
  await S.boot({ mapId: 'stormNest', floor: 5, x: 39, y: 33, all: false, flags: { 'boss.giantToad.defeated': true, 'boss.serpent.defeated': true }, mutate: s => { s.player.atk = 9999; s.player.hp = 999; s.player.maxHp = 999; } });
  await page.waitForTimeout(1500); await S.shoot('boss-room');
  await setQuestions(page, [QS.normal]);
  if (!(await walkIntoBattle(S))) { S.notes.push('boss battle did not start'); return; }
  await page.waitForTimeout(1500); await S.shoot('boss-start', { hold: true });
  await until(S, s => s.phase === 'playerMenu' || !s.on); await page.waitForTimeout(300); await S.shoot('boss-menu');
  let seen = {}; const onMsg = async (tx, st) => { if (st.bv === 'win' && !seen.vic) { seen.vic = 1; await S.shoot('boss-win', { hold: true, settle: 250 }); } };
  let s = await toQuiz(S, onMsg); for (let i = 0; i < 8 && s.on && s.q; i++) { await answer(S, true); s = await nextQuiz(S, onMsg); }
  await until(S, s => !s.on, 25000, onMsg); await page.waitForTimeout(2500);
  await S.shoot('boss-after');
}

async function partEnding(S) {
  const { page } = S;
  await S.boot({ mapId: 'demonCastle', floor: 9, x: 50, y: 10, all: true, inventory: [{ itemId: 'herb', quantity: 5 }], mutate: s => { s.player.atk = 9999; s.player.hp = 999; s.player.maxHp = 999; s.player.level = 42; } });
  await page.waitForTimeout(2000); await setQuestions(page, [QS.normal]);
  if (!(await walkIntoBattle(S, 30000))) { S.notes.push('final battle did not start'); return; }
  await page.waitForTimeout(1500); await S.shoot('final-start', { hold: true });
  await fight(S); let s = await bst(page); for (let i = 0; i < 10 && s.on && s.q; i++) { await answer(S, true); s = await nextQuiz(S); }
  await until(S, s => !s.on, 25000);
  for (let i = 0; i < 40; i++) { await page.waitForTimeout(1000); if (await S.active('VictoryScene')) break; const m = await page.evaluate(() => { const w = window.__PHASER_GAME__.scene.getScene('WorldMapScene'); return w && w.showingMessage; }).catch(() => false); if (m) { await page.keyboard.press('z'); await page.waitForTimeout(300); } }
  if (!(await S.active('VictoryScene'))) { S.notes.push('ending did not start'); return; }
  await page.waitForTimeout(3000); await S.shoot('ending');
  await page.waitForTimeout(6000); await S.shoot('ending-later');
}

const RUN = { title: partTitle, field: partField, town: partTown, dungeon: partDungeon, boss: partBoss, ending: partEnding };
// Run the chosen parts for one size and language. Returns { size, lang, screens, order, unreached, notes, partErrors, safeSim }.
async function run(size, lang, { parts = PARTS, shots = '', dump = false } = {}) {
  const o = await launch(size), S = new Session(o, size, lang, { shots, dump });
  for (const p of parts) { log('PART', p, size.id, lang); try { await RUN[p](S); } catch (e) { S.partErrors[p] = String(e && e.stack || e).slice(0, 400); log('PART ERR', p, S.partErrors[p].slice(0, 200)); if (shots) await o.page.screenshot({ path: path.join(shots, `${size.id}-${lang}-ERR-${p}.jpg`), type: 'jpeg', quality: 70 }).catch(() => {}); } }
  await o.browser.close();
  return { size: size.id, lang, vw: size.w, vh: size.h, safe: o.safe, safeSim: o.safeSim, screens: S.screens, order: S.order, notes: S.notes, partErrors: S.partErrors, pageErrors: o.errors.slice(0, 10) };
}
// Which screens belong to which part (for "unreached").
const PART_OF = { title: ['title', 'slots', 'newgame', 'first-arrival'], field: SCREENS.slice(4, 26), town: SCREENS.slice(26, 36), dungeon: SCREENS.slice(36, 41), boss: SCREENS.slice(41, 46), ending: SCREENS.slice(46) };
module.exports = { SIZES, SCREENS, PARTS, PART_OF, run, launch, U, L, log, Session, _int: { bst, until, setQuestions, launchBattle, answer, waitDmg, fight, nextQuiz, setStats, QS } };
