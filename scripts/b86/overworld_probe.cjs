// usage: node probe.cjs <url> <outdir> <spec.json>   spec: [{name,x,y,dy:[fractional y offsets]}]
// Build-86 overworld probe: teleports the hero, waits for chunks, screenshots at 390x844@3x.
// Env: PW_CORE (playwright-core path), CHROME_PATH (browser executable, optional).
const {chromium}=require(process.env.PW_CORE||'playwright-core');
const fs=require('fs'),path=require('path');
const [URL_,OUT,SPEC]=process.argv.slice(2); const spec=JSON.parse(fs.readFileSync(SPEC,'utf8'));
fs.mkdirSync(OUT,{recursive:true});
const SAVE={version:4,timestamp:1754500000000,player:{name:'Probe',heroColor:'gray',level:30,exp:0,expToNext:100,hp:400,maxHp:400,atk:150,def:150,spd:60,
 equipment:{weapon:null,armor:null,shield:null,helmet:null,accessory:null},inventory:[],gold:0,position:{mapId:'overworld',x:69,y:256,floor:1},
 storyFlags:{},activeQuests:[],completedQuests:[],questProgress:{},timerEnabled:true,quizDifficulty:'3',locale:'en',soundEnabled:false,masterVolume:0,kanjiMode:false},playtime:0,quizStats:{}};
(async()=>{
 const b=await chromium.launch({executablePath:process.env.CHROME_PATH||undefined});
 const ctx=await b.newContext({viewport:{width:390,height:844},deviceScaleFactor:3,hasTouch:true,isMobile:true});
 const page=await ctx.newPage(); const errs=[]; page.on('pageerror',e=>errs.push(e.message)); page.on('console',m=>{if(m.type()==='error'||/error|fail/i.test(m.text()))errs.push('console:'+m.text().slice(0,200)+' @'+JSON.stringify(m.location()))}); page.on('requestfailed',r=>errs.push('reqfail:'+r.url()+' '+(r.failure()&&r.failure().errorText)));
 await page.addInitScript(()=>{window.Capacitor={isNativePlatform:()=>true};});
 await page.route(/\/(index\.html)?(\?.*)?$/,async route=>{const r=await route.fetch();let b=await r.text();b=b.replace('WORLD_CAP = 20000','WORLD_CAP = 180000');await route.fulfill({response:r,body:b});});
 await page.goto(URL_,{waitUntil:'domcontentloaded',timeout:60000});
 await page.evaluate(s=>localStorage.setItem('edu-rpg-save',JSON.stringify(s)),SAVE);
 await page.reload({waitUntil:'load',timeout:60000});
 await page.waitForFunction(()=>!!window.__PHASER_GAME__,{timeout:60000});
 await page.evaluate(()=>{const g=window.__PHASER_GAME__; if(g.scene.isActive('BootScene')){g.scene.start('TitleScene');g.scene.stop('BootScene');}});
 await page.waitForFunction(()=>{const g=window.__PHASER_GAME__,t=g&&g.scene.getScene('TitleScene');return t&&g.scene.isActive('TitleScene')&&t.menuItems&&t.menuItems.length>0},{timeout:60000});
 await page.waitForFunction(()=>{const c=window.__QOK_COVER__;return !c||c.phase()!=='boot'},{timeout:30000}).catch(()=>{});
 await page.evaluate(()=>{const t=window.__PHASER_GAME__.scene.getScene('TitleScene');const i=t.menuItems.findIndex(m=>m.getData&&m.getData('action')==='continue');t.selectedIndex=i;t.confirmTitle();});
 await page.waitForFunction(()=>{const g=window.__PHASER_GAME__,w=g.scene.getScene('WorldMapScene');return w&&g.scene.isActive('WorldMapScene')&&w.hero},{timeout:120000});
 for(let k=0;k<6;k++){ await page.waitForTimeout(3000); const st=await page.evaluate(()=>{const g=window.__PHASER_GAME__;return {t:g.scene.isActive('TitleScene'),w:g.scene.isActive('WorldMapScene')}}); if(st.w&&!st.t){ const ph=await page.evaluate(()=>window.__QOK_COVER__&&window.__QOK_COVER__.phase()); if(ph==='error'){ console.log('ERRSTATE',await page.evaluate(()=>{const ui=window.__QOKUI,dq=window.__DQ_TILES__;return JSON.stringify({icons:ui&&ui.iconsReady&&ui.iconsReady(),hv:!!window.__HERO_VARIANT__,dq:dq&&dq.ready&&dq.ready(),art:ui&&ui.mapArtReady&&ui.mapArtReady(),keys:dq&&Object.keys(dq).slice(0,40)})})); await page.evaluate(()=>{const b=[...document.querySelectorAll('button')].find(b=>/retry/i.test(b.textContent)); if(b) b.click();}); continue;} if(ph==='active') break; }
   await page.evaluate(()=>{const t=window.__PHASER_GAME__.scene.getScene('TitleScene');if(window.__PHASER_GAME__.scene.isActive('TitleScene')&&t.menuItems){const i=t.menuItems.findIndex(m=>m.getData&&m.getData('action')==='continue');t.selectedIndex=i;t.confirmTitle();}}); }
 // no random encounters while probing
 await page.evaluate(()=>{const w=window.__PHASER_GAME__.scene.getScene('WorldMapScene'); try{w.checkEncounter=()=>false;w.encounterRate=0;}catch(e){}});
 for(const s of spec){
  await page.evaluate(({x,y})=>{const w=window.__PHASER_GAME__.scene.getScene('WorldMapScene');const T=33.6;
    w.heroTileX=x;w.heroTileY=y;w.hero.x=(x+0.5)*T;w.hero.y=(y+0.5)*T;w.cameras.main.centerOn(w.hero.x,w.hero.y);},s);
  await page.waitForTimeout(1500); await page.waitForFunction(()=>{const bc=document.getElementById('boot-cover');return !(bc&&getComputedStyle(bc).display!=='none'&&+getComputedStyle(bc).opacity>0.01)},{timeout:60000}).catch(async()=>console.log('cover still up',await page.evaluate(()=>{const c=window.__QOK_COVER__,ui=window.__QOKUI,dq=window.__DQ_TILES__;return JSON.stringify({ph:c&&c.phase(),rs:c&&c.reason(),icons:ui&&ui.iconsReady&&ui.iconsReady(),hv:!!window.__HERO_VARIANT__,dq:dq&&dq.ready&&dq.ready(),art:ui&&ui.mapArtReady&&ui.mapArtReady()})}))); await page.waitForTimeout(s.wait||2500);
  const offs=s.dy||[0];
  for(const d of offs){
   const info=await page.evaluate(({x,y,d,dx})=>{const w=window.__PHASER_GAME__.scene.getScene('WorldMapScene');const T=33.6;
     w.hero.x=(x+0.5)*T+(dx||0);w.hero.y=(y+0.5)*T+d;w.cameras.main.centerOn(w.hero.x,w.hero.y);
     return new Promise(r=>requestAnimationFrame(()=>requestAnimationFrame(()=>{const c=w.cameras.main;const cv=document.querySelector('canvas'),rc=cv.getBoundingClientRect();r({sx:c.scrollX,sy:c.scrollY,zoom:c.zoom,wv:[c.worldView.x,c.worldView.y,c.worldView.width,c.worldView.height],cw:[cv.width,cv.height],css:[rc.left,rc.top,rc.width,rc.height],dpr:devicePixelRatio,tile:[w.heroTileX,w.heroTileY]})})));},{x:s.x,y:s.y,d,dx:s.dx});
   if(s.js){console.log('js',await page.evaluate(s.js));}
   const f=path.join(OUT,`${s.name}${offs.length>1?'_dy'+d.toFixed(2):''}.png`);
   await page.screenshot({path:f}); console.log('diag',await page.evaluate(()=>{const c=window.__QOK_COVER__,g=window.__PHASER_GAME__;return JSON.stringify({ph:c&&c.phase(),rs:c&&c.reason(),world:g.scene.isActive('WorldMapScene'),title:g.scene.isActive('TitleScene'),bb:(window.__QOK_BLACKBOX__&&window.__QOK_BLACKBOX__.last&&window.__QOK_BLACKBOX__.last())||null})})); console.log(f,JSON.stringify(info));
  }
 }
 if(errs.length) console.log('ERRORS',JSON.stringify(errs.slice(0,15),null,1));
 await b.close();
})().catch(e=>{console.error('FAIL',e.message);process.exit(1)});
