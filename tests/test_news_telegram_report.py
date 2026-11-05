"""Offline tests for detailed Telegram News reports and custom emoji formatting."""
import importlib.util
import unittest
from pathlib import Path

SCRIPT = Path(__file__).resolve().parents[1] / "scripts" / "news_telegram_report.py"
SPEC = importlib.util.spec_from_file_location("news_telegram_report", SCRIPT)
report = importlib.util.module_from_spec(SPEC)
SPEC.loader.exec_module(report)


class NewsTelegramReportTests(unittest.TestCase):
    def test_parses_full_news_run_metrics_without_conflating_update_counts(self):
        logs = """Wrote 8585 headlines; Bangladesh: 5116 from 25 successful RSS queries.
Item changes: added: 57 updated: 24 unchanged: 8504 removed: 0 net: +57 baseline: available previous: 8528
Category breakdown: Bangladesh: 5116 World: 2600 Technology: 869
Feed breakdown: latest_24h: 125 archive: 8460 latest_tag_15m: 2 preview_image_urls: 140 bd_latest_tag_preview_candidates: 1 weather_cards: 12 weather_cards_with_preview: 2
Publisher preview checks: attempted: 14 metadata fetched: 1 unavailable: 13 cached/reused: 0 Google News URLs resolved: 5
Feed validation: PASS; items: 8585 ; invalid: 0 ; duplicates: 0
Feed diagnostics: 25 / 25 successful; failures: none
Weather/disaster image previews enriched: 2 of 12 priority stories.
Publisher preview unavailable: HTTPError https://blocked.example/story
"""
        metrics = report.parse_news_metrics(logs)
        self.assertEqual(metrics["headlines"], 8585)
        self.assertEqual(metrics["bangladesh"], 5116)
        self.assertEqual(metrics["rss_attempted"], 25)
        self.assertEqual(metrics["rss_success"], 25)
        self.assertEqual(metrics["rss_failed"], 0)
        self.assertEqual(metrics["added"], 57)
        self.assertEqual(metrics["updated"], 24)
        self.assertEqual(metrics["unchanged"], 8504)
        self.assertEqual(metrics["removed"], 0)
        self.assertEqual(metrics["net_change"], 57)
        self.assertEqual(metrics["previous_headlines"], 8528)
        self.assertEqual(metrics["latest_24h"], 125)
        self.assertEqual(metrics["archive"], 8460)
        self.assertEqual(metrics["latest_tag_15m"], 2)
        self.assertEqual(metrics["image_preview_urls"], 140)
        self.assertEqual(metrics["bd_slider_preview_candidates"], 1)
        self.assertEqual(metrics["metadata_attempts"], 14)
        self.assertEqual(metrics["metadata_fetched"], 1)
        self.assertEqual(metrics["metadata_unavailable"], 13)
        self.assertEqual(metrics["publisher_urls_resolved"], 5)
        self.assertEqual(metrics["validation"], "PASS")
        self.assertEqual(metrics["publisher_preview_unavailable"], 1)

    def test_legacy_logs_do_not_invent_removed_or_metadata_coverage(self):
        logs = """Wrote 8585 headlines; Bangladesh: 5116 from 25 successful RSS queries.
Item changes: added: 57 updated: 24 unchanged: 8504
Feed diagnostics: 25 / 25 successful; failures: none
Publisher URLs resolved: 5 ; metadata fetched: 1 articles.
"""
        metrics = report.parse_news_metrics(logs)
        self.assertEqual(metrics["added"], 57)
        self.assertIsNone(metrics["removed"])
        self.assertIsNone(metrics["net_change"])
        self.assertIsNone(metrics["metadata_attempts"])

    def test_report_contains_all_sections_and_verified_custom_emoji_ids(self):
        logs = """Wrote 8585 headlines; Bangladesh: 5116 from 25 successful RSS queries.
Item changes: added: 57 updated: 24 unchanged: 8504 removed: 0 net: +57 baseline: available previous: 8528
Category breakdown: Bangladesh: 5116 World: 2600 Technology: 869
Feed breakdown: latest_24h: 125 archive: 8460 latest_tag_15m: 2 preview_image_urls: 140 bd_latest_tag_preview_candidates: 1 weather_cards: 12 weather_cards_with_preview: 2
Publisher preview checks: attempted: 14 metadata fetched: 1 unavailable: 13 cached/reused: 0 Google News URLs resolved: 5
Feed validation: PASS; items: 8585 ; invalid: 0 ; duplicates: 0
Feed diagnostics: 25 / 25 successful; failures: none
"""
        metrics = report.parse_news_metrics(logs)
        context = {
            "conclusion": "success",
            "updated_at": "2026-11-03T17:29:49Z",
            "repository": "Kokushibu74/kokushibu74.github.io",
            "workflow_name": "Refresh live news feed",
            "branch": "main",
            "event_name": "schedule",
            "run_id": "41684695313",
            "run_attempt": "1",
            "run_url": "https://github.com/Kokushibu74/kokushibu74.github.io/actions/runs/41684695313",
        }
        verified = {"rocket": "5445284980978621387", "news": "5433982607035474385", "success": "5427009714745517609"}
        message = report.build_news_report(metrics, context, verified)
        self.assertIn('<tg-emoji emoji-id="5445284980978621387">🚀</tg-emoji>', message)
        self.assertIn('<tg-emoji emoji-id="5433982607035474385">📰</tg-emoji>', message)
        self.assertIn("SUCCESS · WARNINGS", message)
        self.assertIn("NEWS DATABASE", message)
        self.assertIn("LIVE FEED", message)
        self.assertIn("COLLECTION HEALTH", message)
        self.assertIn("Metadata attempts", message)
        self.assertIn("FEED QUALITY", message)
        self.assertIn("RUN DETAILS", message)
        self.assertIn("New fetch success <b>7%</b> (1/14)", message)
        self.assertIn("Removed <b>0</b>", message)
        self.assertIn("Net = Added − Removed", message)
        self.assertIn("Validation <b>PASS</b>", message)
        self.assertIn("Some Weather/Disaster cards do not have a preview image URL.", message)
        self.assertLessEqual(len(message), report.MAX_TELEGRAM_TEXT)


    def test_current_feed_breakdown_alias_and_weather_detail_are_parsed(self):
        logs = """Feed breakdown: latest_24h: 1468 archive: 9333 latest_tag_15m: 15 preview_image_urls: 3049 bd_slider_preview_candidates: 14 weather_cards: 12 weather_cards_with_preview: 10
Weather/disaster previews: candidates: 12 metadata_fetched: 0 cached/reused: 10 publisher_unavailable: 2 RSS_image_fallback: 0 with_preview_total: 10
Publisher preview checks: attempted: 1 metadata fetched: 0 unavailable: 1 cached/reused: 13 cached_success: 9 cached_fallback: 4 Google News URLs resolved: 1
"""
        metrics = report.parse_news_metrics(logs)
        self.assertEqual(metrics["latest_24h"], 1468)
        self.assertEqual(metrics["archive"], 9333)
        self.assertEqual(metrics["latest_tag_15m"], 15)
        self.assertEqual(metrics["image_preview_urls"], 3049)
        self.assertEqual(metrics["bd_slider_preview_candidates"], 14)
        self.assertEqual(metrics["weather_cards"], 12)
        self.assertEqual(metrics["weather_cards_with_preview"], 10)
        self.assertEqual(metrics["weather_enriched"], 0)
        self.assertEqual(metrics["weather_cached"], 10)
        self.assertEqual(metrics["weather_unavailable"], 2)
        self.assertEqual(metrics["metadata_attempts"], 1)
        self.assertEqual(metrics["metadata_cached_success"], 9)
        self.assertEqual(metrics["metadata_cached_fallback"], 4)

    def test_legacy_feed_breakdown_key_remains_supported(self):
        logs = """Feed breakdown: latest_24h: 20 archive: 100 latest_tag_15m: 2 preview_image_urls: 30 bd_latest_tag_preview_candidates: 3 weather_cards: 4 weather_cards_with_preview: 2
"""
        metrics = report.parse_news_metrics(logs)
        self.assertEqual(metrics["bd_slider_preview_candidates"], 3)
        self.assertEqual(metrics["weather_cards"], 4)

    def test_cached_success_counts_toward_overall_metadata_coverage(self):
        logs = """Publisher preview checks: attempted: 1 metadata fetched: 0 unavailable: 1 cached/reused: 13 cached_success: 13 cached_fallback: 0 Google News URLs resolved: 1
"""
        metrics = report.parse_news_metrics(logs)
        message = report.build_news_report(metrics, {"conclusion": "success", "updated_at": "2026-11-05T12:00:00Z"})
        self.assertIn("New fetch success <b>0%</b> (0/1)", message)
        self.assertIn("Overall preview coverage <b>93%</b> (13/14)", message)
        self.assertNotIn("Publisher metadata coverage is low", message)

    def test_report_uses_html_escaping_for_dynamic_values(self):
        metrics = report.parse_news_metrics("")
        context = {
            "conclusion": "success",
            "updated_at": "2026-11-03T17:29:49Z",
            "repository": "Kokushibu74/<repo>",
            "workflow_name": "Refresh <news>",
            "branch": "main",
            "event_name": "schedule",
            "run_id": "123",
            "run_attempt": "1",
            "run_url": "https://github.com/Kokushibu74/kokushibu74.github.io/actions/runs/123",
        }
        message = report.build_news_report(metrics, context, {})
        self.assertIn("Kokushibu74/&lt;repo&gt;", message)
        self.assertIn("Refresh &lt;news&gt;", message)
        self.assertNotIn("<news>", message)




    def test_zero_metadata_attempts_are_reported_as_cached_not_missing(self):
        logs = """Publisher preview checks: attempted: 0 metadata fetched: 0 unavailable: 0 cached/reused: 14 Google News URLs resolved: 0
"""
        metrics = report.parse_news_metrics(logs)
        context = {
            "conclusion": "success",
            "updated_at": "2026-11-03T18:13:56Z",
            "repository": "Kokushibu74/kokushibu74.github.io",
            "workflow_name": "Refresh live news feed",
            "branch": "main",
            "event_name": "schedule",
            "run_id": "41691677905",
            "run_attempt": "1",
            "run_url": "https://github.com/Kokushibu74/kokushibu74.github.io/actions/runs/41691677905",
        }
        message = report.build_news_report(metrics, context, {})
        self.assertIn("N/A</b> · No new requests", message)
        self.assertIn("cached <b>14</b>", message)
        self.assertNotIn("Not reported (attempt count unavailable)", message)

    def test_scheduled_success_is_suppressed_after_recent_successful_manual_refresh(self):
        context = {
            "workflow_name": "Refresh live news feed",
            "event_name": "schedule",
            "conclusion": "success",
            "run_id": "scheduled-2",
            "workflow_path": ".github/workflows/update-news.yml",
            "branch": "main",
            "repository": "Kokushibu74/kokushibu74.github.io",
            "updated_at": "2026-11-05T06:37:10Z",
        }
        captured = {}

        def fake_get(url, _token):
            captured["url"] = url
            return b'{"workflow_runs":[{"id":41981409979,"event":"push","conclusion":"success","updated_at":"2026-11-05T06:36:04Z"}]}'

        self.assertTrue(report.should_suppress_scheduled_success(context, "fake-token", fetcher=fake_get))
        self.assertIn("per_page=100", captured["url"])
        self.assertIn("update-news.yml", captured["url"])

    def test_manual_run_older_than_window_does_not_suppress(self):
        context = {
            "workflow_name": "Refresh live news feed",
            "event_name": "schedule",
            "conclusion": "success",
            "run_id": "scheduled-2",
            "workflow_path": ".github/workflows/update-news.yml",
            "branch": "main",
            "repository": "Kokushibu74/kokushibu74.github.io",
            "updated_at": "2026-11-05T06:50:00Z",
        }
        def fake_get(_url, _token):
            return b'{"workflow_runs":[{"id":1,"event":"push","conclusion":"success","updated_at":"2026-11-05T06:34:59Z"}]}'
        self.assertFalse(report.should_suppress_scheduled_success(context, "fake-token", fetcher=fake_get))

    def test_failed_manual_run_does_not_suppress_successful_schedule(self):
        context = {
            "workflow_name": "Refresh live news feed",
            "event_name": "schedule",
            "conclusion": "success",
            "run_id": "scheduled-2",
            "workflow_path": ".github/workflows/update-news.yml",
            "branch": "main",
            "repository": "Kokushibu74/kokushibu74.github.io",
            "updated_at": "2026-11-05T06:37:10Z",
        }
        def fake_get(_url, _token):
            return b'{"workflow_runs":[{"id":1,"event":"push","conclusion":"failure","updated_at":"2026-11-05T06:36:04Z"}]}'
        self.assertFalse(report.should_suppress_scheduled_success(context, "fake-token", fetcher=fake_get))

    def test_failures_and_manual_reports_are_never_suppressed(self):
        base = {
            "workflow_name": "Refresh live news feed",
            "run_id": "123",
            "workflow_path": ".github/workflows/update-news.yml",
            "branch": "main",
            "repository": "Kokushibu74/kokushibu74.github.io",
            "updated_at": "2026-11-05T06:37:10Z",
        }
        def unexpected_get(_url, _token):
            raise AssertionError("API should not be called for excluded events")
        for event, conclusion in (("workflow_dispatch", "success"), ("schedule", "failure")):
            context = dict(base, event_name=event, conclusion=conclusion)
            self.assertFalse(report.should_suppress_scheduled_success(context, "fake-token", fetcher=unexpected_get))

    def test_github_api_error_fails_open_and_keeps_report(self):
        context = {
            "workflow_name": "Refresh live news feed",
            "event_name": "schedule",
            "conclusion": "success",
            "run_id": "scheduled-2",
            "workflow_path": ".github/workflows/update-news.yml",
            "branch": "main",
            "repository": "Kokushibu74/kokushibu74.github.io",
            "updated_at": "2026-11-05T06:37:10Z",
        }
        def broken_get(_url, _token):
            raise OSError("offline")
        self.assertFalse(report.should_suppress_scheduled_success(context, "fake-token", fetcher=broken_get))


if __name__ == "__main__":
    unittest.main()
