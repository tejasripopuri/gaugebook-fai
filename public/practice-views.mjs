// Locations are in PDF points on the original 792 by 612 practice sheets.
// A plan is selected only for the byte-identical drawing revision.
const specs={
  beebc4317c706a23c5e4ac5cd662df6fb64e9d24a8dfe4894d3eb9c7eae129c9:
    [1002,5,3,.5,[["H",.65,.625],["H",4.35,.625],["H",.65,2.375],["H",4.35,2.375],["B",2.5,1.5]]],
  "174c2a0fd1ff287fb1a67ec4c124d08e629e5a6d4a07f97a31cad0a3c60f8bbf":
    [1003,5.5,2.75,.375,[["S",1.375,1.375],["S",4.125,1.375],["H",2.75,.5],["H",2.75,2.25]]],
  a67164ad5030c5f42e238ea5a52b7a7d679ef6d22c7e854b7efed1444e1ae531:
    [1004,4.5,3.5,.625,[["P",2.25,1.75],["D",.6,1.75],["D",3.9,1.75]]]
};
export function practiceLayout(id){
  if(!Object.hasOwn(specs,id))return null;
  const [num,l,w,t,features]=specs[id],scale=Math.min(330/l,196/w),left=92,right=left+l*scale,top=305-w*scale;
  const rows=[],areas=[[55/792,(top-31)/612,(right+7)/792,307/612],[55/792,(453-t*scale-8)/612,(right+7)/792,485/612]];
  function row(name,source,x,y,bounds=null,count=1,unit=bounds?"in":""){
    rows.push({name,source,xy:[x/792,y/612],bounds:bounds?.map(n=>+n.toFixed(6))??null,count,unit});
  }
  function dim(name,n,tol,x,y,count=1){row(name,n.toFixed(3)+" ±"+tol.toFixed(3),x,y,[n-tol,n+tol],count);}
  dim("Overall length",l,.010,(left+right)/2,top-5);dim("Overall width",w,.010,left+1,(top+305)/2);
  dim("Plate thickness",t,.005,left+9,447);
  row("Bottom face flatness","Flatness .003",left+l*scale*.58,454,[0,.003]);
  const onView=rows.length;
  for(const [i,[code,a,b]] of features.entries()){
    const x=left+a*scale,y=305-b*scale,label=code+" at ("+a.toFixed(3)+", "+b.toFixed(3)+")";
    dim(label+" · X",a,.005,x-11,y-8);dim(label+" · Y",b,.005,x+11,y-8);
    const same=features.filter(f=>f[0]===code);
    if(features.findIndex(f=>f[0]===code)!==i)continue;
    const qty=same.length;
    if(code==="H"||code==="B"){
      dim(code+" bore diameter",code==="H"?.281:.875,code==="H"?.003:.002,x,y+10,qty);
      row(code+" through condition","THRU",x+19,y+12,null,qty);
      if(code==="B"){dim("Counterbore diameter",1.25,.005,x-25,y+11);dim("Counterbore depth",.125,.005,x,y+32);}
    }else if(code==="S"){
      dim("Slot width",.375,.005,x-28,y+9,qty);dim("Slot overall length",1.5,.010,x-7,y+10,qty);
      row("Through slot","THRU",x+15,y+10,null,qty);row("Slot ends and orientation","Full-radius ends; long axis parallel to X.",x+36,y+10,null,qty);
    }else if(code==="P"){
      dim("Pocket length",2.1,.01,x-37,y+10);dim("Pocket width",1.3,.01,x-12,y+10);
      dim("Pocket depth",.25,.005,x+12,y+10);dim("Inside corner radius",.125,.010,x+38,y+10,4);
    }else{
      row("Blind hole diameter","Ø.250 +.002/-.000",x-5,y+14,[.250,.252],qty);
      dim("Full-diameter depth",.375,.005,x+17,y+14,qty);
    }
  }
  row("Material",num===1003?"304 stainless steel plate":"6061-T651 aluminum plate",left+48,444);
  row("Exterior edge break","Break exterior edges .005-.015",right-10,446,[.005,.015]);
  row("Machined face finish","63 µin Ra maximum",left+95,444,[0,63],1,"µin Ra");
  row("Part marking","Mark part number and revision on side face.",right-47,444);
  return {rows:rows.slice(0,onView),supplemental:rows.slice(onView),areas};
}
