import test from "node:test";
import assert from "node:assert/strict";
import { isPublicJournalPost, validateCharts, validatePost, encryptJournal, decryptJournal, getPublicJournalFeed, generateShortDescription, inferJournalCategory } from "../cloudflare/blog-manager.mjs";
import { webcrypto } from "node:crypto";
globalThis.crypto ||= webcrypto;

test("published articles are public and drafts remain private", () => {
  assert.equal(isPublicJournalPost({ status: "published", publishAt: "2026-11-09T00:00:00.000Z" }), true);
  assert.equal(isPublicJournalPost({ status: "draft", publishAt: "2026-11-09T00:00:00.000Z" }), false);
  assert.equal(isPublicJournalPost({ status: "trash", publishAt: "2026-11-09T00:00:00.000Z" }), false);
});

test("scheduled articles appear only after their publication time", () => {
  const post = { status: "scheduled", publishAt: "2026-11-10T00:00:00.000Z" };
  assert.equal(isPublicJournalPost(post, Date.parse("2026-11-09T23:59:59.000Z")), false);
  assert.equal(isPublicJournalPost(post, Date.parse("2026-11-10T00:00:00.000Z")), true);
});

test("deleted articles never appear publicly", () => {
  assert.equal(isPublicJournalPost({ status: "published", deletedAt: "2026-11-09T00:00:00.000Z" }), false);
});

test("chart payloads require matching finite values and labels", () => {
  const charts = validateCharts([{
    id: "traffic",
    title: "Monthly visitors",
    type: "bar",
    labels: ["Jan", "Feb"],
    datasets: [{ label: "Visitors", data: [120, 180] }]
  }]);
  assert.equal(charts.length, 1);
  assert.throws(() => validateCharts([{
    id: "bad",
    labels: ["Jan", "Feb"],
    datasets: [{ data: [1] }]
  }]), /one finite number per label/);
  assert.throws(() => validateCharts([{ id: "bad id", labels: ["Jan"], datasets: [{ data: [1] }] }]), /valid id/);
});

test("article input is normalized and preserves its creation timestamp", () => {
  const createdAt = "2026-11-01T00:00:00.000Z";
  const post = validatePost({
    id: "blog_12345678",
    title: "  Building a safer website  ",
    description: "A short description",
    category: "Development",
    content: "# Notes\n\nA useful article.",
    charts: [],
    status: "published",
    publishAt: "2026-11-09T12:00:00.000Z",
    pinned: true
  }, { createdAt }, Date.parse("2026-11-09T12:30:00.000Z"));
  assert.equal(post.title, "Building a safer website");
  assert.equal(post.createdAt, createdAt);
  assert.equal(post.pinned, true);
  assert.equal(post.status, "published");
});

test("invalid image URLs and empty article bodies are rejected", () => {
  const base = { id: "blog_12345678", title: "Title", description: "Description", content: "Text", status: "draft" };
  assert.throws(() => validatePost({ ...base, coverImage: "javascript:alert(1)" }), /Cover image/);
  assert.throws(() => validatePost({ ...base, content: "   " }), /cannot be empty/);
});

console.log("Developer Journal validation and publication rules passed.");

test("private drafts are encrypted with AES-GCM and decrypt only with the configured key", async () => {
  const env = { JOURNAL_ENCRYPTION_KEY: Buffer.alloc(32, 9).toString("base64") };
  const journal = { version: 1, posts: [{ id: "blog_12345678", title: "Private draft title", status: "draft" }] };
  const envelope = await encryptJournal(env, journal);
  assert.equal(envelope.algorithm, "AES-256-GCM");
  assert.equal(JSON.stringify(envelope).includes("Private draft title"), false);
  assert.deepEqual(await decryptJournal(env, envelope), journal);
  const second = await encryptJournal(env, journal);
  assert.notEqual(envelope.iv, second.iv, "AES-GCM must use a fresh random IV for every write");
  const wrongKey = { JOURNAL_ENCRYPTION_KEY: Buffer.alloc(32, 8).toString("base64") };
  await assert.rejects(() => decryptJournal(wrongKey, envelope), /could not be decrypted/);
});

test("public feed contains only published and due scheduled posts with an explicit public status", async () => {
  const env = { GITHUB_TOKEN: "test-token", JOURNAL_ENCRYPTION_KEY: Buffer.alloc(32, 9).toString("base64") };
  const now = Date.parse("2026-11-09T12:00:00.000Z");
  const journal = { version: 1, posts: [
    { id: "blog_public01", title: "Public article", description: "Public", category: "Development", content: "Public body", status: "published", publishAt: "2026-11-09T10:00:00.000Z" },
    { id: "blog_draft001", title: "Private draft", description: "Draft", category: "Development", content: "Draft body", status: "draft", publishAt: "2026-11-09T11:00:00.000Z" },
    { id: "blog_future01", title: "Future scheduled", description: "Future", category: "Development", content: "Future body", status: "scheduled", publishAt: "2026-11-10T10:00:00.000Z" },
    { id: "blog_due0001", title: "Due scheduled", description: "Due", category: "Development", content: "Due body", status: "scheduled", publishAt: "2026-11-09T11:00:00.000Z" },
    { id: "blog_trash01", title: "Trashed article", description: "Trash", category: "Development", content: "Trash body", status: "published", deletedAt: "2026-11-09T11:30:00.000Z", publishAt: "2026-11-09T09:00:00.000Z" }
  ] };
  const envelope = await encryptJournal(env, journal);
  const content = Buffer.from(JSON.stringify(envelope), "utf8").toString("base64");
  const originalFetch = globalThis.fetch;
  globalThis.fetch = async () => new Response(JSON.stringify({ content, sha: "test-sha" }), { status: 200 });
  try {
    const posts = await getPublicJournalFeed(env, now);
    assert.deepEqual(posts.map(post => post.id), ["blog_due0001", "blog_public01"]);
    assert.ok(posts.every(post => post.status === "published"));
    assert.ok(posts.every(post => !post.deletedAt && !post.previousStatus));
  } finally {
    globalThis.fetch = originalFetch;
  }
});


test("smart publishing generates a concise summary and infers a content category", () => {\n  const content = "# Deploying an AI agent\\n\\nThis guide explains how to deploy an AI agent with Cloudflare Workers and verify its runtime behavior.";\n  assert.match(generateShortDescription(content), /^This guide explains how to deploy an AI agent/);\n  assert.equal(inferJournalCategory("Deploying an AI agent", content), "AI & Automation");\n  const post = validatePost({ id: "blog_smart001", title: "Deploying an AI agent", content, status: "published" });\n  assert.ok(post.description.length > 20);\n  assert.equal(post.category, "AI & Automation");\n});\n