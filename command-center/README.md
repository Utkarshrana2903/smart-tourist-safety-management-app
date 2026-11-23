# MoDoNER Tourist Safety Grid Command Center

A desktop-first emergency-operations frontend for the MoDoNER academic project (2026–27). This repository is intentionally **frontend-only**. It does not create a database, replace FastAPI, or duplicate incident storage. The existing FastAPI + MySQL service remains the source of truth.

## Run locally

```bash
npm install
npm run dev
```

The Vite dev server listens on port 3000. The app is designed for large command-center displays and remains usable at smaller widths.

## Configuration

Copy `.env.example` to `.env.local` when connecting to the real backend:

```bash
VITE_API_BASE_URL=http://127.0.0.1:8000
VITE_API_MODE=real
VITE_POLL_INTERVAL_MS=30000
VITE_API_TIMEOUT_MS=12000
```

`VITE_API_BASE_URL` is centralized in `src/config.ts` and defaults to `http://127.0.0.1:8000`. `VITE_API_MODE` is explicit: `mock` (the default for presentation/UI development) reads only from `src/api/mockData.ts`; `real` calls the FastAPI service. `VITE_POLL_INTERVAL_MS` defaults to 30 seconds and must be at least 10 seconds. `VITE_API_TIMEOUT_MS` defaults to 12 seconds. The UI displays a DEMO MODE banner whenever mock mode is active and never silently merges mock and real records.

## Backend contract used

The real adapter in `src/api/service.ts` calls:

- `POST /command-center/login` for operator-only authentication
- `GET /auth/me` when the current operator needs to be refreshed
- `GET /incidents` for incident records
- `GET /incidents/{incident_id}/events` for the chronological timeline
- `POST /incidents/{incident_id}/acknowledge`
- `POST /incidents/{incident_id}/resolve`
- `GET /risk-zones` for active backend-provided perimeters
- `GET /health` for backend and database source verification

Authorization headers are attached centrally by the API client. Requests have a timeout and user-facing errors are sanitized for 401, 403, 404, 409, 422, 429, 500, network failure, and unavailable backend cases; raw tracebacks, SQLAlchemy errors, JWT internals, and credentials are not exposed. Live mode shows a persistent retryable connection banner and preserves the last usable records during partial failures; it never falls back to demo data.

## Authentication

The command center has a dedicated operator login and does not offer tourist registration. In real mode, the returned JWT is stored in browser local storage for the session and attached as a Bearer token. Backend authorization remains authoritative. In mock mode, the “Enter demo console” action creates an isolated presentation session and clearly labels the data provenance.

## Architecture notes

The UI is split into domain types, a centralized API/mock service layer, and reusable operational components. The dashboard uses configurable polling, avoids overlapping requests, pauses interval work while the tab is hidden, and shows the last complete update. The real-time boundary is intentionally left as a future adapter: once FastAPI exposes WebSocket events such as `NEW_INCIDENT`, `INCIDENT_ACKNOWLEDGED`, and `INCIDENT_RESOLVED`, the polling coordinator can be replaced without rewriting the list/map/detail UI.

The map uses Leaflet with a natural OpenStreetMap-compatible basemap. Incident coordinates and risk-zone centers/radii are always data-driven. No predictive AI, tourist tracking, SMS fallback, or other future capability is presented as implemented.

## Demonstrator modules

The navigation also includes **Hazard reports**, **Tourist monitoring**, **Communications**, and **Analytics**. These are clearly marked as seeded demo/presentation surfaces because the current FastAPI contract does not expose hazard, tourist-monitoring, communications-statistics, or analytics endpoints. In `VITE_API_MODE=real`, those pages show a live API boundary message instead of inventing records. The Communications page documents the normal Internet → FastAPI → MySQL path and the SMS fallback scenario; Analytics labels predictive risk mapping and clustering as planned, not connected.

Global search covers currently loaded incident IDs, tourist IDs, coordinates, and backend-provided risk-zone names. Incident History supports status, severity, transmission, text search, timestamp sorting, client-side pagination, reset, and CSV export of retrieved records only. Notifications are seeded only in mock mode. Map layer controls are available for active SOS, risk zones, demo hazard reports, and a clearly disabled tourist-location layer until a real endpoint is connected.

## Backend capabilities still required

The current frontend can honestly use the existing contract, but these useful capabilities require additional backend work before they should be presented as live:

- WebSocket or SSE events for push updates.
- A global activity-feed endpoint; the current UI derives recent activity from per-incident event histories.
- Incident assignment, escalation, operator notes, dispatch records, and audit logs.
- Server-side filtering, sorting, and pagination for large incident volumes.
- Secure incident attachment/audio retrieval.
- Detailed system metrics such as latency, uptime, CPU, and memory.
- Risk-zone create/edit/deactivate endpoints.
