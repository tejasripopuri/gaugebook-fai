import {makeDraggable} from "./drag-pins.mjs";
import {openUpload} from "./uploads.mjs";
import {readDrawing,sourceCrop,recognize} from "./image-reader.mjs";
import {digest,judge,summarize,numberedRows} from "./plan.mjs";
let drawing;
const readings=new Map();
const el=id=>document.getElementById(id);
const key="gaugebook-v1-"+digest;
let original,removed=[],plan, index=0, answers={}, evidence={}, moved={};
function node(tag,content,cls) {
  const item=document.createElement(tag);
  if(content!==undefined) item.textContent=content;
  if(cls) item.className=cls;
  return item;
}
function message(text,error=false) {
  el("message").textContent=text;
  el("message").className=error?"error":"";
}
function save() {
  try {localStorage.setItem(key,JSON.stringify({answers,evidence,removed,moved}));}
  catch {message("Browser storage is unavailable. Entries will be lost when this page closes.",true);}
}
function summary() {
  const states=plan.rows.flatMap(r=>r.repeats.map((_,i)=>judge(r,answers[r.id+"-"+i]))).filter(s=>s!=="Reference");
  const pass=states.filter(s=>s==="Pass").length,fail=states.filter(s=>s==="Fail").length;
  const result=summarize(states);
  el("summary").textContent=result;
  el("summary").className=result.toLowerCase();
  el("counts").textContent=(pass+fail)+" of "+states.length+" results entered　·　"+pass+" pass　·　"+fail+" fail　·　"+(states.length-pass-fail)+" pending";
  el("bar").style.width=(states.length?(pass+fail)/states.length*100:0)+"%";
  const left=states.length-pass-fail;
  el("pending").disabled=!left;el("pending").textContent=left?"Next pending ("+left+")":"All results entered";
  paintPins();
  plan.rows.forEach((r,j)=>{
    const s=summarize(r.repeats.map((_,i)=>judge(r,answers[r.id+"-"+i])));
    el("select").options[j].textContent=r.balloon+". "+r.name+" — "+(r.basic?"BASIC (for information)":s);
  });
}
// Balloon colours: green pass, red fail, grey not yet measured (all results of a balloon's group).
function paintPins(){
  document.querySelectorAll(".pin").forEach(pin=>{
    const rows=plan.rows.filter(r=>String(r.group)===pin.dataset.group);
    const s=summarize(rows.flatMap(r=>r.repeats.map((_,i)=>judge(r,answers[r.id+"-"+i]))));
    pin.classList.toggle("pass",s==="Pass");pin.classList.toggle("fail",s==="Fail");
    pin.title=pin.title.replace(/ · (Pass|Fail|Not yet inspected)$/,"")+" · "+s;
  });
}
el("resetPins").onclick=()=>{moved={};save();renderPlan(index);};
el("balloonPdf").onclick=async()=>{
  const button=el("balloonPdf");button.disabled=true;message("Preparing the ballooned drawing…");
  try{
    const {balloonedDrawingPdf,saveFile}=await import("./ballooned-pdf.mjs");
    const image=el("paper").querySelector("canvas,img");
    const balloons=[...document.querySelectorAll(".pin")].map(p=>({x:parseFloat(p.style.left)/100,y:parseFloat(p.style.top)/100,label:p.textContent}));
    saveFile(await balloonedDrawingPdf([{image,balloons}],{title:"SMP-1001 Rev A ballooned drawing"}),"SMP-1001-Rev-A-ballooned.pdf");
    message("Ballooned drawing downloaded.");
  }catch(e){message("Could not create the ballooned drawing. "+e.message,true);}
  finally{button.disabled=false;}
};
function choose(i) {
  index=i; const r=plan.rows[i];
  el("select").value=String(i);
  document.querySelectorAll(".pin").forEach((p,j)=>p.classList.toggle("active",Number(p.dataset.group)===r.group));
  el("prev").disabled=!i;el("next").disabled=i===plan.rows.length-1;
  const box=el("entry");
  box.replaceChildren(node("h2",r.name,"entrytitle"),node("small",r.category.toUpperCase()),node("p",r.source,"rule"));
  const crop=sourceCrop(drawing,r);
  crop.className="source-crop";crop.setAttribute("aria-label","Image of the uploaded callout");
  const output=node("p","Reading source image…");
  output.setAttribute("aria-live","polite");
  const cropKey=r.crop.join(",");
  if(!readings.has(cropKey)) readings.set(cropKey,recognize(crop));
  readings.get(cropKey).then(text=>{
    output.textContent="OCR draft · "+(text||"No readable text");
  }).catch(()=>{
    readings.delete(cropKey);
    output.textContent="OCR unavailable. Inspect the source crop.";
  });
  const related=plan.rows.filter(other=>other.group===r.group);
  if(related.length>1){
    const checks=node("div",undefined,"formnav");
    for(const other of related){
      const button=node("button",other.name,"secondary");button.disabled=other.id===r.id;
      button.onclick=()=>choose(plan.rows.indexOf(other));checks.append(button);
    }
    box.append(checks);
  }

  box.append(node("p",r.basic?r.basicNote:r.bounds?"Acceptance range "+r.bounds.join(" to ")+" "+r.unit+" (inclusive)"+(r.generalTolerance?" · tolerance from the title block ("+r.generalTolerance+")":""):"Verify against the drawing and supporting evidence."));
  r.repeats.forEach((occ,j)=>{
    const id=r.id+"-"+j, field=node("div",undefined,"field"), label=node("label","Result"+(r.repeats.length>1?" · "+occ:"")+(r.unit?" ("+r.unit+")":""));
    const input=node(r.bounds||r.basic?"input":"select"), result=node("small");
    label.htmlFor=input.id="reading-"+id;
    if(r.bounds||r.basic) {input.inputMode="decimal";input.placeholder=r.basic?"Measured value (for information)":"Enter measured value";}
    else for(const [v,t] of [["","Select result"],["Pass","Pass"],["Fail","Fail"]]) input.add(new Option(t,v));
    input.value=answers[id]??"";
    function show() {
      const state=judge(r,input.value);
      result.textContent=state==="Reference"?"BASIC · for information, not pass/fail":state==="Pending"&&input.value?"Enter a decimal number":state;
      result.className=state.toLowerCase();
    }
    input.oninput=()=>{answers[id]=input.value;show();save();summary();};
    input.onkeydown=e=>{if(e.key==="Enter"&&!e.isComposing){e.preventDefault();advance(input);}};
    show();field.append(label,input,result);box.append(field);
  });
  box.append(crop,output);
  const label=node("label","Evidence or inspection note");label.htmlFor="evidence";
  const input=node("input");input.id="evidence";input.placeholder="Certificate, report or observation";input.value=evidence[r.id]||"";
  input.oninput=()=>{evidence[r.id]=input.value;save();};box.append(label,input);
  input.onkeydown=e=>{if(e.key==="Enter"&&!e.isComposing){e.preventDefault();advance(input);}};
}
// Fast entry: Enter moves to the next result, then to the next characteristic.
const readingFields=()=>[...el("entry").querySelectorAll("[id^=reading-]")];
function focusField(field){field?.focus();if(field?.select)field.select();}
function advance(from){
  const fields=readingFields(),next=fields[fields.indexOf(from)+1];
  if(next)return focusField(next);
  if(index<plan.rows.length-1){choose(index+1);focusField(readingFields()[0]);}
  else el("pending").focus();
}
const isPending=(r,j)=>judge(r,answers[r.id+"-"+j])==="Pending";
el("pending").onclick=()=>{
  for(let step=1;step<=plan.rows.length;step++){
    const i=(index+step)%plan.rows.length,r=plan.rows[i];
    const j=r.repeats.findIndex((_,j)=>isPending(r,j));
    if(j<0)continue;
    choose(i);focusField(document.getElementById("reading-"+r.id+"-"+j));return;
  }
};
async function load(file) {
  const nextDrawing=await readDrawing(file);
  const nextPlan=await (await fetch("reviewed-plan.json")).json();
  drawing=nextDrawing;original=nextPlan;readings.clear();renderPlan(0);
}
function renderPlan(selected){
  plan={...original,rows:numberedRows(original,removed)};
  drawing.setAttribute("aria-label","Uploaded drawing with inspection balloons");
  el("paper").replaceChildren(drawing);
  el("select").replaceChildren();el("refs").replaceChildren();
  document.querySelectorAll(".pin").forEach(p=>p.remove());
  plan.rows.forEach((r,i)=>{
    el("select").add(new Option(r.name,i));
    if(r.category==="Drawing note"||(i && plan.rows[i-1].group===r.group))return;
    const xy=moved[r.group]??r.xy; // balloons the inspector dragged keep their new place
    const pin=node("button",r.balloon,"pin");pin.dataset.group=r.group;pin.style.left=xy[0]/14+"%";pin.style.top=xy[1]/10.82+"%";
    makeDraggable(pin,el("paper"),(x,y)=>{moved[r.group]=[Math.round(x*1400),Math.round(y*1082)];save();el("resetPins").hidden=false;});
    pin.title=pin.ariaLabel="Balloon "+r.balloon+" · "+r.name;
    pin.onclick=()=>{choose(i);el("select").focus();};el("paper").append(pin);
  });
  plan.references.forEach(s=>el("refs").append(node("p",s)));
  el("total").textContent=document.querySelectorAll(".pin").length+" balloons";
  el("resetPins").hidden=!Object.keys(moved).length;
  el("undo").disabled=!removed.length;el("delete").disabled=!plan.rows.length;
  if(plan.rows.length)choose(Math.min(selected,plan.rows.length-1));
  else {el("entry").replaceChildren();el("prev").disabled=true;el("next").disabled=true;}
  summary();
}
el("delete").onclick=()=>{
  const r=plan.rows[index],names=plan.rows.filter(x=>x.group===r.group).map(x=>x.name).join(", ");
  if(!confirm("Delete balloon "+r.balloon+" ("+names+") from this inspection and renumber the remaining balloons?"))return;
  removed.push(r.group);save();renderPlan(index);
};
el("undo").onclick=()=>{const group=removed.pop();save();renderPlan(0);choose(plan.rows.findIndex(r=>r.group===group));};
el("select").onchange=e=>choose(Number(e.target.value));
el("next").onclick=()=>choose(index+1);el("prev").onclick=()=>choose(index-1);
el("reset").onclick=()=>{
  if(plan&&confirm("Clear all measurements, evidence and report form entries and start a new inspection of this part?")) {
    answers={};evidence={};removed=[];moved={};localStorage.removeItem(key+"-forms");save();renderPlan(0);
  }
};
el("upload").onclick=()=>el("file").click();
async function run(file) {
  el("upload").disabled=true;
  document.dispatchEvent(new Event("gaugebook:ready"));
  try {
    if(file){
      // Only the known sample can inherit its pre-reviewed characteristics.
      message("Opening "+file.name+"…");
      try {await readDrawing(file);} catch {message("Saving "+file.name+" to your account…");await openUpload(file);return;}
    }
    await load(file);
    message("Image matched to SMP-1001 Rev A · Select a balloon to inspect its source pixels.");
  } catch(e) {message(e.message+(plan?" The current inspection is still open.":""),true);}
  finally {el("upload").disabled=false;el("file").value="";}
}
el("file").onchange=e=>{if(e.target.files[0])run(e.target.files[0]);};
try {const data=JSON.parse(localStorage.getItem(key)||"{}");removed=data.removed||[];answers=data.answers||{};evidence=data.evidence||{};moved=data.moved||{};} catch {}
window.addEventListener("storage",event=>{
  if(event.key!==key)return;
  const data=JSON.parse(localStorage.getItem(key)||"{}");
  answers=data.answers||{};evidence=data.evidence||{};removed=data.removed||[];moved=data.moved||{};
  if(plan)renderPlan(index);
});
await run();
