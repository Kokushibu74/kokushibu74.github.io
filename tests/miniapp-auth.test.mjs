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
for (const section of ["website","news","analytics","security","github","hero","automation","alerts","reports","users","settings","logs","recovery"]) {
  assert(app.includes('"'+section+'"'), "missing Mini App section: " + section);
}
assert(css.includes("@media(max-width:760px)") && css.includes(".mobile-nav"), "mobile navigation and responsive layout must exist");
console.log("Mini App auth and frontend contracts passed.");
