import test from "node:test";
import assert from "node:assert/strict";
import { BotKvPauseState } from "../cloudflare/bot-kv-pause-state.mjs";

const makeStorage = (values = new Map()) => ({
  values,
  async get(key) { return this.values.get(key); },
  async put(key, value) { this.values.set(key, structuredClone(value)); }
});
const makeObject = storage => new BotKvPauseState({ storage }, {});

test("pause state survives a new Durable Object instance", async () => {
  const storage = makeStorage();
  const first = makeObject(storage);
  const state = { until: Date.now() + 60_000, reason: "test", used: 980, limit: 1000 };

  const saved = await first.setPauseState(state);
  assert.equal(saved.paused, true);
  assert.equal(saved.until, state.until);

  const restartedInstance = makeObject(storage);
  const loaded = await restartedInstance.getPauseState();
  assert.equal(loaded.paused, true);
  assert.equal(loaded.until, state.until);
  assert.equal(loaded.reason, "test");
});

test("expired pause state is reported as inactive", async () => {
  const storage = makeStorage(new Map([["kv-write-pause:v1", { until: 1000, reason: "expired" }]]));
  const object = makeObject(storage);
  assert.deepEqual(await object.getPauseState(1001), { paused: false, until: 0 });
});

test("invalid or expired pause writes are rejected", async () => {
  const object = makeObject(makeStorage());
  await assert.rejects(() => object.setPauseState(null), /Invalid or expired/);
  await assert.rejects(() => object.setPauseState({ until: Date.now() - 1 }), /Invalid or expired/);
  await assert.rejects(() => object.setPauseState({ until: "not-a-time" }), /Invalid or expired/);
});

test("write verification failure is surfaced", async () => {
  const storage = makeStorage();
  storage.get = async () => undefined;
  const object = makeObject(storage);
  await assert.rejects(
    () => object.setPauseState({ until: Date.now() + 60_000 }),
    /write could not be verified/
  );
});
