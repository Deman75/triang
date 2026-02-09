import * as THREE from "three";
import { OrbitControls } from "three/addons/controls/OrbitControls.js";
import { TransformControls } from "three/addons/controls/TransformControls.js";
import GUI from "lil-gui";

import { addNoise, trilaterate3, localFrame, toLocalXYZ } from "./math.js";

const renderer = new THREE.WebGLRenderer({ antialias: true });
renderer.setSize(window.innerWidth, window.innerHeight);
renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
document.body.appendChild(renderer.domElement);

const scene = new THREE.Scene();
scene.background = new THREE.Color(0x0b1220);

const camera = new THREE.PerspectiveCamera(60, window.innerWidth / window.innerHeight, 0.1, 5000);

const droneCam = new THREE.PerspectiveCamera(60, 1, 0.1, 5000);

const controls = new OrbitControls(camera, renderer.domElement);
controls.enableDamping = true;
controls.target.set(20, 0, 20);

scene.add(new THREE.AmbientLight(0xffffff, 0.35));
const dir = new THREE.DirectionalLight(0xffffff, 0.9);
dir.position.set(200, 300, 250);
scene.add(dir);

const grid = new THREE.GridHelper(500, 50, 0x244057, 0x162333);
const axes = new THREE.AxesHelper(80);
scene.add(grid);
scene.add(axes);

function makeSphere(color, r=3.5) {
  const g = new THREE.SphereGeometry(r, 32, 16);
  const m = new THREE.MeshStandardMaterial({
    color,
    roughness: 0.25,
    metalness: 0.1,
    emissive: new THREE.Color(color).multiplyScalar(0.12)
  });
  return new THREE.Mesh(g, m);
}

// Ground beacons (y=0)
const P1 = makeSphere(0xffcc00, 3.8); P1.position.set(0, 0, 0);   scene.add(P1);
const P2 = makeSphere(0x00d1ff, 3.8); P2.position.set(20, 0, 0);  scene.add(P2);
const P3 = makeSphere(0xff4d7d, 3.8); P3.position.set(20, 0, 50); scene.add(P3);

// Aerial point
const A  = makeSphere(0x88ff88, 4.6); A.position.set(10, 100, -300); scene.add(A);

// Initial view: near A, looking toward beacons
const groundCenter = P1.position.clone().add(P2.position).add(P3.position).multiplyScalar(1 / 3);
const toBeacons = groundCenter.clone().sub(A.position).normalize();
const camDist = 120;
const camLift = 40;
camera.position.copy(
  A.position.clone()
    .add(toBeacons.clone().multiplyScalar(-camDist))
    .add(new THREE.Vector3(0, camLift, 0))
);
camera.lookAt(groundCenter.clone().add(new THREE.Vector3(0, 10, 0)));

// Transform controls
const tctrl = new TransformControls(camera, renderer.domElement);
tctrl.setMode("translate");
tctrl.addEventListener("dragging-changed", (e) => { controls.enabled = !e.value; });
scene.add(tctrl);

const draggable = [P1, P2, P3, A];
let selected = null;

const raycaster = new THREE.Raycaster();
const mouse = new THREE.Vector2();

window.addEventListener("pointerdown", (ev) => {
  const rect = renderer.domElement.getBoundingClientRect();
  mouse.x = ((ev.clientX - rect.left) / rect.width) * 2 - 1;
  mouse.y = -(((ev.clientY - rect.top) / rect.height) * 2 - 1);
  raycaster.setFromCamera(mouse, camera);
  const hits = raycaster.intersectObjects(draggable, false);
  if (hits.length) {
    selected = hits[0].object;
    tctrl.attach(selected);
    cachePos(selected);
    updateGizmoAxes();
  }
});

const state = {
  moveMode: "GROUND",     // GROUND or HEIGHT
  noiseMeters: 0.0,
  smoothWindow: 12,
  snapGroundY: true,
  snapAerialMinY: true,
  detach: () => { tctrl.detach(); selected = null; }
};

const gui = new GUI({ title: "Параметры" });
const moveCtrl = gui.add(state, "moveMode", ["GROUND", "HEIGHT"]).name("Режим перемещения");
gui.add(state, "noiseMeters", 0, 5, 0.01).name("Шум дистанции (м)");
gui.add(state, "smoothWindow", 1, 40, 1).name("Сглаживание (окон)");
gui.add(state, "snapGroundY").name("Маяки на земле");
gui.add(state, "snapAerialMinY").name("A выше земли");
gui.add(state, "detach").name("Снять выбор");

function updateGizmoAxes() {
  if (selected === A) {
    tctrl.showX = true;
    tctrl.showY = true;
    tctrl.showZ = true;
    return;
  }
  if (state.moveMode === "GROUND") {
    tctrl.showX = true;
    tctrl.showY = false;
    tctrl.showZ = true;
  } else {
    tctrl.showX = false;
    tctrl.showY = true;
    tctrl.showZ = false;
  }
}
updateGizmoAxes();
moveCtrl.onChange(updateGizmoAxes);

// Axis locking by restoring locked components each frame
const prev = new Map();
function cachePos(obj) { prev.set(obj, obj.position.clone()); }
draggable.forEach(cachePos);

function lockAxes() {
  if (!selected) return;
  if (selected === A) return; // allow free 3D movement for aerial point
  const p0 = prev.get(selected) || selected.position.clone();
  if (state.moveMode === "GROUND") selected.position.y = p0.y;  // lock Y (ground plane)
  if (state.moveMode === "HEIGHT") { selected.position.x = p0.x; selected.position.z = p0.z; } // lock XZ (height only)
}

function applyConstraints() {
  if (state.snapGroundY) { P1.position.y = 0; P2.position.y = 0; P3.position.y = 0; }
  if (state.snapAerialMinY) A.position.y = Math.max(0, A.position.y);
}

// ---------- math ----------
const elTrue = document.getElementById("truePos");
const elEst  = document.getElementById("estPos");
const elErr  = document.getElementById("errPos");
const elRan  = document.getElementById("ranges");
const elLoc  = document.getElementById("localPos");
const elFd   = document.getElementById("f_d");
const elFex  = document.getElementById("f_ex");
const elFi   = document.getElementById("f_i");
const elFj   = document.getElementById("f_j");
const elFx   = document.getElementById("f_x");
const elFy   = document.getElementById("f_y");
const elFz   = document.getElementById("f_z");
const elFp   = document.getElementById("f_p");
const elInsetFrame = document.getElementById("insetFrame");
const elInsetLabel = document.getElementById("insetLabel");

const fmt = (v) => `(${v.x.toFixed(2)}, ${v.y.toFixed(2)}, ${v.z.toFixed(2)})`;
const dist = (a,b) => a.clone().sub(b).length();
const fmt1 = (n) => Number.isFinite(n) ? n.toFixed(3) : "—";
const fmt3 = (v) => `(${fmt1(v.x)}, ${fmt1(v.y)}, ${fmt1(v.z)})`;

// Simple moving average buffers
const smooth = {
  r1: [],
  r2: [],
  r3: [],
  pos: []
};

function pushAndAverage(buf, value, maxLen) {
  buf.push(value);
  while (buf.length > maxLen) buf.shift();
  let sum = 0;
  for (let i = 0; i < buf.length; i++) sum += buf[i];
  return sum / buf.length;
}

function pushAndAverageVec3(buf, v, maxLen) {
  buf.push(v.clone());
  while (buf.length > maxLen) buf.shift();
  const out = new THREE.Vector3();
  for (let i = 0; i < buf.length; i++) out.add(buf[i]);
  return out.divideScalar(buf.length || 1);
}

function animate() {
  requestAnimationFrame(animate);
  controls.update();

  lockAxes();
  applyConstraints();

  // ranges with optional noise + smoothing
  const rawR1 = addNoise(dist(A.position, P1.position), state.noiseMeters);
  const rawR2 = addNoise(dist(A.position, P2.position), state.noiseMeters);
  const rawR3 = addNoise(dist(A.position, P3.position), state.noiseMeters);

  const win = Math.max(1, Math.floor(state.smoothWindow));
  const r1 = pushAndAverage(smooth.r1, rawR1, win);
  const r2 = pushAndAverage(smooth.r2, rawR2, win);
  const r3 = pushAndAverage(smooth.r3, rawR3, win);

  const res = trilaterate3(THREE, P1.position, r1, P2.position, r2, P3.position, r3);

  // ----- formula values -----
  const ex = P2.position.clone().sub(P1.position);
  const d = ex.length();
  const exn = d > 1e-9 ? ex.clone().divideScalar(d) : new THREE.Vector3();
  const p3p1 = P3.position.clone().sub(P1.position);
  const iVal = exn.dot(p3p1);
  const tmp = p3p1.clone().sub(exn.clone().multiplyScalar(iVal));
  const tlen = tmp.length();
  const eyn = tlen > 1e-9 ? tmp.clone().divideScalar(tlen) : new THREE.Vector3();
  const jVal = eyn.dot(p3p1);

  const xVal = (r1*r1 - r2*r2 + d*d) / (2*d);
  const yVal = (r1*r1 - r3*r3 + iVal*iVal + jVal*jVal - 2*iVal*xVal) / (2*jVal);
  const zVal = Math.sqrt(Math.max(0, r1*r1 - xVal*xVal - yVal*yVal));

  elFd.textContent  = fmt1(d);
  elFex.textContent = fmt3(exn);
  elFi.textContent  = fmt1(iVal);
  elFj.textContent  = fmt1(jVal);
  elFx.textContent  = fmt1(xVal);
  elFy.textContent  = fmt1(yVal);
  elFz.textContent  = fmt1(zVal);

  elTrue.textContent = fmt(A.position);
  elRan.textContent  = `r1=${r1.toFixed(2)} м, r2=${r2.toFixed(2)} м, r3=${r3.toFixed(2)} м`;

  if (res.ok) {
    const pSmooth = pushAndAverageVec3(smooth.pos, res.p, win);
    elEst.textContent = fmt(pSmooth);
    elErr.textContent = `${pSmooth.clone().sub(A.position).length().toFixed(2)} м`;

    const fr = localFrame(THREE, P1.position, P2.position, P3.position);
    if (fr.ok) {
      const lp = toLocalXYZ(fr, pSmooth);
      elLoc.textContent = `x=${lp.x.toFixed(2)} м, y=${lp.y.toFixed(2)} м, z=${lp.z.toFixed(2)} м`;
    } else {
      elLoc.textContent = `— (${fr.msg})`;
    }

    elFp.textContent = fmt(pSmooth);
  } else {
    elEst.textContent = `— (${res.msg})`;
    elErr.textContent = "—";
    elLoc.textContent = "—";
    elFp.textContent = "—";
  }

  // update cached positions for axis locking
  draggable.forEach(obj => prev.set(obj, obj.position.clone()));

  renderer.setScissorTest(false);
  renderer.setViewport(0, 0, window.innerWidth, window.innerHeight);
  renderer.render(scene, camera);

  // Inset view from point A
  const insetSize = Math.min(240, Math.floor(window.innerWidth * 0.28));
  const pad = 18;
  const lift = 120;
  const x = pad;
  const y = pad + lift;

  if (elInsetFrame) {
    elInsetFrame.style.left = `${x}px`;
    elInsetFrame.style.bottom = `${y}px`;
    elInsetFrame.style.width = `${insetSize}px`;
    elInsetFrame.style.height = `${insetSize}px`;
  }
  if (elInsetLabel) {
    elInsetLabel.style.left = `${x}px`;
    elInsetLabel.style.bottom = `${y + insetSize + 8}px`;
  }

  const prevAVisible = A.visible;
  const prevAxesVisible = axes.visible;
  const prevCtrlVisible = tctrl.visible;
  A.visible = false;
  axes.visible = false;
  tctrl.visible = false;

  droneCam.position.copy(A.position);
  const groundCenter = P1.position.clone().add(P2.position).add(P3.position).multiplyScalar(1 / 3);
  droneCam.lookAt(groundCenter);
  droneCam.up.set(0, 1, 0);
  droneCam.aspect = 1;
  droneCam.updateProjectionMatrix();

  renderer.clearDepth();
  renderer.setScissorTest(true);
  renderer.setViewport(x, y, insetSize, insetSize);
  renderer.setScissor(x, y, insetSize, insetSize);
  renderer.render(scene, droneCam);
  renderer.setScissorTest(false);
  renderer.setViewport(0, 0, window.innerWidth, window.innerHeight);

  A.visible = prevAVisible;
  axes.visible = prevAxesVisible;
  tctrl.visible = prevCtrlVisible;
}
animate();

window.addEventListener("resize", () => {
  camera.aspect = window.innerWidth / window.innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(window.innerWidth, window.innerHeight);
});
