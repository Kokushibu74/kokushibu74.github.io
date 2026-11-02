(() => {
  "use strict";
  const API_BASE = "https://portfolio-contact-telegram.mdshihab74.workers.dev";
  const tg = window.Telegram?.WebApp;
  const modules = [
    ["dashboard","⌂","Dashboard","System overview"],
    ["website","◉","Website","Uptime & visitor health"],
    ["news","▤","News","Feed refresh & source health"],
    ["analytics","⌁","Analytics","GA4 & visitor insights"],
    ["security","⬡","Security","Protection & security checks"],
    ["github","⌘","GitHub","Repository & workflow runs"],
    ["hero","▧","Hero Image","Preview & publish image"],
    ["automation","⟳","Automation","Schedules & run history"],
    ["alerts","⚑","Alerts","Notifications & incidents"],
    ["reports","▥","Reports","Daily reports & comparisons"],
    ["users","♙","User Manager","Visitor & Telegram users"],
    ["settings","⚙","Settings","Bot & system configuration"],
    ["logs","≋","Logs","Activity & error records"],
    ["recovery","⟲","Recovery","Backups & recovery tools"]
  ];
  const $ = id => document.getElementById(id);
  const state = { section:"dashboard", user:null, data:null, busy:false };
  const escapeHtml = value => String(value ?? "").replace(/[&<>"']/g, c => ({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c]));
  const icon = id => modules.find(m => m[0] === id)?.[1] || "◈";
  function notice(message, error=false) {
    const el=$("notice"); el.textContent=message; el.classList.toggle("error",error); el.hidden=!message;
  }
  function renderNav() {
    const item = m => `<button class="nav-item ${state.section===m[0]?"active":""}" data-section="${m[0]}"><span class="nav-icon">${m[1]}</span><span class="nav-label">${m[2]}</span></button>`;
    $("side-nav").innerHTML=modules.map(item).join("");
    $("mobile-nav").innerHTML=modules.filter(m=>["dashboard","website","analytics","automation","settings"].includes(m[0])).map(m=>`<button class="${state.section===m[0]?"active":""}" data-section="${m[0]}"><span>${m[1]}</span>${m[2]}</button>`).join("");
    $("module-grid").innerHTML=modules.filter(m=>m[0]!=="dashboard").map(m=>`<button class="module-card" data-section="${m[0]}"><span class="arrow"></span><span class="module-symbol">${m[1]}</span><b>${m[2]}</b><small>${m[3]}</small></button>`).join("");
  }
  function go(section) {
    state.section=section; renderNav();
    const dashboard=section==="dashboard";
    $("view-dashboard").classList.toggle("active",dashboard);
    $("view-module").classList.toggle("active",!dashboard);
    const m=modules.find(x=>x[0]===section)||modules[0];
    $("page-title").textContent=dashboard?"Command Center":m[2];
    $("crumb").textContent=m[2].toUpperCase();
    $("module-orb").textContent=m[1]; $("module-kicker").textContent="CONTROL MODULE / "+String(modules.indexOf(m)+1).padStart(2,"0");
    $("module-title").textContent=m[2]; $("module-description").textContent=m[3];
    if(!dashboard) renderModule(section);
    document.body.classList.remove("drawer-open");
  }
  let automationRefreshTimer=null,automationClockTimer=null;
  async function renderModule(section) {
    if(section!=="automation"){if(automationRefreshTimer){clearInterval(automationRefreshTimer);automationRefreshTimer=null;}if(automationClockTimer){clearInterval(automationClockTimer);automationClockTimer=null;}}
    const labels={
      website:"Uptime checks, response time, security headers and live visitor telemetry.",
      news:"News feed health, last refresh result and source-level diagnostics.",
      analytics:"GA4 active users, sessions, page views and visitor trends.",
      security:"Security posture, protection status and recent alerts.",
      github:"Repository status, latest commits and GitHub Actions workflow runs.",
      hero:"Upload a new hero image, preview the actual homepage crop and confirm publishing.",
      automation:"Schedule overview, Bangladesh-time countdowns and verified run history.",
      alerts:"Recent critical incidents, alert settings and acknowledgement history.",
      reports:"Daily health report, GA4 metrics and day-over-day comparisons.",
      users:"Search and manage linked Telegram and website visitor profiles.",
      settings:"Admin access, bot configuration and system preferences.",
      logs:"Recent Worker events, workflow logs and security activity.",
      recovery:"Verified backup references and safe recovery procedures."
    };
    const el=$("module-content");
    if(section==="automation"){
      const el=$("module-content");if(automationRefreshTimer)clearInterval(automationRefreshTimer);if(automationClockTimer)clearInterval(automationClockTimer);
      el.innerHTML='<div class="automation-wrap"><div class="automation-top"><div><span class="section-kicker">SCHEDULED OPERATIONS</span><h3>Recent automations</h3><p>Cloudflare Cron and GitHub Actions · verified activity from the last 24 hours</p></div><button type="button" id="automation-refresh">↻ Refresh</button></div><div class="automation-timers" id="automation-timers"></div><div class="automation-source-status" id="automation-source-status" aria-live="polite"></div><div class="automation-summary" id="automation-summary"></div><div class="automation-log-head"><div><span class="section-kicker">ACTIVITY TIMELINE</span><h3>Last 24 hours</h3></div><span class="tag" id="automation-count">0 EVENTS</span></div><div id="automation-events" class="automation-events"><div class="empty-state">Loading verified automation history…</div></div><p class="automation-footnote">Idle-menu cleanup is checked every 15 minutes by the existing every-minute Cron trigger. The 30-minute Cron performs the website health/security-header check and the daily report window at 23:00 Bangladesh time. GitHub News Refresh is scheduled every 15 minutes. Event-triggered workflows appear when GitHub starts them.</p></div>';
      const timers=$("automation-timers"),summary=$("automation-summary"),events=$("automation-events"),count=$("automation-count"),sourceStatus=$("automation-source-status"),refreshButton=$("automation-refresh");let snap={cfg:{},cron:[],runs:[],errors:[],configAvailable:false},loading=false;
      const fmt=ts=>new Date(ts).toLocaleString("en-GB",{timeZone:"Asia/Dhaka",day:"2-digit",month:"short",hour:"2-digit",minute:"2-digit",second:"2-digit",hourCycle:"h23"});
      const cd=ms=>{const s=Math.max(0,Math.floor(ms/1000));return [Math.floor(s/3600),Math.floor(s%3600/60),s%60].map(v=>String(v).padStart(2,"0")).join(":");};
      const aligned=m=>{const off=21600000,step=m*60000;return Math.ceil((Date.now()+off)/step)*step-off;};
      const daily=()=>{const d=new Date(Date.now()+21600000),t=new Date(Date.UTC(d.getUTCFullYear(),d.getUTCMonth(),d.getUTCDate(),23)-21600000);if(t.getTime()<=Date.now())t.setUTCDate(t.getUTCDate()+1);return t.getTime();};
      const label=s=>({success:"SUCCESS",warning:"WARNING",failure:"FAILED",failed:"FAILED",cancelled:"CANCELLED",skipped:"SKIPPED",in_progress:"RUNNING",queued:"QUEUED",running:"RUNNING",interrupted:"INTERRUPTED",completed:"COMPLETED"}[String(s||"").toLowerCase()]||String(s||"UNKNOWN").toUpperCase());
      const drawTimers=()=>{const q=snap.cfg||{},known=snap.configAvailable,d=[["IDLE MENU CLEANUP","Cleanup check · every 15 minutes",true,aligned(15),"Existing Cron * * * * *"],["WORKER HEALTH CHECK","Cloudflare · every 30 minutes",known?!!(q.monitoring&&q.scheduledChecks):null,aligned(30),"Cron */30"],["NEWS REFRESH","GitHub Actions · every 15 minutes",known?!!q.newsRefresh:null,aligned(15),"update-news.yml"],["DAILY REPORT","Bangladesh time · 23:00",known?!!(q.dailyReport&&q.monitoring&&q.scheduledChecks):null,daily(),"23:00 BDT"]];timers.innerHTML=d.map(x=>{const state=x[2]===null?"UNKNOWN":x[2]?"SCHEDULED":"DISABLED";const time=x[2]===null?"Awaiting configuration":x[2]?cd(x[3]-Date.now()):"DISABLED";return '<article class="automation-card '+(x[2]===null?"is-unknown":x[2]?"is-active":"is-disabled")+'"><small>'+x[0]+'</small><b>'+time+'</b><span>'+state+' · '+x[1]+'</span><i>'+x[4]+'</i></article>';}).join("");};
      const drawEvents=()=>{const cut=Date.now()-86400000,cr=snap.cron.filter(x=>Number(x.at)>=cut).map(x=>({kind:"Cloudflare Cron",name:x.cron==="*/30 * * * *"?"Website health & security check":"Worker scheduled task",status:x.status,at:x.at,detail:x.detail,duration:x.durationMs,http:x.httpStatus})),gh=snap.runs.filter(x=>Date.parse(x.createdAt||0)>=cut).map(x=>({kind:"GitHub Actions",name:x.name||"Workflow",status:x.status==="in_progress"?"running":x.conclusion||x.status,at:Date.parse(x.createdAt),detail:x.branch?"Branch "+x.branch:"",url:x.url})),all=[...cr,...gh].sort((x,y)=>y.at-x.at),ok=all.filter(x=>["success","completed"].includes(String(x.status).toLowerCase())).length,bad=all.filter(x=>["failure","failed","cancelled","timed_out","warning","interrupted"].includes(String(x.status).toLowerCase())).length,active=all.filter(x=>["running","in_progress","queued"].includes(String(x.status).toLowerCase())).length;
        sourceStatus.replaceChildren();for(const message of snap.errors){const warning=document.createElement("div");warning.className="automation-source-warning";warning.textContent=message;sourceStatus.append(warning);}if(!snap.errors.length){const healthy=document.createElement("div");healthy.className="automation-source-ok";healthy.textContent="Connected sources are responding. Activity is shown only when a run is verified.";sourceStatus.append(healthy);}
        summary.innerHTML='<span>'+all.length+' events</span><span class="good">'+ok+' successful</span><span class="bad">'+bad+' issues</span><span>'+active+' active</span>';count.textContent=all.length+" EVENTS";events.replaceChildren();if(!all.length){events.innerHTML='<div class="empty-state">'+(snap.errors.length?"No activity can be confirmed from the available sources. Check the source warnings above.":"No recorded automation events in the last 24 hours. Future scheduled runs will appear here after completion.")+'</div>';return;}
        for(const x of all.slice(0,120)){const row=document.createElement("article");row.className="automation-event";const dot=document.createElement("span");dot.className="automation-dot "+(["success","completed"].includes(String(x.status).toLowerCase())?"ok":["failure","failed","cancelled","warning","interrupted","timed_out"].includes(String(x.status).toLowerCase())?"bad":"pending");const body=document.createElement("div");body.className="automation-event-body";const head=document.createElement("div");head.className="automation-event-title";const b=document.createElement("b");b.textContent=x.name;const st=document.createElement("span");st.className="automation-status";st.textContent=label(x.status);head.append(b,st);const meta=document.createElement("small");meta.textContent=x.kind+" · "+fmt(x.at)+(x.duration!=null?" · "+x.duration+" ms":"")+(x.http?" · HTTP "+x.http:"");const detail=document.createElement("p");detail.textContent=x.detail||"No additional details reported.";body.append(head,meta,detail);row.append(dot,body);if(x.url){const a=document.createElement("a");a.href=x.url;a.target="_blank";a.rel="noopener noreferrer";a.textContent="Open run";row.append(a);}events.append(row);}
      };
      const load=async()=>{if(loading)return;loading=true;refreshButton.disabled=true;try{const results=await Promise.allSettled([api("getConfig"),api("cronHistory"),api("workflowRuns")]);const [cfg,cron,runs]=results;const errors=[];if(cfg.status==="rejected")errors.push("Configuration unavailable: "+String(cfg.reason?.message||cfg.reason).slice(0,150));if(cron.status==="rejected")errors.push("Cloudflare Cron history unavailable: "+String(cron.reason?.message||cron.reason).slice(0,150));if(runs.status==="rejected")errors.push("GitHub Actions history unavailable: "+String(runs.reason?.message||runs.reason).slice(0,150));snap={cfg:cfg.status==="fulfilled"?(cfg.value.config||{}):{},cron:cron.status==="fulfilled"?(cron.value.rows||[]):[],runs:runs.status==="fulfilled"?(runs.value.runs||[]):[],errors,configAvailable:cfg.status==="fulfilled"};drawEvents();drawTimers();}finally{loading=false;refreshButton.disabled=false;}};
      refreshButton.addEventListener("click",load);await load();automationClockTimer=setInterval(()=>{if(state.section!=="automation"){clearInterval(automationClockTimer);automationClockTimer=null;return;}drawTimers();},1000);return;
    }
    if(["automation","alerts","settings"].includes(section)){
      try{
        const result=await api("getConfig"),cfg=result.config||{};
        const groups=section==="automation"?["monitoring","dailyReport","scheduledChecks","newsRefresh"]:section==="alerts"?["workflowAlerts","trafficAlerts","clientErrorAlerts","securityAlerts","emergencyProtection"]:Object.keys(cfg);
        const names={monitoring:"Website Monitoring",dailyReport:"Daily Report",scheduledChecks:"Scheduled Health Checks",newsRefresh:"Automatic News Refresh",workflowAlerts:"GitHub Workflow Alerts",trafficAlerts:"Traffic Spike Alerts",clientErrorAlerts:"Client Error Alerts",securityAlerts:"Visitor Security Alerts",emergencyProtection:"Emergency Protection"};
        el.innerHTML=`<div class="settings-intro"><b>Live Bot Configuration</b><span>Changes are saved to the existing Cloudflare KV settings.</span></div><div class="toggle-list">${groups.map(key=>`<div class="toggle-row"><div><b>${escapeHtml(names[key]||key)}</b><small>${cfg[key]?"Enabled":"Disabled"} · Existing Bot setting</small></div><button class="toggle ${cfg[key]?"on":""}" data-toggle="${escapeHtml(key)}" data-value="${cfg[key]?"true":"false"}" aria-pressed="${cfg[key]?"true":"false"}"><i></i><span>${cfg[key]?"ON":"OFF"}</span></button></div>`).join("")}</div><div class="security-note">◈ Every change is authenticated against Telegram Admin identity and recorded in the Mini App audit log.</div>`;
        return;
      }catch(e){el.innerHTML=`<div class="empty-state">${escapeHtml(e.message)}</div>`;return}
    }
    el.textContent="Loading verified module data…";
    try{
      const result=await api("module",{section});
      if(section==="hero"){
        const wrap=document.createElement("div");wrap.className="user-tools";
        const intro=document.createElement("small");intro.textContent="Choose a JPEG, PNG or WebP image (maximum 4 MB). The image is staged privately for 10 minutes; nothing is published until you confirm.";
        const file=document.createElement("input");file.type="file";file.accept="image/jpeg,image/png,image/webp";
        const local=document.createElement("img");local.alt="Selected hero image preview";local.hidden=true;local.style.cssText="max-width:100%;max-height:240px;object-fit:contain;border-radius:12px;border:1px solid rgba(120,145,190,.2)";
        const stage=document.createElement("button");stage.type="button";stage.textContent="Upload & Prepare Preview";stage.disabled=true;
        const status=document.createElement("pre");status.className="module-report";status.textContent="No image selected.";
        const frame=document.createElement("iframe");frame.title="Homepage hero preview";frame.hidden=true;frame.loading="lazy";frame.style.cssText="width:100%;height:560px;border:1px solid rgba(120,145,190,.2);border-radius:12px;background:#070b14";
        const actions=document.createElement("div");actions.style.cssText="display:flex;gap:8px;flex-wrap:wrap";
        const confirm=document.createElement("button");confirm.type="button";confirm.textContent="Confirm & Publish to Live Site";confirm.hidden=true;
        const cancel=document.createElement("button");cancel.type="button";cancel.textContent="Cancel Preview";cancel.hidden=true;
        let selected=null,token=null,previewUrl=null;
        file.addEventListener("change",()=>{selected=file.files?.[0]||null;stage.disabled=!selected||selected.size>4*1024*1024;if(previewUrl)URL.revokeObjectURL(previewUrl);previewUrl=selected?URL.createObjectURL(selected):null;local.src=previewUrl||"";local.hidden=!selected;status.textContent=selected?(selected.size>4*1024*1024?"Image exceeds the 4 MB limit.":selected.name+" · "+Math.ceil(selected.size/1024)+" KB"):"No image selected.";});
        stage.addEventListener("click",async()=>{if(!selected)return;stage.disabled=true;status.textContent="Uploading image securely to temporary private storage…";try{
          const dataUrl=await new Promise((resolve,reject)=>{const reader=new FileReader();reader.onload=()=>resolve(String(reader.result||""));reader.onerror=()=>reject(new Error("Could not read selected image."));reader.readAsDataURL(selected);});
          const base64=dataUrl.split(",")[1];const r=await api("heroPrepare",{mimeType:selected.type,base64});token=r.token;frame.src=r.previewUrl;frame.hidden=false;confirm.hidden=false;cancel.hidden=false;status.textContent="Private preview ready. Review the actual homepage below. This image is not live yet.";
        }catch(err){status.textContent=err.message;notice(err.message,true);}finally{stage.disabled=!selected||selected.size>4*1024*1024;}});
        confirm.addEventListener("click",async()=>{if(!token)return;const yes=tg?.showConfirm?await new Promise(resolve=>tg.showConfirm("Publish this hero image to the live website? This will update site-data.json on main.",resolve)):window.confirm("Publish this hero image to the live website?");if(!yes)return;confirm.disabled=true;try{const r=await api("heroConfirm",{token});status.textContent="Published successfully: "+r.imagePath+"\\nCommit: "+(r.commit||"accepted");notice("Hero image published to the live site.");token=null;frame.hidden=true;confirm.hidden=true;cancel.hidden=true;}catch(err){status.textContent=err.message;notice(err.message,true);}finally{confirm.disabled=false;}});
        cancel.addEventListener("click",async()=>{if(token){try{await api("heroCancel",{token});}catch(err){notice(err.message,true);}}token=null;frame.hidden=true;confirm.hidden=true;cancel.hidden=true;status.textContent="Preview cancelled. Nothing was published.";});
        actions.append(stage,confirm,cancel);wrap.append(intro,file,local,actions,status,frame);el.replaceChildren(wrap);
      }
      else if(section==="analytics"||section==="reports"){
        const wrap=document.createElement("div");wrap.className="user-tools";
        const title=document.createElement("b");title.textContent="Google Analytics 4 · Property 560673761";
        const status=document.createElement("pre");status.className="module-report";status.textContent="Loading verified GA4 metrics…";
        const refresh=document.createElement("button");refresh.type="button";refresh.textContent="↻ Refresh GA4 Report";
        const note=document.createElement("small");note.textContent="Metrics are fetched live from Google Analytics Data API using the existing Worker service-account secret. No metrics are estimated.";
        const load=async()=>{refresh.disabled=true;status.textContent="Requesting GA4 report…";try{
          const r=await api("ga4Report");
          const fmt=x=>x?("Active users: "+x.activeUsers+"\\nSessions: "+x.sessions+"\\nPage views: "+x.pageViews+"\\nEngagement rate: "+(Number(x.engagementRate)*100).toFixed(2)+"%"):"No rows returned by GA4.";
          status.textContent="TODAY\\n"+fmt(r.today)+"\\n\\nYESTERDAY\\n"+fmt(r.yesterday)+"\\n\\nSource: "+r.source+" · Property: "+r.propertyId;
        }catch(err){status.textContent="GA4 report unavailable: "+err.message;}finally{refresh.disabled=false;}};
        refresh.addEventListener("click",load);wrap.append(title,status,refresh,note);el.replaceChildren(wrap);await load();
      }
      else if(section==="news"){
        const wrap=document.createElement("div");wrap.className="user-tools";
        const report=document.createElement("pre");report.className="module-report";report.textContent=result.text||"News feed status loaded.";
        const refresh=document.createElement("button");refresh.type="button";refresh.textContent="↻ Refresh News Feed Now";
        const note=document.createElement("small");note.textContent="Runs the existing GitHub Actions news workflow on main. It will update the live feed if new articles are found.";
        refresh.addEventListener("click",async()=>{
          const yes=tg?.showConfirm?await new Promise(resolve=>tg.showConfirm("Start the live News Refresh workflow now?",resolve)):window.confirm("Start the live News Refresh workflow now?");
          if(!yes)return;refresh.disabled=true;
          try{const r=await api("newsRefresh");notice("News workflow accepted by GitHub. Check the workflow run for its final result.");const link=document.createElement("a");link.href=r.url;link.target="_blank";link.rel="noopener noreferrer";link.textContent="Open News Refresh workflow ";wrap.append(link);}
          catch(err){notice(err.message,true);}finally{refresh.disabled=false;}
        });
        wrap.append(report,refresh,note);el.replaceChildren(wrap);
      }
      else if(section==="logs"){
        const wrap=document.createElement("div");wrap.className="user-tools";
        const audit=document.createElement("pre");audit.className="module-report";audit.textContent=result.text||"No recent Mini App activity.";
        const historyButton=document.createElement("button");historyButton.type="button";historyButton.textContent="Load Cloudflare Cron Run History";
        const history=document.createElement("pre");history.className="module-report";
        historyButton.addEventListener("click",async()=>{historyButton.disabled=true;try{const r=await api("cronHistory");history.textContent=r.rows.length?r.rows.map(x=>[new Date(x.at).toLocaleString(),x.status,x.cron,x.durationMs===null?"":x.durationMs+" ms",x.httpStatus?"HTTP "+x.httpStatus:"",x.detail].filter(Boolean).join(" · ")).join("\\n"):"No scheduled run history recorded yet.";}catch(err){history.textContent=err.message;}finally{historyButton.disabled=false;}});
        wrap.append(audit,historyButton,history);el.replaceChildren(wrap);
      }
      else if(section==="users"){
        const wrap=document.createElement("div");wrap.className="user-tools";
        const summary=document.createElement("pre");summary.className="module-report";summary.textContent=result.text||JSON.stringify(result.stats,null,2);wrap.append(summary);
        const label=document.createElement("label");label.textContent="Search Telegram ID / Visitor ID / Custom ID";
        const input=document.createElement("input");input.id="user-lookup";input.placeholder="e.g. 123456789 or VIS-…";
        const search=document.createElement("button");search.type="button";search.textContent="Search user";
        const details=document.createElement("pre");details.className="module-report";
        const history=document.createElement("button");history.type="button";history.textContent="Load user history";history.disabled=true;
        const operation=document.createElement("select");operation.innerHTML="<option value=\"rename\">Rename custom ID</option><option value=\"block\">Block</option><option value=\"unblock\">Unblock</option><option value=\"unlink\">Unlink identity</option><option value=\"link\">Link Telegram + Website IDs</option>";
        const custom=document.createElement("input");custom.placeholder="New custom ID (rename only)";
        const telegramId=document.createElement("input");telegramId.placeholder="Telegram ID (link only)";telegramId.hidden=true;const visitorId=document.createElement("input");visitorId.placeholder="Visitor ID (link only)";visitorId.hidden=true;const scope=document.createElement("select");scope.innerHTML="<option value=\"both\">Both linked accounts</option><option value=\"telegram\">Telegram only</option><option value=\"website\">Website only</option>";
        const apply=document.createElement("button");apply.type="button";apply.textContent="Apply user action";apply.disabled=true;
        let found=null;
        search.addEventListener("click",async()=>{search.disabled=true;try{const r=await api("userLookup",{query:input.value.trim()});found=r.user;details.textContent=JSON.stringify(found,null,2);history.disabled=false;apply.disabled=false;}catch(err){notice(err.message,true);}finally{search.disabled=false;}});
        history.addEventListener("click",async()=>{history.disabled=true;try{const h=await api("userHistory",{query:input.value.trim()});details.textContent=JSON.stringify({profile:found,history:h.rows},null,2);}catch(err){notice(err.message,true);}finally{history.disabled=false;}});
        operation.addEventListener("change",()=>{custom.hidden=operation.value!=="rename";scope.hidden=!["block","unblock"].includes(operation.value);telegramId.hidden=visitorId.hidden=operation.value!=="link";});
        apply.addEventListener("click",async()=>{const op=operation.value;if(op!=="link"&&!found){notice("Search and select a user first.",true);return;}const promptText=op==="link"?"Confirm linking these Telegram and Website IDs?":"Confirm "+op+" for "+found.id+"?";const yes=tg?.showConfirm?await new Promise(resolve=>tg.showConfirm(promptText,resolve)):window.confirm(promptText);if(!yes)return;apply.disabled=true;try{const r=await api("userAction",{operation:op,query:found?.id||"",customId:custom.value,scope:scope.value,telegramId:telegramId.value.trim(),visitorId:visitorId.value.trim()});notice(r.message||"User action completed.");if(op!=="link"){const fresh=await api("userLookup",{query:found.id});found=fresh.user;details.textContent=JSON.stringify(found,null,2);}else details.textContent="Linked: "+telegramId.value+" ↔ "+visitorId.value;}catch(err){notice(err.message,true);}finally{apply.disabled=false;}});
        custom.hidden=true;scope.hidden=true;wrap.append(label,input,search,details,history,operation,custom,telegramId,visitorId,scope,apply);el.replaceChildren(wrap);
      }
      else if(result.text){const pre=document.createElement("pre");pre.className="module-report";pre.textContent=result.text;el.replaceChildren(pre);}
      else if(result.runs){const list=document.createElement("div");list.className="run-list";result.runs.forEach(run=>{const item=document.createElement("article");item.className="run-item";const title=document.createElement("b");title.textContent=run.name||"Workflow";const meta=document.createElement("small");meta.textContent=[run.status,run.conclusion,run.branch,run.createdAt?new Date(run.createdAt).toLocaleString():""].filter(Boolean).join(" · ");item.append(title,meta);if(run.url){const link=document.createElement("a");link.href=run.url;link.target="_blank";link.rel="noopener noreferrer";link.textContent="Open GitHub Run ";item.append(link);}list.append(item);});el.replaceChildren(list);if(!result.runs.length)el.textContent="No recent GitHub Actions runs were returned."; }
      else if(result.backups){const pre=document.createElement("pre");pre.className="module-report";pre.textContent=result.note+"\\n\\n"+result.backups.map(x=>x.name+" · "+(x.sha||"SHA unavailable")).join("\\n");el.replaceChildren(pre);}
      else{const pre=document.createElement("pre");pre.className="module-report";pre.textContent=JSON.stringify(result.stats||result.settings||result,null,2);el.replaceChildren(pre);}
    }catch(e){el.textContent=e.message;}
  }
  async function api(action,payload={}) {
    if(!tg?.initData) throw new Error("Telegram Mini App authentication data is missing. Open this page from the Kokushibu Bot menu inside Telegram.");
    const response=await fetch(API_BASE+"/miniapp/api",{method:"POST",headers:{"Content-Type":"application/json"},cache:"no-store",body:JSON.stringify({initData:tg.initData,action,...payload})});
    const data=await response.json().catch(()=>({}));
    if(!response.ok||data.ok!==true) throw new Error(data.error||"Secure API request failed ("+response.status+").");
    return data;
  }
  function renderOverview(data) {
    state.data=data;
    $("metric-site").textContent=data.overview?.site?.status||"—";
    $("metric-site-sub").textContent=data.overview?.site?.detail||"Live site check";
    $("metric-visitors").textContent=data.overview?.visitors?.today??"—";
    $("metric-views").textContent=data.overview?.visitors?.views??"—";
    $("metric-automation").textContent=data.overview?.automation?.enabled??"—";
    $("service-list").innerHTML=(data.services||[]).map(x=>`<div class="service-row"><div><div class="service-name">${escapeHtml(x.name)}</div><div class="service-meta">${escapeHtml(x.detail||"")}</div></div><span class="state ${x.ok?"ok":""}">${escapeHtml(x.status||"UNKNOWN")}</span></div>`).join("")||'<div class="empty-state">No verified service status returned.</div>';
    $("activity-list").innerHTML=(data.activity||[]).map(x=>`<div class="activity-row"><span class="activity-symbol">${escapeHtml(x.icon||"◈")}</span><div class="activity-copy"><b>${escapeHtml(x.title)}</b><small>${escapeHtml(x.detail||"")}</small></div></div>`).join("")||'<div class="empty-state">No recent events recorded.</div>';
    $("last-updated").textContent="UPDATED "+new Date().toLocaleTimeString("en-GB",{hour:"2-digit",minute:"2-digit",second:"2-digit"});
    if(data.user){state.user=data.user;$("admin-name").textContent=data.user.first_name||data.user.username||"Admin";$("admin-avatar").textContent=(data.user.first_name||"A").slice(0,1).toUpperCase();}
  }
  async function refresh() {
    if(state.busy)return;state.busy=true;$("refresh-btn").disabled=true;$("connection-label").textContent="SYNCING";notice("");
    try{const data=await api("overview");renderOverview(data);$("connection-label").textContent="SECURE";$("connection-label").previousElementSibling.style.background="var(--green)";$("connection-label").previousElementSibling.style.boxShadow="0 0 10px var(--green)";if(state.section!=="dashboard")renderModule(state.section);}
    catch(e){$("connection-label").textContent="OFFLINE";notice(e.message,true);}
    finally{state.busy=false;$("refresh-btn").disabled=false;}
  }
  function tick(){const d=new Date();$("clock").textContent=new Intl.DateTimeFormat("en-GB",{timeZone:"Asia/Dhaka",hour:"2-digit",minute:"2-digit",second:"2-digit",hourCycle:"h23"}).format(d);}
  document.addEventListener("click",async e=>{
    const toggle=e.target.closest("[data-toggle]");
    if(toggle){
      const key=toggle.dataset.toggle,value=toggle.dataset.value!=="true";
      const proceed=tg?.showConfirm?await new Promise(resolve=>tg.showConfirm("Change "+key+" to "+(value?"ON":"OFF")+"?",resolve)):window.confirm("Change "+key+" to "+(value?"ON":"OFF")+"?");
      if(!proceed)return;
      toggle.disabled=true;
      try{await api("setConfig",{key,value});notice("Saved: "+key+" is now "+(value?"ON":"OFF")+".");await renderModule(state.section);}
      catch(err){notice(err.message,true);toggle.disabled=false;}
      return;
    }
    const b=e.target.closest("[data-section]");if(b)go(b.dataset.section);
  });
  $("refresh-btn").addEventListener("click",refresh);
  $("mobile-menu").addEventListener("click",()=>document.body.classList.add("drawer-open"));
  $("drawer-scrim").addEventListener("click",()=>document.body.classList.remove("drawer-open"));
  if(tg){tg.ready();tg.expand();tg.setHeaderColor?.("#080b16");tg.setBackgroundColor?.("#080b16");}
  renderNav();tick();setInterval(tick,1000);
  if(tg?.initDataUnsafe?.user){const u=tg.initDataUnsafe.user;$("admin-name").textContent=u.first_name||u.username||"Admin";$("admin-avatar").textContent=(u.first_name||"A").slice(0,1).toUpperCase();}
  if(!tg?.initData){$("connection-label").textContent="OPEN IN TELEGRAM";notice("This is the Telegram Mini App interface. Open it from the Kokushibu Bot after the secure backend and Bot menu are connected.",true);}
  else refresh();
})();