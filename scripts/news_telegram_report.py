#!/usr/bin/env python3
"""Build and deliver detailed, evidence-based Telegram reports for GitHub workflow runs."""
import html
import io
import json
import os
import re
import urllib.error
import urllib.parse
import urllib.request
import zipfile
from datetime import datetime
from urllib.parse import urlparse
from zoneinfo import ZoneInfo

MAX_TELEGRAM_TEXT = 3900
CUSTOM_EMOJI = {
    # Curated Telegram custom-emoji IDs; every ID is checked with getCustomEmojiStickers
    # and only animated/video stickers are used. Unicode remains the delivery fallback.
    "rocket": ("5445284980978621387", "🚀"),
    "news": ("5433982607035474385", "📰"),
    "chart": ("5431577498364158238", "📊"),
    "trend": ("5373001317042101552", "📈"),
    "search": ("5188311512791393083", "🔎"),
    "refresh": ("5264727218734524899", "🔄"),
    "success": ("5427009714745517609", "✅"),
}
BDT = ZoneInfo("Asia/Dhaka")


def scrub(value, limit=240):
    value = str(value or "")
    value = re.sub(r"(?i)(authorization|token|secret|password|api[_-]?key)(\s*[:=]\s*)([^\s,;]+)", r"\1\2[REDACTED]", value)
    value = re.sub(r"(?i)https?://[^\s]+", lambda m: re.sub(r"[?#].*$", "", m.group(0)), value)
    value = re.sub(r"gh[pousr]_[A-Za-z0-9_]{20,}|github_pat_[A-Za-z0-9_]{20,}", "[REDACTED TOKEN]", value)
    value = re.sub(r"\b[0-9]{6,}:[A-Za-z0-9_-]{25,}\b", "[REDACTED BOT TOKEN]", value)
    value = re.sub(r"[\x00-\x08\x0b\x0c\x0e-\x1f]", " ", value)
    return value[:limit]


def github_get(url, token):
    request = urllib.request.Request(url, headers={
        "Authorization": "Bearer " + token,
        "Accept": "application/vnd.github+json",
        "X-GitHub-Api-Version": "2022-11-28",
    })
    with urllib.request.urlopen(request, timeout=25) as response:
        return response.read()


def telegram_call(token, method, payload):
    request = urllib.request.Request(
        "https://api.telegram.org/bot" + token + "/" + method,
        data=json.dumps(payload, ensure_ascii=False).encode("utf-8"),
        headers={"Content-Type": "application/json"},
        method="POST",
    )
    try:
        with urllib.request.urlopen(request, timeout=25) as response:
            raw = response.read()
    except urllib.error.HTTPError as exc:
        raw = exc.read()
        try:
            data = json.loads(raw.decode("utf-8", "replace"))
            data.setdefault("http_status", exc.code)
            return data
        except Exception:
            return {"ok": False, "http_status": exc.code, "description": "Telegram HTTP " + str(exc.code)}
    try:
        return json.loads(raw.decode("utf-8"))
    except Exception:
        return {"ok": False, "description": "Telegram returned an invalid JSON response"}


def verified_animated_custom_emojis(token):
    ids = [entry[0] for entry in CUSTOM_EMOJI.values()]
    try:
        result = telegram_call(token, "getCustomEmojiStickers", {"custom_emoji_ids": ids})
        if not result.get("ok"):
            return {}, scrub(result.get("description") or "Custom emoji lookup unavailable", 140)
        valid_ids = {
            str(sticker.get("custom_emoji_id"))
            for sticker in result.get("result", [])
            if sticker.get("custom_emoji_id")
            and (sticker.get("is_animated") is True or sticker.get("is_video") is True)
        }
        verified = {
            name: custom_id
            for name, (custom_id, _fallback) in CUSTOM_EMOJI.items()
            if custom_id in valid_ids
        }
        return verified, ""
    except Exception as exc:
        return {}, scrub(type(exc).__name__ + ": " + str(exc), 140)


def emoji(name, verified_ids):
    custom_id, fallback = CUSTOM_EMOJI[name]
    if verified_ids and name in verified_ids:
        return '<tg-emoji emoji-id="' + verified_ids[name] + '">' + fallback + "</tg-emoji>"
    return fallback


def parse_news_metrics(log_text):
    metrics = {
        "headlines": None, "bangladesh": None, "rss_success": None,
        "rss_attempted": None, "rss_failed": None, "rss_failure_details": [],
        "added": None, "updated": None, "unchanged": None, "removed": None,
        "net_change": None, "previous_headlines": None, "baseline": None,
        "latest_24h": None, "archive": None, "latest_tag_15m": None,
        "image_preview_urls": None, "bd_slider_preview_candidates": None,
        "weather_cards": None, "weather_cards_with_preview": None,
        "world": None, "technology": None,
        "publisher_urls_resolved": None, "metadata_attempts": None,
        "metadata_fetched": None, "metadata_unavailable": None, "metadata_cached": None,
        "weather_enriched": None, "weather_priority": None,
        "validation": None, "invalid_items": None, "duplicate_items": None,
        "publisher_preview_unavailable": 0, "publisher_unavailable_hosts": [],
    }
    headline = re.search(r"Wrote\s+([\d,]+)\s+headlines;\s*Bangladesh:\s*([\d,]+)\s+from\s+(\d+)\s+successful RSS queries", log_text)
    if headline:
        metrics["headlines"] = int(headline.group(1).replace(",", ""))
        metrics["bangladesh"] = int(headline.group(2).replace(",", ""))
        metrics["rss_success"] = int(headline.group(3))

    changes = re.search(r"Item changes:\s*added:\s*(\d+)\s+updated:\s*(\d+)\s+unchanged:\s*(\d+)(?:\s+removed:\s*(\d+|not_available))?(?:\s+net:\s*([+-]?\d+|not_available))?(?:\s+baseline:\s*(available|establishing))?(?:\s+previous:\s*(\d+|not_available))?", log_text)
    if changes:
        metrics["added"], metrics["updated"], metrics["unchanged"] = map(int, changes.group(1, 2, 3))
        if changes.group(4) and changes.group(4) != "not_available":
            metrics["removed"] = int(changes.group(4))
        if changes.group(5) and changes.group(5) != "not_available":
            metrics["net_change"] = int(changes.group(5))
        metrics["baseline"] = changes.group(6)
        if changes.group(7) and changes.group(7) != "not_available":
            metrics["previous_headlines"] = int(changes.group(7))

    diagnostics = re.search(r"Feed diagnostics:\s*(\d+)\s*/\s*(\d+)\s+successful;\s*failures:\s*(.*)", log_text)
    if diagnostics:
        metrics["rss_success"] = int(diagnostics.group(1))
        metrics["rss_attempted"] = int(diagnostics.group(2))
        metrics["rss_failed"] = max(0, metrics["rss_attempted"] - metrics["rss_success"])
        raw_failures = diagnostics.group(3).strip()
        if raw_failures.lower() not in ("", "none", "no failures"):
            metrics["rss_failure_details"] = [scrub(x.strip(), 180) for x in raw_failures.split(" | ") if x.strip()][:8]

    breakdown = re.search(
        r"Feed breakdown:\s*latest_24h:\s*(\d+)\s+archive:\s*(\d+)\s+latest_tag_15m:\s*(\d+)\s+preview_image_urls:\s*(\d+)\s+bd_latest_tag_preview_candidates:\s*(\d+)\s+weather_cards:\s*(\d+)\s+weather_cards_with_preview:\s*(\d+)",
        log_text,
    )
    if breakdown:
        keys = ("latest_24h", "archive", "latest_tag_15m", "image_preview_urls",
                "bd_slider_preview_candidates", "weather_cards", "weather_cards_with_preview")
        for key, value in zip(keys, breakdown.groups()):
            metrics[key] = int(value)

    categories = re.search(r"Category breakdown:\s*Bangladesh:\s*(\d+)\s+World:\s*(\d+)\s+Technology:\s*(\d+)", log_text)
    if categories:
        metrics["bangladesh"], metrics["world"], metrics["technology"] = map(int, categories.groups())

    checks = re.search(
        r"Publisher preview checks:\s*attempted:\s*(\d+)\s+metadata fetched:\s*(\d+)\s+unavailable:\s*(\d+)\s+cached/reused:\s*(\d+)\s+Google News URLs resolved:\s*(\d+)",
        log_text,
    )
    if checks:
        (metrics["metadata_attempts"], metrics["metadata_fetched"],
         metrics["metadata_unavailable"], metrics["metadata_cached"],
         metrics["publisher_urls_resolved"]) = map(int, checks.groups())
    else:
        legacy = re.search(r"Publisher URLs resolved:\s*(\d+)\s*;\s*metadata fetched:\s*(\d+)\s+articles", log_text)
        if legacy:
            metrics["publisher_urls_resolved"], metrics["metadata_fetched"] = map(int, legacy.groups())

    weather = re.search(r"Weather/disaster image previews enriched:\s*(\d+)\s+of\s+(\d+)\s+priority stories", log_text)
    if weather:
        metrics["weather_enriched"], metrics["weather_priority"] = map(int, weather.groups())

    validation = re.search(r"Feed validation:\s*(PASS|FAIL);\s*items:\s*(\d+)\s*;\s*invalid:\s*(\d+)\s*;\s*duplicates:\s*(\d+)", log_text, re.I)
    if validation:
        metrics["validation"] = validation.group(1).upper()
        metrics["invalid_items"] = int(validation.group(3))
        metrics["duplicate_items"] = int(validation.group(4))

    unavailable_lines = re.findall(r"Publisher preview unavailable:\s*([^\r\n]+)", log_text)
    metrics["publisher_preview_unavailable"] = len(unavailable_lines)
    hosts = []
    for line in unavailable_lines:
        match = re.search(r"https?://([^/\s]+)", line)
        if match:
            host = match.group(1).lower()
            if host not in hosts:
                hosts.append(host)
    metrics["publisher_unavailable_hosts"] = hosts[:5]
    return metrics


def read_run_logs(repo, run_id, token):
    base = "https://api.github.com/repos/" + repo + "/actions/runs/" + str(run_id)
    jobs = json.loads(github_get(base + "/jobs?per_page=100", token).decode("utf-8"))
    failed = []
    for job in jobs.get("jobs", []):
        if job.get("conclusion") in ("failure", "cancelled", "timed_out", "action_required"):
            bad_steps = [step for step in job.get("steps", []) if step.get("conclusion") in ("failure", "cancelled", "timed_out")]
            failed.append({
                "job": scrub(job.get("name") or "Unknown job", 120),
                "step": scrub(bad_steps[-1].get("name"), 120) if bad_steps else "",
                "conclusion": scrub(job.get("conclusion"), 40),
            })
    try:
        archive = github_get(base + "/logs", token)
        with zipfile.ZipFile(io.BytesIO(archive)) as zf:
            chunks = []
            for name in zf.namelist():
                if name.lower().endswith(".txt"):
                    chunks.append(zf.read(name).decode("utf-8", "replace"))
            log_text = "\n".join(chunks)
    except Exception as exc:
        log_text = ""
        if not failed:
            failed.append({"job": "Log archive", "step": "", "conclusion": scrub(type(exc).__name__, 40)})
    excerpts = []
    for line in log_text.splitlines():
        if re.search(r"(?i)error:|##\[error\]|traceback|exception:|fatal:|permission denied|failed to push|process completed with exit code|http error", line):
            if re.search(r"(?i)environment variables|request body|response body|payload", line):
                continue
            clean = scrub(line.strip(), 220)
            if clean and clean not in excerpts:
                excerpts.append(clean)
        if len(excerpts) >= 5:
            break
    return log_text, failed, excerpts


def number(value):
    return "Not reported" if value is None else f"{int(value):,}"


def signed(value):
    if value is None:
        return "Not reported"
    return ("+" if value > 0 else "") + f"{value:,}"


def build_news_report(metrics, context, verified_ids=None):
    verified_ids = verified_ids or {}
    conclusion = str(context.get("conclusion") or "unknown").lower()
    warnings = []
    if metrics.get("rss_failed") not in (None, 0):
        warnings.append("Some RSS/feed queries failed.")
    attempts = metrics.get("metadata_attempts")
    fetched = metrics.get("metadata_fetched")
    if attempts and fetched is not None and fetched / max(1, attempts) < 0.5:
        warnings.append("Publisher metadata extraction coverage is low.")
    if metrics.get("validation") == "FAIL":
        warnings.append("Generated feed validation failed.")
    weather_total = metrics.get("weather_cards")
    weather_with_preview = metrics.get("weather_cards_with_preview")
    if weather_total and weather_with_preview is not None and weather_with_preview < weather_total:
        warnings.append("Some Weather/Disaster cards do not have a preview image URL.")
    if metrics.get("baseline") == "establishing":
        warnings.append("The comparison baseline is being established.")
    if conclusion != "success":
        status = conclusion.upper()
    elif warnings:
        status = "SUCCESS WITH WARNINGS"
    else:
        status = "SUCCESS"

    stamp_value = context.get("updated_at") or context.get("created_at") or ""
    try:
        stamp = datetime.fromisoformat(stamp_value.replace("Z", "+00:00")).astimezone(BDT).strftime("%d %b %Y · %I:%M:%S %p BDT")
    except Exception:
        stamp = datetime.now(BDT).strftime("%d %b %Y · %I:%M:%S %p BDT")

    repo = html.escape(str(context.get("repository") or "Unknown repository"))
    workflow = html.escape(scrub(context.get("workflow_name") or "Unknown workflow", 120))
    branch = html.escape(scrub(context.get("branch") or "unknown", 80))
    run_id = html.escape(str(context.get("run_id") or "unknown"))
    attempt = html.escape(str(context.get("run_attempt") or "1"))
    event = html.escape(scrub(context.get("event_name") or "unknown", 40))
    run_url = str(context.get("run_url") or "")
    if not run_url.startswith("https://github.com/"):
        run_url = "https://github.com/" + str(context.get("repository") or "") + "/actions"
    run_url = html.escape(run_url, quote=True)

    lines = [
        f'{emoji("rocket", verified_ids)} <b>KOKUSHIBU74 · NEWS INTELLIGENCE</b>',
        f'{emoji("success", verified_ids)} <b>NEWS REFRESH — {html.escape(status)}</b>',
        f'📅 {html.escape(stamp)}',
        '━━━━━━━━━━━━━━━━━━━━━━',
        f'{emoji("news", verified_ids)} <b>01 · NEWS DATABASE</b>',
        f'🗞 <b>Total stored headlines:</b> {number(metrics.get("headlines"))}',
        f'🇧🇩 Bangladesh: <b>{number(metrics.get("bangladesh"))}</b>',
    ]
    if metrics.get("world") is not None and metrics.get("technology") is not None:
        lines.extend([
            f'🌍 World: <b>{number(metrics.get("world"))}</b>',
            f'💻 Technology: <b>{number(metrics.get("technology"))}</b>',
        ])
    elif metrics.get("headlines") is not None and metrics.get("bangladesh") is not None:
        lines.append(f'🌐 World + Technology: <b>{number(metrics["headlines"] - metrics["bangladesh"])}</b>')
    lines.extend([
        '<i>Main News Feed: Latest 24 hours + Archive (up to 90-day retention). Weather/Disaster cards are separate.</i>',
        '━━━━━━━━━━━━━━━━━━━━━━',
        f'{emoji("trend", verified_ids)} <b>02 · NEWS CHANGE TRACKER</b>',
    ])
    if metrics.get("baseline") == "establishing":
        lines.append('🧭 Comparison baseline: <b>Establishing — first comparable snapshot pending</b>')
        lines.append('🆕 New / 🔄 Updated / 🗑 Removed / 📊 Net change: <b>Not comparable yet</b>')
    else:
        lines.extend([
            f'📦 Previous stored headlines: <b>{number(metrics.get("previous_headlines"))}</b>',
            f'🆕 New headlines added: <b>{number(metrics.get("added"))}</b>',
            f'🔄 Updated headlines: <b>{number(metrics.get("updated"))}</b>',
            f'➖ Unchanged headlines: <b>{number(metrics.get("unchanged"))}</b>',
            f'🗑 Removed from feed: <b>{number(metrics.get("removed"))}</b>',
            f'📊 Net feed change: <b>{signed(metrics.get("net_change"))}</b>',
        ])
    lines.append('<i>Net change = New − Removed. Removed includes stories leaving the 90-day retention window; Updated means tracked fields changed for an existing headline.</i>')
    lines.extend([
        '━━━━━━━━━━━━━━━━━━━━━━',
        f'{emoji("chart", verified_ids)} <b>03 · LIVE FEED & ARCHIVE</b>',
        f'🕓 Published in last 24 hours: <b>{number(metrics.get("latest_24h"))}</b>',
        f'🗄 Archived (older than 24h): <b>{number(metrics.get("archive"))}</b>',
        f'🏷 15-minute Latest-tag candidates: <b>{number(metrics.get("latest_tag_15m"))}</b>',
        f'🖼 Image preview URLs available: <b>{number(metrics.get("image_preview_urls"))}</b>',
        f'🇧🇩 Bangladesh 15-minute slider candidates with image URL: <b>{number(metrics.get("bd_slider_preview_candidates"))}</b>',
        f'🌦 Weather/Disaster cards (separate): <b>{number(metrics.get("weather_cards"))}</b> · with preview: <b>{number(metrics.get("weather_cards_with_preview"))}</b>',
        '━━━━━━━━━━━━━━━━━━━━━━',
        f'{emoji("refresh", verified_ids)} <b>04 · RSS COLLECTION PERFORMANCE</b>',
        f'📡 Feed/query attempts: <b>{number(metrics.get("rss_attempted"))}</b>',
        f'🟢 Successful: <b>{number(metrics.get("rss_success"))}</b> · 🔴 Failed: <b>{number(metrics.get("rss_failed"))}</b>',
    ])
    for detail in metrics.get("rss_failure_details", [])[:3]:
        lines.append('⚠️ ' + html.escape(detail))
    lines.extend([
        '━━━━━━━━━━━━━━━━━━━━━━',
        f'{emoji("search", verified_ids)} <b>05 · PUBLISHER METADATA</b>',
        f'🔗 Google News publisher URLs resolved: <b>{number(metrics.get("publisher_urls_resolved"))}</b>',
        f'🔎 Metadata extraction attempts: <b>{number(metrics.get("metadata_attempts"))}</b>',
        f'📄 Metadata successfully extracted: <b>{number(metrics.get("metadata_fetched"))}</b>',
        f'⚠️ Metadata unavailable: <b>{number(metrics.get("metadata_unavailable"))}</b> · Cached/reused: <b>{number(metrics.get("metadata_cached"))}</b>',
    ])
    if attempts is not None and attempts > 0 and fetched is not None:
        coverage = round(100 * fetched / max(1, attempts))
        lines.append(f'📊 Extraction success rate: <b>{coverage}%</b> ({fetched}/{attempts})')
    elif attempts == 0:
        cached_count = metrics.get("metadata_cached") or 0
        lines.append(f'📊 Extraction success rate: <b>N/A — no new metadata requests</b> · Cached/reused: <b>{cached_count}</b>')
    else:
        lines.append('📊 Extraction success rate: <b>Not reported (attempt count unavailable)</b>')
    if metrics.get("publisher_preview_unavailable"):
        hosts = ", ".join(metrics.get("publisher_unavailable_hosts") or [])
        lines.append(f'🌐 Publisher preview fetch unavailable: <b>{metrics["publisher_preview_unavailable"]}</b>' + (f' · {html.escape(hosts)}' if hosts else ''))
    if metrics.get("weather_enriched") is not None:
        lines.append(f'🌦 New Weather preview metadata fetched: <b>{number(metrics["weather_enriched"])}/{number(metrics.get("weather_priority"))}</b> priority candidates (existing preview URLs counted above)')
    lines.extend([
        '━━━━━━━━━━━━━━━━━━━━━━',
        '🧪 <b>06 · FEED QUALITY & VALIDATION</b>',
        f'🧾 JSON/feed validation: <b>{html.escape(metrics.get("validation") or "Not reported")}</b>',
        f'🚫 Invalid items: <b>{number(metrics.get("invalid_items"))}</b> · Duplicate headlines: <b>{number(metrics.get("duplicate_items"))}</b>',
    ])
    if metrics.get("validation") == "PASS":
        lines.append('✅ Required fields and category structure: <b>Passed</b>')
    else:
        lines.append('ℹ️ Validation detail: <b>Only checks reported by the generator are shown.</b>')
    lines.extend([
        '━━━━━━━━━━━━━━━━━━━━━━',
        '⚠️ <b>07 · ISSUES & RECOMMENDED ACTIONS</b>',
    ])
    if warnings:
        for index, warning in enumerate(warnings[:4], 1):
            lines.append(f'{index}. {html.escape(warning)}')
        if attempts and fetched is not None and fetched < attempts:
            lines.append('💡 Review publishers that block preview requests; preserve RSS title/summary/image as fallback.')
        if metrics.get("rss_failure_details"):
            lines.append('💡 Inspect failed feeds and retry only affected sources on the next scheduled refresh.')
        if metrics.get("baseline") == "establishing":
            lines.append('💡 The next successful refresh will provide the first reliable change comparison.')
        if weather_total and weather_with_preview is not None and weather_with_preview < weather_total:
            missing_previews = weather_total - weather_with_preview
            lines.append(f'💡 Review {missing_previews} Weather/Disaster cards without preview URLs; retain RSS image fallbacks where available.')
    else:
        lines.append('✅ No collection or feed-validation issues were reported in this run.')
    lines.extend([
        '━━━━━━━━━━━━━━━━━━━━━━',
        '⚙️ <b>08 · GITHUB AUTOMATION DETAILS</b>',
        f'📁 Repository: <code>{repo}</code>',
        f'🔄 Workflow: <code>{workflow}</code>',
        f'🌿 Branch: <code>{branch}</code> · Event: <code>{event}</code>',
        f'🆔 Run ID: <code>{run_id}</code> · Attempt: <code>{attempt}</code>',
        f'🔗 <a href="{run_url}">OPEN GITHUB ACTION RUN</a>',
        '━━━━━━━━━━━━━━━━━━━━━━',
        '<b>KOKUSHIBU74 · AUTOMATED NEWS MONITORING</b>',
    ])
    message = "\n".join(lines)
    plain_length = len(re.sub(r"<[^>]+>", "", message))
    if plain_length > MAX_TELEGRAM_TEXT:
        # Keep the complete report structure; only trim optional source-host details.
        lines = [line for line in lines if not line.startswith("🌐 Publisher preview fetch unavailable:")]
        message = "\n".join(lines)
        plain_length = len(re.sub(r"<[^>]+>", "", message))
    if plain_length > MAX_TELEGRAM_TEXT:
        raise ValueError("Telegram report exceeds the safe message length: " + str(plain_length))
    return message


def build_failure_report(context, failed, excerpts):
    stamp_value = context.get("updated_at") or context.get("created_at") or ""
    try:
        stamp = datetime.fromisoformat(stamp_value.replace("Z", "+00:00")).astimezone(BDT).strftime("%d %b %Y · %I:%M:%S %p BDT")
    except Exception:
        stamp = datetime.now(BDT).strftime("%d %b %Y · %I:%M:%S %p BDT")
    repo = html.escape(str(context.get("repository") or "Unknown repository"))
    workflow = html.escape(scrub(context.get("workflow_name") or "Unknown workflow", 120))
    run_id = html.escape(str(context.get("run_id") or "unknown"))
    attempt = html.escape(str(context.get("run_attempt") or "1"))
    branch = html.escape(scrub(context.get("branch") or "unknown", 80))
    run_url = str(context.get("run_url") or "")
    if not run_url.startswith("https://github.com/"):
        run_url = "https://github.com/" + str(context.get("repository") or "") + "/actions"
    run_url = html.escape(run_url, quote=True)
    lines = [
        '🚨 <b>KOKUSHIBU74 · WORKFLOW ALERT</b>',
        '🔴 <b>' + html.escape(str(context.get("conclusion") or "FAILED").upper()) + '</b>',
        '📅 ' + html.escape(stamp),
        '━━━━━━━━━━━━━━━━━━━━━━',
        '⚙️ <b>WORKFLOW DETAILS</b>',
        '📁 Repository: <code>' + repo + '</code>',
        '🔄 Workflow: <code>' + workflow + '</code>',
        '🌿 Branch: <code>' + branch + '</code>',
        '🆔 Run ID: <code>' + run_id + '</code> · Attempt: <code>' + attempt + '</code>',
        '',
        '<b>Failed jobs / steps</b>',
    ]
    if failed:
        for item in failed[:6]:
            suffix = ' → ' + html.escape(item["step"]) if item.get("step") else ""
            lines.append('• ' + html.escape(item["job"]) + suffix + ' (' + html.escape(item["conclusion"]) + ')')
    else:
        lines.append('Failure details were not returned by the Jobs API.')
    if excerpts:
        lines.extend(['', '<b>Sanitized log excerpts</b>'])
        lines.extend('• ' + html.escape(item) for item in excerpts[:4])
    lines.extend(['', f'🔗 <a href="{run_url}">OPEN GITHUB ACTION RUN</a>'])
    message = "\n".join(lines)
    if len(re.sub(r"<[^>]+>", "", message)) > MAX_TELEGRAM_TEXT:
        message = message[:MAX_TELEGRAM_TEXT]
    return message


def send_telegram_report(token, chat_id, message, verified_ids=None, lookup_error=""):
    verified_ids = verified_ids or {}
    custom_count = len(verified_ids)
    payload = {
        "chat_id": chat_id,
        "text": message if custom_count else re.sub(r'<tg-emoji[^>]*>(.*?)</tg-emoji>', r'\1', message),
        "parse_mode": "HTML",
        "disable_web_page_preview": True,
    }
    result = telegram_call(token, "sendMessage", payload)
    custom_emoji_used = bool(custom_count)
    if not result.get("ok") and custom_count:
        # Telegram may reject custom emoji when the bot owner lacks the required Premium entitlement.
        fallback = re.sub(r'<tg-emoji[^>]*>(.*?)</tg-emoji>', r'\1', message)
        result = telegram_call(token, "sendMessage", {
            "chat_id": chat_id, "text": fallback, "parse_mode": "HTML",
            "disable_web_page_preview": True,
        })
        if result.get("ok"):
            custom_emoji_used = False
            print("Telegram custom emoji send was rejected; report delivered with Unicode fallback.")
    if not result.get("ok"):
        raise RuntimeError("Telegram sendMessage failed: " + scrub(result.get("description") or "unknown Telegram error", 180))
    message_id = (result.get("result") or {}).get("message_id")
    emoji_status = (str(custom_count) + " animated custom emoji IDs accepted") if custom_emoji_used else "Unicode emoji fallback"
    print("Telegram report delivered. " + emoji_status + "; message_id: " + str(message_id or "not returned"))
    if lookup_error:
        print("Custom emoji lookup note: " + lookup_error)


def main():
    env = os.environ
    required = ("GH_TOKEN", "TELEGRAM_BOT_TOKEN", "TELEGRAM_CHAT_ID", "RUN_ID", "REPOSITORY")
    missing = [key for key in required if not env.get(key)]
    if missing:
        raise RuntimeError("Missing required workflow environment: " + ", ".join(missing))
    context = {
        "run_id": env.get("RUN_ID"),
        "run_url": env.get("RUN_URL"),
        "workflow_name": env.get("WORKFLOW_NAME"),
        "workflow_path": env.get("WORKFLOW_PATH"),
        "branch": env.get("BRANCH"),
        "event_name": env.get("EVENT_NAME"),
        "conclusion": env.get("CONCLUSION"),
        "run_attempt": env.get("RUN_ATTEMPT"),
        "created_at": env.get("CREATED_AT"),
        "updated_at": env.get("UPDATED_AT"),
        "repository": env.get("REPOSITORY"),
    }
    log_text, failed, excerpts = read_run_logs(context["repository"], context["run_id"], env["GH_TOKEN"])
    if context["workflow_name"] == "Refresh live news feed" and str(context["conclusion"]).lower() == "success":
        metrics = parse_news_metrics(log_text)
        verified_ids, lookup_error = verified_animated_custom_emojis(env["TELEGRAM_BOT_TOKEN"])
        message = build_news_report(metrics, context, verified_ids)
        send_telegram_report(env["TELEGRAM_BOT_TOKEN"], env["TELEGRAM_CHAT_ID"], message, verified_ids, lookup_error)
        print("News report metrics parsed; publisher metadata and RSS diagnostics included where available.")
        if lookup_error:
            print("Custom emoji lookup fallback: " + lookup_error)
    else:
        message = build_failure_report(context, failed, excerpts)
        send_telegram_report(env["TELEGRAM_BOT_TOKEN"], env["TELEGRAM_CHAT_ID"], message)


if __name__ == "__main__":
    main()
