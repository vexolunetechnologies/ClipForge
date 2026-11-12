import assert from "node:assert/strict";
import { createServer } from "node:http";
import { readFileSync, statSync, mkdirSync } from "node:fs";
import { extname, join, resolve, sep } from "node:path";
import { chromium } from "playwright";

const root = resolve(".");
const types = {".html":"text/html; charset=utf-8",".js":"text/javascript; charset=utf-8",".css":"text/css; charset=utf-8",".json":"application/json"};
const server = createServer((req, res) => {
  const uri = new URL(req.url, "http://localhost");
  const suffix = uri.pathname.endsWith("/") ? uri.pathname + "index.html" : uri.pathname;
  const file = resolve(root, "." + decodeURIComponent(suffix));
  if (!file.startsWith(root + sep)) { res.writeHead(403); res.end(); return; }
  try {
    if (!statSync(file).isFile()) throw Error("not a file");
    res.setHeader("Content-Type", types[extname(file)] || "application/octet-stream");
    res.end(readFileSync(file));
  } catch {
    res.writeHead(404, {"Content-Type":"text/plain"});
    res.end("Not found");
  }
});
await new Promise((ok) => server.listen(0, "127.0.0.1", ok));
const base = "http://127.0.0.1:" + server.address().port;
mkdirSync("reports", {recursive:true});

let browser;
try {
  browser = await chromium.launch({headless:true, args:["--no-sandbox"]});
  const page = await browser.newPage({viewport:{width:1440,height:900}});
  const errors = [];
  page.on("pageerror", (e) => errors.push(String(e.message || e)));

  await page.goto(base + "/", {waitUntil:"domcontentloaded"});
  await page.waitForFunction(() => !!window.ClipForgeNavigation &&
    !!window.ClipForgeEditor && !!document.getElementById("cfCaptionsWorkspace"));
  await page.evaluate(() => { window.__clipForgeBrowserMarker = "same-document"; });
  await page.locator('[data-route="tools"]').click();
  await page.waitForFunction(() => document.body.dataset.page === "tools");
  const chooser = page.locator("#cf-ux-chooser");
  await chooser.waitFor({state:"visible"});
  assert.equal(await chooser.locator("a.cf-ux-choice").count(),8,
    "Quick tool chooser must offer all eight workflows");
  assert.equal(await page.locator("#tools .cf-ux-best").count(),8,
    "Every catalog card needs a simple best-for description");
  await chooser.screenshot({path:"reports/ux-review-tool-picker-desktop.png"});

  const tools = ["shorts","trailer","animator","reverse","montage","highlights","captions","editor"];
  for (const tool of tools) {
    await page.locator('[data-tool-route="' + tool + '"]').click();
    await page.waitForFunction(t => location.pathname === "/tools/" + t + "/" &&
      document.body.dataset.page === "workspace" && document.body.dataset.tool === t, tool);
    assert.equal(new URL(page.url()).hash, "", "Duplicate hash in " + tool + " route");
    assert.equal(await page.evaluate(() => window.__clipForgeBrowserMarker), "same-document",
      "Switching " + tool + " unexpectedly reloaded the document");
    const visible = {shorts:"tool",trailer:"tool",animator:"iaTool",reverse:"rvTool",
      montage:"vmTool",highlights:"highlightsTool",captions:"cfCaptionsWorkspace",editor:"editorTool"}[tool];
    assert.equal(await page.locator("#" + visible).isVisible(), true, tool + " workspace not visible");
    const guide = page.locator('#' + visible + ' .cf-ux-guide[data-ux-for="' + tool + '"]');
    await guide.waitFor({state:"visible",timeout:8000});
    assert.equal(await guide.locator("li.cf-ux-step").count(),3,
      tool + " must show the three next steps");
    assert.equal(await guide.locator("button.cf-ux-open").count(),1,
      tool + " must show a working upload shortcut");
    if(tool==="montage")await guide.screenshot({path:"reports/ux-review-montage-desktop.png"});
    if(tool==="editor")await guide.screenshot({path:"reports/ux-review-editor-desktop.png"});
    if (tool === "animator" || tool === "reverse") {
      const bounds = await page.locator("#" + visible).boundingBox();
      assert.ok(bounds && bounds.y < 180, tool + " retained the large top gap");
    }
    if (tool === "animator") await page.locator("#iaTool iframe").waitFor();
    if (tool === "captions") {
      assert.ok(await page.locator("#cfCapTemplateGrid button").count() >= 41,
        "Caption library lost its 41 styles");
    }
  }

  // Review the exact same source in an Android-sized viewport.
  const mobile = await browser.newPage({viewport:{width:390,height:844},hasTouch:true,isMobile:true});
  const mobileErrors=[];mobile.on("pageerror",error=>mobileErrors.push(error.message));
  try{
    await mobile.goto(base + "/#tools", {waitUntil:"domcontentloaded"});
    const mobileChooser=mobile.locator("#cf-ux-chooser");
    await mobileChooser.waitFor({state:"visible"});
    await mobileChooser.screenshot({path:"reports/ux-review-tool-picker-mobile.png"});
    for(const tool of ["shorts","animator","captions"]){
      await mobile.goto(base + "/tools/" + tool + "/",{waitUntil:"domcontentloaded"});
      const guide=mobile.locator('.cf-ux-guide[data-ux-for="'+tool+'"]');
      await guide.waitFor({state:"visible",timeout:8000});
      const bounds=await guide.boundingBox();
      assert.ok(bounds&&bounds.width<=390&&bounds.x>=0,
        "Quick-start guide must fit narrow phone screens: "+tool+" "+JSON.stringify(bounds));
      await guide.screenshot({path:"reports/ux-review-"+tool+"-mobile.png"});
    }
    await mobile.goto(base + "/tools/shorts/",{waitUntil:"domcontentloaded"});
    const chooserEvent=mobile.waitForEvent("filechooser");
    await mobile.locator('#tool .cf-ux-guide .cf-ux-open').click();
    const filePicker=await chooserEvent;
    assert.ok(filePicker,"Shorts upload shortcut must open native file picker");
    assert.deepEqual(mobileErrors,[],"Mobile UX must not throw runtime errors");
  }finally{await mobile.close()}

  await page.locator("a.st-app-exit").click();
  await page.waitForFunction(() => location.pathname === "/" &&
    document.body.dataset.page === "home");
  assert.equal(await page.evaluate(() => window.__clipForgeBrowserMarker), "same-document");

  await page.goBack();
  await page.waitForFunction(() => location.pathname === "/tools/editor/" &&
    document.body.dataset.tool === "editor");

  await page.goto(base + "/tools/shorts/#shorts", {waitUntil:"domcontentloaded"});
  await page.waitForFunction(() => location.pathname === "/tools/shorts/" &&
    location.hash === "" && document.body.dataset.tool === "shorts");
  await page.reload({waitUntil:"domcontentloaded"});
  await page.waitForFunction(() => document.body.dataset.tool === "shorts");
  assert.equal(new URL(page.url()).hash, "");

  assert.deepEqual(errors, [], "Unexpected browser runtime errors");
  console.log("ClipForge: Chromium routing, eight workspaces, Back/Forward, refresh and clean URLs passed.");
} finally {
  if (browser) await browser.close();
  await new Promise((ok) => server.close(ok));
}
