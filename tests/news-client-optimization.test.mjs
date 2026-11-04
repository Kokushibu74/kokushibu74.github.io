import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { isLatestTagItem, isSliderEligibleItem } from "../news-slider-rules.mjs";

const news = readFileSync(new URL("../news.js", import.meta.url), "utf8");
const ticker = readFileSync(new URL("../homepage-news.js", import.meta.url), "utf8");

const now = Date.parse("2026-11-04T12:00:00Z");
const story = (minutes, overrides = {}) => ({
  category: "Bangladesh",
  publishedAt: new Date(now - minutes * 60_000).toISOString(),
  previewImage: "https://images.example/story.jpg",
  ...overrides,
});
assert.equal(isLatestTagItem(story(15), now), true, "LATEST must remain through 15 minutes");
assert.equal(isLatestTagItem(story(16), now), false, "LATEST must disappear after 15 minutes");
assert.equal(isSliderEligibleItem(story(60), now), true, "Slider must include stories through 60 minutes");
assert.equal(isSliderEligibleItem(story(61), now), false, "Slider must exclude stories older than 60 minutes");
assert.equal(isSliderEligibleItem(story(5, { category: "World" }), now), false, "Only Bangladesh stories qualify");
assert.equal(isSliderEligibleItem(story(5, { previewImage: "", videoUrl: "https://video.example/clip.mp4" }), now), false, "Video-only stories do not qualify");
assert.match(news, /safe\(x\.link\)!=="#"&&!!String\(x\.previewTitle\|\|x\.title\|\|""\)\.trim\(\)&&previewUrl\(x\)!=="#"/, "Slider must require a Bangladesh story with a usable image preview");
assert.match(news, /return \{item:x,ok:imageOk\}/, "Video-only stories must not qualify for the image slider");
assert.match(news, /function scheduleAgeBoundaryRefresh\(\)[\s\S]*?15\*60\*1000\+1[\s\S]*?60\*60\*1000\+1[\s\S]*?setTimeout\(/, "LATEST and slider eligibility must expire at their exact article-age boundaries");
assert.match(news, /setInterval\(loadNewsFeed,15\*60\*1000\)/, "News page should refresh the shared feed without reloading the full page");
assert.doesNotMatch(news, /setInterval\(\(\)=>location\.reload\(\),15\*60\*1000\)/, "Avoid full page reloads for routine feed refreshes");
assert.match(news, /if\(feedLoading\)return/, "Prevent overlapping feed refreshes");
assert.match(ticker, /fetch\("news-feed\.json",\{cache:"no-cache"\}\)/, "Ticker should revalidate the shared feed without cache-busting query strings");
assert.doesNotMatch(ticker, /news-feed\.json\?updated=/, "Avoid unique cache-busting URLs for the shared feed");

console.log("News client optimization contracts OK.");
