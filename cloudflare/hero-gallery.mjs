const REPO = "Kokushibu74/kokushibu74.github.io";
const API = "https://api.github.com/repos/" + REPO + "/contents/";
const SITE_DATA_PATH = "site-data.json";
const PENDING_PREFIX = "hero:pending:";

function encodeBase64(bytes) {
  let binary = "";
  for (let i = 0; i < bytes.length; i += 0x8000) binary += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  return btoa(binary);
}
function decodeBase64(value) {
  const raw = atob(String(value || "").replace(/\s/g, ""));
  return Uint8Array.from(raw, c => c.charCodeAt(0));
}
function concat(parts) {
  const size = parts.reduce((n, part) => n + part.length, 0);
  const out = new Uint8Array(size);
  let offset = 0;
  for (const part of parts) { out.set(part, offset); offset += part.length; }
  return out;
}
function ascii(bytes, start, length) {
  let value = "";
  for (let i = start; i < start + length; i++) value += String.fromCharCode(bytes[i]);
  return value;
}
function u32be(bytes, offset) {
  return ((bytes[offset] << 24) | (bytes[offset + 1] << 16) | (bytes[offset + 2] << 8) | bytes[offset + 3]) >>> 0;
}
function putU32be(bytes, offset, value) {
  bytes[offset] = (value >>> 24) & 255; bytes[offset + 1] = (value >>> 16) & 255;
  bytes[offset + 2] = (value >>> 8) & 255; bytes[offset + 3] = value & 255;
}
function u32le(bytes, offset) {
  return (bytes[offset] | (bytes[offset + 1] << 8) | (bytes[offset + 2] << 16) | (bytes[offset + 3] << 24)) >>> 0;
}
function putU32le(bytes, offset, value) {
  bytes[offset] = value & 255; bytes[offset + 1] = (value >>> 8) & 255;
  bytes[offset + 2] = (value >>> 16) & 255; bytes[offset + 3] = (value >>> 24) & 255;
}

function stripJpegMetadata(input) {
  if (input.length < 4 || input[0] !== 255 || input[1] !== 216) throw new Error("Invalid JPEG image.");
  const parts = [input.slice(0, 2)];
  let p = 2, inScan = false, scanStart = -1, sawEOI = false;
  while (p < input.length) {
    if (inScan) {
      let markerPos = -1;
      while (p < input.length) {
        if (input[p] === 255) {
          let q = p + 1;
          while (q < input.length && input[q] === 255) q++;
          if (q >= input.length) throw new Error("Truncated JPEG scan.");
          const marker = input[q];
          if (marker === 0x00 || (marker >= 0xd0 && marker <= 0xd7)) { p = q + 1; continue; }
          markerPos = p;
          break;
        }
        p++;
      }
      if (markerPos < 0) throw new Error("JPEG end marker is missing.");
      parts.push(input.slice(scanStart, markerPos));
      p = markerPos;
      inScan = false;
      continue;
    }
    const markerStart = p;
    if (input[p] !== 255) throw new Error("Malformed JPEG marker stream.");
    while (p < input.length && input[p] === 255) p++;
    if (p >= input.length) throw new Error("Truncated JPEG marker.");
    const marker = input[p++];
    if (marker === 0xd9) { parts.push(input.slice(markerStart, p)); sawEOI = true; break; }
    if (marker === 0xd8 || marker === 0x01 || (marker >= 0xd0 && marker <= 0xd7)) {
      parts.push(input.slice(markerStart, p));
      continue;
    }
    if (marker === 0x00 || p + 2 > input.length) throw new Error("Invalid JPEG marker.");
    const length = (input[p] << 8) | input[p + 1];
    if (length < 2 || p + length > input.length) throw new Error("Invalid JPEG segment length.");
    const segmentEnd = p + length;
    if (marker === 0xda) {
      parts.push(input.slice(markerStart, segmentEnd));
      p = segmentEnd;
      scanStart = p;
      inScan = true;
      continue;
    }
    const isMetadata = (marker >= 0xe0 && marker <= 0xef) || marker === 0xfe;
    if (!isMetadata) parts.push(input.slice(markerStart, segmentEnd));
    p = segmentEnd;
  }
  if (!sawEOI) throw new Error("JPEG end marker is missing.");
  return concat(parts);
}
function jpegHasMetadata(input) {
  if (input.length < 4 || input[0] !== 255 || input[1] !== 216) return true;
  let p = 2, inScan = false;
  while (p < input.length) {
    if (inScan) {
      let markerPos = -1;
      while (p < input.length) {
        if (input[p] === 255) {
          let q = p + 1;
          while (q < input.length && input[q] === 255) q++;
          if (q >= input.length) return true;
          const marker = input[q];
          if (marker === 0x00 || (marker >= 0xd0 && marker <= 0xd7)) { p = q + 1; continue; }
          markerPos = p;
          break;
        }
        p++;
      }
      if (markerPos < 0) return true;
      p = markerPos;
      inScan = false;
      continue;
    }
    if (input[p] !== 255) return true;
    while (p < input.length && input[p] === 255) p++;
    if (p >= input.length) return true;
    const marker = input[p++];
    if (marker === 0xd9) return false;
    if (marker === 0xd8 || marker === 0x01 || (marker >= 0xd0 && marker <= 0xd7)) continue;
    if (marker === 0x00 || p + 2 > input.length) return true;
    const length = (input[p] << 8) | input[p + 1];
    if (length < 2 || p + length > input.length) return true;
    if ((marker >= 0xe0 && marker <= 0xef) || marker === 0xfe) return true;
    p += length;
    if (marker === 0xda) inScan = true;
  }
  return true;
}

const PNG_SIGNATURE = Uint8Array.from([137, 80, 78, 71, 13, 10, 26, 10]);
const PNG_METADATA_CHUNKS = new Set(["tEXt", "zTXt", "iTXt", "eXIf", "tIME", "iCCP", "pHYs", "sPLT"]);
function stripPngMetadata(input) {
  if (input.length < 20 || !PNG_SIGNATURE.every((v, i) => input[i] === v)) throw new Error("Invalid PNG image.");
  const parts = [input.slice(0, 8)];
  let p = 8, sawHeader = false, sawEnd = false;
  while (p + 12 <= input.length) {
    const length = u32be(input, p), type = ascii(input, p + 4, 4), end = p + 12 + length;
    if (end > input.length) throw new Error("Truncated PNG chunk.");
    if (type === "IHDR") sawHeader = true;
    if (!PNG_METADATA_CHUNKS.has(type)) parts.push(input.slice(p, end));
    p = end;
    if (type === "IEND") { sawEnd = true; break; }
  }
  if (!sawHeader || !sawEnd || p !== input.length) throw new Error("Malformed PNG structure.");
  return concat(parts);
}

function stripWebpMetadata(input) {
  if (input.length < 20 || ascii(input, 0, 4) !== "RIFF" || ascii(input, 8, 4) !== "WEBP") throw new Error("Invalid WebP image.");
  const declared = u32le(input, 4) + 8;
  if (declared > input.length || declared < 20) throw new Error("Invalid WebP RIFF length.");
  const parts = [input.slice(0, 12)];
  let p = 12;
  while (p + 8 <= declared) {
    const type = ascii(input, p, 4), size = u32le(input, p + 4), padded = size + (size & 1), end = p + 8 + padded;
    if (end > declared) throw new Error("Truncated WebP chunk.");
    if (type === "VP8X") {
      if (size < 10) throw new Error("Invalid WebP extended header.");
      const chunk = input.slice(p, end);
      chunk[8] &= ~0x2c;
      parts.push(chunk);
    } else if (type !== "EXIF" && type !== "XMP " && type !== "ICCP") {
      parts.push(input.slice(p, end));
    }
    p = end;
  }
  if (p !== declared) throw new Error("Malformed WebP chunk table.");
  const out = concat(parts);
  putU32le(out, 4, out.length - 8);
  return out;
}

export function hasEmbeddedImageMetadata(bytes, mimeType) {
  const input = bytes instanceof Uint8Array ? bytes : new Uint8Array(bytes);
  if (mimeType === "image/jpeg") return jpegHasMetadata(input);
  if (mimeType === "image/png") {
    if (input.length < 8 || !PNG_SIGNATURE.every((v, i) => input[i] === v)) return true;
    let p = 8;
    while (p + 12 <= input.length) {
      const length = u32be(input, p), type = ascii(input, p + 4, 4), end = p + 12 + length;
      if (end > input.length) return true;
      if (PNG_METADATA_CHUNKS.has(type)) return true;
      p = end;
      if (type === "IEND") return p !== input.length;
    }
    return true;
  }
  if (mimeType === "image/webp") {
    if (input.length < 20 || ascii(input, 0, 4) !== "RIFF" || ascii(input, 8, 4) !== "WEBP") return true;
    const declared = u32le(input, 4) + 8;
    if (declared !== input.length) return true;
    let p = 12;
    while (p + 8 <= declared) {
      const type = ascii(input, p, 4), size = u32le(input, p + 4), end = p + 8 + size + (size & 1);
      if (end > declared) return true;
      if (type === "EXIF" || type === "XMP " || type === "ICCP") return true;
      if (type === "VP8X" && size >= 10 && (input[p + 8] & 0x2c)) return true;
      p = end;
    }
    return p !== declared;
  }
  return true;
}

export function stripImageMetadata(bytes, mimeType) {
  const input = bytes instanceof Uint8Array ? bytes : new Uint8Array(bytes);
  let cleaned;
  if (mimeType === "image/jpeg") cleaned = stripJpegMetadata(input);
  else if (mimeType === "image/png") cleaned = stripPngMetadata(input);
  else if (mimeType === "image/webp") cleaned = stripWebpMetadata(input);
  else throw new Error("Only JPEG, PNG and WebP images are supported.");
  if (hasEmbeddedImageMetadata(cleaned, mimeType)) throw new Error("Embedded image metadata could not be fully removed; upload was blocked.");
  return cleaned;
}

function clamp(value, min, max, fallback) {
  const n = Number(value);
  return Number.isFinite(n) ? Math.max(min, Math.min(max, n)) : fallback;
}
function galleryFromData(data) {
  const source = data.heroGallery && Array.isArray(data.heroGallery.images) ? data.heroGallery.images : null;
  let images = source ? source.map(item => ({
    id: String(item.id || ""),
    src: String(item.src || ""),
    focusX: clamp(item.focusX, 0, 100, 50),
    focusY: clamp(item.focusY, 0, 100, Number(data.imagePos ?? 50)),
    zoom: clamp(item.zoom, 1, 2.5, 1),
    faceDetection: item.faceDetection === true,
    uploadedAt: item.uploadedAt || null,
    metadataStripped: item.metadataStripped === true,
    mimeType: item.mimeType || null,
    bytes: Number(item.bytes || 0),
    legacy: item.legacy === true
  })).filter(item => item.id && item.src) : [];
  let activeImageId = String(data.heroGallery?.activeImageId || "");
  if (!images.length && data.image) {
    images = [{
      id: "legacy-current", src: String(data.image),
      focusX: clamp(data.imageFocusX, 0, 100, 50),
      focusY: clamp(data.imagePos, 0, 100, 50),
      zoom: clamp(data.imageZoom, 1, 2.5, 1),
      faceDetection: false, uploadedAt: null, metadataStripped: false,
      mimeType: null, bytes: 0, legacy: true
    }];
    activeImageId = "legacy-current";
  }
  if (!images.some(item => item.id === activeImageId)) activeImageId = images[0]?.id || "";
  return { version: 1, activeImageId, images };
}
function applyActiveCompatibility(data, gallery) {
  const active = gallery.images.find(item => item.id === gallery.activeImageId);
  if (!active) return;
  data.image = active.src;
  data.imagePos = active.focusY;
  data.imageFocusX = active.focusX;
  data.imageZoom = active.zoom;
}
async function githubHeaders(env) {
  if (!env?.GITHUB_TOKEN) throw new Error("GitHub image storage is unavailable: GITHUB_TOKEN is missing.");
  return {
    Authorization: "Bearer " + env.GITHUB_TOKEN,
    Accept: "application/vnd.github+json",
    "User-Agent": "Kokushibu74-Hero-Gallery",
    "X-GitHub-Api-Version": "2022-11-28",
    "Content-Type": "application/json"
  };
}
async function readSiteData(env) {
  const response = await fetch(API + SITE_DATA_PATH + "?ref=main", { headers: await githubHeaders(env), signal: AbortSignal.timeout(12000) });
  const file = await response.json().catch(() => ({}));
  if (!response.ok || !file.content || !file.sha) throw new Error("Could not read current site-data.json from GitHub (HTTP " + response.status + ").");
  const text = new TextDecoder().decode(decodeBase64(file.content));
  return { data: JSON.parse(text), sha: file.sha };
}
async function writeSiteData(env, data, sha, message) {
  const response = await fetch(API + SITE_DATA_PATH, {
    method: "PUT", headers: await githubHeaders(env),
    body: JSON.stringify({ message, content: encodeBase64(new TextEncoder().encode(JSON.stringify(data, null, 2) + "\n")), sha, branch: "main" }),
    signal: AbortSignal.timeout(15000)
  });
  const result = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error("Gallery data was not saved (GitHub HTTP " + response.status + "). Existing Active Image remains unchanged.");
  return result.commit?.sha || null;
}
async function uploadCleanImage(env, bytes, mimeType, id) {
  const extension = mimeType === "image/png" ? "png" : mimeType === "image/webp" ? "webp" : "jpg";
  const path = "storage/pictures/gallery-" + id + "." + extension;
  const response = await fetch(API + path, {
    method: "PUT", headers: await githubHeaders(env),
    body: JSON.stringify({ message: "chore: add cleaned hero gallery image", content: encodeBase64(bytes), branch: "main" }),
    signal: AbortSignal.timeout(20000)
  });
  const uploaded = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error("Image upload failed (GitHub HTTP " + response.status + ").");
  const verifyResponse = await fetch(API + path + "?ref=main", { headers: await githubHeaders(env), signal: AbortSignal.timeout(12000) });
  const verifyFile = await verifyResponse.json().catch(() => ({}));
  if (!verifyResponse.ok) throw new Error("Image was uploaded but its metadata could not be verified. It was not added to the gallery.");
  let storedBytes;
  if (verifyFile.content) storedBytes = decodeBase64(verifyFile.content);
  else if (verifyFile.download_url) {
    const rawResponse = await fetch(verifyFile.download_url, { signal: AbortSignal.timeout(15000) });
    if (!rawResponse.ok) throw new Error("Uploaded image could not be downloaded for metadata verification.");
    storedBytes = new Uint8Array(await rawResponse.arrayBuffer());
  } else throw new Error("GitHub did not provide the uploaded image bytes for metadata verification.");
  if (hasEmbeddedImageMetadata(storedBytes, mimeType)) throw new Error("Uploaded image metadata verification failed. It was not added to the gallery.");
  return { path, commit: uploaded.commit?.sha || null, bytes: storedBytes.length, mimeType };
}

export async function prepareGalleryImage(env, userId, body) {
  if (!env?.BOT_CONFIG_KV) throw new Error("Gallery staging storage is unavailable.");
  const mimeType = String(body?.mimeType || ""), base64 = String(body?.base64 || "");
  if (!["image/jpeg", "image/png", "image/webp"].includes(mimeType)) throw new Error("Only JPEG, PNG and WebP images are supported.");
  if (!base64 || base64.length > Math.ceil(4 * 1024 * 1024 * 4 / 3) + 16 || !/^[A-Za-z0-9+/]+={0,2}$/.test(base64)) throw new Error("Each image must be 4 MB or smaller and valid base64.");
  const original = decodeBase64(base64);
  if (original.length < 16 || original.length > 4 * 1024 * 1024) throw new Error("Image must be between 16 bytes and 4 MB.");
  const cleaned = stripImageMetadata(original, mimeType);
  const token = crypto.randomUUID(), expiresAt = Date.now() + 10 * 60 * 1000;
  await env.BOT_CONFIG_KV.put(PENDING_PREFIX + token, JSON.stringify({
    base64: encodeBase64(cleaned), mimeType, userId: String(userId),
    expiresAt, metadataStripped: true, originalBytes: original.length, cleanedBytes: cleaned.length
  }), { expirationTtl: 600 });
  return {
    token, expiresAt,
    previewUrl: "https://portfolio-contact-telegram.mdshihab74.workers.dev/hero-preview-image?token=" + encodeURIComponent(token),
    metadataStripped: true, originalBytes: original.length, cleanedBytes: cleaned.length
  };
}

export async function commitGalleryBytes(env, userId, inputBytes, mimeType, position = {}) {
  if (!env?.BOT_CONFIG_KV) throw new Error("Gallery configuration storage is unavailable.");
  const original = inputBytes instanceof Uint8Array ? inputBytes : new Uint8Array(inputBytes);
  if (original.length < 16 || original.length > 4 * 1024 * 1024) throw new Error("Each hero image must be between 16 bytes and 4 MB.");
  const cleaned = stripImageMetadata(original, mimeType);
  const focusX = clamp(position.focusX, 0, 100, 50);
  const focusY = clamp(position.focusY, 0, 100, 50);
  const zoom = clamp(position.zoom, 1, 2.5, 1);
  const snapshot = await readSiteData(env);
  const gallery = galleryFromData(snapshot.data);
  const id = crypto.randomUUID().replace(/-/g, "").slice(0, 20);
  const uploaded = await uploadCleanImage(env, cleaned, mimeType, id);
  const image = {
    id, src: uploaded.path, focusX, focusY, zoom,
    faceDetection: position.faceDetection === true,
    uploadedAt: new Date().toISOString(),
    metadataStripped: true, mimeType, bytes: uploaded.bytes
  };
  gallery.images.push(image);
  if (!gallery.activeImageId) gallery.activeImageId = id;
  snapshot.data.heroGallery = gallery;
  applyActiveCompatibility(snapshot.data, gallery);
  const commit = await writeSiteData(env, snapshot.data, snapshot.sha, "chore: add hero gallery image");
  return { imageId: id, imagePath: uploaded.path, commit: commit || uploaded.commit, activeImageId: gallery.activeImageId, metadataStripped: true, bytes: uploaded.bytes };
}

export async function commitGalleryPending(env, userId, token, position = {}) {
  if (!/^[0-9a-f-]{30,40}$/i.test(String(token || ""))) throw new Error("Invalid or expired gallery upload token.");
  const key = PENDING_PREFIX + token;
  const pending = await env.BOT_CONFIG_KV?.get(key, "json");
  if (!pending || Number(pending.expiresAt) < Date.now()) throw new Error("Gallery preview expired. Upload the image again.");
  if (String(pending.userId) !== String(userId)) throw new Error("This preview belongs to another admin session.");
  const bytes = decodeBase64(pending.base64);
  const result = await commitGalleryBytes(env, userId, bytes, pending.mimeType, position);
  await env.BOT_CONFIG_KV.delete(key);
  return { ok: true, ...result };
}

export async function listHeroGallery(env) {
  const { data } = await readSiteData(env);
  const gallery = galleryFromData(data);
  return { gallery, activeImage: gallery.images.find(item => item.id === gallery.activeImageId) || null };
}

export async function setGalleryActive(env, userId, imageId) {
  const { data, sha } = await readSiteData(env);
  const gallery = galleryFromData(data);
  const image = gallery.images.find(item => item.id === String(imageId));
  if (!image) throw new Error("Gallery image was not found.");
  gallery.activeImageId = image.id;
  data.heroGallery = gallery;
  applyActiveCompatibility(data, gallery);
  const commit = await writeSiteData(env, data, sha, "chore: select active hero gallery image");
  return { activeImageId: image.id, imagePath: image.src, commit };
}

export async function updateGalleryPosition(env, userId, imageId, position = {}) {
  const { data, sha } = await readSiteData(env);
  const gallery = galleryFromData(data);
  const image = gallery.images.find(item => item.id === String(imageId));
  if (!image) throw new Error("Gallery image was not found.");
  image.focusX = clamp(position.focusX, 0, 100, image.focusX);
  image.focusY = clamp(position.focusY, 0, 100, image.focusY);
  image.zoom = clamp(position.zoom, 1, 2.5, image.zoom);
  if (position.faceDetection !== undefined) image.faceDetection = position.faceDetection === true;
  data.heroGallery = gallery;
  if (gallery.activeImageId === image.id) applyActiveCompatibility(data, gallery);
  const commit = await writeSiteData(env, data, sha, "chore: adjust hero gallery framing");
  return { image: { ...image }, commit };
}

export async function deleteGalleryImage(env, userId, imageId) {
  const { data, sha } = await readSiteData(env);
  const gallery = galleryFromData(data);
  const image = gallery.images.find(item => item.id === String(imageId));
  if (!image) throw new Error("Gallery image was not found.");
  if (gallery.activeImageId === image.id) throw new Error("The Active Image cannot be deleted. Select another image first.");
  if (image.legacy) throw new Error("The original legacy image is protected and cannot be deleted from this manager.");
  gallery.images = gallery.images.filter(item => item.id !== image.id);
  data.heroGallery = gallery;
  const commit = await writeSiteData(env, data, sha, "chore: remove hero gallery image");
  let storageDeleted = false;
  if (!String(image.src).startsWith("storage/pictures/gallery-")) return { deletedImageId: image.id, commit, storageDeleted: false, warning: "Storage path was not a managed gallery image." };
  try {
    const headers = await githubHeaders(env);
    const response = await fetch(API + image.src + "?ref=main", { headers, signal: AbortSignal.timeout(10000) });
    const file = await response.json().catch(() => ({}));
    if (response.ok && file.sha) {
      const removed = await fetch(API + image.src, {
        method: "DELETE", headers,
        body: JSON.stringify({ message: "chore: delete hero gallery image", sha: file.sha, branch: "main" }),
        signal: AbortSignal.timeout(12000)
      });
      storageDeleted = removed.ok;
    }
  } catch (error) {
    console.warn("Hero gallery image storage cleanup pending", String(error?.message || error).slice(0, 160));
  }
  return { deletedImageId: image.id, commit, storageDeleted };
}
