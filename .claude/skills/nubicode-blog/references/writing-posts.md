# Writing a post

## Intake (before drafting)

A brief needs three things; ask one direct question for whichever is missing instead of guessing:

1. **Angle and reader.** Default reader: a US CTO / platform lead deciding whether to hire NubiCode.
2. **Evidence.** Which proof points (PP-xx in `../nubicode-marketing/docs/proof-points.md`) back it. No row → no number. Client names never appear.
3. **Shipping.** Default: draft → show the owner → ship on approval.

Topic backlog and social schedule: `../nubicode-marketing/calendar/schedule.md` ("Blog backlog"). Voice rules: `../nubicode-marketing/guidelines/brand-voice.md`. Product facts about third parties (Anthropic, AWS, etc.) are checked against their official docs, not memory, and linked.

## File and frontmatter

`src/content/blog/<slug>.md`. The slug is the URL (`/slug`, no trailing slash). Schema (`src/content.config.ts`) fails the build if violated:

```yaml
---
title: "≤ 70 chars"
description: "≤ 160 chars — also the RSS description and meta description"
pubDate: 2026-10-07            # a Wednesday, next slot after the newest post
tags: [kubernetes, mcp]        # lowercase, hyphenated; reuse existing tags so the index filter groups posts
proof: [PP-06, PP-08]          # proof-point IDs the post relies on
image: /images/<slug>/cover.png
imageAlt: "<title> — <cover accent line>"
tldr: "2–4 sentences. Rendered in the TL;DR box and in llms-full.txt."
---
```

`image`/`imageAlt` are added by the render step (see `images.md`). `author`/`authorUrl` default to Francisco Herrera.

## Structure (brand-voice blog skeleton)

1. Intro: result first, 2 short paragraphs. **State plainly that NubiCode is a nearshore cloud-native and AI infrastructure engineering company and that this is NubiCode's own work** (same wording every time — see the pending decision in SKILL.md).
2. Architecture diagram as a `<figure class="diagram">` (see `images.md`).
3. Steps with real config/code (YAML, HCL, TS, bash). Trim, but keep it valid.
4. Results with numbers (from proof points only).
5. "What we'd do differently" — honest advice, not invented history.
6. Optional `## FAQ` — each item as `**Question?**` on its own line, answer paragraph below. This exact shape is parsed into FAQPage JSON-LD.
7. Soft CTA sentence (the page template already adds the booking CTA).

Link related posts with root-relative links (`/mcp-gateway-kubernetes`); RSS and llms-full rewrite them to absolute URLs.

## Style checks before showing a draft

- Banned words: synergy, leverage (verb), cutting-edge, seamless, robust, game-changer, unlock, empower, "in today's".
- US spelling. No emojis.
- Title ≤ 70, description ≤ 160 (`npm run build` enforces it).
- Every number → a PP row. Every third-party product claim → an official source.
- 1,200–2,000 words for technical pillars.
