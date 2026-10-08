import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';

test('dragging test P1 moves the group in image pixels without changing measurements, including after zoom',()=>{
  const handlers={},windowHandlers={};
  const ctx=new Proxy({},{get:()=>()=>{}});
  const canvas={style:{},getContext:()=>ctx,getBoundingClientRect:()=>({left:0,top:0}),
    addEventListener:(name,fn)=>{handlers[name]=fn;}};
  const source=fs.readFileSync(new URL('../src/image-picker.js',import.meta.url),'utf8').replace('export function','function');
  const create=vm.runInNewContext(source+';createImagePicker;',{
    window:{addEventListener:(name,fn)=>{windowHandlers[name]=fn;}}
  });
  let changes=0;
  const picker=create({canvas,wrap:{getBoundingClientRect:()=>({width:500,height:500})},
    cursor:{style:{setProperty(){}}},label:{},onChange:()=>{changes++;}});
  picker.load({width:1000,height:500});
  picker.setPoints([{x:400,y:200}]);
  picker.setTestPoints([{x:500,y:250},{x:400,y:250},{x:450,y:150}]);
  const original=JSON.stringify(picker.points),before=changes;
  const event=(x,y)=>({clientX:x,clientY:y,button:0,shiftKey:false,preventDefault(){}});
  handlers.mousedown(event(250,250));
  windowHandlers.mousemove(event(300,275));windowHandlers.mouseup();
  handlers.click(event(300,275));
  assert.equal(picker.testPoints[0].x,600);assert.equal(picker.testPoints[0].y,300);
  assert.equal(picker.testPoints[1].x,500);assert.equal(picker.testPoints[2].y,200);
  assert.equal(JSON.stringify(picker.points),original);assert.equal(changes,before);
  handlers.wheel({...event(300,275),deltaY:-1});
  handlers.mousedown(event(300,275));
  windowHandlers.mousemove(event(355,275));windowHandlers.mouseup();
  assert.ok(Math.abs(picker.testPoints[0].x-700)<1e-9);
  picker.setTestPoints([{x:500,y:250},{x:300,y:250},{x:450,y:100}]);
  assert.ok(Math.abs(picker.testPoints[0].x-700)<1e-9);
  assert.ok(Math.abs(picker.testPoints[1].x-500)<1e-9);
  picker.resetTestOffset();assert.equal(picker.testPoints[0].x,500);
  assert.equal(JSON.stringify(picker.points),original);
});
