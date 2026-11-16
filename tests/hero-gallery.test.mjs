import assert from "node:assert/strict";
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

console.log("Hero Gallery image metadata stripping tests passed.");
