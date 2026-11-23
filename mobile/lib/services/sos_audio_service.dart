import 'dart:convert';
import 'dart:io';

import 'package:http/http.dart' as http;
import 'package:path_provider/path_provider.dart';
import 'package:record/record.dart';

import '../core/network/api_client.dart';

class SosAudioService {
  static const Duration captureDuration = Duration(seconds: 10);
  static const Duration uploadTimeout = Duration(seconds: 20);

  /// Records a best-effort, maximum-10-second AAC-LC clip.
  /// Returns its private local path, or null if capture fails.
  Future<String?> captureTenSeconds() async {
    final recorder = AudioRecorder();
    String? outputPath;
    var recordingStarted = false;

    try {
      if (!await recorder.hasPermission()) {
        return null;
      }

      final appDirectory = await getApplicationDocumentsDirectory();
      final audioDirectory = Directory(
        '${appDirectory.path}${Platform.pathSeparator}sos_audio',
      );
      await audioDirectory.create(recursive: true);

      outputPath =
          '${audioDirectory.path}${Platform.pathSeparator}'
          'sos_${DateTime.now().toUtc().microsecondsSinceEpoch}.m4a';

      await recorder.start(
        const RecordConfig(
          encoder: AudioEncoder.aacLc,
          bitRate: 64000,
          sampleRate: 44100,
          numChannels: 1,
        ),
        path: outputPath,
      );
      recordingStarted = true;

      await Future<void>.delayed(captureDuration);

      final stoppedPath = await recorder.stop();
      recordingStarted = false;

      final resultPath = stoppedPath ?? outputPath;

      final audioFile = File(resultPath);
      if (await audioFile.exists() && await audioFile.length() > 0) {
        return resultPath;
      }

      return null;
    } catch (_) {
      // Recording is optional. Never propagate a capture failure to SOS.
      if (recordingStarted) {
        try {
          await recorder.stop();
        } catch (_) {
          // Preserve best-effort behavior.
        }
      }

      final fallbackPath = outputPath;
      if (fallbackPath != null) {
        try {
          final audioFile = File(fallbackPath);
          if (await audioFile.exists() && await audioFile.length() > 0) {
            return fallbackPath;
          }
        } catch (_) {
          // Treat inaccessible or incomplete audio as unavailable.
        }
      }

      return null;
    } finally {
      try {
        await recorder.dispose();
      } catch (_) {
        // Cleanup failure must not interrupt SOS.
      }
    }
  }

  /// Uploads audio to the authenticated, private incident-audio endpoint.
  Future<Map<String, dynamic>> uploadAudio({
    required String filePath,
    required String localIncidentId,
    required String token,
  }) async {
    final audioFile = File(filePath);

    if (!await audioFile.exists()) {
      throw StateError('The saved SOS audio file no longer exists.');
    }

    if (await audioFile.length() == 0) {
      throw StateError('The saved SOS audio file is empty.');
    }

    final request = http.MultipartRequest(
      'POST',
      Uri.parse('${ApiClient.baseUrl}/incidents/audio'),
    );

    request.headers['Authorization'] = 'Bearer $token';
    request.fields['local_incident_id'] = localIncidentId;
    request.files.add(
      await http.MultipartFile.fromPath('file', filePath),
    );

    final streamedResponse = await request.send().timeout(uploadTimeout);
    final response = await http.Response.fromStream(streamedResponse)
        .timeout(uploadTimeout);

    dynamic decoded;
    try {
      decoded = jsonDecode(response.body);
    } catch (_) {
      decoded = response.body;
    }

    if (response.statusCode >= 200 && response.statusCode < 300) {
      if (decoded is Map) {
        return Map<String, dynamic>.from(decoded);
      }
      return {'status': 'uploaded'};
    }

    final detail = decoded is Map ? decoded['detail']?.toString() : null;
    throw Exception(
      'Audio upload failed (HTTP ${response.statusCode}): '
      '${detail ?? response.body}',
    );
  }

  /// Removes a locally stored clip after it is no longer needed.
  Future<void> deleteLocalAudio(String filePath) async {
    final audioFile = File(filePath);
    if (await audioFile.exists()) {
      await audioFile.delete();
    }
  }
}

