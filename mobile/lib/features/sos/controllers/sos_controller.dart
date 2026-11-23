import 'dart:async';

import 'package:flutter/foundation.dart';

import '../../../core/storage/auth_storage.dart';
import '../../../services/incident_service.dart';
import '../../../services/location_service.dart';
import '../../../services/offline_sos_storage.dart';
import '../../../services/sms_fallback_service.dart';
import '../../../services/sos_audio_service.dart';

enum SosStatus { idle, loading, success, queued, error }

class SosController extends ChangeNotifier {
  final LocationService _locationService = LocationService();
  final IncidentService _incidentService = IncidentService();
  final AuthStorage _authStorage = AuthStorage();
  final OfflineSosStorage _offlineSosStorage = OfflineSosStorage();
  final SmsFallbackService _smsFallbackService = SmsFallbackService();
  final SosAudioService _sosAudioService = SosAudioService();
  final Set<String> _audioUploadsInProgress = <String>{};

  SosStatus _status = SosStatus.idle;
  String? _errorMessage;
  String? _lastLocalIncidentId;

  SosStatus get status => _status;
  String? get errorMessage => _errorMessage;
  String? get lastLocalIncidentId => _lastLocalIncidentId;
  bool get isLoading => _status == SosStatus.loading;

  Future<void> triggerSos() async {
    if (isLoading) return;

    _status = SosStatus.loading;
    _errorMessage = null;
    notifyListeners();

    String? localIncidentId;
    bool savedLocally = false;

    try {
      final token = await _authStorage.getToken();
      final touristId = await _authStorage.getTouristId();

      if (token == null || token.isEmpty || touristId == null) {
        throw Exception(
          'Your login details are unavailable. '
          'Please log in again before triggering SOS.',
        );
      }

      final timestamp = DateTime.now().toUtc();
      localIncidentId = '${touristId}_${timestamp.microsecondsSinceEpoch}';
      _lastLocalIncidentId = localIncidentId;

      // Persist the emergency request before GPS or network operations.
      // Coordinates stay null unless the device actually supplies them.
      final incident = <String, dynamic>{
        'local_incident_id': localIncidentId,
        'tourist_id': touristId,
        'latitude': null,
        'longitude': null,
        'location_status': 'pending',
        'location_source': 'unavailable',
        'location_accuracy_m': null,
        'location_fix_timestamp': null,
        'timestamp': timestamp.toIso8601String(),
        'severity': 'HIGH',
        'transmission_method': 'INTERNET',
        'emergency_status': 'ACTIVE',
        'sync_status': 'pending',
        'resolved_at': null,
        'resolution_source': null,
        'server_status': 'pending',
        'sms_status': 'not_attempted',
        'last_error': null,
      };

      await _offlineSosStorage.saveSos(incident);
      savedLocally = true;

      // Recording is independent of location and server delivery.
      final audioCapture = _sosAudioService.captureTenSeconds();
      unawaited(
        _completeAudioCapture(
          captureFuture: audioCapture,
          localIncidentId: localIncidentId,
          token: token,
        ),
      );
      notifyListeners();

      double? latitude;
      double? longitude;
      double? accuracy;
      String? fixTimestamp;
      String locationSource = 'unavailable';
      String? locationError;

      // First try to obtain a fresh GPS fix.
      try {
        final position = await _locationService.getCurrentPosition();
        latitude = position.latitude;
        longitude = position.longitude;
        accuracy = position.accuracy;
        fixTimestamp = position.timestamp.toUtc().toIso8601String();
        locationSource = 'current';
      } catch (error) {
        locationError = error.toString();
      }

      // If fresh GPS fails, try a cached position. This may be stale,
      // so the source is recorded and disclosed in the SMS draft.
      if (latitude == null || longitude == null) {
        try {
          final previous = await _locationService.getLastKnownPosition();
          if (previous != null) {
            latitude = previous.latitude;
            longitude = previous.longitude;
            accuracy = previous.accuracy;
            fixTimestamp = previous.timestamp.toUtc().toIso8601String();
            locationSource = 'last_known';
          }
        } catch (error) {
          locationError =
              '${locationError ?? 'Fresh GPS was unavailable.'} '
              'Last-known location lookup also failed: $error';
        }
      }

      // Still preserve the SOS and offer the user-controlled SMS fallback,
      // even when neither fresh nor cached coordinates are available.
      if (latitude == null || longitude == null) {
        final reason = locationError ?? 'No last-known GPS position was available.';

        try {
          await _offlineSosStorage.updateSos(localIncidentId, {
            'location_status': 'unavailable',
            'location_source': 'unavailable',
            'server_status': 'pending',
            'sync_status': 'pending',
            'last_error': reason,
          });
        } catch (_) {
          // The initial local SOS record must remain available.
        }

        _status = SosStatus.queued;
        _errorMessage =
            'SOS saved on this device, but a usable location could not '
            'be obtained. No server submission was attempted. You can '
            'open an SMS draft; it will clearly state that location is '
            'unavailable. Details: $reason';

        notifyListeners();
        return;
      }

      await _offlineSosStorage.updateSos(localIncidentId, {
        'latitude': latitude,
        'longitude': longitude,
        'location_status': 'available',
        'location_source': locationSource,
        'location_accuracy_m': accuracy,
        'location_fix_timestamp': fixTimestamp,
      });

      // Network delivery happens only after a real position was obtained.
      try {
        await _incidentService.createIncident(
          latitude: latitude,
          longitude: longitude,
          timestamp: timestamp,
          localIncidentId: localIncidentId,
          severity: 'HIGH',
          transmissionMethod: 'INTERNET',
          token: token,
          emergencyStatus: 'ACTIVE',
        );

        await _offlineSosStorage.updateSos(localIncidentId, {
          'server_status': 'accepted',
          'sync_status': 'synced',
          'last_error': null,
        });

        unawaited(_tryUploadSavedAudio(localIncidentId, token));

        _status = SosStatus.success;
        _errorMessage = null;
      } catch (error) {
        try {
          await _offlineSosStorage.updateSos(localIncidentId, {
            'server_status': 'pending',
            'sync_status': 'pending',
            'last_error': error.toString(),
          });
        } catch (_) {
          // Preserve the original transmission error.
        }

        _status = SosStatus.queued;
        _errorMessage =
            'SOS saved on this device, but server delivery could not be '
            'confirmed. It remains pending. Details: $error';
        if (locationSource == 'last_known') {
          _errorMessage =
              'SOS saved using the device last-known location. That '
              'position may be out of date. Server delivery could not '
              'be confirmed; the SOS remains pending. Details: $error';
        }
      }
    } catch (error) {
      if (savedLocally) {
        _status = SosStatus.queued;
        _errorMessage =
            'SOS was saved locally but a later step failed. It remains '
            'pending. Details: $error';
      } else {
        _status = SosStatus.error;
        _errorMessage = error.toString();
      }
    }

    notifyListeners();
  }
  Future<List<Map<String, dynamic>>> getActiveSosRecords() async {
    final incidents = await _offlineSosStorage.getPendingSos();

    return incidents
        .where((incident) => incident['emergency_status'] != 'RESOLVED')
        .toList();
  }

  Future<List<Map<String, dynamic>>> getSosRecordsForReview() async {
    final incidents = await _offlineSosStorage.getPendingSos();

    return incidents.where((incident) {
      final isActive = incident['emergency_status'] != 'RESOLVED';
      final needsSync = incident['sync_status'] != 'synced';
      return isActive || needsSync;
    }).toList();
  }

  Future<void> openSmsFallbackDraft({
    required String localIncidentId,
  }) async {
    const phoneNumber = '112';

    final records = await _offlineSosStorage.getPendingSos();
    final index = records.indexWhere(
      (record) => record['local_incident_id'] == localIncidentId,
    );

    if (index == -1) {
      throw StateError('SOS record not found: $localIncidentId');
    }

    final record = records[index];
    final currentSmsStatus = record['sms_status']?.toString();

    if (currentSmsStatus == 'attempting' ||
        currentSmsStatus == 'opening_draft') {
      throw StateError('The SMS draft is already being opened.');
    }

    if (currentSmsStatus == 'submitted') {
      throw StateError(
        'A previous SMS submission was recorded for this incident. '
        'Check its status before creating another draft.',
      );
    }

    final latitude = record['latitude'];
    final longitude = record['longitude'];
    final timestamp = record['timestamp'];

    if (timestamp == null) {
      throw StateError('The saved SOS record is missing its timestamp.');
    }

    final hasLocation = latitude is num && longitude is num;
    final emergencyStatus =
        record['emergency_status']?.toString() ?? 'ACTIVE';

    final messageParts = <String>[
      'MODONER SOS ALERT',
      'Emergency assistance requested for a tourist.',
      'Incident ID: $localIncidentId',
      'Severity: ${record['severity'] ?? 'HIGH'}',
      'Emergency status: $emergencyStatus',
    ];

    if (hasLocation) {
      messageParts.add('Location coordinates: $latitude, $longitude');
      messageParts.add(
        'Map: https://maps.google.com/?q=$latitude,$longitude',
      );

      if (record['location_accuracy_m'] is num) {
        messageParts.add(
          'Location accuracy: '
          '${(record['location_accuracy_m'] as num).round()} metres',
        );
      }

      if (record['location_source'] == 'last_known') {
        messageParts.add(
          'WARNING: These are last-known coordinates and may be out of date.',
        );
      }
    } else {
      messageParts.add(
        'LOCATION UNAVAILABLE: This device could not obtain GPS coordinates.',
      );
      messageParts.add(
        'Please provide your location verbally when requesting help.',
      );
    }

    messageParts.add('Recorded at (UTC): $timestamp');
    final message = messageParts.join('\n');

    await _offlineSosStorage.updateSos(localIncidentId, {
      'sms_status': 'opening_draft',
      'sms_recipient': phoneNumber,
      'sms_error': null,
    });

    notifyListeners();

    try {
      final result = await _smsFallbackService.openSmsDraft(
        phoneNumber: phoneNumber,
        message: message,
      );

      await _offlineSosStorage.updateSos(localIncidentId, {
        'sms_status': 'draft_opened',
        'sms_draft_opened_at': DateTime.now().toUtc().toIso8601String(),
        'sms_result': result['details']?.toString(),
        'sms_error': null,
      });
    } catch (error) {
      try {
        await _offlineSosStorage.updateSos(localIncidentId, {
          'sms_status': 'failed',
          'sms_error': error.toString(),
        });
      } catch (_) {
        // Preserve the original error.
      }

      rethrow;
    } finally {
      notifyListeners();
    }
  }
  Future<void> syncSos(String localIncidentId) async {
    final incidents = await _offlineSosStorage.getPendingSos();
    final index = incidents.indexWhere(
      (item) => item['local_incident_id'] == localIncidentId,
    );

    if (index == -1) {
      throw StateError('SOS record not found: $localIncidentId');
    }

    final record = incidents[index];
    final token = await _authStorage.getToken();

    if (token == null || token.isEmpty) {
      throw StateError('Please log in again before syncing this SOS.');
    }

    final timestampValue = record['timestamp'];
    if (timestampValue == null) {
      throw StateError('SOS record has no timestamp.');
    }

    final timestamp = DateTime.parse(timestampValue.toString()).toUtc();
    final emergencyStatus = record['emergency_status'] == 'RESOLVED'
        ? 'RESOLVED'
        : 'ACTIVE';

    final resolvedAtValue = record['resolved_at'];
    final resolvedAt = resolvedAtValue == null
        ? null
        : DateTime.parse(resolvedAtValue.toString()).toUtc();

    try {
      final latitude = record['latitude'];
      final longitude = record['longitude'];

      if (latitude is! num || longitude is! num) {
        throw StateError(
          'This SOS has no valid coordinates. It remains saved locally '
          'and cannot be synchronized until a valid location is available.',
        );
      }

      final serverIncident = await _incidentService.createIncident(
        latitude: latitude.toDouble(),
        longitude: longitude.toDouble(),
        timestamp: timestamp,
        localIncidentId: localIncidentId,
        severity: record['severity']?.toString() ?? 'HIGH',
        transmissionMethod:
            record['transmission_method']?.toString() ?? 'INTERNET',
        token: token,
        emergencyStatus: emergencyStatus,
        resolvedAt: resolvedAt,
      );

      if (emergencyStatus == 'RESOLVED' &&
          serverIncident.status != 'RESOLVED') {
        throw StateError(
          'The server did not confirm the SOS resolution. '
          'The record remains pending synchronization.',
        );
      }

      final updates = <String, dynamic>{
        'server_status': 'accepted',
        'sync_status': 'synced',
        'last_error': null,
      };

      if (serverIncident.status == 'RESOLVED') {
        updates['emergency_status'] = 'RESOLVED';
        if (serverIncident.resolvedAt != null) {
          updates['resolved_at'] = serverIncident.resolvedAt!
              .toUtc()
              .toIso8601String();
        }
        if (serverIncident.resolutionSource != null) {
          updates['resolution_source'] = serverIncident.resolutionSource;
        }
      }

      await _offlineSosStorage.updateSos(localIncidentId, updates);

      // A previously queued clip can now be uploaded after incident sync.
      unawaited(_tryUploadSavedAudio(localIncidentId, token));
    } catch (error) {
      try {
        await _offlineSosStorage.updateSos(localIncidentId, {
          'sync_status': 'pending',
          'last_error': error.toString(),
        });
      } catch (_) {
        // Preserve the original synchronization error.
      }
      rethrow;
    } finally {
      notifyListeners();
    }
  }

  Future<void> _completeAudioCapture({
    required Future<String?> captureFuture,
    required String localIncidentId,
    required String token,
  }) async {
    String? audioPath;

    try {
      audioPath = await captureFuture;
    } catch (_) {
      // Audio is optional and must never affect SOS delivery.
    }

    if (audioPath == null || audioPath.isEmpty) {
      try {
        await _offlineSosStorage.updateSos(localIncidentId, {
          'audio_status': 'unavailable',
        });
      } catch (_) {
        // The SOS itself remains saved independently.
      }
      return;
    }

    try {
      // Retain the private local file until the backend confirms upload.
      await _offlineSosStorage.updateSos(localIncidentId, {
        'audio_local_path': audioPath,
        'audio_status': 'pending_upload',
        'audio_upload_error': null,
      });
    } catch (_) {
      // If the record cannot retain the path, remove the orphaned clip.
      try {
        await _sosAudioService.deleteLocalAudio(audioPath);
      } catch (_) {
        // Do not propagate cleanup failures into the SOS flow.
      }
      return;
    }

    // This method checks whether the server has accepted the incident.
    await _tryUploadSavedAudio(localIncidentId, token);
  }

  Future<void> _tryUploadSavedAudio(
    String localIncidentId,
    String token,
  ) async {
    if (_audioUploadsInProgress.contains(localIncidentId)) return;

    _audioUploadsInProgress.add(localIncidentId);

    try {
      final records = await _offlineSosStorage.getPendingSos();
      final index = records.indexWhere(
        (record) => record['local_incident_id'] == localIncidentId,
      );

      if (index == -1) return;

      final record = records[index];
      final audioPath = record['audio_local_path']?.toString();

      // Do not upload until the incident is confirmed by the backend.
      if (audioPath == null ||
          audioPath.isEmpty ||
          record['sync_status'] != 'synced' ||
          record['server_status'] != 'accepted' ||
          record['audio_status'] == 'uploaded') {
        return;
      }

      await _offlineSosStorage.updateSos(localIncidentId, {
        'audio_status': 'uploading',
        'audio_upload_error': null,
      });

      try {
        await _sosAudioService.uploadAudio(
          filePath: audioPath,
          localIncidentId: localIncidentId,
          token: token,
        );

        // The server has confirmed receipt. Mark it before deleting locally.
        await _offlineSosStorage.updateSos(localIncidentId, {
          'audio_status': 'uploaded',
          'audio_local_path': null,
          'audio_uploaded_at': DateTime.now().toUtc().toIso8601String(),
          'audio_upload_error': null,
        });

        try {
          await _sosAudioService.deleteLocalAudio(audioPath);
        } catch (_) {
          // The upload is confirmed; leftover local audio is non-fatal.
        }
      } catch (error) {
        // Keep the file path so a later sync can retry.
        try {
          await _offlineSosStorage.updateSos(localIncidentId, {
            'audio_status': 'pending_upload',
            'audio_upload_error': error.toString(),
          });
        } catch (_) {
          // Preserve the SOS record even if this status update fails.
        }
      }
    } catch (_) {
      // Background audio bookkeeping must not disrupt emergency workflows.
    } finally {
      _audioUploadsInProgress.remove(localIncidentId);
    }
  }

  Future<void> resolveSos(String localIncidentId) async {
    try {
      await _offlineSosStorage.resolveSos(localIncidentId);
      _errorMessage = null;
    } catch (error) {
      _errorMessage =
          'Could not save the SOS resolution on this device. '
          'Please try again. Details: $error';
      rethrow;
    } finally {
      notifyListeners();
    }
  }

  void reset() {
    _status = SosStatus.idle;
    _errorMessage = null;
    notifyListeners();
  }
}
