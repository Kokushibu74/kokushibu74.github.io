import json
import re
import urllib.request
import urllib.parse
import xml.etree.ElementTree as ET
from datetime import datetime, timezone
from email.utils import parsedate_to_datetime

OUTPUT = "news-feed.json"
QUERIES = [
    ("Bangladesh", "বাংলাদেশ সংবাদ", "bn-BD", "BD", "BD:bn"),
    ("Bangladesh", "Bangladesh latest news", "en-US", "BD", "BD:en"),
    ("World", "world latest news", "en-US", "US", "US:en"),
    ("Technology", "technology news", "en-US", "US", "US:en"),
    ("AI", "artificial intelligence AI news", "en-US", "US", "US:en"),
]
MAX_PER_CATEGORY = 12
HEADERS = {"User-Agent": "Kokushibu74-NewsFeed/1.0 (+https://kokushibu74.github.io/)"}

def clean(value):
    return re.sub(r"\s+", " ", value or "").strip()

def category_for(label, title):
    if label == "Bangladesh":
        return "Bangladesh"
    if label == "World":
        return "World"
    if label == "Technology":
        return "AI" if re.search(r"\b(ai|artificial intelligence|llm|large language model|chatgpt|gemini)\b", title, re.I) else "Technology"
    return "AI"

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

def main():
    # Keep the last known-good feed in place if the upstream RSS service
    # fails or returns suspiciously few usable headlines.
    previous_items = []
    try:
        with open(OUTPUT, "r", encoding="utf-8") as existing:
            previous_payload = json.load(existing)
        if isinstance(previous_payload, dict) and isinstance(previous_payload.get("items"), list):
            previous_items = previous_payload["items"]
    except (OSError, json.JSONDecodeError):
        pass

    items, seen = [], set()
    successful_feeds = 0
    failed_feeds = 0
    for label, query, language, country, edition in QUERIES:
        params = urllib.parse.urlencode({"q": query, "hl": language, "gl": country, "ceid": edition})
        url = "https://news.google.com/rss/search?" + params
        req = urllib.request.Request(url, headers=HEADERS)
        try:
            with urllib.request.urlopen(req, timeout=20) as response:
                root = ET.fromstring(response.read())
            successful_feeds += 1
            for node in root.findall("./channel/item")[:MAX_PER_CATEGORY]:
                title = clean(node.findtext("title"))
                link = clean(node.findtext("link"))
                source = clean(node.findtext("source"))
                published = parse_date(node.findtext("pubDate"))
                if not title or not link or not link.startswith("https://") or link in seen:
                    continue
                seen.add(link)
                items.append({
                    "title": title,
                    "link": link,
                    "source": source or "Google News",
                    "publishedAt": published,
                    "category": category_for(label, title),
                })
        except Exception as exc:
            failed_feeds += 1
            print("Feed error for", label, ":", exc)

    # Never publish an empty feed over valid news just because every RSS
    # request failed or Google News temporarily returned no parseable items.
    if not items:
        print("WARNING: collected 0 headlines; preserving the existing news feed.")
        if failed_feeds == len(QUERIES):
            print("All RSS sources failed; updater is leaving news-feed.json untouched.")
        return

    # A drastic drop is likely an upstream/network problem, not a genuine
    # disappearance of all news. Keep the last known-good feed in that case.
    minimum_safe_count = min(12, max(5, len(previous_items) // 3)) if previous_items else 0
    if previous_items and len(items) < minimum_safe_count:
        print("WARNING: collected only", len(items), "headlines; expected at least",
              minimum_safe_count, "- preserving", len(previous_items), "existing headlines.")
        return

    if successful_feeds == 0:
        print("WARNING: no RSS source succeeded; preserving the existing news feed.")
        return

    items.sort(key=lambda item: item.get("publishedAt") or "", reverse=True)
    # Keep the feed compact and avoid duplicate headlines.
    payload = {"updatedAt": datetime.now(timezone.utc).isoformat(), "items": items[:48]}
    with open(OUTPUT, "w", encoding="utf-8") as file:
        json.dump(payload, file, ensure_ascii=False, indent=2)
        file.write("\n")
    print("Wrote", len(payload["items"]), "headlines to", OUTPUT)

if __name__ == "__main__":
    main()
