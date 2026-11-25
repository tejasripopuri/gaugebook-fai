// Builds the AS9102 Forms 1–3 workbook (.xlsx) directly: bordered, labelled fields and Form 3
// fields 5–12 in standard order, with field 9 showing the reading as recorded ("6.004"),
// its cell coloured green (within limits) or red (outside).
import {identity,partFields,materialFields,componentFields,indexedParts,resultRows} from "./report-data.mjs";
import {judge,summarize} from "./plan.mjs";

const esc=v=>String(v).replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F]/g,"")
  .replace(/&/g,"&amp;").replace(/</g,"&lt;").replace(/>/g,"&gt;").replace(/"/g,"&quot;");
const colName=i=>String.fromCharCode(65+i);

// ---- styles (index = position in cellXfs) ----
const S={plain:0,title:1,subtitle:2,label:3,value:4,center:5,pass:6,fail:7,pending:8,section:9,statusPass:10,statusFail:11,statusPending:12,note:13};
const STYLES=`<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<styleSheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main">
<fonts count="8">
<font><sz val="10"/><color rgb="FF163D39"/><name val="Calibri"/><family val="2"/></font>
<font><b/><sz val="14"/><color rgb="FFFFFFFF"/><name val="Calibri"/><family val="2"/></font>
<font><sz val="10"/><color rgb="FF173F48"/><name val="Calibri"/><family val="2"/></font>
<font><b/><sz val="9"/><color rgb="FF173F48"/><name val="Calibri"/><family val="2"/></font>
<font><b/><sz val="10"/><color rgb="FF175F3E"/><name val="Calibri"/><family val="2"/></font>
<font><b/><sz val="10"/><color rgb="FF912D2D"/><name val="Calibri"/><family val="2"/></font>
<font><sz val="10"/><color rgb="FF5F706C"/><name val="Calibri"/><family val="2"/></font>
<font><b/><sz val="10"/><color rgb="FFFFFFFF"/><name val="Calibri"/><family val="2"/></font>
</fonts>
<fills count="8">
<fill><patternFill patternType="none"/></fill><fill><patternFill patternType="gray125"/></fill>
<fill><patternFill patternType="solid"><fgColor rgb="FF173F48"/></patternFill></fill>
<fill><patternFill patternType="solid"><fgColor rgb="FFDCE8E4"/></patternFill></fill>
<fill><patternFill patternType="solid"><fgColor rgb="FFEEF4F1"/></patternFill></fill>
<fill><patternFill patternType="solid"><fgColor rgb="FFDFF3E5"/></patternFill></fill>
<fill><patternFill patternType="solid"><fgColor rgb="FFFFDFDC"/></patternFill></fill>
<fill><patternFill patternType="solid"><fgColor rgb="FF2F6E62"/></patternFill></fill>
</fills>
<borders count="2">
<border><left/><right/><top/><bottom/><diagonal/></border>
<border><left style="thin"><color rgb="FF9FB3AE"/></left><right style="thin"><color rgb="FF9FB3AE"/></right><top style="thin"><color rgb="FF9FB3AE"/></top><bottom style="thin"><color rgb="FF9FB3AE"/></bottom><diagonal/></border>
</borders>
<cellStyleXfs count="1"><xf numFmtId="0" fontId="0" fillId="0" borderId="0"/></cellStyleXfs>
<cellXfs count="14">
<xf numFmtId="0" fontId="0" fillId="0" borderId="0" xfId="0"/>
<xf numFmtId="0" fontId="1" fillId="2" borderId="0" xfId="0" applyFont="1" applyFill="1" applyAlignment="1"><alignment vertical="center" indent="1"/></xf>
<xf numFmtId="0" fontId="2" fillId="3" borderId="0" xfId="0" applyFont="1" applyFill="1" applyAlignment="1"><alignment vertical="center" indent="1"/></xf>
<xf numFmtId="0" fontId="3" fillId="4" borderId="1" xfId="0" applyFont="1" applyFill="1" applyBorder="1" applyAlignment="1"><alignment vertical="center" wrapText="1"/></xf>
<xf numFmtId="0" fontId="0" fillId="0" borderId="1" xfId="0" applyBorder="1" applyAlignment="1"><alignment vertical="top" wrapText="1"/></xf>
<xf numFmtId="0" fontId="0" fillId="0" borderId="1" xfId="0" applyBorder="1" applyAlignment="1"><alignment horizontal="center" vertical="top"/></xf>
<xf numFmtId="0" fontId="4" fillId="5" borderId="1" xfId="0" applyFont="1" applyFill="1" applyBorder="1" applyAlignment="1"><alignment vertical="top" wrapText="1"/></xf>
<xf numFmtId="0" fontId="5" fillId="6" borderId="1" xfId="0" applyFont="1" applyFill="1" applyBorder="1" applyAlignment="1"><alignment vertical="top" wrapText="1"/></xf>
<xf numFmtId="0" fontId="6" fillId="0" borderId="1" xfId="0" applyFont="1" applyBorder="1" applyAlignment="1"><alignment vertical="top" wrapText="1"/></xf>
<xf numFmtId="0" fontId="7" fillId="7" borderId="1" xfId="0" applyFont="1" applyFill="1" applyBorder="1" applyAlignment="1"><alignment vertical="center"/></xf>
<xf numFmtId="0" fontId="4" fillId="5" borderId="1" xfId="0" applyFont="1" applyFill="1" applyBorder="1" applyAlignment="1"><alignment vertical="center"/></xf>
<xf numFmtId="0" fontId="5" fillId="6" borderId="1" xfId="0" applyFont="1" applyFill="1" applyBorder="1" applyAlignment="1"><alignment vertical="center"/></xf>
<xf numFmtId="0" fontId="6" fillId="0" borderId="1" xfId="0" applyFont="1" applyBorder="1" applyAlignment="1"><alignment vertical="center"/></xf>
<xf numFmtId="0" fontId="6" fillId="0" borderId="0" xfId="0" applyFont="1" applyAlignment="1"><alignment vertical="center" wrapText="1"/></xf>
</cellXfs>
<cellStyles count="1"><cellStyle name="Normal" xfId="0" builtinId="0"/></cellStyles>
</styleSheet>`;

// ---- a small sheet builder ----
class Sheet{
  constructor(name,widths){this.name=name;this.widths=widths;this.rows=[];this.merges=[];this.freeze=null;}
  // cells: array of [value, style, span]; span merges that many columns
  add(cells,{height}={}){
    const r=this.rows.length+1,out=[];let c=0;
    for(const [value,style=S.value,span=1] of cells){
      out.push({ref:colName(c)+r,value,style,width:this.widths.slice(c,c+span).reduce((a,b)=>a+b,0)});
      for(let k=1;k<span;k++)out.push({ref:colName(c+k)+r,value:"",style});
      if(span>1)this.merges.push(colName(c)+r+":"+colName(c+span-1)+r);
      c+=span;
    }
    // Excel does not grow wrapped rows by itself, so size each row for its longest text.
    const lines=Math.max(1,...out.map(o=>String(o.value??"").split("\n").reduce((n,line)=>n+Math.max(1,Math.ceil(line.length*.85/Math.max(4,o.width-1))),0)));
    this.rows.push({cells:out,height:height??Math.max(17,lines*13+5)});
    return r;
  }
  xml(){
    const cols=this.widths.map((w,i)=>`<col min="${i+1}" max="${i+1}" width="${w}" customWidth="1"/>`).join("");
    const rows=this.rows.map((row,i)=>`<row r="${i+1}" ht="${row.height}" customHeight="1">`+row.cells.map(({ref,value,style})=>{
      if(value===undefined||value===null||value==="")return `<c r="${ref}" s="${style}"/>`;
      if(typeof value==="number")return `<c r="${ref}" s="${style}"><v>${value}</v></c>`;
      return `<c r="${ref}" s="${style}" t="inlineStr"><is><t xml:space="preserve">${esc(value)}</t></is></c>`;
    }).join("")+`</row>`).join("");
    const pane=this.freeze?`<sheetViews><sheetView workbookViewId="0"><pane ySplit="${this.freeze-1}" topLeftCell="A${this.freeze}" activePane="bottomLeft" state="frozen"/></sheetView></sheetViews>`:`<sheetViews><sheetView workbookViewId="0"/></sheetViews>`;
    const merges=this.merges.length?`<mergeCells count="${this.merges.length}">${this.merges.map(m=>`<mergeCell ref="${m}"/>`).join("")}</mergeCells>`:"";
    return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships">${pane}<sheetFormatPr defaultRowHeight="15"/><cols>${cols}</cols><sheetData>${rows}</sheetData>${merges}<pageMargins left="0.5" right="0.5" top="0.6" bottom="0.6" header="0.3" footer="0.3"/></worksheet>`;
  }
}

// Blank rows left for hand-written entries, as on the AS9102 forms (the tables grow if more are filled in).
export const BLANK_ROWS={assemblyIndex:30,materials:15,testReports:5};
const padded=(rows,min)=>[...rows,...Array.from({length:Math.max(0,min-rows.length)},()=>[])];

const statusStyle=s=>s==="Pass"?S.pass:s==="Fail"?S.fail:S.pending;
const overallStyle=s=>s==="Pass"?S.statusPass:s==="Fail"?S.statusFail:S.statusPending;
// A row of field labels followed by a row of their values.
function fields(sheet,labels,values,spans){
  sheet.add(labels.map((l,i)=>[l,S.label,spans?.[i]??1]),{height:labels.some(l=>l.length>28)?30:18});
  sheet.add(values.map((v,i)=>[v??"",S.value,spans?.[i]??1]));
}

export function workbookData(report,plan,inspection){
  const p=report.part,rows=resultRows(plan,inspection,report);
  const subtitle=plan.custom?"A&B Foundry   ·   "+(p["Part number"]||plan.name)+"   ·   First article inspection"
    :"A&B Foundry   ·   AS/EN/SJAC 9102 Rev C   ·   SMP-1001 Adapter Plate   ·   Training drawing";
  const results=rows.map(r=>{
    const row=plan.rows.find(c=>c.id===r.id),decision=judge(row,inspection.answers?.[r.key]);
    const status=r.throughStatus?summarize([decision,r.throughStatus]):decision;
    return {...r,status:status==="Not yet inspected"?"Pending":status};
  });
  return {p,subtitle,results,overall:summarize(results.map(r=>r.status==="Pending"?"Pending":r.status))};
}

export async function makeWorkbook(_template,report,plan,inspection,zipLibrary=globalThis.JSZip){
  const {p,subtitle,results,overall}=workbookData(report,plan,inspection);
  const ids=identity.map(k=>p[k]??"");

  // Form 1 · Part number accountability
  const f1=new Sheet("Form 1",[30,30,30,30]);
  f1.add([["Form 1   ·   Part number accountability",S.title,4]],{height:26});
  f1.add([[subtitle,S.subtitle,4]],{height:18});
  fields(f1,["1. Part number","2. Part name","3. Serial / lot number","4. FAIR identifier"],ids);
  fields(f1,["5. Part revision","6. Drawing number","7. Drawing revision","8. Additional changes"],partFields.slice(0,4).map(k=>p[k]));
  fields(f1,["9. Manufacturing process reference","10. Organization name","11. Supplier code","12. Purchase order"],partFields.slice(4).map(k=>p[k]));
  fields(f1,["13. Detail / assembly","14. Full / partial FAI","Baseline part and revision","Reason for FAI"],[p.kind||"Detail",p.scope,p.baseline,p.reason]);
  f1.add([["Assembly index   ·   applicable to assemblies",S.section,4]],{height:20});
  f1.add(componentFields.map(l=>[l.replace(/^(\d+)\. /,"$1. "),S.label]),{height:18});
  const components=indexedParts(report);
  for(const c of padded(components,BLANK_ROWS.assemblyIndex))f1.add([0,1,2,3].map(i=>[c[i]??"",S.value]),{height:17});
  fields(f1,["19. Does the FAIR contain documented nonconformances?"],[p.nc],[4]);
  fields(f1,["20. Verified by","21. Verification date","22. Reviewed / approved by","23. Review date"],["Verified by","Verification date","Reviewed / approved by","Review date"].map(k=>p[k]));
  f1.add([["Inspection status",S.section,4]],{height:20});
  f1.add([[overall,overallStyle(overall),4]],{height:22});

  // Form 2 · Product accountability
  const f2=new Sheet("Form 2",[28,30,14,24,24,26]);
  f2.add([["Form 2   ·   Product accountability",S.title,6]],{height:26});
  f2.add([[subtitle,S.subtitle,6]],{height:18});
  fields(f2,["1. Part number","2. Part name","3. Serial / lot number","4. FAIR identifier"],ids,[1,1,2,2]);
  f2.add(["5. Material or process","6. Specification","7. Code","8. Supplier","9. Customer approval verification","10. Certificate of conformance"].map(l=>[l,S.label]),{height:30});
  const products=report.products.filter(r=>r.some(v=>String(v??"").trim()));
  for(const r of padded(products,BLANK_ROWS.materials))f2.add(materialFields.map((_,j)=>[r[j]??"",S.value]),r.length?{}:{height:17});
  f2.add([["11. Functional test procedure",S.label,3],["12. Acceptance report",S.label,3]],{height:18});
  const tests=[[report.tests?.["Functional test procedure"],report.tests?.["Acceptance report"]]];
  for(const [a,b] of padded(tests,BLANK_ROWS.testReports))f2.add([[a??"",S.value,3],[b??"",S.value,3]]);
  fields(f2,["13. Comments"],[report.tests?.Comments],[6]);

  // Form 3 · Characteristic accountability (AS9102 fields 5–12)
  const f3=new Sheet("Form 3",[8,34,15,38,20,18,16,34]);
  f3.add([["Form 3   ·   Characteristic accountability, verification and compatibility evaluation",S.title,8]],{height:26});
  f3.add([[subtitle,S.subtitle,8]],{height:18});
  fields(f3,["1. Part number","2. Part name","3. Serial / lot number","4. FAIR identifier"],ids,[2,2,2,2]);
  f3.add(["5. Char. no.","6. Reference location","7. Characteristic designator","8. Requirement","9. Results","10. Designed / qualified tooling","11. Nonconformance number","12. Additional data / comments"].map(l=>[l,S.label]),{height:30});
  f3.freeze=f3.rows.length+1;
  const oneSheet=plan.rows.every(r=>(r.sheet||1)===1);
  for(const r of results){
    const comments=[r.comments,r.throughStatus&&"Through hole: "+(r.throughStatus==="Not yet inspected"?"Pending":r.throughStatus)].filter(Boolean).join(" / ");
    f3.add([[r.balloon,S.center],[oneSheet?r.location.replace(/^Sheet 1 · /,""):r.location],[r.designator],[r.requirement],[r.value,statusStyle(r.status)],[r.tool],[r.nc],[comments]]);
  }
  f3.add([["Field 9 shows each reading as recorded; its cell is green when within limits and red when outside. Generated by Gaugebook.",S.note,8]],{height:18});

  const sheets=[f1,f2,f3],zip=new zipLibrary();
  zip.file("[Content_Types].xml",`<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/><Override PartName="/xl/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.styles+xml"/>${sheets.map((_,i)=>`<Override PartName="/xl/worksheets/sheet${i+1}.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/>`).join("")}</Types>`);
  zip.file("_rels/.rels",`<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="xl/workbook.xml"/></Relationships>`);
  zip.file("xl/workbook.xml",`<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"><bookViews><workbookView activeTab="0"/></bookViews><sheets>${sheets.map((s,i)=>`<sheet name="${s.name}" sheetId="${i+1}" r:id="rId${i+1}"/>`).join("")}</sheets></workbook>`);
  zip.file("xl/_rels/workbook.xml.rels",`<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">${sheets.map((_,i)=>`<Relationship Id="rId${i+1}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet${i+1}.xml"/>`).join("")}<Relationship Id="rId${sheets.length+1}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" Target="styles.xml"/></Relationships>`);
  zip.file("xl/styles.xml",STYLES);
  sheets.forEach((s,i)=>zip.file(`xl/worksheets/sheet${i+1}.xml`,s.xml()));
  return zip.generateAsync({type:"uint8array",compression:"DEFLATE"});
}
