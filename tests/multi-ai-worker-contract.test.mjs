import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const source = readFileSync(new URL("../cloudflare/multi-ai-memory-api.js", import.meta.url), "utf8");
assert.match(source, /async function saveMemory\(/, "Both memory save paths must use a shared retention helper");
assert.match(source, /Math\.max\(0,count-99\)/, "Memory storage must trim excess rows to a 100-row per-client cap");
assert.match(source, /await db\.batch\(\[trim,insert\]\)/, "Trim and insert must be batched atomically");
assert.match(source, /memoryLimitPerClient:100/, "Health endpoint must expose the deployed memory cap");
assert.match(source, /max-age=3600/, "Public knowledge endpoint must be cacheable for one hour");
assert.match(source, /max-age=300, stale-while-revalidate=60/, "Public search endpoint must be cacheable for five minutes");
assert.match(source, /AbortSignal\.timeout\(12000\)/, "External chat provider requests must have a bounded timeout");
assert.match(source, /rateLimit\(ip,bucket,max\)/, "Existing per-IP rate limiting must remain enabled");
assert.match(source, /steps:4/, "Image generation must retain its low-step FLUX setting");

const helperStart = source.indexOf("async function saveMemory(");
const helperEnd = source.indexOf("\nexport default", helperStart);
assert.ok(helperStart >= 0 && helperEnd > helperStart, "Memory helper must be isolated for unit testing");
const saveMemory = new Function("crypto", source.slice(helperStart, helperEnd) + "; return saveMemory;")(globalThis.crypto);
let currentCount = 100;
const calls = [];
const fakeDb = {
  prepare(sql) {
    return {
      sql,
      bind(...args) {
        return {
          sql, args,
          first: async () => ({ n: currentCount }),
          run: async () => { calls.push({ type: "run", sql, args }); }
        };
      }
    };
  },
  batch: async statements => { calls.push({ type: "batch", sql: statements.map(x => x.sql) }); }
};
const trimmed = await saveMemory(fakeDb, "client-1234567890", "new memory");
assert.equal(trimmed.count, 100);
assert.equal(calls.length, 1);
assert.equal(calls[0].type, "batch");
assert.equal(calls[0].sql.length, 2, "Oldest-row trim and insert must execute in one batch");
calls.length = 0;
currentCount = 10;
const normal = await saveMemory(fakeDb, "client-1234567890", "another memory");
assert.equal(normal.count, 11);
assert.equal(calls.length, 1);
assert.equal(calls[0].type, "run", "Below the cap, a single insert should be used");

console.log("Multi-AI D1 retention, caching, timeout, and rate-limit contracts OK.");
