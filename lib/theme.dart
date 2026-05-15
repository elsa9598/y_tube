import 'package:flutter/material.dart';

/// 스크린샷 기반 다크 테마.
/// 핵심 컬러: 강한 핑크/레드 강조, 그라데이션 카드, 깊은 검정 배경.
class AppColors {
  static const bg = Color(0xFF0A0B0E);
  static const surface = Color(0xFF14161B);
  static const surfaceAlt = Color(0xFF1B1E25);
  static const stroke = Color(0xFF252932);
  static const accent = Color(0xFFFB6357);      // 1페이지 빨간 CTA
  static const accentSoft = Color(0xFFFFB4AC);  // 가사 강조
  static const blue = Color(0xFF3B82F6);        // 2페이지 프로그래스
  static const textPrimary = Color(0xFFF2F4F7);
  static const textDim = Color(0xFF8A95A3);
  static const textFaint = Color(0xFF5C6473);
}

final ThemeData appTheme = ThemeData(
  useMaterial3: true,
  brightness: Brightness.dark,
  scaffoldBackgroundColor: AppColors.bg,
  colorScheme: ColorScheme.fromSeed(
    seedColor: AppColors.accent,
    brightness: Brightness.dark,
    surface: AppColors.surface,
  ).copyWith(
    primary: AppColors.accent,
    secondary: AppColors.blue,
  ),
  textTheme: const TextTheme(
    headlineLarge: TextStyle(
      fontSize: 36, fontWeight: FontWeight.w800,
      color: AppColors.textPrimary, letterSpacing: -0.5,
    ),
    headlineMedium: TextStyle(
      fontSize: 24, fontWeight: FontWeight.w700,
      color: AppColors.textPrimary, letterSpacing: -0.3,
    ),
    titleLarge: TextStyle(
      fontSize: 18, fontWeight: FontWeight.w600,
      color: AppColors.textPrimary,
    ),
    titleMedium: TextStyle(
      fontSize: 15, fontWeight: FontWeight.w600,
      color: AppColors.textPrimary,
    ),
    bodyLarge: TextStyle(
      fontSize: 14, color: AppColors.textPrimary, height: 1.5,
    ),
    bodyMedium: TextStyle(
      fontSize: 13, color: AppColors.textDim, height: 1.5,
    ),
    labelSmall: TextStyle(
      fontSize: 10.5, color: AppColors.textDim,
      letterSpacing: 1.5, fontWeight: FontWeight.w600,
    ),
  ),
  appBarTheme: const AppBarTheme(
    backgroundColor: AppColors.bg,
    elevation: 0,
    centerTitle: false,
    iconTheme: IconThemeData(color: AppColors.textPrimary),
    titleTextStyle: TextStyle(
      fontSize: 17, fontWeight: FontWeight.w700,
      color: AppColors.textPrimary,
    ),
  ),
  cardTheme: CardThemeData(
    color: AppColors.surface,
    elevation: 0,
    shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(20)),
  ),
  elevatedButtonTheme: ElevatedButtonThemeData(
    style: ElevatedButton.styleFrom(
      backgroundColor: AppColors.accent,
      foregroundColor: Colors.white,
      padding: const EdgeInsets.symmetric(vertical: 18, horizontal: 32),
      textStyle: const TextStyle(fontSize: 16, fontWeight: FontWeight.w700),
      shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(14)),
    ),
  ),
);
