import {repairOcrText} from "./callouts.mjs";
import {getDocument,GlobalWorkerOptions,Util} from "./vendor/pdf.min.mjs";
import {matchesRaster} from "./vision.mjs";
GlobalWorkerOptions.workerSrc=new URL("./vendor/pdf.worker.min.mjs",import.meta.url).href;
const W=1400,H=1082;
function canvas(w,h) {
  const c=document.createElement("canvas");c.width=w;c.height=h;return c;
}
function scaled(source,w,h) {
  if(Math.abs(w/h-W/H)>.005)throw Error("Use the full, upright SMP-1001 sheet with its original margins.");
  const c=canvas(W,H),ctx=c.getContext("2d");ctx.fillStyle="white";ctx.fillRect(0,0,W,H);ctx.drawImage(source,0,0,W,H);return c;
}
async function render(blob) {
  if((await blob.slice(0,5).text())!=="%PDF-") {
    const img=await createImageBitmap(blob);
    try {return scaled(img,img.width,img.height);} finally {img.close();}
  }
  const doc=await getDocument({data:await blob.arrayBuffer(),isEvalSupported:false}).promise;
  try {
    if(doc.numPages!==1)throw Error("Select the single-sheet adapter plate drawing.");
    const page=await doc.getPage(1),unit=page.getViewport({scale:1}),viewport=page.getViewport({scale:W/unit.width});
    if(Math.abs(unit.width/unit.height-W/H)>.005)throw Error("Drawing proportions do not match the training sheet.");
    const c=canvas(W,H);
    await page.render({canvasContext:c.getContext("2d"),viewport,background:"white"}).promise;
    return c;
  } finally {await doc.destroy();}
}
async function resource(path) {
  const response=await fetch(path);if(!response.ok)throw Error("Could not load "+path);
  return response.blob();
}
function pixels(c) {return c.getContext("2d").getImageData(0,0,W,H).data;}
const references=new Map();
async function reference(path) {
  if(!references.has(path))references.set(path,resource(path).then(render).then(pixels));
  return references.get(path);
}
export async function readDrawing(file) {
  const c=await render(file||await resource("sample.pdf")),data=pixels(c);
  for(const path of ["drawing.png","sample.pdf"]) {
    if(matchesRaster(data,await reference(path),W,H)) return c;
  }
  throw Error("The image differs from the reviewed Rev A sheet. Use the original PDF or its full-page PNG. Changed or unrecognized callouts need review.");
}
export function sourceCrop(page,row) {
  const [x,y,w,h]=row.crop,turned=[2,3].includes(row.id);
  const c=canvas(3*(turned?h:w),3*(turned?w:h)),ctx=c.getContext("2d");
  ctx.scale(3,3);
  if(turned){ctx.translate(h,0);ctx.rotate(Math.PI/2);}
  ctx.drawImage(page,x,y,w,h,0,0,w,h);
  return c;
}
let worker,ocrProgress=null;
// Progress reports from the OCR engine (status text and 0-1 fraction), used for on-screen progress.
const ocrLogger=m=>ocrProgress?.(m.status,m.progress);
async function workerInstance() {
  const {default:Tesseract}=await import("./vendor/ocr/tesseract.esm.min.js");
  const asset=name=>new URL("./vendor/ocr/"+name,import.meta.url).href;
  worker??=Tesseract.createWorker("eng",1,{workerPath:asset("worker.min.js"),corePath:asset("tesseract-core-lstm.wasm.js"),langPath:asset(""),workerBlobURL:false,logger:ocrLogger}).then(async w=>{await w.setParameters({tessedit_pageseg_mode:"6"});return w;}).catch(e=>{worker=undefined;throw e;});
  return worker;
}
export async function recognize(crop) {
  return (await (await workerInstance()).recognize(crop)).data.text.trim();
}
export async function sheetLines(canvas){
  const engine=await workerInstance();
  await engine.setParameters({tessedit_pageseg_mode:"11"});
  const {data}=await engine.recognize(canvas,{}, {blocks:true});
  return (data.blocks||[]).flatMap(b=>b.paragraphs.flatMap(p=>p.lines));
}
export async function openSheets(file){
  if((await file.slice(0,5).text())==="%PDF-"){
    const doc=await getDocument({data:await file.arrayBuffer(),isEvalSupported:false}).promise;
    return {count:doc.numPages,async labels(pageNumber){
      // Raster geometry locates the views. Embedded labels, when present, resolve OCR glyph ambiguities.
      const page=await doc.getPage(pageNumber),base=page.getViewport({scale:1});
      const viewport=page.getViewport({scale:2600/Math.max(base.width,base.height)});
      const {items}=await page.getTextContent();
      const lines=[];
      for(const item of items){
        if(!item.str?.trim())continue;
        const [a,b,c,d,x,y]=Util.transform(viewport.transform,item.transform);
        const length=Math.hypot(a,b)||1,dx=a/length*item.width*viewport.scale,dy=b/length*item.width*viewport.scale;
        const xs=[x,x+dx,x+c*.8,x+dx+c*.8],ys=[y,y+dy,y+d*.8,y+dy+d*.8];
        lines.push({text:item.str.trim(),bbox:{x0:Math.min(...xs),y0:Math.min(...ys),x1:Math.max(...xs),y1:Math.max(...ys)}});
      }
      return lines;
    },async render(pageNumber){
      const page=await doc.getPage(pageNumber),base=page.getViewport({scale:1});
      const viewport=page.getViewport({scale:2600/Math.max(base.width,base.height)});
      const c=canvas(Math.ceil(viewport.width),Math.ceil(viewport.height));
      await page.render({canvasContext:c.getContext("2d"),viewport,background:"white"}).promise;
      return c;
    }};
  }
  const img=await createImageBitmap(file),scale=Math.min(1,3000/Math.max(img.width,img.height));
  return {count:1,async render(){
    const c=canvas(Math.max(1,Math.round(img.width*scale)),Math.max(1,Math.round(img.height*scale)));
    const ctx=c.getContext("2d");ctx.fillStyle="white";ctx.fillRect(0,0,c.width,c.height);ctx.drawImage(img,0,0,c.width,c.height);return c;
  }};
}

// Read vertically printed dimensions in their natural orientation, then map the boxes back.
// onProgress(fraction 0-1, label) is optional and reports both OCR passes as one.
export async function dimensionLines(canvas,onProgress){
  const pass=(from,to)=>(status,p)=>{
    if(!onProgress)return;
    if(status==="recognizing text")onProgress(from+(to-from)*p,"Reading dimensions");
    else if(/loading|initializ/i.test(status||""))onProgress(from,"Starting the text reader");
  };
  ocrProgress=pass(0,.6);
  try{return await readBoth(canvas,()=>{ocrProgress=pass(.6,1);});}
  finally{ocrProgress=null;}
}
async function readBoth(canvas,secondPass){
  const upright=await sheetLines(canvas);
  secondPass();
  const turned=document.createElement("canvas");turned.width=canvas.height;turned.height=canvas.width;
  const ctx=turned.getContext("2d");ctx.translate(canvas.height,0);ctx.rotate(Math.PI/2);ctx.drawImage(canvas,0,0);
  const vertical=(await sheetLines(turned)).filter(l=>l.confidence>=45&&/[.±Ø⌀°]/.test(l.text)&&/\d/.test(l.text));
  for(const {bbox:b,...line} of vertical){
    const box={x0:b.y0,y0:canvas.height-b.x1,x1:b.y1,y1:canvas.height-b.x0};
    if(box.y1-box.y0<1.25*(box.x1-box.x0))continue;
    const overlaps=upright.some(({bbox:q,text})=>text.trim()===line.text.trim()&&q.x0<box.x1&&q.x1>box.x0&&q.y0<box.y1&&q.y1>box.y0);
    if(!overlaps)upright.push({...line,bbox:box});
  }
  return upright.map(line=>({...line,text:repairOcrText(line.text)}));
}

// Combine text fragments on one dimension line without joining distant table columns.
export function verifiedImageLines(ocr,embedded){
  if(!embedded.length)return ocr;
  const combined=[];
  for(const item of embedded){
    const prev=combined.at(-1),p=prev?.bbox,b=item.bbox,h=b.y1-b.y0;
    if(p&&h>0&&Math.abs(p.y1-b.y1)<h*.24&&Math.abs(p.y0-b.y0)<h*.32&&b.x0>=p.x1-h*.15&&b.x0-p.x1<h*.7){
      prev.text+=" "+item.text;p.x1=b.x1;p.y0=Math.min(p.y0,b.y0);
    }else combined.push({text:item.text,bbox:{...b}});
  }
  function covered({bbox:b}){
    return combined.some(({bbox:p})=>{
      const x=Math.min(b.x1,p.x1)-Math.max(b.x0,p.x0),y=Math.min(b.y1,p.y1)-Math.max(b.y0,p.y0);
      return x>0&&y>0&&x*y>(b.x1-b.x0)*(b.y1-b.y0)*.54;
    });
  }
  return [...combined,...ocr.filter(line=>!covered(line))];
}
