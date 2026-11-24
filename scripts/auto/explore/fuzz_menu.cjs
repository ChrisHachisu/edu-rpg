'use strict';
// Menu and state fuzz. Each scenario seeds a v4 save, Continues, and pokes the bottom field tabs
// (#fieldTabs [data-fi], the real tap target: Status/Items/Equip/Settings), the menu's own close
// button, visibilitychange hide/show, save -> reload -> Continue (the real five-slot title), and
// the language settings, at awkward moments. After each poke it checks:
//   lock      the hero can move afterwards (field: stick 0.6 s two ways; town: arrow keys in the frame)
//   menu      a tab tap opens MenuScene within 2 s and the close button closes it
//   overlap   scenes that must not be up together (MenuScene + BattleScene, MenuScene during a
//             transition that changed the map, a town frame on a non-town map, two message boxes)
//   rawkeys   text on screen (DOM + Phaser texts) that is a raw i18n key: [a.b], d2.x.y, mechanic.x
//   errors    page errors
//   node scripts/auto/explore/fuzz_menu.cjs [--seed 1] [scenario ...]    (no scenario: all)
// Writes /home/user/work/explore/fuzz-menu.jsonl, shots/menu/<scenario>-<tag>.jpg
const fs = require('fs'), path = require('path');
const X = require('./xlib.cjs'), L = X.L;
const acts = JSON.parse(fs.readFileSync(path.join(X.ROOT, 'public/acts-hifi/manifest.json'), 'utf8'));
const man = JSON.parse(fs.readFileSync(path.join(X.ROOT, 'public/acts-dungeons/manifest.json'), 'utf8'));
const FR = '#act1-hifi-preserved-root iframe';
const SH = path.join(X.OUTX, 'shots/menu');
const RELICS = ['excalibur', 'aegisOfDawn', 'galeShield', 'crownOfWisdom'];
const INV = [{ itemId: 'herb', quantity: 5 }, { itemId: 'flameCloak', quantity: 1 }, { itemId: 'windbreakerStone', quantity: 1 }, ...RELICS.map(r => ({ itemId: r, quantity: 1 }))];
const door = id => acts.landmarks.find(l => (l.virtual || l.mapId) === id && !l.toFloor);

// ---- in-page probes -------------------------------------------------------------------------
const ST = sel => { const g = window.__PHASER_GAME__, w = g.scene.getScene('WorldMapScene'), f = document.querySelector(sel), t = f && f.contentWindow && f.contentWindow.__ACT1_TOWN__;
  let tp = null; try { tp = t && t.position(); } catch (e) {}
  return { map: w && w.currentMapId, floor: w && (w.currentFloor || 1), cell: w && [w.heroTileX, w.heroTileY], hero: w && w.hero ? [Math.round(w.hero.x), Math.round(w.hero.y)] : null,
    scenes: g.scene.getScenes(true).map(s => s.scene.key), paused: g.scene.isPaused('WorldMapScene'), msg: !!(w && w.showingMessage), town: t && t.town ? t.town.id : null,
    tpos: tp ? [Math.round(tp.x), Math.round(tp.y)] : null, hidden: document.hidden, kb: !!(w && w.input && w.input.keyboard && w.input.keyboard.enabled !== false) }; };
const RAW = () => {      // raw keys on screen
  const out = new Set(), re = /\[[a-zA-Z][\w-]*(\.[\w-]+)+\]|\b(d2|mechanic|npc|quest|dungeon|menu|overworld|battle|item|shop|town|geo|acts)\.[a-zA-Z][\w]*(\.[\w]+)+\b/g;
  const scan = s => { if (!s) return; const m = String(s).match(re); if (m) m.forEach(x => out.add(x)); };
  scan(document.body.innerText);
  const f = document.querySelector('#act1-hifi-preserved-root iframe'); try { scan(f && f.contentDocument && f.contentDocument.body.innerText); } catch (e) {}
  const g = window.__PHASER_GAME__; for (const s of g.scene.getScenes(true)) { try { s.children.list.forEach(o => { if (o.visible !== false && typeof o.text === 'string') scan(o.text); if (o.list) o.list.forEach(c => { if (typeof c.text === 'string') scan(c.text); }); }); } catch (e) {} }
  return [...out];
};
async function st(page) { return page.evaluate(ST, FR); }
async function raw(page) { return page.evaluate(RAW); }
async function tab(page, i) { return page.evaluate(i => { const b = document.querySelector(`#fieldTabs [data-fi="${i}"]`); if (!b) return false; b.click(); return true; }, i); }
// overlay buttons route on pointerdown/up (ui-overhaul fireTap), not on click: a real tap
async function tapAct(page, sel) { const l = page.locator(sel).filter({ visible: true }).first(); if (!(await l.count())) return false; try { await l.tap({ timeout: 3000 }); return true; } catch (e) { return false; } }
async function closeMenu(page) { return tapAct(page, '[data-act="close"]'); }
async function menuOpen(page) { return page.evaluate(() => window.__PHASER_GAME__.scene.isActive('MenuScene')); }
async function hide(page, on) { return page.evaluate(on => { Object.defineProperty(document, 'hidden', { value: on, configurable: true }); Object.defineProperty(document, 'visibilityState', { value: on ? 'hidden' : 'visible', configurable: true });
  document.dispatchEvent(new Event('visibilitychange')); window.dispatchEvent(new Event(on ? 'blur' : 'focus')); }, on); }
async function keyZ(page) { await page.evaluate(() => { for (const t of ['keydown', 'keyup']) { const ev = new KeyboardEvent(t, { key: 'z', code: 'KeyZ', bubbles: true, cancelable: true }); Object.defineProperty(ev, 'keyCode', { get: () => 90 }); Object.defineProperty(ev, 'which', { get: () => 90 }); window.dispatchEvent(ev); } }); }
async function dismiss(page, n = 12) { for (let i = 0; i < n; i++) { const s = await st(page); if (!s.msg) return i; await page.evaluate(() => { for (const t of ['keydown', 'keyup']) { const ev = new KeyboardEvent(t, { key: 'z', code: 'KeyZ', bubbles: true, cancelable: true }); Object.defineProperty(ev, 'keyCode', { get: () => 90 }); Object.defineProperty(ev, 'which', { get: () => 90 }); window.dispatchEvent(ev); } }); await page.waitForTimeout(300); } return n; }
// can she move? field: stick; town: arrow keys in the frame
async function canMove(page) {
  // a message box holds her by design: read it, close it with the action key, then test
  const mtext = await page.evaluate(() => { const w = window.__PHASER_GAME__.scene.getScene('WorldMapScene'); return w && w.showingMessage && w.messageText ? String(w.messageText.text).slice(0, 120) : null; });
  if (mtext) { await dismiss(page); if ((await st(page)).msg) return { ok: false, why: 'message will not close', text: mtext };
    const r = await canMove(page); r.closedMessage = mtext; return r; }
  const s0 = await st(page);
  if (s0.town) {
    for (const k of ['ArrowDown', 'ArrowUp', 'ArrowLeft', 'ArrowRight']) {
      const a = await st(page);
      await page.evaluate(([sel, k]) => { const f = document.querySelector(sel); f.contentWindow.dispatchEvent(new f.contentWindow.KeyboardEvent('keydown', { key: k, bubbles: true })); }, [FR, k]);
      await page.waitForTimeout(500);
      await page.evaluate(([sel, k]) => { const f = document.querySelector(sel); if (f) f.contentWindow.dispatchEvent(new f.contentWindow.KeyboardEvent('keyup', { key: k, bubbles: true })); }, [FR, k]);
      const b = await st(page); if (!b.town || (a.tpos && b.tpos && Math.hypot(a.tpos[0] - b.tpos[0], a.tpos[1] - b.tpos[1]) > 3)) return { ok: true, how: 'town ' + k };
    }
    return { ok: false, how: 'town', st: await st(page) };
  }
  for (const [x, y] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
    const a = await st(page); await L.stick(page, x, y, 600); const b = await st(page);
    if (b.map !== a.map || (a.hero && b.hero && Math.hypot(a.hero[0] - b.hero[0], a.hero[1] - b.hero[1]) > 3)) return { ok: true, how: [x, y] };
  }
  return { ok: false, st: await st(page) };
}
function overlap(s) { const p = [];
  if (s.scenes.includes('MenuScene') && s.scenes.includes('BattleScene')) p.push('MenuScene+BattleScene');
  if (s.scenes.includes('MenuScene') && s.scenes.includes('ShopScene')) p.push('MenuScene+ShopScene');
  if (s.town && s.map === 'overworld') p.push('town frame on overworld');
  return p; }

// ---- reload and Continue through the real five-slot title ---------------------------------
const reloadContinue = (page, which = 'last') => X.reloadContinue(page, which);

// ---- scenarios --------------------------------------------------------------------------------
// each: async (ctx) => row fields; ctx = { S, page, rnd, shot(tag), note(kind, what, extra) }
const SC = {};
// tab taps while walking into a town door / out of it again
SC['door-town'] = async c => { const d = door('ironkeep');
  for (const ms of [0, 150, 350, 700]) {
    await X.boot(c.page, L.save({ x: d.exit[0], y: d.exit[1], flags: L.allFlags(), inventory: INV }));
    const walk = c.page.evaluate(() => 0); const p = L.walkCells(c.page, [d.at], { maxMs: 20000 });
    await c.page.waitForTimeout(ms); const i = c.rnd4(); await tab(c.page, i); await p;
    await c.page.waitForTimeout(2500); let s = await st(c.page);
    if (await menuOpen(c.page)) { await closeMenu(c.page); await c.page.waitForTimeout(800); }
    s = await st(c.page); const mv = await canMove(c.page);
    c.check(`tab ${i} at +${ms} ms walking into Ironkeep: ends in town or field, can move`, mv.ok && !overlap(s).length, { s, mv, ov: overlap(s) });
  }
};
SC['door-dungeon'] = async c => { const d = door('emberMines');
  for (const ms of [100, 300, 600]) {
    await X.boot(c.page, L.save({ x: d.exit[0], y: d.exit[1], flags: L.allFlags(), inventory: INV }));
    const p = L.walkCells(c.page, [d.at], { maxMs: 20000 }); await c.page.waitForTimeout(ms); const i = c.rnd4(); await tab(c.page, i); await p;
    await c.page.waitForTimeout(3000); if (await menuOpen(c.page)) { await closeMenu(c.page); await c.page.waitForTimeout(800); }
    const s = await st(c.page), mv = await canMove(c.page);
    c.check(`tab ${i} at +${ms} ms walking into the Ember Mines mouth: can move after`, mv.ok && !overlap(s).length, { s, mv });
  }
};
// tab taps on the stairs (floor change)
SC['floor-change'] = async c => { const FL = man.floors['emberMines-f1'], dn = FL.assets.find(a => a.kind === 'stairsDown'), ld = FL.land.fromNext;
  for (const ms of [50, 250, 600]) {
    await X.boot(c.page, L.save({ mapId: 'emberMines', x: ld.x, y: ld.y, floor: 1, flags: L.allFlags(), inventory: INV }));
    const s0 = await st(c.page);
    const dx = (dn.x + 0.5) * 48 - s0.hero[0], dy = (dn.y + 0.5) * 48 - s0.hero[1];
    const p = L.stick(c.page, dx, dy, 2500); await c.page.waitForTimeout(ms); const i = c.rnd4(); await tab(c.page, i); await p;
    await c.page.waitForTimeout(2500); const mo = await menuOpen(c.page); if (mo) { await closeMenu(c.page); await c.page.waitForTimeout(800); }
    const s = await st(c.page), mv = await canMove(c.page);
    c.check(`tab ${i} at +${ms} ms pushing into the stairs down (f1 -> f${s.floor}): can move after`, mv.ok && !overlap(s).length, { s0: s0.floor, s, mv, menuWasOpen: mo });
    if (!mv.ok) await c.shot('floor-' + ms);
  }
};
// tab taps while a message box is up (Crystal Cave locked: no Giant Toad flag)
SC['message'] = async c => {
  await X.boot(c.page, L.save({ x: 149, y: 279, flags: {}, inventory: INV }));
  await L.walkCells(c.page, [[149, 278]], { maxMs: 12000 }); await c.page.waitForTimeout(600);
  let s = await st(c.page); const had = s.msg;
  for (let i = 0; i < 4; i++) { await tab(c.page, i); await c.page.waitForTimeout(500); }
  const mo = await menuOpen(c.page); await c.shot('message-tabs');
  if (mo) { await closeMenu(c.page); await c.page.waitForTimeout(600); }
  await dismiss(c.page); s = await st(c.page); const mv = await canMove(c.page);
  c.check('tabs tapped over the "Crystal Cave is sealed" message: message closes, she can move', had && mv.ok && !s.msg, { had, menuOpenedOverMessage: mo, s, mv });
  // open the menu, then fire the message underneath it by holding the stick into the door
  await X.boot(c.page, L.save({ x: 149, y: 280, flags: {}, inventory: INV }));
  await tab(c.page, 0); await c.page.waitForTimeout(1500); await L.stick(c.page, 0, -1, 1500); await closeMenu(c.page); await c.page.waitForTimeout(800); await dismiss(c.page);
  s = await st(c.page); const mv2 = await canMove(c.page);
  c.check('stick held under an open menu, then closed: she can move', mv2.ok && !overlap(s).length, { s, mv2 });
};
// battle: tab taps at battle start, visibility hide/show mid-battle, battle end
SC['battle'] = async c => {
  await X.boot(c.page, L.save({ x: 80, y: 262, flags: L.allFlags(), inventory: INV }));
  const got = await c.page.evaluate(async () => { const g = window.__PHASER_GAME__, w = g.scene.getScene('WorldMapScene');
    try { delete window.__GAME_STATE__.encounterManager.onStep; } catch (e) {}
    const t0 = performance.now(); let a = 0;
    while (performance.now() - t0 < 30000 && !g.scene.isActive('BattleScene')) { a += 1.3; window.__DQ_STICK__ = { x: Math.cos(a), y: Math.sin(a), m: 1 }; await new Promise(r => setTimeout(r, 400)); }
    window.__DQ_STICK__ = { x: 0, y: 0, m: 0 }; return g.scene.isActive('BattleScene'); });
  if (!got) { c.check('a random battle started by walking (encounters on) within 30 s', 'SKIP', null); return; }
  for (let i = 0; i < 4; i++) { await tab(c.page, i); await c.page.waitForTimeout(150); }
  let s = await st(c.page); c.check('tabs tapped as a battle starts: no menu over the battle', !overlap(s).length, s);
  await hide(c.page, true); await c.page.waitForTimeout(2500); await hide(c.page, false); await c.page.waitForTimeout(1500);
  await c.shot('battle-after-hide');
  // play it out: tap answers until the battle ends
  let end = false; const tb = Date.now();
  while (Date.now() - tb < 90000) { if (!(await c.page.evaluate(() => window.__PHASER_GAME__.scene.isActive('BattleScene')))) { end = true; break; }
    if (!(await tapAct(c.page, '[data-act="kpKey"], [data-act="quizAns"]')) && !(await tapAct(c.page, '[data-act="battleAdvance"]'))) await keyZ(c.page);
    await c.page.waitForTimeout(400); }
  await c.page.waitForTimeout(1500); await dismiss(c.page); await L.noEncounters(c.page);
  s = await st(c.page); const mv = await canMove(c.page);
  c.check('battle (with a hide/show in the middle) plays to its end; she can move after', end && mv.ok, { end, s, mv });
  await tab(c.page, 2); await c.page.waitForTimeout(1500); const mo = await menuOpen(c.page); await closeMenu(c.page); await c.page.waitForTimeout(800);
  c.check('menu opens and closes after a battle', mo && !(await menuOpen(c.page)), { mo });
};
// hide/show mid-walk on the overworld, in a town, in a dungeon
SC['visibility'] = async c => {
  for (const [tag, s0] of [['overworld', L.save({ x: 80, y: 262, flags: L.allFlags(), inventory: INV })], ['dungeon', L.save({ mapId: 'emberMines', x: man.floors['emberMines-f2'].land.fromPrev.x, y: man.floors['emberMines-f2'].land.fromPrev.y, floor: 2, flags: L.allFlags(), inventory: INV })]]) {
    await X.boot(c.page, s0);
    const p = L.stick(c.page, 1, 0.3, 2500); await c.page.waitForTimeout(700); await hide(c.page, true); await c.page.waitForTimeout(2000); await hide(c.page, false); await p;
    await c.page.waitForTimeout(800); const s = await st(c.page), mv = await canMove(c.page);
    c.check(`hide/show mid-walk (${tag}): she can move after`, mv.ok, { s, mv });
  }
  const d = door('oasisHaven'); await X.boot(c.page, L.save({ x: d.exit[0], y: d.exit[1], flags: L.allFlags(), inventory: INV }));
  await L.walkCells(c.page, [d.at], { maxMs: 20000 }); await c.page.waitForTimeout(3500);
  await hide(c.page, true); await c.page.waitForTimeout(1500); await hide(c.page, false); await c.page.waitForTimeout(800);
  const s = await st(c.page), mv = await canMove(c.page); c.check('hide/show in a town (Oasis Haven): she can move after', !!s.town && mv.ok, { s, mv });
};
// save -> reload -> Continue at awkward places (the autosave the hide event writes)
SC['resume'] = async c => {
  const cases = [
    ['mid-dungeon f3 (Ember Mines)', L.save({ mapId: 'emberMines', x: man.floors['emberMines-f3'].land.fromPrev.x, y: man.floors['emberMines-f3'].land.fromPrev.y, floor: 3, flags: L.allFlags(), inventory: INV }), 1500],
    ['puzzle floor mid-solve (Frozen Lake f1, after slides)', L.save({ mapId: 'frozenLake', x: man.floors['frozenLake-f1'].land.mouth.x, y: man.floors['frozenLake-f1'].land.mouth.y, floor: 1, flags: L.allFlags(), inventory: INV }), 4000],
    ['puzzle floor mid-solve (Iron Mine f1)', L.save({ mapId: 'ironMine', x: man.floors['ironMine-f1'].land.mouth.x, y: man.floors['ironMine-f1'].land.mouth.y, floor: 1, flags: L.allFlags(), inventory: INV }), 4000],
    ['puzzle floor mid-solve (Desert Tomb f2)', L.save({ mapId: 'desertTomb', x: man.floors['desertTomb-f2'].land.fromPrev.x, y: man.floors['desertTomb-f2'].land.fromPrev.y, floor: 2, flags: L.allFlags(), inventory: INV }), 4000],
  ];
  for (const [tag, s0, walkMs] of cases) {
    await X.boot(c.page, s0, { slots: true });
    for (let k = 0; k < 4; k++) { const a = c.rnd() * Math.PI * 2; await L.stick(c.page, Math.cos(a), Math.sin(a), 250); }
    const before = await st(c.page); await hide(c.page, true); await c.page.waitForTimeout(800); await hide(c.page, false);
    let labels = null, after = null, mv = null;
    try { labels = await reloadContinue(c.page); after = await st(c.page); mv = await canMove(c.page); } catch (e) { after = { error: String(e).slice(0, 200) }; }
    const same = after && after.map === before.map && after.floor === before.floor && after.cell && Math.abs(after.cell[0] - before.cell[0]) + Math.abs(after.cell[1] - before.cell[1]) <= 1;
    c.check(`save (hide) -> reload -> Continue, ${tag}: same map/floor/cell (+-1) and she can move`, !!(same && mv && mv.ok), { before, after, labels, mv });
    if (!(same && mv && mv.ok)) await c.shot('resume-' + tag.split(' ')[0]);
  }
  // in a doorway: just stepped out of a town onto its exit cell
  const d = door('frostwatch');
  await X.boot(c.page, L.save({ x: d.exit[0], y: d.exit[1], flags: L.allFlags(), inventory: INV }), { slots: true });
  await hide(c.page, true); await c.page.waitForTimeout(800); await hide(c.page, false);
  const before = await st(c.page); let after = null, mv = null;
  try { await reloadContinue(c.page); after = await st(c.page); mv = await canMove(c.page); } catch (e) { after = { error: String(e).slice(0, 200) }; }
  c.check('save standing on a town door exit cell -> reload -> Continue: on the overworld there, can move', !!(after && after.map === 'overworld' && mv && mv.ok), { before, after, mv });
  // in town at the gate
  await X.boot(c.page, L.save({ x: d.exit[0], y: d.exit[1], flags: L.allFlags(), inventory: INV }), { slots: true });
  await L.walkCells(c.page, [d.at], { maxMs: 20000 }); await c.page.waitForTimeout(3500);
  const b2 = await st(c.page); await hide(c.page, true); await c.page.waitForTimeout(800); await hide(c.page, false);
  let a2 = null, mv2 = null; try { await reloadContinue(c.page); await c.page.waitForTimeout(3000); a2 = await st(c.page); mv2 = await canMove(c.page); } catch (e) { a2 = { error: String(e).slice(0, 200) }; }
  c.check('save (hide) in town just inside the gate -> reload -> Continue: in that town, can move', !!(a2 && a2.town === b2.town && mv2 && mv2.ok), { b2, a2, mv2 });
  if (!(a2 && a2.town === b2.town && mv2 && mv2.ok)) await c.shot('resume-town-gate');
};
// tabs: every tab opens, switching tabs, close; rapid taps; and every Settings row toggled twice
SC['tabs'] = async c => {
  await X.boot(c.page, L.save({ x: 80, y: 262, flags: L.allFlags(), inventory: INV }));
  for (let i = 0; i < 4; i++) { await tab(c.page, i); await c.page.waitForTimeout(1300); const mo = await menuOpen(c.page); const cur = await c.page.evaluate(() => { const m = window.__PHASER_GAME__.scene.getScene('MenuScene'); return m && m.currentTab; });
    c.check(`field tab ${i} opens the menu on that tab`, mo, { cur }); await closeMenu(c.page); await c.page.waitForTimeout(700); c.check(`close button closes tab ${i}`, !(await menuOpen(c.page)), null); }
  for (let k = 0; k < 12; k++) { await tab(c.page, c.rnd4()); await c.page.waitForTimeout(30 + c.rnd() * 120); if (c.rnd() < 0.3) await closeMenu(c.page); }
  await c.page.waitForTimeout(1500); if (await menuOpen(c.page)) { await closeMenu(c.page); await c.page.waitForTimeout(700); }
  const s = await st(c.page), mv = await canMove(c.page); c.check('12 rapid random tab/close taps: menu closes, she can move', mv.ok && !s.paused, { s, mv });
};
// languages: EN / ja kana / ja kanji: overworld HUD, every menu tab, a town, mechanic prompts
SC['lang'] = async c => {
  for (const [loc, kanji] of [['en', false], ['ja', false], ['ja', true]]) {
    const tagL = loc + (kanji ? '-kanji' : '');
    await X.boot(c.page, L.save({ x: 80, y: 262, flags: L.allFlags(), inventory: INV, locale: loc, kanjiMode: kanji }));
    let keys = new Set(await raw(c.page));
    for (let i = 0; i < 4; i++) { await tab(c.page, i); await c.page.waitForTimeout(1200); (await raw(c.page)).forEach(k => keys.add(k)); if (i === 3) await c.shot('lang-' + tagL + '-settings'); await closeMenu(c.page); await c.page.waitForTimeout(500); }
    c.check(`${tagL}: overworld HUD and all four menu tabs show no raw keys`, keys.size === 0, [...keys]);
    // towns: one per act
    for (const id of ['ironkeep', 'embersRest']) { const d = door(id);
      await X.boot(c.page, L.save({ x: d.exit[0], y: d.exit[1], flags: L.allFlags(), inventory: INV, locale: loc, kanjiMode: kanji }));
      await L.walkCells(c.page, [d.at], { maxMs: 20000 }); await c.page.waitForTimeout(3500);
      const k2 = await raw(c.page); c.check(`${tagL}: town ${id} (HUD, frame) shows no raw keys`, k2.length === 0, k2); }
  }
};

// mechanic prompt verbs in one locale (X_LOC = ja | ja-kanji | en): f1 of every mechanic dungeon
SC['lang-mech'] = async c => { const tagL = process.env.X_LOC || 'ja', loc = tagL.startsWith('ja') ? 'ja' : 'en', kanji = tagL.endsWith('kanji');
  // mechanic prompts: f1 of every mechanic dungeon, all verbs the floor offers (flood + a1mNearbyInteract)
    const bad = {};
    for (const [id, D] of Object.entries(man.dungeons)) { if (!D.mechanic || D.mechanic === 'none') continue;
      const ld = man.floors[id + '-f1'].land, sp = ld.mouth || ld.entrance;
      await X.boot(c.page, L.save({ mapId: id, x: sp.x, y: sp.y, floor: 1, flags: L.allFlags(), inventory: INV, locale: loc, kanjiMode: kanji }));
      const r = await c.page.evaluate(X.FLOOD, { step: 8, nearEvery: 1 });
      const verbs = [...new Set(r.prompts.map(p => p.verb).filter(Boolean))];
      const rk = verbs.filter(v => /^\[|\]$|^[a-z0-9]+(\.[a-zA-Z0-9]+)+$/.test(v) || (loc === 'ja' && /^[A-Za-z ]+$/.test(v)));
      const k3 = await raw(c.page); if (rk.length || k3.length) bad[id] = { verbs, rk, screen: k3 };
      c.note('verbs', { loc: tagL, id, verbs }); }
    c.check(`${tagL}: mechanic prompt verbs on f1 of every mechanic dungeon are translated (no raw keys, no English in ja)`, Object.keys(bad).length === 0, bad);
};

(async () => {
  const a = process.argv.slice(2); const si = a.indexOf('--seed'); const seed = si >= 0 ? +a.splice(si, 2)[1] : 1;
  const names = a.length ? a : Object.keys(SC);
  const S = await X.launchX(), page = S.page;
  let s = seed; const rnd = () => { s |= 0; s = s + 0x6D2B79F5 | 0; let t = Math.imul(s ^ s >>> 15, 1 | s); t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t; return ((t ^ t >>> 14) >>> 0) / 4294967296; };
  for (const n of names) {
    const row = { scenario: n, seed, checks: [], notes: [] };
    const c = { S, page, rnd, rnd4: () => (rnd() * 4) | 0, shot: tag => X.jpeg(page, SH, `${n}-${tag}`),
      check: (what, ok, detail) => { const r = { what, status: ok === true ? 'PASS' : ok === false ? 'FAIL' : String(ok), detail: JSON.stringify(detail === undefined ? null : detail).slice(0, 900), errors: S.errors.splice(0).slice(0, 4) };
        row.checks.push(r); console.log(`[${r.status}] ${n}: ${what}${r.status !== 'PASS' ? ' -- ' + r.detail : ''}${r.errors.length ? ' ERR ' + JSON.stringify(r.errors) : ''}`); },
      note: (k, v) => row.notes.push({ k, v }) };
    try { await SC[n](c); } catch (e) { row.error = String(e && e.stack || e).slice(0, 500); console.log(n, 'ERROR', row.error); await c.shot('error').catch(() => {}); }
    X.append('fuzz-menu.jsonl', row);
  }
  await S.browser.close();
})();
