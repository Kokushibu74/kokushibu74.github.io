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
from datetime import datetime, timedelta
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


def should_suppress_scheduled_success(context, token, window_minutes=15, fetcher=None):
    """Suppress a scheduled success report after a recent successful push/manual refresh.
    A scheduled refresh still runs, but its redundant Telegram report is omitted.
    API errors fail open so genuine alerts are not lost.
    """
    if (
        str(context.get("workflow_name") or "") != "Refresh live news feed"
        or str(context.get("event_name") or "").lower() != "schedule"
        or str(context.get("conclusion") or "").lower() != "success"
    ):
        return False

    try:
        scheduled_completed = datetime.fromisoformat(
            str(context.get("updated_at") or context.get("created_at") or "").replace("Z", "+00:00")
        )
        workflow_file = os.path.basename(
            str(context.get("workflow_path") or ".github/workflows/update-news.yml")
        )
        branch = urllib.parse.quote(str(context.get("branch") or "main"), safe="")
        url = (
            "https://api.github.com/repos/" + str(context.get("repository") or "")
            + "/actions/workflows/" + urllib.parse.quote(workflow_file, safe="")
            + "/runs?branch=" + branch + "&per_page=100"
        )
        get_bytes = fetcher or github_get
        payload = json.loads(get_bytes(url, token).decode("utf-8"))
        current_run_id = str(context.get("run_id") or "")
        window = timedelta(minutes=max(0, int(window_minutes)))

        for run in payload.get("workflow_runs", []):
            if str(run.get("id") or "") == current_run_id:
                continue
            if str(run.get("event") or "").lower() not in ("push", "workflow_dispatch"):
                continue
            if str(run.get("conclusion") or "").lower() != "success":
                continue
            completed_at = run.get("updated_at")
            if not completed_at:
                continue
            prior_completed = datetime.fromisoformat(str(completed_at).replace("Z", "+00:00"))
            age = scheduled_completed - prior_completed
            if timedelta(0) <= age <= window:
                return True
        return False
    except Exception as exc:
        # Fail open: a GitHub API/metadata issue must never hide a workflow alert.
        print("Duplicate-report check unavailable; sending report (fail-open): " + scrub(type(exc).__name__, 80))
        return False

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
        "metadata_cached_success": None, "metadata_cached_fallback": None,
        "weather_enriched": None, "weather_priority": None,
        "weather_cached": None, "weather_unavailable": None, "weather_rss_fallback": None,
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
        r"Feed breakdown:\s*latest_24h:\s*(\d+)\s+archive:\s*(\d+)\s+latest_tag_15m:\s*(\d+)\s+preview_image_urls:\s*(\d+)\s+(?:bd_slider_preview_candidates|bd_latest_tag_preview_candidates):\s*(\d+)\s+weather_cards:\s*(\d+)\s+weather_cards_with_preview:\s*(\d+)",
        log_text,
    )
    if breakdown:
        keys = ("latest_24h", "archive", "latest_tag_15m", "image_preview_urls",
                "bd_slider_preview_candidates", "weather_cards", "weather_cards_with_preview")
        for key, value in zip(keys, breakdown.groups()):
            metrics[key] = int(value)

    # Also parse the generator's detailed weather line, used by current refresh runs.
    weather_detail = re.search(
        r"Weather/disaster previews:\s*candidates:\s*(\d+)\s+metadata_fetched:\s*(\d+)\s+cached/reused:\s*(\d+)\s+publisher_unavailable:\s*(\d+)\s+RSS_image_fallback:\s*(\d+)\s+with_preview_total:\s*(\d+)",
        log_text,
    )
    if weather_detail:
        candidates, fetched, cached, unavailable, rss_fallback, with_preview = map(int, weather_detail.groups())
        metrics["weather_cards"] = candidates
        metrics["weather_cards_with_preview"] = with_preview
        metrics["weather_enriched"] = fetched
        metrics["weather_priority"] = candidates
        metrics["weather_cached"] = cached
        metrics["weather_unavailable"] = unavailable
        metrics["weather_rss_fallback"] = rss_fallback

    categories = re.search(r"Category breakdown:\s*Bangladesh:\s*(\d+)\s+World:\s*(\d+)\s+Technology:\s*(\d+)", log_text)
    if categories:
        metrics["bangladesh"], metrics["world"], metrics["technology"] = map(int, categories.groups())

    checks = re.search(
        r"Publisher preview checks:\s*attempted:\s*(\d+)\s+metadata fetched:\s*(\d+)\s+unavailable:\s*(\d+)\s+cached/reused:\s*(\d+)(?:\s+cached_success:\s*(\d+)\s+cached_fallback:\s*(\d+))?\s+Google News URLs resolved:\s*(\d+)",
        log_text,
    )
    if checks:
        values = checks.groups()
        (metrics["metadata_attempts"], metrics["metadata_fetched"],
         metrics["metadata_unavailable"], metrics["metadata_cached"]) = map(int, values[:4])
        if values[4] is not None:
            metrics["metadata_cached_success"] = int(values[4])
            metrics["metadata_cached_fallback"] = int(values[5])
        else:
            # Older generator logs did not distinguish verified metadata from RSS fallbacks.
            metrics["metadata_cached_success"] = 0
            metrics["metadata_cached_fallback"] = metrics["metadata_cached"]
        metrics["publisher_urls_resolved"] = int(values[6])
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


def news_report_warnings(metrics):
    warnings = []
    if metrics.get("rss_failed") not in (None, 0):
        warnings.append("Some RSS/feed queries failed.")
    attempts = metrics.get("metadata_attempts")
    fetched = metrics.get("metadata_fetched")
    cached_success = metrics.get("metadata_cached_success") or 0
    cached_fallback = metrics.get("metadata_cached_fallback") or 0
    checked_total = (attempts or 0) + cached_success + cached_fallback
    verified_total = (fetched or 0) + cached_success
    if checked_total and verified_total / checked_total < 0.5:
        warnings.append("Publisher metadata coverage is low, including cached publisher previews.")
    if metrics.get("validation") == "FAIL":
        warnings.append("Generated feed validation failed.")
    weather_total = metrics.get("weather_cards")
    weather_with_preview = metrics.get("weather_cards_with_preview")
    if weather_total and weather_with_preview is not None and weather_with_preview < weather_total:
        warnings.append("Some Weather/Disaster cards do not have a preview image URL.")
    if metrics.get("baseline") == "establishing":
        warnings.append("The comparison baseline is being established.")
    return warnings

def should_send_news_notification(conclusion, metrics):
    """Send news workflow failures and warnings, never routine success notifications."""
    return str(conclusion or "").lower() != "success" or bool(news_report_warnings(metrics))

def build_news_report(metrics, context, verified_ids=None):
    """Render a compact Telegram report while retaining every available diagnostic."""
    verified_ids = verified_ids or {}
    conclusion = str(context.get("conclusion") or "unknown").lower()
    warnings = news_report_warnings(metrics)
    attempts = metrics.get("metadata_attempts")
    fetched = metrics.get("metadata_fetched")
    cached_success = metrics.get("metadata_cached_success") or 0
    cached_fallback = metrics.get("metadata_cached_fallback") or 0
    checked_total = (attempts or 0) + cached_success + cached_fallback
    verified_total = (fetched or 0) + cached_success
    status = conclusion.upper() if conclusion != "success" else ("WARNING · " + str(len(warnings)) + " ITEM(S)" if warnings else "SUCCESS")
    status = conclusion.upper() if conclusion != "success" else ("SUCCESS · WARNINGS" if warnings else "SUCCESS")
    stamp_value = context.get("updated_at") or context.get("created_at") or ""
    try:
        stamp = datetime.fromisoformat(stamp_value.replace("Z", "+00:00")).astimezone(BDT).strftime("%d %b %Y · %I:%M %p BDT")
    except Exception:
        stamp = datetime.now(BDT).strftime("%d %b %Y · %I:%M %p BDT")

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
        f'📡 <b>NEWS REFRESH REPORT</b>',
        f'{emoji("success", verified_ids)} <b>{html.escape(status)}</b>  ·  {html.escape(stamp)}',
        "",
        f'{emoji("news", verified_ids)} <b>NEWS DATABASE</b>',
        f'🗞 Total <b>{number(metrics.get("headlines"))}</b>   🇧🇩 BD <b>{number(metrics.get("bangladesh"))}</b>',
    ]
    if metrics.get("world") is not None and metrics.get("technology") is not None:
        lines.append(f'🌍 World <b>{number(metrics.get("world"))}</b>   💻 Tech <b>{number(metrics.get("technology"))}</b>')
    elif metrics.get("headlines") is not None and metrics.get("bangladesh") is not None:
        lines.append(f'🌐 World + Tech <b>{number(metrics["headlines"] - metrics["bangladesh"])}</b>')

    if metrics.get("baseline") == "establishing":
        lines.append('📊 Change tracking <b>Baseline is being established</b>')
    else:
        lines.append(
            f'📦 Previous <b>{number(metrics.get("previous_headlines"))}</b>  ·  '
            f'🆕 Added <b>{number(metrics.get("added"))}</b>  ·  '
            f'🔄 Updated <b>{number(metrics.get("updated"))}</b>'
        )
        lines.append(
            f'➖ Unchanged <b>{number(metrics.get("unchanged"))}</b>  ·  '
            f'🗑 Removed <b>{number(metrics.get("removed"))}</b>  ·  '
            f'📈 Net <b>{signed(metrics.get("net_change"))}</b>'
        )
        lines.append('<i>Net = Added − Removed; removed also includes stories outside the 90-day retention window.</i>')

    lines.extend([
        "",
        f'{emoji("chart", verified_ids)} <b>LIVE FEED</b>',
        f'🕓 Last 24h <b>{number(metrics.get("latest_24h"))}</b>  ·  🗄 Archive <b>{number(metrics.get("archive"))}</b>',
        f'🏷 Latest-tag (15m) <b>{number(metrics.get("latest_tag_15m"))}</b>  ·  🖼 Image URLs <b>{number(metrics.get("image_preview_urls"))}</b>',
        f'🇧🇩 BD slider candidates <b>{number(metrics.get("bd_slider_preview_candidates"))}</b>',
        f'🌦 Weather/Disaster cards <b>{number(metrics.get("weather_cards"))}</b>  ·  Preview <b>{number(metrics.get("weather_cards_with_preview"))}</b>',
        "",
        f'{emoji("refresh", verified_ids)} <b>COLLECTION HEALTH</b>',
        f'📡 RSS queries <b>{number(metrics.get("rss_success"))}/{number(metrics.get("rss_attempted"))}</b> successful  ·  Failed <b>{number(metrics.get("rss_failed"))}</b>',
    ])
    for detail in metrics.get("rss_failure_details", [])[:3]:
        lines.append('⚠️ ' + html.escape(detail))

    lines.extend([
        f'🔗 Publisher URLs resolved <b>{number(metrics.get("publisher_urls_resolved"))}</b>',
        f'🔎 Metadata attempts <b>{number(metrics.get("metadata_attempts"))}</b>  ·  Extracted <b>{number(metrics.get("metadata_fetched"))}</b>',
        f'⚠️ Unavailable <b>{number(metrics.get("metadata_unavailable"))}</b>  ·  Cached <b>{number(metrics.get("metadata_cached"))}</b>',
    ])
    if attempts is not None and attempts > 0 and fetched is not None:
        lines.append(f'📊 New fetch success <b>{round(100 * fetched / max(1, attempts))}%</b> ({fetched}/{attempts})')
        if cached_success or cached_fallback:
            lines.append(f'📦 Cached previews <b>{number(metrics.get("metadata_cached"))}</b> · Verified <b>{number(cached_success)}</b> · Fallback <b>{number(cached_fallback)}</b>')
        if checked_total:
            lines.append(f'📊 Overall preview coverage <b>{round(100 * verified_total / checked_total)}%</b> ({verified_total}/{checked_total})')
    elif attempts == 0:
        lines.append(f'📊 New fetch success <b>N/A</b> · No new requests; cached <b>{number(metrics.get("metadata_cached"))}</b>')
    else:
        lines.append('📊 Metadata success rate <b>Not reported</b>')
    if metrics.get("publisher_preview_unavailable"):
        hosts = ", ".join(metrics.get("publisher_unavailable_hosts") or [])
        suffix = f' · {html.escape(hosts)}' if hosts else ''
        lines.append(f'🌐 Publisher preview unavailable <b>{metrics["publisher_preview_unavailable"]}</b>{suffix}')
    if metrics.get("weather_enriched") is not None:
        weather_suffix = ''
        if metrics.get("weather_cached") is not None:
            weather_suffix = f' · Cached {number(metrics.get("weather_cached"))} · Unavailable {number(metrics.get("weather_unavailable"))} · RSS fallback {number(metrics.get("weather_rss_fallback"))}'
        lines.append(f'🌦 New Weather preview metadata <b>{number(metrics["weather_enriched"])}/{number(metrics.get("weather_priority"))}</b> priority stories{weather_suffix}')

    lines.extend([
        "",
        "🧪 <b>FEED QUALITY</b>",
        f'Validation <b>{html.escape(metrics.get("validation") or "Not reported")}</b>  ·  Invalid <b>{number(metrics.get("invalid_items"))}</b>  ·  Duplicates <b>{number(metrics.get("duplicate_items"))}</b>',
    ])
    if metrics.get("validation") == "PASS":
        lines.append('✅ Required fields and category structure passed.')
    else:
        lines.append('ℹ️ Validation details are limited to checks reported by the generator.')

    if warnings:
        lines.extend(["", f'⚠️ <b>NEEDS ATTENTION · {len(warnings)} item(s)</b>'])
        for warning in warnings[:5]:
            lines.append('• ' + html.escape(warning))
        if attempts and fetched is not None and fetched < attempts:
            lines.append('↳ Review publishers that block preview requests; keep RSS fallbacks.')
        if metrics.get("rss_failure_details"):
            lines.append('↳ Check failed feeds; retry affected sources on the next refresh.')
        if metrics.get("baseline") == "establishing":
            lines.append('↳ The next successful refresh will establish the comparison baseline.')
        if weather_total and weather_with_preview is not None and weather_with_preview < weather_total:
            lines.append(f'↳ Review {weather_total - weather_with_preview} Weather/Disaster cards without preview images.')
    else:
        lines.extend(["", "✅ <b>ALL CHECKS CLEAR</b> · No reported feed or collection issues."])

    lines.extend([
        "",
        f'⚙️ <b>RUN DETAILS</b>  ·  <a href="{run_url}">OPEN ACTION RUN ↗</a>',
        f'<code>{repo}</code>',
        f'{workflow}  ·  {branch}  ·  {event}',
        f'Run <code>{run_id}</code>  ·  Attempt <b>{attempt}</b>',
        "",
        '<i>Automated feed diagnostics · Bangladesh time</i>',
    ])
    message = "\n".join(lines)
    plain_length = len(re.sub(r"<[^>]+>", "", message))
    if plain_length > MAX_TELEGRAM_TEXT - 100:
        lines = [line for line in lines if not line.startswith("🌐 Publisher preview unavailable")]
        message = "\n".join(lines)
        plain_length = len(re.sub(r"<[^>]+>", "", message))
    if plain_length > MAX_TELEGRAM_TEXT - 100:
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
        '🚨 <b>WORKFLOW FAILURE</b>',
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


def format_telegram_message(message, category="BOT CONTROL CENTER"):
    raw = str(message or "").strip()
    if "<i>KOKUSHIBU74 · INTELLIGENCE</i>" in raw:
        return raw
    category = html.escape(str(category or "BOT CONTROL CENTER"))
    formatted = f"<b>◈ {category}</b>\n\n{raw}\n\n<i>KOKUSHIBU74 · INTELLIGENCE</i>"
    plain_length = len(re.sub(r"<[^>]+>", "", formatted))
    if plain_length > MAX_TELEGRAM_TEXT:
        raise ValueError("Telegram formatted message exceeds the safe message length: " + str(plain_length))
    return formatted


def send_telegram_report(token, chat_id, message, verified_ids=None, lookup_error="", reply_markup=None, category="BOT CONTROL CENTER"):
    message = format_telegram_message(message, category)
    verified_ids = verified_ids or {}
    custom_count = len(verified_ids)
    payload = {
        "chat_id": chat_id,
        "text": message if custom_count else re.sub(r'<tg-emoji[^>]*>(.*?)</tg-emoji>', r'\1', message),
        "parse_mode": "HTML",
        "disable_web_page_preview": True,
    }
    if reply_markup:
        payload["reply_markup"] = reply_markup
    result = telegram_call(token, "sendMessage", payload)
    custom_emoji_used = bool(custom_count)
    if not result.get("ok") and custom_count:
        # Telegram may reject custom emoji when the bot owner lacks the required Premium entitlement.
        fallback = re.sub(r'<tg-emoji[^>]*>(.*?)</tg-emoji>', r'\1', message)
        result = telegram_call(token, "sendMessage", {
            "chat_id": chat_id, "text": fallback, "parse_mode": "HTML",
            "disable_web_page_preview": True,
            **({"reply_markup": reply_markup} if reply_markup else {}),
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
        if not should_send_news_notification(context["conclusion"], metrics):
            print("Telegram news success notification suppressed by policy; workflow and feed refresh completed normally.")
            return
        verified_ids, lookup_error = verified_animated_custom_emojis(env["TELEGRAM_BOT_TOKEN"])
        message = build_news_report(metrics, context, verified_ids)
        send_telegram_report(env["TELEGRAM_BOT_TOKEN"], env["TELEGRAM_CHAT_ID"], message, verified_ids, lookup_error, category="NEWS INTELLIGENCE")
        print("News report metrics parsed; publisher metadata and RSS diagnostics included where available.")
        if lookup_error:
            print("Custom emoji lookup fallback: " + lookup_error)
    else:
        message = build_failure_report(context, failed, excerpts)
        run_url = str(context.get("run_url") or "")
        run_id = str(context.get("run_id") or "")
        reply_markup = None
        if run_url.startswith("https://github.com/Kokushibu74/kokushibu74.github.io/actions/runs/") and run_id.isdigit():
            reply_markup = {"inline_keyboard": [[
                {"text": "Open Workflow", "url": run_url},
                {"text": "Retry Failed Jobs", "callback_data": "b1:alert:github:retry:" + run_id},
            ]]}
        send_telegram_report(env["TELEGRAM_BOT_TOKEN"], env["TELEGRAM_CHAT_ID"], message, reply_markup=reply_markup, category=("NEWS INTELLIGENCE" if context["workflow_name"] == "Refresh live news feed" else "AUTOMATION MONITORING"))


if __name__ == "__main__":
    main()
    warnings = news_report_warnings(metrics)
    attempts = metrics.get("metadata_attempts")
    fetched = metrics.get("metadata_fetched")
    cached_success = metrics.get("metadata_cached_success") or 0
    cached_fallback = metrics.get("metadata_cached_fallback") or 0
    checked_total = (attempts or 0) + cached_success + cached_fallback
    verified_total = (fetched or 0) + cached_success
    status = conclusion.upper() if conclusion != "success" else ("WARNING · " + str(len(warnings)) + " ITEM(S)" if warnings else "SUCCESS")