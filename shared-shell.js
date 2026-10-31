/* Shared header/footer polish on all secondary pages */
(()=>{'use strict';
// Load the lightweight visitor tracker on every page using the shared shell.
if(!document.querySelector('script[data-k74-visitor]')){const s=document.createElement('script');s.src='/visitor-tracking.js?v=1';s.defer=true;s.dataset.k74Visitor='true';document.head.appendChild(s);}
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
  tools.innerHTML='<a id="top-wa-btn" class="shell-wa" href="https://wa.me/8801620107233" target="_blank" rel="noopener noreferrer"><span aria-hidden="true">💬</span><span>WhatsApp</span></a>';
}
const footer=document.querySelector('footer');
if(footer){
  footer.classList.add('site-shell-footer');
  footer.querySelectorAll('.shell-footer-links').forEach(el=>el.remove());
  if(!footer.querySelector('.k74-privacy-link')){const a=document.createElement('a');a.className='k74-privacy-link';a.href='/privacy.html';a.textContent='Privacy';a.style.cssText='margin-left:12px;color:inherit;text-decoration:underline;text-underline-offset:3px';footer.appendChild(a);}
}

// One-time typing animation for each secondary page's existing hero accent.
// Animate only the text inside the hero H1; do not alter layout or other scripts.
const headline=document.querySelector('main h1 > .accent, .hero h1 > .accent');
if(headline && !headline.dataset.typewriterDone){
  const fullText=headline.textContent;
  headline.dataset.typewriterDone='true';
  headline.setAttribute('aria-label',fullText);
  if(!window.matchMedia('(prefers-reduced-motion: reduce)').matches){
    headline.classList.add('hero-typewriter-active');
    headline.textContent='';
    let index=0;
    const typeNext=()=>{
      index+=1;
      headline.textContent=fullText.slice(0,index);
      if(index<fullText.length) window.setTimeout(typeNext,48);
      else headline.classList.replace('hero-typewriter-active','hero-typewriter-done');
    };
    window.setTimeout(typeNext,260);
  }
}
})();