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
from html.parser import HTMLParser
from urllib.parse import urlparse

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
    # Google News sometimes embeds its thumbnail inside the RSS description HTML.
    raw = node.findtext("description") or ""
    raw += " " + (node.findtext("{http://purl.org/rss/1.0/modules/content/}encoded") or "")
    match = re.search(r'<img[^>]+src=["\\\'](https://[^"\\\']+)["\\\']', raw, re.I)
    if match:
        return html.unescape(match.group(1))
    return ""


class PageMetadataParser(HTMLParser):
    """Extract standard publisher metadata without executing page scripts."""
    def __init__(self):
        super().__init__(convert_charrefs=True)
        self.meta = {}
        self.canonical = ""
        self.title_parts = []
        self.links = []
        self.in_title = False

    def handle_starttag(self, tag, attrs):
        attrs = {str(k).lower(): (v or "") for k, v in attrs}
        if tag.lower() == "meta":
            key = (attrs.get("property") or attrs.get("name") or "").strip().lower()
            value = attrs.get("content", "").strip()
            if key and value and key not in self.meta:
                self.meta[key] = value
        elif tag.lower() == "link" and "canonical" in attrs.get("rel", "").lower().split():
            href = attrs.get("href", "").strip()
            if href.startswith("https://"):
                self.canonical = href
        elif tag.lower() == "a":
            href = attrs.get("href", "").strip()
            if href.startswith("https://"):
                self.links.append(href)
        elif tag.lower() == "title":
            self.in_title = True

    def handle_endtag(self, tag):
        if tag.lower() == "title":
            self.in_title = False

    def handle_data(self, data):
        if self.in_title and data.strip():
            self.title_parts.append(data.strip())


def frame_permission(headers):
    """Conservatively allow iframe only when response headers don't prohibit this site."""
    xfo = (headers.get("X-Frame-Options") or "").strip().lower()
    if xfo in ("deny", "sameorigin") or xfo.startswith("deny") or xfo.startswith("sameorigin"):
        return False
    csp = headers.get("Content-Security-Policy") or ""
    for directive in csp.split(";"):
        directive = directive.strip()
        if directive.lower().startswith("frame-ancestors"):
            sources = directive.split()[1:]
            return any(source == "*" or "kokushibu74.github.io" in source or source in ("https:", "http:") for source in sources)
    return not bool(xfo)



def resolve_google_news_url(url):
    """Resolve current Google News RSS wrapper URLs using its article RPC."""
    try:
        parsed = urlparse(url)
        if parsed.hostname not in ("news.google.com", "www.news.google.com"):
            return url
        article_id = parsed.path.rstrip("/").split("/")[-1]
        if not article_id or parsed.scheme != "https":
            return ""
        headers = {
            "User-Agent": "Mozilla/5.0",
            "Cookie": "CONSENT=YES+cb; SOCS=CAI",
            "Accept": "text/html,application/xhtml+xml",
        }
        page_request = urllib.request.Request(
            "https://news.google.com/rss/articles/" + article_id,
            headers=headers,
        )
        with urllib.request.urlopen(page_request, timeout=8) as response:
            page = response.read(1_200_000).decode("utf-8", errors="replace")
        signature = re.search(r'data-n-a-sg="([^"]+)"', page)
        timestamp = re.search(r'data-n-a-ts="([^"]+)"', page)
        if not signature or not timestamp:
            print("Google News resolver: missing signature/timestamp.")
            return ""
        inner = (
            '["garturlreq",[["X","X",["X","X"],null,null,1,1,"US:en",null,1,'
            'null,null,null,null,null,0,1],"X","X",1,[1,1,1],1,1,null,0,0,null,0],'
            + json.dumps(article_id) + "," + timestamp.group(1) + "," + json.dumps(signature.group(1)) + "]"
        )
        payload = urllib.parse.urlencode({
            "f.req": json.dumps([[["Fbv4je", inner, None, "generic"]]])
        }).encode()
        rpc_request = urllib.request.Request(
            "https://news.google.com/_/DotsSplashUi/data/batchexecute?rpcids=Fbv4je",
            data=payload,
            headers={
                "User-Agent": "Mozilla/5.0",
                "Cookie": "CONSENT=YES+cb; SOCS=CAI",
                "Content-Type": "application/x-www-form-urlencoded;charset=UTF-8",
            },
        )
        with urllib.request.urlopen(rpc_request, timeout=8) as response:
            raw = response.read(300_000).decode("utf-8", errors="replace")
        parts = raw.split("\n\n", 1)
        if len(parts) < 2:
            return ""
        outer = json.loads(parts[1])
        row = next((entry[2] for entry in outer if len(entry) > 2 and entry[0] == "wrb.fr" and entry[1] == "Fbv4je"), None)
        if not row:
            return ""
        result = json.loads(row)
        candidate = result[1] if isinstance(result, list) and len(result) > 1 else ""
        final = urlparse(candidate)
        if final.scheme == "https" and final.hostname and not final.hostname.endswith("google.com"):
            return candidate
        return ""
    except Exception as exc:
        print("Google News URL resolution failed:", type(exc).__name__)
        return ""


def publisher_metadata(url):
    """Fetch a public article's Open Graph metadata with strict time/size limits."""
    try:
        parsed = urlparse(url)
        if parsed.scheme != "https" or not parsed.hostname:
            return {}
        if parsed.hostname.endswith("news.google.com"):
            resolved_url = resolve_google_news_url(url)
            if resolved_url:
                return publisher_metadata(resolved_url)
            return {}
        request = urllib.request.Request(url, headers={
            **HEADERS,
            "User-Agent": "Mozilla/5.0 (compatible; NewsPreviewBot/1.0; +https://kokushibu74.github.io/)",
            "Accept": "text/html,application/xhtml+xml",
        })
        with urllib.request.urlopen(request, timeout=6) as response:
            final_url = response.geturl()
            final = urlparse(final_url)
            if final.scheme != "https" or not final.hostname:
                return {}
            content_type = (response.headers.get("Content-Type") or "").lower()
            if "html" not in content_type:
                return {}
            body = response.read(400_000).decode(response.headers.get_content_charset() or "utf-8", errors="replace")
            permission = frame_permission(response.headers)
        parser = PageMetadataParser()
        parser.feed(body)
        # Google News sometimes serves an interstitial rather than redirecting.
        # Extract the external publisher URL and fetch the publisher page itself.
        if final.hostname.endswith("news.google.com"):
            candidate = parser.canonical if parser.canonical.startswith("https://") and not urlparse(parser.canonical).hostname.endswith("news.google.com") else ""
            if not candidate:
                candidate = next((href for href in parser.links if urlparse(href).hostname and not urlparse(href).hostname.endswith(("news.google.com", "google.com"))), "")
            if candidate:
                return publisher_metadata(candidate)
            return {}
        meta = parser.meta
        title = clean(meta.get("og:title") or meta.get("twitter:title") or " ".join(parser.title_parts))
        summary = clean(meta.get("og:description") or meta.get("description") or meta.get("twitter:description"))
        image = meta.get("og:image:secure_url") or meta.get("og:image") or meta.get("twitter:image") or meta.get("twitter:image:src") or ""
        if image.startswith("//"):
            image = "https:" + image
        elif image.startswith("/"):
            image = final.scheme + "://" + final.netloc + image
        if not image.startswith("https://"):
            image = ""
        canonical = parser.canonical or final_url
        if not canonical.startswith("https://"):
            canonical = final_url
        return {
            "publisherUrl": canonical,
            "previewTitle": title[:260],
            "previewSummary": summary[:700],
            "previewImage": image,
            "iframeAllowed": bool(permission),
            "previewCheckedAt": datetime.now(timezone.utc).isoformat(),
        }
    except Exception as exc:
        print("Publisher preview unavailable:", type(exc).__name__, url[:120])
        return {}


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


    # Reuse publisher metadata from the last feed run for unchanged stories.
    old_metadata = {key_for(item): item for item in previous}
    preview_fields = ("publisherUrl", "previewTitle", "previewSummary", "previewImage", "iframeAllowed", "previewCheckedAt")
    for item in collected:
        cached = old_metadata.get(key_for(item), {})
        for field in preview_fields:
            if cached.get(field) not in (None, ""):
                item[field] = cached[field]

    # Enrich the ten Bangladesh carousel candidates first; limit network work per run.
    sorted_items = sorted(collected, key=lambda x: x.get("publishedAt") or "", reverse=True)
    preview_candidates = [x for x in sorted_items if x.get("category") == "Bangladesh"][:10]
    preview_candidates += [x for x in sorted_items if x.get("category") != "Bangladesh"][:4]
    enriched = 0
    for item in preview_candidates:
        if item.get("previewTitle") and item.get("previewCheckedAt"):
            continue
        metadata = publisher_metadata(item.get("link", ""))
        if metadata:
            item.update(metadata)
            enriched += 1
    print("Publisher metadata enriched:", enriched, "articles.")

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
