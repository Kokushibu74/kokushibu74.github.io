import test from "node:test";
import assert from "node:assert/strict";
import {readFile,writeFile,mkdtemp,rm} from "node:fs/promises";
import {tmpdir} from "node:os";
import {join} from "node:path";
import {pathToFileURL} from "node:url";
import {evaluateNewsAlert,mediaCandidates,parseOfficialDisasterSignal,escapeHtml,newsAlertKey,deliverWithMediaFallback,isWeatherCandidate,formatAlertMessage,extractAlertLocation,extractIncidentTime,formatTelegramMessage,telegramMessageCategory,automationAlertDecision} from "../cloudflare/news-alerts.mjs";
const now=Date.parse("2026-11-04T00:00:00Z");
const item=(overrides={})=>({title:"ঢাকায় বাস দুর্ঘটনায় ৩ জন নিহত",summary:"ঢাকায় ভয়াবহ দুর্ঘটনা",category:"Bangladesh",isBreaking:true,publishedAt:new Date(now-10*60000).toISOString(),publisherUrl:"https://www.thedailystar.net/news/bangladesh/example",sourceEvidence:["The Daily Star","Prothom Alo"],...overrides});

test("Cloudflare Worker declares its handler and shared Telegram helpers",async()=>{
  const source=await readFile(new URL("../cloudflare/portfolio-contact-telegram.js",import.meta.url),"utf8");
  assert.match(source,/from "\.\/news-alerts\.mjs"/);
  assert.match(source,/from "\.\/news-watchdog\.mjs"/);
  assert.match(source,/formatTelegramMessage/);
  assert.match(source,/export default \{/);
});

test("two independent publishers verify a fatal Dhaka accident",()=>assert.equal(evaluateNewsAlert(item(),{now}).eligible,true));
test("two untrusted publishers are not sufficient corroboration",()=>assert.equal(evaluateNewsAlert(item({sourceEvidence:["Random Blog","Unknown News"]}),{now}).reason,"untrusted_sources"));
test("one trusted publisher produces a provisional alert even when another source is untrusted",()=>{const d=evaluateNewsAlert(item({sourceEvidence:["The Daily Star","Local News Desk"]}),{now});assert.equal(d.eligible,true);assert.equal(d.status,"provisional");assert.deepEqual(d.trustedSources,["The Daily Star"]);});
test("two independent trusted publishers corroborate",()=>assert.equal(evaluateNewsAlert(item({sourceEvidence:["The Daily Star","Prothom Alo"]}),{now}).eligible,true));
test("one trusted publisher is eligible as provisional",()=>{const d=evaluateNewsAlert(item({sourceEvidence:["The Daily Star"]}),{now});assert.equal(d.eligible,true);assert.equal(d.status,"provisional");assert.equal(d.verificationMode,"single_source_provisional");});
test("police vehicle fire during a clash is provisionally eligible",()=>{
  const d=evaluateNewsAlert(item({title:"গোপালগঞ্জে পুলিশের গাড়িতে আগুন, পাল্টাপাল্টি ধাওয়া",summary:"বিক্ষোভের সময় পুলিশের গাড়িতে আগুন দেওয়া হয়েছে",sourceEvidence:["UNB"]}),{now});
  assert.equal(d.eligible,true);assert.equal(d.status,"provisional");assert.equal(d.severity,"HIGH");
});
test("investigation committee follow-up is not a new incident alert",()=>{
  const d=evaluateNewsAlert(item({title:"নারায়ণগঞ্জে মাদরাসায় অগ্নিকাণ্ডের ঘটনায় তদন্ত কমিটি",summary:"ঘটনার তদন্তে কমিটি গঠন",sourceEvidence:["Jago News 24"]}),{now});
  assert.equal(d.eligible,false);assert.equal(d.reason,"follow_up");
});
test("political statement repeating old incident claims is not a new alert",()=>{
  const d=evaluateNewsAlert(item({title:"পতিত ফ্যাসিস্ট দমনে সরকার ব্যর্থ: জামায়াত",summary:"বিবৃতিতে ককটেল বিস্ফোরণ ও অগ্নিসংযোগের অভিযোগ",sourceEvidence:["Bangla Tribune"]}),{now});
  assert.equal(d.eligible,false);assert.equal(d.reason,"not_incident_report");
});
test("cocktail explosion without casualties produces a critical provisional alert",()=>{
  const d=evaluateNewsAlert(item({title:"ঢাকায় ককটেল বিস্ফোরণ",summary:"হতাহতের তথ্য এখনো জানা যায়নি",sourceEvidence:["Jago News 24"]}),{now});
  assert.equal(d.eligible,true);assert.equal(d.status,"provisional");assert.equal(d.severity,"CRITICAL");
});
test("bus fire without casualties produces a provisional alert",()=>{
  const d=evaluateNewsAlert(item({title:"ঢাকায় চলন্ত বাসে আগুন",summary:"হতাহতের তথ্য পাওয়া যায়নি",sourceEvidence:["The Daily Star"]}),{now});
  assert.equal(d.eligible,true);assert.equal(d.status,"provisional");assert.equal(d.severity,"HIGH");
});
test("two independently reported publisher stories confirm a provisional incident",()=>{
  const x=item({sourceEvidence:["The Daily Star","Prothom Alo"],sourceStories:[
    {name:"The Daily Star",title:"ঢাকায় বিস্ফোরণ",summary:"পুলিশ ঘটনাস্থলে গেছে"},
    {name:"Prothom Alo",title:"ঢাকায় বিস্ফোরণের খবর",summary:"ফায়ার সার্ভিস উদ্ধার কাজ করছে"}
  ]});
  const d=evaluateNewsAlert(x,{now});assert.equal(d.eligible,true);assert.equal(d.status,"confirmed");
});
test("identical syndicated copies do not count as two independent reports",()=>{
  const x=item({sourceEvidence:["The Daily Star","Prothom Alo"],sourceStories:[
    {name:"The Daily Star",title:"ঢাকায় বিস্ফোরণ",summary:"পুলিশ ঘটনাস্থলে গেছে"},
    {name:"Prothom Alo",title:"ঢাকায় বিস্ফোরণ",summary:"পুলিশ ঘটনাস্থলে গেছে"}
  ]});
  const d=evaluateNewsAlert(x,{now});assert.equal(d.eligible,true);assert.equal(d.status,"provisional");assert.deepEqual(d.trustedSources,["The Daily Star"]);
});
test("provisional alert message clearly labels verification status and links sources",()=>{
  const x=item({sourceEvidence:["The Daily Star"]});
  const d=evaluateNewsAlert(x,{now});
  const message=formatAlertMessage({...x,sourceLinks:[{name:"The Daily Star",url:"https://www.thedailystar.net/news/bangladesh/example"}]},d,{key:"abc123"});
  assert.match(message,/PROVISIONAL/);assert.match(message,/স্বাধীন যাচাই চলছে/);assert.match(message,/<a href=/);
});


test("incident time parser separates exact event time from publication time",()=>{
  const x=item({title:"ঢাকায় রাত ৮:৩০ মিনিটে বিস্ফোরণ",publishedAt:"2026-11-04T16:00:00Z"});
  const time=extractIncidentTime(x);
  assert.equal(time.precision,"exact");
  assert.match(time.display,/৮:৩০|৮:৩০/);
});

test("incident time parser handles Bengali hour and separate minute wording",()=>{
  const x=item({title:"ঢাকায় রাত ৮টা ৩০ মিনিটে বিস্ফোরণ",publishedAt:"2026-11-04T16:00:00Z"});
  const time=extractIncidentTime(x);
  assert.equal(time.precision,"exact");
  assert.match(time.display,/রাত ৮:৩০/);
});

test("incident time parser labels approximate time instead of claiming precision",()=>{
  const x=item({title:"ঢাকায় রাত ৮টার দিকে বিস্ফোরণ",publishedAt:"2026-11-04T16:00:00Z"});
  const time=extractIncidentTime(x);
  assert.equal(time.precision,"approximate");
  assert.match(time.display,/আনুমানিক/);
});
test("incident time parser resolves yesterday-night against publication date",()=>{
  const x=item({title:"গতকাল রাতে বিস্ফোরণ",summary:"ঢাকায় ঘটনা",publishedAt:"2026-11-04T16:00:00Z"});
  const time=extractIncidentTime(x);
  assert.equal(time.precision,"period");
  assert.match(time.display,/গত রাত/);
});
test("incident time parser returns unknown when the source gives no incident time",()=>{
  const x=item({title:"ঢাকায় বিস্ফোরণ",summary:"এলাকায় আতঙ্ক",publishedAt:"2026-11-04T16:00:00Z"});
  const time=extractIncidentTime(x);
  assert.equal(time.precision,"unknown");
  assert.equal(time.display,"এখনো নিশ্চিত নয়");
});
test("conflicting independent source incident times are not silently merged",()=>{
  const x=item({title:"ঢাকায় বিস্ফোরণ",summary:"বিস্তারিত",publishedAt:"2026-11-04T16:00:00Z",sourceStories:[
    {name:"The Daily Star",title:"ঢাকায় রাত ৮টায় বিস্ফোরণ"},
    {name:"Prothom Alo",title:"ঢাকায় রাত ৮:৩০ মিনিটে বিস্ফোরণ"}
  ]});
  const time=extractIncidentTime(x);
  assert.equal(time.precision,"conflicting");
  assert.match(time.display,/সূত্রভেদে/);
});
test("supplied verified incident timestamp takes precedence over headline parsing",()=>{
  const x=item({title:"ঢাকায় বিস্ফোরণ",incidentAt:"2026-11-04T14:30:00Z",incidentTimePrecision:"approximate"});
  const time=extractIncidentTime(x);
  assert.equal(time.precision,"approximate");
});
test("alert location is rendered as one hierarchical address line",()=>{
  const x=item({location:{village:"পূর্বপাড়া",union:"সদর ইউনিয়ন",upazila:"গোপালগঞ্জ সদর",district:"গোপালগঞ্জ",division:"ঢাকা",country:"বাংলাদেশ"}});
  assert.equal(extractAlertLocation(x),"পূর্বপাড়া, সদর ইউনিয়ন, গোপালগঞ্জ সদর, গোপালগঞ্জ, ঢাকা, বাংলাদেশ");
});
test("full alert includes title, description, location, incident and publication times, source links and verification",()=>{
  const x=item({title:"ঢাকায় রাত ৮টার দিকে বিস্ফোরণ",summary:"একটি এলাকায় বিস্ফোরণের ঘটনা ঘটেছে।",location:{district:"ঢাকা",division:"ঢাকা",country:"বাংলাদেশ"},sourceLinks:[{name:"The Daily Star",url:"https://www.thedailystar.net/news/bangladesh/example"}]});
  const d=evaluateNewsAlert(x,{now});
  const message=formatAlertMessage(x,d,{key:"abc123"});
  assert.match(message,/রাত ৮/);
  assert.match(message,/প্রকাশের সময়/);
  assert.match(message,/ঘটনার সময়/);
  assert.match(message,/ঘটনার বিবরণ|একটি এলাকায়/);
  assert.match(message,/📍/);
  assert.match(message,/The Daily Star/);
  assert.match(message,/PROVISIONAL/);
});


test("ambiguous 12-hour clock is not assigned AM or PM",()=>{
  const x=item({title:"ঢাকায় ৮:৩০ মিনিটে বিস্ফোরণ",publishedAt:"2026-11-04T16:00:00Z"});
  const time=extractIncidentTime(x);
  assert.equal(time.precision,"time_only");
  assert.match(time.display,/সময়কাল অনির্দিষ্ট/);
});
test("weekday and period-only incident time is resolved against publication date",()=>{
  const x=item({title:"মঙ্গলবার রাতে বিস্ফোরণ",publishedAt:"2026-11-04T16:00:00Z"});
  const time=extractIncidentTime(x);
  assert.equal(time.precision,"period");
  assert.match(time.display,/গত রাত/);
});
test("Worker emits an update when incident time, location or incident details change",async()=>{
  const source=await readFile(new URL("../cloudflare/portfolio-contact-telegram.js",import.meta.url),"utf8");
  assert.match(source,/incidentTimeChanged/);
  assert.match(source,/locationChanged/);
  assert.match(source,/detailsChanged/);
  assert.match(source,/sourceLinkExpanded/);
  assert.match(source,/updatePayload/);
});

test("official weather bulletin can verify a fresh local warning without a news publisher",()=>{
  const decision=evaluateNewsAlert(item({title:"Bangladesh cyclone warning",summary:"Severe coastal cyclone alert",category:"Weather & Disasters",sourceEvidence:[],source:"",publisherName:"",publisherUrl:"https://example.com/weather"}),{now,officialSignal:true});
  assert.equal(decision.eligible,true);
  assert.equal(decision.verificationMode,"official_weather");
  assert.equal(decision.trustedSources.length,0);
});
test("official weather bulletin can corroborate one publisher",()=>assert.equal(evaluateNewsAlert(item({title:"বাংলাদেশে ঘূর্ণিঝড়ের জরুরি সতর্কতা",summary:"উপকূলে চরম ঝুঁকি",category:"Weather & Disasters",sourceEvidence:["The Daily Star"]}),{now,officialSignal:true}).eligible,true));
test("corroborated severe weather alert may be up to three hours old",()=>assert.equal(evaluateNewsAlert(item({title:"Sylhet flood warning issued",summary:"Severe flooding near danger level",category:"Weather & Disasters",publishedAt:new Date(now-120*60000).toISOString()}),{now}).eligible,true));
test("single-source weather alert still needs an official source after one hour",()=>assert.equal(evaluateNewsAlert(item({title:"Sylhet flood warning issued",summary:"Severe flooding near danger level",category:"Weather & Disasters",sourceEvidence:["The Daily Star"],publishedAt:new Date(now-120*60000).toISOString()}),{now}).reason,"stale"));
test("earthquake magnitude is treated as a significant natural disaster",()=>assert.equal(evaluateNewsAlert(item({title:"Sylhet earthquake reaches magnitude 5.8",summary:"Magnitude 5.8 earthquake",category:"Bangladesh"}),{now}).eligible,true));
test("heavy rainfall warning is classified as severe weather",()=>assert.equal(evaluateNewsAlert(item({title:"Bangladesh heavy rainfall warning",summary:"Severe heavy rain alert",category:"Weather & Disasters"}),{now}).eligible,true));
test("severe weather candidates are selected for official checks",()=>assert.equal(isWeatherCandidate(item({title:"Bangladesh severe cyclone warning",summary:"Emergency evacuation alert"})),true));
test("ordinary weather forecast is not sent for official disaster checks",()=>assert.equal(isWeatherCandidate(item({title:"Bangladesh weekly weather forecast",summary:"Sunny and warm"})),false));
test("weather alert requires severe wording",()=>assert.equal(evaluateNewsAlert(item({title:"ঢাকায় আজ আবহাওয়া কেমন",summary:"weather forecast",category:"Bangladesh"}),{now}).reason,"not_significant"));
test("major accident qualifies even when no casualty count is reported",()=>assert.equal(evaluateNewsAlert(item({title:"Dhaka major accident closes airport road",summary:"Major accident in Dhaka",sourceEvidence:["The Daily Star","Prothom Alo"]}),{now}).eligible,true));
test("BBC regional editions count as one publisher group and remain provisional",()=>{const d=evaluateNewsAlert(item({sourceEvidence:["BBC News বাংলা","BBC News World"]}),{now});assert.equal(d.eligible,true);assert.equal(d.status,"provisional");assert.deepEqual(d.trustedSources,["BBC"]);});
test("referendum result qualifies",()=>assert.equal(evaluateNewsAlert(item({title:"বাংলাদেশে গণভোটের ফলাফল ঘোষণা",summary:"চূড়ান্ত সিদ্ধান্ত জানানো হয়েছে"}),{now}).eligible,true));
test("referendum mention without decision does not qualify",()=>assert.equal(evaluateNewsAlert(item({title:"গণভোট নিয়ে আলোচনা চলছে",summary:"সাধারণ আলোচনা"} ),{now}).reason,"not_significant"));
test("major uprising development qualifies",()=>assert.equal(evaluateNewsAlert(item({title:"গণঅভ্যুত্থানের পর সরকার পদত্যাগের ঘোষণা",summary:"Dhaka Bangladesh"}),{now}).eligible,true));
test("major uprising commission report qualifies",()=>assert.equal(evaluateNewsAlert(item({title:"জুলাই গণঅভ্যুত্থান কমিশনের প্রতিবেদন জমা",summary:"ঢাকায় সরকারি সিদ্ধান্ত"}),{now}).eligible,true));
test("historic uprising anniversary is rejected",()=>assert.equal(evaluateNewsAlert(item({title:"গণঅভ্যুত্থানের বার্ষিকী",summary:"ঢাকায় স্মরণ অনুষ্ঠান"}),{now}).reason,"follow_up"));
test("murder qualifies",()=>assert.equal(evaluateNewsAlert(item({title:"ঢাকায় ব্যবসায়ীকে হত্যা",summary:"পুলিশ murder case"}),{now}).eligible,true));
test("serious clash with gunfire qualifies",()=>assert.equal(evaluateNewsAlert(item({title:"ঢাকায় সংঘর্ষে গুলিবর্ষণ",summary:"সশস্ত্র সংঘর্ষ"}),{now}).eligible,true));
test("peaceful demonstration is not a serious violence alert",()=>assert.equal(evaluateNewsAlert(item({title:"ঢাকায় শান্তিপূর্ণ বিক্ষোভ",summary:"প্রতিবাদ কর্মসূচি"}),{now}).reason,"not_significant"));
test("celebrity natural death is not an accident alert",()=>assert.equal(evaluateNewsAlert(item({title:"ঢাকায় অভিনেতার মৃত্যু",summary:"পরিবারের পক্ষ থেকে নিশ্চিত"}),{now}).reason,"not_significant"));
test("international earthquake is excluded from Bangladesh-only alerts",()=>assert.equal(evaluateNewsAlert(item({title:"Major earthquake kills people in Chile",summary:"South America",category:"World"}),{now}).reason,"outside_bangladesh"));
test("Bangladesh feed category alone cannot localize a foreign event",()=>assert.equal(evaluateNewsAlert(item({title:"Major earthquake kills people in Chile",summary:"South America",category:"Bangladesh"}),{now}).eligible,false));
test("official local warning can localize a weather story without a place in its headline",()=>assert.equal(evaluateNewsAlert(item({title:"Severe flood warning issued",summary:"Emergency bulletin",category:"Weather & Disasters",location:{city:"Dhaka",country:"Bangladesh"},sourceEvidence:["The Daily Star"]}),{now,officialSignal:true}).eligible,true));
test("district-only Bangladesh location is recognized",()=>assert.equal(evaluateNewsAlert(item({title:"নারায়ণগঞ্জে বড় বাস দুর্ঘটনা",summary:"নারায়ণগঞ্জে গুরুতর দুর্ঘটনা"}),{now}).eligible,true));
test("foreign war affecting Bangladeshi nationals is outside the domestic alert scope",()=>assert.equal(evaluateNewsAlert(item({title:"Middle East war forces evacuation of Bangladeshi nationals",summary:"Bangladeshi nationals evacuated",category:"World"}),{now}).reason,"outside_bangladesh"));
test("foreign attack affecting Bangladeshis is excluded from the domestic alert scope",()=>assert.equal(evaluateNewsAlert(item({title:"Terror attack targets Bangladeshi nationals abroad",summary:"Bangladeshi nationals injured",category:"World"}),{now}).reason,"outside_bangladesh"));
test("foreign war without a Bangladesh location is excluded",()=>assert.equal(evaluateNewsAlert(item({title:"War escalates after airstrikes",summary:"Regional conflict abroad",category:"World"}),{now}).reason,"outside_bangladesh"));
test("international event mentioning Bangladesh but occurring abroad is excluded",()=>assert.equal(evaluateNewsAlert(item({title:"Severe cyclone disrupts flights to Bangladesh",summary:"Bangladesh-bound flights cancelled",category:"World"}),{now}).reason,"outside_bangladesh"));
test("murder suspect arrest follow-up is rejected",()=>assert.equal(evaluateNewsAlert(item({title:"Dhaka murder suspect arrested",summary:"Police arrested the suspect"}),{now}).reason,"follow_up"));
test("severe wildfire damage qualifies as a disaster alert",()=>assert.equal(evaluateNewsAlert(item({title:"Wildfire destroys homes in Chattogram",summary:"Severe wildfire damage",category:"Weather & Disasters"}),{now}).eligible,true));
test("follow-up and investigation stories are rejected",()=>assert.equal(evaluateNewsAlert(item({title:"ঢাকার দুর্ঘটনার তদন্ত চলছে"}),{now}).reason,"follow_up"));
test("undated stories are rejected",()=>assert.equal(evaluateNewsAlert(item({publishedAt:""}),{now}).reason,"undated"));
test("stories older than one hour are rejected",()=>assert.equal(evaluateNewsAlert(item({publishedAt:new Date(now-61*60000).toISOString()}),{now}).reason,"stale"));
test("future stories beyond five minutes are rejected",()=>assert.equal(evaluateNewsAlert(item({publishedAt:new Date(now+6*60000).toISOString()}),{now}).reason,"stale"));
test("breaking flag alone cannot make an ordinary headline eligible",()=>{
  const decision=evaluateNewsAlert(item({title:"ঢাকায় নিয়মিত সংবাদ",summary:"সাধারণ আপডেট",isBreaking:true}),{now});
  assert.equal(decision.reason,"not_significant");
});
test("Google News redirect is not accepted as original article URL",()=>assert.equal(evaluateNewsAlert(item({publisherUrl:"https://news.google.com/rss/articles/abc"}),{now}).reason,"not_original_url"));
test("photo is preferred over video when both are available",()=>assert.deepEqual(mediaCandidates({videoUrl:"https://cdn.example/video.mp4",previewImage:"https://cdn.example/photo.jpg",image:"javascript:bad"}),[{type:"photo",url:"https://cdn.example/photo.jpg"},{type:"video",url:"https://cdn.example/video.mp4"}]));
test("photo-only media falls back cleanly",()=>assert.deepEqual(mediaCandidates({image:"https://cdn.example/a.png"}),[{type:"photo",url:"https://cdn.example/a.png"}]));
test("HTML is escaped before Telegram HTML parse mode",()=>assert.equal(escapeHtml("<x a=\"b\">&'"),"&lt;x a=&quot;b&quot;&gt;&amp;&#39;"));
test("official DDM signal requires a recent dated warning",()=>assert.equal(parseOfficialDisasterSignal("Flood Alert Warning Last update: 2026-11-03 20:00:00 Bangladesh district flood warning",item({title:"Bangladesh severe flood warning",summary:"Flood warning for Bangladesh",category:"Weather & Disasters"}),now).confirmed,true));
test("stale official warning is not corroboration",()=>assert.equal(parseOfficialDisasterSignal("Flood Alert Warning Last update: 2026-10-20 20:00:00 Bangladesh district flood warning",item({title:"Bangladesh severe flood warning"}),now).confirmed,false));
test("official page without matching hazard is not corroboration",()=>assert.equal(parseOfficialDisasterSignal("Heat wave warning Last update: 2026-11-03 20:00:00 Bangladesh",item({title:"Bangladesh severe flood warning"}),now).confirmed,false));
test("official bulletin for a different district is not corroboration",()=>assert.equal(parseOfficialDisasterSignal("Flood Alert Warning Last update: 2026-11-03 20:00:00 Bangladesh district flood warning Sylhet",item({title:"Dhaka flood warning"}),now).confirmed,false));
test("Bangladesh DDM bulletin cannot corroborate a foreign-location weather event",()=>{
  const page="Flood Alert Warning Last update: 2026-11-03 20:00:00 Bangladesh district flood warning Cox's Bazar";
  const foreign=item({title:"Greece flood warning",summary:"Flood warning for a Greek island",location:"Greece",category:"Weather & Disasters"});
  assert.equal(parseOfficialDisasterSignal(page,foreign,now).confirmed,false);
  const decision=evaluateNewsAlert({...foreign,sourceEvidence:[],source:"",publisherUrl:"https://example.com/story"},{now,officialSignal:true});
  assert.equal(decision.eligible,false);
});

test("video failure falls back to photo",async()=>{
  const calls=[];
  const result=await deliverWithMediaFallback([{type:"video",url:"https://cdn.example/v.mp4"},{type:"photo",url:"https://cdn.example/p.jpg"}],"caption","https://news.example/a",async method=>{calls.push(method);return method==="sendPhoto";});
  assert.equal(result,"photo");
  assert.deepEqual(calls,["sendVideo","sendPhoto"]);
});
test("media transport exceptions still fall back to text",async()=>{
  const calls=[];
  const result=await deliverWithMediaFallback([{type:"video",url:"https://cdn.example/v.mp4"},{type:"photo",url:"https://cdn.example/p.jpg"}],"caption","https://news.example/a",async method=>{calls.push(method);if(method==="sendVideo")throw new Error("network timeout");return method==="sendMessage";});
  assert.equal(result,"text");
  assert.deepEqual(calls,["sendVideo","sendPhoto","sendMessage"]);
});
test("no-media alert sends only its single caption message",async()=>{
  const calls=[];
  const result=await deliverWithMediaFallback([],"caption with embedded article link","https://news.example/original",async(method,payload)=>{calls.push({method,payload});return true;});
  assert.equal(result,"text");
  assert.equal(calls.length,1);
  assert.equal(calls[0].method,"sendMessage");
  assert.equal(calls[0].payload.text,"caption with embedded article link");
});
test("long original URLs remain clickable inside the first alert message",()=>{
  const url="https://www.unb.com.bd/video/"+("long-bengali-slug-".repeat(18))+"-Gopalganj-UNB";
  const x=item({publisherUrl:url});
  const message=formatAlertMessage(x,evaluateNewsAlert(x,{now}),{key:"long-link"});
  assert.ok(message.includes('<a href="'+url+'">মূল সংবাদ পড়ুন</a>'));
  assert.doesNotMatch(message,/লিংক আলাদা বার্তায়/);
});

test("dedup key is deterministic and normalized",async()=>assert.equal(await newsAlertKey("Dhaka — Crash!"),await newsAlertKey("dhaka crash")));
test("dedup key normalizes headline word order and common verb forms",async()=>assert.equal(await newsAlertKey("Dhaka fire kills 3"),await newsAlertKey("3 killed in Dhaka fire")));
test("dedup key strips a publisher suffix from the headline",async()=>assert.equal(await newsAlertKey("Dhaka fire kills 3 - The Daily Star","The Daily Star"),await newsAlertKey("3 killed in Dhaka fire - Prothom Alo","Prothom Alo")));

test("Bangladesh alert location resolves district and division from headline",()=>assert.equal(extractAlertLocation(item({title:"নারায়ণগঞ্জে বড় বাস দুর্ঘটনা",summary:"নারায়ণগঞ্জে গুরুতর দুর্ঘটনা"})),"নারায়ণগঞ্জ, ঢাকা বিভাগ, বাংলাদেশ"));
test("headline village name is included when explicitly stated",()=>assert.ok(extractAlertLocation(item({title:"হ্নীলা গ্রামে বন্যা",summary:"কক্সবাজার এলাকায় পানি বৃদ্ধি"})).includes("গ্রাম: হ্নীলা, কক্সবাজার, চট্টগ্রাম বিভাগ, বাংলাদেশ")));
test("structured village and thana location is preserved without guessing",()=>assert.equal(extractAlertLocation(item({title:"Major incident",location:{village:"Hnila",union:"Hnila Union",upazila:"Teknaf",thana:"Teknaf",district:"Cox's Bazar",division:"Chattogram",country:"Bangladesh"}})),"Hnila, Hnila Union, Teknaf, Cox's Bazar, Chattogram, Bangladesh"));
test("Telegram alert includes clickable links for trusted publisher sources only",()=>{
  const x=item({sourceLinks:[
    {name:"The Daily Star",url:"https://www.thedailystar.net/news/example"},
    {name:"Prothom Alo",url:"https://www.prothomalo.com/news/example"},
    {name:"Random Blog",url:"https://random.example/news"}
  ]});
  const d=evaluateNewsAlert(x,{now});
  const message=formatAlertMessage(x,d,{key:"abcd"});
  assert.match(message,/<a href="https:\/\/www\.thedailystar\.net\/news\/example">The Daily Star<\/a>/);
  assert.match(message,/<a href="https:\/\/www\.prothomalo\.com\/news\/example">Prothom Alo<\/a>/);
  assert.doesNotMatch(message,/random\.example/);
});

test("long source-rich alerts use Telegram text mode instead of an oversized media caption",async()=>{
  const methods=[];
  const result=await deliverWithMediaFallback(
    [{type:"photo",url:"https://images.example.test/alert.jpg"}],
    "x".repeat(1100),
    "https://news.example.test/story",
    async(method)=>{methods.push(method);return true;}
  );
  assert.equal(result,"text");
  assert.deepEqual(methods,["sendMessage"]);
});

test("Worker does not send long original URLs as a second alert message",async()=>{
  const source=await readFile(new URL("../cloudflare/portfolio-contact-telegram.js",import.meta.url),"utf8");
  assert.doesNotMatch(source,/if\(link\.length>220\)/);
});
test("Worker checks the legacy alert key before using a clustered event ID",async()=>{
  const source=await readFile(new URL("../cloudflare/portfolio-contact-telegram.js",import.meta.url),"utf8");
  assert.match(source,/let previous=await env\.BOT_CONFIG_KV\.get\(stateKey,"json"\)/);
  assert.match(source,/if\(!previous&&eventId\)/);
  assert.match(source,/legacyKey=await newsAlertKey\(title,String\(item\.source\|\|item\.publisherName\|\|""\)\)/);
  assert.match(source,/news-alert:v2:"\+legacyKey/);
});

test("Bangladesh alert uses Bengali identity and real district location",()=>{const x=item({title:"নারায়ণগঞ্জে বড় বাস দুর্ঘটনা",summary:"নারায়ণগঞ্জে গুরুতর দুর্ঘটনা"});const d=evaluateNewsAlert(x,{now});const m=formatAlertMessage(x,d,{key:"abcd"});assert.ok(m.includes("🇧🇩 <b>BANGLADESH NEWS ALERT</b>"));assert.ok(m.includes("নারায়ণগঞ্জ, ঢাকা বিভাগ, বাংলাদেশ"));assert.equal(m.includes("Dhaka / Bangladesh"),false);});
test("foreign events are rejected rather than formatted as Bangladesh alerts",()=>{const x=item({title:"Major earthquake kills people in Chile",summary:"South America",category:"World"});assert.equal(evaluateNewsAlert(x,{now}).eligible,false);});
test("alert update is visibly numbered",()=>{const x=item();const d=evaluateNewsAlert(x,{now});assert.ok(formatAlertMessage(x,d,{key:"abcd",updateNo:2}).includes("UPDATE 02"));});
test("international stories do not enter the domestic Bangladesh alert feed",()=>{const x=item({title:"Terror attack targets Bangladeshi nationals abroad",summary:"Bangladeshi nationals injured",category:"World"});assert.equal(evaluateNewsAlert(x,{now}).eligible,false);});

test("weather alert without a Bangladesh location is excluded",()=>{const x=item({title:"Severe earthquake warning issued",summary:"Magnitude 6.2 warning",category:"Weather & Disasters",alertScope:"global"});assert.equal(evaluateNewsAlert(x,{now}).reason,"outside_bangladesh");});

test("ordinary murder abroad is excluded from Bangladesh-only alerts",()=>assert.equal(evaluateNewsAlert(item({title:"Man murdered in Paris",summary:"Police investigating the incident",category:"World"}),{now}).reason,"outside_bangladesh"));
test("mass-casualty massacre abroad is excluded from Bangladesh-only alerts",()=>assert.equal(evaluateNewsAlert(item({title:"Massacre kills dozens in Paris",summary:"Dozens killed in mass casualty attack",category:"World"}),{now}).reason,"outside_bangladesh"));


test("Bangla death verb variants qualify in a corroborated Bangladesh clash alert",()=>{
  for(const phrase of ["মারা গেলো","মারা গেছে","মারা গেলেন"]){
    const x=item({title:"ঢাকায় সংঘর্ষে আহত শ্রমিক "+phrase,summary:"ঢাকায় শ্রমিকদের সংঘর্ষে আহত"});
    const decision=evaluateNewsAlert(x,{now});
    assert.equal(decision.eligible,true,phrase);
  }
});

test("upstream non-breaking flag does not block a significant corroborated event",()=>{
  const decision=evaluateNewsAlert(item({isBreaking:false,sourceEvidence:["The Daily Star","Prothom Alo"]}),{now});
  assert.equal(decision.eligible,true);
  assert.equal(decision.sourceCount,2);
  assert.equal(decision.trustedSources.length,2);
});

test("one trusted Jago publisher creates a provisional alert",()=>{
  const decision=evaluateNewsAlert(item({sourceEvidence:["Jago News 24"],source:"Jago News 24"}),{now});
  assert.equal(decision.eligible,true);
  assert.equal(decision.status,"provisional");
  assert.equal(decision.sourceCount,1);
  assert.equal(decision.trustedSources.length,1);
});

test("worker reads a bounded Telegram-only Bangladesh alert feed",async()=>{
  const source=await readFile(new URL("../cloudflare/portfolio-contact-telegram.js",import.meta.url),"utf8");
  const start=source.indexOf("async function newsBreakingAlertCheck(env){");
  const end=source.indexOf("\n\nconst SHEETS_SPREADSHEET_ID",start);
  assert.ok(start>=0&&end>start);
  const alertSource=source.slice(start,end);
  assert.match(alertSource,/news-alert-feed\.json/);
  assert.ok(alertSource.includes("feed?.alertItems"));
  assert.ok(alertSource.includes("slice(0,180)"));
  assert.ok(alertSource.includes("item.alertEventId"));
  assert.ok(alertSource.includes('legacyPrevious.scope==="bangladesh"'));
  assert.ok(alertSource.includes("news-alert-reject:v1:"));
});


test("fatal bus-arson headline is classified as a serious local incident",()=>{
  const x=item({
    title:"জয়পুরহাটে মোটরসাইকেল আরোহী নিহত, বাসে আগুন দিলো ক্ষুব্ধ জনতা",
    summary:"জয়পুরহাটে মোটরসাইকেল আরোহী নিহত হওয়ার পর ক্ষুব্ধ জনতা বাসে আগুন দেয়"
  });
  const decision=evaluateNewsAlert(x,{now});
  assert.equal(decision.eligible,true);
});


test("fatal clash from one trusted publisher is provisionally alerted before casualty corroboration",()=>{
  const decision=evaluateNewsAlert(item({
    title:"জয়পুরহাটে মোটরসাইকেল আরোহী নিহত, বাসে আগুন দিলো ক্ষুব্ধ জনতা",
    summary:"জয়পুরহাটে মোটরসাইকেল আরোহী নিহত হওয়ার পর ক্ষুব্ধ জনতা বাসে আগুন দেয়",
    category:"Bangladesh",isBreaking:false,
    publishedAt:new Date(now-10*60000).toISOString(),
    sourceEvidence:["Jago News 24"],source:"Jago News 24",
    publisherUrl:"https://www.jagonews24.com/country/news/1175881"
  }),{now});
  assert.equal(decision.eligible,true);
  assert.equal(decision.status,"provisional");
  assert.equal(decision.sourceCount,1);
  assert.equal(decision.trustedSources.length,1);
});

test("rejection audits refresh when summary or source counts change",async()=>{
  const source=await readFile(new URL("../cloudflare/portfolio-contact-telegram.js",import.meta.url),"utf8");
  assert.ok(source.includes("old.summary!==record.summary"));
  assert.ok(source.includes("old.sourceCount!==record.sourceCount"));
  assert.ok(source.includes("old.trustedSourceCount!==record.trustedSourceCount"));
});


test("Telegram formatter assigns a subject-specific visitor header and clean HTML",()=>{
  const message=formatTelegramMessage("Visitor ID: VIS-ABC123DEF456\nIP: 203.0.113.10");
  assert.match(message,/^<b>◈ VISITOR INTELLIGENCE<\/b>/);
  assert.match(message,/<code>VIS-ABC123DEF456<\/code>/);
  assert.match(message,/<i>KOKUSHIBU74 · INTELLIGENCE<\/i>$/);
});
test("Telegram formatter escapes plain text and preserves trusted HTML bodies",()=>{
  const plain=formatTelegramMessage("Contact: <script>alert(1)</script> & details");
  assert.match(plain,/&lt;script&gt;/);
  assert.doesNotMatch(plain,/<script>/);
  const html=formatTelegramMessage("<b>Existing heading</b>\n<code>VIS-123</code>",{parseMode:"HTML"});
  assert.match(html,/<b>Existing heading<\/b>/);
  assert.match(html,/<code>VIS-123<\/code>/);
});
test("Telegram formatter removes the old generic admin branding",()=>{
  const message=formatTelegramMessage("◈ KOKUSHIBU74 INTELLIGENCE\n━━━━━━━━━━━━━━━━━━━━\nADMIN CONTROL CENTER\nVisitor details");
  assert.doesNotMatch(message,/ADMIN CONTROL CENTER/);
  assert.match(message,/VISITOR INTELLIGENCE/);
});
test("Telegram message categories distinguish news, Cloudflare, automation and bot replies",()=>{
  assert.equal(telegramMessageCategory("Breaking news article"),"NEWS INTELLIGENCE");
  assert.equal(telegramMessageCategory("Cloudflare resource budget"),"CLOUDFLARE MONITORING");
  assert.equal(telegramMessageCategory("GitHub workflow watchdog failure"),"AUTOMATION MONITORING");
  assert.equal(telegramMessageCategory("Unknown menu action"),"BOT CONTROL CENTER");
});
test("automation recovery is silent but resets failure state for the next failure",()=>{
  assert.deepEqual(automationAlertDecision("failed",false),{failed:true,wasFailed:false,recovered:false,notify:true});
  assert.deepEqual(automationAlertDecision("failed",true),{failed:true,wasFailed:true,recovered:false,notify:false});
  assert.deepEqual(automationAlertDecision("success",true),{failed:false,wasFailed:true,recovered:true,notify:false});
  assert.deepEqual(automationAlertDecision("failed",false),{failed:true,wasFailed:false,recovered:false,notify:true});
});
test("daily report and bot directory no longer use MarkdownV2",async()=>{
  const source=await readFile(new URL("../cloudflare/portfolio-contact-telegram.js",import.meta.url),"utf8");
  assert.doesNotMatch(source,/parse_mode:\s*["']MarkdownV2["']/);
  assert.match(source,/parse_mode:"HTML"/);
  assert.match(source,/automationAlertDecision\(status,previous\?\.failed===true\)/);
});
