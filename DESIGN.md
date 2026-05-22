# DESIGN.md - Fjord Insight

## Source of Truth

This spec is derived from the Stitch project `Norsk Selskapsanalyse` (`projects/1849530631394579527`), last updated on May 19, 2026.

Stitch evidence that this is the Fjord Insight project:
- `Fjord Insight - Dashbord med Profil-dropdown`
- `Fjord Insight - Dashbord med Åpen Profilmeny`
- `Fjord Insight - Verifisering av årsrapport`
- `Selskapsprofil med trendgrafer: Nordic Tech Solutions`

This document is the implementation contract for React, Next.js, and Tailwind. Stitch is the visual reference. The app code must use project tokens and reusable components, not pasted Stitch markup.

---

## Design Direction

Fjord Insight should feel like a Norwegian editorial research terminal:
- calm
- authoritative
- data-first
- premium, but restrained
- optimized for analytical reading rather than marketing theatrics

The visual character is "Nordic enterprise editorial":
- editorial typography for page-level emphasis
- sober enterprise surfaces
- compact but readable data density
- low-shadow, border-led hierarchy
- strong distinction between narrative text, UI text, and data text

---

## Colors

### Stitch Reference Palette

These colors come directly from the Stitch project and describe the intended visual system:

| Role | Value | Notes |
|---|---|---|
| Neutral background | `#F8F9FA` | Main workspace background |
| Elevated surface | `#FFFFFF` | Cards, forms, focus areas |
| Primary navy | `#1B2B3A` | Primary actions, headers, active states |
| Deep ink | `#051625` | Strong text and dark emphasis |
| Teal data accent | `#5F8D8A` | Positive trend and primary chart series |
| Gold highlight | `#C5A059` | Benchmarks, emphasis, secondary data series |
| Sand support | `#D6C7A1` | Tertiary chart fill or muted comparison |
| Outline | `#C4C6CC` | Low-contrast border system |
| Body text | `#191C1D` | Primary readable text |
| Muted text | `#43474C` | Secondary text and metadata |

### Implementation Rule

UI code must use CSS tokens only:
- `var(--px-bg)`
- `var(--px-surface)`
- `var(--px-border)`
- `var(--px-text)`
- `var(--px-muted)`
- `var(--px-accent)`
- `var(--px-panel)`
- `var(--px-action)`
- `var(--px-action-hover)`
- `var(--px-subtle)`
- `var(--px-accent-soft)`

Do not scatter Stitch hex values directly through components. Map the Stitch palette centrally in `app/globals.css`, then consume the tokens everywhere else.

### Recommended Token Mapping

| Token | Intended meaning from Stitch |
|---|---|
| `--px-bg` | Neutral background close to `#F8F9FA` |
| `--px-surface` | Elevated card surface close to white |
| `--px-border` | Soft outline close to `#C4C6CC` or approved subtle rgba |
| `--px-text` | Deep readable ink close to `#191C1D` / `#111827` |
| `--px-muted` | Secondary copy close to `#43474C` |
| `--px-accent` | Primary navy based on `#1B2B3A` |
| `--px-action` | Same family as `--px-accent` |
| `--px-action-hover` | Slightly deeper navy state |
| `--px-accent-soft` | Soft navy tint for hover and selection |
| `--px-subtle` | Very light neutral structural background |
| `--px-panel` | Dark analytical contrast panel |

### Status

Status colors should stay sober and enterprise-safe:
- success: muted emerald
- warning: muted amber
- error: muted rose

Avoid neon status states or saturated SaaS blues.

---

## Typography

The Stitch project clearly separates editorial hierarchy, UI utility, and data labeling.

### Font Roles

| Role | Font | Usage |
|---|---|---|
| Editorial display | Source Serif 4 | H1, page titles, major section headers |
| UI sans | IBM Plex Sans | body text, controls, cards, labels with sentence casing |
| Data mono | IBM Plex Mono | metadata, badges, table headers, tabular values, compact labels |

### Rules

- `.editorial-display` is reserved for H1 and major editorial headings only.
- Functional card headings stay in IBM Plex Sans.
- `.data-label` is always IBM Plex Mono and should usually be uppercase or compact metadata styling.
- Financial and tabular values should use tabular figures.

### Stitch Size Guidance

| Token | Value |
|---|---|
| `headline-xl` | `40px / 1.2 / 600` |
| `headline-lg` | `30px / 1.25 / 600` |
| `headline-md` | `24px / 1.3 / 500` |
| `body-lg` | `16px / 1.5 / 400` |
| `body-md` | `14px / 1.4 / 400` |
| `ui-label` | `13px / 1 / 500` |
| `data-table` | `13px / 1 / 450` |
| `metadata` | `11px / 1 / 400` |

### Implementation Guidance

- Use Source Serif 4 sparingly so it keeps its authority.
- Prefer IBM Plex Sans for all interactive UI.
- Use IBM Plex Mono for:
  - metadata labels
  - section overlines
  - table headers
  - badges
  - financial microdata

---

## Spacing

The Stitch project uses a compact 4px system with disciplined density.

### Base System

| Element | Value |
|---|---|
| Base unit | `4px` |
| Grid gutter | `16px` |
| Outer margin | `24px` |
| Max container | `1440px` |
| Dense table horizontal padding | `8px` |

### Tailwind Guidance

- Use `gap-4`, `gap-6`, `gap-8`
- Use `p-5` or `p-6` for outer cards
- Use `rounded-2xl` for outer cards
- Use `rounded-xl` for internal boxes and inputs
- Use `rounded-full` for buttons, pills, and badges
- Financial tables should stay sharp and mostly unradiused

Avoid custom spacing values unless they are necessary to match a specific responsive constraint.

---

## Layout Rules

The Stitch project shows a consistent desktop-first analytical shell with top navigation and structured content zones.

### Global Shell

- Sticky top navigation, not a permanent left rail
- Broad desktop canvas with disciplined max width
- 12-column fluid grid for page composition
- Data panels grouped through borders and tonal layers, not heavy shadows

### Page Patterns

#### 1. Logged-in dashboard

Reference screens:
- `projects/1849530631394579527/screens/00e0ead43a8f4b62a25b8011fc8c7e8c` - `Fjord Insight - Dashbord med Profil-dropdown`
- `projects/1849530631394579527/screens/917b7e8fccd243aea12d3566f8fa73bf` - `Fjord Insight - Dashbord med Åpen Profilmeny`

Rules:
- top nav with account/profile control on the right
- search and discovery should feel central to the workflow
- cards and lists should read like an analyst workspace, not a marketing dashboard

#### 2. Company profile

Reference screens:
- `projects/1849530631394579527/screens/00ca8d9c47354948acc0cc542616008e`
- `projects/1849530631394579527/screens/8f8b695ec8c3404993cb017a276b059a`

Rules:
- primary content area plus supporting context
- trend graphs, metadata, and roles should live in clearly separated blocks
- chart sections should be calm and legible, never overly colorful

#### 3. Onboarding flow

Reference screens:
- `projects/1849530631394579527/screens/d576e0f503754455824cfa845e1e1cf9` - `Onboarding: Identitet`
- `projects/1849530631394579527/screens/3f394913e34749519137f95a1ddbed68` - `Onboarding: Utdanning & Ekspertise (Steg 3)`
- `projects/1849530631394579527/screens/8df7206a16cb42938c1a8378b576d609` - `Onboarding: Profesjonell tilknytning`
- `projects/1849530631394579527/screens/edae2e68dd6c48529e5bc8701aba1a1b` - `Onboarding: Kontakt & Sted (Steg 4)`
- `projects/1849530631394579527/screens/bf358c7d914541cca34996fc45028e94` - `Onboarding: Forhåndsvisning (Steg 5)`

Rules:
- single primary task per step
- clear vertical progress rhythm
- large editorial heading, then focused form structure
- avoid over-carded wizard UI

#### 4. User profile

Reference screens:
- `projects/1849530631394579527/screens/b0005886642f4468b46588b8f04e0253` - `Brukerprofil: Johannsen`
- `projects/1849530631394579527/screens/25580ca5a42e4a8fb627b0934d23e5b8` - `Rediger profil`
- `projects/1849530631394579527/screens/01acff76c329422cb920c01d13f9d68d` - `Brukerprofil: Klassisk Redaksjonell-variant`
- `projects/1849530631394579527/screens/dfaee66fbaef4ea88f5f207b77974f77` - `Brukerprofil: Strukturert Nettverk-variant`
- `projects/1849530631394579527/screens/c04e38bc66714314b022c4fe83cd794f` - `Brukerprofil: Student-variant`
- `projects/1849530631394579527/screens/f084d0ffb9dd41658eaae5162a827764` - `Brukerprofil: Analytisk Dashbord-variant`

Rules:
- profile pages should feel editorial and credible, not social
- identity, credentials, affiliations, and expertise should be grouped explicitly
- editable controls should be quieter than the data itself

#### 5. Verification / operations

Reference screen:
- `projects/1849530631394579527/screens/a4e34aa9180d4fc58ec304f0fb411daa` - `Fjord Insight - Verifisering av årsrapport`

Rules:
- emphasize traceability and review state
- support dense operational detail
- use compact data blocks with strong labeling discipline

---

## Component Hierarchy

The UI should be built from reusable pieces in this order:

1. `AppShell`
2. `TopNav`
3. `CommandSearch`
4. `PageHeader`
5. `SectionHeader`
6. `Card`
7. `DataPanel`
8. `MetricRow`
9. `Badge`
10. `EntityMetaList`
11. `DataTable`
12. `ChartPanel`
13. `EmptyState`
14. `ErrorState`
15. `LoadingSkeleton`
16. `OnboardingStepper`
17. `ProfileSection`
18. `ProfileFieldList`
19. `VerificationPanel`

### Composition Guidance

- `AppShell` owns navigation, page padding, and responsive structure.
- `PageHeader` owns editorial H1 plus supporting metadata.
- `DataPanel` and `Card` should be visually close, but `DataPanel` is denser and more analytical.
- `OnboardingStepper` should orchestrate the sequence, not own field rendering details.
- `ProfileSection` should support both read and edit modes.
- `DataTable` and `ChartPanel` must share spacing and labeling conventions.

---

## React / Next / Tailwind Guidance

### Architecture

- Keep provider, normalization, persistence, API, and frontend layers separate.
- Frontend must consume normalized internal models, never raw external API responses.
- Do not introduce mock companies, mock people, or fake financials.

### React

- Use TypeScript everywhere.
- Prefer server components for data-backed page shells where it fits the existing app.
- Keep client components focused on interactivity: filters, dropdowns, tabs, inline editing, and chart controls.
- Build small composable components rather than large screen-specific JSX files.

### Next.js

- Treat route segments as page shells and move dense UI into reusable components.
- Put loading, error, and empty states near the route boundary.
- Keep authenticated app chrome consistent across dashboard, search, company, and profile flows.

### Tailwind

- Use design tokens via CSS variables for all product color decisions.
- Respect the allowed radius system only:
  - `rounded-2xl`
  - `rounded-xl`
  - `rounded-full`
- Prefer:
  - `border border-[var(--px-border)]`
  - `bg-[var(--px-surface)]`
  - `text-[var(--px-text)]`
  - `text-[var(--px-muted)]`
- Favor border and tonal separation over shadows.

### Forms

- Onboarding and profile forms should use clear labels above inputs.
- Group fields by identity, expertise, affiliation, and contact context.
- Keep one primary action per step.

### Tables and charts

- Tables should prioritize scanning speed:
  - mono labels
  - tabular numbers
  - restrained row hover
  - minimal borders
- Charts should use navy, teal, and gold sparingly.
- Avoid decorative gradients, glossy cards, or visual noise.

### Empty / loading / unavailable

- Every data-backed area must define loading, error, empty, and unavailable states.
- If a real external source does not provide data, show that honestly instead of backfilling synthetic content.

---

## Non-Negotiables

- No mock data
- No hardcoded fake businesses or people
- No raw Stitch HTML pasted into the product
- No purple-on-white SaaS aesthetic
- No heavy shadow system
- No uncontrolled hex usage throughout component code
- No mixing serif into functional UI labels

---

## Working Summary

If a new screen is added, it should pass this test:
- Does it look like it belongs beside the Stitch dashboard, onboarding, and profile screens above?
- Does it use editorial serif only for real emphasis?
- Does it treat data as the primary content?
- Does it stay calm, compact, and credible?
- Does it use project tokens and reusable components rather than screen-specific styling hacks?
