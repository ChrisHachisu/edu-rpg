'use strict';
// The Act 2 wind gate (index `gates`, acts-runtime.js story gates): without the Windbreaker Stone
// she is stopped at the gate and told why, the gust plays there; given the stone (live, no reload)
// the gate opens, the clearing moment plays once as she walks through, and never again.
//   NODE_PATH=/opt/node-tools/node_modules PROBE_OUT=<dir> PROBE_URL=http://127.0.0.1:5191/ node scripts/acts/probe/wind_gate.cjs
// Writes wind-gate.json, screenshots, and a WebM of the run (video/) with the marks in wind-gate.json
// (`marks`: ms from the start of the recording) to cut the gust / refusal / clearing clips from.
const fs = require('fs'), path = require('path');
const L = require('./lib.cjs');
const PILOT = fs.readFileSync(path.join(__dirname, 'pilot.js'), 'utf8');
const STONE = { itemId: 'windbreakerStone', quantity: 1 };
(async () => {
  const vdir = path.join(L.OUT, 'video'); fs.rmSync(vdir, { recursive: true, force: true });
  const { browser, ctx, page, errors } = await L.launch({ video: vdir });
  const T0 = Date.now(), marks = {}, mark = k => { marks[k] = Date.now() - T0; };
  const out = { url: L.URL_, marks };
  const G = () => page.evaluate(() => { const w = window.__PHASER_GAME__.scene.getScene('WorldMapScene'), g = window.__QOK_MULTIACT__.gates()[0];
    const fl = window.__GAME_STATE__.player.state.storyFlags;
    return { ...g, tiles: g.cells.map(c => w.mapData[c[1]][c[0]]), seen: !!fl['canyon.blocked.seen'], windCleared: !!fl['canyon.windCleared'],
      bundleOverlays: (w._windTileOverlays || []).length, bundleOverlaysVisible: (w._windTileOverlays || []).filter(o => o.visible).length }; });
  const msgs = () => page.evaluate(() => window.__P.msgs().map(m => m.t));
  try {
    // ---- 1. closed: no stone
    await L.bootSave(page, L.save({ x: 221, y: 331, flags: L.allFlags() }), { settle: 4000 });
    await page.evaluate(PILOT); await page.evaluate(() => window.__P.hookMsgs());
    out.closed = { gate: await G(), at: await L.pos(page) };
    await L.shot(page, 'wind-closed');
    mark('gust'); await page.waitForTimeout(4000); mark('gustEnd');
    mark('refuse'); out.closed.walk = await L.walkCells(page, [[228, 331]], { maxMs: 6000 });    // up to the gate
    await L.stick(page, 1, 0, 1500); await page.waitForTimeout(300);              // and straight into it (a d-pad press)
    out.closed.after = await L.pos(page);
    out.closed.msgs = await msgs();
    await L.shot(page, 'wind-blocked-message');
    out.closed.gateAfter = await G();
    await page.waitForTimeout(1200); mark('refuseEnd');
    await page.evaluate(() => window.__P.dismiss());
    for (const [dx, dy] of [[1, 0], [0.8, -0.6], [0.8, 0.6]]) await L.stick(page, dx, dy, 2500), await page.evaluate(() => window.__P.dismiss());
    out.closed.afterPush = await L.pos(page);
    out.closed.passBlocked = out.closed.afterPush.cx < 224 && out.closed.after.cx < 224;
    // ---- 2. the stone arrives (live, no reload) and she walks through
    await page.evaluate(() => { window.__P.dismiss(); window.__GAME_STATE__.player.addItem('windbreakerStone', 1); window.__P.clearMsgs(); });
    await page.waitForTimeout(500);
    out.open = { gate: await G() };
    await L.shot(page, 'wind-open-before');
    mark('clear'); out.open.walk = await L.walkCells(page, [[223, 331], [227, 331]], { maxMs: 12000 });
    await page.waitForTimeout(2500); mark('clearEnd');
    out.open.after = await L.pos(page); out.open.msgs = await msgs(); out.open.gateAfter = await G();
    await L.shot(page, 'wind-cleared');
    // back and forth again: nothing more plays
    await page.evaluate(() => { window.__P.dismiss(); window.__P.clearMsgs(); });
    await L.walkCells(page, [[221, 331], [227, 331], [221, 331]], { maxMs: 20000 });
    out.open.again = { gate: await G(), msgs: await msgs(), at: await L.pos(page) };
    // ---- 3. a save that already has the stone and the cleared flag: no gust, open
    await L.bootSave(page, L.save({ x: 221, y: 331, flags: { ...L.allFlags(), 'canyon.windCleared': true }, inventory: [STONE] }), { settle: 3000 });
    await page.evaluate(PILOT); await page.evaluate(() => window.__P.hookMsgs());
    out.clearedSave = { gate: await G() };
    out.clearedSave.walk = await L.walkCells(page, [[227, 331]], { maxMs: 8000 });
    out.clearedSave.after = await L.pos(page); out.clearedSave.msgs = await msgs(); out.clearedSave.gateAfter = await G();
    // ---- 4. Japanese: the blocked line in kana and in kanji
    for (const kanji of [false, true]) {
      await L.bootSave(page, L.save({ x: 221, y: 331, flags: L.allFlags(), locale: 'ja', kanjiMode: kanji }), { settle: 3000 });
      await page.evaluate(PILOT); await page.evaluate(() => window.__P.hookMsgs());
      await L.walkCells(page, [[228, 331]], { maxMs: 5000 }); await L.stick(page, 1, 0, 1500); await page.waitForTimeout(300);
      out[kanji ? 'jaKanji' : 'jaKana'] = await msgs();
      await L.shot(page, 'wind-blocked-' + (kanji ? 'kanji' : 'kana'));
    }
  } catch (e) { out.error = String(e && e.stack || e); }
  out.errors = errors;
  const C = out.closed || {}, O = out.open || {}, S = out.clearedSave || {};
  const has = (a, re) => (a || []).some(t => re.test(t));
  out.verdict = {
    closedTiles13: !!C.gate && C.gate.tiles.every(t => t === 13), gustDrawnClosed: !!C.gate && C.gate.drawn,
    blocked: !!C.passBlocked, blockedMessage: has(C.msgs, /Fierce winds block/), seenFlag: !!(C.gateAfter && C.gateAfter.seen),
    bundleOverlaysHidden: !!C.gate && C.gate.bundleOverlaysVisible === 0,
    openLive: !!O.gate && !O.gate.shut && O.gate.tiles.every(t => t !== 13), passed: !!O.after && O.after.cx > 225,
    clearedOnce: !!O.gateAfter && O.gateAfter.plays === 1 && O.gateAfter.windCleared && has(O.msgs, /Windbreaker Stone calms the gale/),
    notAgain: !!O.again && O.again.gate.plays === 1 && !has(O.again.msgs, /calms the gale/),
    clearedSaveOpen: !!S.gate && !S.gate.drawn && !S.gate.shut && !!S.after && S.after.cx > 225 && S.gateAfter.plays === 0,
    jaMessages: has(out.jaKana, /かぜ/) && has(out.jaKanji, /風/),
    pageErrors: (out.errors || []).filter(e => e.t === 'pageerror').length };
  out.pass = Object.entries(out.verdict).every(([k, v]) => k === 'pageErrors' ? v === 0 : v === true);
  fs.writeFileSync(path.join(L.OUT, 'wind-gate.json'), JSON.stringify(out, null, 1));
  console.log(JSON.stringify(out.verdict), out.pass ? 'PASS' : 'FAIL', out.error || '');
  await ctx.close(); await browser.close();
  const vid = fs.existsSync(vdir) ? fs.readdirSync(vdir).filter(f => f.endsWith('.webm')) : [];
  if (vid.length) fs.renameSync(path.join(vdir, vid[0]), path.join(vdir, 'wind-gate.webm'));
})();
