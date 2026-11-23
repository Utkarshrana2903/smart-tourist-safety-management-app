import { API_BASE_URL, API_TIMEOUT_MS } from '../config'
import type {
  DashboardData,
  Hazard,
  HazardStatus,
  Health,
  Incident,
  IncidentEvent,
  RiskZone,
  Session,
  TouristMonitoring,
  AnalyticsPeriod,
  AnalyticsSummary,
} from '../types'

const TOKEN_KEY = 'modoner.command-center.token'
const OPERATOR_KEY = 'modoner.command-center.operator'

const readToken = () => localStorage.getItem(TOKEN_KEY)

export const saveSession = (session: Session) => {
  localStorage.setItem(TOKEN_KEY, session.token)
  localStorage.setItem(OPERATOR_KEY, JSON.stringify(session.operator))
}

export const clearSession = () => {
  localStorage.removeItem(TOKEN_KEY)
  localStorage.removeItem(OPERATOR_KEY)
}

export const getStoredSession = (): Session | null => {
  const token = readToken()
  if (!token) return null

  try {
    return {
      token,
      operator: JSON.parse(localStorage.getItem(OPERATOR_KEY) || '{}'),
    }
  } catch {
    return { token, operator: {} }
  }
}

const apiError = (status: number) => {
  if (status === 401) return 'Your session has expired. Please sign in again.'
  if (status === 403) return 'Command Center access is restricted to authorized operators.'
  if (status === 404) return 'The requested safety record could not be found.'
  if (status === 409) return 'The record changed before this action completed. Refresh and try again.'
  if (status === 422) return 'The request could not be validated.'
  if (status === 429) return 'Too many requests were sent. Wait briefly and try again.'
  if (status >= 500) return 'The MoDoNER backend returned a server error.'
  return 'Unable to complete the request.'
}

async function request<T>(path: string, init: RequestInit = {}): Promise<T> {
  const token = readToken()
  const headers = new Headers(init.headers)

  if (init.body && !(init.body instanceof FormData)) {
    headers.set('Content-Type', 'application/json')
  }
  if (token) headers.set('Authorization', `Bearer ${token}`)

  const controller = new AbortController()
  const timeout = window.setTimeout(() => controller.abort(), API_TIMEOUT_MS)
  let response: Response

  try {
    response = await fetch(`${API_BASE_URL}${path}`, {
      ...init,
      headers,
      signal: init.signal || controller.signal,
    })
  } catch (error) {
    if (error instanceof DOMException && error.name === 'AbortError') {
      throw new Error('The MoDoNER backend did not respond before the request timed out.')
    }
    throw new Error('Unable to connect to the MoDoNER backend.')
  } finally {
    window.clearTimeout(timeout)
  }

  if (!response.ok) throw new Error(apiError(response.status))
  return response.status === 204 ? (undefined as T) : response.json() as Promise<T>
}

export const loginCommandCenter = async (
  phone: string,
  password: string,
): Promise<Session> => {
  const response = await request<
    Session & { access_token?: string; user?: Session['operator'] }
  >('/command-center/login', {
    method: 'POST',
    body: JSON.stringify({ phone, password }),
  })

  const session: Session = {
    token: response.token || response.access_token || '',
    operator: response.operator || response.user || {
      phone,
      role: 'COMMAND_CENTER',
    },
  }

  if (!session.token) {
    throw new Error('The backend login response did not include an access token.')
  }

  saveSession(session)
  return session
}

export const getIncidentAudioBlob = async (id: number): Promise<Blob> => {
  const token = readToken()
  if (!token) throw new Error('Your session has expired. Please sign in again.')

  const controller = new AbortController()
  const timeout = window.setTimeout(() => controller.abort(), API_TIMEOUT_MS)

  try {
    const response = await fetch(`${API_BASE_URL}/incidents/${id}/audio`, {
      method: 'GET',
      headers: { Authorization: `Bearer ${token}` },
      signal: controller.signal,
    })

    if (!response.ok) throw new Error(apiError(response.status))
    return await response.blob()
  } catch (error) {
    if (error instanceof DOMException && error.name === 'AbortError') {
      throw new Error('The audio request timed out. Please try again.')
    }
    if (error instanceof Error) throw error
    throw new Error('Unable to load the incident audio.')
  } finally {
    window.clearTimeout(timeout)
  }
}

export const getCurrentUser = () => request('/auth/me')
export const getIncidents = (): Promise<Incident[]> => request('/incidents')
export const getRiskZones = (): Promise<RiskZone[]> => request('/risk-zones')
export const getTourists = (): Promise<TouristMonitoring[]> =>
  request('/command-center/tourists')
export const getHazards = (): Promise<Hazard[]> => request('/hazards')

export const getAnalyticsSummary = (
  period: AnalyticsPeriod = '30d',
): Promise<AnalyticsSummary> =>
  request(`/command-center/analytics/summary?period=${period}`)

export const updateHazardStatus = (
  id: number,
  status: HazardStatus,
  resolutionNote?: string,
): Promise<Hazard> =>
  request(`/hazards/${id}/status`, {
    method: 'PATCH',
    body: JSON.stringify({
      status,
      resolution_note: resolutionNote ?? null,
    }),
  })

export const getHealth = (): Promise<Health> => request('/health')

export const getIncidentEvents = (id: number): Promise<IncidentEvent[]> =>
  request(`/incidents/${id}/events`)

export const acknowledgeIncident = async (id: number) =>
  request(`/incidents/${id}/acknowledge`, { method: 'POST' })

export const resolveIncident = async (id: number) =>
  request(`/incidents/${id}/resolve`, { method: 'POST' })

// Temporary compatibility flag while demo-only UI branches are removed.
export const isMockMode = false
