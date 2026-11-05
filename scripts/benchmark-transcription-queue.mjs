import { readFileSync } from "node:fs";
import { runInNewContext } from "node:vm";
import { performance } from "node:perf_hooks";

const context={window:{}};
runInNewContext(readFileSync(new URL("../transcription-queue.js",import.meta.url),"utf8"),context);
const queue=context.window.ClipForgeAudioQueue;
const DELAY_MS=24,CHUNKS=12;
const pause=ms=>new Promise(r=>setTimeout(r,ms));
async function* chunks(){for(let i=0;i<CHUNKS;i++)yield i}
async function trial(concurrency){
 const start=performance.now();
 const result=await queue.orderedMap(chunks(),async index=>{
  await pause(DELAY_MS);return index;
 },{concurrency});
 if(result.length!==CHUNKS)throw Error("Benchmark lost chunk results");
 return Math.round((performance.now()-start)*10)/10;
}
const single=[],parallel=[];
for(let i=0;i<3;i++){single.push(await trial(1));parallel.push(await trial(2))}
const median=values=>values.slice().sort((a,b)=>a-b)[1];
console.log(JSON.stringify({
 benchmark:"Simulated asynchronous transcription requests, not live Cloudflare AI",
 chunks:CHUNKS,simulatedPerRequestLatencyMs:DELAY_MS,
 sequentialMedianMs:median(single),twoRequestMedianMs:median(parallel),
 details:{sequential:single,twoConcurrent:parallel}
}));
