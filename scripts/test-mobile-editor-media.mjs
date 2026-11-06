import assert from "node:assert/strict";
import {chromium} from "playwright";
import {execFileSync} from "node:child_process";
import {readFileSync, mkdtempSync, mkdirSync, rmSync} from "node:fs";
import {tmpdir} from "node:os";
import {join} from "node:path";
import {serveLocalSite} from "./test-http-server.mjs";

// Runs against the deployed public/ layout using a real video, not a mocked timeline.
const temp=mkdtempSync(join(tmpdir(),"clipforge-mobile-media-"));
const videoPath=join(temp,"clipforge-smoke.webm");
let browser,site;
try {
 execFileSync("ffmpeg",["-hide_banner","-loglevel","error","-y","-f","lavfi",
  "-i","testsrc2=size=320x180:rate=12","-t","2.4",
  "-c:v","libvpx","-deadline","realtime","-cpu-used","8","-b:v","320k","-an",videoPath],{timeout:30000});
 const bytes=readFileSync(videoPath);
 assert.ok(bytes.length>1000);
 site=await serveLocalSite({rootDir:"public"});
 browser=await chromium.launch({headless:true,args:["--no-sandbox"]});
 const page=await browser.newPage({viewport:{width:390,height:844},deviceScaleFactor:1,isMobile:true,hasTouch:true});
 const errors=[];
 page.on("pageerror",error=>errors.push(error.message));
 await page.goto(site.origin+"/tools/editor/",{waitUntil:"domcontentloaded"});
 await page.waitForFunction(()=>document.querySelector("#editorTool")?.dataset.proUiReady==="1");
 const editor=page.locator("#editorTool");
 await editor.locator("#stImport").setInputFiles({name:"clipforge-smoke.webm",mimeType:"video/webm",buffer:bytes});
 await page.waitForFunction(()=>document.querySelectorAll("#stMedia [data-mid]").length===1);
 // The media bin is a mobile bottom sheet. Open it before clicking the file.
 await editor.locator(".st-mobile-import").click();
 await editor.locator("#stMedia [data-mid]").first().click();
 await editor.locator(".st-assets .st-mobile-sheet-close").click();
 await page.waitForFunction(()=>document.querySelectorAll('#stInner .st-pro-lane[data-lane-kind="video"] .st-clip-block').length===1);
 // Decorative thumbnails must load without replacing the actual clip buttons.
 await page.waitForFunction(()=>{
  const strip=document.querySelector('#stInner .st-pro-lane[data-lane-kind="video"] .cf-mobile-filmstrip');
  return strip&&strip.style.backgroundImage.includes("data:image/jpeg");
 },{timeout:12000});
 const before=await editor.locator('#stInner .st-pro-lane[data-lane-kind="video"] .st-clip-block').count();
 assert.equal(before,1);
 assert.ok(await editor.locator("#stAppExport").isVisible());
 const monitor=await editor.locator(".st-preview-panel").boundingBox();
 assert.ok(monitor&&monitor.width>=380,"Imported video must remain full width");
 await editor.locator("#stPlay").click();
 await page.waitForTimeout(400);
 await editor.locator("#stPlay").click();
 const time=await page.evaluate(()=>Number(document.querySelector("#stCurrent")?.textContent.split(":").at(-1)));
 assert.ok(Number.isFinite(time),"Video playback controls should remain responsive");
 await page.evaluate(()=>{
  const slider=document.querySelector("#stScrub");slider.value="500";
  slider.dispatchEvent(new Event("input",{bubbles:true}));
 });
 await page.waitForTimeout(100);
 await editor.locator('[data-mobile-utility="split"]').click();
 await page.waitForFunction(()=>document.querySelectorAll('#stInner .st-pro-lane[data-lane-kind="video"] .st-clip-block').length===2);
 await editor.locator('[data-mobile-utility="undo"]').click();
 await page.waitForFunction(()=>document.querySelectorAll('#stInner .st-pro-lane[data-lane-kind="video"] .st-clip-block').length===1);
 mkdirSync("reports",{recursive:true});
 await page.screenshot({path:"reports/mobile-studio-imported-video.png",fullPage:false});
 assert.deepEqual(errors,[],"Editor should not throw on import, playback, split or undo");
 console.log("Mobile Studio real WebM test passed: import, preview, play/pause, split, undo, export button visible.");
} finally {
 if(browser)await browser.close();
 if(site)await site.close();
 rmSync(temp,{recursive:true,force:true});
}
