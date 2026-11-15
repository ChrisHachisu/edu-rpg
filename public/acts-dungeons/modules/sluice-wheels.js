/* Oasis Depths: sluice wheels (mechanic id `sluice-wheels`).

   Plan data (ctx.mechanic, verbatim from plans/dungeons/oasisDepths_recover.py):
     wheels   [{id, at:[x,y], channels:[ids]}]
     channels [{id, wheel, floodedAtStart, rect:[x0,y0,x1,y1]}]   (3-wide walkways, painted as dry beds)
     params.rule: "each wheel works its channels together: a turn drains the flooded ones and floods the dry ones"
     params.turnFrom: "a cell beside the wheel"
   So a channel is flooded  <=>  floodedAtStart XOR (its wheel has been turned an odd number of times).

   What the player sees: live water in every flooded channel (it flows, fills from the wheel's side,
   drains away, leaves a damp bed for a while), stone sills at each walkway mouth with inlays in the
   colour of the wheel that works it (1 red, 2 green, 3 violet: the planning page's own colours), the
   wheel itself on a stone housing with a coloured hub and one coloured spoke that points up or down
   (its state). Turning: the prompt pill "Turn wheel" beside it; she is held while the wheel spins and
   the camera visits every channel it changes, then comes back to her.
   A mimic (plan `mech` kind "mimic") looks like a chest; opening it says the bundle's own
   treasure.mimic line and starts a Mimic battle, as the bundle's own mimic chests do.

   No soft-lock: the solver over every plan proves that from every state reachable by walking and
   turning the stairs (boss) stay reachable. The one way into an inconsistent state is leaving a
   floor without its stairs (a lost battle) and coming back in by the stairs above: on floor 2 that
   can leave her on the start bank with the island's wheel turned. So on arrival the module asks the
   same solver whether the way on is reachable from where she stands; if not, the floor's wheels go
   back to their start (a line says so). In normal play that never fires.

   State (ctx.flags): d2.<id>.f<n>.wheel<k> = true while wheel k has been turned an odd number of
   times; d2.<id>.f<n>.mimic.<x>.<y> = true once that mimic has sprung. */
(function boot(){
  'use strict';
  var K=window.__QOK_D2KIT_A__; if(!K){ setTimeout(boot,40); return; }
  var TILE=K.TILE, M=8;                                     // her soles stop M px short of flooded water
  var COL={1:['#d65a3c','#8a2f1c','#f39a7a'], 2:['#46965a','#225a33','#8fd29c'], 3:['#965ac8','#55307a','#cfa4ef']};
  var STR={
    en:{ 'verb.wheel':'Turn wheel', 'verb.open':'Open',
      'oasis.turn':'The wheel groans round. Water surges through the sluices!',
      'oasis.moat':'The wheel groans round. The moat drains away... Something stirs beyond it!',
      'oasis.deep':'The channel is full of water. It is too deep to wade across.',
      'oasis.wet':'Climb out of the channel before you turn the wheel.',
      'oasis.reset':'Somewhere, sluice gates clank. The water has gone back to its old channels.' },
    ja:{ 'verb.wheel':'ハンドルを まわす', 'verb.open':'あける',
      'oasis.turn':'ハンドルが ギギッと まわった。すいもんから みずが どっと ながれだした！',
      'oasis.moat':'ハンドルが ギギッと まわった。ほりの みずが ひいていく……。おくで なにかが うごめいた！',
      'oasis.deep':'みずろは みずで いっぱいだ。ふかくて わたれない。',
      'oasis.wet':'みずろから あがってから ハンドルを まわそう。',
      'oasis.reset':'どこかで すいもんが ガシャンと なった。みずが もとの みずろに もどっている。' },
    jaKanji:{ 'verb.wheel':'ハンドルを 回す', 'verb.open':'開ける',
      'oasis.turn':'ハンドルが ギギッと 回った。水門から 水が どっと 流れだした！',
      'oasis.moat':'ハンドルが ギギッと 回った。堀の 水が 引いていく……。奥で 何かが うごめいた！',
      'oasis.deep':'水路は 水で いっぱいだ。深くて 渡れない。',
      'oasis.wet':'水路から 上がってから ハンドルを 回そう。',
      'oasis.reset':'どこかで 水門が ガシャンと 鳴った。水が 元の 水路に 戻っている。' }
  };
  function S(k){ var t=STR[K.loc()]||STR.en; return t[k]!==undefined?t[k]:(STR.en[k]!==undefined?STR.en[k]:k); }

  // ---- rules ------------------------------------------------------------------------------------
  function turned(ctx,id){ return K.get(ctx,'wheel'+id); }
  function flooded(ctx,c){ return !!c.floodedAtStart !== turned(ctx,c.wheel); }
  function inRect(px,py,r,g){ return px>=r[0]*TILE-g && px<(r[2]+1)*TILE+g && py>=r[1]*TILE-g && py<(r[3]+1)*TILE+g; }

  // Cell solver, the recovery script's rule: 4-neighbour walking over '.' and dry channel cells;
  // wheels, chests, mimics, stairs and the boss are solid; a wheel is turned from a cell beside it.
  // reach(): can she get beside the goal from cell s with wheel mask m0 (bit k-1 = wheel k turned)?
  function model(ctx){
    var P=ctx.plan, mech=ctx.mechanic||{}, W=P.width, H=P.height, solid={}, chanAt={}, i, x, y, goal=null;
    var as=(P.assets||[]).concat(P.mech||[]);
    for(i=0;i<as.length;i++){ var a=as[i];
      if(/^(wheel|chest|mimic|boss|stairsDown|stairsUp|stairsNext|stairsPrev)$/.test(a.kind)) solid[a.x+','+a.y]=1;
      if(a.kind==='stairsDown'||a.kind==='stairsNext'||a.kind==='boss') goal=goal||[a.x,a.y]; }
    var ch=mech.channels||[];
    for(i=0;i<ch.length;i++){ var r=ch[i].rect; for(y=r[1];y<=r[3];y++) for(x=r[0];x<=r[2];x++) chanAt[x+','+y]=ch[i]; }
    return {W:W,H:H,solid:solid,chanAt:chanAt,goal:goal,wheels:mech.wheels||[],
      open:function(x,y,m){ if(x<0||y<0||x>=W||y>=H||solid[x+','+y]) return false; var c=chanAt[x+','+y];
        if(c) return (!c.floodedAtStart)===(!((m>>(c.wheel-1))&1));   // dry <=> flooded-at-start equals turned
        return ctx.terrain(x,y)==='.'; }};
  }
  function reach(Md,s,m0){
    if(!Md.goal) return true;
    var N=[[1,0],[-1,0],[0,1],[0,-1]], seen={}, q=[[s[0],s[1],m0]], h, i, j;
    seen[s[0]+','+s[1]+','+m0]=1;
    for(h=0;h<q.length;h++){ var p=q[h];
      if(Math.abs(p[0]-Md.goal[0])+Math.abs(p[1]-Md.goal[1])===1) return true;
      for(i=0;i<4;i++){ var nx=p[0]+N[i][0], ny=p[1]+N[i][1];
        if(Md.open(nx,ny,p[2]) && !seen[nx+','+ny+','+p[2]]){ seen[nx+','+ny+','+p[2]]=1; q.push([nx,ny,p[2]]); }
        for(j=0;j<Md.wheels.length;j++){ var w=Md.wheels[j]; if(w.at[0]!==nx||w.at[1]!==ny) continue;
          var nm=p[2]^(1<<(w.id-1)), k=p[0]+','+p[1]+','+nm; if(!seen[k]){ seen[k]=1; q.push([p[0],p[1],nm]); } } } }
    return false;
  }
  function maskOf(ctx){ var m=0, ws=(ctx.mechanic&&ctx.mechanic.wheels)||[]; for(var i=0;i<ws.length;i++) if(turned(ctx,ws[i].id)) m|=1<<(ws[i].id-1); return m; }
  function startCell(Md,so){ var cx=(so.x/TILE)|0, cy=(so.y/TILE)|0, best=null, bd=1e9;
    for(var dy=-1;dy<=1;dy++) for(var dx=-1;dx<=1;dx++){ var x=cx+dx, y=cy+dy, d=Math.abs(dx)+Math.abs(dy);
      if(Md.open(x,y,0)||Md.open(x,y,~0)) if(d<bd){ bd=d; best=[x,y]; } }
    return best||[cx,cy]; }

  // ---- art: painted by hand in the floor's palette (no Codex tile shows water or a wheel) --------
  function texPattern(sc){ return K.tex(sc,'d2c_wpat',64,64,function(g){
    g.fillStyle='#2a8aa6'; g.fillRect(0,0,64,64);
    K.speck(g,0,0,64,64,['#247c98','#3297b2','#1f7390','#38a1bb'],260,17);
    var rows=[[4,6,12],[14,30,9],[24,10,14],[34,44,10],[44,22,12],[54,52,9]], i, r, k;
    for(i=0;i<rows.length;i++){ r=rows[i]; for(k=-1;k<=1;k++){ var x=r[1]+k*64;
      g.fillStyle='rgba(150,222,236,0.75)'; g.fillRect(x,r[0],r[2],2); g.fillStyle='rgba(20,90,115,0.6)'; g.fillRect(x+2,r[0]+2,r[2]-2,1); } }
    g.fillStyle='rgba(225,250,255,0.9)'; g.fillRect(9,17,2,1); g.fillRect(41,39,2,1); g.fillRect(25,57,2,1); g.fillRect(55,9,1,1); }); }
  function texWheel(sc,id){ var c=COL[id]||COL[1]; return K.tex(sc,'d2c_wheel_'+id,48,48,function(g){
    var cx=24, cy=24, i, a;
    g.lineCap='round';
    for(i=0;i<6;i++){ a=i*Math.PI/3-Math.PI/2; g.strokeStyle='#3a2410'; g.lineWidth=5; g.beginPath(); g.moveTo(cx,cy); g.lineTo(cx+Math.cos(a)*19,cy+Math.sin(a)*19); g.stroke();
      g.strokeStyle=i===0?c[0]:'#9a6a34'; g.lineWidth=3; g.beginPath(); g.moveTo(cx+Math.cos(a)*5,cy+Math.sin(a)*5); g.lineTo(cx+Math.cos(a)*18,cy+Math.sin(a)*18); g.stroke(); }
    g.strokeStyle='#2b1a0b'; g.lineWidth=7; g.beginPath(); g.arc(cx,cy,19,0,Math.PI*2); g.stroke();
    g.strokeStyle='#a8743a'; g.lineWidth=4; g.beginPath(); g.arc(cx,cy,19,0,Math.PI*2); g.stroke();
    g.strokeStyle='#d9a660'; g.lineWidth=1; g.beginPath(); g.arc(cx,cy,20,Math.PI*1.05,Math.PI*1.7); g.stroke();
    for(i=0;i<6;i++){ a=i*Math.PI/3-Math.PI/2+Math.PI/6; g.fillStyle='#4a4a52'; g.fillRect(cx+Math.cos(a)*19-1.5,cy+Math.sin(a)*19-1.5,3,3); }
    g.fillStyle='#22160b'; g.beginPath(); g.arc(cx,cy,7,0,Math.PI*2); g.fill();
    g.fillStyle=c[1]; g.beginPath(); g.arc(cx,cy,6,0,Math.PI*2); g.fill();
    g.fillStyle=c[0]; g.beginPath(); g.arc(cx,cy,4.5,0,Math.PI*2); g.fill();
    g.fillStyle=c[2]; g.fillRect(cx-2,cy-3,2,2);
    g.fillStyle=c[0]; g.beginPath(); g.arc(cx,cy-19,3.2,0,Math.PI*2); g.fill(); }); }   // the coloured spoke ends in a knob: up = start, down = turned
  function texHousing(sc){ return K.tex(sc,'d2c_housing',56,46,function(g){
    K.shadow(g,28,40,25,6,0.38);
    K.box(g,6,14,44,28,'#b88a55','#3c2612','#dcb47c');               // sandstone housing
    g.fillStyle='#8e6538'; g.fillRect(7,34,42,7); g.fillStyle='#6d4b27'; g.fillRect(7,33,42,1);
    K.speck(g,8,16,40,17,['#a67a47','#c99c64','#9b7142'],60,23);
    g.fillStyle='#2a1a0c'; g.fillRect(23,4,10,14);                     // the shaft the wheel turns on
    g.fillStyle='#55555e'; g.fillRect(24,4,8,14); g.fillStyle='#7c7c86'; g.fillRect(24,4,2,14);
    g.fillStyle='#3a2612'; g.fillRect(12,22,32,4); g.fillStyle='#1c120a'; g.fillRect(13,23,30,2); }); }  // the sluice slot
  function chestTex(sc,name){                               // the engine's own chest art, so a mimic looks like any chest
    var key='a1dasset_'+name; if(sc.textures.exists(key)) return key;
    var req=chestTex.req||(chestTex.req={}); if(req[key]) return null; req[key]=true;
    try{ var im=new Image(); im.onload=function(){ try{ if(!sc.textures.exists(key)) sc.textures.addImage(key,im); }catch(e){} };
      im.src='act1-dungeon-art/assets/asset-'+name+'.png'; }catch(e){}
    return null;
  }

  // ---- one channel --------------------------------------------------------------------------------
  function build(ctx,c,Md){
    var r=c.rect, x0=r[0]*TILE, y0=r[1]*TILE, w=(r[2]-r[0]+1)*TILE, h=(r[3]-r[1]+1)*TILE;
    var open=function(x,y){ return x>=0&&y>=0&&x<Md.W&&y<Md.H&&ctx.terrain(x,y)!=='#'; }, x, y;
    var ends={l:false,r:false,t:false,b:false};
    for(y=r[1];y<=r[3];y++){ if(open(r[0]-1,y)) ends.l=true; if(open(r[2]+1,y)) ends.r=true; }
    for(x=r[0];x<=r[2];x++){ if(open(x,r[1]-1)) ends.t=true; if(open(x,r[3]+1)) ends.b=true; }
    var horiz=(ends.l||ends.r) ? true : (ends.t||ends.b) ? false : w>=h;
    var wh=null, ws=Md.wheels; for(var i=0;i<ws.length;i++) if(ws[i].id===c.wheel) wh=ws[i];
    // water arrives from the end nearer its wheel
    var inletLow=wh ? (horiz ? (wh.at[0]+0.5)*TILE < x0+w/2 : (wh.at[1]+0.5)*TILE < y0+h/2) : true;
    return {c:c, x0:x0, y0:y0, w:w, h:h, horiz:horiz, ends:ends, inletLow:inletLow, level:0, from:0, to:0, t:0, dur:0, mode:'fill', wet:0, off:0, redraw:0, img:null, bed:null, tk:null};
  }
  function bedTex(sc,ctx,C){                               // dry walkway: flagstones over the painted bed, sills at the open ends
    var key='d2c_bed_'+ctx.key+'_'+C.c.id, col=COL[C.c.wheel]||COL[1];
    return K.tex(sc,key,C.w,C.h,function(g,w,h){
      var s=24, x, y, row=0, seed=C.c.id*7+3;
      g.fillStyle='rgba(70,58,30,0.16)'; g.fillRect(0,0,w,h);
      for(y=0;y<h;y+=s,row++) for(x=(row%2)?-s/2:0;x<w;x+=s){ seed=(seed*1103515245+12345)&0x7fffffff;
        g.fillStyle='rgba(58,44,22,0.42)'; g.fillRect(x,y,s,1); g.fillRect(x,y,1,s);
        g.fillStyle='rgba(255,240,200,'+(0.05+(seed%7)/100)+')'; g.fillRect(x+2,y+2,s-4,s-4);
        g.fillStyle='rgba(255,246,214,0.22)'; g.fillRect(x+1,y+1,s-2,1); }
      g.fillStyle='rgba(40,30,14,0.35)'; if(C.horiz){ g.fillRect(0,0,w,3); g.fillRect(0,h-2,w,2); } else { g.fillRect(0,0,3,h); g.fillRect(w-2,0,2,h); }
      function sill(x,y,sw,sh){ g.fillStyle='#4a3218'; g.fillRect(x,y,sw,sh); g.fillStyle='#c9a36b'; g.fillRect(x+1,y+1,sw-2,sh-2);
        g.fillStyle='#e6c690'; if(sw>sh) g.fillRect(x+1,y+1,sw-2,1); else g.fillRect(x+1,y+1,1,sh-2);
        var n=3, i, L=Math.max(sw,sh); for(i=0;i<n;i++){ var t=(i+0.5)*L/n, cx=sw>sh?x+t:x+sw/2, cy=sw>sh?y+sh/2:y+t;
          g.fillStyle=col[1]; g.beginPath(); g.moveTo(cx,cy-4); g.lineTo(cx+4,cy); g.lineTo(cx,cy+4); g.lineTo(cx-4,cy); g.closePath(); g.fill();
          g.fillStyle=col[0]; g.beginPath(); g.moveTo(cx,cy-3); g.lineTo(cx+3,cy); g.lineTo(cx,cy+3); g.lineTo(cx-3,cy); g.closePath(); g.fill(); } }
      if(C.ends.l) sill(0,0,8,h); if(C.ends.r) sill(w-8,0,8,h); if(C.ends.t) sill(0,0,w,8); if(C.ends.b) sill(0,h-8,w,8);
    });
  }
  function waterCanvas(sc,ctx,C){
    var key='d2c_water_'+ctx.key+'_'+C.c.id;
    try{ if(!sc.textures.exists(key)) sc.textures.createCanvas(key,C.w,C.h); }catch(e){}
    C.tk=key; return key;
  }
  function paintWater(sc,C){
    var t=null; try{ t=sc.textures.get(C.tk); }catch(e){} if(!t||!t.getContext) return;
    var g=t.getContext(), w=C.w, h=C.h, L=C.horiz?w:h, lv=Math.max(0,Math.min(1,C.level));
    try{
      g.clearRect(0,0,w,h);
      if(C.wet>0.01){ g.fillStyle='rgba(38,46,24,'+(0.42*C.wet)+')'; g.fillRect(0,0,w,h); }
      if(lv>0.001){
        // the water body covers [a,b) along the walkway: filling grows from the inlet, draining recedes toward the outlet
        var span=lv*L, a, b;
        if(C.mode==='fill') { a=C.inletLow?0:L-span; } else { a=C.inletLow?L-span:0; }
        b=a+span;
        var rx=C.horiz?a:0, ry=C.horiz?0:a, rw=C.horiz?span:w, rh=C.horiz?h:span;
        var pat=C.pat||(C.pat=(function(){ try{ var src=sc.textures.get('d2c_wpat').getSourceImage(); return g.createPattern(src,'repeat'); }catch(e){ return null; } })());
        g.save(); g.beginPath(); g.rect(rx,ry,rw,rh); g.clip();
        g.fillStyle='#2a8aa6'; g.fillRect(rx,ry,rw,rh);
        if(pat){ var o=C.off%64; g.translate(C.horiz?o:0,C.horiz?0:o); g.fillStyle=pat; g.fillRect(rx-64,ry-64,rw+128,rh+128); g.setTransform(1,0,0,1,0,0); }
        // depth: dark under the wall faces, light along the far bank
        var gr=C.horiz?g.createLinearGradient(0,0,0,h):g.createLinearGradient(0,0,w,0);
        gr.addColorStop(0,'rgba(8,40,60,0.55)'); gr.addColorStop(0.22,'rgba(8,40,60,0.0)'); gr.addColorStop(0.85,'rgba(180,235,245,0.0)'); gr.addColorStop(1,'rgba(180,235,245,0.28)');
        g.fillStyle=gr; g.fillRect(rx,ry,rw,rh);
        g.restore();
        // foam: along the sills, and on the moving edge while it fills or drains
        g.fillStyle='rgba(235,252,255,0.55)';
        if(C.horiz){ if(C.ends.l&&a<1) g.fillRect(0,0,2,h); if(C.ends.r&&b>w-1) g.fillRect(w-2,0,2,h);
          if(lv<0.999){ var e=(C.mode==='fill')===C.inletLow?b:a; for(var yy=0;yy<h;yy+=6){ g.fillRect(e-2+((yy/6)%2)*2,yy,3,4); } } }
        else { if(C.ends.t&&a<1) g.fillRect(0,0,w,2); if(C.ends.b&&b>h-1) g.fillRect(0,h-2,w,2);
          if(lv<0.999){ var e2=(C.mode==='fill')===C.inletLow?b:a; for(var xx=0;xx<w;xx+=6){ g.fillRect(xx,e2-2+((xx/6)%2)*2,4,3); } } }
      }
      t.refresh();
    }catch(e){}
  }
  function visible(sc,C){ try{ var v=sc.cameras.main.worldView; return C.x0<v.x+v.width && C.x0+C.w>v.x && C.y0<v.y+v.height && C.y0+C.h>v.y; }catch(e){ return true; } }

  K.ready(function(K,D){ D.register('sluice-wheels',{
    load:function(ctx){
      var sc=ctx.scene, st=ctx.state, mech=ctx.mechanic||{}, i;
      st.Md=model(ctx); st.ch=[]; st.wheels=[]; st.mimics=[]; st.sort=[]; st.seq=null; st.focus=null; st.age=0; st.checked=false; st.alive=true; st.wetPush=0;
      texPattern(sc);
      var chans=mech.channels||[];
      for(i=0;i<chans.length;i++){ var C=build(ctx,chans[i],st.Md);
        C.bed=K.img(ctx,bedTex(sc,ctx,C),C.x0,C.y0,2.05); try{ C.bed.setOrigin(0,0); }catch(e){}
        waterCanvas(sc,ctx,C); C.img=K.img(ctx,C.tk,C.x0,C.y0,2.1); try{ C.img.setOrigin(0,0); }catch(e){}
        C.level=flooded(ctx,C.c)?1:0; C.mode='fill'; paintWater(sc,C); st.ch.push(C); }
      var ws=mech.wheels||[];
      for(i=0;i<ws.length;i++){ var w=ws[i], px=w.at[0]*TILE+TILE/2, by=(w.at[1]+1)*TILE-4;
        var base=K.img(ctx,texHousing(sc),px,by+2,9.4); try{ base.setOrigin(0.5,1); }catch(e){} base.__by=by;
        var wi=K.img(ctx,texWheel(sc,w.id),px,by-30,9.41); wi.__by=by; try{ wi.setRotation(turned(ctx,w.id)?Math.PI:0); }catch(e){}
        st.wheels.push({id:w.id, x:w.at[0], y:w.at[1], channels:w.channels||[], base:base, img:wi}); st.sort.push(base, wi); }
      var mm=ctx.plan.mech||[];
      for(i=0;i<mm.length;i++){ if(mm[i].kind!=='mimic') continue; var a=mm[i];
        st.mimics.push({x:a.x, y:a.y, sprung:K.get(ctx,'mimic.'+a.x+'.'+a.y), img:null, shade:null}); }
    },
    unload:function(ctx){ ctx.state.alive=false; ctx.state.focus=null; },
    _apply:function(ctx,W,opts){                           // flip wheel W: flags now, pictures and camera by sequence
      var st=ctx.state, sc=ctx.scene, i, steps=[], so=K.soles(ctx), first=!st.turnedHere;
      K.set(ctx,'wheel'+W.id,!turned(ctx,W.id)); st.turnedHere=true;
      var tgt=turned(ctx,W.id)?Math.PI:0;
      try{ sc.tweens.add({targets:W.img, rotation:W.img.rotation+Math.PI, duration:900, ease:'Sine.easeInOut', onComplete:function(){ try{ W.img.setRotation(tgt); }catch(e){} }}); }catch(e){ try{ W.img.setRotation(tgt); }catch(e2){} }
      var order=st.ch.filter(function(C){ return C.c.wheel===W.id; });
      order.sort(function(a,b){ return Math.hypot(a.x0+a.w/2-so.x,a.y0+a.h/2-so.y)-Math.hypot(b.x0+b.w/2-so.x,b.y0+b.h/2-so.y); });
      steps.push({kind:'spin', ms:450});
      var drained=0;
      for(i=0;i<order.length;i++){ var C=order[i], fl=flooded(ctx,C.c); if(!fl) drained++;
        steps.push({kind:'ch', C:C, fill:fl, pan:visible(sc,C)?0:450, ms:850}); }
      steps.push({kind:'back', ms:visible(sc,{x0:so.x-1,y0:so.y-1,w:2,h:2})&&!steps.some(function(s){ return s.pan; })?150:450});
      var line=null;
      if(opts&&opts.line) line=opts.line;
      else if(order.length===1 && drained===1 && !(ctx.bossDown&&ctx.bossDown()) && ctx.plan.assets.some(function(a){ return a.kind==='boss'; })) line='oasis.moat';
      else if(first) line='oasis.turn';
      st.seq={steps:steps, i:0, t:0, line:line};
      K.sfx('door');
    },
    _turn:function(ctx,W){
      var st=ctx.state, so=K.soles(ctx), i;
      if(st.seq||ctx.busy()) return;
      for(i=0;i<st.ch.length;i++){ var C=st.ch[i]; if(C.c.wheel!==W.id || flooded(ctx,C.c)) continue;      // this one is about to flood
        if(inRect(so.x,so.y,C.c.rect,M+8)){ ctx.say(S('oasis.wet')); return; } }
      try{ var f=K.facing(so.x,so.y,W.x,W.y); var h=ctx.hero(); ctx.place(h.x,h.y,K.dirOf(f.dx,f.dy)); }catch(e){}
      this._apply(ctx,W,null);
    },
    _reset:function(ctx){                                  // back to the plan's start: every wheel unturned
      var st=ctx.state, so=K.soles(ctx), i, any=false;
      for(i=0;i<st.ch.length;i++){ var C=st.ch[i]; if(C.c.floodedAtStart && inRect(so.x,so.y,C.c.rect,M+8)) return false; }
      var steps=[{kind:'spin',ms:200}];
      for(i=0;i<st.wheels.length;i++){ var W=st.wheels[i]; if(!turned(ctx,W.id)) continue; any=true; K.set(ctx,'wheel'+W.id,false);
        try{ W.img.setRotation(0); }catch(e){} }
      if(!any) return false;
      var all=[]; for(i=0;i<st.ch.length;i++){ var C2=st.ch[i], want=C2.c.floodedAtStart?1:0; if((C2.level>0.5?1:0)!==want) all.push({C:C2, fill:!!want}); }
      steps.push({kind:'all', list:all, ms:1000});                // every channel at once, the camera stays on her
      st.seq={steps:steps, i:0, t:0, line:'oasis.reset'}; K.sfx('door');
      return true;
    },
    tick:function(ctx,dt){
      var st=ctx.state, sc=ctx.scene, i; if(!st.ch) return;
      dt=Math.min(dt||16,100); st.age+=dt;
      var h=ctx.hero(); if(h) K.ysort(st.sort,h.footY,10.2,9.4);
      // the mimics: the engine's own chest picture (shut until sprung, then open and empty)
      for(i=0;i<st.mimics.length;i++){ var Mi=st.mimics[i], nm=Mi.sprung?'chestOpen':'chest', tk=chestTex(sc,nm);
        if(!tk) continue;
        if(!Mi.shade){ Mi.shade=ctx.own(sc.add.ellipse(Mi.x*TILE+TILE/2,(Mi.y+1)*TILE-5,40,10,0x000000,0.3).setDepth(2.9)); }
        if(!Mi.img){ Mi.img=K.img(ctx,tk,Mi.x*TILE+TILE/2,(Mi.y+1)*TILE,9.4); try{ Mi.img.setOrigin(0.5,1); }catch(e){} Mi.img.__by=(Mi.y+1)*TILE-6; st.sort.push(Mi.img); }
        if(Mi.img.texture&&Mi.img.texture.key!==tk){ try{ Mi.img.setTexture(tk); }catch(e){} }
        try{ var s=1.12*TILE/(Mi.img.width||TILE); Mi.img.setScale(s); }catch(e){} }
      // the sequence: spin, visit each channel the wheel works, come back
      var q=st.seq;
      if(q){ var S0=q.steps[q.i]; q.t+=dt;
        if(S0.kind==='ch'){
          st.focus=[S0.C.x0+S0.C.w/2, S0.C.y0+S0.C.h/2];
          if(q.t>=S0.pan && !S0.started){ S0.started=true; var C=S0.C; C.mode=S0.fill?'fill':'drain'; C.from=C.level; C.to=S0.fill?1:0; C.t=0; C.dur=S0.ms-100; if(!S0.fill) C.wet=1; } }
        else if(S0.kind==='all'){ st.focus=null; if(!S0.started){ S0.started=true; for(var a=0;a<S0.list.length;a++){ var Ca=S0.list[a].C; Ca.mode=S0.list[a].fill?'fill':'drain'; Ca.from=Ca.level; Ca.to=S0.list[a].fill?1:0; Ca.t=0; Ca.dur=S0.ms-100; if(!S0.list[a].fill) Ca.wet=1; } } }
        else if(S0.kind==='back') st.focus=null;
        if(q.t>=(S0.pan||0)+S0.ms){ q.i++; q.t=0;
          if(q.i>=q.steps.length){ st.seq=null; st.focus=null; if(q.line){ ctx.say(S(q.line)); if(q.line==='oasis.moat'){ try{ sc.cameras.main.shake(500,0.006); }catch(e){} } } } } }
      // water: level animation, damp beds drying, the flow
      for(i=0;i<st.ch.length;i++){ var Cc=st.ch[i], dirty=false;
        if(Cc.dur>0){ Cc.t+=dt; var k=Math.min(1,Cc.t/Cc.dur), e=k<0.5?2*k*k:1-Math.pow(-2*k+2,2)/2; Cc.level=Cc.from+(Cc.to-Cc.from)*e; dirty=true; if(k>=1){ Cc.dur=0; Cc.level=Cc.to; } }
        else { var want=flooded(ctx,Cc.c)?1:0; if(!st.seq && Cc.level!==want){ Cc.level=want; Cc.mode=want?'fill':'drain'; dirty=true; } }
        if(Cc.wet>0 && Cc.level<0.5){ Cc.wet=Math.max(0,Cc.wet-dt/6000); if(((st.age/120)|0)!==(((st.age-dt)/120)|0)) dirty=true; }
        if(Cc.level>0){ Cc.off+=dt*0.012*(Cc.inletLow?1:-1); Cc.redraw-=dt; if(Cc.redraw<=0 && visible(sc,Cc)){ dirty=true; } }
        if(dirty){ Cc.redraw=90; paintWater(sc,Cc); } }
      // a mimic that sprang: its battle once the line is read
      if(st.mimicPending){ var P=st.mimicPending; P.t-=dt;
        if(P.t<=0 && !sc.showingMessage && !sc.isMoving && K.onField(ctx)){ P.tries=(P.tries||0)+1;
          if(ctx.battle('mimic',function(){}) || P.tries>120) st.mimicPending=null; } }
      // on arrival: is the way on still reachable from where she stands? (only a floor left by a lost battle is not)
      if(!st.checked && st.age>350 && !st.seq && !ctx.busy() && K.onField(ctx) && h){
        st.checked=true; var so=K.soles(ctx), s=startCell(st.Md,so), m=maskOf(ctx);
        st.reach=reach(st.Md,s,m);
        if(!st.reach){ st.didReset=this._reset(ctx); } }
      if(st.wetPush>0) st.wetPush=Math.max(0,st.wetPush-dt*0.5);
    },
    camera:function(ctx,tx,ty,cam){ var f=ctx.state.focus; if(!f) return null;
      var x=f[0]-cam.width*0.5, y=f[1]-cam.height*0.5;
      try{ if(cam.useBounds&&cam.clampX){ x=cam.clampX(x); y=cam.clampY(y); } }catch(e){}
      return {x:x,y:y}; },
    input:function(ctx){ if(ctx.state.seq||ctx.state.mimicPending) return null; },
    step:function(ctx){ if(ctx.state.seq||ctx.state.mimicPending) return false; },
    free:function(ctx,px,py){
      var st=ctx.state, i; if(!st.ch) return;
      for(i=0;i<st.wheels.length;i++) if(K.inCell(px,py,st.wheels[i].x,st.wheels[i].y,3)) return false;
      for(i=0;i<st.mimics.length;i++) if(!st.mimics[i].sprung && K.inCell(px,py,st.mimics[i].x,st.mimics[i].y,3)) return false;
      for(i=0;i<st.ch.length;i++){ var C=st.ch[i]; if(flooded(ctx,C.c) && inRect(px,py,C.c.rect,M)) return false; }
    },
    bump:function(ctx,tx,ty,dx,dy,tile,info){
      var st=ctx.state, i; if(!st.ch||st.seq) return;
      for(i=0;i<st.mimics.length;i++){ var Mi=st.mimics[i]; if(!Mi.sprung && Mi.x===tx && Mi.y===ty && !ctx.busy()){ this._spring(ctx,Mi); return true; } }
      var px=info?info.px:0, py=info?info.py:0;
      for(i=0;i<st.ch.length;i++){ var C=st.ch[i]; if(!flooded(ctx,C.c)) continue;
        if((tx>=C.c.rect[0]&&tx<=C.c.rect[2]&&ty>=C.c.rect[1]&&ty<=C.c.rect[3]) || (info && inRect(px+dx*20,py+dy*20,C.c.rect,0))){
          st.wetPush+=16;
          if(st.wetPush>700 && !st.saidDeep && !ctx.busy() && !ctx.scene.showingMessage){ st.saidDeep=true; ctx.say(S('oasis.deep')); }
          return false; } }
    },
    _spring:function(ctx,Mi){
      Mi.sprung=true; K.set(ctx,'mimic.'+Mi.x+'.'+Mi.y,true);
      try{ ctx.scene.cameras.main.shake(220,0.01); }catch(e){}
      ctx.say(ctx.Z('treasure.mimic')); ctx.state.mimicPending={t:300};
    },
    interact:function(ctx,px,py){
      var st=ctx.state; if(!st.ch||st.seq||st.mimicPending) return null;
      var self=this, W=K.nearest(px,py,st.wheels,16);
      if(W) return K.pill(px,py,W,S('verb.wheel'),function(){ self._turn(ctx,W); });
      var live=st.mimics.filter(function(m){ return !m.sprung; }), Mi=K.nearest(px,py,live,16);
      if(Mi) return K.pill(px,py,Mi,S('verb.open'),function(){ if(!Mi.sprung && !ctx.busy()) self._spring(ctx,Mi); });
      return null;
    },
    _debug:{ model:model, reach:reach, maskOf:maskOf, flooded:flooded, STR:STR, M:M }
  }); });
})();
