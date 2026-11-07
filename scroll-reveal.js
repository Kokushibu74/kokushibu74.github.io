/* Mobile scroll reveal: once per element, low-overhead and safe for dynamic sections. */
(() => {
  'use strict';

  const mobile = window.matchMedia('(max-width: 767px)');
  const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)');
  if (!mobile.matches || reducedMotion.matches || !('IntersectionObserver' in window)) return;

  const selector = [
    'main > section:not(.hero)',
    'main section:not(.hero)',
    'main article',
    'main .panel',
    'main [class*="card"]',
    'main .step',
    'main .social-link'
  ].join(',');

  const observer = new IntersectionObserver((entries) => {
    entries.forEach((entry) => {
      if (!entry.isIntersecting) return;
      entry.target.classList.add('is-scroll-visible');
      observer.unobserve(entry.target);
    });
  }, {
    root: null,
    rootMargin: '0px 0px -6% 0px',
    threshold: 0.08
  });

  const seenParents = new WeakMap();

  function prepare(root) {
    if (!root || root.nodeType !== 1) return;
    const candidates = [];
    if (root.matches && root.matches(selector)) candidates.push(root);
    if (root.querySelectorAll) candidates.push(...root.querySelectorAll(selector));

    candidates.forEach((element) => {
      if (element.hasAttribute('data-scroll-reveal')) return;
      if (element.closest('.hero, .ex-hero, .news-hero-layout, #home, [hidden], [aria-hidden="true"]')) return;

      const parent = element.parentElement;
      const count = parent ? (seenParents.get(parent) || 0) : 0;
      if (parent) seenParents.set(parent, count + 1);
      element.style.setProperty('--scroll-reveal-delay', Math.min(count % 4, 3) * 55 + 'ms');
      element.setAttribute('data-scroll-reveal', '');
      observer.observe(element);
    });
  }

  function revealAll() {
    document.querySelectorAll('[data-scroll-reveal]').forEach((element) => {
      element.classList.add('is-scroll-visible');
      observer.unobserve(element);
    });
  }

  prepare(document.querySelector('main'));
  const main = document.querySelector('main');
  if (main && 'MutationObserver' in window) {
    const mutations = new MutationObserver((records) => {
      records.forEach((record) => {
        record.addedNodes.forEach((node) => {
          if (node.nodeType === 1) prepare(node);
        });
      });
    });
    mutations.observe(main, { childList: true, subtree: true });
  }

  if (reducedMotion.addEventListener) reducedMotion.addEventListener('change', (event) => {
    if (event.matches) revealAll();
  });
})();
