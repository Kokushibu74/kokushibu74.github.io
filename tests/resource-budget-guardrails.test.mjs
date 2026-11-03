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

console.log("Resource budget and YouTube backoff contracts OK.");
