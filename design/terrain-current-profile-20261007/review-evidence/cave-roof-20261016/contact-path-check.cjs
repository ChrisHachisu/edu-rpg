const assert=require('assert'),fs=require('fs'),vm=require('vm');
const file='/Users/chris/.codex/workspaces/edu-rpg-forward-20261007/public/dq-tiles.js',source=fs.readFileSync(file,'utf8'),marker='window.__DQ_TILES__=';
const hooks='window.__DQ_TEST__={free:a1mWwContactFree,footDy:a1mFootDy};\n  ';
const alpha=new Uint8ClampedArray(64*64*4);for(let x=0;x<64;x++)alpha[(62*64+x)*4+3]=255;
function XHR(){this.open=()=>{};this.send=()=>{};this.timeout=0}
const sandbox={window:{__DQ_DEBUG__:false,addEventListener(){}},document:{createElement(){return{getContext(){return{drawImage(){},getImageData(){return{data:alpha}}}}}},querySelector(){return null}},Image:function(){},XMLHttpRequest:XHR,console,setInterval:()=>0,clearInterval(){},requestAnimationFrame:()=>0,setTimeout,Math,Date,Object,Array,Uint8Array,Float32Array,JSON,atob};sandbox.globalThis=sandbox;vm.createContext(sandbox);vm.runInContext(source.replace(marker,hooks+marker),sandbox);const T=sandbox.window.__DQ_TEST__;
function sourceFn(name){const start=source.indexOf(`\n  function ${name}(`),open=source.indexOf('{',start);let d=0;for(let i=open;i<source.length;i++){if(source[i]==='{')d++;else if(source[i]==='}'&&--d===0)return source.slice(start+1,i+1)}throw Error(name)}
const gate=new Function('A1A_FOREST','A1M_PROP','OWM_FIELD_OWNED','TILE','a1fRequiredAt','a1fReady','a1fHeroFree','a1mWwContactFree','a1mFootDy','a1mNeed','a1mTileAt','a1dIsMouthCell','a1mCanMove','a1dIsEntranceCrystalCell',`${sourceFn('a1mFree')}\nreturn a1mFree;`)({}, {}, {0:1},48,()=>false,()=>false,()=>false,T.free,T.footDy,()=>0,()=>0,()=>null,()=>false);
const scene={currentMapId:'overworld',hero:{scaleY:1.0125,texture:{key:'review-g3',get:()=>({cutWidth:64,cutHeight:64,cutX:0,cutY:0,width:64,height:64,source:{image:{width:768,height:64}}}),getSourceImage:()=>({width:768,height:64})}}},base={ow:true};
function free(px,py){const x=px/.7,y=py/.7,fd=T.footDy(scene,base),m={ow:true,ox:x-10,oy:y+fd-10,W:20,H:20,dist:new Uint16Array(400).fill(255),prop:{}};return gate(scene,m,x,y)}
const tile=(x,y)=>[x*33.6,y*33.6],origin=[3334.4,7688.4],foot=30.881;
const local=(x,y)=>free(origin[0]+x,origin[1]+y-foot);
assert.equal(free(3416.5118,7696.2790),false,'P1 roof is blocked');
assert.equal(local(35,65),false,'west rock blocked');assert.equal(local(132,65),false,'east rock blocked');assert.equal(local(134,65),true,'exterior east grass free');
assert.equal(free(...tile(104.5,232.5)),true,'neighbor grass free');assert.equal(free(...tile(101.5,232.5)),true,'south approach free');assert.equal(free(...tile(101.5,231.5)),true,'door sole contact channel free');assert.equal(free(...tile(101.5,229.5)),false,'roof remains blocked');
const from=tile(101.5,232.5),to=tile(101.5,231.5);for(let i=0;i<=100;i++){const q=i/100;assert.equal(free(from[0]+(to[0]-from[0])*q,from[1]+(to[1]-from[1])*q),true,`production a1mFree south approach sample ${i}`)}
console.log(JSON.stringify({productionGate:'a1mFree',southSamples:101,southApproach:'clear through existing door cell',p1Roof:'blocked',bothSides:'blocked',exteriorGrass:'free',neighborGrass:'free',channel:'free'}));
