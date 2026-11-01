
function bdDay(ts=Date.now()){return new Intl.DateTimeFormat("en-CA",{timeZone:"Asia/Dhaka",year:"numeric",month:"2-digit",day:"2-digit"}).format(new Date(ts));}
function previousBdDay(day){const d=new Date(day+"T00:00:00Z");d.setUTCDate(d.getUTCDate()-1);return d.toISOString().slice(0,10);}
async function readDailyActivity(env,day){const prefix="daily:"+day+":visitor:",rows=[];let cursor;do{const page=await env.VISITOR_KV.list({prefix,limit:1000,cursor});for(const key of page.keys||[]){const row=await env.VISITOR_KV.get(key.name,"json");if(row)rows.push(row)}cursor=page.list_complete?undefined:page.cursor;}while(cursor);const tally=fn=>{const m={};for(const r of rows){const k=String(fn(r)||"Unknown");m[k]=(m[k]||0)+1;}return Object.entries(m).sort((a,b)=>b[1]-a[1]).slice(0,6).map(([k,v])=>k+" ("+v+")");};const pages={};let views=0,sessions=0,errors=0,returning=0;for(const r of rows){views+=r.pageViews||0;sessions+=r.sessions||0;errors+=r.errors||0;if(r.returning)returning++;for(const [k,v] of Object.entries(r.pages||{}))pages[k]=(pages[k]||0)+v;}return {day,unique:rows.length,returning,sessions,views,errors,pages:Object.entries(pages).sort((a,b)=>b[1]-a[1]).slice(0,6).map(([k,v])=>k+" ("+v+")"),countries:tally(r=>r.network?.country),cities:tally(r=>r.network?.city),isps:tally(r=>r.network?.isp),devices:tally(r=>r.device?.deviceType),browsers:tally(r=>r.device?.browser),visitors:rows.sort((a,b)=>(b.pageViews||0)-(a.pageViews||0)).slice(0,20)};}
function chunkTelegramLines(lines,max=3800){const out=[];let current="";for(const line of lines){const next=current?current+"\n"+line:line;if(next.length>max){if(current)out.push(current);current=line.slice(0,max);}else current=next;}if(current)out.push(current);return out;}\nasync function sendTelegramChunks(env,chatId,lines,opts={}){for(const text of chunkTelegramLines(lines,opts.max||3800)){const r=await fetch("https://api.telegram.org/bot"+env.TELEGRAM_BOT_TOKEN+"/sendMessage",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({chat_id:chatId,text,parse_mode:opts.parse_mode||"HTML",disable_web_page_preview:true,reply_to_message_id:opts.reply_to_message_id})});if(!r.ok)throw new Error("Telegram message delivery failed (HTTP "+r.status+")");}}\nfunction dailyActivityLines(a,p){const list=(n,v)=>n+": "+(v.length?v.join(", "):"No data");const delta=(v,o)=>{const d=v-o;return (d>0?"+":"")+d+" vs yesterday"};const lines=["📅 Date: "+a.day+" (BDT)","👤 Unique visitors: "+a.unique+(p?" · "+delta(a.unique,p.unique):""),"🆕 New visitors: "+Math.max(0,a.unique-a.returning),"↩️ Returning visitors: "+a.returning,"🔁 Visits / sessions: "+a.sessions+(p?" · "+delta(a.sessions,p.sessions):""),"👁️ Page views: "+a.views+(p?" · "+delta(a.views,p.views):""),"⚠️ Client errors: "+a.errors,list("🔥 Popular pages",a.pages),list("🌍 Countries",a.countries),list("📍 Cities",a.cities),list("📡 ISPs",a.isps),list("📱 Devices",a.devices),list("🌐 Browsers",a.browsers),"","👥 VISITOR DETAILS"];for(const [i,v] of (a.visitors||[]).entries()){const pages=Object.entries(v.pages||{}).sort((x,y)=>y[1]-x[1]).map(([k,n])=>k+" ×"+n).join(", ")||"Page data unavailable";const device=[v.device?.deviceType,v.device?.deviceModel,v.device?.os,v.device?.browser].filter(Boolean).join(" / ")||"Unknown";const source=v.source?.utmSource||v.source?.referrer||"Direct";const seen=v.lastSeen?new Date(v.lastSeen).toLocaleTimeString("en-US",{timeZone:"Asia/Dhaka",hour:"2-digit",minute:"2-digit"}):"Unknown";lines.push((i+1)+". "+(v.visitorId||"Visitor").replace(/(VIS-)[A-F0-9]{8}([A-F0-9]{4})/,"$1••••••••$2")+" · "+(v.returning?"Returning":"New"),"   🕒 Last seen: "+seen+" BDT · Sessions today: "+(v.sessions||0)+" · Views: "+(v.pageViews||0),"   📄 Pages: "+pages,"   🔗 Source: "+source,"   📱 Device: "+device,"   📍 Location: "+[v.network?.city,v.network?.country].filter(Boolean).join(", ")+" · ISP: "+(v.network?.isp||"Unknown"));}if(!a.visitors?.length)lines.push("No visitor-level records available.");lines.push("","ℹ️ Active time, exact exit time and scroll/interaction duration are not measured in this report.");return lines;}


const UM_PREFIX = "um:v1:";
const umClean = (v,n=120) => String(v??"").replace(/[\u0000-\u001f<>]/g," ").trim().slice(0,n);
const umDate = (ts=Date.now()) => new Intl.DateTimeFormat("en-CA",{timeZone:"Asia/Dhaka",year:"numeric",month:"2-digit",day:"2-digit"}).format(new Date(ts));
async function umList(env,prefix,limit=1000){
  const out=[];let cursor;
  do{const page=await env.VISITOR_KV.list({prefix,limit,cursor});out.push(...(page.keys||[]));cursor=page.list_complete?undefined:page.cursor;}while(cursor);
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
  await fetch("https://api.telegram.org/bot"+env.TELEGRAM_BOT_TOKEN+"/sendMessage",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({chat_id:chatId,text,disable_web_page_preview:true})});
}
async function umHandleCommand(env,msg){
  const text=String(msg.text||"").trim(),parts=text.split(/\s+/),cmd=(parts.shift()||"").split("@")[0].toLowerCase();
  const commands=new Set(["/cmd","/userid","/userinfo","/userrename","/userlink","/userunlink","/userblock","/userunblock","/userhistory","/usersearch","/userstats"]);
  if(!commands.has(cmd))return false;
  const chatId=msg.chat.id,sender=String(msg.from?.id||"");
  if(msg.chat.type!=="private"){await umReply(env,chatId,"নিরাপত্তার জন্য এই কমান্ডগুলো Bot-এর Private Chat-এ ব্যবহার করুন।");return true;}
  const admins=new Set(String(env.ADMIN_TELEGRAM_IDS||"").split(/[\s,;]+/).map(x=>x.trim()).filter(Boolean));
  const isAdmin=admins.has(sender);
  if(cmd==="/cmd"){
    const publicCommands=[{command:"cmd",description:"সব উপলভ্য কমান্ড ও ব্যবহারবিধি"}];
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
    await umReply(env,chatId,guide.join("\n"));
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
      await env.VISITOR_KV.put(UM_PREFIX+"link:telegram:"+tg.id,JSON.stringify({visitorId:web.id,linkedAt:Date.now(),by:sender}),{expirationTtl:31536000});
      await env.VISITOR_KV.put(UM_PREFIX+"link:visitor:"+web.id,JSON.stringify({telegramId:tg.id,linkedAt:Date.now(),by:sender}),{expirationTtl:31536000});
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

export default {
  async fetch(request, env) {
    const origin = request.headers.get("Origin") || "";
    const allowedOrigin = "https://kokushibu74.github.io";
    const cors = {"Access-Control-Allow-Origin":allowedOrigin,"Access-Control-Allow-Methods":"POST, OPTIONS","Access-Control-Allow-Headers":"Content-Type","Vary":"Origin"};
    const respond = (body,status=200)=>new Response(JSON.stringify(body),{status,headers:{...cors,"Content-Type":"application/json; charset=utf-8","Cache-Control":"no-store"}});
    if(origin&&origin!==allowedOrigin)return new Response("Forbidden",{status:403});
    if(request.method==="OPTIONS")return new Response(null,{status:204,headers:cors});
    const pathname=new URL(request.url).pathname;
    if(pathname==="/track"){
      if(request.method!=="POST")return respond({error:"Method not allowed"},405);
      if(!env.VISITOR_KV)return respond({error:"Visitor tracking storage is not configured."},503);
      const len=Number(request.headers.get("Content-Length")||0);if(len>12000)return respond({error:"Payload too large"},413);
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
      const sendAlert=async(key,text)=>{const marker="alert:"+key;const seen=await env.VISITOR_KV.get(marker);if(seen)return;await env.VISITOR_KV.put(marker,"1",{expirationTtl:86400});try{await fetch("https://api.telegram.org/bot"+env.TELEGRAM_BOT_TOKEN+"/sendMessage",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({chat_id:env.TELEGRAM_CHAT_ID,text,parse_mode:"HTML",disable_web_page_preview:true})})}catch(e){console.error("Visitor alert failed",String(e))}};
      if(pageView&&traffic===40&&env.TELEGRAM_BOT_TOKEN&&env.TELEGRAM_CHAT_ID)await sendAlert("spike:"+bucket,"📈 <b>TRAFFIC SPIKE</b>\nAt least 40 page events in 5 minutes.\nCurrent page: "+clean(page,120)+"\nTime: "+new Date(now).toLocaleString("en-US",{timeZone:"Asia/Dhaka"}));
      const errorEvents=events.filter(e=>e.type==="js_error"||e.type==="promise_error");
      if(errorEvents.length&&env.TELEGRAM_BOT_TOKEN&&env.TELEGRAM_CHAT_ID)await sendAlert("errors:"+id+":"+Math.floor(now/86400000),"🔴 <b>CLIENT ERROR</b>\nVisitor: <code>"+id+"</code>\nPage: "+clean(page,120)+"\nErrors reported: "+errorEvents.length+"\nDetails: "+clean(errorEvents[0].value,160));
      const sessionViews=pageView?(newSession?1:(Number(old.sessionPageViews)||0)+1):(Number(old.sessionPageViews)||0);
      if(pageView&&sessionViews>=30&&env.TELEGRAM_BOT_TOKEN&&env.TELEGRAM_CHAT_ID)await sendAlert("security:"+id+":"+session,"⚠️ <b>UNUSUAL VISITOR ACTIVITY</b>\nVisitor: <code>"+id+"</code>\n30+ page views in one session.\nIP: <code>"+clean(profile.network.ip,64)+"</code>");

      const stamp=new Date(now).toLocaleString("en-US",{timeZone:"Asia/Dhaka",dateStyle:"medium",timeStyle:"short"});
      const esc=s=>String(s||"").replace(/&/g,"&amp;").replace(/</g,"&lt;").replace(/>/g,"&gt;");
      const displayIp=profile.network.ip||"Unavailable";
      const geo=[profile.network.city,profile.network.region,profile.network.country].filter(Boolean).join(", ")||"Unknown";
      const device=[profile.device.deviceType,profile.device.deviceModel,profile.device.os,profile.device.browser].filter(Boolean).join(" / ")||ua.slice(0,100);
      if(pageView&&newSession&&env.TELEGRAM_BOT_TOKEN&&env.TELEGRAM_CHAT_ID){
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
      const msg=update.message;if(!msg?.chat||typeof msg.text!=="string")return new Response("OK");
      if(msg.chat.type==="private"&&msg.from?.id){
        try{await umTelegramTouch(env,msg);}catch(e){console.error("Telegram user history write failed",String(e));}
        const adminIds=new Set(String(env.ADMIN_TELEGRAM_IDS||"").split(/[\s,;]+/).map(x=>x.trim()).filter(Boolean));
        if(await umBlocked(env,"telegram",String(msg.from.id))&&!adminIds.has(String(msg.from.id))){
          try{await umHistory(env,"telegram",String(msg.from.id),{type:"blocked_message_attempt"});}catch{}
          return new Response("OK");
        }
        try{if(await umHandleCommand(env,msg))return new Response("OK");}catch(e){console.error("User management command dispatch failed",String(e));}
      }
      const infoAdmins=new Set(String(env.ADMIN_TELEGRAM_IDS||"").split(/[\s,;]+/).map(x=>x.trim()).filter(Boolean));
      if(msg.chat.type!=="private"||!infoAdmins.has(String(msg.from?.id||""))||!/^\/info(?:@\w+)?(?:\s|$)/i.test(msg.text.trim()))return new Response("OK");
      const site="https://kokushibu74.github.io/",started=performance.now(),stamp=new Date().toLocaleString("en-US",{timeZone:"Asia/Dhaka",dateStyle:"medium",timeStyle:"short"});let status="Error",elapsed=0,detail="";
      try{const res=await fetch(site,{redirect:"follow",signal:AbortSignal.timeout(15000)});status=String(res.status);elapsed=Math.round(performance.now()-started);detail=res.ok?"Site reachable":"Site returned HTTP "+res.status;await res.body?.cancel()}catch(e){elapsed=Math.round(performance.now()-started);detail=String(e&&e.message||e).slice(0,150)}
      const esc=s=>String(s).replace(/&/g,"&amp;").replace(/</g,"&lt;").replace(/>/g,"&gt;");
      const today=bdDay(),yesterday=previousBdDay(today);let activity=null,prior=null;try{activity=await readDailyActivity(env,today);prior=await readDailyActivity(env,yesterday)}catch(e){detail+=" · Visitor report unavailable"}const lines=["🌐 <b>Kokushibu74.github.io — Live Report</b>","🕒 Checked: "+esc(stamp)+" (Bangladesh time)","🔗 "+site,"📡 HTTP status: "+esc(status),"⏱️ Response time: "+elapsed+" ms",(status.startsWith("2")||status.startsWith("3")?"✅ ":"⚠️ ")+esc(detail),...(activity?["","📊 <b>Visitor Activity Summary — Today</b>",...dailyActivityLines(activity,prior).map(esc)]:[])];
      await sendTelegramChunks(env,msg.chat.id,lines,{reply_to_message_id:msg.message_id});return new Response("OK");
    }
    if(new URL(request.url).pathname!=="/submit")return respond({error:"Not found"},404);
    if(request.method!=="POST")return respond({error:"Method not allowed"},405);
    if(!env.TELEGRAM_BOT_TOKEN||!env.TELEGRAM_CHAT_ID)return respond({error:"Contact service is not configured yet."},503);
    if(!(request.headers.get("Content-Type")||"").toLowerCase().includes("multipart/form-data"))return respond({error:"Invalid form upload."},415);
    const length=Number(request.headers.get("Content-Length")||0);if(Number.isFinite(length)&&length>65*1024*1024)return respond({error:"Combined upload is too large; keep it below 60 MB."},413);
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
    if(!env.TELEGRAM_BOT_TOKEN||!env.TELEGRAM_CHAT_ID){console.error("Telegram secrets missing; monitor could not send messages.");return}
    const sendTelegram=async text=>{
      const tg=await fetch("https://api.telegram.org/bot"+env.TELEGRAM_BOT_TOKEN+"/sendMessage",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({chat_id:env.TELEGRAM_CHAT_ID,text,parse_mode:"HTML",disable_web_page_preview:true})});
      const payload=await tg.json().catch(()=>({}));if(!tg.ok||!payload.ok)throw new Error("Telegram message delivery failed (HTTP "+tg.status+")");
    };

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
    if(failure)await sendTelegram(["🚨 <b>URGENT WEBSITE ALERT</b>","🕒 "+stamp+" (Bangladesh time)","🌐 "+site,"❌ "+failure,responseMs===null?"":"⏱️ Check time: "+responseMs+" ms","","The site will be checked again on the next 30-minute run."].filter(Boolean).join("\n"));
    if(daily){ let gaLines,visitorLines; try { const g=await ga4Report(); gaLines=["📈 <b>GA4 — Today (Bangladesh time; through report time)</b>","👥 Active users: "+g.users,"🔁 Sessions: "+g.sessions,"👁️ Page views: "+g.views,"💬 Engagement rate: "+(Number(g.engagement)*100).toFixed(2)+"%"]; } catch(e) { gaLines=["⚠️ <b>GA4 report unavailable</b>","<code>"+String(e&&e.message||e).replace(/&/g,"&amp;").replace(/</g,"&lt;").replace(/>/g,"&gt;").slice(0,280)+"</code>"]; } try { const d=bdDay(),x=await readDailyActivity(env,d),p=await readDailyActivity(env,previousBdDay(d)); visitorLines=["📊 <b>Visitor Activity Summary — Today</b>",...dailyActivityLines(x,p).map(v=>v.replace(/&/g,"&amp;").replace(/</g,"&lt;").replace(/>/g,"&gt;"))]; } catch(e) { visitorLines=["⚠️ Visitor Activity Summary unavailable: "+String(e&&e.message||e).slice(0,140)]; } await sendTelegramChunks(env,env.TELEGRAM_CHAT_ID,["📊 <b>Website Daily Health Report</b>","🕒 "+stamp+" (Bangladesh time)","🌐 "+site,failure?"🚨 Site status: DOWN / ERROR — "+failure:"✅ Site response: HTTP "+status,responseMs===null?"":"⏱️ Response time: "+responseMs+" ms",missing.length?"🔎 Security headers missing/not exposed: "+missing.join(", "):"🛡️ Basic security headers: present","",...gaLines,"",...visitorLines,"","ℹ️ Basic uptime/header check, not a full security audit."].filter(Boolean));}
  }
};