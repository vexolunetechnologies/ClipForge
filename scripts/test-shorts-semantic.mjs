import assert from "node:assert/strict";
import {readFileSync} from "node:fs";

const workerText=readFileSync(new URL("../_worker.js",import.meta.url),"utf8");
const mod=await import("data:text/javascript;base64,"+Buffer.from(workerText).toString("base64"));
const transcript=Array.from({length:85},(_,i)=>({
 start:Number((2.5*i).toFixed(2)),end:Number((2.5*i+1.9).toFixed(2)),
 text:"Episode dialogue line "+i+(i%4===0?"؟":"۔")
}));
function setup(aiResponse,options={}){
 const calls={ai:0,limit:0};
 const env={
  AI:{async run(){calls.ai++;if(options.fail)throw Error("Model temporarily unavailable");return {response:aiResponse}}},
  AI_LIMITS:{async get(){return "0"},async put(){calls.limit++}},
  ASSETS:{fetch(){throw Error("Worker route not matched")}}
 };
 async function request(overrides={}){
  const body={duration:215,targetLength:45,count:3,language:"urdu",segments:transcript,...overrides};
  const res=await mod.default.fetch(new Request("https://clipforgestudio.pages.dev/api/v1/shorts/semantic-plan",{
   method:"POST",headers:{"content-type":"application/json","Origin":"https://clipforgestudio.pages.dev"},
   body:JSON.stringify(body)
  }),env);
  return {status:res.status,data:await res.json()};
 }
 return {request,calls};
}
function validateRanges(clips, min=36,max=56,duration=215){
 assert.ok(clips.length>0);
 for(const c of clips){
  assert.ok(c.start>=0&&c.end<=duration,"Timeline must remain within video");
  assert.ok(c.end-c.start>=min-.025&&c.end-c.start<=max+.025,"Unexpected target length "+(c.end-c.start));
 }
}
// Exact, valid AI candidate remains unchanged with its ranking.
{
 const t=setup(JSON.stringify({clips:[{start:20,end:65,score:92,category:"Emotional",reason:"Complete dramatic exchange"}]}));
 const {status,data}=await t.request();
 assert.equal(status,200);assert.equal(data.selectionMode,"ai");
 assert.equal(data.clips[0].start,20);assert.equal(data.clips[0].end,65);
 assert.equal(data.clips[0].score,92);assert.equal(t.calls.ai,1);
}
// A useful but undersized AI scene gets bounded context added (still one continuous interval).
{
 const {status,data}=await setup(JSON.stringify({clips:[{start:20,end:45,score:94,category:"Suspense"}]})).request();
 assert.equal(status,200);assert.equal(data.selectionMode,"ai-adjusted");
 validateRanges(data.clips);assert.ok(data.clips[0].start<=20&&data.clips[0].end>=45);
}
// Likewise, a slightly too long AI range can be carefully shortened.
{
 const {status,data}=await setup(JSON.stringify({clips:[{start:20,end:80,score:83}]})).request();
 assert.equal(status,200);assert.equal(data.selectionMode,"ai-adjusted");validateRanges(data.clips);
}
// No AI suggestions should recover continuous dialogue blocks from actual transcript timestamps.
{
 const t=setup(JSON.stringify({clips:[]}));
 const {status,data}=await t.request();
 assert.equal(status,200);assert.equal(data.selectionMode,"transcript-fallback");
 validateRanges(data.clips);
 assert.ok(data.clips.every(x=>x.category==="Dialogue review"&&x.score===null));
 assert.ok(data.clips.every(x=>/not an AI quality score/i.test(x.reason)));
 assert.equal(t.calls.ai,1,"Recovery should not spend another AI request");
}
// Malformed generative JSON should not throw 502 if reliable transcript intervals exist.
{
 const {status,data}=await setup("Sorry, unable to return JSON").request();
 assert.equal(status,200);assert.equal(data.selectionMode,"transcript-fallback");validateRanges(data.clips);
}
// Invalid AI intervals should also recover from the transcript rather than fail.
{
 const {status,data}=await setup(JSON.stringify({clips:[{start:-900,end:-40},{start:4,end:210}]})).request();
 assert.equal(status,200);assert.equal(data.selectionMode,"transcript-fallback");validateRanges(data.clips);
}
// Sparse speech must not silently fabricate a high-quality Short.
{
 const {status,data}=await setup(JSON.stringify({clips:[]})).request({
  duration:200,segments:[{start:1,end:1.6,text:"Hello"},{start:160,end:160.5,text:"Bye"}]
 });
 assert.equal(status,422);assert.match(data.error,/Try a shorter target length/i);
}
// Real Worker failures remain errors; do not hide outages as recoveries.
{
 const {status,data}=await setup("",{fail:true}).request();
 assert.equal(status,502);assert.match(data.error,/temporarily unavailable/);
}
console.log("ClipForge Shorts: AI duration recovery, transcript fallback, no fake scores, quota discipline and failure handling passed.");
