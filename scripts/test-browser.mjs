import assert from "node:assert/strict";
import { createServer } from "node:http";
import { readFileSync, statSync } from "node:fs";
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
