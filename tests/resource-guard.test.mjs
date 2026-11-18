import test from "node:test";
import assert from "node:assert/strict";
import {readFile} from "node:fs/promises";
import {
  nextUtcMidnight,
  secondsUntilUtcReset,
  shouldPauseBotForKvWrites,
  isKvWriteLimitError
} from "../cloudflare/resource-guard.mjs";

test("KV write guard pauses at 85 percent and not below it",()=>{
  assert.equal(shouldPauseBotForKvWrites(849,1000),false);
  assert.equal(shouldPauseBotForKvWrites(850,1000),true);
  assert.equal(shouldPauseBotForKvWrites(1000,1000),true);
  assert.equal(shouldPauseBotForKvWrites(10,0),false);
});

test("pause expiry is the next UTC midnight",()=>{
  const now=Date.parse("2026-11-18T23:35:00+06:00");
  assert.equal(new Date(nextUtcMidnight(now)).toISOString(),"2026-11-19T00:00:00.000Z");
  assert.equal(secondsUntilUtcReset(now),23100);
  assert.equal(secondsUntilUtcReset(Date.parse("2026-11-18T23:59:59Z")),1);
});

test("recognizes the Cloudflare KV put daily limit error",()=>{
  assert.equal(isKvWriteLimitError(new Error("KV put() limit exceeded for the day.")),true);
  assert.equal(isKvWriteLimitError(new Error("Your account has exceeded the daily KV write limit.")),true);
  assert.equal(isKvWriteLimitError(new Error("Network timeout")),false);
});

test("public News Page workflow has no Telegram Worker dependency",async()=>{
  const workflow=await readFile(new URL("../.github/workflows/update-news.yml",import.meta.url),"utf8");
  assert.match(workflow,/scripts\/update_news\.py/);
  assert.doesNotMatch(workflow,/workflow-config|update_news_alerts|news-alert-feed/);
});

test("Telegram alert feed has its own workflow and graceful Worker outage handling",async()=>{
  const workflow=await readFile(new URL("../.github/workflows/update-news-alerts.yml",import.meta.url),"utf8");
  assert.match(workflow,/workflow-config/);
  assert.match(workflow,/Worker unavailable; Telegram alert feed refresh skipped/);
  assert.match(workflow,/scripts\/update_news_alerts\.py/);
});

test("Worker gates Telegram webhook and scheduled automation while preserving other routes",async()=>{
  const worker=await readFile(new URL("../cloudflare/portfolio-contact-telegram.js",import.meta.url),"utf8");
  assert.match(worker,/botKvWritePauseState\(env\)/);
  assert.match(worker,/Temporarily paused for the daily KV reset/);
  assert.match(worker,/async scheduled\(controller,env,ctx\)/);
  assert.match(worker,/Scheduled Telegram Bot\/automation work paused until UTC daily reset/);
});
