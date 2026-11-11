# Code Standards

## General

- Keep modules small and single-purpose
- Fix root causes, do not layer workarounds
- Do not mix unrelated concerns in one component, route,
  or function
- Prefer simple, readable code over clever code. This is a
  two-week solo build; the code must be easy to explain
  and debug
- Do not add dependencies, abstractions, or configuration
  that the current feature does not need
- Names describe units and meaning (`rainfall_mm`,
  `lawn_area_m2`, not `rain`, `area`)

## Python (Backend)

- Use type hints on all function signatures
- Use Pydantic models for all request and response
  shapes; do not pass raw dicts across module boundaries
- Validate unknown external input (user requests, Open-Meteo
  responses) at the boundary before trusting it
- `backend/app/engine/` functions are pure: no network, no
  database, no global state, no framework imports
- Internal calculations use SI units only: millimetres (mm)
  for depth, square metres (m²) for area, litres (L) for
  volume, degrees Celsius. Convert to or from other units
  (minutes, gallons, square feet) only at the API or UI
  edge
- No magic numbers. Every constant has a name, a unit, and
  a comment citing its source or marking it as an explicit
  assumption
- Raise specific, named exceptions for expected failures
  (e.g. weather unavailable). Do not use bare `except`
- Format with `ruff format` and lint with `ruff check`

## TypeScript (Frontend)

- Strict mode is required throughout the project
- Avoid `any`; use explicit interfaces or narrowly scoped
  types
- Define API response types in one place
  (`frontend/src/types/`) and keep them in sync with the
  backend Pydantic models
- Validate unknown external input at system boundaries
  before trusting it
- Display units explicitly next to every number shown to
  the user

## React (Vite)

- Use function components and hooks only
- Keep components small; split a component when it handles
  more than one concern (fetching, layout, and formatting
  are separate)
- Put all backend calls in `frontend/src/api/`; components
  never call `fetch` directly
- Handle loading, error, and empty states for every data
  view. No blank screens
- Do not duplicate irrigation logic in the frontend. It
  displays what the backend returns

## Styling

- Use CSS custom property tokens for colors, spacing, and
  radius. No hardcoded hex values in components
- Follow the design tokens and scale defined in
  `ui-context.md`
- Layouts must work on a phone-width screen; homeowners
  will check this on their phones

## API Routes

- Validate and parse request input before any logic runs
- Verify the profile ID in the request matches an existing
  profile before reading or mutating it
- Keep route handlers thin: validate, call a service or the
  engine, return a result. No calculation logic in routes
- Return consistent response shapes. Errors use a single
  structure with a machine-readable code and a plain-language
  message
- Use appropriate HTTP status codes (400 invalid input,
  404 unknown profile, 502/503 weather provider failure)

## Data and Storage

- All persistent data belongs in SQLite, accessed only
  through `backend/app/db/`
- Store the inputs, constants, and assumptions behind every
  recommendation so it can be explained later
- Do not store raw weather API payloads; store only the
  values a recommendation needs
- Schema changes are made through the models and recorded
  in `architecture.md` in the same step
- Any estimated figure is stored with a field or label
  that marks it as an estimate

## Testing

- Every function in `backend/app/engine/` has unit tests,
  including edge cases (zero rainfall, heavy rain, missing
  values, extreme temperatures)
- Tests use fixed input values with hand-checked expected
  outputs; do not compute expected values with the code
  under test
- Mock the Open-Meteo client in tests; no test depends on
  the live API

## File Organization

- `backend/app/api/` — Routes and request/response schemas
- `backend/app/engine/` — Pure recommendation and
  water-balance calculations
- `backend/app/services/` — External integrations
  (Open-Meteo client)
- `backend/app/db/` — SQLAlchemy models, sessions, queries
- `backend/tests/` — pytest tests, mirroring the `app/`
  structure
- `frontend/src/api/` — Typed backend client functions
- `frontend/src/components/` — Reusable UI components
- `frontend/src/pages/` — Screen-level views
- `frontend/src/types/` — Shared TypeScript types
- `context/` — Spec files that define what to build