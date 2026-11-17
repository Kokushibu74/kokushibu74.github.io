#!/usr/bin/env python3
"""Live validation for newly introduced direct regional RSS feeds.

This is intentionally separate from the offline unit suite. It runs in PR CI,
never writes the alert feed, and fails the PR if a new endpoint is not a usable
publisher RSS/Atom feed with recent entries from the expected publisher.
"""
import importlib.util
import json
import sys
from pathlib import Path
from datetime import datetime, timedelta, timezone

ROOT = Path(__file__).resolve().parents[1]
SPEC = importlib.util.spec_from_file_location("update_news_alerts", ROOT / "scripts" / "update_news_alerts.py")
collector = importlib.util.module_from_spec(SPEC)
SPEC.loader.exec_module(collector)


def main():
    now = datetime.now(timezone.utc)
    results = []
    for source in collector.NEW_DIRECT_SOURCES:
        result = collector.fetch_source(source)
        items = result.get("items") or []
        valid_links = [item for item in items if collector.host_matches(item.get("link"), source[2])]
        dated = [item["published"] for item in valid_links if item.get("published")]
        latest = max(dated) if dated else None
        fresh = bool(latest and latest >= now - timedelta(days=10) and latest <= now + timedelta(minutes=5))
        ok = result.get("status") == "healthy" and bool(valid_links) and fresh
        results.append({
            "name": source[0],
            "domain": source[2],
            "ok": ok,
            "http": result.get("http"),
            "items": len(items),
            "publisherLinks": len(valid_links),
            "latestPublishedAt": latest.isoformat() if latest else None,
            "error": result.get("error"),
        })
    print(json.dumps({"validated": len(results), "passed": sum(row["ok"] for row in results), "sources": results}, ensure_ascii=False, indent=2))
    failed = [row["name"] for row in results if not row["ok"]]
    if failed:
        print("New direct RSS validation failed: " + ", ".join(failed), file=sys.stderr)
        return 1
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
