const assert = require("node:assert/strict");
const { spawn } = require("node:child_process");
const { chromium } = require("playwright");

const origin = "http://127.0.0.1:4173";
const delay = ms => new Promise(resolve => setTimeout(resolve, ms));

async function waitForServer() {
  for (let attempt = 0; attempt < 40; attempt++) {
    try {
      const response = await fetch(origin);
      if (response.ok) return;
    } catch {}
    await delay(150);
  }
  throw new Error("Local portfolio preview server did not start.");
}

async function installGalleryFixture(page) {
  await page.route("**/site-data.json*", async route => {
    const response = await route.fetch();
    const data = await response.json();
    data.heroGallery = {
      version: 1,
      activeImageId: "browser-test-one",
      images: [
        { id: "browser-test-one", src: "storage/pictures/profile-1792618182176.jpg", focusX: 50, focusY: 50, zoom: 1 },
        { id: "browser-test-two", src: "storage/pictures/1790523232314.jpg", focusX: 50, focusY: 50, zoom: 1 }
      ]
    };
    await route.fulfill({
      status: response.status(),
      headers: { "content-type": "application/json; charset=utf-8", "cache-control": "no-store" },
      body: JSON.stringify(data)
    });
  });
}

async function speedViewerTimer(page) {
  await page.evaluate(() => {
    const original = window.setTimeout.bind(window);
    window.__heroTimerDelays = [];
    window.setTimeout = (handler, timeout, ...args) => {
      window.__heroTimerDelays.push(timeout);
      return original(handler, timeout === 20000 ? 1600 : timeout, ...args);
    };
  });
}

async function waitForViewer(page, visible) {
  await page.waitForFunction(expected => {
    const overlay = document.querySelector("#portrait-reveal-overlay");
    return !!overlay && overlay.classList.contains("is-visible") === expected;
  }, visible, { timeout: 4000 });
}

(async () => {
  const server = spawn("python3", ["-m", "http.server", "4173", "--bind", "127.0.0.1"], {
    cwd: process.cwd(),
    stdio: "ignore"
  });
  let browser;
  try {
    await waitForServer();
    browser = await chromium.launch({ headless: true });

    const desktop = await browser.newPage({ viewport: { width: 1440, height: 900 } });
    await desktop.emulateMedia({ reducedMotion: "no-preference" });
    await installGalleryFixture(desktop);
    await desktop.goto(origin, { waitUntil: "domcontentloaded" });
    await desktop.waitForFunction(() => window.__portfolioRendered === true);
    await speedViewerTimer(desktop);
    const image = desktop.locator("#home .neon-inner-img");
    const overlay = desktop.locator("#portrait-reveal-overlay");
    await image.waitFor({ state: "visible" });

    await image.hover();
    await waitForViewer(desktop, true);
    assert.equal(await overlay.evaluate(el => getComputedStyle(el).pointerEvents), "none",
      "Desktop hover preview must not intercept the pointer.");
    await desktop.waitForTimeout(120);
    assert.ok((await overlay.getAttribute("class")).includes("is-visible"),
      "Desktop hover preview must remain open while the pointer stays on the image.");
    await desktop.locator("#home h1").hover();
    await waitForViewer(desktop, false);

    await image.click();
    await waitForViewer(desktop, true);
    await desktop.waitForFunction(() => !!document.querySelector(".portrait-round-morph"),
      undefined, { timeout: 2500 });
    await desktop.waitForFunction(() => !document.querySelector(".portrait-round-morph"),
      undefined, { timeout: 3000 });
    assert.ok((await overlay.getAttribute("class")).includes("is-tap"),
      "Clicking the Round Frame must open interactive tap-viewer mode.");
    assert.equal(await desktop.locator("#portrait-reveal-image").evaluate(el => el.style.opacity), "",
      "The full-size image must be revealed after the Round Frame morph completes.");
    assert.equal(await overlay.evaluate(el => getComputedStyle(el).pointerEvents), "auto");
    await desktop.locator("#portrait-reveal-next").click();
    await desktop.waitForFunction(() => document.querySelector("#portrait-reveal-image").src.endsWith("/1790523232314.jpg"));
    await desktop.waitForFunction(() => ["fade","slide","blur","zoom"].includes(document.querySelector("#portrait-reveal-image").dataset.viewerTransition));
    const nextTransition = await desktop.locator("#portrait-reveal-image").getAttribute("data-viewer-transition");
    await desktop.keyboard.press("ArrowLeft");
    await desktop.waitForFunction(() => document.querySelector("#portrait-reveal-image").src.endsWith("/profile-1792618182176.jpg"));
    await desktop.waitForFunction(() => ["fade","slide","blur","zoom"].includes(document.querySelector("#portrait-reveal-image").dataset.viewerTransition));
    const previousTransition = await desktop.locator("#portrait-reveal-image").getAttribute("data-viewer-transition");
    assert.notEqual(previousTransition, nextTransition,
      "Consecutive Next/Previous actions must not repeat the same transition.");
    await desktop.keyboard.press("Escape");
    await desktop.waitForFunction(() => !!document.querySelector(".portrait-round-morph"),
      undefined, { timeout: 2500 });
    await waitForViewer(desktop, false);

    await image.click();
    await waitForViewer(desktop, true);
    await desktop.mouse.click(6, 6);
    await waitForViewer(desktop, false);

    await image.click();
    await waitForViewer(desktop, true);
    assert.ok((await desktop.evaluate(() => window.__heroTimerDelays)).includes(20000),
      "Tap viewer must schedule its 20-second inactivity timer.");
    await desktop.waitForTimeout(280);
    await desktop.locator("#portrait-reveal-next").click();
    await desktop.waitForTimeout(300);
    assert.ok((await overlay.getAttribute("class")).includes("is-visible"),
      "Viewer interaction must reset the 20-second inactivity timer.");
    await desktop.waitForTimeout(300);
    await waitForViewer(desktop, false);

    const mobile = await browser.newPage({
      viewport: { width: 390, height: 844 },
      isMobile: true,
      hasTouch: true,
      deviceScaleFactor: 3
    });
    await mobile.emulateMedia({ reducedMotion: "no-preference" });
    await installGalleryFixture(mobile);
    await mobile.goto(origin, { waitUntil: "domcontentloaded" });
    await mobile.waitForFunction(() => window.__portfolioRendered === true);
    await speedViewerTimer(mobile);
    const mobileImage = mobile.locator("#home .neon-inner-img");
    const mobileOverlay = mobile.locator("#portrait-reveal-overlay");
    await mobileImage.waitFor({ state: "visible" });
    await mobileImage.click();
    await waitForViewer(mobile, true);
    await mobile.waitForFunction(() => !!document.querySelector(".portrait-round-morph"),
      undefined, { timeout: 2500 });
    await mobile.waitForFunction(() => !document.querySelector(".portrait-round-morph"),
      undefined, { timeout: 3000 });
    assert.ok(await mobile.locator("#portrait-reveal-next").isVisible(),
      "Mobile viewer must show its in-image navigation arrow.");

    await mobile.locator("#portrait-reveal-frame").evaluate(frame => {
      frame.dispatchEvent(new PointerEvent("pointerdown", {
        bubbles: true, pointerType: "touch", pointerId: 7, isPrimary: true, clientX: 320, clientY: 420
      }));
      frame.dispatchEvent(new PointerEvent("pointerup", {
        bubbles: true, pointerType: "touch", pointerId: 7, isPrimary: true, clientX: 70, clientY: 420
      }));
    });
    await mobile.waitForFunction(() => document.querySelector("#portrait-reveal-image").src.endsWith("/1790523232314.jpg"));
    await mobile.waitForFunction(() => ["fade","slide","blur","zoom"].includes(document.querySelector("#portrait-reveal-image").dataset.viewerTransition));

    const currentUrl = mobile.url();
    await mobile.evaluate(() => history.back());
    await waitForViewer(mobile, false);
    assert.equal(mobile.url(), currentUrl,
      "Mobile Back must close the viewer without navigating away from the Homepage.");

    await mobileImage.click();
    await waitForViewer(mobile, true);
    await mobile.mouse.click(6, 6);
    await waitForViewer(mobile, false);

    console.log("Hero Gallery desktop hover, arrows, keyboard, outside click, timer reset, mobile swipe and Back tests: OK");
  } finally {
    if (browser) await browser.close();
    server.kill("SIGTERM");
  }
})().catch(error => {
  console.error(error);
  process.exitCode = 1;
});
