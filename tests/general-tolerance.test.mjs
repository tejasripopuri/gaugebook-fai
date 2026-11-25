import test from "node:test";
import assert from "node:assert/strict";
import {drawingLinearDefaults,definesGeneralTolerance,withGeneralTolerance,propose,drawingAngleDefault} from "../public/callouts.mjs";

const lines=t=>t.map(text=>({text}));
test("title-block general tolerances are read by decimal places",()=>{
  const inch=drawingLinearDefaults(lines(["TOLERANCES: ANG ±0.5°",".XX ±.01  .XXX ±.005"]));
  assert.deepEqual([...inch].map(([d,r])=>[d,r.tol,r.label]),[[2,.01,".XX ±.01"],[3,.005,".XXX ±.005"]]);
  const metric=drawingLinearDefaults(lines(["GENERAL TOLERANCES  X ±0.5  X.X ±0.2  X.XX ±0.05"]));
  assert.deepEqual([...metric].map(([d,r])=>[d,r.tol]),[[0,.5],[1,.2],[2,.05]]);
  assert.equal(drawingLinearDefaults(lines(["5.000 ±.010","Ø.281 ±.005 THRU"])).size,0);
  // as image OCR reads them: ± as +, the decimal point as "-" or lost
  const ocr=drawingLinearDefaults(lines(["-XX +.01","XXX +.005"]));
  assert.deepEqual([...ocr].map(([d,r])=>[d,r.tol,r.label]),[[2,.01,".XX ±.01"],[3,.005,".XXX ±.005"]]);
  assert.equal(drawingAngleDefault(lines(["ANGLES +0.5°"])).delta,.5);
  assert.ok(definesGeneralTolerance(".XX ±.01 .XXX ±.005"));
  assert.ok(definesGeneralTolerance("XXX +.005"));
  assert.ok(!definesGeneralTolerance("4X Ø.281 ±.005 THRU"));
  assert.ok(!definesGeneralTolerance("BOX +.01"));
  assert.ok(!definesGeneralTolerance("6.000 ±.010"));
});
test("untoleranced dimensions take the title-block tolerance",()=>{
  const d=drawingLinearDefaults(lines([".XX ±.01  .XXX ±.005"]));
  const apply=t=>withGeneralTolerance(propose(t)[0],d);
  assert.deepEqual(apply("2.000").bounds,[1.995,2.005]);
  assert.equal(apply("2.000").source,"2.000 (.XXX ±.005 title block)");
  assert.deepEqual(apply("3.00").bounds,[2.99,3.01]);
  assert.deepEqual(apply("4X Ø.281 THRU").bounds,[.276,.286]);
  assert.deepEqual(apply("R.250").bounds,[.245,.255]);
  assert.deepEqual(apply("5.000 BSC").bounds,[4.995,5.005]);   // basic too, as requested for uploads
  assert.deepEqual(apply("6.000 ±.010").bounds,[5.99,6.01]);   // its own tolerance wins
  for(const t of ["(2.000)","2.000 REF","3.0","45°","MATERIAL 6061"])assert.equal(apply(t).bounds??null,propose(t)[0].bounds??null,t);
  assert.equal(withGeneralTolerance(propose("2.000")[0],new Map()).bounds,null);  // no title block, no guess
});
