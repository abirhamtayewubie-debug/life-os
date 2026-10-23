# Design system

Calm, confident, made for one person. Porcelain and ink carry the interface; one accent (iris) marks progress and what you can tap.

## Principles
1. **Fewer, bigger things.** Today leads with the top three, a progress ring and what's next; everything else is one tap away.
2. **Thumb first.** On phones a floating tab bar (Today, Plan, +, Habits, More) and 44px+ targets. The + opens a quick-add sheet.
3. **Numbers you feel.** Large tabular figures in the display face, rings and bars instead of small tables.
4. **Honest labels.** Provenance badges (`Sample`, `Device`, `Estimate`, `AI-suggested`…) sit beside the data they describe.
5. **Respectful.** Streaks are secondary to consistency rates; no punitive copy; goals can be paused or let go.

## Tokens (`src/app/globals.css`)
| Token | Light | Dark | Use |
|---|---|---|---|
| `background` | porcelain `#f6f6f4` | night `#0b0c0f` | page, sidebar |
| `surface` / `card` | white | `#15171c` | cards, inputs |
| `surface-2` | `#f4f4f1` | `#1c1f26` | stat tiles, inset panels |
| `foreground` / `primary` | ink `#111318` | `#f2f3f5` | text, primary buttons |
| `muted-foreground` / `subtle-foreground` | slate | slate | secondary / tertiary text |
| `brand` | iris `#4f46e5` | `#8b8cff` | focus, progress, done states, active nav |
| `accent` | iris tint | deep iris | soft buttons, icon tiles, "worth a look" |
| `inverse` | ink | indigo night | the one dark "Next up" card, sign-in panel |
| `success` / `warning` / `destructive` | green / amber / brick | lifted | status only |
| `chart-1…5` | iris, teal, amber, plum, slate | lifted | categorical series |
| radius | cards 22px (`rounded-3xl`), controls 12px | | |
| `shadow-card` / `shadow-raised` | hairline ring + soft drop | ring | cards / overlays |

Every text pairing meets WCAG AA in both themes (checked with axe on every screen).

## Type
Inter for UI and Inter Tight (`font-display`) for headings and big numbers, both via `next/font`. Geist Mono for codes. Page titles 32–44px with tight tracking; card titles 15px semibold; body 14–15px; meta 12–13px. Numbers use `tabular-nums` (`.tabular`).

## Layout
- Desktop-first 12-column grid (`xl`), 6 columns on tablets (`md`), single column on phones.
- Today: hero (top three + ring + stats, `Next up` card, one suggestion), then customizable widgets S (⅓), M (½), L (⅔), Full. Briefing and Priorities widgets start hidden because the hero covers them.
- Sidebar 256px with a white active pill, collapses to icons (`[` key, remembered in a cookie). Phones get the floating tab bar; More opens every module in a sheet.

## Components (`src/components/ui`)
Button (default ink, brand, secondary iris-tint, outline, ghost, destructive, link) · Card · Badge (incl. dashed `sample`) · Input / Textarea / NativeSelect · Label · Switch · Progress · Dialog · AlertDialog (destructive confirmations) · Sheet · DropdownMenu · Tooltip · Skeleton · Kbd · Toaster.
Data components: `ProvenanceBadge`, `EmptyState`, `WidgetCard`.

## Motion
`animate-rise` (360ms) for entering content, `animate-fade-in` for overlays, `slide-in-left` / `slide-in-up` for sheets, `animate-pop` when something is checked off, 500–700ms ease-out for progress. All motion is disabled under `prefers-reduced-motion`.

## Accessibility
Visible focus ring on every control, skip link, landmark labels, `aria-current` in nav, checkbox/radio roles on custom toggles, text alternatives on every chart, keyboard drag-and-drop for widget reordering (space + arrows).
