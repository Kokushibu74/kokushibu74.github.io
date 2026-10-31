/* Kokushibu74 Visitor Intelligence — free-first, privacy-conscious tracking. */
(()=>{
 "use strict";
 if(location.hostname!=="kokushibu74.github.io"||window.__K74_VISITOR_TRACKING__)return;
 window.__K74_VISITOR_TRACKING__=true;
 const ENDPOINT="https://portfolio-contact-telegram.mdshihab74.workers.dev/track";
 const KEY="k74_visitor_id_v1",SESSION="k74_session_v1",LAST="k74_last_seen_v1",TIMEOUT=30*60*1000;
 const hex=()=>Array.from(crypto.getRandomValues(new Uint8Array(6)),b=>b.toString(16).padStart(2,"0")).join("").toUpperCase();
 const get=(k)=>{try{return localStorage.getItem(k)}catch{return null}};
 const set=(k,v)=>{try{localStorage.setItem(k,v)}catch{}};
 let visitorId=get(KEY);if(!/^VIS-[A-F0-9]{12}$/.test(visitorId||"")){visitorId="VIS-"+hex();set(KEY,visitorId)}
 const now=Date.now();let sessionId=get(SESSION),last=Number(get(LAST)||0);
 if(!sessionId||!/^SES-[A-F0-9]{12}$/.test(sessionId)||now-last>TIMEOUT){sessionId="SES-"+hex();set(SESSION,sessionId)}
 set(LAST,String(now));
 const ua=navigator.userAgent||"",platform=navigator.userAgentData?.platform||navigator.platform||"Unknown";
 const mobile=/Android|iPhone|iPod|Mobile/i.test(ua),tablet=/iPad|Tablet/i.test(ua);
 const deviceType=tablet?"Tablet":mobile?"Mobile":"Desktop";
 const browser=/Edg\//.test(ua)?"Edge":/Firefox\//.test(ua)?"Firefox":/CriOS\//.test(ua)?"Chrome iOS":/Chrome\//.test(ua)?"Chrome":/Safari\//.test(ua)?"Safari":"Other";
 const os=/Android/.test(ua)?"Android":/iPhone|iPad|iPod/.test(ua)?"iOS":/Windows/.test(ua)?"Windows":/Mac OS/.test(ua)?"macOS":/Linux/.test(ua)?"Linux":"Unknown";
 const conn=navigator.connection||navigator.mozConnection||navigator.webkitConnection;
 const params=new URLSearchParams(location.search);
 const cleanRef=(()=>{try{const u=new URL(document.referrer);return u.origin}catch{return ""}})();
 const perf=()=>{const nav=performance.getEntriesByType("navigation")[0];return {loadMs:nav?Math.round(nav.loadEventEnd):null,domMs:nav?Math.round(nav.domContentLoadedEventEnd):null,lcp:null,cls:null}};
 const payload=()=>({visitorId,sessionId,page:location.pathname,referrer:cleanRef,utmSource:params.get("utm_source")||"",utmMedium:params.get("utm_medium")||"",utmCampaign:params.get("utm_campaign")||"",platform,deviceType,language:navigator.language||"",screen:screen.width+"x"+screen.height,viewport:innerWidth+"x"+innerHeight,pixelRatio:devicePixelRatio||1,browser,os,connection:conn?(conn.effectiveType||conn.type||"Available"):"Not exposed",performance:perf(),events:[]});
 const send=(body,keepalive=false)=>{try{return fetch(ENDPOINT,{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify(body),keepalive,credentials:"omit"}).catch(()=>{})}catch{return Promise.resolve()}};
 const data=payload();send(data);
 let scrollMarks=new Set(),events=[];
 const record=(type,value)=>{if(events.length<30)events.push({type,value:String(value||"").slice(0,140)})};
 addEventListener("scroll",()=>{const max=document.documentElement.scrollHeight-innerHeight;if(max>0){const p=Math.min(100,Math.round(scrollY/max*100));for(const m of [25,50,75,100])if(p>=m&&!scrollMarks.has(m)){scrollMarks.add(m);record("scroll",m+"%")}}},{passive:true});
 addEventListener("click",e=>{const el=e.target.closest("a,button,[role=button]");if(!el)return;const label=(el.innerText||el.getAttribute("aria-label")||el.href||el.id||el.className||"control").trim().replace(/\s+/g," ").slice(0,100);record("click",label)},{capture:true});
 addEventListener("error",e=>record("js_error",(e.message||"Script error")+" @ "+location.pathname));
 addEventListener("unhandledrejection",e=>record("promise_error",String(e.reason||"Unhandled rejection").slice(0,120)));
 try{new PerformanceObserver(list=>{const e=list.getEntries().slice(-1)[0];if(e){data.performance.lcp=Math.round(e.startTime);record("lcp",data.performance.lcp+"ms")}}).observe({type:"largest-contentful-paint",buffered:true})}catch{}
 try{new PerformanceObserver(list=>{let sum=0;for(const e of list.getEntries())if(!e.hadRecentInput)sum+=e.value;data.performance.cls=Number(((data.performance.cls||0)+sum).toFixed(4))}).observe({type:"layout-shift",buffered:true})}catch{}
 let sent=false;const flush=()=>{if(sent||!events.length)return;sent=true;const p=payload();p.events=events; p.performance=data.performance;send(p,true)};
 addEventListener("pagehide",flush);document.addEventListener("visibilitychange",()=>{if(document.visibilityState==="hidden")flush()});
 setTimeout(()=>{data.performance=perf()},2500);
})();