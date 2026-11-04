#!/usr/bin/env python3
import unittest
from datetime import datetime, timedelta, timezone
from pathlib import Path
import importlib.util
from unittest.mock import patch

SCRIPT = Path(__file__).resolve().parents[1] / "scripts" / "update_news.py"
SPEC = importlib.util.spec_from_file_location("update_news", SCRIPT)
news = importlib.util.module_from_spec(SPEC)
SPEC.loader.exec_module(news)

class NewsAlertEvidenceTests(unittest.TestCase):
    def test_merges_independent_publishers(self):
        item = {"sourceEvidence": []}
        news.merge_source_evidence(item, "The Daily Star")
        news.merge_source_evidence(item, "Prothom Alo")
        news.merge_source_evidence(item, "The Daily Star")
        self.assertEqual(item["sourceEvidence"], ["The Daily Star", "Prothom Alo"])
        self.assertEqual(item["corroborationCount"], 2)

    def test_ignores_generic_feed_labels_as_evidence(self):
        item = {"sourceEvidence": []}
        news.merge_source_evidence(item, "Google News")
        news.merge_source_evidence(item, "Original publisher")
        self.assertEqual(item["corroborationCount"], 0)

    def test_same_publisher_aliases_are_not_independent_sources(self):
        item = {"sourceEvidence": []}
        news.merge_source_evidence(item, "BBC News বাংলা")
        news.merge_source_evidence(item, "BBC News World")
        self.assertEqual(item["corroborationCount"], 1)

    def test_google_news_publisher_suffix_deduplicates(self):
        self.assertEqual(
            news.key_for({"title": "ঢাকায় বাস দুর্ঘটনায় নিহত - The Daily Star", "source": "The Daily Star"}),
            news.key_for({"title": "ঢাকায় বাস দুর্ঘটনায় নিহত", "source": "Prothom Alo"})
        )

    def test_google_news_en_dash_publisher_suffix_deduplicates(self):
        self.assertEqual(
            news.key_for({"title": "ঢাকায় বাস দুর্ঘটনায় নিহত – The Daily Star", "source": "The Daily Star"}),
            news.key_for({"title": "ঢাকায় বাস দুর্ঘটনায় নিহত", "source": "Prothom Alo"})
        )

    def test_recent_breaking_event_remains_supported(self):
        published = (datetime.now(timezone.utc) - timedelta(minutes=10)).isoformat()
        self.assertTrue(news.is_recent_breaking("ঢাকায় বাস দুর্ঘটনায় ৩ জন নিহত", published, "Bangladesh breaking news"))

    def test_major_accident_without_casualty_count_can_be_marked_breaking(self):
        published = (datetime.now(timezone.utc) - timedelta(minutes=10)).isoformat()
        self.assertTrue(news.is_recent_breaking("নারায়ণগঞ্জে গুরুতর বাস দুর্ঘটনা", published, "Bangladesh breaking news"))

    def test_murder_can_be_marked_breaking_without_casualty_count(self):
        published = (datetime.now(timezone.utc) - timedelta(minutes=10)).isoformat()
        self.assertTrue(news.is_recent_breaking("ঢাকায় ব্যবসায়ীকে হত্যা", published, "Bangladesh breaking news"))

    def test_referendum_decision_can_be_marked_breaking(self):
        published = (datetime.now(timezone.utc) - timedelta(minutes=10)).isoformat()
        self.assertTrue(news.is_recent_breaking("বাংলাদেশে গণভোটের ফলাফল ঘোষণা", published, "Bangladesh breaking news"))

    def test_old_referendum_coverage_is_not_breaking(self):
        published = (datetime.now(timezone.utc) - timedelta(hours=3)).isoformat()
        self.assertFalse(news.is_recent_breaking("বাংলাদেশে গণভোটের ফলাফল ঘোষণা", published, "Bangladesh breaking news"))

    def test_recent_severe_weather_warning_remains_eligible_for_three_hours(self):
        published = (datetime.now(timezone.utc) - timedelta(minutes=120)).isoformat()
        self.assertTrue(news.is_recent_weather_alert("বাংলাদেশে ঘূর্ণিঝড়ের সতর্কবার্তা", "উপকূলে জরুরি সতর্কতা", published))

    def test_ordinary_forecast_is_not_a_severe_weather_alert(self):
        published = (datetime.now(timezone.utc) - timedelta(minutes=10)).isoformat()
        self.assertFalse(news.is_recent_weather_alert("আজকের আবহাওয়ার পূর্বাভাস", "সাধারণ আবহাওয়া", published))

    def test_old_weather_warning_is_not_a_current_alert(self):
        published = (datetime.now(timezone.utc) - timedelta(hours=4)).isoformat()
        self.assertFalse(news.is_recent_weather_alert("বাংলাদেশে ঘূর্ণিঝড়ের সতর্কবার্তা", "উপকূলে জরুরি সতর্কতা", published))

    def test_google_news_alert_url_is_resolved_with_a_bounded_budget(self):
        item = {"link": "https://news.google.com/rss/articles/example", "isBreaking": True}
        budget = {"remaining": 1}
        with patch.object(news, "resolve_google_news_url", return_value="https://publisher.example/article") as resolver:
            self.assertEqual(news.resolve_alert_publisher_url(item, budget), "https://publisher.example/article")
            resolver.assert_called_once_with(item["link"])
        self.assertEqual(budget["remaining"], 0)

    def test_google_news_alert_url_is_not_resolved_after_budget_exhaustion(self):
        item = {"link": "https://news.google.com/rss/articles/example", "isBreaking": True}
        with patch.object(news, "resolve_google_news_url") as resolver:
            self.assertEqual(news.resolve_alert_publisher_url(item, {"remaining": 0}), "")
            resolver.assert_not_called()

    def test_non_breaking_google_news_url_is_not_resolved(self):
        item = {"link": "https://news.google.com/rss/articles/example", "isBreaking": False}
        with patch.object(news, "resolve_google_news_url") as resolver:
            self.assertEqual(news.resolve_alert_publisher_url(item, {"remaining": 1}), "")
            resolver.assert_not_called()

    def test_weather_items_include_alert_flag_and_video(self):
        source = SCRIPT.read_text(encoding="utf-8")
        self.assertIn('"videoUrl": video_for(node)', source)
        self.assertIn('"isBreaking": is_recent_breaking(title, published, query, source) or is_recent_weather_alert(title, summary, published)', source)
        self.assertIn('"alertScope": "global" if country != "BD" else "bangladesh_candidate"', source)
        self.assertIn('existing["alertScope"] = "global"', source)

if __name__ == "__main__":
    unittest.main(verbosity=2)
