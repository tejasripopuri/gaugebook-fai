import test from "node:test";
import assert from "node:assert/strict";
import {drawingLinearDefaults,definesGeneralTolerance,withGeneralTolerance,propose,drawingAngleDefault,dimensionKind,basicValuesFromNotes} from "../public/callouts.mjs";

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
  assert.equal(apply("2.000").source,"2.000 ±.005");
  assert.equal(apply("2.000").generalTolerance,".XXX ±.005");
  assert.equal(apply("4X Ø.281 THRU").source,"Ø.281 ±.005 THRU");
  assert.equal(apply("3.00").source,"3.00 ±.01");
  assert.deepEqual(apply("3.00").bounds,[2.99,3.01]);
  assert.deepEqual(apply("4X Ø.281 THRU").bounds,[.276,.286]);
  assert.deepEqual(apply("R.250").bounds,[.245,.255]);
  assert.equal(apply("5.000 BSC").bounds,null);               // basic: the dimension only
  assert.deepEqual(apply("6.000 ±.010").bounds,[5.99,6.01]);   // its own tolerance wins
  for(const t of ["(2.000)","2.000 REF","3.0","45°","MATERIAL 6061"])assert.equal(apply(t).bounds??null,propose(t)[0].bounds??null,t);
  assert.equal(withGeneralTolerance(propose("2.000")[0],new Map()).bounds,null);  // no title block, no guess
});

test("basic and reference dimensions keep just the dimension",()=>{
  // SMP-1001 note 5 wraps over three lines
  const basic=basicValuesFromNotes(lines(["5. DIMENSIONS 3.000, 2.000, 5.000 AND","3.000 LOCATING HOLES AND BORE ARE","BASIC.","6. INTERPRET PER ASME Y14.5-2018.","4. BREAK ALL SHARP EDGES .005-.015."]));
  assert.deepEqual([...basic].sort(),[2,3,5]);
  assert.equal(basicValuesFromNotes(lines(["4. BREAK ALL SHARP EDGES .005-.015.","ALL MACHINED SURFACES 63 Ra MAX."])).size,0);
  // the note's sentence ends at "BASIC." even when other drawing text follows it in reading order
  assert.deepEqual([...basicValuesFromNotes(lines(["2. DIMENSION 2.500 IS BASIC.","GENERAL TOLERANCES","3.000","5.000"]))],[2.5]);
  assert.deepEqual([...basicValuesFromNotes(lines(["3. BASIC DIMENSIONS: 1.250 AND 4.000.","6.000 ±.010"]))].sort(),[1.25,4]);
  assert.equal(dimensionKind("[5.000]"),"basic (boxed)");
  const ctx={basicValues:basic};
  assert.equal(dimensionKind("2.000",ctx),"basic (note)");
  assert.equal(dimensionKind("1.250",ctx),null);
  assert.equal(dimensionKind("1.250",{boxed:()=>true}),"basic (boxed)");
  assert.equal(dimensionKind("5.000 BSC"),"basic");
  assert.equal(dimensionKind("5.000 BASIC"),"basic");
  assert.equal(dimensionKind("(2.000)"),"reference");
  assert.equal(dimensionKind("(Ø.500)"),"reference");
  assert.equal(dimensionKind("2.000 REF"),"reference");
  assert.equal(dimensionKind("6.000 ±.010",{boxed:()=>true}),null);   // has its own tolerance
  const d=drawingLinearDefaults(lines([".XX ±.01  .XXX ±.005"]));
  for(const s of ["(2.000)","2.000 REF","5.000 BSC"])assert.equal(withGeneralTolerance(propose(s)[0],d).bounds??null,null,s);
});
