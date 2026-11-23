import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { Circle, CircleMarker, MapContainer, Popup, TileLayer, useMap } from 'react-leaflet'
import {
  Activity, AlertTriangle, ArrowUpRight, BarChart3, Bell, Check, CheckCircle2, ChevronRight, CircleDot, Clock3,
  Crosshair, Database, Globe2, History, KeyRound, Layers3, LogOut, Map as MapIcon,
  Menu, MessageSquareWarning, Radio, RefreshCw, Search, Server, ShieldCheck,
  Siren, SlidersHorizontal, Target, UserRound, Users, Wifi, X, Zap, Download,
} from 'lucide-react'
import type { ReactNode } from 'react'
import { BarChart } from './components/charts/bar-chart'
import { Bar } from './components/charts/bar'
import { BarXAxis } from './components/charts/bar-x-axis'
import { Grid } from './components/charts/grid'
import { ChartTooltip } from './components/charts/tooltip/chart-tooltip'
import { PieChart } from './components/charts/pie-chart'
import { PieSlice } from './components/charts/pie-slice'
import type {
  DashboardData,
  Hazard,
  HazardStatus,
  Incident,
  IncidentEvent,
  IncidentStatus,
  RiskLevel,
  RiskZone,
  TouristMonitoring,
  AnalyticsPeriod,
  AnalyticsSummary,
} from './types'
import { APP_TITLE, API_BASE_URL, API_MODE, POLL_INTERVAL_MS } from './config'
import {
  acknowledgeIncident,
  clearSession,
  getCurrentUser,
  getHazards,
  getIncidentEvents,
  getIncidents,
  getRiskZones,
  getHealth,
  getIncidentAudioBlob,
  getStoredSession,
  getTourists,
  isMockMode,
  loginCommandCenter,
  resolveIncident,
  updateHazardStatus,
  getAnalyticsSummary,
} from './api/service'

const center: [number, number] = [26.9124, 75.7873]

type View = 'overview' | 'incidents' | 'live-map' | 'risk-zones' | 'activity' | 'hazards' | 'tourists' | 'communications' | 'analytics' | 'system-status'
type Toast = { tone: 'success' | 'error' | 'info'; message: string }

const navItems: { id: View; label: string; icon: typeof Activity; hint?: string }[] = [
  { id: 'overview', label: 'Overview', icon: Activity, hint: 'Daily operations' },
  { id: 'incidents', label: 'Incidents', icon: Siren, hint: 'Incident history' },
  { id: 'live-map', label: 'Live map', icon: MapIcon, hint: 'Map and signals' },
  { id: 'risk-zones', label: 'Risk zones', icon: Layers3, hint: 'Geographic perimeters' },
  { id: 'activity', label: 'Activity', icon: History, hint: 'Recent activity' },
  { id: 'hazards', label: 'Hazards', icon: AlertTriangle, hint: 'Crowdsourced reports' },
  { id: 'tourists', label: 'Tourists', icon: Users, hint: 'Monitored travellers' },
  { id: 'communications', label: 'Communications', icon: Radio, hint: 'Connectivity and fallback' },
  { id: 'analytics', label: 'Analytics', icon: BarChart3, hint: 'Operational trends' },
  { id: 'system-status', label: 'System status', icon: Server, hint: 'System health' },
]

const severityRank: Record<string, number> = { HIGH: 3, MEDIUM: 2, LOW: 1 }
const statusRank: Record<string, number> = { CREATED: 3, ACKNOWLEDGED: 2, RESOLVED: 1 }


function parseApiDate(value: string): Date {
  // Backend timestamps without a timezone marker are stored in UTC.
  // Preserve timestamps that already include Z or an explicit offset.
  const hasTimezone = /(?:Z|[+-]\d{2}:?\d{2})$/i.test(value);

  return new Date(hasTimezone ? value : `${value}Z`);
}

function formatTime(value?: string | null) {
  if (!value) return 'â€”';

  return new Intl.DateTimeFormat('en-IN', {
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
    timeZone: 'Asia/Kolkata',
  }).format(parseApiDate(value));
}

function formatDate(value?: string | null) {
  if (!value) return 'â€”';

  return new Intl.DateTimeFormat('en-IN', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
    timeZone: 'Asia/Kolkata',
  }).format(parseApiDate(value));
}

function relativeTime(value?: string | null) {
  if (!value) return 'unknown';

  const minutes = Math.max(
    0,
    Math.round(
      (Date.now() - parseApiDate(value).getTime()) / 60_000,
    ),
  );

  if (minutes < 1) return 'just now';
  if (minutes < 60) return `${minutes}m ago`;

  const hours = Math.floor(minutes / 60);
  return `${hours}h ${minutes % 60}m ago`;
}

function titleCase(value: string) { return value.toLowerCase().replace(/_/g, ' ').replace(/\b\w/g, (letter) => letter.toUpperCase()) }
function severityClass(value: string) { return value.toLowerCase() }
function statusClass(value: string) { return value.toLowerCase() }
function coordinateNumber(value: unknown) { return typeof value === 'number' ? value : Number(value) }
function hasValidCoordinate(value: { latitude?: unknown; longitude?: unknown } | null | undefined) {
  if (!value) return false
  const latitude = coordinateNumber(value.latitude)
  const longitude = coordinateNumber(value.longitude)
  return Number.isFinite(latitude) && Number.isFinite(longitude) && latitude >= -90 && latitude <= 90 && longitude >= -180 && longitude <= 180
}

function StatusBadge({ status }: { status: IncidentStatus }) {
  const labels: Record<IncidentStatus, string> = { CREATED: 'Unacknowledged', ACKNOWLEDGED: 'Acknowledged', RESOLVED: 'Resolved' }
  return <span className={`status-badge ${statusClass(status)}`}><span className="status-dot" />{labels[status]}</span>
}
function SeverityBadge({ severity }: { severity: string }) { return <span className={`severity-badge ${severityClass(severity)}`}>{severity}</span> }

function MapFocus({ selected }: { selected?: Incident | RiskZone | Hazard | null }) {
  const map = useMap()

  useEffect(() => {
    if (
      selected &&
      'latitude' in selected &&
      'longitude' in selected &&
      hasValidCoordinate(selected)
    ) {
      map.flyTo(
        [coordinateNumber(selected.latitude), coordinateNumber(selected.longitude)],
        15,
        { duration: 0.65 },
      )
    }
  }, [map, selected])

  return null
}

function SituationMap({
  incidents,
  riskZones,
  hazards,
  selected,
  onSelectIncident,
  onSelectZone,
  onSelectHazard,
  compact = false,
  showResolvedIncidents = false,
}: {
  incidents: Incident[]
  riskZones: RiskZone[]
  hazards: Hazard[]
  selected: Incident | RiskZone | Hazard | null
  onSelectIncident: (incident: Incident) => void
  onSelectZone: (zone: RiskZone) => void
  onSelectHazard: (hazard: Hazard) => void
  compact?: boolean
  showResolvedIncidents?: boolean
}) {
  const [showIncidents, setShowIncidents] = useState(true)
  const [showZones, setShowZones] = useState(true)
  const [showHazards, setShowHazards] = useState(true)

  const mapCenter: [number, number] =
    selected && 'latitude' in selected && hasValidCoordinate(selected)
      ? [coordinateNumber(selected.latitude), coordinateNumber(selected.longitude)]
      : center

  return (
    <div className={`map-shell ${compact ? 'compact' : ''}`}>
      <MapContainer
        center={mapCenter}
        zoom={14}
        scrollWheelZoom
        className="map-canvas"
      >
        <TileLayer
          attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
          url="https://{s}.tile.openstreetmap.de/{z}/{x}/{y}.png"
        />

        <MapFocus selected={selected} />

        {showZones &&
          riskZones
            .filter((zone) => zone.is_active && hasValidCoordinate(zone))
            .map((zone) => {
              const color =
                zone.risk_level === 'HIGH'
                  ? '#d85858'
                  : zone.risk_level === 'MEDIUM'
                    ? '#d89b42'
                    : '#63b88a'

              return (
                <Circle
                  key={`zone-${zone.id}`}
                  center={[
                    coordinateNumber(zone.latitude),
                    coordinateNumber(zone.longitude),
                  ]}
                  radius={
                    Number.isFinite(Number(zone.radius_meters))
                      ? Number(zone.radius_meters)
                      : 0
                  }
                  pathOptions={{
                    color,
                    fillColor: color,
                    fillOpacity:
                      selected?.id === zone.id && 'risk_level' in selected
                        ? 0.26
                        : 0.12,
                    weight:
                      selected?.id === zone.id && 'risk_level' in selected
                        ? 2
                        : 1.2,
                    dashArray: '5 5',
                  }}
                  eventHandlers={{ click: () => onSelectZone(zone) }}
                />
              )
            })}

        {showIncidents &&
          incidents
            .filter(
              (incident) =>
                (showResolvedIncidents || incident.status !== 'RESOLVED') &&
                hasValidCoordinate(incident),
            )
            .map((incident) => {
              const isSelected =
                selected?.id === incident.id && 'user_id' in selected

              const color =
                incident.severity === 'HIGH'
                  ? '#ea5c62'
                  : incident.severity === 'MEDIUM'
                    ? '#e3aa4f'
                    : '#6fc295'

              return (
                <CircleMarker
                  key={`incident-${incident.id}`}
                  center={[
                    coordinateNumber(incident.latitude),
                    coordinateNumber(incident.longitude),
                  ]}
                  radius={
                    isSelected
                      ? 11
                      : incident.severity === 'HIGH'
                        ? 9
                        : 7
                  }
                  pathOptions={{
                    color: '#0a1116',
                    weight: 3,
                    fillColor: color,
                    fillOpacity: 1,
                  }}
                  eventHandlers={{
                    click: () => onSelectIncident(incident),
                  }}
                >
                  <Popup>
                    <strong>SOS #{incident.id}</strong>
                    <br />
                    {incident.severity} Â· {titleCase(incident.status)}
                    <br />
                    Tourist #{incident.user_id}
                  </Popup>
                </CircleMarker>
              )
            })}

        {showHazards && (
            hazards
              .filter((hazard) => hasValidCoordinate(hazard))
              .map((hazard) => {
                const isSelected =
                  selected?.id === hazard.id &&
                  'reporter_user_id' in selected

                const color =
                  hazard.severity === 'HIGH'
                    ? '#d85858'
                    : hazard.severity === 'MEDIUM'
                      ? '#d2af61'
                      : '#63b88a'

                return (
                  <CircleMarker
                    key={`hazard-${hazard.id}`}
                    center={[
                      coordinateNumber(hazard.latitude),
                      coordinateNumber(hazard.longitude),
                    ]}
                    radius={isSelected ? 10 : 6}
                    pathOptions={{
                      color: '#8b6b37',
                      weight: isSelected ? 3 : 2,
                      fillColor: color,
                      fillOpacity: 1,
                    }}
                    eventHandlers={{
                      click: () => onSelectHazard(hazard),
                    }}
                  >
                    <Popup>
                      <strong>
                        HAZ-{String(hazard.id).padStart(3, '0')}
                      </strong>
                      <br />
                      {hazard.category.replace(/_/g, ' ')}
                      <br />
                      {hazard.severity} Â· {hazard.status.replace(/_/g, ' ')}
                      <br />
                      {hazard.description}
                      <br />
                      Reported: {formatDate(hazard.created_at)}
                      <br />
                      {relativeTime(hazard.created_at)}
                    </Popup>
                  </CircleMarker>
                )
              })
          )}

      </MapContainer>

      <div className="map-overlay map-coords">
        <Crosshair size={13} /> 26.9124Â° N Â· 75.7873Â° E
      </div>

      <div className="map-overlay map-source">
        <Globe2 size={12} /> OpenStreetMap-compatible / live layer
      </div>

      {!compact && (
        <div className="map-layers">
          <strong>Map layers</strong>
          <label>
            <input
              type="checkbox"
              checked={showIncidents}
              onChange={(event) => setShowIncidents(event.target.checked)}
            />{' '}
            Active SOS
          </label>
          <label>
            <input
              type="checkbox"
              checked={showZones}
              onChange={(event) => setShowZones(event.target.checked)}
            />{' '}
            Risk zones
          </label>
          <label>
            <input
              type="checkbox"
              checked={showHazards}
              onChange={(event) => setShowHazards(event.target.checked)}
            />{' '}
            Hazard reports
          </label>
          <label className="disabled-layer">
            <input type="checkbox" disabled /> Tourist locations
          </label>
        </div>
      )}

      {!compact && (
        <div className="map-legend">
          <span><i className="legend-dot sos high" /> SOS high</span>
          <span><i className="legend-dot sos medium" /> SOS medium</span>
          <span><i className="legend-dot sos low" /> SOS low</span>
          <span><i className="legend-ring high" /> high zone</span>
          <span><i className="legend-ring medium" /> medium zone</span>
          <span><i className="legend-ring low" /> low zone</span>
          <span><i className="legend-dot hazard" /> hazard report</span>
        </div>
      )}
    </div>
  )
}

function MetricCard({ label, value, sub, tone, icon: Icon, onClick }: { label: string; value: string | number; sub: string; tone?: string; icon: typeof Activity; onClick?: () => void }) {
  return <button className={`metric-card ${tone || ''}`} onClick={onClick}><div className="metric-top"><span>{label}</span><Icon size={16} /></div><strong>{value}</strong><div className="metric-sub">{sub}</div></button>
}

function IncidentRow({ incident, selected, onSelect }: { incident: Incident; selected: boolean; onSelect: () => void }) {
  return <button className={`incident-row ${selected ? 'selected' : ''} ${incident.status === 'CREATED' ? 'urgent-row' : ''}`} onClick={onSelect}>
    <div className="incident-row-head"><span className="incident-id"><span className={`incident-signal ${severityClass(incident.severity)}`} /> SOS #{incident.id}</span><SeverityBadge severity={incident.severity} /></div>
    <div className="incident-row-meta"><span>Tourist #{incident.user_id}</span><span>{relativeTime(incident.timestamp)}</span></div>
    <div className="incident-row-coord"><Crosshair size={12} /> {incident.latitude.toFixed(4)}, {incident.longitude.toFixed(4)} <span className="row-chevron"><ChevronRight size={14} /></span></div>
  </button>
}

function IncidentList({ incidents, selected, onSelect, showResolved = false }: { incidents: Incident[]; selected: Incident | null; onSelect: (incident: Incident) => void; showResolved?: boolean }) {
  const visible = showResolved ? incidents : incidents.filter((incident) => incident.status !== 'RESOLVED')
  if (!visible.length) return <div className="empty-state compact-empty"><CheckCircle2 size={24} /><strong>NO ACTIVE EMERGENCIES</strong><span>All monitored incidents are currently resolved.</span></div>
  return <div className="incident-list">{visible.map((incident) => <IncidentRow key={incident.id} incident={incident} selected={selected?.id === incident.id} onSelect={() => onSelect(incident)} />)}</div>
}


function DetailPanel({
  incident,
  events,
  eventsLoading,
  eventError,
  onRetryEvents,
  onAcknowledge,
  onResolve,
  actionLoading,
}: {
  incident: Incident | null;
  events: IncidentEvent[];
  eventsLoading: boolean;
  eventError: string | null;
  onRetryEvents: () => void;
  onAcknowledge: () => void;
  onResolve: () => void;
  actionLoading: string | null;
}) {
  const [audioObjectUrl, setAudioObjectUrl] = useState<string | null>(null)
  const [audioLoading, setAudioLoading] = useState(false)
  const [audioError, setAudioError] = useState<string | null>(null)
  const [audioLoadAttempt, setAudioLoadAttempt] = useState(0)

  useEffect(() => {
    let cancelled = false
    let objectUrl: string | null = null

    setAudioObjectUrl(null)
    setAudioError(null)

    if (!incident || !incident.audio_url) {
      setAudioLoading(false)
      return () => {
        cancelled = true
      }
    }

    setAudioLoading(true)

    getIncidentAudioBlob(incident.id)
      .then((blob) => {
        if (cancelled) return

        objectUrl = URL.createObjectURL(blob)
        setAudioObjectUrl(objectUrl)
      })
      .catch((error: unknown) => {
        if (!cancelled) {
          setAudioError(
            error instanceof Error
              ? error.message
              : 'Unable to load the incident audio.',
          )
        }
      })
      .finally(() => {
        if (!cancelled) setAudioLoading(false)
      })

    return () => {
      cancelled = true
      if (objectUrl) URL.revokeObjectURL(objectUrl)
    }
  }, [incident?.id, incident?.audio_url, audioLoadAttempt])

  if (!incident) {
    return (
      <div className="detail-empty">
        <Target size={28} />
        <strong>Select an incident</strong>
        <span>
          Choose an SOS signal from the queue or map to open its response record.
        </span>
      </div>
    );
  }

  const isCreated = incident.status === 'CREATED';
  const orderedEvents = [...events].sort(
    (a, b) =>
      parseApiDate(a.timestamp).getTime() -
      parseApiDate(b.timestamp).getTime(),
  );

  return (
    <div className="detail-panel">
      <div className="detail-head">
        <div>
          <div className="eyebrow">Response record</div>
          <h2>Incident #{incident.id}</h2>
        </div>
      </div>

      <div className="detail-callout">
        <div className={`callout-mark ${severityClass(incident.severity)}`}>
          <Siren size={19} />
        </div>
        <div>
          <strong>
            {isCreated
              ? 'Immediate operator review required'
              : incident.status === 'ACKNOWLEDGED'
                ? 'Response team engaged'
                : 'Record closed'}
          </strong>
          <span>
            {isCreated
              ? 'The SOS has not been acknowledged.'
              : `Last updated ${relativeTime(incident.timestamp)}.`}
          </span>
        </div>
      </div>

      <div className="detail-grid">
        <div>
          <span>Status</span>
          <StatusBadge status={incident.status} />
        </div>

        {incident.status === 'RESOLVED' && (
          <div>
            <span>RESOLVED BY</span>
            <strong>
              {incident.resolution_source
                ? titleCase(incident.resolution_source)
                : 'Not recorded'}
            </strong>
          </div>
        )}

        <div>
          <span>SEVERITY</span>
          <SeverityBadge severity={incident.severity} />
        </div>

        <div>
          <span>TOURIST</span>
          <strong>#{incident.user_id}</strong>
        </div>

        <div>
          <span>TRANSMISSION</span>
          <strong>{incident.transmission_method.replace('_', ' ')}</strong>
        </div>

        <div className="wide">
          <span>LOCATION</span>
          <strong className="mono">
            {incident.latitude.toFixed(4)}, {incident.longitude.toFixed(4)}
          </strong>
          <small className="detail-helper">
            Coordinates supplied with this SOS at {formatDate(incident.timestamp)}.
            This is a recorded SOS location, not continuous GPS tracking.
          </small>
        </div>

        <div className="wide">
          <span>CREATED</span>
          <strong>
            {formatDate(incident.created_at || incident.timestamp)}
          </strong>
        </div>
      </div>

      <div className="detail-audio-section">
        <div className="section-label">
          <span>INCIDENT AUDIO</span>
          <span className="timeline-count">
            {incident.audio_url ? 'CLIP ATTACHED' : 'NO CLIP'}
          </span>
        </div>

        {audioLoading ? (
          <p className="detail-audio-note">Loading private audio clip...</p>
        ) : audioObjectUrl ? (
          <audio
            className="incident-audio-player"
            controls
            preload="metadata"
            src={audioObjectUrl}
          >
            Your browser does not support audio playback.
          </audio>
        ) : audioError ? (
          <div className="detail-audio-error">
            <span>{audioError}</span>
            <button
              type="button"
              className="small-action"
              onClick={() => setAudioLoadAttempt((attempt) => attempt + 1)}
            >
              Retry audio
            </button>
          </div>
        ) : (
          <p className="detail-audio-note">
            {incident.audio_url
              ? 'Audio is not currently available.'
              : 'No audio clip is attached to this incident.'}
          </p>
        )}
      </div>

      <div className="detail-actions">
        {isCreated && (
          <button
            className="primary-action"
            disabled={!!actionLoading}
            onClick={onAcknowledge}
          >
            {actionLoading === 'acknowledge' ? (
              <RefreshCw className="spin" size={15} />
            ) : (
              <Check size={15} />
            )}
            ACKNOWLEDGE INCIDENT
          </button>
        )}

        {incident.status === 'ACKNOWLEDGED' && (
          <button
            className="resolve-action"
            disabled={!!actionLoading}
            onClick={onResolve}
          >
            {actionLoading === 'resolve' ? (
              <RefreshCw className="spin" size={15} />
            ) : (
              <CheckCircle2 size={15} />
            )}
            RESOLVE INCIDENT
          </button>
        )}
      </div>

      <div className="timeline-section">
        <div className="section-label">
          <span>EVENT TIMELINE</span>
          <span className="timeline-count">{events.length} events</span>
        </div>

        {events.length ? (
          <div className="timeline">
            {orderedEvents.map((event) => (
              <div className="timeline-item" key={event.id}>
                <div className={`timeline-icon ${event.event_type.toLowerCase()}`}>
                  <CircleDot size={12} />
                </div>
                <div>
                  <strong>{titleCase(event.event_type)}</strong>
                  <span>{formatDate(event.timestamp)}</span>
                  {Object.entries(event.metadata ?? {})
                    .filter(
                      ([, value]) =>
                        value !== null &&
                        ['string', 'number', 'boolean'].includes(typeof value),
                    )
                    .map(([key, value]) => (
                      <small className="timeline-metadata" key={key}>
                        {titleCase(key)}: {String(value)}
                      </small>
                    ))}
                </div>
              </div>
            ))}
          </div>
        ) : (
          <div className="inline-loading">
            {eventsLoading ? (
              'Loading event history...'
            ) : eventError ? (
              <>
                <span>{eventError}</span>
                <button className="text-action" onClick={onRetryEvents}>
                  Retry timeline
                </button>
              </>
            ) : (
              'No event history has been recorded for this incident.'
            )}
          </div>
        )}
      </div>
    </div>
  );
}


function LoginScreen({ onLogin }: { onLogin: (phone: string, password: string) => Promise<void> }) {
  const [phone, setPhone] = useState('')
  const [password, setPassword] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const submit = async () => { setBusy(true); setError(''); try { await onLogin(phone, password) } catch (err) { setError(err instanceof Error ? err.message : 'Unable to sign in.') } finally { setBusy(false) } }
  return <main className="login-screen"><div className="login-grid" /><div className="login-watermark"><Crosshair size={260} strokeWidth={0.55} /></div><section className="login-card"><div className="login-brand"><span className="brand-mark"><Crosshair size={24} /></span><div><strong>MoDoNER</strong><span>TOURIST SAFETY GRID</span></div></div><div className="login-rule" /><div className="login-kicker"><span className="live-dot" /> COMMAND CENTER <span>Â·</span> OPERATOR ACCESS</div><h1>Protect the route.<br /><em>Coordinate the response.</em></h1><p className="login-copy">A focused operations layer for tourist safety incidents, risk zones, and verified system health.</p><form onSubmit={(event) => { event.preventDefault(); void submit() }}><label>Operator phone or email<input value={phone} onChange={(event) => setPhone(event.target.value)} autoComplete="username" /></label><label>Access password<input value={password} onChange={(event) => setPassword(event.target.value)} type="password" autoComplete="current-password" /></label>{error && <div className="form-error"><AlertTriangle size={15} /> {error}</div>}<button className="login-button" disabled={busy}>{busy ? <RefreshCw className="spin" size={16} /> : <KeyRound size={16} />} SIGN IN TO COMMAND CENTER</button></form><div className="login-foot"><span><ShieldCheck size={13} /> Operator-only interface</span><span><Wifi size={13} /> API base {API_MODE === 'mock' ? 'demo adapter' : API_BASE_URL}</span></div></section><div className="login-footer"><span>MoDoNER / ACADEMIC SESSION 2026â€“27</span><span>COMMAND CENTER BUILD 01.0</span></div></main>
}

function TopBar({ view, operator, health, incidents, riskZones, onIncident, onZone, onRefresh, onLogout, refreshing }: { view: View; operator: { name?: string; role?: string }; health: DashboardData['health']; incidents: Incident[]; riskZones: RiskZone[]; onIncident: (incident: Incident) => void; onZone: (zone: RiskZone) => void; onRefresh: () => void; onLogout: () => void; refreshing: boolean }) {
  const item = navItems.find((entry) => entry.id === view) || navItems[0]
  const connectivity = isMockMode ? 'DEMO DATA' : health?.status === 'healthy' ? 'LIVE Â· API connected' : health ? 'DEGRADED' : 'OFFLINE'
  return <header className="topbar"><div className="topbar-title"><span className="crumb">OPERATIONS /</span><h1>{item.label}</h1></div><div className="topbar-actions"><CommandTools incidents={incidents} riskZones={riskZones} onIncident={onIncident} onZone={onZone} /><div className="sync-state"><span className={`live-dot ${connectivity === 'OFFLINE' ? 'offline' : ''}`} /> {connectivity} <small>Â· {new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', hour12: false })}</small></div><button className="icon-button" onClick={onRefresh} title="Refresh command center"> <RefreshCw size={16} className={refreshing ? 'spin' : ''} /></button><div className="operator-chip"><span className="operator-avatar">{(operator.name || 'OP').split(' ').map((part) => part[0]).slice(0, 2).join('')}</span><span><strong>{operator.name || 'Operator'}</strong><small>{operator.role || 'COMMAND_CENTER'}</small></span></div><button className="logout-button" onClick={onLogout}><LogOut size={15} /> <span>Log out</span></button></div></header>
}

function Sidebar({ view, setView, onLogout, operator }: { view: View; setView: (view: View) => void; onLogout: () => void; operator: { name?: string; role?: string } }) {
  const renderNav = (items: typeof navItems) => items.map(({ id, label, icon: Icon, hint }) => <button key={id} className={`nav-item ${view === id ? 'active' : ''}`} onClick={() => setView(id)}><Icon size={17} /><span><strong>{label}</strong><small>{hint}</small></span>{view === id && <ChevronRight size={14} className="nav-arrow" />}</button>)
  return <aside className="sidebar"><div className="sidebar-brand"><span className="brand-mark"><Crosshair size={24} /></span><div><strong>MoDoNER</strong><span>TOURIST SAFETY GRID</span></div></div><div className="sidebar-mode"><span className="live-dot" /> COMMAND CENTER <span>v1.0</span></div><nav><div className="nav-section-title">Operational view</div>{renderNav(navItems.slice(0, 5))}<div className="nav-section-title nav-advanced-title">System</div>{renderNav([navItems[9]])}<div className="nav-section-title nav-advanced-title">Optional / advanced</div>{renderNav(navItems.slice(5, 9))}</nav><div className="sidebar-bottom"><div className="sidebar-divider" /><div className="sidebar-status"><span className="status-dot healthy" /><span><strong>System operational</strong><small>Polling every 30 sec</small></span></div><div className="profile-row"><span className="operator-avatar">{(operator.name || 'OP').split(' ').map((part) => part[0]).slice(0, 2).join('')}</span><span><strong>{operator.name || 'Operator'}</strong><small>Authorized operator</small></span></div><button className="sidebar-logout" onClick={onLogout}><LogOut size={15} /> Sign out</button></div></aside>
}

function ActivityFeed({ incidents, events }: { incidents: Incident[]; events: Record<number, IncidentEvent[]> }) {
  const items = incidents.flatMap((incident) => (events[incident.id] || []).map((event) => ({ ...event, incident }))).sort((a, b) => parseApiDate(b.timestamp).getTime() - parseApiDate(a.timestamp).getTime()).slice(0, 6)
  return <div className="activity-feed">{items.map((item) => <div className="feed-item" key={`${item.incident_id}-${item.id}`}><span className={`feed-icon ${item.event_type.toLowerCase()}`}>{item.event_type === 'SOS_CREATED' ? <Siren size={13} /> : item.event_type === 'ACKNOWLEDGED' ? <Check size={13} /> : <CheckCircle2 size={13} />}</span><div><strong>SOS #{item.incident_id} {item.event_type === 'SOS_CREATED' ? 'created' : item.event_type === 'ACKNOWLEDGED' ? 'acknowledged' : 'resolved'}</strong><span>{formatTime(item.timestamp)} Â· Tourist #{item.incident.user_id}</span></div></div>)}</div>
}

function RiskZoneCard({ zone, onSelect }: { zone: RiskZone; onSelect: () => void }) { return <button className="risk-card" onClick={onSelect}><div className="risk-card-head"><div><span className={`risk-index ${zone.risk_level.toLowerCase()}`}>{zone.risk_level === 'HIGH' ? '01' : zone.risk_level === 'MEDIUM' ? '02' : '03'}</span><strong>{zone.name}</strong></div><span className={`risk-pill ${zone.risk_level.toLowerCase()}`}>{zone.risk_level}</span></div><div className="risk-card-stats"><div><span>Risk score</span><strong>{zone.score.toFixed(2)}</strong></div><div><span>Radius</span><strong>{zone.radius_meters}m</strong></div><div><span>Status</span><strong>{zone.is_active ? 'Active' : 'Inactive'}</strong></div></div><div className="risk-card-foot"><span>Updated {relativeTime(zone.updated_at)}</span><ChevronRight size={15} /></div></button> }

function IncidentsTable({ incidents, onSelect }: { incidents: Incident[]; onSelect: (incident: Incident) => void }) {
  const [query, setQuery] = useState('')
  const [status, setStatus] = useState('ALL')
  const [severity, setSeverity] = useState('ALL')
  const [transmission, setTransmission] = useState('ALL')
  const [sort, setSort] = useState<'newest' | 'oldest'>('newest')
  const [page, setPage] = useState(1)
  const filtered = incidents.filter((incident) => `${incident.id} ${incident.user_id} ${incident.latitude} ${incident.longitude} ${incident.status} ${incident.transmission_method}`.toLowerCase().includes(query.toLowerCase())).filter((incident) => status === 'ALL' || incident.status === status).filter((incident) => severity === 'ALL' || incident.severity === severity).filter((incident) => transmission === 'ALL' || incident.transmission_method === transmission)
  const ordered = [...filtered].sort((a, b) => sort === 'newest' ? parseApiDate(b.timestamp).getTime() - parseApiDate(a.timestamp).getTime() : parseApiDate(a.timestamp).getTime() - parseApiDate(b.timestamp).getTime())
  const pageSize = 10
  const totalPages = Math.max(1, Math.ceil(ordered.length / pageSize))
  const visible = ordered.slice((page - 1) * pageSize, page * pageSize)
  const reset = () => { setQuery(''); setStatus('ALL'); setSeverity('ALL'); setTransmission('ALL'); setSort('newest'); setPage(1) }
  const exportCsv = () => { const header = ['incident_id', 'user_id', 'status', 'severity', 'latitude', 'longitude', 'transmission_method', 'timestamp']; const rows = ordered.map((incident) => [incident.id, incident.user_id, incident.status, incident.severity, incident.latitude, incident.longitude, incident.transmission_method, incident.timestamp]); const csv = [header, ...rows].map((row) => row.map((value) => `"${String(value).replace(/"/g, '""')}"`).join(',')).join('\n'); const url = URL.createObjectURL(new Blob([csv], { type: 'text/csv;charset=utf-8' })); const link = document.createElement('a'); link.href = url; link.download = `modoner-incidents-${new Date().toISOString().slice(0, 10)}.csv`; link.click(); URL.revokeObjectURL(url) }
  return <div className="table-panel"><div className="table-toolbar"><label className="search-box"><Search size={15} /><input placeholder="Search ID, user, status, coordinates" value={query} onChange={(event) => { setQuery(event.target.value); setPage(1) }} /></label><select value={status} onChange={(event) => { setStatus(event.target.value); setPage(1) }}><option value="ALL">All statuses</option><option value="CREATED">Created</option><option value="ACKNOWLEDGED">Acknowledged</option><option value="RESOLVED">Resolved</option></select><select value={severity} onChange={(event) => { setSeverity(event.target.value); setPage(1) }}><option value="ALL">All severities</option><option value="HIGH">High</option><option value="MEDIUM">Medium</option><option value="LOW">Low</option></select><select value={transmission} onChange={(event) => { setTransmission(event.target.value); setPage(1) }}><option value="ALL">All transmission</option>{Array.from(new Set(incidents.map((incident) => incident.transmission_method))).map((method) => <option key={method} value={method}>{method.replace('_', ' ')}</option>)}</select><select value={sort} onChange={(event) => setSort(event.target.value as 'newest' | 'oldest')}><option value="newest">Newest first</option><option value="oldest">Oldest first</option></select><button className="table-reset" onClick={reset}>Reset</button><button className="table-export" onClick={exportCsv} disabled={!ordered.length}><Download size={14} /> CSV</button></div><div className="table-scroll"><table><thead><tr><th>Incident</th><th>Status</th><th>Severity</th><th>Tourist</th><th>Location</th><th>Transmission</th><th>Timestamp</th><th /></tr></thead><tbody>{visible.map((incident) => <tr key={incident.id} onClick={() => onSelect(incident)}><td><strong className="mono">SOS #{incident.id}</strong></td><td><StatusBadge status={incident.status} /></td><td><SeverityBadge severity={incident.severity} /></td><td className="mono">#{incident.user_id}</td><td className="mono">{incident.latitude.toFixed(4)}, {incident.longitude.toFixed(4)}</td><td>{incident.transmission_method.replace('_', ' ')}</td><td className="mono">{formatDate(incident.timestamp)}</td><td><ChevronRight size={15} /></td></tr>)}</tbody></table>{!ordered.length && <div className="empty-state table-empty"><Search size={22} /><strong>No matching incident records</strong><span>Try another search or reset the filters.</span></div>}</div><div className="table-footer"><span>Showing {visible.length} of {ordered.length} retrieved records</span><div><button disabled={page <= 1} onClick={() => setPage((current) => Math.max(1, current - 1))}>Previous</button><strong>Page {Math.min(page, totalPages)} / {totalPages}</strong><button disabled={page >= totalPages} onClick={() => setPage((current) => Math.min(totalPages, current + 1))}>Next</button></div></div></div>
}

const demoHazards: Array<{
  id: string
  category: string
  location: string
  reportedBy: string
  time: string
  status: string
  severity: string
  description: string
}> = []

const demoTourists: Array<{
  id: string
  status: string
  location: string
  update: string
  zone: string
  connection: string
  sos: string
}> = []

const demoNotifications: Array<{
  title: string
  body: string
  time: string
  tone: string
}> = []

function DemoOnlyNotice({ children }: { children: ReactNode }) {
  if (!isMockMode) return <div className="feature-boundary"><ShieldCheck size={20} /><div><strong>Live API boundary</strong><span>{children} is a planned adapter surface. No demo records are shown while real API mode is active.</span></div></div>
  return <div className="feature-boundary demo"><MessageSquareWarning size={20} /><div><strong>Demo / presentation data</strong><span>{children} uses seeded examples only. Backend endpoints are not claimed to exist.</span></div></div>
}

function HazardsPage({
  onShowMap,
}: {
  onShowMap: (hazard: Hazard) => void
}) {
  const [hazards, setHazards] = useState<Hazard[]>([])
  const [loading, setLoading] = useState(!isMockMode)
  const [error, setError] = useState<string | null>(null)
  const [busyId, setBusyId] = useState<number | null>(null)

  const loadHazards = useCallback(async () => {
    if (isMockMode) return

    setLoading(true)
    setError(null)

    try {
      const result = await getHazards()
      setHazards(result)
    } catch (err) {
      setError(
        err instanceof Error
          ? err.message
          : 'Unable to load hazard reports.',
      )
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    void loadHazards()
  }, [loadHazards])

  const handleStatusChange = async (
    hazard: Hazard,
    nextStatus: HazardStatus,
  ) => {
    const action =
      nextStatus === 'VERIFIED'
        ? 'verify'
        : nextStatus === 'RESOLVED'
          ? 'resolve'
          : 'reject'

    if (!window.confirm(`${action} hazard report #${hazard.id}?`)) {
      return
    }

    setBusyId(hazard.id)
    setError(null)

    try {
      await updateHazardStatus(hazard.id, nextStatus)
      await loadHazards()
    } catch (err) {
      setError(
        err instanceof Error
          ? err.message
          : 'Unable to update the hazard report.',
      )
    } finally {
      setBusyId(null)
    }
  }

  const statusLabel = (status: HazardStatus) => {
    switch (status) {
      case 'PENDING_REVIEW':
        return 'Pending review'
      case 'VERIFIED':
        return 'Verified'
      case 'RESOLVED':
        return 'Resolved'
      case 'REJECTED':
        return 'Rejected'
    }
  }

  const statusClass = (status: HazardStatus) => {
    if (status === 'VERIFIED') return 'acknowledged'
    if (status === 'RESOLVED') return 'resolved'
    return 'created'
  }

  const actionStyle: React.CSSProperties = {
    display: 'inline-flex',
    width: 'auto',
    padding: '6px 8px',
    marginRight: '6px',
    marginBottom: '4px',
    fontSize: '9px',
    cursor: 'pointer',
  }

  return (
    <>
      <div className="page-intro">
        <div>
          <div className="eyebrow">
            {isMockMode ? 'Crowdsourced reports / demo adapter' : 'Live reports / backend connected'}
          </div>
          <h2>Hazard reports</h2>
          <p>
            Review location-based reports submitted by tourists and field users.
          </p>
        </div>

        <div className="map-mode">
          <AlertTriangle size={14} />
          {isMockMode
            ? '03 demo reports'
            : `${hazards.length} live reports`}
        </div>
      </div>

      {isMockMode ? (
        <>
          <DemoOnlyNotice>Hazard reports</DemoOnlyNotice>

          <section className="panel feature-table-panel">
            <div className="panel-heading">
              <div>
                <div className="eyebrow">Report register</div>
                <h3>Demo reports</h3>
              </div>
              <span className="mini-label">MOCK ONLY</span>
            </div>

            <div className="table-scroll">
              <table>
                <thead>
                  <tr>
                    <th>Hazard</th>
                    <th>Category</th>
                    <th>Location</th>
                    <th>Reported by</th>
                    <th>Status</th>
                    <th>Severity</th>
                    <th>Time</th>
                  </tr>
                </thead>
                <tbody>
                  {demoHazards.map((hazard) => (
                    <tr key={hazard.id}>
                      <td>
                        <strong>{hazard.id}</strong>
                        <br />
                        <span className="table-muted">
                          {hazard.description}
                        </span>
                      </td>
                      <td>{hazard.category}</td>
                      <td>{hazard.location}</td>
                      <td>{hazard.reportedBy}</td>
                      <td>
                        <span
                          className={`status-badge ${
                            hazard.status === 'Verified'
                              ? 'acknowledged'
                              : hazard.status === 'Resolved'
                                ? 'resolved'
                                : 'created'
                          }`}
                        >
                          <span className="status-dot" />
                          {hazard.status}
                        </span>
                      </td>
                      <td>
                        <SeverityBadge severity={hazard.severity} />
                      </td>
                      <td className="mono">{hazard.time} IST</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </section>
        </>
      ) : (
        <section className="panel feature-table-panel">
          <div className="panel-heading">
            <div>
              <div className="eyebrow">Live report register</div>
              <h3>Reports submitted by tourists</h3>
            </div>

            <button
              className="text-action"
              onClick={() => void loadHazards()}
              disabled={loading}
            >
              <RefreshCw size={13} />
              Refresh
            </button>
          </div>

          {error && (
            <div
              role="alert"
              style={{
                padding: '14px 0',
                color: 'var(--red)',
                fontSize: '11px',
              }}
            >
              {error}
            </div>
          )}

          {loading ? (
            <div className="inline-loading">
              Loading live hazard reportsâ€¦
            </div>
          ) : hazards.length === 0 ? (
            <div className="empty-state">
              <AlertTriangle size={18} />
              <strong>No hazard reports found</strong>
              <span>
                New tourist submissions will appear here after they reach the backend.
              </span>
            </div>
          ) : (
            <div className="table-scroll">
              <table>
                <thead>
                  <tr>
                    <th>Report</th>
                    <th>Category</th>
                    <th>Description</th>
                    <th>Coordinates</th>
                    <th>Status</th>
                    <th>Severity</th>
                    <th>Submitted</th>
                    <th>Actions</th>
                  </tr>
                </thead>

                <tbody>
                  {hazards.map((hazard) => (
                    <tr key={hazard.id}>
                      <td>
                        <strong>HAZ-{hazard.id}</strong>
                        <br />
                        <span className="table-muted">
                          Tourist #{hazard.reporter_user_id}
                        </span>
                      </td>

                      <td>
                        {hazard.category.replace(/_/g, ' ')}
                      </td>

                      <td
                        style={{
                          whiteSpace: 'normal',
                          minWidth: '200px',
                          maxWidth: '320px',
                        }}
                      >
                        {hazard.description}
                      </td>

                      <td className="mono">
                        {hazard.latitude.toFixed(4)},{' '}
                        {hazard.longitude.toFixed(4)}
                      </td>

                      <td>
                        <span
                          className={`status-badge ${statusClass(hazard.status)}`}
                        >
                          <span className="status-dot" />
                          {statusLabel(hazard.status)}
                        </span>
                      </td>

                      <td>
                        <SeverityBadge severity={hazard.severity} />
                      </td>

                      <td>{formatDate(hazard.created_at)}</td>

                      <td>
                        <button
                          className="resolve-action"
                          style={actionStyle}
                          title="Show this hazard on the map"
                          aria-label={`Show hazard ${hazard.id} on map`}
                          onClick={() => onShowMap(hazard)}
                        >
                          <MapIcon size={12} />
                          Map
                        </button>
                        {hazard.status === 'PENDING_REVIEW' && (
                          <>
                            <button
                              className="primary-action"
                              style={actionStyle}
                              disabled={busyId === hazard.id}
                              onClick={() =>
                                void handleStatusChange(hazard, 'VERIFIED')
                              }
                            >
                              Verify
                            </button>

                            <button
                              className="resolve-action"
                              style={actionStyle}
                              disabled={busyId === hazard.id}
                              onClick={() =>
                                void handleStatusChange(hazard, 'REJECTED')
                              }
                            >
                              Reject
                            </button>
                          </>
                        )}

                        {hazard.status === 'VERIFIED' && (
                          <>
                            <button
                              className="primary-action"
                              style={actionStyle}
                              disabled={busyId === hazard.id}
                              onClick={() =>
                                void handleStatusChange(hazard, 'RESOLVED')
                              }
                            >
                              Resolve
                            </button>

                            <button
                              className="resolve-action"
                              style={actionStyle}
                              disabled={busyId === hazard.id}
                              onClick={() =>
                                void handleStatusChange(hazard, 'REJECTED')
                              }
                            >
                              Reject
                            </button>
                          </>
                        )}

                        {(hazard.status === 'RESOLVED' ||
                          hazard.status === 'REJECTED') && (
                          <span className="table-muted">No actions</span>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </section>
      )}
    </>
  )
}

function TouristsPage() {
  const [tourists, setTourists] = useState<TouristMonitoring[]>([])
  const [loading, setLoading] = useState(!isMockMode)
  const [error, setError] = useState<string | null>(null)
  const [selectedId, setSelectedId] = useState<number | null>(null)

  const loadTourists = useCallback(async () => {
    if (isMockMode) return

    setLoading(true)
    setError(null)

    try {
      const result = await getTourists()
      setTourists(result)
    } catch (err) {
      setError(
        err instanceof Error
          ? err.message
          : 'Unable to load tourist records.',
      )
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    void loadTourists()
  }, [loadTourists])

  const selectedTourist =
    tourists.find((tourist) => tourist.id === selectedId) ?? null

  const openLocation = (latitude: number, longitude: number) => {
    const url = `https://www.google.com/maps?q=${latitude},${longitude}`
    window.open(url, '_blank', 'noopener,noreferrer')
  }

  return (
    <>
      <div className="page-intro">
        <div>
          <div className="eyebrow">
            {isMockMode
              ? 'Monitored travellers / demo adapter'
              : 'Registered tourists / live backend'}
          </div>
          <h2>Tourist monitoring</h2>
          <p>
            Tourist profiles, registration details and recorded safety activity.
          </p>
        </div>

        <div className="map-mode">
          <Users size={14} />
          {isMockMode
            ? '04 demo records'
            : `${tourists.length} registered tourists`}
        </div>
      </div>

      {isMockMode ? (
        <>
          <DemoOnlyNotice>Tourist monitoring</DemoOnlyNotice>

          <section className="panel feature-table-panel">
            <div className="panel-heading">
              <div>
                <div className="eyebrow">Anonymized register</div>
                <h3>Demo travellers</h3>
              </div>
              <span className="mini-label">MOCK ONLY</span>
            </div>

            <div className="table-scroll">
              <table>
                <thead>
                  <tr>
                    <th>Tourist</th>
                    <th>Status</th>
                    <th>Location</th>
                    <th>Last update</th>
                    <th>Zone</th>
                    <th>SOS state</th>
                    <th>Connection</th>
                  </tr>
                </thead>

                <tbody>
                  {demoTourists.map((tourist) => (
                    <tr key={tourist.id}>
                      <td><strong>Tourist {tourist.id}</strong></td>
                      <td>{tourist.status}</td>
                      <td>{tourist.location}</td>
                      <td>{tourist.update}</td>
                      <td>{tourist.zone}</td>
                      <td>{tourist.sos}</td>
                      <td>{tourist.connection}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </section>
        </>
      ) : (
        <>
          <section className="panel feature-table-panel">
            <div className="panel-heading">
              <div>
                <div className="eyebrow">Verified backend records</div>
                <h3>Registered tourist directory</h3>
              </div>

              <button
                className="text-action"
                onClick={() => void loadTourists()}
                disabled={loading}
              >
                <RefreshCw size={13} />
                Refresh
              </button>
            </div>

            {error && (
              <div
                role="alert"
                style={{
                  padding: '14px 0',
                  color: 'var(--red)',
                  fontSize: '11px',
                }}
              >
                {error}
              </div>
            )}

            {loading ? (
              <div className="inline-loading">
                Loading tourist recordsâ€¦
              </div>
            ) : tourists.length === 0 ? (
              <div className="empty-state">
                <Users size={20} />
                <strong>No registered tourists found</strong>
                <span>
                  Tourist accounts returned by the backend will appear here.
                </span>
              </div>
            ) : (
              <div className="table-scroll">
                <table>
                  <thead>
                    <tr>
                      <th>Tourist</th>
                      <th>Contact</th>
                      <th>Date of birth / Age</th>
                      <th>KYC</th>
                      <th>Incidents</th>
                      <th>Latest SOS</th>
                      <th>Last recorded location</th>
                      <th>Details</th>
                    </tr>
                  </thead>

                  <tbody>
                    {tourists.map((tourist) => (
                      <tr key={tourist.id}>
                        <td>
                          <strong>{tourist.name}</strong>
                          <br />
                          <span className="table-muted">
                            Tourist #{tourist.id}
                          </span>
                        </td>

                        <td style={{ whiteSpace: 'normal', minWidth: '170px' }}>
                          <div>{tourist.phone}</div>
                          <div className="table-muted">
                            {tourist.email || 'No email provided'}
                          </div>
                        </td>

                        <td>
                          <div>{tourist.date_of_birth || 'Not provided'}</div>
                          <div className="table-muted">
                            {tourist.age == null
                              ? 'Age unknown'
                              : `${tourist.age} years`}
                          </div>
                        </td>

                        <td>
                          <span className="status-badge">
                            <span className="status-dot" />
                            {tourist.kyc_status}
                          </span>
                        </td>

                        <td>
                          <strong>{tourist.total_incidents}</strong>
                          <div className="table-muted">
                            {tourist.active_incidents} open
                          </div>
                        </td>

                        <td>
                          {tourist.latest_incident_id == null ? (
                            'No recorded SOS'
                          ) : (
                            <>
                              <strong>
                                SOS #{tourist.latest_incident_id}
                              </strong>
                              <div>
                                {tourist.latest_incident_status}
                              </div>
                              <div className="table-muted">
                                {tourist.latest_incident_severity}
                              </div>
                            </>
                          )}
                        </td>

                        <td style={{ whiteSpace: 'normal', minWidth: '150px' }}>
                          {tourist.last_location_latitude == null ||
                          tourist.last_location_longitude == null ? (
                            'No location recorded'
                          ) : (
                            <>
                              <div className="mono">
                                {tourist.last_location_latitude.toFixed(5)},
                                {' '}
                                {tourist.last_location_longitude.toFixed(5)}
                              </div>

                              <div className="table-muted">
                                {formatDate(
                                  tourist.last_location_recorded_at,
                                )}
                              </div>

                              <button
                                className="text-action"
                                onClick={() =>
                                  openLocation(
                                    tourist.last_location_latitude!,
                                    tourist.last_location_longitude!,
                                  )
                                }
                              >
                                <MapIcon size={12} />
                                Open map
                              </button>
                            </>
                          )}
                        </td>

                        <td>
                          <button
                            className="resolve-action"
                            style={{
                              width: 'auto',
                              padding: '7px 10px',
                              fontSize: '9px',
                            }}
                            onClick={() =>
                              setSelectedId(
                                selectedId === tourist.id
                                  ? null
                                  : tourist.id,
                              )
                            }
                          >
                            {selectedId === tourist.id
                              ? 'Hide'
                              : 'View details'}
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </section>

          {selectedTourist && (
            <section className="panel feature-table-panel communication-records">
              <div className="panel-heading">
                <div>
                  <div className="eyebrow">
                    Tourist #{selectedTourist.id}
                  </div>
                  <h3>{selectedTourist.name}</h3>
                </div>

                <button
                  className="text-action"
                  onClick={() => setSelectedId(null)}
                >
                  <X size={13} />
                  Close
                </button>
              </div>

              <div className="detail-grid" style={{ paddingTop: '18px' }}>
                <div>
                  <span>Full name</span>
                  <strong>{selectedTourist.name}</strong>
                </div>

                <div>
                  <span>Phone</span>
                  <strong>{selectedTourist.phone}</strong>
                </div>

                <div>
                  <span>Email</span>
                  <strong>
                    {selectedTourist.email || 'Not provided'}
                  </strong>
                </div>

                <div>
                  <span>Date of birth</span>
                  <strong>
                    {selectedTourist.date_of_birth || 'Not provided'}
                  </strong>
                </div>

                <div>
                  <span>Age</span>
                  <strong>
                    {selectedTourist.age == null
                      ? 'Unknown'
                      : `${selectedTourist.age} years`}
                  </strong>
                </div>

                <div>
                  <span>KYC status</span>
                  <strong>{selectedTourist.kyc_status}</strong>
                </div>

                <div>
                  <span>Account registered</span>
                  <strong>{formatDate(selectedTourist.registered_at)}</strong>
                </div>

                <div>
                  <span>Total incidents</span>
                  <strong>{selectedTourist.total_incidents}</strong>
                </div>

                <div>
                  <span>Open incidents</span>
                  <strong>{selectedTourist.active_incidents}</strong>
                </div>

                <div>
                  <span>Latest transmission method</span>
                  <strong>
                    {selectedTourist.last_transmission_method || 'No record'}
                  </strong>
                </div>
              </div>
            </section>
          )}
        </>
      )}
    </>
  )
}

function CommunicationsPage({ incidents }: { incidents: Incident[] }) {
  if (isMockMode) {
    return (
      <>
        <div className="page-intro">
          <div>
            <div className="eyebrow">Resilient delivery / demo adapter</div>
            <h2>Communications</h2>
            <p>Example communication paths for the demonstration environment.</p>
          </div>
          <div className="map-mode">
            <Radio size={14} /> Demo mode
          </div>
        </div>

        <DemoOnlyNotice>Communication statistics</DemoOnlyNotice>

        <div className="communication-grid">
          <section className="panel flow-panel">
            <div className="panel-heading">
              <div>
                <div className="eyebrow">Normal scenario</div>
                <h3>Internet delivery</h3>
              </div>
            </div>
            <div className="comm-flow normal">
              <div><strong>DEVICE</strong><span>Tourist app</span></div>
              <b>â†“</b>
              <div><strong>FastAPI</strong><span>Incident service</span></div>
              <b>â†“</b>
              <div><strong>MySQL</strong><span>Persistent record</span></div>
              <b>â†“</b>
              <div><strong>COMMAND CENTER</strong><span>Operator queue</span></div>
            </div>
          </section>

          <section className="panel flow-panel">
            <div className="panel-heading">
              <div>
                <div className="eyebrow">Fallback scenario</div>
                <h3>SMS fallback</h3>
              </div>
              <span className="risk-pill medium">DEMO</span>
            </div>
            <div className="comm-flow">
              <div><strong>DEVICE</strong><span>Tourist app</span></div>
              <b>â†“</b>
              <div><strong>Internet unavailable</strong><span>Backend unreachable</span></div>
              <b>â†“</b>
              <div className="flow-emphasis">
                <strong>SMS fallback</strong>
                <span>Android SMS service</span>
              </div>
              <b>â†“</b>
              <div><strong>RECIPIENT</strong><span>Configured phone number</span></div>
            </div>
          </section>

          <section className="panel comm-stats">
            <div className="panel-heading">
              <div>
                <div className="eyebrow">Example values</div>
                <h3>Delivery summary</h3>
              </div>
            </div>
            <div className="summary-lines">
              <div><span>Internet received</span><strong>75%</strong></div>
              <div><span>SMS fallback</span><strong>25%</strong></div>
              <div><span>Pending sync</span><strong>01</strong></div>
              <div><span>Failed transmissions</span><strong>00</strong></div>
            </div>
          </section>
        </div>
      </>
    )
  }

  const internetCount = incidents.filter(
    (incident) => incident.transmission_method.trim().toUpperCase() === 'INTERNET',
  ).length

  const smsCount = incidents.filter(
    (incident) => incident.transmission_method.toUpperCase().includes('SMS'),
  ).length

  const otherCount = incidents.length - internetCount - smsCount

  const recentIncidents = [...incidents]
    .sort(
      (a, b) =>
        parseApiDate(b.created_at || b.timestamp).getTime() -
        parseApiDate(a.created_at || a.timestamp).getTime(),
    )
    .slice(0, 20)

  return (
    <>
      <div className="page-intro">
        <div>
          <div className="eyebrow">
            Communication records / live backend
          </div>
          <h2>Communications</h2>
          <p>
            Inspect recorded incident transmission methods and backend receipt.
          </p>
        </div>
        <div className="map-mode">
          <Radio size={14} /> API records
        </div>
      </div>

      <div className="communication-grid">
        <section className="panel flow-panel">
          <div className="panel-heading">
            <div>
              <div className="eyebrow">Normal communication path</div>
              <h3>Internet submission</h3>
            </div>
            <span className="mini-label">BACKEND RECORDED</span>
          </div>

          <div className="comm-flow normal">
            <div><strong>DEVICE</strong><span>Tourist app creates SOS</span></div>
            <b>â†“</b>
            <div><strong>FASTAPI</strong><span>Incident accepted by API</span></div>
            <b>â†“</b>
            <div><strong>MYSQL</strong><span>Incident record persisted</span></div>
            <b>â†“</b>
            <div><strong>COMMAND CENTER</strong><span>Record available to operators</span></div>
          </div>
        </section>

        <section className="panel flow-panel">
          <div className="panel-heading">
            <div>
              <div className="eyebrow">Fallback communication path</div>
              <h3>SMS fallback</h3>
            </div>
            <span className="mini-label">LIMITED TRACKING</span>
          </div>

          <div className="comm-flow">
            <div><strong>DEVICE</strong><span>Internet request unavailable</span></div>
            <b>â†“</b>
            <div><strong>ANDROID SMS</strong><span>App submits a message to Android</span></div>
            <b>â†“</b>
            <div className="flow-emphasis">
              <strong>CONFIGURED RECIPIENT</strong>
              <span>Message delivery not confirmed here</span>
            </div>
          </div>

          <p className="metric-note">
            SMS attempt logs and delivery receipts are not yet stored in the
            backend. Submission to Android does not confirm delivery or
            automatic ingestion into the Command Center.
          </p>
        </section>

        <section className="panel comm-stats">
          <div className="panel-heading">
            <div>
              <div className="eyebrow">Persisted incident data</div>
              <h3>Transmission summary</h3>
            </div>
          </div>

          <div className="summary-lines">
            <div>
              <span>Backend incident records</span>
              <strong>{incidents.length}</strong>
            </div>
            <div>
              <span>Marked Internet</span>
              <strong>{internetCount}</strong>
            </div>
            <div>
              <span>Marked SMS</span>
              <strong>{smsCount}</strong>
            </div>
            <div>
              <span>Other / unknown method</span>
              <strong>{otherCount}</strong>
            </div>
            <div>
              <span>SMS delivery confirmation</span>
              <strong>Not tracked</strong>
            </div>
          </div>
        </section>
      </div>

      <section className="panel feature-table-panel" style={{ marginTop: 32 }}>
        <div className="panel-heading">
          <div>
            <div className="eyebrow">Source: GET /incidents</div>
            <h3>Recent communication records</h3>
          </div>
          <span className="mini-label">
            {recentIncidents.length} SHOWN
          </span>
        </div>

        <p className="metric-note">
          These are incidents persisted by the backend. The transmission
          method is the method recorded on each incident, not a delivery receipt.
        </p>

        {recentIncidents.length === 0 ? (
          <div className="empty-state">
            <Radio size={20} />
            <strong>No backend incident records</strong>
            <span>Persisted incidents will appear here when available.</span>
          </div>
        ) : (
          <div className="table-scroll">
            <table>
              <thead>
                <tr>
                  <th>Incident</th>
                  <th>Tourist</th>
                  <th>Transmission method</th>
                  <th>Backend record</th>
                  <th>Severity</th>
                  <th>Incident status</th>
                  <th>Recorded time</th>
                </tr>
              </thead>

              <tbody>
                {recentIncidents.map((incident) => (
                  <tr key={incident.id}>
                    <td><strong>SOS #{incident.id}</strong></td>
                    <td>Tourist #{incident.user_id}</td>
                    <td>
                      {incident.transmission_method
                        ? incident.transmission_method.replace(/_/g, ' ')
                        : 'Unknown'}
                    </td>
                    <td>
                      <span className="status-badge resolved">
                        <span className="status-dot" />
                        Stored
                      </span>
                    </td>
                    <td><SeverityBadge severity={incident.severity} /></td>
                    <td>
                      <span
                        className={`status-badge ${
                          incident.status === 'RESOLVED'
                            ? 'resolved'
                            : incident.status === 'ACKNOWLEDGED'
                              ? 'acknowledged'
                              : 'created'
                        }`}
                      >
                        <span className="status-dot" />
                        {incident.status.replace(/_/g, ' ')}
                      </span>
                    </td>
                    <td>{formatDate(incident.created_at || incident.timestamp)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </>
  )
}


function formatAnalyticsDuration(seconds: number | null): string {
  if (seconds == null || !Number.isFinite(seconds)) return 'Unavailable'

  const totalMinutes = Math.round(seconds / 60)
  const days = Math.floor(totalMinutes / 1440)
  const hours = Math.floor((totalMinutes % 1440) / 60)
  const minutes = totalMinutes % 60

  if (days > 0) return `${days}d ${hours}h`
  if (hours > 0) return `${hours}h ${minutes}m`
  return `${minutes}m`
}

function AnalyticsBreakdownChart({
  title,
  eyebrow,
  points,
}: {
  title: string
  eyebrow: string
  points: AnalyticsSummary['incident_severity']
}) {
  const [hoveredIndex, setHoveredIndex] = useState<number | null>(null)

  const pieColors = [
    '#205b59',
    '#bd8428',
    '#d65d5d',
    '#7088a7',
    '#78a58a',
    '#9a82b2',
  ]

  const total = points.reduce((sum, point) => sum + point.count, 0)

  const chartPoints = points
    .map((point, index) => ({
      label: point.label.replace(/_/g, ' '),
      value: point.count,
      color: pieColors[index % pieColors.length],
    }))
    .filter((point) => point.value > 0)

  const activePoint =
    hoveredIndex === null ? null : (chartPoints[hoveredIndex] ?? null)

  const activePercentage =
    activePoint && total > 0
      ? ((activePoint.value / total) * 100).toFixed(1)
      : null

  return (
    <section className="panel analytics-chart-panel">
      <div className="panel-heading">
        <div>
          <div className="eyebrow">{eyebrow}</div>
          <h3>{title}</h3>
        </div>
        <span className="mini-label">{total} TOTAL</span>
      </div>

      <div className="analytics-bklit-pie-layout">
        <div className="analytics-bklit-pie">
          {chartPoints.length > 0 ? (
            <div className="bklit-chart-root analytics-bklit-pie-chart">
              <PieChart
                data={chartPoints}
                size={124}
                padAngle={0.025}
                cornerRadius={3}
                hoveredIndex={hoveredIndex}
                onHoverChange={setHoveredIndex}
              >
                {chartPoints.map((point, index) => (
                  <PieSlice
                    key={`${point.label}-${index}`}
                    index={index}
                    hoverEffect="grow"
                  />
                ))}
              </PieChart>
            </div>
          ) : (
            <div className="analytics-bklit-pie-empty" aria-label="No records" />
          )}
        </div>

        <div className="analytics-pie-legend">
          {points.map((point, index) => (
            <div className="analytics-pie-legend-row" key={point.label}>
              <span
                className="analytics-pie-swatch"
                style={{
                  background: pieColors[index % pieColors.length],
                }}
              />
              <span className="analytics-pie-label">
                {point.label.replace(/_/g, ' ')}
              </span>
              <strong>{point.count}</strong>
              <small>
                {total > 0
                  ? `${((point.count / total) * 100).toFixed(0)}%`
                  : 'â€”'}
              </small>
            </div>
          ))}
        </div>
      </div>

      <div
        className={`analytics-pie-hover-readout${activePoint ? ' has-data' : ''}`}
        aria-live="polite"
      >
        {activePoint ? (
          <>
            <span
              className="analytics-pie-hover-dot"
              style={{ background: activePoint.color }}
            />
            <strong>{activePoint.label}</strong>
            <span>
              {activePoint.value.toLocaleString('en-IN')} records
            </span>
            <small>{activePercentage}% of total</small>
          </>
        ) : (
          <span className="analytics-pie-hover-hint">
            Hover over a slice to inspect its data
          </span>
        )}
      </div>
    </section>
  )
}
function AnalyticsPage() {
  const [period, setPeriod] = useState<AnalyticsPeriod>('30d')
  const [summary, setSummary] = useState<AnalyticsSummary | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const loadAnalytics = useCallback(async (selectedPeriod: AnalyticsPeriod) => {
    setLoading(true)
    setError(null)

    try {
      const result = await getAnalyticsSummary(selectedPeriod)
      setSummary(result)
    } catch (err) {
      setError(
        err instanceof Error
          ? err.message
          : 'Unable to load analytics from the backend.',
      )
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    void loadAnalytics(period)
  }, [period, loadAnalytics])

  if (isMockMode) {
    return (
      <>
        <div className="page-intro">
          <div>
            <div className="eyebrow">Operational intelligence</div>
            <h2>Analytics</h2>
            <p>Switch to real API mode to view verified backend analytics.</p>
          </div>
          <div className="map-mode"><BarChart3 size={14} /> Demo mode</div>
        </div>
        <DemoOnlyNotice>Live analytics are not available in mock mode.</DemoOnlyNotice>
      </>
    )
  }

  const formatBucket = (bucket: string) => {
    if (bucket.length === 7) {
      const [year, month] = bucket.split('-')
      return new Date(Number(year), Number(month) - 1, 1).toLocaleDateString(
        'en-IN',
        { month: 'short', year: '2-digit' },
      )
    }

    const [year, month, day] = bucket.split('-')
    return `${day} ${new Date(Number(year), Number(month) - 1, 1).toLocaleDateString(
      'en-IN',
      { month: 'short' },
    )}`
  }

  
  const kpis = summary
    ? [
        {
          label: 'SOS in period',
          value: summary.kpis.incidents_in_period,
          note: `Selected period: ${period}`,
          tone: 'neutral',
        },
        {
          label: 'Active SOS',
          value: summary.kpis.active_sos,
          note: 'Currently unresolved',
          tone: 'danger',
        },
        {
          label: 'Resolved in period',
          value: summary.kpis.resolved_in_period,
          note: 'Based on resolution timestamp',
          tone: 'healthy',
        },
        {
          label: 'Hazards in period',
          value: summary.kpis.hazards_in_period,
          note: 'Reports submitted',
          tone: 'neutral',
        },
        {
          label: 'Pending hazards',
          value: summary.kpis.pending_hazards,
          note: 'Currently awaiting review',
          tone: 'warning',
        },
        {
          label: 'Registered tourists',
          value: summary.kpis.registered_tourists,
          note: 'All registered tourist accounts',
          tone: 'neutral',
        },
      ]
    : []

  const maxTrend = summary
    ? Math.max(
        1,
        ...summary.incident_trend.map((point) =>
          Math.max(point.incidents, point.hazards),
        ),
      )
    : 1

  return (
    <>
      <div className="page-intro">
        <div>
          <div className="eyebrow">Operational intelligence / live backend</div>
          <h2>Analytics &amp; Insights</h2>
          <p>
            Incident patterns, hazard reporting and Command Center response
            performance.
          </p>
        </div>

        <div className="analytics-period-control">
          <label htmlFor="analytics-period">Reporting period</label>
          <select
            id="analytics-period"
            value={period}
            onChange={(event) =>
              setPeriod(event.target.value as AnalyticsPeriod)
            }
          >
            <option value="7d">Last 7 days</option>
            <option value="30d">Last 30 days</option>
            <option value="90d">Last 90 days</option>
            <option value="all">All time</option>
          </select>
          <button
            className="text-action"
            onClick={() => void loadAnalytics(period)}
            disabled={loading}
          >
            <RefreshCw size={13} /> Refresh
          </button>
        </div>
      </div>

      {error && (
        <div className="connection-banner error" role="alert">
          <AlertTriangle size={15} />
          <span>{error}</span>
          <button onClick={() => void loadAnalytics(period)}>Retry</button>
        </div>
      )}

      {loading && !summary ? (
        <div className="loading-state">
          <RefreshCw className="spin" size={20} />
          <strong>Loading analyticsâ€¦</strong>
          <span>Calculating summaries from persisted backend records.</span>
        </div>
      ) : summary ? (
        <>
          <div className="analytics-period-caption">
            <span>
              {summary.start_date
                ? `${summary.start_date} â€” ${summary.end_date}`
                : `All recorded history through ${summary.end_date}`}
            </span>
            <span>Updated {formatTime(summary.generated_at)} IST</span>
          </div>

          <div className="analytics-kpi-grid">
            {kpis.map((kpi) => (
              <section
                className={`analytics-kpi-card ${kpi.tone}`}
                key={kpi.label}
              >
                <span>{kpi.label}</span>
                <strong>{kpi.value.toLocaleString('en-IN')}</strong>
                <small>{kpi.note}</small>
              </section>
            ))}
          </div>

          <section className="panel analytics-chart-panel analytics-trend-panel">
            <div className="panel-heading">
              <div>
                <div className="eyebrow">Reporting activity</div>
                <h3>Incident &amp; hazard trends</h3>
              </div>
              <div className="analytics-chart-legend">
                <span><i className="analytics-legend-incident" /> SOS incidents</span>
                <span><i className="analytics-legend-hazard" /> Hazards</span>
              </div>
            </div>

            {summary.incident_trend.every(
              (point) => point.incidents === 0 && point.hazards === 0,
            ) ? (
              <div className="empty-state">
                <BarChart3 size={20} />
                <strong>No reports in this period</strong>
                <span>There are no recorded incidents or hazards to chart.</span>
              </div>
            ) : (
              <div className="bklit-chart-root analytics-bklit-chart">
                <BarChart
                  data={summary.incident_trend.map((point) => ({
                    bucket: formatBucket(point.bucket),
                    incidents: point.incidents,
                    hazards: point.hazards,
                  }))}
                  xDataKey="bucket"
                  aspectRatio="2.8 / 1"
                  margin={{ top: 24, right: 18, bottom: 44, left: 42 }}
                  barGap={0.25}
                  animationDuration={700}
                >
                  <Grid
                    horizontal
                    numTicksRows={5}
                    stroke="var(--chart-grid)"
                    strokeOpacity={0.65}
                  />
                  <Bar
                    dataKey="incidents"
                    fill="var(--chart-1)"
                  />
                  <Bar
                    dataKey="hazards"
                    fill="var(--chart-2)"
                  />
                  <BarXAxis
                    maxLabels={summary.trend_interval === 'month' ? 12 : 10}
                  />
                  <ChartTooltip
                    showDatePill={false}
                    backgroundColor="#fbfaf6"
                    panelStyle={{
                      color: '#173238',
                      background: '#fbfaf6',
                      border: '1px solid #d7d8ce',
                      borderRadius: '12px',
                      boxShadow: '0 12px 28px rgba(23, 50, 56, 0.14)',
                    }}
                  />
                </BarChart>
              </div>
            )}
          </section>

          <div className="analytics-breakdown-grid">
            <AnalyticsBreakdownChart title="Incident severity" eyebrow="SOS reports" points={summary.incident_severity} />
            <AnalyticsBreakdownChart title="Incident status" eyebrow="Response workflow" points={summary.incident_status} />
            <AnalyticsBreakdownChart title="Hazard categories" eyebrow="Reported safety issues" points={summary.hazard_categories} />
            <AnalyticsBreakdownChart title="Hazard status" eyebrow="Review workflow" points={summary.hazard_status} />
            <AnalyticsBreakdownChart title="Transmission methods" eyebrow="Recorded incident fields" points={summary.transmission_methods} />
          </div>

          <section className="panel analytics-chart-panel analytics-response-panel">
            <div className="panel-heading">
              <div>
                <div className="eyebrow">Command Center performance</div>
                <h3>Response times</h3>
              </div>
              <span className="mini-label">RECORDED TIMESTAMPS ONLY</span>
            </div>

            <div className="analytics-response-grid">
              {[
                {
                  title: 'Acknowledgement',
                  metric: summary.acknowledgement_time,
                  description:
                    'Backend incident creation to the first recorded operator acknowledgement.',
                },
                {
                  title: 'Resolution',
                  metric: summary.resolution_time,
                  description:
                    'Creation to resolution for incidents resolved by Command Center.',
                },
              ].map(({ title, metric, description }) => (
                <div className="analytics-response-card" key={title}>
                  <span>{title}</span>
                  <strong>
                    {formatAnalyticsDuration(metric.average_seconds)}
                  </strong>
                  <div>
                    Median: {formatAnalyticsDuration(metric.median_seconds)}
                  </div>
                  <small>
                    {metric.samples} usable sample
                    {metric.samples === 1 ? '' : 's'}
                  </small>
                  <p>{description}</p>
                </div>
              ))}
            </div>

            <p className="metric-note">
              Averages can be affected by unusually long delays, so the median
              and sample count are displayed too. SMS delivery success and
              failure rates are not available until communication attempts and
              delivery receipts are recorded by the backend.
            </p>
          </section>
        </>
      ) : (
        <div className="empty-state">
          <BarChart3 size={20} />
          <strong>No analytics data returned</strong>
          <span>Retry the request or select another reporting period.</span>
        </div>
      )}
    </>
  )
}


function CommandTools({ incidents, riskZones, onIncident, onZone }: { incidents: Incident[]; riskZones: RiskZone[]; onIncident: (incident: Incident) => void; onZone: (zone: RiskZone) => void }) {
  const [query, setQuery] = useState('')
  const [notificationsOpen, setNotificationsOpen] = useState(false)
  const [notifications, setNotifications] = useState<typeof demoNotifications>([])
  const results = query.trim().length < 2 ? [] : [...incidents.filter((item) => `SOS ${item.id} Tourist ${item.user_id} ${item.latitude} ${item.longitude}`.toLowerCase().includes(query.toLowerCase())).map((item) => ({ label: `SOS #${item.id}`, sub: `Tourist #${item.user_id} Â· ${item.latitude.toFixed(4)}, ${item.longitude.toFixed(4)}`, action: () => onIncident(item) })), ...riskZones.filter((item) => item.name.toLowerCase().includes(query.toLowerCase())).map((item) => ({ label: item.name, sub: `${item.risk_level} risk Â· ${item.radius_meters}m`, action: () => onZone(item) }))]
  return <div className="command-tools"><div className="global-search"><Search size={14} /><input aria-label="Global search" value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Searchâ€¦" />{results.length > 0 && <div className="search-results">{results.slice(0, 6).map((result) => <button key={result.label} onClick={() => { result.action(); setQuery('') }}><strong>{result.label}</strong><span>{result.sub}</span></button>)}</div>}</div><div className="notification-wrap"><button className="notification-button" aria-label="Open notifications" onClick={() => setNotificationsOpen((value) => !value)}><Bell size={16} />{notifications.length > 0 && <span className="notification-dot" aria-hidden="true" />}</button>{notificationsOpen && <div className="notification-panel"><div className="notification-head"><strong>Notifications</strong><span>{isMockMode ? `${notifications.length} unread` : 'Live endpoint pending'}</span></div>{isMockMode ? notifications.length ? notifications.map((notification) => <button className={`notification-item ${notification.tone}`} key={notification.title} onClick={() => setNotifications((current) => current.filter((item) => item.title !== notification.title))}><span className="status-dot" /><div><strong>{notification.title}</strong><p>{notification.body}</p><small>{notification.time} IST Â· Click to dismiss</small></div></button>) : <div className="notification-foot">All notifications checked.</div> : <div className="notification-foot">No notification endpoint is connected in the FastAPI adapter yet.</div>}<div className="notification-foot">{isMockMode ? 'Click a notification after reviewing it.' : 'No live data has been invented.'}</div></div>}</div></div>
}

function App() {
  const [session, setSession] = useState(getStoredSession())
  const [view, setView] = useState<View>('overview')
  const [data, setData] = useState<DashboardData>({
  incidents: [],
  riskZones: [],
  hazards: [],
  health: null,
  events: {},
})
  const [selected, setSelected] = useState<Incident | RiskZone | Hazard | null>(null)
  const [toast, setToast] = useState<Toast | null>(null)
  const [loading, setLoading] = useState(false)
  const [refreshing, setRefreshing] = useState(false)
  const [actionLoading, setActionLoading] = useState<string | null>(null)
  const [mobileNav, setMobileNav] = useState(false)
  const [mapSeverityFilter, setMapSeverityFilter] =
    useState<'ALL' | 'HIGH' | 'MEDIUM' | 'LOW'>('ALL')
  const [mapStatusFilter, setMapStatusFilter] =
    useState<'ACTIVE' | 'CREATED' | 'ACKNOWLEDGED' | 'RESOLVED' | 'ALL'>('ACTIVE')
  const [mapHazardStatusFilter, setMapHazardStatusFilter] =
    useState<'ALL' | 'PENDING_REVIEW' | 'VERIFIED' | 'RESOLVED' | 'REJECTED'>('ALL')
  const [eventLoadingId, setEventLoadingId] = useState<number | null>(null)
  const [eventLoadError, setEventLoadError] = useState<{
    incidentId: number
    message: string
  } | null>(null)
  const [dataError, setDataError] = useState<string | null>(null)
  const [lastSuccessAt, setLastSuccessAt] = useState<string | null>(null)
  const [lastFailureAt, setLastFailureAt] = useState<string | null>(null)
  const dataRef = useRef(data)
  const requestInFlight = useRef(false)
  const eventRequests = useRef(new Set<number>())

  const showToast = useCallback((next: Toast) => { setToast(next); window.setTimeout(() => setToast(null), 4200) }, [])

  const loadIncidentEvents = useCallback(async (incidentId: number, force = false) => {
    if (
      !force &&
      Object.prototype.hasOwnProperty.call(dataRef.current.events, incidentId)
    ) return
    if (eventRequests.current.has(incidentId)) return

    eventRequests.current.add(incidentId)
    setEventLoadingId(incidentId)
    setEventLoadError(null)

    try {
      const events = await getIncidentEvents(incidentId)
      setData((current) => ({
        ...current,
        events: { ...current.events, [incidentId]: events },
      }))
    } catch (error) {
      setEventLoadError({
        incidentId,
        message: error instanceof Error
          ? error.message
          : 'Unable to load this incident timeline.',
      })
    } finally {
      eventRequests.current.delete(incidentId)
      setEventLoadingId((current) => current === incidentId ? null : current)
    }
  }, [])
  const loadData = useCallback(async (soft = false) => {
    if (!session || requestInFlight.current) return
    requestInFlight.current = true
    soft ? setRefreshing(true) : setLoading(true)
    try {
      const results = await Promise.allSettled([
  getIncidents(),
  getRiskZones(),
  getHealth(),
  getHazards(),
])
      const previous = dataRef.current
      const incidents = results[0].status === 'fulfilled' ? results[0].value : previous.incidents
      const riskZones = results[1].status === 'fulfilled' ? results[1].value : previous.riskZones
      const health = results[2].status === 'fulfilled' ? results[2].value : previous.health
      const hazards =
  results[3].status === 'fulfilled'
    ? results[3].value
    : previous.hazards
      const failures = results.filter((result) => result.status === 'rejected').map((result) => result.reason instanceof Error ? result.reason.message : 'A data source request failed.')
      const eventResults = await Promise.allSettled(incidents.slice(0, 12).map(async (incident) => [incident.id, await getIncidentEvents(incident.id)] as const))
      const events = { ...previous.events }
      eventResults.forEach((result) => { if (result.status === 'fulfilled') events[result.value[0]] = result.value[1] })
      const eventFailures = eventResults.filter((result) => result.status === 'rejected').length
      if (eventFailures) failures.push(`${eventFailures} incident timeline request${eventFailures === 1 ? '' : 's'} failed.`)
      setData({ incidents, riskZones,hazards, health, events })
      if (failures.length) { setDataError(failures.join(' ')); setLastFailureAt(new Date().toISOString()) } else { setDataError(null); setLastSuccessAt(new Date().toISOString()) }
      setSelected((current) => current ? incidents.find((incident) => incident.id === current.id) || riskZones.find((zone) => zone.id === current.id) || null : incidents.find((incident) => incident.status !== 'RESOLVED') || null)
    } catch (error) { const message = error instanceof Error ? error.message : 'Unable to load command center data.'; if (message.includes('session has expired')) { clearSession(); setSession(null) } setDataError(message); setLastFailureAt(new Date().toISOString()); showToast({ tone: 'error', message }) } finally { requestInFlight.current = false; setLoading(false); setRefreshing(false) }
  }, [session, showToast])

  useEffect(() => { dataRef.current = data }, [data])

  useEffect(() => {
    if (!session || !selected || !('user_id' in selected)) return
    void loadIncidentEvents(selected.id)
  }, [session, selected?.id, loadIncidentEvents])
  useEffect(() => { if (session) void loadData() }, [session, loadData])
  useEffect(() => {
    if (!session) return
    const poll = () => { if (document.visibilityState === 'visible') void loadData(true) }
    const timer = window.setInterval(poll, POLL_INTERVAL_MS)
    const onVisibility = () => { if (document.visibilityState === 'visible') void loadData(true) }
    document.addEventListener('visibilitychange', onVisibility)
    return () => { window.clearInterval(timer); document.removeEventListener('visibilitychange', onVisibility) }
  }, [session, loadData])
  useEffect(() => { document.title = APP_TITLE }, [])

  const sortedIncidents = useMemo(() => [...data.incidents].sort((a, b) => (statusRank[b.status] - statusRank[a.status]) || (severityRank[b.severity] - severityRank[a.severity]) || parseApiDate(b.timestamp).getTime() - parseApiDate(a.timestamp).getTime()), [data.incidents])
  const activeIncidents = sortedIncidents.filter((incident) => incident.status !== 'RESOLVED')
  const activeSos = activeIncidents.length
  const unacknowledged = activeIncidents.filter((incident) => incident.status === 'CREATED').length

  const mapFilteredIncidents = sortedIncidents.filter((incident) =>
    (mapSeverityFilter === 'ALL' || incident.severity === mapSeverityFilter) &&
    (
      mapStatusFilter === 'ALL' ||
      (mapStatusFilter === 'ACTIVE'
        ? incident.status !== 'RESOLVED'
        : incident.status === mapStatusFilter)
    )
  )

  const mapFilteredHazards = data.hazards.filter((hazard) =>
    mapHazardStatusFilter === 'ALL' || hazard.status === mapHazardStatusFilter
  )

  const handleLogin = async (phone: string, password: string) => { const next = await loginCommandCenter(phone, password); setSession(next); setView('overview') }
  const handleLogout = () => { clearSession(); setSession(null); setData({ incidents: [], riskZones: [], hazards: [], health: null, events: {} }) }
  const selectIncident = (incident: Incident) => { setSelected(incident); if (view === 'overview' || view === 'incidents') setView('live-map') }
  const selectZone = (zone: RiskZone) => { setSelected(zone); setView('live-map') }
  const selectHazard = (hazard: Hazard) => {
  setSelected(hazard)

  // Ensure the chosen report is immediately available to the map.
  setData((current) => ({
    ...current,
    hazards: [
      hazard,
      ...current.hazards.filter((item) => item.id !== hazard.id),
    ],
  }))

  setView('live-map')
}
  const handleAcknowledge = async () => { if (!selected || !('status' in selected) || selected.status !== 'CREATED') return; setActionLoading('acknowledge'); try { await acknowledgeIncident(selected.id); showToast({ tone: 'success', message: `Incident #${selected.id} acknowledged.` }); await loadData(true) } catch (error) { const message = error instanceof Error ? error.message : 'Unable to acknowledge incident.'; if (message.includes('session has expired')) { clearSession(); setSession(null) } showToast({ tone: 'error', message }) } finally { setActionLoading(null) } }
  const handleResolve = async () => { if (!selected || !('status' in selected) || selected.status !== 'ACKNOWLEDGED') return; if (!window.confirm(`Resolve Incident #${selected.id}?`)) return; setActionLoading('resolve'); try { await resolveIncident(selected.id); showToast({ tone: 'success', message: `Incident #${selected.id} resolved.` }); await loadData(true) } catch (error) { const message = error instanceof Error ? error.message : 'Unable to resolve incident.'; if (message.includes('session has expired')) { clearSession(); setSession(null) } showToast({ tone: 'error', message }) } finally { setActionLoading(null) } }

  if (!session) return <LoginScreen onLogin={handleLogin} />
  const operator = session.operator || { name: 'Aarav Mehta', role: 'COMMAND_CENTER' }
  const selectedIncident =
  selected && 'user_id' in selected ? selected : null

  const selectedHazard =
    selected && 'reporter_user_id' in selected ? selected : null

  const selectedZone =
    selected && 'risk_level' in selected ? selected : null

  const overview = <>
    <div className="page-intro"><div><div className="eyebrow">MoDoNER Command Center / {new Intl.DateTimeFormat('en-IN', { day: '2-digit', month: 'long', year: 'numeric' }).format(new Date())}</div><h2>Tourist safety operations, in focus.</h2><p>Live incidents, active risk zones and system health across monitored corridors.</p></div><div className="last-updated"><span>LAST UPDATED</span><strong>{new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', hour12: false })} IST</strong><button onClick={() => void loadData(true)}><RefreshCw size={13} /> Refresh</button></div></div>
    <div className="metric-grid"><MetricCard label="Active SOS" value={String(activeSos).padStart(2, '0')} sub={`${unacknowledged} need operator review`} tone="danger" icon={Siren} onClick={() => setView('incidents')} /><MetricCard label="Unacknowledged" value={String(unacknowledged).padStart(2, '0')} sub="Awaiting operator review" tone="warning" icon={AlertTriangle} onClick={() => setView('incidents')} /><MetricCard label="Active risk zones" value={String(data.riskZones.filter((zone) => zone.is_active).length).padStart(2, '0')} sub="Current monitored zones" icon={Layers3} onClick={() => setView('risk-zones')} /><MetricCard label="System status" value={data.health?.status === 'healthy' ? 'OK' : 'â€”'} sub={data.health?.database === 'connected' ? 'API + database verified' : 'Checking source health'} tone="healthy" icon={ShieldCheck} onClick={() => setView('system-status')} /></div>
    <div className="overview-grid"><section className="panel incident-panel"><div className="panel-heading"><div><div className="eyebrow">Active incidents</div><h3>Current signals <span>{activeSos}</span></h3></div><button className="text-action" onClick={() => setView('incidents')}>View all <ArrowUpRight size={14} /></button></div><IncidentList incidents={activeIncidents} selected={selectedIncident} onSelect={selectIncident} /></section><section className="panel map-panel"><div className="panel-heading"><div><div className="eyebrow">Map and signals</div><h3>Live incident map <span className="map-live"><span className="live-dot" /> refreshing</span></h3></div><button className="text-action" onClick={() => setView('live-map')}>Expand <ArrowUpRight size={14} /></button></div><SituationMap incidents={data.incidents} riskZones={data.riskZones} hazards={data.hazards} selected={selected} onSelectIncident={selectIncident} onSelectZone={selectZone} onSelectHazard={selectHazard} compact /></section><section className="panel activity-panel"><div className="panel-heading"><div><div className="eyebrow">Recent activity</div><h3>Latest updates</h3></div><button className="icon-button" onClick={() => setView('activity')}><ArrowUpRight size={15} /></button></div><ActivityFeed incidents={data.incidents} events={data.events} /></section><section className="panel health-panel"><div className="panel-heading"><div><div className="eyebrow">System status</div><h3>Service health</h3></div><span className="health-chip"><span className={`status-dot ${data.health?.status === 'healthy' ? 'healthy' : 'created'}`} /> {data.health?.status === 'healthy' ? 'Operational' : data.health ? 'Degraded' : 'Unknown'}</span></div><div className="health-list"><div><span><Server size={14} /> Backend API</span><strong>{data.health ? 'Operational' : 'Unknown'}</strong></div><div><span><Database size={14} /> Database</span><strong>{data.health?.database === 'connected' ? 'Connected' : 'Unknown'}</strong></div><div><span><Wifi size={14} /> Live connection</span><strong className="muted">Polling / {Math.round(POLL_INTERVAL_MS / 1000)} sec</strong></div></div><div className="health-note"><Radio size={14} /> Live updates will move to WebSocket when the backend endpoint is available.</div></section></div>
  </>

  const incidentsPage = <><div className="page-intro"><div><div className="eyebrow">Response records / {data.incidents.length} total</div><h2>Incident history</h2><p>Search and triage every SOS signal received by the command center.</p></div><div className="view-toggle"><button className="active"><SlidersHorizontal size={14} /> Table view</button><button onClick={() => setView('live-map')}><MapIcon size={14} /> Map view</button></div></div><IncidentsTable incidents={sortedIncidents} onSelect={(incident) => { setSelected(incident); setView('live-map') }} /></>
  const mapPage = <><div className="page-intro"><div><div className="eyebrow">Map / active signals</div><h2>Live map</h2><p>Filter SOS and hazard records by severity and status. Select a marker or zone to inspect its details.</p></div><div className="map-mode"><span className="live-dot" /> Refreshing every 30 sec</div></div><section className="panel map-filter-bar">
  <div className="map-filter-heading">
    <strong><SlidersHorizontal size={14} /> Map filters</strong>
    <span>{mapFilteredIncidents.length} SOS Â· {mapFilteredHazards.length} hazards match</span>
  </div>
  <div className="map-filter-controls">
    <label>
      Severity
      <select value={mapSeverityFilter} onChange={(event) =>
        setMapSeverityFilter(event.target.value as typeof mapSeverityFilter)
      }>
        <option value="ALL">All severities</option>
        <option value="HIGH">High</option>
        <option value="MEDIUM">Medium</option>
        <option value="LOW">Low</option>
      </select>
    </label>
    <label>
      SOS status
      <select value={mapStatusFilter} onChange={(event) =>
        setMapStatusFilter(event.target.value as typeof mapStatusFilter)
      }>
        <option value="ACTIVE">Active only</option>
        <option value="CREATED">Unacknowledged</option>
        <option value="ACKNOWLEDGED">Acknowledged</option>
        <option value="RESOLVED">Resolved</option>
        <option value="ALL">All statuses</option>
      </select>
    </label>
    <label>
      Hazard status
      <select value={mapHazardStatusFilter} onChange={(event) =>
        setMapHazardStatusFilter(event.target.value as typeof mapHazardStatusFilter)
      }>
        <option value="ALL">All hazard statuses</option>
        <option value="PENDING_REVIEW">Pending review</option>
        <option value="VERIFIED">Verified</option>
        <option value="RESOLVED">Resolved</option>
        <option value="REJECTED">Rejected</option>
      </select>
    </label>
    <button
      className="text-action map-filter-reset"
      onClick={() => {
        setMapSeverityFilter('ALL')
        setMapStatusFilter('ACTIVE')
        setMapHazardStatusFilter('ALL')
      }}
    >
      <X size={13} /> Reset filters
    </button>
  </div>
</section>
<div className="map-workspace"><section className="panel map-queue"><div className="panel-heading"><div><div className="eyebrow">Filtered SOS / {mapFilteredIncidents.length}</div><h3>Signals</h3></div><span className="mini-label">LIST â†” MAP</span></div><IncidentList incidents={mapFilteredIncidents} selected={selectedIncident} onSelect={selectIncident} showResolved={mapStatusFilter === 'RESOLVED' || mapStatusFilter === 'ALL'} /></section><section className="panel map-main"><SituationMap incidents={mapFilteredIncidents} riskZones={data.riskZones} hazards={mapFilteredHazards} selected={selected} onSelectIncident={selectIncident} onSelectZone={selectZone} onSelectHazard={selectHazard} showResolvedIncidents={mapStatusFilter === 'RESOLVED' || mapStatusFilter === 'ALL'} /><div className="map-bottom-strip"><span><CircleDot size={14} /> <strong>{mapFilteredIncidents.length}</strong> SOS shown</span><span><Layers3 size={14} /> <strong>{data.riskZones.filter((zone) => zone.is_active).length}</strong> risk zones</span><span><AlertTriangle size={14} /> <strong>{mapFilteredHazards.length}</strong> hazards shown</span><span><Crosshair size={14} /> Jaipur monitoring area</span></div></section><section className="panel map-detail"><div className="panel-heading"><div><div className="eyebrow">Selection</div><h3>{
  selectedIncident
    ? 'Incident detail'
    : selectedZone
      ? 'Zone detail'
      : selectedHazard
        ? 'Hazard detail'
        : 'Select a record'
}</h3></div></div>{selectedIncident ? <DetailPanel incident={selectedIncident} events={data.events[selectedIncident.id] || []} eventsLoading={eventLoadingId === selectedIncident.id} eventError={eventLoadError?.incidentId === selectedIncident.id ? eventLoadError.message : null} onRetryEvents={() => void loadIncidentEvents(selectedIncident.id, true)} onAcknowledge={handleAcknowledge} onResolve={handleResolve} actionLoading={actionLoading} /> : selectedZone ? <div className="zone-detail"><div className={`zone-detail-icon ${selectedZone.risk_level.toLowerCase()}`}><Layers3 size={20} /></div><h2>{selectedZone.name}</h2><span className={`risk-pill ${selectedZone.risk_level.toLowerCase()}`}>{selectedZone.risk_level} risk</span><div className="zone-detail-grid"><div><span>Risk score</span><strong>{selectedZone.score.toFixed(2)}</strong></div><div><span>Radius</span><strong>{selectedZone.radius_meters}m</strong></div><div><span>Status</span><strong>{selectedZone.is_active ? 'Active' : 'Inactive'}</strong></div><div><span>Expires</span><strong>{formatDate(selectedZone.expires_at)}</strong></div></div><button className="text-action" onClick={() => setSelected(null)}>Clear selection <X size={14} /></button></div> : selectedHazard ? (
  <div className="zone-detail">
    <div className="zone-detail-icon medium">
      <AlertTriangle size={20} />
    </div>

    <h2>HAZ-{String(selectedHazard.id).padStart(3, '0')}</h2>

    <span className={`risk-pill ${selectedHazard.severity.toLowerCase()}`}>
      {selectedHazard.severity} severity
    </span>

    <div className="detail-grid">
      <div className="wide">
        <span>Description</span>
        <strong>{selectedHazard.description}</strong>
      </div>

      <div>
        <span>Category</span>
        <strong>{selectedHazard.category.replace(/_/g, ' ')}</strong>
      </div>

      <div>
        <span>Status</span>
        <strong>{selectedHazard.status.replace(/_/g, ' ')}</strong>
      </div>

      <div>
        <span>Latitude</span>
        <strong>{selectedHazard.latitude.toFixed(5)}</strong>
      </div>

      <div>
        <span>Longitude</span>
        <strong>{selectedHazard.longitude.toFixed(5)}</strong>
      </div>

      <div>
        <span>Submitted</span>
        <strong>{formatDate(selectedHazard.created_at)}</strong>
      </div>

      <div>
        <span>Reporter</span>
        <strong>Tourist #{selectedHazard.reporter_user_id}</strong>
      </div>
    </div>

    {selectedHazard.resolution_note && (
      <div className="detail-callout">
        <div>
          <strong>Review note</strong>
          <span>{selectedHazard.resolution_note}</span>
        </div>
      </div>
    )}

    <button
      className="text-action"
      onClick={() => setSelected(null)}
    >
      Clear selection <X size={14} />
    </button>
  </div>
) : (
  <div className="detail-empty">
    <Target size={28} />
    <strong>Select an incident, hazard or zone</strong>
    <span>Click a marker or risk zone on the map.</span>
  </div>
)}</section></div></>
  const riskPage = <><div className="page-intro"><div><div className="eyebrow">Deterministic backend layer / {data.riskZones.length} zones</div><h2>Risk zones</h2><p>Current active safety perimeters returned by the MoDoNER backend. No predictive layer is shown.</p></div><div className="map-mode"><Layers3 size={14} /> BACKEND-PROVIDED</div></div><div className="risk-page-grid"><section className="panel risk-cards"><div className="panel-heading"><div><div className="eyebrow">Zone register</div><h3>Active perimeters</h3></div><span className="mini-label">{data.riskZones.length} ZONES</span></div>{data.riskZones.map((zone) => <RiskZoneCard key={zone.id} zone={zone} onSelect={() => { setSelected(zone); setView('live-map') }} />)}</section><section className="panel risk-map"><div className="panel-heading"><div><div className="eyebrow">Geographic context</div><h3>Zone map</h3></div></div><SituationMap incidents={data.incidents} riskZones={data.riskZones} hazards={data.hazards} selected={selectedZone} onSelectIncident={selectIncident} onSelectZone={selectZone} onSelectHazard={selectHazard}/></section></div></>
  const activityPage = <><div className="page-intro"><div><div className="eyebrow">Auditable response trail</div><h2>Activity log</h2><p>Chronological incident events from the current command-center data source.</p></div><div className="map-mode"><Activity size={14} /> EVENT TIMELINE</div></div><section className="panel activity-page-panel"><div className="panel-heading"><div><div className="eyebrow">All events / {Object.values(data.events).flat().length}</div><h3>Recent operator activity</h3></div><span className="mini-label">SOURCE: {isMockMode ? 'DEMO ADAPTER' : 'REST API'}</span></div><div className="activity-log-list"><ActivityFeed incidents={data.incidents} events={data.events} /></div></section></>
  const statusPage = <><div className="page-intro"><div><div className="eyebrow">System status / polled every 30 sec</div><h2>System status</h2><p>Operational indicators are derived from the health endpoint and the active frontend connection.</p></div><button className="primary-action small-action" onClick={() => void loadData(true)}><RefreshCw size={14} /> Run health check</button></div><section className="status-page-grid"><div className="panel status-overview"><div className="status-big"><span className={`status-dot ${data.health?.status === 'healthy' ? 'healthy' : 'created'}`} /><div><span>Current posture</span><strong>{data.health?.status === 'healthy' ? 'OPERATIONAL' : data.health ? 'DEGRADED' : 'UNKNOWN'}</strong><small>Source: GET /health Â· refreshed with command-center data</small></div></div><div className="status-note"><ShieldCheck size={16} /> The dashboard does not infer health from UI state. Backend and database values are displayed only after a successful health response.</div></div><div className="panel service-list"><div className="panel-heading"><div><div className="eyebrow">Service matrix</div><h3>Connectivity</h3></div></div>{[['Backend API', Server, data.health ? 'Operational' : 'Offline'], ['Database', Database, data.health?.database === 'connected' ? 'Connected' : 'Unknown'], ['Authentication', KeyRound, session ? 'Authenticated' : 'Offline'], ['Map service', Globe2, 'OpenStreetMap tiles'], ['Live connection', Radio, 'Polling Â· 30 sec']].map(([name, Icon, value]) => <div className="service-row" key={name as string}><span><Icon size={16} /> {name as string}</span><strong className={(value as string) === 'Offline' ? 'offline' : (value as string) === 'Unknown' ? 'warning-text' : ''}><span className="status-dot healthy" /> {value as string}</strong></div>)}</div></section></>

  let content: ReactNode = overview
  if (view === 'incidents') content = incidentsPage
  if (view === 'live-map') content = mapPage
  if (view === 'risk-zones') content = riskPage
  if (view === 'activity') content = activityPage
  if (view === 'hazards') {
  content = <HazardsPage onShowMap={selectHazard} />
}
  if (view === 'tourists') content = <TouristsPage />
  if (view === 'communications') {
  content = <CommunicationsPage incidents={data.incidents} />
}
  if (view === 'analytics') content = <AnalyticsPage />
  if (view === 'system-status') content = statusPage

  return <div className="app-shell"><Sidebar view={view} setView={(next) => { setView(next); setMobileNav(false) }} onLogout={handleLogout} operator={operator} /><main className="main-shell"><TopBar view={view} operator={operator} health={data.health} incidents={data.incidents} riskZones={data.riskZones} onIncident={(incident) => { setSelected(incident); setView('live-map') }} onZone={(zone) => { setSelected(zone); setView('live-map') }} onRefresh={() => void loadData(true)} onLogout={handleLogout} refreshing={refreshing} /><div className="mobile-nav-toggle"><button onClick={() => setMobileNav((value) => !value)}><Menu size={18} /> Menu</button></div>{mobileNav && <div className="mobile-nav-overlay">{navItems.map(({ id, label, icon: Icon }) => <button key={id} onClick={() => { setView(id); setMobileNav(false) }}><Icon size={16} /> {label}</button>)}</div>}<div className="content-shell">{API_MODE === 'mock' ? <div className="demo-banner"><MessageSquareWarning size={14} /><span><strong>DEMO MODE</strong> â€” seeded operational examples from the isolated mock adapter.</span><button onClick={() => setView('system-status')}>View integration notes <ArrowUpRight size={13} /></button></div> : <div className="demo-banner live-data-banner"><ShieldCheck size={14} /><span><strong>LIVE DATA</strong> â€” connected to the configured MoDoNER FastAPI source.</span><button onClick={() => setView('system-status')}>View integration notes <ArrowUpRight size={13} /></button></div>}{dataError && <div className="connection-banner error"><AlertTriangle size={15} /><span><strong>Backend update problem</strong> â€” {dataError}{lastSuccessAt ? ` Last complete update ${relativeTime(lastSuccessAt)}.` : ' No successful data update has completed yet.'}</span><button onClick={() => void loadData(true)}>Retry</button></div>}{!dataError && lastSuccessAt && <div className="connection-banner quiet"><Clock3 size={15} /><span>Last complete update {relativeTime(lastSuccessAt)}{lastFailureAt ? ` Â· previous failure ${relativeTime(lastFailureAt)}` : ''} Â· polling {Math.round(POLL_INTERVAL_MS / 1000)} sec</span></div>}{loading ? <div className="loading-state"><RefreshCw className="spin" size={20} /><strong>Loading command center dataâ€¦</strong><span>Verifying incidents, risk zones, and system health.</span></div> : content}</div></main>{toast && <div className={`toast ${toast.tone}`}><span>{toast.tone === 'success' ? <CheckCircle2 size={17} /> : toast.tone === 'error' ? <AlertTriangle size={17} /> : <Radio size={17} />}</span><span>{toast.message}</span><button onClick={() => setToast(null)}><X size={14} /></button></div>}</div>
}

export default App
