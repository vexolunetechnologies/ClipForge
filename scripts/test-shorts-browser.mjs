import assert from "node:assert/strict";
import {chromium} from "playwright";
import {serveLocalSite} from "./test-http-server.mjs";

const site=await serveLocalSite();
let browser;
try{
 browser=await chromium.launch({headless:true,args:["--no-sandbox"]});
 const page=await browser.newPage();
 const errors=[];page.on("pageerror",e=>errors.push(e.message));
 await page.goto(site.origin+"/tools/shorts/",{waitUntil:"domcontentloaded"});
 await page.waitForFunction(()=>typeof window.semanticShortPlan==="function"&&!!document.getElementById("list"));
 await page.route("**/api/v1/shorts/semantic-plan",async route=>{
  await route.fulfill({status:200,contentType:"application/json",body:JSON.stringify({
   selectionMode:"transcript-fallback",clips:[{start:10,end:50,score:null,category:"Dialogue review",
    reason:"Transcript-based recovery, not an AI quality score."}]
  })});
 });
 const output=await page.evaluate(async()=>{
  PL=45;
  S.n=3;
  S.lang="urdu";
  SHORTS_TRANSCRIPT=[{timestamp:[10,12],text:"Dialogue from the episode."}];
  LAST={dur:180,D:180,lo:0,hi:180,seen:[]};
  const candidates=await semanticShortPlan(RUN,180);
  clips=candidates;
  render();
  return {mode:LAST.selectionMode,count:candidates.length,score:candidates[0].score,
   tags:candidates[0].tags,reason:candidates[0].reason};
 });
 assert.equal(output.mode,"transcript-fallback");
 assert.equal(output.score,null,"Do not show a fictitious AI ranking for fallback clips");
 assert.equal(output.count,1);
 assert.deepEqual(output.tags,["Dialogue review"]);
 const card=page.locator("#list .clip").first();
 assert.equal(await card.count(),1);
 assert.equal(await card.locator(".score").count(),0);
 assert.match(await card.innerText(),/Transcript-based recovery/);
 assert.equal(new URL(page.url()).hash,"");
 assert.deepEqual(errors,[]);
 console.log("ClipForge Shorts browser: fallback clip renders without fabricated score, with preview controls.");
}finally{if(browser)await browser.close();await site.close()}
