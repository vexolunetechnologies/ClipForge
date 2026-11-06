import assert from "node:assert/strict";
import {chromium} from "playwright";
import {execFileSync} from "node:child_process";
import {readFileSync,mkdtempSync,rmSync,mkdirSync} from "node:fs";
import {tmpdir} from "node:os";
import {join} from "node:path";
import {serveLocalSite} from "./test-http-server.mjs";
const dir=mkdtempSync(join(tmpdir(),"cf-studio-v2-"));
const path=join(dir,"sample.webm");
let site,browser;
try{
 execFileSync("ffmpeg",["-hide_banner","-loglevel","error","-y","-f","lavfi","-i","testsrc2=size=320x180:rate=12","-t","2",
  "-c:v","libvpx","-deadline","realtime","-cpu-used","8","-b:v","300k","-an",path],{timeout:30000});
 const buffer=readFileSync(path);
 site=await serveLocalSite({rootDir:"public"});
 browser=await chromium.launch({headless:true,args:["--no-sandbox"]});
 for(const device of [{name:"desktop",width:1440,height:900,mobile:false},{name:"mobile",width:390,height:844,mobile:true}]){
  const page=await browser.newPage({viewport:{width:device.width,height:device.height},isMobile:device.mobile,hasTouch:device.mobile});
  const errors=[];page.on("pageerror",e=>errors.push(e.message));
  await page.goto(site.origin+"/studio-v2/",{waitUntil:"load"});
  await page.waitForFunction(()=>!!window.ClipForgeStudioV2);
  assert.ok(await page.locator(".timeline").isVisible());
  assert.ok(await page.locator("#preview").isVisible());
  const widths=await page.evaluate(()=>({overflow:document.documentElement.scrollWidth>innerWidth+2,monitor:document.querySelector(".monitor").getBoundingClientRect().width,preview:document.querySelector("#preview").getBoundingClientRect().width}));
  assert.equal(widths.overflow,false,JSON.stringify(widths));assert.ok(widths.preview>=200,JSON.stringify(widths));
  if(device.mobile){
   const layout=await page.evaluate(()=>{
    const rect=s=>{const r=document.querySelector(s).getBoundingClientRect();return {x:r.x,y:r.y,w:r.width,h:r.height,bottom:r.bottom};};
    return {header:rect(".topbar"),monitor:rect(".monitor"),transport:rect(".transport"),timeline:rect(".timeline"),dock:rect(".mobile-dock"),playhead:rect("#playhead"),tabs:[...document.querySelectorAll(".mobile-dock button")].map(b=>b.lastChild?.textContent.trim()),css:[...document.styleSheets].some(s=>s.href?.includes("mobile-capcut.css"))};
   });
   assert.ok(layout.css,"CapCut reference layout sheet must be loaded");
   assert.ok(Math.abs(layout.monitor.w-device.width)<3,JSON.stringify(layout));
   assert.ok(layout.monitor.h>=220&&layout.monitor.h<=device.width+2,JSON.stringify(layout));
   assert.ok(layout.transport.y>=layout.monitor.bottom-2,JSON.stringify(layout));
   assert.ok(layout.timeline.y>=layout.transport.bottom-2,JSON.stringify(layout));
   assert.ok(layout.timeline.h>=190,JSON.stringify(layout));
   assert.ok(Math.abs(layout.playhead.x-device.width/2)<3,JSON.stringify(layout));
   assert.deepEqual(layout.tabs,["Edit","Audio","Text","Effects","Overlay","Captions"]);
   assert.ok(layout.dock.bottom<=device.height+2,JSON.stringify(layout));
   assert.ok(await page.locator("#videoLane .empty-lane-action").isVisible(),"Add video should be visible when timeline is empty");
   assert.ok(await page.locator("#audioLane .empty-lane-action").isVisible(),"Add audio should be visible when timeline is empty");
   assert.ok(await page.locator("#textLane .empty-lane-action").isVisible(),"Add text should be visible when timeline is empty");
   mkdirSync("reports",{recursive:true});
   await page.screenshot({path:"reports/studio-v2-mobile-reference-empty.png"});
   await page.locator('[data-action="overlay"]').click();
   assert.ok(await page.locator("#tabOverlay.active").isVisible());
   await page.locator("#sheetBackdrop").click();
   assert.ok(await page.locator(".mobile-dock").isVisible());
   await page.locator('[data-action="text"]').click();assert.ok(await page.locator(".assets.sheet-open").isVisible());await page.locator("#sheetBackdrop").click();
  }
  else{assert.ok(await page.locator(".inspector").isVisible());assert.ok(await page.locator(".assets").isVisible());}
  await page.locator("#fileInput").setInputFiles({name:"sample.webm",mimeType:"video/webm",buffer});
  await page.waitForFunction(()=>window.ClipForgeStudioV2.getState().clips.length===1);
  assert.equal((await page.evaluate(()=>window.ClipForgeStudioV2.getState())).clips[0].kind,"video");
  await page.waitForFunction(()=>document.querySelectorAll("#videoLane .clip").length===1);
  await page.evaluate(()=>window.ClipForgeStudioV2.setTime(.8));
  await page.locator("#splitBtn").click();
  await page.waitForFunction(()=>window.ClipForgeStudioV2.getState().clips.length===2);
  await page.locator("#undoBtn").click();
  await page.waitForFunction(()=>window.ClipForgeStudioV2.getState().clips.length===1);
  await page.locator("#redoBtn").click();
  await page.waitForFunction(()=>window.ClipForgeStudioV2.getState().clips.length===2);
  await page.locator("#playBtn").click();
  await page.waitForTimeout(220);
  await page.locator("#playBtn").click();
  assert.ok((await page.evaluate(()=>window.ClipForgeStudioV2.getState())).time>=0);
  if(device.mobile){await page.waitForTimeout(270);mkdirSync("reports",{recursive:true});await page.screenshot({path:"reports/studio-v2-mobile-timeline.png"});}
  if(device.mobile)await page.locator('[data-action="text"]').click();
  else await page.locator('[data-tab="text"]').click();
  await page.locator("#newText").fill("Hello ClipForge");
  await page.locator("#addText").click();
  await page.waitForFunction(()=>window.ClipForgeStudioV2.getState().clips.some(c=>c.kind==="text"));
  assert.equal((await page.evaluate(()=>window.ClipForgeStudioV2.getState())).clips.length,3);
  mkdirSync("reports",{recursive:true});
  await page.waitForTimeout(280);
  await page.screenshot({path:"reports/studio-v2-"+device.name+".png"});
  if(!device.mobile){
   // Export real video from canvas, verify downloadable media has a valid duration.
   const field=page.locator('#inspectorContent [data-field="duration"]');
   await field.fill("1");await field.dispatchEvent("change");
   const downloading=page.waitForEvent("download",{timeout:30000});
   await page.locator("#exportBtn").click();
   await page.locator("#startExport").click();
   const downloaded=await downloading;
   const output=await downloaded.path();
   const bytes=readFileSync(output);
   assert.ok(bytes.length>2000,"Export must produce a real media file");
   const probe=JSON.parse(execFileSync("ffprobe",["-v","error","-show_format","-show_streams","-of","json",output],{encoding:"utf8",timeout:20000}));
   assert.ok(probe.streams.some(s=>s.codec_type==="video"),"Video track required in export");
   assert.ok(Number(probe.format?.duration)>1,"Export duration metadata must be valid: "+JSON.stringify(probe.format));
  }
  assert.deepEqual(errors,[],device.name+" uncaught JS errors");
  await page.close();
 }
 console.log("Studio V2 passed: desktop/mobile layout, real WebM import, timeline split, undo/redo, playback, text overlay.");
}finally{await browser?.close();await site?.close();rmSync(dir,{recursive:true,force:true});}
