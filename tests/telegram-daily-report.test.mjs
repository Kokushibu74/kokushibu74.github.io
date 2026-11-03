import assert from "node:assert/strict";
import fs from "node:fs";

const source = fs.readFileSync("cloudflare/portfolio-contact-telegram.js", "utf8");

for (const section of [
  "01/05 · WEBSITE HEALTH & EXECUTIVE SUMMARY",
  "02/05 · GA4 & VISITOR ANALYTICS",
  "03/05 · INDIVIDUAL VISITOR DETAILS",
  "04/05 · CLOUDFLARE RESOURCE USAGE",
  "05/05 · SECURITY ISSUES & AI RECOMMENDATIONS"
]) {
  assert.ok(source.includes(section), "Missing Telegram report section: " + section);
}

assert.match(source, /async function sendTelegramReportBatch/);
assert.match(source, /daily-report:delivery:v2:/);
assert.match(source, /status:sent===messages\.length\?"complete":"partial"/);
assert.match(source, /const daily=hour===23;/);
assert.match(source, /const shouldSendDailyReport=/);
assert.match(source, /text\.length>3900/);
assert.match(source, /parse_mode:"HTML",disable_web_page_preview:true/);

const expectedNamespaces = [
  "370c7ef8d3bd4c678243a2bd2a9c6f8c",
  "431208d4ca2646829178a9dd05f93c2f",
  "474c184970634e54bdf6d9a4cd6632a0",
  "714fabb0634744ee9ee921c02f679f9f",
  "a6cf1ebc4c2e499ca69fa88c10937317",
  "f3333aa713ed4d258ada3b24b6bf2981"
];
for (const id of expectedNamespaces) {
  assert.ok(source.includes(id), "Missing existing KV namespace from resource accounting: " + id);
}
assert.match(source, /CF_MONITOR_KV_NAMESPACES\.flatMap/);
assert.match(source, /label:"KV writes \(all 6 namespaces\)"/);
assert.match(source, /label:"D1 database storage \(per-DB limit\)",used:d1Bytes,limit:524288000/);
assert.match(source, /Profiles shown:/);
assert.match(source, /maximum 20 detailed profiles/);
assert.match(source, /Active duration, exact exit time and scroll duration are not measured|Active duration|not measured/);
assert.match(source, /no external AI API or paid service is called/i);

// Execute the real report builder with representative data, including the maximum 20 visitor cards.
const helperStart = source.indexOf("function dailyReportEscape");
const helperEnd = source.indexOf("async function sendTelegramReportBatch", helperStart);
assert.ok(helperStart >= 0 && helperEnd > helperStart, "Daily report builder helpers must be extractable");
const helperSource = source.slice(helperStart, helperEnd);
const buildDailyReportMessages = new Function("URL", helperSource + "; return buildDailyReportMessages;")(URL);
const visitors = Array.from({length: 20}, (_, index) => ({
  visitorId: "VIS-12345678" + String(index).padStart(4, "0"),
  returning: index % 2 === 0,
  lastSeen: "2026-11-03T09:26:00.000Z",
  sessions: 1,
  pageViews: 2,
  pages: {"/news.html": 2},
  source: {referrer: "https://kokushibu74.github.io/"},
  device: {deviceType: "Mobile", deviceModel: "Galaxy A34", os: "Android", browser: "Chrome"},
  network: {city: "Dhaka", country: "BD", isp: "Info Link"}
}));
const messages = buildDailyReportMessages({
  reportId: "2026-11-03-2300",
  stamp: "03 Nov 2026, 11:00 pm",
  site: "https://kokushibu74.github.io/",
  status: "200",
  responseMs: 229,
  failure: "",
  missing: ["Content-Security-Policy", "X-Content-Type-Options"],
  headersChecked: true,
  activity: {day:"2026-11-03",unique:20,returning:10,sessions:20,views:40,errors:0,partial:false,
    pages:["/news.html (20)"],countries:["BD (20)"],cities:["Dhaka (20)"],devices:["Mobile (20)"],
    browsers:["Chrome (20)"],isps:["Info Link (20)"],visitors},
  prior: {unique:22,sessions:23,views:44},
  ga4: {users:"10",sessions:"20",views:"40",engagement:"0.25"},
  ga4Error: "",
  resourceSnapshot: {day:"2026-11-03",metrics:[{label:"KV writes (all 6 namespaces)",used:250,limit:1000,unit:"operations",percent:25}]}
});
assert.equal(messages.length, 5, "The daily report must create exactly five messages");
for (const message of messages) assert.ok(message.length < 3900, "Each report section must fit in one Telegram message");
assert.ok(messages[2].includes("VIS-••••••••0000"), "Visitor IDs must remain partially masked");
assert.ok(messages[2].includes("Galaxy A34"), "Visitor details must include device information");
assert.ok(messages[2].includes("Info Link"), "Visitor details must include ISP information");
assert.ok(messages[3].includes("all 6 existing namespaces"), "Cloudflare section must show namespace coverage");
assert.ok(messages[4].includes("Content-Security-Policy"), "Security section must list missing headers");
const unavailableHeaders = buildDailyReportMessages({reportId:"test",stamp:"test",site:"https://example.com",status:null,responseMs:10,failure:"Network timeout",missing:[],headersChecked:false,activity:null,prior:null,ga4:null,ga4Error:"Unavailable",resourceSnapshot:null});
assert.ok(unavailableHeaders[4].includes("Header inspection unavailable"), "Failed site checks must not be mislabeled as healthy security headers");
assert.ok(messages[4].includes("no external AI API or paid service is called"), "Recommendations must disclose their deterministic source");

console.log("Five-part Telegram report, delivery retry state, visitor privacy, all six KV namespaces, D1 quota and message-size behavior verified.");
