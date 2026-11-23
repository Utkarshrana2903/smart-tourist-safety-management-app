# MoDoNER Command Center — Implementation Plan

## Product shape

A frontend-only React + TypeScript command center layered over the existing FastAPI + MySQL backend. The browser owns presentation state and calls a centralized service layer; the backend remains the source of truth for authentication, incidents, event timelines, risk zones, and health. A deliberately isolated mock adapter supplies demo data when `VITE_API_MODE=mock`, with a visible provenance badge.

## Design direction

- **Design movement:** Civic operations / quiet GIS control room — the visual language of a government emergency operations center rather than a SaaS admin panel.
- **Core principles:** priority before polish; scan in seconds; status is semantic and textual; calm surfaces with controlled urgency.
- **Color philosophy:** near-black blue-charcoal creates focus; slate surfaces create hierarchy; one restrained signal color per operational meaning (red emergency, amber warning, green healthy, blue selected/information).
- **Layout paradigm:** persistent command rail plus a broad working canvas. The dashboard is organized as an operational field: left queue, central map/situation surface, right detail rail, with dense summary strips rather than a centered marketing grid.
- **Signature elements:** the MoDoNER crosshair wordmark; blue coordinate ticks and thin cartographic rules; compact uppercase section labels paired with monospaced operational metadata.
- **Interaction philosophy:** selection synchronizes queue, map, and details; consequential actions require confirmation; transitions are quiet and reversible until backend success.
- **Animation:** short opacity/translate transitions only for panels and selection, with a restrained signal pulse on unacknowledged critical incidents; no decorative loops or neon effects.
- **Typography system:** Inter for readable command-center UI, IBM Plex Mono for IDs, coordinates, timestamps, and telemetry.
- **Brand essence:** A credible safety-operations layer that turns tourist SOS signals into coordinated response. Personality: vigilant, composed, accountable.
- **Brand voice:** direct and operational. Examples: “03 ACTIVE SOS SIGNALS REQUIRE REVIEW.” / “Backend status is verified from the source health endpoint.”
- **Wordmark & logo:** a simple crosshair / four-corner bracket mark paired with the MoDoNER wordmark; the mark is reused as the map focus glyph and login watermark.
- **Signature brand color:** Signal Blue `#4da7ff`, used sparingly for selected state and command affordances.

## Project structure

- `src/api/` — configurable API client and real/mock adapters.
- `src/types/` — shared incident, risk-zone, health, and operator models.
- `src/components/` — sidebar, top bar, status badges, map, incident cards, tables, detail/timeline, and dialogs.
- `src/App.tsx` — protected shell, navigation state, API orchestration, and workflow actions.
- `src/styles.css` — responsive command-center visual system.
- `public/manus-routes.json` — route manifest required by Webdev.
- `README.md` — run, configuration, backend contract, mock mode, and future WebSocket boundary.
