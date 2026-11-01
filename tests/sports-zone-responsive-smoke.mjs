import { chromium } from "playwright";
import { readFile } from "node:fs/promises";

const html = await readFile("sports-zone.html", "utf8");
const browser = await chromium.launch({ headless: true });
const page = await browser.newPage({ viewport: { width: 1440, height: 1000 } });
const errors = [];
const kickoff = new Date(Date.now() + 3600000).toISOString();
const football = [{id:"401879245",name:"Arsenal at Liverpool",shortName:"ARS @ LIV",status:"scheduled",statusDetail:"Scheduled",startTime:kickoff,homeTeam:"Liverpool",awayTeam:"Arsenal",competition:"Premier League"}];
const cricket = [{id:"1552530",name:"New Zealand A v India A",shortName:"NZ-A v IND-A",sport:"cricket",provider:"espn",leagueId:"24805",league:"India A Tour",competition:"India A Tour",status:"live",statusDetail:"Live",startTime:new Date(Date.now()-1200000).toISOString(),homeTeam:"New Zealand A",awayTeam:"India A",homeScore:"218/3",awayScore:"346"}];
const schedule = [...football.map(m=>({...m,sport:"football"})),...cricket];

await page.route("https://unified-sports-api.mdshihab74.workers.dev/**", async route => {
  const path = new URL(route.request().url()).pathname;
  let data;
  if(path==="/api/football") data={ok:true,updated:new Date().toISOString(),matches:football};
  else if(path==="/api/cricket") data={ok:true,updated:new Date().toISOString(),matches:cricket};
  else if(path==="/api/schedule") data={ok:true,events:schedule,fetchErrors:[]};
  else if(path==="/matches/live") data={kind:"live",count:0,matches:[]};
  else if(path==="/api/streams") data={ok:true,streams:[]};
  else if(path==="/api/streams/status") data={ok:true,autoDiscovery:{configured:true,liveStreams:0,searchesToday:0,dailySearchLimit:70}};
  else if(path==="/api/football/details"||path==="/api/cricket/details") data={ok:true,data:{header:{},gameInfo:{},matchcards:[],rosters:[],boxscore:{teams:[],players:[]}}};
  else data={error:"Not found"};
  await route.fulfill({status:200,contentType:"application/json",headers:{"Access-Control-Allow-Origin":"*"},body:JSON.stringify(data)});
});
page.on("pageerror",e=>errors.push(e.message));

try {
  await page.setContent(html.replace("<head>","<head><base href=\"https://kokushibu74.github.io/\">"),{waitUntil:"domcontentloaded"});
  await page.waitForSelector(".arena-header");
  await page.waitForFunction(()=>document.querySelectorAll("#schedule-preview .schedule-card").length>0,null,{timeout:15000});
  await page.waitForFunction(()=>document.querySelectorAll("#live-match-list .live-card").length>0,null,{timeout:15000});
  const layouts=[];
  for(const v of [{name:"desktop",width:1440,height:1000},{name:"laptop",width:1024,height:900},{name:"tablet",width:768,height:1024},{name:"mobile",width:390,height:844},{name:"small-mobile",width:360,height:800}]){
    await page.setViewportSize({width:v.width,height:v.height});
    const s=await page.evaluate(()=>({width:innerWidth,docWidth:document.documentElement.scrollWidth,hero:!!document.querySelector(".arena-hero"),console:!!document.querySelector(".hero-console"),search:!!document.querySelector("#match-search"),filter:!!document.querySelector("#match-status-filter"),desktopNav:getComputedStyle(document.querySelector(".arena-nav")).display,mobileNav:getComputedStyle(document.querySelector(".arena-bottom-nav")).display,schedule:document.querySelectorAll("#schedule-preview .schedule-card").length,live:document.querySelectorAll("#live-match-list .live-card").length,overflow:[...document.querySelectorAll("body *")].map(e=>{const r=e.getBoundingClientRect();return {tag:e.tagName,text:(e.textContent||"").trim().slice(0,24),right:Math.round(r.right),left:Math.round(r.left)}}).filter(e=>e.right>innerWidth+1||e.left< -1).slice(0,8)}));
    if(s.docWidth>s.width+2)throw new Error(v.name+" overflow "+JSON.stringify(s.overflow));
    if(!s.hero||!s.console||!s.search||!s.filter||!s.schedule||!s.live)throw new Error(v.name+" missing UI/data "+JSON.stringify(s));
    if(v.width>760&&(s.desktopNav==="none"||s.mobileNav!=="none"))throw new Error(v.name+" desktop nav breakpoint failed");
    if(v.width<=760&&(s.desktopNav!=="none"||s.mobileNav==="none"))throw new Error(v.name+" mobile nav breakpoint failed");
    layouts.push({name:v.name,width:v.width,documentWidth:s.docWidth,scheduleCards:s.schedule,liveCards:s.live});
  }
  await page.locator("#match-search").fill("Arsenal");
  await page.waitForFunction(()=>document.querySelectorAll("#match-list .match-card").length===1);
  await page.locator("#match-search").fill("no-such-team");
  await page.waitForFunction(()=>document.querySelectorAll("#match-list .match-card").length===0);
  if(errors.length)throw new Error("Page errors: "+errors.join(" | "));
  console.log("Responsive Sports Arena QA PASS",JSON.stringify({layouts,search:"PASS",pageErrors:errors}));
} finally { await browser.close(); }
