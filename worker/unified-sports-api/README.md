# Unified Sports API

Staged source for Cloudflare Worker `unified-sports-api`.

## Modules

- `src/index.js`: ESPN football/cricket scoreboard, YouTube stream discovery, stream list/admin routes and unified routing.
- `src/cricket.js`: Cricbuzz live matches, scorecard, full commentary, ball-by-ball, commentary, live score and match details.

## Preserved routes

- `/api/football`
- `/api/football/details?league=eng.1&match=ID`
- `/api/cricket`
- `/api/streams`
- `/api/streams/status`
- `/matches/live`
- `/matches/scorecard?match=ID`
- `/matches/full-commentary?match=ID&innings=1`
- `/matches/ball-by-ball?match=ID&innings=1`
- `/matches/commentary?match=ID&innings=1`
- `/matches/live-score?match=ID`
- `/matches/details?match=ID`

## Required bindings

- KV namespace `SPORTS_ZONE` (existing production namespace).
- Plain-text variable `YOUTUBE_OFFICIAL_CHANNEL_IDS`.
- Secret `ADMIN_KEY` — add manually; Cloudflare does not reveal existing secret values.
- Secret `YOUTUBE_API_KEY` — add manually for the new Worker before transferring the Cron.

## Live Match Center

The Sports Zone frontend separates currently live matches into a dedicated LIVE NOW section. Selecting a live match expands an inline panel on the same page. Cricket panels load Cricbuzz scorecard/commentary/ball-by-ball data using Cricbuzz match IDs; football panels load ESPN summary, team/player statistics and match events through `/api/football/details`. Detail requests are made only for the expanded match.

## Production schedule ownership

The production `unified-sports-api` Worker owns the `*/15 * * * *` Cron. The legacy `sports-zone-scores-api` Worker remains deployed and enabled for rollback, but has no Cron trigger. Both Workers share the same `SPORTS_ZONE` KV namespace, so never enable the same discovery Cron on both at once.

Both required secret bindings (`ADMIN_KEY` and `YOUTUBE_API_KEY`) and the official YouTube channel allowlist are present on the unified Worker. Keep secret values out of GitHub and public files.

The smoke test targets the actual production Worker used by `sports-zone.html`, not the legacy Worker.

## Existing issue found during audit

In the audited seven-day Observability window, the old ESPN cricket endpoint recorded 15 HTTP 502 responses: 9 for `league=ipl` and 6 for `league=icc.t20`. These are pre-existing provider/league errors and need separate endpoint validation.


### Live match handling
- The Cricbuzz live feed marks a match as active only when its status/state explicitly indicates live play, an innings break, stumps, a playing day, or an in-play interval. Unknown and scheduled rows are excluded from LIVE NOW.
- Expanded match details are lazy-loaded and refreshed with the 30-second match polling cycle while the panel is open.
