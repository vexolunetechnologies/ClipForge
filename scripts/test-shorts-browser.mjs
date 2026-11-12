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
 assert.equal(await page.evaluate(()=>S.len),"auto","Auto Duration must be the default");
 assert.match(await page.locator("#lens .chip.on").innerText(),/Auto/);
 let lastAutoRequest=null;
 await page.route("**/api/v1/shorts/semantic-plan",async route=>{
  lastAutoRequest=route.request().postDataJSON();
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
 assert.equal(lastAutoRequest.autoDuration,true,"Auto mode must reach Worker as Auto");
 assert.equal(Object.hasOwn(lastAutoRequest,"targetLength"),false,
  "Auto Shorts must never send the old hidden 45-second target");
 assert.equal(output.mode,"transcript-fallback");
 assert.equal(output.score,null,"Do not show a fictitious AI ranking for fallback clips");
 assert.equal(output.count,1);
 assert.deepEqual(output.tags,["Dialogue review"]);
 const card=page.locator("#list .clip").first();
 assert.equal(await card.count(),1);
 assert.equal(await card.locator(".score").count(),0);
 assert.match(await card.innerText(),/Transcript-based recovery/);
 const startSlider=card.locator('input[aria-label="Short 1 trim start"]');
 const endSlider=card.locator('input[aria-label="Short 1 trim end"]');
 assert.equal(await startSlider.count(),1,"Shorts must have precise start trim");
 assert.equal(await endSlider.count(),1,"Shorts must have precise end trim");
 await startSlider.evaluate(input=>{input.value="12.5";input.dispatchEvent(new Event("input",{bubbles:true}))});
 assert.match(await card.locator(".cf-short-trim-readout").textContent(),/12\.5s – 50\.0s · 37\.5s/);
 assert.ok((await page.evaluate(()=>clips[0].s))===12.5,"Trim start must update source interval");
 await endSlider.evaluate(input=>{input.value="42.5";input.dispatchEvent(new Event("input",{bubbles:true}))});
 assert.match(await card.locator(".cf-short-trim-readout").textContent(),/12\.5s – 42\.5s · 30\.0s/);
 assert.ok((await page.evaluate(()=>clips[0].e))===42.5,"Trim end must update export interval");
 assert.equal(await card.locator('button:text("Preview trimmed")').count(),1);
 assert.equal(new URL(page.url()).hash,"");
 assert.deepEqual(errors,[]);
 console.log("ClipForge Shorts browser: fallback clip renders without fabricated score, with preview controls.");
}finally{if(browser)await browser.close();await site.close()}
