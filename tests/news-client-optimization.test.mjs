import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const news = readFileSync(new URL("../news.js", import.meta.url), "utf8");
const ticker = readFileSync(new URL("../homepage-news.js", import.meta.url), "utf8");

assert.match(news, /const isLatestBatch=x=>\{const age=ageMinutes\(x\);return age>=-5&&age<=15\}/, "LATEST must remain through the 15-minute publication-age boundary");
assert.match(news, /const isSliderEligibleAge=x=>\{const age=ageMinutes\(x\);return age>=-5&&age<=60\}/, "Bangladesh image slider must include stories through 60 minutes");
assert.match(news, /safe\(x\.link\)!=="#"&&!!String\(x\.previewTitle\|\|x\.title\|\|""\)\.trim\(\)&&previewUrl\(x\)!=="#"/, "Slider must require a Bangladesh story with a usable image preview");
assert.match(news, /return \{item:x,ok:imageOk\}/, "Video-only stories must not qualify for the image slider");
assert.match(news, /function scheduleAgeBoundaryRefresh\(\)[\s\S]*?15\*60\*1000\+1[\s\S]*?60\*60\*1000\+1[\s\S]*?setTimeout\(/, "LATEST and slider eligibility must expire at their exact article-age boundaries");
assert.match(news, /setInterval\(loadNewsFeed,15\*60\*1000\)/, "News page should refresh the shared feed without reloading the full page");
assert.doesNotMatch(news, /setInterval\(\(\)=>location\.reload\(\),15\*60\*1000\)/, "Avoid full page reloads for routine feed refreshes");
assert.match(news, /if\(feedLoading\)return/, "Prevent overlapping feed refreshes");
assert.match(ticker, /fetch\("news-feed\.json",\{cache:"no-cache"\}\)/, "Ticker should revalidate the shared feed without cache-busting query strings");
assert.doesNotMatch(ticker, /news-feed\.json\?updated=/, "Avoid unique cache-busting URLs for the shared feed");

console.log("News client optimization contracts OK.");
