/* Frozen Lake: slide ice (mechanic id `slide-ice`).

   On an ice cell ('~') she cannot walk: a push of the stick sends her sliding in that compass
   direction, one cell after another at params.slideSpeedCellsPerSec, until the next cell is a
   frosted rock ('o'), the rim ('#', or a chest / crystal standing on the ice) or snow. She stops
   on the last ice cell, or steps off onto the first snow cell. Walking from the snow onto the
   ice starts a slide the same way. The rocks (the fifth one on floor 1 included) are the plan's
   'o' cells; ART paints them.

   Nothing to persist: the puzzle's whole state is where she stands, which the game saves. */
(function boot(){
  'use strict';
  var K=window.__QOK_D2KIT_A__; if(!K){ setTimeout(boot,40); return; }
  var TILE=K.TILE, D4=[[0,1],[-1,0],[1,0],[0,-1]];               // by heroDir: 0 down 1 left 2 right 3 up
  function ice(ctx,x,y){ return ctx.terrain(x,y)==='~' && ctx.tile(x,y)===0; }
  function snow(ctx,x,y){ var c=ctx.terrain(x,y); return c!=='~' && c!=='o' && c!=='#' && ctx.tile(x,y)===0 && ctx.plan.rows[y] && ctx.plan.rows[y].charAt(x)==='.'; }
  // Where a slide from ice cell (x,y) heading d ends: {x,y,n (cells travelled),snow}
  function run(ctx,x,y,d){
    var dx=D4[d][0], dy=D4[d][1], n=0;
    for(;;){ var nx=x+dx, ny=y+dy;
      if(ice(ctx,nx,ny)){ x=nx; y=ny; n++; continue; }
      if(snow(ctx,nx,ny)) return {x:nx,y:ny,n:n+1,snow:true};
      return {x:x,y:y,n:n,snow:false}; }
  }
  function puff(ctx,x,y){
    try{ var sc=ctx.scene; for(var i=0;i<5;i++){ var a=i/5*Math.PI*2, c=sc.add.circle(x+Math.cos(a)*6,y+Math.sin(a)*3,3,0xeaf6ff,0.9).setDepth(9.6);
      sc.tweens.add({targets:c,x:c.x+Math.cos(a)*14,y:c.y+Math.sin(a)*7-4,alpha:0,scaleX:0.3,scaleY:0.3,duration:320,onComplete:(function(o){ return function(){ o.destroy(); }; })(c)}); } }catch(e){}
  }
  K.ready(function(K,D){ D.register('slide-ice',{
    load:function(ctx){ var st=ctx.state; st.slide=null; st.slides=0; st.speed=((ctx.mechanic.params||{}).slideSpeedCellsPerSec||10)*TILE; st.streak=ctx.own(ctx.scene.add.graphics().setDepth(2.6)); },
    input:function(ctx,stick){
      var st=ctx.state, s=K.soles(ctx); if(!s) return;
      if(st.slide) return null;
      if(!ice(ctx,s.tx,s.ty)) return;                              // snow: she walks
      if(!stick || (stick.m!==undefined&&stick.m<0.3) || (!stick.x&&!stick.y)) return null;
      var hz=(s.dir===1||s.dir===2), ax=Math.abs(stick.x), ay=Math.abs(stick.y);
      var useX=hz?(ax*1.2>=ay):(ax>ay*1.2), d=useX?(stick.x>0?2:1):(stick.y>0?0:3);
      var r=run(ctx,s.tx,s.ty,d);
      if(r.n<1){ if(s.dir!==d) ctx.place(s.x,s.y-K.footDy(ctx),d); return null; }   // a rock or the rim right there: she only turns
      var ex=r.x*TILE+TILE/2, ey=r.y*TILE+TILE/2;
      st.slide={d:d,x0:s.x,y0:s.y,x1:ex,y1:ey,len:Math.abs(D4[d][0]?ex-s.x:ey-s.y),t:0,to:r};
      st.slides++; K.sfx('menu_move');
      return null;
    },
    tick:function(ctx,dt){
      var st=ctx.state, sl=st.slide; if(!sl||!K.onField(ctx)) return;
      sl.t+=st.speed*Math.min(dt,100)/1000;
      var f=sl.len>0?Math.min(1,sl.t/sl.len):1, g=Math.min(1,sl.t/(TILE*0.75));   // the sideways offset is taken up within the first cell
      var x,y;
      if(D4[sl.d][0]){ x=sl.x0+(sl.x1-sl.x0)*f; y=sl.y0+(sl.y1-sl.y0)*g; } else { y=sl.y0+(sl.y1-sl.y0)*f; x=sl.x0+(sl.x1-sl.x0)*g; }
      K.placeSoles(ctx,x,y,sl.d);
      try{ var gr=st.streak; gr.clear(); gr.lineStyle(3,0xffffff,0.35*(1-f)+0.1); gr.beginPath(); gr.moveTo(sl.x0,sl.y0+2); gr.lineTo(x,y+2); gr.strokePath(); }catch(e){}
      if(f>=1){ st.slide=null; st.last={x:sl.to.x,y:sl.to.y,snow:sl.to.snow}; puff(ctx,x,y+2); try{ st.streak.clear(); }catch(e){} }
    },
    free:function(ctx,px,py,tx,ty){
      if(ctx.state.slide) return true;                             // mid-slide the module carries her
      if(ice(ctx,tx,ty)) return true;                              // every ice cell is whole: the rocks are their own cells
    },
    step:function(ctx){ var s=K.soles(ctx); if(ctx.state.slide || (s&&ice(ctx,s.tx,s.ty))) return false; },   // nothing jumps her on the ice
    _debug:{ run:run, ice:ice, snow:snow }
  }); });
})();
