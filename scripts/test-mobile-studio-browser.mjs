import assert from "node:assert/strict";
import {chromium} from "playwright";
import {mkdirSync} from "node:fs";
import {serveLocalSite} from "./test-http-server.mjs";

const site=await serveLocalSite();
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
 const narrow=await page.evaluate(()=>({
  w:document.querySelector(".st-timeline-panel").getBoundingClientRect().width,
  previewH:document.querySelector(".st-preview-panel").getBoundingClientRect().height,
  dockW:document.querySelector(".st-mobile-dock").getBoundingClientRect().width,
  overflow:document.documentElement.scrollWidth>innerWidth+2
 }));
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
