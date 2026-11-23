import 'package:flutter/material.dart';

import '../../core/network/api_client.dart';
import '../../core/storage/auth_storage.dart';
import '../../services/location_service.dart';

class HazardsScreen extends StatefulWidget {
  const HazardsScreen({super.key});

  @override
  State<HazardsScreen> createState() => _HazardsScreenState();
}

class _HazardsScreenState extends State<HazardsScreen> {
  final _formKey = GlobalKey<FormState>();
  final _descriptionController = TextEditingController();

  final ApiClient _apiClient = ApiClient();
  final AuthStorage _authStorage = AuthStorage();
  final LocationService _locationService = LocationService();

  static const Map<String, String> _categories = {
    'ROAD_DAMAGE': 'Road damage / blocked route',
    'POOR_LIGHTING': 'Poor lighting',
    'UNSAFE_AREA': 'Unsafe or suspicious area',
    'MEDICAL': 'Medical assistance needed',
    'CROWDING': 'Dangerous crowding',
    'OTHER': 'Other hazard',
  };

  static const Map<String, String> _severities = {
    'LOW': 'Low',
    'MEDIUM': 'Medium',
    'HIGH': 'High',
  };

  String _category = 'ROAD_DAMAGE';
  String _severity = 'MEDIUM';

  double? _latitude;
  double? _longitude;

  bool _capturingLocation = false;
  bool _submitting = false;
  bool _loadingReports = true;

  String? _locationError;
  String? _reportError;
  List<Map<String, dynamic>> _reports = [];

  @override
  void initState() {
    super.initState();
    _loadReports();
  }

  @override
  void dispose() {
    _descriptionController.dispose();
    super.dispose();
  }

  Future<String> _requireToken() async {
    final token = await _authStorage.getToken();

    if (token == null || token.isEmpty) {
      throw Exception('Your session is missing. Please sign in again.');
    }

    return token;
  }

  Future<void> _loadReports() async {
    if (mounted) {
      setState(() {
        _loadingReports = true;
        _reportError = null;
      });
    }

    try {
      final token = await _requireToken();
      final result = await _apiClient.getList(
        '/hazards/my',
        token: token,
      );

      final reports = result
          .map((item) => Map<String, dynamic>.from(item as Map))
          .toList();

      if (!mounted) return;

      setState(() {
        _reports = reports;
      });
    } catch (error) {
      if (!mounted) return;

      setState(() {
        _reportError = 'Could not load your hazard reports. $error';
      });
    } finally {
      if (mounted) {
        setState(() {
          _loadingReports = false;
        });
      }
    }
  }

  Future<void> _captureLocation() async {
    setState(() {
      _capturingLocation = true;
      _locationError = null;
    });

    try {
      final position = await _locationService.getCurrentPosition();

      if (!mounted) return;

      setState(() {
        _latitude = position.latitude;
        _longitude = position.longitude;
      });

      ScaffoldMessenger.of(context).showSnackBar(
        const SnackBar(content: Text('Current location captured.')),
      );
    } catch (error) {
      if (!mounted) return;

      setState(() {
        _locationError = error.toString();
      });

      ScaffoldMessenger.of(context).showSnackBar(
        SnackBar(content: Text('Could not capture location: $error')),
      );
    } finally {
      if (mounted) {
        setState(() {
          _capturingLocation = false;
        });
      }
    }
  }

  Future<void> _submitReport() async {
    FocusScope.of(context).unfocus();

    if (!_formKey.currentState!.validate()) return;

    if (_latitude == null || _longitude == null) {
      ScaffoldMessenger.of(context).showSnackBar(
        const SnackBar(
          content: Text('Capture your location before submitting the report.'),
        ),
      );
      return;
    }

    setState(() {
      _submitting = true;
    });

    try {
      final token = await _requireToken();

      final created = await _apiClient.post(
        '/hazards',
        token: token,
        body: {
          'category': _category,
          'description': _descriptionController.text.trim(),
          'latitude': _latitude,
          'longitude': _longitude,
          'severity': _severity,
        },
      );

      if (!mounted) return;

      _descriptionController.clear();

      setState(() {
        _category = 'ROAD_DAMAGE';
        _severity = 'MEDIUM';
      });

      ScaffoldMessenger.of(context).showSnackBar(
        SnackBar(
          content: Text(
            'Hazard #${created['id']} submitted for review.',
          ),
        ),
      );

      await _loadReports();
    } catch (error) {
      if (!mounted) return;

      ScaffoldMessenger.of(context).showSnackBar(
        SnackBar(
          content: Text(
            'Hazard was not confirmed as submitted. '
            'Check your connection and reports before retrying. $error',
          ),
          duration: const Duration(seconds: 6),
        ),
      );
    } finally {
      if (mounted) {
        setState(() {
          _submitting = false;
        });
      }
    }
  }

  String _categoryName(dynamic value) {
    final key = value?.toString() ?? '';
    return _categories[key] ?? key.replaceAll('_', ' ');
  }

  Color _severityColor(String severity) {
    switch (severity.toUpperCase()) {
      case 'HIGH':
        return Colors.red.shade700;
      case 'LOW':
        return Colors.green.shade700;
      default:
        return Colors.orange.shade800;
    }
  }

  Color _statusColor(String status) {
    switch (status.toUpperCase()) {
      case 'VERIFIED':
        return Colors.green.shade700;
      case 'RESOLVED':
        return Colors.blue.shade700;
      case 'REJECTED':
        return Colors.red.shade700;
      default:
        return Colors.orange.shade800;
    }
  }

  String _formatTimestamp(dynamic value) {
    final parsed = DateTime.tryParse(value?.toString() ?? '');

    if (parsed == null) return 'Time unavailable';

    final local = parsed.toLocal();

    String twoDigits(int value) => value.toString().padLeft(2, '0');

    return '${twoDigits(local.day)}/${twoDigits(local.month)}/${local.year} '
        '${twoDigits(local.hour)}:${twoDigits(local.minute)}';
  }

  Widget _buildReportCard(Map<String, dynamic> report) {
    final severity = report['severity']?.toString() ?? 'MEDIUM';
    final status = report['status']?.toString() ?? 'PENDING_REVIEW';

    return Card(
      margin: const EdgeInsets.only(bottom: 12),
      child: Padding(
        padding: const EdgeInsets.all(14),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Row(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                const Icon(Icons.warning_amber_rounded, size: 25),
                const SizedBox(width: 10),
                Expanded(
                  child: Text(
                    _categoryName(report['category']),
                    style: Theme.of(context).textTheme.titleMedium,
                  ),
                ),
                Text(
                  '#${report['id']}',
                  style: Theme.of(context).textTheme.labelMedium,
                ),
              ],
            ),
            const SizedBox(height: 10),
            Text(report['description']?.toString() ?? ''),
            const SizedBox(height: 12),
            Wrap(
              spacing: 8,
              runSpacing: 8,
              children: [
                Chip(
                  label: Text(severity),
                  visualDensity: VisualDensity.compact,
                  labelStyle: TextStyle(
                    color: _severityColor(severity),
                    fontWeight: FontWeight.w600,
                  ),
                ),
                Chip(
                  label: Text(status.replaceAll('_', ' ')),
                  visualDensity: VisualDensity.compact,
                  labelStyle: TextStyle(
                    color: _statusColor(status),
                    fontWeight: FontWeight.w600,
                  ),
                ),
              ],
            ),
            const SizedBox(height: 6),
            Text(
              '${(report['latitude'] as num?)?.toStringAsFixed(5) ?? '—'}, '
              '${(report['longitude'] as num?)?.toStringAsFixed(5) ?? '—'}',
              style: Theme.of(context).textTheme.bodySmall,
            ),
            const SizedBox(height: 4),
            Text(
              'Reported ${_formatTimestamp(report['created_at'])}',
              style: Theme.of(context).textTheme.bodySmall,
            ),
            if (report['resolution_note'] != null &&
                report['resolution_note'].toString().trim().isNotEmpty) ...[
              const SizedBox(height: 8),
              Text('Review note: ${report['resolution_note']}'),
            ],
          ],
        ),
      ),
    );
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      appBar: AppBar(
        title: const Text('Hazards'),
        actions: [
          IconButton(
            tooltip: 'Refresh reports',
            onPressed: _loadingReports ? null : _loadReports,
            icon: const Icon(Icons.refresh),
          ),
        ],
      ),
      body: SafeArea(
        child: RefreshIndicator(
          onRefresh: _loadReports,
          child: ListView(
            padding: const EdgeInsets.all(16),
            children: [
              Text(
                'Report a hazard',
                style: Theme.of(context).textTheme.headlineSmall,
              ),
              const SizedBox(height: 6),
              Text(
                'Help other tourists by reporting unsafe conditions '
                'around your current location.',
                style: Theme.of(context).textTheme.bodyMedium,
              ),
              const SizedBox(height: 18),
              Card(
                child: Padding(
                  padding: const EdgeInsets.all(16),
                  child: Form(
                    key: _formKey,
                    child: Column(
                      crossAxisAlignment: CrossAxisAlignment.stretch,
                      children: [
                        DropdownButtonFormField<String>(
                          initialValue: _category,
                          isExpanded: true,
                          decoration: const InputDecoration(
                            labelText: 'Hazard category',
                            border: OutlineInputBorder(),
                          ),
                          items: _categories.entries
                              .map(
                                (entry) => DropdownMenuItem<String>(
                                  value: entry.key,
                                  child: Text(
                                    entry.value,
                                    overflow: TextOverflow.ellipsis,
                                  ),
                                ),
                              )
                              .toList(),
                          onChanged: _submitting
                              ? null
                              : (value) {
                                  if (value != null) {
                                    setState(() {
                                      _category = value;
                                    });
                                  }
                                },
                        ),
                        const SizedBox(height: 16),
                        DropdownButtonFormField<String>(
                          initialValue: _severity,
                          decoration: const InputDecoration(
                            labelText: 'Severity',
                            border: OutlineInputBorder(),
                          ),
                          items: _severities.entries
                              .map(
                                (entry) => DropdownMenuItem<String>(
                                  value: entry.key,
                                  child: Text(entry.value),
                                ),
                              )
                              .toList(),
                          onChanged: _submitting
                              ? null
                              : (value) {
                                  if (value != null) {
                                    setState(() {
                                      _severity = value;
                                    });
                                  }
                                },
                        ),
                        const SizedBox(height: 16),
                        TextFormField(
                          controller: _descriptionController,
                          minLines: 3,
                          maxLines: 5,
                          maxLength: 1000,
                          textCapitalization: TextCapitalization.sentences,
                          decoration: const InputDecoration(
                            labelText: 'Description',
                            hintText:
                                'Describe what is unsafe and where it is located.',
                            alignLabelWithHint: true,
                            border: OutlineInputBorder(),
                          ),
                          validator: (value) {
                            final text = value?.trim() ?? '';

                            if (text.length < 5) {
                              return 'Enter at least 5 characters.';
                            }

                            if (text.length > 1000) {
                              return 'Description is too long.';
                            }

                            return null;
                          },
                        ),
                        const SizedBox(height: 8),
                        OutlinedButton.icon(
                          onPressed:
                              _capturingLocation || _submitting
                                  ? null
                                  : _captureLocation,
                          icon: _capturingLocation
                              ? const SizedBox(
                                  width: 18,
                                  height: 18,
                                  child: CircularProgressIndicator(
                                    strokeWidth: 2,
                                  ),
                                )
                              : const Icon(Icons.my_location),
                          label: Text(
                            _capturingLocation
                                ? 'Getting location…'
                                : 'Capture current location',
                          ),
                        ),
                        const SizedBox(height: 8),
                        if (_latitude != null && _longitude != null)
                          Text(
                            'Location: ${_latitude!.toStringAsFixed(6)}, '
                            '${_longitude!.toStringAsFixed(6)}',
                            style: Theme.of(context).textTheme.bodySmall,
                          )
                        else
                          Text(
                            'Location has not been captured yet.',
                            style: Theme.of(context).textTheme.bodySmall,
                          ),
                        if (_locationError != null) ...[
                          const SizedBox(height: 6),
                          Text(
                            _locationError!,
                            style: TextStyle(color: Colors.red.shade700),
                          ),
                        ],
                        const SizedBox(height: 18),
                        FilledButton.icon(
                          onPressed: _submitting ? null : _submitReport,
                          icon: _submitting
                              ? const SizedBox(
                                  width: 18,
                                  height: 18,
                                  child: CircularProgressIndicator(
                                    strokeWidth: 2,
                                  ),
                                )
                              : const Icon(Icons.send_outlined),
                          label: Text(
                            _submitting
                                ? 'Submitting…'
                                : 'Submit hazard report',
                          ),
                        ),
                      ],
                    ),
                  ),
                ),
              ),
              const SizedBox(height: 24),
              Row(
                children: [
                  Expanded(
                    child: Text(
                      'My reports',
                      style: Theme.of(context).textTheme.titleLarge,
                    ),
                  ),
                  Text('${_reports.length}'),
                ],
              ),
              const SizedBox(height: 12),
              if (_loadingReports && _reports.isEmpty)
                const Padding(
                  padding: EdgeInsets.all(24),
                  child: Center(child: CircularProgressIndicator()),
                )
              else if (_reportError != null && _reports.isEmpty)
                Card(
                  child: Padding(
                    padding: const EdgeInsets.all(16),
                    child: Column(
                      children: [
                        Text(_reportError!),
                        const SizedBox(height: 8),
                        OutlinedButton.icon(
                          onPressed: _loadReports,
                          icon: const Icon(Icons.refresh),
                          label: const Text('Try again'),
                        ),
                      ],
                    ),
                  ),
                )
              else if (_reports.isEmpty)
                const Card(
                  child: Padding(
                    padding: EdgeInsets.all(18),
                    child: Text(
                      'You have not submitted any hazard reports yet.',
                    ),
                  ),
                )
              else ...[
                if (_reportError != null)
                  Padding(
                    padding: const EdgeInsets.only(bottom: 8),
                    child: Text(
                      _reportError!,
                      style: TextStyle(color: Colors.red.shade700),
                    ),
                  ),
                ..._reports.map(_buildReportCard),
              ],
            ],
          ),
        ),
      ),
    );
  }
}
