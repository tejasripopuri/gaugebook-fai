import {judge,numberedRows} from "./plan.mjs";
export const identity=["Part number","Part name","Serial / lot number","FAIR identifier"];
export const partFields=["Part revision","Drawing number","Drawing revision","Additional changes","Manufacturing process reference","Organization","Supplier code","Purchase order"];
export const materialFields=["Material or process","Specification","Code","Supplier","Approval verification","Certificate number"];
export function initialReport(plan) {
  if(plan?.custom)return {part:{"Part name":plan.name.replace(/\.[^.]+$/,"")},products:[[]],tests:{},extra:{}};
  return {part:{"Part number":"SMP-1001","Part name":"Adapter Plate","Part revision":"A","Drawing number":"SMP-1001","Drawing revision":"A"},products:[["6061-T651 aluminum plate","SMP-1001 Rev A, note 1"],["Clear anodize","MIL-PRF-8625, Type II, Class 1"]],tests:{},extra:{}};
}
export function formatResult(row,value,status,throughStatus){
  if(row.basic)return (value?value+" "+(row.unit||"")+" · ":"").replace("  "," ")+(/^reference/.test(row.basicReason||"")?"Reference":"BASIC")+", for information";
  const overall=status==="Fail"||throughStatus==="Fail"?"Fail":throughStatus==="Pending"?"Pending":status;
  return row.bounds&&status!=="Pending"?value+" "+row.unit+" · "+overall:overall;
}
export function resultRows(plan,inspection,report) {
  const numbered=numberedRows(plan,inspection.removed).filter(row=>!plan.confirmedOnly||row.confirmed);
  const throughByParent=new Map();
  const merged=new Set();
  for(const row of numbered){
    if(!/^(?:\d+\s*[x×]\s*)?THRU$/i.test(row.source.trim()))continue;
    const parent=numbered.find(p=>p.id===row.groupId&&p.bounds&&p.sheet===row.sheet&&p.repeats.length===row.repeats.length);
    if(parent&&!throughByParent.has(parent.id)){throughByParent.set(parent.id,row);merged.add(row.id);}
  }
  return numbered.filter(r=>!merged.has(r.id)).flatMap(r=>r.repeats.map((occ,i)=>{
    const key=r.id+"-"+i, val=inspection.answers?.[key]??"",status=judge(r,val);
    const extra=report.extra[key]??{};
    const through=throughByParent.get(r.id),throughKey=through?through.id+"-"+i:null;
    const throughStatus=through?judge(through,inspection.answers?.[throughKey]):null;
    const throughExtra=through?report.extra[throughKey]||{}:{};
    const combined=(field)=>[...new Set([extra[field],throughExtra[field]].filter(Boolean))].join(" / ");
    return {key,throughKey,throughStatus,id:r.id,balloon:r.balloon,location:"Sheet "+(r.sheet||1)+" · "+r.name+(occ==="Result"?"":" · "+occ),
      requirement:through&&!/\bTHRU\b/i.test(r.source)?r.source+" THRU":r.source,
      result:formatResult(r,val,status,throughStatus),
      value:String(val??"").trim(), // field 9 on the printed/exported Form 3: the reading only
      designator:combined("designator"),tool:combined("tool"),nc:combined("nc"),comments:[inspection.evidence?.[r.id],through&&inspection.evidence?.[through.id],combined("comments")].filter(Boolean).join(" / ")};
  }));
}

export const componentFields=["15. Part number","16. Part name","17. Part serial number","18. FAIR identifier"];
export function indexedParts(report) {
  return (report.components??[]).filter(row=>row.some(value=>String(value??"").trim()));
}
