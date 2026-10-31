export default {
  async fetch(request, env) {
    const origin = request.headers.get("Origin") || "";
    const allowedOrigin = "https://kokushibu74.github.io";
    const cors = {"Access-Control-Allow-Origin":allowedOrigin,"Access-Control-Allow-Methods":"POST, OPTIONS","Access-Control-Allow-Headers":"Content-Type","Vary":"Origin"};
    const respond = (body,status=200)=>new Response(JSON.stringify(body),{status,headers:{...cors,"Content-Type":"application/json; charset=utf-8","Cache-Control":"no-store"}});
    if(origin&&origin!==allowedOrigin)return new Response("Forbidden",{status:403});
    if(request.method==="OPTIONS")return new Response(null,{status:204,headers:cors});
    if(new URL(request.url).pathname==="/telegram-webhook"){
      if(request.method!=="POST")return new Response("Method not allowed",{status:405});
      if(!env.TELEGRAM_WEBHOOK_SECRET||request.headers.get("X-Telegram-Bot-Api-Secret-Token")!==env.TELEGRAM_WEBHOOK_SECRET)return new Response("Unauthorized",{status:401});
      let update;try{update=await request.json()}catch{return new Response("Bad request",{status:400})}
      const msg=update.message;if(!msg?.chat||typeof msg.text!=="string")return new Response("OK");
      if(String(msg.chat.id)!==String(env.TELEGRAM_CHAT_ID)||!/^\/info(?:@\w+)?(?:\s|$)/i.test(msg.text.trim()))return new Response("OK");
      const site="https://kokushibu74.github.io/",started=performance.now(),stamp=new Date().toLocaleString("en-US",{timeZone:"Asia/Dhaka",dateStyle:"medium",timeStyle:"short"});let status="Error",elapsed=0,detail="";
      try{const res=await fetch(site,{redirect:"follow",signal:AbortSignal.timeout(15000)});status=String(res.status);elapsed=Math.round(performance.now()-started);detail=res.ok?"Site reachable":"Site returned HTTP "+res.status;await res.body?.cancel()}catch(e){elapsed=Math.round(performance.now()-started);detail=String(e&&e.message||e).slice(0,150)}
      const esc=s=>String(s).replace(/&/g,"&amp;").replace(/</g,"&lt;").replace(/>/g,"&gt;");
      const text=["🌐 <b>Kokushibu74.github.io — Live Report</b>","🕒 Checked: "+esc(stamp)+" (Bangladesh time)","🔗 "+site,"📡 HTTP status: "+esc(status),"⏱️ Response time: "+elapsed+" ms",(status.startsWith("2")||status.startsWith("3")?"✅ ":"⚠️ ")+esc(detail)].join("\n");
      await fetch("https://api.telegram.org/bot"+env.TELEGRAM_BOT_TOKEN+"/sendMessage",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({chat_id:msg.chat.id,text,parse_mode:"HTML",reply_to_message_id:msg.message_id,disable_web_page_preview:true})});return new Response("OK");
    }
    if(new URL(request.url).pathname!=="/submit")return respond({error:"Not found"},404);
    if(request.method!=="POST")return respond({error:"Method not allowed"},405);
    if(!env.TELEGRAM_BOT_TOKEN||!env.TELEGRAM_CHAT_ID)return respond({error:"Contact service is not configured yet."},503);
    if(!(request.headers.get("Content-Type")||"").toLowerCase().includes("multipart/form-data"))return respond({error:"Invalid form upload."},415);
    const length=Number(request.headers.get("Content-Length")||0);if(Number.isFinite(length)&&length>65*1024*1024)return respond({error:"Combined upload is too large; keep it below 60 MB."},413);
    let form;try{form=await request.formData()}catch{return respond({error:"Invalid form data."},400)}
    if(String(form.get("company")||"").trim())return respond({ok:true});
    const name=String(form.get("name")||"").trim().slice(0,100),email=String(form.get("email")||"").trim().slice(0,180),phone=String(form.get("phone")||"").trim().slice(0,40),topic=String(form.get("topic")||"").trim().slice(0,80),message=String(form.get("message")||"").trim().slice(0,4000);
    if(!name||(!email&&!phone)||(email&&!/^[^\\s@]+@[^\\s@]+\\.[^\\s@]+$/.test(email))||!message||message.length<10)return respond({error:"Enter your name, a valid email or phone number, and a message of at least 10 characters."},400);
    const files=form.getAll("attachments").filter(f=>f&&typeof f==="object"&&typeof f.size==="number"&&f.size>0);
    if(files.length>3)return respond({error:"You can attach up to 3 files."},400);
    const max=20*1024*1024,allowed=new Set(["application/pdf","application/msword","application/vnd.openxmlformats-officedocument.wordprocessingml.document","application/vnd.ms-excel","application/vnd.openxmlformats-officedocument.spreadsheetml.sheet","application/vnd.ms-powerpoint","application/vnd.openxmlformats-officedocument.presentationml.presentation","text/plain","text/csv","application/rtf","image/jpeg","image/png","image/gif","image/webp","video/mp4","video/quicktime","video/webm","video/mpeg","video/3gpp"]);
    for(const f of files){if(f.size>max)return respond({error:"Each file must be 20 MB or smaller: "+String(f.name||"file").slice(0,100)},413);if(!allowed.has(String(f.type||"").toLowerCase()))return respond({error:"Unsupported file type: "+String(f.name||"file").slice(0,100)},415);}
    const esc=s=>String(s).replace(/&/g,"&amp;").replace(/</g,"&lt;").replace(/>/g,"&gt;");
    const lines=["📩 <b>New Portfolio Contact</b>","","<b>Name:</b> "+esc(name),email?"<b>Email:</b> "+esc(email):"",phone?"<b>Phone:</b> "+esc(phone):"",topic?"<b>Topic:</b> "+esc(topic):"","<b>Message:</b>",esc(message),files.length?"<b>Attachments ("+files.length+"):</b> "+files.map(f=>esc(String(f.name||"file").slice(0,100))).join(", "):"<b>Attachments:</b> none"].filter(Boolean);
    const api="https://api.telegram.org/bot"+env.TELEGRAM_BOT_TOKEN+"/",msg=await fetch(api+"sendMessage",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({chat_id:env.TELEGRAM_CHAT_ID,text:lines.join("\\n"),parse_mode:"HTML",disable_web_page_preview:true})}),mr=await msg.json().catch(()=>({}));
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
    if(daily){ let gaLines; try { const g=await ga4Report(); gaLines=["📈 <b>GA4 — Today (Bangladesh time; through report time)</b>","👥 Active users: "+g.users,"🔁 Sessions: "+g.sessions,"👁️ Page views: "+g.views,"💬 Engagement rate: "+(Number(g.engagement)*100).toFixed(2)+"%"]; } catch(e) { gaLines=["⚠️ <b>GA4 report unavailable</b>","<code>"+String(e&&e.message||e).replace(/&/g,"&amp;").replace(/</g,"&lt;").replace(/>/g,"&gt;").slice(0,280)+"</code>"]; } await sendTelegram(["📊 <b>Website Daily Health Report</b>","🕒 "+stamp+" (Bangladesh time)","🌐 "+site,failure?"🚨 Site status: DOWN / ERROR — "+failure:"✅ Site response: HTTP "+status,responseMs===null?"":"⏱️ Response time: "+responseMs+" ms",missing.length?"🔎 Security headers missing/not exposed: "+missing.join(", "):"🛡️ Basic security headers: present","",...gaLines,"","ℹ️ Basic uptime/header check, not a full security audit."].filter(Boolean).join("\n")); }
  }
};