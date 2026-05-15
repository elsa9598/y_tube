import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';

import 'package:y_tube/main.dart';

void main() {
  testWidgets('YTubeApp 기동 — 홈 화면 렌더', (WidgetTester tester) async {
    await tester.pumpWidget(const YTubeApp());
    await tester.pumpAndSettle();
    expect(find.byType(MaterialApp), findsOneWidget);
  });
}
