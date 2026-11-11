# AI Workflow Rules

## Approach

Build this project incrementally using a spec-driven workflow.
Context files define what to build, how to build it, and the
current state of progress. Always implement against these
specs — do not infer or invent behavior from scratch.

This is a two-week, single-developer hackathon build. A
working, reliable demo always beats extra features. The
product is an advisory tool: it recommends, the homeowner
decides. It never controls sprinklers.

## Scoping Rules

- Work on one feature unit at a time
- Prefer small, verifiable increments over large
  speculative changes
- Do not combine unrelated system boundaries in a
  single implementation step

## When to Split Work

Split an implementation step if it combines:

- Frontend (UI) changes and backend (API / calculation)
  changes
- Weather data fetching and recommendation calculation
  logic (the calculation must be testable without network
  calls)
- Database schema changes and feature logic that depends
  on them
- Multiple unrelated API routes
- Behavior not clearly defined in the context files

If a change cannot be verified end to end quickly,
the scope is too broad — split it.

## Handling Missing Requirements

- Do not invent product behavior not defined in the
  context files
- If a requirement is ambiguous, resolve it in the
  relevant context file before implementing
- If a requirement is missing, add it as an open question
  in `progress-tracker.md` before continuing

## Irrigation Logic and Claims Rules

- Never change the recommendation formula, constants, or
  thresholds unless the calculation spec is updated first
- Do not invent scientific values (crop coefficients,
  efficiencies, precipitation rates). Every constant must
  come from a cited source or be marked as an explicit
  assumption in the spec
- Every water-savings figure shown in the product must be
  labeled as an estimate and traceable to stated
  assumptions. Never present estimates as measured savings
- Do not add AI or LLM features unless a context file
  explicitly defines them

## Protected Files

Do not modify the following unless explicitly instructed:

- Generated UI library components (e.g. `components/ui/*`,
  if a component generator is used)
- Third-party library internals and `node_modules/`
- Lock files (`package-lock.json`, `requirements.txt`
  pins) except when intentionally adding or upgrading a
  dependency
- Context files other than the one being updated for the
  current unit (see Keeping Docs in Sync)

## Keeping Docs in Sync

Update the relevant context file whenever implementation
changes:

- System architecture or boundaries
- Storage model decisions
- Calculation methodology or its assumptions
- Code conventions or standards
- Feature scope

## Before Moving to the Next Unit

1. The current unit works end to end within its defined scope
2. No invariant defined in `architecture.md` was violated
3. `progress-tracker.md` reflects the completed work
4. `npm run build` passes (frontend)
5. Backend tests pass (`pytest`), including calculation
   tests for any logic that was touched