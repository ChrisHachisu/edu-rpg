/* ============================================================
   Quest of Knowledge — DQ-style pixel-art overworld re-skin (v2).
   FAITHFUL port of dq_overlay2.py -> dq_overlay8.png.

   ARCHITECTURE (the fix): the terrain is drawn into ONE windowed
   canvas in CONTINUOUS WORLD-PIXEL coordinates — exactly how the .py
   draws the whole map into a single image — so grass value-noise,
   sand coasts, foam and dirt paths are SEAMLESS across tile borders
   (no per-tile texture = no banding / repeated-tile look). The canvas
   is a single Phaser image at depth 1 (above engine tiles=0, below
   markers=7 / hero=10); special tiles (town/cave/castle/bridge/portal)
   are left TRANSPARENT so the engine art shows through.
   A depth-5 Phaser container holds the object overlay (pines, mountains,
   flowers), depth-sorted by world-y.

   Render-only. ZERO game logic: collision / encounters / saves still
   read the real mapData. N=16 native art unit, NEAREST x3 = 48px tile,
   matching the .py 1:1.
   ============================================================ */
(function () {
  'use strict';

  var N = 16, TILE = 48, SC = 3, MARGIN = 4;

  // ---------- palette (verbatim from dq_overlay2.py P{}) ----------
  var P = {
    grass:[56,112,46], grass_lt:[82,144,56], grass_dk:[36,78,32], grass_dk2:[28,62,28],
    water:[30,72,128], water_lt:[58,116,170], water_dk:[18,44,86], foam:[150,196,206],
    sand:[190,168,108], sand_dk:[150,128,78], dirt:[126,90,48], dirt_dk:[86,60,30], dirt_lt:[154,114,62],
    trunk:[78,50,26], trunk_dk:[48,30,15],
    // trees darker (user 6/30): deeper, moodier greens
    t1d:[12,40,20], t1:[26,68,30], t1l:[46,100,40],
    t2d:[12,36,30], t2:[22,60,46], t2l:[40,90,68],
    t3d:[30,38,18], t3:[54,62,28], t3l:[88,96,44],
    rock:[112,98,80], rock_lt:[150,134,110], rock_dk:[66,54,40], snow:[214,218,206],
    // brick road (warm stone, like the original engine path) + mortar
    brk:[150,118,84], brk_lt:[178,150,112], brk_dk:[118,90,60], mortar:[86,66,46],
    fl_pale:[196,202,180], fl_gold:[208,178,76], fl_red:[176,72,72],
    shadow:[18,40,22]
  };
  var TREEV = [['t1d','t1','t1l'],['t1d','t1','t1l'],['t2d','t2','t2l'],['t3d','t3','t3l']];
  function rgb(c){ return 'rgb('+c[0]+','+c[1]+','+c[2]+')'; }
  // ordered (Bayer 4x4) dithering — pixel-art gradients from a LIMITED palette: between two
  // adjacent tones, the dither ratio shifts across space so the gradient reads gradual but every
  // pixel is still a true palette color (no continuous airbrush). Uses WORLD coords (stable pattern).
  var B4=[[0,8,2,10],[12,4,14,6],[3,11,1,9],[15,7,13,5]]; // 4x4 = chunkier/clunkier dither (bigger dots)
  function dither2(wx,wy,a,b,frac){ return frac>((B4[wy&3][wx&3]+0.5)/16) ? b : a; }
  // map a 0..(len-1) value across a tone ramp, dithering between the two bracketing tones
  function rampDither(wx,wy,s,tones){ if(s<0)s=0; var n=tones.length-1; if(s>n)s=n; var i=s|0; if(i>=n) return tones[n]; return dither2(wx,wy,tones[i],tones[i+1],s-i); }
  function ic(c){ return [Math.round(c[0]),Math.round(c[1]),Math.round(c[2])]; } // round a lerp'd ramp color to int

  // ---------- seeded RNG (mulberry32) ----------
  function RNG(seed){ var s=seed>>>0; return function(){ s|=0; s=s+0x6D2B79F5|0; var t=Math.imul(s^s>>>15,1|s); t=t+Math.imul(t^t>>>7,61|t)^t; return ((t^t>>>14)>>>0)/4294967296; }; }
  function ri(rng,a,b){ return a + Math.floor(rng()*(b-a+1)); }
  function pick(rng,arr){ return arr[Math.floor(rng()*arr.length)]; }

  // ---------- smooth value-noise (hash + bilinear), matches .py vnoise ----------
  function _h(ix,iy,seed){
    var h=(Math.imul(ix,374761393)+Math.imul(iy,668265263)+Math.imul(seed,2147483647))>>>0;
    h=Math.imul(h^(h>>>13),1274126177)>>>0;
    return ((h^(h>>>16))&0xffff)/0xffff;
  }
  function vnoise(x,y,scale,seed){
    var fx=x/scale, fy=y/scale, ix=Math.floor(fx), iy=Math.floor(fy), tx=fx-ix, ty=fy-iy;
    function sm(t){ return t*t*(3-2*t); }
    var a=_h(ix,iy,seed), b=_h(ix+1,iy,seed), c=_h(ix,iy+1,seed), d=_h(ix+1,iy+1,seed);
    return (a*(1-sm(tx))+b*sm(tx))*(1-sm(ty)) + (c*(1-sm(tx))+d*sm(tx))*sm(ty);
  }
  // grass shade — LIMITED 4-tone palette with BAYER DITHER between bands over a low-freq field:
  // a gradual PIXEL-ART gradient (discrete palette, no airbrush), no hard contour lines.
  // 5-tone grass ramp -> bigger steps + 4x4 dither = chunkier (clunkier) gradual gradient
  var GRASS_TONES=[P.grass_dk2, P.grass_dk, P.grass, ic(lerp(P.grass,P.grass_lt,0.5)), P.grass_lt];
  function gshade(px,py){
    var n=vnoise(px,py,72,11)*0.7 + vnoise(px,py,33,12)*0.3;     // low-freq = big smooth bands
    n=(n-0.5)*1.35+0.5;                                          // expand contrast to use the ramp
    return rampDither(px,py, n*(GRASS_TONES.length-1), GRASS_TONES);
  }

  function nb(map,x,y){ var row=map[y]; return (row && row[x]!=null) ? row[x] : 0; }

  // ---------- WATER MUTING (render-only) ----------
  // tiny isolated/decorative water bodies -> grass, so they don't become sand-framed blue squares.
  var MUTED=null, MUTED_W=0;
  function buildMutedWater(map,threshold){
    var H=map.length,W=map[0].length,seen=new Uint8Array(W*H),muted=new Set();
    for (var y=0;y<H;y++) for (var x=0;x<W;x++){
      if (map[y][x]!==2||seen[y*W+x]) continue;
      var st=[[x,y]],comp=[]; seen[y*W+x]=1;
      while(st.length){ var p=st.pop(); comp.push(p); var a=p[0],b=p[1],nbrs=[[a-1,b],[a+1,b],[a,b-1],[a,b+1]];
        for(var i=0;i<4;i++){ var nx=nbrs[i][0],ny=nbrs[i][1]; if(nx<0||ny<0||nx>=W||ny>=H)continue;
          if(map[ny][nx]===2&&!seen[ny*W+nx]){ seen[ny*W+nx]=1; st.push([nx,ny]); } } }
      if (comp.length<=threshold) for(var c=0;c<comp.length;c++) muted.add(comp[c][1]*W+comp[c][0]);
    }
    return muted;
  }
  function et(map,x,y){ var row=map[y]; if(!row||row[x]==null) return 0; var v=row[x]; if(v===2&&MUTED&&MUTED.has(y*MUTED_W+x)) return 0; return v; }
  function isGrassBase(t){ return t===0||t===3||t===4; }          // grass / tree / mountain -> grass base
  function isSpecial(t){ return t===6||t===7||t===8||t===9||t>9; } // town/cave/castle/portal -> engine art shows through (bridge=5 is drawn by us)
  function nearWater(map,tx,ty){ for(var dx=-1;dx<=1;dx++) for(var dy=-1;dy<=1;dy++) if(et(map,tx+dx,ty+dy)===2) return true; return false; } // real (un-muted) water in the 8-neighbourhood

  // ---------- MOUNTAIN CONSOLIDATION (DATA MUTATION — owner-approved sandbox exception 2026-07-06) ----------
  // Raw tile-4 (mountain) placement is SPRINKLED (isolated singles scattered in grass/sand). Owner decision:
  // MUTATE scene.mapData IN PLACE (not a render-only overlay set) so overlay == minimap == collision all read
  // the same consolidated data (overlay-only left the minimap still showing sprinkle + a collision mismatch).
  // This is a DELIBERATE, owner-approved exception to the render-only rule, scoped to the sandbox demo only —
  // nothing is deployed; the map GENERATOR is never touched; we mutate the already-generated in-memory array.
  // ONLY tile values 4 (mountain) and 0/18 (grass/sand background) ever change — roads(1)/water(2)/bridge(5)/
  // tree(3)/all landmarks are NEVER touched.
  //   1. PRUNE: each 8-conn mountain(4) component < MIN_KEEP=6 -> every tile set to the majority background
  //      value among its 4-neighbourhood (0 grass or 18 sand, whichever more common; default 0). Kills sprinkle.
  //   2. FILL (AGGRESSIVE — owner OPTION 2, 2026-07-08): a background tile (0/18) with >= FILL_MIN=4 mountain
  //      neighbours (post-prune) AND passing the BIOME-AWARE 5x5 density guard (raw-4 count <= a cap set by the
  //      candidate's OWN background: SAND(18) -> DENS_MAX=12 [desert open]; GRASS(0) -> DENS_MAX_GRASS=25 = the
  //      full 25-tile window, effectively UNCAPPED so grassland solidifies — owner OPTION 1, 2026-07-08)
  //      AND NOT orthogonally adjacent to a road(1) or bridge(5) -> becomes 4. Lowered from 7 (via an interim
  //      5) to solidify the sparse/grassland mountain clusters into visibly chunkier massifs — at 5 the two
  //      already-dense reference massifs (near 85,42 and the 208,120 desert cave) showed NO visible change since
  //      DENS_MAX=12 already capped them; 4 was needed to move sparser grassland clusters. The road/bridge-
  //      adjacency exclusion is path-safety layer 1 (a fill can no longer flank an intended route) — DENS_MAX
  //      still protects the desert's open sand from becoming a solid wall (SAND cap only after OPTION 1 — grass uncapped).
  //   Prune first, then fill (fill reads post-prune mountains). Applied ONCE per map identity, cached.
  // SAFETY (validated live, see /tmp/dq_mutate_validate.js + change-log §5). At FILL_MIN=4 a fill candidate can
  //   have up to 4 non-mountain neighbours, so unlike the old FILL_MIN=7 (<=1 non-mountain neighbour, structurally
  //   near-enclosed) a fill CAN now sit on a real corridor even after the road/bridge exclusion (e.g. a non-road
  //   grass gap). TWO gates run after prune+fill, in order:
  //   (a) ORPHAN CHECK (path-safety layer 2, the real fix) — BFS the walkable-reachable set from the player start;
  //       ANY tile reachable BEFORE the mutation (excluding the fill targets themselves, which are expected to
  //       drop out) that is NOT reachable AFTER means a fill cut a corridor. The boundary fills touching the
  //       newly-orphaned pocket are reverted and the BFS re-run; repeats to convergence (strictly shrinks the
  //       surviving fill list each pass, so it is guaranteed to terminate at orphaned_tile_count===0 — worst case
  //       all fills revert, which is provably orphan-free since prune-only mutation can never remove reachability).
  //   (b) LANDMARK CHECK (original gate, kept as-is) — the reachable-LANDMARK set (village/cave/castle/portal/
  //       shadow/signpost/storm/crystal/ice/tomb/desert-sign) must be IDENTICAL before/after. Catches what (a)
  //       cannot: a landmark whose EVERY reachable doorstep tile was itself consumed by fill (each is a legitimate
  //       fill target, not an "orphan"), or a prune that breached a barrier (gained landmark). A lost landmark
  //       reverts all surviving fills; a gained landmark reverts all prunes; re-validated after revert.
  //   Measured results are NOT hardcoded here (they go stale the moment constants tune) — see the change log.
  var MIN_KEEP=6, FILL_MIN=4, DENS_MAX=12, DENS_MAX_GRASS=25, STUCK_TREE_MTN=5; // OPTION 1 biome-aware fill cap (2026-07-08): DENS_MAX=12 = SAND cap (desert stays open); DENS_MAX_GRASS=25 = full 5x5 window => grass effectively UNCAPPED so grassland solidifies. STUCK_TREE_MTN=5 (owner 2026-07-09): a tree(3) with >= 5 of its 8 neighbours = mountain is "stuck" INSIDE a mountain cluster -> becomes mountain (blends into the massif); the tree de-scatter idea was reverted — this is the real fix
  // walkability (mirrors bundle canMove overworld branch) — for the reachability safety gate ONLY (never mutates)
  var OW_BLOCK={2:1,4:1,6:1,7:1,8:1,9:1,10:1,11:1,12:1,13:1,14:1,15:1,16:1,19:1,20:1,21:1};
  var OW_LANDMARKS=[6,7,8,9,10,11,12,15,16,19,20];
  function owWalkable(v){ return !OW_BLOCK[v]; }
  // BFS reachable-walkable set from (sx,sy); returns { seen:Uint8Array, lm:Set of "<val>@x,y" reachable landmarks }
  function owReach(map,W,H,sx,sy){
    var seen=new Uint8Array(W*H), q=[sx,sy], head=0; seen[sy*W+sx]=1;
    while(head<q.length){ var x=q[head++], y=q[head++];
      var nb4=[x-1,y, x+1,y, x,y-1, x,y+1];
      for(var i=0;i<8;i+=2){ var nx=nb4[i], ny=nb4[i+1]; if(nx<0||ny<0||nx>=W||ny>=H) continue; var kk=ny*W+nx;
        if(seen[kk]||!owWalkable(map[ny][nx])) continue; seen[kk]=1; q.push(nx,ny); } }
    var lm=new Set(), LM={}; for(var l=0;l<OW_LANDMARKS.length;l++) LM[OW_LANDMARKS[l]]=1;
    for(var y2=0;y2<H;y2++) for(var x2=0;x2<W;x2++){ var v=map[y2][x2]; if(!LM[v]) continue;
      var o4=[x2-1,y2, x2+1,y2, x2,y2-1, x2,y2+1];
      for(var j=0;j<8;j+=2){ var ax=o4[j], ay=o4[j+1]; if(ax<0||ay<0||ax>=W||ay>=H) continue; if(seen[ay*W+ax]){ lm.add(v+'@'+x2+','+y2); break; } } }
    return { seen:seen, lm:lm };
  }
  // The mutation. Cached per map-array identity so it runs exactly once per map load. Returns a stats object.
  var mutatedMap=null, mutStats=null;
  var DXc=[-1,0,1,-1,1,-1,0,1], DYc=[-1,-1,-1,0,0,1,1,1];
  function consolidateMapData(scene){
    var map=scene.mapData; if(!map||!map.length) return null;
    if(mutatedMap===map && mutStats) return mutStats;               // already mutated this map
    var H=map.length, W=map[0].length;
    // player start (for the reachability gate). Fall back to any walkable tile if hero pos missing.
    var sx=(typeof scene.heroTileX==='number')?scene.heroTileX:-1, sy=(typeof scene.heroTileY==='number')?scene.heroTileY:-1;
    if(sx<0||sy<0||sx>=W||sy>=H||!owWalkable(map[sy][sx])){ sx=-1; for(var yy=0;yy<H&&sx<0;yy++) for(var xx=0;xx<W;xx++){ if(owWalkable(map[yy][xx])){ sx=xx; sy=yy; break; } } }
    var before=owReach(map,W,H,sx,sy);

    // ---- 1. PRUNE: straggler mountain(4) components < MIN_KEEP -> majority background 4-neighbour value ----
    var pruneList=[];                                                 // {x,y,to} applied
    var seen=new Uint8Array(W*H);
    for(var y=0;y<H;y++) for(var x=0;x<W;x++){ if(map[y][x]!==4||seen[y*W+x]) continue;
      var st=[x,y], comp=[]; seen[y*W+x]=1;
      while(st.length){ var cy=st.pop(), cx=st.pop(); comp.push(cx,cy);
        for(var k=0;k<8;k++){ var nx=cx+DXc[k], ny=cy+DYc[k]; if(nx<0||ny<0||nx>=W||ny>=H) continue;
          var kk=ny*W+nx; if(seen[kk]||map[ny][nx]!==4) continue; seen[kk]=1; st.push(nx,ny); } }
      if(comp.length/2 < MIN_KEEP){
        for(var c=0;c<comp.length;c+=2){ var px=comp[c], py=comp[c+1], n0=0,n18=0,
            o4=[px-1,py, px+1,py, px,py-1, px,py+1];
          for(var q=0;q<8;q+=2){ var ax=o4[q], ay=o4[q+1]; if(ax<0||ay<0||ax>=W||ay>=H) continue; var av=map[ay][ax]; if(av===0)n0++; else if(av===18)n18++; }
          var to=(n18>n0)?18:0; map[py][px]=to; pruneList.push({x:px,y:py,to:to}); }
      }
    }
    // ---- 2. FILL: background(0/18) with >=FILL_MIN mountain neighbours (post-prune) + 5x5 density guard
    //      + PATH-SAFETY layer 1: exclude candidates orthogonally adjacent to a road(1) or bridge(5) (those
    //      flank an intended route). Layer 2 (orphan check, catches non-road corridor cuts) runs after. ----
    var fillList=[];                                                  // {x,y,from} applied
    var addF=[];
    for(var y2=0;y2<H;y2++) for(var x2=0;x2<W;x2++){ var t2=map[y2][x2]; if(t2!==0&&t2!==18) continue;
      var cnt=0; for(var k2=0;k2<8;k2++){ var nx2=x2+DXc[k2], ny2=y2+DYc[k2]; if(nx2<0||ny2<0||nx2>=W||ny2>=H) continue; if(map[ny2][nx2]===4) cnt++; }
      if(cnt<FILL_MIN) continue;
      var dens=0; for(var gy=-2;gy<=2;gy++){ var yy2=y2+gy; if(yy2<0||yy2>=H) continue; var grow=map[yy2]; for(var gx=-2;gx<=2;gx++){ var xx2=x2+gx; if(xx2<0||xx2>=W) continue; if(grow[xx2]===4) dens++; } }
      if(dens > (t2===0?DENS_MAX_GRASS:DENS_MAX)) continue;   // OPTION 1 biome-aware: grass(0) uncapped -> solidify; sand(18) capped at 12 -> desert stays open
      var o4f=[x2-1,y2, x2+1,y2, x2,y2-1, x2,y2+1], nearRoad=false;
      for(var rf=0;rf<8;rf+=2){ var rx2=o4f[rf], ry2=o4f[rf+1]; if(rx2<0||ry2<0||rx2>=W||ry2>=H) continue; var rv=map[ry2][rx2]; if(rv===1||rv===5){ nearRoad=true; break; } }
      if(nearRoad) continue;
      addF.push(x2,y2,t2);
    }
    for(var a=0;a<addF.length;a+=3){ var fx=addF[a], fy=addF[a+1], ff=addF[a+2]; map[fy][fx]=4; fillList.push({x:fx,y:fy,from:ff}); }

    // ---- 2b. STUCK-TREE REMOVAL (owner 2026-07-09, THE fix) — a tree embedded INSIDE a mountain cluster (a green
    //      tree poking out of a brown massif) is the real visual issue. A tree(3) with >= STUCK_TREE_MTN of its 8
    //      neighbours = mountain is "stuck": convert it to mountain so the massif reads solid. Pushed onto fillList
    //      with from=3, so the SAME orphan + landmark gates below protect any walkable route the tree sat on (a
    //      revert restores the tree). Trees away from mountains (the vast majority, 8039/8431) are UNTOUCHED — this
    //      is deliberately NOT the reverted whole-map de-scatter; only mountain-embedded trees change. ----
    //      Iterates to a fixed point: converting one embedded tree can push a still-transitional neighbour up to the
    //      threshold, so repeat until a pass converts nothing. This finishes the massif's tree↔mountain transition
    //      WITHOUT cascading into open forest — an interior forest tree has ~0 mountain neighbours, so it can never
    //      reach STUCK_TREE_MTN no matter how many of ITS neighbours convert (they're forest too). Monotonic (only
    //      3->4), so it terminates.
    for(;;){ var sChanged=0;
      for(var sy2=0;sy2<H;sy2++) for(var sx2=0;sx2<W;sx2++){ if(map[sy2][sx2]!==3) continue;
        var sm=0; for(var sk=0;sk<8;sk++){ var snx=sx2+DXc[sk], sny=sy2+DYc[sk]; if(snx<0||sny<0||snx>=W||sny>=H) continue; if(map[sny][snx]===4) sm++; }
        if(sm>=STUCK_TREE_MTN){ map[sy2][sx2]=4; fillList.push({x:sx2,y:sy2,from:3}); sChanged++; } }
      if(!sChanged) break;
    }

    // ---- 3a. ORPHAN CHECK (path-safety layer 2, the real fix for aggressive FILL_MIN): BFS the walkable-
    //      reachable set after ALL fills. Any tile reachable BEFORE (excluding fill targets themselves) that is
    //      NOT reachable AFTER means a fill cut a corridor. Revert the boundary fills touching the orphaned
    //      pocket, re-BFS, repeat. Strictly shrinks the surviving fill list each pass that finds orphans, so it
    //      is guaranteed to terminate (worst case: all fills revert, which is provably orphan-free since
    //      prune-only mutation can never remove reachability). ----
    var orphanRevertTotal=0, orphans=[];
    for(;;){
      var chk=owReach(map,W,H,sx,sy);
      var fillSet=new Set(); for(var fsi=0;fsi<fillList.length;fsi++) fillSet.add(fillList[fsi].y*W+fillList[fsi].x);
      orphans=[];
      for(var oy=0;oy<H;oy++) for(var ox=0;ox<W;ox++){ var oidx=oy*W+ox;
        if(!before.seen[oidx]) continue;                // wasn't reachable before -> not our concern
        if(fillSet.has(oidx)) continue;                 // an intended fill target -> expected to drop out
        if(!chk.seen[oidx]) orphans.push(ox,oy);
      }
      if(!orphans.length) break;
      // boundary fills: any remaining fill tile orthogonally adjacent to an orphaned tile
      var cutSet=new Set();
      for(var oi2=0;oi2<orphans.length;oi2+=2){ var oxx=orphans[oi2], oyy=orphans[oi2+1];
        var oadj=[oxx-1,oyy, oxx+1,oyy, oxx,oyy-1, oxx,oyy+1];
        for(var ai=0;ai<8;ai+=2){ var aax=oadj[ai], aay=oadj[ai+1]; if(aax<0||aay<0||aax>=W||aay>=H) continue;
          var aidx=aay*W+aax; if(fillSet.has(aidx)) cutSet.add(aidx); }
      }
      if(!cutSet.size){ for(var fi2=0;fi2<fillList.length;fi2++) cutSet.add(fillList[fi2].y*W+fillList[fi2].x); } // safety fallback
      var keepFill=[];
      for(var fi3=0;fi3<fillList.length;fi3++){ var fr2=fillList[fi3], fidx=fr2.y*W+fr2.x;
        if(cutSet.has(fidx)){ map[fr2.y][fr2.x]=fr2.from; orphanRevertTotal++; } else keepFill.push(fr2); }
      fillList=keepFill;
      if(!fillList.length) break;                        // nothing left to cut with -> next BFS will show 0 orphans
    }

    // ---- 3b. LANDMARK CHECK (original gate, kept as-is): BFS again; the reachable-landmark set MUST match. ----
    var after=owReach(map,W,H,sx,sy);
    var lost=[], gained=[]; before.lm.forEach(function(v){ if(!after.lm.has(v)) lost.push(v); }); after.lm.forEach(function(v){ if(!before.lm.has(v)) gained.push(v); });
    var reverts=orphanRevertTotal;
    if(lost.length || gained.length){
      // A lost landmark => every reachable doorstep tile of it was itself consumed by fill (the orphan check
      // above doesn't flag legitimate fill targets): revert ALL remaining fills.
      // A gained landmark => a PRUNE breached a barrier: revert ALL prunes (prunes are the only ops that add reachability).
      // (These op-classes are disjoint in effect, so reverting the implicated class and re-validating is sound and terminates.)
      if(lost.length){ for(var fi=0;fi<fillList.length;fi++){ var fr=fillList[fi]; map[fr.y][fr.x]=fr.from; reverts++; } fillList=[]; }
      if(gained.length){ for(var pi=0;pi<pruneList.length;pi++){ var pr=pruneList[pi]; map[pr.y][pr.x]=4; reverts++; } pruneList=[]; }
      after=owReach(map,W,H,sx,sy);
      lost=[]; gained=[]; before.lm.forEach(function(v){ if(!after.lm.has(v)) lost.push(v); }); after.lm.forEach(function(v){ if(!before.lm.has(v)) gained.push(v); });
    }

    // ---- 3c. HOLE-FILL (owner 2026-07-09): replace rogue SINGLE non-mountain tiles fully enclosed inside a
    //      mountain cluster with mountain, so massifs read solid. A tile whose 4 ORTHOGONAL neighbours are ALL
    //      mountain is unreachable (movement is 4-directional -> the player can never step onto it), so filling it
    //      is reachability-neutral and needs no re-gate. ONLY grass(0)/sand(18) are eligible — respects the
    //      water(2)/bridge(5)/landmark locks; mountain-embedded trees are handled by step 2b above. The 4-orthogonal
    //      test fires on 1-tile holes ONLY (a 2+ tile pocket has an orthogonal non-mountain neighbour), matching
    //      "rogue SINGLE tiles". Iterates: filling one single can complete a neighbour's enclosure, so repeat until
    //      a full pass changes nothing (monotonic — each pass only turns 0/18 -> 4 — so it always terminates).
    var holeFillOps=0;
    for(;;){ var changed=0;
      for(var hy=0;hy<H;hy++) for(var hx=0;hx<W;hx++){ var hv=map[hy][hx]; if(hv!==0&&hv!==18) continue;
        if(hy>0&&map[hy-1][hx]===4 && hy<H-1&&map[hy+1][hx]===4 && hx>0&&map[hy][hx-1]===4 && hx<W-1&&map[hy][hx+1]===4){ map[hy][hx]=4; holeFillOps++; changed++; } }
      if(!changed) break; }
    // reachability is provably unchanged (only 4-orth-enclosed, unreachable tiles were filled); recompute anyway so
    // the self-report reflects the FINAL map and would catch any regression.
    after=owReach(map,W,H,sx,sy);
    lost=[]; gained=[]; before.lm.forEach(function(v){ if(!after.lm.has(v)) lost.push(v); }); after.lm.forEach(function(v){ if(!before.lm.has(v)) gained.push(v); });

    var stuckTreeOps=0; for(var sti=0;sti<fillList.length;sti++) if(fillList[sti].from===3) stuckTreeOps++; // stuck-trees carry from=3 on fillList; base fills carry from=0/18 (count what SURVIVED the gates)
    mutatedMap=map;
    mutStats={ W:W,H:H, start:[sx,sy], stuckTreeOps:stuckTreeOps, pruneOps:pruneList.length, fillOps:(fillList.length-stuckTreeOps), holeFillOps:holeFillOps, reverts:reverts,
      orphaned_tile_count:orphans.length,
      before_reachable:countSeen(before.seen), after_reachable:countSeen(after.seen),
      before_landmarks:before.lm.size, after_landmarks:after.lm.size,
      landmarks_lost:lost.slice(), landmarks_gained:gained.slice(),
      safe:(lost.length===0&&gained.length===0&&orphans.length===0) };
    window.__DQ_MUT__=mutStats;
    return mutStats;
  }
  function countSeen(u8){ var n=0; for(var i=0;i<u8.length;i++) if(u8[i]) n++; return n; }
  // After mutation the map data IS the consolidated mountains — inRM is a passthrough to raw tile-4.
  // (Kept as a named indirection so the downstream mountain code — mountainField/drawTerrain/cellObjects/mtnHere —
  //  reads the mutated mapData uniformly, exactly like the minimap and collision now do.)
  function inRM(map,tx,ty){ return nb(map,tx,ty)===4; }

  // ============================================================
  //  TERRAIN CANVAS — pixel helpers over a 2D ctx (1px = 1 native px)
  // ============================================================
  function px(ctx,x,y,c){ ctx.fillStyle=rgb(c); ctx.fillRect(x|0,y|0,1,1); }
  function rect(ctx,x,y,w,h,c){ ctx.fillStyle=rgb(c); ctx.fillRect(x|0,y|0,w|0,h|0); }
  function hline(ctx,x0,x1,y,c){ var a=Math.min(x0,x1),b=Math.max(x0,x1); rect(ctx,a,y,b-a+1,1,c); }
  function vline(ctx,x,y0,y1,c){ var a=Math.min(y0,y1),b=Math.max(y0,y1); rect(ctx,x,a,1,b-a+1,c); }
  function setData(data,w,x,y,c){ var i=(y*w+x)*4; data[i]=c[0]; data[i+1]=c[1]; data[i+2]=c[2]; data[i+3]=255; }

  // per-tile detail (matches .py grass_tile / water_tile / dirt_tile speckles)
  function grassSpeckle(ctx,bx,by,seed){ var r=RNG(seed), n=ri(r,3,5);   // small green grass-blade tufts (NO coloured flowers) -> slightly more detailed grass
    for(var k=0;k<n;k++){ var gx=bx+ri(r,1,N-2), gy=by+ri(r,3,N-2), c=r()<0.5?P.grass_dk:P.grass_dk2;
      px(ctx,gx,gy,c); px(ctx,gx,gy-1,c);                                 // a 2px blade
      if(r()<0.45) px(ctx,gx,gy-2,P.grass_lt);                            // lit tip
      if(r()<0.35){ px(ctx,gx+1,gy,c); px(ctx,gx+1,gy-1,P.grass_lt); }    // a second blade beside it
    }
  }
  function waterStreaks(ctx,bx,by,seed){ var r=RNG(seed); for(var k=0;k<2;k++){ var wy=ri(r,2,N-3),wx=ri(r,1,N-7); hline(ctx,bx+wx,bx+wx+4,by+wy,P.water_lt); } }
  function dirtSpeckle(ctx,bx,by,seed){ var r=RNG(seed); for(var k=0;k<3;k++) px(ctx,bx+ri(r,0,N-1),by+ri(r,0,N-1), r()<0.6?P.dirt_dk:P.dirt_lt); }

  // coast: grass cell bordering water -> sand rim on water-facing side(s) (matches .py coast())
  function coast(ctx,map,TX,TY,bx,by){
    var L=et(map,TX-1,TY)===2,R=et(map,TX+1,TY)===2,U=et(map,TX,TY-1)===2,D=et(map,TX,TY+1)===2;
    if (L){ rect(ctx,bx,by,2,N,P.sand); vline(ctx,bx+2,by,by+N-1,P.sand_dk); }
    if (R){ rect(ctx,bx+N-2,by,2,N,P.sand); vline(ctx,bx+N-3,by,by+N-1,P.sand_dk); }
    if (U){ rect(ctx,bx,by,N,2,P.sand); hline(ctx,bx,bx+N-1,by+2,P.sand_dk); }
    if (D){ rect(ctx,bx,by+N-2,N,2,P.sand); hline(ctx,bx,bx+N-1,by+N-3,P.sand_dk); }
    var oc=[[L,U,bx,by],[R,U,bx+N-2,by],[L,D,bx,by+N-2],[R,D,bx+N-2,by+N-2]];
    for (var i=0;i<4;i++){ var o=oc[i]; if(o[0]&&o[1]) rect(ctx,o[2],o[3],2,2,P.sand); }
    var dg=[[L,U,et(map,TX-1,TY-1)===2,bx,by],[R,U,et(map,TX+1,TY-1)===2,bx+N-2,by],
            [L,D,et(map,TX-1,TY+1)===2,bx,by+N-2],[R,D,et(map,TX+1,TY+1)===2,bx+N-2,by+N-2]];
    for (var j=0;j<4;j++){ var q=dg[j]; if(!q[0]&&!q[1]&&q[2]) rect(ctx,q[3],q[4],2,2,P.sand); }
  }
  // foam: water cell bordering land -> foam line on land-facing edge(s)
  function foam(ctx,map,TX,TY,bx,by){
    if (et(map,TX-1,TY)!==2) vline(ctx,bx,by,by+N-1,P.foam);
    if (et(map,TX+1,TY)!==2) vline(ctx,bx+N-1,by,by+N-1,P.foam);
    if (et(map,TX,TY-1)!==2) hline(ctx,bx,bx+N-1,by,P.foam);
    if (et(map,TX,TY+1)!==2) hline(ctx,bx,bx+N-1,by+N-1,P.foam);
  }
  // path ragged dirt border where path meets grass (matches .py path_border())
  function pathBorder(ctx,map,TX,TY,bx,by){
    var rb=RNG((Math.imul(TX,2654435761)^Math.imul(TY,40503))>>>0);
    function edge(side){ for(var t=0;t<N;t++){ if(rb()<0.5)continue; var depth=rb()<0.6?1:2, col=rb()<0.75?P.dirt_dk:P.dirt_lt;
      for(var dp=0;dp<depth;dp++){ if(side==='L')px(ctx,bx+dp,by+t,col); else if(side==='R')px(ctx,bx+N-1-dp,by+t,col); else if(side==='U')px(ctx,bx+t,by+dp,col); else if(side==='D')px(ctx,bx+t,by+N-1-dp,col); } } }
    if (et(map,TX-1,TY)!==1&&et(map,TX-1,TY)!==2) edge('L');
    if (et(map,TX+1,TY)!==1&&et(map,TX+1,TY)!==2) edge('R');
    if (et(map,TX,TY-1)!==1&&et(map,TX,TY-1)!==2) edge('U');
    if (et(map,TX,TY+1)!==1&&et(map,TX,TY+1)!==2) edge('D');
  }
  // path corner smoothing: round outer path corners to grass, fill inner grass notches with dirt
  function smoothPath(ctx,map,TX,TY,tx,ty,winW,winH,wox,woy){
    var bx=tx*N, by=ty*N;
    var pL=et(map,TX-1,TY)===1,pR=et(map,TX+1,TY)===1,pU=et(map,TX,TY-1)===1,pD=et(map,TX,TY+1)===1;
    function gs(cx,cy){ return gshade(wox+cx,woy+cy); }
    var oc=[[!pL&&!pU,bx,by,1,1],[!pR&&!pU,bx+N-1,by,-1,1],[!pL&&!pD,bx,by+N-1,1,-1],[!pR&&!pD,bx+N-1,by+N-1,-1,-1]];
    for (var i=0;i<4;i++){ var o=oc[i]; if(o[0]){ var cx=o[1],cy=o[2],sx=o[3],sy=o[4];
      px(ctx,cx,cy,gs(cx,cy)); px(ctx,cx+sx,cy,gs(cx+sx,cy)); px(ctx,cx,cy+sy,gs(cx,cy+sy)); } }
    var dg=[[-1,-1],[1,-1],[-1,1],[1,1]];
    for (var d=0;d<4;d++){ var dx=dg[d][0],dy=dg[d][1];
      if (et(map,TX+dx,TY)===1 && et(map,TX,TY+dy)===1 && et(map,TX+dx,TY+dy)!==1 && et(map,TX+dx,TY+dy)!==2){
        var ntx=tx+dx, nty=ty+dy; if(ntx<0||nty<0||ntx>=winW||nty>=winH) continue;
        var gx=ntx*N+(dx<0?N-1:0), gy=nty*N+(dy<0?N-1:0);
        for(var a=0;a<3;a++) for(var bb=0;bb<3;bb++) if(a+bb<=2) px(ctx, gx+(dx<0?-a:a), gy+(dy<0?-bb:bb), P.dirt);
      }
    }
  }

  // ---------- continuous SMOOTH terrain FIELDS (iso-fields, no square corners) ----------
  // Every terrain type is a smooth scalar field: bilinear-interpolate the per-tile mask across
  // tile CENTRES + low-amp noise warp. The 0.5 iso-line is a smooth organic boundary; bands
  // around it form beaches / cliff rims / path edges. Removes ALL tile-grid 90-degree steps,
  // and merges big regions (water, MOUNTAIN ranges) into continuous combined masses.
  function fieldAt(map,wx,wy,want,amp,nscale,nseed){
    var fx=wx/N-0.5, fy=wy/N-0.5, tx0=Math.floor(fx), ty0=Math.floor(fy), rx=fx-tx0, ry=fy-ty0;
    function s(tx,ty){ var v=et(map,tx,ty); return (want===2)?((v===2||v===5)?1:0):(v===want?1:0); }
    var a=s(tx0,ty0),b=s(tx0+1,ty0),c=s(tx0,ty0+1),d=s(tx0+1,ty0+1);
    var F=(a*(1-rx)+b*rx)*(1-ry)+(c*(1-rx)+d*rx)*ry;
    return F + (vnoise(wx,wy,nscale,nseed)-0.5)*amp;
  }
  function waterField(map,wx,wy){ var amp=(typeof window.__DQ_WIGGLE__==='number')?window.__DQ_WIGGLE__:0.26; return fieldAt(map,wx,wy,2,amp,20,33); }
  // The mass field reads raw tile-4 via the standard fieldAt sampler — after consolidateMapData() the raw
  // tile-4 in mapData IS the consolidated cluster shape (sprinkle pruned, near-enclosed holes filled), so no
  // separate RM sampler is needed: overlay mass, minimap, and collision all read the same mutated tiles.
  function mountainField(map,wx,wy){ return fieldAt(map,wx,wy,4,0.20,18,91); }
  // paths smoothed VERY GRADUALLY (low amp) -> uniform width, gentle curves
  function pathField(map,wx,wy){ var amp=(typeof window.__DQ_PATH_WIGGLE__==='number')?window.__DQ_PATH_WIGGLE__:0.10; return fieldAt(map,wx,wy,1,amp,22,53); }
  // natural water — SMOOTH gradient (lerp, no hard tone patches): light/shallow near shore ->
  // deep/dark, driven by the depth field W + low-freq noise, plus sparse wavelet glints.
  // water — 4-tone ramp (deep..shallow) with 4x4 BAYER DITHER, depth-driven (chunkier pixel gradient)
  var WATER_TONES=[P.water_dk, P.water, ic(lerp(P.water,P.water_lt,0.5)), P.water_lt];
  function waterColor(wx,wy,W){
    var n=vnoise(wx,wy,56,5);
    var t=(W-0.5)*1.05 + (0.5-n)*0.38 + 0.12; t=t<0?0:(t>1?1:t);     // 0 shallow .. 1 deep
    var col=rampDither(wx,wy,(1-t)*(WATER_TONES.length-1),WATER_TONES); // deep->dk, shallow->lt
    if (vnoise(wx,wy*2.3,11,17)>0.94) col=P.water_lt;               // rare wavelet glints
    return col;
  }
  // brick-road pattern (warm stone) — staggered courses with mortar grid + per-brick tone
  function brickColor(wx,wy){
    var BH=4, BW=8, row=Math.floor(wy/BH), iy=wy-row*BH, off=(row&1)*(BW>>1), bx=wx+off, colN=Math.floor(bx/BW), ix=bx-colN*BW;
    if (iy===0 || ix===0) return P.mortar;               // mortar lines
    var n=_h(colN,row,313);
    return n<0.28?P.brk_dk:(n<0.74?P.brk:P.brk_lt);
  }
  // rock elevation field — 3 octaves: peaks + ridges + fine grain (natural mountains)
  function elevAt(wx,wy){ return vnoise(wx,wy,44,71)*0.5 + vnoise(wx,wy,20,73)*0.35 + vnoise(wx,wy,9,75)*0.15; }
  var ROCK0=[40,33,26]; // darkest crevice/cliff
  function lerp(a,b,t){ t=t<0?0:(t>1?1:t); return [a[0]+(b[0]-a[0])*t,a[1]+(b[1]-a[1])*t,a[2]+(b[2]-a[2])*t]; }
  // GRADUAL rock ramp (smooth tone gradient, not sharp bands): ROCK0->dk->rock->lt->snow
  function rockRamp(L){
    if (L<0.25) return lerp(ROCK0,P.rock_dk,L/0.25);
    if (L<0.55) return lerp(P.rock_dk,P.rock,(L-0.25)/0.30);
    if (L<0.82) return lerp(P.rock,P.rock_lt,(L-0.55)/0.27);
    return lerp(P.rock_lt,P.snow,(L-0.82)/0.18);
  }

  // draw the whole visible window into ctx (continuous world coords, smooth boundaries)
  // ---------- ROADS: a deliberate auto-tiled layer (NOT the noise field) — brick interior + dirt RIM,
  // arms that CONNECT through junctions (no split), and roads continue UNDER landmark tiles so the
  // special-asset prop sits on a continuous path instead of notching it. Drawn on top of the base terrain.
  // Landmark classes: a DUNGEON-type landmark blends into natural terrain (NO road under/around it); a
  // SETTLEMENT (village/castle/signpost) keeps a road running under it. Owner 2026-07-03: dungeons must
  // sit in the wild, not on a brick patch. The generator carves a walkable path-BLOB around each cave/tomb
  // (Phase 8 "clear adjacent tiles for walkability"); we dissolve that blob back to terrain in the RE-SKIN
  // ONLY — the deployed map data is never mutated, so walkability/barriers are unchanged.
  var DUNG_LANDMARK={7:1,9:1,10:1,12:1,15:1,16:1,19:1};   // cave/portal/shadow/storm/crystal/ice/tomb
  var SETTLE_LANDMARK={6:1,8:1,11:1,20:1};                 // village/castle/signpost/desert-sign
  var owCleared=null, owClearedMap=null, owClearedW=0;
  // Per-map set of path tiles to render as TERRAIN (grass) instead of road: (1) a Chebyshev-R clearing around
  // every dungeon landmark, PLUS (2) small stray path COMPONENTS that touch no settlement (generator leftovers:
  // Phase-8 clearing crumbs, pathBetween 3-wide overshoot, diagonal-gap islands). Real roads connect civilisation
  // and form large components, so they survive. Rendering-only; the deployed map data is never mutated.
  function ensureCleared(map){
    if(owClearedMap===map && owCleared) return;
    owClearedMap=map; var H=map.length, W=map[0].length; owClearedW=W;
    var clear=new Set(), R=2, MIN=6, DX=[0,0,-1,1], DY=[-1,1,0,0];
    for(var y=0;y<H;y++){ var row=map[y]; for(var x=0;x<W;x++){ if(DUNG_LANDMARK[row[x]]){   // (1) dungeon clearing
      for(var dy=-R;dy<=R;dy++){ var yy=y+dy; if(yy<0||yy>=H)continue; var r2=map[yy];
        for(var dx=-R;dx<=R;dx++){ var xx=x+dx; if(xx<0||xx>=W)continue; if(r2[xx]===1) clear.add(yy*W+xx); } }
    }}}
    function rr(x,y){ var v=map[y][x];                                                        // roadish tile? (for connectivity)
      if(v===5) return true;
      if(v===1) return !clear.has(y*W+x);
      if(SETTLE_LANDMARK[v]){ var a=map[y][x-1],b=map[y][x+1],u=map[y-1]&&map[y-1][x],d=map[y+1]&&map[y+1][x];
        return a===1||b===1||u===1||d===1||a===5||b===5||u===5||d===5; }
      return false; }
    var seen=new Uint8Array(W*H);                                                             // (2) suppress small stray components
    for(var y3=0;y3<H;y3++)for(var x3=0;x3<W;x3++){ var s0=y3*W+x3; if(seen[s0]||!rr(x3,y3))continue;
      var st=[x3,y3], comp=[], settle=false; seen[s0]=1;
      while(st.length){ var cy=st.pop(), cx=st.pop(); comp.push(cx,cy); if(SETTLE_LANDMARK[map[cy][cx]])settle=true;
        for(var k=0;k<4;k++){ var nx=cx+DX[k], ny=cy+DY[k]; if(nx<0||ny<0||nx>=W||ny>=H)continue;
          var kk=ny*W+nx; if(seen[kk]||!rr(nx,ny))continue; seen[kk]=1; st.push(nx,ny); } }
      if(!settle && comp.length/2 < MIN){ for(var c=0;c<comp.length;c+=2){ if(map[comp[c+1]][comp[c]]===1) clear.add(comp[c+1]*W+comp[c]); } }
    }
    owCleared=clear;
  }
  function isOwRoad(map,tx,ty){
    var v=et(map,tx,ty);
    if(DUNG_LANDMARK[v]) return false;                    // dungeon tile itself -> natural terrain, no road
    if(v===5) return true;                                // bridge always spans as a deck
    if(v===1){ ensureCleared(map); return !owCleared.has(ty*owClearedW+tx); } // path, unless cleared or strayed away
    if(SETTLE_LANDMARK[v]) return (et(map,tx-1,ty)===1||et(map,tx+1,ty)===1||et(map,tx,ty-1)===1||et(map,tx,ty+1)===1
       ||et(map,tx-1,ty)===5||et(map,tx+1,ty)===5||et(map,tx,ty-1)===5||et(map,tx,ty+1)===5); // settlement on a path
    return false;
  }
  function roadOn(m,xx,yy,hw){                                                    // m={N,E,S,W,NE,NW,SE,SW}: hub + arms + inner-corner fill
    var c=N/2, dx=xx-c+0.5, dy=yy-c+0.5;
    if(dx*dx+dy*dy<hw*hw) return true;                                            // circular hub
    if(m.N && dx>-hw && dx<hw && yy<c) return true;                               // rect arms toward road neighbours
    if(m.S && dx>-hw && dx<hw && yy>=c) return true;
    if(m.W && dy>-hw && dy<hw && xx<c) return true;
    if(m.E && dy>-hw && dy<hw && xx>=c) return true;
    if(m.N&&m.E&&m.NE && xx>=c && yy<c) return true;                              // inner corners (road-mass interior) -> no grass diamond
    if(m.S&&m.E&&m.SE && xx>=c && yy>=c) return true;
    if(m.N&&m.W&&m.NW && xx<c && yy<c) return true;
    if(m.S&&m.W&&m.SW && xx<c && yy>=c) return true;
    return false;
  }
  function drawRoadTile(ctx,map,tx,ty,bx,by){
    var m={N:isOwRoad(map,tx,ty-1),E:isOwRoad(map,tx+1,ty),S:isOwRoad(map,tx,ty+1),W:isOwRoad(map,tx-1,ty),
           NE:isOwRoad(map,tx+1,ty-1),NW:isOwRoad(map,tx-1,ty-1),SE:isOwRoad(map,tx+1,ty+1),SW:isOwRoad(map,tx-1,ty+1)};
    for(var yy=0;yy<N;yy++) for(var xx=0;xx<N;xx++){
      if(roadOn(m,xx,yy,6.5)){                                                    // outer = rim shape
        if(roadOn(m,xx,yy,5.0)) px(ctx,bx+xx,by+yy,brickColor(bx+xx,by+yy));      // brick interior
        else px(ctx,bx+xx,by+yy, ((xx+yy)&1)?P.dirt_dk:P.dirt);                   // ~1.5px dirt RIM -> contained edge
      }
    }
  }
  function drawTerrain(ctx, map, X0, Y0, winW, winH){
    var cw=winW*N, ch=winH*N, wox=X0*N, woy=Y0*N;
    var SANDLO=(typeof window.__DQ_BEACH__==='number')?window.__DQ_BEACH__:0.27, FOAMHI=0.555; // wider, more gradual beach
    // presence scan — skip the expensive fields in windows with none of that type
    var hasMtn=false, hasPath=false;
    for (var sy=0;sy<winH;sy++){ for (var sx=0;sx<winW;sx++){ var sv=et(map,X0+sx,Y0+sy); if(sv===4)hasMtn=true; else if(sv===1)hasPath=true; } if(hasMtn&&hasPath)break; }
    var elev=null;
    if (hasMtn){ elev=new Float32Array(cw*ch); for(var ey=0;ey<ch;ey++) for(var ex=0;ex<cw;ex++) elev[ey*cw+ex]=elevAt(wox+ex,woy+ey); }
    var img=ctx.createImageData(cw,ch), data=img.data; // alpha 0 everywhere by default
    for (var py=0;py<ch;py++){ var wy=woy+py, ty=Math.floor(wy/N);
      for (var pxk=0;pxk<cw;pxk++){ var wx=wox+pxk, tx=Math.floor(wx/N), tB=et(map,tx,ty);
        if (isSpecial(tB)){ if(OW_LANDMARK[tB]) setData(data,cw,pxk,py,gshade(wx,wy)); continue; } // landmark tiles -> grass under our prop; other specials (incl. tiles pruned to sand=18) stay transparent (engine draws biome ground)
        var col;
        var W=waterField(map,wx,wy);                     // water field covers bridge(5) too -> water under the deck
        if (W>=0.50){
          if (W<FOAMHI) col=P.foam; else col=waterColor(wx,wy,W);       // natural multi-tone water
        } else {
          var Mf = hasMtn ? mountainField(map,wx,wy) : -1;
          if (Mf>=0.50){   // mass follows raw tile-4, which is now the CONSOLIDATED cluster shape post-mutation
            // NATURAL MOUNTAIN MASS (heightfield + 3D slope shading + snow caps) — unchanged
            var i=py*cw+pxk, e=elev[i];
            var eL=pxk>0?elev[i-1]:e, eR=pxk<cw-1?elev[i+1]:e, eU=py>0?elev[i-cw]:e, eD=py<ch-1?elev[i+cw]:e;
            var bri=-((eR-eL)+(eD-eU)), tex=(vnoise(wx,wy,6,201)-0.5)*0.05;
            var L=0.5 + bri*4 + (e-0.5)*0.14 + tex;
            var Lc = L>0.80?0.80:L;
            col = (Mf<0.52) ? lerp(ROCK0,P.rock_dk,0.4) : rockRamp(Lc);
          } else if (W>=SANDLO){
            col=lerp(P.sand,P.sand_dk,(W-SANDLO)/(0.50-SANDLO));         // beach band near water
          } else {
            col=gshade(wx,wy);                                          // grass (paths are now a SEPARATE overlaid road layer)
          }
        }
        setData(data,cw,pxk,py,col);
      }
    }
    ctx.putImageData(img,0,0);
    // ROAD LAYER: deliberate auto-tiled roads (path + bridge + landmark-on-path) drawn ON TOP of the base terrain
    for (var rty=0;rty<winH;rty++){ var RTY=Y0+rty; for (var rtx=0;rtx<winW;rtx++){ var RTX=X0+rtx;
      if (isOwRoad(map,RTX,RTY)) drawRoadTile(ctx,map,RTX,RTY,rtx*N,rty*N); } }
    // texture pass: bridge rails + interior grass dots
    for (var ty1=0;ty1<winH;ty1++){ var TY1=Y0+ty1;
      for (var tx1=0;tx1<winW;tx1++){ var TX1=X0+tx1, t1=et(map,TX1,TY1); if(isSpecial(t1))continue;
        var bx1=tx1*N, by1=ty1*N, seed=(Math.imul(TX1,131)^Math.imul(TY1,977))>>>0;
        // BRIDGE: explicit bridge tile (5) OR a path (1) spanning water on opposite sides
        var crossesW = t1===1 && ((et(map,TX1-1,TY1)===2&&et(map,TX1+1,TY1)===2)||(et(map,TX1,TY1-1)===2&&et(map,TX1,TY1+1)===2));
        if (t1===5 || crossesW){ bridgeRails(ctx,map,TX1,TY1,bx1,by1); continue; }
        if (t1===0 && et(map,TX1-1,TY1)===0&&et(map,TX1+1,TY1)===0&&et(map,TX1,TY1-1)===0&&et(map,TX1,TY1+1)===0) grassSpeckle(ctx,bx1,by1,seed);
      }
    }
  }
  // bridge side rails (along the run) so a path crossing water reads as a bridge
  function bridgeRails(ctx,map,TX,TY,bx,by){
    var vertical = (et(map,TX-1,TY)===2||et(map,TX+1,TY)===2); // water on L/R -> bridge runs N-S
    if (vertical){ rect(ctx,bx,by,1,N,P.brk_dk); rect(ctx,bx+N-1,by,1,N,P.brk_dk); for(var y=2;y<N;y+=4) hline(ctx,bx+1,bx+N-2,by+y,P.mortar); }
    else { rect(ctx,bx,by,N,1,P.brk_dk); rect(ctx,bx,by+N-1,N,1,P.brk_dk); for(var x=2;x<N;x+=4) vline(ctx,bx+x,by+1,by+N-2,P.mortar); }
  }

  // ============================================================
  //  OBJECT SPRITES (drawn into overlay textures at SC=3) — ported from .py
  // ============================================================
  function shadowSpr(ctx,cx,by,w){ ctx.fillStyle=rgb(P.shadow); ctx.beginPath(); ctx.ellipse(cx,by,w,2,0,0,Math.PI*2); ctx.fill(); }
  function polyf(ctx,pts,c){ ctx.fillStyle=rgb(c); ctx.beginPath(); ctx.moveTo(pts[0][0],pts[0][1]); for(var i=1;i<pts.length;i++) ctx.lineTo(pts[i][0],pts[i][1]); ctx.closePath(); ctx.fill(); }
  function lineP(ctx,a,b,c){ var x0=a[0]|0,y0=a[1]|0,x1=b[0]|0,y1=b[1]|0,dx=Math.abs(x1-x0),dy=-Math.abs(y1-y0),sx=x0<x1?1:-1,sy=y0<y1?1:-1,err=dx+dy; ctx.fillStyle=rgb(c); while(true){ ctx.fillRect(x0,y0,1,1); if(x0===x1&&y0===y1)break; var e2=2*err; if(e2>=dy){err+=dy;x0+=sx;} if(e2<=dx){err+=dx;y0+=sy;} } }
  // ORGANIC pine — each (variant,shape) seed yields a unique conifer: random tier count, irregular
  // jittered/asymmetric tier widths, lean + per-tier wobble, varied tier heights + trunk. A small
  // set of shapes (picked per-tree by hash) gives real variety without a per-tree texture blowup.
  function pine(ctx,cx,by,variant,shape){
    var v=TREEV[variant], d=P[v[0]], m=P[v[1]], l=P[v[2]];
    var d2=[Math.round(d[0]*0.55),Math.round(d[1]*0.55),Math.round(d[2]*0.55)]; // deepest shadow tone
    var r=RNG(shape*733+variant*97+11);
    // PER-TREE proportions vary for variety; each tier is CENTERED + equal-width => SYMMETRICAL.
    // Each layer has DEPTH: a drop-shadow fringe behind (separation), a shaded underside, a lit
    // top-left, + needle detail — so it reads as a layered 3D conifer, not flat stacked triangles.
    var tiers=ri(r,3,5), baseW=ri(r,6,9), trunkH=ri(r,4,6), th=ri(r,4,5);
    rect(ctx,cx-1,by-trunkH,3,trunkH,P.trunk); vline(ctx,cx+1,by-trunkH,by-1,P.trunk_dk); px(ctx,cx-1,by-1,P.trunk_dk);
    var cy=by-trunkH;
    for (var i=0;i<tiers;i++){
      var t=tiers>1?i/(tiers-1):0;
      var w=Math.max(2, Math.round(baseW*(1-t*0.72)));                  // symmetric taper
      var apY=cy-th, sh=Math.max(1,Math.round(th*0.5)), w35=Math.round(w*0.38), w55=Math.round(w*0.55);
      polyf(ctx,[[cx-w-2,cy+2],[cx,apY],[cx+w+2,cy+2]],d2);             // drop-shadow fringe (behind -> tier separation/depth)
      polyf(ctx,[[cx-w,cy],[cx,apY],[cx+w,cy]],m);                      // canopy body (mid)
      polyf(ctx,[[cx-w,cy],[cx-w35,cy-sh],[cx+w35,cy-sh],[cx+w,cy]],d); // shaded UNDERSIDE (bottom darker = depth)
      var hl=[Math.round((m[0]+l[0])/2),Math.round((m[1]+l[1])/2),Math.round((m[2]+l[2])/2)]; // soft highlight (m..l midpoint)
      lineP(ctx,[cx-1,apY+1],[cx-w55,cy-Math.round(th*0.4)],hl);       // SUBTLE lit edge along the upper-left slope (no bright patch)
      px(ctx,cx-w35,cy-1,d2); px(ctx,cx+w35,cy-1,d2);                   // needle/branch detail (symmetric)
      cy=apY+1;                                                         // overlap into next tier
    }
  }
  function flowerSpr(ctx,cx,by,col){ px(ctx,cx,by-1,col); px(ctx,cx+1,by-1,col); px(ctx,cx,by,col); px(ctx,cx+1,by,col); }
  // NATURAL mountain (NOT a perfect triangle): jagged irregular ridgeline w/ sub-peaks, lit-left
  // /shadow-right faces, crevice lines, irregular snow cap. Overlap many of these -> a range.
  function mountainSpr(ctx,cx,by,seed,small){
    var r=RNG(seed);
    var W=small?ri(r,8,11):ri(r,13,17), H=small?ri(r,11,15):ri(r,18,24), lean=ri(r,-2,2);
    var ax=cx+lean, ay=by-H;
    function jl(x0,y0,x1,y1,n,jit){ var p=[]; for(var i=1;i<n;i++){ var t=i/n, x=x0+(x1-x0)*t, y=y0+(y1-y0)*t; x+=(r()-0.5)*jit; y+=(r()-0.5)*jit*0.8; p.push([Math.round(x),Math.round(y)]); } return p; }
    var Lr=jl(cx-W,by,ax,ay,4,W*0.55), Rr=jl(ax,ay,cx+W,by,4,W*0.55);
    var sil=[[cx-W,by]].concat(Lr,[[ax,ay]],Rr,[[cx+W,by]]);
    for (var i=0;i<sil.length-1;i++) lineP(ctx,sil[i],sil[i+1],[46,40,32]);   // soft dark outline
    polyf(ctx,sil,P.rock);                                                    // body mid-rock
    polyf(ctx,[[cx-W,by]].concat(Lr,[[ax,ay],[ax,by]]),P.rock_lt);            // LIT (left) face — bright
    polyf(ctx,[[ax,ay]].concat(Rr,[[cx+W,by],[ax,by]]),P.rock_dk);            // SHADOW (right) face
    lineP(ctx,[ax,ay],[ax,by-1],P.rock);                                      // soft mid ridge seam
    lineP(ctx,[ax-1,ay+3],[ax-((W*0.45)|0),by-2],P.rock_dk);                  // crevice lines
    lineP(ctx,[ax+1,ay+3],[ax+((W*0.5)|0),by-2],lerp(P.rock_dk,ROCK0,0.4));
    rect(ctx,ax-1,ay,2,2,lerp(P.rock_lt,[210,196,170],0.5));                  // apex catches light (natural peak, NO snow cap)
  }
  function blueNoise(cells,mindist,rng){
    var placed=[], c=cells.slice();
    for(var i=c.length-1;i>0;i--){ var j=Math.floor(rng()*(i+1)); var t=c[i];c[i]=c[j];c[j]=t; }
    for(var k=0;k<c.length;k++){ var x=c[k][0],y=c[k][1],ok=true;
      for(var p=0;p<placed.length;p++){ var dxp=placed[p][0]-x,dyp=placed[p][1]-y; if(dxp*dxp+dyp*dyp<mindist*mindist){ok=false;break;} }
      if(ok) placed.push([x,y]); }
    return placed;
  }

  // ============================================================
  //  OVERLAY TEXTURES (cached by signature)
  // ============================================================
  var texCache={};
  function ensurePineTex(scene,variant,shape){
    var key='dqo_pine_'+variant+'_'+shape; if(texCache[key]) return key;
    var AW=24,AH=32,cx=12,by=AH-2; // fits the layered conifer incl. drop-shadow fringe + full apex
    var cv=document.createElement('canvas'); cv.width=AW*SC; cv.height=AH*SC;
    var ctx=cv.getContext('2d'); ctx.imageSmoothingEnabled=false; ctx.save(); ctx.scale(SC,SC); pine(ctx,cx,by,variant,shape); ctx.restore();
    if(scene.textures.exists(key)) scene.textures.remove(key);
    var t=scene.textures.addCanvas(key,cv); if(t&&t.refresh)t.refresh();
    texCache[key]={aw:AW,ah:AH,cx:cx,by:by}; return key;
  }
  function ensureMtnTex(scene,seed,small){
    var key='dqo_mtn_'+(seed%9973)+'_'+(small?1:0); if(texCache[key]) return key;
    var AW=40,AH=30,cx=20,by=AH-2; // fits the bigger natural peak (W up to 17, H up to 24)
    var cv=document.createElement('canvas'); cv.width=AW*SC; cv.height=AH*SC;
    var ctx=cv.getContext('2d'); ctx.imageSmoothingEnabled=false; ctx.save(); ctx.scale(SC,SC); mountainSpr(ctx,cx,by,seed,small); ctx.restore();
    if(scene.textures.exists(key)) scene.textures.remove(key);
    var t=scene.textures.addCanvas(key,cv); if(t&&t.refresh)t.refresh();
    texCache[key]={aw:AW,ah:AH,cx:cx,by:by}; return key;
  }
  function ensureShadowTex(scene,w){
    var key='dqo_sh_'+w; if(texCache[key]) return key;
    var AW=(w+2)*2,AH=8,cx=AW/2,by=AH/2;
    var cv=document.createElement('canvas'); cv.width=AW*SC; cv.height=AH*SC;
    var ctx=cv.getContext('2d'); ctx.imageSmoothingEnabled=false; ctx.save(); ctx.scale(SC,SC); shadowSpr(ctx,cx,by,w); ctx.restore();
    if(scene.textures.exists(key)) scene.textures.remove(key);
    var t=scene.textures.addCanvas(key,cv); if(t&&t.refresh)t.refresh();
    texCache[key]={aw:AW,ah:AH,cx:cx,by:by}; return key;
  }
  function ensureFlowerTex(scene,colIdx){
    var key='dqo_fl_'+colIdx; if(texCache[key]) return key;
    var cols=[P.fl_gold,P.fl_pale,P.fl_red], col=cols[colIdx], AW=4,AH=4,cx=1,by=2;
    var cv=document.createElement('canvas'); cv.width=AW*SC; cv.height=AH*SC;
    var ctx=cv.getContext('2d'); ctx.imageSmoothingEnabled=false; ctx.save(); ctx.scale(SC,SC); flowerSpr(ctx,cx,by,col); ctx.restore();
    if(scene.textures.exists(key)) scene.textures.remove(key);
    var t=scene.textures.addCanvas(key,cv); if(t&&t.refresh)t.refresh();
    texCache[key]={aw:AW,ah:AH,cx:cx,by:by}; return key;
  }

  // mountain peak placement: tall peaks at hash local-maxima (radius R) + foothill fill so a
  // saturated range reads as a SOLID layered massif (not a flat wall, not sparse dots).
  // Mountain connected-components (8-connectivity). A SMALL component (< MIN tiles) is a lone/rogue mountain,
  // not a range: FLATTEN it — the mass is suppressed to grass in drawTerrain AND no peak sprite is emitted in
  // cellObjects, so it vanishes into open grass instead of reading as a lone floating mini-mountain. Large
  // components stay as the peak range. Rendering-only — map data untouched, so the tiles still block (collision).
  // Cached per-map, keyed by map-array identity.
  var mtnRock=null, mtnRockMap=null, mtnRockW=0;
  function ensureMtn(map){
    if(mtnRockMap===map && mtnRock) return;
    mtnRockMap=map; var H=map.length, W=map[0].length; mtnRockW=W;
    var rockSet=new Set(), MIN=5, seen=new Uint8Array(W*H),
        DX=[-1,0,1,-1,1,-1,0,1], DY=[-1,-1,-1,0,0,1,1,1];
    for(var y=0;y<H;y++)for(var x=0;x<W;x++){ if(map[y][x]!==4||seen[y*W+x])continue;
      var st=[x,y], comp=[]; seen[y*W+x]=1;
      while(st.length){ var cy=st.pop(), cx=st.pop(); comp.push(cx,cy);
        for(var k=0;k<8;k++){ var nx=cx+DX[k], ny=cy+DY[k]; if(nx<0||ny<0||nx>=W||ny>=H)continue;
          var kk=ny*W+nx; if(seen[kk]||map[ny][nx]!==4)continue; seen[kk]=1; st.push(nx,ny); } }
      if(comp.length/2 < MIN){ for(var c=0;c<comp.length;c+=2) rockSet.add(comp[c+1]*W+comp[c]); }
    }
    mtnRock=rockSet;
  }
  function isMtnRock(map,tx,ty){ ensureMtn(map); return mtnRock.has(ty*mtnRockW+tx); }
  // peak-center test — inRM() is now a passthrough to raw tile-4 (post-mutation the mapData IS consolidated),
  // so this is the ORIGINAL raw-tile-4 hash-local-maximum test operating over the consolidated tiles.
  function mtnHere(map,tx,ty){
    if (!inRM(map,tx,ty)) return false;
    var R=(typeof window.__DQ_MTN_RADIUS__==='number')?window.__DQ_MTN_RADIUS__:1;
    var hv=_h(tx,ty,7771);
    for (var dy=-R;dy<=R;dy++) for (var dx=-R;dx<=R;dx++){ if(dx===0&&dy===0)continue; if(!inRM(map,tx+dx,ty+dy))continue;
      var h2=_h(tx+dx,ty+dy,7771); if(h2>hv||(h2===hv&&((ty+dy)*100003+(tx+dx))>(ty*100003+tx))) return false; }
    return true;
  }

  function cellObjects(map,tx,ty){
    var t=map[ty][tx], out=[];
    var cx0=tx*TILE+TILE/2, by0=ty*TILE+(TILE-3), seed=(Math.imul(tx,73856093)^Math.imul(ty,19349663))>>>0, r=RNG(seed);
    if (t===3 && !nearWater(map,tx,ty)){
      // DENSE forest: 2-3 staggered/overlapping pines per cell; each a unique organic shape (0-11) + variant.
      // NO trees right on the coast (user) — nearWater() skips forest cells touching real water.
      var cnt=r()<0.55?3:2;
      for (var k=0;k<cnt;k++){ var jx=ri(r,-11,11),jy=ri(r,-9,11),v=pick(r,[0,0,1,2,3]),shape=ri(r,0,11); out.push({kind:'pine',x:cx0+jx,y:by0+jy,v:v,shape:shape}); }
    } else if (inRM(map,tx,ty)){
      // DENSE overlapping NATURAL peaks (tall ridge peaks at hash local-maxima + foothills) on the
      // calm rock base -> a combined mountain RANGE (not scattered triangles, not a dune mass).
      // inRM == raw tile-4 (post-mutation the mapData holds the consolidated mountains): pruned stragglers are
      // no longer tile-4 (emit nothing), filled holes ARE tile-4 (get mass+peaks). Same sprite calls/seeds/flags.
      if (window.__DQ_MTN_PEAKS__!==false){
        // "fringe" = this mountain tile touches a non-mountain tile on any orthogonal side (cluster EDGE).
        var fringe = !inRM(map,tx-1,ty)||!inRM(map,tx+1,ty)||!inRM(map,tx,ty-1)||!inRM(map,tx,ty+1);
        if (mtnHere(map,tx,ty)){
          // peak-center: TALL peak only if interior; a fringe peak-center gets a SMALL peak (tucked inward, no tall jut past the mass)
          var mj=ri(r,-5,5),mjy=ri(r,-3,4); out.push({kind:'mtn',x:cx0+mj,y:by0+mjy,seed:(tx*5+ty*9),small:fringe});
          if (!fringe && r()<0.5) out.push({kind:'mtn',x:cx0+mj+ri(r,7,13),y:by0+mjy+ri(r,2,5),seed:(tx*13+ty*7+101),small:true}); // extra foothill only for interior tall peaks
        } else {
          var ff=(typeof window.__DQ_MTN_FILL__==='number')?window.__DQ_MTN_FILL__:0.72;
          if (_h(tx,ty,5150)<ff){ var fj=ri(r,-6,6),fjy=ri(r,-2,4); out.push({kind:'mtn',x:cx0+fj,y:by0+fjy,seed:(tx*17+ty*3+57),small:true}); } // small foothill fill (edges + interior gaps)
        }
      }
    }
    // forest-fade: grass cell adjacent to forest -> occasional extra pine (a tile that stays raw-0 grass after
    // mutation is never a mountain, so !inRM is always true here; kept as a guard for clarity/safety)
    if (t===0 && !inRM(map,tx,ty)){ var nearForest=false; for(var dx=-1;dx<=1;dx++) for(var dy=-1;dy<=1;dy++) if(nb(map,tx+dx,ty+dy)===3) nearForest=true;
      if (nearForest && !nearWater(map,tx,ty) && vnoise(tx*TILE,ty*TILE,90,21)>0.62 && r()<0.6){ var jx2=ri(r,-11,11),jy2=ri(r,-8,8); out.push({kind:'pine',x:cx0+jx2,y:by0+jy2,v:pick(r,[0,1,3]),shape:ri(r,0,11)}); } }
    return out;
  }
  function buildFlowers(map,x0,x1,y0,y1){ return []; } // coloured flowers removed per owner (no red/yellow/white speckles); grass detail now via grassSpeckle

  // ============================================================
  //  STATE + LIFECYCLE
  // ============================================================
  var terrainState=null, overlayState=null;
  var NEAREST=(window.Phaser&&Phaser.Textures&&Phaser.Textures.FilterMode)?Phaser.Textures.FilterMode.NEAREST:1;

  function ensureTerrain(scene){
    var cam=scene.cameras.main;
    var winW=Math.ceil(cam.worldView.width/TILE)+2*MARGIN, winH=Math.ceil(cam.worldView.height/TILE)+2*MARGIN;
    if (terrainState && terrainState.scene===scene && terrainState.winW===winW && terrainState.winH===winH && terrainState.image && terrainState.image.scene) return;
    if (terrainState && terrainState.image){ try{ terrainState.image.destroy(); }catch(e){} }
    var key='dqterrain';
    if (scene.textures.exists(key)) scene.textures.remove(key);
    var ct=scene.textures.createCanvas(key, winW*N, winH*N);
    try{ ct.setFilter(NEAREST); }catch(e){}
    var img=scene.add.image(0,0,key).setOrigin(0,0).setDepth(1).setScale(SC);
    try{ img.texture.setFilter(NEAREST); }catch(e){}
    terrainState={ scene:scene, winW:winW, winH:winH, ct:ct, image:img, lastWin:'' };
  }
  function updateTerrain(scene,force){
    if (!terrainState || terrainState.scene!==scene) return;
    var map=scene.mapData; if(!map||!map.length) return;
    var cam=scene.cameras.main, wv=cam.worldView, W=map[0].length, H=map.length, winW=terrainState.winW, winH=terrainState.winH;
    var X0=Math.max(0,Math.floor(wv.x/TILE)-MARGIN), Y0=Math.max(0,Math.floor(wv.y/TILE)-MARGIN);
    if (X0+winW>W) X0=Math.max(0,W-winW);
    if (Y0+winH>H) Y0=Math.max(0,H-winH);
    var key=X0+'_'+Y0; if(!force && key===terrainState.lastWin) return; terrainState.lastWin=key;
    drawTerrain(terrainState.ct.context, map, X0, Y0, winW, winH);
    terrainState.ct.refresh();
    terrainState.image.setPosition(X0*TILE, Y0*TILE);
  }

  function ensureOverlay(scene){
    if (overlayState && overlayState.scene===scene && overlayState.container && overlayState.container.scene) return;
    if (overlayState && overlayState.container){ try{ overlayState.container.destroy(); }catch(e){} }
    var c=scene.add.container(0,0); c.setDepth(5);
    overlayState={ scene:scene, container:c, lastKey:'' };
  }
  function rebuildOverlay(scene,force){
    if (!overlayState || overlayState.scene!==scene) return;
    var map=scene.mapData; if(!map||!map.length) return;
    var cam=scene.cameras.main, wv=cam.worldView, W=map[0].length, H=map.length, M=MARGIN;
    var x0=Math.max(0,Math.floor(wv.x/TILE)-M), x1=Math.min(W-1,Math.ceil((wv.x+wv.width)/TILE)+M);
    var y0=Math.max(0,Math.floor(wv.y/TILE)-M), y1=Math.min(H-1,Math.ceil((wv.y+wv.height)/TILE)+M);
    var key=x0+'_'+x1+'_'+y0+'_'+y1; if(!force && key===overlayState.lastKey) return; overlayState.lastKey=key;
    var c=overlayState.container; c.removeAll(true);
    var objs=[];
    for (var ty=y0;ty<=y1;ty++) for (var tx=x0;tx<=x1;tx++){ var co=cellObjects(map,tx,ty); for(var i=0;i<co.length;i++) objs.push(co[i]); }
    var fl=buildFlowers(map,x0,x1,y0,y1); for(var f=0;f<fl.length;f++) objs.push(fl[f]);
    objs.sort(function(a,b){ return a.y-b.y; });
    for (var k=0;k<objs.length;k++){ var o=objs[k];
      if (o.kind==='pine'){
        var shK=ensureShadowTex(scene,3); c.add(scene.add.image(o.x,o.y,shK).setOrigin(0.5,0.5));
        var pk=ensurePineTex(scene,o.v,o.shape), meta=texCache[pk]; c.add(scene.add.image(o.x,o.y,pk).setOrigin(meta.cx/meta.aw,meta.by/meta.ah));
      } else if (o.kind==='mtn'){
        var mk=ensureMtnTex(scene,o.seed,o.small), mm=texCache[mk]; c.add(scene.add.image(o.x,o.y,mk).setOrigin(mm.cx/mm.aw,mm.by/mm.ah));
      } else if (o.kind==='flower'){
        var fk=ensureFlowerTex(scene,o.col), fm=texCache[fk]; c.add(scene.add.image(o.x,o.y,fk).setOrigin(fm.cx/fm.aw,fm.by/fm.ah));
      }
    }
    window.__DQ_OVERLAY_COUNT__=objs.length;
  }

  function reskin(scene){
    var map=scene.mapData; if(!map||!map.length) return;
    var W=map[0].length;
    var thresh=(typeof window.__DQ_WATER_THRESH__==='number')?window.__DQ_WATER_THRESH__:12;
    MUTED_W=W; MUTED=buildMutedWater(map,thresh); window.__DQ_MUTED_COUNT__=MUTED.size;
    ensureTerrain(scene); updateTerrain(scene,true);
    ensureOverlay(scene); rebuildOverlay(scene,true);
    window.__HD2D_STYLE__='dq';
  }

  // ============================================================
  //  OVERWORLD SPECIAL PROPS — Codex 128px landmark PNGs (owprops/) replace the engine ow-6..ow-21
  //  LANDMARK tiles, rendered BIGGER + bottom-anchored (like the dungeon props) so the 128px detail
  //  reads at game scale, not crushed to 48px. Ground is drawn under them by drawTerrain (landmark ->
  //  grass). Biome-FILL specials (13 ice · 14 grass · 17 snow · 18 sand · 21 lava) stay engine-drawn.
  //  ⚠️ tile→prop map is a BEST GUESS for the ambiguous few (10/16/19) — owner to confirm/correct.
  // ============================================================
  var OW_PROP={ 6:'village', 7:'cave', 8:'castle', 9:'portal', 10:'shadow-cave', 11:'signpost', 12:'storm-nest', 15:'crystal-cave', 16:'ice-cave', 19:'desert-tomb', 20:'desert-signpost' }; // 10/15/16/19 = codex-generated biome dungeon entrances (2026-07-03)
  var OW_LANDMARK={}; (function(){ for (var k in OW_PROP) OW_LANDMARK[k]=1; })();   // which special tiles get grass-under + a prop
  var OW_PROP_SCALE={ castle:2.0, village:1.6, cave:1.4, portal:1.5, 'shadow-cave':1.5, signpost:1.25, 'storm-nest':1.85, 'crystal-cave':1.5, 'ice-cave':1.5, 'desert-tomb':1.6, 'desert-signpost':1.25 };
  var owPropLoading={};
  function owPropKey(name){ return 'owprop_'+name; }
  function preloadOwProps(scene){                                    // load all landmark PNGs via Phaser's loader (reliable in headless; raw new Image() raced)
    var q=0; for(var pk in OW_PROP){ var nm=OW_PROP[pk], key=owPropKey(nm); if(!scene.textures.exists(key)&&!owPropLoading[key]){ owPropLoading[key]=1; scene.load.image(key,'owprops/owprop-'+nm+'-128.png'); q++; } }
    if(q){ scene.load.once('loaderror',function(f){ if(f&&owPropLoading[f.key]) owPropLoading[f.key]=0; }); try{ scene.load.start(); }catch(e){} }
  }
  function ensureOwPropTex(scene,name){ var key=owPropKey(name); return scene.textures.exists(key)?key:null; }
  var owImgs={}, owMap=null;
  function destroyOwProps(){ for(var k in owImgs){ if(owImgs[k])try{owImgs[k].destroy();}catch(e){} } owImgs={}; owMap=null; }
  function owSpecialObjects(scene){
    var map=scene.mapData, tg=scene.tileGrid; if(!map||!tg) return;
    if(window.__DQ_DEBUG__){ var d=window.__OW_DBG__=(window.__OW_DBG__||{calls:0,land:0,tex:0,imgs:0}); d.calls++; }
    if (owMap!==scene.currentMapId){ destroyOwProps(); owMap=scene.currentMapId; preloadOwProps(scene); } // preload all prop textures on map entry via Phaser loader
    var cam=scene.cameras.main, W=map[0].length, H=map.length;
    var X0=Math.max(0,Math.floor(cam.scrollX/TILE)-3), X1=Math.min(W-1,Math.ceil((cam.scrollX+cam.width)/TILE)+3);
    var Y0=Math.max(0,Math.floor(cam.scrollY/TILE)-3), Y1=Math.min(H-1,Math.ceil((cam.scrollY+cam.height)/TILE)+3);
    var seen={};
    for (var ty=Y0;ty<=Y1;ty++){ var mrow=map[ty]; if(!mrow)continue; for (var tx=X0;tx<=X1;tx++){ var t=mrow[tx], name=OW_PROP[t]; if(!name)continue;
      if(window.__OW_DBG__)window.__OW_DBG__.land++;
      var es=tg[ty]&&tg[ty][tx]; if(es&&es.alpha!==0)es.setAlpha(0);                 // hide engine landmark (alpha, not visible -> survives per-frame culling)
      var tk=ensureOwPropTex(scene,name); if(!tk)continue;                            // PNG still loading -> next tick
      if(window.__OW_DBG__)window.__OW_DBG__.tex++;
      var key=tx+'_'+ty, img=owImgs[key]; if(!img){ img=scene.add.image(0,0,tk).setDepth(6); owImgs[key]=img; }
      if(img.texture.key!==tk) img.setTexture(tk);
      var sc=OW_PROP_SCALE[name]||1.5; img.setOrigin(0.5,1).setPosition(tx*TILE+TILE/2, ty*TILE+TILE).setDisplaySize(TILE*sc,TILE*sc); // bigger + sit on the tile & rise up
      if(!img.visible)img.setVisible(true); seen[key]=1; } }
    for (var k2 in owImgs){ if(!seen[k2] && owImgs[k2] && owImgs[k2].visible) owImgs[k2].setVisible(false); } // cull off-screen
    var vis=0; for(var vk in owImgs){ if(owImgs[vk]&&owImgs[vk].visible) vis++; } window.__OW_PROP_COUNT__=vis; // readiness signal for capture harness
  }

  // ============================================================
  //  DUNGEON — OVERWORLD-STYLE: continuous stone-FLOOR base canvas (depth 1, covers engine floor/
  //  wall tiles) + RAISED WALL overlay drawn on top (lit top + SOUTH front-face hanging below +
  //  drop shadow = non-square height) + a GRADUAL pixelated radial FOG-OF-WAR (depth 8, under the
  //  hero) centered on the player. The engine's hard per-tile alpha is replaced; mechanic kept.
  //  Engine SPECIAL tiles (stairs/treasure/door…) are raised above the base + lit so only our fog
  //  darkens them.
  // ============================================================
  // PER-THEME dungeon identities — each needs a DISTINCT material, not just a tint. Config:
  // w=wall stone{base,lt,dk,mortar}; f=floor 5-tone ramp; fj=joint; bh/bw=brick size; floor=floor
  // STYLE ('flag'|'sand'|'dirt'|'ice'|'obsidian'); acc=signature wall element + accA/accB colors.
  var THEMES={
    dng:    { wall:'brick', w:{base:[60,63,72],lt:[90,93,104],dk:[38,40,48],mortar:[20,21,27]},     f:[[72,72,75],[90,90,93],[110,110,113],[130,130,133],[148,148,151]],     fj:[50,50,53],   bh:4,bw:8,  floor:'flag',     acc:'moss',  accA:[44,58,40],  accB:[30,42,28] },
    ice:    { wall:'brick', w:{base:[120,150,180],lt:[170,200,224],dk:[80,108,140],mortar:[54,76,104]}, f:[[150,180,205],[176,204,224],[200,224,238],[220,238,248],[238,248,252]], fj:[110,140,168], bh:6,bw:10, floor:'ice',      acc:'frost', accA:[232,244,250],accB:[188,214,234] },
    crystal:{ wall:'crystal', w:{base:[126,176,218],lt:[188,222,246],dk:[88,134,184],mortar:[156,198,230]},  f:[[104,148,192],[128,172,212],[156,196,230],[184,216,242],[208,232,250]],    fj:[84,128,174],   bh:5,bw:9,  floor:'crystalfloor', acc:'crystal',accA:[232,250,255],accB:[172,214,246] },
    tomb:   { wall:'brick', w:{base:[150,124,84],lt:[188,162,116],dk:[108,86,56],mortar:[72,56,34]},f:[[150,132,96],[172,152,116],[192,172,136],[210,192,158],[226,208,176]],   fj:[96,80,54],   bh:6,bw:14, floor:'flag',     acc:'carve', accA:[102,80,50], accB:[128,104,68] },
    forest: { wall:'tree',  w:{base:[46,72,40],lt:[76,106,56],dk:[28,46,26],mortar:[18,30,16]},     f:[[78,62,44],[96,78,56],[114,94,68],[132,112,84],[150,130,100]],         fj:[54,42,30],   bh:4,bw:8,  floor:'dirt',     acc:'vine',  accA:[64,112,48], accB:[42,80,30] },
    shadow: { wall:'brick', w:{base:[42,38,56],lt:[68,62,86],dk:[26,24,38],mortar:[14,13,22]},      f:[[40,38,50],[54,52,66],[68,66,82],[84,82,100],[100,98,118]],           fj:[26,24,36],   bh:4,bw:8,  floor:'flag',     acc:'wisp',  accA:[124,88,164],accB:[82,58,118] },
    tower:  { wall:'brick', w:{base:[112,104,92],lt:[148,138,124],dk:[78,72,62],mortar:[48,44,36]}, f:[[110,104,94],[130,124,114],[150,144,134],[168,162,152],[184,178,168]], fj:[74,68,58],   bh:6,bw:14, floor:'flag',     acc:'none' },
    castle: { wall:'brick', w:{base:[86,90,108],lt:[126,130,150],dk:[56,60,76],mortar:[34,36,48]},  f:[[100,102,114],[122,124,136],[142,144,156],[162,164,176],[182,184,196]],fj:[62,64,74],   bh:5,bw:10, floor:'flag',     acc:'gold',  accA:[214,182,98],accB:[160,130,64] },
    lava:   { wall:'rock',  w:{base:[64,50,46],lt:[96,74,66],dk:[42,32,30],mortar:[26,18,16]},      f:[[40,32,32],[54,42,40],[70,56,52],[86,68,62],[102,82,74]],             fj:[24,18,18],   bh:4,bw:8,  floor:'obsidian', acc:'glow',  accA:[255,152,52],accB:[240,84,30] }
  };
  // map-id overrides (dungeons that use the generic tile prefix but have a distinct theme)
  var THEME_BY_MAP={ magmaTunnels:'lava', volcanicForge:'lava', emberMines:'lava', obsidianCavern:'lava' };
  var TH=THEMES.dng, SW=THEMES.dng.w, FLOOR_R=THEMES.dng.f, FJ=THEMES.dng.fj, MOSS=THEMES.dng.moss, MOSS_D=THEMES.dng.mossd;
  function setTheme(k){ TH=THEMES[k]||THEMES.dng; SW=TH.w; FLOOR_R=TH.f; FJ=TH.fj; MOSS=TH.accA; MOSS_D=TH.accB; }
  function dngRole(t){ return (t===1)?2:((t===0)?1:0); }                              // 0 special | 1 floor | 2 wall
  function setD(data,cw,X,Y,c){ if(X<0||Y<0||X>=cw)return; var i=(Y*cw+X)*4; data[i]=c[0];data[i+1]=c[1];data[i+2]=c[2];data[i+3]=255; }
  // ============ per-THEME dungeon FLOORS (distinct MATERIALS, not just tints) ============
  function floorStoneInto(data,cw,bx,by,TX,TY){
    var st=TH.floor;
    if (st==='ice') return floorIce(data,cw,bx,by,TX,TY);
    if (st==='obsidian') return floorObsidian(data,cw,bx,by,TX,TY);
    if (st==='sand') return floorSand(data,cw,bx,by,TX,TY);
    if (st==='dirt') return floorDirt(data,cw,bx,by,TX,TY);
    if (st==='crystalfloor') return floorCrystal(data,cw,bx,by,TX,TY);
    return floorFlag(data,cw,bx,by,TX,TY);
  }
  function floorFlag(data,cw,bx,by,TX,TY){                              // flagstone grid
    for (var ly=0;ly<16;ly++) for (var lx=0;lx<16;lx++){
      var sx=(lx<8?0:8), sy=(ly<8?0:8), inLX=lx-sx, inLY=ly-sy, sgx=TX*2+(lx<8?0:1), sgy=TY*2+(ly<8?0:1);
      var n=_h(sgx,sgy,71), ti=n<0.16?0:(n<0.42?1:(n<0.74?2:(n<0.90?3:4))), c=FLOOR_R[ti];
      if (inLX===0||inLY===0) c=FJ; else if (inLY===1) c=FLOOR_R[Math.min(4,ti+1)]; else if (inLY===7) c=FLOOR_R[Math.max(0,ti-1)];
      else if (_h(sgx,sgy,151)<0.26 && inLX>=2 && inLX<=5 && inLY>=3 && inLY<=5) c=FLOOR_R[Math.max(0,ti-1)];
      setD(data,cw,bx+lx,by+ly,c);
    }
    if (_h(TX,TY,909)<0.16){ var r=RNG(TX*7+TY*13+3), x=ri(r,2,13), y=ri(r,2,13); for(var s=0;s<5;s++){ if(x<0||x>15||y<0||y>15)break; setD(data,cw,bx+x,by+y,FLOOR_R[0]); x+=ri(r,0,1); y+=ri(r,-1,1); } }
  }
  function floorSand(data,cw,bx,by,TX,TY){                              // soft dunes, no grid, wind ripples
    for (var ly=0;ly<16;ly++) for (var lx=0;lx<16;lx++){ var wx=TX*16+lx, wy=TY*16+ly, n=vnoise(wx,wy,11,71)*0.7+vnoise(wx,wy,4,72)*0.3;
      var ti=n<0.32?1:(n<0.58?2:(n<0.84?3:4)), c=FLOOR_R[ti];
      if (_h(Math.floor(wx/3),wy,33)<0.05) c=FLOOR_R[Math.max(0,ti-1)]; setD(data,cw,bx+lx,by+ly,c); }
  }
  function floorDirt(data,cw,bx,by,TX,TY){                              // earthy, blobby, pebbles + grass tufts
    for (var ly=0;ly<16;ly++) for (var lx=0;lx<16;lx++){ var wx=TX*16+lx, wy=TY*16+ly, n=vnoise(wx,wy,9,41)*0.7+vnoise(wx,wy,3,43)*0.3;
      var ti=n<0.28?0:(n<0.54?1:(n<0.8?2:3)), c=FLOOR_R[ti];
      if (_h(wx,wy,5)<0.05) c=FLOOR_R[0]; else if (_h(wx,wy,17)<0.025) c=TH.accA; setD(data,cw,bx+lx,by+ly,c); }
  }
  function floorIce(data,cw,bx,by,TX,TY){                               // pale smooth ice + crack network + sparkle
    for (var ly=0;ly<16;ly++) for (var lx=0;lx<16;lx++){ var wx=TX*16+lx, wy=TY*16+ly, n=vnoise(wx,wy,13,71);
      var c=FLOOR_R[n<0.35?2:(n<0.7?3:4)]; if (_h(wx,wy,9)<0.018) c=[245,250,254]; setD(data,cw,bx+lx,by+ly,c); }
    if (_h(TX,TY,211)<0.4){ var r=RNG(TX*5+TY*11), x=ri(r,2,13), y=ri(r,1,14); for(var s=0;s<7;s++){ if(x<0||x>15||y<0||y>15)break; setD(data,cw,bx+x,by+y,FLOOR_R[1]); x+=ri(r,0,1); y+=ri(r,-1,1); } }
  }
  function crystalFloorBand(wx,wy){ var e=vnoise(wx,wy,2.1,71)*0.74+vnoise(wx,wy,4,317)*0.26; return e<0.4?0:(e<0.72?1:2); }
  function floorCrystal(data,cw,bx,by,TX,TY){                           // CLEAN light-blue crystalline floor: big flat facets + crisp edges (calmer than walls)
    for (var ly=0;ly<16;ly++) for (var lx=0;lx<16;lx++){ var wx=TX*16+lx, wy=TY*16+ly, b=crystalFloorBand(wx,wy);
      var edge = crystalFloorBand(wx-1,wy)!==b || crystalFloorBand(wx,wy-1)!==b;
      setD(data,cw,bx+lx,by+ly, edge? FLOOR_R[1] : FLOOR_R[b+2]); }
  }
  function floorObsidian(data,cw,bx,by,TX,TY){                          // dark rock + GLOWING lava cracks
    for (var ly=0;ly<16;ly++) for (var lx=0;lx<16;lx++){ var wx=TX*16+lx, wy=TY*16+ly, n=vnoise(wx,wy,9,41); setD(data,cw,bx+lx,by+ly,FLOOR_R[n<0.4?0:(n<0.78?1:2)]); }
    if (_h(TX,TY,313)<0.34){ var r=RNG(TX*9+TY*7+3), x=ri(r,3,12), y=ri(r,2,13);
      for(var s=0;s<9;s++){ if(x<1||x>14||y<1||y>14)break; setD(data,cw,bx+x,by+y,TH.accA); setD(data,cw,bx+x-1,by+y,TH.accB); setD(data,cw,bx+x+1,by+y,TH.accB); x+=ri(r,-1,1); y+=ri(r,0,1); } }
  }
  function floorLava(data,cw,bx,by,TX,TY,map){                          // seamless molten LAVA (tile 5) with cooled-crust SMOOTHED edges where it borders non-lava (noisy contour, not a hard tile line)
    var L1=[255,234,156], L2=[255,178,62], L3=[236,100,34], L4=[152,46,22], CR=[74,42,28], CR2=[46,26,20];
    var nN=nb(map,TX,TY-1)!==5, nS=nb(map,TX,TY+1)!==5, nW=nb(map,TX-1,TY)!==5, nE=nb(map,TX+1,TY)!==5; // which sides border non-lava
    for (var ly=0;ly<16;ly++) for (var lx=0;lx<16;lx++){ var wx=TX*16+lx, wy=TY*16+ly, d=99;
      if(nN) d=Math.min(d, ly      + (vnoise(wx,wy,7,201)-0.5)*6);        // noisy distance from each bordering edge
      if(nS) d=Math.min(d, (15-ly) + (vnoise(wx,wy,7,203)-0.5)*6);
      if(nW) d=Math.min(d, lx      + (vnoise(wx,wy,7,205)-0.5)*6);
      if(nE) d=Math.min(d, (15-lx) + (vnoise(wx,wy,7,207)-0.5)*6);
      var c;
      if(d<1.5) c=CR2; else if(d<4) c=CR;                                // cooled-rock crust rim (organic boundary)
      else { var v=vnoise(wx,wy,5,71)*0.6+vnoise(wx,wy,10,131)*0.4; c=v<0.30?CR:(v<0.40?L4:(v<0.56?L3:(v<0.74?L2:L1))); if(_h(wx,wy,617)<0.015) c=[255,248,214]; }
      setD(data,cw,bx+lx,by+ly,c); }
  }
  // lit stone-brick wall TOP; brick grid keyed to WORLD px so it tiles seamlessly across cells.
  // + sparse THEME accent (moss/frost/crystal…) on some bricks, an occasional hairline CRACK.
  // NATURAL ROCK wall top (lava): irregular rock lumps (value-noise, no brick grid) + glowing lava seams
  function rockWallTop(ctx,bx,by,TX,TY){
    for (var ly=0;ly<16;ly++) for (var lx=0;lx<16;lx++){ var gx=TX*16+lx, gy=TY*16+ly, e=vnoise(gx,gy,6,71)*0.6+vnoise(gx,gy,3,73)*0.4;
      var tone=e<0.34?SW.dk:(e<0.68?SW.base:SW.lt); if(_h(gx,gy,201)<0.12) tone=SW.dk; px(ctx,bx+lx,by+ly,tone); }
    if (_h(TX,TY,77)<0.55){ var r=RNG(TX*11+TY*3), x=ri(r,2,13), y=ri(r,2,13); for(var s=0;s<7;s++){ if(x<1||x>14||y<0||y>15)break;
      px(ctx,bx+x,by+y,TH.accA); if(x+1<16)px(ctx,bx+x+1,by+y,TH.accB); if(x-1>=0)px(ctx,bx+x-1,by+y,TH.accB); x+=ri(r,-1,1); y+=ri(r,0,1); } } // glowing seam
  }
  // TREE wall top (forest): dense foliage canopy from above (bumpy, no grid) + leaf clumps
  function treeWallTop(ctx,bx,by,TX,TY){
    for (var ly=0;ly<16;ly++) for (var lx=0;lx<16;lx++){ var gx=TX*16+lx, gy=TY*16+ly, e=vnoise(gx,gy,4.5,71)*0.6+vnoise(gx,gy,2,73)*0.4;
      var c=e<0.36?SW.dk:(e<0.7?SW.base:SW.lt), h=_h(gx,gy,313); if(h<0.05)c=SW.dk; else if(h>0.965)c=SW.lt; px(ctx,bx+lx,by+ly,c); }
  }
  // CRYSTAL wall (crystal cave): SHARP faceted prisms on a low-poly crystalline base — clean angular, not icy
  function drawCrystal(ctx,cx,cy,h,w,lit,mid,shad,edge){
    var my=cy+((h*0.35)|0);                                        // widest point (lower third)
    polyf(ctx,[[cx,cy-h],[cx-w,my],[cx,cy+h]],lit);                // left facet (lit)
    polyf(ctx,[[cx,cy-h],[cx+w,my],[cx,cy+h]],shad);               // right facet (shadow)
    lineP(ctx,[cx,cy-h],[cx,cy+h],mid);                            // centre spine (mid tone)
    lineP(ctx,[cx,cy-h],[cx-w,my],edge);                           // bright lit edge (sharp)
    lineP(ctx,[cx-w,my],[cx,cy+h],edge);
    px(ctx,cx,cy-h,[242,254,255]); if(cy-h+1<my) px(ctx,cx,cy-h+1,edge); // crisp white tip
  }
  function crystalBand(gx,gy){ var e=vnoise(gx,gy,1.9,71)*0.74+vnoise(gx,gy,3.7,317)*0.26; return e<0.34?0:(e<0.57?1:(e<0.78?2:3)); }
  function crystalWallTop(ctx,bx,by,TX,TY){                              // CLEAN light-blue crystal: large flat facets + crisp edges + sparse glints (no messy prism tangle)
    var T=[SW.dk,SW.base,SW.mortar,SW.lt];
    for (var ly=0;ly<16;ly++) for (var lx=0;lx<16;lx++){ var gx=TX*16+lx, gy=TY*16+ly, b=crystalBand(gx,gy);
      var edge = crystalBand(gx-1,gy)!==b || crystalBand(gx,gy-1)!==b;   // crisp facet boundary
      px(ctx,bx+lx,by+ly, edge? SW.dk : T[b]); }
    var r=RNG(TX*13+TY*7+5), g=ri(r,1,3);                                // a few crisp sparkle glints on the brightest facets
    for (var k=0;k<g;k++){ var sx=ri(r,2,13), sy=ri(r,2,13); if(crystalBand(TX*16+sx,TY*16+sy)>=2){ px(ctx,bx+sx,by+sy,TH.accA); if(sx+1<16)px(ctx,bx+sx+1,by+sy,TH.accB); } }
  }
  function wallTopInto(ctx,bx,by,TX,TY){
    if (TH.wall==='rock') return rockWallTop(ctx,bx,by,TX,TY);
    if (TH.wall==='tree') return treeWallTop(ctx,bx,by,TX,TY);
    if (TH.wall==='crystal') return crystalWallTop(ctx,bx,by,TX,TY);
    var BH=TH.bh, BW=TH.bw;
    for (var ly=0;ly<16;ly++) for (var lx=0;lx<16;lx++){
      var gy=TY*16+ly, gx=TX*16+lx, row=Math.floor(gy/BH), off=((row&1)?(BW>>1):0), bcol=Math.floor((gx+off)/BW);
      var iny=gy-row*BH, inx=(gx+off)-bcol*BW, n=_h(bcol,row,91), tone=n<0.30?SW.dk:(n<0.82?SW.base:SW.lt);
      px(ctx,bx+lx,by+ly, (iny===0||inx===0)?SW.mortar : ((iny===1)?SW.lt : ((iny===BH-1)?SW.dk : tone)));
    }
    wallAccent(ctx,bx,by,TX,TY,BH,BW);                                          // theme signature element
    if (_h(TX,TY,777)<0.12){ var r=RNG(TX*31+TY*17+9), cx=ri(r,3,12), cy=ri(r,2,12); for(var s=0;s<4;s++){ if(cy>15)break; px(ctx,bx+cx,by+cy,SW.mortar); cx+=ri(r,-1,1); cy++; } } // hairline crack
  }
  // SIGNATURE per-theme wall element — the thing that makes each dungeon instantly recognizable
  function wallAccent(ctx,bx,by,TX,TY,BH,BW){
    var a=TH.acc; if (a==='none') return;
    if (a==='moss' || a==='vine'){
      for (var ly=0;ly<16;ly++) for (var lx=0;lx<16;lx++){ var gy=TY*16+ly, gx=TX*16+lx, row=Math.floor(gy/BH), iny=gy-row*BH;
        if (_h(Math.floor(gx/BW),row,313)<(a==='vine'?0.34:0.13) && iny>=BH-2) px(ctx,bx+lx,by+ly,(_h(gx,gy,5)<0.5?TH.accA:TH.accB)); }
      if (a==='vine' && _h(TX,TY,51)<0.45){ var rv=RNG(TX*13+TY*5), vx=ri(rv,2,13), vl=ri(rv,5,13); for(var k=0;k<vl;k++){ if(k>15)break; px(ctx,bx+vx,by+k,(k%3?TH.accA:TH.accB)); } } // hanging vine
    } else if (a==='frost'){
      for (var ly2=0;ly2<16;ly2++) for (var lx2=0;lx2<16;lx2++){ if(_h(TX*16+lx2,TY*16+ly2,71)<0.10) px(ctx,bx+lx2,by+ly2,TH.accA); } // frost speckle
    } else if (a==='crystal'){
      if (_h(TX,TY,77)<0.36){ var rc=RNG(TX*7+TY*19), cx=ri(rc,4,11), cy=ri(rc,5,11), s=ri(rc,2,3);   // glowing crystal cluster
        for(var dy=-s;dy<=s;dy++) for(var dx=-s;dx<=s;dx++){ if(Math.abs(dx)+Math.abs(dy)<=s) px(ctx,bx+cx+dx,by+cy+dy, (dx<0?TH.accA:TH.accB)); }
        px(ctx,bx+cx,by+cy-1,[255,255,255]); }
    } else if (a==='carve'){
      for (var ly3=0;ly3<16;ly3++){ var gy3=TY*16+ly3, row3=Math.floor(gy3/BH), iny3=gy3-row3*BH; if(iny3===2) for(var lx3=2;lx3<14;lx3++){ if(_h(Math.floor((TX*16+lx3)/2),row3,131)<0.62) px(ctx,bx+lx3,by+ly3,TH.accA); } } // carved grooves
    } else if (a==='wisp'){
      if (_h(TX,TY,77)<0.12){ var rw=RNG(TX*3+TY*7), cx2=ri(rw,4,11), cy2=ri(rw,4,11); px(ctx,bx+cx2,by+cy2,TH.accA); px(ctx,bx+cx2+1,by+cy2,TH.accB); px(ctx,bx+cx2,by+cy2+1,TH.accB); } // faint glow
    } else if (a==='gold'){
      for (var ly4=0;ly4<16;ly4++){ var gy4=TY*16+ly4, row4=Math.floor(gy4/BH), iny4=gy4-row4*BH; if(iny4===1 && _h(TX,row4,41)<0.45) for(var lx4=0;lx4<16;lx4++) px(ctx,bx+lx4,by+ly4,TH.accA); } // gold trim
    } else if (a==='glow'){
      if (_h(TX,TY,77)<0.42){ var rg=RNG(TX*11+TY*3), gx2=ri(rg,2,13), gy5=ri(rg,2,13); for(var k2=0;k2<6;k2++){ if(gx2<0||gx2>15||gy5<0||gy5>15)break; px(ctx,bx+gx2,by+gy5,TH.accA); if(gx2+1<16)px(ctx,bx+gx2+1,by+gy5,TH.accB); gx2+=ri(rg,-1,1); gy5+=ri(rg,0,1); } } // glowing crack
    }
  }
  // SOUTH front-face (the wall's HEIGHT, a dark cliff) hanging into the cell below + a strong drop
  // shadow on the floor — this is what makes a wall read as a raised 3D block, not a flat tile.
  function wallFrontShadow(ctx,map,TX,TY,bx,by){
    if (dngRole(nb(map,TX,TY+1))===2) return;                              // wall below -> interior, no face
    var FH=7;
    if (TH.wall==='rock'){                                                 // LAVA: rocky cliff + glowing lava seeping at base
      for (var fy=0;fy<FH;fy++) for (var fx=0;fx<16;fx++){ var e=vnoise(TX*16+fx,TY*7+fy,5,41); px(ctx,bx+fx,by+16+fy,(fy===0?SW.base:(e<0.4?SW.mortar:SW.dk))); }
      for (var gx=1;gx<15;gx++){ if(_h(TX*16+gx,TY,8)<0.35){ px(ctx,bx+gx,by+16+FH-1,TH.accA); px(ctx,bx+gx,by+16+FH-2,TH.accB); } }
    } else if (TH.wall==='tree'){                                          // FOREST: foliage skirt + tree trunk
      for (var fy2=0;fy2<FH;fy2++) for (var fx2=0;fx2<16;fx2++){ var e2=vnoise(TX*16+fx2,TY*6+fy2,4,71); px(ctx,bx+fx2,by+16+fy2,(e2<0.45?SW.dk:SW.base)); }
      if (_h(TX,TY,41)<0.6){ var rt=RNG(TX*7+TY*13), tx=ri(rt,5,9); for(var t=0;t<FH;t++){ px(ctx,bx+tx,by+16+t,[74,52,30]); px(ctx,bx+tx+1,by+16+t,[52,36,20]); } }
    } else if (TH.wall==='crystal'){                                       // CRYSTAL: light-blue faceted front + 1-2 CLEAN hanging spikes (soft edges, not noisy)
      var CT=[SW.dk,SW.base,SW.mortar,SW.lt];
      for (var fy4=0;fy4<FH;fy4++) for (var fx4=0;fx4<16;fx4++){ var gy4=TY*16+16+fy4, b4=crystalBand(TX*16+fx4,gy4);
        var ed4=crystalBand(TX*16+fx4-1,gy4)!==b4 || crystalBand(TX*16+fx4,gy4-1)!==b4; px(ctx,bx+fx4,by+16+fy4, ed4?SW.dk:CT[b4]); }
      var rc=RNG(TX*9+TY*5), m=ri(rc,1,2); for(var k=0;k<m;k++){ var sx=bx+ri(rc,3,12), sh=ri(rc,4,FH+2); drawCrystal(ctx,sx,by+16+((sh/2)|0),(sh/2)|0,2,SW.lt,SW.base,SW.dk,TH.accB); }
    } else {                                                              // BRICK: lit lip + dark cliff + theme cliff deco
      var lip=[Math.round(SW.base[0]*1.18),Math.round(SW.base[1]*1.18),Math.round(SW.base[2]*1.18)];
      for (var fy3=0;fy3<FH;fy3++) for (var fx3=0;fx3<16;fx3++){ var gx3=TX*16+fx3, n=_h(Math.floor(gx3/4),TY*5+fy3,41); px(ctx,bx+fx3,by+16+fy3,(fy3===0?lip:(fy3>=FH-2?[10,11,16]:(n<0.45?SW.mortar:SW.dk)))); }
      var a=TH.acc;
      if (a==='frost' && _h(TX,TY,61)<0.5){ var rf=RNG(TX*7+TY*3), ix=ri(rf,2,13), il=ri(rf,2,5); for(var k=0;k<il;k++) px(ctx,bx+ix,by+16+k,[228,240,250]); }
      else if (a==='crystal' && _h(TX,TY,63)<0.4){ var rc=RNG(TX*9+TY*7), cx=ri(rc,3,12); px(ctx,bx+cx,by+16,TH.accA); px(ctx,bx+cx,by+17,TH.accB); }
    }
    for (var sy=0;sy<6;sy++){ ctx.fillStyle='rgba(0,0,0,'+(0.5-sy*0.08).toFixed(3)+')'; ctx.fillRect(bx,by+16+FH+sy,16,1); } // strong drop shadow, fading
  }
  var dngState=null;
  function ensureDng(scene){
    var cam=scene.cameras.main, winW=Math.ceil(cam.worldView.width/TILE)+2*MARGIN, winH=Math.ceil(cam.worldView.height/TILE)+2*MARGIN;
    if (dngState && dngState.scene===scene && dngState.winW===winW && dngState.winH===winH && dngState.image && dngState.image.scene) return;
    if (dngState){ try{dngState.image&&dngState.image.destroy();}catch(e){} try{dngState.fog&&dngState.fog.destroy();}catch(e){} }
    var key='dqdngbase'; if (scene.textures.exists(key)) scene.textures.remove(key);
    var ct=scene.textures.createCanvas(key, winW*N, winH*N); try{ct.setFilter(NEAREST);}catch(e){}
    var img=scene.add.image(0,0,key).setOrigin(0,0).setDepth(1).setScale(SC); try{img.texture.setFilter(NEAREST);}catch(e){}
    var FOGF=5, fw=Math.ceil(cam.width/FOGF)+1, fh=Math.ceil(cam.height/FOGF)+1, fkey='dqdngfog';
    if (scene.textures.exists(fkey)) scene.textures.remove(fkey);
    var fct=scene.textures.createCanvas(fkey, fw, fh); try{fct.setFilter(NEAREST);}catch(e){}
    var fog=scene.add.image(0,0,fkey).setOrigin(0,0).setScrollFactor(0).setDepth(8).setScale(FOGF); try{fog.texture.setFilter(NEAREST);}catch(e){}
    dngState={ scene:scene, winW:winW, winH:winH, ct:ct, image:img, fog:fog, fogCt:fct, fw:fw, fh:fh, FOGF:FOGF, lastWin:'' };
  }
  // lit NW edges of a wall TOP (catches the upper-left light) + a SLIGHT corner bevel (edge-smoothing)
  function wallEdges(ctx,map,TX,TY,bx,by){
    var fN=dngRole(nb(map,TX,TY-1))!==2, fW=dngRole(nb(map,TX-1,TY))!==2, fE=dngRole(nb(map,TX+1,TY))!==2, fS=dngRole(nb(map,TX,TY+1))!==2;
    var litT=[Math.min(255,SW.lt[0]+34),Math.min(255,SW.lt[1]+34),Math.min(255,SW.lt[2]+38)];
    if (fN) hline(ctx,bx,bx+15,by,litT);                    // top edge highlight (faces light)
    if (fW) vline(ctx,bx,by,by+15,litT);                    // left edge highlight
    if (fE) vline(ctx,bx+15,by,by+15,SW.dk);                // right edge shaded
    function bevel(cx,cy,sx,sy){ for(var u=0;u<3;u++) for(var v=0;v<3;v++) if(u+v<3) px(ctx,cx+sx*u,cy+sy*v,(u+v<2?FLOOR_R[1]:FLOOR_R[2])); } // round outer corners
    if (fN&&fW) bevel(bx,by,1,1); if (fN&&fE) bevel(bx+15,by,-1,1); if (fS&&fW) bevel(bx,by+15,1,-1); if (fS&&fE) bevel(bx+15,by+15,-1,-1);
  }
  // contact AMBIENT-OCCLUSION shadow on the floor where it meets a wall (sides + base) -> grounds the walls,
  // the single biggest wall/floor-distinction cue. (N edge is handled by the N wall's front-face.)
  function floorAO(ctx,map,TX,TY,bx,by){
    var DW=4;
    function edge(side){ for(var t=0;t<16;t++) for(var d=0;d<DW;d++){ var a=0.42*(1-d/DW), X, Y;
      if(side==='W'){X=bx+d;Y=by+t;} else if(side==='E'){X=bx+15-d;Y=by+t;} else {X=bx+t;Y=by+15-d;}
      ctx.fillStyle='rgba(0,0,0,'+a.toFixed(3)+')'; ctx.fillRect(X,Y,1,1); } }
    if (dngRole(nb(map,TX-1,TY))===2) edge('W');
    if (dngRole(nb(map,TX+1,TY))===2) edge('E');
    if (dngRole(nb(map,TX,TY+1))===2) edge('S');
  }
  // re-skinned SPECIAL tiles (we draw these; the engine sprite is hidden). 3 door,4 chest,5 lava,6 up,8 open,9 down
  var RESKIN_SPECIAL={3:1,4:1,6:1,7:1,8:1,9:1,10:1,11:1,12:1,14:1,15:1,20:1,29:1,30:1,32:1}; // 5 (lava) = seamless base-canvas floor now; 18 (plaque) = wall-mounted
  var STONE=[104,104,110], STONE_D=[60,60,66], DARK=[14,14,20], WOOD=[124,84,46], WOOD_D=[82,54,28], GOLD=[220,186,100], GOLD_D=[150,120,58];
  // ============ detailed 48px dungeon ASSET sprites (drawn onto the engine special tile, over the base-canvas floor) ============
  var A_OUT=[22,15,10], A_CSH=[15,13,20];
  var A_W ={ hi:[178,128,76], m:[134,90,46], d:[94,60,30], k:[60,38,18] };   // wood
  var A_I ={ hi:[168,170,182], m:[100,102,118], d:[56,58,70], k:[30,30,40] }; // iron
  var A_G ={ hi:[254,236,158], m:[232,194,100], d:[152,118,54] };            // gold/brass
  var A_S ={ hi:[156,156,166], m:[108,108,120], d:[66,66,78], k:[38,38,48] }; // neutral stone
  // shared chest BODY (x10..38, y22..41) — same box for closed + open so they read as one chest. NO lock.
  function _chestBody(ctx){
    var W=A_W,I=A_I,O=A_OUT;
    rect(ctx,10,22,28,19,O); rect(ctx,11,23,26,17,W.m);                       // box
    vline(ctx,18,24,39,W.d); vline(ctx,30,24,39,W.d);                         // plank seams (mirror about 24)
    rect(ctx,11,38,26,2,W.k);                                                 // shaded bottom
    var sx=[12,34]; for(var s=0;s<2;s++){ var X=sx[s]; rect(ctx,X,23,3,17,I.m); vline(ctx,X,23,39,I.hi); vline(ctx,X+2,23,39,I.k);
      px(ctx,X+1,27,I.hi); px(ctx,X+1,36,I.hi); }                             // iron straps (mirror) — no lock
  }
  function assetChestClosed(ctx){                                            // square symmetric chest, lid closed, NO lock
    var W=A_W,I=A_I,O=A_OUT;
    rect(ctx,15,41,18,2,A_CSH); rect(ctx,18,43,12,1,A_CSH);
    _chestBody(ctx);
    for(var i=0;i<11;i++){ var yy=12+i, hw=Math.max(11,Math.round(14*Math.sqrt(Math.max(0,1-((10-i)/10)*((10-i)/10))))); // rounded lid on top
      rect(ctx,24-hw,yy,hw*2,1, i<2?O:(i<4?W.hi:W.m)); }
    rect(ctx,10,22,28,1,O);                                                   // lid/body seam
    var sx=[12,34]; for(var s=0;s<2;s++){ vline(ctx,sx[s],13,22,I.m); vline(ctx,sx[s],13,22,I.hi); vline(ctx,sx[s]+2,13,22,I.k); } // straps continue onto lid
  }
  function assetChestOpen(ctx){                                              // SAME chest, lid flipped up & back, mouth open with treasure
    var W=A_W,I=A_I,G=A_G,O=A_OUT;
    rect(ctx,15,41,18,2,A_CSH);
    _chestBody(ctx);
    rect(ctx,11,22,26,6,[24,17,13]);                                         // OPEN mouth: dark interior at top of box
    rect(ctx,13,23,22,4,[58,40,24]); rect(ctx,14,25,20,2,[150,110,42]);      // inner back wall + gold pile
    rect(ctx,15,24,18,2,[226,190,98]); px(ctx,18,23,[252,232,150]); px(ctx,29,23,[252,232,150]); rect(ctx,22,24,4,2,[248,224,150]); // bright coins
    for(var i=0;i<8;i++){ var yy=5+i, hw=Math.max(11,Math.round(14*Math.sqrt(Math.max(0,1-(i/8)*(i/8))))); // lid flipped UP & back (rounded underside), hinged at box rear
      rect(ctx,24-hw,yy,hw*2,1, i<2?O:(i<5?W.k:W.d)); }                       // underside = darker wood
    var lx=[12,34]; for(var s=0;s<2;s++){ vline(ctx,lx[s],6,13,I.d); }        // straps on lid underside (align with body straps)
    rect(ctx,12,13,24,2,O);                                                  // hinge line at rear of the open box
  }
  function assetStairs(ctx,down){
    var S=A_S,O=A_OUT;
    if(down){                                                                 // DOWN = a recessed pit you look down into
      rect(ctx,5,5,38,38,O); rect(ctx,6,6,36,36,S.m); rect(ctx,6,6,36,2,S.hi); // stone surround at floor level (lit)
      rect(ctx,11,10,26,31,[10,10,15]);                                       // dark pit
      for(var i=0;i<5;i++){ var y=11+i*5, ins=i*2, x0=12+ins, w=24-ins*2, g=Math.round(126-i*22); // steps get DARKER descending
        rect(ctx,x0,y,w,3,[g,g,g+5]); rect(ctx,x0,y+3,w,2,O); }
      rect(ctx,20,37,8,4,[3,3,7]);                                            // black bottom of the shaft
    } else {                                                                  // UP = an ascending lit stepped block toward a bright opening
      rect(ctx,6,5,36,39,O); rect(ctx,7,6,34,37,S.k);
      for(var j=0;j<5;j++){ var ins2=j*3, yy=37-j*6, x02=8+ins2, w2=32-ins2*2, g2=Math.round(96+j*24); // steps get LIGHTER + narrower going up
        rect(ctx,x02,yy-4,w2,4,[g2,g2,g2+6]);                                 // tread
        rect(ctx,x02,yy-6,w2,2,[Math.min(255,g2+40),Math.min(255,g2+40),Math.min(255,g2+46)]); // lit lip
        rect(ctx,x02,yy,w2,1,O); }
      rect(ctx,17,7,14,5,[220,224,236]); rect(ctx,18,7,12,2,[248,250,255]);   // bright opening at the top
    }
  }
  function _archway(ctx){                                                     // stone archway: 2 pillars + arch + dark opening + warning skull + torches
    var S=A_S, O=A_OUT, DK=[10,10,13], SK=[206,190,168], SKL=[224,208,188], FL=[255,150,50], FLB=[255,214,96], EYE=[255,60,60];
    rect(ctx,14,10,20,33,DK);                                                 // dark opening
    rect(ctx,5,8,9,35,S.d); rect(ctx,6,8,7,35,S.m); rect(ctx,6,8,7,2,S.hi); vline(ctx,9,10,42,S.d);  // left pillar
    rect(ctx,34,8,9,35,S.d); rect(ctx,35,8,7,35,S.m); rect(ctx,35,8,7,2,S.hi); vline(ctx,38,10,42,S.d); // right pillar
    rect(ctx,5,40,9,3,S.d); rect(ctx,34,40,9,3,S.d);                          // pillar bases
    rect(ctx,5,3,38,7,S.m); rect(ctx,5,3,38,2,S.hi); rect(ctx,10,8,28,2,S.d); // arch lintel + carved ridge
    rect(ctx,20,3,8,8,SK); rect(ctx,21,3,6,2,SKL); rect(ctx,21,6,2,2,DK); rect(ctx,25,6,2,2,DK); px(ctx,22,7,EYE); px(ctx,26,7,EYE); rect(ctx,22,9,4,1,DK); // warning skull keystone
    rect(ctx,8,17,3,5,[120,90,50]); rect(ctx,37,17,3,5,[120,90,50]);          // torch brackets
    polyf(ctx,[[9,17],[7,10],[12,10]],FL); px(ctx,9,12,FLB); polyf(ctx,[[38,17],[36,10],[41,10]],FL); px(ctx,38,12,FLB); // flames
  }
  function assetDoor(ctx){ _archway(ctx); }
  function assetLavaPool(ctx){                                                // fills the tile edge-to-edge (tiles into lava lakes) — molten flow + dark crust + bubbles
    var L1=[255,234,156], L2=[255,178,62], L3=[236,100,34], L4=[152,46,22], CR=[52,30,22], CRL=[86,54,38];
    for(var y=0;y<48;y++) for(var x=0;x<48;x++){ var v=vnoise(x*0.9,y*0.9,4,71)*0.6 + vnoise(x*0.5,y*0.5,7,131)*0.4;
      px(ctx,x,y, v<0.30?CR:(v<0.40?L4:(v<0.56?L3:(v<0.74?L2:L1)))); }        // crust → deep red → orange → bright molten
    var r=RNG(4099); for(var k=0;k<5;k++){ var cx=ri(r,7,38), cy=ri(r,7,38); rect(ctx,cx,cy,ri(r,2,4),ri(r,2,3),CR); px(ctx,cx,cy,CRL); } // floating crust islands
    px(ctx,16,18,[255,248,214]); px(ctx,31,22,[255,248,214]); px(ctx,22,32,[255,242,192]); px(ctx,35,35,[255,246,204]); // bright bubbles
  }
  function assetBoss(ctx){                                                    // menacing horned BEAST (refined from the original beast asset)
    var B=[102,26,44], BD=[70,18,32], BL=[130,44,60], BELLY=[138,62,88], HORN=[210,180,110], HORNL=[236,210,140], EYE=[255,54,54], EYEG=[255,186,156], MO=[28,6,10], TE=[236,236,230];
    rect(ctx,4,40,40,4,[22,18,26]);                                          // floor shadow
    polyf(ctx,[[24,15],[9,41],[39,41]],B);                                    // hunched body
    polyf(ctx,[[13,41],[13,31],[8,41]],BD); polyf(ctx,[[35,41],[35,31],[40,41]],BD); // legs
    polyf(ctx,[[24,27],[17,41],[31,41]],BELLY);                               // belly highlight
    rect(ctx,15,13,18,13,B); rect(ctx,15,13,18,3,BL);                         // head + lit brow
    polyf(ctx,[[16,13],[9,4],[17,11]],HORN); polyf(ctx,[[32,13],[39,4],[31,11]],HORN); px(ctx,10,5,HORNL); px(ctx,38,5,HORNL); // curved horns
    rect(ctx,18,17,4,3,MO); rect(ctx,26,17,4,3,MO); rect(ctx,19,18,2,2,EYE); rect(ctx,27,18,2,2,EYE); px(ctx,19,18,EYEG); px(ctx,27,18,EYEG); // glowing eyes
    rect(ctx,17,22,14,3,MO); for(var t=0;t<6;t++){ px(ctx,18+t*2,22,TE); px(ctx,18+t*2,24,TE); } // fanged mouth
    px(ctx,9,40,TE); px(ctx,11,40,TE); px(ctx,37,40,TE); px(ctx,39,40,TE);    // claws
  }
  function assetSavePoint(ctx){                                               // blue crystal pillar cluster on ice-cavern floor (save point)
    var FL=[46,50,80], FL2=[40,44,70], C1=[68,94,236], C2=[85,126,238], C3=[104,158,255], C4=[121,190,255], SP=[206,222,255];
    rect(ctx,8,8,32,32,FL2); rect(ctx,10,30,28,10,FL);                        // ice-cavern floor glow
    polyf(ctx,[[24,6],[16,38],[32,38]],C1);                                   // main pillar body
    polyf(ctx,[[24,6],[18,34],[24,34]],C3); polyf(ctx,[[24,6],[30,34],[24,34]],C2); // lit / shadow facets
    polyf(ctx,[[24,6],[21,15],[27,15]],C4);                                   // bright tip band
    lineP(ctx,[24,6],[24,38],SP); px(ctx,24,6,[255,255,255]); px(ctx,24,7,SP); // spine + tip glint
    polyf(ctx,[[15,21],[12,38],[18,38]],C2); lineP(ctx,[15,21],[15,38],C4); px(ctx,15,21,SP); // left side crystal
    polyf(ctx,[[33,24],[30,38],[36,38]],C2); lineP(ctx,[33,24],[33,38],C4); px(ctx,33,24,SP); // right side crystal
    px(ctx,12,14,SP); px(ctx,36,18,SP); px(ctx,20,30,SP); px(ctx,28,11,[255,255,255]); // sparkles
  }
  function assetKeyDoor(ctx){                                                 // archway barred with a chain + gold padlock (needs key)
    _archway(ctx); var CH=[122,126,142], CHD=[70,72,86];
    rect(ctx,13,23,22,4,CHD); for(var x=13;x<35;x+=4){ rect(ctx,x,23,3,4,CH); px(ctx,x+1,24,[172,176,190]); } // chain across opening
    rect(ctx,21,18,2,5,CH); rect(ctx,25,18,2,5,CH); rect(ctx,21,17,6,2,CH);   // shackle (U)
    rect(ctx,19,22,10,11,[150,116,52]); rect(ctx,20,23,8,9,[226,190,98]); rect(ctx,20,23,8,1,[252,232,150]); // gold padlock body
    rect(ctx,23,26,3,3,[80,58,24]); rect(ctx,24,29,1,2,[80,58,24]);           // keyhole
  }
  function assetPlaque(ctx){                                                  // stone tablet on legs, engraved text (sign)
    var S=A_S,O=A_OUT;
    rect(ctx,9,7,30,27,O); rect(ctx,10,8,28,25,S.m); rect(ctx,10,8,28,2,S.hi);
    rect(ctx,12,10,24,21,S.d); rect(ctx,13,11,22,19,S.m);
    for(var i=0;i<5;i++) rect(ctx,15,14+i*4,18-(i%2)*5,2,S.d);                // engraved lines
    rect(ctx,13,34,4,7,[70,50,30]); rect(ctx,31,34,4,7,[70,50,30]); rect(ctx,12,40,24,2,O); // legs
  }
  function assetWindBarrier(ctx){                                             // GREEN crystal stalagmites (needs windbreaker stone)
    var G1=[68,156,76], G2=[102,174,110], GT=[170,255,191], SP=[206,255,223];
    var cols=[[13,21],[24,13],[35,23]];                                       // [baseX, topY] — three rising columns
    for(var i=0;i<3;i++){ var cx=cols[i][0], ty=cols[i][1];
      polyf(ctx,[[cx,ty],[cx-5,41],[cx+5,41]],G1);                            // column body
      polyf(ctx,[[cx,ty],[cx-5,41],[cx,41]],G2);                              // lit facet
      lineP(ctx,[cx,ty],[cx,41],GT); px(ctx,cx,ty,GT); px(ctx,cx,ty+1,SP); }  // bright spine + tip
    px(ctx,10,32,SP); px(ctx,38,34,SP); px(ctx,24,22,SP); px(ctx,18,36,SP);   // green glow sparkles
  }
  function assetPortal(ctx){                                                  // concentric purple vortex + cross-energy + glow core (matches original)
    var BG=[13,5,24], R1=[58,26,102], R2=[42,14,78], CORE=[204,136,255], CR=[170,95,255], SP=[238,221,255];
    rect(ctx,7,7,34,34,[26,10,46]); rect(ctx,9,9,30,30,BG);
    for(var r=15;r>3;r-=3){ for(var a=0;a<56;a++){ var an=a/56*6.283, x=24+Math.round(r*Math.cos(an)), y=24+Math.round(r*0.86*Math.sin(an)); px(ctx,x,y, r>11?R2:(r>7?R1:CR)); } } // nested rings
    for(var t=-13;t<=13;t++){ px(ctx,24+t,24+Math.round(t*0.32),CR); px(ctx,24+Math.round(t*0.32),24+t,CR); } // acid cross-lines
    rect(ctx,21,21,6,6,CORE); rect(ctx,22,22,4,4,[236,210,255]); px(ctx,24,24,[255,255,255]); // glow core
    px(ctx,14,16,SP); px(ctx,34,30,SP); px(ctx,30,15,SP); px(ctx,16,32,SP);   // sparkles
  }
  function assetSpikeTrap(ctx,sprung){                                        // ORIGINAL design: inconspicuous dots (hidden) → metal spikes (activated)
    if(!sprung){                                                             // HIDDEN: a deliberate 3x3 grid of small holes — subtle, but the regular pattern is findable on a close look (any floor)
      var D=[36,33,28], RIM=[108,102,90];
      for(var gy=0;gy<3;gy++) for(var gx=0;gx<3;gx++){ var cx=13+gx*11, cy=13+gy*11;
        rect(ctx,cx,cy,3,3,D);                                                                    // small dark hole
        px(ctx,cx-1,cy,RIM); px(ctx,cx,cy-1,RIM); px(ctx,cx+3,cy+2,RIM); px(ctx,cx+2,cy+3,RIM); } // rim glints so the grid reads on any floor
    } else {                                                                 // ACTIVATED: sharp metal spikes protruding up
      var M=[178,182,196], MD=[104,108,124], ML=[230,234,246], BASE=[70,72,86], DK=[24,24,32];
      for(var gy2=0;gy2<3;gy2++) for(var gx2=0;gx2<3;gx2++){ var sx=11+gx2*13, sy=13+gy2*12;
        rect(ctx,sx-3,sy+4,7,2,DK); rect(ctx,sx-3,sy+3,7,1,BASE);            // dark hole + metal base
        polyf(ctx,[[sx,sy-7],[sx-3,sy+5],[sx+3,sy+5]],M);                    // spike body
        polyf(ctx,[[sx,sy-7],[sx+3,sy+5],[sx,sy+5]],MD);                     // shadow (right) facet
        lineP(ctx,[sx,sy-7],[sx-3,sy+5],ML); px(ctx,sx,sy-7,[250,252,255]); } // lit edge + bright tip
    }
  }
  function assetKeyItem(ctx){                                                 // ITEM icon: golden key (inventory — shown for review)
    var G=A_G,O=A_OUT;
    rect(ctx,17,7,14,14,O); rect(ctx,18,8,12,12,G.d); rect(ctx,20,10,8,8,[20,16,10]); rect(ctx,18,8,12,2,G.hi); // bow (ring)
    rect(ctx,22,19,4,20,G.m); vline(ctx,22,19,38,G.hi); vline(ctx,25,19,38,G.d);                                // shaft
    rect(ctx,26,31,5,3,G.m); rect(ctx,26,36,4,3,G.m);                                                           // teeth
  }
  function assetWindStone(ctx){                                              // ITEM icon: ROUND GREEN rune stone + wind glyph (inventory)
    var G=[74,150,92], GL=[128,198,138], GD=[42,102,62], O=[20,52,36], WG=[224,248,230];
    for(var y=8;y<40;y++)for(var x=8;x<40;x++){ var dx=x-24,dy=y-24,r=Math.sqrt(dx*dx+dy*dy); if(r>15.5)continue; // round stone
      px(ctx,x,y, r>14.2?O : (dx+dy<-8?GL : (dx+dy>9?GD : G))); }
    for(var i=0;i<3;i++){ var yy=17+i*5; for(var x2=15;x2<33;x2++){ var y2=yy+Math.round(2*Math.sin(x2/3+i)); px(ctx,x2,y2,WG); } } // pale wind swirl glyph
    px(ctx,17,15,[210,240,216]); px(ctx,19,13,[210,240,216]);                 // highlights
  }
  function drawAsset(c,idx){                                                  // single dispatch (tiles + item icons)
    switch(idx){
      case 4: return assetChestClosed(c);   case 8: return assetChestOpen(c);
      case 6: case 12: return assetStairs(c,false);  case 9: return assetStairs(c,true);
      case 3: return assetDoor(c);          case 15: return assetKeyDoor(c);
      case 5: return assetLavaPool(c);      case 7: return assetBoss(c);
      case 14: return assetSavePoint(c);    case 18: return assetPlaque(c);
      case 20: return assetWindBarrier(c);  case 10: case 11: case 29: return assetPortal(c);
      case 30: return assetSpikeTrap(c,false); case 32: return assetSpikeTrap(c,true);
      case 'key': return assetKeyItem(c);   case 'wind': return assetWindStone(c);
    }
  }
  function ensureSpecialTex(scene,idx){
    var key='dq_asset_'+idx; if(scene.textures.exists(key)) return key;
    var cv=document.createElement('canvas'); cv.width=48; cv.height=48; var c=cv.getContext('2d'); c.imageSmoothingEnabled=false;
    drawAsset(c,idx);
    var t=scene.textures.addCanvas(key,cv); if(t&&t.refresh)t.refresh(); return key;
  }
  if (typeof window!=='undefined') window.__DQ_ASSETSHEET__=function(){        // review: all assets on one sheet
    var items=[ {i:4,n:'closed chest'},{i:8,n:'open chest'},{i:6,n:'stairs up'},{i:9,n:'stairs down'},{i:3,n:'door (double)'},{i:15,n:'key door (locked)'},
      {i:7,n:'boss'},{i:14,n:'save point'},{i:18,n:'plaque / sign'},{i:20,n:'wind barrier'},{i:29,n:'portal'},{i:5,n:'lava pool'},
      {i:30,n:'spike trap'},{i:32,n:'spike (sprung)'},{i:'key',n:'key (item)'},{i:'wind',n:'windbreaker stone (item)'} ];
    var Z=5, pad=14, cell=48*Z, cols=4, lab=22, W=cols*(cell+pad)+pad, rows=Math.ceil(items.length/cols), H=rows*(cell+lab+pad)+pad;
    var big=document.createElement('canvas'); big.width=W; big.height=H; var b=big.getContext('2d'); b.imageSmoothingEnabled=false;
    b.fillStyle='#14161c'; b.fillRect(0,0,W,H);
    for(var k=0;k<items.length;k++){ var col=k%cols, row=(k/cols)|0, ox=pad+col*(cell+pad), oy=pad+row*(cell+lab+pad);
      b.fillStyle='#0b0d11'; b.fillRect(ox,oy,cell,cell);
      var cv=document.createElement('canvas'); cv.width=48; cv.height=48; var c=cv.getContext('2d'); c.imageSmoothingEnabled=false;
      drawAsset(c,items[k].i);
      b.imageSmoothingEnabled=false; b.drawImage(cv,0,0,48,48,ox,oy,cell,cell);
      b.fillStyle='#cdd2da'; b.font='15px -apple-system,sans-serif'; b.fillText(items[k].n,ox+2,oy+cell+16); }
    return big.toDataURL('image/png');
  };
  // REVIEW: carve a room by the player and drop the given special tiles in a grid, so they render in a REAL dungeon scene
  if (typeof window!=='undefined') window.__DQ_PLACE_SPECIALS__=function(scene,idxs){
    var map=scene.mapData; if(!map||!map.length) return null; var hero=dngHero(scene); if(!hero) return null;
    var htx=Math.floor(hero.x/TILE), hty=Math.floor(hero.y/TILE);
    var cols=4, rows=Math.ceil(idxs.length/cols), RW=cols*2+3, RH=rows*2+4, x0=htx-Math.floor(RW/2), y0=hty-2;
    for(var y=y0;y<y0+RH;y++){ if(!map[y])continue; for(var x=x0;x<x0+RW;x++){ if(x>=0&&x<map[y].length) map[y][x]=0; } } // carve room (floor)
    var placed=[], i=0;
    for(var gy=0; i<idxs.length; gy++){ for(var gx=0; gx<cols && i<idxs.length; gx++){ var tx=x0+1+gx*2, ty=y0+2+gy*2, idx=idxs[i];
      if(map[ty]&&tx<map[ty].length){ map[ty][tx]=idx; if((idx===3||idx===15)&&tx+1<map[ty].length) map[ty][tx+1]=idx; placed.push([tx,ty,idx]); i++; } } } // door = 2-tile pair
    var hcx=x0+Math.floor(RW/2), hcy=y0; if(map[hcy]) map[hcy][hcx]=0;        // move hero to top-centre of room, off the grid
    if(hero.setPosition) hero.setPosition(hcx*TILE+TILE/2, hcy*TILE+TILE/2);
    if(dngState){ dngState.lastWin=null; } updateDng(scene,true); dngSpecialObjects(scene); // force base + assets redraw
    return placed;
  };
  // REVIEW: carve a room with a solid NORTH wall and mount both plaque styles on it (left half carve, right half plate)
  if (typeof window!=='undefined') window.__DQ_MOCK_PLAQUES__=function(scene){
    var map=scene.mapData; if(!map||!map.length) return null; var hero=dngHero(scene); if(!hero) return null;
    var htx=Math.floor(hero.x/TILE), hty=Math.floor(hero.y/TILE);
    var RW=13, RH=8, x0=htx-6, y0=hty-3;
    for(var y=y0;y<y0+RH;y++){ if(!map[y])continue; for(var x=x0;x<x0+RW;x++){ if(x>=0&&x<map[y].length) map[y][x]=(y===y0)?1:0; } } // north row = WALL, rest floor
    mockPlaques=null;                                                        // use the REAL tile-18 path (drawDungeon pass 6b), not the compare overlay
    if(map[y0+1]){ map[y0+1][x0+4]=18; map[y0+1][x0+8]=18; }                  // two real plaque tiles on the floor just below the north wall
    var hcx=x0+6, hcy=y0+3; if(map[hcy]) map[hcy][hcx]=0;
    if(hero.setPosition) hero.setPosition(hcx*TILE+TILE/2, hcy*TILE+TILE/2);
    if(dngState){ dngState.lastWin=null; } updateDng(scene,true);
    return mockPlaques;
  };
  // REVIEW: carve a room, fill an irregular LAVA LAKE (tile 5) + place armed(30) & activated(32) spikes on the floor
  if (typeof window!=='undefined') window.__DQ_LAVA_SPIKE_DEMO__=function(scene){
    var map=scene.mapData; if(!map||!map.length) return null; var hero=dngHero(scene); if(!hero) return null;
    var htx=Math.floor(hero.x/TILE), hty=Math.floor(hero.y/TILE), x0=htx-6, y0=hty-4, RW=13, RH=13;
    for(var y=y0;y<y0+RH;y++){ if(!map[y])continue; for(var x=x0;x<x0+RW;x++){ if(x>=0&&x<map[y].length) map[y][x]=0; } } // carve room
    for(var ly=0;ly<4;ly++) for(var lx=0;lx<6;lx++){ var lyy=y0+2+ly, lxx=x0+3+lx; if(map[lyy]) map[lyy][lxx]=5; }        // 4x6 lava lake
    if(map[y0+2]){ map[y0+2][x0+3]=0; map[y0+2][x0+8]=0; } if(map[y0+5]){ map[y0+5][x0+3]=0; map[y0+5][x0+8]=0; }         // irregular lake edges
    if(map[y0+9]){ map[y0+9][x0+4]=30; map[y0+9][x0+8]=32; }                                                             // spikes: armed(30) + activated(32)
    var hcx=x0+6, hcy=y0+11; if(map[hcy]) map[hcy][hcx]=0; if(hero.setPosition) hero.setPosition(hcx*TILE+TILE/2, hcy*TILE+TILE/2);
    if(dngState){ dngState.lastWin=null; } updateDng(scene,true); dngSpecialObjects(scene);
    return {lake:'4x6', spikes:[[x0+4,y0+9,30],[x0+8,y0+9,32]]};
  };
  function dngSpecial(ctx,bx,by,TX,TY,idx){
    if (idx===6 || idx===9){                                              // STAIRS (6 up / 9 down)
      rect(ctx,bx+2,by+2,12,12,STONE_D);
      for (var i=0;i<4;i++){ var yy=by+3+i*3, t=(idx===9)?i/3:(3-i)/3, g=Math.round(112-t*78); rect(ctx,bx+3,yy,10,2,[g,g,g+4]); hline(ctx,bx+3,bx+12,yy+2,STONE_D); }
    } else if (idx===4){                                                  // CLOSED CHEST
      rect(ctx,bx+3,by+5,10,8,WOOD_D); rect(ctx,bx+3,by+6,10,6,WOOD); rect(ctx,bx+3,by+4,10,3,WOOD_D);
      hline(ctx,bx+3,bx+12,by+7,GOLD); vline(ctx,bx+7,by+4,by+12,GOLD_D); rect(ctx,bx+7,by+8,2,2,GOLD); hline(ctx,bx+3,bx+12,by+12,WOOD_D);
    } else if (idx===8){                                                  // OPEN CHEST
      rect(ctx,bx+3,by+7,10,6,WOOD_D); rect(ctx,bx+4,by+8,8,4,DARK); rect(ctx,bx+3,by+3,10,3,WOOD); hline(ctx,bx+3,bx+12,by+6,GOLD_D);
      px(ctx,bx+7,by+9,GOLD); px(ctx,bx+9,by+10,GOLD);
    } else if (idx===3){                                                  // DOOR
      rect(ctx,bx+2,by+1,12,14,STONE_D); rect(ctx,bx+4,by+3,8,12,WOOD); vline(ctx,bx+8,by+3,by+14,WOOD_D); rect(ctx,bx+10,by+8,1,2,GOLD); hline(ctx,bx+4,bx+11,by+3,WOOD_D);
    } else if (idx===5){                                                  // LAVA POOL
      rect(ctx,bx+1,by+1,14,14,[58,28,20]); var r=RNG(TX*7+TY*3); for(var k=0;k<12;k++) px(ctx,bx+ri(r,2,13),by+ri(r,2,13),(r()<0.5?[255,152,52]:[240,84,30]));
    }
  }
  // WALL-MOUNTED PLAQUE — drawn on a wall cell's visible face (lower wall-top + front face), player reads from the floor in front
  var mockPlaques=null, PLAQUE_STYLE='carve';                                // LOCKED: carved-in (natural, part of the wall)
  function _glyph(ctx,x,y,t,c){                                              // tiny hieroglyph pictograph in a ~3x4 box
    switch(t){
      case 0: hline(ctx,x,x+2,y+1,c); px(ctx,x+1,y,c); px(ctx,x+1,y+2,c); break;                          // eye
      case 1: px(ctx,x,y,c); px(ctx,x+2,y,c); px(ctx,x+1,y+1,c); vline(ctx,x+1,y+1,y+3,c); break;         // bird
      case 2: vline(ctx,x+1,y,y+3,c); hline(ctx,x,x+2,y+1,c); break;                                       // ankh/cross
      case 3: px(ctx,x,y+1,c); px(ctx,x+1,y,c); px(ctx,x+2,y+1,c); px(ctx,x,y+3,c); px(ctx,x+1,y+2,c); px(ctx,x+2,y+3,c); break; // water zigzag
      case 4: px(ctx,x+1,y,c); vline(ctx,x+1,y+1,y+2,c); px(ctx,x,y+1,c); px(ctx,x+2,y+1,c); px(ctx,x,y+3,c); px(ctx,x+2,y+3,c); break; // figure
      case 5: rect(ctx,x,y+1,3,2,c); break;                                                                // bar/sun
      case 6: vline(ctx,x+1,y,y+3,c); break;                                                               // stroke
      default: hline(ctx,x,x+2,y+3,c); px(ctx,x,y+2,c); px(ctx,x+2,y+2,c); px(ctx,x+1,y+1,c); break;      // vessel
    }
  }
  function _plaqueGlyphs(ctx,bx,by,c){                                       // grid of hieroglyphs filling the wide tablet (2 rows x 6 cols)
    var pat=[0,1,6,3,4,2, 5,3,1,7,6,0], cols=[4,8,12,16,20,24], rowY=[by+9,by+15];
    for(var r=0;r<2;r++) for(var i=0;i<6;i++) _glyph(ctx,bx+cols[i],rowY[r],pat[r*6+i],c);
  }
  function drawPlaque(ctx,bx,by,style){                                      // WIDE landscape tablet (~1.7 tiles) covered in hieroglyphs
    if(style==='carve'){                                                     // wide recess cut INTO the wall (theme material) + dark carved glyphs
      var gc=[Math.round(SW.dk[0]*0.5),Math.round(SW.dk[1]*0.5),Math.round(SW.dk[2]*0.5)];
      rect(ctx,bx+1,by+6,27,16,SW.dk); rect(ctx,bx+2,by+7,25,14,SW.base);    // recess mouth + panel face (wall material)
      hline(ctx,bx+1,bx+27,by+6,SW.dk); vline(ctx,bx+1,by+6,by+21,SW.dk);    // top/left rim shadow (carved-in)
      hline(ctx,bx+2,bx+27,by+21,SW.lt); vline(ctx,bx+27,by+7,by+21,SW.lt);  // bottom/right lit interior
      _plaqueGlyphs(ctx,bx,by,gc);                                           // dark carved hieroglyphs
      var B=[214,172,100]; px(ctx,bx+2,by+7,B); px(ctx,bx+26,by+7,B); px(ctx,bx+2,by+20,B); px(ctx,bx+26,by+20,B); // bronze corner studs
    } else {                                                                 // wide LIGHT stone tablet mounted on the wall (stands out) + dark carved glyphs
      var ST=[208,188,148], STD=[150,128,92], STL=[232,216,182], FR=[118,84,40], FRL=[188,142,68], SH=[14,10,18], GLY=[86,60,28];
      rect(ctx,bx+3,by+9,27,15,SH);                                          // drop shadow
      rect(ctx,bx+1,by+6,28,17,FR); rect(ctx,bx+1,by+6,28,2,FRL);            // bronze frame + lit top
      rect(ctx,bx+3,by+8,24,13,ST); rect(ctx,bx+3,by+8,24,1,STL); hline(ctx,bx+3,bx+26,by+20,STD); // stone face + lit top + shaded bottom
      _plaqueGlyphs(ctx,bx,by,GLY);                                          // dark carved hieroglyphs
      px(ctx,bx+2,by+7,FRL); px(ctx,bx+28,by+7,FRL); px(ctx,bx+2,by+21,FRL); px(ctx,bx+28,by+21,FRL); // corner rivets
    }
  }
  function drawDungeon(ctx,map,X0,Y0,winW,winH){
    var cw=winW*N, ch=winH*N; ctx.clearRect(0,0,cw,ch);
    var img=ctx.createImageData(cw,ch), data=img.data;                       // 1. floor base
    for (var ty=0;ty<winH;ty++){ var TY=Y0+ty; for (var tx=0;tx<winW;tx++){ var TX=X0+tx; var _t=nb(map,TX,TY); if(_t===5) floorLava(data,cw,tx*N,ty*N,TX,TY,map); else if(dngRole(_t)!==2) floorStoneInto(data,cw,tx*N,ty*N,TX,TY); } }
    ctx.putImageData(img,0,0);
    var x,y,TXn,TYn;
    for (y=0;y<winH;y++){ TYn=Y0+y; for (x=0;x<winW;x++){ TXn=X0+x; if(dngRole(nb(map,TXn,TYn))===2) wallTopInto(ctx,x*N,y*N,TXn,TYn); } }       // 2. wall tops
    for (y=0;y<winH;y++){ TYn=Y0+y; for (x=0;x<winW;x++){ TXn=X0+x; if(dngRole(nb(map,TXn,TYn))===2) wallEdges(ctx,map,TXn,TYn,x*N,y*N); } }      // 3. lit edges + bevel
    for (y=0;y<winH;y++){ TYn=Y0+y; for (x=0;x<winW;x++){ TXn=X0+x; if(dngRole(nb(map,TXn,TYn))===2) wallFrontShadow(ctx,map,TXn,TYn,x*N,y*N); } } // 4. height + drop shadow
    for (y=0;y<winH;y++){ TYn=Y0+y; for (x=0;x<winW;x++){ TXn=X0+x; if(dngRole(nb(map,TXn,TYn))===1) floorAO(ctx,map,TXn,TYn,x*N,y*N); } }         // 5. floor contact shadows
    if (mockPlaques) for (y=0;y<winH;y++){ TYn=Y0+y; for (x=0;x<winW;x++){ TXn=X0+x; var pk=TXn+'_'+TYn; if(mockPlaques[pk] && dngRole(nb(map,TXn,TYn))===2) drawPlaque(ctx,x*N,y*N,mockPlaques[pk]); } } // 6. wall plaques (mock/compare)
    var ps=(TH.wall==='tree')?'plate':PLAQUE_STYLE;                          // can't carve into TREE walls (forest) → mounted bronze board there
    for (y=0;y<winH;y++){ TYn=Y0+y; for (x=0;x<winW;x++){ TXn=X0+x; if(nb(map,TXn,TYn)===18){                    // 6b. REAL plaque tile (18) → mount on the adjacent wall (prefer the north wall the player faces)
      if(y>0 && dngRole(nb(map,TXn,TYn-1))===2) drawPlaque(ctx,x*N,(y-1)*N,ps);
      else if(x>0 && dngRole(nb(map,TXn-1,TYn))===2) drawPlaque(ctx,(x-1)*N,y*N,ps);
      else if(dngRole(nb(map,TXn+1,TYn))===2) drawPlaque(ctx,(x+1)*N,y*N,ps); } } }
    // special tiles (chest/stairs/door/lava) are now detailed 48px sprites on the engine tile (see dngSpecialTiles) — only the floor beneath them is drawn here (pass 1)
  }
  function updateDng(scene,force){
    if (!dngState || dngState.scene!==scene) return; var map=scene.mapData; if(!map||!map.length) return;
    var cam=scene.cameras.main, wv=cam.worldView, W=map[0].length, H=map.length, winW=dngState.winW, winH=dngState.winH;
    var X0=Math.max(0,Math.floor(wv.x/TILE)-MARGIN), Y0=Math.max(0,Math.floor(wv.y/TILE)-MARGIN);
    if (X0+winW>W) X0=Math.max(0,W-winW); if (Y0+winH>H) Y0=Math.max(0,H-winH);
    var k=X0+'_'+Y0; if(!force && k===dngState.lastWin) return; dngState.lastWin=k;
    drawDungeon(dngState.ct.context, map, X0, Y0, winW, winH);
    dngState.ct.refresh(); dngState.image.setPosition(X0*TILE,Y0*TILE);
  }
  // our detailed 48px asset sprites live at SCENE level (depth 3 = above base canvas, below fog) — the engine
  // tile sprites are inside a Container UNDER our base canvas, so setTexture on them stays hidden. So we hide
  // the engine special sprite and draw our own scene-level image at the tile's world position.
  // Codex-generated prop PNGs (served from /props/). idx → filename stem. Doors are 2 tiles (left/right halves).
  var PROP_NAME={4:'chest-closed',8:'chest-open',6:'stairs-up',9:'stairs-down',12:'stairs-up',7:'boss-marker',14:'save-point',20:'wind-barrier',10:'portal',11:'portal',29:'portal'};
  // per-prop on-screen size (× TILE) — the 128px art is unreadable crushed to one 48px tile, so objects render bigger + bottom-anchored (rise off the floor)
  var PROP_SCALE={'chest-closed':1.35,'chest-open':1.35,'save-point':1.6,'boss-marker':1.6,'wind-barrier':1.6,'portal':1.5,'stairs-up':1.25,'stairs-down':1.25};
  var propLoading={};
  function ensurePropTex(scene,name){                                        // async-load a prop PNG as a Phaser texture; null until ready
    var key='dqprop_'+name; if(scene.textures.exists(key)) return key;
    if(!propLoading[key]){ propLoading[key]=true; var im=new Image(); im.onload=function(){ if(!scene.textures.exists(key)){ try{scene.textures.addImage(key,im);}catch(e){} } }; im.src='props/dqprop-'+name+'-128.png'; }
    return null;
  }
  function propNameFor(t,map,tx,ty){                                         // Codex prop stem for a tile, or null (→ code-drawn fallback: lava/spike)
    if(t===3||t===15){ var e=map[ty]&&(map[ty][tx+1]===3||map[ty][tx+1]===15), w=map[ty]&&(map[ty][tx-1]===3||map[ty][tx-1]===15);
      return e?'locked-door-left':(w?'locked-door-right':'locked-door-left'); }              // 2-tile door: left half if a door is to the east, right half if to the west
    return PROP_NAME[t]||null;
  }
  var specImgs={}, specMap=null;
  function dngSpecialObjects(scene){
    var map=scene.mapData, tg=scene.tileGrid; if(!map) return;
    if (specMap!==scene.currentMapId){ for(var kk in specImgs){ if(specImgs[kk])specImgs[kk].destroy(); } specImgs={}; specMap=scene.currentMapId; } // reset on map change
    var cam=scene.cameras.main, W=map[0].length, H=map.length;
    var X0=Math.max(0,Math.floor(cam.scrollX/TILE)-2), X1=Math.min(W-1,Math.ceil((cam.scrollX+cam.width)/TILE)+2);
    var Y0=Math.max(0,Math.floor(cam.scrollY/TILE)-2), Y1=Math.min(H-1,Math.ceil((cam.scrollY+cam.height)/TILE)+2);
    var seen={};
    for (var ty=Y0;ty<=Y1;ty++){ var mrow=map[ty]; if(!mrow)continue; for (var tx=X0;tx<=X1;tx++){ var t=mrow[tx]; if(!RESKIN_SPECIAL[t])continue;
      var es=tg&&tg[ty]&&tg[ty][tx]; if(es&&es.visible)es.setVisible(false);                    // hide engine sprite (under our base)
      var key=tx+'_'+ty; seen[key]=1;
      var pn=propNameFor(t,map,tx,ty); var tk = pn ? ensurePropTex(scene,pn) : ensureSpecialTex(scene,t); // Codex PNG prop, else code-drawn (lava/spike)
      if(!tk) continue;                                                                                    // PNG still loading → place next tick
      var img=specImgs[key]; if(!img){ img=scene.add.image(0,0,tk).setDepth(3); specImgs[key]=img; }
      if(img.texture.key!==tk) img.setTexture(tk);
      if(!pn || pn.indexOf('door')>=0){ img.setOrigin(0,0).setPosition(tx*TILE,ty*TILE).setDisplaySize(TILE,TILE); }  // code-drawn (lava/spike) + doors: fill the tile
      else { var sc=PROP_SCALE[pn]||1.4; img.setOrigin(0.5,1).setPosition(tx*TILE+TILE/2,ty*TILE+TILE).setDisplaySize(TILE*sc,TILE*sc); } // objects: bigger, sit on the floor tile & rise up
      if(!img.visible)img.setVisible(true); } }
    for (var k2 in specImgs){ if(!seen[k2] && specImgs[k2] && specImgs[k2].visible) specImgs[k2].setVisible(false); } // cull off-screen
  }
  // hide/re-skin engine SPECIAL tiles; non-reskinned specials are raised so only our fog darkens them
  function dngSpecialTiles(scene){
    var map=scene.mapData, tg=scene.tileGrid; if(!map||!tg) return;
    var cam=scene.cameras.main, W=map[0].length, H=map.length;
    var X0=Math.max(0,Math.floor(cam.scrollX/TILE)-2), X1=Math.min(W-1,Math.ceil((cam.scrollX+cam.width)/TILE)+2);
    var Y0=Math.max(0,Math.floor(cam.scrollY/TILE)-2), Y1=Math.min(H-1,Math.ceil((cam.scrollY+cam.height)/TILE)+2);
    for (var ty=Y0;ty<=Y1;ty++){ var row=tg[ty]; if(!row)continue; for (var tx=X0;tx<=X1;tx++){ var s=row[tx]; if(!s)continue; var t=map[ty][tx];
      if (dngRole(t)===0 && !RESKIN_SPECIAL[t]){ s.alpha=1; if(!s.visible)s.setVisible(true); if(s.depth!==3) s.setDepth(3); } } } // non-reskin specials: raise + light
    dngSpecialObjects(scene);                                                           // draw our detailed 48px assets as scene-level images
  }
  function dngHero(scene){ if(scene.hero&&scene.hero.x!=null) return scene.hero; if(scene.player&&scene.player.x!=null) return scene.player; var l=scene.children.list; for(var i=0;i<l.length;i++){ if(l[i].depth===10&&l[i].x!=null) return l[i]; } return null; }
  // which THEME this dungeon uses, from the engine tile prefix (our base canvas never changes those)
  function dngThemeKey(scene){
    if (typeof window!=='undefined' && window.__DQ_FORCE_THEME__ && THEMES[window.__DQ_FORCE_THEME__]) return window.__DQ_FORCE_THEME__; // review override
    var id=scene.currentMapId; if(THEME_BY_MAP[id]) return THEME_BY_MAP[id];     // map-id override (lava dungeons use the generic prefix)
    var tg=scene.tileGrid; if(!tg) return 'dng';
    for (var y=0;y<tg.length;y++){ var row=tg[y]; if(!row)continue; for (var x=0;x<row.length;x++){ var s=row[x];
      if (s&&s.texture&&s.texture.key){ var m=String(s.texture.key).match(/^(ice|crystal|tomb|forest|shadow|tower|castle|dng)/); return m?m[1]:'dng'; } } }
    return 'dng';
  }
  var curThemeKey=null;
  function updateFog(scene){
    if (!dngState || dngState.scene!==scene) return; var cam=scene.cameras.main, hero=dngHero(scene); if(!hero) return;
    var F=dngState.FOGF, fw=dngState.fw, fh=dngState.fh, z=cam.zoom||1;
    var hx=((hero.x-cam.scrollX)*z)/F, hy=((hero.y-cam.scrollY)*z)/F;            // hero in fog-pixel screen space
    var R=(typeof window.__DQ_FOG_R__==='number')?window.__DQ_FOG_R__:34, soft=16; // radius + falloff (fog px)
    var ctx=dngState.fogCt.context, img=ctx.createImageData(fw,fh), d=img.data;
    for (var y=0;y<fh;y++) for (var x=0;x<fw;x++){
      var dx=x-hx, dy=y-hy, t=(Math.sqrt(dx*dx+dy*dy)-(R-soft))/(2*soft); t=t<0?0:(t>1?1:t);
      var i=(y*fw+x)*4; d[i]=5; d[i+1]=5; d[i+2]=9; d[i+3]=Math.round((t*t*(3-2*t))*250); // smooth radial darkness
    }
    ctx.putImageData(img,0,0); dngState.fogCt.refresh();
  }

  // ============================================================
  //  TOWN — DQ-style VILLAGE re-skin. Same recipe as the overworld: a continuous
  //  code-drawn GROUND canvas (grass value-noise + brick paths + earthen plaza,
  //  seamless across tiles) with DEPTH-SORTED building/wall/save/gate OVERLAY
  //  objects painted on top (height + roof + drop shadow), like the overworld
  //  pines. Towns are tiny (16x16) + static, so the whole map is drawn ONCE into a
  //  single depth-1 canvas on entry. NO fog. Engine town tiles (town-0..15) sit
  //  under our opaque canvas; hero + NPCs (depth>1) stay on top.
  //  Tiles: 0 floor·1 wall·2 house-roof·3 grass·4 water·5 path·6 save·7 exit·
  //  8 shop-awning·9 house-window·10 house-door·11 shop-display·12 shop-door·
  //  13 clinic-roof·14 clinic-wall·15 clinic-door.
  // ============================================================
  var TP={
    // village ground — moody, darker
    grass_dp:[24,54,28], path:[122,92,56], path_dk:[92,66,40], path_lt:[150,118,78], path_edge:[74,52,32],
    // weathered ashlar stone rampart
    stone:[104,102,96], stone_lt:[140,138,130], stone_dk:[64,62,58], stone_mortar:[46,45,42], stone_cap:[154,152,142], moss:[78,96,54], moss_dk:[52,70,40],
    // deep terracotta shingle roof (kept for reference)
    roof:[146,64,48], roof_lt:[182,90,66], roof_dk:[92,38,30], roof_ridge:[198,116,88], roof_sh:[66,28,24],
    // golden THATCH + wattle-and-daub (kept for drawStall wares)
    thatch:[168,140,86], thatch_lt:[192,166,108], thatch_dk:[110,88,52], thatch_rg:[140,114,68], daub:[192,182,156], daub_dk:[160,150,124],
    // GREY BRICK walls + warm CLAY-TILE gable roof (cosy cottage; pitched, but NOT pyramidal, NOT flat)
    brick:[128,128,132], brick_lt:[156,156,160], brick_dk:[98,98,102], brick_mortar:[104,104,108],
    cope:[152,152,158], cope_lt:[182,182,188], cope_dk:[112,112,118],
    rtile:[150,86,64], rtile_lt:[178,110,84], rtile_dk:[106,56,40], rtile_rg:[188,122,94],
    // aged plaster + dark timber frame + stone footing
    plaster:[196,180,144], plaster_lt:[220,204,168], plaster_dk:[158,142,110], grime:[132,120,94],
    timber:[84,54,30], timber_dk:[54,34,18], timber_lt:[112,78,46], foot:[92,88,82], foot_dk:[58,56,52],
    // openings
    glass:[84,126,162], glass_lt:[150,188,214], glass_dk:[46,78,110], frame:[72,48,26],
    door:[100,64,34], door_dk:[60,38,18], door_lt:[132,92,52], iron:[52,52,58], iron_lt:[116,116,126], knob:[214,184,110],
    // clinic / shop / save
    clinic:[56,138,84], clinic_dk:[32,92,54], white:[228,230,220],
    awn_a:[148,56,56], awn_b:[204,188,152], awn_dk:[100,38,38], sign:[92,64,36], sign_dk:[58,40,20],
    save:[92,160,212], save_lt:[164,212,244], save_dk:[44,94,148], save_gl:[122,192,232],
    bush:[38,94,42], bush_lt:[62,122,58], bush_dk:[24,62,30], trunk:[74,48,26],
    chimney:[116,84,68], chimney_dk:[78,54,42], chimney_lt:[146,112,92]
  };
  function townRaw(map,x,y){ var row=map[y]; return (row&&row[x]!=null)?row[x]:1; } // OOB -> wall
  // Road MASK: path+save+exit are the seed road tiles; then BRIDGE floor(0) runs that are flanked by road
  // along a row or a column -> the map's broken path tiles render as ONE connected CROSS-ROAD (ground is
  // cosmetic; floor+path are both walkable, so this changes no game logic).
  var townRoad=null;
  function buildRoadMask(map){
    var H=map.length, W=map[0].length, m=[];
    for (var y=0;y<H;y++){ m[y]=[]; for (var x=0;x<W;x++){ var v=townRaw(map,x,y); m[y][x]=(v===5||v===6||v===7); } }
    for (var y1=0;y1<H;y1++){ var x=0; while(x<W){ if(townRaw(map,x,y1)===0){ var s=x; while(x<W&&townRaw(map,x,y1)===0)x++; var e=x-1;
      if ((s-1>=0&&m[y1][s-1]) && (e+1<W&&m[y1][e+1])) for(var k=s;k<=e;k++) m[y1][k]=true; } else x++; } }   // bridge along rows
    for (var x2=0;x2<W;x2++){ var y2=0; while(y2<H){ if(townRaw(map,x2,y2)===0){ var s2=y2; while(y2<H&&townRaw(map,x2,y2)===0)y2++; var e2=y2-1;
      if ((s2-1>=0&&m[s2-1][x2]) && (e2+1<H&&m[e2+1][x2])) for(var k2=s2;k2<=e2;k2++) m[k2][x2]=true; } else y2++; } } // bridge along columns
    return m;
  }
  function townWalkAt(map,tx,ty){ if(townRoad&&townRoad[ty]&&townRoad[ty][tx]) return 1; var v=townRaw(map,tx,ty); return (v===5||v===6||v===7)?1:0; }
  function townWalkField(map,wx,wy){                                 // bilinear membership (like fieldAt) so the road never breaks at the save/gate
    var fx=wx/N-0.5, fy=wy/N-0.5, tx0=Math.floor(fx), ty0=Math.floor(fy), rx=fx-tx0, ry=fy-ty0;
    var a=townWalkAt(map,tx0,ty0),b=townWalkAt(map,tx0+1,ty0),c=townWalkAt(map,tx0,ty0+1),d=townWalkAt(map,tx0+1,ty0+1);
    return (a*(1-rx)+b*rx)*(1-ry)+(c*(1-rx)+d*rx)*ry + (vnoise(wx,wy,22,53)-0.5)*0.05;
  }
  function townPath(wx,wy,edge){
    if (edge){ return ic(lerp(TP.path_edge,TP.path_dk,vnoise(wx,wy,5,151))); } // darker worn border (defined, no blob)
    var b=vnoise(wx,wy,6,151)*0.6+vnoise(wx,wy,2.4,213)*0.4, c=lerp(TP.path_lt,TP.path_dk,b);
    var h=((Math.imul(wx|0,131)^Math.imul(wy|0,977))>>>0)%23; if(h===0)c=TP.path_dk; else if(h===1)c=TP.path_lt; else if(h===2)c=TP.path_edge; // pebbles
    return ic(c);
  }
  function townGrass(wx,wy,common){ return ic(lerp(gshade(wx,wy),TP.grass_dp, common?0.30:0.42)); } // moodier lawn; common a touch lighter
  // seamless VILLAGE ground: moody green lawn base + warm packed-dirt WALKWAYS (path+save+exit unified so the
  // road never breaks at the save/gate) with a darker worn EDGE. Low field amp -> tidy, deliberate paths.
  function townGroundCol(wx,wy,map){
    var tx=(wx/N)|0, ty=(wy/N)|0, t=townRaw(map,tx,ty);
    if (t===4) return waterColor(wx,wy,0.72);                       // safety (template has no water)
    var wf=townWalkField(map,wx,wy);
    if (wf>=0.52) return townPath(wx,wy);
    if (wf>=0.40) return townPath(wx,wy,true);                      // worn dirt edge
    return townGrass(wx,wy, t===0);
  }
  function drawTownGround(ctx,map,W,H){
    var cw=W*N, ch=H*N, img=ctx.createImageData(cw,ch), data=img.data;
    for (var py=0;py<ch;py++) for (var pxk=0;pxk<cw;pxk++) setData(data,cw,pxk,py,townGroundCol(pxk,py,map));
    ctx.putImageData(img,0,0);
    // texture pass: grass tufts on grass tiles, pebble speckle on earthen plaza
    for (var ty=0;ty<H;ty++) for (var tx=0;tx<W;tx++){ var t=townRaw(map,tx,ty), bx=tx*N, by=ty*N, seed=(Math.imul(tx,131)^Math.imul(ty,977))>>>0;
      if (t===3||t===0) grassSpeckle(ctx,bx,by,seed);              // grass tufts on lawn + common
    }
  }
  // ---- building parts (native px; N=16 per tile) ----
  function drawDoor(ctx,cx,baseY,green){
    var w=10,h=14,x=cx-(w>>1),y=baseY-h, dk=green?TP.clinic_dk:TP.door_dk, md=green?TP.clinic:TP.door, lt=green?TP.clinic:TP.door_lt;
    rect(ctx,x-1,baseY-1,w+2,2,TP.foot); rect(ctx,x-1,baseY-1,w+2,1,TP.foot_dk);   // stone step
    rect(ctx,x-1,y-2,w+2,2,TP.timber_dk);                                          // lintel beam
    rect(ctx,x,y,w,h,dk); rect(ctx,x+1,y,w-2,h-1,md);                              // planked body
    vline(ctx,x+3,y+1,baseY-2,dk); vline(ctx,x+6,y+1,baseY-2,dk); vline(ctx,x+1,y+1,baseY-2,lt); // plank seams + lit edge
    rect(ctx,x+1,y+2,2,1,TP.iron); rect(ctx,x+1,baseY-4,2,1,TP.iron); rect(ctx,x+w-3,y+2,2,1,TP.iron); rect(ctx,x+w-3,baseY-4,2,1,TP.iron); // hinges
    px(ctx,x+w-3,y+(h>>1),TP.knob); px(ctx,x+w-3,y+(h>>1)+1,TP.knob);              // knob
  }
  function drawWindow(ctx,cx,cy,clinic){                                            // small leaded casement (medieval)
    var s=7,x=cx-(s>>1),y=cy-(s>>1);
    rect(ctx,x-1,y-1,s+2,s+2,TP.timber_dk);                                        // dark timber frame
    rect(ctx,x,y,s,s,TP.glass); rect(ctx,x,y,s,3,TP.glass_lt); rect(ctx,x,y+s-2,s,2,TP.glass_dk);
    if (clinic){ rect(ctx,cx-1,y,2,s,TP.clinic); rect(ctx,x,cy-1,s,2,TP.clinic); } // green cross (healer)
    else { lineP(ctx,[x,y],[x+s-1,y+s-1],TP.frame); lineP(ctx,[x+s-1,y],[x,y+s-1],TP.frame); px(ctx,cx,cy,TP.frame); } // leaded diamond lattice
    rect(ctx,x-1,y+s,s+2,1,TP.timber_dk);                                          // sill
  }
  function drawDisplay(ctx,cx,bot){
    var w=12,h=13,x=cx-(w>>1),y=bot-h-1;
    rect(ctx,x-1,y-1,w+2,h+2,TP.frame);
    rect(ctx,x,y,w,h,TP.glass); rect(ctx,x,y,w,4,TP.glass_lt); rect(ctx,x,y+h-3,w,3,TP.glass_dk);
    rect(ctx,x,y+h-5,w,1,TP.timber_dk);                                            // shelf
    rect(ctx,x+1,y+h-8,3,4,TP.awn_a); rect(ctx,x+5,y+h-9,3,5,TP.save_lt); rect(ctx,x+9,y+h-7,2,3,TP.clinic); // goods
    vline(ctx,cx,y,y+h-1,TP.frame); hline(ctx,x,x+w-1,y+(h>>1),TP.frame);
  }
  // pitched GABLE roof: a WIDE, low roof plane with a bold horizontal ridge -> reads as a house cap
  // (NOT a pyramidal/hip roof, NOT a flat/factory slab). Warm clay tile, lit upper-left, overhanging eaves.
  function gableRoof(ctx,L,topY,Wp,eaveY){
    var R=L+Wp, eL=L-3, eR=R+3, inx=(Wp*0.08)|0, ridgeY=topY-1, span=Math.max(1,eaveY-ridgeY);
    polyf(ctx,[[eL,eaveY],[L+inx,ridgeY],[R-inx,ridgeY],[eR,eaveY]],TP.rtile_dk);      // dark base
    for (var cy=ridgeY+1; cy<=eaveY; cy+=2){ var t=(cy-ridgeY)/span;
      var lx=Math.round((L+inx)+(eL-(L+inx))*t), rx=Math.round((R-inx)+(eR-(R-inx))*t), mx=lx+(((rx-lx)*0.5)|0);
      rect(ctx,lx,cy,mx-lx,2,TP.rtile_lt); rect(ctx,mx,cy,rx-mx,2,TP.rtile);           // lit-left / shaded-right course
      hline(ctx,lx,rx,Math.min(eaveY,cy+1),TP.rtile_dk);                               // course shadow
      var off=((cy>>1)&1)?3:0; for (var vx=lx+off; vx<rx; vx+=6) px(ctx,vx,cy,TP.rtile_dk); // tile seams
    }
    rect(ctx,L+inx-2,ridgeY-1,(R-inx)-(L+inx)+4,2,TP.rtile_rg);                         // bold horizontal RIDGE cap (the "not a point" cue)
    rect(ctx,eL,eaveY,eR-eL,2,TP.rtile_dk);                                             // eave board
    ctx.fillStyle='rgba(0,0,0,0.28)'; ctx.fillRect(L,eaveY+2,Wp,2);                     // under-eave shadow on wall
  }
  // RED-BRICK wall: running-bond courses (staggered perpends), subtle per-brick tone variation, grime,
  // and a stone footing at the base.
  function brickWall(ctx,L,wallTop,Wp,wallBot,footH,seed){
    var R=L+Wp, wtop=wallTop, wbot=wallBot-footH, BH=4, BW=8, br=RNG(seed>>>0);
    rect(ctx,L,wallTop,Wp,wallBot-wallTop,TP.brick);
    for (var b0=wtop; b0<wbot; b0+=BH){ var off=(((b0-wtop)/BH)&1)?(BW>>1):0;         // per-brick tone variation
      for (var bx=L+off-BW; bx<R; bx+=BW){ var rr=br(); if(rr<0.22){ var xa=Math.max(L,bx+1), xb=Math.min(R,bx+BW-1); if(xb>xa) rect(ctx,xa,b0+1,xb-xa,BH-1, rr<0.11?TP.brick_dk:TP.brick_lt); } } }
    for (var y2=wtop; y2<wbot; y2+=BH){ hline(ctx,L,R-1,y2,TP.brick_mortar); var offp=(((y2-wtop)/BH)&1)?(BW>>1):0; for (var x2=L+offp; x2<R; x2+=BW) vline(ctx,x2,y2,Math.min(wbot,y2+BH)-1,TP.brick_mortar); } // mortar grid
    for (var yy=wtop;yy<wbot;yy++){ var f=(yy-wtop)/(wbot-wtop); if(f>0.6){ ctx.fillStyle='rgba(0,0,0,'+(0.09*(f-0.6)/0.4).toFixed(3)+')'; ctx.fillRect(L,yy,Wp,1);} } // grime toward ground
    rect(ctx,L,wallBot-footH,Wp,footH,TP.foot); rect(ctx,L,wallBot-footH,Wp,1,TP.foot_dk); // stone footing
  }
  function drawHouse(ctx,L,topY,Wp,map,x0,ry,clinic){
    var R=L+Wp, cx=L+(Wp>>1), cols=Wp/N, eaveY=topY+13, wallTop=eaveY, wallBot=topY+2*N, footH=3; // single-storey cottage under a pitched roof
    ctx.fillStyle='rgba(0,0,0,0.20)'; ctx.beginPath(); ctx.ellipse(cx+3,wallBot,(Wp>>1)+2,4,0,0,Math.PI*2); ctx.fill(); // cast shadow (light upper-left)
    brickWall(ctx,L,wallTop,Wp,wallBot,footH,(Math.imul(L,131)^Math.imul(topY,977))); // grey brick
    var wbot=wallBot-footH, midY=(wallTop+wbot)>>1;
    for (var c=0;c<cols;c++){ var v=townRaw(map,x0+c,ry+1), ccx=L+c*N+(N>>1);
      if (v===10||v===15){ rect(ctx,ccx-6,wbot-16,12,1,TP.cope); drawDoor(ctx,ccx,wallBot-footH+1,v===15); } // stone lintel + door
      else drawWindow(ctx,ccx,midY,clinic);                                            // leaded window
    }
    gableRoof(ctx,L,topY,Wp,eaveY);
    if (!clinic){ var chx=cx+((Wp*0.26)|0); rect(ctx,chx,topY-6,5,10,TP.brick); rect(ctx,chx,topY-6,5,1,TP.brick_lt); rect(ctx,chx+4,topY-6,1,10,TP.brick_dk); rect(ctx,chx-1,topY-7,7,1,TP.brick_dk); // grey brick chimney
      ctx.fillStyle='rgba(190,190,196,0.40)'; ctx.fillRect(chx+1,topY-10,2,2); }        // smoke
    if (clinic){ var gy=topY+2; rect(ctx,cx-1,gy,3,7,TP.white); rect(ctx,cx-4,gy+2,9,3,TP.white); } // cross on the roof
  }
  function drawStall(ctx,bx,mid,botY){                                            // medieval shopfront bay: open counter + wares
    var x=bx+2, w=N-4;
    rect(ctx,x,mid+2,w,botY-5-(mid+2),TP.glass_dk); rect(ctx,x,mid+2,w,2,TP.frame);   // dim interior behind the opening
    rect(ctx,x-1,botY-5,w+2,2,TP.timber);                                             // fold-down counter board
    rect(ctx,x,botY-8,3,3,TP.awn_a); rect(ctx,x+4,botY-9,3,4,TP.thatch_lt); rect(ctx,x+8,botY-8,2,3,TP.clinic); // wares on the counter
    rect(ctx,x-1,botY-3,w+2,3,TP.daub_dk);                                            // stall base
  }
  function drawShop(ctx,L,topY,Wp,map,x0,ry){                                     // grey-brick shop with an open stall + hanging trade sign
    var R=L+Wp, cx=L+(Wp>>1), cols=Wp/N, eaveY=topY+13, wallTop=eaveY, wallBot=topY+2*N, footH=3;
    ctx.fillStyle='rgba(0,0,0,0.20)'; ctx.beginPath(); ctx.ellipse(cx+3,wallBot,(Wp>>1)+2,4,0,0,Math.PI*2); ctx.fill();
    brickWall(ctx,L,wallTop,Wp,wallBot,footH,(Math.imul(L,151)^Math.imul(topY,613)));
    var wbot=wallBot-footH, mid=(wallTop+wbot)>>1;
    for (var c=0;c<cols;c++){ var v=townRaw(map,x0+c,ry+1), ccx=L+c*N+(N>>1); if(v===12) drawDoor(ctx,ccx,wallBot-footH+1,false); else drawStall(ctx,L+c*N,mid,wbot); }
    gableRoof(ctx,L,topY,Wp,eaveY);
    var bkx=L, sy=topY+3;                                                             // hanging trade sign on an iron bracket (projects toward the path)
    rect(ctx,bkx-7,sy,8,2,TP.iron); rect(ctx,bkx-1,sy,2,3,TP.iron);
    rect(ctx,bkx-8,sy+3,9,7,TP.sign); rect(ctx,bkx-8,sy+3,9,1,TP.sign_dk); rect(ctx,bkx-8,sy+9,9,1,TP.sign_dk);
    rect(ctx,bkx-6,sy+5,5,3,TP.knob); px(ctx,bkx-4,sy+6,TP.sign_dk);                   // coin icon
  }
  function drawWallSeg(ctx,bx,by,map){
    var x=bx*N, y=by*N, rim=(townRaw(map,bx,by-1)!==1), BH=8, BW=16; // weathered ashlar; running bond aligned to WORLD coords -> no per-tile banding
    rect(ctx,x,y,N,N,TP.stone);
    for (var gy=Math.floor(y/BH)*BH; gy<y+N; gy+=BH){ var band=(gy/BH)|0, offx=(band&1)?8:0, ry0=Math.max(y,gy), ry1=Math.min(y+N,gy+BH);
      if (gy>=y){ hline(ctx,x,x+N-1,gy,TP.stone_mortar); if(gy+1<y+N) hline(ctx,x,x+N-1,gy+1,TP.stone_lt); } // mortar course + lit top-of-block bevel
      for (var gx=Math.ceil((x-offx)/BW)*BW+offx; gx<x+N; gx+=BW){ if(gx>=x){ vline(ctx,gx,ry0,ry1-1,TP.stone_mortar); if(gx+1<x+N) vline(ctx,gx+1,ry0,ry1-1,TP.stone_dk); } }
    }
    var mr=RNG((Math.imul(bx+7,131)^Math.imul(by+13,977))>>>0);     // sparse moss, denser toward the base
    for (var m=0;m<7;m++){ var mmx=x+ri(mr,0,N-1), mmy=y+ri(mr,4,N-1); if(mr()<0.55) px(ctx,mmx,mmy,(mr()<0.5)?TP.moss:TP.moss_dk); }
    rect(ctx,x,y,1,N,TP.stone_dk); rect(ctx,x+N-1,y,1,N,TP.stone_dk);            // shaded outer faces
    if (rim){ rect(ctx,x,y,N,2,TP.stone_cap); rect(ctx,x,y+2,N,1,TP.stone_lt); } // lit capstone along the outer rim
    if (townRaw(map,bx,by+1)!==1){ ctx.fillStyle='rgba(0,0,0,0.22)'; ctx.fillRect(x,y+N,N,2); } // base contact shadow
  }
  function drawSaveMon(ctx,bx,by){
    var cx=bx*N+(N>>1), baseY=by*N+N-1, ty=baseY-11;
    ctx.fillStyle='rgba(122,192,232,0.16)'; ctx.beginPath(); ctx.arc(cx,ty-3,11,0,Math.PI*2); ctx.fill();  // aura
    ctx.fillStyle='rgba(0,0,0,0.24)'; ctx.beginPath(); ctx.ellipse(cx,baseY,7,3,0,0,Math.PI*2); ctx.fill();
    rect(ctx,cx-6,baseY-3,12,3,TP.stone_dk); rect(ctx,cx-5,baseY-6,10,3,TP.stone); rect(ctx,cx-5,baseY-6,10,1,TP.stone_cap); // stepped plinth
    rect(ctx,cx-3,baseY-9,6,3,TP.stone); rect(ctx,cx-3,baseY-9,6,1,TP.stone_cap);
    polyf(ctx,[[cx,ty-9],[cx-4,ty-3],[cx,ty+1],[cx+4,ty-3]],TP.save);            // floating crystal
    polyf(ctx,[[cx,ty-9],[cx-4,ty-3],[cx,ty-3]],TP.save_lt);
    polyf(ctx,[[cx,ty-9],[cx+4,ty-3],[cx,ty-3]],TP.save_dk); polyf(ctx,[[cx,ty+1],[cx-4,ty-3],[cx,ty-3]],TP.save_dk);
    px(ctx,cx-1,ty-6,TP.white); px(ctx,cx,ty-5,TP.save_lt);                      // glint
  }
  function drawExitGate(ctx,L,by,w){
    var y=by*N, top=y+1, wpx=w*N, R=L+wpx, cxg=L+(wpx>>1);
    rect(ctx,L,top,3,N,TP.stone); rect(ctx,R-3,top,3,N,TP.stone);                // posts
    rect(ctx,L,top,3,2,TP.stone_cap); rect(ctx,R-3,top,3,2,TP.stone_cap);
    rect(ctx,L,top,wpx,3,TP.stone); rect(ctx,L,top,wpx,1,TP.stone_cap);          // lintel
    rect(ctx,cxg-4,top+3,8,4,TP.roof); rect(ctx,cxg-4,top+3,8,1,TP.roof_ridge);  // banner
  }
  function drawBush(ctx,cx,by){
    ctx.fillStyle='rgba(0,0,0,0.22)'; ctx.beginPath(); ctx.ellipse(cx,by,5,2,0,0,Math.PI*2); ctx.fill();
    function blob(x,y,r,c){ ctx.fillStyle=rgb(c); ctx.beginPath(); ctx.arc(x,y,r,0,Math.PI*2); ctx.fill(); }
    blob(cx,by-3,4,TP.bush_dk); blob(cx-3,by-3,3,TP.bush_dk); blob(cx+3,by-3,3,TP.bush_dk);   // dark base clumps
    blob(cx-2,by-4,3,TP.bush); blob(cx+2,by-5,3,TP.bush); blob(cx,by-6,3,TP.bush);            // mid
    blob(cx-1,by-6,2,TP.bush_lt); blob(cx+2,by-6,1,TP.bush_lt);                               // highlights
  }
  function townInterior(map,tx,ty){ // grass tile safe for decoration (all 8 neighbours walkable ground)
    if (townRaw(map,tx,ty)!==3) return false;
    for (var dx=-1;dx<=1;dx++) for (var dy=-1;dy<=1;dy++){ var v=townRaw(map,tx+dx,ty+dy); if(v!==3&&v!==0&&v!==5) return false; }
    return true;
  }
  function drawTownObjects(ctx,map,W,H){
    var objs=[];
    for (var ty=0;ty<H;ty++) for (var tx=0;tx<W;tx++){ var t=townRaw(map,tx,ty);
      if ((t===2||t===8||t===13) && townRaw(map,tx-1,ty)!==t){                     // building: left end of a roof run
        var w=1; while(townRaw(map,tx+w,ty)===t) w++;
        objs.push({y:(ty+2)*N,k:t===8?'shop':'house',bx:tx,by:ty,w:w,clinic:t===13});
      } else if (t===1){ objs.push({y:(ty+1)*N,k:'wall',bx:tx,by:ty}); }
      else if (t===6){ objs.push({y:(ty+1)*N,k:'save',bx:tx,by:ty}); }
      else if (t===7 && townRaw(map,tx-1,ty)!==7){ var w2=1; while(townRaw(map,tx+w2,ty)===7) w2++; objs.push({y:(ty+1)*N,k:'exit',bx:tx,by:ty,w:w2}); }
      else if (townInterior(map,tx,ty)){ var r=RNG((Math.imul(tx,73856093)^Math.imul(ty,19349663))>>>0);
        if (r()<0.20) objs.push({y:ty*N+N-2,k:'bush',x:tx*N+(N>>1)+ri(r,-3,3),by:ty*N+N-2});   // green bushes only (flowers removed per owner)
      }
    }
    objs.sort(function(a,b){ return a.y-b.y; });
    for (var i=0;i<objs.length;i++){ var o=objs[i];
      if (o.k==='house') drawHouse(ctx,o.bx*N,o.by*N,o.w*N,map,o.bx,o.by,o.clinic);
      else if (o.k==='shop') drawShop(ctx,o.bx*N,o.by*N,o.w*N,map,o.bx,o.by);
      else if (o.k==='wall') drawWallSeg(ctx,o.bx,o.by,map);
      else if (o.k==='save') drawSaveMon(ctx,o.bx,o.by);
      else if (o.k==='exit') drawExitGate(ctx,o.bx*N,o.by,o.w);
      else if (o.k==='bush') drawBush(ctx,o.x,o.by);
    }
  }
  var townState=null, lastTownMapId=null;
  function destroyTown(){ if(townState&&townState.image){ try{townState.image.destroy();}catch(e){} } townState=null; lastTownMapId=null; }
  function reskinTown(scene){
    var map=scene.mapData; if(!map||!map.length) return;
    var W=map[0].length, H=map.length;
    MUTED=null;                                                                    // raw tile reads for fieldAt (no stale overworld water-muting)
    townRoad=buildRoadMask(map);                                                   // connected cross-road mask
    if (terrainState&&terrainState.image){ try{terrainState.image.destroy();}catch(e){} terrainState=null; lastReskinMapId=null; } // tear down stale overworld
    if (overlayState&&overlayState.container){ try{overlayState.container.destroy();}catch(e){} overlayState=null; }
    if (dngState){ try{dngState.image&&dngState.image.destroy();}catch(e){} try{dngState.fog&&dngState.fog.destroy();}catch(e){} dngState=null; }
    if (townState&&townState.image){ try{townState.image.destroy();}catch(e){} }
    var key='dqtownskin'; if(scene.textures.exists(key)) scene.textures.remove(key);
    var ct=scene.textures.createCanvas(key, W*N, H*N); try{ct.setFilter(NEAREST);}catch(e){}
    var img=scene.add.image(0,0,key).setOrigin(0,0).setDepth(1).setScale(SC); try{img.texture.setFilter(NEAREST);}catch(e){}
    var c=ct.context; c.clearRect(0,0,W*N,H*N);
    drawTownGround(c,map,W,H); drawTownObjects(c,map,W,H);
    ct.refresh();
    townState={ scene:scene, ct:ct, image:img };
    window.__DQ_TOWN_OBJS__=(window.__DQ_TOWN_OBJS__||0)+1; window.__HD2D_STYLE__='dq-town'; // counts reskinTown runs (should stay 1 per town entry)
  }

  // ============================================================
  //  POLL LOOP
  // ============================================================
  var kindCache={};
  function sceneKind(scene){
    try { if(isOverworld(scene)) return 'ow';
      var id=scene.currentMapId; if(kindCache[id]) return kindCache[id];
      var tg=scene.tileGrid, k=null;
      for(var y=0;y<tg.length&&!k;y++) for(var x=0;x<(tg[y]||[]).length;x++){ var s=tg[y][x]; if(s&&s.texture&&s.texture.key){ k=s.texture.key; break; } }
      var kind=null;
      if(k){ if(/^town/.test(k)) kind='town'; else if(/^(dng|forest|tower|crystal|ice|shadow|tomb|castle)/.test(k)) kind='dng'; }
      if(kind) kindCache[id]=kind; return kind;
    } catch(e){ return null; }
  }
  function isOverworld(scene){
    try { var id=scene.currentMapId; return scene.cullingEnabled===true || id==='overworld' || /[Oo]verworld|[Ii]sles|[Pp]eaks|Realm|Temple/.test(String(id||'')); }
    catch(e){ return false; }
  }
  var lastReskinMapId=null;
  // SHIP SCOPE: owner 2026-07-09 confirmed towns + dungeons were LOCKED IN -> reflect them in the game.
  // (Initial same-day ship was overworld-only; owner reversed.) Overworld + town + dungeon reskin all ON.
  // NOTE: the dungeon reskin loads Codex prop PNGs from props/dqprop-<name>-128.png -> that dir MUST ship too.
  var SHIP_TOWN_DNG_RESKIN=true;
  function tick(){
    var g=window.__PHASER_GAME__; if(!g) return;
    var scene; try{ scene=g.scene.getScene('WorldMapScene'); }catch(e){ return; }
    if (!scene || !g.scene.isActive('WorldMapScene')) return;
    if (!scene.mapData || !scene.tileGrid || !scene.tileGrid.length) return;
    var kind=sceneKind(scene);
    if (kind!=='town' && townState) destroyTown();      // left a town -> drop its canvas so it can't linger over ow/dng
    if ((kind==='town'||kind==='dng') && owMap) destroyOwProps(); // entered a town/dungeon -> drop landmark prop images (NOT on a transient null kind)
    if (kind!=='ow' && !SHIP_TOWN_DNG_RESKIN){
      // Overworld-only ship: tear down any stale overworld terrain/overlay so it can't linger over the engine's
      // native town/dungeon art, then bail — towns + dungeons render exactly as the base game does (unchanged).
      if (terrainState&&terrainState.image){ try{terrainState.image.destroy();}catch(e){} terrainState=null; lastReskinMapId=null; }
      if (overlayState&&overlayState.container){ try{overlayState.container.destroy();}catch(e){} overlayState=null; }
      return;
    }
    if (kind==='ow'){
      var mapId=scene.currentMapId+':'+scene.mapData.length+'x'+(scene.mapData[0]?scene.mapData[0].length:0);
      if (mapId!==lastReskinMapId){ lastReskinMapId=mapId;
        // DATA MUTATION (owner-approved sandbox exception): consolidate sprinkled mountains in mapData IN PLACE,
        // ONCE per map load, BEFORE reskin — so overlay + minimap + collision all read the same tiles. Scoped to
        // the real 'overworld' map only (the map whose walkability/landmarks were BFS-validated). Then force an
        // immediate minimap redraw so it reflects the mutation without the 300ms throttle lag.
        if (scene.currentMapId==='overworld'){
          try{ consolidateMapData(scene);
               if (typeof scene.renderMinimap==='function'){ scene.lastMinimapUpdate=0; scene.renderMinimap(); }
          }catch(e){ if(window.__DQ_DEBUG__) console.log('dq consolidate err '+e+(e&&e.stack||'')); }
        }
        try{ reskin(scene); }catch(e){ if(window.__DQ_DEBUG__) console.log('dq reskin err '+e+(e&&e.stack?e.stack:'')); } }
      else { try{ ensureTerrain(scene); updateTerrain(scene,false); }catch(e){ if(window.__DQ_DEBUG__) console.log('dq terr err '+e); }
             try{ rebuildOverlay(scene,false); }catch(e){ if(window.__DQ_DEBUG__) console.log('dq ovl err '+e); } }
      try{ owSpecialObjects(scene); }catch(e){ if(window.__DQ_DEBUG__) console.log('dq owprop err '+e+(e&&e.stack||'')); } // ALWAYS run props (even during boot map-churn)
    } else if (kind==='dng'){
      try{ var tk=dngThemeKey(scene), changed=(tk!==curThemeKey); curThemeKey=tk; setTheme(tk);
           ensureDng(scene); updateDng(scene,changed); dngSpecialTiles(scene); updateFog(scene); window.__HD2D_STYLE__='dq-dng:'+tk; }catch(e){ if(window.__DQ_DEBUG__) console.log('dq dng err '+e+(e&&e.stack||'')); }
    } else if (kind==='town'){
      var tmid=scene.currentMapId+':'+scene.mapData.length+'x'+(scene.mapData[0]?scene.mapData[0].length:0);
      var alive=townState&&townState.scene===scene&&townState.image&&townState.image.scene;
      if (tmid!==lastTownMapId || !alive){ lastTownMapId=tmid; try{ reskinTown(scene); }catch(e){ if(window.__DQ_DEBUG__) console.log('dq town err '+e+(e&&e.stack||'')); } }
    }
  }
  setInterval(tick,80);
  window.__DQ_TILES__={ reskin:reskin, redraw:function(){ if(terrainState){ terrainState.lastWin=''; updateTerrain(terrainState.scene,true);} if(overlayState){ overlayState.lastKey=''; rebuildOverlay(overlayState.scene,true);} } };
})();
