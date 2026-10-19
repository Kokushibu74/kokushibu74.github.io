import json
import re
import urllib.request
import urllib.parse
import xml.etree.ElementTree as ET
from datetime import datetime, timezone
from email.utils import parsedate_to_datetime

OUTPUT = "news-feed.json"
QUERIES = [
    ("Bangladesh", "Bangladesh latest news"),
    ("World", "world latest news"),
    ("Technology", "technology news"),
    ("AI", "artificial intelligence AI news"),
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
    items, seen = [], set()
    for label, query in QUERIES:
        params = urllib.parse.urlencode({"q": query, "hl": "en-US", "gl": "US", "ceid": "US:en"})
        url = "https://news.google.com/rss/search?" + params
        req = urllib.request.Request(url, headers=HEADERS)
        try:
            with urllib.request.urlopen(req, timeout=20) as response:
                root = ET.fromstring(response.read())
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
            print("Feed error for", label, ":", exc)
    items.sort(key=lambda item: item.get("publishedAt") or "", reverse=True)
    # Keep the feed compact and avoid duplicate headlines.
    payload = {"updatedAt": datetime.now(timezone.utc).isoformat(), "items": items[:48]}
    with open(OUTPUT, "w", encoding="utf-8") as file:
        json.dump(payload, file, ensure_ascii=False, indent=2)
        file.write("\n")
    print("Wrote", len(payload["items"]), "headlines to", OUTPUT)

if __name__ == "__main__":
    main()
