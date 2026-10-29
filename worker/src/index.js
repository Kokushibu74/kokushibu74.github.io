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
async function getStreams(env) {
  if(!env.SPORTS_ZONE) return [];
  const value=await env.SPORTS_ZONE.get("streams","json");
  return Array.isArray(value)?value.filter(validStream).map(s=>({id:s.id,name:s.name,youtubeId:s.youtubeId,category:s.category,isOfficial:true,officialUrl:s.officialUrl})):[];
}
export default {
  async fetch(request,env,ctx) {
    const url=new URL(request.url), origin=request.headers.get("Origin");
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
    if(url.pathname==="/api/streams"&&request.method==="POST") {
      if(!env.ADMIN_KEY||request.headers.get("Authorization")!=="Bearer "+env.ADMIN_KEY) return json({error:"unauthorized"},401);
      if(!env.SPORTS_ZONE) return json({error:"KV namespace SPORTS_ZONE is not configured"},503);
      let body; try { body=await request.json(); } catch { return json({error:"invalid JSON body"},400); }
      const stream={id:crypto.randomUUID(),name:typeof body?.name==="string"?body.name.trim():"",youtubeId:typeof body?.youtubeId==="string"?body.youtubeId.trim():"",category:typeof body?.category==="string"?body.category:"general",officialUrl:typeof body?.officialUrl==="string"?body.officialUrl.trim():"",isOfficial:body?.isOfficial===true};
      if(!validStream(stream)) return json({error:"invalid stream; supply a valid ID and verified official YouTube URL"},400);
      const current=await getStreams(env), next=[...current.filter(s=>s.youtubeId!==stream.youtubeId),stream];
      await env.SPORTS_ZONE.put("streams",JSON.stringify(next));
      return json({ok:true,status:"ok",streams:await getStreams(env)});
    }
    return json({error:"not found"},404);
  }
};
// Scheduled discovery implementation in progress.
