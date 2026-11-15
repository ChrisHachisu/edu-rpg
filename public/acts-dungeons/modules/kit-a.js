/* Authored Acts 2-5 dungeons, mechanic batch A: shared helper (window.__QOK_D2KIT_A__).
   Registers no mechanic. Used by mine-carts, slide-ice, gust-walkways, shadow-freeze,
   forest-rooms, glyph-plates, tripwires-and-spikes and cracked-walls (one file each beside this
   one). The manifest loads module scripts async, in any order: each module waits for this kit
   through K.ready(fn) below (or its own short retry) before it registers.

   STRINGS. The bundle's locale table is frozen, so new player-facing text is carried here in the
   same three variants the bundle has (en / ja = spaced kana for young readers / jaKanji), and is
   picked the way the bundle picks (locale 'ja' + the kanji flag). Keep all three in step. */
(function(){
  'use strict';
  if(window.__QOK_D2KIT_A__) return;
  var TILE=48, TICK=185;                                   // one plan tick = one hero step at 260 px/s (SCHEMA.md)
  var STR={
    en:{
      'verb.ride':'Ride cart', 'verb.lever':'Pull lever', 'verb.read':'Read', 'verb.cut':'Cut trip wire', 'verb.look':'Look',
      'mine.leverTo':'The lever clunks over. The points now lead {dir}.',
      'mine.dir.n':'north', 'mine.dir.s':'south', 'mine.dir.e':'east', 'mine.dir.w':'west',
      'gust.blown':'The gust swept you off the walkway!',
      'gust.blownDown':'The gust swept you off the walkway! You landed on the floor below.',
      'shadow.caught':'The shadow lunges out of the dark!',
      'tomb.tablet':'A stone tablet. Glyphs are carved in a row:',
      'tomb.tabletHint':'Step on the plates in this order.',
      'tomb.wrong':'Wrong plate! A Tomb Guardian rises from the sand!',
      'tomb.reset':'The plates go dark. You are back at the door.',
      'tomb.solved':'Every glyph is lit. The far door grinds open!',
      'tomb.hintTitle':'Order',
      'glyph.sun':'Sun', 'glyph.moon':'Moon', 'glyph.snake':'Snake', 'glyph.ankh':'Ankh', 'glyph.eye':'Eye', 'glyph.bird':'Bird',
      'glyph.scarab':'Scarab', 'glyph.reed':'Reed', 'glyph.water':'Water', 'glyph.hand':'Hand', 'glyph.star':'Star', 'glyph.jar':'Jar',
      'bandit.cut':'You cut the trip wire.',
      'bandit.tripped':'You tripped a wire! Bandits jump out of hiding!',
      'bandit.spikes':'Spikes! You are thrown back.',
      'ruins.opens':'The cracked wall crumbles. A hidden room!',
      'ruins.hint':'Scorch marks on the floor point at the wall.',
      'ruins.hintSign':'A scratched note: "The wall with the glowing crack is thin."',
      'ruins.hint.ember':'Embers still glow here. Warm air drifts from the wall.',
      'ruins.hint.soot':'A trail of soot leads up to the wall.',
      'ruins.hint.draught':'The ash stirs. A draught blows from the wall.',
      'ruins.hint.stones':'Loose stones have fallen from the wall.',
      'ruins.sealed':'The crack is cold and still. It will not give yet.'
    },
    ja:{
      'verb.ride':'トロッコに のる', 'verb.lever':'レバーを ひく', 'verb.read':'よむ', 'verb.cut':'ワイヤを きる', 'verb.look':'しらべる',
      'mine.leverTo':'レバーが ガチャンと うごいた。ポイントが {dir}に きりかわった。',
      'mine.dir.n':'きた', 'mine.dir.s':'みなみ', 'mine.dir.e':'ひがし', 'mine.dir.w':'にし',
      'gust.blown':'とっぷうに ふきとばされた！',
      'gust.blownDown':'とっぷうに ふきとばされた！したの かいに おちてしまった。',
      'shadow.caught':'かげが やみから おそいかかってきた！',
      'tomb.tablet':'せきばんだ。もようが ならんで ほられている。',
      'tomb.tabletHint':'この じゅんばんで ゆかの いたを ふもう。',
      'tomb.wrong':'ちがう いただ！すなの なかから はかの ばんにんが あらわれた！',
      'tomb.reset':'いたの ひかりが きえた。とびらの まえに もどされた。',
      'tomb.solved':'すべての もようが ひかった。おくの とびらが ひらいた！',
      'tomb.hintTitle':'じゅんばん',
      'glyph.sun':'たいよう', 'glyph.moon':'つき', 'glyph.snake':'へび', 'glyph.ankh':'アンク', 'glyph.eye':'め', 'glyph.bird':'とり',
      'glyph.scarab':'スカラベ', 'glyph.reed':'あし', 'glyph.water':'みず', 'glyph.hand':'て', 'glyph.star':'ほし', 'glyph.jar':'つぼ',
      'bandit.cut':'ワイヤを きった。',
      'bandit.tripped':'ワイヤに ひっかかった！かくれていた さんぞくが とびだしてきた！',
      'bandit.spikes':'トゲだ！うしろに はじきとばされた。',
      'ruins.opens':'ひびの はいった かべが くずれた。かくしべやだ！',
      'ruins.hint':'ゆかの こげあとが かべの ほうを さしている。',
      'ruins.hintSign':'かきつけが ある。「ひびが ひかる かべは うすい」',
      'ruins.hint.ember':'まだ ひのこが ひかっている。かべから あたたかい かぜが くる。',
      'ruins.hint.soot':'すすの あとが かべまで つづいている。',
      'ruins.hint.draught':'はいが ゆれている。かべから すきまかぜが ふいている。',
      'ruins.hint.stones':'かべから くずれた いしが ころがっている。',
      'ruins.sealed':'ひびは つめたく しずまっている。まだ びくとも しない。'
    },
    jaKanji:{
      'verb.ride':'トロッコに 乗る', 'verb.lever':'レバーを 引く', 'verb.read':'読む', 'verb.cut':'ワイヤを 切る', 'verb.look':'調べる',
      'mine.leverTo':'レバーが ガチャンと 動いた。ポイントが {dir}に 切りかわった。',
      'mine.dir.n':'北', 'mine.dir.s':'南', 'mine.dir.e':'東', 'mine.dir.w':'西',
      'gust.blown':'突風に 吹き飛ばされた！',
      'gust.blownDown':'突風に 吹き飛ばされた！下の 階に 落ちてしまった。',
      'shadow.caught':'影が 闇から 襲いかかってきた！',
      'tomb.tablet':'石板だ。模様が 並んで 彫られている。',
      'tomb.tabletHint':'この 順番で 床の 板を 踏もう。',
      'tomb.wrong':'違う 板だ！砂の 中から 墓の 番人が 現れた！',
      'tomb.reset':'板の 光が 消えた。扉の 前に 戻された。',
      'tomb.solved':'すべての 模様が 光った。奥の 扉が 開いた！',
      'tomb.hintTitle':'順番',
      'glyph.sun':'太陽', 'glyph.moon':'月', 'glyph.snake':'蛇', 'glyph.ankh':'アンク', 'glyph.eye':'目', 'glyph.bird':'鳥',
      'glyph.scarab':'スカラベ', 'glyph.reed':'葦', 'glyph.water':'水', 'glyph.hand':'手', 'glyph.star':'星', 'glyph.jar':'壺',
      'bandit.cut':'ワイヤを 切った。',
      'bandit.tripped':'ワイヤに 引っかかった！隠れていた 山賊が 飛び出してきた！',
      'bandit.spikes':'トゲだ！後ろに 弾き飛ばされた。',
      'ruins.opens':'ひびの 入った 壁が 崩れた。隠し部屋だ！',
      'ruins.hint':'床の 焦げ跡が 壁の 方を 指している。',
      'ruins.hintSign':'書き付けが ある。「ひびが 光る 壁は 薄い」',
      'ruins.hint.ember':'まだ 火の粉が 光っている。壁から 暖かい 風が 来る。',
      'ruins.hint.soot':'すすの 跡が 壁まで 続いている。',
      'ruins.hint.draught':'灰が 揺れている。壁から すきま風が 吹いている。',
      'ruins.hint.stones':'壁から 崩れた 石が 転がっている。',
      'ruins.sealed':'ひびは 冷たく 静まっている。まだ びくとも しない。'
    }
  };
  function loc(){
    var Q=window.__QOK, l='en'; try{ l=(Q&&Q.loc&&Q.loc())||'en'; }catch(e){}
    if(l!=='ja') return 'en';
    var st=null; try{ st=Q&&Q.state&&Q.state(); }catch(e){}
    return (st&&st.player&&st.player.state&&st.player.state.kanjiMode)?'jaKanji':'ja';
  }
  function S(key,vars){
    var t=STR[loc()], s=(t&&t[key]!==undefined)?t[key]:STR.en[key];
    if(s===undefined) return key;
    if(vars) for(var k in vars) s=s.split('{'+k+'}').join(vars[k]);
    return s;
  }
  // ---- persistent state: booleans in the story flags, under the floor's own prefix -------------
  function get(ctx,n){ return !!ctx.flags()[ctx.flagKey(n)]; }
  function set(ctx,n,v){ var f=ctx.flags(), k=ctx.flagKey(n); if(v) f[k]=true; else if(f[k]!==undefined) delete f[k]; }
  function getOne(ctx,prefix,choices,dflt){                 // one-of-N stored as <prefix>.<choice>=true
    for(var i=0;i<choices.length;i++) if(get(ctx,prefix+'.'+choices[i])) return choices[i];
    return dflt;
  }
  function setOne(ctx,prefix,choices,choice){
    for(var i=0;i<choices.length;i++) set(ctx,prefix+'.'+choices[i],choices[i]===choice);
  }
  // ---- geometry ---------------------------------------------------------------------------------
  function footDy(ctx){ var h=ctx.hero(); return h?(h.footY-h.y):31; }
  function soles(ctx){ var h=ctx.hero(); return h?{x:h.x,y:h.footY,tx:(h.x/TILE)|0,ty:(h.footY/TILE)|0,dir:h.dir}:null; }
  function placeSoles(ctx,sx,sy,dir){ ctx.place(sx,sy-footDy(ctx),dir); }
  function cellDist(px,py,cx,cy){                           // px from a point to the cell's rectangle (0 inside)
    var ex=Math.max(Math.abs(px-(cx*TILE+TILE/2))-TILE/2,0), ey=Math.max(Math.abs(py-(cy*TILE+TILE/2))-TILE/2,0);
    return Math.sqrt(ex*ex+ey*ey);
  }
  function inCell(px,py,cx,cy,grow){ grow=grow||0;
    return px>=cx*TILE-grow && px<(cx+1)*TILE+grow && py>=cy*TILE-grow && py<(cy+1)*TILE+grow; }
  function dirOf(dx,dy){ return Math.abs(dx)>=Math.abs(dy) ? (dx>0?2:1) : (dy>0?0:3); }   // heroDir: 0 down 1 left 2 right 3 up
  function facing(px,py,cx,cy){ var dx=cx*TILE+TILE/2-px, dy=cy*TILE+TILE/2-py;
    return Math.abs(dx)>=Math.abs(dy) ? {dx:dx>0?1:-1,dy:0} : {dx:0,dy:dy>0?1:-1}; }
  // The prompt pill for one of the module's own objects: the nearest cell within `margin` px of her soles.
  function nearest(px,py,list,margin){                     // list: [{x,y,...}] cells; returns the entry or null
    var best=null, bd=margin===undefined?14:margin, i, d;
    for(i=0;i<list.length;i++){ d=cellDist(px,py,list[i].x,list[i].y); if(d<=bd){ bd=d; best=list[i]; } }
    return best;
  }
  function pill(px,py,o,verb,act){ var f=facing(px,py,o.x,o.y); return {tx:o.x,ty:o.y,dx:f.dx,dy:f.dy,verb:verb,act:act}; }
  // ---- drawing ------------------------------------------------------------------------------------
  // A canvas texture drawn once per page (key is global to the texture manager).
  function tex(scene,key,w,h,draw){
    try{
      if(scene.textures.exists(key)) return key;
      var t=scene.textures.createCanvas(key,w,h), g=t.getContext();
      g.imageSmoothingEnabled=false; draw(g,w,h); t.refresh();
    }catch(e){}
    return key;
  }
  function img(ctx,key,x,y,depth){ var o=ctx.scene.add.image(x,y,key); if(depth!==undefined) o.setDepth(depth); return ctx.own(o); }
  // painted-style helpers: flat fills with a darker rim and a light edge, at 1 px
  function box(g,x,y,w,h,fill,rim,hi){
    g.fillStyle=rim||'#1b1612'; g.fillRect(x,y,w,h);
    g.fillStyle=fill; g.fillRect(x+1,y+1,w-2,h-2);
    if(hi){ g.fillStyle=hi; g.fillRect(x+1,y+1,w-2,1); g.fillRect(x+1,y+1,1,h-2); }
  }
  function shadow(g,cx,cy,rx,ry,a){ g.save(); g.fillStyle='rgba(0,0,0,'+(a===undefined?0.32:a)+')'; g.beginPath(); g.ellipse(cx,cy,rx,ry,0,0,Math.PI*2); g.fill(); g.restore(); }
  function speck(g,x,y,w,h,cols,n,seed){                    // deterministic grain so flat fills read as painted
    var s=seed||7; for(var i=0;i<n;i++){ s=(s*1103515245+12345)&0x7fffffff; var px=x+(s%w); s=(s*1103515245+12345)&0x7fffffff; var py=y+(s%h);
      g.fillStyle=cols[i%cols.length]; g.fillRect(px,py,1+(s>>8)%2,1); }
  }
  // A solid object one cell big is drawn over her while her soles are north of its base line and
  // under her otherwise (the engine's own rule for pillars). list: Phaser objects carrying __by.
  function ysort(list,footY,hi,lo){ hi=hi||10.2; lo=lo||9.4;
    for(var i=0;i<list.length;i++){ var o=list[i]; if(!o||o.__by===undefined) continue; var d=(footY<o.__by)?hi:lo; if(o.depth!==d) o.setDepth(d); } }
  // ---- effects ------------------------------------------------------------------------------------
  function hurt(ctx,frac){                                  // a small hit: never the last hit point
    try{
      var gs=window.__GAME_STATE__, p=gs.player, st=p.state, max=p.totalMaxHp||st.maxHp||1;
      var d=Math.max(1,Math.floor(max*frac)); st.hp=Math.max(1,st.hp-d);
      var sc=ctx.scene; if(sc.updateHUD) sc.updateHUD();
      sc.cameras.main.shake(140,0.008);
      var cam=sc.cameras.main, r=sc.add.rectangle(cam.width/2,cam.height/2,cam.width*3,cam.height*3,0xff2222).setScrollFactor(0).setDepth(200).setAlpha(0.35);
      sc.tweens.add({targets:r,alpha:0,duration:380,onComplete:function(){ r.destroy(); }});
      return d;
    }catch(e){ return 0; }
  }
  function sfx(name){ try{ var a=window.__QOK&&window.__QOK.audio; if(a&&a.playSfx) a.playSfx(name); }catch(e){} }
  function onField(ctx){ var sc=ctx.scene; try{ return sc.scene.isActive('WorldMapScene') && !sc.scene.isPaused('WorldMapScene') && !sc.scene.isActive('BattleScene'); }catch(e){ return true; } }
  var waiting=[];
  function ready(fn){ if(window.__QOK_DNG2__) { try{ fn(K,window.__QOK_DNG2__); }catch(e){ if(window.__DQ_DEBUG__) console.log('kit-a '+e); } } else waiting.push(fn); }
  function pump(){ if(!waiting.length) return; if(!window.__QOK_DNG2__){ setTimeout(pump,50); return; }
    var w=waiting; waiting=[]; for(var i=0;i<w.length;i++){ try{ w[i](K,window.__QOK_DNG2__); }catch(e){ if(window.__DQ_DEBUG__) console.log('kit-a '+e); } } }
  var K={ version:1, TILE:TILE, TICK:TICK, STR:STR, S:S, loc:loc, get:get, set:set, getOne:getOne, setOne:setOne,
    footDy:footDy, soles:soles, placeSoles:placeSoles, cellDist:cellDist, inCell:inCell, dirOf:dirOf, facing:facing,
    nearest:nearest, pill:pill, ysort:ysort, tex:tex, img:img, box:box, shadow:shadow, speck:speck, hurt:hurt, sfx:sfx, onField:onField,
    ready:function(fn){ ready(fn); if(waiting.length) setTimeout(pump,50); } };
  window.__QOK_D2KIT_A__=K;
})();
