import assert from "node:assert/strict";
import {execFileSync} from "node:child_process";
import {mkdirSync,readFileSync} from "node:fs";
import {chromium} from "playwright";
import {serveLocalSite} from "./test-http-server.mjs";

mkdirSync("reports",{recursive:true});
const source="reports/android-fragmented-input.mp4";
execFileSync("ffmpeg",[
 "-hide_banner","-loglevel","error","-y",
 "-f","lavfi","-i","testsrc=size=320x180:rate=15:duration=3",
 "-f","lavfi","-i","sine=frequency=440:sample_rate=48000:duration=3",
 "-c:v","libx264","-pix_fmt","yuv420p","-preset","ultrafast",
 "-c:a","aac","-b:a","96k","-shortest",
 "-movflags","frag_keyframe+empty_moov+default_base_moof",source
],{timeout:35000});
const duration=path=>JSON.parse(execFileSync("ffprobe",[
 "-v","error","-show_entries","format=duration,format_name:stream=codec_type",
 "-of","json",path],{encoding:"utf8"}));
const originalProbe=duration(source);
assert.ok(Number(originalProbe.format.duration)>2.5,"Source fixture has video duration");
const server=await serveLocalSite();
let browser;
try{
 browser=await chromium.launch({headless:true,args:["--no-sandbox"]});
 const page=await browser.newPage({acceptDownloads:true});
 const errors=[];
 page.on("pageerror",e=>errors.push(e.message));
 await page.goto(server.origin+"/tools/shorts/",{waitUntil:"domcontentloaded"});
 await page.waitForFunction(()=>!!window.ClipForgeMp4);
 const details=await page.evaluate(async()=>{
  const inputBytes=await (await fetch("/reports/android-fragmented-input.mp4")).blob();
  const blob=new Blob([inputBytes],{type:"video/mp4"});
  const processed=await window.ClipForgeMp4.finalize(blob,{force:true});
  if(processed.changed){
   const url=URL.createObjectURL(processed.blob);
   const link=document.createElement("a");link.href=url;link.download="android-finalized-output.mp4";
   document.body.append(link);link.click();link.remove();
  }
  return {
   changed:processed.changed,warning:processed.warning,
   beforeBytes:blob.size,afterBytes:processed.blob.size
  };
 });
 assert.equal(details.changed,true,"Actual fragmented MP4 could not be remuxed: "+JSON.stringify(details));
 assert.equal(details.warning,"");
 const download=await page.waitForEvent("download",{timeout:30000});
 const output="reports/android-finalized-output.mp4";
 await download.saveAs(output);
 const finalProbe=duration(output);
 assert.ok(Number(finalProbe.format.duration)>2.5,
  "Remuxed standard MP4 must retain a 3-second duration: "+JSON.stringify(finalProbe));
 assert.ok(finalProbe.streams?.some(s=>s.codec_type==="video"));
 assert.ok(finalProbe.streams?.some(s=>s.codec_type==="audio"));
 assert.deepEqual(errors,[]);
 console.log("ClipForge: fragmented Android-style MP4 remuxed to indexed MP4 with "+Number(finalProbe.format.duration).toFixed(2)+"s duration, H264 video and AAC audio.");
}finally{if(browser)await browser.close();await server.close()}
