export const NEWS_LATEST_MAX_AGE_MINUTES = 15;
export const NEWS_SLIDER_MAX_AGE_MINUTES = 60;
const IMAGE_FIELDS = ["previewScreenshot", "previewImage", "image", "imageUrl", "thumbnail", "thumbnailUrl", "enclosureUrl"];

export function getImagePreviewUrl(item = {}) {
  for (const field of IMAGE_FIELDS) {
    const value = String(item?.[field] || "").trim();
    if (!value) continue;
    try {
      const url = new URL(value);
      if (url.protocol === "https:" && url.hostname) return url.href;
    } catch {}
  }
  return "";
}

export function getNewsAgeMinutes(item = {}, now = Date.now()) {
  const published = Date.parse(item?.publishedAt || "");
  return Number.isFinite(published) ? (now - published) / 60000 : Infinity;
}

export function isLatestTagItem(item = {}, now = Date.now()) {
  const age = getNewsAgeMinutes(item, now);
  return age >= -5 && age <= NEWS_LATEST_MAX_AGE_MINUTES;
}

export function isSliderEligibleItem(item = {}, now = Date.now()) {
  const age = getNewsAgeMinutes(item, now);
  return item?.category === "Bangladesh" &&
    age >= -5 && age <= NEWS_SLIDER_MAX_AGE_MINUTES &&
    Boolean(getImagePreviewUrl(item));
}
