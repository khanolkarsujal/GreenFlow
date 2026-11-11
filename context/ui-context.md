# UI Context

## Theme

Light only. No dark mode and no theme toggle. The visual
language follows a clean dashboard style: a light grey page
background, white cards with generous rounded corners, lime
green pill buttons, and pill-shaped tabs. Keep it airy and
uncluttered. The recommendation (SKIP, REDUCE, or WATER) and
the reason for it are always the most prominent element on
the screen.

Mobile-first. Homeowners will most likely use this on a
phone, so every screen must work at phone width first. On
desktop, the same cards rearrange into a grid.

Deliberately NOT copied from the reference design: sidebar
navigation, breadcrumbs, notification and help icons, user
avatar and profile block, dark/light toggle, donut chart,
hatched or gradient bar textures, glow effects (except the
soft ring on primary buttons), AI tabs, and goals or offset
features. Each of these has no job in this product.

## Colors

All components must use these tokens, defined as CSS custom
properties on `:root`. No hardcoded hex values anywhere else.
Values were chosen by eye from the reference design and
checked for contrast.

| Role                        | CSS Variable            | Value     |
| --------------------------- | ----------------------- | --------- |
| Page background             | `--bg-base`             | `#EEEEEE` |
| Surface (cards)             | `--bg-surface`          | `#FFFFFF` |
| Subtle surface              | `--bg-subtle`           | `#F6F6F6` |
| Primary text                | `--text-primary`        | `#141A14` |
| Muted text                  | `--text-muted`          | `#5F6B60` |
| Primary accent (lime)       | `--accent-primary`      | `#86E05A` |
| Text on accent              | `--text-on-accent`      | `#14230F` |
| Accent soft (active bg)     | `--accent-soft`         | `#E3F5D6` |
| Accent strong (links)       | `--accent-strong`       | `#2F7A1B` |
| Border                      | `--border-default`      | `#E2E4E2` |
| Error                       | `--state-error`         | `#B3261E` |
| Success                     | `--state-success`       | `#1E7B45` |
| Estimate / caution          | `--state-estimate`      | `#9A6200` |
| Estimate tag background     | `--state-estimate-soft` | `#FBEFD5` |
| Recommendation: SKIP        | `--rec-skip`            | `#1F5FA8` |
| Recommendation: SKIP soft   | `--rec-skip-soft`       | `#E1ECF8` |
| Recommendation: REDUCE      | `--rec-reduce`          | `#9A6200` |
| Recommendation: REDUCE soft | `--rec-reduce-soft`     | `#FBEFD5` |
| Recommendation: WATER       | `--rec-water`           | `#3D4F5C` |
| Recommendation: WATER soft  | `--rec-water-soft`      | `#E6EBEF` |
| Chart: rainfall             | `--chart-rain`          | `#4A90D9` |
| Chart: ET₀ / demand         | `--chart-demand`        | `#E8A33D` |
| Chart: baseline line        | `--chart-baseline`      | `#141A14` |

Rules:

- Never rely on color alone. Each recommendation state also
  has its own icon and text label (see Icons)
- Body text must meet WCAG AA contrast (4.5:1). Primary
  buttons use dark text on lime, never white
- Anything that is an estimate carries an "Estimated" tag
  using `--state-estimate` so it is visually distinct from
  measured facts such as past rainfall

## Typography

| Role         | Font                                                                   | Variable      |
| ------------ | ---------------------------------------------------------------------- | ------------- |
| UI text      | System font stack (`system-ui, -apple-system, "Segoe UI", sans-serif`) | `--font-sans` |
| Numbers/code | System monospace stack (`ui-monospace, "SF Mono", Menlo, monospace`)  | `--font-mono` |

- No web fonts by default (no load time, no external
  dependencies). A self-hosted font can be considered later
  as an optional polish step
- Page title: large, semibold. Card titles: medium weight
- Big stat numbers (as in the reference stat cards): about
  2.5rem, with the unit in a smaller muted size beside it
- Use `font-variant-numeric: tabular-nums` for numbers
- Explanation text: regular weight, at least 16px

## Border Radius

Defined as CSS custom properties.

| Context                 | Variable        | Value   |
| ----------------------- | --------------- | ------- |
| Inline / small UI, tags | `--radius-sm`   | `8px`   |
| Cards / panels          | `--radius-md`   | `20px`  |
| Modals / overlays       | `--radius-lg`   | `24px`  |
| Pills (tabs, buttons)   | `--radius-pill` | `999px` |

## Shadows and Elevation

- Cards: no heavy shadow; a 1px `--border-default` border or
  a very soft shadow only
- Primary button: a soft ring in a light tint of
  `--accent-primary` around the pill, as in the reference
- No glow, blur, or gradient effects elsewhere

## Component Library

None. Plain React components styled with CSS using the tokens
above (one global token stylesheet plus one CSS file per
component or page). Build only the small set the MVP needs:

- `Button`: primary lime pill with soft ring; secondary
  outlined pill
- `Card`: white, `--radius-md`, padding 20 to 24px
- `Tabs`: pill-shaped; the active pill uses `--accent-soft`
  with a thin lime border, matching the 30D / 3M / 6M style
- `Tag`: small rounded status label with soft background,
  matching On Track / Needs Review / Behind
- `StatCard`: small label, muted sublabel, big number with
  unit, optional action button
- `RecommendationCard`: see Recommendation Card below
- `ProgressBar`: rounded track, plain solid fill, no hatching
- `TextField` and `Select` for onboarding

Charts use Recharts, styled with the chart tokens above.

## Layout Patterns

- Top bar only: app name on the left and two or three plain
  links on the right (Today, History, My lawn). No sidebar
- Mobile: single column, cards stacked, full width with
  16px side padding
- Desktop (about 1024px and up): content column up to about
  1100px, centered, in a grid:
  - Row 1: `RecommendationCard`, full width
  - Row 2: left column holds three stacked `StatCard`s;
    right column holds the chart card (wider)
  - Row 3: "Why this recommendation" card and "Recent
    decisions" card side by side
- Page title (for example "Today") at the top left in large
  type, with a short muted sublabel
- Every data view has loading, error, and empty states
- "Cannot recommend" state: a clear message with the reason
  (for example, weather data unavailable) and no
  recommendation shown
- Modals are avoided in the MVP; prefer inline expansion

### Elements kept from the reference, and what they become

| Reference element                          | In this product                                                                                              |
| ------------------------------------------ | ------------------------------------------------------------------------------------------------------------ |
| Stat cards (big number + unit)             | Estimated water avoided (L), recommendations followed, watering events skipped or reduced                    |
| Pill range tabs (30D / 3M ...)             | Chart range (for example 7D / 14D)                                                                           |
| Bar chart with "Target" line               | Daily rainfall and estimated demand bars, with a dashed line for the user's normal baseline where relevant   |
| Insights list (icon + title + description) | "Why this recommendation": rainfall received, rainfall expected, estimated demand, uncertainty               |
| Goals Progress rows with status tags       | "Recent decisions": date, recommendation tag, followed or not                                                |
| Lime pill buttons with arrow               | Primary actions such as "Log that I followed this"                                                           |

## Recommendation Card

The first thing on the main screen. Contains:

- State label (SKIP, REDUCE, or WATER) with its icon, in the
  matching `--rec-*` color on a `--rec-*-soft` background
- One-sentence reason in plain language
- Expandable "Why?" section with the numbers behind it
- Primary action: log whether the user followed it

## Content and Labeling Rules

- Plain language. No irrigation jargon in the primary view
  (details such as ET₀ appear only inside "Why?", with a short
  explanation)
- Every number shows its unit next to it (mm, L, minutes)
- Any savings figure carries an "Estimated" tag and an
  expander showing the baseline and assumptions
- Never use the words "saved" or "measured" for estimated
  values; use "estimated water avoided"
- Uncertainty is shown in words (for example, "Rain is
  forecast but not certain"), not hidden
- Any placeholder or sample data shown during development
  must be visibly labeled "Sample data"

## Icons

Lucide React. Stroke-based icons only. Sizes: 16px inline,
20px in buttons. Recommended mapping:

| State            | Icon          |
| ---------------- | ------------- |
| SKIP             | `CloudRain`   |
| REDUCE           | `Droplet`     |
| WATER            | `Droplets`    |
| Estimate         | `Info`        |
| Error            | `AlertCircle` |
| Arrow on buttons | `ArrowRight`  |