(()=>{
'use strict';
const selectors=['#home > div:first-child > *','#home > div:nth-child(2)','.social-footer-inner > *'];
const observed=new WeakSet();
const observer=new IntersectionObserver(entries=>entries.forEach(entry=>{
  if(entry.isIntersecting) entry.target.classList.add('is-cursor-visible');
  else entry.target.classList.remove('is-cursor-visible');
}),{threshold:.12,rootMargin:'0px 0px -7% 0px'});
function apply(){
  selectors.forEach(selector=>document.querySelectorAll(selector).forEach((el,i)=>{
    if(el.matches('[data-no-scroll-reveal]')||observed.has(el)) return;
    observed.add(el);
    el.setAttribute('data-cursor-reveal','');
    el.style.transitionDelay=(Math.min(i,5)*65)+'ms';
    observer.observe(el);
  }));
}
apply();
const mutation=new MutationObserver(apply);
mutation.observe(document.body,{childList:true,subtree:true});
window.addEventListener('pagehide',()=>{mutation.disconnect();observer.disconnect();},{once:true});
})();