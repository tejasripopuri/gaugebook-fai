import {judge,numberedRows} from "./plan.mjs";
export const identity=["Part number","Part name","Serial / lot number","FAIR identifier"];
export const partFields=["Part revision","Drawing number","Drawing revision","Additional changes","Manufacturing process reference","Organization","Supplier code","Purchase order"];
export const materialFields=["Material or process","Specification","Code","Supplier","Approval verification","Certificate number"];
export function initialReport(plan) {
  if(plan?.custom)return {part:{"Part name":plan.name.replace(/\.[^.]+$/,"")},products:[[]],tests:{},extra:{}};
  return {part:{"Part number":"SMP-1001","Part name":"Adapter Plate","Part revision":"A","Drawing number":"SMP-1001","Drawing revision":"A"},products:[["6061-T651 aluminum plate","SMP-1001 Rev A, note 1"],["Clear anodize","MIL-PRF-8625, Type II, Class 1"]],tests:{},extra:{}};
}
export function resultRows(plan,inspection,report) {
  return numberedRows(plan,inspection.removed).flatMap(r=>r.repeats.map((occ,i)=>{
    const key=r.id+"-"+i, val=inspection.answers?.[key]??"",status=judge(r,val);
    const extra=report.extra[key]??{};
    return {key,id:r.id,balloon:r.balloon,location:"Sheet "+(r.sheet||1)+" · "+r.name+(occ==="Result"?"":" · "+occ),
      requirement:r.source,
      result:status==="Pending"?"Pending":r.bounds?val+" "+r.unit+" · "+status:status,
      designator:extra.designator||"",tool:extra.tool||"",nc:extra.nc||"",comments:[inspection.evidence?.[r.id],extra.comments].filter(Boolean).join(" / ")};
  }));
}

export const componentFields=["15. Part number","16. Part name","17. Part serial number","18. FAIR identifier"];
export function indexedParts(report) {
  return (report.components??[]).filter(row=>row.some(value=>String(value??"").trim()));
}
