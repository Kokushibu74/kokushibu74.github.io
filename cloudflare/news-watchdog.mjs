const API_ROOT="https://api.github.com/repos/Kokushibu74/kokushibu74.github.io/actions/workflows/update-news.yml";
const ACCEPTED_STATUSES=new Set([200,204]);
const RETRYABLE_STATUSES=new Set([408,429]);

function safeDetail(value){
  return String(value||"").replace(/[\\r\\n\\t]+/g," ").slice(0,180);
}

export async function dispatchNewsWorkflow(token,{fetchImpl=fetch,wait=(ms)=>new Promise(resolve=>setTimeout(resolve,ms)),now=()=>Date.now()}={}){
  if(!token)throw new Error("GitHub workflow dispatch is not configured.");
  const headers={Accept:"application/vnd.github+json","User-Agent":"Kokushibu74-Portfolio-MiniApp","X-GitHub-Api-Version":"2022-11-28",Authorization:"Bearer "+token,"Content-Type":"application/json"};
  const dispatchUrl=API_ROOT+"/dispatches";
  const runsUrl=API_ROOT+"/runs?event=workflow_dispatch&branch=main&per_page=10";
  const startedAt=now();
  let lastStatus=0,lastDetail="";
  for(let attempt=1;attempt<=3;attempt++){
    let response;
    try{
      response=await fetchImpl(dispatchUrl,{method:"POST",headers,body:JSON.stringify({ref:"main"}),signal:AbortSignal.timeout(15000)});
    }catch(error){
      lastStatus=0;lastDetail=safeDetail(error?.message||error);
      if(attempt<3){await wait(500*attempt);continue;}
      throw new Error("GitHub workflow dispatch network failure after "+attempt+" attempts: "+lastDetail);
    }
    if(ACCEPTED_STATUSES.has(response.status))return {accepted:true,attempts:attempt,verified:false};
    lastStatus=response.status;
    const responseText=await response.text().catch(()=> "");
    let detail=responseText;
    try{const payload=JSON.parse(responseText);detail=payload.message||(payload.errors||[]).map(x=>x.message||x.code).join("; ")||responseText}catch{}
    lastDetail=safeDetail(detail||response.statusText);
    const retryable=RETRYABLE_STATUSES.has(response.status)||response.status>=500;
    if(!retryable){
      const error=new Error("GitHub news workflow dispatch failed (HTTP "+response.status+")"+(lastDetail?": "+lastDetail:""));
      error.status=response.status;
      throw error;
    }
    await wait(500*attempt);
    try{
      const verification=await fetchImpl(runsUrl,{headers,signal:AbortSignal.timeout(10000)});
      if(verification.ok){
        const payload=await verification.json().catch(()=>({}));
        const recent=(payload.workflow_runs||[]).find(run=>run?.event==="workflow_dispatch"&&run?.head_branch==="main"&&Date.parse(run?.created_at||"")>=startedAt-10000);
        if(recent)return {accepted:true,attempts:attempt,verified:true,runId:recent.id};
      }
    }catch{}
    if(attempt<3)await wait(500*attempt);
  }
  const error=new Error("GitHub workflow dispatch temporarily failed (HTTP "+(lastStatus||"network")+") after 3 attempts"+(lastDetail?": "+lastDetail:""));
  error.status=lastStatus;
  throw error;
}
