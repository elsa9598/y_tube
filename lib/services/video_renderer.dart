import 'dart:async';
import 'dart:convert';
import 'dart:io';
import 'package:http/http.dart' as http;
import 'package:path/path.dart' as p;
import 'package:path_provider/path_provider.dart';
import '../config.dart';
import 'project_state.dart';

/// 16:9 MP4 렌더링 — 사장님 PC의 Remotion 서버에 위임.
///
/// 흐름:
///   1. POST /render  (multipart: mp4 + json)        → jobId
///   2. GET  /status/:id  폴링 → onProgress(0~100)
///   3. GET  /download/:id → 앱 문서 디렉터리에 MP4 저장 → 경로 반환
///
/// 서버 주소는 [AppConfig.serverBaseUrl]. 폰과 PC가 같은 wifi 여야 함.
class VideoRenderer {
  static Future<String> render(
    ProjectState state, {
    void Function(double progress, String status)? onProgress,
    Duration totalDurationHint = const Duration(minutes: 4),
  }) async {
    if (!state.hasAllInputs) {
      throw StateError('mp4와 JSON 두 파일이 모두 필요합니다.');
    }
    final base = AppConfig.serverBaseUrl;

    /* 1. 업로드 */
    onProgress?.call(0, '서버에 업로드 중...');
    final jobId = await _submit(base, state.mp4Path!, state.jsonPath!);

    /* 2. 상태 폴링 */
    final deadline = DateTime.now().add(AppConfig.renderTimeout);
    while (true) {
      if (DateTime.now().isAfter(deadline)) {
        throw TimeoutException('렌더 시간 초과 (${AppConfig.renderTimeout.inMinutes}분)');
      }
      await Future.delayed(AppConfig.pollInterval);
      final st = await _status(base, jobId);
      final state0 = st['state'] as String? ?? 'unknown';
      final progress = (st['progress'] as num?)?.toDouble() ?? 0;
      final message = st['message'] as String? ?? state0;
      onProgress?.call(progress.clamp(0, 100).toDouble(), message);

      if (state0 == 'done') break;
      if (state0 == 'error') {
        throw StateError('서버 렌더 실패: ${st['error'] ?? message}');
      }
    }

    /* 3. 다운로드 */
    onProgress?.call(100, '결과 내려받는 중...');
    final outPath = await _download(base, jobId);
    onProgress?.call(100, '완료');
    return outPath;
  }

  static Future<String> _submit(
    String base,
    String mp4Path,
    String jsonPath,
  ) async {
    final req = http.MultipartRequest('POST', Uri.parse('$base/render'));
    req.files.add(await http.MultipartFile.fromPath('mp4', mp4Path));
    req.files.add(await http.MultipartFile.fromPath('json', jsonPath));
    final streamed = await req.send();
    final body = await streamed.stream.bytesToString();
    if (streamed.statusCode != 200) {
      throw StateError('업로드 실패 (HTTP ${streamed.statusCode}): $body');
    }
    final json = jsonDecode(body) as Map<String, dynamic>;
    final jobId = json['jobId'] as String?;
    if (jobId == null) throw StateError('jobId 없음: $body');
    return jobId;
  }

  static Future<Map<String, dynamic>> _status(String base, String jobId) async {
    final resp = await http.get(Uri.parse('$base/status/$jobId'));
    if (resp.statusCode != 200) {
      throw StateError('status 실패 (HTTP ${resp.statusCode})');
    }
    return jsonDecode(resp.body) as Map<String, dynamic>;
  }

  static Future<String> _download(String base, String jobId) async {
    final resp = await http.get(Uri.parse('$base/download/$jobId'));
    if (resp.statusCode != 200) {
      throw StateError('다운로드 실패 (HTTP ${resp.statusCode})');
    }
    final dir = await getApplicationDocumentsDirectory();
    final outDir = Directory(p.join(dir.path, 'renders'));
    if (!outDir.existsSync()) outDir.createSync(recursive: true);
    final ts = DateTime.now()
        .toIso8601String()
        .replaceAll(':', '-')
        .substring(0, 19);
    final outPath = p.join(outDir.path, 'odung_$ts.mp4');
    await File(outPath).writeAsBytes(resp.bodyBytes);
    return outPath;
  }
}
