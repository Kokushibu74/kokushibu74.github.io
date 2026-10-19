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
    const visible = active === "All" ? items : items.filter(x => x.category === active);
    if (!visible.length) { grid.innerHTML = ""; status.textContent = items.length ? "No stories in this category yet." : "No headlines are available yet. The feed updater may still be running."; return; }
    status.textContent = visible.length + " headlines · Last feed update: " + (window.newsUpdatedAt ? new Date(window.newsUpdatedAt).toLocaleString() : "not available") + ".";
    grid.innerHTML = visible.map(x => '<a class="story" href="' + safe(x.link) + '" target="_blank" rel="noopener noreferrer"><span class="tag">' + esc(x.category || "News") + '</span><h2>' + esc(x.title) + '</h2><div class="meta"><span>' + esc(x.source || "Original source") + '</span><span>' + esc(x.publishedAt ? new Date(x.publishedAt).toLocaleDateString() : "") + ' ↗</span></div></a>').join("");
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
