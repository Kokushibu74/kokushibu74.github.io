(() => {
  "use strict";
  const css = `
    #breaking-news-ticker{position:fixed;top:72px;left:0;right:0;z-index:35;height:40px;display:flex;align-items:center;overflow:hidden;background:linear-gradient(100deg,rgba(7,12,22,.98),rgba(9,17,29,.96) 55%,rgba(4,9,17,.98));border-bottom:1px solid rgba(0,242,254,.24);box-shadow:0 7px 24px rgba(0,0,0,.24),inset 0 1px 0 rgba(255,255,255,.035);backdrop-filter:blur(14px)}
    #breaking-news-ticker:after{content:"";position:absolute;bottom:0;left:0;width:100%;height:1px;background:linear-gradient(90deg,transparent,rgba(0,242,254,.6),transparent);pointer-events:none}
    #breaking-news-ticker .bnt-label{position:relative;z-index:1;align-self:stretch;flex:0 0 auto;display:flex;align-items:center;gap:9px;padding:0 18px 0 15px;background:linear-gradient(115deg,#d8fbff 0%,#35e8f8 48%,#00aeca 100%);color:#06202a;font:900 10px/1 'Outfit',system-ui,sans-serif;letter-spacing:.105em;text-shadow:0 1px rgba(255,255,255,.45);clip-path:polygon(0 0,100% 0,calc(100% - 11px) 100%,0 100%);box-shadow:4px 0 18px rgba(0,242,254,.12)}
    #breaking-news-ticker .bnt-label:before{content:"";position:absolute;left:0;top:0;bottom:0;width:3px;background:#fff;opacity:.9}
    #breaking-news-ticker .bnt-label-text{display:inline-block;white-space:nowrap}
    #breaking-news-ticker.is-breaking .bnt-label{gap:8px;padding-left:14px;padding-right:20px;background:linear-gradient(115deg,#ff718c 0%,#f5234f 52%,#b90835 100%);color:#fff;letter-spacing:.09em;text-shadow:0 1px 2px rgba(65,0,15,.35);box-shadow:4px 0 20px rgba(255,37,79,.22)}
    #breaking-news-ticker.is-breaking .bnt-label:before{background:#fff}
    #breaking-news-ticker.is-breaking .bnt-label-text{font-size:10px;font-weight:900}
    #breaking-news-ticker.is-breaking .bnt-dot{width:6px;height:6px;background:#fff;box-shadow:0 0 0 3px rgba(255,255,255,.17),0 0 10px rgba(255,255,255,.8)}
    #breaking-news-ticker.is-breaking:after{background:linear-gradient(90deg,transparent,rgba(255,55,95,.75),transparent)}
    #breaking-news-ticker .bnt-dot{width:7px;height:7px;flex:0 0 auto;border-radius:50%;background:#ff254f;box-shadow:0 0 0 3px rgba(255,37,79,.13),0 0 11px rgba(255,37,79,.9);animation:bntPulse 1s infinite}
    #breaking-news-ticker.is-breaking .bnt-dot{width:6px;height:6px;background:#fff;box-shadow:0 0 0 3px rgba(255,255,255,.15),0 0 10px rgba(255,255,255,.8)}
    #breaking-news-ticker:not(.is-breaking) .bnt-dot{display:none}
    #breaking-news-ticker .bnt-window{min-width:0;flex:1;overflow:hidden;white-space:nowrap;padding-left:5px}
    #breaking-news-ticker .bnt-track{display:inline-flex;align-items:center;gap:34px;white-space:nowrap;will-change:transform;animation:bntMoveLeft linear infinite;width:max-content}
    #breaking-news-ticker .bnt-track.is-single{display:flex;width:100%;animation:none;justify-content:flex-start}
    #breaking-news-ticker:hover .bnt-track{animation-play-state:paused}
    #breaking-news-ticker .bnt-item{color:#e8f4ff;text-decoration:none;font:600 11px 'Outfit',sans-serif;letter-spacing:.005em;transition:color .18s ease}
    #breaking-news-ticker .bnt-track.is-single .bnt-item{display:block;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;padding:0 14px;width:100%;animation:bntHeadlineIn .35s ease both}
    #breaking-news-ticker .bnt-item:before{content:'↗';display:inline-flex;align-items:center;justify-content:center;color:#00f2fe;font-size:11px;font-weight:800;margin-right:10px;width:17px;height:17px;border-radius:50%;background:rgba(0,242,254,.09);border:1px solid rgba(0,242,254,.22)}
    #breaking-news-ticker.is-breaking .bnt-item:before{content:'!';color:#ff6b88;background:rgba(255,55,95,.1);border-color:rgba(255,55,95,.28)}
    #breaking-news-ticker .bnt-item:hover{color:#00f2fe}
    #breaking-news-ticker .bnt-empty{padding-left:14px;color:#94a3b8;font:500 11px 'Outfit',sans-serif}
    @media(max-width:420px){#breaking-news-ticker{height:38px}#breaking-news-ticker .bnt-label{gap:6px;padding:0 12px;font-size:9px;letter-spacing:.09em}#breaking-news-ticker .bnt-item{font-size:10px}}
    @keyframes bntMoveLeft{from{transform:translateX(0)}to{transform:translateX(-50%)}}
    @keyframes bntPulse{50%{opacity:.25}}
    @keyframes bntHeadlineIn{from{opacity:0;transform:translateY(5px)}to{opacity:1;transform:translateY(0)}}
    @media(min-width:640px){#breaking-news-ticker{top:80px}}
    @media(prefers-reduced-motion:reduce){#breaking-news-ticker .bnt-track{animation:none!important;transform:none!important}#breaking-news-ticker .bnt-dot{animation:none}}
  `;
  const style=document.createElement("style");style.textContent=css;document.head.appendChild(style);
  function safe(v){try{const u=new URL(v);return u.protocol==="https:"?u.href:"#"}catch(_){return "#"}}
  function esc(v){return String(v==null?"":v).replace(/[&<>"']/g,c=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c]))}
  function mount(){
    if(document.getElementById("breaking-news-ticker"))return;
    const header=document.querySelector("header");
    if(!header)return;
    const bar=document.createElement("div");bar.id="breaking-news-ticker";bar.setAttribute("aria-label","News headlines");
    bar.innerHTML='<div class="bnt-label"><span class="bnt-dot"></span><span id="bnt-label-text" class="bnt-label-text">NEWS</span></div><div class="bnt-window"><div id="bnt-track" class="bnt-track"><span class="bnt-empty">Loading headlines…</span></div></div>';
    header.insertAdjacentElement("afterend",bar);
    let breakingItems=[];
    const track=()=>document.getElementById("bnt-track");
    function renderBreaking(){
      const t=track();if(!t||!breakingItems.length)return;
      // Newest valid breaking stories appear first; duplicate the sequence for a seamless marquee.
      const content=breakingItems.map(x=>'<a class="bnt-item" href="'+safe(x.link)+'" target="_blank" rel="noopener noreferrer" title="'+esc(x.title)+'">'+esc(x.title)+'</a>').join("");
      t.className="bnt-track";
      t.innerHTML=content+content;
      const halfWidth=t.scrollWidth/2;
      t.style.animationDuration=Math.max(24,halfWidth/24)+"s";
    }
    async function loadHeadlines(){
      try{
        const response=await fetch("news-feed.json?updated="+Date.now(),{cache:"no-store"});
        if(!response.ok)throw Error("feed unavailable");
        const data=await response.json();
        const now=Date.now();
        // Keep recent headlines from every feed category, newest publication first.
        const seenTitles=new Set();
        const fresh=(Array.isArray(data.items)?data.items:[]).filter(x=>{
          if(!x.title||!x.link||!x.publishedAt)return false;
          const stamp=new Date(x.publishedAt).getTime();
          const age=now-stamp;
          if(!Number.isFinite(stamp)||age>36*60*60*1000||age < -5*60*1000)return false;
          const key=String(x.title).toLocaleLowerCase().replace(/[^\p{L}\p{N}]+/gu," ").trim();
          if(!key||seenTitles.has(key))return false;
          seenTitles.add(key);
          return true;
        }).sort((a,b)=>new Date(b.publishedAt)-new Date(a.publishedAt));
        // Breaking status expires exactly 60 minutes after the original publication time.
        // Future-dated items are tolerated only for the small clock-skew window above.
        breakingItems=fresh.filter(x=>{
          if(x.isBreaking!==true)return false;
          const age=now-new Date(x.publishedAt).getTime();
          return age>=0&&age<=60*60*1000;
        }).slice(0,12);
        const label=document.getElementById("bnt-label-text");
        const ticker=document.getElementById("breaking-news-ticker");
        const t=track();if(!t)return;
        if(breakingItems.length){
          ticker.classList.add("is-breaking");
          ticker.setAttribute("aria-label","Breaking news headlines");
          label.textContent="BREAKING NEWS";
          renderBreaking();
          return;
        }
        ticker.classList.remove("is-breaking");
        ticker.setAttribute("aria-label","News headlines");
        label.textContent="NEWS";
        const items=fresh.slice(0,7);
        if(!items.length){
          t.className="bnt-track is-single";
          t.innerHTML='<span class="bnt-empty">No fresh headlines at the moment · <a style="color:#00f2fe" href="news.html">Open News</a></span>';
          return;
        }
        const content=items.map(x=>'<a class="bnt-item" href="'+safe(x.link)+'" target="_blank" rel="noopener noreferrer">'+esc(x.title)+'</a>').join("");
        t.className="bnt-track";t.innerHTML=content+content;
        const halfWidth=t.scrollWidth/2;
        t.style.animationDuration=Math.max(45,halfWidth/10)+"s";
      }catch(_){
        breakingItems=[];
        const ticker=document.getElementById("breaking-news-ticker");
        const label=document.getElementById("bnt-label-text");
        const t=track();
        if(t){ticker.classList.remove("is-breaking");if(label)label.textContent="NEWS";t.className="bnt-track is-single";t.innerHTML='<span class="bnt-empty">Live headlines temporarily unavailable · <a style="color:#00f2fe" href="news.html">Open News</a></span>';}
      }
    }
    loadHeadlines();
    // Re-scan the published feed every minute so breaking alerts expire on time
    // and newly published feed content appears without a page reload.
    window.setInterval(loadHeadlines,60*1000);
  }
  if(document.readyState==="loading")document.addEventListener("DOMContentLoaded",mount);else mount();
})();