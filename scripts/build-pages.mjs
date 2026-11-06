/**
 * ClipForge Cloudflare Pages output generator.
 * Preserve working legacy engines while exposing eight shareable tool pages.
 */
import { copyFileSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const site = join(root, "public");
const tools = ["shorts", "trailer", "animator", "reverse", "montage", "highlights", "editor", "captions"];
const guideSlugs = [
  "long-video-to-shorts", "urdu-hindi-captions", "export-video-formats", "browser-video-privacy"
];
const origin = "https://clipforgestudio.pages.dev";
const toolSEO = {
  shorts: ["Video to Shorts Tool", "Turn a long recording into vertical Shorts and review dialogue, framing, subtitles and export quality."],
  trailer: ["Trailer & Promo Maker", "Create a trailer or promo from your own video footage and review cuts, timing, audio and aspect ratio."],
  animator: ["Picture to Video Animator", "Animate a still picture into video with ClipForge browser-based picture animation controls."],
  reverse: ["Reverse Video Tool", "Make reversed video clips in a browser and check playback, audio and export compatibility."],
  montage: ["Video Montage Maker", "Arrange video moments into a montage with ClipForge editing controls."],
  highlights: ["Highlights Studio", "Find and review key video highlights from a longer recording in ClipForge."],
  editor: ["Studio Video Editor", "Edit video with ClipForge Studio Editor. Adjust clips, titles and preview your project before export."],
  captions: ["Urdu, Hindi & English Captions Studio", "Generate and edit video captions in Urdu, Hindi or English, choose a style and export subtitle files."]
};
const read = (path) => readFileSync(join(root, path), "utf8");
const ensure = (file) => mkdirSync(dirname(file), { recursive: true });
const put = (relative, content) => {
  const file = join(site, relative);
  ensure(file);
  writeFileSync(file, content, "utf8");
};
const copy = (from, to = from) => {
  const destination = join(site, to);
  ensure(destination);
  copyFileSync(join(root, from), destination);
};

for (const file of [
  "_worker.js", "about.html", "contact.html", "privacy.html", "terms.html",
  "cookies.html", "copyright.html", "styles.css", "editor-mobile-layout.css", "app.js", "navigation.js",
  "caption-style-library.js", "captions-studio.js", "highlights-studio.js", "transcription-queue.js",
  "editor-loader.js", "editor-mobile-thumbnails.js", "animator-idle.js", "montage-mp4.js",
  "dist/editor/layout.js", "dist/editor/timeline.js",
  "dist/editor/studio-ui.js", "dist/editor/types.js"
]) copy(file);

// Original help resources are published as static HTML and readable without JavaScript.
copy("guides.css");
for (const slug of guideSlugs) copy("guides/" + slug + "/index.html");
copy("guides/index.html");

copy("styles.css", "assets/css/styles.css");
copy("app.js", "assets/js/core/app.js");
copy("editor-loader.js", "assets/js/core/editor-loader.js");
copy("animator-idle.js", "assets/js/core/animator-idle.js");
copy("navigation.js", "assets/js/core/navigation.js");
copy("caption-style-library.js", "assets/js/shared/caption-style-library.js");
copy("captions-studio.js", "assets/js/tools/captions-studio.js");
copy("highlights-studio.js", "assets/js/tools/highlights-studio.js");
copy("transcription-queue.js", "assets/js/shared/transcription-queue.js");

const editorLayout = read("dist/editor/layout.js");
const selector = '.toolcard[href="#editor"]';
if (editorLayout.split(selector).length !== 2) {
  throw new Error("Editor card selector changed; review before publishing.");
}
put("dist/editor/layout.js", editorLayout.replace(
  selector, '.toolcard[href="#editor"], .toolcard[href="/tools/editor/"]'
));

const original = read("index.html");
const linkTo = {
  "#top": "/", "#tools": "/#tools", "#features": "/#features",
  "#faq": "/#faq", "#how": "/#how", "#tool": "/tools/shorts/",
  ...Object.fromEntries(tools.map((tool) => ["#" + tool, "/tools/" + tool + "/"]))
};
function rewriteLinks(html) {
  return html.replace(/href=(["'])(#[a-zA-Z0-9-]+)\1/g, (match, quote, hash) => (
    linkTo[hash] ? "href=" + quote + linkTo[hash] + quote : match
  ));
}
function page(tool = null) {
  let html = rewriteLinks(original);
  const paths = new Map([
    ["/styles.css", "/assets/css/styles.css"],
    ["/caption-style-library.js", "/assets/js/shared/caption-style-library.js"],
    ["/app.js", "/assets/js/core/app.js"],
    ["/editor-loader.js", "/assets/js/core/editor-loader.js"],
    ["/navigation.js", "/assets/js/core/navigation.js"],
    ["/captions-studio.js", "/assets/js/tools/captions-studio.js"],
    ["/highlights-studio.js", "/assets/js/tools/highlights-studio.js"],
    ["/transcription-queue.js", "/assets/js/shared/transcription-queue.js"]
  ]);
  for (const [oldPath, newPath] of paths) {
    // Preserve cache-busting query strings in versioned asset URLs.
    html = html.split('"' + oldPath + '?').join('"' + newPath + '?');
    html = html.split('"' + oldPath + '"').join('"' + newPath + '"');
  }
  if (tool) {
    const [title, description] = toolSEO[tool];
    const url = origin + "/tools/" + tool + "/";
    // Each tool page has a unique, crawlable page title, summary and canonical
    // instead of repeating homepage metadata on eight routed workspaces.
    html = html.replace(/<title>[^<]*<\/title>/, "<title>" + title + " | ClipForge Studio</title>");
    html = html.replace(/<meta name="description" content="[^"]*">/, '<meta name="description" content="' + description + '">');
    html = html.replace(/<link rel="canonical" href="[^"]*">/, '<link rel="canonical" href="' + url + '">');
    html = html.replace(/<meta property="og:title" content="[^"]*">/, '<meta property="og:title" content="' + title + '">');
    html = html.replace(/<meta property="og:description" content="[^"]*">/, '<meta property="og:description" content="' + description + '">');
    html = html.replace(/<meta property="og:url" content="[^"]*">/, '<meta property="og:url" content="' + url + '">');
  }
  return html;
}
// Public crawl and discovery files. No invented AdSense publisher ID or ads.txt.
put("robots.txt", "User-agent: *\nAllow: /\nSitemap: " + origin + "/sitemap.xml\n");
const sitemapPaths = [
  "/", "/guides/", ...guideSlugs.map(slug => "/guides/" + slug + "/"),
  ...tools.map(tool => "/tools/" + tool + "/"),
  "/about.html", "/contact.html", "/privacy.html", "/terms.html",
  "/cookies.html", "/copyright.html"
];
put("sitemap.xml", '<?xml version="1.0" encoding="UTF-8"?>\n' +
  '<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n' +
  sitemapPaths.map(path => "  <url><loc>" + origin + path + "</loc></url>").join("\n") +
  '\n</urlset>\n');
put("index.html", page());
for (const tool of tools) put("tools/" + tool + "/index.html", page(tool));
console.log("ClipForge: generated homepage, eight tool pages, four guides, SEO metadata and crawler files in public/");
