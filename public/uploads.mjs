// Store source files by content so a renamed drawing reopens the same inspection.
export async function drawingFile(id,file) {
  const db=await new Promise((resolve,reject)=>{
    const open=indexedDB.open("gaugebook-drawings",1);
    open.onupgradeneeded=()=>open.result.createObjectStore("files");
    open.onsuccess=()=>resolve(open.result);
    open.onerror=()=>reject(open.error);
  });
  try{return await new Promise((resolve,reject)=>{
    const tx=db.transaction("files",file?"readwrite":"readonly"),store=tx.objectStore("files");
    const request=file?store.put(file,id):store.get(id);
    tx.oncomplete=()=>resolve(request.result);
    tx.onabort=()=>reject(tx.error);
  });}finally{db.close();}
}
export async function openUpload(file){
  const bytes=new Uint8Array(await crypto.subtle.digest("SHA-256",await file.arrayBuffer()));
  const id=Array.from(bytes,n=>n.toString(16).padStart(2,"0")).join("");
  await drawingFile(id,file);
  location.assign("review.html?drawing="+id);
}
