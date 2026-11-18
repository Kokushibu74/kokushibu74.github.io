import { DurableObject } from "cloudflare:workers";

const PAUSE_KEY = "kv-write-pause:v1";

/**
 * Single strongly-consistent, persistent pause marker shared by all Worker
 * isolates. The object is intentionally tiny: one record, one named instance.
 */
export class BotKvPauseState extends DurableObject {
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
    return { ...state, paused: true };
  }
}
