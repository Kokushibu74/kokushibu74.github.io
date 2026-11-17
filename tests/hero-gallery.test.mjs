import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import vm from "node:vm";

const worker=readFileSync("cloudflare/portfolio-contact-telegram.js","utf8");
const site=readFileSync("site.js","utf8");
const app=readFileSync("miniapp/app.js","utf8");
const css=readFileSync("miniapp/app.css","utf8");

function extract(start,end){
  const a=worker.indexOf(start);
  assert.ok(a>=0,"Missing Worker helper: "+start);
  const b=worker.indexOf(end,a+start.length);
  assert.ok(b>a,"Missing Worker helper boundary: "+end);
  return worker.slice(a,b);
}
const sanitizerSource=extract("function heroStripImageMetadata(","function heroGalleryNormalize(");
const gallerySource=extract("function heroGalleryNormalize(","async function heroReadSiteData(");
const context={Uint8Array,Math,Number,String,Array,Object,Error};
const sanitize=vm.runInNewContext(sanitizerSource+"; heroStripImageMetadata",context);
const normalize=vm.runInNewContext(gallerySource+"; heroGalleryNormalize",context);

const equal=(a,b)=>a.length===b.length&&a.every((v,i)=>v===b[i]);
function chunk(type,data){
  const bytes=Array.from(data),length=bytes.length;
  return [length>>>24,(length>>>16)&255,(length>>>8)&255,length&255,...type.split("").map(c=>c.charCodeAt(0)),...bytes,0,0,0,0];
}
function join(parts){return Uint8Array.from(parts.flat());}

const jpeg=Uint8Array.from([0xff,0xd8,
  0xff,0xe0,0x00,0x04,0x01,0x02,
  0xff,0xe1,0x00,0x06,0x45,0x78,0x69,0x66,
  0xff,0xe2,0x00,0x06,0x49,0x43,0x43,0x50,
  0xff,0xed,0x00,0x06,0x49,0x50,0x54,0x43,
  0xff,0xfe,0x00,0x04,0x41,0x42,
  0xff,0xda,0x00,0x02,0x11,0x22,0x33,0x44,0x55,0x66,0x77,0x88,0x99,0xaa,0xff,0xd9]);
const cleanJpeg=sanitize(jpeg);
assert.equal(cleanJpeg.mimeType,"image/jpeg");
assert.ok(cleanJpeg.removed.includes("JPEG_E0"),"JPEG APP0/JFIF metadata must be stripped");
assert.ok(cleanJpeg.removed.includes("JPEG_E1"),"JPEG EXIF APP1 must be stripped");
assert.ok(cleanJpeg.removed.includes("JPEG_E2"),"JPEG ICC APP2 metadata must be stripped");
assert.ok(cleanJpeg.removed.includes("JPEG_ED"),"JPEG IPTC APP13 metadata must be stripped");
assert.ok(cleanJpeg.removed.includes("JPEG_FE"),"JPEG comment segments must be stripped");
assert.ok(!equal(jpeg,cleanJpeg.bytes),"JPEG metadata removal must change the byte stream");
const verifyJpeg=sanitize(cleanJpeg.bytes);
assert.equal(verifyJpeg.removed.length,0,"JPEG read-back verification must find no remaining metadata");
assert.ok(equal(cleanJpeg.bytes,verifyJpeg.bytes),"JPEG second pass must be stable");

const pngSignature=[137,80,78,71,13,10,26,10];
const ihdr=[0,0,0,1,0,0,0,1,8,6,0,0,0];
const png=join([
  pngSignature,
  chunk("IHDR",ihdr),
  chunk("tEXt",[65,117,116,104,111,114,0,83,104,105,104,97,98]),
  chunk("eXIf",[69,120,105,102]),
  chunk("tIME",[7,232,1,2,3,4,5]),
  chunk("iCCP",[80,114,111,102,105,108,101,0,0]),
  chunk("tRNS",[0]),
  chunk("IDAT",[1,2,3]),
  chunk("IEND",[])
]);
const cleanPng=sanitize(png);
assert.equal(cleanPng.mimeType,"image/png");
assert.ok(cleanPng.removed.includes("PNG_tEXt"),"PNG text metadata must be stripped");
assert.ok(cleanPng.removed.includes("PNG_eXIf"),"PNG EXIF metadata must be stripped");
assert.ok(cleanPng.removed.includes("PNG_tIME"),"PNG timestamp metadata must be stripped");
assert.ok(cleanPng.removed.includes("PNG_iCCP"),"PNG embedded color profile metadata must be stripped");
assert.ok(cleanPng.bytes.some((v,i)=>i>0&&v===0x74&&cleanPng.bytes[i+1]===0x52),"PNG transparency data must remain intact");
const verifyPng=sanitize(cleanPng.bytes);
assert.equal(verifyPng.removed.length,0,"PNG read-back verification must find no identifying ancillary chunks");
assert.ok(equal(cleanPng.bytes,verifyPng.bytes),"PNG second pass must be stable");

const webpChunk=(type,data)=>{
  const payload=Array.from(data),n=payload.length;
  return [...type.split("").map(c=>c.charCodeAt(0)),n&255,(n>>>8)&255,(n>>>16)&255,(n>>>24)&255,...payload,...(n&1?[0]:[])];
};
const webpBody=[87,69,66,80,
  ...webpChunk("VP8X",[0x2c,0,0,0,0,0,0,0,0,0]),
  ...webpChunk("EXIF",[69,120,105,102]),
  ...webpChunk("XMP ",[88,77,80,0]),
  ...webpChunk("ICCP",[73,67,67,80]),
  ...webpChunk("JUNK",[77,101,116,97]),
  ...webpChunk("VP8 ",[1,2,3])
];
const riffSize=webpBody.length;
const webp=Uint8Array.from([82,73,70,70,riffSize&255,(riffSize>>>8)&255,(riffSize>>>16)&255,(riffSize>>>24)&255,...webpBody]);
const cleanWebp=sanitize(webp);
assert.equal(cleanWebp.mimeType,"image/webp");
assert.ok(cleanWebp.removed.includes("WEBP_EXIF"),"WebP EXIF chunk must be stripped");
assert.ok(cleanWebp.removed.includes("WEBP_XMP"),"WebP XMP metadata must be stripped");
assert.ok(cleanWebp.removed.includes("WEBP_ICCP"),"WebP ICC profile metadata must be stripped");
assert.ok(cleanWebp.removed.includes("WEBP_JUNK"),"Unknown WebP chunks must be stripped rather than assumed safe");
assert.ok(cleanWebp.removed.includes("WEBP_VP8X_METADATA_FLAGS"),"WebP EXIF/XMP/ICC flags must be cleared");
const verifyWebp=sanitize(cleanWebp.bytes);
assert.equal(verifyWebp.removed.length,0,"WebP read-back verification must find no metadata");
assert.ok(equal(cleanWebp.bytes,verifyWebp.bytes),"WebP second pass must be stable");

const legacy=normalize({image:"storage/pictures/legacy-profile.jpg",imagePos:38});
assert.equal(legacy.images.length,1,"Legacy single-image sites must migrate to one virtual gallery item");
assert.equal(legacy.activeImageId,legacy.images[0].id,"Legacy image must remain active during migration");
assert.equal(legacy.images[0].focusY,38,"Legacy vertical image position must be preserved");
const existing=normalize({
  image:"storage/pictures/one.jpg",
  heroGallery:{version:1,activeImageId:"two",images:[
    {id:"one",src:"storage/pictures/one.jpg",focusX:12,focusY:24,zoom:1.1},
    {id:"two",src:"storage/pictures/two.jpg",focusX:60,focusY:42,zoom:1.4}
  ]}
});
assert.equal(existing.activeImageId,"two","Gallery browsing must preserve the explicit active image");
assert.equal(existing.images.length,2,"Gallery normalization must preserve all saved images");
assert.equal(existing.images[1].zoom,1.4,"Saved zoom must be retained");

assert.match(worker,/async function miniAppHeroGalleryList/);
assert.match(worker,/async function miniAppHeroGallerySetActive/);
assert.match(worker,/async function miniAppHeroGallerySavePosition/);
assert.match(worker,/async function miniAppHeroGalleryDelete/);
assert.match(worker,/The active Homepage image cannot be deleted/);
assert.match(worker,/activeImageChanged:false/);
assert.match(worker,/raw\.githubusercontent\.com\/Kokushibu74\/kokushibu74\.github\.io\/main\//);
assert.match(worker,/metadata verification/);
for(const action of ["heroGalleryList","heroGallerySetActive","heroGallerySavePosition","heroGalleryDelete"]){
  assert.ok(worker.includes('if(action==="'+action+'")'),"Missing authenticated API action "+action);
}
assert.doesNotMatch(worker,/faceEmbedding|faceDescriptor|face_identity/i,"No biometric face identity or embedding may be persisted");

assert.match(site,/heroGalleryForData/);
assert.match(site,/object-fit:contain/,"Full-size viewer must show the original image without the Round Frame crop");
assert.match(site,/setTimeout\(\(\)=>close\(\),20000\)/,"Tap viewer must close after 20 seconds of inactivity");
assert.match(site,/portrait-reveal-prev/);
assert.match(site,/portrait-reveal-next/);
assert.match(site,/ArrowLeft/);
assert.match(site,/ArrowRight/);
assert.match(site,/pointerup/,"Mobile swipe navigation must be wired");
assert.match(site,/history\.pushState/);
assert.match(site,/addEventListener\("popstate"/);
assert.match(site,/img\.addEventListener\("mouseenter"/,"Existing desktop hover preview must remain");
assert.match(site,/#portrait-reveal-overlay\.is-visible\{opacity:1;visibility:visible;pointer-events:none\}/,"Desktop hover preview must not intercept the pointer and trigger its own mouseleave");
assert.match(site,/#portrait-reveal-overlay\.is-visible\.is-tap\{pointer-events:auto\}/,"Tap viewer must remain interactive");
assert.match(site,/#portrait-reveal-frame\{position:relative;pointer-events:none/,"Hover preview frame must not capture pointer events");
assert.match(site,/if\(mode==="tap"\)\{resetTimer\(\);/,"Keyboard interaction must reset the 20-second inactivity timer");

assert.match(app,/async function normalizeHeroUpload/,"Uploads must normalize image orientation before stripping EXIF metadata");
assert.match(app,/imageOrientation:"from-image"/,"EXIF orientation must be applied to pixels before metadata removal");
assert.match(app,/canvas.toBlob/,"Normalized upload must be re-encoded without embedded metadata");
assert.match(app,/@mediapipe\/tasks-vision/,"Face detection must run in the browser");
assert.match(app,/heroGallerySetActive/);
assert.match(app,/heroGallerySavePosition/);
assert.match(app,/heroGalleryDelete/);
assert.match(app,/focusX/);
assert.match(app,/focusY/);
assert.match(app,/zoom/);
assert.match(app,/visual-saliency subject estimate/);
assert.match(css,/hero-gallery-focus-preview/);
assert.match(css,/hero-gallery-card/);

console.log("Hero Gallery metadata stripping, legacy migration, admin controls and viewer contracts passed.");
