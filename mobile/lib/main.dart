import 'package:flutter/material.dart';
import 'package:provider/provider.dart';

import 'features/auth/controllers/auth_controller.dart';
import 'features/auth/screens/login_screen.dart';
import 'features/auth/screens/register_screen.dart';
import 'features/home/screens/main_shell.dart';

void main() {
  runApp(
    ChangeNotifierProvider(
      create: (_) => AuthController(),
      child: const MoDoNERApp(),
    ),
  );
}

class MoDoNERApp extends StatelessWidget {
  const MoDoNERApp({super.key});

  @override
  Widget build(BuildContext context) {
    return MaterialApp(
      title: 'MoDoNER Tourist Safety Grid',
      debugShowCheckedModeBanner: false,
      theme: ThemeData(
        colorScheme: ColorScheme.fromSeed(seedColor: Colors.indigo),
        useMaterial3: true,
      ),
      home: const StartupScreen(),
    );
  }
}

class StartupScreen extends StatefulWidget {
  const StartupScreen({super.key});

  @override
  State<StartupScreen> createState() => _StartupScreenState();
}

class _StartupScreenState extends State<StartupScreen> {
  @override
  void initState() {
    super.initState();

    WidgetsBinding.instance.addPostFrameCallback((_) {
      context.read<AuthController>().restoreSession();
    });
  }

  @override
  Widget build(BuildContext context) {
    final authController = context.watch<AuthController>();

    if (authController.status == AuthStatus.loading) {
      return const Scaffold(body: Center(child: CircularProgressIndicator()));
    }

    if (authController.isAuthenticated) {
      return const MainShell();
    }

    return LoginScreen(
      onRegisterPressed: () {
        Navigator.of(
          context,
        ).push(MaterialPageRoute(builder: (_) => const RegisterScreen()));
      },
    );
  }
}
