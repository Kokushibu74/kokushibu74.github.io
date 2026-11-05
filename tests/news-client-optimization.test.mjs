import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { isLatestTagItem, isSliderEligibleItem } from "../news-slider-rules.mjs";

const news = readFileSync(new URL("../news.js", import.meta.url), "utf8");
const ticker = readFileSync(new URL("../homepage-news.js", import.meta.url), "utf8");
const page = readFileSync(new URL("../news.html", import.meta.url), "utf8");

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


assert.match(news, /function renderMobileNewsFeed\(pageItems\)/, "Mobile News Feed must use its dedicated reader renderer");
assert.match(news, /function renderNewspaperFeed\(pageItems\)/, "Desktop newspaper must use its dedicated renderer");
assert.match(news, /getBoundingClientRect\(\)\.height/, "Desktop newspaper columns must use actual rendered heights for balancing");
assert.match(news, /newspaper-measure-column/, "Desktop newspaper cards must be measured at the actual column width");
assert.match(news, /column\.getBoundingClientRect\(\)\.height/, "New stories must be assigned to the currently shortest rendered column");
assert.match(news, /newspaperColumnsViewport\.addEventListener\("change"/, "Desktop newspaper lane count must recalculate when crossing the tablet breakpoint");
assert.match(news, /class="mobile-list-story\x27\+\(image===\x22#\x22\?\x27 text-only\x27:/, "Stories without images must render as text-only cards");
assert.match(news, /story\?\.classList\.add\("text-only"\)/, "Failed mobile image loads must convert the story into text-only layout");
assert.match(news, /renderMobileNewsFeed\(pageItems\)/, "Mobile viewport must route feed stories through the dedicated reader");
assert.match(news, /grid\.classList\.add\("mobile-news-feed"\)/, "Mobile feed must apply its own layout class");
assert.match(news, /grid\.classList\.remove\("mobile-news-feed"\)[\s\S]*?grid\.classList\.add\("newspaper-feed"\)/, "Desktop rendering must clear the mobile layout class");
assert.match(page, /news-edition-strip/, "News page must include the editorial edition masthead");
assert.match(page, /@media\(max-width:600px\)[\s\S]*?mobile-news-feed/, "Mobile reader styles must be isolated to small screens");
assert.match(page, /#news-grid\.grid\.newspaper-feed/, "Desktop newspaper layout rules must be present");
assert.match(page, /@media\(min-width:601px\) and \(max-width:1100px\)/, "Tablet newspaper layout must have its own two-column breakpoint");


const taxonomy = JSON.parse(readFileSync(new URL("../news-categories.json", import.meta.url), "utf8"));
assert.deepEqual(Object.keys(taxonomy.categories).sort(), ["Bangladesh", "Technology", "World"]);
assert.ok(Object.values(taxonomy.categories).every(topics => topics.length === 5), "Each main category must expose five subcategories");
assert.equal(taxonomy.defaultSubcategory, "Other / Unclassified");
assert.match(page, /id="subcategories"/, "News page must expose the subcategory navigation root");
assert.match(news, /function renderSubcategoryFilters\(scoped\)/, "Subcategory navigation must be generated from scoped feed items");
assert.match(news, /activeSubcategory==="All"\|\|getSubcategory\(x\)===activeSubcategory/, "Subcategory selection must filter the news feed");
assert.match(news, /data-subcategory/, "Subcategory controls must have delegated click targets");
assert.match(news, /getSubcategory\(item\)/, "Mobile and desktop renderers must display the assigned subcategory");
assert.match(news, /news-categories\.json/, "The News module must load the shared category taxonomy");
assert.match(page, /news\.js\?v=30/, "News module cache must be refreshed after category navigation changes");

console.log("News client optimization contracts OK.");
