import 'dart:convert';

import 'package:http/http.dart' as http;

class ApiClient {
  static const String baseUrl = 'http://192.168.33.46:8000';
  static const Duration requestTimeout = Duration(seconds: 10);

  Future<Map<String, dynamic>> post(
    String path, {
    Map<String, dynamic>? body,
    String? token,
  }) async {
    final response = await http
        .post(
          Uri.parse('$baseUrl$path'),
          headers: {
            'Content-Type': 'application/json',
            if (token != null) 'Authorization': 'Bearer $token',
          },
          body: body != null ? jsonEncode(body) : null,
        )
        .timeout(requestTimeout);

    return _handleResponse(response);
  }

  Future<Map<String, dynamic>> get(String path, {String? token}) async {
    final response = await http
        .get(
          Uri.parse('$baseUrl$path'),
          headers: {
            'Content-Type': 'application/json',
            if (token != null) 'Authorization': 'Bearer $token',
          },
        )
        .timeout(requestTimeout);

    return _handleResponse(response);
  }

  Future<List<dynamic>> getList(String path, {String? token}) async {
    final response = await http
        .get(
          Uri.parse('$baseUrl$path'),
          headers: {
            'Content-Type': 'application/json',
            if (token != null) 'Authorization': 'Bearer $token',
          },
        )
        .timeout(requestTimeout);

    final dynamic decodedBody = jsonDecode(response.body);

    if (response.statusCode >= 200 && response.statusCode < 300) {
      return List<dynamic>.from(decodedBody);
    }

    if (decodedBody is Map<String, dynamic> && decodedBody['detail'] != null) {
      throw ApiException(
        statusCode: response.statusCode,
        message: decodedBody['detail'].toString(),
      );
    }

    throw ApiException(
      statusCode: response.statusCode,
      message: 'Request failed',
    );
  }

  Map<String, dynamic> _handleResponse(http.Response response) {
    final dynamic decodedBody = jsonDecode(response.body);

    if (response.statusCode >= 200 && response.statusCode < 300) {
      return Map<String, dynamic>.from(decodedBody);
    }

    if (decodedBody is Map<String, dynamic> && decodedBody['detail'] != null) {
      throw ApiException(
        statusCode: response.statusCode,
        message: decodedBody['detail'].toString(),
      );
    }

    throw ApiException(
      statusCode: response.statusCode,
      message: 'Request failed',
    );
  }
}

class ApiException implements Exception {
  final int statusCode;
  final String message;

  ApiException({required this.statusCode, required this.message});

  @override
  String toString() => 'ApiException($statusCode): $message';
}


