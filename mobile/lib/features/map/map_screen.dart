import 'package:flutter/material.dart';
import 'package:flutter_map/flutter_map.dart';
import 'package:geolocator/geolocator.dart';
import 'package:latlong2/latlong.dart';

import '../../services/location_service.dart';
import '../../models/risk_zone.dart';
import '../../services/risk_zone_service.dart';

class MapScreen extends StatefulWidget {
  const MapScreen({super.key});

  @override
  State<MapScreen> createState() => _MapScreenState();
}

class _MapScreenState extends State<MapScreen> {
  final LocationService _locationService = LocationService();
  final RiskZoneService _riskZoneService = RiskZoneService();
  Color _getRiskColor(String riskLevel) {
    switch (riskLevel.toUpperCase()) {
      case 'HIGH':
        return Colors.red;

      case 'MEDIUM':
        return Colors.orange;

      case 'LOW':
        return Colors.green;

      default:
        return Colors.grey;
    }
  }

  Position? _position;
  List<RiskZoneModel> _riskZones = [];
  String? _errorMessage;
  bool _isLoading = false;

  @override
  void initState() {
    super.initState();
    _loadLocation();
    _loadRiskZones();
  }

  Future<void> _loadLocation() async {
    setState(() {
      _isLoading = true;
      _errorMessage = null;
    });

    try {
      final position = await _locationService.getCurrentPosition();

      if (!mounted) {
        return;
      }

      setState(() {
        _position = position;
        _isLoading = false;
      });
    } catch (error) {
      if (!mounted) {
        return;
      }

      setState(() {
        _errorMessage = error.toString();
        _isLoading = false;
      });
    }
  }

  Future<void> _loadRiskZones() async {
    try {
      final zones = await _riskZoneService.getRiskZones();

      if (!mounted) {
        return;
      }

      setState(() {
        _riskZones = zones;
      });
    } catch (error) {
      debugPrint('Failed to load risk zones: $error');
    }
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      appBar: AppBar(
        title: const Text('Map'),
        actions: [
          IconButton(
            tooltip: 'Refresh location',
            onPressed: _isLoading ? null : _loadLocation,
            icon: const Icon(Icons.my_location),
          ),
        ],
      ),
      body: _buildBody(),
    );
  }

  Widget _buildBody() {
    if (_isLoading) {
      return const Center(
        child: Column(
          mainAxisAlignment: MainAxisAlignment.center,
          children: [
            CircularProgressIndicator(),
            SizedBox(height: 16),
            Text('Getting your location...'),
          ],
        ),
      );
    }

    if (_errorMessage != null) {
      return Center(
        child: Padding(
          padding: const EdgeInsets.all(24),
          child: Column(
            mainAxisAlignment: MainAxisAlignment.center,
            children: [
              const Icon(Icons.location_off, size: 64),
              const SizedBox(height: 16),
              Text(_errorMessage!, textAlign: TextAlign.center),
              const SizedBox(height: 24),
              FilledButton.icon(
                onPressed: _loadLocation,
                icon: const Icon(Icons.refresh),
                label: const Text('Try Again'),
              ),
            ],
          ),
        ),
      );
    }

    if (_position == null) {
      return const Center(child: Text('Location not available.'));
    }

    final currentLocation = LatLng(_position!.latitude, _position!.longitude);

    return Stack(
      children: [
        // ---------------------------------------------------------
        // MAP
        // ---------------------------------------------------------
        FlutterMap(
          options: MapOptions(initialCenter: currentLocation, initialZoom: 15),
          children: [
            // OpenStreetMap
            TileLayer(
              urlTemplate: 'https://tile.openstreetmap.org/{z}/{x}/{y}.png',
              userAgentPackageName: 'com.modoner.mobile',
            ),

            // -----------------------------------------------------
            // RISK ZONES
            // -----------------------------------------------------
            CircleLayer(
              circles: _riskZones.map((zone) {
                final zoneColor = _getRiskColor(zone.riskLevel);

                return CircleMarker(
                  point: LatLng(zone.latitude, zone.longitude),
                  radius: zone.radiusMeters,
                  useRadiusInMeter: true,
                  color: zoneColor.withValues(alpha: 0.20),
                  borderColor: zoneColor,
                  borderStrokeWidth: 2,
                );
              }).toList(),
            ),

            // -----------------------------------------------------
            // CURRENT LOCATION MARKER
            // -----------------------------------------------------
            MarkerLayer(
              markers: [
                Marker(
                  point: currentLocation,
                  width: 50,
                  height: 50,
                  child: const Icon(Icons.location_pin, size: 50),
                ),
              ],
            ),
          ],
        ),

        // ---------------------------------------------------------
        // RISK ZONE LEGEND
        // ---------------------------------------------------------
        Positioned(
          top: 16,
          right: 16,
          child: Card(
            elevation: 4,
            child: Padding(
              padding: const EdgeInsets.all(12),
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  const Text(
                    'Risk Zones',
                    style: TextStyle(fontWeight: FontWeight.bold, fontSize: 16),
                  ),
                  const SizedBox(height: 10),

                  _RiskLegendItem(color: Colors.green, label: 'Low Risk'),

                  const SizedBox(height: 6),

                  _RiskLegendItem(color: Colors.orange, label: 'Moderate Risk'),

                  const SizedBox(height: 6),

                  _RiskLegendItem(color: Colors.red, label: 'High Risk'),
                ],
              ),
            ),
          ),
        ),

        // ---------------------------------------------------------
        // CURRENT LOCATION INFORMATION
        // ---------------------------------------------------------
        Positioned(
          left: 16,
          right: 16,
          bottom: 16,
          child: Card(
            child: Padding(
              padding: const EdgeInsets.all(16),
              child: Column(
                children: [
                  const Text(
                    'Your Location',
                    style: TextStyle(fontSize: 18, fontWeight: FontWeight.bold),
                  ),
                  const SizedBox(height: 8),
                  Text('Lat: ${_position!.latitude.toStringAsFixed(6)}'),
                  Text('Lng: ${_position!.longitude.toStringAsFixed(6)}'),
                  Text('Accuracy: ${_position!.accuracy.toStringAsFixed(1)} m'),
                ],
              ),
            ),
          ),
        ),
      ],
    );
  }
}

// -----------------------------------------------------------------
// RISK LEGEND ITEM
// -----------------------------------------------------------------

class _RiskLegendItem extends StatelessWidget {
  final Color color;
  final String label;

  const _RiskLegendItem({required this.color, required this.label});

  @override
  Widget build(BuildContext context) {
    return Row(
      mainAxisSize: MainAxisSize.min,
      children: [
        Container(
          width: 14,
          height: 14,
          decoration: BoxDecoration(
            color: color.withValues(alpha: 0.35),
            shape: BoxShape.circle,
            border: Border.all(color: color, width: 1.5),
          ),
        ),
        const SizedBox(width: 8),
        Text(label),
      ],
    );
  }
}
