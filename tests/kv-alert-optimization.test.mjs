import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const worker = readFileSync("cloudflare/portfolio-contact-telegram.js", "utf8");
const html = readFileSync("index.html", "utf8");

function section(start, end) {
  const a = worker.indexOf(start);
  assert.ok(a >= 0, "Missing source section: " + start);
  const b = worker.indexOf(end, a + start.length);
  assert.ok(b > a, "Missing section boundary: " + end);
  return worker.slice(a, b);
}

const history = section("async function umHistory", "async function umTelegramTouch");
assert.match(history, /sampled=kind==="visitor"/, "Visitor page-view history must be sampled");
assert.match(history, /15\*60\*1000/, "Visitor event history must coalesce within 15-minute slots");
assert.match(history, /retentionSeconds=kind==="admin"\?365\*86400:90\*86400/, "Admin history must retain 365 days and routine user history 90 days");

const tracking = section('const profileKey="visitor:"+id;', 'const reportDay=bdDay(now)');
assert.match(tracking, /profileSchemaVersion:2/, "Visitor profile consolidation must be versioned");
assert.match(tracking, /old\.customId\|\|userManagerOld\?\.customId/, "Custom IDs must survive legacy profile consolidation");
assert.match(tracking, /delete\(userManagerProfileKey\)/, "Old duplicate User Manager profile must be removed after migration");
assert.doesNotMatch(tracking, /put\(UM_PREFIX\+"visitor:"\+id/, "New tracking events must not write a second visitor profile");
assert.match(tracking, /expirationTtl:90\*86400/, "Daily visitor aggregates must expire after 90 days");

const menu = section("async function botMarkMenuInteraction", "async function botEnsureStartKeyboard");
assert.match(menu, /now-last<30_000/, "Duplicate callback activity writes must be suppressed for 30 seconds");
assert.match(menu, /nextBusy/, "Busy-state transitions must still be persisted");

const cron = section("async function miniAppCronRecord", "async function miniAppCronAlert");
assert.match(cron, /expirationTtl:14\*86400/, "Cron records must retain 14 days");
assert.match(cron, /MINIAPP_CRON_INDEX_KEY.*14\*86400/s, "Cron index must retain 14 days");
const scheduled = section('const cronStartedAt=Date.now()', 'const cfg=await botConfig(env)');
assert.doesNotMatch(scheduled, /miniAppCronRecord/, "Scheduled runs must not write a redundant running-state record");
assert.match(worker, /const cutoff=Date\.now\(\)-14\*86400000/, "Cron history view must use a 14-day window");

assert.match(worker, /if\(minute%5===0\)/, "News watchdog must check every five minutes");
assert.match(worker, /age<15\*60\*1000/, "News refresh watchdog must recover stale feeds after 15 minutes");
assert.match(worker, /auditTtl=3\*86400/, "Rejected-news audit retention must be three days");
assert.match(worker, /NEWS_ALERT_TTL=14\*86400/, "Sent alert deduplication/history must retain 14 days");

const security = section("async function inspectPortfolioSecurity", "function dailyReportRecommendations");
assert.match(security, /content-security-policy/, "Security check must inspect CSP header/meta policy");
assert.match(security, /referrerMeta/, "Security check must inspect Referrer Policy meta");
assert.match(security, /platformLimitations/, "GitHub Pages response-header limitations must be explicit");
assert.match(html, /http-equiv="Content-Security-Policy"/, "Portfolio must include a browser-enforced CSP meta policy");
assert.match(html, /name="referrer" content="strict-origin-when-cross-origin"/, "Portfolio must include a Referrer Policy meta policy");

console.log("KV history, Visitor profile consolidation, callback write throttling, news watchdog and host-aware security checks verified.");
