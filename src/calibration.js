import { buildTriangle, calibrateFocal, projectCentered, solvePosition } from "./geometry.js";
import { createImagePicker } from "./image-picker.js";
import { saveCalibration } from "./calibration-profile.js";
import { detectMarkers } from "./marker-detection.js";

const el = id => document.getElementById(id);
const value = id => el(id).value.trim() === "" ? NaN : Number(el(id).value);
const sides = () => [value("d12"),value("d13"),value("d23")];
const position = () => ({x:value("cameraX"),y:value("cameraY"),z:value("cameraZ")});
let calibration = null;
let testActive = false;
function invalidate() {
  calibration = null; el("saveBtn").disabled = true;
  el("result").textContent = "Выберите три маяка и нажмите «Определить фокус».";
  el("quality").textContent = ""; el("saveStatus").textContent = "";
  el("referenceResult").textContent = "Проверка устарела. Нажмите «Сравнить с известными XYZ».";
}
const picker = createImagePicker({
  canvas:el("imgCanvas"),wrap:document.querySelector(".canvas-wrap"),
  cursor:el("cursorCross"),label:el("cursorLabel"),onChange:invalidate,
  onTestMove:offset => {el("testStatus").textContent = `Смещение тестовых точек: X=${offset.x.toFixed(1)}, Y=${offset.y.toFixed(1)} px.`;}
});
function loaded(image) {
  el("detectionStatus").textContent="";
  testActive = false; el("testStatus").textContent = "";
  picker.load(image); el("overlayHint").style.display = "none";
  el("imageInfo").textContent = `${image.width} × ${image.height} px`;
  convertReference();
}

function convertReference() {
  if (!picker.image) {el("referenceResult").textContent="Сначала загрузите изображение.";return;}
  const mm=value("referenceMm"),sensor=value("referenceSensor");
  if (!Number.isFinite(mm) || !Number.isFinite(sensor) || mm<=0 || sensor<=0) {
    el("referenceResult").textContent="Укажите положительные фокус и ширину сенсора.";return;
  }
  el("referencePx").value=(mm/sensor*picker.image.width).toFixed(4);
  el("referenceResult").textContent=`Контрольный фокус ${el("referencePx").value} px для ширины ${picker.image.width} px. Нажмите «Сравнить с известными XYZ».`;
}
function checkReference() {
  try {
    if (!picker.image) throw new Error("Сначала загрузите изображение.");
    const image=picker.image,C=position(),focal=value("referencePx");
    if (![C.x,C.y,C.z].every(Number.isFinite)) throw new Error("Заполните XYZ камеры.");
    const result=solvePosition({world:buildTriangle(...sides()),pixels:picker.points,focal,
      center:{x:image.width/2,y:image.height/2},height:C.z,heightTolerance:2});
    if (!result.candidates.length) throw new Error("При контрольном фокусе допустимых позиций не найдено. Проверьте точки и геометрию маяков.");
    const candidates=result.candidates.map(c=>({...c,difference:Math.hypot(c.position.x-C.x,c.position.y-C.y,c.position.z-C.z)})).sort((a,b)=>a.difference-b.difference);
    const nearest=candidates[0],p=nearest.position;
    el("referenceResult").textContent=`При f=${focal.toFixed(2)} px ближайшая к введённым XYZ позиция по фото:\nX=${p.x.toFixed(2)}, Y=${p.y.toFixed(2)}, Z=${p.z.toFixed(2)} м.\nРазница с введёнными XYZ: ΔX=${(p.x-C.x).toFixed(2)}, ΔY=${(p.y-C.y).toFixed(2)}, ΔZ=${(p.z-C.z).toFixed(2)} м; всего ${nearest.difference.toFixed(2)} м.\n`+
      (nearest.difference>2 ? "Позиция по фото отличается от введённой. Проверьте координаты относительно P1 и направления осей. Для калибровки используются именно введённые XYZ." : "Позиции близки. Если калибровка всё ещё заметно расходится с контрольным фокусом, нужен исходный кадр и точные XYZ для проверки.")+
      `\nВариантов по фото: ${candidates.length}; в диапазоне высоты ±2 м: ${result.accepted.length}.`;
  } catch(error) {el("referenceResult").textContent=error.message;}
}
el("convertReference").addEventListener("click",convertReference);
el("checkReference").addEventListener("click",checkReference);
["referenceMm","referenceSensor","referencePx"].forEach(id=>el(id).addEventListener("input",()=>{
  el("referenceResult").textContent="Параметры изменены. Переведите мм в px или проверьте введённый фокус в пикселях.";
}));
el("fileInput").addEventListener("change",event => {
  const file = event.target.files[0];
  if (!file) return;
  const url = URL.createObjectURL(file), image = new Image();
  image.onload = () => {URL.revokeObjectURL(url); loaded(image);};
  image.onerror = () => {URL.revokeObjectURL(url); el("result").textContent = "Не удалось загрузить изображение.";};
  image.src = url;
});
el("clearPoints").addEventListener("click",() => {picker.clear();el("detectionStatus").textContent="";});
el("findMarkers").addEventListener("click",()=>{
  try {
    const found=detectMarkers(picker.image);
    if(found.ok){picker.setOverlay([]);picker.setPoints(found.points);}
    el("detectionStatus").textContent=found.message;
  } catch(error){el("detectionStatus").textContent=error.message;}
});
["d12","d13","d23","cameraX","cameraY","cameraZ"].forEach(id => el(id).addEventListener("input",() => {
  invalidate(); picker.setOverlay([]);
  if (testActive) updateTestPoints();
}));

function updateTestPoints({resetOffset=false}={}) {
  try {
    if (!picker.image) throw new Error("Загрузите изображение для наложения тестовых точек.");
    const C = position(), focal = value("demoFocal"), roll = value("demoRoll");
    if (![C.x,C.y,C.z,focal,roll].every(Number.isFinite) || C.z <= 0 || focal <= 0)
      throw new Error("Укажите корректные XYZ, положительный фокус и поворот.");
    const image = picker.image;
    const points = projectCentered(buildTriangle(...sides()),C,focal,{x:image.width/2,y:image.height/2},roll);
    if (points.some(p=>!p)) throw new Error("При этой позиции не все тестовые маяки видны.");
    picker.setTestPoints(points,{resetOffset}); testActive = true;
  } catch(error) {picker.setTestPoints([]); el("testStatus").textContent = error.message;}
}
el("demoBtn").addEventListener("click",() => updateTestPoints());
el("resetDemoOffset").addEventListener("click",() => picker.resetTestOffset());
el("hideDemo").addEventListener("click",() => {
  testActive=false; picker.setTestPoints([]); el("testStatus").textContent="Тестовые точки скрыты.";
});
["demoFocal","demoRoll"].forEach(id => el(id).addEventListener("input",() => {
  if (testActive) updateTestPoints();
}));
function calculate() {
  invalidate(); picker.setOverlay([]);
  try {
    if (!picker.image) throw new Error("Сначала загрузите изображение.");
    const image = picker.image;
    const result = calibrateFocal({world:buildTriangle(...sides()),pixels:picker.points,
      position:position(),center:{x:image.width/2,y:image.height/2}});
    calibration = {...result,width:image.width,height:image.height,sides:sides()};
    picker.setOverlay(result.projected);
    el("result").textContent = `Фокус: ${result.focal.toFixed(2)} px\nОриентация камеры определена по трём маякам.\nP1 от центра кадра: ${result.p1Offset.toFixed(2)} px\nОтклонение P1 / P2 / P3: ${result.errors.map(e => e.toFixed(2)).join(" / ")} px; RMS = ${result.rms.toFixed(2)} px.`;
    const acceptable = Math.max(...result.errors) <= 3 && !result.ambiguous;
    el("quality").textContent = result.ambiguous
      ? "Несколько значений фокуса согласуются с этим кадром. Нужен другой контрольный снимок. Сохранение отключено."
      : acceptable
      ? "Данные согласованы в пределах 3 px. Крестики показывают ожидаемые точки. Проверьте результат на другом кадре с той же камерой."
      : "Расхождение больше 3 px. Проверьте XYZ, порядок маяков, точность кликов и отсутствие обрезки кадра. Сохранение отключено до согласования данных.";
    el("saveBtn").disabled = !acceptable;
  } catch(error) {el("result").textContent = error.message;}
}
el("calibrateBtn").addEventListener("click",calculate);
el("saveBtn").addEventListener("click",() => {
  if (!calibration || el("saveBtn").disabled) return;
  try {
    saveCalibration({focal:calibration.focal,width:calibration.width,height:calibration.height,
      sides:calibration.sides,rms:calibration.rms,createdAt:new Date().toISOString()});
    el("saveStatus").textContent = "Сохранено. На странице расчёта загрузите кадр того же разрешения или нажмите «Применить сохранённую».";
  } catch {el("saveStatus").textContent = "Браузер не разрешил сохранение. Введите полученный фокус на странице расчёта вручную.";}
});
el("generateDemoBtn").addEventListener("click",() => {
  try {
    const C = position(), focal = value("demoFocal"), roll = value("demoRoll");
    if (![C.x,C.y,C.z,focal,roll].every(Number.isFinite) || C.z <= 0 || focal <= 0)
      throw new Error("Укажите корректные XYZ, положительный фокус и поворот.");
    const points = projectCentered(buildTriangle(...sides()),C,focal,{x:960,y:540},roll);
    if (points.some(p => !p || p.x < 0 || p.y < 0 || p.x >= 1920 || p.y >= 1080))
      throw new Error("Маяки не помещаются в кадр. Измените XYZ или тестовый фокус.");
    const image = document.createElement("canvas"); image.width=1920; image.height=1080;
    const ctx = image.getContext("2d"); ctx.fillStyle="#0b1220"; ctx.fillRect(0,0,1920,1080);
    ctx.fillStyle="#b6c4de"; ctx.font="24px sans-serif";
    ctx.fillText(`Тест калибровки: f=${focal} px, камера (${C.x}, ${C.y}, ${C.z}) м`,30,40);
    points.forEach((p,i) => {ctx.fillStyle=["#ffcc00","#4f8cff","#d46bd5"][i];ctx.beginPath();ctx.arc(p.x,p.y,5,0,2*Math.PI);ctx.fill();});
    loaded(image); picker.setPoints(points); calculate();
  } catch(error) {el("result").textContent=error.message;}
});
