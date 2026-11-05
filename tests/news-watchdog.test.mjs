import test from "node:test";
import assert from "node:assert/strict";
import { dispatchNewsWorkflow } from "../cloudflare/news-watchdog.mjs";

const response=(status,body="",headers={})=>new Response(body,{status,headers});

test("retries a transient GitHub 500 and accepts a later 204",async()=>{
  let dispatches=0;
  const result=await dispatchNewsWorkflow("test-token",{
    wait:async()=>{},
    now:()=>Date.parse("2026-11-05T16:00:00Z"),
    fetchImpl:async(url,options)=>{
      if(options.method==="POST"){dispatches++;return dispatches===1?response(500,'{"message":"Internal Server Error"}'):response(204);}
      return response(200,JSON.stringify({workflow_runs:[]}),{"Content-Type":"application/json"});
    }
  });
  assert.equal(dispatches,2);
  assert.equal(result.accepted,true);
  assert.equal(result.attempts,2);
  assert.equal(result.verified,false);
});

test("does not dispatch twice when a 500 is followed by a newly-created run",async()=>{
  let dispatches=0;
  const result=await dispatchNewsWorkflow("test-token",{
    wait:async()=>{},
    now:()=>Date.parse("2026-11-05T16:00:00Z"),
    fetchImpl:async(url,options)=>{
      if(options.method==="POST"){dispatches++;return response(500,'{"message":"Internal Server Error"}');}
      return response(200,JSON.stringify({workflow_runs:[{id:123,event:"workflow_dispatch",head_branch:"main",created_at:"2026-11-05T16:00:01Z"}]}),{"Content-Type":"application/json"});
    }
  });
  assert.equal(dispatches,1);
  assert.equal(result.accepted,true);
  assert.equal(result.verified,true);
  assert.equal(result.runId,123);
});

test("verifies an ambiguous network failure before attempting another dispatch",async()=>{
  let dispatches=0;
  const result=await dispatchNewsWorkflow("test-token",{
    wait:async()=>{},
    now:()=>Date.parse("2026-11-05T16:00:00Z"),
    fetchImpl:async(url,options)=>{
      if(options.method==="POST"){dispatches++;throw new Error("socket reset");}
      return response(200,JSON.stringify({workflow_runs:[{id:456,event:"workflow_dispatch",head_branch:"main",created_at:"2026-11-05T16:00:02Z"}]}),{"Content-Type":"application/json"});
    }
  });
  assert.equal(dispatches,1);
  assert.equal(result.verified,true);
  assert.equal(result.runId,456);
});

test("does not retry a permission or policy error",async()=>{
  let calls=0;
  await assert.rejects(()=>dispatchNewsWorkflow("test-token",{
    wait:async()=>{},
    fetchImpl:async()=>{calls++;return response(403,'{"message":"Resource not accessible by integration"}');}
  }),error=>error.status===403&&/Resource not accessible/.test(error.message));
  assert.equal(calls,1);
});

test("reports exhausted transient failures with status and attempt count",async()=>{
  let calls=0;
  await assert.rejects(()=>dispatchNewsWorkflow("test-token",{
    wait:async()=>{},
    fetchImpl:async(url,options)=>{
      calls++;
      return options.method==="POST"?response(503,'{"message":"Service Unavailable"}'):response(200,JSON.stringify({workflow_runs:[]}),{"Content-Type":"application/json"});
    }
  }),/HTTP 503.*after 3 attempts/);
  assert.equal(calls,6);
});
