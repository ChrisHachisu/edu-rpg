#!/usr/bin/env node
// Behavior-first comparison: run the real DQ export and real a1mFree on retained pre-fix and candidate source.
// No game boot; this proves the exact native roof pose changed from accepted to rejected.
const assert = require('assert');
const fs = require('fs');
const path = require('path');
const vm = require('vm');
const root = path.join(__dirname, '..');
const beforePath = process.argv[2] || '/private/tmp/edu-rpg-build84-feedback-20261013/native-cave-contact-20261016/dq-tiles-before-crystal-contact.js';
const afterPath = process.argv[3] || path.join(root, 'public/dq-tiles.js');
const marker = 'window.__DQ_TILES__=';

function boot(sourcePath) {
  const source = fs.readFileSync(sourcePath, 'utf8');
  const a1mFreeSource = functionSource(source,'a1mFree');
  const hooks = `window.__DQ_TEST__={free:a1mWwContactFree,footDy:a1mFootDy,door:a1mDoor,cellCenter:owCellCenter,scale:OW_SCALE,a1mFreeSource:${JSON.stringify(a1mFreeSource)}};\n`;
  assert(source.includes(marker), `DQ export marker missing in ${sourcePath}`);
  const win = { __DQ_DEBUG__: false, addEventListener() {} };
  let activeImage=null;
  const doc = { createElement() { return { getContext() { return {
    drawImage(image) { activeImage=image; }, getImageData() { return {data:activeImage&&activeImage.alpha||new Uint8ClampedArray(64*64*4)}; },
  }; } }; }, querySelector() { return null; } };
  function XHRStub(){this.timeout=0;} XHRStub.prototype.open=function(){}; XHRStub.prototype.send=function(){};
  const sandbox = {window:win,document:doc,Image:function(){},XMLHttpRequest:XHRStub,console,
    setInterval:()=>0,clearInterval(){},requestAnimationFrame:()=>0,atob,setTimeout,Math,Date,Object,Array,
    Uint8Array,Float32Array,JSON};
  sandbox.globalThis=sandbox;
  vm.createContext(sandbox);
  vm.runInContext(source.replace(marker,hooks+marker),sandbox);
  return win.__DQ_TEST__;
}
function makeScene(alphaRow){
  const alpha=new Uint8ClampedArray(64*64*4);
  for(let x=0;x<64;x++)alpha[(alphaRow*64+x)*4+3]=255;
  const image={width:768,height:512,alpha};
  return {currentMapId:'overworld',hero:{scaleY:1.0125,texture:{key:'contact-'+alphaRow,
    get:()=>({cutWidth:64,cutHeight:64,cutX:0,cutY:0,width:64,height:64,source:{image}}),
    getSourceImage:()=>image}}};
}
function contact(T,scene,physicalX,physicalY){
  const map={ow:true}, x=physicalX/T.scale, y=physicalY/T.scale, foot=T.footDy(scene,map);
  const field={ow:true,ox:x-10,oy:y+foot-10,W:20,H:20,dist:new Uint16Array(400).fill(255),prop:{}};
  const free=new Function('A1A_FOREST','A1M_PROP','OWM_FIELD_OWNED','TILE','a1fRequiredAt','a1fReady',
    'a1fHeroFree','a1mWwContactFree','a1mFootDy','a1mNeed','a1mTileAt','a1dIsMouthCell','a1mCanMove',
    'a1dIsEntranceCrystalCell',`${T.a1mFreeSource}\nreturn a1mFree;`);
  return free({}, {}, {0:1}, 48, ()=>false, ()=>false, ()=>false,T.free,T.footDy,()=>0,()=>0,()=>false,()=>null,()=>false)
    (scene,field,x,y);
}
function functionSource(source,name){
  const start=source.indexOf(`\n  function ${name}(`); assert(start>=0,`production ${name} missing`);
  const open=source.indexOf('{',start); let depth=0;
  for(let i=open;i<source.length;i++){if(source[i]==='{')depth++;else if(source[i]==='}'&&--depth===0)return source.slice(start+1,i+1);}
  throw new Error(`unbalanced ${name}`);
}

const before=boot(beforePath), after=boot(afterPath);
function checkVariant(row){
  const scene=makeScene(row), map={ow:true}, left=after.cellCenter(149)-76, top=after.cellCenter(278)-92;
  const soleOffset=after.footDy(scene,map)*after.scale;
  const pose=(T,x,y)=>contact(T,scene,left+x,top+y-soleOffset);
  const oldRoof=pose(before,39,30), newRoof=pose(after,39,30);
  assert.strictEqual(oldRoof,true,`pre-fix production predicate allows native roof pose for sole row ${row}`);
  assert.strictEqual(newRoof,false,`candidate production predicate rejects native roof pose for sole row ${row}`);
  assert.strictEqual(pose(after,76,92),true,`candidate entry channel remains clear for sole row ${row}`);
  assert.strictEqual(pose(after,76,125),true,`candidate exit approach remains clear for sole row ${row}`);
  assert.strictEqual(pose(after,139,69),true,`candidate exterior grass remains clear for sole row ${row}`);
  return {soleRow:row,preFixRoof:'allowed',candidateRoof:'blocked',entryExitExterior:'clear'};
}
const results=[checkVariant(62),checkVariant(60)];
console.log(JSON.stringify({status:'PASS',nativeRoofBehaviorChanged:true,results},null,2));
