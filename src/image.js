import { buildTriangle, solvePosition, projectCentered, cameraToBeaconFrame, beaconToCameraFrame, directionToP1 } from "./geometry.js";
import { readCalibration, calibrationMatches } from "./calibration-profile.js";
import { detectMarkers } from "./marker-detection.js";

const el = id => document.getElementById(id);
const canvas = el("imgCanvas"), ctx = canvas.getContext("2d");
const wrap = document.querySelector(".canvas-wrap");
const colors = ["#ffcc00", "#4f8cff", "#d46bd5"];
const state = {
  img: null, points: [], view: {scale: 1, offsetX: 0, offsetY: 0},
  pan: null, dragged: false, autoAlignP1: true, focalSource: "mm"
};
const value = id => Number(el(id).value);
const worldTriangle = () => buildTriangle(value("d12"), value("d13"), value("d23"));
const hintPosition = () => cameraToBeaconFrame({x:value("hintX"), y:value("hintY"), z:value("hintZ")});
const center = () => ({x:state.img.width/2, y:state.img.height/2});
const screenToImage = (x,y) => ({
  x:(x-state.view.offsetX)/state.view.scale, y:(y-state.view.offsetY)/state.view.scale
});
function resetResult() {
  el("result").textContent = "Параметры изменены. Нажмите «Рассчитать».";
  el("reproj").textContent = "—";
}
function fitImage() {
  if (!state.img) return;
  const scale = Math.min(canvas.width/state.img.width,canvas.height/state.img.height);
  state.view = {scale,offsetX:(canvas.width-state.img.width*scale)/2,offsetY:(canvas.height-state.img.height*scale)/2};
}
function resizeCanvas() {
  const rect = wrap.getBoundingClientRect();
  canvas.width = Math.max(1,Math.floor(rect.width));
  canvas.height = Math.max(1,Math.floor(rect.height));
  fitImage();
  renderPoints();
}
function updateFocalPreview() {
  const f = value("focalEq"), width = value("sensorW");
  el("focalEqPx").textContent = state.img && f > 0 && width > 0
    ? (f/width*state.img.width).toFixed(1) : "—";
}
function loadImage(img, {useSaved = true} = {}) {
  const previousImage=state.img;
  state.img = img;
  el("imageInfo").textContent=`Исходное изображение: ${img.width} × ${img.height} px.`;
  state.points = [];
  el("detectionStatus").textContent="";
  el("cursorCross").style.display = "none";
  el("overlayHint").style.display = "none";
  if (state.autoAlignP1) {
    el("phantomDX").value = "0";
    el("phantomDY").value = "0";
  }
  resizeCanvas();
  updateFocalPreview();
  if (useSaved) {
    if(state.focalSource==="mm") applyMillimeterFocal();
    else {
      const applied=applySavedCalibration();
      if(!applied && previousImage && (previousImage.width!==img.width || previousImage.height!==img.height))
        el("calibrationStatus").textContent+=" Размер кадра изменился: проверьте фокус в пикселях или примените перевод из мм заново.";
    }
  }
  resetResult();
}

function applySavedCalibration() {
  const profile = readCalibration();
  if (!profile) {
    el("calibrationStatus").textContent = "Сохранённой калибровки нет.";
    return;
  }
  if (!state.img) {
    el("calibrationStatus").textContent = `Сохранено: ${profile.focal.toFixed(2)} px для ${profile.width} × ${profile.height}. Загрузите изображение.`;
    return;
  }
  if (!calibrationMatches(profile,state.img)) {
    el("calibrationStatus").textContent = `Калибровка для ${profile.width} × ${profile.height}, текущий кадр ${state.img.width} × ${state.img.height}. Фокус не применён.`;
    return;
  }
  el("focal").value = profile.focal.toFixed(3);
  state.focalSource="calibration";
  ["d12","d13","d23"].forEach((id,i) => {el(id).value=profile.sides[i];});
  el("calibrationStatus").textContent = "Применены сохранённые фокус и расстояния между маяками.";
  resetResult(); renderPoints();
  return true;
}
el("applySavedCalibration").addEventListener("click",applySavedCalibration);
el("findMarkers").addEventListener("click",()=>{
  try {
    const found=detectMarkers(state.img);
    el("detectionStatus").textContent=found.message;
    if(!found.ok)return;
    state.points=found.points;
    el("cursorCross").style.display="none";canvas.style.cursor="";
    resetResult();renderPoints();
  } catch(error){el("detectionStatus").textContent=error.message;}
});
el("fileInput").addEventListener("change", event => {
  const file = event.target.files[0];
  if (!file) return;
  const url = URL.createObjectURL(file), img = new Image();
  img.onload = () => { URL.revokeObjectURL(url); loadImage(img); };
  img.onerror = () => { URL.revokeObjectURL(url); el("result").textContent = "Не удалось открыть изображение."; };
  img.src = url;
});
function renderPoints() {
  el("findMarkers").disabled = !state.img;
  el("solveBtn").disabled = !state.img || state.points.length !== 3;
  el("markerProgress").textContent = state.points.length === 3
    ? "Выбрано 3 из 3. Можно рассчитать позицию."
    : `Выбрано ${state.points.length} из 3. ${state.img ? "Нажмите «Найти маяки» или выберите их вручную." : "Сначала загрузите фото."}`;
  if (!state.img) return;
  const {scale:s,offsetX:ox,offsetY:oy} = state.view;
  ctx.clearRect(0,0,canvas.width,canvas.height);
  ctx.setTransform(s,0,0,s,ox,oy);
  ctx.drawImage(state.img,0,0);
  ctx.setTransform(1,0,0,1,0,0);
  const idx = Math.min(state.points.length,2);
  el("cursorCross").style.setProperty("--cross-color",colors[idx]);
  el("cursorLabel").textContent = `P${idx+1}`;
  state.points.forEach((p,i) => {
    const x = p.x*s+ox, y = p.y*s+oy;
    ctx.strokeStyle = colors[i]; ctx.fillStyle = colors[i]; ctx.lineWidth = 2;
    ctx.beginPath(); ctx.arc(x,y,8,0,2*Math.PI); ctx.stroke();
    ctx.fillText(`P${i+1}`,x+10,y-6);
  });
  if (!el("showPhantom").checked) return;
  try {
    const position = hintPosition();
    if (![position.x,position.y,position.z].every(Number.isFinite) || position.z <= 0) return;
    const projected = projectCentered(worldTriangle(),position,value("focal"),center(),value("phantomRot"));
    let dx = value("phantomDX"), dy = value("phantomDY");
    if (state.autoAlignP1 && state.points[0]) {
      dx = state.points[0].x-center().x;
      dy = state.points[0].y-center().y;
      el("phantomDX").value = dx.toFixed(2);
      el("phantomDY").value = dy.toFixed(2);
    }
    projected.forEach((p,i) => {
      if (!p) return;
      const x = (p.x+dx)*s+ox, y = (p.y+dy)*s+oy;
      ctx.globalAlpha = 0.6; ctx.strokeStyle = colors[i]; ctx.lineWidth = 2;
      ctx.beginPath(); ctx.moveTo(x-8,y); ctx.lineTo(x+8,y);
      ctx.moveTo(x,y-8); ctx.lineTo(x,y+8); ctx.stroke();
    });
    ctx.globalAlpha = 1;
  } catch {
    // Invalid intermediate form values must not interrupt drawing the photograph.
    ctx.globalAlpha = 1;
  }
}
function addNoise(n) {
  const sigma = value("clickNoise");
  return sigma > 0 ? n+sigma*Math.sqrt(-2*Math.log(Math.max(Math.random(),1e-9)))*Math.cos(2*Math.PI*Math.random()) : n;
}
function mousePosition(event) {
  const rect = canvas.getBoundingClientRect();
  return {x:event.clientX-rect.left,y:event.clientY-rect.top};
}
canvas.addEventListener("click",event => {
  if (!state.img || state.points.length >= 3 || event.shiftKey || state.dragged) return;
  const m = mousePosition(event), p = screenToImage(m.x,m.y);
  if (p.x < 0 || p.y < 0 || p.x >= state.img.width || p.y >= state.img.height) return;
  state.points.push({x:addNoise(p.x),y:addNoise(p.y)});
  el("detectionStatus").textContent="Точки выбраны вручную.";
  if (state.points.length === 3) el("cursorCross").style.display = "none";
  resetResult();
  renderPoints();
});
canvas.addEventListener("contextmenu",event => event.preventDefault());
canvas.addEventListener("mousedown",event => {
  state.dragged = false;
  if (!state.img || !(event.button === 2 || event.shiftKey)) return;
  event.preventDefault();
  state.pan = {x:event.clientX,y:event.clientY,ox:state.view.offsetX,oy:state.view.offsetY};
});
window.addEventListener("mouseup",() => { state.pan = null; });
window.addEventListener("mousemove",event => {
  if (state.pan) {
    const dx = event.clientX-state.pan.x, dy = event.clientY-state.pan.y;
    if (Math.hypot(dx,dy) > 3) state.dragged = true;
    state.view.offsetX = state.pan.ox+dx; state.view.offsetY = state.pan.oy+dy;
    renderPoints();
  }
  const m = mousePosition(event);
  const visible = state.img && state.points.length < 3 && !state.pan &&
    m.x >= 0 && m.x <= canvas.width && m.y >= 0 && m.y <= canvas.height;
  el("cursorCross").style.display = visible ? "block" : "none";
  canvas.style.cursor = visible ? "none" : state.pan ? "grabbing" : "";
  el("cursorCross").style.left = `${m.x}px`;
  el("cursorCross").style.top = `${m.y}px`;
});
canvas.addEventListener("mouseleave",() => { el("cursorCross").style.display = "none"; canvas.style.cursor = ""; });
canvas.addEventListener("wheel",event => {
  if (!state.img) return;
  event.preventDefault();
  if (event.altKey) {
    const cursor = el("cursorCross");
    const diameter = Math.max(16,Math.min(320,Number(cursor.dataset.aimDiameter || 64)+(event.deltaY < 0 ? 4 : -4)));
    cursor.dataset.aimDiameter = String(diameter);
    cursor.style.setProperty("--aim-diameter",`${diameter}px`);
    return;
  }
  const m = mousePosition(event), before = screenToImage(m.x,m.y);
  state.view.scale = Math.max(0.01,Math.min(30,state.view.scale*(event.deltaY < 0 ? 1.1 : 1/1.1)));
  state.view.offsetX = m.x-before.x*state.view.scale;
  state.view.offsetY = m.y-before.y*state.view.scale;
  renderPoints();
},{passive:false});
el("clearPoints").addEventListener("click",() => {
  state.points = [];
  el("detectionStatus").textContent="";
  if (state.autoAlignP1) { el("phantomDX").value = "0"; el("phantomDY").value = "0"; }
  resetResult(); renderPoints();
});
function applyMillimeterFocal() {
  const mm=value("focalEq"), sensor=value("sensorW");
  if (![mm,sensor].every(n => Number.isFinite(n) && n > 0)) {
    el("calibrationStatus").textContent="Введите положительные фокус и ширину матрицы.";
    return;
  }
  state.focalSource="mm";
  if (!state.img) {
    el("calibrationStatus").textContent="Фокус будет пересчитан в пиксели после загрузки фото.";
    return;
  }
  el("focal").value = (mm/sensor*state.img.width).toFixed(3);
  el("calibrationStatus").textContent=`Используется фокус из мм: ${el("focal").value} px. Размер кадра учитывается автоматически.`;
  resetResult(); renderPoints();
}
el("applyFocalEq").addEventListener("click",applyMillimeterFocal);
["focalEq","sensorW"].forEach(id => el(id).addEventListener("input",() => {
  updateFocalPreview(); applyMillimeterFocal(); resetResult();
}));
["d12","d13","d23","focal","height","heightTolerance"].forEach(id => el(id).addEventListener("input",() => {
  if(id==="focal")state.focalSource="manual";
  if (["d12","d13","d23","focal"].includes(id)) el("calibrationStatus").textContent = "Фокус или геометрия маяков изменены вручную.";
  resetResult(); renderPoints();
}));
["hintX","hintY","hintZ","phantomRot","showPhantom"].forEach(id => el(id).addEventListener("input",renderPoints));
["phantomDX","phantomDY"].forEach(id => el(id).addEventListener("input",() => {
  state.autoAlignP1 = false; el("lockP1").checked = false; renderPoints();
}));
el("lockP1").addEventListener("change",() => { state.autoAlignP1 = el("lockP1").checked; renderPoints(); });
el("clickNoise").addEventListener("input",() => { el("clickNoiseVal").textContent = el("clickNoise").value; });

function calculate() {
  try {
    if (!el("height").value.trim() || !Number.isFinite(value("height")) || value("height") < 0.1) {
      el("height").reportValidity?.();
      throw new Error("Введите высоту над плоскостью маяков: не менее 0,1 м.");
    }
    if (!state.img || state.points.length !== 3) throw new Error("Загрузите кадр и выберите P1, P2, P3.");
    if (state.focalSource==="mm" && ![value("focalEq"),value("sensorW")].every(n => Number.isFinite(n) && n > 0))
      throw new Error("Введите положительные фокус и ширину матрицы.");
    const result = solvePosition({
      world:worldTriangle(), pixels:state.points, focal:value("focal"), center:center(),
      height:value("height"), heightTolerance:value("heightTolerance")
    });
    const p1Offset = Math.hypot(state.points[0].x-center().x,state.points[0].y-center().y);
    el("reproj").textContent = `P1 от центра: ${p1Offset.toFixed(1)} px. Решений по фото: ${result.candidates.length}; в диапазоне высоты: ${result.accepted.length}.`;
    if (!result.candidates.length) {
      el("result").textContent = "Допустимых решений не найдено. Проверьте расстояния, фокус и выбранные точки.";
      return;
    }
    if (!result.accepted.length) {
      el("result").textContent = `Ни одно решение не соответствует высоте ${value("height")} ± ${value("heightTolerance")} м. Высоты по фото: ${result.candidates.map(c => c.position.z.toFixed(2)).join(" / ")} м. Проверьте калибровку и клики.`;
      return;
    }
    const format = n => (Math.abs(n) < 0.005 ? 0 : n).toFixed(2);
    const offAxis=Math.atan2(p1Offset,value("focal"))*180/Math.PI;
    const lines = result.accepted.map((candidate,i) => {
      const p = beaconToCameraFrame(candidate.position);
      const angles=directionToP1(p);
      const bearing=angles.bearing===null ? "не определён (камера над P1)" : `${format(angles.bearing)}°`;
      return `${result.accepted.length > 1 ? "Вариант "+(i+1)+":\n" : ""}Камера относительно P1:\nX=${format(p.x)}, Y=${format(p.y)}, Z=${format(p.z)} м\n\nДо маяков P1 / P2 / P3:\n${candidate.ranges.map(format).join(" / ")} м\n\nНаправление от камеры к P1:\nУгол по горизонту: ${bearing}\nНаклон вниз от горизонта: ${format(angles.pitchDown)}°\n(0° = +Y, 90° = +X)\n\nP1 от оптической оси камеры: ${format(offAxis)}°\n\nВектор от камеры к P1:\n(${format(-p.x)}, ${format(-p.y)}, ${format(-p.z)}) м`;
    });
    el("result").textContent = (result.accepted.length > 1 ? "Позиция неоднозначна: несколько вариантов подходят по высоте.\n" : "")+lines.join("\n\n");
  } catch (error) {
    el("result").textContent = error.message;
    el("reproj").textContent = "—";
  }
}
el("solveBtn").addEventListener("click",calculate);
el("demoBtn").addEventListener("click",() => {
  try {
    const world = worldTriangle(), position = hintPosition();
    if (![position.x,position.y,position.z].every(Number.isFinite) || position.z <= 0) throw new Error("Высота тестовой камеры должна быть положительной.");
    const image = document.createElement("canvas"); image.width = 1920; image.height = 1080;
    const focal=state.focalSource==="mm" ? value("focalEq")/value("sensorW")*image.width : value("focal");
    if (!Number.isFinite(focal) || focal <= 0) throw new Error("Введите положительные параметры камеры.");
    const points = projectCentered(world,position,focal,{x:960,y:540},value("phantomRot"));
    if (points.some(p => !p || p.x < 0 || p.x >= image.width || p.y < 0 || p.y >= image.height))
      throw new Error("Маяки не помещаются в тестовый кадр. Измените позицию или фокус.");
    const paint = image.getContext("2d");
    paint.fillStyle = "#0b1220"; paint.fillRect(0,0,image.width,image.height);
    paint.fillStyle = "#b6c4de"; paint.font = "24px sans-serif";
    const displayPosition=beaconToCameraFrame(position);
    paint.fillText(`Тест: камера (${displayPosition.x}, ${displayPosition.y}, ${displayPosition.z}) м; f=${focal.toFixed(2)} px`,30,40);
    points.forEach((p,i) => { paint.fillStyle = colors[i]; paint.beginPath(); paint.arc(p.x,p.y,5,0,2*Math.PI); paint.fill(); });
    el("focal").value=focal.toFixed(3);
    loadImage(image,{useSaved:false});
    state.points = points.map(p => ({x:addNoise(p.x),y:addNoise(p.y)}));
    el("height").value = String(position.z);
    renderPoints(); calculate();
  } catch (error) { el("result").textContent = error.message; }
});
window.addEventListener("resize",resizeCanvas);
resizeCanvas();
