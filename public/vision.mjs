// Compare tiled ink differences so a small changed callout cannot hide in page-wide whitespace.
export function matchesRaster(a,b,width,height) {
  if(a.length!==b.length || a.length!==width*height*4) return false;
  for(let y=0;y<height;y+=8) for(let x=0;x<width;x+=8) {
    let diff=0;
    for(let j=y;j<Math.min(y+8,height);j++)
      for(let i=x;i<Math.min(x+8,width);i++) {
        const k=(j*width+i)*4;
        diff+=Math.abs(a[k]-b[k]);
      }
    if(diff>600) return false;
  }
  return true;
}
