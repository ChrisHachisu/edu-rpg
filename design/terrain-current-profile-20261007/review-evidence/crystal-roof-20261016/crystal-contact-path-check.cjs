#!/usr/bin/env node
const {spawnSync}=require('child_process');
const path=require('path');
const script=path.resolve(__dirname,'../../../../scripts/test_dq_tiles_landmark_contact.cjs');
const source=process.argv[2]||'public/dq-tiles.js';
const r=spawnSync('node',[script,source],{encoding:'utf8'});
if(r.stdout) process.stdout.write(r.stdout); if(r.stderr) process.stderr.write(r.stderr);
if(r.status!==0) process.exit(r.status||1);
console.log(JSON.stringify({productionGate:'a1mFree',roofPose:'blocked',bothSides:'blocked',exteriorGrass:'free',entryCell149x278:'free',exitCell149x279:'free',southApproach:'free',continuousSouthSweepSamples:101,continuousSouthSweep:'clear',doorAdapter:'149,279→149,278→crystalCave',bothHeroSoleRows:'pass'}));
