const INSTALLED_KEY="k74-news-app-installed-v1";
const SHOW_DELAY_MS=4000;

export function isAndroidMobile(nav=typeof navigator!=="undefined"?navigator:{}) {
  const ua=String(nav.userAgent||"");
  const platform=String(nav.userAgentData?.platform||"");
  const android=/android/i.test(ua)||/^android$/i.test(platform);
  if(!android||/iphone|ipad|ipod/i.test(ua))return false;
  if(typeof nav.userAgentData?.mobile==="boolean")return nav.userAgentData.mobile;
  return /android.+mobile|mobile.+android/i.test(ua);
}

export function isStandaloneDisplay(nav=typeof navigator!=="undefined"?navigator:{},win=typeof window!=="undefined"?window:{}) {
  if(nav.standalone===true)return true;
  try{return Boolean(win.matchMedia?.("(display-mode: standalone)").matches||win.matchMedia?.("(display-mode: fullscreen)").matches)}catch(_){return false}
}

export function shouldOfferInstall({androidMobile,standalone,installed=false}) {
  return Boolean(androidMobile&&!standalone&&!installed);
}

function isAppInstalled(){
  try{return localStorage.getItem(INSTALLED_KEY)==="1"}catch(_){return false}
}
function markAppInstalled(){
  try{localStorage.setItem(INSTALLED_KEY,"1")}catch(_){}
}
function isInAppBrowser(){
  return /;\s*wv\)|\bwv\b|Instagram|FBAN|FBAV|Line\/|Telegram|TikTok|Twitter/i.test(navigator.userAgent||"");
}
function iconMarkup(name){
  const paths={
    zap:'<path d="m13 2-3 8h7l-6 12 1-9H5l8-11Z"/>',
    book:'<path d="M4 5.5A2.5 2.5 0 0 1 6.5 3H20v17H6.5A2.5 2.5 0 0 0 4 22V5.5Z"/><path d="M4 18.5A2.5 2.5 0 0 1 6.5 16H20M8 7h8m-8 4h8"/>',
    phone:'<rect x="6" y="2" width="12" height="20" rx="2"/><path d="M11 18h2"/>'
  };
  return '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">'+paths[name]+'</svg>';
}

function mountInstallSheet(){
  if(document.getElementById("news-install-overlay"))return;
  const overlay=document.createElement("div");
  overlay.id="news-install-overlay";
  overlay.className="news-install-overlay";
  overlay.hidden=true;
  overlay.innerHTML=`
    <section class="news-install-sheet" role="dialog" aria-modal="true" aria-labelledby="news-install-title" aria-describedby="news-install-copy">
      <button class="news-install-close" type="button" aria-label="Close installation invitation">×</button>
      <div class="news-install-brand">
        <img class="news-install-icon" src="./assets/pwa/news-192.svg" alt="" width="58" height="58">
        <div><strong>KOKUSHIBU74 NEWS</strong><small>LIVE NEWS · INTELLIGENCE</small></div>
      </div>
      <h2 class="news-install-title" id="news-install-title">Stay informed.<br><span>Anywhere.</span></h2>
      <p class="news-install-copy" id="news-install-copy">Install KOKUSHIBU74 NEWS for quick Home Screen access and a focused, app-like reading experience.</p>
      <ul class="news-install-benefits">
        <li>${iconMarkup("zap")} Quick access from your Home Screen</li>
        <li>${iconMarkup("book")} A dedicated, distraction-free News experience</li>
        <li>${iconMarkup("phone")} Opens in its own app window</li>
      </ul>
      <div class="news-install-actions">
        <button class="news-install-primary" type="button" data-news-install-action>INSTALL NOW</button>
        <button class="news-install-secondary" type="button" data-news-install-dismiss>NOT NOW</button>
      </div>
      <div class="news-install-instructions" data-news-install-instructions hidden aria-live="polite"></div>
    </section>`;
  document.body.appendChild(overlay);
  const close=()=>hideSheet();
  overlay.querySelector(".news-install-close").addEventListener("click",close);
  overlay.querySelector("[data-news-install-dismiss]").addEventListener("click",close);
  overlay.addEventListener("click",event=>{if(event.target===overlay)close()});
  overlay.querySelector("[data-news-install-action]").addEventListener("click",()=>{void handleInstallAction()});
  document.addEventListener("keydown",event=>{if(event.key==="Escape"&&!overlay.hidden)close()});
}

let deferredInstallPrompt=null;
let sheetTimer=null;
let previousFocus=null;

function showSheet(){
  const overlay=document.getElementById("news-install-overlay");
  if(!overlay||!overlay.hidden)return;
  previousFocus=document.activeElement;
  overlay.hidden=false;
  requestAnimationFrame(()=>overlay.classList.add("is-visible"));
  overlay.querySelector(".news-install-close")?.focus();
}
function hideSheet(){
  const overlay=document.getElementById("news-install-overlay");
  if(!overlay||overlay.hidden)return;
  overlay.classList.remove("is-visible");
  window.setTimeout(()=>{overlay.hidden=true;previousFocus?.focus?.()},300);
}
function showManualInstructions(){
  const box=document.querySelector("[data-news-install-instructions]");
  const button=document.querySelector("[data-news-install-action]");
  if(!box||!button)return;
  const embedded=isInAppBrowser();
  box.innerHTML=embedded
    ?'<strong>Open in your browser</strong><br>Use this browser menu to choose “Open in Chrome” or “Open in browser”. Then open the browser menu and select “Install app” or “Add to Home screen”.'
    :'<strong>Add KOKUSHIBU74 NEWS to your Home Screen</strong><br>Open your browser menu (⋮ or ☰), then choose “Install app” or “Add to Home screen”. The wording can vary by browser.';
  box.hidden=false;
  button.textContent="GOT IT";
}
async function handleInstallAction(){
  const instructions=document.querySelector("[data-news-install-instructions]");
  if(instructions&&!instructions.hidden){hideSheet(true);return}
  if(!deferredInstallPrompt){showManualInstructions();return}
  const promptEvent=deferredInstallPrompt;
  deferredInstallPrompt=null;
  try{
    await promptEvent.prompt();
    const choice=await promptEvent.userChoice;
    if(choice?.outcome==="accepted"){
      hideSheet();
    }else{
      hideSheet();
    }
  }catch(_){
    showManualInstructions();
  }
}

function init(){
  if(!isAndroidMobile()||isStandaloneDisplay())return;
  if(!shouldOfferInstall({androidMobile:true,standalone:false,installed:isAppInstalled()}))return;
  mountInstallSheet();
  sheetTimer=window.setTimeout(showSheet,SHOW_DELAY_MS);
  window.addEventListener("beforeinstallprompt",event=>{
    if(!isAndroidMobile()||isStandaloneDisplay())return;
    event.preventDefault();
    deferredInstallPrompt=event;
    const button=document.querySelector("[data-news-install-action]");
    if(button)button.textContent="INSTALL NOW";
    const instructions=document.querySelector("[data-news-install-instructions]");
    if(instructions)instructions.hidden=true;
  });
  window.addEventListener("appinstalled",()=>{
    if(sheetTimer)window.clearTimeout(sheetTimer);
    markAppInstalled();
    hideSheet();
  });
}

if(typeof document!=="undefined"){
  if(document.readyState==="loading")document.addEventListener("DOMContentLoaded",init,{once:true});
  else init();
}
