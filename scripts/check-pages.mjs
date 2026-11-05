import assert from "node:assert/strict";
import { readFileSync, existsSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const from = (p) => readFileSync(join(root, p), "utf8");
const has = (p) => assert.ok(existsSync(join(root, p)), "Missing: " + p);
const tools = ["shorts", "trailer", "animator", "reverse", "montage", "highlights", "editor", "captions"];
const files = [
  ["_worker.js", "public/_worker.js"],
  ["styles.css", "public/assets/css/styles.css"],
  ["app.js", "public/assets/js/core/app.js"],
  ["caption-style-library.js", "public/assets/js/shared/caption-style-library.js"],
  ["captions-studio.js", "public/assets/js/tools/captions-studio.js"],
  ["highlights-studio.js", "public/assets/js/tools/highlights-studio.js"],
  ["dist/editor/studio-ui.js", "public/dist/editor/studio-ui.js"],
  ["dist/editor/timeline.js", "public/dist/editor/timeline.js"]
];
for (const [source, destination] of files) {
  has(destination);
  assert.equal(from(source), from(destination), "Unexpected engine change: " + source);
}
has("public/index.html");
const page = from("public/index.html");
assert.match(page, /\/tools\/shorts\//);
assert.match(page, /\/assets\/js\/core\/app\.js/);
for (const tool of tools) {
  const pathname = "public/tools/" + tool + "/index.html";
  has(pathname);
  const html = from(pathname);
  assert.match(html, /data-cf-tool-bootstrap/);
  assert.ok(html.includes('location.search+"#' + tool + '"'), "Wrong entry route: " + tool);
  assert.match(html, /\/assets\/css\/styles\.css/);
  assert.match(html, /\/dist\/editor\/timeline\.js/);
  assert.match(html, /data-cf-link-bridge/);
}
for (const name of ["about", "contact", "privacy", "terms", "cookies", "copyright"]) {
  has("public/" + name + ".html");
}
const worker = from("public/_worker.js");
for (const endpoint of [
  "/api/v1/shorts/transcribe", "/api/v1/shorts/semantic-plan",
  "/api/v1/highlights/plan", "/api/v1/media/import"
]) assert.ok(worker.includes(endpoint), "Missing API: " + endpoint);
assert.match(worker, /env\.ASSETS\.fetch\(request\)/);
assert.match(from("public/dist/editor/layout.js"), /toolcard\[href="\/tools\/editor\/"\]/);

const rootHome = from("index.html");
assert.match(rootHome, /data-cf-link-bridge/);
for (const tool of tools) {
  const standalone = "tools/" + tool + "/index.html";
  has(standalone);
  const html = from(standalone);
  assert.match(html, /data-cf-tool-bootstrap/);
  assert.ok(html.includes('location.search+"#' + tool + '"'), "Incorrect legacy router bootstrap: " + tool);
  assert.match(html, /src="\/app\.js"/);
  assert.match(html, /data-cf-link-bridge/);
  assert.match(html, /href="#editor"/);
}

const css = from("styles.css");
assert.match(css, /body\[data-page="workspace"\]\[data-tool="animator"\] #top\.wrap/);
assert.match(css, /body\[data-page="workspace"\]\[data-tool="reverse"\] #top\.wrap/);
assert.match(css, /display:none!important;/);
console.log("ClipForge: static build checks passed for all eight routes, assets and Worker APIs.");
