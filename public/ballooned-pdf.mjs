// Builds a ballooned drawing PDF for the FAI package: each sheet image with its numbered
// balloons in the usual print style (white circle, dark outline and number, no pass/fail colours).
// Loaded only when the user asks for the download, so pages do not carry pdf-lib up front.
import {PDFDocument,StandardFonts,rgb} from "./vendor/pdf-lib.mjs";

const INK=rgb(.07,.2,.18);
const MAX_SIDE=1224; // points: 17 in, so an A3/B-size sheet keeps readable detail

async function canvasPng(source){
  let c=source;
  if(!(source instanceof HTMLCanvasElement)){ // an <img>
    c=document.createElement("canvas");c.width=source.naturalWidth;c.height=source.naturalHeight;
    c.getContext("2d").drawImage(source,0,0);
  }
  const blob=await new Promise(done=>c.toBlob(done,"image/png"));
  return new Uint8Array(await blob.arrayBuffer());
}

// sheets: [{image: canvas|img, balloons: [{x, y, label}]}] with x, y as fractions of the sheet (0-1).
export async function balloonedDrawingPdf(sheets,{title}){
  const pdf=await PDFDocument.create();
  pdf.setTitle(title);pdf.setCreator("Gaugebook");
  const font=await pdf.embedFont(StandardFonts.HelveticaBold);
  for(const sheet of sheets){
    const image=await pdf.embedPng(await canvasPng(sheet.image));
    const scale=MAX_SIDE/Math.max(image.width,image.height);
    const W=image.width*scale,H=image.height*scale;
    const page=pdf.addPage([W,H]);
    page.drawImage(image,{x:0,y:0,width:W,height:H});
    const r=Math.max(6.5,Math.min(W,H)*.0115);
    for(const {x,y,label} of sheet.balloons){
      const cx=x*W,cy=H-y*H;
      page.drawCircle({x:cx,y:cy,size:r,color:rgb(1,1,1),borderColor:INK,borderWidth:Math.max(1,r*.13)});
      const size=r*(label.length>2?.78:label.length>1?.95:1.1);
      page.drawText(label,{x:cx-font.widthOfTextAtSize(label,size)/2,y:cy-size*.36,size,font,color:INK});
    }
  }
  return pdf.save();
}

export function saveFile(bytes,name){
  const url=URL.createObjectURL(new Blob([bytes],{type:"application/pdf"}));
  const a=document.createElement("a");a.href=url;a.download=name;document.body.append(a);a.click();a.remove();
  setTimeout(()=>URL.revokeObjectURL(url),10000);
}
