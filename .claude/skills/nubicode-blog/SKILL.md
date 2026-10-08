---
name: nubicode-blog
description: Everything for blog.nubicode.com (this repo) — writing a new post, diagrams and LinkedIn cover images, the index grid/tag filter, SEO and link previews, the RSS feed LinkedIn reads, building, and shipping through PR → CI deploy (or a manual S3 deploy). Use for any change to the NubiCode blog, including "write/publish a post", "deploy", "fix the preview/RSS", or "update the images".
---

# NubiCode blog

Astro 7 static site → S3 + CloudFront at **https://blog.nubicode.com**. Repo `nubicode-org/nubicode-blog`, default branch `main`. CI (`.github/workflows/deploy.yml`) builds every PR and **deploys on every push to `main`**.

Pick the reference for the task and read it before acting:

| Task | Read |
|---|---|
| Write or edit a post (voice, proof points, frontmatter, FAQ, cadence) | `references/writing-posts.md` |
| Diagram, cover, thumbnail or site share image | `references/images.md` |
| Build, preview, PR, merge, deploy, verify | `references/ship-and-deploy.md` |
| SEO, link previews, RSS/LinkedIn, llms.txt, sitemap | `references/seo-and-rss.md` |
| Anything visual (CSS, layout, image styling) | also load the `nubicode-design` skill → `DESIGN.md` |

## Standing rules

1. **Branch + PR, never push to `main`.** Branch prefixes: `content/` (posts), `feat/`, `fix/`, `refactor/`, `docs/`. Work in a **git worktree from `origin/main`** (`git worktree add -b <branch> ../nubicode-blog-<x> origin/main`, then symlink `node_modules`). The main checkout often holds the owner's uncommitted work: never commit, discard or "finish" files you didn't create there without asking.
2. **New posts are shown to the owner before shipping.** Draft → render → preview → wait for "ship it". Fixes and changes the owner explicitly asked for can go straight through PR → merge → deploy.
3. **Every number traces to `../nubicode-marketing/docs/proof-points.md`** (a PP-xx row). No invented metrics, client names or history. If a claim needs a new proof point, ask.
4. **Posts are dated on the weekly Wednesday cadence**, never in the future relative to publishing. Check the latest `pubDate` before picking a date.
5. **Images are hand-drawn SVG rendered to PNG** by `scripts/render-images.mjs` in DESIGN.md tokens. Never AI-generated. PNG (not SVG) because LinkedIn, RSS readers and email don't render SVG.
6. **Verify on the live site after every deploy** with `curl` (status codes, the changed markup, RSS item count). "CI is green" is not the finish line.
7. **Commits and PRs** follow the repo's conventional style (`content:`, `feat(scope):`, `fix(scope):`, …) and the session's attribution rules. PR bodies have a Summary and a Test plan with what was actually verified.

## Known decisions pending with the owner

- **Canonical company self-description** differs across `www/llms.txt` ("nearshore software and cloud engineering consultancy"), the blog `llms.txt` ("nearshore cloud-native and AI infrastructure consultancy") and posts ("nearshore cloud-native and AI infrastructure engineering company"). Don't pick one silently; use the post wording in new posts until the owner decides, then align all three.
- Branch protection: `main` doesn't require the `build` check, so a merge can land before CI finishes. Wait for checks explicitly (see ship-and-deploy).
