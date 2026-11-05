import test from "node:test";
import assert from "node:assert/strict";
import worker from "../cloudflare/portfolio-contact-telegram.js";

class MemoryKV {
  constructor(){this.values=new Map();this.options=new Map();}
  async get(key,type){
    const value=this.values.get(key);
    if(value===undefined)return null;
    return type==="json"?JSON.parse(value):value;
  }
  async put(key,value,options={}){
    this.values.set(key,String(value));
    this.options.set(key,options);
  }
  async delete(key){this.values.delete(key);this.options.delete(key);}
  async list({prefix="",limit=1000}={}){
    const keys=[...this.values.keys()].filter(key=>key.startsWith(prefix)).sort().slice(0,limit).map(name=>({name}));
    return {keys,list_complete:true};
  }
}
const makeEnv=()=>({VISITOR_KV:new MemoryKV(),BOT_CONFIG_KV:new MemoryKV()});
const makeRequest=(path,{method="GET",body,ip="198.51.100.1",origin="https://kokushibu74.github.io"}={})=>{
  const headers=new Headers({"Origin":origin,"CF-Connecting-IP":ip});
  if(body!==undefined)headers.set("Content-Type","application/json");
  const request=new Request("https://portfolio-contact-telegram.mdshihab74.workers.dev"+path,{method,headers,body:body===undefined?undefined:JSON.stringify(body)});
  Object.defineProperty(request,"cf",{value:{city:"Dhaka",region:"Dhaka",country:"BD",timezone:"Asia/Dhaka"}});
  return request;
};
const call=async(env,path,options)=>worker.fetch(makeRequest(path,options),env);
const visitorId="VIS-A1B2C3D4E5F6",sessionId="SES-102030405060";
const profile={id:visitorId,lastSessionId:sessionId,firstSeen:Date.now(),lastSeen:Date.now()};

test("location context returns coarse IP location only",async()=>{
  const env=makeEnv(),response=await call(env,"/location-context",{ip:"198.51.100.1"});
  assert.equal(response.status,200);
  const data=await response.json();
  assert.equal(data.city,"Dhaka");assert.equal(data.region,"Dhaka");assert.equal(data.country,"BD");
  assert.equal(data.timezone,"Asia/Dhaka");
  assert.equal("latitude" in data,false);assert.equal("longitude" in data,false);
});

test("GPS history is rejected before separate consent",async()=>{
  const env=makeEnv();
  await env.VISITOR_KV.put("visitor:"+visitorId,JSON.stringify(profile));
  const response=await call(env,"/location-history",{method:"POST",ip:"198.51.100.2",body:{visitorId,sessionId,latitude:23.7,longitude:90.4,accuracyMeters:12}});
  assert.equal(response.status,403);
  assert.equal([...env.VISITOR_KV.values.keys()].filter(key=>key.startsWith("loc:v1:history:visitor:"+visitorId+":")).length,0);
});

test("explicit consent allows multiple append-only GPS records with 90-day TTL",async()=>{
  const env=makeEnv();
  await env.VISITOR_KV.put("visitor:"+visitorId,JSON.stringify(profile));
  const consent=await call(env,"/location-consent",{method:"POST",ip:"198.51.100.3",body:{visitorId,sessionId,consent:true,policyVersion:"2026-11-05"}});
  assert.equal(consent.status,200);assert.equal((await consent.json()).consent,true);
  for(let i=0;i<2;i++){
    const response=await call(env,"/location-history",{method:"POST",ip:"198.51.100."+(10+i),body:{visitorId,sessionId,latitude:23.7+i/1000,longitude:90.4,accuracyMeters:8.4,source:"untrusted-client-value"}});
    assert.equal(response.status,200);assert.equal((await response.json()).recorded,true);
  }
  const keys=[...env.VISITOR_KV.values.keys()].filter(key=>key.startsWith("loc:v1:history:visitor:"+visitorId+":"));
  assert.equal(keys.length,2);assert.notEqual(keys[0],keys[1]);
  for(const key of keys){
    const record=await env.VISITOR_KV.get(key,"json");
    assert.equal(record.visitorId,visitorId);assert.equal(record.source,"browser-geolocation");
    assert.equal(record.accuracyMeters,8);assert.ok(record.capturedAtUtc);assert.ok(record.capturedAtBdt.endsWith("BDT"));
    assert.equal(record.locality,null);assert.equal(record.retentionDays,90);
    assert.equal(env.VISITOR_KV.options.get(key).expirationTtl,7776000);
  }
});

test("withdrawal stops future GPS history writes but leaves existing records intact",async()=>{
  const env=makeEnv();
  await env.VISITOR_KV.put("visitor:"+visitorId,JSON.stringify(profile));
  await env.VISITOR_KV.put("loc:v1:consent:"+visitorId,JSON.stringify({visitorId,consent:true}));
  await env.VISITOR_KV.put("loc:v1:history:visitor:"+visitorId+":0000000000001:old",JSON.stringify({latitude:23.7,longitude:90.4}));
  const response=await call(env,"/location-consent",{method:"POST",ip:"198.51.100.20",body:{visitorId,sessionId,consent:false,policyVersion:"2026-11-05"}});
  assert.equal(response.status,200);assert.equal((await response.json()).consent,false);
  const blocked=await call(env,"/location-history",{method:"POST",ip:"198.51.100.21",body:{visitorId,sessionId,latitude:23.7,longitude:90.4,accuracyMeters:10}});
  assert.equal(blocked.status,403);
  assert.equal([...env.VISITOR_KV.values.keys()].filter(key=>key.startsWith("loc:v1:history:visitor:"+visitorId+":")).length,1);
});

test("invalid coordinates and unapproved origins are rejected",async()=>{
  const env=makeEnv();
  await env.VISITOR_KV.put("visitor:"+visitorId,JSON.stringify(profile));
  await env.VISITOR_KV.put("loc:v1:consent:"+visitorId,JSON.stringify({visitorId,consent:true}));
  const invalid=await call(env,"/location-history",{method:"POST",ip:"198.51.100.30",body:{visitorId,sessionId,latitude:120,longitude:90.4,accuracyMeters:10}});
  assert.equal(invalid.status,400);
  const forbidden=await call(env,"/location-context",{ip:"198.51.100.31",origin:"https://untrusted.example"});
  assert.equal(forbidden.status,403);
});

test("deletion request is recorded for the site admin without exposing GPS coordinates",async()=>{
  const env=makeEnv();
  await env.VISITOR_KV.put("visitor:"+visitorId,JSON.stringify(profile));
  const response=await call(env,"/location-delete-request",{method:"POST",ip:"198.51.100.40",body:{visitorId,sessionId}});
  assert.equal(response.status,200);
  const data=await response.json();assert.equal(data.requestSubmitted,true);assert.equal(data.adminNotified,false);
  const keys=[...env.VISITOR_KV.values.keys()].filter(key=>key.startsWith("loc:v1:delete-request:"+visitorId+":"));
  assert.equal(keys.length,1);
  const request=await env.VISITOR_KV.get(keys[0],"json");
  assert.equal(request.status,"pending");assert.equal(request.scope,"gps-location-history-only");
  assert.equal("latitude" in request,false);assert.equal("longitude" in request,false);
});
