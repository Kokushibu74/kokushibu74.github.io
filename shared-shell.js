/* Shared header/footer polish on all secondary pages */
(()=>{'use strict';
const header=document.querySelector('header');
if(header){header.classList.add('site-shell-header');
let nav=header.querySelector('nav.links');
if(!nav){nav=document.createElement('nav');nav.className='links';nav.setAttribute('aria-label','Main navigation');header.appendChild(nav);}
const links=[['Home','./'],['About','about.html'],['Expertise','expertise.html'],['Projects','projects.html'],['News','news.html'],['Contact','contact.html']];
nav.innerHTML=links.map(([label,url])=>'<a href="'+url+'"'+(location.pathname.endsWith(url)&&url!=='./'?' class="active"':'')+'>'+label+'</a>').join('');
if(!header.querySelector('.shell-tools')){const tools=document.createElement('div');tools.className='shell-tools';tools.innerHTML='<div class="shell-clock"><span id="shell-time">--:--</span><small id="shell-local-meta">Local date · local time zone</small><small id="shell-local-place">Location: timezone-based</small></div><a class="shell-wa" href="https://wa.me/8801620107233" target="_blank" rel="noopener">💬 WhatsApp</a>';header.appendChild(tools);
const timeZone=Intl.DateTimeFormat().resolvedOptions().timeZone||'Local time zone';
const tick=()=>{const now=new Date();const n=document.getElementById('shell-time');const meta=document.getElementById('shell-local-meta');if(n)n.textContent=new Intl.DateTimeFormat(undefined,{hour:'2-digit',minute:'2-digit',hour12:true}).format(now);if(meta)meta.textContent=new Intl.DateTimeFormat(undefined,{weekday:'short',day:'2-digit',month:'short',year:'numeric'}).format(now)+' · '+timeZone;};tick();setInterval(tick,1000);
const place=document.getElementById('shell-local-place');if(place){place.textContent='Location: '+timeZone.replace(/_/g,' ');if(navigator.geolocation){navigator.geolocation.getCurrentPosition(async p=>{try{const u='https://nominatim.openstreetmap.org/reverse?format=jsonv2&lat='+encodeURIComponent(p.coords.latitude)+'&lon='+encodeURIComponent(p.coords.longitude)+'&zoom=10';const r=await fetch(u,{headers:{Accept:'application/json'}});if(!r.ok)return;const d=await r.json();const a=d.address||{};const city=a.city||a.town||a.village||a.suburb||a.county||a.state;const country=a.country;if(place&& (city||country))place.textContent='Location: '+[city,country].filter(Boolean).join(', ');}catch(_){}} ,()=>{}, {enableHighAccuracy:false,timeout:7000,maximumAge:600000});}}
}}
const footer=document.querySelector('footer');
if(footer){footer.classList.add('site-shell-footer');
if(!footer.querySelector('.shell-footer-links')){const links=document.createElement('nav');links.className='shell-footer-links';links.innerHTML='<a href="about.html">About</a><a href="expertise.html">Expertise</a><a href="projects.html">Projects</a><a href="news.html">News</a><a href="contact.html">Contact</a><a href="./">Back to top ↑</a>';footer.appendChild(links);}
}
})();