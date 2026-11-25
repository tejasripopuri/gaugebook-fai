// Lets a balloon be dragged to a clear spot so it does not cover the drawing's text.
// A short press without movement stays an ordinary click (select the balloon).
export function makeDraggable(pin,paper,onMove){
  let start=null,dragging=false;
  pin.addEventListener("pointerdown",e=>{
    if(e.button!==0)return;
    start={x:e.clientX,y:e.clientY};dragging=false;
    pin.setPointerCapture(e.pointerId);
  });
  pin.addEventListener("pointermove",e=>{
    if(!start)return;
    if(!dragging&&Math.hypot(e.clientX-start.x,e.clientY-start.y)<5)return;
    dragging=true;pin.classList.add("dragging");
    const box=paper.getBoundingClientRect();
    const x=Math.min(1,Math.max(0,(e.clientX-box.left)/box.width)),y=Math.min(1,Math.max(0,(e.clientY-box.top)/box.height));
    pin.style.left=x*100+"%";pin.style.top=y*100+"%";
  });
  const end=e=>{
    if(!start)return;
    start=null;pin.classList.remove("dragging");
    if(!dragging)return;
    // the click that follows a drag must not select or place anything
    const swallow=ev=>{ev.stopImmediatePropagation();ev.preventDefault();};
    pin.addEventListener("click",swallow,{capture:true,once:true});
    setTimeout(()=>pin.removeEventListener("click",swallow,{capture:true}),100);
    onMove(parseFloat(pin.style.left)/100,parseFloat(pin.style.top)/100);
  };
  pin.addEventListener("pointerup",end);
  pin.addEventListener("pointercancel",end);
}
