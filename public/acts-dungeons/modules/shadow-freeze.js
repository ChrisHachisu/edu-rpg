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
      st.t=st.P.dimTicks*TICK-1500;                          // she arrives late in a dim phase: a first look at the prowl, then the light
      st.shadows=[]; st.crystals=[]; st.solid=[]; st.sort=[]; st.pending=null;
      st.dark=ctx.own(sc.add.rectangle(cam.width/2,cam.height/2,cam.width*3,cam.height*3,0x050214,1).setScrollFactor(0).setDepth(44).setAlpha(0));
      st.ring=ctx.own(sc.add.graphics().setDepth(2.5));
      for(i=0;i<mech.length;i++){ if(mech[i].kind!=='crystalLight') continue; var a=mech[i];
        var o=K.img(ctx,texCrystal(sc,false),a.x*TILE+TILE/2,a.y*TILE+TILE/2-8,9.4); o.__by=a.y*TILE+TILE-6;
        var gl=K.img(ctx,texGlow(sc),a.x*TILE+TILE/2,a.y*TILE+TILE/2-10,46); try{ gl.setBlendMode('ADD'); }catch(e){} gl.setAlpha(0).setScale(1.5);
        st.crystals.push({img:o,glow:gl}); st.sort.push(o);
        if(ctx.terrain(a.x,a.y)!=='#') st.solid.push({x:a.x,y:a.y}); }
      for(i=0;i<sh.length;i++){ if(K.get(ctx,'shadow'+sh[i].id+'.gone')) continue;
        var c=sh[i].track[pingpong(sh[i].track.length,sh[i].startIndex||0)];
        var im=K.img(ctx,texShadow(sc,false),c[0]*TILE+TILE/2,c[1]*TILE+TILE/2-10,9.4);
        var ey=K.img(ctx,texGlow(sc),c[0]*TILE+TILE/2,c[1]*TILE+TILE/2-14,45.5); try{ ey.setBlendMode('ADD'); }catch(e){} ey.setTint(0xff3355).setScale(0.32).setAlpha(0);
        st.shadows.push({id:sh[i].id,track:sh[i].track,startIndex:sh[i].startIndex||0,cx:c[0],cy:c[1],img:im,eye:ey,x:im.x,y:im.y}); st.sort.push(im); }
    },
    tick:function(ctx,dt){
      var sc=ctx.scene, st=ctx.state, i; if(!st.P||!K.onField(ctx)) return;
      if(st.pending){ st.pending.t-=dt; if(st.pending.t<=0 && !sc.isMoving){ var id=st.pending.id; st.pending=null;
          if(!ctx.battle('shadow',function(){ st.grace=900; })) st.grace=600; } return; }
      if(sc.showingMessage) return;                         // the cave waits while she reads
      dt=Math.min(dt,100); st.t+=dt; if(st.grace>0) st.grace-=dt;
      var c=cycle(st.P,st.t/TICK), flick=(c.left*TICK<1000) ? (0.5+0.5*Math.sin(st.t/55)) : 1;
      st.dim=c.dim;
      var lit=c.dim?(c.left*TICK<1000?0.25*flick:0):(0.55+0.45*flick);
      st.dark.setAlpha(c.dim?0.5-0.18*(c.left*TICK<1000?flick:0):0.12+0.2*(1-flick));
      for(i=0;i<st.crystals.length;i++){ var cr=st.crystals[i]; cr.glow.setAlpha(lit); cr.img.setTexture(texCrystal(sc,lit>0.4)); }
      var h=ctx.hero(), so=K.soles(ctx), g=st.ring; g.clear();
      for(i=0;i<st.shadows.length;i++){ var s=st.shadows[i], cell=cellOf(s,st.P,c.dimTicks);
        s.cx=cell[0]; s.cy=cell[1];
        var tx=cell[0]*TILE+TILE/2, ty=cell[1]*TILE+TILE/2-10, k=Math.min(1,dt/140);
        s.x+=(tx-s.x)*k; s.y+=(ty-s.y)*k;                    // glide to the cell it stands on
        var bob=c.dim?Math.sin(st.t/160+i)*3:0;
        s.img.setPosition(s.x,s.y+bob); s.img.setTexture(texShadow(sc,!c.dim)); s.img.__by=cell[1]*TILE+TILE-4;
        s.eye.setPosition(s.x,s.y-6+bob).setAlpha(c.dim?0.8:0);
        if(c.dim){ g.fillStyle(0x7a2cff,0.13+0.05*Math.sin(st.t/200)); g.fillRect((cell[0]-1)*TILE,(cell[1]-1)*TILE,TILE*3,TILE*3);
                   g.lineStyle(2,0xb47cff,0.35); g.strokeRect((cell[0]-1)*TILE+1,(cell[1]-1)*TILE+1,TILE*3-2,TILE*3-2); }
        if(so && !(st.grace>0) && !ctx.busy() && caught(ctx,s,c.dim,so.tx,so.ty)){
          K.set(ctx,'shadow'+s.id+'.gone',true); st.battles=(st.battles||0)+1;
          try{ s.img.destroy(); s.eye.destroy(); }catch(e){} st.shadows.splice(i,1); i--;
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
