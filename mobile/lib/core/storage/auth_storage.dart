import 'package:shared_preferences/shared_preferences.dart';

class AuthStorage {
  static const String _tokenKey = 'access_token';
  static const String _touristIdKey = 'tourist_id';

  Future<void> saveToken(String token) async {
    final preferences = await SharedPreferences.getInstance();
    await preferences.setString(_tokenKey, token);
  }

  Future<String?> getToken() async {
    final preferences = await SharedPreferences.getInstance();
    return preferences.getString(_tokenKey);
  }

  Future<void> saveTouristId(int touristId) async {
    final preferences = await SharedPreferences.getInstance();
    await preferences.setInt(_touristIdKey, touristId);
  }

  Future<int?> getTouristId() async {
    final preferences = await SharedPreferences.getInstance();
    return preferences.getInt(_touristIdKey);
  }

  Future<void> clearToken() async {
    final preferences = await SharedPreferences.getInstance();
    await preferences.remove(_tokenKey);
    await preferences.remove(_touristIdKey);
  }
}
