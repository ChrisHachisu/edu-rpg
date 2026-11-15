/* Desert Tomb: glyph plates (mechanic id `glyph-plates`).

   A plate room is a grid of square plates (mechanic.rooms[]: plateCells, glyphs, order, path),
   each a painted blank slab; this module carves a glyph on every plate and lights it. Somewhere
   before the room a stone tablet shows the order. She walks from plate to plate (the path only
   ever steps to a plate that shares an edge):
     the next plate of the order   -> it lights (gold) and stays lit and safe;
     a plate that is already lit   -> nothing;
     any other plate               -> "Wrong plate!", a Tomb Guardian battle, then she is back
                                      at the room door and the plates are dark again;
     the last plate of the order   -> the far door grinds open and stays open (flag), every
                                      plate is safe from then on.
   A plate counts as stepped on when her soles are INSIDE it by SEAM px: the seams between
   plates are safe to walk along, so brushing a corner never costs a battle.
   Grades 1-2 get an optional "Order" strip (collapsed, top left) once the tablet was read.
   State (ctx.flags): room<name>.n.<k> = k plates lit (one of N), room<name>.read. */
(function boot(){
  'use strict';
  var K=window.__QOK_D2KIT_A__; if(!K){ setTimeout(boot,40); return; }
  var TILE=K.TILE, SEAM=9, GUARDIAN='mummy';
  // ---- the nine glyphs (and three spares), one stroke weight, drawn in a box of side s ---------
  function glyph(g,name,cx,cy,s,col){
    var u=s/64; g.save(); g.translate(cx-s/2,cy-s/2); g.scale(u,u);
    g.strokeStyle=col; g.fillStyle=col; g.lineWidth=5.5; g.lineCap='round'; g.lineJoin='round';
    function line(){ g.beginPath(); g.moveTo(arguments[0],arguments[1]); for(var i=2;i<arguments.length;i+=2) g.lineTo(arguments[i],arguments[i+1]); g.stroke(); }
    var i, a;
    switch(name){
    case 'sun': g.beginPath(); g.arc(32,32,11,0,Math.PI*2); g.stroke(); g.beginPath(); g.arc(32,32,3.5,0,Math.PI*2); g.fill();
      for(i=0;i<8;i++){ a=i*Math.PI/4; line(32+Math.cos(a)*18,32+Math.sin(a)*18,32+Math.cos(a)*26,32+Math.sin(a)*26); } break;
    case 'moon': g.beginPath(); g.arc(30,32,21,Math.PI*0.28,Math.PI*1.72); g.arc(44,32,17,Math.PI*1.38,Math.PI*0.62,true); g.closePath(); g.fill(); break;
    case 'snake': g.beginPath(); g.moveTo(10,50); g.bezierCurveTo(26,56,30,40,22,34); g.bezierCurveTo(12,26,24,12,36,20); g.bezierCurveTo(44,26,40,34,50,30); g.stroke();
      g.beginPath(); g.ellipse(52,27,6,4.5,-0.4,0,Math.PI*2); g.fill(); line(57,24,62,20); break;
    case 'ankh': g.beginPath(); g.ellipse(32,18,9,11,0,0,Math.PI*2); g.stroke(); line(32,29,32,58); line(16,36,48,36); break;
    case 'eye': g.beginPath(); g.moveTo(6,30); g.quadraticCurveTo(32,8,58,30); g.quadraticCurveTo(32,48,6,30); g.closePath(); g.stroke();
      g.beginPath(); g.arc(32,29,7,0,Math.PI*2); g.fill(); line(32,42,32,54); g.beginPath(); g.moveTo(44,40); g.quadraticCurveTo(50,54,58,52); g.stroke(); break;
    case 'bird': g.beginPath(); g.ellipse(30,34,16,10,-0.25,0,Math.PI*2); g.fill(); g.beginPath(); g.arc(46,18,7,0,Math.PI*2); g.fill();
      g.beginPath(); g.moveTo(52,16); g.lineTo(62,20); g.lineTo(52,22); g.closePath(); g.fill(); line(42,24,38,30); line(14,38,4,44); line(26,43,26,56); line(34,43,34,56); line(22,56,38,56); break;
    case 'scarab': g.beginPath(); g.ellipse(32,36,12,15,0,0,Math.PI*2); g.stroke(); line(32,22,32,50); g.beginPath(); g.arc(32,16,6,0,Math.PI*2); g.fill();
      line(21,28,8,20); line(43,28,56,20); line(20,36,6,36); line(44,36,58,36); line(22,45,10,56); line(42,45,54,56); break;
    case 'reed': line(32,60,32,26); g.beginPath(); g.moveTo(32,4); g.bezierCurveTo(46,12,44,30,32,34); g.bezierCurveTo(20,30,18,12,32,4); g.closePath(); g.fill();
      g.beginPath(); g.moveTo(32,48); g.quadraticCurveTo(46,44,50,34); g.stroke(); break;
    case 'hand': g.beginPath(); g.moveTo(20,58); g.lineTo(20,34); g.lineTo(44,34); g.lineTo(44,58); g.closePath(); g.fill();
      line(22,34,22,12); line(29,34,29,7); line(36,34,36,9); line(43,34,43,15); line(20,46,8,34); break;
    case 'water': for(i=0;i<3;i++) line(6,18+i*14,15,10+i*14,24,18+i*14,33,10+i*14,42,18+i*14,51,10+i*14,58,16+i*14); break;
    case 'star': g.beginPath(); for(i=0;i<10;i++){ a=-Math.PI/2+i*Math.PI/5; var r=(i%2)?11:26; g[i?'lineTo':'moveTo'](32+Math.cos(a)*r,32+Math.sin(a)*r); } g.closePath(); g.fill(); break;
    default: g.beginPath(); g.moveTo(24,8); g.lineTo(40,8); g.lineTo(38,18); g.bezierCurveTo(54,28,50,56,32,58); g.bezierCurveTo(14,56,10,28,26,18); g.closePath(); g.stroke(); line(20,34,44,34);   // jar
    }
    g.restore();
  }
  function texGlyph(sc,name){ return K.tex(sc,'d2a_glyph_'+name,96,96,function(g){ glyph(g,name,48,48,84,'#ffffff'); }); }
  function texGlow(sc){ return K.tex(sc,'d2a_plateglow',160,160,function(g){
    var gr=g.createRadialGradient(80,80,6,80,80,80); gr.addColorStop(0,'rgba(255,214,110,0.85)'); gr.addColorStop(0.5,'rgba(255,190,70,0.3)'); gr.addColorStop(1,'rgba(255,170,40,0)');
    g.fillStyle=gr; g.fillRect(0,0,160,160); }); }
  function texDoor(sc){ return K.tex(sc,'d2a_tombdoor',48,64,function(g){
    K.box(g,0,0,48,64,'#b08a52','#3a2812','#d9b577'); g.fillStyle='#8a693a'; g.fillRect(1,50,46,13);
    g.fillStyle='#6b4f29'; g.fillRect(1,49,46,1); g.fillRect(23,2,2,46);
    K.speck(g,2,2,44,46,['#c9a468','#977544','#a27f4a'],70,11);
    glyph(g,'eye',24,26,30,'#5a4020'); }); }
  function texTablet(sc){ return K.tex(sc,'d2a_tablet',48,64,function(g){
    K.shadow(g,24,58,19,5,0.35);
    g.fillStyle='#33230f'; g.beginPath(); g.moveTo(5,58); g.lineTo(5,18); g.quadraticCurveTo(24,-4,43,18); g.lineTo(43,58); g.closePath(); g.fill();
    g.fillStyle='#c4a06a'; g.beginPath(); g.moveTo(7,56); g.lineTo(7,19); g.quadraticCurveTo(24,-1,41,19); g.lineTo(41,56); g.closePath(); g.fill();
    g.fillStyle='#e2c48d'; g.fillRect(8,20,2,34); g.fillStyle='#9a7848'; g.fillRect(8,50,32,6);
    K.speck(g,9,12,30,38,['#b08d58','#d6b67f'],46,5);
    glyph(g,'sun',17,24,13,'#5a4020'); glyph(g,'ankh',31,24,13,'#5a4020'); glyph(g,'eye',17,39,13,'#5a4020'); glyph(g,'bird',31,39,13,'#5a4020'); }); }
  function texPanel(sc,n){ return K.tex(sc,'d2a_tabpanel_'+n,n*40+16,56,function(g,w,h){
    g.fillStyle='rgba(21,22,28,0.9)'; g.fillRect(2,0,w-4,h); g.fillRect(0,2,w,h-4);
    g.fillStyle='rgba(201,169,97,0.8)'; g.fillRect(2,0,w-4,1); g.fillRect(2,h-1,w-4,1); g.fillRect(0,2,1,h-4); g.fillRect(w-1,2,1,h-4); }); }
  // ---- rooms ------------------------------------------------------------------------------------
  function roomKey(R){ return 'room'+R.room; }
  function counts(R){ var a=[]; for(var i=0;i<=R.path.length;i++) a.push(String(i)); return a; }
  function progress(ctx,R){ return parseInt(K.getOne(ctx,roomKey(R)+'.n',counts(R),'0'),10)||0; }
  function setProgress(ctx,R,n){ K.setOne(ctx,roomKey(R)+'.n',counts(R),String(n)); if(n===0) K.set(ctx,roomKey(R)+'.n.0',false); }
  function build(R){                                        // plate rectangles in px, entry spot
    var plates={}, k, i, c;
    for(k in R.plateCells){ var x0=1e9,y0=1e9,x1=-1,y1=-1, cs=R.plateCells[k];
      for(i=0;i<cs.length;i++){ c=cs[i]; x0=Math.min(x0,c[0]); y0=Math.min(y0,c[1]); x1=Math.max(x1,c[0]); y1=Math.max(y1,c[1]); }
      plates[k]={key:k, name:R.glyphs[k], x0:x0*TILE, y0:y0*TILE, x1:(x1+1)*TILE, y1:(y1+1)*TILE}; }
    var es=R.entryStrip||[], sx=0, sy=0; for(i=0;i<es.length;i++){ sx+=es[i][0]; sy+=es[i][1]; }
    var first=plates[R.path[0].join(',')], entry=null, bd=1e9;
    // back "at the room door": the entry-strip cell beside the first plate's row/column, on the side away from the plates
    var fx=(first.x0+first.x1)/2, fy=(first.y0+first.y1)/2, mx=es.length?sx/es.length:0, my=es.length?sy/es.length:0;
    for(i=0;i<es.length;i++){ var px=es[i][0]*TILE+TILE/2, py=es[i][1]*TILE+TILE/2;
      var d=Math.abs(px-fx)+Math.abs(py-fy), far=Math.abs(px-fx)>=Math.abs(py-fy) ? Math.abs(px-fx) : Math.abs(py-fy);
      var score=Math.min(Math.abs(py-fy),Math.abs(px-fx))*4 - far + (Math.abs(es[i][0]-mx)+Math.abs(es[i][1]-my))*0.01;
      if(score<bd){ bd=score; entry=es[i]; } }
    return {plates:plates, entry:entry, face:entry?K.dirOf(fx-(entry[0]*TILE+TILE/2), fy-(entry[1]*TILE+TILE/2)):0};
  }
  function plateAt(B,px,py){
    for(var k in B.plates){ var p=B.plates[k]; if(px>=p.x0+SEAM && px<p.x1-SEAM && py>=p.y0+SEAM && py<p.y1-SEAM) return p; }
    return null;
  }
  function litIndex(R,key){ for(var i=0;i<R.path.length;i++) if(R.path[i].join(',')===key) return i; return -1; }
  // ---- the order strip (grades 1-2) -------------------------------------------------------------
  var hintEl=null;
  function grade(){ try{ var s=window.__GAME_STATE__.player.state, n=parseInt(s.quizDifficulty,10); return isNaN(n)?99:n; }catch(e){ return 99; } }
  function hintDrop(){ if(hintEl){ try{ hintEl.parentNode.removeChild(hintEl); }catch(e){} hintEl=null; } }
  function hintShow(ctx,R){
    if(typeof document==='undefined') return;
    var st=ctx.state, id=ctx.key+'.'+R.room;
    if(hintEl && hintEl.__id===id) return;
    hintDrop();
    var el=document.createElement('div'); el.id='d2aGlyphHint'; el.__id=id; el.setAttribute('role','button');
    el.style.cssText='position:fixed;right:10px;top:calc(10px + env(safe-area-inset-top,0px));padding:7px 12px;border-radius:14px;'+
      'background:rgba(21,22,28,.88);border:1px solid rgba(201,169,97,.55);color:#f0e6c8;font-size:14px;font-weight:500;'+
      'box-shadow:0 0 10px rgba(0,0,0,.4);z-index:5;pointer-events:auto;touch-action:manipulation;-webkit-user-select:none;user-select:none;'+
      'display:flex;align-items:center;gap:6px;max-width:calc(100vw - 190px);flex-wrap:wrap;justify-content:flex-end;';
    var head=document.createElement('span'); el.appendChild(head);
    var row=document.createElement('span'); row.style.cssText='display:none;align-items:center;gap:3px;flex-wrap:wrap;'; el.appendChild(row);
    for(var i=0;i<R.order.length;i++){
      if(i){ var ar=document.createElement('span'); ar.textContent='›'; ar.style.cssText='opacity:.6;'; row.appendChild(ar); }
      var c=document.createElement('canvas'); c.width=56; c.height=56; c.style.cssText='width:28px;height:28px;'; c.title=K.S('glyph.'+R.order[i]);
      try{ glyph(c.getContext('2d'),R.order[i],28,28,50,'#ffd35a'); }catch(e){}
      row.appendChild(c); }
    function paint(){ head.textContent=K.S('tomb.hintTitle')+(st.hintOpen?' ▾':' ▸'); row.style.display=st.hintOpen?'inline-flex':'none'; }
    el.addEventListener('pointerdown',function(e){ e.preventDefault(); e.stopPropagation(); st.hintOpen=!st.hintOpen; paint(); });
    paint();
    (document.getElementById('touch-controls')||document.body).appendChild(el); hintEl=el;
  }
  K.ready(function(K,D){ D.register('glyph-plates',{
    load:function(ctx){
      var sc=ctx.scene, st=ctx.state, rooms=(ctx.mechanic&&ctx.mechanic.rooms)||[], mech=ctx.plan.mech||[], i, j, k;
      st.rooms=[]; st.sort=[]; st.solid=[]; st.tablets=[]; st.pending=null; st.hintOpen=false; st.alive=true;
      st.fx=ctx.own(sc.add.graphics().setDepth(2.3));
      for(i=0;i<rooms.length;i++){ var R=rooms[i], B=build(R), n=progress(ctx,R), V={R:R, B:B, n:n, imgs:{}, glows:{}, door:[], doorCells:R.door||[]};
        for(k in B.plates){ var p=B.plates[k], cx=(p.x0+p.x1)/2, cy=(p.y0+p.y1)/2;
          V.glows[k]=K.img(ctx,texGlow(sc),cx,cy,2.2).setAlpha(0); try{ V.glows[k].setBlendMode('ADD'); }catch(e){}
          V.imgs[k]=K.img(ctx,texGlyph(sc,p.name),cx,cy,2.4); }
        if(n<R.path.length) for(j=0;j<V.doorCells.length;j++){ var dc=V.doorCells[j];
          var d=K.img(ctx,texDoor(sc),dc[0]*TILE+TILE/2,dc[1]*TILE+TILE/2-8,9.4); d.__by=dc[1]*TILE+TILE-2; V.door.push(d); st.sort.push(d); }
        st.rooms.push(V); this._paint(ctx,V); }
      for(i=0;i<mech.length;i++){ if(mech[i].kind!=='tablet') continue; var a=mech[i], T={x:a.x,y:a.y,room:a.room,V:null};
        for(j=0;j<st.rooms.length;j++) if(st.rooms[j].R.room===a.room) T.V=st.rooms[j];
        if(!T.V) continue;
        var o=K.img(ctx,texTablet(sc),a.x*TILE+TILE/2,a.y*TILE+TILE/2-10,9.4); o.__by=a.y*TILE+TILE-6; st.sort.push(o);
        // the row of glyphs the tablet shows, floated over it while she stands close
        var ord=T.V.R.order, w=ord.length*40+16; T.panel=[K.img(ctx,texPanel(sc,ord.length),a.x*TILE+TILE/2,a.y*TILE-52,45).setAlpha(0)];
        for(j=0;j<ord.length;j++) T.panel.push(K.img(ctx,texGlyph(sc,ord[j]),a.x*TILE+TILE/2-w/2+28+j*40,a.y*TILE-52,45.1).setScale(0.36).setTint(0xffd35a).setAlpha(0));
        T.show=0; st.tablets.push(T); st.solid.push({x:a.x,y:a.y}); }
    },
    unload:function(ctx){ ctx.state.alive=false; hintDrop(); },
    _paint:function(ctx,V){
      var R=V.R, k;
      for(k in V.imgs){ var li=litIndex(R,k), lit=li>=0 && li<V.n;
        V.imgs[k].setTint(lit?0xffd35a:0x4a3620).setAlpha(lit?1:0.8); V.glows[k].setAlpha(lit?0.75:0); }
    },
    _open:function(ctx,V,quiet){
      var sc=ctx.scene, st=ctx.state;
      for(var i=0;i<V.door.length;i++){ var d=V.door[i], ix=st.sort.indexOf(d); if(ix>=0) st.sort.splice(ix,1);
        if(quiet){ try{ d.destroy(); }catch(e){} } else (function(d){ try{ sc.tweens.add({targets:d,y:d.y+34,alpha:0,duration:900,onComplete:function(){ try{ d.destroy(); }catch(e){} }}); }catch(e){} })(d); }
      V.door=[];
      if(!quiet){ try{ sc.cameras.main.shake(420,0.006); }catch(e){} K.sfx('door'); }
    },
    _reset:function(ctx,V){
      V.n=0; setProgress(ctx,V.R,0); this._paint(ctx,V);
      if(V.B.entry) K.placeSoles(ctx,V.B.entry[0]*TILE+TILE/2,V.B.entry[1]*TILE+TILE/2,V.B.face);
    },
    tick:function(ctx,dt){
      var sc=ctx.scene, st=ctx.state, self=this, i; if(!st.rooms||!K.onField(ctx)) return;
      var h=ctx.hero(), so=K.soles(ctx); if(!so) return;
      K.ysort(st.sort,h.footY);
      st.clock=(st.clock||0)+dt;
      for(i=0;i<st.rooms.length;i++){ var V0=st.rooms[i]; for(var gk in V0.glows){ var li=litIndex(V0.R,gk); if(li>=0&&li<V0.n) V0.glows[gk].setAlpha(0.62+0.16*Math.sin(st.clock/260+li)); } }
      // the tablet's row of glyphs
            for(i=0;i<st.tablets.length;i++){ var T=st.tablets[i], want=(K.cellDist(so.x,so.y,T.x,T.y)<TILE*1.6)?1:0;
        T.show+=(want-T.show)*Math.min(1,dt/120); if(Math.abs(T.show-want)<0.03) T.show=want;
        for(var j=0;j<T.panel.length;j++) T.panel[j].setAlpha(T.show);
 }
      // the order strip: grades 1-2, a room whose tablet was read and that is not solved yet (the last one read wins)
      if(grade()<=2){ var hr=null;
        for(i=0;i<st.rooms.length;i++){ var Vh=st.rooms[i]; if(Vh.n<Vh.R.path.length && K.get(ctx,roomKey(Vh.R)+'.read')){ if(!hr || st.lastRead===Vh.R.room) hr=Vh; } }
        if(hr) hintShow(ctx,hr.R); else hintDrop(); }
      else if(hintEl) hintDrop();
      if(st.flash){ st.flash.t-=dt; var g=st.fx; g.clear();
        if(st.flash.t>0){ var p=st.flash.p; g.fillStyle(st.flash.col,0.45*Math.min(1,st.flash.t/300)); g.fillRect(p.x0+3,p.y0+3,p.x1-p.x0-6,p.y1-p.y0-6); } else st.flash=null; }
      if(st.note){ st.note.t-=dt; if(st.note.t<=0 && !ctx.busy()){ var nk=st.note.key; st.note=null; ctx.say(K.S(nk)); } return; }
      if(st.pending){                                       // wrong plate: the message is read, then the guardian
        st.pending.t-=dt;
        if(st.pending.t>0 || sc.showingMessage || sc.isMoving) return;
        var V=st.pending.V; st.pending.tries=(st.pending.tries||0)+1;
        var started=ctx.battle(GUARDIAN,function(){
          if(!st.alive || sc.currentMapId!==ctx.id || (sc.currentFloor||1)!==ctx.floor){ setProgress(ctx,V.R,0); return; }   // she lost and woke elsewhere
          self._reset(ctx,V); st.grace=700; st.note={key:'tomb.reset',t:350}; });   // the line is said from the tick, once the field is live again
        if(started){ st.pending=null; st.battles=(st.battles||0)+1; }
        else if(st.pending.tries>90){ st.pending=null; self._reset(ctx,V); ctx.say(K.S('tomb.reset')); }   // the battle could not start: the reset still happens
        return; }
      if(st.grace>0){ st.grace-=dt; return; }
      if(ctx.busy()) return;
      for(i=0;i<st.rooms.length;i++){ var W=st.rooms[i], R=W.R; if(W.n>=R.path.length) continue;
        var pl=plateAt(W.B,so.x,so.y); if(!pl) continue;
        var ix=litIndex(R,pl.key);
        if(ix>=0 && ix<W.n) continue;                        // already lit: safe
        if(ix===W.n){                                        // the next glyph of the order
          W.n++; setProgress(ctx,R,W.n); self._paint(ctx,W); K.sfx('confirm'); st.flash={p:pl,t:260,col:0xffd35a};
          try{ sc.tweens.add({targets:W.imgs[pl.key],scale:{from:1.25,to:1},duration:260}); }catch(e){}
          if(W.n>=R.path.length){ self._open(ctx,W,false); ctx.say(K.S('tomb.solved')); }
        } else {
          st.flash={p:pl,t:700,col:0xff3b30}; st.pending={V:W,t:350}; try{ sc.cameras.main.shake(200,0.01); }catch(e){}
          K.sfx('error'); ctx.say(K.S('tomb.wrong')); }
        return; }
    },
    input:function(ctx){ if(ctx.state.pending) return null; },
    step:function(ctx){ if(ctx.state.pending) return false; },
    free:function(ctx,px,py){
      var st=ctx.state, i, j; if(!st.rooms) return;
      for(i=0;i<st.solid.length;i++) if(K.inCell(px,py,st.solid[i].x,st.solid[i].y,3)) return false;
      for(i=0;i<st.rooms.length;i++){ var V=st.rooms[i]; if(V.n>=V.R.path.length) continue;
        for(j=0;j<V.doorCells.length;j++) if(K.inCell(px,py,V.doorCells[j][0],V.doorCells[j][1],4)) return false; }
    },
    interact:function(ctx,px,py){
      var st=ctx.state, T=K.nearest(px,py,st.tablets||[],16); if(!T) return null;
      return K.pill(px,py,T,K.S('verb.read'),function(){
        var R=T.V.R, names=[]; for(var i=0;i<R.order.length;i++) names.push(K.S('glyph.'+R.order[i]));
        K.set(ctx,roomKey(R)+'.read',true); st.lastRead=R.room;
        ctx.say(K.S('tomb.tablet')+'\n'+names.join(' → ')+'\n'+K.S('tomb.tabletHint')); });
    },
    _debug:{ build:build, plateAt:plateAt, progress:progress, SEAM:SEAM }
  }); });
})();
