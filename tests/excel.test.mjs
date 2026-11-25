import test from "node:test";
import assert from "node:assert/strict";
import {readFileSync} from "node:fs";
import JSZip from "../public/vendor/jszip.min.js";
import {makeWorkbook} from "../public/report-excel.mjs";
import {initialReport} from "../public/report-data.mjs";

const plan=JSON.parse(readFileSync(new URL("../public/reviewed-plan.json",import.meta.url)));
async function build(report,answers){
  const zip=await JSZip.loadAsync(await makeWorkbook(null,report,plan,{answers},JSZip));
  return {zip,sheet:n=>zip.file("xl/worksheets/sheet"+n+".xml").async("string")};
}
const cell=(xml,ref)=>xml.match(new RegExp('<c r="'+ref+'"[^>]*?(?:/>|>([\\s\\S]*?)</c>)'));
const text=(xml,ref)=>(cell(xml,ref)?.[1]||"").replace(/<[^>]+>/g,"").replace(/&amp;/g,"&");

test("Excel exports linked identifiers, extra materials and a failed bore reading",async()=>{
  const report=initialReport();report.part["FAIR identifier"]="FAI-23";report.tests.Comments="A & B";
  while(report.products.length<12)report.products.push(["Extra process"]);
  const {zip,sheet}=await build(report,{"5-0":"1.249"});
  const [f1,f2,f3]=await Promise.all([1,2,3].map(sheet));
  assert.ok(zip.file("xl/styles.xml")&&zip.file("[Content_Types].xml")&&zip.file("xl/workbook.xml"));
  assert.match(f1,/>Fail</);                                     // Form 1 inspection status
  assert.match(f2,/A &amp; B/);
  assert.equal((f2.match(/>Extra process</g)||[]).length,10);     // every extra material row is kept
  assert.match(f3,/>1\.249</);                                    // field 9: the reading only
  assert.doesNotMatch(f3,/ · (Pass|Fail)/);
  assert.match(f3,/FAI-23/);
});
test("Form 3 is strictly AS9102 fields 5-12 with coloured results and a frozen header",async()=>{
  const {sheet}=await build(initialReport(),{"1-0":"6.004","2-0":"4.020"});
  const f3=await sheet(3),styles=await (await JSZip.loadAsync(await makeWorkbook(null,initialReport(),plan,{answers:{}},JSZip))).file("xl/styles.xml").async("string");
  const header=f3.match(/<row r="(\d+)"[^>]*>(?:(?!<\/row>)[\s\S])*5\. Char\. no\.[\s\S]*?<\/row>/);
  const labels=[...header[0].matchAll(/<t[^>]*>([^<]*)<\/t>/g)].map(m=>m[1]);
  assert.deepEqual(labels.map(l=>l.split(".")[0]),["5","6","7","8","9","10","11","12"]);
  assert.match(f3,/<pane ySplit="\d+"[^>]*state="frozen"/);
  const style=v=>Number(f3.match(new RegExp('<c r="E\\d+" s="(\\d+)"[^>]*><is><t[^>]*>'+v.replace(/[.]/g,"\\.")+"<"))?.[1]);
  assert.notEqual(style("6.004"),style("4.020"));                  // green vs red cell, value only
  assert.match(styles,/FFDFF3E5/);assert.match(styles,/FFFFDFDC/);  // green and red fills exist
  assert.doesNotMatch(f3,/THRU Pending/);
  assert.match(f3,/Through hole: Pending/);
});

test("Forms 1 and 2 leave blank rows for hand-written entries",async()=>{
  const {sheet}=await build(initialReport(),{});
  const [f1,f2]=await Promise.all([1,2].map(sheet));
  const rowsBetween=(xml,from,to)=>{
    const a=Number(xml.match(new RegExp('<row r="(\\d+)"[^>]*>(?:(?!</row>)[\\s\\S])*'+from))[1]);
    const b=Number(xml.match(new RegExp('<row r="(\\d+)"[^>]*>(?:(?!</row>)[\\s\\S])*'+to))[1]);
    return b-a-1;
  };
  assert.equal(rowsBetween(f1,"15\\. Part number","19\\. Does the FAIR"),30);          // assembly index rows
  assert.equal(rowsBetween(f2,"5\\. Material or process","11\\. Functional test"),15);    // material / process rows
  assert.equal(rowsBetween(f2,"11\\. Functional test","13\\. Comments"),5);               // test procedure / report rows
  assert.match(f2,/6061-T651 aluminum plate/);                                         // filled rows come first
});
