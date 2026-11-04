import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const news = readFileSync(new URL("../news.js", import.meta.url), "utf8");
const ticker = readFileSync(new URL("../homepage-news.js", import.meta.url), "utf8");

assert.match(news, /const isLatestBatch=x=>\{const age=ageMinutes\(x\);return age>=-5&&age<15\}/, "LATEST must expire 15 minutes after each article publication");
assert.match(news, /const isSliderEligibleAge=x=>\{const age=ageMinutes\(x\);return age>=-5&&age<30\}/, "Bangladesh media slider must expire 30 minutes after each article publication");
assert.match(news, /setInterval\(loadNewsFeed,15\*60\*1000\)/, "News page should refresh the shared feed without reloading the full page");
assert.doesNotMatch(news, /setInterval\(\(\)=>location\.reload\(\),15\*60\*1000\)/, "Avoid full page reloads for routine feed refreshes");
assert.match(news, /if\(feedLoading\)return/, "Prevent overlapping feed refreshes");
assert.match(ticker, /fetch\("news-feed\.json",\{cache:"no-cache"\}\)/, "Ticker should revalidate the shared feed without cache-busting query strings");
assert.doesNotMatch(ticker, /news-feed\.json\?updated=/, "Avoid unique cache-busting URLs for the shared feed");

console.log("News client optimization contracts OK.");
