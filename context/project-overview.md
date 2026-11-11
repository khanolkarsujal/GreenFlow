# Project Overview

Status: MVP direction approved by Morax on 2026-11-04.
Items marked **Assumption** are unvalidated hypotheses. Items
marked **Decision needed from Morax** are not settled yet.

## Problem

Homeowners with traditional sprinkler timers water on a
fixed weekly schedule. That schedule does not react to rain
that has already fallen, rain that is forecast, or the
actual water demand of the lawn that week.

**Assumption:** A simple daily view that says SKIP, REDUCE,
or WATER, explains why in plain language, and uses the
homeowner's own schedule as a baseline would help reduce
unnecessary watering. This has not been validated with users
yet; the planned interview exercise is still open.

The project claims no measured water savings. Every savings
figure is an estimate against a stated baseline and must be
labeled as such.

## Primary User

- A homeowner with a traditional (non-smart) sprinkler timer
- One lawn, watered from the mains supply
- Checks the phone in the morning before the scheduled
  watering day
- Comfortable entering a few property details during a short
  onboarding flow

**Decision needed from Morax:** target region and demo
region. **Assumption:** English-language UI and metric units
in the primary view.

Not targeted: owners of smart controllers, commercial
landscapes, agriculture, gardens or drip systems, and
multi-property managers.

## Proposed Gap

Weather-based watering advice already exists (for example
WaterMyYard, Sonoma-Marin, Marin Water, and smart
controllers). Their current features and pricing have not
been independently re-verified for this project. The project
does not assert that any of them is deficient.

The differentiation hypothesis is narrow:

1. **Transparency.** Every recommendation shows the numbers
   behind it: rainfall received, rainfall expected, estimated
   demand, and the uncertainty in plain words.
2. **Stated-baseline accountability.** Estimated water
   avoided is always computed against the user's own
   baseline schedule, with the baseline and assumptions
   visible next to the figure.

**Assumption:** This combination of transparency and a
stated-baseline estimate, in a single mobile-first flow, is
worth building. The user validation exercise must confirm it
before any competitor comparison is claimed.

## MVP Scope (approved)

1. A single property profile, identified by a random ID kept
   in the browser; no accounts.
2. Onboarding: location, lawn area, grass and soil type,
   sprinkler type, precipitation rate (mm/h, prefilled from a
   per-type default and editable), last watered date and
   minutes, and the usual watering schedule (events per week
   and minutes per event).
3. A daily recommendation: SKIP, REDUCE, or WATER, a
   one-sentence reason, and an expandable "Why?" section with
   the numbers.
4. A "Cannot recommend" state with the reason and no
   recommendation when weather data is unavailable.
5. History with "followed / not followed" logging for recent
   recommendations.
6. Estimated water avoided over a chosen window, labeled
   "Estimated", against the stated baseline, with a baseline
   and assumptions expander. This is implemented separately
   from the recommendation engine.
7. Mobile-first web app. React + TypeScript frontend, Python
   FastAPI backend, SQLite storage, Open-Meteo weather data.

**Decision needed from Morax:** the target/demo region, and
whether the MVP must support more than one grass, soil, or
sprinkler type at launch.

## Non-Goals (approved)

- No sprinkler control and no hardware integration. The
  product only recommends; the homeowner decides.
- No user accounts, multi-user access, or multi-property
  management.
- No claims of measured water savings. Estimates only.
- No AI or LLM features.
- No native mobile app.
- No second weather provider.
- No notifications (approved 2026-11-04).
- Lawn only. No gardens, crops, drip irrigation, pools, or
  commercial landscapes (approved 2026-11-04).

## Success Criteria (proposed)

- The demo runs end to end at phone width: onboarding,
  today's recommendation, history logging, and estimated
  water avoided.
- The recommendation engine is verified by automated tests
  with hand-checked values, including the cannot-recommend
  path.
- Every recommendation can be explained from stored inputs,
  constants, and assumptions.
- Every savings figure is visibly labeled as an estimate
  with its baseline and assumptions.

**Decision needed from Morax:** any quantitative success
metric for the hackathon submission.
