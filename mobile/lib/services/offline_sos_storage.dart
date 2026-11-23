import 'dart:convert';

import 'package:shared_preferences/shared_preferences.dart';

class OfflineSosStorage {
  static const String _storageKey = 'modoner_pending_sos';

  Future<List<Map<String, dynamic>>> getPendingSos() async {
    final prefs = await SharedPreferences.getInstance();
    final storedRecords = prefs.getString(_storageKey);

    if (storedRecords == null || storedRecords.isEmpty) {
      return [];
    }

    try {
      final decoded = jsonDecode(storedRecords);

      if (decoded is! List) {
        return [];
      }

      return decoded
          .whereType<Map>()
          .map((record) => Map<String, dynamic>.from(record))
          .toList();
    } on FormatException {
      return [];
    }
  }

  Future<void> saveSos(Map<String, dynamic> incident) async {
    final prefs = await SharedPreferences.getInstance();
    final incidents = await getPendingSos();

    final incidentId = incident['local_incident_id'];

    if (incidentId == null || incidentId.toString().isEmpty) {
      throw ArgumentError('A local incident ID is required.');
    }

    final alreadyExists = incidents.any(
      (item) => item['local_incident_id'] == incidentId,
    );

    if (!alreadyExists) {
      incidents.add(incident);
    }

    final saved = await prefs.setString(_storageKey, jsonEncode(incidents));

    if (!saved) {
      throw StateError('Failed to save SOS on this device.');
    }
  }

  Future<void> updateSos(
    String localIncidentId,
    Map<String, dynamic> updates,
  ) async {
    final prefs = await SharedPreferences.getInstance();
    final incidents = await getPendingSos();

    final index = incidents.indexWhere(
      (item) => item['local_incident_id'] == localIncidentId,
    );

    if (index == -1) {
      throw StateError('SOS record not found: $localIncidentId');
    }

    incidents[index] = {...incidents[index], ...updates};

    final saved = await prefs.setString(_storageKey, jsonEncode(incidents));

    if (!saved) {
      throw StateError('Failed to update SOS record.');
    }
  }

  Future<void> resolveSos(
    String localIncidentId, {
    String resolutionSource = 'tourist',
  }) async {
    final prefs = await SharedPreferences.getInstance();
    final incidents = await getPendingSos();

    final index = incidents.indexWhere(
      (item) => item['local_incident_id'] == localIncidentId,
    );

    if (index == -1) {
      throw StateError('SOS record not found: $localIncidentId');
    }

    final existing = incidents[index];
    final alreadyResolved = existing['emergency_status'] == 'RESOLVED';

    incidents[index] = {
      ...existing,
      'emergency_status': 'RESOLVED',
      'sync_status': 'pending',
      'resolved_at': alreadyResolved && existing['resolved_at'] != null
          ? existing['resolved_at']
          : DateTime.now().toUtc().toIso8601String(),
      'resolution_source':
          alreadyResolved && existing['resolution_source'] != null
          ? existing['resolution_source']
          : resolutionSource,
    };

    final saved = await prefs.setString(_storageKey, jsonEncode(incidents));

    if (!saved) {
      throw StateError('Failed to save SOS resolution.');
    }
  }

  Future<void> removeSos(String localIncidentId) async {
    final prefs = await SharedPreferences.getInstance();
    final incidents = await getPendingSos();

    incidents.removeWhere(
      (item) => item['local_incident_id'] == localIncidentId,
    );

    final saved = await prefs.setString(_storageKey, jsonEncode(incidents));

    if (!saved) {
      throw StateError('Failed to update pending SOS records.');
    }
  }
}
