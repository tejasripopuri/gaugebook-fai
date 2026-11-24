import {digest,judge} from "./plan.mjs";
import {identity,partFields,materialFields,componentFields,initialReport,resultRows} from "./report-data.mjs";
import {makePacket} from "./report-pdf.mjs";
const root=document.querySelector("#editor"),notice=document.querySelector("#notice");
const drawingId=new URLSearchParams(location.search).get("drawing");
const key=drawingId?"gaugebook-upload-"+drawingId:"gaugebook-v1-"+digest;
const plan=drawingId?JSON.parse(localStorage.getItem(key+"-plan")):await (await fetch("reviewed-plan.json")).json();
if(drawingId){
  const back="review.html?drawing="+encodeURIComponent(drawingId);
  document.querySelector("header a").href=back;
  if(!plan||!plan.rows.length||!plan.rows.every(r=>r.confirmed&&plan.approved[r.sheet])||!Array.from({length:plan.pageCount},(_,i)=>plan.approved[i+1]).every(Boolean)){
    location.replace(back);throw Error("Complete the drawing review first.");
  }
  document.querySelector("main>p").textContent="A&B Foundry inspection report for "+plan.name;
  document.querySelector("a[download]").hidden=true;
}
const read=(k,fallback)=>JSON.parse(localStorage.getItem(k)||"null")??fallback;
let report=read(key+"-forms",initialReport(plan)),active=1;
function save(){try{localStorage.setItem(key+"-forms",JSON.stringify(report));notice.textContent="Saved to your account.";}catch{notice.textContent="Storage unavailable. Download the report before closing.";}}
function tag(name,text,parent){const e=document.createElement(name);if(text)e.textContent=text;parent?.append(e);return e;}
function grid(parent){const e=tag("div","",parent);e.className="formgrid";return e;}
function field(parent,label,obj,k,options) {
  const l=tag("label",label,parent),e=tag(options?"select":"input","",l);
  if(options)for(const v of ["",...options])e.add(new Option(v||"Select",v));
  e.value=obj[k]??"";e.oninput=()=>{obj[k]=e.value;save();};
}
function render(){
  root.replaceChildren();document.querySelectorAll("[data-form]").forEach(b=>b.setAttribute("aria-current",Number(b.dataset.form)===active));
  tag("h2",["","Form 1 · Part number accountability","Form 2 · Product accountability","Form 3 · Characteristic accountability"][active],root);
  const p=report.part;
  if(active===1){
    const g=grid(root);for(const k of identity.concat(partFields)){
      field(g,k,p,k);
      if(!drawingId&&["Part number","Part name","Part revision","Drawing number","Drawing revision"].includes(k))g.lastChild.lastChild.readOnly=true;
    }
    const f=grid(root);
    p.kind??="Detail";
    field(f,"13. Detail / assembly",p,"kind",["Detail","Assembly"]);
    field(f,"14. Inspection scope",p,"scope",["Full","Partial"]);
    field(f,"Baseline part and revision",p,"baseline");field(f,"Reason for FAI",p,"reason");
    tag("h3","Assembly index · Fields 15–18",root);
    tag("p","Enter one row per component. Select Assembly in field 13 when preparing an assembly report.",root);
    report.components??=[[]];
    report.components.forEach((row,i)=>{
      const group=tag("fieldset","",root);tag("legend","Component "+(i+1),group);
      const inputs=grid(group);componentFields.forEach((label,j)=>field(inputs,label,row,j));
      const remove=tag("button","Remove component",group);remove.className="secondary";
      remove.onclick=()=>{
        if(row.some(Boolean)&&!confirm("Remove this component from Form 1?"))return;
        report.components.splice(i,1);if(!report.components.length)report.components.push([]);save();render();
      };
    });
    tag("button","Add component",root).onclick=()=>{report.components.push([]);save();render();};
    const review=grid(root);field(review,"19. Documented nonconformance",p,"nc",["Yes","No"]);
    for(const k of ["Verified by","Verification date","Reviewed / approved by","Review date"])field(review,k,p,k);
  }else if(active===2){
    report.products.forEach((r,i)=>{tag("h3","Material or process "+(i+1),root);const g=grid(root);materialFields.forEach((k,j)=>field(g,k,r,j));});
    const add=tag("button","Add material or process",root);add.onclick=()=>{report.products.push([]);save();render();};
    const g=grid(root);for(const k of ["Functional test procedure","Acceptance report","Comments"])field(g,k,report.tests,k);
  }else{
    tag("p","Expand a characteristic to enter its result and inspection details.",root);
    const characteristics=new Map(plan.rows.map(row=>[row.id,row]));
    for(const r of resultRows(plan,read(key,{}),report)){
      const d=tag("details","",root);d.className="reportrow";const summary=tag("summary","Balloon "+r.balloon+" · "+r.location+" · "+r.result,d);tag("p",r.requirement,d);
      const g=grid(d),extra=report.extra[r.key]??={};
      const row=characteristics.get(r.id);
      const label=tag("label","Result"+(row.unit&&row.bounds?" ("+row.unit+")":""),g);
      const input=tag(row.bounds?"input":"select","",label);
      if(row.bounds){input.inputMode="decimal";input.placeholder="Enter measured value";}
      else for(const v of ["","Pass","Fail"])input.add(new Option(v||"Select result",v));
      input.value=read(key,{}).answers?.[r.key]??"";
      const decision=tag("small",judge(row,input.value),label);
      let throughInput;
      if(r.throughKey){
        const throughLabel=tag("label","Through hole",g);
        throughInput=tag("select","",throughLabel);
        for(const value of ["","Pass","Fail"])throughInput.add(new Option(value||"Select result",value));
        throughInput.value=read(key,{}).answers?.[r.throughKey]||"";
      }
      input.oninput=()=>{
        const inspection=read(key,{});
        inspection.answers??={};
        inspection.answers[r.key]=input.value;
        if(throughInput)inspection.answers[r.throughKey]=throughInput.value;
        const status=judge(row,input.value);
        decision.textContent=row.bounds&&input.value&&status==="Pending"?"Enter a decimal number":status;
        summary.textContent="Balloon "+r.balloon+" · "+r.location+" · "+
          (row.bounds&&status!=="Pending"?input.value+" "+row.unit+" · ":"")+status+(throughInput?" · THRU "+(throughInput.value||"Pending"):"");
        try{localStorage.setItem(key,JSON.stringify(inspection));notice.textContent="Saved to your account.";}
        catch{notice.textContent="Result could not be saved. Check browser storage and retry.";}
      };
      if(throughInput)throughInput.onchange=input.oninput;
      for(const [k,l] of [["designator","Characteristic designator"],["tool","Designed / qualified tooling"],["nc","Nonconformance reference"],["comments","Additional comments"]])field(g,l,extra,k);
      if(r.comments)tag("p","Recorded evidence · "+r.comments,d);
    }
  }
}
document.querySelectorAll("[data-form]").forEach(b=>b.onclick=()=>{active=Number(b.dataset.form);render();});
window.addEventListener("storage",e=>{if(drawingId&&e.key===key+"-plan"){location.reload();return;}if(e.key===key+"-forms")report=read(e.key,initialReport(plan));if(e.key===key||e.key===key+"-forms")render();});
async function download(forms){
  try{
    const source=await (await fetch("ab-foundry-forms.pdf")).arrayBuffer();
    const bytes=await makePacket(source,report,resultRows(plan,read(key,{}),report),forms);
    const url=URL.createObjectURL(new Blob([bytes],{type:"application/pdf"})),a=document.createElement("a");
    a.href=url;a.download=(report.part["Part number"]||plan.name||"Inspection")+"-Form-"+forms.join("-")+".pdf";a.click();setTimeout(()=>URL.revokeObjectURL(url),60000);notice.textContent="PDF generated from this inspection.";
  }catch(e){notice.textContent="PDF export failed. "+e.message;}
}
document.querySelector("#one").onclick=()=>download([active]);document.querySelector("#all").onclick=()=>download([1,2,3]);render();

document.querySelector("#xlsx").onclick=async()=>{
  try {
    const response=await fetch("fai-forms.xlsx");if(!response.ok)throw Error("Workbook template unavailable");
    const {makeWorkbook}=await import("./report-excel.mjs");
    const bytes=await makeWorkbook(await response.arrayBuffer(),report,plan,read(key,{}));
    const url=URL.createObjectURL(new Blob([bytes],{type:"application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"}));
    const a=document.createElement("a");a.href=url;a.download=(report.part["Part number"]||plan.name||"Inspection")+"-FAI-Forms.xlsx";a.click();setTimeout(()=>URL.revokeObjectURL(url),60000);
    notice.textContent="Excel workbook generated with three editable worksheets.";
  }catch(e){notice.textContent="Excel export failed. "+e.message;}
};
