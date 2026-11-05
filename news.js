import { isLatestTagItem, isSliderEligibleItem, getImagePreviewUrl } from "./news-slider-rules.mjs";
import { buildLocationContext, rankNewsByLocation } from "./news-location.mjs?v=2";
(() => {
  "use strict";
  const grid=document.getElementById("news-grid"),status=document.getElementById("news-status"),filters=document.getElementById("filters");
  const pagination=document.getElementById("news-pagination");
  const weatherRoot=document.getElementById("weather-disaster"),weatherSlidesRoot=document.getElementById("weather-slides"),weatherControls=document.getElementById("weather-controls"),weatherCount=document.getElementById("weather-count"),weatherPosition=document.getElementById("weather-position");
  const PAGE_SIZE=18;
  const subcategoryFilters=document.getElementById("subcategories");
  const searchInput=document.getElementById("news-search");
  const dateFromInput=document.getElementById("news-date-from"),dateToInput=document.getElementById("news-date-to");
  const archiveTools=document.getElementById("archive-tools"),viewSwitch=document.getElementById("news-view-switch");
  const slidesRoot=document.getElementById("top-stories-slides"),slideCount=document.getElementById("top-stories-count"),controls=document.getElementById("top-stories-controls"),dotsRoot=document.getElementById("top-stories-dots");
  document.getElementById("year").textContent=new Date().getFullYear();
  const editionDate=document.getElementById("news-edition-date");
  if(editionDate)editionDate.textContent=new Intl.DateTimeFormat("en-GB",{timeZone:"Asia/Dhaka",weekday:"long",day:"2-digit",month:"long",year:"numeric"}).format(new Date()).toUpperCase();
  const DEFAULT_SUBCATEGORY="Other / Unclassified";
  const FALLBACK_TAXONOMY={
    Bangladesh:["Politics & Government","Economy & Business","Crime & Law","Society & Education","Health & Environment"],
    World:["International Politics","War & Conflict","Global Economy","Diplomacy & Relations","Climate & Disaster"],
    Technology:["Artificial Intelligence","Science & Space","Gadgets & Devices","Software & Apps","Cybersecurity"]
  };
  let categoryTaxonomy=FALLBACK_TAXONOMY;
  const categoryTaxonomyReady=(async()=>{
    try{
      const response=await fetch("./news-categories.json",{cache:"force-cache"});
      if(!response.ok)throw new Error("Category taxonomy request failed (HTTP "+response.status+").");
      const data=await response.json();
      if(!data||!data.categories||!["Bangladesh","World","Technology"].every(key=>Array.isArray(data.categories[key])&&data.categories[key].length===5))throw new Error("Category taxonomy is incomplete.");
      categoryTaxonomy=data.categories;
    }catch(error){console.warn("Using built-in news category taxonomy:",error?.message||error)}
  })();
  let items=[],weatherItems=[],active="All",activeSubcategory="All",viewMode="feed",topItems=[],slideIndex=0,slideTimer=null,currentPage=1,weatherSlideIndex=0,weatherSlideTimer=null,ageBoundaryTimer=null,locationContext=null;
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
  const ageMinutes=x=>{const d=dateOf(x);return d?(Date.now()-d.getTime())/60000:Infinity};
  const isLatestBatch=x=>isLatestTagItem(x);
  const isSliderEligibleAge=x=>isSliderEligibleItem(x);
  const sorted=arr=>arr.slice().sort((a,b)=>(dateOf(b)?.getTime()||0)-(dateOf(a)?.getTime()||0));
  const sortedNews=arr=>arr.slice().sort((a,b)=>Number(isLatestBatch(b))-Number(isLatestBatch(a))||(dateOf(b)?.getTime()||0)-(dateOf(a)?.getTime()||0));
  const ageOf=x=>{const d=dateOf(x);return d?Date.now()-d.getTime():Infinity};
  const isWithinLast24Hours=x=>{const age=ageOf(x);return age>=-5*60*1000&&age<24*60*60*1000};
  const previewUrl=x=>safe(getImagePreviewUrl(x));
  const getSubcategory=item=>String(item?.subCategory||DEFAULT_SUBCATEGORY);
  function scheduleAgeBoundaryRefresh(){
    if(ageBoundaryTimer)clearTimeout(ageBoundaryTimer);
    const now=Date.now();
    let nextBoundary=Infinity;
    for(const item of items){
      const date=dateOf(item);
      if(!date)continue;
      const published=date.getTime();
      const latestBoundary=published+15*60*1000+1;
      if(latestBoundary>now)nextBoundary=Math.min(nextBoundary,latestBoundary);
      if(item.category==="Bangladesh"&&previewUrl(item)!=="#"){
        const sliderBoundary=published+60*60*1000+1;
        if(sliderBoundary>now)nextBoundary=Math.min(nextBoundary,sliderBoundary);
      }
    }
    if(Number.isFinite(nextBoundary)){
      ageBoundaryTimer=setTimeout(()=>{
        render();
        renderTopStories();
      },Math.max(0,nextBoundary-Date.now()));
    }
  }
  function imageLoads(url){
    return new Promise(resolve=>{
      if(!url||url==="#"){resolve(false);return}
      const image=new Image();
      let settled=false;
      const finish=ok=>{if(settled)return;settled=true;clearTimeout(timer);resolve(ok)};
      const timer=setTimeout(()=>finish(false),8000);
      image.referrerPolicy="no-referrer";
      image.onload=()=>finish(image.naturalWidth>0&&image.naturalHeight>0);
      image.onerror=()=>finish(false);
      image.src=url;
    });
  }
  async function renderTopStories(){
    scheduleAgeBoundaryRefresh();
    // Final slider rules: Bangladesh only, age <=60m, verified preview image required.
    const candidates=sortedNews(items).filter(x=>
      isSliderEligibleAge(x)&&x.category==="Bangladesh"&&
      safe(x.link)!=="#"&&!!String(x.previewTitle||x.title||"").trim()&&previewUrl(x)!=="#"
    );
    const checks=await Promise.all(candidates.map(async x=>{
      const image=previewUrl(x);
      const imageOk=image!=="#"&&await imageLoads(image);
      return {item:x,ok:imageOk};
    }));
    topItems=checks.filter(x=>x.ok).map(x=>x.item);
    if(!topItems.length){slidesRoot.innerHTML='<div class="top-stories-empty">No Bangladesh stories published within the last 60 minutes have a usable image preview.</div>';slideCount.textContent="MEDIA-READY STORIES";controls.hidden=true;if(slideTimer)clearInterval(slideTimer);slideTimer=null;return}
    slideIndex=Math.min(slideIndex,topItems.length-1);
    slidesRoot.innerHTML=topItems.map((x,i)=>{
      const image=previewUrl(x),title=x.previewTitle||x.title;
      const summary=x.previewSummary||x.summary||x.description||"Open the original report for the full story, context and latest developments.";
      const publisherUrl=safe(x.publisherUrl||x.link),d=dateOf(x),publisher=String(x.publisherName||x.source||"Original publisher");
      const bg='<img class="top-slide-image" src="'+esc(image)+'" alt="" loading="'+(i<2?"eager":"lazy")+'" referrerpolicy="no-referrer">';
      return '<article class="top-slide'+(i===slideIndex?' active':'')+'" data-slide-index="'+i+'" data-href="'+publisherUrl+'" tabindex="0" role="link" aria-label="Open news story: '+esc(title)+'"><div class="top-slide-visual">'+bg+'<span class="top-slide-index">'+String(i+1).padStart(2,"0")+' / '+String(topItems.length).padStart(2,"0")+'</span></div><div class="top-slide-copy"><span class="top-slide-kicker">'+(isLatestBatch(x)?"LATEST · ":"")+'MEDIA PREVIEW</span><h2>'+esc(title)+'</h2><p class="top-slide-summary">'+esc(summary)+'</p><div class="top-slide-meta"><span>'+esc(publisher)+'</span><span>•</span><span>'+esc(d?d.toLocaleString(undefined,{month:"short",day:"numeric",hour:"2-digit",minute:"2-digit"}):"Date unavailable")+'</span></div>'+(x.iframeAllowed===true?'<div class="top-slide-actions"><details class="publisher-embed"><summary>Site preview</summary><iframe src="'+publisherUrl+'" title="Publisher page preview" loading="lazy" sandbox="allow-scripts allow-forms" referrerpolicy="no-referrer"></iframe></details></div>':'')+'</div></article>';
    }).join("");
    dotsRoot.innerHTML=topItems.map((x,i)=>'<button type="button" class="top-slide-dot'+(i===slideIndex?' active':'')+'" data-slide-to="'+i+'" aria-label="Show latest story '+(i+1)+'"></button>').join("");
    slideCount.textContent=String(topItems.length).padStart(2,"0")+" BANGLADESH MEDIA STORIES";
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
    if(topItems.length>1)slideTimer=setInterval(()=>showSlide(slideIndex+1),6500);
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
  // Auto-play intentionally continues while the pointer is over the slider.

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
    active=category;activeSubcategory="All";currentPage=1;
    filters.querySelectorAll("button").forEach(b=>b.classList.toggle("active",b.dataset.category===category));
    updateFilterCounts();render();
  }));
  function localPublishedMeta(date){
    if(!date)return '<span class="newspaper-meta-unavailable">Publication time unavailable</span>';
    const localDate=new Intl.DateTimeFormat(undefined,{day:"2-digit",month:"short",year:"numeric"}).format(date);
    const localTime=new Intl.DateTimeFormat(undefined,{hour:"2-digit",minute:"2-digit"}).format(date);
    return '<span class="newspaper-date">'+esc(localDate)+'</span><span class="newspaper-meta-separator">·</span><span class="newspaper-time">'+esc(localTime)+'</span><span class="newspaper-local-label">LOCAL TIME</span>';
  }
  function renderNewspaperStory(x,{lead=false,index=0}={}){
    const date=dateOf(x),recent=viewMode==="feed"&&isLatestBatch(x);
    const image=previewUrl(x),hasImage=image!=="#";
    const title=x.previewTitle||x.title||"Untitled news story";
    const summary=String(x.previewSummary||x.summary||x.description||"").trim();
    const source=String(x.publisherName||x.source||"").trim();
    const imageMarkup=hasImage?'<figure class="newspaper-image"><img src="'+esc(image)+'" alt="" loading="'+(index<3?"eager":"lazy")+'" referrerpolicy="no-referrer"></figure>':"";
    return '<a class="newspaper-story'+(lead?' newspaper-lead':'')+(hasImage?' has-image':' no-image')+'" href="'+safe(x.publisherUrl||x.link)+'" target="_blank" rel="noopener noreferrer">'+
      '<div class="newspaper-story-copy"><div class="newspaper-story-tags"><span class="newspaper-category">'+esc(x.category||"News")+'</span><span class="newspaper-subcategory">'+esc(getSubcategory(x))+'</span>'+(recent?'<span class="story-breaking">LATEST</span>':"")+(lead?'<span class="newspaper-lead-label">LEAD STORY</span>':"")+'</div>'+
      '<h3>'+esc(title)+'</h3>'+(summary?'<p class="newspaper-summary">'+esc(summary)+'</p>':"")+
      '<div class="newspaper-metadata"><div class="newspaper-date-time">'+localPublishedMeta(date)+'</div>'+(source?'<div class="newspaper-source"><span class="newspaper-source-label">SOURCE</span><strong>'+esc(source)+'</strong></div>':"")+'</div></div>'+imageMarkup+'</a>';
  }
  function renderNewspaperFeed(pageItems){
    const lead=pageItems[0];
    const remaining=pageItems.slice(1);
    const grouped=new Map();
    remaining.forEach(item=>{
      const category=activeSubcategory!=="All"?getSubcategory(item):(String(item.category||"Other").trim()||"Other");
      if(!grouped.has(category))grouped.set(category,[]);
      grouped.get(category).push(item);
    });
    const preferred=["Bangladesh","World","Technology"];
    const order=viewMode==="feed"&&active==="All"
      ?[...preferred.filter(category=>grouped.has(category)),...Array.from(grouped.keys()).filter(category=>!preferred.includes(category))]
      :Array.from(grouped.keys());
    const requestedColumns=window.matchMedia("(max-width: 1100px)").matches?2:3;
    const columnCount=remaining.length<3?Math.max(1,remaining.length):Math.min(requestedColumns,remaining.length);
    grid.classList.remove("mobile-news-feed");
    grid.classList.add("newspaper-feed");
    grid.innerHTML=renderNewspaperStory(lead,{lead:true,index:0})+
      (remaining.length?'<div class="newspaper-columns columns-'+columnCount+'">'+
        Array.from({length:columnCount},(_,i)=>'<div class="newspaper-column" data-column="'+(i+1)+'"></div>').join("")+
      '</div>':"");
    const columns=Array.from(grid.querySelectorAll(".newspaper-column"));
    if(!columns.length)return;
    const categorySections=columns.map(()=>new Map());
    const measure=document.createElement("div");
    measure.className="newspaper-column newspaper-measure-column";
    measure.setAttribute("aria-hidden","true");
    measure.style.cssText="position:absolute;left:-10000px;top:0;visibility:hidden;pointer-events:none;margin:0!important;";
    const columnWidth=columns[0].getBoundingClientRect().width;
    measure.style.width=columnWidth+"px";
    grid.appendChild(measure);
    let storyIndex=1;
    order.forEach(category=>{
      (grouped.get(category)||[]).forEach(item=>{
        measure.innerHTML='<section class="newspaper-section"><h3 class="newspaper-section-title">'+esc(category)+'</h3>'+
          renderNewspaperStory(item,{index:storyIndex})+'</section>';
        const measuredSection=measure.firstElementChild;
        const storyHeight=measuredSection.querySelector(".newspaper-story").getBoundingClientRect().height;
        const headingHeight=measuredSection.querySelector(".newspaper-section-title").getBoundingClientRect().height;
        let laneIndex=0;
        let shortest=Infinity;
        columns.forEach((column,index)=>{
          const hasCategory=categorySections[index].has(category);
          const currentHeight=column.getBoundingClientRect().height;
          const candidateHeight=currentHeight+(hasCategory?storyHeight:headingHeight+storyHeight+28);
          if(candidateHeight<shortest){shortest=candidateHeight;laneIndex=index;}
        });
        let section=categorySections[laneIndex].get(category);
        if(!section){
          section=document.createElement("section");
          section.className="newspaper-section";
          section.setAttribute("aria-label",category+" news");
          const heading=document.createElement("h3");
          heading.className="newspaper-section-title";
          heading.textContent=category;
          section.appendChild(heading);
          columns[laneIndex].appendChild(section);
          categorySections[laneIndex].set(category,section);
        }
        const storyHolder=document.createElement("div");
        storyHolder.innerHTML=renderNewspaperStory(item,{index:storyIndex});
        const story=storyHolder.firstElementChild;
        section.appendChild(story);
        storyIndex++;
      });
    });
    measure.remove();
    grid.querySelectorAll(".newspaper-image img").forEach(img=>img.addEventListener("error",()=>{
      const story=img.closest(".newspaper-story");
      story?.classList.remove("has-image");
      story?.classList.add("no-image");
      img.closest(".newspaper-image")?.remove();
    },{once:true}));
  }
  function renderMobileNewsFeed(pageItems){
    const mobileDate=value=>{
      const date=dateOf(value);
      return date?new Intl.DateTimeFormat("en-GB",{timeZone:"Asia/Dhaka",day:"2-digit",month:"short",hour:"2-digit",minute:"2-digit",hour12:true}).format(date):"Date unavailable";
    };
    const mobileTags=item=>'<div class="mobile-story-tags"><span class="mobile-category">'+esc(item.category||"News")+'</span><span class="mobile-subcategory">'+esc(getSubcategory(item))+'</span>'+(isLatestBatch(item)?'<span class="story-breaking">LATEST</span>':"")+'</div>';
    const mobileMeta=item=>'<div class="mobile-story-meta"><span>'+esc(item.publisherName||item.source||"Original publisher")+'</span><time>'+esc(mobileDate(item))+'</time></div>';
    const lead=pageItems[0];
    const leadImage=previewUrl(lead);
    const leadVisual=leadImage!=="#"
      ?'<div class="mobile-lead-image"><img src="'+esc(leadImage)+'" alt="" loading="eager" referrerpolicy="no-referrer"></div>'
      :"";
    const leadSummary=String(lead.previewSummary||lead.summary||lead.description||"").trim();
    const leadMarkup='<a class="mobile-lead-story'+(leadImage==="#"?' text-only':'')+'" href="'+safe(lead.publisherUrl||lead.link)+'" target="_blank" rel="noopener noreferrer">'+leadVisual+'<div class="mobile-lead-copy">'+mobileTags(lead)+'<h3>'+esc(lead.previewTitle||lead.title||"Untitled news story")+'</h3>'+(leadSummary?'<p class="mobile-story-summary">'+esc(leadSummary)+'</p>':"")+mobileMeta(lead)+'</div></a>';
    const listMarkup=pageItems.slice(1).map(item=>{
      const image=previewUrl(item);
      const visual=image!=="#"
        ?'<div class="mobile-list-image"><img src="'+esc(image)+'" alt="" loading="lazy" referrerpolicy="no-referrer"></div>'
        :"";
      const summary=String(item.previewSummary||item.summary||item.description||"").trim();
      return '<a class="mobile-list-story'+(image==="#"?' text-only':'')+'" href="'+safe(item.publisherUrl||item.link)+'" target="_blank" rel="noopener noreferrer">'+visual+'<div class="mobile-list-copy">'+mobileTags(item)+'<h3>'+esc(item.previewTitle||item.title||"Untitled news story")+'</h3>'+(summary?'<p class="mobile-story-summary">'+esc(summary)+'</p>':"")+mobileMeta(item)+'</div></a>';
    }).join("");
    grid.classList.remove("newspaper-feed");
    grid.classList.add("mobile-news-feed");
    grid.innerHTML=leadMarkup+'<div class="mobile-story-list">'+listMarkup+'</div>';
    grid.querySelectorAll(".mobile-lead-image img").forEach(img=>img.addEventListener("error",()=>{
      const story=img.closest(".mobile-lead-story");
      story?.classList.add("text-only");
      img.closest(".mobile-lead-image")?.remove();
    },{once:true}));
    grid.querySelectorAll(".mobile-list-image img").forEach(img=>img.addEventListener("error",()=>{
      const story=img.closest(".mobile-list-story");
      story?.classList.add("text-only");
      img.closest(".mobile-list-image")?.remove();
    },{once:true}));
  }
  function renderLegacyNews(pageItems){
    let previousArchiveDate="";
    grid.innerHTML=pageItems.map((x,i)=>{
      const date=dateOf(x),recent=viewMode==="feed"&&isLatestBatch(x);
      const archiveDate=date?bdDateKey(date):"";
      const archiveHeading=viewMode==="archive"&&archiveDate&&archiveDate!==previousArchiveDate?'<div class="archive-date-heading">'+new Date(archiveDate+"T00:00:00+06:00").toLocaleDateString("en-GB",{timeZone:"Asia/Dhaka",weekday:"long",day:"numeric",month:"long",year:"numeric"})+'</div>':"";
      if(archiveDate)previousArchiveDate=archiveDate;
      const image=safe(x.previewImage||x.image||x.imageUrl||x.thumbnail||x.thumbnailUrl||x.enclosureUrl||"");
      const imageMarkup=image!=="#"?'<div class="story-image"><img src="'+esc(image)+'" alt="" loading="'+(i<6?"eager":"lazy")+'" referrerpolicy="no-referrer" onerror="this.parentElement.classList.add(&quot;no-image&quot;);this.remove()"></div>':'<div class="story-image no-image" aria-hidden="true"><span>NEWS</span></div>';
      const summary=String(x.previewSummary||x.summary||x.description||"").trim();
      return archiveHeading+'<a class="story" href="'+safe(x.publisherUrl||x.link)+'" target="_blank" rel="noopener noreferrer">'+imageMarkup+'<div class="story-body"><div class="story-tags"><span class="tag">'+esc(x.category||"News")+'</span><span class="story-subcategory">'+esc(getSubcategory(x))+'</span>'+(recent?'<span class="story-breaking">LATEST</span>':"")+'</div><h2>'+esc(x.previewTitle||x.title)+'</h2>'+(summary?'<p class="story-summary">'+esc(summary)+'</p>':"")+'<div class="meta"><span>'+esc(x.source||"Original source")+'</span><span>'+esc(date?date.toLocaleString(undefined,{month:"short",day:"numeric",hour:"2-digit",minute:"2-digit"}):"")+'</span></div></div></a>';
    }).join("");
  }
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
      const age=d?Date.now()-d.getTime():Infinity;
      if(age< -5*60*1000)return false;
      if(viewMode==="feed")return age<24*60*60*1000;
      return age>=24*60*60*1000;
    });
    let visible=(viewMode==="feed"?sortedNews(scoped):sorted(scoped)).filter(x=>{
      const date=dateOf(x),key=date?bdDateKey(date):"";
      const inDateRange=!!key&&(!dateFromInput?.value||key>=dateFromInput.value)&&(!dateToInput?.value||key<=dateToInput.value);
      return (active==="All"||x.category===active)&&
        (activeSubcategory==="All"||getSubcategory(x)===activeSubcategory)&&
        (!dateFilterActive||inDateRange)&&
        (!query||[x.title,x.source,x.summary,x.description,x.previewTitle,x.previewSummary,getSubcategory(x)].some(v=>String(v||"").toLocaleLowerCase().includes(query)));
    });
    if(viewMode==="feed"&&locationContext)visible=rankNewsByLocation(visible,locationContext);
    const totalPages=Math.max(1,Math.ceil(visible.length/PAGE_SIZE));
    currentPage=Math.max(1,Math.min(currentPage,totalPages));
    if(!visible.length){grid.innerHTML="";pagination.innerHTML="";status.textContent=items.length?(viewMode==="feed"?"No stories from the last 24 hours match this category or search.":"No archived stories match this category, search or date range."):"No headlines are available yet. The feed updater may still be running.";return}
    const start=(currentPage-1)*PAGE_SIZE;
    const pageItems=visible.slice(start,start+PAGE_SIZE);
    const end=start+pageItems.length;
    status.textContent="Showing "+(start+1)+"–"+end+" of "+visible.length+" "+(viewMode==="feed"?"last 24 hours of news":"archived headlines (up to 90 days)")+(active!=="All"?" · "+active:"")+(activeSubcategory!=="All"?" · "+activeSubcategory:"")+" · Page "+currentPage+" of "+totalPages+" · Newest first · Feed updated "+(window.newsUpdatedAt?new Date(window.newsUpdatedAt).toLocaleString():"not available")+".";
    pagination.innerHTML=totalPages>1?'<button type="button" class="page-button page-arrow" data-page="'+Math.max(1,currentPage-1)+'" aria-label="Previous page" '+(currentPage===1?'disabled':'')+'>‹</button>'+Array.from({length:totalPages},(_,i)=>{const page=i+1;return '<button type="button" class="page-button'+(page===currentPage?' active':'')+'" data-page="'+page+'" '+(page===currentPage?'aria-current="page"':'')+'>'+page+'</button>'}).join("")+'<button type="button" class="page-button page-arrow" data-page="'+Math.min(totalPages,currentPage+1)+'" aria-label="Next page" '+(currentPage===totalPages?'disabled':'')+'>›</button>':"";
    if(viewMode==="feed"){
      if(window.matchMedia("(max-width: 600px)").matches)renderMobileNewsFeed(pageItems);
      else renderNewspaperFeed(pageItems);
    }else{
      grid.classList.remove("newspaper-feed","mobile-news-feed");
      renderLegacyNews(pageItems);
    }
  }
  const newspaperViewport=window.matchMedia("(max-width: 600px)");
  const newspaperColumnsViewport=window.matchMedia("(max-width: 1100px)");
  newspaperViewport.addEventListener("change",()=>{if(viewMode==="feed")render()});
  newspaperColumnsViewport.addEventListener("change",()=>{if(viewMode==="feed"&&!newspaperViewport.matches)render()});
  function renderSubcategoryFilters(scoped){
    if(!subcategoryFilters)return;
    if(active==="All"){
      activeSubcategory="All";subcategoryFilters.hidden=true;subcategoryFilters.innerHTML="";return;
    }
    const categoryItems=scoped.filter(item=>item.category===active);
    const options=[{value:"All",label:"All topics",count:categoryItems.length}];
    for(const label of categoryTaxonomy[active]||[]){
      options.push({value:label,label,count:categoryItems.filter(item=>getSubcategory(item)===label).length});
    }
    const fallbackCount=categoryItems.filter(item=>getSubcategory(item)===DEFAULT_SUBCATEGORY).length;
    if(fallbackCount)options.push({value:DEFAULT_SUBCATEGORY,label:DEFAULT_SUBCATEGORY,count:fallbackCount});
    if(!options.some(option=>option.value===activeSubcategory))activeSubcategory="All";
    subcategoryFilters.hidden=false;
    subcategoryFilters.innerHTML=options.map(option=>'<button type="button" class="subcategory-filter'+(option.value===activeSubcategory?' active':'')+'" data-subcategory="'+esc(option.value)+'" aria-pressed="'+(option.value===activeSubcategory?'true':'false')+'"><span>'+esc(option.label)+'</span><small>'+option.count+'</small></button>').join("");
  }
  function updateFilterCounts(){
    const todayBD=bdDateKey(Date.now());
    const oldestDate=new Date(todayBD+"T00:00:00Z");
    oldestDate.setUTCDate(oldestDate.getUTCDate()-89);
    const oldestBD=oldestDate.toISOString().slice(0,10);
    const scoped=items.filter(x=>{
      const d=dateOf(x),key=d?bdDateKey(d):"";
      if(!key||key>todayBD||key<oldestBD)return false;
      const age=d?Date.now()-d.getTime():Infinity;
      if(age< -5*60*1000)return false;
      return viewMode==="feed"?age<24*60*60*1000:age>=24*60*60*1000;
    });
    filters.querySelectorAll("button[data-category]").forEach(button=>{
      const category=button.dataset.category;
      const count=category==="All"?scoped.length:scoped.filter(x=>x.category===category).length;
      const label=button.dataset.label||button.textContent.replace(/\s+\(\d+\)$/,"");
      button.dataset.label=label;
      button.textContent=label+" ("+count+")";
    });
    renderSubcategoryFilters(scoped);
  }
  viewSwitch?.addEventListener("click",e=>{const button=e.target.closest("button[data-news-view]");if(!button)return;viewMode=button.dataset.newsView;currentPage=1;updateFilterCounts();viewSwitch.querySelectorAll("button").forEach(b=>b.classList.toggle("active",b===button));if(archiveTools)archiveTools.hidden=viewMode!=="archive";const heading=document.querySelector("#latest-feed .kicker");if(heading)heading.textContent=viewMode==="feed"?"NEWS FEED":"ARCHIVE NEWS";const title=document.querySelector("#latest-feed h2");if(title)title.innerHTML=viewMode==="feed"?'News <span class="accent">feed</span>':'Archive <span class="accent">news</span>';render()});
  filters.addEventListener("click",e=>{const button=e.target.closest("button[data-category]");if(!button)return;active=button.dataset.category;activeSubcategory="All";currentPage=1;filters.querySelectorAll("button").forEach(b=>b.classList.toggle("active",b===button));updateFilterCounts();render()});
  subcategoryFilters?.addEventListener("click",e=>{const button=e.target.closest("button[data-subcategory]");if(!button)return;activeSubcategory=button.dataset.subcategory;currentPage=1;updateFilterCounts();render()});
  document.getElementById("news-date-clear")?.addEventListener("click",()=>{if(dateFromInput)dateFromInput.value="";if(dateToInput)dateToInput.value="";currentPage=1;render()});
  pagination.addEventListener("click",e=>{const button=e.target.closest("button[data-page]");if(!button||button.disabled)return;currentPage=Number(button.dataset.page)||1;render();document.getElementById("latest-feed")?.scrollIntoView({behavior:window.matchMedia("(prefers-reduced-motion: reduce)").matches?"auto":"smooth",block:"start"})});
  function videoLoads(url){
    return new Promise(resolve=>{
      if(!url||url==="#"){resolve(false);return}
      const video=document.createElement("video");
      let settled=false;
      const finish=ok=>{if(settled)return;settled=true;clearTimeout(timer);video.removeAttribute("src");video.load();resolve(ok)};
      const timer=setTimeout(()=>finish(false),8000);
      video.preload="metadata";video.muted=true;video.playsInline=true;
      video.onloadedmetadata=()=>finish(video.videoWidth>0&&video.videoHeight>0);
      video.onerror=()=>finish(false);
      video.src=url;video.load();
    });
  }
  async function renderWeatherStories(){
    const recent=sorted(weatherItems.filter(x=>isRecentWeatherStory(x)));
    const checked=await Promise.all(recent.map(async x=>{
      const image=safe(x.previewImage||x.image||x.previewScreenshot||x.imageUrl||x.thumbnail||x.thumbnailUrl||"");
      const video=safe(x.videoUrl||x.video||x.enclosureUrl||"");
      if(image!=="#"&&await imageLoads(image))return {item:x,mediaType:"image",mediaUrl:image};
      if(video!=="#"&&await videoLoads(video))return {item:x,mediaType:"video",mediaUrl:video};
      return null;
    }));
    const stories=checked.filter(Boolean).slice(0,8);
    if(!stories.length){weatherRoot.hidden=true;if(weatherSlideTimer)clearInterval(weatherSlideTimer);weatherSlideTimer=null;return}
    weatherRoot.hidden=false;weatherSlideIndex=Math.min(weatherSlideIndex,stories.length-1);
    weatherCount.textContent=stories.length+" MEDIA-READY STORIES";
    weatherSlidesRoot.innerHTML=stories.map((entry,i)=>{
      const x=entry.item,url=safe(x.publisherUrl||x.link),d=dateOf(x),publisher=x.publisherName||x.source||"Original publisher";
      const mediaMarkup=entry.mediaType==="image"
        ?'<img class="weather-slide-image" src="'+esc(entry.mediaUrl)+'" alt="" loading="'+(i<2?"eager":"lazy")+'" referrerpolicy="no-referrer">'
        :'<video class="weather-slide-image weather-slide-video" src="'+esc(entry.mediaUrl)+'" controls muted playsinline preload="metadata"></video>';
      const visual='<div class="weather-slide-visual">'+mediaMarkup+'<span class="weather-image-shade"></span><span class="weather-image-index">'+String(i+1).padStart(2,"0")+' / '+String(stories.length).padStart(2,"0")+'</span></div>';
      return '<article class="weather-slide" data-weather-index="'+i+'">'+visual+'<div class="weather-slide-copy"><span class="weather-kicker">WEATHER / NATURAL DISASTER</span><h3><a href="'+url+'" target="_blank" rel="noopener noreferrer">'+esc(x.previewTitle||x.title)+'</a></h3>'+(x.previewSummary||x.summary||x.description?'<p>'+esc(x.previewSummary||x.summary||x.description)+'</p>':'')+'<div class="weather-meta"><span>'+esc(publisher)+'</span><span>'+(d?esc(d.toLocaleString(undefined,{month:"short",day:"numeric",hour:"2-digit",minute:"2-digit"})):"Date unavailable")+'</span></div></div></article>';
    }).join("");
    weatherSlidesRoot.querySelectorAll("video.weather-slide-video").forEach(video=>{
      video.addEventListener("play",()=>{if(weatherSlideTimer)clearInterval(weatherSlideTimer);weatherSlideTimer=null});
      video.addEventListener("pause",()=>{
        const total=weatherSlidesRoot.querySelectorAll(".weather-slide").length;
        if(total>1&&!window.matchMedia("(prefers-reduced-motion: reduce)").matches){
          if(weatherSlideTimer)clearInterval(weatherSlideTimer);
          weatherSlideTimer=setInterval(()=>showWeatherSlide(weatherSlideIndex+1,total),7000);
        }
      });
    });
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
  let feedRetryTimer=null,feedLoading=false;
  async function loadNewsFeed(){
    if(feedLoading)return;
    feedLoading=true;
    await categoryTaxonomyReady;
    if(status)status.textContent="Loading headlines…";
    try{
      const feedUrl=new URL("./news-feed.json",document.baseURI);
      const response=await fetch(feedUrl.href,{cache:"no-cache"});
      if(!response.ok)throw new Error("Feed request failed (HTTP "+response.status+").");
      const data=await response.json();
      if(!data||!Array.isArray(data.items))throw new Error("Feed JSON is valid but has no items array.");
      items=data.items.map(item=>({...item,category:String(item.category||"").toLowerCase()==="ai"?"Technology":item.category,subCategory:item.subCategory||DEFAULT_SUBCATEGORY}));
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
    }finally{
      feedLoading=false;
    }
  }

  const LOCATION_API="https://portfolio-contact-telegram.mdshihab74.workers.dev";
  const LOCATION_HISTORY_KEY="k74_location_history_consent_v1";
  const LOCATION_PROMPT_KEY="k74_location_prompt_dismissed_v1";
  const locationTrigger=document.getElementById("news-location-trigger");
  const locationSettingsTrigger=document.getElementById("news-location-settings-trigger");
  const locationStatus=document.getElementById("news-location-status");
  const locationCard=document.getElementById("news-location-card");
  const locationHistoryCard=document.getElementById("news-location-history-card");
  const locationSettingsCard=document.getElementById("news-location-settings-card");
  const locationAllow=document.getElementById("news-location-allow");
  const locationLater=document.getElementById("news-location-later");
  const historyAllow=document.getElementById("news-history-allow");
  const historySkip=document.getElementById("news-history-skip");
  const historyEnable=document.getElementById("news-history-enable");
  const historyStop=document.getElementById("news-history-stop");
  const historyDelete=document.getElementById("news-history-delete");
  const settingsClose=document.getElementById("news-location-settings-close");
  const settingsText=document.getElementById("news-location-settings-text");
  let historyConsent=(()=>{try{return localStorage.getItem(LOCATION_HISTORY_KEY)}catch{return null}})();
  let lastPosition=null;
  const localGet=key=>{try{return localStorage.getItem(key)}catch{return null}};
  const localSet=(key,value)=>{try{localStorage.setItem(key,value)}catch{}};
  const visitorIdentity=()=>{
    const visitorId=window.__K74_VISITOR_ID__||localGet("k74_visitor_id_v1"),sessionId=window.__K74_SESSION_ID__||localGet("k74_session_v1");
    return /^VIS-[A-F0-9]{12}$/.test(visitorId||"")&&/^SES-[A-F0-9]{12}$/.test(sessionId||"")?{visitorId,sessionId}:null;
  };
  const waitForVisitorIdentity=async()=>{
    if(!visitorIdentity()){
      await new Promise(resolve=>{
        const done=()=>{window.removeEventListener("k74:visitor-tracked",done);resolve()};
        window.addEventListener("k74:visitor-tracked",done,{once:true});
        setTimeout(done,2500);
      });
    }
    const identity=visitorIdentity();
    if(!identity)return null;
    if(window.__K74_TRACKING_READY__){
      const response=await window.__K74_TRACKING_READY__;
      if(!response?.ok)return null;
    }
    return identity;
  };
  const locationPost=async(path,payload)=>{
    const response=await fetch(LOCATION_API+path,{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify(payload),credentials:"omit",cache:"no-store"});
    const result=await response.json().catch(()=>({}));
    if(!response.ok||result.ok===false)throw new Error(result.error||("HTTP "+response.status));
    return result;
  };
  const closeLocationCards=()=>{
    if(locationCard)locationCard.hidden=true;
    if(locationHistoryCard)locationHistoryCard.hidden=true;
    if(locationSettingsCard)locationSettingsCard.hidden=true;
  };
  const showLocationPrompt=()=>{closeLocationCards();if(locationCard)locationCard.hidden=false;};
  const showHistoryPrompt=()=>{closeLocationCards();if(locationHistoryCard)locationHistoryCard.hidden=false;};
  const showLocationSettings=()=>{
    closeLocationCards();
    if(settingsText)settingsText.textContent=historyConsent==="yes"
      ?"GPS History is ON. New records are added only when you press Location Access. Records are kept for up to 90 days and are visible to authorized Telegram admins."
      :"GPS History is OFF. Your location can still prioritize nearby news for this page session; no GPS history is stored unless you separately enable it.";
    if(locationSettingsCard)locationSettingsCard.hidden=false;
    if(historyEnable)historyEnable.hidden=historyConsent==="yes";
    if(historyStop)historyStop.hidden=historyConsent!=="yes";
  };
  const setLocationStatus=message=>{if(locationStatus)locationStatus.textContent=message};
  const getIpLocation=async()=>{
    try{
      const response=await fetch(LOCATION_API+"/location-context",{cache:"no-store",credentials:"omit"});
      if(!response.ok)return {};
      const data=await response.json();
      let countryName="";
      try{if(data.country)countryName=new Intl.DisplayNames([navigator.language||"en"],{type:"region"}).of(data.country)||""}catch{}
      return {city:data.city||"",region:data.region||"",country:data.country||"",countryName};
    }catch{return {}}
  };
  const saveGpsHistory=async position=>{
    const identity=await waitForVisitorIdentity();
    if(!identity)throw new Error("Visitor session is not ready; reload the News Page and try again.");
    const coords=position.coords,payload={...identity,latitude:coords.latitude,longitude:coords.longitude,accuracyMeters:coords.accuracy,source:"browser-geolocation"};
    let lastError;
    for(let attempt=0;attempt<4;attempt++){
      try{return await locationPost("/location-history",payload)}
      catch(error){
        lastError=error;
        if(!String(error.message||error).includes("profile is not ready")||attempt===3)throw error;
        await new Promise(resolve=>setTimeout(resolve,350));
      }
    }
    throw lastError;
  };
  const requestLocation=()=>{
    if(!navigator.geolocation){
      setLocationStatus("This browser does not support location access. The default News Feed is unchanged.");
      closeLocationCards();localSet(LOCATION_PROMPT_KEY,"1");return;
    }
    if(locationAllow)locationAllow.disabled=true;
    setLocationStatus("Requesting location permission…");
    navigator.geolocation.getCurrentPosition(async position=>{
      if(locationAllow)locationAllow.disabled=false;
      lastPosition=position;
      const coords=position.coords;
      const ip=await getIpLocation();
      locationContext=buildLocationContext({latitude:coords.latitude,longitude:coords.longitude,accuracyMeters:coords.accuracy,...ip});
      currentPage=1;render();
      localSet(LOCATION_PROMPT_KEY,"1");
      if(locationTrigger)locationTrigger.textContent="📍 Refresh Nearby News";
      const area=locationContext.district?"Approx. "+locationContext.district.name+" District":(locationContext.city||locationContext.region||"your area");
      setLocationStatus("Nearby news priority active · "+area+". Location is held in this page session.");
      closeLocationCards();
      if(historyConsent==="yes"){
        try{await saveGpsHistory(position);setLocationStatus("Nearby news priority active · "+area+". GPS history saved for up to 90 days.");}
        catch(error){
          const message=String(error.message||error);
          if(message.includes("Separate GPS History consent")){
            historyConsent=null;try{localStorage.removeItem(LOCATION_HISTORY_KEY)}catch{}
            showHistoryPrompt();setLocationStatus("GPS History consent has expired. Please review the separate consent again.");
          }else setLocationStatus("Nearby news is active; GPS history was not saved: "+message);
        }
      }else if(historyConsent!=="no"){
        showHistoryPrompt();
      }
    },error=>{
      if(locationAllow)locationAllow.disabled=false;
      locationContext=null;render();closeLocationCards();localSet(LOCATION_PROMPT_KEY,"1");
      const message=error?.code===1?"Location permission was denied. The default News Feed remains unchanged; allow location in browser settings to try again.":error?.code===3?"Location request timed out. The default News Feed remains unchanged.":"Location is unavailable. The default News Feed remains unchanged.";
      setLocationStatus(message);
    },{enableHighAccuracy:true,timeout:15000,maximumAge:0});
  };
  const acceptHistoryConsent=async()=>{
    const identity=await waitForVisitorIdentity();
    if(!identity){setLocationStatus("Visitor session is not ready. Reload the page and try again.");return}
    if(historyAllow)historyAllow.disabled=true;
    try{
      await locationPost("/location-consent",{...identity,consent:true,policyVersion:"2026-11-05"});
      historyConsent="yes";localSet(LOCATION_HISTORY_KEY,"yes");closeLocationCards();
      if(lastPosition){try{await saveGpsHistory(lastPosition);setLocationStatus("Nearby news is active and this GPS location was added to your 90-day history.");}catch(error){setLocationStatus("History consent saved, but this location was not recorded: "+String(error.message||error));}}
      showLocationSettings();
    }catch(error){setLocationStatus("GPS History consent could not be saved; no GPS history was stored. "+String(error.message||error));}
    finally{if(historyAllow)historyAllow.disabled=false}
  };
  const declineHistoryConsent=async()=>{
    const identity=await waitForVisitorIdentity();
    historyConsent="no";localSet(LOCATION_HISTORY_KEY,"no");closeLocationCards();
    if(identity){try{await locationPost("/location-consent",{...identity,consent:false,policyVersion:"2026-11-05"});}catch{}}
    setLocationStatus("Nearby news is active. GPS History is OFF; no GPS history is stored.");
  };
  const stopHistorySaving=async()=>{
    const identity=await waitForVisitorIdentity();
    if(!identity){setLocationStatus("Visitor session is not ready; reload and try again.");return}
    try{
      await locationPost("/location-consent",{...identity,consent:false,policyVersion:"2026-11-05"});
      historyConsent="no";localSet(LOCATION_HISTORY_KEY,"no");showLocationSettings();
      setLocationStatus("GPS History saving is OFF. Existing records remain until expiry or an approved deletion request.");
    }catch(error){setLocationStatus("Could not update the history preference: "+String(error.message||error));}
  };
  const requestHistoryDeletion=async()=>{
    const identity=await waitForVisitorIdentity();
    if(!identity){setLocationStatus("Visitor session is not ready; reload and try again.");return}
    if(historyDelete)historyDelete.disabled=true;
    try{
      const result=await locationPost("/location-delete-request",identity);
      setLocationStatus(result.adminNotified
        ?"Your GPS History deletion request was recorded and the authorized Telegram admin was notified."
        :"Your GPS History deletion request was recorded, but automatic admin notification is unavailable. Please also use the Contact page.");
    }catch(error){setLocationStatus("Could not send the deletion request: "+String(error.message||error));}
    finally{if(historyDelete)historyDelete.disabled=false}
  };
  if(locationTrigger)locationTrigger.addEventListener("click",showLocationPrompt);
  if(locationSettingsTrigger)locationSettingsTrigger.addEventListener("click",showLocationSettings);
  if(locationAllow)locationAllow.addEventListener("click",requestLocation);
  if(locationLater)locationLater.addEventListener("click",()=>{closeLocationCards();localSet(LOCATION_PROMPT_KEY,"1");setLocationStatus("Location access skipped. The default News Feed remains unchanged.");});
  if(historyAllow)historyAllow.addEventListener("click",acceptHistoryConsent);
  if(historySkip)historySkip.addEventListener("click",declineHistoryConsent);
  if(historyEnable)historyEnable.addEventListener("click",showHistoryPrompt);
  if(historyStop)historyStop.addEventListener("click",stopHistorySaving);
  if(historyDelete)historyDelete.addEventListener("click",requestHistoryDeletion);
  if(settingsClose)settingsClose.addEventListener("click",closeLocationCards);
  if(localGet(LOCATION_PROMPT_KEY)!=="1")showLocationPrompt();

  loadNewsFeed();
  setInterval(loadNewsFeed,15*60*1000);
})();