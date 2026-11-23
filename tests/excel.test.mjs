import test from "node:test";
import assert from "node:assert/strict";
import {readFileSync} from "node:fs";
import JSZip from "../public/vendor/jszip.min.js";
import {makeWorkbook} from "../public/report-excel.mjs";
import {initialReport} from "../public/report-data.mjs";
test("Excel exports linked identifiers, extra materials and a failed bore reading",async()=>{
 const report=initialReport();report.part["FAIR identifier"]="FAI-23";report.tests.Comments="A & B";
 while(report.products.length<12)report.products.push(["Extra process"]);
 const plan=JSON.parse(readFileSync(new URL("../public/reviewed-plan.json",import.meta.url)));
 const bytes=await makeWorkbook(readFileSync(new URL("../public/fai-forms.xlsx",import.meta.url)),report,plan,{answers:{"5-0":"1.249"}},JSZip);
 const zip=await JSZip.loadAsync(bytes),sheet=n=>zip.file("xl/worksheets/sheet"+n+".xml").async("string");
 assert.match(await sheet(1),/<x:v>Fail<\/x:v>/);
 assert.match(await sheet(2),/r="A24"[^>]*>[\s\S]*?A &amp; B/);
 assert.match(await sheet(2),/<x:row r="18"[^>]*><x:c r="A18"[^>]*><x:is><x:t[^>]*>Extra process/);
 assert.match(await sheet(3),/<x:v>1.249<\/x:v>/);assert.match(await sheet(3),/<x:v>FAI-23<\/x:v>/);
});
