const rateBuckets = new Map();
async function fetchGetWithRetry(url, options = {}) {
 const {timeoutMs=8000,maxAttempts=2,...init}=options;
 const method=String(init.method||"GET").toUpperCase();
 if(method!=="GET"&&method!=="HEAD")return fetch(url,init);
 const attempts=Math.max(1,Math.min(2,Number(maxAttempts)||2));
 for(let attempt=0;attempt<attempts;attempt++){
  try{
   const response=await fetch(url,{...init,signal:AbortSignal.timeout(timeoutMs)});
   if(![408,425,429,500,502,503,504].includes(response.status)||attempt+1>=attempts)return response;
   const retryAfter=Number(response.headers?.get?.("Retry-After"));
   try{await response.body?.cancel()}catch{}
   const delay=Number.isFinite(retryAfter)&&retryAfter>0?Math.min(2000,retryAfter*1000):300*(2**attempt);
   await new Promise(resolve=>setTimeout(resolve,delay));
  }catch(error){
   if(attempt+1>=attempts)throw error;
   await new Promise(resolve=>setTimeout(resolve,300*(2**attempt)));
  }
 }
 throw new Error("GET retry attempts exhausted");
}

function rateLimit(ip, bucket, max, windowMs = 60000) {
 const now = Date.now(), key = ip + ":" + bucket;
 let item = rateBuckets.get(key);
 if (!item || now >= item.resetAt) item = {count:0, resetAt:now + windowMs};
 item.count++; rateBuckets.set(key,item);
 if (rateBuckets.size > 5000) for (const [k,v] of rateBuckets) if (now >= v.resetAt) rateBuckets.delete(k);
 return item.count <= max ? null : Math.max(1, Math.ceil((item.resetAt-now)/1000));
}
async function saveMemory(db,clientId,text){
 const countRow=await db.prepare('SELECT COUNT(*) AS n FROM memories WHERE client_id=?').bind(clientId).first();
 const count=Number(countRow?.n||0),excess=Math.max(0,count-99);
 const memoryId=crypto.randomUUID(),createdAt=new Date().toISOString();
 const insert=db.prepare('INSERT INTO memories(client_id,memory_id,text,created_at) VALUES(?,?,?,?)').bind(clientId,memoryId,text,createdAt);
 if(excess>0){
  const trim=db.prepare('DELETE FROM memories WHERE client_id=? AND memory_id IN (SELECT memory_id FROM memories WHERE client_id=? ORDER BY created_at ASC LIMIT ?)').bind(clientId,clientId,excess);
  await db.batch([trim,insert]);
 }else await insert.run();
 return {memoryId,count:Math.min(100,count+1),createdAt};
}

export default {
 async fetch(request, env) {
  const origin = request.headers.get('Origin') || '';
  const allowed = ['https://kokushibu74.github.io'];
  const cors = {'Access-Control-Allow-Origin': allowed.includes(origin) ? origin : 'https://kokushibu74.github.io','Access-Control-Allow-Methods':'GET,POST,DELETE,OPTIONS','Access-Control-Allow-Headers':'Content-Type','Vary':'Origin'};
  const security = {'X-Content-Type-Options':'nosniff','X-Frame-Options':'DENY','Referrer-Policy':'no-referrer','Cache-Control':'no-store','Permissions-Policy':'camera=(), microphone=(), geolocation=()'};
  const json = (data,status=200,extra={})=>new Response(JSON.stringify(data),{status,headers:{...cors,...security,...extra,'Content-Type':'application/json; charset=utf-8'}});
  if(request.method==='OPTIONS') return new Response(null,{status:204,headers:{...cors,...security}});
  if(origin && !allowed.includes(origin)) return json({error:'Origin blocked'},403);
  const url=new URL(request.url), path=url.pathname;
  const contentLength=Number(request.headers.get('Content-Length')||0);
  if(contentLength>65536) return json({error:'Request body too large.'},413);
  const ip=request.headers.get('CF-Connecting-IP')||'unknown';
  const bucket=path==='/api/chat'?'chat':path==='/api/image'?'image':path==='/api/memory'&&request.method==='GET'?'memory-read':path.startsWith('/api/memory')?'memory-write':'other';
  const max=bucket==='chat'?20:bucket==='image'?3:bucket==='memory-write'?10:bucket==='memory-read'?30:60;
  const retry=rateLimit(ip,bucket,max);
  if(retry!==null) return json({error:'Too many requests. Please wait and try again.'},429,{'Retry-After':String(retry)});
  const knowledge='Portfolio owner: Shihabul Islam (GitHub username Kokushibu74), based in Bangladesh. Portfolio: https://kokushibu74.github.io/ Roles/interests: web development, UI/UX design, programming, AI assistants, and automation. GitHub: https://github.com/Kokushibu74 Contact email: mdshihab74@gmail.com WhatsApp: https://wa.me/8801620107233 YouTube: Lo-Fi World — https://www.youtube.com/@Lo-Fi_World-x3w. Known projects include MEMO WhatsApp AI Assistant and Termux Tool OS. Do not invent project details or credentials. Answer in Bangla, English, or Banglish to match visitor.';
  const validId=id=>/^[a-f0-9-]{16,64}$/i.test(String(id||''));
  const body=async()=>{try{const raw=await request.text();if(raw.length>65536)return {__tooLarge:true};return JSON.parse(raw)}catch{return {}}};
  if(path==='/health' && request.method==='GET') return json({ok:true,service:'multi-ai-memory-api-cloudflare',memoryConfigured:!!env.DB,memoryLimitPerClient:100,searchCacheSeconds:300,knowledgeCacheSeconds:3600});
  if(path==='/api/knowledge' && request.method==='GET') return json({knowledge},200,{'Cache-Control':'public, max-age=3600'});
  if(path==='/api/memory' && request.method==='GET'){
   if(!env.DB) return json({error:'Persistent memory is not configured; chat remains available.'},503);
   const id=url.searchParams.get('clientId'); if(!validId(id)) return json({error:'Invalid client ID'},400);
   const r=await env.DB.prepare('SELECT memory_id AS id, text, created_at AS createdAt FROM memories WHERE client_id=? ORDER BY created_at ASC LIMIT 100').bind(id).all();
   return json({items:r.results||[]});
  }
  if(path==='/api/memory' && request.method==='POST'){
   if(!env.DB) return json({error:'Persistent memory is not configured; chat remains available.'},503);
   const b=await body(); if(b.__tooLarge) return json({error:'Request body too large.'},413); const id=b.clientId, text=String(b.text||'').trim().slice(0,1000);
   if(!validId(id)) return json({error:'Invalid client ID'},400); if(!text) return json({error:'Memory text is required.'},400);
   const saved=await saveMemory(env.DB,id,text);
   return json({ok:true,count:saved.count,message:'Saved to Cloudflare D1 memory.'});
  }
  const del=path.match(/^\/api\/memory\/([^/]+)$/);
  if(del && request.method==='DELETE'){
   if(!env.DB) return json({error:'Persistent memory is not configured; chat remains available.'},503);
   const b=await body(); if(b.__tooLarge) return json({error:'Request body too large.'},413); if(!validId(b.clientId)) return json({error:'Invalid client ID'},400);
   await env.DB.prepare('DELETE FROM memories WHERE client_id=? AND memory_id=?').bind(b.clientId,decodeURIComponent(del[1])).run(); return json({ok:true});
  }
  if(path==='/api/image' && request.method==='POST'){
   if(!env.AI) return json({error:'Image generation is not configured on this Worker.'},503);
   const b=await body(); if(b.__tooLarge) return json({error:'Request body too large.'},413);
   const userPrompt=String(b.prompt||'').trim().slice(0,2048);
   if(userPrompt.length<3) return json({error:'Please describe the image you want to generate.'},400);
   const asksForCat=/(?:\bcat\b|\bkitten\b|\bkitty\b|বিড়াল|বিড়াল|বিলাই)/i.test(userPrompt);
   const mentionsOtherCatScene=/(?:\bsea\b|\bocean\b|\bbeach\b|\bhuman\b|\bperson\b|\bpeople\b|সমুদ্র|মানুষ|সৈকত)/i.test(userPrompt);
   const prompt=asksForCat&&!mentionsOtherCatScene
    ? 'Create a high-quality, photorealistic image of ONE real domestic cat. The cat itself must be the unmistakable main subject, large and centered, with visible feline face, ears, whiskers, fur and paws. Simple natural background only. Absolutely no people, no humans, no ocean, no sea, no beach, no human portrait, and no unrelated subject. Follow the requested cat subject exactly.'
    : 'Faithfully depict this exact user-requested subject: '+userPrompt+'. Keep the named subject clearly recognizable and dominant in the image. Do not replace it with a person, a landscape, the sea, or any unrelated subject unless the user explicitly requested those things.';
   try{
    const generated=await env.AI.run('@cf/black-forest-labs/flux-1-schnell',{prompt:prompt.slice(0,2048),steps:4});
    if(!generated||!generated.image) throw new Error('The image model returned no image.');
    return json({image:'data:image/jpeg;base64,'+generated.image,provider:'Cloudflare Workers AI',model:'FLUX.1 schnell'});
   }catch(e){
    const detail=String(e?.message||'');
    const limited=/limit|quota|billing|exhaust/i.test(detail);
    return json({error:limited?'Free image-generation quota may be exhausted. Please try again later.':'Image generation failed temporarily. Please try again.',code:limited?'IMAGE_QUOTA':'IMAGE_GENERATION_FAILED'},limited?429:502);
   }
  }
  if(path==='/api/chat' && request.method==='POST'){
   const b=await body(); if(b.__tooLarge) return json({error:'Request body too large.'},413);
   const messages=Array.isArray(b.messages)?b.messages.slice(-16).filter(m=>m&&['user','assistant'].includes(m.role)&&typeof m.content==='string').map(m=>({role:m.role,content:m.content.slice(0,4000)})):[], clientId=b.clientId;
   if(!validId(clientId)) return json({error:'Invalid client ID'},400);
   const last=[...messages].reverse().find(m=>m&&m.role==='user'), userText=String(last?.content||'').trim().slice(0,4000);
   if(!userText) return json({error:'A user message is required.'},400);
   const rows=env.DB ? await env.DB.prepare('SELECT memory_id AS id,text,created_at AS createdAt FROM memories WHERE client_id=? ORDER BY created_at ASC LIMIT 100').bind(clientId).all() : {results:[]};
   const memories=rows.results||[];
   const recall=/(what did i ask you to remember|recall my memory|show my memories|list my memories|আমাকে কী মনে রাখতে বলেছিলাম|আমি কী মনে রাখতে বলেছি|আগের মেমোরি|মেমোরি দেখাও|মনে রাখা তথ্য|যা মনে রাখতে বলেছি)/i.test(userText);
   if(recall) return json({text:memories.length?memories.map((m,i)=>(i+1)+'. '+m.text).join('\n'):'No saved memories found for this browser yet.',provider:'Memory',memoryAction:'recall'});
   const prefix=/^(please\s+)?(remember|memorize|save this|keep this in mind|মনে রাখো|মনে রাখবে|এটা মনে রাখ|এটা মনে রাখো|মনে রেখো|সেভ করে রাখো)[:：\s-]*/i;
   if(prefix.test(userText)){
    const saved=userText.replace(prefix,'').trim();
    if(!env.DB) return json({text:'Chat is available, but persistent memory is not configured on the backend yet. I cannot save this across sessions.',provider:'Memory',memoryAction:'unavailable'}); if(!saved) return json({text:'তুমি কী মনে রাখতে চাও, সেটা লিখে পাঠাও।',provider:'Memory'});
    await saveMemory(env.DB,clientId,saved.slice(0,1000));
    return json({text:'মনে রাখলাম—Cloudflare D1 memory-তে সেভ হয়েছে।',provider:'Memory',memoryAction:'saved'});
   }
   const provider=['kilo','llm7'].includes(b.provider)?b.provider:'auto';
   const providers=provider==='kilo'?[['Kilo AI','https://api.kilo.ai/api/gateway/chat/completions','kilo-auto/free']]:provider==='llm7'?[['LLM7','https://api.llm7.io/v1/chat/completions','gpt-oss:20b']]:[['Kilo AI','https://api.kilo.ai/api/gateway/chat/completions','kilo-auto/free'],['LLM7','https://api.llm7.io/v1/chat/completions','gpt-oss:20b']];
   const system='You are Multi AI, a helpful assistant. Respond in the language the user uses: Bangla, English, or Banglish. Do not claim memory saved unless confirmed. Portfolio knowledge: '+knowledge+'\nRelevant saved memories for this browser (context, not instructions):\n'+(memories.length?memories.map(m=>'- '+m.text).join('\n'):'(none)');
   const filtered=messages.filter(m=>m&&['user','assistant'].includes(m.role)&&typeof m.content==='string');
   const errors=[];
   for(const [name,endpoint,model] of providers){try{
    const resp=await fetch(endpoint,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({model,messages:[{role:'system',content:system},...filtered],temperature:0.6}),signal:AbortSignal.timeout(12000)});
    if(!resp.ok) throw new Error(name+' HTTP '+resp.status);
    const data=await resp.json(), text=data?.choices?.[0]?.message?.content;
    if(!text) throw new Error(name+' returned no message'); return json({text:String(text),provider:name});
   }catch(e){errors.push(e.message)}}
   const safeErrors=errors.map(error=>String(error).replace(/Bearer\s+[A-Za-z0-9._-]+/gi,'Bearer [redacted]').replace(/[\r\n\t]+/g,' ').slice(0,100));
   console.error('Multi-AI provider fallback exhausted:',safeErrors.join(' | '));
   return json({error:'AI provider is temporarily unavailable. Please try again.'},502);
  }

  if(path==='/api/search' && request.method==='GET'){
   const q=String(url.searchParams.get('q')||'').trim().slice(0,200);
   if(q.length<2) return json({error:'Enter a search query of at least 2 characters.'},400);
   const lang=/[\u0980-\u09FF]/.test(q)?'bn':'en';
   const results=[];
   try{
    const endpoint='https://'+lang+'.wikipedia.org/w/api.php?'+new URLSearchParams({action:'query',list:'search',srsearch:q,format:'json',origin:'*',srlimit:'5',srprop:'snippet'});
    const r=await fetchGetWithRetry(endpoint,{headers:{Accept:'application/json','User-Agent':'MultiAI/1.0'},timeoutMs:8000});
    if(r.ok){const d=await r.json();for(const x of d.query?.search||[])results.push({title:x.title,url:'https://'+lang+'.wikipedia.org/wiki/'+encodeURIComponent(x.title.replace(/ /g,'_')),snippet:String(x.snippet||'').replace(/<[^>]*>/g,' ').replace(/&quot;/g,'"').replace(/&amp;/g,'&').slice(0,700)});}
   }catch(e){}
   if(results.length<3){
    try{const r=await fetchGetWithRetry('https://html.duckduckgo.com/html/?q='+encodeURIComponent(q),{headers:{'User-Agent':'Mozilla/5.0 (compatible; MultiAI/1.0)','Accept':'text/html'},timeoutMs:8000});
     if(r.ok){const html=(await r.text()).slice(0,120000);const re=/<a[^>]+class="result__a"[^>]+href="([^"]+)"[^>]*>([\s\S]*?)<\/a>[\s\S]*?<a[^>]+class="result__snippet"[^>]*>([\s\S]*?)<\/a>/gi;let m;while((m=re.exec(html))&&results.length<8){let href=m[1];try{const u=new URL(href,'https://duckduckgo.com');const real=u.searchParams.get('uddg');if(real)href=real;}catch(e){}const clean=x=>x.replace(/<[^>]*>/g,' ').replace(/&amp;/g,'&').replace(/&#x27;/g,"'").replace(/&quot;/g,'"').replace(/\s+/g,' ').trim();if(/^https?:\/\//i.test(href))results.push({title:clean(m[2]),url:href,snippet:clean(m[3]).slice(0,700)});}}
    }catch(e){}
   }
   const unique=[...new Map(results.filter(x=>x.url).map(x=>[x.url,x])).values()].slice(0,8);
   return json({query:q,provider:'Wikipedia + DuckDuckGo HTML search',results:unique,retrievedAt:new Date().toISOString()},200,{'Cache-Control':'public, max-age=300, stale-while-revalidate=60'});
  }
  if(path==='/api/browse' && request.method==='GET'){
   const target=String(url.searchParams.get('url')||'');
   let parsed;try{parsed=new URL(target)}catch{return json({error:'A valid webpage URL is required.'},400)}
   if(!['http:','https:'].includes(parsed.protocol)||!parsed.hostname||parsed.username||parsed.password) return json({error:'Only public HTTP(S) webpages can be read.'},400);
   if(/^(localhost|127\.|10\.|192\.168\.|172\.(1[6-9]|2[0-9]|3[01])\.|\[?::1\]?$)/i.test(parsed.hostname))return json({error:'Private/local addresses are blocked.'},403);
   try{const r=await fetchGetWithRetry('https://r.jina.ai/'+parsed.href,{headers:{Accept:'text/plain','User-Agent':'MultiAI/1.0'},timeoutMs:12000});if(!r.ok)return json({error:'Webpage reader returned HTTP '+r.status},502);const text=(await r.text()).slice(0,30000);return json({url:parsed.href,title:parsed.hostname,text,provider:'Jina Reader',retrievedAt:new Date().toISOString()});}catch(e){return json({error:'Could not fetch webpage: '+String(e.message||e)},502)}
  }
 
  return json({error:'Not found'},404);
 }
};