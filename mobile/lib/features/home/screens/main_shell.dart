// ignore_for_file: unnecessary_underscores

import 'package:flutter/material.dart';
import 'package:provider/provider.dart';
import '../../sos/controllers/sos_controller.dart';

import '../../hazards/hazards_screen.dart';
import '../../map/map_screen.dart';
import '../../profile/profile_screen.dart';
import 'home_screen.dart';

class MainShell extends StatefulWidget {
  const MainShell({super.key});

  @override
  State<MainShell> createState() => _MainShellState();
}

class _MainShellState extends State<MainShell> {
  int _currentIndex = 0;

  final List<Widget> _screens = const [
    HomeScreen(),
    MapScreen(),
    HazardsScreen(),
    ProfileScreen(),
  ];

  void _onNavigationTapped(int index) {
    setState(() {
      _currentIndex = index;
    });
  }

  Future<void> _showActiveSos(BuildContext sosContext) async {
    final sosController = sosContext.read<SosController>();

    try {
      final records = await sosController.getSosRecordsForReview();

      if (!sosContext.mounted) {
        return;
      }

      await showDialog<void>(
        context: sosContext,
        builder: (dialogContext) {
          return StatefulBuilder(
            builder: (context, setDialogState) {
              Future<void> refreshRecords() async {
                final refreshed = await sosController.getSosRecordsForReview();

                if (!context.mounted) return;

                setDialogState(() {
                  records
                    ..clear()
                    ..addAll(refreshed);
                });
              }

              return AlertDialog(
                title: const Text('Active SOS Records'),
                content: SizedBox(
                  width: double.maxFinite,
                  child: records.isEmpty
                      ? const Text(
                          'No unresolved SOS records found on this device.',
                        )
                      : ConstrainedBox(
                          constraints: const BoxConstraints(maxHeight: 350),
                          child: ListView.separated(
                            shrinkWrap: true,
                            itemCount: records.length,
                            separatorBuilder: (_, __) => const Divider(),
                            itemBuilder: (context, index) {
                              final record = records[index];
                              final localId = record['local_incident_id']
                                  ?.toString();

                              return ListTile(
                                leading: const Icon(
                                  Icons.warning_amber_rounded,
                                  color: Colors.orange,
                                ),
                                title: Text(
                                  'Severity: ${record['severity'] ?? 'Unknown'}',
                                ),
                                subtitle: Text(
                                  'Server: ${record['server_status'] ?? 'unknown'}\n'
                                  'Sync: ${record['sync_status'] ?? 'unknown'}\n'
                                  'SMS: ${record['sms_status'] ?? 'not_attempted'}\n'
                                  'Time: ${record['timestamp'] ?? 'Unknown'}',
                                ),
                                isThreeLine: true,
                                trailing: localId == null || localId.isEmpty
                                    ? null
                                    : Row(
                                        mainAxisSize: MainAxisSize.min,
                                        children: [
                                          if (record['sync_status'] != 'synced')
                                            IconButton(
                                              tooltip: 'Sync with server',
                                              icon: const Icon(
                                                Icons.cloud_upload_outlined,
                                              ),
                                              onPressed: () async {
                                                try {
                                                  await sosController.syncSos(
                                                    localId,
                                                  );
                                                  await refreshRecords();

                                                  if (sosContext.mounted) {
                                                    ScaffoldMessenger.of(
                                                      sosContext,
                                                    ).showSnackBar(
                                                      const SnackBar(
                                                        content: Text(
                                                          'SOS synchronization completed.',
                                                        ),
                                                      ),
                                                    );
                                                  }
                                                } catch (error) {
                                                  if (sosContext.mounted) {
                                                    ScaffoldMessenger.of(
                                                      sosContext,
                                                    ).showSnackBar(
                                                      SnackBar(
                                                        content: Text(
                                                          'Sync failed; the record remains pending. '
                                                          'Details: $error',
                                                        ),
                                                      ),
                                                    );
                                                  }
                                                }
                                              },
                                            ),
                                          if (record['emergency_status'] !=
                                              'RESOLVED')
                                            IconButton(
                                              tooltip:
                                                  'Mark resolved on this device',
                                              icon: const Icon(
                                                Icons.check_circle_outline,
                                              ),
                                              onPressed: () async {
                                                final confirmed = await showDialog<bool>(
                                                  context: context,
                                                  builder: (confirmContext) {
                                                    return AlertDialog(
                                                      title: const Text(
                                                        'Mark SOS resolved?',
                                                      ),
                                                      content: const Text(
                                                        'This saves the resolution on this device. '
                                                        'The SOS must be synchronized separately '
                                                        'for the server to receive it.',
                                                      ),
                                                      actions: [
                                                        TextButton(
                                                          onPressed: () {
                                                            Navigator.of(
                                                              confirmContext,
                                                            ).pop(false);
                                                          },
                                                          child: const Text(
                                                            'Cancel',
                                                          ),
                                                        ),
                                                        FilledButton(
                                                          onPressed: () {
                                                            Navigator.of(
                                                              confirmContext,
                                                            ).pop(true);
                                                          },
                                                          child: const Text(
                                                            'Mark Resolved',
                                                          ),
                                                        ),
                                                      ],
                                                    );
                                                  },
                                                );

                                                if (confirmed != true ||
                                                    !context.mounted) {
                                                  return;
                                                }

                                                try {
                                                  await sosController
                                                      .resolveSos(localId);
                                                  await refreshRecords();

                                                  if (sosContext.mounted) {
                                                    ScaffoldMessenger.of(
                                                      sosContext,
                                                    ).showSnackBar(
                                                      const SnackBar(
                                                        content: Text(
                                                          'Resolution saved on this device. '
                                                          'Sync it when ready.',
                                                        ),
                                                      ),
                                                    );
                                                  }
                                                } catch (error) {
                                                  if (sosContext.mounted) {
                                                    ScaffoldMessenger.of(
                                                      sosContext,
                                                    ).showSnackBar(
                                                      SnackBar(
                                                        content: Text(
                                                          'Could not resolve SOS: $error',
                                                        ),
                                                      ),
                                                    );
                                                  }
                                                }
                                              },
                                            ),
                                        ],
                                      ),
                              );
                            },
                          ),
                        ),
                ),
                actions: [
                  TextButton(
                    onPressed: () {
                      Navigator.of(dialogContext).pop();
                    },
                    child: const Text('Close'),
                  ),
                ],
              );
            },
          );
        },
      );
    } catch (error) {
      if (!sosContext.mounted) {
        return;
      }

      ScaffoldMessenger.of(sosContext).showSnackBar(
        SnackBar(content: Text('Could not load SOS records: $error')),
      );
    }
  }

  Future<void> _onSosPressed(BuildContext sosContext) async {
    final confirmed = await showDialog<bool>(
      context: sosContext,
      builder: (context) {
        return AlertDialog(
          title: const Text('Send SOS?'),
          content: const Text(
            'This will send an emergency alert with your current location '
            'to the MoDoNER command center.',
          ),
          actions: [
            TextButton(
              onPressed: () => Navigator.of(context).pop(false),
              child: const Text('Cancel'),
            ),
            FilledButton(
              onPressed: () => Navigator.of(context).pop(true),
              child: const Text('SEND SOS'),
            ),
          ],
        );
      },
    );

    if (!sosContext.mounted || confirmed != true) {
      return;
    }

    final sosController = sosContext.read<SosController>();

    await sosController.triggerSos();

    if (!sosContext.mounted) {
      return;
    }

    if (sosController.status == SosStatus.success) {
      ScaffoldMessenger.of(sosContext).showSnackBar(
        const SnackBar(content: Text('SOS accepted by the server.')),
      );
    } else if (sosController.status == SosStatus.queued) {
      final localIncidentId = sosController.lastLocalIncidentId;

      if (localIncidentId == null || localIncidentId.isEmpty) {
        ScaffoldMessenger.of(sosContext).showSnackBar(
          const SnackBar(
            content: Text(
              'SOS could not be confirmed. Check your saved SOS records.',
            ),
          ),
        );
        return;
      }

      try {
        await sosController.openSmsFallbackDraft(
          localIncidentId: localIncidentId,
        );

        if (!sosContext.mounted) {
          return;
        }

        ScaffoldMessenger.of(sosContext).showSnackBar(
          const SnackBar(
            content: Text(
              'SMS draft opened for 112. Review the message and tap Send '
              'in your messaging app. Sending and delivery are not confirmed.',
            ),
            duration: Duration(seconds: 6),
          ),
        );
      } catch (error) {
        if (!sosContext.mounted) {
          return;
        }

        ScaffoldMessenger.of(sosContext).showSnackBar(
          SnackBar(
            content: Text(
              'Could not open the SMS draft. Your SOS remains saved locally. '
              'Details: $error',
            ),
          ),
        );
      }
    } else if (sosController.status == SosStatus.error) {
      ScaffoldMessenger.of(sosContext).showSnackBar(
        SnackBar(
          content: Text(sosController.errorMessage ?? 'Failed to trigger SOS.'),
        ),
      );
    }
  }

  @override
  Widget build(BuildContext context) {
    return ChangeNotifierProvider(
      create: (_) => SosController(),
      child: Builder(
        builder: (context) {
          return Scaffold(
            appBar: AppBar(
              title: const Text('MoDoNER Tourist Safety'),
              actions: [
                IconButton(
                  tooltip: 'Review active SOS records',
                  icon: const Icon(Icons.list_alt),
                  onPressed: () => _showActiveSos(context),
                ),
              ],
            ),

            body: _screens[_currentIndex],

            floatingActionButton: FloatingActionButton.extended(
              onPressed: () => _onSosPressed(context),
              icon: const Icon(Icons.warning_amber_rounded),
              label: const Text('SOS'),
            ),

            floatingActionButtonLocation: FloatingActionButtonLocation.endFloat,

            bottomNavigationBar: NavigationBar(
              selectedIndex: _currentIndex,
              onDestinationSelected: _onNavigationTapped,
              destinations: const [
                NavigationDestination(
                  icon: Icon(Icons.home_outlined),
                  selectedIcon: Icon(Icons.home),
                  label: 'Home',
                ),
                NavigationDestination(
                  icon: Icon(Icons.map_outlined),
                  selectedIcon: Icon(Icons.map),
                  label: 'Map',
                ),
                NavigationDestination(
                  icon: Icon(Icons.warning_amber_outlined),
                  selectedIcon: Icon(Icons.warning_amber),
                  label: 'Hazards',
                ),
                NavigationDestination(
                  icon: Icon(Icons.person_outline),
                  selectedIcon: Icon(Icons.person),
                  label: 'Profile',
                ),
              ],
            ),
          );
        },
      ),
    );
  }
}
