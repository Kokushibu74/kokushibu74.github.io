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

const mainKeyboard = section("function botMainKeyboard(){", "function botBackKeyboard()");
assert.match(mainKeyboard, /rows\.push\(\[\{text:BOT_START_LABEL,callback_data:"b1:home"\}\]\)/, "The main menu must always expose START BOT as a working home callback");
assert.match(source, /const BOT_START_LABEL = "🚀 START BOT"/, "The START BOT label must remain stable");

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
assert.match(menuAnchorRules, /if\(\(!options\.forceNew\|\|callbackMessageId\)&&messageId/, "Only callback edit fallbacks may clean up the clicked stale message");
assert.match(menuAnchorRules, /if\(!options\.forceNew\|\|options\.persistentMenu\|\|callbackMessageId\)/, "Preserved non-callback messages must not become the menu anchor; callback fallback replacements must");

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


assert.match(source, /function botClaimCallback/, "Rapid duplicate callbacks must be suppressed");
assert.match(source, /github:retry:/);
assert.match(source, /rerun-failed-jobs/, "GitHub Retry must rerun the exact failed run, not a generic workflow");
assert.match(source, /security:event:v1:/, "Security alert events must be persisted as their own source");
assert.match(source, /botSecurityEvents\(env,12\)/, "Security Center and Security Logs must use the persisted security-event source");
assert.match(source, /Retry News Refresh/, "News watchdog failures must expose a working retry callback");
assert.match(source, /reply_markup:markup/, "Visitor alerts must include contextual actions");
assert.match(source, /Full Report.*Traffic/s, "Daily report notifications must expose report and traffic actions");

console.log("Notification actions, exact GitHub retry, security event storage and callback deduplication verified.");


assert.match(source, /b1:status:website:2/, "Website section must expose Worker Status");
assert.match(source, /b1:status:website:3/, "Website section must expose Contact Form diagnostics");
assert.match(source, /b1:status:website:4/, "Website section must expose combined diagnostics");
assert.match(source, /Contact route: .*POST only/s, "Contact form route must be checked without sending a test submission");
assert.match(source, /b1:status:news:4/, "News Center must expose error history");
assert.match(source, /b1:status:news:5/, "News Center must expose refresh history");
assert.match(source, /Source availability is inferred from the stored feed/, "Source health must not claim a live publisher uptime test");
assert.match(source, /workers\/scripts\/portfolio-contact-telegram\/schedules/, "Automation must read actual Cloudflare cron schedules");
assert.match(source, /b1:status:automation:3/, "Automation must expose manual action details");

console.log("Website diagnostics, News Center history and Automation schedule contracts verified.");

assert.match(source, /mdSafe\("Visitor IDs are the clickable buttons below; tap one to open its report\."\)/, "The /userid MarkdownV2 footer must escape reserved punctuation");


const callbackEdit = section("async function botHandleCallback", "async function umHandleCommand");
assert.match(source, /const BOT_CALLBACK_MESSAGE_ANCHORS=new Map\(\)/, "Inline callbacks must keep the clicked message as the temporary edit target");
assert.match(source, /const BOT_CALLBACK_ACTIVE=new Set\(\)/, "Only one callback action per chat may own the edit target at a time");
assert.match(callbackEdit, /BOT_CALLBACK_MESSAGE_ANCHORS\.set\(String\(chatId\),callbackMessageId\)/, "Every inline button must bind its clicked message as the edit target");
assert.match(callbackEdit, /BOT_CALLBACK_MESSAGE_ANCHORS\.delete\(String\(chatId\)\)/, "Callback edit context must always be cleared");
assert.match(callbackEdit, /BOT_CALLBACK_ACTIVE\.delete\(String\(chatId\)\)/, "Callback lock must always be released");
assert.match(send, /const callbackMessageId=Number\(BOT_CALLBACK_MESSAGE_ANCHORS\.get\(String\(chatId\)\)\|\|0\)\|\|null/, "Button responses must target the message that was clicked");
assert.match(send, /if\(messageId&&\(!options\.forceNew\|\|callbackMessageId\)\)/, "Inline button actions must edit in place even when nested command handlers request a new message");
assert.match(send, /options\.persistentMenu\|\|callbackMessageId/, "If Telegram rejects an edit and fallback is needed, the replacement must become the next active menu anchor");
assert.match(callbackEdit, /BOT_CALLBACK_ACTIVE\.has\(String\(chatId\)\)/, "Concurrent callback actions in one chat must not race over the same edit target");

console.log("All Telegram inline-button callbacks are bound to the clicked message for edit-in-place navigation.");

const editInPlace = section("async function botSend", "async function botSendChatAction");
assert.match(editInPlace, /if\(callbackMessageId\)\{\s*throw new Error\("Telegram could not edit the clicked message/, "Callback edit failures must not send replacement messages");
assert.match(editInPlace, /Only recover automatically when Telegram confirms that the stored anchor/, "Persistent menu fallback must be limited to a deleted or missing anchor");
assert.doesNotMatch(editInPlace.slice(editInPlace.indexOf("if(callbackMessageId)"), editInPlace.indexOf('const sent=await botTelegram(env,"sendMessage"')), /sendMessage/, "A failed callback edit must stop before sendMessage");
const callbackFailure = section("async function botHandleCallback", "async function umHandleCommand");
assert.match(callbackFailure, /original message preserved and no replacement sent/, "Uneditable historical notifications must be preserved without sending a duplicate");
assert.doesNotMatch(callbackFailure.slice(callbackFailure.indexOf("}catch(e){")), /botSend\(/, "Callback failures must not create a replacement chat message");
console.log("Telegram callbacks preserve the clicked message and never create replacement messages when edit is unavailable.");
