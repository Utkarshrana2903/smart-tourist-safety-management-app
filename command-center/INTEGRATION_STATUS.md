# MoDoNER Command Center — Integration Handoff

## Implemented in the frontend

- Explicit `mock` and `real` data modes using `VITE_API_MODE`.
- Centralized FastAPI client with bearer authorization, request timeout, sanitized errors for common HTTP failures, and no silent mock fallback.
- Persistent live-mode failure banner with retry action; existing records remain visible during partial endpoint failures.
- Configurable polling with overlap protection and visibility-aware interval handling.
- Last complete update indicator and source-mode banner.
- Incident status, severity, transmission, text, coordinate and user-ID filtering over retrieved records.
- Timestamp sorting, client-side pagination, reset filters, and CSV export of retrieved fields only.
- Active incident queues exclude resolved records.
- Backend-derived health labels rather than fixed “Operational” claims.
- Session clearing when the backend reports an expired session.
- Existing acknowledgement and resolution workflows remain backend-confirmed, guarded by allowed frontend state transitions, loading states, confirmation for resolution, and success/error feedback.
- Existing map/list/detail synchronization, coordinate validation, risk-zone rendering, and per-incident event timeline preserved.

## Environment variables

```env
VITE_API_BASE_URL=http://127.0.0.1:8000
VITE_API_MODE=real
VITE_POLL_INTERVAL_MS=30000
VITE_API_TIMEOUT_MS=12000
```

`VITE_POLL_INTERVAL_MS` must be at least 10000 milliseconds. Do not expose backend secrets or database credentials in Vite variables.

## Windows local run

```powershell
Copy-Item .env.example .env.local
# Edit .env.local and set VITE_API_MODE=real
npm install
npm run dev
```

The command center runs at `http://localhost:3000`.

## Backend run expectation

Start the existing FastAPI project using its own documented environment and migration workflow, for example:

```powershell
# Run from the backend repository and virtual environment
alembic upgrade head
uvicorn app.main:app --reload --host 0.0.0.0 --port 8000
```

The exact module path may differ in the user's backend repository and should be taken from that repository's README. The API must allow the command-center origin through CORS for browser requests, including `http://localhost:3000` and `http://127.0.0.1:3000` as appropriate.

## Acceptance status

- Frontend dependency/build validation: **passed** with `npm run build`.
- Mock-mode overview, map, risk-zone, activity, notification, and incident-history surfaces: **verified in preview**.
- Incident filtering, sorting, pagination controls, and CSV export: **implemented; preview controls verified**.
- Real SOS appearance from MySQL/FastAPI: **unverified here; requires the user's running backend and Flutter-generated record**.
- Real login, expired-session behavior, acknowledgement, resolution, and authorization: **implemented against the documented contract but require the user's backend for end-to-end verification**.
- Backend outage, timeout, partial failure, and retry banner: **implemented; should be verified with the backend stopped or an unreachable `VITE_API_BASE_URL`**.
- Risk-zone values and circles from the real backend: **unverified here; mock rendering is verified**.

## Backend work still needed for future live features

- WebSocket or SSE events for push updates.
- Global activity-feed endpoint; current activity is derived from per-incident event histories.
- Incident assignment, escalation, operator notes, dispatch records, and audit logs.
- Server-side filtering, sorting, and pagination for large datasets.
- Secure audio/attachment retrieval.
- Detailed system metrics such as latency, uptime, CPU, memory, and throughput.
- Risk-zone creation/edit/deactivation endpoints.
- Fine-grained operator permissions if multiple command-center roles are introduced.
