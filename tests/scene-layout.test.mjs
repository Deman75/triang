import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {sceneLayout} from '../src/scene-layout.js';

test('observer viewport follows its DOM frame on desktop and after mobile scrolling', () => {
  assert.deepEqual(sceneLayout(
    {left:310,top:90,bottom:900,width:1190,height:810},
    {left:328,top:662,bottom:882,width:220,height:220}
  ),{width:1190,height:810,size:220,x:18,y:18});
  assert.deepEqual(sceneLayout(
    {left:0,top:-100,bottom:400,width:390,height:500},
    {left:18,top:226,bottom:382,width:156,height:156}
  ),{width:390,height:500,size:156,x:18,y:18});
});

test('simulation keeps all dynamic fields and prominent photo navigation', () => {
  const html=fs.readFileSync(new URL('../src/index.html',import.meta.url),'utf8');
  const source=fs.readFileSync(new URL('../src/main.js',import.meta.url),'utf8');
  const ids=[...html.matchAll(/id="([^"]+)"/g)].map(m=>m[1]);
  assert.equal(ids.length,new Set(ids).size);
  for(const match of source.matchAll(/getElementById\("([^"]+)"\)/g))
    assert.ok(ids.includes(match[1]),`Missing ${match[1]}`);
  assert.match(html, /class="photo-cta" href="\.\/image\.html"/);
  assert.doesNotMatch(html, /id="formulaBox"[^>]*\bopen\b/);
});
