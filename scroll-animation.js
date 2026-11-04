/* True bidirectional, scroll-driven portfolio build animation.
   The page is progressively revealed from the existing DOM; scrolling backward
   reverses every reveal and cursor task. */
(() => {
  "use strict";

  const root = document.documentElement;
  const reduceMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  if (reduceMotion) {
    root.classList.remove("scroll-build-pending");
    document.getElementById("scroll-build-overlay")?.remove();
    return;
  }

  const clamp = (value, min, max) => Math.min(max, Math.max(min, value));
  const smooth = value => {
    const t = clamp(value, 0, 1);
    return t * t * (3 - 2 * t);
  };
  const $ = (selector, scope = document) => scope.querySelector(selector);

  function releaseSafely() {
    root.classList.remove("scroll-build-pending");
    document.getElementById("scroll-build-overlay")?.remove();
    if (window.__scrollBuildBootTimer) clearTimeout(window.__scrollBuildBootTimer);
  }

  function waitForPortfolio() {
    let observer;
    let started = false;
    const attempt = () => {
      if (started) return;
      const home = $("#home");
      const brand = $("#nav-brand-intro");
      const footer = $("footer.social-footer");
      const main = $("#sections-wrapper");
      if (!home || !brand || !footer || !main) return;
      started = true;
      if (observer) observer.disconnect();
      initialize({ home, brand, footer, main });
    };

    attempt();
    if (started) return;
    window.addEventListener("portfolio:rendered", attempt);
    observer = new MutationObserver(attempt);
    observer.observe(document.body, { childList: true, subtree: true });
    window.setTimeout(() => {
      if (!started) {
        if (observer) observer.disconnect();
        window.removeEventListener("portfolio:rendered", attempt);
        releaseSafely();
      }
    }, 11000);
  }

  function initialize(elements) {
    if (window.__scrollAnimationStarted) return;
    const overlay = $("#scroll-build-overlay");
    const origin = $("#scroll-build-s", overlay || document);
    if (!overlay || !origin) {
      releaseSafely();
      return;
    }

    window.__scrollAnimationStarted = true;
    if (window.__scrollBuildBootTimer) clearTimeout(window.__scrollBuildBootTimer);

    const { home, brand, footer, main } = elements;
    const header = $("body > header");
    const canvas = $("#homepage-energy-canvas");
    const navLinks = $("#nav-links");
    const clock = $("#nav-digital-clock");
    const whatsapp = $("#top-wa-btn");
    const brandInitial = $("#nav-name .nav-initial-letter") || $("#nav-name span");

    // A short, invisible scroll runway gives the build enough room on desktop
    // while keeping the footer as the final physical destination.
    let track = $("#scroll-build-track");
    if (!track) {
      track = document.createElement("div");
      track.id = "scroll-build-track";
      track.setAttribute("aria-hidden", "true");
      track.style.cssText = "height:clamp(260px,58vh,620px);width:100%;pointer-events:none;visibility:hidden";
      if (main.nextElementSibling === footer) main.parentNode.insertBefore(track, footer);
      else footer.parentNode.insertBefore(track, footer);
    }
    const trackStyle = document.createElement("style");
    trackStyle.id = "scroll-build-responsive-track";
    trackStyle.textContent = "@media(max-width:640px){#scroll-build-track{height:clamp(150px,30vh,270px)!important}}";
    document.head.appendChild(trackStyle);

    const style = document.createElement("style");
    style.id = "scroll-animation-engine-styles";
    style.textContent = [
      "#scroll-build-overlay{opacity:1;transition:opacity .08s linear}",
      "#scroll-build-overlay .sb-cursor{position:absolute;left:0;top:0;width:26px;height:34px;opacity:0;will-change:transform,opacity;filter:drop-shadow(0 0 7px rgba(0,242,254,.65))}",
      "#scroll-build-overlay .sb-cursor svg{display:block;width:23px;height:29px;overflow:visible}",
      "#scroll-build-overlay .sb-cursor-label{position:absolute;left:18px;top:19px;padding:4px 7px;border:1px solid rgba(0,242,254,.34);border-radius:6px;background:rgba(5,7,15,.9);color:#c7fbff;font:700 8px/1.2 'JetBrains Mono',monospace;letter-spacing:.08em;white-space:nowrap;box-shadow:0 0 15px rgba(0,242,254,.13)}",
      "#scroll-build-overlay .sb-cursor[data-kind='type'] svg path{fill:#00f2fe;stroke:#e7fdff}",
      "#scroll-build-overlay .sb-cursor[data-kind='layout'] svg path{fill:#a78bfa;stroke:#f5efff}",
      "#scroll-build-overlay .sb-cursor[data-kind='media'] svg path{fill:#4facfe;stroke:#eaf7ff}",
      "#scroll-build-overlay .sb-cursor[data-kind='nav'] svg path{fill:#22d3ee;stroke:#e5fcff}",
      "#scroll-build-overlay .sb-trail{position:absolute;left:0;top:0;width:36px;height:2px;transform-origin:left center;border-radius:4px;background:linear-gradient(90deg,rgba(0,242,254,.75),rgba(127,0,255,0));opacity:0;will-change:transform,opacity}",
      "@media(max-width:640px){#scroll-build-overlay .sb-cursor{width:22px;height:28px}#scroll-build-overlay .sb-cursor svg{width:20px;height:25px}#scroll-build-overlay .sb-cursor-label{font-size:7px;padding:3px 5px;left:15px;top:17px}}"
    ].join("\n");
    document.head.appendChild(style);

    const pointerSvg = '<svg viewBox="0 0 24 30" aria-hidden="true"><path d="M2.2 1.7v23.1l6.1-5.9 4.2 9 4-1.9-4.1-9.1h8.1L2.2 1.7z" fill="#00f2fe" stroke="#e8fdff" stroke-width="1.15" stroke-linejoin="round"/></svg>';
    const mobile = window.matchMedia("(max-width:640px)").matches;
    const cursorDefs = mobile ? [
      { label: "TYPE", kind: "type", path: [["#nav-name .nav-initial-letter", .14], ["#home > div:first-child > div:first-child", .31], ["#home h1", .45], ["#home h1 + p", .56], ["footer.social-footer h2", .84]] },
      { label: "LAYOUT", kind: "layout", path: [["#nav-name .nav-initial-letter", .14], ["#nav-links", .25], ["#home h1 + p + div", .62], ["footer.social-footer nav.social-icon-row", .90]] },
      { label: "MEDIA", kind: "media", path: [["#nav-name .nav-initial-letter", .14], ["#home > div:nth-child(2)", .48], ["#home .neon-inner-img", .62], ["#footer-bottom-bar", .96]] }
    ] : [
      { label: "TYPE", kind: "type", path: [["#nav-name .nav-initial-letter", .14], ["#home > div:first-child > div:first-child", .30], ["#home h1", .44], ["#home h1 + p", .56], ["footer.social-footer h2", .84]] },
      { label: "LAYOUT", kind: "layout", path: [["#nav-name .nav-initial-letter", .14], ["#nav-links", .25], ["#home h1 + p + div", .62], ["footer.social-footer nav.social-icon-row", .90]] },
      { label: "MEDIA", kind: "media", path: [["#nav-name .nav-initial-letter", .14], ["#home > div:nth-child(2)", .48], ["#home .neon-inner-img", .62], ["footer.social-footer nav.social-icon-row", .91]] },
      { label: "NAV", kind: "nav", path: [["#nav-name .nav-initial-letter", .14], ["#nav-digital-clock", .26], ["#home h1 + p + div + div", .70], ["#footer-bottom-bar nav", .96]] },
      { label: "BUILD", kind: "layout", path: [["#nav-name .nav-initial-letter", .14], ["#home > div:first-child > p", .36], ["#home .glass-card", .67], ["#footer-bottom-bar", .97]] }
    ];

    const cursors = [];
    const trails = [];
    cursorDefs.forEach(def => {
      const node = document.createElement("div");
      node.className = "sb-cursor";
      node.dataset.kind = def.kind;
      node.innerHTML = pointerSvg + '<span class="sb-cursor-label"></span>';
      $(".sb-cursor-label", node).textContent = def.label;
      overlay.appendChild(node);
      cursors.push({ node, def, active: null });
      const trail = document.createElement("span");
      trail.className = "sb-trail";
      overlay.appendChild(trail);
      trails.push(trail);
    });

    const revealSpecs = [
      [brand, .09, .19, "brand"],
      [$("#nav-name .nav-initial-letter"), .14, .18, "normal"],
      [$("#nav-name .nav-name-rest"), .16, .24, "normal"],
      [navLinks, .19, .32, "normal"],
      [clock, .20, .33, "normal"],
      [whatsapp, .22, .35, "normal"],
      [home, .19, .27, "container"],
      [$("#home > div:first-child > div:first-child"), .25, .36, "normal"],
      [$("#home > div:first-child > p"), .31, .42, "normal"],
      [$("#home h1"), .38, .53, "normal"],
      [$("#home h1 + p"), .49, .62, "normal"],
      [$("#home h1 + p + div"), .57, .70, "normal"],
      [$("#home h1 + p + div + div"), .65, .77, "normal"],
      [$("#home > div:nth-child(2)"), .43, .73, "visual"],
      [footer, .77, .88, "footer"],
      [$("footer.social-footer h2"), .80, .89, "normal"],
      [$("footer.social-footer nav.social-icon-row"), .86, .95, "normal"],
      [$("#footer-bottom-bar"), .92, .995, "normal"]
    ].filter(item => item[0]);

    const revealStates = revealSpecs.map(([element, start, end, kind]) => ({
      element, start, end, kind, last: -1
    }));

    let lastPointer = { x: window.innerWidth * .5, y: window.innerHeight * .62 };
    const rememberPointer = event => {
      if (Number.isFinite(event.clientX) && Number.isFinite(event.clientY)) {
        lastPointer = { x: event.clientX, y: event.clientY };
      }
    };
    window.addEventListener("pointermove", rememberPointer, { passive: true });
    window.addEventListener("pointerdown", rememberPointer, { passive: true });

    const pointFor = selector => {
      const element = $(selector);
      if (!element || !element.getClientRects().length) return null;
      const rect = element.getBoundingClientRect();
      if (!Number.isFinite(rect.left) || !Number.isFinite(rect.top)) return null;
      return {
        x: clamp(rect.left + rect.width * .5, 12, window.innerWidth - 12),
        y: clamp(rect.top + rect.height * .5, 18, window.innerHeight - 18),
        rect,
        element
      };
    };

    const pathPoint = (path, progress) => {
      const points = path.map(([selector, at]) => {
        const point = pointFor(selector);
        return point ? { ...point, at } : null;
      }).filter(Boolean);
      if (!points.length) return null;
      if (progress <= points[0].at) return points[0];
      if (progress >= points[points.length - 1].at) return points[points.length - 1];
      let index = 0;
      while (index < points.length - 1 && progress > points[index + 1].at) index++;
      const a = points[index];
      const b = points[index + 1];
      const local = smooth((progress - a.at) / Math.max(.001, b.at - a.at));
      return {
        x: a.x + (b.x - a.x) * local,
        y: a.y + (b.y - a.y) * local,
        element: local < .5 ? a.element : b.element
      };
    };

    const setImportant = (element, property, value) => {
      if (element) element.style.setProperty(property, value, "important");
    };

    function updateReveal(progress) {
      setImportant(header, "visibility", "visible");
      setImportant(main, "visibility", "visible");
      setImportant(footer, "visibility", "visible");
      setImportant(home, "visibility", "visible");
      if (canvas) {
        setImportant(canvas, "visibility", "visible");
        canvas.style.opacity = String(smooth((progress - .08) / .23) * .98);
      }

      const headerAlpha = smooth((progress - .13) / .16);
      if (header) {
        setImportant(header, "background-color", "rgba(5,7,11," + (headerAlpha * .85).toFixed(3) + ")");
        setImportant(header, "border-bottom-color", "rgba(255,255,255," + (headerAlpha * .10).toFixed(3) + ")");
        setImportant(header, "backdrop-filter", "blur(" + (headerAlpha * 16).toFixed(1) + "px)");
        setImportant(header, "-webkit-backdrop-filter", "blur(" + (headerAlpha * 16).toFixed(1) + "px)");
      }

      revealStates.forEach(state => {
        const amount = state.kind === "container" ? 1 : smooth((progress - state.start) / (state.end - state.start));
        const el = state.element;
        setImportant(el, "visibility", "visible");
        el.style.opacity = String(amount);
        if (state.kind === "normal" || state.kind === "brand") {
          el.style.clipPath = "inset(0 0 " + ((1 - amount) * 100).toFixed(2) + "% 0)";
          el.style.transform = "translate3d(0," + ((1 - amount) * (state.kind === "brand" ? 8 : 18)).toFixed(1) + "px,0)";
        } else if (state.kind === "visual") {
          el.style.clipPath = "inset(0 0 " + ((1 - amount) * 100).toFixed(2) + "% 0)";
          el.style.transform = "translate3d(0," + ((1 - amount) * 22).toFixed(1) + "px,0) scale(" + (0.97 + amount * .03).toFixed(3) + ")";
        } else if (state.kind === "footer") {
          el.style.opacity = String(amount);
        } else {
          el.style.opacity = "1";
        }
        state.last = amount;
      });

      const ready = progress >= .9995;
      [header, main, footer].forEach(el => {
        if (!el) return;
        if (ready) {
          el.removeAttribute("inert");
          el.removeAttribute("aria-hidden");
        } else {
          el.setAttribute("inert", "");
          el.setAttribute("aria-hidden", "true");
        }
      });
      if (ready) root.classList.remove("scroll-build-pending");
      else root.classList.add("scroll-build-pending");
    }

    function updateOrigin(progress) {
      const target = brandInitial ? pointFor("#nav-name .nav-initial-letter") || pointFor("#nav-name") : null;
      const startX = window.innerWidth * .5;
      const startY = window.innerHeight * .49;
      const end = target || { x: 90, y: 35 };
      const travel = smooth((progress - .055) / .095);
      const x = startX + (end.x - startX) * travel;
      const y = startY + (end.y - startY) * travel;
      const scale = 1 - travel * .70;
      origin.style.transform = "translate3d(" + x + "px," + y + "px,0) translate(-50%,-50%) scale(" + scale.toFixed(3) + ")";
      origin.style.opacity = String(1 - smooth((progress - .125) / .035));
    }

    function updateCursors(progress) {
      const fusion = smooth((progress - .955) / .045);
      cursors.forEach((cursor, index) => {
        const point = pathPoint(cursor.def.path, progress);
        if (!point) {
          cursor.node.style.opacity = "0";
          trails[index].style.opacity = "0";
          return;
        }
        const visible = smooth((progress - .115) / .055) * (1 - smooth((progress - .985) / .015));
        const spread = (index - (cursors.length - 1) / 2) * (mobile ? 2 : 3);
        const x = point.x + (lastPointer.x - point.x) * fusion + spread;
        const y = point.y + (lastPointer.y - point.y) * fusion + spread;
        cursor.node.style.transform = "translate3d(" + x + "px," + y + "px,0) scale(" + (1 - fusion * .48).toFixed(3) + ")";
        cursor.node.style.opacity = String(visible);
        const angle = Math.atan2(y - point.y, x - point.x);
        trails[index].style.transform = "translate3d(" + point.x + "px," + point.y + "px,0) rotate(" + angle + "rad) scaleX(" + (clamp(Math.hypot(x - point.x, y - point.y), 0, 48) / 36).toFixed(3) + ")";
        trails[index].style.opacity = String(visible * .34 * (1 - fusion));
      });
    }

    let raf = 0;
    let lastProgress = -1;
    function render() {
      raf = 0;
      const maxScroll = Math.max(1, document.documentElement.scrollHeight - window.innerHeight);
      const progress = clamp(window.scrollY / maxScroll, 0, 1);
      if (Math.abs(progress - lastProgress) < .0001) return;
      lastProgress = progress;
      updateReveal(progress);
      updateOrigin(progress);
      updateCursors(progress);
    }

    function requestRender() {
      if (!raf) raf = requestAnimationFrame(render);
    }

    function resetToTopOnRestore() {
      if (window.scrollY > 0) {
        const previous = root.style.scrollBehavior;
        root.style.scrollBehavior = "auto";
        window.scrollTo(0, 0);
        root.style.scrollBehavior = previous;
      }
      lastProgress = -1;
      requestRender();
    }

    window.addEventListener("scroll", requestRender, { passive: true });
    window.addEventListener("resize", requestRender, { passive: true });
    window.addEventListener("pageshow", resetToTopOnRestore, { once: true });
    window.addEventListener("pagehide", () => {
      if (raf) cancelAnimationFrame(raf);
    }, { once: true });

    // A fresh page load always starts from the single S, including restored tabs.
    if (window.scrollY > 0) {
      const previous = root.style.scrollBehavior;
      root.style.scrollBehavior = "auto";
      window.scrollTo(0, 0);
      root.style.scrollBehavior = previous;
    }
    updateReveal(0);
    updateOrigin(0);
    updateCursors(0);
    requestRender();
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", waitForPortfolio, { once: true });
  } else {
    waitForPortfolio();
  }
})();