const PAUSE_KEY = "kv-write-pause:v1";

/**
 * Storage contract used by the Cloudflare Durable Object wrapper.
 * Kept runtime-agnostic so Node tests can exercise persistence without importing cloudflare:workers.
 */
export class BotKvPauseStateStorage {
  constructor(ctx, env) {
    this.ctx = ctx;
    this.env = env;
  }

  async getPauseState(now = Date.now()) {
    const state = await this.ctx.storage.get(PAUSE_KEY);
    if (!state || Number(state.until) <= now) return { paused: false, until: 0 };
    return { ...state, paused: true };
  }

  async setPauseState(state) {
    if (!state || !Number.isFinite(Number(state.until)) || Number(state.until) <= Date.now()) {
      throw new Error("Invalid or expired KV pause state");
    }
    await this.ctx.storage.put(PAUSE_KEY, state);
    const persisted = await this.ctx.storage.get(PAUSE_KEY);
    if (!persisted || Number(persisted.until) !== Number(state.until)) {
      throw new Error("KV pause state write could not be verified");
    }
    return { ...persisted, paused: true };
  }
}
