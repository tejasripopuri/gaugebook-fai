import {propose,drawingAngleDefault} from "./callouts.mjs";
import {matchPracticeImage} from "./practice-match.mjs";
import {practiceLayout} from "./practice-views.mjs";
import {detectViews,inside,sheetFurniture,clipViews,onFurniture} from "./drawing-areas.mjs";
import {drawingFile} from "./uploads.mjs";
import {openSheets,dimensionLines,verifiedImageLines,boxDetector} from "./image-reader.mjs";
import {generalRows} from "./general-plan.mjs";
import {judge,summarize} from "./plan.mjs";
import {makeDraggable} from "./drag-pins.mjs";
const el=id=>document.getElementById(id),id=new URLSearchParams(location.search).get("drawing");
const key="gaugebook-upload-"+id,read=(k,fallback)=>JSON.parse(localStorage.getItem(k)||"null")??fallback;
let plan,doc,page=1,canvas,selected,scanning=false;
let placing=null;
const practice=practiceLayout(id);
const areas=()=>plan.areas[page]||[];
function sortRows(){plan.rows.sort((a,b)=>a.sheet-b.sheet||a.id-b.id);}
function partition(){
  const all=[...plan.rows,...plan.offView];
  plan.rows=[];plan.offView=[];
  for(const r of all)(!r.unplaced&&inside(plan.areas[r.sheet]||[],r.xy)?plan.rows:plan.offView).push(r);
  sortRows();
}
const message=text=>el("message").textContent=text;
const state=()=>read(key,{answers:{},evidence:{}});
const active=()=>plan.rows.find(r=>r.id===selected);
const onPage=()=>plan.rows.filter(r=>r.sheet===page);
function save(){localStorage.setItem(key+"-plan",JSON.stringify(plan));}
function changed(){plan.approved[page]=false;save();}
function add(proposal,x,y){
  const row={id:plan.next++,sheet:page,xy:[x,y],source:proposal.source,name:proposal.source||"New characteristic",
    bounds:proposal.bounds,unit:"",confirmed:false,category:"Drawing requirement",repeats:Array.from({length:proposal.count},(_,i)=>proposal.count===1?"Result":"Occurrence "+(i+1))};
  (inside(areas(),row.xy)?plan.rows:plan.offView).push(row);return row;
}
const kindLabel=row=>/^reference/.test(row.basicReason||"")?"Reference":"BASIC";
function kindNote(row){
  const why={"reference":"a reference dimension (in brackets or marked REF)","basic":"a basic dimension (marked BSC/BASIC)","basic (note)":"a basic dimension (a drawing note calls it basic)","basic (boxed)":"a basic dimension (drawn in a box)"}[row.basicReason]||"a basic dimension";
  return "This is "+why+", so it takes no tolerance from the title block. Record the measured value for information.";
}
function resultStatus(row,value){
  if(row.basic)return "Reference"; // basic / reference dimension: recorded for information only
  if(!row.bounds&&!row.confirmed&&row.method!=="attribute")return "Pending";
  return judge(row,value);
}
// Balloon colours: amber to confirm, then green pass, red fail, grey not yet measured.
function paintPins(){
  const answers=state().answers||{};
  for(const pin of el("paper").querySelectorAll(".pin")){
    const r=plan.rows.find(x=>String(x.id)===pin.dataset.id);if(!r)continue;
    const s=!r.confirmed?"To confirm":summarize(r.repeats.map((_,i)=>resultStatus(r,answers[r.id+"-"+i]??"")));
    pin.classList.toggle("review",s==="To confirm");pin.classList.toggle("pass",s==="Pass");pin.classList.toggle("fail",s==="Fail");
    pin.title=r.name+" · "+s;
  }
}
function updateSummary(){
  paintPins();
  const data=state(),statuses=plan.rows.flatMap(r=>r.repeats.map((_,i)=>resultStatus(r,data.answers?.[r.id+"-"+i])));
  const done=Array.from({length:doc.count},(_,i)=>plan.approved[i+1]).every(Boolean);
  const status=summarize(done?statuses:[...statuses,"Pending"]);
  el("summary").textContent=status;el("summary").className=status.toLowerCase();
  const counted=statuses.filter(s=>s!=="Reference");
  el("counts").textContent=counted.filter(s=>s!=="Pending").length+" of "+counted.length+" results entered · "+Object.values(plan.approved).filter(Boolean).length+" of "+doc.count+" sheets reviewed";
  el("forms").hidden=false;
}
function redraw(){
  const rows=onPage(),row=active(),idx=r=>plan.rows.indexOf(r)+1;
  el("reviewState").textContent=plan.approved[page]?"Sheet reviewed.":"Check each proposal against the image, including units, drawing notes, GD&T and general tolerances. Add missed callouts and remove false matches.";
  if(plan.imageMatches?.[page]&&!plan.approved[page])el("reviewState").textContent="Proposed values come from the "+plan.imageMatches[page]+" reference layout. Verify each against the uploaded drawing before confirming.";
  el("approve").disabled=!areas().length||scanning||plan.approved[page]||rows.some(r=>!r.confirmed);
  el("scan").disabled=scanning||plan.scanned[page]&&!outdated(page);el("sheet").disabled=scanning;
  el("undo").hidden=!plan.deleted.length;
  el("resetPins").hidden=!onPage().some(r=>r.moved&&r.home);
  const fromPdf=onPage().filter(pdfConfirmable);
  el("confirmPdf").hidden=!fromPdf.length;el("confirmPdf").disabled=scanning;
  el("confirmPdf").textContent="Confirm PDF-text values ("+fromPdf.length+")";
  const select=el("rows");select.replaceChildren();
  for(const r of rows)select.add(new Option(idx(r)+". "+r.name+(r.confirmed?"":" · Review"),r.id));
  if(row)select.value=row.id;
  el("paper").replaceChildren(canvas);
  el("cancel").hidden=!placing;
  el("paper").style.cursor=placing?"crosshair":"";
  const off=plan.offView.filter(r=>r.sheet===page);el("outside").hidden=!off.length;el("outside").querySelector("summary").textContent=off.length+" unplaced callout"+(off.length===1?"":"s")+" to review";
  el("unused").replaceChildren(...off.map(r=>new Option(r.name,r.id)));
  el("attach").disabled=scanning||!areas().length;
  for(const r of rows){
    const pin=document.createElement("button");pin.className="pin"+(r===row?" active":"");pin.textContent=idx(r);pin.dataset.id=r.id;
    pin.style.left=r.xy[0]*100+"%";pin.style.top=r.xy[1]*100+"%";pin.title=r.name;if(placing)pin.style.pointerEvents="none";
    pin.onclick=e=>{e.stopPropagation();selected=r.id;redraw();};el("paper").append(pin);
    if(!placing)makeDraggable(pin,el("paper"),(x,y)=>{r.xy=[x,y];r.moved=true;save();el("resetPins").hidden=false;});
  }
  el("editor").hidden=!row;el("results").replaceChildren();
  if(row){
    const crop=el("sourceCrop");crop.hidden=!row.sourceBox;
    if(row.sourceBox){
      const [l,t,r,b]=row.sourceBox,x=Math.max(0,Math.floor(l*canvas.width)-8),y=Math.max(0,Math.floor(t*canvas.height)-8);
      crop.width=Math.max(1,Math.min(canvas.width-x,Math.ceil(r*canvas.width)-x+8));
      crop.height=Math.max(1,Math.min(canvas.height-y,Math.ceil(b*canvas.height)-y+8));
      crop.getContext("2d").drawImage(canvas,x,y,crop.width,crop.height,0,0,crop.width,crop.height);
    }
    el("requirement").value=row.source;
    el("tolSource").hidden=!row.generalTolerance&&!row.basic;
    el("tolSource").textContent=row.basic?kindNote(row):row.generalTolerance?"Tolerance taken from the title block ("+row.generalTolerance+"). Change it here if this dimension needs a different one.":"";
    const attribute=!row.basic&&!row.bounds&&(row.method==="attribute"||row.confirmed);
    el("method").value=attribute?"attribute":"numeric";
    const data=state();
    row.repeats.forEach((occ,i)=>{
      const k=row.id+"-"+i,label=document.createElement("label"),input=document.createElement(attribute?"select":"input"),result=document.createElement("small");
      label.textContent="Result"+(row.repeats.length>1?" · "+occ:"")+(row.unit?" ("+row.unit+")":"");
      if(attribute){for(const v of ["","Pass","Fail"])input.add(new Option(v||"Select result",v));}
      else {input.inputMode="decimal";input.placeholder="Enter measured value";}
      input.value=data.answers?.[k]??"";
      function show(){
        const decision=resultStatus(row,input.value);result.textContent=row.basic?kindLabel(row)+" · for information, not pass/fail":!attribute&&!row.bounds?"Pending · verify the tolerance in Requirement":decision;
        result.className=decision.toLowerCase();
      }
      input.oninput=()=>{const latest=state();(latest.answers??={})[k]=input.value;localStorage.setItem(key,JSON.stringify(latest));show();updateSummary();};
      input.id="result-"+k;label.htmlFor=input.id;
      input.onkeydown=e=>{if(e.key==="Enter"&&!e.isComposing){e.preventDefault();advance(row.id,i);}};
      const field=document.createElement("div");field.className="field";show();field.append(label,input,result);el("results").append(field);
    });
  }
  updateSummary();
}
function editingRequirement(){
  const row=active(),storedMethod=row.bounds||(!row.confirmed&&row.method!=="attribute")?"numeric":"attribute";
  const dirty=el("requirement").value.trim()!==row.source||el("method").value!==storedMethod;
  for(const input of el("results").querySelectorAll("input,select"))input.disabled=dirty;
  if(dirty)message("Confirm the changed requirement before entering its result.");
}
el("requirement").oninput=editingRequirement;el("method").onchange=editingRequirement;
el("rows").onchange=e=>{selected=Number(e.target.value);redraw();};
el("resetPins").onclick=()=>{
  for(const r of onPage())if(r.moved&&r.home){r.xy=[...r.home];delete r.moved;}
  save();redraw();
};
// Bulk confirmation: only values whose callout and limits were read straight from the PDF's text.
// Scanned-image readings, title-block tolerances, attribute checks and unplaced callouts stay manual.
function pdfConfirmable(r){
  return !r.confirmed&&r.fromPdfText&&Array.isArray(r.bounds)&&!r.generalTolerance&&!r.unplaced&&!r.manual;
}
el("confirmPdf").onclick=()=>{
  const rows=onPage().filter(pdfConfirmable);
  if(!rows.length)return;
  const n=r=>plan.rows.indexOf(r)+1;
  const list=rows.slice(0,25).map(r=>"  "+n(r)+".  "+r.source).join("\n")+(rows.length>25?"\n  … and "+(rows.length-25)+" more":"");
  if(!confirm("Confirm these "+rows.length+" values, read directly from the PDF's text?\n\n"+list+"\n\nValues from scanned images or the title block are not included and still need individual review."))return;
  for(const r of rows)Object.assign(r,{method:"numeric",confirmed:true});
  changed();redraw();
  const left=onPage().filter(r=>!r.confirmed).length;
  message(rows.length+" characteristic"+(rows.length>1?"s":"")+" confirmed from PDF text."+(left?" "+left+" still need"+(left>1?"":"s")+" individual review.":" Every balloon on this sheet is confirmed."));
};
el("balloonPdf").onclick=async()=>{
  const button=el("balloonPdf");button.disabled=true;message("Preparing the ballooned drawing…");
  try{
    const {balloonedDrawingPdf,saveFile}=await import("./ballooned-pdf.mjs");
    const sheets=[];
    for(let n=1;n<=doc.count;n++){
      const image=n===page?canvas:await doc.render(n);
      const balloons=plan.rows.filter(r=>r.sheet===n).map(r=>({x:r.xy[0],y:r.xy[1],label:String(plan.rows.indexOf(r)+1)}));
      sheets.push({image,balloons});
    }
    const name=(plan.name||"drawing").replace(/\.[^.]+$/,"");
    saveFile(await balloonedDrawingPdf(sheets,{title:name+" ballooned drawing"}),name+"-ballooned.pdf");
    const unread=Array.from({length:doc.count},(_,i)=>i+1).filter(n=>!plan.scanned[n]);
    message("Ballooned drawing downloaded."+(unread.length?" Sheet "+unread.join(", ")+" "+(unread.length>1?"have":"has")+" not been read yet, so "+(unread.length>1?"they have":"it has")+" no balloons; open "+(unread.length>1?"them":"it")+" with the Sheet selector first.":"")+(plan.rows.some(r=>!r.confirmed)?" Some balloons are not confirmed yet.":""));
  }catch(e){message("Could not create the ballooned drawing. "+e.message);}
  finally{button.disabled=false;}
};
// Fast entry: Enter confirms the characteristic if needed, then moves to the next result,
// then to the next characteristic on this sheet. "Next pending" jumps to the next gap.
function focusResult(rowId,i){
  const f=document.getElementById("result-"+rowId+"-"+i);
  if(f&&!f.disabled){f.focus();f.select?.();return true;}
  return false;
}
function advance(rowId,i){
  let row=plan.rows.find(r=>r.id===rowId);
  if(row&&!row.confirmed){
    el("editor").requestSubmit();
    row=plan.rows.find(r=>r.id===rowId);
    if(!row?.confirmed)return;
  }
  if(focusResult(rowId,i+1))return;
  const rows=onPage(),next=rows[rows.indexOf(row)+1];
  if(next){selected=next.id;redraw();focusResult(next.id,0)||el("requirement").focus();}
  else el("pending").focus();
}
function pendingIn(r){
  const answers=state().answers||{};
  if(!r.confirmed)return 0;
  const j=r.repeats.findIndex((_,i)=>resultStatus(r,answers[r.id+"-"+i]??"")==="Pending");
  return j<0?null:j;
}
el("pending").onclick=()=>{
  const rows=onPage(),start=rows.findIndex(r=>r.id===selected);
  for(let step=1;step<=rows.length;step++){
    const r=rows[(start+step)%rows.length],j=pendingIn(r);
    if(j===null)continue;
    selected=r.id;redraw();
    if(!r.confirmed){el("requirement").focus();message("Confirm this characteristic, then enter its results.");}
    else focusResult(r.id,j);
    return;
  }
  message("All results on this sheet are entered.");
};
el("cancel").onclick=()=>{placing=null;redraw();};
el("attach").onclick=()=>{placing=Number(el("unused").value);message("Click the corresponding drawing feature.");redraw();};
el("paper").onclick=async e=>{
  if(scanning||e.target!==canvas)return;
  const rect=canvas.getBoundingClientRect(),point=[(e.clientX-rect.left)/rect.width,(e.clientY-rect.top)/rect.height];
  if(!inside(areas(),point)){message("Place balloons on a detected drawing view.");return;}
  if(placing){
    const i=plan.offView.findIndex(r=>r.id===placing);
    const [r]=plan.offView.splice(i,1);r.xy=point;r.unplaced=false;plan.rows.push(r);sortRows();selected=r.id;placing=null;
  }else {const row=add({source:"",bounds:null,count:1},...point);row.manual=true;selected=row.id;}
  changed();redraw();el("requirement").focus();
};
el("editor").onsubmit=e=>{
  e.preventDefault();const r=active(),source=el("requirement").value.trim();
  if(!source)return;
  const method=el("method").value;
  const parsed=propose(source);
  const bounds=method==="attribute"?null:source===r.source&&r.bounds?r.bounds:parsed.length===1?parsed[0].bounds:null;
  const keepsKind=r.basic&&source===r.source;
  if(method==="numeric"&&!bounds&&!keepsKind){
    message("Enter the drawing tolerance in Requirement, for example 2.500 ±.005, then confirm.");return;
  }
  const modified=source!==r.source||JSON.stringify(bounds)!==JSON.stringify(r.bounds)||method==="attribute"&&!r.confirmed&&r.method!=="attribute";
  if(modified){
    const latest=state(),keys=r.repeats.map((_,i)=>r.id+"-"+i);
    if(keys.some(k=>latest.answers?.[k])){
      if(!confirm("Changing this requirement clears its recorded results. Continue?"))return;
      keys.forEach(k=>delete latest.answers[k]);localStorage.setItem(key,JSON.stringify(latest));
    }
  }
  Object.assign(r,{name:r.name===r.source||!r.source?source:r.name,source,method,bounds,confirmed:true,generalTolerance:source===r.source?r.generalTolerance:undefined,basic:keepsKind||undefined,basicReason:keepsKind?r.basicReason:undefined});
  changed();redraw();message("Characteristic confirmed.");
};
el("delete").onclick=()=>{const r=active();if(!confirm("Delete this balloon and renumber the remaining entries?"))return;
  const i=plan.rows.indexOf(r);plan.deleted.push({i,row:r});plan.rows.splice(i,1);selected=onPage()[0]?.id;changed();redraw();};
el("undo").onclick=async()=>{const {i,row}=plan.deleted.pop();plan.rows.splice(i,0,row);partition();plan.approved[row.sheet]=false;save();await show(row.sheet,plan.rows.includes(row)?row.id:undefined);};
el("approve").onclick=()=>{if(confirm("Confirm that all applicable requirements on this sheet have been accounted for?")){plan.approved[page]=true;save();redraw();}};
// Step-by-step progress while a sheet is read.
function progress(fraction,label){
  const bar=el("scanBar");
  if(fraction==null){bar.hidden=true;return;}
  bar.hidden=false;bar.firstElementChild.style.width=Math.round(fraction*100)+"%";
  const sheet=doc.count>1?"Sheet "+page+" of "+doc.count+" · ":"";
  message(sheet+label+"… "+Math.round(fraction*100)+"%");
}
async function scan(){
  if(scanning||plan.scanned[page]&&!outdated(page))return;
  let kept=[];
  if(plan.scanned[page]){
    // Reading again a sheet that an older version read: drop its unreviewed balloons and keep the
    // ones the inspector confirmed, placed by hand or entered results for.
    const answers=state().answers||{};
    const reviewed=r=>r.sheet!==page||r.confirmed||r.manual||r.repeats.some((_,i)=>answers[r.id+"-"+i]);
    plan.rows=plan.rows.filter(reviewed);plan.offView=plan.offView.filter(reviewed);
    plan.deleted=plan.deleted.filter(({row})=>row.sheet!==page);
    kept=[...plan.rows,...plan.offView].filter(r=>r.sheet===page);
    plan.scanned[page]=false;plan.approved[page]=false;
  }
  scanning=true;redraw();progress(0,"Checking for a known drawing layout");
  try{
    const existing=[...plan.rows,...plan.offView].filter(r=>r.sheet===page);
    function insert(proposal,x,y,off=false){
      const previous=existing.find(r=>r.source===proposal.source&&Math.hypot(r.xy[0]-x,r.xy[1]-y)<.025);
      if(previous){
        if(!off&&plan.offView.includes(previous)){
          previous.unplaced=false;previous.xy=[x,y];plan.offView.splice(plan.offView.indexOf(previous),1);plan.rows.push(previous);
        }
        return;
      }
      if(kept.some(r=>r.xy&&Math.hypot(r.xy[0]-x,r.xy[1]-y)<.02))return; // the inspector already reviewed this spot
      if(plan.deleted.some(({row:r})=>r.sheet===page&&r.source===proposal.source&&Math.hypot(r.xy[0]-x,r.xy[1]-y)<.025))return;
      const row=add(proposal,x,y);row.home=[x,y];
      row.name=proposal.name||row.name;row.unit=proposal.unit||"";
      row.unplaced=off;row.sourceBox=proposal.sourceBox;
      if(proposal.generalTolerance)row.generalTolerance=proposal.generalTolerance;
      if(proposal.fromPdfText)row.fromPdfText=true;
      if(proposal.basic){row.basic=true;row.basicReason=proposal.basicReason;}
      if(off&&plan.rows.includes(row)){plan.rows.splice(plan.rows.indexOf(row),1);plan.offView.push(row);}
    }
    const layout=practice||await matchPracticeImage(canvas);
    if(layout){
      if(layout.part)(plan.imageMatches??={})[page]=layout.part;
      plan.areas[page]=layout.areas;
      partition();
      for(const p of layout.rows)insert(p,...p.xy);
      // supplemental (off-drawing) items from practice layouts are not proposed: drawing views only
    }else{
      progress(.05,"Reading drawing text");
      const embedded=await doc.labels?.(page).catch(()=>[])||[];
      let ocr;
      try{ocr=await dimensionLines(canvas,(f,label)=>progress(.1+.8*f,label));}catch(error){if(!embedded.length)throw error;ocr=[];}
      const lines=verifiedImageLines(ocr,embedded);
      progress(.92,"Finding drawing views");await new Promise(requestAnimationFrame);
      const furniture=sheetFurniture(canvas);
      plan.areas[page]=clipViews(detectViews(canvas,lines),furniture);
      partition();
      progress(.97,"Numbering balloons");await new Promise(requestAnimationFrame);
      // Balloons kept from an earlier reading that sit in the border or title block, with no results, go.
      const answers=state().answers||{};
      const from=r=>r.sourceBox?[(r.sourceBox[0]+r.sourceBox[2])/2,(r.sourceBox[1]+r.sourceBox[3])/2]:r.xy;
      const stray=r=>r.sheet===page&&!r.manual&&from(r)&&onFurniture(furniture,from(r),r.sourceBox)&&!r.repeats.some((_,i)=>answers[r.id+"-"+i]);
      plan.rows=plan.rows.filter(r=>!stray(r));plan.offView=plan.offView.filter(r=>!stray(r));kept=kept.filter(r=>!stray(r));
      for(const row of generalRows(lines,areas(),canvas.width,canvas.height,boxDetector(canvas),furniture))insert(row,...row.xy,row.off);
      (plan.generalVersion??={})[page]=READER_VERSION;
    }
    sortRows();(plan.dimensionOnly??={})[page]=true;plan.scanned[page]=true;selected=onPage()[0]?.id;changed();
    message(plan.imageMatches?.[page]?"Automatic numbering complete. Image layout matches "+plan.imageMatches[page]+". Check each proposed value against the uploaded revision before confirming it.":onPage().length?"Automatic numbering complete. Review the balloons against the drawing.":"No dimensions could be placed confidently. Check the original sheet and any unplaced text.");
  }catch(e){message("Image reading failed. Click the drawing to enter a callout manually, or retry. "+e.message);}
  finally{scanning=false;el("scanBar").hidden=true;redraw();}
}
// Version of the drawing-reading rules. A sheet read by an older version is read again when it is
// opened, as long as nobody has confirmed a balloon or entered a result on it yet.
const READER_VERSION=5;
const outdated=n=>plan.scanned[n]&&!plan.imageMatches?.[n]&&(plan.generalVersion?.[n]??0)<READER_VERSION;
function untouched(n){
  const answers=state().answers||{};
  const rows=[...plan.rows,...plan.offView].filter(r=>r.sheet===n);
  return !plan.approved[n]&&rows.every(r=>!r.confirmed&&!r.manual&&!r.moved&&r.repeats.every((_,i)=>!answers[r.id+"-"+i]));
}
async function show(n,selection){
  el("sheet").disabled=true;el("scan").disabled=true;
  canvas=await doc.render(n);page=n;
  if(plan.scanned[n]&&!plan.dimensionOnly?.[n]){
    // Preserve saved entries as unnumbered until the new pass matches their source.
    const old=plan.rows.filter(r=>r.sheet===n);
    old.forEach(r=>{r.unplaced=true;});
    plan.offView.push(...old);plan.rows=plan.rows.filter(r=>r.sheet!==n);
    plan.scanned[n]=false;plan.approved[n]=false;save();
  }
  if(plan.scanned[n]&&plan.generalVersion?.[n]===2){
    const pending=[...plan.rows,...plan.offView].filter(r=>r.sheet===n&&!r.confirmed&&!r.manual&&!r.bounds&&/°|degrees?\b/i.test(r.source));
    if(pending.length){
      const embedded=await doc.labels?.(n).catch(()=>[])||[];
      let ocr;
      try{ocr=await dimensionLines(canvas);}catch(error){if(!embedded.length)throw error;ocr=[];}
      const angular=drawingAngleDefault(verifiedImageLines(ocr,embedded));
      for(const row of pending){
        const parts=propose(row.source,angular);
        if(parts.length!==1||!parts[0].bounds)continue;
        if(row.name===row.source)row.name=parts[0].source;
        Object.assign(row,{source:parts[0].source,bounds:parts[0].bounds,unit:"°"});
      }
    }
    plan.generalVersion[n]=3;save();
  }
  if(outdated(n)){
    if(untouched(n)){
      plan.rows=plan.rows.filter(r=>r.sheet!==n);plan.offView=plan.offView.filter(r=>r.sheet!==n);
      plan.deleted=plan.deleted.filter(({row})=>row.sheet!==n);
      plan.scanned[n]=false;save();   // the caller reads the sheet again
    }else message("This sheet was read by an earlier version of the app. Press Read sheet image to read it again: balloons with results are kept, confirmed ones are kept unless they sit in the border or title block, and the rest are replaced.");
  }
  placing=null;el("sheet").value=n;selected=selection??onPage()[0]?.id;redraw();
}
el("sheet").onchange=async e=>{await show(Number(e.target.value));if(!plan.scanned[page]&&!plan.approved[page])await scan();};
el("scan").onclick=scan;
window.addEventListener("storage",e=>{if(e.key===key&&canvas)redraw();});
try{
  const file=await drawingFile(id);if(!file)throw Error("Upload this file in the inspection workspace to open it in this browser.");
  doc=await openSheets(file);el("source").href=URL.createObjectURL(file);
  plan=read(key+"-plan",{name:file.name,rows:[],approved:{},scanned:{},next:1,deleted:[],custom:true});
  plan.areas??={};plan.offView??=[];
  if(!plan.autoViews){
    // Rebuild untouched OCR drafts. Preserve confirmed requirements, answers and deletions.
    const reviewed=[...plan.rows,...plan.offView].filter(r=>r.confirmed);
    plan.offView=[];plan.rows=reviewed;
    plan.scanned={};plan.approved={};plan.autoViews=true;
  }
  el("title").textContent=file.name;el("forms").href="forms.html?drawing="+encodeURIComponent(id);
  for(let i=1;i<=doc.count;i++)el("sheet").add(new Option(i,i));
  plan.pageCount=doc.count;save();document.dispatchEvent(new Event("gaugebook:ready"));await show(1);
  if(!practice&&doc.count===1&&plan.scanned[1]&&!plan.imageMatches?.[1]&&!plan.checkedImageLayout){
    const matched=await matchPracticeImage(canvas);
    if(matched){
      const keep=r=>r.confirmed||!r.source||r.manual;
      plan.rows=plan.rows.filter(keep);plan.offView=plan.offView.filter(keep);
      plan.scanned[1]=false;plan.approved[1]=false;
    }
    plan.checkedImageLayout=true;save();
  }
  if(!plan.scanned[1]&&!plan.approved[1])await scan();else if(!/earlier version/.test(el("message").textContent))message("Saved inspection opened.");
}catch(e){message("Unable to open drawing. "+e.message);}
