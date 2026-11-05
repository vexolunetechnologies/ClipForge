import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { runInNewContext } from "node:vm";

const source=readFileSync(new URL("../transcription-queue.js",import.meta.url),"utf8");
const context={window:{}};
runInNewContext(source,context,{filename:"transcription-queue.js"});
const {orderedMap}=context.window.ClipForgeAudioQueue;
assert.equal(typeof orderedMap,"function");
const delay=(ms)=>new Promise(resolve=>setTimeout(resolve,ms));
async function* stream(n){
 for(let i=0;i<n;i++)yield {index:i,seconds:30};
}
// Results remain in input order even when requests finish out of order.
{
 let inflight=0,max=0,completed=0;
 const out=await orderedMap(stream(8),async (item,i)=>{
  inflight++;max=Math.max(max,inflight);
  await delay(i%2===0?18:3);
  inflight--;
  return {index:item.index,offset:item.index*30};
 },{concurrency:2,onComplete:()=>completed++});
 assert.equal(out.length,8);
 assert.deepEqual(Array.from(out,x=>x.index),[0,1,2,3,4,5,6,7]);
 assert.deepEqual(Array.from(out,x=>x.offset),[0,30,60,90,120,150,180,210]);
 assert.equal(completed,8);
 assert.equal(max,2,"Maximum of two in-flight requests");
}
// Failure is not swallowed and prevents all later blocks from being submitted.
{
 let seen=0;
 await assert.rejects(orderedMap(stream(12),async(item)=>{
  seen++;
  if(item.index===1)throw Error("Transcription service unavailable");
  await delay(12);
  return item.index;
 },{concurrency:2}),/Transcription service unavailable/);
 assert.ok(seen<=3,"Failed pipeline should not submit the remainder of the video");
}
// Stop cancels queued transcription processing and reports a stopped result.
{
 const controller=new AbortController();
 let launched=0;
 const job=orderedMap(stream(20),async()=>{
  launched++;
  await new Promise((resolve,reject)=>{
   if(controller.signal.aborted){reject(new Error("Stopped."));return}
   const timer=setTimeout(resolve,140);
   controller.signal.addEventListener("abort",()=>{clearTimeout(timer);reject(new Error("Stopped."))},{once:true});
  });
  return 1;
 },{concurrency:2,signal:controller.signal});
 await delay(8);
 controller.abort();
 await assert.rejects(job,/Stopped/);
 assert.ok(launched<=2,"Cancellation should leave later chunks unsubmitted");
}
// Never exceed two parallel jobs even if requested limit is higher.
{
 let active=0,max=0;
 await orderedMap(stream(9),async()=>{
  active++;max=Math.max(max,active);await delay(3);active--;return true;
 },{concurrency:200});
 assert.equal(max,2);
}
console.log("Phase 2: ordered transcripts, bounded concurrency, errors and cancellation passed.");
