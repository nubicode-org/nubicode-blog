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

Terraform in [`infra/`](./infra/README.md): private S3 bucket + CloudFront (OAC, PriceClass_100) + the existing ACM cert + a GitHub OIDC deploy role. `AWS_PROFILE=personal`, `us-east-1`, ≈ $0.10/month. Outputs give the two repo secrets (`AWS_ROLE_ARN`, `CLOUDFRONT_DISTRIBUTION_ID`) and the CNAME target for `blog.nubicode.com`.

## Design

Tokens in `src/layouts/Base.astro` mirror `nubicode-webpage/index.html` (`Inter`, accent `#4768F2`, glass surfaces). Change them there first, then here. OG image defaults to `https://www.nubicode.com/logos/og-image.png`; per-post images go in `public/images/` and are set with `image:` in frontmatter — exported by design, never generated.
