import test from "node:test";
import assert from "node:assert/strict";
import {readFileSync} from "node:fs";
import {createHash} from "node:crypto";
import {digest,judge,summarize} from "../public/plan.mjs";
import {matchesRaster} from "../public/vision.mjs";
const {rows,references}=JSON.parse(readFileSync(new URL("../public/reviewed-plan.json",import.meta.url)));
test("matching preserves weak JPEG noise and rejects a changed glyph",()=>{
  const a=new Uint8Array(32*32*4).fill(255),b=a.slice();
  b[0]=247;assert.ok(matchesRaster(a,b,32,32));
  for(let i=0;i<4;i++) b[i*4]=0;
  assert.equal(matchesRaster(a,b,32,32),false);
});
const expected=[[5.99,6.01],[3.99,4.01],[.495,.505],[.24,.26],[1.250,1.252],null,[1.745,1.755],[.120,.130],[.025,.035],[44.5,45.5],[0,.003],[.276,.286],null,[0,.010],[.370,.380],[.990,1.010],[.740,.760],[0,.002],null,null,[0,63],[.005,.015],[.005,.015],null,[.11,.13]];
test("reviewed drawing identity and register",()=>{
  const pdf=readFileSync(new URL("../public/sample.pdf",import.meta.url));
  assert.equal(createHash("sha256").update(pdf).digest("hex"),digest);
  assert.deepEqual(rows.map(r=>r.bounds),expected);
  assert.deepEqual(rows.filter(r=>r.repeats.length===4).map(r=>r.id),[4,12,13,14]);
  assert.equal(rows.flatMap(r=>r.repeats).length,37);
  assert.match(references.join(" "),/Y14.5-2018/);
  assert.ok(rows.every(r=>r.crop.length===4));
});
for(const r of rows) test(r.name,()=>{
  assert.equal(judge(r,""),"Pending");
  if(!r.bounds){assert.equal(judge(r,"Fail"),"Fail");assert.equal(judge(r,"Pass"),"Pass");return;}
  const [low,high]=r.bounds;
  for(const n of [low,high]) assert.equal(judge(r,String(n)),"Pass");
  for(const n of [low-.00001,high+.00001]) assert.equal(judge(r,String(n)),"Fail");
  for(const invalid of ["bad","NaN"," ","Infinity"]) assert.equal(judge(r,invalid),"Pending");
});
test("overall status including partial inspection",()=>{
  assert.equal(summarize(["Pass","Pending","Fail"]),"Fail");
  assert.equal(summarize(["Pass","Pending"]),"Not yet inspected");
  assert.equal(summarize([]),"Not yet inspected");
  assert.equal(summarize(Array(37).fill("Pass")),"Pass");
});
