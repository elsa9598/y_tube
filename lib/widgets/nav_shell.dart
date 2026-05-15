import 'package:flutter/material.dart';
import '../screens/home_screen.dart';
import '../screens/render_screen.dart';
import '../screens/upload_screen.dart';
import '../theme.dart';

/// 3개 페이지 + 바텀 네비 쉘.
/// 사장님 요청: 바텀 메뉴 3개는 동일 링크 (홈/렌더링/업로드 페이지로 일관).
class NavShell extends StatefulWidget {
  const NavShell({super.key});

  @override
  State<NavShell> createState() => _NavShellState();

  /// 정적 점프 헬퍼 — 다른 화면에서 호출.
  static void jumpTo(BuildContext context, int index) {
    final state = context.findAncestorStateOfType<_NavShellState>();
    state?.go(index);
  }
}

class _NavShellState extends State<NavShell> {
  int _index = 0;
  final _screens = const [HomeScreen(), RenderScreen(), UploadScreen()];

  void go(int i) => setState(() => _index = i);

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      body: SafeArea(child: _screens[_index]),
      bottomNavigationBar: Container(
        decoration: BoxDecoration(
          color: AppColors.surface,
          border: Border(
            top: BorderSide(color: AppColors.stroke, width: 0.6),
          ),
        ),
        child: SafeArea(
          top: false,
          child: NavigationBar(
            backgroundColor: Colors.transparent,
            elevation: 0,
            indicatorColor: AppColors.accent.withOpacity(0.12),
            selectedIndex: _index,
            onDestinationSelected: go,
            destinations: const [
              NavigationDestination(
                icon: Icon(Icons.home_outlined, color: AppColors.textDim),
                selectedIcon: Icon(Icons.home, color: AppColors.accent),
                label: '홈',
              ),
              NavigationDestination(
                icon: Icon(Icons.movie_creation_outlined, color: AppColors.textDim),
                selectedIcon: Icon(Icons.movie_creation, color: AppColors.accent),
                label: '렌더링',
              ),
              NavigationDestination(
                icon: Icon(Icons.cloud_upload_outlined, color: AppColors.textDim),
                selectedIcon: Icon(Icons.cloud_upload, color: AppColors.accent),
                label: '업로드',
              ),
            ],
          ),
        ),
      ),
    );
  }
}
