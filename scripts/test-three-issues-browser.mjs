import assert from "node:assert/strict";
import {readFileSync} from "node:fs";
import {chromium} from "playwright";
import {serveLocalSite} from "./test-http-server.mjs";

const server=await serveLocalSite();
let browser;
try{
 browser=await chromium.launch({headless:true,args:["--no-sandbox"]});
 const page=await browser.newPage({viewport:{width:390,height:844}});
 const errors=[];page.on("pageerror",e=>errors.push(e.message));
 await page.goto(server.origin+"/tools/trailer/",{waitUntil:"domcontentloaded"});
 await page.waitForTimeout(550);
 const initialState=await page.evaluate(()=>({mp4:!!window.ClipForgeMp4,tool:document.body.dataset.tool,route:location.pathname,
  cv:document.querySelector("#cv")?.width,ready:document.readyState}));
 assert.ok(initialState.mp4&&initialState.tool==="trailer","Trailer route initialization: "+JSON.stringify(initialState)+" errors: "+errors.join(" | "));
 const initial=await page.locator("#cv").evaluate(cv=>({width:cv.width,height:cv.height}));
 assert.deepEqual(initial,{width:1280,height:720},"Trailer must default to 16:9 preview");
 assert.match(await page.locator("#cv").evaluate(cv=>cv.previousElementSibling.textContent),/16:9/);
 await page.evaluate(()=>document.querySelector('[data-k="tasp"][data-v="tall"]').click());
 const tall=await page.locator("#cv").evaluate(cv=>({width:cv.width,height:cv.height}));
 assert.deepEqual(tall,{width:720,height:1280},"Vertical trailer is opt-in");
 await page.evaluate(()=>window.ClipForgeNavigation.navigate("/tools/shorts/"));
 await page.waitForFunction(()=>document.body.dataset.tool==="shorts");
 assert.deepEqual(await page.locator("#cv").evaluate(cv=>({width:cv.width,height:cv.height})),
  {width:720,height:1280},"Shorts keeps its 9:16 preview");

 // Shared finalizer is installed before any export engine. Non-MP4 files pass
 // through unchanged, and malformed/small blobs cannot produce fake duration.
 const check=await page.evaluate(async()=>{
  const plain=new Blob(["webm"],{type:"video/webm"});
  const mp4=new Blob(["bad"],{type:"video/mp4"});
  const unchanged=await window.ClipForgeMp4.finalize(plain);
  const tooSmall=await window.ClipForgeMp4.finalize(mp4);
  return {same:unchanged.blob===plain,changed:unchanged.changed,small:tooSmall.blob===mp4};
 });
 assert.deepEqual(check,{same:true,changed:false,small:true});
 assert.deepEqual(errors,[]);
 console.log("ClipForge: Trailer landscape preview, opt-in portrait mode, Shorts 9:16 restoration, MP4 guard behavior passed.");
}finally{if(browser)await browser.close();await server.close();}
