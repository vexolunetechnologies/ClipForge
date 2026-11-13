import assert from "node:assert/strict";
import {readFileSync, existsSync} from "node:fs";
import {resolve, join} from "node:path";

const out = resolve("public");
const html = path => readFileSync(join(out,path),"utf8");
const tools = ["shorts","trailer","animator","reverse","montage","highlights","editor","captions"];
const guides = ["long-video-to-shorts","urdu-hindi-captions","export-video-formats",
  "browser-video-privacy","video-montage-workflow","reverse-video-audio",
  "ai-video-highlights","picture-to-video"];
const origin = "https://clipforgestudio.pages.dev";
const one = (source,regex,why) => {
 const values = [...source.matchAll(regex)];
 assert.equal(values.length,1,why);
 return values[0][1];
};
const schema = source => [...source.matchAll(
 /<script type="application\/ld\+json">([\s\S]*?)<\/script>/g
)].map(x=>JSON.parse(x[1]));
const canonical = source => one(source,/<link rel="canonical" href="([^"]+)"\s*\/?>/g,"exactly one canonical URL");
const title = source => one(source,/<title>([^<]+)<\/title>/g,"exactly one page title");
const desc = source => one(source,/<meta name="description" content="([^"]+)">/g,"exactly one meta description");
const homepage = html("index.html");
assert.equal(canonical(homepage),origin+"/");
assert.ok(title(homepage).includes("Video Editor"),"Homepage search title should describe the product");
assert.ok(desc(homepage).length>=80,"Homepage needs useful search summary");
assert.ok(schema(homepage).some(s=>s["@type"]==="WebSite"),"Homepage must have WebSite structured data");
assert.ok(schema(homepage).some(s=>s["@type"]==="WebApplication"),"Homepage needs WebApplication data");

const titles = new Set([title(homepage)]), descriptions = new Set([desc(homepage)]);
for(const slug of tools){
 const source = html("tools/"+slug+"/index.html");
 const url=origin+"/tools/"+slug+"/";
 assert.equal(canonical(source),url,"Tool canonical: "+slug);
 assert.ok(title(source).includes("ClipForge Studio"),"Brand in title: "+slug);
 assert.ok(desc(source).length>=65,"Unique useful description: "+slug);
 assert.ok(!titles.has(title(source)),"Duplicate title: "+slug);
 assert.ok(!descriptions.has(desc(source)),"Duplicate description: "+slug);
 titles.add(title(source));descriptions.add(desc(source));
 assert.ok(source.includes('href="/tools/'+slug+'/"'),"Tool must include a clean internal link: "+slug);
 const pageSchemas=schema(source);
 assert.ok(pageSchemas.some(s=>s["@type"]==="WebApplication"&&s.url===url&&s.offers.price==="0"),
  "WebApplication JSON-LD, free offer: "+slug);
 assert.ok(pageSchemas.some(s=>s["@type"]==="BreadcrumbList"),
  "Tool breadcrumb JSON-LD: "+slug);
 assert.ok(!/<meta[^>]*noindex/i.test(source),"Tool must remain indexable: "+slug);
}

const guideHome=html("guides/index.html");
assert.equal(canonical(guideHome),origin+"/guides/");
for(const slug of guides){
 const path="guides/"+slug+"/index.html",url=origin+"/guides/"+slug+"/";
 assert.ok(existsSync(join(out,path)),"Missing generated creator guide "+path);
 const source=html(path);
 assert.equal(canonical(source),url,"Guide canonical: "+slug);
 assert.ok(title(source).length>35,"Guide descriptive title: "+slug);
 assert.ok(desc(source).length>70,"Guide original summary: "+slug);
 assert.ok(source.includes("<h1>"),"Guide needs main heading: "+slug);
 assert.ok(source.includes('href="/tools/')||source.includes('href="/#tools"'),
  "Guide must link readers to working tools: "+slug);
 assert.ok(guideHome.includes('href="/guides/'+slug+'/"'),
  "Learning Center must link to guide: "+slug);
 if(["video-montage-workflow","reverse-video-audio","ai-video-highlights","picture-to-video"].includes(slug)){
  assert.ok(schema(source).some(s=>s["@type"]==="TechArticle"&&s.mainEntityOfPage===url),
   "Guide TechArticle structured data: "+slug);
 }
 titles.add(title(source));
 assert.ok(!/<meta[^>]*noindex/i.test(source),"Guide must remain indexable: "+slug);
}

const robots=html("robots.txt"),sitemap=html("sitemap.xml");
assert.ok(robots.includes("User-agent: *"),"robots must permit crawlers");
assert.ok(robots.includes("Allow: /"),"robots must allow site");
assert.ok(robots.includes("Sitemap: "+origin+"/sitemap.xml"),"robots must point to the sitemap");
const mapped=[...sitemap.matchAll(/<loc>([^<]+)<\/loc>/g)].map(x=>x[1]);
assert.equal(new Set(mapped).size,mapped.length,"Sitemap must have unique URLs");
assert.ok(mapped.includes(origin+"/"),"Sitemap must include homepage");
assert.ok(mapped.includes(origin+"/guides/"),"Sitemap must include guide index");
for(const slug of tools)assert.ok(mapped.includes(origin+"/tools/"+slug+"/"),"Sitemap missing tool "+slug);
for(const slug of guides)assert.ok(mapped.includes(origin+"/guides/"+slug+"/"),"Sitemap missing guide "+slug);
for(const url of mapped){
 const path=url.slice(origin.length);
 const file=path==="/"? "index.html":path.endsWith("/")?path.slice(1)+"index.html":path.slice(1);
 assert.ok(existsSync(join(out,file)),"Sitemap includes missing published page: "+url);
}
// Static guide page links must have live counterparts in the build output.
for(const slug of guides){
 const source=html("guides/"+slug+"/index.html");
 for(const [,target]of source.matchAll(/href="(\/[^"#?]*\/?)"/g)){
  const path=target==="/"? "index.html":target.endsWith("/")?target.slice(1)+"index.html":target.slice(1);
  assert.ok(existsSync(join(out,path)),"Broken internal link "+target+" in "+slug);
 }
}
console.log("ClipForge SEO: 8 unique tool pages, 8 guides, valid JSON-LD, canonicals, sitemap, robots, and internal links passed.");
