#!/usr/bin/env python3
"""Build a larger, deduplicated news feed from public Google News RSS searches."""
import html
import json
import re
import urllib.request
import urllib.parse
import xml.etree.ElementTree as ET
from datetime import datetime, timezone, timedelta
from email.utils import parsedate_to_datetime

OUTPUT = "news-feed.json"
# Multiple independent Bangladesh searches provide enough breadth to target 50+ local headlines.
QUERIES = [
    ("Bangladesh", "বাংলাদেশ সংবাদ", "bn-BD", "BD", "BD:bn"),
    ("Bangladesh", "বাংলাদেশের সর্বশেষ খবর", "bn-BD", "BD", "BD:bn"),
    ("Bangladesh", "Bangladesh latest news", "en-US", "BD", "BD:en"),
    ("Bangladesh", "Dhaka Bangladesh news", "en-US", "BD", "BD:en"),
    ("Bangladesh", "Bangladesh politics economy", "en-US", "BD", "BD:en"),
    ("Bangladesh", "Bangladesh cricket sports", "en-US", "BD", "BD:en"),
    ("Bangladesh", "Bangladesh education health", "en-US", "BD", "BD:en"),
    ("Bangladesh", "Bangladesh transport weather business", "en-US", "BD", "BD:en"),
    ("World", "world latest news", "en-US", "US", "US:en"),
    ("World", "international breaking news", "en-US", "US", "US:en"),
    ("Technology", "technology news", "en-US", "US", "US:en"),
    ("Technology", "cybersecurity gadgets science technology", "en-US", "US", "US:en"),
    ("AI", "artificial intelligence AI news", "en-US", "US", "US:en"),
    ("AI", "ChatGPT OpenAI Google Gemini AI news", "en-US", "US", "US:en"),
]
MAX_PER_FEED = 25
MAX_TOTAL = 220
BANGLADESH_TARGET = 60
TOTAL_TARGET = 140
RETENTION_DAYS = 14
HEADERS = {"User-Agent": "Kokushibu74-NewsFeed/2.0 (+https://kokushibu74.github.io/)"}
NS = {
    "media": "http://search.yahoo.com/mrss/",
    "content": "http://purl.org/rss/1.0/modules/content/",
}

def clean(value):
    value = re.sub(r"<[^>]+>", " ", value or "")
    return re.sub(r"\s+", " ", html.unescape(value)).strip()

def parse_date(value):
    if not value:
        return None
    try:
        dt = parsedate_to_datetime(value)
        if dt.tzinfo is None:
            dt = dt.replace(tzinfo=timezone.utc)
        return dt.astimezone(timezone.utc).isoformat()
    except Exception:
        return None

def image_for(node):
    for path in ("./media:content", "./media:thumbnail"):
        for el in node.findall(path, NS):
            url = el.attrib.get("url", "")
            if url.startswith("https://"):
                return url
    enclosure = node.find("enclosure")
    if enclosure is not None:
        url = enclosure.attrib.get("url", "")
        kind = enclosure.attrib.get("type", "")
        if url.startswith("https://") and kind.startswith("image/"):
            return url
    return ""

def key_for(item):
    title = re.sub(r"[^\w]+", " ", item.get("title", "").lower()).strip()
    source = item.get("source", "").lower()
    return (title, source)

def read_previous():
    try:
        with open(OUTPUT, "r", encoding="utf-8") as file:
            payload = json.load(file)
        items = payload.get("items", []) if isinstance(payload, dict) else []
        cutoff = datetime.now(timezone.utc) - timedelta(days=RETENTION_DAYS)
        retained = []
        for item in items:
            if not isinstance(item, dict) or not item.get("title") or not item.get("link", "").startswith("https://"):
                continue
            stamp = item.get("publishedAt")
            try:
                parsed = datetime.fromisoformat(stamp.replace("Z", "+00:00")) if stamp else None
                if parsed and parsed.tzinfo is None:
                    parsed = parsed.replace(tzinfo=timezone.utc)
            except (ValueError, AttributeError):
                parsed = None
            if parsed is None or parsed >= cutoff:
                retained.append(item)
        return retained
    except (OSError, json.JSONDecodeError, TypeError):
        return []

def main():
    previous = read_previous()
    collected, seen = [], set()
    successful_feeds = 0
    for label, query, language, country, edition in QUERIES:
        params = urllib.parse.urlencode({"q": query, "hl": language, "gl": country, "ceid": edition})
        request = urllib.request.Request("https://news.google.com/rss/search?" + params, headers=HEADERS)
        try:
            with urllib.request.urlopen(request, timeout=20) as response:
                root = ET.fromstring(response.read())
            successful_feeds += 1
            for node in root.findall("./channel/item")[:MAX_PER_FEED]:
                title = clean(node.findtext("title"))
                link = clean(node.findtext("link"))
                source_node = node.find("source")
                source = clean(source_node.text if source_node is not None else "") or "Google News"
                published = parse_date(node.findtext("pubDate"))
                if not title or not link.startswith("https://"):
                    continue
                item = {
                    "title": title, "link": link, "source": source,
                    "publishedAt": published, "category": label,
                    "summary": clean(node.findtext("description"))[:420],
                    "image": image_for(node),
                }
                key = key_for(item)
                if key in seen:
                    continue
                seen.add(key)
                collected.append(item)
        except Exception as exc:
            print("Feed error for", label, repr(query), ":", exc)

    # Merge recent known-good items behind fresh results so a temporary RSS outage
    # doesn't shrink the feed or erase useful headlines.
    merged = []
    for item in collected + previous:
        key = key_for(item)
        if key in seen and item not in collected:
            continue
        if key not in seen:
            seen.add(key)
        # Keep old items only when they are within the retention window.
        merged.append(item)
    if not collected and not previous:
        print("ERROR: no RSS items were collected; preserving the existing file.")
        return
    # Keep fresh items first, then fill category targets with retained headlines.
    by_category = {name: [] for name in ("Bangladesh", "World", "Technology", "AI")}
    category_seen = {name: set() for name in by_category}
    for item in merged:
        category = item.get("category", "World")
        if category not in by_category:
            continue
        key = key_for(item)
        if key in category_seen[category]:
            continue
        category_seen[category].add(key)
        by_category[category].append(item)

    # Sort each category newest-first; keep Bangladesh prominent and plentiful.
    for values in by_category.values():
        values.sort(key=lambda x: x.get("publishedAt") or "", reverse=True)
    selected = []
    selected_keys = set()
    # Prioritize at least 60 Bangladesh items when the sources/retained feed provide them.
    for category, quota in (("Bangladesh", BANGLADESH_TARGET), ("World", 30), ("Technology", 30), ("AI", 30)):
        for item in by_category[category][:quota]:
            key = key_for(item)
            if key not in selected_keys:
                selected.append(item)
                selected_keys.add(key)
    # If the category quotas do not reach 140, fill with the newest remaining headlines.
    remaining = [x for values in by_category.values() for x in values if key_for(x) not in selected_keys]
    remaining.sort(key=lambda x: x.get("publishedAt") or "", reverse=True)
    for item in remaining:
        if len(selected) >= min(TOTAL_TARGET, MAX_TOTAL):
            break
        key = key_for(item)
        if key not in selected_keys:
            selected.append(item)
            selected_keys.add(key)
    selected.sort(key=lambda x: x.get("publishedAt") or "", reverse=True)
    selected = selected[:MAX_TOTAL]
    bd_count = sum(1 for x in selected if x.get("category") == "Bangladesh")
    if successful_feeds == 0:
        print("WARNING: all RSS requests failed; only retained headlines are available.")
    if len(selected) < 100 or bd_count < 50:
        print("WARNING: target not met by currently available sources. Total:", len(selected), "Bangladesh:", bd_count)
    payload = {"updatedAt": datetime.now(timezone.utc).isoformat(), "items": selected}
    with open(OUTPUT, "w", encoding="utf-8") as file:
        json.dump(payload, file, ensure_ascii=False, indent=2)
        file.write("\n")
    print("Wrote", len(selected), "headlines; Bangladesh:", bd_count, "from", successful_feeds, "successful RSS queries.")

if __name__ == "__main__":
    main()
