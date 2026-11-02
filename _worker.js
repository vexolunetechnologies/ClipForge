export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    const assetResponse = await env.ASSETS.fetch(request);
    const type = assetResponse.headers.get("content-type") || "";
    if (request.method !== "GET" || !type.includes("text/html") || !["/", "/index.html"].includes(url.pathname)) {
      return assetResponse;
    }
    const html = await assetResponse.text();
    const withStyles = html.includes("/clipforge-v2.css")
      ? html
      : html.replace("</head>", '<link rel="stylesheet" href="/clipforge-v2.css">\n</head>');
    const withProStyles = withStyles.includes("/clipforge-editor-pro.css")
      ? withStyles
      : withStyles.replace("</head>", '<link rel="stylesheet" href="/clipforge-editor-pro.css">\n</head>');
    const withApp = withProStyles.includes("/clipforge-v2.js")
      ? withProStyles
      : withProStyles.replace("</body>", '<script src="/clipforge-v2.js"></script>\n</body>');
    const withPatch = withApp.includes("/clipforge-v2-patch.js")
      ? withApp
      : withApp.replace("</body>", '<script src="/clipforge-v2-patch.js"></script>\n</body>');
    const enhanced = withPatch.includes("/clipforge-editor-pro.js")
      ? withPatch
      : withPatch.replace("</body>", '<script src="/clipforge-editor-pro.js"></script>\n</body>');
    const headers = new Headers(assetResponse.headers);
    headers.set("content-type", "text/html; charset=utf-8");
    headers.set("cache-control", "no-cache");
    return new Response(enhanced, {
      status: assetResponse.status,
      statusText: assetResponse.statusText,
      headers
    });
  }
};