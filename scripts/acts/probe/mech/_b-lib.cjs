'use strict';
// Shared runner for the batch B mechanic probes (Magma Tunnels, Volcanic Forge, Demon Barracks,
// Frostfall Cavern, Stormreach Spire, Sunken Temple, Twilight Realm, Void Rift): one probe per
// mechanic beside this file. Pattern of scripts/acts/probe/dungeon_authored.cjs and of batch A's
// _a-lib.cjs: a v4 save outside the dungeon, Continue, a real walk into the mouth (AGENTS.md rule
// 7), then the probe's own play-through with the stick, the prompt pill and the Z key.
//
// Four of these dungeons are not on the main overworld: their mouth is on the bundle's own portal
// isle (frostfallPeaks, stormreachIsles, sunkenTempleIsle, twilightRealm), so the save starts on
// the isle where the dungeon puts her back out (25,10) and she walks into the isle's dungeon tile.
//
//   NODE_PATH=/opt/node-tools/node_modules PROBE_URL=http://127.0.0.1:5260/ PROBE_OUT=<dir> \
//     flock /home/user/work/e2/heavy.lock.$((RANDOM%2)) node scripts/acts/probe/mech/<mechanic-id>.cjs
// PROBE_SHOTS (default /mnt/project-files/edu-rpg/acts-integration/dungeons-e2) / <dungeon id> / NN-tag.jpg
// D2_PLANS (default /home/user/work/plans/out) holds the plan JSON each probe solves from.
const fs = require('fs'), path = require('path');
const L = require('../lib.cjs');
const PT = require('../playthrough/ptio.cjs');
const ROOT = path.resolve(__dirname, '../../../..');
const PILOT = fs.readFileSync(path.join(__dirname, '_b-pilot.js'), 'utf8');
// Every authored dungeon ships enabled since 06f799c: the smoke flag is opt-in (D2_SMOKE=1) for a disabled entry.
const SMOKE_EXTRA = process.env.D2_SMOKE === '1' ? { 'qok-dungeons2-smoke': '1' } : {}, SMOKE_NOTE = process.env.D2_SMOKE === '1' ? ' (smoke flag on)' : '';
const SHOTS = process.env.PROBE_SHOTS || '/mnt/project-files/edu-rpg/acts-integration/dungeons-e2';
const PLANS = process.env.D2_PLANS || '/home/user/work/plans/out';
const acts = JSON.parse(fs.readFileSync(path.join(ROOT, 'public/acts-hifi/manifest.json'), 'utf8'));
const INV = ['herb*5', 'flameCloak', 'windbreakerStone'].map(s => ({ itemId: s.split('*')[0], quantity: +(s.split('*')[1] || 1) }));
const QUESTS = ['owlsLesson', 'drakeCargo', 'lunasMap', 'ancientRelic', 'flameCloak', 'lunasProphecy'];
const ISLE = { frostfallCavern: 'frostfallPeaks', stormreachSpire: 'stormreachIsles', sunkenTempleDungeon: 'sunkenTempleIsle', twilightDungeon: 'twilightRealm' };
const ISLE_BACK = [25, 10];
// every boss of the bundle's own table (its entrance locks ask for some of them: Volcanic Forge wants the Sand Golem down)
const BUNDLE_BOSSES = ['ashenGuardian', 'banditLord', 'celestialGuardian', 'coralTitan', 'crystalHydra', 'dragon', 'flameTitan', 'frostMonarch', 'giantCrab', 'giantToad', 'iceWyrm',
  'lavaWyrm', 'magmaBeetleKing', 'mosswarden', 'nullDevourer', 'oreColossus', 'phantomStag', 'sandGolem', 'sandSerpentQueen', 'serpent', 'stormHarpy', 'stormSentinel', 'swordWraith', 'warGeneralMalachar'];
const CELL = 48;
const plan = (id, f) => JSON.parse(fs.readFileSync(path.join(PLANS, `${id}-f${f}.json`), 'utf8'));

class Run {
  // extra: in-page source of the probe's own helpers, injected after the pilot on every (re)load
  constructor(id, { bossId, flags = {}, name = id, extra = '', inventory = [] } = {}) { this.id = id; this.bossId = bossId; this.seedFlags = flags; this.rows = []; this.n = 0; this.name = name; this.extra = extra; this.inventory = inventory;   // inventory: item ids the dungeon's own door asks for (the Demon Castle's four relics)
    this.dir = path.join(SHOTS, id) + '/'; fs.mkdirSync(this.dir, { recursive: true }); fs.mkdirSync(L.OUT, { recursive: true });
    for (const f of fs.readdirSync(this.dir)) if (/^\d\d-.*\.jpg$/.test(f)) { try { fs.unlinkSync(path.join(this.dir, f)); } catch (e) {} }   // this run's shots only
  }
  rec(check, ok, note) { const r = { dungeon: this.id, check, status: ok === true ? 'PASS' : ok === false ? 'FAIL' : String(ok), note: note === undefined ? '' : (typeof note === 'string' ? note : JSON.stringify(note)).slice(0, 700) };
    this.rows.push(r); console.log(`[${r.status}] ${this.id}: ${check}${r.note ? ' -- ' + r.note : ''}`);
    fs.writeFileSync(path.join(L.OUT, `${this.name}.json`), JSON.stringify(this.rows, null, 1)); return ok === true; }
  ev(fn, arg) { return this.page.evaluate(fn, arg); }
  st() { return this.ev(() => window.__B.state()); }
  async shot(tag) { this.n++; const f = path.join(this.dir, `${String(this.n).padStart(2, '0')}-${tag}.jpg`);
    await this.page.screenshot({ path: f, type: 'jpeg', quality: 62 }).catch(e => console.log('shot fail', e.message)); return f; }
  // run `p` (a pending page call) and take each named screenshot the first time its in-page condition holds
  async watch(p, shots) { let done = false; const q = Promise.resolve(p).finally(() => { done = true; }); const left = shots.slice();
    while (!done && left.length) { for (let i = 0; i < left.length; i++) { const ok = await this.page.evaluate(left[i].when).catch(() => false); if (ok) { await this.shot(left[i].tag); left.splice(i, 1); break; } }
      await new Promise(r => setTimeout(r, 90)); }
    return q; }
  async pilot() { await this.page.evaluate(PILOT); if (this.extra) await this.page.evaluate(this.extra); }
  async settle(ms = 30000) {
    const ok = await this.page.waitForFunction(() => { const s = window.__B && window.__B.state(); return s && s.field && s.d2 && s.d2.art === 'ready' && s.d2.mask === 'ready' && s.d2.module && !s.waiting; }, { timeout: ms }).then(() => true).catch(() => false);
    await this.page.waitForTimeout(600); return ok; }
  async start() {
    const LM = acts.landmarks.find(l => l.mapId === this.id && !l.toFloor && !l.virtual); this.LM = LM || null; this.isle = ISLE[this.id] || null;
    this.LMout = acts.landmarks.find(l => l.mapId === this.id && l.toFloor && !l.virtual) || LM || null;   // a through-dungeon lets her out on its far side
    const flags = { ...L.allFlags(), ...Object.fromEntries(BUNDLE_BOSSES.map(b => [`boss.${b}.defeated`, true])), ...this.seedFlags }; if (this.bossId) delete flags[`boss.${this.bossId}.defeated`];
    const o = await L.launch(); this.browser = o.browser; this.page = o.page; this.errors = o.errors;
    const at = LM ? { mapId: 'overworld', x: LM.exit[0], y: LM.exit[1] } : { mapId: this.isle, x: ISLE_BACK[0], y: ISLE_BACK[1] };
    this.back = at;
    await L.bootSave(this.page, PT.seed() || L.save({ ...at, flags, inventory: INV.concat(this.inventory.map(itemId => ({ itemId, quantity: 1 }))), completedQuests: QUESTS }), { extra: SMOKE_EXTRA });   // PT_SAVE: the story playthrough's own record
    await this.pilot();
    if (LM) { const p = await L.pos(this.page); this.rec('seeded save loads on the overworld at the remapped exit', p.map === 'overworld' && p.x === LM.exit[0] && p.y === LM.exit[1], p); }
    else { const s = await this.st(); this.rec(`seeded save loads on the portal isle ${this.isle}` + (PT.active() ? '' : ' where the dungeon lets her out'), s.map === this.isle && (PT.active() || (s.x === ISLE_BACK[0] && s.y === ISLE_BACK[1])), [s.map, s.x, s.y]); }
    return this.enter();
  }
  async enter() {
    let r;
    if (this.LM) r = await L.walkCells(this.page, [[this.LM.at[0], this.LM.at[1]]], { maxMs: 25000 });
    else {                                                                    // the isle is the bundle's own stepped map: arrow keys, a tile at a time
      const m = await this.ev(() => window.__B.findTile(7)); this.mouth = m[0]; r = { ok: false, why: 'no dungeon tile on the isle' };
      if (m.length) {
        const [mx, my] = m[0], page = this.page;
        const step = async (dx, dy) => { const key = dx > 0 ? 'ArrowRight' : dx < 0 ? 'ArrowLeft' : dy > 0 ? 'ArrowDown' : 'ArrowUp', s0 = await this.ev(() => { const w = window.__PHASER_GAME__.scene.getScene('WorldMapScene'); return [w.currentMapId, w.heroTileX, w.heroTileY]; });
          await page.keyboard.down(key); let s1 = s0;
          for (let k = 0; k < 40 && s1.join() === s0.join(); k++) { await page.waitForTimeout(50); s1 = await this.ev(() => { const w = window.__PHASER_GAME__.scene.getScene('WorldMapScene'); return [w.currentMapId, w.heroTileX, w.heroTileY]; }).catch(() => ['?', 0, 0]); }
          await page.keyboard.up(key); await page.waitForTimeout(120); return s1; };
        let s = await this.st(); const path = [];
        if (s.x === mx && s.y === my) {                                         // the dungeon lets her out ON its own tile: a step off it and back on is the way in
          const d = await this.ev(([x, y]) => { const B = window.__B, pass = t => [2, 4, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15, 16, 19, 20, 21].indexOf(t) < 0;
            return [[0, 1], [1, 0], [-1, 0], [0, -1]].find(d => pass(B.tile(x + d[0], y + d[1]))) || null; }, [mx, my]);
          if (d) path.push(d, [-d[0], -d[1]]); }
        else { const cells = await this.ev(([x, y]) => { const B = window.__B, w = window.__PHASER_GAME__.scene.getScene('WorldMapScene'), pass = t => [2, 4, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15, 16, 19, 20, 21].indexOf(t) < 0;
            const prev = new Map(), q = [[w.heroTileX, w.heroTileY]]; prev.set(q[0].join(), null);
            for (let h = 0; h < q.length; h++) { const [cx, cy] = q[h]; if (cx === x && cy === y) { const out = []; let c = q[h]; while (c) { out.push(c); c = prev.get(c.join()); } return out.reverse(); }
              for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) { const n = [cx + dx, cy + dy]; if (prev.has(n.join()) || B.tile(n[0], n[1]) === undefined) continue; if (!(n[0] === x && n[1] === y) && !pass(B.tile(n[0], n[1]))) continue; prev.set(n.join(), [cx, cy]); q.push(n); } }
            return null; }, [mx, my]);
          if (cells) for (let i = 1; i < cells.length; i++) path.push([cells[i][0] - cells[i - 1][0], cells[i][1] - cells[i - 1][1]]); }
        let last = null; for (const d of path) { last = await step(d[0], d[1]); if (last[0] !== this.isle) break; await this.page.waitForTimeout(250); }
        r = { ok: !!last && last[0] === this.id, steps: path.length, last, mouth: m[0] };
      } }
    await this.page.waitForTimeout(1200); await this.pilot();
    const okS = await this.settle(); const s = await this.st();
    this.rec(`walking into the ${this.LM ? 'overworld' : 'portal isle'} mouth enters floor 1 of the authored dungeon${SMOKE_NOTE}`, s.map === this.id && s.floor === 1 && okS && s.d2.mechanic !== null, { r, s });
    await L.noEncounters(this.page);
    return s.map === this.id;
  }
  go(goal, opts = {}) { return this.ev(([g, o]) => window.__B.go(g, o), [goal, opts]); }
  async tapPrompt(want) { const loc = this.page.locator('#a1mInteract.a1m-show').first(); const box = await loc.boundingBox().catch(() => null); if (!box) return null;
    const txt = await loc.textContent().catch(() => null); if (want && txt !== want) return null; await loc.tap({ timeout: 3000 }).catch(() => {}); await this.page.waitForTimeout(300); return txt; }
  // Walk up to an object cell, lean on it until the pill shows `verb`, tap it. Returns the verb tapped or null.
  async use(cx, cy, verb, opts = {}) {
    for (let k = 0; k < 3; k++) {
      const g = await this.go({ beside: [cx, cy], reach: opts.reach || 16 }, opts);
      if (!g.ok) { if (k === 2) return null; continue; }
      if (g.why === 'message') { await this.dismiss(); continue; }
      await this.ev(([cx, cy, v]) => window.__B.lean(cx, cy, 700, v), [cx, cy, verb || null]); await this.page.waitForTimeout(150);
      const t = await this.tapPrompt(verb); if (t) return t;
    }
    return null;
  }
  dismiss(n) { return this.ev(n => window.__B.dismiss(n || 14), n); }
  async fight(maxMs = 150000) {
    const page = this.page, t0 = Date.now(); let roundsN = 0, monster = null;
    const ok = await page.waitForFunction(() => window.__PHASER_GAME__.scene.isActive('BattleScene'), { timeout: 20000 }).then(() => true).catch(() => false);
    if (!ok) return { entered: false };
    // what hurt her, for a lost fight's record
    await page.evaluate(() => { const p = window.__GAME_STATE__.player; window.__DMG = []; if (p.__dmgHook) return; p.__dmgHook = true; const o = p.takeDamage;
      p.takeDamage = function (m) { try { window.__DMG.push([m, this.state.hp, this.totalDef]); } catch (e) {} return o.apply(this, arguments); }; }).catch(() => {});
    const dmg = () => page.evaluate(() => (window.__DMG || []).slice(-6)).catch(() => null);
    const tap = async (sel, timeout = 4000) => { const loc = page.locator(sel).first(); const dl = Date.now() + timeout; let box = null;
      while (Date.now() < dl) { box = await loc.boundingBox().catch(() => null); if (box && box.width >= 4) break; box = null; await page.waitForTimeout(150); } if (!box) return false; await loc.tap({ timeout: 4000 }).catch(() => {}); return true; };
    while (Date.now() - t0 < maxMs) {
      const s = await page.evaluate(() => { const g = window.__PHASER_GAME__, b = g.scene.getScene('BattleScene'); return { active: g.scene.isActive('BattleScene'), phase: b && b.phase, mon: b && b.monster && (b.monster.id || b.monster.nameKey), over: g.scene.isActive('GameOverScene') }; });
      if (!s.active) { await page.waitForTimeout(900); return Object.assign({ entered: true, won: !s.over, rounds: roundsN, monster }, s.over ? { dmg: await dmg() } : {}); }
      monster = monster || s.mon;
      if (s.phase === 'playerMenu') { await tap('[data-act="battleMenu"][data-i="0"]'); await page.waitForTimeout(500); }
      else if (/quiz/i.test(String(s.phase)) || (await page.evaluate(() => { const e = document.querySelector('#qok-ui .kpad, [data-act="quizAns"]'); return !!(e && e.offsetParent !== null); }))) {
        const idx = await page.evaluate(() => { const b = window.__PHASER_GAME__.scene.getScene('BattleScene'); const a = (b.quizQuestion && b.quizQuestion.answers) || []; return a.findIndex(x => !!x.isCorrect); }); roundsN++;
        if (idx < 0) await page.waitForTimeout(500); else { for (const qs of await L.quizTaps(page, idx)) await tap(qs); await page.waitForTimeout(800); } }
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
      const s = JSON.parse(raw); const d2 = {}; for (const k in s.player.storyFlags) if (k.indexOf('d2.') === 0) d2[k] = s.player.storyFlags[k]; return { pos: s.player.position, d2 }; });
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
      await this.ev(([cx, cy]) => window.__B.lean(cx, cy, 900), [asset.x, asset.y]); await page.waitForTimeout(200);
      if (await this.ev(() => window.__B.prompt())) await this.tapPrompt();
      for (let j = 0; j < 14 && !started; j++) { await this.ev(() => window.__B.tapKey('z')); await page.waitForTimeout(300); started = await page.evaluate(() => window.__PHASER_GAME__.scene.isActive('BattleScene')); } }
    const fr = started ? await this.fight() : { entered: false };
    await page.waitForTimeout(2500); await this.dismiss(20);
    const fl = await this.ev(() => window.__B.flags());
    this.rec(`f${f}: the boss ${this.bossId} fight starts from its marker and is won; boss.${this.bossId}.defeated is set`, !!(fr.entered && fr.won && fl[`boss.${this.bossId}.defeated`]), fr);
    await page.waitForTimeout(1200); await this.shot(`f${f}-after-boss`);
    return !!(fr.entered && fr.won);
  }
  async exitByBossCell(asset) {
    const page = this.page; let how = '';
    const t = await this.ev(([x, y]) => window.__B.tile(x, y), [asset.x, asset.y]); how = 'boss-cell tile ' + t;
    await this.ev(() => window.__B.settle());   // a quest that ends with the boss says so first
    const s = await this.st(); await this.ev(([vx, vy]) => window.__B.push(vx, vy, 1500), [(asset.x + .5) * CELL - s.hx, (asset.y + .5) * CELL - s.hy]);
    await page.waitForTimeout(600);
    if ((await this.ev(() => window.__PHASER_GAME__.scene.getScene('WorldMapScene').currentMapId)) === this.id) { how += ' -> walked into it'; await this.pilot(); await this.go({ centre: [asset.x, asset.y] }, { hold: 900 }); }
    await page.waitForTimeout(2500); await this.pilot();
    let ok, p;
    if (this.LM) { p = await L.pos(page); ok = p.map === 'overworld' && p.x === this.LMout.exit[0] && p.y === this.LMout.exit[1]; }
    else { const s2 = await this.st(); p = [s2.map, s2.x, s2.y]; ok = s2.map === this.isle && s2.x === ISLE_BACK[0] && s2.y === ISLE_BACK[1]; }
    this.rec(this.LM ? (this.LMout !== this.LM ? `leaving after the boss lets her out on the overworld at the far mouth's remapped exit (${this.LMout.name})` : 'leaving after the boss returns her to the remapped overworld exit') : `leaving after the boss returns her to the portal isle ${this.isle} at its dungeon exit`, ok, { how, p });
    await page.waitForTimeout(1200); await this.shot('exit');
    return ok;
  }
  async finish() {
    try { await PT.dump(this.page); } catch (e) {}
    const bad = (this.errors || []).filter(e => !/favicon|audio|\.mp3|\.ogg/.test(e.m));
    this.rec('no page errors or failed requests', bad.length === 0, bad.slice(0, 5));
    try { await this.browser.close(); } catch (e) {}
    const fail = this.rows.filter(r => r.status === 'FAIL').length;
    console.log(`${this.name}: ${this.rows.length} checks, ${fail} FAIL`);
    return fail;
  }
}
module.exports = { Run, L, CELL, plan, ROOT, PLANS };
