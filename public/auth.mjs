const $=id=>document.getElementById(id);
let signup=location.hash==="#signup";
const next=new URLSearchParams(location.search).get("next");
const safeNext=next&&/^[\w.\-]+\.html(\?[\w=&%.\-]*)?$/.test(next)?next:"index.html";
function mode(){
  $("title").textContent=signup?"Create your account":"Sign in";
  $("submit").textContent=signup?"Create account":"Sign in";
  $("nameRow").hidden=!signup;
  $("password").autocomplete=signup?"new-password":"current-password";
  $("password").placeholder=signup?"At least 10 characters":"";
  $("prompt").textContent=signup?"Already have an account?":"New to Gaugebook?";
  $("toggle").textContent=signup?"Sign in":"Create an account";
  $("err").textContent="";
}
$("toggle").onclick=()=>{signup=!signup;mode();(signup?$("name"):$("email")).focus();};
$("form").onsubmit=async e=>{
  e.preventDefault();$("err").textContent="";$("submit").disabled=true;
  try{
    const res=await fetch("api/auth/"+(signup?"signup":"login"),{method:"POST",headers:{"content-type":"application/json"},
      body:JSON.stringify({name:$("name").value,email:$("email").value,password:$("password").value})});
    const data=await res.json().catch(()=>({}));
    if(!res.ok)throw new Error(data.error||"Could not sign in. Please try again.");
    // A different person used this browser before: remove their local copy first.
    let owner=null;try{owner=JSON.parse(localStorage.getItem("gb-sync-owner")||"null");}catch{}
    if(owner&&owner.id!==data.user?.id){
      for(const k of Object.keys(localStorage))if(k.startsWith("gaugebook-")||k.startsWith("gb-sync-"))localStorage.removeItem(k);
      try{indexedDB.deleteDatabase("gaugebook-drawings");}catch{}
    }
    location.replace(safeNext);
  }catch(err){$("err").textContent=err.message==="Failed to fetch"?"Can't reach the server. Check your connection.":err.message;}
  finally{$("submit").disabled=false;}
};
mode();
fetch("api/auth/me").then(r=>{if(r.ok)location.replace(safeNext);}).catch(()=>{});
