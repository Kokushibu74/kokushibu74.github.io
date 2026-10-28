"""Offline tests for the free news collection and breaking-news rules."""
import importlib.util
import unittest
from datetime import datetime, timedelta, timezone
from pathlib import Path

SCRIPT = Path(__file__).resolve().parents[1] / "scripts" / "update_news.py"
SPEC = importlib.util.spec_from_file_location("update_news", SCRIPT)
news = importlib.util.module_from_spec(SPEC)
SPEC.loader.exec_module(news)


class NewsLogicTests(unittest.TestCase):
    def iso(self, delta):
        return (datetime.now(timezone.utc) + delta).isoformat()

    def test_iso8601_dates_are_parsed(self):
        parsed = news.parse_date("2026-10-28T12:30:00+00:00")
        self.assertEqual(parsed, "2026-10-28T12:30:00+00:00")

    def test_malformed_ampersand_in_feed_xml_is_recovered(self):
        root = news.parse_feed_xml(b"<rss><channel><item><title>A & B</title></item></channel></rss>")
        self.assertEqual(root.findtext("./channel/item/title"), "A & B")

    def test_same_headline_deduplicates_across_sources(self):
        a = {"title": "ঢাকায় জরুরি সংবাদ!", "source": "Source A"}
        b = {"title": "ঢাকায় জরুরি সংবাদ!", "source": "Source B"}
        self.assertEqual(news.key_for(a), news.key_for(b))

    def test_explicit_recent_breaking_alert_is_detected(self):
        self.assertTrue(news.is_recent_breaking(
            "Breaking News: major update", self.iso(timedelta(minutes=-10)),
            "Bangladesh breaking news"
        ))

    def test_old_breaking_alert_is_not_current(self):
        self.assertFalse(news.is_recent_breaking(
            "Breaking News: major update", self.iso(timedelta(hours=-3)),
            "Bangladesh breaking news"
        ))

    def test_word_breaking_alone_does_not_trigger_alert(self):
        self.assertFalse(news.is_recent_breaking(
            "Breaking the Iron Law", self.iso(timedelta(minutes=-10)),
            "Bangladesh breaking news"
        ))

    def test_recent_high_impact_event_from_direct_source_is_detected(self):
        self.assertTrue(news.is_recent_breaking(
            "ঢাকায় ভয়াবহ বিস্ফোরণ", self.iso(timedelta(minutes=-20)),
            "direct-rss", "The Daily Star"
        ))

    def test_old_event_from_direct_source_is_not_breaking(self):
        self.assertFalse(news.is_recent_breaking(
            "ঢাকায় ভয়াবহ বিস্ফোরণ", self.iso(timedelta(hours=-2)),
            "direct-rss", "The Daily Star"
        ))

    def test_unrelated_headline_is_not_breaking(self):
        self.assertFalse(news.is_recent_breaking(
            "আজকের আবহাওয়ার পূর্বাভাস", self.iso(timedelta(minutes=-5)),
            "direct-rss", "The Daily Star"
        ))

    def test_personal_story_mentioning_death_is_not_breaking(self):
        self.assertFalse(news.is_recent_breaking(
            "‘সবাই দোয়া করবেন’, মায়ের মৃত্যুতে যা বললেন পপি",
            self.iso(timedelta(minutes=-5)), "direct-rss", "The Daily Star"
        ))

    def test_urgent_word_in_opinion_headline_is_not_breaking(self):
        self.assertFalse(news.is_recent_breaking(
            "পাহাড়ে শান্তি ফেরাতে রাজনৈতিক ও সামাজিক ঐকমত্য জরুরি: মীর হেলাল",
            self.iso(timedelta(minutes=-5)), "Bangladesh breaking news"
        ))

    def test_past_attack_case_headline_is_not_automatically_breaking(self):
        self.assertFalse(news.is_recent_breaking(
            "বিএনপি কার্যালয়ে হামলা-ভাঙচুরের ঘটনায় মামলা, আসামি ৮১",
            self.iso(timedelta(minutes=-5)), "direct-rss", "Jago News 24"
        ))

    def test_recent_fatality_event_is_detected(self):
        self.assertTrue(news.is_recent_breaking(
            "ঘূর্ণিঝড়ের আঘাতে ৫ জনের মৃত্যু",
            self.iso(timedelta(minutes=-5)), "direct-rss", "The Daily Star"
        ))

    def test_multiple_free_direct_sources_are_configured(self):
        self.assertGreaterEqual(len(news.DIRECT_FEEDS), 3)
        self.assertTrue(all(url.startswith("https://") for _, url in news.DIRECT_FEEDS))


if __name__ == "__main__":
    unittest.main()
