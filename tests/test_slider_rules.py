import unittest
from datetime import datetime, timezone, timedelta

class SliderRuleTests(unittest.TestCase):
    def setUp(self):
        self.now = datetime(2026, 11, 4, 0, 0, tzinfo=timezone.utc)

    def age_minutes(self, published):
        return (self.now - published).total_seconds() / 60

    def eligible(self, item):
        age = self.age_minutes(item["published"])
        return (-5 <= age < 30 and item["category"] == "Bangladesh"
                and bool(item.get("image") or item.get("video")))

    def latest(self, item):
        age = self.age_minutes(item["published"])
        return -5 <= age < 15

    def test_15m_boundary_latest_removed_after_15(self):
        item = {"published": self.now - timedelta(minutes=15), "category":"Bangladesh", "image":"https://img"}
        self.assertFalse(self.latest(item))
        self.assertTrue(self.eligible(item))

    def test_30m_boundary_removed(self):
        item = {"published": self.now - timedelta(minutes=30), "category":"Bangladesh", "image":"https://img"}
        self.assertFalse(self.eligible(item))

    def test_bangladesh_only(self):
        item = {"published": self.now - timedelta(minutes=5), "category":"World", "image":"https://img"}
        self.assertFalse(self.eligible(item))

    def test_absent_media_rejected(self):
        item = {"published": self.now - timedelta(minutes=5), "category":"Bangladesh"}
        self.assertFalse(self.eligible(item))

    def test_video_only_media_accepted(self):
        item = {"published": self.now - timedelta(minutes=5), "category":"Bangladesh", "video":"https://cdn/video.mp4"}
        self.assertTrue(self.eligible(item))

    def test_future_edge_within_tolerance(self):
        item = {"published": self.now + timedelta(minutes=5), "category":"Bangladesh", "image":"https://img"}
        self.assertTrue(self.eligible(item))

    def test_future_beyond_tolerance_rejected(self):
        item = {"published": self.now + timedelta(minutes=6), "category":"Bangladesh", "image":"https://img"}
        self.assertFalse(self.eligible(item))

if __name__ == "__main__":
    unittest.main(verbosity=2)
