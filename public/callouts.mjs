const angularHeading=/\b(?:ANG(?:ULAR)?|ANGLES?)\b\s*(?:TOL(?:ERANCES?)?\.?)?\s*[:=]?\s*/i;
const angularValue=/^(?:±|\+\s*\/\s*[-−])\s*(\d+(?:\.\d+)?|\.\d+)\s*(°|deg(?:rees?)?\b|[′’']|min(?:utes?)?\b)?/i;

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
export function repairOcrText(text){
  const num="(?:\\d+(?:\\.\\d*)?|\\.\\d+)";
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
