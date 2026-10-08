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
  for (const match of html.matchAll(/<input[^>]*id="([^"]+)"[^>]*type="checkbox"[^>]*>/g))
    elements.get(match[1]).checked=/\bchecked\b/.test(match[0]);
  assert.equal(elements.get('focalEq').value,'50');
  assert.equal(elements.get('sensorW').value,'23.4');
  assert.equal(elements.get('showPhantom').checked,false);
  assert.equal(elements.get('height').value,'');
  assert.match(html, /id="height"[^>]*\brequired\b/);
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
  const load = () => elements.get('fileInput').handlers.change({target:{files:[{}]}});
  assert.equal(elements.get('findMarkers').disabled,true);
  assert.equal(elements.get('solveBtn').disabled,true);
  load();
  assert.equal(elements.get('findMarkers').disabled,false);
  assert.equal(elements.get('solveBtn').disabled,true);
  assert.ok(Math.abs(Number(elements.get('focal').value)-50/23.4*1501)<0.001);
  elements.get('focalEq').value='40';
  elements.get('focalEq').handlers.input();
  assert.ok(Math.abs(Number(elements.get('focal').value)-40/23.4*1501)<0.001);
  elements.get('focalEq').value='50';
  elements.get('focalEq').handlers.input();
  elements.get('demoBtn').handlers.click();
  assert.equal(elements.get('solveBtn').disabled,false);
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
  for (const height of ['', '0', '-10', 'NaN']) {
    elements.get('height').value=height;
    elements.get('solveBtn').handlers.click();
    assert.match(elements.get('result').textContent,/Введите высоту/);
  }
  elements.get('height').value='500';
  elements.get('solveBtn').handlers.click();
  assert.match(elements.get('result').textContent,/Ни одно решение/);
  elements.get('clearPoints').handlers.click();
  assert.equal(elements.get('solveBtn').disabled,true);
  elements.get('solveBtn').handlers.click();
  assert.match(elements.get('result').textContent,/выберите P1, P2, P3/);
  elements.get('findMarkers').handlers.click();
  assert.equal(elements.get('solveBtn').disabled,false);
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
  elements.get('hintX').value='150';
  elements.get('hintY').value='-300';
  elements.get('hintZ').value='70';
  elements.get('demoBtn').handlers.click();
  assert.match(elements.get('result').textContent,/X=150\.00, Y=-300\.00, Z=70\.00/);
  assert.match(elements.get('result').textContent,/\(-150\.00, 300\.00, -70\.00\)/);
  assert.match(elements.get('result').textContent,/Угол по горизонту: 333\.43°/);
  assert.match(elements.get('result').textContent,/Наклон вниз от горизонта: 11\.79°/);
  assert.match(elements.get('result').textContent,/P1 от оптической оси камеры: 0\.00°/);
});
