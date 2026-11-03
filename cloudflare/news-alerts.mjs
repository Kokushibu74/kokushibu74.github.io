const DEATH = /(নিহত|মারা গেছেন|মৃত্যু|killed|dead|death toll|fatal)/i;
const MURDER = /(খুন|হত্যা|murder|homicide|assassinat)/i;
const ACCIDENT = /(দুর্ঘটনা|বাস দুর্ঘটনা|ট্রেন দুর্ঘটনা|লঞ্চ দুর্ঘটনা|নৌকাডুবি|ভবন ধস|ধসে পড়|বিস্ফোরণ|অগ্নিকাণ্ড|আগুনে পুড়ে|major accident|mass accident|crash|collision|derailment|capsiz|collapse|explosion|major fire|stampede)/i;
const MAJOR_ACCIDENT = /(major|mass|multiple vehicles|catastrophic|severe|large[- ]scale|building collapse|train derailment|launch capsiz|stampede|explosion|ভবন ধস|নৌকাডুবি|ট্রেন দুর্ঘটনা|বিস্ফোরণ|ভয়াবহ|ভয়াবহ|গুরুতর|বড় দুর্ঘটনা|বৃহৎ|বহু যানবাহন)/i;
const CLASH = /(সংঘর্ষ|গুলিবর্ষণ|গুলি চালনা|সশস্ত্র হামলা|হামলা|clash|shooting|armed attack|riot|violence|police firing)/i;
const INTERNATIONAL_CRISIS = /(war|armed conflict|airstrike|invasion|ceasefire|embassy evacuation|regional conflict|shipping crisis)/i;
const SERIOUS = /(নিহত|মৃত্যু|আহত|গুলিবর্ষণ|গুলি|সশস্ত্র|কারফিউ|জরুরি অবস্থা|সেনা মোতায়েন|army deployed|curfew|fatal|killed|injured|mass casualty|armed|emergency)/i;
const UPRISING = /(গণঅভ্যুত্থান|mass uprising|uprising)/i;
const UPRISING_DEVELOPMENT = /(পদত্যাগ|ক্ষমতাচ্যুত|সরকার পতন|কারফিউ|সংসদ ভেঙে|সেনা মোতায়েন|জরুরি অবস্থা|অন্তর্বর্তী সরকার|রায়|রায়|কমিশন প্রতিবেদন|প্রতিবেদন জমা|সুপারিশ|সংবিধান সংস্কার|আদালতের সিদ্ধান্ত|সরকারি ঘোষণা|resign|ousted|government falls|curfew|parliament dissolved|army deployed|emergency declared|interim government|commission report|recommendation|verdict|ruling)/i;
const REFERENDUM = /(গণভোট|referendum)/i;
const REFERENDUM_CHANGE = /(তারিখ|ফলাফল|ফল|সিদ্ধান্ত|অনুমোদন|প্রত্যাখ্যান|স্থগিত|ঘোষণা|date|result|decision|approved|rejected|postponed|rescheduled|announced|vote count)/i;
const WEATHER = /(ঘূর্ণিঝড়|ঘূর্ণিঝড়|বন্যা|জলোচ্ছ্বাস|ভূমিকম্প|পাহাড়ধস|পাহাড়ধস|অতিবৃষ্টি|ভারী বৃষ্টি|তাপপ্রবাহ|কালবৈশাখী|বজ্রপাত|দাবানল|খরা|cyclone|flood|storm surge|earthquake|landslide|heavy rain|rainfall|wildfire|drought|lightning|volcanic eruption|extreme rainfall|heat ?wave|severe storm|flash ?flood|tornado|tsunami)/i;
const WEATHER_SEVERITY = /(সতর্কবার্তা|বিপদ সংকেত|বিপদসীমা|জরুরি সতর্কতা|চরম|ভয়াবহ|ভয়াবহ|অতি ভারী|অত্যন্ত ভারী|নিহত|মৃত্যু|আহত|মাত্রা|ক্ষয়ক্ষতি|ক্ষয়ক্ষতি|ধ্বংস|উচ্ছেদ|evacuat|warning|alert|severe|extreme|major|destroy|landfall|danger level|signal|emergency|magnitude|fatal|killed|deadly|disrupts flights)/i;
const BD = /(বাংলাদেশ|ঢাকা|চট্টগ্রাম|চাট্টোগ্রাম|সিলেট|খুলনা|রাজশাহী|বরিশাল|রংপুর|ময়মনসিংহ|ময়মনসিংহ|কক্সবাজার|কুড়িগ্রাম|কুড়িগ্রাম|সুনামগঞ্জ|সাতক্ষীরা|নারায়ণগঞ্জ|নারায়ণগঞ্জ|গাজীপুর|কুমিল্লা|ফেনী|নোয়াখালী|নোয়াখালী|বগুড়া|বগুড়া|পাবনা|কুষ্টিয়া|কুষ্টিয়া|যশোর|টাঙ্গাইল|জামালপুর|দিনাজপুর|বান্দরবান|রাঙামাটি|খাগড়াছড়ি|ভোলা|পটুয়াখালী|বরগুনা|চাঁদপুর|ব্রাহ্মণবাড়িয়া|লক্ষ্মীপুর|সিরাজগঞ্জ|গাইবান্ধা|নীলফামারী|লালমনিরহাট|পঞ্চগড়|জয়পুরহাট|নওগাঁ|নাটোর|চাঁপাইনবাবগঞ্জ|মাগুরা|নড়াইল|চুয়াডাঙ্গা|মেহেরপুর|বাগেরহাট|পিরোজপুর|ঝালকাঠি|মাদারীপুর|গোপালগঞ্জ|শরীয়তপুর|মুন্সীগঞ্জ|মানিকগঞ্জ|নরসিংদী|কিশোরগঞ্জ|নেত্রকোণা|শেরপুর|হবিগঞ্জ|মৌলভীবাজার|ঠাকুরগাঁও|bangladesh|dhaka|chattogram|chittagong|sylhet|khulna|rajshahi|barishal|rangpur|mymensingh|cox'?s bazar|narayanganj|gazipur|cumilla|comilla|feni|noakhali|bogura|bogra|pabna|kushtia|jashore|jessore|tangail|jamalpur|dinajpur|bandarban|rangamati|khagrachhari|bhola|patuakhali|barguna|chandpur|brahmanbaria|lakshmipur|sirajganj|gaibandha|nilphamari|lalmonirhat|panchagarh|joypurhat|naogaon|natore|chapainawabganj|magura|narail|chuadanga|meherpur|bagerhat|pirojpur|jhalokathi|madaripur|gopalganj|shariatpur|munshiganj|manikganj|narsingdi|kishoreganj|netrokona|sherpur|habiganj|moulvibazar|thakurgaon|bay of bengal|bangladesh coast)/i;
const DIRECT_BD_IMPACT = /(bangladeshi nationals|bangladeshis|bangladesh embassy|bangladesh-bound|flights? (?:to|from) bangladesh|affect(?:s|ing) bangladesh|impact on bangladesh|bangladesh coast|bay of bengal|বাংলাদেশি নাগরিক|বাংলাদেশের নাগরিক|বাংলাদেশ দূতাবাস|বাংলাদেশগামী)/i;
const FOLLOW_UP = /(বার্ষিকী|বছর আগে|বছর পরে|দশক পরে|পেছন ফিরে|স্মরণে|স্মৃতিচারণ|পুরোনো ঘটনা|পূর্বের ঘটনা|তদন্ত চলছে|মামলার অগ্রগতি|রিমান্ডে|চার্জশিট|anniversary|years? ago|years? later|decades? later|look back|retrospective|from the archives|historical footage|old case|past incident|investigation into|remanded|charges? filed|case filed|court orders|follow[- ]?up|what happened after)/i;
const HAZARD_GROUPS = [/(বন্যা|জলোচ্ছ্বাস|flood|flash ?flood)/i,/(ঘূর্ণিঝড়|ঘূর্ণিঝড়|cyclone|hurricane|typhoon)/i,/(ভূমিকম্প|earthquake)/i,/(পাহাড়ধস|পাহাড়ধস|landslide)/i,/(তাপপ্রবাহ|heat ?wave)/i,/(দাবানল|wildfire)/i,/(খরা|drought)/i,/(বজ্রপাত|lightning)/i,/(কালবৈশাখী|ঝড়|storm|tornado|tsunami|extreme rainfall|heavy rain|rainfall)/i];
const GENERIC_SOURCES = new Set(["google news","original publisher","unknown source","news feed",""]);
function canonicalSource(value) {
  const name=String(value||"").trim();
  const lower=name.toLowerCase();
  if(/bbc/.test(lower))return "BBC";
  if(/daily star/.test(lower))return "The Daily Star";
  if(/prothom alo|প্রথম আলো/.test(lower))return "Prothom Alo";
  if(/jago news/.test(lower))return "Jago News 24";
  return name;
}
function normalizeSources(item) {
  return [...new Set((Array.isArray(item.sourceEvidence)?item.sourceEvidence:[])
    .map(canonicalSource).filter(x=>!GENERIC_SOURCES.has(x.toLowerCase())))];
}
export async function newsAlertKey(value,source="") {
  let title=String(value||"");
  const publisher=String(source||"").trim();
  if(publisher){
    for(const separator of [" - "," – "," — "," | "]){
      const suffix=separator+publisher;
      if(title.toLowerCase().endsWith(suffix.toLowerCase())){
        title=title.slice(0,-suffix.length);
        break;
      }
    }
  }
  const stop=new Set(["the","a","an","in","on","at","of","for","and","to","by","from","with","as","after","before","breaking","news","update"]);
  const tokens=title.toLowerCase().replace(/[^\p{L}\p{N}]+/gu," ").trim().split(/\s+/).filter(Boolean)
    .map(token=>token.length>4&&/^[a-z]+$/.test(token)?token.replace(/(?:ing|ed|es|s)$/,""):token)
    .filter(token=>!stop.has(token)&&!/^\d+$/.test(token));
  const normalized=[...new Set(tokens)].sort().join(" ");
  const digest=await crypto.subtle.digest("SHA-256",new TextEncoder().encode(normalized));
  return [...new Uint8Array(digest)].map(x=>x.toString(16).padStart(2,"0")).join("").slice(0,32);
}
export function escapeHtml(value) {
  return String(value??"").replace(/&/g,"&amp;").replace(/</g,"&lt;").replace(/>/g,"&gt;").replace(/"/g,"&quot;").replace(/'/g,"&#39;");
}
export function alertCategory(text) {
  if(WEATHER.test(text))return "Severe Weather / Disaster";
  if(REFERENDUM.test(text))return "গণভোটের সিদ্ধান্ত / ফলাফল";
  if(UPRISING.test(text))return "গণঅভ্যুত্থানের গুরুত্বপূর্ণ ঘটনা";
  if(MURDER.test(text))return "হত্যা / গুরুতর সহিংসতা";
  if(CLASH.test(text))return "গুরুতর সংঘর্ষ / সহিংসতা";
  return "মৃত্যু / বড় দুর্ঘটনা";
}
export function mediaCandidates(item={}) {
  const valid=value=>{try{const u=new URL(String(value||""));return u.protocol==="https:"?u.href:"";}catch{return "";}};
  const video=valid(item.videoUrl||item.video);
  const image=valid(item.previewImage||item.image);
  return [...(video?[{type:"video",url:video}]:[]),...(image?[{type:"photo",url:image}]:[])];
}
function classifyEvent(text) {
  if(WEATHER.test(text)&&WEATHER_SEVERITY.test(text))return {weather:true};
  if(REFERENDUM.test(text)&&REFERENDUM_CHANGE.test(text))return {weather:false};
  if(UPRISING.test(text)&&UPRISING_DEVELOPMENT.test(text))return {weather:false};
  if(MURDER.test(text))return {weather:false};
  if(CLASH.test(text)&&SERIOUS.test(text))return {weather:false};
  if(INTERNATIONAL_CRISIS.test(text)&&(DEATH.test(text)||SERIOUS.test(text)||DIRECT_BD_IMPACT.test(text)))return {weather:false};
  if(ACCIDENT.test(text)&&(DEATH.test(text)||SERIOUS.test(text)||MAJOR_ACCIDENT.test(text)))return {weather:false};
  return null;
}
export function isWeatherCandidate(item={}) {
  const text=String(item.title||"")+" "+String(item.summary||item.previewSummary||"");
  return item.isBreaking===true&&!FOLLOW_UP.test(text)&&WEATHER.test(text)&&WEATHER_SEVERITY.test(text);
}
export function evaluateNewsAlert(item={},options={}) {
  const now=Number(options.now??Date.now()),official=options.officialSignal===true;
  const title=String(item.title||"").trim(),summary=String(item.summary||item.previewSummary||"");
  const text=title+" "+summary+" "+String(item.category||"");
  const localityText=title+" "+summary;
  const fail=reason=>({eligible:false,reason,weather:false,sourceCount:0,sources:[]});
  if(!title||item.isBreaking!==true)return fail("not_breaking");
  if(FOLLOW_UP.test(text))return fail("follow_up");
  const published=Date.parse(item.publishedAt||item.pubDate||"");
  if(!Number.isFinite(published))return fail("undated");
  const event=classifyEvent(text);
  if(!event)return fail("not_significant");
  const sources=normalizeSources(item),sourceCount=sources.length;
  const age=(now-published)/60000;
  const maxAge=event.weather&&(official||sourceCount>=2)?180:60;
  if(age < -5 || age > maxAge)return fail("stale");
  const local=BD.test(localityText)||(official&&event.weather);
  const internationalImpact=DIRECT_BD_IMPACT.test(localityText);
  if(!local&&!internationalImpact)return fail("not_bangladesh_related");
  const link=String(item.publisherUrl||item.link||"");
  let parsed;
  try{parsed=new URL(link);}catch{return fail("missing_original_url");}
  if(parsed.protocol!=="https:"||parsed.hostname==="news.google.com"||parsed.hostname.endsWith(".news.google.com"))return fail("not_original_url");
  if(sourceCount<2 && !(official&&event.weather&&sourceCount>=1)) {
    return {eligible:false,reason:"needs_corroboration",weather:event.weather,category:alertCategory(text),sourceCount,sources};
  }
  return {eligible:true,reason:"verified",weather:event.weather,category:alertCategory(text),sourceCount,sources,publishedAt:published,link};
}
export async function deliverWithMediaFallback(candidates,caption,link,send) {
  for(const media of candidates) {
    try {
      const method=media.type==="video"?"sendVideo":"sendPhoto";
      const body=media.type==="video"?{video:media.url,caption,parse_mode:"HTML"}:{photo:media.url,caption,parse_mode:"HTML"};
      if(await send(method,body))return media.type;
    } catch {}
  }
  const text=[caption,"","🔗 "+escapeHtml(link)].join("\n");
  if(!await send("sendMessage",{text,parse_mode:"HTML",disable_web_page_preview:false}))
    throw new Error("Telegram news alert delivery failed");
  return "text";
}
export function parseOfficialDisasterSignal(html,item={},now=Date.now(),name="DDM",url="https://rapid.ddm.gov.bd/home/weather/") {
  const raw=String(html||"").replace(/<script[\s\S]*?<\/script>|<style[\s\S]*?<\/style>/gi," ").replace(/<[^>]*>/g," ").replace(/&nbsp;|&#160;/gi," ").replace(/&amp;/gi,"&").replace(/\s+/g," ");
  const hazard=String(item.title||"")+" "+String(item.summary||"");
  if(!WEATHER.test(hazard)||!HAZARD_GROUPS.some(group=>group.test(hazard)&&group.test(raw)))return {confirmed:false};
  if(!/(warning|alert|bulletin|সতর্ক|বুলেটিন|ঝুঁকি)/i.test(raw))return {confirmed:false};
  const dates=[...raw.matchAll(/(?:last update|updated|bulletin|সতর্কবার্তা|বন্যা সতর্কবার্তা)[^0-9]{0,60}(\d{4}-\d{2}-\d{2})(?:[ T](\d{2}:\d{2}(?::\d{2})?)?)?/gi)];
  const fresh=dates.some(match=>{
    const time=match[2]||"12:00";
    const clock=time.length===5?time+":00":time;
    const stamp=Date.parse(match[1]+"T"+clock+"+06:00");
    const age=(now-stamp)/3600000;
    return Number.isFinite(stamp)&&age>=-6&&age<=36;
  });
  if(!fresh)return {confirmed:false};
  if(!BD.test(raw)&&!/(Bangladesh|বাংলাদেশ|district|জেলা)/i.test(raw))return {confirmed:false};
  const places=["Dhaka","ঢাকা","Sylhet","সিলেট","Sunamganj","সুনামগঞ্জ","Chattogram","চট্টগ্রাম","Cox's Bazar","কক্সবাজার","Khulna","খুলনা","Rangpur","রংপুর","Kurigram","কুড়িগ্রাম","Satkhira","সাতক্ষীরা","Narayanganj","নারায়ণগঞ্জ","Gazipur","গাজীপুর","Cumilla","কুমিল্লা","Noakhali","নোয়াখালী","Bandarban","বান্দরবান","Rangamati","রাঙামাটি","Bhola","ভোলা","Patuakhali","পটুয়াখালী","Brahmanbaria","ব্রাহ্মণবাড়িয়া","Rajshahi","রাজশাহী","Barishal","বরিশাল","Mymensingh","ময়মনসিংহ","Dinajpur","দিনাজপুর","Jashore","যশোর","Tangail","টাঙ্গাইল","Feni","ফেনী","Chandpur","চাঁদপুর","Pabna","পাবনা","Bogura","বগুড়া"];
  const candidate=String(item.title||"")+" "+String(item.summary||"");
  const candidatePlaces=places.filter(place=>candidate.toLowerCase().includes(place.toLowerCase()));
  if(candidatePlaces.length&&!candidatePlaces.some(place=>raw.toLowerCase().includes(place.toLowerCase())))return {confirmed:false};
  return {confirmed:true,name,url};
}
