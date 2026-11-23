import {identity,partFields,indexedParts,resultRows} from "./report-data.mjs";
import {judge,summarize} from "./plan.mjs";

const col=i=>String.fromCharCode(65+i);
const escapeXml=v=>String(v).replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F]/g,"").replace(/&/g,"&amp;").replace(/</g,"&lt;").replace(/>/g,"&gt;");
// The packaged template uses the x: namespace prefix and a styled cell at each input address.
function populate(xml,values,caches={}){
  return xml.replace(/<x:c\b([^>]*?)(?:\s*\/>|>([\s\S]*?)<\/x:c>)/g,(original,attrs,body="")=>{
    const addr=attrs.match(/\br="([A-Z]+\d+)"/)?.[1];
    if(!Object.hasOwn(values,addr)&&!Object.hasOwn(caches,addr))return original;
    attrs=attrs.replace(/\s+t="[^"]*"/,"");
    if(Object.hasOwn(caches,addr)){
      const formula=body.match(/<x:f\b[^>]*>[\s\S]*?<\/x:f>/)?.[0];
      if(!formula)throw Error("Missing workbook formula at "+addr);
      return '<x:c'+attrs+' t="str">'+formula+'<x:v>'+escapeXml(caches[addr]??"")+'</x:v></x:c>';
    }
    const val=values[addr];
    if(val===undefined||val===null||val==="")return "<x:c"+attrs+"/>";
    if(typeof val==="number")return "<x:c"+attrs+"><x:v>"+val+"</x:v></x:c>";
    return '<x:c'+attrs+' t="inlineStr"><x:is><x:t xml:space="preserve">'+escapeXml(val)+'</x:t></x:is></x:c>';
  });
}
function expandRows(xml,extra,lastRow){
  if(!extra)return xml;
  const model=xml.match(new RegExp('<x:row r="'+lastRow+'"[^>]*>[\\s\\S]*?</x:row>'))[0];
  const move=ref=>ref.replace(/([A-Z]*)(\d+)/g,(m,c,n)=>c+(+n>lastRow?+n+extra:n));
  xml=xml.replace(/\b(r|ref)="([A-Z0-9:]+)"/g,(m,k,ref)=>k+'="'+move(ref)+'"');
  return xml.replace(model,()=>model+Array.from({length:extra},(_,i)=>model.replace(new RegExp('\\br="([A-Z]*)'+lastRow+'"','g'),(_,c)=>'r="'+c+(lastRow+1+i)+'"')).join(""));
}
// Derive the Form 1 summary directly from Form 3's editable result cells.
function summaryFormula(checks){
  if(!checks.length)return '"Not yet inspected"';
  const scores=checks.map(({bounds},index)=>{
    const cell="'Form 3'!E"+(8+index);
    if(!bounds)return `IF(${cell}="Fail",2,IF(${cell}="Pass",0,1))`;
    return `IF(ISNUMBER(${cell}),IF(AND(${cell}>=${bounds[0]},${cell}<=${bounds[1]}),0,2),1)`;
  });
  return 'CHOOSE(1+MAX('+scores.join(",")+'),"Pass","Not yet inspected","Fail")';
}
export async function makeWorkbook(bytes,report,plan,inspection,zipLibrary=globalThis.JSZip){
  const zip=await zipLibrary.loadAsync(bytes);
  const p=report.part,rows=resultRows(plan,inspection,report),status=[],part={},products={},actual={},checks=[],ids={};
  function row(target,n,values){values.forEach((v,i)=>target[col(i)+n]=v);}
  row(part,4,identity.map(k=>p[k]));row(ids,4,identity.map(k=>p[k]??""));
  row(part,7,partFields.slice(0,4).map(k=>p[k]));row(part,10,partFields.slice(4).map(k=>p[k]));
  const components=indexedParts(report),shift=Math.max(0,components.length-3);
  components.forEach((v,i)=>row(part,17+i,v));
  row(part,13,[p.kind||"Detail",p.scope,p.baseline,p.reason]);part["A"+(22+shift)]=p.nc;
  row(part,25+shift,["Verified by","Verification date","Reviewed / approved by","Review date"].map(k=>p[k]));
  const extra=Math.max(0,report.products.length-10);
  report.products.forEach((r,i)=>row(products,i+7,Array.from({length:6},(_,j)=>r[j])));
  row(products,19+extra,[report.tests["Functional test procedure"],report.tests["Acceptance report"]]);products["A"+(22+extra)]=report.tests.Comments;
  if(plan.custom){
    const heading="A&B Foundry · "+(p["Part number"]||plan.name)+" · First article inspection";
    part.A2=products.A2=actual.A2=heading;
    for(let i=report.products.length;i<10;i++)row(products,7+i,Array(6).fill(""));
  }
  const originalSlots=new Map(plan.rows.flatMap(r=>r.repeats.map((_,i)=>r.id+"-"+i)).map((key,i)=>[key,i+8]));
  const kept=new Map();
  rows.forEach((r,i)=>{
    const n=originalSlots.get(r.key),characteristic=plan.rows.find(c=>c.id===r.id),reading=inspection.answers?.[r.key],decision=judge(characteristic,reading);
    status.push(decision);checks.push(characteristic);
    kept.set(n,i+8);actual["A"+n]=r.balloon;
    actual["B"+n]=r.location;actual["D"+n]=r.requirement;actual["C"+n]=r.designator;actual["E"+n]=characteristic.bounds&&decision!=="Pending"?Number(reading):reading;
    actual["F"+n]=r.tool;actual["G"+n]=r.nc;actual["H"+n]=r.comments;
  });
  const path=n=>"xl/worksheets/sheet"+n+".xml";
  for(const [n,inputs,cache] of [[1,part,{["A"+(28+shift)]:summarize(status)}],[2,products,ids],[3,actual,ids]]){
    let xml=await zip.file(path(n)).async("string");
    if(n===1)xml=expandRows(xml,shift,19);
    if(n===2)xml=expandRows(xml,extra,16);
    if(n===3)xml=expandRows(xml,Math.max(0,originalSlots.size-37),44);
    xml=populate(xml,inputs,cache);
    if(n===1){
      const address="A"+(28+shift);
      const summaryCell=new RegExp('(<x:c r="'+address+'"[^>]*><x:f>)[^<]*(</x:f>)');
      let formula=summaryFormula(checks);
      if(checks.length>45){
        const start=31+shift;
        const helpers=checks.map((check,i)=>{
          const single=summaryFormula([check]).replaceAll("!E8","!E"+(8+i));
          return '<x:row r="'+(start+i)+'" hidden="1"><x:c r="A'+(start+i)+'" t="str"><x:f>'+escapeXml(single)+'</x:f><x:v>'+status[i]+'</x:v></x:c></x:row>';
        });
        const range="A"+start+":A"+(start+checks.length-1);
        formula='IF(COUNTIF('+range+',"Fail")>0,"Fail",IF(COUNTIF('+range+',"Pass")='+checks.length+',"Pass","Not yet inspected"))';
        xml=xml.replace("</x:sheetData>",helpers.join("")+"</x:sheetData>");
      }
      xml=xml.replace(summaryCell,(_,start,end)=>start+escapeXml(formula)+end);
    }
    if(n===3)xml=xml.replace(/<x:row r="(\d+)"[^>]*>[\s\S]*?<\/x:row>/g,(row,num)=>{
      const from=Number(num);
      if(from<8)return row;
      if(!kept.has(from))return "";
      const to=kept.get(from);
      return row.replace(/(<x:row r=")\d+/,(_,prefix)=>prefix+to)
        .replace(/(r="[A-H])\d+"/g,(_,prefix)=>prefix+to+'"');
    });
    zip.file(path(n),xml);
  }
  return zip.generateAsync({type:"uint8array",compression:"DEFLATE"});
}
