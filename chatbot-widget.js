/* One consistent chatbot launcher on every portfolio page. */
(()=>{'use strict';
if(document.getElementById('portfolio-chat-launcher'))return;
const face='<svg viewBox="0 0 48 48" aria-hidden="true" focusable="false"><defs><linearGradient id="portfolioRobotShell" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#00f2fe"/><stop offset="1" stop-color="#7f5cff"/></linearGradient><radialGradient id="portfolioRobotAntennaGlow"><stop offset="0" stop-color="#e9fdff"/><stop offset=".55" stop-color="#00f2fe"/><stop offset="1" stop-color="#7f5cff"/></radialGradient></defs><g class="robot-antenna"><path d="M24 5v5M21 5h6" stroke="url(#portfolioRobotShell)" stroke-width="2" stroke-linecap="round"/><circle class="robot-antenna-tip" cx="24" cy="4.3" r="2.1" fill="url(#portfolioRobotAntennaGlow)"/></g><rect x="7" y="12" width="34" height="29" rx="10" fill="#0c1b29" stroke="url(#portfolioRobotShell)" stroke-width="1.7"/><path d="M4 23v7M44 23v7" stroke="#00e5ff" stroke-width="2.5" stroke-linecap="round"/><rect x="11" y="17" width="26" height="18" rx="6" fill="#06111d" stroke="#1c5264" stroke-width="1"/><g class="robot-eye left"><ellipse cx="18.5" cy="25" rx="3.5" ry="4.1" fill="#00e5ff"/><circle class="robot-pupil" cx="19.4" cy="24.8" r="1.45" fill="#e9fdff"/></g><g class="robot-eye right"><ellipse cx="29.5" cy="25" rx="3.5" ry="4.1" fill="#00e5ff"/><circle class="robot-pupil" cx="30.4" cy="24.8" r="1.45" fill="#e9fdff"/></g><path class="robot-mouth" d="M19 31q5 3 10 0" fill="none" stroke="#7f5cff" stroke-width="1.7" stroke-linecap="round"/></svg>';
const miniFace=face.replace('id="portfolioRobotShell"','id="portfolioRobotShellMini"').replace('url(#portfolioRobotShell)','url(#portfolioRobotShellMini)').replace('id="portfolioRobotAntennaGlow"','id="portfolioRobotAntennaGlowMini"').replace('url(#portfolioRobotAntennaGlow)','url(#portfolioRobotAntennaGlowMini)');
const markup='<section id="portfolio-chat-panel" role="dialog" aria-label="Kokushibu portfolio chatbot" aria-modal="false"><div class="portfolio-chat-head"><div class="portfolio-chat-title"><span class="portfolio-chat-mini-face">'+miniFace+'</span><div><span>Kokushibu</span> · Portfolio Chat</div></div><button class="portfolio-chat-close" type="button" aria-label="Close chatbot">×</button></div><iframe id="portfolio-chat-frame" title="Kokushibu portfolio chat" loading="lazy" referrerpolicy="strict-origin-when-cross-origin"></iframe></section><button id="portfolio-chat-launcher" type="button" aria-label="Open portfolio chatbot" aria-expanded="false" title="Chat with Kokushibu">'+face+'</button>';
document.body.insertAdjacentHTML('beforeend',markup);
const launch=document.getElementById('portfolio-chat-launcher');
const panel=document.getElementById('portfolio-chat-panel');
const close=panel.querySelector('.portfolio-chat-close');
const frame=document.getElementById('portfolio-chat-frame');
let loaded=false,reactionTimer=0;
function react(){launch.classList.add('is-reacting');window.clearTimeout(reactionTimer);reactionTimer=window.setTimeout(()=>launch.classList.remove('is-reacting'),650)}
function setOpen(open){panel.classList.toggle('is-open',open);launch.setAttribute('aria-expanded',String(open));launch.setAttribute('aria-label',open?'Close portfolio chatbot':'Open portfolio chatbot');if(open&&!loaded){frame.src='chatbot.html?v=3';loaded=true}if(open)react()}
launch.addEventListener('click',()=>setOpen(!panel.classList.contains('is-open')));
launch.addEventListener('pointerenter',react,{passive:true});
launch.addEventListener('pointerdown',react,{passive:true});
close.addEventListener('click',()=>setOpen(false));
document.addEventListener('keydown',e=>{if(e.key==='Escape'&&panel.classList.contains('is-open')){setOpen(false);launch.focus()}});
})();
