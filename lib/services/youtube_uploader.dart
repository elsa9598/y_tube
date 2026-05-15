import 'dart:async';
import 'dart:convert';
import 'dart:io';
import 'package:http/http.dart' as http;
import '../secrets.dart';
import 'project_state.dart';

/// 유튜브 실제 업로드 (Phase 3).
///
/// [secrets.dart]의 refresh token으로 OAuth 동의 화면 없이 access token 갱신
/// → YouTube Data API v3 resumable upload.
///
/// 의존성: http 만 (googleapis 불필요). 청크 PUT으로 진행률 추적.
class YouTubeUploader {
  static const _resumableEndpoint =
      'https://www.googleapis.com/upload/youtube/v3/videos'
      '?uploadType=resumable&part=snippet,status';
  static const _chunkSize = 8 * 1024 * 1024; // 8MB

  static Future<String?> validate(ProjectState s) async {
    if (s.renderedMp4Path == null) return 'MP4가 아직 렌더링되지 않았습니다.';
    if (!File(s.renderedMp4Path!).existsSync()) return '렌더된 MP4 파일이 없습니다.';
    if (s.videoTitle.trim().isEmpty) return '동영상 제목을 입력하세요.';
    if (s.videoTitle.length > 100) return '제목은 100자 이내.';
    if (s.videoDescription.length > 5000) return '설명은 5000자 이내.';
    return null;
  }

  /// refresh token → access token.
  static Future<String> _accessToken() async {
    final resp = await http.post(
      Uri.parse(Secrets.tokenEndpoint),
      body: {
        'client_id': Secrets.googleClientId,
        'client_secret': Secrets.googleClientSecret,
        'refresh_token': Secrets.googleRefreshToken,
        'grant_type': 'refresh_token',
      },
    );
    if (resp.statusCode != 200) {
      throw StateError('토큰 갱신 실패 (HTTP ${resp.statusCode}): ${resp.body}');
    }
    final token = (jsonDecode(resp.body) as Map)['access_token'] as String?;
    if (token == null) throw StateError('access_token 없음: ${resp.body}');
    return token;
  }

  /// 업로드 실행. 성공 시 영상 watch URL 반환.
  static Future<String> upload(
    ProjectState s, {
    void Function(double progress, String status)? onProgress,
  }) async {
    final err = await validate(s);
    if (err != null) throw StateError(err);

    onProgress?.call(2, '🔐 Google 계정 인증 중...');
    final token = await _accessToken();

    final file = File(s.renderedMp4Path!);
    final total = await file.length();

    /* 1. resumable 세션 시작 — 메타데이터 전송 */
    onProgress?.call(5, '☁️ 업로드 세션 생성 중...');
    final meta = {
      'snippet': {
        'title': s.videoTitle,
        'description': s.videoDescription,
        'tags': s.tags,
        'categoryId': '10', // Music
      },
      'status': {
        'privacyStatus': s.visibility, // public / unlisted / private
        'selfDeclaredMadeForKids': false,
      },
    };
    final init = await http.post(
      Uri.parse(_resumableEndpoint),
      headers: {
        'Authorization': 'Bearer $token',
        'Content-Type': 'application/json; charset=UTF-8',
        'X-Upload-Content-Type': 'video/mp4',
        'X-Upload-Content-Length': '$total',
      },
      body: jsonEncode(meta),
    );
    if (init.statusCode != 200) {
      throw StateError('세션 생성 실패 (HTTP ${init.statusCode}): ${init.body}');
    }
    final uploadUrl = init.headers['location'];
    if (uploadUrl == null) {
      throw StateError('업로드 URL(Location 헤더) 없음');
    }

    /* 2. 청크 PUT — Content-Range로 resumable */
    final raf = await file.open();
    int sent = 0;
    try {
      while (sent < total) {
        final end = (sent + _chunkSize < total) ? sent + _chunkSize : total;
        final bytes = await raf.read(end - sent);
        final resp = await http.put(
          Uri.parse(uploadUrl),
          headers: {
            'Authorization': 'Bearer $token',
            'Content-Type': 'video/mp4',
            'Content-Length': '${bytes.length}',
            'Content-Range': 'bytes $sent-${end - 1}/$total',
          },
          body: bytes,
        );
        sent = end;
        final pct = (sent / total * 95).clamp(5, 100).toDouble();
        onProgress?.call(pct, '⬆️ 업로드 ${(sent / total * 100).toStringAsFixed(0)}%');

        if (resp.statusCode == 200 || resp.statusCode == 201) {
          final id = (jsonDecode(resp.body) as Map)['id'] as String?;
          onProgress?.call(100, '✅ 업로드 완료');
          return id != null
              ? 'https://youtu.be/$id'
              : '업로드 완료 (ID 미확인)';
        }
        if (resp.statusCode == 308) {
          /* Resume Incomplete — 다음 청크 계속 */
          continue;
        }
        throw StateError('업로드 실패 (HTTP ${resp.statusCode}): ${resp.body}');
      }
    } finally {
      await raf.close();
    }
    throw StateError('업로드가 완료 응답 없이 종료됨');
  }
}
