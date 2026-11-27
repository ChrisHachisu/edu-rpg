'use strict';
// Menu and field HUD polish check (day 4, design reviews autoloop/day4/critic/ui-en and ui-ja). Guards:
//   UE-04  the shop title is not clipped (EN, kana, kanji) and the greeting is readable and clear of it
//   UE-06  every tap target on the menus, shop, title, slots, Create Your Hero, defeat screen and field HUD
//          is at least 48 px on its short side, at 390x844 and 375x667 (the town Talk pill and the dungeon
//          interact pill included)
//   UE-05  the field tab bar and the menu tab bar share one font, size, weight and colours, and one dot colour
//   UE-21  "Lv 50" on the field chip as in the menus; the equipment filter dot sits on its icon; the quit
//          dialog keeps green for confirm-and-spend only
//   UE-03  the Quests panel starts folded, opens on a tap, opens by itself for about 4 s when a quest is
//          added or ends, then folds again; localStorage['qok-quests-fold']='0' gives the old behaviour
//   UE-07  the defeat screen: no skull, the hero and a heart, a warm title, 16 px notes, centred, the same
//          buttons in the same order; localStorage['qok-defeat-gentle']='0' gives the old screen
//   UE-14  shop prices read (contrast at least 4.5:1) and all three exits are still there
//   UE-16  Create Your Hero: large Look choices with one clear selected state, the standard Back button,
//          a New Game+ tag on that path only
//   UE-17  Settings: the three joystick sides are words and each one sets its side; Sound and Volume differ
//   UJ-04  a "new quest" banner on the field is the DOM toast, not canvas text under the HUD
//   UJ-10  the Japanese compass says north in Japanese (kana: きた alone; kanji: 北 南 東 西)
//   D01    the Settings grade row is information: no chevron, no tap action (the grade is fixed after New Game)
//   Q01    a first launch follows the device language (ja -> Japanese, anything else -> English); a stored
//          choice wins; localStorage['qok-first-lang']='0' gives the bundle's default
//   D04    a defeat with no town on record goes to Greenhollow with full HP and half the gold
//   words  the Japanese strings of the text track (autoloop/day4/words/REPORT-T2.md section 4): the quit
//          question, the quest card, the quest list's two waiting lines, the quest chip's aria-labels,
//          the start-over dialog, each in kana and kanji with phrase spaces
//
//   NODE_PATH=/opt/node-tools/node_modules PROBE_URL=http://127.0.0.1:5502/ node scripts/auto/checks/ui-polish.cjs [group ...]
// groups: title menu shop quests quests-old defeat town dungeon words firstlang. UI_SHOTS=<dir> writes JPEG screenshots.
// Real: Continue from a seeded save, finger taps on the overlay's own buttons, a walk into Greenhollow
// and up to the elder. Direct (said on the line): the shop and the defeat screen are opened with the
// bundle's own scene calls (the calls the shopkeeper and a lost battle make), quests are started and
// ended with questManager / the save's own list, and the viewport is resized to 375x667 in place.
const U = require('./_uilib.cjs');
const { L, rec, tap, shot } = U;
const GROUP = U.runGroups(__filename, ['title', 'menu', 'shop', 'quests', 'quests-old', 'defeat', 'town', 'dungeon', 'words', 'firstlang', 'd4off', 'u2'], 'ui-polish');   // d4off, u2: the review follow-ups (U2)
const MIN = 48;

// Every tappable thing on screen: the overlay's routed elements ([data-act], which the tap router
// resolves with closest(), so the element's own box IS the hit area), buttons, inputs, the field tab
// bar, the field HUD's buttons and the two interact pills. Left out, each for a stated reason: the
// rows of the grade wheel (a drag wheel, owner-confirmed at build 54; the wheel itself is 102 px),
// the no-op card that only shields a dialog, and a dialog's backdrop.
const TAPS = () => {
  const out = [], vw = innerWidth, vh = innerHeight;
  const sels = '#qok-ui [data-act], #qok-ui button, #qok-ui input, #fieldTabs [data-fi], #qok-field-hud button, #qok-quest-completion button, #a1mInteract.a1m-show';
  for (const e of new Set(document.querySelectorAll(sels))) {
    const r = e.getBoundingClientRect(); if (!r.width || !r.height) continue;
    const cs = getComputedStyle(e); if (cs.visibility === 'hidden' || cs.display === 'none' || cs.pointerEvents === 'none') continue;
    const act = e.getAttribute('data-act') || '';
    if (/Noop$/.test(act) || e.classList.contains('shopconf') || e.classList.contains('gopt')) continue;
    // the centre must be reachable: not under another element (a centre scrolled out of view is not judged for that)
    const cx = r.left + r.width / 2, cy = r.top + r.height / 2, inView = cx >= 0 && cx <= vw && cy >= 0 && cy <= vh;
    const over = () => { const q = e.getBoundingClientRect(), t = document.elementFromPoint(q.left + q.width / 2, q.top + q.height / 2); return !!t && !(t === e || e.contains(t) || (t.closest && t.closest('[data-act]') === e)); };
    let covered = inView && over();
    // under the fixed tab bar at the foot of a scrolling page is not "covered": scroll it to the middle and judge again
    if (covered) { const sc = []; for (let p = e.parentElement; p; p = p.parentElement) sc.push([p, p.scrollTop]); e.scrollIntoView({ block: 'center' }); covered = over(); sc.forEach(([p, y]) => { p.scrollTop = y; }); }
    out.push({ k: (e.id ? '#' + e.id : (typeof e.className === 'string' && e.className ? '.' + e.className.trim().split(/\s+/).join('.') : e.tagName.toLowerCase())) + (act ? '[' + act + ']' : ''),
      t: (e.textContent || '').trim().slice(0, 14), w: Math.round(r.width * 10) / 10, h: Math.round(r.height * 10) / 10, covered });
  }
  return out;
};
const scan = page => page.evaluate(`(${TAPS})()`);
const VPS = [[390, 844], [375, 667]];
async function setVp(page, w, h) { const v = page.viewportSize(); if (v && v.width === w && v.height === h) return; await page.setViewportSize({ width: w, height: h }); await page.waitForTimeout(450); }
// One [PASS]/[FAIL] line per viewport for the screen that is up now.
async function taps(page, label, { need = 1, only = null } = {}) {
  for (const [w, h] of VPS) {
    await setVp(page, w, h);
    let all = await scan(page); if (only) all = all.filter(x => only.test(x.k));
    const small = all.filter(x => x.w < MIN - 0.5 || x.h < MIN - 0.5), cov = all.filter(x => x.covered);
    rec(`UE-06 ${label} at ${w}x${h}: every tap target is at least ${MIN} px and reachable`, all.length >= need && !small.length && !cov.length,
      { targets: all.length, small: small.slice(0, 8).map(x => `${x.k} "${x.t}" ${x.w}x${x.h}`), covered: cov.slice(0, 4).map(x => x.k) });
  }
  await setVp(page, 390, 844);
}
const rgb = s => { const m = /rgba?\(([^)]+)\)/.exec(s || ''); if (!m) return null; const p = m[1].split(',').map(Number); return { r: p[0], g: p[1], b: p[2], a: p.length > 3 ? p[3] : 1 }; };
// Contrast of an element's text on what is really behind it: its translucent layers composited over the screen's charcoal.
const CONTRAST = (el) => {
  const parse = s => { const m = /rgba?\(([^)]+)\)/.exec(s); if (!m) return null; const p = m[1].split(',').map(Number); return { r: p[0], g: p[1], b: p[2], a: p.length > 3 ? p[3] : 1 }; };
  const lum = c => { const f = v => { v /= 255; return v <= 0.03928 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4); }; return 0.2126 * f(c.r) + 0.7152 * f(c.g) + 0.0722 * f(c.b); };
  const layers = []; for (let e = el; e; e = e.parentElement) { const b = parse(getComputedStyle(e).backgroundColor); if (b && b.a > 0) { layers.push(b); if (b.a >= 0.99) break; } }
  let base = { r: 21, g: 22, b: 28 }; for (let i = layers.length - 1; i >= 0; i--) { const l = layers[i]; base = { r: l.r * l.a + base.r * (1 - l.a), g: l.g * l.a + base.g * (1 - l.a), b: l.b * l.a + base.b * (1 - l.a) }; }
  const fg = parse(getComputedStyle(el).color), L1 = lum(fg), L2 = lum(base);
  return { ratio: +((Math.max(L1, L2) + 0.05) / (Math.min(L1, L2) + 0.05)).toFixed(2), fg: getComputedStyle(el).color, bg: [base.r, base.g, base.b].map(Math.round).join(',') };
};
const openTab = async (page, i) => {
  await tap(page, `#fieldTabs [data-fi="${i}"]`); await page.waitForTimeout(1200);
  if (!(await U.active(page, 'MenuScene'))) { await tap(page, `#fieldTabs [data-fi="${i}"]`); await page.waitForTimeout(1200); }
  await tap(page, `[data-act="tab"][data-i="${i}"]`, 1500); await page.waitForTimeout(700);
};
const closeMenu = async page => { await tap(page, '[data-act="close"]', 2000); await page.waitForTimeout(900); };

// ---------------------------------------------------------------- title, slots, Create Your Hero
async function introState(page) {
  await page.waitForSelector('#qok-ui .variant-opt img', { timeout: 15000 }).catch(() => {});
  return page.evaluate(() => {
    const q = s => document.querySelector('#qok-ui ' + s), cs = e => getComputedStyle(e);
    const back = q('[data-act="introBack"]'), start = q('[data-act="introStart"]'), tag = q('.ngtag');
    const opts = [...document.querySelectorAll('#qok-ui [data-act="introVariant"]')].map(o => { const r = o.getBoundingClientRect(), i = o.querySelector('img'), ir = i && i.getBoundingClientRect(), c = cs(o);
      return { sel: o.classList.contains('sel'), h: Math.round(r.height), img: ir ? Math.round(ir.width) : 0, bw: parseFloat(c.borderTopWidth), bc: c.borderTopColor, bg: c.backgroundColor }; });
    return { back: back ? { cls: back.className, h: Math.round(back.getBoundingClientRect().height), bw: cs(back).borderTopWidth, bg: cs(back).backgroundColor } : null,
      opts, tag: tag ? tag.textContent : null, startBottom: start ? Math.round(start.getBoundingClientRect().bottom) : null, vh: innerHeight };
  });
}
async function title(page) {
  await page.goto(L.URL_, { waitUntil: 'domcontentloaded' }); await page.evaluate(() => localStorage.clear()); await page.reload({ waitUntil: 'load' });
  await L.toTitle(page); await page.waitForTimeout(1200);
  await taps(page, 'title');
  await tap(page, '[data-act="titleSlots"]'); await page.waitForTimeout(600);
  await taps(page, 'save slots', { need: 5 });
  await tap(page, '[data-act="slotPick"][data-i="1"]'); await page.waitForTimeout(1500);
  await page.waitForSelector('[data-act="introStart"]', { timeout: 15000 }).catch(() => {}); await page.waitForTimeout(600);
  await taps(page, 'Create Your Hero', { need: 5 });
  const a = await introState(page), alpha = c => { const p = rgb(c); return p ? p.a : 1; };
  await shot(page, 'UE-16-create-hero-en');
  rec('UE-16 Back on Create Your Hero is the standard outlined button (.btn .btn-slate)', !!a.back && /(^|\s)btn(\s|$)/.test(a.back.cls) && /btn-slate/.test(a.back.cls) && a.back.h >= MIN, a.back);
  const on = a.opts.filter(o => o.sel), off = a.opts.filter(o => !o.sel);
  rec('UE-16 Look choices: both sprites at least 80 px in a button at least 96 px tall', a.opts.length === 2 && a.opts.every(o => o.img >= 80 && o.h >= 96), a.opts.map(o => `${o.img}px in ${o.h}px`));
  rec('UE-16 Look choices: one is selected (2 px frame and a wash), the other is a thin faint frame with no fill',
    on.length === 1 && off.length === 1 && on[0].bw >= 2 && alpha(on[0].bg) > 0.05 && off[0].bw <= 1 && alpha(off[0].bc) <= 0.3 && alpha(off[0].bg) === 0, { on, off });
  await tap(page, '[data-act="introVariant"]:not(.sel)'); await page.waitForTimeout(700);
  const b = await introState(page);
  rec('UE-16 a finger tap on the other look moves the selected state to it', b.opts.length === 2 && a.opts[1] && !a.opts[1].sel && b.opts[1].sel && !b.opts[0].sel, b.opts.map(o => o.sel));
  rec('UE-16 a plain new game carries no New Game+ tag', a.tag === null, a.tag);
  rec('UE-16 Start Game is on the first screen at 390x844', a.startBottom !== null && a.startBottom <= a.vh, { startBottom: a.startBottom, vh: a.vh });
  await setVp(page, 375, 667); const c = await introState(page); await shot(page, 'UE-16-create-hero-en-375x667'); await setVp(page, 390, 844);
  rec('UE-16 Start Game is on the first screen at 375x667 too', c.startBottom !== null && c.startBottom <= c.vh, { startBottom: c.startBottom, vh: c.vh });
  // New Game+ path: a cleared slot (the seed the ui-screens check uses)
  const base = U.seed({ locale: 'en', mapId: 'overworld', x: 69, y: 256 }); base.playtime = 4000;
  const s2 = JSON.parse(JSON.stringify(base)); s2.player.name = 'Sora';
  const clear = { t: Date.now(), count: 1, ng: { inventory: [{ itemId: 'herb', quantity: 3 }], equipment: {}, gold: 900, heroName: 'Sora', heroColor: 'gray' } };
  await page.evaluate(([x, y, z]) => { localStorage.clear(); localStorage.setItem('edu-rpg-locale', 'en'); localStorage.setItem('qok-slots-v1', '1'); localStorage.setItem('qok-active-slot', '1');
    localStorage.setItem('edu-rpg-save', x); localStorage.setItem('qok-slot-1-save', x); localStorage.setItem('qok-slot-2-save', y); localStorage.setItem('qok-slot-2-clear', z); },
  [JSON.stringify(base), JSON.stringify(s2), JSON.stringify(clear)]);
  await page.reload({ waitUntil: 'load' }); await L.toTitle(page); await page.waitForTimeout(1200);
  await tap(page, '[data-act="titleSlots"]'); await page.waitForTimeout(600);
  await taps(page, 'save slots, two filled', { need: 5 });
  await tap(page, '[data-act="slotPick"][data-i="2"]'); await page.waitForTimeout(600);
  await taps(page, 'a cleared slot (load, New Game+, delete, back)', { need: 4 });
  await tap(page, '[data-act="slotNgPlus"]'); await page.waitForTimeout(1500);
  const n = await introState(page);
  await shot(page, 'UE-16-newgame-plus-en');
  rec('UE-16 the New Game+ setup says New Game+ under the heading', !!n.tag && /New Game\+/.test(n.tag) && n.opts.length === 2, { tag: n.tag });
}

// ---------------------------------------------------------------- field HUD, tab bars, menu tabs
const barStyle = (page, sel) => page.evaluate(sel => { const e = document.querySelector(sel); if (!e) return null; const c = getComputedStyle(e), i = e.querySelector('.tabic'), d = e.parentElement.querySelector('.newdot');
  return { font: c.fontFamily.split(',')[0].replace(/["']/g, '').trim(), size: c.fontSize, weight: c.fontWeight, color: c.color, icon: i ? getComputedStyle(i).color : null, dot: d ? getComputedStyle(d).backgroundColor : null,
    bar: getComputedStyle(e.parentElement).backgroundColor }; }, sel);
async function menu(page) {
  await U.boot(page, { locale: 'en', all: false, mapId: 'overworld', x: 69, y: 258, activeQuests: ['kikisChallenge', 'owlsLesson'],
    inventory: [{ itemId: 'herb', quantity: 5 }, { itemId: 'potion', quantity: 2 }, { itemId: 'ironSword', quantity: 1 }, { itemId: 'leatherArmor', quantity: 1 }] });
  await page.waitForTimeout(1200);
  await shot(page, 'UE-05-field-en');
  await taps(page, 'field HUD (tab bar, quests icon, map)', { need: 5 });
  // the folded states of the two HUD buttons, and the open quest list
  await page.locator('#qfh-map').tap(); await page.waitForTimeout(600);
  const folded = await page.evaluate(() => { const q = document.getElementById('qfh-quest'); if (q && !q.classList.contains('collapsed')) document.getElementById('qfh-quest-toggle').click(); return document.getElementById('qfh-map').classList.contains('collapsed'); });
  await page.waitForTimeout(500);
  await taps(page, `field HUD with the map folded (${folded}) and the quests folded`, { need: 5, only: /qfh-|\.ft/ });
  await page.locator('#qfh-map').tap(); await page.waitForTimeout(400);
  await page.evaluate(() => { const q = document.getElementById('qfh-quest'); if (q && q.classList.contains('collapsed')) document.getElementById('qfh-quest-toggle').click(); }); await page.waitForTimeout(500);
  await taps(page, 'field HUD with the quest list open (header and one row per quest)', { need: 3, only: /qfh-quest|qfq-/ });
  await page.evaluate(() => { const q = document.getElementById('qfh-quest'); if (q && !q.classList.contains('collapsed')) document.getElementById('qfh-quest-toggle').click(); }); await page.waitForTimeout(300);
  const chip = await page.evaluate(() => { const t = document.getElementById('qfhp-text'), b = t.parentElement; return { text: t.textContent, textW: Math.ceil(t.scrollWidth), boxW: Math.floor(b.clientWidth - 16) }; });
  const fb = await barStyle(page, '#fieldTabs .ft');
  await openTab(page, 0);
  const mb = await barStyle(page, '#qok-ui .tab:not(.on)');
  const lv = await page.evaluate(() => (document.querySelector('#qok-ui .topbar .lv') || {}).textContent || '');
  await shot(page, 'UE-05-menu-status-en');
  rec('UE-05 field and menu tab bars: same font, size, weight, label colour, icon colour and bar colour',
    !!fb && !!mb && /Zen Maru Gothic/.test(fb.font) && ['font', 'size', 'weight', 'color', 'icon', 'bar'].every(k => fb[k] === mb[k]), { field: fb, menu: mb });
  rec('UE-05 the "new gear" dot is one colour on both bars', !!fb && !!mb && !!fb.dot && fb.dot === mb.dot, { field: fb && fb.dot, menu: mb && mb.dot });
  rec('UE-21 the level reads the same on the field chip and in the menu ("Lv 50")', /^Lv \d+$/.test(lv.trim()) && chip.text.indexOf(lv.trim()) === 0, { field: chip.text, menu: lv });
  rec('UE-21 the field chip holds its text', chip.textW <= chip.boxW + 1, chip);
  await taps(page, 'Status tab', { need: 6 });
  await closeMenu(page); await openTab(page, 1);
  await taps(page, 'Items tab', { need: 7 });
  await closeMenu(page); await openTab(page, 2);
  await shot(page, 'UE-06-equip-en');
  await taps(page, 'Equip tab', { need: 12 });
  const eq = await page.evaluate(() => {
    const rows = [...document.querySelectorAll('#qok-ui [data-act="equipSlot"]')].map(r => r.getBoundingClientRect());
    const dots = [...document.querySelectorAll('#qok-ui .segcat .filterdot')].map(d => { const r = d.getBoundingClientRect(), i = d.parentElement.querySelector('svg').getBoundingClientRect();
      return Math.round(Math.hypot(r.left + r.width / 2 - i.right, r.top + r.height / 2 - i.top) * 10) / 10; });
    return { rows: rows.map(r => Math.round(r.height)), pitch: rows.slice(1).map((r, i) => Math.round(r.top - rows[i].top)), dots };
  });
  rec('UE-06 equip slot rows: five rows, each at least 48 px with at least 48 px pitch', eq.rows.length === 5 && eq.rows.every(h => h >= MIN) && eq.pitch.every(p => p >= MIN), eq);
  rec('UE-21 each "new" dot on the equipment filter sits on the corner of its icon (within 6 px)', eq.dots.length > 0 && eq.dots.every(d => d <= 6), { distancePx: eq.dots });
  await closeMenu(page); await openTab(page, 3);
  await shot(page, 'UE-17-settings-en');
  await taps(page, 'Settings tab', { need: 10 });
  const st = await page.evaluate(() => { const row = t => [...document.querySelectorAll('#qok-ui .setrow')].find(r => r.querySelector('#qok-volume') ? t === 'volume' : (t === 'sound' && /^Sound/.test(r.textContent.trim())));
    const icon = r => r ? (r.querySelector('.lab use') || { getAttribute: () => null }).getAttribute('href') : null;
    return { opts: [...document.querySelectorAll('#qok-ui [data-act="ctrlSide"]')].map(b => ({ t: b.textContent.trim(), side: b.getAttribute('data-side'), on: b.classList.contains('on') })), sound: icon(row('sound')), volume: icon(row('volume')) }; });
  // D01: the grade row
  const gradeRow = () => page.evaluate(() => { const r = [...document.querySelectorAll('#qok-ui .setrow')].find(x => /Quiz Difficulty/.test(x.textContent)); if (!r) return null; const c = getComputedStyle(r);
    return { text: r.textContent.trim(), act: r.getAttribute('data-act'), inAct: !!r.closest('[data-act]'), cursor: c.cursor, grade: window.__GAME_STATE__.player.state.quizDifficulty, menuIndex: window.__PHASER_GAME__.scene.getScene('MenuScene').listIndex }; });
  const g0 = await gradeRow();
  if (g0) { for (let k = 0; k < 3; k++) { await page.locator('#qok-ui .setrow', { hasText: 'Quiz Difficulty' }).first().tap({ timeout: 4000 }).catch(() => {}); await page.waitForTimeout(250); } }
  const g1 = await gradeRow();
  rec('D01 the grade row reads as information: no chevron, no tap action, no pointer', !!g0 && !/[›>]/.test(g0.text) && g0.act === null && !g0.inAct && g0.cursor !== 'pointer' && /Grade|Kindergarten/.test(g0.text), g0);
  rec('D01 three finger taps on it change nothing (grade and menu selection as before)', !!g0 && !!g1 && g1.grade === g0.grade && g1.menuIndex === g0.menuIndex && g1.text === g0.text, { before: g0 && [g0.grade, g0.menuIndex], after: g1 && [g1.grade, g1.menuIndex] });
  rec('UE-17 the joystick side has three options and each is a word', st.opts.length === 3 && st.opts.every(o => /^[A-Za-z]{3,}$/.test(o.t)), st.opts.map(o => o.t));
  rec('UE-17 Sound and Volume carry different icons', !!st.sound && !!st.volume && st.sound !== st.volume, { sound: st.sound, volume: st.volume });
  const side = () => page.evaluate(() => ({ body: ['left', 'center', 'right'].filter(s => document.body.classList.contains('ctrl-' + s)).join(','), saved: localStorage.getItem('eduControlOrientation'), on: (document.querySelector('#qok-ui [data-act="ctrlSide"].on') || { getAttribute: () => null }).getAttribute('data-side') }));
  const got = [];
  for (const s of ['left', 'center', 'right']) { await tap(page, `[data-act="ctrlSide"][data-side="${s}"]`, 2500); await page.waitForTimeout(500); got.push(await side()); }
  rec('UE-17 a finger tap on Left, Middle, Right puts the joystick on that side', got.length === 3 && ['left', 'center', 'right'].every((s, i) => got[i].body === s && got[i].saved === s && got[i].on === s), got);
  await tap(page, '[data-act="quitAsk"]'); await page.waitForTimeout(500);
  const quit = await page.evaluate(() => { const c = a => (document.querySelector(`#qok-ui [data-act="${a}"]`) || {}).className || ''; return { back: c('quitCancel'), go: c('quitConfirm') }; });
  await shot(page, 'UE-21-quit-en');
  await taps(page, 'Return to Title dialog', { need: 6 });
  rec('UE-21 quit dialog: Back is the outlined cancel, not the green confirm-and-spend button', /btn-slate/.test(quit.back) && !/btn-em/.test(quit.back) && !/btn-em/.test(quit.go), quit);
  await tap(page, '[data-act="quitCancel"]'); await page.waitForTimeout(300);
  await closeMenu(page);
  // UJ-04: the bundle's own "new quest" banner (direct: wm.showQuestNotification, the call a new quest makes)
  await page.evaluate(() => window.__PHASER_GAME__.scene.getScene('WorldMapScene').showQuestNotification('New quest: polish check')); await page.waitForTimeout(400);
  const ban = await page.evaluate(() => { const w = window.__PHASER_GAME__.scene.getScene('WorldMapScene'), t = document.getElementById('qok-town-quest-toast');
    return { canvasVisible: !!(w.questNotifText && w.questNotifText.scene && w.questNotifText.visible), toast: t ? t.textContent : null }; });
  await shot(page, 'UJ-04-field-quest-toast-en');
  rec('UJ-04 a new-quest banner on the field (direct: showQuestNotification) is the DOM toast, and the canvas text under the HUD is hidden', ban.canvasVisible === false && ban.toast === 'New quest: polish check', ban);
  // UJ-10: Japanese compass
  await U.boot(page, { locale: 'ja', all: false, mapId: 'overworld', x: 69, y: 258, inventory: [{ itemId: 'ironSword', quantity: 1 }, { itemId: 'leatherArmor', quantity: 1 }] }); await page.waitForTimeout(1000);
  const cp = await page.evaluate(() => [...document.querySelectorAll('#qfh-compass text')].filter(t => getComputedStyle(t).display !== 'none').map(t => t.textContent));
  await shot(page, 'UJ-10-compass-ja-kana');
  rec('UJ-10 ja-kana: the compass names north alone, in kana (きた and three empty marks), no Latin letters', cp.join('|') === 'きた|||', cp);
  const jb = await barStyle(page, '#fieldTabs .ft');
  rec('UE-05 ja-kana: the field tab bar is in the game font', !!jb && /Zen Maru Gothic/.test(jb.font), jb && jb.font);
  // UJ-09, UJ-11: the Equip tab in kana
  await openTab(page, 2);
  const je = await page.evaluate(() => { const pill = document.querySelector('#qok-ui .newpill'), n = pill && pill.closest('.n'), row = pill && pill.closest('[data-act]'), eb = document.querySelector('#qok-ui .eyebrow'), em = eb ? parseFloat(getComputedStyle(eb).letterSpacing) / parseFloat(getComputedStyle(eb).fontSize) : null;
    const pr = pill && pill.getBoundingClientRect(), rr = row && row.getBoundingClientRect();
    return { pill: pill ? pill.textContent : null, inside: !!pr && !!rr && pr.right <= rr.right - 4 && pr.left >= rr.left, nameLines: n ? Math.round(n.getBoundingClientRect().height / parseFloat(getComputedStyle(n).lineHeight)) : null, heading: eb ? eb.textContent : null, spacingEm: em === null ? null : +em.toFixed(3) }; });
  await shot(page, 'UJ-09-equip-ja-kana');
  rec('UJ-09 ja-kana: the "new gear" pill is Japanese and sits inside its row', !!je.pill && /^[\u3040-\u30ff\u4e00-\u9fff]+$/.test(je.pill) && je.inside, je);
  rec('UJ-11 ja-kana: the section heading is set tight (letter-spacing at most .1em), not spread like English capitals', je.spacingEm !== null && je.spacingEm <= 0.1, { heading: je.heading, spacingEm: je.spacingEm });
  await taps(page, 'Equip tab (ja-kana)', { need: 12 });
}

// ---------------------------------------------------------------- shop
const openShop = async page => { await page.evaluate(() => { const w = window.__PHASER_GAME__.scene.getScene('WorldMapScene'); w.scene.launch('ShopScene', { shopId: 'greenhollow' }); w.scene.pause(); }); await page.waitForTimeout(1300); };
async function shop(page) {
  for (const lang of ['en', 'ja-kana', 'ja-kanji']) {
    await U.boot(page, { ...U.LANGS[lang], all: false, mapId: 'overworld', x: 69, y: 258, inventory: [{ itemId: 'herb', quantity: 5 }, { itemId: 'potion', quantity: 2 }] });
    await openShop(page);
    if (!(await U.active(page, 'ShopScene'))) { rec(`${lang}: the shop opens (direct: scene.launch ShopScene)`, false); continue; }
    const h = await page.evaluate(() => {
      const n = document.querySelector('#qok-ui .topbar .nm'), g = document.querySelector('#qok-ui .topbar .lv'); if (!n || !g) return null;
      const box = n.getBoundingClientRect(), rg = document.createRange(); rg.selectNodeContents(n); const ink = rg.getBoundingClientRect(), gb = g.getBoundingClientRect();
      return { title: n.textContent, clipsY: getComputedStyle(n).overflowY !== 'visible', box: [+box.top.toFixed(1), +box.bottom.toFixed(1)], glyphs: [+ink.top.toFixed(1), +ink.bottom.toFixed(1)],
        greet: g.textContent.slice(0, 24), greetPx: parseFloat(getComputedStyle(g).fontSize), gap: +(gb.top - box.bottom).toFixed(1), greetCut: g.scrollWidth > g.clientWidth + 1 || g.scrollHeight > g.clientHeight + 1 };
    });
    await shot(page, `UE-04-shop-${lang}`);
    rec(`UE-04 ${lang}: the shop title's letters fit inside its line box (no clipped tails)`, !!h && !!h.title && (!h.clipsY || (h.glyphs[0] >= h.box[0] - 0.6 && h.glyphs[1] <= h.box[1] + 0.6)), h && { title: h.title, box: h.box, glyphs: h.glyphs });
    rec(`UE-04 ${lang}: the greeting is at least 13 px, at least 3 px under the title, and not cut`, !!h && h.greetPx >= 13 && h.gap >= 3 && !h.greetCut, h && { greet: h.greet, px: h.greetPx, gap: h.gap, cut: h.greetCut });
    const pr = await page.evaluate(fn => { const f = eval('(' + fn + ')'); const p = [...document.querySelectorAll('#qok-ui [data-act="shopBuy"] .pill')].filter(e => /\d+ G/.test(e.textContent));
      return p.slice(0, 3).map(e => ({ t: e.textContent, px: parseFloat(getComputedStyle(e).fontSize), ...f(e) })); }, CONTRAST.toString());
    rec(`UE-14 ${lang}: shop prices read (contrast at least 4.5:1, at least 13 px)`, pr.length > 0 && pr.every(x => x.ratio >= 4.5 && x.px >= 13), pr);
    if (lang !== 'en') continue;
    const exits = await page.evaluate(() => ({ x: !!document.querySelector('#qok-ui .xbtn[data-act="shopLeave"]'), tab: !!document.querySelector('#qok-ui .shopseg [data-act="shopLeave"]'), done: !!document.querySelector('#qok-ui button.btn[data-act="shopLeave"]') }));
    rec('UE-14 the shop keeps all three ways out (X, the Leave tab, Done)', exits.x && exits.tab && exits.done, exits);
    await taps(page, 'shop, buy list', { need: 8 });
    await tap(page, '[data-act="shopBuy"][data-i="0"]'); await page.waitForTimeout(600);
    await shot(page, 'UE-06-shop-confirm-en');
    await taps(page, 'shop, buy confirmation (minus, plus, Buy, Cancel)', { need: 4, only: /qtybtn|shopConfirmBuy|btn-slate\[shopCancel\]/ });
    await tap(page, '[data-act="shopQty"][data-d="1"]'); await page.waitForTimeout(400);
    const q = await page.evaluate(() => (document.querySelector('#qok-ui .qtyval') || {}).textContent);
    rec('UE-06 a finger tap on the plus button raises the quantity to 2', q === '2', q);
    await tap(page, 'button[data-act="shopCancel"]'); await page.waitForTimeout(400);
    await tap(page, '[data-act="shopMode"][data-mode="sell"]'); await page.waitForTimeout(600);
    const sp = await page.evaluate(fn => { const f = eval('(' + fn + ')'); return [...document.querySelectorAll('#qok-ui [data-act="shopSell"] .pill')].slice(0, 2).map(e => ({ t: e.textContent, ...f(e) })); }, CONTRAST.toString());
    rec('UE-14 en: sell prices read too (contrast at least 4.5:1)', sp.length > 0 && sp.every(x => x.ratio >= 4.5), sp);
    await taps(page, 'shop, sell list', { need: 5 });
  }
}

// ---------------------------------------------------------------- quests panel
const panel = page => page.evaluate(() => { const q = document.getElementById('qfh-quest'), c = document.getElementById('qfh-quest-content');
  if (!q) return null; const r = q.getBoundingClientRect(); return { collapsed: q.classList.contains('collapsed'), w: Math.round(r.width), h: Math.round(r.height), text: (c && !c.hidden && c.innerText || '').replace(/\s+/g, ' ').slice(0, 70) }; });
const startQuest = (page, id) => page.evaluate(id => { const gs = window.__GAME_STATE__, st = gs.player.state; try { gs.questManager.startQuest(id, st); } catch (e) {} if (!st.activeQuests.includes(id)) st.activeQuests.push(id); return st.activeQuests.slice(); }, id);
const endQuest = (page, id) => page.evaluate(id => { const st = window.__GAME_STATE__.player.state; st.activeQuests = st.activeQuests.filter(q => q !== id); if (!st.completedQuests.includes(id)) st.completedQuests.push(id); return st.activeQuests.slice(); }, id);
// Sample the panel until `ms` has passed; returns when it first matched `want` (ms from the start), or null.
async function until(page, want, ms) { const t0 = Date.now(); while (Date.now() - t0 < ms) { const p = await panel(page); if (p && p.collapsed === want) return Date.now() - t0; await page.waitForTimeout(150); } return null; }
async function quests(page, old) {
  await U.boot(page, { locale: 'en', all: false, mapId: 'overworld', x: 69, y: 258, activeQuests: ['kikisChallenge'] }, { extra: old ? { 'qok-quests-fold': '0' } : {} });
  await page.waitForTimeout(1200);
  const p0 = await panel(page);
  if (old) {
    await shot(page, 'UE-03-switch-off-en');
    rec('UE-03 switch qok-quests-fold=0: with an active quest the panel is open on arrival, as before', !!p0 && !p0.collapsed && /Kiki/.test(p0.text), p0);
    await startQuest(page, 'owlsLesson'); await page.waitForTimeout(6000);
    const p1 = await panel(page);
    rec('UE-03 switch qok-quests-fold=0: a new quest leaves it open (no four-second fold)', !!p1 && !p1.collapsed, p1);
    return;
  }
  await shot(page, 'UE-03-arrival-folded-en');
  rec('UE-03 on arrival with an active quest the panel is folded to its icon', !!p0 && p0.collapsed && p0.w <= 60 && p0.h <= 60, p0);
  await page.locator('#qfh-quest-toggle').tap(); await page.waitForTimeout(600);
  const p1 = await panel(page);
  rec('UE-03 a finger tap on the icon opens it', !!p1 && !p1.collapsed && /Kiki/.test(p1.text), p1);
  await page.waitForTimeout(5500);
  const p2 = await panel(page);
  rec('UE-03 opened by hand it stays open (5.5 s later)', !!p2 && !p2.collapsed, p2);
  await startQuest(page, 'owlsLesson'); await page.waitForTimeout(5500);
  const p3 = await panel(page);
  rec('UE-03 ...and a new quest does not fold a panel the player opened', !!p3 && !p3.collapsed, p3);
  await page.locator('#qfh-quest-toggle').tap(); await page.waitForTimeout(600);
  const p4 = await panel(page);
  rec('UE-03 a finger tap on the header folds it', !!p4 && p4.collapsed, p4);
  // added: opens by itself, shows the new quest, folds after about four seconds
  await startQuest(page, 'gordosOre');
  const o1 = await until(page, false, 2000); const s1 = await panel(page); await shot(page, 'UE-03-new-quest-peek-en');
  const c1 = o1 === null ? null : await until(page, true, 7000);
  rec('UE-03 a quest is added (direct: questManager.startQuest): the folded panel opens by itself within 1 s', o1 !== null && o1 <= 1000 && !!s1 && !s1.collapsed, { openedAfterMs: o1, panel: s1 });
  rec('UE-03 ...and folds again after about four seconds (3 to 5.5 s)', c1 !== null && c1 >= 2800 && c1 <= 5500, { foldedAfterMs: c1 });
  // ended, others remain: same
  await endQuest(page, 'owlsLesson');
  const o2 = await until(page, false, 2000); const c2 = o2 === null ? null : await until(page, true, 7000);
  rec('UE-03 a quest ends and others remain (direct: moved to completedQuests): the panel opens within 1 s and folds after about four seconds', o2 !== null && o2 <= 1000 && c2 !== null && c2 >= 2800 && c2 <= 5500, { openedAfterMs: o2, foldedAfterMs: c2 });
  // a tap during the peek is the player's: it folds at once and stays folded
  await startQuest(page, 'lunasMap'); const o3 = await until(page, false, 2000);
  await page.locator('#qfh-quest-toggle').tap(); await page.waitForTimeout(500);
  const p5 = await panel(page);
  rec('UE-03 a tap on the header during the four seconds folds it at once', o3 !== null && !!p5 && p5.collapsed, { openedAfterMs: o3, panel: p5 });
  // kana: the same rule, and the list itself in Japanese
  await U.boot(page, { locale: 'ja', all: false, mapId: 'overworld', x: 69, y: 258, activeQuests: ['kikisChallenge'] }); await page.waitForTimeout(1200);
  const k0 = await panel(page); await shot(page, 'UE-03-arrival-folded-ja-kana');
  await startQuest(page, 'gordosOre'); const ko = await until(page, false, 2000); await page.waitForTimeout(350); const k1 = await panel(page); await shot(page, 'UE-03-new-quest-peek-ja-kana');
  rec('UE-03 ja-kana: folded on arrival, and a new quest opens the list in Japanese', !!k0 && k0.collapsed && ko !== null && !!k1 && !k1.collapsed && /[\u3040-\u30ff]/.test(k1.text) && !/[A-Za-z]{3,}/.test(k1.text), { arrival: k0, openedAfterMs: ko, panel: k1 });
}

// ---------------------------------------------------------------- defeat screen
const defeatState = page => page.evaluate(() => {
  const q = s => document.querySelector('#qok-ui ' + s), R = e => e ? e.getBoundingClientRect() : null;
  const head = R(q('.go-head')), acts = R(q('.go-actions')), title = q('.go-title'), img = q('.go-rest img');
  const notes = [...document.querySelectorAll('#qok-ui .go-note')].map(n => ({ px: parseFloat(getComputedStyle(n).fontSize), color: getComputedStyle(n).color, lines: Math.round(n.getBoundingClientRect().height / parseFloat(getComputedStyle(n).lineHeight)) }));
  return { skull: !!q('.go-skull'), hero: !!img && img.naturalWidth > 0, heart: !!q('.go-heart'), titleText: title ? title.textContent : null, titleColor: title ? getComputedStyle(title).color : null, notes,
    order: [...document.querySelectorAll('#qok-ui .go-actions [data-act]')].map(b => b.getAttribute('data-act')),
    top: head ? Math.round(head.top) : null, bottom: acts ? Math.round(acts.bottom) : null, vh: innerHeight, vw: innerWidth,
    wide: [...document.querySelectorAll('#qok-ui .go-screen *')].filter(e => { const r = e.getBoundingClientRect(); return r.width && (r.left < -0.5 || r.right > innerWidth + 0.5); }).length };
});
const lose = async page => { await page.evaluate(() => window.__PHASER_GAME__.scene.getScene('WorldMapScene').scene.start('GameOverScene')); await page.waitForTimeout(1600); };
async function defeat(page) {
  for (const lang of ['en', 'ja-kana']) {
    await U.boot(page, { ...U.LANGS[lang], all: false, mapId: 'overworld', x: 69, y: 258 });
    // this seeded save has never arrived in a town, so it is also the "no town on record" case (D04)
    const rec0 = await page.evaluate(() => { const st = window.__GAME_STATE__.player.state; st.hp = 1; return { town: localStorage.getItem('qok-slot-' + (localStorage.getItem('qok-active-slot') || '1') + '-town'), gold: st.gold }; });
    await lose(page);
    if (!(await U.active(page, 'GameOverScene'))) { rec(`${lang}: the defeat screen opens (direct: scene.start GameOverScene)`, false); continue; }
    const d = await defeatState(page), c = rgb(d.titleColor) || { r: 0, g: 0, b: 0 };
    await shot(page, `UE-07-defeat-${lang}`);
    rec(`UE-07 ${lang}: no skull; the hero and a heart instead`, !d.skull && d.hero && d.heart, { skull: d.skull, hero: d.hero, heart: d.heart });
    rec(`UE-07 ${lang}: the title is a warm light colour, not the dull red`, c.r >= 200 && c.g >= 170 && c.b >= 100 && c.b <= c.g - 30, { title: d.titleText, color: d.titleColor });
    rec(`UE-07 ${lang}: the notes under the buttons are at least 16 px and light`, d.notes.length >= 1 && d.notes.every(n => n.px >= 16 && (rgb(n.color) || { r: 0 }).r >= 190), d.notes);
    rec(`UE-07 ${lang}: the same buttons in the same order (return to town, title screen)`, d.order.join(',') === 'defeatTown,defeatTitle', d.order);
    const mid = (d.top + d.bottom) / 2;
    rec(`UE-07 ${lang}: the block is centred on the screen (within 4% of its height) and inside it`, d.top >= 0 && d.bottom <= d.vh && Math.abs(mid - d.vh / 2) <= d.vh * 0.04 && d.wide === 0, { top: d.top, bottom: d.bottom, vh: d.vh, offCentre: Math.round(mid - d.vh / 2) });
    await taps(page, `defeat screen (${lang})`, { need: 2 });
    await setVp(page, 375, 667); const s = await defeatState(page); await shot(page, `UE-07-defeat-${lang}-375x667`); await setVp(page, 390, 844);
    rec(`UE-07 ${lang}: at 375x667 the whole block is on screen`, s.top >= 0 && s.bottom <= s.vh && s.wide === 0, { top: s.top, bottom: s.bottom, vh: s.vh });
    if (lang === 'en') {
      const town = await page.evaluate(() => { const b = document.querySelector('#qok-ui [data-act="defeatTown"]'); return b ? b.textContent : null; });
      await tap(page, '[data-act="defeatTown"]');
      await page.waitForFunction(() => { const g = window.__PHASER_GAME__, w = g.scene.getScene('WorldMapScene'); return g.scene.isActive('WorldMapScene') && !g.scene.isActive('GameOverScene') && w && w.hero; }, { timeout: 60000 }).catch(() => {});
      await page.waitForTimeout(2500);
      const back = await page.evaluate(() => { const g = window.__PHASER_GAME__, w = g.scene.getScene('WorldMapScene'), st = window.__GAME_STATE__.player.state; return { world: g.scene.isActive('WorldMapScene'), over: g.scene.isActive('GameOverScene'), map: w && w.currentMapId, gold: st.gold, hp: st.hp, maxHp: st.maxHp }; });
      await shot(page, 'D04-after-defeat-no-town-record-en');
      rec('UE-07 en: a finger tap on the first button still closes the screen and returns to the world', back.world && !back.over, { button: town, ...back });
      rec('D04 en: with no town on record the button names Greenhollow, and the tap lands there with full HP and half the gold', rec0.town === null && /Greenhollow/.test(town || '') && back.map === 'greenhollow' && back.gold === Math.ceil(rec0.gold / 2) && back.hp === back.maxHp && back.hp > 1,
        { townOnRecord: rec0.town, button: town, map: back.map, gold: [rec0.gold, back.gold], hp: [1, back.hp, back.maxHp] });
    }
  }
  // the boss variant has a third button and a second note (direct: defeatInfo() is made to say "boss", which is what a lost boss fight records)
  for (const lang of ['en', 'ja-kana']) {
    await U.boot(page, { ...U.LANGS[lang], all: false, mapId: 'overworld', x: 69, y: 258 });
    await page.evaluate(() => { const SV = window.__QOK_SAVES__, o = SV.defeatInfo.bind(SV); SV.defeatInfo = () => Object.assign({}, o(), { boss: true }); });
    await lose(page);
    const d = await defeatState(page); await shot(page, `UE-07-defeat-boss-${lang}`);
    await setVp(page, 375, 667); const s = await defeatState(page); await shot(page, `UE-07-defeat-boss-${lang}-375x667`); await setVp(page, 390, 844);
    rec(`UE-07 ${lang}: boss variant: three buttons in the same order, 16 px notes, hero and heart, on screen at both sizes`,
      d.order.join(',') === 'defeatBoss,defeatTown,defeatTitle' && !d.skull && d.hero && d.heart && d.notes.length === 2 && d.notes.every(n => n.px >= 16) && d.top >= 0 && d.bottom <= d.vh && s.top >= 0 && s.bottom <= s.vh && d.wide === 0 && s.wide === 0,
      { order: d.order, notes: d.notes.map(n => n.px + 'px x' + n.lines), at844: [d.top, d.bottom], at667: [s.top, s.bottom] });
    await taps(page, `defeat screen, boss variant (${lang})`, { need: 3 });
  }
  await U.boot(page, { locale: 'en', all: false, mapId: 'overworld', x: 69, y: 258 }, { extra: { 'qok-defeat-gentle': '0' } });
  await lose(page);
  const o = await defeatState(page), oc = rgb(o.titleColor) || { r: 0, g: 0, b: 0 };
  await shot(page, 'UE-07-switch-off-en');
  rec('UE-07 switch qok-defeat-gentle=0: the old screen returns (skull, red title, no hero)', o.skull && !o.heart && oc.r > oc.g + 40 && o.order.join(',') === 'defeatTown,defeatTitle', { skull: o.skull, heart: o.heart, color: o.titleColor });
}

// ---------------------------------------------------------------- the two interact pills
async function town(page) {
  const { Session, door } = require('../../acts/probe/playthrough/ptlib.cjs');
  const S = new Session('ui-polish'); S.page = page; S.errors = []; S.ev = (f, a) => page.evaluate(f, a); S.st = () => page.evaluate(() => window.__PTH.state());
  const d = door('greenhollow');
  await U.boot(page, { locale: 'en', all: false, mapId: 'overworld', x: d.exit[0], y: d.exit[1], activeQuests: ['kikisChallenge'] });
  await S.inject();
  if (!(await S.enterTown('greenhollow'))) return rec('town: reached Greenhollow by walking in', false);
  // UE-11 is not asserted here (the town page and its camera are another track's); the numbers are printed for the record
  const arr = await page.evaluate(() => { const f = document.querySelector('#act1-hifi-preserved-root iframe'), T = f.contentWindow.__ACT1_TOWN__, p = T.position(), c = T.camera, pad = f.contentDocument.querySelector('#pad'), pr = pad && pad.getBoundingClientRect(), tabs = document.getElementById('fieldTabs').getBoundingClientRect();
    return { heroFeet: [Math.round((p.x - c.x) * c.zoom), Math.round((p.y - c.y) * c.zoom)], stick: pr ? [Math.round(pr.left), Math.round(pr.top), Math.round(pr.right), Math.round(pr.bottom)] : null, tabBarTop: Math.round(tabs.top), zoom: c.zoom }; }).catch(e => ({ error: String(e) }));
  console.log('[INFO] UE-11 town arrival (Greenhollow, measured, not judged): ' + JSON.stringify(arr));
  await shot(page, 'UE-11-town-arrival-en');
  const g = await page.evaluate(() => window.__PTH.walkToNpc('elder')); await page.waitForTimeout(900);
  const pill = () => page.evaluate(() => { const f = document.querySelector('#act1-hifi-preserved-root iframe'), p = f && f.contentDocument.querySelector('#prompt'); if (!p) return null;
    const r = p.getBoundingClientRect(), fr = f.getBoundingClientRect(), pad = f.contentDocument.querySelector('#pad'), pr = pad ? pad.getBoundingClientRect() : null;
    return { text: p.textContent, show: p.dataset.show, w: Math.round(r.width), h: Math.round(r.height * 10) / 10, bottom: Math.round(r.bottom), padTop: pr ? Math.round(pr.top) : null, frameH: Math.round(fr.height) }; });
  const p = await pill();
  await shot(page, 'UE-06-talk-pill-en');
  rec('UE-06 the town Talk pill next to the elder is at least 48 px tall and at least 48 px wide', !!p && p.show === 'true' && p.h >= MIN - 0.5 && p.w >= MIN, { walk: g && g.why, pill: p });
  rec('UE-06 ...and still sits clear above the joystick', !!p && p.padTop !== null && p.bottom <= p.padTop, p && { pillBottom: p.bottom, stickTop: p.padTop });
  await page.evaluate(() => window.__PTH.pressTalk()); await page.waitForTimeout(1300);
  const talk = await page.evaluate(() => !!window.__PHASER_GAME__.scene.getScene('WorldMapScene').showingMessage);
  rec('UE-06 the elder still answers (the pill\'s action is untouched)', talk, { showingMessage: talk });
  // healer (UJ-12): the price reads, and its two buttons are full size
  await S.dismissAll(); await page.evaluate(() => { const s = window.__GAME_STATE__.player.state; s.hp = Math.floor(s.maxHp / 3); });
  await page.evaluate(() => window.__PTH.walkToNpc('healer')); await page.waitForTimeout(600); await page.evaluate(() => window.__PTH.pressTalk()); await page.waitForTimeout(1500);
  const ho = await page.evaluate(() => !!window.__PHASER_GAME__.scene.getScene('WorldMapScene').healerOverlayOpen);
  if (!ho) return rec('town: the healer\'s card opens (walked up, pressed Talk)', false);
  const hp = await page.evaluate(fn => { const f = eval('(' + fn + ')'); const e = [...document.querySelectorAll('#qok-ui .heal-wrap .panel span')].find(x => /\d+ G$/.test(x.textContent)); return e ? { t: e.textContent, ...f(e) } : null; }, CONTRAST.toString());
  await shot(page, 'UJ-12-healer-en');
  rec('UJ-12 the healer\'s price reads (contrast at least 4.5:1)', !!hp && hp.ratio >= 4.5, hp);
  await taps(page, 'healer card', { need: 2, only: /heal/ });
}
async function dungeon(page) {
  await U.boot(page, { locale: 'en', mapId: 'sunkenCellar', floor: 1, x: 19, y: 17 }); await page.waitForTimeout(1200);
  // the pill is up only while she stands next to the thing (a bump opens the chest and hides it), so it is
  // sampled every frame during the walk; the smallest box seen while it is shown is what gets judged
  await page.evaluate(() => { const S = window.__pillSeen = { n: 0, w: 1e9, h: 1e9, text: '' }; (function f() { const e = document.getElementById('a1mInteract');
    if (e && e.classList.contains('a1m-show')) { const r = e.getBoundingClientRect(); if (r.width && r.height) { S.n++; S.w = Math.min(S.w, r.width); S.h = Math.min(S.h, r.height); S.text = e.textContent; } } requestAnimationFrame(f); })(); });
  let p = null;
  for (let i = 0; i < 10 && !(p && p.n); i++) { await L.stick(page, 0, -1, 220); await page.waitForTimeout(300); p = await page.evaluate(() => window.__pillSeen); }
  await shot(page, 'UE-06-dungeon-pill-en');
  rec('UE-06 the dungeon interact pill (walked up to a chest in Sunken Cellar 1F) is at least 48 px tall and wide', !!p && p.n > 0 && p.h >= MIN - 0.5 && p.w >= MIN, p && { framesShown: p.n, text: p.text, w: Math.round(p.w), h: Math.round(p.h * 10) / 10 });
}

// ---------------------------------------------------------------- Japanese strings of the text track
const WORDS = {
  'ja-kana': { compass: 'きた|||', open: 'クエストを ひらく', close: 'クエストを とじる', loading: 'クエストを よみこんでいます…', unavailable: 'クエストを ひょうじできません',
    done: 'クエスト かんりょう', received: 'ほうしゅうを うけとった', go: 'ぼうけんを つづける', quit: 'タイトルへ もどりますか？', over: 'さいしょから はじめる？', overBody: 'セーブした ぼうけんは きえます。' },
  'ja-kanji': { compass: '北|南|東|西', open: 'クエストを 開く', close: 'クエストを 閉じる', loading: 'クエストを 読み込んでいます…', unavailable: 'クエストを 表示できません',
    done: 'クエスト 完了', received: '報酬を 受け取った', go: '冒険を 続ける', quit: 'タイトルへ 戻りますか？', over: '最初から 始める？', overBody: 'セーブした 冒険は 消えます。' },
};
async function words(page) {
  await U.boot(page, { locale: 'en', all: false, mapId: 'overworld', x: 69, y: 258 }); await page.waitForTimeout(900);
  const en = await page.evaluate(() => [...document.querySelectorAll('#qfh-compass text')].map(t => t.textContent).join('|'));
  rec('words en: the compass still reads N S E W', en === 'N|S|E|W', en);
  for (const lang of ['ja-kana', 'ja-kanji']) {
    const W = WORDS[lang];
    await U.boot(page, { ...U.LANGS[lang], all: false, mapId: 'overworld', x: 69, y: 258, activeQuests: ['kikisChallenge'] }); await page.waitForTimeout(1000);
    const layer = await page.evaluate(() => !!window.__QOK_WORDS__);
    const cp = await page.evaluate(() => [...document.querySelectorAll('#qfh-compass text')].map(t => t.textContent).join('|'));
    await shot(page, `words-compass-${lang}`);
    rec(`words ${lang}: compass dial (order N S E W) reads ${W.compass}`, cp === W.compass, { dial: cp, textLayerLoaded: layer });
    const aria = () => page.evaluate(() => document.getElementById('qfh-quest-toggle').getAttribute('aria-label'));
    const a0 = await aria(); await page.locator('#qfh-quest-toggle').tap(); await page.waitForTimeout(500); const a1 = await aria();
    rec(`words ${lang}: the quest chip's aria-label, folded then open`, a0 === W.open && a1 === W.close, { folded: a0, open: a1 });
    // the list's two waiting lines (direct: the quest manager's list call is taken away, then made to throw, then put back)
    const wait = async how => { await page.evaluate(how => { const q = window.__GAME_STATE__.questManager; q.getActiveQuests = how === 'none' ? null : () => { throw new Error('polish check'); }; }, how); await page.waitForTimeout(500);
      return page.evaluate(() => (document.querySelector('#qfh-quest-content .qfq-state') || {}).textContent || null); };
    const l1 = await wait('none'), l2 = await wait('throw');
    await page.evaluate(() => { delete window.__GAME_STATE__.questManager.getActiveQuests; }); await page.waitForTimeout(400);
    rec(`words ${lang}: quest list "loading" and "cannot show" lines (direct)`, l1 === W.loading && l2 === W.unavailable, { loading: l1, unavailable: l2 });
    // the quest card (direct: showQuestCompleteNotification, the call a finished quest makes)
    await page.evaluate(() => window.__PHASER_GAME__.scene.getScene('WorldMapScene').showQuestCompleteNotification(document.querySelector('#qfh-quest-content .qfq-title span').textContent, { gold: 50, exp: 30 })); await page.waitForTimeout(700);
    const card = await page.evaluate(() => { const c = document.getElementById('qok-quest-completion'), t = s => (c.querySelector(s) || {}).textContent; return c && !c.hidden ? { done: t('#qqc-heading'), received: t('.qqc-received'), go: t('.qqc-dismiss') } : null; });
    await shot(page, `words-quest-card-${lang}`);
    rec(`words ${lang}: quest card heading, reward line and button`, !!card && card.done === W.done && card.received === W.received && card.go === W.go, card);
    await taps(page, `quest card (${lang})`, { need: 1, only: /qqc-/ });
    await page.locator('#qok-quest-completion .qqc-dismiss').tap(); await page.waitForTimeout(500);
    // the quit question
    await openTab(page, 3); await tap(page, '[data-act="quitAsk"]'); await page.waitForTimeout(500);
    const quit = await page.evaluate(() => document.getElementById('qok-ui').innerText);
    await shot(page, `words-quit-${lang}`);
    rec(`words ${lang}: the quit question reads "${W.quit}"`, quit.indexOf(W.quit) >= 0, quit.replace(/\s+/g, ' ').slice(0, 90));
    await tap(page, '[data-act="quitCancel"]'); await page.waitForTimeout(300); await closeMenu(page);
    // start over: the dialog that guards New Game over a save. With save slots, Start goes to the slot list, so
    // this dialog opens from a keyboard only (New Game selected, Enter); that is the path taken here.
    await page.reload({ waitUntil: 'load' }); await L.toTitle(page); await page.waitForTimeout(1200);
    let so = null;
    for (let i = 0; i < 4 && !so; i++) {
      await page.evaluate(() => { const ts = window.__PHASER_GAME__.scene.getScene('TitleScene'), it = ts.menuItems || []; for (let k = 0; k < it.length; k++) if (it[k].getData && it[k].getData('action') === 'new') ts.selectedIndex = k; });
      await page.keyboard.press('Enter'); await page.waitForTimeout(600);
      so = await page.evaluate(() => { const b = document.querySelector('#qok-ui [data-act="titleNewConfirm"]'); return b ? document.getElementById('qok-ui').innerText : null; });
    }
    await shot(page, `words-start-over-${lang}`);
    rec(`words ${lang}: the start-over dialog (direct: New Game selected, Enter key) asks "${W.over}" and says "${W.overBody}"`, !!so && so.indexOf(W.over) >= 0 && so.indexOf(W.overBody) >= 0, so ? so.replace(/\s+/g, ' ').slice(0, 120) : 'dialog did not open');
    if (so) { await taps(page, `start-over dialog (${lang})`, { need: 2, only: /titleNew/ }); await tap(page, 'button[data-act="titleNewCancel"]'); await page.waitForTimeout(300); }
  }
}

// ---------------------------------------------------------------- first launch language (Q01)
// A fresh browser profile per case: its own context with the device language set, nothing stored but what the case stores.
async function firstLang(browser) {
  const titleOf = async (locale, stored) => {
    const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, hasTouch: true, isMobile: true, locale });
    await ctx.addInitScript(() => { window.Capacitor = { isNativePlatform: () => true }; });
    if (stored) await ctx.addInitScript(kv => { for (const k in kv) if (localStorage.getItem(k) === null) localStorage.setItem(k, kv[k]); }, stored);
    ctx.setDefaultTimeout(120000);
    const page = await ctx.newPage();
    const read = async () => { await L.toTitle(page); await page.waitForSelector('#qok-ui [data-act="titleLang"] .on', { timeout: 60000 }).catch(() => {}); await page.waitForTimeout(600);
      return page.evaluate(() => ({ on: (document.querySelector('#qok-ui [data-act="titleLang"] .on') || {}).textContent || null, start: ((document.querySelector('#qok-ui .t-actions .btn') || {}).textContent || '').trim(), stored: localStorage.getItem('edu-rpg-locale'), device: navigator.language, ruleRan: window.__QOK_FIRST_LANG__ !== undefined })); };
    await page.goto(L.URL_, { waitUntil: 'load' });
    return { ctx, page, read, first: await read() };
  };
  const en = await titleOf('en-US');
  await shot(en.page, 'Q01-first-launch-en-US');
  rec('Q01 fresh profile, device en-US: the title is English, set before the game read its language', en.first.on === 'English' && en.first.start === 'Start' && en.first.stored === 'en' && en.first.ruleRan, en.first);
  // the toggle still works, and what the player picked is kept on the next launch
  await tap(en.page, '[data-act="titleLang"]'); await en.page.waitForTimeout(900);
  const flipped = await en.page.evaluate(() => ({ on: (document.querySelector('#qok-ui [data-act="titleLang"] .on') || {}).textContent, stored: localStorage.getItem('edu-rpg-locale') }));
  await en.page.reload({ waitUntil: 'load' }); const again = await en.read();
  rec('Q01 the title toggle still switches, and the choice is kept on the next launch (device en-US, chose Japanese)', flipped.on === '日本語' && flipped.stored === 'ja' && again.on === '日本語' && again.stored === 'ja', { afterTap: flipped, nextLaunch: again });
  await en.ctx.close();
  const ja = await titleOf('ja-JP');
  await shot(ja.page, 'Q01-first-launch-ja-JP');
  rec('Q01 fresh profile, device ja-JP: the title is Japanese', ja.first.on === '日本語' && /はじめる|始める/.test(ja.first.start) && ja.first.stored === 'ja' && ja.first.ruleRan, ja.first);
  await ja.ctx.close();
  const keptJa = await titleOf('en-US', { 'edu-rpg-locale': 'ja' });
  rec('Q01 a stored choice wins: stored Japanese on an en-US device stays Japanese', keptJa.first.on === '日本語' && keptJa.first.stored === 'ja' && !keptJa.first.ruleRan, keptJa.first);
  await keptJa.ctx.close();
  const keptEn = await titleOf('ja-JP', { 'edu-rpg-locale': 'en' });
  rec('Q01 a stored choice wins: stored English on a ja-JP device stays English', keptEn.first.on === 'English' && keptEn.first.stored === 'en', keptEn.first);
  await keptEn.ctx.close();
  const off = await titleOf('en-US', { 'qok-first-lang': '0' });
  // the old behaviour on an English device: the game starts in its default (Japanese) and hero-override.js toggles the title to English once it is up
  rec('Q01 switch qok-first-lang=0: the new rule does not run (the older toggle in hero-override.js still turns an en-US title English)', !off.first.ruleRan && off.first.on === 'English', off.first);
  await off.ctx.close();
  const offJa = await titleOf('ja-JP', { 'qok-first-lang': '0' });
  rec('Q01 switch qok-first-lang=0 on a ja-JP device: the bundle default, Japanese, nothing stored', !offJa.first.ruleRan && offJa.first.on === '日本語' && offJa.first.stored === null, offJa.first);
  await offJa.ctx.close(); return;
  await off.ctx.close();
}

// ---------------------------------------------------------------- U2: the day 4 switch and follow-ups from the review
// d4off: localStorage qok-d4-ui=0 gives the look and behaviour of the tree before day 4 for the menu and HUD changes that had no
// switch of their own (U2-2). The battle half of the same switch is the d4off group of battle-stage.cjs.
async function d4off(page) {
  await U.boot(page, { locale: 'en', all: false, mapId: 'overworld', x: 69, y: 258, activeQuests: ['kikisChallenge'],
    inventory: [{ itemId: 'herb', quantity: 5 }, { itemId: 'ironSword', quantity: 1 }] }, { extra: { 'qok-d4-ui': '0' } });
  await page.waitForTimeout(1200);
  const root = await page.evaluate(() => ({ cls: document.documentElement.classList.contains('qok-d4off'), flag: window.__QOK_D4_UI__ }));
  rec('d4off: qok-d4-ui=0 puts the root class on <html> and turns the JS flag off', root.cls === true && root.flag === false, root);
  const fb = await barStyle(page, '#fieldTabs .ft');
  const hud = await page.evaluate(() => { const q = document.getElementById('qfh-quest'), r = q && q.getBoundingClientRect(); return { chip: document.getElementById('qfhp-text').textContent, quest: r ? [Math.round(r.width), Math.round(r.height)] : null, collapsed: !!q && q.classList.contains('collapsed') }; });
  await shot(page, 'd4off-field');
  rec('d4off tab-bar font: the field tab bar is in the system face again, not the game font', !!fb && !/Zen Maru Gothic/.test(fb.font), fb);
  rec('d4off field HUD: the chip reads "Lv5" with no space, and the folded quest icon is 44 px (48 px targets off)', /^Lv\d/.test(hud.chip) && hud.collapsed && !!hud.quest && hud.quest[0] === 44 && hud.quest[1] === 44, hud);
  await page.evaluate(() => window.__PHASER_GAME__.scene.getScene('WorldMapScene').showQuestNotification('New quest: polish check')); await page.waitForTimeout(400);
  const ban = await page.evaluate(() => { const w = window.__PHASER_GAME__.scene.getScene('WorldMapScene'), t = document.getElementById('qok-town-quest-toast');
    return { canvasVisible: !!(w.questNotifText && w.questNotifText.scene && w.questNotifText.visible), toast: t ? t.textContent : null }; });
  rec('d4off quest banner: on the field it is the canvas banner again, with no DOM toast', ban.canvasVisible === true && ban.toast === null, ban);
  await page.waitForTimeout(3200);
  await openTab(page, 2);
  const eq = await page.evaluate(() => ({ rows: [...document.querySelectorAll('#qok-ui [data-act="equipSlot"]')].map(r => Math.round(r.getBoundingClientRect().height)), eqslot: document.querySelectorAll('#qok-ui .eqslot').length,
    close: Math.round((document.querySelector('#qok-ui [data-act="close"]') || document.body).getBoundingClientRect().width) }));
  await shot(page, 'd4off-equip');
  rec('d4off 48 px targets: the five equip slot rows are under 36 px again and the close button is 40 px', eq.rows.length === 5 && eq.rows.every(h => h < 36) && eq.eqslot === 0 && eq.close === 40, eq);
  await closeMenu(page); await openTab(page, 3);
  const st = await page.evaluate(() => { const rows = [...document.querySelectorAll('#qok-ui .setrow')], g = rows.find(x => /Quiz Difficulty/.test(x.textContent)), c = rows.find(x => /Controls/.test(x.textContent)), v = rows.find(x => x.querySelector('#qok-volume'));
    return { grade: g ? { text: g.textContent.trim(), act: g.getAttribute('data-act'), info: g.classList.contains('info') } : null,
      ctrl: c ? { words: c.querySelectorAll('[data-act="ctrlSide"]').length, glyphs: [...c.querySelectorAll('.seg b')].map(b => b.textContent).join('') } : null, volume: v ? (v.querySelector('.lab use') || { getAttribute: () => null }).getAttribute('href') : null }; });
  await shot(page, 'd4off-settings');
  rec('d4off grade row: it is a tappable row with its chevron again', !!st.grade && st.grade.act === 'setting' && /›/.test(st.grade.text) && !st.grade.info, st.grade);
  rec('d4off joystick: the three glyphs again, no word buttons, and Volume carries the speaker', !!st.ctrl && st.ctrl.words === 0 && st.ctrl.glyphs === '◀●▶' && /speaker$/.test(st.volume || ''), { ctrl: st.ctrl, volume: st.volume });
  await tap(page, '[data-act="quitAsk"]'); await page.waitForTimeout(500);
  const quit = await page.evaluate(() => { const c = a => (document.querySelector(`#qok-ui [data-act="${a}"]`) || {}).className || ''; return { back: c('quitCancel'), go: c('quitConfirm') }; });
  await shot(page, 'd4off-quit');
  rec('d4off quit dialog colours: Back is the green button and Title Screen the outlined one, as before day 4', /btn-em/.test(quit.back) && /btn-slate/.test(quit.go) && !/btn-gold/.test(quit.go), quit);
  await tap(page, '[data-act="quitCancel"]'); await page.waitForTimeout(300);
  await closeMenu(page);
  await openShop(page);
  const pr = await page.evaluate(() => [...document.querySelectorAll('#qok-ui [data-act="shopBuy"] .pill')].filter(e => /\d+ G/.test(e.textContent)).slice(0, 3).map(e => ({ t: e.textContent, cls: e.className, color: getComputedStyle(e).color })));
  await shot(page, 'd4off-shop');
  rec('d4off price pills: the dim gold on its wash again (no .price class)', pr.length > 0 && pr.every(x => !/price/.test(x.cls) && /rgb\((138, 106, 38|187, 58, 50)\)/.test(x.color)), pr);
  // Create Your Hero: a fresh device with only the switch stored
  await page.goto(L.URL_, { waitUntil: 'domcontentloaded' }); await page.evaluate(() => { localStorage.clear(); localStorage.setItem('qok-d4-ui', '0'); }); await page.reload({ waitUntil: 'load' });
  await L.toTitle(page); await page.waitForTimeout(1200);
  await tap(page, '[data-act="titleSlots"]'); await page.waitForTimeout(600);
  await tap(page, '[data-act="slotPick"][data-i="1"]'); await page.waitForTimeout(1500);
  await page.waitForSelector('[data-act="introStart"]', { timeout: 15000 }).catch(() => {}); await page.waitForTimeout(600);
  const a = await introState(page); await shot(page, 'd4off-create-hero');
  rec('d4off Create Your Hero: 48 px look choices in 2 px frames and the old Back chip (not the standard button, under 48 px)', a.opts.length === 2 && a.opts.every(o => o.img === 48 && o.bw === 2) && !!a.back && !/btn/.test(a.back.cls) && a.back.h < 48, { opts: a.opts, back: a.back });
  await setVp(page, 375, 667); const pv = await page.evaluate(() => { const e = document.querySelector('#qok-ui .intro-hero'); return e ? Math.round(e.getBoundingClientRect().height) : 0; }); await shot(page, 'd4off-create-hero-375x667'); await setVp(page, 390, 844);
  rec('d4off Create Your Hero at 375x667: the large preview above the name is shown again', pv > 40, { previewHeight: pv });
}

// u2: a new quest leaves opened details alone in an open panel (U2-3); the defeat notes cannot overflow when text-wrap:balance is
// not supported (U2-8); one defeat halves the gold once however often returnToTown is called (U2-9).
async function u2(page) {
  await U.boot(page, { locale: 'en', all: false, mapId: 'overworld', x: 69, y: 258, activeQuests: ['kikisChallenge', 'owlsLesson'] }); await page.waitForTimeout(1200);
  const entries = () => page.evaluate(() => [...document.querySelectorAll('#qfh-quest-content .qfq-entry')].map(e => ({ id: e.getAttribute('data-quest-id'), open: e.classList.contains('open') })));
  await page.locator('#qfh-quest-toggle').tap(); await page.waitForTimeout(600);
  const e0 = await entries(), shut = e0.find(e => !e.open);
  if (shut) { await page.locator(`#qfh-quest-content .qfq-entry[data-quest-id="${shut.id}"] .qfq-title`).tap(); await page.waitForTimeout(500); }
  const e1 = await entries();
  await startQuest(page, 'gordosOre'); await page.waitForTimeout(1500);
  const e2 = await entries(), p2 = await panel(page); await shot(page, 'U2-3-open-panel-new-quest');
  const was = shut && e1.find(e => e.id === shut.id), now = shut && e2.find(e => e.id === shut.id);
  rec('U2-3 a quest is added while the panel is open: the details the player opened with a tap stay open', !!shut && !!was && was.open && !!now && now.open && e2.some(e => e.id === 'gordosOre') && !!p2 && !p2.collapsed, { tapped: shut && shut.id, before: e1, after: e2 });
  await page.locator('#qfh-quest-toggle').tap(); await page.waitForTimeout(500);
  await startQuest(page, 'lunasMap'); const o3 = await until(page, false, 2500); await page.waitForTimeout(400);
  const e3 = await entries();
  rec('U2-3 guard: added while the panel is folded, the new quest and only it shows its objective (as before)', o3 !== null && e3.length >= 4 && e3.every(e => e.open === (e.id === 'lunasMap')), e3);
  // the defeat screen in kanji
  await U.boot(page, { ...U.LANGS['ja-kanji'], all: false, mapId: 'overworld', x: 69, y: 258 });
  await page.evaluate(() => { const st = window.__GAME_STATE__.player.state; st.hp = 1; st.gold = 1001; });
  await lose(page);
  if (!(await U.active(page, 'GameOverScene'))) { rec('U2: the defeat screen opens (direct: scene.start GameOverScene)', false); return; }
  await page.addStyleTag({ content: '#qok-ui .go-note{ text-wrap:wrap !important; }' }); await page.waitForTimeout(300);
  const fits = [];
  for (const [w, h] of VPS) { await setVp(page, w, h); const d = await defeatState(page);
    const notes = await page.evaluate(() => [...document.querySelectorAll('#qok-ui .go-note')].map(e => { const c = getComputedStyle(e); return { t: e.textContent.slice(0, 14), over: e.scrollWidth > e.clientWidth + 1, wrap: c.textWrapStyle || c.textWrap || '?' }; }));
    fits.push({ vp: w + 'x' + h, wide: d.wide, top: d.top, bottom: d.bottom, vh: d.vh, notes }); }
  await shot(page, 'U2-8-defeat-notes-wrap-off-kanji'); await setVp(page, 390, 844);
  rec('U2-8 defeat notes in kanji with text-wrap:balance switched off (the Safari 16.4 fallback): nothing is wider than the screen and the block stays on it',
    fits.every(f => f.wide === 0 && f.notes.length >= 1 && f.notes.every(n => !n.over && n.wrap !== 'balance') && f.top >= 0 && f.bottom <= f.vh), fits);
  const r = await page.evaluate(() => { const SV = window.__QOK_SAVES__, st = window.__GAME_STATE__.player.state, g0 = st.gold; const a = SV.returnToTown(), g1 = st.gold, b = SV.returnToTown(), g2 = st.gold; return { g0, a, g1, b, g2 }; });
  rec('U2-9 returnToTown called twice in the same defeat (direct: __QOK_SAVES__.returnToTown): the gold is halved once', r.a === true && r.g1 === r.g0 - Math.floor(r.g0 / 2) && r.b === false && r.g2 === r.g1, r);
  await page.waitForFunction(() => !window.__PHASER_GAME__.scene.isActive('GameOverScene'), null, { timeout: 20000 }).catch(() => {}); await page.waitForTimeout(300);
  const late = await page.evaluate(() => { const SV = window.__QOK_SAVES__, st = window.__GAME_STATE__.player.state; const c = SV.returnToTown(); return { c, gold: st.gold }; });
  rec('U2-9 ...and a call after the defeat screen has been left changes nothing either', late.c === false && late.gold === r.g1, late);
  // the guard is per defeat: the next one pays again
  await page.waitForFunction(() => window.__PHASER_GAME__.scene.isActive('WorldMapScene'), null, { timeout: 40000 }).catch(() => {});
  await page.waitForFunction(() => { const c = window.__QOK_COVER__; return !c || !c.phase || c.phase() === 'active'; }, null, { timeout: 60000 }).catch(() => {}); await page.waitForTimeout(800);
  await page.evaluate(() => { const st = window.__GAME_STATE__.player.state; st.hp = 1; st.gold = 500; });
  await lose(page);
  const again = await page.evaluate(() => { const SV = window.__QOK_SAVES__, st = window.__GAME_STATE__.player.state, on = window.__PHASER_GAME__.scene.isActive('GameOverScene'); const a = SV.returnToTown(); return { on, a, gold: st.gold }; });
  rec('U2-9 guard: the next defeat pays again (500 G becomes 250 G)', again.on === true && again.a === true && again.gold === 250, again);
}

(async () => {
  const o = await L.launch({ dpr: 2 }); const page = o.page;
  try {
    if (GROUP === 'title') await title(page);
    else if (GROUP === 'menu') await menu(page);
    else if (GROUP === 'shop') await shop(page);
    else if (GROUP === 'quests') await quests(page, false);
    else if (GROUP === 'quests-old') await quests(page, true);
    else if (GROUP === 'defeat') await defeat(page);
    else if (GROUP === 'town') await town(page);
    else if (GROUP === 'dungeon') await dungeon(page);
    else if (GROUP === 'words') await words(page);
    else if (GROUP === 'firstlang') await firstLang(o.browser);
    else if (GROUP === 'd4off') await d4off(page);
    else if (GROUP === 'u2') await u2(page);
    else rec('group ' + GROUP, false, 'unknown');
  } catch (e) { rec(`${GROUP}: ran to the end`, false, String(e && e.stack || e).slice(0, 400)); }
  await o.browser.close();
  U.finish('ui-polish ' + GROUP);
})();
