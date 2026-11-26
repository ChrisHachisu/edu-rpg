'use strict';
// Shared helpers for the field-runtime checks (track F2, 2026-11-23): scripts/auto/checks/field-*.cjs.
// Same harness as the census (scripts/auto/census/*.cjs): phone viewport 390x844, a v4 save seeded
// where the census seeded it, Continue, then the real entry path where one is needed.
//   NODE_PATH=/opt/node-tools/node_modules PROBE_URL=http://127.0.0.1:5503/ node scripts/auto/checks/field-<x>.cjs
// Output convention: [PASS]/[FAIL]/[INFO] lines, a summary line, exit 1 on any FAIL.
// FIELD_OUT (default <tmp>/qok-field): screenshots and logs.
// FIELD_LS=key=value[,key=value]: extra localStorage switches set with the seeded save (to see a check FAIL on an old look,
//   for example FIELD_LS=qok-f2-old=gust).
const fs = require('fs'), path = require('path'), os = require('os');
const OUT = process.env.FIELD_OUT || path.join(os.tmpdir(), 'qok-field');
fs.mkdirSync(OUT, { recursive: true });
process.env.PROBE_OUT = process.env.PROBE_OUT || path.join(OUT, 'probe-out');
const L = require('../../acts/probe/lib.cjs');
const ROOT = path.resolve(__dirname, '../../..');
const DMAN = JSON.parse(fs.readFileSync(path.join(ROOT, 'public/acts-dungeons/manifest.json'), 'utf8'));
const URL_ = L.URL_;
const T0 = Date.now();
const log = (...a) => console.log(`[${((Date.now() - T0) / 1000).toFixed(0)}s]`, ...a);

let pass = 0, fail = 0;
function ok(cond, name, detail) {
  if (cond) { pass++; console.log(`[PASS] ${name}${detail ? ' -- ' + detail : ''}`); }
  else { fail++; console.log(`[FAIL] ${name}${detail ? ' -- ' + detail : ''}`); }
  return !!cond;
}
const info = (name, detail) => console.log(`[INFO] ${name}${detail ? ' -- ' + detail : ''}`);
function done(tag) {
  console.log(`${tag}: ${pass + fail} checks, ${fail} FAIL -- against ${URL_}`);
  process.exit(fail ? 1 : (pass ? 0 : 1));
}

// ---- dungeon cells (the census's own choices: scripts/auto/census/dungeons.cjs) ----
const floorOf = (id, n) => DMAN.floors[`${id}-f${n}`];
const walk = (f, x, y) => { const r = f.rows[y]; return !!r && x >= 0 && x < r.length && r[x] === '.'; };
function nearestWalk(f, x, y) {
  for (let r = 0; r < 20; r++) for (let dy = -r; dy <= r; dy++) for (let dx = -r; dx <= r; dx++) {
    if (Math.max(Math.abs(dx), Math.abs(dy)) !== r) continue; const a = x + dx, b = y + dy;
    if (walk(f, a, b) && walk(f, a + 1, b) && walk(f, a - 1, b) && walk(f, a, b + 1) && walk(f, a, b - 1)) return [a, b];
  }
  return null;
}
function landing(f) {
  if (f.land) { const l = f.land.fromPrev || f.land.mouth; if (l) return [l.x, l.y]; }
  const up = (f.assets || []).find(a => a.kind === 'stairsUp') || (f.assets || []).find(a => a.kind === 'mouth');
  if (!up) return null;
  for (const [dx, dy] of [[0, 1], [0, -1], [1, 0], [-1, 0]]) if (walk(f, up.x + dx, up.y + dy) && walk(f, up.x + 2 * dx, up.y + 2 * dy)) return [up.x + 2 * dx, up.y + 2 * dy];
  return nearestWalk(f, up.x, up.y + 1);
}
function midCell(f, from) {
  let sx = 0, sy = 0, n = 0; f.rows.forEach((r, y) => { for (let x = 0; x < r.length; x++) if (r[x] === '.') { sx += x; sy += y; n++; } });
  if (!n) return null; const cx = Math.round(sx / n), cy = Math.round(sy / n);
  let c = nearestWalk(f, cx, cy);
  if (c && from && Math.hypot(c[0] - from[0], c[1] - from[1]) < 8) { const ox = cx + (cx - from[0] >= 0 ? 6 : -6); c = nearestWalk(f, ox, cy) || c; }
  return c;
}
const BUNDLE_BOSSES = ['ashenGuardian', 'banditLord', 'celestialGuardian', 'coralTitan', 'crystalHydra', 'dragon', 'flameTitan', 'frostMonarch', 'giantCrab', 'giantToad', 'iceWyrm',
  'lavaWyrm', 'magmaBeetleKing', 'mosswarden', 'nullDevourer', 'oreColossus', 'phantomStag', 'sandGolem', 'sandSerpentQueen', 'serpent', 'stormHarpy', 'stormSentinel', 'swordWraith', 'warGeneralMalachar', 'demonKing'];
const ALLB = Object.fromEntries(BUNDLE_BOSSES.map(b => [`boss.${b}.defeated`, true]));
// the story items the seeded boss flags imply (battle-recovery.js repairs a save without them, with a message box)
const INV = [{ itemId: 'herb', quantity: 5 }, { itemId: 'flameCloak', quantity: 1 }, { itemId: 'windbreakerStone', quantity: 1 },
  { itemId: 'excalibur', quantity: 1 }, { itemId: 'aegisOfDawn', quantity: 1 }, { itemId: 'galeShield', quantity: 1 }, { itemId: 'crownOfWisdom', quantity: 1 }];
// The quests these flags would finish are marked done, so no "Quest Complete" box opens on arrival.
const QUESTS = ['ancientRelic', 'crystalCaveGate', 'demonBarracksQuest', 'desertGate', 'drakeCargo', 'drakesCargo2', 'finalBattle', 'flameCloak', 'frozenSupplies', 'gordosOre',
  'kikisChallenge', 'kikisRescue', 'kikisResolve', 'lunasMap', 'lunasProphecy', 'magmaPath', 'owlsLesson', 'portalRelics', 'shadowGate', 'stolenBook', 'stormPass', 'volcanicGate'];

async function settle(page, ms = 25000) {
  await page.waitForFunction(() => { const g = window.__PHASER_GAME__, w = g.scene.getScene('WorldMapScene'); if (!w || !g.scene.isActive('WorldMapScene')) return false;
    if (w.__a1dEntryWaiting) return false; const d = window.__QOK_DNG2__; if (d && w.currentMapId && d.state && d.state().loaded && d.state().merged) { const s = d.state(); return s.art === 'ready' && s.mask === 'ready'; } return true; }, { timeout: ms }).catch(() => {});
  await page.waitForTimeout(1500);
}
// Record every message box (text + when) from before the scene is up, so arrival messages are caught.
async function hookMessages(page) {
  await page.evaluate(() => {
    if (window.__fieldMsgHooked) return; window.__fieldMsgHooked = true; window.__fieldMsgs = [];
    const tryHook = () => { const g = window.__PHASER_GAME__, w = g && g.scene.getScene('WorldMapScene');
      if (!w || typeof w.showMessage !== 'function') return setTimeout(tryHook, 30);
      if (w.__fieldHook) return; w.__fieldHook = true; const o = w.showMessage;
      w.showMessage = function (t) { try { window.__fieldMsgs.push({ t: String(t), at: performance.now(), map: w.currentMapId, floor: w.currentFloor }); } catch (e) {} return o.apply(this, arguments); }; };
    tryHook();
  });
}
// Seed a save at (id, floor, xy) and Continue, as the census does. Returns the position.
async function seedDungeon(page, id, floor, xy, { flags = {}, url } = {}) {
  const s = L.save({ mapId: id, floor, x: xy[0], y: xy[1], flags: { ...L.allFlags(), ...ALLB, ...flags }, inventory: INV, completedQuests: QUESTS });
  s.player.name = 'Mika';
  await page.goto(url || URL_, { waitUntil: 'domcontentloaded' });
  await page.evaluate(([s, ls]) => { localStorage.clear(); localStorage.setItem('edu-rpg-save', JSON.stringify(s));
    for (const kv of ls) { const i = kv.indexOf('='); if (i > 0) localStorage.setItem(kv.slice(0, i), kv.slice(i + 1)); } }, [s, (process.env.FIELD_LS || '').split(',').filter(Boolean)]);
  await page.reload({ waitUntil: 'load' });
  await L.toTitle(page);
  await hookMessages(page);
  await page.evaluate(() => { const t = window.__PHASER_GAME__.scene.getScene('TitleScene'); const i = t.menuItems.findIndex(m => m.getData && m.getData('action') === 'continue'); t.selectedIndex = i; t.confirmTitle(); });
  await page.waitForFunction(() => { const g = window.__PHASER_GAME__, w = g.scene.getScene('WorldMapScene'); return w && g.scene.isActive('WorldMapScene') && w.hero && w.mapData; }, { timeout: 90000 });
  await page.evaluate(() => { try { window.__GAME_STATE__.encounterManager.onStep = () => null; } catch (e) {} });
  await settle(page);
  return L.pos(page);
}
async function messages(page) { return page.evaluate(() => (window.__fieldMsgs || []).slice()); }
async function dismiss(page, max = 10) {
  for (let i = 0; i < max; i++) {
    const m = await page.evaluate(() => { const w = window.__PHASER_GAME__.scene.getScene('WorldMapScene'); return !!(w && w.showingMessage); }).catch(() => false);
    if (!m) return i; await page.keyboard.press('z'); await page.waitForTimeout(300);
  }
  return max;
}
// Screenshot -> decoded RGB(A) buffer (lib's minimal PNG decoder).
async function grab(page, file) {
  const buf = await page.screenshot(file ? { path: file } : {});
  return L.decodePng(buf);
}
function px(img, x, y) { const i = (Math.round(y) * img.w + Math.round(x)) * img.bpp; return [img.data[i], img.data[i + 1], img.data[i + 2]]; }
// Save a JPEG copy of a PNG for the owner (python3 + PIL, as the census's finish.py does).
function jpeg(png, jpg) {
  try { require('child_process').execFileSync('python3', ['-c', 'import sys;from PIL import Image;Image.open(sys.argv[1]).convert("RGB").save(sys.argv[2],quality=85)', png, jpg]); return true; } catch (e) { return false; }
}
module.exports = { L, ROOT, OUT, DMAN, URL_, log, ok, info, done, floorOf, walk, nearestWalk, landing, midCell, ALLB, INV, QUESTS, settle, hookMessages, seedDungeon, messages, dismiss, grab, px, jpeg };
