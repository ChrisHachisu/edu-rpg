#!/usr/bin/env node
// Build 92 cloud probe: compares per-frame cost of overworld vs town vs dungeon.
// Usage: node scripts/.scene_cost_probe.cjs <url> <scene: ow|town|dng> <outfile>
'use strict';
const fs = require('fs');
const { chromium } = require('/opt/node22/lib/node_modules/playwright');
const [url, which, outFile] = process.argv.slice(2);

const POS = {
  ow: { mapId: 'overworld', x: +(process.env.POSX || 69), y: +(process.env.POSY || 256), floor: 1 },
  town: { mapId: 'overworld', x: 69, y: 256, floor: 1 },          // walk north into Greenhollow
  dng: { mapId: 'whisperingWoodsCave', x: 6, y: 8, floor: 1 },
};
const SAVE = {
  version: 4, timestamp: 1754500000000,
  player: {
    name: 'Perf', heroColor: 'gray', level: 5, exp: 0, expToNext: 100,
    hp: 40, maxHp: 40, atk: 15, def: 5, spd: 6,
    equipment: { weapon: null, armor: null, shield: null, helmet: null, accessory: null },
    inventory: [{ itemId: 'herb', quantity: 3 }], gold: 200,
    position: POS[which],
    storyFlags: {}, activeQuests: [], completedQuests: [], questProgress: {},
    timerEnabled: true, quizDifficulty: '3', locale: 'en', soundEnabled: false, masterVolume: 0, kanjiMode: false,
  },
  playtime: 0, quizStats: {},
};

function init() {
  const P = window.__SC = { byLayer: {}, sampling: false, frames: [], steps: [], ticks: [], tickLong: 0, loaf: [], fill: [], objs: [], enc: 0 };
  // time every setInterval callback named tick (dq-tiles.js's 80 ms poll)
  const si = window.setInterval;
  window.setInterval = function (fn, ms) {
    if (typeof fn === 'function' && ms === 80) {
      const f = fn;
      fn = function () { const t = performance.now(); try { return f.apply(this, arguments); } finally { if (P.sampling) P.ticks.push(performance.now() - t); } };
    }
    return si.call(this, fn, ms);
  };
  try {
    new PerformanceObserver((l) => { for (const e of l.getEntries()) if (P.sampling) P.loaf.push(e.duration); })
      .observe({ type: 'long-animation-frame', buffered: false });
  } catch (e) {}
  const KC = { ArrowUp: 38, ArrowDown: 40, ArrowLeft: 37, ArrowRight: 39 };
  const VEC = { ArrowUp: [0, -1], ArrowDown: [0, 1], ArrowLeft: [-1, 0], ArrowRight: [1, 0] };
  const held = {};
  function fire(type, key) {
    const ev = new KeyboardEvent(type, { key, code: key, bubbles: true, cancelable: true });
    try { Object.defineProperty(ev, 'keyCode', { get: () => KC[key] }); Object.defineProperty(ev, 'which', { get: () => KC[key] }); } catch (e) {}
    window.dispatchEvent(ev);
  }
  window.__setDir = function (dir) {
    for (const k of Object.keys(KC)) {
      if (k === dir && !held[k]) { held[k] = 1; fire('keydown', k); }
      else if (k !== dir && held[k]) { delete held[k]; fire('keyup', k); }
    }
    window.__DQ_STICK__ = dir ? { x: VEC[dir][0], y: VEC[dir][1], m: 1 } : { x: 0, y: 0, m: 0 };
  };
  // wrap game.step once the game exists, and sample what the camera is drawing
  let prev = performance.now();
  function raf() {
    const now = performance.now();
    if (P.sampling) P.frames.push(now - prev);
    prev = now;
    if (P.sampling && window.__HUD) {
      let el = document.getElementById('__fpshud');
      if (!el) { el = document.createElement('div'); el.id = '__fpshud'; el.style.cssText = 'position:fixed;left:0;right:0;top:78px;text-align:center;z-index:99999;font:bold 30px sans-serif;color:#fff;text-shadow:0 0 4px #000,0 0 8px #000;pointer-events:none'; document.body.appendChild(el); }
      if (!P.hudAt || now - P.hudAt > 500) { P.hudAt = now; let t = 0, n = 0; for (let i = P.frames.length - 1; i >= 0 && t < 1000; i--) { t += P.frames[i]; n++; } el.textContent = t ? Math.round(n * 1000 / t) + ' fps' : ''; }
    }
    const g = window.__PHASER_GAME__;
    if (g && !g.__scWrapped && g.step) {
      g.__scWrapped = true;
      const st = g.step;
      g.step = function () { const t = performance.now(); try { return st.apply(this, arguments); } finally { if (P.sampling) P.steps.push(performance.now() - t); } };
    }
    if (P.sampling && g && (P.frames.length % 10 === 0)) {
      try {
        const w = g.scene.getScene('WorldMapScene'), cam = w.cameras.main, v = cam.worldView, area = v.width * v.height;
        let px = 0, n = 0;
        const walk = (list, sf) => {
          for (const o of list) {
            if (!o.visible || o.alpha === 0) continue;
            if (o.list) { walk(o.list, sf); continue; }
            if (!o.texture || o.texture.key === '__MISSING' || o.width == null) continue;
            const b = o.getBounds ? o.getBounds() : null; if (!b) continue;
            const fixed = o.scrollFactorX === 0;
            const ix = fixed ? Math.min(b.width, cam.width) * Math.min(b.height, cam.height) / (cam.zoom * cam.zoom)
              : Math.max(0, Math.min(b.right, v.right) - Math.max(b.x, v.x)) * Math.max(0, Math.min(b.bottom, v.bottom) - Math.max(b.y, v.y));
            if (ix > 0) { px += ix; n++; const k = o.texture.key, m = /^a1a_([a-z0-9]+)_/.exec(k), g = m ? m[1] : k.slice(0, 28); P.byLayer[g] = (P.byLayer[g] || 0) + ix / area; }
          }
        };
        walk(w.children.list);
        P.fill.push(px / area); P.objs.push(n);
      } catch (e) { P.err = String(e); }
    }
    requestAnimationFrame(raf);
  }
  requestAnimationFrame(raf);
}

(async () => {
  const browser = await chromium.launch({ args: ['--enable-webgl', '--ignore-gpu-blocklist', '--mute-audio'].concat((process.env.ARGS || '').split(' ').filter(Boolean)) });
  const VW = +(process.env.VW || 844), VH = +(process.env.VH || 390);
  const ctxOpts = { viewport: { width: VW, height: VH }, hasTouch: true, isMobile: true, deviceScaleFactor: 1 };
  if (process.env.RECORD) ctxOpts.recordVideo = { dir: process.env.RECORD, size: { width: VW, height: VH } };
  const bctx = await browser.newContext(ctxOpts); const page = await bctx.newPage();
  if (process.env.RECORD) await page.evaluate(() => 0).catch(() => {});
  const pageStartWall = Date.now(); const errs = []; page.on('pageerror', (e) => errs.push(e.message));
  await page.addInitScript(init);
  await page.addInitScript((a) => { window.__HIDE = a[0]; window.__DIRS = a[1]; window.__WALKMS = a[2]; window.__HUD = a[3]; }, [process.env.HIDE || '', process.env.DIRS || '', +(process.env.WALKMS || 0), !!process.env.RECORD]);
  await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 60000 });
  await page.evaluate((s) => localStorage.setItem('edu-rpg-save', JSON.stringify(s)), SAVE);
  await page.reload({ waitUntil: 'load', timeout: 60000 });
  await page.waitForFunction(() => !!window.__PHASER_GAME__, null, { timeout: 60000 });
  await page.evaluate(() => { const g = window.__PHASER_GAME__; if (g.scene.isActive('BootScene')) { g.scene.start('TitleScene'); g.scene.stop('BootScene'); } });
  await page.waitForFunction(() => { const g = window.__PHASER_GAME__, t = g.scene.getScene('TitleScene'); return t && g.scene.isActive('TitleScene') && t.menuItems && t.menuItems.length; }, null, { timeout: 60000 });
  await page.waitForFunction(() => { const c = window.__QOK_COVER__; return !c || c.phase() !== 'boot'; }, null, { timeout: 30000 }).catch(() => {});
  await page.evaluate(() => { const t = window.__PHASER_GAME__.scene.getScene('TitleScene'); t.selectedIndex = t.menuItems.findIndex((m) => m.getData && m.getData('action') === 'continue'); t.confirmTitle(); });
  await page.waitForFunction(() => { const g = window.__PHASER_GAME__; const w = g.scene.getScene('WorldMapScene'); const bc = document.getElementById('boot-cover');
    const covered = bc && getComputedStyle(bc).display !== 'none' && +getComputedStyle(bc).opacity > 0.01; return g.scene.isActive('WorldMapScene') && w.mapData && !covered && !w.showingMessage; }, null, { timeout: 120000 });
  await page.waitForTimeout(3000);
  if (which === 'town') {
    await page.evaluate(async () => { const w = window.__PHASER_GAME__.scene.getScene('WorldMapScene'); window.__setDir('ArrowUp'); const t = performance.now();
      while (w.currentMapId === 'overworld' && performance.now() - t < 15000) await new Promise(requestAnimationFrame); window.__setDir(null); });
    await page.waitForTimeout(4000);
  }
  if (process.env.SHOT) { await page.waitForTimeout(2500); await page.screenshot({ path: process.env.SHOT }); }
  if (process.env.DUMP) { console.error(JSON.stringify(await page.evaluate(() => { const g = window.__PHASER_GAME__, w = g.scene.getScene('WorldMapScene'), cam = w.cameras.main, v = cam.worldView, px = v.x + v.width * 0.7, py = v.y + v.height * 0.3, out = [];
    const walk = (l) => { for (const o of l) { if (o.list) { walk(o.list); continue; } if (!o.visible || !o.texture) continue; const b = o.getBounds && o.getBounds(); if (b && b.contains(px, py)) out.push([o.texture.key, o.depth, +o.alpha.toFixed(2), o.blendMode, o.type, o.tintTopLeft]); } };
    walk(w.children.list); return { cam: [cam.zoom, g.renderer.type, g.config.premultipliedAlpha, g.renderer.gl && g.renderer.gl.getContextAttributes()], out }; }))); }
  let cdp = null; if (process.env.PROFILE) { cdp = await page.context().newCDPSession(page); await cdp.send('Profiler.enable'); await cdp.send('Profiler.setSamplingInterval', { interval: 500 }); await cdp.send('Profiler.start'); }
  const res = await page.evaluate(async () => {
    const P = window.__SC, w = window.__PHASER_GAME__.scene.getScene('WorldMapScene');
    // no random battles during the sample
    const gs = window.__GAME_STATE__; P.noEnc = !!(gs && gs.encounterManager); if (P.noEnc) gs.encounterManager.onStep = () => null;
    const DIRS = (window.__DIRS || 'ArrowRight,ArrowDown,ArrowLeft,ArrowUp').split(','), D = { ArrowRight: [1, 0], ArrowLeft: [-1, 0], ArrowDown: [0, 1], ArrowUp: [0, -1] };
    let di = 0, moved = 0, last = w.heroTileX + ',' + w.heroTileY;
    const pick = () => { for (let k = 0; k < 4; k++) { const d = DIRS[(di + k) % 4]; try { if (w.canMove(w.heroTileX + D[d][0], w.heroTileY + D[d][1])) { di = (di + k) % 4; return d; } } catch (e) { return d; } } return DIRS[di]; };
    const map0 = w.currentMapId; P.walkStartWall = Date.now(); const HIDE = (window.__HIDE || '').split(',').filter(Boolean);
    if (HIDE.length) w.events.on('postupdate', () => { const vis = (l) => { for (const o of l) { if (o.list) vis(o.list); else if (o.texture) { const m = /^a1a_([a-z0-9]+)_/.exec(o.texture.key); if ((m && HIDE.includes(m[1])) || HIDE.includes(o.texture.key) || (HIDE.includes('uuid') && /^[0-9a-f]{8}-/.test(o.texture.key))) o.visible = false; } } }; vis(w.children.list); }); P.sampling = true; let dir = pick(); window.__setDir(dir); let since = 0;
    const t0 = performance.now();
    while (performance.now() - t0 < (window.__WALKMS || 12000)) {
      await new Promise(requestAnimationFrame);
      if (w.currentMapId !== map0) break;
      const pos = w.heroTileX + ',' + w.heroTileY; if (pos !== last) { moved++; last = pos; since = performance.now(); }
      if (performance.now() - since > 600 || (moved % 7 === 6 && pos !== last)) { di = (di + 1) % 4; dir = pick(); window.__setDir(dir); since = performance.now(); }
      if (window.__PHASER_GAME__.scene.isActive('BattleScene')) P.enc++;
    }
    P.sampling = false; window.__setDir(null); P.sampleMs = performance.now() - t0;
    let texMB = 0; const tm = window.__PHASER_GAME__.textures.list;
    for (const k in tm) for (const s of tm[k].source || []) texMB += (s.width * s.height * 4) / 1048576;
    return { map0, map1: w.currentMapId, moved, frames: P.frames, steps: P.steps, ticks: P.ticks, loaf: P.loaf, fill: P.fill, objs: P.objs, enc: P.enc, byLayer: P.byLayer, nfill: P.fill.length, noEnc: P.noEnc, sampleMs: P.sampleMs, texMB, err: P.err,
      renderer: (() => { try { const gl = document.querySelector('canvas').getContext('webgl2') || document.querySelector('canvas').getContext('webgl'); const d = gl.getExtension('WEBGL_debug_renderer_info'); return gl.getParameter(d.UNMASKED_RENDERER_WEBGL); } catch (e) { return '?'; } })() };
  });
  if (cdp) { const { profile } = await cdp.send('Profiler.stop'); fs.writeFileSync(process.env.PROFILE, JSON.stringify(profile)); }
  res.errs = errs.slice(0, 5); res.walkStartWall = await page.evaluate(() => window.__SC.walkStartWall).catch(() => null); console.error('WALKSTART ' + res.walkStartWall + ' PAGESTART ' + pageStartWall);
  fs.writeFileSync(outFile, JSON.stringify(res));
  const q = (a, p) => { const s = [...a].sort((x, y) => x - y); return s.length ? +s[Math.min(s.length - 1, Math.floor(p * s.length))].toFixed(1) : null; };
  const avg = (a) => a.length ? +(a.reduce((x, y) => x + y, 0) / a.length).toFixed(2) : null;
  const tickSum = res.ticks.reduce((x, y) => x + y, 0);
  console.log(JSON.stringify({ which, map: res.map0 + '->' + res.map1, moved: res.moved, enc: res.enc, noEnc: res.noEnc, sampleMs: Math.round(res.sampleMs), renderer: res.renderer,
    frameMed: q(res.frames, 0.5), frameP99: q(res.frames, 0.99), frameMax: q(res.frames, 1), over50: res.frames.filter(f=>f>50).length, over100: res.frames.filter(f=>f>100).length, stepAvg: avg(res.steps), stepP99: q(res.steps, 0.99),
    tickAvg: avg(res.ticks), tickMax: q(res.ticks, 1), tickMsPerSec: +(tickSum / (res.sampleMs/1000)).toFixed(1), loafN: res.loaf.length, loafMax: q(res.loaf, 1),
    overdrawScreens: avg(res.fill), byLayer: Object.fromEntries(Object.entries(res.byLayer).map(([k,v])=>[k,+(v/res.nfill).toFixed(2)]).filter(([k,v])=>v>=0.05).sort((a,b)=>b[1]-a[1])), drawnObjs: avg(res.objs), texMB: Math.round(res.texMB), err: res.err, errs: res.errs }));
  if (process.env.RECORD) { const v = page.video(); await bctx.close(); if (v) console.error('VIDEO ' + await v.path()); }
  await browser.close();
})().catch((e) => { console.error('FAIL', e); process.exit(1); });
