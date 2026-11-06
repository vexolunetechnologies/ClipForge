import assert from "node:assert/strict";
import {chromium} from "playwright";
import {mkdirSync} from "node:fs";
import {serveLocalSite} from "./test-http-server.mjs";

const site=await serveLocalSite({rootDir:"public"});
let browser;
try{
 browser=await chromium.launch({headless:true,args:["--no-sandbox"]});
 const page=await browser.newPage({
  viewport:{width:390,height:844},deviceScaleFactor:1,
  isMobile:true,hasTouch:true
 });
 const errors=[];
 page.on("pageerror",e=>errors.push(e.message));
 await page.goto(site.origin+"/tools/editor/",{waitUntil:"domcontentloaded"});
 await page.waitForFunction(()=>document.querySelector("#editorTool")?.dataset.proUiReady==="1");
 // Regression: the standalone mobile design CSS previously never reached public/.
 const mobileStyle=await page.evaluate(async()=>{
  const href=document.querySelector('link[href*="editor-mobile-layout.css"]')?.getAttribute('href');
  if(!href)return {href:null,status:0,applied:false};
  const response=await fetch(href);
  return {href,status:response.status,applied:[...document.styleSheets].some(s=>s.href?.includes("editor-mobile-layout.css"))};
 });
 assert.ok(mobileStyle.href&&mobileStyle.status===200&&mobileStyle.applied,
  "Mobile layout CSS must be deployed and applied: "+JSON.stringify(mobileStyle));
 const editor=page.locator("#editorTool");
 assert.equal(await page.evaluate(()=>document.body.dataset.tool),"editor");
 assert.ok(await editor.locator(".st-pro-main").count(),"Professional editor must remain mounted");
 const geometry=await page.evaluate(()=>{
  const rect=s=>{const r=document.querySelector(s).getBoundingClientRect();return {
   x:r.x,y:r.y,w:r.width,h:r.height,bottom:r.bottom
  }};
  return {
   viewport:innerHeight,bodyClasses:document.body.className,
   header:rect("#editorTool>.st-appbar"),
   monitor:rect("#editorTool .st-preview-panel"),
   timeline:rect("#editorTool .st-timeline-panel"),
   dock:rect("#editorTool .st-mobile-dock"),
   canvas:rect("#stCanvas"),
   importVisible:getComputedStyle(document.querySelector("#editorTool .st-mobile-import")).display!=="none",
   toolsVisible:getComputedStyle(document.querySelector("#editorTool .st-mobile-dock")).display!=="none",
   horizontalOverflow:document.documentElement.scrollWidth>innerWidth+2
  };
 });
 assert.ok(geometry.header.h>=45&&geometry.header.h<=75,JSON.stringify(geometry));
 assert.ok(geometry.monitor.w>=380&&geometry.monitor.x>=-2&&geometry.monitor.x<=4,
  "Program monitor must be full-width, not trapped in old desktop grid: "+JSON.stringify(geometry));
 assert.ok(geometry.timeline.w>=380,
  "Timeline must use full mobile viewport width: "+JSON.stringify(geometry));
 const headerLayout=await page.evaluate(()=>{
  const rect=s=>{const r=document.querySelector(s).getBoundingClientRect();return {left:r.left,right:r.right,width:r.width}};
  return {brand:rect(".st-appbrand"),project:rect("#stProjectName"),export:rect("#stAppExport")};
 });
 assert.ok(headerLayout.brand.right<=headerLayout.project.left+2 &&
  headerLayout.project.right<=headerLayout.export.left+2,
  "Project title must not overlap brand or Export button: "+JSON.stringify(headerLayout));
 const lanes=await page.evaluate(()=>[...document.querySelectorAll("#stInner .st-pro-lane")].map(e=>({
  kind:e.dataset.laneKind,label:e.querySelector(".st-track-label")?.textContent?.trim()
 })));
 assert.equal(lanes.filter(x=>x.kind==="video").length,1,
  "Exactly one video lane should be rendered: "+JSON.stringify(lanes));
 assert.deepEqual(lanes.slice(0,3).map(x=>x.kind),["video","audio","caption"],
  "Timeline order should be Video, Audio, Text: "+JSON.stringify(lanes));
 assert.ok(geometry.monitor.h>=165&&geometry.monitor.h<=geometry.viewport*.56,JSON.stringify(geometry));
 assert.ok(geometry.canvas.h>=100,JSON.stringify(geometry));
 assert.ok(geometry.timeline.y>=geometry.monitor.bottom-4,
  "Actual timeline should appear directly below preview, not as desktop four-panel layout: "+JSON.stringify(geometry));
 assert.ok(geometry.timeline.h>=180,JSON.stringify(geometry));
 assert.ok(geometry.dock.y>=geometry.timeline.y&&geometry.dock.bottom<=geometry.viewport+2);
 assert.equal(geometry.importVisible,true);
 assert.equal(geometry.toolsVisible,true);
 assert.equal(geometry.horizontalOverflow,false,"Mobile editor must not overflow horizontally");
 assert.equal(await editor.locator(".st-mobile-dock button").count(),6);
 assert.equal(await editor.locator(".st-mobile-utilities button").count(),4);
 assert.ok(await editor.locator("#stAppExport").isVisible(),"Export must be reachable");
 mkdirSync("reports",{recursive:true});
 await page.screenshot({path:"reports/mobile-studio-default.png"});

 // Every visible mobile tool must trigger its real editor category, not a dead button.
 async function open(action,tab){
  await editor.locator('[data-mobile-action="'+action+'"]').click();
  assert.ok(await editor.evaluate(e=>e.classList.contains("st-mobile-media-open")),
   action+" should open working tool sheet");
  assert.ok(await editor.locator('.st-assets [data-st-tab="'+tab+'"].active').count(),
   action+" should select original tool category "+tab);
  assert.ok(await editor.locator(".st-assets").isVisible());
 }
 // Click the timeline audio row itself: it must open the existing Audio tools.
 await editor.locator('#stInner .st-pro-lane[data-lane-kind="audio"] .st-lane-action').click();
 assert.ok(await editor.evaluate(e=>e.classList.contains("st-mobile-media-open")),
  "Add audio lane must open real audio tools");
 assert.ok(await editor.locator('.st-assets [data-st-tab="audio"].active').count(),
  "Audio lane must activate audio tools");
 await editor.locator(".st-assets .st-mobile-sheet-close").click();
 await open("effects","effects");
 await editor.locator(".st-assets .st-mobile-sheet-close").click();
 assert.equal(await editor.evaluate(e=>e.classList.contains("st-mobile-media-open")),false);
 await open("audio","audio");
 await editor.locator(".st-assets .st-mobile-sheet-close").click();
 await open("captions","captions");
 await editor.locator(".st-assets .st-mobile-sheet-close").click();
 await open("overlay","stickers");
 await editor.locator(".st-assets .st-mobile-sheet-close").click();
 await open("text","text");
 await editor.locator(".st-assets .st-mobile-sheet-close").click();
 await editor.locator('[data-mobile-action="edit"]').click();
 assert.ok(await editor.evaluate(e=>e.classList.contains("st-mobile-inspector-open")));
 assert.ok(await editor.locator(".st-source-panel .st-inspector").isVisible(),
  "Edit opens real inspector in mobile sheet");
 await editor.locator(".st-source-panel .st-mobile-sheet-close").click();

 // Media import uses the existing project bin, unchanged underlying file handler.
 await editor.locator(".st-mobile-import").click();
 assert.ok(await editor.locator(".st-assets").isVisible());
 assert.ok(await editor.locator("#stImport").count());
 await editor.locator(".st-assets .st-mobile-sheet-close").click();
 await page.screenshot({path:"reports/mobile-studio-closed-sheet.png"});

 // Narrow small-phone view must remain usable without horizontal document overflow.
 await page.setViewportSize({width:320,height:700});
 await page.waitForTimeout(150); // wait for mobile viewport media-query recomposition
 const narrow=await page.evaluate(()=>{
  const panel=document.querySelector("#editorTool .st-timeline-panel");
  const main=document.querySelector("#editorTool .st-pro-main");
  return {
   w:panel.getBoundingClientRect().width,
   display:getComputedStyle(panel).display,
   mainW:main.getBoundingClientRect().width,
   mainDisplay:getComputedStyle(main).display,
   previewH:document.querySelector("#editorTool .st-preview-panel").getBoundingClientRect().height,
   dockW:document.querySelector("#editorTool .st-mobile-dock").getBoundingClientRect().width,
   overflow:document.documentElement.scrollWidth>innerWidth+2
  };
 });
 assert.equal(narrow.overflow,false);
 assert.ok(narrow.w>=300&&narrow.dockW>=300&&narrow.previewH>100,JSON.stringify(narrow));

 // Desktop editor stays professional multi-panel; no mobile dock overlaid.
 const desktop=await browser.newPage({viewport:{width:1440,height:900}});
 desktop.on("pageerror",e=>errors.push(e.message));
 await desktop.goto(site.origin+"/tools/editor/",{waitUntil:"domcontentloaded"});
 await desktop.waitForFunction(()=>document.querySelector("#editorTool")?.dataset.proUiReady==="1");
 assert.equal(await desktop.locator("#editorTool .st-mobile-dock").isVisible(),false);
 assert.ok(await desktop.locator("#editorTool .st-source-panel").isVisible());
 assert.ok(await desktop.locator("#stAppExport").isVisible());
 await desktop.close();
 assert.deepEqual(errors,[],"Mobile/desktop editor must not emit uncaught browser errors");
 console.log("ClipForge Mobile Studio: full-height monitor/timeline/dock, real category sheets, real inspector, viewport safety and desktop parity passed.");
}finally{
 if(browser)await browser.close();
 await site.close();
}
