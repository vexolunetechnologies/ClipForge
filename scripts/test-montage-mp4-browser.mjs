import assert from "node:assert/strict";
import {chromium} from "playwright";
import {execFileSync} from "node:child_process";
import {readFileSync,mkdtempSync,rmSync,mkdirSync} from "node:fs";
import {join} from "node:path";
import {tmpdir} from "node:os";
import {serveLocalSite} from "./test-http-server.mjs";

const tmp=mkdtempSync(join(tmpdir(),"clipforge-montage-mp4-"));
const src=join(tmp,"source.webm");
let browser,server;
try{
 execFileSync("ffmpeg",["-hide_banner","-loglevel","error","-y",
  "-f","lavfi","-i","testsrc2=size=320x180:rate=20",
  "-f","lavfi","-i","sine=frequency=660:sample_rate=48000",
  "-t","1.4","-c:v","libvpx","-deadline","realtime","-cpu-used","8",
  "-b:v","320k","-c:a","libopus","-b:a","48k",src],{timeout:30000});
 const bytes=readFileSync(src);
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
 assert.equal(await page.locator("#edQuality").count(),0,"Existing editor must not gain Montage-only controls");
 await page.locator("#vmFiles").setInputFiles({name:"source.webm",mimeType:"video/webm",buffer:bytes});
 await page.waitForFunction(()=>document.getElementById("vmCount")?.textContent.includes("1 clips"));
 const captions="1\n00:00:00,100 --> 00:00:01,000\nSample dialogue\n";
 await page.locator("#vmCaptions").setInputFiles({name:"dialogue.srt",mimeType:"text/plain",buffer:Buffer.from(captions)});
 await page.locator("#vmTitle").fill("MP4 Montage Test");
 for(const [quality,ratio,width,height] of [
  ["720","16:9",1280,720],
  ["1080","9:16",1080,1920],
 ]){
  await page.locator("#vmQuality").selectOption(quality);
  await page.locator("#vmRatio").selectOption(ratio);
  await page.locator("#vmExport").click();
  try{
   await page.locator('#vmOutput a[download$=".mp4"]').waitFor({timeout:120000});
  }catch(error){
   const details=await page.evaluate(()=>({
    status:document.getElementById("vmStatus")?.textContent,
    progress:document.getElementById("vmProgress")?.style.width,
    mimeSupport:{
      mp4:MediaRecorder.isTypeSupported("video/mp4"),
      webm:MediaRecorder.isTypeSupported("video/webm"),
      h264:!!globalThis.VideoEncoder,
    },
   }));
   throw Error("Montage "+quality+"p export failed: "+JSON.stringify({details,failedRequests,errors})+"; "+error.message);
  }
  const anchor=page.locator('#vmOutput a[download$=".mp4"]');
  assert.match(await anchor.textContent(),/Download MP4/);
  const pending=page.waitForEvent("download",{timeout:15000});
  await anchor.click();
  const file=await pending;
  assert.match(file.suggestedFilename(),/\.mp4$/);
  const output=await file.path();
  const header=readFileSync(output);
  assert.equal(header.subarray(4,8).toString(),"ftyp","Real MP4 container, not renamed WebM");
  const ff=JSON.parse(execFileSync("ffprobe",["-v","error","-show_streams","-show_format","-of","json",output],{encoding:"utf8",timeout:20000}));
  const video=ff.streams.find(x=>x.codec_type==="video"),audio=ff.streams.find(x=>x.codec_type==="audio");
  assert.equal(video?.codec_name,"h264","Export must use H.264");
  assert.equal(video?.width,width);
  assert.equal(video?.height,height);
  assert.equal(audio?.codec_name,"aac","Export must retain AAC audio");
  assert.ok(Number(ff.format.duration)>1&&Number(ff.format.duration)<3,"Nonzero correct file duration");
  await page.locator("#vmOutput a").evaluate(a=>a.remove());
  console.log("Montage MP4 "+quality+"p / "+ratio+" passed: "+video.codec_name+" "+video.width+"x"+video.height+", "+audio.codec_name+", "+ff.format.duration+"s");
 }
 assert.deepEqual(errors,[],"No uncaught errors");
 console.log("ClipForge Montage: 720p and 1080p genuine MP4 with AAC, 2 aspect ratios, captions and original editor isolated.");
}finally{await browser?.close();await server?.close();rmSync(tmp,{recursive:true,force:true});}
