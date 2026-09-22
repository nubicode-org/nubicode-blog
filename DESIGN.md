# NubiCode design standard

Source of truth: `nubicode-webpage/index.html` (www.nubicode.com, Sept 2026). Every NubiCode surface — blog, social cards, carousels, OG images, decks — follows this. When the website changes, update this file in the same PR.

## Look in one sentence

Light, airy "glass" UI on a cool off-white ground, one electric blue accent, Inter set heavy for headlines, generous radius, soft blue-tinted shadows, restrained motion.

## Tokens

| Token | Value | Use |
|---|---|---|
| `--bg` | `#F0F2F7` | page background |
| `--ink` | `#1A1A2E` | headlines, body text |
| `--ink-2` | `#3A3A5E` | subtitles, secondary text, secondary buttons |
| `--ink-3` | `#9CA3AF` | captions, placeholders |
| `--accent` | `#4768F2` | links, primary actions, logo color, highlights |
| `--accent-2` | `#6B8EFF` | gradient partner for accent (`linear-gradient(135deg, #4768F2, #6B8EFF)`) |
| `--accent-3` | `#7B5CF5` | rare violet tint in decorative gradients only |
| `--accent-light` | `rgba(71,104,242,.12)` | tinted fills, focus rings |
| `--accent-glow` | `rgba(71,104,242,.25)` | hover glow |
| `--surface-2` | `#E8ECF8` | subtle panels, table headers |
| `--line` | `#D5D9E8` | hairlines |
| `--danger` | `#E53E3E` | form errors only |
| `--glass-bg` | `rgba(255,255,255,.45)` | card / nav / footer fill |
| `--glass-bg-hover` | `rgba(255,255,255,.6)` | hover fill |
| `--glass-border` | `rgba(255,255,255,.5)` | card border (`1px solid`) |
| `--glass-blur` | `24px` (heavy `40px`) | `backdrop-filter: blur() saturate(180%)` |
| `--glass-shadow` | `0 8px 32px rgba(71,104,242,.08), 0 2px 8px rgba(0,0,0,.04)` | resting |
| `--glass-shadow-hover` | `0 16px 48px rgba(71,104,242,.15), 0 4px 16px rgba(0,0,0,.06)` | hover |
| `--glass-inset` | `inset 0 1px 0 rgba(255,255,255,.7), inset 0 -1px 0 rgba(255,255,255,.1)` | glass edge highlight |
| `--morph-timing` | `cubic-bezier(0.32, 0.72, 0, 1)` | all transitions, 0.3–0.5 s |

No dark theme. The brand is light-only; do not invent a dark palette.

## Typography

- Family: **Inter** (Google Fonts, weights 400 / 600 / 700 / 800 / 900), fallback `-apple-system, BlinkMacSystemFont, sans-serif`.
- Hero title: `clamp(3rem, 8vw, 7rem)`, weight 900, line-height 1.2, color `--ink`.
- Section title: `clamp(2.5rem, 6vw, 5rem)`, weight 900, line-height 1.1.
- Section subtitle / lede: `clamp(1.125rem, 2vw, 1.5rem)`, color `--ink-2`, line-height 1.6, max-width 800px.
- Body: `1rem` / 1.6–1.7. Small: `0.9rem`. Captions: `0.8rem`.
- Blog article H1: `clamp(2rem, 4vw, 3rem)`, weight 800; H2: `1.5rem`, weight 700; body `1.0625rem` / 1.7, measure ≤ 72ch.
- Code: `ui-monospace, SFMono-Regular, Menlo, monospace`, `0.9em`; blocks on `#1A1A2E` with white text.
- Letter-spacing: headlines `-0.02em`; uppercase labels `+0.08em`.

## Shape & surfaces

- Radius scale: pills `50px` (buttons, tags), cards `24px`, panels `20px`, inputs/thumbnails `16px`, small chips `14px`.
- Cards = glass: `--glass-bg` + `1px solid --glass-border` + `--glass-shadow, --glass-inset` + blur. Hover: `translateY(-5px)` (buttons `scale(1.02)`), `--glass-shadow-hover`.
- Glass reflection overlay on buttons/cards: `linear-gradient(135deg, rgba(255,255,255,.4) 0%, transparent 50%, rgba(255,255,255,.1) 100%)` as `::before`.
- Nav: fixed, transparent at top; on scroll becomes glass with heavy blur and `border-bottom: 1px solid --glass-border`.
- Footer: `rgba(240,242,247,.8)` + blur, `border-top: 1px solid --glass-border`, 4rem top padding.
- Spacing: sections `padding: 6rem 2rem` desktop / `4rem 1.25rem` mobile; content max-widths 1400–1600px (marketing), 800px (reading).

## Buttons

- Primary: glass (`--glass-bg-hover`), text `--accent`, pill radius, weight 600, padding `1rem 2rem`; hover lifts + `rgba(71,104,242,.15)` fill.
- Secondary: glass (`--glass-bg`), text `--ink-2`; hover text `--accent`.
- Solid accent button only for the single conversion CTA per page (`background: --accent; color: #fff`).

## Logo

- Nav & footer: `logos/NubiCode responsive-03.png`, height 40px (nav) / 50px (footer). Never recolor; never place on a busy image; clear space = logo height / 2.
- Favicon: `logos/favicon-48.png`; touch icon `logos/apple-touch-icon.png`.

## Motion

- Entrances: `fadeInUp` / `slideInUp` 1 s ease-out, staggered 0.2 s. Hover: 0.3 s `--morph-timing`. Respect `prefers-reduced-motion`.

## Imagery & social assets

- Photography: real team, real office (NubiWork, Surf City), real screens with no client data. No stock, no AI-generated images.
- Cards / carousels / OG images: light glass panel on `--bg`, headline in Inter 800–900 `--ink`, one accent line or number in `--accent`, logo bottom-left, ≥ 64px margins. Sizes: OG 1200×630, LinkedIn 1200×627, IG 1080×1350, banner 1584×396.
- Code in visuals: monospace on `--ink` block, radius 16px.

## Voice on the page

Same as `nubicode-marketing/guidelines/brand-voice.md`: result first, numbers, artifacts, no filler words.
