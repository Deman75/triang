const fileInput = document.getElementById("fileInput");
const canvas = document.getElementById("imgCanvas");
const ctx = canvas.getContext("2d");
const overlayHint = document.getElementById("overlayHint");
const wrap = document.querySelector(".canvas-wrap");
const cursorCross = document.getElementById("cursorCross");
const cursorLabel = document.getElementById("cursorLabel");

const d12El = document.getElementById("d12");
const d13El = document.getElementById("d13");
const d23El = document.getElementById("d23");
const focalEl = document.getElementById("focal");
const focalVal = document.getElementById("focalVal");
const clickNoiseEl = document.getElementById("clickNoise");
const clickNoiseVal = document.getElementById("clickNoiseVal");
const clearPointsBtn = document.getElementById("clearPoints");
const solveBtn = document.getElementById("solveBtn");
const resultEl = document.getElementById("result");
const reprojEl = document.getElementById("reproj");
const autoSolveBtn = document.getElementById("autoSolve");
const hintXEl = document.getElementById("hintX");
const hintYEl = document.getElementById("hintY");
const hintZEl = document.getElementById("hintZ");
const showPhantomEl = document.getElementById("showPhantom");
const phantomRotEl = document.getElementById("phantomRot");
const phantomDXEl = document.getElementById("phantomDX");
const phantomDYEl = document.getElementById("phantomDY");
const lockP1El = document.getElementById("lockP1");
const focalEqEl = document.getElementById("focalEq");
const sensorWEl = document.getElementById("sensorW");
const focalEqPxEl = document.getElementById("focalEqPx");
const applyFocalEqBtn = document.getElementById("applyFocalEq");
const angleOnlyEl = document.getElementById("angleOnly");
const p1CenteredEl = document.getElementById("p1Centered");

const state = {
  img: null,
  points: [],
  noiseSigma: 0,
  view: { scale: 1, offsetX: 0, offsetY: 0 },
  isPanning: false,
  panStart: { x: 0, y: 0 },
  panOrigin: { x: 0, y: 0 },
  autoAlignP1: true
};

focalEl.addEventListener("input", () => {
  focalVal.textContent = focalEl.value;
  renderPoints();
});

function updateFocalEqPreview() {
  if (!state.img) {
    focalEqPxEl.textContent = "—";
    return;
  }
  const fmm = parseFloat(focalEqEl.value);
  const sw = parseFloat(sensorWEl.value);
  if (!Number.isFinite(fmm) || !Number.isFinite(sw) || sw <= 0) {
    focalEqPxEl.textContent = "—";
    return;
  }
  const fpx = (fmm / sw) * state.img.width;
  focalEqPxEl.textContent = fpx.toFixed(1);
}

focalEqEl.addEventListener("input", updateFocalEqPreview);
sensorWEl.addEventListener("input", updateFocalEqPreview);

applyFocalEqBtn.addEventListener("click", () => {
  if (!state.img) {
    resultEl.textContent = "Сначала загрузите изображение.";
    return;
  }
  const fmm = parseFloat(focalEqEl.value);
  const sw = parseFloat(sensorWEl.value);
  if (!Number.isFinite(fmm) || !Number.isFinite(sw) || sw <= 0) return;
  const fpx = (fmm / sw) * state.img.width;
  const clamped = Math.max(parseFloat(focalEl.min), Math.min(parseFloat(focalEl.max), fpx));
  focalEl.value = clamped.toFixed(0);
  focalVal.textContent = focalEl.value;
});
clickNoiseEl.addEventListener("input", () => {
  clickNoiseVal.textContent = clickNoiseEl.value;
  state.noiseSigma = parseFloat(clickNoiseEl.value);
});
showPhantomEl?.addEventListener("change", renderPoints);
hintXEl?.addEventListener("input", renderPoints);
hintYEl?.addEventListener("input", renderPoints);
hintZEl?.addEventListener("input", renderPoints);
phantomRotEl?.addEventListener("input", renderPoints);
phantomDXEl?.addEventListener("input", () => {
  state.autoAlignP1 = false;
  if (lockP1El) lockP1El.checked = false;
  renderPoints();
});
phantomDYEl?.addEventListener("input", () => {
  state.autoAlignP1 = false;
  if (lockP1El) lockP1El.checked = false;
  renderPoints();
});
lockP1El?.addEventListener("change", () => {
  state.autoAlignP1 = !!lockP1El.checked;
  renderPoints();
});

fileInput.addEventListener("change", (e) => {
  const file = e.target.files?.[0];
  if (!file) return;
  const img = new Image();
  img.onload = () => {
    state.img = img;
    resizeCanvas();
    overlayHint.style.display = "none";
    state.points = [];
    renderPoints();
    updateFocalEqPreview();
  };
  img.src = URL.createObjectURL(file);
});

function fitImage() {
  if (!state.img) return;
  const scale = Math.min(
    canvas.width / state.img.width,
    canvas.height / state.img.height
  );
  state.view.scale = Math.max(scale, 0.01);
  state.view.offsetX = (canvas.width - state.img.width * state.view.scale) / 2;
  state.view.offsetY = (canvas.height - state.img.height * state.view.scale) / 2;
}

function resizeCanvas() {
  const rect = wrap.getBoundingClientRect();
  canvas.width = Math.max(200, Math.floor(rect.width));
  canvas.height = Math.max(200, Math.floor(rect.height));
  fitImage();
  renderPoints();
}

function renderPoints() {
  if (!state.img) return;
  if (cursorCross) {
    const crossColors = ["#ffcc00", "#00d1ff", "#ff4d7d"];
    const idx = Math.min(state.points.length, 2);
    cursorCross.style.setProperty("--cross-color", crossColors[idx]);
    if (cursorLabel) cursorLabel.textContent = `P${idx + 1}`;
  }
  ctx.clearRect(0, 0, canvas.width, canvas.height);
  const s = state.view.scale;
  const ox = state.view.offsetX;
  const oy = state.view.offsetY;
  ctx.setTransform(s, 0, 0, s, ox, oy);
  ctx.drawImage(state.img, 0, 0);
  ctx.setTransform(1, 0, 0, 1, 0, 0);

  const colors = ["#ffcc00", "#00d1ff", "#ff4d7d"];
  for (let i = 0; i < state.points.length; i++) {
    const p = state.points[i];
    const sx = p.x * s + ox;
    const sy = p.y * s + oy;
    ctx.beginPath();
    ctx.strokeStyle = colors[i];
    ctx.lineWidth = 2;
    ctx.arc(sx, sy, 8, 0, Math.PI * 2);
    ctx.stroke();
    ctx.fillStyle = colors[i];
    ctx.fillText(`P${i+1}`, sx + 10, sy - 6);
  }

  if (showPhantomEl?.checked) {
    const d12 = parseFloat(d12El.value);
    const d13 = parseFloat(d13El.value);
    const d23 = parseFloat(d23El.value);
    if ([d12, d13, d23].every(v => v > 0)) {
      const world = buildWorldTriangle(d12, d13, d23);
      const rotDeg = parseFloat(phantomRotEl?.value || 0) + 180;
      const rot = (rotDeg * Math.PI) / 180;
      let dxImg = parseFloat(phantomDXEl?.value || 0);
      let dyImg = parseFloat(phantomDYEl?.value || 0);
      const f = parseFloat(focalEl.value);
      const cx = state.img.width / 2;
      const cy = state.img.height / 2;
      const hint = {
        x: world[0].x + parseFloat(hintXEl.value || 0),
        y: world[0].y - parseFloat(hintYEl.value || 0),
        z: world[0].z - parseFloat(hintZEl.value || 0)
      };

  let R;
  // Camera looks exactly at P1
  const v = { x: world[0].x - hint.x, y: world[0].y - hint.y, z: world[0].z - hint.z };
  const yaw = -Math.atan2(v.x, v.z);
  const v1x = Math.cos(yaw) * v.x + Math.sin(yaw) * v.z;
  const v1z = -Math.sin(yaw) * v.x + Math.cos(yaw) * v.z;
  const pitch = -Math.atan2(v.y, v1z);
  R = rotMatrix(yaw, pitch, 0);

      const phantomColors = ["rgba(255,204,0,0.6)", "rgba(0,209,255,0.6)", "rgba(255,77,125,0.6)"];
      // First, project the base world points
      const proj = world.map(pw => projectPoint(pw, hint, R, f, cx, cy));
      if (!proj[0]) return;
      const p1Screen = { x: proj[0].x * s + ox, y: proj[0].y * s + oy };

      if (state.autoAlignP1 && state.points[0]) {
        const target = { x: state.points[0].x * s + ox, y: state.points[0].y * s + oy };
        dxImg = (target.x - p1Screen.x) / s;
        dyImg = (target.y - p1Screen.y) / s;
        if (phantomDXEl) phantomDXEl.value = Math.round(dxImg).toString();
        if (phantomDYEl) phantomDYEl.value = Math.round(dyImg).toString();
      }

      for (let i = 0; i < 3; i++) {
        const p = proj[i];
        if (!p) continue;
        let sx = p.x * s + ox;
        let sy = p.y * s + oy;

        // rotate in screen space around P1
        const vx = sx - p1Screen.x;
        const vy = sy - p1Screen.y;
        const rx = vx * Math.cos(rot) - vy * Math.sin(rot);
        const ry = vx * Math.sin(rot) + vy * Math.cos(rot);
        sx = p1Screen.x + rx + dxImg * s;
        sy = p1Screen.y + ry + dyImg * s;

        ctx.beginPath();
        ctx.strokeStyle = phantomColors[i];
        ctx.lineWidth = 2;
        ctx.moveTo(sx - 8, sy);
        ctx.lineTo(sx + 8, sy);
        ctx.moveTo(sx, sy - 8);
        ctx.lineTo(sx, sy + 8);
        ctx.stroke();
      }
    }
  }
}

function addNoise(v, sigma) {
  if (sigma <= 0) return v;
  const u1 = Math.max(Math.random(), 1e-9);
  const u2 = Math.max(Math.random(), 1e-9);
  const z0 = Math.sqrt(-2 * Math.log(u1)) * Math.cos(2 * Math.PI * u2);
  return v + z0 * sigma;
}

function screenToImage(x, y) {
  const s = state.view.scale;
  const ox = state.view.offsetX;
  const oy = state.view.offsetY;
  return {
    x: (x - ox) / s,
    y: (y - oy) / s
  };
}

function computePhantomP1Screen() {
  const d12 = parseFloat(d12El.value);
  const d13 = parseFloat(d13El.value);
  const d23 = parseFloat(d23El.value);
  if (![d12, d13, d23].every(v => v > 0)) return null;
  const world = buildWorldTriangle(d12, d13, d23);
  const f = parseFloat(focalEl.value);
  const cx = state.img.width / 2;
  const cy = state.img.height / 2;
  const hint = {
    x: world[0].x + parseFloat(hintXEl.value || 0),
    y: world[0].y - parseFloat(hintYEl.value || 0),
    z: world[0].z - parseFloat(hintZEl.value || 0)
  };

  let R;
  const v = { x: world[0].x - hint.x, y: world[0].y - hint.y, z: world[0].z - hint.z };
  const yaw = -Math.atan2(v.x, v.z);
  const v1x = Math.cos(yaw) * v.x + Math.sin(yaw) * v.z;
  const v1z = -Math.sin(yaw) * v.x + Math.cos(yaw) * v.z;
  const pitch = -Math.atan2(v.y, v1z);
  R = rotMatrix(yaw, pitch, 0);

  const p = projectPoint(world[0], hint, R, f, cx, cy);
  if (!p) return null;

  const s = state.view.scale;
  const ox = state.view.offsetX;
  const oy = state.view.offsetY;
  return { x: p.x * s + ox, y: p.y * s + oy };
}

canvas.addEventListener("click", (e) => {
  if (!state.img) return;
  if (state.points.length >= 3) return;
  if (state.isPanning) return;
  const rect = canvas.getBoundingClientRect();
  const mx = e.clientX - rect.left;
  const my = e.clientY - rect.top;
  const imgPt = screenToImage(mx, my);
  if (imgPt.x < 0 || imgPt.y < 0 || imgPt.x > state.img.width || imgPt.y > state.img.height) return;
  const newPt = { x: addNoise(imgPt.x, state.noiseSigma), y: addNoise(imgPt.y, state.noiseSigma) };
  state.points.push(newPt);
  if (state.points.length === 1) {
    const p1Screen = computePhantomP1Screen();
    if (p1Screen) {
      const s = state.view.scale;
      const ox = state.view.offsetX;
      const oy = state.view.offsetY;
      const clickScreen = { x: newPt.x * s + ox, y: newPt.y * s + oy };
      const dx = (clickScreen.x - p1Screen.x) / s;
      const dy = (clickScreen.y - p1Screen.y) / s;
      if (phantomDXEl) phantomDXEl.value = Math.round(dx).toString();
      if (phantomDYEl) phantomDYEl.value = Math.round(dy).toString();
    }
  }
  if (state.points.length >= 3 && cursorCross) {
    cursorCross.style.display = "none";
  }
  renderPoints();
});

canvas.addEventListener("contextmenu", (e) => e.preventDefault());
canvas.addEventListener("mousedown", (e) => {
  if (!state.img) return;
  if (e.button === 2 || e.shiftKey) {
    state.isPanning = true;
    state.panStart.x = e.clientX;
    state.panStart.y = e.clientY;
    state.panOrigin.x = state.view.offsetX;
    state.panOrigin.y = state.view.offsetY;
  }
});
window.addEventListener("mouseup", () => { state.isPanning = false; });
window.addEventListener("mousemove", (e) => {
  if (cursorCross) {
    if (state.points.length >= 3) {
      cursorCross.style.display = "none";
      return;
    }
    const rect = canvas.getBoundingClientRect();
    const mx = e.clientX - rect.left;
    const my = e.clientY - rect.top;
    cursorCross.style.left = `${mx}px`;
    cursorCross.style.top = `${my}px`;
    cursorCross.style.display = "block";
  }
  if (!state.isPanning) return;
  const dx = e.clientX - state.panStart.x;
  const dy = e.clientY - state.panStart.y;
  state.view.offsetX = state.panOrigin.x + dx;
  state.view.offsetY = state.panOrigin.y + dy;
  renderPoints();
});

canvas.addEventListener("mouseleave", () => {
  if (cursorCross) cursorCross.style.display = "none";
});

canvas.addEventListener("wheel", (e) => {
  if (!state.img) return;
  e.preventDefault();
  const rect = canvas.getBoundingClientRect();
  const mx = e.clientX - rect.left;
  const my = e.clientY - rect.top;
  const before = screenToImage(mx, my);
  const zoom = e.deltaY < 0 ? 1.1 : 0.9;
  state.view.scale = Math.max(0.05, Math.min(20, state.view.scale * zoom));
  state.view.offsetX = mx - before.x * state.view.scale;
  state.view.offsetY = my - before.y * state.view.scale;
  renderPoints();
}, { passive: false });

clearPointsBtn.addEventListener("click", () => {
  state.points = [];
  renderPoints();
  resultEl.textContent = "—";
  reprojEl.textContent = "—";
});


function buildWorldTriangle(d12, d13, d23) {
  const P1 = { x: 0, y: 0, z: 0 };
  const P2 = { x: d12, y: 0, z: 0 };
  const x3 = (d12*d12 + d13*d13 - d23*d23) / (2 * d12);
  const y3sq = Math.max(0, d13*d13 - x3*x3);
  const y3 = Math.sqrt(y3sq);
  const P3 = { x: x3, y: y3, z: 0 };
  return [P1, P2, P3];
}

function rotMatrix(yaw, pitch, roll) {
  const cy = Math.cos(yaw), sy = Math.sin(yaw);
  const cp = Math.cos(pitch), sp = Math.sin(pitch);
  const cr = Math.cos(roll), sr = Math.sin(roll);

  // R = Rz(roll) * Rx(pitch) * Ry(yaw)
  const r00 = cy*cr + sy*sp*sr;
  const r01 = sr*cp;
  const r02 = -sy*cr + cy*sp*sr;

  const r10 = -cy*sr + sy*sp*cr;
  const r11 = cr*cp;
  const r12 = sr*sy + cy*sp*cr;

  const r20 = sy*cp;
  const r21 = -sp;
  const r22 = cy*cp;

  return [
    r00, r01, r02,
    r10, r11, r12,
    r20, r21, r22
  ];
}

function projectPoint(P, C, R, f, cx, cy) {
  const X = P.x - C.x;
  const Y = P.y - C.y;
  const Z = P.z - C.z;

  const x = R[0]*X + R[1]*Y + R[2]*Z;
  const y = R[3]*X + R[4]*Y + R[5]*Z;
  const z = R[6]*X + R[7]*Y + R[8]*Z;

  if (z <= 1e-6) return null;

  return {
    x: f * (x / z) + cx,
    y: f * (y / z) + cy
  };
}

function buildObsDirsFromDistances(imagePts, f) {
  const r2 = Math.hypot(imagePts[1].x - imagePts[0].x, imagePts[1].y - imagePts[0].y);
  const r3 = Math.hypot(imagePts[2].x - imagePts[0].x, imagePts[2].y - imagePts[0].y);
  const r23 = Math.hypot(imagePts[2].x - imagePts[1].x, imagePts[2].y - imagePts[1].y);
  if (r2 < 1e-6 || r3 < 1e-6) return null;

  const alpha2 = Math.atan2(r2, f);
  const alpha3 = Math.atan2(r3, f);
  const cosPhi = (r2*r2 + r3*r3 - r23*r23) / (2 * r2 * r3);
  const phi = Math.acos(Math.max(-1, Math.min(1, cosPhi)));

  const d1 = { x: 0, y: 0, z: 1 };
  const d2 = (() => {
    const x = Math.tan(alpha2);
    const z = 1;
    const len = Math.hypot(x, 0, z);
    return { x: x / len, y: 0, z: z / len };
  })();
  const d3 = (() => {
    const x = Math.tan(alpha3) * Math.cos(phi);
    const y = Math.tan(alpha3) * Math.sin(phi);
    const z = 1;
    const len = Math.hypot(x, y, z);
    return { x: x / len, y: y / len, z: z / len };
  })();

  return [d1, d2, d3];
}

function estimateCameraFromBearings(points, dirs) {
  const A = [
    [0,0,0],
    [0,0,0],
    [0,0,0]
  ];
  const b = [0,0,0];

  for (let i = 0; i < points.length; i++) {
    const d = dirs[i];
    const m = [
      [1 - d.x*d.x, -d.x*d.y,   -d.x*d.z],
      [-d.y*d.x,    1 - d.y*d.y, -d.y*d.z],
      [-d.z*d.x,    -d.z*d.y,   1 - d.z*d.z]
    ];
    for (let r = 0; r < 3; r++) {
      for (let c = 0; c < 3; c++) A[r][c] += m[r][c];
    }
    b[0] += m[0][0]*points[i].x + m[0][1]*points[i].y + m[0][2]*points[i].z;
    b[1] += m[1][0]*points[i].x + m[1][1]*points[i].y + m[1][2]*points[i].z;
    b[2] += m[2][0]*points[i].x + m[2][1]*points[i].y + m[2][2]*points[i].z;
  }

  const det =
    A[0][0]*(A[1][1]*A[2][2]-A[1][2]*A[2][1]) -
    A[0][1]*(A[1][0]*A[2][2]-A[1][2]*A[2][0]) +
    A[0][2]*(A[1][0]*A[2][1]-A[1][1]*A[2][0]);
  if (Math.abs(det) < 1e-9) return null;

  const inv = [
    [
      (A[1][1]*A[2][2]-A[1][2]*A[2][1]) / det,
      (A[0][2]*A[2][1]-A[0][1]*A[2][2]) / det,
      (A[0][1]*A[1][2]-A[0][2]*A[1][1]) / det
    ],
    [
      (A[1][2]*A[2][0]-A[1][0]*A[2][2]) / det,
      (A[0][0]*A[2][2]-A[0][2]*A[2][0]) / det,
      (A[0][2]*A[1][0]-A[0][0]*A[1][2]) / det
    ],
    [
      (A[1][0]*A[2][1]-A[1][1]*A[2][0]) / det,
      (A[0][1]*A[2][0]-A[0][0]*A[2][1]) / det,
      (A[0][0]*A[1][1]-A[0][1]*A[1][0]) / det
    ]
  ];

  return {
    x: inv[0][0]*b[0] + inv[0][1]*b[1] + inv[0][2]*b[2],
    y: inv[1][0]*b[0] + inv[1][1]*b[1] + inv[1][2]*b[2],
    z: inv[2][0]*b[0] + inv[2][1]*b[1] + inv[2][2]*b[2]
  };
}

function buildObsDirs(imagePts, f) {
  const cx = (imagePts[0].x + imagePts[1].x + imagePts[2].x) / 3;
  const cy = (imagePts[0].y + imagePts[1].y + imagePts[2].y) / 3;
  const dirs = [];
  for (const p of imagePts) {
    const dx = p.x - cx;
    const dy = p.y - cy;
    const dz = f;
    const len = Math.hypot(dx, dy, dz) || 1;
    dirs.push({ x: dx / len, y: dy / len, z: dz / len });
  }
  return dirs;
}

function angleError(C, world, obsDirs) {
  const dirs = world.map(p => {
    const dx = p.x - C.x;
    const dy = p.y - C.y;
    const dz = p.z - C.z;
    const len = Math.hypot(dx, dy, dz) || 1;
    return { x: dx / len, y: dy / len, z: dz / len };
  });
  const pairs = [
    [0, 1],
    [0, 2],
    [1, 2]
  ];
  let err = 0;
  for (const [i, j] of pairs) {
    const od = obsDirs[i].x * obsDirs[j].x + obsDirs[i].y * obsDirs[j].y + obsDirs[i].z * obsDirs[j].z;
    const wd = dirs[i].x * dirs[j].x + dirs[i].y * dirs[j].y + dirs[i].z * dirs[j].z;
    const oa = Math.acos(Math.max(-1, Math.min(1, od)));
    const wa = Math.acos(Math.max(-1, Math.min(1, wd)));
    const d = oa - wa;
    err += d * d;
  }
  return err / 3;
}

function reprojectionError(params, world, imagePts, f, cx, cy) {
  const C = { x: params[0], y: params[1], z: params[2] };
  const R = rotMatrix(params[3], params[4], params[5]);

  let err = 0;
  for (let i = 0; i < 3; i++) {
    const p = projectPoint(world[i], C, R, f, cx, cy);
    if (!p) return 1e9;
    const dx = p.x - imagePts[i].x;
    const dy = p.y - imagePts[i].y;
    err += dx*dx + dy*dy;
  }
  return err / 3;
}

function solvePose(world, imagePts, f, cx, cy, hint = null) {
  // Initial guess: camera above triangle, looking at centroid
  const centroid = {
    x: (world[0].x + world[1].x + world[2].x) / 3,
    y: (world[0].y + world[1].y + world[2].y) / 3,
    z: 0
  };

  const w12 = Math.hypot(world[1].x - world[0].x, world[1].y - world[0].y);
  const w13 = Math.hypot(world[2].x - world[0].x, world[2].y - world[0].y);
  const w23 = Math.hypot(world[2].x - world[1].x, world[2].y - world[1].y);
  const worldSize = (w12 + w13 + w23) / 3;

  const i12 = Math.hypot(imagePts[1].x - imagePts[0].x, imagePts[1].y - imagePts[0].y);
  const i13 = Math.hypot(imagePts[2].x - imagePts[0].x, imagePts[2].y - imagePts[0].y);
  const i23 = Math.hypot(imagePts[2].x - imagePts[1].x, imagePts[2].y - imagePts[1].y);
  const imgSize = (i12 + i13 + i23) / 3;

  const z0 = (imgSize > 1e-6) ? (f * worldSize / imgSize) : (5 * worldSize);

  const zGuesses = [z0, 0.6 * z0, 1.5 * z0, -z0];
  const guesses = [];
  for (const zg of zGuesses) {
    const Cx = centroid.x;
    const Cy = centroid.y;
    const Cz = zg;
    const v = { x: centroid.x - Cx, y: centroid.y - Cy, z: centroid.z - Cz };
    const yaw = -Math.atan2(v.x, v.z);
    const v1x = Math.cos(yaw) * v.x + Math.sin(yaw) * v.z;
    const v1z = -Math.sin(yaw) * v.x + Math.cos(yaw) * v.z;
    const pitch = -Math.atan2(v.y, v1z);
    guesses.push([Cx, Cy, Cz, yaw, pitch, 0]);
  }
  if (hint) {
    guesses.unshift([hint.x, hint.y, hint.z, 0, 0, 0]);
  }

  let bestParams = null;
  let bestErr = 1e9;

  for (const g of guesses) {
    let params = g.slice();
    let step = [1, 1, 1, 0.05, 0.05, 0.05];
    let best = reprojectionError(params, world, imagePts, f, cx, cy);

    for (let iter = 0; iter < 250; iter++) {
      let improved = false;
      for (let k = 0; k < params.length; k++) {
        const p1 = params.slice();
        p1[k] += step[k];
        const e1 = reprojectionError(p1, world, imagePts, f, cx, cy);
        if (e1 < best) {
          params = p1;
          best = e1;
          improved = true;
          continue;
        }
        const p2 = params.slice();
        p2[k] -= step[k];
        const e2 = reprojectionError(p2, world, imagePts, f, cx, cy);
        if (e2 < best) {
          params = p2;
          best = e2;
          improved = true;
        }
      }
      if (!improved) step = step.map(s => s * 0.6);
    }

    if (best < bestErr) {
      bestErr = best;
      bestParams = params;
    }
  }

  return { params: bestParams, error: Math.sqrt(bestErr) };
}

function solvePoseAngleOnly(world, imagePts, f, hint = null) {
  const obsDirs = buildObsDirs(imagePts, f);
  const w12 = Math.hypot(world[1].x - world[0].x, world[1].y - world[0].y);
  const w13 = Math.hypot(world[2].x - world[0].x, world[2].y - world[0].y);
  const w23 = Math.hypot(world[2].x - world[1].x, world[2].y - world[1].y);
  const worldSize = (w12 + w13 + w23) / 3;

  const i12 = Math.hypot(imagePts[1].x - imagePts[0].x, imagePts[1].y - imagePts[0].y);
  const i13 = Math.hypot(imagePts[2].x - imagePts[0].x, imagePts[2].y - imagePts[0].y);
  const i23 = Math.hypot(imagePts[2].x - imagePts[1].x, imagePts[2].y - imagePts[1].y);
  const imgSize = (i12 + i13 + i23) / 3;

  const z0 = (imgSize > 1e-6) ? (f * worldSize / imgSize) : (5 * worldSize);
  const centroid = {
    x: (world[0].x + world[1].x + world[2].x) / 3,
    y: (world[0].y + world[1].y + world[2].y) / 3,
    z: 0
  };

  const guesses = [];
  const zGuesses = [z0, 0.6 * z0, 1.5 * z0, -z0];
  for (const zg of zGuesses) {
    guesses.push({ x: centroid.x, y: centroid.y, z: zg });
  }
  if (hint) guesses.unshift({ x: hint.x, y: hint.y, z: hint.z });

  let bestC = null;
  let bestErr = 1e9;
  for (const g of guesses) {
    let C = { ...g };
    let step = { x: 5, y: 5, z: 5 };
    let best = angleError(C, world, obsDirs);
    for (let iter = 0; iter < 250; iter++) {
      let improved = false;
      const axes = ["x", "y", "z"];
      for (const ax of axes) {
        const c1 = { ...C }; c1[ax] += step[ax];
        const e1 = angleError(c1, world, obsDirs);
        if (e1 < best) { C = c1; best = e1; improved = true; continue; }
        const c2 = { ...C }; c2[ax] -= step[ax];
        const e2 = angleError(c2, world, obsDirs);
        if (e2 < best) { C = c2; best = e2; improved = true; }
      }
      if (!improved) {
        step.x *= 0.6; step.y *= 0.6; step.z *= 0.6;
      }
    }
    if (best < bestErr) {
      bestErr = best;
      bestC = C;
    }
  }
  return { params: bestC ? [bestC.x, bestC.y, bestC.z] : null, error: Math.sqrt(bestErr) };
}

function permutePoints(pts) {
  return [
    [pts[0], pts[1], pts[2]],
    [pts[0], pts[2], pts[1]],
    [pts[1], pts[0], pts[2]],
    [pts[1], pts[2], pts[0]],
    [pts[2], pts[0], pts[1]],
    [pts[2], pts[1], pts[0]]
  ];
}

function pickBestAuto(world, pts, fMin, fMax, fStep, cx, cy, hint = null, angleOnly = false) {
  let best = { err: 1e9, params: null, f: null, perm: null };
  const perms = permutePoints(pts);
  for (const perm of perms) {
    for (let f = fMin; f <= fMax; f += fStep) {
      const res = angleOnly
        ? solvePoseAngleOnly(world, perm, f, hint)
        : solvePose(world, perm, f, cx, cy, hint);
      if (!res.params || !Number.isFinite(res.error)) continue;
      // small tolerance for imperfect clicks
      const score = res.error;
      if (score < best.err) {
        best = { err: score, params: res.params, f, perm };
      }
    }
  }
  return best;
}

solveBtn.addEventListener("click", () => {
  if (state.points.length !== 3) {
    resultEl.textContent = "Нужно 3 точки на изображении.";
    return;
  }

  const d12 = parseFloat(d12El.value);
  const d13 = parseFloat(d13El.value);
  const d23 = parseFloat(d23El.value);
  if (![d12, d13, d23].every(v => v > 0)) {
    resultEl.textContent = "Неверные расстояния между маркерами.";
    return;
  }

  const world = buildWorldTriangle(d12, d13, d23);
  const f = parseFloat(focalEl.value);
  const cx = state.img.width / 2;
  const cy = state.img.height / 2;

  const hint = {
    x: world[0].x + parseFloat(hintXEl.value || 0),
    y: world[0].y - parseFloat(hintYEl.value || 0),
    z: world[0].z - parseFloat(hintZEl.value || 0)
  };
  const angleOnly = !!angleOnlyEl?.checked;
  const p1Centered = !!p1CenteredEl?.checked;

  let res;
  if (p1Centered) {
    const dirs = buildObsDirsFromDistances(state.points, f);
    if (!dirs) {
      resultEl.textContent = "Нужны корректные расстояния между точками.";
      reprojEl.textContent = "—";
      return;
    }
    const C = estimateCameraFromBearings(world, dirs);
    if (!C) {
      resultEl.textContent = "Не удалось оценить позицию по расстояниям.";
      reprojEl.textContent = "—";
      return;
    }
    res = { params: [C.x, C.y, C.z], error: 0 };
  } else {
    res = angleOnly
      ? solvePoseAngleOnly(world, state.points, f, hint)
      : solvePose(world, state.points, f, cx, cy, hint);
  }
  if (!res.params || !Number.isFinite(res.error)) {
    resultEl.textContent = "Не удалось оценить позицию. Попробуй другой фокус или точнее выбрать точки.";
    reprojEl.textContent = "—";
    return;
  }
  const C = { x: res.params[0], y: res.params[1], z: res.params[2] };
  const Cy = -C.y;
  const Cz = -C.z;

  const distToPlane = Math.abs(Cz);
  const distToP1 = Math.hypot(C.x - world[0].x, Cy - world[0].y, Cz - world[0].z);
  const distToP2 = Math.hypot(C.x - world[1].x, Cy - world[1].y, Cz - world[1].z);
  const distToP3 = Math.hypot(C.x - world[2].x, Cy - world[2].y, Cz - world[2].z);

  const v1 = {
    x: world[0].x - C.x,
    y: world[0].y - Cy,
    z: world[0].z - Cz
  };

  resultEl.textContent =
    `C≈(${C.x.toFixed(2)}, ${Cy.toFixed(2)}, ${Cz.toFixed(2)}) м | ` +
    `до плоскости ≈ ${distToPlane.toFixed(2)} м | ` +
    `до P1/P2/P3 ≈ ${distToP1.toFixed(2)} / ${distToP2.toFixed(2)} / ${distToP3.toFixed(2)} м | ` +
    `вектор до P1 (желт.) = (${v1.x.toFixed(2)}, ${v1.y.toFixed(2)}, ${v1.z.toFixed(2)}) м`;
  reprojEl.textContent = `${res.error.toFixed(2)} px`;
});

autoSolveBtn.addEventListener("click", () => {
  if (state.points.length !== 3) {
    resultEl.textContent = "Нужно 3 точки на изображении.";
    return;
  }
  if (!state.img) return;

  const d12 = parseFloat(d12El.value);
  const d13 = parseFloat(d13El.value);
  const d23 = parseFloat(d23El.value);
  if (![d12, d13, d23].every(v => v > 0)) {
    resultEl.textContent = "Неверные расстояния между маркерами.";
    return;
  }

  const world = buildWorldTriangle(d12, d13, d23);
  const cx = state.img.width / 2;
  const cy = state.img.height / 2;

  const hint = {
    x: world[0].x + parseFloat(hintXEl.value || 0),
    y: world[0].y - parseFloat(hintYEl.value || 0),
    z: world[0].z - parseFloat(hintZEl.value || 0)
  };
  const angleOnly = !!angleOnlyEl?.checked;
  const p1Centered = !!p1CenteredEl?.checked;
  if (p1Centered) {
    resultEl.textContent = "Для режима P1 в центре используйте «Рассчитать».";
    reprojEl.textContent = "—";
    return;
  }
  const best = pickBestAuto(world, state.points, 400, 2600, 40, cx, cy, hint, angleOnly);
  if (!best.params) {
    resultEl.textContent = "Автоподбор не нашёл решение. Попробуй точнее кликнуть или изменить фокус.";
    reprojEl.textContent = "—";
    return;
  }

  // apply best permutation and focal to UI
  state.points = best.perm.map(p => ({ x: p.x, y: p.y }));
  renderPoints();
  focalEl.value = Math.round(best.f);
  focalVal.textContent = focalEl.value;

  const C = { x: best.params[0], y: best.params[1], z: best.params[2] };
  const Cy = -C.y;
  const Cz = -C.z;
  const distToPlane = Math.abs(Cz);
  const distToP1 = Math.hypot(C.x - world[0].x, Cy - world[0].y, Cz - world[0].z);
  const distToP2 = Math.hypot(C.x - world[1].x, Cy - world[1].y, Cz - world[1].z);
  const distToP3 = Math.hypot(C.x - world[2].x, Cy - world[2].y, Cz - world[2].z);
  const v1 = { x: world[0].x - C.x, y: world[0].y - Cy, z: world[0].z - Cz };

  resultEl.textContent =
    `C≈(${C.x.toFixed(2)}, ${Cy.toFixed(2)}, ${Cz.toFixed(2)}) м | ` +
    `до плоскости ≈ ${distToPlane.toFixed(2)} м | ` +
    `до P1/P2/P3 ≈ ${distToP1.toFixed(2)} / ${distToP2.toFixed(2)} / ${distToP3.toFixed(2)} м | ` +
    `вектор до P1 (желт.) = (${v1.x.toFixed(2)}, ${v1.y.toFixed(2)}, ${v1.z.toFixed(2)}) м`;
  reprojEl.textContent = `${best.err.toFixed(2)} px`;
});

window.addEventListener("resize", () => {
  if (!state.img) return;
  resizeCanvas();
});
