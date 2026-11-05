import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const worker = readFileSync(new URL("../cloudflare/portfolio-contact-telegram.js", import.meta.url), "utf8");
const news = readFileSync(new URL("../news.js", import.meta.url), "utf8");
const newsHtml = readFileSync(new URL("../news.html", import.meta.url), "utf8");
const tracker = readFileSync(new URL("../visitor-tracking.js", import.meta.url), "utf8");
const sharedShell = readFileSync(new URL("../shared-shell.js", import.meta.url), "utf8");

test("deployed User Manager hotfixes are preserved in the repository source", () => {
  assert.match(worker, /const UM_PREFIX = "um:v1:"/);
  assert.match(worker, /function umClean\(/);
  assert.match(worker, /function umDate\(/);
  assert.match(worker, /pending\?\.mode && !String\(msg\.text\|\|""\)\.trim\(\)\.startsWith\("\/"\)/);
});

test("location context returns only coarse IP location and is read-only", () => {
  const start = worker.indexOf('if(pathname==="/location-context")');
  const end = worker.indexOf('if(pathname==="/location-consent")', start);
  assert.ok(start >= 0 && end > start);
  const route = worker.slice(start, end);
  assert.match(route, /request\.method!=="GET"/);
  assert.match(route, /city:clean\(cf\.city\)/);
  assert.match(route, /region:clean\(cf\.region\)/);
  assert.match(route, /country:clean\(cf\.country/);
  assert.doesNotMatch(route, /latitude|longitude/);
});

test("GPS history requires separate consent, validates coordinates and expires after 90 days", () => {
  const start = worker.indexOf('if(pathname==="/location-history")');
  const end = worker.indexOf('if(pathname==="/location-delete-request")', start);
  assert.ok(start >= 0 && end > start);
  const route = worker.slice(start, end);
  assert.match(route, /consent\?\.consent!==true/);
  assert.match(route, /Number\.isFinite\(latitude\)/);
  assert.match(route, /Number\.isFinite\(longitude\)/);
  assert.match(route, /accuracy<0\|\|accuracy>100000/);
  assert.match(route, /loc:v1:history:visitor:/);
  assert.match(route, /capturedAtUtc/);
  assert.match(route, /capturedAtBdt/);
  assert.match(route, /accuracyMeters/);
  assert.match(route, /source:"browser-geolocation"/);
  assert.match(route, /locality:null/);
  assert.match(route, /expirationTtl:7776000/);
});

test("history is append-only and visitor deletion requests are recorded and notified", () => {
  assert.match(worker, /String\(now\)\.padStart\(13,"0"\)\+":"\+salt/);
  assert.match(worker, /if\(pathname==="\/location-delete-request"\)/);
  assert.match(worker, /scope:"gps-location-history-only"/);
  assert.match(worker, /adminNotified/);
});

test("Visitor Intelligence inserts GPS history immediately after IP Location", () => {
  const start = worker.indexOf("function umVisitorReport");
  const end = worker.indexOf("async function umHandleCommand", start);
  const report = worker.slice(start, end);
  const location = report.indexOf('section("01"');
  const history = report.indexOf('section("01A","🗺️","LOCATION HISTORY"');
  const device = report.indexOf('section("02"');
  assert.ok(location >= 0 && history > location && device > history);
  assert.match(report, /https:\/\/www\.google\.com\/maps\?q=/);
  assert.match(report, /authorized Telegram admins/);
  assert.match(worker, /unavailable:true/);
  assert.match(report, /GPS History temporarily unavailable/);
});

test("User Directory Visitor IDs are clickable callback buttons with pagination", () => {
  assert.match(worker, /callback_data:"b1:users:visitor:"/);
  assert.ok(worker.includes('await umReply(env,chatId,body,keyboard,{parse_mode:"MarkdownV2"});'));
  assert.ok(worker.includes("const mdSafe="));
  assert.match(worker, /if\(action\.startsWith\("users:visitor:"\)\)/);
  assert.ok(worker.includes('callback_data:"b1:users:visitor:"+String(u.id)+":1:"+pageNo'));
  assert.ok(worker.includes('callback_data:"b1:users:list:"+directoryPage'));
  assert.match(worker, /if\(action==="users:list"\|\|action\.startsWith\("users:list:"\)\)/);
  assert.ok(worker.includes("if(!/^VIS-[A-F0-9]{12}$/.test(id))"));
  assert.match(worker, /if\(query\.message\?\.chat\?\.type!=="private"\|\|!admins\.has\(sender\)\)/);
});

test("Visitor identity wait resolves the stored identity without recursive self-calls", () => {
  const start = news.indexOf("const waitForVisitorIdentity=async()=>{");
  const end = news.indexOf("const locationPost=", start);
  assert.ok(start >= 0 && end > start);
  const helper = news.slice(start, end);
  assert.match(helper, /const identity=visitorIdentity\(\)/);
  assert.doesNotMatch(helper, /await waitForVisitorIdentity\(\)/);
  assert.match(helper, /if\(!response\?\.ok\)return null/);
});

test("News Page uses one transparent consent popup, records only after browser permission, and keeps the default feed on failure", () => {
  assert.ok(tracker.includes("window.__K74_TRACKING_READY__"));
  assert.ok(tracker.includes("send(data,true)"));
  assert.ok(sharedShell.includes("visitor-tracking.js?v=3"));
  assert.ok(newsHtml.includes("shared-shell.js?v=8"));
  assert.ok(tracker.includes("k74:visitor-tracked"));
  assert.match(news, /navigator\.geolocation\.getCurrentPosition/);
  assert.match(news, /locationAllow\.addEventListener\("click",requestLocation\)/);
  assert.match(news, /locationNotNow\.addEventListener\("click"/);
  assert.match(news, /revokeLocationConsent/);
  assert.match(news, /consent:false,policyVersion:"2026-11-06"/);
  assert.match(news, /navigator\.permissions\?\.query/);
  assert.match(news, /LOCATION_CONSENT_COOKIE/);
  assert.match(news, /locationPost\("\/location-consent",\{\.\.\.identity,consent:true/);
  assert.match(news, /locationPost\("\/location-history",payload\)/);
  assert.match(news, /locationContext=null;render\(\)/);
  assert.match(news, /rankNewsByLocation\(visible,locationContext\)/);
  assert.match(newsHtml, /id="news-location-modal"[^>]*role="dialog"[^>]*aria-modal="true"/);
  assert.match(newsHtml, />Allow<\/button>/);
  assert.match(newsHtml, />Not now<\/button>/);
  assert.doesNotMatch(newsHtml, /অনুমোদিত Telegram Admin-দের জন্য সর্বোচ্চ ৯০ দিন সংরক্ষিত থাকবে/, "visitor-facing consent popup must not disclose internal record-retention details");
  assert.match(newsHtml, /পরবর্তী ভিজিটে ব্রাউজারের অনুমতি চালু থাকলে নতুন লোকেশন রেকর্ড হতে পারে/);
  assert.doesNotMatch(newsHtml, /news-location-settings-trigger|news-history-delete|Refresh Nearby News|Location History Settings/);
  assert.doesNotMatch(tracker, /navigator\.geolocation/);
});
