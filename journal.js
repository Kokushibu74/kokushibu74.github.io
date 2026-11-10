(() => {
  "use strict";
  const section = document.getElementById("developer-journal");
  const articleView = document.getElementById("journal-article-view");
  if (!section || !articleView) return;

  const timeline = document.getElementById("journal-timeline");
  const categoryRoot = document.getElementById("journal-categories");
  const archive = document.getElementById("journal-archive");
  const countNode = document.getElementById("journal-post-count");
  const latestNode = document.getElementById("journal-latest-date");
  const loadMore = document.getElementById("journal-load-more");
  const articleContent = document.getElementById("journal-article-content");
  const progressBar = document.getElementById("journal-reading-progress");
  const originalTitle = document.title;
  const descriptionMeta = document.querySelector('meta[name="description"]');
  const originalDescription = descriptionMeta?.content || "";
  const state = { posts: [], category: "all", month: "all", limit: 6, savedScroll: 0, activeId: null };
  const colors = ["#00e5ff", "#a855f7", "#4facfe", "#f0abfc"];

  const escapeHtml = value => String(value ?? "").replace(/[&<>"']/g, char => ({
    "&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"
  }[char]));

  function safeUrl(value) {
    const raw = String(value || "").trim();
    if (!raw) return "";
    try {
      const url = new URL(raw, location.href);
      if (url.protocol !== "https:" && url.protocol !== "http:") return "";
      if (url.origin !== location.origin && url.protocol !== "https:") return "";
      return url.href;
    } catch { return ""; }
  }

  function dateValue(post) {
    const value = post.publishAt || post.publishedAt || post.createdAt;
    const time = Date.parse(value || "");
    return Number.isFinite(time) ? time : 0;
  }

  function formatDate(value, options = {}) {
    const date = new Date(value || Date.now());
    if (!Number.isFinite(date.getTime())) return "DATE UNAVAILABLE";
    return new Intl.DateTimeFormat("en-GB", {
      timeZone: "Asia/Dhaka",
      day: "2-digit", month: "short", year: "numeric",
      ...(options.time ? { hour: "2-digit", minute: "2-digit", hourCycle: "h23" } : {})
    }).format(date).toUpperCase();
  }

  function monthKey(post) {
    const d = new Date(dateValue(post));
    if (!Number.isFinite(d.getTime())) return "";
    return new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Dhaka", year: "numeric", month: "2-digit" }).format(d);
  }

  function readingMinutes(post) {
    const words = String(post.content || "").trim().split(/\s+/).filter(Boolean).length;
    return Math.max(1, Math.ceil(words / 210));
  }

  function publicPosts() {
    const now = Date.now();
    return state.posts.filter(post => {
      if (!post || post.deletedAt) return false;
      if (post.status === "published") return true;
      return post.status === "scheduled" && dateValue(post) <= now;
    }).sort((a, b) => Number(b.pinned === true) - Number(a.pinned === true) || dateValue(b) - dateValue(a));
  }

  function filteredPosts() {
    return publicPosts().filter(post => {
      const categoryMatch = state.category === "all" || String(post.category || "Development") === state.category;
      const monthMatch = state.month === "all" || monthKey(post) === state.month;
      return categoryMatch && monthMatch;
    });
  }

  function renderFilters(posts) {
    const categories = [...new Set(posts.map(post => String(post.category || "Development")))].sort();
    const options = [{ id: "all", label: "All Posts" }, ...categories.map(value => ({ id: value, label: value }))];
    categoryRoot.innerHTML = options.map(item =>
      '<button class="journal-filter" type="button" data-category="' + escapeHtml(item.id) + '" aria-pressed="' + String(state.category === item.id) + '">' + escapeHtml(item.label) + '</button>'
    ).join("");

    const months = [...new Set(posts.map(monthKey).filter(Boolean))].sort().reverse();
    archive.innerHTML = '<option value="all">All months</option>' + months.map(value => {
      const date = new Date(value + "-01T00:00:00Z");
      const label = new Intl.DateTimeFormat("en-GB", { month: "long", year: "numeric", timeZone: "UTC" }).format(date);
      return '<option value="' + value + '">' + escapeHtml(label) + '</option>';
    }).join("");
    if (state.month !== "all" && !months.includes(state.month)) state.month = "all";
    archive.value = state.month;
  }

  function renderTimeline() {
    const all = publicPosts();
    const filtered = filteredPosts();
    countNode.textContent = String(all.length).padStart(2, "0") + " ARTICLES";
    latestNode.textContent = all.length ? "LATEST · " + formatDate(dateValue(all[0])) : "WAITING FOR FIRST ENTRY";
    renderFilters(all);

    if (!filtered.length) {
      timeline.innerHTML = '<div class="journal-empty">' +
        (all.length ? "No articles match this filter yet." : "The journal is getting ready. New development stories will appear here when published from Telegram.") +
        '</div>';
      loadMore.hidden = true;
      updateTimelineProgress();
      return;
    }

    const shown = filtered.slice(0, state.limit);
    timeline.innerHTML = shown.map((post, index) => {
      const cover = safeUrl(post.coverImage);
      const date = formatDate(dateValue(post), { time: true });
      const image = cover
        ? '<img src="' + escapeHtml(cover) + '" alt="' + escapeHtml(post.title || "Journal cover") + '" loading="lazy" decoding="async">'
        : '<div class="journal-card-placeholder">DEVELOPMENT LOG / ' + String(index + 1).padStart(2, "0") + '</div>';
      return '<article class="journal-card" data-post-id="' + escapeHtml(post.id) + '" tabindex="0" role="button" aria-label="Open article: ' + escapeHtml(post.title) + '" style="--reveal-delay:' + Math.min(index * 65, 260) + 'ms">' +
        '<div class="journal-card-inner">' +
          '<div class="journal-card-copy">' +
            '<div class="journal-card-meta"><time class="journal-date" datetime="' + escapeHtml(post.publishAt || post.publishedAt || "") + '">' + escapeHtml(date) + ' BDT</time>' +
            '<span class="journal-category">' + escapeHtml(post.category || "Development") + '</span>' +
            (post.pinned ? '<span class="journal-pin">PINNED</span>' : '') + '</div>' +
            '<h3>' + escapeHtml(post.title || "Untitled article") + '</h3>' +
            '<p class="journal-card-description">' + escapeHtml(post.description || "") + '</p>' +
            '<div class="journal-card-footer"><span>' + readingMinutes(post) + ' MIN READ</span></div>' +
          '</div>' +
          '<div class="journal-card-media">' + image + '</div>' +
        '</div>' +
      '</article>';
    }).join("");

    loadMore.hidden = filtered.length <= state.limit;
    loadMore.textContent = "LOAD MORE ENTRIES · " + Math.max(0, filtered.length - state.limit);
    observeCards();
    updateTimelineProgress();
  }

  let revealObserver = null;
  function observeCards() {
    const cards = timeline.querySelectorAll(".journal-card");
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) {
      cards.forEach(card => card.classList.add("is-visible"));
      return;
    }
    if (!("IntersectionObserver" in window)) {
      cards.forEach(card => card.classList.add("is-visible"));
      return;
    }
    if (revealObserver) revealObserver.disconnect();
    revealObserver = new IntersectionObserver(entries => {
      entries.forEach(entry => {
        if (entry.isIntersecting) {
          entry.target.classList.add("is-visible");
          revealObserver.unobserve(entry.target);
        }
      });
    }, { threshold: 0.12, rootMargin: "0px 0px -35px 0px" });
    cards.forEach(card => revealObserver.observe(card));
  }

  function updateTimelineProgress() {
    if (timeline && !section.hidden) {
      const rect = timeline.getBoundingClientRect();
      const start = window.innerHeight * 0.82;
      const distance = Math.max(1, timeline.offsetHeight);
      const progress = Math.max(0, Math.min(1, (start - rect.top) / distance));
      timeline.style.setProperty("--line-progress", String(progress));
    }
  }

  function inlineMarkdown(text, excludedImageUrl = "") {
    let html = escapeHtml(text);
    html = html.replace(/!\[([^\]]*)\]\(([^)\s]+)\)/g, (match, alt, rawUrl) => {
      const url = safeUrl(rawUrl);
      // The article cover is already rendered in the header. If the editor
      // also placed that same image at the top of the body, show it only once.
      if (url && excludedImageUrl && url === excludedImageUrl) return "";
      return url ? '<img src="' + escapeHtml(url) + '" alt="' + escapeHtml(alt) + '" loading="lazy" decoding="async">' : escapeHtml(alt);
    });
    html = html.replace(/\[([^\]]+)\]\((https?:\/\/[^)\s]+)\)/g, (match, label, rawUrl) => {
      const url = safeUrl(rawUrl);
      return url ? '<a href="' + escapeHtml(url) + '" target="_blank" rel="noopener noreferrer">' + label + '</a>' : label;
    });
    html = html.replace(/\x60([^\x60]+)\x60/g, "<code>$1</code>");
    html = html.replace(/\*\*([^*]+)\*\*/g, "<strong>$1</strong>");
    html = html.replace(/\*([^*]+)\*/g, "<em>$1</em>");
    return html;
  }

  function renderMarkdown(source, excludedImageUrl = "") {
    const lines = String(source || "").replace(/\r/g, "").split("\n");
    const output = [];
    let paragraph = [], list = [], listType = "", code = [], codeLanguage = "", inCode = false;

    const flushParagraph = () => {
      if (paragraph.length) {
        output.push("<p>" + inlineMarkdown(paragraph.join(" "), excludedImageUrl) + "</p>");
        paragraph = [];
      }
    };
    const flushList = () => {
      if (list.length) {
        const tag = listType === "ol" ? "ol" : "ul";
        output.push("<" + tag + ">" + list.map(item => "<li>" + inlineMarkdown(item, excludedImageUrl) + "</li>").join("") + "</" + tag + ">");
        list = []; listType = "";
      }
    };
    const flushCode = () => {
      const language = escapeHtml(codeLanguage || "code");
      output.push('<pre data-language="' + language + '"><code>' + escapeHtml(code.join("\n")) + '</code></pre>');
      code = []; codeLanguage = ""; inCode = false;
    };

    for (const line of lines) {
      if (line.trim().startsWith("\x60\x60\x60")) {
        flushParagraph(); flushList();
        if (inCode) flushCode();
        else { inCode = true; codeLanguage = line.trim().slice(3).trim().slice(0, 24); }
        continue;
      }
      if (inCode) { code.push(line); continue; }

      const chart = line.trim().match(/^\[\[chart:([a-z0-9_-]{1,40})\]\]$/i);
      if (chart) {
        flushParagraph(); flushList();
        output.push('<figure class="journal-chart" data-journal-chart="' + escapeHtml(chart[1]) + '"><figcaption>Loading chart…</figcaption></figure>');
        continue;
      }
      const heading = line.match(/^(#{1,3})\s+(.+)$/);
      if (heading) {
        flushParagraph(); flushList();
        const level = heading[1].length + 1;
        output.push("<h" + level + ">" + inlineMarkdown(heading[2], excludedImageUrl) + "</h" + level + ">");
        continue;
      }
      if (/^\s*>/.test(line)) {
        flushParagraph(); flushList();
        output.push("<blockquote>" + inlineMarkdown(line.replace(/^\s*>\s?/, "")) + "</blockquote>");
        continue;
      }
      const unordered = line.match(/^\s*[-*+]\s+(.+)$/);
      const ordered = line.match(/^\s*\d+\.\s+(.+)$/);
      if (unordered || ordered) {
        flushParagraph();
        const nextType = ordered ? "ol" : "ul";
        if (listType && listType !== nextType) flushList();
        listType = nextType; list.push((unordered || ordered)[1]);
        continue;
      }
      if (!line.trim()) { flushParagraph(); flushList(); continue; }
      flushList(); paragraph.push(line.trim());
    }
    if (inCode) flushCode();
    flushParagraph(); flushList();
    return output.join("\n");
  }

  function renderChart(figure, chart) {
    if (!chart || !Array.isArray(chart.labels) || !Array.isArray(chart.datasets)) {
      figure.innerHTML = "<figcaption>Chart data unavailable.</figcaption>";
      return;
    }
    const labels = chart.labels.slice(0, 16).map(String);
    const datasets = chart.datasets.slice(0, 4);
    const values = datasets.flatMap(set => (set.data || []).map(Number)).filter(Number.isFinite);
    if (!labels.length || !values.length) { figure.innerHTML = "<figcaption>Chart data unavailable.</figcaption>"; return; }
    const width = 720, height = 310, left = 52, right = 20, top = 28, bottom = 54;
    const plotW = width - left - right, plotH = height - top - bottom;
    const max = Math.max(1, ...values) * 1.15;
    const grid = [0, .25, .5, .75, 1].map(step => {
      const y = top + plotH * (1 - step);
      return '<line x1="' + left + '" y1="' + y + '" x2="' + (width-right) + '" y2="' + y + '" stroke="rgba(142,166,194,.18)" stroke-width="1"/>';
    }).join("");
    let marks = "";
    if (chart.type === "line") {
      datasets.forEach((set, setIndex) => {
        const points = (set.data || []).slice(0, labels.length).map((value, i) => {
          const x = left + (labels.length === 1 ? plotW/2 : i * plotW/(labels.length-1));
          const y = top + plotH - (Number(value)/max)*plotH;
          return [x,y];
        });
        marks += '<polyline fill="none" stroke="' + colors[setIndex % colors.length] + '" stroke-width="4" stroke-linecap="round" stroke-linejoin="round" points="' + points.map(point => point.join(",")).join(" ") + '"/>';
        marks += points.map(point => '<circle cx="' + point[0] + '" cy="' + point[1] + '" r="4.5" fill="' + colors[setIndex % colors.length] + '"/>').join("");
      });
    } else {
      const groupW = plotW / labels.length;
      const barW = Math.max(5, Math.min(28, groupW/(datasets.length+1)));
      datasets.forEach((set, setIndex) => {
        (set.data || []).slice(0, labels.length).forEach((value, i) => {
          const x = left + i*groupW + (groupW - datasets.length*barW)/2 + setIndex*barW;
          const h = Math.max(0, (Number(value)/max)*plotH);
          marks += '<rect x="' + x + '" y="' + (top+plotH-h) + '" width="' + Math.max(2,barW-3) + '" height="' + h + '" rx="4" fill="' + colors[setIndex % colors.length] + '" opacity=".88"/>';
        });
      });
    }
    const labelsSvg = labels.map((label, i) => {
      const x = left + (i+.5)*plotW/labels.length;
      return '<text x="' + x + '" y="' + (height-20) + '" text-anchor="middle">' + escapeHtml(label.slice(0,12)) + '</text>';
    }).join("");
    const legend = datasets.map((set,i) => '<span><i style="background:' + colors[i%colors.length] + '"></i>' + escapeHtml(set.label || "Series "+(i+1)) + '</span>').join("");
    figure.innerHTML = '<h3>' + escapeHtml(chart.title || "Data chart") + '</h3><svg viewBox="0 0 ' + width + ' ' + height + '" role="img" aria-label="' + escapeHtml(chart.title || "Data chart") + '">' + grid + marks + labelsSvg + '</svg><div class="journal-chart-legend">' + legend + '</div>';
  }

  function renderArticle(post) {
    const cover = safeUrl(post.coverImage);
    const charts = Array.isArray(post.charts) ? post.charts : [];
    const meta = '<div class="journal-article-meta"><span class="journal-category">' + escapeHtml(post.category || "Development") + '</span><time class="journal-date">' + escapeHtml(formatDate(dateValue(post), { time: true })) + ' BDT</time><span class="journal-date">' + readingMinutes(post) + ' MIN READ</span></div>';
    const coverHtml = cover ? '<img class="journal-article-cover" src="' + escapeHtml(cover) + '" alt="' + escapeHtml(post.title || "Article cover") + '" loading="eager">' : "";
    articleContent.innerHTML =
      '<header class="journal-article-header">' + meta +
      '<h1>' + escapeHtml(post.title || "Untitled article") + '</h1>' +
      coverHtml + '</header>' +
      '<div class="journal-article-body">' + renderMarkdown(post.content, cover) + '</div>' +
      '<footer class="journal-article-bottom"><span>DEVELOPER JOURNAL · KOKUSHIBU74</span><span>' + escapeHtml(formatDate(dateValue(post))) + ' · BANGLADESH TIME</span></footer>';

    articleContent.querySelectorAll("[data-journal-chart]").forEach(figure => {
      const chart = charts.find(item => item.id === figure.dataset.journalChart);
      renderChart(figure, chart);
    });
    articleContent.querySelectorAll("pre").forEach(pre => {
      const button = document.createElement("button");
      button.type = "button"; button.className = "journal-code-copy"; button.textContent = "COPY";
      button.addEventListener("click", async () => {
        try {
          await navigator.clipboard.writeText(pre.querySelector("code")?.textContent || "");
          button.textContent = "COPIED";
          setTimeout(() => { button.textContent = "COPY"; }, 1400);
        } catch { button.textContent = "SELECT CODE"; }
      });
      pre.append(button);
    });
  }

  function openArticle(id, push = true) {
    const post = publicPosts().find(item => item.id === id);
    if (!post) return;
    if (section.hidden === false) state.savedScroll = window.scrollY;
    state.activeId = id;
    renderArticle(post);
    section.hidden = true;
    articleView.hidden = false;
    document.title = post.title + " | Developer Journal";
    if (descriptionMeta) descriptionMeta.content = String(post.description || originalDescription).slice(0, 300);
    if (push) history.pushState({ journalArticle: id }, "", "#journal/" + encodeURIComponent(id));
    // Keep the reader oriented: open the article where the Journal lives,
    // just below the existing Project Slider, instead of jumping to page top.
    const articleTop = articleView.getBoundingClientRect().top + window.scrollY;
    window.scrollTo({
      top: Math.max(0, articleTop - 14),
      behavior: window.matchMedia("(prefers-reduced-motion: reduce)").matches ? "auto" : "smooth"
    });
    requestAnimationFrame(updateReadingProgress);
  }

  function closeArticle(fromHistory = false) {
    if (articleView.hidden) return;
    articleView.hidden = true;
    section.hidden = false;
    state.activeId = null;
    document.title = originalTitle;
    if (descriptionMeta) descriptionMeta.content = originalDescription;
    if (!fromHistory && location.hash.startsWith("#journal/")) history.replaceState({}, "", location.pathname + location.search);
    window.scrollTo({ top: state.savedScroll, behavior: window.matchMedia("(prefers-reduced-motion: reduce)").matches ? "auto" : "smooth" });
  }

  function updateReadingProgress() {
    if (articleView.hidden) return;
    const rect = articleContent.getBoundingClientRect();
    const total = Math.max(1, articleContent.scrollHeight - window.innerHeight * .65);
    const passed = Math.max(0, Math.min(total, -rect.top + window.innerHeight * .25));
    progressBar.style.transform = "scaleX(" + (passed / total) + ")";
  }

  categoryRoot.addEventListener("click", event => {
    const button = event.target.closest("[data-category]");
    if (!button) return;
    state.category = button.dataset.category;
    state.limit = 6;
    categoryRoot.querySelectorAll("[data-category]").forEach(item => item.setAttribute("aria-pressed", String(item === button)));
    renderTimeline();
  });
  archive.addEventListener("change", () => { state.month = archive.value; state.limit = 6; renderTimeline(); });
  loadMore.addEventListener("click", () => { state.limit += 6; renderTimeline(); });
  timeline.addEventListener("click", event => {
    const card = event.target.closest("[data-post-id]");
    if (card) openArticle(card.dataset.postId);
  });
  timeline.addEventListener("keydown", event => {
    const card = event.target.closest("[data-post-id]");
    if (card && (event.key === "Enter" || event.key === " ")) {
      event.preventDefault(); openArticle(card.dataset.postId);
    }
  });
  articleView.querySelector("[data-journal-back]").addEventListener("click", () => {
    if (location.hash.startsWith("#journal/") && history.state?.journalArticle) history.back();
    else closeArticle(false);
  });
  window.addEventListener("popstate", () => {
    const match = location.hash.match(/^#journal\/([^/]+)$/);
    if (match) openArticle(decodeURIComponent(match[1]), false);
    else closeArticle(true);
  });
  let scrollFrame = 0;
  window.addEventListener("scroll", () => {
    if (scrollFrame) return;
    scrollFrame = requestAnimationFrame(() => {
      scrollFrame = 0;
      updateTimelineProgress();
      updateReadingProgress();
    });
  }, { passive: true });
  window.addEventListener("resize", updateTimelineProgress);

  let publishTimer = null;
  function scheduleNextPublish() {
    if (publishTimer) clearTimeout(publishTimer);
    const next = state.posts.filter(post => !post.deletedAt && post.status === "scheduled")
      .map(dateValue).filter(value => value > Date.now()).sort((a,b) => a-b)[0];
    if (!next) return;
    publishTimer = setTimeout(() => {
      renderTimeline();
      scheduleNextPublish();
    }, Math.min(Math.max(500, next - Date.now() + 500), 2147483647));
  }

  let feedLoading = false;
  let lastFeedLoadAt = 0;
  async function init() {
    if (feedLoading || Date.now() - lastFeedLoadAt < 5000) return;
    feedLoading = true;
    lastFeedLoadAt = Date.now();
    try {
      const response = await fetch("https://portfolio-contact-telegram.mdshihab74.workers.dev/journal-feed?v=" + Date.now(), { cache: "no-store" });
      if (!response.ok) throw new Error("Journal data is not available yet.");
      const data = await response.json();
      if (data.ok !== true || !Array.isArray(data.posts)) throw new Error("Journal feed response is invalid.");
      state.posts = data.posts;
      renderTimeline();
      scheduleNextPublish();
      const match = location.hash.match(/^#journal\/([^/]+)$/);
      if (match) openArticle(decodeURIComponent(match[1]), false);
    } catch (error) {
      timeline.innerHTML = '<div class="journal-empty">Developer Journal could not load. Please try again later.</div>';
      console.error("Developer Journal load failed:", error);
    } finally {
      feedLoading = false;
    }
  }
  init();
  // Refresh after returning to an already-open Projects page so a post
  // published from Telegram appears without requiring a manual reload.
  window.addEventListener("focus", init);
  document.addEventListener("visibilitychange", () => {
    if (!document.hidden) init();
  });
  window.addEventListener("pageshow", event => {
    if (event.persisted) init();
  });
})();