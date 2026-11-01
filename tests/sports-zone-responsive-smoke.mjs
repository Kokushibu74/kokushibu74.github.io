import { chromium } from "playwright";

const target = "https://kokushibu74.github.io/sports-zone.html";
const browser = await chromium.launch({ headless: true });
const page = await browser.newPage({ viewport: { width: 1440, height: 1000 } });
const pageErrors = [];
const workerFailures = [];
page.on("pageerror", error => pageErrors.push(error.message));
page.on("response", response => {
  if (response.url().includes("unified-sports-api.mdshihab74.workers.dev") && response.status() >= 400) {
    workerFailures.push({ status: response.status(), url: response.url() });
  }
});

try {
  const response = await page.goto(target, { waitUntil: "domcontentloaded", timeout: 60000 });
  if (!response || !response.ok()) throw new Error("Live page returned " + (response?.status() ?? "no response"));
  await page.waitForSelector(".arena-header", { timeout: 20000 });
  await page.waitForSelector(".hero-console", { timeout: 10000 });
  await page.waitForFunction(() => {
    const host = document.querySelector("#schedule-preview");
    return !!host && (host.querySelector(".schedule-card") || host.querySelector(".schedule-placeholder"));
  }, { timeout: 30000 });

  const widths = [
    { name: "desktop", width: 1440, height: 1000 },
    { name: "laptop", width: 1024, height: 900 },
    { name: "tablet", width: 768, height: 1024 },
    { name: "mobile", width: 390, height: 844 },
    { name: "small-mobile", width: 360, height: 800 }
  ];
  const layouts = [];
  for (const viewport of widths) {
    await page.setViewportSize({ width: viewport.width, height: viewport.height });
    await page.waitForTimeout(250);
    const state = await page.evaluate(() => {
      const style = selector => {
        const element = document.querySelector(selector);
        return element ? getComputedStyle(element).display : "missing";
      };
      return {
        width: innerWidth,
        documentWidth: document.documentElement.scrollWidth,
        hero: !!document.querySelector(".arena-hero"),
        console: !!document.querySelector(".hero-console"),
        search: !!document.querySelector("#match-search"),
        statusFilter: !!document.querySelector("#match-status-filter"),
        desktopNav: style(".arena-nav"),
        mobileNav: style(".arena-bottom-nav"),
        scheduleCards: document.querySelectorAll("#schedule-preview .schedule-card").length,
        overflowing: [...document.querySelectorAll("body *")].map(el => {
          const r = el.getBoundingClientRect();
          return { tag: el.tagName, id: el.id, className: String(el.className || "").slice(0, 80), left: Math.round(r.left), right: Math.round(r.right), width: Math.round(r.width) };
        }).filter(el => el.right > innerWidth + 1 || el.left < -1).slice(0, 12)
      };
    });
    if (state.documentWidth > state.width + 2) {
      throw new Error(viewport.name + " horizontal overflow: viewport " + state.width + ", document " + state.documentWidth + "; elements: " + JSON.stringify(state.overflowing));
    }
    if (!state.hero || !state.console || !state.search || !state.statusFilter) {
      throw new Error(viewport.name + " missing a required Arena interface element");
    }
    if (viewport.width > 760 && (state.desktopNav === "none" || state.mobileNav !== "none")) {
      throw new Error(viewport.name + " navigation breakpoint is incorrect");
    }
    if (viewport.width <= 760 && (state.desktopNav !== "none" || state.mobileNav === "none")) {
      throw new Error(viewport.name + " mobile navigation breakpoint is incorrect");
    }
    layouts.push({ ...viewport, ...state });
  }

  if (pageErrors.length) throw new Error("Browser JavaScript errors: " + pageErrors.join(" | "));
  if (workerFailures.length) throw new Error("Production Worker HTTP errors: " + JSON.stringify(workerFailures));
  if (!layouts[0].scheduleCards) throw new Error("The unified schedule did not render any upcoming fixture cards");

  console.log("Responsive Sports Arena browser QA passed.");
  console.log(JSON.stringify({ target, layouts, pageErrors, workerFailures }, null, 2));
} finally {
  await browser.close();
}
