(() => {
  "use strict";
  const grid=document.getElementById("news-grid"),status=document.getElementById("news-status"),filters=document.getElementById("filters");
  const pagination=document.getElementById("news-pagination");
  const weatherRoot=document.getElementById("weather-disaster"),weatherSlidesRoot=document.getElementById("weather-slides"),weatherControls=document.getElementById("weather-controls"),weatherCount=document.getElementById("weather-count"),weatherPosition=document.getElementById("weather-position");
  const PAGE_SIZE=18;
  const searchInput=document.getElementById("news-search");
  const dateFromInput=document.getElementById("news-date-from"),dateToInput=document.getElementById("news-date-to");
  const slidesRoot=document.getElementById("top-stories-slides"),slideCount=document.getElementById("top-stories-count"),controls=document.getElementById("top-stories-controls"),dotsRoot=document.getElementById("top-stories-dots");
  document.getElementById("year").textContent=new Date().getFullYear();
  let items=[],weatherItems=[],active="All",topItems=[],slideIndex=0,slideTimer=null,currentPage=1,weatherSlideIndex=0,weatherSlideTimer=null;
  const esc=v=>String(v==null?"":v).replace(/[&<>"']/g,c=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c]));
  const safe=v=>{try{const u=new URL(v);return u.protocol==="https:"?u.href:"#"}catch(_){return "#"}};
  const dateOf=x=>{const d=x.publishedAt?new Date(x.publishedAt):null;return d&&!Number.isNaN(d.getTime())?d:null};
  const sorted=arr=>arr.slice().sort((a,b)=>(dateOf(b)?.getTime()||0)-(dateOf(a)?.getTime()||0));
  function renderTopStories(){
    // Slider is exclusively the newest Bangladesh stories with a usable summary or image.
    const bangladeshStories=sorted(items).filter(x=>{
      const hasPreview=String(x.previewSummary||x.summary||x.description||"").trim().length>0||
        safe(x.previewScreenshot||x.previewImage||x.image||x.imageUrl||x.thumbnail||x.thumbnailUrl||x.enclosureUrl||"")!=="#";
      return String(x.category||"").trim().toLowerCase()==="bangladesh"&&
        safe(x.link)!=="#"&&!!dateOf(x)&&!!String(x.previewTitle||x.title||"").trim()&&hasPreview;
    });
    topItems=bangladeshStories;
    if(!topItems.length){slidesRoot.innerHTML='<div class="top-stories-empty">Bangladesh headlines are being collected. Please check back after the next feed refresh.</div>';slideCount.textContent="BANGLADESH NEWS";controls.hidden=true;return}
    slideIndex=Math.min(slideIndex,topItems.length-1);
    slidesRoot.innerHTML=topItems.map((x,i)=>{
      const image=safe(x.previewScreenshot||x.previewImage||x.image||x.imageUrl||x.thumbnail||x.thumbnailUrl||x.enclosureUrl||"");
      const title=x.previewTitle||x.title;
      const summary=x.previewSummary||x.summary||x.description||"Open the original report for the full story, context and latest developments.";
      const publisherUrl=safe(x.publisherUrl||x.link);
      const d=dateOf(x);
      const bg=image!=="#"?'<img class="top-slide-image" src="'+esc(image)+'" alt="" loading="'+(i<2?"eager":"lazy")+'" referrerpolicy="no-referrer" onerror="this.parentElement.classList.add(&quot;no-image&quot;);this.remove()">':'';
      const recent=d&&(Date.now()-d.getTime()<=24*60*60*1000);
      const publisher=String(x.publisherName||x.source||"Original publisher");
      const fallback='<div class="top-slide-fallback" aria-hidden="true"><strong>'+esc(publisher)+'</strong><span>ORIGINAL NEWS SOURCE</span></div>';
      const visualClass=image==="#"?"top-slide-visual no-image":"top-slide-visual";
      return '<article class="top-slide'+(i===slideIndex?' active':'')+'" data-slide-index="'+i+'" data-href="'+publisherUrl+'" tabindex="0" role="link" aria-label="Open news story: '+esc(x.previewTitle||x.title)+'"><div class="'+visualClass+'">'+bg+fallback+'<span class="top-slide-index">'+String(i+1).padStart(2,"0")+' / '+String(topItems.length).padStart(2,"0")+'</span></div><div class="top-slide-copy"><span class="top-slide-kicker">🇧🇩 BANGLADESH · '+(recent?'LATEST':'NEWS')+'</span><h2>'+esc(x.previewTitle||x.title)+'</h2><p class="top-slide-summary">'+esc(summary)+'</p><div class="top-slide-meta"><span>'+esc(publisher)+'</span><span>•</span><span>'+(d?esc(d.toLocaleString(undefined,{month:"short",day:"numeric",hour:"2-digit",minute:"2-digit"})):"LATEST UPDATE")+'</span></div>'+(x.iframeAllowed===true?'<div class="top-slide-actions"><details class="publisher-embed"><summary>Site preview</summary><iframe src="'+publisherUrl+'" title="Publisher page preview" loading="lazy" sandbox="allow-scripts allow-forms" referrerpolicy="no-referrer"></iframe></details></div>':'')+'</div></article>';
    }).join("");
    dotsRoot.innerHTML=topItems.map((x,i)=>'<button type="button" class="top-slide-dot'+(i===slideIndex?' active':'')+'" data-slide-to="'+i+'" aria-label="Show Bangladesh story '+(i+1)+'"></button>').join("");
    slideCount.textContent=String(topItems.length).padStart(2,"0")+" BANGLADESH HEADLINES";
    controls.hidden=topItems.length<2;
    showSlide(slideIndex);
    startSlideTimer();
  }
  function showSlide(next){
    if(!topItems.length)return;
    slideIndex=(next+topItems.length)%topItems.length;
    slidesRoot.querySelectorAll(".top-slide").forEach((el,i)=>{
      let offset=(i-slideIndex+topItems.length)%topItems.length;
      if(offset>topItems.length/2)offset-=topItems.length;
      const distance=Math.abs(offset);
      el.hidden=false;
      const mobile=window.matchMedia("(max-width: 600px)").matches;
      const cardWidth=el.getBoundingClientRect().width||slidesRoot.clientWidth*.32;
      const step=cardWidth*(mobile?.88:.78)+(mobile?0:18);
      const scale=distance===0?1:distance===1?.91:distance===2?.79:.68;
      const opacity=distance===0?1:distance===1?.88:distance===2?.28:0;
      const rotate=offset*(mobile?-11:-16);
      el.classList.toggle("active",distance===0);
      el.classList.toggle("is-prev",offset===-1);
      el.classList.toggle("is-next",offset===1);
      el.classList.toggle("is-far",distance>1);
      el.style.zIndex=String(20-distance);
      el.style.opacity=String(opacity);
      el.style.pointerEvents=distance<=1?"auto":"none";
      el.style.transform="translateX("+(offset*step)+"px) translateZ("+(-distance*(mobile?48:82))+"px) rotateY("+rotate+"deg) scale("+scale+")";
    });
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
  searchInput?.addEventListener("input",()=>{currentPage=1;render()});
  dateFromInput?.addEventListener("change",()=>{currentPage=1;render()});
  dateToInput?.addEventListener("change",()=>{currentPage=1;render()});
  const slider=document.getElementById("top-stories");
  slider.addEventListener("mouseenter",()=>{if(slideTimer)clearInterval(slideTimer)});
  slider.addEventListener("mouseleave",startSlideTimer);

  // Touch swipe plus mouse/pen drag; ordinary clicks still open the selected publisher.
  let pointerStartX=0,pointerStartY=0,pointerActive=false,dragged=false,suppressCardClick=false;
  slider.addEventListener("pointerdown",e=>{
    if(e.pointerType==="mouse"&&e.button!==0)return;
    if(e.target.closest("a,button,summary,iframe,input"))return;
    pointerStartX=e.clientX;pointerStartY=e.clientY;pointerActive=true;dragged=false;
    slider.querySelector("#top-stories-slides")?.classList.add("is-dragging");
    if(slideTimer)clearInterval(slideTimer);
  });
  document.addEventListener("pointermove",e=>{
    if(!pointerActive)return;
    if(Math.abs(e.clientX-pointerStartX)>8)dragged=true;
  },{passive:true});
  document.addEventListener("pointerup",e=>{
    if(!pointerActive)return;pointerActive=false;
    slider.querySelector("#top-stories-slides")?.classList.remove("is-dragging");
    const dx=e.clientX-pointerStartX,dy=e.clientY-pointerStartY;
    if(Math.abs(dx)>42&&Math.abs(dx)>Math.abs(dy)*1.15){
      showSlide(slideIndex+(dx<0?1:-1));
      suppressCardClick=true;
      setTimeout(()=>{suppressCardClick=false;dragged=false},0);
    } else {
      dragged=false;
    }
    startSlideTimer();
  });
  slider.addEventListener("pointercancel",()=>{pointerActive=false;slider.querySelector("#top-stories-slides")?.classList.remove("is-dragging");startSlideTimer()});
  slidesRoot.addEventListener("click",e=>{
    const card=e.target.closest(".top-slide");
    if(!card)return;
    if(suppressCardClick||dragged){e.preventDefault();e.stopPropagation();dragged=false;return}
    if(e.target.closest("a,button,summary,iframe,details"))return;
    const url=safe(card.dataset.href);
    if(url!=="#")window.open(url,"_blank","noopener,noreferrer");
  });
  slidesRoot.addEventListener("keydown",e=>{
    const card=e.target.closest(".top-slide");
    if(!card||e.target!==card||(e.key!=="Enter"&&e.key!==" "))return;
    e.preventDefault();
    const url=safe(card.dataset.href);
    if(url!=="#")window.open(url,"_blank","noopener,noreferrer");
  });
  slider.addEventListener("keydown",e=>{
    if(e.key==="ArrowLeft"){e.preventDefault();showSlide(slideIndex-1);startSlideTimer()}
    if(e.key==="ArrowRight"){e.preventDefault();showSlide(slideIndex+1);startSlideTimer()}
  });
  document.querySelectorAll("[data-hero-category]").forEach(link=>link.addEventListener("click",()=>{
    const category=link.dataset.heroCategory;
    active=category;currentPage=1;
    filters.querySelectorAll("button").forEach(b=>b.classList.toggle("active",b.dataset.category===category));
    render();
  }));
  function render(){
    const query=(searchInput?.value||"").trim().toLocaleLowerCase();
    const from=dateFromInput?.value?new Date(dateFromInput.value+"T00:00:00").getTime():-Infinity;
    const to=dateToInput?.value?new Date(dateToInput.value+"T23:59:59.999").getTime():Infinity;
    const dateFilterActive=!!(dateFromInput?.value||dateToInput?.value);
    const visible=sorted(items.filter(x=>{
      const date=dateOf(x),stamp=date?date.getTime():NaN;
      const inDateRange=Number.isFinite(stamp)&&stamp>=from&&stamp<=to;
      return (active==="All"||x.category===active)&&(!dateFilterActive||inDateRange)&&
        (!query||[x.title,x.source,x.summary,x.description,x.previewTitle,x.previewSummary].some(v=>String(v||"").toLocaleLowerCase().includes(query)));
    }));
    const totalPages=Math.max(1,Math.ceil(visible.length/PAGE_SIZE));
    currentPage=Math.max(1,Math.min(currentPage,totalPages));
    if(!visible.length){grid.innerHTML="";pagination.innerHTML="";status.textContent=items.length?"No stories match this category or search.":"No headlines are available yet. The feed updater may still be running.";return}
    const start=(currentPage-1)*PAGE_SIZE;
    const pageItems=visible.slice(start,start+PAGE_SIZE);
    const end=start+pageItems.length;
    status.textContent="Showing "+(start+1)+"–"+end+" of "+visible.length+" headlines"+(active!=="All"?" · "+active:"")+" · Page "+currentPage+" of "+totalPages+" · Newest first · Feed updated "+(window.newsUpdatedAt?new Date(window.newsUpdatedAt).toLocaleString():"not available")+".";
    pagination.innerHTML=totalPages>1?'<button type="button" class="page-button page-arrow" data-page="'+Math.max(1,currentPage-1)+'" aria-label="Previous page" '+(currentPage===1?'disabled':'')+'>‹</button>'+Array.from({length:totalPages},(_,i)=>{const page=i+1;return '<button type="button" class="page-button'+(page===currentPage?' active':'')+'" data-page="'+page+'" '+(page===currentPage?'aria-current="page"':'')+'>'+page+'</button>'}).join("")+'<button type="button" class="page-button page-arrow" data-page="'+Math.min(totalPages,currentPage+1)+'" aria-label="Next page" '+(currentPage===totalPages?'disabled':'')+'>›</button>':"";
    const now=Date.now();
    grid.innerHTML=pageItems.map((x,i)=>{
      const date=dateOf(x),age=date?now-date.getTime():Infinity,recent=age>=-5*60*1000&&age<=24*60*60*1000;
      const image=safe(x.previewImage||x.image||x.imageUrl||x.thumbnail||x.thumbnailUrl||x.enclosureUrl||"");
      const imageMarkup=image!=="#"?'<div class="story-image"><img src="'+esc(image)+'" alt="" loading="'+(i<6?"eager":"lazy")+'" referrerpolicy="no-referrer" onerror="this.parentElement.classList.add(&quot;no-image&quot;);this.remove()"></div>':'<div class="story-image no-image" aria-hidden="true"><span>NEWS</span></div>';
      const summary=String(x.previewSummary||x.summary||x.description||"").trim();
      return '<a class="story" href="'+safe(x.publisherUrl||x.link)+'" target="_blank" rel="noopener noreferrer">'+imageMarkup+'<div class="story-body"><div class="story-tags"><span class="tag">'+esc(x.category||"News")+'</span>'+(recent?'<span class="story-breaking">LATEST</span>':"")+'</div><h2>'+esc(x.previewTitle||x.title)+'</h2>'+(summary?'<p class="story-summary">'+esc(summary)+'</p>':"")+'<div class="meta"><span>'+esc(x.source||"Original source")+'</span><span>'+esc(date?date.toLocaleString(undefined,{month:"short",day:"numeric",hour:"2-digit",minute:"2-digit"}):"")+'</span></div></div></a>';
    }).join("");
  }
  function updateFilterCounts(){
    filters.querySelectorAll("button[data-category]").forEach(button=>{
      const category=button.dataset.category;
      const count=category==="All"?items.length:items.filter(x=>x.category===category).length;
      const label=button.dataset.label||button.textContent.replace(/\s+\(\d+\)$/,"");
      button.dataset.label=label;
      button.textContent=label+" ("+count+")";
    });
  }
  filters.addEventListener("click",e=>{const button=e.target.closest("button[data-category]");if(!button)return;active=button.dataset.category;currentPage=1;filters.querySelectorAll("button").forEach(b=>b.classList.toggle("active",b===button));render()});
  document.getElementById("news-date-clear")?.addEventListener("click",()=>{if(dateFromInput)dateFromInput.value="";if(dateToInput)dateToInput.value="";currentPage=1;render()});
  pagination.addEventListener("click",e=>{const button=e.target.closest("button[data-page]");if(!button||button.disabled)return;currentPage=Number(button.dataset.page)||1;render();document.getElementById("latest-feed")?.scrollIntoView({behavior:window.matchMedia("(prefers-reduced-motion: reduce)").matches?"auto":"smooth",block:"start"})});
  function renderWeatherStories(){
    const recent=sorted(weatherItems.filter(x=>isRecentWeatherStory(x)));
    const stories=recent.slice(0,8);
    if(!stories.length){weatherRoot.hidden=true;if(weatherSlideTimer)clearInterval(weatherSlideTimer);weatherSlideTimer=null;return}
    weatherRoot.hidden=false;weatherSlideIndex=Math.min(weatherSlideIndex,stories.length-1);
    weatherCount.textContent=stories.length+" RECENT STORIES";
    weatherSlidesRoot.innerHTML=stories.map((x,i)=>{
      const url=safe(x.publisherUrl||x.link),d=dateOf(x),publisher=x.publisherName||x.source||"Original publisher";
      const image=safe(x.previewScreenshot||x.previewImage||x.image||x.imageUrl||x.thumbnail||x.thumbnailUrl||x.enclosureUrl||"");
      const imageMarkup=image!=="#"?'<div class="weather-slide-visual"><img class="weather-slide-image" src="'+esc(image)+'" alt="" loading="'+(i<2?"eager":"lazy")+'" referrerpolicy="no-referrer" onerror="this.parentElement.classList.add(\'no-image\');this.remove()"><span class="weather-image-shade"></span><span class="weather-image-index">'+String(i+1).padStart(2,"0")+' / '+String(stories.length).padStart(2,"0")+'</span></div>':'<div class="weather-slide-visual no-image"><span class="weather-image-fallback">WEATHER / DISASTER WATCH</span><span class="weather-image-index">'+String(i+1).padStart(2,"0")+' / '+String(stories.length).padStart(2,"0")+'</span></div>';
      return '<article class="weather-slide" data-weather-index="'+i+'">'+imageMarkup+'<div class="weather-slide-copy"><span class="weather-kicker">WEATHER / NATURAL DISASTER</span><h3><a href="'+url+'" target="_blank" rel="noopener noreferrer">'+esc(x.previewTitle||x.title)+'</a></h3>'+(x.previewSummary||x.summary||x.description?'<p>'+esc(x.previewSummary||x.summary||x.description)+'</p>':'')+'<div class="weather-meta"><span>'+esc(publisher)+'</span><span>'+(d?esc(d.toLocaleString(undefined,{month:"short",day:"numeric",hour:"2-digit",minute:"2-digit"})):"Date unavailable")+'</span></div></div></article>';
    }).join("");
    syncWeatherDeck(weatherSlideIndex);
    weatherControls.hidden=stories.length<2;
    weatherPosition.textContent=(weatherSlideIndex+1)+" / "+stories.length;
    if(weatherSlideTimer)clearInterval(weatherSlideTimer);
    weatherSlideTimer=stories.length>1&&!window.matchMedia("(prefers-reduced-motion: reduce)").matches?setInterval(()=>showWeatherSlide(weatherSlideIndex+1,stories.length),7000):null;
  }
  function isRecentWeatherStory(x){
    const d=dateOf(x),age=d?Date.now()-d.getTime():Infinity;
    return !!d&&age>=-5*60*1000&&age<=7*24*60*60*1000&&/(weather|forecast|flood|cyclone|hurricane|typhoon|storm|heavy rain|rainfall|heatwave|heat wave|earthquake|landslide|wildfire|drought|tsunami|tornado|natural disaster|monsoon|ঘূর্ণিঝড়|ঘূর্ণিঝড়|বন্যা|ভূমিকম্প|আবহাওয়া|আবহাওয়া|দুর্যোগ|বৃষ্টি|জলোচ্ছ্বাস|পাহাড়ধস|পাহাড়ধস)/i.test([x.title,x.summary,x.previewTitle,x.previewSummary].join(" "));
  }
  let weatherTransitionTimer=null;
  function syncWeatherDeck(activeIndex){
    const cards=Array.from(weatherSlidesRoot.querySelectorAll(".weather-slide")),total=cards.length;
    cards.forEach((card,i)=>{
      let offset=(i-activeIndex+total)%total;
      if(offset>total/2)offset-=total;
      const distance=Math.abs(offset);
      card.hidden=false;
      card.classList.remove("deck-active","deck-prev","deck-next","deck-far-prev","deck-far-next","deck-back");
      if(offset===0)card.classList.add("deck-active");
      else if(offset===-1)card.classList.add("deck-prev");
      else if(offset===1)card.classList.add("deck-next");
      else if(offset===-2)card.classList.add("deck-far-prev");
      else if(offset===2)card.classList.add("deck-far-next");
      else card.classList.add("deck-back");
      card.setAttribute("aria-hidden",offset===0?"false":"true");
      card.style.zIndex=String(total-distance);
    });
  }
  function showWeatherSlide(next,total){
    const cards=Array.from(weatherSlidesRoot.querySelectorAll(".weather-slide"));if(!cards.length||!total)return;
    const target=(next+total)%total;
    if(target===weatherSlideIndex)return;
    if(weatherTransitionTimer)clearTimeout(weatherTransitionTimer);
    weatherSlideIndex=target;
    syncWeatherDeck(weatherSlideIndex);
    weatherPosition.textContent=(weatherSlideIndex+1)+" / "+total;
  }
  let weatherTouchStart=null;
  weatherSlidesRoot.addEventListener("touchstart",e=>{
    const touch=e.changedTouches&&e.changedTouches[0];if(!touch)return;
    weatherTouchStart={x:touch.clientX,y:touch.clientY};
  },{passive:true});
  weatherSlidesRoot.addEventListener("touchend",e=>{
    if(!weatherTouchStart)return;
    const touch=e.changedTouches&&e.changedTouches[0],start=weatherTouchStart;weatherTouchStart=null;
    if(!touch)return;
    const dx=touch.clientX-start.x,dy=touch.clientY-start.y;
    if(Math.abs(dy)<35||Math.abs(dy)<Math.abs(dx)*1.2)return;
    const total=weatherSlidesRoot.querySelectorAll(".weather-slide").length;if(total<2)return;
    showWeatherSlide(weatherSlideIndex+(dy<0?1:-1),total);
    if(weatherSlideTimer)clearInterval(weatherSlideTimer);
    weatherSlideTimer=!window.matchMedia("(prefers-reduced-motion: reduce)").matches?setInterval(()=>showWeatherSlide(weatherSlideIndex+1,total),7000):null;
  },{passive:true});
  weatherControls.addEventListener("click",e=>{const button=e.target.closest("[data-weather-step]");if(!button)return;const total=weatherSlidesRoot.querySelectorAll(".weather-slide").length;showWeatherSlide(weatherSlideIndex+Number(button.dataset.weatherStep),total);if(weatherSlideTimer)clearInterval(weatherSlideTimer);weatherSlideTimer=total>1&&!window.matchMedia("(prefers-reduced-motion: reduce)").matches?setInterval(()=>showWeatherSlide(weatherSlideIndex+1,total),7000):null});
  fetch("news-feed.json?updated="+Date.now(),{cache:"no-store"}).then(r=>{if(!r.ok)throw new Error("HTTP "+r.status);return r.json()}).then(data=>{items=Array.isArray(data.items)?data.items.map(item=>({...item,category:String(item.category||"").toLowerCase()==="ai"?"Technology":item.category})):[];weatherItems=Array.isArray(data.weatherItems)?data.weatherItems:[];window.newsUpdatedAt=data.updatedAt;updateFilterCounts();renderTopStories();renderWeatherStories();render()}).catch(()=>{status.textContent="Could not load the news feed. It will retry on your next visit.";grid.innerHTML="";slidesRoot.innerHTML='<div class="top-stories-empty">Could not load top stories right now. Please check back shortly.</div>'});
  setInterval(()=>location.reload(),10*60*1000);
})();