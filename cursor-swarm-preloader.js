(()=>{
  'use strict';
  const overlay=document.getElementById('cursor-swarm-preloader');
  const canvas=document.getElementById('cursor-swarm-canvas');
  const logo=document.getElementById('cursor-preloader-logo');
  const brand=document.getElementById('nav-name');
  const initial=brand&&brand.querySelector('.nav-initial-letter');
  if(!overlay||!canvas||!logo){return;}
  const ctx=canvas.getContext('2d',{alpha:true});
  const reduced=window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  const colors=['#00e5ff','#a855f7','#4facfe','#e879f9','#7dd3fc'];
  let w=1,h=1,dpr=1,raf=0,started=performance.now(),phase='orbit',finished=false,particles=[];
  const rand=(a,b)=>a+Math.random()*(b-a);
  function resize(){w=innerWidth;h=innerHeight;dpr=Math.min(devicePixelRatio||1,1.25);canvas.width=Math.round(w*dpr);canvas.height=Math.round(h*dpr);ctx.setTransform(dpr,0,0,dpr,0,0);}
  function seed(){const n=innerWidth<640?13:22;particles=Array.from({length:n},(_,i)=>({a:i/n*Math.PI*2,r:rand(76,Math.min(w,h)*.24),speed:rand(.65,1.15)*(i%2?1:-1),size:rand(7,11),color:colors[i%colors.length],x:w/2,y:h/2,tx:rand(-w*.65,w*.65),ty:rand(-h*.65,h*.65),vx:rand(-2.2,2.2),vy:rand(-2.2,2.2),spin:rand(-.3,.3)}));}
  function pointer(p){ctx.save();ctx.translate(p.x,p.y);ctx.rotate(Math.atan2(p.vy||Math.cos(p.a),p.vx||Math.sin(p.a))*.12);ctx.shadowColor=p.color;ctx.shadowBlur=12;ctx.fillStyle=p.color;ctx.globalAlpha=.94;ctx.beginPath();ctx.moveTo(0,0);ctx.lineTo(0,p.size*1.8);ctx.lineTo(p.size*.48,p.size*1.28);ctx.lineTo(p.size*1.12,p.size*1.15);ctx.closePath();ctx.fill();ctx.restore();}
  function draw(now){if(finished||!overlay.isConnected||document.hidden)return;const elapsed=now-started;ctx.clearRect(0,0,w,h);const cx=w/2,cy=h/2;const orbitEnd=reduced?180:1420; if(elapsed>orbitEnd)phase='burst';
    particles.forEach((p,i)=>{if(phase==='orbit'){p.a+=.012*p.speed;p.x=cx+Math.cos(p.a)*p.r;p.y=cy+Math.sin(p.a)*p.r*.62;}else{const t=Math.min(1,(elapsed-orbitEnd)/620);p.x+=(cx+p.tx-p.x)*(.035+t*.045);p.y+=(cy+p.ty-p.y)*(.035+t*.045);p.vx*=.992;p.vy*=.992;}pointer(p);});
    if(elapsed< (reduced?220:2050))raf=requestAnimationFrame(draw);else transferLogo();
  }
  function transferLogo(){if(finished)return;finished=true;if(raf)cancelAnimationFrame(raf);const target=initial&&initial.getBoundingClientRect();if(!target||!target.width){revealAndClose();return;}const startX=w/2,startY=h/2,targetX=target.left+target.width/2,targetY=target.top+target.height/2;const dx=targetX-startX,dy=targetY-startY;const scale=Math.max(.12,Math.min(.24,target.height/Math.max(logo.getBoundingClientRect().height,1)));const duration=reduced?180:850;
    try{const animation=logo.animate([{transform:'translate(-50%,-50%) translate(0px,0px) scale(1)',filter:'brightness(1.2)'},{transform:'translate(-50%,-50%) translate('+dx+'px,'+dy+'px) scale('+scale+')',filter:'brightness(1.8)'}],{duration,easing:'cubic-bezier(.18,.78,.22,1)',fill:'forwards'});animation.onfinish=revealAndClose;setTimeout(revealAndClose,duration+250);}catch(_){revealAndClose();}}
  function revealAndClose(){if(overlay.dataset.closed)return;overlay.dataset.closed='1';if(brand)brand.classList.add('logo-transfer-complete');overlay.classList.add('is-leaving');setTimeout(()=>{overlay.remove();startScrollReveal();},reduced?40:500);}
  function startScrollReveal(){const selectors=['#home > div:first-child > *','#home > div:nth-child(2)','.social-footer-inner > *'];const apply=()=>{const targets=new Set();selectors.forEach(sel=>document.querySelectorAll(sel).forEach(el=>{if(!el.matches('[data-no-scroll-reveal]'))targets.add(el);}));targets.forEach((el,i)=>{if(el.dataset.cursorRevealReady)return;el.dataset.cursorRevealReady='1';el.dataset.cursorReveal='';el.style.transitionDelay=(Math.min(i,5)*65)+'ms';observer.observe(el);});};
    const observer=new IntersectionObserver(entries=>entries.forEach(entry=>{if(entry.isIntersecting){entry.target.classList.add('is-cursor-visible');}else{entry.target.classList.remove('is-cursor-visible');}}),{threshold:.12,rootMargin:'0px 0px -7% 0px'});
    apply();const mutation=new MutationObserver(apply);mutation.observe(document.body,{childList:true,subtree:true});window.addEventListener('pagehide',()=>{mutation.disconnect();observer.disconnect();},{once:true});}
  resize();seed();if(!ctx||reduced){particles=[];setTimeout(transferLogo,reduced?80:250);}else raf=requestAnimationFrame(draw);window.addEventListener('resize',()=>{resize();seed();},{passive:true});document.addEventListener('visibilitychange',()=>{if(document.hidden&&raf){cancelAnimationFrame(raf);raf=0;}else if(!document.hidden&&!finished&&!raf)raf=requestAnimationFrame(draw);});
  // Hard fail-safe: never leave the portfolio covered if an animation API fails.
  setTimeout(()=>{if(!finished)transferLogo();},4200);
})();