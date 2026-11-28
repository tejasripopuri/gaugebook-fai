export function inside(areas,[x,y]){
  return areas.some(([left,top,right,bottom])=>x>=left&&x<=right&&y>=top&&y<=bottom);
}
// Find connected drawing strokes after suppressing OCR text and long sheet rules.
// furniture (optional, see sheetFurniture): the border and title/revision blocks are blanked first,
// so the frame's lines and zone ticks cannot join up with, or pose as, a drawing view.
export function detectViews(canvas,lines,furniture){
  const size=720,scale=size/Math.max(canvas.width,canvas.height);
  const w=Math.ceil(scale*canvas.width),h=Math.ceil(scale*canvas.height);
  // Pool dark source pixels so thin projected views survive downsampling.
  const rgba=canvas.getContext("2d").getImageData(0,0,canvas.width,canvas.height).data;
  const ink=new Uint8Array(w*h),cols=Array.from({length:canvas.width},(_,x)=>Math.floor(x*scale));
  for(let y=0;y<canvas.height;y++){
    const row=Math.floor(y*scale)*w;
    for(let x=0,i=y*canvas.width*4;x<canvas.width;x++,i+=4)if(rgba[i]<190)ink[row+cols[x]]=1;
  }
  if(furniture){
    const [l,t,r,b]=furniture.frame,inset=.004;
    const blank=(L,T,R,B)=>{for(let y=Math.max(0,Math.floor(T*h));y<Math.min(h,Math.ceil(B*h));y++)ink.fill(0,y*w+Math.max(0,Math.floor(L*w)),y*w+Math.min(w,Math.ceil(R*w)));};
    blank(0,0,1,t+inset);blank(0,b-inset,1,1);blank(0,0,l+inset,1);blank(r-inset,0,1,1);
    for(const [L,T,R,B] of furniture.blocks)blank(L-inset,T-inset,R+inset,B+inset);
  }
  // OCR also "reads" circles and hatching as words ("NY", "Ne", "") in boxes far taller than the
  // sheet's real text. Only text-sized boxes are erased, so those strokes stay part of their view.
  const heights=lines.filter(l=>/\d/.test(l.text)).map(l=>l.bbox.y1-l.bbox.y0).sort((a,b)=>a-b);
  const textHeight=heights.length?heights[Math.floor(heights.length/2)]:Infinity;
  for(const {text,bbox:b} of lines){
    if(b.y1-b.y0>2.5*textHeight&&!/\d/.test(text))continue;
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
// On a view, or close enough to one to belong to it (dimension text sits just outside the outline).
// (Text is tied to a view within .058; its balloon sits up to a balloon's width further out.)
export function nearView(areas,[x,y]){
  return areas.some(([l,t,r,b])=>Math.hypot(x-Math.max(l,Math.min(r,x)),y-Math.max(t,Math.min(b,y)))<.09);
}
export function anchorFor(areas,x,y){
  let best=null,dist=Infinity;
  for(const [l,t,r,b] of areas){
    const px=Math.max(l,Math.min(r,x)),py=Math.max(t,Math.min(b,y)),d=Math.hypot(x-px,y-py);
    if(d<dist&&d<.058){dist=d;best=[px,py];}
  }
  return best;
}

// The sheet's own furniture, found from its ruled lines so it works on any drawing, scanned or not:
//   frame:  [left, top, right, bottom] inside the border (zone letters and numbers lie outside it)
//   blocks: boxes in the frame's corners closed off by rules: title block, revision block, tables
// All as fractions of the sheet. Nothing in these places is a dimension on a drawing view.
export function sheetFurniture(canvas){
  const size=1600,scale=Math.min(1,size/Math.max(canvas.width,canvas.height));
  const w=Math.max(1,Math.round(canvas.width*scale)),h=Math.max(1,Math.round(canvas.height*scale));
  const rgba=canvas.getContext("2d").getImageData(0,0,canvas.width,canvas.height).data;
  const ink=new Uint8Array(w*h);
  for(let y=0;y<canvas.height;y++){
    const row=Math.min(h-1,Math.floor(y*scale))*w;
    for(let x=0,i=y*canvas.width*4;x<canvas.width;x++,i+=4)if(rgba[i]<170&&rgba[i+3]>0)ink[row+Math.min(w-1,Math.floor(x*scale))]=1;
  }
  const at=(x,y)=>x>=0&&y>=0&&x<w&&y<h&&ink[y*w+x];
  const GAP=4;
  // Ruled runs along a row (or column), tolerating small breaks and a pixel of skew.
  function runs(n,length,hit){
    const out=[];let start=-1,last=-1;
    for(let j=0;j<length;j++){
      if(hit(n-1,j)||hit(n,j)||hit(n+1,j)){if(start<0||j-last>GAP){if(start>=0)out.push([start,last]);start=j;}last=j;}
    }
    if(start>=0)out.push([start,last]);
    return out;
  }
  const rowRuns=y=>runs(y,w,(yy,x)=>at(x,yy)),colRuns=x=>runs(x,h,(xx,y)=>at(xx,y));
  const longest=r=>r.reduce((m,[a,b])=>Math.max(m,b-a),0);
  let top=0,bottom=h-1,left=0,right=w-1;
  for(let y=0;y<h*.08;y++)if(longest(rowRuns(y))>w*.6)top=y;   // a thin border: title strips sit at the bottom
  for(let y=h-1;y>h*.8;y--)if(longest(rowRuns(y))>w*.6)bottom=y;
  for(let x=0;x<w*.2;x++)if(longest(colRuns(x))>h*.6)left=x;
  for(let x=w-1;x>w*.8;x--)if(longest(colRuns(x))>h*.6)right=x;
  // A vertical rule near column x covering rows y0..y1.
  const ruled=(x,y0,y1)=>{
    if(y1-y0<3)return false;
    for(let dx=-3;dx<=3;dx++){let n=0;for(let y=y0;y<=y1;y++)if(at(x+dx,y)||at(x+dx,y-1)||at(x+dx,y+1))n++;if(n>=(y1-y0+1)*.85)return true;}
    return false;
  };
  const W=right-left,H=bottom-top,blocks=[],edge=w*.015;
  for(let y=top+3;y<bottom-3;y++){
    const lower=y>top+H*.5,upper=y<top+H*.35;
    if(!lower&&!upper)continue;
    for(const [a,b] of rowRuns(y)){
      if(b-a<W*.1||b-a>W*.75)continue;
      const [y0,y1]=lower?[y,bottom]:[top,y];
      if(b>=right-edge&&a>left+edge&&ruled(a,y0,y1))blocks.push([a,y0,right,y1]);        // right corners
      else if(a<=left+edge&&b<right-edge&&ruled(b,y0,y1))blocks.push([left,y0,b,y1]);   // left corners
    }
  }
  const f=([l,t,r,b])=>[l/w,t/h,r/w,b/h];
  return {frame:f([left,top,right,bottom]),blocks:blocks.map(f)};
}
// True when a point (fractions of the sheet) is in the border or in a title/revision block.
// With box ([x0,y0,x1,y1]), text that touches the frame still counts as inside it.
export function onFurniture(furniture,[x,y],box){
  if(!furniture)return false;
  const [l,t,r,b]=furniture.frame,[x0,y0,x1,y1]=box||[x,y,x,y];
  return x1<l||x0>r||y1<t||y0>b||furniture.blocks.some(([L,T,R,B])=>x>=L&&x<=R&&y>=T&&y<=B);
}
// Views clipped to the frame, without the parts that are title or revision blocks.
export function clipViews(areas,furniture){
  if(!furniture)return areas;
  const [l,t,r,b]=furniture.frame;
  return areas.map(([L,T,R,B])=>[Math.max(L,l),Math.max(T,t),Math.min(R,r),Math.min(B,b)])
    .filter(([L,T,R,B])=>R-L>.01&&B-T>.01)
    .filter(a=>!furniture.blocks.some(([L,T,R,B])=>a[0]>=L-.005&&a[1]>=T-.005&&a[2]<=R+.005&&a[3]<=B+.005));
}
