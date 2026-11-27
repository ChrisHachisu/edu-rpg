/* Shadow Cave: shadows that freeze in the crystal light (mechanic id `shadow-freeze`).

   The cave runs on one beat: DIM for params.dimTicks, then the crystals SHINE for
   params.shineTicks (185 ms a tick). While it is dim every shadow prowls its own fixed stretch
   (mechanic.shadows[].track, one cell every params.shadowStepDimTicks, to the end and back,
   from startIndex); while the crystals shine they all stand frozen where they are.
   Caught = a battle, and that shadow is gone afterwards (flag shadow<id>.gone):
     prowling: she is within params.catchRadiusWhileProwling cells of it (the 3x3 around it);
     frozen:   she walks into its own cell (radius 0).
   The crystals flicker for the last second of each phase, so the change can be read coming. */
(function boot(){
  'use strict';
  var K=window.__QOK_D2KIT_A__; if(!K){ setTimeout(boot,40); return; }
  var TILE=K.TILE, TICK=K.TICK;
  // Kid timing (owner P9; day-4 kid-timing track, 2026-11-27). The same helper as storm-terrace.js, gust-walkways.js and
  // crust-bridges.js (whichever loads first defines it; every copy is identical). Here: the crystals' flicker, which
  // tells her the light is about to change, lasts the age group's warning (K-2: 1.5 s, grades 3-4: 1.25 s, grades 5-6
  // and unknown: the plan's 1.0 s), and the shine lasts as much longer, so the steady light is as long as the plan's;
  // the dim stretch and the shadows' pace are the plan's. localStorage 'qok-kid-timing' = '0': the plan for every grade.
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
  var FLICK=1000;                                           // ms: the plan's flicker at the end of each phase
  // Day-4 look (census DA-03, DA-19). The reach of a prowling shadow (the 3x3 cells in which it
  // catches her) was a flat purple square with a ruled outline: it read as a debug zone. It is
  // the danger area a child needs, so it stays, drawn as part of the cave: a pool of deeper dark
  // with a smoky violet rim that breathes, round-cornered, soft-edged, never smaller than the
  // 3x3 (its rim runs just outside the square's corners and it only ever swells). When the
  // shadow steps, the pool reaches the new cells at once and draws its tail in after it.
  // The unlit crystals get a thin cold rim, drawn over the dim, so they can be found on the
  // darker floors without the cave being made brighter. localStorage 'qok-d4-looks'='0' = old look.
  var LOOKS=(function(){ try{ return window.localStorage.getItem('qok-d4-looks')!=='0'; }catch(e){ return true; } })();
  var AURA_TEX=128, AURA_R0=0.84, AURA_REACH=1.85;          // texture px; the rim's radius in texture half-widths; the rim's reach in cells (a 4th-power round square through the 3x3's corners)
  var AURA_PX=2*AURA_REACH*TILE/AURA_R0;                    // on-screen size of the texture at rest
  var RIM_OVER=45, RIM_UNDER=9.404;                         // the crystal rim's depth: over the dim (44); or just above the crystal standing behind her (K.ysort's 9.4), under her (10)
  function auraField(u,v){                                  // 0 at the shadow, 1 on the rim; the rim only ever bulges outward
    var a=Math.atan2(v,u), wob=1+0.028*(1+Math.sin(3*a+0.7))+0.018*(1+Math.sin(5*a+2.1))+0.010*(1+Math.sin(8*a+4.0));
    return Math.pow(u*u*u*u+v*v*v*v,0.25)/(AURA_R0*wob);
  }
  function sstep(a,b,x){ var t=(x-a)/(b-a); t=t<0?0:(t>1?1:t); return t*t*(3-2*t); }
  function texAura(sc,part){ return K.tex(sc,'d2a_shadow_'+part,AURA_TEX,AURA_TEX,function(g){
    var im=g.createImageData(AURA_TEX,AURA_TEX), px=im.data, x, y, o, d, al, h=AURA_TEX/2;
    for(y=0;y<AURA_TEX;y++) for(x=0;x<AURA_TEX;x++){ d=auraField((x+0.5-h)/h,(y+0.5-h)/h); o=(y*AURA_TEX+x)*4;
      if(part==='pool'){ al=0.50*(1-sstep(0.30,1.02,d)); px[o]=12; px[o+1]=4; px[o+2]=28; }
      else { var e=(d-0.93)/0.085; al=0.62*Math.exp(-e*e)+0.10*(1-sstep(0.15,0.95,d)); px[o]=158; px[o+1]=104; px[o+2]=255; }
      px[o+3]=Math.round(Math.max(0,Math.min(1,al))*255); }
    g.putImageData(im,0,0);
  }); }
  function texCrystalRim(sc){ return K.tex(sc,'d2a_crystal_rim',48,60,function(g){   // the three shards' upper edges, as texCrystal draws them
    function edge(x0,y0,x1,y1,wd){ g.beginPath(); g.moveTo(x0-wd-1,y0-1); g.lineTo(x1,y1-2); g.lineTo(x0+wd+1,y0-1); g.stroke(); }
    g.lineJoin='round'; g.lineCap='round';
    g.strokeStyle='rgba(150,200,255,0.30)'; g.lineWidth=3.2; edge(13,50,8,22,6); edge(35,50,41,18,6); edge(24,52,24,4,9);
    g.strokeStyle='rgba(214,236,255,0.95)'; g.lineWidth=1.2; edge(13,50,8,22,6); edge(35,50,41,18,6); edge(24,52,24,4,9);
    g.fillStyle='rgba(240,250,255,0.95)'; g.fillRect(23,4,2,2); g.fillRect(7,22,2,2); g.fillRect(40,18,2,2);   // a glint on each tip
  }); }
  function texShadow(sc,frozen){ return K.tex(sc,'d2a_shadow_'+(frozen?'f':'p'),48,60,function(g){
    var body=frozen?'#5d6f86':'#1a1024', rim=frozen?'#c9e4ff':'#6a35b8', mid=frozen?'#7f93ad':'#2c1a44';
    K.shadow(g,24,55,15,4,0.4);
    g.fillStyle=rim; g.beginPath(); g.moveTo(24,3); g.bezierCurveTo(43,6,45,28,40,44); g.lineTo(43,56); g.lineTo(34,49); g.lineTo(29,57); g.lineTo(24,49); g.lineTo(18,57); g.lineTo(14,49); g.lineTo(5,56); g.lineTo(8,44); g.bezierCurveTo(3,28,5,6,24,3); g.fill();
    g.fillStyle=body; g.beginPath(); g.moveTo(24,6); g.bezierCurveTo(40,9,42,28,37,43); g.lineTo(39,51); g.lineTo(33,46); g.lineTo(29,53); g.lineTo(24,46); g.lineTo(18,53); g.lineTo(15,46); g.lineTo(9,51); g.lineTo(11,43); g.bezierCurveTo(6,28,8,9,24,6); g.fill();
    g.fillStyle=mid; g.beginPath(); g.ellipse(20,22,8,12,-0.2,0,Math.PI*2); g.fill();
    g.fillStyle=frozen?'#e8f6ff':'#ff4a5c'; g.fillRect(15,20,6,4); g.fillRect(27,20,6,4);
    g.fillStyle=frozen?'#ffffff':'#ffd0d6'; g.fillRect(16,21,2,2); g.fillRect(28,21,2,2);
    if(frozen){ g.fillStyle='rgba(255,255,255,0.75)'; g.fillRect(12,12,2,6); g.fillRect(34,30,2,7); g.fillRect(22,38,5,2); g.fillRect(30,10,3,2); }
    else K.speck(g,10,10,28,36,['#3b2360','#120a1c'],34,3);
  }); }
  function texCrystal(sc,lit){ return K.tex(sc,'d2a_crystal_'+(lit?'l':'d'),48,60,function(g){
    K.shadow(g,24,54,16,4,0.4);
    var base=lit?'#bff3ff':'#3f5876', hi=lit?'#ffffff':'#7f9dbd', dk=lit?'#58bfe6':'#22324a', rim='#101824';
    function shard(x0,y0,x1,y1,wd){ g.fillStyle=rim; g.beginPath(); g.moveTo(x0-wd-1,y0); g.lineTo(x1,y1-2); g.lineTo(x0+wd+1,y0); g.closePath(); g.fill();
      g.fillStyle=base; g.beginPath(); g.moveTo(x0-wd,y0); g.lineTo(x1,y1); g.lineTo(x0+wd,y0); g.closePath(); g.fill();
      g.fillStyle=dk; g.beginPath(); g.moveTo(x0,y0); g.lineTo(x1,y1); g.lineTo(x0+wd,y0); g.closePath(); g.fill();
      g.fillStyle=hi; g.beginPath(); g.moveTo(x0-wd+1,y0-2); g.lineTo(x1-1,y1+3); g.lineTo(x0-wd+3,y0-2); g.closePath(); g.fill(); }
    shard(13,50,8,22,6); shard(35,50,41,18,6); shard(24,52,24,4,9);
    g.fillStyle='#2a2f3a'; g.fillRect(6,48,36,7); g.fillStyle='#454c5c'; g.fillRect(7,49,34,2);
  }); }
  function texGlow(sc){ return K.tex(sc,'d2a_glow',192,192,function(g){
    var gr=g.createRadialGradient(96,96,4,96,96,96); gr.addColorStop(0,'rgba(200,245,255,0.95)'); gr.addColorStop(0.35,'rgba(150,225,255,0.45)'); gr.addColorStop(1,'rgba(120,200,255,0)');
    g.fillStyle=gr; g.fillRect(0,0,192,192);
  }); }
  function pingpong(n,i){ if(n<=1) return 0; var p=2*(n-1), k=((i%p)+p)%p; return k<n?k:p-k; }
  function cycle(P,tk){                                     // tk in ticks -> {dim, pos (ticks into the phase), left, dimTicksSoFar}
    var per=P.dimTicks+P.shineTicks, c=Math.floor(tk/per), pos=tk-c*per, dim=pos<P.dimTicks;
    return { dim:dim, pos:dim?pos:pos-P.dimTicks, left:dim?P.dimTicks-pos:per-pos, dimTicks:c*P.dimTicks+(dim?pos:P.dimTicks) };
  }
  function cellOf(sh,P,dimTicks){ var i=pingpong(sh.track.length, sh.startIndex+Math.floor((dimTicks+0.15)/(P.shadowStepDimTicks||4))); return sh.track[i]; }   // +0.15: the last step of a dim phase lands just before the light, not on it
  function caught(ctx,sh,dim,tx,ty){
    var P=ctx.mechanic.params||{}, r=dim?(P.catchRadiusWhileProwling===undefined?1:P.catchRadiusWhileProwling):(P.catchRadiusWhileFrozen||0);
    return Math.max(Math.abs(tx-sh.cx),Math.abs(ty-sh.cy))<=r;
  }
  K.ready(function(K,D){ D.register('shadow-freeze',{
    load:function(ctx){
      var sc=ctx.scene, st=ctx.state, mech=ctx.plan.mech||[], sh=(ctx.mechanic.shadows)||[], P=ctx.mechanic.params||{}, i, cam=sc.cameras.main;
      st.P={dimTicks:P.dimTicks||24, shineTicks:P.shineTicks||24, shadowStepDimTicks:P.shadowStepDimTicks||4};
      st.plan={shineTicks:st.P.shineTicks, flickMs:FLICK}; st.fm=FLICK; st.kid=false;   // kid timing: the flicker grows by whole ticks and the shine by the same ticks
      if(KT.young()){ var kadd=Math.round((Math.max(FLICK,KT.cfg().warnMs)-FLICK)/TICK); if(kadd>0){ st.fm=FLICK+kadd*TICK; st.P.shineTicks+=kadd; st.kid=true; } }
      st.t=st.P.dimTicks*TICK-1500;                          // she arrives late in a dim phase: a first look at the prowl, then the light
      st.shadows=[]; st.crystals=[]; st.solid=[]; st.sort=[]; st.pending=null;
      st.dark=ctx.own(sc.add.rectangle(cam.width/2,cam.height/2,cam.width*3,cam.height*3,0x050214,1).setScrollFactor(0).setDepth(44).setAlpha(0));
      st.ring=ctx.own(sc.add.graphics().setDepth(2.5));
      for(i=0;i<mech.length;i++){ if(mech[i].kind!=='crystalLight') continue; var a=mech[i];
        var o=K.img(ctx,texCrystal(sc,false),a.x*TILE+TILE/2,a.y*TILE+TILE/2-8,9.4); o.__by=a.y*TILE+TILE-6;
        var gl=K.img(ctx,texGlow(sc),a.x*TILE+TILE/2,a.y*TILE+TILE/2-10,46); try{ gl.setBlendMode('ADD'); }catch(e){} gl.setAlpha(0).setScale(1.5);
        var rm=null; if(LOOKS){ rm=K.img(ctx,texCrystalRim(sc),o.x,o.y,RIM_OVER); rm.setAlpha(0); }
        st.crystals.push({img:o,glow:gl,rim:rm}); st.sort.push(o);
        if(ctx.terrain(a.x,a.y)!=='#') st.solid.push({x:a.x,y:a.y}); }
      for(i=0;i<sh.length;i++){ if(K.get(ctx,'shadow'+sh[i].id+'.gone')) continue;
        var c=sh[i].track[pingpong(sh[i].track.length,sh[i].startIndex||0)];
        var im=K.img(ctx,texShadow(sc,false),c[0]*TILE+TILE/2,c[1]*TILE+TILE/2-10,9.4);
        var ey=K.img(ctx,texGlow(sc),c[0]*TILE+TILE/2,c[1]*TILE+TILE/2-14,45.5); try{ ey.setBlendMode('ADD'); }catch(e){} ey.setTint(0xff3355).setScale(0.32).setAlpha(0);
        var pool=null, arim=null;
        if(LOOKS){ pool=K.img(ctx,texAura(sc,'pool'),im.x,im.y+10,2.5); pool.setAlpha(0); arim=K.img(ctx,texAura(sc,'rim'),im.x,im.y+10,2.55); arim.setAlpha(0); try{ arim.setBlendMode('ADD'); }catch(e){} }
        st.shadows.push({id:sh[i].id,track:sh[i].track,startIndex:sh[i].startIndex||0,cx:c[0],cy:c[1],img:im,eye:ey,x:im.x,y:im.y,pool:pool,arim:arim,aa:0}); st.sort.push(im); }
      st.looks=LOOKS;
    },
    tick:function(ctx,dt){
      var sc=ctx.scene, st=ctx.state, i; if(!st.P||!K.onField(ctx)) return;
      if(st.pending){ st.pending.t-=dt; if(st.pending.t<=0 && !sc.isMoving && !sc.showingMessage){ /* the line is read, then the battle */ var id=st.pending.id; st.pending=null;
          if(!ctx.battle('shadow',function(){ st.grace=900; })) st.grace=600; } return; }
      if(sc.showingMessage) return;                         // the cave waits while she reads
      dt=Math.min(dt,100); st.t+=dt; if(st.grace>0) st.grace-=dt;
      var c=cycle(st.P,st.t/TICK), flick=(c.left*TICK<st.fm) ? (0.5+0.5*Math.sin(st.t/55)) : 1;
      st.dim=c.dim;
      var lit=c.dim?(c.left*TICK<st.fm?0.25*flick:0):(0.55+0.45*flick);
      st.dark.setAlpha(c.dim?0.5-0.18*(c.left*TICK<st.fm?flick:0):0.12+0.2*(1-flick));
      for(i=0;i<st.crystals.length;i++){ var cr=st.crystals[i]; cr.glow.setAlpha(lit); cr.img.setTexture(texCrystal(sc,lit>0.4));
        if(cr.rim){ var ra=lit>0.4?0:(0.46+0.10*Math.sin(st.t/700+i*1.7)), rd=RIM_OVER;
          // The rim is drawn over the dim (depth 45), her sprite at 10: with her soles south of the crystal's base she is
          // in FRONT of it, and the rim's lines would cross her head. While her picture's box meets the rim's, the rim
          // takes the crystal's own place in the sorting (just above it, under her) and is made stronger by what the
          // dim layer above it takes away, so it looks the same and she covers it.
          var hs=sc.hero, hf=ra>0?ctx.hero():null;
          if(hf && hs && hf.footY>=cr.img.__by){ var hl=hs.x-(hs.displayWidth||48)*hs.originX, ht=hs.y-(hs.displayHeight||60)*hs.originY;
            if(hl<cr.rim.x+26 && hl+(hs.displayWidth||48)>cr.rim.x-26 && ht<cr.rim.y+32 && ht+(hs.displayHeight||60)>cr.rim.y-32){ rd=RIM_UNDER; ra=Math.min(1,ra/Math.max(0.3,1-st.dark.alpha)); } }
          cr.rim.setAlpha(ra); if(cr.rim.depth!==rd) cr.rim.setDepth(rd); } }
      var h=ctx.hero(), so=K.soles(ctx), g=st.ring; g.clear();
      for(i=0;i<st.shadows.length;i++){ var s=st.shadows[i], cell=cellOf(s,st.P,c.dimTicks);
        s.cx=cell[0]; s.cy=cell[1];
        var tx=cell[0]*TILE+TILE/2, ty=cell[1]*TILE+TILE/2-10, k=Math.min(1,dt/140);
        s.x+=(tx-s.x)*k; s.y+=(ty-s.y)*k;                    // glide to the cell it stands on
        var bob=c.dim?Math.sin(st.t/160+i)*3:0;
        s.img.setPosition(s.x,s.y+bob); s.img.setTexture(texShadow(sc,!c.dim)); s.img.__by=cell[1]*TILE+TILE-4;
        s.eye.setPosition(s.x,s.y-6+bob).setAlpha(c.dim?0.8:0);
        if(s.pool){                                           // the reach, as a breathing pool of dark: over the cell it holds AND the spot it is gliding from
          var zx=cell[0]*TILE+TILE/2, zy=cell[1]*TILE+TILE/2, gx=s.x, gy=s.y+10, br=1.045+0.03*Math.sin(st.t/520+i*2.1);
          var aw=AURA_PX*br+Math.abs(zx-gx)/AURA_R0, ah=AURA_PX*br+Math.abs(zy-gy)/AURA_R0;
          s.aa=c.dim?1:Math.max(0,s.aa-dt/150);                // there the moment it prowls; fades as the light takes it
          s.pool.setPosition((zx+gx)/2,(zy+gy)/2).setDisplaySize(aw,ah).setAlpha(s.aa);
          s.arim.setPosition((zx+gx)/2,(zy+gy)/2).setDisplaySize(aw,ah).setAlpha(s.aa*(0.80+0.20*Math.sin(st.t/260+i)));
        }
        else if(c.dim){ g.fillStyle(0x7a2cff,0.13+0.05*Math.sin(st.t/200)); g.fillRect((cell[0]-1)*TILE,(cell[1]-1)*TILE,TILE*3,TILE*3);
                   g.lineStyle(2,0xb47cff,0.35); g.strokeRect((cell[0]-1)*TILE+1,(cell[1]-1)*TILE+1,TILE*3-2,TILE*3-2); }
        if(so && !(st.grace>0) && !ctx.busy() && caught(ctx,s,c.dim,so.tx,so.ty)){
          K.set(ctx,'shadow'+s.id+'.gone',true); st.battles=(st.battles||0)+1;
          try{ s.img.destroy(); s.eye.destroy(); if(s.pool) s.pool.destroy(); if(s.arim) s.arim.destroy(); }catch(e){} st.shadows.splice(i,1); i--;
          st.pending={id:s.id,t:650}; ctx.say(K.S('shadow.caught')); try{ sc.cameras.main.shake(160,0.008); }catch(e){}
          g.clear(); return; } }
      if(h) K.ysort(st.sort,h.footY);
    },
    input:function(ctx){ if(ctx.state.pending) return null; },
    free:function(ctx,px,py){ var s=ctx.state.solid||[]; for(var i=0;i<s.length;i++) if(K.inCell(px,py,s[i].x,s[i].y,3)) return false; },
    step:function(ctx){ if(ctx.state.pending) return false; },
    _debug:{ cycle:cycle, cellOf:cellOf, pingpong:pingpong }
  }); });
})();
