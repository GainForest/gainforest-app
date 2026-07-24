# Product Interface Design Contract

This document defines a reusable interface contract. It is deliberately based on **context and semantic role**, not on individual routes or screenshots. A new interface must first classify its context, then use the matching rules. It must not invent another spacing, layout, surface, or typography system because a one-off composition feels convenient.

The goal is a calm, editorial product UI: the primary experience is expressive; supporting interface recedes; structure is clear without card soup.

---

## 1. Decision order

Make visual decisions in this order:

1. **What is the user doing?** Reading, exploring, editing, comparing, or completing a focused task?
2. **Which layout family fits that task?** Standard, wide, reading, full-bleed, overlay, or shell.
3. **Does the content need a boundary?** Try spacing first, then a separator, then a surface, and only then a border.
4. **What is the density context?** Shell, dense data, standard workspace, editorial, or overlay.
5. **Which existing primitive expresses it?** Reuse the primitive. Do not recreate its classes locally.
6. **Is the proposed exception functional?** If not, it is not an exception.

When uncertain, choose fewer layers, less outer padding on small screens, and the simpler hierarchy. Do not interpret “compact” or “touch safe” one control at a time: first compare every peer rendered beside it.

---

## 2. Spacing lattice

All spacing must come from this lattice:

| Token | Size | Typical use |
|---|---:|---|
| `space-1` | 4px | Icon optical adjustment; never page structure |
| `space-2` | 8px | Icon-to-label, tightly related inline items |
| `space-3` | 12px | Compact controls, dense rows, phone page gutter |
| `space-4` | 16px | Standard row/card padding, small stacks |
| `space-5` | 20px | Tablet gutter, comfortable section padding |
| `space-6` | 24px | Desktop gutter, standard block rhythm |
| `space-8` | 32px | Section-to-section rhythm |
| `space-10` | 40px | Large editorial break |
| `space-12` | 48px | Major page-region break |
| `space-16` | 64px | Rare hero/editorial separation |

### Rules

- Do not introduce arbitrary spacing values when a lattice value is within 4px.
- Do not use a larger gap to repair a weak hierarchy; repair the hierarchy.
- Sibling gaps must be owned by their parent (`gap`, `space-y`, grid gap). Children must not each invent margins.
- Adjacent regions must have one spacing owner. Never combine parent `gap` with matching child `mt-*`/`mb-*`.
- Negative margins are reserved for intentional media bleed, sticky chrome, or alignment with a known parent gutter.
- A nested layer must not repeat the same padding as its parent by default.

---

## 3. Density contexts

Classify every interface region into one density context.

### A. Shell and secondary navigation

The shell should be quieter and denser than the workspace.

- Internal gap: 4–8px
- Group gap: 12–16px
- Horizontal padding: 8–12px
- Persistent sidebar navigation row: 32px; keep icon, label, and active treatment optically compact
- Header control set: 36px outer height for text pills and icon buttons alike
- Mobile-only navigation may use 40–44px when it does not make the entire shell feel oversized
- Group labels: body sans, sentence case, muted, compact
- Never use display type, italic type, tracked all-caps, eyebrow styling, or decorative dividers for shell group labels
- A small number of primary creation actions may be more playful than ordinary navigation. Keep them together as one expressive shell region, preserve their motion and illustration as purposeful affordance, and disable looping or transforming motion under reduced motion.

### B. Dense data and management rows

For tables, compact lists, mappings, and repetitive data:

- Cell/row gap: 8–12px
- Row padding: 10–12px mobile, 12–16px wider screens
- Use one shared outer group plus row separators
- Do not wrap each row in its own padded card
- Keep controls and selected/error states visibly bounded

### C. Standard workspace

For most product pages, forms, dashboards, and detail views:

- Component gap: 12–16px
- Section internal padding: 16px mobile, 20px tablet/desktop
- Section-to-section gap: 24px mobile, 32px wider screens
- Major region gap: 32px mobile, 40–48px wider screens

### D. Editorial and reading

For stories, legal copy, documentation, and narrative detail:

- Paragraph rhythm: 16–24px
- Subsection rhythm: 32px
- Major section rhythm: 48–64px
- Prefer open page space over repeated containers
- Use a contained surface only when it establishes a meaningful reading boundary

### E. Overlays, drawers, and focused tasks

- Overlay gutter: 12px on phones, 16px otherwise
- Dialog padding: 16px mobile, 24px wider screens
- Drawer padding: 16px mobile, 20–24px desktop
- Sticky headers/footers may use separators to remain legible while scrolling
- Do not nest a second roomy surface inside an already padded dialog unless it represents a distinct state or workflow stage

---

## 4. Page gutters and width families

### Responsive outer gutter

The default page gutter is:

- **Phone:** 12px
- **Tablet:** 20px
- **Desktop:** 32px

Do not use 24–32px outer padding on a phone. A page may use less than 12px only for deliberate full-bleed media or maps. A page may use more only inside a focused reading column after the outer frame has already preserved screen area.

### Width families

Every page must use one of these families:

| Family | Maximum width | Use |
|---|---:|---|
| `reading` | 48rem | Legal prose, guides, long-form explanations |
| `standard` | 72rem | Forms, settings, dashboards, ordinary detail pages |
| `wide` | 90rem | Explorers, visual catalogs, data-rich management workspaces |
| `full` | none | Maps, media workspaces, canvases; controls still align to a gutter |
| `overlay` | task-specific | Dialogs and drawers; never reused as page width |
| `shell` | fixed/compact | Navigation and auxiliary chrome only |

### Rules

- Similar pages in the same family must share the same width, outer gutter, top rhythm, and heading alignment.
- A route must not pick a new max width because its content happens to be short.
- Do not reduce a desktop frame below the 32px gutter merely because its max-width has expanded; wide catalogs still need breathing room at the viewport edge.
- When one narrower section is the only occupant of a wider horizontal region, center it with auto margins. Left-anchor a narrow column only when a real sibling column or shared alignment axis justifies the asymmetry.
- Full-bleed regions may escape the content column, but their controls must align with the page gutter or a deliberate internal grid.
- Do not stack multiple generic `max-width + margin-auto + padding` wrappers. Exactly one element owns page width and outer gutter.

---

## 5. Vertical page anatomy

A standard page uses this anatomy:

1. Page frame
2. Optional hero or page header
3. Primary controls, if needed
4. Main content regions
5. Supporting/footer content

Default rhythm:

- Frame top/bottom padding: 16px mobile, 24px desktop
- Header title to description: 8px
- Header copy to actions: 16px
- Header to first content region: 24px mobile, 32px desktop
- Peer content regions: 24px mobile, 32px desktop
- Major narrative transitions: 40–48px

A route may omit the header entirely when the visible choices are self-explanatory. Do not preserve a heading and description merely to justify a section container.

---

## 6. Container budget

Every padded/background layer consumes visual and spatial budget.

### Default budget

- Page frame: one gutter layer
- Meaningful grouped region: at most one padded surface layer
- Nested content: usually open, divider-led, or a compact contrasting inset
- Third padded layer: prohibited unless it is a functional boundary such as an input, media frame, map, selected state, drop zone, warning, code block, table, or nested modal

### Container test

Before adding a surface, answer all four:

1. Does this content have a distinct semantic or workflow meaning?
2. Would whitespace or a separator fail to communicate that meaning?
3. Does the surface remain useful when its heading is removed?
4. Is its padding affordable on a 320px screen after parent gutters?

If any answer is “no,” keep the content open.

### Signs of overcontainerization

- A muted section contains a grid of fully padded muted cards.
- A card exists only to contain a heading and description before the real controls.
- Every list row repeats radius, background, border, and padding.
- Three ancestors each contribute horizontal padding.
- Removing a heading makes the container meaningless.
- The same hierarchy could be expressed by `gap` plus `divide-y`.

### Corrective order

1. Remove decorative heading/description.
2. Remove the outer surface and place content directly in the page flow.
3. If grouping is still needed, keep one outer surface and flatten its children.
4. If peer items need distinction, use one parent and separators.
5. Keep inner cards only when each item is independently actionable or semantically self-contained.

---

## 7. Surfaces, separators, and borders

Borders are not forbidden. Decorative perimeter borders are discouraged; functional and separating borders are required when they communicate structure better than another padded box.

### Use whitespace when

- The relationship is obvious from proximity and typography.
- Sections are narrative or editorial.
- Adding a boundary would create a container solely for decoration.

### Use a separator when

- Peer rows share one parent.
- Two adjacent regions need distinction but not independent containers.
- A sticky header/footer must remain legible.
- Metadata, receipts, settings rows, or activity entries form a sequence.

Preferred forms: a shared Separator primitive, `hr`, `border-t`, or `divide-y`. The parent owns outer padding; the separator adds no new padding layer.

### Use a muted surface when

- Several controls form one task.
- A status, empty state, permission explanation, or summary must be perceived as one unit.
- Content needs a quiet contrast from the page.

Default geometry: `rounded-2xl`; use `rounded-3xl` only for a major page-level group or hero-scale region.

### Use a border when

- It defines an input, selected/focused item, table, media viewport, map, drop zone, dialog, popover, code/technical region, destructive boundary, or transaction boundary.
- A separator must remain visible across themes where background contrast is insufficient.
- An overlay needs edge definition against arbitrary content.

### Do not

- Give every sibling its own perimeter border.
- Combine border, shadow, strong background, and large padding without a functional reason.
- remove a useful row separator merely to satisfy a “borderless” aesthetic.
- Add an outer card around a list whose parent surface and dividers already establish hierarchy.

---

## 8. Typography roles

### Body and functional UI

Use the body sans face for:

- Body text
- Labels
- Navigation
- Buttons and controls
- Metadata
- Status text
- Values and measurements
- Sidebar and shell group labels
- Captions and helper text

### Display headings

Use the italic display serif only for real visible content headings:

- Page title
- Section title
- Card title when the card is a meaningful content section
- Empty-state title
- Dialog title

A text node is not a heading merely because it labels a group. Navigation labels, filter labels, table labels, fieldsets, and shell labels remain body sans.

### Brand face

Use the brand face only for the exact visible brand word. Never use it as a general serif utility.

### Eyebrows and supertitles

Decorative eyebrow, kicker, category-above-title, and supertitle rows are prohibited.

Do not recreate them using:

- Small tracked all-caps text
- Display serif at caption size
- Muted text above a heading
- Icon-plus-label rows whose only purpose is decoration

Necessary labels such as navigation groups, form legends, table columns, and status categories are allowed, but must use functional body typography and must not imitate an eyebrow.

---

## 9. Grids and equal-height cards

Peer cards in one grid must align visually.

### Required behavior

- Grid rows stretch their items.
- Card roots use full available height.
- Card content uses a column layout.
- Variable body content occupies the flexible middle.
- Actions/status/footer content align consistently at the bottom when present.
- Media uses one shared aspect ratio per grid.
- Grid gaps come from the spacing lattice and remain consistent at each breakpoint.
- A horizontal card carousel is still a peer grid: the flex row must use `items-stretch`, and every card wrapper must use `self-stretch` with a full-height inner column.
- Do not rely on `h-full` on a flex item when its parent has an automatic cross-size; percentage height can defeat cross-axis stretching and reproduce uneven cards.

### Content handling

- Do not force a fixed card height when localized or user-generated text can grow.
- Use line clamping only for optional preview text, never critical titles, safety copy, or controls.
- Prefer equal structural regions and flex growth over hardcoded heights.
- If one item type needs materially different anatomy, it belongs in a different grid or layout variant.
- Loading skeletons must match the same card geometry and row behavior.

---

## 10. Media, cover, and hero exceptions

Media establishes its own contrast rules.

- Cover images may bleed to edges.
- Use a gradient or tonal scrim when it improves text contrast and creates a smooth transition between image and page.
- Do not replace a purposeful image-to-page gradient with a flat muted block.
- Gradients are functional when they protect readability or blend media; they are not general decoration.
- Preserve image focal area and responsive cropping.
- Media frames may retain borders, overlays, and shadows when needed against unpredictable imagery.
- Hero content must still align to the page gutter and remain readable without relying on one specific image.

---

## 11. Responsive nesting rules

Before approving a phone layout, calculate horizontal content loss:

`viewport − page gutters − surface padding − nested padding − borders`

Rules:

- Default phone page gutter is 12px per side.
- A standard phone surface uses 16px internal padding.
- If a second padded level is necessary, it uses at most 12px.
- Do not place a 20–24px padded card inside another 20–24px padded card on phones.
- At 320px, primary content should normally retain at least 264px before functional control padding.
- Prefer horizontal scrolling for tab/chip rails over shrinking labels to illegibility.
- Prefer stacking actions over compressing them below touch-target size.
- Compact desktop density must not leak into primary workspace controls; interactive targets remain at least 44px where practical.
- Persistent shell navigation is an explicit compact exception: keep its peer rows consistently small rather than enlarging isolated items and producing a mixed-size shell.

---

## 12. Layout-family consistency

Pages that share a task model must share an anatomy.

Examples of task models:

- Explore/catalog pages
- Record detail pages
- Account/profile pages
- Settings pages
- Management collections
- Long-form documentation
- Full-bleed map/media workspaces
- Loading, empty, and error counterparts

For each family, keep consistent:

- Width family
- Outer gutter
- Top padding
- Header alignment
- Section rhythm
- Control placement
- Grid breakpoints and gaps
- Surface padding
- Loading geometry
- Empty/error placement

A loading page is part of the same family; it must not introduce a different max width, gutter, or card anatomy.

---

## 13. Forms, lists, and management UI

### Forms

- Group fields by task, not by visual convenience.
- A form section may use one muted surface.
- Field rows inside it stay open unless a selected/error state needs a boundary.
- Related fields use 12–16px gaps; major form stages use 24–32px gaps.
- Sticky actions use a separator, not another nested card.

### Settings

- A settings tab inherits the exact width, outer padding, and vertical frame used by its peer tabs. Never add a nested page container or route-specific max-width inside the tab.
- Put every settings category inside one explicit grouped `div` and one accordion root, not a stack of detached accordion containers.
- Never give the outer group and its expanded inner regions the same muted fill. Similar outer and inner tones erase hierarchy instead of strengthening it.
- When expandable items need a clear boundary and their bodies already contain muted regions, keep the list and every item on `bg-background`; enclose the whole list with `rounded-3xl`, `overflow-hidden`, and a 4px low-contrast muted frame.
- Keep accordion items free of their own perimeter borders and place a shared Separator between every pair of peer items. Inset separators with parent horizontal padding so they are centered and stop short of the enclosure edge.
- Expanded content may use one stronger muted inner grouping layer; do not wrap each accordion item in another competing card.

### Lists

- Default to one parent with `divide-y` for homogeneous rows.
- Use cards only when items are independently self-contained and benefit from spatial separation.
- A selected row may use background/ring treatment without changing the base layout geometry.

### Tables and dense data

- Keep table borders/dividers when they support scanning.
- Do not convert every table row into a rounded card on desktop.
- A mobile card transformation is allowed only when tabular relationships remain understandable.

---

## 14. Dialogs, drawers, and portals

- Use the shared dialog primitive whenever content or children portal.
- Manual drawers/lightboxes must provide focus entry, containment, topmost Escape, scroll lock, inert background, and trigger restoration.
- Dialog title typography follows the heading role; form labels and group labels do not.
- Use one dialog shell. Do not nest another roomy container around the entire form.
- Use separators for sticky headers/footers.
- Portaled selects, popovers, and menus must be allowed to handle keyboard input before the parent overlay closes.

---

## 15. Motion

- Motion must explain state, direction, or causality.
- Prefer one meaningful transition over repeated decorative movement.
- Loading shimmer, live status, marquees, camera movement, scale, blur, and travel must respect reduced motion.
- Under reduced motion, remove displacement, looping, camera flight, marquee, pulse, and stagger; preserve state feedback.
- Hover motion must not be required to understand hierarchy.

---

## 16. Accessibility and localization

- Semantic headings reflect actual document structure, not visual styling convenience.
- If visible text is a group label rather than content heading, use the appropriate label/legend/navigation semantics and body typography.
- Interactive targets remain keyboard reachable and visibly focused.
- Do not nest interactive elements.
- Error and empty states are distinct.
- Permission-denial reasons are visible before unavailable mutations.
- Layouts must tolerate the longest supported translation without horizontal clipping.
- Never solve translation overflow by reducing touch targets or critical text size.
- User-facing copy comes from synchronized locale catalogs.

---

## 17. Permission and mutation presentation

- Unknown role, ownership, signer, or permission state fails closed.
- Hide or disable unavailable actions before mutation code can run.
- Explain denial in plain language near the action.
- Do not expose raw server errors or routine technical identifiers.
- Destructive and transaction boundaries may use stronger borders/backgrounds than ordinary grouping.

---

## 18. Exceptions

An exception is valid only when all are true:

1. It has a functional, accessibility, media, data-density, or platform reason.
2. The reason cannot be expressed by an existing context or primitive.
3. It does not create a new general spacing/layout system.
4. It is documented next to the implementation or in an exception registry.
5. Its loading, empty, responsive, dark, localized, and reduced-motion states follow the same rationale.

Visual novelty alone is not an exception.

---

## 19. Review checklist

Before merging UI work, verify:

- [ ] One width family and one outer-gutter owner per page
- [ ] 12px phone, 20px tablet, and 32px desktop outer gutter unless intentionally full bleed
- [ ] Spacing values come from the lattice
- [ ] Parent owns sibling gaps; no double rhythm
- [ ] No more than one ordinary padded surface below the page frame
- [ ] Third nested padded layer exists only for a functional boundary
- [ ] Similar pages share anatomy, max width, breakpoints, and loading geometry
- [ ] Lists use separators instead of repeated perimeter cards where appropriate
- [ ] Borders remain on functional and separating boundaries
- [ ] No decorative eyebrows, kickers, or supertitles
- [ ] Display type appears only on real content headings
- [ ] Shell/navigation labels use compact body typography
- [ ] Every control in a header or toolbar peer cluster has one intentional shared outer size
- [ ] A lone narrow content column is centered unless a real sibling alignment requires otherwise
- [ ] A settings tab uses the same outer frame as peer tabs, with no nested max-width or duplicate padding
- [ ] Every settings category sits in one explicit grouped div and accordion root, with inset shared Separators between peers
- [ ] An expandable list never repeats the same muted fill on both its enclosure and inner content
- [ ] Grid and carousel peers stretch to equal structural height; no percentage-height item defeats flex stretching
- [ ] Hero/media gradients that protect contrast are preserved
- [ ] Phone content remains usable after all nested padding
- [ ] Empty and error states are distinct
- [ ] Reduced motion, keyboard, focus, localization, and dark mode are verified
- [ ] Permissions fail closed and raw errors stay private

---

## 20. Enforcement direction

The design contract should be encoded in shared primitives and automated checks, not left as prose alone.

Preferred enforcement:

- Page-frame primitives for width/gutter families
- Stack/cluster primitives or narrowly defined class recipes
- Surface variants with controlled padding and radius
- Shared divider-led list patterns
- Shared equal-height card/grid patterns
- Source checks for forbidden arbitrary page gutters, nested surface recipes, decorative eyebrow patterns, and display type on shell labels
- Visual fixtures for every layout family at phone, tablet, and desktop widths
- Explicit exception allowlist with rationale, owner, and test

Do not create a universal component for every `div`. Create a small set of layout contracts that remove arbitrary decisions while allowing content-specific composition.
