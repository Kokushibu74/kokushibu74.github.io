import test from "node:test";
import assert from "node:assert/strict";
import {getImagePreviewUrl,isLatestTagItem,isSliderEligibleItem} from "../news-slider-rules.mjs";

const now=Date.parse("2026-11-04T12:00:00Z");
const story=(minutes,overrides={})=>({category:"Bangladesh",publishedAt:new Date(now-minutes*60000).toISOString(),previewImage:"https://images.example/story.jpg",...overrides});

test("15-minute-old news keeps the LATEST tag",()=>assert.equal(isLatestTagItem(story(15),now),true));
test("16-minute-old news loses the LATEST tag",()=>assert.equal(isLatestTagItem(story(16),now),false));
test("news exactly 60 minutes old remains in the slider",()=>assert.equal(isSliderEligibleItem(story(60),now),true));
test("news 61 minutes old is excluded from the slider",()=>assert.equal(isSliderEligibleItem(story(61),now),false));
test("only Bangladesh category is eligible",()=>assert.equal(isSliderEligibleItem(story(5,{category:"World"}),now),false));
test("video-only story is excluded from the image slider",()=>assert.equal(isSliderEligibleItem(story(5,{previewImage:"",videoUrl:"https://video.example/clip.mp4"}),now),false));
test("story without image preview is excluded",()=>assert.equal(isSliderEligibleItem(story(5,{previewImage:""}),now),false));
test("invalid or non-HTTPS image URL is excluded",()=>assert.equal(getImagePreviewUrl(story(5,{previewImage:"javascript:alert(1)",image:"http://images.example/story.jpg"})),""));
test("valid fallback image fields are accepted",()=>assert.equal(getImagePreviewUrl(story(5,{previewImage:"",thumbnail:"https://images.example/fallback.jpg"})),"https://images.example/fallback.jpg"));
