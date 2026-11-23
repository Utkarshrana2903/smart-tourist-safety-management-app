# MoDoNER Command Center Delivery Outcomes

- [ ] Operator-only login uses `POST /command-center/login`, stores the returned token for authenticated calls, does not offer tourist registration, shows friendly 401/403 feedback, and protects the command-center shell.
- [ ] Centralized configuration exposes `VITE_API_BASE_URL` defaulting to `http://127.0.0.1:8000` and an explicit `VITE_API_MODE` real/mock switch; API calls are isolated from UI components and the backend remains the source of truth.
- [ ] The overview displays current operational summaries, active SOS incidents, unacknowledged count, active risk-zone count, backend/database status, operator identity, last-updated telemetry, loading/error/empty states, and a compact activity feed.
- [ ] Active incidents are retrieved from `GET /incidents`, prioritized by status/severity/newest, and show incident ID, severity, status, timestamp, location, transmission method, and tourist ID with created incidents visually dominant.
- [ ] The situational-awareness map synchronizes list, map, and detail selection; incident coordinates and risk-zone centers/radii are data-driven; risk zones use red/amber/green semantics and have a clear legend.
- [ ] Incident details call `GET /incidents/{incident_id}/events`, show chronological event timeline and metadata, and provide acknowledge/resolve actions with confirmation, loading, duplicate-click protection, backend refresh, and concise success/error notifications.
- [ ] Incident history provides readable rows with search, status filter, severity filter, and date filter; resolved records remain available in history.
- [ ] Risk zones have a dedicated view with name, level, score, radius, active status, expiration, created and updated timestamps, plus map context; no AI predictions or fabricated tourist tracking are shown.
- [ ] System status calls `GET /health` and clearly reports backend API, database, authentication, map service, and live connection as operational/degraded/offline without falsely claiming unverified connectivity; polling and future WebSocket boundary are documented.
- [ ] The responsive desktop-first UI is accessible, uses semantic labels, strong contrast, clear focus states, restrained motion, professional command-center styling, reusable components, and the required MoDoNER browser title.
- [ ] README explains run, dependencies, API URL, authentication, endpoints, mock mode, real-data integration, and future WebSocket integration.
