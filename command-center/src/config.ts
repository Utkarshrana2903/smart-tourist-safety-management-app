export const API_BASE_URL = (import.meta.env.VITE_API_BASE_URL || 'http://127.0.0.1:8000').replace(/\/$/, '')
export const API_MODE: 'real' | 'mock' = 'real'
const configuredPollMs = Number(import.meta.env.VITE_POLL_INTERVAL_MS)
export const POLL_INTERVAL_MS = Number.isFinite(configuredPollMs) && configuredPollMs >= 10_000 ? configuredPollMs : 30_000
const configuredTimeoutMs = Number(import.meta.env.VITE_API_TIMEOUT_MS)
export const API_TIMEOUT_MS = Number.isFinite(configuredTimeoutMs) && configuredTimeoutMs >= 3_000 ? configuredTimeoutMs : 12_000
export const APP_TITLE = 'MoDoNER â€” Tourist Safety Grid Command Center'

