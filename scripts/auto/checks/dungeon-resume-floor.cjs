'use strict';
// Dungeon resume floor check (fixer F4, autoloop 2026-11-23; explorer defect X03).
//
// For every authored dungeon with more than one floor (the four Act 1 dungeons of
// act1-dungeon-floors.json and every Acts 2-5 dungeon of acts-dungeons/manifest.json): a save on
// floor 1 beside the stairs down, Continue, a real walk into the stairs, two steps on floor 2, the
// page hidden and shown (ui-overhaul writes its auto save on hide), a reload: the game must come
// back on floor 2 within one cell of where she stood.
// The defect it guards: the shell's crash net (index.html `edu-rpg-resume`) restores its own
// snapshot over the save after such a reload, and nothing refreshed that snapshot on a floor change
// (stairs only call loadMap), so she came back on floor 1 or a few cells back. Fix:
// public/acts-hifi/acts-runtime.js "resume snapshot (F4, X03)".
//
//   NODE_PATH=/opt/node-tools/node_modules PROBE_URL=http://127.0.0.1:5506/ node scripts/auto/checks/dungeon-resume-floor.cjs [dungeonId ...]
//
// With no id every dungeon runs, in groups, each group in its own process (one Chromium at a time,
// each under ~8 minutes). Output: [PASS]/[FAIL]/[INFO] lines, one summary line, exit 1 on a FAIL.
// DRF_OUT (default <tmp>/qok-drf): logs and screenshots.
const fs = require('fs'), path = require('path'), os = require('os');
const OUT = process.env.DRF_OUT || path.join(os.tmpdir(), 'qok-drf');
fs.mkdirSync(OUT, { recursive: true });
process.env.PROBE_OUT = process.env.PROBE_OUT || OUT;
process.env.X_OUT = process.env.X_OUT || OUT;
const ROOT = path.resolve(__dirname, '../../..');
const A1 = JSON.parse(fs.readFileSync(path.join(ROOT, 'public/act1-dungeon-floors.json'), 'utf8')).floors;
const DMAN = JSON.parse(fs.readFileSync(path.join(ROOT, 'public/acts-dungeons/manifest.json'), 'utf8'));
const A1_IDS = ['sunkenCellar', 'whisperingWoodsCave', 'mistyGrotto', 'coastalReef'];   // dq-tiles A1D_MAPS (Crystal Cave keeps its generator)
const A2_IDS = Object.keys(DMAN.dungeons).filter(id => DMAN.dungeons[id].enabled !== false && (DMAN.dungeons[id].authoredFloors || []).length > 1);
const ALL = [...A1_IDS, ...A2_IDS];
const PER_GROUP = 4, GROUP_MS = 470000;

// ---------------------------------------------------------------- runner
if (!process.argv.includes('--group')) {
  const { spawnSync } = require('child_process');
  const want = process.argv.slice(2).filter(a => !a.startsWith('-')), list = want.length ? want : ALL;
  let pass = 0, fail = 0;
  for (const id of list) if (!ALL.includes(id)) { console.log(`[FAIL] ${id}: not a multi-floor authored dungeon (${ALL.join(', ')})`); fail++; }
  const ids = list.filter(id => ALL.includes(id));
  for (let i = 0; i < ids.length; i += PER_GROUP) {
    const grp = ids.slice(i, i + PER_GROUP), log = path.join(OUT, `group-${grp[0]}.log`);
    const r = spawnSync(process.execPath, [__filename, '--group', ...grp], { encoding: 'utf8', timeout: GROUP_MS, env: process.env });
    const txt = (r.stdout || '') + (r.stderr || ''); fs.writeFileSync(log, txt);
    const rows = txt.split('\n').filter(l => /^\[(PASS|FAIL|INFO)\]/.test(l)); rows.forEach(l => console.log(l));
    const p = rows.filter(l => l.startsWith('[PASS]')).length, f = rows.filter(l => l.startsWith('[FAIL]')).length; pass += p; fail += f;
    const seen = new Set(rows.filter(l => /^\[(PASS|FAIL)\]/.test(l)).map(l => l.split(/[\] :]+/)[1]));
    for (const id of grp) if (!seen.has(id)) { console.log(`[FAIL] ${id}: the group did not finish (${r.error ? r.error.code || r.error.message : 'exit ' + r.status}); see ${log}`); fail++; }
  }
  console.log(`dungeon-resume-floor: ${pass + fail} checks, ${fail} FAIL -- ${fail || !pass ? 'FAIL' : 'PASS'} (${ids.length} dungeons) against ${process.env.PROBE_URL || 'the default PROBE_URL'}`);
  process.exit(fail || !pass ? 1 : 0);
}

// ---------------------------------------------------------------- one group
const F = require('./field-lib.cjs'), L = F.L, X = require('../explore/xlib.cjs');
let pass = 0, fail = 0;
const ok = (c, name, d) => { if (c) pass++; else fail++; console.log(`[${c ? 'PASS' : 'FAIL'}] ${name}${d ? ' -- ' + d : ''}`); return !!c; };
const info = (name, d) => console.log(`[INFO] ${name}${d ? ' -- ' + d : ''}`);
setTimeout(() => { console.log('[INFO] group ran out of time'); process.exit(1); }, GROUP_MS - 15000).unref();

const wk = (rows, x, y) => !!rows[y] && x >= 0 && x < rows[y].length && rows[y][x] === '.';
function seedCell(id) {                                         // floor 1, beside the stairs down
  const A2 = DMAN.floors[`${id}-f1`];
  if (A2 && A2.land && A2.land.fromNext) return [A2.land.fromNext.x, A2.land.fromNext.y];
  const f = A1[`${id}-f1`], st = f.assets.find(a => a.kind === 'stairsDown');
  for (const d of [2, 3]) for (const [dx, dy] of [[0, 1], [1, 0], [-1, 0], [0, -1]]) { const x = st.x + dx * d, y = st.y + dy * d;
    if (wk(f.rows, x, y) && wk(f.rows, x - dx, y - dy)) return [x, y]; }
  return null;
}
const dismiss = page => F.dismiss(page, 12);
async function seed(page, id, xy) {
  const s = L.save({ mapId: id, floor: 1, x: xy[0], y: xy[1], flags: { ...L.allFlags(), ...F.ALLB }, inventory: F.INV, completedQuests: F.QUESTS });
  await X.boot(page, s, { slots: true });                       // the record also sits in slot 1 (auto), as an installed game keeps it
  await F.settle(page); await dismiss(page);
}
async function one(S, id) {
  const page = S.page, xy = seedCell(id);
  if (!xy) { ok(false, `${id}: a floor-1 cell beside the stairs down`); return; }
  await seed(page, id, xy);
  let w = await X.where(page);
  if (!ok(w.map === id && w.floor === 1, `${id}: the floor-1 save loads`, JSON.stringify(w))) return;
  let g = null;
  for (let k = 0; k < 4; k++) {
    const dn = await page.evaluate(() => { const md = window.__PHASER_GAME__.scene.getScene('WorldMapScene').mapData; for (let y = 0; y < md.length; y++) for (let x = 0; x < md[0].length; x++) if (md[y][x] === 9) return [x, y]; return null; });
    if (!dn) { g = { why: 'no stairs down (tile 9) on floor 1' }; break; }
    g = await page.evaluate(X.GOTO, { goal: dn, maxMs: 60000 });
    if (g.why === 'message') { await dismiss(page); continue; }
    break;
  }
  await page.waitForTimeout(1500); await L.noEncounters(page); await F.settle(page); await dismiss(page);
  w = await X.where(page);
  if (!ok(w.map === id && w.floor === 2, `${id}: the stairs down lead to floor 2`, JSON.stringify({ g, w }))) return;
  // Two steps off the landing, so a snapshot left a few cells back shows too. Not in Storm Nest: its 2F landing
  // is the edge of a gust lane, and a step south puts her where the next gust sweeps her off the walkway to 1F
  // (gust-walkways: "The gust swept you off the walkway!"), which is the mechanic, not a lost floor.
  const STEPS = id === 'stormNest' ? [] : [[0, 1], [1, 0], [-1, 0]];
  for (const [a, b] of STEPS) { await L.stick(page, a, b, 300); await dismiss(page); }
  const before = await X.where(page);
  await X.hide(page, true); await page.waitForTimeout(800); await X.hide(page, false); await page.waitForTimeout(500);
  const recs = await page.evaluate(() => { const o = {}; for (const k of ['edu-rpg-autosave', 'edu-rpg-resume']) { try { const p = JSON.parse(localStorage.getItem(k)).player.position; o[k] = [p.floor || 1, p.x, p.y]; } catch (e) { o[k] = null; } } return o; });
  const how = await X.reloadContinue(page);
  await F.settle(page);
  const after = await X.where(page);
  const shot = await X.jpeg(page, OUT, `${id}-resumed`);
  const d = Math.abs(after.cell[0] - before.cell[0]) + Math.abs(after.cell[1] - before.cell[1]);
  ok(after.map === id && after.floor === before.floor && d <= 1, `${id}: hide on floor 2, reload: she resumes on floor 2 where she stood`,
    JSON.stringify({ before: [before.floor, ...before.cell], after: [after.map, after.floor, ...after.cell], records: recs, how: how[0], shot: path.basename(shot) }));
}

(async () => {
  const ids = process.argv.slice(process.argv.indexOf('--group') + 1);
  for (const id of ids) {
    const S = await X.launchX();
    try { await one(S, id); } catch (e) { ok(false, `${id}: ran`, String(e && e.message || e).slice(0, 300)); }
    await S.browser.close().catch(() => {});
  }
  console.log(`group: ${pass + fail} checks, ${fail} FAIL`);
  process.exit(fail ? 1 : 0);
})();
