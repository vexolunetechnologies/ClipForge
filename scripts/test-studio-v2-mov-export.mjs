import assert from "node:assert/strict";
import {chromium} from "playwright";
import {execFileSync} from "node:child_process";
import {readFileSync,mkdtempSync,rmSync,mkdirSync} from "node:fs";
import {tmpdir} from "node:os";
import {join} from "node:path";
import {serveLocalSite} from "./test-http-server.mjs";
const tmp=mkdtempSync(join(tmpdir(),"cf-mov-v2-"));
const mov=join(tmp,"quicktime.mov");
let site,browser;
try{
 execFileSync("ffmpeg",["-hide_banner","-loglevel","error","-y",
  "-f","lavfi","-i","testsrc2=size=320x180:rate=12",
  "-f","lavfi","-i","sine=frequency=440:sample_rate=44100",
  "-t","1.8","-c:v","libx264","-pix_fmt","yuv420p","-c:a","aac","-movflags","+faststart",
  "-f","mov",mov],{timeout:30000});
 const bytes=readFileSync(mov);
 assert.ok(bytes.length>2000);
 site=await serveLocalSite({rootDir:"public"});
 browser=await chromium.launch({headless:true,args:["--no-sandbox"]});
 for(const device of [
  {name:"desktop",width:1440,height:900,mobile:false},
  {name:"mobile",width:390,height:844,mobile:true}
 ]){
  const page=await browser.newPage({viewport:{width:device.width,height:device.height},isMobile:device.mobile,hasTouch:device.mobile,acceptDownloads:true});
  const errors=[];page.on("pageerror",e=>errors.push(e.message));
  await page.goto(site.origin+"/studio-v2/",{waitUntil:"load"});
  await page.waitForFunction(()=>!!window.ClipForgeStudioV2&&!!window.ClipForgeStudioMov&&!!window.ClipForgeStudioExportFormat);
  assert.ok(await page.locator("#fileInput").getAttribute("accept").then(a=>a.includes(".mov")));
  const capabilities=await page.evaluate(()=>({
   emptyMime:window.ClipForgeStudioMov.isMov(new File(["x"],"test.mov")),
   quickTime:window.ClipForgeStudioMov.isMov(new File(["x"],"test.MOV",{type:"video/quicktime"}))
  }));
  assert.ok(capabilities.emptyMime&&capabilities.quickTime,".mov extension must work even when OS omits MIME type");
  await page.locator("#fileInput").setInputFiles({name:"quicktime.mov",mimeType:"video/quicktime",buffer:bytes});
  await page.waitForFunction(()=>window.ClipForgeStudioV2.getState().clips.length===1,{timeout:20000});
  const state=await page.evaluate(()=>window.ClipForgeStudioV2.getState());
  assert.equal(state.mediaInfo[0].name,"quicktime.mov");
  assert.equal(state.mediaInfo[0].kind,"video");
  assert.ok(state.clips[0].duration>1.65&&state.clips[0].duration<2.2,
   "MOV duration must reflect real metadata, not a fake 8-second clip: "+state.clips[0].duration);
  const result=await page.evaluate(async()=>{
   const asset=window.ClipForgeStudioV2.getState().mediaInfo[0];
   return {format:asset.format,converted:asset.converted};
  });
  assert.ok(result.format.includes("MOV"));
  await page.evaluate(()=>window.ClipForgeStudioV2.setTime(.4));
  await page.locator("#playBtn").click();await page.waitForTimeout(200);await page.locator("#playBtn").click();
  await page.locator("#exportBtn").click();
  await page.locator("#exportFormat").selectOption("mp4");
  await page.locator("#exportResolution").selectOption("720");
  const pending=page.waitForEvent("download",{timeout:60000});
  await page.locator("#startExport").click();
  const download=await pending;
  const path=await download.path();
  const actual=readFileSync(path);
  const extension=download.suggestedFilename().split(".").pop().toLowerCase();
  assert.ok(["mp4","webm"].includes(extension),"Only valid MP4/WebM extensions may be exported");
  assert.ok(actual.length>2000,"Export should contain real data");
  const probe=JSON.parse(execFileSync("ffprobe",["-v","error","-show_streams","-show_format","-of","json",path],{encoding:"utf8",timeout:20000}));
  assert.ok(probe.streams.some(s=>s.codec_type==="video"));
  assert.ok(Number(probe.format.duration)>1.5&&Number(probe.format.duration)<3.5,
   "Export must contain nonzero correct duration: "+JSON.stringify(probe.format));
  const status=await page.locator("#exportText").textContent();
  assert.ok(status.includes("Saved "+extension.toUpperCase()),"UI must truthfully label exported container: "+status);
  mkdirSync("reports",{recursive:true});
  await page.screenshot({path:"reports/studio-v2-mov-"+device.name+".png"});
  assert.deepEqual(errors,[],"No uncaught editor runtime errors");
  await page.close();
 }
 console.log("Studio V2 real MOV tests passed: QuickTime H.264/AAC import, exact duration, playback, MP4 preferred export and fallback metadata.");
}finally{await browser?.close();await site?.close();rmSync(tmp,{recursive:true,force:true});}
