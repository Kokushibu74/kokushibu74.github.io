#!/usr/bin/env python3
import unittest
from datetime import datetime, timedelta, timezone
from pathlib import Path
import importlib.util

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

    def test_same_publisher_aliases_are_not_independent_sources(self):\n        item = {"sourceEvidence": []}\n        news.merge_source_evidence(item, "BBC News বাংলা")\n        news.merge_source_evidence(item, "BBC News World")\n        self.assertEqual(item["corroborationCount"], 1)\n\n    def test_google_news_publisher_suffix_deduplicates(self):
        self.assertEqual(
            news.key_for({"title": "ঢাকায় বাস দুর্ঘটনায় নিহত - The Daily Star", "source": "The Daily Star"}),
            news.key_for({"title": "ঢাকায় বাস দুর্ঘটনায় নিহত", "source": "Prothom Alo"})
        )

    def test_recent_breaking_event_remains_supported(self):
        published = (datetime.now(timezone.utc) - timedelta(minutes=10)).isoformat()
        self.assertTrue(news.is_recent_breaking("ঢাকায় বাস দুর্ঘটনায় ৩ জন নিহত", published, "Bangladesh breaking news"))

    def test_referendum_decision_can_be_marked_breaking(self):
        published = (datetime.now(timezone.utc) - timedelta(minutes=10)).isoformat()
        self.assertTrue(news.is_recent_breaking("বাংলাদেশে গণভোটের ফলাফল ঘোষণা", published, "Bangladesh breaking news"))

    def test_old_referendum_coverage_is_not_breaking(self):
        published = (datetime.now(timezone.utc) - timedelta(hours=3)).isoformat()
        self.assertFalse(news.is_recent_breaking("বাংলাদেশে গণভোটের ফলাফল ঘোষণা", published, "Bangladesh breaking news"))

    def test_weather_items_include_alert_flag_and_video(self):
        source = SCRIPT.read_text(encoding="utf-8")
        self.assertIn('"videoUrl": video_for(node)', source)
        self.assertIn('"isBreaking": is_recent_breaking(title, published, query, source)', source)

if __name__ == "__main__":
    unittest.main(verbosity=2)
