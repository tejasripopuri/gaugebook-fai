const angularHeading=/\b(?:ANG(?:ULAR)?|ANGLES?)\b\s*(?:TOL(?:ERANCES?)?\.?)?\s*[:=]?\s*/i;
const angularValue=/^(?:±|\+\s*\/\s*[-−]|\+(?=\s*(?:\d+(?:\.\d+)?|\.\d+)\s*(?:°|deg)))\s*(\d+(?:\.\d+)?|\.\d+)\s*(°|deg(?:rees?)?\b|[′’']|min(?:utes?)?\b)?/i;

export function drawingAngleDefault(lines){
  const values=new Map();
  for(const {text} of lines){
    const heading=text.match(angularHeading);
    if(!heading)continue;
    const tail=text.slice(heading.index+heading[0].length);
    const value=tail.match(angularValue);
    if(!value)continue;
    // A second value or a conditional rule needs human interpretation.
    const rest=tail.slice(value[0].length).trim();
    if(rest&&!/^(?:[.,]?\s*\.X|LINEAR\b)/i.test(rest))return null;
    if(value[2]===undefined && !/TOL|ANGULAR|ANGLES/i.test(text))continue;
    const minutes=/^(?:[′’']|min)/i.test(value[2]||'');
    const delta=Number(value[1])/(minutes?60:1);
    values.set(delta,{delta,label:value[1]+(minutes?'′':'°')});
  }
  return values.size===1?[...values.values()][0]:null;
}

// OCR proposals are editable. Only explicit bilateral and unilateral tolerances get limits.
export function propose(text, angular=null){
  const clean=text.trim().replace(/\s+/g," ");
  if(!clean)return [];
  const num="(?:\\d+(?:\\.\\d*)?|\\.\\d+)";
  const tol=new RegExp("("+num+")\\s*(?:±|\\+\\s*/\\s*-)\\s*("+num+")");
  const unilateral=new RegExp("("+num+")\\s*\\+\\s*("+num+")\\s*/\\s*[-−]\\s*("+num+")");
  const quantity=clean.match(/^(\d+)\s*[xX×]\s*(?=[Ø⌀A-Za-z.\d])/);
  const body=quantity?clean.slice(quantity[0].length):clean;
  const count=quantity?Math.max(1,Math.min(999,Number(quantity[1]))):1;
  const compound=/(?<=[\d°])\s*[Xx×]\s*(?=[Ø⌀.]|\d)|\s+[Xx×]\s+(?=[Ø⌀.]|\d)/g;
  return body.split(compound).map(source=>{
    const angle=source.match(/(\d+(?:\.\d+)?|\.\d+)\s*(?:°|deg(?:rees?)?\b)/i);
    if(angle){
      const after=source.slice(angle.index+angle[0].length).trim();
      const own=after.match(angularValue);
      const prefix=source.slice(0,angle.index);
      const suffix=own?after.slice(own[0].length).trim():after;
      const plain=/^(?:(?:CHAM(?:FER)?|TYP|CSK|C(?:OUNTER)?SINK|INCLUDED|ANGLE)\.?\s*)*$/i;
      const safe=plain.test(prefix.trim())&&plain.test(suffix);
      const minutes=own&&/^(?:[′’']|min)/i.test(own[2]||'');
      const delta=own?Number(own[1])/(minutes?60:1):angular?.delta;
      const nominal=Number(angle[1]);
      if(safe&&delta!=null){
        if(!own)source=source.replace(angle[0],angle[0]+" ±"+angular.label);
        return {source:source.trim(),bounds:[nominal-delta,nominal+delta].map(x=>Number(x.toFixed(10))),count,unit:"°"};
      }
      return {source:source.trim(),bounds:null,count,unit:"°"};
    }
    let bounds=null;
    const u=source.match(unilateral),t=source.match(tol);
    if(u)bounds=[Number(u[1])-Number(u[3]),Number(u[1])+Number(u[2])];
    else if(t)bounds=[Number(t[1])-Number(t[2]),Number(t[1])+Number(t[2])];
    return {source:source.trim(),bounds:bounds?.map(x=>Number(x.toFixed(10)))??null,count};
  });
}

// Image OCR (not PDF text) commonly misreads "±" as "+" and "Ø" as "@". A one-sided tolerance
// always keeps its "/-" part, so a lone "+tolerance" after a value is read as "±". Other
// misreadings (e.g. "Ø" as the digit 9) are left alone: guessing would invent numbers.
// Scanned text often reads a "1" as I, l or | and splits numbers with spaces ("I .550", ". I 25",
// "2.53 I"). A run made only of digits, those look-alikes, dots and single spaces is rejoined when the
// result is a decimal number; anything else (words such as "DIA" or "BRK") is left alone.
export function repairScanNumbers(text){
  return text.replace(/(?<![A-Za-z0-9])[0-9Il|.](?: ?[0-9Il|.])*(?![A-Za-z0-9])/g,run=>{
    const joined=run.replace(/ /g,"").replace(/[Il|]/g,"1");
    const lookalikes=(run.match(/[Il|]/g)||[]).length;
    return /\d/.test(run.replace(/[Il|]/g,""))&&lookalikes<=2&&/^\d*\.\d{2,5}$/.test(joined)?joined:run;
  });
}
// Leader and arrow stubs read at the ends of a callout ("<= .370", ".225 —<——|", "�-- . 225 ___,") are not text.
export function cleanReading(text){
  return String(text).replace(/\uFFFD/g," ").trim()
    .replace(/^[^\w.Ø⌀±+\-−(#]+/,"").replace(/[^\w.°)]+$/,"")
    .replace(/^[-—–_=<>|]{2,}\s*/,"").replace(/\s*[-—–_=<>|,]{2,}$/,"").trim();
}
export function repairOcrText(text){
  const num="(?:\\d+(?:\\.\\d*)?|\\.\\d+)";
  text=repairScanNumbers(text);
  return text
    .replace(/@\s*(?=[.\d])/g,"Ø")
    // tolerance: a decimal number (".005", "0.1") or whole degrees ("1°"), read completely
    .replace(new RegExp("("+num+"(?:\\s*°)?)\\s*\\+\\s*((?:\\d*\\.\\d+|\\d+(?=\\s*°))(?![\\d.])(?:\\s*°)?)(?!\\s*(?:/\\s*)?[-−]\\s*[.\\d])","g"),(match,value,tol,at,all)=>{
      // Skip readings that also lost a decimal point (".500" read as "500") or sit against
      // stray characters ("O1343", "{1.0"): no limits beats wrong limits.
      const plausible=/[.°]/.test(value)&&(at===0||/[\sØR(]/.test(all[at-1]));
      return plausible&&parseFloat(tol)>0?value+" ±"+tol:match;
    });
}

// Title-block general tolerances by decimal places, e.g. ".XX ±.01  .XXX ±.005" (inch) or
// "X.X ±0.1  X.XX ±0.05" / "X ±0.5" (metric). Returns Map(decimals -> {tol,label}).
// Also accepts the forms image OCR produces from a title block: "-XX +.01" or "XXX +.005"
// (± read as +, the decimal point read as "-" or lost). Two or more X's always mean decimals.
const generalPattern=/(?<![\w.])(X?)([.,-]?)(X{0,4})\s*[:=]?\s*(?:±|\+(?!\s*\/))\s*(\d*\.?\d+)/g;
function generalRule(m){
  const xs=m[1]+m[3];
  if(!xs)return null;
  const decimals=m[2]?m[3].length:xs.length>1?xs.length:0;
  if(m[2]&&!m[3])return null;
  const tol=Number(m[4]);
  if(!(tol>0))return null;
  const label=decimals?(m[2]&&m[1]?"X":"")+"."+"X".repeat(decimals):"X";
  return {decimals,tol,tolText:m[4],label:label+" ±"+m[4]};
}
export function drawingLinearDefaults(lines){
  const defaults=new Map();
  for(const {text} of lines)for(const m of text.matchAll(generalPattern)){
    const rule=generalRule(m);
    if(rule)defaults.set(rule.decimals,{tol:rule.tol,tolText:rule.tolText,label:rule.label});
  }
  return defaults;
}
export const definesGeneralTolerance=text=>[...text.matchAll(generalPattern)].some(m=>generalRule(m));

// A plain dimension printed without its own tolerance takes the title-block tolerance for its
// number of decimal places. Basic and reference dimensions never do (see dimensionKind). Reference dimensions (REF or in brackets) are not inspected and stay as they are.
export function withGeneralTolerance(proposal,defaults){
  if(proposal.bounds||proposal.unit==="°"||!defaults?.size)return proposal;
  const source=proposal.source.trim();
  if(/\bREF\b|^\(.*\)$/i.test(source))return proposal;
  if(dimensionKind(source))return proposal; // basic or reference: the dimension only
  const m=source.match(plainDimension);
  if(!m)return proposal;
  const rule=defaults.get((m[2]??m[3]??"").length);
  if(!rule)return proposal;
  const nominal=Number(m[1]);
  // "2.000" -> "2.000 ±.005": the tolerance is written in, and its origin kept in generalTolerance.
  const at=source.indexOf(m[1]);
  const written=source.slice(0,at+m[1].length)+" ±"+(rule.tolText??String(rule.tol))+source.slice(at+m[1].length);
  return {...proposal,source:written,generalTolerance:rule.label,
    bounds:[nominal-rule.tol,nominal+rule.tol].map(x=>Number(x.toFixed(10)))};
}

// A number printed as a dimension, optionally with a count ("4X"), Ø/R and THRU/TYP/DP.
const plainDimension=/^(?:\d+\s*[xX×]\s*)?(?:[Ø⌀]|R)?\s*(\d+(?:\.(\d*))?|\.(\d+))(?:\s+(?:THRU|TYP|DP|DEEP))*$/i;
const numberIn=s=>{const m=s.match(/(\d+(?:\.\d*)?|\.\d+)/);return m?Number(m[1]):null;};

// Which untoleranced dimensions must NOT take the title-block tolerance:
//  "reference": in parentheses "(2.000)" or marked REF
//  "basic":     marked BSC/BASIC, drawn in a box, or listed in a note that calls them basic
// Returns null for an ordinary dimension. ctx: {boxed: ()=>bool, basicValues: Set<number>}
export function dimensionKind(source,ctx={}){
  const s=String(source).trim();
  if(/^\(\s*(?:\d+\s*[xX×]\s*)?(?:[Ø⌀]|R)?\s*(?:\d+(?:\.\d*)?|\.\d+)\s*\)$/.test(s)||/^[^±]*\d[^±]*\bREF\b/i.test(s))return "reference";
  if(/^[^±]*\d[^±]*\b(?:BSC|BASIC)\b/i.test(s))return "basic";
  if(/^\[\s*(?:[Ø⌀]|R)?\s*(?:\d+(?:\.\d*)?|\.\d+)\s*\]$/.test(s))return "basic (boxed)"; // OCR reads a box as [ ]
  if(!plainDimension.test(s))return null;
  if(ctx.basicValues?.has(numberIn(s)))return "basic (note)";
  if(ctx.boxed?.())return "basic (boxed)";
  return null;
}

// Values a drawing note declares basic, e.g. "5. DIMENSIONS 3.000, 2.000, 5.000 AND 3.000 LOCATING
// HOLES AND BORE ARE BASIC." Notes may wrap over several lines; each numbered note is read whole.
export function basicValuesFromNotes(lines){
  const text=lines.map(l=>l.text).join(" ").replace(/\s+/g," ");
  const values=new Set();
  for(const note of text.split(/\s(?=\d{1,2}\.\s+[A-Z])/)){
    const at=note.search(/\bBASIC\b/i);
    if(at<0||!/\bDIMENSIONS?\b/i.test(note))continue;
    // the note ends with the sentence that says BASIC (a full stop not followed by a digit)
    const end=note.slice(at).search(/\.(?!\d)/);
    const sentence=note.slice(0,end<0?note.length:at+end).replace(/^\d{1,2}\.\s+/,"");
    if(sentence.length>300)continue;
    for(const m of sentence.matchAll(/(?<![\d.])(\d*\.\d+)(?![\d.])/g))values.add(Number(m[1]));
  }
  return values;
}
