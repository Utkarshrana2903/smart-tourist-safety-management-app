import 'package:flutter/foundation.dart';

import '../../../core/storage/auth_storage.dart';
import '../../../models/user.dart';
import '../../../services/auth_service.dart';

enum AuthStatus { unauthenticated, loading, authenticated }

class AuthController extends ChangeNotifier {
  final AuthService _authService;
  final AuthStorage _authStorage;

  AuthStatus _status = AuthStatus.unauthenticated;
  UserModel? _user;
  String? _errorMessage;

  AuthController({AuthService? authService, AuthStorage? authStorage})
    : _authService = authService ?? AuthService(),
      _authStorage = authStorage ?? AuthStorage();

  AuthStatus get status => _status;
  UserModel? get user => _user;
  String? get errorMessage => _errorMessage;

  bool get isAuthenticated => _status == AuthStatus.authenticated;

  Future<void> login({required String phone, required String password}) async {
    _setLoading();

    try {
      final result = await _authService.login(phone: phone, password: password);

      await _authStorage.saveToken(result.accessToken);

      _user = result.user;
      _errorMessage = null;
      _status = AuthStatus.authenticated;

      notifyListeners();
    } catch (error) {
      _status = AuthStatus.unauthenticated;
      _errorMessage = _getErrorMessage(error);

      notifyListeners();
    }
  }

  Future<void> register({
    required String name,
    required String phone,
    String? email,
    required DateTime dateOfBirth,
    required String password,
  }) async {
    _setLoading();

    try {
      final user = await _authService.register(
        name: name,
        phone: phone,
        email: email,
        dateOfBirth: dateOfBirth,
        password: password,
      );

      _user = user;
      _errorMessage = null;
      _status = AuthStatus.unauthenticated;

      notifyListeners();
    } catch (error) {
      _status = AuthStatus.unauthenticated;
      _errorMessage = _getErrorMessage(error);

      notifyListeners();
    }
  }

  Future<void> restoreSession() async {
    _setLoading();

    try {
      final token = await _authStorage.getToken();

      if (token == null || token.isEmpty) {
        _status = AuthStatus.unauthenticated;
        notifyListeners();
        return;
      }

      final user = await _authService.getCurrentUser(token: token);

      _user = user;
      _errorMessage = null;
      _status = AuthStatus.authenticated;

      notifyListeners();
    } catch (error) {
      await _authStorage.clearToken();

      _user = null;
      _status = AuthStatus.unauthenticated;
      _errorMessage = null;

      notifyListeners();
    }
  }

  Future<void> logout() async {
    await _authStorage.clearToken();

    _user = null;
    _errorMessage = null;
    _status = AuthStatus.unauthenticated;

    notifyListeners();
  }

  void clearError() {
    _errorMessage = null;
    notifyListeners();
  }

  void _setLoading() {
    _status = AuthStatus.loading;
    _errorMessage = null;

    notifyListeners();
  }

  String _getErrorMessage(Object error) {
    return error.toString().replaceFirst('ApiException(', '');
  }
}
