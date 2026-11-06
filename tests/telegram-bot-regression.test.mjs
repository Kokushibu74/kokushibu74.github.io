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
assert.match(startButton, /botShowMenu\(env,msg\.chat\.id,undefined,registrationError\)/);
assert.doesNotMatch(startButton, /forceNew:true/, "START BOT must reuse/edit the current menu");

const commandBranch = section('if(cmd==="/start"||cmd==="/menu"){', 'if(cmd==="/help"||cmd==="/cmd"){');
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


const publicCommands = section("const BOT_PUBLIC_COMMANDS=[", "const BOT_ADMIN_COMMANDS=[");
assert.match(publicCommands, /command:"help"/, "/help must be part of public command registration");
const commandRegistration = section("async function botRegisterCommands", "async function botGetMenuAnchor");
assert.match(commandRegistration, /setMyCommands/);
assert.match(commandRegistration, /getMyCommands/, "Registration must be verified against Telegram");
assert.match(commandRegistration, /if\(!defaults\.ok\)/, "Default command registration failures must be surfaced");
assert.match(commandRegistration, /if\(!scoped\.ok\)/, "Per-chat registration failures must be surfaced");
assert.match(commandRegistration, /missing\.length/, "Missing Telegram commands must be detected");

const compactMenu = section("const BOT_MENU = [", "const BOT_DEFAULTS = {");
assert.match(compactMenu, /\["website"/);
assert.match(compactMenu, /\["news"/);
assert.match(compactMenu, /\["analytics"/);
assert.match(compactMenu, /\["security"/);
assert.match(compactMenu, /\["automation"/);
assert.match(compactMenu, /\["users"/);
assert.match(compactMenu, /BOT_SECONDARY_MENU/);
assert.match(source, /"newsAlerts","workflowAlerts"/, "newsAlerts must be available in the alert toggle list");

const commandHandler = section("async function umHandleCommand", "function botB64");
assert.match(commandHandler, /"\/help"/, "/help must be dispatched");
assert.match(commandHandler, /"\/details"/, "Context-aware detail shortcut must be dispatched");
assert.match(commandHandler, /botRegisterCommands\(env,chatId,isAdmin\)/, "Startup path must register commands");
assert.match(commandHandler, /botGetContext\(env,chatId\)/, "/details must use persisted context");

const analytics = section('}else if(category==="analytics"){', '}else if(category==="security"){');
assert.match(analytics, /miniAppGa4Report\(env\)/, "GA4 status must use the GA4 Data API report");
assert.match(analytics, /Cloudflare Visitor KV/, "Visitor KV must remain identified separately from GA4");

console.log("Telegram command registration, compact menu, contextual shortcuts and analytics source separation verified.");


const menuAnchorRules = section("async function botSend", "async function botSendChatAction");
assert.match(menuAnchorRules, /if\(!options\.forceNew&&messageId/, "A new alert/report must not delete the active menu anchor");
assert.match(menuAnchorRules, /if\(!options\.forceNew\|\|options\.persistentMenu\)/, "Preserved messages must not become the menu anchor");

const confirmationHandler = section("async function umHandleCommand", "function botB64");
assert.match(confirmationHandler, /options\.confirmed/);
assert.match(confirmationHandler, /bot:confirm:v1:/, "State-changing commands must create a short-lived confirmation record");
assert.match(confirmationHandler, /userrename.*userlink.*userunlink.*userblock.*userunblock/, "Sensitive user changes must be gated by confirmation");
const callbackHandler = section("async function botHandleCallback", "async function umHandleCommand");
assert.match(callbackHandler, /action\.startsWith\("confirm:"\)/);
assert.match(callbackHandler, /pending\.adminId/);
assert.match(callbackHandler, /pending\.expiresAt/);
assert.match(callbackHandler, /\{confirmed:true\}/, "Only the matching admin can consume a confirmation");

assert.match(source, /b1:users:linked/);
assert.match(source, /b1:users:blocked/);
assert.match(source, /b1:users:profile:/);
assert.match(source, /b1:status:recovery:1/);
assert.match(source, /NOT AVAILABLE through the Telegram Bot data source/, "Unavailable Worker logs must not be misrepresented as User Manager history");

console.log("Sensitive action confirmations, persistent menu isolation and User Manager navigation verified.");


assert.match(source, /users:searchpage:/, "User Manager search results must support pagination");
assert.match(source, /\.join\(" "\)\.trim\(\)/, "User Manager search must accept multi-word terms");
assert.match(source, /b1:users:history:/, "Selected-user history must have pagination callbacks");
assert.match(source, /b1:users:profile:/, "Telegram and visitor directory entries must open profiles");
const miniAppSource = readFileSync(new URL("../miniapp/app.js", import.meta.url), "utf8");
assert.match(miniAppSource, /"newsAlerts","workflowAlerts"/, "Mini App must expose the existing Bangladesh news alert toggle");
assert.match(miniAppSource, /newsAlerts:"Bangladesh News Alerts"/);
const miniAppApi = section('if(pathname==="/miniapp/api"){', 'if(pathname==="/workflow-config"){');
assert.doesNotMatch(miniAppApi, /if\(!cfg\.newsRefresh\)/, "Manual refresh must remain available when automatic refresh is paused");
assert.match(miniAppApi, /newsRefresh_manual_attempt/);

console.log("User Manager search/history pagination and Mini App alert/manual refresh contracts verified.");
