---
name: html-prototype
description: |
  Read an HTML file's own design system before changing it, then change it in that vocabulary.
  Use whenever you edit an .html or .htm file, above all one a Trove batch asks you to change: a
  comment on an HTML file, an element comment (its anchor has `targets`) or a loop (`shape`).
  Most of these files are app prototypes (an app shell, buttons, cards, forms, nav, state in a
  script); the change has to look and behave as if the file's author made it. Also tells you how
  to find each element target in source. Trigger on: editing HTML from a Trove batch, "change the
  prototype", "fix this mock", "apply my HTML comments", any element or loop comment.
---

# HTML prototype

The user reviews HTML files rendered in Trove and points at what should change: a selected
passage, one element or several (shift-click), or a loop drawn around part of the page. You
change the file. The result has to read as the same design, not as a patch on top of it.

## Before the first change to a file

Read the whole file once and note how it is built. Skim it again only when a later comment
touches a part you have not read.

- **Shell and layout.** The page's skeleton (header, sidebar, main, panels, dialogs) and the
  layout system: grid or flex, the container widths, the breakpoints and how it responds.
- **Tokens.** CSS custom properties on `:root` (and a dark-mode block, if any): colours, spacing,
  radii, shadows, fonts, durations. These are the only values a change may use.
- **Type scale.** The font families, sizes, weights and line heights in use, and which classes or
  elements carry them (`h1`-`h3`, `.title`, `.caption`).
- **Spacing and colour.** The steps actually used (4/8/12/16, or `--space-*`), and which colours
  mean what (primary, muted text, borders, states such as success, warning, danger).
- **Components.** The class names and repeated markup for buttons (and their variants), cards,
  lists and rows, tables, forms and fields, tabs, nav, badges, menus, dialogs, empty states.
  Note the exact markup of one good instance of each.
- **Icons and images.** Inline SVG, a sprite with `<use>`, an icon font, emoji, image files, and
  their size and stroke conventions.
- **Scripts and state.** What the script does: data arrays, a render function, event handlers,
  a state object, a router of `data-view` sections. A change to what shows usually belongs in the
  data or the render function, not in hand-written markup next to it.
- **Framework.** A CDN library (Tailwind, Alpine, htmx, a CSS framework) is part of the
  vocabulary; use it the way the file does.

## Making a change

- Reuse before inventing: an existing class, variable or pattern first; then copy the closest
  existing component and adapt it; a new class only when nothing fits, written in the file's
  naming style and built from its tokens.
- No new frameworks, libraries, fonts or icon sets. No inline `style=""` where the file styles
  with classes, and no raw hex or px where it has a variable for that value.
- Keep the file's structure: put new CSS beside the rules it relates to, new markup where its
  siblings are, new script logic in the existing functions or state.
- Match the states the file already handles (hover, focus, disabled, empty, loading, dark mode)
  for anything you add.
- Change only what the comment asks for. If doing it well needs a wider change (a new
  component, a token, a layout shift), make the narrow change and say what the wider one would be.
- A file that is not a prototype (a report, an article, generated output) still gets the same
  care: its own styles and markup, nothing foreign.

## Finding an element target

An element comment's anchor has `targets`: one entry per element, in the order the user picked
them, each `{selector, tag, id?, classes?, testIds?, text?, html}`. They were read from the
rendered page, so any of them can be stale or produced by a script. Use them in this order of
trust and stop at the first that pins one place in the source:

1. `selector`: a CSS path that matched the element in the rendered page (`#id > div >
   button:nth-of-type(2)`). Walk it through the markup. Elements a script builds are not in the
   markup as written: find the template or render code that produces them.
2. `id`: grep `id="<id>"` (or where a script sets it).
3. `testIds`: `data-testid` and `data-component` values on the element and its ancestors,
   nearest first; the nearest that the file defines narrows it to one component.
4. `classes`: the element's classes. Several elements share most classes; combine them with the
   ancestors from the selector.
5. `html`: the first 400 characters of the element's outerHTML, whitespace collapsed. Grep for a
   distinctive attribute or text fragment from it, not the whole string.
6. `text`: the element's rendered text (up to 160 characters). Last, because text is often
   produced by a script or repeated.

One of several identical rows, a canvas, or an element that only exists after interaction may
not be pinned by its target alone: read the note, and ask in chat rather than guess.

## Several targets, and loops

- **Several targets** are one request about all of them together (make these match, align
  these, swap these), not the same request repeated per element.
- **A loop** (`shape: {kind: 'loop', points}`) is a freehand outline the user drew around part of
  the page, in the page's document coordinates. Its `targets` are the fewest elements it
  encloses. Read it as one request about that region: the note may concern the targets'
  layout, spacing or relationship to each other, or something missing in the area. The points
  only say where on the page it was; do not use them for anything else.
- `quote` names the targets (their text, or `<tag.class>`), `raw` is the first target's `html`,
  and `path` is the heading path above the first target.
