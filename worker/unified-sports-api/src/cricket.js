const SITE = "https://www.cricbuzz.com";
const ALLOWED_ORIGIN = "https://kokushibu74.github.io";
const JSON_HEADERS = {
  "accept": "application/json, text/plain, */*",
  "accept-language": "en-US,en;q=0.9",
  "referer": SITE + "/",
  "user-agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0.0.0 Safari/537.36"
};
function json(data, status, origin, cache) {
  const headers = {
    "content-type": "application/json; charset=utf-8",
    "cache-control": cache || "no-store",
    "access-control-allow-methods": "GET, OPTIONS",
    "access-control-allow-headers": "Content-Type",
    "vary": "Origin"
  };
  if (origin === ALLOWED_ORIGIN) headers["access-control-allow-origin"] = ALLOWED_ORIGIN;
  return new Response(JSON.stringify(data), {status: status || 200, headers});
}
function decodeFlight(html) {
  const re = /self\.__next_f\.push\(\[1,"((?:[^"\\]|\\.)*)"\]\)/gs;
  let out = "", match;
  while ((match = re.exec(html)) !== null) {
    try { out += JSON.parse('"' + match[1] + '"'); } catch {}
  }
  return out;
}
function parseRows(flight) {
  const rows = {};
  const lines = flight.split("\n");
  for (const line of lines) {
    const colon = line.indexOf(":");
    if (colon < 1) continue;
    const id = line.slice(0, colon);
    if (!/^[0-9a-f]+$/.test(id)) continue;
    const body = line.slice(colon + 1);
    if (body[0] !== "{" && body[0] !== "[") continue;
    try { rows[id] = JSON.parse(body); } catch {}
  }
  return rows;
}
function clean(v) { return v == null ? "" : String(v).replace(/\s+/g, " ").trim(); }
function normalizeMatches(html) {
  const rows = parseRows(decodeFlight(html));
  const found = new Map();
  function walk(node, depth) {
    if (!node || depth > 35) return;
    if (Array.isArray(node)) { for (const item of node) walk(item, depth + 1); return; }
    if (typeof node !== "object") return;
    const info = node.matchInfo;
    if (info && typeof info === "object") {
      const id = clean(info.matchId || info.matchID || info.id);
      if (/^\d{5,}$/.test(id) && !found.has(id)) {
        const t1 = info.team1 || info.team1Info || {};
        const t2 = info.team2 || info.team2Info || {};
        const scoreDetails = node.matchScoreDetails || info.matchScoreDetails || {};
        const scoreText = [];
        for (const k of ["matchScoreDetails", "liveScore", "miniscore"]) {
          const d = node[k];
          if (d && typeof d === "object") {
            for (const key of ["batTeam", "batTeamName", "score", "scoreDetails", "overs"]) {
              if (d[key] && (typeof d[key] === "string" || typeof d[key] === "number")) scoreText.push(clean(d[key]));
            }
          }
        }
        const status = clean(info.status || node.status || "");
        const state = clean(info.state || info.stateTitle || "");
        const liveText = (status + " " + state).toLowerCase();
        const isLive = /\blive\b|in progress|innings break|stumps|\bday [1-5]\b|lunch|tea break|drinks break|rain delay|bad light/.test(liveText);
        found.set(id, {
          id, matchId: id, isLive,
          title: clean(info.matchDescription || info.matchDesc || info.matchTitle || (clean(t1.teamName) + " vs " + clean(t2.teamName))),
          home: clean(t1.teamName || t1.teamSName || t1.name),
          away: clean(t2.teamName || t2.teamSName || t2.name),
          competition: clean(info.seriesName || info.series || info.matchFormat || "Cricket"),
          status: status || "Unknown",
          state,
          score: scoreText.filter(Boolean).join(" · "),
          venue: clean(info.venueInfo && (info.venueInfo.ground || info.venueInfo.city)),
          link: SITE + "/live-cricket-scores/" + id
        });
      }
    }
    for (const value of Object.values(node)) walk(value, depth + 1);
  }
  for (const row of Object.values(rows)) walk(row, 0);
  if (!found.size) {
    const re = /href="(\/live-cricket-scores\/[^"]*?\/(\d+)(?:\/[^"]*)?)"[^>]*>([\s\S]*?)<\/a>/gi;
    let m;
    while ((m = re.exec(html)) !== null) {
      const id = m[2];
      if (!found.has(id)) {
        const title = clean(m[3].replace(/<[^>]*>/g, " "));
        found.set(id, {id, matchId:id, title:title || "Cricket match " + id, home:title || "Match", away:"", competition:"Cricket", status:"MATCH", score:"", link:SITE + m[1]});
      }
    }
  }
  return [...found.values()];
}
async function upstream(path, accept) {
  const response = await fetch(SITE + path, {headers: {...JSON_HEADERS, accept: accept || JSON_HEADERS.accept}, redirect:"follow"});
  const body = await response.text();
  if (!response.ok) throw new Error("Cricbuzz upstream returned HTTP " + response.status);
  return {response, body};
}
function matchId(url) {
  const value = url.searchParams.get("match") || "";
  const match = value.match(/(?:^|\/)(\d{5,})(?:\/|$)/) || value.match(/^(\d{5,})$/);
  return match ? match[1] : "";
}
export default {
  async fetch(request) {
    const url = new URL(request.url);
    const origin = request.headers.get("Origin") || "";
    if (request.method === "OPTIONS") return new Response(null, {status:204,headers:{
      "access-control-allow-origin": origin === ALLOWED_ORIGIN ? ALLOWED_ORIGIN : "null",
      "access-control-allow-methods":"GET, OPTIONS",
      "access-control-allow-headers":"Content-Type",
      "access-control-max-age":"86400",
      "vary":"Origin"
    }});
    if (request.method !== "GET") return json({error:"Method not allowed"},405,origin);
    try {
      if (url.pathname === "/" || url.pathname === "/health") return json({status:"ok",service:"sports-zone-cricket-api",routes:["/matches/live","/matches/scorecard?match=ID","/matches/full-commentary?match=ID&innings=1","/matches/ball-by-ball?match=ID&innings=1","/matches/commentary?match=ID&innings=1","/matches/live-score?match=ID"]},200,origin,"public, max-age=10");
      if (url.pathname === "/matches/live") {
        const {body} = await upstream("/cricket-match/live-scores","text/html,application/xhtml+xml");
        const matches = normalizeMatches(body);
        return json({kind:"live",count:matches.length,matches,updated_at:new Date().toISOString(),source:"Cricbuzz"},200,origin,"public, max-age=20");
      }
      const id = matchId(url);
      if (!id) return json({error:"A numeric Cricbuzz match ID is required in the match query parameter."},400,origin);
      const innings = Math.max(1, Math.min(4, Number.parseInt(url.searchParams.get("innings") || "1",10) || 1));
      let path = "";
      switch (url.pathname) {
        case "/matches/scorecard": path = "/api/mcenter/scorecard/" + id; break;
        case "/matches/full-commentary": path = "/api/mcenter/" + id + "/full-commentary/" + innings; break;
        case "/matches/ball-by-ball": path = "/api/mcenter/balls-map/" + id + "/" + innings; break;
        case "/matches/commentary": path = "/api/mcenter/comm/" + id; break;
        case "/matches/live-score": path = "/api/mcenter/livescore/" + id; break;
        case "/matches/details": path = "/api/mcenter/" + id + "/miniscore"; break;
        default: return json({error:"Unknown endpoint"},404,origin);
      }
      const {response,body} = await upstream(path,"application/json, text/plain, */*");
      let data;
      try { data = JSON.parse(body); } catch { return json({error:"Cricbuzz did not return JSON for this match. It may be unavailable or temporarily blocked."},502,origin); }
      return json({match_id:id,innings,data},response.status,origin,"public, max-age=8");
    } catch (error) {
      return json({error:"Cricket data is temporarily unavailable.",detail:String(error && error.message || error)},502,origin);
    }
  }
};