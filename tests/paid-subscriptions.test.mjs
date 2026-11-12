import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import {
  PAYMENT_RECEIVER, PACKAGE_PRICES, createPaymentRequest,
  listActiveAlertRecipients, reviewPayment, setSubscriptionStatus
} from "../cloudflare/paid-subscriptions.mjs";

const worker = readFileSync(new URL("../cloudflare/portfolio-contact-telegram.js", import.meta.url), "utf8");
const miniapp = readFileSync(new URL("../miniapp/app.js", import.meta.url), "utf8");
const migration = readFileSync(new URL("../cloudflare/migrations/0001_paid_news_subscriptions.sql", import.meta.url), "utf8");

test("paid subscription pricing and receiver are fixed to the approved plan", () => {
  assert.equal(PAYMENT_RECEIVER, "01620107233");
  assert.deepEqual(PACKAGE_PRICES, { individual: 100, group: 300 });
});

test("payment requests require source account, method, receiver and unique transaction id", async () => {
  let captured;
  const env = { PAYMENTS_DB: { prepare(sql) { return { bind(...params) { captured={sql,params}; return { async run(){return {meta:{changes:1}};} }; } }; } } };
  const request = await createPaymentRequest(env, {
    userId:"123456789",username:"testuser",packageType:"individual",
    paymentMethod:"bkash",paySourceAccount:"01712345678",
    trxId:"ABC123456789",targetId:"123456789",targetTitle:"Individual account"
  });
  assert.equal(request.amount,100);
  assert.equal(request.receiverAccount,"01620107233");
  assert.match(captured.sql,/trx_id/);
  assert.match(captured.sql,/screenshot_file_id/);
  assert.ok(captured.params.includes("01712345678"));
  assert.ok(captured.params.includes("ABC123456789"));
  assert.ok(captured.params.includes("01620107233"));
});

test("active alert recipients are selected only from valid active subscriptions", async () => {
  let captured;
  const env = { PAYMENTS_DB: { prepare(sql) { return { bind(...params) { captured={sql,params}; return { async all(){return {results:[{target_type:"individual",target_id:"123",starts_at:1,expires_at:9999999999999}]};} }; } }; } } };
  const recipients=await listActiveAlertRecipients(env);
  assert.equal(recipients.length,1);
  assert.match(captured.sql,/status='active'/);
  assert.match(captured.sql,/expires_at>\?/);
  assert.match(captured.sql,/starts_at<=\?/);
});

test("approval is guarded by pending status and uses a single D1 batch", async () => {
  const statements=[];
  const payment={id:"pay-1",user_id:"123",package_type:"individual",amount:100,target_type:"individual",target_id:"123",status:"pending"};
  const env={PAYMENTS_DB:{
    prepare(sql){return {sql,bind(...params){return {sql,params,
      async first(){if(sql.includes("FROM payment_requests"))return payment;if(sql.includes("FROM subscriptions"))return null;return null;}
    };}};},
    async batch(items){statements.push(...items.map(x=>x.sql));return [{meta:{changes:1}},{meta:{changes:1}},{meta:{changes:1}}];}
  }};
  const result=await reviewPayment(env,"pay-1","approve","999");
  assert.equal(result.status,"approved");
  assert.ok(result.expiresAt-result.startsAt===30*24*60*60*1000);
  assert.match(statements[0],/status='pending'/);
  assert.match(statements[1],/WHERE changes\(\)>0/);
  assert.match(statements[1],/ON CONFLICT/);
});


test("Admin can suspend and resume subscriptions with expiry protection", async () => {
  const statements=[];
  const env={PAYMENTS_DB:{prepare(sql){return {bind(...params){return {async run(){statements.push({sql,params});return {meta:{changes:1}};}};}};}}};
  const suspended=await setSubscriptionStatus(env,"group","-100123","suspended","999");
  assert.equal(suspended.status,"suspended");
  assert.match(statements[0].sql,/status=\?/);
  assert.equal(statements[0].params[0],"suspended");
  const resumed=await setSubscriptionStatus(env,"group","-100123","active","999");
  assert.equal(resumed.status,"active");
  assert.match(statements[2].sql,/expires_at>\?/);
  assert.equal(statements[2].params[0],"active");
});

test("database schema prevents duplicate transactions and duplicate subscription targets", () => {
  assert.match(migration,/trx_id TEXT NOT NULL COLLATE NOCASE UNIQUE/);
  assert.match(migration,/UNIQUE\(target_type, target_id\)/);
  assert.match(migration,/UNIQUE\(event_key, update_key, recipient_type, recipient_id\)/);
  assert.match(migration,/pay_source_account TEXT NOT NULL/);
});

test("public payment callbacks are routed before the existing Admin-only control menu gate", () => {
  const callback=worker.slice(worker.indexOf("async function botHandleCallback"),worker.indexOf("async function umHandleCommand"));
  assert.ok(callback.indexOf('if(data.startsWith("p1:"))return paidHandleCallback(env,query);')>=0);
  assert.ok(callback.indexOf('if(data.startsWith("p1:"))return paidHandleCallback(env,query);')<callback.indexOf('if(query.message?.chat?.type!=="private"||!admins.has(sender))'));
  assert.match(worker,/\["payments","💳 Payments & Subscriptions"\]/);
  assert.match(worker,/paidHandleGroupConnect/);
  assert.match(worker,/getChatMember/);
  assert.match(worker,/setSubscriptionStatus/);
  assert.match(miniapp,/data-payment-action="suspend"/);
});

test("News Alert dispatch has no public single-chat fallback and requires paid recipients", () => {
  const start=worker.indexOf("async function newsBreakingAlertCheck");
  const end=worker.indexOf("const SHEETS_SPREADSHEET_ID",start);
  const dispatcher=worker.slice(start,end);
  assert.match(dispatcher,/env\.PAYMENTS_DB/);
  assert.match(dispatcher,/listActiveAlertRecipients\(env\)/);
  assert.match(dispatcher,/sendNewsAlertMedia\(env,recipientId/);
  assert.doesNotMatch(dispatcher,/env\.TELEGRAM_CHAT_ID/);
  assert.match(dispatcher,/getDelivery\(env,key,updateKey/);
});

test("Control Center exposes a Payments & Subscriptions module with authenticated actions", () => {
  assert.match(miniapp,/\["payments","▣","Payments & Subscriptions"/);
  assert.match(miniapp,/api\("paymentAdminOverview"\)/);
  assert.match(miniapp,/api\("paymentAdminAction"/);
  assert.match(worker,/if\(action==="paymentAdminOverview"\)/);
  assert.match(worker,/if\(action==="paymentAdminAction"\)/);
  assert.match(worker,/function miniAppAuthorize/);
});
