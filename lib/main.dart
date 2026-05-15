import 'package:flutter/material.dart';
import 'package:provider/provider.dart';
import 'theme.dart';
import 'services/project_state.dart';
import 'widgets/nav_shell.dart';

void main() {
  runApp(const YTubeApp());
}

class YTubeApp extends StatelessWidget {
  const YTubeApp({super.key});

  @override
  Widget build(BuildContext context) {
    return ChangeNotifierProvider(
      create: (_) => ProjectState(),
      child: MaterialApp(
        title: '오둥이 하루',
        debugShowCheckedModeBanner: false,
        theme: appTheme,
        home: const NavShell(),
      ),
    );
  }
}
