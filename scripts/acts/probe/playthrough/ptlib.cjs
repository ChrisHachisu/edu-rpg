'use strict';
// Story playthrough (E3) building blocks: one Session per browser, driven like a player.
//   * the save is the only thing carried between segments (ptio.cjs), so every story flag, quest,
//     item and gold piece is what the game itself wrote on the way;
//   * the hero's level and stats are lifted once (no grinding) and that is the only edit to a record,
//     besides "fast travel": moving her, on the overworld, to the exit cell of the next door;
//   * towns: a real walk in at the door, a real walk to each person (planned on the town's own
//     walkable polygons, followed with the arrow keys), the town's own talk button, a real walk out;
//   * dungeons: the overworld mouth by a real walk, then the mechanic probes (authored floors) or the
//     pilot's floor solver (the bundle's generated floors), boss fights won by answering the quiz.
const fs = require('fs'), path = require('path');
const L = require('../lib.cjs');
const PT = require('./ptio.cjs');
const ROOT = path.resolve(__dirname, '../../../..');
const PILOT = fs.readFileSync(path.join(__dirname, '../pilot.js'), 'utf8');
const OUTD = process.env.PT_DIR || '/home/user/work/e3/pt';
const SHOTS = process.env.PT_SHOTS || '/mnt/project-files/edu-rpg/acts-integration/playthrough-e3/';
fs.mkdirSync(OUTD, { recursive: true }); try { fs.mkdirSync(SHOTS, { recursive: true }); } catch (e) {}
const acts = JSON.parse(fs.readFileSync(path.join(ROOT, 'public/acts-hifi/manifest.json'), 'utf8'));
const FR = '#act1-hifi-preserved-root iframe';
// Act 1's own doors (act1-world-map.js LANDMARKS), in the same shape as the index's.
const A1 = (() => { const src = fs.readFileSync(path.join(ROOT, 'public/act1-world-map.js'), 'utf8'), m = /var LANDMARKS = (\[.*?\]);/.exec(src);
  return m ? JSON.parse(m[1]).map(l => ({ mapId: l.mapId, name: l.mapId, at: [l.at.x, l.at.y], exit: [l.exit.x, l.exit.y], tile: l.tile, act1: true })) : []; })();
acts.landmarks.push(...A1);
const door = (name) => { const d = acts.landmarks.find(l => l.name === name || (!l.toFloor && (l.virtual || l.mapId) === name)); if (!d) throw new Error('no door ' + name); return d; };

// In-page helper on top of pilot.js (__P): state, message log, the town frame's walker and talk.
const HELP = () => {
  if (window.__PTH) return;
  const G = () => window.__PHASER_GAME__, W = () => G().scene.getScene('WorldMapScene'), ST = () => window.__GAME_STATE__.player.state;
  const wait = ms => new Promise(r => setTimeout(r, ms));
  const frame = () => { const f = document.querySelector('#act1-hifi-preserved-root iframe'); return f && f.contentWindow && f.contentWindow.__ACT1_TOWN__ ? f : null; };
  const fkey = (type, key) => { const f = frame(); if (!f) return; f.contentWindow.dispatchEvent(new f.contentWindow.KeyboardEvent(type, { key, bubbles: true, cancelable: true })); };
  const held = new Set();
  const setKeys = want => { for (const k of ['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight']) { if (want.includes(k) && !held.has(k)) { held.add(k); fkey('keydown', k); } else if (!want.includes(k) && held.has(k)) { held.delete(k); fkey('keyup', k); } } };
  const town = () => { const f = frame(); if (!f) return null; const t = f.contentWindow.__ACT1_TOWN__, p = t.position(), c = t.town.worldPxPerCell; return { id: t.town.id, x: p.x, y: p.y, cx: p.x / c, cy: p.y / c, c, npcs: t.npcs.map(n => ({ id: n.id, x: n.point.x, y: n.point.y, name: n.name })), near: (t.nearestNpc() || {}).id || null, svc: (t.nearestService() || {}).kind || null, save: t.town.savePoint, exit: t.town.exit, start: t.town.startCell }; };
  // BFS on a 4 world-px grid over the town's own walkable test (polygons, static and NPC blockers).
  // `clear`: world px of room kept on every side of the planned line (her body is not a point), relaxed if nothing fits
  function plan(goal, step = 4, clear = 6) {
    const f = frame(); const t = f.contentWindow.__ACT1_TOWN__, p = t.position(), Wd = Math.ceil(t.town.cells * t.town.worldPxPerCell / step);
    const inside = (x, y) => t.isInsideWalkable({ x, y }), memo = new Map();
    // Right beside the goal (a person's body, a counter) there is no room to keep: the clearance is waived within 16 px of
    // it, and kept everywhere else, so one tight spot at the end does not send the whole route along the walls.
    const nearGoal = (x, y) => { for (const d of [0, 8, 16]) for (const [a, b] of [[d, 0], [-d, 0], [0, d], [0, -d], [d, d], [d, -d], [-d, d], [-d, -d]]) if (goal(x + a, y + b)) return true; return false; };
    const ok = (gx, gy) => { if (gx < 0 || gy < 0 || gx >= Wd || gy >= Wd) return false; const k = gx * 100000 + gy; let v = memo.get(k); if (v !== undefined) return v; const x = gx * step, y = gy * step;
      v = inside(x, y) && (!clear || (inside(x + clear, y) && inside(x - clear, y) && inside(x, y + clear) && inside(x, y - clear)) || nearGoal(x, y)); memo.set(k, v); return v; };
    const sx = Math.round(p.x / step), sy = Math.round(p.y / step), prev = new Map(), q = [[sx, sy]]; prev.set(sx + ',' + sy, null);
    for (let i = 0; i < q.length && i < 200000; i++) { const [x, y] = q[i];
      if (goal(x * step, y * step)) { const out = []; let k = x + ',' + y; while (k) { const [a, b] = k.split(',').map(Number); out.push([a * step, b * step]); k = prev.get(k); } return out.reverse(); }
      for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1], [1, 1], [1, -1], [-1, 1], [-1, -1]]) { const nx = x + dx, ny = y + dy, k = nx + ',' + ny; if (prev.has(k) || !ok(nx, ny)) continue; if (dx && dy && (!ok(x + dx, y) || !ok(x, y + dy))) continue; prev.set(k, x + ',' + y); q.push([nx, ny]); } }
    return clear ? plan(goal, step, clear > 3 ? 3 : 0) : null;
  }
  async function townWalk(goal, { maxMs = 60000, tol = 3 } = {}) {
    const pts = plan(goal); if (!pts) return { ok: false, why: 'nopath', at: town() };
    const t0 = performance.now(); let i = 0, last = null, stuck = 0;
    try {
      while (i < pts.length) {
        const f = frame(); if (!f) return { ok: true, why: 'left', i };
        if (performance.now() - t0 > maxMs) return { ok: false, why: 'timeout', i, n: pts.length, at: town() };
        const p = f.contentWindow.__ACT1_TOWN__.position(), dx = pts[i][0] - p.x, dy = pts[i][1] - p.y;
        if (Math.hypot(dx, dy) < tol) { i++; continue; }
        const k = []; if (dx > 1.2) k.push('ArrowRight'); if (dx < -1.2) k.push('ArrowLeft'); if (dy > 1.2) k.push('ArrowDown'); if (dy < -1.2) k.push('ArrowUp');
        setKeys(k); await new Promise(r => requestAnimationFrame(r));
        const n = f.contentWindow.__ACT1_TOWN__.position(); if (last && Math.hypot(n.x - last[0], n.y - last[1]) < 0.01) stuck++; else stuck = 0; last = [n.x, n.y];
        if (stuck > 120) { if (Math.hypot(dx, dy) < 9) { i++; stuck = 0; continue; } return { ok: false, why: 'stuck', i, n: pts.length, at: town() }; }
      }
      return { ok: true, why: 'arrived', n: pts.length, at: town() };
    } finally { setKeys([]); }
  }
  // Walk to the band from which the town lets her talk to `id` (below the person, owner rule) and press the talk key.
  async function walkToNpc(id) {
    const f = frame(); if (!f) return { ok: false, why: 'no town' }; const t = f.contentWindow.__ACT1_TOWN__, n = t.npcs.find(n => n.id === id); if (!n) return { ok: false, why: 'no npc ' + id, npcs: t.npcs.map(n => n.id) };
    const C = t.town.worldPxPerCell;
    // The band is the town's own (town.html inTalkBand / talkTargetAt, 2026-11-27: a person now keeps a body's space, so the
    // band's numbers moved, and two people standing close share ground where the nearer one takes the Talk); a build
    // without them has the numbers of before. She "arrives" within 3 px of the planned point, so a goal point must still
    // be hers 5 px away on every side.
    const mine = typeof t.talkTargetAt === 'function' ? (x, y) => t.talkTargetAt({ x, y }) === id : typeof t.inTalkBand === 'function' ? (x, y) => t.inTalkBand(id, { x, y }) : null;
    const band = mine ? (x, y) => mine(x, y) && mine(x - 5, y) && mine(x + 5, y) && mine(x, y - 5) && mine(x, y + 5) : null;
    const r = await townWalk((x, y) => Math.abs(x - n.point.x) <= C * 0.6 && y - n.point.y >= C * 0.45 && (band ? band(x, y) : y - n.point.y <= C * 1.6));
    // FT2 (2026-11-27): the result says which tier found the goal, and each walk logs it. `middle`: the comfortable middle
    // of the band; `band`: anywhere in it with 5 px of room; `sliver`: a single point where Talk names her, which a child
    // cannot find. The story robot counts a sliver as a FAIL (talk() and heal() below); so does town-looks.cjs.
    const done = (res, tier) => { const out = { ...res, tier }; try { console.log(`[PTH] walkToNpc ${id}: tier ${tier}, ${res.ok ? 'ok' : 'not ok'} (${res.why})`); } catch (e) {} return out; };
    if (r.ok || r.why !== 'nopath') return done(r, 'middle');
    // nothing in the comfortable middle of the band: anywhere in town.html's own band (|dx| <= 1.1, dy -0.35..2.1 cells)
    const r2 = await townWalk((x, y) => band ? band(x, y) : (Math.abs(x - n.point.x) <= C * 1.0 && y - n.point.y >= C * -0.25 && y - n.point.y <= C * 2.0));
    if (r2.ok || r2.why !== 'nopath' || !mine) return done(r2, 'band');
    return done(await townWalk(mine), 'sliver');     // a sliver of a band: any point of it
  }
  async function walkToCell(cx, cy, r = 0.5) { const f = frame(); if (!f) return { ok: false, why: 'no town' }; const C = f.contentWindow.__ACT1_TOWN__.town.worldPxPerCell; return townWalk((x, y) => Math.hypot(x - cx * C, y - cy * C) <= r * C); }
  const pressTalk = () => { fkey('keydown', 'Enter'); fkey('keyup', 'Enter'); };
  // message log (the parent's box), and whatever DOM dialogue shows
  let log = [];
  const hook = () => { const w = W(); if (!w || w.__pthHook) return; w.__pthHook = true; const o = w.showMessage; w.showMessage = function (t, n) { log.push({ t: String(t), n: n || null, map: w.currentMapId }); return o.apply(this, arguments); };
    const o2 = w.showDialogSequence; w.showDialogSequence = function (a, cb, n) { try { for (const t of a) log.push({ t: String(t), n: typeof n === 'string' ? n : null, seq: 1, map: w.currentMapId }); } catch (e) {} return o2.apply(this, arguments); }; };
  const questUi = () => { const e = document.querySelector('.qfq-entry.open, .qfq-entry'); const all = [...document.querySelectorAll('.qfq-entry')].map(s => s.innerText.replace(/\s+/g, ' ').trim()); const st = document.querySelector('.qfq-state'); return { entries: all, state: st ? st.innerText : null }; };
  function state() { const g = G(), w = W(), s = ST(); let comp = null; try { const c = w.getCompassTarget && w.getCompassTarget(); comp = c ? { ox: c.ox, oy: c.oy, id: c.mapId || c.id || null } : null; } catch (e) { comp = { err: String(e) }; }
    return { map: w.currentMapId, floor: w.currentFloor || 1, x: w.heroTileX, y: w.heroTileY, msg: !!w.showingMessage, scenes: g.scene.getScenes(true).map(s => s.scene.key), town: town(),
      hp: s.hp, maxHp: s.maxHp, gold: s.gold, level: s.level, active: [...s.activeQuests], done: [...s.completedQuests], progress: JSON.parse(JSON.stringify(s.questProgress || {})),
      bosses: Object.keys(s.storyFlags).filter(k => /^boss\..*\.defeated$/.test(k) && s.storyFlags[k]).map(k => k.split('.')[1]), inv: s.inventory.filter(i => i.quantity > 0).map(i => i.itemId + (i.quantity > 1 ? '*' + i.quantity : '')), compass: comp,
      overlay: !!(w.healerOverlayOpen || w.warpOverlayOpen || w.midCrystalOverlayOpen || w.questOverlayOpen || w.itemOverlayOpen), virtual: window.__QOK_MULTIACT__ ? window.__QOK_MULTIACT__.status().virtual : null }; }
  window.__PTH = { state, town, plan, townWalk, walkToNpc, walkToCell, pressTalk, setKeys, frame: () => !!frame(), hook, log: () => log, clear: () => { log = []; }, questUi, wait };
  hook();
};

class Session {
  constructor(seg) { this.seg = seg; this.rows = []; this.n = 0; this.t0 = Date.now(); this.notes = []; }
  rec(check, ok, note) {
    const r = { seg: this.seg, check, status: ok === true ? 'PASS' : ok === false ? 'FAIL' : String(ok), note: note === undefined ? '' : (typeof note === 'string' ? note : JSON.stringify(note)).slice(0, 900), t: Math.round((Date.now() - this.t0) / 1000) };
    this.rows.push(r); console.log(`[${r.status}] ${this.seg}: ${check}${r.note ? ' -- ' + r.note : ''}`);
    fs.appendFileSync(path.join(OUTD, 'rows.jsonl'), JSON.stringify(r) + '\n'); return ok === true; }
  async open(saveObj, { newGame = false } = {}) {
    const o = await L.launch(); Object.assign(this, { browser: o.browser, page: o.page, errors: o.errors });
    if (newGame) await this.newGame(); else await this.boot(saveObj);
  }
  async inject() { await this.page.evaluate(PILOT); await this.page.evaluate(HELP); await this.page.evaluate(() => { window.__P.hookMsgs(); window.__PTH.hook(); }); }
  async boot(s, { settle = 2500 } = {}) { await L.bootSave(this.page, s, { settle }); await this.inject(); }
  async newGame() {
    const page = this.page;
    await page.goto(L.URL_, { waitUntil: 'domcontentloaded' }); await page.evaluate(() => localStorage.clear()); await page.reload({ waitUntil: 'load' });
    await L.toTitle(page);
    // the five-slot title: Start -> an empty slot -> character setup (the phone's own path)
    await page.waitForSelector('[data-act="titleSlots"], [data-act="titleNew"]', { state: 'visible', timeout: 60000 });
    if (await page.locator('[data-act="titleSlots"]').count()) { await page.click('[data-act="titleSlots"]'); await page.click('[data-act="slotPick"][data-i="1"]'); }
    else await page.locator('[data-act="titleNew"]').click();
    await page.waitForSelector('[data-act="introStart"]', { timeout: 20000 });
    const name = page.locator('#qok-name'); if (await name.count()) await name.fill('Mika');
    await page.locator('[data-act="introStart"]').click();
    await page.waitForFunction(() => window.__PHASER_GAME__ && window.__PHASER_GAME__.scene.isActive('WorldMapScene'), { timeout: 60000 });
    await page.waitForFunction(() => { const r = document.querySelector('#act1-hifi-preserved-root'); return r && r.dataset.ready === 'true' && r.querySelector('iframe') && r.querySelector('iframe').contentWindow.__ACT1_TOWN__; }, { timeout: 90000 }).catch(() => {});
    await page.waitForTimeout(3000); await this.inject();
  }
  ev(fn, a) { return this.page.evaluate(fn, a); }
  st() { return this.ev(() => window.__PTH.state()); }
  async shot(tag) { this.n++; const f = path.join(SHOTS, `${this.seg}-${String(this.n).padStart(2, '0')}-${tag}.jpg`);
    await this.page.screenshot({ path: f, type: 'jpeg', quality: 55 }).catch(e => console.log('shot fail', e.message)); return path.basename(f); }
  // every message box she gets, read and closed with the action key (the parent's box and the town's own)
  async dismissAll(max = 40) { const lines = []; for (let i = 0; i < max; i++) { const s = await this.ev(() => { const w = window.__PHASER_GAME__.scene.getScene('WorldMapScene'), c = document.getElementById('qok-quest-completion'); return { msg: !!w.showingMessage, t: w.messageText && w.messageText.text, ov: !!(w.healerOverlayOpen || w.questOverlayOpen || w.midCrystalOverlayOpen || w.warpOverlayOpen), card: !!(c && !c.hidden) && ((c.querySelector('.qqc-title') || {}).textContent || '?') }; });
      // The quest-complete card (ui-overhaul) takes the keyboard until its Continue button is tapped.
      if (s.card) { lines.push('[quest complete] ' + s.card); await this.page.locator('#qok-quest-completion .qqc-dismiss').tap({ timeout: 4000 }).catch(() => {}); await this.page.waitForTimeout(400); continue; }
      if (!s.msg && !s.ov) break; if (s.t && lines[lines.length - 1] !== s.t) lines.push(s.t); await this.ev(() => window.__P.tapKey('z')); await this.page.waitForTimeout(320); }
    return lines; }
  // Lift level/stats once: the playthrough checks the story, not the grind (recorded in RESULTS).
  async buff() { await this.ev(() => { const s = window.__GAME_STATE__.player.state; Object.assign(s, { level: Math.max(s.level, 50), maxHp: 9999, hp: 9999, atk: 9999, def: 9999, spd: 999 }); if ('maxMp' in s) { s.maxMp = 999; s.mp = 999; } }); }
  async capture() { return JSON.parse(await PT.capture(this.page)); }
  async saveFile(name) { const s = await this.capture(); const f = path.join(OUTD, name + '.json'); fs.writeFileSync(f, JSON.stringify(s)); return f; }
  // Fast travel: the record, with her on the exit cell of `doorName`, continued from the title.
  async travel(doorName, { s = null } = {}) { const d = door(doorName); const sv = s || await this.capture(); sv.player.position = { mapId: 'overworld', x: d.exit[0], y: d.exit[1], floor: 1 };
    await this.boot(sv); await L.noEncounters(this.page); const p = await L.pos(this.page);
    this.rec(`fast travel to ${d.name}: Continue lands on its exit cell`, p.map === 'overworld' && p.x === d.exit[0] && p.y === d.exit[1], [p.map, p.x, p.y]); return d; }
  async walkInto(doorName, { maxMs = 25000 } = {}) { const d = door(doorName); if ((await this.st()).msg) await this.dismissAll();   // a line left open (a save repair, a quest) holds her
    const r = await L.walkCells(this.page, [d.at], { maxMs }); await this.page.waitForTimeout(1500); return r; }
  async enterTown(doorName) {
    const d = door(doorName), id = d.virtual || d.mapId;
    const r = await this.walkInto(doorName);
    await this.page.waitForFunction(() => { const f = document.querySelector('#act1-hifi-preserved-root iframe'); return !!(f && f.contentWindow && f.contentWindow.__ACT1_TOWN__); }, { timeout: 40000 }).catch(() => {});
    await this.page.waitForTimeout(3000); await this.inject();
    const s = await this.st(); const ok = !!(s.town && s.town.id === id);
    this.rec(`walks into ${d.name}: the town opens`, ok, { walk: r.why, map: s.map, town: s.town && s.town.id, msg: s.msg });
    await this.dismissAll(); return ok;
  }
  async talk(npc, { want = null, label = npc } = {}) {
    const page = this.page; await this.dismissAll(); await this.ev(() => window.__PTH.clear());
    const before = await this.st();
    const g = await this.ev(id => window.__PTH.walkToNpc(id), npc);
    await page.waitForTimeout(400); let near = await this.ev(() => window.__PTH.town() && window.__PTH.town().near);
    if (near !== npc) { await page.waitForTimeout(600); near = await this.ev(() => window.__PTH.town() && window.__PTH.town().near); }
    await this.ev(() => window.__PTH.pressTalk()); await page.waitForTimeout(900);
    let lines = await this.dismissAll();
    if (!lines.length) { await this.ev(() => window.__PTH.pressTalk()); await page.waitForTimeout(900); lines = await this.dismissAll(); }
    await page.waitForTimeout(600); lines = lines.concat(await this.dismissAll());
    const log = await this.ev(() => window.__PTH.log().map(m => m.t)); const after = await this.st();
    const started = after.active.filter(q => !before.active.includes(q)), finished = after.done.filter(q => !before.done.includes(q));
    // a walk that only found a one-point sliver of the band is a FAIL: the robot can stand on one point, a child cannot (FT2, 2026-11-27)
    const ok = g.ok && g.tier !== 'sliver' && near === npc && (log.length > 0 || lines.length > 0) && (!want || want(after, { started, finished, log }));
    this.rec(`talks to ${label}` + (want ? ' (story step)' : ''), ok, { walk: g.why, tier: g.tier, near, started, finished, shown: lines.map(t => t.slice(0, 200)) });
    return { ok, log, lines, started, finished, after };
  }
  async townSave() {
    const page = this.page; const s0 = await this.st(); if (!s0.town || !s0.town.save) { this.rec('town save point', false, 'no save point'); return false; }
    const g = await this.ev(([x, y]) => window.__PTH.walkToCell(x, y, 0.9), s0.town.save); await page.waitForTimeout(400);
    const svc = await this.ev(() => window.__PTH.town().svc);
    const t0 = await this.ev(() => { try { return JSON.parse(localStorage.getItem('edu-rpg-save') || 'null'); } catch (e) { return null; } });
    await this.ev(() => window.__PTH.pressTalk()); await page.waitForTimeout(1200); const lines = await this.dismissAll();
    const t1 = await this.ev(() => { try { return JSON.parse(localStorage.getItem('edu-rpg-save') || 'null'); } catch (e) { return null; } });
    const ok = g.ok && svc === 'save' && !!t1 && (!t0 || t1.timestamp > t0.timestamp) && t1.player.position.mapId === s0.map;
    this.rec(`saves at the ${s0.town.id} save point`, ok, { walk: g.why, svc, lines, pos: t1 && t1.player.position });
    return ok;
  }
  async heal() {
    const page = this.page; await this.ev(() => { const s = window.__GAME_STATE__.player.state; s.hp = Math.max(1, Math.floor(s.maxHp / 2)); });
    const g = await this.ev(() => window.__PTH.walkToNpc('healer')); await page.waitForTimeout(400);
    const gold0 = (await this.st()).gold; await this.ev(() => window.__PTH.pressTalk()); await page.waitForTimeout(1000);
    for (let i = 0; i < 6; i++) { const o = await this.ev(() => !!window.__PHASER_GAME__.scene.getScene('WorldMapScene').healerOverlayOpen); if (!o) break; await this.ev(() => window.__P.tapKey('z')); await page.waitForTimeout(500); }
    const lines = await this.dismissAll(); const s = await this.st();
    this.rec('the healer restores her (inn/healer service)', g.ok && g.tier !== 'sliver' && s.hp === s.maxHp, { walk: g.why, tier: g.tier, hp: [s.hp, s.maxHp], gold: [gold0, s.gold], lines });
  }
  async leaveTown() {
    const page = this.page; await this.dismissAll(); const s0 = await this.st(); const ex = s0.town && s0.town.exit; if (!ex) return false;
    const north = ex.axis === 'north';
    let wk = null; for (let k = 0; k < 3; k++) { wk = await this.ev(([x, y]) => window.__PTH.walkToCell(x, y, 0.7), s0.town.start || [ex.cell[0], ex.cell[1] + (north ? 1.5 : -1.5)]); if (wk.ok) break; await this.dismissAll(); await page.waitForTimeout(500); }
    let gone = false; const key = north ? 'ArrowUp' : 'ArrowDown';
    await this.ev(k => window.__PTH.setKeys([k]), key);
    for (let i = 0; i < 60 && !gone; i++) { await page.waitForTimeout(250); gone = !(await this.ev(() => window.__PTH.frame())); }
    await this.ev(() => window.__PTH.setKeys([])).catch(() => {});
    for (let i = 0; i < 40; i++) { await page.waitForTimeout(250); const a = await this.ev(() => { const a = window.__ACT1_EXIT_ART__; return a && a.status; }); if (a && a.status !== 'WAITING' && a !== 'WAITING') break; }
    await page.waitForTimeout(1500); await this.inject(); await L.noEncounters(page);
    const p = await L.pos(page); const ok = gone && p.map === 'overworld';
    let diag = null; if (!ok) { await this.shot('leave-fail-' + s0.town.id); diag = await this.ev(() => { const f = document.querySelector('#act1-hifi-preserved-root iframe'), w = window.__PHASER_GAME__.scene.getScene('WorldMapScene');
      return { msg: w.showingMessage, text: w.messageText && w.messageText.text, parentDialogue: f && f.contentDocument && f.contentDocument.body.dataset.parentDialogue, blocked: f && f.contentDocument && f.contentDocument.body.dataset.parentInputBlocked, town: window.__PTH.town(), scenes: window.__PHASER_GAME__.scene.getScenes(true).map(s => s.scene.key), dlg: f && f.contentDocument && f.contentDocument.querySelector('#dialogue') && f.contentDocument.querySelector('#dialogue').dataset.open }; }).catch(e => String(e)); }
    this.rec(`walks out of ${s0.town.id}`, ok, { at: [p.map, p.x, p.y], walk: wk && wk.why, diag }); return ok;
  }
  async fight(maxMs = 180000, { lose = false } = {}) {
    const page = this.page, t0 = Date.now(); let rounds = 0, monster = null;
    const ok = await page.waitForFunction(() => window.__PHASER_GAME__.scene.isActive('BattleScene'), { timeout: 20000 }).then(() => true).catch(() => false);
    if (!ok) return { entered: false };
    const tap = async (sel, timeout = 4000) => { const loc = page.locator(sel).first(); const dl = Date.now() + timeout; let box = null;
      while (Date.now() < dl) { box = await loc.boundingBox().catch(() => null); if (box && box.width >= 4) break; box = null; await page.waitForTimeout(150); } if (!box) return false; await loc.tap({ timeout: 4000 }).catch(() => {}); return true; };
    while (Date.now() - t0 < maxMs) {
      const s = await page.evaluate(() => { const g = window.__PHASER_GAME__, b = g.scene.getScene('BattleScene'); return { active: g.scene.isActive('BattleScene'), phase: b && b.phase, mon: b && b.monster && (b.monster.id || b.monster.nameKey), over: g.scene.isActive('GameOverScene') }; });
      if (s.over) return { entered: true, won: false, lost: true, rounds, monster };
      if (!s.active) { await page.waitForTimeout(900); const over = await page.evaluate(() => window.__PHASER_GAME__.scene.isActive('GameOverScene')); return { entered: true, won: !over, lost: over, rounds, monster }; }
      monster = monster || s.mon;
      if (s.phase === 'playerMenu') { await tap('[data-act="battleMenu"][data-i="0"]'); await page.waitForTimeout(500); }
      else if (/quiz/i.test(String(s.phase)) || (await page.evaluate(() => { const e = document.querySelector('#qok-ui .kpad, [data-act="quizAns"]'); return !!(e && e.offsetParent !== null); }))) {
        const idx = await page.evaluate(lose => { const b = window.__PHASER_GAME__.scene.getScene('BattleScene'); const a = (b.quizQuestion && b.quizQuestion.answers) || []; return lose ? a.findIndex(x => !x.isCorrect) : a.findIndex(x => !!x.isCorrect); }, lose); rounds++;
        if (idx < 0) await page.waitForTimeout(500); else { for (const qs of await L.quizTaps(page, idx)) await tap(qs); await page.waitForTimeout(800); } }
      else if (s.phase === 'message') { const t = await tap('[data-act="battleAdvance"]', 1500); if (!t) await page.mouse.click(195, 600).catch(() => {}); await page.waitForTimeout(450); }
      else { await page.waitForTimeout(300); await tap('[data-act="battleAdvance"]', 400); }
    }
    return { entered: true, won: false, timeout: true, rounds, monster };
  }
  // A dungeon of the bundle's generated (or Act 1 authored) floors, by the pilot's floor solver:
  // stairs down on every floor, the boss on the last, then its way out. Returns where she ended.
  async solveDungeon(id, { maxFloors = 12, maxMs = 1500000 } = {}) {
    const page = this.page, t0 = Date.now(), log = []; let boss = null;
    for (let k = 0; k < 60 && Date.now() - t0 < maxMs; k++) {
      await L.noEncounters(page);
      const s = await this.st();
      if (s.map !== id) { log.push('left->' + s.map); break; }
      if (s.scenes.includes('BattleScene')) { const fr = await this.fight(); boss = boss || fr; log.push('fight:' + JSON.stringify(fr)); await page.waitForTimeout(2500); await this.dismissAll(); await this.inject(); continue; }
      if (s.msg || s.overlay) { const l = await this.dismissAll(); if (s.overlay) { await this.ev(() => window.__P.tapKey('x')); await page.waitForTimeout(300); } log.push('msg:' + l.join(' | ').slice(0, 160)); continue; }
      const f0 = s.floor; if (!this._shotFloors) this._shotFloors = new Set(); if (!this._shotFloors.has(id + f0)) { this._shotFloors.add(id + f0); await this.shot(`${id}-f${f0}`); }
      const r = await this.ev(() => window.__P.solveFloor({ free: true, lava: true })).catch(e => ({ ok: false, why: 'threw ' + String(e).slice(0, 200) }));
      log.push(`f${f0}:` + r.why + (r.notes ? ' ' + r.notes.slice(-3).join(';').slice(0, 200) : ''));
      await page.waitForTimeout(1500); await this.inject();
      if (!r.ok && r.why !== 'scene') { const s2 = await this.st(); if (s2.map === id && s2.floor === f0 && !s2.scenes.includes('BattleScene') && !s2.msg) {
        // no path right after arriving: the floor's walk mask may still be loading on a busy machine; wait and look again
        if (r.why === 'nopath') { if (!this._nopath) this._nopath = {}; const kN = id + f0; this._nopath[kN] = (this._nopath[kN] || 0) + 1; if (this._nopath[kN] <= 3) { log.push('nopath-wait'); await page.waitForTimeout(4000); await this.inject(); continue; } }
        // she can end up standing on the boss without the bump having started the fight: the game then offers its Battle pill
        const pill = page.locator('#a1mInteract.a1m-show').first();
        if (!this._pills) this._pills = 0;
        if (this._pills < 6 && (await pill.boundingBox().catch(() => null))) { this._pills++; const txt = await pill.textContent().catch(() => ''); await pill.tap({ timeout: 3000 }).catch(() => {}); await page.waitForTimeout(1200); log.push('pill:' + txt); continue; }
        // the solver's bump on a boss is marginal (it pushes from one side only): walk to each open side of the boss in turn,
        // lean on it, and take the game's Battle pill if the lean alone did not start the fight
        if (!this._sides) this._sides = {};
        const bossAt = await this.ev(() => { const w = window.__PHASER_GAME__.scene.getScene('WorldMapScene'), md = w.mapData; for (let y = 0; y < md.length; y++) for (let x = 0; x < md[y].length; x++) if (md[y][x] === 7) return [x, y]; return null; });
        const kS = id + f0; this._sides[kS] = this._sides[kS] || 0;
        if (bossAt && this._sides[kS] < 2) { this._sides[kS]++; let started = false;
          // the game's bump looks 24 px ahead of her SOLES (about 31 px under the sprite centre): lean from the soles toward the boss tile
          const lean = () => this.ev(async ([bx, by]) => { const w = window.__PHASER_GAME__.scene.getScene('WorldMapScene'), t0 = performance.now();
            while (performance.now() - t0 < 900 && !w.showingMessage && window.__PHASER_GAME__.scene.isActive('WorldMapScene')) { const vx = bx * 48 + 24 - w.hero.x, vy = by * 48 + 24 - (w.hero.y + 31), l = Math.hypot(vx, vy) || 1;
              window.__DQ_STICK__ = { x: vx / l, y: vy / l, m: 1 }; await new Promise(r => requestAnimationFrame(r)); }
            window.__DQ_STICK__ = { x: 0, y: 0, m: 0 }; }, bossAt);
          const tryNow = async tag => { await lean(); await page.waitForTimeout(300);
            if (await pill.boundingBox().catch(() => null)) { await pill.tap({ timeout: 3000 }).catch(() => {}); await page.waitForTimeout(800); }
            const s3 = await this.st(), on = s3.msg || s3.scenes.includes('BattleScene') || s3.map !== id; log.push(`${tag}:${on ? 'started' : '-'}`); return on; };
          for (let j = 0; j < 2 && !started; j++) started = await tryNow('lean');
          for (const [dx, dy] of [[0, 1], [1, 0], [-1, 0], [0, -1]]) { if (started) break;
            await this.ev(([x, y]) => window.__P.fineWalk(x, y, { bump: false, maxMs: 30000 }).catch(e => ({ ok: false, why: String(e).slice(0, 80) })), [bossAt[0] + dx, bossAt[1] + dy]);
            started = await tryNow(`side:${dx},${dy}`); }
          if (started) continue; }
        log.push('STUCK ' + JSON.stringify(r).slice(0, 400)); break; } }
    }
    const end = await this.st();
    return { end: { map: end.map, floor: end.floor, x: end.x, y: end.y }, boss, log };
  }
  async questLog() { return this.ev(() => window.__PTH.questUi()); }
  async noErrors() { const bad = (this.errors || []).filter(e => !/favicon|audio|\.mp3|\.ogg/.test(e.m)); this.rec('no page errors or failed requests in this segment', bad.length === 0, bad.slice(0, 6)); }
  async close() { try { await this.browser.close(); } catch (e) {} }
  async frameStats(ms = 4000) { return this.ev(async ms => { const d = []; let p = performance.now(); const t0 = p; while (performance.now() - t0 < ms) { await new Promise(r => requestAnimationFrame(r)); const n = performance.now(); d.push(n - p); p = n; } d.sort((a, b) => a - b); return { frames: d.length, mean: +(d.reduce((a, b) => a + b, 0) / d.length).toFixed(1), p95: +d[Math.floor(d.length * .95)].toFixed(1) }; }, ms); }
}
module.exports = { Session, door, acts, OUTD, SHOTS, L, PT, ROOT };
