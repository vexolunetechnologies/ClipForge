import { chromium } from "playwright";
import { mkdirSync, writeFileSync } from "node:fs";
import { serveLocalSite } from "./test-http-server.mjs";

const site=await serveLocalSite();
let browser;
const samples=[];
try {
 browser=await chromium.launch({headless:true,args:["--no-sandbox"]});
 for(let repetition=0;repetition<3;repetition++){
  const page=await browser.newPage({viewport:{width:1365,height:820}});
  await page.goto(site.origin+"/",{waitUntil:"domcontentloaded"});
  await page.waitForFunction(()=>!!window.ClipForgeNavigation && !!window.ClipForgeEditor &&
    !!document.getElementById("cfCaptionsWorkspace"));
  const startup=await page.evaluate(()=>{
   const t=performance.getEntriesByType("navigation")[0];
   return {
    domReadyMs:Math.round(t?.domContentLoadedEventEnd||0),
    homeCaptionCards:document.querySelectorAll("#cfCapTemplateGrid button").length,
    homeShortsCards:document.querySelectorAll("#cfShortTemplateGrid button").length,
    editorEnhancementsInitiallyRequested:performance.getEntriesByType("resource")
      .filter(r=>/\/dist\/editor\/(timeline|studio-ui)\.js$/.test(new URL(r.name).pathname)).length
   };
  });
  const switching=[];
  for(const tool of ["shorts","trailer","animator","reverse","montage","highlights","captions","editor"]){
   const result=await page.evaluate(async(tool)=>{
    const before=performance.now();
    window.ClipForgeNavigation.navigate("/tools/"+tool+"/");
    await new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve)));
    return {tool,settleTwoFramesMs:Math.round((performance.now()-before)*10)/10};
   },tool);
   switching.push(result);
  }
  await page.waitForFunction(()=>document.querySelector("#editorTool")?.dataset.proUiReady==="1");
  const detail=await page.evaluate(()=>({
   captionCards:document.querySelectorAll("#cfCapTemplateGrid button").length,
   captionPainted:document.querySelectorAll('#cfCapTemplateGrid canvas[data-cf-painted="1"]').length,
   editorModulesFetched:performance.getEntriesByType("resource")
    .filter(r=>/\/dist\/editor\/(timeline|studio-ui)\.js$/.test(new URL(r.name).pathname)).length
  }));
  samples.push({run:repetition+1,startup,switching,detail});
  await page.close();
 }
 const median=items=>items.slice().sort((a,b)=>a-b)[Math.floor(items.length/2)];
 const report={
  methodology:"Local Chromium, three fresh pages, 1365x820 viewport; DOMContentLoaded and two-animation-frame route settle metrics; no media encoding or AI API latency included.",
  baselineCommit:"e4436e4145156862edfd930637c508ba39f0b18a",
  startupDomReadyMedianMs:median(samples.map(s=>s.startup.domReadyMs)),
  switchMedianMsByTool:Object.fromEntries(samples[0].switching.map(({tool})=>
   [tool,median(samples.map(s=>s.switching.find(x=>x.tool===tool).settleTwoFramesMs))])),
  samples
 };
 mkdirSync("reports",{recursive:true});
 writeFileSync("reports/phase1-performance.json",JSON.stringify(report,null,2)+"\n");
 console.log(JSON.stringify({startupDomReadyMedianMs:report.startupDomReadyMedianMs,switchMedianMsByTool:report.switchMedianMsByTool,homeCaptionCards:samples[0].startup.homeCaptionCards,homeShortsCards:samples[0].startup.homeShortsCards,editorEnhancementsInitiallyRequested:samples[0].startup.editorEnhancementsInitiallyRequested}));
} finally {
 if(browser)await browser.close();
 await site.close();
}
