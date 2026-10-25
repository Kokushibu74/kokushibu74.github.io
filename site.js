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
const label = (n,t) => '<div class="flex items-center gap-3 mb-5"><span class="text-xs font-mono tracking-widest text-[#00F2FE] font-bold">'+n+'</span><span class="h-px w-10 bg-[#00F2FE]/50"></span><span class="text-[10px] font-mono uppercase tracking-[.24em] text-zinc-400">'+t+'</span></div>';
function render(raw) {
 const d=Object.assign({},fallback,raw||{}), theme=d.theme||{};
 document.documentElement.style.setProperty("--bg-color",theme.bgColor||"#05070B");
 document.documentElement.style.setProperty("--card-bg","rgba(13,17,26,.78)");
 document.documentElement.style.setProperty("--text-color","#F5F7FC");
 document.documentElement.style.setProperty("--accent-color",theme.neon1||"#00F2FE");
 document.title=(d.seo&&d.seo.title)||"Shihabul Islam | Web Developer, UI/UX Designer & AI Developer in Bangladesh";
 $("nav-name").textContent=d.name||fallback.name;
 $("footer-text").textContent="© "+new Date().getFullYear()+" "+(d.name||fallback.name)+". Built with curiosity.";
 $("nav-links").innerHTML=[["about.html","About"],["expertise.html","Expertise"],["projects.html","Projects"],["#contact","Contact"],["news.html","News"]].map(a=>'<a class="hover:text-[#00F2FE] transition-colors" href="'+a[0]+'">'+a[1]+'</a>').join("");
 const skills=Array.isArray(d.skills)&&d.skills.length?d.skills:fallback.skills;
 const projects=Array.isArray(d.projects)&&d.projects.length?d.projects:fallback.projects;
 const img=esc(d.image||fallback.image);
 let html='';
 html+='<section id="home" class="grid grid-cols-1 lg:grid-cols-2 items-center gap-12 min-h-[65vh]"><div class="space-y-6">';
 html+='<div class="inline-flex items-center gap-2.5 px-4 py-2 rounded-full border border-white/10 bg-white/[.03] text-[10px] sm:text-xs font-mono tracking-wider text-zinc-300"><span class="w-2 h-2 rounded-full bg-[#00F2FE] shadow-[0_0_12px_#00F2FE] animate-pulse"></span>'+esc(d.badge||fallback.badge)+'</div>';
 html+='<p class="text-[10px] sm:text-xs font-mono tracking-[.24em] text-[#00F2FE] uppercase">Independent Digital Creator · Bangladesh</p><h1 class="text-5xl sm:text-6xl lg:text-7xl font-black leading-[1.02] tracking-tight text-white">'+esc(d.title1||fallback.title1)+'<br><span class="bg-clip-text text-transparent bg-gradient-to-r from-[#00F2FE] via-[#4FACFE] to-[#9B7BFF]">'+esc(d.title2||fallback.title2)+'</span></h1>';
 html+='<p class="max-w-xl text-sm sm:text-base text-zinc-400 leading-8">'+esc(d.bio||fallback.bio)+'</p><div class="flex flex-wrap gap-3 pt-2"><a href="projects.html" class="cyber-btn px-6 py-3.5 rounded-full text-black font-extrabold text-xs shadow-lg">Explore my work <span class="ml-2">↘</span></a><a href="mailto:mdshihab74@gmail.com" class="glass-card px-6 py-3.5 rounded-full text-white font-bold text-xs">Let’s talk </a></div><div class="flex flex-wrap gap-5 pt-5 text-[10px] font-mono tracking-widest text-zinc-500"><span>WEB · AI · AUTOMATION</span><span>BUILD / TEST / REFINE</span></div></div>';
 html+='<div class="relative flex items-center justify-center min-h-[340px] sm:min-h-[420px]"><div class="absolute w-72 h-72 sm:w-96 sm:h-96 rounded-full border border-[#00F2FE]/15 animate-[spin_24s_linear_infinite]"></div><div class="absolute w-60 h-80 sm:w-72 sm:h-[26rem] rounded-[50%] border border-violet-500/20 rotate-45"></div><div class="absolute inset-5 sm:inset-0 rounded-full" style="background:radial-gradient(circle,rgba(0,242,254,.12),transparent 65%)"></div><span class="liquid-orb liquid-orb-a" aria-hidden="true"></span><span class="liquid-orb liquid-orb-b" aria-hidden="true"></span><div class="neon-ring-wrapper"><img class="neon-inner-img" src="'+img+'" alt="'+esc(d.name||fallback.name)+'" style="object-position:center '+Number(d.imagePos==null?50:d.imagePos)+'%" onerror="this.src=\'profile.jpg\';this.onerror=null"></div><div class="absolute bottom-6 left-0 sm:left-2 glass-card rounded-2xl p-4"><p class="text-xs font-bold text-white">✳ Always building</p><p class="text-[10px] text-zinc-400 mt-1">AI tools & digital experiences</p></div><div class="absolute top-8 right-0 sm:right-2 glass-card rounded-2xl p-4"><p class="text-xs font-bold text-white">⌘ Curious by nature</p><p class="text-[10px] text-zinc-400 mt-1">Learning by making</p></div></div></section>';
 // Contact is a static, accessible part of the footer in index.html.
 $("sections-wrapper").innerHTML=html;
 installPortraitReveal();
 // About, Expertise and Projects are rendered only on their dedicated HTML pages.
 const contactSection=$("contact"), footer=document.querySelector("footer"), slot=$("footer-contact-slot");
 if(contactSection&&footer&&slot){contactSection.classList.add("footer-contact-section");slot.appendChild(contactSection);}
 const effects=d.effects||{}; if(effects.liquid===false){document.querySelectorAll(".liquid-orb").forEach(el=>el.remove());} if(effects.glow===false){document.querySelectorAll(".glass-card").forEach(el=>el.style.boxShadow="none");}
}

function installPortraitReveal(){
 const img=document.querySelector("#home .neon-inner-img");
 if(!img || img.dataset.revealReady) return;
 img.dataset.revealReady="1";
 img.tabIndex=0;
 img.setAttribute("role","button");
 img.setAttribute("aria-label","Show the full portrait");
 img.setAttribute("aria-haspopup","dialog");
 const style=document.createElement("style");
 style.id="portrait-reveal-styles";
 style.textContent=`
  #portrait-reveal-overlay{position:fixed;inset:0;z-index:99970;display:flex;align-items:center;justify-content:center;padding:max(12px,env(safe-area-inset-top)) 12px max(12px,env(safe-area-inset-bottom));background:rgba(2,5,14,.97);backdrop-filter:blur(10px);-webkit-backdrop-filter:blur(10px);opacity:0;visibility:hidden;pointer-events:none;transition:opacity .24s ease,visibility .24s ease;overflow:hidden;isolation:isolate}
  #portrait-reveal-overlay.is-visible{opacity:1;visibility:visible}
  #portrait-reveal-frame{position:relative;pointer-events:none;display:flex;align-items:center;justify-content:center;max-width:100%;max-height:100%;padding:clamp(5px,1.4vw,12px);border:1px solid rgba(79,172,254,.45);border-radius:18px;overflow:hidden;box-shadow:0 0 22px rgba(0,242,254,.16),0 0 34px rgba(127,0,255,.12);transform:translateY(14px) scale(.94);transition:transform .34s cubic-bezier(.16,1,.3,1);isolation:isolate}
  #portrait-reveal-overlay.is-visible #portrait-reveal-frame{transform:translateY(0) scale(1)}
  #portrait-reveal-frame:before{content:"";position:absolute;z-index:0;inset:0;border-radius:inherit;padding:2px;background:conic-gradient(from var(--portrait-angle,0deg),#00f2fe,#4facfe,#7f00ff,#e100ff,#00f2fe);animation:rotateGlow 7s linear infinite,portraitNeonGlow 3.8s ease-in-out infinite alternate;opacity:.78;pointer-events:none;-webkit-mask:linear-gradient(#000 0 0) content-box,linear-gradient(#000 0 0);-webkit-mask-composite:xor;mask-composite:exclude}
  #portrait-reveal-frame:after{content:"";position:absolute;z-index:3;inset:0;border:1.5px solid rgba(0,242,254,.55);border-radius:inherit;box-shadow:inset 0 0 12px rgba(79,172,254,.12);pointer-events:none}
  #portrait-reveal-image{display:block;width:auto;height:auto;max-width:min(90vw,1100px);max-height:min(86vh,calc(100dvh - env(safe-area-inset-top) - env(safe-area-inset-bottom) - 36px));object-fit:contain;object-position:center;border-radius:12px;background:rgba(4,8,18,.7);box-shadow:0 0 18px rgba(0,242,254,.16);animation:portraitImageIn .42s cubic-bezier(.16,1,.3,1) both}
  #portrait-reveal-light{position:absolute;z-index:2;inset:clamp(6px,1.4vw,12px);border-radius:10px;pointer-events:none;overflow:hidden;clip-path:inset(0 round 10px);mix-blend-mode:screen;opacity:.72}
  #portrait-reveal-light:before{content:"";position:absolute;inset:-45%;background:linear-gradient(112deg,transparent 38%,rgba(0,242,254,0) 43%,rgba(0,242,254,.24) 48%,rgba(190,245,255,.46) 50%,rgba(155,123,255,.2) 53%,transparent 60%);transform:translateX(-65%) rotate(0deg);animation:portraitLightSweep 3.6s ease-in-out infinite}
  #portrait-reveal-frame:before{inset:0;filter:none;opacity:.75}
  @keyframes portraitLightSweep{0%,12%{transform:translateX(-70%)}68%,100%{transform:translateX(70%)}}
  @keyframes portraitNeonGlow{0%{filter:blur(5px) brightness(.9);opacity:.65}100%{filter:blur(8px) brightness(1.12);opacity:.9}}
  @keyframes portraitImageIn{from{opacity:.65;filter:brightness(.65) saturate(.8)}to{opacity:1;filter:brightness(1) saturate(1)}}
  @media(max-width:600px){#portrait-reveal-overlay{padding:max(10px,env(safe-area-inset-top)) 10px max(10px,env(safe-area-inset-bottom))}#portrait-reveal-frame{padding:7px;border-radius:14px;overflow:hidden}#portrait-reveal-frame:before{inset:0;filter:none} #portrait-reveal-light{inset:7px;border-radius:8px;clip-path:inset(0 round 8px)}#portrait-reveal-image{max-width:calc(100vw - 34px);max-height:calc(88dvh - env(safe-area-inset-top) - env(safe-area-inset-bottom));border-radius:9px}}
  @media(prefers-reduced-motion:reduce){#portrait-reveal-overlay,#portrait-reveal-frame{transition:none}#portrait-reveal-frame:before,#portrait-reveal-image{animation:none}}
 `;
 document.head.appendChild(style);
 const overlay=document.createElement("div");
 overlay.id="portrait-reveal-overlay";
 overlay.setAttribute("aria-hidden","true");
 overlay.innerHTML='<div id="portrait-reveal-frame"><img id="portrait-reveal-image" alt=""><span id="portrait-reveal-light" aria-hidden="true"></span></div>';
 document.body.appendChild(overlay);
 const full=overlay.querySelector("#portrait-reveal-image");
 let mode="",hideTimer=0;
 const open=nextMode=>{
  clearTimeout(hideTimer);mode=nextMode;
  if(!full.src || full.src!==img.src) full.src=img.currentSrc||img.src;
  full.alt=img.alt||"Full portrait";
  overlay.classList.add("is-visible");overlay.setAttribute("aria-hidden","false");
  if(nextMode==="tap")hideTimer=setTimeout(close,2600);
 };
 function close(){clearTimeout(hideTimer);hideTimer=0;mode="";overlay.classList.remove("is-visible");overlay.setAttribute("aria-hidden","true")}
 img.addEventListener("mouseenter",()=>{if(matchMedia("(hover: hover) and (pointer: fine)").matches)open("hover")});
 img.addEventListener("mouseleave",()=>{if(mode==="hover")close()});
 img.addEventListener("click",e=>{e.preventDefault();open("tap")});
 img.addEventListener("keydown",e=>{if(e.key==="Enter"||e.key===" "){e.preventDefault();open("tap")}else if(e.key==="Escape")close()});
 document.addEventListener("keydown",e=>{if(e.key==="Escape")close()});
}

async function start(){
 let data=null;
 try { const p=sessionStorage.getItem("portfolio_admin_preview"); if(p){data=JSON.parse(p);sessionStorage.removeItem("portfolio_admin_preview");} } catch(_){}
 if(!data){try{const r=await fetch("site-data.json?updated="+Date.now(),{cache:"no-store"});if(r.ok)data=await r.json();}catch(_){}}
 render(data||fallback);
}
start();
})();