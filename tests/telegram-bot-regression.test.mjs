import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const source = readFileSync(new URL("../cloudflare/portfolio-contact-telegram.js", import.meta.url), "utf8");

function section(start, end) {
  const a = source.indexOf(start);
  assert.ok(a >= 0, "Missing source section: " + start);
  const b = source.indexOf(end, a + start.length);
  assert.ok(b > a, "Missing section boundary: " + end);
  return source.slice(a, b);
}

const startKeyboard = section("async function botEnsureStartKeyboard", "async function botHandleStartButton");
assert.match(startKeyboard, /setChatMenuButton/);
assert.doesNotMatch(startKeyboard, /botTelegram\(env,"sendMessage"/, "A /start must not send another persistent reply-keyboard message");

const startButton = section("async function botHandleStartButton", "async function botExpireIdleMenu");
assert.match(startButton, /botShowMenu\(env,msg\.chat\.id\)/);
assert.doesNotMatch(startButton, /forceNew:true/, "START BOT must reuse/edit the current menu");

const commandBranch = section('if(cmd==="/start"||cmd==="/menu"){', 'if(cmd==="/cmd"){');
const cooldown = section("const BOT_START_MENU_COOLDOWN_MS=5000;", "async function botHandleStartButton");
assert.match(cooldown, /new Map\(\)/, "Burst cooldown must not consume KV writes");
assert.match(cooldown, /now-last<BOT_START_MENU_COOLDOWN_MS/, "Repeated start requests must be throttled per chat");
assert.match(startButton, /botAllowStartMenu\(msg\.chat\.id\)/, "START BOT must use the burst cooldown");
assert.match(commandBranch, /botAllowStartMenu\(chatId\)/, "/start and /menu must use the burst cooldown");

assert.match(commandBranch, /botMarkMenuInteraction/, "Repeated /start must update the existing menu activity state");

const send = section("async function botSend", "async function botSendChatAction");
const edit = send.slice(send.indexOf("if(messageId&&!options.forceNew)"), send.indexOf('const sent=await botTelegram(env,"sendMessage"'));
assert.doesNotMatch(edit, /botRememberMenu/, "Editing an existing menu must not spend a KV write");
assert.match(send, /options\.persistentMenu&&newMessageId/, "An unpersistable main menu must be removed rather than duplicated");

const touch = section("async function umTelegramTouch", "async function umResolve");
assert.match(touch, /15\*60\*1000/, "Telegram profile writes must be throttled");
assert.match(touch, /command_received/, "Useful command history must remain available");
assert.match(touch, /\["\/start","\/menu","\/cmd"\]/, "Noisy menu commands must not create history writes");


const webhook = section('if(new URL(request.url).pathname==="/telegram-webhook"){', 'if(new URL(request.url).pathname!=="/submit")');
assert.match(webhook, /try\{\s*if\(update\.callback_query\)/, "All Telegram update processing must be inside a retry-safe boundary");
assert.match(webhook, /Telegram webhook update processing failed/, "Webhook exceptions must be logged with update metadata");
assert.match(webhook, /updateId:Number\.isSafeInteger\(update\?\.update_id\)/, "Webhook error logs must include Telegram update_id for diagnosis");
assert.match(webhook, /return new Response\("OK"\)/, "Application errors must be acknowledged to prevent Telegram retry loops");

const cronAlert = section("async function miniAppCronAlert", "async function miniAppCronHistory");
assert.match(cronAlert, /if\(!shouldNotify\)return/, "Stable cron success states must not write to KV every 30 minutes");

console.log("Telegram menu reuse, KV write throttling and cron alert state transitions verified.");
