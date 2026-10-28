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

    def test_historical_anniversary_clash_is_not_breaking(self):
        self.assertFalse(news.is_recent_breaking(
            "লগি-বৈঠা সহিংসতার ২০ বছর: আওয়ামী লীগ ও জামায়াতের রক্তক্ষয়ী সংঘর্ষের আগে যা যা ঘটেছিল",
            self.iso(timedelta(minutes=-5)), "direct-rss", "BBC News বাংলা"
        ))

    def test_clash_without_fatalities_is_not_breaking(self):
        self.assertFalse(news.is_recent_breaking(
            "দুই দলের মধ্যে সংঘর্ষের ২০ বছর পূর্তি",
            self.iso(timedelta(minutes=-5)), "direct-rss", "BBC News বাংলা"
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

    def test_remand_followup_to_an_incident_is_not_automatically_breaking(self):
        self.assertFalse(news.is_recent_breaking(
            "ককটেল বিস্ফোরণ: তন্বী ও সোহান ৫ দিনের রিমান্ডে",
            self.iso(timedelta(minutes=-5)), "direct-rss", "Jago News 24"
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

    def test_namespaced_atom_feed_items_and_links_are_parsed(self):
        root = news.parse_feed_xml("""<feed xmlns="http://www.w3.org/2005/Atom">
          <entry><title>ঢাকায় নতুন খবর</title>
          <link href="https://example.com/story"/>
          <updated>2026-10-28T12:00:00Z</updated></entry></feed>""".encode("utf-8"))
        items = news.feed_items(root)
        self.assertEqual(len(items), 1)
        self.assertEqual(news.child_text(items[0], "title"), "ঢাকায় নতুন খবর")
        self.assertEqual(news.child_text(items[0], "link"), "https://example.com/story")
        self.assertEqual(news.child_text(items[0], "updated"), "2026-10-28T12:00:00Z")

    def test_namespaced_rss_feed_items_are_parsed(self):
        root = news.parse_feed_xml("""<rss xmlns="https://example.com/rss"><channel>
          <item><title>Test headline</title><link>https://example.com/news</link></item>
          </channel></rss>""".encode("utf-8"))
        items = news.feed_items(root)
        self.assertEqual(len(items), 1)
        self.assertEqual(news.child_text(items[0], "title"), "Test headline")
        self.assertEqual(news.child_text(items[0], "link"), "https://example.com/news")

    def test_direct_international_section_is_not_misclassified_as_bangladesh(self):
        self.assertEqual(
            news.classify_direct_item("ঘূর্ণিঝড় অর্ণবের আঘাতে ৫ জনের মৃত্যু",
                                      "https://www.jagonews24.com/international/news/1172989"),
            "World"
        )

    def test_bbc_world_feed_is_classified_as_world(self):
        self.assertEqual(
            news.classify_direct_item("A new global development",
                                      "https://www.bbc.co.uk/news/articles/example",
                                      "BBC News World"),
            "World"
        )

    def test_bbc_bangla_local_headline_is_classified_as_bangladesh(self):
        self.assertEqual(
            news.classify_direct_item("ঢাকায় নতুন উন্নয়ন প্রকল্প",
                                      "https://www.bbc.com/bengali/articles/example",
                                      "BBC News বাংলা"),
            "Bangladesh"
        )

    def test_bbc_bangla_international_headline_is_classified_as_world(self):
        self.assertEqual(
            news.classify_direct_item("ইউরোপে নতুন নীতির ঘোষণা",
                                      "https://www.bbc.com/bengali/articles/example",
                                      "BBC News বাংলা"),
            "World"
        )

    def test_direct_technology_section_is_classified(self):
        self.assertEqual(
            news.classify_direct_item("নতুন প্রযুক্তি", "https://example.com/technology/news/1"),
            "Technology"
        )

    def test_ai_headline_is_classified(self):
        self.assertEqual(
            news.classify_direct_item("OpenAI announces a new model", "https://example.com/news/1"),
            "AI"
        )

    def test_multiple_free_direct_sources_are_configured(self):
        self.assertGreaterEqual(len(news.DIRECT_FEEDS), 5)
        self.assertTrue(all(url.startswith("https://") for _, url in news.DIRECT_FEEDS))
        self.assertEqual(len({url for _, url in news.DIRECT_FEEDS}), len(news.DIRECT_FEEDS))


if __name__ == "__main__":
    unittest.main()
