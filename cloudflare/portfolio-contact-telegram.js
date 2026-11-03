

const CF_MONITOR_ACCOUNT_ID = "2eb330a662bfe3c78e68f3ba517aef54";
const CF_MONITOR_KV_NAMESPACES = [
  { id: "370c7ef8d3bd4c678243a2bd2a9c6f8c", label: "Bot config" },
  { id: "431208d4ca2646829178a9dd05f93c2f", label: "Remote bridge state" },
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
function cfMonitorAction(rows,action){return (rows||[]).reduce((total,row)=>total+(String(row?.dimensions?.actionType||"").toLowerCase()===action?cfMonitorNumber(row?.sum?.requests):0),0);}
async function cfResourceBudgetCheck(env,sendTelegram,now=new Date()) {
  if(!env.BOT_CONFIG_KV)throw new Error("BOT_CONFIG_KV binding is unavailable");
  const day=now.toISOString().slice(0,10),storageStart=new Date(now.getTime()-6*86400000).toISOString().slice(0,10);
  const query=[
    "query ShihabFreeBudget($accountTag: string!, $start: Date, $end: Date, $storageStart: Date, $startTime: Time!, $endTime: Time!) {",
    " viewer { accounts(filter: { accountTag: $accountTag }) {",
    "  workersInvocationsAdaptive(limit: 10000, filter: { datetime_geq: $startTime, datetime_leq: $endTime }) { sum { requests errors } }",
    "  kvBot: kvOperationsAdaptiveGroups(limit: 10000, filter: { namespaceId: \"" + CF_MONITOR_KV_NAMESPACES[0].id + "\", date_geq: $start, date_leq: $end }) { sum { requests } dimensions { actionType } }",
    "  kvBridge: kvOperationsAdaptiveGroups(limit: 10000, filter: { namespaceId: \"" + CF_MONITOR_KV_NAMESPACES[1].id + "\", date_geq: $start, date_leq: $end }) { sum { requests } dimensions { actionType } }",
    "  kvVisitor: kvOperationsAdaptiveGroups(limit: 10000, filter: { namespaceId: \"" + CF_MONITOR_KV_NAMESPACES[2].id + "\", date_geq: $start, date_leq: $end }) { sum { requests } dimensions { actionType } }",
    "  kvBotStorage: kvStorageAdaptiveGroups(limit: 10000, filter: { namespaceId: \"" + CF_MONITOR_KV_NAMESPACES[0].id + "\", date_geq: $storageStart, date_leq: $end }) { max { byteCount keyCount } dimensions { date } }",
    "  kvBridgeStorage: kvStorageAdaptiveGroups(limit: 10000, filter: { namespaceId: \"" + CF_MONITOR_KV_NAMESPACES[1].id + "\", date_geq: $storageStart, date_leq: $end }) { max { byteCount keyCount } dimensions { date } }",
    "  kvVisitorStorage: kvStorageAdaptiveGroups(limit: 10000, filter: { namespaceId: \"" + CF_MONITOR_KV_NAMESPACES[2].id + "\", date_geq: $storageStart, date_leq: $end }) { max { byteCount keyCount } dimensions { date } }",
    "  d1Usage: d1AnalyticsAdaptiveGroups(limit: 10000, filter: { databaseId: \"" + CF_MONITOR_D1_ID + "\", date_geq: $start, date_leq: $end }) { sum { rowsRead rowsWritten } dimensions { date databaseId } }",
    "  d1Storage: d1StorageAdaptiveGroups(limit: 10000, filter: { databaseId: \"" + CF_MONITOR_D1_ID + "\", date_geq: $storageStart, date_leq: $end }) { max { databaseSizeBytes } dimensions { date databaseId } }",
    " } }",
    "}"
  ].join("\n");
  const data=await cfMonitorGraphQL(env,query,{accountTag:CF_MONITOR_ACCOUNT_ID,start:day,end:day,storageStart,startTime:day+"T00:00:00Z",endTime:now.toISOString()});
  const account=data?.viewer?.accounts?.[0];
  if(!account)throw new Error("Cloudflare Analytics returned no account data");
  const workers=(account.workersInvocationsAdaptive||[]).reduce((sum,row)=>sum+cfMonitorNumber(row?.sum?.requests),0);
  const kvGroups=[account.kvBot||[],account.kvBridge||[],account.kvVisitor||[]];
  const kvStorageGroups=[account.kvBotStorage||[],account.kvBridgeStorage||[],account.kvVisitorStorage||[]];
  const kvAction=action=>kvGroups.reduce((sum,rows)=>sum+cfMonitorAction(rows,action),0);
  const d1Usage=account.d1Usage||[];
  const d1RowsRead=d1Usage.reduce((sum,row)=>sum+cfMonitorNumber(row?.sum?.rowsRead),0);
  const d1RowsWritten=d1Usage.reduce((sum,row)=>sum+cfMonitorNumber(row?.sum?.rowsWritten),0);
  const kvBytes=kvStorageGroups.reduce((sum,rows)=>sum+cfMonitorMax(rows,"byteCount"),0);
  const d1Bytes=cfMonitorMax(account.d1Storage||[],"databaseSizeBytes");
  const metrics=[
    {key:"workers_requests",label:"Workers requests (account-wide)",used:workers,limit:100000,unit:"requests",daily:true},
    {key:"kv_reads",label:"KV reads (non-Sports namespaces)",used:kvAction("read"),limit:100000,unit:"operations",daily:true},
    {key:"kv_writes",label:"KV writes (non-Sports namespaces)",used:kvAction("write"),limit:1000,unit:"operations",daily:true},
    {key:"kv_deletes",label:"KV deletes (non-Sports namespaces)",used:kvAction("delete"),limit:1000,unit:"operations",daily:true},
    {key:"kv_lists",label:"KV list operations (non-Sports namespaces)",used:kvAction("list"),limit:1000,unit:"operations",daily:true},
    {key:"kv_storage",label:"KV storage (non-Sports namespaces)",used:kvBytes,limit:1073741824,unit:"bytes",daily:false},
    {key:"d1_rows_read",label:"D1 rows read",used:d1RowsRead,limit:5000000,unit:"rows",daily:true},
    {key:"d1_rows_written",label:"D1 rows written",used:d1RowsWritten,limit:100000,unit:"rows",daily:true},
    {key:"d1_storage",label:"D1 database storage",used:d1Bytes,limit:5368709120,unit:"bytes",daily:false}
  ];
  const thresholds=[50,70,85,95],pending=[];
  for(const metric of metrics){
    const pct=metric.limit>0?metric.used/metric.limit*100:0;
    const stateKey="resource-alert:v2:"+(metric.daily?day+":":"storage:")+metric.key;
    let sent=[];
    try{const old=await env.BOT_CONFIG_KV.get(stateKey,"json");if(Array.isArray(old))sent=old.filter(Number.isFinite)}catch{}
    if(!metric.daily&&pct<50)sent=[];
    const crossed=thresholds.filter(level=>pct>=level&&!sent.includes(level));
    if(crossed.length)pending.push({metric,pct,crossed,stateKey,sent});
    else if(!metric.daily&&pct<50&&sent.length===0){try{await env.BOT_CONFIG_KV.put(stateKey,"[]",{expirationTtl:365*86400})}catch{}}
  }
  if(pending.length){
    const lines=["⚠️ <b>CLOUDFLARE FREE-PLAN RESOURCE ALERT</b>","🕒 "+now.toLocaleString("en-GB",{timeZone:"Asia/Dhaka",dateStyle:"medium",timeStyle:"short"})+" (Bangladesh time)","📅 Usage day: "+day+" UTC",""];
    for(const item of pending){
      const m=item.metric,used=m.unit==="bytes"?(m.used/1073741824).toFixed(3)+" GiB":Math.round(m.used).toLocaleString("en-US")+" "+m.unit;
      const limit=m.unit==="bytes"?(m.limit/1073741824).toFixed(3)+" GiB":m.limit.toLocaleString("en-US")+" "+m.unit;
      lines.push((item.pct>=95?"🚨 ":"⚠️ ")+"<b>"+m.label+"</b>","Usage: "+used+" / "+limit+" ("+Math.round(item.pct)+"%)","Threshold crossed: "+item.crossed.join("%, ")+"%");
    }
    await sendTelegram(lines.join("\n"));
    for(const item of pending){try{await env.BOT_CONFIG_KV.put(item.stateKey,JSON.stringify([...new Set([...item.sent,...item.crossed])]),{expirationTtl:item.metric.daily?48*3600:365*86400})}catch(e){console.error("Cloudflare resource alert state save failed:",String(e&&e.message||e).slice(0,120));}}
  }
  return {day,metrics:metrics.map(m=>({key:m.key,used:m.used,limit:m.limit,percent:Math.round(m.used/m.limit*100)})),alerts:pending.length};
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


const UM_PREFIX = "um:v1:";
const umClean = (v,n=120) => String(v??"").replace(/[\u0000-\u001f<>]/g," ").trim().slice(0,n);
const umDate = (ts=Date.now()) => new Intl.DateTimeFormat("en-CA",{timeZone:"Asia/Dhaka",year:"numeric",month:"2-digit",day:"2-digit"}).format(new Date(ts));
async function umList(env,prefix,limit=1000,maxPages=2){
  const out=[];let cursor,pages=0;
  do{const page=await env.VISITOR_KV.list({prefix,limit,cursor});out.push(...(page.keys||[]));cursor=page.list_complete?undefined:page.cursor;pages++;}while(cursor&&pages<maxPages);
  out.truncated=!!cursor;
  return out;
}
async function umHistory(env,kind,id,event){
  const at=Date.now(),day=umDate(at),salt=crypto.randomUUID?crypto.randomUUID():Math.random().toString(36).slice(2);
  const key=UM_PREFIX+"history:"+kind+":"+id+":"+day+":"+at+"-"+salt;
  await env.VISITOR_KV.put(key,JSON.stringify({at,kind,id,event}),{expirationTtl:34560000});
}
async function umTelegramTouch(env,msg){
  const id=String(msg.from.id),key=UM_PREFIX+"telegram:"+id,now=Date.now();
  let old={};try{old=await env.VISITOR_KV.get(key,"json")||{}}catch{}
  const profile={kind:"telegram",id,telegramId:id,firstSeen:old.firstSeen||now,lastSeen:now,
    username:umClean(msg.from.username,80),firstName:umClean(msg.from.first_name,80),
    lastName:umClean(msg.from.last_name,80),languageCode:umClean(msg.from.language_code,20),
    isBot:!!msg.from.is_bot,customId:old.customId||null};
  await env.VISITOR_KV.put(key,JSON.stringify(profile),{expirationTtl:31536000});
  await umHistory(env,"telegram",id,{type:"message_received",command:/^\//.test(String(msg.text||""))?String(msg.text).trim().split(/\s+/)[0].slice(0,40):"message",chatType:msg.chat.type||"unknown"});
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
async function umReply(env,chatId,text){
  if(!env.TELEGRAM_BOT_TOKEN)return;
  await botSend(env,chatId,text,botBackKeyboard());
}

// Telegram inline-button navigation and persistent control settings.
const BOT_MENU = [
  ["website","🌐 Website"],["news","📰 News"],["analytics","📊 Analytics"],["security","🛡️ Security"],
  ["github","🐙 GitHub"],["hero","🖼️ Hero Image"],["automation","⚙️ Automation"],["alerts","🚨 Alerts"],
  ["reports","📑 Reports"],["users","👥 User Manager"],["settings","🔧 Settings"],["logs","📜 Logs"],["recovery","♻️ Recovery"]
];
// Sports Zone is paused by user request. Keep its alert code for later restoration, but do not read its KV or send budget alerts.
const SPORTS_ZONE_MONITORING_ENABLED=false;
const BOT_DEFAULTS = {
  monitoring:true, dailyReport:true, scheduledChecks:true, newsRefresh:true, workflowAlerts:true,
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

const BOT_START_LABEL = "🚀 START BOT";
async function botMarkMenuInteraction(env,chatId,messageId,busy){
  if(!env.BOT_CONFIG_KV)return;
  const key=BOT_MENU_KEY_PREFIX+String(chatId),old=await botGetMenuAnchor(env,chatId);
  await env.BOT_CONFIG_KV.put(key,JSON.stringify({...old,chatId:String(chatId),messageId:Number(old?.messageId||messageId||0),lastInteractionAt:Date.now(),busy:!!busy}));
}
async function botEnsureStartKeyboard(env,chatId){
  // Set the Telegram chat menu to open the admin-only Mini App. The Worker API independently verifies Telegram initData and the admin allowlist.
  const menu=await botTelegram(env,"setChatMenuButton",{chat_id:chatId,menu_button:{type:"web_app",text:"Control Center",web_app:{url:"https://kokushibu74.github.io/miniapp/"}}});
  if(!menu.ok)console.error("Telegram Mini App menu button setup failed",JSON.stringify({status:menu.status,description:String(menu.data?.description||"").slice(0,180)}));
  // Keep the existing START BOT reply keyboard intact.
  const sent=await botTelegram(env,"sendMessage",{chat_id:chatId,text:"Mini App খুলতে chat input-এর পাশে Control Center menu ব্যবহার করুন, অথবা নিচের START BOT বাটন চাপুন।",reply_markup:{keyboard:[[{text:BOT_START_LABEL}]],resize_keyboard:true,is_persistent:true,one_time_keyboard:false}});
  if(!sent.ok)console.error("Telegram START BOT keyboard delivery failed",JSON.stringify({status:sent.status,description:String(sent.data?.description||"").slice(0,180)}));
}
async function botHandleStartButton(env,msg){
  if(String(msg.text||"").trim()!==BOT_START_LABEL)return false;
  await botEnsureStartKeyboard(env,msg.chat.id);
  const old=await botGetMenuAnchor(env,msg.chat.id);
  const fresh=await botSend(env,msg.chat.id,"🤖 PORTFOLIO CONTROL CENTER\n\nস্বাগতম! এখান থেকে ওয়েবসাইটের অবস্থা, News Feed, Visitor Analytics, Security, GitHub, Hero Image এবং Automation নিয়ন্ত্রণ করতে পারবেন।\n\nনিচের মেনু থেকে একটি বিভাগ বেছে নিন।",botMainKeyboard(),{forceNew:true});
  if(old?.messageId&&Number(old.messageId)!==Number(fresh?.message_id))await botTelegram(env,"deleteMessage",{chat_id:msg.chat.id,message_id:Number(old.messageId)});
  await botMarkMenuInteraction(env,msg.chat.id,fresh?.message_id,false);
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
    method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify(payload)
  });
  const d=await r.json().catch(()=>({}));
  return {ok:!!(r.ok&&d.ok),data:d,status:r.status};
}
async function botGetMenuAnchor(env,chatId){
  if(!env.BOT_CONFIG_KV)return null;
  try{return await env.BOT_CONFIG_KV.get(BOT_MENU_KEY_PREFIX+String(chatId),"json")}catch{return null}
}
async function botRememberMenu(env,chatId,messageId,onlyIfMissing=false){
  if(!env.BOT_CONFIG_KV||!messageId)return;
  const key=BOT_MENU_KEY_PREFIX+String(chatId);
  if(onlyIfMissing){const old=await botGetMenuAnchor(env,chatId);if(old?.messageId)return;}
  const prior=await botGetMenuAnchor(env,chatId);await env.BOT_CONFIG_KV.put(key,JSON.stringify({...prior,chatId:String(chatId),messageId:Number(messageId),updatedAt:Date.now()}));
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
  const messageId=saved?.messageId||options.messageId||null;
  const payload={chat_id:chatId,text:botFormatTelegramResponse(text,options).slice(0,3900),disable_web_page_preview:true,reply_markup:{inline_keyboard:keyboard||[]},...(options.parse_mode?{parse_mode:options.parse_mode}:{})};
  if(messageId&&!options.forceNew){
    let edited;
    try{edited=await botTelegram(env,"editMessageText",{...payload,message_id:messageId})}
    catch(e){console.error("Telegram menu edit request failed; falling back to a new message",String(e&&e.message||e).slice(0,240))}
    if(edited?.ok||String(edited?.data?.description||"").toLowerCase().includes("message is not modified")){
      try{await botRememberMenu(env,chatId,messageId)}catch(e){console.error("Telegram menu anchor refresh failed",String(e&&e.message||e).slice(0,240))}
      return edited?.data?.result||{message_id:messageId,chat:{id:chatId}};
    }
    console.error("Telegram menu edit rejected; sending a fresh message",JSON.stringify({status:edited?.status,description:String(edited?.data?.description||"").slice(0,240)}));
  }
  const sent=await botTelegram(env,"sendMessage",payload);
  if(!sent.ok)throw new Error("Telegram menu delivery failed (HTTP "+sent.status+"): "+String(sent.data?.description||"unknown Telegram API error").slice(0,180));
  const newMessageId=sent.data.result?.message_id;
  // If Telegram refuses an edit (for example, the anchor message was deleted),
  // replace the stale menu instead of leaving a growing stack of old menus.
  if(messageId&&newMessageId&&Number(messageId)!==Number(newMessageId)){
    try{await botTelegram(env,"deleteMessage",{chat_id:chatId,message_id:Number(messageId)})}
    catch(e){console.error("Telegram stale menu cleanup failed",String(e&&e.message||e).slice(0,240))}
  }
  try{await botRememberMenu(env,chatId,newMessageId)}catch(e){console.error("Telegram menu anchor save failed",String(e&&e.message||e).slice(0,240))}
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
  const rows=[];for(let i=0;i<BOT_MENU.length;i+=2)rows.push(BOT_MENU.slice(i,i+2).map(([id,label])=>({text:label,callback_data:"b1:"+id})));
  rows.push([{text:"🔄 Manual Refresh",callback_data:"b1:refresh"}]);
  return rows;
}
function botBackKeyboard(){return [[{text:"⬅️ Main Menu",callback_data:"b1:home"}]]}
async function botShowMenu(env,chatId,title="🤖 PORTFOLIO CONTROL CENTER"){
  await botSend(env,chatId,title+"\n\nস্বাগতম! এখান থেকে ওয়েবসাইটের অবস্থা, News Feed, Visitor Analytics, Security, GitHub, Hero Image এবং Automation নিয়ন্ত্রণ করতে পারবেন।\n\nনিচের মেনু থেকে একটি বিভাগ বেছে নিন। কোনো সেটিংস পরিবর্তনের আগে তার ON/OFF অবস্থা দেখে নিন।",botMainKeyboard());
}
async function botCategory(env,chatId,category){
  const cfg=await botConfig(env);
  const labels={
    website:["🌐 WEBSITE CONTROL","Site Health","Page Status","Manual Refresh"],
    news:["📰 NEWS CONTROL","Latest Feed","News Refresh Status","Source Health"],
    analytics:["📊 ANALYTICS","GA4 Status","Visitor Summary","Traffic Overview"],
    security:["🛡️ SECURITY CENTER","Security Status","Critical Protection","Recent Security Events"],
    github:["🐙 GITHUB","Repository Status","Latest Commit","Workflow Status"],
    hero:["🖼️ HERO IMAGE MANAGER","Upload from Telegram","Current Hero Image","Preview & Confirm"],
    automation:["⚙️ AUTOMATION CONTROL","Monitoring","Daily Report","Scheduled Checks"],
    alerts:["🚨 ALERT CONTROL","Workflow Alerts","Traffic Alerts","Client Error Alerts","Security Alerts","Emergency Protection"],
    reports:["📑 REPORTS","Daily Report Status","Latest Report","Report History"],
    users:["👥 USER MANAGER","All Users","Search Users","User Stats","Link / Unlink","Block / Unblock","Rename User","User History"],
    settings:["🔧 SETTINGS","Configuration Status","Admin Access","Bot Menu"],
    logs:["📜 LOGS","Recent Worker Events","Workflow Logs","Security Logs"],
    recovery:["♻️ RECOVERY","Backup Branch","Worker Rollback Point","Recovery Guide"]
  };
  const names=labels[category];if(!names){await botShowMenu(env,chatId);return}
  const rows=[];
  if(category==="automation"||category==="alerts"){
    const keys=category==="automation"?["monitoring","dailyReport","scheduledChecks","newsRefresh"]:["workflowAlerts","trafficAlerts","clientErrorAlerts","securityAlerts","emergencyProtection"];
    const pretty={monitoring:"Monitoring",dailyReport:"Daily Report",scheduledChecks:"Scheduled Checks",newsRefresh:"News Refresh",workflowAlerts:"Workflow Alerts",trafficAlerts:"Traffic Alerts",clientErrorAlerts:"Client Error Alerts",securityAlerts:"Security Alerts",emergencyProtection:"Emergency Protection"};
    for(const k of keys)rows.push([{text:(cfg[k]?"🟢 ":"⚪ ")+pretty[k]+" · "+(cfg[k]?"ON":"OFF"),callback_data:"b1:toggle:"+k}]);
    rows.push([{text:"ℹ️ Refresh is always manual",callback_data:"b1:info:manual"}]);
  }else if(category==="users"){
    rows.push([{text:"👥 All Users",callback_data:"b1:users:list"},{text:"🔎 Search",callback_data:"b1:users:search"}]);
    rows.push([{text:"📊 Stats",callback_data:"b1:users:stats"},{text:"🕘 History",callback_data:"b1:users:history"}]);
    rows.push([{text:"🔗 Link / Unlink",callback_data:"b1:users:link"},{text:"🚫 Block / Unblock",callback_data:"b1:users:block"}]);
    rows.push([{text:"✏️ Rename",callback_data:"b1:users:rename"}]);
  }else if(category==="hero"){
    rows.push([{text:"📤 Upload Hero Image",callback_data:"b1:hero:upload"}]);
    rows.push([{text:"🖼️ Current Hero Image",callback_data:"b1:hero:current"}]);
  }else{
    for(let i=1;i<names.length;i+=2)rows.push(names.slice(i,i+2).map((label,j)=>({text:label,callback_data:"b1:status:"+category+":"+(i+j)})));
  }
  rows.push(...botBackKeyboard());
  await botSend(env,chatId,names[0]+"\n\nএই বিভাগের অপশনগুলো নিচে দেওয়া হলো। প্রতিটি অপশনে চাপলে সংশ্লিষ্ট তথ্য বা নিয়ন্ত্রণ দেখানো হবে।\n\nকোনো সেটিংস ON/OFF করলে পরিবর্তনটি সংরক্ষিত হবে এবং মেনুতে নতুন অবস্থা দেখা যাবে।",rows);
}

async function botStatusText(env,category,index){
  const site="https://kokushibu74.github.io/";
  const cfg=await botConfig(env);
  const onOff=v=>v?"🟢 চালু (ON)":"⚪ বন্ধ (OFF)";
  const section={
    website:["ওয়েবসাইটের স্বাস্থ্য","হোমপেজের HTTP response, response time এবং Hero image configuration পরীক্ষা করা হয়েছে।"],
    news:["News Feed-এর অবস্থা","লাইভ News Feed ফাইল পড়া হয়েছে; Feed-এর আকার, article count ও সর্বশেষ শিরোনাম দেখানো হচ্ছে।"],
    analytics:["ভিজিটর অ্যানালিটিক্স","এই রিপোর্ট Cloudflare Visitor KV-তে সংরক্ষিত visitor activity থেকে তৈরি; এটি সরাসরি GA4-এর রিপোর্ট নয়।"],
    security:["বেসিক নিরাপত্তা পরীক্ষা","হোমপেজের response headers পরীক্ষা করা হয়েছে। এটি পূর্ণাঙ্গ penetration test বা security audit নয়।"],
    github:["GitHub Repository","GitHub API থেকে Repository ও সর্বশেষ commit-এর তথ্য নেওয়া হয়েছে।"],
    reports:["রিপোর্ট কন্ট্রোল","Daily Report ও Monitoring-এর বর্তমান সেটিংস এবং আজকের visitor activity দেখানো হচ্ছে।"],
    settings:["Bot Configuration","Bot-এর persistent configuration storage থেকে বর্তমান ON/OFF সেটিংস দেখানো হচ্ছে।"],
    logs:["সাম্প্রতিক কার্যক্রম","Visitor/User Manager-এর সংরক্ষিত সাম্প্রতিক event দেখানো হচ্ছে; পূর্ণ Cloudflare runtime log Dashboard-এ থাকে।"],
    recovery:["Recovery ও Backup তথ্য","বর্তমান backup branch এবং Worker rollback location-এর তথ্য দেখানো হচ্ছে।"]
  };
  const [heading,description]=section[category]||["সিস্টেমের অবস্থা","নির্বাচিত বিভাগের বর্তমান তথ্য।"];
  const lines=["━━━━━━━━━━━━━━━━━━","📋 "+heading.toUpperCase(),"━━━━━━━━━━━━━━━━━━","", "ℹ️ "+description,""];
  if(category==="website"){
    const started=Date.now();
    const r=await fetch(site,{redirect:"follow",signal:AbortSignal.timeout(12000)});
    const data=await fetch(site+"site-data.json",{signal:AbortSignal.timeout(8000)}).then(x=>x.json()).catch(()=>({}));
    lines.push("🌐 ওয়েবসাইট: "+site,"📡 HTTP Status: "+r.status+" "+(r.ok?"(সফল response)":"(সমস্যা আছে)"),"⚡ Response Time: "+(Date.now()-started)+" ms","🖼️ Hero Image: "+String(data.image||"সেট করা নেই"),"📍 Hero Image Position: "+String(data.imagePos??"ডিফল্ট"),"","ব্যাখ্যা: HTTP 2xx/3xx হলে সার্ভার সাড়া দিচ্ছে। Response time বেশি হলে নেটওয়ার্ক বা hosting latency পরীক্ষা করা উচিত।");
  }else if(category==="news"){
    const r=await fetch(site+"news-feed.json",{signal:AbortSignal.timeout(10000)});
    const raw=await r.text();let parsed;try{parsed=JSON.parse(raw)}catch{parsed=null}
    const arr=Array.isArray(parsed)?parsed:(parsed&&typeof parsed==="object"?Object.values(parsed).find(Array.isArray)||[]:[]);
    const latest=arr[0]||{};
    lines.push("📡 Feed HTTP Status: "+r.status+" "+(r.ok?"(সফল response)":"(সমস্যা আছে)"),"📦 Feed Size: "+raw.length.toLocaleString("en-US")+" bytes","📰 পাওয়া Article: "+arr.length,"🕒 সর্বশেষ Article: "+String(latest.title||latest.headline||"শিরোনাম পাওয়া যায়নি").slice(0,220),"⚙️ Automatic News Refresh: "+onOff(cfg.newsRefresh),"","ব্যাখ্যা: Article count শূন্য হলে Feed ফাইলের গঠন, News workflow run এবং source fetch পরীক্ষা করতে হবে। News Refresh OFF থাকলে নির্ধারিত automatic refresh বন্ধ থাকে; manual workflow আলাদা।");
  }else if(category==="analytics"){
    const day=bdDay(),a=await readDailyActivity(env,day),p=await readDailyActivity(env,previousBdDay(day));
    const change=(v,old)=>{const d=v-old;return (d>0?"+":"")+d+" ("+(d>0?"বৃদ্ধি":d<0?"কমেছে":"পরিবর্তন নেই")+")"};
    lines.push("📅 রিপোর্টের তারিখ: "+day+" (বাংলাদেশ সময়)","👤 Unique Visitors: "+a.unique,"   গতকালের তুলনায়: "+change(a.unique,p.unique),"🔁 Sessions: "+a.sessions,"   গতকালের তুলনায়: "+change(a.sessions,p.sessions),"👁️ Page Views: "+a.views,"   গতকালের তুলনায়: "+change(a.views,p.views),"⚠️ Client Errors: "+a.errors,"","🔥 জনপ্রিয় পেজ:",...(a.pages.length?a.pages.map((x,i)=>(i+1)+". "+x):["   এখনো কোনো Page View data নেই"]),"","🌍 শীর্ষ দেশ:",...(a.countries.length?a.countries.map(x=>"• "+x):["• তথ্য পাওয়া যায়নি"]),"📱 ডিভাইস:",...(a.devices.length?a.devices.map(x=>"• "+x):["• তথ্য পাওয়া যায়নি"]),"","ডেটার উৎস: Cloudflare Visitor KV। GA4-এর Active Users বা GA4 Sessions-এর সঙ্গে এই সংখ্যাগুলো এক নয়।");
  }else if(category==="security"){
    const r=await fetch(site,{redirect:"follow",signal:AbortSignal.timeout(12000)}),h=r.headers;
    const checks=[["Content-Security-Policy (CSP)","content-security-policy"],["Strict-Transport-Security (HSTS)","strict-transport-security"],["X-Content-Type-Options","x-content-type-options"],["X-Frame-Options","x-frame-options"],["Referrer-Policy","referrer-policy"]];
    const present=checks.filter(x=>h.get(x[1])).map(x=>x[0]),missing=checks.filter(x=>!h.get(x[1])).map(x=>x[0]);
    lines.push("🌐 Homepage HTTP: "+r.status,"🛡️ Emergency Protection: "+onOff(cfg.emergencyProtection),"","✅ পাওয়া Security Headers:",...(present.length?present.map(x=>"• "+x):["• কোনো তালিকাভুক্ত Header পাওয়া যায়নি"]),"","⚠️ অনুপস্থিত / response-এ প্রকাশিত নয়:",...(missing.length?missing.map(x=>"• "+x):["• তালিকাভুক্ত সব Header পাওয়া গেছে"]),"","গুরুত্বপূর্ণ: Proxy বা hosting layer header যোগ/পরিবর্তন করতে পারে। এই quick check দিয়ে সাইট সম্পূর্ণ নিরাপদ—এমন সিদ্ধান্ত দেওয়া যায় না।");
  }else if(category==="github"){
    const headers={Accept:"application/vnd.github+json","User-Agent":"Kokushibu74-Portfolio-MiniApp","X-GitHub-Api-Version":"2022-11-28"};
    if(env.GITHUB_TOKEN)headers.Authorization="Bearer "+env.GITHUB_TOKEN;
    const [repoRes,commitRes]=await Promise.all([
      fetch("https://api.github.com/repos/Kokushibu74/kokushibu74.github.io",{headers,signal:AbortSignal.timeout(10000)}),
      fetch("https://api.github.com/repos/Kokushibu74/kokushibu74.github.io/commits?per_page=1",{headers,signal:AbortSignal.timeout(10000)})
    ]);
    const repoData=await repoRes.json().catch(()=>({})),commits=await commitRes.json().catch(()=>[]);
    const commit=Array.isArray(commits)?commits[0]:null;
    lines.push("📁 Repository: "+(repoData.full_name||"তথ্য পাওয়া যায়নি"),"🌿 Default Branch: "+(repoData.default_branch||"অজানা"),"🔐 Visibility: "+(repoData.private?"Private":"Public / অথবা API-তে private নয়"),"📡 Repository API: HTTP "+repoRes.status,"📡 Commit API: HTTP "+commitRes.status,"","🧾 সর্বশেষ Commit: "+String(commit?.sha||"তথ্য পাওয়া যায়নি").slice(0,12),"💬 Commit Message: "+String(commit?.commit?.message||"তথ্য পাওয়া যায়নি").split("\n")[0].slice(0,200),"","নোট: Workflow-এর বিস্তারিত Run History GitHub Actions পেজে দেখা যাবে।");
  }else if(category==="reports"){
    const day=bdDay(),a=await readDailyActivity(env,day);
    lines.push("⚙️ Daily Report: "+onOff(cfg.dailyReport),"⚙️ Website Monitoring: "+onOff(cfg.monitoring),"📅 আজকের তারিখ: "+day+" (বাংলাদেশ সময়)","👤 আজকের Unique Visitors: "+a.unique,"🔁 Sessions: "+a.sessions,"👁️ Page Views: "+a.views,"","🕚 নির্ধারিত রিপোর্ট সময়: রাত ১১টা (বাংলাদেশ সময়)","⏱️ Worker Cron: প্রতি ৩০ মিনিটে চলে; তাই রিপোর্ট নির্ধারিত সময়ের কাছাকাছি cron run-এ পাঠানো হয়।","ℹ️ Daily Report OFF করলে স্বয়ংক্রিয় দৈনিক রিপোর্ট তৈরি/পাঠানোর অংশ বন্ধ থাকবে।");
  }else if(category==="settings"){
    const names={monitoring:"Website Monitoring",dailyReport:"Daily Report",scheduledChecks:"Scheduled Checks",newsRefresh:"Automatic News Refresh",workflowAlerts:"Workflow Alerts",trafficAlerts:"Traffic Alerts",clientErrorAlerts:"Client Error Alerts",securityAlerts:"Security Alerts",emergencyProtection:"Emergency Protection"};
    lines.push("🔧 বর্তমান সেটিংস:",...Object.entries(cfg).filter(([k,v])=>typeof v==="boolean").map(([k,v])=>(v?"🟢":"⚪")+" "+(names[k]||k)+": "+(v?"ON — চালু":"OFF — বন্ধ")),"","💾 Configuration Storage: "+(env.BOT_CONFIG_KV?"সংযুক্ত (Connected)":"সংযুক্ত নয়"),"ℹ️ Automation ও Alerts মেনু থেকে সমর্থিত সুইচগুলো পরিবর্তন করা যায়।");
  }else if(category==="logs"){
    const keys=await umList(env,UM_PREFIX+"history:",12),rows=[];
    for(const key of keys.slice(-8).reverse()){const v=await env.VISITOR_KV.get(key.name,"json");if(v)rows.push("• "+new Date(v.at||0).toLocaleString("en-GB",{timeZone:"Asia/Dhaka"})+" (BDT) · "+v.kind+" · "+String(v.event?.type||v.event?.command||"event"));}
    lines.push("🧾 সর্বশেষ সংরক্ষিত User Events:",...(rows.length?rows:["• কোনো সাম্প্রতিক User Event পাওয়া যায়নি"]),"","📌 Log-এর সীমাবদ্ধতা: এখানে User Manager history দেখানো হয়। Cloudflare Worker-এর পূর্ণ runtime log দেখতে Cloudflare Dashboard → Workers & Pages → portfolio-contact-telegram → Logs খুলুন।");
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
  const action=data.slice(3);
  try{
    // Never overwrite the active menu anchor from a callback payload.
    // botSend owns anchor updates after a successful edit/send.
    await botAnswerCallback(env,query);
    if(action==="home"){await env.BOT_CONFIG_KV?.delete("bot:user-input:"+sender);await botShowMenu(env,chatId);return true}
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
    if(BOT_MENU.some(([id])=>id===action)){await botCategory(env,chatId,action);return true}
    if(action==="users:list"){await botRunWithProgress(env,chatId,"User Manager থেকে ব্যবহারকারীর তালিকা আনা হচ্ছে...",async()=>{await umHandleCommand(env,{text:"/userid 1",chat:{id:chatId,type:"private"},from:{id:Number(sender)}})});return true}
    if(action==="users:stats"){await botRunWithProgress(env,chatId,"User Manager-এর পরিসংখ্যান সংগ্রহ করা হচ্ছে...",async()=>{await umHandleCommand(env,{text:"/userstats",chat:{id:chatId,type:"private"},from:{id:Number(sender)}})});return true}
    if(["search","history","link","block","rename"].includes(action.split(":")[1])&&action.startsWith("users:")){
      if(!env.BOT_CONFIG_KV){await botSend(env,chatId,"Configuration storage is unavailable.",botBackKeyboard());return true;}
      const mode=action.split(":")[1],prompts={search:"🔎 Search: নাম, Telegram ID বা Visitor ID পাঠান।",history:"🕘 History: Telegram ID বা Visitor ID পাঠান।",link:"🔗 Link/Unlink: TELEGRAM_ID VISITOR_ID লিখুন, অথবা unlink ID লিখুন।",block:"🚫 Block/Unblock: ID লিখুন; আনব্লক করতে unblock ID লিখুন।",rename:"✏️ Rename: ID CUSTOM_NAME লিখুন।"};
      await env.BOT_CONFIG_KV.put("bot:user-input:"+sender,JSON.stringify({mode,createdAt:Date.now()}),{expirationTtl:600});
      await botSend(env,chatId,prompts[mode]+"\n১০ মিনিটের মধ্যে উত্তর পাঠান।",botBackKeyboard());return true;
    }
    if(action.startsWith("hero:confirm:")){const token=action.slice("hero:confirm:".length);await botRunWithProgress(env,chatId,"অনুমোদিত Hero Image GitHub-এ প্রকাশ করা হচ্ছে...",async()=>{const result=await botCommitHero(env,token);await botSend(env,chatId,"✅ GitHub updated: "+result.imagePath+"\nPages deployment may take a few moments. Verify the live homepage before considering it complete.",botBackKeyboard());});return true;}
    if(action.startsWith("hero:cancel:")){const token=action.slice("hero:cancel:".length);await env.BOT_CONFIG_KV?.delete("hero:pending:"+token);await botSend(env,chatId,"Hero image update cancelled. Live image unchanged.",botBackKeyboard());return true;}
    if(action==="hero:upload"){if(!env.BOT_CONFIG_KV){await botSend(env,chatId,"Configuration storage is not connected yet.",botBackKeyboard());return true;}await env.BOT_CONFIG_KV.put("hero:uploading:"+sender,JSON.stringify({at:Date.now()}),{expirationTtl:900});await botSend(env,chatId,"এখন Telegram-এ ছবিটি Photo হিসেবে পাঠান (File/Document নয়)। ১৫ মিনিটের মধ্যে পাঠাতে হবে।",botBackKeyboard());return true}
    if(action==="hero:current"){await botRunWithProgress(env,chatId,"বর্তমান Hero Image-এর তথ্য আনা হচ্ছে...",async()=>{const d=await (await fetch("https://kokushibu74.github.io/site-data.json",{signal:AbortSignal.timeout(10000)})).json();await botSend(env,chatId,"Current hero image:\n"+String(d.image||"Not set")+"\nPosition: "+String(d.imagePos??"default"),botBackKeyboard());});return true}
    if(action.startsWith("status:")){const bits=action.split(":");const category=bits[1],index=Number(bits[2]||0);const names={website:["","Site Health","Page Status","Manual Refresh"],news:["","Latest Feed","News Refresh Status","Source Health"],analytics:["","GA4 Status","Visitor Summary","Traffic Overview"],security:["","Security Status","Critical Protection","Recent Security Events"],github:["","Repository Status","Latest Commit","Workflow Status"],reports:["","Daily Report Status","Latest Report","Report History"],settings:["","Configuration Status","Admin Access","Bot Menu"],logs:["","Recent Worker Events","Workflow Logs","Security Logs"],recovery:["","Backup Branch","Worker Rollback Point","Recovery Guide"]};const label=names[category]?.[index]||"Status";await botRunWithProgress(env,chatId,"নির্বাচিত বিভাগের তথ্য সংগ্রহ ও যাচাই করা হচ্ছে...",async()=>{const result=await botStatusText(env,category,index);await botSend(env,chatId,"🔎 "+label+"\n"+result,botBackKeyboard());});return true;}
        await botShowMenu(env,chatId);
  }catch(e){console.error("Telegram button action failed",String(e&&e.stack||e).slice(0,1600));try{await botSend(env,chatId,"⚠️ কাজটি সম্পন্ন করা যায়নি।\\n\\nসম্ভাব্য কারণ: সংযোগে সমস্যা, প্রয়োজনীয় তথ্য পাওয়া যায়নি, অথবা Worker/API থেকে error এসেছে।\\n\\nকরণীয়:\\n1. কিছুক্ষণ পর আবার চেষ্টা করুন।\\n2. একই সমস্যা হলে Cloudflare Worker → Logs থেকে সংশ্লিষ্ট error পরীক্ষা করুন।\\n3. Hero Image বা User Manager-এর মতো পরিবর্তনকারী কাজ হলে আগে বর্তমান অবস্থা যাচাই করুন।",botBackKeyboard())}catch(deliveryError){console.error("Telegram callback error notice failed",String(deliveryError&&deliveryError.stack||deliveryError).slice(0,800))}}finally{try{await botMarkMenuInteraction(env,chatId,null,false)}catch(e){console.error("Telegram menu interaction metadata write failed",String(e&&e.stack||e).slice(0,800))}}
  return true;
}

async function umHandleCommand(env,msg){
  const text=String(msg.text||"").trim(),parts=text.split(/\s+/),cmd=(parts.shift()||"").split("@")[0].toLowerCase();
  const commands=new Set(["/start","/menu","/cmd","/userid","/userinfo","/userrename","/userlink","/userunlink","/userblock","/userunblock","/userhistory","/usersearch","/userstats"]);
  if(!commands.has(cmd))return false;
  const chatId=msg.chat.id,sender=String(msg.from?.id||"");
  if(msg.chat.type!=="private"){await umReply(env,chatId,"নিরাপত্তার জন্য এই কমান্ডগুলো Bot-এর Private Chat-এ ব্যবহার করুন।");return true;}
  const admins=new Set(String(env.ADMIN_TELEGRAM_IDS||"").split(/[\s,;]+/).map(x=>x.trim()).filter(Boolean));
  const isAdmin=admins.has(sender);
  if(cmd==="/start"||cmd==="/menu"){if(isAdmin)await botEnsureStartKeyboard(env,chatId);await botShowMenu(env,chatId);return true;}
  if(cmd==="/cmd"){
    const publicCommands=[{command:"start",description:"Admin control center খুলুন"},{command:"menu",description:"Admin control center খুলুন"},{command:"cmd",description:"সব উপলভ্য কমান্ড ও ব্যবহারবিধি"}];
    const adminCommands=[
      {command:"info",description:"সাইট ও Worker health check"},
      {command:"userid",description:"Telegram ও Website user list"},
      {command:"userinfo",description:"একজন user-এর বিস্তারিত তথ্য"},
      {command:"userrename",description:"User-এর custom ID নির্ধারণ"},
      {command:"userlink",description:"Telegram ও Website ID link"},
      {command:"userunlink",description:"Linked ID বিচ্ছিন্ন করা"},
      {command:"userblock",description:"Telegram/Website user block"},
      {command:"userunblock",description:"User unblock"},
      {command:"userhistory",description:"User-এর event history"},
      {command:"usersearch",description:"User profile search"},
      {command:"userstats",description:"User management statistics"}
    ];
    const menu=publicCommands.concat(isAdmin?adminCommands:[]);
    try{await fetch("https://api.telegram.org/bot"+env.TELEGRAM_BOT_TOKEN+"/setMyCommands",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({commands:menu,scope:{type:"chat",chat_id:chatId}})});}catch(e){console.error("Telegram command menu setup failed",String(e));}
    const guide=[
      "📚 BOT COMMAND GUIDE",
      "",
      "/cmd — এই কমান্ড গাইড ও Telegram command menu দেখাবে।",
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
  if(!admins.size){await umReply(env,chatId,"Admin access এখনো configure করা হয়নি। Cloudflare Worker-এ ADMIN_TELEGRAM_IDS secret যোগ করতে হবে।");return true;}
  if(!isAdmin){await umHistory(env,"telegram",sender,{type:"admin_command_rejected",command:cmd});await umReply(env,chatId,"⛔ এই কমান্ড ব্যবহারের অনুমতি নেই।");return true;}
  const arg=parts[0]||"",scopeArg=(parts[1]||"both").toLowerCase();
  try{
    if(cmd==="/userid"){
      const pageNo=Math.max(1,Math.min(999,Number(arg)||1)),limit=10,all=[];
      const tg=await umList(env,UM_PREFIX+"telegram:"),vis=await umList(env,UM_PREFIX+"visitor:");
      for(const k of tg){const p=await env.VISITOR_KV.get(k.name,"json");if(p)all.push({kind:"telegram",id:p.id,customId:p.customId,name:p.username?"@"+p.username:p.firstName||"Telegram user"});}
      for(const k of vis){const p=await env.VISITOR_KV.get(k.name,"json");if(p)all.push({kind:"visitor",id:p.id||p.visitorId,customId:p.customId,name:p.device?.deviceModel||p.device?.deviceType||"Website visitor"});}
      const legacy=await umList(env,"visitor:");for(const k of legacy){const id=k.name.slice(8);if(!all.some(x=>x.kind==="visitor"&&x.id===id))all.push({kind:"visitor",id,name:"Website visitor"});}
      all.sort((a,b)=>String(a.id).localeCompare(String(b.id)));
      const start=(pageNo-1)*limit,items=all.slice(start,start+limit);
      const lines=items.map((u,i)=>(start+i+1)+". "+(u.kind==="telegram"?"TG":"WEB")+" · "+(u.customId||u.id)+" · "+u.name);
      await umReply(env,chatId,"👥 User list — page "+pageNo+"\n"+(lines.join("\n")||"কোনো User পাওয়া যায়নি.")+"\n\nমোট: "+all.length+" · পরের পৃষ্ঠা: /userid "+(pageNo+1)); 
    }else if(cmd==="/userinfo"){
      const user=await umResolve(env,arg);if(!user){await umReply(env,chatId,"User পাওয়া যায়নি। Original ID বা Custom ID দিন।");return true;}
      const p=await umProfile(env,user)||{},blocked=await umBlocked(env,user.kind==="visitor"?"website":"telegram",user.id),custom=p.customId||"—",link=await env.VISITOR_KV.get(UM_PREFIX+"link:"+(user.kind==="telegram"?"telegram":"visitor")+":"+user.id,"json");
      const lines=["👤 USER INFO","Type: "+user.kind,"Original ID: "+user.id,"Custom ID: "+custom,"Linked ID: "+(user.kind==="telegram"?(link?.visitorId||"—"):(link?.telegramId||"—")),"Name: "+(p.firstName||p.username||p.device?.deviceModel||"—"),"First seen: "+(p.firstSeen?new Date(p.firstSeen).toISOString():"—"),"Last seen: "+(p.lastSeen?new Date(p.lastSeen).toISOString():"—"),"Blocked: "+(blocked?"Yes":"No")];
      if(user.kind==="visitor")lines.push("Sessions: "+(p.totalSessions||0),"Page views: "+(p.totalPageViews||0),"Device: "+[p.device?.deviceType,p.device?.os,p.device?.browser].filter(Boolean).join(" / "));
      else lines.push("Username: "+(p.username?"@"+p.username:"—"),"Language: "+(p.languageCode||"—"));
      await umReply(env,chatId,lines.join("\n"));
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
      rows.sort((a,b)=>(b.at||0)-(a.at||0));const start=(pageNo-1)*10;
      const lines=rows.slice(start,start+10).map(e=>new Date(e.at).toLocaleString("en-GB",{timeZone:"Asia/Dhaka"})+" · "+e.event.type+(e.event.command?" · "+e.event.command:"")+(e.event.path?" · "+e.event.path:""));
      await umReply(env,chatId,"🕘 History "+user.id+" · "+rows.length+" events\n"+(lines.join("\n")||"কোনো history নেই.")+"\nPage "+pageNo);
    }else if(cmd==="/usersearch"){
      const q=arg.toLowerCase();if(!q){await umReply(env,chatId,"ব্যবহার: /usersearch TEXT");return true;}
      const found=[];for(const prefix of [UM_PREFIX+"telegram:",UM_PREFIX+"visitor:"]){for(const k of await umList(env,prefix)){const p=await env.VISITOR_KV.get(k.name,"json");if(p&&JSON.stringify(p).toLowerCase().includes(q))found.push((p.kind||"visitor")+" · "+(p.customId||p.id||p.visitorId));if(found.length>=20)break;}}
      if(found.length<20)for(const k of await umList(env,"visitor:")){const p=await env.VISITOR_KV.get(k.name,"json");if(p&&JSON.stringify(p).toLowerCase().includes(q))found.push("visitor · "+(p.customId||p.visitorId||k.name.slice(8)));if(found.length>=20)break;}
      await umReply(env,chatId,"🔎 Search results\n"+(found.join("\n")||"কোনো match পাওয়া যায়নি."));
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
  if(!shouldNotify||!env.TELEGRAM_BOT_TOKEN||!env.TELEGRAM_CHAT_ID){await env.BOT_CONFIG_KV.put(key,JSON.stringify({failed,at:Date.now(),status:String(status)}),{expirationTtl:7776000});return;}
  const escape=s=>String(s||"").replace(/&/g,"&amp;").replace(/</g,"&lt;").replace(/>/g,"&gt;").slice(0,220);
  const title=failed?"🚨 <b>AUTOMATION FAILURE</b>":"✅ <b>AUTOMATION RECOVERED</b>";
  const body=[title,"⚙️ <b>Schedule:</b> <code>"+escape(cron)+"</code>","🕒 "+new Date().toLocaleString("en-GB",{timeZone:"Asia/Dhaka",dateStyle:"medium",timeStyle:"short"})+" (Bangladesh time)",(failed?"❌ ":"✅ ")+escape(detail||status)].join("\n");
  const response=await fetch("https://api.telegram.org/bot"+env.TELEGRAM_BOT_TOKEN+"/sendMessage",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({chat_id:env.TELEGRAM_CHAT_ID,text:body,parse_mode:"HTML",disable_web_page_preview:true}),signal:AbortSignal.timeout(10000)});
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
    return {section,settings:keys.map(key=>({key,label:names[key],enabled:!!cfg[key]})),text:keys.map(key=>(cfg[key]?"ON":"OFF")+" · "+names[key]).join("\\n"),source:"BOT_CONFIG_KV"};
  }
  if(section==="users"){
    const [telegram,visitors,legacy,blocks,history]=await Promise.all([umList(env,UM_PREFIX+"telegram:"),umList(env,UM_PREFIX+"visitor:"),umList(env,"visitor:"),umList(env,UM_PREFIX+"block:"),umList(env,UM_PREFIX+"history:")]);
    const websiteCount=new Set([...visitors.map(k=>k.name.slice((UM_PREFIX+"visitor:").length)),...legacy.map(k=>k.name.slice(8))]).size,limited=[telegram,visitors,legacy,blocks,history].some(list=>list.truncated);
    return {section,stats:{telegramProfiles:telegram.length,websiteProfiles:websiteCount,blockedRecords:blocks.length,historyRecords:history.length,limited},text:"USER MANAGER SUMMARY\\n\\nTelegram profiles: "+telegram.length+"\\nWebsite profiles: "+websiteCount+"\\nActive block records: "+blocks.length+"\\nHistory records: "+history.length+(limited?"\\n\\n⚠️ Partial snapshot: each category is capped at 2,000 records per request to protect Free KV usage. Search by exact ID for a specific profile.":"")+"\\n\\nSearch a Telegram ID, Visitor ID or custom ID below to inspect a profile.",source:"VISITOR_KV"};
  }
  if(section==="recovery")return {section,...await miniAppRecovery(env)};
  if(section==="logs"){const rows=await miniAppRecentAudit(env);return {section,rows,text:rows.length?rows.map(x=>new Date(x.at).toISOString()+" · "+x.action+" · admin "+x.userId).join("\\n"):"No Mini App audit events recorded yet.",source:"BOT_CONFIG_KV audit log"};}
  
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
  if(latest&&age<20*60*1000)return {skipped:true,reason:"recent-run",ageMinutes:Math.round(age/60000)};
  if(latest&&["queued","in_progress"].includes(latest.status)&&age<30*60*1000)return {skipped:true,reason:"already-running"};
  const dispatch=await fetch("https://api.github.com/repos/Kokushibu74/kokushibu74.github.io/actions/workflows/update-news.yml/dispatches",{method:"POST",headers:{...headers,"Content-Type":"application/json"},body:JSON.stringify({ref:"main"}),signal:AbortSignal.timeout(15000)});
  if(dispatch.status!==204){
    const responseText=await dispatch.text().catch(()=> "");
    let detail=responseText;
    try{const payload=JSON.parse(responseText);detail=payload.message||(payload.errors||[]).map(x=>x.message||x.code).join("; ")||responseText}catch{}
    detail=String(detail||"").replace(/[\\r\\n\\t]+/g," ").slice(0,160);
    if(dispatch.status===403)await env.BOT_CONFIG_KV.put(dispatchBlockedKey,JSON.stringify({status:403,at:now}),{expirationTtl:3600});
    throw new Error("GitHub news workflow dispatch failed (HTTP "+dispatch.status+")"+(detail?": "+detail:""));
  }
  await env.BOT_CONFIG_KV.delete(dispatchBlockedKey);
  await env.BOT_CONFIG_KV.put(cooldownKey,String(now),{expirationTtl:60*60});
  return {dispatched:true,ageMinutes:Number.isFinite(age)?Math.round(age/60000):null};
}
async function notifyNewsWatchdogFailure(env,error){
  if(!env.BOT_CONFIG_KV||!env.TELEGRAM_BOT_TOKEN||!env.TELEGRAM_CHAT_ID)return;
  const key="news-watchdog:last-error";
  if(await env.BOT_CONFIG_KV.get(key))return;
  await env.BOT_CONFIG_KV.put(key,"1",{expirationTtl:6*60*60});
  const detail=String(error?.message||"").replace(/[\\r\\n\\t]+/g," ").slice(0,220);
  const message="⚠️ News refresh watchdog could not verify or trigger the GitHub refresh workflow."+(detail?"\\nGitHub response: "+detail:"")+"\\nCheck the Worker GITHUB_TOKEN permission and repository Actions policy.";
  const response=await fetch("https://api.telegram.org/bot"+env.TELEGRAM_BOT_TOKEN+"/sendMessage",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({chat_id:env.TELEGRAM_CHAT_ID,text:message,disable_web_page_preview:true}),signal:AbortSignal.timeout(10000)});
  if(!response.ok)throw new Error("Telegram watchdog warning delivery failed (HTTP "+response.status+")");
}

export default {
  async fetch(request, env) {
    const origin = request.headers.get("Origin") || "";
    const allowedOrigin = "https://kokushibu74.github.io";
    const cors = {"Access-Control-Allow-Origin":allowedOrigin,"Access-Control-Allow-Methods":"POST, OPTIONS","Access-Control-Allow-Headers":"Content-Type","Vary":"Origin"};
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
          const cfg=await botConfig(env);
          if(!cfg.newsRefresh)return respond({ok:false,error:"Automatic News Refresh is OFF. Enable it in Automation before manual refresh."},409);
          await miniAppAudit(env,user.id,"newsRefresh_attempt",{workflow:"update-news.yml",branch:"main"});
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

    if(pathname==="/workflow-config"){const cfg=await botConfig(env);return respond({monitoring:!!cfg.monitoring,dailyReport:!!cfg.dailyReport,scheduledChecks:!!cfg.scheduledChecks,newsRefresh:!!cfg.newsRefresh,workflowAlerts:!!cfg.workflowAlerts,trafficAlerts:!!cfg.trafficAlerts,clientErrorAlerts:!!cfg.clientErrorAlerts,securityAlerts:!!cfg.securityAlerts,emergencyProtection:!!cfg.emergencyProtection});}
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
      const sendAlert=async(key,text)=>{const marker="alert:"+key;const seen=await env.VISITOR_KV.get(marker);if(seen)return;await env.VISITOR_KV.put(marker,"1",{expirationTtl:86400});try{await fetch("https://api.telegram.org/bot"+env.TELEGRAM_BOT_TOKEN+"/sendMessage",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({chat_id:env.TELEGRAM_CHAT_ID,text:botFormatTelegramResponse(text,{parse_mode:"HTML"}),parse_mode:"HTML",disable_web_page_preview:true})})}catch(e){console.error("Visitor alert failed",String(e))}};
      if(pageView&&traffic===40&&botCfg.trafficAlerts&&env.TELEGRAM_BOT_TOKEN&&env.TELEGRAM_CHAT_ID)await sendAlert("spike:"+bucket,"📈 <b>TRAFFIC SPIKE</b>\nAt least 40 page events in 5 minutes.\nCurrent page: "+clean(page,120)+"\nTime: "+new Date(now).toLocaleString("en-US",{timeZone:"Asia/Dhaka"}));
      const errorEvents=events.filter(e=>e.type==="js_error"||e.type==="promise_error");
      if(errorEvents.length&&botCfg.clientErrorAlerts&&env.TELEGRAM_BOT_TOKEN&&env.TELEGRAM_CHAT_ID)await sendAlert("errors:"+id+":"+Math.floor(now/86400000),"🔴 <b>CLIENT ERROR</b>\nVisitor: <code>"+id+"</code>\nPage: "+clean(page,120)+"\nErrors reported: "+errorEvents.length+"\nDetails: "+clean(errorEvents[0].value,160));
      const sessionViews=pageView?(newSession?1:(Number(old.sessionPageViews)||0)+1):(Number(old.sessionPageViews)||0);
      if(pageView&&sessionViews>=30&&botCfg.securityAlerts&&botCfg.emergencyProtection&&env.TELEGRAM_BOT_TOKEN&&env.TELEGRAM_CHAT_ID)await sendAlert("security:"+id+":"+session,"⚠️ <b>UNUSUAL VISITOR ACTIVITY</b>\nVisitor: <code>"+id+"</code>\n30+ page views in one session.\nIP: <code>"+clean(profile.network.ip,64)+"</code>");

      const stamp=new Date(now).toLocaleString("en-US",{timeZone:"Asia/Dhaka",dateStyle:"medium",timeStyle:"short"});
      const esc=s=>String(s||"").replace(/&/g,"&amp;").replace(/</g,"&lt;").replace(/>/g,"&gt;");
      const displayIp=profile.network.ip||"Unavailable";
      const geo=[profile.network.city,profile.network.region,profile.network.country].filter(Boolean).join(", ")||"Unknown";
      const device=[profile.device.deviceType,profile.device.deviceModel,profile.device.os,profile.device.browser].filter(Boolean).join(" / ")||ua.slice(0,100);
      if(pageView&&newSession&&botCfg.monitoring&&env.TELEGRAM_BOT_TOKEN&&env.TELEGRAM_CHAT_ID){
        const title=first?"🟢 <b>NEW VISITOR</b>":"🔵 <b>RETURNING VISITOR</b>";
        const text=[title,"🆔 <code>"+id+"</code>","🌍 Location: "+esc(geo),"🌐 IP ("+esc(profile.network.ipVersion)+"): <code>"+esc(displayIp)+"</code>","📡 ISP: "+esc(profile.network.isp||"Unknown")+" · ASN: "+esc(profile.network.asn||"Unknown"),"📶 Network type: "+esc(profile.network.networkType),"📱 Carrier: "+esc(profile.network.carrier),"🛰️ Hosting/VPN hint: "+esc(profile.network.hostingSignal),"🛡️ Proxy signal: "+esc(profile.network.corporateProxy),"📱 Device: "+esc(device),"🧩 Platform: "+esc(profile.device.platform||"Unknown"),"📶 Browser connection hint: "+esc(profile.device.connection||"Unknown"),"🔗 Page: "+esc(page),"↩️ Referrer: "+esc(profile.source.referrer||"Direct"),"📊 Visits: "+profile.totalSessions+" · Page views: "+profile.totalPageViews,"🕒 "+esc(stamp)+" (BDT)"].join("\n");
        try{await fetch("https://api.telegram.org/bot"+env.TELEGRAM_BOT_TOKEN+"/sendMessage",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({chat_id:env.TELEGRAM_CHAT_ID,text,parse_mode:"HTML",disable_web_page_preview:true})})}catch(e){console.error("Visitor Telegram alert failed",String(e))}
      }
      return respond({ok:true,visitorId:id,firstVisit:first,newSession,totalSessions:profile.totalSessions,totalPageViews:profile.totalPageViews});
    }
    if(new URL(request.url).pathname==="/telegram-webhook"){
      if(request.method!=="POST")return new Response("Method not allowed",{status:405});
      if(!env.TELEGRAM_WEBHOOK_SECRET||request.headers.get("X-Telegram-Bot-Api-Secret-Token")!==env.TELEGRAM_WEBHOOK_SECRET)return new Response("Unauthorized",{status:401});
      let update;try{update=await request.json()}catch{return new Response("Bad request",{status:400})}
      if(update.callback_query){try{await botHandleCallback(env,update.callback_query)}catch(e){console.error("Telegram callback handler failed",String(e))}return new Response("OK");}
      const msg=update.message;
      if(msg?.chat?.type==="private"&&Array.isArray(msg.photo)&&msg.from?.id){
        const sender=String(msg.from.id),admins=new Set(String(env.ADMIN_TELEGRAM_IDS||"").split(/[\s,;]+/).map(x=>x.trim()).filter(Boolean));
        if(admins.has(sender)&&env.BOT_CONFIG_KV){
          const mode=await env.BOT_CONFIG_KV.get("hero:uploading:"+sender,"json");
          if(mode){const photo=msg.photo[msg.photo.length-1],token=crypto.randomUUID();await env.BOT_CONFIG_KV.delete("hero:uploading:"+sender);await env.BOT_CONFIG_KV.put("hero:pending:"+token,JSON.stringify({fileId:photo.file_id,adminId:sender,expiresAt:Date.now()+900000}),{expirationTtl:900});const preview="https://portfolio-contact-telegram.mdshihab74.workers.dev/hero-preview?token="+encodeURIComponent(token);await botSend(env,msg.chat.id,"🖼️ HERO PREVIEW READY\nআগে ওয়েবসাইটের আসল Hero layout-এ ছবিটি দেখুন:\n"+preview+"\n\nPreview ১৫ মিনিটের জন্য সচল থাকবে।",[[{text:"✅ Confirm & Publish",callback_data:"b1:hero:confirm:"+token}],[{text:"✖️ Cancel",callback_data:"b1:hero:cancel:"+token}]]);return new Response("OK")}
        }
      }
      if(!msg?.chat||typeof msg.text!=="string")return new Response("OK");
      if(msg.chat.type==="private"&&msg.from?.id&&env.BOT_CONFIG_KV){
        const adminSet=new Set(String(env.ADMIN_TELEGRAM_IDS||"").split(/[\s,;]+/).filter(Boolean));if(adminSet.has(String(msg.from.id))&&await botHandleStartButton(env,msg))return new Response("OK");const inputKey="bot:user-input:"+String(msg.from.id),pending=await env.BOT_CONFIG_KV.get(inputKey,"json");
        if(pending?.mode){
          await env.BOT_CONFIG_KV.delete(inputKey);
          const raw=String(msg.text||"").trim().slice(0,500),parts=raw.split(/\s+/);let command="";
          if(pending.mode==="search")command="/usersearch "+raw;
          else if(pending.mode==="history")command="/userhistory "+parts[0];
          else if(pending.mode==="link")command=/^unlink\s+/i.test(raw)?"/userunlink "+raw.replace(/^unlink\s+/i,""):"/userlink "+raw;
          else if(pending.mode==="block")command=/^unblock\s+/i.test(raw)?"/userunblock "+raw.replace(/^unblock\s+/i,""):"/userblock "+raw;
          else if(pending.mode==="rename")command="/userrename "+parts[0]+" "+parts.slice(1).join(" ");
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
      // Keep the existing minute Cron; run KV cleanup on quarter-hours and watchdog five minutes later.
      const minute=new Date().getUTCMinutes();
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
    const daily=hour===23&&minute<30;
    let status=null,responseMs=null,missing=[],failure="";
    try{
      const res=await fetch(site,{method:"GET",redirect:"follow",signal:AbortSignal.timeout(15000)});
      status=res.status;responseMs=Math.round(performance.now()-started);
      const h=res.headers,checks=[["Content-Security-Policy",h.get("content-security-policy")],["Strict-Transport-Security",h.get("strict-transport-security")],["X-Content-Type-Options",h.get("x-content-type-options")],["X-Frame-Options",h.get("x-frame-options")],["Referrer-Policy",h.get("referrer-policy")]];
      missing=checks.filter(x=>!x[1]).map(x=>x[0]);if(!res.ok)failure="Website returned HTTP "+res.status;
    }catch(e){failure=String(e&&e.message||e).slice(0,180);responseMs=Math.round(performance.now()-started)}
    if(!env.TELEGRAM_BOT_TOKEN||!env.TELEGRAM_CHAT_ID){console.error("Telegram secrets missing; monitor could not send messages.");await miniAppCronRecord(env,{id:cronRunId,at:cronStartedAt,status:"warning",cron:controller.cron,durationMs:Date.now()-cronStartedAt,httpStatus:status,detail:"Telegram credentials missing; monitoring message could not be sent."});await miniAppCronAlert(env,controller.cron,"warning","Telegram credentials missing; monitor message not sent.");return}
    const sendTelegram=async text=>{
      const tg=await fetch("https://api.telegram.org/bot"+env.TELEGRAM_BOT_TOKEN+"/sendMessage",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({chat_id:env.TELEGRAM_CHAT_ID,text,parse_mode:"HTML",disable_web_page_preview:true})});
      const payload=await tg.json().catch(()=>({}));if(!tg.ok||!payload.ok)throw new Error("Telegram message delivery failed (HTTP "+tg.status+")");
    };

    if(runChecks&&cfg.trafficAlerts){
      try{await cfResourceBudgetCheck(env,sendTelegram,now);}
      catch(e){
        console.error("Cloudflare resource budget monitor failed:",String(e&&e.message||e).slice(0,220));
        try{const key="cloudflare:budget-monitor-error:v1",old=await env.BOT_CONFIG_KV.get(key,"json");if(!old?.at||Date.now()-Number(old.at)>6*60*60*1000){await sendTelegram("⚠️ <b>Cloudflare resource monitor unavailable</b>\n"+String(e&&e.message||e).replace(/[&<>]/g," ").slice(0,180));await env.BOT_CONFIG_KV.put(key,JSON.stringify({at:Date.now()}),{expirationTtl:2*86400});}}catch(notifyError){console.error("Cloudflare budget monitor warning could not be delivered:",String(notifyError&&notifyError.message||notifyError).slice(0,120));}
      }
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
    if(daily&&cfg.dailyReport&&runChecks){ let gaLines,visitorLines; try { const g=await ga4Report(); gaLines=["📈 <b>GA4 — Today (Bangladesh time; through report time)</b>","👥 Active users: "+g.users,"🔁 Sessions: "+g.sessions,"👁️ Page views: "+g.views,"💬 Engagement rate: "+(Number(g.engagement)*100).toFixed(2)+"%"]; } catch(e) { gaLines=["⚠️ <b>GA4 report unavailable</b>","<code>"+String(e&&e.message||e).replace(/&/g,"&amp;").replace(/</g,"&lt;").replace(/>/g,"&gt;").slice(0,280)+"</code>"]; }  try { const d=bdDay(),x=await readDailyActivity(env,d),p=await readDailyActivity(env,previousBdDay(d)); visitorLines=["📊 <b>Visitor Activity Summary — Today</b>",...dailyActivityLines(x,p).map(v=>v.replace(/&/g,"&amp;").replace(/</g,"&lt;").replace(/>/g,"&gt;"))]; } catch(e) { visitorLines=["⚠️ Visitor Activity Summary unavailable: "+String(e&&e.message||e).slice(0,140)]; } await sendTelegramText(env,env.TELEGRAM_CHAT_ID,["📊 <b>Website Daily Health Report</b>","🕒 "+stamp+" (Bangladesh time)","🌐 "+site,failure?"🚨 Site status: DOWN / ERROR — "+failure:"✅ Site response: HTTP "+status,responseMs===null?"":"⏱️ Response time: "+responseMs+" ms",missing.length?"🔎 Security headers missing/not exposed: "+missing.join(", "):"🛡️ Basic security headers: present","",...gaLines,"",...visitorLines,"","ℹ️ Basic uptime/header check, not a full security audit."].filter(Boolean).join("\n"),{parse_mode:"HTML"});}
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