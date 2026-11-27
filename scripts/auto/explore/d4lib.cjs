'use strict';
// Day-4 explorer helpers (track X, 2026-11-27): realistic saves from the testers' jump list, state
// digests, real-tap helpers for the five-slot title, battle drivers, and the "kill" (page reload
// with no hide event, which is what an iOS WebContent kill looks like to the page).
//   Everything runs against PROBE_URL (default the current tree on :5560).
const fs = require('fs'), path = require('path');
const X = require('./xlib.cjs'), L = X.L;
const JP = JSON.parse(fs.readFileSync(path.join(X.ROOT, 'public/acts-hifi/jump-points.json'), 'utf8'));
const PTS = {}; for (const a of JP.acts) for (const pl of a.places) for (const pt of pl.points) PTS[pt.id] = { ...pt, place: pl.id, kind0: pl.kind, act: a.act };
const clone = o => JSON.parse(JSON.stringify(o));

// A save the game could have written, at jump point `id` (same construction as Settings > Testers: Jump).
function recSave(id, mod) {
  const pt = PTS[id]; if (!pt) throw new Error('no jump point ' + id);
  const p = clone(JP.records[pt.r]);
  p.name = 'Mika'; p.position = { mapId: pt.pos.mapId, x: pt.pos.x, y: pt.pos.y, floor: pt.pos.floor || 1 };
  for (const k in (pt.flags || {})) p.storyFlags[k] = pt.flags[k];
  const s = { version: 4, timestamp: Date.now(), player: p, playtime: 1234, quizStats: {} };
  if (mod) mod(s); return s;
}
const J = o => JSON.stringify(o);
const sleep = ms => new Promise(r => setTimeout(r, ms));

// ---- digests -------------------------------------------------------------------------------------
const DIG = () => {
  const g = window.__PHASER_GAME__, t = window.__GAME_STATE__, s = t && t.player && t.player.state, w = g.scene.getScene('WorldMapScene');
  if (!s) return { noState: true, scenes: g.scene.getScenes(true).map(x => x.scene.key) };
  const inv = {}; for (const i of s.inventory) inv[i.itemId] = (inv[i.itemId] || 0) + i.quantity;
  return { name: s.name, level: s.level, exp: s.exp, hp: s.hp, maxHp: s.maxHp, gold: s.gold, inv, eq: s.equipment, flags: Object.keys(s.storyFlags || {}).sort(),
    aq: (s.activeQuests || []).slice().sort(), cq: (s.completedQuests || []).slice().sort(), pos: s.position ? { ...s.position } : null,
    map: w && w.currentMapId, floor: w && (w.currentFloor || 1), cell: w && [w.heroTileX, w.heroTileY], hero: w && w.hero ? [Math.round(w.hero.x), Math.round(w.hero.y)] : null,
    scenes: g.scene.getScenes(true).map(x => x.scene.key), msg: !!(w && w.showingMessage), loc: s.locale, kanji: !!s.kanjiMode, grade: s.quizDifficulty, dead: s.hp <= 0 };
};
const dig = page => page.evaluate(DIG);
// what changed between two digests, as short strings
function diff(a, b) {
  const out = [];
  for (const k of ['level', 'exp', 'hp', 'maxHp', 'gold', 'map', 'floor', 'loc', 'kanji', 'grade']) if (a[k] !== b[k]) out.push(`${k}:${a[k]}->${b[k]}`);
  const ik = new Set([...Object.keys(a.inv || {}), ...Object.keys(b.inv || {})]);
  for (const k of ik) if ((a.inv[k] || 0) !== (b.inv[k] || 0)) out.push(`inv.${k}:${a.inv[k] || 0}->${b.inv[k] || 0}`);
  const fa = new Set(a.flags), fb = new Set(b.flags);
  for (const f of fb) if (!fa.has(f)) out.push('+flag ' + f); for (const f of fa) if (!fb.has(f)) out.push('-flag ' + f);
  for (const q of b.cq) if (!a.cq.includes(q)) out.push('+done ' + q); for (const q of a.cq) if (!b.cq.includes(q)) out.push('-done ' + q);
  for (const q of b.aq) if (!a.aq.includes(q)) out.push('+active ' + q); for (const q of a.aq) if (!b.aq.includes(q)) out.push('-active ' + q);
  if (J(a.eq) !== J(b.eq)) out.push('equipment ' + J(a.eq) + '->' + J(b.eq));
  return out;
}
// localStorage summary of every save-ish key
const LSUM = () => { const o = {}; for (let i = 0; i < localStorage.length; i++) { const k = localStorage.key(i); if (!/^(edu-rpg|qok-slot|qok-active|qok-slots)/.test(k)) continue; const v = localStorage.getItem(k);
  let d = null; try { d = JSON.parse(v); } catch (e) {} const pl = d && d.player;
  o[k] = pl ? { ts: d.timestamp, lvl: pl.level, gold: pl.gold, map: pl.position && pl.position.mapId, fl: pl.position && pl.position.floor, hp: pl.hp, len: v.length } : (v.length > 80 ? v.slice(0, 80) + '...' : v); } return o; };
const lsum = page => page.evaluate(LSUM);

// ---- boot variants ---------------------------------------------------------------------------------
// Fresh page with the given localStorage (a plain object of strings), no Continue yet.
async function freshLS(page, ls) {
  await page.goto(L.URL_, { waitUntil: 'domcontentloaded' });
  await page.evaluate(ls => { localStorage.clear(); for (const k in ls) localStorage.setItem(k, ls[k]); }, ls);
  await page.reload({ waitUntil: 'load' });
}
// seed slots {n:{auto,save,town,clear}} (objects) and active slot; marks the slot migration done
function slotLS(slots, active, extra = {}) {
  const ls = { 'qok-slots-v1': '1', ...extra };
  for (const [n, v] of Object.entries(slots)) { if (v.auto) ls[`qok-slot-${n}-auto`] = J(v.auto); if (v.save) ls[`qok-slot-${n}-save`] = J(v.save); if (v.town) ls[`qok-slot-${n}-town`] = J(v.town); if (v.clear) ls[`qok-slot-${n}-clear`] = J(v.clear); }
  if (active) { ls['qok-active-slot'] = String(active); const v = slots[active] || {}; if (v.save) ls['edu-rpg-save'] = J(v.save); if (v.auto) ls['edu-rpg-autosave'] = J(v.auto); }
  return ls;
}
const waitTitleSlots = async page => { await L.toTitle(page); await page.waitForFunction(() => { const k = window.__QOK_COVER__; return !k || k.phase() === 'waiting' || k.phase() === 'active'; }, null, { timeout: 60000 }).catch(() => {}); await page.waitForTimeout(500); };
async function tap(page, sel, timeout = 4000) {
  const loc = page.locator(sel), t0 = Date.now();
  while (Date.now() - t0 < timeout) { const n = await loc.count(); for (let i = 0; i < n; i++) { const el = loc.nth(i); if (!(await el.isVisible().catch(() => false))) continue; try { await el.tap({ timeout: 2500 }); return true; } catch (e) {} } await page.waitForTimeout(150); }
  return false;
}
const waitField = async (page, ms = 90000) => { await page.waitForFunction(() => { const g = window.__PHASER_GAME__, w = g && g.scene.getScene('WorldMapScene'); return w && g.scene.isActive('WorldMapScene') && w.hero && w.mapData; }, null, { timeout: ms });
  await page.waitForFunction(() => { const T = window.__DQ_TILES__; return T && T.ready && T.ready(); }, null, { timeout: 60000 }).catch(() => {});
  await page.waitForTimeout(2500); await L.noEncounters(page); };
// real taps: title > Slots > slot n > Auto (0) or Last save (1)
async function loadSlotUI(page, n, which) {
  if (!(await tap(page, '[data-act="titleSlots"]'))) return { ok: false, why: 'no titleSlots button' };
  if (!(await tap(page, `[data-act="slotPick"][data-i="${n}"]`))) return { ok: false, why: 'no slotPick ' + n };
  const labels = await page.$$eval('[data-act="slotLoad"]', es => es.map(e => e.innerText.replace(/\s+/g, ' ').trim().slice(0, 80)));
  if (!labels.length) return { ok: false, why: 'slot has no load buttons (empty or new game started)', labels };
  if (!(await tap(page, `[data-act="slotLoad"][data-i="${which}"]`))) return { ok: false, why: 'no slotLoad ' + which, labels };
  try { await waitField(page); } catch (e) { return { ok: false, why: 'field never came: ' + String(e).slice(0, 80), labels }; }
  return { ok: true, labels };
}
// after a reload: the page either resumes into the field by itself (recovery net) or shows the title
async function afterKill(page, which = 0, slot = 1) {
  const how = await page.waitForFunction(() => { const g = window.__PHASER_GAME__, w = g && g.scene.getScene('WorldMapScene');
    if (w && g.scene.isActive('WorldMapScene') && w.hero && w.mapData) return 'field';
    const b = document.querySelector('[data-act="titleSlots"], [data-act="titleContinue"]'); return b && b.offsetParent ? 'title' : false; }, null, { timeout: 120000, polling: 400 }).then(h => h.jsonValue(), () => 'none');
  if (how === 'field') { await page.waitForTimeout(4500); await L.noEncounters(page); return { how: 'auto-resume' }; }
  if (how === 'title') { await page.waitForFunction(() => { const k = window.__QOK_COVER__; return !k || k.phase() === 'waiting'; }, null, { timeout: 60000 }).catch(() => {}); await page.waitForTimeout(300);
    const r = await loadSlotUI(page, slot, which); return { how: 'title>slot' + slot + '>' + (which ? 'save' : 'auto'), ...r }; }
  return { how: 'none' };
}
async function kill(page) { await page.reload({ waitUntil: 'load' }); }       // no visibilitychange, no pagehide autosave from us

// ---- movement checks -----------------------------------------------------------------------------------
const FR = '#act1-hifi-preserved-root iframe';
async function dismissMsgs(page, n = 14) { for (let i = 0; i < n; i++) { const d = await dig(page); if (!d.msg) return i;
  await page.evaluate(() => { for (const t of ['keydown', 'keyup']) { const ev = new KeyboardEvent(t, { key: 'z', code: 'KeyZ', bubbles: true, cancelable: true }); Object.defineProperty(ev, 'keyCode', { get: () => 90 }); Object.defineProperty(ev, 'which', { get: () => 90 }); window.dispatchEvent(ev); } }); await page.waitForTimeout(300); } return n; }
async function canMove(page) {
  await dismissMsgs(page);
  // overlays (quest card, etc.)
  await page.evaluate(() => { const c = document.getElementById('qok-quest-completion'); const b = c && !c.hidden && c.querySelector('.qqc-dismiss'); if (b) b.click(); });
  const s0 = await page.evaluate((FR) => { const f = document.querySelector(FR), t = f && f.contentWindow && f.contentWindow.__ACT1_TOWN__; let tp = null; try { tp = t && t.position(); } catch (e) {} return { town: !!(t && t.town), tpos: tp ? [tp.x, tp.y] : null }; }, FR);
  if (s0.town) {
    for (const k of ['ArrowDown', 'ArrowUp', 'ArrowLeft', 'ArrowRight']) {
      const a = await page.evaluate(FR => { const f = document.querySelector(FR), t = f.contentWindow.__ACT1_TOWN__; const p = t.position(); return [p.x, p.y]; }, FR).catch(() => null);
      await page.evaluate(([sel, k]) => { const f = document.querySelector(sel); f.contentWindow.dispatchEvent(new f.contentWindow.KeyboardEvent('keydown', { key: k, bubbles: true })); }, [FR, k]);
      await page.waitForTimeout(500);
      await page.evaluate(([sel, k]) => { const f = document.querySelector(sel); if (f) f.contentWindow.dispatchEvent(new f.contentWindow.KeyboardEvent('keyup', { key: k, bubbles: true })); }, [FR, k]);
      const b = await page.evaluate(FR => { const f = document.querySelector(FR), t = f && f.contentWindow && f.contentWindow.__ACT1_TOWN__; if (!t) return null; const p = t.position(); return [p.x, p.y]; }, FR).catch(() => null);
      if (!b || (a && Math.hypot(a[0] - b[0], a[1] - b[1]) > 3)) return { ok: true, how: 'town ' + k };
    }
    return { ok: false, how: 'town: no arrow key moved her' };
  }
  for (const [x, y] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
    const a = await dig(page); await L.stick(page, x, y, 600); const b = await dig(page);
    if (b.map !== a.map || b.floor !== a.floor || (a.hero && b.hero && Math.hypot(a.hero[0] - b.hero[0], a.hero[1] - b.hero[1]) > 3)) return { ok: true, how: [x, y] };
  }
  return { ok: false, how: 'field: stick moved her nowhere', d: await dig(page) };
}

// ---- battles -----------------------------------------------------------------------------------------
// start one by the game's own WorldMapScene.startBattle (boss = true for the retry/boss hooks)
async function startFight(page, id, boss = false) {
  return page.evaluate(([id, boss]) => { const g = window.__PHASER_GAME__, w = g.scene.getScene('WorldMapScene'), em = window.__GAME_STATE__.encounterManager, c = console.warn; console.warn = () => {};
    let mon; try { mon = em.rollEncounter({ monsters: [{ monsterId: id, weight: 1 }] }); } finally { console.warn = c; }
    if (!mon) return false; if (boss) w.pendingBossId = id; w.startBattle(mon, boss); return true; }, [id, boss]);
}
const BST = () => { const g = window.__PHASER_GAME__, b = g.scene.getScene('BattleScene'), q = b && b.quizQuestion;
  return { on: g.scene.isActive('BattleScene'), phase: b && b.phase, es: b && b.engine && b.engine.state, kp: !!document.querySelector('#qok-ui .kpad'), mhp: b && b.engine && b.engine.monsterHp,
    right: q ? String(((q.answers.find(a => a.isCorrect) || {}).text || {}).en) : null, go: g.scene.isActive('GameOverScene'), vic: g.scene.isActive('VictoryScene') }; };
const bst = page => page.evaluate(BST);
async function untilPhase(page, want, ms = 30000) {
  const t0 = Date.now(); let s, seen = false;
  while (Date.now() - t0 < ms) { s = await bst(page); if (s.on) seen = true; if (!s.on && (seen || Date.now() - t0 > 12000)) return s; if (!s.on) { await page.waitForTimeout(300); continue; } if (want.includes(s.phase) && (!/Quiz/.test(s.phase) || s.kp)) return s;
    if (s.phase === 'message') await page.evaluate(() => { const b = window.__PHASER_GAME__.scene.getScene('BattleScene'); try { b.advanceMessage(); } catch (e) {} });
    if (s.phase === 'playerMenu' && !want.includes('playerMenu')) await page.evaluate(() => { const b = window.__PHASER_GAME__.scene.getScene('BattleScene'); b.menuIndex = 0; b.confirmMenuAction(); });
    await page.waitForTimeout(250); }
  return s;
}
// answer the quiz in-page: right or wrong (through the scene, as the honest player does)
const answer = (page, right) => page.evaluate(right => { const b = window.__PHASER_GAME__.scene.getScene('BattleScene'), a = b.quizQuestion.answers, good = a.findIndex(x => !!x.isCorrect), bad = a.map((x, i) => i).filter(i => i !== good);
  b.quizSelectedIndex = right || !bad.length ? good : bad[0]; b.confirmQuizAnswer(); }, right);
// fight until the player is dead (wrong answers) -> GameOverScene
async function dieInBattle(page, ms = 90000) {
  const t0 = Date.now(); await untilPhase(page, ['playerMenu'], 20000);
  while (Date.now() - t0 < ms) { const s = await bst(page); if (s.go) return true; if (!s.on) { await page.waitForTimeout(400); if ((await bst(page)).go) return true; return false; }
    if (s.phase === 'playerQuiz' || s.phase === 'enemyQuiz') await answer(page, false);
    else await untilPhase(page, ['playerQuiz', 'enemyQuiz'], 4000);
    await page.waitForTimeout(150); }
  return false;
}
// win: set the monster to 1 hp and answer right
async function winBattle(page, ms = 60000) {
  const t0 = Date.now(); await page.evaluate(() => { const b = window.__PHASER_GAME__.scene.getScene('BattleScene'); b.engine.monsterHp = 1; });
  while (Date.now() - t0 < ms) { const s = await bst(page); if (!s.on) return true; if (s.es === 'victory' && s.phase === 'message') return 'victory-message';
    if (s.phase === 'playerQuiz') await answer(page, true); else await untilPhase(page, ['playerQuiz'], 4000); await page.waitForTimeout(150); }
  return false;
}

const RAWRE = /\[[a-zA-Z][\w-]*(\.[\w-]+)+\]|\b(d2|mechanic|npc|quest|dungeon|menu|overworld|battle|item|shop|town|geo|acts|gameover|settings|title)\.[a-zA-Z][\w]*(\.[\w]+)*\b/g;
const rawKeys = page => page.evaluate(re => { const out = new Set(), rx = new RegExp(re.s, 'g'); const scan = s => { if (!s) return; const m = String(s).match(rx); if (m) m.forEach(x => out.add(x)); };
  scan(document.body.innerText); const g = window.__PHASER_GAME__; for (const s of g.scene.getScenes(true)) { try { s.children.list.forEach(o => { if (o.visible !== false && typeof o.text === 'string') scan(o.text); }); } catch (e) {} } return [...out]; }, { s: RAWRE.source });

// ---- reporting -----------------------------------------------------------------------------------------
function makeReporter(file, S) {
  const rows = [];
  const R = { rows, check(scn, what, ok, detail) { const r = { scn, what, status: ok === true ? 'PASS' : ok === false ? 'FAIL' : String(ok), detail: J(detail === undefined ? null : detail).slice(0, 1400), errors: S ? S.errors.splice(0).slice(0, 4) : [] };
      rows.push(r); X.append(file, r); console.log(`[${r.status}] ${scn}: ${what}${r.status !== 'PASS' ? ' -- ' + r.detail : ''}${r.errors.length ? ' ERR ' + J(r.errors) : ''}`); return ok === true; } };
  return R;
}
module.exports = { X, L, JP, PTS, recSave, J, sleep, DIG, dig, diff, lsum, freshLS, slotLS, waitTitleSlots, tap, waitField, loadSlotUI, afterKill, kill, canMove, dismissMsgs, startFight, bst, untilPhase, answer, dieInBattle, winBattle, rawKeys, makeReporter, clone, FR };
