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

## Cricket provider routing

The ESPN Site Scoreboard path for cricket was returning 404/502 for the old `/api/cricket?league=ipl|icc.t20` requests. The unified Worker now uses ESPN's Personalized Scoreboard Header to discover active cricket series and their live/upcoming events, and the ESPN Web API match-summary route for scorecards. The existing Cricbuzz `/matches/live` and match-detail routes remain in place for the Live Match Center. The production smoke test checks all three cricket competition filters, Cricket match summaries, the Cricbuzz live feed, the unified multi-sport schedule, official streams, CORS, and the actual Worker used by the public page.


### Live match handling
- The Cricbuzz live feed marks a match as active only when its status/state explicitly indicates live play, an innings break, stumps, a playing day, or an in-play interval. Unknown and scheduled rows are excluded from LIVE NOW.
- Expanded match details are lazy-loaded and refreshed with the 30-second match polling cycle while the panel is open.
