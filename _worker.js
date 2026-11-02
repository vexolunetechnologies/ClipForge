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
    const enhanced = withStyles.includes("/clipforge-v2.js")
      ? withStyles
      : withStyles.replace("</body>", '<script src="/clipforge-v2.js"></script>\n</body>');
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