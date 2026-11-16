(() => {
"use strict";
const $ = id => document.getElementById(id);
const esc = v => String(v == null ? "" : v).replace(/[&<>"']/g, c => ({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c]));
const safeUrl = v => { try { const u = new URL(v, location.href); return ["https:","http:","mailto:","tel:"].includes(u.protocol) ? u.href : "#"; } catch (_) { return "#"; } };
const fallback = {
 name:"SHIHABUL ISLAM", badge:"WEB DEVELOPER · UI/UX DESIGNER · AI ENTHUSIAST",
 title1:"Building useful", title2:"digital experiences.",
 bio:"I build websites, personal AI assistants and automation tools—turning curious ideas into useful digital experiences.",
 about:"I’m Shihab—a developer and digital creator who enjoys connecting technology, creativity, and practical problem-solving.",
 image:"storage/pictures/1790523232314.jpg", imagePos:50,
 socials:[{name:"WhatsApp",icon:"💬",url:"https://wa.me/8801620107233"},{name:"GitHub",icon:"⌘",url:"https://github.com/Kokushibu74"},{name:"YouTube",icon:"▶",url:"https://www.youtube.com/@Lo-Fi_World-x3w"},{name:"Email",icon:"✉",url:"mailto:mdshihab74@gmail.com"}],
 skills:[{icon:"✳",title:"Web & UI/UX Design",desc:"Responsive websites, thoughtful layouts, polished interactions, and mobile-first interfaces."},{icon:"⌘",title:"AI Assistants & Automation",desc:"Personal AI assistants, model integrations, and practical workflow automation."},{icon:"▣",title:"Android & Developer Tools",desc:"Termux utilities, command-line tools, lightweight dashboards, and developer workflows."}],
 projects:[{tag:"AI ASSISTANT",name:"MEMO — WhatsApp AI",desc:"A personal WhatsApp AI assistant exploring model integrations, messaging, and automation.",link:"https://github.com/Kokushibu74/MEMO"},{tag:"ANDROID / CLI",name:"Termux Tool OS",desc:"A dashboard for developer utilities, terminal workflows, and project management on Android.",link:"https://github.com/Kokushibu74"},{tag:"CREATIVE TOOLS",name:"Media Studio",desc:"A creative project for digital media workflows and content experiences.",link:"https://github.com/Kokushibu74/media-studio"},{tag:"VIDEO WORKFLOW",name:"Lo-Fi World Automation",desc:"Creative automation around lo-fi music and YouTube publishing workflows.",link:"https://github.com/Kokushibu74/lo-fi-world-automation"}]
};
function heroGalleryForData(data){
 const clamp=(value,min,max)=>Math.min(max,Math.max(min,Number.isFinite(Number(value))?Number(value):min));
 const raw=data.heroGallery&&Array.isArray(data.heroGallery.images)?data.heroGallery:{};
 let images=(raw.images||[]).filter(item=>item&&typeof item.src==="string"&&item.src.trim()).map((item,index)=>({
  id:String(item.id||("image-"+(index+1))),src:String(item.src),
  focusX:clamp(item.focusX??50,0,100),focusY:clamp(item.focusY??data.imagePos??50,0,100),
  zoom:clamp(item.zoom??1,1,2.2),alt:String(item.alt||data.name||fallback.name)
 }));
 if(!images.length){
  const src=String(data.image||fallback.image),base=(src.split("/").pop()||"current").replace(/[^a-z0-9_-]/gi,"-").slice(0,64)||"current";
  images=[{id:"legacy-"+base,src,focusX:50,focusY:clamp(data.imagePos??50,0,100),zoom:1,alt:data.name||fallback.name}];
 }
 const active=images.find(item=>item.id===String(raw.activeImageId||""))||images.find(item=>item.src===String(data.image||""))||images[0];
 return {images,active};
}
const label = (n,t) => '<div class="flex items-center gap-3 mb-5"><span class="text-xs font-mono tracking-widest text-[#00F2FE] font-bold">'+n+'</span><span class="h-px w-10 bg-[#00F2FE]/50"></span><span class="text-[10px] font-mono uppercase tracking-[.24em] text-zinc-400">'+t+'</span></div>';
function render(raw) {
 const d=Object.assign({},fallback,raw||{}), theme=d.theme||{}, hero=heroGalleryForData(d);
 document.documentElement.style.setProperty("--bg-color",theme.bgColor||"#05070B");
 document.documentElement.style.setProperty("--card-bg","rgba(13,17,26,.78)");
 document.documentElement.style.setProperty("--text-color","#F5F7FC");
 document.documentElement.style.setProperty("--accent-color",theme.neon1||"#00F2FE");
 document.title=(d.seo&&d.seo.title)||"Shihabul Islam | Web Developer, UI/UX Designer & AI Developer in Bangladesh";
 const navName=$("nav-name"),navText=navName&&navName.querySelector(".nav-electric-text"),displayName=d.name||fallback.name;
 if(navText){const initial=document.createElement("span"),rest=document.createElement("span");initial.className="nav-initial-letter";initial.setAttribute("aria-hidden","true");initial.textContent=displayName.charAt(0);rest.className="nav-name-rest";rest.textContent=displayName.slice(1);navText.replaceChildren(initial,rest);}else if(navName){navName.textContent=displayName;}
 $("footer-text").textContent="© "+new Date().getFullYear()+" "+(d.name||fallback.name)+". Built with curiosity.";
 $("nav-links").innerHTML=[["about.html","About"],["expertise.html","Expertise"],["projects.html","Projects"],["contact.html","Contact"],["news.html","News"]].map(a=>'<a class="hover:text-[#00F2FE] transition-colors" href="'+a[0]+'">'+a[1]+'</a>').join("");
 const skills=Array.isArray(d.skills)&&d.skills.length?d.skills:fallback.skills;
 const projects=Array.isArray(d.projects)&&d.projects.length?d.projects:fallback.projects;
 const img=esc(safeUrl(hero.active.src||d.image||fallback.image)), focusX=hero.active.focusX, focusY=hero.active.focusY, zoom=hero.active.zoom;
 let html='';
 html+='<section id="home" class="grid grid-cols-1 lg:grid-cols-2 items-center gap-12 min-h-[65vh]"><div class="space-y-6">';
 html+='<div class="inline-flex items-center gap-2.5 px-4 py-2 rounded-full border border-white/10 bg-white/[.03] text-[10px] sm:text-xs font-mono tracking-wider text-zinc-300">'+esc(d.badge||fallback.badge)+'</div>';
 html+='<p class="text-[10px] sm:text-xs font-mono tracking-[.24em] text-[#00F2FE] uppercase">Independent Digital Creator · Bangladesh</p><h1 class="text-5xl sm:text-6xl lg:text-7xl font-black leading-[1.02] tracking-tight text-white">'+esc(d.title1||fallback.title1)+'<br><span class="bg-clip-text text-transparent bg-gradient-to-r from-[#00F2FE] via-[#4FACFE] to-[#9B7BFF]">'+esc(d.title2||fallback.title2)+'</span></h1>';
 html+='<p class="max-w-xl text-sm sm:text-base text-zinc-400 leading-8">'+esc(d.bio||fallback.bio)+'</p><div class="flex flex-wrap gap-3 pt-2"><a href="projects.html" class="cyber-btn px-6 py-3.5 rounded-full text-black font-extrabold text-xs shadow-lg">Explore my work </a><a href="contact.html" class="glass-card px-6 py-3.5 rounded-full text-white font-bold text-xs">Let’s talk </a></div><div class="flex flex-wrap gap-5 pt-5 text-[10px] font-mono tracking-widest text-zinc-500"><span>WEB · AI · AUTOMATION</span><span>BUILD / TEST / REFINE</span></div></div>';
 html+='<div class="relative flex items-center justify-center min-h-[340px] sm:min-h-[420px]"><div class="absolute w-72 h-72 sm:w-96 sm:h-96 rounded-full border border-[#00F2FE]/15 animate-[spin_24s_linear_infinite]"></div><div class="absolute w-60 h-80 sm:w-72 sm:h-[26rem] rounded-[50%] border border-violet-500/20 rotate-45"></div><div class="absolute inset-5 sm:inset-0 rounded-full" style="background:radial-gradient(circle,rgba(0,242,254,.12),transparent 65%)"></div><span class="liquid-orb liquid-orb-a" aria-hidden="true"></span><span class="liquid-orb liquid-orb-b" aria-hidden="true"></span><div class="neon-ring-wrapper"><div class="neon-image-viewport"><img class="neon-inner-img" src="'+img+'" alt="'+esc(d.name||fallback.name)+'" style="object-position:'+focusX+'% '+focusY+'%;--hero-image-zoom:'+zoom+'" onerror="this.src=\'profile.jpg\';this.onerror=null"></div></div><div class="absolute bottom-6 left-0 sm:left-2 glass-card rounded-2xl p-4"><p class="text-xs font-bold text-white">✳ Always building</p><p class="text-[10px] text-zinc-400 mt-1">AI tools & digital experiences</p></div><div class="absolute top-8 right-0 sm:right-2 glass-card rounded-2xl p-4"><p class="text-xs font-bold text-white">⌘ Curious by nature</p><p class="text-[10px] text-zinc-400 mt-1">Learning by making</p></div></div></section>';
 // Contact is a static, accessible part of the footer in index.html.
 $("sections-wrapper").innerHTML=html;
 installPortraitReveal(hero.images,hero.active.id,d.name||fallback.name);
 // About, Expertise and Projects are rendered only on their dedicated HTML pages.
 const contactSection=$("contact"), footer=document.querySelector("footer"), slot=$("footer-contact-slot");
 if(contactSection&&footer&&slot){contactSection.classList.add("footer-contact-section");slot.appendChild(contactSection);}
 const effects=d.effects||{}; if(effects.liquid===false){document.querySelectorAll(".liquid-orb").forEach(el=>el.remove());} if(effects.glow===false){document.querySelectorAll(".glass-card").forEach(el=>el.style.boxShadow="none");}
 window.__portfolioRendered=true;window.dispatchEvent(new Event("portfolio:rendered"));
}

function installPortraitReveal(galleryImages,activeId,defaultAlt){
 const img=document.querySelector("#home .neon-inner-img");
 if(!img||img.dataset.revealReady)return;
 img.dataset.revealReady="1";img.tabIndex=0;img.setAttribute("role","button");
 img.setAttribute("aria-label","Show the full portrait gallery");img.setAttribute("aria-haspopup","dialog");
 const images=(Array.isArray(galleryImages)?galleryImages:[]).filter(item=>item&&typeof item.src==="string"&&item.src);
 const list=images.length?images:[{id:"active",src:img.currentSrc||img.src,alt:defaultAlt||"Full portrait"}];
 let activeIndex=Math.max(0,list.findIndex(item=>item.id===activeId));if(activeIndex<0)activeIndex=0;
 let currentIndex=activeIndex,mode="",hideTimer=0,historyEntry=false,pointerStart=null,suppressClickUntil=0;
 const style=document.createElement("style");style.id="portrait-reveal-styles";
 style.textContent=[
  '.neon-image-viewport{position:absolute;inset:2px;z-index:1;border-radius:50%;overflow:hidden;isolation:isolate}',
  '.neon-inner-img{position:absolute;inset:0;width:100%;height:100%;max-width:none;border-radius:50%;object-fit:cover;scale:var(--hero-image-zoom,1);transform-origin:center}',
  '#portrait-reveal-overlay{position:fixed;inset:0;z-index:99970;display:flex;align-items:center;justify-content:center;padding:max(12px,env(safe-area-inset-top)) 12px max(12px,env(safe-area-inset-bottom));background:rgba(2,5,14,.97);backdrop-filter:blur(10px);-webkit-backdrop-filter:blur(10px);opacity:0;visibility:hidden;pointer-events:none;transition:opacity .24s ease,visibility .24s ease;overflow:hidden;isolation:isolate;overscroll-behavior:contain}',
  '#portrait-reveal-overlay.is-visible{opacity:1;visibility:visible;pointer-events:auto}',
  '#portrait-reveal-frame{position:relative;pointer-events:auto;display:flex;align-items:center;justify-content:center;max-width:100%;max-height:100%;padding:clamp(5px,1.4vw,12px);border:1px solid rgba(79,172,254,.45);border-radius:18px;overflow:hidden;box-shadow:0 0 22px rgba(0,242,254,.16),0 0 34px rgba(127,0,255,.12);transform:translateY(14px) scale(.94);transition:transform .34s cubic-bezier(.16,1,.3,1);isolation:isolate;touch-action:pan-y}',
  '#portrait-reveal-overlay.is-visible #portrait-reveal-frame{transform:translateY(0) scale(1)}',
  '#portrait-reveal-frame:before{content:"";position:absolute;z-index:0;inset:0;border-radius:inherit;padding:2px;background:conic-gradient(from var(--portrait-angle,0deg),#00f2fe,#4facfe,#7f00ff,#e100ff,#00f2fe);animation:rotateGlow 7s linear infinite,portraitNeonGlow 3.8s ease-in-out infinite alternate;opacity:.78;pointer-events:none;-webkit-mask:linear-gradient(#000 0 0) content-box,linear-gradient(#000 0 0);-webkit-mask-composite:xor;mask-composite:exclude}',
  '#portrait-reveal-frame:after{content:"";position:absolute;z-index:3;inset:0;border:1.5px solid rgba(0,242,254,.55);border-radius:inherit;box-shadow:inset 0 0 12px rgba(79,172,254,.12);pointer-events:none}',
  '#portrait-reveal-image{display:block;width:auto;height:auto;max-width:min(90vw,1100px);max-height:min(86vh,calc(100dvh - env(safe-area-inset-top) - env(safe-area-inset-bottom) - 36px));object-fit:contain;object-position:center;border-radius:12px;background:rgba(4,8,18,.7);box-shadow:0 0 18px rgba(0,242,254,.16);animation:portraitImageIn .42s cubic-bezier(.16,1,.3,1) both;user-select:none;-webkit-user-drag:none;touch-action:pan-y}',
  '#portrait-reveal-light{position:absolute;z-index:2;inset:clamp(6px,1.4vw,12px);border-radius:10px;pointer-events:none;overflow:hidden;clip-path:inset(0 round 10px);mix-blend-mode:screen;opacity:.72}',
  '#portrait-reveal-light:before{content:"";position:absolute;inset:-45%;background:linear-gradient(112deg,transparent 38%,rgba(0,242,254,0) 43%,rgba(0,242,254,.24) 48%,rgba(190,245,255,.46) 50%,rgba(155,123,255,.2) 53%,transparent 60%);transform:translateX(-65%) rotate(0deg);animation:portraitLightSweep 3.6s ease-in-out infinite}',
  '#portrait-reveal-frame:before{inset:0;filter:none;opacity:.75}',
  '.portrait-reveal-nav{position:absolute;z-index:5;top:50%;display:none;place-items:center;width:clamp(38px,5vw,50px);height:clamp(38px,5vw,50px);padding:0;border:1px solid rgba(0,242,254,.55);border-radius:50%;background:rgba(3,10,22,.78);backdrop-filter:blur(8px);color:#e7fbff;font:700 27px/1 Arial,sans-serif;cursor:pointer;transform:translateY(-50%);box-shadow:0 0 18px rgba(0,242,254,.22);touch-action:manipulation}',
  '.portrait-reveal-nav:hover{background:rgba(0,242,254,.18);box-shadow:0 0 24px rgba(0,242,254,.35)}',
  '.portrait-reveal-nav:focus-visible{outline:2px solid #00f2fe;outline-offset:3px}',
  '#portrait-reveal-prev{left:clamp(10px,2vw,20px)}#portrait-reveal-next{right:clamp(10px,2vw,20px)}',
  '#portrait-reveal-overlay.is-tap .portrait-reveal-nav:not([hidden]){display:grid}',
  '@keyframes portraitLightSweep{0%,12%{transform:translateX(-70%)}68%,100%{transform:translateX(70%)}}',
  '@keyframes portraitNeonGlow{0%{filter:blur(5px) brightness(.9);opacity:.65}100%{filter:blur(8px) brightness(1.12);opacity:.9}}',
  '@keyframes portraitImageIn{from{opacity:.65;filter:brightness(.65) saturate(.8)}to{opacity:1;filter:brightness(1) saturate(1)}}',
  '@media(max-width:600px){#portrait-reveal-overlay{padding:max(10px,env(safe-area-inset-top)) 10px max(10px,env(safe-area-inset-bottom))}#portrait-reveal-frame{padding:7px;border-radius:14px;overflow:hidden}#portrait-reveal-frame:before{inset:0;filter:none}#portrait-reveal-light{inset:7px;border-radius:8px;clip-path:inset(0 round 8px)}#portrait-reveal-image{max-width:calc(100vw - 34px);max-height:calc(88dvh - env(safe-area-inset-top) - env(safe-area-inset-bottom));border-radius:9px}.portrait-reveal-nav{width:38px;height:38px;font-size:23px}}',
  '@media(prefers-reduced-motion:reduce){#portrait-reveal-overlay,#portrait-reveal-frame{transition:none}#portrait-reveal-frame:before,#portrait-reveal-image{animation:none}}'
 ].join("");
 document.head.appendChild(style);
 const overlay=document.createElement("div");overlay.id="portrait-reveal-overlay";
 overlay.setAttribute("aria-hidden","true");overlay.setAttribute("role","dialog");
 overlay.setAttribute("aria-modal","true");overlay.setAttribute("aria-label","Full-size portrait gallery");
 overlay.innerHTML='<div id="portrait-reveal-frame"><img id="portrait-reveal-image" alt=""><span id="portrait-reveal-light" aria-hidden="true"></span><button id="portrait-reveal-prev" class="portrait-reveal-nav" type="button" aria-label="Previous image" hidden>‹</button><button id="portrait-reveal-next" class="portrait-reveal-nav" type="button" aria-label="Next image" hidden>›</button></div>';
 document.body.appendChild(overlay);
 const frame=overlay.querySelector("#portrait-reveal-frame"),full=overlay.querySelector("#portrait-reveal-image");
 const previous=overlay.querySelector("#portrait-reveal-prev"),next=overlay.querySelector("#portrait-reveal-next");
 previous.hidden=next.hidden=list.length<2;
 const showCurrent=()=>{const item=list[currentIndex]||list[0];full.src=safeUrl(item.src);full.alt=item.alt||defaultAlt||"Full portrait";};
 const resetTimer=()=>{if(mode!=="tap")return;clearTimeout(hideTimer);hideTimer=setTimeout(()=>close(),20000);};
 const navigate=delta=>{if(mode!=="tap"||list.length<2)return;currentIndex=(currentIndex+delta+list.length)%list.length;showCurrent();resetTimer();};
 const open=nextMode=>{
  clearTimeout(hideTimer);mode=nextMode;currentIndex=activeIndex;showCurrent();
  overlay.classList.add("is-visible");overlay.classList.toggle("is-tap",nextMode==="tap");overlay.setAttribute("aria-hidden","false");
  if(nextMode==="tap"&&!historyEntry){try{history.pushState({...(history.state&&typeof history.state==="object"?history.state:{}),portraitViewer:true},"",location.href);historyEntry=true;}catch(_){}}
  if(nextMode==="tap")resetTimer();
 };
 function close(fromPop=false){
  clearTimeout(hideTimer);hideTimer=0;const hadHistory=historyEntry;historyEntry=false;mode="";pointerStart=null;
  overlay.classList.remove("is-visible","is-tap");overlay.setAttribute("aria-hidden","true");
  if(hadHistory&&!fromPop){try{history.back();}catch(_){}}
 }
 img.addEventListener("mouseenter",()=>{if(matchMedia("(hover: hover) and (pointer: fine)").matches&&mode!=="tap")open("hover")});
 img.addEventListener("mouseleave",()=>{if(mode==="hover")close()});
 img.addEventListener("click",event=>{event.preventDefault();open("tap")});
 img.addEventListener("keydown",event=>{if(event.key==="Enter"||event.key===" "){event.preventDefault();open("tap")}else if(event.key==="Escape")close()});
 previous.addEventListener("click",event=>{event.preventDefault();event.stopPropagation();navigate(-1);});
 next.addEventListener("click",event=>{event.preventDefault();event.stopPropagation();navigate(1);});
 frame.addEventListener("click",()=>{if(mode==="tap")resetTimer()});
 full.addEventListener("click",()=>{if(mode==="tap")resetTimer()});
 overlay.addEventListener("click",event=>{if(Date.now()<suppressClickUntil){event.preventDefault();event.stopPropagation();return;}if(event.target===overlay){close();return;}if(mode==="tap")resetTimer();});
 overlay.addEventListener("pointerdown",event=>{if(mode!=="tap"||event.target===overlay)return;resetTimer();if(event.pointerType==="touch")pointerStart={x:event.clientX,y:event.clientY};});
 overlay.addEventListener("pointerup",event=>{
  if(mode!=="tap"||!pointerStart)return;
  const dx=event.clientX-pointerStart.x,dy=event.clientY-pointerStart.y;pointerStart=null;
  if(Math.abs(dx)>48&&Math.abs(dx)>Math.abs(dy)*1.2){navigate(dx<0?1:-1);suppressClickUntil=Date.now()+450;event.preventDefault();}else resetTimer();
 });
 overlay.addEventListener("pointercancel",()=>{pointerStart=null});
 document.addEventListener("keydown",event=>{
  if(event.key==="Escape"&&mode){close();return;}
  if(mode==="tap"&&(event.key==="ArrowLeft"||event.key==="ArrowRight")){event.preventDefault();navigate(event.key==="ArrowLeft"?-1:1);}
 });
 window.addEventListener("popstate",()=>{if(mode==="tap")close(true);});
}
async function start(){
 let data=null;
 try { const p=sessionStorage.getItem("portfolio_admin_preview"); if(p){data=JSON.parse(p);sessionStorage.removeItem("portfolio_admin_preview");} } catch(_){}
 if(!data){try{const r=await fetch("site-data.json?updated="+Date.now(),{cache:"no-store"});if(r.ok)data=await r.json();}catch(_){}}
 render(data||fallback);
}
start();
})();