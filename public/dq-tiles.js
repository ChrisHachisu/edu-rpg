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
   read the real mapData. N=48 native art unit, NEAREST x1 = 48px tile,
   matching the .py 1:1.
   ============================================================ */
(function () {
  'use strict';

  var N = 48, TILE = 48, SC = 1, MARGIN = 12;

  /* THE DIAGNOSTICS IN THIS FILE WERE UNREACHABLE ON THE ONLY SURFACE THAT MATTERS. Roughly
     twenty branches here log under window.__DQ_DEBUG__, and inside the real app there is no URL
     bar and no console to set it from -- the same wall scripts/seed_ios_save.py exists to get
     over. So it also reads a SEEDED key: `seed_ios_save.py --debug` writes localStorage
     `dq-debug`, and every one of those branches lights up on device. Off by default, wrapped
     because localStorage throws outright in some privacy modes. */
  try{ if(!window.__DQ_DEBUG__ && window.localStorage
       && window.localStorage.getItem('dq-debug')==='1') window.__DQ_DEBUG__=1; }catch(e){}

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
  // ============================================================
  //  MATERIALS — AI-generated tiling textures, splatted in world coordinates
  //
  //  Replaces the flat palette ramps below for grass / water / rock. Same architecture this
  //  file already uses (one windowed canvas, continuous world-pixel coordinates); only the
  //  FILL changes. Nothing here is per-tile, so nothing here can seam.
  //
  //  Generated once as a single 2x2 sheet -- one call, so the four cannot disagree with each
  //  other -- then made wrap-tileable offline (scripts/make_materials.py) and graded to the
  //  owner's target palette. The full method and why per-tile AI generation was abandoned:
  //  docs/MATERIAL-RENDERER-METHOD.md
  //
  //  Loading is async and FAILURE IS SAFE: until every material has decoded, and forever if
  //  they 404, MAT.ready stays false and every call site falls back to the original palette
  //  ramp. The reskin never depends on the fetch succeeding.
  // ============================================================
  var MAT={ready:false,m:{}};
  (function loadMaterials(){
    var names=['grass','forest','rock','water'], left=names.length, got={};
    names.forEach(function(nm){
      var im=new Image();
      im.onload=function(){
        try{
          var c=document.createElement('canvas'); c.width=im.width; c.height=im.height;
          var g=c.getContext('2d',{willReadFrequently:true}); g.drawImage(im,0,0);
          got[nm]={d:g.getImageData(0,0,im.width,im.height).data,T:im.width};
        }catch(e){ if(window.__DQ_DEBUG__) console.log('dq mat decode '+nm+' '+e); }
        if(--left===0) finish();
      };
      im.onerror=function(){ if(--left===0) finish(); };
      im.src='/materials/mat-'+nm+'.png';
    });
    function finish(){
      if(Object.keys(got).length!==names.length) {
        if(window.__DQ_DEBUG__) console.log('dq materials incomplete -> palette fallback');
        return;                                   // partial set is never used: all or nothing
      }
      MAT.m=got; MAT.ready=true;
      // materials arrived after the first paint -> repaint what is already on screen
      try{ if(window.__DQ_TILES__&&window.__DQ_TILES__.redraw) window.__DQ_TILES__.redraw(); }catch(e){}
    }
  })();
  // sample a material at a world pixel, wrapped. Two taps mixed by low-frequency noise: the
  // texture repeats every T px, and a single tap makes that repeat legible as a grid. The mix
  // field is continuous noise, so it breaks the repeat without introducing a grid of its own.
  var _mc=[0,0,0];
  function matPx(nm,wx,wy){
    var M=MAT.m[nm], T=M.T, d=M.d;
    var ax=((wx%T)+T)%T, ay=((wy%T)+T)%T;
    var bx=((wx+((T/3)|0))%T+T)%T, by=((wy+((2*T/5)|0))%T+T)%T;
    var i=(ay*T+ax)*4, j=(by*T+bx)*4;
    var k=vnoise(wx,wy,T*0.85,91); k=k<0.42?0:(k>0.58?1:(k-0.42)/0.16);
    _mc[0]=d[i]+(d[j]-d[i])*k; _mc[1]=d[i+1]+(d[j+1]-d[i+1])*k; _mc[2]=d[i+2]+(d[j+2]-d[i+2])*k;
    return _mc;
  }
  // reused, never freshly allocated: this runs once per pixel of the window and a new array
  // per pixel would churn the GC hard on a full-screen repaint. setData copies immediately.
  var _ms=[0,0,0];
  function matShade(nm,wx,wy,mul){          // sample + clamp, with a brightness multiplier
    var c=matPx(nm,wx,wy);
    var r=c[0]*mul, g=c[1]*mul, b=c[2]*mul;
    _ms[0]=r<0?0:(r>255?255:r)|0; _ms[1]=g<0?0:(g>255?255:g)|0; _ms[2]=b<0?0:(b>255?255:b)|0;
    return _ms;
  }
  // The SHORE BAND, in the same continuous water field the rest of the terrain uses.
  // Drawn as its own opaque band over whatever is behind it, and carried a little way past the
  // waterline into the shallows -- a treeline or cliff must stop AT a bank, not dissolve into
  // the water, and nothing may poke out from under it. Matches the offline renderer.
  var SAND_RGB=[156,138,95];
  // SHORE CHARACTER varies along the coast. Owner: strict class edges are not required, some
  // bleed between walkable terrain and water is fine as long as it looks natural -- and a
  // uniform sand rim drawn around every body of water is itself the unnatural thing. Real coast
  // alternates: open beach here, grass and trees coming right down to the waterline there.
  function beachyAt(wx,wy){
    var n=vnoise(wx,wy,780,211)*0.72 + vnoise(wx,wy,260,217)*0.28;
    var t=(n-0.42)/0.18; if(t<0)t=0; if(t>1)t=1; return t*t*(3-2*t);
  }
  function bankOver(c,wx,wy,W,lo,beachy){
    var hi=0.585, u=(W-lo)/(hi-lo);
    if (u<=0||u>=1) return c;
    var bk=u/0.32; var fade=(1-u)/0.20; if(fade<bk)bk=fade; if(bk>1)bk=1; if(bk<0)return c;
    bk*=0.62+0.38*vnoise(wx,wy,70,23);                       // ragged, never a contour band
    bk*=0.05+0.95*beachy;                                    // only beachy stretches get sand
    var wet=(0.50-W)/0.14; wet=wet<0?1:(wet>1?0:1-wet);      // damp and darker near the water
    var k=1-0.34*wet;
    c[0]+=(SAND_RGB[0]*k-c[0])*bk; c[1]+=(SAND_RGB[1]*k-c[1])*bk; c[2]+=(SAND_RGB[2]*k-c[2])*bk;
    // damp, darker margin where vegetation meets water on the non-beach stretches
    var dm=(1-beachy)*bk*0.55;
    if(dm>0){ var g=1-dm*0.30; c[0]*=g; c[1]*=g; c[2]*=g; }
    c[0]|=0; c[1]|=0; c[2]|=0;
    return c;
  }
  // ---------- LANDMARK SITES: the terrain owns the ground a landmark stands on ----------
  // LANDMARK-SPRITE-CONTRACT.md splits the two halves: the prop owns the STRUCTURE, the terrain
  // owns the SITE -- "packed-earth plaza, worn approach paths, trodden grass, the clearing ...
  // it IS terrain, so it blends by definition". Without it a prop reads as a sticker dropped on
  // grass, because its ground contact has nothing to sit in.
  //
  // Sites are derived from mapData itself (OW_LANDMARK tiles), so this needs no extra asset and
  // can never disagree with where the engine actually puts a landmark. The host material is
  // sampled from the neighbouring tiles, so a cave in a range gets scree and one in the woods
  // gets leaf litter rather than every site being the same dirt plaza.
  var EARTH_RGB=[128,104,66], SITE_ROCK=[104,99,86], SITE_FOREST=[78,62,41];
  var _siteMap=null, _sites=[], _winSites=[];
  function sitesFor(map){
    if(_siteMap===map) return _sites;
    _siteMap=map; _sites=[];
    for(var y=0;y<map.length;y++){ var row=map[y]; if(!row) continue;
      for(var x=0;x<row.length;x++){ var v=row[x];
        if(!OW_LANDMARK[v]) continue;
        var nm=OW_PROP[v]||'', big=(nm==='village'||nm==='castle');
        var rock=0, forest=0;                       // what is this landmark cut into?
        for(var dy=-3;dy<=3;dy++) for(var dx=-3;dx<=3;dx++){
          var nv=et(map,x+dx,y+dy); if(nv===4)rock++; else if(nv===3)forest++; }
        var tone=EARTH_RGB, tot=49;
        if(rock>forest && rock>tot*0.12) tone=SITE_ROCK;
        else if(forest>tot*0.12) tone=SITE_FOREST;
        _sites.push({x:x*N+N/2, y:y*N+N/2, r:(big?130:90), t:tone,
                     op:(tone===EARTH_RGB?0.94:0.72)});
      }
    }
    return _sites;
  }
  function siteOver(c,wx,wy,W){
    if (W>=0.50) return c;                          // a site is LAND, never painted over water
    for (var i=0;i<_winSites.length;i++){
      var s=_winSites[i], dx=wx-s.x, dy=wy-s.y;
      var r=Math.sqrt(dx*dx+dy*dy)+1e-6; if(r>s.r*2.0) continue;
      // ragged, wandering edge so the clearing never reads as a drawn circle
      var edge=s.r*(0.80+0.34*vnoise(s.x+dx*0.35,s.y+dy*0.35,s.r*0.42,137));
      var u=(r-edge*0.68)/(edge-edge*0.68+1e-6); if(u<0)u=0; if(u>1)u=1;
      var pad=1-u*u*(3-2*u);
      // worn approaches: four trodden spurs reaching out of the clearing
      var ang=Math.atan2(dy,dx), sp=Math.abs(Math.cos(2*ang)); sp=sp*sp*sp*sp*sp*sp;
      var o=(r-edge)/(edge*0.85+1e-6); if(o<0)o=0; if(o>1)o=1;
      pad+=sp*(1-o*o*(3-2*o))*0.75; if(pad>1)pad=1; if(pad<=0.004) continue;
      pad*=(0.55+0.45*vnoise(wx,wy,34,139))*s.op;
      var e=0.86+0.30*vnoise(wx,wy,19,141);
      c[0]+=(s.t[0]*e-c[0])*pad; c[1]+=(s.t[1]*e-c[1])*pad; c[2]+=(s.t[2]*e-c[2])*pad;
    }
    c[0]|=0; c[1]|=0; c[2]|=0;
    return c;
  }

  // ---------- RIDGED heightfield for mountains ----------
  // Plain value noise is isotropic, so shading it gives round blobs -- a range rendered that way
  // reads as an even carpet of boulders however far the amplitude is pushed. Folding each octave
  // as 1-|2n-1| turns what was a mid-value into a CREST, which is what produces real ridgelines
  // and rounded valleys. Squaring sharpens the crests further.
  function ridgedAt(wx,wy){
    var t=0, amp=1, sc=620, S=[71,73,75,77];
    for (var i=0;i<4;i++){
      var n=1-Math.abs(2*vnoise(wx,wy,sc,S[i])-1);
      t+=n*n*amp; amp*=0.48; sc*=0.45;
    }
    return t/1.86;
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
  // Overworld walkability. TWO consumers, and the second one is easy to miss: the reachability
  // safety gate below (owReach, which never mutates), AND owmTileBlock() ~line 2350, which copies
  // this table minus water and mountain to build the PIXEL collider's discrete blocker set.
  //
  // TILE 3 (tree) IS DELIBERATELY ABSENT HERE. Forest blocking is real, but it is not this table's
  // rule to state: it lives in act1-world-map.js's canMove wrapper, together with the story gate,
  // where the owner's plate owns it. Adding 3 here was tried on 2026-08-07 and reverted -- it
  // silences one symptom of a1mStep bypassing that wrapper while leaving the gate and the town
  // entries broken, and it moves a rule permanently out of the file that owns it. See a1mFree.
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
      if(x===140&&y===350&&window.__ACT1_WORLD_MAP__) continue; // locked V3: keep the Port-to-Reef trail visible to its threshold
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
    if(DUNG_LANDMARK[v]) return !!(tx===140&&ty===350&&window.__ACT1_WORLD_MAP__); // locked V3 Reef trail reaches its threshold
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
    var a=window.__ACT1_WORLD_MAP__,b=a&&a.bounds,natural=!!(b&&tx>=b[0]&&tx<=b[2]&&ty>=b[1]&&ty<=b[3]&&et(map,tx,ty)!==5);
    for(var yy=0;yy<N;yy++) for(var xx=0;xx<N;xx++){
      var wx=tx*N+xx,wy=ty*N+yy,edgeW=natural?6.0+(vnoise(wx,wy,17,419)-0.5)*1.6:6.5;
      if(roadOn(m,xx,yy,edgeW)){                                                   // outer = rim shape
        if(roadOn(m,xx,yy,natural?5.1:5.0)){
          var dn=natural?(vnoise(wx,wy,14,421)*0.72+vnoise(wx,wy,5,423)*0.28):0;
          px(ctx,bx+xx,by+yy,natural?(dn<0.25?P.dirt_dk:(dn>0.82?P.dirt_lt:P.dirt)):brickColor(wx,wy));
        }
        else px(ctx,bx+xx,by+yy, ((xx+yy)&1)?P.dirt_dk:P.dirt);                   // ~1.5px dirt RIM -> contained edge
      }
    }
  }
  function drawTerrain(ctx, map, X0, Y0, winW, winH){
    if (a1aBlit(ctx,X0,Y0,winW,winH,true)) return;   // wholly inside the Act 1 plate -> the baked art IS the terrain
    COST.splat++;                                    // past this line is the 2.97 Mpx per-pixel loop; see COST
    var cw=winW*N, ch=winH*N, wox=X0*N, woy=Y0*N;
    var SANDLO=(typeof window.__DQ_BEACH__==='number')?window.__DQ_BEACH__:0.27, FOAMHI=0.555; // wider, more gradual beach
    // presence scan — skip the expensive fields in windows with none of that type
    var hasMtn=false, hasPath=false;
    for (var sy=0;sy<winH;sy++){ for (var sx=0;sx<winW;sx++){ var sv=et(map,X0+sx,Y0+sy); if(sv===4)hasMtn=true; else if(sv===1)hasPath=true; } if(hasMtn&&hasPath)break; }
    var elev=null;
    // ONLY the palette fallback reads `elev` (the hillshade below, in the `else` of `if(MAT.ready)`).
    // The material path shades rock from ridgedAt() and never touches it. Built unconditionally this
    // was 11.9 MB of Float32Array plus one elevAt() per pixel -- 2.97 M calls over a 1584x1872 window
    // -- thrown away untouched on every window the textures had already decoded for, i.e. on the
    // normal path. Gated on !MAT.ready it costs exactly what it did before in the fallback and
    // nothing at all otherwise.
    if (hasMtn && !MAT.ready){ elev=new Float32Array(cw*ch); for(var ey=0;ey<ch;ey++) for(var ex=0;ex<cw;ex++) elev[ey*cw+ex]=elevAt(wox+ex,woy+ey); }
    // shortlist the landmark sites that can touch this window, so the per-pixel loop
    // walks a handful rather than every landmark on the map
    _winSites=[];
    if (MAT.ready){ var _all=sitesFor(map);
      for (var _s=0;_s<_all.length;_s++){ var _q=_all[_s], _m=_q.r*2.2;
        if (_q.x>wox-_m && _q.x<wox+cw+_m && _q.y>woy-_m && _q.y<woy+ch+_m) _winSites.push(_q); } }
    var img=ctx.createImageData(cw,ch), data=img.data; // alpha 0 everywhere by default
    for (var py=0;py<ch;py++){ var wy=woy+py, ty=Math.floor(wy/N);
      for (var pxk=0;pxk<cw;pxk++){ var wx=wox+pxk, tx=Math.floor(wx/N), tB=et(map,tx,ty);
        if (isSpecial(tB)){                              // landmark tiles -> ground under our prop
          if(OW_LANDMARK[tB]) setData(data,cw,pxk,py, MAT.ready
            ? matShade('grass',wx,wy,0.90+(vnoise(wx,wy,620,7)*0.6+vnoise(wx,wy,190,9)*0.4)*0.22)
            : gshade(wx,wy));
          continue;                                      // other specials stay transparent
        }
        var col;
        var W=waterField(map,wx,wy);                     // water field covers bridge(5) too -> water under the deck
        var Mf0 = (W<0.50 && hasMtn) ? mountainField(map,wx,wy) : -1;
        if (MAT.ready){
          // ---- MATERIAL PATH: same fields, textured fill instead of a palette ramp --------
          if (W>=0.50){
            var dep=(W-0.50)/0.45; if(dep>1)dep=1;       // shallow at the shore -> deep offshore
            col=matShade('water',wx,wy,1.0-dep*0.40);
          } else if (Mf0>=0.50){
            // RIDGED height field, hillshaded: the range is read from its spine and the valleys
            // either side, not from its stone texture. Mf0 doubles as the massif profile so the
            // range rises from its foot to its crest instead of sitting on a flat plate.
            var mass=0.32+0.68*Mf0;
            var H0=ridgedAt(wx,wy)*mass, H1=ridgedAt(wx+14,wy+14)*mass;
            var mm=1.0+(H0-H1)*11.0+(H0-0.45)*0.55;
            var vo=(0.42-H0)/0.36; if(vo<0)vo=0; if(vo>1)vo=1;
            mm*=1-vo*vo*(3-2*vo)*0.34;                   // valleys occlude and go dark
            if(mm<0.34)mm=0.34; if(mm>1.85)mm=1.85;
            col=matShade('rock',wx,wy,mm);
            var cr=(H0-0.62)/0.24; if(cr>0){ if(cr>1)cr=1;  // paler stone along the summit line
              cr*=cr*(3-2*cr)*(0.35+0.65*vnoise(wx,wy,60,83))*0.22;
              col[0]+=(186-col[0])*cr; col[1]+=(188-col[1])*cr; col[2]+=(180-col[2])*cr; }
          } else {
            var gn=vnoise(wx,wy,620,7)*0.6+vnoise(wx,wy,190,9)*0.4;   // broad meadow sweeps
            col=matShade('grass',wx,wy,0.90+gn*0.22);
          }
          col=bankOver(col,wx,wy,W,SANDLO-0.02,beachyAt(wx,wy));  // varied shore over the fill
          col=siteOver(col,wx,wy,W);                     // landmark clearing, if any is near
        } else {
          // ---- PALETTE FALLBACK: unchanged, and what renders if the textures never load ----
          if (W>=0.50){
            if (W<FOAMHI) col=P.foam; else col=waterColor(wx,wy,W);     // natural multi-tone water
          } else if (Mf0>=0.50){   // mass follows raw tile-4, the CONSOLIDATED cluster shape
            // NATURAL MOUNTAIN MASS (heightfield + 3D slope shading + snow caps) — unchanged
            var i=py*cw+pxk, e=elev[i];
            var eL=pxk>0?elev[i-1]:e, eR=pxk<cw-1?elev[i+1]:e, eU=py>0?elev[i-cw]:e, eD=py<ch-1?elev[i+cw]:e;
            var bri=-((eR-eL)+(eD-eU)), tex=(vnoise(wx,wy,6,201)-0.5)*0.05;
            var L=0.5 + bri*4 + (e-0.5)*0.14 + tex;
            var Lc = L>0.80?0.80:L;
            col = (Mf0<0.52) ? lerp(ROCK0,P.rock_dk,0.4) : rockRamp(Lc);
          } else if (W>=SANDLO){
            col=lerp(P.sand,P.sand_dk,(W-SANDLO)/(0.50-SANDLO));        // beach band near water
          } else {
            col=gshade(wx,wy);                                          // grass (paths are a SEPARATE overlaid road layer)
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
    a1aBlit(ctx,X0,Y0,winW,winH,false);   // window straddles the plate edge: the baked art overdraws its own half
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
    var tiers=ri(r,3,5), baseW=ri(r,12,18), trunkH=ri(r,8,12), th=ri(r,8,10);
    rect(ctx,cx-2,by-trunkH,5,trunkH,P.trunk); vline(ctx,cx+2,by-trunkH,by-1,P.trunk_dk); px(ctx,cx-2,by-1,P.trunk_dk);
    var cy=by-trunkH;
    for (var i=0;i<tiers;i++){
      var t=tiers>1?i/(tiers-1):0;
      var w=Math.max(2, Math.round(baseW*(1-t*0.72)));                  // symmetric taper
      var apY=cy-th, sh=Math.max(1,Math.round(th*0.5)), w35=Math.round(w*0.38), w55=Math.round(w*0.55);
      polyf(ctx,[[cx-w-3,cy+3],[cx,apY],[cx+w+3,cy+3]],d2);             // drop-shadow fringe (behind -> tier separation/depth)
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
    var W=small?ri(r,16,22):ri(r,26,34), H=small?ri(r,22,30):ri(r,36,48), lean=ri(r,-4,4);
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
    rect(ctx,ax-2,ay,4,3,lerp(P.rock_lt,[210,196,170],0.5));                  // apex catches light (natural peak, NO snow cap)
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
    var AW=48,AH=64,cx=24,by=AH-3; // 48-unit redraw: readable beside the hero without reverting to chunky 3px upscaling
    var cv=document.createElement('canvas'); cv.width=AW*SC; cv.height=AH*SC;
    var ctx=cv.getContext('2d'); ctx.imageSmoothingEnabled=false; ctx.save(); ctx.scale(SC,SC); pine(ctx,cx,by,variant,shape); ctx.restore();
    if(scene.textures.exists(key)) scene.textures.remove(key);
    var t=scene.textures.addCanvas(key,cv); if(t&&t.refresh)t.refresh();
    texCache[key]={aw:AW,ah:AH,cx:cx,by:by}; return key;
  }
  function ensureMtnTex(scene,seed,small){
    var key='dqo_mtn_'+(seed%9973)+'_'+(small?1:0); if(texCache[key]) return key;
    var AW=80,AH=60,cx=40,by=AH-3; // 48-unit redraw: mountains stay large without 3px-upscaling the old art
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
  // WHAT COST THAT FRAME. The owner's phone is the only instrument that has ever seen the freeze,
  // and a screenshot of the diagnostic panel is the whole channel, so the panel has to carry enough
  // to ATTRIBUTE a stall rather than just report one. Three counters, because there are exactly
  // three candidates for a ~½–1 s hitch at a window step and they are indistinguishable by timing
  // alone: the analytic splat (`sp`), a chunk's canopy composite on a 1536x1536 scratch canvas
  // (`cv`), and a chunk texture upload (`tx2`). `pl` says whether the Act 1 plate owns the map --
  // without it a reading of sp:0 cannot be told apart from a run where the override never applied.
  var COST={ splat:0, canopy:0, tex:0, wMs:0, wWhat:'-' };
  // COUNTS WERE NOT ENOUGH. Throttling the builds to one per tick did not move the window-step
  // stall (853/893 ms after, against 661/939 ms before), and this session's own counters refute the
  // simple story: 24 texture builds and 8 canopy composites produced only TWO long frames, so it is
  // not that every build is expensive. Something specific is, and only a stopwatch on the individual
  // operation can say which. `wb` reports the worst single one and names it.
  function costTime(what,fn){
    var t0=(window.performance&&performance.now)?performance.now():Date.now();
    var r=fn();
    var d=((window.performance&&performance.now)?performance.now():Date.now())-t0;
    if(d>COST.wMs){ COST.wMs=Math.round(d); COST.wWhat=what; }
    return r;
  }
  var NEAREST=(window.Phaser&&Phaser.Textures&&Phaser.Textures.FilterMode)?Phaser.Textures.FilterMode.NEAREST:1;

  // Keep a generous off-screen tile margin and move the render window in chunks. The old window
  // followed the camera one tile at a time, repainting millions of pixels and rebuilding every tree
  // on practically every player step.
  function windowStart(worldPos,winTiles,totalTiles){
    var wanted=Math.floor(worldPos/TILE)-MARGIN, step=Math.max(1,MARGIN);
    var snapped=Math.floor(wanted/step)*step;
    return Math.max(0,Math.min(Math.max(0,totalTiles-winTiles),snapped));
  }

  // ============================================================
  //  ACT 1 HI-FI OVERWORLD ART — the baked chunks, blitted 1:1
  // ============================================================
  //  Inside the Act 1 plate the terrain is NOT drawn: it is the owner-locked art, blitted.
  //  `act1-hifi/chunks/base` is act1-material-map.png cut into 30 tiles (verified pixel-equivalent
  //  to it, WebP loss aside), so this is the same relationship drawDungeon/a1dBlit already has with
  //  the baked dungeon floors — copy the pixels, draw nothing.
  //
  //  GEOMETRY. A chunk's manifest x/y/width/height are its footprint in a 16-px-per-cell space;
  //  the shipped base/canopy images are 3x denser (48 px/cell = TILE), which is why the blit needs
  //  no rescaling. That 3 is DERIVED from the manifest below, not hardcoded, so a re-bake at a
  //  different density keeps working. Chunk (0,0) is the plate origin, cell (bounds[0],bounds[1]).
  //
  //  CANOPY is not a second painting. It is an alpha-only mask (0 or 242) over pixels that are
  //  identical to base — forest crowns, cut out of the base and redrawn ABOVE the hero (depth 10)
  //  so the player walks under the treeline. Reproduced here with one destination-in composite,
  //  the same way runtime.html's canopyFor() does it.
  // `win` is the chunk-id list the LAST BUILT overworld window intersected, maintained by a1aRects.
  // It is what a1aReleaseChunks keeps when the player walks off the overworld -- see there for why.
  // `released` latches the trim so it runs once per departure rather than on every 80 ms tick.
  var A1A={ manifest:null, req:false, S:0, chunks:{}, lru:[], win:[], released:false, landmarks:null, dirty:false, drew:false,
                imgs:{}, tex:{}, spriteScene:null, lastRects:null, lastFull:false,
                texQ:[], texQd:{}, bmPend:{} };
  // A 40x38 window can INTERSECT 9 chunks (measured over every plate position, worst case at cell
  // 41,245). The cap must never sit below that or the trim evicts a chunk the current window still
  // needs, which re-requests and re-evicts it forever: the window never reports full coverage, so
  // the per-pixel splat runs every update and tick() force-rebuilds the overlay at 12.5 Hz.
  // It must not sit far ABOVE it either, because every slot is expensive.
  //
  // ~~"a decoded chunk is ~9 MB of base plus ~9 MB of canopy, so every slot is ~19 MB of resident
  // image"~~ **THAT UNDERCOUNTS BY MORE THAN HALF.** Measured 2026-08-13 from the bake itself (20 of
  // the 30 chunks are a full 1536x1536; the edge chunks are smaller), a fully-live slot is:
  //     rec.base           1536*1536*4  =  9.44 MB   decoded, held
  //     rec.canopy         1536*1536*4  =  9.44 MB   decoded, held
  //     rec.water           512* 512*4  =  1.05 MB   decoded, held
  //     canopy composite   1536*1536*4  =  9.44 MB   held by Phaser's TextureSource, see below
  //     GPU textures       base+canopy+water = 19.93 MB
  //                                           --------
  //                                             49.3 MB per chunk, x10 = ~493 MB
  // Note how small the FILES are by comparison: all 30 canopy chunks together are under 0.1 MB on
  // disk, because they are almost entirely transparent. On-disk size says nothing about what a chunk
  // costs once it is decoded, which is how the old figure came to look safe.
  //
  // ~~"The cap STAYS at 10, and lowering it is not the lever it looks like."~~ **That was written
  // earlier the same day and the ring change below made it FALSE.** It was true while the prefetch
  // ring padded by MARGIN: the trim floor is `Math.max(A1A_MAX_CHUNKS, keep.length)` and `keep` is
  // the RING, so a 9-chunk ring held the floor at 9 no matter what this number said. With
  // A1A_RING_MARGIN=0 the ring IS the window -- 4 chunks on the owner's phone, 6 at the measured
  // worst case -- so the floor is now `max(10, 4..6)` = **10, and this number is what binds.** The
  // cache was still free to grow to ten chunks while walking; shrinking the ring alone did not stop
  // that. Struck here rather than in a new note, per docs/GROUND-TRUTH.md.
  //
  // SET TO THE MEASURED WORST-CASE WINDOW -- **re-derived 2026-08-14 for the 16-cell grid.**
  // ~~"6 is the peak intersection ... worst case ~296 MB"~~ was correct for the 32-cell chunks and
  // is wrong now: the plate was RE-TILED from 30 chunks of 32 cells to 120 chunks of 16 cells
  // (chunkSize 512 -> 256), because a 32-cell chunk against a ~9-cell camera meant most of every
  // loaded chunk was off screen. Same pixels -- the re-cut is exact, proven over the FULL set at
  // max abs diff 0, cropped from the existing baked raster rather than re-rendered.
  //
  // Swept over the real geometry, 192 window steps across the plate:
  //     32-cell grid   window needs peak  6   ~443 MB worst ring
  //     16-cell grid   window needs peak 12   ~148 MB worst ring   <- this
  //      8-cell grid   window needs peak 72   ~222 MB, 3.4x the HTTP requests -- rejected
  // 12 is that peak intersection, so the cap cannot evict a chunk being drawn -- and not by luck:
  // the ring is touched FIRST and the drawn chunks LAST, so the LRU's old end is always the
  // speculative and departed ones, and the `max(cap, keep.length)` floor raises the cap on any
  // device whose window genuinely needs more.
  //
  // MEASURED IN A LIVE SCENE at the same seeded window, not simulated: resident chunk textures
  // **156.9 MB -> 59.8 MB**. And it survives the test that killed the previous memory attempt: a
  // real WEBGL_lose_context loss/restore cycle returns to the byte-identical resident state with
  // ZERO network refetches (the reverted attempt managed 108 refetches and never recovered).
  //
  // If BACK-TRACKING starts to churn -- walk east, turn around, and the chunk behind you has to come
  // back -- this is the dial: 7 or 8 buys a window of hysteresis at ~49 MB a slot. Door round trips
  // are already covered separately by a1aReleaseChunks keeping A1A.win.
  var A1A_MAX_CHUNKS=12;
  // Drain-rate state: >0 means "we just came back from a departure, rebuild fast". See kind==='ow'.
  // RATE x TICKS must comfortably exceed a full window's texture count (16 chunks x 3 layers = 48 on
  // the 16-cell grid) so the rebuild finishes inside the transition rather than trickling into view.
  // 12 x 8 = 96 leaves headroom for a device whose window needs more, and the burst stops the moment
  // the queue empties, so the headroom costs nothing when it is not needed. Each upload is an
  // addImage from a bitmap already in memory (~2 ms), and these frames are behind the battle-exit
  // cover in index.html, which is the point of that cover.
  var A1AB={ burst:0 }, A1AB_RATE=12, A1AB_TICKS=8;
  // Leaving the overworld TRIMS the chunk cache down to the one window the hero is standing in, and
  // drops everything else. It used to drop ALL of it, and that was the whole of SMOOTH-5.
  //
  // WHAT DROPPING EVERYTHING COST. The baked chunks are the overworld's terrain; without them
  // a1aBlit cannot report full coverage and drawTerrain falls through to its analytic per-pixel loop
  // over the whole 1584x1872 window. So walking back out of Greenhollow re-requested every layer of
  // every visible chunk AND synthesised 3.85 M pixels of terrain to cover the wait. Measured on this
  // tree at 960x720 (scratch profile, 2026-08-07): town -> overworld took 4581.9 ms, of which the
  // chunk round trip was 2302 ms and the splat's own vnoise/waterField/matShade evaluation another
  // ~2.6 s of CPU. Entering the town through the same door cost 80.1 ms. Nothing about walking
  // through a door invalidates baked terrain art, so none of that work needed doing.
  //
  // WHY KEEPING THEM CANNOT GO STALE -- the question this file has got wrong before (see the
  // owmBakeFor memo below, which keyed on mapData array identity while the contents were mutated
  // underneath it and poisoned itself for the session). This cache is not like that one:
  //   * The key is the MANIFEST chunk id. Its value is the decoded content of a static URL,
  //     act1-hifi/chunks/<layer>/<id>.webp, which is a pure function of the id and cannot change
  //     within a session -- the manifest itself is fetched exactly once (A1A.req latches).
  //   * It holds NO map data. mapData is mutated in place by consolidateMapData and by
  //     __ACT1_WORLD_MAP__.apply(), and a chunk image is unaffected by both: a1aChunkAt maps a cell
  //     to a chunk purely through manifest.semanticBounds, never through a tile value.
  //   * Nothing downstream is cached. The COMPOSITION of these images into the window is redone
  //     from scratch on the reskin that every map swap forces (updateTerrain(scene,true)), so a
  //     retained image can only ever be re-blitted, never re-shown stale.
  // The invalidation is therefore "never, within a session", and the page load is what clears it.
  //
  // WHAT IT COSTS. Off-overworld residency goes from 0 to the departure window's chunks -- measured
  // 4 of them (~49.3 MB each, decoded images plus the composite and the GPU textures -- see the
  // A1A_MAX_CHUNKS memo, where the old ~19 MB figure is corrected and measured), i.e. ~197 MB held
  // while the player is in a town or a dungeon. That is strictly less than the ~493 MB the overworld
  // already holds while being played, so this raises the OFF-overworld floor without moving the
  // peak. The original concern -- a dungeon allocating its own base + fog canvases on top of a full
  // 10-slot cache -- is still addressed, because the other six slots are still dropped here.
  function a1aReleaseChunks(){
    if(A1A.released) return;                       // idempotent: tick() calls this on EVERY non-'ow' tick
    A1A.released=true;
    // INVALIDATE THE WINDOW CACHES, or nothing ever asks for the terrain back.
    //
    // This is the black screen the owner reported after a battle, and his own 85 s recording is what
    // identified it: the HUD is drawn, the HERO IS DRAWN, fps is 60 -- so the scene is rendering and
    // it is only the TERRAIN that is missing, which rules out the a1vShow visibility latch that was
    // previously suspected (a `visible:false` scene would hide the hero too). Longest span 6.5 s,
    // one of them immediately after a battle exit at 78,253.
    //
    // A battle takes tick()'s `!isActive('WorldMapScene')` early return, so `lastReskinMapId` is
    // never cleared and the return goes down the ELSE branch with force=false. updateTerrain then
    // hits `if(!force && key===terrainState.lastWin) return` -- the hero is on the same tile she
    // left, so the key is identical -- and a1aRects, the ONLY thing that re-requests a dropped
    // chunk, never runs. Nothing is loading, so nothing sets A1A.dirty, so no later tick forces it
    // either. It is a deadlock that only the hero WALKING far enough to cross a 12-cell boundary can
    // break, which is exactly a black screen of a few seconds that ends when she moves.
    //
    // Clearing the two window keys here costs one rebuild on the tick after any departure -- and on
    // the plate that rebuild is now a1aRects plus sprite placement, not a 2.97 Mpx splat.
    if(terrainState) terrainState.lastWin='';
    if(overlayState) overlayState.lastKey='';
    var keep=Object.create(null), i;
    for(i=0;i<A1A.win.length;i++) keep[A1A.win[i]]=1;
    var next={}, lru=[];
    for(i=0;i<A1A.lru.length;i++){ var id=A1A.lru[i];
      if(keep[id]&&A1A.chunks[id]){ next[id]=A1A.chunks[id]; lru.push(id); } else a1aDropChunkGpu(id); }
    A1A.chunks=next; A1A.lru=lru; A1A.drew=false;
    if(a1aScratch){ try{ a1aScratch.width=1; a1aScratch.height=1; }catch(e){} a1aScratch=null; }
  }
  /* THE MANIFEST IS THE OTHER WAY TO GET A PERMANENTLY BLUE MAP, AND THE WORSE ONE. The per-layer
     retry above rescues one chunk; if the MANIFEST never arrives there are no chunks at all --
     `a1aRects` returns null on its first line and the whole overworld is flat blue while movement and
     gameplay carry on perfectly. That is the owner's symptom exactly, and at full-map scale it fits
     "the map stops loading" better than a single chunk does.

     This function was one-shot and had NO onerror on either request: `A1A.req` was set true and never
     cleared, so a transient network failure, a 404, or an error page that fails JSON.parse all left
     `A1A.manifest` null for the rest of the session. The loading gate deliberately does not wait on
     it (see its "NOTHING HERE MAY WAIT ON AN ASSET THAT MIGHT NEVER ARRIVE"), which is correct and
     also means nothing else would ever notice.

     Now bounded-retryable on the same policy as the layers, driven by the tick() that already calls
     this. The DENSITY GUARD is deliberately NOT retryable: an unexpected density is a decision to
     leave the art off, not a failure, and re-fetching cannot change it. */
  var A1A_REQ_TRIES=6, A1A_REQ_BACKOFF=1500;
  function a1aReqFailed(){
    A1A.req=false;                                               // let the next tick re-issue
    A1A.reqFail=(A1A.reqFail|0)+1;
    A1A.reqNext=Date.now()+A1A_REQ_BACKOFF*A1A.reqFail;
  }
  function a1aFetch(){
    // FIRST, and unconditionally: the two requests fail independently, so a manifest that has already
    // landed must not stop a failed landmark table from being retried.
    a1aFetchLandmarks();
    if(A1A.manifest||A1A.req) return;                            // landed, or in flight
    if((A1A.reqFail|0)>=A1A_REQ_TRIES) return;                   // exhausted: quiet, as a 404 should be
    if(Date.now()<(A1A.reqNext|0)) return;                       // backing off
    A1A.req=true;
    var r=new XMLHttpRequest(); r.open('GET','act1-hifi/manifest.json',true);
    r.onload=function(){
      if(r.status&&(r.status<200||r.status>=300)){ a1aReqFailed(); return; }
      try{
        var m=JSON.parse(r.responseText), B=m&&m.semanticBounds, cs=m&&m.chunks;
        if(!B||!cs||!cs.length){ a1aReqFailed(); return; }
        var mw=0; for(var i=0;i<cs.length;i++) mw=Math.max(mw,cs[i].x+cs[i].width);
        var S=TILE*(B[2]-B[0]+1)/mw;                             // world px per manifest px
        if(!(S>=1)||S!==Math.round(S)) return;                   // deliberate: leave the art off, do NOT retry
        A1A.S=S; A1A.manifest=m; A1A.dirty=true; A1A.reqFail=0;
        a1aPrefetchStart();                                      // chunks for the first window, now
      }catch(e){ a1aReqFailed(); }
    };
    r.onerror=function(){ a1aReqFailed(); };
    r.ontimeout=function(){ a1aReqFailed(); };
    try{ r.send(); }catch(e){ a1aReqFailed(); }
  }
  // Separate flag from the manifest's: a missing landmark table must not keep the terrain off, and a
  // missing manifest must not keep the table from arriving.
  function a1aFetchLandmarks(){
    if(A1A.landmarks||A1A.lmReq) return;
    if((A1A.lmFail|0)>=A1A_REQ_TRIES) return;
    if(Date.now()<(A1A.lmNext|0)) return;
    A1A.lmReq=true;
    var fail=function(){ A1A.lmReq=false; A1A.lmFail=(A1A.lmFail|0)+1;
                         A1A.lmNext=Date.now()+A1A_REQ_BACKOFF*A1A.lmFail; };
    var l=new XMLHttpRequest(); l.open('GET','act1-hifi/landmarks/landmarks.json',true);
    l.onload=function(){
      if(l.status&&(l.status<200||l.status>=300)){ fail(); return; }
      try{ var d=JSON.parse(l.responseText);
        if(d&&d.landmarks&&d.landmarks.length){ A1A.landmarks=d.landmarks; A1A.lmFail=0; }
        else fail();
      }catch(e){ fail(); }
    };
    l.onerror=function(){ fail(); };
    try{ l.send(); }catch(e){ fail(); }
  }
  // Where the hero will be standing the first time an overworld window is built, in overworld cells.
  // Resumed on the overworld: that is the saved position. Resumed anywhere else (which includes a
  // NEW game, since the default save position is inside Greenhollow): the cell she lands on walking
  // out, which is the landmark table's `exit` -- act1-world-map.js loads BEFORE this file and
  // rewrites the bundle's own connections, so its table is the authority and the bundle's toX/toY
  // is not. Manifest `startCell` is the last resort.
  function a1aStartCell(){
    var p=null;
    try{ var sv=JSON.parse(localStorage.getItem('edu-rpg-save')||'null'); p=sv&&sv.player&&sv.player.position; }catch(e){}
    if(p&&p.mapId==='overworld'&&typeof p.x==='number'&&typeof p.y==='number') return {x:p.x,y:p.y};
    var WM=window.__ACT1_WORLD_MAP__, L=WM&&WM.landmarks, id=(p&&p.mapId)||'greenhollow';
    if(L) for(var i=0;i<L.length;i++) if(L[i].mapId===id) return L[i].exit||L[i].at;
    var m=A1A.manifest; return (m&&m.startCell)||null;
  }
  // PREFETCH THE FIRST WINDOW'S CHUNKS, the moment the manifest lands.
  //
  // Same rationale as the a1dFetch/a1dArtFor prefetch at the bottom of this file: a chunk asked for
  // on the frame it is first needed cannot possibly answer that frame, and a window without full
  // chunk coverage does not blit -- it falls through a1aBlit into drawTerrain's per-pixel loop over
  // 1584x1872 = 2.97 M pixels. Asking here, while the title screen is still up, is what lets the
  // first real window be a blit instead.
  //
  // BEST-EFFORT BY CONSTRUCTION. The render window's size comes from the camera, which does not
  // exist yet, so this uses the 40x38 window this file already documents as the worst case (see
  // A1A_MAX_CHUNKS above), and windowStart's map-size clamp is skipped -- the plate sits well
  // inside the 320x400 overworld, so the only effect is at most one extra chunk requested for a
  // save parked on the very last row. Whatever this misses, a1aRects requests on the first real
  // window exactly as it does today; nothing downstream depends on this having been right.
  var A1A_PRE_W=40, A1A_PRE_H=38;
  function a1aPrefetchStart(){
    var c=a1aStartCell(); if(!c) return;
    var X0=Math.max(0,Math.floor((c.x-MARGIN)/MARGIN)*MARGIN), Y0=Math.max(0,Math.floor((c.y-MARGIN)/MARGIN)*MARGIN);
    try{ a1aRects(X0,Y0,A1A_PRE_W,A1A_PRE_H); }catch(e){}
  }
  // ONE LAYER OF ONE CHUNK, DECODED OFF THE MAIN THREAD.
  //
  // The obvious `new Image(); im.src=...` gives a decoded bitmap that lives on the main thread, and
  // everything that then hands it to the GPU has to copy 9.4 MB there: measured 2026-08-08 in the
  // live scene, `addImage(HTMLImageElement)` costs 35-68 ms and `createImageBitmap(thatImage)`
  // costs 43-72 ms -- the same copy, billed at whichever door you use. Decoding from the BLOB
  // instead produces the bitmap off-thread, and `addImage(ImageBitmap)` then costs 1.5-2.6 ms.
  //
  // premultiplyAlpha:'none' is not a detail. It keeps the source exactly what the Image path gave
  // Phaser -- straight alpha, premultiplied by the GL upload (UNPACK_PREMULTIPLY_ALPHA_WEBGL) --
  // so the pixels that reach the screen are the same ones. Anything else double-premultiplies the
  // canopy (alpha 242) and the water glint.
  //
  // Both paths flip A1A.dirty only when THIS layer can change what the window shows. A canopy or
  // water layer that lands before its own base is dead weight: a1aRects skips the whole chunk
  // while `rec.base` is missing, so the flip cannot alter a single pixel -- all it does is force
  // the next tick to rebuild a window still short of full coverage, and a window short of coverage
  // falls through a1aBlit into drawTerrain's per-pixel splat. Thirty chunks x three layers meant
  // one 2.97 M-px splat per tick for the whole of the load.
  /* ---- A LAYER THAT FAILED TO LOAD MUST BE ASKED FOR AGAIN --------------------------------------
     Owner, after build 43: "when the game gets overloaded the map stops loading and stays blue
     (movement and game play is fine)", and he is explicit that this is a long-standing edge case
     rather than a regression: "we just need to maybe harden the loading check?"

     THAT SYMPTOM IS NOT A LOST CONTEXT, AND READING IT AS ONE SENT EVERY EARLIER FIX TO THE WRONG
     PLACE. A lost GL context takes the hero, the props and the UI with it. Movement and gameplay
     surviving means the renderer is alive and only the terrain never arrived, which is a LOADING
     failure, and the loader had no retry at all:

       * `a1aLoadLayerImg`'s `im.onerror` was an empty function, commented "a missing layer degrades,
         never wedges". It degrades permanently. `rec[k]` is never set, so `a1aArtAt` reads false and
         `a1aRects` filters the chunk out of every window from then on -- flat blue, forever.
       * `a1aChunkRec` only ever issued loads on the frame it CREATED the record. Once the record
         exists a missing layer is never requested again, however many times the window is rebuilt.

     So one transient failure under memory pressure -- exactly "when the game gets overloaded", where
     `createImageBitmap` and an `Image` decode are both liable to fail -- wedges that chunk for the
     rest of the session. The watchdog cannot rescue it either: its cheap pass re-uploads from decoded
     images and there IS no decoded image, its deep pass is capped at `A1AW_MAX` 8 for the whole
     session, and its progress veto reads OTHER chunks succeeding as proof the renderer is healthy.
     Which is why the documented cure was a reload (see A1AW's own comment).

     The fix is to make the loader self-healing rather than to loosen the watchdog: record the
     failure, back off, and let the next window rebuild ask again. Bounded so a genuinely absent file
     cannot spin -- a 404 will exhaust its tries and go quiet, which is the old "degrades" behaviour
     preserved for the case it was actually written for. */
  var A1A_LAYERS=['base','canopy','water'];   // one list, so the loader and the retry cannot diverge
  var A1A_LOAD_TRIES=6;         // per layer, per residency -- a re-entered chunk starts fresh
  var A1A_LOAD_BACKOFF=1200;    // ms before a failed layer may be asked for again
  function a1aLd(rec){ return rec.ld||(rec.ld={pend:{},fail:{},next:{}}); }
  function a1aLayerLanded(c,rec,k,src){
    var ld=a1aLd(rec); delete ld.pend[k]; ld.fail[k]=0;
    rec[k]=src; if(rec.base) A1A.dirty=true; a1aEnqueueTex(c,rec);
  }
  function a1aLayerFailed(rec,k){
    var ld=a1aLd(rec); delete ld.pend[k];
    ld.fail[k]=(ld.fail[k]|0)+1;
    ld.next[k]=Date.now()+A1A_LOAD_BACKOFF*ld.fail[k];         // linear back-off, not a tight spin
  }
  function a1aLoadLayerImg(c,rec,k){
    var im=new Image();
    im.onload=function(){ a1aLayerLanded(c,rec,k,im); };
    im.onerror=function(){ a1aLayerFailed(rec,k); };            // BOTH paths are now out: record it
    im.src='act1-hifi/'+c[k];
  }
  function a1aLoadLayer(c,rec,k){
    a1aLd(rec).pend[k]=true;                                    // in flight: the sweep must not double-issue
    if(!(A1A_SPRITES&&window.createImageBitmap&&window.fetch)){ a1aLoadLayerImg(c,rec,k); return; }
    var done=false;
    try{
      fetch('act1-hifi/'+c[k]).then(function(r){ if(!r.ok) throw new Error('http'); return r.blob(); })
        .then(function(b){ return createImageBitmap(b,{premultiplyAlpha:'none',colorSpaceConversion:'none'}); })
        .then(function(bm){ done=true; a1aLayerLanded(c,rec,k,bm); })
        .catch(function(){ if(done||rec[k]) return; a1aLoadLayerImg(c,rec,k); });  // pend stays set
    }catch(e){ a1aLoadLayerImg(c,rec,k); }
  }
  // Every RESIDENT chunk of the window she is standing in, re-asked on the watchdog's tick. Reads
  // A1A.win (the ring a1aRects recorded) so it never fetches art the window does not need.
  function a1aRetryWindow(){
    var m=A1A.manifest, win=A1A.win; if(!m||!win||!win.length) return;
    for(var i=0;i<m.chunks.length;i++){ var c=m.chunks[i];
      if(win.indexOf(c.id)<0) continue;
      var rec=A1A.chunks[c.id]; if(!rec) continue;               // evicted: a1aChunkRec will re-create it
      a1aRetryLayers(c,rec);
    }
  }
  // Re-ask for any layer of a RESIDENT chunk that neither landed nor is in flight. Runs from
  // a1aChunkRec, i.e. once per window rebuild for exactly the chunks the window needs.
  function a1aRetryLayers(c,rec){
    var ld=a1aLd(rec), now=Date.now();
    for(var i=0;i<A1A_LAYERS.length;i++){ var k=A1A_LAYERS[i];
      if(!c[k]||rec[k]||ld.pend[k]) continue;                   // absent from the manifest, landed, or pending
      if((ld.fail[k]|0)>=A1A_LOAD_TRIES) continue;              // exhausted: stay quiet
      if(now<(ld.next[k]|0)) continue;                          // still backing off
      A1A.reloads=(A1A.reloads|0)+1;                            // surfaced in dq.cost() for the panel
      a1aLoadLayer(c,rec,k);
    }
  }
  function a1aChunkRec(c){
    var rec=A1A.chunks[c.id];
    if(!rec){ rec=A1A.chunks[c.id]={bm:{}};
      for(var li=0;li<A1A_LAYERS.length;li++){ var lk=A1A_LAYERS[li]; if(c[lk]) a1aLoadLayer(c,rec,lk); }
    } else a1aRetryLayers(c,rec);   // resident but incomplete -> ask again (see a1aRetryLayers)
    var i=A1A.lru.indexOf(c.id); if(i>=0) A1A.lru.splice(i,1); A1A.lru.push(c.id);
    return rec;
  }
  function a1aChunkAt(tx,ty){
    var m=A1A.manifest; if(!m) return null; var B=m.semanticBounds;
    if(tx<B[0]||tx>B[2]||ty<B[1]||ty>B[3]) return null;
    var px=(tx-B[0])*TILE/A1A.S, py=(ty-B[1])*TILE/A1A.S;
    for(var i=0;i<m.chunks.length;i++){ var c=m.chunks[i];
      if(px>=c.x&&px<c.x+c.width&&py>=c.y&&py<c.y+c.height) return c; }
    return null;
  }
  function a1aInBounds(tx,ty){ var m=A1A.manifest; if(!m) return false; var B=m.semanticBounds;
    return tx>=B[0]&&tx<=B[2]&&ty>=B[1]&&ty<=B[3]; }
  function a1aArtAt(tx,ty){                                      // baked art actually covers this cell RIGHT NOW
    var c=a1aChunkAt(tx,ty); if(!c) return false;
    var rec=A1A.chunks[c.id]; return !!(rec&&rec.base);
  }
  // ASK ONE WINDOW-STEP EARLY. The render window moves in MARGIN-cell steps, so the moment it
  // steps it needs chunks it has never asked for -- and a chunk asked for on the frame it is first
  // needed cannot answer that frame. a1aBlit then reports partial coverage and drawTerrain paints
  // the whole 3.85 M-px window by hand. Measured on this tree (2026-08-08, 960x720): that splat is
  // 934 ms, and it is SMOOTH-3's worst frame and SMOOTH-4's longest block.
  //
  // IT IS NOT A FETCH PROBLEM AND NOT A DECODE PROBLEM. Measured, same run, per chunk layer:
  // ResourceTiming responseEnd-startTime is 4-12 ms, and the first drawImage that forces the webp
  // decode is 0.0-0.1 ms. The recorded 988 ms src->onload is almost entirely the load event queued
  // BEHIND the splat's own per-pixel loop -- the splat is what makes the wait it exists to cover.
  // So the whole cost is scheduling: ask before the step and there is nothing to cover.
  //
  // A RING OF ONE MARGIN IS FREE. The window already straddles up to 9 chunks; padding it by
  // MARGIN on all four sides (a 68x62-cell rect against the window's 44x38) still straddles at
  // most 9 at THIS window size. "Raises peak residency by exactly zero" -- what this comment said
  // until 2026-08-08 -- is FALSE and was refuted twice. Live measurement put peak residency at
  // 4-6 chunks before and 9-10 after: the worst case is unchanged at 9, but the TYPICAL case
  // roughly doubles, because base only occasionally touched 9 while the ring holds it always.
  // (docs/SMOOTH-ROUND-4-REFUTATION.md.) The device A/B then measured NEW at about HALF OLD's
  // WebContent residency overall, so the ring is a net win -- but it is a win despite this cost,
  // not because the cost is zero. Say the true thing.
  // Ring size is also device-dependent, since winW/winH derive from cam.worldView and the shipped
  // bundle uses Scale.RESIZE (src/main.ts says NONE -- it is fiction here). At real devicePixelRatio
  // every iPhone and iPad lands at 9 -- but NOT by the mechanism this comment used to give.
  // It said "ZOOM multiplies by dpr and cancels the larger screen". Measured on real simulators
  // 2026-08-09: WorldMapScene's camera zoom is simply **1** (the bundle's fitScene explicitly
  // excludes WorldMapScene), so worldView equals the canvas CSS size and dpr never enters at all.
  // What absorbs device differences is the ceil() in winW/winH. iPhone 13 canvas 390x701pt and
  // iPhone 17 Pro 402x716pt both yield winW x winH = 33x39 and a 9-chunk ring. Right answer,
  // wrong reason -- and the reason was load-bearing enough that two rounds reasoned from it.
  // The one real exception found is iPad mini 8.3 in PORTRAIT: 744*2 = 1488 falls just under the
  // 768*2 threshold, ZOOM stays 1, and the ring reaches 12 -- over A1A_MAX_CHUNKS. That is not
  // thrash: the trim floor is Math.max(A1A_MAX_CHUNKS, keep.length), so the cap simply rises and
  // memory goes to roughly 228 MB instead of 190 MB. Earlier "12 on iPad, 16 on iPad Pro" figures
  // came from harnesses that left deviceScaleFactor at 1 and are wrong for real hardware.
  // Padding by 2*MARGIN would reach 16, which is why the ring is one step and not two:
  // one step is all that is needed anyway -- the hero crosses a window boundary about every 3.2 s
  // of walking, against a ~16 ms load.
  //
  // WHY IT ALSO SURVIVES A DOOR. A1A.win is what a1aReleaseChunks keeps when the player leaves the
  // overworld, and it is now the ring rather than the bare window. Before this, the trim on walking
  // into a town dropped exactly the chunks the walk back out stepped into a second later, so the
  // retention round 1 added was itself feeding the splat: the c2 column was requested at parse
  // time, evicted at the door, and re-requested 12 cells into the walk. Measured re-request, gone.
  // ============================================================
  //  THE RING IS THE RESIDENCY, AND IT WAS NEVER FREE
  // ============================================================
  //  ~~"A RING OF ONE MARGIN IS FREE. The window already straddles up to 9 chunks."~~ **Measured
  //  2026-08-13 and it is the padding that makes 9, not the window.** In the shipped runtime, seeded
  //  on the overworld: the window TOUCHES 6 chunks and 9 are resident. On the owner's iPhone 13 the
  //  panel reads `spr 4/4` -- his window touches FOUR -- while the same ring pins nine. At the
  //  measured ~49.3 MB a chunk (see A1A_MAX_CHUNKS) that is ~250 MB of speculation on the device
  //  that is being killed for its footprint, and his black box records exactly that ending:
  //  `gl lost at 443205ms, restored=1`, then the page killed outright.
  //
  //  WHY IT IS SAFE TO SHRINK, AND WHY THE OLD REASONING MISSED IT. `keep` in a1aRects is the RING,
  //  not the window, so the ring is what sets the trim floor -- lowering A1A_MAX_CHUNKS while the
  //  ring stays wide does nothing at all. And the lookahead the ring was added for is ALREADY paid
  //  for by the window itself: updateTerrain builds `winW = ceil(camera/TILE) + 2*MARGIN`, so the
  //  window carries 12 cells of off-screen border on each side before the ring adds a second 12.
  //  The window steps in MARGIN-cell units, so one step lands well inside a border the window
  //  already holds. The ring was padding a pad.
  //
  //  WHAT THE RING ACTUALLY BOUGHT, swept over the real chunk geometry across the whole plate on the
  //  12-cell window grid (192 window steps, iPhone 13's 33x39 window):
  //
  //                              chunks pinned          est. MB      steps that start a new load
  //      ring margin 12       mean 5.96, peak 9      mean 294, peak 444        48/192 = 25%
  //      ring margin 0        mean 3.58, peak 6      mean 176, peak 296        48/192 = 25%
  //
  //  **The stall rate is IDENTICAL.** The ring never reduced how OFTEN new loading is triggered --
  //  it cannot, because each chunk along a path is first touched exactly once either way. What it
  //  buys is starting that load one window-step (12 cells) EARLIER, so the decode overlaps the walk.
  //  It charges ~150 MB of peak residency for that head start, on a device whose black box reads
  //  `gl lost at 443205ms, restored=1` and then "page was killed outright". That is the wrong trade
  //  for this device, and the owner's stated priority is crashes before smoothness.
  //
  //  HONEST COST: entering genuinely new territory can now pop a chunk in slightly later than
  //  before, because the fetch starts when the window reaches it rather than a step ahead. If that
  //  becomes visible, this constant is the dial -- raising it back to 12 restores the old behaviour
  //  exactly, at the old price.
  //
  //  Kept as its own constant rather than folded into MARGIN because MARGIN is load-bearing for the
  //  terrain window AND the collision window, and the collision window's coverage rule is the freeze
  //  that took three rounds to find (78d9ba6). This number must be tunable without going near it.
  var A1A_RING_MARGIN=0;
  function a1aRingChunks(X0,Y0,winW,winH){
    var m=A1A.manifest; if(!m) return [];
    var B=m.semanticBounds, S=A1A.S, ox=B[0]*TILE, oy=B[1]*TILE, hit=[];
    var wx0=Math.max(0,X0-A1A_RING_MARGIN)*TILE, wy0=Math.max(0,Y0-A1A_RING_MARGIN)*TILE;
    var wx1=(X0+winW+A1A_RING_MARGIN)*TILE, wy1=(Y0+winH+A1A_RING_MARGIN)*TILE;
    for(var i=0;i<m.chunks.length;i++){ var c=m.chunks[i];
      var cx0=ox+c.x*S, cy0=oy+c.y*S, cx1=cx0+c.width*S, cy1=cy0+c.height*S;
      if(Math.min(wx1,cx1)<=Math.max(wx0,cx0)||Math.min(wy1,cy1)<=Math.max(wy0,cy0)) continue;
      hit.push(c);
    }
    return hit;
  }
  // the visible chunks and their src/dst rects, in WORLD pixels; .full = the window is wholly covered
  function a1aRects(X0,Y0,winW,winH){
    var m=A1A.manifest; if(!m) return null;
    var B=m.semanticBounds, S=A1A.S, ox=B[0]*TILE, oy=B[1]*TILE;
    // The ring FIRST, so the chunks the window actually shows are touched last and therefore sit
    // at the young end of the LRU. If the cap is ever exceeded the trim drops a speculative
    // neighbour, never a chunk being drawn this frame.
    var ring=a1aRingChunks(X0,Y0,winW,winH), ringIds=[], ri;
    for(ri=0;ri<ring.length;ri++){ a1aChunkRec(ring[ri]); ringIds.push(ring[ri].id); }
    var wx0=X0*TILE, wy0=Y0*TILE, wx1=wx0+winW*TILE, wy1=wy0+winH*TILE, out=[], cov=0, touched=[];
    for(var i=0;i<m.chunks.length;i++){ var c=m.chunks[i];
      var cx0=ox+c.x*S, cy0=oy+c.y*S, cx1=cx0+c.width*S, cy1=cy0+c.height*S;
      var ix0=Math.max(wx0,cx0), iy0=Math.max(wy0,cy0), ix1=Math.min(wx1,cx1), iy1=Math.min(wy1,cy1);
      if(ix1<=ix0||iy1<=iy0) continue;
      touched.push(c.id);                                         // TOUCHED by a1aChunkRec -> must survive the trim
      var rec=a1aChunkRec(c); if(!rec.base) continue;             // still loading -> this window is partial
      out.push({c:c,rec:rec,sx:ix0-cx0,sy:iy0-cy0,w:ix1-ix0,h:iy1-iy0,dx:ix0-wx0,dy:iy0-wy0});
      cov+=(ix1-ix0)*(iy1-iy0);
    }
    // The window this call describes, for a1aReleaseChunks to keep when the player leaves. Recorded
    // for every window build, so it always names the window she is standing in when she walks into a
    // door -- and a door round trip returns her to the adjacent cell, which windowStart snaps to the
    // same 12-cell window and which is in any case far inside these 32-cell-wide chunks.
    // The RING, not the bare window: the step she takes on the way back out is already paid for.
    var keep=ringIds.length?ringIds:touched;
    A1A.win=keep;
    // trim against what this window TOUCHED, not what it managed to load -- a chunk mid-load counts
    while(A1A.lru.length>Math.max(A1A_MAX_CHUNKS,keep.length)){ var _ev=A1A.lru.shift(); delete A1A.chunks[_ev]; a1aDropChunkGpu(_ev); }
    out.full=(cov===winW*TILE*winH*TILE);
    // How many chunks this window INTERSECTS, regardless of whether their art has decoded. The
    // watchdog needs this and not out.length: if the failure is that the images never come back,
    // every rect is filtered out above and a count taken from `out` would read 0/0 and look healthy.
    out.touched=touched.length;
    return out;
  }
  // one layer of one chunk. k folds in the layer's own density: base/canopy ship at 48 px/cell so
  // k===1 and the copy is 1:1; water is still the 16 px/cell glint sheet, so k===1/S and it scales.
  function a1aDrawLayer(ctx,im,r,dx,dy){
    var k=im.width/(r.c.width*A1A.S);
    ctx.drawImage(im, r.sx*k, r.sy*k, r.w*k, r.h*k,
                  dx===undefined?r.dx:dx, dy===undefined?r.dy:dy, r.w, r.h);
  }
  function a1aBlit(ctx,X0,Y0,winW,winH,needFull){
    var rs=a1aRects(X0,Y0,winW,winH);
    A1A.lastRects=rs||[]; A1A.lastFull=!!(rs&&rs.full);
    if(!rs||!rs.length) return false;
    // SPRITE MODE: the chunks are their own textures, so there is nothing to composite here. The
    // call is still made, and a1aRects still runs, because that is what maintains the ring
    // prefetch and the LRU -- see a1aPlaceSprites, which consumes exactly this rect set.
    if(a1aSpriteMode()) return rs.full;
    if(needFull&&!rs.full) return false;
    ctx.save(); ctx.imageSmoothingEnabled=false;
    if(needFull) ctx.clearRect(0,0,winW*TILE,winH*TILE);
    for(var i=0;i<rs.length;i++) a1aDrawLayer(ctx,rs[i].rec.base,rs[i]);
    ctx.globalCompositeOperation='screen'; ctx.globalAlpha=0.28;  // water: the sparse glint sheet, as runtime.html blends it
    for(var w=0;w<rs.length;w++){ if(rs[w].rec.water) a1aDrawLayer(ctx,rs[w].rec.water,rs[w]); }
    ctx.restore();
    return rs.full;
  }
  // The canopy window: each chunk's crowns cut out of the base it already holds.
  //
  // `destination-in` is a WHOLE-CANVAS operator, not a rect operator -- it clears everything the
  // newly drawn image does not cover, however far away. So masking all the chunks on one surface
  // does NOT work: each mask erases the previous chunk's canopy and only the last one survives (and
  // if that last chunk's mask happens to be empty -- six of the thirty are -- the entire layer goes
  // blank). Identical dst rects are necessary but nowhere near sufficient. Composite ONE chunk at a
  // time on a scratch surface and blit the result, which is what runtime.html's canopyFor() does.
  var a1aScratch=null;
  function a1aScratchCtx(w,h){
    if(!a1aScratch) a1aScratch=document.createElement('canvas');
    if(a1aScratch.width<w) a1aScratch.width=w;
    if(a1aScratch.height<h) a1aScratch.height=h;
    return a1aScratch.getContext ? a1aScratch.getContext('2d') : null;
  }
  function a1aCanopy(ctx,X0,Y0,winW,winH){
    var rs=a1aRects(X0,Y0,winW,winH), drew=false;
    if(!rs||!rs.length) return false;
    ctx.clearRect(0,0,winW*TILE,winH*TILE);
    ctx.save(); ctx.imageSmoothingEnabled=false;
    for(var i=0;i<rs.length;i++){ var r=rs[i]; if(!r.rec.canopy) continue;
      var sc=a1aScratchCtx(r.w,r.h); if(!sc) continue;
      sc.save(); sc.imageSmoothingEnabled=false;
      sc.globalCompositeOperation='source-over';
      sc.clearRect(0,0,r.w,r.h);
      a1aDrawLayer(sc,r.rec.base,r,0,0);
      sc.globalCompositeOperation='destination-in';   // scoped to THIS chunk's surface
      a1aDrawLayer(sc,r.rec.canopy,r,0,0);
      sc.restore();
      ctx.drawImage(a1aScratch, 0,0,r.w,r.h, r.dx,r.dy,r.w,r.h);
      drew=true;
    }
    ctx.restore();
    return drew;
  }

  // ============================================================
  //  ACT 1 PLATE AS SPRITES — the baked chunks stop going through a canvas
  // ============================================================
  //  WHY. Measured 2026-08-08 (docs/SMOOTH-ROUND-5-DIAGNOSIS.md): touching the live
  //  2112x1824 window canvas costs a FIXED 65-100 ms once per window step, and that cost does not
  //  scale with how much is drawn -- a single 48x48 drawImage costs the same as repainting the
  //  whole window, while drawing nothing at all costs 18 ms. It is not the pixels, not the water
  //  blend, not the canopy, and not the upload (disabling both refreshes leaves the frame at
  //  118 ms). It is the penalty for dirtying a large accelerated canvas that the renderer is
  //  sampling every frame. So every strategy that repaints LESS of that canvas -- ring buffer,
  //  blit-shift, strip repaint, partial texSubImage2D -- was refuted before it was written.
  //
  //  The plate is 30 baked chunks on a 5x6 grid. Handing each one to the GPU as its own texture
  //  and letting the CAMERA move instead of the pixels removes the per-step work entirely rather
  //  than making it smaller or moving it earlier: a chunk uploads once when it decodes, and
  //  scrolling over an uploaded chunk costs 0.0 ms (measured in the live scene).
  //
  //  WHAT IS PIXEL-FOR-PIXEL THE SAME, AND WHY.
  //   - base: a1aDrawLayer copies it 1:1 (k===1) into a canvas positioned at (X0*TILE, Y0*TILE),
  //     so the chunk's pixel (0,0) already lands at world (ox + c.x*S, oy + c.y*S). An Image with
  //     origin (0,0) at that same world point, scale 1, NEAREST, is the same texels unresampled.
  //   - water: the 16 px/cell glint sheet, upscaled 3x nearest and composited `screen` at
  //     globalAlpha 0.28. Canvas 2D `screen` over an opaque backdrop is Cb + A*as*Cs*(1-Cb);
  //     Phaser's BlendModes.SCREEN is gl.blendFunc(ONE, ONE_MINUS_SRC_COLOR) over a premultiplied
  //     texture tinted by the Image's alpha, i.e. A*as*Cs + (1 - A*as*Cs)*Cb -- the same
  //     expression, not an approximation of it. (blendModes[3].func verified in the shipped
  //     bundle.) So the sheet becomes an Image at scale S, alpha 0.28, blend SCREEN.
  //   - canopy: an alpha-only mask, values {0,242}, whose RGB is NOT the base's -- checked on
  //     three chunks -- so `destination-in` is genuinely required and the canopy cannot simply be
  //     drawn. It is composited ONCE per chunk on the scratch surface, exactly as a1aCanopy does
  //     it per window, and the result becomes that chunk's canopy texture.
  //
  //  WHAT STAYS. dqterrain/dqcanopy are NOT retired: the Act 1 plate is 148x182 cells inside a
  //  320x400 world, and everything outside it is still painted analytically into dqterrain. The
  //  canvas is simply hidden while the window is wholly inside the plate, which is the only case
  //  where it carried nothing but baked art anyway.
  var A1A_SPRITES=true;
  function a1aSpriteMode(){ return A1A_SPRITES && !!A1A.manifest; }
  // Drop OUR reference to a chunk's canopy composite, so the next build re-composites from
  // rec.base + rec.canopy instead of re-uploading a bitmap that may already have been consumed.
  //
  // IT DOES NOT AND MUST NOT close() IT. Measured in the shipped runtime 2026-08-13, not reasoned:
  //     textures.addImage(key, bm); textures.get(key).source[0].image === bm   -> TRUE
  //     bm.close();                 textures.get(key).source[0].image.width    -> 0
  // Phaser's TextureSource holds the SAME ImageBitmap object we do, so there is no second copy here
  // to reclaim -- an earlier draft of this change claimed ~9.44 MB per chunk of freeable duplicate
  // and went looking for ~94 MB that does not exist. What close() would actually buy is leaving
  // Phaser holding a zero-width corpse, and any later re-upload from that source -- its own
  // context-restore path, for one -- draws nothing. That is the blank layer this whole net exists to
  // prevent, so the optimisation would have caused the bug it was meant to help. The pixels come
  // back when the TEXTURE goes, via textures.remove in a1aDropChunkGpu / a1aDropLayerGpu / a1aTexFor.
  function a1aFreeComposite(rec){
    if(rec&&rec.bm) rec.bm={};
  }
  // one texture per chunk layer, built once and thereafter only positioned
  function a1aTexFor(scene,c,rec,layer){
    var key='a1a_'+layer+'_'+c.id, T=A1A.tex[key];
    if(T===1) return key;                              // already built
    if(T===0) return null;                             // known-unbuildable (source missing)
    COST.tex++;                                        // a chunk layer is about to reach the GPU; see COST
    if(layer==='canopy'){
      if(!rec.base||!rec.canopy){ return null; }
      // base coloured by the canopy's alpha, on the scratch surface a1aCanopy already uses.
      // destination-in is a WHOLE-CANVAS operator, which is why this is one chunk per surface.
      if(rec.bm&&rec.bm.canopyComposite){
        if(scene.textures.exists(key)) scene.textures.remove(key);
        costTime('addBmp:canopy',function(){ scene.textures.addImage(key,rec.bm.canopyComposite); });
        try{ scene.textures.get(key).setFilter(NEAREST); }catch(e){}
        A1A.tex[key]=1; return key;
      }
      var cv=costTime('cvcanvas',function(){ return a1aCanopyCanvas(rec); }); if(!cv){ A1A.tex[key]=0; return null; }
      if(scene.textures.exists(key)) scene.textures.remove(key);
      var ct=costTime('addCanvas',function(){ var t=scene.textures.addCanvas(key,cv); if(t&&t.refresh) t.refresh(); return t; });
      try{ ct.setFilter(NEAREST); }catch(e){}
      A1A.tex[key]=1; return key;
    }
    var im=rec[layer]; if(!im) return null;
    if(scene.textures.exists(key)) scene.textures.remove(key);
    costTime('addImg:'+layer,function(){ scene.textures.addImage(key,im); });
    try{ scene.textures.get(key).setFilter(NEAREST); }catch(e){}
    A1A.tex[key]=1; return key;
  }
  // Everything this chunk owns on the GPU, dropped together. Called from the same two places that
  // drop the decoded images, so a texture can never outlive the chunk record that named it.
  function a1aDropChunkGpu(id){
    var sc=A1A.spriteScene;
    ['base','water','canopy'].forEach(function(layer){
      var key='a1a_'+layer+'_'+id, im=A1A.imgs[key];
      if(im){ try{ im.destroy(); }catch(e){} delete A1A.imgs[key]; }
      if(A1A.tex[key]!==undefined){
        if(sc&&sc.textures&&sc.textures.exists(key)){ try{ sc.textures.remove(key); }catch(e){} }
        delete A1A.tex[key];
      }
    });
  }
  function a1aDropAllGpu(){ var ids={}; Object.keys(A1A.tex).concat(Object.keys(A1A.imgs)).forEach(function(k){
      var p=k.split('_'); ids[k.slice(p[0].length+p[1].length+2)]=1; });
    Object.keys(ids).forEach(a1aDropChunkGpu); }
  // ONE layer, every chunk. The decoded source images and the canopy composites are KEPT, so this
  // frees GPU residency without costing a re-fetch, a re-decode or a re-composite -- coming back is
  // addImage from a bitmap we still hold. See the battle branch in tick() for why.
  function a1aDropLayerGpu(layer){
    var sc=A1A.spriteScene, pre='a1a_'+layer+'_';
    Object.keys(A1A.tex).forEach(function(key){
      if(key.indexOf(pre)!==0) return;
      var im=A1A.imgs[key];
      if(im){ try{ im.destroy(); }catch(e){} delete A1A.imgs[key]; }
      if(sc&&sc.textures&&sc.textures.exists(key)){ try{ sc.textures.remove(key); }catch(e){} }
      delete A1A.tex[key];
    });
  }
  // ============================================================
  //  THE GPU CONTEXT CAME BACK AND OUR BOOKKEEPING DID NOT KNOW
  // ============================================================
  //  Owner, device, build 17: "After exiting a battle, the overworld got stuck on a blue screen and
  //  stays that way. Getting in and out of battles or towns did not change it." His black-box panel
  //  names the cause outright -- `gl lost at 1471218ms, restored=1`, `scenes BattleScene`. The
  //  WebGL context was lost during an encounter and restored, but every texture we had uploaded
  //  died with it while `A1A.tex[key]` still said 1. a1aTexHave therefore kept answering "already on
  //  the GPU", a1aPlaceSprites kept placing sprites on dead textures, and nothing ever rebuilt --
  //  so what the player saw was the flat sea backdrop, for good. The blue IS the sea; before the
  //  locked-art change the same failure would have shown as black.
  //
  //  Recovery has to throw away the bookkeeping, not the sources: the decoded chunk images and the
  //  canopy composites are ordinary JS objects and survived the context loss untouched. Clearing
  //  rec.bm as well is deliberate -- a composite handed over with transferToImageBitmap can have
  //  been consumed, and re-making one is far cheaper than a permanently blank layer.
  // ============================================================
  //  THE TERRAIN MUST NOTICE THAT IT IS MISSING
  // ============================================================
  //  The blue screen has now been reported on build 17 AND on build 18, i.e. it survived the
  //  webglcontextrestored handler that was written for it. Two diagnoses of this same symptom have
  //  already been wrong -- the a1vShow visibility latch, then GPU-context bookkeeping -- and both
  //  were wrong the same way: reasoned from the code without ever reproducing it, on a device whose
  //  memory pressure this Mac does not have.
  //
  //  So this does not try to name the cause a third time. It states the INVARIANT instead: on the
  //  Act 1 plate, every chunk whose base image has decoded should have a visible sprite. If that is
  //  false for longer than the drain could possibly justify, something upstream broke, and the
  //  renderer rebuilds itself from scratch rather than sitting on a blue screen the player cannot
  //  escape. Whatever the cause, the failure mode stops being permanent.
  //
  //  1500 ms before acting: the drain builds one texture per 80 ms tick, so a full nine-chunk
  //  window legitimately takes ~720 ms after a battle. 5 s between attempts, and a hard cap of 8 per
  //  session, so a genuinely dead GPU degrades to "tried and gave up" instead of thrashing forever.
  //  The counters are published for the panel: `spr live/want fix N` is what will finally say which
  //  stage fails on his phone -- want 0 means the window never asked, live 0 with want 9 means the
  //  textures went away, and a rising fix count means this net is the only reason he can play.
  //
  //  IT MUST NOT CURE THE BLUE SCREEN BY CAUSING THE CRASH -- added 2026-08-13.
  //  Build 19 shipped the net above and the owner's verdict was that it WORKS and that the game now
  //  does something worse: *"a little better and the blue screen recovered a couple times but when i
  //  travelled more the game went in loading again"*. "Loading again" cannot be the boot cover --
  //  finish() removes it from the DOM once lifted, so it cannot return -- so the app RELOADED, i.e.
  //  WebContent was killed. The prime suspect is this heal's own cost: it dropped A1A.chunks
  //  wholesale, so all ten slots re-fetched and re-decoded at once (~200 MB of decoded image in one
  //  burst, per the measured per-chunk figures at A1A_MAX_CHUNKS) on a device already under enough
  //  pressure to lose a GL context. Curing a blue screen by provoking a kill is not a cure.
  //
  //  So the heal is GRADUATED, and the cheap pass is the one that matches the known cause. A lost GL
  //  context destroys TEXTURES; the decoded chunk images are ordinary JS objects and are untouched.
  //  Pass 1 therefore rebuilds only the GPU side and re-uploads from images we still hold -- no
  //  fetch, no decode, no allocation spike. Only if that is WATCHED to fail does pass 2 drop the
  //  records too, which is the right answer for the other failure this net covers (a chunk whose
  //  load failed and is never asked for again) and is worth its cost only once the cheap
  //  explanation is out.
  //
  //  ============================================================
  //  IT WAS BLIND TO THE FAILURE IT WAS BUILT FOR, AND IT ATTACKED THE ONE IT WASN'T
  //  ============================================================
  //  Both halves measured in the shipped runtime 2026-08-13, after the owner reported build 20 as
  //  *"still getting the blue screen. reload happens as well. interestingly when the reload happens
  //  the blue screen resolves"*. That last clause is what cracked it: a reload resets THIS state.
  //
  //  BLIND HALF. Take a healthy overworld (`spr 6/6`), lose the GL context for real
  //  (`WEBGL_lose_context.loseContext()`, `gl.isContextLost() === true`), pump 600 frames -- ten
  //  seconds of game time, far past the 1500 ms grace. The watchdog still reads **6/6 and never
  //  fires**, over a dead canvas. Of course it does: a lost context destroys the GPU objects, but
  //  `A1A.tex[key]` is OUR bookkeeping and still says 1, and the sprite is still a live JS object
  //  with `.visible === true`. Every dead texture counts as live. **The one failure this net was
  //  written for is the one it cannot see.**
  //
  //  HARMFUL HALF. What it DOES fire on is a drain that has not finished yet -- and its remedy
  //  destroys every sprite and every texture, which makes an unfinished drain slower, which drops
  //  `live` further, which fires it again. Measured, same session, on a frame-starved renderer:
  //  `live` fell 4/6 -> 2/6 while `fix` climbed to the cap of 8, and **`COST.tex` rose 14 -> 34
  //  across those same heals**. Twenty textures were being built successfully while this function
  //  was declaring the renderer broken and throwing them away. Then it hit A1AW_MAX and gave up,
  //  leaving a permanent blue screen -- which is exactly what a reload cures, by resetting `fixes`
  //  to 0 and letting the drain run from clean.
  //
  //  So: PROGRESS IS THE VETO. If the renderer built a texture since the last look, it is working
  //  and does not need help, however far behind it is. That single test would have prevented every
  //  one of the eight heals above. And a lost context is now READ from the GL context itself rather
  //  than inferred from bookkeeping that cannot know -- healing is pointless while it is lost (there
  //  is nothing to upload to), and the restore event is what drives recovery. That path is proven:
  //  a real loseContext/restoreContext cycle fires our handler, drops `live` to 1, and rebuilds to
  //  6/6 without the watchdog firing at all.
  var A1AW={ shortSince:0, lastFix:0, fixes:0, deep:0, shallowFailed:false, lastTex:-1, glLost:false };
  var A1AW_GRACE=1500, A1AW_COOLDOWN=5000, A1AW_MAX=8;
  // Authoritative, not inferred. Cheap: the context object is cached by the browser, and this reads
  // one boolean. Returns false when there is no canvas/context yet, so boot is never called "lost".
  function a1aGlLost(){
    try{
      var c=(typeof document!=='undefined')&&document.querySelector('canvas');
      if(!c) return false;
      var gl=c.getContext('webgl2')||c.getContext('webgl');
      return !!(gl&&gl.isContextLost&&gl.isContextLost());
    }catch(e){ return false; }
  }
  /* ---- THE BLUE FRAME IS NEVER SHOWN, IT IS COVERED -------------------------------------------
     OWNER, build 67: "blue screen bug still happens. there needs to be a definitive checker that
     does not allow this, even if the loading spinner is shown for longer."

     a1aSpriteWatchdog below already DETECTS the condition exactly -- `live < want`, where want is
     what the camera window touches and live is what actually decoded -- and it recovers by
     re-requesting the art. Recovery is not what he is asking for. Between the failure and the
     recovery the camera has nothing to draw but its own background, and that background is the blue
     the player sees. So this takes the same signal the watchdog computes and puts a veil over the
     frame until the art it needs is present.

     It is a COVER, not a pause: the scene keeps running underneath, the retry keeps retrying, and
     the veil lifts on the first tick where the window is whole. That is the trade he asked for --
     a longer spinner instead of a blue map -- and it cannot itself hang the game, because it is
     driven by the same per-tick measurement rather than by a timer or a promise that might never
     settle.

     Deliberately NOT gated on a grace period. A blue frame for 200 ms is still a blue frame, and a
     veil that only appears after a delay would show exactly the flash it exists to hide. */
  var _a1aVeil=null;
  function a1aVeilEl(){
    if(_a1aVeil && _a1aVeil.isConnected) return _a1aVeil;
    var d=document.createElement('div');
    d.id='a1a-loading-veil';
    d.setAttribute('aria-live','polite');
    d.style.cssText='position:fixed;inset:0;z-index:60;display:none;place-items:center;'
      +'background:linear-gradient(145deg,#101c27,#071018 58%,#040911);color:#9fb6c6;'
      +'font:13px/1.4 ui-sans-serif,system-ui,-apple-system,"Segoe UI",Roboto,sans-serif;'
      +'letter-spacing:.04em;';
    d.innerHTML='<div style="display:grid;gap:12px;justify-items:center;">'
      +'<div style="width:34px;height:34px;border-radius:50%;border:3px solid #2a3a49;'
      +'border-top-color:#8b7340;animation:a1aspin 900ms linear infinite;"></div>'
      +'<div id="a1a-veil-text">Loading the world...</div></div>';
    var st=document.createElement('style');
    st.textContent='@keyframes a1aspin{to{transform:rotate(360deg)}}';
    d.appendChild(st);
    document.body.appendChild(d);
    _a1aVeil=d; return d;
  }
  function a1aVeilSet(on){
    var d=a1aVeilEl();
    var want=on?'grid':'none';
    if(d.style.display!==want) d.style.display=want;
  }

  function a1aSpriteWatchdog(scene){
    if(!a1aPlateOwns(scene)||!a1aSpriteMode()){ A1AW.shortSince=0; a1aVeilSet(false); return; }
    var rs=A1A.lastRects;
    // No rects yet means the window has not been measured -- the map cannot be drawn, so hold.
    if(!rs){ A1AW.shortSince=0; A1A.sprLive=0; A1A.sprWant=0; a1aVeilSet(true); return; }
    // WANT is what the window TOUCHES, not what managed to decode. Counting only decoded chunks
    // would read 0/0 -- perfectly healthy -- in exactly the case where the art stopped coming back,
    // which is the failure this net exists to catch.
    var want=rs.touched|0, live=0, i;
    if(!want){ A1AW.shortSince=0; A1A.sprLive=0; A1A.sprWant=0; a1aVeilSet(false); return; }
    for(i=0;i<rs.length;i++){
      var r=rs[i]; if(!r||!r.rec||!r.rec.base) continue;
      var key='a1a_base_'+r.c.id, im=A1A.imgs[key];
      if(A1A.tex[key]===1 && im && im.scene && im.visible) live++;
    }
    A1A.sprLive=live; A1A.sprWant=want;
    // THE GATE. Whole window -> show the map; anything missing -> keep the veil up. Same numbers
    // the recovery below acts on, so the two can never disagree about whether the map is ready.
    a1aVeilSet(live<want);
    // RE-ASK FOR MISSING ART ON A TIMER, NOT ONLY ON MOVEMENT. The terrain path that calls a1aRects
    // is gated on the window CHANGING (`key===terrainState.lastWin` -> return), so a layer that
    // failed while she stands still would not be re-requested until she walked across a window
    // boundary. The owner's report is "the map stops loading and stays blue" -- recovery must not
    // depend on him moving. This sweep is the same bounded retry a1aChunkRec performs, driven by this
    // watchdog's own tick, and it runs BEFORE the veto below: re-fetching art that never arrived is
    // not the destructive heal the veto exists to suppress.
    a1aRetryWindow();
    var now=Date.now();
    // HEALTHY is also what clears the escalation. A cheap pass that restored the sprites must not
    // leave the next, unrelated incident starting at pass 2 -- the whole point is that the expensive
    // pass fires only when the cheap one has just been SEEN to fail.
    if(live>=want){ A1AW.shortSince=0; A1AW.shallowFailed=false; A1AW.lastTex=COST.tex; return; }
    // THE PROGRESS VETO. A renderer that built a texture since the last look is working, and the
    // only thing this function can do to it is take that work away. Being far behind is not the
    // same as being broken, and telling them apart is the whole difference between a net and a
    // wrecking ball -- see the memo above, where 20 successful builds were destroyed by 8 heals.
    if(COST.tex!==A1AW.lastTex){ A1AW.lastTex=COST.tex; A1AW.shortSince=0; return; }
    // A lost context cannot be healed: there is nothing to upload to, and every rebuild would be
    // thrown away. Recovery is the restore event's job. Published so his panel can say which of the
    // two failures he is looking at, which no counter here could previously distinguish.
    A1AW.glLost=a1aGlLost();
    if(A1AW.glLost){ A1AW.shortSince=0; return; }
    if(!A1AW.shortSince){ A1AW.shortSince=now; return; }
    if(now-A1AW.shortSince<A1AW_GRACE) return;
    if(now-A1AW.lastFix<A1AW_COOLDOWN) return;
    if(A1AW.fixes>=A1AW_MAX) return;
    // Here with sprites still short after a full cooldown. If the last attempt was the cheap one it
    // did not work, so escalate exactly once; otherwise start cheap.
    var deep=A1AW.shallowFailed;
    A1AW.lastFix=now; A1AW.shortSince=0; A1AW.fixes++;
    A1AW.shallowFailed=!deep;
    if(deep) A1AW.deep++;
    a1aGpuInvalidate(deep);
  }
  // `deep` is the escalation described above, and it is OFF by default on purpose: the
  // webglcontextrestored handler below is the one caller that knows its cause exactly, and a
  // restored context is precisely the case where the images are fine and only the GPU side died.
  function a1aGpuInvalidate(deep){
    A1A.tex={};
    Object.keys(A1A.imgs).forEach(function(k){ var im=A1A.imgs[k]; if(im){ try{ im.destroy(); }catch(e){} } });
    A1A.imgs={}; A1A.texQ=[]; A1A.texQd={}; A1A.bmPend={};
    if(deep){
      // The chunk RECORDS go too, not just their GPU side. A record holds the decoded images and the
      // pending-load flags, so keeping it means a chunk whose image load failed or was evicted is
      // never asked for again -- and "the art stopped coming back" is precisely the state this
      // recovers from. Dropping them makes a1aRects re-request from scratch; the files are in the
      // HTTP cache, so it costs a decode rather than a download -- but ten decodes at once is the
      // ~200 MB burst this pass is now rationed for.
      A1A.chunks={}; A1A.lru=[]; A1A.win=[];
    }else{
      // Pass 1 keeps every decoded image and re-uploads from it. What it must NOT keep is the canopy
      // COMPOSITE: it is handed over with transferToImageBitmap, which detaches the source canvas, so
      // a retained one can be a corpse that uploads as nothing -- a permanently blank canopy layer,
      // which is the failure this net exists to end. Re-compositing costs one 1536x1536 draw pair per
      // chunk, spread one chunk per drain tick, and no allocation the pass does not hand straight back.
      Object.keys(A1A.chunks).forEach(function(id){ a1aFreeComposite(A1A.chunks[id]); });
    }
    if(terrainState) terrainState.lastWin='';
    if(overlayState) overlayState.lastKey='';
    A1A.dirty=true; A1A.drew=false;
  }
  // Armed on the canvas as soon as one exists, with the same bounded rAF loop index.html's black box
  // uses for its own listener. Passive: no preventDefault, so Phaser's handling is unchanged.
  (function a1aArmGpuWatch(deadline){
    if(!deadline) deadline=Date.now()+60000;
    var c=(typeof document!=='undefined')&&document.querySelector('canvas');
    if(c){
      c.addEventListener('webglcontextrestored',function(){
        try{ a1aGpuInvalidate(); }catch(e){ if(window.__DQ_DEBUG__) console.log('dq gpu restore '+e); }
      },false);
      return;
    }
    if(Date.now()>deadline) return;
    if(typeof requestAnimationFrame==='function') requestAnimationFrame(function(){ a1aArmGpuWatch(deadline); });
  })();
  // WHY THE TEXTURES ARE BUILT AHEAD OF THE STEP, NOT AT IT.
  //
  // Phaser's TextureSource uploads to the GPU inside addImage/addCanvas, not lazily at first
  // render. Building a chunk's texture the first time it becomes VISIBLE therefore puts the whole
  // upload on the window step that revealed it -- measured 2026-08-08, six uploads landing
  // together on one step frame cost 165-174 ms, i.e. worse than the canvas repaint this design
  // replaces. That is the "moved, not removed" failure the goal contract bans, and it is the
  // reason this queue exists rather than being an optimisation on top.
  //
  // Layers are queued as they decode -- which is already one window-step early, because round 4's
  // ring asks for the chunks one step out -- and drained at most ONE per reskin tick (12.5 Hz).
  // A ring step needs about six textures, so the ring warms in roughly half a second against the
  // ~3 s the hero takes to cross a 12-cell window. a1aPlaceSprites still builds on demand if the
  // queue has not reached a chunk in time: a late frame is recoverable, a hole in the terrain is
  // not.
  // base coloured by the canopy's alpha. destination-in is a WHOLE-CANVAS operator, which is why
  // this is one chunk per surface -- exactly the reason a1aCanopy composites chunk by chunk.
  // OffscreenCanvas, not a DOM canvas, and transferToImageBitmap rather than createImageBitmap.
  // transferToImageBitmap hands the backing store straight over; createImageBitmap has to flush
  // and COPY a 1536x1536 surface, which measured 60-137 ms on the main thread -- the whole of the
  // residual hitch this design was meant to remove. Sources are the already-decoded ImageBitmaps
  // where available, for the same reason.
  function a1aCanopyCanvas(rec){
    if(!rec.base||!rec.canopy) return null;
    var w=rec.base.width, h=rec.base.height;
    var cv=(typeof OffscreenCanvas!=='undefined')?new OffscreenCanvas(w,h):document.createElement('canvas');
    // Was: `cv instanceof (OffscreenCanvas ?? Object)`. When OffscreenCanvas is absent that reduces
    // to `canvas instanceof Object`, which is ALWAYS true, so the sizing below never ran and the
    // canopy surface stayed at the DOM default 300x150 instead of 1536x1536 -- 1.9% of a chunk,
    // i.e. wrong pixels rather than a slow path. Unreachable since the iOS floor moved to 16.4
    // (OffscreenCanvas ships from Safari 16.2), but fixed so it cannot return if that floor drops.
    if(!(typeof OffscreenCanvas!=='undefined' && cv instanceof OffscreenCanvas)){ cv.width=w; cv.height=h; }
    var sc=cv.getContext('2d'); if(!sc) return null;
    sc.imageSmoothingEnabled=false;
    sc.globalCompositeOperation='source-over'; sc.drawImage(rec.base,0,0);
    sc.globalCompositeOperation='destination-in'; sc.drawImage(rec.canopy,0,0,w,h);
    return cv;
  }
  // Composite the canopy ahead of need and hand the result to the GPU as an ImageBitmap, for the
  // same reason the base layers are: addCanvas of a 1536x1536 surface costs tens of milliseconds
  // on the main thread, addImage of a bitmap costs ~2 ms.
  function a1aCanopyPrepare(c,rec){
    var key='a1a_canopy_'+c.id;
    if(A1A.tex[key]||A1A.bmPend[key]) return;
    if(!rec.base||!rec.canopy||!window.createImageBitmap) return;
    if(rec.bm&&rec.bm.canopyComposite) return;
    var cv=costTime('prep:canvas',function(){ return a1aCanopyCanvas(rec); }); if(!cv) return;
    COST.canopy++;                                   // one 1536x1536 composite; see COST
    if(cv.transferToImageBitmap){ try{ rec.bm.canopyComposite=costTime('prep:transfer',function(){ return cv.transferToImageBitmap(); }); return; }catch(e){} }
    A1A.bmPend[key]=1;
    try{
      createImageBitmap(cv,{premultiplyAlpha:'none',colorSpaceConversion:'none'})
        .then(function(bm){ rec.bm.canopyComposite=bm; delete A1A.bmPend[key]; })
        .catch(function(){ delete A1A.bmPend[key]; });
    }catch(e){ delete A1A.bmPend[key]; }
  }
  function a1aEnqueueTex(c,rec){
    if(!A1A_SPRITES) return;
    ['base','water','canopy'].forEach(function(layer){
      if(!rec[layer]) return;
      if(layer==='canopy'&&!rec.base) return;                     // the composite needs both
      var key='a1a_'+layer+'_'+c.id;
      if(A1A.tex[key]||A1A.texQd[key]) return;
      A1A.texQd[key]=1; A1A.texQ.push({c:c,layer:layer});
    });
  }
  // Already on the GPU? Answers WITHOUT building, which is the whole point -- see a1aPlaceSprites.
  function a1aTexHave(c,layer){ var key='a1a_'+layer+'_'+c.id; return A1A.tex[key]===1?key:null; }
  // BASE FIRST, across chunks. The queue is otherwise FIFO, so one chunk's canopy could be built
  // ahead of the next chunk's base and the ground would arrive last -- the one layer the player is
  // actually standing on, and the one the flat sea is standing in for until it lands.
  function a1aTakeTexJob(){
    for(var i=0;i<A1A.texQ.length;i++) if(A1A.texQ[i].layer==='base') return A1A.texQ.splice(i,1)[0];
    return A1A.texQ.shift();
  }
  function a1aDrainTex(scene,n){
    if(!a1aSpriteMode()) return;
    A1A.spriteScene=scene;
    var did=0, guard=0;
    while(A1A.texQ.length && did<n && guard++<12){
      var j=a1aTakeTexJob(), key='a1a_'+j.layer+'_'+j.c.id;
      delete A1A.texQd[key];
      var rec=A1A.chunks[j.c.id];
      if(!rec||A1A.tex[key]) continue;                            // evicted, or already built on demand
      if(j.layer==='canopy'&&!(rec.bm&&rec.bm.canopyComposite)){
        a1aCanopyPrepare(j.c,rec);                                // async; re-queue so the drain picks it up once ready
        A1A.texQd[key]=1; A1A.texQ.push(j); did++; continue;
      }
      if(a1aTexFor(scene,j.c,rec,j.layer)) did++;
    }
  }
  function a1aHideSprites(){ Object.keys(A1A.imgs).forEach(function(k){
      var im=A1A.imgs[k]; if(im){ try{ im.setVisible(false); }catch(e){} } }); }
  // Place (or hide) one Image per visible chunk layer. `rs` is a1aRects' output, so the chunk set,
  // the LRU touch and the ring prefetch are all exactly what the canvas path used.
  function a1aPlaceSprites(scene,rs){
    A1A.spriteScene=scene;
    var m=A1A.manifest, B=m.semanticBounds, S=A1A.S, ox=B[0]*TILE, oy=B[1]*TILE;
    var live={}, anyCanopy=false, i;
    for(i=0;i<rs.length;i++){
      var r=rs[i], c=r.c, rec=r.rec;
      var wx=ox+c.x*S, wy=oy+c.y*S;
      // THE HERO IS NEVER HIDDEN BY THE TREELINE -- canopy 11 -> 9.5, below the hero at 10.
      // Owner, build 32, with a screenshot in which she is a single visible sliver inside the
      // forest: "the player hides under the forrest (they should be on top of the forrest) some
      // times so this needs to be fixed."
      //
      // Depth 11 was deliberate -- see a1aCanopy's own note, "ABOVE the hero (10), so the treeline
      // overdraws the player" -- and it buys a real sense of depth when she passes a tree edge. It
      // also loses the player inside a solid conifer block, and losing your own character is a
      // playability failure, not a stylistic trade. This is the same call he made on the town's
      // chimneys the same day: where "walk under" is ambiguous, remove the ambiguity rather than
      // keep tuning the boundary.
      var layers=[['base',1.1,1,1],['water',1.2,S,0.28],['canopy',A1A_CANOPY_DEPTH,1,1]];
      for(var L=0;L<layers.length;L++){
        var layer=layers[L][0];
        if(layer==='water'&&!rec.water) continue;
        if(layer==='canopy'&&!rec.canopy) continue;
        // NEVER BUILD HERE. This used to call a1aTexFor, which builds and uploads on the spot, so a
        // window step that brought two or three new chunks into view paid for every one of their
        // layers inside a SINGLE frame: three 1536x1536 GPU uploads plus a 1536x1536 canopy
        // composite. That is the freeze the owner reported, and it is why a1aDrainTex -- which
        // exists precisely to spread this at one texture per 80 ms tick -- never got the chance to
        // do its job. Measured 2026-08-11 on sim 4B05EF44: with the analytic splat provably at zero
        // (panel sp0 pl1) the stalls were unchanged at 661 ms and 939 ms, and they arrived exactly
        // with cv 4->6 and tx2 18->24, i.e. with this call and nothing else.
        //
        // A layer that is not ready yet is simply not drawn this frame. What shows through is the
        // flat sea, which is the state the owner chose for art-not-yet-landed ("Flat ocean colour,
        // no procedural"), and the ring prefetch means the common case is that it was built ticks
        // ago and this is a plain lookup. Before the locked-art change this same skip would have
        // exposed the procedural splat, which is why it could not have been done first.
        var key=a1aTexHave(c,layer);
        if(!key){ a1aEnqueueTex(c,rec); continue; }
        if(layer==='canopy') anyCanopy=true;
        live[key]=1;
        var im=A1A.imgs[key];
        if(!im||!im.scene){
          im=scene.add.image(wx,wy,key).setOrigin(0,0).setDepth(layers[L][1])
               .setScale(layers[L][2]).setAlpha(layers[L][3]);
          if(layer==='water'){ try{ im.setBlendMode((window.Phaser&&Phaser.BlendModes&&Phaser.BlendModes.SCREEN!==undefined)?Phaser.BlendModes.SCREEN:3); }catch(e){} }
          try{ im.texture.setFilter(NEAREST); }catch(e){}
          A1A.imgs[key]=im;
        } else { im.setPosition(wx,wy); }
        if(!im.visible) im.setVisible(true);
      }
    }
    Object.keys(A1A.imgs).forEach(function(k){ if(!live[k]){ var im=A1A.imgs[k]; if(im&&im.visible) im.setVisible(false); } });
    return anyCanopy;
  }

  // ============================================================
  //  LOCKED ART ONLY — the procedural surface is never what a player sees
  // ============================================================
  //  OWNER DIRECTIVE, 2026-08-11, asked directly and recorded in docs/GROUND-TRUTH.md:
  //  "no. locked in art, full stop." drawTerrain's analytic splat is not a lower design tier for
  //  the overworld. Inside Act 1 it is a BUG — and it was three reported bugs at once.
  //
  //  WHAT IT WAS DOING. updateTerrain called drawTerrain unconditionally and only afterwards
  //  decided whether to SHOW the result, on `A1A.lastFull` — "is the whole 33x39 window covered
  //  by loaded plate chunks". That window carries MARGIN=12 cells of OFF-SCREEN border on every
  //  side, so it reports partial across the plate's entire northern band (full needs hero
  //  y >= 247) even when every cell the CAMERA can see is baked art. Measured over all 9,376
  //  walkable tiles at iPhone 13's 390x701 pt viewport: the visible viewport escapes the plate at
  //  EIGHT of them, all at the far north. So the splat was never filling a coverage hole. It was
  //  computing 2.97 Mpx / 11.86 MB behind art that was already present and correct, and showing
  //  through wherever a chunk had not decoded yet. That is all three symptoms from build 14 —
  //  ground that did not match the art, the straight-edged "crease" (a chunk boundary), and the
  //  ~970 ms stall (docs/SMOOTH-ROUND-3-REFUTATION.md:244 measured this same operation at
  //  962-1017 ms). `A1A.dirty`, set every time a chunk lands, is what re-fired it every 2-4 s.
  //
  //  WHAT REPLACES IT: nothing procedural. Where the baked art has not landed yet (a chunk still
  //  decoding) or does not reach (north of y=218 — owner, 2026-08-11: "the far north will be
  //  built in as act 5 so we don't need to worry that much about it now"), the backdrop is flat
  //  sea taken from the owner's OWN bake — the modal deep-ocean pixel over the first 8x8 cells of
  //  chunk c0-r0 is rgb(3,30,55), and the water glint layer contributes nothing that far offshore,
  //  so this is the bake's colour and not a guess at it. One screen-locked quad at depth 0.5,
  //  under the plate's base sprites (1.1) and under dqterrain (1). It never repaints.
  //
  //  The hero cannot walk off the plate: walkable ground spans x 24-158, y 224-393 inside bounds
  //  x 16-163, y 218-399, i.e. at least six cells of blocked coast on every side. So the flat sea
  //  is not standing in for anywhere she can reach.
  var A1A_SEA='#031e37';
  var seaState=null;
  // TRUE once the Act 1 override has written its plate into THIS mapData. Deliberately NOT keyed
  // on A1A.manifest: the suppression must hold from the first overworld frame, before the manifest
  // fetch lands, or boot still pays one full splat — and it must not lapse when the LRU evicts a
  // chunk, which is precisely when the splat used to become visible.
  function a1aPlateOwns(scene){
    var W=window.__ACT1_WORLD_MAP__;
    return !!(W&&scene&&scene.currentMapId==='overworld'&&W.state&&W.state.appliedMap===scene.mapData);
  }
  function a1aPlateBounds(){ var W=window.__ACT1_WORLD_MAP__; return (W&&W.bounds)||null; }
  // Inside the plate the baked art already carries every conifer, ridge and meadow detail. Judged
  // on the plate's STATIC bounds, not on whether that chunk happens to be resident: a1aArtAt goes
  // false the moment the LRU evicts one, and the overlay then sprays procedural pines and
  // mountains across the owner's art at depth 5 — above it.
  function a1aPlateCell(tx,ty){
    var b=a1aPlateBounds();
    return b ? (tx>=b[0]&&tx<=b[2]&&ty>=b[1]&&ty<=b[3]) : a1aArtAt(tx,ty);
  }
  function a1aSea(scene,on){
    if(!on){ if(seaState&&seaState.img){ try{ seaState.img.setVisible(false); }catch(e){} } return; }
    var key='dqsea';
    if(!scene.textures.exists(key)){
      var t=scene.textures.createCanvas(key,8,8);
      t.context.fillStyle=A1A_SEA; t.context.fillRect(0,0,8,8); t.refresh();
      try{ t.setFilter(NEAREST); }catch(e){}
    }
    var cam=scene.cameras.main;
    if(!seaState||seaState.scene!==scene||!seaState.img||!seaState.img.scene){
      if(seaState&&seaState.img){ try{ seaState.img.destroy(); }catch(e){} }
      var im=scene.add.image(0,0,key).setOrigin(0,0).setScrollFactor(0).setDepth(0.5);
      try{ im.texture.setFilter(NEAREST); }catch(e){}
      seaState={ scene:scene, img:im, w:0, h:0 };
    }
    if(seaState.w!==cam.width||seaState.h!==cam.height){
      seaState.img.setDisplaySize(cam.width,cam.height); seaState.w=cam.width; seaState.h=cam.height; }
    if(!seaState.img.visible) seaState.img.setVisible(true);
  }
  function a1aDestroySea(){ if(seaState&&seaState.img){ try{ seaState.img.destroy(); }catch(e){} } seaState=null; }

  function ensureTerrain(scene){
    var cam=scene.cameras.main;
    var winW=Math.ceil(cam.worldView.width/TILE)+2*MARGIN, winH=Math.ceil(cam.worldView.height/TILE)+2*MARGIN;
    if (terrainState && terrainState.scene===scene && terrainState.winW===winW && terrainState.winH===winH && terrainState.image && terrainState.image.scene) return;
    if (terrainState && terrainState.image){ try{ terrainState.image.destroy(); }catch(e){} }
    if (terrainState && terrainState.cimg){ try{ terrainState.cimg.destroy(); }catch(e){} }
    var key='dqterrain';
    if (scene.textures.exists(key)) scene.textures.remove(key);
    var ct=scene.textures.createCanvas(key, winW*N, winH*N);
    try{ ct.setFilter(NEAREST); }catch(e){}
    var img=scene.add.image(0,0,key).setOrigin(0,0).setDepth(1).setScale(SC);
    try{ img.texture.setFilter(NEAREST); }catch(e){}
    // canopy: same window, depth 9.5 -> BELOW the hero (10). ~~"depth 11 -> ABOVE the hero (10),
    // so the treeline overdraws the player"~~ retired 2026-08-15 on the owner's report that she
    // vanishes inside the forest; the sprite-mode table above carries the reasoning. Kept in step
    // with that table on purpose -- a flag flip to canvas mode must not reintroduce the symptom.
    var ckey='dqcanopy';
    if (scene.textures.exists(ckey)) scene.textures.remove(ckey);
    var cct=scene.textures.createCanvas(ckey, winW*N, winH*N);
    try{ cct.setFilter(NEAREST); }catch(e){}
    var cimg=scene.add.image(0,0,ckey).setOrigin(0,0).setDepth(9.5).setScale(SC);
    try{ cimg.texture.setFilter(NEAREST); }catch(e){}
    terrainState={ scene:scene, winW:winW, winH:winH, ct:ct, image:img, cct:cct, cimg:cimg, lastWin:'' };
  }
  function updateTerrain(scene,force){
    if (!terrainState || terrainState.scene!==scene) return;
    var map=scene.mapData; if(!map||!map.length) return;
    var cam=scene.cameras.main, wv=cam.worldView, W=map[0].length, H=map.length, winW=terrainState.winW, winH=terrainState.winH;
    var X0=windowStart(wv.x,winW,W), Y0=windowStart(wv.y,winH,H);
    // re-show BEFORE the window-cache early-return: a single transient non-'ow' tick hides the
    // canopy, and if the hero is standing still the window key never changes, so a re-show placed
    // after this line would not run again until the window snapped to a new 12-cell boundary.
    if (terrainState.cimg && !terrainState.cimg.visible && A1A.drew && !a1aSpriteMode()) terrainState.cimg.setVisible(true);
    // SPRITE MODE re-show. The plate sprites are hidden wholesale on any non-'ow' tick, and a
    // single transient one is enough to hide them while the hero stands still -- at which point
    // the window key never changes and the early return below would never let them back.
    if (a1aSpriteMode() && A1A.lastRects && A1A.lastRects.length) a1aPlaceSprites(scene, A1A.lastRects);
    // Same reason as the sprite re-show above: one transient non-'ow' tick hides the sea, and if
    // the hero is standing still the window key never changes again.
    if (a1aPlateOwns(scene)) a1aSea(scene,true);
    var key=X0+'_'+Y0; if(!force && key===terrainState.lastWin) return; terrainState.lastWin=key;
    if(!terrainState.firstDrawAt) terrainState.firstDrawAt=Date.now();   // starts the loading gate's art grace
    // LOCKED ART ONLY — see the block above ensureTerrain. On the Act 1 plate the analytic splat
    // is neither computed nor uploaded, and the window canvas is never shown. a1aRects still runs:
    // it is what maintains the ring prefetch and the LRU that a1aPlaceSprites then consumes.
    if (a1aPlateOwns(scene)){
      var rs=costTime('rects',function(){ return a1aRects(X0,Y0,winW,winH); })||[];
      A1A.lastRects=rs; A1A.lastFull=!!rs.full;
      terrainState.image.setPosition(X0*TILE, Y0*TILE).setVisible(false);
      A1A.drew=a1aSpriteMode()?costTime('place',function(){ return a1aPlaceSprites(scene,rs); }):false;
      if (terrainState.cimg && terrainState.cimg.visible) terrainState.cimg.setVisible(false);
      return;
    }
    a1aSea(scene,false);
    drawTerrain(terrainState.ct.context, map, X0, Y0, winW, winH);
    if (a1aSpriteMode()){
      // The plate is drawn by its own textures. The window canvas is still the terrain for
      // everything OUTSIDE the plate, so it is hidden only while the window is wholly inside it --
      // which is precisely the case where it used to carry nothing but the baked art.
      var full=A1A.lastFull;
      if(!full) terrainState.ct.refresh();
      terrainState.image.setPosition(X0*TILE, Y0*TILE).setVisible(!full);
      A1A.drew=a1aPlaceSprites(scene, A1A.lastRects||[]);
      if (terrainState.cimg && terrainState.cimg.visible) terrainState.cimg.setVisible(false);
      return;
    }
    terrainState.ct.refresh();
    terrainState.image.setPosition(X0*TILE, Y0*TILE);
    if (terrainState.cimg){
      var drew=a1aCanopy(terrainState.cct.context, X0, Y0, winW, winH);
      if (drew || A1A.drew) terrainState.cct.refresh();   // outside Act 1 there is nothing to upload
      A1A.drew=drew;
      terrainState.cimg.setPosition(X0*TILE, Y0*TILE).setVisible(drew);
    }
  }
  function a1aHideCanopy(){ if(terrainState&&terrainState.cimg){ try{ terrainState.cimg.setVisible(false); }catch(e){} }
                            a1aHideSprites(); a1aSea(null,false); }

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
    var winW=Math.ceil(wv.width/TILE)+2*M, winH=Math.ceil(wv.height/TILE)+2*M;
    var x0=windowStart(wv.x,winW,W), x1=Math.min(W-1,x0+winW-1);
    var y0=windowStart(wv.y,winH,H), y1=Math.min(H-1,y0+winH-1);
    var key=x0+'_'+x1+'_'+y0+'_'+y1; if(!force && key===overlayState.lastKey) return; overlayState.lastKey=key;
    var c=overlayState.container; c.removeAll(true);
    var objs=[];
    // Inside the Act 1 plate the baked art already contains every conifer, ridge and meadow detail.
    // Emitting the procedural sprites there would double the treeline and the mountains.
    // a1aPlateCell, NOT a1aArtAt: residency is not the question, the owner's bounds are. Asking
    // whether the chunk is decoded RIGHT NOW put procedural pines and mountains over his art at
    // depth 5 every time the LRU evicted one — a second way the same load thrash became visible.
    for (var ty=y0;ty<=y1;ty++) for (var tx=x0;tx<=x1;tx++){ if(a1aPlateCell(tx,ty)) continue;
      var co=cellObjects(map,tx,ty); for(var i=0;i<co.length;i++) objs.push(co[i]); }
    var fl=buildFlowers(map,x0,x1,y0,y1);
    for(var f=0;f<fl.length;f++){ if(a1aPlateCell(Math.floor(fl[f].x/TILE),Math.floor(fl[f].y/TILE))) continue; objs.push(fl[f]); }
    objs.sort(function(a,b){ return a.y-b.y; });
    for (var k=0;k<objs.length;k++){ var o=objs[k];
      if (o.kind==='pine'){
        var shK=ensureShadowTex(scene,6); c.add(scene.add.image(o.x,o.y,shK).setOrigin(0.5,0.5));
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
  var OW_PROP_48={ village:1, cave:1, castle:1, portal:1, signpost:1, 'storm-nest':1, 'desert-signpost':1 }; // latest hero-scale set (2026-07-09); four biome entrances retain their approved 128px art
  var OW_PROP_SCALE={ castle:2.0, village:1.6, cave:1.4, portal:1.5, 'shadow-cave':1.5, signpost:1.25, 'storm-nest':1.85, 'crystal-cave':1.5, 'ice-cave':1.5, 'desert-tomb':1.6, 'desert-signpost':1.25 };
  var owPropLoading={};
  function owPropKey(name){ return 'owprop_'+name; }
  function preloadOwProps(scene){                                    // load all landmark PNGs via Phaser's loader (reliable in headless; raw new Image() raced)
    var q=0; for(var pk in OW_PROP){ var nm=OW_PROP[pk], key=owPropKey(nm); if(!scene.textures.exists(key)&&!owPropLoading[key]){ owPropLoading[key]=1; scene.load.image(key,'owprops/owprop-'+nm+(OW_PROP_48[nm]?'-48.png':'-128.png')); q++; } }
    if(q){ scene.load.once('loaderror',function(f){ if(f&&owPropLoading[f.key]) owPropLoading[f.key]=0; }); try{ scene.load.start(); }catch(e){} }
  }
  function ensureOwPropTex(scene,name){ var key=owPropKey(name); return scene.textures.exists(key)?key:null; }
  // ---- Act 1 hi-fi landmarks -------------------------------------------------------------
  // CODEX-ART-BRIEF-V7: "Landmarks are composited at runtime as sprites." The terrain bake is
  // deliberately structure-free and carries only a packed-earth pad, so these sprites are the
  // other half of the design, not decoration. landmarks.json ships each one's MEASURED ground
  // anchor (scripts/key_landmark_sprite.footprint -- the widest band of the silhouette, i.e.
  // where the diorama meets the ground). Drawing anchor-on-cell-centre is what puts the building
  // in its own clearing; the sprite's centre or its bottom edge both float it off the pad.
  var a1aLmLoading={};
  function a1aLandmarkTex(scene,slug){
    var key='a1alm_'+slug; if(scene.textures.exists(key)) return key;
    if(!a1aLmLoading[key]){ a1aLmLoading[key]=1; var im=new Image();
      im.onload=function(){ if(!scene.textures.exists(key)){ try{scene.textures.addImage(key,im);}catch(e){} } };
      im.onerror=function(){ a1aLmLoading[key]=2; };                    // permanent: owSpecialObjects runs at 12.5 Hz
      im.src='act1-hifi/landmarks/'+slug+'.png'; }
    return null;
  }
  /* ---- A DOOR IS NEVER HIDDEN BY TREETOPS ------------------------------------------------------
     Owner, build 38: "the darkfang grotto asset is sometimes rendered on top of the forrest and
     sometimes partially below it. it should always be rendered on top."

     Both halves are one cause. The landmark sprite sat at depth 6 and the chunk CANOPY layer sits
     at 9.5, so the forest canopy always won -- and the "sometimes on top" is simply the frames
     before that chunk's canopy texture has landed. a1aDrawChunks skips a layer that is not ready
     yet (see its own note), so the grotto looks correct until the canopy arrives and then sinks
     behind it. Nondeterministic-looking, entirely deterministic underneath: it is a load race, not
     a sorting bug, and no amount of retrying would have shown a pattern.

     Landmarks now sit BETWEEN the canopy and the hero. The order is the whole point, so all three
     depths are named here rather than left as bare numbers three hundred lines apart:

         canopy   9.5   treetops, drawn over the ground and over each other
         landmark 9.6   town gates and cave mouths -- always visible, they are where the player
                        is trying to GO, and a door you cannot see is a navigation bug
         hero    10     still walks in front of the mouth she is about to enter

     Applied to every hi-fi landmark, not just Darkfang: the same race exists for all of them and a
     rule that holds for one entrance and not the others is the harder thing to reason about. */
  var A1A_CANOPY_DEPTH=9.5, A1A_LANDMARK_DEPTH=9.6;      // hero draws at 10 -- see above
  function a1aLandmarks(scene,map,X0,X1,Y0,Y1,seen){
    var L=A1A.landmarks; if(!L) return;
    for(var i=0;i<L.length;i++){ var lm=L[i], cx=lm.cell[0], cy=lm.cell[1], sz=lm.size;
      var pad=Math.ceil(sz/TILE)+1;                                     // a 192px sprite overhangs its cell by ~2 cells
      if(cx<X0-pad||cx>X1+pad||cy<Y0-pad||cy>Y1+pad) continue;
      // Only where the map actually has an entrance. landmarks.json still carries `misty-grotto`
      // at (91,378), which is plain walkable grass (tile 0) -- Darkfang at (96,359) is the real
      // mistyGrotto door. Drawing it would paint a 144px cave mouth the player walks straight
      // through. The terrain bake's packed-earth pad stays either way; this only withholds the
      // fake door, and self-heals if that cell ever gets a real tile.
      var mrow=map&&map[cy]; if(!mrow||!OW_PROP[mrow[cx]]) continue;
      var tk=a1aLandmarkTex(scene,lm.slug); if(!tk) continue;           // PNG still loading -> next tick
      var key='a1alm_'+lm.slug, img=owImgs[key];
      if(!img){ img=scene.add.image(0,0,tk).setDepth(A1A_LANDMARK_DEPTH); owImgs[key]=img; }
      if(img.texture.key!==tk) img.setTexture(tk);
      img.setOrigin(lm.anchor[0]/sz, lm.anchor[1]/sz)
         .setPosition(cx*TILE+TILE/2, cy*TILE+TILE/2)                   // anchor pixel lands on the CELL CENTRE
         .setDisplaySize(sz,sz);
      if(!img.visible) img.setVisible(true); seen[key]=1;
    }
  }
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
      if(a1aInBounds(tx,ty)) continue;                                                // Act 1 plate: the hi-fi sprite below owns this cell, not the old flat prop
      var tk=ensureOwPropTex(scene,name); if(!tk)continue;                            // PNG still loading -> next tick
      if(window.__OW_DBG__)window.__OW_DBG__.tex++;
      var key=tx+'_'+ty, img=owImgs[key]; if(!img){ img=scene.add.image(0,0,tk).setDepth(6); owImgs[key]=img; }
      if(img.texture.key!==tk) img.setTexture(tk);
      var sc=OW_PROP_SCALE[name]||1.5; img.setOrigin(0.5,1).setPosition(tx*TILE+TILE/2, ty*TILE+TILE).setDisplaySize(TILE*sc,TILE*sc); // bigger + sit on the tile & rise up
      if(!img.visible)img.setVisible(true); seen[key]=1; } }
    a1aLandmarks(scene,map,X0,X1,Y0,Y1,seen);
    // ---- CULL OFF-SCREEN, AND ACTUALLY DESTROY THE FAR ONES ----------------------------------
    // This map used to only ever HIDE. Every prop tile the player had ever walked past kept its
    // Phaser Image alive for the whole session, keyed by tile coordinate, and the overworld is ONE
    // map -- so the `owMap !== currentMapId` reset above never fires while exploring it. The set
    // therefore grew without bound for as long as the player kept walking, and BOTH loops here
    // iterate all of it every frame, so the per-frame cost grew with distance travelled too.
    // That is the shape of the owner's report on build 32: the blue screen "happened again after
    // exploring the overworld for a while". A leak that scales with exploration is exactly what
    // survives a fixed-cost audit -- every measurement I took was at a seeded starting position,
    // which is precisely where this costs nothing.
    //
    // Hiding is still right for anything just off the edge: she turns around constantly, and
    // rebuilding an Image she will need again next second is churn. Beyond KEEP_R tiles she is not
    // coming straight back, and the texture stays in Phaser's cache either way, so re-creating one
    // later is an add.image, not a load. Destroying inside the same pass that hides keeps this O(n)
    // rather than adding a second sweep.
    var OW_KEEP_R = 48;                                   // tiles from the camera centre; ~4x the window half-width
    var ccx = (cam.scrollX + cam.width / 2) / TILE, ccy = (cam.scrollY + cam.height / 2) / TILE;
    var vis = 0;
    for (var k2 in owImgs){
      var im2 = owImgs[k2]; if(!im2) { delete owImgs[k2]; continue; }
      if (seen[k2]) { vis++; continue; }
      if (im2.visible) im2.setVisible(false);
      var p = k2.indexOf('_');                            // landmark keys are 'a1alm_<slug>' -- not tile-keyed, so never distance-culled
      if (p < 0 || k2.lastIndexOf('a1alm_', 0) === 0) continue;
      var kx = +k2.slice(0, p), ky = +k2.slice(p + 1);
      if (kx !== kx || ky !== ky) continue;               // NaN guard: not a tile key
      if (Math.abs(kx - ccx) > OW_KEEP_R || Math.abs(ky - ccy) > OW_KEEP_R){
        try { im2.destroy(); } catch(e) {}
        delete owImgs[k2];
      }
    }
    window.__OW_PROP_COUNT__=vis;                         // readiness signal for capture harness
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
    dng:    { wall:'brick', w:{base:[60,63,72],lt:[90,93,104],dk:[38,40,48],mortar:[20,21,27]},     f:[[72,72,75],[90,90,93],[110,110,113],[130,130,133],[148,148,151]],     fj:[50,50,53],   bh:6,bw:12, floor:'flag',     acc:'moss',  accA:[44,58,40],  accB:[30,42,28] },
    ice:    { wall:'brick', w:{base:[120,150,180],lt:[170,200,224],dk:[80,108,140],mortar:[54,76,104]}, f:[[150,180,205],[176,204,224],[200,224,238],[220,238,248],[238,248,252]], fj:[110,140,168], bh:9,bw:15, floor:'ice',      acc:'frost', accA:[232,244,250],accB:[188,214,234] },
    crystal:{ wall:'crystal', w:{base:[126,176,218],lt:[188,222,246],dk:[88,134,184],mortar:[156,198,230]},  f:[[104,148,192],[128,172,212],[156,196,230],[184,216,242],[208,232,250]],    fj:[84,128,174],   bh:8,bw:14, floor:'crystalfloor', acc:'crystal',accA:[232,250,255],accB:[172,214,246] },
    tomb:   { wall:'brick', w:{base:[150,124,84],lt:[188,162,116],dk:[108,86,56],mortar:[72,56,34]},f:[[150,132,96],[172,152,116],[192,172,136],[210,192,158],[226,208,176]],   fj:[96,80,54],   bh:9,bw:21, floor:'flag',     acc:'carve', accA:[102,80,50], accB:[128,104,68] },
    forest: { wall:'tree',  w:{base:[46,72,40],lt:[76,106,56],dk:[28,46,26],mortar:[18,30,16]},     f:[[78,62,44],[96,78,56],[114,94,68],[132,112,84],[150,130,100]],         fj:[54,42,30],   bh:6,bw:12, floor:'dirt',     acc:'vine',  accA:[64,112,48], accB:[42,80,30] },
    shadow: { wall:'brick', w:{base:[42,38,56],lt:[68,62,86],dk:[26,24,38],mortar:[14,13,22]},      f:[[40,38,50],[54,52,66],[68,66,82],[84,82,100],[100,98,118]],           fj:[26,24,36],   bh:6,bw:12, floor:'flag',     acc:'wisp',  accA:[124,88,164],accB:[82,58,118] },
    tower:  { wall:'brick', w:{base:[112,104,92],lt:[148,138,124],dk:[78,72,62],mortar:[48,44,36]}, f:[[110,104,94],[130,124,114],[150,144,134],[168,162,152],[184,178,168]], fj:[74,68,58],   bh:9,bw:21, floor:'flag',     acc:'none' },
    castle: { wall:'brick', w:{base:[86,90,108],lt:[126,130,150],dk:[56,60,76],mortar:[34,36,48]},  f:[[100,102,114],[122,124,136],[142,144,156],[162,164,176],[182,184,196]],fj:[62,64,74],   bh:8,bw:15, floor:'flag',     acc:'gold',  accA:[214,182,98],accB:[160,130,64] },
    lava:   { wall:'rock',  w:{base:[64,50,46],lt:[96,74,66],dk:[42,32,30],mortar:[26,18,16]},      f:[[40,32,32],[54,42,40],[70,56,52],[86,68,62],[102,82,74]],             fj:[24,18,18],   bh:6,bw:12, floor:'obsidian', acc:'glow', accA:[255,152,52],accB:[240,84,30] }
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
  function floorFlag(data,cw,bx,by,TX,TY){                              // two-by-two flagstone grid; full 24-unit tile
    var H=N>>1;
    for (var ly=0;ly<N;ly++) for (var lx=0;lx<N;lx++){
      var sx=(lx<H?0:H), sy=(ly<H?0:H), inLX=lx-sx, inLY=ly-sy, sgx=TX*2+(lx<H?0:1), sgy=TY*2+(ly<H?0:1);
      var n=_h(sgx,sgy,71), ti=n<0.16?0:(n<0.42?1:(n<0.74?2:(n<0.90?3:4))), c=FLOOR_R[ti];
      if (inLX===0||inLY===0) c=FJ; else if (inLY===1) c=FLOOR_R[Math.min(4,ti+1)]; else if (inLY===H-1) c=FLOOR_R[Math.max(0,ti-1)];
      else if (_h(sgx,sgy,151)<0.26 && inLX>=3 && inLX<=8 && inLY>=5 && inLY<=8) c=FLOOR_R[Math.max(0,ti-1)];
      setD(data,cw,bx+lx,by+ly,c);
    }
    if (_h(TX,TY,909)<0.16){ var r=RNG(TX*7+TY*13+3), x=ri(r,3,N-4), y=ri(r,3,N-4); for(var s=0;s<5;s++){ if(x<0||x>=N||y<0||y>=N)break; setD(data,cw,bx+x,by+y,FLOOR_R[0]); x+=ri(r,0,1); y+=ri(r,-1,1); } }
  }
  function floorSand(data,cw,bx,by,TX,TY){                              // soft dunes, no grid, wind ripples
    for (var ly=0;ly<N;ly++) for (var lx=0;lx<N;lx++){ var wx=TX*N+lx, wy=TY*N+ly, n=vnoise(wx,wy,16.5,71)*0.7+vnoise(wx,wy,6,72)*0.3;
      var ti=n<0.32?1:(n<0.58?2:(n<0.84?3:4)), c=FLOOR_R[ti];
      if (_h(Math.floor(wx/5),wy,33)<0.05) c=FLOOR_R[Math.max(0,ti-1)]; setD(data,cw,bx+lx,by+ly,c); }
  }
  function floorDirt(data,cw,bx,by,TX,TY){                              // earthy, blobby, pebbles + grass tufts
    for (var ly=0;ly<N;ly++) for (var lx=0;lx<N;lx++){ var wx=TX*N+lx, wy=TY*N+ly, n=vnoise(wx,wy,13.5,41)*0.7+vnoise(wx,wy,4.5,43)*0.3;
      var ti=n<0.28?0:(n<0.54?1:(n<0.8?2:3)), c=FLOOR_R[ti];
      if (_h(wx,wy,5)<0.05) c=FLOOR_R[0]; else if (_h(wx,wy,17)<0.025) c=TH.accA; setD(data,cw,bx+lx,by+ly,c); }
  }
  function floorIce(data,cw,bx,by,TX,TY){                               // pale smooth ice + crack network + sparkle
    for (var ly=0;ly<N;ly++) for (var lx=0;lx<N;lx++){ var wx=TX*N+lx, wy=TY*N+ly, n=vnoise(wx,wy,19.5,71);
      var c=FLOOR_R[n<0.35?2:(n<0.7?3:4)]; if (_h(wx,wy,9)<0.018) c=[245,250,254]; setD(data,cw,bx+lx,by+ly,c); }
    if (_h(TX,TY,211)<0.4){ var r=RNG(TX*5+TY*11), x=ri(r,3,N-4), y=ri(r,2,N-3); for(var s=0;s<7;s++){ if(x<0||x>=N||y<0||y>=N)break; setD(data,cw,bx+x,by+y,FLOOR_R[1]); x+=ri(r,0,1); y+=ri(r,-1,1); } }
  }
  function crystalFloorBand(wx,wy){ var e=vnoise(wx,wy,3.15,71)*0.74+vnoise(wx,wy,6,317)*0.26; return e<0.4?0:(e<0.72?1:2); }
  function floorCrystal(data,cw,bx,by,TX,TY){                           // CLEAN light-blue crystalline floor: big flat facets + crisp edges (calmer than walls)
    for (var ly=0;ly<N;ly++) for (var lx=0;lx<N;lx++){ var wx=TX*N+lx, wy=TY*N+ly, b=crystalFloorBand(wx,wy);
      var edge = crystalFloorBand(wx-1,wy)!==b || crystalFloorBand(wx,wy-1)!==b;
      setD(data,cw,bx+lx,by+ly, edge? FLOOR_R[1] : FLOOR_R[b+2]); }
  }
  function floorObsidian(data,cw,bx,by,TX,TY){                          // dark rock + GLOWING lava cracks
    for (var ly=0;ly<N;ly++) for (var lx=0;lx<N;lx++){ var wx=TX*N+lx, wy=TY*N+ly, n=vnoise(wx,wy,13.5,41); setD(data,cw,bx+lx,by+ly,FLOOR_R[n<0.4?0:(n<0.78?1:2)]); }
    if (_h(TX,TY,313)<0.34){ var r=RNG(TX*9+TY*7+3), x=ri(r,5,N-6), y=ri(r,3,N-4);
      for(var s=0;s<9;s++){ if(x<1||x>=N-1||y<1||y>=N-1)break; setD(data,cw,bx+x,by+y,TH.accA); setD(data,cw,bx+x-1,by+y,TH.accB); setD(data,cw,bx+x+1,by+y,TH.accB); x+=ri(r,-1,1); y+=ri(r,0,1); } }
  }
  function floorLava(data,cw,bx,by,TX,TY,map){                          // seamless molten LAVA (tile 5) with cooled-crust SMOOTHED edges where it borders non-lava (noisy contour, not a hard tile line)
    var L1=[255,234,156], L2=[255,178,62], L3=[236,100,34], L4=[152,46,22], CR=[74,42,28], CR2=[46,26,20];
    var nN=nb(map,TX,TY-1)!==5, nS=nb(map,TX,TY+1)!==5, nW=nb(map,TX-1,TY)!==5, nE=nb(map,TX+1,TY)!==5; // which sides border non-lava
    for (var ly=0;ly<N;ly++) for (var lx=0;lx<N;lx++){ var wx=TX*N+lx, wy=TY*N+ly, d=99;
      if(nN) d=Math.min(d, ly        + (vnoise(wx,wy,10.5,201)-0.5)*9);   // noisy distance from each bordering edge
      if(nS) d=Math.min(d, (N-1-ly) + (vnoise(wx,wy,10.5,203)-0.5)*9);
      if(nW) d=Math.min(d, lx        + (vnoise(wx,wy,10.5,205)-0.5)*9);
      if(nE) d=Math.min(d, (N-1-lx) + (vnoise(wx,wy,10.5,207)-0.5)*9);
      var c;
      if(d<1.5) c=CR2; else if(d<4) c=CR;                                // cooled-rock crust rim (organic boundary)
      else { var v=vnoise(wx,wy,7.5,71)*0.6+vnoise(wx,wy,15,131)*0.4; c=v<0.30?CR:(v<0.40?L4:(v<0.56?L3:(v<0.74?L2:L1))); if(_h(wx,wy,617)<0.015) c=[255,248,214]; }
      setD(data,cw,bx+lx,by+ly,c); }
  }
  // lit stone-brick wall TOP; brick grid keyed to WORLD px so it tiles seamlessly across cells.
  // + sparse THEME accent (moss/frost/crystal…) on some bricks, an occasional hairline CRACK.
  // NATURAL ROCK wall top (lava): irregular rock lumps (value-noise, no brick grid) + glowing lava seams
  function rockWallTop(ctx,bx,by,TX,TY){
    for (var ly=0;ly<N;ly++) for (var lx=0;lx<N;lx++){ var gx=TX*N+lx, gy=TY*N+ly, e=vnoise(gx,gy,9,71)*0.6+vnoise(gx,gy,4.5,73)*0.4;
      var tone=e<0.34?SW.dk:(e<0.68?SW.base:SW.lt); if(_h(gx,gy,201)<0.12) tone=SW.dk; px(ctx,bx+lx,by+ly,tone); }
    if (_h(TX,TY,77)<0.55){ var r=RNG(TX*11+TY*3), x=ri(r,3,N-4), y=ri(r,3,N-4); for(var s=0;s<7;s++){ if(x<1||x>=N-1||y<0||y>=N)break;
      px(ctx,bx+x,by+y,TH.accA); if(x+1<N)px(ctx,bx+x+1,by+y,TH.accB); if(x-1>=0)px(ctx,bx+x-1,by+y,TH.accB); x+=ri(r,-1,1); y+=ri(r,0,1); } } // glowing seam
  }
  // TREE wall top (forest): dense foliage canopy from above (bumpy, no grid) + leaf clumps
  function treeWallTop(ctx,bx,by,TX,TY){
    for (var ly=0;ly<N;ly++) for (var lx=0;lx<N;lx++){ var gx=TX*N+lx, gy=TY*N+ly, e=vnoise(gx,gy,6.75,71)*0.6+vnoise(gx,gy,3,73)*0.4;
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
  function crystalBand(gx,gy){ var e=vnoise(gx,gy,2.85,71)*0.74+vnoise(gx,gy,5.55,317)*0.26; return e<0.34?0:(e<0.57?1:(e<0.78?2:3)); }
  function crystalWallTop(ctx,bx,by,TX,TY){                              // CLEAN light-blue crystal: large flat facets + crisp edges + sparse glints (no messy prism tangle)
    var T=[SW.dk,SW.base,SW.mortar,SW.lt];
    for (var ly=0;ly<N;ly++) for (var lx=0;lx<N;lx++){ var gx=TX*N+lx, gy=TY*N+ly, b=crystalBand(gx,gy);
      var edge = crystalBand(gx-1,gy)!==b || crystalBand(gx,gy-1)!==b;   // crisp facet boundary
      px(ctx,bx+lx,by+ly, edge? SW.dk : T[b]); }
    var r=RNG(TX*13+TY*7+5), g=ri(r,1,3);                                // a few crisp sparkle glints on the brightest facets
    for (var k=0;k<g;k++){ var sx=ri(r,3,N-4), sy=ri(r,3,N-4); if(crystalBand(TX*N+sx,TY*N+sy)>=2){ px(ctx,bx+sx,by+sy,TH.accA); if(sx+1<N)px(ctx,bx+sx+1,by+sy,TH.accB); } }
  }
  function wallTopInto(ctx,bx,by,TX,TY){
    if (TH.wall==='rock') return rockWallTop(ctx,bx,by,TX,TY);
    if (TH.wall==='tree') return treeWallTop(ctx,bx,by,TX,TY);
    if (TH.wall==='crystal') return crystalWallTop(ctx,bx,by,TX,TY);
    var BH=TH.bh, BW=TH.bw;
    for (var ly=0;ly<N;ly++) for (var lx=0;lx<N;lx++){
      var gy=TY*N+ly, gx=TX*N+lx, row=Math.floor(gy/BH), off=((row&1)?(BW>>1):0), bcol=Math.floor((gx+off)/BW);
      var iny=gy-row*BH, inx=(gx+off)-bcol*BW, n=_h(bcol,row,91), tone=n<0.30?SW.dk:(n<0.82?SW.base:SW.lt);
      px(ctx,bx+lx,by+ly, (iny===0||inx===0)?SW.mortar : ((iny===1)?SW.lt : ((iny===BH-1)?SW.dk : tone)));
    }
    wallAccent(ctx,bx,by,TX,TY,BH,BW);                                          // theme signature element
    if (_h(TX,TY,777)<0.12){ var r=RNG(TX*31+TY*17+9), cx=ri(r,5,N-6), cy=ri(r,3,N-6); for(var s=0;s<4;s++){ if(cy>=N)break; px(ctx,bx+cx,by+cy,SW.mortar); cx+=ri(r,-1,1); cy++; } } // hairline crack
  }
  // SIGNATURE per-theme wall element — the thing that makes each dungeon instantly recognizable
  function wallAccent(ctx,bx,by,TX,TY,BH,BW){
    var a=TH.acc; if (a==='none') return;
    if (a==='moss' || a==='vine'){
      for (var ly=0;ly<N;ly++) for (var lx=0;lx<N;lx++){ var gy=TY*N+ly, gx=TX*N+lx, row=Math.floor(gy/BH), iny=gy-row*BH;
        if (_h(Math.floor(gx/BW),row,313)<(a==='vine'?0.34:0.13) && iny>=BH-2) px(ctx,bx+lx,by+ly,(_h(gx,gy,5)<0.5?TH.accA:TH.accB)); }
      if (a==='vine' && _h(TX,TY,51)<0.45){ var rv=RNG(TX*13+TY*5), vx=ri(rv,3,N-4), vl=ri(rv,8,N-4); for(var k=0;k<vl;k++){ if(k>=N)break; px(ctx,bx+vx,by+k,(k%3?TH.accA:TH.accB)); } } // hanging vine
    } else if (a==='frost'){
      for (var ly2=0;ly2<N;ly2++) for (var lx2=0;lx2<N;lx2++){ if(_h(TX*N+lx2,TY*N+ly2,71)<0.10) px(ctx,bx+lx2,by+ly2,TH.accA); } // frost speckle
    } else if (a==='crystal'){
      if (_h(TX,TY,77)<0.36){ var rc=RNG(TX*7+TY*19), cx=ri(rc,6,N-7), cy=ri(rc,8,N-8), s=ri(rc,3,5);   // glowing crystal cluster
        for(var dy=-s;dy<=s;dy++) for(var dx=-s;dx<=s;dx++){ if(Math.abs(dx)+Math.abs(dy)<=s) px(ctx,bx+cx+dx,by+cy+dy, (dx<0?TH.accA:TH.accB)); }
        px(ctx,bx+cx,by+cy-1,[255,255,255]); }
    } else if (a==='carve'){
      for (var ly3=0;ly3<N;ly3++){ var gy3=TY*N+ly3, row3=Math.floor(gy3/BH), iny3=gy3-row3*BH; if(iny3===3) for(var lx3=3;lx3<N-3;lx3++){ if(_h(Math.floor((TX*N+lx3)/3),row3,131)<0.62) px(ctx,bx+lx3,by+ly3,TH.accA); } } // carved grooves
    } else if (a==='wisp'){
      if (_h(TX,TY,77)<0.12){ var rw=RNG(TX*3+TY*7), cx2=ri(rw,6,N-7), cy2=ri(rw,6,N-7); px(ctx,bx+cx2,by+cy2,TH.accA); px(ctx,bx+cx2+1,by+cy2,TH.accB); px(ctx,bx+cx2,by+cy2+1,TH.accB); } // faint glow
    } else if (a==='gold'){
      for (var ly4=0;ly4<N;ly4++){ var gy4=TY*N+ly4, row4=Math.floor(gy4/BH), iny4=gy4-row4*BH; if(iny4===1 && _h(TX,row4,41)<0.45) for(var lx4=0;lx4<N;lx4++) px(ctx,bx+lx4,by+ly4,TH.accA); } // gold trim
    } else if (a==='glow'){
      if (_h(TX,TY,77)<0.42){ var rg=RNG(TX*11+TY*3), gx2=ri(rg,3,N-4), gy5=ri(rg,3,N-4); for(var k2=0;k2<6;k2++){ if(gx2<0||gx2>=N||gy5<0||gy5>=N)break; px(ctx,bx+gx2,by+gy5,TH.accA); if(gx2+1<N)px(ctx,bx+gx2+1,by+gy5,TH.accB); gx2+=ri(rg,-1,1); gy5+=ri(rg,0,1); } } // glowing crack
    }
  }
  // SOUTH front-face (the wall's HEIGHT, a dark cliff) hanging into the cell below + a strong drop
  // shadow on the floor — this is what makes a wall read as a raised 3D block, not a flat tile.
  function wallFrontShadow(ctx,map,TX,TY,bx,by){
    if (dngRole(nb(map,TX,TY+1))===2) return;                              // wall below -> interior, no face
    var FH=20;
    if (TH.wall==='rock'){                                                 // LAVA: rocky cliff + glowing lava seeping at base
      for (var fy=0;fy<FH;fy++) for (var fx=0;fx<N;fx++){ var e=vnoise(TX*N+fx,TY*10+fy,7.5,41); px(ctx,bx+fx,by+N+fy,(fy===0?SW.base:(e<0.4?SW.mortar:SW.dk))); }
      for (var gx=1;gx<N-1;gx++){ if(_h(TX*N+gx,TY,8)<0.35){ px(ctx,bx+gx,by+N+FH-1,TH.accA); px(ctx,bx+gx,by+N+FH-2,TH.accB); } }
    } else if (TH.wall==='tree'){                                          // FOREST: foliage skirt + tree trunk
      for (var fy2=0;fy2<FH;fy2++) for (var fx2=0;fx2<N;fx2++){ var e2=vnoise(TX*N+fx2,TY*9+fy2,6,71); px(ctx,bx+fx2,by+N+fy2,(e2<0.45?SW.dk:SW.base)); }
      if (_h(TX,TY,41)<0.6){ var rt=RNG(TX*7+TY*13), tx=ri(rt,8,14); for(var t=0;t<FH;t++){ px(ctx,bx+tx,by+N+t,[74,52,30]); px(ctx,bx+tx+1,by+N+t,[52,36,20]); } }
    } else if (TH.wall==='crystal'){                                       // CRYSTAL: light-blue faceted front + 1-2 CLEAN hanging spikes (soft edges, not noisy)
      var CT=[SW.dk,SW.base,SW.mortar,SW.lt];
      for (var fy4=0;fy4<FH;fy4++) for (var fx4=0;fx4<N;fx4++){ var gy4=TY*N+N+fy4, b4=crystalBand(TX*N+fx4,gy4);
        var ed4=crystalBand(TX*N+fx4-1,gy4)!==b4 || crystalBand(TX*N+fx4,gy4-1)!==b4; px(ctx,bx+fx4,by+N+fy4, ed4?SW.dk:CT[b4]); }
      var rc=RNG(TX*9+TY*5), m=ri(rc,1,2); for(var k=0;k<m;k++){ var sx=bx+ri(rc,5,N-6), sh=ri(rc,6,FH+2); drawCrystal(ctx,sx,by+N+((sh/2)|0),(sh/2)|0,3,SW.lt,SW.base,SW.dk,TH.accB); }
    } else {                                                              // BRICK: lit lip + dark cliff + theme cliff deco
      var lip=[Math.round(SW.base[0]*1.18),Math.round(SW.base[1]*1.18),Math.round(SW.base[2]*1.18)];
      for (var fy3=0;fy3<FH;fy3++) for (var fx3=0;fx3<N;fx3++){ var gx3=TX*N+fx3, n=_h(Math.floor(gx3/6),TY*7+fy3,41); px(ctx,bx+fx3,by+N+fy3,(fy3===0?lip:(fy3>=FH-2?[10,11,16]:(n<0.45?SW.mortar:SW.dk)))); }
      var a=TH.acc;
      if (a==='frost' && _h(TX,TY,61)<0.5){ var rf=RNG(TX*7+TY*3), ix=ri(rf,3,N-4), il=ri(rf,3,7); for(var k=0;k<il;k++) px(ctx,bx+ix,by+N+k,[228,240,250]); }
      else if (a==='crystal' && _h(TX,TY,63)<0.4){ var rc=RNG(TX*9+TY*7), cx=ri(rc,5,N-6); px(ctx,bx+cx,by+N,TH.accA); px(ctx,bx+cx,by+N+1,TH.accB); }
    }
    for (var sy=0;sy<18;sy++){ ctx.fillStyle='rgba(0,0,0,'+(0.5-sy*0.0275).toFixed(3)+')'; ctx.fillRect(bx,by+N+FH+sy,N,1); } // strong drop shadow, fading
  }
  var dngState=null;
  // Drop BOTH of the dungeon's display objects. The fog is the one that matters off the floor: it is
  // setScrollFactor(0), so it is glued to the SCREEN, and updateFog() only runs from tick()'s 'dng'
  // branch -- off the floor it is neither redrawn nor moved, it just stays there at whatever the last
  // dungeon frame painted. Called from reskinTown (as it always was, inline) and, since 2026-08-08,
  // on the way out to the overworld too.
  function destroyDng(){
    if(!dngState) return;
    try{dngState.image&&dngState.image.destroy();}catch(e){}
    try{dngState.fog&&dngState.fog.destroy();}catch(e){}
    dngState=null;
  }
  function ensureDng(scene){
    var cam=scene.cameras.main, winW=Math.ceil(cam.worldView.width/TILE)+2*MARGIN, winH=Math.ceil(cam.worldView.height/TILE)+2*MARGIN;
    if (dngState && dngState.scene===scene && dngState.winW===winW && dngState.winH===winH && dngState.image && dngState.image.scene) return;
    if (dngState){ try{dngState.image&&dngState.image.destroy();}catch(e){} try{dngState.fog&&dngState.fog.destroy();}catch(e){} }
    var key='dqdngbase'; if (scene.textures.exists(key)) scene.textures.remove(key);
    var ct=scene.textures.createCanvas(key, winW*N, winH*N); try{ct.setFilter(NEAREST);}catch(e){}
    var img=scene.add.image(0,0,key).setOrigin(0,0).setDepth(1).setScale(SC); try{img.texture.setFilter(NEAREST);}catch(e){}
    var FOGF=6, fw=Math.ceil(cam.width/FOGF)+1, fh=Math.ceil(cam.height/FOGF)+1, fkey='dqdngfog';
    if (scene.textures.exists(fkey)) scene.textures.remove(fkey);
    var fct=scene.textures.createCanvas(fkey, fw, fh); try{fct.setFilter(NEAREST);}catch(e){}
    var fog=scene.add.image(0,0,fkey).setOrigin(0,0).setScrollFactor(0).setDepth(8).setScale(FOGF); try{fog.texture.setFilter(NEAREST);}catch(e){}
    dngState={ scene:scene, winW:winW, winH:winH, ct:ct, image:img, fog:fog, fogCt:fct, fw:fw, fh:fh, FOGF:FOGF, lastWin:'' };
  }
  // lit NW edges of a wall TOP (catches the upper-left light) + a SLIGHT corner bevel (edge-smoothing)
  function wallEdges(ctx,map,TX,TY,bx,by){
    var fN=dngRole(nb(map,TX,TY-1))!==2, fW=dngRole(nb(map,TX-1,TY))!==2, fE=dngRole(nb(map,TX+1,TY))!==2, fS=dngRole(nb(map,TX,TY+1))!==2;
    var litT=[Math.min(255,SW.lt[0]+34),Math.min(255,SW.lt[1]+34),Math.min(255,SW.lt[2]+38)];
    if (fN) hline(ctx,bx,bx+N-1,by,litT);                  // top edge highlight (faces light)
    if (fW) vline(ctx,bx,by,by+N-1,litT);                  // left edge highlight
    if (fE) vline(ctx,bx+N-1,by,by+N-1,SW.dk);             // right edge shaded
    function bevel(cx,cy,sx,sy){ for(var u=0;u<4;u++) for(var v=0;v<4;v++) if(u+v<4) px(ctx,cx+sx*u,cy+sy*v,(u+v<3?FLOOR_R[1]:FLOOR_R[2])); } // round outer corners
    if (fN&&fW) bevel(bx,by,1,1); if (fN&&fE) bevel(bx+N-1,by,-1,1); if (fS&&fW) bevel(bx,by+N-1,1,-1); if (fS&&fE) bevel(bx+N-1,by+N-1,-1,-1);
  }
  // contact AMBIENT-OCCLUSION shadow on the floor where it meets a wall (sides + base) -> grounds the walls,
  // the single biggest wall/floor-distinction cue. (N edge is handled by the N wall's front-face.)
  function floorAO(ctx,map,TX,TY,bx,by){
    var DW=6;
    function edge(side){ for(var t=0;t<N;t++) for(var d=0;d<DW;d++){ var a=0.42*(1-d/DW), X, Y;
      if(side==='W'){X=bx+d;Y=by+t;} else if(side==='E'){X=bx+N-1-d;Y=by+t;} else {X=bx+t;Y=by+N-1-d;}
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
  function _glyph(ctx,x,y,t,c){                                              // tiny hieroglyph pictograph in a ~6x8 box
    switch(t){
      case 0: hline(ctx,x,x+4,y+2,c); px(ctx,x+2,y,c); px(ctx,x+2,y+4,c); break;                          // eye
      case 1: px(ctx,x,y,c); px(ctx,x+4,y,c); px(ctx,x+2,y+2,c); vline(ctx,x+2,y+2,y+6,c); break;         // bird
      case 2: vline(ctx,x+2,y,y+6,c); hline(ctx,x,x+4,y+2,c); break;                                       // ankh/cross
      case 3: px(ctx,x,y+2,c); px(ctx,x+2,y,c); px(ctx,x+4,y+2,c); px(ctx,x,y+6,c); px(ctx,x+2,y+4,c); px(ctx,x+4,y+6,c); break; // water zigzag
      case 4: px(ctx,x+2,y,c); vline(ctx,x+2,y+2,y+4,c); px(ctx,x,y+2,c); px(ctx,x+4,y+2,c); px(ctx,x,y+6,c); px(ctx,x+4,y+6,c); break; // figure
      case 5: rect(ctx,x,y+2,6,4,c); break;                                                                // bar/sun
      case 6: vline(ctx,x+2,y,y+6,c); break;                                                               // stroke
      default: hline(ctx,x,x+4,y+6,c); px(ctx,x,y+4,c); px(ctx,x+4,y+4,c); px(ctx,x+2,y+2,c); break;      // vessel
    }
  }
  function _plaqueGlyphs(ctx,bx,by,c){                                       // grid of hieroglyphs filling the wide tablet (2 rows x 6 cols)
    var pat=[0,1,6,3,4,2, 5,3,1,7,6,0], cols=[8,16,24,32,40,48], rowY=[by+18,by+30];
    for(var r=0;r<2;r++) for(var i=0;i<6;i++) _glyph(ctx,bx+cols[i],rowY[r],pat[r*6+i],c);
  }
  function drawPlaque(ctx,bx,by,style){                                      // WIDE landscape tablet (~1.7 tiles) covered in hieroglyphs
    if(style==='carve'){                                                     // wide recess cut INTO the wall (theme material) + dark carved glyphs
      var gc=[Math.round(SW.dk[0]*0.5),Math.round(SW.dk[1]*0.5),Math.round(SW.dk[2]*0.5)];
      rect(ctx,bx+2,by+12,54,32,SW.dk); rect(ctx,bx+4,by+14,50,28,SW.base);  // recess mouth + panel face (wall material)
      hline(ctx,bx+2,bx+54,by+12,SW.dk); vline(ctx,bx+2,by+12,by+42,SW.dk);  // top/left rim shadow (carved-in)
      hline(ctx,bx+4,bx+54,by+42,SW.lt); vline(ctx,bx+54,by+14,by+42,SW.lt); // bottom/right lit interior
      _plaqueGlyphs(ctx,bx,by,gc);                                           // dark carved hieroglyphs
      var B=[214,172,100]; px(ctx,bx+4,by+14,B); px(ctx,bx+52,by+14,B); px(ctx,bx+4,by+40,B); px(ctx,bx+52,by+40,B); // bronze corner studs
    } else {                                                                 // wide LIGHT stone tablet mounted on the wall (stands out) + dark carved glyphs
      var ST=[208,188,148], STD=[150,128,92], STL=[232,216,182], FR=[118,84,40], FRL=[188,142,68], SH=[14,10,18], GLY=[86,60,28];
      rect(ctx,bx+6,by+18,54,30,SH);                                         // drop shadow
      rect(ctx,bx+2,by+12,56,34,FR); rect(ctx,bx+2,by+12,56,4,FRL);          // bronze frame + lit top
      rect(ctx,bx+6,by+16,48,26,ST); rect(ctx,bx+6,by+16,48,2,STL); hline(ctx,bx+6,bx+52,by+40,STD); // stone face + lit top + shaded bottom
      _plaqueGlyphs(ctx,bx,by,GLY);                                          // dark carved hieroglyphs
      px(ctx,bx+4,by+14,FRL); px(ctx,bx+56,by+14,FRL); px(ctx,bx+4,by+42,FRL); px(ctx,bx+56,by+42,FRL); // corner rivets
    }
  }
  /* ================================================================================
     ACT-1 DUNGEON FLOORS — semantic map-data override + baked-art blit
     2026-08-03. Owner chose option (a): bring the GENERATED floors into the runtime,
     then blit the matching pre-rendered art. Scope is owner-set to the three dungeons
     whose generated floor count matches the bundle's declared `floors` exactly:
     coastalReef 3/3, sunkenCellar 3/3, whisperingWoodsCave 3/3. mistyGrotto (bundle 5
     vs generated 3) and crystalCave (bundle 5 vs generated 6, colored-keys puzzle,
     "never modify Crystal Cave") stay on the engine's procedural maps.

     WHY THIS WORKS — scene.mapData is the single collision AND layout seam. The engine's
     canMove() indexes this.mapData[y][x] directly and takes its bounds from mapData, and
     loadMap() derives effectiveWidth/effectiveHeight FROM mapData before calling the
     (idempotent) renderMap(). So swapping mapData inside a loadMap wrapper carries
     collision, tile sprites, camera and minimap together. Dungeon transitions are
     TILE-VALUE driven (6=up/exit, 9=down, 11=boss warp), never coordinate driven, so a
     34x29 map is a supported shape even though the config still declares 100x100.

     FALLBACK-SAFE, like the terrain material renderer: if the JSON 404s nothing is
     overridden, and if a floor's art PNG is missing the procedural draw still runs.
     ================================================================================ */
  /* 2026-08-06, owner: mistyGrotto ("Darkfang Grotto") JOINS the scope, and it is the first entry
     whose generated floor count does NOT match the bundle's declared one -- 3 authored against
     `floors: 5`. That mismatch is exactly why it was held back on 2026-08-03, and the reason it
     can be admitted now is that the miss is already handled rather than newly risked:

       * a1dFloorFor() returns null for any floor the JSON does not carry, so B4F and B5F simply
         keep the engine's procedural map, as every mistyGrotto floor does today. Nothing regresses
         on them; B1F-B3F gain the baked floor and art.
       * a1dArtFor() is gated on the same lookup, so no art is blitted onto a procedural floor.
       * the shape change at the B3F -> B4F stairs (a 46x40 baked floor handing over to a
         procedural 100x100) is carried by a1dRescueHero, which reads bounds from scene.mapData
         and no longer needs generated data -- the same guard added on 2026-08-03 precisely so
         mistyGrotto and crystalCave could be entered at all.

     It is the Act 1 BOSS dungeon (the Giant Toad unseals Crystal Cave) and shipped NO baked art,
     so it paid the full procedural cost on every entry. crystalCave stays out: 6 generated against
     a declared 5, plus the coloured-keys puzzle and a standing "never modify Crystal Cave". */
  var A1D_MAPS={coastalReef:1,sunkenCellar:1,whisperingWoodsCave:1,mistyGrotto:1};
  // generated asset kind -> engine tile id. Blocking-by-design in the engine's dungeon
  // branch: 4 chest, 7 boss, 14 save, 18 sign/plaque. Walkable: 0 floor, 6 up/exit, 9 down.
  var A1D_TILE={mouth:6,stairsUp:6,stairsDown:9,chest:4,boss:7,save:14,sign:18,torch:0};
  var A1D_BLOCK={1:1,4:1,5:1,7:1,14:1,18:1,23:1,28:1};                      // mirrors canMove()'s dungeon branch
  var a1dFloors=null, a1dAsked=false, a1dPatched=false, a1dKey=null, a1dChanged=false;
  function a1dFetch(){                                                      // one lazy request; silence is a valid outcome
    if (a1dAsked) return; a1dAsked=true;
    try{ var r=new XMLHttpRequest(); r.open('GET','act1-dungeon-floors.json',true);
      r.onload=function(){ try{ if(r.status>=200&&r.status<300) a1dFloors=(JSON.parse(r.responseText)||{}).floors||null; }catch(e){} };
      r.send();
    }catch(e){}
  }
  function a1dFloorFor(scene){                                              // the generated floor for this scene, or null
    if(!a1dFloors||!scene||!A1D_MAPS[scene.currentMapId]) return null;
    return a1dFloors[scene.currentMapId+'-f'+(scene.currentFloor||1)]||null;
  }
  function a1dTiles(fl){                                                    // rows ('#'=rock) + assets -> engine tile ints
    var t=[],y,x,row,src=fl.rows;
    for(y=0;y<fl.height;y++){ row=[]; for(x=0;x<fl.width;x++) row.push(src[y].charAt(x)==='#'?1:0); t.push(row); }
    var a=fl.assets||[];                                                    // assets are authoritative: 'S' is sign on f1 but save on the boss floor
    for(var i=0;i<a.length;i++){ var v=A1D_TILE[a[i].kind]; if(v===undefined) continue;
      if(t[a[i].y]&&t[a[i].y][a[i].x]!==undefined) t[a[i].y][a[i].x]=v; }
    return t;
  }
  // The engine replays persisted progress onto mapData INSIDE loadMap (looted chest 4->8, defeated
  // boss 7->10/12). Our swap lands after that, so without this a looted chest returns closed and a
  // dead boss's marker comes back on every re-entry. Chests are replayed from the flags directly
  // (our chest coordinates differ from the engine's); the boss outcome is read back off the map the
  // engine just built, so we mirror its decision instead of re-deriving bossId and connection count.
  function a1dReplayProgress(scene,fl,tiles,prev){
    var gs=window.__GAME_STATE__, flags=gs&&gs.player&&gs.player.state&&gs.player.state.storyFlags;
    var id=scene.currentMapId, f=scene.currentFloor||1, y,x;
    if(flags) for(y=0;y<tiles.length;y++) for(x=0;x<tiles[y].length;x++)
      if(tiles[y][x]===4 && flags['chest.'+id+'.f'+f+'.'+x+'.'+y]) tiles[y][x]=8;
    if(f!==fl.totalFloors || !prev || !prev.length) return;                 // boss lives on the last floor only
    var has7=false, warp=0, r,c,row;
    for(r=0;r<prev.length;r++){ row=prev[r]; if(!row) continue;
      for(c=0;c<row.length;c++){ if(row[c]===7) has7=true; else if(row[c]===10||row[c]===12) warp=row[c]; } }
    if(has7) return;                                                        // boss still alive -> keep our marker
    warp=warp||10;
    for(y=0;y<tiles.length;y++) for(x=0;x<tiles[y].length;x++) if(tiles[y][x]===7) tiles[y][x]=warp;
  }
  function a1dApply(scene){                                                 // swap mapData; the engine re-derives everything else
    var fl=a1dFloorFor(scene); if(!fl) return false;
    var tiles=a1dTiles(fl);
    a1dReplayProgress(scene,fl,tiles,scene.mapData);                        // read progress off the engine's map BEFORE we drop it
    scene.mapData=tiles;
    scene.effectiveWidth=fl.width; scene.effectiveHeight=fl.height;         // loadMap already ran; re-derive from OUR map
    scene.renderMap();                                                      // idempotent: destroys tileLayer, rebuilds tileGrid
    a1dKey=scene.currentMapId+'-f'+(scene.currentFloor||1);
    a1dChanged=true;                                                        // force updateDng past its window-key cache
    return true;
  }
  // Wrap loadMap once, on the SCENE INSTANCE -- not on the prototype.
  // act1-hifi/adapter.js patchScene() installs its own `scene.loadMap` OWN property
  // (preservedAct1LoadMap) that captures the prototype method at patch time. It runs long before
  // this file ever sees a dungeon, so a prototype wrapper is SHADOWED and never called: the Act-1
  // floor was therefore never swapped in during loadMap, the engine's own 100x100 sunkenCellar map
  // survived the whole entry, and findDungeonEntrance dropped the hero at (50,1) -- 1176 px east of
  // the real 26-cell floor. The dungeon canvas drew fine; the depth-8 fog, centred on the off-map
  // hero, was fully opaque, so the entry frame was BLACK until a step re-derived hero.x/y.
  // Wrapping the instance composes with the adapter whichever patch lands first.
  function a1dInstall(scene){
    if(a1dPatched || !scene || scene.__a1dPatched) return;
    if(typeof scene.loadMap!=='function') return; a1dPatched=true; scene.__a1dPatched=true;
    var orig=scene.loadMap;
    scene.loadMap=function(id){
      var r=orig.apply(this,arguments);
      // AFTER the original: every caller sets heroTileX/Y *after* loadMap returns and
      // reads this.mapData to do it (findDungeonEntrance, the tile-9 scan in __floor_up__,
      // the tile-7 scan in __boss_warp__), so they land on OUR map for free.
      try{ a1dApply(this); }catch(e){ if(window.__DQ_DEBUG__) console.log('a1 dng apply '+e+(e&&e.stack||'')); }
      return r;
    };
  }
  // ==============================================================================================
  //  THE OVERWORLD DOES NOT NEED 128,000 TILE IMAGES
  // ==============================================================================================
  // The engine's renderMap() (dist/assets/index-BhoGQRaA.js:78571, the tile loop at :78583) builds
  // one Phaser Image per cell. On the 320x400 overworld that is 128,000 display objects in a single
  // Container, and the renderer walks that Container every frame. It is the block SMOOTH-4 reports,
  // and it is paid again on every return to the overworld.
  //
  // NOT ONE OF THOSE 128,000 IMAGES IS EVER SEEN. This is measured, not argued. The container sits
  // at depth 0; `dqterrain` -- the baked Act 1 chunk art this file blits -- sits at depth 1 and
  // covers the whole camera window, and `dqcanopy` sits at depth 11 above that. Hiding the whole
  // tileLayer at runtime and screenshotting the canvas produces a BYTE-IDENTICAL frame: measured
  // on the UNMODIFIED build, canvas sha e70693625e500515 both with tileLayer shown and with it
  // hidden, and e70693625e500515 again when restored, with the hero's animation and all tweens
  // paused so that neither could mask nor manufacture a difference.
  // Of the 128,000, only 588 are even flagged visible at a time -- the culling window -- and all
  // 588 are painted over.
  //
  // SCOPE: `currentMapId === 'overworld'` AND the map is the 320x400 Act 1 plate. Nothing else.
  //   - NOT via this file's own isOverworld(), which regex-matches /Isles|Peaks|Realm|Temple/ and
  //     therefore also claims sunkenTempleDungeon, sunkenTempleVillage, sunkenTempleIsle,
  //     stormreachIsles, frostfallPeaks and twilightRealm. Those are real dungeons and a real
  //     town. Skipping their tiles would render them BLANK, because nothing draws a dqterrain
  //     over them -- the exact failure this narrow predicate exists to prevent. (That regex is a
  //     pre-existing misclassification, documented in docs/SMOOTH-ROUND-1-REFUTATION.md section 2;
  //     it is not this change's to fix and this change does not depend on it.)
  //   - NOT via scene.cullingEnabled, which the engine assigns INSIDE renderMap and which
  //     therefore still holds the PREVIOUS map's value when this wrapper is consulted.
  //   - The 400x320 shape assertion is the same identity test act1-world-map.js's usable() uses.
  //     Towns are 16x16, the Act 1 dungeons 26-30 cells, crystalCave 100x100: none can match.
  //
  // WHAT THE ORIGINAL DOES THAT THIS MUST STILL DO: destroy the previous tileLayer, install a
  // fresh empty Container, destroy npcSprites and forestMazeFireflies and reset both arrays, reset
  // tileGrid, set cullingEnabled, and reset the cull latches. The two tails it omits are
  // unreachable here by construction -- applyHiddenWallVisibility() is gated on type==='dungeon'
  // and the tripwire branch on currentMapId==='banditHideout'.
  //
  // tileGrid stays an ARRAY OF EMPTY ROWS rather than []. Three things read it structurally:
  // tick()'s own `!scene.tileGrid.length` guard and __DQ_TILES__.ready() would both bail on a
  // zero-length grid and no terrain would ever be drawn; and the engine's updateVisibleTiles()
  // early-returns on it. Empty rows keep every one of those alive while making the loops no-ops --
  // every unguarded tileGrid read in the bundle is bounded by a ROW's length (`C < tileGrid[m].length`,
  // `u < (tileGrid[0]?.length ?? 0)`), never by mapData's, so an empty row is read zero times. The
  // guarded reads (`tileGrid[y]?.[x] &&`, `if(!tileGrid[m.y]?.[m.x]) continue`) short-circuit.
  // act1-world-map.js:291 reads tileGrid[0][0].displayWidth for the tile size and falls back to
  // 48, which is exactly TILE -- so its fallback is not a degraded path, it is the same number.
  //
  // The three `tileLayer.getAt(index)` call sites in the bundle would throw on an empty container.
  // None is reachable from the overworld: tryOpenTreasure returns false for
  // type==='overworld'|'portal-overworld' before it indexes; the wake() boss-warp site needs
  // pendingBossId, which only tryBossInteract sets and which returns false unless
  // type==='dungeon'; the third is sunkenTempleDungeon's exit unseal.
  var owrPatched=false;
  function owrPlateOverworld(scene){
    try{
      if(scene.currentMapId!=='overworld') return false;
      var m=scene.mapData;
      return !!(m && m.length===400 && m[0] && m[0].length===320);
    }catch(e){ return false; }
  }
  function owrInstall(scene){
    if(owrPatched || !scene || scene.__owrPatched) return;
    if(typeof scene.renderMap!=='function') return; owrPatched=true; scene.__owrPatched=true;
    var orig=scene.renderMap;
    scene.renderMap=function(){
      if(!owrPlateOverworld(this)) return orig.apply(this,arguments);   // towns, dungeons, Act 2+: untouched
      var i;
      if(this.tileLayer){ try{ this.tileLayer.destroy(); }catch(e){} }
      this.tileLayer=this.add.container(0,0);
      for(i=0;i<this.npcSprites.length;i++){ try{ this.npcSprites[i].destroy(); }catch(e){} }
      this.npcSprites=[];
      for(i=0;i<this.forestMazeFireflies.length;i++){ try{ this.forestMazeFireflies[i].destroy(); }catch(e){} }
      this.forestMazeFireflies=[];
      this.tileGrid=[];
      for(i=0;i<this.mapData.length;i++) this.tileGrid[i]=[];
      this.cullingEnabled=true;            // the engine sets this for type 'overworld'; isOverworld() reads it
      this.lastCullCamX=-Infinity; this.lastCullCamY=-Infinity;
    };
  }
  // Hero rescue. One guard covers every entry path instead of wrapping four of them. The
  // case that actually needs it: entering from the overworld uses the connection's fixed
  // toX/toY (50,0 at the declared 100x100), which is off the edge of a 26x26 floor.
  // 2026-08-03: this used to `return` when a1dFloorFor() found nothing, i.e. for every dungeon
  // OUTSIDE the three generated ones. That left mistyGrotto ("Darkfang Grotto" -- the Act 1 BOSS
  // dungeon, whose Giant Toad sets the flag that unseals Crystal Cave) and crystalCave with no
  // guard at all, and their connections carry the same fixed toX/toY the comment above describes.
  // Walking in from the overworld therefore dropped the hero off the edge and the screen went
  // BLACK -- verified on device: the map itself renders fine when entered at an interior cell, so
  // it was never the map. Act 1 was uncompletable. The bounds now come from scene.mapData, which
  // the engine has already built for ANY dungeon, so the guard no longer needs generated data.
  // Still called only from the kind==='dng' branch, so the overworld and towns are untouched.
  // ARRIVING ON A FLOOR IS NOT THE SAME AS RECOVERING ON ONE, AND CONFLATING THEM SKIPPED AN
  // ENTRANCE. Everything below has two customers: a player who has just been dropped on a floor by
  // the engine's fixed entry coordinate, and a player whose SAVED position rounded onto an illegal
  // cell centre. The second wants the smallest possible nudge -- teleporting her across the map on
  // reload was a real bug. The first wants the authored anchor, always.
  //
  // They were told apart by distance, "nudge if within 2 cells, else anchor", and that reads the
  // wrong thing. coastalReef is 66x53, so the engine's leftover landing of (50,1) is INSIDE its
  // map -- rock, so the rescue fired, but the 2-cell nudge found legal ground at (49,2) and
  // returned. The player entered the dungeon sixteen cells from its mouth, in a corner she had no
  // way to recognise, which is exactly what the owner meant by build 65's "hard block the player
  // from entering the dungeon from an unauthorized location". The other three only escaped it
  // because (50,1) is off their maps entirely.
  //
  // So tell them apart by WHAT HAPPENED instead: the floor key changing means she has just arrived.
  // While arriving, the nudge is skipped and the anchor wins; the flag clears the moment she is
  // standing legally, after which recovery behaves exactly as before.
  var a1dRescueKey=null, a1dArriving=false;
  function a1dRescueHero(scene){
    if(!scene.mapData||!scene.mapData.length) return;
    var a1dKeyNow=scene.currentMapId+'-f'+(scene.currentFloor||1);
    if(a1dKeyNow!==a1dRescueKey){ a1dRescueKey=a1dKeyNow; a1dArriving=true; }
    // WHERE THE MASK IS THE AUTHORITY, THIS GUARD IS NOT. Its legality test is
    // `!A1D_BLOCK[mapData[y][x]]`, and A1D_BLOCK contains 1 = rock -- but the whole point of the
    // continuous mover is that 35 cells a floor are `#` on the lattice and open in the picture.
    // Left alone this tick (80 ms) would teleport the player back to the cave mouth the instant
    // she stepped into one of them.
    // a1mFree/a1mUnstick take the SPRITE position and test her SOLES under it, so this guard needs
    // no adjustment for the foot-contact fix -- but it does fire more often, because a cell centre
    // whose southern neighbour is rock is no longer a legal place to stand. Measured across the
    // three floors: 742 of 754 reportable cells are legal as placed, the rest recover with a nudge
    // of at most 28 px, inside the 2-cell bound, so none of them reach the anchor teleport below.
    try{ var mm=a1mFor(scene);
         if(mm && scene.hero){
           if(a1mFree(scene,mm,scene.hero.x,scene.hero.y)){ a1dArriving=false; return; }
         }
         // The nudge is for RECOVERY only; on arrival it is what skipped coastalReef's entrance.
         if(mm && scene.hero && !a1dArriving){
           // She is not standing legally -- but the engine places by CELL, and a cell CENTRE is a
           // lattice coordinate the art never promised was open. Reloading a save made in cell
           // (7,24) put her on its centre, which is inside the rock lip, and the anchor rescue
           // below then threw her across the map to the stairs (seen on device 2026-08-05).
           // A local nudge onto the nearest floor the mask knows about is the right answer; the
           // anchor teleport is for an entry coordinate off the map, so bound this to 2 cells and
           // let anything further fall through to it.
           var uu=a1mUnstick(scene,mm,scene.hero.x,scene.hero.y);
           if(uu && Math.abs(uu.x-scene.hero.x)<=TILE*2 && Math.abs(uu.y-scene.hero.y)<=TILE*2){
             scene.hero.x=uu.x; scene.hero.y=uu.y;
             scene.heroTileX=(uu.x/TILE)|0; scene.heroTileY=(uu.y/TILE)|0;
             try{ if(typeof scene.updatePosition==='function') scene.updatePosition();
                  if(typeof scene.updateCamera==='function') scene.updateCamera();
                  if(scene.fogEnabled&&typeof scene.updateFogVisibility==='function')
                    scene.updateFogVisibility(); }catch(e){}
             return;
           }
         } }catch(e){}
    // AND IT IS NOT THE AUTHORITY UNTIL IT ARRIVES. The mask is fetched asynchronously, so for
    // the first frames of a floor the test below is the only one running -- and it teleported a
    // save made in cell (7,24) to the stairs on reload, verified on device 2026-08-05, because
    // (7,24) is `#` to the lattice. Defer while the request is still outstanding, but ONLY for a
    // hero already inside the map: the case this guard exists for is an entry coordinate off the
    // edge of it (the overworld connection's fixed toX/toY), and that one cannot wait.
    try{ if(a1mPending(scene) && !a1dArriving){
      var pm=scene.mapData, ph=pm.length, pw=(pm[0]||[]).length;
      if(scene.heroTileX>=0 && scene.heroTileX<pw && scene.heroTileY>=0 && scene.heroTileY<ph)
        return;
    } }catch(e){}
    var fl=a1dFloorFor(scene);                                              // null outside the 3 in-scope dungeons
    var md=scene.mapData, H=md.length, W=(md[0]||[]).length;
    if(!W) return;
    var x=scene.heroTileX,y=scene.heroTileY;
    if(y>=0&&y<H&&x>=0&&x<W&&!A1D_BLOCK[md[y][x]]){ a1dArriving=false; return; }  // already legal
    if(!fl){
      // No authored anchors to aim for. Clamp the engine's intended landing back inside the map
      // and take the NEAREST walkable cell to it -- landing beside the intended mouth beats
      // teleporting to whatever the first walkable cell in scan order happens to be.
      var qx=Math.max(0,Math.min(W-1,x)), qy=Math.max(0,Math.min(H-1,y)), best=-1,bx=-1,by=-1;
      for(var sy=0;sy<H;sy++) for(var sx=0;sx<W;sx++){
        if(A1D_BLOCK[md[sy][sx]]) continue;
        var dd=(sx-qx)*(sx-qx)+(sy-qy)*(sy-qy);
        if(best<0||dd<best){ best=dd; bx=sx; by=sy; }
      }
      if(bx<0) return;                                                      // nothing walkable -> leave the engine alone
      scene.heroTileX=bx; scene.heroTileY=by;
      try{ if(scene.hero){ scene.hero.x=bx*TILE+TILE/2; scene.hero.y=by*TILE+TILE/2; }
           if(typeof scene.updatePosition==='function') scene.updatePosition();
           if(typeof scene.updateCamera==='function') scene.updateCamera();
           if(scene.fogEnabled&&typeof scene.updateFogVisibility==='function') scene.updateFogVisibility();
      }catch(e){ if(window.__DQ_DEBUG__) console.log('a1 dng hero '+e); }
      return;
    }
    W=fl.width; H=fl.height;
    var want=(scene.currentFloor||1)>1?['stairsUp','stairsDown','mouth']:['mouth','stairsUp','stairsDown'];
    var a=fl.assets||[],tx=-1,ty=-1,anchor=null,i,j;
    for(j=0;j<want.length&&tx<0;j++) for(i=0;i<a.length;i++) if(a[i].kind===want[j]){ tx=a[i].x; ty=a[i].y; anchor=want[j]; break; }
    if(tx<0){ for(ty=0;ty<H&&tx<0;ty++) for(i=0;i<W;i++) if(!A1D_BLOCK[scene.mapData[ty][i]]){ tx=i; break; } }
    if(tx<0) return;                                                        // nothing walkable at all -> leave the engine alone
    if(A1D_BLOCK[scene.mapData[ty][tx]]){                                   // stairs are walkable, but a chest/sign anchor is not
      var n=[[0,1],[0,-1],[1,0],[-1,0]],k;
      for(k=0;k<4;k++){ var nx=tx+n[k][0],ny=ty+n[k][1];
        if(ny>=0&&ny<H&&nx>=0&&nx<W&&!A1D_BLOCK[scene.mapData[ny][nx]]){ tx=nx; ty=ny; break; } }
    }
    scene.heroTileX=tx; scene.heroTileY=ty; a1dArriving=false;
    // SHE ARRIVES FACING INTO THE DUNGEON, NOT WHICHEVER WAY SHE LAST WALKED ON THE OVERWORLD.
    // Owner, build 65: "entering into dungeons should always position the players in the entrance
    // direction or hard block the player from entering the dungeon from an unauthorized location."
    // Position was already right -- every mouth is the dead end of a one-cell slot and this rescue
    // lands her on it -- but nothing ever set `heroDir`, so her facing was whatever the last step
    // outside happened to leave. It looked correct only by accident: three of the four mouths are
    // approached from the south, so walking up into the door left her facing up, and coastalReef's
    // is approached from the east, which left her facing LEFT into the wall of a westward slot.
    // The direction into the dungeon is not a constant -- it is wherever the slot's open neighbour
    // is -- so read it off the map rather than hard-coding one per dungeon.
    if(anchor==='mouth'){
      var dirs=[[0,1,0],[-1,0,1],[1,0,2],[0,-1,3]],dk,nd=-1;   // dx,dy,heroDir: 0 down 1 left 2 right 3 up
      for(dk=0;dk<4;dk++){ var ax=tx+dirs[dk][0],ay=ty+dirs[dk][1];
        if(ay>=0&&ay<H&&ax>=0&&ax<W&&!A1D_BLOCK[scene.mapData[ay][ax]]){ nd=dirs[dk][2]; break; } }
      if(nd>=0){ scene.heroDir=nd;
        // heroDir alone is state, not a picture: the bundle draws the hero with
        // `setFrame(this.heroDir * 3)` and only on a move. Set the frame too, or she stands at the
        // mouth facing the way she came until her first step.
        try{ if(scene.hero&&typeof scene.hero.setFrame==='function') scene.hero.setFrame(nd*3); }catch(e){}
      }
    }
    try{ if(scene.hero){ scene.hero.x=tx*TILE+TILE/2; scene.hero.y=ty*TILE+TILE/2; }
         if(typeof scene.updatePosition==='function') scene.updatePosition();
         if(typeof scene.updateCamera==='function') scene.updateCamera();
         if(scene.fogEnabled&&typeof scene.updateFogVisibility==='function') scene.updateFogVisibility();
    }catch(e){ if(window.__DQ_DEBUG__) console.log('a1 dng hero '+e); }
  }
  /* ================================================================================
     ACT-1 DUNGEON — CONTINUOUS MOVEMENT AGAINST THE ART'S OWN COLLISION SHAPE
     2026-08-05. Owner, having played Sunken Cellar B3F: "the player does not walk
     smoothly and the user blockers are not synced with the visual design and there is
     underlying block structures ... if the dungeon is fundamentally build on square
     design and engine, this is a major problem." He chose, of three options, to replace
     tile-stepping with continuous movement against a shape derived FROM THE ART.

     THE TWO COMPLAINTS SHARE ONE ROOT. The floors are a square lattice of `#`/`.`, but
     the picture is not: `render_dungeon_material_map.py` blurs that lattice
     (`f = blur(up, px*0.34)`) and then WARPS the boundary off it entirely
     (`fw = clip(f + warp*0.42*gate)`) — which is what makes the cave organic, and the
     owner has locked that look (docs/DUNGEON-EDGE-STYLE-LOCK.md). Nothing reconciled the
     two, so the player saw open ground and was stopped by an invisible square, and moved
     in 48 px hops besides.

     WHAT MAKES THE BLOCKER AND THE EDGE AGREE BY CONSTRUCTION. `<floor>-walk.png` is that
     same `fw` field, thresholded at the same 0.5 that decides every pixel of the render,
     emitted at the shipped art's own 48 px/cell by `--emit-mask` through the SHARED
     `floor_field()`. There is one boundary and two consumers of it, so they cannot drift.
     Measured on the three Sunken Cellar floors: the mask separates the picture's floor
     and rock populations at 2.7-3.0 sigma, and it hands the player back 15-18 cells a
     floor that the tile grid blocked and the picture leaves open.

     THE SHAPES THAT ARE STILL SQUARE, DELIBERATELY. A chest, a boss marker, a plaque and
     a save crystal are OBJECTS standing on a cell, not terrain, and walking into one is
     how the engine opens it. Those keep their tile blocker (A1M_PROP) and the bump is
     routed to the engine's own handler. Rock (tile 1) is NOT in that set — rock is the
     thing the mask now owns.

     EVERYTHING DOWNSTREAM STILL READS TILES. heroTileX/heroTileY are re-derived from the
     continuous position every frame, so encounters, checkTransition, the compass, the
     minimap and the save format (player.position.x/y, SAVE_VERSION 4) are untouched.

     FALLBACK-SAFE, like every other layer here: no mask PNG, no continuous movement, and
     the engine's step tween runs exactly as it does today. Only the three Sunken Cellar
     floors ship one.
     ================================================================================ */
  // Movement constants, taken from the town's own collision authority rather than invented:
  // portSapphire-walkable.json carries actorFootRadius 4 and maxSubstep 2 at 16 world px per
  // cell, i.e. 0.25 and 0.125 of a cell. At the dungeon's 48 px/cell that is 12 and 6.
  var A1M_FOOT=12;            // world px the hero's GROUND CONTACT POINT keeps clear of rock
  var A1M_STEP=6;             // max world px per collision substep (so thin rock cannot be tunnelled)
  var A1M_CH=3;               // chamfer unit: the distance field counts in THIRDS of a pixel
  // Speed is the one number the town could not settle, because its camera and its cell are a
  // different size. The engine's step was 48 px per 150 ms tween = 320 px/s average with a
  // Sine.easeInOut peak half again as high. 260 px/s (5.4 cells/s) reads as the same pace once
  // the stop-start between cells is gone. Tunable live for review: window.__A1_DNG_SPEED__.
  var A1M_SPEED=260;
  function a1mSpeed(){ return (typeof window.__A1_DNG_SPEED__==='number')?window.__A1_DNG_SPEED__:A1M_SPEED; }
  /* WALK CADENCE IS A DESIGN LOCK, NOT A FREE PARAMETER. public/act1-hifi/manifest.json carries
     designLocks.walkPoseMs = 125 and the town renderer (act1-hifi/town.html) runs the four-pose
     cycle [0,1,0,2] at exactly that rate. The first continuous-movement build flipped between
     poses 1 and 2 every 13 px of MANHATTAN travel, which measured 50 ms/pose walking cardinally
     and 36 ms diagonally -- 2.5x the lock, 3x the tile-step build it replaced, and 41% faster on
     the diagonal purely because |sx|+|sy| overstates a diagonal step by sqrt(2). Tiny frantic legs
     under a gliding body, and the two surfaces of the same act disagreeing about her walk.
     So: distance is EUCLIDEAN, the cycle is the town's, and the flip distance is DERIVED from the
     speed in force (260 px/s * 0.125 s = 32.5 px) rather than written down, so retuning speed --
     including live, through __A1_DNG_SPEED__ -- keeps the cadence at the locked 125 ms. */
  var A1M_POSE=[0,1,0,2];     // hero-override.js frame within the direction: 0 idle, 1 and 2 the walk poses
  var A1M_POSE_MS=125;        // designLocks.walkPoseMs
  // The engine's dungeon blockers MINUS rock. Rock is what the mask now owns; these are objects
  // standing on a cell, and bumping one is how the engine interacts with it.
  var A1M_PROP={4:1,5:1,7:1,14:1,18:1,23:1,28:1};
  var a1mMasks={}, a1mReq={}, a1mState=null;

  // Chamfer-3-4 distance from every open pixel to the nearest rock, in thirds of a pixel.
  // Two sequential sweeps over ~2.3 M pixels; measured under 40 ms on the sim, once per floor.
  // A distance FIELD rather than a pre-eroded mask because it also gives the unstick below a
  // direction to walk in, and it lets A1M_FOOT be retuned without re-baking anything.
  function a1mBuild(im){
    var W=im.width, H=im.height, n=W*H;
    var cv=document.createElement('canvas'); cv.width=W; cv.height=H;
    var g=cv.getContext('2d',{willReadFrequently:true}); if(!g) return null;
    g.drawImage(im,0,0);
    var d=g.getImageData(0,0,W,H).data, dist=new Uint16Array(n), INF=60000, i,x,y,v;
    for(i=0;i<n;i++) dist[i]=(d[i*4]>127)?INF:0;                            // white = walkable floor
    d=null;
    for(y=0;y<H;y++){ var r=y*W;
      for(x=0;x<W;x++){ i=r+x; v=dist[i]; if(!v) continue;
        if(y>0){ if(dist[i-W]+3<v)v=dist[i-W]+3;
                 if(x>0    && dist[i-W-1]+4<v)v=dist[i-W-1]+4;
                 if(x<W-1  && dist[i-W+1]+4<v)v=dist[i-W+1]+4; }
        if(x>0 && dist[i-1]+3<v)v=dist[i-1]+3;
        dist[i]=v; } }
    for(y=H-1;y>=0;y--){ var r2=y*W;
      for(x=W-1;x>=0;x--){ i=r2+x; v=dist[i]; if(!v) continue;
        if(y<H-1){ if(dist[i+W]+3<v)v=dist[i+W]+3;
                   if(x<W-1 && dist[i+W+1]+4<v)v=dist[i+W+1]+4;
                   if(x>0   && dist[i+W-1]+4<v)v=dist[i+W-1]+4; }
        if(x<W-1 && dist[i+1]+3<v)v=dist[i+1]+3;
        dist[i]=v; } }
    // ox/oy: the field's origin in WORLD px. A dungeon mask spans its whole floor and is therefore
    // world-aligned; the overworld field below is a moving window and is not. Every sampler
    // subtracts it, so at 0 the dungeon path is arithmetically unchanged.
    return { W:W, H:H, ox:0, oy:0, dist:dist };
  }
  function a1mMaskFor(key){
    if(a1mMasks[key]!==undefined) return a1mMasks[key];
    if(!a1mReq[key]){ a1mReq[key]=true;
      var im=new Image();
      im.onload=function(){ try{ a1mMasks[key]=a1mBuild(im)||null; }catch(e){ a1mMasks[key]=null;
        if(window.__DQ_DEBUG__) console.log('a1 mask build '+e); } };
      im.onerror=function(){ a1mMasks[key]=null; };                          // no mask -> engine steps
      im.src='act1-dungeon-art/'+key+'-walk.png';
    }
    return undefined;                                                        // still loading
  }
  function a1mKeyFor(scene){
    return a1dFloorFor(scene) ? scene.currentMapId+'-f'+(scene.currentFloor||1) : null;
  }
  // The mask must describe THIS floor at THIS scale or it is not an authority over it.
  function a1mFor(scene){
    if(window.__A1_DNG_CONTINUOUS__===false) return null;                    // review escape hatch
    var k=a1mKeyFor(scene); if(!k) return null;
    var m=a1mMaskFor(k); if(!m) return null;
    var md=scene.mapData; if(!md||!md.length) return null;
    if(m.W!==(md[0]||[]).length*TILE || m.H!==md.length*TILE) return null;
    return m;
  }
  // True while this floor's mask has been ASKED FOR and has not resolved either way. Distinct
  // from "no mask" (resolved to null -> the engine's tile rules are correct and final).
  function a1mPending(scene){
    var k=a1mKeyFor(scene);
    return !!k && a1mMaskFor(k)===undefined;
  }
  function a1mTileAt(scene,x,y){
    var row=scene.mapData[(y/TILE)|0]; return row?row[(x/TILE)|0]:undefined;
  }
  /* ---- WHERE SHE ACTUALLY TOUCHES THE FLOOR --------------------------------------------------
     The hero sprite is drawn with origin (0.5,0.5) -- the frozen bundle's createHero does
     `.setOrigin(.5)` -- so hero.x/hero.y is the CENTRE of the frame, which lands about at her
     waist. Colliding there meant her SOLES were ~31 px south of the point being tested: with rock
     to the south she stopped when her waist was 12 px clear and her feet were ~19 px INSIDE the
     rock (owner, on device: "the player seems like they are walking above the red rim"), and with
     rock to the north she stopped a visible gap short of it. The mask is a picture of the FLOOR,
     so the point that must stay on it is the point that stands on it: (hero.x, hero.y + footDy).

     MEASURED FROM THE SHEET AT RUNTIME, never hardcoded. The walk sheet has already been re-cut
     once -- 48 px with the soles at row 47 (offset ~23 px), then the canonical native 64 px with
     the soles at row 62 -- and a constant would have gone silently stale at that cut while the
     collision quietly drifted back off her feet. So: bottom-most opaque row of the hero's own
     frame, taken relative to the frame centre and scaled by the sprite's runtime scale
     (hero-override.js's HERO_SCALE, itself live-tunable). 64 px frame, sole row 62, scale 1.0125
     => 30.9 px. Frame 0 specifically, so an animation pose can never make the contact point bob.
     window.__A1_DNG_FOOTDY__ overrides it for review; 0 restores the old centre collision. */
  var a1mSole={};                                                            // frame identity -> sole row offset, FRAME px
  function a1mSoleOffset(hero){
    var tex=hero.texture, fr=null;
    try{ fr=(tex&&tex.get)?tex.get(0):null; }catch(e){}
    if(!fr) fr=hero.frame;
    if(!fr) return null;
    var fw=fr.cutWidth||fr.width, fh=fr.cutHeight||fr.height;
    if(!fw||!fh) return null;
    var src=null;
    try{ src=(fr.source&&fr.source.image)?fr.source.image:(tex&&tex.getSourceImage?tex.getSourceImage():null); }catch(e){}
    if(!src||!src.width) return null;
    var key=(tex&&tex.key)+'|'+src.width+'x'+src.height+'|'+fr.cutX+','+fr.cutY+','+fw+'x'+fh;
    if(a1mSole[key]!==undefined) return a1mSole[key];
    var off=null;
    try{
      var cv=document.createElement('canvas'); cv.width=fw; cv.height=fh;
      var g=cv.getContext('2d',{willReadFrequently:true});
      if(g){
        g.drawImage(src, fr.cutX||0, fr.cutY||0, fw, fh, 0, 0, fw, fh);
        var d=g.getImageData(0,0,fw,fh).data, y,x;
        for(y=fh-1;y>=0&&off===null;y--) for(x=0;x<fw;x++)
          if(d[((y*fw)+x)*4+3]>8){ off=(y+0.5)-(fh/2); break; }              // centre of the sole row
      }
    }catch(e){ if(window.__DQ_DEBUG__) console.log('a1 sole '+e); }
    if(off===null) off=(fh-0.5)-(fh/2);                                      // unreadable: assume she fills the frame
    a1mSole[key]=off;
    return off;
  }
  function a1mFootDy(scene){
    if(typeof window.__A1_DNG_FOOTDY__==='number') return window.__A1_DNG_FOOTDY__;
    var hero=scene&&scene.hero; if(!hero||!hero.texture) return 0;
    var off=a1mSoleOffset(hero); if(off===null) return 0;
    var s=(typeof hero.scaleY==='number'&&hero.scaleY>0)?hero.scaleY:1;
    return off*s;
  }
  /* ---- CLEARANCE LEANS, BECAUSE THE SPRITE STANDS ON ITS FEET --------------------------------
     The mover collides at a POINT (her soles, per the sole-contact rule above) but the game draws
     a BILLBOARD standing on that point: 52 px of her is ABOVE it and up to 24 px either side. So
     one scalar clearance cannot mean one thing on screen. Rock a given distance SOUTH of her feet
     is rock her sprite can never be drawn over -- her body is north of her feet, away from it.
     Rock the same distance NORTH of her feet is rock her whole body is drawn over. The collider
     was treating those two as the same situation, and only one of them is a picture problem.

     WHAT THE OWNER ASKED FOR (2026-08-05): "bleeding into the shaded part of the walls is intended
     and i am fine with it. the problem i have is bleeding into the sides and to[p] of the walls".
     That is a split by WHICH PART OF THE ROCK she covers, and the renderer draws exactly those
     parts (render_dungeon_material_map.py, the HEIGHT block): a SHADED near FACE on the rock's
     south side, 0.46 of a cell = 21.9 world px tall, and the LIT TOP plane above and around it.
     Pixels of her over the shaded face read as standing in front of a wall and are wanted; pixels
     over the lit top read as clipping through it.

     MEASURED THAT WAY -- against what is DRAWN, not against the walkable mask -- the shipped mover
     put a mean 738 sprite px on the shaded face and 473 on the lit top when she stops against a
     wall to her north, 84 (E) / 60 (W) on the lit top beside her, and 13 north of her. The earlier
     "1.9 px/stop lateral, 0.0 top" reading was not measuring this: it classified rock from the
     walkable MASK and then split her pixels by HEIGHT ABOVE HER SOLES, which files everything from
     her hips up -- i.e. all of the lateral bleed -- under "reads as depth, correct". The mask is
     not the error; it agrees with the drawn rock boundary on 100.00% of pixels on all three floors.

     THE FIELD ALREADY KNOWS WHERE THE ROCK IS. Its gradient is the outward wall normal, the same
     one a1mSlide reads for the tangent -- no new field, no second authority that could drift.
     `ny > 0` is rock to the north (her body is over it: charge the most), `ny ~ 0` is rock beside
     her (her shoulders are over it: charge half), `ny < 0` is rock to the south (nothing of her can
     reach it: charge nothing). (1 + ny/|n|) / 2 is that lean, in one term.

     WHY A POSITION FUNCTION AND NOT A HEADING FUNCTION. Keying clearance on the direction she is
     WALKING would let a position be legal to arrive at and illegal to stand in, which is exactly
     how an anisotropic collider wedges someone in a corner. Keyed on the local normal it is a
     single number per pixel, so the legal region always contains the erosion by A1M_FOOT+A1M_LEAN
     and is always contained in the erosion by A1M_FOOT -- a well-formed region that a1mFree, the
     slide's lift and a1mUnstick all see identically. No new dead stops: measured below.

     WHY 4 AND NOT MORE. Removing the lit-top bleed OUTRIGHT is not a clearance problem at all: her
     head is 52 px above her soles and the shaded face is only 21.9 px tall, so her head clears the
     face onto the lit top for ANY clearance under 30 px, and 30 px is two and a half times today's
     and reads as a heroine who cannot touch a wall. The cave cannot pay for it either -- a UNIFORM
     18 orphans three authored assets. 4 is the point measured to halve the two numbers the owner
     named while leaving the one he wants alone: lit top 473->371 (N), 84->42 (E), 60->35 (W), and
     the shaded-face overlap he asked to keep at 709 of 738, i.e. 96% of it, her soles 16 px off a
     north wall instead of 12. Every standable cell centre, every authored asset and every engine
     spawn stays reachable on all three floors at this value. Tunable live for review, like the
     speed above: window.__A1_DNG_LEAN__.

     WHY NOT SIMPLY A1M_FOOT=16, WHICH IS THE OBVIOUS ONE-CHARACTER VERSION OF THIS. Measured, it
     is very slightly BETTER on overlap (lit top 35/29 E/W against this term's 42/35) and identical
     on cell reachability -- but it DOUBLES the number of held-push positions where she never moves
     at all, 23 against this term's 12 and the shipped collider's 11. That is the exact number the
     tangent-slide work was done to protect, and 7 px of mean overlap is not worth twice the places
     that feel stuck. The difference is the 4 px uniform also charges against rock SOUTH of her,
     which narrows passages while removing nothing from the picture -- the whole point of leaning
     the term rather than raising the scalar. */
  var A1M_LEAN=4;             // extra world px of clearance, scaled by how far NORTH the rock lies
  // Required clearance at a SOLE pixel, in the field's own thirds-of-a-pixel units.
  function a1mNeed(m,gx,gy){
    var base=A1M_FOOT*A1M_CH;
    var k=(typeof window.__A1_DNG_LEAN__==='number')?window.__A1_DNG_LEAN__:A1M_LEAN;
    if(!(k>0) || gx<1 || gy<1 || gx>=m.W-1 || gy>=m.H-1) return base;
    var i=gy*m.W+gx;
    var nx=m.dist[i+1]-m.dist[i-1], ny=m.dist[i+m.W]-m.dist[i-m.W];          // grows AWAY from rock
    var l=Math.sqrt(nx*nx+ny*ny);
    if(l<1e-6) return base;                                                  // flat field: no wall to read
    return base + k*A1M_CH*(1+ny/l)*0.5;         // 1 rock due north, 0.5 due east/west, 0 due south
  }
  // How far past her SOLES a1mBump has to probe to be sure it lands inside the tile that
  // actually stopped her, derived from the same numbers a1mNeed/a1mStep use rather than
  // guessed. Her resting distance from rock is NOT a flat A1M_FOOT: a1mNeed just above adds up
  // to A1M_LEAN*A1M_CH thirds (A1M_LEAN px) more when the rock is due north of her -- exactly
  // the geometry of walking straight into a sign, a chest or a boss marker -- and because
  // clearance is only re-checked once per A1M_STEP substep, the substep that finally gets
  // refused can leave her resting up to one more A1M_STEP short of that boundary. Worst case is
  // therefore A1M_FOOT + A1M_LEAN + A1M_STEP, plus 2px of slop.
  // MEASURED 2026-08-14 at Sunken Cellar B1F's plaque (21,21): the old `A1M_FOOT+2` (14px) probe
  // landed 1.3px short of the sign's own tile row and silently did nothing -- a straight,
  // due-north bump into an object undershoots by exactly the lean term this now accounts for.
  var A1M_BUMP_REACH = A1M_FOOT + A1M_LEAN + A1M_STEP + 2;
  /* ---- THE OVERWORLD'S SECOND AUTHORITY, AND WHY IT IS canMove ---------------------------------
     This mover replaced the engine's own tile stepping on the overworld (a1mStep now takes the
     field from a1mAnyFor, which falls through to owmFor). The engine's stepping consulted
     scene.canMove; this one did not, and canMove is not a formality -- act1-world-map.js WRAPS it,
     and that wrapper is where the owner's forest rule and the story gate live:

         if(... inside(x,y) && (tileAt(x,y)===3 || gateRestricted(x,y))) return false;

     So the moment movement stopped asking canMove, forest stopped blocking and the gate stopped
     gating, together, silently. The fix is to ask it again rather than to restate its rules here;
     a copy of a rule in a second file is the drift this whole section exists to remove.

     WHAT canMove MUST NOT BE ALLOWED TO ANSWER is water and mountain. Its overworld branch tests
     those on the raw LATTICE, and the entire point of the field above is that they are painted
     CONTINUOUSLY -- delegating them would put the square blockers straight back under the organic
     coastline. So the two authorities are split along the boundary the file already draws
     (see WHAT DELIBERATELY STAYS ON TILES): the field answers for the painted masses and the
     bridge decks carved out of them, canMove answers for every other cell. Dungeons are untouched
     -- they keep the prop table beside their baked mask, exactly as before. */
  var OWM_FIELD_OWNED={2:1,4:1,5:1};       // water, mountain, bridge: the field's cells, not canMove's
  function a1mCanMove(scene,tx,ty){
    var f=scene&&scene.canMove;
    if(typeof f!=='function') return null;                                   // unknown -> caller falls back
    try{ return !!f.call(scene,tx,ty); }catch(e){ return null; }
  }
  // (x,y) is the SPRITE position everywhere -- that is what the engine sets, what the rescue guard
  // holds and what the camera follows -- and the mask is sampled at the soles below it.
  function a1mFree(scene,m,x,y){
    var wx=x, wy=y+a1mFootDy(scene);                                         // WORLD px: the tile test reads the map
    var fx=wx-m.ox, fy=wy-m.oy;                                              // FIELD px: 0 offset for a dungeon mask
    if(fx<1||fy<1||fx>=m.W-1||fy>=m.H-1) return false;
    var gx=fx|0, gy=fy|0;
    if(m.dist[(gy*m.W)+gx] < a1mNeed(m,gx,gy)) return false;                 // too close to rock
    var t=a1mTileAt(scene,wx,wy);
    if(t===undefined) return false;
    if(m.ow && !OWM_FIELD_OWNED[t]){
      var ok=a1mCanMove(scene,(wx/TILE)|0,(wy/TILE)|0);
      if(ok!==null) return ok;
    }
    /* THE ENTRANCE CRYSTAL IS A WALL FIXTURE, SO ITS FLOOR CELL MUST NOT BLOCK. Owner on build 42:
       "the entrance crystal interaction is also not flush to the wall, I bump into something
       invisible in front of the crystal."

       He is describing the gap between the two halves of this object exactly. The crystal is DRAWN
       up on the wall (a1dEntranceCrystalTick anchors it one tile north of its marker), because an
       earlier pass tried putting the marker itself in the wall row and broke interaction -- the
       walk mask reads BLOCKED there, as it does for the plaque. So the marker was left on the floor
       cell in front... and tile 14 is in A1M_PROP, which turned that floor cell into an invisible
       wall standing a full cell out from the stonework she can see.

       Unblocking it is the fix rather than moving it again: she can now walk right up to the wall
       and the crystal reads as flush with it, which is what "embedded in the wall like the plaque"
       asked for. Interaction is unaffected -- a1mNearbyInteract and the engine's own dispatch both
       find tile 14 by PROXIMITY, not by her standing on it, and the mid/boss-floor crystals keep
       their blocker because only the floor-1 entrance crystal is drawn onto a wall. */
    if(t===14 && a1dIsEntranceCrystalCell(scene,(wx/TILE)|0,(wy/TILE)|0)) return true;
    return !(m.prop||A1M_PROP)[t];
  }
  // Which cell (if any) carries the floor-1 entrance crystal. Cached per map+floor: a1mFree runs
  // per collision substep, and this must not walk the asset list on every one of them.
  var a1dEcCell=null, a1dEcKey=null;
  function a1dIsEntranceCrystalCell(scene,tx,ty){
    try{
      var mapId=scene.currentMapId, floor=scene.currentFloor||1, key=mapId+'-f'+floor;
      if(a1dEcKey!==key){
        a1dEcKey=key; a1dEcCell=null;
        if(A1D_MAPS[mapId] && floor===1){
          var fl=a1dFloorFor(scene), a=(fl&&fl.assets)||[];
          for(var i=0;i<a.length;i++) if(a[i].kind==='save'){ a1dEcCell=[a[i].x,a[i].y]; break; }
        }
      }
      return !!(a1dEcCell && a1dEcCell[0]===tx && a1dEcCell[1]===ty);
    }catch(e){ return false; }
  }
  /* ---- SLIDE ALONG THE WALL, NOT ALONG THE AXES ----------------------------------------------
     Retrying X alone and then Y alone is only sliding on an AXIS-ALIGNED wall, and this cave is
     organic -- almost none of its walls run straight. Measured over the three floors' real contact
     points (every near-wall standing position x 24 headings, counting only the cases where a glide
     is genuinely available, i.e. the tangent keeps >=35% of the step): with axis separation alone,
     5% of pushes into an axis-aligned wall produced ZERO movement, 26% against oblique wall and
     39-43% against diagonal wall -- about one push in six across the cave's actual wall population
     froze the hero solid while the stick was still held. On device a 1.58 s full-deflection push
     into a 45-degree wall gave 0 px and a pixel-identical frozen screen for the whole hold.
     The distance field already knows where the rock is, so nothing new is needed to fix it: its
     GRADIENT is the outward wall normal, and the glide is the step with its into-the-wall
     component removed, s - (s.n)n. That is the true tangent for any wall angle, not just the two
     the axes happen to name. The axis retries below stay as the fallback for the cases the tangent
     cannot serve (a concave corner, a prop cell, the map edge), so nothing that used to move stops
     moving. Returns the tangent STEP, deliberately un-renormalised: a glide along a wall should
     lose the speed it was spending pushing into it, which is what makes a wall feel like a wall.
     `len` is that tangential travel, reported separately from the clearance lift below so the walk
     cadence is paced by the distance she actually walked. */
  var A1M_LIFT=3;             // max world px of outward correction per substep (see below)
  function a1mSlide(scene,m,x,y,sx,sy){
    var fd=a1mFootDy(scene), gx=(x-m.ox)|0, gy=(y+fd-m.oy)|0;
    if(gx<1||gy<1||gx>=m.W-1||gy>=m.H-1) return null;
    var i=gy*m.W+gx;
    var nx=m.dist[i+1]-m.dist[i-1], ny=m.dist[i+m.W]-m.dist[i-m.W];           // grows AWAY from rock
    var l=Math.sqrt(nx*nx+ny*ny); if(l<1e-6) return null;                     // flat field: no wall to read
    nx/=l; ny/=l;
    var d=sx*nx+sy*ny; if(d>=0) return null;                                  // not pushing into THIS wall
    var tx=sx-d*nx, ty=sy-d*ny;
    var len=Math.sqrt(tx*tx+ty*ty);
    if(len<0.01) return null;                                                 // dead head-on: nothing to glide along
    /* The tangent is only tangent to FIRST ORDER, and an organic cave has no straight walls: a step
       along it lands slightly INSIDE the concavity it is curving around, which the 12 px clearance
       test then rejects -- and the glide dies after four or five frames, hard against the exact
       clearance floor, with the stick still held. Measured before this correction: 84.7% of held
       pushes into slanted wall still ended frozen, median travel 15 px in 1.58 s. So ask the field
       how much clearance the step actually lost and give exactly that back along the normal, plus
       half a pixel to clear the integer field's own quantisation. Self-limiting (a step that keeps
       its clearance is corrected by zero) and capped, so it can lift her off a wall she is rubbing
       but never throw her across one. */
    /* TWICE, because the requirement is now a function of WHERE SHE LANDS (see a1mNeed). Sampling
       it once at the un-lifted destination asks about a pixel she is no longer going to occupy:
       the lift slides her along the normal into a neighbourhood whose wall normal has rotated, and
       therefore whose requirement is different. One pass measured 1.1-1.5% dead stops against the
       uniform collider's 0.2-0.6%; re-sampling at the corrected point puts it back. Still capped
       in TOTAL by A1M_LIFT, so this buys accuracy, not reach. */
    var lift=0;
    for(var p=0;p<2;p++){
      var ex=(x+tx-m.ox)|0, ey=(y+ty+fd-m.oy)|0;
      if(ex<1||ey<1||ex>=m.W-1||ey>=m.H-1) break;
      var need=a1mNeed(m,ex,ey)-m.dist[ey*m.W+ex];   // the SAME requirement a1mFree will apply
      if(need<=0) break;
      var add=Math.min(A1M_LIFT-lift,(need/A1M_CH)+0.5);
      if(add<=0) break;
      tx+=nx*add; ty+=ny*add; lift+=add;
    }
    return { x:tx, y:ty, len:len };
  }
  // Nearest legal standing point. Needed because the hero is PLACED by tile: a1dRescueHero and
  // every engine entry path drop her on a cell CENTRE, and a cell centre is a lattice coordinate
  // the art never promised was open -- a cave mouth in particular is an arch IN the rock and is
  // deliberately exempt from the renderer's prop pockets. Without this she would spawn embedded
  // and never move again.
  function a1mUnstick(scene,m,x,y){
    var fd=a1mFootDy(scene);                                                 // score the SOLES, like a1mFree tests them
    for(var r=4;r<=288;r+=4){                                                // bounded at 6 cells
      var best=null, bd=-1, k, n=Math.max(8,Math.round(r*0.9));
      for(k=0;k<n;k++){
        var a=k*2*Math.PI/n, px2=x+Math.cos(a)*r, py2=y+Math.sin(a)*r;
        if(!a1mFree(scene,m,px2,py2)) continue;
        var dd=m.dist[(((py2+fd-m.oy)|0)*m.W)+((px2-m.ox)|0)];
        if(dd>bd){ bd=dd; best={x:px2,y:py2}; }
      }
      if(best) return best;
    }
    return null;
  }
  /* ---- THE OVERWORLD'S WALKABLE FIELD, DERIVED FROM WHAT IS PAINTED --------------------------
     The dungeons stopped disagreeing with their own art the moment collision was read FROM the
     art: `<floor>-walk.png` is the renderer's own floor field thresholded at the same 0.5 that
     decides every rendered pixel, so the blocker and the visible edge cannot drift apart. The
     overworld had the opposite arrangement -- terrain painted from CONTINUOUS fields (fieldAt's
     0.5 iso-line, which exists to "remove ALL tile-grid 90-degree steps") while collision stayed
     on the raw tile lattice through OW_BLOCK. This file already said so out loud, at the road
     layer: the reskin dissolves the generator's path blobs "in the RE-SKIN ONLY -- the deployed
     map data is never mutated, so walkability/barriers are unchanged". Square blockers under an
     organic coastline. Owner, on the dungeon version of the same bug: "the player does not walk
     smoothly and the user blockers are not synced with the visual design".

     THE SAME TREATMENT, AND IT NEEDS NO NEW ASSET. The overworld does not need a `-walk.png`
     because its two continuous masses are ANALYTIC. drawTerrain decides every one of its pixels
     with exactly these two numbers:
         W   = waterField(map,wx,wy)        -> W  >= 0.50 is water
         Mf0 = mountainField(map,wx,wy)     -> Mf0>= 0.50 is rock
     so evaluating those same two functions at that same 0.50 IS reading the painting. One
     authority, no second sampler that could drift, and it re-tunes itself with __DQ_WIGGLE__ and
     the rest of the field knobs because it calls the field rather than copying it.

     WHAT DELIBERATELY STAYS ON TILES. Only water and mountain are painted continuously. Every
     other OW_BLOCK value is a discrete landmark DRAWN as a prop standing on its cell -- a cave
     mouth, a tomb, a signpost, a village -- so a cell-shaped blocker is what its picture actually
     is, and bumping one is how the engine interacts with it. Those keep the tile test, exactly as
     the dungeon keeps A1M_PROP beside its mask. Removing 2 and 4 from that table is the whole
     point: the field owns them now, at the painted edge instead of the lattice edge.

     THIS SPLIT IS ALSO THE OWNERSHIP BOUNDARY a1mFree uses to decide who answers for a cell: the
     FIELD answers for 2, 4 and 5 (the painted masses, and the decks carved back out of them) and
     scene.canMove answers for every other cell. See a1mFree.

     BRIDGES ARE CARVED BACK OUT, OR THE MAP DISCONNECTS. waterField's membership counts tile 5 as
     water on purpose, so the deck is painted over real water instead of a hole (see its comment).
     Blocking on the raw field would therefore wall off every bridge on the map and strand the
     player on whichever side she was standing. Bridge cells are forced walkable after sampling.

     WINDOWED, BECAUSE A WORLD IS NOT A FLOOR. A dungeon floor is bounded and its mask is built
     once; the overworld is not, and a full-map field at 48 px/cell would be tens of millions of
     pixels. So the field is built over the RENDERER'S OWN window -- same origin, same size, same
     key -- which at 320x400 works out to 31x33 cells = 1488x1584 px. That is within a whisker of
     the 2.3 M pixels a dungeon floor already builds in under 40 ms, and it is rebuilt only when
     that window moves, i.e. every MARGIN=12 cells of travel rather than every frame. MARGIN is
     also what makes the window safe: it keeps the hero ~576 px from any edge, which is 19 times
     the largest single frame's travel and twice a1mUnstick's 288 px search. If she is somehow
     outside it anyway, owmFor returns null and the engine's own stepping takes over untouched --
     fallback-safe, exactly like every other layer in this file. */
  var OWM_TILE_BLOCK=null;
  function owmTileBlock(){                                       // OW_BLOCK minus the two painted masses
    if(OWM_TILE_BLOCK) return OWM_TILE_BLOCK;
    OWM_TILE_BLOCK={};
    for(var k in OW_BLOCK){ if(k!=='2' && k!=='4') OWM_TILE_BLOCK[k]=1; }
    return OWM_TILE_BLOCK;
  }
  var owmState=null;
  // Presence scan, as drawTerrain does it, WITH one cell of margin -- fieldAt interpolates across
  // tile CENTRES, so a mass one cell outside the window still reaches into it. Bit 1 water (and
  // bridge, which waterField counts), bit 2 mountain.
  function owmPresence(map,X0,Y0,winW,winH){
    var p=0, sx, sy, sv;
    for(sy=-1;sy<=winH && p!==3;sy++) for(sx=-1;sx<=winW;sx++){
      sv=et(map,X0+sx,Y0+sy);
      if(sv===2||sv===5) p|=1; else if(sv===4) p|=2; }
    return p;
  }
  function owmBuild(map,X0,Y0,winW,winH){
    var cw=winW*N, ch=winH*N, wox=X0*N, woy=Y0*N, n=cw*ch;
    if(!(n>0)) return null;
    var pres=owmPresence(map,X0,Y0,winW,winH), hasW=!!(pres&1), hasM=!!(pres&2);
    var dist=new Uint16Array(n), INF=60000, i,x,y,v;
    if(!hasW && !hasM){ for(i=0;i<n;i++) dist[i]=INF; }          // open ground: nothing to collide with
    else for(y=0;y<ch;y++){ var wy=woy+y, row=y*cw, ty=(wy/N)|0;
      for(x=0;x<cw;x++){ var wx=wox+x, b=0;
        if(hasW && waterField(map,wx,wy)>=0.50) b=1;             // the SAME 0.50 drawTerrain paints with
        if(!b && hasM && mountainField(map,wx,wy)>=0.50) b=1;
        if(b && et(map,(wx/N)|0,ty)===5) b=0;                    // a bridge deck is walkable water
        dist[row+x]=b?0:INF; } }
    // chamfer 3-4, two sweeps -- identical to a1mBuild, over a field built rather than loaded
    for(y=0;y<ch;y++){ var r=y*cw;
      for(x=0;x<cw;x++){ i=r+x; v=dist[i]; if(!v) continue;
        if(y>0){ if(dist[i-cw]+3<v)v=dist[i-cw]+3;
                 if(x>0     && dist[i-cw-1]+4<v)v=dist[i-cw-1]+4;
                 if(x<cw-1  && dist[i-cw+1]+4<v)v=dist[i-cw+1]+4; }
        if(x>0 && dist[i-1]+3<v)v=dist[i-1]+3;
        dist[i]=v; } }
    for(y=ch-1;y>=0;y--){ var r2=y*cw;
      for(x=cw-1;x>=0;x--){ i=r2+x; v=dist[i]; if(!v) continue;
        if(y<ch-1){ if(dist[i+cw]+3<v)v=dist[i+cw]+3;
                    if(x<cw-1 && dist[i+cw+1]+4<v)v=dist[i+cw+1]+4;
                    if(x>0    && dist[i+cw-1]+4<v)v=dist[i+cw-1]+4; }
        if(x<cw-1 && dist[i+1]+3<v)v=dist[i+1]+3;
        dist[i]=v; } }
    return { W:cw, H:ch, ox:wox, oy:woy, dist:dist, prop:owmTileBlock(), ow:1 };
  }
  /* ---- THE SAME FIELD, BAKED -----------------------------------------------------------------
     owmBuild above is CORRECT and unaffordable. Measured on device (iPhone 17 Pro sim, six samples
     over two launches): 434-492 ms, mean ~470 ms, for the 1584x1872 window a 402x702 viewport asks
     for -- twelve times the 40 ms budget, once every 2.2 s of walking, i.e. about a fifth of
     walking time spent on a frozen main thread in half-second blocks. Split by phase, the per-pixel
     waterField/mountainField evaluation is ~87% of it and the two chamfer sweeps the rest, so
     making the mask cheaper could not have reached budget on its own either.

     THE DUNGEONS ALREADY SOLVED THIS AND THE ANSWER WAS NEVER "OPTIMISE THE LOOP": they read a
     baked artefact (a1mMaskFor's `<floor>-walk.png`) instead of deriving one. So does this, one
     step further -- what is baked is the CHAMFER DISTANCE, not the mask, which removes the sweeps
     as well as the field. scripts/bake_act1_overworld_walk.mjs evaluates the very functions this
     file paints with, over the whole Act 1 plate, and writes act1-overworld-walk.bin.

     WHY IT IS THE SAME FIELD AND NOT A LOOKALIKE. The bake script does not re-implement
     waterField: it slices the function out of THIS file and runs it, so the two cannot drift, and
     the .bin's header carries a digest of that source (plus the frozen bundle and the consolidated
     map) which `--check` verifies. Compared pixel for pixel against owmBuild over seven real
     windows, 20.8 M px, the two agree EXACTLY on every value the collider can act on. They differ
     only in a <=20 px band along the window rim, where owmBuild -- chamfering its window in
     isolation -- cannot see water just outside the frame and reports it as far. The hero is never
     nearer than 232 px to a rim (window geometry: 232/370/777/927 px for right/bottom/left/top at
     the worst of the twelve alignments) and a1mUnstick reaches 288 px, so that band is unreachable
     -- and inside it the bake is the more correct of the two anyway.

     WHY IT CLAMPS AT 255 THIRDS (85 px). a1mNeed's largest requirement is A1M_FOOT*A1M_CH +
     A1M_LEAN*A1M_CH = 48 thirds, so 49 and 4900 are already the same answer to a1mFree, a1mNeed
     and a1mSlide. Only a1mUnstick reads the raw magnitude, to rank rescue candidates by how clear
     they are, and 85 px is set high enough that its 288 px search still sees an ordering anywhere
     within reach of a coast. Deep inland every candidate ties -- which is exactly what today's
     window chamfer already does whenever the window holds no water at all.

     FALLBACK-SAFE, three ways: no .bin (404, malformed, still loading) -> owmBuild; a window that
     reaches outside the baked plate -> owmBuild; and __DQ_WIGGLE__ or __DQ_WATER_THRESH__ moved
     off the values the bake was taken at -> owmBuild, so the field knobs still re-tune the
     coastline live for review exactly as they did before. */
  var OWM_UNBAKED=0xFFFD, OWM_BLOCKED=0xFFFE, OWM_FARCELL=0xFFFF;
  var owmBake=null, owmBakeReq=false;
  function owmBakeLoad(){                                        // once, like a1dFetch's manifest
    if(owmBakeReq) return; owmBakeReq=true;
    try{
      var r=new XMLHttpRequest(); r.open('GET','act1-overworld-walk.bin',true);
      r.responseType='arraybuffer';
      r.onload=function(){ try{ owmBake=owmBakeParse(r.response)||null; }catch(e){ owmBake=null;
        if(window.__DQ_DEBUG__) console.log('dq owm bake '+e); } };
      r.onerror=function(){ owmBake=null; };                     // no bake -> owmBuild, as before
      r.send();
    }catch(e){ owmBake=null; }
  }
  function owmBakeParse(ab){
    if(!ab || ab.byteLength<64) return null;
    var h=new DataView(ab);
    if(h.getUint32(0,true)!==0x574F3141) return null;             // 'A1OW'
    if(h.getUint16(4,true)!==1) return null;                      // format version
    if(h.getUint16(6,true)!==N) return null;                      // baked at this file's px/cell
    var mw=h.getUint16(8,true), mh=h.getUint16(10,true), far=h.getUint16(12,true);
    var nb=h.getUint32(16,true), hash=h.getUint32(20,true), cells=mw*mh;
    if(!(mw>0&&mh>0&&far>0&&far<256)) return null;
    if(ab.byteLength!==64+cells*2+nb*N*N) return null;            // truncated or padded -> refuse
    return { mapW:mw, mapH:mh, far:far, hash:hash,
             idx:new Uint16Array(ab,64,cells), blk:new Uint8Array(ab,64+cells*2,nb*N*N) };
  }
  /* The bake describes ONE map, and mapData reaches this file through three hands: the bundle's
     generator, consolidateMapData's mountain clustering, and act1-world-map.js writing the owner's
     painted Act 1 plate over the middle of it. That last one moves 5,817 cells in or out of the
     painted masses, so a bake taken before it describes a coastline the hero is not standing on --
     which is exactly what this check caught the first time it ran on device.
     IT HASHES MEMBERSHIP, NOT TILES. Gameplay writes into mapData too (a chest opens, a boss
     falls), and a whole-map hash would send the overworld back to the 470 ms path forever the
     first time one did. Only water, bridge and mountain can move the field, so only those are
     hashed. FNV-1a/32, because there is no synchronous crypto here.

     NOT MEMOISED ON THE ARRAY, and that is the fix for the owner's "loading is still extremely
     slow, even after battles" (2026-08-07). It used to cache `{map, h}` and return the cached `h`
     whenever the same ARRAY came back. But act1-world-map.js writes the owner's plate INTO the
     rows of that array (`target[...]=...`), so the contents change while the identity does not:
     any call that landed before the plate cached the pre-plate hash, nothing ever invalidated it,
     and owmBakeFor then compared a stale hash against the bake's and returned null FOR THE LIFE
     OF THAT ARRAY. Measured on device: Coastal Reef never baked at all (analytic 2008-2615 ms),
     and after ANY town round trip the same window went from `baked 1.0 ms` to `analytic 634 ms`
     and never recovered that session.

     A generation counter bumped by the plate would fix this writer and leave the next one to
     rediscover the bug, because memoising a value derived from IN-PLACE MUTATED contents has no
     sound key that is not the contents themselves. So it is simply recomputed. The single caller
     is owmBakeFor, reached only when owmFor rebuilds its window -- about once every 12 cells of
     travel, not per frame -- and the loop measures 0.22 ms over the 320x400 map against the 1-2 ms
     that rebuild costs when it hits the bake and the 634-2615 ms it costs when it misses. The memo
     was saving 0.22 ms and risking all of it. */
  function owmMapHash(map){
    var h=0x811c9dc5, H=map.length, W=map[0].length, y, x, row, v;
    for(y=0;y<H;y++){ row=map[y];
      for(x=0;x<W;x++){ v=row[x];
        h=(h^(v===2?1:v===5?2:v===4?3:0))>>>0; h=Math.imul(h,0x01000193)>>>0; } }
    return h>>>0;
  }
  function owmBakeFor(map){
    var b=owmBake; if(!b) return null;
    if(typeof window.__DQ_WIGGLE__==='number' && window.__DQ_WIGGLE__!==0.26) return null;
    if(typeof window.__DQ_WATER_THRESH__==='number' && window.__DQ_WATER_THRESH__!==12) return null;
    if(map.length!==b.mapH || map[0].length!==b.mapW) return null;
    if(owmMapHash(map)!==b.hash) return null;
    return b;
  }
  // Assemble owmBuild's window out of the plate: one fill or one 48-row copy per CELL, against
  // owmBuild's 2.965 M evaluations plus two sweeps over the same. Uint8 rather than Uint16 because
  // every value is clamped; every sampler reads it as a number either way.
  // `plate`: the Act 1 override owns this map, so the hero is confined to the plate -- see owmFor.
  function owmAssemble(b,X0,Y0,winW,winH,plate){
    var cw=winW*N, ch=winH*N; if(!(cw>0&&ch>0)) return null;
    var idx=b.idx, blk=b.blk, far=b.far, mw=b.mapW, mh=b.mapH;
    var dist=new Uint8Array(cw*ch), cx, cy, mx, my, id, base, y, x, o, s, d;
    for(cy=0;cy<winH;cy++){ my=Y0+cy; if(my<0||my>=mh) return null;
      for(cx=0;cx<winW;cx++){ mx=X0+cx; if(mx<0||mx>=mw) return null;
        id=idx[my*mw+mx];
        // ONE unbaked cell used to throw the WHOLE window away and fall through to owmBuild's
        // per-pixel synthesis. That is the same defect shape as the terrain splat, on the other
        // window: coverage judged per WINDOW rather than per reachable cell. The window carries
        // MARGIN=12 cells of OFF-SCREEN border, so anywhere near the plate's north edge it always
        // contains unbaked rows and the fallback fired on every 12-cell step -- measured on device
        // 2026-08-11, `owm 625ms analytic` against a 620 ms freeze at the owner's own tile 111,231,
        // the freeze that survived both the locked-art change and the texture throttle.
        //
        // Inside Act 1 an unbaked cell is instead SOLID, which is what it already is in practice:
        // walkable ground spans x 24-158, y 224-393 inside plate bounds x 16-163, y 218-399, i.e.
        // at least six cells of blocked coast on every side, so nothing outside the bake is
        // reachable. Treating it as solid can only ever refuse a move she could not make anyway --
        // the safe direction. Gated on `plate`, so a map the override does not own keeps the old
        // bail and its analytic field rather than being silently walled in.
        if(id===OWM_UNBAKED){ if(!plate) return null; continue; }
        if(id===OWM_BLOCKED) continue;                           // solid: the array is already 0
        base=cy*N*cw+cx*N;
        if(id===OWM_FARCELL){ for(y=0;y<N;y++){ d=base+y*cw; dist.fill(far,d,d+N); } }
        else { o=id*N*N;
          for(y=0;y<N;y++){ d=base+y*cw; s=o+y*N;
            for(x=0;x<N;x++) dist[d+x]=blk[s+x]; } } } }
    return { W:cw, H:ch, ox:X0*N, oy:Y0*N, dist:dist, prop:owmTileBlock(), ow:1 };
  }
  function owmFor(scene){
    if(window.__DQ_OW_CONTINUOUS__===false) return null;         // review escape hatch, like __A1_DNG_CONTINUOUS__
    if(!scene || scene.currentMapId!=='overworld') return null;  // only the BFS-validated real overworld
    var map=scene.mapData; if(!map||!map.length||!map[0]) return null;
    var hero=scene.hero; if(!hero||!hero.scene) return null;
    var cam=scene.cameras&&scene.cameras.main; if(!cam||!cam.worldView) return null;
    owmBakeLoad();
    // The map must be FINISHED before its collision field is derived from it -- consolidated and
    // plated, i.e. the shape act1-overworld-walk.bin was baked over. See owEnsureMapSetup for what
    // deriving from a half-set-up map cost and for why this call is not a reordering of the work.
    if(owEnsureMapSetup(scene)) owSetupPending=true;
    var winW=Math.ceil(cam.worldView.width/TILE)+2*MARGIN, winH=Math.ceil(cam.worldView.height/TILE)+2*MARGIN;
    var X0=windowStart(cam.worldView.x,winW,map[0].length), Y0=windowStart(cam.worldView.y,winH,map.length);
    var key=X0+'_'+Y0+'_'+winW+'_'+winH;
    /* SHE MUST BE INSIDE THE WINDOW, AND THAT IS DECIDED BEFORE IT IS BUILT, NOT AFTER.
       The identical test lives four lines below, against the built field's own ox/oy/W/H -- but
       those are just X0*N, Y0*N, winW*N and winH*N, every one of them known here. Asking first
       is therefore the SAME question with the SAME answer; all that changes is that a window she
       is not standing in no longer costs a field to reject.
       This is not a corner case, it is every map swap. Phaser recomputes cam.worldView in its own
       preRender, so on the frames right after loadMap() the scroll has already jumped to the hero
       while worldView still holds the map she LEFT: measured 2026-08-08, walking out of
       Greenhollow asked for window 0_0_44_38 -- the map's origin corner, ~250 cells from the hero,
       outside the Act 1 plate so it cannot come from the bake -- and owmBuild synthesised
       3.85 M px of waterField/mountainField for it, 411.8 ms, one frame before the real window
       replaced it. Rejecting it up front is a straight deletion of that block. */
    var fx0=hero.x-X0*N, fy0=hero.y-Y0*N;
    if(fx0<8||fy0<8||fx0>=winW*N-8||fy0>=winH*N-8) return null;  // outside -> the engine's own stepping
    // Identity on the ARRAY as well as the window: a town exit swaps mapData wholesale, and a field
    // built from the old array describes terrain that is no longer there.
    if(!owmState || owmState.map!==map || owmState.key!==key){
      var pf=(window.performance&&performance.now)?performance:null, t0=pf?pf.now():0;
      var b=owmBakeFor(map), plate=a1aPlateOwns(scene);
      var mm=b?owmAssemble(b,X0,Y0,winW,winH,plate):null, src=mm?'baked':'analytic';
      // COLD START. act1-overworld-walk.bin arrives asynchronously, so the first window or two can
      // be asked for before it lands -- and on the plate that used to mean synthesising 3.85 M px
      // analytically for a field the bake was about to answer in 4 ms. Measured 541 ms at boot.
      // Returning null is not a failure: it is the same "outside -> the engine's own stepping" path
      // this function already takes when the hero is not inside the window, so she steps on the
      // engine's own grid for the moment it takes the file to arrive, under the loading cover.
      // Only where the plate owns the map, where the bake IS the authority and is known to cover
      // every reachable cell; elsewhere the analytic field is still the only answer there is.
      if(!mm && plate) return null;
      if(!mm) mm=owmBuild(map,X0,Y0,winW,winH);
      var ms=pf?(pf.now()-t0):-1;                                // measured BEFORE the debug scan
      owmState={ map:map, key:key, m:mm };
      // Published because this rebuild is the one thing in the overworld that can drop a frame,
      // and the last time it regressed it was found by measuring it on device, not by reading it.
      var pres=owmPresence(map,X0,Y0,winW,winH), terrain=((pres&1)?'W':'-')+((pres&2)?'M':'-');
      window.__DQ_OWM__={ ms:ms, src:src, key:key, w:winW, h:winH,
                          px:winW*N*winH*N, terrain:terrain };
      if(window.__DQ_DEBUG__) console.log('dq owm '+src+' '+(ms>=0?ms.toFixed(1):'?')+'ms '
        +winW+'x'+winH+' ['+terrain+'] '+key+(owmBake?'':' (bake not loaded)'));
    }
    var m=owmState.m; if(!m) return null;
    // Kept, though the pre-build test above now answers the same question off the same numbers:
    // this one reads the field's OWN geometry, so it still holds if a builder ever returns
    // something other than the window it was asked for. It costs four comparisons.
    var fx=hero.x-m.ox, fy=hero.y-m.oy;                          // she must be inside it, with room to work
    if(fx<8||fy<8||fx>=m.W-8||fy>=m.H-8) return null;            // outside -> the engine's own stepping
    return m;
  }
  // The field in force for this scene: the dungeon's baked mask, else the overworld's derived one.
  function a1mAnyFor(scene){
    var m=null;
    try{ m=a1mFor(scene); }catch(e){}
    if(m) return m;
    try{ return owmFor(scene); }catch(e){ if(window.__DQ_DEBUG__) console.log('dq owm '+e+(e&&e.stack||'')); }
    return null;
  }
  // State identity for the mover. Keyed on the MAP, never on the window -- the walk cadence and the
  // bump debounce must survive the field being rebuilt under her every 12 cells of travel.
  function a1mStateKey(scene){
    return a1mKeyFor(scene) || (scene&&scene.currentMapId ? 'ow:'+scene.currentMapId : null);
  }
  // The analog stick's ACTUAL vector, not the arrow keys it synthesises for the frozen bundle.
  // index.html publishes __DQ_STICK__ alongside the key events, so the overworld and the town
  // are untouched and only this file reads the extra channel. Keyboard stays the web path.
  function a1mInput(scene){
    var v={x:0,y:0}, mag=1, s=window.__DQ_STICK__;
    if(s && (s.x||s.y)){ v.x=s.x; v.y=s.y; mag=(typeof s.m==='number')?s.m:1; }
    else { var c=scene.cursors; if(!c) return null;
      v.x=(c.right.isDown?1:0)-(c.left.isDown?1:0);
      v.y=(c.down.isDown?1:0)-(c.up.isDown?1:0); }
    var l=Math.sqrt(v.x*v.x+v.y*v.y);
    if(l<1e-4) return null;
    v.x/=l; v.y/=l;
    if(scene.mirrorActive){ v.x=-v.x; v.y=-v.y; }
    v.m=Math.max(0,Math.min(1,mag));
    return v;
  }
  /* Walking into an OBJECT is the engine's interaction verb; mirror its own bump branch exactly
     (tile 4 -> tryOpenTreasure, 7 -> tryBossInteract, 18 -> tryReadPlaque) rather than inventing
     behaviour for it.

     DISPATCH DIRECTLY TO THE TILE-SCOPED METHOD, NOT `scene.interact()`. `interact()` re-derives
     the tile it acts on from `heroTileX/heroTileY + heroDir`, and heroTileX/heroTileY are
     reported from the sprite CENTRE while collision (and this probe) work from her SOLES --
     the same centre-vs-soles split a1mStep's own re-derivation comment already calls out
     ("heroTile can now name a cell her body overlaps but her feet are not on"). MEASURED
     2026-08-14 at Sunken Cellar B1F's plaque (21,21): by the time she is stopped at it,
     heroTileY has already advanced onto the plaque's OWN row (sprite centre crossed in before
     her soles arrived), so `interact()`'s re-derivation looked at (21,20) -- one tile past the
     sign -- and found nothing, even though the bump had just identified (21,21) correctly.
     tryOpenTreasure(x,y) and tryReadPlaque(x,y)/tryBossInteract(x,y) all take the exact cell
     explicitly, exactly like this probe already has in `tx,ty`, so calling them directly removes
     the re-derivation step instead of trying to keep it in sync.

     TILE 14 (the save/warp crystal, Ts) ADDED 2026-08-14. It was in A1M_PROP -- so it already
     stopped her, exactly like a chest or a boss marker -- but had no dispatch case here, so
     bumping it did nothing at all: not even the base engine's OWN discrete canMove-refusal path
     sends a bump to it (see WorldMapScene.update()'s h===... chain, which has no case for Ts
     either), so this was dead on keyboard too, not just on touch. There is no standalone
     tryXxx(x,y) for it -- the floor-1 entrance and every mid-floor crystal are both handled
     inline inside interact() off `this.mapData[i][T] === Ts` -- so this one case still has to go
     through interact(), and therefore still has to work around the re-derivation problem above:
     it presents heroTileX/heroTileY as if they had not yet drifted onto the crystal's row (one
     step back along heroDir, which the bump already knows), calls interact(), then restores the
     real values immediately after. The crystal handlers never move the hero, so nothing is lost
     by the round trip.

     AND A DOOR IS AN OBJECT YOU WALK INTO. Every Act 1 town entrance is a BLOCKER cell -- tile 6
     for a village, 15 for the Crystal gate -- and the engine enters one by asking checkTransition
     BEFORE it tests walkability (WorldMapScene.ts: checkTransition at line 1042, canMove at 1111),
     so the cell never has to be walkable. a1mStep inverts that: it tests a1mFree first and only
     reaches its own checkTransition after the hero's CELL has changed. Against a blocker the move
     never succeeds, the cell never changes, and the transition is never requested -- which is why
     no town in Act 1 could be entered. Caves survived by accident, on the `t===7` interact branch
     below, which is there for dungeon doors and happens to match the overworld cave-mouth tile.

     ASKED HERE, ON THE BUMP, rather than ahead of the walkability test in the substep loop. Both
     restore the engine's order; the bump is the one that can afford it. checkTransition CONSUMES
     transitionCooldown on EVERY call (see a1mStep's own note), so asking it from the substep loop
     would drain the cooldown many times a frame while merely walking. The bump is already
     debounced to once per 700 ms, already computes the exact cell she walked into, and is already
     the file's stated model for landmark tiles: "a cell-shaped blocker is what its picture
     actually is, and bumping one is how the engine interacts with it."

     No tile list: whatever checkTransition answers for is what opens, so the owner's eight doors,
     the base game's connections and anything added later all work without naming a single id. */
  function a1mBump(scene,m,x,y,dx,dy){
    var l=Math.sqrt(dx*dx+dy*dy); if(!l) return;
    // Probe from the SOLES: a1mFree stopped her there, so that is where the object she walked into
    // is. Probing from the sprite centre would have looked a cell north of the thing that blocked.
    // Reach is A1M_BUMP_REACH, not a flat A1M_FOOT+2 -- see its own comment for why a shorter
    // probe systematically undershoots a due-north object.
    var gy=y+a1mFootDy(scene);
    var tx=(((x+dx/l*A1M_BUMP_REACH)/TILE)|0), ty=(((gy+dy/l*A1M_BUMP_REACH)/TILE)|0);
    var row=scene.mapData[ty], t=row?row[tx]:undefined;
    if(t===undefined || !(m.prop||A1M_PROP)[t]) return;
    var now=Date.now(); if(now-a1mState.bump<700) return; a1mState.bump=now;
    var ddx=tx-scene.heroTileX, ddy=ty-scene.heroTileY;                      // face it, like a step would
    if(Math.abs(ddx)+Math.abs(ddy)===1) scene.heroDir=ddx?(ddx>0?2:1):(ddy>0?0:3);
    try{
      if(t===4) scene.tryOpenTreasure(tx,ty);
      else if(t===18) scene.tryReadPlaque(tx,ty);
      else if(t===7) scene.tryBossInteract(tx,ty);
      else if(t===14){
        // Item 3: no longer routes straight into interact() -- see a1mCrystalShow's header for
        // why touching the crystal must ask first, not act first.
        // A DORMANT ENTRANCE CRYSTAL SWALLOWS THE BUMP ENTIRELY. The prompt path is gated in
        // a1mNearbyInteract; this is the other way in, and leaving it open would mean the object
        // is still interactable by walking into it -- exactly the bug (a1mCrystalDormant's header).
        if(a1mCrystalDormant(scene)) return;
        var ddx2=(scene.heroDir===2?1:(scene.heroDir===1?-1:0)),
            ddy2=(scene.heroDir===0?1:(scene.heroDir===3?-1:0));
        a1mCrystalTouch(scene,tx,ty,ddx2,ddy2);
      }
    }catch(e){}
  }
  /* ---- A DOOR IS ASKED FOR, NOT WALKED INTO ---------------------------------------------------
     Every Act 1 town entrance is a BLOCKER cell -- tile 6 for a village, 15 for the Crystal gate --
     and the engine enters one by asking checkTransition BEFORE it tests walkability
     (WorldMapScene.ts: checkTransition line 1042, canMove line 1111), so the cell never has to be
     walkable. a1mStep inverts that: it tests a1mFree first and only reaches its own
     checkTransition once the hero's CELL has changed. Against a blocker the move never succeeds,
     the cell never changes, and the transition is never requested -- which is why no town in Act 1
     could be entered. Caves survived by accident, on a1mBump's `t===7` branch, which exists for
     dungeon doors and happens to match the overworld cave-mouth tile.

     ASKED HERE, THE MOMENT A STEP IS REFUSED, and deliberately NOT from a1mBump, which was tried
     first and is measurably the wrong hook for three separate reasons:
       - a1mSlide runs before the bump, and beside a town with any painted mass near it the field
         gradient is non-zero, so she glides along the wall and `slid` is true -- the bump never
         fires. Greenhollow, Millbrook and Coastal Reef all failed this way, intermittently.
       - the bump probes a fixed A1M_FOOT+2 px past her soles, so whether it lands in the door cell
         depends on how many pixels short of it the collider happened to stop her: measured 14 px
         short at Coastal Reef and 7 px at Whispering Woods, either side of the probe's reach.
       - a1mFree tests her SOLES while heroTile is derived from her CENTRE, one cell north, so she
         can park her centre inside the door cell without her feet ever entering it. Then the cell
         changes exactly once, transitionCooldown eats that single query, and nothing asks again.
     So the target is derived the way the ENGINE derives it -- the sole cell plus one cardinal
     step, its own `heroTileX + dx` -- and it is retried while she keeps pushing rather than asked
     once. The 300 ms debounce is what keeps checkTransition (which CONSUMES transitionCooldown on
     every call) off the per-substep path; the engine itself asks once per step, so this is the
     more conservative of the two. No tile list: whatever checkTransition answers for is what
     opens, so the owner's eight doors, the base game's connections and anything added later all
     work without naming a single id. */
  var a1mDoorAt=0;
  function a1mAsk(scene,cx,cy){
    var row=scene.mapData[cy]; if(!row||row[cx]===undefined) return null;
    var tr=null; try{ tr=scene.checkTransition(cx,cy); }catch(e){}
    if(!tr) return null;
    var ddx=cx-scene.heroTileX, ddy=cy-scene.heroTileY;                      // face it, like a step would
    if(Math.abs(ddx)+Math.abs(ddy)===1) scene.heroDir=ddx?(ddx>0?2:1):(ddy>0?0:3);
    return tr;
  }
  function a1mDoor(scene,m,x,y,dx,dy){
    if(!m.ow || (!dx && !dy)) return false;
    var now=Date.now(); if(now-a1mDoorAt<300) return false;
    a1mDoorAt=now;
    // FROM heroTileX/heroTileY, which is the engine's own notion of where she is and the thing
    // `heroTileX + dx` is built on -- NOT from her soles. The two are a cell apart: collision is
    // tested at the soles while heroTile comes from her CENTRE (see a1mStep's note), so a
    // sole-derived target asks about the cell BEYOND the door and the door never answers.
    var cx=scene.heroTileX, cy=scene.heroTileY;
    if(Math.abs(dx)>=Math.abs(dy)) cx+=(dx>0?1:-1); else cy+=(dy>0?1:-1);
    var tr=a1mAsk(scene,cx,cy);
    // AND HER OWN CELL, second. Because collision is at the soles, her centre can come to rest
    // INSIDE a door cell without her feet entering it; a1mStep then asks about that cell exactly
    // once, on the frame the tile changed, and transitionCooldown is free to eat that single
    // query -- after which nothing ever asks again and she is parked in the doorway. Measured at
    // the Crystal gate and Whispering Woods, both of which stalled on heroTile == the door cell.
    if(!tr) tr=a1mAsk(scene,scene.heroTileX,scene.heroTileY);
    if(!tr) return false;
    try{ scene.performTransition(tr); }
    catch(e){ if(window.__DQ_DEBUG__) console.log('a1 door '+e); return false; }
    return true;
  }
  /* ---- THE INTERACT BUTTON -- a tap the player CHOOSES, replacing bump as the primary path ----
     Owner, verbatim, after build 29: chests/plaques/the boss/the save crystal "cannot be
     interacted with reliably", and the fix he specified is "make an interaction button (open,
     read, battle, etc.) popup when the player touches the asset so players can clearly choose
     when to interact with the thing". This is that button. It does NOT replace a1mBump/a1mDoor
     above (desktop and existing muscle memory still work; see a1mBump's t===14 addition), it adds
     a second, more reliable path for touch: a pill that appears the instant she is within reach of
     an object and disappears the instant she is not, naming the exact verb for what it does.

     WHY A NEW ROUTE RATHER THAN JUST FIXING THE BUMP. Both known failure modes were structural to
     bumping, not tuning: a1mSlide can absorb the collision before the bump ever fires (see
     a1mDoor's note, three paragraphs up, for the same failure against doors), and the probe reach
     is a fixed A1M_FOOT+2 px that a player can under- or over-shoot depending on exactly where the
     collider stopped her. A button keyed off PROXIMITY rather than a blocked step sidesteps both:
     it is asked every frame, not once per debounced bump, and "in reach" is the same soles-probe
     a1mBump already uses, just evaluated as a query instead of a one-shot event.

     WHY IT DOES NOT SIT WHERE THE TOWN'S "Talk to X" PROMPT DOES. Same idiom (a fading pill,
     centred, one line, the verb doing the work -- see act1-hifi/town.html's #prompt, which the
     owner already approved and asked this not to reinvent), different geometry, because this
     screen has two more elements the town's own iframe does not: the parent stick (172px tall,
     bottom: 76px + safe-area) and the field tab bar (~62px + safe-area, z-index 90) both sit UNDER
     it here. Centring at the town's 22%-from-bottom would land inside the stick's box on many
     screen heights. Sitting above the stick's own top edge (248px + safe-area) with 12px clear
     avoids both regardless of ctrl-left/right/center, so this does not need to know which side the
     stick is on today or after it moves.

     WHY tryOpenTreasure/tryBossInteract/tryReadPlaque ARE CALLED DIRECTLY, BUT THE CRYSTAL GOES
     THROUGH scene.interact(). The first three are scene methods that take an explicit (x,y) and
     never read heroTileX/heroTileY, so calling them with the coordinates THIS probe found is exact
     -- no re-derivation, no drift. The crystal has no such method: its whole branch lives inline in
     interact(), which recomputes its target from heroTileX/heroTileY + heroDir -- and heroTileX/Y
     is the sprite CENTRE while this probe reads the SOLES (a1mStep's own note: about 31px apart),
     so the two can name different cells for the exact same tap. Rather than accept that gap for the
     one tile type that cannot take an explicit target, heroTileX/heroTileY are pinned to the cell
     that makes interact()'s own derivation land exactly on the probed cell, then restored in a
     finally -- so a1mStep's per-frame re-sync (from the sprite centre, next frame) never sees the
     substitution and never mistakes it for a real step. */
  /* THE INTERACT PROMPT SPEAKS THE PLAYER'S LANGUAGE. Owner, build 48: "the buttons that appear
     when getting close to an asset for interaction do not have the i18n yet and are showing english
     even in japanese setting."

     These verbs could not simply become Z() keys: the shipped bundle carries the whole locale table
     and it is FROZEN, so a new key would resolve to nothing and the button would read
     "prompt.open". `menu.save` DOES exist in all three variants and is used directly below; the rest
     are carried here, which is the same thing the crystal dialog already does for its own strings.

     LOCALE IS `en`/`ja` AND KANJI IS A SEPARATE FLAG -- read from the bundle rather than assumed.
     Its own selector is `Ln === "ja" && kanji && Da[k] ? Da[k] : Ba[Ln][k] ?? Ba.en[k]`, i.e. the
     kanji table is an overlay on ja, not a third locale. Mirroring that here is what keeps the
     prompt in step with every other string when the player toggles kanji mode mid-game.

     Register matched to the shipped strings: `ja` is spaced kana for young readers (the shipped
     "きろくした！HPが かんぜんに かいふくした！"), `jaKanji` uses kanji. The verbs are the standard
     JRPG command set, which is what a player of this genre expects to see on a chest or a plaque. */
  var A1M_VERB_I18N={
    en:      {4:'Open',   7:'Battle',  18:'Read', warp:'Warp',   any:'Interact'},
    ja:      {4:'あける', 7:'たたかう', 18:'よむ', warp:'ワープ', any:'しらべる'},
    jaKanji: {4:'開ける', 7:'戦う',     18:'読む', warp:'ワープ', any:'調べる'}
  };
  function a1mVerbTable(){
    var Q=window.__QOK;
    var loc=(Q&&Q.loc&&Q.loc())||'en';
    if(loc!=='ja') return A1M_VERB_I18N.en;
    var st=null; try{ st=Q&&Q.state&&Q.state(); }catch(e){}
    var kanji=!!(st&&st.player&&st.player.state&&st.player.state.kanjiMode);
    return kanji?A1M_VERB_I18N.jaKanji:A1M_VERB_I18N.ja;
  }
  // Tile -> verb. `Save` is NOT here: menu.save ships in every locale, so it goes through Z() below
  // and cannot drift from the save wording used everywhere else in the game.
  var A1M_PROMPT_VERB={4:'Open',7:'Battle',14:'Save',18:'Read'};
  var A1M_PROMPT_TILE={4:1,7:1,14:1,18:1};
  /* ---- THE TWO CRYSTALS ARE DIFFERENT OBJECTS, AND ONE OF THEM STARTS DEAD -----------------------
     Owner, build 36: "it can be interacted with even when it is not activated, so this is a bug. the
     entrance crystal has no saving ability and only sends the player to the crystal near the boss (no
     healing ability as well). the entrance crystal cannot be interactable until it is activated
     (interacting with the crystal near the boss)."

     This SUPERSEDES the earlier answer recorded in a1mCrystalChoose ("activating a crystal still
     saves and full-heals ... activation is what switches it to its lit state"), which is now true of
     the BOSS-FLOOR crystal only. The settled split:

       boss-floor crystal  save + full heal + ACTIVATES the entrance crystal
       entrance crystal    inert and non-interactable until activated; then teleport to the boss
                           floor's crystal and nothing else -- no save, no heal

     The flag already existed and was already written; it simply gated NOTHING, which is the bug he
     found. It was also written by the wrong crystal (the entrance one activated itself on first use,
     so it could never be dormant in practice), so both halves move here.

     WHY floor 1 vs floor > 1 IS THE WHOLE TEST, measured off act1-dungeon-floors.json rather than
     assumed: each of the four A1D_MAPS dungeons carries EXACTLY TWO "save" assets -- one on f1 and
     one on its final floor, which is also the floor carrying the "boss" asset. There is no third
     crystal and no mid-floor crystal anywhere in them, so "not floor 1" IS "the crystal near the
     boss" for every dungeon this layer touches. crystalCave is deliberately outside A1D_MAPS (it has
     no f1 crystal at all) and keeps the generic behaviour untouched. */
  function a1mCrystalDormant(scene){
    if(!scene || (scene.currentFloor||1)!==1 || !A1D_MAPS[scene.currentMapId]) return false;
    var Q=window.__QOK, tt=Q&&Q.state&&Q.state();
    var flags=tt&&tt.player&&tt.player.state&&tt.player.state.storyFlags;
    return !(flags && flags['entrance.crystal.'+scene.currentMapId+'.activated']);
  }
  // Is THIS crystal the entrance one (floor 1 of a dungeon that has the new f1 asset)? Only reached
  // once a1mCrystalDormant has already refused the un-activated case, so it means "activated".
  function a1mCrystalIsEntrance(scene){
    return !!(scene && (scene.currentFloor||1)===1 && A1D_MAPS[scene.currentMapId]);
  }
  var a1mPromptEl=null, a1mPromptStyled=false, a1mPromptTarget=null, a1mPromptScene=null;
  function a1mEnsurePromptStyle(){
    if(a1mPromptStyled) return; a1mPromptStyled=true;
    var s=document.createElement('style');
    // Visual language matches the town prompt (pill, fade, one line) with this screen's own
    // gold accent (stick/tabs) rather than the town iframe's blue, since it sits among them.
    s.textContent =
      '#a1mInteract{position:fixed;left:50%;'+
      'bottom:calc(260px + env(safe-area-inset-bottom,0px));'+
      'transform:translateX(-50%);padding:10px 22px;border-radius:999px;'+
      'background:rgba(21,22,28,.88);border:1px solid rgba(201,169,97,.55);'+
      'color:#f0e6c8;font-size:15px;font-weight:500;letter-spacing:.02em;white-space:nowrap;'+
      'box-shadow:0 0 10px rgba(0,0,0,.4);opacity:0;pointer-events:none;'+
      'transition:opacity .12s ease;touch-action:manipulation;-webkit-tap-highlight-color:transparent;'+
      '-webkit-user-select:none;user-select:none;z-index:5;}'+
      '#a1mInteract.a1m-show{opacity:1;pointer-events:auto;}'+
      '#a1mInteract:active{background:rgba(46,38,20,.94);}';
    document.head.appendChild(s);
  }
  function a1mPromptActivate(){
    var target=a1mPromptTarget, scene=a1mPromptScene;
    a1mPromptHide();
    if(!target||!scene||!scene.scene) return;
    a1mDispatchInteract(scene,target);
  }
  function a1mEnsurePrompt(){
    if(a1mPromptEl) return a1mPromptEl;
    a1mEnsurePromptStyle();
    var host=document.getElementById('touch-controls')||document.body;
    var el=document.createElement('div');
    el.id='a1mInteract'; el.setAttribute('role','button'); el.setAttribute('aria-hidden','true');
    // pointerdown, like the town prompt: answers on contact and preventDefault stops it becoming
    // a synthetic click / text selection / double-fire with a touch's own click event.
    el.addEventListener('pointerdown', function(e){ e.preventDefault(); e.stopPropagation(); a1mPromptActivate(); });
    host.appendChild(el);
    return (a1mPromptEl=el);
  }
  function a1mPromptHide(){
    if(a1mPromptEl) a1mPromptEl.classList.remove('a1m-show');
    a1mPromptTarget=null; a1mPromptScene=null;
  }
  /* ---- REACH, PER OBJECT (item 1: "the area is way too small... especially the plaque") -------
     The old probe (A1M_FOOT+2 = 14px) sampled a single point in ONE of 4 cardinal directions --
     smaller than the just-fixed bump reach (A1M_BUMP_REACH, 24px) it was supposed to share, and
     the same fixed number for every object regardless of how big it reads on screen. A stone
     tablet drawn edge-to-edge across most of its 48px tile does not feel reachable only from the
     one pixel dead-centre of its south face.
     So this scans every nearby CELL (not one ray per direction) and measures true distance from
     the hero's soles to each candidate's centre, filtered by a reach that varies BY TILE TYPE --
     chest/boss/save get a healthy bump over the old probe, the plaque (reported explicitly) gets
     the most, since it is the widest asset and the one the owner named. Picking the closest
     candidate (not the first one found in a direction order) is what keeps two nearby
     interactables from racing: whichever centre is nearer wins outright, and "nearest centre" is
     also the documented tie-break, so there is nothing left to break a tie with.
     A light line-of-sight check (a1mFree at the segment midpoint) stops the generous plaque radius
     from reaching through a wall into a parallel corridor -- real risk once reach exceeds one
     tile's clearance, even though no two DIFFERENT objects sit closer than ~4.5 tiles anywhere in
     Act 1 (measured against act1-dungeon-floors.json), so same-object false positives were never
     the actual exposure; through-wall pickup of the SAME object from a room it is not in is.

     THE FLOOR THE NUMBERS ARE MEASURED AGAINST: reach compares against the target's CENTRE, not
     its near edge, and an object cell is blocked (a1mFree's A1M_PROP branch) at the exact tile
     boundary rather than by the rock distance-field -- so the closest she can ever stand is that
     boundary, 24px (half a cell) short of the centre, and the SAME 24px of soles-to-boundary
     clearance the bump fix above measures (A1M_BUMP_REACH's 22-24px) applies before that. A probe
     under about 48px therefore cannot even match a natural walk-up-and-stop, let alone read as
     generous. MEASURED LIVE, the 48px floor was still not enough: the Y term is taken at the
     SOLES (gy = y + a1mFootDy, ~31px south of the sprite centre, same as a1mFree/a1mBump), so an
     object one cell away but roughly level with her sprite reads more like 57px once that offset
     is in the distance, not 48 -- standing one tile west of Sunken Cellar B3F's own save crystal,
     centre-to-soles measured 57.1px, over a first attempt at 56. The numbers below clear THAT
     floor with real margin, plaque more than the rest. */
  /* ---- CONTACT, NOT PROXIMITY -- and the number is BORROWED, not chosen -------------------------
     ~~"All four at 64 -- owner: drop the plaque to 64 like the others."~~ RETIRED, build 36, by the
     owner testing it: "the plaque is readable before touching it. i want it to be readable only when
     the player touches it (bumps into it)" and "same with the entrance crystal, which is worse
     because it is interactable way before bumping into it."

     Both reports are the same defect and it is not the size of the number, it is WHAT IT MEASURES.
     64px from the tile CENTRE reaches 40px past the edge of a 48px tile -- most of a cell of open
     floor in every direction -- so the prompt was always going to appear before she arrived. No
     value of a centre-measured reach fixes that: shrink it far enough to kill the forward zone and
     it stops covering the object's own width, which is the build-35 complaint this replaced.

     So measure to the tile RECT (zero anywhere inside it, a uniform margin on every side) and set
     that margin to A1M_BUMP_REACH -- the SAME probe a1mBump walks forward from her soles to find
     the thing she just walked into. That makes the two systems one definition rather than two
     numbers that have to be kept in sympathy:

         a1mBump's probe point sits A1M_BUMP_REACH from her soles along her heading. If that point
         is inside the object's tile, then the nearest point of that tile is at most A1M_BUMP_REACH
         away. So "rect distance <= A1M_BUMP_REACH" is exactly "a bump in SOME direction from here
         would register" -- the prompt now appears precisely when touching it would work, which is
         what he asked for, stated in the code rather than approximated by a constant.

     A1M_BUMP_REACH is itself derived (A1M_FOOT + A1M_LEAN + A1M_STEP + 2 = 24): the furthest she
     can come to rest from an object she has walked straight into, once the lean term and one
     un-refused collision substep are paid. It is a WORST case, so the typical resting position is
     nearer and the prompt is not marginal.

     ~~"22px would match NOTHING -- adjacency already costs 24px."~~ That arithmetic measured the
     wrong thing. 24px is where an ADJACENT TILE'S CENTRE sits, and she never stands there when she
     is pressed against an object. Her RESTING distance is the quantity that matters, so it was
     measured rather than reasoned about.

     THE MEASUREMENT, AND WHY THERE ARE TWO NUMBERS AND NOT ONE. Sweeping every interactable in all
     four A1D_MAPS dungeons on both floors, walking the sole point in against a1mFree itself (the
     mover's own predicate, so the answer cannot drift from the mover's behaviour) and recording the
     closest position it accepts, the 134 approachable orthogonal sides come out sharply bimodal:

         chest    96 sides   95 at contact < 1 px
         crystal  26 sides   25 at contact < 1 px
         boss     12 sides   12 at contact < 1 px
         plaque    4 sides    4 at contact 10-15 px      <- the odd one out
         (the remaining 7 sides sit at 40+ px: those are walls, not approaches)

     The plaque is different for a reason already recorded in this file: its marker cell reads
     BLOCKED in the walk mask, because the sign is mounted in the wall, so the clearance term stops
     her a foot-width short. Every other object's marker stands on open floor and she reaches its
     tile edge. ONE margin therefore cannot serve both -- it is either too tight for the plaque or,
     as the owner reported, a half-cell too generous for the crystal, which is exactly why he called
     the crystal the worse of the two.

     From a contact boundary, her resting position can sit one collision substep (A1M_STEP) plus one
     outward slide correction (A1M_LIFT) further out, both bounded and both already constants here.
     So each margin is contact + A1M_STEP + A1M_LIFT, rounded up:

         plaque   15 + 6 + 3 = 24  ->  27   (a live walk into Sunken Cellar B1F's plaque rested at 24.7)
         others    0 + 6 + 3 =  9  ->  12

     The 3 px of headroom in each is deliberate slop, not a fudge: the field is an integer chamfer
     quantised to thirds of a pixel, so the boundary it reports is good to about a pixel. */
  var A1M_PROMPT_SLOP=A1M_STEP+A1M_LIFT+3;                   // 12 = substep + slide lift + 3px of quantisation
  var A1M_PROMPT_MARGIN_DEFAULT=0+A1M_PROMPT_SLOP;           // 12: contact 0, marker stands on open floor
  var A1M_PROMPT_MARGIN={18:15+A1M_PROMPT_SLOP};             // 27: contact 15, the plaque sits inside masked rock
  var A1M_PROMPT_MARGIN_MAX=(function(){                     // widest of the above, for the scan span
    var w=A1M_PROMPT_MARGIN_DEFAULT;
    for(var k in A1M_PROMPT_MARGIN) if(A1M_PROMPT_MARGIN[k]>w) w=A1M_PROMPT_MARGIN[k];
    return w; })();
  function a1mNearbyInteract(scene,m){
    var hero=scene&&scene.hero; if(!hero||!hero.scene||!scene.mapData) return null;
    var x=hero.x, y=hero.y, gy=y+a1mFootDy(scene);
    var span=Math.ceil((A1M_PROMPT_MARGIN_MAX+TILE)/TILE)+1;
    var cx=(x/TILE)|0, cy=(gy/TILE)|0;
    var best=null, bestDist=Infinity;
    for(var ty=cy-span; ty<=cy+span; ty++){
      var row=scene.mapData[ty]; if(!row) continue;
      for(var tx=cx-span; tx<=cx+span; tx++){
        var t=row[tx]; if(t===undefined || !A1M_PROMPT_TILE[t]) continue;
        if(t===14 && a1mCrystalDormant(scene)) continue;                    // dormant entrance crystal: not interactable at all
        var ccx=tx*TILE+TILE/2, ccy=ty*TILE+TILE/2;
        var ddx=ccx-x, ddy=ccy-gy;
        // Distance to the tile RECT, not to its centre: 0 anywhere inside the cell, and the same
        // margin on every side including the one she has to approach along a wall.
        var ex=Math.max(Math.abs(ddx)-TILE/2,0), ey=Math.max(Math.abs(ddy)-TILE/2,0);
        var dist=Math.sqrt(ex*ex+ey*ey);
        if(dist>(A1M_PROMPT_MARGIN[t]||A1M_PROMPT_MARGIN_DEFAULT) || dist>=bestDist) continue;
        // THE PLAQUE'S LEFT SIDE WAS THE LINE-OF-SIGHT GUARD, not the range. Owner, build 35: "the
        // plaque just needed to be tappable on all surfaces but the left side was not tappable."
        // A plaque is mounted ON A WALL, so standing beside it instead of square in front puts that
        // wall at the midpoint of the hero->object segment, and the clearance test below then throws
        // the approach away. Ranges are unchanged from build 35 at his instruction; only this guard
        // is scoped. 72px is one and a half cells: an orthogonally adjacent object sits at 48 and a
        // diagonal one at 68, so every adjacent square is exempt while the plaque's outer band still
        // gets a real wall test, which is the case the guard exists for.
        if(m && dist>TILE*1.5){                                             // LOS: reject only a clear wall crossing
          // m.dist is a Uint16Array chamfer distance from rock, in THIRDS of a pixel (0 at the
          // rock pixel itself, growing with clearance -- see a1mBuild). It can never be negative,
          // so the guard has to be a clearance floor, not a sign check. A1M_FOOT*A1M_CH is the
          // same base clearance a1mFree requires everywhere else; the segment MIDPOINT falling
          // under it means real rock sits between the hero and the object, not just that the
          // object itself (which the mask marks as open floor, per A1M_PROP) is close to a wall.
          var mx=x+ddx*0.5-m.ox, my=gy+ddy*0.5-m.oy;
          var gx=mx|0, gyy=my|0;
          if(gx>=1 && gyy>=1 && gx<m.W-1 && gyy<m.H-1 && m.dist[gyy*m.W+gx] < A1M_FOOT*A1M_CH) continue;
        }
        var dx=0, dy=0;
        if(Math.abs(ddx)>=Math.abs(ddy)) dx=ddx>0?1:-1; else dy=ddy>0?1:-1; // dominant axis, for facing
        bestDist=dist; best={tx:tx,ty:ty,t:t,dx:dx,dy:dy};
      }
    }
    return best;
  }
  function a1mDispatchInteract(scene,target){
    if(!scene||!target) return;
    var tx=target.tx, ty=target.ty, t=target.t, dx=target.dx, dy=target.dy;
    if(dx||dy) scene.heroDir=dx?(dx>0?2:1):(dy>0?0:3);                     // face it, like a step would
    try{
      if(t===4){ scene.tryOpenTreasure(tx,ty); return; }
      if(t===7){ scene.tryBossInteract(tx,ty); return; }
      if(t===18){ scene.tryReadPlaque(tx,ty); return; }
      if(t===14){ a1mCrystalTouch(scene,tx,ty,dx,dy); return; }
    }catch(e){ if(window.__DQ_DEBUG__) console.log('a1 prompt dispatch '+e); }
  }
  /* ---- ITEM 3: THE CRYSTAL ASKS BEFORE IT ACTS ------------------------------------------------
     Owner: "the save crystal works but immediately sends the player out the dungeon without
     letting them select whether to cancel or save and teleport to the entrance. the UI is still
     pc facing so this needs to be changed to a tappable phone first UI."

     THE MECHANISM, FOUND IN THE FROZEN BUNDLE, NOT GUESSED. WorldMapScene wires exactly one
     confirm path for its canvas menus (quest/mid-crystal/warp/healer/item), and it is a raw
     `pointerdown` on the WHOLE SCENE, unconditional on where the tap landed:
         s.input.on("pointerdown", function(){
           if (s.midCrystalOverlayOpen) return s.confirmMidFloorCrystalOption();
           if (s.warpOverlayOpen) return s.confirmWarpOption();  ... });
     That is a mouse-click idiom (click precisely on the button you want) ported unchanged to
     touch, where it means something else entirely: the instant `showMidFloorCrystalMenu()` opens
     (index 0, "Warp to entrance", pre-selected), the player's very next touch ANYWHERE -- most
     likely their thumb landing back on the analog stick to keep walking -- confirms option 0 and
     ejects them. There is no PC/phone difference in the menu's rendering; the difference is that
     a mouse click is aimed and a re-touched stick is not. This is "immediately sends the player
     out" exactly as reported, and it is why a phone-first replacement means never letting that
     menu open at all, not styling it.

     THE FIX REUSES THE BUNDLE'S OWN TRANSITION CODE RATHER THAN REIMPLEMENTING IT. confirmWarp-
     Option()/confirmMidFloorCrystalOption() do the real work (fade, floor swap, loadMap, hero
     reposition) driven purely by state (`warpOverlayIndex`/`warpFloors`,
     `midCrystalOverlayIndex`) -- neither reads anything about the menu being visually open. So
     this sets that state directly and calls the confirm method WITHOUT ever setting
     `warpOverlayOpen`/`midCrystalOverlayOpen`, which is also what keeps WorldMapScene's own
     vulnerable pointerdown listener inert: it gates on those exact flags. For the "Save Here"
     choice on a mid-floor crystal, interact() is the only path that carries the save+flag+heal
     side effects, and it opens the menu unconditionally as part of that -- so it is allowed to
     run, then the resulting menu is closed in the same synchronous tick, before any later input
     can reach it. */
  var A1M_CRYSTAL={ el:null, styled:false, open:false };
  function a1mCrystalEnsureStyle(){
    if(A1M_CRYSTAL.styled) return; A1M_CRYSTAL.styled=true;
    var s=document.createElement('style');
    // Colours match #qok-ui's own palette (ui-overhaul.css :root vars) by VALUE, not by
    // inheritance -- this modal lives outside #qok-ui's subtree (it can open mid-exploration,
    // with no menu overlay active), so those custom properties are not in scope here.
    s.textContent =
      // pointer-events:auto IS LOAD-BEARING, not decoration. index.html sets
      // `#touch-controls{pointer-events:none}` as its baseline (a container that spans the
      // full screen must default to none, or it would eat every tap meant for the canvas
      // beneath it) and every child that needs taps opts back in explicitly -- .stick does
      // (index.html), a1mInteract's own .a1m-show rule does. This modal is appended into that
      // same container and, without its own opt-in, inherited the parent's none: MEASURED on
      // device, every tap on a button inside it -- geometrically correct, right coordinates,
      // right element underneath -- hit-tested straight through to the Phaser canvas behind
      // it instead, because inherited pointer-events:none makes an element (and its subtree)
      // invisible to hit-testing entirely, not merely un-styled. A `<button>` element, a
      // pointerdown-vs-pointerup listener, none of that was ever the actual defect; this line
      // was the whole fix, and the modal was never reachable by touch without it.
      '#a1mCrystal{position:fixed;inset:0;z-index:95;display:flex;align-items:center;'+
      'justify-content:center;background:rgba(8,8,13,.6);padding:24px;box-sizing:border-box;'+
      'pointer-events:auto;}'+
      '#a1mCrystal .card{width:100%;max-width:300px;background:#1d1f27;'+
      'border:1px solid rgba(201,169,97,.40);border-radius:16px;padding:18px;'+
      'box-shadow:0 10px 34px rgba(0,0,0,.55);}'+
      '#a1mCrystal .hd{font-size:15px;font-weight:700;color:#c9a961;text-align:center;'+
      'letter-spacing:.02em;margin-bottom:14px;}'+
      // [role="button"], NOT a native <button> -- see addBtn's own note for why.
      '#a1mCrystal [role="button"]{display:block;width:100%;box-sizing:border-box;'+
      'border:1px solid rgba(201,169,97,.40);border-radius:12px;padding:14px;text-align:center;'+
      'font-size:14px;font-weight:700;color:#e8e2d4;background:#ffffff0d;margin-top:9px;'+
      'touch-action:manipulation;-webkit-tap-highlight-color:transparent;-webkit-user-select:none;'+
      'user-select:none;cursor:pointer;}'+
      '#a1mCrystal [role="button"].primary{background:#557e63;border-color:#557e63;color:#f2f6f3;}'+
      '#a1mCrystal [role="button"].cancel{background:transparent;color:#a49e91;font-weight:500;}'+
      '#a1mCrystal [role="button"]:active{filter:brightness(1.18);}';
    document.head.appendChild(s);
  }
  function a1mCrystalHide(){
    if(A1M_CRYSTAL.el){ try{ A1M_CRYSTAL.el.remove(); }catch(e){} A1M_CRYSTAL.el=null; }
    A1M_CRYSTAL.open=false;
  }
  // Which OTHER crystals this run has already activated, mirroring the bundle's own scan
  // (interact()'s floor-1 branch) but read from OUR floors.json record for totalFloors rather
  // than reaching into the bundle's private Xt table.
  function a1mCrystalWarpTargets(scene){
    var Q=window.__QOK, tt=Q&&Q.state&&Q.state();
    var flags=tt&&tt.player&&tt.player.state&&tt.player.state.storyFlags;
    var out=[]; if(!flags) return out;
    var fl=a1dFloorFor(scene), total=(fl&&fl.totalFloors)||1, mapId=scene.currentMapId;
    for(var c=2;c<=total;c++) if(flags['warp.'+mapId+'.f'+c]) out.push(c);
    if(flags['warp.'+mapId+'.boss']) out.push(-1);
    return out;
  }
  // The same pre-drift heroTileX/heroTileY substitution a1mBump/a1mDispatchInteract always used
  // before calling interact() directly (see a1mDispatchInteract's own note): interact() re-derives
  // its target from heroTileX/heroTileY + heroDir, which is a cell behind where the soles-based
  // probe actually found the crystal.
  function a1mCrystalInteract(scene,tx,ty,dx,dy){
    var savedX=scene.heroTileX, savedY=scene.heroTileY;
    scene.heroTileX=tx-dx; scene.heroTileY=ty-dy;
    try{ scene.interact(); } finally { scene.heroTileX=savedX; scene.heroTileY=savedY; }
  }
  // Where floor 1's OWN crystal actually stands, for the four dungeons it was added to (see
  // a1dEntranceCrystalTick below) -- one tile SOUTH of the crystal's own MARKER cell
  // (A1M_PROP-blocked, like every other prop, so the marker's own cell is never a legal landing
  // spot), open floor, facing north toward it.
  //
  // THE MARKER SITS ON WALKABLE FLOOR; ONLY THE PICTURE SITS IN THE WALL. Owner correction,
  // mid-build: the crystal must read as "embedded in the wall face, the same way the plaque is."
  // A first pass achieved that by moving the marker TILE itself into the wall row (mirroring the
  // plaque's own marker cell) -- and broke interaction: MEASURED via the interact-prompt system,
  // `<floor>-walk.png` (the continuous-collision mask a1mBuild reads, NOT mapData) reads BLOCKED
  // at the plaque's own marker cell (21,21) here, same as the wall around it, unlike every chest
  // marker checked (which reads WALKABLE, matching this file's own design note a few hundred
  // lines up: "a chest, a boss marker, a plaque and a save crystal are OBJECTS standing on a
  // cell... not terrain"). A marker cell inside masked rock leaves the hero's soles too far from
  // it for a1mNearbyInteract's reach margin, or fails its line-of-sight clearance test outright --
  // confirmed on-device: an object placed there is approached but never shows its interact prompt
  // and cannot be bumped either. The plaque already ships with this same latent defect; it is out
  // of this file's scope to fix, but the crystal does not have to repeat it.
  // So the marker (act1-dungeon-floors.json's "save" asset) stays on the walkable floor cell one
  // row south of the sign -- exactly where the very first, pre-correction pass put it, and where
  // it is provably interactive -- and only the DRAWN SPRITE moves into the wall row above it
  // (a1dEntranceCrystalTick's own anchor math). This is the same split drawPlaque() already uses
  // for the plaque itself: its marker tile and its drawn picture are not the same cell either.
  var A1M_ENTRANCE_LANDING={
    sunkenCellar:{x:22,y:23}, coastalReef:{x:60,y:11},
    mistyGrotto:{x:38,y:25}, whisperingWoodsCave:{x:14,y:25}
  };
  function a1mCrystalChoose(scene,tx,ty,dx,dy,action,payload){
    a1mCrystalHide();
    try{
      if(action==='cancel') return;
      // THE BOSS-FLOOR CRYSTAL IS WHAT LIGHTS THE ENTRANCE ONE.
      // ~~"Any non-cancel choice on FLOOR 1's crystal counts"~~ -- retired at the source, build 36.
      // That made the entrance crystal activate ITSELF on first use, so it was never dormant and the
      // flag gated nothing. Owner: "the entrance crystal cannot be interactable until it is activated
      // (interacting with the crystal near the boss)". So activation is written HERE, by the other
      // crystal: floor > 1 in an A1D_MAPS dungeon is the boss-floor crystal and the only other one
      // that exists (see a1mCrystalDormant's header for the count off act1-dungeon-floors.json).
      // Any non-cancel choice counts, Save or Warp to entrance -- touching it IS interacting with it.
      // a1dEntranceCrystalTick (drawDungeon section) reads this flag every tick to choose the dormant
      // vs lit sprite.
      if((scene.currentFloor||1)>1 && A1D_MAPS[scene.currentMapId]){
        var Q1=window.__QOK, tt1=Q1&&Q1.state&&Q1.state();
        var flags1=tt1&&tt1.player&&tt1.player.state&&tt1.player.state.storyFlags;
        if(flags1){
          var fkey='entrance.crystal.'+scene.currentMapId+'.activated';
          if(!flags1[fkey]){ flags1[fkey]=true; try{ tt1.saveGame(); }catch(e){} }
        }
      }
      /* THE ENTRANCE CRYSTAL'S ONE AND ONLY EFFECT. Owner: it "only sends the player to the crystal
         near the boss (no healing ability as well)" and "has no saving ability". So this branch
         deliberately does NOT go through a1mCrystalInteract -- interact() is the bundle's own crystal
         handler and it saves, plays the save sfx, full-heals and raises the save VFX before it does
         anything else. Reaching it at all would re-add both abilities he just removed.

         confirmWarpOption() alone is the whole teleport: read from the bundle (offset 4684831) it
         takes warpFloors[warpOverlayIndex], fades out, sets currentFloor, resets encounters, reloads
         the map and drops the hero one row SOUTH of that floor's crystal tile -- which is the
         landing he described, since the boss floor's only crystal is the one beside the boss.

         The floor number is passed explicitly rather than via the bundle's -1 sentinel. Both end up
         at `T.floors` and the sentinel is one line shorter, but -1 means "the boss is DEAD" in the
         bundle's own vocabulary: `warp.<mapId>.boss` is written by BattleScene on a boss defeat
         (offset 4837235), not by any crystal. Borrowing it here would tie this warp to a flag that
         means something else, which is how the stale-claim problems in this repo start. */
      if(action==='warpBoss'){
        var flb=a1dFloorFor(scene), bossFloor=(flb&&flb.totalFloors)||1;
        if(bossFloor>1 && typeof scene.confirmWarpOption==='function'){
          scene.warpFloors=[bossFloor]; scene.warpOverlayIndex=0;
          scene.confirmWarpOption();
        }
        return;
      }
      if(action==='save'){
        var floor=scene.currentFloor||1;
        if(floor===1 && a1mCrystalWarpTargets(scene).length===0){
          a1mCrystalInteract(scene,tx,ty,dx,dy);                    // the bundle's own no-menu save branch
        } else if(floor===1){
          // The bundle's floor-1 branch only saves when NO other crystal is active; "Save Here"
          // is offered regardless, so replicate its no-menu save effects directly here (sfx is
          // the one piece left out -- Jt is a module-private bundle singleton this layer cannot
          // reach, unlike tt/Z which QOK() exposes on purpose).
          var Q=window.__QOK, tt=Q&&Q.state&&Q.state();
          if(tt){
            tt.saveGame();
            if(tt.player&&typeof tt.player.fullHeal==='function') tt.player.fullHeal();
            if(typeof scene.updateHUD==='function') scene.updateHUD();
            if(typeof scene._saveVfx==='function') scene._saveVfx(scene.hero.x,scene.hero.y);
            if(typeof scene.showMessage==='function') scene.showMessage((Q.Z&&Q.Z('dungeon.crystalSaveEntrance'))||'Saved!');
          }
        } else {
          // Mid-floor: interact() always saves + sets the warp/entrance-visible flags + opens
          // the vulnerable menu, in that order. Let it run for the side effects, then close the
          // menu it opened in the SAME synchronous tick, before any later touch can reach it.
          a1mCrystalInteract(scene,tx,ty,dx,dy);
          try{ if(scene.midCrystalOverlayOpen && typeof scene.hideMidFloorCrystalMenu==='function') scene.hideMidFloorCrystalMenu(); }catch(e){}
        }
        return;
      }
      if(action==='entrance'){                                      // mid-floor -> floor 1
        scene.midCrystalOverlayIndex=0;
        if(typeof scene.confirmMidFloorCrystalOption==='function'){
          scene.confirmMidFloorCrystalOption();
          /* THE BUNDLE'S OWN LANDING IS WRONG FOR THESE FOUR DUNGEONS -- A BUG, NOT UNSTYLED.
             confirmMidFloorCrystalOption() (dist bundle) lands on
             findDungeonEntrance(castle||tower ? effectiveHeight : 0), and every dungeon this file
             touches is neither castle nor tower, so that call ALWAYS passes 0 -- which makes
             findDungeonEntrance assume the exit door sits in the map's TOP half and step one row
             SOUTH of it to land "inside". Measured live off act1-dungeon-floors.json: sunkenCellar
             f1's mouth (tile 6, the door back to the overworld) is at (20,26), five rows from the
             BOTTOM of a 30-row map, and findDungeonEntrance(0) still returns (20,27) -- one row
             south of the mouth, which is solid rock (row 27 is 28 '#' characters, not open floor).
             That is "the return to entrance action sends the player outside of the dungeon": she
             lands embedded in rock one step past her own exit door, and the collision-recovery /
             door-arrival checks a1mStep and a1mDoor run on the very next frame read that as having
             walked through it.
             This is a bug in a frozen, uneditable bundle (AGENTS.md forbids recompiling it), not a
             design choice, so it is worked around here instead of patched at its source: the
             ORIGINAL call above still runs in full (floor swap, encounter reset, fade tween, sfx --
             real work this file has no reason to reimplement), and a SECOND `camerafadeoutcomplete`
             listener, registered immediately after it returns, queues behind the bundle's own
             listener on the same Phaser EventEmitter and fires in the same synchronous dispatch --
             before the fade-in's first rendered frame -- to overwrite the wrong position with the
             entrance crystal's own landing tile. The player never sees the wrong placement; the
             screen is still opaque black at that point. */
          var landing=A1M_ENTRANCE_LANDING[scene.currentMapId];
          if(landing && scene.cameras && scene.cameras.main){
            scene.cameras.main.once('camerafadeoutcomplete', function(){
              try{
                scene.heroTileX=landing.x; scene.heroTileY=landing.y; scene.heroDir=3; // face north, toward the crystal
                scene.updatePosition(); scene.createHero(); scene.updateCamera();
              }catch(e){ if(window.__DQ_DEBUG__) console.log('a1 entrance landing fix '+e); }
            });
          }
        }
        return;
      }
      if(action==='warp'){                                          // floor-1 hub -> a specific activated floor/boss
        scene.warpFloors=payload.floors; scene.warpOverlayIndex=payload.index;
        if(typeof scene.confirmWarpOption==='function') scene.confirmWarpOption();
        return;
      }
    }catch(e){ if(window.__DQ_DEBUG__) console.log('a1 crystal choose '+e); }
  }
  function a1mCrystalShow(scene,tx,ty,dx,dy){
    if(A1M_CRYSTAL.open) return;
    a1mCrystalEnsureStyle();
    var Q=window.__QOK, Z2=(Q&&Q.Z)||function(k){return k;};
    var floor=scene.currentFloor||1, opts=[];
    if(a1mCrystalIsEntrance(scene)){
      /* ONE OPTION, AND SAVE IS NOT AMONG THEM. Owner, build 36: the entrance crystal "has no saving
         ability and only sends the player to the crystal near the boss (no healing ability as well)".
         a1mCrystalDormant has already refused this menu entirely while the crystal is un-activated,
         so by the time we are here it is lit and the warp is its whole purpose. The per-floor warp
         list below is not offered either: these dungeons have exactly one other crystal, so a list
         would always have been a list of one. */
      opts.push({label:Z2('dungeon.warpBossFloor'), action:'warpBoss'});
    } else if(floor===1){
      // Generic floor-1 crystal in a dungeon OUTSIDE A1D_MAPS. No such dungeon ships today
      // (crystalCave, the only other one with crystals, carries its single crystal on f6), so this
      // is the untouched original path kept for anything added later -- not dead code by accident.
      opts.push({label:Z2('menu.save')||'Save', action:'save'});
      var targets=a1mCrystalWarpTargets(scene);
      for(var i=0;i<targets.length;i++){
        var f=targets[i];
        opts.push({label: f===-1?Z2('dungeon.warpBossFloor'):Z2('dungeon.warpFloor',{floor:f}),
                   action:'warp', payload:{floors:targets,index:i}});
      }
    } else {
      opts.push({label:Z2('menu.save')||'Save', action:'save'});
      opts.push({label:Z2('dungeon.warpToEntrance'), action:'entrance'});
    }
    var el=document.createElement('div'); el.id='a1mCrystal';
    var card=document.createElement('div'); card.className='card';
    var hd=document.createElement('div'); hd.className='hd'; hd.textContent=Z2('dungeon.warpTitle')||'Warp Crystal';
    card.appendChild(hd);
    // Fires on pointerUP, arming on pointerdown rather than acting on it -- matches
    // ui-overhaul.js's own pointerGuard, which already carries this exact lesson for this exact
    // platform in its own words: "route DOM buttons on pointer/touch UP (reliable on iOS -- a
    // click often never fires)". Kept as belt-and-suspenders alongside the pointer-events fix
    // above (a1mCrystalEnsureStyle's own note): that CSS line was the actual defect, but acting
    // on up rather than down costs nothing and matches the rest of the codebase's touch idiom.
    function addBtn(label,onPick){
      var b=document.createElement('div'); b.setAttribute('role','button'); b.textContent=label;
      var armed=false;
      b.addEventListener('pointerdown', function(e){ e.preventDefault(); e.stopPropagation(); armed=true; });
      b.addEventListener('pointerup', function(e){ e.preventDefault(); e.stopPropagation(); if(armed){ armed=false; onPick(); } });
      b.addEventListener('pointercancel', function(){ armed=false; });
      return b;
    }
    for(var j=0;j<opts.length;j++){
      var o=opts[j], b=addBtn(o.label, (function(oo){ return function(){ a1mCrystalChoose(scene,tx,ty,dx,dy,oo.action,oo.payload); }; })(o));
      b.className='primary';
      card.appendChild(b);
    }
    var cancelBtn=addBtn(Z2('dungeon.warpCancel')||'Cancel', function(){ a1mCrystalChoose(scene,tx,ty,dx,dy,'cancel'); });
    cancelBtn.className='cancel';
    card.appendChild(cancelBtn);
    el.appendChild(card);
    // Swallow any tap on the backdrop itself (outside the card) rather than letting it fall
    // through to the stick/canvas underneath -- the whole point is that no touch reaches
    // WorldMapScene while this is up.
    el.addEventListener('pointerdown', function(e){ e.preventDefault(); e.stopPropagation(); });
    (document.getElementById('touch-controls')||document.body).appendChild(el);
    A1M_CRYSTAL.el=el; A1M_CRYSTAL.open=true;
  }
  function a1mCrystalTouch(scene,tx,ty,dx,dy){
    // Belt and braces on the two callers already gated (a1mNearbyInteract, a1mBump): this is the one
    // funnel every crystal interaction passes through, so the dormant rule is restated at the choke
    // point rather than trusted to stay true of both entry paths as they change.
    if(a1mCrystalDormant(scene)) return;
    a1mCrystalShow(scene,tx,ty,dx,dy);
  }
  // DUNGEON ONLY, deliberately -- a1mFor (not a1mAnyFor), so the overworld and any town never grow
  // a second prompt idiom next to their own. Hidden whenever a1mHalted() would also refuse a step:
  // a menu, a message box or the crystal's own warp menu already has her attention.
  function a1mPromptTick(scene){
    var m=null; try{ m=a1mFor(scene); }catch(e){}
    if(!m || a1mHalted(scene)){ a1mPromptHide(); return; }
    var target=null; try{ target=a1mNearbyInteract(scene,m); }catch(e){}
    if(!target){ a1mPromptHide(); return; }
    a1mPromptTarget=target; a1mPromptScene=scene;
    var el=a1mEnsurePrompt();
    // "Save" would be a lie on the entrance crystal now that saving is the one thing it cannot do
    // (a1mCrystalDormant's header). It is only ever reachable here once activated, and its whole
    // effect is the warp, so the button says so.
    var Qp=window.__QOK, Zp=(Qp&&Qp.Z)||function(k){return k;}, verb=a1mVerbTable();
    el.textContent=(target.t===14 && a1mCrystalIsEntrance(scene)) ? verb.warp
                 : (target.t===14) ? (Zp('menu.save')||'Save')
                 : (verb[target.t]||verb.any);
    el.classList.add('a1m-show');
  }
  // Everything the engine's own update() refuses to move under. Kept as one list so a new
  // overlay cannot be added to the bundle and silently leave the hero drivable behind it.
  function a1mHalted(scene){
    return !!(scene.isMoving || scene.showingMessage || scene.itemOverlayOpen
      || scene.healerOverlayOpen || scene.warpOverlayOpen || scene.midCrystalOverlayOpen
      || scene.questOverlayOpen || A1M_CRYSTAL.open
      || (scene.tweens && scene.hero && scene.tweens.isTweening(scene.hero)));
  }
  function a1mStep(scene,dtms){
    var m=a1mAnyFor(scene); if(!m) return;
    var hero=scene.hero; if(!hero||!hero.scene) return;
    var key=a1mStateKey(scene);
    if(!a1mState || a1mState.scene!==scene || a1mState.key!==key)
      a1mState={ scene:scene, key:key, phase:0, bump:0 };
    if(a1mHalted(scene)) return;

    // The hero SPRITE is the position of record. performTransition destroys and recreates it,
    // every entry path re-anchors it, and updateCamera follows it -- so a cached position would
    // silently diverge from the one the game itself believes in.
    var x=hero.x, y=hero.y;
    if(!a1mFree(scene,m,x,y)){ var u=a1mUnstick(scene,m,x,y); if(!u) return; x=u.x; y=u.y; }

    var inp=a1mInput(scene), moved=0;
    if(inp){
      scene.heroDir = Math.abs(inp.x)>Math.abs(inp.y) ? (inp.x>0?2:1) : (inp.y>0?0:3);
      var speed=a1mSpeed();
      // The frame-delta cap has to be bigger than one frame of a SLOW device, not of a fast one.
      // At 0.05 s it silently became a speed limit: measured on the iPhone 17 Pro sim, a straight
      // run covered 111 px/s against the 246 px/s asked for, because the dungeon frame is well
      // over 50 ms there and every frame's travel was being clipped to 0.05 s of it. 0.12 s is
      // safe to give back precisely because the substep loop below exists -- the worst frame it
      // admits is 30 px, walked in 6 px steps against the mask, so nothing can be tunnelled.
      var total=speed*(0.45+0.55*inp.m)*Math.min(0.12,dtms/1000);
      var n=Math.max(1,Math.ceil(total/A1M_STEP)), sx=inp.x*total/n, sy=inp.y*total/n, k;
      for(k=0;k<n;k++){
        var nx=x+sx, ny=y+sy;
        if(a1mFree(scene,m,nx,ny)){ x=nx; y=ny; moved+=Math.sqrt(sx*sx+sy*sy); continue; }
        // The step was refused: give the engine its ASK-FIRST chance before anything glides past
        // the thing she walked into. See a1mDoor -- this is where the town entrances live.
        if(a1mDoor(scene,m,x,y,sx,sy)){ hero.x=x; hero.y=y; return; }
        // Slide rather than stick: give up only what the rock actually took away -- which is the
        // component INTO the wall, not a whole axis. See a1mSlide. The axis retries stay as the
        // fallback for what the tangent cannot serve; they are what used to run alone.
        var slid=false, tg=a1mSlide(scene,m,x,y,sx,sy);
        if(tg && a1mFree(scene,m,x+tg.x,y+tg.y)){
          x+=tg.x; y+=tg.y; moved+=tg.len; slid=true;
        } else {
          if(sx && a1mFree(scene,m,nx,y)){ x=nx; moved+=Math.abs(sx); slid=true; }
          if(sy && a1mFree(scene,m,x,ny)){ y=ny; moved+=Math.abs(sy); slid=true; }
        }
        if(!slid){ a1mBump(scene,m,x,y,sx,sy); break; }
      }
    }
    a1mState.phase += moved;                                                 // EUCLIDEAN px travelled
    // 12 frames = dir*3 + pose (hero-override.js). The cycle and its rate are the town's, held at
    // the locked 125 ms/pose by deriving the flip distance from the speed in force. See A1M_POSE.
    var posePx = a1mSpeed()*(A1M_POSE_MS/1000);
    var pose = moved>0 ? A1M_POSE[Math.floor(a1mState.phase/posePx) % A1M_POSE.length] : 0;
    try{ hero.setFrame(scene.heroDir*3+pose); }catch(e){}
    hero.x=x; hero.y=y;

    // ---- re-derive the tile the rest of the game runs on, and fire the per-step work exactly
    //      once per cell, exactly as the step tween's onComplete did.
    // FROM THE SPRITE CENTRE, NOT THE SOLES -- decided, not defaulted. Colliding at the soles
    // (above) and reporting the tile from the soles are separable, and only the first is the bug.
    // Reporting from the soles is tempting -- it is the cell she visibly stands on, and it would
    // reproduce the shipped tile mapping exactly, since the legal position set is the SAME shape
    // merely shifted 31 px north (measured: 99452 / 71597 / 96037 reachable positions on f1/f2/f3,
    // identical before and after). It breaks on the round trip. The save format is a CELL and
    // createHero places the sprite CENTRE on that cell's centre, so a sole-derived save would
    // reload with the soles 31 px lower, i.e. in the NEXT cell south, which would then be saved --
    // one cell of southward drift per reload, for ever, unless the sprite were also re-anchored on
    // every engine placement (a 31 px visual shift in dungeons only, which is a different change
    // than this one and not one the owner asked for). Centre-derivation is a fixed point instead:
    // 742 of the 754 reportable cells across the three floors reload to themselves, the other 12
    // settle one cell north on the first reload and are fixed points after it, the largest rescue
    // nudge is 28 px (the guard's bound is 96), and no cell falls through to the anchor teleport.
    // WHAT THIS COSTS, stated rather than hidden: (a) a transition still fires when her CENTRE
    // crosses into the cell, exactly as it did before this fix -- i.e. about half a body early
    // walking north, half a body late walking south. That timing is unchanged from the shipped
    // build, so it is not a regression, but it is also not corrected here. All three floors'
    // mouth/stairsUp/stairsDown cells stay reportable and reachable (verified by flood fill).
    // (b) heroTile can now name a cell her body overlaps but her feet are not on -- including a
    // chest or boss cell one row south of her soles. Inert here: the engine's tile-under-the-hero
    // consumers key off 24 (torch), 5 (lava), 27 (quicksand) and 17 (hidden wall), none of which
    // the generated Act 1 floors contain, and props are opened by BUMPING, not by standing.
    var tx=(x/TILE)|0, ty=(y/TILE)|0;
    if(tx===scene.heroTileX && ty===scene.heroTileY) return;
    scene.heroTileX=tx; scene.heroTileY=ty;
    // checkTransition CONSUMES transitionCooldown on every call, so it must be asked once per
    // cell entered and never per frame.
    var tr=null; try{ tr=scene.checkTransition(tx,ty); }catch(e){}
    if(tr){ try{ scene.performTransition(tr); }catch(e){ if(window.__DQ_DEBUG__) console.log('a1 move tr '+e); } return; }
    try{ scene.onStep(); }catch(e){ if(window.__DQ_DEBUG__) console.log('a1 move step '+e); }
    try{ scene.updatePosition(); }catch(e){}
    try{ if(scene.fogEnabled && scene.updateFogVisibility) scene.updateFogVisibility(); }catch(e){}
    try{ if(scene.handleTorchPickup) scene.handleTorchPickup(); }catch(e){}
    try{ if(scene.handleLavaDamage) scene.handleLavaDamage(); }catch(e){}
    try{ if(scene.updateMirrorState) scene.updateMirrorState(); }catch(e){}
  }
  /* ---- CAMERA: LERP FASTER, AND STOP FEEDING THE ROUNDED SCROLL BACK IN ----------------------
     The engine asks for `startFollow(hero, true, .09, .09)`, and the `true` is roundPixels. Phaser's
     preRender then does, in this order: lerp the scroll 9% of the way to the hero, FLOOR it, and
     store the floored number as `this.scrollX` -- which is the state the next frame's lerp starts
     from. Two separate problems, both measured on device at a healthy 60 fps, so neither is a
     performance artefact:
       (a) 9% per frame is a 51 px steady-state lag walking east/south and 40 px west/north -- more
           than a whole cell behind the hero the whole time she is walking, and still drifting ~350 ms
           after she stops dead;
       (b) the floor is a one-way rounding INSIDE the feedback loop, so the lag is direction
           asymmetric, and after stopping while heading east or south the camera settles 11 px off
           centre and stays there.
     Fixed here rather than by re-tuning the bundle, which is frozen. The camera is driven from the
     override: an exponential approach at 25% per 60 Hz frame (delta-scaled, so a slow frame catches
     up instead of falling further behind) is run on a FLOAT scroll that is only rounded on its way
     to the camera, never read back. The engine's own follow is switched off while this drives --
     re-asserted every frame rather than latched, because updateCamera() re-arms startFollow on
     every entry, transition and rescue. Same target the engine's follow converges to
     (hero - halfViewport, bounds-clamped), so nothing about the framing changes; only the delay.
     If anything else moves the camera -- centerOn from updateCamera, a rescue, a scene restart --
     the scroll no longer matches what was last written, and the float resynchronises to it rather
     than fighting it. Dungeons only: a1mCam is called from the mask branch of the update wrapper,
     so the overworld and the town keep the engine's camera exactly as it is. */
  var A1M_CAM_LERP=0.25;      // fraction of the remaining distance closed per 60 Hz frame
  var a1mCamS=null;
  function a1mCam(scene,dtms){
    if(window.__A1_DNG_CAM__===false) return;                                // review escape hatch
    var cam=scene&&scene.cameras&&scene.cameras.main, hero=scene&&scene.hero;
    if(!cam||!hero||!hero.scene||typeof cam.width!=='number') return;
    if(cam._follow){ try{ cam.stopFollow(); }catch(e){} }
    var tx=hero.x-cam.width*0.5, ty=hero.y-cam.height*0.5;                   // Phaser's own follow target
    if(cam.useBounds && cam.clampX){ tx=cam.clampX(tx); ty=cam.clampY(ty); }
    var s=a1mCamS;
    if(!s || s.cam!==cam || Math.abs(cam.scrollX-s.wx)>1.5 || Math.abs(cam.scrollY-s.wy)>1.5)
      s=a1mCamS={ cam:cam, x:cam.scrollX, y:cam.scrollY, wx:cam.scrollX, wy:cam.scrollY };
    var L=(typeof window.__A1_DNG_CAMLERP__==='number')?window.__A1_DNG_CAMLERP__:A1M_CAM_LERP;
    var dt=Math.max(1,Math.min(120,dtms||1000/60));
    var k=(L>=1)?1:1-Math.pow(1-L,dt/(1000/60));
    s.x+=(tx-s.x)*k; s.y+=(ty-s.y)*k;
    if(Math.abs(tx-s.x)<0.05) s.x=tx;                                        // settle exactly, not asymptotically
    if(Math.abs(ty-s.y)<0.05) s.y=ty;
    cam.scrollX=s.wx=Math.round(s.x); cam.scrollY=s.wy=Math.round(s.y);      // whole pixels to the screen
  }
  // WRAP sys.sceneUpdate, NOT scene.update. Phaser captures the scene's update method ONCE, in
  // bootScene/create (`y.sceneUpdate = v.update`), and calls `this.sceneUpdate.call(this.scene)`
  // from Systems.step forever after -- so a wrapper installed on `scene.update` after create()
  // is never called. It is also reset to the no-op on shutdown/restart, which is why this is
  // re-checked from tick() rather than latched with a one-shot flag.
  //
  // The engine's update() is two halves: per-frame housekeeping (compass, visible tiles, minimap,
  // the mechanic timers), then an early return, then the cursor read that starts the 150 ms step
  // tween. `isMoving` is the FIRST term of that early return -- i.e. the engine's own switch for
  // "housekeeping yes, stepping no" -- so forcing it around the inner call neutralises the tween
  // without patching, re-implementing or racing it.
  function a1mInstall(scene){
    var sys=scene&&scene.sys;
    if(!sys||typeof sys.sceneUpdate!=='function'||sys.sceneUpdate.__a1m) return;
    var orig=sys.sceneUpdate;
    var patched=function(time,delta){
      var on=false; try{ on=!!a1mAnyFor(this); }catch(e){}
      // Off this scene/map entirely (battle, menu-driven scene swap, overworld->town): drop any
      // prompt left showing rather than let it survive into a screen it no longer applies to.
      if(!on){ try{ a1mPromptHide(); }catch(e){} return orig.call(this,time,delta); }
      var was=this.isMoving; this.isMoving=true;
      try{ orig.call(this,time,delta); } finally { this.isMoving=was; }
      try{ a1mStep(this,delta); }catch(e){ if(window.__DQ_DEBUG__) console.log('a1 move '+e+(e&&e.stack||'')); }
      // after the hero has moved, and before Phaser's preRender reads the scroll for this frame
      try{ a1mCam(this,delta); }catch(e){ if(window.__DQ_DEBUG__) console.log('a1 cam '+e); }
      try{ a1mPromptTick(this); }catch(e){ if(window.__DQ_DEBUG__) console.log('a1 prompt '+e); }
    };
    patched.__a1m=true; sys.sceneUpdate=patched;
  }

  // ---- baked art. N === the render scale (48 px per cell) exactly, so the source rect is
  // (X0*48, Y0*48, winW*48, winH*48) with no rescaling. props art has the assets baked in.
  // Layer ladder. DEFAULT IS '-props.png': the baked render the owner reviewed, with the assets
  // composited at their authored scale (the boss is 2.2 cells; the raw asset PNG is 33x41, i.e.
  // UNDER one cell) and with the lighting, occlusion and contact shadows that composition produced.
  // Its cost is that a looted chest keeps its baked closed art -- cosmetic only, since a1dReplayProgress
  // still sets tile 8 so the engine reports the chest empty.
  // '-material.png' is terrain only and lets live asset sprites sit on top, so state changes show;
  // it is NOT the default because reproducing per-asset scale, the wall-mounted sign (tile 18 is
  // drawn on the adjacent wall, not on its own cell) and the baked contact shadows is unvalidated
  // work that would regress approved art. Opt in with window.__A1_DNG_LAYER__='material' to evaluate.
  // Neither present: the procedural draw runs, exactly as it does today.
  var a1dArt={}, a1dArtReq={}, a1dLayer={};
  function a1dArtFor(key){
    if(a1dArt[key]!==undefined) return a1dArt[key];
    if(!a1dArtReq[key]){ a1dArtReq[key]=true;
      var tryLayer=function(names){
        if(!names.length){ a1dArt[key]=null; return; }                      // no render at all -> procedural, permanently
        var im=new Image();
        im.onload=function(){ a1dArt[key]=im; a1dLayer[key]=names[0]; a1dChanged=true; };
        im.onerror=function(){ tryLayer(names.slice(1)); };
        im.src='act1-dungeon-art/'+key+'-'+names[0]+'.png';
      };
      tryLayer(window.__A1_DNG_LAYER__==='material'?['material','props']:['props','material']);
    }
    return undefined;                                                       // still loading
  }
  /* ---- ADJACENT-FLOOR PREFETCH ------------------------------------------------------------
     THE FLOOR-CHANGE BLACK SCREEN. Measured on device (iPhone 17 Pro sim, sunkenCellar B3F ->
     B2F by the f3 stairs at (33,12)), t=0 at performTransition, one line per instrumented
     event:
        0.00 transition fires, the engine's opaque black rect goes up
        0.05 loadMap enters · 0.13 engine loadMap DONE (its declared 100x100 placeholder map,
             10,000 tile sprites) · 0.14 our real 32x28 floor swapped in and re-rendered
        0.14 the f2 walk MASK is requested · 0.17 the f2 baked ART is requested
        7.74 first dungeon redraw DONE  <-- 7.57 s
        8.08 mask decoded · 8.15 distance field built · 8.15 art decoded · 8.20 first baked blit
        8.33 the black rect is finally clear.  Longest rAF gap in the run: 8027 ms -- ONE frozen
             frame, which is exactly what the player sees.
     The engine's own transition work is 0.14 s of that. The 7.57 s is the PROCEDURAL
     drawDungeon pass below, and it runs for one reason: the next floor's baked art was not
     asked for until the player was already standing on the floor, so a1dBlit had nothing to
     blit and fell through to a per-pixel draw of the whole camera window -- art that is thrown
     away half a second later when the PNG lands. Worse, drawing it is what stops the PNG from
     landing: mask and art both resolve within 0.45 s of that block ENDING, having been queued
     behind it the entire time. Same starvation as the resume path fixed in 3477918, in a
     different place, and it is NOT the 4 MB decode -- that costs ~0.5 s on a free main thread.
     So: ask EARLIER, which is cheaper than making anything faster. A dungeon has three floors
     and the stairs the player is walking towards names the destination, so the neighbours of
     the floor she is standing on are the whole candidate set. Both caches are permanent and
     every floor of a dungeon gets visited anyway, so this moves ~15 MB of decode forward in
     time rather than adding a new peak (and the overworld's ~190 MB chunk cache is already
     released on entry -- see the kind!=='ow' branch in tick). Never before the floor she is
     actually on has resolved, and one neighbour in flight at a time, so the prefetch can never
     delay the thing in front of her. Measured after: first baked blit 0.23 s, black clear
     ~0.7 s, of which 0.4 s is the engine's own 400 ms fade tween.
     The pending-guard in a1dBlit is the other half: it covers the entry the prefetch cannot
     reach (walking in from the overworld, where no floor of this dungeon has ever been asked
     for). Measured on that path: first redraw 0 ms instead of 7.5 s, art up at 0.59 s. */
  function a1dPrefetchAdjacent(scene){
    if(!a1dFloors||!scene) return;
    var id=scene.currentMapId; if(!A1D_MAPS[id]) return;
    var f=scene.currentFloor||1, k=id+'-f'+f;
    if(a1dArtFor(k)===undefined || a1mMaskFor(k)===undefined) return;      // the floor she is ON comes first, always
    var order=[id+'-f'+(f+1), id+'-f'+(f-1)], i, nk, pending;
    for(i=0;i<order.length;i++){ nk=order[i]; if(!a1dFloors[nk]) continue;
      pending=false;
      if(a1dArtFor(nk)===undefined) pending=true;                          // the call itself issues the request
      if(a1mMaskFor(nk)===undefined) pending=true;
      if(pending) return;                                                  // one neighbour in flight at a time
    }
  }
  function a1dLayerFor(scene){                                              // 'material' | 'props' | null
    var fl=a1dFloorFor(scene); if(!fl) return null;
    var key=scene.currentMapId+'-f'+(scene.currentFloor||1);
    return a1dArtFor(key) ? (a1dLayer[key]||null) : null;
  }
  // Act-1 dungeon asset library (the art the floors were composed from), drawn live over the
  // material layer. Torches carry no engine tile, but no in-scope dungeon uses them.
  var A1D_ASSET={6:'stairsUp',9:'stairsDown',4:'chest',8:'chestOpen',7:'boss',14:'save',18:'sign'};
  function a1dAssetName(t,scene){
    if(t===6 && (scene.currentFloor||1)===1) return 'mouth';               // tile 6 is the cave mouth on floor 1
    return A1D_ASSET[t]||null;
  }
  function a1dAssetTex(scene,name){
    var key='a1dasset_'+name; if(scene.textures.exists(key)) return key;
    if(!propLoading[key]){ propLoading[key]=true; var im=new Image();
      im.onload=function(){ if(!scene.textures.exists(key)){ try{scene.textures.addImage(key,im);}catch(e){} } };
      im.src='act1-dungeon-art/assets/asset-'+name+'.png'; }
    return null;
  }
  /* ---- OPEN CHESTS ON THE BAKED LAYER -------------------------------------------------------
     The engine does its half already: tryOpenTreasure sets mapData 4->8 and persists
     `chest.<map>.f<floor>.<x>.<y>`, and a1dReplayProgress replays that flag on re-entry. What was
     missing is the PICTURE -- *-props.png has the chest composited in CLOSED, so a looted chest
     kept its lid shut (the cost the comment on a1dArtFor names, reported by the owner).

     An asset-chestOpen sprite laid on top does NOT hide it. The two silhouettes do not nest,
     because sprite_at() normalises each to its own LONG side: closed is a wide dome (86x78 master
     px at 1.0 cell), open is a narrow tall box (71x86). Measured against the bake's own anchor,
     an overlay at the authored 1.0 cell leaves 19.1% of the closed chest showing, and it still
     leaves a rim at 1.45 cells -- by which point the chest has grown ~45% on being opened.

     So the open state ships as a small OPAQUE PATCH of the floor: the chest's 3x3 cell
     neighbourhood, cut from the SAME render with the chest swapped, one strip per floor from
     scripts/make_dungeon_chest_patches.py. Blitted back onto the rect it was cut from it is
     registered exactly, and being opaque there is nothing of the old lid left to peek out. The
     approved art is untouched -- these are new files beside *-props.png, not a re-bake.

     Drawn as a scene image at depth 3, the same depth the material layer's props use: above the
     base canvas (1), under the fog (8) and the hero (10), so it lights and occludes like the art
     it replaces. Depth 3 also means dngSpecialTiles runs it every tick, so the swap shows the
     moment the chest is opened without needing updateDng's window cache to miss. */
  var a1dChestReq={}, chestImgs={}, chestKey=null;
  var CHEST_CELLS=3;                                                        // patch side, in cells
  function a1dChestStrip(scene,key){                                        // texture key, or null while loading
    var tk='a1dchest_'+key;
    if(scene.textures.exists(tk)) return tk;
    if(!a1dChestReq[key]){ a1dChestReq[key]=true; var im=new Image();
      im.onload=function(){ if(scene.textures.exists(tk)) return;
        try{ var t=scene.textures.addImage(tk,im), s=CHEST_CELLS*TILE, n=Math.round(im.width/s), i;
             for(i=0;i<n;i++) t.add('c'+i,0,i*s,0,s,s);
             a1dChanged=true; }catch(e){} };
      im.src='act1-dungeon-art/'+key+'-chests.png'; }
    return null;
  }
  // The strip's order IS the floor's own chest order, so the runtime needs no side-car index.
  function a1dOpenChests(scene){
    var fl=a1dFloorFor(scene), map=scene.mapData; if(!fl||!map) return;
    var key=scene.currentMapId+'-f'+(scene.currentFloor||1), k;
    if(chestKey!==key){ for(k in chestImgs){ if(chestImgs[k])chestImgs[k].destroy(); } chestImgs={}; chestKey=key; }
    var a=fl.assets||[], seen={}, tk=null, n=0, i, ch, row, ik, img;
    for(i=0;i<a.length;i++){ ch=a[i]; if(ch.kind!=='chest') continue;
      var idx=n++; row=map[ch.y];
      if(!row || row[ch.x]!==8) continue;                                   // still shut -> the baked art is right
      if(tk===null){ tk=a1dChestStrip(scene,key); if(!tk) return; }         // strip in flight -> place next tick
      ik=ch.x+'_'+ch.y; seen[ik]=1; img=chestImgs[ik];
      if(!img){ img=scene.add.image((ch.x-1)*TILE,(ch.y-1)*TILE,tk,'c'+idx).setOrigin(0,0).setDepth(3);
                img.setDisplaySize(CHEST_CELLS*TILE,CHEST_CELLS*TILE); chestImgs[ik]=img; }
      if(!img.visible) img.setVisible(true); }
    for(k in chestImgs){ if(!seen[k]&&chestImgs[k]&&chestImgs[k].visible) chestImgs[k].setVisible(false); }
  }
  function a1dBlit(ctx,X0,Y0,winW,winH){                                    // true if the window was served from baked art
    if(!a1dKey||!dngState||!a1dFloorFor(dngState.scene)) return false;
    var im=a1dArtFor(a1dKey);
    // PENDING IS NOT ABSENT. undefined = this floor's render exists and is in flight; null = there
    // is no render for it and the procedural pass below is the final answer. Only the second is
    // worth 7.5 s of per-pixel work (see a1dPrefetchAdjacent for the measurement): in the first,
    // every pixel drawn is overwritten the moment the PNG lands, and drawing them is what stops the
    // PNG from landing. Clear and wait instead -- the onload sets a1dChanged, which forces the
    // redraw that blits for real. Inside a transition this is hidden under the engine's own black
    // rect; outside one, the engine's tile sprites (depth 0, under our depth-1 canvas) show
    // through, which is the same art the unreskinned game draws.
    if(im===undefined){ ctx.clearRect(0,0,winW*N,winH*N); return true; }
    if(!im) return false;
    var sx=X0*N, sy=Y0*N, sw=Math.min(winW*N,im.width-sx), sh=Math.min(winH*N,im.height-sy);
    if(sw<=0||sh<=0) return false;
    ctx.clearRect(0,0,winW*N,winH*N);                                       // map smaller than the window -> the rest stays clear
    ctx.drawImage(im,sx,sy,sw,sh,0,0,sw,sh);
    return true;
  }
  function drawDungeon(ctx,map,X0,Y0,winW,winH){
    if (a1dBlit(ctx,X0,Y0,winW,winH)) return;                               // Act-1 baked render replaces the procedural pass
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
    var X0=windowStart(wv.x,winW,W), Y0=windowStart(wv.y,winH,H);
    // A NEW mapData array must force a redraw. `a1dApply` swaps the floor in AFTER the first draw
    // of an entry, and the window key alone does not change when it does -- so the stale frame
    // survived the guard below and the player saw a black floor until their first step moved the
    // window. Same failure the overworld plate already hit: "a NEW mapData array under an
    // unchanged reskin key". Guard on the array IDENTITY, not just its shape.
    if (dngState.mapRef!==map){ dngState.mapRef=map; force=true; }
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
    // Act-1 floors on the BAKED layer: *-props.png already has chest/stairs/save/sign/boss painted
    // in, so drawing sprites on top would double every object -- every prop sprite stays hidden
    // here. The ONE state the baked picture cannot express is a looted chest, and that ships as an
    // opaque floor patch rather than a sprite (see a1dOpenChests); it replaces the baked pixels
    // instead of sitting on them, so it doubles nothing.
    var a1layer=a1dLayerFor(scene);
    if (a1layer==='props'){ for(var hk in specImgs){ if(specImgs[hk]&&specImgs[hk].visible) specImgs[hk].setVisible(false); }
                            a1dOpenChests(scene); return; }
    if (specMap!==scene.currentMapId){ for(var kk in specImgs){ if(specImgs[kk])specImgs[kk].destroy(); } specImgs={}; specMap=scene.currentMapId; } // reset on map change
    var cam=scene.cameras.main, W=map[0].length, H=map.length;
    var X0=Math.max(0,Math.floor(cam.scrollX/TILE)-2), X1=Math.min(W-1,Math.ceil((cam.scrollX+cam.width)/TILE)+2);
    var Y0=Math.max(0,Math.floor(cam.scrollY/TILE)-2), Y1=Math.min(H-1,Math.ceil((cam.scrollY+cam.height)/TILE)+2);
    var seen={};
    for (var ty=Y0;ty<=Y1;ty++){ var mrow=map[ty]; if(!mrow)continue; for (var tx=X0;tx<=X1;tx++){ var t=mrow[tx]; if(!RESKIN_SPECIAL[t])continue;
      var es=tg&&tg[ty]&&tg[ty][tx]; if(es&&es.visible)es.setVisible(false);                    // hide engine sprite (under our base)
      var key=tx+'_'+ty; seen[key]=1;
      var an=(a1layer==='material')?a1dAssetName(t,scene):null;             // material layer: the floor's own asset art, live
      var pn=an?null:propNameFor(t,map,tx,ty);
      var tk = an ? a1dAssetTex(scene,an) : (pn ? ensurePropTex(scene,pn) : ensureSpecialTex(scene,t)); // Codex PNG prop, else code-drawn (lava/spike)
      if(!tk) continue;                                                                                    // PNG still loading → place next tick
      var img=specImgs[key]; if(!img){ img=scene.add.image(0,0,tk).setDepth(3); specImgs[key]=img; }
      if(img.texture.key!==tk) img.setTexture(tk);
      if(an){ var asc=(an==='boss')?2.2:1.0;                                // boss is 2.2 cells (locked); the rest sit at authored size
        img.setOrigin(0.5,1).setPosition(tx*TILE+TILE/2,ty*TILE+TILE).setDisplaySize(img.width*asc,img.height*asc); }
      else if(!pn || pn.indexOf('door')>=0){ img.setOrigin(0,0).setPosition(tx*TILE,ty*TILE).setDisplaySize(TILE,TILE); }  // code-drawn (lava/spike) + doors: fill the tile
      else { var sc=PROP_SCALE[pn]||1.4; img.setOrigin(0.5,1).setPosition(tx*TILE+TILE/2,ty*TILE+TILE).setDisplaySize(TILE*sc,TILE*sc); } // objects: bigger, sit on the floor tile & rise up
      if(!img.visible)img.setVisible(true); } }
    // Same unbounded-growth fix as owImgs above, for the same reason: `specMap !== currentMapId`
    // resets this on a MAP change, and the overworld is one map, so exploring it never resets and
    // every special tile ever seen kept its Image alive. Hide anything just off-screen (she turns
    // around constantly); destroy beyond SPEC_KEEP_R, where the texture stays cached so coming back
    // is an add.image rather than a load.
    var SPEC_KEEP_R = 48;
    var sccx = (cam.scrollX + cam.width / 2) / TILE, sccy = (cam.scrollY + cam.height / 2) / TILE;
    for (var k2 in specImgs){
      var si = specImgs[k2]; if(!si){ delete specImgs[k2]; continue; }
      if (seen[k2]) continue;
      if (si.visible) si.setVisible(false);
      var sp = k2.indexOf('_'); if (sp < 0) continue;
      var sx = +k2.slice(0, sp), sy = +k2.slice(sp + 1);
      if (sx !== sx || sy !== sy) continue;               // NaN guard: not a tile key
      if (Math.abs(sx - sccx) > SPEC_KEEP_R || Math.abs(sy - sccy) > SPEC_KEEP_R){
        try { si.destroy(); } catch(e) {}
        delete specImgs[k2];
      }
    }
  }
  /* ---- ITEM 4: THE BOSS ICON VANISHES INSTEAD OF STANDING FOREVER -----------------------------
     Owner: "the boss enemy icon needs to disappear with a special animation after defeating it."

     MEASURED, NOT ASSUMED: on the hi-fi ('-props.png') layer -- the default for every Act 1
     dungeon that has one -- the boss marker is baked directly into that one static image at
     authored scale/lighting (see a1dArtFor's own header comment), and dngSpecialObjects hides
     every dynamic object sprite on that layer because the baked picture already shows them. Nothing
     ever repaints that region. Seeded a save with `boss.giantCrab.defeated` already true and
     compared it pixel-for-pixel against an undefeated save at the same spot (Sunken Cellar B3F,
     tile (8,24)): byte-identical. The glowing red-eyed mark does not pop, fade or move -- it simply
     never goes away, on every hi-fi floor, which is the actual defect "not just pop out of
     existence" is asking to fix (there is no existing pop to improve on; there is nothing at all).

     WHY THIS CAN DETECT THE MOMENT WITHOUT A BATTLE-END HOOK. endBattle() only resumes WorldMapScene
     (this.scene.stop(), this.scene.resume("WorldMapScene")) -- it never reloads the floor, so
     scene.mapData keeps reading tile 7 (boss) for the rest of that visit even though
     storyFlags['boss.<id>.defeated'] just became true. a1dReplayProgress only reconciles the two on
     the NEXT loadMap. So "flag says defeated, tile still says 7" is a clean, one-shot signal for
     "she just walked back into this room from the fight," checked every dungeon tick alongside
     dngSpecialTiles and claimed (a1dBossPatch[key]) before the tween starts so it can only fire once
     per floor-visit; once a later reload converts the tile itself, the condition stops matching on
     its own and nothing re-fires.

     WHY A NEW SPRITE RATHER THAN ANIMATING THE BAKED PIXELS. A static PNG region cannot be
     tweened. `act1-dungeon-art/assets/asset-boss.png` is the SAME dark-smoke-with-red-eyes mark
     (already used as-is for the non-hi-fi/'material' fallback), so a live copy dropped over the
     baked position at that path's own established scale (2.2 cells, origin bottom-centre -- see
     dngSpecialObjects' material-layer branch, reused verbatim rather than re-derived) reads as the
     same icon, not a swap. It plays the punch-then-settle language `.qok-defeated`
     (public/ui-overhaul.css) already established for battle-monster defeats -- a brief bright
     scale-up, then shrink/sink/fade -- kept to the same ~600ms budget so the celebration never
     delays the player. A soft dark patch (Phaser Graphics, no new asset) sits one depth below it and
     is revealed as the sprite fades, so the baked pixels stay hidden for good once the tween ends --
     without it, the animation would finish and the still-baked mark would simply be sitting there
     again underneath.

     SCOPED TO THE FOUR ACT 1 DUNGEONS THAT ACTUALLY HAVE THIS BUG, NAMED EXPLICITLY. Crystal Cave
     generation is off-limits (AGENTS.md); it is not in this table and nothing here touches it. */
  var A1D_BOSS_ID={ sunkenCellar:'giantCrab', coastalReef:'coralTitan', mistyGrotto:'giantToad', whisperingWoodsCave:'mosswarden' };
  var a1dBossPatch={};
  function a1dBossVanishPlay(scene,bx,by){
    try{
      var cx=bx*TILE+TILE/2, cy=by*TILE+TILE;                              // same anchor dngSpecialObjects' material branch uses
      var mg=scene.add.graphics().setDepth(3);                             // permanent mask: no new asset, needs no image load
      mg.fillStyle(0x141312,0.95); mg.fillEllipse(cx,cy-TILE*0.4,TILE*1.15,TILE*0.85);
      mg.fillStyle(0x141312,0.55); mg.fillEllipse(cx,cy-TILE*0.4,TILE*1.55,TILE*1.2);
      var tex=a1dAssetTex(scene,'boss');
      if(!tex){ return; }                                                  // still loading -- mask alone still hides the mark this tick
      var asc=2.2;                                                          // locked scale, matches dngSpecialObjects' material-layer boss
      var spr=scene.add.image(cx,cy,tex).setOrigin(0.5,1).setDepth(4);
      spr.setDisplaySize(spr.width*asc,spr.height*asc);                    // spr.width/height: the frame's own natural size, pre-scale
      scene.tweens.add({ targets:spr, scaleX:spr.scaleX*1.16, scaleY:spr.scaleY*1.16, duration:130, ease:'Quad.easeOut',
        onComplete:function(){
          scene.tweens.add({ targets:spr, scaleX:spr.scaleX*0.2, scaleY:spr.scaleY*0.2, y:spr.y+20, angle:9, alpha:0,
            duration:430, ease:'Cubic.easeIn', onComplete:function(){ try{ spr.destroy(); }catch(e){} } });
        }});
    }catch(e){ if(window.__DQ_DEBUG__) console.log('a1 boss vanish '+e); }
  }
  /* ---- THE BOSS SORTS AGAINST THE HERO INSTEAD OF ALWAYS LOSING TO HER --------------------------
     Owner, build 38: "the hero gets overlayed on top of the boss, which looks very weird" -- the
     second of D2's three requirements. The other two were already done: the mark vanishes on defeat
     (a1dBossVanish, above) and the material-layer path draws it as a real sprite.

     WHY IT HAPPENS. On the hi-fi ('-props.png') layer the boss is BAKED into one static image
     drawn under everything, and the hero is a scene sprite at depth 10. There is no depth at which
     a baked pixel can win, so she draws over the mark from every side -- including from directly
     above it, where she should be behind.

     THE FIX REUSES a1dBossVanish's OWN MECHANISM rather than inventing one: hide the baked mark
     under the same dark patch, and put a live `asset-boss.png` copy at the same anchor and the same
     locked 2.2-cell scale, so what the player sees is the identical icon -- then give that copy a
     depth that flips around the hero's. Above her feet it draws at 10.5 (boss in front), below at
     9.5 (hero in front). One comparison per tick, no new asset, and the two paths cannot drift
     because both read A1D_BOSS_ID, a1dAssetTex('boss') and asc = 2.2.

     FEET, NOT CENTRES. The comparison is her SOLE against the boss's own foot line (by*TILE+TILE),
     the same anchor everything else in this file sorts on -- comparing sprite origins would flip
     the order half a body too early on a 2.2-cell-tall mark.

     ONLY WHILE IT IS ALIVE. Once `boss.<id>.defeated` is set, a1dBossVanish owns the region: this
     hands over by destroying its sprite, so the two never both hold a copy of the same icon. */
  var a1dBossSprites={};
  function a1dBossDrop(key){
    var e=a1dBossSprites[key]; if(!e) return;
    try{ if(e.spr) e.spr.destroy(); if(e.mask) e.mask.destroy(); }catch(x){}
    delete a1dBossSprites[key];
  }
  function a1dBossSort(scene){
    var mapId=scene.currentMapId, bossId=A1D_BOSS_ID[mapId];
    var key=mapId+'-f'+(scene.currentFloor||1);
    // Drop any sprite belonging to a floor we are no longer standing on.
    for(var k in a1dBossSprites){ if(k!==key) a1dBossDrop(k); }
    if(!bossId) return;
    var Q=window.__QOK, tt=Q&&Q.state&&Q.state();
    var flags=tt&&tt.player&&tt.player.state&&tt.player.state.storyFlags;
    if(flags && flags['boss.'+bossId+'.defeated']){ a1dBossDrop(key); return; }   // vanish path owns it now
    var fl=a1dFloorFor(scene); if(!fl) return;
    var boss=null, a=fl.assets||[], i;
    for(i=0;i<a.length;i++) if(a[i].kind==='boss'){ boss=a[i]; break; }
    if(!boss) return;
    var row=scene.mapData&&scene.mapData[boss.y];
    if(!row || row[boss.x]!==7) return;                                          // not a live boss tile
    var cx=boss.x*TILE+TILE/2, cy=boss.y*TILE+TILE;                              // the anchor a1dBossVanish uses
    var e=a1dBossSprites[key];
    if(!e){
      var tex=a1dAssetTex(scene,'boss'); if(!tex) return;                        // PNG still loading -> next tick
      var mg=scene.add.graphics().setDepth(3);                                   // hide the baked mark, same patch as the vanish
      mg.fillStyle(0x141312,0.95); mg.fillEllipse(cx,cy-TILE*0.4,TILE*1.15,TILE*0.85);
      mg.fillStyle(0x141312,0.55); mg.fillEllipse(cx,cy-TILE*0.4,TILE*1.55,TILE*1.2);
      var spr=scene.add.image(cx,cy,tex).setOrigin(0.5,1);
      spr.setDisplaySize(spr.width*2.2,spr.height*2.2);                          // locked scale, as dngSpecialObjects uses
      e=a1dBossSprites[key]={ spr:spr, mask:mg, depth:0 };
    }
    var hero=dngHero(scene); if(!hero) return;
    var heroFoot=hero.y + a1mFootDy(scene);
    var d=(heroFoot < cy) ? 10.5 : 9.5;                                          // her soles above the boss's -> she is behind it
    if(e.depth!==d){ e.depth=d; e.spr.setDepth(d); }
  }
  function a1dBossVanish(scene){
    var mapId=scene.currentMapId, bossId=A1D_BOSS_ID[mapId]; if(!bossId) return;
    var key=mapId+'-f'+(scene.currentFloor||1);
    if(a1dBossPatch[key]) return;
    var Q=window.__QOK, tt=Q&&Q.state&&Q.state();
    var flags=tt&&tt.player&&tt.player.state&&tt.player.state.storyFlags;
    if(!flags || !flags['boss.'+bossId+'.defeated']) return;
    var fl=a1dFloorFor(scene); if(!fl) return;
    var boss=null, a=fl.assets||[];
    for(var i=0;i<a.length;i++) if(a[i].kind==='boss'){ boss=a[i]; break; }
    if(!boss) return;
    var row=scene.mapData&&scene.mapData[boss.y];
    if(!row || row[boss.x]!==7) return;                                    // already reconciled by a reload -> nothing to animate
    a1dBossPatch[key]=true;                                                 // claim before the tween starts: one shot per floor-visit
    a1dBossVanishPlay(scene,boss.x,boss.y);
  }
  /* ---- WHAT YOU WALK UNDER LIVES ON ITS OWN LAYER, WITH ALPHA ---------------------------------
     Owner, build 48, correcting my previous fix: "the player walks under the floor and the arch so
     the problem is that the arch and the floor is on the same layer. something that the player walks
     under needs to be on a completely separate layer."

     He is right, and the previous attempt is the reason. It cropped a RECTANGLE out of `-props.png`
     and drew it over the hero. A rectangle of a baked plate is fully opaque and contains the lit
     opening and the floor as well as the arch -- so she passed behind the ground she was standing
     on. Making the rectangle smaller could never fix that; a rectangle is the wrong shape.

     An overhead layer must carry ALPHA and contain ONLY the thing you pass beneath. Once it does,
     IT NEEDS NO DEPTH SORTING AT ALL: it simply always draws above her, because she shows through
     wherever it is transparent -- which is exactly the archway opening and the floor. That deletes
     the depth-flip and the fold-line it keyed on, and with them the reason the old fix could never
     work on coastalReef, whose approach runs alongside the mouth and never crossed that line. All
     four floors now behave the same way for the same reason.

     The layer is BAKED, not derived at runtime: scripts/bake_dungeon_arch.py writes
     `<floor>-overhead.png` beside the props plate. Its silhouette is AUTHORED, not keyed off the
     picture -- luminance cannot do this job, because masonry, gravel and rock overlap in every band
     that was tried and three separate attempts each produced a broken ring that swallowed the
     player. See that script's header for the two measured invariants that make the layer safe. */
  var a1dOverSprites={}, A1D_OVER_REQ={};
  function a1dOverDrop(key){
    var e=a1dOverSprites[key]; if(!e) return;
    try{ if(e.spr) e.spr.destroy(); }catch(x){}
    delete a1dOverSprites[key];
  }
  var A1D_OVER_DEPTH=10.6;      // above the hero's 10 and above the boss's 10.5; it is scenery she is under
  /* RE-ENABLED 2026-08-19, on the condition the owner set: the silhouette is AUTHORED.

     It was disabled 2026-08-18 because three versions of this layer all DERIVED the arch by
     heuristic from the baked plate -- a band above the opening, then a dilated ring, then a ring
     unioned with the walk mask -- and each one covered walkable floor. Measured across the four
     floors, 33%..51% of the overlay's own pixels sat on WALKABLE ground, so wherever she stood near
     an entrance she vanished. That is worse than the bug it replaced: drawing over the arch is
     cosmetic, losing the character is not.

     What changed is the SOURCE, not the tuning. scripts/bake_dungeon_arch.py now builds this layer
     from design/act1-dungeons/arch/archasset-<dungeon>.png -- the assets the owner asked for twice
     -- and refuses to write unless two things measure true on every floor:
       * every DERIVED pixel of the overlay sits on mask-BLOCKED ground, where she can never stand
         and drawing over her is unobservable. Only the AUTHORED silhouette may cover open floor.
       * the deepest the overlay covers open floor is under one hero clearance (16 px). Measured
         11.4..12.2, so at most a 24 px patch of a 64 px sprite is ever hidden. She passes BEHIND
         the stone; she cannot stand still and disappear, which is the failure that switched this
         off before and the one thing that must never come back.
     The same bake blocks the arch's JAMBS in <floor>-walk.png, so she also stops walking on top of
     them. The CROWN is deliberately not collision -- top-down, the crown and the tile she walks
     through to reach the mouth are the same pixels, and blocking it sealed all four dungeons. */
  var A1D_OVERHEAD_ON=true;
  function a1dOverheadTick(scene){
    if(!A1D_OVERHEAD_ON){ for(var kk in a1dOverSprites) a1dOverDrop(kk); return; }
    var mapId=scene.currentMapId, key=mapId+'-f'+(scene.currentFloor||1);
    for(var k in a1dOverSprites){ if(k!==key) a1dOverDrop(k); }              // never leak a sprite across floors
    if(!A1D_MAPS[mapId] || (scene.currentFloor||1)!==1) return;              // only floor 1 carries a cave mouth
    if(a1dOverSprites[key]) return;                                          // already placed; nothing per-tick to do
    var tk='a1dover_'+key;
    if(scene.textures.exists(tk)){
      a1dOverSprites[key]={ spr:scene.add.image(0,0,tk).setOrigin(0,0).setDepth(A1D_OVER_DEPTH) };
      return;
    }
    if(A1D_OVER_REQ[key]) return;                                            // in flight, or resolved to "no layer on this floor"
    A1D_OVER_REQ[key]=true;
    var im=new Image();
    im.onload=function(){ try{ if(!scene.textures.exists(tk)) scene.textures.addImage(tk,im); }catch(e){} };
    im.onerror=function(){};                                                 // absent overhead layer simply means nothing to lift here
    im.src='act1-dungeon-art/'+key+'-overhead.png';
  }
  /* ---- THE ENTRANCE CRYSTAL: DORMANT UNTIL ACTIVATED, DRAWN LIVE BECAUSE THE BAKE PREDATES IT --
     Owner, build 35: "the entrance portal crystal is still not in the game ... my idea is to have
     codex design a crystal of an activated and inactivated state that lives next to the plaque on
     the wall." act1-dungeon-floors.json's f1 "assets" now carries a `kind:"save"` entry for each
     of the four dungeons this file already reskins (A1D_MAPS) -- a1dTiles turns that into a real
     tile 14 (A1M_PROP-blocked, interactable) the moment loadMap runs, so placement, collision and
     interact-dispatch are already free: a1mBump, a1mDispatchInteract and a1mNearbyInteract all
     already branch on t===14, wired for the mid/boss-floor crystal this reuses without change.

     EMBEDDED IN THE WALL VISUALLY; A WALKABLE FLOOR CELL UNDERNEATH IT MECHANICALLY -- owner
     correction, mid-build: "the crystal next to the plaque [should be] embedded in the wall like
     the plaque ... an inset fixture flush with the stonework, not a free-standing crystal ...
     same wall plane, same mounting logic, same silhouette discipline as the plaque." A first pass
     took that literally and moved the mapData MARKER into the same wall row as the sign -- and
     broke interaction: `<floor>-walk.png` (the continuous-collision mask, independent of mapData)
     reads BLOCKED there, same as the plaque's own marker cell, and every object this file's own
     design note calls out ("a chest, a boss marker, a plaque and a save crystal are OBJECTS
     standing on a cell... not terrain") is supposed to sit on a mask-WALKABLE cell instead, with
     A1M_PROP alone doing the "can't walk through it" work. Confirmed on-device: an object whose
     marker sits inside masked rock is approached but never shows its interact prompt.
     So the marker (act1-dungeon-floors.json's "save" asset, kind:"save") stays on the walkable
     floor cell one row south of the sign, exactly where a chest marker would sit -- and only the
     DRAWN SPRITE is offset into the wall row above it (see this function's own anchor math,
     `ec.y*TILE` not `ec.y*TILE+TILE`). This is the same split drawPlaque() already uses for the
     plaque itself: its marker tile and its drawn picture are two different cells too. The player
     is never meant to stand on the marker's cell (A1M_PROP blocks it, like every prop), only
     approach it from the floor tile immediately south (A1M_ENTRANCE_LANDING, one row further).

     What is NOT free is the PICTURE. Floor 1's *-props.png was baked before this crystal existed,
     so there is no baked pixel to show through where it now stands -- unlike the boss-floor
     crystal, which the baked art already draws (dngSpecialObjects hides the generic live-sprite
     path on that layer for exactly that reason: nothing to double). This draws a dedicated live
     sprite instead, the same pattern a1dBossVanish already established for "the baked picture
     cannot show this state on its own": Codex-generated asset-entrance-crystal-{dormant,lit}.png,
     swapped by the `entrance.crystal.<mapId>.activated` flag a1mCrystalChoose sets the first time
     the crystal is used (dungeon-props: painterly, no keyline -- docs/ART-GENERATION-PREFLIGHT.md;
     generated against `plaque-wall-anchor.png`, a crop of this exact game's own baked plaque, as
     the mounting-style anchor, per the owner's "same wall plane" instruction).
     Scoped to currentFloor===1 (the only floor this asset exists on), so it can never collide with
     the boss-floor crystal's own baked/live handling on later floors. */
  // TARGET ON-SCREEN HEIGHT, not a multiplier on the source pixels -- the source PNG is generated
  // at a higher native resolution than its on-screen footprint for crisp downscaling (same reason
  // dqprop-*-128.png ships square regardless of the object's real aspect ratio), so deriving
  // display size from raw source pixels would size it arbitrarily. Chosen to sit close to the
  // plaque's own on-screen height, MEASURED off the baked art (sunkenCellar-f1-props.png's own
  // stone tablet at (21,21): ~37.5px tall against this file's 48px TILE), since the two are meant
  // to read as the same wall-fixture family side by side.
  var A1D_ENTRANCE_TARGET_H=TILE*0.8;
  var a1dEntranceSpr={}, a1dEntranceKey=null;
  function a1dEntranceCrystalArt(scene,name){                                // async-load a Codex asset PNG as a Phaser texture; null until ready
    var key='a1dasset_'+name; if(scene.textures.exists(key)) return key;
    if(!propLoading[key]){ propLoading[key]=true; var im=new Image();
      im.onload=function(){ if(!scene.textures.exists(key)){ try{scene.textures.addImage(key,im);}catch(e){} } };
      im.src='act1-dungeon-art/assets/asset-'+name+'.png'; }
    return null;
  }
  function a1dEntranceCrystalTick(scene){
    var mapId=scene.currentMapId, floor=scene.currentFloor||1, key=mapId+'-f'+floor;
    if(!A1D_MAPS[mapId] || floor!==1){                                       // wrong floor/map -> nothing to show; drop any stale sprite
      if(a1dEntranceKey && a1dEntranceSpr[a1dEntranceKey]){ try{ a1dEntranceSpr[a1dEntranceKey].destroy(); }catch(e){} delete a1dEntranceSpr[a1dEntranceKey]; }
      a1dEntranceKey=null;
      return;
    }
    if(a1dEntranceKey && a1dEntranceKey!==key && a1dEntranceSpr[a1dEntranceKey]){
      try{ a1dEntranceSpr[a1dEntranceKey].destroy(); }catch(e){} delete a1dEntranceSpr[a1dEntranceKey];
    }
    a1dEntranceKey=key;
    var fl=a1dFloorFor(scene); if(!fl) return;
    var a=fl.assets||[], ec=null;
    for(var i=0;i<a.length;i++) if(a[i].kind==='save'){ ec=a[i]; break; }
    if(!ec) return;
    var row=scene.mapData&&scene.mapData[ec.y]; if(!row || row[ec.x]!==14) return; // sanity: still the crystal tile
    var Q=window.__QOK, tt=Q&&Q.state&&Q.state();
    var flags=tt&&tt.player&&tt.player.state&&tt.player.state.storyFlags;
    var lit=!!(flags && flags['entrance.crystal.'+mapId+'.activated']);
    var name=lit?'entrance-crystal-lit':'entrance-crystal-dormant';
    var tex=a1dEntranceCrystalArt(scene,name); if(!tex) return;               // still loading -> place next tick
    var spr=a1dEntranceSpr[key];
    if(!spr){ spr=scene.add.image(0,0,tex).setOrigin(0.5,1).setDepth(3); a1dEntranceSpr[key]=spr; }
    if(spr.texture.key!==tex) spr.setTexture(tex);
    var frame=scene.textures.get(tex).get();                                  // the frame's own natural size, never a previously-scaled one
    var sc=A1D_ENTRANCE_TARGET_H/frame.height;                                 // fixed on-screen height regardless of the source PNG's resolution
    // ec.y*TILE, NOT ec.y*TILE+TILE: bottom-anchor at the TOP edge of the marker's own floor
    // cell, i.e. the boundary it shares with the wall row immediately north of it -- the same
    // line drawPlaque() mounts its picture against. The marker stays on walkable floor (see this
    // function's header and A1M_ENTRANCE_LANDING's comment for why); only the drawn sprite moves
    // up into the wall.
    spr.setPosition(ec.x*TILE+TILE/2, ec.y*TILE)
       .setDisplaySize(frame.width*sc, frame.height*sc);
    if(!spr.visible) spr.setVisible(true);
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
    try{ a1dBossVanish(scene); }catch(e){ if(window.__DQ_DEBUG__) console.log('a1 boss vanish tick '+e); }
    try{ a1dBossSort(scene); }catch(e){ if(window.__DQ_DEBUG__) console.log('a1 boss sort tick '+e); }
    try{ a1dOverheadTick(scene); }catch(e){ if(window.__DQ_DEBUG__) console.log("a1 overhead tick "+e); }
    try{ a1dEntranceCrystalTick(scene); }catch(e){ if(window.__DQ_DEBUG__) console.log('a1 entrance crystal tick '+e); }
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
  // The torch hole stays centred on the SPRITE, not on the feet the mover now collides at. It is a
  // light carried by the character, not a footprint: pulling it 31 px down would push the lit
  // region behind her whenever she walks north, and it would visibly drift off the thing the
  // player is looking at. The engine's own tile-level explored fog (updateFogVisibility) keys off
  // heroTileX/Y and is likewise untouched. [checked against the foot-contact fix, 2026-08-05]
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
  // ---- building parts (native px; N=48 per tile) ----
  function drawDoor(ctx,cx,baseY,green){
    var w=30,h=42,x=cx-(w>>1),y=baseY-h, dk=green?TP.clinic_dk:TP.door_dk, md=green?TP.clinic:TP.door, lt=green?TP.clinic:TP.door_lt;
    rect(ctx,x-2,baseY-2,w+4,4,TP.foot); rect(ctx,x-2,baseY-2,w+4,2,TP.foot_dk);
    rect(ctx,x-2,y-6,w+4,6,TP.timber_dk);
    rect(ctx,x,y,w,h,dk); rect(ctx,x+2,y,w-4,h-2,md);
    vline(ctx,x+10,y+2,baseY-4,dk); vline(ctx,x+20,y+2,baseY-4,dk); vline(ctx,x+2,y+2,baseY-4,lt);
    rect(ctx,x+2,y+6,4,2,TP.iron); rect(ctx,x+2,baseY-12,4,2,TP.iron); rect(ctx,x+w-6,y+6,4,2,TP.iron); rect(ctx,x+w-6,baseY-12,4,2,TP.iron);
    px(ctx,x+w-6,y+(h>>1),TP.knob); px(ctx,x+w-6,y+(h>>1)+2,TP.knob);              // knob
  }
  function drawWindow(ctx,cx,cy,clinic){                                            // small leaded casement (medieval)
    var s=22,x=cx-(s>>1),y=cy-(s>>1);
    rect(ctx,x-2,y-2,s+4,s+4,TP.timber_dk);                                        // dark timber frame
    rect(ctx,x,y,s,s,TP.glass); rect(ctx,x,y,s,6,TP.glass_lt); rect(ctx,x,y+s-4,s,4,TP.glass_dk);
    if (clinic){ rect(ctx,cx-2,y,4,s,TP.clinic); rect(ctx,x,cy-2,s,4,TP.clinic); } // green cross (healer)
    else { lineP(ctx,[x,y],[x+s-2,y+s-2],TP.frame); lineP(ctx,[x+s-2,y],[x,y+s-2],TP.frame); px(ctx,cx,cy,TP.frame); } // leaded diamond lattice
    rect(ctx,x-2,y+s,s+4,2,TP.timber_dk);                                          // sill
  }
  function drawDisplay(ctx,cx,bot){
    var w=36,h=40,x=cx-(w>>1),y=bot-h-4;
    rect(ctx,x-2,y-2,w+4,h+4,TP.frame);
    rect(ctx,x,y,w,h,TP.glass); rect(ctx,x,y,w,8,TP.glass_lt); rect(ctx,x,y+h-6,w,6,TP.glass_dk);
    rect(ctx,x,y+h-10,w,2,TP.timber_dk);                                           // shelf
    rect(ctx,x+2,y+h-16,6,8,TP.awn_a); rect(ctx,x+10,y+h-18,6,10,TP.save_lt); rect(ctx,x+18,y+h-14,4,6,TP.clinic); // goods
    vline(ctx,cx,y,y+h-2,TP.frame); hline(ctx,x,x+w-2,y+(h>>1),TP.frame);
  }
  // pitched GABLE roof: a WIDE, low roof plane with a bold horizontal ridge -> reads as a house cap
  // (NOT a pyramidal/hip roof, NOT a flat/factory slab). Warm clay tile, lit upper-left, overhanging eaves.
  function gableRoof(ctx,L,topY,Wp,eaveY){
    var R=L+Wp, eL=L-8, eR=R+8, inx=(Wp*0.08)|0, ridgeY=topY-4, span=Math.max(1,eaveY-ridgeY);
    polyf(ctx,[[eL,eaveY],[L+inx,ridgeY],[R-inx,ridgeY],[eR,eaveY]],TP.rtile_dk);      // dark base
    for (var cy=ridgeY+4; cy<=eaveY; cy+=6){ var t=(cy-ridgeY)/span;
      var lx=Math.round((L+inx)+(eL-(L+inx))*t), rx=Math.round((R-inx)+(eR-(R-inx))*t), mx=lx+(((rx-lx)*0.5)|0);
      rect(ctx,lx,cy,mx-lx,6,TP.rtile_lt); rect(ctx,mx,cy,rx-mx,6,TP.rtile);
      hline(ctx,lx,rx,Math.min(eaveY,cy+4),TP.rtile_dk);
      var off=((cy/6|0)&1)?8:0; for (var vx=lx+off; vx<rx; vx+=18) px(ctx,vx,cy,TP.rtile_dk);
    }
    rect(ctx,L+inx-6,ridgeY-2,(R-inx)-(L+inx)+12,6,TP.rtile_rg);
    rect(ctx,eL,eaveY,eR-eL,6,TP.rtile_dk);
    ctx.fillStyle='rgba(0,0,0,0.28)'; ctx.fillRect(L,eaveY+6,Wp,6);
  }
  // RED-BRICK wall: running-bond courses (staggered perpends), subtle per-brick tone variation, grime,
  // and a stone footing at the base.
  function brickWall(ctx,L,wallTop,Wp,wallBot,footH,seed){
    var R=L+Wp, wtop=wallTop, wbot=wallBot-footH, BH=12, BW=24, br=RNG(seed>>>0);
    rect(ctx,L,wallTop,Wp,wallBot-wallTop,TP.brick);
    for (var b0=wtop; b0<wbot; b0+=BH){ var off=(((b0-wtop)/BH)&1)?(BW>>1):0;         // per-brick tone variation
      for (var bx=L+off-BW; bx<R; bx+=BW){ var rr=br(); if(rr<0.22){ var xa=Math.max(L,bx+2), xb=Math.min(R,bx+BW-2); if(xb>xa) rect(ctx,xa,b0+2,xb-xa,BH-2, rr<0.11?TP.brick_dk:TP.brick_lt); } } }
    for (var y2=wtop; y2<wbot; y2+=BH){ hline(ctx,L,R-1,y2,TP.brick_mortar); var offp=(((y2-wtop)/BH)&1)?(BW>>1):0; for (var x2=L+offp; x2<R; x2+=BW) vline(ctx,x2,y2,Math.min(wbot,y2+BH)-1,TP.brick_mortar); } // mortar grid
    for (var yy=wtop;yy<wbot;yy++){ var f=(yy-wtop)/(wbot-wtop); if(f>0.6){ ctx.fillStyle='rgba(0,0,0,'+(0.09*(f-0.6)/0.4).toFixed(3)+')'; ctx.fillRect(L,yy,Wp,1);} } // grime toward ground
    rect(ctx,L,wallBot-footH,Wp,footH,TP.foot); rect(ctx,L,wallBot-footH,Wp,1,TP.foot_dk); // stone footing
  }
  function drawHouse(ctx,L,topY,Wp,map,x0,ry,clinic){
    var R=L+Wp, cx=L+(Wp>>1), cols=Wp/N, eaveY=topY+40, wallTop=eaveY, wallBot=topY+2*N, footH=8;
    ctx.fillStyle='rgba(0,0,0,0.20)'; ctx.beginPath(); ctx.ellipse(cx+6,wallBot,(Wp>>1)+4,8,0,0,Math.PI*2); ctx.fill(); // cast shadow (light upper-left)
    brickWall(ctx,L,wallTop,Wp,wallBot,footH,(Math.imul(L,131)^Math.imul(topY,977))); // grey brick
    var wbot=wallBot-footH, midY=(wallTop+wbot)>>1;
    for (var c=0;c<cols;c++){ var v=townRaw(map,x0+c,ry+1), ccx=L+c*N+(N>>1);
      if (v===10||v===15){ rect(ctx,ccx-18,wbot-48,36,2,TP.cope); drawDoor(ctx,ccx,wallBot-footH+2,v===15); }
      else drawWindow(ctx,ccx,midY,clinic);                                            // leaded window
    }
    gableRoof(ctx,L,topY,Wp,eaveY);
    if (!clinic){ var chx=cx+((Wp*0.26)|0); rect(ctx,chx,topY-18,16,30,TP.brick); rect(ctx,chx,topY-18,16,2,TP.brick_lt); rect(ctx,chx+14,topY-18,2,30,TP.brick_dk); rect(ctx,chx-2,topY-22,20,2,TP.brick_dk);
      ctx.fillStyle='rgba(190,190,196,0.40)'; ctx.fillRect(chx+4,topY-30,6,6); }
    if (clinic){ var gy=topY+6; rect(ctx,cx-2,gy,6,22,TP.white); rect(ctx,cx-12,gy+6,26,6,TP.white); }
  }
  function drawStall(ctx,bx,mid,botY){                                            // medieval shopfront bay: open counter + wares
    var x=bx+4, w=N-8;
    rect(ctx,x,mid+4,w,botY-10-(mid+4),TP.glass_dk); rect(ctx,x,mid+4,w,4,TP.frame);  // dim interior behind the opening
    rect(ctx,x-2,botY-10,w+4,4,TP.timber);                                            // fold-down counter board
    rect(ctx,x,botY-16,6,6,TP.awn_a); rect(ctx,x+8,botY-18,6,8,TP.thatch_lt); rect(ctx,x+16,botY-16,4,6,TP.clinic); // wares on the counter
    rect(ctx,x-2,botY-6,w+4,6,TP.daub_dk);                                            // stall base
  }
  function drawShop(ctx,L,topY,Wp,map,x0,ry){                                     // grey-brick shop with an open stall + hanging trade sign
    var R=L+Wp, cx=L+(Wp>>1), cols=Wp/N, eaveY=topY+26, wallTop=eaveY, wallBot=topY+2*N, footH=6;
    ctx.fillStyle='rgba(0,0,0,0.20)'; ctx.beginPath(); ctx.ellipse(cx+6,wallBot,(Wp>>1)+4,8,0,0,Math.PI*2); ctx.fill();
    brickWall(ctx,L,wallTop,Wp,wallBot,footH,(Math.imul(L,151)^Math.imul(topY,613)));
    var wbot=wallBot-footH, mid=(wallTop+wbot)>>1;
    for (var c=0;c<cols;c++){ var v=townRaw(map,x0+c,ry+1), ccx=L+c*N+(N>>1); if(v===12) drawDoor(ctx,ccx,wallBot-footH+2,false); else drawStall(ctx,L+c*N,mid,wbot); }
    gableRoof(ctx,L,topY,Wp,eaveY);
    var bkx=L, sy=topY+6;                                                             // hanging trade sign on an iron bracket (projects toward the path)
    rect(ctx,bkx-14,sy,16,4,TP.iron); rect(ctx,bkx-2,sy,4,6,TP.iron);
    rect(ctx,bkx-16,sy+6,18,14,TP.sign); rect(ctx,bkx-16,sy+6,18,2,TP.sign_dk); rect(ctx,bkx-16,sy+18,18,2,TP.sign_dk);
    rect(ctx,bkx-12,sy+10,10,6,TP.knob); px(ctx,bkx-8,sy+12,TP.sign_dk);              // coin icon
  }
  function drawWallSeg(ctx,bx,by,map){
    var x=bx*N, y=by*N, rim=(townRaw(map,bx,by-1)!==1), BH=16, BW=32; // weathered ashlar; running bond aligned to WORLD coords -> no per-tile banding
    rect(ctx,x,y,N,N,TP.stone);
    for (var gy=Math.floor(y/BH)*BH; gy<y+N; gy+=BH){ var band=(gy/BH)|0, offx=(band&1)?16:0, ry0=Math.max(y,gy), ry1=Math.min(y+N,gy+BH);
      if (gy>=y){ hline(ctx,x,x+N-1,gy,TP.stone_mortar); if(gy+2<y+N) hline(ctx,x,x+N-1,gy+2,TP.stone_lt); } // mortar course + lit top-of-block bevel
      for (var gx=Math.ceil((x-offx)/BW)*BW+offx; gx<x+N; gx+=BW){ if(gx>=x){ vline(ctx,gx,ry0,ry1-1,TP.stone_mortar); if(gx+2<x+N) vline(ctx,gx+2,ry0,ry1-1,TP.stone_dk); } }
    }
    var mr=RNG((Math.imul(bx+7,131)^Math.imul(by+13,977))>>>0);     // sparse moss, denser toward the base
    for (var m=0;m<7;m++){ var mmx=x+ri(mr,0,N-1), mmy=y+ri(mr,8,N-1); if(mr()<0.55) px(ctx,mmx,mmy,(mr()<0.5)?TP.moss:TP.moss_dk); }
    rect(ctx,x,y,2,N,TP.stone_dk); rect(ctx,x+N-2,y,2,N,TP.stone_dk);            // shaded outer faces
    if (rim){ rect(ctx,x,y,N,4,TP.stone_cap); rect(ctx,x,y+4,N,2,TP.stone_lt); } // lit capstone along the outer rim
    if (townRaw(map,bx,by+1)!==1){ ctx.fillStyle='rgba(0,0,0,0.22)'; ctx.fillRect(x,y+N,N,4); } // base contact shadow
  }
  function drawSaveMon(ctx,bx,by){
    var cx=bx*N+(N>>1), baseY=by*N+N-1, ty=baseY-22;
    ctx.fillStyle='rgba(122,192,232,0.16)'; ctx.beginPath(); ctx.arc(cx,ty-6,22,0,Math.PI*2); ctx.fill();  // aura
    ctx.fillStyle='rgba(0,0,0,0.24)'; ctx.beginPath(); ctx.ellipse(cx,baseY,14,6,0,0,Math.PI*2); ctx.fill();
    rect(ctx,cx-12,baseY-6,24,6,TP.stone_dk); rect(ctx,cx-10,baseY-12,20,6,TP.stone); rect(ctx,cx-10,baseY-12,20,2,TP.stone_cap); // stepped plinth
    rect(ctx,cx-6,baseY-18,12,6,TP.stone); rect(ctx,cx-6,baseY-18,12,2,TP.stone_cap);
    polyf(ctx,[[cx,ty-18],[cx-8,ty-6],[cx,ty+2],[cx+8,ty-6]],TP.save);           // floating crystal
    polyf(ctx,[[cx,ty-18],[cx-8,ty-6],[cx,ty-6]],TP.save_lt);
    polyf(ctx,[[cx,ty-18],[cx+8,ty-6],[cx,ty-6]],TP.save_dk); polyf(ctx,[[cx,ty+2],[cx-8,ty-6],[cx,ty-6]],TP.save_dk);
    px(ctx,cx-2,ty-12,TP.white); px(ctx,cx,ty-10,TP.save_lt);                    // glint
  }
  function drawExitGate(ctx,L,by,w){
    var y=by*N, top=y+2, wpx=w*N, R=L+wpx, cxg=L+(wpx>>1);
    rect(ctx,L,top,6,N,TP.stone); rect(ctx,R-6,top,6,N,TP.stone);                // posts
    rect(ctx,L,top,6,4,TP.stone_cap); rect(ctx,R-6,top,6,4,TP.stone_cap);
    rect(ctx,L,top,wpx,6,TP.stone); rect(ctx,L,top,wpx,2,TP.stone_cap);          // lintel
    rect(ctx,cxg-8,top+6,16,8,TP.roof); rect(ctx,cxg-8,top+6,16,2,TP.roof_ridge); // banner
  }
  function drawBush(ctx,cx,by){
    ctx.fillStyle='rgba(0,0,0,0.22)'; ctx.beginPath(); ctx.ellipse(cx,by,10,4,0,0,Math.PI*2); ctx.fill();
    function blob(x,y,r,c){ ctx.fillStyle=rgb(c); ctx.beginPath(); ctx.arc(x,y,r,0,Math.PI*2); ctx.fill(); }
    blob(cx,by-6,8,TP.bush_dk); blob(cx-6,by-6,6,TP.bush_dk); blob(cx+6,by-6,6,TP.bush_dk);   // dark base clumps
    blob(cx-4,by-8,6,TP.bush); blob(cx+4,by-10,6,TP.bush); blob(cx,by-12,6,TP.bush);          // mid
    blob(cx-2,by-12,4,TP.bush_lt); blob(cx+4,by-12,2,TP.bush_lt);                             // highlights
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
    if (terrainState&&terrainState.image){ try{terrainState.image.destroy();}catch(e){} try{if(terrainState.cimg)terrainState.cimg.destroy();}catch(e){} a1aDropAllGpu(); terrainState=null; lastReskinMapId=null; } // tear down stale overworld
    if (overlayState&&overlayState.container){ try{overlayState.container.destroy();}catch(e){} overlayState=null; }
    destroyDng();
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
  // The overworld mapData array the consolidation + Act-1 plate were last applied to. See the
  // identity guard in the 'ow' branch of tick() for why a key is not enough.
  var owMapRef=null;
  // Set when owmFor -- not tick() -- was the call that performed the setup, so tick() still learns
  // that the tiles moved under any window it had already cached. tick() consumes and clears it.
  var owSetupPending=false;
  /* THE OVERWORLD'S MAP IS SET UP EXACTLY ONCE PER mapData ARRAY, AND WHOEVER GETS THERE FIRST
     DOES IT. This used to live inline in tick()'s 'ow' branch, i.e. it could only ever run on the
     80 ms interval -- while owmFor() runs from the mover's per-frame sceneUpdate wrapper and
     therefore reaches a NEW array several frames earlier. That ordering was the whole of the map
     swap's residual cost (measured 2026-08-08, browser, town -> overworld):

       * act1-overworld-walk.bin's header hash is taken over the FULLY set-up map: generator
         output + consolidateMapData's mountain clustering + the owner's Act 1 plate. owmBakeFor
         compares owmMapHash(map) against it, so a map that is only PARTLY set up cannot match --
         and does not merely miss the bake, it silently falls through to owmBuild's per-pixel
         waterField/mountainField evaluation over the whole window. Measured: the same window
         36_228_44_38 costs 2.1 ms assembled from the bake and 488.4 ms built analytically.
       * NOT wrong, only slow -- an earlier draft of this comment claimed otherwise and an
         independent verification refuted it (docs/SMOOTH-ROUND-3-REFUTATION.md, 2026-08-08).
         The analytically built field is byte-identical to the settled one: 0 of 3,852,288
         pixels differ, 0 blocked/free flips, 0 of 58,240 sampled a1mFree decisions differ, at
         Greenhollow and Millbrook alike. The reason is that this window lies wholly inside the
         Act 1 plate rect and the plate is written last, so it had ALREADY been applied when the
         analytic build ran. Nor could canMove have exposed a difference: OWM_FIELD_OWNED={2,4,5}
         splits the authorities and canMove is never derived from owmBuild. So this is a 480 ms
         bake miss and nothing more. Keep the fix -- it is worth 480 ms per swap -- but do not
         justify it as a correctness repair.

     Doing the setup here, from the first caller that needs a settled map, is not a reordering of
     the work: it is the same one-shot block, still identity-guarded, still exactly once per array.
     It simply stops being reachable only from the slower of the two clocks. */
  function owEnsureMapSetup(scene){
    if(!scene || scene.currentMapId!=='overworld' || owMapRef===scene.mapData) return false;
    var md=scene.mapData; if(!md||!md.length||!md[0]) return false;
    owMapRef=md;                                        // BEFORE the body: one attempt per array, even on throw
    try{ consolidateMapData(scene);
         // Owner-locked Act 1 V3 plate: apply only after legacy mountain consolidation so
         // semantic forest, harbor water, and both bridge decks remain authoritative.
         if(window.__ACT1_WORLD_MAP__&&typeof window.__ACT1_WORLD_MAP__.apply==='function') window.__ACT1_WORLD_MAP__.apply(scene);
         if (typeof scene.renderMinimap==='function'){ scene.lastMinimapUpdate=0; scene.renderMinimap(); }
         return true;                                   // the tiles changed under any cached window
    }catch(e){ if(window.__DQ_DEBUG__) console.log('dq consolidate err '+e+(e&&e.stack||'')); }
    return false;
  }
  // SHIP SCOPE: owner 2026-07-09 confirmed towns + dungeons were LOCKED IN -> reflect them in the game.
  // (Initial same-day ship was overworld-only; owner reversed.) Overworld + town + dungeon reskin all ON.
  // NOTE: the dungeon reskin loads Codex prop PNGs from props/dqprop-<name>-128.png -> that dir MUST ship too.
  var SHIP_TOWN_DNG_RESKIN=true;
  /* ==============================================================================================
     THE OVERWORLD IS NOT DRAWN WHILE A BATTLE IS ON SCREEN.

     `scene.pause()` stops a scene's UPDATE. It does not stop its RENDER. Phaser's SceneManager
     renders on `settings.visible && status >= LOADING(3) && status < SLEEPING(7)`, and pause()
     sets status = PAUSED(6) while leaving `visible` true -- so the whole overworld display list
     was still walked and batched, every frame, for the entire fight.

     Measured on the running build (draw calls counted by wrapping gl.drawElements/drawArrays and
     attributing each to whichever scene's sys.render was on the stack). A/B interleaved A-B-A-B on
     ONE running page, because this fix's entire effect is that one boolean, so flipping it back
     reconstructs the shipped build exactly with no reload and no machine drift between arms.
     Apple M1 via ANGLE/Metal, 402x874 @ dpr 3, 300 frames per arm:

         in battle, shipped      WorldMapScene rendered 300/300 frames, 98 draw calls per frame,
                                 1.75-2.46 ms of main-thread CPU inside sys.render per frame
                                 BattleScene   rendered 300/300 frames,  0 draw calls per frame
                                 99 draw calls per frame total -- 99% of them the overworld
         same battle, hidden     1 draw call per frame total, WorldMapScene not rendered at all

     BE HONEST ABOUT WHAT THIS DID NOT DO, because the first draft of this comment was not.
       * Frame rate did not move: 16.7 ms median / 59.9 fps in BOTH arms. This Mac was vsync-bound
         with headroom to spare, so deleting the work bought no measurable fps here. An earlier
         measurement quoting "189.1 ms -> 16.8 ms" was taken under --use-angle=swiftshader, a CPU
         rasterizer; that number describes a software renderer, NOT a phone, and must not be quoted
         as a win.
       * Memory did not move AT ALL: 346 textures / 19 Act 1 chunks resident in both arms. This
         change does not free one byte. Freeing residency is the other fix's job (a1aReleaseChunks,
         just below); this one only stops DRAWING what is already resident.
     What it does buy is real but bounded: ~1.8-2.5 ms of main thread and 98 draw calls per frame,
     every frame, for the whole fight, on a device with far less headroom than this Mac.

     Every one of those 98 draw calls was INVISIBLE. #qok-ui is `position:fixed; inset:0;
     z-index:200` with an opaque background, and in battle it carries a full-bleed `cover` biome
     WEBP; the monster is a DOM <img> and the command rail is DOM. The canvas contributes nothing.
     This file is not the first to notice: ui-overhaul.css:403 and ui-overhaul.js:773 both already
     say "the Phaser canvas is hidden under the overlay during battle", which is why the battle
     hit-flash / crit / shake had to be re-bridged into the DOM in the first place. The shipped
     code already assumed what this makes true.

     WHY VISIBILITY AND NOT SLEEP. `scene.sleep()` would also stop the render, but it emits SLEEP,
     tears input down and is not what endBattle() undoes -- endBattle() calls scene.resume(), which
     pairs with pause(). Flipping `visible` leaves the pause/resume contract exactly as the bundle
     wrote it and touches nothing else.

     RESTORE IS EVENT-DRIVEN, NOT POLLED, AND THAT IS THE WHOLE POINT. tick() runs on an 80 ms
     interval; restoring from there would leave up to 80 ms of an undrawn canvas after the battle
     tears its overlay down -- a black flash on every single return.

     The ordering is not what it looks like, so do not "simplify" it. endBattle() calls
     ScenePlugin.resume, and ScenePlugin.resume does NOT resume anything: it is
     `this.manager.queueOp("resume", ...)` (bundle), deferred to the queue drain at the top of the
     NEXT game step. Systems.resume is the one that runs synchronously
     (`y.status=RUNNING, y.active=!0, v.emit(l.RESUME, ...)`), and it runs inside that drain --
     which happens before that step's render. The net effect is what matters and it was measured,
     not reasoned: over 40 frames across an endBattle(), settings.visible flipped on frame 1, the
     flip's stack was `a1vShow <- emit <- Systems.resume` (i.e. the listener, NOT the 80 ms tick),
     and the count of frames in which WorldMapScene was RUNNING-but-not-drawn was ZERO. The
     BattleScene shutdown that removes the DOM overlay is drained from the same queue on the same
     step, so the overlay and the overworld change over together.

     Hiding, by contrast, is safe to poll: the encounter has already run cameras.main.fadeOut(400)
     to solid black before it launches BattleScene, so the worst case is one extra 80 ms of drawing
     a black screen.

     Three independent restores, because a missed one is a black screen the player cannot escape:
       1. RESUME  -- the normal exit (win, flee, and every non-battle pauser).
       2. START   -- Systems.start() sets `visible = true` itself; the listener only clears our
                     flag. This is the GameOverScene "retry" path, which does scene.start(
                     'WorldMapScene') without ever resuming.
       3. tick()  -- if WorldMapScene is somehow RUNNING while we still believe we hid it, undo it.
     A defeat deliberately keeps the overworld hidden: BattleScene stops straight into
     GameOverScene, which renders its own opaque camera background on the canvas, and WorldMapScene
     stays PAUSED underneath it until retry restarts it.
     ============================================================================================== */
  // ============================================================
  //  QUIZ — the CORRECT ANSWER was not random, and the owner could see it
  // ============================================================
  //  "the answers required for the questions do not seem very random. When I am playing as a 1st
  //  grader, the answers are mostly 5 ... If it can be predicted there is no challenge."
  //
  //  He is right, and it is arithmetic, not a feeling. Every generator in the bundle draws the
  //  SECOND operand from a range that depends on the FIRST -- grade 1 easy addition is
  //  `x = rand(1,4); y = rand(1, 5-x)` -- so the range shrinks as x grows and the probability piles
  //  onto the maximum sum. Enumerated exactly:
  //    grade 1 easy addition     answer 5 in 52.1% of questions   (uniform would be 25%)
  //    grade 1 easy subtraction  answer 1 in 52.1%                (uniform would be 25%)
  //    grade 1 medium addition   answer 8 in 19.0%,  hard: 9 in 15.7%
  //  Same shape in every grade; it is mildest where the range is widest (grade 3 tops out at 1.5%).
  //  The DISTRACTORS and their positions were never the problem -- the bundle's answer builder
  //  already shuffles four options -- so this touches only which correct answer comes up.
  //
  //  WHY A SAMPLER AND NOT A REWRITE. The generators live in the frozen bundle, one per grade x
  //  category x tier, each with its own operand ranges. Re-deriving those ranges out here would
  //  duplicate a table that is certain to drift from the one actually being used. Drawing several
  //  candidates from the REAL generator and preferring an answer that has not come up lately needs
  //  no knowledge of any range, and it fixes every grade and category at once, including any added
  //  later. Simulated over 200k questions: grade 1 easy addition 51.9% -> 26.7%, subtraction
  //  52.1% -> 26.8%, against a 25% ideal.
  //
  //  Cost is a handful of extra calls to a function that does two integer draws and builds four
  //  strings, once per battle turn. The loop stops early the moment it draws an unseen answer,
  //  which is the common case.
  var QZ={ wired:false, recent:[] }, QZ_WINDOW=20, QZ_DRAWS=12;
  function qzAnswerOf(q){
    var ans=q&&q.answers; if(!ans||!ans.length) return null;
    for(var i=0;i<ans.length;i++){
      if(ans[i]&&ans[i].isCorrect){ var t=ans[i].text; return t?(t.en!==undefined?t.en:t):null; }
    }
    return null;
  }
  function qzInstall(){
    if(QZ.wired) return;
    var gs=window.__GAME_STATE__, qm=gs&&gs.quizManager;
    if(!qm||typeof qm.getQuestion!=='function'||qm.__qzWrapped) return;
    var original=qm.getQuestion.bind(qm);
    qm.getQuestion=function(zone,isBoss){
      var best=null, bestScore=Infinity, i, j;
      for(i=0;i<QZ_DRAWS;i++){
        var q=original(zone,isBoss), a=qzAnswerOf(q);
        if(a===null) return q;                      // a shape we do not understand -> leave it alone
        var score=0;
        for(j=0;j<QZ.recent.length;j++) if(QZ.recent[j]===a) score++;
        if(score<bestScore){ bestScore=score; best={q:q,a:a}; }
        if(score===0) break;                        // unseen in the window: take it and stop drawing
      }
      if(!best) return original(zone,isBoss);
      QZ.recent.push(best.a);
      while(QZ.recent.length>QZ_WINDOW) QZ.recent.shift();
      return best.q;
    };
    qm.__qzWrapped=true; QZ.wired=true;
  }

  var A1V={hidden:false};
  function a1vInstall(scene){
    // Re-checked from tick() rather than latched in a variable, for a1mInstall's reason: the flag
    // lives on the Systems object, so a scene that is destroyed and re-created re-arms itself.
    if(!scene||!scene.sys||!scene.sys.events||scene.sys.__a1vWired) return;
    scene.sys.events.on('resume',a1vShow);
    scene.sys.events.on('start',a1vShow);
    scene.sys.__a1vWired=true;
  }
  function a1vHide(g){
    if(A1V.hidden) return;
    var wm; try{ wm=g.scene.getScene('WorldMapScene'); }catch(e){ return; }
    if(!wm||!wm.sys||!wm.sys.settings) return;
    // PAUSED specifically, not merely "not RUNNING": a scene that is still INIT/CREATING, or one
    // already SHUTDOWN, must not have its visibility rewritten out from under Systems.start().
    if(!wm.sys.isPaused||!wm.sys.isPaused()||!wm.sys.settings.visible) return;
    wm.sys.settings.visible=false; A1V.hidden=true;
  }
  function a1vShow(){
    if(!A1V.hidden) return;
    A1V.hidden=false;
    var g=window.__PHASER_GAME__; if(!g) return;
    var wm; try{ wm=g.scene.getScene('WorldMapScene'); }catch(e){ return; }
    if(wm&&wm.sys&&wm.sys.settings) wm.sys.settings.visible=true;
  }
  function tick(){
    var g=window.__PHASER_GAME__; if(!g) return;
    var scene; try{ scene=g.scene.getScene('WorldMapScene'); }catch(e){ return; }
    if (!scene) return;
    // BEFORE the isActive/tileGrid guards, not just before the kind branch. These two used to live
    // in the kind==='dng' branch, i.e. they only ran once the player was ALREADY inside a dungeon --
    // too late for the loadMap that put them there. Behind the guards they were still too late for a
    // save RESUMED inside a dungeon: WorldMapScene runs its first loadMap in create(), before it is
    // active and before it has a tileGrid, so tick() bailed and the wrapper was never installed.
    // Here the wrapper lands on the instance while the scene is still INIT, so even that first
    // loadMap swaps the real floor in.
    try{ a1dFetch(); a1dInstall(scene); }catch(e){ if(window.__DQ_DEBUG__) console.log('dq a1d install '+e); }
    // Beside a1dInstall and for exactly its reason: WorldMapScene runs its first loadMap inside
    // create(), before the scene is active and before it has a tileGrid, so anything installed
    // behind the guards below is too late for it. Too late here is not cosmetic -- that first
    // loadMap IS the overworld build SMOOTH-1 and SMOOTH-4 measure, so a wrapper that misses it
    // saves nothing on the load and only helps on later swaps. This interval starts at script
    // parse, ~80 ms apart, and the player is on the title screen for seconds before Continue.
    try{ owrInstall(scene); }catch(e){ if(window.__DQ_DEBUG__) console.log('dq owr install '+e); }
    // Beside a1dFetch and for the same reason: as early as WorldMapScene exists, which is during
    // create() and therefore while the title screen is still up. Asked for lazily from owmFor
    // instead, the request is issued on the same frame as the first window build and cannot
    // possibly answer it -- measured on device, that first build fell back to owmBuild and cost
    // 573 ms while the world faded in. Started here it is resident before the player taps
    // Continue, and every rebuild of the session is the baked one.
    try{ owmBakeLoad(); }catch(e){ if(window.__DQ_DEBUG__) console.log('dq owm fetch '+e); }
    try{ qzInstall(); }catch(e){ if(window.__DQ_DEBUG__) console.log('dq quiz install '+e); }
    // Re-checked, not latched: Phaser resets sys.sceneUpdate to its no-op on shutdown/restart and
    // re-captures scene.update on the next create(), which would quietly drop the wrapper.
    try{ a1mInstall(scene); }catch(e){ if(window.__DQ_DEBUG__) console.log('dq a1m install '+e); }
    // Beside a1mInstall and re-checked for its reason. It must be wired BEFORE the isActive guard:
    // the listener that restores the overworld has to already exist when the battle ends, and the
    // guard below is exactly where a battle stops tick() from reaching anything.
    try{ a1vInstall(scene); }catch(e){ if(window.__DQ_DEBUG__) console.log('dq a1v install '+e); }
    // A BATTLE is the one departure from the overworld that this guard hides. Towns and dungeons
    // are map swaps -- WorldMapScene stays ACTIVE, so the kind!=='ow' branch below reaches
    // a1aReleaseChunks and trims the Act 1 chunk cache from the full A1A_MAX_CHUNKS=10 (~493 MB)
    // to the departure window (~4 chunks, ~197 MB). An encounter instead SLEEPS WorldMapScene and
    // runs BattleScene, so tick() returned HERE and every trim below was unreachable: the whole
    // 10-slot cache stayed resident on the GPU underneath a full-screen battle background and a
    // monster sprite, for the entire battle. That is the same "a scene allocates on top of whatever
    // the overworld still holds" failure the dungeon comment at the kind!=='ow' branch describes --
    // battles were simply never on that path.
    //
    // Measured on the simulator, encounter -> in-battle steady state: 684 MB mean with the cache
    // retained against 455 MB pre-round-5, i.e. round 5 raised the in-battle floor by ~230 MB while
    // the transition itself peaks near 1 GB. The simulator has host RAM and survives it; a phone's
    // WebContent jetsam limit does not, and a terminated WebContent reloads the page -- which is
    // exactly the owner's "it goes to the beginning screen when encountering an enemy".
    //
    // Idempotent via A1A.released, and re-armed by `A1A.released=false` on the next kind==='ow'
    // tick, so returning from the battle behaves precisely like walking back out of a town. The
    // departure window is deliberately KEPT rather than dropped wholesale -- dropping everything is
    // what made walking back out cost 4.6 s (see a1aReleaseChunks).
    if (!g.scene.isActive('WorldMapScene')){
      try{ a1aHideCanopy(); a1aReleaseChunks(); }catch(e){ if(window.__DQ_DEBUG__) console.log('dq battle release '+e); }
      // The cache trim above attacks the FLOOR the encounter peak sits on. This attacks the peak
      // itself: while BattleScene is up the overworld is drawn and never seen. Scoped to
      // BattleScene rather than to "inactive" so a menu or a shop -- which this file has not
      // measured -- keeps behaving exactly as it ships today.
      try{ if(g.scene.isActive('BattleScene')) a1vHide(g); }catch(e){ if(window.__DQ_DEBUG__) console.log('dq a1v hide '+e); }
      // AND FREE THE LAYERS A BATTLE CANNOT SEE. The owner's device loses the GPU context ~half a
      // second into an encounter -- `gl lost at 22270ms, restored=0`, `in battle 550ms`,
      // `scenes BattleScene` -- and the recovery net then reloads the page, which is his "battle
      // encounters tried to send the player to the intro screen". a1aReleaseChunks above already
      // trims the cache to the departure window, but that window is still ~9 chunks, and each chunk
      // holds base + water + canopy at 1536x1536 RGBA.
      //
      // Canopy and water are the treeline and the glint: both are drawn ABOVE the terrain, both are
      // invisible under a full-screen battle overlay, and both come back from objects we still hold
      // -- the decoded water image and the canopy composite bitmap -- so returning is an addImage,
      // not a re-decode or a re-composite. This attacks the encounter PEAK, which is where the
      // context actually dies.
      //
      // ~~"BASE is deliberately kept: dropping it would leave the player looking at flat sea on the
      // way out of every battle."~~ **The owner's build-24 report retires that trade, 2026-08-14:**
      // *"the pause happened right after a battle started. yt paused too. after the battle the
      // screen was blue."* A YouTube video in ANOTHER app pausing is iOS reclaiming system-wide, so
      // the encounter peak is still over the line, and the blue screen he got AFTER the battle is
      // the context having died DURING it. Keeping base bought a smoother exit from a battle that
      // increasingly does not survive to have one.
      //
      // Base comes back exactly as cheaply as the other two: `rec.base` is a decoded image we still
      // hold and a1aTexFor's non-canopy path is a bare addImage from it. The drain also takes base
      // jobs FIRST across chunks (a1aTakeTexJob), and the burst below shortens the gap further, so
      // the cost is a brief sea-coloured moment on exit rather than the permanent one item 8
      // reported -- that symptom was a renderer that never rebuilt at all, which is a different
      // fault and is fixed.
      //
      // THE COMPOSITES GO TOO. Dropping the canopy TEXTURE hands back Phaser's reference to each
      // 1536x1536 composite bitmap, but not ours (`rec.bm.canopyComposite`), so ~9.4 MB a chunk
      // survived the drop it was supposed to be freed by. a1aFreeComposite drops our half; it is
      // rebuilt from rec.base + rec.canopy, both still held. Together with base that is ~19 MB a
      // chunk off the encounter peak, ~95 MB across a departure window.
      try{
        a1aDropLayerGpu('canopy'); a1aDropLayerGpu('water'); a1aDropLayerGpu('base');
        Object.keys(A1A.chunks).forEach(function(id){ a1aFreeComposite(A1A.chunks[id]); });
        A1A.drew=false;                                  // the sprites are gone; force a rebuild on return
      }
      catch(e){ if(window.__DQ_DEBUG__) console.log('dq battle layer drop '+e); }
      return;
    }
    // Safety net only, and it should never fire. RESUME and START restore visibility on the same
    // step that makes the scene RUNNING, i.e. before that step renders (measured: zero
    // RUNNING-but-not-drawn frames; see A1V above). This catches a path that reached RUNNING
    // without emitting either, and pays up to 80 ms of black to do it.
    if (A1V.hidden) a1vShow();
    if (!scene.mapData || !scene.tileGrid || !scene.tileGrid.length) return;
    var kind=sceneKind(scene);
    // Leaving the overworld: the depth-11 canopy must not linger over a town/dungeon, AND the
    // Act 1 chunk cache is trimmed to the window she walked out of. A dungeon allocates its own
    // base + fog canvases on top of whatever the overworld still holds, so keeping the full
    // ~493 MB 10-slot cache resident there is what starves the renderer -- but dropping it
    // WHOLESALE is what made walking back out cost 4.6 s. See a1aReleaseChunks.
    if(kind!=='ow'){ lastReskinMapId=null; a1aHideCanopy(); a1aReleaseChunks(); }
    if (kind!=='town' && townState) destroyTown();      // left a town -> drop its canvas so it can't linger over ow/dng
    // The same rule for the dungeon, which never had one. reskinTown has torn dngState down since
    // towns shipped -- so walking a dungeon -> town was always clean -- but NOTHING did on the way
    // out to the OVERWORLD, and that is the far commoner exit. What survived was `dqdngfog`: a
    // depth-8, setScrollFactor(0) image holding the last frame updateFog() painted, i.e. a
    // screen-locked sheet of darkness over the whole overworld that no amount of walking or waiting
    // could clear, because updateFog() is only reachable from the 'dng' branch below.
    // Measured on device (Sunken Cellar exit, 2026-08-08): 21.0% of the play area was the exact
    // (5,5,9) fill updateFog writes, against 0.03% on a fresh load of the same cell, and the dark
    // region kept its bounding box while the hero walked (IoU 0.88) -- screen-pinned, not world-
    // anchored as first reported.
    // Guarded on kind==='ow', NOT kind!=='dng': sceneKind() returns null during map churn, and a
    // teardown on a transient null would make ensureDng rebuild the base canvas mid-dungeon.
    if (kind==='ow') destroyDng();                      // left a dungeon -> drop its base canvas + its fog
    // The sea backdrop is screen-locked at depth 0.5, so left visible it would be a flat blue
    // sheet over a town or a dungeon floor. Hidden on ANY non-'ow' kind, re-shown by updateTerrain.
    // Guarded on a real kind, never a transient null, for the same reason destroyDng is.
    if (kind && kind!=='ow') a1aSea(null,false);
    if ((kind==='town'||kind==='dng') && owMap) destroyOwProps(); // entered a town/dungeon -> drop landmark prop images (NOT on a transient null kind)
    if (kind!=='ow' && !SHIP_TOWN_DNG_RESKIN){
      // Overworld-only ship: tear down any stale overworld terrain/overlay so it can't linger over the engine's
      // native town/dungeon art, then bail — towns + dungeons render exactly as the base game does (unchanged).
      if (terrainState&&terrainState.image){ try{terrainState.image.destroy();}catch(e){} try{if(terrainState.cimg)terrainState.cimg.destroy();}catch(e){} a1aDropAllGpu(); a1aDestroySea(); terrainState=null; lastReskinMapId=null; }
      if (overlayState&&overlayState.container){ try{overlayState.container.destroy();}catch(e){} overlayState=null; }
      return;
    }
    if (kind==='ow'){
      // RETURNING FROM A DEPARTURE IS A BURST, STEADY WALKING IS A TRICKLE. One texture per 80 ms
      // tick is the right rate while the player is walking, because the ring has already loaded what
      // the next step needs and a burst there would only cost frames. Coming back from a battle or a
      // town is the opposite case: the battle path now drops every chunk layer from the GPU (see
      // there), so the window has to be rebuilt from scratch and at one per tick a nine-texture
      // window takes ~720 ms -- visible as a sea-coloured moment, which is exactly the cost the old
      // "keep base" comment was avoiding. These uploads are addImage from bitmaps already in memory
      // (~2 ms each, measured), so the burst is affordable in a frame the player is already watching
      // a scene transition through. Three ticks of it clears a full window.
      // BURST SIZE IS A FUNCTION OF THE GRID, AND THE GRID CHANGED UNDER IT. `6 per tick for 3
      // ticks` was 18 textures, which covered a 6-chunk window on the old 32-cell grid. The re-tile
      // made a window 16 chunks -- 48 textures -- so the burst covered a third of it and the rest
      // trickled at one per 80 ms tick: ~2.4 s of flat sea after every battle, which is exactly what
      // the owner reported on build 27 ("after battles, the screen briefly shows blue"). Sizing it
      // to the QUEUE instead of to a number keeps it correct through the next re-tile too.
      if(A1A.released) A1AB.burst=A1AB_TICKS;          // latch the moment we come BACK, before the flag clears
      A1A.released=false;                              // back on the overworld: arm the next departure's trim
      a1aFetch();                                      // one-shot; the Act 1 art manifest + landmark table
      var _n=1;
      if(A1AB.burst>0 && A1A.texQ.length){ _n=A1AB_RATE; A1AB.burst--; }
      else if(A1AB.burst>0){ A1AB.burst=0; }           // queue drained early: stop bursting, do not spend the frames
      try{ a1aDrainTex(scene,_n); }catch(e){ if(window.__DQ_DEBUG__) console.log('dq tex q '+e); } // one chunk texture per tick while walking; a burst on return
      var mapId=scene.currentMapId+':'+scene.mapData.length+'x'+(scene.mapData[0]?scene.mapData[0].length:0);
      // DATA MUTATION (owner-approved sandbox exception): consolidate sprinkled mountains in mapData IN PLACE,
      // ONCE per map ARRAY, BEFORE reskin — so overlay + minimap + collision all read the same tiles. The body
      // moved to owEnsureMapSetup so owmFor can reach it on the per-frame clock; see there for why. It is
      // still guarded on the ARRAY IDENTITY, not on `mapId`: walking out of a town hands the engine a brand-new
      // overworld array with the SAME id and the SAME dimensions, so a key-only gate skips it entirely and the
      // consolidation is silently lost. This is the third time that exact shape of bug has landed in this file
      // (the Act-1 plate, then updateDng's stale floor).
      var owFresh=owEnsureMapSetup(scene)||owSetupPending;
      owSetupPending=false;                             // consume whatever an earlier owmFor did
      if (mapId!==lastReskinMapId){ lastReskinMapId=mapId;
        try{ reskin(scene); }catch(e){ if(window.__DQ_DEBUG__) console.log('dq reskin err '+e+(e&&e.stack?e.stack:'')); } }
      else { var a1fresh=A1A.dirty||owFresh; A1A.dirty=false;   // a chunk (or the manifest) just landed -> the cached window is stale
             try{ ensureTerrain(scene); updateTerrain(scene,a1fresh); }catch(e){ if(window.__DQ_DEBUG__) console.log('dq terr err '+e); }
             try{ rebuildOverlay(scene,a1fresh); }catch(e){ if(window.__DQ_DEBUG__) console.log('dq ovl err '+e); } }
      try{ owSpecialObjects(scene); }catch(e){ if(window.__DQ_DEBUG__) console.log('dq owprop err '+e+(e&&e.stack||'')); } // ALWAYS run props (even during boot map-churn)
      // AFTER the rebuild, so a window that legitimately just changed is judged on its result and
      // not mid-flight. See a1aSpriteWatchdog: this is what stops the blue screen being permanent.
      try{ a1aSpriteWatchdog(scene); }catch(e){ if(window.__DQ_DEBUG__) console.log('dq watchdog '+e); }
    } else if (kind==='dng'){
      // Act-1 semantic floors. The loadMap wrapper is the normal path; the key check below is the
      // safety net for the two cases it cannot reach — the very first loadMap (fired in create()
      // before this file ever sees the scene, e.g. a save resumed inside a dungeon) and a JSON
      // response that lands after the player is already on the floor.
      try{ a1dFetch(); a1dInstall(scene);
           var a1w=A1D_MAPS[scene.currentMapId]?scene.currentMapId+'-f'+(scene.currentFloor||1):null;
           // Guard on the ACTUAL map shape, not just a key. The overworld override was silently
           // lost because returning from a town handed the engine a new mapData array under an
           // unchanged reskin key, so its key-only guard skipped the re-apply and nothing looked
           // wrong. Every `this.mapData =` in the bundle is inside loadMap, so the wrapper already
           // covers every path here -- this makes the tick self-healing if that ever stops holding.
           if(!a1w) a1dKey=null;
           else if(a1dFloors){ var fl0=a1dFloors[a1w], md=scene.mapData;
             if(fl0 && (a1dKey!==a1w || !md || md.length!==fl0.height || (md[0]||[]).length!==fl0.width))
               a1dApply(scene); }
           a1dRescueHero(scene);
           // Ask for the floors on either side of this one while she is WALKING, not when she is
           // already standing on the stairs. See a1dPrefetchAdjacent for what that cost before.
           a1dPrefetchAdjacent(scene);
      }catch(e){ if(window.__DQ_DEBUG__) console.log('dq a1dng err '+e+(e&&e.stack||'')); }
      try{ var tk=dngThemeKey(scene), changed=(tk!==curThemeKey)||a1dChanged; curThemeKey=tk; a1dChanged=false; setTheme(tk);
           ensureDng(scene); updateDng(scene,changed); dngSpecialTiles(scene); updateFog(scene); window.__HD2D_STYLE__='dq-dng:'+tk; }catch(e){ if(window.__DQ_DEBUG__) console.log('dq dng err '+e+(e&&e.stack||'')); }
    } else if (kind==='town'){
      var tmid=scene.currentMapId+':'+scene.mapData.length+'x'+(scene.mapData[0]?scene.mapData[0].length:0);
      var alive=townState&&townState.scene===scene&&townState.image&&townState.image.scene;
      if (tmid!==lastTownMapId || !alive){ lastTownMapId=tmid; try{ reskinTown(scene); }catch(e){ if(window.__DQ_DEBUG__) console.log('dq town err '+e+(e&&e.stack||'')); } }
    }
  }
  // Run it once NOW rather than waiting out the first interval. Every stage tick() gates -- the
  // a1d install, the overworld bake load, the movement wrapper, the reskin -- used to start up to
  // 80 ms later than it had to, on a boot where the whole point is to be early. Same shape as
  // ui-overhaul.js's `startLoop()` (`tick(); setInterval(tick, 50);`). tick() is written to be
  // called before anything exists: it returns on a missing game, a missing scene, or an inactive
  // one, which is exactly what it finds here.
  tick();
  setInterval(tick,80);
  // PARSE-TIME PREFETCH. Both Act-1 dungeon loads used to be issued from tick(), which cannot run
  // until WorldMapScene exists -- so on a save RESUMED inside a dungeon the 42 KB floor JSON was
  // only requested AFTER the player was already standing on the floor. By then the engine's own
  // DECLARED 100x100 placeholder map is live and dungeons have culling off, so ~10,000 tile sprites
  // are submitted every frame; that starves timers and XHR callbacks. Measured on device (iPhone 17
  // Pro sim, sunkenCellar f3): 8.7 s for that local 42 KB file, then 5.3 s more to decode the
  // 4.26 MB baked PNG -- ~14 s of raw engine brick and the procedural knight before the reskin and
  // the g3 hero appeared. Both requests are cheap and idempotent, so issue them while the title
  // screen is still up: the art key comes from the save the player is about to resume.
  a1dFetch();
  try{ var _sv=JSON.parse(localStorage.getItem('edu-rpg-save')||'null'), _p=_sv&&_sv.player&&_sv.player.position;
       if(_p&&A1D_MAPS[_p.mapId]){ var _k=_p.mapId+'-f'+(_p.floor||1); a1dArtFor(_k); a1mMaskFor(_k); } }catch(e){}
  // The OVERWORLD half of the same argument, and it had been left out. a1aFetch() was reachable
  // from exactly one place -- the kind==='ow' branch of tick() -- so the manifest was not even
  // REQUESTED until WorldMapScene was already active on the overworld, and the first chunk was
  // requested a round trip after that. Every window built in the meantime misses a1aBlit and pays
  // drawTerrain's 2.97 M-px procedural splat instead. Issued here the manifest is resident, and
  // a1aPrefetchStart has the start window's chunks in flight, before the player taps Continue.
  // a1aFetch latches on A1A.req, so tick()'s call is a no-op from here on.
  a1aFetch();
  // Verification handle for the dungeon's continuous movement. There is no other way to ask the
  // running game where the hero actually IS: the save format and every HUD read are tile-integer,
  // so a 48 px hop and a smooth walk look identical from outside. Exposed rather than inferred so
  // both the offline harness and an on-device check read the same numbers the mover uses.
  window.__A1_DNG_MOVE__={ maskFor:a1mMaskFor, forScene:a1mFor, free:a1mFree, step:a1mStep,
    slide:a1mSlide, cam:a1mCam,
    unstick:a1mUnstick, input:a1mInput, state:function(){ return a1mState; },
    footDy:a1mFootDy,
    K:{ FOOT:A1M_FOOT, LEAN:A1M_LEAN, STEP:A1M_STEP, SPEED:A1M_SPEED, CH:A1M_CH } };
  // TERRAIN READINESS, for the shell's loading cover (index.html #boot-cover).
  //
  // Owner 2026-08-07, on a device capture of the world mid-load: "the hero is right but the
  // overworld and minimap is wrong. I'd rather have a loading screen than to show this stuck old
  // state." The HUD chrome arrives early and complete while the terrain is still black, so the
  // shell needs to know when the ground under it is genuinely painted. Only this file knows that.
  //
  // Three conditions, in the order they can fail:
  //   lastWin  -- updateTerrain has actually drawn a window at least once. Before that the layer
  //               is empty and the player sees the page background, which is the black in the
  //               capture.
  //   MAT.ready-- the material images have decoded. Until they do drawTerrain falls back to the
  //               flat palette (see MAT at the top of this file), which is the "procedural
  //               fallback" look rather than the painted ground.
  //   A1A      -- inside the Act 1 art footprint, the baked chunks must have been blitted.
  //               a1aInBounds() is false when there is no manifest, so this never blocks outside
  //               Act 1 -- but a manifest still IN FLIGHT does block, otherwise the gate would
  //               pass in the window before we can even tell whether we are in Act 1.
  // SCOPED TO THE OVERWORLD ON PURPOSE. ensureTerrain/updateTerrain are only ever called from the
  // kind==='ow' branch of the reskin tick, so in a town or a dungeon terrainState is either null
  // (fresh boot straight into one, which is exactly what a Continue from the starting save does --
  // it resumes in Greenhollow) or a leftover from a previous overworld visit. Requiring it there
  // would hold the cover up for its full timeout on the most common Continue there is. Towns and
  // dungeons render through the engine's own tile grid, which is up immediately.
  //
  // NOTHING HERE MAY WAIT ON AN ASSET THAT MIGHT NEVER ARRIVE. a1aFetch() sets A1A.req once and
  // never clears it, and it has no onerror -- a 404, a parse failure or the density guard at
  // "leave the art off" all leave req true and manifest null forever. An earlier version of this
  // gate waited on `req && !manifest` and would therefore have held the loading cover up until its
  // timeout on every such boot. So the chunk condition applies ONLY once the manifest has actually
  // arrived AND the hero is inside the art footprint, which matches the failure-is-safe policy MAT
  // already documents at the top of this file. lastWin and MAT.ready are what remove the black
  // screen and the flat palette fallback; they cannot hang, because both have completion handlers.
  // The two ART conditions are GRACED, not required. Both MAT and the Act 1 chunks are documented
  // as failure-is-safe: if they 404 the renderer runs forever on the palette ramp and that is a
  // supported shipped state, so a gate that waits on them unconditionally would hold the loading
  // cover until its timeout on every such boot -- measured, when `/materials/` was not resolvable.
  // So: once a terrain window exists the cover waits a bounded extra moment for the real art, and
  // then lifts regardless. The unbounded part is only `lastWin`, which is what actually removes
  // the black screen and cannot hang -- updateTerrain sets it on the reskin tick.
  var READY_GRACE=1800;
  function terrainState_ready(sc){
    if(!terrainState || !terrainState.lastWin) return false;
    var waited=terrainState.firstDrawAt?(Date.now()-terrainState.firstDrawAt):READY_GRACE;
    if(waited>=READY_GRACE) return true;
    if(!MAT.ready) return false;
    if(A1A.manifest && a1aInBounds(sc.heroTileX, sc.heroTileY) && !A1A.drew) return false;
    return true;
  }
  function worldScene(){
    var g=window.__PHASER_GAME__;
    return (g&&g.scene&&g.scene.getScene)?g.scene.getScene('WorldMapScene'):null;
  }
  function terrainReady(){
    var sc=worldScene();
    if(!sc||!sc.mapData||!sc.mapData.length||!sc.tileGrid||!sc.tileGrid.length) return false;
    if(sceneKind(sc)!=='ow') return true;
    return terrainState_ready(sc);
  }
  // Diagnostic for the loading gate: which condition is still outstanding.
  function terrainReadyWhy(){
    var sc=worldScene();
    if(!sc) return {scene:false};
    return { kind:sceneKind(sc), mapData:!!(sc.mapData&&sc.mapData.length), tileGrid:!!(sc.tileGrid&&sc.tileGrid.length),
      terrainState:!!terrainState, lastWin:terrainState?terrainState.lastWin:null, mat:MAT.ready,
      a1aReq:A1A.req, a1aManifest:!!A1A.manifest, inBounds:a1aInBounds(sc.heroTileX,sc.heroTileY),
      drew:A1A.drew, hero:[sc.heroTileX,sc.heroTileY], ready:terrainReady() };
  }
  // Cumulative cost counters for the on-device panel — see COST. `plate` is read live, because it
  // is the one field that says whether the locked-art path is in force at all.
  function terrainCost(){
    var sc=worldScene();
    return { splat:COST.splat, canopy:COST.canopy, tex:COST.tex, plate:a1aPlateOwns(sc)?1:0,
             wMs:COST.wMs, wWhat:COST.wWhat,
             sprLive:A1A.sprLive|0, sprWant:A1A.sprWant|0, sprFix:A1AW.fixes|0, sprDeep:A1AW.deep|0,
             reloads:A1A.reloads|0,   // layer re-requests: non-zero means a load failed and was retried
             sprGl:a1aGlLost()?1:0 };
  }
  window.__DQ_TILES__={ reskin:reskin, ready:terrainReady, readyWhy:terrainReadyWhy, cost:terrainCost, redraw:function(){ if(terrainState){ terrainState.lastWin=''; updateTerrain(terrainState.scene,true);} if(overlayState){ overlayState.lastKey=''; rebuildOverlay(overlayState.scene,true);} } };
})();
