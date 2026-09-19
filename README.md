# nubicode-blog — blog.nubicode.com

Astro static blog. Posts are Markdown in `src/content/blog/`. Built and deployed to S3 + CloudFront by GitHub Actions on merge to `main`.

```bash
npm ci
npm run dev       # http://localhost:4321
npm run build     # dist/
```

## Writing a post

`src/content/blog/<slug>.md` — the filename is the URL (`https://blog.nubicode.com/<slug>`). Frontmatter (validated at build):

```yaml
title: "≤ 70 chars"
description: "≤ 160 chars, this is the meta description"
pubDate: 2026-10-07
tags: [finops, aws]
image: /images/<slug>.png     # 1200×630, put it in public/images/
proof: [PP-01]                # IDs from nubicode-marketing/docs/proof-points.md
tldr: "Two sentences an LLM can quote."
draft: false
```

Every post automatically gets: canonical URL, OpenGraph/Twitter tags, `TechArticle` + `BreadcrumbList` JSON-LD, RSS entry, sitemap entry, `llms.txt` / `llms-full.txt` entries, and the CTA block.

## Syndication

3 days after publishing: repost to dev.to and Medium with `canonical_url` set to the blog URL (manual; see `nubicode-marketing/guidelines/platform-playbook.md`).

## Infra (one-time)

S3 bucket `nubicode-blog` (private, OAC) + CloudFront with ACM cert for `blog.nubicode.com` + Route 53 / registrar CNAME. Secrets: `AWS_ROLE_ARN` (OIDC role with `s3:*` on the bucket and `cloudfront:CreateInvalidation`), `CLOUDFRONT_DISTRIBUTION_ID`.
