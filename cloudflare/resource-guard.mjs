export const BOT_KV_WRITE_PAUSE_KEY = "resource-guard:bot-kv-write-pause:v1";

export function nextUtcMidnight(now = Date.now()) {
  const date = new Date(now);
  return Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate() + 1);
}

export function secondsUntilUtcReset(now = Date.now()) {
  return Math.max(1, Math.ceil((nextUtcMidnight(now) - now) / 1000));
}

export function shouldPauseBotForKvWrites(used, limit, threshold = 98) {
  const current = Number(used);
  const maximum = Number(limit);
  return Number.isFinite(current) && Number.isFinite(maximum) && maximum > 0 &&
    current / maximum * 100 >= threshold;
}

export function isKvWriteLimitError(error) {
  const message = String(error?.message || error || "");
  return /(?:KV|Workers KV).*(?:put|write).*(?:limit exceeded|exceeded.*limit)|put\(\) limit exceeded|daily (?:KV )?write limit/i.test(message);
}
