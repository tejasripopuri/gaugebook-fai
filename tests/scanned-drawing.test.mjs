import test from "node:test";
import assert from "node:assert/strict";
import {repairScanNumbers,cleanReading,repairOcrText,propose} from "../public/callouts.mjs";
import {joinStacks,generalRows} from "../public/general-plan.mjs";

// Readings taken from a scanned 1985 E-size drawing (its PDF text layer and Tesseract).
test("scanned numbers are rejoined: a 1 read as I, numbers split by spaces",()=>{
  for(const [scan,fixed] of [["I .550","1.550"],["I. 738","1.738"],["2.53 I","2.531"],[". I 25",".125"],[". I 00 R",".100 R"],["I . 03 I","1.031"]])
    assert.equal(repairScanNumbers(scan),fixed);
  for(const text of ["DIA THRU","COR BRK","ISO 2768","I","DIA I","10.5 ±0.1","1.738",".5485"])
    assert.equal(repairScanNumbers(text),text);
});
test("leader and arrow stubs are trimmed from readings",()=>{
  assert.equal(cleanReading("<= .370"),".370");
  assert.equal(cleanReading(".225 —<——|"),".225");
  assert.equal(repairOcrText(cleanReading("\uFFFD-- . 225 ___,\uFFFD")),".225");
  for(const text of ["(2.000)","-.005","±.010","#5°","2X"])assert.equal(cleanReading(text),text);
});

const L=(text,x0,y0,x1)=>({text,bbox:{x0,y0,x1,y1:y0+29}});
test("a tolerance printed under its dimension stays with it",()=>{
  const joined=joinStacks([
    L(".5485",1522,1367,1620),L("+.0000 []]",1525,1397,1696),L("-.0005",1522,1426,1640),L("DIA",1522,1455,1582),
    L(".218",3633,887,3710),L("+.010",3635,914,3731),L("DIA THRU",3632,945,3790),
    L(".030 R",3090,2462,3208),L("±.010",3094,2491,3189),L("2X",3090,2521,3128),
    L("45°",2000,500,2060),L("#5°",1998,529,2060),L("2.531",1800,600,1900),L("REF",1810,629,1870),
    L(".797",2916,1357,2988),L("±.010",2913,1386,3008),L(".688",2940,1493,3017)]).map(l=>l.text).sort();
  assert.deepEqual(joined,[".218 ±.010 DIA THRU",".5485 +.0000/-.0005 DIA",".688",".797 ±.010","2.531 REF","2X .030 ±.010 R","45° ±5°"]);
  assert.deepEqual(propose(".5485 +.0000/-.0005 DIA")[0].bounds,[.548,.5485]);
  assert.deepEqual(propose("2X .030 ±.010 R")[0].bounds,[.02,.04]);
  assert.deepEqual(propose("45° ±5°")[0].bounds,[40,50]);
  assert.deepEqual(propose(".218 ±.010 DIA THRU")[0].bounds,[.208,.228]); // a lone "+" under it was a misread ±
});
test("border zones, the title block and stray tolerances are not ballooned; surface roughness marks are",()=>{
  const W=4000,H=3000,view=[[.1,.1,.9,.7]];
  const lines=[
    // dimensions on the view (inch style: leading decimal point)
    L(".500",1000,800,1080),L("±.010",1000,829,1090),L(".250",1500,800,1580),L("±.005",1500,829,1590),
    L(".125",2000,800,2080),L("±.010",2000,829,2090),L(".750",2500,800,2580),L("±.010",2500,829,2590),L(".062",3000,800,3080),
    // not requirements
    L("7",600,20,620),L("G",10,900,30),L("-.004",1700,1600,1790),
    // surface roughness marks: characteristics with a maximum Ra
    L("250",1200,1200,1260),L("16",1300,1300,1330),
    L("DRAWN J. WILKE",2900,2400,3200),L("CHK E. LARSON",2900,2450,3200),L("SCALE 4/1",2900,2500,3100),L("85-06-05",3300,2400,3460),
    L("743232",3300,2600,3460),L(".oo5@ls®IA®I",1800,1100,2000)];
  const rows=generalRows(lines,view,W,H).map(r=>r.source).sort();
  assert.deepEqual(rows,[".062",".125 ±.010",".250 ±.005",".500 ±.010",".750 ±.010","Surface roughness Ra 16 µin max","Surface roughness Ra 250 µin max"]);
});

// ---- border and title block, found from the sheet's ruled lines ----------------------------
import {onFurniture,clipViews} from "../public/drawing-areas.mjs";
const furniture={frame:[.15,.024,.979,.971],blocks:[[.61,.868,.979,.971]]};

test("text in the border or the title block is not a requirement, on any drawing", () => {
  assert.equal(onFurniture(furniture,[.82,.012],[.81,.006,.83,.018]),true);   // zone number above the frame
  assert.equal(onFurniture(furniture,[.08,.5],[.07,.49,.09,.51]),true);       // notes column left of the frame
  assert.equal(onFurniture(furniture,[.9,.93],[.88,.92,.92,.94]),true);       // drawing number in the title block
  assert.equal(onFurniture(furniture,[.5,.4],[.48,.39,.52,.41]),false);       // a dimension on a view
  assert.equal(onFurniture(furniture,[.5,.02],[.48,.015,.52,.03]),false);     // text touching the frame line still counts
});

test("generalRows drops callouts outside the frame and in the title block", () => {
  const W=1000,H=1000,box=(x,y,t)=>({text:t,bbox:{x0:x-30,y0:y-8,x1:x+30,y1:y+8}});
  const lines=[box(500,400,".500 ±.010"),box(820,12,"2.000 ±.005"),box(900,930,"1.250 ±.010"),box(80,500,".750 ±.005")];
  const views=[[.05,.03,.98,.97]];   // a view detection that ran into the border and title block
  const all=generalRows(lines,views,W,H).map(r=>r.source);
  const kept=generalRows(lines,views,W,H,null,furniture).map(r=>r.source);
  assert.ok(all.length>kept.length);
  assert.deepEqual(kept,[".500 ±.010"]);
});

test("views are clipped to the frame and title blocks are not views", () => {
  assert.deepEqual(clipViews([[.1,.1,.5,.5],[.62,.87,.97,.97]],furniture),[[.15,.1,.5,.5]]);
});

test("an angle and the tolerance under it stay one callout even when OCR misreads ° and ±", () => {
  const L=(t,x,y)=>({text:t,bbox:{x0:x,y0:y,x1:x+40,y1:y+14}});
  for(const [a,b,want] of [["15°","±5°","15° ±5°"],["15°","5°","15° ±5°"],["45o","t5°","45° ±5°"],["450","#5°","45° ±5°"],["45*","+5o","45° ±5°"]])
    assert.deepEqual(joinStacks([L(a,100,100),L(b,100,116)]).map(l=>l.text),[want]);
  assert.deepEqual(joinStacks([L(".250",100,100),L("5°",100,116)]).map(l=>l.text),[".250","5°"]);   // not an angle
  assert.deepEqual(propose("45° ±5°")[0].bounds,[40,50]);
});

// ---- a scanned title block's general tolerance table, and Ø read as 9 (TR-101) -------------
import {generalToleranceTable,repairDiameterNines} from "../public/general-plan.mjs";
const at=(t,x,y,w=60)=>({text:t,bbox:{x0:x,y0:y,x1:x+w,y1:y+18}});

test("a general tolerance table OCR broke into pieces is still read", () => {
  const lines=[at("GENERAL TOLERANCES",110,1520,270),at("UNLESS OTHERWISE SPECIFIED",110,1580,320),
    at("XX",112,1646,40),at("",208,1648,12),at("-01 IN",226,1646,80),
    at("+ XXX",112,1704,52),at("ae",208,1718,12),at("-005 IN",226,1704,92),at("ANGLES",110,1760,82),at("exh",208,1760,40)];
  assert.deepEqual([...generalToleranceTable(lines,2600,2010)].map(([d,r])=>[d,r.tolText]),[[2,".01"],[3,".005"]]);
});

test("Ø read as 9 is repaired only when the 9 makes the value implausibly large", () => {
  const texts=l=>repairDiameterNines(l.map((t,i)=>at(t,0,i*30))).map(l=>l.text);
  assert.deepEqual(texts(["1.800 ±.005","0.300","90.600 ±.002","91.500","91.000"]),["1.800 ±.005","0.300","Ø0.600 ±.002","Ø1.500","Ø1.000"]);
  assert.deepEqual(texts(["95.0","120.5","90.6"]),["95.0","120.5","90.6"]);      // a metric part with large sizes
});

// ---- where a balloon goes ------------------------------------------------------------------
import {startOfText} from "../public/general-plan.mjs";
test("a balloon sits just before the start of its dimension, not on it", () => {
  const line={text:"1.800 ±.005",bbox:{x0:1000,y0:500,x1:1200,y1:530}},W=2000,H=1500;
  const [x,y]=startOfText(line,W,H,[]);
  assert.ok(x<1000/W,"left of the text");assert.ok(x>1000/W-.03,"right next to it");
  assert.ok(Math.abs(y-515/H)<.002,"level with the text");
  // if that spot is taken by another balloon it moves on, still clear of the text
  const [x2,y2]=startOfText(line,W,H,[[x,y]]);
  assert.ok(y2<500/H&&Math.abs(x2-1000/W)<.02,"just above the start of the text");
  // a stacked callout: level with its first line
  const stack={text:".5485 +.0000/-.0005 DIA",bbox:{x0:1000,y0:500,x1:1100,y1:620},lineH:30,stacked:true};
  assert.ok(Math.abs(startOfText(stack,W,H,[])[1]-515/H)<.002);
});

// ---- GD&T feature control frames read from a scan (743232) ---------------------------------
import {readFrame,datumLetters} from "../public/general-plan.mjs";
test("a scanned GD&T frame gives its tolerance, Ⓜ modifiers and datums", () => {
  const datums=datumLetters([{text:"-A-"},{text:"-B-"},{text:"A"}]);
  assert.deepEqual([...datums].sort(),["A","B"]);
  const read=t=>readFrame(t,datums)?.source;
  assert.equal(read("e[g_.005 @[B @JA"),"GD&T Ø.005 Ⓜ | B Ⓜ | A");
  assert.equal(read("6] .005 MAM"),"GD&T .005 Ⓜ | A Ⓜ");
  assert.equal(read(".005@IA®I"),"GD&T .005 Ⓜ | A Ⓜ");
  assert.equal(readFrame("6] .005 MAM",datums).tol,.005);
  for(const t of [".500 ±.010",".005","1.738","250",".030 R"])assert.equal(readFrame(t,datums),null,t);
});

import {readRoughness} from "../public/general-plan.mjs";
test("surface roughness grades are read; other numbers are not", () => {
  assert.deepEqual(readRoughness("250/_",{decimalDrawing:true}),{value:250,unit:"µin"});
  assert.deepEqual(readRoughness("1.6√",{decimalDrawing:false}),{value:1.6,unit:"µm"});
  for(const [t,inch] of [["4",true],[".250",true],["3.2",false],["250",false],["125 ±5",true]])assert.equal(readRoughness(t,{decimalDrawing:inch}),null,t);
});
