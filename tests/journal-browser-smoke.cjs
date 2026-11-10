const { chromium } = require("playwright");
const assert = require("node:assert/strict");

const fence = String.fromCharCode(96).repeat(3);
const tick = String.fromCharCode(96);
const articleBody = [
  "![Cover image](https://example.com/journal-cover.jpg)",
  "# Browser test section",
  "This article checks **bold text**, inline " + tick + "code" + tick + " and responsive reading.",
  fence + "js",
  "const answer = 42;",
  fence,
  "[[chart:traffic]]"
].join(String.fromCharCode(10));

const samplePost = {
  id: "browser_test_20261109",
  title: "Browser Smoke Test Article",
  description: "A temporary in-memory article used to test the live journal interface.",
  category: "Development",
  content: articleBody,
  charts: [{
    id: "traffic",
    title: "Monthly visitors",
    type: "bar",
    labels: ["Jan", "Feb"],
    datasets: [{ label: "Visitors", data: [120, 180] }]
  }],
  coverImage: "https://example.com/journal-cover.jpg",
  pinned: false,
  status: "published",
  publishAt: "2026-11-09T12:00:00.000Z"
};

(async () => {
  const browser = await chromium.launch({ headless: true, args: ["--no-sandbox"] });
  try {
    const page = await browser.newPage({ viewport: { width: 1440, height: 1000 } });
    const pageErrors = [];
    page.on("pageerror", error => pageErrors.push(error.message));
    await page.route("**/journal-feed*", route => route.fulfill({
      status: 200,
      headers: {
        "content-type": "application/json",
        "access-control-allow-origin": "https://kokushibu74.github.io"
      },
      body: JSON.stringify({ ok: true, posts: [samplePost] })
    }));

    const response = await page.goto("https://kokushibu74.github.io/projects.html", {
      waitUntil: "domcontentloaded",
      timeout: 60000
    });
    assert.ok(response && response.ok(), "Live Project page should load");
    await page.waitForSelector("#developer-journal", { timeout: 30000 });
    await page.waitForSelector(".journal-card", { timeout: 30000 });

    const card = page.locator(".journal-card").first();
    await card.scrollIntoViewIfNeeded();
    await page.waitForFunction(() => document.querySelector(".journal-card")?.classList.contains("is-visible"));
    const revealClass = await card.getAttribute("class");
    assert.match(revealClass, /is-visible/, "Timeline card should reveal on scroll");

    const surface = card.locator(".journal-card-inner");
    await surface.hover();
    await page.waitForTimeout(450);
    const hoverStyle = await surface.evaluate(element => ({
      transform: getComputedStyle(element).transform,
      borderColor: getComputedStyle(element).borderColor
    }));
    assert.notEqual(hoverStyle.transform, "none", "Desktop card should lift on hover");
    assert.ok(hoverStyle.borderColor.includes("0, 229, 255"), "Hover should activate the cyan border");

    const clickedScrollY = await page.evaluate(() => window.scrollY);
    await card.click();
    await page.waitForFunction(() => !document.querySelector("#journal-article-view").hidden);
    assert.equal(await page.locator("#journal-article-content h1").innerText(), samplePost.title);
    assert.equal(await page.locator(".journal-article-cover").count(), 1, "Article should render one cover image.");
    assert.equal(await page.locator(".journal-article-body img").count(), 0, "The same cover must not be duplicated inside the article body.");
    assert.equal(await page.locator(".journal-article-description").count(), 0, "The card summary should not be repeated above the full article.");
    await page.waitForFunction(() => Math.abs(document.querySelector("#journal-article-view").getBoundingClientRect().top - 14) < 40);
    await page.waitForSelector(".journal-chart svg");
    await page.waitForSelector(".journal-code-copy");
    await page.locator("[data-journal-back]").click();
    await page.waitForFunction(() => document.querySelector("#journal-article-view").hidden);

    await page.setViewportSize({ width: 390, height: 844 });
    await page.reload({ waitUntil: "domcontentloaded", timeout: 60000 });
    await page.waitForSelector(".journal-card", { timeout: 30000 });
    await page.locator(".journal-card").scrollIntoViewIfNeeded();
    const mobile = await page.evaluate(() => ({
      overflow: document.documentElement.scrollWidth > document.documentElement.clientWidth,
      columns: getComputedStyle(document.querySelector(".journal-card-inner")).gridTemplateColumns.trim().split(" ").filter(Boolean).length,
      sliderExists: !!document.querySelector("#project-gallery")
    }));
    assert.equal(mobile.overflow, false, "Mobile Journal must not cause horizontal overflow");
    assert.equal(mobile.columns, 1, "Mobile Journal cards should use one column");
    assert.equal(mobile.sliderExists, true, "Existing Project Slider must remain present");
    assert.deepEqual(pageErrors, [], "Page should not throw browser runtime errors");

    console.log("Browser smoke passed: live page, scroll reveal, desktop hover, full article, charts, code block, mobile layout and preserved Project Slider.");
  } finally {
    await browser.close();
  }
})().catch(error => {
  console.error(error);
  process.exitCode = 1;
});
