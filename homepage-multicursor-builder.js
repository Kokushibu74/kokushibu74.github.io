/* Scroll-controlled multi-cursor portfolio builder.
   Visual-only layer: real page content and DOM order are never rearranged. */
(() => {
  "use strict";
  const reduceMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  if (reduceMotion || window.__homepageMultiCursorBuilder) return;
  window.__homepageMultiCursorBuilder = true;

  const $ = (selector, root = document) => root.querySelector(selector);
  const clamp = (value, min, max) => Math.min(max, Math.max(min, value));
  const smooth = value => { const t = clamp(value, 0, 1); return t * t * (3 - 2 * t); };

  function waitForPortfolio() {
    if ($("#home") && $("#nav-name")) return initialize();
    window.addEventListener("portfolio:rendered", initialize, { once: true });
    const observer = new MutationObserver(() => {
      if ($("#home") && $("#nav-name")) { observer.disconnect(); initialize(); }
    });
    observer.observe(document.body, { childList: true, subtree: true });
    window.setTimeout(() => observer.disconnect(), 12000);
  }

  function initialize() {
    if (window.__homepageMultiCursorInitialized) return;
    const home = $("#home"), navName = $("#nav-name"), footer = $("footer.social-footer");
    if (!home || !navName || !footer) return;
    window.__homepageMultiCursorInitialized = true;

    // site.js can replace the original nested spans with plain text; restore
    // accessible initial/rest spans so the travelling S has a precise landing point.
    const fullName = (navName.textContent || "SHIHABUL ISLAM").trim();
    const nameWrap = document.createElement("span");
    nameWrap.className = "social-footer-title mc-brand-name";
    const initial = document.createElement("span");
    initial.className = "mc-brand-initial";
    initial.textContent = fullName.charAt(0) || "S";
    const rest = document.createElement("span");
    rest.className = "mc-brand-rest";
    rest.textContent = fullName.slice(1);
    nameWrap.append(initial, rest);
    navName.replaceChildren(nameWrap);
    navName.setAttribute("aria-label", fullName);

    const style = document.createElement("style");
    style.id = "homepage-multicursor-builder-styles";
    style.textContent = `
      #homepage-multicursor-layer{position:fixed;inset:0;z-index:99960;pointer-events:none;overflow:hidden;isolation:isolate;contain:layout style}
      #homepage-multicursor-layer *{box-sizing:border-box}
      .mc-origin{position:absolute;left:0;top:0;transform:translate(-50%,-50%);font:900 clamp(58px,11vw,116px)/1 'Outfit',sans-serif;letter-spacing:-.08em;color:#00f2fe;text-shadow:0 0 12px rgba(0,242,254,.85),0 0 38px rgba(0,242,254,.48),0 0 72px rgba(127,0,255,.32);will-change:transform,opacity;white-space:nowrap}
      .mc-origin:after{content:"";position:absolute;inset:-18% -28%;z-index:-1;border-radius:50%;background:radial-gradient(ellipse,rgba(0,242,254,.16),rgba(127,0,255,.08) 42%,transparent 72%);filter:blur(13px)}
      .mc-brand-name{display:inline;background:linear-gradient(90deg,#fff,#00f2fe,#a78bfa,#fff);background-size:220% auto;-webkit-background-clip:text;background-clip:text;color:transparent;animation:footerTextShine 7s linear infinite}
      .mc-brand-initial,.mc-brand-rest{display:inline}
      .mc-brand-initial{position:relative}
      .mc-brand-initial.mc-name-landed{text-shadow:0 0 12px rgba(0,242,254,.72),0 0 24px rgba(127,0,255,.35)}
      .mc-cursor{position:absolute;left:0;top:0;width:26px;height:34px;opacity:0;will-change:transform,opacity;filter:drop-shadow(0 0 7px rgba(0,242,254,.62))}
      .mc-cursor svg{display:block;width:23px;height:29px;overflow:visible}
      .mc-cursor-label{position:absolute;left:18px;top:19px;padding:4px 7px;border:1px solid rgba(0,242,254,.35);border-radius:6px;background:rgba(5,7,15,.88);color:#bffaff;font:700 8px/1.2 'JetBrains Mono',monospace;letter-spacing:.09em;white-space:nowrap;box-shadow:0 0 15px rgba(0,242,254,.12)}
      .mc-cursor[data-kind="type"] svg path{fill:#00f2fe;stroke:#d9fdff}
      .mc-cursor[data-kind="layout"] svg path{fill:#a78bfa;stroke:#f1eaff}
      .mc-cursor[data-kind="media"] svg path{fill:#4facfe;stroke:#e5f5ff}
      .mc-cursor[data-kind="nav"] svg path{fill:#22d3ee;stroke:#e0fcff}
      .mc-cursor[data-kind="footer"] svg path{fill:#c084fc;stroke:#f5eaff}
      .mc-target-active{position:relative;outline:1px solid rgba(0,242,254,.62)!important;outline-offset:5px;border-radius:5px;filter:drop-shadow(0 0 9px rgba(0,242,254,.18))}
      .mc-typing-caret{position:absolute;left:0;top:0;width:2px;height:18px;border-radius:2px;background:#bdfaff;box-shadow:0 0 9px #00f2fe,0 0 20px rgba(127,0,255,.55);opacity:0;will-change:transform,opacity}
      .mc-trail{position:absolute;left:0;top:0;width:34px;height:2px;transform-origin:left center;border-radius:4px;background:linear-gradient(90deg,rgba(0,242,254,.65),rgba(127,0,255,0));opacity:0;will-change:transform,opacity}
      #homepage-multicursor-layer.mc-complete .mc-cursor{opacity:0!important;transition:opacity .32s ease}
      #homepage-multicursor-layer.mc-complete .mc-origin{opacity:0!important;transition:opacity .25s ease}
      @media(max-width:640px){.mc-origin{top:0;font-size:clamp(54px,18vw,82px);text-shadow:0 0 10px rgba(0,242,254,.8),0 0 26px rgba(0,242,254,.35)}.mc-cursor-label{font-size:7px;padding:3px 5px;left:15px;top:17px}.mc-cursor svg{width:20px;height:25px}.mc-target-active{outline-offset:3px}}
      @media(prefers-reduced-motion:reduce){#homepage-multicursor-layer{display:none!important}}
    `;
    document.head.appendChild(style);

    const layer = document.createElement("div");
    layer.id = "homepage-multicursor-layer";
    layer.setAttribute("aria-hidden", "true");
    const origin = document.createElement("div");
    origin.className = "mc-origin";
    origin.textContent = "S";
    layer.appendChild(origin);
    const caret = document.createElement("span");
    caret.className = "mc-typing-caret";
    layer.appendChild(caret);

    const isMobile = window.matchMedia("(max-width: 640px)").matches;
    const definitions = isMobile ? [
      { label: "TYPING", kind: "type", path: [["#nav-name .mc-brand-initial", .10], ["#home > div:first-child > div:first-child", .23], ["#home h1", .39], ["#home h1 + p", .52], ["footer.social-footer h2", .84]] },
      { label: "LAYOUT", kind: "layout", path: [["#nav-name .mc-brand-initial", .10], ["#home .neon-ring-wrapper", .30], ["#home a[href='projects.html']", .48], ["footer.social-footer nav.social-icon-row", .87]] },
      { label: "BUILD", kind: "media", path: [["#nav-name .mc-brand-initial", .10], ["#home .glass-card", .36], ["footer.social-footer nav.social-icon-row a.social-action:nth-child(3)", .90], ["#footer-bottom-bar", .97]] }
    ] : [
      { label: "TYPING", kind: "type", path: [["#nav-name .mc-brand-initial", .10], ["#home > div:first-child > div:first-child", .22], ["#home h1", .38], ["#home h1 + p", .50], ["footer.social-footer h2", .83]] },
      { label: "LAYOUT", kind: "layout", path: [["#nav-name .mc-brand-initial", .10], ["#home .neon-ring-wrapper", .28], ["#home a[href='projects.html']", .47], ["footer.social-footer nav.social-icon-row", .86]] },
      { label: "MEDIA", kind: "media", path: [["#nav-name .mc-brand-initial", .10], ["#home .neon-inner-img", .34], ["#home .glass-card", .54], ["footer.social-footer nav.social-icon-row a.social-action:nth-child(4)", .90]] },
      { label: "NAV", kind: "nav", path: [["#nav-name .mc-brand-initial", .10], ["#nav-links", .19], ["#home .font-mono", .59], ["#footer-bottom-bar nav", .94]] },
      { label: "FOOTER", kind: "footer", path: [["#nav-name .mc-brand-initial", .10], ["footer.social-footer h2", .78], ["footer.social-footer nav.social-icon-row", .88], ["#footer-text", .97]] }
    ];

    const pointerSvg = '<svg viewBox="0 0 24 30" aria-hidden="true"><path d="M2.2 1.7v23.1l6.1-5.9 4.2 9 4-1.9-4.1-9.1h8.1L2.2 1.7z" fill="#00f2fe" stroke="#e8fdff" stroke-width="1.15" stroke-linejoin="round"/></svg>';
    const cursors = [], trails = [];
    definitions.forEach(def => {
      const node = document.createElement("div");
      node.className = "mc-cursor";
      node.dataset.kind = def.kind;
      node.innerHTML = pointerSvg + '<span class="mc-cursor-label"></span>';
      $(".mc-cursor-label", node).textContent = def.label;
      layer.appendChild(node);
      cursors.push({ node, def, active: null });
      const trail = document.createElement("span");
      trail.className = "mc-trail";
      layer.appendChild(trail);
      trails.push(trail);
    });
    document.body.appendChild(layer);

    let targetProgress = 0, displayProgress = 0, raf = 0, completed = false, finishTimer = 0;
    let lastPointer = { x: window.innerWidth * .5, y: window.innerHeight * .55 };
    const trackPointer = event => {
      if (typeof event.clientX === "number" && typeof event.clientY === "number") lastPointer = { x: event.clientX, y: event.clientY };
      else if (event.touches && event.touches[0]) lastPointer = { x: event.touches[0].clientX, y: event.touches[0].clientY };
    };
    window.addEventListener("mousemove", trackPointer, { passive: true });
    window.addEventListener("touchstart", trackPointer, { passive: true });

    function pointFor(selector) {
      const element = $(selector);
      if (!element || !element.getClientRects().length) return null;
      const rect = element.getBoundingClientRect();
      if (!Number.isFinite(rect.left) || !Number.isFinite(rect.top)) return null;
      return { x: clamp(rect.left + rect.width * .5, 14, window.innerWidth - 14), y: clamp(rect.top + rect.height * .5, 24, window.innerHeight - 24), rect, element };
    }
    function resolvePath(def) {
      return def.path.map(([selector, at]) => {
        const point = pointFor(selector);
        return point ? { ...point, at, selector } : null;
      }).filter(Boolean);
    }
    function interpolatePath(path, progress) {
      if (!path.length) return null;
      if (progress <= path[0].at) return path[0];
      if (progress >= path[path.length - 1].at) return path[path.length - 1];
      let index = 0;
      while (index < path.length - 1 && progress > path[index + 1].at) index++;
      const a = path[index], b = path[index + 1];
      const local = smooth((progress - a.at) / Math.max(.001, b.at - a.at));
      return { x: a.x + (b.x - a.x) * local, y: a.y + (b.y - a.y) * local, rect: local < .5 ? a.rect : b.rect, element: local < .5 ? a.element : b.element, selector: local < .5 ? a.selector : b.selector, local };
    }
    function setActive(cursor, element) {
      if (cursor.active && cursor.active !== element) cursor.active.classList.remove("mc-target-active");
      cursor.active = element || null;
      if (cursor.active) cursor.active.classList.add("mc-target-active");
    }
    function updateOrigin(progress) {
      const target = pointFor("#nav-name .mc-brand-initial");
      const start = { x: window.innerWidth * .5, y: window.innerHeight * (isMobile ? .43 : .48) };
      const end = target || { x: 80, y: 40 };
      const travel = smooth(progress / .105);
      const x = start.x + (end.x - start.x) * travel, y = start.y + (end.y - start.y) * travel;
      origin.style.transform = "translate3d(" + x + "px," + y + "px,0) translate(-50%,-50%) scale(" + (1 - travel * .72) + ")";
      origin.style.opacity = String(1 - smooth((progress - .075) / .045));
      if (progress >= .105 && target) target.element.classList.add("mc-name-landed");
    }
    function updateCaret(cursor, point, progress) {
      if (cursor.def.kind !== "type" || !point || !point.rect || progress < .18 || progress > .86) { caret.style.opacity = "0"; return; }
      const rect = point.rect, local = point.local == null ? .5 : point.local;
      const x = clamp(rect.left + Math.max(8, rect.width * local), 8, window.innerWidth - 8);
      const y = clamp(rect.top + rect.height * .72, 18, window.innerHeight - 18);
      caret.style.transform = "translate3d(" + x + "px," + y + "px,0)";
      caret.style.height = clamp(rect.height * .45, 12, 28) + "px";
      caret.style.opacity = "1";
    }
    function render() {
      raf = 0;
      if (completed) return;
      const delta = targetProgress - displayProgress;
      displayProgress += delta * .16;
      if (Math.abs(delta) < .001) displayProgress = targetProgress;
      const progress = displayProgress;
      updateOrigin(progress);
      const fusion = smooth((progress - .965) / .035), destination = lastPointer;

      cursors.forEach((cursor, index) => {
        const path = resolvePath(cursor.def), point = interpolatePath(path, progress);
        if (!point) { cursor.node.style.opacity = "0"; return; }
        const active = progress >= .12 && point.element ? point.element : null;
        setActive(cursor, active);
        const spread = (index - (cursors.length - 1) / 2) * 3;
        const x = point.x + (destination.x - point.x) * fusion + spread;
        const y = point.y + (destination.y - point.y) * fusion + spread;
        const visible = smooth((progress - .085) / .055) * (1 - smooth((progress - .985) / .015));
        cursor.node.style.transform = "translate3d(" + x + "px," + y + "px,0) scale(" + (1 - fusion * .45) + ")";
        cursor.node.style.opacity = String(visible);
        const trail = trails[index], angle = Math.atan2(y - point.y, x - point.x);
        trail.style.transform = "translate3d(" + point.x + "px," + point.y + "px,0) rotate(" + angle + "rad) scaleX(" + (clamp(Math.hypot(x - point.x, y - point.y), 0, 48) / 34) + ")";
        trail.style.opacity = String(visible * .38 * (1 - fusion));
        if (cursor.def.kind === "type") updateCaret(cursor, point, progress);
      });

      if (progress >= .999 && targetProgress >= .999) {
        completed = true;
        layer.classList.add("mc-complete");
        caret.style.opacity = "0";
        cursors.forEach(cursor => { if (cursor.active) cursor.active.classList.remove("mc-target-active"); });
        $("#nav-name .mc-brand-initial")?.classList.remove("mc-name-landed");
        finishTimer = window.setTimeout(() => {
          layer.remove(); style.remove();
          window.removeEventListener("mousemove", trackPointer);
          window.removeEventListener("touchstart", trackPointer);
          window.removeEventListener("scroll", onScroll);
          window.removeEventListener("resize", requestRender);
        }, 520);
        return;
      }
      if (Math.abs(targetProgress - displayProgress) >= .001) raf = requestAnimationFrame(render);
    }
    function requestRender() { if (!completed && !raf) raf = requestAnimationFrame(render); }
    function onScroll() {
      if (completed) return;
      const maxScroll = Math.max(1, document.documentElement.scrollHeight - window.innerHeight);
      targetProgress = Math.max(targetProgress, clamp(window.scrollY / maxScroll, 0, 1));
      requestRender();
    }
    window.addEventListener("scroll", onScroll, { passive: true });
    window.addEventListener("resize", requestRender, { passive: true });
    updateOrigin(0);
    if (window.scrollY > 0) {
      targetProgress = clamp(window.scrollY / Math.max(1, document.documentElement.scrollHeight - window.innerHeight), 0, 1);
      requestRender();
    }
    window.addEventListener("pagehide", () => {
      if (raf) cancelAnimationFrame(raf);
      window.clearTimeout(finishTimer);
    }, { once: true });
  }

  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", waitForPortfolio, { once: true });
  else waitForPortfolio();
})();