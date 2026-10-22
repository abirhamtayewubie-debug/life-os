# Accessibility (Phase 8)

Target: WCAG 2.1 level AA.

## Automated

`tests/e2e/accessibility.spec.ts` runs axe-core (`wcag2a`, `wcag2aa`, `wcag21a`, `wcag21aa`) on the sign-in and sign-up pages and on all 19 screens with sample data loaded, in light and dark themes. It passes with no violations. It also checks with the keyboard that:

- the first Tab reaches "Skip to content" and it moves to the main region;
- Ctrl/⌘+K opens search with focus in the input, and Escape closes it;
- dialogs keep focus inside and return it to the button that opened them.

Automated tools find only part of the real problems, so the review below matters as much.

## Fixed in this phase

- **Text contrast:** the "subtle" grey used for sidebar headings, timestamps, hints and calendar hours was 3.3–3.6:1. It is now at least 4.5:1 on every surface in both themes. Success and warning text and the destructive colour were darkened in light mode for the same reason, and destructive buttons use dark text in dark mode.
- **Chart tooltips:** series names were drawn in the series colour (as low as 2.7:1); they now use the normal text colour.
- **Spoken names matching visible text:** the search button and the "Sub-goal" buttons now announce the words they show (WCAG 2.5.3).

## Reviewed by hand

- Every form field has a visible label tied to its input. Errors and hints appear under the field and, from this phase, are linked to it with `aria-describedby` so they're read with the field.
- Icon-only buttons have names; decorative icons are hidden from screen readers.
- Status is never shown by colour alone: badges carry words ("Overdue", "Sample", "Waiting for you").
- Motion is limited to short fades and slides, and is reduced when the system asks for reduced motion.
- Pages have one `h1`, landmarks (navigation, main) and a skip link.

## Known gaps

- Not tested with a real screen reader (VoiceOver, NVDA or TalkBack). That's the most useful next check.
- The calendar's week and day grids are mouse-first; events can be created and edited from the form with the keyboard, but there is no keyboard drag to move them.
- Charts are not described to screen readers. Most screens also show their key figures as text, but not every chart has a text equivalent yet.
