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
    # Search dedicated breaking-news feeds first so explicit fresh alerts can be tagged.
    ("Bangladesh", "বাংলাদেশ ব্রেকিং নিউজ", "bn-BD", "BD", "BD:bn"),
    ("Bangladesh", "Bangladesh breaking news", "en-US", "BD", "BD:en"),
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
DIRECT_FEEDS = [
    # Public publisher RSS feeds; Google News searches remain a broad free fallback.
    ("The Daily Star", "https://www.thedailystar.net/frontpage/rss.xml"),
    ("Jago News 24", "https://www.jagonews24.com/rss/rss.xml"),
    ("Prothom Alo", "https://www.prothomalo.com/feed/"),
    ("BBC News বাংলা", "https://feeds.bbci.co.uk/bengali/rss.xml"),
    ("Dhaka Tribune", "https://www.dhakatribune.com/rss/home"),
]
BREAKING_QUERY_TEXTS = {"বাংলাদেশ ব্রেকিং নিউজ", "Bangladesh breaking news"}
DIRECT_SOURCE_NAMES = {name for name, _ in DIRECT_FEEDS}
BREAKING_TITLE_RE = re.compile(
    r"(?:breaking(?:\s+news)?(?:\s*[:!—–|]|\s*$)|ব্রেকিং(?:\s+নিউজ)?|"
    r"জরুরি(?: খবর| সংবাদ| আপডেট)|just in|developing story|সদ্যপ্রাপ্ত|"
    r"সর্বশেষ মুহূর্তে|এইমাত্র|জরুরি আপডেট)", re.I
)
BREAKING_EVENT_RE = re.compile(
    r"(?:নিহত|মারা গেছেন|[\d০-৯]+\s*জনের মৃত্যু|মৃত্যু(?: হয়েছে| হয়েছে| হলো| বেড়েছে| বেড়েছে| বাড়ছে| বাড়ছে)|"
    r"আগুন(?:ে(?: পুড়ে| পুড়ে| নিহত| আহত)| লেগেছে| ছড়িয়ে পড়েছে| ছড়িয়ে পড়েছে)|অগ্নিকাণ্ড|বিস্ফোরণ|বোমা হামলা|"
    r"দুর্ঘটনায় নিহত|দুর্ঘটনায় নিহত|ভূমিকম্প|ঘূর্ণিঝড়|ঘূর্ণিঝড়|বন্যা|"
    r"হামলা(?: হয়েছে| হয়েছে| চালানো হয়েছে| চালানো হয়েছে|য় নিহত|য় নিহত|য় আহত|য় আহত)|সংঘর্ষ(?:ে নিহত|ে আহত)?|গুলিতে নিহত|গুলি চালনা|"
    r"গ্রেপ্তার(?: হয়েছেন| হয়েছেন| করা হয়েছে| করা হয়েছে)?|আটক(?: হয়েছেন| হয়েছেন| করা হয়েছে| করা হয়েছে)?|"
    r"killed|death toll|died|dies|fire breaks out|major fire|explosion|blast|crash kills|earthquake|cyclone|flood|"
    r"attack|shooting|arrested|evacuated)", re.I
)
BREAKING_FOLLOWUP_RE = re.compile(
    r"(?:রিমান্ডে|মামলা(?: দায়ের| করা| হয়েছে| হয়েছে)?|আসামি\s*[০-৯0-9]+|চার্জশিট|"
    r"জিজ্ঞাসাবাদ|তদন্ত(?: চলছে|ে)|remanded|charges? filed|case filed|court orders|"
    r"investigation into)", re.I
)
MAX_PER_FEED = 25
MAX_TOTAL = 220
BANGLADESH_TARGET = 60
TOTAL_TARGET = 140
RETENTION_DAYS = 30
BREAKING_HISTORY_DAYS = 30
HEADERS = {
    "User-Agent": "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0.0.0 Safari/537.36",
    "Accept": "application/rss+xml, application/atom+xml, application/xml, text/xml, */*",
    "Accept-Language": "en-US,en;q=0.9,bn;q=0.8",
}
NS = {
    "media": "http://search.yahoo.com/mrss/",
    "content": "http://purl.org/rss/1.0/modules/content/",
}

def clean(value):
    value = re.sub(r"<[^>]+>", " ", value or "")
    return re.sub(r"\s+", " ", html.unescape(value)).strip()

def parse_feed_xml(raw):
    """Parse RSS/Atom XML and recover from common unescaped ampersands in feeds."""
    try:
        return ET.fromstring(raw)
    except ET.ParseError:
        text = raw.decode("utf-8", errors="replace") if isinstance(raw, bytes) else str(raw)
        text = re.sub(r"&(?!amp;|lt;|gt;|apos;|quot;|#\d+;|#x[0-9a-fA-F]+;)", "&amp;", text)
        text = re.sub(r"[\x00-\x08\x0b\x0c\x0e-\x1f]", "", text)
        return ET.fromstring(text)

def local_name(tag):
    """Return an XML tag's local name, including for namespaced RSS/Atom feeds."""
    return str(tag).rsplit("}", 1)[-1].split(":")[-1].lower()


def child_element(node, *names):
    wanted = {name.lower() for name in names}
    return next((child for child in list(node) if local_name(child.tag) in wanted), None)


def child_text(node, *names):
    child = child_element(node, *names)
    if child is None:
        return ""
    # Atom links store the URL in href; RSS links usually store it as text.
    if local_name(child.tag) == "link":
        return (child.attrib.get("href", "") or child.text or "").strip()
    return (child.text or "").strip()


def feed_items(root):
    """Find RSS items or Atom entries even when the feed uses XML namespaces."""
    return [node for node in root.iter() if local_name(node.tag) in ("item", "entry")]


def parse_date(value):
    if not value:
        return None
    try:
        try:
            dt = parsedate_to_datetime(value)
        except (TypeError, ValueError, OverflowError):
            dt = datetime.fromisoformat(value.replace("Z", "+00:00"))
        if dt.tzinfo is None:
            dt = dt.replace(tzinfo=timezone.utc)
        return dt.astimezone(timezone.utc).isoformat()
    except Exception:
        return None

def is_recent_breaking(title, published, query, source=""):
    """Conservative, free rule-based detection; publisher/event signals must be recent."""
    if not published:
        return False
    try:
        stamp = datetime.fromisoformat(published.replace("Z", "+00:00"))
        if stamp.tzinfo is None:
            stamp = stamp.replace(tzinfo=timezone.utc)
        age = datetime.now(timezone.utc) - stamp.astimezone(timezone.utc)
        if not (timedelta(minutes=-5) <= age <= timedelta(hours=2)):
            return False
        explicit_alert = bool(BREAKING_TITLE_RE.search(title))
        if explicit_alert:
            return True
        if query in BREAKING_QUERY_TEXTS:
            return False
        if source in DIRECT_SOURCE_NAMES:
            # A recent high-impact event may qualify, but routine legal follow-ups
            # about an older incident should not trigger the breaking ticker.
            return (
                age <= timedelta(minutes=45)
                and bool(BREAKING_EVENT_RE.search(title))
                and not BREAKING_FOLLOWUP_RE.search(title)
            )
        return False
    except (ValueError, TypeError):
        return False


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
        publisher_name = clean(meta.get("og:site_name") or meta.get("application-name") or final.hostname or "")
        if publisher_name.startswith("www."):
            publisher_name = publisher_name[4:]
        return {
            "publisherUrl": canonical,
            "publisherName": publisher_name[:120],
            "previewTitle": title[:260],
            "previewSummary": summary[:700],
            "previewImage": image,
            "iframeAllowed": bool(permission),
            "previewCheckedAt": datetime.now(timezone.utc).isoformat(),
        }
    except Exception as exc:
        print("Publisher preview unavailable:", type(exc).__name__, url[:120])
        return {}


def classify_direct_item(title, link, source=""):
    """Infer a broad feed category from publisher section, source, and headline."""
    path = urlparse(link).path.lower()
    text = (title or "").lower()
    if source == "BBC News বাংলা":
        local_terms = r"বাংলাদেশ|ঢাকা|চট্টগ্রাম|খুলনা|রাজশাহী|সিলেট|বরিশাল|রংপুর|কুমিল্লা|ময়মনসিংহ|ময়মনসিংহ|পদ্মা|যমুনা|সুন্দরবন|bangladesh|dhaka|chattogram"
        return "Bangladesh" if re.search(local_terms, text, re.I) else "World"
    if re.search(r"/(?:international|world|global|foreign)(?:/|$)", path):
        return "World"
    if re.search(r"/(?:technology|tech|science|gadget|gadgets)(?:/|$)", path):
        return "Technology"
    if re.search(r"/(?:ai|artificial-intelligence)(?:/|$)", path) or re.search(
        r"\b(?:artificial intelligence|generative ai|openai|chatgpt|gemini ai)\b|কৃত্রিম বুদ্ধিমত্তা", text, re.I
    ):
        return "AI"
    return "Bangladesh"


def key_for(item):
    """Deduplicate identical headlines across publishers, not just within one source."""
    title = re.sub(r"[^\w]+", " ", item.get("title", "").lower()).strip()
    return title

def read_breaking_history():
    """Load a 30-day archive of headlines previously detected as breaking."""
    try:
        with open(OUTPUT, "r", encoding="utf-8") as file:
            payload = json.load(file)
        history = payload.get("breakingHistory", []) if isinstance(payload, dict) else []
        cutoff = datetime.now(timezone.utc) - timedelta(days=BREAKING_HISTORY_DAYS)
        retained = []
        for item in history:
            if not isinstance(item, dict) or not item.get("title") or not item.get("link", "").startswith("https://"):
                continue
            # Purge entries misclassified by older, overly broad event keywords.
            if not BREAKING_TITLE_RE.search(item["title"]) and (
                not BREAKING_EVENT_RE.search(item["title"])
                or BREAKING_FOLLOWUP_RE.search(item["title"])
            ):
                continue
            stamp_text = item.get("detectedAt") or item.get("publishedAt")
            try:
                stamp = datetime.fromisoformat(stamp_text.replace("Z", "+00:00")) if stamp_text else None
                if stamp and stamp.tzinfo is None:
                    stamp = stamp.replace(tzinfo=timezone.utc)
            except (ValueError, AttributeError):
                stamp = None
            if stamp and stamp >= cutoff:
                retained.append(item)
        return retained
    except (OSError, json.JSONDecodeError, TypeError):
        return []


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
            # Breaking status must be re-earned from a fresh feed query every run.
            item.pop("isBreaking", None)
            if parsed is None or parsed >= cutoff:
                retained.append(item)
        return retained
    except (OSError, json.JSONDecodeError, TypeError):
        return []

def main():
    previous = read_previous()
    breaking_history = read_breaking_history()
    collected, seen = [], set()
    successful_feeds = 0

    # Direct publisher RSS feeds complement Google News and provide original article links.
    for source, feed_url in DIRECT_FEEDS:
        try:
            request = urllib.request.Request(feed_url, headers=HEADERS)
            with urllib.request.urlopen(request, timeout=10) as response:
                root = parse_feed_xml(response.read())
            nodes = feed_items(root)
            successful_feeds += 1
            for node in nodes[:MAX_PER_FEED]:
                title = clean(child_text(node, "title"))
                link = clean(child_text(node, "link"))
                published_raw = child_text(node, "pubDate", "published", "updated", "date")
                published = parse_date(published_raw)
                summary_raw = child_text(node, "description", "summary", "content")
                summary = clean(summary_raw)[:420]
                if not title or not link.startswith("https://"):
                    continue
                category = classify_direct_item(title, link, source)
                item = {
                    "title": title, "link": link, "source": source,
                    "publishedAt": published, "category": category,
                    "isBreaking": is_recent_breaking(title, published, "direct-rss", source),
                    "summary": summary, "image": image_for(node),
                    "publisherUrl": link, "publisherName": source,
                    "previewTitle": title, "previewSummary": summary,
                    "previewImage": image_for(node),
                    "previewCheckedAt": datetime.now(timezone.utc).isoformat(),
                }
                key = key_for(item)
                if not key or key in seen:
                    continue
                seen.add(key)
                collected.append(item)
        except Exception as exc:
            print("Direct RSS error for", source, ":", type(exc).__name__, str(exc)[:180])

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
                    "isBreaking": is_recent_breaking(title, published, query),
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
    preview_fields = ("publisherUrl", "publisherName", "previewTitle", "previewSummary", "previewImage", "previewScreenshot", "iframeAllowed", "previewCheckedAt")
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
    resolved_count = 0
    for item in preview_candidates:
        if item.get("previewTitle") and item.get("previewCheckedAt"):
            continue
        source_link = item.get("link", "")
        resolved_link = resolve_google_news_url(source_link) if urlparse(source_link).hostname and urlparse(source_link).hostname.endswith("news.google.com") else source_link
        if resolved_link and resolved_link.startswith("https://"):
            item["publisherUrl"] = resolved_link
            resolved_count += int(resolved_link != source_link)
            metadata = publisher_metadata(resolved_link)
        else:
            metadata = {}
        if metadata:
            item.update(metadata)
            enriched += 1
        else:
            # Keep the direct publisher link and RSS summary when publisher pages block bots.
            item.setdefault("publisherName", item.get("source", "Original publisher"))
            item.setdefault("previewTitle", item.get("title", ""))
            item.setdefault("previewSummary", item.get("summary", ""))
            item.setdefault("previewImage", item.get("image", ""))
            item["previewCheckedAt"] = datetime.now(timezone.utc).isoformat()
    print("Publisher URLs resolved:", resolved_count, "; metadata fetched:", enriched, "articles.")

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
    now_iso = datetime.now(timezone.utc).isoformat()
    history_by_title = {key_for(item): item for item in breaking_history}
    for item in collected:
        if not item.get("isBreaking"):
            continue
        key = key_for(item)
        if not key:
            continue
        history_by_title[key] = {
            "title": item.get("title", ""),
            "link": item.get("link", ""),
            "source": item.get("source", ""),
            "category": item.get("category", "Bangladesh"),
            "publishedAt": item.get("publishedAt"),
            "detectedAt": history_by_title.get(key, {}).get("detectedAt", now_iso),
            "isBreaking": True,
        }
    history_cutoff = datetime.now(timezone.utc) - timedelta(days=BREAKING_HISTORY_DAYS)
    history = []
    for item in history_by_title.values():
        stamp_text = item.get("detectedAt") or item.get("publishedAt")
        try:
            stamp = datetime.fromisoformat(stamp_text.replace("Z", "+00:00")) if stamp_text else None
            if stamp and stamp.tzinfo is None:
                stamp = stamp.replace(tzinfo=timezone.utc)
        except (ValueError, AttributeError):
            stamp = None
        if stamp and stamp >= history_cutoff:
            history.append(item)
    history.sort(key=lambda item: item.get("detectedAt") or item.get("publishedAt") or "", reverse=True)
    payload = {"updatedAt": now_iso, "items": selected, "breakingHistory": history[:500]}
    with open(OUTPUT, "w", encoding="utf-8") as file:
        json.dump(payload, file, ensure_ascii=False, indent=2)
        file.write("\n")
    print("Wrote", len(selected), "headlines; Bangladesh:", bd_count, "from", successful_feeds, "successful RSS queries.")

if __name__ == "__main__":
    main()
