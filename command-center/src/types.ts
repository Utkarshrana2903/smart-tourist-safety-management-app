export type IncidentStatus = 'CREATED' | 'ACKNOWLEDGED' | 'RESOLVED'
export type Severity = 'HIGH' | 'MEDIUM' | 'LOW'
export type RiskLevel = 'HIGH' | 'MEDIUM' | 'LOW'

export interface Incident {
  id: number
  user_id: number
  latitude: number
  longitude: number
  timestamp: string
  severity: Severity
  status: IncidentStatus
  transmission_method: string
  audio_url?: string | null
  created_at?: string
  resolved_at?: string | null
  resolution_source?: string | null
}

export interface IncidentEvent {
  id: number
  incident_id: number
  event_type: 'SOS_CREATED' | 'ACKNOWLEDGED' | 'RESOLVED' | string
  timestamp: string
  metadata?: Record<string, unknown> | null
}

export interface RiskZone {
  id: number
  name: string
  latitude: number
  longitude: number
  radius_meters: number
  risk_level: RiskLevel
  score: number
  is_active: boolean
  expires_at?: string | null
  created_at?: string
  updated_at?: string
}

export type HazardCategory =
  | 'ROAD_DAMAGE'
  | 'POOR_LIGHTING'
  | 'UNSAFE_AREA'
  | 'MEDICAL'
  | 'CROWDING'
  | 'OTHER'

export type HazardStatus =
  | 'PENDING_REVIEW'
  | 'VERIFIED'
  | 'RESOLVED'
  | 'REJECTED'

export interface Hazard {
  id: number
  reporter_user_id: number
  category: HazardCategory
  description: string
  latitude: number
  longitude: number
  severity: Severity
  status: HazardStatus
  reviewed_by_user_id: number | null
  reviewed_at: string | null
  resolution_note: string | null
  created_at: string
  updated_at: string
}

export interface TouristMonitoring {
  id: number
  name: string
  phone: string
  email: string | null
  date_of_birth: string | null
  age: number | null
  kyc_status: string
  registered_at: string

  total_incidents: number
  active_incidents: number

  latest_incident_id: number | null
  latest_incident_status: string | null
  latest_incident_severity: string | null

  last_location_latitude: number | null
  last_location_longitude: number | null
  last_location_recorded_at: string | null
  last_transmission_method: string | null
}

export interface Health {
  status: string
  database?: string
}

export interface Operator {
  id?: number
  phone?: string
  role?: string
  name?: string
}

export interface Session {
  token: string
  operator: Operator
}

export interface DashboardData {
  incidents: Incident[]
  riskZones: RiskZone[]
  hazards: Hazard[]
  health: Health | null
  events: Record<number, IncidentEvent[]>
}

export type AnalyticsPeriod = '7d' | '30d' | '90d' | 'all'

export interface AnalyticsKpis {
  incidents_in_period: number
  active_sos: number
  resolved_in_period: number
  hazards_in_period: number
  pending_hazards: number
  registered_tourists: number
}

export interface AnalyticsTrendPoint {
  bucket: string
  incidents: number
  hazards: number
}

export interface AnalyticsCountPoint {
  label: string
  count: number
}

export interface AnalyticsDurationMetric {
  average_seconds: number | null
  median_seconds: number | null
  samples: number
}

export interface AnalyticsSummary {
  period: AnalyticsPeriod
  start_date: string | null
  end_date: string
  generated_at: string
  trend_interval: 'day' | 'month'
  kpis: AnalyticsKpis
  incident_trend: AnalyticsTrendPoint[]
  incident_severity: AnalyticsCountPoint[]
  incident_status: AnalyticsCountPoint[]
  hazard_categories: AnalyticsCountPoint[]
  hazard_status: AnalyticsCountPoint[]
  transmission_methods: AnalyticsCountPoint[]
  acknowledgement_time: AnalyticsDurationMetric
  resolution_time: AnalyticsDurationMetric
}
