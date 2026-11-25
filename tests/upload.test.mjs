import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import {propose} from "../public/callouts.mjs";
import {initialReport,resultRows} from "../public/report-data.mjs";
import {makeWorkbook} from "../public/report-excel.mjs";
import JSZip from "../public/vendor/jszip.min.js";
test("compound and repeated callouts retain separate proposed limits",()=>{
  const split=propose("4X CBORE Ø1.750 ±.005 X .125 ±.005 DP");
  assert.deepEqual(split.map(r=>r.bounds),[[1.745,1.755],[.12,.13]]);
  assert.deepEqual(split.map(r=>r.count),[4,4]);
  assert.deepEqual(propose("Ø.250 +.002/-.000")[0].bounds,[.25,.252]);
  assert.equal(propose("FINISH PER NOTE 4")[0].bounds,null);
});
test("custom exports expand past the sample rows and use the uploaded part",async()=>{
  const plan={custom:true,name:"Housing.pdf",rows:[{id:1,sheet:2,name:"Hole",source:"Ø.250 ±.002",unit:"in",bounds:[.248,.252],repeats:Array.from({length:60},(_,i)=>"Hole "+(i+1))}]};
  const state={answers:{"1-59":".260"}},report=initialReport(plan);
  assert.equal(resultRows(plan,state,report).at(-1).result,".260 in · Fail");
  const bytes=await makeWorkbook(null,report,plan,state,JSZip);
  const zip=await JSZip.loadAsync(bytes);
  for(const i of [1,2,3]){
    const xml=await zip.file("xl/worksheets/sheet"+i+".xml").async("string");
    assert.doesNotMatch(xml,/SMP-1001|anodize|Adapter Plate/i);
    if(i===3){
      assert.match(xml,/\.260 in · Fail/);assert.match(xml,/Sheet 2 · Hole · Hole 60/);
      assert.equal((xml.match(/Sheet 2 · Hole · Hole \d+/g)||[]).length,60);
    }
  }
});

import {practiceLayout} from "../public/practice-views.mjs";
import {inside,anchorFor} from "../public/drawing-areas.mjs";
test("practice balloons stay on drawing views and coordinate checks keep distinct feature identities",()=>{
  const plan=practiceLayout("beebc4317c706a23c5e4ac5cd662df6fb64e9d24a8dfe4894d3eb9c7eae129c9");
  assert.equal(plan.rows.length,4);
  assert.equal(plan.supplemental.filter(r=>r.name.endsWith(" · X")).length,5);
  assert.equal(plan.supplemental.filter(r=>r.name.endsWith(" · Y")).length,5);
  assert.ok(plan.rows.every(r=>inside(plan.areas,r.xy)));
  assert.equal(new Set(plan.rows.map(r=>r.xy.join(","))).size,4);
  assert.equal(anchorFor(plan.areas,.85,.05),null);
  assert.equal(practiceLayout("different-revision"),null);
});

import {generalRows} from "../public/general-plan.mjs";
test("only view dimensions receive balloons on unfamiliar drawings",()=>{
  const line=(text,x,y)=>({text,bbox:{x0:x-5,y0:y-4,x1:x+5,y1:y+4}});
  const rows=generalRows([
    line("J",300,300),line("J CBORE Ø.850 ±.002 X .125 ±.003 DP",800,200),
    line("95",220,151),line("4.250 ±.005",800,600),line("REV 4",700,850),
  ],[[.15,.15,.55,.55]],1000,1000);
  assert.deepEqual(rows.map(r=>r.off),[true,true,false,true]);
  assert.deepEqual(rows[0].bounds,[.848,.852]);assert.deepEqual(rows[1].bounds,[.122,.128]);
  assert.deepEqual(rows[0].xy,rows[1].xy);
  assert.deepEqual(rows[0].sourceBox,[.795,.196,.805,.204]);
});

test("angular requirements inherit the current sheet's readable tolerance",async()=>{
  const {drawingAngleDefault}=await import("../public/callouts.mjs");
  const read=(...texts)=>drawingAngleDefault(texts.map(text=>({text})));
  const rule=read("TOLERANCES: ANG ±0.5°");
  assert.deepEqual(propose(".030 X 45° CHAM",rule)[1],{source:"45° ±0.5° CHAM",bounds:[44.5,45.5],count:1,unit:"°"});
  assert.deepEqual(propose("60°",read("ANGLES +/- 1°"))[0].bounds,[59,61]);
  assert.deepEqual(propose("60° ±0.1°",rule)[0].bounds,[59.9,60.1]);
  assert.deepEqual(propose("30°",read("ANGULAR ±30′"))[0].bounds,[29.5,30.5]);
  assert.equal(propose("45° CHAM",read("ANGLES ±1°","ANGLES ±2°"))[0].bounds,null);
  assert.equal(propose("45° REF",rule)[0].bounds,null);
  assert.equal(propose("45° CHAM")[0].bounds,null);
});
