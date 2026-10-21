# Design system

Calm, dense, legible. Neutrals do the work; one accent marks what matters.

## Principles
1. **Data first.** No decorative charts; a chart only renders when records exist, otherwise an empty state explains what to do.
2. **Honest labels.** Provenance badges (`Sample`, `Device`, `Estimate`, `AI-suggested`…) sit beside the data they describe.
3. **Quiet by default.** Small type, generous line height, hairline borders, no gradients or glass.
4. **Respectful.** Streaks are secondary to consistency rates; no punitive copy; goals can be paused or let go.

## Tokens (`src/app/globals.css`)
| Token | Light | Dark | Use |
|---|---|---|---|
| `background` | warm off-white | charcoal | page |
| `surface` / `card` | white | raised charcoal | cards, inputs |
| `surface-2` | tinted | lighter charcoal | inset panels |
| `foreground` | charcoal | off-white | text |
| `muted-foreground` / `subtle-foreground` | slate | slate | secondary / tertiary text |
| `brand` | slate blue `oklch(.52 .09 250)` | `oklch(.70 .09 250)` | focus, selection, primary series |
| `success` / `warning` / `destructive` | muted sage / amber / brick | lifted | status only |
| `chart-1…5` | blue, teal, amber, plum, slate | lifted | categorical series |
| `radius` | 10px (cards 14px) | | |

Colours are OKLCH so light/dark pairs keep perceived contrast. Body text meets WCAG AA on every surface.

## Type
Geist Sans for UI, Geist Mono for codes. Scale: 11 (meta) · 12 (secondary) · 13 (body in widgets) · 14 (body) · 16 · 20 · 24 (page titles). Numbers use `tabular-nums` (`.tabular`).

## Layout
- Desktop-first 12-column grid (`xl`), 6 columns on tablets (`md`), single column on phones.
- Widgets have sizes S (⅓), M (½), L (⅔), Full; dense auto-flow fills gaps.
- Sidebar 240px, collapses to 60px icons (`[` key, remembered in a cookie). Phones get a slide-over sheet.

## Components (`src/components/ui`)
Button (default, brand, secondary, outline, ghost, destructive, link) · Card · Badge (incl. dashed `sample`) · Input / Textarea / NativeSelect · Label · Switch · Progress · Dialog · AlertDialog (destructive confirmations) · Sheet · DropdownMenu · Tooltip · Skeleton · Kbd · Toaster.
Data components: `ProvenanceBadge`, `EmptyState`, `WidgetCard`.

## Motion
`animate-rise` (260ms) for entering content, `animate-fade-in` for overlays, 500ms ease-out for progress. All motion is disabled under `prefers-reduced-motion`.

## Accessibility
Visible focus ring on every control, skip link, landmark labels, `aria-current` in nav, checkbox/radio roles on custom toggles, text alternatives on every chart, keyboard drag-and-drop for widget reordering (space + arrows).
