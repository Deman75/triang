const names = ["P1 (жёлтый)", "P2 (синий)", "P3 (розово-фиолетовый)"];

function colorClass(r,g,b,a) {
  if (a < 128) return 0;
  const max=Math.max(r,g,b),min=Math.min(r,g,b),delta=max-min;
  if (max < 35 || delta/max < 0.25) return 0;
  let h = max === r ? (g-b)/delta : max === g ? 2+(b-r)/delta : 4+(r-g)/delta;
  h=(h*60+360)%360;
  if (h>=35 && h<=80) return 1;
  if (h>=175 && h<=255) return 2;
  if (h>=275 && h<=355) return 3;
  return 0;
}

export function findMarkers({data,width,height}) {
  if (!Number.isInteger(width) || !Number.isInteger(height) || width<1 || height<1 || data.length!==width*height*4)
    throw new Error("Некорректные пиксельные данные изображения.");
  const count=width*height,labels=new Uint8Array(count),groups=[[],[],[]];
  for(let i=0;i<count;i++) labels[i]=colorClass(data[4*i],data[4*i+1],data[4*i+2],data[4*i+3]);
  let queue=new Int32Array(Math.min(count,4096));
  function push(index,tail) {
    if(tail===queue.length){const next=new Int32Array(Math.min(count,queue.length*2));next.set(queue);queue=next;}
    queue[tail]=index;
  }
  for(let start=0;start<count;start++) {
    const color=labels[start];if(!color)continue;
    let head=0,tail=1,area=0,sumX=0,sumY=0,minX=width,minY=height,maxX=0,maxY=0;
    queue[0]=start;labels[start]=0;
    while(head<tail) {
      const index=queue[head++],x=index%width,y=Math.floor(index/width);
      area++;sumX+=x+0.5;sumY+=y+0.5;
      minX=Math.min(minX,x);maxX=Math.max(maxX,x);minY=Math.min(minY,y);maxY=Math.max(maxY,y);
      for(let yy=Math.max(0,y-1);yy<=Math.min(height-1,y+1);yy++)
        for(let xx=Math.max(0,x-1);xx<=Math.min(width-1,x+1);xx++) {
          const next=yy*width+xx;
          if(labels[next]===color){labels[next]=0;push(next,tail++);}
        }
    }
    const w=maxX-minX+1,h=maxY-minY+1,fill=area/(w*h);
    if(area>=6 && Math.max(w/h,h/w)<=2.5 && fill>=0.4) groups[color-1].push({
      x:sumX/area,y:sumY/area,area,
      clipped:minX===0 || minY===0 || maxX===width-1 || maxY===height-1
    });
  }
  const problems=[],markers=groups.map((group,i)=>{
    group.sort((a,b)=>b.area-a.area);
    // Ignore tiny isolated color noise, but never choose between plausible beacons.
    const candidates=group.filter(c=>c.area>=Math.max(6,(group[0]?.area || 0)*0.04));
    if(!candidates.length)problems.push(`${names[i]} не найден`);
    else if(candidates.length>1)problems.push(`${names[i]}: найдено ${candidates.length} похожих пятен`);
    else if(candidates[0].clipped)problems.push(`${names[i]} обрезан краем изображения`);
    return {name:names[i],candidates};
  });
  const ok=!problems.length;
  return {ok,markers,points:ok?markers.map(m=>({x:m.candidates[0].x,y:m.candidates[0].y})):null,
    message:ok?"Найдены P1, P2 и P3. Центры определены по площади цветных пятен.":problems.join("; ")+". Выберите точки вручную или используйте другой кадр."};
}

export function detectMarkers(image) {
  if(!image)throw new Error("Сначала загрузите изображение.");
  if(image.width*image.height>40000000)throw new Error("Изображение слишком большое для поиска в браузере (больше 40 Мп).");
  const canvas=document.createElement("canvas");canvas.width=image.width;canvas.height=image.height;
  const ctx=canvas.getContext("2d",{willReadFrequently:true});
  ctx.drawImage(image,0,0);
  return findMarkers(ctx.getImageData(0,0,image.width,image.height));
}
