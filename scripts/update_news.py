#!/usr/bin/env python3
"""Build a larger, deduplicated news feed from public Google News RSS searches."""
import html
import json
import re
import urllib.request
import urllib.parse
import urllib.error
import time
import xml.etree.ElementTree as ET
from datetime import datetime, timezone, timedelta
from zoneinfo import ZoneInfo
from email.utils import parsedate_to_datetime
from html.parser import HTMLParser
from urllib.parse import urlparse
from pathlib import Path

OUTPUT = "news-feed.json"
WEATHER_QUERIES = [
    ("Bangladesh weather OR flood OR cyclone OR landslide OR storm OR earthquake OR lightning OR wildfire", "bn-BD", "BD", "BD:bn"),
    ("Bangladesh weather OR flood OR cyclone OR landslide OR storm OR earthquake OR lightning OR wildfire", "en-US", "BD", "BD:en"),
    ("world weather OR flood OR cyclone OR earthquake OR landslide OR wildfire OR drought OR tsunami OR lightning", "en-US", "US", "US:en"),
    ("natural disaster OR extreme weather OR major storm OR tsunami", "en-US", "US", "US:en"),
]
WEATHER_DISASTER_RE = re.compile(
    r"(?:weather|forecast|flood|flooding|cyclone|hurricane|typhoon|storm|"
    r"heavy rain|rainfall|heatwave|heat wave|earthquake|landslide|wildfire|"
    r"drought|tsunami|tornado|wildfire|lightning|volcanic eruption|natural disaster|monsoon|ঘূর্ণিঝড়|ঘূর্ণিঝড়|"
    r"বন্যা|ভূমিকম্প|আবহাওয়া|আবহাওয়া|দুর্যোগ|বৃষ্টি|জলোচ্ছ্বাস|পাহাড়ধস|পাহাড়ধস|বজ্রপাত|দাবানল|খরা)", re.I
)
WEATHER_SEVERITY_RE = re.compile(
    r"(?:সতর্কবার্তা|বিপদ সংকেত|বিপদসীমা|জরুরি সতর্কতা|চরম|ভয়াবহ|ভয়াবহ|অতি ভারী|অত্যন্ত ভারী|"
    r"নিহত|মৃত্যু|আহত|মাত্রা|ক্ষয়ক্ষতি|ক্ষয়ক্ষতি|ধ্বংস|উচ্ছেদ|major|severe|extreme|warning|alert|evacuat|destroy|"
    r"landfall|danger level|signal|magnitude|fatal|killed|deadly|disrupts flights)", re.I
)
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
    ("Technology", "artificial intelligence AI news", "en-US", "US", "US:en"),
    ("Technology", "ChatGPT OpenAI Google Gemini AI news", "en-US", "US", "US:en"),
]
DIRECT_FEEDS = [
    # Public publisher RSS feeds; Google News searches remain a broad free fallback.
    ("The Daily Star", "https://www.thedailystar.net/frontpage/rss.xml"),
    ("Jago News 24", "https://www.jagonews24.com/rss/rss.xml"),
    ("Prothom Alo", "https://www.prothomalo.com/feed/"),
    ("BBC News বাংলা", "https://feeds.bbci.co.uk/bengali/rss.xml"),
    ("BBC News World", "https://feeds.bbci.co.uk/news/world/rss.xml"),
]
BREAKING_QUERY_TEXTS = {"বাংলাদেশ ব্রেকিং নিউজ", "Bangladesh breaking news"}
DIRECT_SOURCE_NAMES = {name for name, _ in DIRECT_FEEDS}
BREAKING_TITLE_RE = re.compile(
    r"(?:breaking(?:\s+news)?(?:\s*[:!—–|]|\s*$)|ব্রেকিং(?:\s+নিউজ)?|"
    r"জরুরি(?: খবর| সংবাদ| আপডেট)|just in|developing story|সদ্যপ্রাপ্ত|"
    r"সর্বশেষ মুহূর্তে|এইমাত্র|জরুরি আপডেট)", re.I
)
BREAKING_EVENT_RE = re.compile(
    r"(?:নিহত|মারা (?:গেছেন|গেছে|গেল(?:ো|েন)?|যান)|প্রাণ (?:হারিয়েছেন|হারিয়েছে|হারান|গেছে|গেল)|খুন|হত্যা|murder|homicide|[\d০-৯]+\s*জনের মৃত্যু|মৃত্যু(?: হয়েছে| হয়েছে| হলো| বেড়েছে| বেড়েছে| বাড়ছে| বাড়ছে)|"
    r"আগুন(?:ে(?: পুড়ে| পুড়ে| নিহত| আহত)| লেগেছে| ছড়িয়ে পড়েছে| ছড়িয়ে পড়েছে)|অগ্নিকাণ্ড|বিস্ফোরণ|বোমা হামলা|"
    r"দুর্ঘটনায় নিহত|দুর্ঘটনায় নিহত|বড়.{0,12}দুর্ঘটনা|বৃহৎ.{0,12}দুর্ঘটনা|গুরুতর.{0,12}দুর্ঘটনা|ভয়াবহ.{0,12}দুর্ঘটনা|major.{0,20}(?:accident|crash|collision)|mass accident|train derailment|launch capsized|building collapse|ভূমিকম্প|ঘূর্ণিঝড়|ঘূর্ণিঝড়|বন্যা|জলোচ্ছ্বাস|"
    r"হামলা(?: হয়েছে| হয়েছে| চালানো হয়েছে| চালানো হয়েছে|য় নিহত|য় নিহত|য় আহত|য় আহত)|সশস্ত্র সংঘর্ষ|গুলিবর্ষণ|পুলিশের গুলি|armed clash|police firing|shooting|riot|সংঘর্ষে নিহত|সংঘর্ষে আহত|গুলিতে নিহত|গুলি চালনা|"
    r"জরুরি অবস্থা|ক্ষমতাচ্যুত|পদত্যাগ করেছেন|পদত্যাগের ঘোষণা|নির্বাচন স্থগিত|সরকার ভেঙে|"
    r"গণভোট|গণঅভ্যুত্থান|গণভোটের (?:তারিখ|ফল|সিদ্ধান্ত)|referendum (?:date|result|decision)|"
    r"পাহাড়ধস|পাহাড়ধস|তাপপ্রবাহ|কালবৈশাখী|জলোচ্ছ্বাস|ঘূর্ণিঝড়|ঘূর্ণিঝড়|storm surge|landslide|heatwave|heat wave|heavy rain|tornado|tsunami|"
    r"killed|death toll|died|dies|fire breaks out|major fire|explosion|blast|crash kills|earthquake|cyclone|flood|"
    r"mass casualty|emergency declared|resigns|resigned|steps down|coup|war|armed conflict|airstrike|invasion|ceasefire|embassy evacuation|Bangladeshi nationals|Bangladesh embassy|terror attack|bombing|hostage|attack on|evacuated)", re.I
)
BREAKING_FOLLOWUP_RE = re.compile(
    r"(?:রিমান্ডে|মামলা(?: দায়ের| করা| হয়েছে| হয়েছে)?|আসামি\s*[০-৯0-9]+|চার্জশিট|"
    r"জিজ্ঞাসাবাদ|তদন্ত(?: চলছে|ে)|গ্রেপ্তার|গ্রেফতার|আটক|মামলার শুনানি|আদালতে হাজির|remanded|arrested|arrest in|trial|hearing|convicted|sentenced|case update|charges? filed|case filed|court orders|"
    r"investigation into|anniversary|years? ago|what happened|timeline|retrospective|"
    r"বার্ষিকী|বছর আগে|বছর পরে|দশক পরে|পেছন ফিরে|স্মরণে|স্মৃতিচারণ|পুরোনো ঘটনা|পূর্বের ঘটনা|"
    r"years? later|decades? later|from the archives|historical footage|old case|past incident)", re.I
)
BREAKING_HISTORY_DAYS = 30
FEED_RETENTION_DAYS = 90
BANGLADESH_TZ = ZoneInfo("Asia/Dhaka")
HEADERS = {
    "User-Agent": "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0.0.0 Safari/537.36",
    "Accept": "application/rss+xml, application/atom+xml, application/xml, text/xml, */*",
    "Accept-Language": "en-US,en;q=0.9,bn;q=0.8",
}
NS = {
    "media": "http://search.yahoo.com/mrss/",
    "content": "http://purl.org/rss/1.0/modules/content/",
}

CATEGORY_CONFIG_PATH = Path(__file__).resolve().parents[1] / "news-categories.json"
with CATEGORY_CONFIG_PATH.open("r", encoding="utf-8") as category_file:
    CATEGORY_CONFIG = json.load(category_file)
DEFAULT_SUBCATEGORY = str(CATEGORY_CONFIG.get("defaultSubcategory") or "Other / Unclassified")
SUBCATEGORY_NAMES = {
    str(category): tuple(str(name) for name in names)
    for category, names in CATEGORY_CONFIG.get("categories", {}).items()
}

def urlopen_with_retry(request, timeout, attempts=2, base_delay=0.5):
    """Retry transient GET failures only; never replay POST requests."""
    method = request.get_method().upper()
    retryable = method in {"GET", "HEAD"} and getattr(request, "data", None) is None
    attempts = max(1, min(int(attempts), 2))
    for attempt in range(attempts):
        try:
            return urllib.request.urlopen(request, timeout=timeout)
        except urllib.error.HTTPError as exc:
            if not retryable or exc.code not in {408, 425, 429, 500, 502, 503, 504} or attempt + 1 >= attempts:
                raise
            retry_after = (exc.headers or {}).get("Retry-After", "")
            try:
                delay = min(4.0, max(0.1, float(retry_after)))
            except (TypeError, ValueError):
                delay = min(4.0, base_delay * (2 ** attempt))
            exc.close()
            time.sleep(delay)
        except (urllib.error.URLError, TimeoutError, OSError):
            if not retryable or attempt + 1 >= attempts:
                raise
            time.sleep(min(4.0, base_delay * (2 ** attempt)))


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

def is_recent_breaking(title, published, query, source="", summary="", now=None):
    """Only fresh, high-impact events qualify; a 'breaking' label alone is insufficient."""
    if not published:
        return False
    try:
        stamp = datetime.fromisoformat(published.replace("Z", "+00:00"))
        if stamp.tzinfo is None:
            stamp = stamp.replace(tzinfo=timezone.utc)
        current = now or datetime.now(timezone.utc)
        if current.tzinfo is None:
            current = current.replace(tzinfo=timezone.utc)
        age = current.astimezone(timezone.utc) - stamp.astimezone(timezone.utc)
        # Keep the threshold aligned with the Worker's 60-minute alert freshness gate; feed labels and search query names
        # are not evidence that a story itself is genuinely breaking.
        if not (timedelta(minutes=-5) <= age <= timedelta(minutes=60)):
            return False
        story_text = str(title or "") + " " + str(summary or "")
        if BREAKING_FOLLOWUP_RE.search(story_text):
            return False
        # Anniversary/retrospective coverage is not a live breaking event.
        if re.search(r"(?:বার্ষিকী|২০\s*বছর|বিশ\s*বছর|আগে যা যা ঘটেছিল|পেছন ফিরে|স্মরণে|anniversary|years? ago|what happened before|look back)", story_text, re.I):
            return False
        # Google News query results are noisy: require an actual high-impact event
        # phrase, even when the query or title says "breaking news".
        if not BREAKING_EVENT_RE.search(story_text):
            return False
        return True
    except (ValueError, TypeError):
        return False


def weather_preview_image(item):
    """Return the first usable HTTPS image from publisher metadata or RSS media fields."""
    for field in ("previewImage", "image", "imageUrl", "thumbnail", "thumbnailUrl",
                  "enclosureUrl", "previewScreenshot"):
        value = item.get(field)
        if isinstance(value, str) and value.startswith("https://"):
            return value
    return ""


def image_for(node):
    for path in ("./media:content", "./media:thumbnail"):
        for el in node.findall(path, NS):
            url = el.attrib.get("url", "")
            kind = (el.attrib.get("type") or "").lower()
            medium = (el.attrib.get("medium") or "").lower()
            if url.startswith("https://") and not kind.startswith("video/") and medium != "video":
                return url
    enclosure = child_element(node, "enclosure")
    if enclosure is not None:
        url = enclosure.attrib.get("url", "")
        kind = (enclosure.attrib.get("type") or "").lower()
        if url.startswith("https://") and kind.startswith("image/"):
            return url
    raw = child_text(node, "description", "summary", "content")
    raw += " " + child_text(node, "encoded")
    match = re.search(r"<img[^>]+src=['\"](https://[^'\"]+)['\"]", raw, re.I)
    if match:
        return html.unescape(match.group(1))
    return ""


def video_for(node):
    for path in ("./media:content", "./media:group/media:content"):
        for el in node.findall(path, NS):
            url = el.attrib.get("url", "")
            kind = (el.attrib.get("type") or "").lower()
            medium = (el.attrib.get("medium") or "").lower()
            if url.startswith("https://") and (kind.startswith("video/") or medium == "video"):
                return url
    enclosure = child_element(node, "enclosure")
    if enclosure is not None:
        url = enclosure.attrib.get("url", "")
        kind = (enclosure.attrib.get("type") or "").lower()
        if url.startswith("https://") and kind.startswith("video/"):
            return url
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
        with urlopen_with_retry(page_request, timeout=8) as response:
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

def resolve_alert_publisher_url(item, budget):
    """Resolve only fresh breaking candidates, with a strict per-refresh network budget."""
    link = clean(item.get("link") or "")
    if not item.get("isBreaking") or not link.startswith("https://"):
        return ""
    host = (urlparse(link).hostname or "").lower()
    if host in ("news.google.com", "www.news.google.com"):
        if budget.get("remaining", 0) <= 0:
            return ""
        budget["remaining"] -= 1
        resolved = resolve_google_news_url(link)
        parsed = urlparse(resolved)
        return resolved if parsed.scheme == "https" and parsed.hostname and not parsed.hostname.endswith("google.com") else ""
    return link



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
        with urlopen_with_retry(request, timeout=6) as response:
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
    if source == "BBC News World":
        return "World"
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
        return "Technology"
    return "Bangladesh"



SUBCATEGORY_RULES = {
    "Bangladesh": [
        ("Politics & Government", re.compile(
            r"\b(?:politic\w*|election\w*|parliament|government|minister|prime minister|president|"
            r"lawmakers?|mp\b|cabinet|opposition|referendum|political party|bnp|awami league|jamaat|"
            r"jatiya party|mayor|mayoral|councilor)\b|রাজনীতি|নির্বাচন|সংসদ|সরকার|মন্ত্রী|প্রধানমন্ত্রী|"
            r"রাষ্ট্রপতি|রাজনৈতিক|দলীয়|দলীয়|বিএনপি|আওয়ামী লীগ|আওয়ামী লীগ|জামায়াত|জামায়াত|"
            r"জাতীয় পার্টি|জাতীয় পার্টি|মেয়র|মেয়র|উপদেষ্টা পরিষদ", re.I
        )),
        ("Economy & Business", re.compile(
            r"\b(?:econom\w*|business|bank(?:ing)?|inflation|budget|market|trade|export\w*|import\w*|"
            r"investment|investor|stock market|share market|remittance|gdp|currency|tax|revenue|loan|"
            r"finance|financial|startup|company|corporate|price hike|cost of living)\b|অর্থনীতি|অর্থনৈতিক|"
            r"ব্যবসা|ব্যাংক|মূল্যস্ফীতি|বাজেট|বাজার|বাণিজ্য|রপ্তানি|আমদানি|বিনিয়োগ|বিনিয়োগ|"
            r"শেয়ার বাজার|শেয়ার বাজার|রেমিট্যান্স|মুদ্রা|কর আদায়|কর আদায়|রাজস্ব|ঋণ|দাম বৃদ্ধি|"
            r"দ্রব্যমূল্য|পুঁজিবাজার", re.I
        )),
        ("Crime & Law", re.compile(
            r"\b(?:crime|criminal|police|murder|homicide|arrest\w*|court|judiciar\w*|lawsuit|trial|"
            r"verdict|convict\w*|charged|robbery|theft|fraud|rape|assault|kidnap\w*|corruption|"
            r"law enforcement|prison|jail|detained|prosecut\w*)\b|অপরাধ|পুলিশ|হত্যা|খুন|গ্রেপ্তার|গ্রেফতার|"
            r"আটক|আদালত|মামলা|বিচার|রায়|রায়|দণ্ড|কারাদণ্ড|চুরি|ডাকাতি|প্রতারণা|ধর্ষণ|"
            r"দুর্নীতি|কারাগার|জেল|আইনশৃঙ্খলা|আইন-শৃঙ্খলা", re.I
        )),
        ("Society & Education", re.compile(
            r"\b(?:education|school|college|universit\w*|student\w*|teacher\w*|exam\w*|admission|"
            r"curriculum|scholarship|societ\w*|community|culture|festival|transport|road|railway|"
            r"bridge|public service|housing|urban|rural|social)\b|শিক্ষা|"
            r"বিদ্যালয়|বিদ্যালয়|স্কুল|কলেজ|বিশ্ববিদ্যালয়|বিশ্ববিদ্যালয়|শিক্ষার্থী|শিক্ষক|পরীক্ষা|"
            r"ভর্তি|পাঠ্যক্রম|বৃত্তি|সমাজ|সংস্কৃতি|উৎসব|পরিবহন|সড়ক|সড়ক|রেল|সেতু|"
            r"জনসেবা|আবাসন|গ্রাম|নগর|ক্রিকেট|ফুটবল|খেলাধুলা|ক্রীড়া|ক্রীড়া", re.I
        )),
        ("Health & Environment", re.compile(
            r"\b(?:health|hospital|doctor|medical|medicine|disease|dengue|virus|vaccine|outbreak|"
            r"patient|healthcare|clinic|epidemic|climate|environment|pollution|river|forest|wildlife|"
            r"biodiversity|flood\w*|cyclone|earthquake|landslide|heatwave|storm|disaster|weather|"
            r"rainfall|drought|waterlogging|air quality)\b|স্বাস্থ্য|হাসপাতাল|চিকিৎসা|ডাক্তার|ওষুধ|"
            r"রোগ|ডেঙ্গু|ভাইরাস|টিকা|সংক্রমণ|রোগী|জলবায়ু|জলবায়ু|পরিবেশ|দূষণ|নদী|বন|বন্যপ্রাণী|"
            r"বন্যা|ঘূর্ণিঝড়|ঘূর্ণিঝড়|ভূমিকম্প|পাহাড়ধস|পাহাড়ধস|তাপপ্রবাহ|দুর্যোগ|আবহাওয়া|"
            r"আবহাওয়া|বৃষ্টিপাত|খরা|জলাবদ্ধতা", re.I
        )),
    ],
    "World": [
        ("International Politics", re.compile(
            r"\b(?:election\w*|president|prime minister|government|parliament|congress|senate|"
            r"politic\w*|opposition|minister|cabinet|coup|referendum|policy|ruling party|"
            r"general election|vote|voting)\b|নির্বাচন|রাষ্ট্রপতি|প্রধানমন্ত্রী|সরকার|সংসদ|রাজনীতি|"
            r"রাজনৈতিক|অভ্যুত্থান|গণভোট|ক্ষমতাসীন দল|বিরোধী দল", re.I
        )),
        ("War & Conflict", re.compile(
            r"\b(?:war|armed conflict|airstrike\w*|missile\w*|invasion|military|ceasefire|battlefield|"
            r"troops|bombing|conflict|combat|frontline|hostage|weapon\w*|drone strike|shelling|"
            r"gaza|ukraine|israel|palestine|iran war)\b|যুদ্ধ|সশস্ত্র সংঘাত|বিমান হামলা|ক্ষেপণাস্ত্র|"
            r"আক্রমণ|হামলা|সামরিক|যুদ্ধবিরতি|সেনা|বোমা হামলা|সংঘাত|যুদ্ধক্ষেত্র|জিম্মি|"
            r"অস্ত্র|গাজা|ইউক্রেন|ইসরায়েল|ইসরায়েল|ফিলিস্তিন", re.I
        )),
        ("Global Economy", re.compile(
            r"\b(?:global economy|world economy|econom\w*|inflation|central bank|interest rate|"
            r"global trade|tariff\w*|stock market|oil price|gdp|recession|market|export\w*|import\w*|"
            r"investment|finance|currency|debt|business|banking|supply chain)\b|বিশ্ব অর্থনীতি|"
            r"বৈশ্বিক অর্থনীতি|মুদ্রাস্ফীতি|কেন্দ্রীয় ব্যাংক|কেন্দ্রীয় ব্যাংক|সুদের হার|বাণিজ্য|"
            r"শুল্ক|তেলের দাম|মন্দা|বিনিয়োগ|বিনিয়োগ|বৈদেশিক মুদ্রা|ঋণ|ব্যবসা", re.I
        )),
        ("Diplomacy & Relations", re.compile(
            r"\b(?:diplomac\w*|diplomatic|summit|bilateral|treaty|foreign minister|embassy|"
            r"ambassador|relations|peace talks|negotiat\w*|united nations|\bun\b|nato|g7|"
            r"european union|international agreement|sanctions)\b|কূটনীতি|কূটনৈতিক|সম্মেলন|"
            r"দ্বিপাক্ষিক|চুক্তি|পররাষ্ট্রমন্ত্রী|দূতাবাস|রাষ্ট্রদূত|সম্পর্ক|শান্তি আলোচনা|"
            r"আলোচনা|জাতিসংঘ|নিষেধাজ্ঞা", re.I
        )),
        ("Climate & Disaster", re.compile(
            r"\b(?:climate|environment|pollution|flood\w*|cyclone|hurricane|typhoon|earthquake|"
            r"landslide|wildfire|storm|drought|tsunami|heatwave|weather|rainfall|volcano|"
            r"eruption|emissions|natural disaster|extreme weather)\b|জলবায়ু|জলবায়ু|পরিবেশ|"
            r"দূষণ|বন্যা|ঘূর্ণিঝড়|ঘূর্ণিঝড়|ভূমিকম্প|ভূমিধস|দাবানল|ঝড়|ঝড়|খরা|সুনামি|"
            r"তাপপ্রবাহ|আবহাওয়া|আবহাওয়া|বৃষ্টিপাত|আগ্নেয়গিরি|আগ্নেয়গিরি|দুর্যোগ", re.I
        )),
    ],
    "Technology": [
        ("Artificial Intelligence", re.compile(
            r"\b(?:artificial intelligence|generative ai|\bai\b|llm\\w*|chatgpt|openai|gemini|"
            r"claude|copilot|machine learning|deep learning|neural network|large language model|"
            r"ai model|ai tool)\b|কৃত্রিম বুদ্ধিমত্তা|এআই|এ আই|চ্যাটজিপিটি|জেমিনি", re.I
        )),
        ("Science & Space", re.compile(
            r"\b(?:science|scientific|research|study|discovery|nasa|space|astronaut|satellite|"
            r"rocket|moon|mars|telescope|physics|biology|genetic\w*|quantum|laboratory|particle)\b|"
            r"বিজ্ঞান|গবেষণা|আবিষ্কার|মহাকাশ|মহাকাশচারী|উপগ্রহ|রকেট|চাঁদ|মঙ্গল|দূরবীক্ষণ|"
            r"পদার্থবিজ্ঞান|জীববিজ্ঞান|জিন|কোয়ান্টাম|কোয়ান্টাম", re.I
        )),
        ("Gadgets & Devices", re.compile(
            r"\b(?:smartphone|mobile phone|iphone|ipad|macbook|samsung galaxy|pixel phone|"
            r"laptop|computer|tablet|smartwatch|gadget\w*|device\w*|processor|chipset|gpu|"
            r"hardware|camera|wearable|headphone\w*|earbud\w*)\b|স্মার্টফোন|মোবাইল ফোন|ল্যাপটপ|"
            r"কম্পিউটার|ট্যাবলেট|স্মার্টওয়াচ|স্মার্টওয়াচ|গ্যাজেট|ডিভাইস|প্রসেসর|চিপসেট|"
            r"ক্যামেরা|হেডফোন|ইয়ারবাড|ইয়ারবাড", re.I
        )),
        ("Software & Apps", re.compile(
            r"\b(?:software|app(?:lication)?s?|android|ios|windows|operating system|browser|"
            r"platform|app store|website|web app|cloud service|social media|developer|programming|"
            r"coding|software update|app update|release)\b|সফটওয়্যার|সফটওয়্যার|অ্যাপ|অ্যাপ্লিকেশন|"
            r"অ্যান্ড্রয়েড|অ্যান্ড্রয়েড|আইওএস|উইন্ডোজ|ব্রাউজার|প্ল্যাটফর্ম|ওয়েবসাইট|ওয়েবসাইট|"
            r"ডেভেলপার|প্রোগ্রামিং|কোডিং|আপডেট", re.I
        )),
        ("Cybersecurity", re.compile(
            r"\b(?:cyber ?security|cyber ?attack|hacker\w*|hacking|data breach|breach|ransomware|"
            r"malware|phishing|vulnerabilit\w*|exploit\w*|spyware|data leak|security flaw|"
            r"privacy|identity theft|zero.day)\b|সাইবার নিরাপত্তা|সাইবার হামলা|হ্যাকার|হ্যাকিং|"
            r"তথ্য ফাঁস|ডেটা ফাঁস|ম্যালওয়্যার|ম্যালওয়্যার|ফিশিং|নিরাপত্তা ত্রুটি|গোপনীয়তা|গোপনীয়তা", re.I
        )),
    ],
}


def classify_subcategory(item):
    """Classify a story into one precise subcategory; leave ambiguous stories unclassified."""
    category = str(item.get("category") or "").strip()
    rules = SUBCATEGORY_RULES.get(category)
    if not rules:
        return DEFAULT_SUBCATEGORY
    title = clean(str(item.get("previewTitle") or item.get("title") or ""))
    summary = clean(str(item.get("previewSummary") or item.get("summary") or item.get("description") or ""))
    ranked = []
    for label, pattern in rules:
        title_score = sum(1 for _ in pattern.finditer(title)) * 3
        summary_score = sum(1 for _ in pattern.finditer(summary))
        score = title_score + summary_score
        if score:
            ranked.append((score, label))
    if not ranked:
        return DEFAULT_SUBCATEGORY
    highest = max(score for score, _label in ranked)
    winners = [label for score, label in ranked if score == highest]
    return winners[0] if len(winners) == 1 else DEFAULT_SUBCATEGORY



def key_for(item):
    """Deduplicate identical headlines across publishers, including RSS publisher suffixes."""
    title = str(item.get("title") or "").strip()
    source = str(item.get("source") or "").strip()
    if source:
        for separator in (" - ", " – ", " — ", " | "):
            suffix = separator + source
            if title.lower().endswith(suffix.lower()):
                title = title[:-len(suffix)]
                break
    return re.sub(r"[^\w]+", " ", title.lower()).strip()


def merge_source_evidence(item, source):
    """Keep unique publisher groups for independent corroboration."""
    name = clean(source)
    lower = name.lower()
    if "bbc" in lower:
        name = "BBC"
    elif "daily star" in lower:
        name = "The Daily Star"
    elif "prothom alo" in lower or "প্রথম আলো" in name:
        name = "Prothom Alo"
    elif "jago news" in lower:
        name = "Jago News 24"
    elif "bangladesh sangbad sangstha" in lower or lower == "bss":
        name = "BSS"
    elif "united news of bangladesh" in lower or lower == "unb":
        name = "UNB"
    elif "business standard" in lower or lower == "tbs":
        name = "The Business Standard"
    elif "associated press" in lower or lower == "ap news":
        name = "AP"
    elif "agence france" in lower or lower == "afp":
        name = "AFP"
    ignored = {"", "google news", "original publisher", "unknown source"}
    sources = list(item.get("sourceEvidence") or [])
    if name and name.lower() not in ignored and name.lower() not in {x.lower() for x in sources}:
        sources.append(name[:120])
    item["sourceEvidence"] = sources[:12]
    item["corroborationCount"] = len(item["sourceEvidence"])
    return item


def merge_duplicate_source(existing, source, *, country=None, category=None, is_breaking=None, summary=None):
    """Merge source evidence and retain the summary that established a breaking signal."""
    merge_source_evidence(existing, source)
    was_breaking = bool(existing.get("isBreaking"))
    if is_breaking is not None:
        existing["isBreaking"] = bool(was_breaking or is_breaking)
        if is_breaking and not was_breaking and summary:
            existing["summary"] = str(summary)[:420]
    is_global = country != "BD" if country is not None else category != "Bangladesh"
    if is_global:
        existing["alertScope"] = "global"
    return existing


def read_previous_weather():
    """Load cached weather cards so preview metadata can be reused across RSS refreshes."""
    try:
        with open(OUTPUT, "r", encoding="utf-8") as file:
            payload = json.load(file)
        weather = payload.get("weatherItems", []) if isinstance(payload, dict) else []
        return [item for item in weather if isinstance(item, dict) and item.get("title")]
    except (OSError, json.JSONDecodeError, TypeError):
        return []


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
            story_text = str(item.get("title") or "") + " " + str(item.get("summary") or item.get("previewSummary") or "")
            if not BREAKING_EVENT_RE.search(story_text) or BREAKING_FOLLOWUP_RE.search(story_text):
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


def within_feed_retention(item, now=None):
    """Keep dated stories from today and the previous 89 Bangladesh calendar days."""
    if not isinstance(item, dict):
        return False
    stamp = item.get("publishedAt")
    try:
        parsed = datetime.fromisoformat(str(stamp).replace("Z", "+00:00")) if stamp else None
        if parsed is None:
            return False
        if parsed.tzinfo is None:
            parsed = parsed.replace(tzinfo=timezone.utc)
        parsed_utc = parsed.astimezone(timezone.utc)
        current = now or datetime.now(timezone.utc)
        if current.tzinfo is None:
            current = current.replace(tzinfo=timezone.utc)
        age = current.astimezone(timezone.utc) - parsed_utc
        if age < timedelta(minutes=-5):
            return False
        today_bd = current.astimezone(BANGLADESH_TZ).date()
        published_bd = parsed_utc.astimezone(BANGLADESH_TZ).date()
        oldest_kept = today_bd - timedelta(days=FEED_RETENTION_DAYS - 1)
        return oldest_kept <= published_bd <= today_bd
    except (ValueError, TypeError, AttributeError, OverflowError):
        return False


def annotate_seen_items(items, previous, now=None):
    """Persist first discovery time and mark only newly discovered stories as this run's batch."""
    current = now or datetime.now(timezone.utc)
    if current.tzinfo is None:
        current = current.replace(tzinfo=timezone.utc)
    now_iso = current.astimezone(timezone.utc).isoformat()
    previous_by_key = {key_for(item): item for item in previous if key_for(item)}
    for item in items:
        old = previous_by_key.get(key_for(item))
        if old:
            item["firstSeenAt"] = old.get("firstSeenAt") or old.get("publishedAt") or now_iso
            item["latestBatchAt"] = old.get("latestBatchAt") or ""
        else:
            item["firstSeenAt"] = now_iso
            item["latestBatchAt"] = now_iso
    return items


def read_previous_snapshot():
    """Read the raw prior feed so removals include stories pruned by the 90-day retention rule."""
    try:
        with open(OUTPUT, "r", encoding="utf-8") as file:
            payload = json.load(file)
        if not isinstance(payload, dict) or not isinstance(payload.get("items"), list):
            return [], False
        return [dict(item) for item in payload["items"] if isinstance(item, dict)], True
    except (OSError, json.JSONDecodeError, TypeError):
        return [], False


def retained_previous_items(items, now=None):
    retained = []
    for raw_item in items:
        item = dict(raw_item)
        if (not item.get("title")
                or not str(item.get("link") or "").startswith("https://")
                or not within_feed_retention(item, now)):
            continue
        # Re-evaluate retained headlines instead of clearing the flag. A story can
        # remain in the feed after it falls out of a publisher's short RSS window.
        item["subCategory"] = classify_subcategory(item)
        item["isBreaking"] = is_recent_breaking(
            item.get("title", ""),
            item.get("publishedAt"),
            "retained-feed",
            item.get("source") or item.get("publisherName", ""),
            item.get("summary") or item.get("previewSummary", ""),
            now=now,
        )
        retained.append(item)
    return retained


def read_previous():
    items, _baseline_available = read_previous_snapshot()
    return retained_previous_items(items)

def is_weather_disaster_story(title, summary="", published=None, now=None):
    """Only accept weather/disaster stories with a credible, recent publication date."""
    if not WEATHER_DISASTER_RE.search((title or "") + " " + (summary or "")) or not published:
        return False
    try:
        stamp = datetime.fromisoformat(str(published).replace("Z", "+00:00"))
        if stamp.tzinfo is None:
            stamp = stamp.replace(tzinfo=timezone.utc)
        current = now or datetime.now(timezone.utc)
        age = current - stamp.astimezone(timezone.utc)
        return timedelta(minutes=-5) <= age <= timedelta(days=7)
    except (ValueError, TypeError, AttributeError):
        return False

def is_recent_weather_alert(title, summary="", published=None, now=None):
    """Allow current severe weather/disaster warnings to stay eligible for up to three hours."""
    text = (title or "") + " " + (summary or "")
    if not WEATHER_DISASTER_RE.search(text) or not WEATHER_SEVERITY_RE.search(text) or not published:
        return False
    try:
        stamp = datetime.fromisoformat(str(published).replace("Z", "+00:00"))
        if stamp.tzinfo is None:
            stamp = stamp.replace(tzinfo=timezone.utc)
        current = now or datetime.now(timezone.utc)
        age = current - stamp.astimezone(timezone.utc)
        return timedelta(minutes=-5) <= age <= timedelta(minutes=180)
    except (ValueError, TypeError, AttributeError):
        return False


def calculate_feed_changes(current_items, previous_items, previous_raw_items, baseline_available):
    """Compare headline identities and content without counting updates as additions."""
    previous_by_key = {key_for(item): item for item in previous_items if key_for(item)}
    previous_raw_keys = {key_for(item) for item in previous_raw_items if key_for(item)}
    current_keys = {key_for(item) for item in current_items if key_for(item)}
    meaningful_fields = ("title", "link", "source", "publishedAt", "category", "subCategory", "summary", "image",
                         "publisherUrl", "publisherName", "previewTitle", "previewSummary",
                         "previewImage", "iframeAllowed")
    added = sum(1 for item in current_items if key_for(item) not in previous_by_key)
    updated = sum(
        1 for item in current_items
        if key_for(item) in previous_by_key and any(
            item.get(field) != previous_by_key[key_for(item)].get(field) for field in meaningful_fields
        )
    )
    unchanged = max(0, len(current_items) - added - updated)
    return {
        "added": added,
        "updated": updated,
        "unchanged": unchanged,
        "removed": len(previous_raw_keys - current_keys) if baseline_available else None,
        "previous": len(previous_raw_keys) if baseline_available else None,
        "net_change": len(current_keys) - len(previous_raw_keys) if baseline_available else None,
        "baseline_available": bool(baseline_available),
    }


def feed_content_metrics(items, weather_items=None, now=None):
    """Count the same time windows and image URL fields used by the live News page."""
    current = now or datetime.now(timezone.utc)
    if current.tzinfo is None:
        current = current.replace(tzinfo=timezone.utc)
    preview_fields = ("previewScreenshot", "previewImage", "image", "imageUrl", "thumbnail", "thumbnailUrl", "enclosureUrl")
    latest_24h = archive = latest_tag_15m = image_preview_urls = bd_slider_candidates = 0
    for item in items:
        try:
            stamp = datetime.fromisoformat(str(item.get("publishedAt") or "").replace("Z", "+00:00"))
            if stamp.tzinfo is None:
                stamp = stamp.replace(tzinfo=timezone.utc)
            age_seconds = (current.astimezone(timezone.utc) - stamp.astimezone(timezone.utc)).total_seconds()
        except (ValueError, TypeError, AttributeError, OverflowError):
            continue
        is_recent = -5 * 60 <= age_seconds < 24 * 60 * 60
        is_latest_tag = -5 * 60 <= age_seconds <= 15 * 60
        has_preview_url = any(str(item.get(field) or "").startswith("https://") for field in preview_fields)
        is_slider_age = -5 * 60 <= age_seconds <= 60 * 60
        if is_recent:
            latest_24h += 1
        elif age_seconds >= 24 * 60 * 60:
            archive += 1
        if is_latest_tag:
            latest_tag_15m += 1
        if is_slider_age and item.get("category") == "Bangladesh" and has_preview_url:
            bd_slider_candidates += 1
        if has_preview_url:
            image_preview_urls += 1
    weather_items = weather_items if isinstance(weather_items, list) else []
    weather_cards_with_preview = sum(
        1 for item in weather_items
        if isinstance(item, dict) and any(str(item.get(field) or "").startswith("https://") for field in preview_fields)
    )
    return {
        "latest_24h": latest_24h,
        "archive": archive,
        "latest_tag_15m": latest_tag_15m,
        "image_preview_urls": image_preview_urls,
        "bd_slider_preview_candidates": bd_slider_candidates,
        "bd_slider_window_minutes": 60,
        "bd_slider_media_required": True,
        "bd_slider_image_required": True,
        "weather_cards": len(weather_items),
        "weather_cards_with_preview": weather_cards_with_preview,
    }


def validate_feed_payload(payload):
    """Validate the generated main feed before it can be committed."""
    issues = []
    if not isinstance(payload, dict):
        return {"valid": False, "invalid": 1, "duplicates": 0, "issues": ["root is not an object"]}
    items = payload.get("items")
    if not isinstance(items, list):
        return {"valid": False, "invalid": 1, "duplicates": 0, "issues": ["items is not an array"]}
    seen = set()
    invalid = 0
    duplicates = 0
    allowed_categories = {"Bangladesh", "World", "Technology"}
    allowed_subcategories = {
        category: set(SUBCATEGORY_NAMES.get(category, ())) | {DEFAULT_SUBCATEGORY}
        for category in allowed_categories
    }
    for item in items:
        if not isinstance(item, dict):
            invalid += 1
            continue
        key = key_for(item)
        if (not item.get("title") or not str(item.get("link") or "").startswith("https://")
                or not item.get("publishedAt") or item.get("category") not in allowed_categories
                or item.get("subCategory") not in allowed_subcategories.get(item.get("category"), set())):
            invalid += 1
        if not key or key in seen:
            duplicates += 1
        elif key:
            seen.add(key)
    if not isinstance(payload.get("weatherItems"), list):
        issues.append("weatherItems is not an array")
    if invalid:
        issues.append("invalid main-feed items: " + str(invalid))
    if duplicates:
        issues.append("duplicate or empty headline keys: " + str(duplicates))
    return {"valid": not issues and invalid == 0 and duplicates == 0, "invalid": invalid, "duplicates": duplicates, "issues": issues}


def format_signed(value):
    if value is None:
        return "not_available"
    return ("+" if value > 0 else "") + str(value)


def main():
    previous_raw, baseline_available = read_previous_snapshot()
    previous = retained_previous_items(previous_raw)
    previous_weather = read_previous_weather()
    breaking_history = read_breaking_history()
    collected, seen = [], set()
    collected_by_key = {}
    breaking_url_budget = {"remaining": 3}
    weather_url_budget = {"remaining": 3}
    successful_feeds = 0
    feed_failures = []

    # Direct publisher RSS feeds complement Google News and provide original article links.
    for source, feed_url in DIRECT_FEEDS:
        try:
            request = urllib.request.Request(feed_url, headers=HEADERS)
            with urlopen_with_retry(request, timeout=10) as response:
                root = parse_feed_xml(response.read())
            nodes = feed_items(root)
            for node in nodes:
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
                    "isBreaking": is_recent_breaking(title, published, "direct-rss", source, summary),
                    "summary": summary, "image": image_for(node), "videoUrl": video_for(node),
                    "publisherUrl": link, "publisherName": source,
                    "previewTitle": title, "previewSummary": summary,
                    "previewImage": image_for(node),
                    "previewCheckedAt": datetime.now(timezone.utc).isoformat(),
                    "sourceEvidence": [],
                }
                merge_source_evidence(item, source)
                key = key_for(item)
                if not key:
                    continue
                if key in seen:
                    existing = collected_by_key.get(key)
                    if existing:
                        merge_duplicate_source(existing, source, category=item["category"], is_breaking=item.get("isBreaking"), summary=item.get("summary"))
                    continue
                seen.add(key)
                collected_by_key[key] = item
                collected.append(item)
            successful_feeds += 1
        except Exception as exc:
            feed_failures.append(f"{source}: {type(exc).__name__}")
            print("Direct RSS error for", source, ":", type(exc).__name__, str(exc)[:180])

    for label, query, language, country, edition in QUERIES:
        params = urllib.parse.urlencode({"q": query, "hl": language, "gl": country, "ceid": edition})
        request = urllib.request.Request("https://news.google.com/rss/search?" + params, headers=HEADERS)
        try:
            with urllib.request.urlopen(request, timeout=20) as response:
                root = ET.fromstring(response.read())
            for node in root.findall("./channel/item"):
                title = clean(node.findtext("title"))
                link = clean(node.findtext("link"))
                source_node = node.find("source")
                source = clean(source_node.text if source_node is not None else "") or "Google News"
                published = parse_date(node.findtext("pubDate"))
                if not title or not link.startswith("https://"):
                    continue
                summary = clean(node.findtext("description"))[:420]
                item = {
                    "title": title, "link": link, "source": source,
                    "publishedAt": published, "category": label,
                    "isBreaking": is_recent_breaking(title, published, query, summary=summary),
                    "summary": summary,
                    "image": image_for(node), "previewImage": image_for(node),
                    "videoUrl": video_for(node), "publisherUrl": "", "publisherName": source,
                    "sourceEvidence": [],
                }
                merge_source_evidence(item, source)
                key = key_for(item)
                if not key:
                    continue
                if key in seen:
                    existing = collected_by_key.get(key)
                    if existing:
                        merge_duplicate_source(existing, source, country=country, is_breaking=item.get("isBreaking"), summary=item.get("summary"))
                    continue
                item["publisherUrl"] = resolve_alert_publisher_url(item, breaking_url_budget)
                seen.add(key)
                collected_by_key[key] = item
                collected.append(item)
            successful_feeds += 1
        except Exception as exc:
            feed_failures.append(f"Google News {label} ({query}): {type(exc).__name__}")
            print("Feed error for", label, repr(query), ":", exc)


    # Keep a separate, date-checked stream for the desktop weather/disaster cards.
    weather_collected, weather_seen = [], set()
    weather_by_key = {}
    for query, language, country, edition in WEATHER_QUERIES:
        params = urllib.parse.urlencode({"q": query, "hl": language, "gl": country, "ceid": edition})
        request = urllib.request.Request("https://news.google.com/rss/search?" + params, headers=HEADERS)
        try:
            with urllib.request.urlopen(request, timeout=20) as response:
                root = parse_feed_xml(response.read())
            for node in feed_items(root):
                title = clean(child_text(node, "title"))
                link = clean(child_text(node, "link"))
                summary = clean(child_text(node, "description", "summary", "content"))[:420]
                published = parse_date(child_text(node, "pubDate", "published", "updated", "date"))
                source_node = child_element(node, "source")
                source = clean((source_node.text or "") if source_node is not None else "") or "Original publisher"
                if not title or not link.startswith("https://") or not is_weather_disaster_story(title, summary, published):
                    continue
                item = {
                    "title": title, "link": link, "source": source,
                    "publishedAt": published, "summary": summary,
                    "publisherUrl": "", "publisherName": source,
                    "previewTitle": title, "previewSummary": summary,
                    "image": image_for(node), "previewImage": image_for(node),
                    "videoUrl": video_for(node),
                    "category": "Weather & Disasters",
                    "alertScope": "global" if country != "BD" else "bangladesh_candidate",
                    "isBreaking": is_recent_breaking(title, published, query, source, summary) or is_recent_weather_alert(title, summary, published),
                    "sourceEvidence": [],
                }
                merge_source_evidence(item, source)
                key = key_for(item)
                if not key:
                    continue
                if key in weather_seen:
                    existing = weather_by_key.get(key)
                    if existing:
                        merge_source_evidence(existing, source)
                        was_breaking = bool(existing.get("isBreaking"))
                        if item.get("isBreaking") and not was_breaking and item.get("summary"):
                            existing["summary"] = str(item["summary"])[:420]
                        existing["isBreaking"] = bool(was_breaking or item.get("isBreaking"))
                    continue
                item["publisherUrl"] = resolve_alert_publisher_url(item, weather_url_budget)
                weather_seen.add(key)
                weather_by_key[key] = item
                weather_collected.append(item)
            successful_feeds += 1
        except Exception as exc:
            feed_failures.append(f"Weather/disaster ({query}): {type(exc).__name__}")
            print("Weather/disaster feed error for", repr(query), ":", type(exc).__name__, str(exc)[:180])
    weather_collected.sort(key=lambda x: x.get("publishedAt") or "", reverse=True)

    # Reuse existing weather-card previews, then fetch Open Graph images for new stories.
    old_weather_metadata = {key_for(item): item for item in previous_weather}
    for item in weather_collected:
        cached = old_weather_metadata.get(key_for(item), {})
        for field in ("publisherUrl", "publisherName", "previewTitle", "previewSummary",
                      "previewImage", "previewScreenshot", "previewCheckedAt", "videoUrl"):
            if cached.get(field) not in (None, ""):
                item[field] = cached[field]
    weather_preview_candidates = weather_collected[:12]
    weather_enriched = 0
    weather_cached = 0
    weather_unavailable = 0
    weather_rss_fallback = 0
    for item in weather_preview_candidates:
        cached_image = weather_preview_image(item)
        if cached_image and item.get("previewCheckedAt"):
            item["previewImage"] = cached_image
            weather_cached += 1
            continue
        metadata = publisher_metadata(item.get("link", ""))
        if metadata:
            item.update(metadata)
            weather_enriched += 1
        else:
            weather_unavailable += 1
        item.setdefault("publisherName", item.get("source", "Original publisher"))
        item.setdefault("previewTitle", item.get("title", ""))
        item.setdefault("previewSummary", item.get("summary", ""))
        # Empty metadata fields must not suppress a usable RSS image fallback.
        fallback_image = weather_preview_image(item)
        if fallback_image:
            if not item.get("previewImage"):
                weather_rss_fallback += 1
            item["previewImage"] = fallback_image
        item["previewCheckedAt"] = datetime.now(timezone.utc).isoformat()
    weather_items = weather_collected[:12]
    weather_with_preview = sum(1 for item in weather_items if item.get("previewImage"))
    print("Weather/disaster previews: candidates:", len(weather_preview_candidates),
          "metadata_fetched:", weather_enriched, "cached/reused:", weather_cached,
          "publisher_unavailable:", weather_unavailable, "RSS_image_fallback:", weather_rss_fallback,
          "with_preview_total:", weather_with_preview)

    # Reject undated or older-than-seven-day headlines before preview enrichment.
    collected = [item for item in collected if within_feed_retention(item)]

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
    metadata_attempts = 0
    metadata_unavailable = 0
    metadata_cached = 0
    for item in preview_candidates:
        if item.get("previewTitle") and item.get("previewCheckedAt"):
            metadata_cached += 1
            continue
        source_link = item.get("link", "")
        resolved_link = resolve_google_news_url(source_link) if urlparse(source_link).hostname and urlparse(source_link).hostname.endswith("news.google.com") else source_link
        if resolved_link and resolved_link.startswith("https://"):
            item["publisherUrl"] = resolved_link
            resolved_count += int(resolved_link != source_link)
            metadata_attempts += 1
            metadata = publisher_metadata(resolved_link)
        else:
            metadata_attempts += 1
            metadata = {}
        if metadata:
            item.update(metadata)
            enriched += 1
        else:
            metadata_unavailable += 1
            # Keep the direct publisher link and RSS summary when publisher pages block bots.
            item.setdefault("publisherName", item.get("source", "Original publisher"))
            item.setdefault("previewTitle", item.get("title", ""))
            item.setdefault("previewSummary", item.get("summary", ""))
            item.setdefault("previewImage", item.get("image", ""))
            item["previewCheckedAt"] = datetime.now(timezone.utc).isoformat()
    print("Publisher preview checks: attempted:", metadata_attempts, "metadata fetched:", enriched,
          "unavailable:", metadata_unavailable, "cached/reused:", metadata_cached,
          "Google News URLs resolved:", resolved_count)

    # Merge recent known-good items behind fresh results so a temporary RSS outage
    # doesn't shrink the feed or erase useful headlines.
    merged = []
    for item in collected + previous:
        key = key_for(item)
        if key in seen and item not in collected:
            continue
        if key not in seen:
            seen.add(key)
        # Only dated stories inside the configured 90-day retention window reach the public feed.
        if within_feed_retention(item):
            merged.append(item)
    # An empty but fresh feed is safer than leaving expired headlines visible.
    # Keep every unique story inside the configured retention window.
    selected = []
    selected_keys = set()
    for item in merged:
        category = item.get("category", "World")
        if category not in ("Bangladesh", "World", "Technology"):
            continue
        key = key_for(item)
        if not key or key in selected_keys:
            continue
        item["subCategory"] = classify_subcategory(item)
        selected_keys.add(key)
        selected.append(item)
    selected.sort(key=lambda x: x.get("publishedAt") or "", reverse=True)
    now_iso = datetime.now(timezone.utc).isoformat()
    annotate_seen_items(selected, previous, datetime.fromisoformat(now_iso))
    change_metrics = calculate_feed_changes(selected, previous, previous_raw, baseline_available)
    added_count = change_metrics["added"]
    updated_count = change_metrics["updated"]
    unchanged_count = change_metrics["unchanged"]
    removed_count = change_metrics["removed"]
    previous_count = change_metrics["previous"]
    net_change = change_metrics["net_change"]
    bd_count = sum(1 for x in selected if x.get("category") == "Bangladesh")
    if successful_feeds == 0:
        print("WARNING: all RSS requests failed; only retained headlines are available.")
    if len(selected) < 100 or bd_count < 50:
        print("WARNING: target not met by currently available sources. Total:", len(selected), "Bangladesh:", bd_count)
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
    payload = {"updatedAt": now_iso, "latestBatchAt": now_iso, "items": selected, "weatherItems": weather_items, "breakingHistory": history[:500]}
    with open(OUTPUT, "w", encoding="utf-8") as file:
        json.dump(payload, file, ensure_ascii=False, indent=2)
        file.write("\n")

    with open(OUTPUT, "r", encoding="utf-8") as file:
        written_payload = json.load(file)
    validation = validate_feed_payload(written_payload)
    if not validation["valid"]:
        print("Feed validation: FAIL; items:", len(selected), "; invalid:", validation["invalid"],
              "; duplicates:", validation["duplicates"])
        raise ValueError("Generated news feed failed validation: " + "; ".join(validation["issues"]))

    content_metrics = feed_content_metrics(selected, weather_items)
    category_counts = {
        "Bangladesh": sum(1 for item in selected if item.get("category") == "Bangladesh"),
        "World": sum(1 for item in selected if item.get("category") == "World"),
        "Technology": sum(1 for item in selected if item.get("category") == "Technology"),
    }
    subcategory_counts = {
        category: {name: sum(1 for item in selected if item.get("category") == category and item.get("subCategory") == name)
                   for name in (*SUBCATEGORY_NAMES.get(category, ()), DEFAULT_SUBCATEGORY)}
        for category in ("Bangladesh", "World", "Technology")
    }
    print("Wrote", len(selected), "headlines; Bangladesh:", bd_count, "from", successful_feeds, "successful RSS queries.")
    print("Item changes: added:", added_count, "updated:", updated_count, "unchanged:", unchanged_count,
          "removed:", removed_count if removed_count is not None else "not_available",
          "net:", format_signed(net_change), "baseline:", "available" if baseline_available else "establishing",
          "previous:", previous_count if previous_count is not None else "not_available")
    print("Category breakdown: Bangladesh:", category_counts["Bangladesh"], "World:", category_counts["World"],
          "Technology:", category_counts["Technology"])
    for category, counts in subcategory_counts.items():
        print("Subcategory breakdown:", category, "; ".join(f"{name}: {count}" for name, count in counts.items()))
    print("Feed breakdown: latest_24h:", content_metrics["latest_24h"], "archive:", content_metrics["archive"],
          "latest_tag_15m:", content_metrics["latest_tag_15m"], "preview_image_urls:", content_metrics["image_preview_urls"],
          "bd_slider_preview_candidates:", content_metrics["bd_slider_preview_candidates"],
          "weather_cards:", content_metrics["weather_cards"],
          "weather_cards_with_preview:", content_metrics["weather_cards_with_preview"])
    print("Feed validation: PASS; items:", len(selected), "; invalid:", validation["invalid"],
          "; duplicates:", validation["duplicates"])
    attempted_feeds = len(DIRECT_FEEDS) + len(QUERIES) + len(WEATHER_QUERIES)
    print("Feed diagnostics:", successful_feeds, "/", attempted_feeds, "successful; failures:", " | ".join(feed_failures[:20]) or "none")

if __name__ == "__main__":
    main()
