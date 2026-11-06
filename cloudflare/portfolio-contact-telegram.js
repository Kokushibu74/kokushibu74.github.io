import { evaluateNewsAlert, newsAlertKey, escapeHtml, mediaCandidates, deliverWithMediaFallback, parseOfficialDisasterSignal, isWeatherCandidate, formatAlertMessage, extractAlertLocation } from "./news-alerts.mjs";
import { dispatchNewsWorkflow } from "./news-watchdog.mjs";

// Shared namespace prefix for User Manager profiles and event history.
const UM_PREFIX = "um:v1:";


const CF_MONITOR_ACCOUNT_ID = "2eb330a662bfe3c78e68f3ba517aef54";
const CF_MONITOR_KV_NAMESPACES = [
  { id: "370c7ef8d3bd4c678243a2bd2a9c6f8c", label: "Bot config" },
  { id: "431208d4ca2646829178a9dd05f93c2f", label: "Remote bridge state" },
  { id: "474c184970634e54bdf6d9a4cd6632a0", label: "Sports Zone backups" },
  { id: "714fabb0634744ee9ee921c02f679f9f", label: "Sports Zone preview" },
  { id: "a6cf1ebc4c2e499ca69fa88c10937317", label: "Sports Zone production" },
  { id: "f3333aa713ed4d258ada3b24b6bf2981", label: "Visitor intelligence" }
];
const CF_MONITOR_D1_ID = "93f7c8c5-dc3a-4b42-82f4-22d8263884c4";
async function cfMonitorRequest(env,path,body) {
  if (!env.CLOUDFLARE_API_TOKEN) throw new Error("CLOUDFLARE_API_TOKEN secret is unavailable");
  const response = await fetch("https://api.cloudflare.com/client/v4" + path, {
    method:"POST",
    headers:{Authorization:"Bearer "+env.CLOUDFLARE_API_TOKEN,"Content-Type":"application/json"},
    body:JSON.stringify(body),signal:AbortSignal.timeout(20000)
  });
  const data = await response.json().catch(() => ({}));
  if (!response.ok || data.success === false) {
    const detail=(data.errors||[]).map(x=>x.message||x.code).join("; ")||("HTTP "+response.status);
    throw new Error("Cloudflare API request failed: "+detail.slice(0,220));
  }
  return data.result ?? data;
}
async function cfMonitorGraphQL(env,query,variables) {
  const data=await cfMonitorRequest(env,"/graphql",{query,variables});
  if(Array.isArray(data.errors)&&data.errors.length)throw new Error("Cloudflare Analytics GraphQL: "+data.errors.map(x=>x.message).join("; ").slice(0,220));
  return data.data||data;
}
function cfMonitorNumber(value){const n=Number(value);return Number.isFinite(n)?n:0;}
function cfMonitorMax(rows,path){return (rows||[]).reduce((max,row)=>Math.max(max,cfMonitorNumber(row?.max?.[path])),0);}
function cfMonitorAction(rows,action,date=null){return (rows||[]).reduce((total,row)=>total+(String(row?.dimensions?.actionType||"").toLowerCase()===action&&(!date||String(row?.dimensions?.date||"").slice(0,10)===date)?cfMonitorNumber(row?.sum?.requests):0),0);}
async function cfResourceBudgetCheck(env,sendTelegram,now=new Date()) {
  if(!env.BOT_CONFIG_KV)throw new Error("BOT_CONFIG_KV binding is unavailable");
  const day=now.toISOString().slice(0,10),month=day.slice(0,7),monthStart=month+"-01",
    storageStart=new Date(now.getTime()-6*86400000).toISOString().slice(0,10);
  const groups=[];
  for(let start=0;start<CF_MONITOR_KV_NAMESPACES.length;start+=3){
    const batch=CF_MONITOR_KV_NAMESPACES.slice(start,start+3);
    const fields=batch.flatMap((namespace,offset)=>{
      const index=start+offset;
      return [
        "  kvOps"+index+": kvOperationsAdaptiveGroups(limit: 1000, filter: { namespaceId: \""+namespace.id+"\", date_geq: $start, date_leq: $end }) { sum { requests } dimensions { actionType date } }",
        "  kvStorage"+index+": kvStorageAdaptiveGroups(limit: 1000, filter: { namespaceId: \""+namespace.id+"\", date_geq: $storageStart, date_leq: $end }) { max { byteCount keyCount } dimensions { date } }"
      ];
    });
    const query=[
      "query ShihabKVBatch"+start+"($accountTag: string!, $start: Date, $end: Date, $storageStart: Date) {",
      " viewer { accounts(filter: { accountTag: $accountTag }) {",
      ...fields,
      " } }",
      "}"
    ].join("\n");
    groups.push({start,query});
  }
  const workersQuery=[
    "query ShihabWorkersBudget($accountTag: string!, $startTime: Time!, $aiStartTime: Time!, $endTime: Time!) {",
    " viewer { accounts(filter: { accountTag: $accountTag }) {",
    "  workersInvocationsAdaptive(limit: 1000, filter: { datetime_geq: $startTime, datetime_leq: $endTime }) { sum { requests errors cpuTimeUs } }",
    "  aiInferenceAdaptiveGroups(limit: 1000, filter: { datetime_geq: $aiStartTime, datetime_leq: $endTime }) { sum { totalNeurons } }",
    " } }",
    "}"
  ].join("\n");
  const d1Query=[
    "query ShihabD1Budget($accountTag: string!, $start: Date, $end: Date, $storageStart: Date) {",
    " viewer { accounts(filter: { accountTag: $accountTag }) {",
    "  d1Usage: d1AnalyticsAdaptiveGroups(limit: 1000, filter: { databaseId: \""+CF_MONITOR_D1_ID+"\", date_geq: $start, date_leq: $end }) { sum { rowsRead rowsWritten } dimensions { date databaseId } }",
    "  d1Storage: d1StorageAdaptiveGroups(limit: 1000, filter: { databaseId: \""+CF_MONITOR_D1_ID+"\", date_geq: $storageStart, date_leq: $end }) { max { databaseSizeBytes } dimensions { date databaseId } }",
    " } }",
    "}"
  ].join("\n");
  const variables={accountTag:CF_MONITOR_ACCOUNT_ID,start:monthStart,end:day,storageStart,
    startTime:monthStart+"T00:00:00Z",aiStartTime:day+"T00:00:00Z",endTime:now.toISOString()};
  // Small parallel requests keep monthly analytics within the Worker API timeout.
  const [workerData,d1Data,...kvData]=await Promise.all([
    cfMonitorGraphQL(env,workersQuery,{accountTag:CF_MONITOR_ACCOUNT_ID,startTime:variables.startTime,aiStartTime:variables.aiStartTime,endTime:variables.endTime}),
    cfMonitorGraphQL(env,d1Query,{accountTag:CF_MONITOR_ACCOUNT_ID,start:monthStart,end:day,storageStart}),
    ...groups.map(group=>cfMonitorGraphQL(env,group.query,{accountTag:CF_MONITOR_ACCOUNT_ID,start:monthStart,end:day,storageStart}))
  ]);
  const accountOf=data=>data?.viewer?.accounts?.[0];
  const workerAccount=accountOf(workerData),d1Account=accountOf(d1Data);
  if(!workerAccount||!d1Account)throw new Error("Cloudflare Analytics returned incomplete Workers or D1 account data");
  const kvAccounts=kvData.map(accountOf);
  if(kvAccounts.some(account=>!account))throw new Error("Cloudflare Analytics returned incomplete KV account data");
  const workerRows=workerAccount.workersInvocationsAdaptive||[];
  const workers=workerRows.reduce((sum,row)=>sum+cfMonitorNumber(row?.sum?.requests),0);
  const workersCpuMs=workerRows.reduce((sum,row)=>sum+cfMonitorNumber(row?.sum?.cpuTimeUs),0)/1000;
  const aiNeurons=(workerAccount.aiInferenceAdaptiveGroups||[]).reduce((sum,row)=>sum+cfMonitorNumber(row?.sum?.totalNeurons),0);
  const kvOpsRows=[],kvStorageRows=[];
  for(let batch=0;batch<groups.length;batch++){
    const start=groups[batch].start,account=kvAccounts[batch];
    for(let offset=0;offset<3&&start+offset<CF_MONITOR_KV_NAMESPACES.length;offset++){
      kvOpsRows.push(account["kvOps"+(start+offset)]||[]);
      kvStorageRows.push(account["kvStorage"+(start+offset)]||[]);
    }
  }
  const kvAction=(action,date=null)=>kvOpsRows.reduce((sum,rows)=>sum+cfMonitorAction(rows,action,date),0);
  const d1Usage=d1Account.d1Usage||[];
  const d1RowsRead=d1Usage.reduce((sum,row)=>sum+cfMonitorNumber(row?.sum?.rowsRead),0);
  const d1RowsWritten=d1Usage.reduce((sum,row)=>sum+cfMonitorNumber(row?.sum?.rowsWritten),0);
  const kvBytes=kvStorageRows.reduce((sum,rows)=>sum+cfMonitorMax(rows,"byteCount"),0);
  const d1Bytes=cfMonitorMax(d1Account.d1Storage||[],"databaseSizeBytes");
  const metrics=[
    {key:"workers_requests",label:"Workers requests (account-wide, monthly)",used:workers,limit:10000000,unit:"requests",period:"monthly"},
    {key:"workers_cpu_ms",label:"Workers CPU time (account-wide, monthly)",used:workersCpuMs,limit:30000000,unit:"ms",period:"monthly"},
    {key:"workers_ai_neurons",label:"Workers AI neurons (daily free allocation, sampled estimate)",used:aiNeurons,limit:10000,unit:"neurons",period:"daily"},
    {key:"kv_reads",label:"KV reads (all 6 namespaces, daily Free allowance)",used:kvAction("read",day),limit:100000,unit:"operations",period:"daily"},
    {key:"kv_writes",label:"KV writes (all 6 namespaces, daily Free allowance)",used:kvAction("write",day),limit:1000,unit:"operations",period:"daily"},
    {key:"kv_deletes",label:"KV deletes (all 6 namespaces, daily Free allowance)",used:kvAction("delete",day),limit:1000,unit:"operations",period:"daily"},
    {key:"kv_lists",label:"KV list operations (all 6 namespaces, daily Free allowance)",used:kvAction("list",day),limit:1000,unit:"operations",period:"daily"},
    {key:"kv_storage",label:"KV storage (all 6 namespaces)",used:kvBytes,limit:1073741824,unit:"bytes",period:"storage"},
    {key:"d1_rows_read",label:"D1 rows read (monthly)",used:d1RowsRead,limit:25000000000,unit:"rows",period:"monthly"},
    {key:"d1_rows_written",label:"D1 rows written (monthly)",used:d1RowsWritten,limit:50000000,unit:"rows",period:"monthly"},
    {key:"d1_storage",label:"D1 storage (account included allowance)",used:d1Bytes,limit:5368709120,unit:"bytes",period:"storage"}
  ];
  const thresholds=[50,70,85,95],pending=[];
  for(const metric of metrics){
    const pct=metric.limit>0?metric.used/metric.limit*100:0;
    const periodKey=metric.period==="monthly"?month:metric.period==="daily"?day:"storage";
    const stateKey="resource-alert:v3:"+periodKey+":"+metric.key;
    let sent=[];
    try{const old=await env.BOT_CONFIG_KV.get(stateKey,"json");if(Array.isArray(old))sent=old.filter(Number.isFinite)}catch{}
    if(metric.period==="storage"&&pct<50)sent=[];
    const crossed=thresholds.filter(level=>pct>=level&&!sent.includes(level));
    if(crossed.length)pending.push({metric,pct,crossed,stateKey,sent});
    else if(metric.period==="storage"&&pct<50&&sent.length===0){try{await env.BOT_CONFIG_KV.put(stateKey,"[]",{expirationTtl:365*86400})}catch{}}
  }
  if(pending.length&&typeof sendTelegram==="function"){
    const highestPct=Math.max(...pending.map(item=>item.pct));
    const severity=highestPct>=95?{icon:"🚨",label:"CRITICAL"}:highestPct>=85?{icon:"🔴",label:"HIGH"}:highestPct>=70?{icon:"🟠",label:"ELEVATED"}:{icon:"⚠️",label:"WARNING"};
    const progressBar=pct=>{const filled=Math.max(0,Math.min(10,Math.round(pct/10)));return "█".repeat(filled)+"░".repeat(10-filled);};
    const formatResource=value=>Number(value).toLocaleString("en-US");
    const lines=[
      severity.icon+" <b>CLOUDFLARE RESOURCE ALERT</b>",
      "<b>"+severity.label+" · "+Math.round(highestPct)+"% usage</b>",
      "🕒 Checked: "+now.toLocaleString("en-GB",{timeZone:"Asia/Dhaka",dateStyle:"medium",timeStyle:"short"})+" BDT",
      "📅 Billing month: "+month+" UTC",
      "🗃️ KV daily allowance resets at 00:00 UTC.",
      "🤖 Workers AI allocation day: "+day+" UTC",
      "ℹ️ Usage is a Cloudflare Analytics estimate, not a billing statement.",
      ""
    ];
    for(const item of pending){
      const m=item.metric,percent=Math.round(item.pct);
      const used=m.unit==="bytes"?(m.used/1073741824).toFixed(3)+" GiB":formatResource(Math.round(m.used))+" "+m.unit;
      const limit=m.unit==="bytes"?(m.limit/1073741824).toFixed(3)+" GiB":formatResource(m.limit)+" "+m.unit;
      const remaining=Math.max(0,m.limit-m.used);
      const remainingText=m.unit==="bytes"?(remaining/1073741824).toFixed(3)+" GiB":formatResource(Math.floor(remaining))+" "+m.unit;
      const itemSeverity=item.pct>=95?"🚨":item.pct>=85?"🔴":item.pct>=70?"🟠":"⚠️";
      const periodLabel=m.period==="monthly"?month+" UTC":m.period==="daily"?day+" UTC":"current storage snapshot";
      lines.push(
        itemSeverity+" <b>"+m.label+"</b>",
        "<code>"+progressBar(item.pct)+"</code> <b>"+percent+"%</b>",
        "📆 Period: "+periodLabel,
        "📊 Usage: "+used+" / "+limit,
        "🎯 Threshold reached: "+item.crossed.join("% · ")+"%",
        remaining>0?"🟢 Remaining: "+remainingText:"🔴 Allowance reached or exceeded"+(m.used>m.limit?" by "+(m.unit==="bytes"?((m.used-m.limit)/1073741824).toFixed(3)+" GiB":formatResource(Math.floor(m.used-m.limit))+" "+m.unit):"")
      );
      if(m.label.includes("all 6 namespaces"))lines.push("📦 Scope: 6 KV namespaces");
      lines.push("");
    }
    lines.push("<i>AUTOMATED MONITOR · CLOUDFLARE RESOURCE BUDGET</i>");
    await sendTelegram(lines.join("\n"));
    for(const item of pending){
      const ttl=item.metric.period==="daily"?48*3600:item.metric.period==="monthly"?45*86400:365*86400;
      try{await env.BOT_CONFIG_KV.put(item.stateKey,JSON.stringify([...new Set([...item.sent,...item.crossed])]),{expirationTtl:ttl})}
      catch(e){console.error("Cloudflare resource alert state save failed:",String(e&&e.message||e).slice(0,120));}
    }
  }
  return {day,month,metrics:metrics.map(m=>({key:m.key,label:m.label,unit:m.unit,used:m.used,limit:m.limit,percent:Math.round(m.used/m.limit*100),period:m.period})),alerts:pending.length};
}
async function cfHistoricalExceptionAudit(env,sendTelegram) {
  if(!env.BOT_CONFIG_KV)throw new Error("BOT_CONFIG_KV binding is unavailable");
  const stateKey="cloudflare:exception-audit:2026-11-01:v1";
  const prior=await env.BOT_CONFIG_KV.get(stateKey,"json").catch(()=>null);
  if(prior?.status==="complete"||prior?.status==="no_matching_logs"||prior?.status==="metrics_only")return prior;
  const now=Date.now(),attemptKey=stateKey+":attempt";
  const last=await env.BOT_CONFIG_KV.get(attemptKey,"json").catch(()=>null);
  if(Number(last?.at)&&now-Number(last.at)<30*60*1000)return {status:"throttled"};
  await env.BOT_CONFIG_KV.put(attemptKey,JSON.stringify({at:now}),{expirationTtl:7*86400});
  const from=Date.UTC(2026,10,1,0,0,0),to=now,endpoint="/accounts/"+CF_MONITOR_ACCOUNT_ID+"/workers/observability/telemetry/query";
  const base={timeframe:{from,to},view:"events",limit:100,dry:true};
  let rows=[],total=0,telemetryError="";
  try{
    const queryA=await cfMonitorRequest(env,endpoint,{...base,queryId:"shihab-script-threw-exception-nov1",parameters:{needle:{value:"scriptThrewException",isRegex:false,matchCase:false},limit:100}});
    rows=queryA?.events?.events||[];total=cfMonitorNumber(queryA?.events?.count);
    if(!rows.length){
      const queryB=await cfMonitorRequest(env,endpoint,{...base,queryId:"shihab-worker-exception-outcome-nov1",parameters:{filters:[{key:"$workers.outcome",operation:"eq",type:"string",value:"exception"}],limit:100}});
      rows=queryB?.events?.events||[];total=Math.max(total,cfMonitorNumber(queryB?.events?.count));
    }
  }catch(e){telemetryError=String(e&&e.message||e).slice(0,180);}
  let metricRows=[],metricsError="";
  try{
    const metricsQuery="query ShihabHistoricalWorkerErrors($accountTag: string!, $startTime: Time!, $endTime: Time!) { viewer { accounts(filter: { accountTag: $accountTag }) { workersInvocationsAdaptive(limit: 10000, filter: { datetime_geq: $startTime, datetime_leq: $endTime }) { sum { requests errors } dimensions { scriptName status } } } } }";
    const metricData=await cfMonitorGraphQL(env,metricsQuery,{accountTag:CF_MONITOR_ACCOUNT_ID,startTime:new Date(from).toISOString(),endTime:new Date(to).toISOString()});
    metricRows=metricData?.viewer?.accounts?.[0]?.workersInvocationsAdaptive||[];
  }catch(e){metricsError=String(e&&e.message||e).slice(0,180);}
  const metricErrorRows=metricRows.filter(row=>cfMonitorNumber(row?.sum?.errors)>0||/exception|scriptthrew|internalerror|exceeded/i.test(String(row?.dimensions?.status||"")));
  const metricErrorTotal=metricErrorRows.reduce((sum,row)=>sum+cfMonitorNumber(row?.sum?.errors||row?.sum?.requests),0);
  const unique=new Map();
  for(const row of rows)unique.set(String(row?.$metadata?.id||row?.timestamp||unique.size),row);
  const events=[...unique.values()],groups=new Map(),scripts=new Map();
  for(const row of events){
    const meta=row?.$metadata||{},worker=row?.$workers||{},script=String(worker.scriptName||"Unknown Worker").slice(0,80);
    scripts.set(script,(scripts.get(script)||0)+1);
    const message=String(meta.errorTemplate||meta.messageTemplate||meta.error||meta.message||"Exception event without an error message").replace(/[\r\n\t]+/g," ").slice(0,160);
    const key=script+" — "+message;groups.set(key,(groups.get(key)||0)+1);
  }
  const top=[...groups.entries()].sort((a,b)=>b[1]-a[1]).slice(0,8);
  if(!events.length&&!total){
    if(metricsError&&!telemetryError)throw new Error("No exception events; historical metrics query failed: "+metricsError);
    if(metricsError&&telemetryError)throw new Error("Telemetry query failed: "+telemetryError+"; historical metrics query failed: "+metricsError);
    const state={status:telemetryError?"telemetry_unavailable":(metricErrorTotal>0?"metrics_only":"no_matching_logs"),at:now,timeframe:{from,to},metricErrorTotal,metricErrorRows:metricErrorRows.map(row=>({scriptName:row?.dimensions?.scriptName||"Unknown Worker",status:row?.dimensions?.status||"Unknown",errors:cfMonitorNumber(row?.sum?.errors),requests:cfMonitorNumber(row?.sum?.requests)})),telemetryError};
    const lines=["⚠️ <b>HISTORICAL EXCEPTION INVESTIGATION</b>","📅 Window: Nov 1, 2026 → now"];
    if(metricErrorTotal>0){
      lines.push("📊 Workers Analytics reports "+metricErrorTotal+" error invocations.");
      for(const row of state.metricErrorRows.slice(0,10))lines.push("• "+row.scriptName+" — "+row.status+": "+(row.errors||row.requests));
      lines.push("","⚠️ Detailed exception logs were not returned; this identifies affected Worker/status but cannot prove the root cause.");
    }else{
      lines.push("No matching persisted telemetry events or historical exception metric rows were returned. The previously observed 80 exception metrics cannot be root-caused from the available retained data; this is not proof that the exceptions did not occur.");
    }
    if(telemetryError){
      lines.push("","⚠️ Detailed telemetry access is currently unavailable; this is NOT a confirmed no-logs result.");
      lines.push("The audit will retry automatically on a later scheduled check.");
      lines.push("Telemetry query: "+telemetryError.replace(/[&<>]/g," "));
      await sendTelegram(lines.join("\n"));
      return state;
    }
    await env.BOT_CONFIG_KV.put(stateKey,JSON.stringify(state),{expirationTtl:365*86400});
    await sendTelegram(lines.join("\n"));
    return state;
  }
  const scriptLines=[...scripts.entries()].sort((a,b)=>b[1]-a[1]).map(([name,count])=>"• "+name+": "+count);
  const errorLines=top.map(([name,count],i)=>(i+1)+". ("+count+"×) "+name);
  const state={status:"complete",at:now,total:Math.max(total,events.length),returned:events.length,scripts:Object.fromEntries(scripts),top:top.map(([message,count])=>({message,count}))};
  await env.BOT_CONFIG_KV.put(stateKey,JSON.stringify(state),{expirationTtl:365*86400});
  await sendTelegram(["🔎 <b>HISTORICAL EXCEPTION INVESTIGATION</b>","📅 Window: Nov 1, 2026 → now","📊 Matching telemetry events: "+Math.max(total,events.length)+" (returned "+events.length+")","","<b>By Worker</b>",...(scriptLines.length?scriptLines:["No Worker name in returned events."]),"","<b>Most common exception signatures</b>",...(errorLines.length?errorLines:["No error message was persisted."])].join("\n"));
  return state;
}

function bdDay(ts=Date.now()){return new Intl.DateTimeFormat("en-CA",{timeZone:"Asia/Dhaka",year:"numeric",month:"2-digit",day:"2-digit"}).format(new Date(ts));}
function previousBdDay(day){const d=new Date(day+"T00:00:00Z");d.setUTCDate(d.getUTCDate()-1);return d.toISOString().slice(0,10);}
async function readDailyActivity(env,day){const prefix="daily:"+day+":visitor:",rows=[];let cursor,pageCount=0;do{const page=await env.VISITOR_KV.list({prefix,limit:1000,cursor});for(const key of page.keys||[]){const row=await env.VISITOR_KV.get(key.name,"json");if(row)rows.push(row)}cursor=page.list_complete?undefined:page.cursor;pageCount++;}while(cursor&&pageCount<2);const partial=!!cursor;const tally=fn=>{const m={};for(const r of rows){const k=String(fn(r)||"Unknown");m[k]=(m[k]||0)+1;}return Object.entries(m).sort((a,b)=>b[1]-a[1]).slice(0,6).map(([k,v])=>k+" ("+v+")");};const pages={};let views=0,sessions=0,errors=0,returning=0;for(const r of rows){views+=r.pageViews||0;sessions+=r.sessions||0;errors+=r.errors||0;if(r.returning)returning++;for(const [k,v] of Object.entries(r.pages||{}))pages[k]=(pages[k]||0)+v;}return {day,partial,unique:rows.length,returning,sessions,views,errors,pages:Object.entries(pages).sort((a,b)=>b[1]-a[1]).slice(0,6).map(([k,v])=>k+" ("+v+")"),countries:tally(r=>r.network?.country),cities:tally(r=>r.network?.city),isps:tally(r=>r.network?.isp),devices:tally(r=>r.device?.deviceType),browsers:tally(r=>r.device?.browser),visitors:rows.sort((a,b)=>(b.pageViews||0)-(a.pageViews||0)).slice(0,20)};}
async function sendTelegramText(env,chatId,text,options={}){
  const max=3500,lines=botFormatTelegramResponse(text,options).split("\n"),chunks=[];let current="";
  for(const line of lines){
    if(line.length>max){
      if(current){chunks.push(current);current="";}
      for(let i=0;i<line.length;i+=max)chunks.push(line.slice(i,i+max));
      continue;
    }
    const candidate=current?current+"\n"+line:line;
    if(candidate.length>max){chunks.push(current);current=line;}else current=candidate;
  }
  if(current||!chunks.length)chunks.push(current);
  for(let i=0;i<chunks.length;i++){
    const extra={...options};if(i>0)delete extra.reply_to_message_id;
    const res=await fetch("https://api.telegram.org/bot"+env.TELEGRAM_BOT_TOKEN+"/sendMessage",{
      method:"POST",headers:{"Content-Type":"application/json"},
      body:JSON.stringify({chat_id:chatId,text:chunks[i],disable_web_page_preview:true,...extra})
    });
    const data=await res.json().catch(()=>({}));
    if(!res.ok||!data.ok)throw new Error("Telegram message delivery failed (HTTP "+res.status+")");
  }
  return true;
}


function dailyActivityLines(a,p){const list=(n,v)=>n+": "+(v.length?v.join(", "):"No data");const delta=(v,o)=>{const d=v-o;return (d>0?"+":"")+d+" vs yesterday"};const lines=["📅 Date: "+a.day+" (BDT)",...(a.partial?["⚠️ Partial sample: visitor scan capped at 2,000 records to protect Free KV usage."]:[]),"👤 Unique visitors: "+a.unique+(p?" · "+delta(a.unique,p.unique):""),"🆕 New visitors: "+Math.max(0,a.unique-a.returning),"↩️ Returning visitors: "+a.returning,"🔁 Visits / sessions: "+a.sessions+(p?" · "+delta(a.sessions,p.sessions):""),"👁️ Page views: "+a.views+(p?" · "+delta(a.views,p.views):""),"⚠️ Client errors: "+a.errors,list("🔥 Popular pages",a.pages),list("🌍 Countries",a.countries),list("📍 Cities",a.cities),list("📡 ISPs",a.isps),list("📱 Devices",a.devices),list("🌐 Browsers",a.browsers),"","👥 VISITOR DETAILS"];for(const [i,v] of (a.visitors||[]).entries()){const pages=Object.entries(v.pages||{}).sort((x,y)=>y[1]-x[1]).map(([k,n])=>k+" ×"+n).join(", ")||"Page data unavailable";const device=[v.device?.deviceType,v.device?.deviceModel,v.device?.os,v.device?.browser].filter(Boolean).join(" / ")||"Unknown";const source=v.source?.utmSource||v.source?.referrer||"Direct";const seen=v.lastSeen?new Date(v.lastSeen).toLocaleTimeString("en-US",{timeZone:"Asia/Dhaka",hour:"2-digit",minute:"2-digit"}):"Unknown";lines.push((i+1)+". "+(v.visitorId||"Visitor").replace(/(VIS-)[A-F0-9]{8}([A-F0-9]{4})/,"$1••••••••$2")+" · "+(v.returning?"Returning":"New"),"   🕒 Last seen: "+seen+" BDT · Sessions today: "+(v.sessions||0)+" · Views: "+(v.pageViews||0),"   📄 Pages: "+pages,"   🔗 Source: "+source,"   📱 Device: "+device,"   📍 Location: "+[v.network?.city,v.network?.country].filter(Boolean).join(", ")+" · ISP: "+(v.network?.isp||"Unknown"));}if(!a.visitors?.length)lines.push("No visitor-level records available.");lines.push("","ℹ️ Active time, exact exit time and scroll/interaction duration are not measured in this report.");return lines;}

function dailyReportMarkdownEscape(value){
  const special=new Set(["\\","_","*","[","]","(",")","~",String.fromCharCode(96),">","#","+","-","=","|","{","}",".","!"]);
  return Array.from(String(value??""),ch=>special.has(ch)?"\\"+ch:ch).join("");
}
function dailyReportBold(value){return "*"+dailyReportMarkdownEscape(value)+"*";}
function dailyReportShort(value,max=40){return String(value??"").replace(/[\u0000-\u001f<>]/g," ").replace(/&/g," and ").replace(/\s+/g," ").trim().slice(0,max)||"Unknown";}
function dailyReportVisitorAnalyticsLines(activity,prior){
  if(!activity)return [dailyReportMarkdownEscape("⚠️ Visitor Intelligence data unavailable.")];
  const delta=key=>{if(!prior)return "";const d=Number(activity[key]||0)-Number(prior[key]||0);return " ("+(d>0?"+":"")+d+" vs yesterday)";};
  const list=(label,items)=>label+": "+((items||[]).slice(0,4).join(" · ")||"No data");
  return [
    "Date: "+activity.day+" (BDT)",
    "Unique visitors: "+activity.unique+delta("unique"),
    "New visitors: "+Math.max(0,activity.unique-activity.returning),
    "Returning visitors: "+activity.returning,
    "Sessions: "+activity.sessions+delta("sessions"),
    "Page views: "+activity.views+delta("views"),
    "Client errors: "+activity.errors,
    list("Popular pages",activity.pages),
    list("Countries",activity.countries),
    list("Cities",activity.cities),
    list("Devices",activity.devices),
    list("Browsers",activity.browsers),
    list("ISPs",activity.isps),
    activity.partial?"⚠️ Partial visitor sample; KV safety cap reached.":""
  ].filter(Boolean).map(dailyReportMarkdownEscape);
}
function dailyReportVisitorDetailsLines(activity){
  const visitors=activity?.visitors||[];
  const lines=[];
  if(!visitors.length)return [dailyReportMarkdownEscape("No visitor-level records available.")];
  lines.push(dailyReportMarkdownEscape("Showing "+visitors.length+" compact profiles of "+Number(activity.unique||visitors.length)+" unique visitors."));
  for(let i=0;i<visitors.length;i++){
    const v=visitors[i]||{};
    const id=dailyReportShort(String(v.visitorId||"Visitor").replace(/(VIS-)[A-F0-9]{8}([A-F0-9]{4})/,"$1••••••••$2"),18);
    const kind=v.returning?"Returning":"New";
    let seen="Unknown";
    if(v.lastSeen){try{seen=new Date(v.lastSeen).toLocaleTimeString("en-US",{timeZone:"Asia/Dhaka",hour:"2-digit",minute:"2-digit"})}catch{}}
    const location=dailyReportShort([v.network?.city,v.network?.country].filter(Boolean).join("/"),20);
    const device=dailyReportShort([v.device?.deviceType,v.device?.deviceModel,v.device?.os,v.device?.browser].filter(Boolean).join("/"),30);
    const pages=Object.entries(v.pages||{}).sort((a,b)=>b[1]-a[1]).slice(0,2).map(([path,count])=>dailyReportShort(path,16)+"×"+count).join(",")||"No page data";
    let source=dailyReportShort(v.source?.utmSource||"",16);
    if(!source){try{source=v.source?.referrer?dailyReportShort(new URL(v.source.referrer).hostname,16):"Direct"}catch{source="Referral"}}
    const rawLine=String(i+1).padStart(2,"0")+" · "+id+" · "+kind+" · "+seen+" · "+location+" · "+device+" · "+(v.sessions||0)+"S/"+(v.pageViews||0)+"V · "+pages+" · "+source;
    lines.push(dailyReportMarkdownEscape(rawLine.length>230?rawLine.slice(0,227)+"…":rawLine));
  }
  if(activity.partial)lines.push(dailyReportMarkdownEscape("⚠️ Visitor scan was partial; totals may exclude records beyond the safety cap."));
  lines.push(dailyReportMarkdownEscape("Active duration, exact exit time and scroll duration are not measured."));
  return lines;
}
function dailyReportRecommendations(input){
  const out=[];
  if(input.failure)out.push("CRITICAL: Website check failed. Verify GitHub Pages availability and the latest deployment.");
  if(!input.headersChecked)out.push("Security headers could not be inspected; rerun the check after the website responds normally.");
  if(input.missing?.length)out.push("Missing security headers: "+input.missing.join(", ")+". Configure at the hosting/CDN layer and test CSP carefully to preserve GA4 and AdSense.");
  if(input.activity&&input.prior&&(input.activity.unique<input.prior.unique||input.activity.views<input.prior.views))out.push("Traffic is lower than yesterday. Compare the 7-day trend before deciding on a cause.");
  if(input.activity?.errors>0)out.push("Visitor tracking recorded "+input.activity.errors+" client errors. Inspect affected pages and browser console reports.");
  if(!input.ga4)out.push("GA4 data was unavailable. Check the existing service-account permission and Analytics property access.");
  for(const metric of input.resourceSnapshot?.metrics||[]){
    if(metric.percent>=85)out.push("Resource pressure: "+metric.label+" is at "+metric.percent+"% of its included allowance or limit. Review usage before overage or exhaustion.");
    else if(metric.percent>=70)out.push("Monitor "+metric.label+": usage has reached "+metric.percent+"% of its included allowance or limit.");
  }
  if(!out.length)out.push("No urgent action detected. Keep monitoring and review the 7-day trend.");
  return out.slice(0,6);
}
function buildDailyReportMessages(input){
  const id=String(input.reportId||"Unavailable");
  const online=!input.failure&&String(input.status||"").startsWith("2");
  const health=!online?"CRITICAL":(!input.headersChecked||input.missing?.length)?"NEEDS ATTENTION":"HEALTHY";
  const activity=input.activity;
  const plain=dailyReportMarkdownEscape;
  const bold=dailyReportBold;
  const row=(label,value)=>plain(label)+": "+bold(value);
  const statusLine=input.failure
    ?"🔴 "+plain("Website: DOWN · "+input.failure)
    :"🟢 "+plain("Website: HTTP "+(input.status||"Unavailable")+" · ONLINE");
  const summary=[
    bold("◈ KOKUSHIBU74 INTELLIGENCE"),
    bold("01/05 · SYSTEM INTELLIGENCE"),
    plain((input.stamp||"Time unavailable")+" BDT"),
    plain("REPORT ID: "+id),
    "",
    bold("SYSTEM STATUS"),
    statusLine,
    "⚡ "+plain("Response: "+(input.responseMs===null?"Unavailable":input.responseMs+" ms")),
    "👥 "+plain("Visitors: "+(activity?activity.unique:"Unavailable")+" · Page views: "+(activity?activity.views:"Unavailable")),
    "⚠️ "+plain("Client errors: "+(activity?activity.errors:"Unavailable")),
    "🔐 "+plain("Security headers: "+(!input.headersChecked?"Check unavailable":(input.missing?.length?input.missing.length+" need review":"All checked headers present"))),
    "",
    row("OVERALL HEALTH",health),
    plain("Traffic details: 02/05 · Visitor profiles: 03/05 · Actions: 05/05")
  ];
  const ga4=input.ga4?[
    row("GA4 connection","CONNECTED"),
    row("Active users",input.ga4.users),
    row("Sessions",input.ga4.sessions),
    row("Page views",input.ga4.views),
    row("Engagement rate",(Number(input.ga4.engagement)*100).toFixed(2)+"%")
  ]:[
    row("GA4 connection","UNAVAILABLE"),
    plain("Reason: "+(input.ga4Error||"Unknown error"))
  ];
  const analytics=[
    bold("02/05 · TRAFFIC INTELLIGENCE"),
    plain("REPORT ID: "+id),
    "",
    bold("GOOGLE ANALYTICS 4"),
    ...ga4,
    "",
    bold("VISITOR TRACKING"),
    ...dailyReportVisitorAnalyticsLines(activity,input.prior)
  ];
  const visitors=[
    bold("03/05 · VISITOR INTELLIGENCE"),
    plain("REPORT ID: "+id),
    "",
    bold("RECENT VISITOR PROFILES"),
    ...dailyReportVisitorDetailsLines(activity)
  ];
  const metricNames={workers_requests:"Workers requests (monthly)",workers_cpu_ms:"Workers CPU time (monthly)",workers_ai_neurons:"Workers AI neurons (daily)",kv_reads:"KV reads (monthly)",kv_writes:"KV writes (monthly)",kv_deletes:"KV deletes (monthly)",kv_lists:"KV list operations (monthly)",kv_storage:"KV storage",d1_rows_read:"D1 rows read (monthly)",d1_rows_written:"D1 rows written (monthly)",d1_storage:"D1 storage"};
  const metrics=input.resourceSnapshot?.metrics||[];
  const resource=[
    bold("04/05 · INFRASTRUCTURE INTELLIGENCE"),
    plain("REPORT ID: "+id),
    plain("Billing month: "+(input.resourceSnapshot?.month||"Unavailable")+" UTC · AI allocation day: "+(input.resourceSnapshot?.day||"Unavailable")+" UTC"),
    "",
    ...metrics.map(metric=>{
      const used=metric.unit==="bytes"?(metric.used/1073741824).toFixed(3)+" GiB":Math.round(metric.used).toLocaleString("en-US");
      const limit=metric.unit==="bytes"?(metric.limit/1073741824).toFixed(3)+" GiB":Math.round(metric.limit).toLocaleString("en-US");
      const percent=Number.isFinite(Number(metric.percent))?Math.round(metric.percent):0;
      const icon=percent>=95?"🚨":percent>=70?"⚠️":"🟢";
      return icon+" "+plain(metricNames[metric.key]||metric.label)+": "+bold(used+" / "+limit)+" · "+bold(percent+"%");
    }),
    metrics.length?plain("Coverage: 3 Workers · 6 existing KV namespaces · 1 D1 database · Workers AI binding"):"⚠️ "+plain("Cloudflare resource metrics unavailable."),
    plain("Workers requests/CPU and KV usage are account-wide; D1 usage covers the account’s only database. Analytics values are estimates, not the billing ledger; Workers AI usage is adaptively sampled.")
  ];
  const securityStatus=!input.headersChecked?"CHECK UNAVAILABLE":input.missing?.length?"REVIEW REQUIRED":"STABLE";
  const security=[
    bold("05/05 · SECURITY & ACTION PLAN"),
    plain("REPORT ID: "+id),
    row("Security status",securityStatus),
    "",
    bold("SECURITY HEADER CHECK"),
    ...(!input.headersChecked?[plain("⚠️ Header inspection unavailable.")]:input.missing?.length?input.missing.map(name=>"⚠️ "+plain(name)):[plain("🟢 All checked response headers are present.")]),
    "",
    bold("RECOMMENDED ACTIONS"),
    ...dailyReportRecommendations(input).map((item,index)=>plain((index+1)+". "+item)),
    "",
    plain("Recommendations use existing deterministic health rules; no external AI API or paid service is called."),
    plain("This is a basic uptime/header check, not a complete penetration or security audit.")
  ];
  return [summary.join("\n"),analytics.join("\n"),visitors.join("\n"),resource.join("\n"),security.join("\n")];
}
async function dailyReportVisualFileId(env,input){
  try{
    const saved=await env.BOT_CONFIG_KV.get("daily-report:visual-pool:v1","json");
    const source=Array.isArray(saved)?saved:(Array.isArray(saved?.fileIds)?saved.fileIds:(Array.isArray(saved?.images)?saved.images:[]));
    const pool=source.map(item=>typeof item==="string"?item:(item?.fileId||item?.file_id||"")).filter(id=>typeof id==="string"&&id.length>10&&id.length<2048);
    const day=Date.parse(String(input.reportId||"").slice(0,10)+"T00:00:00Z");
    const weekly=Number.isFinite(day)&&new Date(day).getUTCDay()===1;
    const special=!!input.failure||(input.missing||[]).length>=3;
    if(!pool.length||(!weekly&&!special))return null;
    return pool[Math.floor(Math.random()*pool.length)]||null;
  }catch{return null;}
}
async function sendTelegramReportBatch(env,chatId,messages,reportId,reportInput={}){
  if(!env.BOT_CONFIG_KV)throw new Error("BOT_CONFIG_KV binding is unavailable for report delivery state");
  const stateKey="daily-report:delivery:v2:"+reportId;
  let state=null;
  try{state=await env.BOT_CONFIG_KV.get(stateKey,"json")}catch{}
  if(state?.status==="complete")return {status:"complete",sent:messages.length,alreadySent:true,imageSent:!!state.imageSent};
  let sent=Math.max(0,Math.min(messages.length,Number(state?.sent)||0));
  let imageSent=!!state?.imageSent;
  const imageId=sent===0?await dailyReportVisualFileId(env,{...reportInput,reportId}):null;
  for(let i=sent;i<messages.length;i++){
    const text=String(messages[i]||"");
    if(text.length>3900)throw new Error("Daily report section "+(i+1)+" exceeds the safe Telegram message length.");
    let response,payload;
    if(i===0&&imageId&&text.length<=1000){
      response=await fetch("https://api.telegram.org/bot"+env.TELEGRAM_BOT_TOKEN+"/sendPhoto",{
        method:"POST",headers:{"Content-Type":"application/json"},
        body:JSON.stringify({chat_id:chatId,photo:imageId,caption:text,parse_mode:"MarkdownV2"})
      });
      payload=await response.json().catch(()=>({}));
      if(response.ok&&payload.ok)imageSent=true;
      else{
        console.error("Daily report image delivery failed; falling back to text:",String(payload.description||"Telegram photo error").slice(0,120));
        response=null;
      }
    }
    if(!response){
      response=await fetch("https://api.telegram.org/bot"+env.TELEGRAM_BOT_TOKEN+"/sendMessage",{
        method:"POST",headers:{"Content-Type":"application/json"},
        body:JSON.stringify({chat_id:chatId,text,parse_mode:"MarkdownV2",disable_web_page_preview:true,...(i===messages.length-1?{reply_markup:{inline_keyboard:[[{text:"Full Report",callback_data:"b1:alert:status:reports:1"},{text:"Traffic",callback_data:"b1:alert:status:analytics:3"}]]}}:{})})
      });
      payload=await response.json().catch(()=>({}));
    }
    if(!response.ok||!payload.ok)throw new Error("Daily report message "+(i+1)+"/"+messages.length+" failed (HTTP "+response.status+"): "+String(payload.description||"Telegram delivery error").slice(0,120));
    sent=i+1;
    await env.BOT_CONFIG_KV.put(stateKey,JSON.stringify({reportId,sent,status:sent===messages.length?"complete":"partial",imageSent,updatedAt:Date.now()}),{expirationTtl:3*86400});
  }
  return {status:"complete",sent,imageSent,alreadySent:false};
}
async function umList(env,prefix,limit=1000,maxPages=2){
  const out=[];let cursor,pages=0;
  do{const page=await env.VISITOR_KV.list({prefix,limit,cursor});out.push(...(page.keys||[]));cursor=page.list_complete?undefined:page.cursor;pages++;}while(cursor&&pages<maxPages);
  out.truncated=!!cursor;
  return out;
}

async function umLocationHistory(env,id,pageNo=1){
  try{
    const prefix="loc:v1:history:visitor:"+id+":";
    const keys=await umList(env,prefix,1000,20);
    const sorted=keys.slice().sort((a,b)=>String(b.name).localeCompare(String(a.name)));
    const pageSize=4,total=keys.length,totalPages=Math.max(1,Math.ceil(total/pageSize));
    const page=Math.max(1,Math.min(totalPages,Number(pageNo)||1)),start=(page-1)*pageSize;
    const selected=sorted.slice(start,start+pageSize);
    const records=(await Promise.all(selected.map(key=>env.VISITOR_KV.get(key.name,"json").catch(()=>null)))).filter(Boolean);
    return {records,total,page,pageSize,totalPages,truncated:!!keys.truncated,unavailable:false};
  }catch(error){
    return {records:[],total:0,page:1,pageSize:4,totalPages:1,truncated:false,unavailable:true};
  }
}
function umLocationReportKeyboard(id,history,directoryPage=1){
  const rows=[];
  if(history?.totalPages>1){
    const nav=[];
    if(history.page>1)nav.push({text:"⬅️ Newer locations",callback_data:"b1:users:visitor:"+id+":"+(history.page-1)+":"+directoryPage});
    if(history.page<history.totalPages)nav.push({text:"Older locations ➡️",callback_data:"b1:users:visitor:"+id+":"+(history.page+1)+":"+directoryPage});
    if(nav.length)rows.push(nav);
  }
  rows.push([{text:"⬅️ User Directory",callback_data:"b1:users:list:"+directoryPage}]);
  return rows;
}
async function umHistory(env,kind,id,event){
  const at=Date.now(),day=umDate(at),salt=crypto.randomUUID?crypto.randomUUID():Math.random().toString(36).slice(2);
  const key=UM_PREFIX+"history:"+kind+":"+id+":"+day+":"+at+"-"+salt;
  await env.VISITOR_KV.put(key,JSON.stringify({at,kind,id,event}),{expirationTtl:34560000});
}
async function umTelegramTouch(env,msg){
  const id=String(msg.from.id),key=UM_PREFIX+"telegram:"+id,now=Date.now();
  let old={};try{old=await env.VISITOR_KV.get(key,"json")||{}}catch{}
  const username=umClean(msg.from.username,80),firstName=umClean(msg.from.first_name,80),
    lastName=umClean(msg.from.last_name,80),languageCode=umClean(msg.from.language_code,20);
  const profile={kind:"telegram",id,telegramId:id,firstSeen:old.firstSeen||now,lastSeen:now,
    username,firstName,lastName,languageCode,isBot:!!msg.from.is_bot,customId:old.customId||null};
  const metadataChanged=old.kind!=="telegram"||old.username!==username||old.firstName!==firstName||
    old.lastName!==lastName||old.languageCode!==languageCode||old.isBot!==!!msg.from.is_bot;
  if(metadataChanged||!Number(old.lastSeen)||now-Number(old.lastSeen)>=15*60*1000){
    await env.VISITOR_KV.put(key,JSON.stringify(profile),{expirationTtl:31536000});
  }
  const command=(String(msg.text||"").trim().split(/\s+/)[0]||"").split("@")[0].toLowerCase();
  if(command.startsWith("/")&&!["/start","/menu","/cmd"].includes(command)){
    await umHistory(env,"telegram",id,{type:"command_received",command:command.slice(0,40),chatType:msg.chat.type||"unknown"});
  }
}
async function umResolve(env,input){
  const raw=String(input||"").trim();if(!raw)return null;
  if(/^\d{5,20}$/.test(raw))return {kind:"telegram",id:raw};
  if(/^VIS-[A-F0-9]{12}$/i.test(raw))return {kind:"visitor",id:raw.toUpperCase()};
  let map;try{map=await env.VISITOR_KV.get(UM_PREFIX+"custom:"+encodeURIComponent(raw.toLowerCase()),"json")}catch{}
  return map&&map.kind&&map.id?{kind:map.kind,id:String(map.id)}:null;
}
async function umProfile(env,user){
  if(!user)return null;
  if(user.kind==="telegram")return await env.VISITOR_KV.get(UM_PREFIX+"telegram:"+user.id,"json");
  const current=await env.VISITOR_KV.get(UM_PREFIX+"visitor:"+user.id,"json");
  return current||await env.VISITOR_KV.get("visitor:"+user.id,"json");
}
async function umBlocked(env,kind,id){
  try{return !!(await env.VISITOR_KV.get(UM_PREFIX+"block:"+kind+":"+id,"json"))}catch{return false}
}
async function sendVisitorAlertOnce(env,key,text,markup,now=Date.now()){
  if(!env.VISITOR_KV||!env.TELEGRAM_BOT_TOKEN||!env.TELEGRAM_CHAT_ID)return false;
  const marker="alert:"+key,lock="alert:lock:"+key;
  try{
    if(await env.VISITOR_KV.get(marker)||await env.VISITOR_KV.get(lock))return false;
    await env.VISITOR_KV.put(lock,String(now),{expirationTtl:90});
  }catch(error){
    console.error("Visitor alert deduplication state unavailable",String(error&&error.message||error).slice(0,160));
    return false;
  }
  try{
    const response=await fetch("https://api.telegram.org/bot"+env.TELEGRAM_BOT_TOKEN+"/sendMessage",{
      method:"POST",headers:{"Content-Type":"application/json"},
      body:JSON.stringify({
        chat_id:env.TELEGRAM_CHAT_ID,
        text:botFormatTelegramResponse(text,{parse_mode:"HTML"}),
        parse_mode:"HTML",disable_web_page_preview:true,
        ...(markup?{reply_markup:markup}:{})
      }),
      signal:AbortSignal.timeout(10000)
    });
    const payload=await response.json().catch(()=>({}));
    if(!response.ok||payload.ok!==true){
      throw new Error("Telegram rejected the alert (HTTP "+response.status+"): "+String(payload.description||"unknown Telegram API error").slice(0,140));
    }
    try{
      await env.VISITOR_KV.put(marker,JSON.stringify({sentAt:now,messageId:payload.result?.message_id||null}),{expirationTtl:86400});
    }catch(error){
      console.error("Visitor alert delivered but deduplication marker could not be saved",String(error&&error.message||error).slice(0,160));
    }
    return true;
  }catch(error){
    console.error("Visitor alert delivery failed",JSON.stringify({key:String(key).slice(0,140),error:String(error&&error.message||error).slice(0,180)}));
    return false;
  }finally{
    await env.VISITOR_KV.delete(lock).catch(error=>console.error("Visitor alert lock cleanup failed",String(error&&error.message||error).slice(0,120)));
  }
}
async function umReply(env,chatId,text,keyboard=botBackKeyboard(),options={}){
  if(!env.TELEGRAM_BOT_TOKEN)return;
  await botSend(env,chatId,text,keyboard,options);
}

function umClean(value,max=120){return umValue(value,"").slice(0,Math.max(0,Number(max)||120));}
function umDate(value=Date.now()){const d=new Date(value);if(!Number.isFinite(d.getTime()))return "unknown";const parts=new Intl.DateTimeFormat("en-CA",{timeZone:"Asia/Dhaka",year:"numeric",month:"2-digit",day:"2-digit"}).formatToParts(d);const pick=t=>parts.find(p=>p.type===t)?.value||"00";return pick("year")+"-"+pick("month")+"-"+pick("day");}
function umValue(value,fallback="Unknown"){const s=String(value??"").replace(/[\u0000-\u001f<>]/g," ").replace(/\s+/g," ").trim();return s||fallback;}
function umTime(value){if(!value)return "Unknown";const t=Date.parse(String(value));if(!Number.isFinite(t))return umValue(value);return new Intl.DateTimeFormat("en-GB",{timeZone:"Asia/Dhaka",dateStyle:"medium",timeStyle:"short"}).format(new Date(t))+" BDT";}
function umVisitorReport(id,p,history={records:[],total:0,page:1,totalPages:1,truncated:false}){
  const n=p?.network||{},d=p?.device||{},src=p?.source||{},perf=p?.performance||{};
  const value=(v,fallback="Not available")=>umValue(v,fallback);
  const time=v=>{
    if(v===null||v===undefined||v==="")return "Not available";
    let t;
    if(typeof v==="number"||(typeof v==="string"&&/^\\d{10,13}$/.test(v))){
      const num=Number(v);t=new Date(num<1e12?num*1000:num);
    }else t=new Date(v);
    if(!Number.isFinite(t.getTime()))return value(v);
    return new Intl.DateTimeFormat("en-GB",{timeZone:"Asia/Dhaka",day:"2-digit",month:"short",year:"numeric",hour:"2-digit",minute:"2-digit",hour12:true}).format(t)+" BDT";
  };
  const section=(number,emoji,title,rows)=>[
    "┏━━━━━━━━━━━━━━━━━━━━",
    number+"  "+emoji+"  "+title,
    "┗━━━━━━━━━━━━━━━━━━━━",
    ...rows.map(([label,val])=>"  "+label+"\n  └ "+value(val))
  ].join("\n");
  const pages=Array.isArray(p?.pages)?p.pages.slice(-8).map(x=>value(x?.path||x)).join("  ›  "):"Not available";
  const events=Array.isArray(p?.events)?p.events.slice(-8).map(x=>value(x?.type||x)).join("  ·  "):"Not available";
  const botSignal=/bot|spider|crawler|inspectiontool/i.test(String(d.userAgent||""))?"Crawler candidate · unverified":"Not verified";
  const activityRisk=Number(p?.sessionPageViews)>=30?"Elevated activity · review recommended":"Insufficient evidence";
  const lines=[
    "🔎  VISITOR INTELLIGENCE",
    "━━━━━━━━━━━━━━━━━━━━",
    "🆔  "+value(id),
    "PROFILE  ·  WEBSITE VISITOR",
    "",
    section("01","📍","LOCATION",[
      ["Country",n.country],["Region",n.region],["City",n.city],
      ["Timezone",n.timezone],["Cloudflare PoP",n.colo],
      ["Location accuracy","IP-based estimate"]
    ]),
    section("01A","🗺️","LOCATION HISTORY",[
      ...(history.total?[[ "Saved records",String(history.total)+(history.truncated?"+":"")+" · Page "+history.page+"/"+history.totalPages ]]:[]),
      ...(history.records||[]).map((record,index)=>{
        const lat=Number(record.latitude),lon=Number(record.longitude);
        const coordinates=Number.isFinite(lat)&&Number.isFinite(lon)?lat.toFixed(5)+", "+lon.toFixed(5):"Not available";
        const accuracy=Number.isFinite(Number(record.accuracyMeters))?"±"+Math.round(Number(record.accuracyMeters))+" m":"Not available";
        const map=Number.isFinite(lat)&&Number.isFinite(lon)?"https://www.google.com/maps?q="+lat.toFixed(6)+","+lon.toFixed(6):"Not available";
        const bdt=value(record.capturedAtBdt||time(record.capturedAtUtc));
        const utc=value(record.capturedAtUtc);
        const area=record.locality?" · Area: "+value(record.locality):"";
        return ["GPS "+((history.page-1)*history.pageSize+index+1)+" · "+bdt,"UTC: "+utc+" · Coordinates: "+coordinates+" · Accuracy: "+accuracy+" · Source: "+value(record.source,"browser-geolocation")+area+" · Map: "+map];
      }),
      ...(!(history.records||[]).length?[[ "GPS History",history.unavailable?"GPS History temporarily unavailable; retry the report later.":"No GPS History records saved." ]]:[]),
      ...(history.truncated?[[ "History note","KV scan reached its safety limit; older records may not be listed." ]]:[])
    ]),
    "",
    section("02","📱","DEVICE",[
      ["Device",d.deviceType],["Model",d.deviceModel],["Operating system",d.os],
      ["Browser",d.browser],["Platform",d.platform],["Screen",d.screen],
      ["Viewport",d.viewport],["Language",d.language],["Pixel ratio",d.pixelRatio]
    ]),
    "",
    section("03","🌐","NETWORK",[
      ["IP address",n.ip],["IP version",n.ipVersion],["ISP / organization",n.isp],
      ["ASN",n.asn],["Network type",n.networkType],["Carrier",n.carrier||"Not verified"],
      ["Hosting signal",n.hostingSignal],["Corporate proxy",n.corporateProxy],
      ["VPN / Tor","Not verified"],["HTTP protocol",n.httpProtocol]
    ]),
    "",
    section("04","📊","VISITOR ACTIVITY",[
      ["Visitor status",p?.returning===true?"Returning":p?.returning===false?"First visit":"Not recorded"],
      ["Total sessions",p?.totalSessions??"0"],["Total page views",p?.totalPageViews??"0"],
      ["Current session views",p?.sessionPageViews??"0"],["Last session ID",p?.lastSessionId],
      ["Recent pages",pages],["Recent events",events],["Referrer",src.referrer||"Direct"],
      ["UTM source",src.utmSource],["UTM medium",src.utmMedium],["UTM campaign",src.utmCampaign]
    ]),
    "",
    section("05","🛡️","SECURITY ANALYSIS",[
      ["Hosting / organization",n.hostingSignal],["Corporate proxy",n.corporateProxy],
      ["VPN / Tor","Not verified"],["Bot identity",botSignal],["Risk assessment",activityRisk]
    ]),
    "",
    section("06","🕒","VISIT TIMESTAMP",[
      ["First seen",time(p?.firstSeen)],["Last seen",time(p?.lastSeen)],
      ["Last session",time(p?.lastSessionAt)],["Profile retention","365 days"],
      ["Page load",perf.loadMs!=null?Math.round(Number(perf.loadMs))+" ms":null],
      ["DOM ready",perf.domMs!=null?Math.round(Number(perf.domMs))+" ms":null],
      ["Largest contentful paint",perf.lcp!=null?Math.round(Number(perf.lcp))+" ms":null]
    ]),
    "",
    "ⓘ  LOCATION & PRIVACY",
    "IP-based location is approximate. GPS coordinates are stored only after the visitor explicitly allows location access, retained up to 90 days, and visible only to authorized Telegram admins. Device and network details depend on browser-provided signals; VPN, Tor and bot identity are not confirmed."
  ];
  return lines.join("\n");
}

// Telegram inline-button navigation and persistent control settings.
const BOT_MENU = [
  ["website","🌐 Website"],["news","📰 News Center"],["analytics","📊 Analytics"],
  ["security","🛡️ Security"],["automation","⚙️ Automation"],["users","👥 User Manager"]
];
const BOT_SECONDARY_MENU = [
  ["github","🐙 GitHub & Deploy"],["hero","🖼️ Hero Image"],
  ["logs","📜 Logs & Recovery"],["refresh","🔄 Refresh Now"],["settings","⚙️ Settings"]
];
// Sports Zone is paused by user request. Keep its alert code for later restoration, but do not read its KV or send budget alerts.
const SPORTS_ZONE_MONITORING_ENABLED=false;
const BOT_DEFAULTS = {
  monitoring:true, dailyReport:true, scheduledChecks:true, newsRefresh:true, newsAlerts:true, workflowAlerts:true,
  trafficAlerts:true, clientErrorAlerts:true, securityAlerts:true, emergencyProtection:true
};
async function botConfig(env){
  if(!env.BOT_CONFIG_KV)return {...BOT_DEFAULTS};
  try{return {...BOT_DEFAULTS,...(await env.BOT_CONFIG_KV.get("settings:v1","json")||{})}}catch{return {...BOT_DEFAULTS}}
}
async function botSaveConfig(env,cfg){
  if(!env.BOT_CONFIG_KV)throw new Error("BOT_CONFIG_KV binding is not deployed");
  await env.BOT_CONFIG_KV.put("settings:v1",JSON.stringify({...BOT_DEFAULTS,...cfg,updatedAt:Date.now()}));
}
const BOT_MENU_KEY_PREFIX = "bot:menu:v1:";
const BOT_CONTEXT_KEY_PREFIX = "bot:context:v1:";
async function botSetContext(env,chatId,context){
  if(!env.BOT_CONFIG_KV)return;
  await env.BOT_CONFIG_KV.put(BOT_CONTEXT_KEY_PREFIX+String(chatId),JSON.stringify({...context,updatedAt:Date.now()}),{expirationTtl:86400});
}
async function botGetContext(env,chatId){
  if(!env.BOT_CONFIG_KV)return null;
  try{return await env.BOT_CONFIG_KV.get(BOT_CONTEXT_KEY_PREFIX+String(chatId),"json")}catch{return null}
}
const BOT_CALLBACK_LAST=new Map();
const BOT_CALLBACK_MESSAGE_ANCHORS=new Map();
const BOT_CALLBACK_ACTIVE=new Set();
function botClaimCallback(query,action,now=Date.now()){
  const key=String(query.message?.chat?.id||"")+":"+String(query.message?.message_id||0)+":"+String(action||"");
  const last=BOT_CALLBACK_LAST.get(key)||0;
  if(now-last<1400)return false;
  BOT_CALLBACK_LAST.set(key,now);
  if(BOT_CALLBACK_LAST.size>500)for(const [k,t] of BOT_CALLBACK_LAST)if(now-t>10000)BOT_CALLBACK_LAST.delete(k);
  return true;
}

const BOT_START_LABEL = "🚀 START BOT";
async function botMarkMenuInteraction(env,chatId,messageId,busy){
  if(!env.BOT_CONFIG_KV)return;
  const key=BOT_MENU_KEY_PREFIX+String(chatId),old=await botGetMenuAnchor(env,chatId),now=Date.now();
  const last=Number(old?.lastInteractionAt||0);
  if(last&&now-last<5*60*1000&&old?.busy===!!busy)return;
  try{await env.BOT_CONFIG_KV.put(key,JSON.stringify({...old,chatId:String(chatId),messageId:Number(old?.messageId||messageId||0),lastInteractionAt:now,busy:!!busy}));}
  catch(e){console.warn("Telegram menu interaction state could not be saved",String(e&&e.message||e).slice(0,120));}
}
async function botEnsureStartKeyboard(env,chatId){
  // Keep the Control Center menu button available without sending another chat message on every /start.
  const menu=await botTelegram(env,"setChatMenuButton",{chat_id:chatId,menu_button:{type:"web_app",text:"Control Center",web_app:{url:"https://kokushibu74.github.io/miniapp/"}}});
  if(!menu.ok)console.error("Telegram Mini App menu button setup failed",JSON.stringify({status:menu.status,description:String(menu.data?.description||"").slice(0,180)}));
}
const BOT_START_MENU_COOLDOWN_MS=5000;
const BOT_START_MENU_LAST=new Map();
function botAllowStartMenu(chatId,now=Date.now()){
  const key=String(chatId),last=Number(BOT_START_MENU_LAST.get(key)||0);
  if(now-last<BOT_START_MENU_COOLDOWN_MS)return false;
  BOT_START_MENU_LAST.set(key,now);
  if(BOT_START_MENU_LAST.size>1000){
    for(const [id,at] of BOT_START_MENU_LAST)if(now-at>60000)BOT_START_MENU_LAST.delete(id);
  }
  return true;
}
async function botHandleStartButton(env,msg){
  if(String(msg.text||"").trim()!==BOT_START_LABEL)return false;
  if(!botAllowStartMenu(msg.chat.id))return true;
  let registrationError="";
  try{await botRegisterCommands(env,msg.chat.id,true);}catch(e){registrationError=String(e&&e.message||e).slice(0,180);console.error("Telegram command registration failed",registrationError);}
  await botEnsureStartKeyboard(env,msg.chat.id);
  await botShowMenu(env,msg.chat.id,undefined,registrationError);
  await botMarkMenuInteraction(env,msg.chat.id,null,false);
  return true;
}
async function botExpireIdleMenu(env){
  if(!env.BOT_CONFIG_KV)return;
  const page=await env.BOT_CONFIG_KV.list({prefix:BOT_MENU_KEY_PREFIX,limit:100}),now=Date.now();
  for(const item of page.keys||[]){
    const a=await env.BOT_CONFIG_KV.get(item.name,"json");
    if(!a?.messageId||a.busy)continue;
    const last=Number(a.lastInteractionAt||a.updatedAt||0);
    if(!last||now-last<900000)continue;
    const chatId=a.chatId||item.name.slice(BOT_MENU_KEY_PREFIX.length);
    const d=await botTelegram(env,"deleteMessage",{chat_id:chatId,message_id:Number(a.messageId)});
    if(d.ok||String(d.data?.description||"").toLowerCase().includes("message to delete not found"))await env.BOT_CONFIG_KV.delete(item.name);
  }
}

async function botTelegram(env,method,payload){
  const r=await fetch("https://api.telegram.org/bot"+env.TELEGRAM_BOT_TOKEN+"/"+method,{
    method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify(payload),signal:AbortSignal.timeout(12000)
  });
  const d=await r.json().catch(()=>({}));
  return {ok:!!(r.ok&&d.ok),data:d,status:r.status};
}
const BOT_PUBLIC_COMMANDS=[
  {command:"start",description:"Open the control center"},
  {command:"menu",description:"Open the main menu"},
  {command:"help",description:"Command guide"},
  {command:"cmd",description:"Register commands and show guide"}
];
const BOT_ADMIN_COMMANDS=[
  {command:"info",description:"Website and Worker health"},
  {command:"userid",description:"List Telegram and website users"},
  {command:"userinfo",description:"View a user profile"},
  {command:"usersearch",description:"Search user profiles"},
  {command:"userstats",description:"User management statistics"},
  {command:"userhistory",description:"View user event history"},
  {command:"userrename",description:"Set a custom user ID"},
  {command:"userlink",description:"Link Telegram and visitor IDs"},
  {command:"userunlink",description:"Unlink a user identity"},
  {command:"userblock",description:"Block a user"},
  {command:"userunblock",description:"Unblock a user"},
  {command:"details",description:"Details for the current section"},
  {command:"health",description:"Website health"},
  {command:"errors",description:"Available error diagnostics"},
  {command:"logs",description:"Available logs"},
  {command:"history",description:"Recent user history"},
  {command:"sources",description:"News feed and source status"},
  {command:"traffic",description:"Visitor traffic overview"},
  {command:"report",description:"Daily report status"}
];
async function botRegisterCommands(env,chatId,isAdmin){
  if(!env.TELEGRAM_BOT_TOKEN)throw new Error("Telegram bot token is unavailable.");
  const defaults=await botTelegram(env,"setMyCommands",{commands:BOT_PUBLIC_COMMANDS,scope:{type:"default"}});
  if(!defaults.ok)throw new Error("Default command registration failed (HTTP "+defaults.status+"): "+String(defaults.data?.description||"Telegram API error").slice(0,140));
  const defaultCheck=await botTelegram(env,"getMyCommands",{scope:{type:"default"}});
  if(!defaultCheck.ok)throw new Error("Default command verification failed (HTTP "+defaultCheck.status+"): "+String(defaultCheck.data?.description||"Telegram API error").slice(0,140));
  const defaultActual=new Set((Array.isArray(defaultCheck.data?.result)?defaultCheck.data.result:[]).map(x=>String(x.command||"")));
  const missingDefault=BOT_PUBLIC_COMMANDS.map(x=>x.command).filter(x=>!defaultActual.has(x));
  if(missingDefault.length)throw new Error("Default command verification missing: "+missingDefault.join(", "));
  if(chatId===undefined||chatId===null)return {count:defaultActual.size,verified:true};
  const expected=BOT_PUBLIC_COMMANDS.concat(isAdmin?BOT_ADMIN_COMMANDS:[]);
  const scoped=await botTelegram(env,"setMyCommands",{commands:expected,scope:{type:"chat",chat_id:chatId}});
  if(!scoped.ok)throw new Error("Chat command registration failed (HTTP "+scoped.status+"): "+String(scoped.data?.description||"Telegram API error").slice(0,140));
  const check=await botTelegram(env,"getMyCommands",{scope:{type:"chat",chat_id:chatId}});
  if(!check.ok)throw new Error("Command verification failed (HTTP "+check.status+"): "+String(check.data?.description||"Telegram API error").slice(0,140));
  const actual=new Set((Array.isArray(check.data?.result)?check.data.result:[]).map(x=>String(x.command||"")));
  const missing=expected.map(x=>x.command).filter(x=>!actual.has(x));
  if(missing.length)throw new Error("Telegram command verification missing: "+missing.join(", "));
  return {count:actual.size,verified:true};
}
async function botGetMenuAnchor(env,chatId){
  if(!env.BOT_CONFIG_KV)return null;
  try{return await env.BOT_CONFIG_KV.get(BOT_MENU_KEY_PREFIX+String(chatId),"json")}catch{return null}
}
async function botRememberMenu(env,chatId,messageId,onlyIfMissing=false){
  if(!env.BOT_CONFIG_KV||!messageId)return;
  const key=BOT_MENU_KEY_PREFIX+String(chatId);
  if(onlyIfMissing){const old=await botGetMenuAnchor(env,chatId);if(old?.messageId)return;}
  const prior=await botGetMenuAnchor(env,chatId),now=Date.now();
  await env.BOT_CONFIG_KV.put(key,JSON.stringify({...prior,chatId:String(chatId),messageId:Number(messageId),updatedAt:now,lastInteractionAt:now}));
}
async function botAnswerCallback(env,query,text,showAlert=false){
  if(!query?.id||!env.TELEGRAM_BOT_TOKEN)return;
  await botTelegram(env,"answerCallbackQuery",{callback_query_id:query.id,...(text?{text}:{}),...(showAlert?{show_alert:true}:{})});
}
function botFormatTelegramResponse(text,options={}) {
  const body=String(text||"").trim();
  if(!body)return "◈ KOKUSHIBU74 INTELLIGENCE";
  if(options.parse_mode==="HTML"){
    if(body.includes("KOKUSHIBU74 INTELLIGENCE"))return body;
    return "<b>◈ KOKUSHIBU74 INTELLIGENCE</b>\n<code>ADMIN CONTROL CENTER</code>\n\n"+body+"\n\n<i>CONTROL CENTER • PRIVATE ADMIN SESSION</i>";
  }
  if(body.includes("KOKUSHIBU74 INTELLIGENCE"))return body;
  const progress=/^(?:⏳|⌛)\s/.test(body);
  const header="◈ KOKUSHIBU74 INTELLIGENCE\n━━━━━━━━━━━━━━━━━━━━";
  const footer=progress?"⌁ PROCESSING • PLEASE WAIT":"━━━━━━━━━━━━━━━━━━━━\n◈ ADMIN CONTROL CENTER • PRIVATE CHAT";
  const content=body.length>3650?body.slice(0,3640)+"\n… আরও তথ্য সংক্ষিপ্ত করা হয়েছে।":body;
  return header+"\n\n"+content+"\n\n"+footer;
}

async function botSend(env,chatId,text,keyboard,options={}){
  if(!env.TELEGRAM_BOT_TOKEN)throw new Error("TELEGRAM_BOT_TOKEN secret is unavailable");
  let saved=null;
  try{saved=await botGetMenuAnchor(env,chatId)}catch(e){console.error("Telegram menu anchor read failed",String(e&&e.message||e).slice(0,240))}
  const callbackMessageId=Number(BOT_CALLBACK_MESSAGE_ANCHORS.get(String(chatId))||0)||null;
  const messageId=callbackMessageId||saved?.messageId||options.messageId||null;
  const payload={chat_id:chatId,text:botFormatTelegramResponse(text,options).slice(0,3900),disable_web_page_preview:true,reply_markup:{inline_keyboard:keyboard||[]},...(options.parse_mode?{parse_mode:options.parse_mode}:{})};
  if(messageId&&(!options.forceNew||callbackMessageId)){
    let edited;
    try{edited=await botTelegram(env,"editMessageText",{...payload,message_id:messageId})}
    catch(e){console.error("Telegram menu edit request failed",String(e&&e.message||e).slice(0,240))}
    const editDescription=String(edited?.data?.description||"").toLowerCase();
    if(edited?.ok||editDescription.includes("message is not modified")){
      return edited?.data?.result||{message_id:messageId,chat:{id:chatId}};
    }
    // A callback must never create a replacement message. Old notification
    // buttons can outlive Telegram's edit window; preserve the original message
    // and report the limitation through the callback toast instead of stacking chats.
    if(callbackMessageId){
      throw new Error("Telegram could not edit the clicked message (HTTP "+String(edited?.status||"unknown")+"): "+String(edited?.data?.description||"edit unavailable").slice(0,180));
    }
    // Only recover automatically when Telegram confirms that the stored anchor
    // no longer exists. Other edit failures must not silently create new messages.
    if(messageId&&!editDescription.includes("message to edit not found")&&!editDescription.includes("message_id_invalid")){
      throw new Error("Telegram menu edit failed; existing message preserved (HTTP "+String(edited?.status||"unknown")+"): "+String(edited?.data?.description||"edit unavailable").slice(0,180));
    }
  }
  const sent=await botTelegram(env,"sendMessage",payload);
  if(!sent.ok)throw new Error("Telegram menu delivery failed (HTTP "+sent.status+"): "+String(sent.data?.description||"unknown Telegram API error").slice(0,180));
  const newMessageId=sent.data.result?.message_id;
  // If Telegram refuses an edit (for example, the anchor message was deleted),
  // replace the stale menu instead of leaving a growing stack of old menus.
  if((!options.forceNew||callbackMessageId)&&messageId&&newMessageId&&Number(messageId)!==Number(newMessageId)){
    try{await botTelegram(env,"deleteMessage",{chat_id:chatId,message_id:Number(messageId)})}
    catch(e){console.error("Telegram stale menu cleanup failed",String(e&&e.message||e).slice(0,240))}
  }
  try{
    if(options.persistentMenu&&!env.BOT_CONFIG_KV)throw new Error("BOT_CONFIG_KV binding is unavailable");
    if(!options.forceNew||options.persistentMenu||callbackMessageId)await botRememberMenu(env,chatId,newMessageId);
  }catch(e){
    console.error("Telegram menu anchor save failed",String(e&&e.message||e).slice(0,240));
    if(options.persistentMenu&&newMessageId){
      try{
        const removed=await botTelegram(env,"deleteMessage",{chat_id:chatId,message_id:Number(newMessageId)});
        if(!removed.ok&&!String(removed.data?.description||"").toLowerCase().includes("message to delete not found")){
          console.error("Telegram unpersistable menu cleanup failed",JSON.stringify({status:removed.status,description:String(removed.data?.description||"").slice(0,180)}));
        }
      }catch(cleanupError){console.error("Telegram unpersistable menu cleanup request failed",String(cleanupError&&cleanupError.message||cleanupError).slice(0,180))}
      throw new Error("The menu could not be saved because its storage is unavailable. Use the Control Center chat menu button for now.");
    }
  }
  return sent.data.result;
}
async function botSendChatAction(env,chatId){
  try{await botTelegram(env,"sendChatAction",{chat_id:chatId,action:"typing"})}catch{}
}
async function botWithTyping(env,chatId,work){
  let active=true,timer=null,wake=null;
  const ticker=(async()=>{
    while(active){
      await botSendChatAction(env,chatId);
      if(!active)break;
      await new Promise(resolve=>{wake=resolve;timer=setTimeout(()=>{timer=null;wake=null;resolve()},4000)});
    }
  })();
  try{return await work()}finally{
    active=false;
    if(timer){clearTimeout(timer);timer=null;const resume=wake;wake=null;resume?.();}
    await ticker;
  }
}
async function botRunWithProgress(env,chatId,message,work){
  await botSend(env,chatId,"⏳ "+message,botBackKeyboard());
  try{
    return await botWithTyping(env,chatId,work);
  }catch(error){
    console.error("Telegram progress task failed",String(error&&error.stack||error).slice(0,1200));
    try{
      await botSend(env,chatId,"⚠️ কাজটি সম্পন্ন করা যায়নি।\nপ্রক্রিয়াটি মাঝপথে ব্যর্থ হয়েছে; একই কাজ আবার চালানোর আগে Worker Logs পরীক্ষা করুন।",botBackKeyboard());
    }catch(deliveryError){
      console.error("Telegram progress failure notice could not be delivered",String(deliveryError&&deliveryError.stack||deliveryError).slice(0,800));
    }
    return null;
  }
}
function botMainKeyboard(){
  const rows=[];
  // Keep an explicit, always-visible START BOT entry above the category controls.
  // The callback reuses the existing menu message and returns to the Control Center home.
  rows.push([{text:BOT_START_LABEL,callback_data:"b1:start"}]);
  for(let i=0;i<BOT_MENU.length;i+=2)rows.push(BOT_MENU.slice(i,i+2).map(([id,label])=>({text:label,callback_data:"b1:"+id})));
  for(let i=0;i<BOT_SECONDARY_MENU.length;i+=2)rows.push(BOT_SECONDARY_MENU.slice(i,i+2).map(([id,label])=>({text:label,callback_data:"b1:"+id})));
  return rows;
}
function botBackKeyboard(){return [[{text:"⬅️ Main Menu",callback_data:"b1:home"}]]}
async function botShowMenu(env,chatId,title="🤖 PORTFOLIO CONTROL CENTER",registrationError=""){
  const warning=registrationError?"\n\n⚠️ Telegram command registration failed: "+registrationError+"\n/help দিয়ে command guide ব্যবহার করুন।":"";
  return await botSend(env,chatId,title+"\n\nস্বাগতম! নিচের ছয়টি প্রধান বিভাগ এবং Secondary Controls থেকে Control Center ব্যবহার করুন।"+warning,botMainKeyboard(),{persistentMenu:true});
}
async function botCategory(env,chatId,category){
  const cfg=await botConfig(env);
  await botSetContext(env,chatId,{section:category,view:"category",actionId:"category:"+category});
  const labels={
    website:["🌐 WEBSITE CONTROL","Site Health","Worker Status","Contact Form","Diagnostics","Visitor Overview"],
    news:["📰 NEWS CONTROL","Latest Feed","Refresh Status","Source Health","News Errors","Refresh History"],
    analytics:["📊 ANALYTICS","GA4 Status","Visitor Summary","Traffic Overview"],
    security:["🛡️ SECURITY CENTER","Security Status","Critical Protection","Recent Security Events"],
    github:["🐙 GITHUB & DEPLOY","Repository Status","Latest Commit","Workflow Status"],
    hero:["🖼️ HERO IMAGE MANAGER","Upload from Telegram","Current Hero Image","Preview & Confirm"],
    automation:["⚙️ AUTOMATION CONTROL","Automation Status","Scheduled Tasks","Manual Actions"],
    alerts:["🚨 ALERT CONTROL","Workflow Alerts","Traffic Alerts","Client Error Alerts","Security Alerts","Emergency Protection"],
    reports:["📑 REPORTS","Daily Report Status","Latest Report","Report History"],
    users:["👥 USER MANAGER","All Users","Search Users","User Stats","Link / Unlink","Block / Unblock","Rename User","User History","Visitor Information"],
    settings:["🔧 SETTINGS","Configuration Status","Admin Access","Bot Menu"],
    logs:["📜 LOGS & RECOVERY","Recent Worker Events","Workflow Logs","Security Logs"],
    recovery:["♻️ RECOVERY","Backup Branch","Worker Rollback Point","Recovery Guide"]
  };
  const names=labels[category];if(!names){await botShowMenu(env,chatId);return}
  const rows=[];
  if(category==="website"){
    rows.push([{text:"🌐 Site Health",callback_data:"b1:status:website:1"},{text:"⚙️ Worker Status",callback_data:"b1:status:website:2"}]);
    rows.push([{text:"✉️ Contact Form",callback_data:"b1:status:website:3"},{text:"👥 Visitor Overview",callback_data:"b1:status:analytics:2"}]);
    rows.push([{text:"🧪 Diagnostics",callback_data:"b1:status:website:4"},{text:"🔄 Refresh Now",callback_data:"b1:refresh"}]);
  }else if(category==="news"){
    rows.push([{text:"📰 Latest Feed",callback_data:"b1:status:news:1"},{text:"🔄 Refresh Status",callback_data:"b1:status:news:2"}]);
    rows.push([{text:"🌍 Source Health",callback_data:"b1:status:news:3"},{text:"⚠️ News Errors",callback_data:"b1:status:news:4"}]);
    rows.push([{text:"🕘 Refresh History",callback_data:"b1:status:news:5"},{text:"🔁 Refresh Now",callback_data:"b1:refresh"}]);
  }else if(category==="automation"||category==="alerts"){
    const keys=category==="automation"?["monitoring","dailyReport","scheduledChecks","newsRefresh","newsAlerts","workflowAlerts","trafficAlerts","clientErrorAlerts","securityAlerts","emergencyProtection"]:["newsAlerts","workflowAlerts","trafficAlerts","clientErrorAlerts","securityAlerts","emergencyProtection"];
    const pretty={monitoring:"Monitoring",dailyReport:"Daily Report",scheduledChecks:"Scheduled Checks",newsRefresh:"News Refresh",newsAlerts:"Bangladesh News Alerts",workflowAlerts:"Workflow Alerts",trafficAlerts:"Traffic Alerts",clientErrorAlerts:"Client Error Alerts",securityAlerts:"Security Alerts",emergencyProtection:"Emergency Protection"};
    for(const k of keys)rows.push([{text:(cfg[k]?"🟢 ":"⚪ ")+pretty[k]+" · "+(cfg[k]?"ON":"OFF"),callback_data:"b1:toggle:"+k}]);
    rows.push([{text:"🗓 Scheduled Tasks",callback_data:"b1:status:automation:2"},{text:"▶️ Manual Actions",callback_data:"b1:status:automation:3"}]);
     rows.push([{text:"🔄 Refresh Now",callback_data:"b1:refresh"}]);
  }else if(category==="users"){
    rows.push([{text:"👥 All Users",callback_data:"b1:users:list"},{text:"🔎 Find User",callback_data:"b1:users:search"}]);
    rows.push([{text:"🔗 Linked Users",callback_data:"b1:users:linked"},{text:"🚫 Blocked Users",callback_data:"b1:users:blocked"}]);
    rows.push([{text:"📊 Statistics",callback_data:"b1:users:stats"},{text:"🕘 History",callback_data:"b1:users:history"}]);
    rows.push([{text:"🔗 Link / Unlink",callback_data:"b1:users:link"},{text:"🚫 Block / Unblock",callback_data:"b1:users:block"}]);
    rows.push([{text:"✏️ Rename",callback_data:"b1:users:rename"}]);
    rows.push([{text:"🔎 Visitor Information",callback_data:"b1:users:visitorinfo"}]);
  }else if(category==="logs"){
    rows.push([{text:"Worker Events",callback_data:"b1:status:logs:1"},{text:"Workflow Logs",callback_data:"b1:status:logs:2"}]);
    rows.push([{text:"Security Logs",callback_data:"b1:status:logs:3"},{text:"Recovery Guide",callback_data:"b1:status:recovery:1"}]);
  }else if(category==="hero"){
    rows.push([{text:"📤 Upload Hero Image",callback_data:"b1:hero:upload"}]);
    rows.push([{text:"🖼️ Current Hero Image",callback_data:"b1:hero:current"}]);
  }else{
    for(let i=1;i<names.length;i+=2)rows.push(names.slice(i,i+2).map((label,j)=>({text:label,callback_data:"b1:status:"+category+":"+(i+j)})));
  }
  rows.push(...botBackKeyboard());
  await botSend(env,chatId,names[0]+"\n\nএই বিভাগের অপশনগুলো নিচে দেওয়া হলো। প্রতিটি অপশনে চাপলে সংশ্লিষ্ট তথ্য বা নিয়ন্ত্রণ দেখানো হবে।\n\nকোনো সেটিংস ON/OFF করলে পরিবর্তনটি সংরক্ষিত হবে এবং মেনুতে নতুন অবস্থা দেখা যাবে।",rows);
}

async function botSecurityEvents(env,limit=10){
  if(!env.VISITOR_KV)return [];
  const keys=await umList(env,"security:event:v1:",1000,2),rows=[];
  for(const key of keys.slice(-Math.max(1,Math.min(50,limit))).reverse()){
    const event=await env.VISITOR_KV.get(key.name,"json");
    if(event)rows.push(event);
  }
  return rows.sort((a,b)=>Number(b.at||0)-Number(a.at||0));
}
async function botStatusText(env,category,index){
  const site="https://kokushibu74.github.io/";
  const cfg=await botConfig(env);
  const onOff=v=>v?"🟢 চালু (ON)":"⚪ বন্ধ (OFF)";
  const section={
    website:["ওয়েবসাইটের স্বাস্থ্য","হোমপেজের HTTP response, response time এবং Hero image configuration পরীক্ষা করা হয়েছে।"],
    news:["News Feed-এর অবস্থা","লাইভ News Feed ফাইল পড়া হয়েছে; Feed-এর আকার, article count ও সর্বশেষ শিরোনাম দেখানো হচ্ছে।"],
    analytics:["অ্যানালিটিক্স","Google Analytics 4 এবং Cloudflare Visitor KV আলাদা উৎস হিসেবে দেখানো হবে।"],
    security:["বেসিক নিরাপত্তা পরীক্ষা","হোমপেজের response headers পরীক্ষা করা হয়েছে। এটি পূর্ণাঙ্গ penetration test বা security audit নয়।"],
    github:["GitHub Repository","GitHub API থেকে Repository ও সর্বশেষ commit-এর তথ্য নেওয়া হয়েছে।"],
    reports:["রিপোর্ট কন্ট্রোল","Daily Report ও Monitoring-এর বর্তমান সেটিংস এবং আজকের visitor activity দেখানো হচ্ছে।"],
    settings:["Bot Configuration","Bot-এর persistent configuration storage থেকে বর্তমান ON/OFF সেটিংস দেখানো হচ্ছে।"],
    automation:["Automation Status","বর্তমান Automation Toggles এবং Cloudflare Cron Schedule দেখানো হচ্ছে."],
    logs:["সাম্প্রতিক কার্যক্রম","Visitor/User Manager-এর সংরক্ষিত সাম্প্রতিক event দেখানো হচ্ছে; পূর্ণ Cloudflare runtime log Dashboard-এ থাকে।"],
    recovery:["Recovery ও Backup তথ্য","বর্তমান backup branch এবং Worker rollback location-এর তথ্য দেখানো হচ্ছে।"]
  };
  const [heading,description]=section[category]||["সিস্টেমের অবস্থা","নির্বাচিত বিভাগের বর্তমান তথ্য।"];
  const lines=["━━━━━━━━━━━━━━━━━━","📋 "+heading.toUpperCase(),"━━━━━━━━━━━━━━━━━━","", "ℹ️ "+description,""];
  if(category==="website"){
    const started=Date.now(),workerUrl="https://portfolio-contact-telegram.mdshihab74.workers.dev";
    if(index===2||index===3||index===4){
      const [worker,contact,siteResponse]=await Promise.all([
        fetch(workerUrl+"/workflow-config",{signal:AbortSignal.timeout(10000)}).catch(()=>null),
        index===3||index===4?fetch(workerUrl+"/submit",{method:"GET",signal:AbortSignal.timeout(8000)}).catch(()=>null):Promise.resolve(null),
        index===4?fetch(site,{signal:AbortSignal.timeout(10000)}).catch(()=>null):Promise.resolve(null)
      ]);
      const config=worker?await worker.json().catch(()=>null):null;
      if(index===2){
        lines.push("⚙️ WORKER STATUS","Worker endpoint: "+(worker?"HTTP "+worker.status:"NOT AVAILABLE"),"Config endpoint: "+(worker?.ok&&config?"Connected":"Not Connected"),"Website Monitoring: "+onOff(config?.monitoring),"Scheduled Checks: "+onOff(config?.scheduledChecks),"News Alerts: "+onOff(config?.newsAlerts),"Workflow Alerts: "+onOff(config?.workflowAlerts),"","Source: portfolio-contact-telegram /workflow-config.");
      }else if(index===3){
        lines.push("✉️ CONTACT FORM BACKEND","Contact route: "+(contact?.status===405?"Present · POST only":contact?"HTTP "+contact.status:"NOT AVAILABLE"),"Worker configuration: "+(worker?.ok&&config?"Connected":"Not Connected"),"Submission test: NOT RUN (read-only check; no test message was sent).","A GET request is expected to return HTTP 405 because /submit accepts multipart POST only.");
      }else{
        const siteData=await fetch(site+"site-data.json",{signal:AbortSignal.timeout(8000)}).then(x=>x.json()).catch(()=>({}));
        lines.push("🧪 WEBSITE DIAGNOSTICS","Homepage: "+(siteResponse?"HTTP "+siteResponse.status:"NOT AVAILABLE"),"Worker config: "+(worker?"HTTP "+worker.status:"NOT AVAILABLE"),"Contact route: "+(contact?.status===405?"Present · POST only":contact?"HTTP "+contact.status:"NOT AVAILABLE"),"Hero image configured: "+(siteData.image?"Yes":"Not Available"),"Elapsed: "+(Date.now()-started)+" ms");
      }
    }else{
      const r=await fetch(site,{redirect:"follow",signal:AbortSignal.timeout(12000)});
      const data=await fetch(site+"site-data.json",{signal:AbortSignal.timeout(8000)}).then(x=>x.json()).catch(()=>({}));
      lines.push("🌐 ওয়েবসাইট: "+site,"📡 HTTP Status: "+r.status+" "+(r.ok?"(সফল response)":"(সমস্যা আছে)"),"⚡ Response Time: "+(Date.now()-started)+" ms","🖼️ Hero Image: "+String(data.image||"সেট করা নেই"),"📍 Hero Image Position: "+String(data.imagePos??"ডিফল্ট"),"","ব্যাখ্যা: HTTP 2xx/3xx হলে সার্ভার সাড়া দিচ্ছে। Response time বেশি হলে নেটওয়ার্ক বা hosting latency পরীক্ষা করা উচিত।");
    }
  }else if(category==="news"){
    const r=await fetch(site+"news-feed.json",{signal:AbortSignal.timeout(10000)});
    const raw=await r.text();let parsed;try{parsed=JSON.parse(raw)}catch{parsed=null}
    const arr=Array.isArray(parsed)?parsed:(parsed&&typeof parsed==="object"?Object.values(parsed).find(Array.isArray)||[]:[]);
    const latest=arr[0]||{};
    const headers={Accept:"application/vnd.github+json","User-Agent":"Kokushibu74-Control-Center","X-GitHub-Api-Version":"2022-11-28"};if(env.GITHUB_TOKEN)headers.Authorization="Bearer "+env.GITHUB_TOKEN;
    const runsResponse=await fetch("https://api.github.com/repos/Kokushibu74/kokushibu74.github.io/actions/workflows/update-news.yml/runs?per_page=10",{headers,signal:AbortSignal.timeout(10000)}).catch(()=>null);
    const runsData=runsResponse?await runsResponse.json().catch(()=>({})): {},runs=runsData.workflow_runs||[];
    if(index===1)lines.push("📡 Feed HTTP Status: "+r.status+" "+(r.ok?"(সফল response)":"(সমস্যা আছে)"),"📦 Feed Size: "+raw.length.toLocaleString("en-US")+" bytes","📰 Stored Articles: "+arr.length,"🕒 Latest Article: "+String(latest.title||latest.headline||"Not Available").slice(0,220),"⚙️ Automatic News Refresh: "+onOff(cfg.newsRefresh));
    else if(index===2){const last=runs[0];lines.push("🔄 NEWS REFRESH STATUS","Workflow API: "+(runsResponse?"HTTP "+runsResponse.status:"NOT AVAILABLE"),"Latest Run: "+String(last?.status||"Not Available"),"Conclusion: "+String(last?.conclusion||"Not Available"),"Branch: "+String(last?.head_branch||"Not Available"),"Started: "+String(last?.created_at||"Not Available"),"Run URL: "+String(last?.html_url||"Not Available"));}
    else if(index===3){
      const counts=new Map();
      for(const item of arr){let source=String(item.source||item.source_name||item.publisher||"").trim();if(!source){try{source=new URL(String(item.url||item.link||"")).hostname.replace(/^www\./,"")}catch{source="Unknown Source"}}counts.set(source,(counts.get(source)||0)+1);}
      const sources=[...counts.entries()].sort((a,b)=>b[1]-a[1]).slice(0,12);
      lines.push("🌍 NEWS SOURCE HEALTH","Sources detected: "+counts.size,"Articles checked: "+arr.length,...sources.map(([name,count])=>"• "+name+" · "+count+" articles"),"","Source availability is inferred from the stored feed; this is not a live publisher uptime test.");
    }else if(index===4){
      const failed=runs.filter(run=>run.conclusion==="failure"||run.conclusion==="timed_out");
      lines.push("⚠️ NEWS ERRORS","Workflow API: "+(runsResponse?"HTTP "+runsResponse.status:"NOT AVAILABLE"),...(failed.length?failed.slice(0,8).map(run=>"• "+run.name+" · "+run.conclusion+" · "+run.created_at+" · "+run.html_url):["• No failed News Refresh workflow runs in the latest 10 results."]));
    }else if(index===5){
      lines.push("🕘 NEWS REFRESH HISTORY","Workflow API: "+(runsResponse?"HTTP "+runsResponse.status:"NOT AVAILABLE"),...(runs.length?runs.slice(0,8).map(run=>"• "+run.created_at+" · "+run.status+(run.conclusion?" / "+run.conclusion:"")+" · "+run.head_branch+" · "+run.html_url):["• No workflow history available."]));
    }
  }else if(category==="analytics"){
    if(index===1){
      try{
        const ga4=await miniAppGa4Report(env),today=ga4.today||{},yesterday=ga4.yesterday||{};
        const rate=value=>value!==undefined&&value!==null?(Number(value)*100).toFixed(1)+"%":"Not Available";
        lines.push("📊 GOOGLE ANALYTICS 4 · Property "+ga4.propertyId,
          "📅 Today · Active Users: "+(today.activeUsers??"Not Available"),
          "🔁 Sessions: "+(today.sessions??"Not Available"),
          "👁️ Page Views: "+(today.pageViews??"Not Available"),
          "📈 Engagement Rate: "+rate(today.engagementRate),
          "","📅 Yesterday · Active Users: "+(yesterday.activeUsers??"Not Available"),
          "🔁 Sessions: "+(yesterday.sessions??"Not Available"),
          "👁️ Page Views: "+(yesterday.pageViews??"Not Available"),
          "📈 Engagement Rate: "+rate(yesterday.engagementRate),
          "","Source: Google Analytics Data API · GA4");
      }catch(e){lines.push("⚠️ GA4: NOT CONNECTED / NOT AVAILABLE","Details: "+String(e&&e.message||e).slice(0,180),"","এই রিপোর্টে Cloudflare KV-এর সংখ্যা GA4 হিসেবে দেখানো হচ্ছে না।");}
    }else{
      const day=bdDay(),a=await readDailyActivity(env,day),p=await readDailyActivity(env,previousBdDay(day));
      const change=(v,old)=>{const d=v-old;return (d>0?"+":"")+d+" ("+(d>0?"বৃদ্ধি":d<0?"কমেছে":"পরিবর্তন নেই")+")"};
      lines.push("📅 রিপোর্টের তারিখ: "+day+" (বাংলাদেশ সময়)","👤 Unique Visitors: "+a.unique,"   গতকালের তুলনায়: "+change(a.unique,p.unique),"🔁 Sessions: "+a.sessions,"   গতকালের তুলনায়: "+change(a.sessions,p.sessions),"👁️ Page Views: "+a.views,"   গতকালের তুলনায়: "+change(a.views,p.views),"⚠️ Client Errors: "+a.errors,"","🔥 জনপ্রিয় পেজ:",...(a.pages.length?a.pages.map((x,i)=>(i+1)+". "+x):["   এখনো কোনো Page View data নেই"]),"","🌍 শীর্ষ দেশ:",...(a.countries.length?a.countries.map(x=>"• "+x):["• তথ্য পাওয়া যায়নি"]),"📱 ডিভাইস:",...(a.devices.length?a.devices.map(x=>"• "+x):["• তথ্য পাওয়া যায়নি"]),"","ডেটার উৎস: Cloudflare Visitor KV। এটি GA4-এর Active Users বা GA4 Sessions নয়।");
    }
  }else if(category==="automation"){
    if(index===2){
      if(!env.CLOUDFLARE_API_TOKEN)lines.push("⚠️ Scheduled task source: NOT CONNECTED","CLOUDFLARE_API_TOKEN is unavailable.");
      else{
        const response=await fetch("https://api.cloudflare.com/client/v4/accounts/"+CF_MONITOR_ACCOUNT_ID+"/workers/scripts/portfolio-contact-telegram/schedules",{headers:{Authorization:"Bearer "+env.CLOUDFLARE_API_TOKEN},signal:AbortSignal.timeout(10000)}).catch(()=>null);
        const data=response?await response.json().catch(()=>({})): {};
        if(!response?.ok||data.success===false)lines.push("⚠️ Scheduled tasks: NOT AVAILABLE","Cloudflare API: "+(response?"HTTP "+response.status:"No response"),...(data.errors||[]).map(e=>String(e.message||e.code)));
        else lines.push("🗓 CLOUDFLARE CRON SCHEDULES",...(Array.isArray(data.result)&&data.result.length?data.result.map(x=>"• "+String(x.cron||"Unknown cron")):["• No cron schedules configured."]),"","Source: Cloudflare Workers Schedules API.");
      }
    }else if(index===3){
      lines.push("▶️ MANUAL ACTIONS","• Refresh Now: website/news refresh workflow dispatch","• News Refresh: can run even when automatic News Refresh is paused","• Automation switches: changes are stored in BOT_CONFIG_KV","No action was started from this information screen.");
    }else{
      lines.push("⚙️ AUTOMATION STATUS",...Object.entries(cfg).filter(([k,v])=>typeof v==="boolean").map(([k,v])=>"• "+k+": "+onOff(v)));
    }
  }else if(category==="security"){
    if(index===3){
      const events=await botSecurityEvents(env,12);
      lines.push("🛡️ RECENT SECURITY EVENTS",...(events.length?events.map(e=>"• "+new Date(e.at||0).toLocaleString("en-GB",{timeZone:"Asia/Dhaka"})+" BDT · "+String(e.type||"event")+" · "+String(e.visitorId||"Unknown visitor")+" · "+String(e.page||"Page unavailable")):["• No security event records are available yet."]),"","Source: append-only Visitor KV security:event:v1 records. This is not a full Cloudflare WAF or runtime audit log.");
    }else{
      const r=await fetch(site,{redirect:"follow",signal:AbortSignal.timeout(12000)}),h=r.headers;
      const checks=[["Content-Security-Policy (CSP)","content-security-policy"],["Strict-Transport-Security (HSTS)","strict-transport-security"],["X-Content-Type-Options","x-content-type-options"],["X-Frame-Options","x-frame-options"],["Referrer-Policy","referrer-policy"]];
      const present=checks.filter(x=>h.get(x[1])).map(x=>x[0]),missing=checks.filter(x=>!h.get(x[1])).map(x=>x[0]);
      lines.push("🌐 Homepage HTTP: "+r.status,"🛡️ Emergency Protection: "+onOff(cfg.emergencyProtection),"","✅ পাওয়া Security Headers:",...(present.length?present.map(x=>"• "+x):["• কোনো তালিকাভুক্ত Header পাওয়া যায়নি"]),"","⚠️ অনুপস্থিত / response-এ প্রকাশিত নয়:",...(missing.length?missing.map(x=>"• "+x):["• তালিকাভুক্ত সব Header পাওয়া গেছে"]),"","গুরুত্বপূর্ণ: Proxy বা hosting layer header যোগ/পরিবর্তন করতে পারে। এই quick check দিয়ে সাইট সম্পূর্ণ নিরাপদ—এমন সিদ্ধান্ত দেওয়া যায় না।");
    }
  }else if(category==="github"){
    const headers={Accept:"application/vnd.github+json","User-Agent":"Kokushibu74-Portfolio-MiniApp","X-GitHub-Api-Version":"2022-11-28"};
    if(env.GITHUB_TOKEN)headers.Authorization="Bearer "+env.GITHUB_TOKEN;
    const [repoRes,commitRes,runsRes]=await Promise.all([
      fetch("https://api.github.com/repos/Kokushibu74/kokushibu74.github.io",{headers,signal:AbortSignal.timeout(10000)}),
      fetch("https://api.github.com/repos/Kokushibu74/kokushibu74.github.io/commits?per_page=1",{headers,signal:AbortSignal.timeout(10000)}),
      fetch("https://api.github.com/repos/Kokushibu74/kokushibu74.github.io/actions/runs?per_page=5",{headers,signal:AbortSignal.timeout(10000)})
    ]);
    const repoData=await repoRes.json().catch(()=>({})),commits=await commitRes.json().catch(()=>[]),runsData=await runsRes.json().catch(()=>({}));
    const commit=Array.isArray(commits)?commits[0]:null,workflowRows=(runsData.workflow_runs||[]).slice(0,5).map(run=>"• "+String(run.name||"Workflow")+" · "+String(run.status||"unknown")+(run.conclusion?" / "+run.conclusion:"")+" · "+String(run.head_branch||"")+" · "+String(run.html_url||""));
    lines.push("📁 Repository: "+(repoData.full_name||"তথ্য পাওয়া যায়নি"),"🌿 Default Branch: "+(repoData.default_branch||"অজানা"),"🔐 Visibility: "+(repoData.private?"Private":"Public / অথবা API-তে private নয়"),"📡 Repository API: HTTP "+repoRes.status,"📡 Commit API: HTTP "+commitRes.status,"📡 Workflow API: HTTP "+runsRes.status,"","🧾 সর্বশেষ Commit: "+String(commit?.sha||"তথ্য পাওয়া যায়নি").slice(0,12),"💬 Commit Message: "+String(commit?.commit?.message||"তথ্য পাওয়া যায়নি").split("\n")[0].slice(0,200),"","⚙️ Latest GitHub Actions:",...(workflowRows.length?workflowRows:["• Workflow run data unavailable"]));
  }else if(category==="reports"){
    const day=bdDay(),a=await readDailyActivity(env,day);
    lines.push("⚙️ Daily Report: "+onOff(cfg.dailyReport),"⚙️ Website Monitoring: "+onOff(cfg.monitoring),"📅 আজকের তারিখ: "+day+" (বাংলাদেশ সময়)","👤 আজকের Unique Visitors: "+a.unique,"🔁 Sessions: "+a.sessions,"👁️ Page Views: "+a.views,"","🕚 নির্ধারিত রিপোর্ট সময়: রাত ১১টা (বাংলাদেশ সময়)","⏱️ Worker Cron: প্রতি ৩০ মিনিটে চলে; তাই রিপোর্ট নির্ধারিত সময়ের কাছাকাছি cron run-এ পাঠানো হয়।","ℹ️ Daily Report OFF করলে স্বয়ংক্রিয় দৈনিক রিপোর্ট তৈরি/পাঠানোর অংশ বন্ধ থাকবে।");
  }else if(category==="settings"){
    const names={monitoring:"Website Monitoring",dailyReport:"Daily Report",scheduledChecks:"Scheduled Checks",newsRefresh:"Automatic News Refresh",newsAlerts:"Bangladesh News Alerts",workflowAlerts:"Workflow Alerts",trafficAlerts:"Traffic Alerts",clientErrorAlerts:"Client Error Alerts",securityAlerts:"Security Alerts",emergencyProtection:"Emergency Protection"};
    lines.push("🔧 বর্তমান সেটিংস:",...Object.entries(cfg).filter(([k,v])=>typeof v==="boolean").map(([k,v])=>(v?"🟢":"⚪")+" "+(names[k]||k)+": "+(v?"ON — চালু":"OFF — বন্ধ")),"","💾 Configuration Storage: "+(env.BOT_CONFIG_KV?"সংযুক্ত (Connected)":"সংযুক্ত নয়"),"ℹ️ Automation ও Alerts মেনু থেকে সমর্থিত সুইচগুলো পরিবর্তন করা যায়।");
  }else if(category==="logs"){
    if(index===1){
      lines.push("🧩 WORKER EVENTS","Status: NOT AVAILABLE through the Telegram Bot data source.","Source: Cloudflare Workers → portfolio-contact-telegram → Observability → Logs.","User Manager History is not being presented as Worker Runtime Events.");
    }else if(index===2){
      if(!env.GITHUB_TOKEN)lines.push("⚠️ WORKFLOW LOGS: NOT CONNECTED","GitHub token binding unavailable.");
      else{
        const headers={Accept:"application/vnd.github+json","User-Agent":"Kokushibu74-Control-Center",Authorization:"Bearer "+env.GITHUB_TOKEN,"X-GitHub-Api-Version":"2022-11-28"};
        const response=await fetch("https://api.github.com/repos/Kokushibu74/kokushibu74.github.io/actions/runs?per_page=6",{headers,signal:AbortSignal.timeout(10000)});
        const data=await response.json().catch(()=>({}));
        if(!response.ok)lines.push("⚠️ WORKFLOW LOGS: NOT AVAILABLE","GitHub API HTTP "+response.status);
        else lines.push("⚙️ GITHUB ACTIONS · LATEST RUNS",...(data.workflow_runs||[]).map(run=>"• "+String(run.name||"Workflow")+" · "+String(run.status||"unknown")+(run.conclusion?" / "+run.conclusion:"")+" · "+String(run.head_branch||"")+" · "+String(run.html_url||"")));
      }
    }else if(index===3){
      const events=await botSecurityEvents(env,12);
      lines.push("🛡️ SECURITY LOGS",...(events.length?events.map(e=>"• "+new Date(e.at||0).toLocaleString("en-GB",{timeZone:"Asia/Dhaka"})+" BDT · "+String(e.type||"event")+" · "+String(e.visitorId||"Unknown visitor")+" · "+String(e.page||"Page unavailable")):["• No persistent security event records are available yet."]),"","Source: Visitor KV security:event:v1. Worker Runtime Logs remain a separate Cloudflare Observability source.");
    }else{
      const keys=await umList(env,UM_PREFIX+"history:",12),rows=[];
      for(const key of keys.slice(-8).reverse()){const v=await env.VISITOR_KV.get(key.name,"json");if(v)rows.push("• "+new Date(v.at||0).toLocaleString("en-GB",{timeZone:"Asia/Dhaka"})+" (BDT) · "+v.kind+" · "+String(v.event?.type||v.event?.command||"event"));}
      lines.push("🧾 USER MANAGER HISTORY:",...(rows.length?rows:["• কোনো সাম্প্রতিক User Event পাওয়া যায়নি"]));
    }
  }else if(category==="recovery"){
    lines.push("🧷 GitHub Backup Branch:","backup/pre-telegram-button-upgrade-20261101","🔗 Backup URL:","https://github.com/Kokushibu74/kokushibu74.github.io/tree/backup/pre-telegram-button-upgrade-20261101","","☁️ Worker Rollback:","Cloudflare Dashboard → Workers & Pages → portfolio-contact-telegram → Deployments","📌 পুরোনো Worker Version 34 rollback point হিসেবে রাখা আছে।","⚠️ Recovery করার আগে বর্তমান deployment ও backup যাচাই করুন। Rollback করলে নতুন পরিবর্তন হারাতে পারে।");
  }
  lines.push("","━━━━━━━━━━━━━━━━━━","প্রয়োজনে Main Menu থেকে অন্য বিভাগ নির্বাচন করুন।");
  return lines.join("\n");
}
async function botHandleCallback(env,query){
  const data=String(query.data||""),chatId=query.message?.chat?.id,sender=String(query.from?.id||"");
  if(!chatId||!data.startsWith("b1:"))return false;
  const admins=new Set(String(env.ADMIN_TELEGRAM_IDS||"").split(/[\s,;]+/).map(x=>x.trim()).filter(Boolean));
  if(query.message?.chat?.type!=="private"||!admins.has(sender)){
    await botAnswerCallback(env,query,"Admin access required",true);
    return true;
  }
  let action=data.slice(3);
  try{
    if(!botClaimCallback(query,action)){await botAnswerCallback(env,query,"এই Action ইতিমধ্যে প্রক্রিয়াধীন। একটু অপেক্ষা করুন।",true);return true;}
    const notificationAction=action.startsWith("alert:");
    if(notificationAction)action=action.slice(6);
    if(BOT_CALLBACK_ACTIVE.has(String(chatId))){await botAnswerCallback(env,query,"এই চ্যাটে আরেকটি Action চলছে। একটু অপেক্ষা করুন।",true);return true;}
    BOT_CALLBACK_ACTIVE.add(String(chatId));
    const callbackMessageId=Number(query.message?.message_id||0);
    if(callbackMessageId&&!notificationAction){
      BOT_CALLBACK_MESSAGE_ANCHORS.set(String(chatId),callbackMessageId);
      const currentAnchor=await botGetMenuAnchor(env,chatId);
      if(Number(currentAnchor?.messageId||0)!==callbackMessageId)await botRememberMenu(env,chatId,callbackMessageId);
    }
    if(action.startsWith("confirm:")||action.startsWith("cancel:")){
      await botAnswerCallback(env,query);
      const confirming=action.startsWith("confirm:"),token=action.slice(confirming?8:7),key="bot:confirm:v1:"+token;
      const pending=await env.BOT_CONFIG_KV?.get(key,"json");
      if(!pending||Number(pending.expiresAt)<Date.now()){await env.BOT_CONFIG_KV?.delete(key);await botSend(env,chatId,"⚠️ Confirmation expired or already used. Select the action again.",botBackKeyboard(),{forceNew:true});return true;}
      if(String(pending.adminId)!==sender||String(pending.chatId)!==String(chatId)){await botAnswerCallback(env,query,"This confirmation belongs to another admin session.",true);return true;}
      await env.BOT_CONFIG_KV.delete(key);
      if(!confirming){await botSend(env,chatId,"Action cancelled. No change was made.",botBackKeyboard(),{forceNew:true});return true;}
      await botRunWithProgress(env,chatId,"Confirmed User Manager action যাচাই ও সম্পন্ন করা হচ্ছে...",async()=>{await umHandleCommand(env,{text:String(pending.command||""),chat:{id:chatId,type:"private"},from:{id:Number(sender)}},{confirmed:true});});
      return true;
    }
    // The clicked inline message is now the active menu anchor for this callback.
    // Keep interaction metadata writes throttled while preserving idle cleanup.
    await botAnswerCallback(env,query);
    await botMarkMenuInteraction(env,chatId,notificationAction?null:query.message?.message_id,false);
    if(action==="home"||action==="start"){await env.BOT_CONFIG_KV?.delete("bot:user-input:"+sender);let registrationError="";try{await botRegisterCommands(env,chatId,true)}catch(e){registrationError=String(e&&e.message||e).slice(0,180);console.error("Telegram Start button command registration failed",registrationError)}await botEnsureStartKeyboard(env,chatId);await botShowMenu(env,chatId,undefined,registrationError);return true}
    if(action.startsWith("github:retry:")){
      const runId=action.slice("github:retry:".length);
      if(!/^\d{1,20}$/.test(runId)){await botSend(env,chatId,"Invalid GitHub workflow run ID.",botBackKeyboard(),{forceNew:true});return true;}
      if(!env.GITHUB_TOKEN){await botSend(env,chatId,"Retry unavailable: GitHub Actions write access is not connected to this Worker.",botBackKeyboard(),{forceNew:true});return true;}
      await botRunWithProgress(env,chatId,"GitHub-এর নির্দিষ্ট failed workflow run যাচাই করা হচ্ছে...",async()=>{
        const headers={Accept:"application/vnd.github+json","User-Agent":"Kokushibu74-Control-Center",Authorization:"Bearer "+env.GITHUB_TOKEN,"X-GitHub-Api-Version":"2022-11-28"};
        const check=await fetch("https://api.github.com/repos/Kokushibu74/kokushibu74.github.io/actions/runs/"+runId,{headers,signal:AbortSignal.timeout(10000)}),run=await check.json().catch(()=>({}));
        if(!check.ok||run.status!=="completed"||run.conclusion!=="failure"||!String(run.path||"").startsWith(".github/workflows/")){
          await botSend(env,chatId,"⚠️ Retry was not started. The run could not be verified as a completed failed workflow in this repository.\nGitHub HTTP: "+check.status,botBackKeyboard(),{forceNew:true});return;
        }
        const retry=await fetch("https://api.github.com/repos/Kokushibu74/kokushibu74.github.io/actions/runs/"+runId+"/rerun-failed-jobs",{method:"POST",headers,signal:AbortSignal.timeout(12000)});
        if(retry.status===201||retry.status===200)await botSend(env,chatId,"✅ GitHub accepted the failed-job retry.\nWorkflow: "+String(run.name||"Workflow")+"\nRun: "+String(run.html_url||"")+"\nThe retry is queued; completion is not yet verified.",botBackKeyboard(),{forceNew:true});
        else{const detail=await retry.text().catch(()=>"");await botSend(env,chatId,"⚠️ GitHub did not accept the retry. HTTP "+retry.status+" · "+detail.slice(0,180),botBackKeyboard(),{forceNew:true});}
      });return true;
    }
    if(action==="info:manual"){
      await botSend(env,chatId,"ℹ️ MANUAL REFRESH\n\nNews Refresh-এর জন্য Automation-এর newsRefresh schedule ON থাকা বাধ্যতামূলক নয়। Refresh Now বাটন প্রতিবার সরাসরি GitHub News Workflow চালু করার চেষ্টা করে এবং ফলাফল এই একই Message-এ দেখায়।",[[{text:"🔄 Refresh Now",callback_data:"b1:refresh"},{text:"⬅️ Automation",callback_data:"b1:automation"}]]);return true;
    }
    if(action==="refresh"){
      await botRunWithProgress(env,chatId,"ওয়েবসাইট ও News Feed যাচাই করে Refresh Workflow চালু করা হচ্ছে...",async()=>{
        const site="https://kokushibu74.github.io/",started=Date.now();
        let siteStatus="Unavailable",feedStatus="Not checked",articleCount=null,workflowStatus="Not started",workflowUrl="";
        try{const r=await fetch(site,{redirect:"follow",signal:AbortSignal.timeout(12000)});siteStatus="HTTP "+r.status+" · "+(Date.now()-started)+" ms";await r.body?.cancel();}
        catch(e){siteStatus="ERROR · "+String(e.message||e).slice(0,100)}
        try{const r=await fetch(site+"news-feed.json",{signal:AbortSignal.timeout(15000)});const raw=await r.text();let parsed;try{parsed=JSON.parse(raw)}catch{parsed=null}
          const list=Array.isArray(parsed)?parsed:(parsed&&typeof parsed==="object"?Object.values(parsed).find(Array.isArray)||[]:[]);
          articleCount=list.length;feedStatus="HTTP "+r.status+" · "+articleCount+" articles · "+raw.length+" bytes";}
        catch(e){feedStatus="ERROR · "+String(e.message||e).slice(0,100)}
        if(!env.GITHUB_TOKEN)workflowStatus="FAILED — GitHub token is not configured";
        else{const headers={Accept:"application/vnd.github+json","User-Agent":"Kokushibu74-Portfolio-MiniApp","Content-Type":"application/json","X-GitHub-Api-Version":"2022-11-28",Authorization:"Bearer "+env.GITHUB_TOKEN};
          try{const dispatch=await fetch("https://api.github.com/repos/Kokushibu74/kokushibu74.github.io/actions/workflows/update-news.yml/dispatches",{method:"POST",headers,body:JSON.stringify({ref:"main"}),signal:AbortSignal.timeout(15000)});
            if(dispatch.status===204){workflowStatus="TRIGGER ACCEPTED";
              for(let attempt=0;attempt<4;attempt++){await new Promise(resolve=>setTimeout(resolve,1200));
                const runsRes=await fetch("https://api.github.com/repos/Kokushibu74/kokushibu74.github.io/actions/workflows/update-news.yml/runs?event=workflow_dispatch&branch=main&per_page=5",{headers:{Accept:"application/vnd.github+json","User-Agent":"Kokushibu74-Portfolio-MiniApp",Authorization:"Bearer "+env.GITHUB_TOKEN,"X-GitHub-Api-Version":"2022-11-28"},signal:AbortSignal.timeout(10000)});
                if(!runsRes.ok)break;const data=await runsRes.json().catch(()=>({}));
                const run=(data.workflow_runs||[]).find(x=>Date.parse(x.created_at||"")>=started-5000);
                if(run){workflowStatus=String(run.status||"queued").toUpperCase()+(run.conclusion?" · "+String(run.conclusion).toUpperCase():"");workflowUrl=String(run.html_url||"");break;}}
              if(!workflowUrl)workflowStatus="TRIGGER ACCEPTED · GitHub run is being created";
            }else{const detail=await dispatch.text().catch(()=>"");workflowStatus="FAILED · GitHub HTTP "+dispatch.status+(detail?" · "+detail.slice(0,180):"");}}
          catch(e){workflowStatus="FAILED · "+String(e.message||e).slice(0,160)}}
        const lines=["🔄 MANUAL REFRESH RESULT","🌐 Website: "+siteStatus,"📰 News Feed: "+feedStatus,"⚙️ News Refresh Workflow: "+workflowStatus];
        if(workflowUrl)lines.push("🔗 Run: "+workflowUrl);if(articleCount===0)lines.push("⚠️ Feed-এ বর্তমানে কোনো Article পাওয়া যায়নি; Workflow শেষ হলে আবার পরীক্ষা করুন।");
        lines.push("ℹ️ Workflow trigger accepted মানে GitHub কাজ শুরুর অনুরোধ গ্রহণ করেছে; সম্পূর্ণ refresh শেষ হয়েছে—এমন নয়।");
        await botSend(env,chatId,lines.join("\n"),[[{text:"⬅️ Main Menu",callback_data:"b1:home"}]]);
      });return true;
    }
    if(action.startsWith("toggle:")){
      const key=action.split(":")[1],cfg=await botConfig(env);
      if(!(key in BOT_DEFAULTS)){await botSend(env,chatId,"Unknown setting.",botBackKeyboard());return true}
      cfg[key]=!cfg[key];await botSaveConfig(env,cfg);
      await botCategory(env,chatId,["monitoring","dailyReport","scheduledChecks"].includes(key)?"automation":"alerts");
      return true;
    }
    if(action==="automation"||action==="alerts"||action==="users"||action==="hero"){await botCategory(env,chatId,action);return true}
    if(BOT_MENU.concat(BOT_SECONDARY_MENU).some(([id])=>id===action)){await botCategory(env,chatId,action);return true}
    if(action==="users:list"||action.startsWith("users:list:")){const page=action.split(":")[2]||"1";await botRunWithProgress(env,chatId,"User Manager থেকে ব্যবহারকারীর তালিকা আনা হচ্ছে...",async()=>{await umHandleCommand(env,{text:"/userid "+page,chat:{id:chatId,type:"private"},from:{id:Number(sender)}})});return true}
    if(action==="users:linked"||action.startsWith("users:linked:")||action==="users:blocked"||action.startsWith("users:blocked:")){
      const mode=action.split(":")[1],pageNo=Math.max(1,Math.min(999,Number(action.split(":")[2])||1));
      const prefix=mode==="linked"?UM_PREFIX+"link:telegram:":UM_PREFIX+"block:";
      const keys=await umList(env,prefix,1000,5),limit=10,totalPages=Math.max(1,Math.ceil(keys.length/limit)),items=keys.slice((pageNo-1)*limit,pageNo*limit),rows=[];
      for(const key of items){
        if(mode==="linked"){
          const id=key.name.slice(prefix.length),link=await env.VISITOR_KV.get(key.name,"json"),profile=await umProfile(env,{kind:"telegram",id});
          rows.push({kind:"telegram",id,label:(profile?.username?"@"+profile.username:profile?.firstName||id)+" ↔ "+String(link?.visitorId||"unknown")});
        }else{
          const bits=key.name.slice(prefix.length).split(":"),kind=bits.shift()==="website"?"visitor":"telegram",id=bits.join(":"),profile=await umProfile(env,{kind,id});
          rows.push({kind,id,label:(profile?.username?"@"+profile.username:profile?.firstName||profile?.device?.deviceModel||id)+" · "+kind});
        }
      }
      const keyboard=rows.map(item=>[{text:String(item.label).slice(0,55),callback_data:"b1:users:profile:"+item.kind+":"+item.id+":"+pageNo}]);
      const nav=[];if(pageNo>1)nav.push({text:"⬅️ Previous",callback_data:"b1:users:"+mode+":"+(pageNo-1)});if(pageNo<totalPages)nav.push({text:"Next ➡️",callback_data:"b1:users:"+mode+":"+(pageNo+1)});if(nav.length)keyboard.push(nav);
      keyboard.push([{text:"⬅️ User Manager",callback_data:"b1:users"}]);
      await botSend(env,chatId,(mode==="linked"?"🔗 LINKED USERS":"🚫 BLOCKED USERS")+"\nPage "+pageNo+" / "+totalPages+" · "+keys.length+" records\n\n"+(rows.map((x,i)=>(i+1)+". "+x.label).join("\n")||"No records found.")+(keys.truncated?"\n\n⚠️ Listing capped at 5,000 records.":"")+"\n\nSelect a profile below.",keyboard,{forceNew:true});return true;
    }
    if(action.startsWith("users:searchpage:")){
      const bits=action.split(":"),token=bits[2],page=Math.max(1,Number(bits[3])||1),stored=await env.BOT_CONFIG_KV?.get("bot:user-search:"+token,"json");
      if(!stored||Number(stored.expiresAt)<Date.now()){await botSend(env,chatId,"Search session expired. Search again.",botBackKeyboard(),{forceNew:true});return true;}
      await umHandleCommand(env,{text:"/usersearch "+String(stored.query||"")+" "+page,chat:{id:chatId,type:"private"},from:{id:Number(sender)}});return true;
    }
    if(action==="users:history"){
      const keys=await umList(env,UM_PREFIX+"history:",1000,5),rows=[];
      for(const key of keys.slice(-15).reverse()){const event=await env.VISITOR_KV.get(key.name,"json");if(event)rows.push("• "+new Date(event.at||0).toLocaleString("en-GB",{timeZone:"Asia/Dhaka"})+" · "+event.kind+" · "+String(event.event?.type||event.event?.command||"event"));}
      await botSend(env,chatId,"🕘 USER MANAGER HISTORY\n"+(rows.join("\n")||"No history records found.")+(keys.truncated?"\n\n⚠️ History listing is capped at 5,000 records.":""),[[{text:"⬅️ User Manager",callback_data:"b1:users"}]],{forceNew:true});return true;
    }
    if(action.startsWith("users:profile:")){
      const bits=action.split(":"),kind=bits[2],id=String(bits[3]||""),pageNo=Math.max(1,Number(bits[4])||1),user=await umResolve(id);
      if(!user||user.kind!==kind){await botSend(env,chatId,"User profile not found.",botBackKeyboard(),{forceNew:true});return true;}
      const profile=await umProfile(env,user);if(!profile){await botSend(env,chatId,"User profile not found.",botBackKeyboard(),{forceNew:true});return true;}
      const type=kind==="visitor"?"website":"telegram",linkKind=kind==="visitor"?"visitor":"telegram",link=await env.VISITOR_KV.get(UM_PREFIX+"link:"+linkKind+":"+id,"json"),blocked=await umBlocked(env,type,id);
      const body=kind==="telegram"?["👤 USER PROFILE","Type: Telegram","Original ID: "+id,"Name: "+(profile.firstName||profile.username||"—"),"Custom ID: "+(profile.customId||"—"),"Linked Visitor ID: "+(link?.visitorId||"—"),"Blocked: "+(blocked?"Yes":"No"),"First seen: "+umTime(profile.firstSeen),"Last seen: "+umTime(profile.lastSeen)].join("\n"):umVisitorReport(id,profile);
      const keyboard=[[{text:"🕘 View History",callback_data:"b1:users:history:"+kind+":"+id+":1"}],[{text:"✏️ Rename",callback_data:"b1:users:rename:"+kind+":"+id}]];
      keyboard.push(link?.visitorId||link?.telegramId?[{text:"🔗 Unlink",callback_data:"b1:users:unlink:"+kind+":"+id}]:[{text:"🔗 Link",callback_data:"b1:users:link:"+kind+":"+id}]);
      keyboard.push(blocked?[{text:"✅ Unblock",callback_data:"b1:users:unblock:"+kind+":"+id}]:[{text:"🚫 Block",callback_data:"b1:users:block:"+kind+":"+id}]);
      keyboard.push([{text:"⬅️ Back to Directory",callback_data:"b1:users:list:"+pageNo}]);
      await botSend(env,chatId,body,keyboard,{forceNew:true});return true;
    }
    if(action.startsWith("users:history:")){
      const bits=action.split(":"),id=String(bits[3]||"");
      await botRunWithProgress(env,chatId,"নির্বাচিত User-এর history সংগ্রহ করা হচ্ছে...",async()=>{await umHandleCommand(env,{text:"/userhistory "+id+" "+(bits[4]||"1"),chat:{id:chatId,type:"private"},from:{id:Number(sender)}})});return true;
    }
    if(["rename","link","unlink","block","unblock"].includes(action.split(":")[1])&&action.startsWith("users:")&&action.split(":").length>=4){
      const bits=action.split(":"),mode=bits[1],kind=bits[2],id=String(bits[3]||"");
      if(mode==="unlink"||mode==="block"||mode==="unblock"){
        await botRunWithProgress(env,chatId,"নির্বাচিত User-এর পরিবর্তন নিশ্চিতকরণ তৈরি হচ্ছে...",async()=>{await umHandleCommand(env,{text:"/"+(mode==="unlink"?"userunlink":mode==="block"?"userblock":"userunblock")+" "+id,chat:{id:chatId,type:"private"},from:{id:Number(sender)}})});return true;
      }
      if(!env.BOT_CONFIG_KV){await botSend(env,chatId,"Input storage is unavailable.",botBackKeyboard());return true;}
      const prompt=mode==="rename"?"নতুন Custom ID পাঠান (৩–৩২ অক্ষর)।":(kind==="telegram"?"এই Telegram ID-এর সঙ্গে Visitor ID পাঠান।":"এই Visitor ID-এর সঙ্গে Telegram ID পাঠান।");
      await env.BOT_CONFIG_KV.put("bot:user-input:"+sender,JSON.stringify({mode,targetId:id,createdAt:Date.now()}),{expirationTtl:600});
      await botSend(env,chatId,prompt+"\n১০ মিনিটের মধ্যে উত্তর পাঠান।",botBackKeyboard(),{forceNew:true});return true;
    }
    if(action.startsWith("users:visitor:")){
      const parts=action.split(":"),id=String(parts[2]||"").toUpperCase(),page=Math.max(1,Math.min(999,Number(parts[3])||1)),directoryPage=Math.max(1,Math.min(999,Number(parts[4])||1));
      if(!/^VIS-[A-F0-9]{12}$/.test(id)){await botSend(env,chatId,"Invalid Visitor ID.",botBackKeyboard());return true}
      const profile=await umProfile(env,{kind:"visitor",id});
      if(!profile){await botSend(env,chatId,"Visitor profile not found.",botBackKeyboard());return true}
      const history=await umLocationHistory(env,id,page);
      await botSend(env,chatId,umVisitorReport(id,profile,history),umLocationReportKeyboard(id,history,directoryPage));
      return true;
    }
    if(action==="users:stats"){await botRunWithProgress(env,chatId,"User Manager-এর পরিসংখ্যান সংগ্রহ করা হচ্ছে...",async()=>{await umHandleCommand(env,{text:"/userstats",chat:{id:chatId,type:"private"},from:{id:Number(sender)}})});return true}
    if(["search","history","link","block","rename","visitorinfo"].includes(action.split(":")[1])&&action.startsWith("users:")){
      if(!env.BOT_CONFIG_KV){await botSend(env,chatId,"Configuration storage is unavailable.",botBackKeyboard());return true;}
      const mode=action.split(":")[1],prompts={search:"🔎 Search: নাম, Telegram ID বা Visitor ID পাঠান।",history:"🕘 History: Telegram ID বা Visitor ID পাঠান।",link:"🔗 Link/Unlink: TELEGRAM_ID VISITOR_ID লিখুন, অথবা unlink ID লিখুন।",block:"🚫 Block/Unblock: ID লিখুন; আনব্লক করতে unblock ID লিখুন।",rename:"✏️ Rename: ID CUSTOM_NAME লিখুন।",visitorinfo:"🔎 Visitor Information: VIS-XXXXXXXXXXXX লিখুন।"};
      await env.BOT_CONFIG_KV.put("bot:user-input:"+sender,JSON.stringify({mode,createdAt:Date.now()}),{expirationTtl:600});
      await botSend(env,chatId,prompts[mode]+"\n১০ মিনিটের মধ্যে উত্তর পাঠান।",botBackKeyboard());return true;
    }
    if(action.startsWith("hero:confirm:")){const token=action.slice("hero:confirm:".length);await botRunWithProgress(env,chatId,"অনুমোদিত Hero Image GitHub-এ প্রকাশ করা হচ্ছে...",async()=>{const result=await botCommitHero(env,token);await botSend(env,chatId,"✅ GitHub updated: "+result.imagePath+"\nPages deployment may take a few moments. Verify the live homepage before considering it complete.",botBackKeyboard());});return true;}
    if(action.startsWith("hero:cancel:")){const token=action.slice("hero:cancel:".length);await env.BOT_CONFIG_KV?.delete("hero:pending:"+token);await botSend(env,chatId,"Hero image update cancelled. Live image unchanged.",botBackKeyboard(),{forceNew:true});return true;}
    if(action==="hero:upload"){if(!env.BOT_CONFIG_KV){await botSend(env,chatId,"Configuration storage is not connected yet.",botBackKeyboard());return true;}await env.BOT_CONFIG_KV.put("hero:uploading:"+sender,JSON.stringify({at:Date.now()}),{expirationTtl:900});await botSend(env,chatId,"এখন Telegram-এ ছবিটি Photo হিসেবে পাঠান (File/Document নয়)। ১৫ মিনিটের মধ্যে পাঠাতে হবে।",botBackKeyboard(),{forceNew:true});return true}
    if(action==="hero:current"){await botRunWithProgress(env,chatId,"বর্তমান Hero Image-এর তথ্য আনা হচ্ছে...",async()=>{const d=await (await fetch("https://kokushibu74.github.io/site-data.json",{signal:AbortSignal.timeout(10000)})).json();await botSend(env,chatId,"Current hero image:\n"+String(d.image||"Not set")+"\nPosition: "+String(d.imagePos??"default"),botBackKeyboard());});return true}
    if(action.startsWith("status:")){const bits=action.split(":");const category=bits[1],index=Number(bits[2]||0);const names={website:["","Site Health","Worker Status","Contact Form","Diagnostics"],news:["","Latest Feed","Refresh Status","Source Health","News Errors","Refresh History"],analytics:["","GA4 Status","Visitor Summary","Traffic Overview"],security:["","Security Status","Critical Protection","Recent Security Events"],github:["","Repository Status","Latest Commit","Workflow Status"],automation:["","Automation Status","Scheduled Tasks","Manual Actions"],reports:["","Daily Report Status","Latest Report","Report History"],settings:["","Configuration Status","Admin Access","Bot Menu"],logs:["","Recent Worker Events","Workflow Logs","Security Logs","Recovery Guide"]};
       if(category==="logs"&&index===4)category="recovery";
       const label=names[category]?.[index]||"Status";
       await botSetContext(env,chatId,{section:category,view:"status",index,actionId:action,messageId:Number(query.message?.message_id||0)});await botRunWithProgress(env,chatId,"নির্বাচিত বিভাগের তথ্য সংগ্রহ ও যাচাই করা হচ্ছে...",async()=>{const result=await botStatusText(env,category,index);await botSend(env,chatId,"🔎 "+label+"\n"+result,botBackKeyboard());});return true;}
        await botShowMenu(env,chatId);
  }catch(e){const reason=String(e&&e.message||e).slice(0,180);console.error("Telegram button action failed; original message preserved and no replacement sent",String(e&&e.stack||e).slice(0,1600));try{const notice=await botTelegram(env,"sendMessage",{chat_id:chatId,text:botFormatTelegramResponse("⚠️ Button action failed.\n"+reason+"\n\nমূল Notification/Message অক্ষত রাখা হয়েছে।",{}),disable_web_page_preview:true,reply_markup:{inline_keyboard:botBackKeyboard()},reply_to_message_id:Number(query.message?.message_id||0)});if(!notice.ok)console.error("Telegram callback failure notice delivery failed",String(notice.data?.description||"Telegram API error").slice(0,240))}catch(noticeError){console.error("Telegram callback failure notice request failed",String(noticeError&&noticeError.message||noticeError).slice(0,240))}}finally{BOT_CALLBACK_MESSAGE_ANCHORS.delete(String(chatId));BOT_CALLBACK_ACTIVE.delete(String(chatId));try{await botMarkMenuInteraction(env,chatId,null,false)}catch(e){console.error("Telegram menu interaction metadata write failed",String(e&&e.stack||e).slice(0,800))}}
  return true;
}

async function umHandleCommand(env,msg,options={}){
  const text=String(msg.text||"").trim(),parts=text.split(/\s+/),cmd=(parts.shift()||"").split("@")[0].toLowerCase();
  const commands=new Set(["/start","/menu","/help","/cmd","/details","/health","/errors","/logs","/history","/sources","/traffic","/report","/userid","/userinfo","/userrename","/userlink","/userunlink","/userblock","/userunblock","/userhistory","/usersearch","/userstats"]);
  if(!commands.has(cmd))return false;
  const chatId=msg.chat.id,sender=String(msg.from?.id||"");
  if(msg.chat.type!=="private"){await umReply(env,chatId,"নিরাপত্তার জন্য এই কমান্ডগুলো Bot-এর Private Chat-এ ব্যবহার করুন।");return true;}
  const admins=new Set(String(env.ADMIN_TELEGRAM_IDS||"").split(/[\s,;]+/).map(x=>x.trim()).filter(Boolean));
  const isAdmin=admins.has(sender);
  if(cmd==="/start"||cmd==="/menu"){if(!botAllowStartMenu(chatId))return true;
    let registrationError="";
    try{await botRegisterCommands(env,chatId,isAdmin);}catch(e){registrationError=String(e&&e.message||e).slice(0,180);console.error("Telegram command registration failed",registrationError);}
    if(isAdmin)await botEnsureStartKeyboard(env,chatId);
    await botShowMenu(env,chatId,undefined,registrationError);
    await botMarkMenuInteraction(env,chatId,null,false);return true;}
  if(cmd==="/help"||cmd==="/cmd"){
    let registrationStatus="❌ Telegram command registration failed.";
    try{const registration=await botRegisterCommands(env,chatId,isAdmin);registrationStatus="✅ Telegram command menu registered and verified ("+registration.count+" commands).";}
    catch(e){registrationStatus="⚠️ Command registration error: "+String(e&&e.message||e).slice(0,180);console.error("Telegram command registration failed",registrationStatus);}
    const guide=[
      "📚 BOT COMMAND GUIDE",
      "",
      "/cmd বা /help — এই কমান্ড গাইড ও Telegram command menu দেখাবে।",
      registrationStatus,
      "",
      "👤 সাধারণ ব্যবহারকারী",
      "এই মুহূর্তে সাধারণ ব্যবহারকারীর জন্য কোনো অতিরিক্ত management command নেই।",
      ...(isAdmin?[
        "",
        "🔐 ADMIN COMMANDS (শুধু অনুমোদিত Admin)",
        "/info — Website ও Worker health check।",
        "/userid [পৃষ্ঠা] — Telegram user ও Website visitor তালিকা; প্রতি পৃষ্ঠায় ১০টি।",
        "/userinfo ID — নির্দিষ্ট user-এর profile, link ও status।",
        "/userrename ID CUSTOM — ৩–৩২ অক্ষরের custom ID দিন (A-Z, 0-9, _ বা -)।",
        "/userlink TELEGRAM_ID VISITOR_ID — দুই পরিচয় স্পষ্টভাবে link করুন।",
        "/userunlink ID — link বিচ্ছিন্ন করুন।",
        "/userblock ID [both|telegram|website] — user block করুন; default both।",
        "/userunblock ID [both|telegram|website] — block তুলে দিন।",
        "/userhistory ID [পৃষ্ঠা] — user-এর event history দেখুন।",
        "/usersearch TEXT — profile তথ্য দিয়ে user খুঁজুন।",
        "/userstats — Telegram, Website, block ও history totals।",
        "/details — বর্তমান Menu/Action-এর বিস্তারিত তথ্য।",
        "/health — Website Health।",
        "/errors ও /logs — উপলভ্য diagnostic/event logs।",
        "/history — সাম্প্রতিক User Manager history।",
        "/sources — News source/feed status।",
        "/traffic — Visitor KV traffic overview।",
        "/report — Daily report status।",
        "",
        "🛡️ Admin permission: ব্যক্তিগত Bot chat + ADMIN_TELEGRAM_IDS allowlist-এ থাকা Telegram ID আবশ্যক।",
        "🔗 Telegram ও Website ID স্বয়ংক্রিয়ভাবে merge হয় না; /userlink দিয়ে Admin-কে link করতে হবে।"
      ]:[
        "",
        "🔐 Admin-only management commands এই account-এ দেখানো হচ্ছে না।"
      ]),
      "",
      "ℹ️ নিরাপত্তা: এই গাইডে কোনো API token, secret বা credential প্রকাশ করা হয় না।"
    ];
    await botSend(env,chatId,guide.join("\n"),botMainKeyboard());
    return true;
  }
  if(["/details","/health","/errors","/logs","/history","/sources","/traffic","/report"].includes(cmd)){
    if(!isAdmin){await umReply(env,chatId,"⛔ এই তথ্য শুধু অনুমোদিত Admin দেখতে পারবেন।");return true;}
    let context=await botGetContext(env,chatId),section="website",index=1;
    if(cmd==="/details"){
      if(!context){await umReply(env,chatId,"এই Chat-এ কোনো সক্রিয় Section Context পাওয়া যায়নি। Main Menu থেকে একটি বিভাগ খুলুন।");return true;}
      section=context.section||"website";index=Number(context.index)||1;
      if(context.view==="category"){await botCategory(env,chatId,section);return true;}
    }else{
      const map={"/health":["website",1],"/errors":["logs",1],"/logs":["logs",1],"/history":["logs",4],"/sources":["news",3],"/traffic":["analytics",3],"/report":["reports",1]};
      [section,index]=map[cmd];
    }
    await botSetContext(env,chatId,{section,view:"status",index,actionId:"shortcut:"+cmd});
    await botRunWithProgress(env,chatId,"প্রাসঙ্গিক Section-এর তথ্য সংগ্রহ করা হচ্ছে...",async()=>{const detail=await botStatusText(env,section,index);await botSend(env,chatId,detail,botBackKeyboard());});
    return true;
  }
  if(!admins.size){await umReply(env,chatId,"Admin access এখনো configure করা হয়নি। Cloudflare Worker-এ ADMIN_TELEGRAM_IDS secret যোগ করতে হবে।");return true;}
  if(!isAdmin){await umHistory(env,"telegram",sender,{type:"admin_command_rejected",command:cmd});await umReply(env,chatId,"⛔ এই কমান্ড ব্যবহারের অনুমতি নেই।");return true;}
  const arg=parts[0]||"",scopeArg=(parts[1]||"both").toLowerCase();
  if(!options.confirmed&&["/userrename","/userlink","/userunlink","/userblock","/userunblock"].includes(cmd)){
    if(!env.BOT_CONFIG_KV){await umReply(env,chatId,"⚠️ Confirmation storage unavailable. Action was not performed.");return true;}
    const token=crypto.randomUUID(),key="bot:confirm:v1:"+token,expiresAt=Date.now()+300000;
    await env.BOT_CONFIG_KV.put(key,JSON.stringify({adminId:sender,chatId:String(chatId),command:text,expiresAt}),{expirationTtl:300});
    const descriptions={"/userrename":"Custom ID পরিবর্তন","/userlink":"Telegram ও Website identity link/relink","/userunlink":"Identity link বিচ্ছিন্ন","/userblock":"User block","/userunblock":"User unblock"};
    await umReply(env,chatId,"⚠️ CONFIRM ADMIN ACTION\n"+descriptions[cmd]+"\n\nTarget: "+(arg||"Not specified")+"\n\nএটি সম্পন্ন করতে Confirm চাপুন। ৫ মিনিটের মধ্যে নিশ্চিত না করলে বাতিল হবে।",[[{text:"✅ Confirm",callback_data:"b1:confirm:"+token},{text:"✖️ Cancel",callback_data:"b1:cancel:"+token}]],{forceNew:true});
    return true;
  }
  try{
    if(cmd==="/userid"){
      const pageNo=Math.max(1,Math.min(999,Number(arg)||1)),limit=10,all=[];
      const tg=await umList(env,UM_PREFIX+"telegram:"),vis=await umList(env,UM_PREFIX+"visitor:");
      for(const k of tg){const p=await env.VISITOR_KV.get(k.name,"json");if(p)all.push({kind:"telegram",id:p.id,customId:p.customId,name:p.username?"@"+p.username:p.firstName||"Telegram user"});}
      for(const k of vis){const p=await env.VISITOR_KV.get(k.name,"json");if(p)all.push({kind:"visitor",id:p.id||p.visitorId,customId:p.customId,name:p.device?.deviceModel||p.device?.deviceType||"Website visitor"});}
      const legacy=await umList(env,"visitor:");for(const k of legacy){const id=k.name.slice(8);if(!all.some(x=>x.kind==="visitor"&&x.id===id))all.push({kind:"visitor",id,name:"Website visitor"});}
      all.sort((a,b)=>String(a.id).localeCompare(String(b.id)));
      const start=(pageNo-1)*limit,items=all.slice(start,start+limit),totalPages=Math.max(1,Math.ceil(all.length/limit));
            const mdSpecial=new Set(["_","*","[","]","(",")","~",String.fromCharCode(96),">","#","+","-","=","|","{","}",".","!","\\"]);
      const mdSafe=v=>Array.from(String(v??"")).map(ch=>mdSpecial.has(ch)?"\\"+ch:ch).join("");
      const lines=items.map((u,i)=>{
        const label=mdSafe((start+i+1)+". "+(u.kind==="visitor"?"WEB":"TG"));
        return u.kind==="visitor"
          ?"*"+label+"* · "+mdSafe(u.name)+(u.customId?" · "+mdSafe(u.customId):"")
          :"*"+label+"* · "+mdSafe(u.id)+" · "+mdSafe(u.name);
      });
      const keyboard=items.filter(u=>u.kind==="visitor"&&/^VIS-[A-F0-9]{12}$/.test(String(u.id||""))).map(u=>[{text:String(u.id),callback_data:"b1:users:visitor:"+String(u.id)+":1:"+pageNo},{text:"Manage",callback_data:"b1:users:profile:visitor:"+String(u.id)+":"+pageNo}]);
       for(const u of items.filter(u=>u.kind==="telegram"&&u.id))keyboard.push([{text:String("TG "+(u.customId||u.name||u.id)).slice(0,55),callback_data:"b1:users:profile:telegram:"+String(u.id)+":"+pageNo}]);
      const nav=[];if(pageNo>1)nav.push({text:"⬅️ Previous",callback_data:"b1:users:list:"+(pageNo-1)});if(pageNo<totalPages)nav.push({text:"Next ➡️",callback_data:"b1:users:list:"+(pageNo+1)});if(nav.length)keyboard.push(nav);
      keyboard.push([{text:"⬅️ User Manager",callback_data:"b1:users"}]);
      const body="*👥 USER DIRECTORY*\nPage "+pageNo+" / "+totalPages+" · "+all.length+" users\n\n"+(lines.join("\n")||mdSafe("কোনো User পাওয়া যায়নি."))+"\n\n"+mdSafe("Visitor IDs are the clickable buttons below; tap one to open its report.");
      await umReply(env,chatId,body,keyboard,{parse_mode:"MarkdownV2"});
    }else if(cmd==="/userinfo"){
      const user=await umResolve(env,arg);if(!user){await umReply(env,chatId,"User পাওয়া যায়নি। Original ID বা Custom ID দিন।");return true;}
      const p=await umProfile(env,user)||{};
      if(user.kind==="visitor"){
        const history=await umLocationHistory(env,user.id,Number(parts[1])||1);
        await umReply(env,chatId,umVisitorReport(user.id,p,history),umLocationReportKeyboard(user.id,history));
      }else{const blocked=await umBlocked(env,"telegram",user.id),custom=p.customId||"—",link=await env.VISITOR_KV.get(UM_PREFIX+"link:telegram:"+user.id,"json");const lines=["👤 USER INFO","Type: telegram","Original ID: "+user.id,"Custom ID: "+custom,"Linked ID: "+(link?.visitorId||"—"),"Name: "+(p.firstName||p.username||"—"),"First seen: "+(p.firstSeen?new Date(p.firstSeen).toISOString():"—"),"Last seen: "+(p.lastSeen?new Date(p.lastSeen).toISOString():"—"),"Blocked: "+(blocked?"Yes":"No"),"Username: "+(p.username?"@"+p.username:"—"),"Language: "+(p.languageCode||"—")];await umReply(env,chatId,lines.join("\n"));}
    }else if(cmd==="/userrename"){
      const user=await umResolve(env,arg),custom=String(parts[1]||"").trim();
      if(!user||!custom||!/^[a-zA-Z0-9_-]{3,32}$/.test(custom)){await umReply(env,chatId,"ব্যবহার: /userrename ID CUSTOM (৩–৩২ অক্ষর; ইংরেজি, সংখ্যা, _ বা -)");return true;}
      const mapKey=UM_PREFIX+"custom:"+encodeURIComponent(custom.toLowerCase()),existing=await env.VISITOR_KV.get(mapKey,"json");
      if(existing&&(existing.kind!==user.kind||String(existing.id)!==user.id)){await umReply(env,chatId,"এই Custom ID আগে থেকেই ব্যবহৃত হচ্ছে।");return true;}
      const p=await umProfile(env,user)||{};if(p.customId)await env.VISITOR_KV.delete(UM_PREFIX+"custom:"+encodeURIComponent(String(p.customId).toLowerCase()));
      p.customId=custom;await env.VISITOR_KV.put(user.kind==="telegram"?UM_PREFIX+"telegram:"+user.id:UM_PREFIX+"visitor:"+user.id,JSON.stringify(p),{expirationTtl:31536000});
      await env.VISITOR_KV.put(mapKey,JSON.stringify(user),{expirationTtl:31536000});
      await umHistory(env,"admin",sender,{type:"rename",target:user,customId:custom});await umHistory(env,user.kind,user.id,{type:"custom_id_changed",customId:custom,by:sender});await umReply(env,chatId,"✅ Custom ID সেট হয়েছে: "+custom);
    }else if(cmd==="/userlink"){
      const tg=await umResolve(env,arg),web=await umResolve(env,parts[1]||"");
      if(!tg||!web||tg.kind!=="telegram"||web.kind!=="visitor"||!(await umProfile(env,tg))||!(await umProfile(env,web))){await umReply(env,chatId,"ব্যবহার: /userlink TELEGRAM_ID VISITOR_ID — দুই ID-ই আগে /userid-তে থাকতে হবে।");return true;}
      const tgLinkKey=UM_PREFIX+"link:telegram:"+tg.id,webLinkKey=UM_PREFIX+"link:visitor:"+web.id;
      const [oldTgLink,oldWebLink]=await Promise.all([env.VISITOR_KV.get(tgLinkKey,"json"),env.VISITOR_KV.get(webLinkKey,"json")]);
      if(oldTgLink?.visitorId&&oldTgLink.visitorId!==web.id){
        const oldReverseKey=UM_PREFIX+"link:visitor:"+oldTgLink.visitorId,oldReverse=await env.VISITOR_KV.get(oldReverseKey,"json");
        if(String(oldReverse?.telegramId)===tg.id)await env.VISITOR_KV.delete(oldReverseKey);
        await umHistory(env,"visitor",oldTgLink.visitorId,{type:"identity_unlinked",telegramId:tg.id,by:sender,reason:"relinked"});
      }
      if(oldWebLink?.telegramId&&oldWebLink.telegramId!==tg.id){
        const oldReverseKey=UM_PREFIX+"link:telegram:"+oldWebLink.telegramId,oldReverse=await env.VISITOR_KV.get(oldReverseKey,"json");
        if(String(oldReverse?.visitorId)===web.id)await env.VISITOR_KV.delete(oldReverseKey);
        await umHistory(env,"telegram",oldWebLink.telegramId,{type:"identity_unlinked",visitorId:web.id,by:sender,reason:"relinked"});
      }
      await env.VISITOR_KV.put(tgLinkKey,JSON.stringify({visitorId:web.id,linkedAt:Date.now(),by:sender}),{expirationTtl:31536000});
      await env.VISITOR_KV.put(webLinkKey,JSON.stringify({telegramId:tg.id,linkedAt:Date.now(),by:sender}),{expirationTtl:31536000});
      await umHistory(env,"admin",sender,{type:"link",telegramId:tg.id,visitorId:web.id});await umHistory(env,"telegram",tg.id,{type:"identity_linked",visitorId:web.id,by:sender});await umHistory(env,"visitor",web.id,{type:"identity_linked",telegramId:tg.id,by:sender});
      await umReply(env,chatId,"🔗 Telegram ও Website ID link হয়েছে।");
    }else if(cmd==="/userunlink"){
      const user=await umResolve(env,arg);if(!user){await umReply(env,chatId,"User পাওয়া যায়নি।");return true;}
      const kind=user.kind==="telegram"?"telegram":"visitor",key=UM_PREFIX+"link:"+kind+":"+user.id,link=await env.VISITOR_KV.get(key,"json");
      if(link){await env.VISITOR_KV.delete(key);await env.VISITOR_KV.delete(kind==="telegram"?UM_PREFIX+"link:visitor:"+link.visitorId:UM_PREFIX+"link:telegram:"+link.telegramId);await umHistory(env,"telegram",kind==="telegram"?user.id:link.telegramId,{type:"identity_unlinked",by:sender});await umHistory(env,"visitor",kind==="visitor"?user.id:link.visitorId,{type:"identity_unlinked",by:sender});}
      await umHistory(env,"admin",sender,{type:"unlink",target:user});
      await umReply(env,chatId,link?"🔗 Link বিচ্ছিন্ন করা হয়েছে।":"এই ID-র কোনো link ছিল না।");
    }else if(cmd==="/userblock"||cmd==="/userunblock"){
      const user=await umResolve(env,arg),scope=["both","telegram","website"].includes(scopeArg)?scopeArg:"both";
      if(!user){await umReply(env,chatId,"User পাওয়া যায়নি।");return true;}
      const link=await env.VISITOR_KV.get(UM_PREFIX+"link:"+(user.kind==="telegram"?"telegram":"visitor")+":"+user.id,"json");
      const targets=user.kind==="telegram"?{telegram:user.id,website:link?.visitorId}:{website:user.id,telegram:link?.telegramId};
      const scopes=scope==="both"?["telegram","website"]:[scope],active=cmd==="/userblock",available=scopes.filter(kind=>!!targets[kind]),missing=scopes.filter(kind=>!targets[kind]);
      if(missing.length&&scope!=="both"){await umReply(env,chatId,"এই User-এর linked "+missing[0]+" ID নেই। আগে /userlink TELEGRAM_ID VISITOR_ID দিয়ে link করুন।");return true;}
      for(const kind of available){const key=UM_PREFIX+"block:"+kind+":"+targets[kind];if(active)await env.VISITOR_KV.put(key,JSON.stringify({blockedAt:Date.now(),by:sender,reason:"Admin action"}),{expirationTtl:31536000});else await env.VISITOR_KV.delete(key);}
      await umHistory(env,"admin",sender,{type:active?"block":"unblock",target:user,scope,targets});for(const kind of available)await umHistory(env,kind==="website"?"visitor":"telegram",targets[kind],{type:active?"blocked":"unblocked",scope:kind,by:sender});
      await umReply(env,chatId,(active?"🚫 Blocked ":"✅ Unblocked ")+user.id+" · "+(missing.length?"শুধু "+available.join("+")+"; দুই scope-এর জন্য আগে ID link করুন":scope==="both"?"both":scope));
    }else if(cmd==="/userhistory"){
      const user=await umResolve(env,arg);if(!user){await umReply(env,chatId,"User পাওয়া যায়নি।");return true;}
      const pageNo=Math.max(1,Math.min(999,Number(parts[1])||1)),prefix=UM_PREFIX+"history:"+user.kind+":"+user.id+":",keys=await umList(env,prefix);
      const rows=[];for(const k of keys){const v=await env.VISITOR_KV.get(k.name,"json");if(v)rows.push(v);}
      rows.sort((a,b)=>(b.at||0)-(a.at||0));const pageSize=10,start=(pageNo-1)*pageSize,totalPages=Math.max(1,Math.ceil(rows.length/pageSize));
      const lines=rows.slice(start,start+pageSize).map(e=>new Date(e.at).toLocaleString("en-GB",{timeZone:"Asia/Dhaka"})+" · "+e.event.type+(e.event.command?" · "+e.event.command:"")+(e.event.path?" · "+e.event.path:""));
      const nav=[];if(pageNo>1)nav.push({text:"⬅️ Previous",callback_data:"b1:users:history:"+user.kind+":"+user.id+":"+(pageNo-1)});if(pageNo<totalPages)nav.push({text:"Next ➡️",callback_data:"b1:users:history:"+user.kind+":"+user.id+":"+(pageNo+1)});
      const keyboard=[];if(nav.length)keyboard.push(nav);keyboard.push([{text:"⬅️ User Profile",callback_data:"b1:users:profile:"+user.kind+":"+user.id+":1"}]);
      await umReply(env,chatId,"🕘 History "+user.id+" · "+rows.length+" events\n"+(lines.join("\n")||"কোনো history নেই.")+"\nPage "+pageNo+" / "+totalPages,keyboard,{forceNew:true});
    }else if(cmd==="/usersearch"){
      const hasPage=parts.length>1&&/^\d+$/.test(parts[parts.length-1]),pageNo=Math.max(1,Math.min(999,hasPage?Number(parts[parts.length-1]):1)),query=(hasPage?parts.slice(0,-1):parts).join(" ").trim(),q=query.toLowerCase();
      if(!q){await umReply(env,chatId,"ব্যবহার: /usersearch TEXT [PAGE]");return true;}
      const found=[],seen=new Set();
      for(const prefix of [UM_PREFIX+"telegram:",UM_PREFIX+"visitor:","visitor:"]){
        const keys=await umList(env,prefix,1000,5);
        for(const k of keys){
          const p=await env.VISITOR_KV.get(k.name,"json");if(!p||!JSON.stringify(p).toLowerCase().includes(q))continue;
          const kind=prefix==="visitor:"?"visitor":(prefix===UM_PREFIX+"telegram:"?"telegram":"visitor"),id=String(p.id||p.visitorId||k.name.slice(prefix.length)),identity=kind+":"+id;
          if(!id||seen.has(identity))continue;seen.add(identity);
          found.push({kind,id,label:String(p.customId||(p.username?"@"+p.username:"")||p.firstName||p.device?.deviceModel||id)});
        }
      }
      const pageSize=10,totalPages=Math.max(1,Math.ceil(found.length/pageSize)),items=found.slice((pageNo-1)*pageSize,pageNo*pageSize),token=crypto.randomUUID();
      if(env.BOT_CONFIG_KV)await env.BOT_CONFIG_KV.put("bot:user-search:"+token,JSON.stringify({query,expiresAt:Date.now()+600000}),{expirationTtl:600});
      const keyboard=items.map(u=>[{text:String((u.kind==="visitor"?"WEB ":"TG ")+u.label).slice(0,55),callback_data:"b1:users:profile:"+u.kind+":"+u.id+":1"}]);
      const nav=[];if(pageNo>1)nav.push({text:"⬅️ Previous",callback_data:"b1:users:searchpage:"+token+":"+(pageNo-1)});if(pageNo<totalPages)nav.push({text:"Next ➡️",callback_data:"b1:users:searchpage:"+token+":"+(pageNo+1)});if(nav.length)keyboard.push(nav);
      keyboard.push([{text:"⬅️ User Manager",callback_data:"b1:users"}]);
      await umReply(env,chatId,"🔎 SEARCH RESULTS · "+found.length+" matches\nQuery: "+query+"\nPage "+pageNo+" / "+totalPages+"\n\n"+(items.map((u,i)=>(i+1)+". "+u.kind+" · "+u.label).join("\n")||"কোনো match পাওয়া যায়নি."),keyboard,{forceNew:true});
    }else if(cmd==="/userstats"){
      const [tg,vis,legacy,blocks,hist]=await Promise.all([umList(env,UM_PREFIX+"telegram:"),umList(env,UM_PREFIX+"visitor:"),umList(env,"visitor:"),umList(env,UM_PREFIX+"block:"),umList(env,UM_PREFIX+"history:")]);
      const websiteCount=new Set([...vis.map(k=>k.name.slice((UM_PREFIX+"visitor:").length)),...legacy.map(k=>k.name.slice(8))]).size;
      await umReply(env,chatId,"📊 USER STATS\nTelegram profiles: "+tg.length+"\nWebsite profiles: "+websiteCount+"\nActive block records: "+blocks.length+"\nHistory records: "+hist.length);
    }
    await umHistory(env,"admin",sender,{type:"command",command:cmd,target:arg||null});
  }catch(e){console.error("User management command failed",String(e));await umReply(env,chatId,"⚠️ কমান্ডটি সম্পন্ন হয়নি। Worker log পরীক্ষা করতে হবে।");}
  return true;
}


function botB64(bytes){let s="";for(let i=0;i<bytes.length;i+=0x8000)s+=String.fromCharCode(...bytes.subarray(i,i+0x8000));return btoa(s)}
async function botTelegramPhoto(env,fileId){
  const g=await fetch("https://api.telegram.org/bot"+env.TELEGRAM_BOT_TOKEN+"/getFile?file_id="+encodeURIComponent(fileId));
  const gd=await g.json().catch(()=>({}));if(!g.ok||!gd.ok||!gd.result?.file_path)throw new Error("Telegram photo retrieval failed");
  const r=await fetch("https://api.telegram.org/file/bot"+env.TELEGRAM_BOT_TOKEN+"/"+gd.result.file_path);
  if(!r.ok)throw new Error("Telegram photo download failed");
  const bytes=new Uint8Array(await r.arrayBuffer());if(bytes.length>5*1024*1024)throw new Error("Hero image must be 5 MB or smaller");
  return bytes;
}
async function botCommitHero(env,token){
  if(!env.GITHUB_TOKEN||!env.BOT_CONFIG_KV)throw new Error("GitHub or configuration binding is unavailable");
  const key="hero:pending:"+token,pending=await env.BOT_CONFIG_KV.get(key,"json");
  if(!pending||pending.expiresAt<Date.now())throw new Error("Hero preview expired; upload the image again");
  const api="https://api.github.com/repos/Kokushibu74/kokushibu74.github.io/contents/";
  const headers={Authorization:"Bearer "+env.GITHUB_TOKEN,Accept:"application/vnd.github+json","User-Agent":"Kokushibu74-Portfolio-MiniApp","X-GitHub-Api-Version":"2022-11-28","Content-Type":"application/json"};
  const bytes=pending.base64?Uint8Array.from(atob(pending.base64),c=>c.charCodeAt(0)):await botTelegramPhoto(env,pending.fileId);
  const ext=pending.mimeType==="image/png"?"png":pending.mimeType==="image/webp"?"webp":"jpg";
  const imagePath="storage/pictures/hero-miniapp-"+Date.now()+"."+ext;
  const putImage=await fetch(api+imagePath,{method:"PUT",headers,body:JSON.stringify({message:"chore: update portfolio hero image",content:botB64(bytes),branch:"main"})});
  const imageResult=await putImage.json().catch(()=>({}));if(!putImage.ok)throw new Error("GitHub image upload failed (HTTP "+putImage.status+")");
  const dataRes=await fetch(api+"site-data.json?ref=main",{headers:{Authorization:"Bearer "+env.GITHUB_TOKEN,Accept:"application/vnd.github+json","User-Agent":"Kokushibu74-Portfolio-MiniApp"}});
  const current=await dataRes.json().catch(()=>({}));if(!dataRes.ok||!current.content||!current.sha)throw new Error("Could not read current site data from GitHub");
  const raw=atob(current.content.replace(/\s/g,"")),data=JSON.parse(new TextDecoder().decode(Uint8Array.from(raw,c=>c.charCodeAt(0))));
  data.image=imagePath;
  const content=botB64(new TextEncoder().encode(JSON.stringify(data,null,2)+"\n"));
  const putData=await fetch(api+"site-data.json",{method:"PUT",headers,body:JSON.stringify({message:"chore: set portfolio hero image",content,sha:current.sha,branch:"main"})});
  const dataResult=await putData.json().catch(()=>({}));if(!putData.ok)throw new Error("GitHub site-data update failed (HTTP "+putData.status+")");
  await env.BOT_CONFIG_KV.delete(key);
  return {imagePath,commit:dataResult.commit?.sha||imageResult.commit?.sha};
}
async function botHeroPreviewPage(env,token){
  const pending=await env.BOT_CONFIG_KV?.get("hero:pending:"+token,"json");
  if(!pending||pending.expiresAt<Date.now())return new Response("Preview expired",{status:410});
  const r=await fetch("https://kokushibu74.github.io/",{redirect:"follow"});
  if(!r.ok)return new Response("Website preview unavailable",{status:502});
  let html=await r.text();
  const injected='<base href="https://kokushibu74.github.io/"><script>(function(){const original=window.fetch.bind(window);window.fetch=async function(input,init){const response=await original(input,init);if(String(input).includes("site-data.json")&&response.ok){const data=await response.clone().json();data.image="'+new URL("/hero-preview-image?token="+encodeURIComponent(token),"https://portfolio-contact-telegram.mdshihab74.workers.dev").href+'";return new Response(JSON.stringify(data),{status:response.status,headers:{"Content-Type":"application/json"}})}return response}})();</script>';
  html=html.replace("</head>",injected+"</head>");
  return new Response(html,{headers:{"Content-Type":"text/html; charset=utf-8","Cache-Control":"no-store","X-Robots-Tag":"noindex, nofollow"}});
}
async function botHeroPreviewImage(env,token){
  const pending=await env.BOT_CONFIG_KV?.get("hero:pending:"+token,"json");
  if(!pending||pending.expiresAt<Date.now())return new Response("Preview expired",{status:410});
  try{
    const bytes=pending.base64?Uint8Array.from(atob(pending.base64),c=>c.charCodeAt(0)):await botTelegramPhoto(env,pending.fileId);
    return new Response(bytes,{headers:{"Content-Type":pending.mimeType||"image/jpeg","Cache-Control":"no-store","X-Content-Type-Options":"nosniff"}});
  }catch{return new Response("Image unavailable",{status:502})}
}

const MINIAPP_RATE_PREFIX = "miniapp:rate:v1:";
const MINIAPP_AUDIT_PREFIX = "miniapp:audit:v1:";
async function miniAppHmac(keyBytes,data){
  const key=await crypto.subtle.importKey("raw",keyBytes,{name:"HMAC",hash:"SHA-256"},false,["sign"]);
  return new Uint8Array(await crypto.subtle.sign("HMAC",key,data));
}
function miniAppHex(bytes){return Array.from(bytes,b=>b.toString(16).padStart(2,"0")).join("");}
async function miniAppAuthorize(initData,env){
  if(!env.TELEGRAM_BOT_TOKEN||!env.ADMIN_TELEGRAM_IDS)throw new Error("Admin authentication is not configured.");
  if(typeof initData!=="string"||initData.length<20||initData.length>8192)throw new Error("Invalid Telegram authentication data.");
  const params=new URLSearchParams(initData),received=params.get("hash");
  if(!received||!/^[a-f0-9]{64}$/i.test(received))throw new Error("Invalid Telegram signature.");
  const pairs=[];for(const [k,v] of params.entries())if(k!=="hash")pairs.push([k,v]);
  pairs.sort((a,b)=>a[0].localeCompare(b[0]));
  const check=pairs.map(([k,v])=>k+"="+v).join("\n");
  const te=new TextEncoder(),secret=await miniAppHmac(te.encode("WebAppData"),te.encode(env.TELEGRAM_BOT_TOKEN));
  const expected=miniAppHex(await miniAppHmac(secret,te.encode(check)));
  let diff=expected.length^received.length;
  for(let i=0;i<Math.max(expected.length,received.length);i++)diff|=(expected.charCodeAt(i)||0)^(received.toLowerCase().charCodeAt(i)||0);
  if(diff!==0)throw new Error("Telegram signature verification failed.");
  const authDate=Number(params.get("auth_date")),now=Math.floor(Date.now()/1000);
  if(!Number.isInteger(authDate)||authDate>now+60||now-authDate>3600)throw new Error("Telegram session expired. Close and reopen the Mini App.");
  let user;try{user=JSON.parse(params.get("user")||"null")}catch{throw new Error("Invalid Telegram user data.");}
  if(!user||!/^\d{5,20}$/.test(String(user.id||"")))throw new Error("Telegram user identity is missing.");
  const admins=new Set(String(env.ADMIN_TELEGRAM_IDS).split(/[\s,;]+/).map(x=>x.trim()).filter(Boolean));
  if(!admins.has(String(user.id)))throw new Error("Access denied. This Mini App is restricted to the configured administrator.");
  return user;
}
async function miniAppRateLimit(env,userId){
  if(!env.BOT_CONFIG_KV)throw new Error("Admin rate-limit storage is unavailable.");
  const bucket=Math.floor(Date.now()/60000),key=MINIAPP_RATE_PREFIX+userId+":"+bucket;
  const count=Number(await env.BOT_CONFIG_KV.get(key)||0);
  if(count>=60)throw new Error("Too many requests. Wait one minute and try again.");
  await env.BOT_CONFIG_KV.put(key,String(count+1),{expirationTtl:120});
}
async function miniAppAudit(env,userId,action,detail={}){
  if(!env.BOT_CONFIG_KV)throw new Error("Admin audit storage is unavailable.");
  const at=Date.now(),key=MINIAPP_AUDIT_PREFIX+at+":"+crypto.randomUUID();
  await env.BOT_CONFIG_KV.put(key,JSON.stringify({at,userId:String(userId),action,detail}),{expirationTtl:7776000});
}
const MINIAPP_CRON_PREFIX = "miniapp:cron:v1:";
const MINIAPP_CRON_INDEX_KEY = "miniapp:cron:index:v1";
async function miniAppCronRecord(env,entry){
  if(!env.BOT_CONFIG_KV)return null;
  const at=Number(entry.at||Date.now()),id=String(entry.id||crypto.randomUUID()),status=String(entry.status||"running");
  const key=MINIAPP_CRON_PREFIX+String(at).padStart(13,"0")+":"+id+":"+status;
  const value={id,at,status,cron:String(entry.cron||"unknown"),
    durationMs:Number.isFinite(entry.durationMs)?entry.durationMs:null,
    httpStatus:Number.isFinite(entry.httpStatus)?entry.httpStatus:null,
    detail:String(entry.detail||"").slice(0,180)};
  await env.BOT_CONFIG_KV.put(key,JSON.stringify(value),{expirationTtl:7776000});
  if(status!=="running"){
    const previous=await env.BOT_CONFIG_KV.get(MINIAPP_CRON_INDEX_KEY,"json").catch(()=>[]);
    const rows=Array.isArray(previous)?previous:[];
    const next=[value,...rows.filter(row=>row&&row.id!==id)].sort((a,b)=>b.at-a.at).slice(0,100);
    await env.BOT_CONFIG_KV.put(MINIAPP_CRON_INDEX_KEY,JSON.stringify(next),{expirationTtl:7776000});
  }
  return value;
}
async function miniAppCronAlert(env,cron,status,detail){
  if(!env.BOT_CONFIG_KV)return;
  const key="miniapp:cron-alert:v1:"+String(cron||"unknown").replace(/[^a-zA-Z0-9*_-]/g,"_");
  const previous=await env.BOT_CONFIG_KV.get(key,"json").catch(()=>null);
  const failed=["warning","failed","failure","interrupted"].includes(String(status).toLowerCase());
  const wasFailed=previous?.failed===true;
  const shouldNotify=failed?!wasFailed:(!failed&&wasFailed&&status==="success");
  if(!shouldNotify)return;
  if(!env.TELEGRAM_BOT_TOKEN||!env.TELEGRAM_CHAT_ID){console.error("Mini App cron alert could not be delivered: Telegram configuration unavailable");return;}
  const escape=s=>String(s||"").replace(/&/g,"&amp;").replace(/</g,"&lt;").replace(/>/g,"&gt;").slice(0,220);
  const title=failed?"🚨 <b>AUTOMATION FAILURE</b>":"✅ <b>AUTOMATION RECOVERED</b>";
  const body=[title,"⚙️ <b>Schedule:</b> <code>"+escape(cron)+"</code>","🕒 "+new Date().toLocaleString("en-GB",{timeZone:"Asia/Dhaka",dateStyle:"medium",timeStyle:"short"})+" (Bangladesh time)",(failed?"❌ ":"✅ ")+escape(detail||status)].join("\n");
  const response=await fetch("https://api.telegram.org/bot"+env.TELEGRAM_BOT_TOKEN+"/sendMessage",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({chat_id:env.TELEGRAM_CHAT_ID,text:body,parse_mode:"HTML",disable_web_page_preview:true,...(failed?{reply_markup:{inline_keyboard:[[{text:"Health",callback_data:"b1:status:website:1"},{text:"Diagnostics",callback_data:"b1:logs"}],[{text:"Automation",callback_data:"b1:automation"}]]}}:{})}),signal:AbortSignal.timeout(10000)});
  const payload=await response.json().catch(()=>({}));
  if(!response.ok||!payload.ok)throw new Error("Telegram automation alert failed (HTTP "+response.status+")");
  await env.BOT_CONFIG_KV.put(key,JSON.stringify({failed,at:Date.now(),status:String(status)}),{expirationTtl:7776000});
}
async function miniAppCronHistory(env){
  if(!env.BOT_CONFIG_KV)return [];
  const cutoff=Date.now()-86400000;
  let rows=await env.BOT_CONFIG_KV.get(MINIAPP_CRON_INDEX_KEY,"json");
  if(!Array.isArray(rows)){
    const page=await env.BOT_CONFIG_KV.list({prefix:MINIAPP_CRON_PREFIX,limit:1000});
    const keys=(page.keys||[]).filter(k=>{const stamp=Number(k.name.slice(MINIAPP_CRON_PREFIX.length).split(":")[0]);return Number.isFinite(stamp)&&stamp>=cutoff;});
    rows=(await Promise.all(keys.map(k=>env.BOT_CONFIG_KV.get(k.name,"json")))).filter(Boolean);
    rows=rows.sort((a,b)=>b.at-a.at).slice(0,100);
    await env.BOT_CONFIG_KV.put(MINIAPP_CRON_INDEX_KEY,JSON.stringify(rows),{expirationTtl:7776000});
  }
  return rows.filter(x=>x&&Number(x.at)>=cutoff).sort((a,b)=>b.at-a.at).slice(0,100).map(x=>({...x,status:x.status==="running"&&Date.now()-x.at>900000?"interrupted":x.status}));
}
async function miniAppDispatchNews(env){
  if(!env.GITHUB_TOKEN)throw new Error("GitHub workflow dispatch is not configured.");
  const headers={Accept:"application/vnd.github+json","User-Agent":"Kokushibu74-Portfolio-MiniApp","Content-Type":"application/json","X-GitHub-Api-Version":"2022-11-28",Authorization:"Bearer "+env.GITHUB_TOKEN};
  const response=await fetch("https://api.github.com/repos/Kokushibu74/kokushibu74.github.io/actions/workflows/update-news.yml/dispatches",{method:"POST",headers,body:JSON.stringify({ref:"main"}),signal:AbortSignal.timeout(15000)});
  if(response.status!==204)throw new Error("News workflow dispatch failed (HTTP "+response.status+").");
  return {accepted:true,workflow:"update-news.yml",branch:"main",url:"https://github.com/Kokushibu74/kokushibu74.github.io/actions/workflows/update-news.yml"};
}
async function miniAppHeroPrepare(env,userId,body){
  if(!env.GITHUB_TOKEN||!env.BOT_CONFIG_KV)throw new Error("Hero image storage is unavailable.");
  const mime=String(body?.mimeType||""),data=String(body?.base64||"");
  if(!["image/jpeg","image/png","image/webp"].includes(mime))throw new Error("Only JPEG, PNG and WebP images are supported.");
  if(!data||data.length>Math.ceil(4*1024*1024*4/3)+16||!/^[A-Za-z0-9+/]+={0,2}$/.test(data))throw new Error("Image must be 4 MB or smaller and valid base64.");
  const bytes=Uint8Array.from(atob(data),c=>c.charCodeAt(0));
  if(bytes.length<16||bytes.length>4*1024*1024)throw new Error("Image must be between 16 bytes and 4 MB.");
  const isJpeg=bytes[0]===0xff&&bytes[1]===0xd8&&bytes[2]===0xff;
  const isPng=bytes[0]===0x89&&bytes[1]===0x50&&bytes[2]===0x4e&&bytes[3]===0x47;
  const isWebp=String.fromCharCode(...bytes.slice(0,4))==="RIFF"&&String.fromCharCode(...bytes.slice(8,12))==="WEBP";
  if(!(mime==="image/jpeg"&&isJpeg||mime==="image/png"&&isPng||mime==="image/webp"&&isWebp))throw new Error("Image file content does not match its declared format.");
  const token=crypto.randomUUID(),expiresAt=Date.now()+10*60*1000;
  await env.BOT_CONFIG_KV.put("hero:pending:"+token,JSON.stringify({base64:data,mimeType:mime,userId:String(userId),expiresAt}),{expirationTtl:600});
  return {token,expiresAt,previewUrl:"https://portfolio-contact-telegram.mdshihab74.workers.dev/hero-preview?token="+encodeURIComponent(token)};
}
async function miniAppHeroConfirm(env,userId,token){
  if(!/^[0-9a-f-]{30,40}$/i.test(String(token||"")))throw new Error("Invalid or expired preview token.");
  const key="hero:pending:"+token,pending=await env.BOT_CONFIG_KV?.get(key,"json");
  if(!pending||pending.expiresAt<Date.now())throw new Error("Hero preview expired. Upload the image again.");
  if(String(pending.userId)!==String(userId))throw new Error("This preview belongs to another admin session.");
  const result=await botCommitHero(env,token);
  return {ok:true,...result};
}
async function miniAppGa4Report(env){
  if(!env.GA4_SERVICE_ACCOUNT_JSON)throw new Error("GA4_SERVICE_ACCOUNT_JSON secret is missing.");
  let sa;try{sa=JSON.parse(env.GA4_SERVICE_ACCOUNT_JSON)}catch{throw new Error("GA4 credentials secret is not valid JSON.");}
  if(!sa.client_email||!sa.private_key)throw new Error("GA4 service-account credentials are incomplete.");
  const enc=b=>btoa(String.fromCharCode(...new Uint8Array(b))).replace(/=/g,"").replace(/\+/g,"-").replace(/\//g,"_");
  const b64url=s=>btoa(s).replace(/=/g,"").replace(/\+/g,"-").replace(/\//g,"_");
  const te=new TextEncoder(),nowSec=Math.floor(Date.now()/1000);
  const header=b64url(JSON.stringify({alg:"RS256",typ:"JWT"}));
  const claim=b64url(JSON.stringify({iss:sa.client_email,scope:"https://www.googleapis.com/auth/analytics.readonly",aud:"https://oauth2.googleapis.com/token",iat:nowSec,exp:nowSec+3600}));
  const pem=sa.private_key.replace(/-----BEGIN PRIVATE KEY-----/,"").replace(/-----END PRIVATE KEY-----/,"").replace(/\s/g,"");
  const keyBytes=Uint8Array.from(atob(pem),c=>c.charCodeAt(0));
  const key=await crypto.subtle.importKey("pkcs8",keyBytes,{name:"RSASSA-PKCS1-v1_5",hash:"SHA-256"},false,["sign"]);
  const input=header+"."+claim,signature=await crypto.subtle.sign("RSASSA-PKCS1-v1_5",key,te.encode(input));
  const assertion=input+"."+enc(signature);
  const tokenRes=await fetch("https://oauth2.googleapis.com/token",{method:"POST",headers:{"Content-Type":"application/x-www-form-urlencoded"},body:new URLSearchParams({grant_type:"urn:ietf:params:oauth:grant-type:jwt-bearer",assertion})});
  const tokenData=await tokenRes.json().catch(()=>({}));
  if(!tokenRes.ok||!tokenData.access_token)throw new Error("Google token request failed: "+String(tokenData.error_description||tokenData.error||("HTTP "+tokenRes.status)).slice(0,180));
  const reportRes=await fetch("https://analyticsdata.googleapis.com/v1beta/properties/560673761:runReport",{method:"POST",headers:{"Authorization":"Bearer "+tokenData.access_token,"Content-Type":"application/json"},body:JSON.stringify({
    dateRanges:[{startDate:"today",endDate:"today"},{startDate:"yesterday",endDate:"yesterday"}],
    dimensions:[{name:"dateRange"}],metrics:[{name:"activeUsers"},{name:"sessions"},{name:"screenPageViews"},{name:"engagementRate"}]
  }),signal:AbortSignal.timeout(20000)});
  const report=await reportRes.json().catch(()=>({}));
  if(!reportRes.ok)throw new Error("GA4 report failed: "+String(report.error?.message||("HTTP "+reportRes.status)).slice(0,220));
  const result={today:null,yesterday:null,propertyId:"560673761",source:"Google Analytics Data API"};
  for(const row of report.rows||[]){
    const values=row.metricValues||[],key=row.dimensionValues?.[0]?.value==="date_range_1"?"yesterday":"today";
    result[key]={activeUsers:values[0]?.value??"0",sessions:values[1]?.value??"0",pageViews:values[2]?.value??"0",engagementRate:values[3]?.value??"0"};
  }
  return result;
}
async function miniAppModule(env,section){
  const allowed=["website","news","analytics","security","reports","settings"];
  if(allowed.includes(section))return {section,text:await botStatusText(env,section,0),source:"existing Worker checks"};
  if(section==="hero")return {section,text:"HERO IMAGE MANAGER\\n\\nবর্তমান Telegram Bot-এর Hero upload flow এখনো অক্ষত আছে। Mini App upload/preview/confirm action আলাদাভাবে প্রস্তুত করা হবে। এই পর্যায়ে কোনো image upload বা publish করা হচ্ছে না।",source:"existing Telegram Bot workflow"};
  if(section==="automation"||section==="alerts"){
    const cfg=await botConfig(env);
    const keys=section==="automation"?["monitoring","dailyReport","scheduledChecks","newsRefresh"]:["workflowAlerts","trafficAlerts","clientErrorAlerts","securityAlerts","emergencyProtection"];
    const names={monitoring:"Website Monitoring",dailyReport:"Daily Report",scheduledChecks:"Scheduled Health Checks",newsRefresh:"Automatic News Refresh",workflowAlerts:"GitHub Workflow Alerts",trafficAlerts:"Traffic Spike Alerts",clientErrorAlerts:"Client Error Alerts",securityAlerts:"Visitor Security Alerts",emergencyProtection:"Emergency Protection"};
    return {section,settings:keys.map(key=>({key,label:names[key],enabled:!!cfg[key]})),text:keys.map(key=>(cfg[key]?"ON":"OFF")+" · "+names[key]).join("\n"),source:"BOT_CONFIG_KV"};
  }
  if(section==="users"){
    const [telegram,visitors,legacy,blocks,history]=await Promise.all([umList(env,UM_PREFIX+"telegram:"),umList(env,UM_PREFIX+"visitor:"),umList(env,"visitor:"),umList(env,UM_PREFIX+"block:"),umList(env,UM_PREFIX+"history:")]);
    const websiteCount=new Set([...visitors.map(k=>k.name.slice((UM_PREFIX+"visitor:").length)),...legacy.map(k=>k.name.slice(8))]).size,limited=[telegram,visitors,legacy,blocks,history].some(list=>list.truncated);
    return {section,stats:{telegramProfiles:telegram.length,websiteProfiles:websiteCount,blockedRecords:blocks.length,historyRecords:history.length,limited},text:"USER MANAGER SUMMARY\\n\\nTelegram profiles: "+telegram.length+"\nWebsite profiles: "+websiteCount+"\nActive block records: "+blocks.length+"\nHistory records: "+history.length+(limited?"\n\\n⚠️ Partial snapshot: each category is capped at 2,000 records per request to protect Free KV usage. Search by exact ID for a specific profile.":"")+"\n\\nSearch a Telegram ID, Visitor ID or custom ID below to inspect a profile.",source:"VISITOR_KV"};
  }
  if(section==="recovery")return {section,...await miniAppRecovery(env)};
  if(section==="logs"){const rows=await miniAppRecentAudit(env);return {section,rows,text:rows.length?rows.map(x=>new Date(x.at).toISOString()+" · "+x.action+" · admin "+x.userId).join("\n"):"No Mini App audit events recorded yet.",source:"BOT_CONFIG_KV audit log"};}
  
  if(section==="github"){
    const headers={Accept:"application/vnd.github+json","User-Agent":"Kokushibu74-Portfolio-MiniApp","X-GitHub-Api-Version":"2022-11-28"};
    if(env.GITHUB_TOKEN)headers.Authorization="Bearer "+env.GITHUB_TOKEN;
    const r=await fetch("https://api.github.com/repos/Kokushibu74/kokushibu74.github.io/actions/runs?per_page=100",{headers,signal:AbortSignal.timeout(10000)});
    const d=await r.json().catch(()=>({}));
    if(!r.ok){
      const message=String(d.message||"No error message returned").slice(0,180);
      const remaining=r.headers.get("x-ratelimit-remaining"),limit=r.headers.get("x-ratelimit-limit"),reset=r.headers.get("x-ratelimit-reset");
      const permission=r.headers.get("x-accepted-github-permissions"),diagnostics=[];
      if(remaining!==null)diagnostics.push("rate limit "+remaining+"/"+(limit||"?"));
      if(reset&&Number.isFinite(Number(reset)))diagnostics.push("reset "+new Date(Number(reset)*1000).toISOString());
      if(permission)diagnostics.push("required permission "+permission.slice(0,120));
      throw new Error("GitHub Actions API returned HTTP "+r.status+": "+message+(diagnostics.length?" · "+diagnostics.join(" · "):""));
    }
    return {section,runs:(d.workflow_runs||[]).map(x=>({name:x.name,status:x.status,conclusion:x.conclusion||"pending",branch:x.head_branch,createdAt:x.created_at,updatedAt:x.updated_at,url:x.html_url})),source:"GitHub Actions API"};
  }
  throw new Error("Unsupported module.");
}
async function miniAppUserLookup(env,input){
  const user=await umResolve(env,input);if(!user)throw new Error("User not found. Use Telegram ID, Visitor ID or custom ID.");
  const profile=await umProfile(env,user);if(!profile)throw new Error("User profile not found.");
  const kind=user.kind==="telegram"?"telegram":"visitor",link=await env.VISITOR_KV.get(UM_PREFIX+"link:"+kind+":"+user.id,"json");
  const blocked=await umBlocked(env,kind,user.id);
  return {kind,id:user.id,customId:profile.customId||null,username:profile.username||null,firstName:profile.firstName||null,lastName:profile.lastName||null,firstSeen:profile.firstSeen||null,lastSeen:profile.lastSeen||null,blocked,linkedTelegramId:kind==="visitor"?link?.telegramId||null:link?.telegramId||user.id,linkedVisitorId:kind==="visitor"?user.id:link?.visitorId||null};
}
async function miniAppUserAction(env,adminId,operation,payload){
  if(operation==="link"){
    const tg=await umResolve(env,String(payload?.telegramId||"")),web=await umResolve(env,String(payload?.visitorId||""));
    if(!tg||!web||tg.kind!=="telegram"||web.kind!=="visitor"||!(await umProfile(env,tg))||!(await umProfile(env,web)))throw new Error("Both existing Telegram ID and Visitor ID profiles are required.");
    const tk=UM_PREFIX+"link:telegram:"+tg.id,wk=UM_PREFIX+"link:visitor:"+web.id;
    const [oldT,oldW]=await Promise.all([env.VISITOR_KV.get(tk,"json"),env.VISITOR_KV.get(wk,"json")]);
    if((oldT?.visitorId&&oldT.visitorId!==web.id)||(oldW?.telegramId&&oldW.telegramId!==tg.id))throw new Error("One of these profiles is already linked elsewhere. Unlink it first to avoid silently replacing an identity link.");
    await miniAppAudit(env,adminId,"userLink_attempt",{telegramId:tg.id,visitorId:web.id});
    await env.VISITOR_KV.put(tk,JSON.stringify({visitorId:web.id,linkedAt:Date.now(),by:String(adminId)}),{expirationTtl:31536000});
    await env.VISITOR_KV.put(wk,JSON.stringify({telegramId:tg.id,linkedAt:Date.now(),by:String(adminId)}),{expirationTtl:31536000});
    await umHistory(env,"admin",String(adminId),{type:"link",telegramId:tg.id,visitorId:web.id});return {ok:true,message:"Telegram and Website identities linked."};
  }
  const input=String(payload?.query||payload?.id||"").trim();
  const user=await umResolve(env,input);if(!user)throw new Error("User not found.");
  const kind=user.kind==="telegram"?"telegram":"visitor",profile=await umProfile(env,user);if(!profile)throw new Error("User profile not found.");
  if(operation==="rename"){
    const custom=String(payload?.customId||"").trim();if(!/^[a-zA-Z0-9_-]{3,32}$/.test(custom))throw new Error("Custom ID must be 3–32 English letters, numbers, underscore or hyphen.");
    const mapKey=UM_PREFIX+"custom:"+encodeURIComponent(custom.toLowerCase()),existing=await env.VISITOR_KV.get(mapKey,"json");
    if(existing&&(existing.kind!==user.kind||String(existing.id)!==user.id))throw new Error("That Custom ID is already in use.");
    await miniAppAudit(env,adminId,"userRename_attempt",{kind,userId:user.id,customId:custom});
    if(profile.customId)await env.VISITOR_KV.delete(UM_PREFIX+"custom:"+encodeURIComponent(String(profile.customId).toLowerCase()));
    profile.customId=custom;await env.VISITOR_KV.put(user.kind==="telegram"?UM_PREFIX+"telegram:"+user.id:UM_PREFIX+"visitor:"+user.id,JSON.stringify(profile),{expirationTtl:31536000});
    await env.VISITOR_KV.put(mapKey,JSON.stringify(user),{expirationTtl:31536000});await umHistory(env,"admin",String(adminId),{type:"rename",target:user,customId:custom});
    return {ok:true,message:"Custom ID updated.",user:await miniAppUserLookup(env,input)};
  }
  if(operation==="block"||operation==="unblock"){
    const scope=["both","telegram","website"].includes(payload?.scope)?payload.scope:"both";
    const link=await env.VISITOR_KV.get(UM_PREFIX+"link:"+kind+":"+user.id,"json");
    const targets=kind==="telegram"?{telegram:user.id,website:link?.visitorId}:{website:user.id,telegram:link?.telegramId};
    const scopes=scope==="both"?["telegram","website"]:[scope],available=scopes.filter(k=>!!targets[k]),missing=scopes.filter(k=>!targets[k]);
    if(!available.length)throw new Error("No linked account exists for the selected block scope.");
    if(missing.length&&scope!=="both")throw new Error("The requested linked account does not exist.");
    await miniAppAudit(env,adminId,"user"+operation+"_attempt",{kind,userId:user.id,scope});
    for(const k of available){const key=UM_PREFIX+"block:"+k+":"+targets[k];if(operation==="block")await env.VISITOR_KV.put(key,JSON.stringify({blockedAt:Date.now(),by:String(adminId),reason:"Mini App admin action"}),{expirationTtl:31536000});else await env.VISITOR_KV.delete(key);}
    await umHistory(env,"admin",String(adminId),{type:operation,target:user,scope,targets});
    return {ok:true,message:operation+" completed.",user:await miniAppUserLookup(env,input)};
  }
  if(operation==="unlink"){
    const key=UM_PREFIX+"link:"+kind+":"+user.id,link=await env.VISITOR_KV.get(key,"json");
    if(!link)throw new Error("This profile has no linked identity.");
    await miniAppAudit(env,adminId,"userUnlink_attempt",{kind,userId:user.id});
    await env.VISITOR_KV.delete(key);await env.VISITOR_KV.delete(kind==="telegram"?UM_PREFIX+"link:visitor:"+link.visitorId:UM_PREFIX+"link:telegram:"+link.telegramId);
    await umHistory(env,"admin",String(adminId),{type:"unlink",target:user});return {ok:true,message:"Identity link removed."};
  }
  throw new Error("Unsupported User Manager operation.");
}
async function miniAppUserHistory(env,input){
  const user=await umResolve(env,input);if(!user)throw new Error("User not found.");
  const prefix=UM_PREFIX+"history:"+user.kind+":"+user.id+":";const keys=await umList(env,prefix);const rows=[];
  for(const key of keys){const row=await env.VISITOR_KV.get(key.name,"json");if(row)rows.push({at:row.at,event:row.event||{}});}
  return rows.sort((a,b)=>b.at-a.at).slice(0,30);
}
async function miniAppRecovery(env){
  const headers={Accept:"application/vnd.github+json","User-Agent":"Kokushibu74-Portfolio-MiniApp","X-GitHub-Api-Version":"2022-11-28"};if(env.GITHUB_TOKEN)headers.Authorization="Bearer "+env.GITHUB_TOKEN;
  const r=await fetch("https://api.github.com/repos/Kokushibu74/kokushibu74.github.io/branches?per_page=100",{headers,signal:AbortSignal.timeout(10000)});
  if(!r.ok)throw new Error("GitHub branch verification failed (HTTP "+r.status+").");
  const branches=await r.json(),backups=(Array.isArray(branches)?branches:[]).filter(x=>x.name.startsWith("backup/")).map(x=>({name:x.name,sha:x.commit?.sha||null}));
  return {backups,source:"GitHub branches API",note:"Backup references are listed only when GitHub confirms they exist. No rollback is triggered from this read-only view."};
}
let miniAppAuditCache={expiresAt:0,rows:[]};
async function miniAppRecentAudit(env){
  if(!env.BOT_CONFIG_KV)throw new Error("Audit storage is unavailable.");
  const now=Date.now();
  if(miniAppAuditCache.expiresAt>now)return miniAppAuditCache.rows;
  const page=await env.BOT_CONFIG_KV.list({prefix:MINIAPP_AUDIT_PREFIX,limit:100}),rows=[];
  for(const key of page.keys||[]){const item=await env.BOT_CONFIG_KV.get(key.name,"json");if(item)rows.push(item);}
  const result=rows.sort((a,b)=>b.at-a.at).slice(0,30).map(x=>({at:x.at,userId:x.userId,action:x.action,detail:x.detail||{}}));
  miniAppAuditCache={expiresAt:now+30_000,rows:result};
  return result;
}
async function miniAppOverview(env,user){
  const started=performance.now();
  let site={ok:false,status:"UNKNOWN",detail:"Check unavailable",responseMs:null};
  try{const r=await fetch("https://kokushibu74.github.io/",{redirect:"follow",signal:AbortSignal.timeout(10000)});site={ok:r.ok,status:"HTTP "+r.status,detail:r.ok?"Portfolio reachable":"Portfolio returned HTTP "+r.status,responseMs:Math.round(performance.now()-started)};await r.body?.cancel();}catch(e){site={ok:false,status:"ERROR",detail:String(e&&e.message||e).slice(0,120),responseMs:Math.round(performance.now()-started)};}
  let news={ok:false,status:"UNKNOWN",detail:"Feed check unavailable"};
  try{const r=await fetch("https://kokushibu74.github.io/news-feed.json",{redirect:"follow",signal:AbortSignal.timeout(10000)});let d=null;try{d=await r.json()}catch{}news={ok:r.ok&&!!d&&typeof d==="object",status:"HTTP "+r.status,detail:r.ok&&d?"News feed reachable":"News feed unavailable"};}catch(e){news={ok:false,status:"ERROR",detail:String(e&&e.message||e).slice(0,100)};}
  let bot={ok:false,status:"UNKNOWN",detail:"Telegram Bot check unavailable"};
  try{const r=await fetch("https://api.telegram.org/bot"+env.TELEGRAM_BOT_TOKEN+"/getMe",{signal:AbortSignal.timeout(8000)});const d=await r.json();bot={ok:!!(r.ok&&d.ok),status:r.ok&&d.ok?"CONNECTED":"ERROR",detail:d.result?.username?"@"+d.result.username:"Telegram API check failed"};}catch(e){bot={ok:false,status:"ERROR",detail:String(e&&e.message||e).slice(0,100)};}
  const cfg=await botConfig(env);let activity=null;
  try{activity=await readDailyActivity(env,bdDay());}catch{}
  const keys=Object.keys(BOT_DEFAULTS),enabled=keys.filter(k=>!!cfg[k]).length;
  return {
    ok:true,user:{id:String(user.id),first_name:String(user.first_name||""),username:String(user.username||"")},
    overview:{site:{status:site.status,detail:site.detail},visitors:{today:activity?.unique??null,views:activity?.views??null},automation:{enabled:enabled+"/"+keys.length}},
    services:[
      {name:"Portfolio Website",status:site.status,detail:site.responseMs===null?site.detail:site.detail+" · "+site.responseMs+" ms",ok:site.ok},
      {name:"News Feed",status:news.status,detail:news.detail,ok:news.ok},
      {name:"Telegram Bot API",status:bot.status,detail:bot.detail,ok:bot.ok},
      {name:"Cloudflare KV",status:env.BOT_CONFIG_KV&&env.VISITOR_KV?"BOUND":"MISSING",detail:"Required control and visitor stores",ok:!!(env.BOT_CONFIG_KV&&env.VISITOR_KV)}
    ],
    config:Object.fromEntries(keys.map(k=>[k,!!cfg[k]])),
    privacy:{visitorRecordsReturned:false,personalVisitorDataReturned:false}
  };
}

const CONTACT_RATE_LIMIT_MAX=5,CONTACT_RATE_LIMIT_WINDOW_MS=10*60*1000,TRACK_RATE_LIMIT_MAX=120,TRACK_RATE_LIMIT_WINDOW_MS=60*1000;
const CONTACT_RATE_LIMIT=new Map();
function ipRateLimit(request,scope,max,windowMs,now=Date.now()){
  const ip=request.headers.get("CF-Connecting-IP");
  if(!ip)return {allowed:true};
  const key=scope+":"+ip;
  let bucket=CONTACT_RATE_LIMIT.get(key);
  if(!bucket||bucket.resetAt<=now)bucket={count:0,resetAt:now+windowMs};
  if(bucket.count>=max)return {allowed:false,retryAfter:Math.max(1,Math.ceil((bucket.resetAt-now)/1000))};
  bucket.count++;
  CONTACT_RATE_LIMIT.set(key,bucket);
  if(CONTACT_RATE_LIMIT.size>2048){
    for(const [key,value] of CONTACT_RATE_LIMIT)if(value.resetAt<=now)CONTACT_RATE_LIMIT.delete(key);
    if(CONTACT_RATE_LIMIT.size>2048)CONTACT_RATE_LIMIT.delete(CONTACT_RATE_LIMIT.keys().next().value);
  }
  return {allowed:true,remaining:max-bucket.count};
}

async function newsRefreshWatchdog(env){
  if(!env.GITHUB_TOKEN||!env.BOT_CONFIG_KV)return {skipped:true};
  const cfg=await botConfig(env);
  if(cfg.newsRefresh!==true)return {skipped:true,reason:"disabled"};
  const now=Date.now(),cooldownKey="news-watchdog:last-dispatch",dispatchBlockedKey="news-watchdog:dispatch-blocked";
  const blocked=await env.BOT_CONFIG_KV.get(dispatchBlockedKey,"json").catch(()=>null);
  if(Number(blocked?.at)>0&&now-Number(blocked.at)<60*60*1000)return {skipped:true,reason:"dispatch-backoff",status:Number(blocked.status)||403};
  const lastDispatch=Number(await env.BOT_CONFIG_KV.get(cooldownKey));
  if(Number.isFinite(lastDispatch)&&lastDispatch>0&&now-lastDispatch<20*60*1000)return {skipped:true,reason:"cooldown"};
  const headers={Accept:"application/vnd.github+json","User-Agent":"Kokushibu74-Portfolio-MiniApp","X-GitHub-Api-Version":"2022-11-28",Authorization:"Bearer "+env.GITHUB_TOKEN};
  const statusResponse=await fetch("https://api.github.com/repos/Kokushibu74/kokushibu74.github.io/actions/workflows/update-news.yml/runs?branch=main&per_page=1",{headers,signal:AbortSignal.timeout(10000)});
  if(!statusResponse.ok)throw new Error("GitHub news workflow status check failed (HTTP "+statusResponse.status+")");
  const data=await statusResponse.json().catch(()=>({}));
  const latest=(data.workflow_runs||[])[0],created=Date.parse(latest?.created_at||""),age=Number.isFinite(created)?now-created:Infinity;
  await env.BOT_CONFIG_KV.delete("news-watchdog:last-error").catch(()=>{});
  if(latest&&age<20*60*1000)return {skipped:true,reason:"recent-run",ageMinutes:Math.round(age/60000)};
  if(latest&&["queued","in_progress"].includes(latest.status)&&age<30*60*1000)return {skipped:true,reason:"already-running"};
  let dispatchResult;
  try{
    dispatchResult=await dispatchNewsWorkflow(env.GITHUB_TOKEN);
  }catch(error){
    if(Number(error?.status)===403)await env.BOT_CONFIG_KV.put(dispatchBlockedKey,JSON.stringify({status:403,at:now}),{expirationTtl:3600});
    throw error;
  }
  await env.BOT_CONFIG_KV.delete(dispatchBlockedKey);
  await env.BOT_CONFIG_KV.delete("news-watchdog:last-error").catch(()=>{});
  await env.BOT_CONFIG_KV.put(cooldownKey,String(now),{expirationTtl:60*60});
  return {dispatched:true,ageMinutes:Number.isFinite(age)?Math.round(age/60000):null,dispatchAttempts:dispatchResult.attempts,verifiedAfterAmbiguousResponse:!!dispatchResult.verified};
}
async function notifyNewsWatchdogFailure(env,error){
  if(!env.BOT_CONFIG_KV||!env.TELEGRAM_BOT_TOKEN||!env.TELEGRAM_CHAT_ID)return;
  const key="news-watchdog:last-error";
  if(await env.BOT_CONFIG_KV.get(key))return;
  await env.BOT_CONFIG_KV.put(key,"1",{expirationTtl:6*60*60});
  const detail=String(error?.message||"").replace(/[\r\n\t]+/g," ").slice(0,220);
  const transient=/temporarily failed|temporary GitHub API/i.test(detail);
  const guidance=transient?"GitHub returned a temporary server error. Token permission is not confirmed as the cause; the watchdog will retry on its next check.":"For HTTP 401/403/404/422, verify the Worker GITHUB_TOKEN and repository Actions workflow permissions.";
  const message="⚠️ News refresh watchdog could not verify or trigger the GitHub refresh workflow."+(detail?"\nGitHub response: "+detail:"")+"\n"+guidance;
  const response=await fetch("https://api.telegram.org/bot"+env.TELEGRAM_BOT_TOKEN+"/sendMessage",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({chat_id:env.TELEGRAM_CHAT_ID,text:message,disable_web_page_preview:true,reply_markup:{inline_keyboard:[[{text:"Details",callback_data:"b1:alert:news"},{text:"Logs",callback_data:"b1:alert:logs"}],[{text:"Retry News Refresh",callback_data:"b1:alert:refresh"}]]}}),signal:AbortSignal.timeout(10000)});
  if(!response.ok)throw new Error("Telegram watchdog warning delivery failed (HTTP "+response.status+")");
}


const NEWS_ALERT_TTL=14*86400;
const OFFICIAL_DISASTER_PAGES=[
  {name:"Department of Disaster Management (DDM)",url:"https://rapid.ddm.gov.bd/home/weather/"},
  {name:"Bangladesh Meteorological Department (BMD)",url:"https://www.bmd.gov.bd/web/en/warning"},
  {name:"Flood Forecasting & Warning Centre (FFWC)",url:"https://ffwc.gov.bd/"}
];
async function loadOfficialDisasterPages(){
  return Promise.all(OFFICIAL_DISASTER_PAGES.map(async source=>{
    try{
      const response=await fetch(source.url,{headers:{"Accept":"text/html,application/xhtml+xml"},signal:AbortSignal.timeout(8000)});
      if(!response.ok)return null;
      return {...source,html:await response.text()};
    }catch{return null;}
  }));
}
function officialDisasterConfirmation(item,now,pages){
  for(const source of pages||[]){
    if(!source)continue;
    const evidence=parseOfficialDisasterSignal(source.html,item,now,source.name,source.url);
    if(evidence.confirmed)return evidence;
  }
  return {confirmed:false};
}
async function sendNewsAlertMedia(env,item,caption,link){
  const token=env.TELEGRAM_BOT_TOKEN,chatId=env.TELEGRAM_CHAT_ID;
  const candidates=mediaCandidates(item);
  const send=async(method,body)=>{
    try{
      const response=await fetch("https://api.telegram.org/bot"+token+"/"+method,{
        method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({chat_id:chatId,...body}),
        signal:AbortSignal.timeout(15000)
      });
      const result=await response.json().catch(()=>({}));
      return response.ok&&result.ok===true;
    }catch{return false;}
  };
  const result=await deliverWithMediaFallback(candidates,caption,link,send);
  if(result!=="text"&&link.length>220){
    if(!await send("sendMessage",{text:"🔗 "+escapeHtml(link),disable_web_page_preview:false}))
      throw new Error("Telegram original article link delivery failed");
  }
  return result;
}

async function newsBreakingAlertCheck(env){
  if(!env.BOT_CONFIG_KV||!env.TELEGRAM_BOT_TOKEN||!env.TELEGRAM_CHAT_ID)return {skipped:"missing binding"};
  const cfg=await botConfig(env);
  if(cfg.newsAlerts===false)return {skipped:"disabled"};
  let feed;
  try{
    const response=await fetch("https://kokushibu74.github.io/news-feed.json",{headers:{"Cache-Control":"no-cache"},signal:AbortSignal.timeout(10000)});
    if(!response.ok){
      console.error("News alert feed fetch failed",JSON.stringify({status:response.status}));
      return {skipped:"feed http "+response.status};
    }
    feed=await response.json();
  }catch(error){
    console.error("News alert feed unavailable",String(error&&error.message||error).slice(0,160));
    return {skipped:"feed unavailable"};
  }
  const mainItems=Array.isArray(feed)?feed.slice(0,160):(Array.isArray(feed?.items)?feed.items.slice(0,160):[]);
  const weatherItems=Array.isArray(feed?.weatherItems)?feed.weatherItems.slice(0,12):[];
  const items=Array.isArray(feed)?mainItems:[...mainItems,...weatherItems];
  const now=Date.now(),sent=[],rejected={},auditTtl=7*86400;
  const auditSignal=/(নিহত|মারা\s*(?:গেছেন|গেছে|গেল(?:ো|েন)?|যান)|প্রাণ\s*(?:হারিয়েছেন|হারিয়েছে|হারান|গেছে|গেল)|মৃত্যু|খুন|হত্যা|দুর্ঘটনা|সংঘর্ষ|বাসে আগুন|অগ্নিসংযোগ|গুলিবর্ষণ|গুলিতে|গুলি চালনা|বিস্ফোরণ|অগ্নিকাণ্ড|ধস|ঘূর্ণিঝড়|ঘূর্ণিঝড়|বন্যা|ভূমিকম্প|পাহাড়ধস|পাহাড়ধস|তাপপ্রবাহ|যুদ্ধ|পদত্যাগ|নির্বাচন স্থগিত|killed|died|death|fatal|murder|homicide|crash|bus set on fire|vehicle set on fire|explosion|earthquake|cyclone|flood|landslide|mass casualty|war|airstrike|terror attack|bombing|hostage|resigns|coup)/i;
  const feedUpdatedAt=Array.isArray(feed)?null:feed?.updatedAt||null;
  const feedUpdatedMs=Date.parse(String(feedUpdatedAt||""));
  const feedAgeMinutes=Number.isFinite(feedUpdatedMs)?Math.round((now-feedUpdatedMs)/60000):null;
  let officialPagesPromise=null,scanned=0,audited=0;
  for(const item of items){
    if(!item||typeof item!=="object")continue;
    const title=String(item.title||"").trim();
    const summary=String(item.summary||item.previewSummary||"");
    const signalText=title+" "+summary+" "+String(item.category||"");
    if(item.isBreaking!==true&&!auditSignal.test(signalText))continue;
    const publishedAt=Date.parse(item.publishedAt||item.pubDate||"");
    const publishedAge=Number.isFinite(publishedAt)?(now-publishedAt)/60000:null;
    if(publishedAge!==null&&publishedAge>24*60)continue;
    scanned++;
    let official={confirmed:false};
    if(isWeatherCandidate(item)&&Number.isFinite(publishedAt)&&publishedAge>=-5&&publishedAge<=180){
      if(!officialPagesPromise)officialPagesPromise=loadOfficialDisasterPages();
      const pages=await officialPagesPromise;
      official=officialDisasterConfirmation(item,now,pages);
    }
    const decision=evaluateNewsAlert(item,{now,officialSignal:official.confirmed});
    if(official.confirmed&&decision.eligible)decision.official=official;
    const link=String(item.publisherUrl||item.link||"");
    const key=await newsAlertKey(title,String(item.source||item.publisherName||""));
    const rejectAuditKey="news-alert-reject:v1:"+key;
    if(!decision.eligible){
      const reason=String(decision.reason||"unknown");
      rejected[reason]=(rejected[reason]||0)+1;
      const sourceEvidence=Array.isArray(item.sourceEvidence)?item.sourceEvidence.slice(0,12).map(value=>String(value).slice(0,120)):[];
      const record={
        at:now,title:title.slice(0,240),summary:summary.slice(0,420),
        itemId:String(item.id||item.guid||"").slice(0,160)||null,
        link:link.slice(0,500)||null,
        isBreaking:item.isBreaking===true,
        publishedAt:item.publishedAt||item.pubDate||null,
        publishedAgeMinutes:publishedAge===null?null:Math.round(publishedAge*10)/10,
        category:String(item.category||"").slice(0,60),
        sourceEvidence,sourceEvidenceCount:sourceEvidence.length,
        sourceCount:Number(decision.sourceCount)||0,
        trustedSources:Array.isArray(decision.trustedSources)?decision.trustedSources.slice(0,12):[],
        trustedSourceCount:Array.isArray(decision.trustedSources)?decision.trustedSources.length:0,
        reason,status:"rejected"
      };
      try{
        const old=await env.BOT_CONFIG_KV.get(rejectAuditKey,"json");
        if(!old||old.reason!==record.reason||old.isBreaking!==record.isBreaking||old.publishedAt!==record.publishedAt||old.summary!==record.summary||old.sourceCount!==record.sourceCount||old.trustedSourceCount!==record.trustedSourceCount||JSON.stringify(old.sourceEvidence||[])!==JSON.stringify(record.sourceEvidence)){
          await env.BOT_CONFIG_KV.put(rejectAuditKey,JSON.stringify(record),{expirationTtl:auditTtl});
          audited++;
        }
      }catch(error){
        console.warn("News alert reject audit write failed",String(error&&error.message||error).slice(0,120));
      }
      continue;
    }
    try{
      const oldAudit=await env.BOT_CONFIG_KV.get(rejectAuditKey,"json");
      if(oldAudit&&oldAudit.status!=="resolved"){
        await env.BOT_CONFIG_KV.put(rejectAuditKey,JSON.stringify({...oldAudit,status:"resolved",resolvedAt:now}),{expirationTtl:auditTtl});
      }
    }catch(error){
      console.warn("News alert audit resolution failed",String(error&&error.message||error).slice(0,120));
    }
    const stateKey="news-alert:v2:"+key;
    const previous=await env.BOT_CONFIG_KV.get(stateKey,"json");
    let updateNo=0,updateStateKey="";
    if(previous){
      const titleChanged=String(previous.title||"").trim()!==title;
      const summaryChanged=String(previous.summary||"").trim()!==String(item.summary||item.previewSummary||"").trim();
      const oldSources=Array.isArray(previous.trustedSources)?previous.trustedSources:[];
      const newSources=decision.trustedSources||[];
      const sourceExpanded=newSources.some(source=>!oldSources.includes(source));
      if(!titleChanged&&!summaryChanged&&!sourceExpanded)continue;
      const updateKey=await newsAlertKey(title+" "+String(item.summary||item.previewSummary||""));
      updateStateKey="news-alert-update:v1:"+key+":"+updateKey;
      if(await env.BOT_CONFIG_KV.get(updateStateKey))continue;
      updateNo=Math.max(2,Number(previous.updateCount||1)+1);
    }
    const lockKey="news-alert-lock:v1:"+key;
    if(await env.BOT_CONFIG_KV.get(lockKey))continue;
    await env.BOT_CONFIG_KV.put(lockKey,String(now),{expirationTtl:120});
    try{
      const caption=formatAlertMessage(item,decision,{key,updateNo});
      const media=await sendNewsAlertMedia(env,item,caption,link);
      const history={sentAt:now,title,summary:String(item.summary||item.previewSummary||""),link,category:decision.category,scope:decision.scope,location:extractAlertLocation(item),sourceEvidence:decision.sources,trustedSources:decision.trustedSources,media,officialSource:decision.official&&decision.official.url||null,updateCount:updateNo||1};
      await env.BOT_CONFIG_KV.put(stateKey,JSON.stringify(history),{expirationTtl:NEWS_ALERT_TTL});
      if(updateStateKey)await env.BOT_CONFIG_KV.put(updateStateKey,JSON.stringify({sentAt:now,updateNo}),{expirationTtl:NEWS_ALERT_TTL});
      await env.BOT_CONFIG_KV.put("news-alert-history:v1:"+String(now)+":"+key+":"+(updateNo||1),JSON.stringify(history),{expirationTtl:NEWS_ALERT_TTL});
      sent.push(title);
    }finally{
      await env.BOT_CONFIG_KV.delete(lockKey).catch(()=>{});
    }
  }
  const summary={at:now,feedUpdatedAt,feedAgeMinutes,totalItems:items.length,candidates:scanned,audited,rejected,sent:sent.length};
  try{
    const summaryKey="news-alert-audit:v1:last-run";
    const previous=await env.BOT_CONFIG_KV.get(summaryKey,"json");
    if(!previous||now-Number(previous.at||0)>=15*60000||sent.length||audited){
      await env.BOT_CONFIG_KV.put(summaryKey,JSON.stringify(summary),{expirationTtl:auditTtl});
    }
  }catch(error){
    console.warn("News alert run summary write failed",String(error&&error.message||error).slice(0,120));
  }
  console.log("News alert check summary",JSON.stringify(summary));
  return {sent:sent.length,summary};
}

export default {
  async fetch(request, env) {
    const origin = request.headers.get("Origin") || "";
    const allowedOrigin = "https://kokushibu74.github.io";
    const cors = {"Access-Control-Allow-Origin":allowedOrigin,"Access-Control-Allow-Methods":"GET, POST, OPTIONS","Access-Control-Allow-Headers":"Content-Type","Vary":"Origin"};
    const respond = (body,status=200)=>new Response(JSON.stringify(body),{status,headers:{...cors,"Content-Type":"application/json; charset=utf-8","Cache-Control":"no-store"}});
    if(origin&&origin!==allowedOrigin)return new Response("Forbidden",{status:403});
    if(request.method==="OPTIONS")return new Response(null,{status:204,headers:cors});
    const pathname=new URL(request.url).pathname;
    const routeUrl=new URL(request.url);
    if(pathname==="/hero-preview")return botHeroPreviewPage(env,routeUrl.searchParams.get("token")||"");
    if(pathname==="/hero-preview-image")return botHeroPreviewImage(env,routeUrl.searchParams.get("token")||"");
    if(pathname==="/miniapp/api"){
      if(request.method!=="POST")return respond({ok:false,error:"Method not allowed"},405);
      if(origin!==allowedOrigin)return respond({ok:false,error:"Origin rejected"},403);
      let raw;try{raw=await request.text()}catch{return respond({ok:false,error:"Invalid request body"},400);}
      if(new TextEncoder().encode(raw).byteLength>6*1024*1024)return respond({ok:false,error:"Request too large"},413);
      let body;try{body=JSON.parse(raw)}catch{return respond({ok:false,error:"Invalid JSON"},400);}
      try{
        const user=await miniAppAuthorize(body?.initData,env);
        await miniAppRateLimit(env,user.id);
        const action=String(body?.action||"");
        if(action==="heroPrepare"){
          const result=await miniAppHeroPrepare(env,user.id,body);
          await miniAppAudit(env,user.id,"heroPrepare",{mimeType:String(body?.mimeType||""),bytes:Math.floor(String(body?.base64||"").length*3/4)});
          return respond({ok:true,...result});
        }
        if(action==="heroConfirm"){
          const result=await miniAppHeroConfirm(env,user.id,String(body?.token||""));
          await miniAppAudit(env,user.id,"heroConfirm",{imagePath:result.imagePath,commit:result.commit});
          return respond(result);
        }
        if(action==="heroCancel"){
          const token=String(body?.token||""),key="hero:pending:"+token;
          const pending=await env.BOT_CONFIG_KV?.get(key,"json");
          if(pending&&String(pending.userId)===String(user.id))await env.BOT_CONFIG_KV.delete(key);
          await miniAppAudit(env,user.id,"heroCancel");
          return respond({ok:true});
        }
        if(action==="ga4Report"){
          const result=await miniAppGa4Report(env);
          await miniAppAudit(env,user.id,"ga4Report",{propertyId:result.propertyId});
          return respond({ok:true,...result});
        }
        if(action==="cronHistory"){
          const rows=await miniAppCronHistory(env);
          return respond({ok:true,rows});
        }
        if(action==="newsRefresh"){
          // Manual dispatch is independent of the Automatic News Refresh schedule toggle.
          await miniAppAudit(env,user.id,"newsRefresh_manual_attempt",{workflow:"update-news.yml",branch:"main",manual:true});
          const result=await miniAppDispatchNews(env);
          await miniAppAudit(env,user.id,"newsRefresh_dispatched",{workflow:result.workflow});
          return respond({ok:true,...result});
        }
        if(action==="module"){
          const section=String(body?.section||"");const result=await miniAppModule(env,section);
          return respond({ok:true,...result});
        }
        if(action==="userLookup"){const result=await miniAppUserLookup(env,String(body?.query||""));await miniAppAudit(env,user.id,"userLookup",{kind:result.kind});return respond({ok:true,user:result});}
        if(action==="userAction"){const result=await miniAppUserAction(env,user.id,String(body?.operation||""),body||{});return respond(result);}
        if(action==="userHistory"){const rows=await miniAppUserHistory(env,String(body?.query||""));await miniAppAudit(env,user.id,"userHistory",{count:rows.length});return respond({ok:true,rows});}
        if(action==="recovery"){const result=await miniAppRecovery(env);await miniAppAudit(env,user.id,"recovery");return respond({ok:true,...result});}
        if(action==="audit"){
          const rows=await miniAppRecentAudit(env);await miniAppAudit(env,user.id,"audit");return respond({ok:true,rows});
        }
        if(action==="workflowRuns"){
          const result=await miniAppModule(env,"github");return respond({ok:true,runs:result.runs||[]});
        }
        if(action==="overview"){
          const result=await miniAppOverview(env,user);
          return respond(result);
        }
        if(action==="getConfig"){
          const cfg=await botConfig(env);
          return respond({ok:true,config:Object.fromEntries(Object.keys(BOT_DEFAULTS).map(k=>[k,!!cfg[k]]))});
        }
        if(action==="setConfig"){
          const key=String(body?.key||""),value=body?.value;
          if(!Object.prototype.hasOwnProperty.call(BOT_DEFAULTS,key)||typeof value!=="boolean")return respond({ok:false,error:"Unsupported setting or invalid value."},400);
          const cfg=await botConfig(env);cfg[key]=value;
          await miniAppAudit(env,user.id,"setConfig_attempt",{key,value});
          await botSaveConfig(env,cfg);
          return respond({ok:true,key,value});
        }
        return respond({ok:false,error:"Unknown Mini App action."},400);
      }catch(e){
        const message=String(e&&e.message||e).slice(0,220);
        const status=/Access denied/.test(message)?403:/signature|authentication data|session expired|identity is missing/i.test(message)?401:/Too many requests/.test(message)?429:400;
        return respond({ok:false,error:message},status);
      }
    }

    if(pathname==="/workflow-config"){const cfg=await botConfig(env);return respond({monitoring:!!cfg.monitoring,dailyReport:!!cfg.dailyReport,scheduledChecks:!!cfg.scheduledChecks,newsRefresh:!!cfg.newsRefresh,workflowAlerts:!!cfg.workflowAlerts,newsAlerts:!!cfg.newsAlerts,trafficAlerts:!!cfg.trafficAlerts,clientErrorAlerts:!!cfg.clientErrorAlerts,securityAlerts:!!cfg.securityAlerts,emergencyProtection:!!cfg.emergencyProtection});}

    if(pathname==="/location-context"){
      if(request.method!=="GET")return respond({ok:false,error:"Method not allowed"},405);
      const cf=request.cf||{},clean=(v,n=100)=>String(v||"").replace(/[\u0000-\u001f<>]/g," ").trim().slice(0,n);
      return respond({ok:true,city:clean(cf.city),region:clean(cf.region),country:clean(cf.country||request.headers.get("CF-IPCountry")),timezone:clean(cf.timezone,80)},200);
    }
    if(pathname==="/location-consent"){
      if(request.method!=="POST")return respond({ok:false,error:"Method not allowed"},405);
      if(!env.VISITOR_KV)return respond({ok:false,error:"Visitor storage is unavailable"},503);
      const rate=ipRateLimit(request,"location-consent",8,60000);
      if(!rate.allowed)return respond({ok:false,error:"Too many consent changes. Retry shortly."},429);
      const len=Number(request.headers.get("Content-Length")||0);if(len>4096)return respond({ok:false,error:"Payload too large"},413);
      let data;try{data=await request.json()}catch{return respond({ok:false,error:"Invalid JSON"},400)}
      const id=String(data.visitorId||""),session=String(data.sessionId||"");
      if(!/^VIS-[A-F0-9]{12}$/.test(id)||!/^SES-[A-F0-9]{12}$/.test(session))return respond({ok:false,error:"Invalid visitor/session ID"},400);
      if(await umBlocked(env,"website",id))return respond({ok:false,error:"Website access restricted"},403);
      const consent=data.consent===true,now=Date.now(),key="loc:v1:consent:"+id;
      let previous={};try{previous=await env.VISITOR_KV.get(key,"json")||{}}catch{}
      const record={visitorId:id,consent,policyVersion:String(data.policyVersion||"2026-11-05").slice(0,32),acceptedAtUtc:consent?(previous.acceptedAtUtc||new Date(now).toISOString()):(previous.acceptedAtUtc||null),updatedAtUtc:new Date(now).toISOString(),withdrawnAtUtc:consent?null:new Date(now).toISOString()};
      await env.VISITOR_KV.put(key,JSON.stringify(record),{expirationTtl:7776000});
      return respond({ok:true,consent,retentionDays:90},200);
    }
    if(pathname==="/location-history"){
      if(request.method!=="POST")return respond({ok:false,error:"Method not allowed"},405);
      if(!env.VISITOR_KV)return respond({ok:false,error:"Visitor storage is unavailable"},503);
      const rate=ipRateLimit(request,"location-history",6,60000);
      if(!rate.allowed)return respond({ok:false,error:"Too many location updates. Retry shortly."},429);
      const len=Number(request.headers.get("Content-Length")||0);if(len>4096)return respond({ok:false,error:"Payload too large"},413);
      let data;try{data=await request.json()}catch{return respond({ok:false,error:"Invalid JSON"},400)}
      const id=String(data.visitorId||""),session=String(data.sessionId||"");
      if(!/^VIS-[A-F0-9]{12}$/.test(id)||!/^SES-[A-F0-9]{12}$/.test(session))return respond({ok:false,error:"Invalid visitor/session ID"},400);
      if(await umBlocked(env,"website",id))return respond({ok:false,error:"Website access restricted"},403);
      const latitude=Number(data.latitude),longitude=Number(data.longitude),accuracy=Number(data.accuracyMeters);
      if(!Number.isFinite(latitude)||latitude < -90||latitude > 90||!Number.isFinite(longitude)||longitude < -180||longitude > 180||!Number.isFinite(accuracy)||accuracy<0||accuracy>100000)return respond({ok:false,error:"Invalid coordinates or accuracy"},400);
      const consent=await env.VISITOR_KV.get("loc:v1:consent:"+id,"json").catch(()=>null);
      if(consent?.consent!==true)return respond({ok:false,error:"Separate GPS History consent is required"},403);
      const profile=await env.VISITOR_KV.get("visitor:"+id,"json").catch(()=>null)||await env.VISITOR_KV.get(UM_PREFIX+"visitor:"+id,"json").catch(()=>null);
      if(!profile)return respond({ok:false,error:"Visitor profile is not ready; retry after the page tracker loads"},409);
      if(profile.lastSessionId&&String(profile.lastSessionId)!==session)return respond({ok:false,error:"Visitor session mismatch"},403);
      const now=Date.now(),utc=new Date(now).toISOString();
      const bdt=new Intl.DateTimeFormat("en-GB",{timeZone:"Asia/Dhaka",dateStyle:"medium",timeStyle:"medium"}).format(new Date(now))+" BDT";
      const salt=crypto.randomUUID?crypto.randomUUID().replace(/-/g,""):Math.random().toString(36).slice(2);
      const key="loc:v1:history:visitor:"+id+":"+String(now).padStart(13,"0")+":"+salt;
      const record={visitorId:id,latitude,longitude,accuracyMeters:Math.round(accuracy),source:"browser-geolocation",capturedAt:now,capturedAtUtc:utc,capturedAtBdt:bdt,locality:null,retentionDays:90};
      await env.VISITOR_KV.put(key,JSON.stringify(record),{expirationTtl:7776000});
      return respond({ok:true,recorded:true,retentionDays:90},200);
    }
    if(pathname==="/location-delete-request"){
      if(request.method!=="POST")return respond({ok:false,error:"Method not allowed"},405);
      if(!env.VISITOR_KV)return respond({ok:false,error:"Visitor storage is unavailable"},503);
      const rate=ipRateLimit(request,"location-delete-request",3,3600000);
      if(!rate.allowed)return respond({ok:false,error:"A deletion request was recently submitted. Please wait before retrying."},429);
      const len=Number(request.headers.get("Content-Length")||0);if(len>4096)return respond({ok:false,error:"Payload too large"},413);
      let data;try{data=await request.json()}catch{return respond({ok:false,error:"Invalid JSON"},400)}
      const id=String(data.visitorId||""),session=String(data.sessionId||"");
      if(!/^VIS-[A-F0-9]{12}$/.test(id)||!/^SES-[A-F0-9]{12}$/.test(session))return respond({ok:false,error:"Invalid visitor/session ID"},400);
      if(await umBlocked(env,"website",id))return respond({ok:false,error:"Website access restricted"},403);
      const profile=await env.VISITOR_KV.get("visitor:"+id,"json").catch(()=>null)||await env.VISITOR_KV.get(UM_PREFIX+"visitor:"+id,"json").catch(()=>null);
      if(!profile)return respond({ok:false,error:"Visitor profile was not found"},404);
      if(profile.lastSessionId&&String(profile.lastSessionId)!==session)return respond({ok:false,error:"Visitor session mismatch"},403);
      const now=Date.now(),utc=new Date(now).toISOString(),salt=crypto.randomUUID?crypto.randomUUID().replace(/-/g,""):Math.random().toString(36).slice(2);
      const key="loc:v1:delete-request:"+id+":"+String(now).padStart(13,"0")+":"+salt;
      const bdt=new Intl.DateTimeFormat("en-GB",{timeZone:"Asia/Dhaka",dateStyle:"medium",timeStyle:"short"}).format(new Date(now))+" BDT";
      await env.VISITOR_KV.put(key,JSON.stringify({visitorId:id,requestedAt:now,requestedAtUtc:utc,requestedAtBdt:bdt,status:"pending",scope:"gps-location-history-only"}),{expirationTtl:7776000});
      const admins=[...new Set(String(env.ADMIN_TELEGRAM_IDS||"").split(/[\s,;]+/).map(x=>x.trim()).filter(x=>/^\d{5,20}$/.test(x)))];
      let adminNotified=false;
      if(env.TELEGRAM_BOT_TOKEN&&admins.length){
        const message="🗑 GPS HISTORY DELETION REQUEST\nVisitor ID: "+id+"\nRequested: "+bdt+"\nScope: GPS location history only\nReview the loc:v1:delete-request record and remove the matching loc:v1:history:visitor records after verification.";
        const sent=await Promise.all(admins.map(admin=>botTelegram(env,"sendMessage",{chat_id:admin,text:message,disable_web_page_preview:true}).catch(()=>({ok:false}))));
        adminNotified=sent.some(result=>result?.ok);
      }
      return respond({ok:true,requestSubmitted:true,adminNotified},200);
    }
    if(pathname==="/track"){
      if(request.method!=="POST")return respond({error:"Method not allowed"},405);
      if(!env.VISITOR_KV)return respond({error:"Visitor tracking storage is not configured."},503);
      const len=Number(request.headers.get("Content-Length")||0);if(len>12000)return respond({error:"Payload too large"},413);
      const rate=ipRateLimit(request,"track",TRACK_RATE_LIMIT_MAX,TRACK_RATE_LIMIT_WINDOW_MS);
      if(!rate.allowed)return new Response(JSON.stringify({error:"Too many tracking requests. Retry shortly."}),{status:429,headers:{...cors,"Content-Type":"application/json; charset=utf-8","Cache-Control":"no-store","Retry-After":String(rate.retryAfter)}});
      const botCfg=await botConfig(env);
      let data;try{data=await request.json()}catch{return respond({error:"Invalid JSON"},400)}
      const id=String(data.visitorId||"");const session=String(data.sessionId||"");
      if(!/^VIS-[A-F0-9]{12}$/.test(id)||!/^SES-[A-F0-9]{12}$/.test(session))return respond({error:"Invalid visitor/session ID"},400);
      if(await umBlocked(env,"website",id))return respond({error:"Website access restricted",blocked:true},403);
      const clean=(v,n=180)=>String(v||"").replace(/[\u0000-\u001f<>]/g," ").trim().slice(0,n);
      const page=clean(data.page,180).split("?")[0].split("#")[0]||"/";
      const ua=clean(request.headers.get("User-Agent"),300);
      const cf=request.cf||{};
      const ip=clean(request.headers.get("CF-Connecting-IP"),64);
      const isp=clean(cf.asOrganization,120);
      const org=isp.toLowerCase();
      const carrierRules=[["Grameenphone",/grameenphone|gphone/],["Robi",/robi axiata|robi/],["Banglalink",/banglalink/],["Teletalk",/teletalk/],["Airtel",/airtel/]];
      const carrierMatch=carrierRules.find(([,pattern])=>pattern.test(org));
      const browserNetworkType=String(data.connectionType||"").toLowerCase();
      const networkType=browserNetworkType==="wifi"?"Wi-Fi (browser-reported)":browserNetworkType==="cellular"?"Mobile network (browser-reported)":browserNetworkType==="ethernet"?"Ethernet (browser-reported)":(carrierMatch||/mobile|cellular|wireless|gsm|lte|4g|5g/.test(org))?"Likely mobile network":/broadband|fiber|fibre|cable|telecom|internet|isp/.test(org)?"Likely ISP / broadband":"Unknown";
      const hostingSignal=/hosting|datacenter|data center|cloud|server|vps|vpn|proxy|amazon|aws|google cloud|microsoft azure|digitalocean/.test(org);
      const botManagement=cf.botManagement&&typeof cf.botManagement==="object"?cf.botManagement:{};
      const corporateProxy=botManagement.corporateProxy===true;
      const profileKey="visitor:"+id;
      let old={};try{old=await env.VISITOR_KV.get(profileKey,"json")||{}}catch{}
      const now=Date.now(),pageView=data.eventBatch!==true,sameSession=old.lastSessionId===session;
      const first=!old.visitorId;
      const newSession=!sameSession;
      const cutoff=now-31536000000;
      const pages=Array.isArray(old.pages)?old.pages.filter(p=>Number(p.at)>=cutoff).slice(-39):[];
      if(pageView&&(!pages.length||pages[pages.length-1].path!==page))pages.push({path:page,at:now});
      const events=Array.isArray(data.events)?data.events.slice(0,30).map(e=>({type:clean(e.type,30),at:now})).filter(e=>e.type):[];
      const profile={
        visitorId:id,firstSeen:old.firstSeen||now,lastSeen:now,
        totalSessions:(Number(old.totalSessions)||0)+(pageView&&newSession?1:0),
        totalPageViews:(Number(old.totalPageViews)||0)+(pageView?1:0),
        lastSessionId:pageView?session:(old.lastSessionId||session),lastSessionAt:pageView&&newSession?now:(old.lastSessionAt||now),sessionPageViews:pageView?(newSession?1:(Number(old.sessionPageViews)||0)+1):(Number(old.sessionPageViews)||0),
        pages,events:[...(Array.isArray(old.events)?old.events.filter(e=>Number(e.at)>=cutoff):[]),...events.map(e=>({type:e.type,at:e.at}))].slice(-60),
        network:{ip,ipVersion:ip.includes(":")?"IPv6":ip.includes(".")?"IPv4":"Unknown",country:clean(cf.country||request.headers.get("CF-IPCountry"),80),region:clean(cf.region,100),city:clean(cf.city,100),timezone:clean(cf.timezone,80),asn:cf.asn||null,isp,carrier:carrierMatch?carrierMatch[0]:"Not verified",networkType,hostingSignal:hostingSignal?"Possible hosting/cloud network":"No obvious hosting signal",corporateProxy:corporateProxy?"Cloudflare corporate-proxy signal":"Not exposed",colo:clean(cf.colo,12),httpProtocol:clean(cf.httpProtocol,20)},
        device:{userAgent:ua,platform:clean(data.platform,80),deviceType:clean(data.deviceType,30),deviceModel:clean(data.deviceModel,80),language:clean(data.language,30),screen:clean(data.screen,30),viewport:clean(data.viewport,30),pixelRatio:Number(data.pixelRatio)||null,browser:clean(data.browser,80),os:clean(data.os,80),connection:clean(data.connection,40),connectionType:clean(browserNetworkType,20)},
        source:{referrer:clean(data.referrer,240),utmSource:clean(data.utmSource,100),utmMedium:clean(data.utmMedium,100),utmCampaign:clean(data.utmCampaign,120)},
        performance:data.performance&&typeof data.performance==="object"?{loadMs:Number(data.performance.loadMs)||null,domMs:Number(data.performance.domMs)||null,lcp:Number(data.performance.lcp)||null,inp:Number(data.performance.inp)||null,cls:Number(data.performance.cls)||null}:null
      };
      await env.VISITOR_KV.put(profileKey,JSON.stringify(profile),{expirationTtl:31536000});
      try{await env.VISITOR_KV.put(UM_PREFIX+"visitor:"+id,JSON.stringify({...profile,kind:"visitor",id,customId:(await env.VISITOR_KV.get(UM_PREFIX+"visitor:"+id,"json"))?.customId||null}),{expirationTtl:31536000});await umHistory(env,"visitor",id,pageView?{type:"page_view",path:page,sessionId:session}:{type:"event_batch",path:page,events:events.map(e=>({type:e.type,at:e.at}))});}catch(e){console.error("User history write failed",String(e));}
      const reportDay=bdDay(now),dailyKey="daily:"+reportDay+":visitor:"+id;
      let dayRow={};try{dayRow=await env.VISITOR_KV.get(dailyKey,"json")||{}}catch{}
      const dayPages=dayRow.pages&&typeof dayRow.pages==="object"?dayRow.pages:{};
      if(pageView)dayPages[page]=(Number(dayPages[page])||0)+1;
      const dayStart=new Date(reportDay+"T00:00:00+06:00").getTime();
      const dayRecord={visitorId:id,firstSeen:profile.firstSeen,lastSeen:now,lastSessionId:session,pageViews:(Number(dayRow.pageViews)||0)+(pageView?1:0),sessions:(Number(dayRow.sessions)||0)+(pageView&&newSession?1:0),returning:!!(dayRow.returning||(!first&&profile.firstSeen<dayStart)),errors:(Number(dayRow.errors)||0)+events.filter(e=>e.type==="js_error"||e.type==="promise_error").length,pages:dayPages,source:profile.source,network:{country:profile.network.country,region:profile.network.region,city:profile.network.city,isp:profile.network.isp},device:{deviceType:profile.device.deviceType,deviceModel:profile.device.deviceModel,platform:profile.device.platform,browser:profile.device.browser,os:profile.device.os},recentEvents:[...(Array.isArray(dayRow.recentEvents)?dayRow.recentEvents:[]),...events.map(e=>({type:e.type,at:e.at}))].slice(-12),navigationSequence:profile.pages.slice(-12)};
      await env.VISITOR_KV.put(dailyKey,JSON.stringify(dayRecord),{expirationTtl:34560000});
      // Free-tier-friendly coarse traffic counter: one shared five-minute bucket.
      const bucket=Math.floor(now/300000),trafficKey="traffic:"+bucket;
      let traffic=0;try{traffic=Number(await env.VISITOR_KV.get(trafficKey))||0}catch{}
      if(pageView){traffic+=1;await env.VISITOR_KV.put(trafficKey,String(traffic),{expirationTtl:600});}
      const sendAlert=async(key,text)=>{const marker="alert:"+key,lock="alert:lock:"+key;if(await env.VISITOR_KV.get(marker)||await env.VISITOR_KV.get(lock))return;if(key.startsWith("security:"))await env.VISITOR_KV.put("security:event:v1:"+String(now).padStart(13,"0")+":"+crypto.randomUUID(),JSON.stringify({type:"unusual_visitor_activity",visitorId:id,at:now,page:String(page||"").slice(0,160),sessionId:String(session||"").slice(0,80)}),{expirationTtl:30*86400});const markup=key.startsWith("security:")?{inline_keyboard:[[{text:"Events",callback_data:"b1:alert:status:security:3"},{text:"Security Center",callback_data:"b1:alert:security"}]]}:key.startsWith("errors:")?{inline_keyboard:[[{text:"Details",callback_data:"b1:alert:website"},{text:"Logs",callback_data:"b1:alert:logs"}]]}:{inline_keyboard:[[{text:"Usage",callback_data:"b1:alert:status:analytics:3"},{text:"Details",callback_data:"b1:alert:analytics"}]]};await sendVisitorAlertOnce(env,key,text,markup,now)};
      if(pageView&&traffic>=40&&botCfg.trafficAlerts&&env.TELEGRAM_BOT_TOKEN&&env.TELEGRAM_CHAT_ID)await sendAlert("spike:"+bucket,"📈 <b>TRAFFIC SPIKE</b>\nAt least 40 page events in 5 minutes.\nCurrent page: "+clean(page,120)+"\nTime: "+new Date(now).toLocaleString("en-US",{timeZone:"Asia/Dhaka"}));
      const errorEvents=events.filter(e=>e.type==="js_error"||e.type==="promise_error");
      if(errorEvents.length&&botCfg.clientErrorAlerts&&env.TELEGRAM_BOT_TOKEN&&env.TELEGRAM_CHAT_ID)await sendAlert("errors:"+id+":"+Math.floor(now/86400000),"🔴 <b>CLIENT ERROR</b>\nVisitor: <code>"+id+"</code>\nPage: "+clean(page,120)+"\nErrors reported: "+errorEvents.length+"\nDetails: "+clean(errorEvents[0].value,160));
      const sessionViews=pageView?(newSession?1:(Number(old.sessionPageViews)||0)+1):(Number(old.sessionPageViews)||0);
      if(pageView&&sessionViews>=30&&botCfg.securityAlerts&&botCfg.emergencyProtection&&env.TELEGRAM_BOT_TOKEN&&env.TELEGRAM_CHAT_ID)await sendAlert("security:"+id+":"+session,"⚠️ <b>UNUSUAL VISITOR ACTIVITY</b>\nVisitor: <code>"+id+"</code>\n30+ page views in one session.\nIP: <code>"+clean(profile.network.ip,64)+"</code>");

      const stamp=new Date(now).toLocaleString("en-GB",{timeZone:"Asia/Dhaka",dateStyle:"medium",timeStyle:"short"});
      const esc=s=>String(s??"").replace(/&/g,"&amp;").replace(/</g,"&lt;").replace(/>/g,"&gt;").replace(/"/g,"&quot;");
      const cleanValue=(value,max=42)=>{const s=String(value??"").replace(/[\u0000-\u001f<>]/g," ").replace(/\s+/g," ").trim();return s?s.slice(0,max):"Unknown";};
      const row=(label,value)=>"│ "+esc(label.padEnd(17).slice(0,17))+" <code>"+esc(cleanValue(value,42))+"</code>";
      const section=(number,icon,label,rows)=>["","<b>"+number+" · "+icon+" "+label+"</b>",...rows.map(([k,v])=>row(k,v))];
      const firstPage=profile.pages?.[0]?.path||page;
      const currentPage=page;
      const referrer=profile.source.referrer||"Direct";
      let trafficSource="Direct";
      if(profile.source.utmSource)trafficSource="Campaign: "+profile.source.utmSource;
      else if(referrer!=="Direct"){try{trafficSource=new URL(referrer).hostname}catch{trafficSource="Referral"}}
      const sessionDuration=Math.max(0,Math.floor((now-(Number(profile.lastSessionAt)||now))/1000));
      const durationText=sessionDuration<60?sessionDuration+" sec":Math.floor(sessionDuration/60)+" min "+sessionDuration%60+" sec";
      const pathText=(profile.pages||[]).slice(-8).map(x=>x.path).join(" → ")||currentPage;
      const uaText=String(profile.device.userAgent||ua);
      const crawlerCandidate=/googlebot|google-inspectiontool|bingbot|bingpreview|duckduckbot|yandexbot|baiduspider|applebot/i.test(uaText);
      const botStatus=crawlerCandidate?"Crawler candidate · not verified":"Browser UA · not verified";
      const risk=sessionViews>=30?"Elevated activity · review":"No tracked risk rule triggered";
      const performance=profile.performance||{};
      const lines=[
        "🛰️ <b>VISITOR INTELLIGENCE</b>",
        first?"🟢 <b>NEW VISITOR DETECTED</b>":"🔵 <b>RETURNING VISITOR DETECTED</b>",
        "🆔 <code>"+esc(id)+"</code>",
        "━━━━━━━━━━━━━━━━━━━━",
        ...section("01","📍","LOCATION INTELLIGENCE",[
          ["Country",profile.network.country],
          ["Region",profile.network.region],
          ["City",profile.network.city],
          ["Location Source","IP-based · Estimated"],
          ["IP Version",profile.network.ipVersion],
          ["Timezone",profile.network.timezone]
        ]),
        ...section("02","📱","DEVICE PROFILE",[
          ["Device Type",profile.device.deviceType],
          ["Manufacturer / Model",profile.device.deviceModel],
          ["Platform",profile.device.platform],
          ["Operating System",profile.device.os],
          ["Browser",profile.device.browser],
          ["Screen Resolution",profile.device.screen],
          ["Viewport",profile.device.viewport],
          ["Language",profile.device.language],
          ["Connection Hint",profile.device.connection]
        ]),
        ...section("03","🌐","NETWORK PROFILE",[
          ["IP Address",profile.network.ip],
          ["ISP / Organization",profile.network.isp],
          ["ASN",profile.network.asn],
          ["Network Type",profile.network.networkType],
          ["Hosting Signal",profile.network.hostingSignal],
          ["Proxy Signal",profile.network.corporateProxy],
          ["HTTP Protocol",profile.network.httpProtocol],
          ["Cloudflare Colo",profile.network.colo]
        ]),
        ...section("04","📊","VISITOR ACTIVITY",[
          ["Visitor Status",first?"New Visitor":"Returning Visitor"],
          ["Total Visits",profile.totalSessions],
          ["Total Page Views",profile.totalPageViews],
          ["Entry Page",firstPage],
          ["Current Page",currentPage],
          ["Traffic Source",trafficSource],
          ["Referrer",referrer],
          ["UTM Medium",profile.source.utmMedium],
          ["UTM Campaign",profile.source.utmCampaign],
          ["Session Duration",durationText],
          ["Navigation Path",pathText]
        ]),
        ...section("05","🛡️","SECURITY ANALYSIS",[
          ["Bot Classification",botStatus],
          ["Risk Classification",risk],
          ["Session Page Views",sessionViews],
          ["Security Alert Rule",sessionViews>=30?"30+ views · threshold reached":"No threshold reached"]
        ])
      ];
      const perfRows=[];
      if(performance.loadMs)perfRows.push(["Page Load",Math.round(performance.loadMs)+" ms"]);
      if(performance.domMs)perfRows.push(["DOM Ready",Math.round(performance.domMs)+" ms"]);
      if(performance.lcp)perfRows.push(["LCP",Math.round(performance.lcp)+" ms"]);
      if(performance.inp)perfRows.push(["INP",Math.round(performance.inp)+" ms"]);
      if(performance.cls!==null&&performance.cls!==undefined)perfRows.push(["CLS",Number(performance.cls).toFixed(3)]);
      if(perfRows.length)lines.push(...section("06","⚡","PERFORMANCE SNAPSHOT",perfRows));
      lines.push("","━━━━━━━━━━━━━━━━━━━━","🕒 <b>VISIT TIMESTAMP</b>","│ Bangladesh Time  <code>"+esc(stamp)+" BDT</code>","━━━━━━━━━━━━━━━━━━━━","🛡️ <b>PORTFOLIO VISITOR MONITOR</b> · <b>ACTIVE</b>","<i>IP location is approximate. Browser/device signals may be unavailable or user-agent supplied. Bot identity is not confirmed by user-agent alone.</i>");
      if(pageView&&botCfg.monitoring&&env.TELEGRAM_BOT_TOKEN&&env.TELEGRAM_CHAT_ID){
        const text=lines.join("\n");
        await sendVisitorAlertOnce(env,"visitor:"+id+":"+session,text,null,now);
      }
      return respond({ok:true,visitorId:id,firstVisit:first,newSession,totalSessions:profile.totalSessions,totalPageViews:profile.totalPageViews});
    }
    if(new URL(request.url).pathname==="/telegram-webhook"){
      if(request.method!=="POST")return new Response("Method not allowed",{status:405});
      if(!env.TELEGRAM_WEBHOOK_SECRET||request.headers.get("X-Telegram-Bot-Api-Secret-Token")!==env.TELEGRAM_WEBHOOK_SECRET)return new Response("Unauthorized",{status:401});
      let update;try{update=await request.json()}catch{return new Response("Bad request",{status:400})}
      try{
      if(update.callback_query){try{await botHandleCallback(env,update.callback_query)}catch(e){console.error("Telegram callback handler failed",String(e))}return new Response("OK");}
      const msg=update.message;
      if(msg?.chat?.type==="private"&&Array.isArray(msg.photo)&&msg.from?.id){
        const sender=String(msg.from.id),admins=new Set(String(env.ADMIN_TELEGRAM_IDS||"").split(/[\s,;]+/).map(x=>x.trim()).filter(Boolean));
        if(admins.has(sender)&&env.BOT_CONFIG_KV){
          const mode=await env.BOT_CONFIG_KV.get("hero:uploading:"+sender,"json");
          if(mode){const photo=msg.photo[msg.photo.length-1],token=crypto.randomUUID();await env.BOT_CONFIG_KV.delete("hero:uploading:"+sender);await env.BOT_CONFIG_KV.put("hero:pending:"+token,JSON.stringify({fileId:photo.file_id,adminId:sender,expiresAt:Date.now()+900000}),{expirationTtl:900});const preview="https://portfolio-contact-telegram.mdshihab74.workers.dev/hero-preview?token="+encodeURIComponent(token);await botSend(env,msg.chat.id,"🖼️ HERO PREVIEW READY\nআগে ওয়েবসাইটের আসল Hero layout-এ ছবিটি দেখুন:\n"+preview+"\n\nPreview ১৫ মিনিটের জন্য সচল থাকবে।",[[{text:"✅ Confirm & Publish",callback_data:"b1:hero:confirm:"+token}],[{text:"✖️ Cancel",callback_data:"b1:hero:cancel:"+token}]],{forceNew:true});return new Response("OK")}
        }
      }
      if(!msg?.chat||typeof msg.text!=="string")return new Response("OK");
      if(msg.chat.type==="private"&&msg.from?.id&&env.BOT_CONFIG_KV){
        const adminSet=new Set(String(env.ADMIN_TELEGRAM_IDS||"").split(/[\s,;]+/).filter(Boolean));if(adminSet.has(String(msg.from.id))&&await botHandleStartButton(env,msg))return new Response("OK");const inputKey="bot:user-input:"+String(msg.from.id),pending=await env.BOT_CONFIG_KV.get(inputKey,"json");
        if(pending?.mode && !String(msg.text||"").trim().startsWith("/")){
          await env.BOT_CONFIG_KV.delete(inputKey);
          const raw=String(msg.text||"").trim().slice(0,500),parts=raw.split(/\s+/);let command="";
          if(!adminSet.has(String(msg.from.id))){await botSend(env,msg.chat.id,"⛔ Admin access required.",botBackKeyboard());return new Response("OK");}
          if(pending.mode==="search")command="/usersearch "+raw;
          else if(pending.mode==="history")command="/userhistory "+(pending.targetId||parts[0]);
          else if(pending.mode==="link")command=pending.targetId?(/^\d{5,20}$/.test(pending.targetId)?"/userlink "+pending.targetId+" "+raw:"/userlink "+raw+" "+pending.targetId):(/^unlink\s+/i.test(raw)?"/userunlink "+raw.replace(/^unlink\s+/i,""):"/userlink "+raw);
          else if(pending.mode==="block")command=pending.targetId?(/^unblock$/i.test(raw)?"/userunblock "+pending.targetId:"/userblock "+pending.targetId):(/^unblock\s+/i.test(raw)?"/userunblock "+raw.replace(/^unblock\s+/i,""):"/userblock "+raw);
          else if(pending.mode==="rename")command=pending.targetId?"/userrename "+pending.targetId+" "+raw:"/userrename "+parts[0]+" "+parts.slice(1).join(" ");
          else if(pending.mode==="visitorinfo")command="/userinfo "+parts[0];
          if(!command.trim()||command.endsWith(" "))await botSend(env,msg.chat.id,"তথ্যটি অসম্পূর্ণ। আবার User Manager থেকে অপশনটি নির্বাচন করুন।",botBackKeyboard());
          else {try{await botRunWithProgress(env,msg.chat.id,"User Manager-এর তথ্য যাচাই ও প্রক্রিয়া করা হচ্ছে...",async()=>{await umHandleCommand(env,{...msg,text:command})})}catch(e){console.error("User Manager button action failed",String(e));await botSend(env,msg.chat.id,"⚠️ User action failed. Existing text commands remain available.",botBackKeyboard())}}
          return new Response("OK");
        }
      }
      if(msg.chat.type==="private"&&msg.from?.id){
        try{await umTelegramTouch(env,msg);}catch(e){console.error("Telegram user history write failed",String(e));}
        const adminIds=new Set(String(env.ADMIN_TELEGRAM_IDS||"").split(/[\s,;]+/).map(x=>x.trim()).filter(Boolean));
        if(await umBlocked(env,"telegram",String(msg.from.id))&&!adminIds.has(String(msg.from.id))){
          try{await umHistory(env,"telegram",String(msg.from.id),{type:"blocked_message_attempt"});}catch{}
          return new Response("OK");
        }
        try{
          const commandName=(String(msg.text||"").trim().split(/\s+/)[0]||"").split("@")[0].toLowerCase();
          const slowCommands=new Set(["/userid","/userinfo","/userhistory","/usersearch","/userstats"]);
          if(adminIds.has(String(msg.from.id))&&slowCommands.has(commandName)){
            await botRunWithProgress(env,msg.chat.id,"User Manager থেকে তথ্য সংগ্রহ করা হচ্ছে...",async()=>{await umHandleCommand(env,msg)});
            return new Response("OK");
          }
          if(await umHandleCommand(env,msg))return new Response("OK");
        }catch(e){console.error("User management command dispatch failed",String(e));}
      }
      const infoAdmins=new Set(String(env.ADMIN_TELEGRAM_IDS||"").split(/[\s,;]+/).map(x=>x.trim()).filter(Boolean));
      if(msg.chat.type!=="private"||!infoAdmins.has(String(msg.from?.id||""))||!/^\/info(?:@\w+)?(?:\s|$)/i.test(msg.text.trim()))return new Response("OK");
      await botRunWithProgress(env,msg.chat.id,"ওয়েবসাইট ও Visitor Activity-এর তথ্য সংগ্রহ করা হচ্ছে...",async()=>{
        const site="https://kokushibu74.github.io/",started=performance.now(),stamp=new Date().toLocaleString("en-US",{timeZone:"Asia/Dhaka",dateStyle:"medium",timeStyle:"short"});let status="Error",elapsed=0,detail="";
        try{const res=await fetch(site,{redirect:"follow",signal:AbortSignal.timeout(15000)});status=String(res.status);elapsed=Math.round(performance.now()-started);detail=res.ok?"Site reachable":"Site returned HTTP "+res.status;await res.body?.cancel()}catch(e){elapsed=Math.round(performance.now()-started);detail=String(e&&e.message||e).slice(0,150)}
        const esc=s=>String(s).replace(/&/g,"&amp;").replace(/</g,"&lt;").replace(/>/g,"&gt;");
        const today=bdDay(),yesterday=previousBdDay(today);let activity=null,prior=null;try{activity=await readDailyActivity(env,today);prior=await readDailyActivity(env,yesterday)}catch(e){detail+=" · Visitor report unavailable"}const lines=["🌐 <b>Kokushibu74.github.io — Live Report</b>","🕒 Checked: "+esc(stamp)+" (Bangladesh time)","🔗 "+site,"📡 HTTP status: "+esc(status),"⏱️ Response time: "+elapsed+" ms",(status.startsWith("2")||status.startsWith("3")?"✅ ":"⚠️ ")+esc(detail),...(activity?["","📊 <b>Visitor Activity Summary — Today</b>",...dailyActivityLines(activity,prior).map(esc)]:[])];
        await botSend(env,msg.chat.id,lines.join("\n"),botBackKeyboard(),{parse_mode:"HTML"});
      });
      return new Response("OK");
      }catch(e){
        console.error("Telegram webhook update processing failed",JSON.stringify({
          updateId:Number.isSafeInteger(update?.update_id)?update.update_id:null,
          updateType:update?.callback_query?"callback_query":update?.message?"message":"unknown",
          error:String(e&&e.stack||e).slice(0,800)
        }));
        return new Response("OK");
      }
    }
    if(new URL(request.url).pathname!=="/submit")return respond({error:"Not found"},404);
    if(request.method!=="POST")return respond({error:"Method not allowed"},405);
    if(!env.TELEGRAM_BOT_TOKEN||!env.TELEGRAM_CHAT_ID)return respond({error:"Contact service is not configured yet."},503);
    if(!(request.headers.get("Content-Type")||"").toLowerCase().includes("multipart/form-data"))return respond({error:"Invalid form upload."},415);
    const length=Number(request.headers.get("Content-Length")||0);if(Number.isFinite(length)&&length>65*1024*1024)return respond({error:"Combined upload is too large; keep it below 60 MB."},413);
    const rate=ipRateLimit(request,"contact",CONTACT_RATE_LIMIT_MAX,CONTACT_RATE_LIMIT_WINDOW_MS);
    if(!rate.allowed)return new Response(JSON.stringify({error:"Too many contact submissions. Please wait before trying again."}),{status:429,headers:{...cors,"Content-Type":"application/json; charset=utf-8","Cache-Control":"no-store","Retry-After":String(rate.retryAfter)}});
    let form;try{form=await request.formData()}catch{return respond({error:"Invalid form data."},400)}
    const submittedVisitorId=String(form.get("visitorId")||"");
    if(/^VIS-[A-F0-9]{12}$/.test(submittedVisitorId)&&await umBlocked(env,"website",submittedVisitorId))return respond({error:"Website access restricted",blocked:true},403);
    if(String(form.get("company")||"").trim())return respond({ok:true});
    const name=String(form.get("name")||"").trim().slice(0,100),email=String(form.get("email")||"").trim().slice(0,180),phone=String(form.get("phone")||"").trim().slice(0,40),topic=String(form.get("topic")||"").trim().slice(0,80),message=String(form.get("message")||"").trim().slice(0,4000);
    if(!name||(!email&&!phone)||(email&&!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email))||!message||message.length<10)return respond({error:"Enter your name, a valid email or phone number, and a message of at least 10 characters."},400);
    const files=form.getAll("attachments").filter(f=>f&&typeof f==="object"&&typeof f.size==="number"&&f.size>0);
    if(files.length>3)return respond({error:"You can attach up to 3 files."},400);
    const max=20*1024*1024,allowed=new Set(["application/pdf","application/msword","application/vnd.openxmlformats-officedocument.wordprocessingml.document","application/vnd.ms-excel","application/vnd.openxmlformats-officedocument.spreadsheetml.sheet","application/vnd.ms-powerpoint","application/vnd.openxmlformats-officedocument.presentationml.presentation","text/plain","text/csv","application/rtf","image/jpeg","image/png","image/gif","image/webp","video/mp4","video/quicktime","video/webm","video/mpeg","video/3gpp"]);
    for(const f of files){if(f.size>max)return respond({error:"Each file must be 20 MB or smaller: "+String(f.name||"file").slice(0,100)},413);if(!allowed.has(String(f.type||"").toLowerCase()))return respond({error:"Unsupported file type: "+String(f.name||"file").slice(0,100)},415);}
    const esc=s=>String(s).replace(/&/g,"&amp;").replace(/</g,"&lt;").replace(/>/g,"&gt;");
    const lines=["📩 <b>New Portfolio Contact</b>","","<b>Name:</b> "+esc(name),email?"<b>Email:</b> "+esc(email):"",phone?"<b>Phone:</b> "+esc(phone):"",topic?"<b>Topic:</b> "+esc(topic):"","<b>Message:</b>",esc(message),files.length?"<b>Attachments ("+files.length+"):</b> "+files.map(f=>esc(String(f.name||"file").slice(0,100))).join(", "):"<b>Attachments:</b> none"].filter(Boolean);
    const api="https://api.telegram.org/bot"+env.TELEGRAM_BOT_TOKEN+"/",msg=await fetch(api+"sendMessage",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({chat_id:env.TELEGRAM_CHAT_ID,text:lines.join("\n"),parse_mode:"HTML",disable_web_page_preview:true})}),mr=await msg.json().catch(()=>({}));
    if(!msg.ok||!mr.ok)return respond({error:"Telegram could not deliver your message. Please try again."},502);
    for(const f of files){const body=new FormData();body.set("chat_id",String(env.TELEGRAM_CHAT_ID));body.set("document",f,String(f.name||"attachment"));let r,d;try{r=await fetch(api+"sendDocument",{method:"POST",body});d=await r.json().catch(()=>({}));}catch(e){console.error("Attachment upload failed:",String(e&&e.message||e));return respond({error:"Message delivered, but an attachment upload failed. Please retry with smaller files."},502);}if(!r.ok||!d.ok){console.error("Telegram attachment failure:",String(d.description||r.status));return respond({error:"Message delivered, but Telegram could not accept an attachment."},502);}}
    return respond({ok:true});
  },
  async scheduled(controller,env,ctx) {
    if(controller.cron==="* * * * *"){
      const minute=new Date().getUTCMinutes();
      if(minute%5===0){try{const result=await newsBreakingAlertCheck(env);if(result.sent)console.log("News breaking alerts sent",result.sent);}catch(e){console.error("News breaking alert check failed",String(e&&e.message||e).slice(0,160));}}
      // Keep the existing minute Cron; run KV cleanup on quarter-hours and watchdog five minutes later.
      if(minute%15===0)await botExpireIdleMenu(env);
      if(minute%15===5){
        try{const result=await newsRefreshWatchdog(env);if(result.dispatched)console.log("News refresh watchdog dispatched workflow",result.ageMinutes);}
        catch(e){console.error("News refresh watchdog failed",String(e&&e.message||e).slice(0,160));try{await notifyNewsWatchdogFailure(env,e)}catch{}}
      }
      return;
    }
    const cronStartedAt=Date.now(),cronRunId=crypto.randomUUID?crypto.randomUUID():String(cronStartedAt);
    await miniAppCronRecord(env,{id:cronRunId,at:cronStartedAt,status:"running",cron:controller.cron});
    try {
    const cfg=await botConfig(env);
    const runChecks=!!cfg.monitoring&&!!cfg.scheduledChecks;
    if(!runChecks&&!cfg.emergencyProtection){
      await miniAppCronRecord(env,{id:cronRunId,at:cronStartedAt,status:"skipped",cron:controller.cron,detail:"Monitoring and emergency protection are disabled."});
      return;
    }
    const site="https://kokushibu74.github.io/",started=performance.now(),now=new Date();
    const stamp=now.toLocaleString("en-US",{timeZone:"Asia/Dhaka",dateStyle:"medium",timeStyle:"short"});
    const parts=new Intl.DateTimeFormat("en-GB",{timeZone:"Asia/Dhaka",hour:"2-digit",minute:"2-digit",hourCycle:"h23"}).formatToParts(now);
    const hour=Number(parts.find(p=>p.type==="hour")?.value),minute=Number(parts.find(p=>p.type==="minute")?.value);
    const daily=hour===23;
    const reportDay=bdDay(now),reportId=reportDay+"-2300";
    let existingDailyState=null;
    if(daily&&cfg.dailyReport&&runChecks&&env.BOT_CONFIG_KV){try{existingDailyState=await env.BOT_CONFIG_KV.get("daily-report:delivery:v2:"+reportId,"json")}catch{}}
    const shouldSendDailyReport=!!(daily&&cfg.dailyReport&&runChecks&&existingDailyState?.status!=="complete");
    let status=null,responseMs=null,missing=[],failure="",resourceSnapshot=null,headersChecked=false;
    try{
      const res=await fetch(site,{method:"GET",redirect:"follow",signal:AbortSignal.timeout(15000)});
      status=res.status;responseMs=Math.round(performance.now()-started);
      const h=res.headers,checks=[["Content-Security-Policy",h.get("content-security-policy")],["Strict-Transport-Security",h.get("strict-transport-security")],["X-Content-Type-Options",h.get("x-content-type-options")],["X-Frame-Options",h.get("x-frame-options")],["Referrer-Policy",h.get("referrer-policy")]];
      missing=checks.filter(x=>!x[1]).map(x=>x[0]);headersChecked=true;if(!res.ok)failure="Website returned HTTP "+res.status;
    }catch(e){failure=String(e&&e.message||e).slice(0,180);responseMs=Math.round(performance.now()-started)}
    if(!env.TELEGRAM_BOT_TOKEN||!env.TELEGRAM_CHAT_ID){console.error("Telegram secrets missing; monitor could not send messages.");await miniAppCronRecord(env,{id:cronRunId,at:cronStartedAt,status:"warning",cron:controller.cron,durationMs:Date.now()-cronStartedAt,httpStatus:status,detail:"Telegram credentials missing; monitoring message could not be sent."});await miniAppCronAlert(env,controller.cron,"warning","Telegram credentials missing; monitor message not sent.");return}
    const sendTelegram=async text=>{
      const tg=await fetch("https://api.telegram.org/bot"+env.TELEGRAM_BOT_TOKEN+"/sendMessage",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({chat_id:env.TELEGRAM_CHAT_ID,text,parse_mode:"HTML",disable_web_page_preview:true,reply_markup:{inline_keyboard:[[{text:"Usage",callback_data:"b1:alert:status:analytics:3"},{text:"Details",callback_data:"b1:alert:analytics"}]]}})});
      const payload=await tg.json().catch(()=>({}));if(!tg.ok||!payload.ok)throw new Error("Telegram message delivery failed (HTTP "+tg.status+")");
    };

    if(runChecks&&(cfg.trafficAlerts||shouldSendDailyReport)){
      try{
        resourceSnapshot=await cfResourceBudgetCheck(env,cfg.trafficAlerts?sendTelegram:null,now);
        try{const errorKey="cloudflare:budget-monitor-error:v1";if(await env.BOT_CONFIG_KV.get(errorKey))await env.BOT_CONFIG_KV.delete(errorKey)}catch{}
        console.log("Cloudflare resource budget monitor completed",JSON.stringify({day:resourceSnapshot.day,month:resourceSnapshot.month,metrics:resourceSnapshot.metrics.map(metric=>({key:metric.key,percent:metric.percent,period:metric.period}))}));
      }
      catch(e){
        console.error("Cloudflare resource budget monitor failed:",String(e&&e.message||e).slice(0,220));
        if(cfg.trafficAlerts){
          try{const key="cloudflare:budget-monitor-error:v1",old=await env.BOT_CONFIG_KV.get(key,"json");if(!old?.at||Date.now()-Number(old.at)>6*60*60*1000){await sendTelegram("⚠️ <b>Cloudflare resource monitor unavailable</b>\n"+String(e&&e.message||e).replace(/[&<>]/g," ").slice(0,180));await env.BOT_CONFIG_KV.put(key,JSON.stringify({at:Date.now()}),{expirationTtl:2*86400});}}catch(notifyError){console.error("Cloudflare budget monitor warning could not be delivered:",String(notifyError&&notifyError.message||notifyError).slice(0,120));}
        }
      }
    }
    if(runChecks&&cfg.trafficAlerts){
      try{await cfHistoricalExceptionAudit(env,sendTelegram);}
      catch(e){
        console.error("Historical Cloudflare exception audit failed:",String(e&&e.message||e).slice(0,220));
        try{const key="cloudflare:exception-audit-error:v1",old=await env.BOT_CONFIG_KV.get(key,"json");if(!old?.at||Date.now()-Number(old.at)>6*60*60*1000){await sendTelegram("⚠️ <b>Historical exception log query failed</b>\n"+String(e&&e.message||e).replace(/[&<>]/g," ").slice(0,180));await env.BOT_CONFIG_KV.put(key,JSON.stringify({at:Date.now()}),{expirationTtl:2*86400});}}catch(notifyError){console.error("Exception audit warning could not be delivered:",String(notifyError&&notifyError.message||notifyError).slice(0,120));}
      }
    }

    // Monitor the existing Sports Zone daily YouTube search budget without adding another service.
    const checkYouTubeBudget=async()=>{
      if(!env.SPORTS_ZONE||!env.BOT_CONFIG_KV)return;
      const budget=await env.SPORTS_ZONE.get("auto:status","json");
      const used=Number(budget?.searchesToday),limit=Number(budget?.dailySearchLimit);
      if(!Number.isFinite(used)||!Number.isFinite(limit)||limit<=0)return;
      const checkedAt=Date.parse(String(budget.checkedAt||""));
      if(Number.isFinite(checkedAt)&&Date.now()-checkedAt>2*60*60*1000)return;
      const day=now.getUTCFullYear()+String(now.getUTCMonth()+1).padStart(2,"0")+String(now.getUTCDate()).padStart(2,"0");
      const key="resource-alert:youtube:"+day;
      let sent=[];try{const saved=await env.BOT_CONFIG_KV.get(key,"json");if(Array.isArray(saved))sent=saved.filter(Number.isFinite)}catch{}
      const thresholds=[50,70,85,95];
      const crossed=thresholds.filter(p=>used>=Math.ceil(limit*p/100)&&!sent.includes(p));
      if(!crossed.length)return;
      const percent=Math.min(100,Math.round(used/limit*100));
      await sendTelegram("⚠️ <b>Free-plan budget warning</b>\nYouTube search usage: <b>"+used+"/"+limit+"</b> ("+percent+"%)\nThreshold crossed: "+crossed.join("%, ")+"%\nCounter resets daily at 00:00 UTC.");
      await env.BOT_CONFIG_KV.put(key,JSON.stringify([...new Set([...sent,...crossed])]),{expirationTtl:48*60*60});
    };
    if(SPORTS_ZONE_MONITORING_ENABLED&&runChecks&&cfg.trafficAlerts){
      try{await checkYouTubeBudget()}catch(e){console.error("YouTube budget alert check failed",String(e&&e.message||e).slice(0,160))}
    }

    const ga4Report=async()=>{
      if(!env.GA4_SERVICE_ACCOUNT_JSON)throw new Error("GA4_SERVICE_ACCOUNT_JSON secret is missing");
      let sa;try{sa=JSON.parse(env.GA4_SERVICE_ACCOUNT_JSON)}catch{throw new Error("GA4 credentials secret is not valid JSON")}
      if(!sa.client_email||!sa.private_key)throw new Error("GA4 credentials must include client_email and private_key");
      const enc=b=>btoa(String.fromCharCode(...new Uint8Array(b))).replace(/=/g,"").replace(/\+/g,"-").replace(/\//g,"_");
      const te=new TextEncoder(),b64url=s=>btoa(s).replace(/=/g,"").replace(/\+/g,"-").replace(/\//g,"_");
      const nowSec=Math.floor(Date.now()/1000),header=b64url(JSON.stringify({alg:"RS256",typ:"JWT"})),claim=b64url(JSON.stringify({iss:sa.client_email,scope:"https://www.googleapis.com/auth/analytics.readonly",aud:"https://oauth2.googleapis.com/token",iat:nowSec,exp:nowSec+3600}));
      const pem=sa.private_key.replace(/-----BEGIN PRIVATE KEY-----/,"").replace(/-----END PRIVATE KEY-----/,"").replace(/\s/g,"");
      const binary=atob(pem),keyBytes=Uint8Array.from(binary,c=>c.charCodeAt(0));
      const key=await crypto.subtle.importKey("pkcs8",keyBytes,{name:"RSASSA-PKCS1-v1_5",hash:"SHA-256"},false,["sign"]);
      const signingInput=header+"."+claim,signature=await crypto.subtle.sign("RSASSA-PKCS1-v1_5",key,te.encode(signingInput));
      const assertion=signingInput+"."+enc(signature);
      const tokenRes=await fetch("https://oauth2.googleapis.com/token",{method:"POST",headers:{"Content-Type":"application/x-www-form-urlencoded"},body:new URLSearchParams({grant_type:"urn:ietf:params:oauth:grant-type:jwt-bearer",assertion})});
      const tokenData=await tokenRes.json().catch(()=>({}));if(!tokenRes.ok||!tokenData.access_token)throw new Error("Google token request failed: "+String(tokenData.error_description||tokenData.error||("HTTP "+tokenRes.status)).slice(0,180));
      const reportRes=await fetch("https://analyticsdata.googleapis.com/v1beta/properties/560673761:runReport",{method:"POST",headers:{"Authorization":"Bearer "+tokenData.access_token,"Content-Type":"application/json"},body:JSON.stringify({dateRanges:[{startDate:"today",endDate:"today"}],metrics:[{name:"activeUsers"},{name:"sessions"},{name:"screenPageViews"},{name:"engagementRate"}]})});
      const report=await reportRes.json().catch(()=>({}));if(!reportRes.ok)throw new Error("GA4 report failed: "+String(report.error?.message||("HTTP "+reportRes.status)).slice(0,220));
      const v=report.rows?.[0]?.metricValues||[];return {users:v[0]?.value??"0",sessions:v[1]?.value??"0",views:v[2]?.value??"0",engagement:v[3]?.value??"0"};
    };
    if(failure&&(cfg.emergencyProtection||cfg.workflowAlerts))await miniAppCronAlert(env,controller.cron,"warning",failure);
    if(shouldSendDailyReport){
      let ga4Data=null,ga4Error="",activity=null,prior=null;
      try{ga4Data=await ga4Report();}
      catch(e){ga4Error=String(e&&e.message||e).slice(0,220);}
      try{
        activity=await readDailyActivity(env,reportDay);
        prior=await readDailyActivity(env,previousBdDay(reportDay));
      }catch(e){console.error("Daily Visitor Intelligence read failed:",String(e&&e.message||e).slice(0,180));}
      const messages=buildDailyReportMessages({
        reportId,stamp,site,status,responseMs,failure,missing,headersChecked,
        activity,prior,ga4:ga4Data,ga4Error,resourceSnapshot
      });
      const delivery=await sendTelegramReportBatch(env,env.TELEGRAM_CHAT_ID,messages,reportId,{failure,missing});
      console.log("Daily Telegram report delivery:",JSON.stringify(delivery));
    }
    const terminalStatus=failure?"warning":"success";
    const terminalDetail=failure||("Site check completed; "+missing.length+" security headers missing.");
    await miniAppCronRecord(env,{id:cronRunId,at:cronStartedAt,status:terminalStatus,cron:controller.cron,durationMs:Date.now()-cronStartedAt,httpStatus:status,detail:terminalDetail});
    if(cfg.workflowAlerts||cfg.emergencyProtection)await miniAppCronAlert(env,controller.cron,terminalStatus,terminalDetail);
    } catch(error) {
      const detail=String(error&&error.message||error).slice(0,180);
      await miniAppCronRecord(env,{id:cronRunId,at:cronStartedAt,status:"failed",cron:controller.cron,durationMs:Date.now()-cronStartedAt,detail});
      try { const failedCfg=await botConfig(env); if(failedCfg.workflowAlerts||failedCfg.emergencyProtection)await miniAppCronAlert(env,controller.cron,"failed",detail); } catch(alertError) { console.error("Automation failure alert error:",String(alertError&&alertError.message||alertError).slice(0,160)); }
      console.error("Scheduled automation failed:",detail);
    }
  }
};

