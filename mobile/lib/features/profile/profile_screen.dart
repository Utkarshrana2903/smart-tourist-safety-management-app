import 'package:flutter/material.dart';
import 'package:provider/provider.dart';
import 'package:shared_preferences/shared_preferences.dart';

import '../auth/controllers/auth_controller.dart';

class ProfileScreen extends StatefulWidget {
  const ProfileScreen({super.key});

  @override
  State<ProfileScreen> createState() => _ProfileScreenState();
}

class _ProfileScreenState extends State<ProfileScreen> {
  static const String _recipientKey = 'modoner_sms_recipient';

  final TextEditingController _recipientController = TextEditingController();

  bool _isLoading = true;
  bool _isSaving = false;
  String? _savedRecipient;

  @override
  void initState() {
    super.initState();
    _loadRecipient();
  }

  @override
  void dispose() {
    _recipientController.dispose();
    super.dispose();
  }

  Future<void> _loadRecipient() async {
    try {
      final preferences = await SharedPreferences.getInstance();
      final saved = preferences.getString(_recipientKey);

      if (!mounted) return;

      setState(() {
        _savedRecipient = saved;
        _recipientController.text = saved ?? '';
        _isLoading = false;
      });
    } catch (error) {
      if (!mounted) return;

      setState(() {
        _isLoading = false;
      });

      ScaffoldMessenger.of(context).showSnackBar(
        SnackBar(content: Text('Could not load SMS recipient: $error')),
      );
    }
  }

  Future<void> _saveRecipient() async {
    final recipient = _recipientController.text.trim();

    if (recipient.isEmpty ||
        !RegExp(r'^\+?[0-9][0-9 ()-]{2,19}$').hasMatch(recipient)) {
      ScaffoldMessenger.of(context).showSnackBar(
        const SnackBar(content: Text('Enter a valid recipient phone number.')),
      );
      return;
    }

    setState(() {
      _isSaving = true;
    });

    try {
      final preferences = await SharedPreferences.getInstance();
      await preferences.setString(_recipientKey, recipient);

      if (!mounted) return;

      setState(() {
        _savedRecipient = recipient;
        _isSaving = false;
      });

      ScaffoldMessenger.of(context).showSnackBar(
        const SnackBar(content: Text('SMS recipient saved on this device.')),
      );
    } catch (error) {
      if (!mounted) return;

      setState(() {
        _isSaving = false;
      });

      ScaffoldMessenger.of(context).showSnackBar(
        SnackBar(content: Text('Could not save SMS recipient: $error')),
      );
    }
  }

  String _formatDate(DateTime date) {
    final day = date.day.toString().padLeft(2, '0');
    final month = date.month.toString().padLeft(2, '0');
    return '$day/$month/${date.year}';
  }

  String _formatStatus(String value) {
    return value
        .replaceAll('_', ' ')
        .split(' ')
        .map(
          (part) => part.isEmpty
              ? part
              : '${part[0].toUpperCase()}${part.substring(1).toLowerCase()}',
        )
        .join(' ');
  }

  @override
  Widget build(BuildContext context) {
    final user = context.watch<AuthController>().user;
    final theme = Theme.of(context);

    return Scaffold(
      appBar: AppBar(title: const Text('Profile & Safety Settings')),
      body: ListView(
        padding: const EdgeInsets.all(20),
        children: [
          Text(
            'Personal Information',
            style: theme.textTheme.headlineSmall,
          ),
          const SizedBox(height: 12),

          if (user == null)
            const Card(
              child: ListTile(
                leading: Icon(Icons.person_off_outlined),
                title: Text('Profile information unavailable'),
                subtitle: Text(
                  'Your account details could not be loaded. '
                  'Please sign in again.',
                ),
              ),
            )
          else ...[
            Card(
              child: Padding(
                padding: const EdgeInsets.all(18),
                child: Row(
                  children: [
                    CircleAvatar(
                      radius: 30,
                      child: Text(
                        user.name.trim().isEmpty
                            ? '?'
                            : user.name.trim()[0].toUpperCase(),
                        style: const TextStyle(
                          fontSize: 24,
                          fontWeight: FontWeight.bold,
                        ),
                      ),
                    ),
                    const SizedBox(width: 16),
                    Expanded(
                      child: Column(
                        crossAxisAlignment: CrossAxisAlignment.start,
                        children: [
                          Text(
                            user.name,
                            style: theme.textTheme.titleLarge,
                          ),
                          const SizedBox(height: 5),
                          Text(
                            'Tourist ID: ${user.id}',
                            style: theme.textTheme.bodySmall,
                          ),
                          const SizedBox(height: 8),
                          Container(
                            padding: const EdgeInsets.symmetric(
                              horizontal: 10,
                              vertical: 5,
                            ),
                            decoration: BoxDecoration(
                              color: user.kycStatus.toUpperCase() == 'VERIFIED'
                                  ? Colors.green.withValues(alpha: 0.12)
                                  : theme.colorScheme.surfaceContainerHighest,
                              borderRadius: BorderRadius.circular(20),
                            ),
                            child: Text(
                              'KYC: ${_formatStatus(user.kycStatus)}',
                              style: TextStyle(
                                fontSize: 12,
                                fontWeight: FontWeight.w600,
                                color: user.kycStatus.toUpperCase() == 'VERIFIED'
                                    ? Colors.green.shade700
                                    : theme.colorScheme.onSurfaceVariant,
                              ),
                            ),
                          ),
                        ],
                      ),
                    ),
                  ],
                ),
              ),
            ),
            const SizedBox(height: 12),
            Card(
              child: Column(
                children: [
                  _ProfileInfoRow(
                    icon: Icons.person_outline,
                    label: 'Full name',
                    value: user.name,
                  ),
                  const Divider(height: 1, indent: 56),
                  _ProfileInfoRow(
                    icon: Icons.phone_outlined,
                    label: 'Phone number',
                    value: user.phone,
                  ),
                  const Divider(height: 1, indent: 56),
                  _ProfileInfoRow(
                    icon: Icons.email_outlined,
                    label: 'Email address',
                    value: user.email == null || user.email!.trim().isEmpty
                        ? 'Not provided'
                        : user.email!,
                  ),
                  const Divider(height: 1, indent: 56),
                  _ProfileInfoRow(
                    icon: Icons.calendar_month_outlined,
                    label: 'Date of birth',
                    value: user.dateOfBirth == null
                        ? 'Not provided'
                        : _formatDate(user.dateOfBirth!),
                  ),
                  const Divider(height: 1, indent: 56),
                  _ProfileInfoRow(
                    icon: Icons.verified_user_outlined,
                    label: 'KYC status',
                    value: _formatStatus(user.kycStatus),
                  ),
                ],
              ),
            ),
          ],

          const SizedBox(height: 28),
          Text(
            'Emergency Communication',
            style: theme.textTheme.headlineSmall,
          ),
          const SizedBox(height: 8),
          const Text(
            'Configure the number that MoDoNER can use for '
            'SMS fallback when an SOS cannot be confirmed by '
            'the backend.',
          ),
          const SizedBox(height: 16),

          if (_isLoading) const LinearProgressIndicator(),

          TextField(
            controller: _recipientController,
            enabled: !_isSaving && !_isLoading,
            keyboardType: TextInputType.phone,
            decoration: const InputDecoration(
              labelText: 'Command Center SMS number',
              hintText: '+91XXXXXXXXXX',
              helperText: 'Use an authorized Command Center or test number.',
              prefixIcon: Icon(Icons.phone_outlined),
              border: OutlineInputBorder(),
            ),
          ),
          const SizedBox(height: 16),
          FilledButton.icon(
            onPressed: _isSaving || _isLoading ? null : _saveRecipient,
            icon: _isSaving
                ? const SizedBox(
                    width: 18,
                    height: 18,
                    child: CircularProgressIndicator(strokeWidth: 2),
                  )
                : const Icon(Icons.save_outlined),
            label: Text(_isSaving ? 'Saving...' : 'Save SMS Recipient'),
          ),
          if (_savedRecipient != null) ...[
            const SizedBox(height: 12),
            Card(
              child: ListTile(
                leading: const Icon(
                  Icons.check_circle_outline,
                  color: Colors.green,
                ),
                title: const Text('Recipient configured'),
                subtitle: Text(_savedRecipient!),
              ),
            ),
          ],
          const SizedBox(height: 16),
          const Text(
            'Testing note: use a number you control or an authorized '
            'test recipient. Do not send test messages to 112. Genuine '
            'SMS transmission requires cellular service and a compatible SIM.',
            style: TextStyle(fontSize: 12),
          ),
        ],
      ),
    );
  }
}

class _ProfileInfoRow extends StatelessWidget {
  final IconData icon;
  final String label;
  final String value;

  const _ProfileInfoRow({
    required this.icon,
    required this.label,
    required this.value,
  });

  @override
  Widget build(BuildContext context) {
    return ListTile(
      leading: Icon(icon),
      title: Text(label),
      subtitle: Text(value),
      dense: true,
    );
  }
}