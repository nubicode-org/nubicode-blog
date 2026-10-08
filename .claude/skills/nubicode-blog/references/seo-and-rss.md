# SEO, link previews, RSS for LinkedIn, LLM files

## What the site emits (keep it this way)

**Every page** (`src/layouts/Base.astro`): canonical, `robots` (index + `max-image-preview:large`, `max-snippet:-1`, `max-video-preview:-1`; `noindex` via the `noindex` prop — used by 404), `googlebot`, `author`, `keywords`, `og:*` incl. `og:locale en_US` and `og:image` width/height/alt, `twitter:*` incl. `twitter:url`, theme/tile color, manifest, RSS alternate, Organization JSON-LD.

**Posts** (`src/pages/[slug].astro`):
- `og:image` = the post cover (1200×627) + alt
- `article:published_time/modified_time/author/section/tag`
- `twitter:label1/data1` = Written by, `label2/data2` = Reading time (Slack/X show them)
- JSON-LD: TechArticle (wordCount, timeRequired, ImageObject, isPartOf Blog), BreadcrumbList, **FAQPage** auto-built from a `## FAQ` section (`**Question?**` + answer)

**Index**: Blog JSON-LD with `blogPost[]`; the share image is `images/og-blog.png`. Tag-filter URLs (`/?tag=x`) keep canonical `/`.

**Files**: `public/robots.txt` is **identical to `../nubicode-webpage/robots.txt`** (AI crawlers allowed, both sitemaps) — if one changes, copy it to the other. `sitemap-index.xml` (lastmod from post dates, 404 excluded — `astro.config.mjs`), `llms.txt`, `llms-full.txt` (absolute image URLs), `rss.xml`, `site.webmanifest`.

## RSS / LinkedIn auto-share (`src/pages/rss.xml.js`)

Requirements that are already met — don't regress them:
- `<atom:link rel="self">` (LinkedIn's validator rejects feeds without it)
- `trailingSlash: false` (item links must match the site's `/slug` URLs)
- per item: `<enclosure>` + `<media:content>` with the cover (absolute URL, real byte length), `content:encoded` with the full post and **absolute** `src/href`

If LinkedIn says the feed is invalid: first `curl -sI https://blog.nubicode.com/rss.xml` from outside and check robots.txt — then look for spec-level mistakes (self link, link mismatch, relative URLs) before suspecting a WAF/CDN block.

After publishing or changing a preview: run the URL through **LinkedIn Post Inspector** (linkedin.com/post-inspector) to refresh LinkedIn's cache.

## Self-positioning (LLM-SEO)

Each post states plainly — once, in the intro, same wording across posts — that NubiCode is a nearshore cloud-native and AI infrastructure engineering company and that the work described is NubiCode's. Keep specific, quotable numbers (from proof points), clear headings, a TL;DR, and an FAQ where it fits. Do **not** silently rewrite already-published posts to retrofit this; list candidates for the owner.

## Related repo

`../nubicode-webpage` (www.nubicode.com): static HTML on its own CloudFront (`E1LFKQ8S49TODL`). Its `SEO.md` tracks the DNS split (apex on Wix) — DNS/registrar changes are always the owner's decision.
