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
  if(f.text&&f.text.includes(","))return f.text;
  const structured=[f.village,f.union,f.upazila,f.thana,f.district,f.division,f.city,f.text,f.country].filter(Boolean);
  if(structured.length){
    const unique=structured.filter((value,index)=>structured.findIndex(other=>other.toLowerCase()===value.toLowerCase())===index);
    return unique.join(", ");
  }
  const rawText=[item.title,item.summary,item.previewSummary,item.articleLocationText,...(Array.isArray(item.sourceStories)?item.sourceStories.map(story=>story?.locationText):[])].filter(Boolean).join(" ");
  const text=rawText.toLowerCase(),levels=[];
  const levelPatterns=[
    ["গ্রাম",/([\p{L}\p{M}]+)\s+গ্রাম(?:ে|ের)?/iu],
    ["মহল্লা",/([\p{L}\p{M}]+(?:\s+[\p{L}\p{M}]+)?)\s+মহল্লা(?:য়|তে|র)?/iu],
    ["এলাকা",/([\p{L}\p{M}]+(?:\s+[\p{L}\p{M}]+)?)\s+এলাকা(?:য়|তে|র)?/iu],
    ["বাজার",/([\p{L}\p{M}]+(?:\s+[\p{L}\p{M}]+)?)\s+বাজার(?:ে|ের)?/iu],
    ["ইউনিয়ন",/([\p{L}\p{M}]+)\s+ইউনিয়ন(?:ে|ের)?/iu],
    ["উপজেলা",/([\p{L}\p{M}]+(?:\s+[\p{L}\p{M}]+)?)\s+উপজেলা(?:য়|তে|র)?/iu],
    ["থানা",/([\p{L}\p{M}]+(?:\s+[\p{L}\p{M}]+)?)\s+থানা(?:য়|তে|র)?/iu]
  ];
  for(const [label,re] of levelPatterns){const match=rawText.match(re);if(match){const place=match[1].replace(/^(?:বন্যা|আগুন|অগ্নিকাণ্ড|বিস্ফোরণ|সংঘর্ষ|দুর্ঘটনা|দুর্যোগ|বৃষ্টি|পানি|ঘটনা|ঘটনার|ঝড়|ঝড়)\s+/i,"").trim();if(place)levels.push(label+": "+place);}}
  const matchedDistrict=DISTRICTS.map(([en,bn,division])=>{
    const names=[en,...bn.split("|")],positions=names.map(name=>text.indexOf(name.toLowerCase())).filter(index=>index>=0);
    return positions.length?{en,bn,division,index:Math.min(...positions)}:null;
  }).filter(Boolean).sort((a,b)=>a.index-b.index)[0];
  const district=matchedDistrict?matchedDistrict.bn.split("|")[0]:"";
  const division=matchedDistrict?DIVISION_BN[matchedDistrict.division]+" বিভাগ":"";
  const country=matchedDistrict?"বাংলাদেশ":"";
  const divisionName=division.replace(/ বিভাগ$/,"");
  const filteredLevels=levels.filter(value=>{const name=value.split(": ").slice(1).join(":").toLowerCase();return name!==district.toLowerCase()&&name!==divisionName.toLowerCase();});
  const parts=[...filteredLevels,district,division,country].filter(Boolean);
  if(parts.length)return [...new Set(parts)].join(", ");
  for(const [en,bn] of Object.entries(DIVISION_BN)){
    if(text.includes(en.toLowerCase())||text.includes(bn.toLowerCase()))return /[\u0980-\u09FF]/.test(text)?bn+" বিভাগ, বাংলাদেশ":en+" Division, Bangladesh";
  }
  for(const countryName of COUNTRIES)if(text.includes(countryName.toLowerCase()))return countryName;
  return "নির্দিষ্ট অবস্থান নিশ্চিত নয়";
}

export function extractAlertSourceLocations(item={}) {
  const provided=Array.isArray(item.sourceLocations)?item.sourceLocations:[];
  const stories=Array.isArray(item.sourceStories)?item.sourceStories:[];
  const entries=[
    ...provided.map(x=>({source:String(x?.source||""),address:String(x?.address||x?.location||"").trim()})),
    ...stories.map(story=>({source:String(story?.name||story?.source||""),address:extractAlertLocation({title:story?.title,summary:[story?.summary,story?.locationText].filter(Boolean).join(" "),location:story?.location})}))
  ].filter(x=>x.address&&x.address!=="নির্দিষ্ট অবস্থান নিশ্চিত নয়");
  return [...new Map(entries.map(x=>[x.address.toLowerCase(),x])).values()].slice(0,8);
}


function normalizeAlertUpdateText(value){
  return String(value||"").toLocaleLowerCase("bn").replace(/[^\p{L}\p{M}\p{N}]+/gu," ").replace(/\s+/g," ").trim();
}
function alertUpdateTokens(value){
  const stop=new Set(["এবং","করে","হয়েছে","হয়েছে","হবে","হয়","হয়","তার","এতে","এই","সেই","একটি","এক","জন","জনের","দিয়ে","নিয়ে","থেকে","দিকে","করা","ঘটনা","ঘটনার","সংবাদ","বলেন","জানান","the","and","for","with","from","that","this","after","has","have","was","were"]);
  return new Set(normalizeAlertUpdateText(value).split(" ").filter(token=>(token.length>1||/^[0-9০-৯]+$/.test(token))&&!stop.has(token)));
}
function alertLocationParts(value){
  return String(value||"").split(",").map(part=>normalizeAlertUpdateText(part)).filter(Boolean);
}
function alertLocationIsMoreSpecific(candidate,previous){
  const next=alertLocationParts(candidate),old=alertLocationParts(previous);
  if(!next.length)return false;
  if(!old.length)return true;
  if(next.length<=old.length)return false;
  return old.every(part=>next.some(value=>value.includes(part)||part.includes(value)));
}
function alertTimeRank(value){
  return ({unknown:0,conflicting:0,date_only:1,period:2,time_only:3,approximate:4,exact:5})[String(value?.precision||"unknown")]||0;
}
function mergeAlertDetailObjects(previous={},current={}){
  const merged={...(previous&&typeof previous==="object"?previous:{})};
  let added=false;
  for(const [key,value] of Object.entries(current&&typeof current==="object"?current:{})){
    if(value===undefined||value===null||String(value).trim()===""||/^(unknown|n\/a|এখনো নিশ্চিত নয়|নিশ্চিত নয়)$/i.test(String(value).trim()))continue;
    const old=merged[key];
    if(old===undefined||old===null||String(old).trim()===""){merged[key]=value;added=true;}
    else if(String(old)!==String(value)){merged[key]=value;added=true;}
  }
  return {value:merged,added};
}
function mergeAlertLocationEvidence(previous=[],current=[]){
  const rows=[...(Array.isArray(previous)?previous:[]),...(Array.isArray(current)?current:[])].filter(x=>x&&String(x.address||x.location||"").trim());
  const byAddress=new Map();
  for(const row of rows){
    const address=String(row.address||row.location||"").trim(),key=normalizeAlertUpdateText(address);
    const old=byAddress.get(key);
    if(!old||address.length>String(old.address||"").length)byAddress.set(key,{...row,address});
  }
  return [...byAddress.values()].sort((a,b)=>String(b.address||"").length-String(a.address||"").length).slice(0,8);
}
export function assessNewsAlertUpdate(previous={},item={},decision={}){
  const oldSummary=String(previous.summary||"").trim();
  const currentSummary=String(item.summary||item.previewSummary||"").trim();
  const oldTokens=alertUpdateTokens(oldSummary),nextTokens=alertUpdateTokens(currentSummary);
  const novelTokens=[...nextTokens].filter(token=>!oldTokens.has(token));
  const newNumeric=[...nextTokens].filter(token=>/^\d+$/.test(token)&&!oldTokens.has(token));
  const hasFactMarker=/(নিহত|মারা|আহত|নিখোঁজ|গ্রেপ্তার|আটক|উদ্ধার|নিশ্চিত|নিশ্চিত করেছে|ক্ষতিগ্রস্ত|পুড়ে|পুড়েছে|পালিয়েছে|চালু|বন্ধ|evacuated|killed|injured|arrested|rescued|confirmed|missing|hospitalized|dead|died)/i.test(currentSummary);
  const summaryEnriched=Boolean(currentSummary&&normalizeAlertUpdateText(currentSummary)!==normalizeAlertUpdateText(oldSummary)&&
    (novelTokens.length>=3||(newNumeric.length>0&&hasFactMarker)));
  const currentSourceLocations=Array.isArray(item.sourceLocations)?item.sourceLocations:[];
  const candidates=[...currentSourceLocations.map(x=>String(x?.address||x?.location||"")),String(item.location||"")].filter(Boolean);
  const currentLocation=candidates.sort((a,b)=>b.length-a.length)[0]||"";
  const oldLocation=String(previous.location||"");
  const locationEnriched=alertLocationIsMoreSpecific(currentLocation,oldLocation);
  const currentTime=item.incidentTime&&typeof item.incidentTime==="object"?item.incidentTime:{precision:"unknown"};
  const oldTime=previous.incidentTime&&typeof previous.incidentTime==="object"?previous.incidentTime:{precision:"unknown"};
  const currentTimeRank=alertTimeRank(currentTime),oldTimeRank=alertTimeRank(oldTime);
  const incidentTimeEnriched=currentTimeRank>0&&(oldTimeRank===0||currentTimeRank>oldTimeRank||
    (currentTimeRank===oldTimeRank&&String(currentTime.display||"")!==String(oldTime.display||"")&&
      currentTime.source&&currentTime.source!==oldTime.source));
  const oldSources=new Set((Array.isArray(previous.trustedSources)?previous.trustedSources:[]).map(normalizeAlertUpdateText));
  const sourceExpanded=(Array.isArray(decision.trustedSources)?decision.trustedSources:[]).some(source=>!oldSources.has(normalizeAlertUpdateText(source)));
  const verificationImproved=String(previous.verificationStatus||"")!=="confirmed"&&decision.status==="confirmed";
  const severityRank={INFO:0,LOW:1,MODERATE:2,WARNING:2,HIGH:3,CRITICAL:4,SEVERE:4};
  const severityImproved=(severityRank[String(decision.severity||"").toUpperCase()]??0)>(severityRank[String(previous.severity||"").toUpperCase()]??0);
  const details=mergeAlertDetailObjects(previous.incidentDetails,item.incidentDetails);
  const officialSourceAdded=Boolean(decision.official?.url&&decision.official.url!==previous.officialSource);
  const hasMeaningfulUpdate=summaryEnriched||locationEnriched||incidentTimeEnriched||details.added||
    sourceExpanded||verificationImproved||severityImproved||officialSourceAdded;
  const oldLocations=Array.isArray(previous.sourceLocations)?previous.sourceLocations:[];
  const mergedLocations=mergeAlertLocationEvidence(oldLocations,currentSourceLocations);
  const oldAdvice=Array.isArray(previous.safetyAdvice)?previous.safetyAdvice:[];
  const currentAdvice=Array.isArray(item.safetyAdvice)?item.safetyAdvice:typeof item.safetyAdvice==="string"&&item.safetyAdvice.trim()?[item.safetyAdvice.trim()]:[];
  const mergedAdvice=[...new Set([...oldAdvice,...currentAdvice].filter(Boolean))].slice(0,5);
  const mergedSources=[...new Set([...(Array.isArray(previous.trustedSources)?previous.trustedSources:[]),...(Array.isArray(decision.trustedSources)?decision.trustedSources:[])])];
  const mergedEvidence=[...new Set([...(Array.isArray(previous.sourceEvidence)?previous.sourceEvidence:[]),...(Array.isArray(decision.sources)?decision.sources:[])])];
  const mergedTime=incidentTimeEnriched?currentTime:oldTimeRank?oldTime:currentTime;
  const mergedSummary=summaryEnriched
    ?(normalizeAlertUpdateText(currentSummary).includes(normalizeAlertUpdateText(oldSummary))?currentSummary:
      currentSummary+" পূর্বের বিবরণ: "+oldSummary)
    :(oldSummary||currentSummary);
  const mergedItem={
    ...item,
    title:String(item.title||previous.title||""),
    summary:mergedSummary,
    location:locationEnriched?currentLocation:(oldLocation||currentLocation),
    incidentTime:mergedTime,
    incidentAt:mergedTime.timestamp?new Date(mergedTime.timestamp).toISOString():null,
    sourceLocations:mergedLocations,
    incidentDetails:details.value,
    safetyAdvice:mergedAdvice,
    sourceEvidence:mergedEvidence,
    sourceLinks:Array.isArray(item.sourceLinks)&&item.sourceLinks.length?item.sourceLinks:
      (Array.isArray(previous.sourceLinks)?previous.sourceLinks.filter(Boolean).map(url=>({name:(previous.trustedSources||[])[0]||"",url})):[])
  };
  const mergedDecision={...decision,trustedSources:mergedSources,sources:mergedEvidence,
    status:verificationImproved?"confirmed":(decision.status||previous.verificationStatus||"provisional"),
    severity:severityImproved?decision.severity:(previous.severity||decision.severity)};
  return {hasMeaningfulUpdate,verificationImproved,flags:{summaryEnriched,locationEnriched,incidentTimeEnriched,detailsAdded:details.added,sourceExpanded,verificationImproved,severityImproved,officialSourceAdded},item:mergedItem,decision:mergedDecision};
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
  const footer="<i>KOKUSHIBU74 · INTELLIGENCE</i>";
  // News alerts are designed for phone notification previews: the headline
  // must remain the first visible line, ahead of all category branding.
  return category==="NEWS INTELLIGENCE"?body+"\n\n"+footer:"<b>◈ "+category+"</b>\n\n"+body+"\n\n"+footer;
}


function bdDateParts(timestamp){
  const d=new Date(Number(timestamp)+6*60*60*1000);
  return {year:d.getUTCFullYear(),month:d.getUTCMonth()+1,day:d.getUTCDate(),hour:d.getUTCHours(),minute:d.getUTCMinutes()};
}
function bdDateLabel(timestamp){
  return new Date(Number(timestamp)).toLocaleDateString("bn-BD",{timeZone:"Asia/Dhaka",day:"numeric",month:"long",year:"numeric"});
}
function bdClockLabel(timestamp){
  const parts=bdDateParts(timestamp);
  const period=parts.hour<4?"রাত":parts.hour<6?"ভোর":parts.hour<12?"সকাল":parts.hour<15?"দুপুর":parts.hour<18?"বিকেল":parts.hour<20?"সন্ধ্যা":"রাত";
  const hour=new Intl.NumberFormat("bn-BD").format(parts.hour%12||12);
  const minute=new Intl.NumberFormat("bn-BD",{minimumIntegerDigits:2,useGrouping:false}).format(parts.minute);
  return period+" "+hour+":"+minute;
}
function bnDigits(value){
  const digits={"০":"0","১":"1","২":"2","৩":"3","৪":"4","৫":"5","৬":"6","৭":"7","৮":"8","৯":"9"};
  return String(value||"").replace(/[০-৯]/g,char=>digits[char]||char);
}
function bdDateStamp(year,month,day,hour=0,minute=0){
  return Date.UTC(year,month-1,day,hour-6,minute,0);
}
function shiftBdDay(parts,delta){
  const d=new Date(Date.UTC(parts.year,parts.month-1,parts.day+delta));
  return {year:d.getUTCFullYear(),month:d.getUTCMonth()+1,day:d.getUTCDate(),hour:parts.hour,minute:parts.minute};
}
function parseIncidentText(text,published){
  const raw=bnDigits(String(text||"")).replace(/(\d{1,2})\s*টা\s*(\d{1,2})\s*মিনিটে/g,"$1:$2").replace(/\s+/g," ").trim();
  if(!raw||!Number.isFinite(published))return null;
  const base=bdDateParts(published);
  const dateOffset=/(গতকাল|গত রাতে|গতরাতে|গত সন্ধ্যায়|গত সন্ধ্যায়|yesterday|last night|last evening)/i.test(raw)?-1:
    /(আগের দিন|পরশু|day before yesterday)/i.test(raw)?-2:0;
  const period=raw.match(/(ভোর|সকাল|দুপুর|বিকেল|সন্ধ্যা|রাত|morning|afternoon|evening|night)/i);
  const periodWord=period?.[1]||"";
  const weekday=raw.match(/(রবিবার|সোমবার|মঙ্গলবার|বুধবার|বৃহস্পতিবার|শুক্রবার|শনিবার)/);
  let resolvedOffset=dateOffset;
  if(weekday){
    const weekdayIndex={"রবিবার":0,"সোমবার":1,"মঙ্গলবার":2,"বুধবার":3,"বৃহস্পতিবার":4,"শুক্রবার":5,"শনিবার":6}[weekday[1]];
    const currentDay=new Date(Date.UTC(base.year,base.month-1,base.day)).getUTCDay();
    resolvedOffset-=((currentDay-weekdayIndex+7)%7);
  }
  if(!resolvedOffset&&periodWord==="রাত"&&base.hour<5)resolvedOffset=-1;
  const date=shiftBdDay(base,resolvedOffset);
  // A date number (for example, ১০ in "১০ নভেম্বর") is not a clock.
  // Require a colon or an explicit clock unit before accepting a numeric time.
  const timeMatch=raw.match(/(?:প্রায়|প্রায়|আনুমানিক|around|about|approximately)?\s*(?:রাত|সকাল|ভোর|দুপুর|বিকেল|সন্ধ্যা|at\s+)?\s*(?:(\d{1,2}):(\d{2})\s*(am|pm)?|(\d{1,2})\s*(টা|টায়|টায়|টার|টার দিকে|টার সময়|টার সময়|মিনিটে|am|pm))/i);
  const periodOnly=!timeMatch&&Boolean(periodWord||weekday);
  const explicitClock=Boolean(timeMatch);
  const approximate=/প্রায়|প্রায়|আনুমানিক|দিকে|around|about|approximately/i.test(raw);
  const periodLabel={ভোর:"ভোর",সকাল:"সকাল",দুপুর:"দুপুর",বিকেল:"বিকেল",সন্ধ্যা:"সন্ধ্যা",রাত:"রাত",morning:"সকাল",afternoon:"দুপুর",evening:"সন্ধ্যা",night:"রাত"};
  if(explicitClock){
    let hour=Number(timeMatch[1]||timeMatch[4]),minute=Number(timeMatch[2]||0);
    if(hour>23||minute>59)return null;
    const marker=String(timeMatch[3]||timeMatch[5]||"").toLowerCase();
    const ambiguousClock=marker!=="pm"&&marker!=="am"&&!periodWord&&hour<=12;
    if(marker==="pm"&&hour<12)hour+=12;
    if(marker==="am"&&hour===12)hour=0;
    if(marker!=="pm"&&marker!=="am"){
      if(/দুপুর|বিকেল|সন্ধ্যা|রাত/i.test(periodWord)&&hour<12)hour+=12;
      if(/ভোর|সকাল/i.test(periodWord)&&hour===12)hour=0;
    }
    let stamp=bdDateStamp(date.year,date.month,date.day,hour,minute);
    // Never silently move a future clock to the previous day. Without an
    // explicit relative date, surface the conflict for verification instead.
    if(resolvedOffset===0&&stamp>published+5*60000){
      return {timestamp:null,precision:"conflicting",display:"ঘটনার তারিখ/সময় যাচাই প্রয়োজন",sourceText:timeMatch[0]};
    }
    const parts=bdDateParts(stamp),periodName=parts.hour<4?"রাত":parts.hour<6?"ভোর":parts.hour<12?"সকাল":parts.hour<15?"দুপুর":parts.hour<18?"বিকেল":parts.hour<20?"সন্ধ্যা":"রাত";
    const clock=new Intl.NumberFormat("bn-BD").format(parts.hour%12||12)+":"+new Intl.NumberFormat("bn-BD",{minimumIntegerDigits:2,useGrouping:false}).format(parts.minute);
    const exactTime=ambiguousClock?"সময়কাল অনির্দিষ্ট "+clock:periodName+" "+clock;
    return {timestamp:stamp,precision:ambiguousClock?"time_only":approximate?"approximate":"exact",display:(approximate?"আনুমানিক ":"")+exactTime+" · "+bdDateLabel(stamp),sourceText:timeMatch[0]};
  }
  if(periodOnly&&periodWord){
    return {timestamp:bdDateStamp(date.year,date.month,date.day),precision:"period",display:(resolvedOffset<0?"গত ":"")+periodLabel[periodWord]+" · "+bdDateLabel(bdDateStamp(date.year,date.month,date.day)),sourceText:periodWord};
  }
  const explicitDate=raw.match(/(\d{1,2})\s+(জানুয়ারি|জানুয়ারি|ফেব্রুয়ারি|ফেব্রুয়ারি|মার্চ|এপ্রিল|মে|জুন|জুলাই|আগস্ট|সেপ্টেম্বর|অক্টোবর|নভেম্বর|ডিসেম্বর)\s*(\d{4})?/i);
  if(explicitDate){
    const months={"জানুয়ারি":1,"জানুয়ারি":1,"ফেব্রুয়ারি":2,"ফেব্রুয়ারি":2,"মার্চ":3,"এপ্রিল":4,"মে":5,"জুন":6,"জুলাই":7,"আগস্ট":8,"সেপ্টেম্বর":9,"অক্টোবর":10,"নভেম্বর":11,"ডিসেম্বর":12};
    const month=months[explicitDate[2]],year=Number(explicitDate[3]||base.year);
    const stamp=bdDateStamp(year,month,Number(explicitDate[1]));
    return {timestamp:stamp,precision:"date_only",display:bdDateLabel(stamp),sourceText:explicitDate[0]};
  }
  return null;
}
export function extractIncidentTime(item={}){
  const published=Date.parse(item.publishedAt||item.pubDate||"");
  const supplied=item.incidentTime;
  if(item.incidentAt){
    const stamp=Date.parse(String(item.incidentAt));
    if(Number.isFinite(stamp)){
      const precision=String(item.incidentTimePrecision||supplied?.precision||"exact");
      return {precision,display:String(supplied?.display||bdDateLabel(stamp)+" · "+new Date(stamp).toLocaleTimeString("bn-BD",{timeZone:"Asia/Dhaka",hour:"numeric",minute:"2-digit",hour12:true})),timestamp:stamp,source:item.incidentTimeSource||supplied?.source||""};
    }
  }
  if(supplied&&typeof supplied==="object"&&supplied.display){
    return {precision:String(supplied.precision||"unknown"),display:String(supplied.display),timestamp:Number(supplied.timestamp)||null,source:String(supplied.source||"")};
  }
  if(typeof supplied==="string"&&supplied.trim())return {precision:String(item.incidentTimePrecision||"approximate"),display:supplied.trim(),timestamp:null,source:String(item.incidentTimeSource||"")};
  if(!Number.isFinite(published))return {precision:"unknown",display:"এখনো নিশ্চিত নয়",timestamp:null,source:""};
  const stories=Array.isArray(item.sourceStories)?item.sourceStories:[];
  const candidates=[];
  for(const story of stories){
    const candidate=parseIncidentText([story.title,story.summary,story.incidentTimeText,story.articleText].filter(Boolean).join(" "),published);
    if(candidate)candidates.push({...candidate,source:String(story.name||story.source||"")});
  }
  const main=parseIncidentText([item.title,item.summary,item.previewSummary,item.articleText].filter(Boolean).join(" "),published);
  if(main)candidates.push({...main,source:String(item.publisherName||item.source||"")});
  const unique=[...new Map(candidates.map(value=>[value.timestamp!==null?String(value.timestamp):value.display,value])).values()];
  if(unique.length>1){
    const values=new Set(unique.map(value=>value.timestamp!==null?new Date(value.timestamp).toISOString().slice(0,16):value.display));
    if(values.size>1)return {precision:"conflicting",display:"সূত্রভেদে ঘটনার সময় ভিন্ন",timestamp:null,source:unique.map(x=>x.source).filter(Boolean).join(", ")};
  }
  if(unique.length)return unique[0];
  return {precision:"unknown",display:"এখনো নিশ্চিত নয়",timestamp:null,source:""};
}

function dedupeLocationEvidence(entries=[]){
  const normalize=value=>String(value||"").toLocaleLowerCase("bn").replace(/[ঃ:]/g,"").replace(/[।.;]/g," ").replace(/\s+/g," ").trim();
  const rows=[...new Map(entries.filter(x=>x&&String(x.address||x.location||"").trim()).map(x=>{
    const address=String(x.address||x.location||"").trim();
    return [normalize(address),{...x,address}];
  }))].map(([,x])=>x);
  const parts=value=>normalize(value).split(",").map(x=>x.trim()).filter(Boolean);
  return rows.filter((row,index)=>{
    const current=parts(row.address);
    return !rows.some((other,otherIndex)=>{
      if(index===otherIndex)return false;
      const candidate=parts(other.address);
      return candidate.length>current.length&&current.every(part=>candidate.includes(part));
    });
  }).sort((a,b)=>parts(b.address).length-parts(a.address).length||b.address.length-a.address.length);
}
function compactAlertText(value,max=320){
  const text=String(value||"").replace(/\s+/g," ").trim();
  if(text.length<=max)return text;
  const cut=text.slice(0,max-1);
  const boundary=cut.lastIndexOf(" ");
  return (boundary>max*0.65?cut.slice(0,boundary):cut).trimEnd()+"…";
}
export function formatAlertMessage(item={},decision={},options={}){
  const esc=value=>escapeHtml(String(value??""));
  const title=esc(compactAlertText(String(item.title||"").trim(),170));
  const summaryText=compactAlertText(item.summary||item.previewSummary||"",360);
  const summarySentences=summaryText.split(/(?<=[।!?])\s+/u).filter(Boolean);
  const summary=summarySentences.length>1&&summaryText.length>170
    ?summarySentences.slice(0,3).map(esc).join("\n\n")+(summarySentences.length>3?"…":"")
    :esc(summaryText);
  const itemLocation=extractAlertLocation(item);
  const providedLocations=(Array.isArray(item.sourceLocations)?item.sourceLocations:[])
    .map(x=>({source:String(x?.source||""),address:String(x?.address||x?.location||"").trim()}));
  const storyLocations=(Array.isArray(item.sourceStories)?item.sourceStories:[]).map(story=>{
    if(!story||typeof story!=="object")return null;
    const address=extractAlertLocation({title:story.title,summary:[story.summary,story.locationText].filter(Boolean).join(" "),location:story.location});
    return address&&address!=="নির্দিষ্ট অবস্থান নিশ্চিত নয়"?{source:String(story.name||story.source||""),address}:null;
  }).filter(Boolean);
  const locationEvidence=dedupeLocationEvidence([...providedLocations,...storyLocations]);
  const location=locationEvidence[0]?.address||(itemLocation!=="নির্দিষ্ট অবস্থান নিশ্চিত নয়"?itemLocation:"অবস্থান নিশ্চিত নয়");
  const incident=extractIncidentTime(item);
  const published=Date.parse(item.publishedAt||item.pubDate||"");
  const publishedLabel=Number.isFinite(published)?bdDateLabel(published)+" · "+bdClockLabel(published)+" BDT":"সময় অনির্দিষ্ট";
  const updated=Number(options.updatedAt||item.updatedAt||item.lastUpdatedAt||0);
  const updatedLabel=updated?bdClockLabel(updated)+" BDT":"";
  const severity=String(decision.severity||"HIGH").toUpperCase();
  const severityIcon=severity==="CRITICAL"||severity==="SEVERE"?"🔴":severity==="HIGH"?"🟠":severity==="MODERATE"||severity==="WARNING"?"🟡":"🔵";
  const severityLabel=severity==="CRITICAL"||severity==="SEVERE"?"CRITICAL PRIORITY":severity==="HIGH"?"HIGH PRIORITY":severity==="MODERATE"||severity==="WARNING"?"MODERATE PRIORITY":severity;
  const category=String(decision.category||alertCategory(String(item.title||"")+" "+String(item.summary||"")));
  const categoryIcon=/বিস্ফোরণ|বোমা/i.test(category)?"💥":/অগ্নি|আগুন/i.test(category)?"🔥":/সংঘর্ষ|সহিংসতা/i.test(category)?"⚔️":/দুর্যোগ|আবহাওয়া/i.test(category)?"🌪️":/দুর্ঘটনা/i.test(category)?"🚑":"🚨";
  const status=String(decision.status||"provisional");
  const verification=status==="confirmed"?"🟢 <b>CONFIRMED</b>":status==="conflicting"?"🔴 <b>CONFLICTING</b>":"🟡 <b>PROVISIONAL</b>";
  const sourceLinks=(Array.isArray(item.sourceLinks)?item.sourceLinks:[])
    .filter(entry=>entry&&typeof entry.name==="string"&&typeof entry.url==="string"&&/^https:\/\//i.test(entry.url)&&!/news\.google\.com/i.test(entry.url)&&isTrustedPublisher(entry.name)).slice(0,5);
  const links=sourceLinks.map(entry=>'<a href="'+esc(entry.url)+'">'+esc(canonicalSource(entry.name))+'</a>');
  const primaryLink=String(item.publisherUrl||item.link||"");
  if(primaryLink&&!links.some(value=>value.includes(esc(primaryLink))))links.unshift('<a href="'+esc(primaryLink)+'">মূল সংবাদ</a>');
  const sourceNames=Array.isArray(decision.trustedSources)?decision.trustedSources.filter(Boolean):[];
  const sourceLine=links.length?"🔗 "+links.join(" · "):(sourceNames.length?"🔗 "+esc(sourceNames.slice(0,3).join(" · ")):"");
  const details=item.incidentDetails&&typeof item.incidentDetails==="object"?item.incidentDetails:{};
  const detailRows=[["নিহত",details.killed??item.killed],["আহত",details.injured??item.injured],["নিখোঁজ",details.missing??item.missing]]
    .filter(([,value])=>value!==undefined&&value!==null&&String(value).trim());
  const detailLine=detailRows.length?"📊 "+detailRows.map(([label,value])=>label+": "+esc(value)).join(" · "):"";
  const advice=Array.isArray(item.safetyAdvice)?item.safetyAdvice.filter(Boolean).slice(0,1):typeof item.safetyAdvice==="string"&&item.safetyAdvice.trim()?[item.safetyAdvice.trim()]:[];
  const incidentCategory=/বিস্ফোরণ|বোমা|অগ্নি|আগুন|সংঘর্ষ|সহিংসতা|দুর্ঘটনা/i.test(category);
  if(!advice.length&&incidentCategory&&severity!=="INFO")advice.push("ঘটনাস্থল থেকে নিরাপদ দূরত্ব বজায় রাখুন; প্রশাসনের নির্দেশনা মানুন।");
  const adviceLine=advice.length?"⚠️ "+esc(compactAlertText(advice[0],115)):"";
  const updateLabel=options.updateNo?"🔄 <b>UPDATE "+String(options.updateNo).padStart(2,"0")+"</b>":"🚨 <b>BREAKING ALERT</b>";
  const locationLabel=locationEvidence.length>1
    ?locationEvidence.slice(0,2).map(x=>esc(x.address)).join(" · ")
    :esc(location);
  const statusLine="🇧🇩 <b>BANGLADESH NEWS ALERT</b> · "+updateLabel+" · "+severityIcon+" <b>"+esc(severityLabel)+"</b>";
  const timeLines=[
    "🕒 <b>ঘটনার সময়:</b> "+esc(incident.display),
    "📰 <b>প্রকাশের সময়:</b> "+esc(publishedLabel),
    updatedLabel?"🔄 <b>আপডেট:</b> "+esc(updatedLabel):""
  ].filter(Boolean).join("\n");
  const sections=[
    "<b>"+title+"</b>",
    statusLine,
    categoryIcon+" <b>"+esc(category)+"</b>",
    summary?"📝 <b>ঘটনার বিবরণ</b>\n"+summary:"",
    "📍 <b>ঘটনাস্থল</b>\n"+locationLabel,
    timeLines,
    detailLine,
    verification+(sourceNames.length?" · "+sourceNames.length+" সূত্র":""),
    sourceLine,
    adviceLine
  ];
  return sections.filter(Boolean).join("\n\n").slice(0,1900);
}
export async function deliverWithMediaFallback(candidates,caption,link,send){for(const media of (caption.length<=1024?candidates:[])){try{const method=media.type==="video"?"sendVideo":"sendPhoto",body=media.type==="video"?{video:media.url,caption,parse_mode:"HTML"}:{photo:media.url,caption,parse_mode:"HTML"};if(await send(method,body))return media.type;}catch{}}if(!await send("sendMessage",{text:caption,parse_mode:"HTML",disable_web_page_preview:false}))throw new Error("Telegram news alert delivery failed");return "text";}
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
