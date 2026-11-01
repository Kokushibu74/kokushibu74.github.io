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

    def test_previous_weather_loader_returns_cached_weather_items(self):
        import json
        import tempfile
        from unittest.mock import patch
        payload = {"weatherItems": [{"title": "Flood warning", "previewImage": "https://example.com/image.jpg"}]}
        with tempfile.NamedTemporaryFile("w", encoding="utf-8") as file:
            json.dump(payload, file)
            file.flush()
            with patch.object(news, "OUTPUT", file.name):
                previous = news.read_previous_weather()
        self.assertEqual(len(previous), 1)
        self.assertEqual(previous[0]["previewImage"], "https://example.com/image.jpg")

    def test_recent_weather_or_disaster_story_is_accepted(self):
        self.assertTrue(news.is_weather_disaster_story(
            "Cyclone warning issued as heavy rain approaches",
            "Weather officials advise residents to prepare",
            self.iso(timedelta(hours=-2))
        ))

    def test_old_or_undated_weather_story_is_rejected(self):
        self.assertFalse(news.is_weather_disaster_story(
            "Flood update", "Heavy rain continues", self.iso(timedelta(days=-9))
        ))
        self.assertFalse(news.is_weather_disaster_story(
            "Flood update", "Heavy rain continues", None
        ))

    def test_unrelated_story_is_not_a_weather_disaster_story(self):
        self.assertFalse(news.is_weather_disaster_story(
            "AI investment expands", "A technology company announced a new product",
            self.iso(timedelta(hours=-1))
        ))

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

    def test_explicit_recent_high_impact_breaking_alert_is_detected(self):
        self.assertTrue(news.is_recent_breaking(
            "Breaking News: major fire breaks out in Dhaka", self.iso(timedelta(minutes=-10)),
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

    def test_namespaced_atom_weather_image_is_extracted(self):
        root = news.parse_feed_xml("""<feed xmlns="http://www.w3.org/2005/Atom">
          <entry><title>Flood warning</title>
          <link href="https://example.com/story"/>
          <summary type="html">&lt;img src=&quot;https://example.com/weather.jpg&quot;&gt;</summary>
          </entry></feed>""".encode("utf-8"))
        item = news.feed_items(root)[0]
        self.assertEqual(news.image_for(item), "https://example.com/weather.jpg")

    def test_video_enclosure_is_extracted_without_mislabeling_as_image(self):
        root = news.parse_feed_xml("""<rss><channel><item>
          <title>Storm video</title><link>https://example.com/story</link>
          <enclosure url="https://cdn.example.com/storm.mp4" type="video/mp4"/>
          </item></channel></rss>""".encode("utf-8"))
        item = news.feed_items(root)[0]
        self.assertEqual(news.image_for(item), "")
        self.assertEqual(news.video_for(item), "https://cdn.example.com/storm.mp4")

    def test_media_content_video_is_extracted(self):
        root = news.parse_feed_xml("""<rss xmlns:media="http://search.yahoo.com/mrss/"><channel><item>
          <title>Flood footage</title><link>https://example.com/story</link>
          <media:content url="https://cdn.example.com/flood.mp4" type="video/mp4" medium="video"/>
          </item></channel></rss>""".encode("utf-8"))
        item = news.feed_items(root)[0]
        self.assertEqual(news.video_for(item), "https://cdn.example.com/flood.mp4")

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

    def test_ai_headline_is_classified_as_technology(self):
        self.assertEqual(
            news.classify_direct_item("OpenAI announces a new model", "https://example.com/news/1"),
            "Technology"
        )

    def test_feed_retention_uses_90_bangladesh_calendar_days(self):
        now = datetime(2026, 11, 1, 12, 0, tzinfo=timezone.utc)
        self.assertTrue(news.within_feed_retention({"publishedAt": "2026-08-03T18:00:00+00:00"}, now))
        self.assertFalse(news.within_feed_retention({"publishedAt": "2026-08-03T17:59:59+00:00"}, now))
        self.assertTrue(news.within_feed_retention({"publishedAt": "2026-11-01T11:00:00+00:00"}, now))
        self.assertFalse(news.within_feed_retention({"publishedAt": None}, now))
        self.assertFalse(news.within_feed_retention({"publishedAt": "2026-11-02T12:06:00+00:00"}, now))

    def test_feed_retention_uses_dhaka_midnight_not_rolling_24_hours(self):
        now = datetime(2026, 11, 1, 18, 30, tzinfo=timezone.utc)
        self.assertTrue(news.within_feed_retention({"publishedAt": "2026-11-01T12:00:00+00:00"}, now))

    def test_new_items_receive_first_seen_and_latest_batch_timestamps(self):
        now = datetime(2026, 11, 1, 12, 0, tzinfo=timezone.utc)
        old = {"title": "Known story", "publishedAt": "2026-11-01T10:00:00+00:00", "firstSeenAt": "2026-11-01T10:15:00+00:00", "latestBatchAt": "2026-11-01T10:15:00+00:00"}
        items = [{"title": "Known story", "publishedAt": old["publishedAt"]}, {"title": "Brand new", "publishedAt": "2026-11-01T11:55:00+00:00"}]
        news.annotate_seen_items(items, [old], now)
        self.assertEqual(items[0]["firstSeenAt"], old["firstSeenAt"])
        self.assertEqual(items[0]["latestBatchAt"], old["latestBatchAt"])
        self.assertEqual(items[1]["firstSeenAt"], now.isoformat())
        self.assertEqual(items[1]["latestBatchAt"], now.isoformat())

    def test_previous_items_are_pruned_after_90_calendar_days(self):
        import json
        from tempfile import TemporaryDirectory
        old_output = news.OUTPUT
        try:
            with TemporaryDirectory() as folder:
                path = Path(folder) / "news-feed.json"
                now = datetime.now(timezone.utc)
                path.write_text(json.dumps({"items": [
                    {"title": "Fresh headline", "link": "https://example.com/fresh", "publishedAt": now.isoformat(), "category": "Bangladesh"},
                    {"title": "Undated headline", "link": "https://example.com/undated", "publishedAt": None, "category": "Technology"}
                ]}), encoding="utf-8")
                news.OUTPUT = str(path)
                previous = news.read_previous()
                self.assertEqual({item["title"] for item in previous}, {"Fresh headline"})
        finally:
            news.OUTPUT = old_output

    def test_multiple_free_direct_sources_are_configured(self):
        self.assertGreaterEqual(len(news.DIRECT_FEEDS), 5)
        self.assertTrue(all(url.startswith("https://") for _, url in news.DIRECT_FEEDS))
        self.assertEqual(len({url for _, url in news.DIRECT_FEEDS}), len(news.DIRECT_FEEDS))


if __name__ == "__main__":
    unittest.main()
