# ClipForge Studio — SEO audit & release checklist
**Audit date:** 2026-11-13  
**Website:** https://clipforgestudio.pages.dev/  
**Repository:** vexolunetechnologies/ClipForge  
**Scope:** Search discoverability only. No AI, video engine, navigation behavior, uploads, export, cards, captions, or worker endpoint modifications.

## What was inspected (read-only baseline)
- Source homepage has a title, description, canonical, Open Graph, clear tool links, and one primary hero heading.
- Build generator exposes 8 clean /tools/<slug>/ paths, 4 existing editorial help articles, /robots.txt and /sitemap.xml.
- Each tool page is generated from the same shared video editor HTML. Unique metadata helps, but **shared body content remains a duplicate-content risk**. Do not alter workspace behavior just to force unique SEO copy.
- The four original creator guides provide independent, HTML-readable content.
- The repository does **not** check in generated `public/` output; `scripts/build-pages.mjs` generates it during deployment. A source-path 404 in the repo does not prove that the deployed sitemap is missing.
- The independent web crawler could not access production pages during this audit. **Live HTTP, index coverage, canonical selection, Core Web Vitals and ranking positions remain unverified.**

## Changes on the SEO branch
1. **Technical SEO:** continue generating an allow-all robots file and canonical sitemap, now including eight articles in Learning Center and the original eight tool routes.
2. **On-page SEO:** unique, accurate titles/descriptions for homepage and 8 tools, consistent Open Graph and Twitter summaries, and metadata-aligned browser tab titles; URL paths are unchanged.
3. **Structured data:** WebSite on homepage, WebApplication for homepage and tools, and BreadcrumbList for tool routes; no fake ratings or guaranteed rich results.
4. **People-first content:** four original instructional guides (reverse video, video montage, AI highlights, picture-to-video) that link directly to the relevant tool and other helpful guides. They complement the existing Shorts, captions, export formats and browser privacy guides.
5. **SEO tests:** automated verification checks unique metadata, canonicals, JSON-LD syntax, generated routes, sitemap uniqueness, guide navigation and basic internal links. Existing media regression suites still apply.
6. **Keyword plan:** see `docs/seo-keyword-map.csv`. These are **search-intent hypotheses**; there is no verified search volume or keyword difficulty data.

## Search Console: steps requiring site owner access after deployment
- Open https://search.google.com/search-console and select or verify the URL-prefix property `https://clipforgestudio.pages.dev/`.
- Submit **`sitemap.xml`** via *Indexing → Sitemaps*. Google will not index every submitted URL automatically.
- Use *URL Inspection* to test the live homepage, `/tools/shorts/`, `/tools/captions/`, `/tools/montage/`, `/guides/`, and one new guide.
- For each, check **Page fetch**, **Indexing allowed**, **User-declared canonical**, **Google-selected canonical** and **Crawled as**. If canonical selection differs, collect the exact report before making redirects or changing workspace URLs.
- Use *Request Indexing* selectively, not repeatedly. Google applies quotas; sitemap submission is better for many pages.
- Monitor *Pages* (indexed/not indexed) and *Performance → Search results* for queries, impressions, clicks and CTR; compare a 28-day baseline after Google crawls the site.
- Do **not** mark any indexing task complete until Search Console confirms it.

## Mobile performance / Core Web Vitals (not yet measured)
- Test the deployed homepage, /tools/shorts/, /tools/captions/ and /guides/ on mobile and desktop using https://pagespeed.web.dev/.
- Target Google's Good thresholds: LCP ≤ 2.5 seconds, INP ≤ 200 ms, CLS ≤ 0.1.
- Observe whether font loading causes layout shifts and whether large shared JavaScript delays interaction. Some engine scripts are large, but **do not change initialization or split bundles** without a separate behavior-preserving performance review and its own regression tests.
- Recheck after deployment; Lighthouse lab scores and Search Console field data are different measurements.
- No live performance score is claimed by this PR.

## Off-page discovery (requires owner activity)
- Link to the relevant tutorial from genuine posts on your YouTube/Facebook creator channels and the Vexolune Technologies website, with descriptive anchor text, when relevant to the audience. Do not buy backlinks or create artificial link networks.
- Answer real creator questions with useful advice first; share a ClipForge guide only when it genuinely helps.
- Review queries in Search Console before writing the next tutorial. Update inaccurate or stale tutorials rather than mass-producing thin pages.

## Scope guardrails
- **Must not change:** `app.js`, `navigation.js`, `highlights-studio.js`, `captions-studio.js`, `dist/editor/`, `_worker.js`, `styles.css`, API routes, video processing and export.
- **Allowed:** build-time SEO metadata generation, source HTML head metadata, non-behavior browser title strings, static guides, internal editorial links, sitemap, test scripts and docs.
- Run `npm run verify`, `npm run test:browser`, existing media regression checks; compare PR diff against this guardrail.
- Keep this branch separate and **do not merge without explicit user approval**.

## Deferred technical risk
All 8 tool pages still share much of the interactive editor's source markup and JavaScript. Google may decide some pages are near-duplicates despite distinct titles. We intentionally avoid intrusive UI changes, crawler-only text, hidden keyword stuffing or redirect tricks. Future distinct tool introductions must be **visible and useful to real users** and separately approved so current tool layout stays professional.
