import {practiceLayout} from "./practice-views.mjs";
// Rectify the printed border rather than the image margins, which vary in screenshots.
function locateFrame(c){
  const w=c.width,h=c.height,data=c.getContext("2d").getImageData(0,0,w,h).data;
  const runs=[];
  for(let y=0;y<h;y++){
    let start=0;
    for(let x=0;x<=w;x++){
      if(x<w&&data[(y*w+x)*4]<165)continue;
      if(x-start>w*.53)runs.push({y,left:start,width:x-start});
      start=x+1;
    }
  }
  for(const top of runs){
    const target=top.y+top.width*580/760;
    const bottom=runs.findLast(r=>Math.abs(r.y-target)<top.width*.012&&Math.abs(r.left-top.left)<4&&Math.abs(r.width-top.width)<6);
    if(bottom)return {x:top.left,y:top.y,w:top.width-1,h:bottom.y-top.y};
  }
}
const references=new Map();
async function reference(part){
  if(!references.has(part)){
    const img=new Image();img.src="practice/"+part+".png";await img.decode();
    const ctx=document.createElement("canvas").getContext("2d");ctx.canvas.width=760;ctx.canvas.height=580;
    ctx.drawImage(img,0,0);references.set(part,ctx.getImageData(0,0,760,580).data);
  }
  return references.get(part);
}
// Compare both directions so added or missing holes, views and text reduce similarity.
function coverage(a,b,[l,t,r,d],masked){
  let hits=0,total=0;
  for(let y=t;y<d;y++)for(let x=l;x<r;x++){
    const p=y*760+x;if(masked[p]||a[p*4]>178)continue;
    total++;
    for(let j=-1;j<=1;j++){
      if(b[(p+j*760-1)*4]<200||b[(p+j*760)*4]<200||b[(p+j*760+1)*4]<200){hits++;break;}
    }
  }
  return hits/Math.max(1,total);
}
const sheets=[
  ["SMP-1002","beebc4317c706a23c5e4ac5cd662df6fb64e9d24a8dfe4894d3eb9c7eae129c9"],
  ["SMP-1003","174c2a0fd1ff287fb1a67ec4c124d08e629e5a6d4a07f97a31cad0a3c60f8bbf"],
  ["SMP-1004","a67164ad5030c5f42e238ea5a52b7a7d679ef6d22c7e854b7efed1444e1ae531"]
];
export async function matchPracticeImage(canvas){
  const frame=locateFrame(canvas);if(!frame)return null;
  const ctx=document.createElement("canvas").getContext("2d");
  ctx.canvas.width=760;ctx.canvas.height=580;
  ctx.drawImage(canvas,frame.x,frame.y,frame.w,frame.h,0,0,760,580);
  const data=ctx.getImageData(0,0,760,580).data;
  // Existing Gaugebook annotations can obscure a matching line in a screenshot.
  // Exclude only their colored pixels and immediate neighbors from the layout comparison.
  const masked=new Uint8Array(760*580);
  for(let y=3;y<577;y++)for(let x=3;x<757;x++){
    const i=(y*760+x)*4,r=data[i],g=data[i+1],b=data[i+2];
    if((g-r>35&&g-b>8&&g<150)||(r>180&&r-g>35&&g-b>45)){
      for(let j=-3;j<=3;j++)masked.fill(1,(y+j)*760+x-3,(y+j)*760+x+4);
    }
  }
  const zones=[[75,77,420,293],[75,394,420,470],[455,83,740,160],[455,211,665,278],[502,5,676,29]];
  const candidates=[];
  for(const [part,id] of sheets){
    const ref=await reference(part);
    const scores=zones.map(zone=>Math.min(coverage(ref,data,zone,masked),coverage(data,ref,zone,masked)));
    if(Math.min(...scores)>.76)candidates.push({part,id,score:scores.reduce((a,b)=>a+b,0)/scores.length});
  }
  candidates.sort((a,b)=>b.score-a.score);
  if(!candidates.length||candidates[0].score<.87||(candidates[1]&&candidates[0].score-candidates[1].score<.055))return null;
  const {id,part}=candidates[0],layout=practiceLayout(id);
  const map=([x,y])=>[(frame.x+(x*792-16)*frame.w/760)/canvas.width,(frame.y+(y*612-16)*frame.h/580)/canvas.height];
  layout.areas=layout.areas.map(a=>[...map(a.slice(0,2)),...map(a.slice(2))]);
  for(const row of [...layout.rows,...layout.supplemental])row.xy=map(row.xy);
  // If the uploaded screenshot already shows the selected length balloon,
  // place the interactive marker over its amber outline.
  const first=layout.rows[0],sx=(first.xy[0]*canvas.width-frame.x)*760/frame.w;
  const sy=(first.xy[1]*canvas.height-frame.y)*580/frame.h;
  let left=760,right=0,top=580,bottom=0,count=0;
  for(let y=Math.max(0,Math.floor(sy-34));y<Math.min(580,sy+8);y++){
    for(let x=Math.max(0,Math.floor(sx-18));x<Math.min(760,sx+18);x++){
      const i=4*(y*760+x);
      if(data[i]>195&&data[i+1]>100&&data[i+1]<205&&data[i+2]<135&&data[i]-data[i+1]>38){
        left=Math.min(left,x);right=Math.max(right,x);top=Math.min(top,y);bottom=Math.max(bottom,y);count++;
      }
    }
  }
  if(count>22&&right-left>=10&&right-left<=30&&Math.abs(right-left-(bottom-top))<5){
    first.xy=[(frame.x+(left+right)*frame.w/1520)/canvas.width,(frame.y+(top+bottom)*frame.h/1160)/canvas.height];
  }
  return {...layout,part};
}
