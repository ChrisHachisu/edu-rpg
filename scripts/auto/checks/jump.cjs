'use strict';
// Testers' "Jump to" menu (Settings > "Testers: Jump to…", public/ui-overhaul.js TESTERS JUMP).
//   NODE_PATH=/opt/node-tools/node_modules PROBE_URL=http://127.0.0.1:5505/ node scripts/auto/checks/jump.cjs [--group 1 --of 10] [--only id,id] [--off] [--shots dir]
// With the flag on (the shipped line `window.__QOK_TESTERS__ = true`), for every point of
// public/acts-hifi/jump-points.json (or the --group slice of them): real taps through the menu, wait for the
// field, then: the map / floor / cell are the point's, the hero stands on walkable ground and can take a step,
// no quest card or quest change popped on arrival, the player's own save slots were not written, no page errors.
// --off (also run by group 1): that line flipped to false (served copy rewritten in flight): no row, no fetch.
// One Chromium per run. [PASS]/[FAIL] lines; exit 1 on any FAIL.
const fs = require('fs'), path = require('path'), os = require('os');
process.env.PROBE_OUT = process.env.PROBE_OUT || path.join(os.tmpdir(), 'qok-jump-check');
const L = require('../../acts/probe/lib.cjs');
const ROOT = path.resolve(__dirname, '../../..');
const arg = (k, d) => { const i = process.argv.indexOf('--' + k); return i > 0 ? process.argv[i + 1] : d; };
const GROUP = +arg('group', 1), OF = +arg('of', 1), ONLY = arg('only', ''), SHOTS = arg('shots', ''), OFF = process.argv.includes('--off');
const DATA = JSON.parse(fs.readFileSync(path.join(ROOT, 'public/acts-hifi/jump-points.json'), 'utf8'));
const MAN = JSON.parse(fs.readFileSync(path.join(ROOT, 'public/acts-hifi/manifest.json'), 'utf8'));
const A1F = JSON.parse(fs.readFileSync(path.join(ROOT, 'public/act1-dungeon-floors.json'), 'utf8')).floors;
const DMAN = JSON.parse(fs.readFileSync(path.join(ROOT, 'public/acts-dungeons/manifest.json'), 'utf8'));
const ENGINE = (() => { try { return JSON.parse(fs.readFileSync(path.join(ROOT, 'scripts/auto/jump/engine-cells.json'), 'utf8')).dungeons; } catch (e) { return {}; } })();
const FLAG_LINE = 'window.__QOK_TESTERS__ = true;';
let pass = 0, fail = 0;
const rec = (name, ok, note) => { if (ok) pass++; else fail++; console.log(`[${ok ? 'PASS' : 'FAIL'}] ${name}${note ? ' -- ' + (typeof note === 'string' ? note : JSON.stringify(note)).slice(0, 600) : ''}`); return ok; };
const log = (...a) => console.log('[INFO]', ...a);

// every point, in menu order, with the taps that reach it
const ALL = [];
DATA.acts.forEach((a, ai) => a.places.forEach((pl, pi) => pl.points.forEach((pt, ki) => ALL.push({ ai, pi, ki, pl, pt, town: pl.kind === 'town' }))));
let pts = ALL;
if (ONLY) { const w = ONLY.split(','); pts = ALL.filter(p => w.some(x => p.pt.id === x || p.pl.id === x || p.pt.id.startsWith(x + ':'))); }
else if (OF > 1) { const n = Math.ceil(ALL.length / OF); pts = ALL.slice((GROUP - 1) * n, GROUP * n); }

// walkable ground, from the same data the game draws (dungeon rows, overworld reach)
const reach = (() => { const R = MAN.reach, g = R.rows.map(r => { const a = []; for (const p of r.split(',')) { const [v, n] = p.split(':'); for (let i = 0; i < +n; i++) a.push(+v); } return a; }); return (x, y) => !!(g[y] && g[y][x] === 1); })();
function floorRows(id, n) { const k = `${id}-f${n}`; const f = A1F[k] || DMAN.floors[k]; return f ? f.rows : null; }
function walkableCell(pos) {
  if (pos.mapId === 'overworld') return reach(pos.x, pos.y) ? true : null;      // Act 1 has its own walk bake: null = not judged from data
  const rows = floorRows(pos.mapId, pos.floor); if (!rows) return null;
  const r = rows[pos.y]; return !!r && r[pos.x] === '.';
}

async function tap(page, sel, timeout = 8000) {
  const t0 = Date.now();
  while (Date.now() - t0 < timeout) {
    const loc = page.locator(sel).first();
    if (await loc.isVisible().catch(() => false)) { try { await loc.scrollIntoViewIfNeeded({ timeout: 1500 }); await loc.tap({ timeout: 3000 }); return true; } catch (e) {} }
    await page.waitForTimeout(150);
  }
  return false;
}
const state = page => page.evaluate(() => {
  const g = window.__PHASER_GAME__, w = g && g.scene.getScene('WorldMapScene'), c = window.__QOK_COVER__;
  let town = null; try { const f = document.querySelector('#act1-hifi-preserved-root iframe'), T = f && f.contentWindow && f.contentWindow.__ACT1_TOWN__;
    if (T && document.body.classList.contains('act1-hifi-active')) { const p = typeof T.position === 'function' ? T.position() : T.position; const t = typeof T.town === 'function' ? T.town() : T.town;
      town = { id: t && (t.id || t), x: p && p.x, y: p && p.y, inside: p && T.isInsideWalkable ? !!T.isInsideWalkable(p) : null, start: t && t.startCell }; } } catch (e) { town = { err: String(e) }; }
  const sp = window.__DQ_TILES__ && window.__DQ_TILES__.overworldSpace, ow = w && w.currentMapId === 'overworld';
  const st = window.__GAME_STATE__ && window.__GAME_STATE__.player && window.__GAME_STATE__.player.state;
  const card = document.getElementById('qok-quest-completion');
  let qs = null; try { const s = window.__QOK_MULTIACT__.status().stats; qs = { starts: s.questStarts || 0, ends: s.questEnds || 0 }; } catch (e) {}
  return { scenes: g ? g.scene.getScenes(true).map(s => s.scene.key) : [], map: w && w.currentMapId, floor: w && w.currentFloor, x: w && w.heroTileX, y: w && w.heroTileY,
    hx: w && w.hero && w.hero.x, hy: w && w.hero && w.hero.y, cx: ow && sp && w.hero ? Math.floor(sp.toCanonical(w.hero.x) / 48) : null, cy: ow && sp && w.hero ? Math.floor(sp.toCanonical(w.hero.y) / 48) : null,
    cover: c && c.phase ? c.phase() : null, msg: !!(w && w.showingMessage), town, card: !!(card && !card.hidden && card.offsetParent !== null), qs,
    active: st ? st.activeQuests.slice() : null, done: st ? st.completedQuests.slice() : null, level: st && st.level, flags: st ? Object.keys(st.storyFlags).length : 0,
    jump: window.__QOK_JUMP_LAST__ || null, activeSlot: localStorage.getItem('qok-active-slot') };
});
const slotsSnap = page => page.evaluate(() => { const o = {}; for (let i = 0; i < localStorage.length; i++) { const k = localStorage.key(i); if (/^qok-slot-/.test(k)) o[k] = localStorage.getItem(k); } return o; });

async function openSettings(page) {
  for (let i = 0; i < 3; i++) {
    await page.evaluate(() => { try { window.__GAME_STATE__.encounterManager.onStep = () => null; } catch (e) {} });
    await tap(page, '#fieldTabs [data-fi="3"]', 4000);
    const ok = await page.waitForSelector('#qok-ui [data-act="setting"]', { timeout: 6000 }).then(() => true).catch(() => false);
    if (ok) return true;
    await page.keyboard.press('z').catch(() => {}); await page.waitForTimeout(800);       // a message box in the way
  }
  return false;
}
// The field is ready: the world scene runs at the point's map, the load cover is gone, and the map's own art is in.
const SETTLE = p => {          // '' when the field is ready, else what it still waits for
  const g = window.__PHASER_GAME__, w = g && g.scene.getScene('WorldMapScene'); if (!w || !g.scene.isActive('WorldMapScene') || !w.hero) return 'world scene';
  if (w.currentMapId !== p.mapId) return 'map ' + w.currentMapId;
  const c = window.__QOK_COVER__; if (c && c.phase && c.phase() !== 'active') return 'cover ' + c.phase();
  if (w.__a1dEntryWaiting) return 'a1d entry';
  const d = window.__QOK_DNG2__; if (d && p.dungeon && d.state && d.state().loaded && d.state().merged) { const s = d.state(); if (s.art !== 'ready' || s.mask !== 'ready') return 'dungeon art ' + s.art + '/' + s.mask; }
  if (p.town) { const f = document.querySelector('#act1-hifi-preserved-root iframe'); if (!(f && f.contentWindow && f.contentWindow.__ACT1_TOWN__)) return 'town runtime'; }
  return '';
};
async function settle(page, pos, ms = 45000) {
  const arg = { ...pos, town: !!pos.hifiTown, dungeon: !!pos.dungeon };
  const ok = await page.waitForFunction(`(${SETTLE})(${JSON.stringify(arg)}) === ''`, null, { timeout: ms, polling: 200 }).then(() => true).catch(() => false);
  const why = ok ? '' : await page.evaluate(`(${SETTLE})(${JSON.stringify(arg)})`).catch(e => String(e));
  await page.waitForTimeout(1500);
  return { ok, why };
}
async function step(page, isTown, noBack) {
  if (isTown) await page.waitForFunction(() => { const f = document.querySelector('#act1-hifi-preserved-root iframe'), T = f && f.contentWindow && f.contentWindow.__ACT1_TOWN__; return !!(T && T.position); }, null, { timeout: 15000 }).catch(() => {});
  const where = () => page.evaluate(t => { if (t) { const f = document.querySelector('#act1-hifi-preserved-root iframe'), T = f && f.contentWindow && f.contentWindow.__ACT1_TOWN__; if (!T || !document.body.classList.contains('act1-hifi-active')) return [0, 0, 'left the town', 0]; const p = typeof T.position === 'function' ? T.position() : T.position; return [p.x, p.y, 'town', 1]; }
    const w = window.__PHASER_GAME__.scene.getScene('WorldMapScene'); return [w.hero.x, w.hero.y, w.currentMapId, w.currentFloor]; }, isTown);
  // the painted town takes keys inside its frame (as ptlib's walker drives it); the field takes the stick
  const KEY = { '0,1': 'ArrowDown', '1,0': 'ArrowRight', '-1,0': 'ArrowLeft', '0,-1': 'ArrowUp' };
  let keys = false;              // the bundle's own tile maps (portal isles, their villages) walk on the arrow keys
  const push = async (dx, dy) => {
    if (!isTown && keys) { const k = KEY[dx + ',' + dy]; await page.keyboard.down(k); await page.waitForTimeout(400); await page.keyboard.up(k); return; }
    if (!isTown) return L.stick(page, dx, dy, 450);
    const k = KEY[dx + ',' + dy], fk = (type, key) => page.evaluate(([type, key]) => { const f = document.querySelector('#act1-hifi-preserved-root iframe'); f.contentWindow.dispatchEvent(new f.contentWindow.KeyboardEvent(type, { key, bubbles: true, cancelable: true })); }, [type, key]);
    await fk('keydown', k); await page.waitForTimeout(450); await fk('keyup', k);
  };
  for (const [dx, dy, kb] of isTown ? [[0, -1], [1, 0], [-1, 0]] : [[0, 1], [1, 0], [-1, 0], [0, -1], [0, -1, 1], [1, 0, 1], [-1, 0, 1], [0, 1, 1]]) {
    keys = !!kb;
    const a = await where(); await push(dx, dy); await page.waitForTimeout(250); const b = await where();
    const moved = Math.hypot(b[0] - a[0], b[1] - a[1]);
    if (moved > 2 || b[2] !== a[2] || b[3] !== a[3]) { if (b[2] === a[2] && b[3] === a[3] && !noBack) { await push(-dx, -dy); await page.waitForTimeout(250); } return { ok: true, dir: [dx, dy], keys, moved: Math.round(moved), changedMap: b[2] !== a[2] || b[3] !== a[3] }; }
  }
  return { ok: false, at: await where(), st: await state(page).then(x => ({ msg: x.msg, scenes: x.scenes, map: x.map, x: x.x, y: x.y })) };
}

async function jumpOne(page, o, p, first) {
  const { pl, pt } = p, name = pt.id, errs0 = o.errors.length;
  if (!await openSettings(page)) return rec(`${name}: Settings opens`, false, await state(page));
  if (!await tap(page, '#qok-ui [data-act="jumpOpen"]')) return rec(`${name}: jump row`, false);
  if (!await tap(page, `#qok-ui [data-act="jumpAct"][data-i="${p.ai}"]`, 15000)) return rec(`${name}: act row`, false);
  if (first && SHOTS) await shotTo(page, 'menu-places');
  const before = await state(page), slots0 = await slotsSnap(page);
  if (!await tap(page, `#qok-ui [data-act="jumpPlace"][data-i="${p.pi}"]`)) return rec(`${name}: place row`, false);
  if (!p.town) { if (first && SHOTS) await shotTo(page, 'menu-points'); if (!await tap(page, `#qok-ui [data-act="jumpPoint"][data-i="${p.ki}"]`)) return rec(`${name}: point row`, false); }
  const t0 = Date.now(), pos = { ...pt.pos, dungeon: (pt.kind === 'floor' || pt.kind === 'boss') && !!DMAN.dungeons[pt.pos.mapId], hifiTown: p.town && fs.existsSync(path.join(ROOT, 'public/act1-hifi/town', (pl.hosted || pl.map) + '-town.json')) };
  const se = await settle(page, pos), okField = se.ok;
  let s = await state(page);
  const secs = ((Date.now() - t0) / 1000).toFixed(1);
  rec(`${name}: field up at ${pt.pos.mapId}`, okField && s.map === pt.pos.mapId, { secs, waiting: se.why || undefined, map: s.map, floor: s.floor, cover: s.cover, scenes: s.scenes });
  if (!okField && SHOTS) await shotTo(page, 'stuck-' + name.replace(':', '-'));
  if (!okField) return;
  rec(`${name}: record is the jump's, no slot active`, !!(s.jump && s.jump.id === pt.id) && !s.activeSlot, { jump: s.jump && s.jump.id, activeSlot: s.activeSlot });
  if (p.town && pos.hifiTown) {
    const T = s.town || {}, want = pl.hosted || pl.map, d = T.start ? Math.hypot((T.x / 16) - T.start[0], (T.y / 16) - T.start[1]) : null;
    rec(`${name}: in town ${want} at its gate`, T.id === want && T.inside === true, { town: T, fromStart: d && d.toFixed(2) });
  } else if (pt.pos.mapId === 'overworld') {
    rec(`${name}: overworld cell ${pt.pos.x},${pt.pos.y}`, s.cx === pt.pos.x && s.cy === pt.pos.y, { at: [s.cx, s.cy, s.x, s.y] });
    const wk = walkableCell(pt.pos); if (wk !== null) rec(`${name}: cell is walkable (reach)`, wk);
  } else {
    rec(`${name}: ${pt.pos.mapId} floor ${pt.pos.floor} cell ${pt.pos.x},${pt.pos.y}`, s.floor === (pt.pos.floor || 1) && s.x === pt.pos.x && s.y === pt.pos.y, { at: [s.map, s.floor, s.x, s.y] });
    const wk = walkableCell(pt.pos); if (wk !== null && !ENGINE[pt.pos.mapId]) rec(`${name}: cell is walkable (floor rows)`, wk);
    const tile = await page.evaluate(() => { const w = window.__PHASER_GAME__.scene.getScene('WorldMapScene'); const r = w.mapData && w.mapData[w.heroTileY]; return r ? r[w.heroTileX] : null; });
    if (pt.kind === 'floor' || pt.kind === 'boss') rec(`${name}: the engine's own map is open ground there`, tile !== null && ![1, 4, 5, 7, 14, 18, 23, 28].includes(tile), { tile });     // dq-tiles.js A1D_BLOCK (canMove's dungeon branch)
  }
  if (SHOTS && (first || /:(boss|f3|gate)$/.test(name))) await shotTo(page, 'land-' + name.replace(':', '-'));
  await page.waitForTimeout(2500);                                   // the quest catch-up runs after 8 calm ticks
  const s2 = await state(page);
  const qSame = JSON.stringify(s2.active) === JSON.stringify(s.active) && JSON.stringify(s2.done) === JSON.stringify(s.done);
  const qDelta = s2.qs && before.qs ? { starts: s2.qs.starts - before.qs.starts, ends: s2.qs.ends - before.qs.ends } : null;
  rec(`${name}: no quest card or quest change on arrival`, !s2.card && qSame && (!qDelta || (qDelta.starts === 0 && qDelta.ends === 0)), { card: s2.card, qDelta, active: s2.active, activeAfter: s.active });
  const st = await step(page, p.town && pos.hifiTown, pt.kind === 'boss');      // no step back toward a boss
  rec(`${name}: hero can take a step`, st.ok, st);
  const slots1 = await slotsSnap(page);
  const changed = Object.keys({ ...slots0, ...slots1 }).filter(k => slots0[k] !== slots1[k]);
  const foreign = Object.entries(slots1).filter(([k, v]) => /-(save|auto)$/.test(k) && !/"test\.own":true/.test(v)).map(([k]) => k);
  rec(`${name}: own save slots hold only the player's own records`, !foreign.length && (first || !changed.length), { foreign, changed });
  const errs = o.errors.slice(errs0).filter(e => !/favicon|\.mp3|\.ogg|\.m4a|audio|AudioContext/i.test(e.m));
  rec(`${name}: no page errors`, !errs.length, errs.slice(0, 3));
}
async function shotTo(page, name) { try { fs.mkdirSync(SHOTS, { recursive: true }); await page.screenshot({ path: path.join(SHOTS, name + '.jpg'), type: 'jpeg', quality: 85 }); } catch (e) { log('shot failed', name, e.message); } }

// a player's own adventure in slot 1, booted through Continue
function ownSave() { const s = L.save({ mapId: 'overworld', x: 69, y: 256, flags: { 'compass.visited.greenhollow': true, 'act1.townOpened.greenhollow': true, 'test.own': true } }); s.player.name = 'Chris'; s.player.level = 7; s.player.hp = s.player.maxHp = 60; s.player.atk = 30; s.player.def = 20; s.player.spd = 12; return s; }

async function offCheck(withOverride) {
  const o = await L.launch(); const page = o.page; let swapped = false;
  try {
    await page.route('**/ui-overhaul.js*', async route => { const r = await route.fetch(); let b = await r.text(); if (b.includes(FLAG_LINE)) { b = b.replace(FLAG_LINE, 'window.__QOK_TESTERS__ = false;'); swapped = true; } await route.fulfill({ response: r, body: b }); });
    await L.bootSave(page, ownSave(), { settle: 1500, extra: withOverride ? { 'qok-testers': '1' } : {} });
    const tag = withOverride ? 'flag off + qok-testers=1' : 'flag off';
    rec(`${tag}: the release line was found and flipped`, swapped);
    rec(`${tag}: Settings opens`, await openSettings(page));
    const row = await page.locator('#qok-ui [data-act="jumpOpen"]').count(), txt = await page.evaluate(() => document.body.innerText);
    if (withOverride) {
      rec(`${tag}: the row is there (probe override)`, row === 1);
    } else {
      rec(`${tag}: no jump row`, row === 0, { row });
      rec(`${tag}: no testers text`, !/Testers|テスター|Jump to|ジャンプ/.test(txt));
      rec(`${tag}: jump-points.json never fetched`, !o.requests.some(u => /jump-points\.json/.test(u)), o.requests.filter(u => /jump/.test(u)));
      rec(`${tag}: the flag reads false`, (await page.evaluate(() => window.__QOK_TESTERS__)) === false);
      if (SHOTS) await shotTo(page, 'flag-off-settings');
    }
  } finally { await o.browser.close().catch(() => {}); }
}

(async () => {
  const T0 = Date.now();
  if (OFF || (GROUP === 1 && !ONLY)) { await offCheck(false); await offCheck(true); }
  if (!OFF && pts.length) {
    log(`points ${pts.length} of ${ALL.length}: ${pts[0].pt.id} .. ${pts[pts.length - 1].pt.id}`);
    const o = await L.launch(); const page = o.page;
    try {
      await L.bootSave(page, ownSave(), { settle: 1500 });
      rec('own adventure loaded in slot 1', (await page.evaluate(() => localStorage.getItem('qok-active-slot'))) === '1');
      const own = await page.evaluate(() => localStorage.getItem('qok-slot-1-save'));
      if (SHOTS) { await openSettings(page); await shotTo(page, 'settings-row'); await tap(page, '#qok-ui [data-act="jumpOpen"]'); await page.waitForTimeout(800); await shotTo(page, 'menu-acts'); await tap(page, '#qok-ui [data-act="jumpBack"]'); await tap(page, '#qok-ui [data-act="close"]', 2000); await page.keyboard.press('Escape').catch(() => {}); await page.waitForTimeout(800); }
      let first = true;
      for (const p of pts) {
        try { await jumpOne(page, o, p, first); } catch (e) { rec(`${p.pt.id}: jump`, false, String(e).slice(0, 300)); await page.keyboard.press('Escape').catch(() => {}); }
        first = false;
      }
      rec("slot 1's manual save is the player's own, unchanged", (await page.evaluate(() => localStorage.getItem('qok-slot-1-save'))) === own);
    } finally { await o.browser.close().catch(() => {}); }
  }
  console.log(`jump: ${pass + fail} checks, ${fail} FAIL, ${((Date.now() - T0) / 1000).toFixed(0)} s -- group ${GROUP}/${OF}${ONLY ? ' only ' + ONLY : ''} against ${L.URL_}`);
  if (!pass && !fail) { console.log('[FAIL] checked nothing'); process.exit(1); }
  process.exit(fail ? 1 : 0);
})().catch(e => { console.error('[FAIL] crash', e); process.exit(1); });
