# Design system: Clay Zen

Calm, warm, made for one person. Paper and ink carry the interface; clay marks what is active, sage marks growth and done, gold is the warm third. Night mode ("candlelight") keeps every layout and switches to deep, muted tones.

## Principles
1. **Fewer, bigger things.** Tinted tiles with one big number each; everything else is one tap away.
2. **Thumb first.** On phones a bottom nav and 44px+ targets. The + opens a quick-add sheet.
3. **Numbers you feel.** Large figures in Fraunces, thin bars and dots instead of small tables.
4. **Honest labels.** Provenance badges (`Sample`, `Device`, `Estimate`, `AI-suggested`…) sit beside the data they describe.
5. **Respectful.** Streaks are secondary to consistency rates; no punitive copy; goals can be paused or let go.
6. **No emoji, no gloss.** Thin line icons (lucide, stroke ~1.6) and a soft flat "clay" shadow.

## Tokens (`src/app/globals.css`)
Raw palette (decoration, tiles, illustration):

| Token | Light (paper) | Dark (candlelight) |
|---|---|---|
| `paper` / `background` | `#f3efe6` | `#1c1b18` |
| `surface` / `card` | `#fbf8f1` | `#24231f` |
| `ink` / `foreground` / `primary` | `#2b2a26` | `#ece6d8` |
| `border` (lines) | `#e1d9c7` | `#2f2d28` |
| `clay` · `sage` · `gold` · `stone` | `#c2734f` · `#7d8f6e` · `#d6a15f` · `#b8ab8f` | same |
| `tint-clay` · `tint-sage` · `tint-sand` · `tint-mist` | `#f2e0d4` · `#e2e7da` · `#ede4d0` · `#e6e2da` | `#352820` · `#283026` · `#302b22` · `#2a2925` |
| `hero-*` | sky `#efe6d6 → #ead7c6`, hills `#a9b59c` / `#7d8f6e`, clay sun | dusk sky, deep hills, gold sun |

Semantic text tokens are nudged darker than the raw greys so small text meets WCAG AA: `muted-foreground` `#6b6658` / `#a39d8c`, `subtle-foreground` (faint) `#736e60` / `#948d7e`, `brand` (clay text, links, active) `#a3542f` / `#d38360`. `inverse` is the ink card (balance, assistant), which turns cream in night mode. `chart-1…5`: clay, sage, gold, stone, muted.

Shape: tiles 22–24px (`rounded-3xl` = 24px), hero and big cards 28px, icon buttons 16px squircles, chips fully rounded. Depth: `shadow-clay` = `0 3px 0 rgb(80 60 30 / .08)` (dark `rgb(0 0 0 / .35)`), used by `shadow-card`.

## Type
Fraunces (`font-display`, weight 300–400) for headings, big numbers and list item titles, with an italic accent word (`.accent-italic` clay, `.accent-italic-sage`). Inter 400–600 for UI. Section labels use `.label-caps` (11px, uppercase, 0.2em tracking, faint). Geist Mono for codes. Numbers use `tabular-nums` (`.tabular`).

## Layout
- **Phones (< 768px):** bottom nav fixed to the bottom (Today · Plan · + · Habits · Areas), page-colored with a 1px top line; active item is ink with a 4px clay dot. The + opens the quick-add sheet. Areas (`/areas`) replaces the old side drawer and lists every module as tiles with live status from `src/server/areas.ts` (one line on phones; 6 per row and up to three lines on desktop). The top bar is search on the left, bell and avatar (account menu with Light / Night / Match device) on the right.
- **Tablets (768–1023px):** the sidebar is a 72px icon rail with tooltips.
- **Desktop (≥ 1024px):** 260px sidebar on the page background with a right hairline: logo, ink **+ New** (same quick add, as a centered modal), "Ask your assistant…" field, grouped Fraunces rows (active = card + clay shadow + clay dot), footer with avatar, moon/sun toggle and a ⋯ menu (settings, collapse to rail with `[`, sign out). Content max 1200px with 40px padding; the top bar shows `GROUP · PAGE` plus search and bell.

## Components (`src/components/ui`)
Button (default ink, brand, secondary iris-tint, outline, ghost, destructive, link) · Card · Badge (incl. dashed `sample`) · Input / Textarea / NativeSelect · Label · Switch · Progress · Dialog · AlertDialog (destructive confirmations) · Sheet · DropdownMenu · Tooltip · Skeleton · Kbd · Toaster.
Data components: `ProvenanceBadge`, `EmptyState`, `WidgetCard`.

## Motion
`animate-rise` (360ms) for entering content, `animate-fade-in` for overlays, `slide-in-left` / `slide-in-up` for sheets, `animate-pop` when something is checked off, 500–700ms ease-out for progress. All motion is disabled under `prefers-reduced-motion`.

## Accessibility
Visible focus ring on every control, skip link, landmark labels, `aria-current` in nav, checkbox/radio roles on custom toggles, text alternatives on every chart, keyboard drag-and-drop for widget reordering (space + arrows).
