/* MEASURE the fuzz on the real town page, do not reason about it.
   On an exact 3x art->device ratio every art pixel must land on a uniform 3x3 device block. The
   fraction is only meaningful if all 9 phase offsets are tried and the MAX taken -- misaligned it
   reads near zero and looks like proof of the opposite.
   Sampled while the hero WALKS, because the camera follows him on floats: a fractional translation
   breaks the pixel grid even when the scale ratio is a whole number, and the existing snap only
   fixes the ratio. */
const { chromium } = require('playwright-core');
const ORIGIN = process.env.EDU_URL || 'http://127.0.0.1:5179';
const MEASURE = `(() => {
  const c = document.querySelector('canvas'), g = c.getContext('2d');
  const W = 300, H = 300, x0 = (c.width - W) >> 1, y0 = (c.height - H) >> 1;
  const d = g.getImageData(x0, y0, W, H).data;
  const px = (x, y) => { const i = ((y * W) + x) * 4; return (d[i] << 16) | (d[i+1] << 8) | d[i+2]; };
  let best = 0;
  for (let oy = 0; oy < 3; oy++) for (let ox = 0; ox < 3; ox++) {
    let uni = 0, tot = 0;
    for (let by = oy; by + 3 <= H; by += 3) for (let bx = ox; bx + 3 <= W; bx += 3) {
      const v = px(bx, by); let ok = true;
      for (let k = 1; k < 9 && ok; k++) if (px(bx + (k % 3), by + ((k / 3) | 0)) !== v) ok = false;
      tot++; if (ok) uni++;
    }
    if (uni / tot > best) best = uni / tot;
  }
  return best;
})()`;
(async () => {
  const b = await chromium.launch({ headless: true, channel: 'chrome', args: ['--use-angle=swiftshader','--mute-audio'] });
  const p = await b.newPage({ viewport:{width:390,height:844}, deviceScaleFactor:3, isMobile:true, hasTouch:true });
  await p.goto(ORIGIN + '/act1-hifi/town.html', { waitUntil:'load' });
  await p.waitForTimeout(3000);
  const res = [];
  res.push(['at load', await p.evaluate(MEASURE)]);
  for (let i = 0; i < 6; i++) {
    await p.keyboard.down('ArrowRight');
    await p.waitForTimeout(40 + i * 17);          // stop on a different sub-pixel phase each time
    await p.keyboard.up('ArrowRight');
    await p.waitForTimeout(180);
    res.push([`after walk ${i + 1}`, await p.evaluate(MEASURE)]);
  }
  for (const [k, v] of res) console.log(`  ${k.padEnd(14)} uniform 3x3 blocks ${(100 * v).toFixed(1)}%`);
  const vals = res.map(r => r[1]);
  console.log(`\n  min ${(100*Math.min(...vals)).toFixed(1)}%   max ${(100*Math.max(...vals)).toFixed(1)}%   (overworld reference: 100%)`);
  await p.screenshot({ path: '/tmp/town-fuzz.png' });
  await b.close();
})();
