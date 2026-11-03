import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const contact = readFileSync(new URL("../cloudflare/portfolio-contact-telegram.js", import.meta.url), "utf8");
const sports = readFileSync(new URL("../worker/unified-sports-api/src/index.js", import.meta.url), "utf8");

assert.match(contact, /env\.SPORTS_ZONE\.get\("auto:status","json"\)/, "Telegram monitor must read the existing Sports Zone budget status");
assert.match(contact, /const thresholds=\[50,70,85,95\]/, "Budget alerts must use 50/70/85/95 percent thresholds");
assert.match(contact, /resource-alert:youtube:/, "Budget alert deduplication must be persisted");
assert.match(contact, /Math\.ceil\(limit\*p\/100\)/, "Thresholds must round up to a whole request");
assert.match(contact, /cfg\.trafficAlerts/, "Budget alerts must respect the existing traffic alert setting");
assert.match(sports, /const YOUTUBE_BACKOFF_SECONDS = 60 \* 60;/, "YouTube 429 cooldown must be one hour");
assert.match(sports, /auto:youtube-backoff:/, "YouTube backoff must persist across Cron invocations");
assert.match(sports, /error\.status=r\.status/, "YouTube API errors must preserve HTTP status");
assert.match(sports, /YouTube API cooldown active until/, "Cooldown state must be exposed in existing status data");
const cooldownCheck = sports.indexOf("if(Number(backoff?.until)>Date.now())");
const videosRequest = sports.indexOf('youtubeApi(env,"videos"');
assert.ok(cooldownCheck >= 0 && videosRequest > cooldownCheck, "Persisted cooldown must be checked before another YouTube API request");


const rateLimit = contact.indexOf("const CONTACT_RATE_LIMIT_MAX=5,CONTACT_RATE_LIMIT_WINDOW_MS=10*60*1000,TRACK_RATE_LIMIT_MAX=120,TRACK_RATE_LIMIT_WINDOW_MS=60*1000;");
const submitRoute = contact.indexOf('if(new URL(request.url).pathname!=="/submit")');
const rateLimitCall = contact.indexOf('ipRateLimit(request,"contact",CONTACT_RATE_LIMIT_MAX,CONTACT_RATE_LIMIT_WINDOW_MS)', submitRoute);
const formParse = contact.indexOf("request.formData()", submitRoute);
assert.ok(rateLimit >= 0 && rateLimitCall > submitRoute && formParse > rateLimitCall, "Contact submissions must be rate-limited before multipart parsing");
assert.match(contact, /CF-Connecting-IP/, "Contact/API limiter must use Cloudflare trusted client IP header");
assert.match(contact, /ipRateLimit\(request,"track",TRACK_RATE_LIMIT_MAX,TRACK_RATE_LIMIT_WINDOW_MS\)/, "Visitor tracking API must have a per-IP rate limit");
const trackRoute = contact.indexOf('if(pathname==="/track")');
const trackRateCall = contact.indexOf('ipRateLimit(request,"track",TRACK_RATE_LIMIT_MAX,TRACK_RATE_LIMIT_WINDOW_MS)', trackRoute);
const trackConfigRead = contact.indexOf("const botCfg=await botConfig(env)", trackRoute);
assert.ok(trackRateCall >= 0 && trackConfigRead > trackRateCall, "Tracking requests must be rate-limited before reading Bot Config KV");
assert.match(contact, /Retry-After/, "Rate-limited contact and tracking requests must include Retry-After");
assert.match(contact, /Too many contact submissions/, "Contact limiter must return a clear 429 response");
assert.match(contact, /Sports Zone resource budget/, "Daily Telegram report must include the existing Sports Zone budget");
assert.match(contact, /...budgetLines/, "Daily Telegram report must render resource budget metrics");


// Exercise the actual Worker rate-limit helper with a fake Cloudflare request.
const limiterSource = contact.match(/function ipRateLimit\(request,scope,max,windowMs,now=Date\.now\(\)\)\{[\s\S]*?\n\}/);
assert.ok(limiterSource, "Production IP rate-limit helper must be extractable for unit testing");
const ipRateLimit = new Function("CONTACT_RATE_LIMIT", limiterSource[0] + "; return ipRateLimit;")(new Map());
const fakeRequest = ip => ({ headers: { get: name => name === "CF-Connecting-IP" ? ip : null } });
const client = fakeRequest("203.0.113.10");
for (let i = 0; i < 5; i++) assert.equal(ipRateLimit(client, "contact", 5, 600000, 1000 + i).allowed, true);
const blockedContact = ipRateLimit(client, "contact", 5, 600000, 2000);
assert.equal(blockedContact.allowed, false, "Sixth contact submission in 10 minutes must be blocked");
assert.equal(blockedContact.retryAfter, 599, "Blocked contact request must receive an accurate Retry-After window");
for (let i = 0; i < 120; i++) assert.equal(ipRateLimit(client, "track", 120, 60000, 3000 + i).allowed, true);
assert.equal(ipRateLimit(client, "track", 120, 60000, 4000).allowed, false, "121st tracking request in one minute must be blocked");
assert.equal(ipRateLimit(client, "contact", 5, 600000, 601001).allowed, true, "Contact limit must reset after its window expires");
assert.equal(ipRateLimit(fakeRequest(null), "contact", 5, 600000, 700000).allowed, true, "Missing trusted client IP must not create a shared global bucket");


assert.match(contact, /async function newsRefreshWatchdog\(env\)/, "15-minute news watchdog must exist");
assert.match(contact, /actions\/workflows\/update-news\.yml\/runs\?branch=main&per_page=1/, "News watchdog must inspect the latest GitHub workflow run");
assert.match(contact, /actions\/workflows\/update-news\.yml\/dispatches/, "News watchdog must use the existing workflow_dispatch fallback");
assert.match(contact, /news-watchdog:last-dispatch/, "News watchdog must deduplicate dispatches in existing KV");
assert.match(contact, /now-lastDispatch<20\*60\*1000/, "News watchdog must avoid dispatching while a recent run exists");
assert.match(contact, /minute%15===5/, "News watchdog must run five minutes after each scheduled boundary to avoid duplicate dispatch races");
assert.match(contact, /newsRefreshWatchdog\(env\)/, "Minute Cron must invoke the news watchdog on its 15-minute maintenance tick");
assert.match(contact, /notifyNewsWatchdogFailure\(env\)/, "News watchdog failures must send a deduplicated Telegram warning");
assert.match(contact, /let miniAppAuditCache=\{expiresAt:0,rows:\[\]\}/, "Audit list cache must be isolate-local and start empty");
assert.match(contact, /miniAppAuditCache\.expiresAt>now/, "Recent audit reads must reuse the short-lived in-memory cache");
assert.match(contact, /expiresAt:now\+30_000/, "Audit cache must expire within 30 seconds to keep admin logs fresh");

console.log("Resource budgets, YouTube backoff, contact abuse protection, daily reporting, and news watchdog contracts OK.");
