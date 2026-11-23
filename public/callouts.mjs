// OCR proposals are editable. Only explicit bilateral and unilateral tolerances get limits.
export function propose(text){
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
    let bounds=null;
    const u=source.match(unilateral),t=source.match(tol);
    if(u)bounds=[Number(u[1])-Number(u[3]),Number(u[1])+Number(u[2])];
    else if(t)bounds=[Number(t[1])-Number(t[2]),Number(t[1])+Number(t[2])];
    return {source:source.trim(),bounds:bounds?.map(x=>Number(x.toFixed(10)))??null,count};
  });
}
