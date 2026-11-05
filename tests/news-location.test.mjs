import test from "node:test";
import assert from "node:assert/strict";
import { buildLocationContext, getNearestDistrict, getNearbyDistricts, rankNewsByLocation } from "../news-location.mjs";

test("GPS coordinates resolve to an approximate Bangladesh district", () => {
  const district = getNearestDistrict(23.7115253, 90.4111451, 25);
  assert.equal(district?.name, "Dhaka");
  assert.equal(district?.bnName, "ঢাকা");
});

test("district matching refuses poor-accuracy and out-of-country coordinates", () => {
  assert.equal(getNearestDistrict(23.7, 90.4, 35000), null);
  assert.equal(getNearestDistrict(40.7128, -74.006, 30), null);
});

test("nearby district list is distance ordered and excludes the visitor district", () => {
  const nearby = getNearbyDistricts(23.7115253, 90.4111451, "1");
  assert.ok(nearby.length > 0);
  assert.ok(nearby.some(district => district.name === "Gazipur"));
  assert.ok(!nearby.some(district => district.name === "Dhaka"));
  assert.deepEqual(nearby.map(x => x.distanceKm), [...nearby].map(x => x.distanceKm).sort((a,b)=>a-b));
});

test("local, nearby, Bangladesh national and international stories are ranked in that order", () => {
  const context = buildLocationContext({ latitude: 23.7115253, longitude: 90.4111451, accuracyMeters: 20, country: "BD" });
  const items = [
    { id: "world", title: "Global markets move", category: "World" },
    { id: "national", title: "Parliament approves a national budget", category: "Bangladesh" },
    { id: "nearby", title: "Gazipur factories announce a local update", category: "Bangladesh" },
    { id: "local", title: "Dhaka city reports a new local update", category: "Bangladesh" }
  ];
  assert.deepEqual(rankNewsByLocation(items, context).map(x => x.id), ["local", "nearby", "national", "world"]);
});

test("Bengali district names are matched in story text", () => {
  const context = buildLocationContext({ latitude: 23.7115253, longitude: 90.4111451, accuracyMeters: 20, country: "BD" });
  const items = [
    { id: "national", title: "জাতীয় বাজেট ঘোষণা", category: "Bangladesh" },
    { id: "local", title: "ঢাকায় নতুন স্থানীয় প্রকল্প শুরু", category: "Bangladesh" }
  ];
  assert.equal(rankNewsByLocation(items, context)[0].id, "local");
});

test("when local and nearby coverage is sparse, Bangladesh national news precedes international stories", () => {
  const context = buildLocationContext({ latitude: 23.7115253, longitude: 90.4111451, accuracyMeters: 20, country: "BD" });
  const items = [
    { id: "world", title: "World technology update", category: "World" },
    { id: "national", title: "National policy update", category: "Bangladesh" },
    { id: "technology", title: "Global technology update", category: "Technology" }
  ];
  assert.deepEqual(rankNewsByLocation(items, context).map(x => x.id), ["national", "world", "technology"]);
});

test("international visitors see local city and region first, Bangladesh national next, then international", () => {
  const context = buildLocationContext({ latitude: 40.7128, longitude: -74.006, accuracyMeters: 20, city: "London", region: "England", country: "GB", countryName: "United Kingdom" });
  const items = [
    { id: "global", title: "Global markets", category: "World" },
    { id: "bangladesh", title: "Bangladesh parliament approves a budget", category: "Bangladesh" },
    { id: "region", title: "England weather update", category: "World" },
    { id: "city", title: "London local transport update", category: "World" }
  ];
  assert.deepEqual(rankNewsByLocation(items, context).map(x => x.id), ["city", "region", "bangladesh", "global"]);
});
