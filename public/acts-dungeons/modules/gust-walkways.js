/* Storm Nest: gust walkways (mechanic id `gust-walkways`).

   Each plan zone `gustLane` is a band right across the tower that a window blows down in turns:
   every `period` ticks it gusts for `active` ticks, starting at tick `phase` of the cycle, and
   for `warn` ticks before that the lane shows it is coming (the window glows, dust streams start
   to crawl, the walkway cells of the lane pulse). While it gusts, standing on one of the lane's
   walkway cells ('q') means being blown off: she is carried down-wind over the edge, falls, and
   comes to on the plan's landing for that edge (mechanic.fallLandings: `landsAt` on
   `landsOnFloor`, which is this floor on floor 1 - "back at the door" - and the floor below
   higher up). One plan tick is 185 ms (one hero step).

   Nothing to persist: the gusts are a clock, and a fall only moves her. */
(function boot(){
  'use strict';
  var K=window.__QOK_D2KIT_A__; if(!K){ setTimeout(boot,40); return; }
  var TILE=K.TILE, TICK=K.TICK, pendingNote=null;
  // Kid timing (owner P9; day-2 kid-timing pass, 2026-11-24; day-3 grades 3-4, 2026-11-26). Shared by storm-terrace.js and
  // gust-walkways.js (whichever loads first defines it; both copies are identical). The warning before a strike / gust
  // lasts about twice the age group's reaction time and the cycle grows with it (the calm stretches grow so a child who
  // stops late is rarely caught). Quiz grades K, 1, 2: 1.5 s. Grades 3 and 4: 1.25 s warning (2.5x a 0.5 s reaction; 1.0 s measured worse), 1.6 s calm. Grades 5 and 6: the plan's glow plus a 0.6 s calm stretch (Stormreach only).
  // localStorage 'qok-kid-timing' = '0' restores the plan's timing for every grade.
  var KT = window.__QOK_KIDTIME__ || (window.__QOK_KIDTIME__ = {
    warnMs: 1500,      // the warning: about twice a grade-1 reaction (0.7 s)
    calmMs: 1000,      // Stormreach: after a group's strike the whole terrace is calm this long before the next glow
    gustShare: 6,      // Storm Nest: a lane blows for at most 1/6 of its cycle (a 200 ms late stop rarely meets a gust)
    mid: { warnMs: 1250, calmMs: 1600, gustShare: 5, gustWarnMs: 1000 },   // grades 3 and 4: 2.5x a 0.5 s reaction (Storm Nest: 2x, measured better)
    high: { warnMs: 700, calmMs: 600, gustShare: 0 },    // grades 5 and 6: the plan's glow (at least twice a 0.35 s reaction) plus a short calm stretch; gust lanes keep the plan
    tier: function () {
      try { if (window.localStorage && window.localStorage.getItem('qok-kid-timing') === '0') return null; } catch (e) {}
      var q; try { q = String(window.__GAME_STATE__.player.state.quizDifficulty).toLowerCase(); } catch (e) { return null; }
      if (q === 'k' || q === '0' || q === '1' || q === '2') return 'young';
      if (q === '3' || q === '4') return 'mid';
      if (q === '5' || q === '6') return 'high';
      return null;
    },
    young: function () { return this.tier() !== null; },
    cfg: function () { var t = this.tier(); return t === 'mid' ? this.mid : (t === 'high' ? this.high : this); },
    warnTicks: function (planTicks, ms, kind) { var c = this.cfg(); return Math.max(planTicks, Math.round(((kind === 'gust' && c.gustWarnMs) || c.warnMs) / ms)); },
    calmTicks: function (ms) { return Math.round(this.cfg().calmMs / ms); },
    share: function () { return this.cfg().gustShare; }
  });
  // grades K-2: the lane warns for about 1.5 s and the lull grows until the gust is at most 1/gustShare
  // of the cycle; the gust itself is the plan's length. The lanes' phases scale with the period, so
  // they still blow in the same turn.
  function kidLane(L,young){
    L.plan={period:L.period,warn:L.warn,phase:L.phase}; L.kid=false;
    if(!young) return L;
    var w=KT.warnTicks(L.warn,TICK,'gust'), d=w-L.warn, per=Math.max(L.period+d, L.active*KT.share()); if(d<=0 && per===L.period) return L;
    L.phase=Math.round(L.phase*per/L.period); L.period=per; L.warn=w; L.kid=true; return L;
  }
  function phaseOf(L,t){                                    // t in ticks -> {on, warn, pos, left}
    var pos=((t-L.phase)%L.period+L.period)%L.period;
    return { pos:pos, on:pos<L.active, warn:pos>=L.period-L.warn, toGust:(pos<L.active)?0:(L.period-pos), left:(pos<L.active)?(L.active-pos):0 };
  }
  function loadWindow(sc){
    var key='d2a_gust_window'; if(sc.textures.exists(key)||loadWindow.req||typeof Image==='undefined') return key; loadWindow.req=true;
    var im=new Image(); im.onload=function(){ try{ if(!sc.textures.exists(key)) sc.textures.addImage(key,im); }catch(e){} };
    im.onerror=function(){ loadWindow.req=false; }; im.src='acts-dungeons/modules/a-art/gust-window.webp'; return key;
  }
  function texChevron(sc){ return K.tex(sc,'d2a_gust_chev',48,48,function(g){   // points right; rotated to the wind
    g.strokeStyle='rgba(235,246,255,0.95)'; g.lineWidth=4; g.lineCap='round'; g.lineJoin='round';
    g.beginPath(); g.moveTo(14,12); g.lineTo(26,24); g.lineTo(14,36); g.stroke();
    g.beginPath(); g.moveTo(26,12); g.lineTo(38,24); g.lineTo(26,36); g.stroke();
  }); }
  function nearestLanding(ctx,laneId,cx,cy){
    var a=ctx.mechanic.fallLandings||[], best=null, bd=1e9, i;
    for(i=0;i<a.length;i++){ if(a[i].lane!==laneId) continue; var d=Math.abs(a[i].fallAt[0]-cx)+Math.abs(a[i].fallAt[1]-cy); if(d<bd){ bd=d; best=a[i]; } }
    if(!best) for(i=0;i<a.length;i++){ var d2=Math.abs(a[i].fallAt[0]-cx)+Math.abs(a[i].fallAt[1]-cy); if(d2<bd){ bd=d2; best=a[i]; } }
    return best;
  }
  function OLD(){ try{ return !!(window.__QOK_F2OLD__&&window.__QOK_F2OLD__('gust')); }catch(e){ return false; } }
  // one wisp: tapered at both ends (width and alpha follow sin(pi*u)), with a slight sway across
  function wisp(g,x,y,dx,dy,len,wmax,amax,col,sway){
    var N=7, px=-dy, py=dx, i, u0, u1;
    for(i=0;i<N;i++){ u0=i/N; u1=(i+1)/N; var um=(u0+u1)/2, k=Math.sin(Math.PI*um);
      g.lineStyle(Math.max(0.6,wmax*k),col,amax*k);
      var o0=sway*Math.sin(Math.PI*u0), o1=sway*Math.sin(Math.PI*u1);
      g.beginPath(); g.moveTo(x+dx*len*u0+px*o0,y+dy*len*u0+py*o0); g.lineTo(x+dx*len*u1+px*o1,y+dy*len*u1+py*o1); g.strokePath(); }
  }
  // Day-4 look (census DA-07; owner 2026-11-03: "no banners; a clear gust animation is the cue").
  // The cue was a white double chevron stamped on every lane cell (faint in a lull, pulsing in the
  // warning, solid in the gust) over a tinted rectangle of cells: road markings, not wind. Now:
  //   * a lull draws nothing on the tiles;
  //   * the warning and the gust are AIR: a band of soft streaks runs the length of the lane and
  //     travels down-wind (slow and warm while it warns, quickening as the gust nears; fast and
  //     pale while it blows), feathered at its sides so the lane has no ruled edge;
  //   * near her the wisps over the floor are bolder and travel the same way, with dust carried
  //     along.
  // The clock, the lane cells and the window glow are untouched. 'qok-d4-looks'='0' = the old look.
  var LOOKS=(function(){ try{ return window.localStorage.getItem('qok-d4-looks')!=='0'; }catch(e){ return true; } })();
  var WIND_W=512, WIND_H=256, WIND_FEATHER=32;              // the band's tile: 512 px down-wind, 256 px across (the lane plus half a cell of feather each side)
  function texWind(sc){
    var key=K.tex(sc,'d2a_gust_wind',WIND_W,WIND_H,function(g){
      var y, i, s=11;
      function rnd(){ s=(s*1103515245+12345)&0x7fffffff; return s/0x7fffffff; }
      for(y=0;y<WIND_H;y++){                                // a thin haze, feathered to nothing at both sides
        var e=Math.min(y,WIND_H-1-y)/WIND_FEATHER; e=e>1?1:e; e=e*e*(3-2*e);
        g.fillStyle='rgba(255,255,255,'+(0.30*e).toFixed(3)+')'; g.fillRect(0,y,WIND_W,1); }
      for(i=0;i<26;i++){                                    // streaks: tapered at both ends, a cool shade under each so they read on pale stone too
        var len=70+rnd()*150, x0=rnd()*WIND_W, yy=WIND_FEATHER+10+rnd()*(WIND_H-2*WIND_FEATHER-20), th=1.6+rnd()*2.6, a=0.55+rnd()*0.4, c;
        for(c=-1;c<=1;c++){ var xa=x0+c*WIND_W;              // drawn three times so the tile wraps without a seam
          var sh=g.createLinearGradient(xa,0,xa+len,0); sh.addColorStop(0,'rgba(52,84,122,0)'); sh.addColorStop(0.5,'rgba(52,84,122,'+(0.36*a).toFixed(3)+')'); sh.addColorStop(1,'rgba(52,84,122,0)');
          g.fillStyle=sh; g.fillRect(xa,yy+th*0.6,len,th+1.2);
          var gr=g.createLinearGradient(xa,0,xa+len,0); gr.addColorStop(0,'rgba(255,255,255,0)'); gr.addColorStop(0.55,'rgba(255,255,255,'+a.toFixed(3)+')'); gr.addColorStop(1,'rgba(255,255,255,0)');
          g.fillStyle=gr; g.fillRect(xa,yy-th/2,len,th); } }
    });
    try{ sc.textures.get(key).setFilter(0); }catch(e){}     // 0 = LINEAR: soft, not pixel-stepped
    return key;
  }
  // one wisp near her: tapered like wisp(), every piece faded by its own distance from her
  function wispNear(g,x,y,dx,dy,len,wmax,amax,col,sway,hx,hy,R0,R1){
    var N=7, px=-dy, py=dx, i, drawn=0;
    for(i=0;i<N;i++){ var u0=i/N, u1=(i+1)/N, um=(u0+u1)/2, k=Math.sin(Math.PI*um);
      var mx=x+dx*len*um, my=y+dy*len*um, d=Math.sqrt((mx-hx)*(mx-hx)+(my-hy)*(my-hy)), f=d<=R0?1:(d>=R1?0:1-(d-R0)/(R1-R0)), al=amax*k*f;
      if(al<0.012) continue;
      g.lineStyle(Math.max(0.6,wmax*k),col,al);
      var o0=sway*Math.sin(Math.PI*u0), o1=sway*Math.sin(Math.PI*u1);
      g.beginPath(); g.moveTo(x+dx*len*u0+px*o0,y+dy*len*u0+py*o0); g.lineTo(x+dx*len*u1+px*o1,y+dy*len*u1+py*o1); g.strokePath(); drawn++; }
    return drawn;
  }
  function open(ctx,x,y){ var c=ctx.terrain(x,y); return c==='.'||c==='q'; }
  function land(ctx,L){                                      // put her down on this floor
    var sc=ctx.scene, st=ctx.state, h=sc.hero;
    try{ sc.tweens.killTweensOf(h); h.setScale(st.heroScale||h.scaleX); h.setAlpha(1); h.setAngle(0); }catch(e){}
    K.placeSoles(ctx,L.landsAt[0]*TILE+TILE/2,L.landsAt[1]*TILE+TILE/2,0);
    try{ sc.cameras.main.fadeIn(350,0,0,0); }catch(e){}
    st.blown=null; st.falls=(st.falls||0)+1; st.grace=600;
    ctx.say(K.S('gust.blown'));
  }
  K.ready(function(K,D){ D.register('gust-walkways',{
    load:function(ctx){
      var sc=ctx.scene, st=ctx.state, z=ctx.plan.zones||[], mech=ctx.plan.mech||[], i, j;
      // M14 (census 2026-11-23): the streaks were pure-white 2-3 px bars at depth 10.8, ABOVE the fog,
      // so in the dark beyond the walkway they ran the full height of the screen behind the HUD and
      // the joystick and read as a glitch. Now (unless qok-f2-old=gust) they sit under the fog
      // (depth 7.9: only the lit play field around her shows them), fade out with distance from
      // her, and are soft tapered pale-blue wisps. The window glow and the chevrons are unchanged.
      st.old=OLD(); st.kid=KT.young(); st.lanes=[]; st.cell={}; st.t=0; st.blown=null; st.grace=0; st.fx=ctx.own(sc.add.graphics().setDepth(st.old?10.8:7.9)); st.tint=ctx.own(sc.add.graphics().setDepth(2.5));
      st.looks=LOOKS&&!st.old; if(st.looks) st.dust=ctx.own(sc.add.graphics().setDepth(7.9));
      for(i=0;i<z.length;i++){ if(z[i].kind!=='gustLane') continue;
        var L={id:z[i].id,rect:z[i].rect,dir:z[i].dir,cells:z[i].cells,period:z[i].period,active:z[i].active,warn:z[i].warn,phase:z[i].phase||0,chev:[],win:null}; kidLane(L,st.kid);
        if(st.looks){                                        // the lane's air: one band the length of the lane, turned to the wind
          var bw=(L.dir[0]!==0?(L.rect[2]-L.rect[0]+1):(L.rect[3]-L.rect[1]+1))*TILE, ba=(L.dir[0]!==0?(L.rect[3]-L.rect[1]+1):(L.rect[2]-L.rect[0]+1))*TILE;
          L.band=ctx.own(sc.add.tileSprite((L.rect[0]+L.rect[2]+1)/2*TILE,(L.rect[1]+L.rect[3]+1)/2*TILE,bw,WIND_H,texWind(sc)));
          L.band.setDepth(2.5).setRotation(Math.atan2(L.dir[1],L.dir[0])).setScale(1,(ba+TILE)/WIND_H).setAlpha(0).setVisible(false); L.off=0; L.dustOff=0; }
        for(j=0;j<L.cells.length;j++){ st.cell[L.cells[j][0]+','+L.cells[j][1]]=L; if(st.looks) continue;
          var c=K.img(ctx,texChevron(sc),L.cells[j][0]*TILE+TILE/2,L.cells[j][1]*TILE+TILE/2,2.6); c.setRotation(Math.atan2(L.dir[1],L.dir[0])); c.setAlpha(0.12); L.chev.push(c); }
        st.lanes.push(L); }
      st.wins=[];
      for(i=0;i<mech.length;i++){ if(mech[i].kind!=='gustWindow') continue;
        var w={a:mech[i],img:null,glow:ctx.own(sc.add.circle(mech[i].x*TILE+TILE/2,mech[i].y*TILE+TILE/2,30,0xcfeaff,0).setDepth(3.1))};
        for(j=0;j<st.lanes.length;j++) if(st.lanes[j].id===mech[i].lane){ w.lane=st.lanes[j]; st.lanes[j].win=w; }
        st.wins.push(w); }
      loadWindow(sc);
      try{ st.heroScale=sc.hero?sc.hero.scaleX:1; }catch(e){ st.heroScale=1; }
      if(pendingNote){ st.note=pendingNote; pendingNote=null; }
    },
    tick:function(ctx,dt){
      var sc=ctx.scene, st=ctx.state, i, j; if(!st.lanes) return;
      if(!K.onField(ctx)) return;
      if(st.note && !ctx.busy()){ var n=st.note; st.note=null; ctx.say(K.S(n)); return; }
      if(sc.showingMessage) return;                                      // the world waits while she reads
      dt=Math.min(dt,100); st.t+=dt; if(st.grace>0) st.grace-=dt;
      var t=st.t/TICK, g=st.fx, tg=st.tint, cam=sc.cameras.main, v=cam.worldView, vx0=v.x-60, vx1=v.x+v.width+60, vy0=v.y-60, vy1=v.y+v.height+60;
      g.clear(); tg.clear(); if(st.dust) st.dust.clear(); st.drawn=0;
      for(i=0;i<st.wins.length;i++){ var w=st.wins[i];                    // the window sprite arrives when its picture has loaded
        if(!w.img && sc.textures.exists('d2a_gust_window')){ w.img=K.img(ctx,'d2a_gust_window',w.a.x*TILE+TILE/2,w.a.y*TILE+TILE/2-6,3.2); } }
      for(i=0;i<st.lanes.length;i++){ var L=st.lanes[i], p=phaseOf(L,t), a=p.on?1:(p.warn?0.35+0.3*Math.sin(st.t/90):0);
        L.state=p.on?'gust':(p.warn?'warn':'lull');
        if(L.win) L.win.glow.setFillStyle(p.on?0xffffff:0xffe9a0, p.on?0.75:(p.warn?0.35+0.25*Math.sin(st.t/90):0));
        for(j=0;j<L.chev.length;j++) L.chev[j].setAlpha(p.on?0.95:(p.warn?0.3+0.25*Math.sin(st.t/90):0.12));
        if(st.looks){
          if(!(p.on||p.warn)){ if(L.band.visible) L.band.setVisible(false); continue; }   // a lull: nothing on the tiles
          var pulse=0.5+0.5*Math.sin(st.t/90), prog=p.on?1:Math.max(0,Math.min(1,1-p.toGust/Math.max(1,L.warn)));   // prog: 0 as the warning starts, 1 as the gust arrives
          L.band.tilePositionX-=(p.on?0.55:0.07+0.17*prog)*dt;
          L.band.setVisible(true).setTint(p.on?0xe6f2ff:0xffe2a0).setAlpha(p.on?0.9:0.16+0.52*pulse);
          var X0=Math.max(L.rect[0]*TILE,vx0), X1=Math.min((L.rect[2]+1)*TILE,vx1), Y0=Math.max(L.rect[1]*TILE,vy0), Y1=Math.min((L.rect[3]+1)*TILE,vy1);
          if(X1<=X0||Y1<=Y0||!sc.hero) continue;
          var HZ=L.dir[0]!==0, sg=(HZ?L.dir[0]:L.dir[1])>0?1:-1, GAP=130, across=(HZ?(L.rect[3]-L.rect[1]+1):(L.rect[2]-L.rect[0]+1))*TILE, lat0=(HZ?L.rect[1]:L.rect[0])*TILE;
          var Hx=sc.hero.x, Hy=sc.hero.y, mn=Math.min(v.width,v.height), r0=mn*0.30, r1=mn*0.50, Ha=HZ?Hx:Hy;
          L.off=(L.off+(p.on?0.9:0.10+0.26*prog)*dt)%GAP; L.dustOff=(L.dustOff+(p.on?1.15:0.16+0.3*prog)*dt)%(2*r1);
          var nrow=p.on?8:6, WL=p.on?104:54+20*prog, WW=p.on?4.2:3, WA=p.on?0.5:0.20+0.22*pulse, COL=p.on?0xe2f0fb:0xf3ead0, kk, ss, qq;
          for(kk=0;kk<nrow;kk++){ var la=lat0+((kk+0.5)/nrow)*across, shf=(kk*53)%GAP, swy=((kk%3)-1)*3;
            for(ss=Math.floor((Ha-r1-WL-GAP)/GAP)*GAP; ss<Ha+r1+GAP; ss+=GAP){
              qq=ss+(sg>0?L.off+shf:GAP-L.off+shf);
              var wx=HZ?qq:la, wy=HZ?la:qq;
              wispNear(g,wx+(HZ?0:2),wy+(HZ?2:0),L.dir[0],L.dir[1],WL,WW+1.6,WA*0.5,0x3c5f88,swy,Hx,Hy,r0,r1);   // the cool shade
              st.drawn+=wispNear(g,wx,wy,L.dir[0],L.dir[1],WL,WW,WA,COL,swy,Hx,Hy,r0,r1); } }
          var dg=st.dust, nd=p.on?12:5, m;                    // dust carried down-wind
          for(m=0;m<nd;m++){ var along=((m*71.3+L.dustOff)%(2*r1)); along=Ha+(sg>0?along-r1:r1-along);
            var lt=lat0+(((m*0.618)%1)*0.86+0.07)*across+Math.sin(st.t/170+m*1.9)*3, mx2=HZ?along:lt, my2=HZ?lt:along;
            var dd=Math.sqrt((mx2-Hx)*(mx2-Hx)+(my2-Hy)*(my2-Hy)), ff=dd<=r0?1:(dd>=r1?0:1-(dd-r0)/(r1-r0)); if(ff<=0.03) continue;
            dg.fillStyle(p.on?0xf1ead8:0xf6e6b8,(p.on?0.6:0.4)*ff); dg.fillCircle(mx2,my2,1.2+(m%3)*0.6); }
          continue;
        }
        if(!(p.on||p.warn)) continue;
        // the lane's walkway cells: warm while it warns, white while it blows
        if(st.old) tg.fillStyle(p.on?0xdff2ff:0xffd66b, p.on?0.34:0.16+0.1*Math.sin(st.t/90));
        else tg.fillStyle(p.on?0xc4dcef:0xffd66b, p.on?0.22:0.14+0.08*Math.sin(st.t/90));
        for(j=0;j<L.cells.length;j++) tg.fillRect(L.cells[j][0]*TILE,L.cells[j][1]*TILE,TILE,TILE);
        // streaks down the whole lane, only what the camera sees
        var x0=Math.max(L.rect[0]*TILE,vx0), x1=Math.min((L.rect[2]+1)*TILE,vx1), y0=Math.max(L.rect[1]*TILE,vy0), y1=Math.min((L.rect[3]+1)*TILE,vy1);
        if(x1<=x0||y1<=y0) continue;
        var hz=L.dir[0]!==0, sp=p.on?0.9:0.14, len=p.on?70:26, gap=150, off=(st.t*sp)%gap, rows=6, k, s, q;
        if(!st.old){                                                       // soft wisps, near her only
          var hx=sc.hero?sc.hero.x:v.x+v.width/2, hy=sc.hero?sc.hero.y:v.y+v.height/2, R0=Math.min(v.width,v.height)*0.30, R1=Math.min(v.width,v.height)*0.48;
          var wl=p.on?96:38, ww=p.on?3.4:2.2, wa=p.on?0.42:0.22*a, col=p.on?0xd6e8f5:0xe8eef4;
          for(k=0;k<rows;k++){ var lat2=(hz?L.rect[1]*TILE:L.rect[0]*TILE)+((k+0.5)/rows)*3*TILE, sh2=(k*53)%gap, sw=((k%3)-1)*3;
            for(s=Math.floor(((hz?x0:y0)-gap)/gap)*gap; s<(hz?x1:y1)+gap; s+=gap){
              q=s+((hz?L.dir[0]:L.dir[1])>0?off+sh2:gap-off+sh2);
              var sx=hz?q:lat2, sy=hz?lat2:q, mx=sx+L.dir[0]*wl/2, my=sy+L.dir[1]*wl/2, d=Math.sqrt((mx-hx)*(mx-hx)+(my-hy)*(my-hy));
              var f=d<=R0?1:(d>=R1?0:1-(d-R0)/(R1-R0)); if(f<=0.02) continue;
              wisp(g,sx,sy,L.dir[0],L.dir[1],wl,ww,wa*f,col,sw); } }
          continue;
        }
        g.lineStyle(p.on?3:2,0xffffff,p.on?0.6:0.28*a);
        for(k=0;k<rows;k++){ var lat=(hz?L.rect[1]*TILE:L.rect[0]*TILE)+((k+0.5)/rows)*3*TILE, sh=(k*53)%gap;
          if(hz){ if(lat<y0||lat>y1) continue; for(s=Math.floor((x0-gap)/gap)*gap; s<x1+gap; s+=gap){ q=s+(L.dir[0]>0?off+sh:gap-off+sh); g.beginPath(); g.moveTo(q,lat); g.lineTo(q+len*L.dir[0],lat+((k%2)?2:-2)); g.strokePath(); } }
          else { if(lat<x0||lat>x1) continue; for(s=Math.floor((y0-gap)/gap)*gap; s<y1+gap; s+=gap){ q=s+(L.dir[1]>0?off+sh:gap-off+sh); g.beginPath(); g.moveTo(lat,q); g.lineTo(lat+((k%2)?2:-2),q+len*L.dir[1]); g.strokePath(); } } }
      }
      var b=st.blown, h=ctx.hero(); if(!h) return;
      if(b){
        if(b.stage==='push'){
          var s2=K.soles(ctx), nx=s2.x+b.L.dir[0]*560*dt/1000, ny=s2.y+b.L.dir[1]*560*dt/1000, cx=(nx/TILE)|0, cy=(ny/TILE)|0;
          K.placeSoles(ctx,nx,ny,K.dirOf(-b.L.dir[0],-b.L.dir[1])); b.dist+=560*dt/1000;
          if(!open(ctx,cx,cy)) b.over+=560*dt/1000;
          if(b.over>TILE*0.7 || b.dist>TILE*8){ b.stage='fall'; b.t=0; b.at=[cx,cy];
            try{ sc.tweens.add({targets:sc.hero,scaleX:st.heroScale*0.25,scaleY:st.heroScale*0.25,alpha:0,angle:200,duration:520}); sc.cameras.main.fadeOut(520,0,0,0); }catch(e){} K.sfx('menu_cancel'); }
        } else if(b.stage==='fall'){ b.t+=dt;
          if(b.t>=560){ var Ld=nearestLanding(ctx,b.L.id,b.at[0],b.at[1]);
            if(!Ld){ Ld={landsOnFloor:ctx.floor,landsAt:b.from}; }
            if(Ld.landsOnFloor===ctx.floor) land(ctx,Ld);
            else { b.stage='gone'; try{ sc.tweens.killTweensOf(sc.hero); sc.cameras.main.fadeIn(1,0,0,0); }catch(e){}
              pendingNote='gust.blownDown';
              if(!ctx.toFloor(Ld.landsOnFloor,{x:Ld.landsAt[0],y:Ld.landsAt[1],dir:0})){ pendingNote=null; land(ctx,{landsAt:b.from}); } } } }
        return;
      }
      if(st.grace>0 || ctx.busy()) return;
      var so=K.soles(ctx), Lc=st.cell[so.tx+','+so.ty];
      if(Lc && Lc.state==='gust'){ st.blown={L:Lc,stage:'push',dist:0,over:0,from:[so.tx,so.ty]}; try{ sc.cameras.main.shake(120,0.006); }catch(e){} }
    },
    input:function(ctx){ if(ctx.state.blown) return null; },
    free:function(ctx){ if(ctx.state.blown) return true; },
    step:function(ctx){ if(ctx.state.blown) return false; },
    _debug:{ kidLane:kidLane, phaseOf:phaseOf, nearestLanding:nearestLanding }
  }); });
})();
