// Beacon frame: +X points left toward P2, +Y forward toward P3, +Z up.
// This is a left-handed frame; distances are unchanged, camera projection is not.
const dot = (a, b) => a.reduce((sum, v, i) => sum + v * b[i], 0);
const norm = a => Math.sqrt(dot(a, a));
const unit = a => a.map(v => v / norm(a));
const sub = (a, b) => a.map((v, i) => v - b[i]);
const cross = (a, b) => [a[1]*b[2]-a[2]*b[1], a[2]*b[0]-a[0]*b[2], a[0]*b[1]-a[1]*b[0]];

export function buildTriangle(d12, d13, d23) {
  const sides = [d12, d13, d23];
  if (!sides.every(v => Number.isFinite(v) && v > 0) ||
      2 * Math.max(...sides) >= sides.reduce((a, b) => a + b, 0)) {
    throw new Error("Расстояния должны образовывать невырожденный треугольник.");
  }
  const x = (d12*d12 + d13*d13 - d23*d23) / (2*d12);
  const y = Math.sqrt(d13*d13 - x*x);
  if (y / Math.max(...sides) < 1e-5) throw new Error("Маяки почти на одной прямой.");
  return [[0, 0, 0], [d12, 0, 0], [x, y, 0]];
}

const add = (a, b) => Array.from({length: Math.max(a.length, b.length)}, (_, i) => (a[i] || 0) + (b[i] || 0));
const scale = (a, k) => a.map(v => v*k);
function multiply(a, b) {
  const out = Array(a.length + b.length - 1).fill(0);
  a.forEach((v, i) => b.forEach((w, j) => { out[i+j] += v*w; }));
  return out;
}
const evaluate = (p, x) => p.reduceRight((v, c) => v*x+c, 0);

// Isolate every real root between derivative roots, including repeated roots.
function realRoots(coefficients) {
  let p = coefficients.slice();
  const magnitude = Math.max(...p.map(Math.abs));
  if (!magnitude) return [];
  p = p.map(v => v / magnitude);
  while (p.length > 1 && Math.abs(p.at(-1)) < 1e-14) p.pop();
  if (p.length === 1) return [];
  if (p.length === 2) return [-p[0]/p[1]];
  const critical = realRoots(p.slice(1).map((v, i) => v*(i+1)));
  const bound = 1 + Math.max(...p.slice(0, -1).map(v => Math.abs(v / p.at(-1))));
  const knots = [-bound, ...critical.filter(x => x > -bound && x < bound), bound];
  const roots = [];
  const nearZero = x => Math.abs(evaluate(p, x)) <= 1e-11 * p.reduce((s, v, i) => s + Math.abs(v)*Math.abs(x)**i, 0);
  for (const x of critical) if (nearZero(x)) roots.push(x);
  for (let i = 0; i < knots.length - 1; i++) {
    let lo = knots[i], hi = knots[i+1], flo = evaluate(p, lo);
    if (Math.sign(flo) === Math.sign(evaluate(p, hi))) continue;
    for (let k = 0; k < 100; k++) {
      const mid = (lo+hi)/2, fm = evaluate(p, mid);
      if (Math.sign(fm) === Math.sign(flo)) { lo = mid; flo = fm; } else hi = mid;
    }
    roots.push((lo+hi)/2);
  }
  return roots.sort((a,b) => a-b).filter((v,i,a) => !i || Math.abs(v-a[i-1]) > 1e-7*Math.max(1,Math.abs(v)));
}

export function solvePosition({world, pixels, focal, center, height, heightTolerance}) {
  if (pixels.length !== 3 || !pixels.every(p => Number.isFinite(p.x) && Number.isFinite(p.y)))
    throw new Error("Нужно выбрать три точки.");
  if (!Number.isFinite(focal) || focal <= 0) throw new Error("Фокус должен быть положительным.");
  if (!Number.isFinite(height) || height <= 0 || !Number.isFinite(heightTolerance) || heightTolerance < 0)
    throw new Error("Укажите положительную высоту и неотрицательную погрешность.");
  const dirs = pixels.map(p => unit([(p.x-center.x)/focal, (p.y-center.y)/focal, 1]));
  const c12 = dot(dirs[0],dirs[1]), c13 = dot(dirs[0],dirs[2]), c23 = dot(dirs[1],dirs[2]);
  const d12 = norm(sub(world[0],world[1])), d13 = norm(sub(world[0],world[2])), d23 = norm(sub(world[1],world[2]));
  if (Math.min(1-c12,1-c13,1-c23) < 1e-12) throw new Error("Выбранные точки совпадают или слишком близки.");
  const k13 = (d13/d12)**2, k23 = (d23/d12)**2;
  // Ratios u=r2/r1, v=r3/r1 eliminate the three ranges to a quartic.
  const A = [1,-2*c12,1];
  const N = add(scale(A,k23-k13),[1,0,-1]);
  const D = [2*c13,-2*c23];
  const polynomial = add(add(multiply(N,N),scale(multiply(N,D),-2*c13)),multiply(add([1],scale(A,-k13)),multiply(D,D)));
  const candidates = [];
  for (const u of realRoots(polynomial).filter(v => v > 0)) {
    const av = evaluate(A,u);
    if (av <= 0) continue;
    const discriminant = c13*c13 - 1 + k13*av;
    // Recover v from the quadratic, avoiding division by a near-zero D(u).
    const vs = discriminant >= -1e-12 ?
      [c13+Math.sqrt(Math.max(0,discriminant)),c13-Math.sqrt(Math.max(0,discriminant))] : [];
    for (const v of vs.filter(v => v > 0)) {
      const ranges = [d12/Math.sqrt(av),u*d12/Math.sqrt(av),v*d12/Math.sqrt(av)];
      const residuals = [[0,1,d12,c12],[0,2,d13,c13],[1,2,d23,c23]].map(([i,j,d,c]) =>
        Math.abs(ranges[i]**2+ranges[j]**2-2*c*ranges[i]*ranges[j]-d*d)/(d*d));
      if (Math.max(...residuals) > 1e-6) continue;
      const x = (ranges[0]**2-ranges[1]**2+d12*d12)/(2*d12);
      const [x3,y3] = world[2];
      const y = (ranges[0]**2-ranges[2]**2+d13*d13-2*x3*x)/(2*y3);
      const z2 = ranges[0]**2-x*x-y*y;
      if (z2 <= 0) continue;
      const position = {x,y,z:Math.sqrt(z2)};
      if (candidates.some(c => Math.hypot(c.position.x-x,c.position.y-y,c.position.z-position.z) < 1e-3)) continue;
      candidates.push({position,ranges,heightDifference:Math.abs(position.z-height)});
    }
  }
  candidates.sort((a,b) => a.heightDifference-b.heightDifference);
  return {candidates, accepted:candidates.filter(c => c.heightDifference <= heightTolerance+1e-6)};
}

// Synthetic projection uses the same local frame, with the optical axis on P1.
export function projectCentered(world, position, focal, center, rollDegrees = 0) {
  const C = [position.x,position.y,position.z];
  const forward = unit(scale(C,-1));
  let right = cross([0,0,1],forward);
  if (norm(right) < 1e-8) right = [-1,0,0];
  else right = unit(right);
  const up = unit(cross(forward,right));
  const roll = rollDegrees*Math.PI/180;
  return world.map(p => {
    const delta = sub(p,C), depth = dot(delta,forward);
    if (depth <= 0) return null;
    const x = focal*dot(delta,right)/depth, y = -focal*dot(delta,up)/depth;
    return {x:center.x+x*Math.cos(roll)-y*Math.sin(roll), y:center.y+x*Math.sin(roll)+y*Math.cos(roll)};
  });
}

export function calibrateFocal({world, pixels, position, center}) {
  if (pixels.length !== 3 || !pixels.every(p => p && Number.isFinite(p.x) && Number.isFinite(p.y)))
    throw new Error("Выберите P1, P2 и P3 на изображении.");
  if (![position.x,position.y,position.z,center.x,center.y].every(Number.isFinite) || position.z <= 0)
    throw new Error("Укажите известную позицию камеры с положительной высотой.");
  if (pixels.some((p,i) => pixels.slice(i+1).some(q => Math.hypot(p.x-q.x,p.y-q.y) < 1)))
    throw new Error("Маяки должны быть различимыми отдельными точками.");
  // Convert the left-handed beacon frame to a right-handed physical frame.
  const worldDirs = world.map(p => unit([position.x-p[0],p[1]-position.y,p[2]-position.z]));
  const pairs = [[0,1],[0,2],[1,2]];
  const cameraDirs = f => pixels.map(p => unit([p.x-center.x,p.y-center.y,f]));
  const angle = (a,b) => Math.atan2(norm(cross(a,b)),dot(a,b));
  const targets = pairs.map(([i,j]) => angle(worldDirs[i],worldDirs[j]));
  const cost = logF => {
    const dirs = cameraDirs(Math.exp(logF));
    return pairs.reduce((sum,[i,j],k) => sum+(angle(dirs[i],dirs[j])-targets[k])**2,0);
  };
  // Search focal independently of orientation using the three inter-ray angles.
  const lo = Math.log(1), hi = Math.log(1e7), steps = 240;
  const samples = Array.from({length:steps+1},(_,i) => lo+(hi-lo)*i/steps);
  const minima = [];
  for (let i=1;i<steps;i++) {
    if (cost(samples[i]) > cost(samples[i-1]) || cost(samples[i]) > cost(samples[i+1])) continue;
    let a=samples[i-1], b=samples[i+1];
    for (let k=0;k<80;k++) {
      const x=a+(b-a)/3,y=b-(b-a)/3;
      if(cost(x)<cost(y)) b=y; else a=x;
    }
    minima.push((a+b)/2);
  }
  if (!minima.length) throw new Error("Фокус не определён. Проверьте XYZ и выбранные точки.");
  const fits = minima.map(logF => {
    const dirs = cameraDirs(Math.exp(logF));
    const [i,j] = pairs[targets.indexOf(Math.max(...targets))];
    const basis = (a,b) => {
      const u=unit(a),v=unit(sub(b,scale(u,dot(b,u))));
      return [u,v,cross(u,v)];
    };
    const from=basis(worldDirs[i],worldDirs[j]),to=basis(dirs[i],dirs[j]);
    const rotation = Array.from({length:3},(_,r) => Array.from({length:3},(_,c) =>
      to.reduce((sum,axis,k) => sum+axis[r]*from[k][c],0)));
    return refineCalibration(rotation,logF,worldDirs,pixels,center);
  }).sort((a,b)=>a.rms-b.rms);
  const best=fits[0];
  if (!Number.isFinite(best.rms)) throw new Error("Не удалось согласовать позицию и изображение.");
  best.p1Offset=Math.hypot(pixels[0].x-center.x,pixels[0].y-center.y);
  best.ambiguous=fits.slice(1).some(f => Math.abs(Math.log(f.focal/best.focal))>0.01 && f.rms<=best.rms+0.5);
  return best;
}

const rotate = (R,v) => R.map(row=>dot(row,v));
function compose(A,B) {
  return A.map(row=>[0,1,2].map(c=>row.reduce((sum,v,k)=>sum+v*B[k][c],0)));
}
function incrementalRotation(v) {
  const a=norm(v);
  if(a<1e-15)return [[1,0,0],[0,1,0],[0,0,1]];
  const [x,y,z]=scale(v,1/a),c=Math.cos(a),s=Math.sin(a),t=1-c;
  return [[t*x*x+c,t*x*y-s*z,t*x*z+s*y],[t*x*y+s*z,t*y*y+c,t*y*z-s*x],[t*x*z-s*y,t*y*z+s*x,t*z*z+c]];
}
function linearSolve(A,b) {
  const m=A.map((row,i)=>[...row,b[i]]),n=b.length;
  for(let k=0;k<n;k++) {
    let pivot=k;
    for(let i=k+1;i<n;i++)if(Math.abs(m[i][k])>Math.abs(m[pivot][k]))pivot=i;
    if(Math.abs(m[pivot][k])<1e-18)return null;
    [m[k],m[pivot]]=[m[pivot],m[k]];
    const d=m[k][k];for(let j=k;j<=n;j++)m[k][j]/=d;
    for(let i=0;i<n;i++)if(i!==k){const f=m[i][k];for(let j=k;j<=n;j++)m[i][j]-=f*m[k][j];}
  }
  return m.map(row=>row[n]);
}
function refineCalibration(initialRotation,initialLogF,dirs,pixels,center) {
  const project=(R,logF)=>dirs.map(v=>{
    const [x,y,z]=rotate(R,v),f=Math.exp(logF);
    return z>1e-8 ? {x:center.x+f*x/z,y:center.y+f*y/z} : null;
  });
  const residual=(R,logF)=>{
    const projected=project(R,logF);
    return projected.some(p=>!p) ? null : projected.flatMap((p,i)=>[p.x-pixels[i].x,p.y-pixels[i].y]);
  };
  let R=initialRotation,logF=initialLogF,lambda=1e-4;
  for(let iter=0;iter<100;iter++) {
    const r=residual(R,logF);if(!r)break;
    const h=1e-6,columns=[];
    for(let k=0;k<4;k++) {
      const v=[0,0,0];if(k<3)v[k]=h;
      const next=residual(k<3?compose(incrementalRotation(v),R):R,logF+(k===3?h:0));
      if(!next)break;
      columns.push(next.map((x,i)=>(x-r[i])/h));
    }
    if(columns.length!==4)break;
    const A=columns.map((c,i)=>columns.map((d,j)=>dot(c,d)+(i===j?lambda*Math.max(1,dot(c,c)):0)));
    const delta=linearSolve(A,columns.map(c=>-dot(c,r)));if(!delta)break;
    const nextR=compose(incrementalRotation(delta.slice(0,3)),R),nextF=logF+delta[3];
    const next=residual(nextR,nextF);
    if(next && nextF>=0 && nextF<=Math.log(1e7) && dot(next,next)<dot(r,r)) {
      R=nextR;logF=nextF;lambda=Math.max(1e-12,lambda/3);
      if(norm(delta)<1e-10)break;
    } else lambda*=10;
  }
  const projected=project(R,logF);
  const errors=projected.map((p,i)=>p?Math.hypot(p.x-pixels[i].x,p.y-pixels[i].y):Infinity);
  return {focal:Math.exp(logF),rotation:R,projected,errors,rms:Math.sqrt(dot(errors,errors)/3)};
}
