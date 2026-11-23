import '../core/network/api_client.dart';
import '../models/incident.dart';

class IncidentService {
  final ApiClient _apiClient = ApiClient();

  Future<List<IncidentModel>> getMyIncidents({
    required String token,
  }) async {
    final data = await _apiClient.getList('/incidents/my', token: token);

    return data
        .map(
          (item) =>
              IncidentModel.fromJson(Map<String, dynamic>.from(item as Map)),
        )
        .toList();
  }

  Future<IncidentModel> createIncident({
    required double latitude,
    required double longitude,
    required DateTime timestamp,
    required String localIncidentId,
    String emergencyStatus = 'ACTIVE',
    DateTime? resolvedAt,
    String severity = 'HIGH',
    String transmissionMethod = 'INTERNET',
    String? audioUrl,
    required String token,
  }) async {
    final data = await _apiClient.post(
      '/incidents',
      token: token,
      body: {
        'latitude': latitude,
        'longitude': longitude,
        'timestamp': timestamp.toIso8601String(),
        'local_incident_id': localIncidentId,
        'emergency_status': emergencyStatus,
        'resolved_at': resolvedAt?.toUtc().toIso8601String(),
        'severity': severity,
        'transmission_method': transmissionMethod,
        'audio_url': audioUrl,
      },
    );

    return IncidentModel.fromJson(data);
  }
}