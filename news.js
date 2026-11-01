(() => {
  "use strict";
  const grid=document.getElementById("news-grid"),status=document.getElementById("news-status"),filters=document.getElementById("filters");
  const pagination=document.getElementById("news-pagination");
  const weatherRoot=document.getElementById("weather-disaster"),weatherSlidesRoot=document.getElementById("weather-slides"),weatherControls=document.getElementById("weather-controls"),weatherCount=document.getElementById("weather-count"),weatherPosition=document.getElementById("weather-position");
  const PAGE_SIZE=18;
  const searchInput=document.getElementById("news-search");
  const dateFromInput=document.getElementById("news-date-from"),dateToInput=document.getElementById("news-date-to");
  const archiveTools=document.getElementById("archive-tools"),viewSwitch=document.getElementById("news-view-switch");
  const slidesRoot=document.getElementById("top-stories-slides"),slideCount=document.getElementById("top-stories-count"),controls=document.getElementById("top-stories-controls"),dotsRoot=document.getElementById("top-stories-dots");
  document.getElementById("year").textContent=new Date().getFullYear();
  let items=[],weatherItems=[],active="All",viewMode="feed",topItems=[],slideIndex=0,slideTimer=null,currentPage=1,weatherSlideIndex=0,weatherSlideTimer=null;
  const esc=v=>String(v==null?"":v).replace(/[&<>"']/g,c=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c]));
  const safe=v=>{try{const u=new URL(v);return u.protocol==="https:"?u.href:"#"}catch(_){return "#"}};
  const dateOf=x=>{const d=x.publishedAt?new Date(x.publishedAt):null;return d&&!Number.isNaN(d.getTime())?d:null};
  const bdDateKey=value=>{
    const d=value instanceof Date?value:new Date(value);
    if(Number.isNaN(d.getTime()))return "";
    const parts=new Intl.DateTimeFormat("en-CA",{timeZone:"Asia/Dhaka",year:"numeric",month:"2-digit",day:"2-digit"}).formatToParts(d);
    const part=k=>parts.find(x=>x.type===k)?.value||"";
    return part("year")+"-"+part("month")+"-"+part("day");
  };
  const isLatestBatch=x=>!!window.newsLatestBatchAt&&String(x.latestBatchAt||"")===String(window.newsLatestBatchAt);
  const sorted=arr=>arr.slice().sort((a,b)=>(dateOf(b)?.getTime()||0)-(dateOf(a)?.getTime()||0));
  const PREVIEW_FIELDS=["previewScreenshot","previewImage","image","imageUrl","thumbnail","thumbnailUrl","enclosureUrl"];
  const previewUrl=x=>safe(PREVIEW_FIELDS.map(k=>x[k]).find(Boolean)||"");
  function imageLoads(url){
    return new Promise(resolve=>{
      if(!url||url==="#"){resolve(false);return}
      const image=new Image();
      image.referrerPolicy="no-referrer";
      image.onload=()=>resolve(image.naturalWidth>0&&image.naturalHeight>0);
      image.onerror=()=>resolve(false);
      image.src=url;
    });
  }
  async function renderTopStories(){
    // Only stories discovered in the current refresh batch, with working preview images, enter this slider.
    const todayBD=bdDateKey(Date.now());
    const candidates=sorted(items).filter(x=>
      isLatestBatch(x)&&bdDateKey(dateOf(x))===todayBD&&safe(x.link)!=="#"&&!!String(x.previewTitle||x.title||"").trim()&&previewUrl(x)!=="#"
    );
    const checks=await Promise.all(candidates.map(async x=>({item:x,ok:await imageLoads(previewUrl(x))})));
    topItems=checks.filter(x=>x.ok).map(x=>x.item);
    if(!topItems.length){slidesRoot.innerHTML='<div class="top-stories-empty">No stories in the latest refresh batch have a working preview image yet. Please check after the next feed refresh.</div>';slideCount.textContent="LATEST IMAGE PREVIEWS";controls.hidden=true;if(slideTimer)clearInterval(slideTimer);return}
    slideIndex=Math.min(slideIndex,topItems.length-1);
    slidesRoot.innerHTML=topItems.map((x,i)=>{
      const image=previewUrl(x),title=x.previewTitle||x.title;
      const summary=x.previewSummary||x.summary||x.description||"Open the original report for the full story, context and latest developments.";
      const publisherUrl=safe(x.publisherUrl||x.link),d=dateOf(x),publisher=String(x.publisherName||x.source||"Original publisher");
      const bg='<img class="top-slide-image" src="'+esc(image)+'" alt="" loading="'+(i<2?"eager":"lazy")+'" referrerpolicy="no-referrer">';
      return '<article class="top-slide'+(i===slideIndex?' active':'')+'" data-slide-index="'+i+'" data-href="'+publisherUrl+'" tabindex="0" role="link" aria-label="Open news story: '+esc(title)+'"><div class="top-slide-visual">'+bg+'<span class="top-slide-index">'+String(i+1).padStart(2,"0")+' / '+String(topItems.length).padStart(2,"0")+'</span></div><div class="top-slide-copy"><span class="top-slide-kicker">LATEST · IMAGE PREVIEW</span><h2>'+esc(title)+'</h2><p class="top-slide-summary">'+esc(summary)+'</p><div class="top-slide-meta"><span>'+esc(publisher)+'</span><span>•</span><span>'+esc(d.toLocaleString(undefined,{month:"short",day:"numeric",hour:"2-digit",minute:"2-digit"}))+'</span></div>'+(x.iframeAllowed===true?'<div class="top-slide-actions"><details class="publisher-embed"><summary>Site preview</summary><iframe src="'+publisherUrl+'" title="Publisher page preview" loading="lazy" sandbox="allow-scripts allow-forms" referrerpolicy="no-referrer"></iframe></details></div>':'')+'</div></article>';
    }).join("");
    dotsRoot.innerHTML=topItems.map((x,i)=>'<button type="button" class="top-slide-dot'+(i===slideIndex?' active':'')+'" data-slide-to="'+i+'" aria-label="Show latest story '+(i+1)+'"></button>').join("");
    slideCount.textContent=String(topItems.length).padStart(2,"0")+" LATEST IMAGE STORIES";
    controls.hidden=topItems.length<2;showSlide(slideIndex);startSlideTimer();
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
    const dateFilterActive=viewMode==="archive"&&!!(dateFromInput?.value||dateToInput?.value);
    const todayBD=bdDateKey(Date.now());
    const oldestDate=new Date(todayBD+"T00:00:00Z");
    oldestDate.setUTCDate(oldestDate.getUTCDate()-89);
    const oldestBD=oldestDate.toISOString().slice(0,10);
    const scoped=items.filter(x=>{
      const d=dateOf(x),key=d?bdDateKey(d):"";
      if(!key||key>todayBD||key<oldestBD)return false;
      if(viewMode==="feed")return key===todayBD;
      return key<todayBD;
    });
    const visible=sorted(scoped.filter(x=>{
      const date=dateOf(x),key=date?bdDateKey(date):"";
      const inDateRange=!!key&&(!dateFromInput?.value||key>=dateFromInput.value)&&(!dateToInput?.value||key<=dateToInput.value);
      return (active==="All"||x.category===active)&&(!dateFilterActive||inDateRange)&&
        (!query||[x.title,x.source,x.summary,x.description,x.previewTitle,x.previewSummary].some(v=>String(v||"").toLocaleLowerCase().includes(query)));
    }));
    const totalPages=Math.max(1,Math.ceil(visible.length/PAGE_SIZE));
    currentPage=Math.max(1,Math.min(currentPage,totalPages));
    if(!visible.length){grid.innerHTML="";pagination.innerHTML="";status.textContent=items.length?(viewMode==="feed"?"No stories from today match this category or search.":"No archived stories match this category, search or date range."):"No headlines are available yet. The feed updater may still be running.";return}
    const start=(currentPage-1)*PAGE_SIZE;
    const pageItems=visible.slice(start,start+PAGE_SIZE);
    const end=start+pageItems.length;
    status.textContent="Showing "+(start+1)+"–"+end+" of "+visible.length+" "+(viewMode==="feed"?"today’s news":"archived headlines (up to 90 days)")+(active!=="All"?" · "+active:"")+" · Page "+currentPage+" of "+totalPages+" · Newest first · Feed updated "+(window.newsUpdatedAt?new Date(window.newsUpdatedAt).toLocaleString():"not available")+".";
    pagination.innerHTML=totalPages>1?'<button type="button" class="page-button page-arrow" data-page="'+Math.max(1,currentPage-1)+'" aria-label="Previous page" '+(currentPage===1?'disabled':'')+'>‹</button>'+Array.from({length:totalPages},(_,i)=>{const page=i+1;return '<button type="button" class="page-button'+(page===currentPage?' active':'')+'" data-page="'+page+'" '+(page===currentPage?'aria-current="page"':'')+'>'+page+'</button>'}).join("")+'<button type="button" class="page-button page-arrow" data-page="'+Math.min(totalPages,currentPage+1)+'" aria-label="Next page" '+(currentPage===totalPages?'disabled':'')+'>›</button>':"";
    const renderNow=Date.now();
    let previousArchiveDate="";
    grid.innerHTML=pageItems.map((x,i)=>{
      const date=dateOf(x),recent=isLatestBatch(x);
      const archiveDate=date?bdDateKey(date):"";
      const archiveHeading=viewMode==="archive"&&archiveDate&&archiveDate!==previousArchiveDate?'<div class="archive-date-heading">'+new Date(archiveDate+"T00:00:00+06:00").toLocaleDateString("en-GB",{timeZone:"Asia/Dhaka",weekday:"long",day:"numeric",month:"long",year:"numeric"})+'</div>':"";
      if(archiveDate)previousArchiveDate=archiveDate;
      const image=safe(x.previewImage||x.image||x.imageUrl||x.thumbnail||x.thumbnailUrl||x.enclosureUrl||"");
      const imageMarkup=image!=="#"?'<div class="story-image"><img src="'+esc(image)+'" alt="" loading="'+(i<6?"eager":"lazy")+'" referrerpolicy="no-referrer" onerror="this.parentElement.classList.add(&quot;no-image&quot;);this.remove()"></div>':'<div class="story-image no-image" aria-hidden="true"><span>NEWS</span></div>';
      const summary=String(x.previewSummary||x.summary||x.description||"").trim();
      return archiveHeading+'<a class="story" href="'+safe(x.publisherUrl||x.link)+'" target="_blank" rel="noopener noreferrer">'+imageMarkup+'<div class="story-body"><div class="story-tags"><span class="tag">'+esc(x.category||"News")+'</span>'+(recent?'<span class="story-breaking">LATEST</span>':"")+'</div><h2>'+esc(x.previewTitle||x.title)+'</h2>'+(summary?'<p class="story-summary">'+esc(summary)+'</p>':"")+'<div class="meta"><span>'+esc(x.source||"Original source")+'</span><span>'+esc(date?date.toLocaleString(undefined,{month:"short",day:"numeric",hour:"2-digit",minute:"2-digit"}):"")+'</span></div></div></a>';
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
  viewSwitch?.addEventListener("click",e=>{const button=e.target.closest("button[data-news-view]");if(!button)return;viewMode=button.dataset.newsView;currentPage=1;viewSwitch.querySelectorAll("button").forEach(b=>b.classList.toggle("active",b===button));if(archiveTools)archiveTools.hidden=viewMode!=="archive";const heading=document.querySelector("#latest-feed .kicker");if(heading)heading.textContent=viewMode==="feed"?"NEWS FEED":"ARCHIVE NEWS";const title=document.querySelector("#latest-feed h2");if(title)title.innerHTML=viewMode==="feed"?'News <span class="accent">feed</span>':'Archive <span class="accent">news</span>';render()});
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
  window.addEventListener("error",event=>{if(status&&status.textContent==="Loading headlines…"){status.textContent="News page script error: "+String(event.message||"unknown JavaScript error")+"."; }});
  window.addEventListener("unhandledrejection",event=>{if(status&&status.textContent==="Loading headlines…"){status.textContent="News page error: "+String(event.reason?.message||event.reason||"unknown error")+"."; }});
  let feedRetryTimer=null;
  async function loadNewsFeed(){
    if(status)status.textContent="Loading headlines…";
    try{
      const feedUrl=new URL("./news-feed.json",document.baseURI);
      feedUrl.searchParams.set("updated",String(Date.now()));
      const response=await fetch(feedUrl.href,{cache:"no-store"});
      if(!response.ok)throw new Error("Feed request failed (HTTP "+response.status+").");
      const data=await response.json();
      if(!data||!Array.isArray(data.items))throw new Error("Feed JSON is valid but has no items array.");
      items=data.items.map(item=>({...item,category:String(item.category||"").toLowerCase()==="ai"?"Technology":item.category}));
      weatherItems=Array.isArray(data.weatherItems)?data.weatherItems:[];
      window.newsUpdatedAt=data.updatedAt||null;
      window.newsLatestBatchAt=data.latestBatchAt||data.updatedAt||null;
      updateFilterCounts();renderTopStories();renderWeatherStories();render();
      if(feedRetryTimer){clearTimeout(feedRetryTimer);feedRetryTimer=null}
    }catch(error){
      if(grid)grid.innerHTML="";
      if(pagination)pagination.innerHTML="";
      if(status)status.textContent="Could not load news: "+String(error?.message||error)+". Retrying in 30 seconds.";
      if(slidesRoot)slidesRoot.innerHTML='<div class="top-stories-empty">News feed temporarily unavailable. Retrying automatically.</div>';
      if(feedRetryTimer)clearTimeout(feedRetryTimer);
      feedRetryTimer=setTimeout(loadNewsFeed,30000);
    }
  }
  loadNewsFeed();
  setInterval(()=>location.reload(),10*60*1000);
})();