const REPO = "Kokushibu74/kokushibu74.github.io";
const API = "https://api.github.com/repos/" + REPO + "/contents/";
const DATA_PATH = "journal-private.json";
const PUBLIC_ORIGIN = "https://kokushibu74.github.io";

function cleanText(value, max, fallback = "") {
  return String(value ?? "").replace(/[\u0000-\u001f]/g, " ").replace(/\s+/g, " ").trim().slice(0, max) || fallback;
}

function encodeBase64(bytes) {
  let binary = "";
  for (let i = 0; i < bytes.length; i += 0x8000) binary += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  return btoa(binary);
}

function decodeGithubFile(value) {
  const raw = atob(String(value || "").replace(/\s/g, ""));
  const bytes = Uint8Array.from(raw, char => char.charCodeAt(0));
  return new TextDecoder().decode(bytes);
}

function decodeBase64Bytes(value) {
  const raw = atob(String(value || "").replace(/\s/g, ""));
  return Uint8Array.from(raw, char => char.charCodeAt(0));
}

async function journalCryptoKey(env) {
  if (!env?.JOURNAL_ENCRYPTION_KEY) throw new Error("Journal encryption key is not configured.");
  const raw = decodeBase64Bytes(env.JOURNAL_ENCRYPTION_KEY);
  if (raw.length !== 32) throw new Error("Journal encryption key has an invalid length.");
  return crypto.subtle.importKey("raw", raw, { name: "AES-GCM" }, false, ["encrypt", "decrypt"]);
}

export async function encryptJournal(env, journal) {
  const key = await journalCryptoKey(env);
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const plaintext = new TextEncoder().encode(JSON.stringify(journal));
  const ciphertext = await crypto.subtle.encrypt({ name: "AES-GCM", iv }, key, plaintext);
  return {
    version: 1,
    algorithm: "AES-256-GCM",
    iv: encodeBase64(iv),
    ciphertext: encodeBase64(new Uint8Array(ciphertext))
  };
}

export async function decryptJournal(env, envelope) {
  if (!envelope || envelope.version !== 1 || envelope.algorithm !== "AES-256-GCM") {
    throw new Error("Private Journal encryption envelope is invalid.");
  }
  const key = await journalCryptoKey(env);
  const iv = decodeBase64Bytes(envelope.iv);
  const ciphertext = decodeBase64Bytes(envelope.ciphertext);
  if (iv.length !== 12 || ciphertext.length < 16) throw new Error("Private Journal ciphertext is invalid.");
  let plaintext;
  try { plaintext = await crypto.subtle.decrypt({ name: "AES-GCM", iv }, key, ciphertext); }
  catch { throw new Error("Private Journal could not be decrypted. The encryption key may have changed."); }
  let journal;
  try { journal = JSON.parse(new TextDecoder().decode(plaintext)); }
  catch { throw new Error("Decrypted Journal data is invalid JSON."); }
  if (!journal || !Array.isArray(journal.posts)) throw new Error("Decrypted Journal data has an invalid structure.");
  return { version: 1, posts: journal.posts };
}


function githubHeaders(env) {
  if (!env?.GITHUB_TOKEN) throw new Error("Blog publishing is unavailable: GitHub write access is not configured.");
  return {
    Authorization: "Bearer " + env.GITHUB_TOKEN,
    Accept: "application/vnd.github+json",
    "User-Agent": "Kokushibu74-Developer-Journal",
    "X-GitHub-Api-Version": "2022-11-28",
    "Content-Type": "application/json"
  };
}

async function githubJson(env, path, options = {}) {
  const response = await fetch(API + path, {
    ...options,
    headers: { ...githubHeaders(env), ...(options.headers || {}) },
    signal: options.signal || AbortSignal.timeout(15000)
  });
  const data = await response.json().catch(() => ({}));
  return { response, data };
}

async function readJournal(env) {
  const { response, data } = await githubJson(env, DATA_PATH + "?ref=main", { method: "GET" });
  if (response.status === 404) return { sha: null, journal: { version: 1, posts: [] } };
  if (!response.ok || !data.content || !data.sha) {
    throw new Error("Could not read the private Developer Journal data from GitHub (HTTP " + response.status + ").");
  }
  let envelope;
  try { envelope = JSON.parse(decodeGithubFile(data.content)); }
  catch { throw new Error("Private Journal envelope is invalid JSON. No changes were made."); }
  const journal = await decryptJournal(env, envelope);
  return { sha: data.sha, journal };
}

async function updateJournal(env, message, mutate) {
  for (let attempt = 0; attempt < 2; attempt++) {
    const current = await readJournal(env);
    const next = await mutate(current.journal);
    const envelope = await encryptJournal(env, next);
    const bytes = new TextEncoder().encode(JSON.stringify(envelope, null, 2) + "\n");
    const payload = { message, content: encodeBase64(bytes), branch: "main" };
    if (current.sha) payload.sha = current.sha;
    const { response, data } = await githubJson(env, DATA_PATH, { method: "PUT", body: JSON.stringify(payload) });
    if (response.ok && data.content?.sha) return { commit: data.commit?.sha || null, posts: next.posts };
    if (attempt === 0 && (response.status === 409 || response.status === 422)) continue;
    const detail = cleanText(data.message || data.errors?.[0]?.message || "GitHub rejected the update.", 150);
    throw new Error("Could not publish the Journal update (HTTP " + response.status + "): " + detail);
  }
  throw new Error("The Journal changed during this update. Reload the Blog Manager and try again.");
}

export function validateCharts(input) {
  const charts = Array.isArray(input) ? input : [];
  if (charts.length > 8) throw new Error("A blog post can contain up to 8 charts.");
  return charts.map((chart, index) => {
    const id = cleanText(chart?.id, 40);
    const title = cleanText(chart?.title, 100, "Data chart");
    const type = chart?.type === "line" ? "line" : "bar";
    const labels = Array.isArray(chart?.labels) ? chart.labels.slice(0, 16).map(x => cleanText(x, 32)) : [];
    const datasets = Array.isArray(chart?.datasets) ? chart.datasets.slice(0, 4) : [];
    if (!/^[a-z0-9_-]{1,40}$/i.test(id) || !labels.length || !datasets.length) {
      throw new Error("Chart " + (index + 1) + " needs a valid id, labels and datasets.");
    }
    const cleanSets = datasets.map((set, setIndex) => {
      const values = Array.isArray(set?.data) ? set.data.slice(0, 16).map(Number) : [];
      if (values.length !== labels.length || values.some(value => !Number.isFinite(value))) {
        throw new Error("Chart " + id + " dataset " + (setIndex + 1) + " must have one finite number per label.");
      }
      return { label: cleanText(set?.label, 50, "Series " + (setIndex + 1)), data: values };
    });
    return { id, title, type, labels, datasets: cleanSets };
  });
}

export function validatePost(input, existing, now = Date.now()) {
  const id = cleanText(input?.id, 80);
  const title = cleanText(input?.title, 160);
  const description = cleanText(input?.description, 600);
  const content = String(input?.content ?? "").replace(/\u0000/g, "").slice(0, 120000);
  const category = cleanText(input?.category, 40, "Development");
  const status = ["draft", "published", "scheduled"].includes(input?.status) ? input.status : "draft";
  const publishAt = input?.publishAt ? new Date(input.publishAt).toISOString() : new Date(now).toISOString();
  if (!/^[a-z0-9_-]{8,80}$/i.test(id)) throw new Error("Invalid blog post ID.");
  if (!title) throw new Error("A blog title is required.");
  if (!description) throw new Error("A short description is required.");
  if (!content.trim()) throw new Error("The article body cannot be empty.");
  if (!Number.isFinite(Date.parse(publishAt))) throw new Error("Invalid publication date and time.");
  const coverImage = cleanText(input?.coverImage, 700);
  if (coverImage && !/^https:\/\//i.test(coverImage) && !/^storage\/journal\/[a-z0-9_./-]+$/i.test(coverImage)) {
    throw new Error("Cover image must be an HTTPS URL or a Journal media path.");
  }
  return {
    id, title, description, category, content,
    charts: validateCharts(input?.charts),
    coverImage,
    status,
    pinned: input?.pinned === true,
    publishAt,
    createdAt: existing?.createdAt || new Date(now).toISOString(),
    publishedAt: status === "published" ? (existing?.publishedAt || new Date(now).toISOString()) : (existing?.publishedAt || null),
    updatedAt: new Date(now).toISOString(),
    deletedAt: null,
    previousStatus: null
  };
}

export function isPublicJournalPost(post, now = Date.now()) {
  if (!post || post.deletedAt) return false;
  if (post.status === "published") return true;
  return post.status === "scheduled" && Number.isFinite(Date.parse(post.publishAt)) && Date.parse(post.publishAt) <= now;
}

export async function getPublicJournalFeed(env, now = Date.now()) {
  const posts = await listJournalPosts(env);
  return posts.filter(post => isPublicJournalPost(post, now))
    .sort((a, b) => Number(b.pinned === true) - Number(a.pinned === true) || Date.parse(b.publishAt || b.publishedAt || 0) - Date.parse(a.publishAt || a.publishedAt || 0))
    .slice(0, 100)
    .map(post => ({
      id: post.id, title: post.title, description: post.description,
      category: post.category, content: post.content, charts: post.charts || [],
      coverImage: post.coverImage || "", pinned: post.pinned === true, status: "published",
      publishAt: post.publishAt, publishedAt: post.publishedAt, createdAt: post.createdAt
    }));
}

export async function listJournalPosts(env) {
  const { journal } = await readJournal(env);
  return journal.posts.slice().sort((a, b) => Date.parse(b.publishAt || b.createdAt || 0) - Date.parse(a.publishAt || a.createdAt || 0));
}

export async function saveJournalPost(env, userId, input) {
  if (!userId) throw new Error("Admin identity is required.");
  let saved = null;
  const result = await updateJournal(env, "content: publish Developer Journal post", journal => {
    const posts = journal.posts.slice();
    const index = posts.findIndex(post => post.id === String(input?.id || ""));
    const existing = index >= 0 ? posts[index] : null;
    if (existing?.deletedAt) throw new Error("This post is in Trash. Restore it before editing.");
    saved = validatePost(input, existing);
    if (index >= 0) posts[index] = saved;
    else posts.push(saved);
    return { version: 1, posts };
  });
  return { post: saved, commit: result.commit };
}

export async function uploadJournalImage(env, userId, input) {
  if (!userId) throw new Error("Admin identity is required.");
  const postId = cleanText(input?.postId, 80);
  const mime = String(input?.mimeType || "");
  const base64 = String(input?.base64 || "");
  if (!/^[a-z0-9_-]{8,80}$/i.test(postId)) throw new Error("Save or start a post before uploading its image.");
  if (!["image/jpeg", "image/png", "image/webp"].includes(mime)) throw new Error("Only JPEG, PNG and WebP images are supported.");
  if (!base64 || base64.length > Math.ceil(4 * 1024 * 1024 * 4 / 3) + 16 || !/^[A-Za-z0-9+/]+={0,2}$/.test(base64)) {
    throw new Error("Each image must be 4 MB or smaller and valid base64.");
  }
  const bytes = Uint8Array.from(atob(base64), char => char.charCodeAt(0));
  if (bytes.length < 16 || bytes.length > 4 * 1024 * 1024) throw new Error("Image must be between 16 bytes and 4 MB.");
  const jpeg = bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff;
  const png = bytes[0] === 0x89 && bytes[1] === 0x50 && bytes[2] === 0x4e && bytes[3] === 0x47;
  const webp = String.fromCharCode(...bytes.slice(0, 4)) === "RIFF" && String.fromCharCode(...bytes.slice(8, 12)) === "WEBP";
  if (!(mime === "image/jpeg" && jpeg || mime === "image/png" && png || mime === "image/webp" && webp)) {
    throw new Error("Image file content does not match its declared format.");
  }
  const ext = mime === "image/png" ? "png" : mime === "image/webp" ? "webp" : "jpg";
  const filename = Date.now() + "-" + crypto.randomUUID().slice(0, 8) + "." + ext;
  const path = "storage/journal/" + postId + "/" + filename;
  const { response, data } = await githubJson(env, path, {
    method: "PUT",
    body: JSON.stringify({ message: "content: add Developer Journal media", content: encodeBase64(bytes), branch: "main" })
  });
  if (!response.ok || !data.content?.path) {
    throw new Error("Journal image upload failed (HTTP " + response.status + ").");
  }
  return { path, url: PUBLIC_ORIGIN + "/" + path, commit: data.commit?.sha || null, bytes: bytes.length };
}

async function changePostStatus(env, userId, id, action) {
  if (!userId) throw new Error("Admin identity is required.");
  const postId = cleanText(id, 80);
  if (!/^[a-z0-9_-]{8,80}$/i.test(postId)) throw new Error("Invalid blog post ID.");
  let changed = null;
  const result = await updateJournal(env, action === "trash" ? "content: move Developer Journal post to Trash" : "content: restore Developer Journal post", journal => {
    const posts = journal.posts.slice();
    const index = posts.findIndex(post => post.id === postId);
    if (index < 0) throw new Error("Blog post not found.");
    const post = { ...posts[index] };
    if (action === "trash") {
      if (post.deletedAt) throw new Error("This post is already in Trash.");
      post.previousStatus = post.status || "draft";
      post.status = "trash";
      post.deletedAt = new Date().toISOString();
    } else {
      if (!post.deletedAt) throw new Error("This post is not in Trash.");
      post.status = ["draft", "published", "scheduled"].includes(post.previousStatus) ? post.previousStatus : "draft";
      post.deletedAt = null;
      post.previousStatus = null;
    }
    post.updatedAt = new Date().toISOString();
    posts[index] = post;
    changed = post;
    return { version: 1, posts };
  });
  return { post: changed, commit: result.commit };
}

export async function trashJournalPost(env, userId, id) {
  return changePostStatus(env, userId, id, "trash");
}

export async function restoreJournalPost(env, userId, id) {
  return changePostStatus(env, userId, id, "restore");
}
