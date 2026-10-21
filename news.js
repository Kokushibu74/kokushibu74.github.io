(() => {
  "use strict";
  const grid = document.getElementById("news-grid");
  const status = document.getElementById("news-status");
  const filters = document.getElementById("filters");
  document.getElementById("year").textContent = new Date().getFullYear();
  let items = [], active = "All";
  const esc = v => String(v == null ? "" : v).replace(/[&<>"']/g, c => ({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c]));
  const safe = v => { try { const u = new URL(v); return u.protocol === "https:" ? u.href : "#"; } catch (_) { return "#"; } };
  function render() {
    const visible = (active === "All" ? items : items.filter(x => x.category === active))
      .slice().sort((a,b) => new Date(b.publishedAt || 0) - new Date(a.publishedAt || 0));
    if (!visible.length) { grid.innerHTML = ""; status.textContent = items.length ? "No stories in this category yet." : "No headlines are available yet. The feed updater may still be running."; return; }
    status.textContent = visible.length + " headlines · Sorted by date (newest first) · Last feed update: " + (window.newsUpdatedAt ? new Date(window.newsUpdatedAt).toLocaleString() : "not available") + ".";
    const now = Date.now();
    let previousDate = "";
    const cards = [];
    visible.forEach(x => {
      const date = x.publishedAt ? new Date(x.publishedAt) : null;
      const dateKey = date && !Number.isNaN(date.getTime()) ? date.toLocaleDateString(undefined,{year:"numeric",month:"long",day:"numeric"}) : "Date unavailable";
      if (dateKey !== previousDate) {
        cards.push('<div class="news-date-heading" style="grid-column:1/-1;margin:18px 0 2px;padding:0 0 9px;border-bottom:1px solid #00f2fe35;color:#00f2fe;font:700 12px \'JetBrains Mono\',monospace;letter-spacing:.05em">'+esc(dateKey)+'</div>');
        previousDate = dateKey;
      }
      const age = date ? now - date.getTime() : Infinity;
      const hot = age >= -5*60*1000 && age <= 24*60*60*1000;
      cards.push('<a class="story" href="' + safe(x.link) + '" target="_blank" rel="noopener noreferrer"><span class="tag">' + esc(x.category || "News") + '</span><h2>' + (hot ? '<span aria-label="Hot or recent news" title="Hot / recent" style="margin-right:6px">🔥</span>' : '') + esc(x.title) + '</h2><div class="meta"><span>' + esc(x.source || "Original source") + '</span><span>' + esc(date ? date.toLocaleTimeString([], {hour:"2-digit",minute:"2-digit"}) : "") + '</span></div></a>');
    });
    grid.innerHTML = cards.join("");
  }
  filters.addEventListener("click", e => {
    const button = e.target.closest("button[data-category]");
    if (!button) return;
    active = button.dataset.category;
    filters.querySelectorAll("button").forEach(b => b.classList.toggle("active", b === button));
    render();
  });
  fetch("news-feed.json?updated=" + Date.now(), {cache:"no-store"})
    .then(r => { if (!r.ok) throw new Error("HTTP " + r.status); return r.json(); })
    .then(data => { items = Array.isArray(data.items) ? data.items : []; window.newsUpdatedAt = data.updatedAt; render(); })
    .catch(() => { status.textContent = "Could not load the news feed. It will retry on your next visit."; grid.innerHTML = ""; });
  setInterval(() => location.reload(), 10 * 60 * 1000);
})();
