export function sceneLayout(viewport, inset) {
  const width=Math.max(1,Math.floor(viewport.width));
  const height=Math.max(1,Math.floor(viewport.height));
  const size=Math.max(1,Math.floor(Math.min(inset.width,inset.height,width,height)));
  return {
    width,height,size,
    x:Math.max(0,Math.min(width-size,Math.round(inset.left-viewport.left))),
    y:Math.max(0,Math.min(height-size,Math.round(viewport.bottom-inset.bottom)))
  };
}
