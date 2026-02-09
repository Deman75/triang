export function addNoise(r, sigma) {
  if (sigma <= 0) return r;
  const u1 = Math.max(Math.random(), 1e-9);
  const u2 = Math.max(Math.random(), 1e-9);
  const z0 = Math.sqrt(-2 * Math.log(u1)) * Math.cos(2 * Math.PI * u2);
  return r + z0 * sigma;
}

export function trilaterate3(THREE, p1, r1, p2, r2, p3, r3) {
  const ex = p2.clone().sub(p1);
  const d = ex.length();
  if (d < 1e-6) return { ok:false, msg:"P1 и P2 совпали." };
  ex.normalize();

  const p3p1 = p3.clone().sub(p1);
  const i = ex.dot(p3p1);

  const tmp = p3p1.clone().sub(ex.clone().multiplyScalar(i));
  const tlen = tmp.length();
  if (tlen < 1e-6) return { ok:false, msg:"P1,P2,P3 почти на одной линии." };
  const ey = tmp.clone().divideScalar(tlen);
  const ez = new THREE.Vector3().crossVectors(ex, ey);

  const j = ey.dot(p3p1);

  const x = (r1*r1 - r2*r2 + d*d) / (2*d);
  const y = (r1*r1 - r3*r3 + i*i + j*j - 2*i*x) / (2*j);

  const z2 = r1*r1 - x*x - y*y;
  if (z2 < -1e-6) return { ok:false, msg:"Сферы не пересекаются (или шум слишком большой)." };
  const z = Math.sqrt(Math.max(0, z2));

  const pA = p1.clone().add(ex.clone().multiplyScalar(x)).add(ey.clone().multiplyScalar(y)).add(ez.clone().multiplyScalar(z));
  const pB = p1.clone().add(ex.clone().multiplyScalar(x)).add(ey.clone().multiplyScalar(y)).add(ez.clone().multiplyScalar(-z));

  const chosen = (pA.y >= pB.y) ? pA : pB;
  return { ok:true, p: chosen, alt: (chosen === pA ? pB : pA) };
}

export function localFrame(THREE, p1, p2, p3) {
  const xAxis = p2.clone().sub(p1);
  const xLen = xAxis.length();
  if (xLen < 1e-6) return { ok:false, msg:"P1→P2 ноль." };
  xAxis.normalize();

  const v = p3.clone().sub(p1);
  const vOrtho = v.clone().sub(xAxis.clone().multiplyScalar(xAxis.dot(v)));
  const yLen = vOrtho.length();
  if (yLen < 1e-6) return { ok:false, msg:"P3 на линии P1→P2." };
  let yAxis = vOrtho.clone().divideScalar(yLen);

  let zAxis = new THREE.Vector3().crossVectors(xAxis, yAxis).normalize();
  // Ensure Z points upward in world space (positive Y)
  if (zAxis.dot(new THREE.Vector3(0, 1, 0)) < 0) {
    yAxis = yAxis.multiplyScalar(-1);
    zAxis = new THREE.Vector3().crossVectors(xAxis, yAxis).normalize();
  }
  return { ok:true, origin: p1.clone(), xAxis, yAxis, zAxis };
}

export function toLocalXYZ(frame, worldPoint) {
  const v = worldPoint.clone().sub(frame.origin);
  return new frame.origin.constructor(
    v.dot(frame.xAxis),
    v.dot(frame.yAxis),
    v.dot(frame.zAxis)
  );
}
