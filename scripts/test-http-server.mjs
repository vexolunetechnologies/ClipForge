import { createServer } from "node:http";
import { statSync, readFileSync } from "node:fs";
import { resolve, extname, sep } from "node:path";

export async function serveLocalSite() {
  const root = resolve(".");
  const types = {".html":"text/html; charset=utf-8",".js":"text/javascript; charset=utf-8",".css":"text/css; charset=utf-8",".json":"application/json"};
  const server = createServer((request, response) => {
    const url = new URL(request.url, "http://localhost");
    const path = url.pathname.endsWith("/") ? url.pathname + "index.html" : url.pathname;
    let local;
    try { local = resolve(root, "." + decodeURIComponent(path)); }
    catch { response.writeHead(400); response.end(); return; }
    if (!local.startsWith(root + sep)) { response.writeHead(403); response.end(); return; }
    try {
      if (!statSync(local).isFile()) throw Error("not a file");
      response.setHeader("Content-Type", types[extname(local)] || "application/octet-stream");
      response.end(readFileSync(local));
    } catch {
      response.writeHead(404, {"Content-Type":"text/plain"}); response.end("Not found");
    }
  });
  await new Promise(resolve => server.listen(0, "127.0.0.1", resolve));
  return {
    origin:"http://127.0.0.1:" + server.address().port,
    close: () => new Promise(resolve => server.close(resolve))
  };
}
