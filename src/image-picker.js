const colors = ["#ffcc00","#4f8cff","#d46bd5"];

// Pixel coordinates always refer to the original image, regardless of zoom or pan.
export function createImagePicker({canvas,wrap,cursor,label,onChange,onTestMove = () => {}}) {
  const ctx = canvas.getContext("2d");
  let image = null, points = [], overlay = [], scale = 1, ox = 0, oy = 0, pan = null, dragged = false;
  let testPoints = [], testOffset = {x:0,y:0}, testDrag = null;
  const position = event => {
    const rect = canvas.getBoundingClientRect();
    return {x:event.clientX-rect.left,y:event.clientY-rect.top};
  };
  function draw() {
    ctx.clearRect(0,0,canvas.width,canvas.height);
    if (!image) return;
    ctx.setTransform(scale,0,0,scale,ox,oy); ctx.drawImage(image,0,0); ctx.setTransform(1,0,0,1,0,0);
    points.forEach((p,i) => {
      const x = p.x*scale+ox, y = p.y*scale+oy;
      ctx.strokeStyle = colors[i]; ctx.fillStyle = colors[i]; ctx.lineWidth = 2;
      ctx.beginPath(); ctx.arc(x,y,8,0,2*Math.PI); ctx.stroke(); ctx.fillText(`P${i+1}`,x+10,y-6);
    });
    overlay.forEach((p,i) => {
      const x = p.x*scale+ox, y = p.y*scale+oy;
      ctx.strokeStyle = colors[i]; ctx.lineWidth = 2;
      ctx.beginPath(); ctx.moveTo(x-12,y); ctx.lineTo(x+12,y); ctx.moveTo(x,y-12); ctx.lineTo(x,y+12); ctx.stroke();
    });
    testPoints.forEach((p,i) => {
      const x = (p.x+testOffset.x)*scale+ox, y = (p.y+testOffset.y)*scale+oy;
      ctx.strokeStyle = colors[i]; ctx.fillStyle = colors[i]; ctx.lineWidth = 2;
      ctx.globalAlpha = 0.75;
      ctx.beginPath(); ctx.arc(x,y,i === 0 ? 12 : 10,0,2*Math.PI); ctx.stroke();
      ctx.beginPath(); ctx.moveTo(x-15,y); ctx.lineTo(x+15,y); ctx.moveTo(x,y-15); ctx.lineTo(x,y+15); ctx.stroke();
      ctx.fillText(`T${i+1}`,x+16,y+16);
    });
    ctx.globalAlpha = 1;
    const i = Math.min(points.length,2);
    cursor.style.setProperty("--cross-color",colors[i]); label.textContent = `P${i+1}`;
    if (points.length === 3) cursor.style.display = "none";
  }
  function resize() {
    const rect = wrap.getBoundingClientRect();
    canvas.width = Math.max(1,Math.floor(rect.width)); canvas.height = Math.max(1,Math.floor(rect.height));
    if (image) {
      scale = Math.min(canvas.width/image.width,canvas.height/image.height);
      ox = (canvas.width-image.width*scale)/2; oy = (canvas.height-image.height*scale)/2;
    }
    draw();
  }
  canvas.addEventListener("click",event => {
    if (!image || points.length === 3 || dragged || event.shiftKey) return;
    const m = position(event), p = {x:(m.x-ox)/scale,y:(m.y-oy)/scale};
    if (p.x < 0 || p.y < 0 || p.x >= image.width || p.y >= image.height) return;
    points.push(p); overlay = []; draw(); onChange();
  });
  canvas.addEventListener("contextmenu",event => event.preventDefault());
  canvas.addEventListener("mousedown",event => {
    dragged = false;
    if (image && event.button === 0 && !event.shiftKey && testPoints[0]) {
      const m = position(event);
      const x = (testPoints[0].x+testOffset.x)*scale+ox, y = (testPoints[0].y+testOffset.y)*scale+oy;
      if (Math.hypot(m.x-x,m.y-y) <= 16) {
        event.preventDefault(); dragged = true;
        testDrag = {x:event.clientX,y:event.clientY,offset:{...testOffset}};
        cursor.style.display = "none"; canvas.style.cursor = "grabbing";
        return;
      }
    }
    if (!image || !(event.button === 2 || event.shiftKey)) return;
    event.preventDefault(); pan = {x:event.clientX,y:event.clientY,ox,oy};
  });
  window.addEventListener("mouseup",() => { pan = null; testDrag = null; canvas.style.cursor = ""; });
  window.addEventListener("mousemove",event => {
    if (testDrag) {
      testOffset = {x:testDrag.offset.x+(event.clientX-testDrag.x)/scale,
        y:testDrag.offset.y+(event.clientY-testDrag.y)/scale};
      draw(); onTestMove({...testOffset}); return;
    }
    if (pan) {
      const dx = event.clientX-pan.x, dy = event.clientY-pan.y;
      if (Math.hypot(dx,dy) > 3) dragged = true;
      ox = pan.ox+dx; oy = pan.oy+dy; draw();
    }
    const m = position(event);
    const aiming = image && points.length < 3 && !pan && m.x >= 0 && m.y >= 0 && m.x < canvas.width && m.y < canvas.height;
    cursor.style.display = aiming ? "block" : "none";
    canvas.style.cursor = aiming ? "none" : pan ? "grabbing" : "";
    cursor.style.left = `${m.x}px`; cursor.style.top = `${m.y}px`;
  });
  canvas.addEventListener("mouseleave",() => { cursor.style.display = "none"; if(!testDrag)canvas.style.cursor = ""; });
  canvas.addEventListener("wheel",event => {
    if (!image) return;
    if (testDrag) {event.preventDefault(); return;}
    if (event.altKey) {
      event.preventDefault();
      const diameter = Math.max(16,Math.min(320,Number(cursor.dataset.aimDiameter || 64)+(event.deltaY < 0 ? 4 : -4)));
      cursor.dataset.aimDiameter = String(diameter);
      cursor.style.setProperty("--aim-diameter",`${diameter}px`);
      return;
    }
    event.preventDefault(); const m = position(event), x = (m.x-ox)/scale, y = (m.y-oy)/scale;
    scale = Math.max(0.01,Math.min(30,scale*(event.deltaY < 0 ? 1.1 : 1/1.1)));
    ox = m.x-x*scale; oy = m.y-y*scale; draw();
  },{passive:false});
  window.addEventListener("resize",resize); resize();
  return {
    get image(){return image;}, get points(){return points.map(p => ({...p}));},
    load(next){image=next; points=[]; overlay=[]; testPoints=[]; testOffset={x:0,y:0}; testDrag=null; pan=null; cursor.style.display="none"; resize(); onChange();},
    clear(){points=[]; overlay=[]; draw(); onChange();},
    setOverlay(next){overlay=next; draw();},
    setPoints(next){points=next; draw(); onChange();},
    setTestPoints(next,{resetOffset=false}={}){testPoints=next.map(p=>({...p})); if(resetOffset)testOffset={x:0,y:0}; draw(); onTestMove({...testOffset});},
    resetTestOffset(){testOffset={x:0,y:0}; draw(); onTestMove({...testOffset});},
    get testPoints(){return testPoints.map(p=>({x:p.x+testOffset.x,y:p.y+testOffset.y}));}
  };
}
