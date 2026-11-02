import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { webcrypto } from "node:crypto";
import vm from "node:vm";

const worker = readFileSync("cloudflare/portfolio-contact-telegram.js", "utf8");
const html = readFileSync("miniapp/index.html", "utf8");
const app = readFileSync("miniapp/app.js", "utf8");
const css = readFileSync("miniapp/app.css", "utf8");

const start = worker.indexOf("const MINIAPP_RATE_PREFIX");
const end = worker.indexOf("async function miniAppRateLimit", start);
assert(start >= 0 && end > start, "Mini App auth helpers must exist in the Worker");
const snippet = worker.slice(start, end);
const context = { crypto: webcrypto, TextEncoder, URLSearchParams, Date, Set, Error, Number, String, JSON, Math };
const helpers = vm.runInNewContext(snippet + "; ({miniAppAuthorize,miniAppHmac,miniAppHex})", context);
const botToken = "test-only-token-never-used-in-production";
const adminId = "123456789";
const now = Math.floor(Date.now() / 1000);
const fields = {
  auth_date: String(now),
  query_id: "AAE-test-query",
  user: JSON.stringify({ id: Number(adminId), first_name: "Test Admin" })
};
const encoder = new TextEncoder();
const check = Object.keys(fields).sort().map(key => key + "=" + fields[key]).join("\n");
const secret = await helpers.miniAppHmac(encoder.encode("WebAppData"), encoder.encode(botToken));
const hash = helpers.miniAppHex(await helpers.miniAppHmac(secret, encoder.encode(check)));
const signed = new URLSearchParams({ ...fields, hash }).toString();
const env = { TELEGRAM_BOT_TOKEN: botToken, ADMIN_TELEGRAM_IDS: adminId };

const user = await helpers.miniAppAuthorize(signed, env);
assert.equal(String(user.id), adminId, "valid allowlisted admin must authenticate");
await assert.rejects(
  helpers.miniAppAuthorize(signed.replace("AAE-test-query", "tampered"), env),
  /signature verification failed/i,
  "tampered initData must be rejected"
);
await assert.rejects(
  helpers.miniAppAuthorize(signed, { ...env, ADMIN_TELEGRAM_IDS: "987654321" }),
  /Access denied/i,
  "non-admin Telegram users must be rejected"
);
const staleFields = { ...fields, auth_date: String(now - 90000) };
const staleCheck = Object.keys(staleFields).sort().map(key => key + "=" + staleFields[key]).join("\n");
const staleHash = helpers.miniAppHex(await helpers.miniAppHmac(secret, encoder.encode(staleCheck)));
const stale = new URLSearchParams({ ...staleFields, hash: staleHash }).toString();
await assert.rejects(helpers.miniAppAuthorize(stale, env), /session expired/i, "stale initData must be rejected");

assert(html.includes("https://telegram.org/js/telegram-web-app.js"), "Telegram WebApp SDK must be loaded");
assert(html.includes("./app.css") && html.includes("./app.js"), "Mini App assets must be linked");
assert(app.includes("tg.initData") && app.includes("/miniapp/api"), "frontend must send Telegram initData to the Worker API");
assert(!/TELEGRAM_BOT_TOKEN|GA4_SERVICE_ACCOUNT_JSON|GITHUB_TOKEN/.test(app + html), "frontend must not contain backend secrets");
assert(worker.includes('if(action==="module")'), "authenticated module API action must exist");
assert(worker.includes('if(action==="userLookup")') && worker.includes('if(action==="userHistory")'), "admin User Manager lookup and history endpoints must exist");
assert(worker.includes('if(action==="recovery")') && worker.includes("async function miniAppRecovery"), "recovery view must verify backup branches from GitHub");
assert(worker.includes("Access-Control-Allow-Origin") && worker.includes('origin!==allowedOrigin'), "Mini App API must enforce the GitHub Pages origin");
assert(worker.includes("miniAppRateLimit") && worker.includes("miniAppAudit"), "Mini App API must rate-limit and audit authenticated actions");
assert(worker.includes("miniAppGa4Report") && worker.includes('if(action==="ga4Report")'), "GA4 report must use the authenticated Worker API");
assert(worker.includes("miniAppHeroPrepare") && worker.includes("miniAppHeroConfirm"), "Hero upload must use a staged preview and explicit confirm flow");
assert(worker.includes("pending.userId") && worker.includes("pending.expiresAt"), "Hero preview must be admin-bound and expire");
assert(worker.includes("image/jpeg") && worker.includes("image/png") && worker.includes("image/webp"), "Hero upload must restrict supported image formats");
assert(worker.includes('if(action==="heroPrepare")') && worker.includes('if(action==="heroConfirm")'), "Hero prepare and publish actions must be authenticated");
assert(app.includes('api("heroPrepare"') && app.includes('api("heroConfirm"') && app.includes("Confirm & Publish to Live Site"), "Hero UI must upload, preview and require explicit publish confirmation");

assert(worker.includes("miniAppCronHistory") && worker.includes('if(action==="cronHistory")'), "Cloudflare Cron run history API must exist");
assert(worker.includes("miniAppDispatchNews") && worker.includes('if(action==="newsRefresh")'), "manual News Refresh must use the existing GitHub workflow dispatch");
assert(worker.includes("cfg.newsRefresh") && worker.includes("update-news.yml"), "manual News Refresh must respect the existing automation setting and workflow");
assert(app.includes('api("ga4Report")') && app.includes('api("cronHistory")'), "Analytics and Cron history views must call authenticated APIs");
assert(app.includes('api("newsRefresh")') && app.includes("showConfirm"), "News Refresh must require confirmation in the Mini App");

assert(worker.includes('setChatMenuButton') && worker.includes("https://kokushibu74.github.io/miniapp/"), "admin /start must configure the Telegram Mini App chat menu button");
assert(app.includes('api("userLookup"') && app.includes('api("userHistory"'), "User Manager UI must use authenticated APIs");
assert(app.includes('api("module"') && app.includes('api("setConfig"'), "module views and setting changes must use authenticated APIs");
assert(!app.includes("innerHTML=result") && !app.includes("innerHTML=data"), "untrusted API data must not be inserted as HTML");
for (const section of ["website","news","analytics","security","github","hero","automation","alerts","reports","users","settings","logs","recovery"]) {
  assert(app.includes('"'+section+'"'), "missing Mini App section: " + section);
}
assert(css.includes("@media(max-width:760px)") && css.includes(".mobile-nav"), "mobile navigation and responsive layout must exist");
console.log("Mini App auth and frontend contracts passed.");
