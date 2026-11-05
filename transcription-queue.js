/* Bounded, ordered processing for audio chunks. Does not alter audio samples or exports. */
(function(root){
 "use strict";
 async function orderedMap(source,worker,options){
  options=options||{};
  const concurrency=Math.max(1,Math.min(2,Math.floor(Number(options.concurrency)||1)));
  const active=new Set(),results=[];
  let queued=0,completed=0,firstError=null;
  const stop=()=>{
   if(firstError)throw firstError;
   if(options.signal?.aborted){const err=new Error("Stopped.");err.name="AbortError";throw err}
  };
  const schedule=(item,index)=>{
   let task;
   task=Promise.resolve().then(()=>{stop();return worker(item,index)}).then(value=>{
    results[index]=value;
    completed++;
    if(options.onComplete)options.onComplete({item,index,completed,queued});
   }).catch(error=>{
    if(!firstError){
     firstError=error;
     if(options.onError)options.onError(error);
    }
   }).finally(()=>active.delete(task));
   active.add(task);
  };
  try{
   for await(const item of source){
    stop();
    schedule(item,queued++);
    if(active.size>=concurrency){await Promise.race(active);stop()}
   }
   await Promise.all(active);
   stop();
   return results;
  }catch(error){
   await Promise.allSettled(Array.from(active));
   throw firstError||error;
  }
 }
 root.ClipForgeAudioQueue=Object.freeze({orderedMap});
})(typeof window==="object"?window:globalThis);
