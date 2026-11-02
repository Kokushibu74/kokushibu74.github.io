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
    $("module-grid").innerHTML=modules.filter(m=>m[0]!=="dashboard").map(m=>`<button class="module-card" data-section="${m[0]}"><span class="arrow">↗</span><span class="module-symbol">${m[1]}</span><b>${m[2]}</b><small>${m[3]}</small></button>`).join("");
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
  async function renderModule(section) {
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
      if(section==="users"){
        const wrap=document.createElement("div");wrap.className="user-tools";
        const summary=document.createElement("pre");summary.className="module-report";summary.textContent=result.text||JSON.stringify(result.stats,null,2);wrap.append(summary);
        const label=document.createElement("label");label.textContent="Search Telegram ID / Visitor ID / Custom ID";
        const input=document.createElement("input");input.id="user-lookup";input.placeholder="e.g. 123456789 or VIS-…";
        const search=document.createElement("button");search.type="button";search.textContent="Search user";
        const details=document.createElement("pre");details.className="module-report";
        const history=document.createElement("button");history.type="button";history.textContent="Load user history";history.disabled=true;
        const operation=document.createElement("select");operation.innerHTML="<option value=\"rename\">Rename custom ID</option><option value=\"block\">Block</option><option value=\"unblock\">Unblock</option><option value=\"unlink\">Unlink identity</option>";
        const custom=document.createElement("input");custom.placeholder="New custom ID (rename only)";
        const scope=document.createElement("select");scope.innerHTML="<option value=\"both\">Both linked accounts</option><option value=\"telegram\">Telegram only</option><option value=\"website\">Website only</option>";
        const apply=document.createElement("button");apply.type="button";apply.textContent="Apply user action";apply.disabled=true;
        let found=null;
        search.addEventListener("click",async()=>{search.disabled=true;try{const r=await api("userLookup",{query:input.value.trim()});found=r.user;details.textContent=JSON.stringify(found,null,2);history.disabled=false;apply.disabled=false;}catch(err){notice(err.message,true);}finally{search.disabled=false;}});
        history.addEventListener("click",async()=>{history.disabled=true;try{const h=await api("userHistory",{query:input.value.trim()});details.textContent=JSON.stringify({profile:found,history:h.rows},null,2);}catch(err){notice(err.message,true);}finally{history.disabled=false;}});
        operation.addEventListener("change",()=>{custom.hidden=operation.value!=="rename";scope.hidden=!["block","unblock"].includes(operation.value);});
        apply.addEventListener("click",async()=>{if(!found)return;const op=operation.value;const promptText="Confirm "+op+" for "+found.id+"?";const yes=tg?.showConfirm?await new Promise(resolve=>tg.showConfirm(promptText,resolve)):window.confirm(promptText);if(!yes)return;apply.disabled=true;try{const r=await api("userAction",{operation:op,query:found.id,customId:custom.value,scope:scope.value});notice(r.message||"User action completed.");const fresh=await api("userLookup",{query:found.id});found=fresh.user;details.textContent=JSON.stringify(found,null,2);}catch(err){notice(err.message,true);}finally{apply.disabled=false;}});
        custom.hidden=true;scope.hidden=true;wrap.append(label,input,search,details,history,operation,custom,scope,apply);el.replaceChildren(wrap);
      }
      else if(result.text){const pre=document.createElement("pre");pre.className="module-report";pre.textContent=result.text;el.replaceChildren(pre);}
      else if(result.runs){const list=document.createElement("div");list.className="run-list";result.runs.forEach(run=>{const item=document.createElement("article");item.className="run-item";const title=document.createElement("b");title.textContent=run.name||"Workflow";const meta=document.createElement("small");meta.textContent=[run.status,run.conclusion,run.branch,run.createdAt?new Date(run.createdAt).toLocaleString():""].filter(Boolean).join(" · ");item.append(title,meta);if(run.url){const link=document.createElement("a");link.href=run.url;link.target="_blank";link.rel="noopener noreferrer";link.textContent="Open GitHub Run ↗";item.append(link);}list.append(item);});el.replaceChildren(list);if(!result.runs.length)el.textContent="No recent GitHub Actions runs were returned."; }
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