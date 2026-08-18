/* The scroll half of "i want the screen to snap up as well" is only observable on a viewport where
   the create column actually OVERFLOWS. At 393x852 it fits, so scrollIntoView is a legitimate no-op
   and a pass there proves nothing. 393x560 is the shape of the same screen with the iOS keyboard up,
   which is exactly when a player is most likely to be looking at the wrong end of it. */
const { chromium } = require('playwright-core');
const fs = require('fs');
const OUT = process.argv[2] || '/tmp/edu-snap';
(async () => {
  fs.mkdirSync(OUT, { recursive: true });
  const b = await chromium.launch({ headless: true, channel: 'chrome', args: ['--use-angle=swiftshader','--mute-audio'] });
  const p = await b.newPage({ viewport:{width:393,height:560}, deviceScaleFactor:1, isMobile:true, hasTouch:true });
  await p.goto((process.env.EDU_URL||'http://127.0.0.1:5178') + '/', { waitUntil:'load' });
  await p.waitForFunction(()=>!!window.__PHASER_GAME__, {timeout:20000});
  await p.evaluate(()=>{try{localStorage.removeItem('edu-rpg-save');}catch(e){}});
  await p.evaluate(()=>{const g=window.__PHASER_GAME__; if(g.scene.isActive('BootScene')){g.scene.start('TitleScene');g.scene.stop('BootScene');}});
  await p.waitForTimeout(1400);
  { const nb=await p.$('#qok-ui [data-act="titleNew"]'); const bb=await nb.boundingBox(); await p.touchscreen.tap(bb.x+bb.width/2, bb.y+bb.height/2); }
  await p.waitForSelector('#qok-gwheel', {timeout:8000}); await p.waitForTimeout(500);

  const scroller = () => p.evaluate(()=>{
    let e=document.getElementById('qok-name-panel');
    while(e && e!==document.body){ const cs=getComputedStyle(e);
      if(/auto|scroll/.test(cs.overflowY) && e.scrollHeight>e.clientHeight+4) return {sel:e.className||e.id, top:e.scrollTop, max:e.scrollHeight-e.clientHeight};
      e=e.parentElement; }
    return null; });
  console.log('scrollable ancestor:', JSON.stringify(await scroller()));
  // put the player at the bottom of the column, where the Start button is
  await p.evaluate(()=>{ let e=document.getElementById('qok-name-panel');
    while(e && e!==document.body){ const cs=getComputedStyle(e);
      if(/auto|scroll/.test(cs.overflowY) && e.scrollHeight>e.clientHeight+4){ e.scrollTop=e.scrollHeight; return; } e=e.parentElement; } });
  await p.waitForTimeout(400);
  const before = await p.evaluate(()=>{const pn=document.getElementById('qok-name-panel');const r=pn.getBoundingClientRect();
    return {scrollTop:Math.round(document.body.scrollTop), top:Math.round(r.top), vh:window.innerHeight, centred:Math.abs((r.top+r.bottom)/2 - window.innerHeight/2)<40};});
  await p.screenshot({path:`${OUT}/snap-before.png`});
  { const sb=await p.$('#qok-ui [data-act="introStart"]'); const bb=await sb.boundingBox(); await p.touchscreen.tap(bb.x+bb.width/2, bb.y+bb.height/2); }
  await p.waitForTimeout(1200);
  const after = await p.evaluate(()=>{const pn=document.getElementById('qok-name-panel');const r=pn.getBoundingClientRect();
    const err=document.getElementById('qok-name-err');
    return {scrollTop:Math.round(document.body.scrollTop), top:Math.round(r.top), vh:window.innerHeight,
            centred:Math.abs((r.top+r.bottom)/2 - window.innerHeight/2)<40,
            errText:err&&err.textContent, focused:document.activeElement===document.getElementById('qok-name')};});
  await p.screenshot({path:`${OUT}/snap-after.png`});
  console.log('BEFORE', JSON.stringify(before));
  console.log('AFTER ', JSON.stringify(after));
  // What matters is where the panel ENDS UP, not which node did the scrolling: on this shell the
// scrollport is not document.body, and chasing it added nothing. The panel moving to the centre of
// the viewport is the observable the owner asked for.
console.log(after.centred && after.top !== before.top ? 'SNAP-UP PASS: name panel moved '+before.top+' -> '+after.top+' of '+after.vh+' (centred)' : 'SNAP-UP FAIL '+JSON.stringify([before,after]));
  await b.close();
})();
