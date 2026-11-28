import {propose,drawingAngleDefault,drawingLinearDefaults,definesGeneralTolerance,withGeneralTolerance,dimensionKind,basicValuesFromNotes} from "./callouts.mjs";
import {anchorFor,inside,onFurniture} from "./drawing-areas.mjs";

const number=/(?:\d+[.,]?\d*|[.,]\d+)/;
const feature=/\b(?:CBORE|CSK|DEPTH|DIA|RADIUS|SLOT|THRU|TYP|MAX|MIN|FLATNESS|POSITION|PROFILE|PARALLELISM|PERPENDICULARITY|POCKET|CHAMFER)\b|[Ø⌀±°⌖⌴⏥⊥∥]|\bR\s*\d/i;
const metadata=/\b(?:revision|rev|sheet|scale|title|drawn|projection|training|drawing no|part number)\b/i;
const annotation=/material|finish|deburr|edge|mark|coat|weld|polish|paint|treat|surface/i;
function center(line,w,h){
  const {x0,x1,y0,y1}=line.bbox;return [(x0+x1)/(2*w),(y0+y1)/(2*h)];
}
function label(text){return /^[A-Z]\d?$/.test(text.trim())?text.trim():null;}
function dimension(text){
  return number.test(text)&&(feature.test(text)||/\d[.,]\d|[.,]\d{2,}|^\s*\d+(?:\s*(?:mm|in))?\s*$/i.test(text));
}
// ---- stacked callouts ----------------------------------------------------------------------
// Older and scanned drawings print a tolerance on the lines under its dimension:
//   .5485        1.738       15°      .030 R
//   +.0000       ±.010       ±5°      ±.010
//   -.0005                            2X
//   DIA
// Each stack is read as ONE callout (".5485 +.0000/-.0005 DIA"), so the tolerance stays with it.
const NOMINAL=/^(?:\d+\s*[xX×]\s*)?(?:[Ø⌀]\s*)?(?:\d*\.\d+|\d+\.\d+|\d+°)(?:\s*(?:R|DIA|°))?$/;
const TOLERANCE=/^([±+\-−#])\s*(\d*\.\d+|\d+(?:\.\d+)?)\s*(°)?[^\w.±+\-−]*$/;
const QUALIFIER=/^(?:DIA(?:\s+THRU)?|THRU|REF|BOTH\s+SIDES|COR\.?\s*BRK|R|\d+\s*[xX×]|DP|DEEP|TYP|BSC|BASIC)[^\w]*$/i;
// OCR on scans often misreads the degree sign (o, º, *, %, or a 0: "450") and the ± in front of an
// angle's tolerance (t, f, #, *, or nothing: "5°"). An angle with a small angle printed under it is
// one callout: "45°" over "±5°" -> "45° ±5°".
const DEG="[°ºo*%]";
const ANGLE_NOMINAL=new RegExp("^(\\d{1,3})\\s*"+DEG+"$"),ANGLE_ZERO=/^(\d{1,2})0$/;
const ANGLE_TOL=new RegExp("^[±+#tf*£:]?\\s*(\\d{1,2}(?:\\.\\d+)?)\\s*"+DEG+"$");
function fixAngleStacks(lines){
  const out=lines.map(l=>({...l}));
  for(const top of out){
    const t=top.text.trim(),nominal=t.match(ANGLE_NOMINAL)||t.match(ANGLE_ZERO);
    if(!nominal)continue;
    const h=top.bbox.y1-top.bbox.y0,mid=b=>(b.x0+b.x1)/2;
    const under=out.find(m=>m!==top&&m.bbox.y0>=top.bbox.y1-.5*h&&m.bbox.y0<=top.bbox.y1+.7*h
      &&(Math.abs(m.bbox.x0-top.bbox.x0)<=1.3*h||Math.abs(mid(m.bbox)-mid(top.bbox))<=1.3*h)&&ANGLE_TOL.test(m.text.trim()));
    if(!under)continue;
    const tol=+under.text.trim().match(ANGLE_TOL)[1];
    if(!(tol>0&&tol<=15&&tol<+nominal[1]))continue;
    top.text=nominal[1]+"°";under.text="±"+tol+"°";
  }
  return out;
}
export function joinStacks(lines){
  lines=fixAngleStacks(lines);
  const order=[...lines].sort((a,b)=>a.bbox.y0-b.bbox.y0||a.bbox.x0-b.bbox.x0);
  const taken=new Set(),out=[];
  for(const line of order){
    if(taken.has(line))continue;
    const text=line.text.trim();
    if(!NOMINAL.test(text)){out.push(line);continue;}
    const h=line.bbox.y1-line.bbox.y0,mid=b=>(b.x0+b.x1)/2,parts=[];
    let below=line.bbox;
    for(let k=0;k<5;k++){
      const next=order.find(m=>!taken.has(m)&&m!==line&&!parts.includes(m)
        &&m.bbox.y0>=below.y1-.5*h&&m.bbox.y0<=below.y1+.7*h
        &&(Math.abs(m.bbox.x0-line.bbox.x0)<=1.3*h||Math.abs(mid(m.bbox)-mid(line.bbox))<=1.3*h)
        &&(TOLERANCE.test(m.text.trim())||QUALIFIER.test(m.text.trim())));
      if(!next)break;
      parts.push(next);below=next.bbox;
    }
    if(!parts.length){out.push(line);continue;}
    parts.forEach(p=>taken.add(p));
    const tols=parts.map(p=>p.text.trim().match(TOLERANCE)).filter(Boolean);
    const quals=parts.map(p=>p.text.trim()).filter(t=>QUALIFIER.test(t)).map(t=>t.replace(/[^\w\s.]+$/,"").replace(/\s+/g," ").toUpperCase());
    // "#" is how a scan reads ± in front of an angle ("#5°")
    const plus=tols.find(m=>m[1]==="+"),minus=tols.find(m=>m[1]==="-"||m[1]==="−"),both=tols.find(m=>m[1]==="±"||(m[1]==="#"&&m[3]));
    const deg=m=>m[3]?"°":"";
    // a lone "+x" with no "-y" under it is a ± the scan or OCR misread
    const tol=both?"±"+both[2]+deg(both):plus&&minus?"+"+plus[2]+deg(plus)+"/-"+minus[2]+deg(minus):plus?"±"+plus[2]+deg(plus):minus?"-"+minus[2]:"";
    const count=quals.find(q=>/^\d+\s*[X×]$/.test(q));
    const words=quals.filter(q=>q!==count);
    // the tolerance follows the number itself: ".030 R" + "±.010" -> ".030 ±.010 R"
    const [,lead,value,suffix=""]=text.match(/^(.*?)(\d*\.\d+°?|\d+(?:\.\d+)?°?)((?:\s*(?:R|DIA))*)$/)||[,"",text,""];
    const joined=[count&&count.replace(/\s+/g,"")+" ",lead,value,tol&&" "+tol,suffix,words.length?" "+words.join(" "):""].join("").replace(/\s+/g," ").trim();
    const box={x0:Math.min(line.bbox.x0,...parts.map(p=>p.bbox.x0)),y0:line.bbox.y0,x1:Math.max(line.bbox.x1,...parts.map(p=>p.bbox.x1)),y1:below.y1};
    out.push({...line,text:joined,bbox:box,lineH:h,stacked:true,fromPdfText:line.fromPdfText&&parts.every(p=>p.fromPdfText)});
  }
  return out;
}

// ---- general tolerance tables read by OCR ---------------------------------------------------
// A title-block table such as
//   GENERAL TOLERANCES / UNLESS OTHERWISE SPECIFIED
//   .XX   ±.01 IN
//   .XXX  ±.005 IN
// often comes out of OCR in pieces ("XX", "-01 IN"; "+ XXX", "-005 IN"): the point and ± are lost
// or read as - or +. The pieces on one row of the table are put back together and read here.
const TABLE_HEADING=/GENERAL\s+TOL|UNLESS\s+OTHERWISE\s+(?:SPECIFIED|STATED|NOTED)|TOLERANCES?\s*(?:UNLESS|:)/i;
const TABLE_ROW=/(?:^|\s)[.+\-·,:]?\s*(X{2,4})\b(?:.*?)([±+\-—–.,:])\s*(\d{1,4})\s*(?:IN|MM|")?\.?\s*$/i;
export function generalToleranceTable(lines,width,height){
  const rules=new Map();
  for(const head of lines.filter(l=>TABLE_HEADING.test(l.text))){
    const x0=head.bbox.x0-width*.02,x1=head.bbox.x0+width*.3,y0=head.bbox.y0,y1=head.bbox.y0+height*.2;
    const inTable=lines.filter(l=>l!==head&&l.bbox.x0>=x0&&l.bbox.x0<=x1&&l.bbox.y0>=y0&&l.bbox.y0<=y1)
      .sort((a,b)=>a.bbox.y0-b.bbox.y0||a.bbox.x0-b.bbox.x0);
    const rows=[];
    for(const l of inTable){
      const cy=(l.bbox.y0+l.bbox.y1)/2,h=Math.max(4,l.bbox.y1-l.bbox.y0);
      const row=rows.find(r=>Math.abs(r.cy-cy)<=Math.max(h,r.h)*.6);
      if(row)row.parts.push(l);else rows.push({cy,h,parts:[l]});
    }
    for(const row of rows){
      const text=row.parts.sort((a,b)=>a.bbox.x0-b.bbox.x0).map(p=>p.text.trim()).filter(Boolean).join(" ");
      const m=text.match(TABLE_ROW);
      if(!m)continue;
      const decimals=m[1].length,tolText="."+m[3],tol=Number(tolText);
      // a tolerance always has fewer or as many decimals as the values it applies to ".XXX ±.005"
      if(!(tol>0&&tol<1)||m[3].length>decimals+1)continue;
      if(!rules.has(decimals))rules.set(decimals,{tol,tolText,label:"."+"X".repeat(decimals)+" ±"+tolText});
    }
  }
  return rules;
}

// ---- Ø read as 9 --------------------------------------------------------------------------
// OCR reads a slashed Ø as the digit 9: "Ø1.500" -> "91.500". On a sheet whose other sizes are
// all small, a value that only becomes huge because of a leading 9 is a diameter.
export function repairDiameterNines(lines){
  const value=t=>{const m=t.match(/^\s*(?:\d+\s*[xX×]\s*)?(\d*\.\d+)/);return m?Number(m[1]):null;};
  const others=lines.map(l=>l.text.trim()).filter(t=>!/^(?:\d+\s*[xX×]\s*)?9\d*\.\d/.test(t)).map(value).filter(v=>v>0);
  if(others.length<2)return lines;
  const largest=Math.max(...others);
  return lines.map(l=>{
    const m=l.text.trim().match(/^((?:\d+\s*[xX×]\s*)?)9(\d*\.\d+)(.*)$/);
    if(!m)return l;
    const full=Number("9"+m[2]),rest=Number(m[2]);
    if(!(full>largest*5&&rest<=largest*5))return l;
    return {...l,text:m[1]+"Ø"+m[2]+m[3]};
  });
}

// ---- GD&T feature control frames ----------------------------------------------------------
// A frame such as  ⌖ | Ø .005 Ⓜ | B Ⓜ | A Ⓜ  is a characteristic too. Scans read it as symbol soup
// ("e[g_.005 @[B @JA", "6] .005 MAM", ".005®"). From that the tolerance, its Ⓜ/Ⓛ modifier and the
// datum letters can still be read; the geometric symbol itself cannot, so the inspector confirms it.
const FRAME_SIGNS=/[⌖⊕⌀Ø@®©Ⓜ\[\]|]|\bMAM\b|(?:^|[^A-Z])M(?:[^A-Z]|$)/;
const FRAME_VALUE=/(?:^|[^\d.])(0?\.\d{2,4})(?![\d.])/;
export function datumLetters(lines){
  const found=new Set();
  for(const {text} of lines){const m=text.trim().match(/^[-–—]\s*([A-HJ-LN-Z])\s*[-–—]$/);if(m)found.add(m[1]);}
  return found;
}
export function readFrame(text,datums){
  const t=text.trim();
  if(/[±]|\+\s*\.?\d|\bREF\b|°/.test(t))return null;            // a dimension, not a frame
  const v=t.match(FRAME_VALUE);
  if(!v||!FRAME_SIGNS.test(t))return null;
  const tol=Number(v[1]);
  if(!(tol>0&&tol<=.1))return null;
  const allowed=datums?.size?datums:new Set("ABCDEF");
  const at=t.indexOf(v[1]),after=t.slice(at+v[1].length);
  // Ⓜ reads as @, ® or a plain M (never a datum letter: datums skip I, O, Q and are listed on the sheet)
  const modifier=s=>/^\s*[@®Ⓜ]/.test(s)||(/^\s*M/.test(s)&&!allowed.has("M"))?" Ⓜ":/^\s*Ⓛ/.test(s)?" Ⓛ":"";
  const diameter=/[Ø⌀g9][\s_]*$/.test(t.slice(0,at))?"Ø":"";
  const refs=[];
  for(const m of after.matchAll(/[A-Z]/g)){
    const letter=m[0],rest=after.slice(m.index+1);
    if(letter==="M"&&!allowed.has("M"))continue;
    if(!allowed.has(letter)||refs.some(r=>r[0]===letter))continue;
    refs.push(letter+modifier(rest));
  }
  const value=diameter+(v[1].startsWith("0")?v[1].slice(1):v[1])+modifier(after);
  return {tol,source:"GD&T "+[value,...refs].join(" | ")};
}

// ---- text that is not a requirement ---------------------------------------------------------
const titleBlockWord=/\b(?:DRAWN|DWN|CHK|CHECKED|APPROVED|APPR|ENGR|MFG|QUAL|RELEASED|TITLE|SCALE|SHEET|SIZE|FSCM|CAGE|DRAWING NO|DWG\.? NO|NOMENCLATURE|PART NO|QTY|CONTR NO|PROJ|HEAT TREAT|HARDNESS|SPEC NO|ASSEMBLY NO)\b/i;
// The title block: the box around the title-block labels in the lower part of the sheet.
function titleBlock(lines,height){
  const marks=lines.filter(l=>l.bbox.y0>height*.55&&titleBlockWord.test(l.text));
  if(marks.length<3)return null;
  return {x0:Math.min(...marks.map(l=>l.bbox.x0)),y0:Math.min(...marks.map(l=>l.bbox.y0))-height*.01};
}

// The balloon goes just before the start of its dimension text, level with its first line, so it
// never covers the value. If that spot is taken by another balloon, is off the sheet or in the border
// or title block, it tries further left, then after the text, then above and below it.
const R={x:.012,y:.0155};  // a balloon's half size as a fraction of the sheet, as shown on screen
// texts (optional): other text on the sheet as [x0,y0,x1,y1] fractions; a balloon must not cover it.
export function startOfText(line,width,height,used,furniture,texts=[]){
  const {x0,y0,x1,y1}=line.bbox,h=line.lineH||(y1-y0);
  const vertical=y1-y0>2.5*(x1-x0)&&!line.stacked;     // text running up the sheet starts at its bottom
  const cy=(y0+h/2)/height,cx=(x0+x1)/2/width,gap=R.x+.003;
  const spots=vertical
    ?[[cx,y1/height+R.y+.003],[cx,y0/height-R.y-.003],[x0/width-gap,(y0+y1)/2/height]]
    :[[x0/width-gap,cy],[x0/width+R.x*.5,y0/height-R.y-.003],[x1/width+gap,cy],[x0/width+R.x*.5,y1/height+R.y+.003],[x0/width-gap-2*R.x,cy]];
  const own=[x0/width,y0/height,x1/width,y1/height];
  const covers=p=>texts.some(b=>b!==own&&!(b[0]===own[0]&&b[1]===own[1])&&p[0]+R.x>b[0]&&p[0]-R.x<b[2]&&p[1]+R.y>b[1]&&p[1]-R.y<b[3]);
  const free=p=>p[0]>R.x&&p[0]<1-R.x&&p[1]>R.y&&p[1]<1-R.y&&!onFurniture(furniture,p)
    &&used.every(q=>Math.hypot((p[0]-q[0])/(2*R.x),(p[1]-q[1])/(2*R.y))>=1);
  // a balloon must read as belonging to its own text: no other text may be closer to it
  const dist=(p,b)=>Math.hypot(Math.max(b[0]-p[0],0,p[0]-b[2]),Math.max(b[1]-p[1],0,p[1]-b[3]));
  const clear=p=>texts.every(b=>(b[0]===own[0]&&b[1]===own[1])||dist(p,b)>dist(p,own)+.002);
  return spots.find(p=>free(p)&&!covers(p)&&clear(p))||spots.find(p=>free(p)&&!covers(p))||spots.find(free)||spots[0];
}
// boxed (optional): bbox => true when the text is drawn inside a box (a basic dimension).
// furniture (optional): the sheet's frame and title/revision blocks (see sheetFurniture).
export function generalRows(lines,areas,width,height,boxed,furniture){
  const rows=[],used=[];
  lines=repairDiameterNines(joinStacks(lines));
  // A bare value next to the same value WITH its tolerance is a second reading of one callout.
  const valueOf=t=>(t.match(/\d*\.\d+|\d+(?:\.\d+)?/)||[])[0];
  lines=lines.filter(l=>{
    const t=l.text.trim();
    if(!NOMINAL.test(t))return true;
    const h=l.bbox.y1-l.bbox.y0,cx=(l.bbox.x0+l.bbox.x1)/2,cy=(l.bbox.y0+l.bbox.y1)/2;
    const near=o=>Math.abs((o.bbox.x0+o.bbox.x1)/2-cx)<Math.max(10*h,width*.05)&&Math.abs(o.bbox.y0-l.bbox.y0)<3*h;
    const sameValue=o=>/[±+\-]\s*\.?\d|REF/.test(o.text)&&valueOf(o.text)===valueOf(t)&&near(o);
    // a bare value lying inside a merged stack is a misreading of one of its lines (".910" for "±.010")
    const inStack=o=>o.stacked&&cx>=o.bbox.x0-h&&cx<=o.bbox.x1+h&&cy>=o.bbox.y0&&cy<=o.bbox.y1+h;
    return !lines.some(o=>o!==l&&(sameValue(o)||inStack(o)));
  });
  // GD&T frames: one per place (a scan's text layer and OCR can each read the same frame)
  const datums=datumLetters(lines),frames=[];
  for(const l of lines){
    const f=readFrame(l.text,datums);if(!f)continue;
    // pieces of one frame on one row (OCR often splits it at its cell dividers)
    const h=l.bbox.y1-l.bbox.y0,same=frames.find(o=>Math.abs(o.line.bbox.y0-l.bbox.y0)<h&&o.line.bbox.x0<l.bbox.x1+5*h&&l.bbox.x0<o.line.bbox.x1+5*h);
    if(!same)frames.push({line:l,...f});
    else if(f.source.split("|").length>same.source.split("|").length)Object.assign(same,{line:l,...f});
  }
  const frameLines=new Set(frames.map(f=>f.line));
  lines=lines.filter(l=>!readFrame(l.text,datums)||frameLines.has(l));
  const tb=titleBlock(lines,height);
  // On a drawing whose dimensions are decimals, a bare whole number (a border zone, a 250 surface
  // finish mark, a note or revision flag, the drawing number) is not a dimension.
  // Inch drawings write values with a leading point (".500"); five or more of those mark one.
  const decimalDrawing=lines.filter(l=>/(?:^|[^\d])\.\d{2,4}(?!\d)/.test(l.text)).length>=5;
  const notRequirement=line=>{
    const t=line.text.trim(),{x0,y0,x1,y1}=line.bbox,cx=(x0+x1)/2,cy=(y0+y1)/2;
    if(cx<width*.03||cx>width*.97||cy<height*.03||cy>height*.97)return true;           // border zone labels
    if(onFurniture(furniture,[cx/width,cy/height],[x0/width,y0/height,x1/width,y1/height]))return true;                          // outside the frame, or in a title or revision block
    if(tb&&x0>=tb.x0-width*.01&&y0>=tb.y0)return true;                                   // title block
    if(/\b\d{2}[-/]\d{2}[-/]\d{2,4}\b/.test(t))return true;                              // dates
    if(TOLERANCE.test(t))return true;                                                     // a tolerance left without its dimension
    if(/[®@©\[\]]/.test(t))return true;                                                  // unreadable frame or flag fragments
    if(/^(?:Ra\s*)?\d+(?:\.\d+)?\s*[√✓\/]$/.test(t))return true;                          // surface finish mark
    if(decimalDrawing&&!/[.°]/.test(t)&&/^[\dXx×\sØ⌀R]+$/.test(t))return true;              // bare whole number
    return false;
  };
  const angular=drawingAngleDefault(lines);
  const general=drawingLinearDefaults(lines);
  for(const [decimals,rule] of generalToleranceTable(lines,width,height))if(!general.has(decimals))general.set(decimals,rule);
  const basicValues=basicValuesFromNotes(lines);
  // Basic and reference dimensions keep just the dimension; plain ones take the title-block tolerance.
  const classify=(p,line)=>{
    if(p.bounds)return p;
    const kind=dimensionKind(p.source,{basicValues,boxed:()=>!!boxed?.(line.bbox)});
    return kind?{...p,basic:true,basicReason:kind}:withGeneralTolerance(p,general);
  };
  // other text a balloon must not cover (very large boxes are OCR noise over hatching or views)
  const texts=lines.filter(l=>/\d|[A-Z]{2}/i.test(l.text)&&l.bbox.x1-l.bbox.x0<width*.2&&l.bbox.y1-l.bbox.y0<height*.06)
    .map(l=>[l.bbox.x0/width,l.bbox.y0/height,l.bbox.x1/width,l.bbox.y1/height]);
  const sideHeadings=lines.filter(l=>/^(?:feature requirements|feature center locations|inspection notes|general notes|hole (?:table|chart)|coordinates|bill of materials|revision history)\s*:?$/i.test(l.text.trim()));
  const frameOf=new Map(frames.map(f=>[f.line,f]));
  for(const line of lines){
    const frame=frameOf.get(line);
    if(frame){   // numbered in reading order with the dimensions around it
      const point=center(line,width,height),box=[line.bbox.x0/width,line.bbox.y0/height,line.bbox.x1/width,line.bbox.y1/height];
      if(onFurniture(furniture,point,box)||!anchorFor(areas,...point))continue;
      const xy=startOfText(line,width,height,used,furniture,texts);used.push(xy);
      rows.push({source:frame.source,name:frame.source,bounds:[0,frame.tol],count:1,gdt:true,sourceBox:box,xy,off:false,fromPdfText:!!line.fromPdfText});
      continue;
    }
    const text=line.text.trim(),point=center(line,width,height);
    if(!text||notRequirement(line)||metadata.test(text)||label(text)||definesGeneralTolerance(text)||/\b(?:ANG(?:ULAR)?|ANGLES?)\s*(?:TOL(?:ERANCES?)?\.?)?\s*[:=]?\s*(?:±|\+\s*\/\s*[-−]|\+(?=\s*\.?\d))/i.test(text))continue;
    const tag=text.match(/^([A-Z]\d?)\s+(?=\d|Ø|⌀|CBORE|SLOT|DIA|POCKET|R\d)/i);
    const isDim=dimension(text.replace(/^\s*\d+\s*[xX×]\s*/, ""));
    if(!isDim&&!annotation.test(text))continue;
    const prose=annotation.test(text)||/\b(?:notes?|certificate|specification|unless|coordinate[s]?|table|locations?|tolerances apply|per\s+(?:ASME|ISO|MIL)|aluminum|stainless|steel)\b/i.test(text);
    const remoteTag=tag&&!inside(areas,point);
    const inPanel=sideHeadings.some(h=>line.bbox.y0>=h.bbox.y0&&line.bbox.x0>=h.bbox.x0-width*.012&&line.bbox.x0<h.bbox.x0+width*.34);
    const proposals=propose(tag?text.slice(tag[0].length):text,prose?null:angular)
      .map(p=>prose||inPanel?p:classify(p,line));
    for(const p of proposals){
      const anchor=isDim&&!prose&&!remoteTag&&!inPanel?anchorFor(areas,...point):null;
      // Only callouts on the drawing views get balloons. Text beside the drawing (notes, requirement
      // lists, tables, title block) is ignored; the inspector can still add a balloon by hand.
      if(!anchor)continue;
      const xy=startOfText(line,width,height,used,furniture,texts);
      used.push(xy);
      rows.push({...p,sourceBox:[line.bbox.x0/width,line.bbox.y0/height,line.bbox.x1/width,line.bbox.y1/height],xy,off:!anchor,name:tag?tag[1]+" · "+p.source:p.source,fromPdfText:!!line.fromPdfText});
    }
  }
  return rows;
}
