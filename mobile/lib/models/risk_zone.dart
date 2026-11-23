class RiskZoneModel {
  final int id;
  final String name;
  final double latitude;
  final double longitude;
  final double radiusMeters;
  final String riskLevel;
  final double score;
  final bool isActive;
  final DateTime? expiresAt;
  final DateTime createdAt;
  final DateTime updatedAt;

  RiskZoneModel({
    required this.id,
    required this.name,
    required this.latitude,
    required this.longitude,
    required this.radiusMeters,
    required this.riskLevel,
    required this.score,
    required this.isActive,
    required this.expiresAt,
    required this.createdAt,
    required this.updatedAt,
  });

  factory RiskZoneModel.fromJson(Map<String, dynamic> json) {
    return RiskZoneModel(
      id: json['id'] as int,
      name: json['name'] as String,
      latitude: (json['latitude'] as num).toDouble(),
      longitude: (json['longitude'] as num).toDouble(),
      radiusMeters: (json['radius_meters'] as num).toDouble(),
      riskLevel: json['risk_level'] as String,
      score: (json['score'] as num).toDouble(),
      isActive: json['is_active'] as bool,
      expiresAt: json['expires_at'] != null
          ? DateTime.parse(json['expires_at'] as String)
          : null,
      createdAt: DateTime.parse(json['created_at'] as String),
      updatedAt: DateTime.parse(json['updated_at'] as String),
    );
  }
}