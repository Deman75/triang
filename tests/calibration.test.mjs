import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import * as geometry from '../src/geometry.js';
import {readCalibration,saveCalibration,calibrationMatches} from '../src/calibration-profile.js';

const world=geometry.buildTriangle(20,Math.hypot(20,50),50),center={x:960,y:540};

test('recovers focal and arbitrary roll from known positions',()=>{
  for(const position of [{x:100,y:-200,z:50},{x:-10,y:200,z:100},{x:0,y:0,z:50}])
    for(const focal of [600,2140,3040]) for(const roll of [-140,0,73,180]) {
      const pixels=geometry.projectCentered(world,position,focal,center,roll);
      const result=geometry.calibrateFocal({world,pixels,position,center});
      assert.ok(Math.abs(result.focal-focal)<1e-7);
      assert.ok(result.rms<1e-7);
    }
});

test('known pose calibration reports noise, off-center P1 and inconsistent points',()=>{
  const position={x:100,y:-200,z:50};
  const pixels=geometry.projectCentered(world,position,2140,center,35);
  pixels[1].x+=0.4;pixels[2].y-=0.3;
  const result=geometry.calibrateFocal({world,pixels,position,center});
  assert.ok(Math.abs(result.focal-2140)<10);assert.ok(result.rms<1);
  pixels[0].x+=20;
  assert.ok(geometry.calibrateFocal({world,pixels,position,center}).p1Offset>19);
  [pixels[1],pixels[2]]=[pixels[2],pixels[1]];
  assert.ok(geometry.calibrateFocal({world,pixels,position,center}).rms>3);
  assert.throws(()=>geometry.calibrateFocal({world,pixels,position:{...position,z:0},center}));
});

test('recovers focal for a camera aimed away from P1, with yaw, pitch and roll',()=>{
  const dot=(a,b)=>a.reduce((s,v,i)=>s+v*b[i],0);
  const unit=a=>{const length=Math.hypot(...a);return a.map(v=>v/length);};
  const cross=(a,b)=>[a[1]*b[2]-a[2]*b[1],a[2]*b[0]-a[0]*b[2],a[0]*b[1]-a[1]*b[0]];
  const position={x:-35,y:-200,z:50},C=[35,-200,50],focal=2296;
  for(const target of [[-60,15,0],[60,40,20],[10,-20,-10]]) for(const roll of [-0.05,1.2,2.8]) {
    // Independent physical-frame projection, with no reliance on projectCentered.
    const forward=unit(target.map((v,i)=>v-C[i]));
    const right=unit(cross(forward,[0,0,1])),up=unit(cross(right,forward));
    const pixels=world.map(P=>{
      const delta=[-P[0]-C[0],P[1]-C[1],P[2]-C[2]],depth=dot(delta,forward);
      const x=focal*dot(delta,right)/depth,y=-focal*dot(delta,up)/depth;
      return {x:center.x+x*Math.cos(roll)-y*Math.sin(roll),y:center.y+x*Math.sin(roll)+y*Math.cos(roll)};
    });
    const result=geometry.calibrateFocal({world,pixels,position,center});
    assert.ok(result.p1Offset>100);
    assert.ok(Math.abs(result.focal-focal)<1e-5,JSON.stringify(result));
    assert.ok(result.rms<1e-6);
    assert.ok(!result.ambiguous);
    pixels[1].x+=0.2;pixels[2].y-=0.2;
    const noisy=geometry.calibrateFocal({world,pixels,position,center});
    assert.ok(Math.abs(noisy.focal-focal)<20);
    assert.ok(noisy.rms<1);
  }
});

test('calibration storage preserves precision and rejects incompatible resolution',()=>{
  const previous=globalThis.localStorage;
  let stored=null;
  globalThis.localStorage={getItem:()=>stored,setItem:(_,v)=>{stored=v;}};
  try {
    saveCalibration({focal:2140.123456,width:1920,height:1080,sides:[20,53.85,50]});
    const profile=readCalibration();assert.equal(profile.focal,2140.123456);
    assert.ok(calibrationMatches(profile,{width:1920,height:1080}));
    assert.ok(!calibrationMatches(profile,{width:1280,height:720}));
    stored='{}';assert.equal(readCalibration(),null);
    stored='{broken';assert.equal(readCalibration(),null);
  } finally {globalThis.localStorage=previous;}
});

test('millimeter conversion, distance solver and calibration agree for the same resized render',()=>{
  const width=1257,height=707,center={x:width/2,y:height/2},focal=50/23.4*width;
  const position={x:0,y:-200,z:50};
  const pixels=geometry.projectCentered(world,position,focal,center,-3);
  const calibration=geometry.calibrateFocal({world,pixels,position,center});
  assert.ok(Math.abs(calibration.focal-2685.897435897436)<1e-5);
  const distance=geometry.solvePosition({world,pixels,focal,center,height:50,heightTolerance:2});
  assert.ok(distance.accepted.some(c=>Math.hypot(c.position.x-position.x,c.position.y-position.y,c.position.z-position.z)<0.01));
});

test('calibration page calculates and saves its test frame',()=>{
  const html=fs.readFileSync(new URL('../src/calibration.html',import.meta.url),'utf8');
  const ctx=new Proxy({},{get:()=>()=>{}});
  const element=()=>({value:'',style:{setProperty(){}},textContent:'',handlers:{},
    addEventListener(type,fn){this.handlers[type]=fn;},getContext:()=>ctx});
  const elements=new Map([...html.matchAll(/id="([^"]+)"/g)].map(m=>[m[1],element()]));
  for(const m of html.matchAll(/<input[^>]*id="([^"]+)"[^>]*value="([^"]+)"/g)) elements.get(m[1]).value=m[2];
  let saved=null,points=[],image=null,testPoints=[],detection=null;
  const source=fs.readFileSync(new URL('../src/calibration.js',import.meta.url),'utf8').replace(/^import[^\n]+\n/gm,'');
  vm.runInNewContext(source,{...geometry,
    detectMarkers:()=>detection,
    document:{getElementById:id=>elements.get(id),querySelector:()=>element(),createElement:element},
    createImagePicker:({onChange,onTestMove})=>({get image(){return image;},get points(){return points;},
      load(next){image=next;points=[];onChange();},setPoints(next){points=next;onChange();},setOverlay(){},clear(){points=[];onChange();},
      setTestPoints(next){testPoints=next;onTestMove({x:0,y:0});},resetTestOffset(){onTestMove({x:0,y:0});}}),
    saveCalibration:profile=>{saved=profile;},URL,Image:class{},console
  });
  elements.get('generateDemoBtn').handlers.click();
  assert.match(elements.get('result').textContent,/2140\.00 px/);
  assert.equal(elements.get('saveBtn').disabled,false);
  elements.get('referencePx').value='2140';elements.get('checkReference').handlers.click();
  assert.match(elements.get('referenceResult').textContent,/всего 0\.00 м/);
  elements.get('saveBtn').handlers.click();
  assert.ok(Math.abs(saved.focal-2140)<1e-7);assert.equal(saved.width,1920);
  const correctPoints=points.map(p=>({...p}));
  elements.get('clearPoints').handlers.click();
  detection={ok:true,points:correctPoints,message:'Found'};
  elements.get('findMarkers').handlers.click();
  elements.get('calibrateBtn').handlers.click();
  assert.match(elements.get('result').textContent,/2140\.00 px/);
  const originalImage=image,originalPoints=JSON.stringify(points);
  elements.get('demoBtn').handlers.click();
  assert.equal(image,originalImage);
  assert.equal(JSON.stringify(points),originalPoints);
  assert.equal(testPoints.length,3);
  elements.get('demoFocal').value='3000';elements.get('demoFocal').handlers.input();
  assert.equal(JSON.stringify(points),originalPoints);
  elements.get('calibrateBtn').handlers.click();
  assert.match(elements.get('result').textContent,/2140\.00 px/);
  elements.get('hideDemo').handlers.click();assert.equal(testPoints.length,0);
  elements.get('cameraX').value='999';elements.get('cameraX').handlers.input();
  assert.equal(elements.get('saveBtn').disabled,true);
  elements.get('checkReference').handlers.click();
  assert.match(elements.get('referenceResult').textContent,/Позиция по фото отличается/);
});
