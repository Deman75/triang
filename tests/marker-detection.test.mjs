import test from 'node:test';
import assert from 'node:assert/strict';
import {findMarkers} from '../src/marker-detection.js';
import {buildTriangle,projectCentered,calibrateFocal,solvePosition} from '../src/geometry.js';

function image(width=546,height=441) {
  const data=new Uint8ClampedArray(width*height*4);
  for(let i=0;i<width*height;i++) {data[4*i]=data[4*i+1]=data[4*i+2]=50+i%40;data[4*i+3]=255;}
  return {data,width,height};
}
function circle(img,x,y,r,color) {
  for(let yy=0;yy<img.height;yy++)for(let xx=0;xx<img.width;xx++) {
    if(Math.hypot(xx+0.5-x,yy+0.5-y)>r)continue;
    const shade=0.6+0.4*(yy-y+r)/(2*r),i=4*(yy*img.width+xx);
    color.forEach((v,k)=>{img.data[i+k]=v*shade;});
  }
}
const colors=[[195,200,55],[28,76,208],[205,82,203]];
const positions=[{x:378,y:336},{x:133,y:295},{x:378,y:81}];
function sample(){const img=image();positions.forEach((p,i)=>circle(img,p.x,p.y,12,colors[i]));return img;}

test('detects shaded yellow, blue and violet circles on gray, in P1/P2/P3 order',()=>{
  const found=findMarkers(sample());assert.ok(found.ok,found.message);
  found.points.forEach((p,i)=>assert.ok(Math.hypot(p.x-positions[i].x,p.y-positions[i].y)<0.1));
});
test('ignores small color noise and rejects missing, duplicate and clipped markers',()=>{
  const noise=sample();circle(noise,50,50,1,colors[0]);assert.ok(findMarkers(noise).ok);
  const duplicate=sample();circle(duplicate,60,60,10,colors[1]);
  const ambiguous=findMarkers(duplicate);assert.ok(!ambiguous.ok);assert.equal(ambiguous.points,null);
  assert.match(ambiguous.message,/P2.*2 похожих/);
  const missing=image();positions.slice(0,2).forEach((p,i)=>circle(missing,p.x,p.y,12,colors[i]));
  assert.match(findMarkers(missing).message,/P3.*не найден/);
  const clipped=image();circle(clipped,3,100,12,colors[0]);
  positions.slice(1).forEach((p,i)=>circle(clipped,p.x,p.y,12,colors[i+1]));
  assert.match(findMarkers(clipped).message,/P1.*обрезан/);
});
test('rejects gray-only and transparent pixels instead of inventing markers',()=>{
  assert.ok(!findMarkers(image()).ok);
  const img=sample();for(let i=3;i<img.data.length;i+=4)img.data[i]=0;
  assert.ok(!findMarkers(img).ok);
});
test('detected circle centers work with focal calibration and position estimation',()=>{
  const world=buildTriangle(20,53.85,50),position={x:0,y:-200,z:50},focal=2140,center={x:960,y:540};
  const points=projectCentered(world,position,focal,center,0),img=image(1920,1080);
  points.forEach((p,i)=>circle(img,p.x,p.y,14,colors[i]));
  const found=findMarkers(img);assert.ok(found.ok);
  const calibration=calibrateFocal({world,position,pixels:found.points,center});
  assert.ok(Math.abs(calibration.focal-focal)<10);
  const estimate=solvePosition({world,pixels:found.points,focal,center,height:50,heightTolerance:2});
  assert.ok(estimate.accepted.some(c=>Math.hypot(c.position.x,c.position.y+200,c.position.z-50)<2));
});
