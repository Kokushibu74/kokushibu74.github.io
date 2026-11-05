import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const worker = readFileSync(new URL("../cloudflare/portfolio-contact-telegram.js", import.meta.url), "utf8");
const news = readFileSync(new URL("../news.js", import.meta.url), "utf8");
const newsHtml = readFileSync(new URL("../news.html", import.meta.url), "utf8");
const tracker = readFileSync(new URL("../visitor-tracking.js", import.meta.url), "utf8");

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
});

test("User Directory Visitor IDs are clickable callback buttons with pagination", () => {
  assert.match(worker, /callback_data:"b1:users:visitor:"/);
  assert.match(worker, /if\(action\.startsWith\("users:visitor:"\)\)/);
  assert.match(worker, /if\(action==="users:list"\|\|action\.startsWith\("users:list:"\)\)/);
  assert.match(worker, /!\/^VIS-\[A-F0-9\]\{12\}\$\//);
  assert.match(worker, /if\(query\.message\?\.chat\?\.type!=="private"\|\|!admins\.has\(sender\)\)/);
});

test("News Page requests GPS only after a user click and preserves default feed on failure", () => {
  assert.match(tracker, /window\\.__K74_TRACKING_READY__/);
  assert.match(tracker, /k74:visitor-tracked/);
  assert.match(news, /navigator\.geolocation\.getCurrentPosition/);
  assert.match(news, /locationAllow\.addEventListener\("click",requestLocation\)/);
  assert.match(news, /locationContext=null;render\(\)/);
  assert.match(news, /historyConsent==="yes"/);
  assert.match(news, /rankNewsByLocation\(visible,locationContext\)/);
  assert.match(newsHtml, /আপনার এলাকার খবর দেখতে চান\?/);
  assert.match(newsHtml, /GPS History is stored only if you separately consent/);
});
