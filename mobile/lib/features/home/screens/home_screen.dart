import 'package:flutter/material.dart';
import 'package:geolocator/geolocator.dart';
import 'package:provider/provider.dart';

import '../../auth/controllers/auth_controller.dart';
import '../../../core/storage/auth_storage.dart';
import '../../../models/incident.dart';
import '../../../models/risk_zone.dart';
import '../../../services/incident_service.dart';
import '../../../services/location_service.dart';
import '../../../services/risk_zone_service.dart';

class HomeScreen extends StatefulWidget {
  const HomeScreen({super.key});

  @override
  State<HomeScreen> createState() => _HomeScreenState();
}

class _HomeScreenState extends State<HomeScreen> {
  final LocationService _locationService = LocationService();
  final RiskZoneService _riskZoneService = RiskZoneService();
  final IncidentService _incidentService = IncidentService();
  final AuthStorage _authStorage = AuthStorage();

  Position? _position;
  String? _locationError;
  bool _locationLoading = true;

  List<RiskZoneModel> _riskZones = [];
  String? _riskZonesError;
  bool _riskZonesLoading = true;

  List<IncidentModel> _incidents = [];
  String? _activityError;
  bool _activityLoading = true;

  @override
  void initState() {
    super.initState();
    WidgetsBinding.instance.addPostFrameCallback((_) {
      if (mounted) {
        _loadDashboard();
      }
    });
  }

  Future<void> _loadDashboard() async {
    await Future.wait<void>([
      _loadLocation(),
      _loadRiskZones(),
      _loadMyIncidents(),
    ]);
  }

  Future<void> _loadLocation() async {
    if (mounted) {
      setState(() {
        _locationLoading = true;
        _locationError = null;
      });
    }

    try {
      final position = await _locationService.getCurrentPosition();
      if (!mounted) return;

      setState(() {
        _position = position;
        _locationError = null;
        _locationLoading = false;
      });
    } catch (error) {
      debugPrint('Home location lookup failed: $error');
      if (!mounted) return;

      setState(() {
        _position = null;
        _locationError = error.toString();
        _locationLoading = false;
      });
    }
  }

  Future<void> _loadRiskZones() async {
    if (mounted) {
      setState(() {
        _riskZonesLoading = true;
        _riskZonesError = null;
      });
    }

    try {
      final zones = await _riskZoneService.getRiskZones();
      if (!mounted) return;

      setState(() {
        _riskZones = zones;
        _riskZonesError = null;
        _riskZonesLoading = false;
      });
    } catch (error) {
      debugPrint('Home risk-zone request failed: $error');
      if (!mounted) return;

      setState(() {
        _riskZonesError =
            'Live risk-zone data could not be loaded. Pull down to retry.';
        _riskZonesLoading = false;
      });
    }
  }

  Future<void> _loadMyIncidents() async {
    if (mounted) {
      setState(() {
        _activityLoading = true;
        _activityError = null;
      });
    }

    try {
      final token = await _authStorage.getToken();
      if (token == null || token.isEmpty) {
        throw StateError('Your login session is unavailable.');
      }

      final incidents = await _incidentService.getMyIncidents(token: token);
      if (!mounted) return;

      setState(() {
        _incidents = incidents;
        _activityError = null;
        _activityLoading = false;
      });
    } catch (error) {
      debugPrint('Home incident-history request failed: $error');
      if (!mounted) return;

      setState(() {
        _activityError =
            'Your incident history could not be loaded. Pull down to retry.';
        _activityLoading = false;
      });
    }
  }

  double _distanceTo(RiskZoneModel zone) {
    final position = _position;
    if (position == null) return double.infinity;

    return Geolocator.distanceBetween(
      position.latitude,
      position.longitude,
      zone.latitude,
      zone.longitude,
    );
  }

  int _riskPriority(String level) {
    switch (level.toUpperCase()) {
      case 'HIGH':
        return 0;
      case 'MEDIUM':
        return 1;
      case 'LOW':
        return 2;
      default:
        return 3;
    }
  }

  List<RiskZoneModel> get _nearbyZones {
    final position = _position;
    if (position == null) return [];

    final now = DateTime.now();

    final matches = _riskZones.where((zone) {
      final notExpired =
          zone.expiresAt == null || zone.expiresAt!.isAfter(now);

      return zone.isActive &&
          notExpired &&
          _distanceTo(zone) <= zone.radiusMeters;
    }).toList();

    matches.sort((a, b) {
      final priority = _riskPriority(a.riskLevel).compareTo(
        _riskPriority(b.riskLevel),
      );

      if (priority != 0) return priority;
      return _distanceTo(a).compareTo(_distanceTo(b));
    });

    return matches;
  }

  RiskZoneModel? get _nearestMatchingZone {
    final zones = _nearbyZones;
    return zones.isEmpty ? null : zones.first;
  }

  Color _riskColor(String level) {
    switch (level.toUpperCase()) {
      case 'HIGH':
        return Colors.red;
      case 'MEDIUM':
        return Colors.deepOrange;
      case 'LOW':
        return Colors.green;
      default:
        return Colors.blueGrey;
    }
  }

  String _formatLevel(String level) {
    if (level.isEmpty) return 'Unknown';
    final normalised = level.toLowerCase();
    return '${normalised[0].toUpperCase()}${normalised.substring(1)}';
  }

  String get _safetyTitle {
    if (_locationLoading || _riskZonesLoading) return 'Checking...';
    if (_position == null) return 'Location unavailable';
    if (_riskZonesError != null) return 'Risk data unavailable';

    final zone = _nearestMatchingZone;
    if (zone == null) return 'No known risk zone nearby';

    return '${_formatLevel(zone.riskLevel)} risk zone nearby';
  }

  String get _safetyDescription {
    if (_locationLoading || _riskZonesLoading) {
      return 'Checking your location against active risk zones.';
    }

    if (_position == null) {
      return _locationError ??
          'Enable location access to check nearby risk zones.';
    }

    if (_riskZonesError != null) {
      return _riskZonesError!;
    }

    final zone = _nearestMatchingZone;
    if (zone != null) {
      return '${zone.name} is within its configured '
          '${zone.radiusMeters.round()} m radius. '
          'Follow local safety guidance.';
    }

    if (_riskZones.isEmpty) {
      return 'The backend returned no active risk zones. '
          'This does not guarantee that the area is safe.';
    }

    return 'Your location is outside the active zone radii returned '
        'by the backend. This does not guarantee that the area is safe.';
  }

  String get _locationValue {
    if (_locationLoading) return 'Getting location...';

    final position = _position;
    if (position == null) return 'Unavailable';

    return '${position.latitude.toStringAsFixed(4)}, '
        '${position.longitude.toStringAsFixed(4)}';
  }

  String get _riskZoneValue {
    if (_locationLoading) return 'Location needed';
    if (_riskZonesLoading) return 'Checking...';
    if (_riskZonesError != null) return 'Unavailable';
    if (_riskZones.isEmpty) return 'No active zones';

    final zone = _nearestMatchingZone;
    if (zone == null) return 'No known zone nearby';

    return '${_formatLevel(zone.riskLevel)} · '
        '${_distanceTo(zone).round()} m';
  }

  String _formatDate(DateTime value) {
    final date = value.toLocal();
    String twoDigits(int number) => number.toString().padLeft(2, '0');

    return '${twoDigits(date.day)}/${twoDigits(date.month)}/${date.year} '
        '${twoDigits(date.hour)}:${twoDigits(date.minute)}';
  }

  Widget _buildActivity() {
    if (_activityLoading) {
      return const Card(
        child: ListTile(
          leading: SizedBox(
            width: 22,
            height: 22,
            child: CircularProgressIndicator(strokeWidth: 2),
          ),
          title: Text('Loading your safety activity...'),
        ),
      );
    }

    if (_activityError != null) {
      return Card(
        child: ListTile(
          leading: const Icon(Icons.cloud_off_outlined),
          title: const Text('Activity unavailable'),
          subtitle: Text(_activityError!),
          trailing: IconButton(
            tooltip: 'Retry incident history',
            onPressed: _loadMyIncidents,
            icon: const Icon(Icons.refresh),
          ),
        ),
      );
    }

    if (_incidents.isEmpty) {
      return const Card(
        child: ListTile(
          leading: Icon(Icons.info_outline),
          title: Text('No recorded safety incidents'),
          subtitle: Text(
            'No SOS incidents have been recorded for your account.',
          ),
        ),
      );
    }

    return Column(
      children: _incidents.take(3).map((incident) {
        return Card(
          child: ListTile(
            leading: Icon(
              Icons.warning_amber_rounded,
              color: _riskColor(incident.severity),
            ),
            title: Text('SOS #${incident.id}'),
            subtitle: Text(
              '${incident.severity} · ${incident.status}\n'
              '${_formatDate(incident.createdAt)} · '
              '${incident.transmissionMethod.replaceAll('_', ' ')}',
            ),
            isThreeLine: true,
          ),
        );
      }).toList(),
    );
  }

  @override
  Widget build(BuildContext context) {
    final authController = context.watch<AuthController>();
    final user = authController.user;
    final zone = _nearestMatchingZone;

    final Color statusColor;
    if (_locationLoading || _riskZonesLoading ||
        _position == null || _riskZonesError != null) {
      statusColor = Theme.of(context).colorScheme.primary;
    } else if (zone != null) {
      statusColor = _riskColor(zone.riskLevel);
    } else {
      // Neutral status: outside known zones is not a guarantee of safety.
      statusColor = Colors.blueGrey;
    }

    return Scaffold(
      appBar: AppBar(
        title: const Text('MoDoNER'),
        actions: [
          IconButton(
            tooltip: 'Refresh safety overview',
            onPressed: _loadDashboard,
            icon: const Icon(Icons.refresh),
          ),
        ],
      ),
      body: SafeArea(
        child: RefreshIndicator(
          onRefresh: _loadDashboard,
          child: SingleChildScrollView(
            physics: const AlwaysScrollableScrollPhysics(),
            padding: const EdgeInsets.all(20),
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Text(
                  'Welcome, ${user?.name ?? 'Tourist'}',
                  style: const TextStyle(
                    fontSize: 24,
                    fontWeight: FontWeight.bold,
                  ),
                ),
                const SizedBox(height: 6),
                const Text(
                  'Your safety overview',
                  style: TextStyle(fontSize: 15),
                ),
                const SizedBox(height: 24),

                Card(
                  child: Padding(
                    padding: const EdgeInsets.all(20),
                    child: Row(
                      crossAxisAlignment: CrossAxisAlignment.start,
                      children: [
                        Icon(
                          Icons.shield_outlined,
                          size: 48,
                          color: statusColor,
                        ),
                        const SizedBox(width: 16),
                        Expanded(
                          child: Column(
                            crossAxisAlignment: CrossAxisAlignment.start,
                            children: [
                              const Text(
                                'Safety Status',
                                style: TextStyle(fontSize: 14),
                              ),
                              const SizedBox(height: 6),
                              Text(
                                _safetyTitle,
                                style: TextStyle(
                                  fontSize: 19,
                                  fontWeight: FontWeight.bold,
                                  color: statusColor,
                                ),
                              ),
                              const SizedBox(height: 8),
                              Text(
                                _safetyDescription,
                                style: Theme.of(context).textTheme.bodyMedium,
                              ),
                            ],
                          ),
                        ),
                      ],
                    ),
                  ),
                ),

                const SizedBox(height: 16),

                Row(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Expanded(
                      child: _InfoCard(
                        icon: Icons.location_on_outlined,
                        title: 'Location',
                        value: _locationValue,
                        subtitle: _position == null &&
                                !_locationLoading &&
                                _locationError != null
                            ? 'Tap refresh to try again.'
                            : null,
                      ),
                    ),
                    const SizedBox(width: 12),
                    Expanded(
                      child: _InfoCard(
                        icon: Icons.warning_amber_outlined,
                        title: 'Risk Zone',
                        value: _riskZoneValue,
                        subtitle: zone != null
                            ? zone.name
                            : _riskZonesError != null
                                ? 'Refresh to retry'
                                : null,
                        valueColor: zone == null
                            ? null
                            : _riskColor(zone.riskLevel),
                      ),
                    ),
                  ],
                ),

                const SizedBox(height: 28),

                const Text(
                  'Recent Safety Activity',
                  style: TextStyle(
                    fontSize: 18,
                    fontWeight: FontWeight.bold,
                  ),
                ),
                const SizedBox(height: 12),
                _buildActivity(),
              ],
            ),
          ),
        ),
      ),
    );
  }
}

class _InfoCard extends StatelessWidget {
  final IconData icon;
  final String title;
  final String value;
  final String? subtitle;
  final Color? valueColor;

  const _InfoCard({
    required this.icon,
    required this.title,
    required this.value,
    this.subtitle,
    this.valueColor,
  });

  @override
  Widget build(BuildContext context) {
    return Card(
      child: Padding(
        padding: const EdgeInsets.all(16),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Icon(icon),
            const SizedBox(height: 12),
            Text(title, style: const TextStyle(fontSize: 13)),
            const SizedBox(height: 6),
            Text(
              value,
              maxLines: 3,
              overflow: TextOverflow.ellipsis,
              style: TextStyle(
                fontSize: 15,
                fontWeight: FontWeight.bold,
                color: valueColor,
              ),
            ),
            if (subtitle != null) ...[
              const SizedBox(height: 6),
              Text(
                subtitle!,
                maxLines: 3,
                overflow: TextOverflow.ellipsis,
                style: Theme.of(context).textTheme.bodySmall,
              ),
            ],
          ],
        ),
      ),
    );
  }
}