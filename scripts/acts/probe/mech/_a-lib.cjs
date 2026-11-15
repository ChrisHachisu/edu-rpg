'use strict';
// Shared runner for the batch A mechanic probes (one probe per mechanic beside this file).
// Pattern of scripts/acts/probe/dungeon_authored.cjs: a v4 save on the overworld at the dungeon's
// remapped exit, Continue, a real walk into the mouth (AGENTS.md rule 7), then the probe's own
// play-through with the stick and the prompt pill. Screenshots are small JPEGs.
//
//   NODE_PATH=/opt/node-tools/node_modules PROBE_URL=http://127.0.0.1:5200/ \
//     flock /home/user/work/e2/heavy.lock.$((RANDOM%2)) node scripts/acts/probe/mech/<mechanic-id>.cjs
// PROBE_SHOTS (default /mnt/project-files/edu-rpg/acts-integration/dungeons-e2) / <dungeon id> / NN-tag.jpg
const fs = require('fs'), path = require('path');
const L = require('../lib.cjs');
const ROOT = path.resolve(__dirname, '../../../..');
const PILOT = fs.readFileSync(path.join(__dirname, '_a-pilot.js'), 'utf8');
const SHOTS = process.env.PROBE_SHOTS || '/mnt/project-files/edu-rpg/acts-integration/dungeons-e2';
const acts = JSON.parse(fs.readFileSync(path.join(ROOT, 'public/acts-hifi/manifest.json'), 'utf8'));
const INV = ['herb*5', 'flameCloak', 'windbreakerStone'].map(s => ({ itemId: s.split('*')[0], quantity: +(s.split('*')[1] || 1) }));
const QUESTS = ['owlsLesson', 'drakeCargo', 'lunasMap', 'ancientRelic', 'flameCloak', 'lunasProphecy'];
const CELL = 48;

class Run {
  constructor(id, { bossId, flags = {}, name = id, grade = null, needModule = true } = {}) { this.grade = grade; this.needModule = needModule; this.id = id; this.bossId = bossId; this.seedFlags = flags; this.rows = []; this.n = 0; this.name = name;
    this.dir = path.join(SHOTS, id) + '/'; fs.mkdirSync(this.dir, { recursive: true }); }
  rec(check, ok, note) { const r = { dungeon: this.id, check, status: ok === true ? 'PASS' : ok === false ? 'FAIL' : String(ok), note: note === undefined ? '' : (typeof note === 'string' ? note : JSON.stringify(note)).slice(0, 700) };
    this.rows.push(r); console.log(`[${r.status}] ${this.id}: ${check}${r.note ? ' -- ' + r.note : ''}`);
    fs.writeFileSync(path.join(L.OUT, `${this.name}.json`), JSON.stringify(this.rows, null, 1)); return ok === true; }
  ev(fn, arg) { return this.page.evaluate(fn, arg); }
  st() { return this.ev(() => window.__A.state()); }
  ms() { return this.ev(() => { const s = window.__A.mstate(); try { return JSON.parse(JSON.stringify(s, (k, v) => (v && typeof v === 'object' && (v.scene || v.texture || v.type === 'Graphics')) ? undefined : v)); } catch (e) { return null; } }); }
  async shot(tag) { this.n++; const f = path.join(this.dir, `${String(this.n).padStart(2, '0')}-${tag}.jpg`);
    await this.page.screenshot({ path: f, type: 'jpeg', quality: 62 }).catch(e => console.log('shot fail', e.message)); return f; }
  async pilot() { await this.page.evaluate(PILOT); }
  async settle(ms = 30000) {
    const ok = await this.page.waitForFunction((nm) => { const s = window.__A && window.__A.state(); return s && s.field && s.d2 && s.d2.art === 'ready' && s.d2.mask === 'ready' && (s.d2.module || !nm) && !s.waiting; }, this.needModule, { timeout: ms }).then(() => true).catch(() => false);
    await this.page.waitForTimeout(600); return ok; }
  async start() {
    const LM = acts.landmarks.find(l => l.mapId === this.id && !l.toFloor && !l.virtual); this.LM = LM;
    const flags = { ...L.allFlags(), ...this.seedFlags }; if (this.bossId) delete flags[`boss.${this.bossId}.defeated`];
    const o = await L.launch(); this.browser = o.browser; this.page = o.page; this.errors = o.errors;
    const sv = L.save({ mapId: 'overworld', x: LM.exit[0], y: LM.exit[1], flags, inventory: INV, completedQuests: QUESTS }); if (this.grade) sv.player.quizDifficulty = String(this.grade);   // the school grade the quiz is set to
    await L.bootSave(this.page, sv, { extra: { 'qok-dungeons2-smoke': '1' } });
    await this.pilot();
    const p = await L.pos(this.page);
    this.rec('seeded save loads on the overworld at the remapped exit', p.map === 'overworld' && p.x === LM.exit[0] && p.y === LM.exit[1], p);
    return this.enter();
  }
  // A second visit in the same browser: a fresh seeded save at another landmark of this dungeon (its second entrance), walked in.
  async restart(LM, flags) {
    await L.bootSave(this.page, L.save({ mapId: 'overworld', x: LM.exit[0], y: LM.exit[1], flags: { ...L.allFlags(), ...(flags || {}) }, inventory: INV, completedQuests: QUESTS }), { extra: { 'qok-dungeons2-smoke': '1' } });
    await this.pilot(); const p = await L.pos(this.page);
    const r = await L.walkCells(this.page, [[LM.at[0], LM.at[1]]], { maxMs: 25000 }); await this.page.waitForTimeout(1200); await this.pilot();
    const okS = await this.settle(); await L.noEncounters(this.page); return { ok: okS, from: p, walk: r.why, s: await this.st() };
  }
  async enter() {
    const r = await L.walkCells(this.page, [[this.LM.at[0], this.LM.at[1]]], { maxMs: 25000 }); await this.page.waitForTimeout(1200); await this.pilot();
    const okS = await this.settle(); const s = await this.st();
    this.rec('walking into the overworld mouth enters floor 1 of the authored dungeon (smoke flag on)', s.map === this.id && s.floor === 1 && okS && (s.d2.mechanic !== null || !this.needModule), { r: r.why, s });
    await L.noEncounters(this.page);
    return s.map === this.id;
  }
  // goal/opts as window.__A.go. Returns its result.
  go(goal, opts = {}) { return this.ev(([g, o]) => { if (g.sideDir) { const [dx, dy, cx, cy] = g.sideDir; g.side = (sx, sy) => dx ? ((sx - (cx * 48 + 24)) * -dx > 20 && Math.abs(sy - (cy * 48 + 24)) < 16) : ((sy - (cy * 48 + 24)) * -dy > 20 && Math.abs(sx - (cx * 48 + 24)) < 16); }
    return window.__A.go(g, o); }, [goal, opts]); }
  async tapPrompt(want) { const loc = this.page.locator('#a1mInteract.a1m-show').first(); const box = await loc.boundingBox().catch(() => null); if (!box) return null;
    const txt = await loc.textContent().catch(() => null); if (want && txt !== want) return null; await loc.tap({ timeout: 3000 }).catch(() => {}); await this.page.waitForTimeout(300); return txt; }
  // Walk up to an object cell, lean on it until the pill shows `verb`, tap it. Returns the verb tapped or null.
  async use(cx, cy, verb, opts = {}) {
    for (let k = 0; k < 3; k++) {
      const g = await this.go({ beside: [cx, cy], reach: opts.reach || 16 }, opts);
      if (!g.ok) { if (k === 2) return null; continue; }
      if (g.why === 'message') { await this.ev(() => window.__A.dismiss()); continue; }
      await this.ev(([cx, cy, v]) => window.__A.lean(cx, cy, 700, v), [cx, cy, verb || null]); await this.page.waitForTimeout(150);
      const t = await this.tapPrompt(verb); if (t) return t;
    }
    return null;
  }
  async dismiss() { return this.ev(() => window.__A.dismiss()); }
  async fight(maxMs = 150000) {
    const page = this.page, t0 = Date.now(); let roundsN = 0, monster = null;
    const ok = await page.waitForFunction(() => window.__PHASER_GAME__.scene.isActive('BattleScene'), { timeout: 20000 }).then(() => true).catch(() => false);
    if (!ok) return { entered: false };
    const tap = async (sel, timeout = 4000) => { const loc = page.locator(sel).first(); const dl = Date.now() + timeout; let box = null;
      while (Date.now() < dl) { box = await loc.boundingBox().catch(() => null); if (box && box.width >= 4) break; box = null; await page.waitForTimeout(150); } if (!box) return false; await loc.tap({ timeout: 4000 }).catch(() => {}); return true; };
    while (Date.now() - t0 < maxMs) {
      const s = await page.evaluate(() => { const g = window.__PHASER_GAME__, b = g.scene.getScene('BattleScene'); return { active: g.scene.isActive('BattleScene'), phase: b && b.phase, mon: b && b.monster && (b.monster.id || b.monster.nameKey), over: g.scene.isActive('GameOverScene') }; });
      if (!s.active) { await page.waitForTimeout(900); return { entered: true, won: !s.over, rounds: roundsN, monster }; }
      monster = monster || s.mon;
      if (s.phase === 'playerMenu') { await tap('[data-act="battleMenu"][data-i="0"]'); await page.waitForTimeout(500); }
      else if (/quiz/i.test(String(s.phase)) || (await page.evaluate(() => { const e = document.querySelector('[data-act="quizAns"]'); return !!(e && e.offsetParent !== null); }))) {
        const idx = await page.evaluate(() => { const b = window.__PHASER_GAME__.scene.getScene('BattleScene'); const a = (b.quizQuestion && b.quizQuestion.answers) || []; return a.findIndex(x => !!x.isCorrect); }); roundsN++;
        if (idx < 0) await page.waitForTimeout(500); else { await tap(`[data-act="quizAns"][data-i="${idx}"]`); await page.waitForTimeout(800); } }
      else if (s.phase === 'message') { const t = await tap('[data-act="battleAdvance"]', 1500); if (!t) await page.mouse.click(195, 600).catch(() => {}); await page.waitForTimeout(450); }
      else { await page.waitForTimeout(300); await tap('[data-act="battleAdvance"]', 400); }
    }
    return { entered: true, won: false, timeout: true, rounds: roundsN, monster };
  }
  // The game's save inside a dungeon is the AUTO save; Continue is the title's slot picker -> slot 1 -> "Auto save".
  async saveContinue() {
    const page = this.page;
    const saved = await page.evaluate(() => { const gs = window.__GAME_STATE__; gs.saveGame(); const raw = localStorage.getItem('edu-rpg-autosave');
      localStorage.setItem('qok-slots-v1', '1'); localStorage.setItem('qok-active-slot', '1'); localStorage.setItem('qok-slot-1-auto', raw);
      const s = JSON.parse(raw); return { pos: s.player.position, d2: Object.keys(s.player.storyFlags).filter(k => k.indexOf('d2.') === 0) }; });
    await page.reload({ waitUntil: 'load' });
    await page.waitForSelector('[data-act="titleSlots"]', { state: 'visible', timeout: 90000 });
    await page.waitForFunction(() => { const k = window.__QOK_COVER__; return !k || k.phase() === 'waiting'; }, { timeout: 30000 }).catch(() => {});
    await page.waitForTimeout(300);
    await page.click('[data-act="titleSlots"]'); await page.click('[data-act="slotPick"][data-i="1"]');
    await page.waitForSelector('[data-act="slotLoad"][data-i="0"]', { state: 'visible', timeout: 15000 }); await page.click('[data-act="slotLoad"][data-i="0"]');
    await page.waitForFunction(() => { const g = window.__PHASER_GAME__, w = g.scene.getScene('WorldMapScene'); return w && g.scene.isActive('WorldMapScene') && w.hero && w.mapData; }, { timeout: 90000 });
    await page.waitForTimeout(2500); await this.pilot(); const ok = await this.settle(40000); await L.noEncounters(page);
    return { ok, saved };
  }
  async stairs(asset, wantFloor, opts = {}) {
    const g = await this.go({ centre: [asset.x, asset.y] }, { hold: 900, ...opts }); await this.page.waitForTimeout(1500); await this.pilot(); const okS = await this.settle(); await L.noEncounters(this.page);
    const s = await this.st();
    return this.rec(`f${wantFloor - 1}: the stairs lead to floor ${wantFloor}`, s.map === this.id && s.floor === wantFloor && okS, { g, s: [s.x, s.y, s.floor] });
  }
  // Walk to the boss marker, start the fight (bump, else the pill), win, and leave through the exit that opens in its cell.
  async boss(asset, f, opts = {}) {
    const page = this.page;
    await this.go({ beside: [asset.x, asset.y], reach: 60 }, opts); await page.waitForTimeout(400); await this.shot(`f${f}-boss`);
    let started = false;
    for (let k = 0; k < 4 && !started; k++) {
      await this.go({ beside: [asset.x, asset.y], reach: 14 }, opts);
      await this.ev(([cx, cy]) => window.__A.lean(cx, cy, 900), [asset.x, asset.y]); await page.waitForTimeout(200);
      if (await this.ev(() => window.__A.prompt())) await this.tapPrompt();
      for (let j = 0; j < 14 && !started; j++) { await this.ev(() => window.__A.tapKey('z')); await page.waitForTimeout(300); started = await page.evaluate(() => window.__PHASER_GAME__.scene.isActive('BattleScene')); } }
    const fr = started ? await this.fight() : { entered: false };
    await page.waitForTimeout(2500); await this.ev(() => window.__A.dismiss(20));
    const fl = await this.ev(() => window.__A.flags());
    this.rec(`f${f}: the boss ${this.bossId} fight starts from its marker and is won; boss.${this.bossId}.defeated is set`, !!(fr.entered && fr.won && fl[`boss.${this.bossId}.defeated`]), fr);
    await page.waitForTimeout(1200); await this.shot(`f${f}-after-boss`);
    return !!(fr.entered && fr.won);
  }
  async exitByBossCell(asset, LM = this.LM, what = 'leaving after the boss returns her to the remapped overworld exit') {
    const page = this.page; let how = '';
    const t = await this.ev(([x, y]) => window.__A.tile(x, y), [asset.x, asset.y]); how = 'boss-cell tile ' + t;
    await page.waitForTimeout(400);
    const s = await this.st(); await this.ev(([vx, vy]) => window.__A.push(vx, vy, 1500), [(asset.x + .5) * CELL - s.hx, (asset.y + .5) * CELL - s.hy]);
    await page.waitForTimeout(600);
    if ((await L.pos(page)).map === this.id) { how += ' -> walked into it'; await this.pilot(); await this.go({ centre: [asset.x, asset.y] }, { hold: 900 }); }
    await page.waitForTimeout(2500); const p = await L.pos(page);
    this.rec(what, p.map === 'overworld' && p.x === LM.exit[0] && p.y === LM.exit[1], { how, p });
    await page.waitForTimeout(1200); await this.shot('exit-overworld');
    return p.map === 'overworld';
  }
  async finish() {
    const bad = (this.errors || []).filter(e => !/favicon|audio|\.mp3|\.ogg/.test(e.m));
    this.rec('no page errors or failed requests', bad.length === 0, bad.slice(0, 5));
    try { await this.browser.close(); } catch (e) {}
    const fail = this.rows.filter(r => r.status === 'FAIL').length;
    console.log(`${this.name}: ${this.rows.length} checks, ${fail} FAIL`);
    return fail;
  }
}
const manifest = () => JSON.parse(fs.readFileSync(process.env.D2_MANIFEST || path.join(ROOT, 'public/acts-dungeons/manifest.json'), 'utf8'));
module.exports = { Run, L, CELL, manifest, ROOT };
