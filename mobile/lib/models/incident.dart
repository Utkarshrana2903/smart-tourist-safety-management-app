class IncidentModel {
  final int id;
  final int userId;
  final double latitude;
  final double longitude;
  final DateTime timestamp;
  final String severity;
  final String status;
  final String transmissionMethod;
  final String? audioUrl;
  final DateTime createdAt;
  final DateTime? resolvedAt;
  final String? resolutionSource;

  IncidentModel({
    required this.id,
    required this.userId,
    required this.latitude,
    required this.longitude,
    required this.timestamp,
    required this.severity,
    required this.status,
    required this.transmissionMethod,
    required this.audioUrl,
    required this.createdAt,
    required this.resolvedAt,
    this.resolutionSource,
  });

  factory IncidentModel.fromJson(Map<String, dynamic> json) {
    return IncidentModel(
      id: json['id'] as int,
      userId: json['user_id'] as int,
      latitude: (json['latitude'] as num).toDouble(),
      longitude: (json['longitude'] as num).toDouble(),
      timestamp: DateTime.parse(json['timestamp'] as String),
      severity: json['severity'] as String,
      status: json['status'] as String,
      transmissionMethod: json['transmission_method'] as String,
      audioUrl: json['audio_url'] as String?,
      createdAt: DateTime.parse(json['created_at'] as String),
      resolutionSource: json['resolution_source'] as String?,
      resolvedAt: json['resolved_at'] != null
          ? DateTime.parse(json['resolved_at'] as String)
          : null,
    );
  }
}
