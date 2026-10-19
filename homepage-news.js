(() => {
  "use strict";
  const css = `
    #breaking-news-ticker{position:fixed;top:72px;left:0;right:0;z-index:35;height:34px;display:flex;align-items:center;overflow:hidden;background:rgba(5,7,11,.96);border-bottom:1px solid rgba(0,242,254,.25);box-shadow:0 5px 18px rgba(0,0,0,.2)}
    #breaking-news-ticker .bnt-label{height:100%;flex:0 0 auto;display:flex;align-items:center;gap:7px;padding:0 13px;background:#00f2fe;color:#031015;font:800 10px 'JetBrains Mono',monospace;letter-spacing:.08em}
    #breaking-news-ticker .bnt-dot{width:6px;height:6px;border-radius:50%;background:#ff254f;box-shadow:0 0 8px #ff254f;animation:bntPulse 1s infinite}
    #breaking-news-ticker .bnt-window{min-width:0;flex:1;overflow:hidden;white-space:nowrap}
    #breaking-news-ticker .bnt-track{display:inline-flex;align-items:center;gap:34px;white-space:nowrap;will-change:transform;animation:bntMoveLeft linear infinite;width:max-content}
    #breaking-news-ticker:hover .bnt-track{animation-play-state:paused}
    #breaking-news-ticker .bnt-item{color:#e8f4ff;text-decoration:none;font:600 11px 'Outfit',sans-serif}
    #breaking-news-ticker .bnt-item:before{content:'◆';color:#00f2fe;font-size:8px;margin-right:9px}
    #breaking-news-ticker .bnt-item:hover{color:#00f2fe}
    #breaking-news-ticker .bnt-empty{padding-left:14px;color:#94a3b8;font:500 11px 'Outfit',sans-serif}
    @keyframes bntMoveLeft{from{transform:translateX(0)}to{transform:translateX(-50%)}}
    @keyframes bntPulse{50%{opacity:.25}}
    @media(min-width:640px){#breaking-news-ticker{top:80px}}
    @media(prefers-reduced-motion:reduce){#breaking-news-ticker .bnt-track{animation:none;transform:none}}
  `;
  const style=document.createElement("style");style.textContent=css;document.head.appendChild(style);
  function safe(v){try{const u=new URL(v);return u.protocol==="https:"?u.href:"#"}catch(_){return "#"}}
  function esc(v){return String(v==null?"":v).replace(/[&<>"']/g,c=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c]))}
  function mount(){
    if(document.getElementById("breaking-news-ticker"))return;
    const header=document.querySelector("header");
    if(!header)return;
    const bar=document.createElement("div");bar.id="breaking-news-ticker";bar.setAttribute("aria-label","Breaking live news");
    bar.innerHTML='<div class="bnt-label"><span class="bnt-dot"></span>BREAKING</div><div class="bnt-window"><div id="bnt-track" class="bnt-track"><span class="bnt-empty">Connecting to live headlines…</span></div></div>';
    header.insertAdjacentElement("afterend",bar);
    async function loadHeadlines(){
      try{
        const response=await fetch("news-feed.json?updated="+Date.now(),{cache:"no-store"});
        if(!response.ok)throw Error("feed unavailable");
        const data=await response.json();
        const now=Date.now();
        const items=(Array.isArray(data.items)?data.items:[])
          .filter(x=>x.title&&x.link&&x.publishedAt&&now-new Date(x.publishedAt).getTime()<=36*60*60*1000&&now-new Date(x.publishedAt).getTime()>=-5*60*1000)
          .sort((a,b)=>new Date(b.publishedAt)-new Date(a.publishedAt)).slice(0,18);
        const track=document.getElementById("bnt-track");if(!track)return;
        if(!items.length){track.innerHTML='<span class="bnt-empty">No fresh breaking headlines at the moment · <a style="color:#00f2fe" href="news.html">Open News</a></span>';track.style.animation="none";return}
        const content=items.map(x=>'<a class="bnt-item" href="'+safe(x.link)+'" target="_blank" rel="noopener noreferrer">'+esc(x.title)+'</a>').join("");
        track.innerHTML=content+content;
        // Move left at 10 pixels per second.
        const halfWidth=track.scrollWidth/2;
        track.style.animationDuration=Math.max(45,halfWidth/10)+"s";
      }catch(_){
        const track=document.getElementById("bnt-track");
        if(track&&track.querySelector(".bnt-empty"))track.innerHTML='<span class="bnt-empty">Live headlines temporarily unavailable · <a style="color:#00f2fe" href="news.html">Open News</a></span>';
      }
    }
    loadHeadlines();
    // Refresh ticker data in place; users do not need to reload the homepage.
    window.setInterval(loadHeadlines,10*60*1000);
  }
  if(document.readyState==="loading")document.addEventListener("DOMContentLoaded",mount);else mount();
})();