import cricketWorker from "./cricket.js";
/**
 * Sports Zone API — Cloudflare Workers.
 * Public: GET /health, /api/football, /api/cricket, /api/streams
 * Admin: POST /api/streams (Bearer ADMIN_KEY)
 */
const ALLOWED_ORIGIN = "https://kokushibu74.github.io";
const FOOTBALL_LEAGUES = new Set(["eng.1","esp.1","ger.1","ita.1","fra.1","uefa.champions","usa.1"]);
const CRICKET_LEAGUE_RE = /^[a-zA-Z0-9._-]{1,40}$/;
const YOUTUBE_ID_RE = /^[a-zA-Z0-9_-]{11}$/;
const CATEGORIES = new Set(["football","cricket","general"]);
const RATE_LIMIT = 60, RATE_WINDOW_MS = 60_000;
const buckets = new Map();

function json(data, status=200, extra={}) {
  return new Response(JSON.stringify(data), {status, headers:{
    "Content-Type":"application/json; charset=utf-8",
    "Cache-Control":"no-store",
    "X-Content-Type-Options":"nosniff",
    "Referrer-Policy":"strict-origin-when-cross-origin",
    "Access-Control-Allow-Origin":ALLOWED_ORIGIN,
    "Vary":"Origin",
    ...extra
  }});
}
function limited(request) {
  const now=Date.now(), ip=request.headers.get("CF-Connecting-IP")||"unknown";
  let b=buckets.get(ip);
  if(!b || now-b.started>=RATE_WINDOW_MS) { b={started:now,count:0}; buckets.set(ip,b); }
  b.count++;
  if(buckets.size>5000) {
    for(const [key,value] of buckets) if(now-value.started>=RATE_WINDOW_MS) buckets.delete(key);
    while(buckets.size>5000) buckets.delete(buckets.keys().next().value);
  }
  return b.count>RATE_LIMIT;
}
function normalizeMatch(event) {
  const c=event?.competitions?.[0], teams=c?.competitors||[];
  const home=teams.find(x=>x.homeAway==="home")||teams[0]||{};
  const away=teams.find(x=>x.homeAway==="away")||teams[1]||{};
  const state=c?.status?.type?.state||event?.status?.type?.state||"";
  return {
    id:String(event?.id||""), name:String(event?.name||event?.shortName||"Match"),
    shortName:String(event?.shortName||event?.name||"Match"),
    status:state==="in"?"live":state==="post"?"finished":"scheduled",
    statusDetail:String(c?.status?.type?.shortDetail||c?.status?.type?.detail||event?.status?.type?.detail||""),
    minute:String(c?.status?.displayClock||""), startTime:event?.date||null,
    homeTeam:String(home?.team?.displayName||home?.team?.name||"Home"),
    awayTeam:String(away?.team?.displayName||away?.team?.name||"Away"),
    homeLogo:typeof home?.team?.logo==="string"?home.team.logo:null,
    awayLogo:typeof away?.team?.logo==="string"?away.team.logo:null,
    homeScore:home?.score==null?null:String(home.score),
    awayScore:away?.score==null?null:String(away.score)
  };
}
async function scoreboard(upstreamUrl,ctx,env,cacheId) {
  // Use the configured KV namespace for a short cache; this also works on workers.dev.
  const cacheKey="score-cache:"+cacheId;
  if(env.SPORTS_ZONE) {
    try {
      const cached=await env.SPORTS_ZONE.get(cacheKey,"json");
      if(cached && Array.isArray(cached.matches)) return json(cached,200,{"Cache-Control":"public, max-age=25","X-Sports-Zone-Cache":"HIT"});
    } catch { /* Cache failures must not take down the score endpoint. */ }
  }
  const response=await fetch(upstreamUrl,{headers:{Accept:"application/json","User-Agent":"SportsZone/1.0 (+https://kokushibu74.github.io)"},signal:AbortSignal.timeout(8000)});
  if(!response.ok) throw new Error("Provider HTTP "+response.status);
  const data=await response.json();
  if(!data||!Array.isArray(data.events)) throw new Error("Unexpected provider response");
  const order={live:0,scheduled:1,finished:2};
  const matches=data.events.map(normalizeMatch).sort((a,b)=>(order[a.status]??3)-(order[b.status]??3));
  const payload={ok:true,status:"ok",updated:new Date().toISOString(),matches};
  if(env.SPORTS_ZONE) ctx.waitUntil(env.SPORTS_ZONE.put(cacheKey,JSON.stringify(payload),{expirationTtl:60}).catch(()=>{}));
  return json(payload,200,{"Cache-Control":"public, max-age=25","X-Sports-Zone-Cache":"MISS"});
}
function validStream(s) {
  return !!s && typeof s.id==="string" && typeof s.name==="string" && s.name.trim().length>0 && s.name.trim().length<=80 &&
    typeof s.youtubeId==="string" && YOUTUBE_ID_RE.test(s.youtubeId) && CATEGORIES.has(s.category) && s.isOfficial===true &&
    typeof s.officialUrl==="string" && /^https:\/\/(www\.)?(youtube\.com|youtube-nocookie\.com)\//i.test(s.officialUrl);
}
const AUTO_STREAMS_KEY = "auto:streams";
const AUTO_SCHEDULE_KEY = "auto:schedule";
const AUTO_STATUS_KEY = "auto:status";
const YOUTUBE_DAILY_SEARCH_LIMIT = 70;
const SCHEDULE_CACHE_SECONDS = 15 * 60;

function youtubeChannelAllowlist(env) {
  return new Set(String(env.YOUTUBE_OFFICIAL_CHANNEL_IDS || "").split(",").map(x=>x.trim()).filter(Boolean));
}
function utcDateStamp(date) {
  return date.getUTCFullYear()+String(date.getUTCMonth()+1).padStart(2,"0")+String(date.getUTCDate()).padStart(2,"0");
}
async function getUpcomingEvents(env, now=new Date()) {
  if(!env.SPORTS_ZONE) return {events:[],fetchErrors:[{source:"kv",message:"KV namespace is not configured"}],fetchCount:0};
  try {
    const cached=await env.SPORTS_ZONE.get(AUTO_SCHEDULE_KEY,"json");
    if(cached && Array.isArray(cached.events) && Date.now()-Number(cached.savedAt||0)<SCHEDULE_CACHE_SECONDS*1000) {
      return {events:cached.events,fetchErrors:Array.isArray(cached.fetchErrors)?cached.fetchErrors:[],fetchCount:0,cached:true};
    }
  } catch (e) { console.error("Sports Zone schedule cache read failed:",e?.message||"unknown"); }

  // ESPN Site Scoreboard no longer reliably accepts date ranges. Fetch each
  // UTC calendar day separately, then merge and deduplicate event IDs.
  const dates=[utcDateStamp(now)];
  // Tomorrow is only needed during the final 30 minutes before UTC midnight.
  if(now.getUTCHours()===23&&now.getUTCMinutes()>=30) dates.push(utcDateStamp(new Date(now.getTime()+24*60*60*1000)));
  const sources=[
    ...[...FOOTBALL_LEAGUES].map(league=>({sport:"football",league,path:"soccer/"+league})),
    {sport:"cricket",league:"8039",path:"cricket/8039"}
  ];
  const requests=sources.flatMap(source=>dates.map(date=>({source,date})));
  const results=await Promise.all(requests.map(async ({source,date})=>{
    const url="https://site.api.espn.com/apis/site/v2/sports/"+source.path+"/scoreboard?dates="+date;
    try {
      const r=await fetch(url,{headers:{Accept:"application/json","User-Agent":"SportsZone/1.0"},signal:AbortSignal.timeout(7000)});
      if(!r.ok) return {events:[],error:{sport:source.sport,league:source.league,date,httpStatus:r.status}};
      const data=await r.json();
      if(!data||!Array.isArray(data.events)) return {events:[],error:{sport:source.sport,league:source.league,date,message:"Unexpected ESPN response"}};
      return {events:data.events.map(event=>({...normalizeMatch(event),sport:source.sport,league:source.league}))
        .filter(e=>e.id&&e.startTime&&e.homeTeam&&e.awayTeam)};
    } catch(e) {
      return {events:[],error:{sport:source.sport,league:source.league,date,message:String(e?.message||"request failed").slice(0,160)}};
    }
  }));
  const fetchErrors=results.filter(x=>x.error).map(x=>x.error);
  const successfulFetches=results.length-fetchErrors.length;
  const events=[...new Map(results.flatMap(x=>x.events).map(e=>[e.sport+":"+e.id,e])).values()]
    .sort((a,b)=>new Date(a.startTime)-new Date(b.startTime));
  // Do not cache an all-failed result: the next cron run should retry.
  if(successfulFetches>0) {
    await env.SPORTS_ZONE.put(AUTO_SCHEDULE_KEY,JSON.stringify({savedAt:Date.now(),events,fetchErrors,fetchCount:results.length}),{expirationTtl:SCHEDULE_CACHE_SECONDS+60}).catch(e=>console.error("Sports Zone schedule cache write failed:",e?.message||"unknown"));
  }
  return {events,fetchErrors,fetchCount:results.length,cached:false};
}
async function youtubeApi(env, endpoint, params) {
  const u=new URL("https://www.googleapis.com/youtube/v3/"+endpoint);
  for(const [k,v] of Object.entries(params)) if(v!==undefined&&v!==null) u.searchParams.set(k,String(v));
  u.searchParams.set("key",env.YOUTUBE_API_KEY);
  const r=await fetch(u.toString(),{headers:{Accept:"application/json"},signal:AbortSignal.timeout(8000)});
  const data=await r.json().catch(()=>({}));
  if(!r.ok) throw new Error("YouTube API HTTP "+r.status);
  return data;
}
async function refreshAutoStreams(env) {
  if(!env.SPORTS_ZONE) throw new Error("KV namespace is not configured");
  if(!env.YOUTUBE_API_KEY) {
    await env.SPORTS_ZONE.put(AUTO_STATUS_KEY,JSON.stringify({configured:false,reason:"YOUTUBE_API_KEY is not configured",checkedAt:new Date().toISOString()}),{expirationTtl:86400}).catch(()=>{});
    return;
  }
  const allowlist=youtubeChannelAllowlist(env);
  if(!allowlist.size) {
    await env.SPORTS_ZONE.put(AUTO_STATUS_KEY,JSON.stringify({configured:false,reason:"YOUTUBE_OFFICIAL_CHANNEL_IDS is not configured",checkedAt:new Date().toISOString()}),{expirationTtl:86400}).catch(()=>{});
    return;
  }
  const now=new Date(), dayKey="auto:youtube-searches:"+utcDateStamp(now);
  let streams=[];
  try { const saved=await env.SPORTS_ZONE.get(AUTO_STREAMS_KEY,"json"); if(Array.isArray(saved)) streams=saved.filter(validStream); } catch {}
  if(streams.length) {
    try {
      const data=await youtubeApi(env,"videos",{part:"snippet",id:streams.map(s=>s.youtubeId).slice(0,50).join(",")});
      const liveSet=new Set((data.items||[]).filter(v=>v.snippet?.liveBroadcastContent==="live").map(v=>v.id));
      streams=streams.filter(s=>liveSet.has(s.youtubeId));
    } catch (e) {
      await env.SPORTS_ZONE.put(AUTO_STATUS_KEY,JSON.stringify({configured:true,reason:"Could not refresh live status; retaining last known streams",checkedAt:now.toISOString()}),{expirationTtl:86400}).catch(()=>{});
      return;
    }
  }
  const schedule=await getUpcomingEvents(env,now);
  const events=schedule.events;
  let used=Number(await env.SPORTS_ZONE.get(dayKey)||0), searches=0;
  const additions=[];
  for(const event of events) {
    const kickoff=new Date(event.startTime).getTime(), delta=(kickoff-now.getTime())/60000;
    if(!Number.isFinite(kickoff)||event.status==="finished"||delta < -75||delta > 30) continue;
    const stage=delta>5?1:delta>-15?2:3;
    const stageKey="auto:searched:"+event.sport+":"+event.id+":"+stage;
    if(await env.SPORTS_ZONE.get(stageKey)) continue;
    if(used>=YOUTUBE_DAILY_SEARCH_LIMIT||searches>=3) break;
    try {
      searches++; used++;
      const q='"'+event.homeTeam+'" "'+event.awayTeam+'"';
      const data=await youtubeApi(env,"search",{part:"snippet",type:"video",eventType:"live",videoEmbeddable:"true",maxResults:10,order:"relevance",q});
      await env.SPORTS_ZONE.put(stageKey,now.toISOString(),{expirationTtl:8*24*60*60});
      const items=(data.items||[]).filter(item=>YOUTUBE_ID_RE.test(item.id?.videoId||"")&&allowlist.has(item.snippet?.channelId)&&item.snippet?.liveBroadcastContent==="live");
      for(const item of items) {
        const id=item.id.videoId;
        additions.push({id:"auto-"+id,name:String(item.snippet.title||event.name).slice(0,80),youtubeId:id,category:event.sport,isOfficial:true,
          officialUrl:"https://www.youtube.com/watch?v="+id,source:"youtube-auto",channelId:item.snippet.channelId,
          channelTitle:String(item.snippet.channelTitle||"Verified channel").slice(0,100),eventId:event.id,matchName:event.name,startTime:event.startTime});
      }
    } catch (e) { console.error("Sports Zone YouTube discovery failed:",e?.message||"unknown"); }
  }
  await env.SPORTS_ZONE.put(dayKey,String(used),{expirationTtl:48*60*60}).catch(()=>{});
  const merged=[...streams,...additions];
  const deduped=[...new Map(merged.map(s=>[s.youtubeId,s])).values()].filter(s=>allowlist.has(s.channelId)||!s.source);
  await env.SPORTS_ZONE.put(AUTO_STREAMS_KEY,JSON.stringify(deduped),{expirationTtl:2*60*60});
  const scheduleReason=schedule.fetchErrors.length===schedule.fetchCount&&schedule.fetchCount>0
    ?"ESPN schedule fetch failed"
    :schedule.fetchErrors.length?"Partial ESPN schedule fetch errors"
    :"ok";
  await env.SPORTS_ZONE.put(AUTO_STATUS_KEY,JSON.stringify({configured:true,reason:scheduleReason,checkedAt:now.toISOString(),
    scheduleEvents:events.length,scheduleFetches:schedule.fetchCount,scheduleFetchErrors:schedule.fetchErrors.slice(0,8),
    scheduleCached:!!schedule.cached,liveStreams:deduped.length,searchesToday:used,dailySearchLimit:YOUTUBE_DAILY_SEARCH_LIMIT}),{expirationTtl:86400});
}
async function getStreams(env) {
  if(!env.SPORTS_ZONE) return [];
  const manual=await env.SPORTS_ZONE.get("streams","json").catch(()=>[]);
  const automatic=await env.SPORTS_ZONE.get(AUTO_STREAMS_KEY,"json").catch(()=>[]);
  const combined=[...(Array.isArray(automatic)?automatic:[]),...(Array.isArray(manual)?manual:[])];
  return [...new Map(combined.filter(validStream).map(s=>[s.youtubeId,{id:s.id,name:s.name,youtubeId:s.youtubeId,category:s.category,isOfficial:true,officialUrl:s.officialUrl,
    ...(s.source?{source:s.source,channelTitle:s.channelTitle,channelId:s.channelId,eventId:s.eventId,matchName:s.matchName,startTime:s.startTime}:{})}])).values()];
}
export default {
  async scheduled(controller,env,ctx) {
    ctx.waitUntil(refreshAutoStreams(env).catch(async e=>{ console.error("Sports Zone scheduled discovery failed:",e?.message||"unknown"); if(env.SPORTS_ZONE) await env.SPORTS_ZONE.put(AUTO_STATUS_KEY,JSON.stringify({configured:!!env.YOUTUBE_API_KEY,reason:"Scheduled discovery failed; check Worker logs",checkedAt:new Date().toISOString()}),{expirationTtl:86400}).catch(()=>{}); }));
  },
  async fetch(request,env,ctx) {
    const url=new URL(request.url), origin=request.headers.get("Origin");
    if(url.pathname==="/" && request.method==="GET") return cricketWorker.fetch(request);
    if(url.pathname.startsWith("/matches/")) return cricketWorker.fetch(request);
    if(url.pathname==="/health" && request.method==="GET") return json({status:"ok",service:"unified-sports-api",time:new Date().toISOString(),kvConfigured:!!env.SPORTS_ZONE,routes:["/api/football","/api/football/details?league=eng.1&match=ID","/api/cricket","/api/streams","/api/streams/status","/matches/live","/matches/scorecard?match=ID","/matches/full-commentary?match=ID&innings=1","/matches/ball-by-ball?match=ID&innings=1","/matches/commentary?match=ID&innings=1","/matches/live-score?match=ID","/matches/details?match=ID"]},200);
    if(origin && origin!==ALLOWED_ORIGIN) return new Response(JSON.stringify({error:"origin not allowed"}),{status:403,headers:{"Content-Type":"application/json"}});
    const cors={"Access-Control-Allow-Origin":ALLOWED_ORIGIN,"Access-Control-Allow-Methods":"GET, POST, OPTIONS","Access-Control-Allow-Headers":"Content-Type, Authorization","Access-Control-Max-Age":"86400","Vary":"Origin"};
    if(request.method==="OPTIONS") return new Response(null,{status:204,headers:cors});
    if(url.pathname==="/health"&&request.method==="GET") return json({status:"ok",time:new Date().toISOString(),kvConfigured:!!env.SPORTS_ZONE});
    if(!["GET","POST"].includes(request.method)) return json({error:"method not allowed"},405,{Allow:"GET, POST, OPTIONS"});
    if(url.pathname.startsWith("/api/")&&limited(request)) return json({error:"rate limit exceeded",retryAfterSeconds:60},429,{"Retry-After":"60"});
    if(url.pathname==="/api/football"&&request.method==="GET") {
      const league=url.searchParams.get("league")||"eng.1";
      if(!FOOTBALL_LEAGUES.has(league)) return json({ok:false,error:"invalid league"},400);
      try { return await scoreboard("https://site.api.espn.com/apis/site/v2/sports/soccer/"+league+"/scoreboard",ctx,env,"football:"+league); }
      catch { return json({ok:false,status:"error",message:"Football scores are temporarily unavailable."},502); }
    }
    if(url.pathname==="/api/football/details"&&request.method==="GET") {
      const league=url.searchParams.get("league")||"eng.1", match=url.searchParams.get("match")||"";
      if(!FOOTBALL_LEAGUES.has(league)||!/^\\d{5,20}$/.test(match)) return json({ok:false,error:"invalid league or match ID"},400);
      try {
        const upstream="https://site.api.espn.com/apis/site/v2/sports/soccer/"+league+"/summary?event="+encodeURIComponent(match);
        const response=await fetch(upstream,{headers:{Accept:"application/json","User-Agent":"SportsZone/1.0"},signal:AbortSignal.timeout(8000)});
        if(!response.ok) throw new Error("ESPN summary HTTP "+response.status);
        const data=await response.json();
        return json({ok:true,matchId:match,league,updated:new Date().toISOString(),data},200,{"Cache-Control":"public, max-age=10"});
      } catch(e) { return json({ok:false,error:"Football match details are temporarily unavailable.",detail:String(e?.message||e)},502); }
    }
    if(url.pathname==="/api/cricket"&&request.method==="GET") {
      const league=url.searchParams.get("league")||"8039";
      if(!CRICKET_LEAGUE_RE.test(league)) return json({ok:false,error:"invalid league"},400);
      try { return await scoreboard("https://site.api.espn.com/apis/site/v2/sports/cricket/"+encodeURIComponent(league)+"/scoreboard",ctx,env,"cricket:"+league); }
      catch { return json({ok:false,status:"error",message:"Cricket provider unavailable for this competition."},502); }
    }
    if(url.pathname==="/api/streams"&&request.method==="GET") {
      try { return json({ok:true,status:"ok",streams:await getStreams(env)}); }
      catch { return json({ok:false,error:"stream configuration unavailable"},503); }
    }
    if(url.pathname==="/api/streams/status"&&request.method==="GET") {
      const status=env.SPORTS_ZONE?await env.SPORTS_ZONE.get(AUTO_STATUS_KEY,"json").catch(()=>null):null;
      const hasKey=!!env.YOUTUBE_API_KEY,hasAllowlist=youtubeChannelAllowlist(env).size>0;
      return json({ok:true,status:"ok",autoDiscovery:status||{configured:hasKey&&hasAllowlist,reason:!hasKey?"YOUTUBE_API_KEY is not configured":!hasAllowlist?"YOUTUBE_OFFICIAL_CHANNEL_IDS is not configured":"Waiting for first scheduled check"},searchLimitPerDay:YOUTUBE_DAILY_SEARCH_LIMIT});
    }
    if(url.pathname==="/api/streams"&&request.method==="POST") {
      if(!env.ADMIN_KEY||request.headers.get("Authorization")!=="Bearer "+env.ADMIN_KEY) return json({error:"unauthorized"},401);
      if(!env.SPORTS_ZONE) return json({error:"KV namespace SPORTS_ZONE is not configured"},503);
      let body; try { body=await request.json(); } catch { return json({error:"invalid JSON body"},400); }
      const stream={id:crypto.randomUUID(),name:typeof body?.name==="string"?body.name.trim():"",youtubeId:typeof body?.youtubeId==="string"?body.youtubeId.trim():"",category:typeof body?.category==="string"?body.category:"general",officialUrl:typeof body?.officialUrl==="string"?body.officialUrl.trim():"",isOfficial:body?.isOfficial===true};
      if(!validStream(stream)) return json({error:"invalid stream; supply a valid ID and verified official YouTube URL"},400);
      const currentRaw=await env.SPORTS_ZONE.get("streams","json").catch(()=>[]); const current=Array.isArray(currentRaw)?currentRaw.filter(validStream):[]; const next=[...current.filter(s=>s.youtubeId!==stream.youtubeId),stream];
      await env.SPORTS_ZONE.put("streams",JSON.stringify(next));
      return json({ok:true,status:"ok",streams:await getStreams(env)});
    }
    return json({error:"not found"},404);
  }
};