# Sports Zone — Live Scores & Official Streams

GitHub Pages frontend + Cloudflare Worker API. Uses free, keyless public score endpoints and only explicitly configured official YouTube sources. No pirated streams, IPTV playlists, or browser-side secrets are included.

## Files
- `sports-zone.html` — responsive football/cricket score UI and official YouTube player.
- `worker/src/index.js` — API, validation, cache, CORS, best-effort rate limiting, protected stream management.
- `worker/wrangler.toml` — Wrangler and KV configuration.

## 1. Create KV namespaces

Install Wrangler and log in:

```bash
npm install -g wrangler
wrangler login
cd worker
wrangler kv namespace create SPORTS_ZONE
wrangler kv namespace create SPORTS_ZONE --preview
```

Copy the returned production ID to `id` and preview ID to `preview_id` in `worker/wrangler.toml`.

## 2. Set the admin secret and deploy

```bash
wrangler secret put ADMIN_KEY
wrangler deploy
```

Enter a long random secret when prompted. Never place it in the frontend or repository. The Worker name is `sports-zone-scores-api`; Wrangler prints its URL after deployment.

The frontend currently points to `https://sports-zone-scores-api.mdshihab74.workers.dev`. If your actual URL differs, update `WORKER_URL` near the top of the script in `sports-zone.html` (no trailing slash).

## 3. Add a verified official YouTube source

The Worker deliberately starts with an empty stream list; the prompt's sample IDs are not assumed to be official. Verify the broadcaster and embedding rights before adding a source. Run this locally (never expose ADMIN_KEY in browser code):

```bash
curl -X POST "https://YOUR_WORKER_URL/api/streams" \
  -H "Authorization: Bearer YOUR_ADMIN_KEY" \
  -H "Content-Type: application/json" \
  -d '{"name":"Verified official channel","youtubeId":"YOUR11CHARID","category":"cricket","officialUrl":"https://www.youtube.com/@OfficialChannel","isOfficial":true}'
```

The Worker checks the 11-character ID format and requires an HTTPS YouTube URL. These format checks cannot prove broadcasting rights; manual verification is required. Sources are stored in KV key `streams`.

## 4. Smoke-test endpoints

```bash
curl -i "https://YOUR_WORKER_URL/health"
curl -i "https://YOUR_WORKER_URL/api/football?league=eng.1"
curl -i "https://YOUR_WORKER_URL/api/cricket"
curl -i "https://YOUR_WORKER_URL/api/streams"
```

Football should return `ok: true` and a `matches` array while ESPN's public endpoint is available. Cricket uses a public ESPN scoreboard path, but competition identifiers and provider availability can vary; a 502 means the provider did not return the expected data. Streams returns an empty array until verified sources are configured.

## 5. Publish the frontend

Commit and push `sports-zone.html` to the GitHub Pages publishing branch (`main`). Existing GA4 measurement ID `G-WXBD1454H8`, shared header, and chatbot scripts are preserved.

## Security and known limitations
- CORS allows `https://kokushibu74.github.io`; CORS is not authentication.
- The 60 requests/minute/IP limiter is in-memory and isolate-local (best-effort). Use Cloudflare Rate Limiting rules or a Durable Object for robust global enforcement.
- Admin secret stays in a Worker secret.
- HLS/m3u8 URLs are deliberately unsupported; only configured YouTube embeds are used.
- Frontend manual ID checking only selects IDs already configured in the official source list.
- Public ESPN endpoints can change or become unavailable. No paid API key is used, but provider uptime is not guaranteed.
