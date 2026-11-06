import assert from "node:assert/strict";
import {chromium} from "playwright";
import {serveLocalSite} from "./test-http-server.mjs";

let browser,server;
try{
 server=await serveLocalSite({rootDir:"public"});
 try{browser=await chromium.launch({channel:"chrome",headless:true,args:["--no-sandbox"]});}
 catch(error){console.warn("Chrome unavailable; Chromium fallback:",error.message);browser=await chromium.launch({headless:true,args:["--no-sandbox"]});}
 const page=await browser.newPage({viewport:{width:1400,height:900},acceptDownloads:true});
 const errors=[];page.on("pageerror",error=>errors.push(error.message));
 const failedRequests=[];page.on("requestfailed",req=>failedRequests.push({url:req.url(),error:req.failure()?.errorText}));
 await page.goto(server.origin+"/tools/montage/",{waitUntil:"load"});
 await page.waitForSelector("#vmFiles",{timeout:15000});
 assert.ok(await page.locator("#vmQuality").isVisible(),"Montage resolution selector");
 assert.deepEqual(await page.locator("#vmQuality option").evaluateAll(options=>options.map(x=>x.value)),["720","1080"]);
 assert.equal(await page.locator("#vmQuality").inputValue(),"720");
 assert.equal(await page.locator("#vmTool").locator("text=MP4 · H.264 / AAC").count(),1);
 assert.equal(await page.locator("#edQuality").count(),0,"Existing editor unaffected");

 // Generate an authentic, playable WebM/Opus input entirely in Chromium,
 // without assuming FFmpeg is installed on the GitHub Actions runner.
 const videoData=await page.evaluate(async()=>{
  const canvas=document.createElement("canvas");canvas.width=320;canvas.height=180;
  const ctx=canvas.getContext("2d"),stream=canvas.captureStream(20);
  const ac=new AudioContext(),osc=ac.createOscillator(),gain=ac.createGain(),dest=ac.createMediaStreamDestination();
  osc.frequency.value=440;gain.gain.value=.08;osc.connect(gain);gain.connect(dest);
  stream.addTrack(dest.stream.getAudioTracks()[0]);
  const mime=["video/webm;codecs=vp8,opus","video/webm;codecs=vp9,opus","video/webm"].find(x=>MediaRecorder.isTypeSupported(x));
  if(!mime)throw Error("No WebM input recording support in test browser");
  const recorder=new MediaRecorder(stream,{mimeType:mime,videoBitsPerSecond:280000}),chunks=[];
  recorder.ondataavailable=e=>{if(e.data.size)chunks.push(e.data);};
  const finished=new Promise((resolve,reject)=>{recorder.onstop=resolve;recorder.onerror=e=>reject(e.error||Error("Sample recording failed"));});
  recorder.start(250);osc.start();
  const started=performance.now();
  await new Promise(resolve=>{
   const timer=setInterval(()=>{
    const t=(performance.now()-started)/1000;
    ctx.fillStyle=t%1>.5?"#f6b244":"#3652ba";
    ctx.fillRect(0,0,320,180);ctx.fillStyle="white";ctx.font="bold 26px sans-serif";ctx.fillText("ClipForge Test",24,96);
    if(t>1.6){clearInterval(timer);resolve();}
   },40);
  });
  recorder.stop();await finished;
  osc.stop();await ac.close();for(const track of stream.getTracks())track.stop();
  // MediaRecorder WebM commonly reports Infinity duration. Remux the synthetic
  // test source to a valid WebM with finite metadata before Montage imports it.
  const mb=await import("https://cdn.jsdelivr.net/npm/mediabunny@1.62.1/+esm");
  const input=new mb.Input({source:new mb.BlobSource(new Blob(chunks,{type:mime})),formats:mb.ALL_FORMATS});
  const output=new mb.Output({format:new mb.WebMOutputFormat(),target:new mb.BufferTarget()});
  const job=await mb.Conversion.init({input,output,tracks:"primary"});
  if(!job.isValid)throw Error("Unable to finalize browser-generated source WebM");
  await job.execute();
  await input.close?.();
  return [...new Uint8Array(output.target.buffer)];
 });
 assert.ok(videoData.length>2000,"Generated real WebM video+audio must not be empty");
 const moduleCheck=await page.evaluate(async()=>{
  try{return {exports:Object.keys(await import('/montage-mp4.js'))};}
  catch(e){return {error:String(e),stack:String(e.stack||"")};}
 });
 assert.ok(moduleCheck.exports?.includes("finalizeMontageMp4"),"Montage MP4 module failed to load: "+JSON.stringify(moduleCheck));
 await page.locator("#vmFiles").setInputFiles({name:"test-video.webm",mimeType:"video/webm",buffer:Buffer.from(videoData)});
 try{await page.waitForFunction(()=>document.getElementById("vmCount")?.textContent.includes("1 clips"),null,{timeout:12000});}
 catch(error){
  const diagnostics=await page.evaluate(()=>({
   count:document.querySelector("#vmCount")?.textContent,
   status:document.querySelector("#vmStatus")?.textContent,
   error:document.querySelector("#toast")?.textContent
  }));
  throw Error("Montage input failed: "+JSON.stringify(diagnostics)+"; "+error.message);
 }
 const captions="1\n00:00:00,100 --> 00:00:01,000\nSample dialogue\n";
 await page.locator("#vmCaptions").setInputFiles({name:"dialogue.srt",mimeType:"text/plain",buffer:Buffer.from(captions)});
 await page.locator("#vmTitle").fill("MP4 Montage Test");
 for(const [quality,ratio,width,height] of [
  ["720","16:9",1280,720],["1080","9:16",1080,1920]
 ]){
  await page.locator("#vmQuality").selectOption(quality);
  await page.locator("#vmRatio").selectOption(ratio);
  await page.locator("#vmExport").click();
  try{
   await page.waitForFunction(()=>{
    const status=document.getElementById("vmStatus")?.textContent||"";
    return !!document.querySelector('#vmOutput a[download$=".mp4"]')||
       (/failed|unavailable|unsupported|missing \)|could not/i.test(status));
   },null,{timeout:40000});
   if(!await page.locator('#vmOutput a[download$=".mp4"]').count())throw Error("UI reported export error");
  }
  catch(error){
   const details=await page.evaluate(()=>({
    status:document.getElementById("vmStatus")?.textContent,
    progress:document.getElementById("vmProgress")?.style.width,
    mp4:MediaRecorder.isTypeSupported("video/mp4"),
    webm:MediaRecorder.isTypeSupported("video/webm"),
    webcodecs:!!globalThis.VideoEncoder,
   }));
   throw Error("Montage "+quality+"p export failed: "+JSON.stringify({details,failedRequests,errors})+"; "+error.message);
  }
  const anchor=page.locator('#vmOutput a[download$=".mp4"]');
  assert.match(await anchor.textContent(),/Download MP4/);
  const check=await page.evaluate(async()=>{
   const a=document.querySelector('#vmOutput a[download$=".mp4"]');
   const blob=await (await fetch(a.href)).blob();
   const header=String.fromCharCode(...new Uint8Array(await blob.slice(4,8).arrayBuffer()));
   const mb=await import("https://cdn.jsdelivr.net/npm/mediabunny@1.62.1/+esm");
   const input=new mb.Input({source:new mb.BlobSource(blob),formats:mb.ALL_FORMATS});
   try{
    const video=await input.getPrimaryVideoTrack(),audio=await input.getPrimaryAudioTrack();
    return {
     header,size:blob.size,
     codec:await video?.getCodec(),width:await video?.getCodedWidth(),height:await video?.getCodedHeight(),
     audio:await audio?.getCodec(),duration:await input.computeDuration()
    };
   }finally{await input.close?.();}
  });
  assert.equal(check.header,"ftyp","MP4 must be real, not WebM with fake extension");
  assert.ok(check.size>2000);
  assert.equal(check.codec,"avc","Export must be H.264 video");
  assert.equal(check.width,width);assert.equal(check.height,height);
  assert.equal(check.audio,"aac","Export must preserve AAC audio");
  assert.ok(check.duration>1&&check.duration<4,"MP4 needs valid nonzero duration: "+check.duration);
  const download=page.waitForEvent("download",{timeout:12000});
  await anchor.click();const file=await download;
  assert.match(file.suggestedFilename(),/\.mp4$/);
  console.log("Montage "+quality+"p MP4 passed: "+check.codec+" "+check.width+"x"+check.height+", "+check.audio+", duration "+check.duration.toFixed(2)+"s");
  await anchor.evaluate(a=>a.remove());
 }
 assert.deepEqual(errors,[],"No uncaught errors");
 console.log("Montage: real browser video+audio to H.264/AAC MP4 at 720p and 1080p; existing Editor isolated.");
}finally{await browser?.close();await server?.close();}
