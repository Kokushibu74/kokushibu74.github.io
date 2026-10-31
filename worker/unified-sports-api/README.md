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

## Rollout safety

Both legacy Workers remain deployed and enabled. The legacy scores Worker continues to own `*/15 * * * *` until the new Worker has both secrets and passes live verification. Do not attach the same Cron to both Workers at once; both would write to the same KV namespace and could double YouTube search usage.

After verifying the new Worker, move the 15-minute Cron to it while keeping the legacy scripts deployed for rollback.

## Existing issue found during audit

In the audited seven-day Observability window, the old ESPN cricket endpoint recorded 15 HTTP 502 responses: 9 for `league=ipl` and 6 for `league=icc.t20`. These are pre-existing provider/league errors and need separate endpoint validation.
