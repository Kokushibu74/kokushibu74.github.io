/* Shared header/footer polish on all secondary pages */
(()=>{'use strict';
const header=document.querySelector('header');
if(header){header.classList.add('site-shell-header');
let nav=header.querySelector('nav.links');
if(!nav){nav=document.createElement('nav');nav.className='links';nav.setAttribute('aria-label','Main navigation');header.appendChild(nav);}
const links=[['Home','./'],['About','about.html'],['Expertise','expertise.html'],['Projects','projects.html'],['News','news.html'],['Contact','contact.html']];
nav.innerHTML=links.map(([label,url])=>'<a href="'+url+'"'+(location.pathname.endsWith(url)&&url!=='./'?' class="active"':'')+'>'+label+'</a>').join('');
if(!header.querySelector('.shell-tools')){const tools=document.createElement('div');tools.className='shell-tools';tools.innerHTML='<div class="shell-clock"><span id="shell-time">--:--</span><small>DHAKA · BANGLADESH</small></div><a class="shell-wa" href="https://wa.me/8801620107233" target="_blank" rel="noopener">💬 WhatsApp</a>';header.appendChild(tools);
const tick=()=>{const n=document.getElementById('shell-time');if(n)n.textContent=new Intl.DateTimeFormat('en-BD',{timeZone:'Asia/Dhaka',hour:'2-digit',minute:'2-digit',hour12:true}).format(new Date());};tick();setInterval(tick,30000);
}}
const footer=document.querySelector('footer');
if(footer){footer.classList.add('site-shell-footer');
if(!footer.querySelector('.shell-footer-links')){const links=document.createElement('nav');links.className='shell-footer-links';links.innerHTML='<a href="about.html">About</a><a href="expertise.html">Expertise</a><a href="projects.html">Projects</a><a href="news.html">News</a><a href="contact.html">Contact</a><a href="./">Back to top ↑</a>';footer.appendChild(links);}
}
})();