/* Browser regression with a real VP8/Opus WebM and mocked Cloudflare AI.
 * It tests actual decoding, concurrent chunk requests and MediaRecorder export.
 * No production AI quota is used by this test.
 */
import assert from "node:assert/strict";
import { mkdtempSync, statSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { spawnSync } from "node:child_process";
import { chromium } from "playwright";
import { serveLocalSite } from "./test-http-server.mjs";

const dir=mkdtempSync(join(tmpdir(),"clipforge-highlights-media-"));
const source=join(dir,"speech-test.webm");
const run=(cmd,args)=>{
 const p=spawnSync(cmd,args,{encoding:"utf8",timeout:90000,maxBuffer:1024*1024*3});
 if(p.status!==0)throw Error(cmd+" failed: "+String(p.stderr||p.error).slice(-2500));
 return p.stdout||"";
};
const parseProbe=(path)=>JSON.parse(run("ffprobe",["-v","error","-show_streams","-show_format","-of","json",path]));
// 62 seconds means three 30-second transcription blocks; VP8/Opus decodes in stock Chromium.
run("ffmpeg",["-hide_banner","-loglevel","error","-y",
 "-f","lavfi","-i","testsrc2=size=320x180:rate=30",
 "-f","lavfi","-i","sine=frequency=440:sample_rate=48000",
 "-t","62","-c:v","libvpx","-deadline","realtime","-cpu-used","8","-b:v","150k",
 "-c:a","libopus","-b:a","48k",source]);
const sourceInfo=parseProbe(source);
assert.ok(sourceInfo.streams.some(s=>s.codec_type==="video"),"Fixture missing video");
assert.ok(sourceInfo.streams.some(s=>s.codec_type==="audio"),"Fixture missing audio");
assert.ok(Number(sourceInfo.format.duration)>61,"Fixture must span three chunks");

const site=await serveLocalSite();
let browser;
const sleep=ms=>new Promise(resolve=>setTimeout(resolve,ms));
try {
 browser=await chromium.launch({headless:true,args:["--no-sandbox","--autoplay-policy=no-user-gesture-required"]});
 const context=await browser.newContext({acceptDownloads:true,viewport:{width:1280,height:800}});
 const page=await context.newPage();
 const errors=[];
 page.on("pageerror",e=>errors.push(e.message));
 let requests=0,active=0,maxActive=0,completions=[],plans=[],abortObserved=false;
 let cancelMode=false;
 await page.route("**/api/v1/shorts/transcribe",async route=>{
  const index=requests++;
  const body=route.request().postDataJSON();
  assert.ok(body.audio?.length>1000 && body.audio.length<2_300_000,"Unexpected WAV payload length");
  active++;maxActive=Math.max(maxActive,active);
  try {
   // Return second chunk before first; this must NOT shuffle resulting timestamps.
   await sleep(cancelMode?2500:(index%3===0?350:40));
   if(route.request().isNavigationRequest())throw Error("Transcription became a navigation");
   const data={segments:[{start:0.5,end:2.5,text:"Test dialogue block "+index}],text:"Test dialogue block "+index};
   await route.fulfill({status:200,contentType:"application/json",body:JSON.stringify(data)});
   completions.push(index);
  } catch(error){
   // Aborted fetches may reject fulfillment; the browser is expected to abort.
   if(!cancelMode)throw error;
   abortObserved=true;
  } finally {active--}
 });
 await page.route("**/api/v1/highlights/plan",async route=>{
  const payload=route.request().postDataJSON();
  plans.push(payload);
  const clips=[{start:5,end:7.5,score:92,category:"Dialogue",reason:"Fixture A"},
               {start:9,end:11.5,score:90,category:"Reaction",reason:"Fixture B"}];
  await route.fulfill({status:200,contentType:"application/json",body:JSON.stringify({clips,complete:true,actualDuration:5})});
 });
 await page.goto(site.origin+"/tools/highlights/",{waitUntil:"domcontentloaded"});
 await page.waitForFunction(()=>!!window.ClipForgeNavigation && document.body.dataset.tool==="highlights");
 await page.locator("#hsVideo").setInputFiles(source);
 await page.waitForFunction(()=>{
   const video=document.querySelector("#hsSourcePreview");
   return document.querySelector("#hsVideoInfo").textContent.includes("speech-test.webm") || video.error;
  },null,{timeout:20000});
 const meta=await page.evaluate(()=>({name:document.querySelector("#hsVideoInfo").textContent,
  error:document.querySelector("#hsSourcePreview").error?.message||""}));
 assert.ok(meta.name.includes("speech-test.webm"),"Video metadata could not load: "+JSON.stringify(meta));
 await page.locator("#hsDuration").fill("5");
 await page.locator("#hsMood").selectOption("none");
 await page.locator("#hsSfx").selectOption("off");
 await page.locator("#hsRatio").selectOption("16:9");
 await page.locator("#hsGenerate").click();
 await page.waitForFunction(()=>document.querySelector("#hsOutput a[download]"),null,{timeout:90000});
 assert.equal(requests,3,"62-second source should produce three 30-second transcription chunks");
 assert.equal(maxActive,2,"Highlights should issue at most two simultaneous ASR requests");
 assert.ok(completions.indexOf(1)<completions.indexOf(0),"Fixture must exercise out-of-order completions");
 assert.equal(plans.length,1,"Highlights should invoke exactly one AI planning pass");
 assert.deepEqual(plans[0].segments.map(x=>Math.round(x.start)),[1,31,61],
   "AI must receive transcript segments in original chronological order");
 assert.equal(await page.locator("#hsCount").innerText(),"2 scenes");
 assert.match(await page.locator("#hsStatus").innerText(),/Highlights ready/i);
 const pendingDownload=page.waitForEvent("download");
 await page.locator("#hsOutput a[download]").click();
 const download=await pendingDownload;
 const output=join(dir,"highlights."+((download.suggestedFilename()||"").endsWith(".mp4")?"mp4":"webm"));
 await download.saveAs(output);
 assert.ok(statSync(output).size>2000,"Export should not be empty");
 const probe=parseProbe(output);
 assert.ok(probe.streams.some(s=>s.codec_type==="video"),"Export missing encoded video");
 const duration=Number(probe.format.duration);
 assert.ok(duration>=3 && duration<=10,"Export should have approximately five seconds of video: "+duration);
 assert.deepEqual(errors,[],"Unexpected browser errors during media export");
 console.log("Highlights real-video test passed: VP8/Opus WebM input, 3 ASR chunks, ordered plan, two-request max, video export "+duration.toFixed(2)+"s.");

 // Cancellation: start a new analysis with slow mocked responses and stop it.
 cancelMode=true;requests=0;active=0;maxActive=0;completions=[];plans=[];
 await page.locator("#hsGenerate").click();
 await page.waitForFunction(()=>document.querySelector("#hsStatus").textContent.includes("Transcribing"),null,{timeout:45000});
 await page.locator("#hsStop").click();
 await page.waitForFunction(()=>/Stopped\./.test(document.querySelector("#hsStatus").textContent),null,{timeout:12000});
 assert.equal(plans.length,0,"Cancelled analysis must not reach AI highlight selection");
 assert.equal(await page.locator("#hsOutput a[download]").count(),0,"Cancelled output must not download");
 console.log("Highlights real-video cancellation passed; no AI plan or exported file after Stop.");
} finally {
 if(browser)await browser.close();
 await site.close();
 rmSync(dir,{recursive:true,force:true});
}
