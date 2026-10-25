#!/usr/bin/env node
// ACT1 visible-terrain union regression. Historical R9 forest inputs stay immutable; active
// movement uses the exact forest-filled QOK OR final visible mountain alpha pack.
const assert=require('node:assert/strict');
const {createHash}=require('node:crypto');
const {readFileSync}=require('node:fs');
const {resolve}=require('node:path');
const ROOT=resolve(__dirname,'..');
const R9=resolve(ROOT,'design/review/overworld-art-blueprint/act-by-act/act1/runtime-v9/act1-painted-overworld-r9/runtime');
const SOURCE=resolve(R9,'../source/terrain-r9');
const PACK=resolve(ROOT,'public/act1-hifi/forest-collision.bin');
const manifest=JSON.parse(readFileSync(resolve(ROOT,'public/act1-hifi/manifest.json'),'utf8'));
const ART=resolve(process.env.HOME,'.codex/artifacts/edu-rpg-r9-implementation-20261001/world-integration-20261003');
const REPAIR=resolve(process.env.HOME,'.codex/artifacts/edu-rpg-r9-implementation-20261001/world-integration-20261004/repair');
const FINAL=resolve(REPAIR,'final-stage');
// Exercise the production V8 manifest parser itself against the promoted manifest, rather than
// only duplicating its contract in this test. Missing or misspelled fields must fail closed.
const dq=readFileSync(resolve(ROOT,'public/dq-tiles.js'),'utf8');
const safeStart=dq.indexOf('  function a1aSafeAssetPath(path){');
const specStart=dq.indexOf('  function a1aForestManifestSpec(m){',safeStart);
const specEnd=dq.indexOf('  var A1A_FOREST_TRIES',specStart);
assert.ok(safeStart>=0&&specStart>safeStart&&specEnd>specStart,'production forest manifest parser missing');
const productionForestSpec=Function(dq.slice(safeStart,specStart)+dq.slice(specStart,specEnd)+';return a1aForestManifestSpec;')();
const parsedForestSpec=productionForestSpec(manifest);
assert.ok(parsedForestSpec,'promoted manifest rejected by production forest parser');
assert.equal(parsedForestSpec.collision.format,'qok-forest-bitset-v1');
const invalidManifestCases=[
  ['forestMode',m=>m.forestMode='legacy'],
  ['semanticBounds',m=>m.semanticBounds=[0,0,1,1]],
  ['chunks',m=>m.chunks.pop()],
  ['collision dimensions',m=>m.collision.dimensionsPx32=[1,1]],
  ['collision artifact',m=>m.collision.artifact='unsafe/../pack.bin'],
  ['collision format',m=>m.collision.format='qok-forest-bitset-v1; extra text'],
  ['collision version',m=>m.collision.version=2],
  ['collision bounds',m=>m.collision.bounds=[0,0,1,1]],
  ['collision pixelsPerCell',m=>m.collision.pixelsPerCell=16],
  ['collision alphaThreshold',m=>m.collision.alphaThreshold=17],
  ['collision sha256',m=>m.collision.sha256='bad'],
  ['collision sourceSha256',m=>m.collision.sourceSha256='bad'],
  ['forestUnderpaint src',m=>m.forestUnderpaint.src='../forest.png'],
  ['forestUnderpaint width',m=>m.forestUnderpaint.width=1],
  ['forestUnderpaint height',m=>m.forestUnderpaint.height=1],
  ['forestUnderpaint pixelsPerCell',m=>m.forestUnderpaint.pixelsPerCell=3],
  ['forestUnderpaint bounds',m=>m.forestUnderpaint.bounds=[0,0,1,1]],
  ['chunk forest path',m=>m.chunks[0].forest='../tree.png'],
  ['chunk forestSha256',m=>m.chunks[0].forestSha256='bad'],
];
for(const [label,mutate] of invalidManifestCases){const bad=JSON.parse(JSON.stringify(manifest));mutate(bad);assert.equal(productionForestSpec(bad),false,`production parser accepted invalid ${label}`)}
const raw=readFileSync(resolve(SOURCE,'collision/forest-alpha-visible.bin'));
const historicalForestPack=readFileSync(resolve(R9,'forest-collision.bin'));
const finalPlacements=readFileSync(resolve(SOURCE,'manifest/final-placement-authority-r9.json'));
const finalPlacementAuthority=JSON.parse(finalPlacements.toString('utf8'));
const bin=readFileSync(PACK); const sha=b=>createHash('sha256').update(b).digest('hex');
assert.equal(finalPlacementAuthority.originalPlacementCount,614);assert.equal(finalPlacementAuthority.placementCount,611);
assert.equal(sha(finalPlacements),manifest.source.forestFinalPlacementManifestSha256);
assert.equal(manifest.source.forestFinalPlacementManifestSha256,sha(finalPlacements));
assert.equal(sha(readFileSync(resolve(SOURCE,'manifest/placement-delta-r9.json'))),manifest.source.forestPlacementDeltaSha256);
assert.equal(sha(raw),manifest.source.forestVisibleAlphaSourceSha256);
assert.equal(bin.subarray(0,8).toString(),'QOKF8COL');
assert.equal(bin.readUInt16LE(8),1);assert.equal(bin.readUInt16LE(10),64);
assert.equal(bin.readUInt32LE(12),4736);assert.equal(bin.readUInt32LE(16),5824);assert.equal(bin.readUInt32LE(20),32);
assert.equal(bin.subarray(24,56).toString('hex'),manifest.collision.sourceSha256);
assert.equal(sha(bin),manifest.collision.sha256);
assert.equal(sha(bin),'2b541cecb97712a6f18c6ae19bfabf519255999f2165d7d8ec4edea6cb9e4644');
assert.equal(raw.length,bin.length-64,'raw source and packed payload geometry differ');
const forestFilled=readFileSync(resolve(ART,'forest/stage/collision/forest-collision.bin'));
const mountainVisible=readFileSync(resolve(FINAL,'assets/collision/mountain-alpha-visible.bin'));
assert.equal(sha(forestFilled),'59b021239c220a094bb0bd87c5af6d76b78c693e3fe197b394fd8471b30ae34d');
assert.equal(sha(mountainVisible),'1c9535793cd74a7c78514e9528647a491658ac019abf26d0d14c4273b04f4fa4');
assert.deepEqual(manifest.collision.sourceInputs,[
 {label:'forest-filled-collision',sha256:sha(forestFilled),threshold:16,bitOrder:'little-within-byte'},
 {label:'mountain-visible-alpha',sha256:sha(mountainVisible),threshold:128,bitOrder:'little-within-byte'},
]);
const payload=bin.subarray(64), forestPayload=forestFilled.subarray(64);
assert.equal(forestPayload.length,payload.length);
for(let i=0;i<payload.length;i++)assert.equal(payload[i],forestPayload[i]|mountainVisible[i],`composite OR mismatch at byte ${i}`);
const bit=(buf,i)=>((buf[i>>3]>>(i&7))&1)!==0, W=4736,H=5824, packed=payload;
// The archived R9 forest-only pack still proves its own alpha-hole-fill lineage; active terrain
// collision is checked by exact source-wise OR above, with no stale route-keepout authority.
assert.equal(historicalForestPack.subarray(0,8).toString(),'QOKF8COL');
assert.equal(sha(historicalForestPack),'def3a8acc8a80aaf55816ed464b1f2b49b90cfd0865f0e5cdbe95db14383ad54');
const historicalPayload=historicalForestPack.subarray(64);
let added=0, exterior=-1, cavity=-1;
for(let y=1;y<H-1;y+=1)for(let x=1;x<W-1;x+=1){ const i=y*W+x;if(bit(raw,i)&&!bit(historicalPayload,i))throw Error('historical forest visible alpha removed');
 if(!bit(raw,i)&&bit(historicalPayload,i)){added++;if(cavity<0)cavity=i;}
 if(!bit(raw,i)&&!bit(historicalPayload,i)&&exterior<0)exterior=i;
}
assert.ok(added>0,'historical R9 pack did not fill any enclosed alpha cavity');assert.ok(cavity>=0&&exterior>=0);
// A 1px sweep catches the first occupied pixel; diagonal samples exercise a corner path.
function sweep(x0,y0,x1,y1){let n=Math.max(Math.abs(x1-x0),Math.abs(y1-y0));for(let k=0;k<=n;k++){let x=Math.round(x0+(x1-x0)*k/n),y=Math.round(y0+(y1-y0)*k/n);if(bit(packed,y*W+x))return k;}return -1;}
let cx=cavity%W,cy=(cavity/W)|0;assert.equal(bit(historicalPayload,cavity),true);assert.equal(sweep(cx-8,cy,cx+8,cy)>=0,true);assert.equal(sweep(cx-8,cy-8,cx+8,cy+8)>=0,true);

// Execute the production stencil function extracted verbatim from dq-tiles.js against two actual
// frame descriptors. This catches regressions that turn transparent frame padding into square walls.
const start=dq.indexOf('  function a1fBuildStencil(hero){');
const end=dq.indexOf('  function a1fReady(scene){',start);
assert.ok(start>=0&&end>start,'production pose-stencil function missing');
const source={width:8,height:4,pixels:new Uint8ClampedArray(8*4*4)};
// Frame A has one opaque left pixel; frame B one opaque right pixel. All corners are transparent.
source.pixels[(1*8+1)*4+3]=255; source.pixels[(2*8+6)*4+3]=255;
function canvas(){let w=1,h=1,data=new Uint8ClampedArray(4);return {set width(v){w=v;data=new Uint8ClampedArray(w*h*4)},get width(){return w},set height(v){h=v;data=new Uint8ClampedArray(w*h*4)},get height(){return h},getContext(){return {clearRect(){data.fill(0)},drawImage(src,sx,sy,sw,sh){for(let y=0;y<sh;y++)for(let x=0;x<sw;x++){let si=((sy+y)*src.width+sx+x)*4,di=(y*w+x)*4;data.set(src.pixels.subarray(si,si+4),di)}},getImageData(){return {data}}}}}}
const A={stencil:null,stencilKey:null};const build=Function('document','A1A_FOREST','OW_SCALE',dq.slice(start,end)+';return a1fBuildStencil;')({createElement:canvas},A,0.7);
const frames={a:{cutX:0,cutY:0,cutWidth:4,cutHeight:4},b:{cutX:4,cutY:0,cutWidth:4,cutHeight:4}};
const hero={texture:{key:'live-g3',getSourceImage:()=>source,getFrameNames:()=>['a','b'],get:n=>frames[n]},scaleX:4,scaleY:4,originX:.5,originY:.5};
const stencil=build(hero);assert.equal(stencil.length,2,'transparent corners entered production stencil');
assert.deepEqual(stencil.sort((a,b)=>a[0]-b[0]),[[-2,-2],[2,2]],'production frame/display alignment changed');

console.log(JSON.stringify({kind:'actual-r9-forest-pack-regression',rawSourceSha256:sha(raw),packSha256:sha(bin),filledCavityPixels:added,continuousSweep:true,poseUnionFrames:2,transparentCornersExcluded:true,threshold:16,noTreeDilation:true}));

// Execute a1fHeroFree itself with both runtime-selectable hero sheets, centered Phaser origins,
// and the physical->canonical 0.7 transform. This is production code, not a second collision implementation.
const {spawnSync}=require('node:child_process');
const bitStart=dq.indexOf('  function a1fBit(px,py){');
const buildEnd=dq.indexOf('  function a1fReady(scene){',bitStart);
const freeStart=dq.indexOf('  function a1fHeroFree(scene,x,y){');
const freeEnd=dq.indexOf('  // (x,y) is the SPRITE position everywhere',freeStart);
assert.ok(bitStart>=0&&buildEnd>bitStart&&freeStart>buildEnd&&freeEnd>freeStart,'production forest functions missing');
const realForest={bits:new Uint8Array(Math.ceil(4736*5824/8)),stencil:null,stencilKey:null};
const realFns=Function('document','A1A_FOREST','OW_SCALE','TILE',dq.slice(bitStart,buildEnd)+dq.slice(freeStart,freeEnd)+';return {build:a1fBuildStencil,free:a1fHeroFree};')({createElement:canvas},realForest,.7,48);
const realFrames={};for(let i=0;i<12;i++)realFrames[String(i)]={cutX:i*64,cutY:0,cutWidth:64,cutHeight:64};
const heroVariants={};
for(const [variant,expectedPixels] of [['g3',2051],['male',1941]]){
 const heroPng=resolve(ROOT,`public/assets/hero/hero-${variant}-walk.png`);
 const py=spawnSync('python3',['-c',"from PIL import Image;import sys,base64;im=Image.open(sys.argv[1]).convert('RGBA');print(str(im.width)+','+str(im.height)+','+base64.b64encode(im.tobytes()).decode())",heroPng],{encoding:'utf8'});
 assert.equal(py.status,0,py.stderr);const [pw,ph,p64]=py.stdout.trim().split(',');
 const sourceImage={width:+pw,height:+ph,pixels:new Uint8ClampedArray(Buffer.from(p64,'base64'))};
 const hero={texture:{key:`hero-${variant}-walk`,getSourceImage:()=>sourceImage,getFrameNames:()=>Object.keys(realFrames),get:n=>realFrames[n]},scaleX:1.0125,scaleY:1.0125,originX:.5,originY:.5};
 const stencil=realFns.build(hero);assert.equal(stencil.length,expectedPixels,`actual 64.8px ${variant} pose-union stencil changed`);
 heroVariants[variant]={hero,stencil};
}
const realScene={hero:heroVariants.g3.hero},hx=16*48+480,hy=218*48+480;
const hcx=Math.round((hx-16*48)*32/48),hcy=Math.round((hy-218*48)*32/48);
const setBit=(x,y)=>{let i=y*4736+x;realForest.bits[i>>3]|=1<<(i&7)};
realForest.bits.set(packed);
for(const [variant,{hero,stencil}] of Object.entries(heroVariants)){
 realScene.hero=hero;
 assert.equal(realFns.free(realScene,hx,hy),true,`${variant}: clear grass rejected by actual production hero stencil`);
 const hit=stencil[0];setBit(hcx+hit[0],hcy+hit[1]);
 assert.equal(realFns.free(realScene,hx,hy),false,`${variant}: production hero stencil missed occupied forest alpha`);
 realForest.bits.fill(0);setBit(hcx-30,hcy-30);
 assert.equal(realFns.free(realScene,hx,hy),true,`${variant}: transparent hero-sheet padding became a forest blocker`);
 realForest.bits.set(packed);
}

// Run the production authority-error, Retry, and watchdog functions. A collision-pack failure
// while base and forest underpaint are otherwise ready must stay visible and Retry must re-arm all
// forest dependencies rather than only the base underpaint.
function fnRange(a,b){let i=dq.indexOf(a),j=dq.indexOf(b,i);assert.ok(i>=0&&j>i,`missing ${a}`);return dq.slice(i,j)}
const retrySrc=fnRange('  function a1aForestRetry(){','  var A1A_UNDERPAINT_TRIES')+fnRange('  // V8 movement is authoritative only','  function a1aUnderpaintPlace')+fnRange('  function a1aUnderpaintRetry(){','  function a1aFetch(){');
const retryA={dirty:false,underpaint:{spec:{src:'base'},status:'ready',scene:null,sprite:null,image:{},request:null,requestTimer:null,forest:{spec:{src:'forest'},status:'ready',image:{},request:null,timer:0,sprite:null,fail:0,next:0}}};
const retryF={mode:true,spec:{artifact:'forest-collision.bin'},status:'error',bits:null,request:null,timer:0,fail:6,next:1,error:'collision-http',stencil:[[1,1]],stencilKey:'old'};
let retriedRequests=0,veilReset=0;
// The isolated Retry harness stubs only the new canvas-texture lifetime helper; its behavior is
// exercised against the production helper in test_act1_forest_fallback.cjs.
const retryFns=Function('A1A','A1A_FOREST','clearTimeout','a1aVeilError','a1aUnderpaintRequest','a1aForestRequest','a1aForestMaskDispose',retrySrc+';return {error:a1aForestAuthorityError,retry:a1aUnderpaintRetry};')(retryA,retryF,()=>{},()=>{veilReset++},()=>{retriedRequests++},()=>{retriedRequests++},()=>{});
assert.equal(retryFns.error(),true,'production authority error missed exhausted collision pack');
assert.equal(retryFns.retry(),true,'Retry refused when base underpaint was ready but forest pack failed');
assert.equal(retryF.status,'waiting');assert.equal(retryF.fail,0);assert.equal(retryF.bits,null);assert.equal(retryF.stencil,null);assert.equal(retryA.underpaint.forest.status,'waiting');assert.equal(retriedRequests,2);assert.ok(veilReset>0&&retryA.dirty,'Retry did not visibly/reliably re-arm forest authority');
const watchdogSrc=fnRange('  function a1aSpriteWatchdog(scene){','  // `deep` is the escalation described above');
let watchdogVeil=null,watchdogError=null;
const watchdog=Function('A1A','A1AW','a1aPlateOwns','a1aVeilError','a1aVeilSet','a1aSpriteMode','a1aUnderpaintRequired','a1fMode','a1fReady','a1aForestAuthorityError','a1fRequiredAt','owCanonical','a1aPlateVisibleInView','a1aUnderpaintRequiredForView',watchdogSrc+';return a1aSpriteWatchdog;')({}, {shortSince:9,blankSince:9},()=>true,on=>{watchdogError=on},on=>{watchdogVeil=on},()=>true,()=>false,()=>true,()=>false,()=>true,()=>true,x=>x,()=>true,()=>false);
watchdog({});assert.equal(watchdogVeil,true,'production watchdog cleared veil while forest authority was pending');assert.equal(watchdogError,true,'production watchdog omitted Retry-visible forest error');
let offscreenVeil=null;
const offscreenWatchdog=Function('A1A','A1AW','a1aPlateOwns','a1aVeilError','a1aVeilSet','a1aSpriteMode','a1aUnderpaintRequired','a1fMode','a1fReady','a1aForestAuthorityError','a1fRequiredAt','owCanonical','a1aPlateVisibleInView','a1aUnderpaintRequiredForView',watchdogSrc+';return a1aSpriteWatchdog;')({}, {shortSince:9,blankSince:9},()=>true,()=>{},on=>{offscreenVeil=on},()=>false,()=>true,()=>true,()=>false,()=>true,()=>false,x=>x,()=>false,()=>false);
offscreenWatchdog({});assert.equal(offscreenVeil,false,'Act 1 loader error raised a veil in a distant shared-map region');

// Test the active manifest's live start/recovery/landmark authority with both actual selectable
// production pose-union stencils and the combined pack. Old COMPASS corridors are not acceptance.
const routeManifest=JSON.parse(readFileSync(resolve(ROOT,'public/act1-hifi/manifest.json'),'utf8'));
function freeAtAtlas(px,py){return realFns.free(realScene,16*48+px*48/32,218*48+py*48/32)}
function collisionAtCell(p){return freeAtAtlas(Math.round(((p.x-16)+.5)*32),Math.round(((p.y-218)+.5)*32))}
let routeSamples=0; const blockedRecovery={g3:[],male:[]};
for(const [variant,{hero}] of Object.entries(heroVariants)){
 realScene.hero=hero;
 const required=[...routeManifest.safeCells,routeManifest.startCell,routeManifest.legacyFallback,
  ...routeManifest.liveLandmarkExits,...routeManifest.liveValidApproaches];
 for(const p of required){if(!collisionAtCell(p))blockedRecovery[variant].push({x:p.x,y:p.y,id:p.id||p.landmarkId||null});routeSamples++;}
}
assert.equal(routeManifest.safeCells.length,149);
for(const excluded of [{x:149,y:277},{x:133,y:348},{x:145,y:372}]) assert.ok(!routeManifest.safeCells.some(c=>c.x===excluded.x&&c.y===excluded.y),`unsafe saved recovery cell retained: ${excluded.x},${excluded.y}`);
assert.deepEqual(routeManifest.startCell,{x:69,y:256});
assert.deepEqual(routeManifest.legacyFallback,{x:130,y:290});
assert.equal(routeManifest.liveLandmarkExits.length,8);
assert.equal(routeManifest.liveValidApproaches.length,11);
if(Object.values(blockedRecovery).some(x=>x.length)){
 console.log(JSON.stringify({blockedRecovery}));
 assert.fail('active live/recovery point has blocked full-hero clearance');
}
const liveProof=JSON.parse(readFileSync(resolve(FINAL,'evidence/live-act1-witness-journeys.json'),'utf8'));
const derivedSafe=JSON.parse(readFileSync(resolve(FINAL,'evidence/derived-safe-cells-149.json'),'utf8'));
assert.equal(liveProof.result,'PASS_WITH_PRODUCTION_RESCUES');
assert.equal(liveProof.openCellCount,9326);assert.equal(liveProof.reachableOpenCellCount,9326);
assert.equal(liveProof.witnessTargetCount,152);assert.equal(liveProof.portUnstickPass,true);assert.equal(liveProof.recoveryRescuePass,true);
assert.equal(liveProof.forestCollisionSha256,sha(bin));
assert.equal(liveProof.proposedMountainAlphaSha256,sha(mountainVisible));
assert.equal(derivedSafe.candidateManifestSha256,sha(readFileSync(resolve(ROOT,'public/act1-hifi/manifest.json'))));
assert.equal(derivedSafe.candidateCombinedQOKSha256,sha(bin));assert.equal(derivedSafe.candidateA1OWSha256,sha(readFileSync(resolve(ROOT,'public/act1-overworld-walk.bin'))));
assert.equal(derivedSafe.currentSafeCellCount,149);assert.equal(derivedSafe.fullAuditSha256,sha(readFileSync(resolve(FINAL,'evidence/live-act1-witness-journeys.json'))));
assert.deepEqual(derivedSafe.removedFromSafeOnly,[{x:133,y:348},{x:145,y:372},{x:149,y:277}]);
assert.equal(derivedSafe.claim,'Derived subset of the immutable 152-cell full journey audit; not a rerun of the full witness search.');
console.log(JSON.stringify({productionHeroFree:true,actualHeroSheetFrames:12,heroDisplayPx:64.8,heroScale:1.0125,productionStencilPixels:Object.fromEntries(Object.entries(heroVariants).map(([k,v])=>[k,v.stencil.length])),selectableHeroVariants:Object.keys(heroVariants),combinedPackSha256:sha(bin),exactOr:true,safeCells:routeManifest.safeCells.length,liveExits:routeManifest.liveLandmarkExits.length,liveApproaches:routeManifest.liveValidApproaches.length,legacyFallbackValid:true,conservativeReachableCells:liveProof.reachableOpenCellCount,conservativeWitnessTargets:liveProof.witnessTargetCount,routeSamples,forestErrorVeil:true,forestRetryRearmsAll:true}));
