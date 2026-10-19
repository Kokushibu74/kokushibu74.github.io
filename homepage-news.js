(() => {
  "use strict";
  const styles = `
    #live-news-preview{margin-top:2rem;border:1px solid rgba(255,255,255,.1);border-radius:24px;padding:clamp(18px,4vw,30px);background:linear-gradient(135deg,rgba(13,17,26,.94),rgba(8,12,22,.88))}
    #live-news-preview .ln-head{display:flex;align-items:center;justify-content:space-between;gap:12px;flex-wrap:wrap;margin-bottom:18px}
    #live-news-preview .ln-kicker{font:700 10px 'JetBrains Mono',monospace;letter-spacing:.2em;color:#00f2fe}
    #live-news-preview .ln-grid{display:grid;grid-template-columns:repeat(auto-fit,minmax(min(100%,230px),1fr));gap:12px}
    #live-news-preview .ln-card{display:block;padding:16px;border:1px solid rgba(255,255,255,.09);border-radius:16px;background:rgba(255,255,255,.025);text-decoration:none;transition:.2s}
    #live-news-preview .ln-card:hover{border-color:rgba(0,242,254,.5);transform:translateY(-3px)}
    #live-news-preview .ln-cat{font:10px 'JetBrains Mono',monospace;color:#00f2fe;text-transform:uppercase}
    #live-news-preview .ln-title{font-weight:700;color:#f5f7fc;font-size:14px;line-height:1.6;margin:9px 0}
    #live-news-preview .ln-meta{font-size:11px;color:#8993a7}
    #live-news-preview .ln-ad{margin-top:18px;min-height:80px;display:flex;align-items:center;justify-content:center;border:1px dashed rgba(255,255,255,.12);border-radius:12px;color:#64748b;font:10px 'JetBrains Mono',monospace}
    #live-news-preview .ln-link{color:#00f2fe;font-size:12px;font-weight:700;text-decoration:none}
  `;
  function addNews() {
    const root = document.getElementById("sections-wrapper");
    if (!root || document.getElementById("live-news-preview")) return;
    const section = document.createElement("section");
    section.id = "live-news-preview";
    section.innerHTML = '<div class="ln-head"><div><p class="ln-kicker">LIVE / NEWS DESK</p><h2 style="font-size:clamp(25px,4vw,38px);font-weight:900;margin-top:8px">Latest <span style="color:#00f2fe">headlines.</span></h2></div><a class="ln-link" href="news.html">ALL NEWS ↗</a></div><p id="ln-status" class="ln-meta" aria-live="polite">Loading latest headlines…</p><div id="ln-grid" class="ln-grid"></div><div class="ln-ad" aria-label="Advertisement">ADVERTISEMENT · AdSense placement (requires publisher setup)</div>';
    const contact = root.querySelector("#contact");
    if (contact) root.insertBefore(section, contact); else root.appendChild(section);
    fetch("news-feed.json?updated=" + Date.now(), {cache:"no-store"})
      .then(r => { if (!r.ok) throw new Error("Feed not ready"); return r.json(); })
      .then(data => {
        const items = (data.items || []).slice(0, 6);
        const grid = document.getElementById("ln-grid");
        const status = document.getElementById("ln-status");
        if (!items.length) { status.textContent = "The news feed is being prepared. Please check back soon."; return; }
        status.textContent = "Updated " + new Date(data.updatedAt || Date.now()).toLocaleString() + " · Headlines open at their original sources.";
        grid.innerHTML = items.map(item => '<a class="ln-card" href="' + safe(item.link) + '" target="_blank" rel="noopener noreferrer"><span class="ln-cat">' + esc(item.category || "News") + '</span><div class="ln-title">' + esc(item.title) + '</div><div class="ln-meta">' + esc(item.source || "News source") + (item.publishedAt ? " · " + esc(new Date(item.publishedAt).toLocaleDateString()) : "") + '</div></a>').join("");
      })
      .catch(() => { const s = document.getElementById("ln-status"); if (s) s.textContent = "News feed will appear after the scheduled feed updater runs."; });
  }
  function esc(v) { return String(v || "").replace(/[&<>"']/g, c => ({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c])); }
  function safe(v) { try { const u = new URL(v); return u.protocol === "https:" ? u.href : "#"; } catch (_) { return "#"; } }
  const style = document.createElement("style"); style.textContent = styles; document.head.appendChild(style);
  const observer = new MutationObserver(() => { if (document.getElementById("sections-wrapper")?.children.length) addNews(); });
  observer.observe(document.documentElement, {childList:true,subtree:true});
  if (document.readyState !== "loading") addNews(); else document.addEventListener("DOMContentLoaded", addNews);
})();
