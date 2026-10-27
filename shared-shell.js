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
  // Secondary pages share the homepage WhatsApp treatment; the clock stays on Home only.
  tools.innerHTML='<a id="top-wa-btn" class="shell-wa" href="https://wa.me/8801620107233" target="_blank" rel="noopener noreferrer"><i class="fa-brands fa-whatsapp" aria-hidden="true"></i><span>WhatsApp</span><span class="shell-wa-arrow" aria-hidden="true">↗</span></a>';
}
const footer=document.querySelector('footer');
if(footer){
  footer.classList.add('site-shell-footer');
  footer.querySelectorAll('.shell-footer-links').forEach(el=>el.remove());
}
})();