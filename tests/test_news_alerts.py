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
        self.assertIn('"isBreaking": is_recent_breaking(title, published, query, source, summary) or is_recent_weather_alert(title, summary, published)', source)
        self.assertIn('"alertScope": "global" if country != "BD" else "bangladesh_candidate"', source)
        self.assertIn('existing["alertScope"] = "global"', source)

    def test_recent_death_phrases_are_breaking_within_one_hour(self):
        published = (datetime.now(timezone.utc) - timedelta(minutes=50)).isoformat()
        for phrase in ("মারা গেলো", "মারা গেছে", "মারা গেলেন"):
            with self.subTest(phrase=phrase):
                self.assertTrue(news.is_recent_breaking("ঢাকায় সংঘর্ষে আহত শ্রমিক " + phrase, published, "direct-rss"))

    def test_breaking_event_is_not_extended_beyond_one_hour(self):
        published = (datetime.now(timezone.utc) - timedelta(minutes=61)).isoformat()
        self.assertFalse(news.is_recent_breaking("ঢাকায় সংঘর্ষে আহত শ্রমিক মারা গেলো", published, "direct-rss"))

    def test_recent_breaking_signal_in_summary_is_detected(self):
        published = (datetime.now(timezone.utc) - timedelta(minutes=10)).isoformat()
        self.assertTrue(news.is_recent_breaking(
            "শ্রমিকের অবস্থা সংকটাপন্ন", published, "direct-rss",
            "Jago News 24", "ঢাকায় সংঘর্ষে আহত শ্রমিক মারা গেলো"
        ))

    def test_duplicate_merge_promotes_breaking_flag_from_later_source(self):
        item = {"isBreaking": False, "sourceEvidence": []}
        news.merge_duplicate_source(item, "Jago News 24", category="Bangladesh", is_breaking=True)
        self.assertTrue(item["isBreaking"])
        self.assertEqual(item["sourceEvidence"], ["Jago News 24"])

    def test_duplicate_merge_never_downgrades_existing_breaking_flag(self):
        item = {"isBreaking": True, "sourceEvidence": []}
        news.merge_duplicate_source(item, "Prothom Alo", category="Bangladesh", is_breaking=False)
        self.assertTrue(item["isBreaking"])

    def test_duplicate_merge_carries_the_summary_that_made_the_story_breaking(self):
        item = {"isBreaking": False, "summary": "Routine local update", "sourceEvidence": []}
        breaking_summary = "ঢাকায় সংঘর্ষে আহত শ্রমিক মারা গেলো"
        news.merge_duplicate_source(
            item, "Jago News 24", category="Bangladesh",
            is_breaking=True, summary=breaking_summary
        )
        self.assertTrue(item["isBreaking"])
        self.assertEqual(item["summary"], breaking_summary)


    def test_gopalganj_attack_coverage_matches_across_publishers_after_three_hours(self):
        left = {
            "title": "গোপালগঞ্জে এমপি সেলিমের বাড়িতে ককটেল বিস্ফোরণ ও আগুন",
            "summary": "সেলিমুজ্জামানের বাড়িতে ভাঙচুর ও অগ্নিসংযোগ",
            "source": "Jago News 24",
            "sourceEvidence": ["Jago News 24"],
            "publishedAt": "2026-11-19T07:35:00+00:00",
        }
        right = {
            "title": "গোপালগঞ্জে সেলিমুজ্জামানের বাড়িতে আগুন",
            "summary": "এমপির বাড়িতে হামলা, ভাঙচুর ও অগ্নিসংযোগ",
            "source": "Independent Television",
            "sourceEvidence": ["Independent Television"],
            "publishedAt": "2026-11-19T11:14:00+00:00",
        }
        self.assertEqual(news.alert_event_locations(left), {"gopalganj"})
        self.assertEqual(news.alert_event_locations(right), {"gopalganj"})
        self.assertTrue(news.alert_event_matches(left, right))




    def test_same_publisher_followup_url_joins_existing_mp_incident(self):
        first = {
            "title": "গোপালগঞ্জে থানা ও এমপির বাড়িতে আগুন দিল নিষিদ্ধ ঘোষিত আওয়ামী লীগ",
            "summary": "গোপালগঞ্জে থানা ও এমপির বাড়িতে আগুন দিল নিষিদ্ধ ঘোষিত আওয়ামী লীগ",
            "source": "UNB", "sourceEvidence": ["UNB"],
            "publishedAt": "2026-11-19T11:10:00+00:00",
        }
        followup = {
            "title": "গোপালগঞ্জে এমপির বাড়ি ও থানায় ভাঙচুর-অগ্নিসংযোগ",
            "summary": "গোপালগঞ্জে এমপির বাড়ি ও থানায় ভাঙচুর-অগ্নিসংযোগ",
            "source": "UNB", "sourceEvidence": ["UNB"],
            "publishedAt": "2026-11-19T11:20:00+00:00",
        }
        self.assertTrue(news.alert_event_matches(first, followup))


    def test_mps_house_fire_is_not_merged_with_daksu_house_fire(self):
        student_house = {
            "title": "গোপালগঞ্জে ডাকসু সম্পাদকের বাড়িতে আগুন, জড়িতদের বিচার দাবি শিবিরের",
            "summary": "গোপালগঞ্জে ডাকসু সম্পাদকের বাড়িতে আগুন, জড়িতদের বিচার দাবি শিবিরের",
            "source": "Jago News 24", "sourceEvidence": ["Jago News 24"],
            "publishedAt": "2026-11-19T11:00:00+00:00",
        }
        mp_house = {
            "title": "গোপালগঞ্জে থানা ও এমপির বাড়িতে আগুন দিল নিষিদ্ধ ঘোষিত আওয়ামী লীগ | Awami League | Gopalganj | UNB - United News of Bangladesh",
            "summary": "গোপালগঞ্জে থানা ও এমপির বাড়িতে আগুন দিল নিষিদ্ধ ঘোষিত আওয়ামী লীগ | Awami League | Gopalganj | UNB United News of Bangladesh",
            "source": "UNB", "sourceEvidence": ["UNB"],
            "publishedAt": "2026-11-19T11:10:00+00:00",
        }
        self.assertFalse(news.alert_event_matches(student_house, mp_house))


    def test_two_different_house_fires_in_gopalganj_are_not_merged(self):
        mp_house = {
            "title": "গোপালগঞ্জে এমপি সেলিমুজ্জামান সেলিমের বাড়িতে আগুন",
            "summary": "সংসদ সদস্যের বাড়িতে অগ্নিসংযোগ ও ভাঙচুর",
            "source": "Channel 24", "sourceEvidence": ["Channel 24"],
            "publishedAt": "2026-11-19T11:14:00+00:00",
        }
        student_house = {
            "title": "গোপালগঞ্জে ডাকসু নেতা মোসাদ্দিকের বাড়িতে আগুন",
            "summary": "মুকসুদপুরের মোচনা ইউনিয়নের ঘুনসি গ্রামে হামলা ও ভাঙচুর",
            "source": "Bangla Tribune", "sourceEvidence": ["Bangla Tribune"],
            "publishedAt": "2026-11-19T08:10:00+00:00",
        }
        self.assertEqual(news.alert_event_locations(mp_house), {"gopalganj"})
        self.assertEqual(news.alert_event_locations(student_house), {"gopalganj"})
        self.assertFalse(news.alert_event_matches(mp_house, student_house))


    def test_pabna_story_is_never_merged_into_gopalganj_even_with_same_headline(self):
        gopalganj = {
            "title": "গোপালগঞ্জে এমপির বাড়িতে আগুন",
            "summary": "সেলিমুজ্জামানের বাড়িতে অগ্নিসংযোগ",
            "source": "Jago News 24",
            "sourceEvidence": ["Jago News 24"],
            "publishedAt": "2026-11-19T07:35:00+00:00",
        }
        mixed = {
            "title": "গোপালগঞ্জে এমপির বাড়িতে আগুন",
            "summary": "পাবনায় ইউএনও কার্যালয়ে ককটেল বিস্ফোরণ ও বাসে আগুন",
            "source": "Independent Television",
            "sourceEvidence": ["Independent Television"],
            "publishedAt": "2026-11-19T08:00:00+00:00",
        }
        self.assertEqual(news.alert_event_locations(gopalganj), {"gopalganj"})
        self.assertEqual(news.alert_event_locations(mixed), {"gopalganj", "pabna"})
        self.assertFalse(news.alert_event_matches(gopalganj, mixed))

    def test_event_id_stays_stable_when_later_publisher_coverage_arrives(self):
        now = datetime(2026, 11, 19, 13, 0, tzinfo=timezone.utc)
        first = {
            "title": "গোপালগঞ্জে এমপি সেলিমের বাড়িতে ককটেল বিস্ফোরণ ও আগুন",
            "summary": "সেলিমুজ্জামানের বাড়িতে ভাঙচুর ও অগ্নিসংযোগ",
            "source": "Jago News 24", "sourceEvidence": ["Jago News 24"],
            "publishedAt": "2026-11-19T07:35:00+00:00",
            "link": "https://jagonews24.com/example-one",
        }
        second = {
            "title": "গোপালগঞ্জে সেলিমুজ্জামানের বাড়িতে আগুন",
            "summary": "এমপির বাড়িতে হামলা, ভাঙচুর ও অগ্নিসংযোগ",
            "source": "Independent Television", "sourceEvidence": ["Independent Television"],
            "publishedAt": "2026-11-19T11:14:00+00:00",
            "link": "https://independent.example/story-two",
        }
        third = {
            "title": "গোপালগঞ্জে এমপির বাড়িতে অগ্নিসংযোগের খবর",
            "summary": "সেলিমুজ্জামানের বাড়িতে হামলা ও আগুন",
            "source": "Prothom Alo", "sourceEvidence": ["Prothom Alo"],
            "publishedAt": "2026-11-19T12:00:00+00:00",
            "link": "https://prothomalo.example/story-three",
        }
        before = news.build_alert_items([first, second], now=now)
        after = news.build_alert_items([first, second, third], now=now)
        self.assertEqual(len(before), 1)
        self.assertEqual(len(after), 1)
        self.assertEqual(before[0]["alertEventId"], after[0]["alertEventId"])


if __name__ == "__main__":
    unittest.main(verbosity=2)
