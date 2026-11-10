import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const projects = readFileSync(new URL("../projects.html", import.meta.url), "utf8");
const journal = readFileSync(new URL("../journal.js", import.meta.url), "utf8");
const styles = readFileSync(new URL("../journal.css", import.meta.url), "utf8");
const worker = readFileSync(new URL("../cloudflare/portfolio-contact-telegram.js", import.meta.url), "utf8");
const miniapp = readFileSync(new URL("../miniapp/app.js", import.meta.url), "utf8");
const manager = readFileSync(new URL("../cloudflare/blog-manager.mjs", import.meta.url), "utf8");

test("Developer Journal is inserted after the existing Project Slider", () => {
  const slider = projects.indexOf('id="project-gallery"');
  const dots = projects.indexOf('id="gallery-dots"');
  const journalSection = projects.indexOf('id="developer-journal"');
  assert.ok(slider >= 0 && dots > slider && journalSection > dots);
  assert.match(projects, /id="journal-article-view"/);
  assert.match(projects, /journal\.css\?v=1/);
  assert.match(projects, /journal\.js\?v=1/);
});

test("Project Slider keyboard, swipe and carousel logic remain present", () => {
  assert.match(projects, /function layoutCards\(index,animate=true\)/);
  assert.match(projects, /pointerdown/);
  assert.match(projects, /pointerup/);
  assert.match(projects, /ArrowRight/);
  assert.match(projects, /ArrowLeft/);
  assert.match(projects, /function go\(i\)/);
});

test("Journal cards open the full article without a separate read-more control", () => {
  assert.match(journal, /data-post-id/);
  assert.match(journal, /function openArticle/);
  assert.match(journal, /history\.pushState/);
  assert.doesNotMatch(journal, /Read More|Read Story|OPEN JOURNAL/i);
});

test("Timeline supports reveal, reduced motion, filters, archive and scheduled publishing", () => {
  assert.match(journal, /IntersectionObserver/);
  assert.match(journal, /prefers-reduced-motion/);
  assert.match(journal, /data-category/);
  assert.match(journal, /journal-archive/);
  assert.match(journal, /scheduleNextPublish/);
  assert.match(styles, /journal-card:hover/);
  assert.match(styles, /@media\(max-width:700px\)/);
  assert.match(styles, /@media\(prefers-reduced-motion:reduce\)/);
});

test("Telegram Mini App and Worker expose authenticated Blog Manager actions", () => {
  for (const action of ["blogList", "blogSave", "blogUpload", "blogDelete", "blogRestore"]) {
    assert.ok(worker.includes('action==="' + action + '"'), "Missing Worker action " + action);
  }
  assert.match(worker, /ADMIN_TELEGRAM_IDS/);
  assert.match(worker, /listJournalPosts/);
  assert.match(miniapp, /Developer Journal/);
  assert.match(miniapp, /api\("blogSave"/);
  assert.match(miniapp, /api\("blogDelete"/);
  assert.match(miniapp, /api\("blogRestore"/);
  assert.match(miniapp, /timeZone:"Asia\/Dhaka"/);
  assert.match(miniapp, /\+06:00/);
  assert.match(journal, /timeZone: "Asia\/Dhaka"/);
  assert.match(journal, /portfolio-contact-telegram\.mdshihab74\.workers\.dev\/journal-feed/);
  assert.doesNotMatch(journal, /journal-data\.json/);
  assert.match(worker, /pathname===\"\/journal-feed\"/);
  assert.match(worker, /getPublicJournalFeed/);
  const feedStart = worker.indexOf('if(pathname==="/journal-feed"');
  const feedEnd = worker.indexOf('if(pathname==="/miniapp/api"', feedStart);
  const feedRoute = worker.slice(feedStart, feedEnd);
  assert.match(feedRoute, /return respond\\(\\{ok:true,posts\\}\\)/);
  assert.doesNotMatch(feedRoute, /caches\\.default\\.(match|put)/, "Public feed must not serve a stale edge-cached post list.");
  assert.match(manager, /AES-256-GCM/);
  assert.match(manager, /JOURNAL_ENCRYPTION_KEY/);
  assert.match(manager, /status: "published"/);
  assert.match(miniapp, /Draft text, scheduled posts and Trash stay AES-GCM encrypted/);
});

console.log("Developer Journal UI, interaction and Telegram integration contracts passed.");
