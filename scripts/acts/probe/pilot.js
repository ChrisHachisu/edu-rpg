// In-page auto-pilot. Drives the game ONLY via synthetic keyboard events (same mechanism the shipped d-pad uses) and reads state.
(function(){
  if(window.__P) return;
  const KC={ArrowUp:38,ArrowDown:40,ArrowLeft:37,ArrowRight:39,z:90,x:88,Enter:13,Escape:27};
  const VEC={ArrowUp:[0,-1],ArrowDown:[0,1],ArrowLeft:[-1,0],ArrowRight:[1,0]};
  const OPP={ArrowUp:'ArrowDown',ArrowDown:'ArrowUp',ArrowLeft:'ArrowRight',ArrowRight:'ArrowLeft'};
  const wait=ms=>new Promise(r=>setTimeout(r,ms));
  const W=()=>window.__PHASER_GAME__.scene.getScene('WorldMapScene');
  const G=()=>window.__PHASER_GAME__;
  const ST=()=>window.__GAME_STATE__.player.state;
  function fire(type,key){const code=key.length===1?'Key'+key.toUpperCase():key;const ev=new KeyboardEvent(type,{key,code,bubbles:true,cancelable:true});
    try{Object.defineProperty(ev,'keyCode',{get:()=>KC[key]});Object.defineProperty(ev,'which',{get:()=>KC[key]});}catch(e){}
    window.dispatchEvent(ev);}
  const held={};
  function setDir(dir){for(const k of Object.keys(VEC)){if(k===dir&&!held[k]){held[k]=1;fire('keydown',k);}else if(k!==dir&&held[k]){delete held[k];fire('keyup',k);}}
    window.__DQ_STICK__=dir?{x:VEC[dir][0],y:VEC[dir][1],m:1}:{x:0,y:0,m:0};}
  async function tapKey(k){fire('keydown',k);await wait(40);fire('keyup',k);}
  const onField=()=>{const g=G();return g.scene.isActive('WorldMapScene')&&!g.scene.isPaused('WorldMapScene')&&!g.scene.isActive('BattleScene');};
  const overlay=()=>{const w=W();return w.healerOverlayOpen||w.warpOverlayOpen||w.midCrystalOverlayOpen||w.questOverlayOpen||w.itemOverlayOpen;};
  const log=[];
  function msgText(){const w=W();try{const t=w.messageText&&w.messageText.text;if(t)return t;}catch(e){}
    try{const el=document.querySelector('#qok-ui .msg, #qok-ui [class*="dialog"], #qok-ui [class*="msg"]');return el?el.innerText:'';}catch(e){return '';}}
  async function dismiss(max=12){let n=0;const w=W();const seen=[];
    while(onField()&&w.showingMessage&&n<max){const t=(document.getElementById('qok-ui')||document.body).innerText.slice(0,0);seen.push(lastMsg());await tapKey('z');await wait(260);n++;}
    return seen;}
  let _hook=false,_msgs=[];
  function hookMsgs(){const w=W();if(w.__pHook)return;w.__pHook=true;const o=w.showMessage;w.showMessage=function(t,n){_msgs.push({t:String(t).slice(0,240),map:w.currentMapId,f:w.currentFloor,x:w.heroTileX,y:w.heroTileY});return o.apply(this,arguments);};
    const o2=w.showDialogSequence;w.showDialogSequence=function(a,cb){try{for(const t of a)_msgs.push({t:String(t).slice(0,240),seq:1,map:w.currentMapId,f:w.currentFloor});}catch(e){}return o2.apply(this,arguments);};}
  function lastMsg(){return _msgs.length?_msgs[_msgs.length-1].t:'';}
  function inv(id){return ST().inventory.some(s=>s.itemId===id&&s.quantity>0);}
  function def(){return null;}
  // pure passability mirror of canMove (no side effects). kind: 'overworld'|'portal-overworld'|'town'|'dungeon'
  function passFn(kind,opts={}){const w=W();const md=w.mapData;const H=md.length,Wd=md[0].length;const map=w.currentMapId;
    const npcs=new Set((opts.npcs||[]).map(n=>n.x+','+n.y));
    if(!opts.pure){const cm=w.canMove.bind(w);return (x,y)=>{if(y<0||y>=H||x<0||x>=Wd)return false;const i=md[y][x];
        if(kind==='dungeon'){if(w.glyphTrialActive&&w.glyphPlates&&w.glyphPlates.some(p=>p.x===x&&p.y===y&&!p.safe))return false;if(!opts.transit&&(i===6||i===9||i===10||i===11||i===12))return false;if(i===15)return !!opts.keyDoors&&inv('dungeonKey_'+map);if(i===19)return !!opts.keyDoors&&inv('windbreakerStone_'+map);if(opts.avoid&&opts.avoid.includes(i))return false;if(i===5&&opts.lava)return true;}
        return !!cm(x,y);};}
    return (x,y)=>{if(y<0||y>=H||x<0||x>=Wd)return false;const i=md[y][x];let u;
      if(kind==='overworld'||kind==='portal-overworld'){u=![2,4,6,7,8,9,10,11,12,14,15,16,19,20,21].includes(i);if(i===13)u=inv('windbreakerStone');if(i===21)u=inv('flameCloak');}
      else if(kind==='town'){u=![1,2,4,6,8,9,10,11,12,13,14,15].includes(i);}
      else{u=![1,5,4,7,18,23,28,14,20].includes(i);if(i===5&&opts.lava)u=true;if(i===17)u=true;if(i===15)u=!!opts.keyDoors&&inv('dungeonKey_'+map);if(i===19)u=!!opts.keyDoors&&inv('windbreakerStone_'+map);
        if(opts.avoid&&opts.avoid.includes(i))u=false;}
      if(!u)return false;if(npcs.has(x+','+y))return false;return true;};}
  // BFS from (sx,sy) to any cell where goal(x,y) true. `enter`: goal cell itself need not be passable (we walk INTO it).
  function bfs(sx,sy,goal,pass,{enter=true,limit=400000}={}){const w=W();const md=w.mapData;const H=md.length,Wd=md[0].length;
    const prev=new Int32Array(H*Wd).fill(-2);const q=new Int32Array(H*Wd);let qh=0,qt=0;const s=sy*Wd+sx;prev[s]=-1;q[qt++]=s;
    const D=[[0,-1,'ArrowUp'],[0,1,'ArrowDown'],[-1,0,'ArrowLeft'],[1,0,'ArrowRight']];let found=-1;
    while(qh<qt){const c=q[qh++];const cx=c%Wd,cy=(c/Wd)|0;
      for(let d=0;d<4;d++){const nx=cx+D[d][0],ny=cy+D[d][1];if(nx<0||ny<0||nx>=Wd||ny>=H)continue;const n=ny*Wd+nx;if(prev[n]!==-2)continue;
        const g=goal(nx,ny);if(g&&enter){prev[n]=c;found=n;qh=qt;break;}
        if(!pass(nx,ny))continue;prev[n]=c;if(g){found=n;qh=qt;break;}q[qt++]=n;}}
    if(found<0)return null;const cells=[];let c=found;while(c!==-1){cells.unshift([c%Wd,(c/Wd)|0]);c=prev[c];}
    const dirs=[];for(let i=1;i<cells.length;i++){const dx=cells[i][0]-cells[i-1][0],dy=cells[i][1]-cells[i-1][1];dirs.push(dx>0?'ArrowRight':dx<0?'ArrowLeft':dy>0?'ArrowDown':'ArrowUp');}
    return {cells,dirs,reach:qt};}
  // Ice floors (mechanic 'ice'): stepping onto tile 25 slides up to 20 cells; mirror handleIceSlide so the plan is in key presses.
  function bfsIce(sx,sy,goal,pass){const w=W();const md=w.mapData;const H=md.length,Wd=md[0].length;const prev=new Int32Array(H*Wd).fill(-2);const pdir=new Int8Array(H*Wd);const q=[sy*Wd+sx];prev[q[0]]=-1;let h=0;
    const D=[[0,-1,'ArrowUp'],[0,1,'ArrowDown'],[-1,0,'ArrowLeft'],[1,0,'ArrowRight']];let found=-1,fdir=-1,fprev=-1;
    while(h<q.length&&found<0){const c=q[h++];const cx=c%Wd,cy=(c/Wd)|0;
      for(let d=0;d<4;d++){let nx=cx+D[d][0],ny=cy+D[d][1];if(nx<0||ny<0||nx>=Wd||ny>=H)continue;
        if(goal(nx,ny)){found=ny*Wd+nx;fdir=d;fprev=c;break;}
        if(!pass(nx,ny))continue;
        if(md[ny][nx]===25){let m=0;let ox=nx,oy=ny;let hitGoal=false;for(;m<20;){const tx=ox+D[d][0],ty=oy+D[d][1];if(ty<0||ty>=H||tx<0||tx>=Wd)break;const f=md[ty][tx];if(f===1||f===5||f===4||f===7||f===28)break;ox=tx;oy=ty;m++;if(f!==25)break;}
          nx=ox;ny=oy;}
        const n=ny*Wd+nx;if(prev[n]!==-2)continue;prev[n]=c;pdir[n]=d;q.push(n);}}
    if(found<0)return null;const dirs=[D[fdir][2]];const cells=[[found%Wd,(found/Wd)|0]];let c=fprev;while(prev[c]!==-1){dirs.unshift(D[pdir[c]][2]);cells.unshift([c%Wd,(c/Wd)|0]);c=prev[c];}cells.unshift([sx,sy]);
    return {cells,dirs,reach:q.length};}
  function reachable(sx,sy,pass){const w=W();const md=w.mapData;const H=md.length,Wd=md[0].length;const seen=new Uint8Array(H*Wd);const q=[sy*Wd+sx];seen[q[0]]=1;let h=0;
    while(h<q.length){const c=q[h++];const cx=c%Wd,cy=(c/Wd)|0;for(const [dx,dy] of [[0,-1],[0,1],[-1,0],[1,0]]){const nx=cx+dx,ny=cy+dy;if(nx<0||ny<0||nx>=Wd||ny>=H)continue;const n=ny*Wd+nx;if(seen[n])continue;if(!pass(nx,ny))continue;seen[n]=1;q.push(n);}}
    return {seen,Wd,H,count:q.length};}
  // one real step: hold dir until hero tile changes / message / scene change. returns status string
  async function step(dir,{timeout=900}={}){const w=W();const x0=w.heroTileX,y0=w.heroTileY,m0=w.currentMapId,f0=w.currentFloor;
    const real=w.mirrorActive?OPP[dir]:dir;setDir(real);const t0=performance.now();let st='stuck';
    while(performance.now()-t0<timeout){await wait(16);
      if(!onField()){st='scene';break;}
      if(w.currentMapId!==m0||w.currentFloor!==f0){st='transition';break;}
      if(w.showingMessage||overlay()){st='message';break;}
      if(w.heroTileX!==x0||w.heroTileY!==y0){st='moved';break;}}
    setDir(null);
    if(st==='moved'){const t1=performance.now();await wait(40);while(performance.now()-t1<2600&&(w.isMoving||w.tweens.isTweening(w.hero)))await wait(16);if(w.showingMessage)st='moved+message';if(!onField())st='scene';}
    if(st==='transition'){await wait(700);}
    return st;}
  // closed-loop walk toward goal. Re-plans every step. stop: optional predicate evaluated each loop.
  async function walk(goal,kind,{enter=true,maxSteps=4000,passOpts={},stop=null,onMsg=null}={}){hookMsgs();const w=W();let steps=0,stuck=0;const m0=w.currentMapId,f0=w.currentFloor;const trail=[];
    const T0=performance.now();const maxMs=arguments[2].maxMs||240000;let msgLoops=0;
    while(steps<maxSteps){
      window.__PT={steps,stuck,at:[w.heroTileX,w.heroTileY],msg:w.showingMessage,mv:w.isMoving,t:performance.now()-T0,last:lastMsg()};
      if(performance.now()-T0>maxMs)return {ok:false,why:'timeout',steps,at:[w.heroTileX,w.heroTileY],pt:window.__PT};
      if(!onField())return {ok:false,why:'scene',steps};
      if(w.currentMapId!==m0||w.currentFloor!==f0)return {ok:true,why:'transition',steps};
      if(w.showingMessage){const t=lastMsg();await dismiss();msgLoops++;if(msgLoops>25)return {ok:false,why:'msg-loop',msg:t,steps,at:[w.heroTileX,w.heroTileY]};if(onMsg){const r=onMsg(t);if(r)return {ok:false,why:'msg',msg:t,steps};}continue;}
      if(overlay())return {ok:false,why:'overlay',steps};
      if(w.isMoving||w.tweens.isTweening(w.hero)){await wait(30);stuck++;if(stuck>200)return {ok:false,why:'isMoving-stuck',steps};continue;}
      if(stop&&stop())return {ok:true,why:'stop',steps};
      if(!enter&&goal(w.heroTileX,w.heroTileY))return {ok:true,why:'arrived',steps};
      const pass=passFn(kind,passOpts);const p=(window.__P_ICE&&kind==='dungeon')?bfsIce(w.heroTileX,w.heroTileY,goal,pass):bfs(w.heroTileX,w.heroTileY,goal,pass,{enter});
      if(!p)return {ok:false,why:'nopath',steps,at:[w.heroTileX,w.heroTileY]};
      if(p.dirs.length===0)return {ok:true,why:'arrived',steps};
      const last=p.dirs.length===1;const st=await step(p.dirs[0]);steps++;
      if(st==='stuck'){stuck++;trail.push([w.heroTileX,w.heroTileY,p.dirs[0]]);if(stuck>6)return {ok:false,why:'stuck',steps,at:[w.heroTileX,w.heroTileY],dir:p.dirs[0],next:p.cells[1],tile:w.mapData[p.cells[1][1]][p.cells[1][0]],last};if(last&&enter&&stuck>1)return {ok:true,why:'bumped',steps};await wait(60);continue;}
      stuck=0;
      if(st==='transition')return {ok:true,why:'transition',steps};
      if(st==='scene')return {ok:false,why:'scene',steps};
      if(last&&enter&&(st==='message'))return {ok:true,why:'bumped-msg',steps,msg:lastMsg()};
    }
    return {ok:false,why:'maxSteps',steps};}
  function find(tile){const md=W().mapData;const out=[];for(let y=0;y<md.length;y++)for(let x=0;x<md[y].length;x++)if(md[y][x]===tile)out.push([x,y]);return out;}
  function hist(){const md=W().mapData;const h={};for(const r of md)for(const t of r)h[t]=(h[t]||0)+1;return h;}
  function state(){const g=G(),w=W();return {map:w.currentMapId,floor:w.currentFloor,x:w.heroTileX,y:w.heroTileY,msg:!!w.showingMessage,moving:!!w.isMoving,overlay:!!overlay(),scenes:g.scene.getScenes(true).map(s=>s.scene.key),hp:ST().hp,gold:ST().gold};}
  window.__P={fire,setDir,tapKey,dismiss,step,walk,bfs,passFn,reachable,find,hist,state,wait,msgs:()=>_msgs,clearMsgs:()=>{_msgs=[];},hookMsgs,lastMsg,onField};
})();
(function(){
  const P=window.__P;if(P.solveFloor)return;
  const W=()=>window.__PHASER_GAME__.scene.getScene('WorldMapScene');
  const ST=()=>window.__GAME_STATE__.player.state;
  // Tries to finish the current dungeon floor: reach stairs-down (9) or, if no 9 on the floor, bump the boss (7), or after the boss the exit (10/12).
  // Returns when the floor/map changes, a non-field scene starts (battle), or it gives up.
  P.solveFloor=async function(opts={}){P.hookMsgs();const w=W();const map=w.currentMapId,floor=w.currentFloor;const notes=[];let iter=0;const tried=new Set();
    const lava=!!opts.lava;
    while(iter++<60){
      if(!P.onField())return {ok:true,why:'scene',notes};
      if(w.currentMapId!==map||w.currentFloor!==floor)return {ok:true,why:'transition',notes};
      if(w.showingMessage){await P.dismiss();continue;}
      if(w.midCrystalOverlayOpen||w.warpOverlayOpen||w.healerOverlayOpen||w.questOverlayOpen||w.itemOverlayOpen){await P.tapKey('x');await P.wait(300);continue;}
      const want=opts.want||null;
      const has=t=>P.find(t).length>0;
      let goalTiles;
      if(want)goalTiles=want; else if(has(10)||has(12))goalTiles=[10,12]; else if(has(9))goalTiles=[9]; else if(has(7))goalTiles=[7]; else return {ok:false,why:'no-goal-tile',hist:P.hist(),notes};
      const md=w.mapData;const goal=(x,y)=>goalTiles.includes(md[y][x]);
      const mv=async(g)=>{if(!opts.free||!(window.__A1_DNG_MOVE__&&window.__A1_DNG_MOVE__.forScene(w)))return P.walk(g,'dungeon',{enter:true,passOpts:{keyDoors:true,lava},maxSteps:3000});
        let t=null;{const M0=window.__A1_DNG_MOVE__;if(M0&&M0.forScene(w)){let bd=1e9;for(let y=0;y<md.length;y++)for(let x=0;x<md[0].length;x++)if(g(x,y)){const d=Math.abs(x-w.heroTileX)+Math.abs(y-w.heroTileY);if(d<bd){bd=d;t=[x,y];}}}}
        if(!t){const pp=P.bfs(w.heroTileX,w.heroTileY,g,P.passFn('dungeon',{keyDoors:true,lava}),{enter:true});if(!pp)return {ok:false,why:'nopath',at:[w.heroTileX,w.heroTileY]};t=pp.cells[pp.cells.length-1];}
        const M=window.__A1_DNG_MOVE__;if(M&&M.forScene(w))return P.fineWalk(t[0],t[1],{});
        return P.owWalk(t[0],t[1],{kind:'dungeon',cell:48,enter:true,bump:true,lava,maxMs:120000});};
      const r=await mv(goal);
      if(r.ok&&(r.why==='transition'))return {ok:true,why:'transition',notes,steps:r.steps};
      if(r.why==='scene'||!P.onField())return {ok:true,why:'scene',notes};
      if(r.ok&&(r.why==='bumped'||r.why==='bumped-msg'||r.why==='arrived')){notes.push('bump:'+r.why+':'+(r.msg||''));await P.wait(500);continue;}
      notes.push(r.why+'@'+JSON.stringify(r.at||[w.heroTileX,w.heroTileY])+(r.tile!==undefined?' tile'+r.tile:''));
      if(r.why==='nopath'||r.why==='stuck'){
        // unlockers: pillars (colored-keys), then chests
        let acted=false;
        if(w.crystalPillars&&w.crystalPillars.length&&w.crystalActivated.length<w.crystalPillars.length){const idx=w.crystalSequence[w.crystalActivated.length];const pl=w.crystalPillars[idx];
          const rr=await mv((x,y)=>x===pl.x&&y===pl.y);notes.push('pillar'+idx+':'+rr.why);await P.wait(900);await P.dismiss();if(rr.ok){acted=true;continue;}}
        const pass=P.passFn('dungeon',{keyDoors:true,lava});const R=P.reachable(w.heroTileX,w.heroTileY,pass);
        const cands=[];for(const t of [4,28])for(const [x,y] of P.find(t)){const k=t+':'+x+','+y;if(tried.has(k))continue;
          if([[0,-1],[0,1],[-1,0],[1,0]].some(([dx,dy])=>{const nx=x+dx,ny=y+dy;return nx>=0&&ny>=0&&nx<R.Wd&&ny<R.H&&R.seen[ny*R.Wd+nx];}))cands.push([x,y,k,Math.abs(x-w.heroTileX)+Math.abs(y-w.heroTileY)]);}
        cands.sort((a,b)=>a[3]-b[3]);
        if(cands.length){const [cx,cy,k]=cands[0];tried.add(k);const rr=await mv((x,y)=>x===cx&&y===cy);notes.push('chest'+k+':'+rr.why+':'+P.lastMsg().slice(0,60));await P.wait(400);if(!P.onField())return {ok:true,why:'scene',notes};await P.dismiss();acted=true;continue;}
        if(w.shadowPortalEnabled&&w.portalPairs&&!tried.has('plan'+w.heroTileX+','+w.heroTileY)){tried.add('plan'+w.heroTileX+','+w.heroTileY);
          // portal-graph BFS: walking never crosses a portal except deliberately
          const H=md.length,Wd=md[0].length;const base=P.passFn('dungeon',{keyDoors:true,lava,transit:false});const dest={};for(const m of w.portalPairs){dest[m.a.x+','+m.a.y]=m.b;dest[m.b.x+','+m.b.y]=m.a;}
          const prev=new Map();const q=[[w.heroTileX,w.heroTileY]];prev.set(w.heroTileX+','+w.heroTileY,null);let end=null;
          while(q.length&&!end){const [x,y]=q.shift();for(const [dx,dy] of [[0,-1],[0,1],[-1,0],[1,0]]){let nx=x+dx,ny=y+dy;if(nx<0||ny<0||nx>=Wd||ny>=H)continue;let via=null;
              if(goal(nx,ny)){prev.set('G',{from:x+','+y,via:null});end=[nx,ny];break;}
              if(md[ny][nx]===29&&dest[nx+','+ny]){via=[nx,ny];const d=dest[nx+','+ny];nx=d.x;ny=d.y;}else if(!base(nx,ny))continue;
              const k=nx+','+ny;if(prev.has(k))continue;prev.set(k,{from:x+','+y,via});q.push([nx,ny]);}}
          if(end){const seq=[];let k='G';while(prev.get(k)){const e=prev.get(k);if(e.via)seq.unshift(e.via);k=e.from;}
            notes.push('portalplan:'+JSON.stringify(seq));let okp=true;
            for(const [px,py] of seq){const rr=await P.walk((x,y)=>x===px&&y===py,'dungeon',{enter:true,passOpts:{keyDoors:true,lava,avoid:[29]},maxSteps:3000});await P.wait(1600);await P.dismiss();const d=dest[px+','+py];if(!(w.heroTileX===d.x&&w.heroTileY===d.y)){notes.push('portalfail@'+px+','+py+':'+rr.why+'->'+w.heroTileX+','+w.heroTileY);okp=false;break;}}
            if(okp){const rr=await P.walk(goal,'dungeon',{enter:true,passOpts:{keyDoors:true,lava,avoid:[29]},maxSteps:3000});notes.push('portalgoal:'+rr.why);if(rr.ok&&rr.why==='transition')return {ok:true,why:'transition',notes};if(rr.why==='scene'||!P.onField())return {ok:true,why:'scene',notes};if(rr.ok){await P.wait(500);continue;}}
            acted=true;continue;}
          else notes.push('portalplan:none');}
        if(w.shadowPortalEnabled){const pc=[];for(const [x,y] of P.find(29)){const k='29:'+x+','+y;if(tried.has(k))continue;if(R.seen[y*R.Wd+x]||[[0,-1],[0,1],[-1,0],[1,0]].some(([dx,dy])=>{const nx=x+dx,ny=y+dy;return nx>=0&&ny>=0&&nx<R.Wd&&ny<R.H&&R.seen[ny*R.Wd+nx];}))pc.push([x,y,k,Math.abs(x-w.heroTileX)+Math.abs(y-w.heroTileY)]);}
          pc.sort((a,b)=>b[3]-a[3]);
          if(pc.length){const [cx,cy,k]=pc[0];tried.add(k);const b4=[w.heroTileX,w.heroTileY];const rr=await mv((x,y)=>x===cx&&y===cy);await P.wait(1500);tried.add('29:'+w.heroTileX+','+w.heroTileY);notes.push('portal'+k+':'+rr.why+'->'+w.heroTileX+','+w.heroTileY);acted=true;continue;}}
        if(!acted)return {ok:false,why:r.why,detail:r,hist:P.hist(),reach:R.count,goals:goalTiles.map(t=>[t,P.find(t).slice(0,4)]),keys:ST().inventory.filter(i=>/Key|Stone/.test(i.itemId)),doors:[P.find(15).length,P.find(19).length,P.find(20).length],notes};
      } else return {ok:false,why:r.why,detail:r,notes};
    }
    return {ok:false,why:'iter-limit',notes};};
  P.info=function(){const w=W();return {map:w.currentMapId,floor:w.currentFloor,at:[w.heroTileX,w.heroTileY],size:[w.mapData[0].length,w.mapData.length],hist:P.hist(),flags:Object.keys(ST().storyFlags).filter(k=>ST().storyFlags[k]&&/^boss\./.test(k)),inv:ST().inventory.map(i=>i.itemId+'x'+i.quantity).join(','),mirror:!!w.mirrorActive,fog:!!w.fogEnabled};};
})();
(function(){
  const P=window.__P;if(P.owWalk)return;
  const W=()=>window.__PHASER_GAME__.scene.getScene('WorldMapScene');
  const C=33.6;const cc=i=>(i+0.5)*C;
  // Continuous overworld walker: BFS on live canMove for the route, analog stick (the shipped __DQ_STICK__ channel) to follow it.
  P.owWalk=async function(tx,ty,{enter=true,maxMs=180000,avoid=null,kind='overworld',cell=33.6,bump=false,lava=false}={}){const C=cell;const cc=i=>(i+0.5)*C;P.hookMsgs();const w=W();const T0=performance.now();const m0=w.currentMapId;let lastProg=performance.now(),best=1e9,replan=0,jit=0;const trace=[];
    const f0=w.currentFloor;const basePass=P.passFn(kind,{keyDoors:true,lava});const blocked=new Set();
    // keep clear of OTHER entrances (walking next to a mouth tile on the way somewhere else would enter it)
    const danger=new Set();if(kind==='overworld'){const md=w.mapData;const TR=[6,7,8,9,10,12,15,16,19];for(let y=0;y<md.length;y++)for(let x=0;x<md[0].length;x++)if(TR.includes(md[y][x])&&!(Math.abs(x-tx)<=1&&Math.abs(y-ty)<=1)){for(let dy=-1;dy<=1;dy++)for(let dx=-1;dx<=1;dx++)danger.add((x+dx)+','+(y+dy));}}
    const sx0=w.heroTileX,sy0=w.heroTileY;
    const pass=(x,y)=>!blocked.has(x+','+y)&&(!danger.has(x+','+y)||(Math.abs(x-sx0)<=1&&Math.abs(y-sy0)<=1&&!([6,7,8,9,10,12,15,16,19].includes(w.mapData[y][x]))))&&basePass(x,y);
    const stop=()=>{window.__DQ_STICK__={x:0,y:0,m:0};};
    while(performance.now()-T0<maxMs){
      if(!P.onField()){stop();return {ok:false,why:'scene'};}
      if(w.currentMapId!==m0||w.currentFloor!==f0){stop();await P.wait(800);return {ok:true,why:'transition',ms:performance.now()-T0};}
      if(w.healerOverlayOpen||w.questOverlayOpen||w.midCrystalOverlayOpen||w.warpOverlayOpen){stop();return {ok:true,why:'overlay',at:[w.heroTileX,w.heroTileY]};}
      if(w.showingMessage){stop();const t=P.lastMsg();if(bump&&Math.abs(w.heroTileX-tx)+Math.abs(w.heroTileY-ty)<=2){return {ok:true,why:'bumped-msg',msg:t};}await P.dismiss();trace.push('msg:'+t.slice(0,80));if(trace.filter(s=>s.startsWith('msg:')).length>6)return {ok:false,why:'msg-loop',msg:t,at:[w.heroTileX,w.heroTileY],trace};continue;}
      const hx=w.heroTileX,hy=w.heroTileY;
      if(hx===tx&&hy===ty){stop();for(let i=0;i<30&&w.currentMapId===m0&&w.currentFloor===f0;i++)await P.wait(50);return {ok:true,why:w.currentMapId!==m0||w.currentFloor!==f0?'transition':'arrived',at:[hx,hy]};}
      const p=P.bfs(hx,hy,(a,b)=>a===tx&&b===ty,pass,{enter});
      if(!p){stop();return {ok:false,why:'nopath',at:[hx,hy],blocked:[...blocked]};}
      if(p.cells.length<=1){stop();return {ok:true,why:'arrived',at:[hx,hy]};}
      const rem=p.cells.length;if(rem<best){best=rem;lastProg=performance.now();}
      if(performance.now()-lastProg>6000){ // real collision disagrees with canMove: mark next cell blocked and re-plan
        const n=p.cells[Math.min(1,p.cells.length-1)];if(!(n[0]===tx&&n[1]===ty))blocked.add(n[0]+','+n[1]);trace.push('block:'+n.join(',')+'@'+hx+','+hy);best=1e9;lastProg=performance.now();replan++;if(replan>40){stop();return {ok:false,why:'stuck',at:[hx,hy],trace};}continue;}
      // steer toward the centre of the cell 1..2 ahead
      const k=danger.has(hx+','+hy)?1:Math.min(p.cells.length-1,2);let wp=p.cells[k];
      // if the straight line to wp crosses a blocked cell use the immediate next
      const n1=p.cells[1];if(k===2&&!(pass(wp[0],n1[1])&&pass(n1[0],wp[1])))wp=n1;
      let dx=cc(wp[0])-w.hero.x,dy=cc(wp[1])-w.hero.y;const l=Math.hypot(dx,dy)||1;
      window.__DQ_STICK__={x:dx/l,y:dy/l,m:1};
      await P.wait(50);
    }
    stop();return {ok:false,why:'timeout',at:[w.heroTileX,w.heroTileY],trace};};
})();
(function(){
  const P=window.__P;if(P.fineWalk)return;
  const W=()=>window.__PHASER_GAME__.scene.getScene('WorldMapScene');
  // Navigator for the Act 1 continuous-collision floors: plans on the game's OWN collision test (__A1_DNG_MOVE__.free) on an 8px lattice,
  // then follows the plan with the analog stick. Ends by pushing into the target cell (stairs / chest / boss bump).
  P.fineWalk=async function(tx,ty,{maxMs=120000,cell=48,bump=true,S=8}={}){P.hookMsgs();const w=W();const M=window.__A1_DNG_MOVE__;const m=M&&M.forScene(w);
    if(!m)return {ok:false,why:'no-mask'};
    const m0=w.currentMapId,f0=w.currentFloor,T0=performance.now();const cx=(tx+.5)*cell,cy=(ty+.5)*cell;const stop=()=>{window.__DQ_STICK__={x:0,y:0,m:0};};
    const Wn=Math.ceil(m.W/S)+2,Hn=Math.ceil(m.H/S)+2;let lastBest=1e9,lastProg=performance.now(),pushes=0;let info={};
    const plan=()=>{const ox=w.hero.x%S,oy=w.hero.y%S;const sx=Math.floor(w.hero.x/S),sy=Math.floor(w.hero.y/S);const prev=new Int32Array(Wn*Hn).fill(-2);const q=new Int32Array(Wn*Hn);let h=0,t=0;const s=sy*Wn+sx;prev[s]=-1;q[t++]=s;let best=s,bd=1e18;
      const N=[[1,0],[-1,0],[0,1],[0,-1],[1,1],[1,-1],[-1,1],[-1,-1]];
      while(h<t){const c=q[h++];const gx=c%Wn,gy=(c/Wn)|0;const px=gx*S+ox,py=gy*S+oy;const d=(px-cx)*(px-cx)+(py-cy)*(py-cy);if(d<bd){bd=d;best=c;}
        for(const [dx,dy] of N){const nx=gx+dx,ny=gy+dy;if(nx<0||ny<0||nx>=Wn||ny>=Hn)continue;const n=ny*Wn+nx;if(prev[n]!==-2)continue;if(!M.free(w,m,nx*S+ox,ny*S+oy)){prev[n]=-3;continue;}
          if(dx&&dy&&(!M.free(w,m,nx*S+ox,gy*S+oy)||!M.free(w,m,gx*S+ox,ny*S+oy))){continue;}
          prev[n]=c;q[t++]=n;}}
      const path=[];let c=best;while(c!==-1&&c>=0){path.unshift([(c%Wn)*S+ox,((c/Wn)|0)*S+oy]);c=prev[c];}
      return {path,dist:Math.sqrt(bd),reach:t};};
    while(performance.now()-T0<maxMs){
      if(!P.onField()){stop();return {ok:true,why:'scene'};}
      if(w.currentMapId!==m0||w.currentFloor!==f0){stop();await P.wait(900);return {ok:true,why:'transition'};}
      if(w.showingMessage){stop();const t=P.lastMsg();if(bump&&Math.hypot(w.hero.x-cx,w.hero.y-cy)<cell*2.2)return {ok:true,why:'bumped-msg',msg:t};await P.dismiss();continue;}
      if(w.midCrystalOverlayOpen||w.warpOverlayOpen){stop();await P.tapKey('x');await P.wait(300);continue;}
      const pl=plan();info={dist:Math.round(pl.dist),reach:pl.reach,len:pl.path.length};
      const rem=pl.path.length+pl.dist/S;if(rem<lastBest-0.5){lastBest=rem;lastProg=performance.now();}
      if(pl.path.length<=2){ // at the closest reachable point: push into the target
        if(pl.dist>cell*1.6){stop();return {ok:false,why:'nopath',closest:Math.round(pl.dist),at:[w.heroTileX,w.heroTileY],reach:pl.reach};}
        const dx=cx-w.hero.x,dy=cy-w.hero.y,l=Math.hypot(dx,dy)||1;window.__DQ_STICK__={x:dx/l,y:dy/l,m:1};await P.wait(500);pushes++;
        if(pushes>8){stop();return {ok:true,why:'bumped',at:[w.heroTileX,w.heroTileY]};}continue;}
      if(performance.now()-lastProg>8000){stop();return {ok:false,why:'stuck',at:[w.heroTileX,w.heroTileY],info};}
      const wp=pl.path[Math.min(pl.path.length-1,3)];const dx=wp[0]-w.hero.x,dy=wp[1]-w.hero.y,l=Math.hypot(dx,dy)||1;window.__DQ_STICK__={x:dx/l,y:dy/l,m:1};
      await P.wait(90);
    }
    stop();return {ok:false,why:'timeout',at:[w.heroTileX,w.heroTileY],info};};
})();

(function(){
  const P=window.__P;if(P.forestFloor)return;
  const W=()=>window.__PHASER_GAME__.scene.getScene('WorldMapScene');
  // Haunted Forest (forest-maze): leave each floor through the east edge on the correct row. The driver READS the correct row from the
  // scene (forestMazeCorrectExitY) instead of interpreting the firefly hint, so this proves the route works, not that the hint is readable.
  P.forestFloor=async function({bossDefeated=false,lastFloor=false}={}){P.hookMsgs();const w=W();const md=w.mapData;const H=md.length,Wd=md[0].length;const f0=w.currentFloor,m0=w.currentMapId;const notes=[];
    const waitChange=async(ms)=>{const t=performance.now();while(performance.now()-t<ms){if(w.currentFloor!==f0||w.currentMapId!==m0||!P.onField())return true;if(w.showingMessage)await P.dismiss();await P.wait(60);}return false;};
    if(P.find(7).length&&!bossDefeated){const r=await P.walk((x,y)=>md[y][x]===7,'dungeon',{enter:true});notes.push('boss:'+r.why);await P.wait(600);return {ok:r.ok||r.why==='scene',why:P.onField()?'bumped':'scene',notes};}
    if(lastFloor&&bossDefeated){const r=await P.walk((x,y)=>y===H-1,'dungeon',{enter:false});notes.push('south:'+r.why+JSON.stringify(r.at||''));if(!r.ok)return {ok:false,why:'no-south-exit',detail:r,notes};
      for(let i=0;i<4;i++){await P.step('ArrowDown',{timeout:700});if(await waitChange(1500))return {ok:true,why:'transition',notes};}return {ok:false,why:'south-exit-did-not-fire',at:[w.heroTileX,w.heroTileY],notes};}
    const ey=w.forestMazeCorrectExitY;notes.push('exitY='+ey+' size='+Wd+'x'+H);
    const r=await P.walk((x,y)=>x===Wd-1&&y===ey,'dungeon',{enter:false});notes.push('east:'+r.why);if(!r.ok)return {ok:false,why:'no-east-exit',detail:r,notes,hist:P.hist()};
    for(let i=0;i<4;i++){await P.step('ArrowRight',{timeout:700});if(await waitChange(2500))return {ok:true,why:'transition',notes};}
    return {ok:false,why:'east-exit-did-not-fire',at:[w.heroTileX,w.heroTileY],notes};};
})();
