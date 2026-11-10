"""Offline safeguards for the Telegram-only Bangladesh alert collector."""
import importlib.util
import unittest
from datetime import datetime, timedelta, timezone
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
SPEC = importlib.util.spec_from_file_location("update_news_alerts", ROOT / "scripts" / "update_news_alerts.py")
collector = importlib.util.module_from_spec(SPEC)
SPEC.loader.exec_module(collector)

class AlertCollectorTests(unittest.TestCase):
    def setUp(self):
        self.now = datetime.now(timezone.utc)

    def test_cocktail_explosion_without_casualties_is_alert_eligible(self):
        published = self.now - timedelta(minutes=4)
        self.assertTrue(collector.is_alert_candidate("ঢাকায় ককটেল বিস্ফোরণ", "পুলিশ ঘটনাস্থলে গেছে", published, self.now))

    def test_bus_fire_without_casualties_is_alert_eligible(self):
        published = self.now - timedelta(minutes=4)
        self.assertTrue(collector.is_alert_candidate("ঢাকায় চলন্ত বাসে আগুন", "হতাহতের তথ্য পাওয়া যায়নি", published, self.now))

    def test_clash_without_casualties_is_alert_eligible(self):
        published = self.now - timedelta(minutes=4)
        self.assertTrue(collector.is_alert_candidate("কুমিল্লায় দুই পক্ষের সংঘর্ষ", "পুলিশ মোতায়েন", published, self.now))

    def test_weather_requires_warning_or_severe_signal(self):
        published = self.now - timedelta(minutes=4)
        self.assertFalse(collector.is_alert_candidate("ঢাকায় বৃষ্টি", "সারাদিন বৃষ্টি হতে পারে", published, self.now))
        self.assertTrue(collector.is_alert_candidate("বাংলাদেশে ভারী বৃষ্টির সতর্কতা", "জরুরি warning", published, self.now))

    def test_police_vehicle_fire_is_alert_eligible(self):
        published = self.now - timedelta(minutes=4)
        self.assertTrue(collector.is_alert_candidate("গোপালগঞ্জে পুলিশের গাড়িতে আগুন", "পাল্টাপাল্টি ধাওয়া", published, self.now))

    def test_investigation_committee_followup_is_excluded(self):
        published = self.now - timedelta(minutes=4)
        self.assertFalse(collector.is_alert_candidate("নারায়ণগঞ্জে মাদরাসায় অগ্নিকাণ্ডের ঘটনায় তদন্ত কমিটি", "ঘটনার তদন্তে কমিটি গঠন", published, self.now))

    def test_political_statement_without_incident_in_headline_is_excluded(self):
        published = self.now - timedelta(minutes=4)
        self.assertFalse(collector.is_alert_candidate("পতিত ফ্যাসিস্ট দমনে সরকার ব্যর্থ: জামায়াত", "বিবৃতিতে ককটেল বিস্ফোরণ ও অগ্নিসংযোগের অভিযোগ", published, self.now))

    def test_foreign_incident_is_excluded(self):
        published = self.now - timedelta(minutes=4)
        self.assertFalse(collector.is_alert_candidate("India bus fire kills three", "A bus caught fire in India", published, self.now))

    def test_followup_and_stale_news_are_excluded(self):
        published = self.now - timedelta(minutes=4)
        self.assertFalse(collector.is_alert_candidate("ঢাকায় বিস্ফোরণ: সন্দেহভাজন গ্রেপ্তার", "পুলিশ একজনকে আটক করেছে", published, self.now))
        self.assertFalse(collector.is_alert_candidate("ঢাকায় বিস্ফোরণ", "পুরোনো ঘটনা", self.now - timedelta(days=2), self.now))

    def test_feed_parser_reads_rss_items(self):
        xml = """<rss><channel><item><title>ঢাকায় ককটেল বিস্ফোরণ</title><link>https://example.com/story</link><pubDate>Tue, 10 Nov 2026 08:00:00 +0000</pubDate><description>পুলিশ ঘটনাস্থলে</description></item></channel></rss>""".encode("utf-8")
        rows = collector.parse_feed(xml)
        self.assertEqual(len(rows), 1)
        self.assertEqual(rows[0]["title"], "ঢাকায় ককটেল বিস্ফোরণ")
        self.assertEqual(rows[0]["link"], "https://example.com/story")
        self.assertIsNotNone(rows[0]["published"])

    def test_feed_parser_reads_atom_entries(self):
        xml = """<feed xmlns="http://www.w3.org/2005/Atom"><entry><title>ঢাকায় বাসে আগুন</title><link href="https://example.com/fire"/><updated>2026-11-10T08:00:00Z</updated><summary>বাসে আগুন</summary></entry></feed>""".encode("utf-8")
        rows = collector.parse_feed(xml)
        self.assertEqual(rows[0]["link"], "https://example.com/fire")

    def test_google_news_query_is_scoped_to_one_publisher_and_bangladesh(self):
        url = collector.google_news_query_url("bdnews24.com")
        self.assertIn("news.google.com/rss/search?", url)
        self.assertIn("site%3Abdnews24.com", url)
        self.assertIn("ceid=BD%3Abn", url)

    def test_feed_parser_preserves_google_news_publisher_attribution(self):
        xml = """<rss><channel><item><title>ঢাকায় ককটেল বিস্ফোরণ</title><link>https://news.google.com/rss/articles/example</link><pubDate>Tue, 10 Nov 2026 08:00:00 +0000</pubDate><description>পুলিশ ঘটনাস্থলে</description><source url="https://www.thedailystar.net">The Daily Star</source></item></channel></rss>""".encode("utf-8")
        row = collector.parse_feed(xml)[0]
        self.assertEqual(row["source_name"], "The Daily Star")
        self.assertEqual(row["source_url"], "https://www.thedailystar.net")

    def test_google_news_wrapper_is_resolved_to_the_original_publisher(self):
        published = self.now - timedelta(minutes=3)
        source = {
            "name": "bdnews24.com", "domain": "bdnews24.com", "kind": "google",
            "status": "healthy", "items": [{
                "title": "ঢাকায় ককটেল বিস্ফোরণ",
                "summary": "পুলিশ ঘটনাস্থলে গেছে",
                "link": "https://news.google.com/rss/articles/example",
                "published": published,
                "source_name": "bdnews24.com",
                "source_url": "https://bdnews24.com",
            }],
        }
        resolver = collector.news_helpers().resolve_google_news_url
        from unittest.mock import patch
        with patch.object(collector.news_helpers(), "resolve_google_news_url", return_value="https://bdnews24.com/article/example") as mocked:
            rows = collector.collect_candidates([source], self.now)
        self.assertEqual(len(rows), 1)
        self.assertEqual(rows[0]["link"], "https://bdnews24.com/article/example")
        self.assertEqual(rows[0]["sourceEvidence"], ["bdnews24.com"])
        mocked.assert_called_once()

    def test_publisher_host_must_match_feed_domain(self):
        self.assertTrue(collector.host_matches("https://bangla.bdnews24.com/story", "bdnews24.com"))
        self.assertFalse(collector.host_matches("https://fake-example.com/story", "bdnews24.com"))

if __name__ == "__main__":
    unittest.main()
