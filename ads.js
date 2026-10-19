(() => {
  "use strict";
  const config = window.SHIHAB_ADSENSE || {};
  const client = String(config.client || "");
  const slots = config.slots || {};
  const validClient = /^ca-pub-\d+$/.test(client);
  function mount(element, key) {
    if (!element || element.dataset.adsMounted) return;
    element.dataset.adsMounted = "1";
    const slot = String(slots[key] || "");
    if (!validClient || !/^\d+$/.test(slot)) {
      element.textContent = "ADVERTISEMENT · Add your AdSense publisher ID and " + key + " ad slot in ads-config.js";
      return;
    }
    if (!document.querySelector('script[data-shihab-adsense="1"]')) {
      const script = document.createElement("script");
      script.async = true;
      script.dataset.shihabAdsense = "1";
      script.src = "https://pagead2.googlesyndication.com/pagead/js/adsbygoogle.js?client=" + encodeURIComponent(client);
      script.crossOrigin = "anonymous";
      document.head.appendChild(script);
    }
    element.innerHTML = "";
    const ins = document.createElement("ins");
    ins.className = "adsbygoogle";
    ins.style.display = "block";
    ins.style.minHeight = "90px";
    ins.dataset.adClient = client;
    ins.dataset.adSlot = slot;
    ins.dataset.adFormat = "auto";
    ins.dataset.fullWidthResponsive = "true";
    element.appendChild(ins);
    try { (window.adsbygoogle = window.adsbygoogle || []).push({}); }
    catch (_) { element.textContent = "AdSense is awaiting site approval or configuration."; }
  }
  window.mountShihabAd = mount;
})();
