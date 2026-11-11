-- Paid News Alert subscriptions: payments, access control, delivery idempotency and audit history.
PRAGMA foreign_keys = ON;

CREATE TABLE IF NOT EXISTS payment_requests (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL,
  username TEXT,
  package_type TEXT NOT NULL CHECK (package_type IN ('individual','group')),
  amount INTEGER NOT NULL CHECK (amount > 0),
  payment_method TEXT NOT NULL CHECK (payment_method IN ('bkash','nagad')),
  pay_source_account TEXT NOT NULL,
  receiver_account TEXT NOT NULL,
  screenshot_file_id TEXT,
  trx_id TEXT NOT NULL COLLATE NOCASE UNIQUE,
  target_type TEXT NOT NULL CHECK (target_type IN ('individual','group')),
  target_id TEXT NOT NULL,
  target_title TEXT,
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','approved','rejected')),
  submitted_at INTEGER NOT NULL,
  reviewed_at INTEGER,
  reviewed_by TEXT,
  review_token TEXT,
  rejection_reason TEXT
);

CREATE INDEX IF NOT EXISTS idx_payment_requests_user_submitted
  ON payment_requests(user_id, submitted_at DESC);
CREATE INDEX IF NOT EXISTS idx_payment_requests_status_submitted
  ON payment_requests(status, submitted_at DESC);
CREATE INDEX IF NOT EXISTS idx_payment_requests_target
  ON payment_requests(target_type, target_id, submitted_at DESC);

CREATE TABLE IF NOT EXISTS subscriptions (
  id TEXT PRIMARY KEY,
  target_type TEXT NOT NULL CHECK (target_type IN ('individual','group')),
  target_id TEXT NOT NULL,
  owner_user_id TEXT NOT NULL,
  package_type TEXT NOT NULL CHECK (package_type IN ('individual','group')),
  amount INTEGER NOT NULL CHECK (amount > 0),
  status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active','expired','suspended')),
  starts_at INTEGER NOT NULL,
  expires_at INTEGER NOT NULL,
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL,
  UNIQUE(target_type, target_id)
);

CREATE INDEX IF NOT EXISTS idx_subscriptions_active_expiry
  ON subscriptions(status, expires_at);
CREATE INDEX IF NOT EXISTS idx_subscriptions_owner
  ON subscriptions(owner_user_id, updated_at DESC);

CREATE TABLE IF NOT EXISTS alert_deliveries (
  id TEXT PRIMARY KEY,
  event_key TEXT NOT NULL,
  update_key TEXT NOT NULL,
  recipient_type TEXT NOT NULL CHECK (recipient_type IN ('individual','group')),
  recipient_id TEXT NOT NULL,
  message_id INTEGER,
  status TEXT NOT NULL CHECK (status IN ('sent','failed')),
  delivered_at INTEGER,
  error TEXT,
  UNIQUE(event_key, update_key, recipient_type, recipient_id)
);

CREATE INDEX IF NOT EXISTS idx_alert_deliveries_recipient
  ON alert_deliveries(recipient_type, recipient_id, delivered_at DESC);

CREATE TABLE IF NOT EXISTS payment_audit (
  id TEXT PRIMARY KEY,
  payment_id TEXT,
  actor_id TEXT NOT NULL,
  action TEXT NOT NULL,
  details TEXT,
  created_at INTEGER NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_payment_audit_created
  ON payment_audit(created_at DESC);
