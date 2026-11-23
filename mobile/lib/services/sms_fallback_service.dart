import 'package:flutter/services.dart';

class SmsFallbackService {
  static const MethodChannel _channel = MethodChannel('modoner/sms');

  Future<Map<String, dynamic>> openSmsDraft({
    required String phoneNumber,
    required String message,
  }) async {
    final normalizedNumber = phoneNumber.trim();

    if (normalizedNumber.isEmpty) {
      throw ArgumentError('A recipient phone number is required.');
    }

    if (message.trim().isEmpty) {
      throw ArgumentError('The SMS message cannot be empty.');
    }

    final result = await _channel.invokeMapMethod<String, dynamic>(
      'openSmsDraft',
      {
        'phoneNumber': normalizedNumber,
        'message': message,
      },
    );

    if (result == null) {
      throw StateError('Android returned no SMS draft result.');
    }

    if (result['status'] != 'draft_opened') {
      throw StateError(
        result['details']?.toString() ?? 'The SMS draft was not opened.',
      );
    }

    return result;
  }
}