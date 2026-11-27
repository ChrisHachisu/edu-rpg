/* Dungeon looks, day 4 (2026-11-27): shared LOOK fixes for the painted dungeons. Registers no
   mechanic and changes no rule: nothing here blocks, moves, damages or saves anything.

   Loaded as one of the manifest's module scripts (export_runtime.py lists every .js in this
   folder), so it is present in every Acts 2-5 dungeon and in the four painted Act 1 dungeons.
   It runs once a frame after the scenes have updated (the game's 'poststep'), reads what the
   engine (public/dq-tiles.js) and the mechanic modules have drawn, and adds to it.

   What it draws, and the review findings it answers (autoloop/day4/critic/dungeons-{a,b,c}):
     1. MOUTH GLOW (DA-05, DB-10, DC-15). The floor pictures paint the way out as near-white
        daylight right up to the map's edge, and the camera shows black beyond it: a glare block
        ending in a ruler line. The engine's first answer (a2dGlareSetup: amber wash, edge band,
        spill over the void) left the line visible across most of the mouth. Here the paint is
        faded to dark over the last cell and a half, and ONE soft glow sits on the mouth: an egg
        of warm light centred on the edge, feathered to nothing in every direction, the same
        brightness on both sides of the edge. The engine's three glare images are hidden.
     2. MAP EDGE FADE (DC-09). On every floor the picture stops at the map's edge in a straight
        line (a wall band one or two cells deep, black below). The last cells of ROCK along all
        four edges now fade into the dark. The fade never reaches a walkable cell: its depth at
        each point is the run of closed cells there (at most 1.6 cells), eased along the edge.
     3. RIM LIGHT (DA-19, DC-19). A thin light rim on things a child must find that are dark on
        dark: the Castle knights and the Sunken Temple hunter (always, stronger outside her
        light), and Act 1's wall crystal and the Sunken Cellar plaque while they lie outside her
        light. The room is not made brighter.
     4. BOSS ON THE FIELD, alternative look (DA-06, DB-01, DC-16, DC-01). OFF by default.
        localStorage 'qok-boss-field' = 'art': the boss's own battle painting stands on the field
        in place of the smoke ball: about 1.6 hero heights, soft contact shadow, idle bob. It
        follows the engine's ball sprite frame by frame (position, depth, the defeat tween), so
        it sorts against her and vanishes exactly as the ball does.

   Switch: localStorage 'qok-d4-looks' = '0' turns 1-3 off (read once, when this file runs); the
   engine's and the modules' old drawing is then untouched. The boss switch is separate. */
(function(){
  'use strict';
  if(window.__QOK_D4LOOKS__) return;
  var TILE=48, FOGF=6, FOG_SOFT=16;                          // dq-tiles.js updateFog: 6 screen px per fog px, falloff 16 fog px each side of the radius
  function ls(k){ try{ return window.localStorage.getItem(k); }catch(e){ return null; } }
  var ON=ls('qok-d4-looks')!=='0', BOSS_ART=ls('qok-boss-field')==='art';
  var LINEAR=(window.Phaser&&Phaser.Textures&&Phaser.Textures.FilterMode)?Phaser.Textures.FilterMode.LINEAR:0;
  var S={ scene:null, key:null, ctx:null, objs:[], glare:[], mouths:[], edges:0, rims:[], boss:{}, frame:0, plaque:null, err:null };

  function alive(o){ return !!(o && o.scene && o.active!==false); }
  function kill(o){ try{ if(o&&o.destroy) o.destroy(); }catch(e){} }
  function smooth(t){ t=t<0?0:(t>1?1:t); return t*t*(3-2*t); }
  // how dark her lamp leaves a world point: 0 in her light, 1 in the dark (the engine's own falloff)
  function fogT(sc,x,y){
    var h=sc.hero; if(!h) return 0;
    var z=1; try{ z=sc.cameras.main.zoom||1; }catch(e){}
    var R=(typeof window.__DQ_FOG_R__==='number')?window.__DQ_FOG_R__:34;
    var dx=(x-h.x)*z/FOGF, dy=(y-h.y)*z/FOGF;
    return smooth((Math.sqrt(dx*dx+dy*dy)-(R-FOG_SOFT))/(2*FOG_SOFT));
  }
  function canvasTex(sc,key,w,h,draw){
    if(sc.textures.exists(key)) return key;
    try{ var ct=sc.textures.createCanvas(key,w,h); if(!ct) return null; draw(ct.context,w,h); ct.refresh(); try{ ct.setFilter(LINEAR); }catch(e){} return key; }catch(e){ S.err='tex '+key+' '+e; return null; }
  }

  // ---- 2. the map's edge fades into the dark ----------------------------------------------------
  var EDGE_MAX=1.6*TILE, EDGE_S=4;                           // deepest fade (world px); world px per texel
  function closedRun(fl,side,i){                             // closed cells from the edge inward at position i along it (0..3)
    var W=fl.width, H=fl.height, rows=fl.rows, n, x, y, r;
    for(n=0;n<3;n++){
      if(side==='down'){ x=i; y=H-1-n; } else if(side==='up'){ x=i; y=n; } else if(side==='left'){ x=n; y=i; } else { x=W-1-n; y=i; }
      r=rows[y]; if(r && r.charAt(x)==='.') break;
    }
    return n;
  }
  function edgeDepths(fl,side,mouthSpans){                   // fade depth (world px) per cell along one edge
    var L=(side==='down'||side==='up')?fl.width:fl.height, d=[], i, j, n;
    for(i=0;i<L;i++){ n=closedRun(fl,side,i); d.push(n>=2?EDGE_MAX:(n===1?TILE-8:0)); }
    for(j=0;j<mouthSpans.length;j++){ var m=mouthSpans[j]; if(m.side!==side) continue;      // the mouth's own corridor fades too: the glow carries the light there
      for(i=Math.max(0,m.a0-1);i<=Math.min(L-1,m.a1+1);i++) d[i]=EDGE_MAX; }
    return d;
  }
  function edgeTex(sc,key,fl,side,depths){
    var vert=(side==='down'||side==='up'), L=depths.length, la=Math.ceil(L*TILE/EDGE_S), ld=Math.ceil(EDGE_MAX/EDGE_S);
    var w=vert?la:ld, h=vert?ld:la, tk='d4edge_'+key+'_'+side;
    return canvasTex(sc,tk,w,h,function(g){
      var im=g.createImageData(w,h), px=im.data, a, q, c, i0, f, d0, d1, dep, dist, e, al, x, y, o;
      for(a=0;a<la;a++){
        c=((a+0.5)*EDGE_S)/TILE-0.5; i0=Math.floor(c); f=smooth(c-i0);
        d0=depths[Math.max(0,Math.min(L-1,i0))]; d1=depths[Math.max(0,Math.min(L-1,i0+1))]; dep=d0+(d1-d0)*f;
        for(q=0;q<ld;q++){                                   // q counts texels from the edge inward
          dist=(q+0.5)*EDGE_S; e=dep>1?1-dist/dep:0; al=e<=0?0:smooth(e);
          if(side==='down'){ x=a; y=ld-1-q; } else if(side==='up'){ x=a; y=q; } else if(side==='left'){ x=q; y=a; } else { x=ld-1-q; y=a; }
          o=(y*w+x)*4; px[o]=4; px[o+1]=4; px[o+2]=8; px[o+3]=Math.round(al*255);
        }
      }
      g.putImageData(im,0,0);
    });
  }
  // ---- 1. the mouth: one soft glow ---------------------------------------------------------------
  // The glow's heart sits a little INSIDE the edge (on the floor she walks, as Act 1's does), reaches
  // GLOW_IN cells inward and GLOW_OUT cells past the edge, and is a round-cornered pool rather than
  // a ball (a 2.6-power ellipse), so it fills the corridor's width and still has no straight side.
  var GLOW_IN=3.0, GLOW_OUT=1.15, GLOW_PAD=1.4, GLOW_C=0.45, GLOW_S=2;   // cells inward / outward of the edge; to each side of the mouth; heart inside the edge; world px per texel
  function glowTex(sc,cells){
    var key='d4mouth_w'+cells, W=Math.round((cells+2*GLOW_PAD)*TILE/GLOW_S), H=Math.round((GLOW_IN+GLOW_OUT)*TILE/GLOW_S);
    return canvasTex(sc,key,W,H,function(g){                 // built for a mouth that faces DOWN: the map's edge is the row at GLOW_IN cells
      var im=g.createImageData(W,H), px=im.data, cx=W/2, cy=(GLOW_IN-GLOW_C)*TILE/GLOW_S, rx=(cells/2+0.9)*TILE/GLOW_S, x, y, o, u, v, r, a, t;
      var ri=(GLOW_IN-GLOW_C)*TILE/GLOW_S, ro=(GLOW_OUT+GLOW_C)*TILE/GLOW_S;
      var C=[[255,246,226],[249,218,166],[208,150,94],[150,102,64]];               // warm daylight: cream core, amber, dusk at the rim (never pure white)
      for(y=0;y<H;y++) for(x=0;x<W;x++){
        u=Math.abs(x+0.5-cx)/rx; v=Math.abs(y+0.5-cy)/(y+0.5<cy?ri:ro); r=Math.pow(Math.pow(u,2.6)+Math.pow(v,2.6),1/2.6);
        o=(y*W+x)*4; if(r>=1){ px[o+3]=0; continue; }
        a=Math.pow(1-smooth(r),0.9)*0.95;
        t=r*3; var k=Math.min(2,Math.floor(t)), f=t-k, c0=C[k], c1=C[k+1];
        px[o]=Math.round(c0[0]+(c1[0]-c0[0])*f); px[o+1]=Math.round(c0[1]+(c1[1]-c0[1])*f); px[o+2]=Math.round(c0[2]+(c1[2]-c0[2])*f); px[o+3]=Math.round(a*255);
      }
      g.putImageData(im,0,0);
    });
  }
  function mouthGroups(fl,bossDown){                         // the mouths that open on the map's edge, one entry per side
    var a=fl.assets||[], by={}, out=[], i, k, W=fl.width, H=fl.height;
    for(i=0;i<a.length;i++){ var m=a[i];
      if(m.kind!=='mouth' && m.kind!=='mouth2') continue;
      if(m.kind==='mouth2' && m.sealedUntil==='bossDefeated' && !bossDown) continue;    // a rock fall stands in it: no daylight
      k=m.side||'down'; if(k==='south') k='down'; if(k==='north') k='up'; if(k==='west') k='left'; if(k==='east') k='right';
      var dist=(k==='down')?H-1-m.y:(k==='up')?m.y:(k==='left')?m.x:W-1-m.x;
      if(dist>1) continue;                                   // a mouth deep inside the map is a painted bay, not an edge
      (by[k]=by[k]||[]).push(m); }
    for(k in by){ var c=by[k], lo=1e9, hi=-1e9, vert=(k==='down'||k==='up');
      for(i=0;i<c.length;i++){ var v=vert?c[i].x:c[i].y; if(v<lo) lo=v; if(v>hi) hi=v; }
      out.push({side:k,a0:lo,a1:hi,n:hi-lo+1}); }
    return out;
  }
  function buildFloor(sc,ctx,key){
    var fl=ctx.plan; if(!fl||!fl.rows||!fl.width) return;
    var W=fl.width*TILE, H=fl.height*TILE, bossDown=false, i;
    try{ bossDown=!!ctx.bossDown(); }catch(e){}
    var groups=mouthGroups(fl,bossDown), sides=['down','up','left','right'];
    S.mouths=groups; S.edges=0;
    for(i=0;i<4;i++){ var side=sides[i], dep=edgeDepths(fl,side,groups), tk=edgeTex(sc,key+(bossDown?'b':''),fl,side,dep); if(!tk) continue;
      var vert=(side==='down'||side==='up'), im=sc.add.image(0,0,tk).setDepth(2.45);
      if(side==='down') im.setOrigin(0,1).setPosition(0,H).setDisplaySize(W,EDGE_MAX);
      else if(side==='up') im.setOrigin(0,0).setPosition(0,0).setDisplaySize(W,EDGE_MAX);
      else if(side==='left') im.setOrigin(0,0).setPosition(0,0).setDisplaySize(EDGE_MAX,H);
      else im.setOrigin(1,0).setPosition(W,0).setDisplaySize(EDGE_MAX,H);
      im.__d4='edge:'+side; S.objs.push(im); S.edges++; }
    for(i=0;i<groups.length;i++){ var G=groups[i], gk=glowTex(sc,G.n); if(!gk) continue;
      var mid=(G.a0+G.a1+1)/2*TILE, px, py, rot;
      if(G.side==='down'){ px=mid; py=H; rot=0; } else if(G.side==='up'){ px=mid; py=0; rot=Math.PI; }
      else if(G.side==='left'){ px=0; py=mid; rot=Math.PI/2; } else { px=W; py=mid; rot=-Math.PI/2; }
      var gi=sc.add.image(px,py,gk).setOrigin(0.5,GLOW_IN/(GLOW_IN+GLOW_OUT)).setRotation(rot).setDepth(2.47);
      gi.setDisplaySize((G.n+2*GLOW_PAD)*TILE,(GLOW_IN+GLOW_OUT)*TILE);
      gi.__d4='mouth:'+G.side; G.img=gi; G.x=px; G.y=py; S.objs.push(gi); }
  }
  function hideEngineGlare(sc){                              // dq-tiles.js a2dGlareSetup: wash, edge, spill
    var l=sc.children&&sc.children.list, i; if(!l) return;
    S.glare=[];
    for(i=0;i<l.length;i++){ var o=l[i]; if(o && o.__a2dGlare){ S.glare.push(o); if(o.visible) o.setVisible(false); } }
  }

  // ---- 3. rim light ------------------------------------------------------------------------------
  // A ring just outside a sprite's silhouette, brighter toward its top (light from above). Built
  // once per texture from the picture's own alpha; white, tinted by the caller.
  function rimTex(sc,srcKey,frameName,outH,r){
    var key='d4rim_'+srcKey+'_'+outH;
    var tex=sc.textures.get(srcKey); if(!tex || tex.key==='__MISSING') return null;
    var fr=tex.get(frameName), src=fr&&fr.source&&fr.source.image; if(!src) return null;
    var sw=fr.cutWidth, sh=fr.cutHeight; if(!sw||!sh) return null;
    var h=outH, w=Math.max(2,Math.round(sw*outH/sh)), P=Math.ceil(r)+2;
    var k=canvasTex(sc,key,w+2*P,h+2*P,function(g){
      g.imageSmoothingEnabled=true;
      for(var a=0;a<12;a++) g.drawImage(src,fr.cutX,fr.cutY,sw,sh,P+Math.cos(a*Math.PI/6)*r,P+Math.sin(a*Math.PI/6)*r,w,h);
      g.globalCompositeOperation='source-in'; g.fillStyle='#ffffff'; g.fillRect(0,0,w+2*P,h+2*P);
      g.globalCompositeOperation='destination-in';
      var lg=g.createLinearGradient(0,P,0,P+h); lg.addColorStop(0,'rgba(0,0,0,1)'); lg.addColorStop(0.55,'rgba(0,0,0,0.8)'); lg.addColorStop(1,'rgba(0,0,0,0.38)');
      g.fillStyle=lg; g.fillRect(0,0,w+2*P,h+2*P);
      g.globalCompositeOperation='destination-out'; g.drawImage(src,fr.cutX,fr.cutY,sw,sh,P,P,w,h);
      g.globalCompositeOperation='source-over';
    });
    return k?{key:k,w:w,h:h,P:P}:null;
  }
  // target: a live sprite. mode 'over' = the sprite is drawn above her lamp's darkness (an enemy):
  // the rim is always on, stronger in the dark. mode 'under' = it lies under the darkness: the rim
  // is drawn above it and only where the dark hides the thing itself.
  function rimFor(sc,target,kind,color,base,mode){
    if(!alive(target) || !target.texture) return;
    var e=target.__d4rim;
    if(e && alive(e.img) && e.tex===target.texture.key) return;
    if(e) kill(e.img);
    var dh=target.displayHeight||0; if(dh<8) return;
    var R=rimTex(sc,target.texture.key,target.frame&&target.frame.name,Math.max(24,Math.round(dh*2)),2.4); if(!R) return;
    var img=sc.add.image(target.x,target.y,R.key).setTint(color).setAlpha(0);
    e=target.__d4rim={img:img,tex:target.texture.key,R:R,kind:kind,base:base,mode:mode,target:target};
    img.__d4='rim:'+kind; S.rims.push(e);
  }
  function rimsTick(sc){
    for(var i=S.rims.length-1;i>=0;i--){ var e=S.rims[i], t=e.target, im=e.img;
      if(!alive(t) || !alive(im)){ kill(im); if(t) t.__d4rim=null; S.rims.splice(i,1); continue; }
      if(e.fixed){ var dk=fogT(sc,im.x,im.y); im.setAlpha(e.base*dk).setVisible(dk>0.03); e.alpha=im.alpha; continue; }
      var R=e.R, k=(t.displayHeight||1)/R.h, fx=t.flipX?-1:1;
      var ox=t.originX, oy=t.originY; if(t.flipX) ox=1-ox;
      im.setOrigin((R.P+ox*R.w)/(R.w+2*R.P),(R.P+oy*R.h)/(R.h+2*R.P)).setPosition(t.x,t.y).setScale(k*fx,k).setRotation(t.rotation||0);
      var cy=t.y-(t.originY-0.5)*(t.displayHeight||0), dark=fogT(sc,t.x,cy), a;
      if(e.mode==='over'){ a=e.base*(0.5+0.5*dark)*(t.alpha===undefined?1:t.alpha); im.setDepth(t.depth+0.004); }
      else { a=e.base*dark; im.setDepth(8.05); }
      im.setAlpha(a).setVisible(!!t.visible && a>0.02); e.alpha=a;
    }
  }
  // The Sunken Cellar B1F plaque is PAINTED into the floor picture (sunkenCellar-f1-props.png), so
  // there is no sprite to take a silhouette from: its frame, measured on the picture, is the
  // rectangle x 1005..1058, y 1012..1047 (world px). The rim is that rectangle's outline.
  var PLAQUES={ 'sunkenCellar-f1':{x0:1005,y0:1012,x1:1058,y1:1047} };
  function plaqueRim(sc,key){
    var p=PLAQUES[key]; if(!p) return;
    var w=(p.x1-p.x0)*2, h=(p.y1-p.y0)*2, P=5;
    var tk=canvasTex(sc,'d4plaque_'+key,w+2*P,h+2*P,function(g){
      var lg=g.createLinearGradient(0,P,0,P+h); lg.addColorStop(0,'rgba(255,255,255,1)'); lg.addColorStop(0.55,'rgba(255,255,255,0.8)'); lg.addColorStop(1,'rgba(255,255,255,0.4)');
      g.strokeStyle=lg; g.lineWidth=2.6; g.lineJoin='round'; g.strokeRect(P-0.5,P-0.5,w+1,h+1);
      g.globalAlpha=0.35; g.lineWidth=1.4; g.beginPath(); g.moveTo(P+9,P+h*0.36); g.lineTo(P+w-9,P+h*0.36); g.moveTo(P+9,P+h*0.64); g.lineTo(P+w-9,P+h*0.64); g.stroke(); g.globalAlpha=1;   // the two carved lines of text, faintly
    }); if(!tk) return;
    var im=sc.add.image((p.x0+p.x1)/2,(p.y0+p.y1)/2,tk).setScale(0.5).setTint(0xd9e6f2).setDepth(8.05).setAlpha(0);
    im.__d4='rim:plaque'; S.objs.push(im);
    S.rims.push({img:im,target:im,fixed:true,kind:'plaque',base:0.62});
  }
  function findRimTargets(sc,ctx){
    var st=ctx&&ctx.state, id=ctx&&ctx.mechanic&&ctx.mechanic.id, k;
    try{
      if(id==='maze-hunter' && st && st.spr && st.spr.body) rimFor(sc,st.spr.body,'hunter',0x9ff5e8,0.85,'over');
      if(id==='mirror-rooms' && st && st.spr && st.spr.knights) for(k in st.spr.knights){ var o=st.spr.knights[k]; if(o&&o.body) rimFor(sc,o.body,'knight',0xcfd6ff,0.8,'over'); }
    }catch(e){ S.err='rim '+e; }
    if(!ctx && A1BOSS[sc.currentMapId] && (sc.currentFloor||1)===1 && (S.frame%20)===1){   // a painted Act 1 dungeon, B1F: the wall crystal is the engine's live sprite
      var l=sc.children&&sc.children.list, i;
      for(i=0;l&&i<l.length;i++){ var c=l[i]; if(c && c.texture && c.texture.key==='a1dasset_entrance-crystal-dormant' && c.visible) rimFor(sc,c,'crystal',0xa9d4ff,0.7,'under'); }
    }
  }

  // ---- 4. the boss on the field: its own battle painting (qok-boss-field=art) -------------------
  var A1BOSS={ sunkenCellar:'giantCrab', coastalReef:'coralTitan', mistyGrotto:'giantToad', whisperingWoodsCave:'mosswarden' };
  var BALL_TEX='a1dasset_boss', BALL_SCALE=2.2, ART_H=256, ART_HEROES=1.6, bossReq={};
  function bossIdFor(sc){
    var id=sc.currentMapId, D=window.__QOK_DNG2__, m=null; try{ m=D&&D.manifest&&D.manifest(); }catch(e){}
    var d=m&&m.dungeons&&m.dungeons[id]; return (d&&d.bossId)||A1BOSS[id]||null;
  }
  function bossTex(sc,bossId){                               // the battle painting, cropped to the figure, 256 texels tall
    var key='d4boss_'+bossId; if(sc.textures.exists(key)) return key;
    if(bossReq[bossId]) return null; bossReq[bossId]=1;
    var im=new Image();
    im.onload=function(){ try{
      if(sc.textures.exists(key)) return;
      var pw=256, ph=Math.max(1,Math.round(im.height*pw/im.width)), pc=document.createElement('canvas'); pc.width=pw; pc.height=ph;
      var pg=pc.getContext('2d'); pg.drawImage(im,0,0,pw,ph);
      var d=pg.getImageData(0,0,pw,ph).data, x0=pw, y0=ph, x1=-1, y1=-1, x, y;
      for(y=0;y<ph;y++) for(x=0;x<pw;x++) if(d[(y*pw+x)*4+3]>24){ if(x<x0) x0=x; if(x>x1) x1=x; if(y<y0) y0=y; if(y>y1) y1=y; }
      if(x1<x0){ x0=0; y0=0; x1=pw-1; y1=ph-1; }
      var k=im.width/pw, bx=Math.max(0,x0*k-2), by=Math.max(0,y0*k-2), bw=Math.min(im.width-bx,(x1-x0+1)*k+4), bh=Math.min(im.height-by,(y1-y0+1)*k+4);
      var w=Math.max(2,Math.round(bw*ART_H/bh));
      var mid=document.createElement('canvas'); mid.width=w*2; mid.height=ART_H*2;          // two halvings: a clean reduction on every browser
      var mg=mid.getContext('2d'); mg.imageSmoothingEnabled=true; try{ mg.imageSmoothingQuality='high'; }catch(e){}
      mg.drawImage(im,bx,by,bw,bh,0,0,w*2,ART_H*2);
      var ct=sc.textures.createCanvas(key,w,ART_H), g=ct.context; g.imageSmoothingEnabled=true; try{ g.imageSmoothingQuality='high'; }catch(e){}
      g.drawImage(mid,0,0,w*2,ART_H*2,0,0,w,ART_H); ct.refresh(); try{ ct.setFilter(LINEAR); }catch(e){}
    }catch(e){ S.err='boss art '+e; bossReq[bossId]=0; } };
    im.onerror=function(){ setTimeout(function(){ bossReq[bossId]=0; },5000); };
    im.src='assets/monsters-hd/monster-'+bossId+'.webp';
    return null;
  }
  function shadowTex(sc){ return canvasTex(sc,'d4boss_shadow',128,44,function(g){
    g.save(); g.translate(64,22); g.scale(1,22/64);
    var gr=g.createRadialGradient(0,0,4,0,0,64); gr.addColorStop(0,'rgba(0,0,0,0.60)'); gr.addColorStop(0.55,'rgba(0,0,0,0.34)'); gr.addColorStop(1,'rgba(0,0,0,0)');
    g.fillStyle=gr; g.beginPath(); g.arc(0,0,64,0,Math.PI*2); g.fill(); g.restore();
  }); }
  function heroHeight(sc){ var h=sc.hero, v=h&&h.displayHeight; return (v&&v>20&&v<120)?v:52; }
  function bossTick(sc){
    var B=S.boss, l=sc.children&&sc.children.list, i, balls=[], bossId=bossIdFor(sc);
    for(i=0;bossId&&l&&i<l.length;i++){ var o=l[i]; if(o && o.texture && o.texture.key===BALL_TEX && o.type==='Image' && o.originY===1) balls.push(o); }
    for(var k in B){ var e=B[k]; if(!alive(e.ball)){ kill(e.art); kill(e.shadow); delete B[k]; } }   // the ball went: so does the painting, and its shadow with it
    if(!balls.length) return;
    var tk=bossTex(sc,bossId), sk=shadowTex(sc); if(!tk||!sk) return;                         // still loading: the ball stays
    for(i=0;i<balls.length;i++){ var b=balls[i], id=b.__d4id||(b.__d4id='b'+(++bossTick.n)), f=B[id];
      if(!f){
        var hh=heroHeight(sc)*ART_HEROES, art=sc.add.image(b.x,b.y,tk).setOrigin(0.5,1), sh=sc.add.image(b.x,b.y,sk).setOrigin(0.5,0.5).setDepth(3.05);
        var s0=hh/ART_H; art.__d4='boss:art'; sh.__d4='boss:shadow';
        f=B[id]={ball:b,art:art,shadow:sh,s0:s0,y0:b.y,sw:Math.max(40,art.width*s0*0.78),t0:Date.now(),bossId:bossId,h:hh};
      }
      if(b.visible) b.setVisible(false);                                                     // the painting stands in for it; the ball still carries depth and the defeat tween
      var rel=(b.scaleX||BALL_SCALE)/BALL_SCALE, live=b.depth>5, t=(Date.now()-f.t0)/1000;
      var bob=live?Math.sin(t*2.4)*1.6:0, breathe=live?1+0.012*Math.sin(t*2.4+0.9):1;
      f.art.setPosition(b.x,b.y-3+bob).setScale(f.s0*rel,f.s0*rel*breathe).setAngle(b.angle||0).setAlpha(b.alpha).setDepth(b.depth);
      f.shadow.setPosition(b.x,f.y0-5).setDisplaySize(f.sw*rel*(1-bob*0.012),f.sw*rel*0.30).setAlpha(0.9*b.alpha*Math.min(1,rel));
    }
  }
  bossTick.n=0;

  // ---- the frame ----------------------------------------------------------------------------------
  function drop(){
    for(var i=0;i<S.objs.length;i++) kill(S.objs[i]);
    for(i=0;i<S.rims.length;i++){ kill(S.rims[i].img); if(S.rims[i].target) S.rims[i].target.__d4rim=null; }
    for(i=0;i<S.glare.length;i++){ try{ if(alive(S.glare[i])) S.glare[i].setVisible(true); }catch(e){} }
    S.objs=[]; S.rims=[]; S.glare=[]; S.mouths=[]; S.edges=0;
  }
  function frame(){
    var g=window.__PHASER_GAME__, sc=null, D=window.__QOK_DNG2__;
    try{ sc=g.scene.getScene('WorldMapScene'); if(!sc || !g.scene.isActive('WorldMapScene') || !sc.hero || !sc.mapData) sc=null; }catch(e){ sc=null; }
    if(!sc) return;
    S.frame++;
    var id=sc.currentMapId, key=id+'-f'+(sc.currentFloor||1), ctx=null;
    try{ ctx=D&&D.ctx&&D.ctx(); if(ctx && (ctx.scene!==sc || ctx.key!==key)) ctx=null; }catch(e){ ctx=null; }
    if(ON){
      if(S.scene!==sc || S.key!==key || S.ctx!==ctx){
        drop(); S.scene=sc; S.key=key; S.ctx=ctx;
        try{ if(ctx){ buildFloor(sc,ctx,key); hideEngineGlare(sc); } else plaqueRim(sc,key); }catch(e){ S.err='build '+e; }
      }
      if(ctx && (S.frame%30)===0){ try{ hideEngineGlare(sc); }catch(e){} }
      try{ findRimTargets(sc,ctx); rimsTick(sc); }catch(e){ S.err='rims '+e; }
    }
    if(BOSS_ART){ try{ bossTick(sc); }catch(e){ S.err='boss '+e; } }
  }
  function boot(){
    var g=window.__PHASER_GAME__;
    if(!g || !g.events || !g.scene){ setTimeout(boot,250); return; }
    g.events.on('poststep',frame);
  }
  window.__QOK_D4LOOKS__={ version:1, on:ON, bossArt:BOSS_ART, fogT:fogT, rimTex:rimTex,
    state:function(){ var b=[], k; for(k in S.boss){ var f=S.boss[k]; b.push({bossId:f.bossId,ballVisible:!!f.ball.visible,ballDepth:f.ball.depth,artDepth:f.art.depth,artAlpha:f.art.alpha,
        artH:Math.round(f.art.displayHeight),artW:Math.round(f.art.displayWidth),x:f.art.x,y:f.art.y,shadowAlpha:f.shadow.alpha,shadowW:Math.round(f.shadow.displayWidth)}); }
      return { on:ON, bossArt:BOSS_ART, key:S.key, authored:!!S.ctx, edges:S.edges, err:S.err,
        mouths:S.mouths.map(function(m){ return {side:m.side,n:m.n,x:m.x,y:m.y,w:m.img?m.img.displayWidth:0,h:m.img?m.img.displayHeight:0,depth:m.img?m.img.depth:null}; }),
        engineGlare:S.glare.map(function(o){ return {tag:o.__a2dGlare,visible:!!o.visible}; }),
        rims:S.rims.map(function(e){ return {kind:e.kind,alpha:+(e.img.alpha||0).toFixed(3),visible:!!e.img.visible,depth:e.img.depth}; }),
        boss:b }; } };
  boot();
})();
