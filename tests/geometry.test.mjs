import test from 'node:test';
import assert from 'node:assert/strict';
import { buildTriangle, solvePosition, projectCentered } from '../src/geometry.js';

const world = buildTriangle(20, Math.hypot(20, 50), 50);
const center = {x:960,y:540};
const distance = (a,b) => Math.hypot(a.x-b.x,a.y-b.y,a.z-b.z);

// Independent pinhole projection: construct right/up vectors analytically.
function photograph(C, roll = 0) {
  const r = Math.hypot(C.x,C.y), length = Math.hypot(r,C.z);
  const right = [-C.y/r,C.x/r,0];
  const up = [-C.x*C.z/(r*length),-C.y*C.z/(r*length),r/length];
  const forward = [-C.x/length,-C.y/length,-C.z/length];
  return world.map(P => {
    const delta = [P[0]-C.x,P[1]-C.y,-C.z];
    const dot = v => delta.reduce((s,x,i) => s+x*v[i],0);
    const x = 2140*dot(right)/dot(forward), y = -2140*dot(up)/dot(forward);
    return {x:center.x+x*Math.cos(roll)-y*Math.sin(roll),y:center.y+x*Math.sin(roll)+y*Math.cos(roll)};
  });
}
const solve = (pixels,height,tolerance=2) => solvePosition({world,pixels,focal:2140,center,height,heightTolerance:tolerance});

test('recovers positions in all quadrants without yaw, pitch or roll inputs', () => {
  for (const x of [-100,10,100]) for (const y of [-300,-100,200]) for (const z of [50,100]) {
    const C = {x,y,z};
    for (const roll of [0,0.8,Math.PI,5.4]) {
      const result = solve(photograph(C,roll),z);
      assert.ok(result.accepted.some(c => distance(c.position,C) < 0.01),JSON.stringify({C,roll,result}));
      for (const c of result.candidates) world.forEach((P,i) => {
        assert.ok(Math.abs(c.ranges[i]-Math.hypot(P[0]-c.position.x,P[1]-c.position.y,c.position.z)) < 1e-6);
      });
    }
  }
});

test('height selects a branch and preserves ambiguity when multiple branches fit', () => {
  const pixels = photograph({x:100,y:-200,z:50});
  const narrow = solve(pixels,50);
  assert.equal(narrow.accepted.length,1);
  assert.ok(narrow.candidates.length > 1);
  assert.ok(solve(pixels,50,20).accepted.length > 1);
  assert.equal(solve(pixels,500).accepted.length,0);
});

test('validates geometry and height instead of silently manufacturing a result', () => {
  assert.throws(() => buildTriangle(1,1,3));
  assert.throws(() => buildTriangle(1,1,2));
  assert.throws(() => solve([{x:0,y:0},{x:0,y:0},{x:1,y:1}],50));
  assert.throws(() => solve(photograph({x:100,y:-200,z:50}),-50));
});

test('synthetic phantom frame keeps P1 centered, including vertical view', () => {
  for (const C of [{x:100,y:-200,z:50},{x:0,y:0,z:50}]) {
    const pixels = projectCentered(world,C,2140,center,180);
    assert.ok(Math.hypot(pixels[0].x-center.x,pixels[0].y-center.y) < 1e-9);
    assert.ok(solve(pixels,50).accepted.some(c => distance(c.position,C) < 0.01));
  }
});

test('small click perturbations do not yield nonfinite positions or distances', () => {
  const pixels = photograph({x:100,y:-200,z:50});
  pixels[1].x += 0.3;
  pixels[2].y -= 0.3;
  const result = solve(pixels,50);
  for (const c of result.candidates) {
    assert.ok(Object.values(c.position).every(Number.isFinite));
    assert.ok(c.ranges.every(r => Number.isFinite(r) && r > 0));
  }
  assert.ok(result.accepted.length > 0);
});

test('agreed front view puts blue left and pink above the centered yellow beacon', () => {
  const C = {x:0,y:-200,z:50};
  const pixels = projectCentered(world,C,2140,center,0);
  assert.ok(Math.hypot(pixels[0].x-center.x,pixels[0].y-center.y) < 1e-9);
  assert.ok(pixels[1].x < pixels[0].x);
  assert.ok(Math.abs(pixels[1].y-pixels[0].y) < 1e-9);
  assert.ok(pixels[2].y < pixels[0].y);
  assert.ok(Math.abs(pixels[2].x-center.x) < Math.abs(pixels[1].x-center.x));
  assert.ok(solve(pixels,50).accepted.some(c => distance(c.position,C) < 0.01));
});

test('retains P3P solutions near the eliminated denominator singularity after camera rotation',()=>{
  const world=buildTriangle(20,53.85,50),center={x:750.5,y:420},focal=3207.264957264957;
  for(let k=0;k<150;k++) {
    const C={x:-150+k*2,y:-300,z:70},yaw=-0.4+k/150*0.8,c=Math.cos(yaw),s=Math.sin(yaw);
    const pixels=projectCentered(world,C,focal,center).map(p=>{
      const x=(p.x-center.x)/focal,y=(p.y-center.y)/focal,z=c-s*x;
      return {x:center.x+focal*(c*x+s)/z,y:center.y+focal*y/z};
    });
    const result=solvePosition({world,pixels,focal,center,height:C.z,heightTolerance:2});
    assert.ok(result.accepted.some(candidate=>distance(candidate.position,C)<0.01),JSON.stringify({C,yaw,result}));
  }
});
