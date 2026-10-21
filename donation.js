/* Shared Supporting donation button for portfolio subpages */
(function(){
  if(document.getElementById('site-donation-widget') || document.getElementById('donation-toggle')) return;
  function mount(){
    if(document.getElementById('site-donation-widget') || document.getElementById('donation-toggle')) return;
    const root=document.createElement('aside');
    root.id='site-donation-widget';
    root.innerHTML=`
      <button class="donation-trigger" type="button" aria-expanded="false" aria-controls="site-donation-popover"><span class="donation-trigger-icon" aria-hidden="true">♡</span><span>Supporting donation</span></button>
      <section id="site-donation-popover" class="donation-popover" role="dialog" aria-label="Supporting donation" aria-hidden="true" hidden>
        <div class="donation-popover-head"><span class="donation-coin" aria-hidden="true">₮</span><div><p class="donation-eyebrow">SUPPORT THE CREATOR</p><h3>Donate with USDT</h3></div><button class="donation-close" type="button" aria-label="Close donation box">×</button></div>
        <div class="donation-network"><span class="network-pulse"></span><span><strong>Network:</strong> TRON (TRC20)</span></div>
        <p class="donation-label">Wallet Address</p><div class="donation-address-row"><code>TVFZWJe4sxwC1gcFB4P68SLBygmWNjFpSc</code><button class="donation-copy" type="button" aria-label="Copy wallet address" title="Copy wallet address"><i class="fa-regular fa-copy" aria-hidden="true"></i></button></div>
        <p class="donation-warning"><span aria-hidden="true">⚠️</span><span><strong>Important:</strong> Send USDT only via the <strong>TRON (TRC20)</strong> network.</span></p>
        <p class="donation-thanks">Thank you for supporting <span aria-hidden="true">♥</span></p><p class="donation-copy-status" aria-live="polite"></p>
      </section>`;
    document.body.appendChild(root);
    const toggle=root.querySelector('.donation-trigger'), panel=root.querySelector('.donation-popover'), close=root.querySelector('.donation-close'), copy=root.querySelector('.donation-copy'), status=root.querySelector('.donation-copy-status');
    function setOpen(open){panel.hidden=!open;panel.setAttribute('aria-hidden',String(!open));toggle.setAttribute('aria-expanded',String(open));if(open){panel.classList.remove('is-opening');void panel.offsetWidth;panel.classList.add('is-opening')}}
    toggle.addEventListener('click',()=>setOpen(panel.hidden));
    close.addEventListener('click',()=>setOpen(false));
    document.addEventListener('click',e=>{if(!root.contains(e.target))setOpen(false)});
    document.addEventListener('keydown',e=>{if(e.key==='Escape')setOpen(false)});
    copy.addEventListener('click',async()=>{const address=root.querySelector('code').textContent;try{await navigator.clipboard.writeText(address);status.textContent='Wallet address copied!'}catch(_){const range=document.createRange();range.selectNodeContents(root.querySelector('code'));const selection=window.getSelection();selection.removeAllRanges();selection.addRange(range);status.textContent='Select and copy the wallet address.'}});
  }
  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',mount,{once:true});else mount();
})();