import test from "node:test";
import assert from "node:assert/strict";
import {readFileSync} from "node:fs";
import {initialReport,resultRows} from "../public/report-data.mjs";
import {makePacket} from "../public/report-pdf.mjs";
import {PDFDocument} from "../public/vendor/pdf-lib.mjs";
const asset=name=>readFileSync(new URL("../public/"+name,import.meta.url));
const plan=JSON.parse(asset("reviewed-plan.json")),template=asset("ab-foundry-forms.pdf");
test("report preserves separate occurrences, evidence and failed readings",()=>{
  const r=initialReport();r.extra["12-2"]={nc:"NCR-123"};
  const rows=resultRows(plan,{answers:{"12-2":".290"},evidence:{12:"Inspection record 1"}},r);
  const row=rows.find(e=>e.key==="12-2");
  assert.equal(row.nc,"NCR-123");assert.match(row.result,/Fail/);assert.match(row.comments,/record 1/);
  assert.equal(rows.filter(e=>e.result.startsWith("Pending")).length,31);
  assert.ok(plan.rows.every(r=>r.source.length>0));
  assert.equal(rows.length,32);
  assert.ok(rows.every(r=>! /^(?:4X )?THRU$/.test(r.requirement)));
  assert.equal(row.requirement,"4X Ø.281 ±.005 THRU");
  assert.equal(row.throughKey,"13-2");
});
test("download each template and the complete paginated packet",async()=>{
  const r=initialReport(),rows=resultRows(plan,{},r);let individual=0;
  for(const id of [1,2,3]){
    const d=await PDFDocument.load(await makePacket(template,r,rows,[id]));
    assert.ok(id===3?d.getPageCount()>1:d.getPageCount()===1);individual+=d.getPageCount();
  }
  const packet=await PDFDocument.load(await makePacket(template,r,rows,[1,2,3]));
  assert.equal(packet.getPageCount(),individual);
});
test("compound callouts produce separate requirements and independent results",()=>{
  const rows=resultRows(plan,{answers:{"7-0":"1.750","8-0":".135"}},initialReport());
  const row=id=>rows.find(r=>r.id===id);
  assert.equal(row(7).requirement,"CBORE Ø1.750 ±.005");
  assert.equal(row(8).requirement,".125 ±.005 DP");
  assert.match(row(7).result,/Pass$/);assert.match(row(8).result,/Fail$/);
  assert.ok(rows.every(r=>! /\s[X×]\s/i.test(r.requirement)));
  assert.match(row(4).requirement,/^4X /);
});
test("shared callouts use one balloon and deletion renumbers without shifting results",()=>{
 const inspection={answers:{"7-0":"1.750"}},report=initialReport();
 const all=resultRows(plan,inspection,report);
 const balloon=(rows,id)=>rows.find(r=>r.id===id).balloon;
 assert.equal(all.filter(r=>r.id===12).length,4);assert.ok(all.every(r=>r.id!==6&&r.id!==13));
 const reduced=resultRows(plan,{...inspection,removed:[5]},report);
 assert.ok(reduced.every(r=>r.id!==5&&r.id!==6));
 assert.equal(balloon(reduced,7),balloon(all,7)-1);
 assert.match(reduced.find(r=>r.id===7).result,/1.750.*Pass/);
 assert.deepEqual([...new Set(reduced.map(r=>r.balloon))],Array.from({length:20},(_,i)=>i+1));
});
