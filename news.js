(() => {
  "use strict";
  const grid=document.getElementById("news-grid"),status=document.getElementById("news-status"),filters=document.getElementById("filters");
  const slidesRoot=document.getElementById("top-stories-slides"),slideCount=document.getElementById("top-stories-count"),controls=document.getElementById("top-stories-controls"),dotsRoot=document.getElementById("top-stories-dots");
  document.getElementById("year").textContent=new Date().getFullYear();
  let items=[],active="All",topItems=[],slideIndex=0,slideTimer=null;
  const esc=v=>String(v==null?"":v).replace(/[&<>"']/g,c=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c]));
  const safe=v=>{try{const u=new URL(v);return u.protocol==="https:"?u.href:"#"}catch(_){return "#"}};
  const dateOf=x=>{const d=x.publishedAt?new Date(x.publishedAt):null;return d&&!Number.isNaN(d.getTime())?d:null};
  const sorted=arr=>arr.slice().sort((a,b)=>(dateOf(b)?.getTime()||0)-(dateOf(a)?.getTime()||0));
  function renderTopStories(){
    const now=Date.now();
    const recent=sorted(items).filter(x=>safe(x.link)!=="#").map(x=>({...x,_date:dateOf(x)}));
    const hot=recent.filter(x=>x._date&&now-x._date.getTime()>=-5*60*1000&&now-x._date.getTime()<=24*60*60*1000);
    topItems=(hot.length?hot:recent).slice(0,5);
    if(!topItems.length){slidesRoot.innerHTML='<div class="top-stories-empty">Top stories will appear here as soon as the live news feed is available.</div>';slideCount.textContent="WAITING FOR HEADLINES";controls.hidden=true;return}
    slideIndex=Math.min(slideIndex,topItems.length-1);
    slidesRoot.innerHTML=topItems.map((x,i)=>{
      const image=safe(x.image||x.imageUrl||x.thumbnail||x.thumbnailUrl||x.enclosureUrl||"");
      const summary=x.description||x.summary||"Open the original report for the full story, context and latest developments.";
      const d=x._date;
      const bg=image!=="#"?'<img class="top-slide-image" src="'+esc(image)+'" alt="" loading="'+(i===0?"eager":"lazy")+'" referrerpolicy="no-referrer" onerror="this.style.display=\'none\'">':'<div class="top-slide-image" aria-hidden="true"></div>';
      return '<a class="top-slide'+(i===slideIndex?' active':'')+'" href="'+safe(x.link)+'" target="_blank" rel="noopener noreferrer" aria-label="Read full story: '+esc(x.title)+'" '+(i===slideIndex?'':'hidden')+'>'+bg+'<div class="top-slide-copy"><span class="top-slide-kicker">🔥 '+esc(x.category||"Top story")+' · FEATURED</span><h2>'+esc(x.title)+'</h2><p class="top-slide-summary">'+esc(summary)+'</p><div class="top-slide-meta"><span>'+esc(x.source||"Original publisher")+'</span><span>•</span><span>'+(d?esc(d.toLocaleString(undefined,{month:"short",day:"numeric",hour:"2-digit",minute:"2-digit"})):"LATEST UPDATE")+'</span></div><span class="top-slide-cta">READ FULL STORY <span aria-hidden="true">↗</span></span></div></a>';
    }).join("");
    dotsRoot.innerHTML=topItems.map((x,i)=>'<button type="button" class="top-slide-dot'+(i===slideIndex?' active':'')+'" data-slide-to="'+i+'" aria-label="Show top story '+(i+1)+'"></button>').join("");
    slideCount.textContent=String(topItems.length).padStart(2,"0")+" FEATURED HEADLINES";
    controls.hidden=topItems.length<2;
    startSlideTimer();
  }
  function showSlide(next){
    if(!topItems.length)return;
    slideIndex=(next+topItems.length)%topItems.length;
    slidesRoot.querySelectorAll(".top-slide").forEach((el,i)=>{el.classList.toggle("active",i===slideIndex);el.hidden=i!==slideIndex});
    dotsRoot.querySelectorAll(".top-slide-dot").forEach((el,i)=>el.classList.toggle("active",i===slideIndex));
  }
  function startSlideTimer(){
    if(slideTimer)clearInterval(slideTimer);
    if(topItems.length>1&&!window.matchMedia("(prefers-reduced-motion: reduce)").matches)slideTimer=setInterval(()=>showSlide(slideIndex+1),6500);
  }
  controls.addEventListener("click",e=>{
    const step=e.target.closest("[data-slide-step]"),dot=e.target.closest("[data-slide-to]");
    if(step){showSlide(slideIndex+Number(step.dataset.slideStep));startSlideTimer()}
    if(dot){showSlide(Number(dot.dataset.slideTo));startSlideTimer()}
  });
  const slider=document.getElementById("top-stories");
  slider.addEventListener("mouseenter",()=>{if(slideTimer)clearInterval(slideTimer)});
  slider.addEventListener("mouseleave",startSlideTimer);

  // Mobile swipe / touch support for the featured-news carousel.
  let touchStartX=0,touchStartY=0,touchMoved=false;
  slider.addEventListener("touchstart",e=>{
    if(!e.touches||e.touches.length!==1)return;
    touchStartX=e.touches[0].clientX;touchStartY=e.touches[0].clientY;touchMoved=false;
    if(slideTimer)clearInterval(slideTimer);
  },{passive:true});
  slider.addEventListener("touchmove",e=>{
    if(!e.touches||e.touches.length!==1)return;
    const dx=e.touches[0].clientX-touchStartX,dy=e.touches[0].clientY-touchStartY;
    if(Math.abs(dx)>12&&Math.abs(dx)>Math.abs(dy)){touchMoved=true;e.preventDefault();}
  },{passive:false});
  slider.addEventListener("touchend",e=>{
    if(!touchMoved||!e.changedTouches||!e.changedTouches.length){startSlideTimer();return}
    const dx=e.changedTouches[0].clientX-touchStartX;
    if(Math.abs(dx)>40)showSlide(slideIndex+(dx<0?1:-1));
    startSlideTimer();
  },{passive:true});
  // Also support pointer swipes on touch-enabled laptops and tablets.
  let pointerStartX=0,pointerStartY=0;
  slider.addEventListener("pointerdown",e=>{if(e.pointerType==="touch"){pointerStartX=e.clientX;pointerStartY=e.clientY;if(slideTimer)clearInterval(slideTimer)}});
  slider.addEventListener("pointerup",e=>{
    if(e.pointerType!=="touch")return;
    const dx=e.clientX-pointerStartX,dy=e.clientY-pointerStartY;
    if(Math.abs(dx)>45&&Math.abs(dx)>Math.abs(dy))showSlide(slideIndex+(dx<0?1:-1));
    startSlideTimer();
  });
  function render(){
    const visible=sorted(active==="All"?items:items.filter(x=>x.category===active));
    if(!visible.length){grid.innerHTML="";status.textContent=items.length?"No stories in this category yet.":"No headlines are available yet. The feed updater may still be running.";return}
    status.textContent=visible.length+" headlines · Sorted by date (newest first) · Last feed update: "+(window.newsUpdatedAt?new Date(window.newsUpdatedAt).toLocaleString():"not available")+".";
    const now=Date.now();let previousDate="",cards=[];
    visible.forEach(x=>{
      const date=dateOf(x),dateKey=date?date.toLocaleDateString(undefined,{year:"numeric",month:"long",day:"numeric"}):"Date unavailable";
      if(dateKey!==previousDate){cards.push('<div class="news-date-heading" style="grid-column:1/-1;margin:18px 0 2px;padding:0 0 9px;border-bottom:1px solid #00f2fe35;color:#00f2fe;font:700 12px \'JetBrains Mono\',monospace;letter-spacing:.05em">'+esc(dateKey)+'</div>');previousDate=dateKey}
      const age=date?now-date.getTime():Infinity,hot=age>=-5*60*1000&&age<=24*60*60*1000;
      cards.push('<a class="story" href="'+safe(x.link)+'" target="_blank" rel="noopener noreferrer"><span class="tag">'+esc(x.category||"News")+'</span><h2>'+(hot?'<span aria-label="Hot or recent news" title="Hot / recent" style="margin-right:6px">🔥</span>':"")+esc(x.title)+'</h2><div class="meta"><span>'+esc(x.source||"Original source")+'</span><span>'+esc(date?date.toLocaleTimeString([],{hour:"2-digit",minute:"2-digit"}):"")+'</span></div></a>');
    });
    grid.innerHTML=cards.join("");
  }
  filters.addEventListener("click",e=>{const button=e.target.closest("button[data-category]");if(!button)return;active=button.dataset.category;filters.querySelectorAll("button").forEach(b=>b.classList.toggle("active",b===button));render()});
  fetch("news-feed.json?updated="+Date.now(),{cache:"no-store"}).then(r=>{if(!r.ok)throw new Error("HTTP "+r.status);return r.json()}).then(data=>{items=Array.isArray(data.items)?data.items:[];window.newsUpdatedAt=data.updatedAt;renderTopStories();render()}).catch(()=>{status.textContent="Could not load the news feed. It will retry on your next visit.";grid.innerHTML="";slidesRoot.innerHTML='<div class="top-stories-empty">Could not load top stories right now. Please check back shortly.</div>'});
  setInterval(()=>location.reload(),10*60*1000);
})();