import assert from "node:assert/strict";
import fs from "node:fs";

const source = fs.readFileSync("cloudflare/portfolio-contact-telegram.js", "utf8");

for (const section of [
  "01/05 · SYSTEM INTELLIGENCE",
  "02/05 · TRAFFIC INTELLIGENCE",
  "03/05 · VISITOR INTELLIGENCE",
  "04/05 · INFRASTRUCTURE INTELLIGENCE",
  "05/05 · SECURITY & ACTION PLAN"
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
assert.match(source, /CF_MONITOR_KV_NAMESPACES\.slice\(start,start\+3\)/, "KV resource analytics must use bounded namespace batches");
assert.match(source, /label:"KV writes \(all 6 namespaces, daily Free allowance\)"/);
assert.match(source, /label:"D1 storage \(account included allowance\)",used:d1Bytes,limit:5368709120/);
assert.match(source, /Showing .* compact profiles of /);
assert.ok(source.includes(".slice(0,20)"), "Visitor details must remain capped at 20 compact profiles");
assert.match(source, /Active duration, exact exit time and scroll duration are not measured|Active duration|not measured/);
assert.match(source, /no external AI API or paid service is called/i);

// Execute the real report builder with representative data, including the maximum 20 visitor cards.
const helperStart = source.indexOf("function dailyReportMarkdownEscape");
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
  resourceSnapshot: {day:"2026-11-03",metrics:[{label:"KV writes (all 6 namespaces, daily Free allowance)",used:250,limit:1000,unit:"operations",percent:25}]}
});
assert.equal(messages.length, 5, "The daily report must create exactly five messages");
for (const message of messages) assert.ok(message.length < 3900, "Each report section must fit in one Telegram message");
assert.ok(messages[2].includes("VIS\\-••••••••0000") || messages[2].includes("VIS-••••••••0000"), "Visitor IDs must remain partially masked after Markdown escaping");
assert.ok(messages[2].includes("Galaxy A34"), "Visitor details must include device information");
assert.ok(messages[2].includes("Dhaka/BD"), "Compact visitor profiles must include location context");
assert.ok(messages[3].includes("6 existing KV namespaces"), "Cloudflare section must show namespace coverage");
assert.ok(messages[4].includes("Content\\-Security\\-Policy") || messages[4].includes("Content-Security-Policy"), "Security section must list missing headers after Markdown escaping");
const unavailableHeaders = buildDailyReportMessages({reportId:"test",stamp:"test",site:"https://example.com",status:null,responseMs:10,failure:"Network timeout",missing:[],headersChecked:false,activity:null,prior:null,ga4:null,ga4Error:"Unavailable",resourceSnapshot:null});
assert.ok(unavailableHeaders[4].includes("Header inspection unavailable"), "Failed site checks must not be mislabeled as healthy security headers");
assert.ok(messages[4].includes("no external AI API or paid service is called"), "Recommendations must disclose their deterministic source");
const hostLimited = buildDailyReportMessages({
  reportId:"host-limit",stamp:"test",site:"https://kokushibu74.github.io/",status:"200",responseMs:100,
  failure:"",missing:[],platformLimitations:["X-Content-Type-Options","X-Frame-Options"],headersChecked:true,
  activity:null,prior:null,ga4:null,ga4Error:"Unavailable",resourceSnapshot:null
});
assert.ok(hostLimited[0].includes("HOST-LIMITED"), "GitHub Pages response-header limits must not be reported as fully healthy");
assert.ok(hostLimited[4].includes("X-Frame-Options"), "Security report must disclose host-managed response-header limitations");

console.log("Five-part Telegram report, delivery retry state, visitor privacy, all six KV namespaces, D1 quota and message-size behavior verified.");
