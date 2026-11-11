const DAY_MS = 30 * 24 * 60 * 60 * 1000;

export const PAYMENT_RECEIVER = "01620107233";
export const PACKAGE_PRICES = Object.freeze({ individual: 100, group: 300 });

function db(env) {
  if (!env?.PAYMENTS_DB) throw new Error("Paid subscription database is not configured.");
  return env.PAYMENTS_DB;
}

function rows(result) {
  return Array.isArray(result?.results) ? result.results : [];
}

export async function createPaymentRequest(env, input) {
  const amount = PACKAGE_PRICES[input.packageType];
  if (!amount) throw new Error("Unsupported subscription package.");
  const id = crypto.randomUUID();
  const submittedAt = Date.now();
  await db(env).prepare(`
    INSERT INTO payment_requests
      (id,user_id,username,package_type,amount,payment_method,pay_source_account,
       receiver_account,trx_id,target_type,target_id,target_title,status,submitted_at)
    VALUES (?,?,?,?,?,?,?,?,?,?,?,?,'pending',?)
  `).bind(
    id, String(input.userId), String(input.username || "").slice(0,80) || null,
    input.packageType, amount, input.paymentMethod, input.paySourceAccount,
    PAYMENT_RECEIVER, input.screenshotFileId || null, input.trxId.trim(), input.packageType,
    String(input.targetId), String(input.targetTitle || "").slice(0,120) || null,
    submittedAt
  ).run();
  return {
    id, userId:String(input.userId), username:input.username || "",
    packageType:input.packageType, amount, paymentMethod:input.paymentMethod,
    paySourceAccount:input.paySourceAccount, receiverAccount:PAYMENT_RECEIVER,
    trxId:input.trxId.trim(), targetType:input.packageType,
    targetId:String(input.targetId), targetTitle:input.targetTitle || "",
    status:"pending", submittedAt
  };
}

export async function getPayment(env, id) {
  return db(env).prepare("SELECT * FROM payment_requests WHERE id = ? LIMIT 1").bind(String(id)).first();
}

export async function listPendingPayments(env, limit=20) {
  const result = await db(env).prepare(
    "SELECT * FROM payment_requests WHERE status='pending' ORDER BY submitted_at ASC LIMIT ?"
  ).bind(Math.max(1, Math.min(50, Number(limit) || 20))).all();
  return result.results || [];
}

export async function listUserPayments(env, userId, limit=10) {
  const result = await db(env).prepare(
    "SELECT id,package_type,amount,payment_method,trx_id,status,submitted_at,reviewed_at FROM payment_requests WHERE user_id=? ORDER BY submitted_at DESC LIMIT ?"
  ).bind(String(userId), Math.max(1, Math.min(20, Number(limit) || 10))).all();
  return result.results || [];
}

export async function listUserSubscriptions(env, userId) {
  const result = await db(env).prepare(
    "SELECT * FROM subscriptions WHERE owner_user_id=? ORDER BY updated_at DESC LIMIT 30"
  ).bind(String(userId)).all();
  return result.results || [];
}

export async function listActiveAlertRecipients(env) {
  const now = Date.now();
  const result = await db(env).prepare(
    "SELECT target_type,target_id,owner_user_id,starts_at,expires_at FROM subscriptions WHERE status='active' AND starts_at<=? AND expires_at>? ORDER BY target_type,target_id LIMIT 2000"
  ).bind(now, now).all();
  return result.results || [];
}

export async function getDelivery(env, eventKey, updateKey, recipientType, recipientId) {
  return db(env).prepare(
    "SELECT * FROM alert_deliveries WHERE event_key=? AND update_key=? AND recipient_type=? AND recipient_id=? LIMIT 1"
  ).bind(String(eventKey), String(updateKey), String(recipientType), String(recipientId)).first();
}

export async function getLatestDelivery(env, eventKey, recipientType, recipientId) {
  return db(env).prepare(
    "SELECT message_id,delivered_at FROM alert_deliveries WHERE event_key=? AND recipient_type=? AND recipient_id=? AND status='sent' ORDER BY delivered_at DESC LIMIT 1"
  ).bind(String(eventKey), String(recipientType), String(recipientId)).first();
}

export async function saveDelivery(env, input) {
  const id = crypto.randomUUID();
  await db(env).prepare(`
    INSERT INTO alert_deliveries
      (id,event_key,update_key,recipient_type,recipient_id,message_id,status,delivered_at,error)
    VALUES (?,?,?,?,?,?,'sent',?,NULL)
    ON CONFLICT(event_key,update_key,recipient_type,recipient_id)
    DO UPDATE SET message_id=excluded.message_id,status='sent',delivered_at=excluded.delivered_at,error=NULL
  `).bind(
    id, String(input.eventKey), String(input.updateKey),
    String(input.recipientType), String(input.recipientId),
    Number(input.messageId) || null, Date.now()
  ).run();
}

export async function recordDeliveryFailure(env, input) {
  const id = crypto.randomUUID();
  await db(env).prepare(`
    INSERT INTO alert_deliveries
      (id,event_key,update_key,recipient_type,recipient_id,status,delivered_at,error)
    VALUES (?,?,?,?,?,'failed',?,?)
    ON CONFLICT(event_key,update_key,recipient_type,recipient_id)
    DO UPDATE SET status='failed',delivered_at=excluded.delivered_at,error=excluded.error
  `).bind(
    id, String(input.eventKey), String(input.updateKey),
    String(input.recipientType), String(input.recipientId),
    Date.now(), String(input.error || "Telegram delivery failed").slice(0,240)
  ).run();
}

export async function reviewPayment(env, paymentId, action, adminId, reason="") {
  const database = db(env);
  const payment = await getPayment(env, paymentId);
  if (!payment) throw new Error("Payment request not found.");
  if (payment.status !== "pending") throw new Error("This payment request has already been reviewed.");
  const now = Date.now();
  const token = crypto.randomUUID();
  if (action === "reject") {
    const result = await database.batch([
      database.prepare(
        "UPDATE payment_requests SET status='rejected',reviewed_at=?,reviewed_by=?,review_token=?,rejection_reason=? WHERE id=? AND status='pending'"
      ).bind(now, String(adminId), token, String(reason || "").slice(0,240), String(paymentId)),
      database.prepare(
        "INSERT INTO payment_audit(id,payment_id,actor_id,action,details,created_at) SELECT ?,?,?, 'payment_rejected', ?, ? WHERE changes()>0"
      ).bind(crypto.randomUUID(), String(paymentId), String(adminId), String(reason || ""), now)
    ]);
    if (Number(result?.[0]?.meta?.changes || 0) !== 1) throw new Error("Payment request was already reviewed.");
    return {payment, status:"rejected"};
  }
  if (action !== "approve") throw new Error("Unsupported payment review action.");
  const existing = await database.prepare(
    "SELECT status,expires_at FROM subscriptions WHERE target_type=? AND target_id=? LIMIT 1"
  ).bind(payment.target_type, payment.target_id).first();
  const startsAt = existing?.status === "active" && Number(existing.expires_at) > now
    ? Number(existing.expires_at) : now;
  const expiresAt = startsAt + DAY_MS;
  const result = await database.batch([
    database.prepare(
      "UPDATE payment_requests SET status='approved',reviewed_at=?,reviewed_by=?,review_token=? WHERE id=? AND status='pending'"
    ).bind(now, String(adminId), token, String(paymentId)),
    database.prepare(`
      INSERT INTO subscriptions
        (id,target_type,target_id,owner_user_id,package_type,amount,status,starts_at,expires_at,created_at,updated_at)
      SELECT ?,?,?,?,?,?,'active',?,?,?,?,?
      WHERE changes()>0
      ON CONFLICT(target_type,target_id) DO UPDATE SET
        owner_user_id=excluded.owner_user_id,
        package_type=excluded.package_type,
        amount=excluded.amount,
        status='active',
        starts_at=excluded.starts_at,
        expires_at=excluded.expires_at,
        updated_at=excluded.updated_at
    `).bind(
      crypto.randomUUID(), payment.target_type, payment.target_id,
      payment.user_id, payment.package_type, payment.amount,
      startsAt, expiresAt, now, now
    ),
    database.prepare(
      "INSERT INTO payment_audit(id,payment_id,actor_id,action,details,created_at) SELECT ?,?,?, 'payment_approved', ?, ? WHERE changes()>0"
    ).bind(crypto.randomUUID(), String(paymentId), String(adminId), JSON.stringify({startsAt,expiresAt}), now)
  ]);
  if (Number(result?.[0]?.meta?.changes || 0) !== 1) throw new Error("Payment request was already reviewed.");
  return {payment, status:"approved", startsAt, expiresAt};
}

export async function extendSubscription(env, targetType, targetId, days, adminId) {
  const database = db(env);
  if (!["individual","group"].includes(targetType)) throw new Error("Invalid subscription target.");
  const amountDays = Math.max(1, Math.min(365, Number(days) || 0));
  const now = Date.now();
  const result = await database.prepare(`
    UPDATE subscriptions
    SET starts_at=CASE WHEN expires_at>? THEN starts_at ELSE ? END,
        expires_at=(CASE WHEN expires_at>? THEN expires_at ELSE ? END)+?,
        status='active',updated_at=?
    WHERE target_type=? AND target_id=?
  `).bind(now, now, now, now, amountDays * 86400000, now, targetType, String(targetId)).run();
  if (Number(result?.meta?.changes || 0) !== 1) throw new Error("Subscription not found.");
  await database.prepare(
    "INSERT INTO payment_audit(id,actor_id,action,details,created_at) VALUES(?,?,'subscription_extended',?,?)"
  ).bind(crypto.randomUUID(), String(adminId), JSON.stringify({targetType,targetId:String(targetId),days:amountDays}), now).run();
  return {targetType,targetId:String(targetId),days:amountDays};
}

export async function listSubscriptions(env, filter="all", limit=100) {
  const where = filter === "expired"
    ? "WHERE expires_at<=? OR status!='active'"
    : filter === "groups" ? "WHERE target_type='group'"
    : filter === "individual" ? "WHERE target_type='individual'"
    : "";
  const params = filter === "expired" ? [Date.now(), Math.max(1,Math.min(200,limit))]
    : [Math.max(1,Math.min(200,limit))];
  const result = await db(env).prepare(
    "SELECT * FROM subscriptions " + where + " ORDER BY expires_at ASC LIMIT ?"
  ).bind(...params).all();
  return result.results || [];
}

export async function getRevenueSummary(env) {
  const result = await db(env).prepare(`
    SELECT
      COALESCE(SUM(CASE WHEN status='approved' THEN amount ELSE 0 END),0) AS approved_total,
      COALESCE(SUM(CASE WHEN status='pending' THEN amount ELSE 0 END),0) AS pending_total,
      SUM(CASE WHEN status='approved' THEN 1 ELSE 0 END) AS approved_count,
      SUM(CASE WHEN status='pending' THEN 1 ELSE 0 END) AS pending_count,
      SUM(CASE WHEN status='rejected' THEN 1 ELSE 0 END) AS rejected_count
    FROM payment_requests
  `).first();
  return result || {approved_total:0,pending_total:0,approved_count:0,pending_count:0,rejected_count:0};
}

export async function getPaymentAdminOverview(env) {
  const [pending,individual,groups,expired,revenue] = await Promise.all([
    db(env).prepare("SELECT COUNT(*) AS count FROM payment_requests WHERE status='pending'").first(),
    db(env).prepare("SELECT COUNT(*) AS count FROM subscriptions WHERE target_type='individual' AND status='active' AND expires_at>?").bind(Date.now()).first(),
    db(env).prepare("SELECT COUNT(*) AS count FROM subscriptions WHERE target_type='group' AND status='active' AND expires_at>?").bind(Date.now()).first(),
    db(env).prepare("SELECT COUNT(*) AS count FROM subscriptions WHERE status!='active' OR expires_at<=?").bind(Date.now()).first(),
    getRevenueSummary(env)
  ]);
  return {
    pendingPayments:Number(pending?.count||0),
    activeIndividuals:Number(individual?.count||0),
    activeGroups:Number(groups?.count||0),
    expiredSubscriptions:Number(expired?.count||0),
    revenue
  };
}
