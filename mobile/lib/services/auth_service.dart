import '../core/network/api_client.dart';
import '../models/user.dart';
import '../core/storage/auth_storage.dart';

class AuthService {
  final ApiClient _apiClient;
  final AuthStorage _authStorage = AuthStorage();

  AuthService({ApiClient? apiClient}) : _apiClient = apiClient ?? ApiClient();

  Future<AuthResult> login({
    required String phone,
    required String password,
  }) async {
    final response = await _apiClient.post(
      '/auth/login',
      body: {'phone': phone, 'password': password},
    );

    final result = AuthResult.fromJson(response);

    await _authStorage.saveToken(result.accessToken);
    await _authStorage.saveTouristId(result.user.id);

    return result;
  }

  Future<UserModel> register({
    required String name,
    required String phone,
    String? email,
    required DateTime dateOfBirth,
    required String password,
  }) async {
    final response = await _apiClient.post(
      '/auth/register',
      body: {
        'name': name,
        'phone': phone,
        if (email != null && email.isNotEmpty) 'email': email,
        'date_of_birth': _formatDate(dateOfBirth),
        'password': password,
      },
    );

    return UserModel.fromJson(response);
  }

  String _formatDate(DateTime date) {
    final month = date.month.toString().padLeft(2, '0');
    final day = date.day.toString().padLeft(2, '0');
    return '${date.year}-$month-$day';
  }

  Future<UserModel> getCurrentUser({required String token}) async {
    final response = await _apiClient.get('/auth/me', token: token);

    return UserModel.fromJson(response);
  }
}

class AuthResult {
  final String accessToken;
  final String tokenType;
  final UserModel user;

  AuthResult({
    required this.accessToken,
    required this.tokenType,
    required this.user,
  });

  factory AuthResult.fromJson(Map<String, dynamic> json) {
    return AuthResult(
      accessToken: json['access_token'] as String,
      tokenType: json['token_type'] as String,
      user: UserModel.fromJson(Map<String, dynamic>.from(json['user'])),
    );
  }
}
