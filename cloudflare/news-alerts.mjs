const DEATH=/(নিহত|মারা (?:গেছেন|গেছে|গেল(?:ো|েন)?|যান)|প্রাণ (?:হারিয়েছেন|হারিয়েছে|হারান|গেছে|গেল)|মৃত্যু|killed|dead|death toll|fatal)/i;
const MURDER=/(খুন|হত্যা|murder|homicide|assassinat|massacre|mass shooting|school shooting)/i;
const ACCIDENT=/(দুর্ঘটনা|বাস দুর্ঘটনা|ট্রেন দুর্ঘটনা|লঞ্চ দুর্ঘটনা|নৌকাডুবি|ভবন ধস|বিস্ফোরণ|ককটেল|বোমা|অগ্নিকাণ্ড|আগুন|অগ্নিসংযোগ|বাসে আগুন|বাসে অগ্নিসংযোগ|যানবাহনে আগুন|গাড়িতে আগুন|গাড়িতে আগুন|পুলিশের গাড়িতে আগুন|পুলিশের গাড়িতে আগুন|major accident|mass accident|crash|collision|derailment|capsiz|collapse|explosion|blast|cocktail bomb|bus fire|bus catches fire|vehicle fire|fire breaks out|caught fire|set fire to|arson|major fire|stampede)/i;
const MAJOR_ACCIDENT=/(major|mass|multiple vehicles|catastrophic|severe|large[- ]scale|building collapse|train derailment|launch capsiz|stampede|explosion|blast|cocktail bomb|bus fire|bus catches fire|vehicle fire|fire breaks out|caught fire|set fire to|arson|ভবন ধস|নৌকাডুবি|ট্রেন দুর্ঘটনা|বিস্ফোরণ|ককটেল|বোমা|আগুন|অগ্নিসংযোগ|বাসে আগুন|বাসে অগ্নিসংযোগ|যানবাহনে আগুন|গাড়িতে আগুন|গাড়িতে আগুন|পুলিশের গাড়িতে আগুন|পুলিশের গাড়িতে আগুন|ভয়াবহ|ভয়াবহ|গুরুতর|বড় দুর্ঘটনা|বৃহৎ|বহু যানবাহন)/i;
const CLASH=/(সংঘর্ষ|বাসে আগুন|বাসে অগ্নিসংযোগ|যানবাহনে আগুন|গাড়িতে আগুন|গাড়িতে আগুন|পুলিশের গাড়িতে আগুন|পুলিশের গাড়িতে আগুন|কার্যালয়ে আগুন|কার্যালয়ে আগুন|ভাঙচুর|ভাংচুর|পাল্টাপাল্টি ধাওয়া|ধাওয়া-পাল্টাধাওয়া|গুলিবর্ষণ|গুলি চালনা|গুলির ঘটনা|সশস্ত্র হামলা|হামলা|ককটেল নিক্ষেপ|cocktail attack|bus set on fire|bus catches fire|bus fire|vehicle set on fire|office set ablaze|arson|clash|shooting|gunfire|armed attack|riot|violence|police firing)/i;
const NON_INCIDENT_STATEMENT=/(বিবৃতি|বিবৃতিতে|নিন্দা|প্রতিবাদ|সরকার ব্যর্থ|statement|press release|condemnation|condemns|denounces|government failed)/i;
const INCIDENT_IN_TITLE=/(ককটেল|বোমা|বিস্ফোরণ|আগুন|অগ্নিকাণ্ড|অগ্নিসংযোগ|সংঘর্ষ|গুলিবর্ষণ|গুলি|হামলা|ভাঙচুর|ভাংচুর|দুর্ঘটনা|বাস|ট্রেন|লঞ্চ|ধস|বন্যা|ঘূর্ণিঝড়|ঘূর্ণিঝড়|ভূমিকম্প|পাহাড়ধস|পাহাড়ধস|তাপপ্রবাহ|বজ্রপাত|অতিবৃষ্টি|cyclone|flood|earthquake|fire|explosion|blast|clash|shooting|accident|crash|arson)/i;
const INTERNATIONAL_CRISIS=/(war|armed conflict|airstrike|invasion|ceasefire|embassy evacuation|regional conflict|shipping crisis|terror attack|bombing|hostage|attack on)/i;
const SERIOUS=/(নিহত|মৃত্যু|মারা (?:গেছেন|গেছে|গেল(?:ো|েন)?|যান)|প্রাণ (?:হারিয়েছেন|হারিয়েছে|হারান|গেছে|গেল)|আহত|গুলিবর্ষণ|গুলি|সশস্ত্র|কারফিউ|জরুরি অবস্থা|সেনা মোতায়েন|army deployed|curfew|fatal|killed|injured|mass casualty|armed|emergency)/i;
const GLOBAL_HIGH_IMPACT=/(massacre|mass shooting|school shooting|multiple killed|several killed|dozens killed|mass casualty|terror attack|bombing|at least [2-9]\d* (?:people )?killed|[2-9]\d* killed|গণহত্যা|বহু নিহত|গণহারে হত্যা)/i;
const UPRISING=/(গণঅভ্যুত্থান|mass uprising|uprising)/i;
const UPRISING_DEVELOPMENT=/(পদত্যাগ|ক্ষমতাচ্যুত|সরকার পতন|কারফিউ|সংসদ ভেঙে|সেনা মোতায়েন|জরুরি অবস্থা|অন্তর্বর্তী সরকার|রায়|রায়|কমিশন প্রতিবেদন|প্রতিবেদন জমা|সুপারিশ|সংবিধান সংস্কার|আদালতের সিদ্ধান্ত|সরকারি ঘোষণা|resign|ousted|government falls|curfew|parliament dissolved|army deployed|emergency declared|interim government|commission report|recommendation|verdict|ruling)/i;
const REFERENDUM=/(গণভোট|referendum)/i;
const REFERENDUM_CHANGE=/(তারিখ|ফলাফল|ফল|সিদ্ধান্ত|অনুমোদন|প্রত্যাখ্যান|স্থগিত|ঘোষণা|date|result|decision|approved|rejected|postponed|rescheduled|announced|vote count)/i;
const WEATHER=/(ঘূর্ণিঝড়|ঘূর্ণিঝড়|বন্যা|জলোচ্ছ্বাস|ভূমিকম্প|পাহাড়ধস|পাহাড়ধস|অতিবৃষ্টি|ভারী বৃষ্টি|তাপপ্রবাহ|কালবৈশাখী|বজ্রপাত|দাবানল|খরা|cyclone|flood|storm surge|earthquake|landslide|heavy rain|rainfall|wildfire|drought|lightning|volcanic eruption|extreme rainfall|heat ?wave|severe storm|flash ?flood|tornado|tsunami)/i;
const WEATHER_SEVERITY=/(সতর্কবার্তা|বিপদ সংকেত|বিপদসীমা|জরুরি সতর্কতা|চরম|ভয়াবহ|ভয়াবহ|অতি ভারী|অত্যন্ত ভারী|নিহত|মৃত্যু|আহত|মাত্রা|ক্ষয়ক্ষতি|ক্ষয়ক্ষতি|ধ্বংস|উচ্ছেদ|evacuat|warning|alert|severe|extreme|major|destroy|landfall|danger level|signal|emergency|magnitude|fatal|killed|deadly|disrupts flights)/i;
const BD=/(বাংলাদেশ|ঢাকা|চট্টগ্রাম|সিলেট|খুলনা|রাজশাহী|বরিশাল|রংপুর|ময়মনসিংহ|ময়মনসিংহ|কক্সবাজার|কুড়িগ্রাম|কুড়িগ্রাম|সুনামগঞ্জ|সাতক্ষীরা|নারায়ণগঞ্জ|নারায়ণগঞ্জ|গাজীপুর|কুমিল্লা|ফেনী|নোয়াখালী|নোয়াখালী|বগুড়া|বগুড়া|পাবনা|কুষ্টিয়া|কুষ্টিয়া|যশোর|টাঙ্গাইল|জামালপুর|দিনাজপুর|বান্দরবান|রাঙামাটি|খাগড়াছড়ি|ভোলা|পটুয়াখালী|বরগুনা|চাঁদপুর|ব্রাহ্মণবাড়িয়া|লক্ষ্মীপুর|সিরাজগঞ্জ|গাইবান্ধা|নীলফামারী|লালমনিরহাট|পঞ্চগড়|জয়পুরহাট|নওগাঁ|নাটোর|চাঁপাইনবাবগঞ্জ|মাগুরা|নড়াইল|চুয়াডাঙ্গা|মেহেরপুর|বাগেরহাট|পিরোজপুর|ঝালকাঠি|মাদারীপুর|গোপালগঞ্জ|শরীয়তপুর|মুন্সীগঞ্জ|মানিকগঞ্জ|নরসিংদী|কিশোরগঞ্জ|নেত্রকোণা|শেরপুর|হবিগঞ্জ|মৌলভীবাজার|ঠাকুরগাঁও|bangladesh|dhaka|chattogram|chittagong|sylhet|khulna|rajshahi|barishal|rangpur|mymensingh|cox'?s bazar|narayanganj|gazipur|cumilla|comilla|feni|noakhali|bogura|bogra|pabna|kushtia|jashore|jessore|tangail|jamalpur|dinajpur|bandarban|rangamati|khagrachhari|bhola|patuakhali|barguna|chandpur|brahmanbaria|lakshmipur|sirajganj|gaibandha|nilphamari|lalmonirhat|panchagarh|joypurhat|naogaon|natore|chapainawabganj|magura|narail|chuadanga|meherpur|bagerhat|pirojpur|jhalokathi|madaripur|gopalganj|shariatpur|munshiganj|manikganj|narsingdi|kishoreganj|netrokona|sherpur|habiganj|moulvibazar|thakurgaon|bay of bengal|bangladesh coast)/i;
const DIRECT_BD_IMPACT=/(bangladeshi nationals|bangladeshis|bangladesh embassy|bangladesh-bound|flights? (?:to|from) bangladesh|affect(?:s|ing) bangladesh|impact on bangladesh|bangladesh coast|bay of bengal|বাংলাদেশি নাগরিক|বাংলাদেশের নাগরিক|বাংলাদেশ দূতাবাস|বাংলাদেশগামী)/i;
const FOLLOW_UP=/(বার্ষিকী|বছর আগে|বছর পরে|দশক পরে|পেছন ফিরে|স্মরণে|স্মৃতিচারণ|পুরোনো ঘটনা|পূর্বের ঘটনা|তদন্ত চলছে|তদন্ত কমিটি|তদন্তে|মামলার অগ্রগতি|রিমান্ডে|চার্জশিট|গ্রেপ্তার|গ্রেফতার|আটক|মামলার শুনানি|আদালতে হাজির|anniversary|years? ago|years? later|decades? later|look back|retrospective|from the archives|historical footage|old case|past incident|investigation into|investigation committee|probe committee|remanded|arrested|trial|hearing|convicted|sentenced|case update|charges? filed|case filed|court orders|follow[- ]?up|what happened after)/i;
const HAZARD_GROUPS=[/(বন্যা|জলোচ্ছ্বাস|flood|flash ?flood)/i,/(ঘূর্ণিঝড়|ঘূর্ণিঝড়|cyclone|hurricane|typhoon)/i,/(ভূমিকম্প|earthquake)/i,/(পাহাড়ধস|পাহাড়ধস|landslide)/i,/(তাপপ্রবাহ|heat ?wave)/i,/(দাবানল|wildfire)/i,/(খরা|drought)/i,/(বজ্রপাত|lightning)/i,/(কালবৈশাখী|ঝড়|storm|tornado|tsunami|extreme rainfall|heavy rain|rainfall)/i];
const GENERIC_SOURCES=new Set(["google news","original publisher","unknown source","news feed",""]);
const DISTRICTS=[
 ["Dhaka","ঢাকা","Dhaka"],["Faridpur","ফরিদপুর","Dhaka"],["Gazipur","গাজীপুর","Dhaka"],["Gopalganj","গোপালগঞ্জ","Dhaka"],["Kishoreganj","কিশোরগঞ্জ","Dhaka"],["Madaripur","মাদারীপুর","Dhaka"],["Manikganj","মানিকগঞ্জ","Dhaka"],["Munshiganj","মুন্সীগঞ্জ","Dhaka"],["Narayanganj","নারায়ণগঞ্জ|নারায়ণগঞ্জ","Dhaka"],["Narsingdi","নরসিংদী","Dhaka"],["Rajbari","রাজবাড়ী|রাজবাড়ী","Dhaka"],["Shariatpur","শরীয়তপুর|শরিয়তপুর","Dhaka"],["Tangail","টাঙ্গাইল","Dhaka"],
 ["Bandarban","বান্দরবান","Chattogram"],["Brahmanbaria","ব্রাহ্মণবাড়িয়া|ব্রাহ্মণবাড়িয়া","Chattogram"],["Chandpur","চাঁদপুর","Chattogram"],["Chattogram","চট্টগ্রাম","Chattogram"],["Cumilla","কুমিল্লা","Chattogram"],["Cox's Bazar","কক্সবাজার","Chattogram"],["Feni","ফেনী","Chattogram"],["Khagrachhari","খাগড়াছড়ি|খাগড়াছড়ি","Chattogram"],["Lakshmipur","লক্ষ্মীপুর","Chattogram"],["Noakhali","নোয়াখালী|নোয়াখালী","Chattogram"],["Rangamati","রাঙামাটি","Chattogram"],
 ["Bogura","বগুড়া|বগুড়া","Rajshahi"],["Joypurhat","জয়পুরহাট|জয়পুরহাট","Rajshahi"],["Naogaon","নওগাঁ","Rajshahi"],["Natore","নাটোর","Rajshahi"],["Chapainawabganj","চাঁপাইনবাবগঞ্জ","Rajshahi"],["Pabna","পাবনা","Rajshahi"],["Rajshahi","রাজশাহী","Rajshahi"],["Sirajganj","সিরাজগঞ্জ","Rajshahi"],
 ["Bagerhat","বাগেরহাট","Khulna"],["Chuadanga","চুয়াডাঙ্গা|চুয়াডাঙ্গা","Khulna"],["Jashore","যশোর","Khulna"],["Jhenaidah","ঝিনাইদহ","Khulna"],["Khulna","খুলনা","Khulna"],["Kushtia","কুষ্টিয়া|কুষ্টিয়া","Khulna"],["Magura","মাগুরা","Khulna"],["Meherpur","মেহেরপুর","Khulna"],["Narail","নড়াইল|নড়াইল","Khulna"],["Satkhira","সাতক্ষীরা","Khulna"],
 ["Barguna","বরগুনা","Barishal"],["Barishal","বরিশাল","Barishal"],["Bhola","ভোলা","Barishal"],["Jhalokathi","ঝালকাঠি","Barishal"],["Patuakhali","পটুয়াখালী|পটুয়াখালী","Barishal"],["Pirojpur","পিরোজপুর","Barishal"],
 ["Habiganj","হবিগঞ্জ","Sylhet"],["Moulvibazar","মৌলভীবাজার","Sylhet"],["Sunamganj","সুনামগঞ্জ","Sylhet"],["Sylhet","সিলেট","Sylhet"],
 ["Dinajpur","দিনাজপুর","Rangpur"],["Gaibandha","গাইবান্ধা","Rangpur"],["Kurigram","কুড়িগ্রাম|কুড়িগ্রাম","Rangpur"],["Lalmonirhat","লালমনিরহাট","Rangpur"],["Nilphamari","নীলফামারী","Rangpur"],["Panchagarh","পঞ্চগড়|পঞ্চগড়","Rangpur"],["Rangpur","রংপুর","Rangpur"],["Thakurgaon","ঠাকুরগাঁও","Rangpur"],
 ["Jamalpur","জামালপুর","Mymensingh"],["Mymensingh","ময়মনসিংহ|ময়মনসিংহ","Mymensingh"],["Netrokona","নেত্রকোণা|নেত্রকোনা","Mymensingh"],["Sherpur","শেরপুর","Mymensingh"]
];
const DIVISION_BN={Dhaka:"ঢাকা",Chattogram:"চট্টগ্রাম",Rajshahi:"রাজশাহী",Khulna:"খুলনা",Barishal:"বরিশাল",Sylhet:"সিলেট",Rangpur:"রংপুর",Mymensingh:"ময়মনসিংহ"};
const COUNTRIES=["United States","USA","United Kingdom","UK","France","Germany","Italy","Spain","Ukraine","Russia","Israel","Palestine","Iran","Iraq","Syria","Lebanon","Saudi Arabia","United Arab Emirates","UAE","Qatar","Turkey","Türkiye","Japan","China","India","Pakistan","Nepal","Sri Lanka","Myanmar","Thailand","Indonesia","Malaysia","Singapore","South Korea","North Korea","Australia","New Zealand","Canada","Mexico","Brazil","Chile","Argentina","South Africa","Egypt","Sudan","Ethiopia","Kenya","Nigeria","Ghana","Somalia","Afghanistan","Yemen","Oman","Kuwait","Jordan","Taiwan","Philippines","Vietnam","Sweden","Norway","Finland","Denmark","Netherlands","Belgium","Switzerland","Poland","Romania","Greece","Ireland"];
function canonicalSource(value){const name=String(value||"").trim(),lower=name.toLowerCase();if(/bbc/.test(lower))return "BBC";if(/daily star/.test(lower))return "The Daily Star";if(/prothom alo|প্রথম আলো/.test(lower))return "Prothom Alo";if(/jago news/.test(lower))return "Jago News 24";if(/bangladesh sangbad sangstha|^bss$/.test(lower))return "BSS";if(/united news of bangladesh|^unb$/.test(lower))return "UNB";if(/business standard|^tbs$/.test(lower))return "The Business Standard";if(/associated press|^ap news$/.test(lower))return "AP";if(/agence france|^afp$/.test(lower))return "AFP";return name;}
function isTrustedPublisher(source){return /(\bbbc\b|the daily star|prothom alo|jago news|\bbss\b|\bunb\b|dhaka tribune|bdnews24|business standard|new age|financial express|ittefaq|jugantor|kaler kantho|samakal|daily observer|daily sun|channel 24|jamuna|somoy|ekattor|independent television|bangla tribune|banglanews24|dhaka post|risingbd|ntv|rtv|reuters|associated press|\bap\b|\bafp\b|al jazeera|\bdw\b|cnn|guardian|france 24|new york times|washington post|financial times|npr|bangladesh pratidin|bd-pratidin|barta24|bhorer kagoj|ajker patrika|manab zamin|mzamin|daily inqilab|janakantha|naya diganta|desh rupantor|bonik barta|business post|bd24live|dhaka courier|dainik amader shomoy|dainikamadershomoy|dainik azadi|sangbad)/i.test(source);}
function normalizeSources(item){return [...new Set((Array.isArray(item.sourceEvidence)?item.sourceEvidence:[]).map(canonicalSource).filter(x=>!GENERIC_SOURCES.has(x.toLowerCase())))];}
export async function newsAlertKey(value,source=""){let title=String(value||""),publisher=String(source||"").trim();if(publisher)for(const separator of [" - "," – "," — "," | "]){const suffix=separator+publisher;if(title.toLowerCase().endsWith(suffix.toLowerCase())){title=title.slice(0,-suffix.length);break;}}const stop=new Set(["the","a","an","in","on","at","of","for","and","to","by","from","with","as","after","before","breaking","news","update"]);const tokens=title.toLowerCase().replace(/[^\p{L}\p{N}]+/gu," ").trim().split(/\s+/).filter(Boolean).map(token=>token.length>4&&/^[a-z]+$/.test(token)?token.replace(/(?:ing|ed|es|s)$/,""):token).filter(token=>!stop.has(token)&&!/^\d+$/.test(token));const normalized=[...new Set(tokens)].sort().join(" ");const digest=await crypto.subtle.digest("SHA-256",new TextEncoder().encode(normalized));return [...new Uint8Array(digest)].map(x=>x.toString(16).padStart(2,"0")).join("").slice(0,32);}
export function escapeHtml(value){return String(value??"").replace(/&/g,"&amp;").replace(/</g,"&lt;").replace(/>/g,"&gt;").replace(/"/g,"&quot;").replace(/'/g,"&#39;");}
export function alertCategory(text){
  if(WEATHER.test(text))return "দুর্যোগ ও আবহাওয়া";
  if(/ককটেল|বোমা|বিস্ফোরণ|বিস্ফোরক|cocktail|bomb|explosion|blast/i.test(text))return "বিস্ফোরণ / বিস্ফোরক ঘটনা";
  if(/আগুন|অগ্নিকাণ্ড|অগ্নিসংযোগ|fire|arson/i.test(text))return "অগ্নিকাণ্ড / অগ্নিসংযোগ";
  if(REFERENDUM.test(text))return "গণভোটের সিদ্ধান্ত / ফলাফল";
  if(UPRISING.test(text))return "গুরুত্বপূর্ণ রাজনৈতিক ঘটনা";
  if(MURDER.test(text))return "হত্যা / গুরুতর সহিংসতা";
  if(CLASH.test(text))return "সংঘর্ষ / সহিংসতা";
  if(ACCIDENT.test(text))return "দুর্ঘটনা / জরুরি ঘটনা";
  return "জরুরি ঘটনা";
}
export function mediaCandidates(item={}){const valid=value=>{try{const u=new URL(String(value||""));return u.protocol==="https:"?u.href:"";}catch{return "";}};const image=valid(item.previewImage||item.image),video=valid(item.videoUrl||item.video);return [...(image?[{type:"photo",url:image}]:[]),...(video?[{type:"video",url:video}]:[])];}
function classifyEvent(text,category=""){
  if(WEATHER.test(text)&&WEATHER_SEVERITY.test(text))return {weather:true};
  if(REFERENDUM.test(text)&&REFERENDUM_CHANGE.test(text))return {weather:false};
  if(UPRISING.test(text)&&UPRISING_DEVELOPMENT.test(text))return {weather:false};
  if(MURDER.test(text))return {weather:false};
  if(INTERNATIONAL_CRISIS.test(text)&&(DEATH.test(text)||SERIOUS.test(text)||DIRECT_BD_IMPACT.test(text)||category==="World"))return {weather:false};
  // These incidents are alert-worthy before casualty figures are known.
  if(CLASH.test(text))return {weather:false};
  if(ACCIDENT.test(text)&&(DEATH.test(text)||SERIOUS.test(text)||MAJOR_ACCIDENT.test(text)))return {weather:false};
  return null;
}
export function isWeatherCandidate(item={}){const text=String(item.title||"")+" "+String(item.summary||item.previewSummary||"");return item.isBreaking===true&&!FOLLOW_UP.test(text)&&WEATHER.test(text)&&WEATHER_SEVERITY.test(text);}
function locationFields(item={}){const raw=item.location??item.incidentLocation??item.place??item.address??{};if(typeof raw==="string"&&raw.trim())return {text:raw.trim()};const obj=raw&&typeof raw==="object"?raw:{},admin=item.adminLocation&&typeof item.adminLocation==="object"?item.adminLocation:{};const pick=(...keys)=>{for(const key of keys){const v=obj[key]??admin[key]??item[key];if(typeof v==="string"&&v.trim())return v.trim();}return "";};return {village:pick("village","villageName"),union:pick("union","unionName"),upazila:pick("upazila","subdistrict","upazilaName"),thana:pick("thana","policeStation","police_station"),district:pick("district","districtName"),division:pick("division","divisionName"),country:pick("country","countryName"),city:pick("city","cityName"),text:pick("formatted","displayName","name")};}
export function extractAlertLocation(item={}) {
  const f=locationFields(item);
  if(f.text)return f.text;
  const structured=[f.village,f.union,f.upazila,f.thana,f.district,f.division,f.city,f.country].filter(Boolean);
  if(structured.length)return structured.join(", ");
  const rawText=String(item.title||"")+" "+String(item.summary||item.previewSummary||"");
  const text=rawText.toLowerCase(),levels=[];
  const levelPatterns=[
    ["গ্রাম",/([\p{L}\p{M}]+)\s+গ্রাম(?:ে|ের)?/iu],
    ["ইউনিয়ন",/([\p{L}\p{M}]+)\s+ইউনিয়ন(?:ের)?/iu],
    ["উপজেলা",/([\p{L}\p{M}]+)\s+উপজেলা(?:র)?/iu],
    ["থানা",/([\p{L}\p{M}]+)\s+থানা(?:য়|তে|র)?/iu]
  ];
  for(const [label,re] of levelPatterns){const m=rawText.match(re);if(m)levels.push(label+": "+m[1]);}
  const matchedDistrict=DISTRICTS.map(([en,bn,division])=>{
    const names=[en,...bn.split("|")],positions=names.map(name=>text.indexOf(name.toLowerCase())).filter(index=>index>=0);
    return positions.length?{en,bn,division,index:Math.min(...positions)}:null;
  }).filter(Boolean).sort((a,b)=>a.index-b.index)[0];
  if(levels.length)return levels.join(", ")+(matchedDistrict?", "+matchedDistrict.bn.split("|")[0]+", "+DIVISION_BN[matchedDistrict.division]+" বিভাগ, বাংলাদেশ":"");
  if(matchedDistrict)return /[\u0980-\u09FF]/.test(text)?matchedDistrict.bn.split("|")[0]+", "+DIVISION_BN[matchedDistrict.division]+" বিভাগ, বাংলাদেশ":matchedDistrict.en+", "+matchedDistrict.division+" Division, Bangladesh";
  for(const [en,bn] of Object.entries(DIVISION_BN)){if(text.includes(en.toLowerCase())||text.includes(bn.toLowerCase()))return /[\u0980-\u09FF]/.test(text)?bn+" বিভাগ, বাংলাদেশ":en+" Division, Bangladesh";}
  for(const country of COUNTRIES)if(text.includes(country.toLowerCase()))return country;
  return "নির্দিষ্ট অবস্থান নিশ্চিত নয়";
}
export function evaluateNewsAlert(item={},options={}){
  const now=Number(options.now??Date.now()),official=options.officialSignal===true,
    title=String(item.title||"").trim(),summary=String(item.summary||item.previewSummary||""),
    text=title+" "+summary+" "+String(item.category||""),location=locationFields(item),
    localityText=title+" "+summary+" "+[location.text,location.city,location.district,location.division,location.country].filter(Boolean).join(" "),
    fail=reason=>({eligible:false,reason,weather:false,sourceCount:0,sources:[],trustedSources:[]});
  if(!title)return fail("missing_title");
  if(FOLLOW_UP.test(text))return fail("follow_up");
  if(NON_INCIDENT_STATEMENT.test(title)&&!INCIDENT_IN_TITLE.test(title))return fail("not_incident_report");
  const published=Date.parse(item.publishedAt||item.pubDate||"");
  if(!Number.isFinite(published))return fail("undated");
  const event=classifyEvent(text,String(item.category||""));
  if(!event)return fail("not_significant");
  const sources=normalizeSources(item),sourceCount=sources.length,
    trustedSources=sources.filter(isTrustedPublisher);
  const country=String(location.country||"").trim();
  const explicitlyForeign=Boolean(country&&!/^Bangladesh$/i.test(country));
  const local=!explicitlyForeign&&((BD.test(localityText)&&!DIRECT_BD_IMPACT.test(localityText))||/^Bangladesh$/i.test(country));
  const officialWeather=official&&event.weather&&local;
  if(!local)return {
    eligible:false,reason:"outside_bangladesh",weather:event.weather,
    category:alertCategory(text),sourceCount,sources,trustedSources
  };
  if(!trustedSources.length&&!officialWeather)return {
    eligible:false,reason:"untrusted_sources",weather:event.weather,
    category:alertCategory(text),sourceCount,sources,trustedSources
  };
  const age=(now-published)/60000,
    maxAge=event.weather&&(officialWeather||trustedSources.length>=2)?180:60;
  if(age < -5||age>maxAge)return fail("stale");
  const link=String(item.publisherUrl||item.link||"");
  let parsed;
  try{parsed=new URL(link)}catch{return fail("missing_original_url")}
  if(parsed.protocol!=="https:"||parsed.hostname==="news.google.com"||
    parsed.hostname.endsWith(".news.google.com"))return fail("not_original_url");

  // A repeated syndicated copy with the same normalized title and summary is
  // not counted as a second independent report.
  const storyRows=Array.isArray(item.sourceStories)?item.sourceStories:[];
  const titleFingerprints=new Set(),summaryFingerprints=new Set(),independent=[];
  for(const story of storyRows){
    if(!story||typeof story!=="object")continue;
    const publisher=canonicalSource(story.name||story.source||"");
    if(!publisher||!isTrustedPublisher(publisher))continue;
    const normalize=value=>String(value||"").toLowerCase().replace(/[^\p{L}\p{N}]+/gu," ").trim().replace(/\s+/g," ");
    const titleFingerprint=normalize(story.title),summaryFingerprint=normalize(story.summary);
    const duplicateTitle=titleFingerprint&&titleFingerprints.has(titleFingerprint);
    const duplicateSummary=summaryFingerprint.length>=80&&summaryFingerprints.has(summaryFingerprint);
    if(duplicateTitle||duplicateSummary)continue;
    if(titleFingerprint)titleFingerprints.add(titleFingerprint);
    if(summaryFingerprint.length>=80)summaryFingerprints.add(summaryFingerprint);
    if(!independent.some(value=>value.toLowerCase()===publisher.toLowerCase()))independent.push(publisher);
  }
  const corroboratingSources=storyRows.length?independent:trustedSources;
  const status=officialWeather||corroboratingSources.length>=2?"confirmed":"provisional";
  const severity=/(ককটেল|বোমা|বিস্ফোরণ|বিস্ফোরক|cocktail|bomb|explosion|blast|ভবন ধস|building collapse|ভূমিকম্প|earthquake)/i.test(text)
    ?"CRITICAL":/(গুলিবর্ষণ|গুলি চালনা|সংঘর্ষ|হামলা|আগুন|অগ্নিকাণ্ড|বাসে|bus fire|shooting|gunfire|clash|fire|crash|দুর্ঘটনা|cyclone|flood|landslide|storm)/i.test(text)
    ?"HIGH":"MODERATE";
  return {
    eligible:true,reason:status==="confirmed"?"verified":"provisional",
    weather:event.weather,category:alertCategory(text),sourceCount,
    sources,trustedSources:corroboratingSources.length?corroboratingSources:trustedSources,
    publishedAt:published,link,scope:"bangladesh",bangladeshImpact:false,
    status,severity,
    verificationMode:officialWeather?"official_weather":status==="confirmed"?"multi_source":"single_source_provisional"
  };
}
export function telegramMessageCategory(text,explicit=""){
  if(explicit)return String(explicit).toUpperCase();
  const plain=String(text||"").replace(/<[^>]*>/g," ").replace(/&(?:amp|lt|gt|quot|#39);/g," ").toLowerCase();
  if(/contact form|new portfolio contact|contact message/.test(plain))return "CONTACT INTELLIGENCE";
  if(/visitor|return visitor|visitor id|gps|location history|page views|sessions today/.test(plain))return "VISITOR INTELLIGENCE";
  if(/security|unauthori[sz]ed|suspicious|blocked|threat|exception|vulnerability|attack/.test(plain))return "SECURITY CENTER";
  if(/breaking|headline|news refresh|news alert|article|bangladesh alert|global alert|news workflow/.test(plain))return "NEWS INTELLIGENCE";
  if(/cloudflare|workers requests|kv |d1 |resource budget|free-plan budget/.test(plain))return "CLOUDFLARE MONITORING";
  if(/automation|workflow|cron|schedule|watchdog|github actions|recovered|failed run/.test(plain))return "AUTOMATION MONITORING";
  if(/daily report|live report|report id|system intelligence|traffic intelligence|visitor profiles|infrastructure intelligence/.test(plain))return "DAILY INTELLIGENCE";
  return "BOT CONTROL CENTER";
}
export function automationAlertDecision(status,previousFailed=false){
  const failed=["warning","failed","failure","interrupted"].includes(String(status).toLowerCase());
  const wasFailed=previousFailed===true;
  const recovered=!failed&&wasFailed&&status==="success";
  return {failed,wasFailed,recovered,notify:failed&&!wasFailed};
}
export function formatTelegramMessage(text,options={}){
  const raw=String(text??"").trim();
  const category=telegramMessageCategory(raw,options.category);
  if(!raw)return "<b>◈ "+category+"</b>\n\n<i>KOKUSHIBU74 · INTELLIGENCE</i>";
  if(raw.includes("<i>KOKUSHIBU74 · INTELLIGENCE</i>"))return raw;
  const parseMode=String(options.parseMode||"PLAIN").toUpperCase();
  let body=parseMode==="HTML"?raw:escapeHtml(raw);
  body=body.replace(/^◈ KOKUSHIBU74 INTELLIGENCE\s*\n?/i,"")
    .replace(/^<b>◈ KOKUSHIBU74 INTELLIGENCE<\/b>\s*\n?/i,"")
    .replace(/^<code>ADMIN CONTROL CENTER<\/code>\s*\n?/i,"")
    .replace(/^ADMIN CONTROL CENTER\s*\n?/im,"")
    .replace(/\n?━━━━━━━━━━━━━━━━━━━━\n◈ ADMIN CONTROL CENTER • PRIVATE CHAT\s*$/i,"")
    .replace(/\n?<i>CONTROL CENTER • PRIVATE ADMIN SESSION<\/i>\s*$/i,"")
    .trim();
  let insideCode=false;
  body=body.split(/(<[^>]+>)/g).map(part=>{
    if(part.startsWith("<")){
      if(/^<code>/i.test(part))insideCode=true;
      if(/^<\/code>/i.test(part))insideCode=false;
      return part;
    }
    if(insideCode)return part;
    return part.replace(/VIS-[A-F0-9]{12}|(?:\d{1,3}\.){3}\d{1,3}|[+-]?\d{1,3}\.\d{4,}\s*,\s*[+-]?\d{1,3}\.\d{4,}|[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/gi,value=>"<code>"+value+"</code>");
  }).join("");
  return "<b>◈ "+category+"</b>\n\n"+body+"\n\n<i>KOKUSHIBU74 · INTELLIGENCE</i>";
}

export function formatAlertMessage(item={},decision={},options={}){
  const location=escapeHtml(extractAlertLocation(item)),
    link=String(item.publisherUrl||item.link||""),
    linkLine=link.length<=220?'🔗 <a href="'+escapeHtml(link)+'">মূল সংবাদ পড়ুন</a>':"🔗 মূল সংবাদ লিংক আলাদা বার্তায় দেওয়া হবে",
    title=escapeHtml(String(item.title||"").trim().slice(0,180)),
    summary=escapeHtml(String(item.summary||item.previewSummary||"").trim().slice(0,280)),
    sources=escapeHtml((decision.trustedSources||[]).join(" · ").slice(0,180)),
    sourceLinks=(Array.isArray(item.sourceLinks)?item.sourceLinks:[])
      .filter(entry=>entry&&typeof entry.name==="string"&&typeof entry.url==="string"&&/^https:\/\//i.test(entry.url)&&!/news\.google\.com/i.test(entry.url)&&isTrustedPublisher(entry.name)).slice(0,10),
    linkedSources=sourceLinks.map(entry=>'<a href="'+escapeHtml(entry.url)+'">'+escapeHtml(canonicalSource(entry.name))+'</a>').join(" · "),
    sourcesLine=linkedSources?"🔎 <b>সূত্র:</b> "+linkedSources:(sources?"🔎 <b>সূত্র:</b> "+sources:""),
    published=Date.parse(item.publishedAt||item.pubDate||""),
    when=Number.isFinite(published)?new Date(published).toLocaleString("en-GB",{timeZone:"Asia/Dhaka",dateStyle:"medium",timeStyle:"short"}):"সময় অনির্দিষ্ট",
    key=String(options.key||"").toUpperCase(),
    provisional=decision.status==="provisional",
    verification=decision.official?"সরকারি সতর্কতা যাচাইকৃত":provisional
      ?"প্রাথমিক সতর্কতা — একটি নির্ভরযোগ্য সূত্রে রিপোর্ট; স্বাধীন যাচাই চলছে"
      :"কমপক্ষে দুটি স্বাধীন সংবাদসূত্রে নিশ্চিত";
  const lines=[
    "🇧🇩 <b>BANGLADESH NEWS ALERT</b>",
    provisional?"⚠️ <b>PROVISIONAL · যাচাই চলমান</b>":"✅ <b>CONFIRMED · যাচাইকৃত</b>",
    "🚦 <b>ঝুঁকির মাত্রা:</b> "+escapeHtml(decision.severity||"HIGH"),
    "🏷️ <b>ধরন:</b> "+escapeHtml(decision.category||"জরুরি ঘটনা"),
    "📍 <b>ঘটনাস্থল:</b> "+location,
    "",
    "📰 <b>"+title+"</b>",
    summary,
    "",
    "🛡️ <b>যাচাই:</b> "+escapeHtml(verification),
    linkLine,
    sourcesLine,
    decision.official?"🏛️ <b>সরকারি সূত্র:</b> "+escapeHtml(decision.official.name||"সরকারি বুলেটিন"):"",
    "🕒 <b>প্রকাশ:</b> "+when+" (বাংলাদেশ সময়)",
    "🆔 <b>Alert ID:</b> BD-"+(key||"UNKNOWN"),
    options.updateNo?"🆕 <b>UPDATE "+String(options.updateNo).padStart(2,"0")+"</b>":""
  ];
  return lines.filter(Boolean).join("\n").slice(0,3500);
}
export async function deliverWithMediaFallback(candidates,caption,link,send){for(const media of (caption.length<=1024?candidates:[])){try{const method=media.type==="video"?"sendVideo":"sendPhoto",body=media.type==="video"?{video:media.url,caption,parse_mode:"HTML"}:{photo:media.url,caption,parse_mode:"HTML"};if(await send(method,body))return media.type;}catch{}}const text=[caption,"",link.length<=220?"🔗 "+escapeHtml(link):"🔗 Original article link will follow separately"].join("\n");if(!await send("sendMessage",{text,parse_mode:"HTML",disable_web_page_preview:false}))throw new Error("Telegram news alert delivery failed");return "text";}
export function parseOfficialDisasterSignal(html,item={},now=Date.now(),name="DDM",url="https://rapid.ddm.gov.bd/home/weather/"){
  const raw=String(html||"").replace(/<script[\s\S]*?<\/script>|<style[\s\S]*?<\/style>/gi," ").replace(/<[^>]*>/g," ").replace(/&nbsp;|&#160;/gi," ").replace(/&amp;/gi,"&").replace(/\s+/g," ");
  const hazard=String(item.title||"")+" "+String(item.summary||"");
  if(!WEATHER.test(hazard)||!HAZARD_GROUPS.some(group=>group.test(hazard)&&group.test(raw)))return {confirmed:false};
  if(!/(warning|alert|bulletin|সতর্ক|বুলেটিন|ঝুঁকি)/i.test(raw))return {confirmed:false};
  const dates=[...raw.matchAll(/(\d{4}-\d{2}-\d{2})(?:[ T](\d{2}:\d{2}(?::\d{2})?)?)?/g)];
  const fresh=dates.some(match=>{
    const time=match[2]||"12:00",clock=time.length===5?time+":00":time;
    const stamp=Date.parse(match[1]+"T"+clock+"+06:00"),age=(now-stamp)/3600000;
    return Number.isFinite(stamp)&&age>=-6&&age<=36;
  });
  if(!fresh||!BD.test(raw))return {confirmed:false};
  const fields=locationFields(item);
  const structured=[fields.text,fields.city,fields.district,fields.division,fields.country].filter(Boolean).join(" ");
  const candidate=String(item.title||"")+" "+String(item.summary||"")+" "+structured;
  const places=["Dhaka","ঢাকা","Sylhet","সিলেট","Sunamganj","সুনামগঞ্জ","Chattogram","চট্টগ্রাম","Cox's Bazar","কক্সবাজার","Khulna","খুলনা","Rangpur","রংপুর","Kurigram","কুড়িগ্রাম","Satkhira","সাতক্ষীরা","Narayanganj","নারায়ণগঞ্জ","Gazipur","গাজীপুর","Cumilla","কুমিল্লা","Noakhali","নোয়াখালী","Bandarban","বান্দরবান","Rangamati","রাঙামাটি","Bhola","ভোলা","Patuakhali","পটুয়াখালী","Brahmanbaria","ব্রাহ্মণবাড়িয়া","Rajshahi","রাজশাহী","Barishal","বরিশাল","Mymensingh","ময়মনসিংহ","Dinajpur","দিনাজপুর","Jashore","যশোর","Tangail","টাঙ্গাইল","Feni","ফেনী","Chandpur","চাঁদপুর","Pabna","পাবনা","Bogura","বগুড়া"];
  const normalized=candidate.toLowerCase(),rawLower=raw.toLowerCase();
  const candidatePlaces=places.filter(place=>normalized.includes(place.toLowerCase()));
  const explicitForeignCountry=Boolean(fields.country&&!/^Bangladesh$/i.test(fields.country));
  const explicitForeignLocation=Boolean(structured&&!/(Bangladesh|বাংলাদেশ)/i.test(structured)&&!places.some(place=>structured.toLowerCase().includes(place.toLowerCase())));
  if(explicitForeignCountry||explicitForeignLocation)return {confirmed:false};
  if(!/(Bangladesh|বাংলাদেশ)/i.test(candidate)&&!candidatePlaces.length&&!/^Bangladesh$/i.test(fields.country||""))return {confirmed:false};
  if(candidatePlaces.length&&!candidatePlaces.some(place=>rawLower.includes(place.toLowerCase())))return {confirmed:false};
  return {confirmed:true,name,url};
}
