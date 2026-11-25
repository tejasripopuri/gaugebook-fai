import test from "node:test";
import assert from "node:assert/strict";
import {repairOcrText,propose} from "../public/callouts.mjs";

// Misreadings observed when the 50 sample drawings were uploaded as PNG/JPEG images.
test("OCR misread of ± as + is repaired so limits can be proposed",()=>{
  for(const [ocr,fixed,bounds] of [
    ["5.000 +.010","5.000 ±.010",[4.99,5.01]],
    ["4X @.201 +.002 THRU","4X Ø.201 ±.002 THRU",[.199,.203]],
    ["CBORE @1.125 +.003","CBORE Ø1.125 ±.003",[1.122,1.128]],
    ["SLOT 9.9 +0.1 WIDE","SLOT 9.9 ±0.1 WIDE",[9.8,10]],
    ["POCKET .408 +.003 DP","POCKET .408 ±.003 DP",[.405,.411]],
    ["90° +0.5°","90° ±0.5°",[89.5,90.5]],
    ["90° +1°","90° ±1°",[89,91]],
  ]){
    assert.equal(repairOcrText(ocr),fixed);
    assert.deepEqual(propose(repairOcrText(ocr))[0].bounds,bounds);
  }
});
test("one-sided tolerances and unreadable text are left unchanged",()=>{
  for(const text of [
    "91.250 +.003/-.000 THRU",   // unilateral: keeps its "/-" part (the leading 9 is a misread Ø, not guessed)
    "KEYWAY .188 +.002/-.000 WIDE",
    "1.250 +.002 -.000",
    "R.250 + 003",               // decimal point lost: not guessed
    "9.201 +.00",                // zero tolerance: not a real reading
    "1/4-20 UNC-2B 7.50",
    "M6x1.0-6H",
    "2X 1.0 X 45° CHAM",
    "Ra 63 +10%",
    "Ø1.250 ±.003",
    "-500 +.003",                // ".500" with its decimal point lost
    "343 +.002 THRU",
    "ZZ 8X O1343 +.005 THRU",    // "Ø.343" misread as "O1343"
    "z= 6X B343 +.003 THRU",
    "{1.0 +0.1 THRU",            // "Ø11.0" misread as "{1.0"
  ])assert.equal(repairOcrText(text),text);
});
