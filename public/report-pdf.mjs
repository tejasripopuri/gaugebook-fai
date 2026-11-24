import {PDFDocument,StandardFonts,rgb} from "./vendor/pdf-lib.mjs";
import {identity,partFields,indexedParts} from "./report-data.mjs";
export async function makePacket(template,report,results,forms){
  const source=await PDFDocument.load(template),pdf=await PDFDocument.create();
  const font=await pdf.embedFont(StandardFonts.Helvetica),pages=[];
  const p=report.part;
  function norm(value){
    return String(value??"").replace(/[^\x20-\x7E\xA0-\xFF⊥⏥]/gu,ch=>({"⌀":"Ø","⌖":"position","∥":"parallelism","⌭":"cylindricity","⌯":"symmetry","°":"deg","−":"-","µ":"u","≤":"<=","≥":">=","⌴":"counterbore","↧":"depth","⌵":"countersink","–":"-","·":"·","⌓":"profile of surface","⌒":"profile of line"}[ch]||"U+"+ch.codePointAt(0).toString(16).toUpperCase())).replace(/⊥/g,"perpendicularity").replace(/⏥/g,"flatness").replace(/[\r\n\t]+/g," ");
  }
  function lines(value,width,size){
    const text=norm(value);if(!text)return [];
    const out=[];let line="";
    for(const word of text.split(/\s+/)){
      if(line && font.widthOfTextAtSize(line+" "+word,size)>width){out.push(line);line="";}
      for(const ch of (line?" ":"")+word){
        if(line && font.widthOfTextAtSize(line+ch,size)>width){out.push(line);line="";}
        line+=ch;
      }
    }
    if(line)out.push(line);return out;
  }
  function write(page,value,x,top,width,height,size=8){
    let text=lines(value,width-4,size);
    while(size>5 && text.length*(size+1)>height){size-=0.5;text=lines(value,width-4,size);}
    if(text.length*(size+1)>height)throw Error("Field too long for the template: "+String(value).slice(0,40));
    text.forEach((line,i)=>page.drawText(line,{x:page.getMediaBox().x+x+2,y:page.getMediaBox().y+page.getHeight()-top-size-i*(size+1),size,font,color:rgb(.04,.15,.18)}));
  }
  async function sheet(index){
    const [page]=await pdf.copyPages(source,[index]);pdf.addPage(page);pages.push(page);return page;
  }
  function columns(page,values,xs,top,h,size){
    values.forEach((v,i)=>write(page,v,xs[i],top,xs[i+1]-xs[i],h,size));
  }
  if(forms.includes(1)){
    const components=indexedParts(report);
    const breaks=[224.2,233.4,244.3,255.2,266.2,277.1,288,298.9,309.8,320.8,332.2,343.6,355,366.4,377.8,389.2,400.6,412,423.4,434.8,446.2,457.6,469,480.4,491.8,503.2,514.6,526,537.4,548.8,560.2,571.6,583,594.4,605.8];
    const capacity=breaks.length-1;
    for(let start=0;start<Math.max(components.length,1);start+=capacity){
    const page=await sheet(0),xs=[30,175,346,462,589];
    components.slice(start,start+capacity).forEach((values,i)=>columns(page,values,[30,175,346,501,589],breaks[i]+1,breaks[i+1]-breaks[i]-1,7));
    for(const [fields,y] of [[identity,63],[partFields.slice(0,4),94],[partFields.slice(4),124]])columns(page,fields.map(k=>p[k]),xs,y,18,8);
    write(page,"X",95,p.kind==="Assembly"?156:144,14,9,7);
    if(p.scope)write(page,"X",p.scope==="Full"?222:391,144,15,9,7);
    write(page,p.baseline,311,156,272,9,7);write(page,p.reason,253,166,333,10,7);
    if(p.nc)write(page,"X",p.nc==="Yes"?368:404,608,14,10,7);
    for(const [name,date,y] of [["Verified by","Verification date",638],["Reviewed / approved by","Review date",660]]){
      write(page,p[name],30,y,470,11);write(page,p[date],501,y,87,11);
    }
  }
  }
  // Each variable-height record uses a whole number of original template rows.
  async function table(index,data,xs,start,rowHeight,capacity,size,header,footer){
    let page,used=0;
    async function newPage(){page=await sheet(index);used=0;header(page);if(footer)footer(page);}
    await newPage();
    for(const record of data){
      const count=Math.max(1,...record.map((v,i)=>lines(v,xs[i+1]-xs[i]-5,size).length));
      const slots=Math.ceil((count*(size+1)+4)/rowHeight);
      if(slots>capacity)throw Error("A report entry exceeds one template page.");
      if(used+slots>capacity)await newPage();
      const top=start+used*rowHeight,h=slots*rowHeight;
      for(let i=0;i<record.length;i++){
        const w=xs[i+1]-xs[i];page.drawRectangle({x:page.getMediaBox().x+xs[i]+1.2,y:page.getMediaBox().y+page.getHeight()-top-h+1,width:w-2.2,height:h-2,color:rgb(1,1,1)});
        write(page,record[i],xs[i]+.5,top+2,w-1,h-3,size);
      }
      used+=slots;
    }
  }
  const ids=identity.map(k=>p[k]);
  if(forms.includes(2)){
    await table(1,report.products.map(r=>Array.from({length:6},(_,i)=>r[i]||"")),[46.5,151,248.8,325,404.2,489.3,570.7],160.4,15.48,18,7,
      page=>columns(page,ids,[46.5,151,248.8,404.2,570.7],98,15,8),
      page=>{write(page,report.tests["Functional test procedure"],47,463,277,85);write(page,report.tests["Acceptance report"],325,463,244,85);write(page,report.tests.Comments,47,572,521,135);});
  }
  if(forms.includes(3)){
    const records=results.map(r=>[r.balloon,r.location,r.designator,r.requirement,r.result,r.tool,r.nc,r.comments]);
    await table(2,records,[34.3,88.8,212,296.4,394.9,475.6,552.5,622.7,765.2],196.5,15.48,22,7,
      page=>columns(page,ids,[34.3,394.9,622.7,696.6,765.2],109,31,8));
  }
  pages.forEach((page,i)=>{
    const x=page.getWidth()>700?666:487;
    page.drawRectangle({x:page.getMediaBox().x+x,y:page.getMediaBox().y+page.getHeight()-38,width:91,height:22,color:rgb(1,1,1)});
    write(page,"Sheet "+(i+1)+" of "+pages.length,x,20,92,16,9);
  });
  pdf.setTitle((p["Part number"]||p["Part name"]||"Drawing")+" · First article inspection");return pdf.save();
}
