import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import * as geometry from '../src/geometry.js';
import * as profiles from '../src/calibration-profile.js';

test('photo page controls generate and solve a test frame without missing DOM elements', () => {
  const html = fs.readFileSync(new URL('../src/image.html',import.meta.url),'utf8');
  const context = new Proxy({}, {get: () => () => {}});
  function element(value = '') {
    return {value,checked:true,style:{setProperty(){}},textContent:'',width:800,height:600,
      handlers:{},addEventListener(type,handler){this.handlers[type]=handler;},
      getContext:()=>context,getBoundingClientRect:()=>({left:0,top:0,width:800,height:600})};
  }
  const elements = new Map([...html.matchAll(/id="([^"]+)"/g)].map(m => [m[1],element()]));
  for (const match of html.matchAll(/<input[^>]*id="([^"]+)"[^>]*value="([^"]+)"/g)) elements.get(match[1]).value=match[2];
  const document = {
    getElementById:id=>elements.get(id) || null,
    querySelector:()=>element(),createElement:()=>element()
  };
  const source = fs.readFileSync(new URL('../src/image.js',import.meta.url),'utf8').replace(/^import[^\n]+\n/gm,'');
  let savedProfile = null;
  let loadedWidth = 1501, loadedHeight = 840;
  class LoadedImage {
    get width() { return loadedWidth; }
    get height() { return loadedHeight; }
    set src(value) { this.onload(); }
  }
  let detection={ok:true,points:[{x:960,y:540},{x:752,y:540},{x:752,y:440}],message:'Found'};
  vm.runInNewContext(source,{...geometry,...profiles,detectMarkers:()=>detection,readCalibration:()=>savedProfile,document,window:{addEventListener(){}},console,URL:{createObjectURL:()=> 'mock:image',revokeObjectURL(){}},Math,Number,Image:LoadedImage});
  elements.get('demoBtn').handlers.click();
  const result = elements.get('result').textContent;
  assert.match(result,/X=0\.00, Y=-200\.00, Z=50\.00/);
  assert.match(elements.get('reproj').textContent,/в диапазоне высоты: 1/);
  savedProfile={focal:2100,width:1920,height:1080,sides:[20,53.85,50]};
  elements.get('applySavedCalibration').handlers.click();
  assert.equal(elements.get('focal').value,'2100.000');
  savedProfile={...savedProfile,focal:700,width:1280,height:720};
  elements.get('applySavedCalibration').handlers.click();
  assert.equal(elements.get('focal').value,'2100.000');
  assert.match(elements.get('calibrationStatus').textContent,/Фокус не применён/);
  elements.get('height').value='500';
  elements.get('solveBtn').handlers.click();
  assert.match(elements.get('result').textContent,/Ни одно решение/);
  elements.get('clearPoints').handlers.click();
  elements.get('solveBtn').handlers.click();
  assert.match(elements.get('result').textContent,/выберите P1, P2, P3/);
  elements.get('findMarkers').handlers.click();
  assert.equal(elements.get('detectionStatus').textContent,'Found');
  elements.get('solveBtn').handlers.click();
  assert.doesNotMatch(elements.get('result').textContent,/выберите P1, P2, P3/);
  const previous=elements.get('result').textContent;
  detection={ok:false,points:null,message:'Ambiguous'};
  elements.get('findMarkers').handlers.click();
  assert.equal(elements.get('detectionStatus').textContent,'Ambiguous');
  elements.get('solveBtn').handlers.click();assert.equal(elements.get('result').textContent,previous);
  elements.get('focalEq').value='50';
  elements.get('sensorW').value='23.4';
  elements.get('applyFocalEq').handlers.click();
  const load = () => elements.get('fileInput').handlers.change({target:{files:[{}]}});
  load();
  assert.ok(Math.abs(Number(elements.get('focal').value)-50/23.4*1501)<0.001);
  assert.match(elements.get('imageInfo').textContent,/1501.*840/);
  loadedWidth=856; loadedHeight=479;
  load();
  assert.ok(Math.abs(Number(elements.get('focal').value)-50/23.4*856)<0.001);
  elements.get('focal').value='1234';
  elements.get('focal').handlers.input();
  loadedWidth=1501; loadedHeight=840;
  load();
  assert.equal(elements.get('focal').value,'1234');
});
