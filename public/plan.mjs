export const digest = "e9a7086e68552ddb247676ebadc4941522f6cb050c10cfe3c9a2c56ea2c9ce79";
// BASIC dimensions (theoretically exact, ASME Y14.5) have no ± limits of their own: a reading is
// recorded for information and never counts towards pass, fail or pending.
export function judge(row,value) {
  if (row.basic) return "Reference";
  if (row.bounds===null) return ["Pass","Fail"].includes(value)?value:"Pending";
  if (typeof value!=="string" || !/^[+-]?(?:\d+(?:\.\d*)?|\.\d+)$/.test(value.trim())) return "Pending";
  const n=Number(value);
  return n>=row.bounds[0] && n<=row.bounds[1] ? "Pass":"Fail";
}
export function summarize(states) {
  states=states.filter(s=>s!=="Reference");
  return states.includes("Fail")?"Fail":states.length && states.every(s=>s==="Pass")?"Pass":"Not yet inspected";
}

// Stable characteristic IDs keep saved measurements independent of displayed balloon numbers.
export function numberedRows(plan,removed=[]) {
  const numbers=new Map();
  return plan.rows.flatMap(row=>{
    const group=row.groupId??row.id;
    if(removed.includes(group))return [];
    if(!numbers.has(group))numbers.set(group,numbers.size+1);
    return [{...row,group,balloon:numbers.get(group)}];
  });
}
