/* Iron Mine: mine carts (mechanic id `mine-carts`).

   The plan: rails ('=' on the ground, '+' on a trestle over a chasm) join named buffer stops
   through junctions; a lever beside each junction chooses which of its two branches a cart
   coming up the STEM takes (a cart coming in on a branch always leaves by the stem). A ride
   is one run from the stop the cart is parked at to the next stop, at
   params.cartSpeedCellsPerSec. The cart parks there and she steps off beside it.

   ART paints the rails and trestles into the floor picture (track through cell centres); this
   module draws the carts, buffer stops, levers and the switch blade at each junction.
   Persistent (ctx.flags): cart<id>.at.<stop>, sw.<junction> (true = second branch),
   riding.<id> (set for the length of a ride: a save made mid-ride resumes at the destination). */
(function boot(){
  'use strict';
  var K=window.__QOK_D2KIT_A__; if(!K){ setTimeout(boot,40); return; }
  var TILE=K.TILE, D4=[[0,-1,'n'],[1,0,'e'],[0,1,'s'],[-1,0,'w']];
  // Day-4 look (census DA-04; owner 2026-11-03: "lever beside the junction, subtle track change, no
  // arrow"): the arrow badge over each lever is gone and the point blades carry the cue alone (a
  // little bolder, with a short glint when the lever is pulled). Levers, buffer stops and parked
  // carts stand above her lamp's darkness, so one outside her light shone at full brightness in
  // the black: they now take the lamp's own falloff. localStorage 'qok-d4-looks'='0' = the old look.
  var LOOKS=(function(){ try{ return window.localStorage.getItem('qok-d4-looks')!=='0'; }catch(e){ return true; } })();
  function lampDim(sc,o){                                                       // dq-tiles.js updateFog's falloff (6 screen px per fog px, radius +-16)
    try{
      var h=sc.hero; if(!h||!o||!o.setTint) return;
      var z=sc.cameras.main.zoom||1, R=(typeof window.__DQ_FOG_R__==='number')?window.__DQ_FOG_R__:34;
      var dx=(o.x-h.x)*z/6, dy=(o.y-h.y)*z/6, t=(Math.sqrt(dx*dx+dy*dy)-(R-16))/32; t=t<0?0:(t>1?1:t);
      var v=Math.round(255*(1-(t*t*(3-2*t))*0.98));
      if(o.__lampV!==v){ o.__lampV=v; o.setTint(v*65793); }
    }catch(e){}
  }
  function rail(ctx,x,y){ var c=ctx.terrain(x,y); return c==='='||c==='+'; }
  function arms(ctx,x,y){ var a=[]; for(var i=0;i<4;i++) if(rail(ctx,x+D4[i][0],y+D4[i][1])) a.push(i); return a; }

  // ---- the network, read off the plan ----------------------------------------------------------
  function build(ctx){
    var mech=ctx.plan.mech||[], net=ctx.mechanic.network||{}, P=ctx.mechanic.params||{}, i, j, d;
    var N={ stops:{}, stopAt:{}, junc:{}, juncAt:{}, carts:[], levers:[], buffers:[], speed:(P.cartSpeedCellsPerSec||8)*TILE };
    for(i=0;i<mech.length;i++){ var a=mech[i];
      if(a.kind==='bufferStop'){ N.buffers.push(a);
        for(d=0;d<4;d++){ var sx=a.x+D4[d][0], sy=a.y+D4[d][1];
          if(rail(ctx,sx,sy)){ N.stops[a.stop]={name:a.stop,x:sx,y:sy,buffer:a,out:(d)}; N.stopAt[sx+','+sy]=a.stop; break; } } }
      else if(a.kind==='lever') N.levers.push(a);
      else if(a.kind==='cart') N.carts.push({id:a.id,start:a.stop}); }
    // junction cells: three rails meet. Each is named by the lever standing beside it.
    var W=ctx.plan.width, H=ctx.plan.height, cells=[];
    for(j=0;j<H;j++) for(i=0;i<W;i++) if(rail(ctx,i,j) && arms(ctx,i,j).length>=3) cells.push([i,j]);
    for(i=0;i<N.levers.length;i++){ var L=N.levers[i], best=null, bd=1e9;
      for(j=0;j<cells.length;j++){ var dd=Math.abs(cells[j][0]-L.x)+Math.abs(cells[j][1]-L.y); if(dd<bd && !N.juncAt[cells[j][0]+','+cells[j][1]]){ bd=dd; best=cells[j]; } }
      if(!best) continue;
      var def=(net.junctions&&net.junctions[L.junction])||L;
      N.junc[L.junction]={name:L.junction,x:best[0],y:best[1],lever:L,stemName:def.stem,branches:def.branches||L.branches,start:def.start||L.start,arm:{}};
      N.juncAt[best[0]+','+best[1]]=L.junction; }
    // which arm of a junction leads where: follow the rail to the next junction or stop
    for(var jn in N.junc){ var J=N.junc[jn], ar=arms(ctx,J.x,J.y), ends={};
      for(i=0;i<ar.length;i++){ var e=follow(ctx,N,J.x,J.y,ar[i]); ends[ar[i]]=e?e.name:null; }
      for(i=0;i<J.branches.length;i++) for(d in ends) if(ends[d]===J.branches[i]) J.arm[J.branches[i]]=+d;
      J.stem=-1;
      for(d in ends) if(ends[d]===J.stemName) J.stem=+d;
      if(J.stem<0) for(i=0;i<ar.length;i++){ var used=false; for(j=0;j<J.branches.length;j++) if(J.arm[J.branches[j]]===ar[i]) used=true; if(!used) J.stem=ar[i]; } }
    return N;
  }
  // From (x,y) heading d: the cells up to and including the next junction cell or dead end.
  function follow(ctx,N,x,y,d){
    var path=[], px=x, py=y, cx=x+D4[d][0], cy=y+D4[d][1], guard=0, heading=d;
    while(rail(ctx,cx,cy) && guard++<400){
      path.push([cx,cy]);
      var k=cx+','+cy;
      if(N.juncAt[k]) return {kind:'junction',name:N.juncAt[k],x:cx,y:cy,path:path,heading:heading};
      var nx=-1, ny=-1, nh=heading, n=0;
      for(var i=0;i<4;i++){ var ax=cx+D4[i][0], ay=cy+D4[i][1]; if((ax!==px||ay!==py) && rail(ctx,ax,ay)){ nx=ax; ny=ay; nh=i; n++; } }
      if(n===0) return {kind:'stop',name:N.stopAt[k]||null,x:cx,y:cy,path:path,heading:heading};
      px=cx; py=cy; cx=nx; cy=ny; heading=nh;
    }
    return null;
  }
  function branchOf(ctx,N,J){ return J.branches[ K.get(ctx,'sw.'+J.name) ? (J.branches[0]===J.start?1:0) : (J.branches[0]===J.start?0:1) ]; }
  // The whole ride from a stop: cell list (starting with the stop's own cell) and where it ends.
  function ridePath(ctx,N,stopName){
    var S=N.stops[stopName]; if(!S) return null;
    var ar=arms(ctx,S.x,S.y); if(!ar.length) return null;
    var cells=[[S.x,S.y]], x=S.x, y=S.y, d=ar[0], guard=0;
    while(guard++<12){
      var e=follow(ctx,N,x,y,d); if(!e) return null;
      cells=cells.concat(e.path);
      if(e.kind==='stop') return {cells:cells,end:e.name};
      var J=N.junc[e.name], from=(e.heading+2)%4;           // the arm she came in on
      d=(from===J.stem) ? J.arm[branchOf(ctx,N,J)] : J.stem;
      if(d===undefined||d<0) return null;
      x=e.x; y=e.y;
    }
    return null;
  }
  function cartStop(ctx,N,c){ var names=[]; for(var k in N.stops) names.push(k); return K.getOne(ctx,'cart'+c.id+'.at',names,c.start); }
  function setCartStop(ctx,N,c,stop){ var names=[]; for(var k in N.stops) names.push(k); K.setOne(ctx,'cart'+c.id+'.at',names,stop); }

  // ---- pictures ----------------------------------------------------------------------------------
  var WOOD='#6b4a2e', WOOD_D='#3f2a19', WOOD_L='#8f6a42', IRON='#565b63', IRON_D='#2a2d33', IRON_L='#8b929c', RED='#b3382c';
  function wheel(g,cx,cy,r){ g.fillStyle=IRON_D; g.beginPath(); g.arc(cx,cy,r,0,Math.PI*2); g.fill(); g.fillStyle=IRON_L; g.beginPath(); g.arc(cx,cy,r-2,0,Math.PI*2); g.fill();
    g.fillStyle=IRON_D; g.beginPath(); g.arc(cx,cy,1.5,0,Math.PI*2); g.fill(); }
  function texCartSide(sc){ return K.tex(sc,'d2a_cart_side',52,44,function(g){
    K.shadow(g,26,39,22,5,0.35);
    g.fillStyle=IRON_D; g.fillRect(5,30,42,4);                                 // frame
    wheel(g,13,35,6); wheel(g,39,35,6);
    g.fillStyle=IRON_D; g.beginPath(); g.moveTo(2,10); g.lineTo(50,10); g.lineTo(45,31); g.lineTo(7,31); g.closePath(); g.fill();
    g.fillStyle=WOOD; g.beginPath(); g.moveTo(4,12); g.lineTo(48,12); g.lineTo(44,29); g.lineTo(8,29); g.closePath(); g.fill();
    g.fillStyle=WOOD_D; for(var x=14;x<44;x+=9) g.fillRect(x,12,1,17);
    g.fillStyle=WOOD_L; g.fillRect(5,12,42,2);
    g.fillStyle=IRON; g.fillRect(2,8,48,4); g.fillStyle=IRON_L; g.fillRect(2,8,48,1);  // rim
    g.fillStyle=IRON; g.fillRect(9,14,2,15); g.fillRect(41,14,2,15);
    g.fillStyle='#1c1410'; g.fillRect(6,5,40,4);                                // dark inside
    K.speck(g,6,14,40,14,[WOOD_L,WOOD_D],26,11);
  }); }
  function texCartEnd(sc){ return K.tex(sc,'d2a_cart_end',44,46,function(g){
    K.shadow(g,22,41,17,5,0.35);
    g.fillStyle=IRON_D; g.fillRect(6,34,5,8); g.fillRect(33,34,5,8);            // wheels end-on
    g.fillStyle=IRON_L; g.fillRect(7,35,2,6); g.fillRect(34,35,2,6);
    g.fillStyle=IRON_D; g.fillRect(8,33,28,3);
    g.fillStyle=IRON_D; g.beginPath(); g.moveTo(3,10); g.lineTo(41,10); g.lineTo(37,34); g.lineTo(7,34); g.closePath(); g.fill();
    g.fillStyle=WOOD; g.beginPath(); g.moveTo(5,12); g.lineTo(39,12); g.lineTo(35,32); g.lineTo(9,32); g.closePath(); g.fill();
    g.fillStyle=WOOD_D; g.fillRect(15,12,1,20); g.fillRect(28,12,1,20);
    g.fillStyle=WOOD_L; g.fillRect(6,12,32,2);
    g.fillStyle=IRON; g.fillRect(3,8,38,4); g.fillStyle=IRON_L; g.fillRect(3,8,38,1);
    g.fillStyle=IRON; g.fillRect(20,14,4,16); g.fillStyle=IRON_L; g.fillRect(20,14,1,16);
    g.fillStyle='#1c1410'; g.fillRect(7,4,30,5);
    K.speck(g,8,14,28,16,[WOOD_L,WOOD_D],20,5);
  }); }
  function texBuffer(sc){ return K.tex(sc,'d2a_buffer',48,52,function(g){
    K.shadow(g,24,46,20,5,0.4);
    g.fillStyle=WOOD_D; g.fillRect(6,16,8,32); g.fillRect(34,16,8,32);          // posts
    g.fillStyle=WOOD; g.fillRect(7,17,5,30); g.fillRect(35,17,5,30);
    g.fillStyle=WOOD_L; g.fillRect(7,17,1,30); g.fillRect(35,17,1,30);
    g.fillStyle=WOOD_D; g.fillRect(2,20,44,11); g.fillStyle='#d8cdb8'; g.fillRect(3,21,42,9);   // striped beam
    g.fillStyle=RED; for(var x=3;x<45;x+=14){ g.beginPath(); g.moveTo(x,30); g.lineTo(x+7,21); g.lineTo(x+14,21); g.lineTo(x+7,30); g.closePath(); g.fill(); }
    g.fillStyle=WOOD_D; g.fillRect(2,20,44,1); g.fillRect(2,30,44,1);
    g.fillStyle=IRON_D; g.fillRect(4,36,40,5); g.fillStyle=IRON; g.fillRect(5,37,38,2);          // lower rail
    g.fillStyle=IRON_D; g.fillRect(20,4,8,14); g.fillStyle='#ffcf5a'; g.fillRect(22,7,4,7); g.fillStyle='#fff3c0'; g.fillRect(23,8,2,3);   // lamp
    g.fillStyle=IRON_L; g.fillRect(20,4,8,2);
  }); }
  function texLever(sc,side){ return K.tex(sc,'d2a_lever_'+side,48,52,function(g){
    K.shadow(g,24,45,17,5,0.4);
    g.fillStyle=IRON_D; g.fillRect(9,36,30,10); g.fillStyle=IRON; g.fillRect(10,37,28,7); g.fillStyle=IRON_L; g.fillRect(10,37,28,1);   // base
    g.fillStyle=IRON_D; g.fillRect(14,39,3,3); g.fillRect(31,39,3,3);
    var tx=side?37:11;                                                           // the arm leans toward the branch it selects
    g.strokeStyle=IRON_D; g.lineWidth=6; g.beginPath(); g.moveTo(24,39); g.lineTo(tx,12); g.stroke();
    g.strokeStyle=IRON_L; g.lineWidth=2; g.beginPath(); g.moveTo(23,38); g.lineTo(tx-1,12); g.stroke();
    g.fillStyle='#5a1611'; g.beginPath(); g.arc(tx,10,6,0,Math.PI*2); g.fill();
    g.fillStyle=RED; g.beginPath(); g.arc(tx,10,4.5,0,Math.PI*2); g.fill();
    g.fillStyle='#f0a090'; g.fillRect(tx-2,7,2,2);
  }); }
  function texArrow(sc){ return K.tex(sc,'d2a_arrow',22,22,function(g){        // points up; rotated to the branch
    g.fillStyle='#2a1d10'; g.beginPath(); g.arc(11,11,11,0,Math.PI*2); g.fill();
    g.fillStyle='#f2e3b3'; g.beginPath(); g.arc(11,11,9.5,0,Math.PI*2); g.fill();
    g.fillStyle='#2b6b3a'; g.beginPath(); g.moveTo(11,2); g.lineTo(19,11); g.lineTo(14,11); g.lineTo(14,19); g.lineTo(8,19); g.lineTo(8,11); g.lineTo(3,11); g.closePath(); g.fill();
  }); }
  var ROT=[0,Math.PI/2,Math.PI,-Math.PI/2];                                     // arm index n,e,s,w -> rotation of an up arrow
  var GLINT_MS=420;

  function drawBlade(ctx,J){                                                    // the switch blade: bright steel toward the open branch
    var st=ctx.state, g=st.blades[J.name]; if(!g) return;
    var cx=J.x*TILE+TILE/2, cy=J.y*TILE+TILE/2, d=J.arm[branchOf(ctx,st.N,J)];
    g.clear(); if(d===undefined) return;
    var dx=D4[d][0], dy=D4[d][1], ox=-dy*9, oy=dx*9;
    if(LOOKS){                                                                  // bolder, a little longer; `glint` (1..0) for a moment after the lever moves
      var gl=st.glint&&st.glint[J.name]>0?st.glint[J.name]/GLINT_MS:0, len=26;
      if(gl>0){ g.lineStyle(9,0xfff1c4,0.38*gl); g.beginPath(); g.moveTo(cx+ox,cy+oy); g.lineTo(cx+ox+dx*len,cy+oy+dy*len); g.moveTo(cx-ox,cy-oy); g.lineTo(cx-ox+dx*len,cy-oy+dy*len); g.strokePath(); }
      g.lineStyle(6,0x14100c,0.92); g.beginPath(); g.moveTo(cx+ox,cy+oy); g.lineTo(cx+ox+dx*len,cy+oy+dy*len); g.moveTo(cx-ox,cy-oy); g.lineTo(cx-ox+dx*len,cy-oy+dy*len); g.strokePath();
      g.lineStyle(3,gl>0.5?0xfffbe6:0xffe9a8,1); g.beginPath(); g.moveTo(cx+ox,cy+oy); g.lineTo(cx+ox+dx*len,cy+oy+dy*len); g.moveTo(cx-ox,cy-oy); g.lineTo(cx-ox+dx*len,cy-oy+dy*len); g.strokePath();
      return;
    }
    g.lineStyle(4,0x14100c,0.9); g.beginPath(); g.moveTo(cx+ox,cy+oy); g.lineTo(cx+ox+dx*22,cy+oy+dy*22); g.moveTo(cx-ox,cy-oy); g.lineTo(cx-ox+dx*22,cy-oy+dy*22); g.strokePath();
    g.lineStyle(2,0xffe9a8,1); g.beginPath(); g.moveTo(cx+ox,cy+oy); g.lineTo(cx+ox+dx*22,cy+oy+dy*22); g.moveTo(cx-ox,cy-oy); g.lineTo(cx-ox+dx*22,cy-oy+dy*22); g.strokePath();
  }
  function leverLook(ctx,J){
    var st=ctx.state, o=st.leverImg[J.name], d=J.arm[branchOf(ctx,st.N,J)], second=K.get(ctx,'sw.'+J.name);
    if(o) o.setTexture(texLever(ctx.scene,second?1:0));
    var a=st.arrowImg[J.name]; if(a&&d!==undefined) a.setRotation(ROT[d]);
    drawBlade(ctx,J);
  }
  function cartPx(c){ return [c.x*TILE+TILE/2, c.y*TILE+TILE/2]; }
  function parkCart(ctx,c){                                                     // sprite at its stop, upright
    var st=ctx.state, S=st.N.stops[c.at]; if(!S) return;
    var vertical=(S.out===0||S.out===2);                                        // the buffer is north or south of it: the track runs north-south
    c.x=S.x; c.y=S.y; c.img.setTexture(vertical?texCartEnd(ctx.scene):texCartSide(ctx.scene));
    c.img.setPosition(S.x*TILE+TILE/2, S.y*TILE+TILE/2-2); c.img.__by=S.y*TILE+TILE-6;
  }
  function stepOff(ctx,c){                                                      // a free cell beside the parked cart
    var S=ctx.state.N.stops[c.at], order=[[0,1],[-1,0],[1,0],[0,-1]], i, k;
    for(k=0;k<2;k++) for(i=0;i<order.length;i++){ var x=S.x+order[i][0], y=S.y+order[i][1], ch=ctx.terrain(x,y);
      if(k===0 && ch!=='.') continue;                                            // plain floor first, a ground rail second
      if(ch!=='.'&&ch!=='=') continue; if(ctx.tile(x,y)!==0) continue; if(blocked(ctx,x*TILE+TILE/2,y*TILE+TILE/2)) continue;
      var sx=x*TILE+TILE/2, sy=y*TILE+TILE/2, tries=[[0,0],[-order[i][0]*10,-order[i][1]*10],[0,-8],[0,8],[-8,0],[8,0]];
      for(var t=0;t<tries.length;t++) if(ctx.maskFree(sx+tries[t][0],sy+tries[t][1])) return {x:sx+tries[t][0],y:sy+tries[t][1],dir:K.dirOf(-order[i][0],-order[i][1])};
    }
    return {x:S.x*TILE+TILE/2,y:S.y*TILE+TILE/2+TILE,dir:3};
  }
  function blocked(ctx,px,py){                                                  // soles inside one of our solid objects
    var st=ctx.state, i, g=3;
    for(i=0;i<st.solid.length;i++) if(K.inCell(px,py,st.solid[i].x,st.solid[i].y,g)) return true;
    for(i=0;i<st.carts.length;i++) if(st.carts[i]!==st.ride_cart && K.inCell(px,py,st.carts[i].x,st.carts[i].y,g)) return true;
    return false;
  }
  function startRide(ctx,c){
    var st=ctx.state; if(st.ride) return false;
    var p=ridePath(ctx,st.N,c.at); if(!p||p.cells.length<2||!st.N.stops[p.end]) return false;
    var pts=[], i; for(i=0;i<p.cells.length;i++) pts.push([p.cells[i][0]*TILE+TILE/2,p.cells[i][1]*TILE+TILE/2]);
    st.ride={cart:c,pts:pts,seg:0,t:0,end:p.end,from:c.at}; st.ride_cart=c;
    K.set(ctx,'riding.'+c.id,true); setCartStop(ctx,st.N,c,p.end);               // a save from here on resumes at the destination
    c.img.setDepth(10.2); K.sfx('door_open');
    return true;
  }
  function endRide(ctx){
    var st=ctx.state, r=st.ride, c=r.cart; st.ride=null; st.ride_cart=null;
    c.at=r.end; parkCart(ctx,c); K.set(ctx,'riding.'+c.id,false);
    var s=stepOff(ctx,c); K.placeSoles(ctx,s.x,s.y,s.dir); st.rides=(st.rides||0)+1;
    try{ ctx.scene.cameras.main.shake(90,0.004); }catch(e){}
  }

  K.ready(function(K,D){ D.register('mine-carts',{
    load:function(ctx){
      var sc=ctx.scene, st=ctx.state, N=build(ctx), i;
      st.N=N; st.solid=[]; st.sort=[]; st.carts=[]; st.blades={}; st.leverImg={}; st.arrowImg={}; st.glint={}; st.looks=LOOKS; st.ride=null; st.ride_cart=null; st.fix=null;
      for(i=0;i<N.buffers.length;i++){ var b=N.buffers[i], o=K.img(ctx,texBuffer(sc),b.x*TILE+TILE/2,b.y*TILE+TILE/2-4,9.4);
        o.__by=b.y*TILE+TILE-6; st.sort.push(o); st.solid.push({x:b.x,y:b.y}); }
      for(var jn in N.junc){ var J=N.junc[jn], L=J.lever;
        st.blades[jn]=ctx.own(sc.add.graphics().setDepth(2.4));
        var lo=K.img(ctx,texLever(sc,0),L.x*TILE+TILE/2,L.y*TILE+TILE/2-4,9.4); lo.__by=L.y*TILE+TILE-8; st.sort.push(lo); st.leverImg[jn]=lo;
        if(!LOOKS) st.arrowImg[jn]=K.img(ctx,texArrow(sc),L.x*TILE+TILE/2,L.y*TILE-10,10.7);
        st.solid.push({x:L.x,y:L.y,junction:jn}); leverLook(ctx,J); }
      for(i=0;i<N.carts.length;i++){ var c={id:N.carts[i].id,start:N.carts[i].start};
        c.at=cartStop(ctx,N,c); c.img=K.img(ctx,texCartSide(sc),0,0,9.4); st.sort.push(c.img); st.carts.push(c); parkCart(ctx,c);
        if(K.get(ctx,'riding.'+c.id)){ K.set(ctx,'riding.'+c.id,false); st.fix=c; } }   // saved mid-ride: she steps off at the destination
    },
    tick:function(ctx,dt){
      var st=ctx.state, h=ctx.hero(); if(!h||!st.N) return;
      if(st.fix && !ctx.scene.__a1dEntryWaiting){ var s0=stepOff(ctx,st.fix); st.fix=null; K.placeSoles(ctx,s0.x,s0.y,s0.dir); }
      var r=st.ride;
      if(r && K.onField(ctx)){
        var left=st.N.speed*Math.min(dt,100)/1000;
        while(left>0 && r.seg<r.pts.length-1){
          var a=r.pts[r.seg], b=r.pts[r.seg+1], len=Math.abs(b[0]-a[0])+Math.abs(b[1]-a[1]), rest=len-r.t;
          if(left<rest){ r.t+=left; left=0; } else { left-=rest; r.seg++; r.t=0; } }
        if(r.seg>=r.pts.length-1){ endRide(ctx); }
        else {
          var p=r.pts[r.seg], q=r.pts[r.seg+1], f=r.t/((Math.abs(q[0]-p[0])+Math.abs(q[1]-p[1]))||1), x=p[0]+(q[0]-p[0])*f, y=p[1]+(q[1]-p[1])*f;
          var horiz=(q[0]!==p[0]), dir=horiz?(q[0]>p[0]?2:1):(q[1]>p[1]?0:3), c=r.cart, bob=Math.sin((x+y)/7)*1.2;
          c.img.setTexture(horiz?texCartSide(ctx.scene):texCartEnd(ctx.scene)); c.img.setPosition(x,y-2+bob); c.x=(x/TILE)|0; c.y=(y/TILE)|0;
          ctx.place(x,y-20+bob,dir);                                             // she stands in the cart; its front hides her legs
        }
      }
      K.ysort(st.sort,h.footY);
      if(st.ride) st.ride.cart.img.setDepth(10.2);
      if(LOOKS){
        for(var si=0;si<st.sort.length;si++) lampDim(ctx.scene,st.sort[si]);
        for(var gj in st.glint) if(st.glint[gj]>0){ st.glint[gj]-=Math.min(dt,100); drawBlade(ctx,st.N.junc[gj]); }
      }
    },
    input:function(ctx,stick){ if(ctx.state.ride||ctx.state.fix) return null; },
    free:function(ctx,px,py){
      var st=ctx.state; if(!st.N) return;
      if(st.ride) return true;                                                   // riding: the cart carries her over the trestle
      if(blocked(ctx,px,py)) return false;
    },
    step:function(ctx){ if(ctx.state.ride) return false; },
    interact:function(ctx,px,py,best){
      var st=ctx.state; if(!st.N||st.ride) return null;
      var c=K.nearest(px,py,st.carts,14);
      if(c) return K.pill(px,py,c,K.S('verb.ride'),function(){ startRide(ctx,c); });
      var levers=[]; for(var i=0;i<st.solid.length;i++) if(st.solid[i].junction) levers.push(st.solid[i]);
      var l=K.nearest(px,py,levers,14);
      if(l) return K.pill(px,py,l,K.S('verb.lever'),function(){
        K.set(ctx,'sw.'+l.junction,!K.get(ctx,'sw.'+l.junction)); if(st.glint) st.glint[l.junction]=GLINT_MS; leverLook(ctx,st.N.junc[l.junction]); K.sfx('menu_select');
        try{ ctx.scene.cameras.main.shake(60,0.003); }catch(e){} });
      return null;
    },
    // for tests and probes
    _debug:{ build:build, ridePath:ridePath, branchOf:branchOf, startRide:startRide }
  }); });
})();
