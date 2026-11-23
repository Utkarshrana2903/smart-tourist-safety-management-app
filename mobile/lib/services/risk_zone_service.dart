import '../core/network/api_client.dart';
import '../models/risk_zone.dart';

class RiskZoneService {
  final ApiClient _apiClient = ApiClient();

  Future<List<RiskZoneModel>> getRiskZones() async {
    final data = await _apiClient.getList('/risk-zones');

    return data
        .map(
          (item) =>
              RiskZoneModel.fromJson(Map<String, dynamic>.from(item as Map)),
        )
        .toList();
  }
}
