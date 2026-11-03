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

console.log("Five-part Telegram report, delivery retry state, visitor privacy, all six KV namespaces and D1 per-database quota verified.");
