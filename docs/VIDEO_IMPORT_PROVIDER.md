# ClipForge social video import provider contract

ClipForge keeps imported media local after import. The Pages Worker proxies the provider response so provider credentials are never sent to the browser.

## Cloudflare Pages secrets

Set these under Pages project → Settings → Variables and Secrets → Production (and Preview if testing preview deployments):
- `VIDEO_IMPORT_API_URL` — HTTPS endpoint for an authorized video-import provider.
- `VIDEO_IMPORT_API_KEY` — secret bearer key issued by that provider.

Do not put either value in frontend code, GitHub source, or chat. Redeploy Pages after adding or changing them.

## Provider request

`POST VIDEO_IMPORT_API_URL` with `Authorization: Bearer VIDEO_IMPORT_API_KEY`, `Content-Type: application/json`, and `Accept: application/json`.

```json
{
  "url": "https://www.tiktok.com/@creator/video/123",
  "platform": "tiktok",
  "access_mode": "authorized_or_public"
}
```

The provider must enforce official platform API permissions, user authorization, copyright/access restrictions, and its own terms. The access mode is a request hint, not proof of permission. Do not bypass login, DRM, private-account restrictions, paywalls, or platform protections.

## Required success response

Return JSON containing a final, direct HTTPS video URL (not a page URL and not a redirect), plus a filename:

```json
{
  "video_url": "https://cdn.provider.example/final-video.mp4",
  "content_type": "video/mp4",
  "filename": "creator-video.mp4"
}
```

The media URL must be reachable by the Cloudflare Worker without browser cookies. The Worker streams it to the browser, requires a `video/*` content type, rejects redirects, and enforces a 1 GB declared content-length ceiling. Provider URLs should be short-lived and scoped to one import.

## Platform limitations

Official platform APIs do not provide one universal public-video download endpoint. YouTube Data API primarily exposes metadata and embeds, not arbitrary downloadable video files. TikTok and Meta access to media depends on approved products, scopes, account types, and authorization. A public post URL alone does not guarantee media access.

## Current status

The Worker adapter is committed, but actual imports remain disabled until a compatible provider endpoint and key are configured in Cloudflare. No provider has been selected or credentials supplied by this code change.