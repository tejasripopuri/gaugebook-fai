export function inside(areas,[x,y]){
  return areas.some(([left,top,right,bottom])=>x>=left&&x<=right&&y>=top&&y<=bottom);
}
// Find connected drawing strokes after suppressing OCR text and long sheet rules.
export function detectViews(canvas,lines){
  const size=720,scale=size/Math.max(canvas.width,canvas.height);
  const w=Math.ceil(scale*canvas.width),h=Math.ceil(scale*canvas.height);
  // Pool dark source pixels so thin projected views survive downsampling.
  const rgba=canvas.getContext("2d").getImageData(0,0,canvas.width,canvas.height).data;
  const ink=new Uint8Array(w*h),cols=Array.from({length:canvas.width},(_,x)=>Math.floor(x*scale));
  for(let y=0;y<canvas.height;y++){
    const row=Math.floor(y*scale)*w;
    for(let x=0,i=y*canvas.width*4;x<canvas.width;x++,i+=4)if(rgba[i]<190)ink[row+cols[x]]=1;
  }
  for(const {text,bbox:b} of lines){
    // OCR sometimes labels an entire side view as one wide glyph. Keep its strokes.
    const major=Math.max(b.x1-b.x0,b.y1-b.y0),minor=Math.max(1,Math.min(b.x1-b.x0,b.y1-b.y0));
    if(major/minor>Math.max(3,text.trim().length*1.6))continue;
    if((b.x1-b.x0)*scale>w*.6||(b.y1-b.y0)*scale>h*.09)continue;
    for(let y=Math.max(0,Math.floor(b.y0*scale)-1);y<Math.min(h,Math.ceil(b.y1*scale)+1);y++)
      ink.fill(0,y*w+Math.max(0,Math.floor(b.x0*scale)-1),y*w+Math.min(w,Math.ceil(b.x1*scale)+1));
  }
  function eraseRules(n,length,stride,start,threshold){
    for(let k=0;k<n;k++){
      const base=start(k);let from=0;
      for(let j=0;j<=length;j++)if(j===length||!ink[base+j*stride]){
        if(j-from>threshold)for(let m=from;m<j;m++)ink[base+m*stride]=0;
        from=j+1;
      }
    }
  }
  eraseRules(h,w,1,y=>y*w,w*.68);eraseRules(w,h,w,x=>x,h*.68);
  const boxes=[],queue=new Int32Array(w*h);
  for(let i=0;i<ink.length;i++)if(ink[i]){
    let end=1,l=w,r=0,t=h,b=0;queue[0]=i;ink[i]=0;
    for(let j=0;j<end;j++){
      const k=queue[j],x=k%w,y=Math.floor(k/w);l=Math.min(l,x);r=Math.max(r,x);t=Math.min(t,y);b=Math.max(b,y);
      for(let yy=Math.max(0,y-1);yy<=Math.min(h-1,y+1);yy++)for(let xx=Math.max(0,x-1);xx<=Math.min(w-1,x+1);xx++){
        const m=yy*w+xx;if(ink[m]){ink[m]=0;queue[end++]=m;}
      }
    }
    if(r-l<w*.035||b-t<h*.024||end<65||(r-l)*(b-t)>w*h*.61)continue;
    const words=lines.filter(({bbox:q})=>(q.x0+q.x1)*scale/2>=l&&(q.x0+q.x1)*scale/2<=r&&(q.y0+q.y1)*scale/2>=t&&(q.y0+q.y1)*scale/2<=b);
    if(words.some(v=>/title block|purchase order|drawn by|scale\s*[:=]|sheet\s+\d+\s+of|feature center locations|inspection notes/i.test(v.text)))continue;
    boxes.push([l/w,t/h,r/w,b/h]);
  }
  return boxes.filter((a,i)=>!boxes.some((b,j)=>i!==j&&a[0]>=b[0]&&a[1]>=b[1]&&a[2]<=b[2]&&a[3]<=b[3]));
}
export function anchorFor(areas,x,y){
  let best=null,dist=Infinity;
  for(const [l,t,r,b] of areas){
    const px=Math.max(l,Math.min(r,x)),py=Math.max(t,Math.min(b,y)),d=Math.hypot(x-px,y-py);
    if(d<dist&&d<.058){dist=d;best=[px,py];}
  }
  return best;
}
