import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { stripImageMetadata, hasEmbeddedImageMetadata } from "../cloudflare/hero-gallery.mjs";

const concat = parts => {
  const out = new Uint8Array(parts.reduce((n, p) => n + p.length, 0));
  let offset = 0;
  for (const part of parts) { out.set(part, offset); offset += part.length; }
  return out;
};
const ascii = value => Uint8Array.from([...value].map(c => c.charCodeAt(0)));
const u32be = value => Uint8Array.from([(value >>> 24) & 255, (value >>> 16) & 255, (value >>> 8) & 255, value & 255]);
const u32le = value => Uint8Array.from([value & 255, (value >>> 8) & 255, (value >>> 16) & 255, (value >>> 24) & 255]);

function jpegSegment(marker, payload = new Uint8Array()) {
  const length = payload.length + 2;
  return concat([Uint8Array.from([255, marker, length >>> 8, length & 255]), payload]);
}
function pngChunk(type, payload = new Uint8Array()) {
  return concat([u32be(payload.length), ascii(type), payload, Uint8Array.from([0, 0, 0, 0])]);
}
function webpChunk(type, payload = new Uint8Array()) {
  return concat([ascii(type), u32le(payload.length), payload, ...(payload.length & 1 ? [Uint8Array.from([0])] : [])]);
}

const jpeg = concat([
  Uint8Array.from([255, 216]),
  jpegSegment(0xe1, ascii("Exif\0\0GPS")),
  jpegSegment(0xed, ascii("IPTC")),
  jpegSegment(0xdb),
  jpegSegment(0xda),
  Uint8Array.from([17, 34, 51, 255, 217])
]);
const cleanJpeg = stripImageMetadata(jpeg, "image/jpeg");
assert.equal(hasEmbeddedImageMetadata(jpeg, "image/jpeg"), true);
assert.equal(hasEmbeddedImageMetadata(cleanJpeg, "image/jpeg"), false);
assert.equal(cleanJpeg[0], 255);
assert.equal(cleanJpeg[1], 216);
assert.deepEqual(Array.from(cleanJpeg.slice(-5)), [17, 34, 51, 255, 217], "JPEG scan bytes must remain unchanged");
const multiScanJpeg = concat([
  Uint8Array.from([255, 216]),
  jpegSegment(0xdb),
  jpegSegment(0xda),
  Uint8Array.from([1, 2, 255, 208, 3, 255, 225, 0, 8, 69, 120, 105, 102, 0, 0, 71, 80, 83]),
  jpegSegment(0xda),
  Uint8Array.from([4, 5, 255, 217])
]);
const cleanMultiScan = stripImageMetadata(multiScanJpeg, "image/jpeg");
assert.equal(hasEmbeddedImageMetadata(cleanMultiScan, "image/jpeg"), false, "metadata between JPEG scans must also be stripped");

const png = concat([
  Uint8Array.from([137, 80, 78, 71, 13, 10, 26, 10]),
  pngChunk("IHDR", new Uint8Array(13)),
  pngChunk("tEXt", ascii("Author\0Test")),
  pngChunk("eXIf", ascii("GPS")),
  pngChunk("tIME", ascii("date")),
  pngChunk("IDAT", Uint8Array.from([1, 2, 3, 4])),
  pngChunk("IEND")
]);
const cleanPng = stripImageMetadata(png, "image/png");
assert.equal(hasEmbeddedImageMetadata(png, "image/png"), true);
assert.equal(hasEmbeddedImageMetadata(cleanPng, "image/png"), false);
assert.equal(new TextDecoder().decode(cleanPng).includes("Author"), false);
assert.equal(new TextDecoder().decode(cleanPng).includes("eXIf"), false);

const vp8xData = new Uint8Array(10);
vp8xData[0] = 0x2c;
const webp = concat([
  ascii("RIFF"), u32le(0), ascii("WEBP"),
  webpChunk("VP8X", vp8xData),
  webpChunk("ICCP", ascii("camera profile")),
  webpChunk("EXIF", ascii("GPS camera date")),
  webpChunk("XMP ", ascii("author")),
  webpChunk("VP8 ", Uint8Array.from([1, 2, 3, 4]))
]);
const declaredWebp = webp.slice();
declaredWebp[4] = (webp.length - 8) & 255;
declaredWebp[5] = ((webp.length - 8) >>> 8) & 255;
declaredWebp[6] = ((webp.length - 8) >>> 16) & 255;
declaredWebp[7] = ((webp.length - 8) >>> 24) & 255;
const cleanWebp = stripImageMetadata(declaredWebp, "image/webp");
assert.equal(hasEmbeddedImageMetadata(declaredWebp, "image/webp"), true);
assert.equal(hasEmbeddedImageMetadata(cleanWebp, "image/webp"), false);
assert.equal(new TextDecoder().decode(cleanWebp).includes("EXIF"), false);
assert.equal(new TextDecoder().decode(cleanWebp).includes("XMP "), false);

assert.throws(() => stripImageMetadata(jpeg, "image/gif"), /Only JPEG, PNG and WebP/i);
assert.throws(() => stripImageMetadata(Uint8Array.from([1, 2, 3]), "image/jpeg"), /Invalid JPEG/i);


const site = readFileSync("site.js", "utf8");
const app = readFileSync("miniapp/app.js", "utf8");
const worker = readFileSync("cloudflare/portfolio-contact-telegram.js", "utf8");
assert(site.includes("setTimeout(()=>close(),20000)"), "Viewer must close 20 seconds after the last interaction");
assert(site.includes("history.pushState") && site.includes('window.addEventListener("popstate"'), "Mobile Back must close the viewer without leaving the page");
assert(site.includes('e.key==="ArrowLeft"') && site.includes('e.key==="ArrowRight"'), "Desktop keyboard navigation must be supported");
assert(site.includes('e.pointerType==="touch"') && site.includes('e.target===overlay'), "Mobile swipe and outside-click close must be supported");
assert(site.includes("object-fit:contain"), "Full-size viewer must show the original image without cropping");
assert(app.includes("file.multiple=true") && app.includes('api("heroGallerySetActive"') && app.includes('api("heroGalleryUpdatePosition"'), "Telegram Mini App must support multi-upload, active selection and manual framing");
assert(app.includes("FaceDetector.createFromOptions") && app.includes("ObjectDetector.createFromOptions"), "Face and subject detection must run locally in the Mini App");
assert(app.includes('import("https://kokushibu74.github.io/cloudflare/hero-gallery.mjs")') && app.includes("stripImageMetadata"), "Image metadata must be stripped in the browser before sending bytes to the Worker");
assert(worker.includes('if(pathname==="/hero-preview-image"') && worker.includes('if(action==="heroGalleryDelete")'), "Worker must expose the sanitized preview and authenticated gallery controls");
assert(!/faceEmbedding|faceIdentity|biometricTemplate/i.test(c + app + worker), "No facial identity or biometric template storage is allowed");

console.log("Hero Gallery metadata, viewer and admin contract tests passed.");
