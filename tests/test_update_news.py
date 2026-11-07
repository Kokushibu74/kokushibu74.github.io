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

    def test_weather_preview_falls_back_when_preview_image_is_empty(self):
        item = {
            "previewImage": "",
            "image": "https://cdn.example.com/weather.jpg",
            "previewCheckedAt": "2026-11-04T00:00:00+00:00",
        }
        self.assertEqual(news.weather_preview_image(item), "https://cdn.example.com/weather.jpg")

    def test_weather_preview_ignores_non_https_and_uses_thumbnail_fallback(self):
        item = {
            "previewImage": "http://insecure.example.com/a.jpg",
            "image": "",
            "thumbnailUrl": "https://cdn.example.com/thumb.jpg",
        }
        self.assertEqual(news.weather_preview_image(item), "https://cdn.example.com/thumb.jpg")

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

    def test_duplicate_direct_rss_merge_does_not_reference_google_country_variable(self):
        existing = {"sourceEvidence": [], "category": "Bangladesh"}
        merged = news.merge_duplicate_source(existing, "Prothom Alo", category="Bangladesh")
        self.assertEqual(merged["sourceEvidence"], ["Prothom Alo"])
        self.assertNotIn("alertScope", merged)

    def test_duplicate_direct_international_story_is_marked_global(self):
        existing = {"sourceEvidence": [], "category": "World"}
        merged = news.merge_duplicate_source(existing, "BBC News World", category="World")
        self.assertEqual(merged["alertScope"], "global")

    def test_duplicate_google_news_merge_uses_explicit_country(self):
        domestic = news.merge_duplicate_source({"sourceEvidence": []}, "Source A", country="BD")
        international = news.merge_duplicate_source({"sourceEvidence": []}, "Source B", country="US")
        self.assertNotIn("alertScope", domestic)
        self.assertEqual(international["alertScope"], "global")

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

    def test_protocol_relative_rss_image_is_upgraded_to_https(self):
        import xml.etree.ElementTree as ET
        item = ET.fromstring("<item><description>&lt;img src='//cdn.example.com/weather.jpg'&gt;</description></item>")
        self.assertEqual(news.image_for(item), "https://cdn.example.com/weather.jpg")

    def test_publisher_metadata_uses_standard_browser_user_agent(self):
        from email.message import Message
        from unittest.mock import patch

        class FakeResponse:
            headers = Message()
            headers["Content-Type"] = "text/html; charset=utf-8"
            def __enter__(self): return self
            def __exit__(self, *args): return False
            def geturl(self): return "https://publisher.example/story"
            def read(self, limit): return b"<html><head><meta property='og:title' content='Story'></head></html>"

        captured = {}
        def fake_open(request, timeout):
            captured["request"] = request
            return FakeResponse()

        with patch.object(news, "urlopen_with_retry", side_effect=fake_open):
            metadata = news.publisher_metadata("https://publisher.example/story")

        self.assertEqual(metadata.get("previewTitle"), "Story")
        user_agent = captured["request"].get_header("User-agent") or ""
        self.assertIn("Chrome/", user_agent)
        self.assertNotIn("NewsPreviewBot", user_agent)

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

    def test_previous_snapshot_bootstraps_legacy_archive_only_when_requested(self):
        import json
        from tempfile import TemporaryDirectory
        from unittest.mock import Mock, patch
        with TemporaryDirectory() as folder:
            latest_path = Path(folder) / "news-feed.json"
            archive_path = Path(folder) / "news-archive.json"
            latest_path.write_text(json.dumps({"items": [
                {"title": "Recent", "link": "https://example.com/recent", "publishedAt": datetime.now(timezone.utc).isoformat()}
            ]}), encoding="utf-8")
            archive_path.write_text(json.dumps({"items": []}), encoding="utf-8")
            legacy = {"items": [
                {"title": "Old story", "link": "https://example.com/old", "publishedAt": (datetime.now(timezone.utc) - timedelta(days=4)).isoformat()}
            ]}
            response = Mock()
            response.__enter__ = Mock(return_value=response)
            response.__exit__ = Mock(return_value=False)
            response.read.return_value = json.dumps(legacy).encode("utf-8")
            with patch.object(news, "OUTPUT", str(latest_path)), \
                 patch.object(news, "ARCHIVE_OUTPUT", str(archive_path)), \
                 patch.object(news, "LEGACY_FEED_SEED_URL", "https://example.com/legacy.json"), \
                 patch.object(news.urllib.request, "urlopen", return_value=response) as opener:
                ordinary, _ = news.read_previous_snapshot()
                self.assertEqual(len(ordinary), 1)
                recovered, baseline = news.read_previous_snapshot(allow_legacy_bootstrap=True)
                self.assertTrue(baseline)
                self.assertEqual({item["title"] for item in recovered}, {"Recent", "Old story"})
                opener.assert_called_once()

    def test_previous_items_are_pruned_after_90_calendar_days(self):
        import json
        from tempfile import TemporaryDirectory
        old_output, old_archive_output = news.OUTPUT, news.ARCHIVE_OUTPUT
        try:
            with TemporaryDirectory() as folder:
                path = Path(folder) / "news-feed.json"
                archive_path = Path(folder) / "news-archive.json"
                now = datetime.now(timezone.utc)
                path.write_text(json.dumps({"items": [
                    {"title": "Fresh headline", "link": "https://example.com/fresh", "publishedAt": now.isoformat(), "category": "Bangladesh"},
                    {"title": "Undated headline", "link": "https://example.com/undated", "publishedAt": None, "category": "Technology"}
                ]}), encoding="utf-8")
                archive_path.write_text(json.dumps({"items": [
                    {"title": "Archived headline", "link": "https://example.com/archive", "publishedAt": (now - timedelta(days=3)).isoformat(), "category": "World"}
                ]}), encoding="utf-8")
                news.OUTPUT, news.ARCHIVE_OUTPUT = str(path), str(archive_path)
                previous = news.read_previous()
                self.assertEqual({item["title"] for item in previous}, {"Fresh headline", "Archived headline"})
        finally:
            news.OUTPUT, news.ARCHIVE_OUTPUT = old_output, old_archive_output

    def test_feed_partitions_keep_latest_and_archive_at_exact_24_hour_boundary(self):
        now = datetime(2026, 11, 7, 12, 0, tzinfo=timezone.utc)
        items = [
            {"title": "Latest", "publishedAt": (now - timedelta(hours=23, minutes=59)).isoformat()},
            {"title": "Boundary", "publishedAt": (now - timedelta(hours=24)).isoformat()},
            {"title": "Archive", "publishedAt": (now - timedelta(days=7)).isoformat()},
            {"title": "Too far future", "publishedAt": (now + timedelta(minutes=10)).isoformat()},
        ]
        latest, archive = news.split_feed_items(items, now)
        self.assertEqual([item["title"] for item in latest], ["Latest"])
        self.assertEqual([item["title"] for item in archive], ["Boundary", "Archive"])
        self.assertEqual(len(latest) + len(archive), 3)

    def test_retained_recent_fatal_clash_recomputes_breaking_status(self):
        now = datetime(2026, 11, 5, 7, 54, 55, tzinfo=timezone.utc)
        item = {
            "title": "জয়পুরহাটে মোটরসাইকেল আরোহী নিহত, বাসে আগুন দিলো ক্ষুব্ধ জনতা",
            "link": "https://www.jagonews24.com/country/news/1175881",
            "publishedAt": "2026-11-05T07:03:58+00:00",
            "category": "Bangladesh",
            "source": "Jago News 24",
            "summary": "জয়পুরহাটে মোটরসাইকেল আরোহী নিহত হওয়ার পর ক্ষুব্ধ জনতা বাসে আগুন দেয়",
            "isBreaking": False,
        }
        retained = news.retained_previous_items([item], now)
        self.assertEqual(len(retained), 1)
        self.assertTrue(retained[0]["isBreaking"])

    def test_get_retry_uses_bounded_backoff_for_transient_http_errors(self):
        import urllib.error
        from email.message import Message
        from unittest.mock import Mock, patch
        request = news.urllib.request.Request("https://example.com/feed.xml")
        error = urllib.error.HTTPError(request.full_url, 429, "Too Many Requests", Message(), None)
        response = Mock()
        with patch.object(news.urllib.request, "urlopen", side_effect=[error, response]) as opener, patch.object(news.time, "sleep") as sleep:
            result = news.urlopen_with_retry(request, timeout=3, attempts=2)
        self.assertIs(result, response)
        self.assertEqual(opener.call_count, 2)
        sleep.assert_called_once_with(0.5)

    def test_post_requests_are_never_retried(self):
        import urllib.error
        from email.message import Message
        from unittest.mock import patch
        request = news.urllib.request.Request("https://example.com/submit", data=b"payload")
        error = urllib.error.HTTPError(request.full_url, 503, "Unavailable", Message(), None)
        with patch.object(news.urllib.request, "urlopen", side_effect=error) as opener, patch.object(news.time, "sleep") as sleep:
            with self.assertRaises(urllib.error.HTTPError):
                news.urlopen_with_retry(request, timeout=3, attempts=2)
        opener.assert_called_once()
        sleep.assert_not_called()

    def test_multiple_free_direct_sources_are_configured(self):
        self.assertGreaterEqual(len(news.DIRECT_FEEDS), 5)
        self.assertTrue(all(url.startswith("https://") for _, url in news.DIRECT_FEEDS))
        self.assertEqual(len({url for _, url in news.DIRECT_FEEDS}), len(news.DIRECT_FEEDS))




    def test_feed_change_tracker_separates_added_updated_unchanged_and_removed(self):
        previous = [
            {"title": "Story A", "summary": "same"},
            {"title": "Story B", "summary": "old"},
            {"title": "Story C", "summary": "removed"},
        ]
        current = [
            {"title": "Story A", "summary": "same"},
            {"title": "Story B", "summary": "new"},
            {"title": "Story D", "summary": "new story"},
        ]
        changes = news.calculate_feed_changes(current, previous, previous, True)
        self.assertEqual(changes["added"], 1)
        self.assertEqual(changes["updated"], 1)
        self.assertEqual(changes["unchanged"], 1)
        self.assertEqual(changes["removed"], 1)
        self.assertEqual(changes["previous"], 3)
        self.assertEqual(changes["net_change"], 0)

    def test_feed_change_tracker_does_not_invent_first_run_comparison(self):
        current = [{"title": "Initial story", "summary": "first import"}]
        changes = news.calculate_feed_changes(current, [], [], False)
        self.assertFalse(changes["baseline_available"])
        self.assertIsNone(changes["removed"])
        self.assertIsNone(changes["net_change"])

    def test_feed_content_metrics_match_live_news_time_windows_and_preview_fields(self):
        now = datetime(2026, 11, 3, 12, 0, tzinfo=timezone.utc)
        items = [
            {"title": "BD five minutes", "category": "Bangladesh", "publishedAt": (now - timedelta(minutes=5)).isoformat(), "previewImage": "https://img.example/5.jpg"},
            {"title": "BD exactly fifteen minutes", "category": "Bangladesh", "publishedAt": (now - timedelta(minutes=15)).isoformat(), "previewImage": "https://img.example/15.jpg"},
            {"title": "BD sixteen minutes", "category": "Bangladesh", "publishedAt": (now - timedelta(minutes=16)).isoformat(), "image": "https://img.example/16.jpg"},
            {"title": "BD exactly sixty minutes", "category": "Bangladesh", "publishedAt": (now - timedelta(minutes=60)).isoformat(), "thumbnail": "https://img.example/60.jpg"},
            {"title": "BD sixty-one minutes", "category": "Bangladesh", "publishedAt": (now - timedelta(minutes=61)).isoformat(), "previewImage": "https://img.example/61.jpg"},
            {"title": "BD video only", "category": "Bangladesh", "publishedAt": (now - timedelta(minutes=5)).isoformat(), "videoUrl": "https://video.example/clip.mp4"},
            {"title": "BD no media", "category": "Bangladesh", "publishedAt": (now - timedelta(minutes=5)).isoformat()},
            {"title": "World image", "category": "World", "publishedAt": (now - timedelta(minutes=5)).isoformat(), "previewImage": "https://img.example/world.jpg"},
            {"title": "Tech archive", "category": "Technology", "publishedAt": (now - timedelta(hours=25)).isoformat()},
            {"title": "Future item", "category": "World", "publishedAt": (now + timedelta(minutes=10)).isoformat()},
        ]
        weather = [
            {"title": "Flood alert", "previewImage": "https://img.example/flood.jpg"},
            {"title": "Storm update"},
        ]
        metrics = news.feed_content_metrics(items, weather, now)
        self.assertEqual(metrics["latest_24h"], 8)
        self.assertEqual(metrics["archive"], 1)
        self.assertEqual(metrics["latest_tag_15m"], 5)
        self.assertEqual(metrics["image_preview_urls"], 6)
        self.assertEqual(metrics["bd_slider_preview_candidates"], 4)
        self.assertEqual(metrics["bd_slider_window_minutes"], 60)
        self.assertTrue(metrics["bd_slider_image_required"])
        self.assertEqual(metrics["weather_cards"], 2)
        self.assertEqual(metrics["weather_cards_with_preview"], 1)

    def test_generated_feed_validator_accepts_valid_deduplicated_payload(self):
        payload = {"items": [
            {"title": "Story A", "link": "https://example.com/a", "publishedAt": self.iso(timedelta(minutes=-5)), "category": "Bangladesh", "subCategory": "Politics & Government"},
            {"title": "Story B", "link": "https://example.com/b", "publishedAt": self.iso(timedelta(minutes=-10)), "category": "World", "subCategory": "War & Conflict"},
        ], "weatherItems": []}
        result = news.validate_feed_payload(payload)
        self.assertTrue(result["valid"])
        self.assertEqual(result["invalid"], 0)
        self.assertEqual(result["duplicates"], 0)

    def test_generated_feed_validator_detects_invalid_and_duplicate_items(self):
        payload = {"items": [
            {"title": "Duplicate story", "link": "https://example.com/a", "publishedAt": self.iso(timedelta(minutes=-5)), "category": "Bangladesh", "subCategory": "Politics & Government"},
            {"title": "Duplicate story", "link": "https://example.com/b", "publishedAt": self.iso(timedelta(minutes=-4)), "category": "World", "subCategory": "War & Conflict"},
            {"title": "Invalid category", "link": "http://example.com/c", "publishedAt": None, "category": "Other", "subCategory": "Other / Unclassified"},
        ], "weatherItems": []}
        result = news.validate_feed_payload(payload)
        self.assertFalse(result["valid"])
        self.assertEqual(result["invalid"], 1)
        self.assertEqual(result["duplicates"], 1)


    def test_taxonomy_has_three_main_categories_and_five_topics_each(self):
        self.assertEqual(set(news.SUBCATEGORY_NAMES), {"Bangladesh", "World", "Technology"})
        self.assertTrue(all(len(topics) == 5 for topics in news.SUBCATEGORY_NAMES.values()))
        self.assertEqual(news.DEFAULT_SUBCATEGORY, "Other / Unclassified")

    def test_bangladesh_subcategory_classifier(self):
        cases = [
            ("সংসদে নির্বাচন নিয়ে রাজনৈতিক দলগুলোর আলোচনা", "Politics & Government"),
            ("বাংলাদেশে মূল্যস্ফীতি ও রপ্তানি আয় নিয়ে নতুন প্রতিবেদন", "Economy & Business"),
            ("ঢাকায় ডাকাতির ঘটনায় পুলিশ তিনজনকে গ্রেপ্তার করেছে", "Crime & Law"),
            ("বিশ্ববিদ্যালয়ে ভর্তি পরীক্ষা শুরু, অংশ নিচ্ছে হাজারো শিক্ষার্থী", "Society & Education"),
            ("ডেঙ্গু রোগীর সংখ্যা বাড়ছে, হাসপাতালে নতুন চাপ", "Health & Environment"),
        ]
        for title, expected in cases:
            with self.subTest(title=title):
                self.assertEqual(news.classify_subcategory({"category": "Bangladesh", "title": title}), expected)

    def test_world_subcategory_classifier(self):
        cases = [
            ("President wins national election amid political uncertainty", "International Politics"),
            ("Missile strikes and airstrikes intensify as war spreads", "War & Conflict"),
            ("Global economy faces inflation as oil prices rise", "Global Economy"),
            ("UN summit opens with a new diplomatic treaty", "Diplomacy & Relations"),
            ("Major earthquake triggers flood and climate disaster warnings", "Climate & Disaster"),
        ]
        for title, expected in cases:
            with self.subTest(title=title):
                self.assertEqual(news.classify_subcategory({"category": "World", "title": title}), expected)

    def test_technology_subcategory_classifier(self):
        cases = [
            ("OpenAI unveils a new ChatGPT AI model", "Artificial Intelligence"),
            ("NASA research discovers a new planet beyond the solar system", "Science & Space"),
            ("Samsung Galaxy smartphone gets a new camera and processor", "Gadgets & Devices"),
            ("Android app and software update adds new features", "Software & Apps"),
            ("Ransomware hackers expose data in major cybersecurity breach", "Cybersecurity"),
        ]
        for title, expected in cases:
            with self.subTest(title=title):
                self.assertEqual(news.classify_subcategory({"category": "Technology", "title": title}), expected)

    def test_ambiguous_and_sports_stories_use_unclassified_fallback(self):
        ambiguous = {"category": "Bangladesh", "title": "বাংলাদেশে নির্বাচন ও মূল্যস্ফীতি নিয়ে আলোচনা"}
        sports = {"category": "Bangladesh", "title": "Bangladesh cricket team wins the final"}
        self.assertEqual(news.classify_subcategory(ambiguous), news.DEFAULT_SUBCATEGORY)
        self.assertEqual(news.classify_subcategory(sports), news.DEFAULT_SUBCATEGORY)

    def test_retained_previous_items_backfill_subcategory(self):
        now = datetime(2026, 11, 5, 12, 0, tzinfo=timezone.utc)
        item = {
            "title": "ঢাকায় ডাকাতির ঘটনায় পুলিশ গ্রেপ্তার করেছে",
            "link": "https://example.com/crime",
            "publishedAt": "2026-11-05T07:00:00+00:00",
            "category": "Bangladesh",
            "source": "Example News",
        }
        retained = news.retained_previous_items([item], now)
        self.assertEqual(len(retained), 1)
        self.assertEqual(retained[0]["subCategory"], "Crime & Law")

    def test_feed_validator_rejects_missing_or_wrong_subcategory(self):
        base = {
            "title": "A headline",
            "link": "https://example.com/story",
            "publishedAt": self.iso(timedelta(minutes=-5)),
            "category": "Bangladesh",
        }
        missing = news.validate_feed_payload({"items": [base], "weatherItems": []})
        wrong = news.validate_feed_payload({"items": [{**base, "subCategory": "War & Conflict"}], "weatherItems": []})
        self.assertFalse(missing["valid"])
        self.assertFalse(wrong["valid"])
        self.assertEqual(missing["invalid"], 1)
        self.assertEqual(wrong["invalid"], 1)


    def test_successful_publisher_metadata_cache_is_reused(self):
        now = datetime(2026, 11, 5, 12, 0, tzinfo=timezone.utc)
        item = {"previewMetadataStatus": "success", "previewCheckedAt": "2026-10-01T00:00:00+00:00"}
        self.assertTrue(news.preview_cache_is_fresh(item, now))

    def test_fallback_publisher_metadata_cache_is_retried_after_six_hours(self):
        now = datetime(2026, 11, 5, 12, 0, tzinfo=timezone.utc)
        recent = {"previewMetadataStatus": "fallback", "previewCheckedAt": "2026-11-05T08:30:00+00:00"}
        expired = {"previewMetadataStatus": "fallback", "previewCheckedAt": "2026-11-05T05:30:00+00:00"}
        self.assertTrue(news.preview_cache_is_fresh(recent, now))
        self.assertFalse(news.preview_cache_is_fresh(expired, now))

    def test_legacy_publisher_cache_without_status_is_retried_for_classification(self):
        now = datetime(2026, 11, 5, 12, 0, tzinfo=timezone.utc)
        legacy = {"previewTitle": "RSS title fallback", "previewCheckedAt": "2026-11-05T11:55:00+00:00"}
        self.assertFalse(news.preview_cache_is_fresh(legacy, now))

    def test_malformed_fallback_cache_timestamp_is_not_reused(self):
        now = datetime(2026, 11, 5, 12, 0, tzinfo=timezone.utc)
        item = {"previewMetadataStatus": "fallback", "previewCheckedAt": "not-a-date"}
        self.assertFalse(news.preview_cache_is_fresh(item, now))

if __name__ == "__main__":
    unittest.main()
