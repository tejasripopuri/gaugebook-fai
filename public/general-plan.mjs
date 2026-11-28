import {propose,drawingAngleDefault,drawingLinearDefaults,definesGeneralTolerance,withGeneralTolerance,dimensionKind,basicValuesFromNotes} from "./callouts.mjs";
import {anchorFor,inside} from "./drawing-areas.mjs";

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
export function joinStacks(lines){
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
    out.push({...line,text:joined,bbox:box,stacked:true,fromPdfText:line.fromPdfText&&parts.every(p=>p.fromPdfText)});
  }
  return out;
}

// ---- text that is not a requirement ---------------------------------------------------------
const titleBlockWord=/\b(?:DRAWN|DWN|CHK|CHECKED|APPROVED|APPR|ENGR|MFG|QUAL|RELEASED|TITLE|SCALE|SHEET|SIZE|FSCM|CAGE|DRAWING NO|DWG\.? NO|NOMENCLATURE|PART NO|QTY|CONTR NO|PROJ|HEAT TREAT|HARDNESS|SPEC NO|ASSEMBLY NO)\b/i;
// The title block: the box around the title-block labels in the lower part of the sheet.
function titleBlock(lines,height){
  const marks=lines.filter(l=>l.bbox.y0>height*.55&&titleBlockWord.test(l.text));
  if(marks.length<3)return null;
  return {x0:Math.min(...marks.map(l=>l.bbox.x0)),y0:Math.min(...marks.map(l=>l.bbox.y0))-height*.01};
}

function place(point,areas,used){
  // Keep adjacent dimension and depth balloons individually selectable at ordinary zoom.
  for(let ring=0;ring<5;ring++){
    const steps=ring?8*ring:1;
    for(let j=0;j<steps;j++){
      const angle=j*2*Math.PI/steps;
      const candidate=[point[0]+ring*.022*Math.cos(angle),point[1]+ring*.028*Math.sin(angle)];
      if(inside(areas,candidate)&&used.every(p=>Math.hypot((candidate[0]-p[0])/.020,(candidate[1]-p[1])/.026)>=1))return candidate;
    }
  }
  return point;
}
// boxed (optional): bbox => true when the text is drawn inside a box (a basic dimension).
export function generalRows(lines,areas,width,height,boxed){
  const rows=[],used=[];
  lines=joinStacks(lines);
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
  const tb=titleBlock(lines,height);
  // On a drawing whose dimensions are decimals, a bare whole number (a border zone, a 250 surface
  // finish mark, a note or revision flag, the drawing number) is not a dimension.
  // Inch drawings write values with a leading point (".500"); five or more of those mark one.
  const decimalDrawing=lines.filter(l=>/(?:^|[^\d])\.\d{2,4}(?!\d)/.test(l.text)).length>=5;
  const notRequirement=line=>{
    const t=line.text.trim(),{x0,y0,x1,y1}=line.bbox,cx=(x0+x1)/2,cy=(y0+y1)/2;
    if(cx<width*.03||cx>width*.97||cy<height*.03||cy>height*.97)return true;           // border zone labels
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
  const basicValues=basicValuesFromNotes(lines);
  // Basic and reference dimensions keep just the dimension; plain ones take the title-block tolerance.
  const classify=(p,line)=>{
    if(p.bounds)return p;
    const kind=dimensionKind(p.source,{basicValues,boxed:()=>!!boxed?.(line.bbox)});
    return kind?{...p,basic:true,basicReason:kind}:withGeneralTolerance(p,general);
  };
  const sideHeadings=lines.filter(l=>/^(?:feature requirements|feature center locations|inspection notes|general notes|hole (?:table|chart)|coordinates|bill of materials|revision history)\s*:?$/i.test(l.text.trim()));
  for(const line of lines){
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
      const xy=place(anchor,areas,used);
      if(anchor)used.push(xy);
      rows.push({...p,sourceBox:[line.bbox.x0/width,line.bbox.y0/height,line.bbox.x1/width,line.bbox.y1/height],xy,off:!anchor,name:tag?tag[1]+" · "+p.source:p.source,fromPdfText:!!line.fromPdfText});
    }
  }
  return rows;
}
