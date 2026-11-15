/* Bandit Hideout: trip wires and spike patches (mechanic id `tripwires-and-spikes`).

   WIRES (mechanic.wires[]: a straight run of cells, wall to wall). A wire is a hair-thin line
   between two small pegs, close to invisible; every GLINT_EVERY ms a glint runs along it, and it
   shows a little more once she is close enough to cut it. Within params' 2 tiles the prompt
   reads "Cut trip wire": cut = gone for good (flag wire<id>.cut). Walking through a live wire
   trips it: the wire is spent (flag wire<id>.spent) and bandits jump her (one ambush battle).
   SPIKES (mechanic.spikePatches[]: 2x2 cells). A patch is a shade off the floor with rows of
   small holes. Stepping on it: a small hit (never the last hit point) and she is thrown back two
   tiles the way she came; from then on the spikes stay up and visible (flag spike<i>.sprung) and
   still bite. Nothing here is timed. */
(function boot(){
  'use strict';
  var K=window.__QOK_D2KIT_A__; if(!K){ setTimeout(boot,40); return; }
  var TILE=K.TILE, CUT_REACH=2*TILE, GLINT_EVERY=3200, GLINT_MS=520, BAND=7, THROW=2*TILE, THROW_MS=260, SPIKE_HIT=0.06;
  var AMBUSH=['banditArcher','bruiser','knifeSneak','bandit'];
  function texPeg(sc){ return K.tex(sc,'d2a_peg',14,20,function(g){
    K.shadow(g,7,17,6,2.5,0.4);
    g.fillStyle='#17161a'; g.fillRect(4,3,6,14); g.fillStyle='#4a4a54'; g.fillRect(5,4,4,12); g.fillStyle='#7c7c8a'; g.fillRect(5,4,1,12);
    g.fillStyle='#17161a'; g.fillRect(3,1,8,4); g.fillStyle='#6a6a78'; g.fillRect(4,2,6,2);
    g.fillStyle='#8a6a2c'; g.fillRect(3,7,8,3); g.fillStyle='#d2a94e'; g.fillRect(4,7,6,1); }); }
  function texSpikes(sc,up){ return K.tex(sc,'d2a_spikes_'+(up?'u':'h'),96,96,function(g){
    g.fillStyle=up?'rgba(20,14,10,0.30)':'rgba(20,14,10,0.13)'; g.fillRect(3,3,90,90);
    g.fillStyle=up?'rgba(0,0,0,0.35)':'rgba(0,0,0,0.10)'; g.fillRect(3,3,90,2); g.fillRect(3,3,2,90);
    for(var j=0;j<4;j++) for(var i=0;i<4;i++){ var x=14+i*23, y=16+j*22;
      g.fillStyle=up?'rgba(8,6,5,0.8)':'rgba(8,6,5,0.34)'; g.fillRect(x-3,y-1,7,4);
      if(up){ g.fillStyle='#1c1d22'; g.beginPath(); g.moveTo(x-4,y+2); g.lineTo(x+0.5,y-13); g.lineTo(x+5,y+2); g.closePath(); g.fill();
        g.fillStyle='#b9bcc8'; g.beginPath(); g.moveTo(x-2.5,y+1); g.lineTo(x+0.5,y-10); g.lineTo(x+1,y+1); g.closePath(); g.fill();
        g.fillStyle='#6d707c'; g.beginPath(); g.moveTo(x+1,y+1); g.lineTo(x+0.5,y-10); g.lineTo(x+3.5,y+1); g.closePath(); g.fill(); } } }); }
  function wireGeom(w){                                     // the wire as a segment through its cells' centres, wall to wall
    var c=w.cells, x0=1e9,y0=1e9,x1=-1,y1=-1, i;
    for(i=0;i<c.length;i++){ x0=Math.min(x0,c[i][0]); y0=Math.min(y0,c[i][1]); x1=Math.max(x1,c[i][0]); y1=Math.max(y1,c[i][1]); }
    var vert=(x0===x1);
    return vert ? {id:w.id, cells:c, vert:true,  line:x0*TILE+TILE/2, a0:y0*TILE, a1:(y1+1)*TILE}
                : {id:w.id, cells:c, vert:false, line:y0*TILE+TILE/2, a0:x0*TILE, a1:(x1+1)*TILE};
  }
  function wireOff(G,px,py){ return (G.vert?px:py)-G.line; }               // signed px across the wire
  function wireAlong(G,px,py){ var a=G.vert?py:px; return a>=G.a0 && a<G.a1; }
  function wireDist(G,px,py){ var a=G.vert?py:px, d=Math.abs(wireOff(G,px,py)), e=a<G.a0?G.a0-a:(a>G.a1?a-G.a1:0); return Math.sqrt(d*d+e*e); }
  function patchRect(cells){ var x0=1e9,y0=1e9,x1=-1,y1=-1;
    for(var i=0;i<cells.length;i++){ x0=Math.min(x0,cells[i][0]); y0=Math.min(y0,cells[i][1]); x1=Math.max(x1,cells[i][0]); y1=Math.max(y1,cells[i][1]); }
    return {x0:x0*TILE, y0:y0*TILE, x1:(x1+1)*TILE, y1:(y1+1)*TILE}; }
  function inRect(r,px,py,grow){ grow=grow||0; return px>=r.x0-grow && px<r.x1+grow && py>=r.y0-grow && py<r.y1+grow; }
  K.ready(function(K,D){ D.register('tripwires-and-spikes',{
    load:function(ctx){
      var sc=ctx.scene, st=ctx.state, M=ctx.mechanic||{}, ws=M.wires||[], ps=M.spikePatches||[], i;
      st.wires=[]; st.patches=[]; st.t=0; st.pending=null; st.push=null; st.prev=null; st.grace=350;
      st.gfx=ctx.own(sc.add.graphics().setDepth(2.6));
      for(i=0;i<ws.length;i++){ var G=wireGeom(ws[i]); G.live=!(K.get(ctx,'wire'+G.id+'.cut')||K.get(ctx,'wire'+G.id+'.spent')); G.show=0;
        var ex=G.vert?[G.line,G.a0+5,G.line,G.a1-5]:[G.a0+5,G.line,G.a1-5,G.line];
        G.p=ex; G.pegs=[K.img(ctx,texPeg(sc),ex[0],ex[1]-5,2.7), K.img(ctx,texPeg(sc),ex[2],ex[3]-5,2.7)];
        st.wires.push(G); }
      for(i=0;i<ps.length;i++){ var r=patchRect(ps[i]); r.id=i; r.up=K.get(ctx,'spike'+i+'.sprung');
        r.img=K.img(ctx,texSpikes(sc,r.up),(r.x0+r.x1)/2,(r.y0+r.y1)/2,2.5); st.patches.push(r); }
    },
    _draw:function(ctx,so){
      var st=ctx.state, g=st.gfx, i; g.clear();
      for(i=0;i<st.wires.length;i++){ var G=st.wires[i], p=G.p;
        if(!G.live){                                         // cut or sprung: two limp ends at the pegs
          g.lineStyle(1,0xc9a45a,0.45); var dx=(p[2]-p[0]), dy=(p[3]-p[1]), l=Math.sqrt(dx*dx+dy*dy)||1, ux=dx/l, uy=dy/l;
          g.beginPath(); g.moveTo(p[0],p[1]); g.lineTo(p[0]+ux*10+uy*3,p[1]+uy*10+Math.abs(ux)*5+3); g.strokePath();
          g.beginPath(); g.moveTo(p[2],p[3]); g.lineTo(p[2]-ux*10+uy*3,p[3]-uy*10+Math.abs(ux)*5+3); g.strokePath();
          continue; }
        var near=so && wireDist(G,so.x,so.y)<=CUT_REACH; G.show+=((near?1:0)-G.show)*0.12;
        g.lineStyle(1,0xe6dcc0,0.10+0.24*G.show); g.beginPath(); g.moveTo(p[0],p[1]); g.lineTo(p[2],p[3]); g.strokePath();
        var ph=(st.t+G.id*870)%GLINT_EVERY;
        if(ph<GLINT_MS){ var k=ph/GLINT_MS, gx=p[0]+(p[2]-p[0])*k, gy=p[1]+(p[3]-p[1])*k, a=Math.sin(k*Math.PI);
          g.fillStyle(0xffffff,0.85*a); g.fillCircle(gx,gy,2.2); g.fillStyle(0xfff2c0,0.35*a); g.fillCircle(gx,gy,5);
          g.lineStyle(1,0xffffff,0.55*a); g.beginPath(); g.moveTo(gx-(p[2]-p[0])*0.06,gy-(p[3]-p[1])*0.06); g.lineTo(gx+(p[2]-p[0])*0.06,gy+(p[3]-p[1])*0.06); g.strokePath(); } }
    },
    _hazard:function(ctx,px,py,skip){                        // a spot the throw must not carry her onto
      var st=ctx.state, i; if(!ctx.maskFree(px,py)) return true;
      for(i=0;i<st.patches.length;i++) if(st.patches[i]!==skip && inRect(st.patches[i],px,py,2)) return true;
      for(i=0;i<st.wires.length;i++){ var G=st.wires[i]; if(G.live && wireAlong(G,px,py) && Math.abs(wireOff(G,px,py))<=BAND+4) return true; }
      return false;
    },
    tick:function(ctx,dt){
      var sc=ctx.scene, st=ctx.state, self=this, i; if(!st.wires||!K.onField(ctx)) return;
      st.t+=Math.min(dt,100);
      var so=K.soles(ctx); self._draw(ctx,so); if(!so) return;
      if(st.push){ var P=st.push; P.t+=dt; var k=Math.min(1,P.t/THROW_MS), e=1-(1-k)*(1-k);
        K.placeSoles(ctx,P.fx+(P.tx-P.fx)*e,P.fy+(P.ty-P.fy)*e-Math.sin(k*Math.PI)*10,P.dir);
        if(k>=1){ K.placeSoles(ctx,P.tx,P.ty,P.dir); st.push=null; st.grace=200; st.prev={x:P.tx,y:P.ty};
          if(!K.get(ctx,'spikes.told')){ K.set(ctx,'spikes.told',true); ctx.say(K.S('bandit.spikes')); } }
        return; }
      if(st.pending){ st.pending.t-=dt;                      // tripped: the line is read, then the ambush
        if(st.pending.t>0 || sc.showingMessage || sc.isMoving) return;
        st.pending.tries=(st.pending.tries||0)+1;
        if(ctx.battle(st.pending.mon,function(){ st.grace=600; }) || st.pending.tries>90){ st.pending=null; st.battles=(st.battles||0)+1; }
        return; }
      var prev=st.prev||{x:so.x,y:so.y}; st.prev={x:so.x,y:so.y};
      if(st.grace>0){ st.grace-=dt; return; }
      if(ctx.busy()) return;
      for(i=0;i<st.wires.length;i++){ var G=st.wires[i]; if(!G.live) continue;
        var o1=wireOff(G,so.x,so.y), o0=wireOff(G,prev.x,prev.y);
        var hit=(wireAlong(G,so.x,so.y) && Math.abs(o1)<=BAND) || (o0*o1<0 && Math.abs(o0)<TILE && wireAlong(G,(so.x+prev.x)/2,(so.y+prev.y)/2));
        if(!hit) continue;
        G.live=false; K.set(ctx,'wire'+G.id+'.spent',true); K.sfx('error'); try{ sc.cameras.main.shake(180,0.008); }catch(e2){}
        st.pending={mon:AMBUSH[G.id%AMBUSH.length], t:300}; ctx.say(K.S('bandit.tripped')); return; }
      for(i=0;i<st.patches.length;i++){ var r=st.patches[i]; if(!inRect(r,so.x,so.y,-3)) continue;
        var dx=so.x-prev.x, dy=so.y-prev.y;
        if(Math.abs(dx)+Math.abs(dy)<0.5){ var f=[[0,1],[-1,0],[1,0],[0,-1]][so.dir||0]; dx=f[0]; dy=f[1]; }
        var bx=0, by=0; if(Math.abs(dx)>=Math.abs(dy)) bx=dx>0?-1:1; else by=dy>0?-1:1;
        // back out of the patch the way she came, then two tiles more, as far as the ground allows
        var depth=bx<0?so.x-r.x0:bx>0?r.x1-so.x:by<0?so.y-r.y0:r.y1-so.y, want=depth+THROW, d=0, x=so.x, y=so.y, s;
        for(s=4;s<=want;s+=4){ var nx=so.x+bx*s, ny=so.y+by*s; if(s>depth+2 && self._hazard(ctx,nx,ny,r)) break; if(s>depth+2 || s>=want){ x=nx; y=ny; d=s; } }
        if(d<=depth){ x=so.x+bx*(depth+6); y=so.y+by*(depth+6); if(self._hazard(ctx,x,y,r)){ x=prev.x; y=prev.y; } }
        if(!r.up){ r.up=true; K.set(ctx,'spike'+r.id+'.sprung',true); r.img.setTexture(texSpikes(sc,true)); }
        st.hits=(st.hits||0)+1; K.hurt(ctx,SPIKE_HIT); K.sfx('hit');
        st.push={fx:so.x,fy:so.y,tx:x,ty:y,t:0,dir:so.dir}; return; }
    },
    input:function(ctx){ if(ctx.state.pending||ctx.state.push) return null; },
    step:function(ctx){ if(ctx.state.pending||ctx.state.push) return false; },
    interact:function(ctx,px,py,best){
      var st=ctx.state, G=null, bd=CUT_REACH, i, d; if(!st.wires||st.pending||st.push) return null;
      for(i=0;i<st.wires.length;i++){ if(!st.wires[i].live) continue; d=wireDist(st.wires[i],px,py); if(d<=bd){ bd=d; G=st.wires[i]; } }
      if(!G || (best && bd>TILE)) return null;               // an engine object within arm's reach comes first unless the wire is right there
      var c=G.cells[0], cd=1e9; for(i=0;i<G.cells.length;i++){ d=K.cellDist(px,py,G.cells[i][0],G.cells[i][1]); if(d<cd){ cd=d; c=G.cells[i]; } }
      return K.pill(px,py,{x:c[0],y:c[1]},K.S('verb.cut'),function(){
        if(!G.live) return; G.live=false; K.set(ctx,'wire'+G.id+'.cut',true); K.sfx('confirm'); ctx.say(K.S('bandit.cut')); });
    },
    _debug:{ wireGeom:wireGeom, patchRect:patchRect, CUT_REACH:CUT_REACH, AMBUSH:AMBUSH }
  }); });
})();
