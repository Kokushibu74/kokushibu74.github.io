#!/usr/bin/env python3
"""Build an alert-only Bangladesh feed from independent publisher RSS sources.

This collector writes only news-alert-feed.json. It never modifies
scripts/update_news.py, the public News Page feed, or its archive.
"""
import concurrent.futures
import hashlib
import html
import json
import re
import sys
import time
import urllib.error
import urllib.request
import xml.etree.ElementTree as ET
from datetime import datetime, timedelta, timezone
from email.utils import parsedate_to_datetime
from pathlib import Path
from urllib.parse import urlparse, urlencode

ROOT = Path(__file__).resolve().parents[1]
OUTPUT = ROOT / "news-alert-feed.json"
USER_AGENT = "KOKUSHIBU74-NewsAlertCollector/1.0 (+https://kokushibu74.github.io)"
TIMEOUT = 9
MAX_AGE_HOURS = 24
MAX_ITEMS = 180
_NEWS_HELPERS = None

# Endpoints are candidates, not assumed healthy. A source is active only when
# its endpoint returns parseable RSS/Atom and its articles link to that publisher.
SOURCES = [
    ("The Daily Star", "https://www.thedailystar.net/frontpage/rss.xml", "thedailystar.net"),
    ("Prothom Alo", "https://www.prothomalo.com/feed/", "prothomalo.com"),
    ("Jago News 24", "https://www.jagonews24.com/rss/rss.xml", "jagonews24.com"),
    ("bdnews24.com", "https://bdnews24.com/?widgetName=rssfeed&widgetId=1150&getXmlFeed=true", "bdnews24.com"),
    ("Banglanews24", "https://www.banglanews24.com/rss/rss.xml", "banglanews24.com"),
    ("Jugantor", "https://www.jugantor.com/feed/rss.xml", "jugantor.com"),
    ("Kaler Kantho", "https://www.kalerkantho.com/rss.xml", "kalerkantho.com"),
    ("Bangla Tribune", "https://www.banglatribune.com/feed/", "banglatribune.com"),
    ("Dhaka Tribune", "https://www.dhakatribune.com/feed", "dhakatribune.com"),
    ("The Business Standard", "https://www.tbsnews.net/rss.xml", "tbsnews.net"),
    ("The Financial Express", "https://thefinancialexpress.com.bd/rss", "thefinancialexpress.com.bd"),
    ("New Age", "https://www.newagebd.net/rss", "newagebd.net"),
    ("Daily Observer", "https://observerbd.com/rss.php", "observerbd.com"),
    ("BSS", "https://www.bssnews.net/feed", "bssnews.net"),
    ("UNB", "https://unb.com.bd/rss", "unb.com.bd"),
    ("Risingbd", "https://www.risingbd.com/rss/rss.xml", "risingbd.com"),
    ("Samakal", "https://samakal.com/rss.xml", "samakal.com"),
    ("Dhaka Post", "https://www.dhakapost.com/rss", "dhakapost.com"),
    ("Bangladesh Pratidin", "https://www.bd-pratidin.com/rss.xml", "bd-pratidin.com"),
    ("Daily Sun", "https://www.daily-sun.com/rss.xml", "daily-sun.com"),
    ("Somoy News", "https://www.somoynews.tv/rss", "somoynews.tv"),
    ("Channel 24", "https://www.channel24bd.tv/rss", "channel24bd.tv"),
    ("Jamuna TV", "https://jamuna.tv/feed", "jamuna.tv"),
    ("Ekattor TV", "https://ekattor.tv/feed", "ekattor.tv"),
    ("Daily Inqilab", "https://dailyinqilab.com/rss.xml", "dailyinqilab.com"),
    ("Barta24", "https://barta24.com/rss.xml", "barta24.com"),
    ("Bhorer Kagoj", "https://www.bhorerkagoj.com/feed/", "bhorerkagoj.com"),
    ("Bonik Barta", "https://bonikbarta.com/rss.xml", "bonikbarta.com"),
    ("Desh Rupantor", "https://www.deshrupantor.com/rss", "deshrupantor.com"),
    ("The Daily Ittefaq", "https://www.ittefaq.com.bd/rss.xml", "ittefaq.com.bd"),
    ("Ajker Patrika", "https://www.ajkerpatrika.com/rss", "ajkerpatrika.com"),
    ("Manab Zamin", "https://mzamin.com/rss.xml", "mzamin.com"),
    ("Dainik Amader Shomoy", "https://www.dainikamadershomoy.com/rss", "dainikamadershomoy.com"),
    ("Daily Naya Diganta", "https://www.dailynayadiganta.com/rss", "dailynayadiganta.com"),
    ("Daily Janakantha", "https://www.dailyjanakantha.com/rss", "dailyjanakantha.com"),
    ("Dainik Azadi", "https://dainikazadi.net/feed", "dainikazadi.net"),
    ("Daily Sangbad", "https://sangbad.net.bd/feed/", "sangbad.net.bd"),
    ("Dhaka Courier", "https://dhakacourier.com.bd/feed", "dhakacourier.com.bd"),
    ("The Business Post", "https://businesspostbd.com/feed", "businesspostbd.com"),
    ("BD24Live", "https://www.bd24live.com/feed", "bd24live.com"),
    ("BBC News বাংলা", "https://feeds.bbci.co.uk/bengali/rss.xml", "bbc.co.uk"),
]

BANGLADESH_RE = re.compile(
    r"(বাংলাদেশ|ঢাকা|চট্টগ্রাম|চাটগাঁ|সিলেট|খুলনা|রাজশাহী|বরিশাল|রংপুর|ময়মনসিংহ|ময়মনসিংহ|"
    r"কক্সবাজার|কুড়িগ্রাম|কুড়িগ্রাম|সুনামগঞ্জ|সাতক্ষীরা|নারায়ণগঞ্জ|নারায়ণগঞ্জ|গাজীপুর|কুমিল্লা|"
    r"ফেনী|নোয়াখালী|নোয়াখালী|বগুড়া|বগুড়া|পাবনা|কুষ্টিয়া|কুষ্টিয়া|যশোর|টাঙ্গাইল|জামালপুর|"
    r"দিনাজপুর|বান্দরবান|রাঙামাটি|খাগড়াছড়ি|ভোলা|পটুয়াখালী|বরগুনা|চাঁদপুর|ব্রাহ্মণবাড়িয়া|"
    r"লক্ষ্মীপুর|সিরাজগঞ্জ|গাইবান্ধা|নীলফামারী|লালমনিরহাট|পঞ্চগড়|জয়পুরহাট|নওগাঁ|নাটোর|"
    r"চাঁপাইনবাবগঞ্জ|মাগুরা|নড়াইল|চুয়াডাঙ্গা|মেহেরপুর|বাগেরহাট|পিরোজপুর|ঝালকাঠি|মাদারীপুর|"
    r"গোপালগঞ্জ|শরীয়তপুর|মুন্সীগঞ্জ|মানিকগঞ্জ|নরসিংদী|কিশোরগঞ্জ|নেত্রকোণা|নেত্রকোনা|শেরপুর|"
    r"হবিগঞ্জ|মৌলভীবাজার|ঠাকুরগাঁও|bangladesh|dhaka|chattogram|chittagong|sylhet|khulna|"
    r"rajshahi|barishal|rangpur|mymensingh|cox'?s bazar|narayanganj|gazipur|cumilla|comilla|"
    r"feni|noakhali|bogura|bogra|pabna|kushtia|jashore|jessore|tangail|jamalpur|dinajpur|"
    r"bandarban|rangamati|khagrachhari|bhola|patuakhali|barguna|chandpur|brahmanbaria|"
    r"lakshmipur|sirajganj|gaibandha|nilphamari|lalmonirhat|panchagarh|joypurhat|naogaon|"
    r"natore|chapainawabganj|magura|narail|chuadanga|meherpur|bagerhat|pirojpur|jhalokathi|"
    r"madaripur|gopalganj|shariatpur|munshiganj|manikganj|narsingdi|kishoreganj|netrokona|"
    r"sherpur|habiganj|moulvibazar|thakurgaon)",
    re.I,
)
EVENT_RE = re.compile(
    r"(ককটেল|বোমা|বিস্ফোরণ|বিস্ফোরক|আগুন|অগ্নিকাণ্ড|অগ্নিসংযোগ|বাসে আগুন|"
    r"সংঘর্ষ|গুলিবর্ষণ|গুলি চালনা|গুলিতে|সশস্ত্র হামলা|হামলা|"
    r"দুর্ঘটনা|নৌকাডুবি|লঞ্চডুবি|ট্রেন দুর্ঘটনা|ট্রেন লাইনচ্যুত|ভবনধস|ভবন ধস|"
    r"ধস|বন্যা|ঘূর্ণিঝড়|ঘূর্ণিঝড়|জলোচ্ছ্বাস|ভূমিকম্প|পাহাড়ধস|পাহাড়ধস|"
    r"তাপপ্রবাহ|বজ্রপাত|অতিবৃষ্টি|ভারী বৃষ্টি|কালবৈশাখী|দাবানল|"
    r"cocktail|bomb|explosion|blast|fire|arson|bus catches fire|bus fire|"
    r"gunfire|shooting|clash|riot|armed attack|attack|accident|crash|collision|"
    r"derailment|capsiz|building collapse|collapse|flood|cyclone|storm surge|"
    r"earthquake|landslide|heat ?wave|lightning|heavy rain|wildfire|tornado|tsunami)",
    re.I,
)
WEATHER_RE = re.compile(
    r"(ঘূর্ণিঝড়|ঘূর্ণিঝড়|বন্যা|জলোচ্ছ্বাস|ভূমিকম্প|পাহাড়ধস|পাহাড়ধস|"
    r"তাপপ্রবাহ|বজ্রপাত|অতিবৃষ্টি|ভারী বৃষ্টি|কালবৈশাখী|দাবানল|"
    r"cyclone|flood|storm surge|earthquake|landslide|heat ?wave|lightning|"
    r"heavy rain|wildfire|tornado|tsunami)",
    re.I,
)
STATEMENT_RE = re.compile(r"(বিবৃতি|বিবৃতিতে|নিন্দা|প্রতিবাদ|সরকার ব্যর্থ|statement|press release|condemnation|condemns|denounces|government failed)", re.I)
INCIDENT_IN_TITLE_RE = re.compile(
    r"(ককটেল|বোমা|বিস্ফোরণ|আগুন|অগ্নিকাণ্ড|অগ্নিসংযোগ|সংঘর্ষ|গুলিবর্ষণ|গুলি|হামলা|ভাঙচুর|ভাংচুর|দুর্ঘটনা|বাস|ট্রেন|লঞ্চ|ধস|বন্যা|ঘূর্ণিঝড়|ঘূর্ণিঝড়|ভূমিকম্প|পাহাড়ধস|পাহাড়ধস|তাপপ্রবাহ|বজ্রপাত|অতিবৃষ্টি|cyclone|flood|earthquake|fire|explosion|blast|clash|shooting|accident|crash|arson)",
    re.I,
)
WEATHER_WARNING_RE = re.compile(
    r"(সতর্ক|বিপদ সংকেত|বিপদসীমা|সতর্কবার্তা|জরুরি|অতি ভারী|অত্যন্ত ভারী|"
    r"warning|alert|signal|severe|extreme|heavy|evacuat|landfall|danger level|"
    r"মৃত্যু|নিহত|ক্ষয়ক্ষতি|ক্ষয়ক্ষতি|ধ্বংস)",
    re.I,
)
FOLLOWUP_RE = re.compile(
    r"(রিমান্ডে|মামলা(?: দায়ের| করা| হয়েছে| হয়েছে)?|চার্জশিট|জিজ্ঞাসাবাদ|"
    r"তদন্ত চলছে|গ্রেপ্তার|গ্রেফতার|আটক|মামলার শুনানি|আদালতে হাজির|"
    r"বার্ষিকী|বছর আগে|বছর পরে|স্মরণে|পেছন ফিরে|পুরোনো ঘটনা|"
    r"remanded|arrested|trial|hearing|convicted|sentenced|case filed|"
    r"investigation into|investigation committee|probe committee|তদন্ত কমিটি|তদন্তে|anniversary|years? ago|years? later|retrospective|"
    r"from the archives|old case|follow[- ]?up)",
    re.I,
)

def clean(value):
    value = html.unescape(re.sub(r"<[^>]+>", " ", str(value or "")))
    return re.sub(r"\s+", " ", value).strip()

def local_name(tag):
    return str(tag).rsplit("}", 1)[-1].split(":")[-1].lower()

def child(node, *names):
    wanted = {name.lower() for name in names}
    return next((part for part in list(node) if local_name(part.tag) in wanted), None)

def child_text(node, *names):
    part = child(node, *names)
    if part is None:
        return ""
    if local_name(part.tag) == "link":
        return (part.attrib.get("href") or part.text or "").strip()
    return "".join(part.itertext()).strip()

def parse_published(value):
    if not value:
        return None
    try:
        try:
            parsed = parsedate_to_datetime(value)
        except (TypeError, ValueError, OverflowError):
            parsed = datetime.fromisoformat(str(value).replace("Z", "+00:00"))
        if parsed.tzinfo is None:
            parsed = parsed.replace(tzinfo=timezone.utc)
        return parsed.astimezone(timezone.utc)
    except (TypeError, ValueError, OverflowError):
        return None

def parse_feed(raw):
    root = ET.fromstring(raw)
    entries = [node for node in root.iter() if local_name(node.tag) in {"item", "entry"}]
    output = []
    for node in entries:
        title = clean(child_text(node, "title"))
        link = child_text(node, "link")
        if not link:
            link_node = child(node, "link")
            link = str((link_node.attrib.get("href") if link_node is not None else "") or "")
        summary = clean(child_text(node, "description", "summary", "encoded", "content"))
        published = parse_published(child_text(node, "pubDate", "published", "updated", "date"))
        source_node = child(node, "source")
        source_name = clean("".join(source_node.itertext())) if source_node is not None else ""
        source_url = str(source_node.attrib.get("url") or "") if source_node is not None else ""
        if title and link:
            output.append({
                "title": title[:300], "summary": summary[:900], "link": link,
                "published": published, "source_name": source_name[:120], "source_url": source_url[:500]
            })
    return output

def host_matches(url, domain):
    try:
        host = (urlparse(url).hostname or "").lower().rstrip(".")
        domain = domain.lower().rstrip(".")
        return bool(host) and (host == domain or host.endswith("." + domain))
    except ValueError:
        return False

def is_bangladesh_story(title, summary=""):
    return bool(BANGLADESH_RE.search(str(title or "") + " " + str(summary or "")))

def google_news_query_url(domain):
    query = urlencode({"q": "site:" + domain + " Bangladesh when:1d", "hl": "bn", "gl": "BD", "ceid": "BD:bn"})
    return "https://news.google.com/rss/search?" + query

def is_alert_candidate(title, summary="", published=None, now=None):
    text = str(title or "") + " " + str(summary or "")
    if not title or FOLLOWUP_RE.search(text) or not EVENT_RE.search(text):
        return False
    if STATEMENT_RE.search(str(title)) and not INCIDENT_IN_TITLE_RE.search(str(title)):
        return False
    if not is_bangladesh_story(title, summary):
        return False
    if WEATHER_RE.search(text) and not WEATHER_WARNING_RE.search(text):
        return False
    current = now or datetime.now(timezone.utc)
    if current.tzinfo is None:
        current = current.replace(tzinfo=timezone.utc)
    if not published:
        return False
    age = (current.astimezone(timezone.utc) - published.astimezone(timezone.utc)).total_seconds()
    return -300 <= age <= MAX_AGE_HOURS * 3600

def fetch_source(source):
    name, url, domain = source
    request = urllib.request.Request(url, headers={
        "User-Agent": USER_AGENT,
        "Accept": "application/rss+xml, application/atom+xml, application/xml, text/xml, */*",
        "Accept-Language": "bn-BD,bn;q=0.9,en;q=0.8",
    })
    started = time.monotonic()
    try:
        with urllib.request.urlopen(request, timeout=TIMEOUT) as response:
            raw = response.read(2_500_000)
            final_url = response.geturl()
        if not host_matches(final_url, domain):
            raise ValueError("feed redirected outside its publisher domain")
        entries = parse_feed(raw)
        return {
            "name": name, "domain": domain, "url": url, "status": "healthy",
            "http": 200, "items": entries, "durationMs": round((time.monotonic() - started) * 1000),
        }
    except urllib.error.HTTPError as error:
        return {"name": name, "domain": domain, "url": url, "status": "failed",
                "http": error.code, "items": [], "error": "HTTP " + str(error.code)}
    except Exception as error:
        detail = re.sub(r"[\r\n\t]+", " ", str(error))[:180]
        return {"name": name, "domain": domain, "url": url, "status": "failed",
                "http": None, "items": [], "error": detail or error.__class__.__name__}

def news_helpers():
    global _NEWS_HELPERS
    if _NEWS_HELPERS is None:
        import importlib.util
        path = ROOT / "scripts" / "update_news.py"
        spec = importlib.util.spec_from_file_location("news_collector_helpers", path)
        module = importlib.util.module_from_spec(spec)
        spec.loader.exec_module(module)
        _NEWS_HELPERS = module
    return _NEWS_HELPERS

def fetch_google_fallback(source):
    name, _direct_url, domain = source
    url = google_news_query_url(domain)
    request = urllib.request.Request(url, headers={
        "User-Agent": USER_AGENT,
        "Accept": "application/rss+xml, application/atom+xml, application/xml, text/xml, */*",
        "Accept-Language": "bn-BD,bn;q=0.9,en;q=0.8",
    })
    started = time.monotonic()
    try:
        with urllib.request.urlopen(request, timeout=TIMEOUT) as response:
            raw = response.read(2_500_000)
            final_url = response.geturl()
        if not host_matches(final_url, "news.google.com"):
            raise ValueError("Google News fallback redirected unexpectedly")
        entries = parse_feed(raw)
        return {
            "name": name, "domain": domain, "url": url, "kind": "google",
            "status": "healthy", "http": 200, "items": entries[:30],
            "durationMs": round((time.monotonic() - started) * 1000),
        }
    except urllib.error.HTTPError as error:
        return {"name": name, "domain": domain, "url": url, "kind": "google",
                "status": "failed", "http": error.code, "items": [], "error": "HTTP " + str(error.code)}
    except Exception as error:
        detail = re.sub(r"[\r\n\t]+", " ", str(error))[:180]
        return {"name": name, "domain": domain, "url": url, "kind": "google",
                "status": "failed", "http": None, "items": [], "error": detail or error.__class__.__name__}

def canonical_source(name):
    return news_helpers().canonical_publisher_name(name)

def collect_candidates(source_results, now=None, google_resolution_budget=32):
    current = now or datetime.now(timezone.utc)
    module = news_helpers()
    candidates = []
    pending_google = []
    for source in source_results:
        if source["status"] != "healthy":
            continue
        for entry in source["items"]:
            published = entry["published"]
            if not is_alert_candidate(entry["title"], entry["summary"], published, current):
                continue
            if source.get("kind") == "google":
                if not host_matches(entry.get("source_url") or "", source["domain"]):
                    continue
                source_name = entry.get("source_name") or source["name"]
                pending_google.append((source, entry, source_name))
                continue
            if not host_matches(entry["link"], source["domain"]):
                continue
            canonical = canonical_source(source["name"])
            candidates.append({
                "title": entry["title"],
                "summary": entry["summary"],
                "link": entry["link"],
                "publisherUrl": entry["link"],
                "publishedAt": published.isoformat(),
                "source": canonical,
                "publisherName": canonical,
                "sourceEvidence": [canonical],
                "sourceLinks": [{"name": canonical, "url": entry["link"]}],
                "category": "Bangladesh",
                "alertScope": "bangladesh",
                "isBreaking": True,
                "sourceStories": [{"name": canonical, "title": entry["title"], "summary": entry["summary"], "url": entry["link"]}],
            })
    pending_google = pending_google[:max(0, google_resolution_budget)]
    if pending_google:
        with concurrent.futures.ThreadPoolExecutor(max_workers=6) as pool:
            resolved_urls = list(pool.map(module.resolve_google_news_url, [row[1]["link"] for row in pending_google]))
        for (source, entry, source_name), resolved in zip(pending_google, resolved_urls):
            if not resolved or not host_matches(resolved, source["domain"]):
                continue
            canonical = canonical_source(source_name)
            if not canonical:
                continue
            candidates.append({
                "title": entry["title"],
                "summary": entry["summary"],
                "link": resolved,
                "publisherUrl": resolved,
                "publishedAt": entry["published"].isoformat(),
                "source": canonical,
                "publisherName": canonical,
                "sourceEvidence": [canonical],
                "sourceLinks": [{"name": canonical, "url": resolved}],
                "category": "Bangladesh",
                "alertScope": "bangladesh",
                "isBreaking": True,
                "sourceStories": [{"name": canonical, "title": entry["title"], "summary": entry["summary"], "url": resolved}],
            })
    return candidates


INCIDENT_TIME_PATTERNS = [
    re.compile(r"(?:গতকাল রাতে|গতরাতে|গত সন্ধ্যায়|গত সন্ধ্যায়|আজ সকালে|আজ দুপুরে|আজ বিকেলে|আজ সন্ধ্যায়|আজ সন্ধ্যায়|আজ রাতে|yesterday morning|yesterday afternoon|yesterday evening|last night|last evening|this morning|this afternoon|this evening|tonight)", re.I),
    re.compile(r"(?:আজ|গতকাল|গত রাতে|গতরাতে|গত সন্ধ্যায়|গত সন্ধ্যায়)?\s*(?:ভোর|সকাল|দুপুর|বিকেল|সন্ধ্যা|রাত)\s*(?:প্রায়|প্রায়|আনুমানিক)?\s*\d{1,2}\s*টা\s*\d{1,2}\s*মিনিটে", re.I),
    re.compile(r"(?:আজ|গতকাল|গত রাতে|গতরাতে|গত সন্ধ্যায়|গত সন্ধ্যায়)?\s*(?:ভোর|সকাল|দুপুর|বিকেল|সন্ধ্যা|রাত)\s*(?:প্রায়|প্রায়|আনুমানিক)?\s*\d{1,2}(?::\d{2})?\s*(?:টার দিকে|টার সময়|টার সময়|মিনিটে|টায়|টায়|টার|টা)?", re.I),
    re.compile(r"(?:around|about|approximately|at)\s+\d{1,2}(?::\d{2})?\s*(?:am|pm)", re.I),
    re.compile(r"(?:yesterday morning|yesterday afternoon|yesterday evening|last night|last evening|this morning|this afternoon|this evening|tonight)", re.I),
]

def find_incident_time_phrase(text):
    value = clean(text)
    for pattern in INCIDENT_TIME_PATTERNS:
        for match in pattern.finditer(value):
            context = value[max(0, match.start() - 90):min(len(value), match.end() + 50)].lower()
            if re.search(r"(প্রকাশিত|প্রকাশের সময়|প্রকাশের সময়|সর্বশেষ আপডেট|আপডেট করা|published|posted|last updated|updated at)", context):
                continue
            return match.group(0).strip()[:100]
    return ""

def article_plain_text(raw):
    value = str(raw or "")
    article_blocks = re.findall(r"<article\b[^>]*>(.*?)</article>", value, flags=re.I | re.S)
    main_blocks = re.findall(r"<main\b[^>]*>(.*?)</main>", value, flags=re.I | re.S)
    if article_blocks:
        value = max(article_blocks, key=len)
    elif main_blocks:
        value = max(main_blocks, key=len)
    value = re.sub(r"<!--.*?-->", " ", value, flags=re.S)
    value = re.sub(r"<(script|style|noscript|svg|nav|header|footer|aside|form)[^>]*>.*?</\1>", " ", value, flags=re.I | re.S)
    value = re.sub(r"<[^>]+>", " ", value)
    return re.sub(r"\s+", " ", html.unescape(value)).strip()

LOCATION_PATTERNS = [
    re.compile(r"[\u0980-\u09FF]{2,}(?:\s+[\u0980-\u09FF]{2,}){0,2}\s+(?:গ্রাম|মহল্লা|এলাকা|বাজার|ইউনিয়ন|উপজেলা|থানা|জেলা)(?:ে|ের|য়|তে|র)?", re.I),
    re.compile(r"(?:in|near|at)\s+[A-Za-z][A-Za-z .'-]{1,45}\s+(?:village|neighborhood|market|union|upazila|thana|district)", re.I),
]

def find_incident_location_phrase(text):
    value = clean(text)[:12000]
    found = []
    for pattern in LOCATION_PATTERNS:
        for match in pattern.finditer(value):
            context = value[max(0, match.start() - 120):min(len(value), match.end() + 100)]
            if not re.search(r"(আগুন|অগ্নিকাণ্ড|বিস্ফোরণ|সংঘর্ষ|দুর্ঘটনা|নিহত|আহত|হামলা|ঘটনা|fire|explosion|blast|clash|accident|killed|injured|incident|attack)", context, re.I):
                continue
            phrase = re.sub(r"\s+", " ", match.group(0)).strip(" ,.;:।")
            if phrase and phrase.lower() not in {x.lower() for x in found}:
                found.append(phrase[:100])
            if len(found) >= 6:
                return ", ".join(found)
    return ", ".join(found)

def fetch_article_enrichment(story):

    url = str(story.get("url") or "").strip()
    try:
        parsed = urlparse(url)
        host = (parsed.hostname or "").lower()
        if parsed.scheme != "https" or not host:
            return {}
        allowed = {domain for _, _, domain in SOURCES}
        if not any(host == domain or host.endswith("." + domain) for domain in allowed):
            return {}
        request = urllib.request.Request(url, headers={
            "User-Agent": USER_AGENT,
            "Accept": "text/html,application/xhtml+xml",
            "Accept-Language": "bn-BD,bn;q=0.9,en;q=0.8",
        })
        with urllib.request.urlopen(request, timeout=6) as response:
            final_url = response.geturl()
            final_host = (urlparse(final_url).hostname or "").lower()
            if not (final_host == host or final_host.endswith("." + host) or host.endswith("." + final_host)):
                return {}
            raw = response.read(1_200_000)
        text = article_plain_text(raw.decode("utf-8", errors="replace"))[:30000]
        return {
            "incidentTimeText": find_incident_time_phrase(text),
            "locationText": find_incident_location_phrase(text),
        }
    except Exception:
        return {}

def enrich_alert_incident_times(alerts, max_articles=10):
    tasks = []
    for item in alerts:
        stories = item.get("sourceStories") if isinstance(item.get("sourceStories"), list) else []
        for story in stories:
            if not isinstance(story, dict):
                continue
            story_text = " ".join(str(story.get(k) or "") for k in ("title", "summary"))
            has_time = bool(find_incident_time_phrase(story_text))
            has_location = bool(find_incident_location_phrase(story_text)) and bool(BANGLADESH_RE.search(story_text))
            if has_time and has_location:
                continue
            url = str(story.get("url") or "")
            if url and not any(existing[1] == url for existing in tasks):
                tasks.append((story, url))
    tasks = tasks[:max(0, int(max_articles))]
    if not tasks:
        return alerts
    with concurrent.futures.ThreadPoolExecutor(max_workers=4) as pool:
        enrichments = list(pool.map(lambda row: fetch_article_enrichment(row[0]), tasks))
    for (story, _url), enrichment in zip(tasks, enrichments):
        if enrichment.get("incidentTimeText"):
            story["incidentTimeText"] = enrichment["incidentTimeText"]
            story["incidentTimeSource"] = str(story.get("name") or story.get("source") or "")
        if enrichment.get("locationText"):
            story["locationText"] = enrichment["locationText"]
    return alerts

def cluster_alerts(candidates):
    module = news_helpers()
    clusters = []
    candidates.sort(key=lambda item: item.get("publishedAt", ""), reverse=True)
    for item in candidates:
        match = next((cluster for cluster in clusters if module.alert_event_matches(
            item, {**cluster["item"], "sourceEvidence": cluster["sources"]}
        )), None)
        if match is None:
            clusters.append({
                "item": dict(item),
                "sources": list(item.get("sourceEvidence") or []),
                "links": list(item.get("sourceLinks") or []),
                "stories": list(item.get("sourceStories") or []),
            })
            continue
        for source in item.get("sourceEvidence") or []:
            canonical = module.canonical_publisher_name(source)
            if canonical and canonical.lower() not in {str(value).lower() for value in match["sources"]}:
                match["sources"].append(canonical)
        for link in item.get("sourceLinks") or []:
            if not isinstance(link, dict):
                continue
            name = module.canonical_publisher_name(link.get("name"))
            url = str(link.get("url") or "")
            if not host_matches(url, urlparse(url).hostname or ""):
                continue
            if not any(str(old.get("name", "")).lower() == name.lower() for old in match["links"]):
                match["links"].append({"name": name, "url": url[:700]})
        for story in item.get("sourceStories") or []:
            if not isinstance(story, dict):
                continue
            signature = (str(story.get("name") or "").lower(), str(story.get("url") or "").lower())
            if not any((str(old.get("name") or "").lower(), str(old.get("url") or "").lower()) == signature for old in match["stories"]):
                match["stories"].append(story)
        if str(item.get("publishedAt") or "") > str(match["item"].get("publishedAt") or ""):
            match["item"]["publishedAt"] = item["publishedAt"]
        if not match["item"].get("summary") and item.get("summary"):
            match["item"]["summary"] = item["summary"]
    output = []
    for cluster in clusters:
        item = cluster["item"]
        item["sourceEvidence"] = cluster["sources"][:20]
        item["sourceLinks"] = cluster["links"][:12]
        item["sourceStories"] = cluster["stories"][:20]
        item["corroborationCount"] = len(item["sourceEvidence"])
        item["alertEventId"] = hashlib.sha256(module.key_for(item).encode("utf-8")).hexdigest()[:32]
        output.append(item)
    return output

def main():
    started = time.monotonic()
    now = datetime.now(timezone.utc)
    with concurrent.futures.ThreadPoolExecutor(max_workers=10) as pool:
        direct_results = list(pool.map(fetch_source, SOURCES))
    direct_healthy_names = {item["name"] for item in direct_results if item["status"] == "healthy"}
    fallback_sources = [source for source in SOURCES if source[0] not in direct_healthy_names]
    with concurrent.futures.ThreadPoolExecutor(max_workers=10) as pool:
        fallback_results = list(pool.map(fetch_google_fallback, fallback_sources))
    fallback_healthy_names = {item["name"] for item in fallback_results if item["status"] == "healthy"}
    effective_healthy_names = direct_healthy_names | fallback_healthy_names
    source_health = []
    direct_by_name = {item["name"]: item for item in direct_results}
    fallback_by_name = {item["name"]: item for item in fallback_results}
    for name, _url, domain in SOURCES:
        direct = direct_by_name[name]
        fallback = fallback_by_name.get(name)
        source_health.append({
            "name": name, "domain": domain,
            "status": "healthy" if name in effective_healthy_names else "failed",
            "directStatus": direct["status"],
            "directError": direct.get("error"),
            "fallbackStatus": fallback["status"] if fallback else "not_needed",
            "fallbackError": fallback.get("error") if fallback else None,
            "fallbackItems": len(fallback.get("items") or []) if fallback else 0,
        })
    if len(effective_healthy_names) < 3:
        print("ERROR: fewer than 3 publisher sources are reachable directly or through Google News; keeping the previous alert feed.", file=sys.stderr)
        for item in source_health:
            if item["status"] != "healthy":
                print(item["name"] + ": direct=" + item["directStatus"] + " fallback=" + item["fallbackStatus"], file=sys.stderr)
        raise SystemExit(1)
    all_results = direct_results + fallback_results
    candidates = collect_candidates(all_results, now)
    alerts = cluster_alerts(candidates)
    alerts = alerts[:MAX_ITEMS]
    alerts = enrich_alert_incident_times(alerts)
    payload = {
        "schemaVersion": 1,
        "scope": "bangladesh",
        "generatedAt": now.isoformat(),
        "updatedAt": now.isoformat(),
        "collector": "publisher-rss+google-news-fallback",
        "sourceCount": len(SOURCES),
        "healthySourceCount": len(effective_healthy_names),
        "failedSourceCount": len(SOURCES) - len(effective_healthy_names),
        "directHealthySourceCount": len(direct_healthy_names),
        "fallbackHealthySourceCount": len(fallback_healthy_names),
        "sourceHealth": source_health,
        "candidateCount": len(candidates),
        "alertItems": alerts,
    }
    OUTPUT.write_text(json.dumps(payload, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    print(json.dumps({
        "generatedAt": payload["generatedAt"],
        "configuredSources": len(SOURCES),
        "healthySources": len(effective_healthy_names),
        "directHealthySources": len(direct_healthy_names),
        "fallbackHealthySources": len(fallback_healthy_names),
        "failedSources": len(SOURCES) - len(effective_healthy_names),
        "candidates": len(candidates),
        "clusteredAlerts": len(alerts),
        "elapsedSeconds": round(time.monotonic() - started, 2),
        "failedSourceNames": [item["name"] for item in source_health if item["status"] != "healthy"],
    }, ensure_ascii=False))

if __name__ == "__main__":
    main()
