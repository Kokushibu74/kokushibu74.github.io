/* Shared header/footer polish on all secondary pages */
(()=>{'use strict';
const header=document.querySelector('header');
if(header){
  header.classList.add('site-shell-header');
  let nav=header.querySelector('nav.links');
  if(!nav){nav=document.createElement('nav');nav.className='links';nav.setAttribute('aria-label','Main navigation');header.appendChild(nav);}
  const links=[['Home','./'],['About','about.html'],['Expertise','expertise.html'],['Projects','projects.html'],['News','news.html'],['Contact','contact.html']];
  nav.innerHTML=links.map(([label,url])=>'<a href="'+url+'"'+(location.pathname.endsWith(url)&&url!=='./'?' class="active"':'')+'>'+label+'</a>').join('');

  let tools=header.querySelector('.shell-tools');
  if(!tools){tools=document.createElement('div');tools.className='shell-tools';header.appendChild(tools);}
  tools.innerHTML='<div class="shell-clock" aria-label="Your local date and time"><span class="shell-clock-time">--:--</span><small class="shell-clock-date">YOUR LOCAL TIME</small><small class="shell-clock-zone"></small></div><a class="shell-wa" href="https://wa.me/8801620107233" target="_blank" rel="noopener noreferrer">WhatsApp ↗</a>';
  const timeNode=tools.querySelector('.shell-clock-time'),dateNode=tools.querySelector('.shell-clock-date'),zoneNode=tools.querySelector('.shell-clock-zone');
  const zone=Intl.DateTimeFormat().resolvedOptions().timeZone||'Local timezone';
  const tick=()=>{
    const now=new Date();
    timeNode.textContent=new Intl.DateTimeFormat(undefined,{hour:'2-digit',minute:'2-digit',hour12:undefined}).format(now);
    dateNode.textContent=new Intl.DateTimeFormat(undefined,{weekday:'short',month:'short',day:'numeric'}).format(now).toUpperCase();
    zoneNode.textContent=zone.replace(/_/g,' ');
  };
  tick();setInterval(tick,15000);
}
const footer=document.querySelector('footer');
if(footer){
  footer.classList.add('site-shell-footer');
  /* Do not add a second About/Expertise/Projects/News/Contact link bar to subpage footers. */
  footer.querySelectorAll('.shell-footer-links').forEach(el=>el.remove());
}
})();