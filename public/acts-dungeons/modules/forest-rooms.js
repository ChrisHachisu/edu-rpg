/* Haunted Forest: nine rooms (mechanic id `forest-rooms`).

   One floor of 60 x 45 cells is nine rooms of params.roomTiles (20 x 15) with tree walls two
   cells thick between them and a three-cell path through each gap (mechanic.exits). The camera
   stays inside the room she is in; when she walks through a gap it slides across to the next
   room (she keeps walking through the gap while it slides) and stays there. What lies outside
   the room is deep forest: dark. No stairs and no lights: the bundle's five generated floors
   and its fog are not used.

   Nothing to persist: the room is where she stands. */
(function boot(){
  'use strict';
  var K=window.__QOK_D2KIT_A__; if(!K){ setTimeout(boot,40); return; }
  var TILE=K.TILE, SLIDE=460;
  function roomAt(st,px,py){ var cx=Math.floor(px/(st.rw*TILE)), cy=Math.floor(py/(st.rh*TILE));
    return [Math.max(0,Math.min(st.nx-1,cx)), Math.max(0,Math.min(st.ny-1,cy))]; }
  function rect(st,r){ return {x:r[0]*st.rw*TILE, y:r[1]*st.rh*TILE, w:st.rw*TILE, h:st.rh*TILE}; }
  // scroll target that frames a room: follow her inside it; a room smaller than the view is centred
  function frame(R,cam,hx,hy){
    var vw=cam.width/(cam.zoom||1), vh=cam.height/(cam.zoom||1), x, y;
    if(R.w<=vw) x=R.x-(vw-R.w)/2; else x=Math.max(R.x,Math.min(R.x+R.w-vw,hx-vw/2));
    if(R.h<=vh) y=R.y-(vh-R.h)/2; else y=Math.max(R.y,Math.min(R.y+R.h-vh,hy-vh/2));
    var off=(cam.width-vw)/2, offy=(cam.height-vh)/2;      // Phaser scroll is measured from the unzoomed viewport
    return {x:x-off,y:y-offy};
  }
  function shade(st,a,b,f){                                 // dark outside room a (and b while sliding from a to b)
    var g=st.dark, W=st.W*TILE, H=st.H*TILE, m=2000; g.clear();
    function hole(R,alpha){ g.fillStyle(0x050a08,alpha);
      g.fillRect(-m,-m,W+2*m,R.y+m); g.fillRect(-m,R.y+R.h,W+2*m,H-R.y-R.h+m); g.fillRect(-m,R.y,R.x+m,R.h); g.fillRect(R.x+R.w,R.y,W-R.x-R.w+m,R.h); }
    if(!b){ hole(a,0.9); return; }
    var U={x:Math.min(a.x,b.x),y:Math.min(a.y,b.y),w:Math.max(a.x+a.w,b.x+b.w)-Math.min(a.x,b.x),h:Math.max(a.y+a.h,b.y+b.h)-Math.min(a.y,b.y)};
    hole(U,0.9); g.fillStyle(0x050a08,0.9*f); g.fillRect(a.x,a.y,a.w,a.h);   // the room she left closes behind her
  }
  K.ready(function(K,D){ D.register('forest-rooms',{
    load:function(ctx){
      var st=ctx.state, P=ctx.mechanic.params||{}, rt=P.roomTiles||[20,15];
      st.rw=rt[0]; st.rh=rt[1]; st.W=ctx.plan.width; st.H=ctx.plan.height; st.nx=Math.max(1,Math.round(st.W/st.rw)); st.ny=Math.max(1,Math.round(st.H/st.rh));
      st.room=null; st.slide=null; st.rooms=0;
      st.dark=ctx.own(ctx.scene.add.graphics().setDepth(40));
    },
    tick:function(ctx,dt){
      var st=ctx.state, s=K.soles(ctx); if(!s||!st.dark) return;
      if(!st.room){ st.room=roomAt(st,s.x,s.y); shade(st,rect(st,st.room)); return; }   // arrival, or Continue: the room she stands in
      if(st.slide){ st.slide.t+=Math.min(dt,100); var f=Math.min(1,st.slide.t/SLIDE);
        shade(st,rect(st,st.slide.from),rect(st,st.room),f);
        if(f>=1){ st.slide=null; shade(st,rect(st,st.room)); } return; }
      if(ctx.scene.__a1dEntryWaiting) return;
      var r=roomAt(st,s.x,s.y);
      if(r[0]===st.room[0]&&r[1]===st.room[1]) return;
      var R=rect(st,r), inside=Math.min(s.x-R.x,R.x+R.w-s.x,s.y-R.y,R.y+R.h-s.y);
      if(inside<6) return;                                   // a few px in before the room changes hands: no flicker on the line
      var dx=r[0]-st.room[0], dy=r[1]-st.room[1], big=(Math.abs(dx)+Math.abs(dy)!==1);
      st.slide={from:st.room,t:big?SLIDE:0,dir:big?null:[dx,dy]}; st.room=r; st.rooms++;   // not a neighbour (a warp, a rescue): cut, do not slide
    },
    input:function(ctx,stick){                               // through the gap on her own while the camera slides
      var sl=ctx.state.slide; if(sl&&sl.dir&&sl.t<SLIDE*0.75) return {x:sl.dir[0],y:sl.dir[1],m:1};
    },
    step:function(ctx){ if(ctx.state.slide) return false; },   // nothing jumps her mid-slide
    camera:function(ctx,tx,ty,cam){
      var st=ctx.state, h=ctx.hero(); if(!st.room||!h) return null;
      var to=frame(rect(st,st.room),cam,h.x,h.y);
      if(st.slide){ var f=Math.min(1,st.slide.t/SLIDE), e=f*f*(3-2*f), fr=frame(rect(st,st.slide.from),cam,h.x,h.y);
        return {x:fr.x+(to.x-fr.x)*e,y:fr.y+(to.y-fr.y)*e}; }
      return to;
    },
    _debug:{ roomAt:roomAt, rect:rect, frame:frame }
  }); });
})();
