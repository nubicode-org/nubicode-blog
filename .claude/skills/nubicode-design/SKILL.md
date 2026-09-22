---
name: nubicode-design
description: Apply the NubiCode design standard (light glass UI, Inter, accent #4768F2) to any NubiCode surface — blog pages, HTML templates, social cards, OG images, decks. Use before styling anything branded NubiCode.
---

Read `DESIGN.md` at the repo root (or `nubicode-blog/DESIGN.md`) and apply it literally:

1. Use only the tokens listed there. Do not introduce new colors, fonts, or a dark theme.
2. Cards, nav, footer are glass (`--glass-bg` + border + blur + `--glass-shadow`); radius from the scale (pills 50px, cards 24px, panels 20px, inputs 16px).
3. Headlines in Inter 800–900 with `-0.02em`; body 1rem/1.6–1.7; reading measure ≤ 72ch.
4. Logo file `logos/NubiCode responsive-03.png`, never recolored.
5. No generated imagery. If an image is required and none exists, leave a documented placeholder and list the asset spec for design.
6. Motion: `--morph-timing`, 0.3–0.5 s, `prefers-reduced-motion` respected.
7. Before finishing, diff your CSS variables against `nubicode-webpage/index.html` `:root` and note any drift in the PR description.
