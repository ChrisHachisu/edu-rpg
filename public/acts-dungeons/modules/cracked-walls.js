/* Scorched Ruins: cracked walls (mechanic id `cracked-walls`).

   mechanic.secrets[]: `crack` = three cells of a one-cell-thick painted wall, `front` = the floor
   cell before its middle. The wall there shows a faint crack with embers glowing in it, and one
   small hint lies on the floor in front (mech asset kind `hint`: a scratched note, embers, a
   soot trail, a draught in the ash, loose stones). She opens it by WALKING INTO IT: leaning on
   the cracked stretch for LEAN_MS crumbles it (the engine tells `bump` of every refused step,
   painted wall included). It stays open (flag secret<id>.open): her soles may then cross the
   three cells, and a breach is drawn over the painted wall from the floor picture itself.
   A secret with needs:"boss defeated" only gives once the dungeon's boss is down. */
(function boot(){
  'use strict';
  var K=window.__QOK_D2KIT_A__; if(!K){ setTimeout(boot,40); return; }
  var TILE=K.TILE, LEAN_MS=260, FACE=30, END=7, THROUGH=18;
  var HINT_KEY={ 'sign':'ruins.hintSign', 'ember glow':'ruins.hint.ember', 'soot trail':'ruins.hint.soot', 'draught in the ash':'ruins.hint.draught', 'loose stones':'ruins.hint.stones' };
  function rnd(seed){ var s=seed||1; return function(){ s=(s*1103515245+12345)&0x7fffffff; return s/0x7fffffff; }; }
  function geom(S){
    var c=S.crack, x0=1e9,y0=1e9,x1=-1,y1=-1, i;
    for(i=0;i<c.length;i++){ x0=Math.min(x0,c[i][0]); y0=Math.min(y0,c[i][1]); x1=Math.max(x1,c[i][0]); y1=Math.max(y1,c[i][1]); }
    var mx=(x0+x1)/2, my=(y0+y1)/2, dx=mx-S.front[0], dy=my-S.front[1];
    var dir=Math.abs(dx)>=Math.abs(dy)?[dx>0?1:-1,0]:[0,dy>0?1:-1];
    return {id:S.id, needs:S.needs||null, dir:dir, x0:x0*TILE, y0:y0*TILE, x1:(x1+1)*TILE, y1:(y1+1)*TILE};
  }
  // her soles against the cracked stretch, on the front side: {ok, along} (px to the wall face)
  function facing(G,px,py){
    var d=G.dir, face, across;
    if(d[0]){ face=d[0]>0?G.x0-px:px-G.x1; across=py>=G.y0+END && py<G.y1-END; }
    else    { face=d[1]>0?G.y0-py:py-G.y1; across=px>=G.x0+END && px<G.x1-END; }
    return across && face>=-2 && face<=FACE;
  }
  function inBreach(G,px,py){                                // where her soles may be once it is open
    var d=G.dir;
    return d[0] ? (px>=G.x0-THROUGH && px<G.x1+THROUGH && py>=G.y0+END && py<G.y1-END)
                : (py>=G.y0-THROUGH && py<G.y1+THROUGH && px>=G.x0+END && px<G.x1-END);
  }
  function texCrack(sc,G){ var w=G.x1-G.x0, h=G.y1-G.y0, horiz=!!G.dir[0];
    return K.tex(sc,'d2a_crack2_'+(horiz?'h':'v')+'_'+w+'x'+h,w,h,function(g){
      var r=rnd(horiz?41:97), L=horiz?h:w, T=horiz?w:h, i, j;
      function P(a,t){ return horiz?[t,a]:[a,t]; }             // a = along the wall, t = through it
      g.lineCap='round'; g.lineJoin='round';
      for(j=0;j<3;j++){ var a=L*(0.2+0.3*j)+ (r()-0.5)*10, pts=[P(a,2)];
        for(i=1;i<=5;i++){ a+=(r()-0.5)*16; pts.push(P(a,2+(T-4)*i/5)); }
        g.strokeStyle='rgba(255,130,40,0.34)'; g.lineWidth=6; g.beginPath(); g.moveTo(pts[0][0],pts[0][1]); for(i=1;i<pts.length;i++) g.lineTo(pts[i][0],pts[i][1]); g.stroke();
        g.strokeStyle='rgba(8,5,4,0.92)'; g.lineWidth=j===1?3:2.2; g.beginPath(); g.moveTo(pts[0][0],pts[0][1]); for(i=1;i<pts.length;i++) g.lineTo(pts[i][0],pts[i][1]); g.stroke();
        // a pale chipped edge beside the dark line: on the painted burnt rubble a dark crack alone did not read
        g.strokeStyle='rgba(236,214,190,0.6)'; g.lineWidth=1; g.beginPath(); g.moveTo(pts[0][0]+1.6,pts[0][1]+1.2); for(i=1;i<pts.length;i++) g.lineTo(pts[i][0]+1.6,pts[i][1]+1.2); g.stroke();
        g.strokeStyle='rgba(8,5,4,0.92)';
        var b=pts[2+j%2], e=P((horiz?b[1]:b[0])+(r()>0.5?13:-13),(horiz?b[0]:b[1])+7);
        g.lineWidth=1.2; g.beginPath(); g.moveTo(b[0],b[1]); g.lineTo(e[0],e[1]); g.stroke(); }
    }); }
  function texBreach(ctx,G){ var sc=ctx.scene, w=G.x1-G.x0, h=G.y1-G.y0, im=ctx.art(), horiz=!!G.dir[0];
    return K.tex(sc,'d2a_breach_'+ctx.key+'_'+G.id+(im?'':'_p'),w,h,function(g){
      var r=rnd(13+G.id*7), i, ok=false;
      if(im){ try{ var s=(im.naturalWidth||im.width)/(ctx.plan.width*TILE), sx=G.x0-G.dir[0]*2*TILE, sy=G.y0-G.dir[1]*2*TILE;   // the floor two cells before the wall
          g.imageSmoothingEnabled=true; g.drawImage(im,sx*s,sy*s,w*s,h*s,0,0,w,h); ok=true; }catch(e){} }
      if(!ok){ g.fillStyle='#3d332c'; g.fillRect(0,0,w,h); K.speck(g,0,0,w,h,['#4a3f36','#2f2721','#55483c'],260,5); }
      g.fillStyle='rgba(10,6,4,0.30)'; g.fillRect(0,0,w,h);                 // the passage lies in the wall's shade
      var L=horiz?h:w, T=horiz?w:h;
      function R(a,t,la,lt){ if(horiz) g.fillRect(t,a,lt,la); else g.fillRect(a,t,la,lt); }
      for(i=0;i<12;i++){ g.fillStyle='rgba(8,5,3,'+(0.55*(1-i/12)).toFixed(3)+')'; R(i,0,1,T); R(L-1-i,0,1,T); }   // the broken ends of the wall
      for(i=0;i<26;i++){ var end=i%2, a=end?L-4-r()*13:r()*13, t=r()*(T-8), sz=4+r()*6;
        g.fillStyle='#17110d'; R(a-1,t-1,sz+2,sz+1); g.fillStyle=['#6b5a4c','#57493d','#7d6a59'][i%3]; R(a,t,sz,sz-1); g.fillStyle='rgba(255,255,255,0.14)'; R(a,t,sz,1); }
      for(i=0;i<9;i++){ var a2=16+r()*(L-32), t2=r()*(T-5), s2=2+r()*3; g.fillStyle='#17110d'; R(a2,t2,s2+1,s2+1); g.fillStyle='#5f5145'; R(a2,t2,s2,s2); }
    }); }
  function texHint(sc,type){ return K.tex(sc,'d2a_hint_'+type.replace(/\W+/g,'_'),48,48,function(g){
    var r=rnd(type.length*31), i;
    if(type==='sign'){ g.save(); g.translate(24,26); g.rotate(-0.18); K.shadow(g,1,9,15,5,0.3);
      K.box(g,-13,-9,26,18,'#d8c79c','#3a2c18','#efe2bd'); g.fillStyle='#5a4326'; for(i=0;i<3;i++) g.fillRect(-9,-5+i*5,18-i*4,1.5); g.restore(); }
    else if(type==='ember glow'){ for(i=0;i<9;i++){ var x=6+r()*36, y=14+r()*22, s=1.5+r()*2.5;
        g.fillStyle='rgba(255,110,20,0.30)'; g.beginPath(); g.arc(x,y,s+3,0,Math.PI*2); g.fill();
        g.fillStyle='#2a1a12'; g.fillRect(x-s,y-s+1,s*2,s*2-1); g.fillStyle=i%3?'#ff8a2a':'#ffd070'; g.fillRect(x-s+1,y-s+1,s*2-2,s); } }
    else if(type==='soot trail'){ for(i=0;i<60;i++){ var t=r(), y2=24+(r()-0.5)*(16-10*t); g.fillStyle='rgba(12,9,8,'+(0.20+0.35*r()).toFixed(2)+')'; g.fillRect(2+t*44,y2,3+r()*5,2+r()*2); }
      g.fillStyle='rgba(12,9,8,0.55)'; g.beginPath(); g.moveTo(46,24); g.lineTo(36,18); g.lineTo(36,30); g.closePath(); g.fill(); }
    else if(type==='draught in the ash'){ g.strokeStyle='rgba(226,220,210,0.55)'; g.lineWidth=1.6; g.lineCap='round';
      for(i=0;i<4;i++){ var y3=13+i*7; g.beginPath(); g.moveTo(4+i*3,y3); g.bezierCurveTo(16,y3-6,26,y3+6,44-i*2,y3-1); g.stroke(); }
      K.speck(g,4,10,40,28,['rgba(230,225,215,0.5)','rgba(160,152,144,0.5)'],46,9); }
    else { for(i=0;i<8;i++){ var x4=8+r()*30, y4=16+r()*20, s4=3+r()*6; K.shadow(g,x4+s4/2,y4+s4,s4*0.7,1.8,0.3);
        g.fillStyle='#1a1410'; g.fillRect(x4-1,y4-1,s4+2,s4+1); g.fillStyle=['#7a6857','#655647','#8c7966'][i%3]; g.fillRect(x4,y4,s4,s4-1); g.fillStyle='rgba(255,255,255,0.18)'; g.fillRect(x4,y4,s4,1); } }
  }); }
  // ---- the look (day 4, DB-15): the draught in the ash --------------------------------------------
  // The draught was a still picture whose alpha breathed: a few hundred px changed in four seconds. Now ash moves:
  // every 2.6 s a breath comes out of the crack (the game's own line: "A draught blows from the wall") and carries
  // a handful of pale puffs and motes along the floor, from the foot of the cracked stretch out past the ash
  // patch, about a cell and a half; a mote now and then in between. It is ash on the floor, not a marker: no
  // arrow, no glow, and it stops for good once the wall is open. localStorage 'qok-d4-looks' = '0': the old picture only.
  var LOOKS=(function(){ try{ return window.localStorage.getItem('qok-d4-looks')!=='0'; }catch(e){ return true; } })();
  var GUST_MS=2600, GUST_ON=760;
  function texAsh(sc){ return K.tex(sc,'d2a_ashpuff',24,24,function(g){
    var f=g.createRadialGradient(12,12,0.5,12,12,12); f.addColorStop(0,'rgba(255,255,255,0.95)'); f.addColorStop(0.45,'rgba(255,255,255,0.42)'); f.addColorStop(1,'rgba(255,255,255,0)');
    g.fillStyle=f; g.fillRect(0,0,24,24); }); }
  function draughtMake(ctx,h){
    var sc=ctx.scene, G=h.S, d=G.dir, i, key=texAsh(sc);
    // the foot of the cracked stretch on her side, and the way the breath goes: out from the wall, bent toward the ash patch
    var fx=d[0]?(d[0]>0?G.x0:G.x1):(G.x0+G.x1)/2, fy=d[1]?(d[1]>0?G.y0:G.y1):(G.y0+G.y1)/2;
    var tx=h.x*TILE+TILE/2-fx, ty=h.y*TILE+TILE/2-fy, tl=Math.sqrt(tx*tx+ty*ty)||1, ux=-d[0]*0.55+tx/tl*0.45, uy=-d[1]*0.55+ty/tl*0.45, ul=Math.sqrt(ux*ux+uy*uy)||1;
    h.dr={fx:fx, fy:fy, ux:ux/ul, uy:uy/ul, along:d[0]?[0,1]:[1,0], span:(d[0]?G.y1-G.y0:G.x1-G.x0)*0.36, next:0, motes:[]};
    for(i=0;i<16;i++){ var o=K.img(ctx,key,fx,fy,2.26).setVisible(false); h.dr.motes.push({img:o, t0:-1e9, life:1}); }
  }
  function draughtTick(st,h){
    var D=h.dr, t=st.t, i, ph=t%GUST_MS, gust=ph<GUST_ON;
    if(h.S.open){ if(!D.off){ D.off=true; for(i=0;i<D.motes.length;i++) D.motes[i].img.setVisible(false); } return; }
    if(t>=D.next){ D.next=t+(gust?62:520);                                     // a breath, then a mote now and then
      for(i=0;i<D.motes.length;i++){ var m=D.motes[i]; if(t-m.t0<m.life) continue;
        var puff=gust&&Math.random()<0.45, a=(Math.random()-0.5)*2*D.span, sp=(gust?58:34)+Math.random()*26;
        m.t0=t; m.life=(puff?1500:1150)+Math.random()*500; m.x=D.fx+D.along[0]*a-D.ux*2; m.y=D.fy+D.along[1]*a-D.uy*2;
        m.vx=D.ux*sp; m.vy=D.uy*sp; m.ph=Math.random()*6.28; m.size=puff?0.55+Math.random()*0.3:0.16+Math.random()*0.12; m.peak=puff?0.34:0.8; m.wob=puff?3:6;
        m.img.setTint(puff?0xd9d2c8:0xf2ece2).setVisible(true); break; } }
    for(i=0;i<D.motes.length;i++){ var q=D.motes[i], age=t-q.t0; if(age>=q.life){ if(q.img.visible) q.img.setVisible(false); continue; }
      var k=age/q.life, s=age/1000, w=Math.sin(age/240+q.ph)*q.wob*k;
      q.img.setPosition(q.x+q.vx*s*(1-0.32*k)-D.uy*w, q.y+q.vy*s*(1-0.32*k)+D.ux*w).setScale(q.size*(0.7+1.0*k)).setAlpha(q.peak*Math.pow(Math.sin(Math.PI*Math.min(1,k*1.15)),0.7)); }
  }
  K.ready(function(K,D){ D.register('cracked-walls',{
    load:function(ctx){
      var sc=ctx.scene, st=ctx.state, ss=(ctx.mechanic&&ctx.mechanic.secrets)||[], mech=ctx.plan.mech||[], i, j;
      st.secrets=[]; st.hints=[]; st.t=0; st.told=false;
      st.gfx=ctx.own(sc.add.graphics().setDepth(2.3));
      for(i=0;i<ss.length;i++){ var G=geom(ss[i]); G.open=K.get(ctx,'secret'+G.id+'.open'); G.acc=0; G.last=-1e9; G.em=[];
        var r=rnd(5+G.id*11); for(j=0;j<7;j++) G.em.push([G.x0+4+r()*(G.x1-G.x0-8), G.y0+4+r()*(G.y1-G.y0-8), r()*6.28, 1.2+r()*1.6]);
        if(!G.open) G.crack=K.img(ctx,texCrack(sc,G),(G.x0+G.x1)/2,(G.y0+G.y1)/2,2.2);
        st.secrets.push(G); }
      for(i=0;i<mech.length;i++){ if(mech[i].kind!=='hint') continue; var a=mech[i], S=null;
        for(j=0;j<st.secrets.length;j++) if(st.secrets[j].id===a.secret) S=st.secrets[j];
        var o=K.img(ctx,texHint(sc,a.type),a.x*TILE+TILE/2,a.y*TILE+TILE/2,2.2);
        if(S && a.type!=='sign' && a.type!=='ember glow' && a.type!=='loose stones') o.setRotation(Math.atan2((S.y0+S.y1)/2-o.y,(S.x0+S.x1)/2-o.x));   // trails and draughts point at the crack
        var hh={x:a.x,y:a.y,type:a.type,img:o,S:S}; st.hints.push(hh);
        if(LOOKS && S && a.type==='draught in the ash'){ try{ draughtMake(ctx,hh); }catch(e){} } }
    },
    _breach:function(ctx,G,quiet){
      var sc=ctx.scene;
      if(G.crack){ try{ G.crack.destroy(); }catch(e){} G.crack=null; }
      if(G.hole && G.holeArt===!!ctx.art()) return;
      if(G.hole){ try{ G.hole.destroy(); }catch(e){} }
      G.holeArt=!!ctx.art(); G.hole=K.img(ctx,texBreach(ctx,G),(G.x0+G.x1)/2,(G.y0+G.y1)/2,2.15);
      if(!quiet){ G.hole.setAlpha(0); try{ sc.tweens.add({targets:G.hole,alpha:1,duration:320}); }catch(e){ G.hole.setAlpha(1); }
        for(var i=0;i<10;i++){ (function(i){ try{ var x=G.x0+Math.random()*(G.x1-G.x0), y=G.y0+Math.random()*(G.y1-G.y0);
            var p=ctx.own(sc.add.rectangle(x,y,5+Math.random()*5,4+Math.random()*4,i%2?0x6b5a4c:0x9a8774).setDepth(11));
            sc.tweens.add({targets:p,x:x-G.dir[0]*(20+Math.random()*40)+(Math.random()-0.5)*30,y:y-G.dir[1]*(20+Math.random()*40)+(Math.random()-0.5)*30-10,alpha:0,angle:180,duration:520+Math.random()*300,onComplete:function(){ try{ p.destroy(); }catch(e){} }}); }catch(e){} })(i); } }
    },
    tick:function(ctx,dt){
      var st=ctx.state, i, j; if(!st.secrets) return;
      st.t+=Math.min(dt,100);
      var g=st.gfx; g.clear();
      for(i=0;i<st.secrets.length;i++){ var G=st.secrets[i];
        if(G.open){ if(!G.hole || G.holeArt!==!!ctx.art()) this._breach(ctx,G,true); continue; }   // (re)drawn once the floor picture is in
        var live=!(G.needs==='boss defeated' && !ctx.bossDown()), lean=Math.min(1,G.acc/LEAN_MS);
        for(j=0;j<G.em.length;j++){ var e=G.em[j], a=live?(0.35+0.3*Math.sin(st.t/230+e[2])+0.35*lean):0.10;
          if(a<=0.02) continue; g.fillStyle(0xff7a1a,Math.min(1,a)*0.35); g.fillCircle(e[0],e[1],e[3]+2.5); g.fillStyle(0xffc060,Math.min(1,a)); g.fillCircle(e[0],e[1],e[3]*0.7); }
        if(G.crack){ G.crack.setAlpha(live?0.85:0.6); G.crack.setPosition((G.x0+G.x1)/2+(lean>0?Math.sin(st.t/18)*1.5*lean:0),(G.y0+G.y1)/2); }
        if(st.t-G.last>160) G.acc=Math.max(0,G.acc-dt*2); }
      for(i=0;i<st.hints.length;i++){ var h=st.hints[i]; if(h.type==='ember glow') h.img.setAlpha(0.75+0.25*Math.sin(st.t/210+i)); else if(h.type==='draught in the ash'){ h.img.setAlpha(0.6+0.3*Math.sin(st.t/340+i)); if(h.dr) draughtTick(st,h); } }
    },
    bump:function(ctx,tx,ty,ux,uy,tile,info){
      var st=ctx.state, i; if(!st.secrets||!info) return;
      for(i=0;i<st.secrets.length;i++){ var G=st.secrets[i]; if(G.open) continue;
        if(ux*G.dir[0]+uy*G.dir[1]<0.6 || !facing(G,info.px,info.py)) continue;
        var gap=st.t-G.last; if(gap>0){ G.acc+=(gap<=160)?gap:16; G.last=st.t; }
        if(G.acc<LEAN_MS) return;
        if(G.needs==='boss defeated' && !ctx.bossDown()){ G.acc=0; if(!st.told){ st.told=true; ctx.say(K.S('ruins.sealed')); } return; }
        G.open=true; K.set(ctx,'secret'+G.id+'.open',true); st.opened=(st.opened||0)+1;
        this._breach(ctx,G,false); try{ ctx.scene.cameras.main.shake(260,0.008); }catch(e){} K.sfx('door'); ctx.say(K.S('ruins.opens'));
        return; }
    },
    free:function(ctx,px,py){
      var s=ctx.state.secrets||[]; for(var i=0;i<s.length;i++) if(s[i].open && inBreach(s[i],px,py)) return true;
    },
    interact:function(ctx,px,py,best){
      var st=ctx.state, h=K.nearest(px,py,st.hints||[],4); if(!h||best) return null;
      return K.pill(px,py,h,K.S(h.type==='sign'?'verb.read':'verb.look'),function(){ ctx.say(K.S(HINT_KEY[h.type]||'ruins.hint')); });
    },
    _debug:{ geom:geom, facing:facing, inBreach:inBreach, LEAN_MS:LEAN_MS }
  }); });
})();
