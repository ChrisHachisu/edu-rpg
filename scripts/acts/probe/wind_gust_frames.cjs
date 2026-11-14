'use strict';
// Media for the wind gate's gust: a deterministic frame sequence of the closed gate (the gust is
// driven by Date.now(), which is stepped here 1000/FPS ms per frame, so the frames are evenly
// spaced however slow the headless renderer is). For review GIFs, not a pass/fail probe.
//   NODE_PATH=/opt/node-tools/node_modules PROBE_OUT=<dir> PROBE_URL=http://127.0.0.1:5191/ node scripts/acts/probe/wind_gust_frames.cjs [frames] [fps]
const fs = require('fs'), path = require('path');
const L = require('./lib.cjs');
(async () => {
  const N = +(process.argv[2] || 45), FPS = +(process.argv[3] || 15);
  const { browser, page } = await L.launch({ dpr: 2 });
  await L.bootSave(page, L.save({ x: 221, y: 331, flags: L.allFlags() }), { settle: 4000 });
  const dir = path.join(L.OUT, 'gust-frames'); fs.rmSync(dir, { recursive: true, force: true }); fs.mkdirSync(dir, { recursive: true });
  await page.evaluate(() => { const real = Date.now.bind(Date); window.__T = real(); Date.now = () => window.__T; });
  for (let i = 0; i < N; i++) {
    await page.evaluate(ms => { window.__T += ms; return new Promise(r => requestAnimationFrame(() => requestAnimationFrame(r))); }, 1000 / FPS);
    await page.screenshot({ path: path.join(dir, String(i).padStart(3, '0') + '.png'), clip: { x: 130, y: 250, width: 260, height: 260 } });
  }
  console.log('frames', N, 'at', FPS, 'fps ->', dir);
  await browser.close();
})();
