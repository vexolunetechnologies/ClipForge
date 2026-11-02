export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    const assetResponse = await env.ASSETS.fetch(request);
    const type = assetResponse.headers.get("content-type") || "";
    if (request.method !== "GET" || !type.includes("text/html") || !["/", "/index.html"].includes(url.pathname)) return assetResponse;
    const html = await assetResponse.text();
    const styles = [
      ["/clipforge-v2.css", '<link rel="stylesheet" href="/clipforge-v2.css">'],
      ["/clipforge-editor-pro.css", '<link rel="stylesheet" href="/clipforge-editor-pro.css">'],
      ["/clipforge-studio.css", '<link rel="stylesheet" href="/clipforge-studio.css">'],
      ["/clipforge-theme-system.css", '<link rel="stylesheet" href="/clipforge-theme-system.css">']
    ];
    let enhanced = html;
    for (const [path, tag] of styles) if (!enhanced.includes(path)) enhanced = enhanced.replace("</head>", tag + "\n</head>");
    const scripts = [
      ["/clipforge-v2.js", '<script src="/clipforge-v2.js"></script>'],
      ["/clipforge-v2-patch.js", '<script src="/clipforge-v2-patch.js"></script>'],
      ["/clipforge-editor-pro.js", '<script src="/clipforge-editor-pro.js"></script>'],
      ["/clipforge-studio.js", '<script src="/clipforge-studio.js"></script>'],
      ["/clipforge-theme.js", '<script src="/clipforge-theme.js"></script>']
    ];
    for (const [path, tag] of scripts) if (!enhanced.includes(path)) enhanced = enhanced.replace("</body>", tag + "\n</body>");
    const headers = new Headers(assetResponse.headers);
    headers.set("content-type", "text/html; charset=utf-8");
    headers.set("cache-control", "no-cache");
    return new Response(enhanced, { status: assetResponse.status, statusText: assetResponse.statusText, headers });
  }
};