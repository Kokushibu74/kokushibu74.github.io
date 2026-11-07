const { chromium } = require("playwright");

(async () => {
  const browser = await chromium.launch({ headless: true });
  const cases = [
    { name: "mobile", viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true },
    { name: "desktop", viewport: { width: 1440, height: 900 }, isMobile: false, hasTouch: false }
  ];

  for (const c of cases) {
    const page = await browser.newPage({
      viewport: c.viewport,
      isMobile: c.isMobile,
      hasTouch: c.hasTouch
    });
    await page.goto("https://kokushibu74.github.io/?swarm-smoke=" + Date.now(), {
      waitUntil: "domcontentloaded",
      timeout: 60000
    });
    await page.waitForSelector("#nav-brand-intro", { timeout: 30000 });
    await page.waitForFunction(
      () => typeof window.__swarmRebuild?.start === "function",
      { timeout: 30000 }
    );

    const before = await page.evaluate(() => ({
      name: document.querySelector("#nav-name")?.textContent?.trim(),
      viewport: innerWidth,
      scrollWidth: document.documentElement.scrollWidth
    }));
    if (!before.name || !before.name.toUpperCase().includes("SHIHABUL ISLAM")) {
      throw new Error(c.name + ": header name missing or changed: " + before.name);
    }
    if (before.scrollWidth > before.viewport + 2) {
      throw new Error(c.name + ": horizontal overflow before animation");
    }

    await page.locator("#nav-brand-intro").click();
    await page.waitForFunction(
      () => !!document.querySelector("swarm-rebuild")?.shadowRoot?.querySelector('[data-a="close"]'),
      { timeout: 30000 }
    );

    const active = await page.evaluate(() => !!window.__swarmRebuild?.app);
    if (!active) throw new Error(c.name + ": swarm app did not start");

    await page.keyboard.press("Escape");
    await page.waitForFunction(
      () => !document.querySelector("swarm-rebuild"),
      { timeout: 10000 }
    );

    const after = await page.evaluate(() => ({
      viewport: innerWidth,
      scrollWidth: document.documentElement.scrollWidth,
      header: !!document.querySelector("#nav-brand-intro")
    }));
    if (!after.header) throw new Error(c.name + ": header missing after exit");
    if (after.scrollWidth > after.viewport + 2) {
      throw new Error(c.name + ": horizontal overflow after animation");
    }

    console.log(c.name + " live smoke test passed", { before, after });
    await page.close();
  }

  await browser.close();
})().catch((err) => {
  console.error(err);
  process.exit(1);
});
