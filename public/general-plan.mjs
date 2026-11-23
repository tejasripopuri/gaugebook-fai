import {propose} from "./callouts.mjs";
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
export function generalRows(lines,areas,width,height){
  const rows=[],used=[];
  const sideHeadings=lines.filter(l=>/^(?:feature requirements|feature center locations|inspection notes|general notes|hole (?:table|chart)|coordinates|bill of materials|revision history)\s*:?$/i.test(l.text.trim()));
  for(const line of lines){
    const text=line.text.trim(),point=center(line,width,height);
    if(!text||metadata.test(text)||label(text))continue;
    const tag=text.match(/^([A-Z]\d?)\s+(?=\d|Ø|⌀|CBORE|SLOT|DIA|POCKET|R\d)/i);
    const isDim=dimension(text.replace(/^\s*\d+\s*[xX×]\s*/, ""));
    if(!isDim&&!annotation.test(text))continue;
    const prose=annotation.test(text)||/\b(?:notes?|certificate|specification|unless|coordinate[s]?|table|locations?|tolerances apply|per\s+(?:ASME|ISO|MIL)|aluminum|stainless|steel)\b/i.test(text);
    const remoteTag=tag&&!inside(areas,point);
    const inPanel=sideHeadings.some(h=>line.bbox.y0>=h.bbox.y0&&line.bbox.x0>=h.bbox.x0-width*.012&&line.bbox.x0<h.bbox.x0+width*.34);
    const proposals=propose(tag?text.slice(tag[0].length):text);
    for(const p of proposals){
      const anchor=isDim&&!prose&&!remoteTag&&!inPanel?anchorFor(areas,...point):null;
      const xy=anchor?place(anchor,areas,used):point;
      if(anchor)used.push(xy);
      rows.push({...p,sourceBox:[line.bbox.x0/width,line.bbox.y0/height,line.bbox.x1/width,line.bbox.y1/height],xy,off:!anchor,name:tag?tag[1]+" · "+p.source:p.source});
    }
  }
  return rows;
}
