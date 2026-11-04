import test from "node:test";
import assert from "node:assert/strict";
import {readFile} from "node:fs/promises";
import {evaluateNewsAlert,mediaCandidates,parseOfficialDisasterSignal,escapeHtml,newsAlertKey,deliverWithMediaFallback,isWeatherCandidate,formatAlertMessage,extractAlertLocation} from "../cloudflare/news-alerts.mjs";
const now=Date.parse("2026-11-04T00:00:00Z");
const item=(overrides={})=>({title:"ঢাকায় বাস দুর্ঘটনায় ৩ জন নিহত",summary:"ঢাকায় ভয়াবহ দুর্ঘটনা",category:"Bangladesh",isBreaking:true,publishedAt:new Date(now-10*60000).toISOString(),publisherUrl:"https://www.thedailystar.net/news/bangladesh/example",sourceEvidence:["The Daily Star","Prothom Alo"],...overrides});

test("Cloudflare Worker loads the alert helper module without invoking Telegram",async()=>{
  const workerPath=new URL("../cloudflare/portfolio-contact-telegram.js",import.meta.url);
  const helperUrl=new URL("../cloudflare/news-alerts.mjs",import.meta.url).href;
  const source=(await readFile(workerPath,"utf8")).replace('"./news-alerts.mjs"',JSON.stringify(helperUrl));
  const dataUrl="data:text/javascript;base64,"+Buffer.from(source,"utf8").toString("base64");
  const worker=await import(dataUrl);
  assert.equal(typeof worker.default.fetch,"function");
  assert.equal(typeof worker.default.scheduled,"function");
});

test("two independent publishers verify a fatal Dhaka accident",()=>assert.equal(evaluateNewsAlert(item(),{now}).eligible,true));
test("two untrusted publishers are not sufficient corroboration",()=>assert.equal(evaluateNewsAlert(item({sourceEvidence:["Random Blog","Unknown News"]}),{now}).reason,"untrusted_sources"));
test("one trusted and one untrusted independent publisher cannot corroborate",()=>assert.equal(evaluateNewsAlert(item({sourceEvidence:["The Daily Star","Local News Desk"]}),{now}).reason,"needs_trusted_corroboration"));
test("two independent trusted publishers corroborate",()=>assert.equal(evaluateNewsAlert(item({sourceEvidence:["The Daily Star","Prothom Alo"]}),{now}).eligible,true));
test("one publisher is insufficient without official confirmation",()=>assert.equal(evaluateNewsAlert(item({sourceEvidence:["The Daily Star"]}),{now}).reason,"needs_trusted_corroboration"));
test("official weather source does not replace a trusted publisher",()=>assert.equal(evaluateNewsAlert(item({title:"বাংলাদেশে ঘূর্ণিঝড়ের জরুরি সতর্কতা",summary:"উপকূলে চরম ঝুঁকি",category:"Weather & Disasters",sourceEvidence:["Random Blog"]}),{now,officialSignal:true}).reason,"untrusted_sources"));
test("official weather bulletin can corroborate one publisher",()=>assert.equal(evaluateNewsAlert(item({title:"বাংলাদেশে ঘূর্ণিঝড়ের জরুরি সতর্কতা",summary:"উপকূলে চরম ঝুঁকি",category:"Weather & Disasters",sourceEvidence:["The Daily Star"]}),{now,officialSignal:true}).eligible,true));
test("corroborated severe weather alert may be up to three hours old",()=>assert.equal(evaluateNewsAlert(item({title:"Sylhet flood warning issued",summary:"Severe flooding near danger level",category:"Weather & Disasters",publishedAt:new Date(now-120*60000).toISOString()}),{now}).eligible,true));
test("single-source weather alert still needs an official source after one hour",()=>assert.equal(evaluateNewsAlert(item({title:"Sylhet flood warning issued",summary:"Severe flooding near danger level",category:"Weather & Disasters",sourceEvidence:["The Daily Star"],publishedAt:new Date(now-120*60000).toISOString()}),{now}).reason,"stale"));
test("earthquake magnitude is treated as a significant natural disaster",()=>assert.equal(evaluateNewsAlert(item({title:"Sylhet earthquake reaches magnitude 5.8",summary:"Magnitude 5.8 earthquake",category:"Bangladesh"}),{now}).eligible,true));
test("heavy rainfall warning is classified as severe weather",()=>assert.equal(evaluateNewsAlert(item({title:"Bangladesh heavy rainfall warning",summary:"Severe heavy rain alert",category:"Weather & Disasters"}),{now}).eligible,true));
test("severe weather candidates are selected for official checks",()=>assert.equal(isWeatherCandidate(item({title:"Bangladesh severe cyclone warning",summary:"Emergency evacuation alert"})),true));
test("ordinary weather forecast is not sent for official disaster checks",()=>assert.equal(isWeatherCandidate(item({title:"Bangladesh weekly weather forecast",summary:"Sunny and warm"})),false));
test("weather alert requires severe wording",()=>assert.equal(evaluateNewsAlert(item({title:"ঢাকায় আজ আবহাওয়া কেমন",summary:"weather forecast",category:"Bangladesh"}),{now}).reason,"not_significant"));
test("major accident qualifies even when no casualty count is reported",()=>assert.equal(evaluateNewsAlert(item({title:"Dhaka major accident closes airport road",summary:"Major accident in Dhaka",sourceEvidence:["The Daily Star","Prothom Alo"]}),{now}).eligible,true));
test("BBC regional editions count as one publisher group",()=>assert.equal(evaluateNewsAlert(item({sourceEvidence:["BBC News বাংলা","BBC News World"]}),{now}).reason,"needs_trusted_corroboration"));
test("referendum result qualifies",()=>assert.equal(evaluateNewsAlert(item({title:"বাংলাদেশে গণভোটের ফলাফল ঘোষণা",summary:"চূড়ান্ত সিদ্ধান্ত জানানো হয়েছে"}),{now}).eligible,true));
test("referendum mention without decision does not qualify",()=>assert.equal(evaluateNewsAlert(item({title:"গণভোট নিয়ে আলোচনা চলছে",summary:"সাধারণ আলোচনা"} ),{now}).reason,"not_significant"));
test("major uprising development qualifies",()=>assert.equal(evaluateNewsAlert(item({title:"গণঅভ্যুত্থানের পর সরকার পদত্যাগের ঘোষণা",summary:"Dhaka Bangladesh"}),{now}).eligible,true));
test("major uprising commission report qualifies",()=>assert.equal(evaluateNewsAlert(item({title:"জুলাই গণঅভ্যুত্থান কমিশনের প্রতিবেদন জমা",summary:"ঢাকায় সরকারি সিদ্ধান্ত"}),{now}).eligible,true));
test("historic uprising anniversary is rejected",()=>assert.equal(evaluateNewsAlert(item({title:"গণঅভ্যুত্থানের বার্ষিকী",summary:"ঢাকায় স্মরণ অনুষ্ঠান"}),{now}).reason,"follow_up"));
test("murder qualifies",()=>assert.equal(evaluateNewsAlert(item({title:"ঢাকায় ব্যবসায়ীকে হত্যা",summary:"পুলিশ murder case"}),{now}).eligible,true));
test("serious clash with gunfire qualifies",()=>assert.equal(evaluateNewsAlert(item({title:"ঢাকায় সংঘর্ষে গুলিবর্ষণ",summary:"সশস্ত্র সংঘর্ষ"}),{now}).eligible,true));
test("peaceful demonstration is not a serious violence alert",()=>assert.equal(evaluateNewsAlert(item({title:"ঢাকায় শান্তিপূর্ণ বিক্ষোভ",summary:"প্রতিবাদ কর্মসূচি"}),{now}).reason,"not_significant"));
test("celebrity natural death is not an accident alert",()=>assert.equal(evaluateNewsAlert(item({title:"ঢাকায় অভিনেতার মৃত্যু",summary:"পরিবারের পক্ষ থেকে নিশ্চিত"}),{now}).reason,"not_significant"));
test("major international earthquake is accepted as a global alert",()=>assert.equal(evaluateNewsAlert(item({title:"Major earthquake kills people in Chile",summary:"South America",category:"World"}),{now}).scope,"global"));
test("Bangladesh feed category alone cannot localize a foreign event",()=>assert.equal(evaluateNewsAlert(item({title:"Major earthquake kills people in Chile",summary:"South America",category:"Bangladesh"}),{now}).eligible,false));
test("official local warning can localize a weather story without a place in its headline",()=>assert.equal(evaluateNewsAlert(item({title:"Severe flood warning issued",summary:"Emergency bulletin",category:"Weather & Disasters",sourceEvidence:["The Daily Star"]}),{now,officialSignal:true}).eligible,true));
test("district-only Bangladesh location is recognized",()=>assert.equal(evaluateNewsAlert(item({title:"নারায়ণগঞ্জে বড় বাস দুর্ঘটনা",summary:"নারায়ণগঞ্জে গুরুতর দুর্ঘটনা"}),{now}).eligible,true));
test("international war affecting Bangladeshi nationals qualifies",()=>assert.equal(evaluateNewsAlert(item({title:"Middle East war forces evacuation of Bangladeshi nationals",summary:"Bangladeshi nationals evacuated",category:"World"}),{now}).eligible,true));
test("international attack affecting Bangladeshis qualifies",()=>assert.equal(evaluateNewsAlert(item({title:"Terror attack targets Bangladeshi nationals abroad",summary:"Bangladeshi nationals injured",category:"World"}),{now}).eligible,true));
test("major foreign war without Bangladesh impact is accepted globally",()=>assert.equal(evaluateNewsAlert(item({title:"War escalates after airstrikes",summary:"Regional conflict abroad",category:"World"}),{now}).scope,"global"));
test("international event directly affecting Bangladesh qualifies",()=>assert.equal(evaluateNewsAlert(item({title:"Severe cyclone disrupts flights to Bangladesh",summary:"Bangladesh-bound flights cancelled",category:"World"}),{now}).eligible,true));
test("murder suspect arrest follow-up is rejected",()=>assert.equal(evaluateNewsAlert(item({title:"Dhaka murder suspect arrested",summary:"Police arrested the suspect"}),{now}).reason,"follow_up"));
test("severe wildfire damage qualifies as a disaster alert",()=>assert.equal(evaluateNewsAlert(item({title:"Wildfire destroys homes in Chattogram",summary:"Severe wildfire damage",category:"Weather & Disasters"}),{now}).eligible,true));
test("follow-up and investigation stories are rejected",()=>assert.equal(evaluateNewsAlert(item({title:"ঢাকার দুর্ঘটনার তদন্ত চলছে"}),{now}).reason,"follow_up"));
test("undated stories are rejected",()=>assert.equal(evaluateNewsAlert(item({publishedAt:""}),{now}).reason,"undated"));
test("stories older than one hour are rejected",()=>assert.equal(evaluateNewsAlert(item({publishedAt:new Date(now-61*60000).toISOString()}),{now}).reason,"stale"));
test("future stories beyond five minutes are rejected",()=>assert.equal(evaluateNewsAlert(item({publishedAt:new Date(now+6*60000).toISOString()}),{now}).reason,"stale"));
test("breaking flag is mandatory",()=>assert.equal(evaluateNewsAlert(item({isBreaking:false}),{now}).reason,"not_breaking"));
test("Google News redirect is not accepted as original article URL",()=>assert.equal(evaluateNewsAlert(item({publisherUrl:"https://news.google.com/rss/articles/abc"}),{now}).reason,"not_original_url"));
test("photo is preferred over video when both are available",()=>assert.deepEqual(mediaCandidates({videoUrl:"https://cdn.example/video.mp4",previewImage:"https://cdn.example/photo.jpg",image:"javascript:bad"}),[{type:"photo",url:"https://cdn.example/photo.jpg"},{type:"video",url:"https://cdn.example/video.mp4"}]));
test("photo-only media falls back cleanly",()=>assert.deepEqual(mediaCandidates({image:"https://cdn.example/a.png"}),[{type:"photo",url:"https://cdn.example/a.png"}]));
test("HTML is escaped before Telegram HTML parse mode",()=>assert.equal(escapeHtml("<x a=\"b\">&'"),"&lt;x a=&quot;b&quot;&gt;&amp;&#39;"));
test("official DDM signal requires a recent dated warning",()=>assert.equal(parseOfficialDisasterSignal("Flood Alert Warning Last update: 2026-11-03 20:00:00 Bangladesh district flood warning",item({title:"Bangladesh severe flood warning",summary:"Flood warning for Bangladesh",category:"Weather & Disasters"}),now).confirmed,true));
test("stale official warning is not corroboration",()=>assert.equal(parseOfficialDisasterSignal("Flood Alert Warning Last update: 2026-10-20 20:00:00 Bangladesh district flood warning",item({title:"Bangladesh severe flood warning"}),now).confirmed,false));
test("official page without matching hazard is not corroboration",()=>assert.equal(parseOfficialDisasterSignal("Heat wave warning Last update: 2026-11-03 20:00:00 Bangladesh",item({title:"Bangladesh severe flood warning"}),now).confirmed,false));
test("official bulletin for a different district is not corroboration",()=>assert.equal(parseOfficialDisasterSignal("Flood Alert Warning Last update: 2026-11-03 20:00:00 Bangladesh district flood warning Sylhet",item({title:"Dhaka flood warning"}),now).confirmed,false));

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
test("no-media alert uses text with the original article URL",async()=>{
  let body;
  const result=await deliverWithMediaFallback([],"caption","https://news.example/original",async(method,payload)=>{body=payload;return method==="sendMessage";});
  assert.equal(result,"text");
  assert.match(body.text,/https:\/\/news\.example\/original/);
});

test("dedup key is deterministic and normalized",async()=>assert.equal(await newsAlertKey("Dhaka — Crash!"),await newsAlertKey("dhaka crash")));
test("dedup key normalizes headline word order and common verb forms",async()=>assert.equal(await newsAlertKey("Dhaka fire kills 3"),await newsAlertKey("3 killed in Dhaka fire")));
test("dedup key strips a publisher suffix from the headline",async()=>assert.equal(await newsAlertKey("Dhaka fire kills 3 - The Daily Star","The Daily Star"),await newsAlertKey("3 killed in Dhaka fire - Prothom Alo","Prothom Alo")));

test("Bangladesh alert location resolves district and division from headline",()=>assert.equal(extractAlertLocation(item({title:"নারায়ণগঞ্জে বড় বাস দুর্ঘটনা",summary:"নারায়ণগঞ্জে গুরুতর দুর্ঘটনা"})),"নারায়ণগঞ্জ, ঢাকা বিভাগ, বাংলাদেশ"));
test("headline village name is included when explicitly stated",()=>assert.ok(extractAlertLocation(item({title:"হ্নীলা গ্রামে বন্যা",summary:"কক্সবাজার এলাকায় পানি বৃদ্ধি"})).includes("গ্রাম: হ্নীলা, কক্সবাজার, চট্টগ্রাম বিভাগ, বাংলাদেশ")));
test("structured village and thana location is preserved without guessing",()=>assert.equal(extractAlertLocation(item({title:"Major incident",location:{village:"Hnila",union:"Hnila Union",upazila:"Teknaf",thana:"Teknaf",district:"Cox's Bazar",division:"Chattogram",country:"Bangladesh"}})),"Hnila, Hnila Union, Teknaf, Teknaf, Cox's Bazar, Chattogram, Bangladesh"));
test("Bangladesh alert uses Bengali identity and real district location",()=>{const x=item({title:"নারায়ণগঞ্জে বড় বাস দুর্ঘটনা",summary:"নারায়ণগঞ্জে গুরুতর দুর্ঘটনা"});const d=evaluateNewsAlert(x,{now});const m=formatAlertMessage(x,d,{key:"abcd"});assert.ok(m.includes("🇧🇩 <b>BANGLADESH ALERT NETWORK</b>"));assert.ok(m.includes("নারায়ণগঞ্জ, ঢাকা বিভাগ, বাংলাদেশ"));assert.equal(m.includes("Dhaka / Bangladesh"),false);});
test("international alert uses global identity and does not hardcode Dhaka",()=>{const x=item({title:"Major earthquake kills people in Chile",summary:"South America",category:"World"});const d=evaluateNewsAlert(x,{now});const m=formatAlertMessage(x,d,{key:"1234"});assert.ok(m.includes("🌐 <b>GLOBAL ALERT NETWORK</b>"));assert.ok(m.includes("Chile"));assert.equal(m.includes("Dhaka / Bangladesh"),false);});
test("alert update is visibly numbered",()=>{const x=item();const d=evaluateNewsAlert(x,{now});assert.ok(formatAlertMessage(x,d,{key:"abcd",updateNo:2}).includes("UPDATE 02"));});
test("international story affecting Bangladeshis stays global and marks Bangladesh impact",()=>{const x=item({title:"Terror attack targets Bangladeshi nationals abroad",summary:"Bangladeshi nationals injured",category:"World"});const d=evaluateNewsAlert(x,{now});assert.equal(d.scope,"global");assert.equal(d.bangladeshImpact,true);});
